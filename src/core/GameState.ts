/**
 * GameState - MVP: Central state manager
 * Holds character, lanes, and turn progression
 */

import { Character } from '@entities/Character'
import { Lane, LANE_DISTANCE_COUNT } from '@entities/Lane'
import { Card, CardType } from '@entities/Card'
import { RunEnhancements, makeDefaultEnhancements } from '@core/RunEnhancements'
import type { BossGimmickManager } from '@systems/BossGimmickManager'

export class GameState {
  character: Character
  lanes: Lane[]
  currentTurn: number
  isGameOver: boolean
  gameOverReason: string
  /** 강화팩으로 획득한 트리플/레시피 보너스 누적값. HandSystem이 효과 적용 시 참조한다. */
  enhancements: RunEnhancements
  /** 보스 전투 활성 여부. HandSystem이 필드 수정 레시피를 차단하는 데 사용한다. */
  bossBattleActive = false
  /** 보스 타일 위 칸 기믹 격자. BossEventController가 보스 등장/격파에 맞춰 꽂고 뺀다.
   *  손패 피해가 보스에 닿을 때 HandSystem이 여기서 칸 배율을 받아 간다(격자 없으면 null). */
  bossGimmicks: BossGimmickManager | null = null
  /** 한 번이라도 필드에 등장한 적/특수 카드의 이름 집합. 도감 적 탭의 발견 여부를 결정한다. */
  encounteredEnemyNames = new Set<string>()
  /** 필드에 등장한 함정/보물/꽃 카드 이름 집합. 도감 탭의 미식별 마스킹에 사용한다. */
  encounteredCardNames = new Set<string>()
  /** 상점/제단이 열린 적 있는 팩 종류 집합. 도감 팩 탭의 미식별 마스킹에 사용한다. */
  encounteredPackKinds = new Set<string>()
  /** 이번 런 정산용 카운터 — 플레이어가 처치한 적/처리한 함정/개봉한 보물 수. reset()에서 0으로. */
  runDefeatedEnemies = 0
  runClearedTraps = 0
  runOpenedTreasures = 0
  /** 이번 런 수확한 꽃 수 — 여정의 유산(PlayerLegacy) 집계 축. reset()에서 0으로. */
  runFlowersHarvested = 0
  /** 이번 런 손패 사용 횟수(defId별). 서고 일지의 "활약한 손패" 산출에 쓴다. reset()에서 비운다. */
  runCardUsageCount: Record<string, number> = {}
  /** 이번 런 적이 준 누적 피해(적 표시 이름별). 서고 일지의 "위험했던 적" 산출에 쓴다. reset()에서 비운다. */
  runEnemyDamageByName: Record<string, number> = {}
  /** 해금팩으로 해금된 레시피 ID 집합. runLocked 레시피는 여기 있을 때만 발동한다. */
  unlockedRecipeIds = new Set<string>()
  /** 카드가 필드에서 실제 제거될 때(처치/클리어) 1회 발동하는 훅. 처치 맥락(카드·레인)이 필요한
   *  유물(밀랍 조각=굳은 카드 처리, 확산=불씨 처치 인접 반응)이 여기에 붙는다. reset과 무관하게 유지. */
  onCardRemoved?: (card: Card, laneIndices: number[]) => void
  /**
   * 함정 하나가 **처리됐다**는 신호(밟아서 터뜨렸든 손패로 지웠든). 필드의 함정 카드와
   * 보스 칸의 함정 부가물이 같은 이 훅을 지난다 — 함정 처리에 반응하는 유물(함정 수집 등)을
   * 두 경로에 따로 적지 않기 위해서다. 새 함정 반응 유물은 여기 붙이면 양쪽 다 걸린다.
   */
  onTrapResolved?: (trapKind?: string) => void

  constructor() {
    this.character = new Character()
    this.lanes = [new Lane('lane-0', 0), new Lane('lane-1', 1), new Lane('lane-2', 2)]
    this.currentTurn = 0
    this.isGameOver = false
    this.gameOverReason = ''
    this.enhancements = makeDefaultEnhancements()
  }

  getCharacter(): Character {
    return this.character
  }

  getLanes(): Lane[] {
    return this.lanes
  }

  getLane(index: number): Lane | null {
    if (index < 0 || index >= this.lanes.length) return null
    return this.lanes[index]
  }

  getCurrentTurn(): number {
    return this.currentTurn
  }

  /** Dev-only helper: jump directly to a specific turn for debug commands. */
  setCurrentTurnForDebug(turn: number): void {
    // Clamp to a safe integer range so malformed command input can not poison state.
    const safeTurn = Math.max(0, Math.floor(turn))
    this.currentTurn = safeTurn
    // Character.turn mirrors GameState.currentTurn in normal flow (nextTurn),
    // so keep both counters aligned when a debug jump bypasses nextTurn calls.
    this.character.turn = safeTurn
  }

  nextTurn(): void {
    this.currentTurn++
    this.character.nextTurn()
    this.tickFieldStatuses()
  }

  /** Tick per-card field statuses once at the turn boundary. */
  private tickFieldStatuses(): void {
    const seen = new Set<Card>()
    for (const lane of this.lanes) {
      for (let d = 0; d < LANE_DISTANCE_COUNT; d++) {
        const card = lane.getCardAtDistance(d)
        if (!card || seen.has(card)) continue
        seen.add(card)
        card.tickFrozen()
      }
    }
  }

  /**
   * Lanes whose slot at the given row holds the same Card instance.
   * (Adjacent same-type cards merge by sharing one Card object.)
   */
  getGroupLanes(laneIndex: number, distance: number): number[] {
    const card = this.lanes[laneIndex]?.getCardAtDistance(distance)
    if (!card) return []
    const lanes: number[] = []
    for (let i = 0; i < this.lanes.length; i++) {
      if (this.lanes[i].getCardAtDistance(distance) === card) {
        lanes.push(i)
      }
    }
    return lanes
  }

  /**
   * Walk a row left-to-right; whenever two adjacent slots hold cards of the
   * same merge-compatible type, fold the right card into the left and
   * replace the right slot with the (now bigger) left Card. Result: a
   * contiguous run of same-type
   * cards becomes a single Card occupying multiple lane slots.
   * Only groups the active row (distance 0); preview rows stay ungrouped.
   */
  regroupRow(distance: number): void {
    if (distance < 0 || distance >= LANE_DISTANCE_COUNT) return
    // Only regroup the active row (distance 0)
    if (distance !== 0) return

    let i = 0
    while (i < this.lanes.length - 1) {
      const left = this.lanes[i].getCardAtDistance(distance)
      const right = this.lanes[i + 1].getCardAtDistance(distance)

      if (!left || !right || left === right) {
        i++
        continue
      }
      if (left.canMergeWith(right)) {
        // 현재 층을 넘겨 30/60/90층 보스 이후 합체 보너스 배율을 카드 모델 한 곳에서 계산한다.
        left.merge(right, this.currentTurn)
        // Update ALL lanes still referencing 'right' to prevent a second
        // spurious merge when 'right' is already a multi-lane card (gc ≥ 2).
        for (let j = i + 1; j < this.lanes.length; j++) {
          if (this.lanes[j].getCardAtDistance(distance) === right) {
            this.lanes[j].setCardAtDistance(distance, left)
          }
        }
      }
      i++
    }
  }

  regroupAllRows(): void {
    // Only regroup the active row (distance 0).
    this.regroupRow(0)
  }

  /**
   * Drop cards down to fill holes and refill empty top slots with the caller.
   * Returns true when at least one card changed row, which the UI can animate.
   */
  compactLanes(): boolean {
    let changed = false
    for (const lane of this.lanes) {
      // Repeatedly shift down until no holes remain below a card.
      let safety = LANE_DISTANCE_COUNT
      while (safety-- > 0) {
        let didShift = false
        for (let d = 0; d < LANE_DISTANCE_COUNT - 1; d++) {
          if (!lane.getCardAtDistance(d) && lane.getCardAtDistance(d + 1)) {
            lane.setCardAtDistance(d, lane.getCardAtDistance(d + 1))
            lane.setCardAtDistance(d + 1, null)
            didShift = true
            changed = true
          }
        }
        if (!didShift) break
      }
    }
    return changed
  }

  /**
   * Compact and refill the full rail until every lane has a continuous stack.
   *
   * Large hand/combo effects can remove an entire row or even the whole field.
   * A single "compact once, refill top once" pass leaves those lanes half-empty
   * because the newly spawned top card still needs to fall again. This rail
   * maintenance rule intentionally keeps drawing one fresh card at a time and
   * lets gravity settle after each draw so no random values need to be pre-picked.
   */
  compactAndRefillRails(spawnCard: (laneIndex: number) => Card): boolean {
    let changed = false
    let safety = LANE_DISTANCE_COUNT * 3 + 3

    while (safety-- > 0) {
      const moved = this.compactLanes()
      let filled = false
      const topDistance = LANE_DISTANCE_COUNT - 1

      for (let laneIndex = 0; laneIndex < this.lanes.length; laneIndex++) {
        const lane = this.lanes[laneIndex]
        if (lane.getCardAtDistance(topDistance)) continue
        lane.setCardAtDistance(topDistance, spawnCard(laneIndex))
        filled = true
      }

      changed = changed || moved || filled
      if (!moved && !filled) break
    }

    return changed
  }

  /** Remove every card reference from the full field. One-shot relics use
   *  this after revival so the next turn starts from a clean rail. */
  clearField(): void {
    for (const lane of this.lanes) lane.clear()
  }

  /**
   * Remove every slot reference of a given Card from a row, returning the
   * lane indices that were cleared.
   */
  removeCardFromRow(card: Card, distance: number): number[] {
    const cleared: number[] = []
    for (let i = 0; i < this.lanes.length; i++) {
      if (this.lanes[i].getCardAtDistance(distance) === card) {
        this.lanes[i].setCardAtDistance(distance, null)
        cleared.push(i)
      }
    }
    // 처치 맥락 훅 — 제거된 카드 1장당 1회(굳음 상태·레인 정보는 아직 card에 남아 있다).
    if (cleared.length > 0) this.onCardRemoved?.(card, cleared)
    return cleared
  }

  /** 폭탄 유물용: 지정 칸(레인·거리)의 적/보스에게 피해를 준다. 처치 시 제거하고 hit 정보를 반환. */
  damageEnemyAtCell(laneIndex: number, distance: number, amount: number): { cardId: string; defeated: boolean } | null {
    const lane = this.lanes[laneIndex]
    if (!lane || distance < 0 || distance >= LANE_DISTANCE_COUNT) return null
    const card = lane.getCardAtDistance(distance)
    if (!card || (card.type !== CardType.ENEMY && card.type !== CardType.BOSS)) return null
    card.takeDamage(amount)
    const defeated = card.getHealth() <= 0
    if (defeated && card.type !== CardType.BOSS) this.removeCardFromRow(card, distance)
    return { cardId: card.id, defeated }
  }

  /** 확산 유물용: 지정 레인에서 앞쪽부터 첫 함정 카드 1장을 찾아 제거하고 반환한다(없으면 null). */
  removeFirstTrapInLane(laneIndex: number): Card | null {
    const lane = this.lanes[laneIndex]
    if (!lane) return null
    for (let d = 0; d < LANE_DISTANCE_COUNT; d++) {
      const c = lane.getCardAtDistance(d)
      if (c && c.type === CardType.TRAP) {
        this.removeCardFromRow(c, d)
        return c
      }
    }
    return null
  }

  /**
   * Within one lane, drop the bottom slot and shift everything down one step.
   * The top slot becomes empty for the caller to fill.
   */
  collapseLane(laneIndex: number): void {
    const lane = this.lanes[laneIndex]
    if (!lane) return
    for (let d = 0; d < LANE_DISTANCE_COUNT - 1; d++) {
      lane.setCardAtDistance(d, lane.getCardAtDistance(d + 1))
    }
    lane.setCardAtDistance(LANE_DISTANCE_COUNT - 1, null)
  }

  endGame(reason: string): void {
    this.isGameOver = true
    this.gameOverReason = reason
  }

  reset(): void {
    this.character.reset()
    this.lanes.forEach((lane) => lane.clear())
    this.currentTurn = 0
    this.isGameOver = false
    this.gameOverReason = ''
    this.enhancements = makeDefaultEnhancements()
    this.bossBattleActive = false
    this.bossGimmicks = null
    this.encounteredEnemyNames = new Set()
    this.encounteredCardNames = new Set()
    this.encounteredPackKinds = new Set()
    this.unlockedRecipeIds = new Set()
    this.runDefeatedEnemies = 0
    this.runClearedTraps = 0
    this.runOpenedTreasures = 0
    this.runFlowersHarvested = 0
    this.runCardUsageCount = {}
    this.runEnemyDamageByName = {}
  }
}
