/**
 * GameState - MVP: Central state manager
 * Holds character, lanes, and turn progression
 */

import { Character } from '@entities/Character'
import { Lane, LANE_DISTANCE_COUNT } from '@entities/Lane'
import { Card, CardType } from '@entities/Card'
import { RunEnhancements, makeDefaultEnhancements } from '@core/RunEnhancements'

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
  /** 한 번이라도 필드에 등장한 적/특수 카드의 이름 집합. 도감 적 탭의 발견 여부를 결정한다. */
  encounteredEnemyNames = new Set<string>()
  /** 필드에 등장한 함정/보물/꽃 카드 이름 집합. 도감 탭의 미식별 마스킹에 사용한다. */
  encounteredCardNames = new Set<string>()
  /** 상점/제단이 열린 적 있는 팩 종류 집합. 도감 팩 탭의 미식별 마스킹에 사용한다. */
  encounteredPackKinds = new Set<string>()
  /** 해금팩으로 해금된 레시피 ID 집합. runLocked 레시피는 여기 있을 때만 발동한다. */
  unlockedRecipeIds = new Set<string>()

  /** 튜토리얼 모드에서 1→2→3 레인으로 점진 확장. 일반 런에서는 항상 false. */
  tutorialMode = false

  constructor() {
    this.character = new Character()
    this.lanes = [new Lane('lane-0', 0), new Lane('lane-1', 1), new Lane('lane-2', 2)]
    this.currentTurn = 0
    this.isGameOver = false
    this.gameOverReason = ''
    this.enhancements = makeDefaultEnhancements()
  }

  /** 튜토리얼 모드: 지정 레인 수로 시작한다(reset()도 이 수를 유지). */
  initTutorialMode(startingLaneCount: number): void {
    this.tutorialMode = true
    this.lanes = Array.from(
      { length: startingLaneCount },
      (_, i) => new Lane(`lane-${i}`, i)
    )
  }

  /** 레인을 1개 추가한다(튜토리얼 확장용). */
  addLane(): void {
    const i = this.lanes.length
    this.lanes.push(new Lane(`lane-${i}`, i))
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
        left.merge(right)
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

  /** Deal damage to one random active-row enemy. Returns the hit summary for UI. */
  damageRandomFrontEnemy(
    amount: number
  ): { cardId: string; amount: number; defeated: boolean } | null {
    const candidates: { card: Card; distance: number }[] = []
    const seen = new Set<Card>()
    for (const lane of this.lanes) {
      const card = lane.getCardAtDistance(0)
      if (!card || card.type !== CardType.ENEMY || seen.has(card)) continue
      seen.add(card)
      candidates.push({ card, distance: 0 })
    }
    if (candidates.length === 0) return null
    const pick = candidates[Math.floor(Math.random() * candidates.length)]
    pick.card.takeDamage(amount)
    const defeated = pick.card.getHealth() <= 0
    if (defeated) this.removeCardFromRow(pick.card, pick.distance)
    return { cardId: pick.card.id, amount, defeated }
  }

  /** Deal damage to a specific on-field enemy by id (품격있는 대처 유물용).
   *  Returns the hit summary, or null if the id is not an active enemy. */
  damageEnemyById(
    cardId: string,
    amount: number
  ): { cardId: string; amount: number; defeated: boolean } | null {
    for (const lane of this.lanes) {
      for (let d = 0; d < LANE_DISTANCE_COUNT; d++) {
        const card = lane.getCardAtDistance(d)
        if (!card || card.id !== cardId) continue
        if (card.type !== CardType.ENEMY) return null
        card.takeDamage(amount)
        const defeated = card.getHealth() <= 0
        if (defeated) this.removeCardFromRow(card, d)
        return { cardId: card.id, amount, defeated }
      }
    }
    return null
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
    return cleared
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
    // 튜토리얼 모드라면 레인 수를 1로 복원한다(런 재시작 시 처음부터 다시).
    if (this.tutorialMode) {
      this.lanes = [new Lane('lane-0', 0)]
    } else {
      this.lanes.forEach((lane) => lane.clear())
    }
    this.tutorialMode = false
    this.currentTurn = 0
    this.isGameOver = false
    this.gameOverReason = ''
    this.enhancements = makeDefaultEnhancements()
    this.bossBattleActive = false
    this.encounteredEnemyNames = new Set()
    this.encounteredCardNames = new Set()
    this.encounteredPackKinds = new Set()
    this.unlockedRecipeIds = new Set()
  }
}
