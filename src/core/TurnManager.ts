/**
 * TurnManager - Orchestrates a turn after the player picks a card.
 *
 * Turn order (bright/dim ember tier):
 *   1. Pre-turn refill/drop + active-row regroup (handled in index.ts)
 *   2. Player phase  (handled in index.ts via cardAction event)
 *   3. Enemy phase and treasure volatility resolve as the end-turn event beat
 *   4. Ember wanes by 1, turn end prepares the next row for cleanup
 *
 * In flickering ember tier the enemy phase fires BEFORE the player phase.
 *
 * Cards do NOT auto-advance globally any more; only holes created by resolved
 * cards are compacted so upper cards fall into empty rail cells.
 */

import { GameState } from './GameState'
import { Card, CardType, type FlowerKind } from '@entities/Card'
import { LANE_DISTANCE_COUNT } from '@entities/Lane'
import { CardSpawner } from '@systems/CardSpawner'
import { EmberSystem } from '@systems/EmberSystem'

export interface EnemyHit {
  laneIndex: number
  /** Stable card id lets grouped 2/3-lane enemies animate even when the
   *  striking lane is not the leftmost rendered DOM cell. */
  cardId: string
  cardName: string
  damage: number
}

export interface TreasureChange {
  laneIndex: number
  distance: number
  outcome: 'disappeared' | 'mimic'
  cardName: string
}

export interface BombExplosion {
  laneIndex: number
  cardName: string
  playerDamage: number
  /** DOM key for the bomb card itself — the renderer animates the still-rendered
   *  bomb cell before the next render() drops it from the rail. */
  bombCardId: string
  /** Enemy cards that took splash damage (still in the lane until next render). */
  adjacentCardIds: string[]
}

export interface SporeSpread {
  sourceLane: number
  sourceDistance: number
  infected: { laneIndex: number; distance: number }[]
}

export interface SporeCountdownTick {
  laneIndex: number
  distance: number
  turnsUntilSpread: number
}

export interface FlowerBloom {
  laneIndex: number
  distance: number
  cardId: string
  flowerName: string
  flowerKind: FlowerKind
}

export interface StarlightSweep {
  laneIndex: number
  cardId: string
}

export interface EventDoorTick {
  laneIndex: number
  cardId: string
  /** 'started' = 전방 도달해 2턴 시작(뱃지 등장), 'tick' = 감소, 'closed' = 0 경과로 닫혀 제거됨. */
  phase: 'started' | 'tick' | 'closed'
  turnsLeft: number
}

export interface FlowerGrowth {
  laneIndex: number
  distance: number
  cardId: string
  flowerName: string
  flowerKind: FlowerKind
  value: number
  /**
   * 'progress' means the flower consumed a turn without increasing its reward.
   * Marigold uses this halfway beat to foreshadow next-turn growth.
   */
  phase: 'growth' | 'progress'
}

export interface FlowerWilt {
  laneIndex: number
  distance: number
  cardId: string
  monsterCardId: string
  flowerName: string
  flowerKind: FlowerKind
}

export class TurnManager {
  gameState: GameState
  /** 보스전 전용 단계는 일반 턴 카운트에서 제외하기 위해 분리한다. */
  private turnMode: 'normal_turn' | 'boss_phase' = 'normal_turn'

  constructor(gameState: GameState) {
    this.gameState = gameState
  }

  setTurnMode(mode: 'normal_turn' | 'boss_phase'): void {
    this.turnMode = mode
  }

  isBossPhase(): boolean {
    return this.turnMode === 'boss_phase'
  }

  /**
   * Active-row enemies that are still alive strike the player.
   * Returns a per-strike log so the UI can surface what happened.
   */
  runEnemyPhase(): EnemyHit[] {
    const hits: EnemyHit[] = []
    const seen = new Set<Card>()
    const character = this.gameState.character

    for (let i = 0; i < this.gameState.lanes.length; i++) {
      const card = this.gameState.lanes[i].getCardAtDistance(0)
      if (!card || card.type !== CardType.ENEMY || card.isFrozen()) continue
      if (seen.has(card)) continue
      seen.add(card)

      // Record actual damage so the UI and death check match state.
      const damage = character.takeDamage(card.getDamage())
      hits.push({ laneIndex: i, cardId: card.id, cardName: card.name, damage })

      if (!character.isAlive()) {
        this.gameState.endGame('character_defeated')
        return hits
      }
    }

    return hits
  }

  /**
   * Per-treasure roll: 30% it vanishes, 10% it morphs into a mimic enemy,
   * and the remaining 60% keeps the treasure in place.
   * 황금 상자는 별도 규칙: 50% 사라짐, 미믹 변환 없음.
   */
  applyTreasureVolatility(spawner: CardSpawner): TreasureChange[] {
    const changes: TreasureChange[] = []
    const visited = new Set<Card>()
    const d = 0 // Only check active row

    for (let i = 0; i < this.gameState.lanes.length; i++) {
      const card = this.gameState.lanes[i].getCardAtDistance(d)
      if (
        !card ||
        card.type !== CardType.TREASURE ||
        card.treasureKind === 'starlight' ||
        card.isFrozen()
      )
        continue
      if (visited.has(card)) continue
      visited.add(card)

      const roll = Math.random()

      // 황금 상자: 50% 사라짐, 미믹 변환 없음.
      if (card.treasureKind === 'goldenChest') {
        if (roll < 0.5) {
          this.gameState.removeCardFromRow(card, d)
          changes.push({ laneIndex: i, distance: d, outcome: 'disappeared', cardName: card.name })
        }
        continue
      }

      // 개봉식: 사라질 확률 50% → 40% (생존 +10%). 미믹화 10% 고정.
      const disappearThreshold = this.gameState.character.hasRelic('opening-ceremony') ? 0.40 : 0.50
      if (roll < disappearThreshold) {
        this.gameState.removeCardFromRow(card, d)
        changes.push({
          laneIndex: i,
          distance: d,
          outcome: 'disappeared',
          cardName: card.name,
        })
      } else if (roll < disappearThreshold + 0.10) {
        const occupiedLanes = this.gameState.getGroupLanes(i, d)
        const mimic = spawner.spawnMimic(card.groupCount)
        this.gameState.removeCardFromRow(card, d)
        // Preserve the original chest width so 2/3-lane chests become matching mimics.
        for (const laneIndex of occupiedLanes) {
          this.gameState.lanes[laneIndex].setCardAtDistance(d, mimic)
        }
        changes.push({
          laneIndex: i,
          distance: d,
          outcome: 'mimic',
          cardName: card.name,
        })
      }
    }

    return changes
  }

  /** Mark every active-row bomb as lit after cleanup, giving the player one action window. */
  armFrontBombs(): number {
    let armed = 0
    const seen = new Set<Card>()
    for (let i = 0; i < this.gameState.lanes.length; i++) {
      const card = this.gameState.lanes[i].getCardAtDistance(0)
      if (!card || seen.has(card) || card.type !== CardType.TRAP || card.trapKind !== 'bomb')
        continue
      seen.add(card)
      // 굳음은 상자 변동처럼 턴 타이머를 멈춘다: 밀랍으로 굳은 폭탄은
      // 전방에 있어도 해동될 때까지 새로 점화되지 않는다.
      if (card.isFrozen()) continue
      if (!card.isBombArmed) {
        card.isBombArmed = true
        armed++
      }
    }
    return armed
  }

  /** Resolve lit bombs: player takes 5, adjacent enemy cards take 5, then bomb disappears. */
  applyBombExplosions(): BombExplosion[] {
    const explosions: BombExplosion[] = []
    const seen = new Set<Card>()
    for (let i = 0; i < this.gameState.lanes.length; i++) {
      const card = this.gameState.lanes[i].getCardAtDistance(0)
      if (!card || seen.has(card) || card.type !== CardType.TRAP || card.trapKind !== 'bomb')
        continue
      seen.add(card)
      if (!card.isBombArmed || card.isFrozen()) continue

      // 폭탄 폭발 피해 = 기본 5 + 시련 '역경' 보너스. 함정 표기와 같은 값을 쓴다.
      const bombDamage = card.effectiveTrapDamage()
      // Bomb splash hurts neighboring enemies but does not delete non-enemy cells.
      // 사망한 적은 즉시 row에서 제거해야 미믹 등 특수 적이 0HP로 잔존하지 않는다.
      const adjacentCardIds: string[] = []
      const defeatedNeighbors = new Set<Card>()
      for (const neighborLane of [i - 1, i + 1]) {
        const neighbor = this.gameState.lanes[neighborLane]?.getCardAtDistance(0)
        if (neighbor?.type === CardType.ENEMY) {
          neighbor.takeDamage(bombDamage)
          adjacentCardIds.push(neighbor.id)
          if (neighbor.getHealth() <= 0) defeatedNeighbors.add(neighbor)
        }
      }
      for (const dead of defeatedNeighbors) {
        this.gameState.removeCardFromRow(dead, 0)
      }
      const playerDamage = this.gameState.character.takeDamage(bombDamage)
      const bombCardId = card.id
      this.gameState.removeCardFromRow(card, 0)
      explosions.push({
        laneIndex: i,
        cardName: card.name,
        playerDamage,
        bombCardId,
        adjacentCardIds,
      })
      if (!this.gameState.character.isAlive()) {
        this.gameState.endGame('character_defeated')
        break
      }
    }
    return explosions
  }

  /** Snapshot unique spore cards so grouped colonies tick once per turn. */
  private collectSporeCountdownSources(): { card: Card; laneIndex: number; distance: number }[] {
    const spores: { card: Card; laneIndex: number; distance: number }[] = []
    const seen = new Set<Card>()

    for (let laneIndex = 0; laneIndex < this.gameState.lanes.length; laneIndex++) {
      for (let distance = 0; distance < LANE_DISTANCE_COUNT; distance++) {
        const card = this.gameState.lanes[laneIndex].getCardAtDistance(distance)
        if (!card || seen.has(card) || card.type !== CardType.TRAP || card.trapKind !== 'spore') {
          continue
        }
        seen.add(card)
        spores.push({ card, laneIndex, distance })
      }
    }

    return spores
  }

  /**
   * Tick spore timers only, leaving ready spores at 0 so the renderer can show
   * the warning badge before the infection/reset beat runs.
   */
  tickSporeCountdowns(): SporeCountdownTick[] {
    const ticks: SporeCountdownTick[] = []

    for (const { card, laneIndex, distance } of this.collectSporeCountdownSources()) {
      if (card.justEnteredRail) {
        // 막 3×3 레일에 들어온 포자는 이번 호출에서 2턴 표기를 보존한다.
        card.justEnteredRail = false
        continue
      }
      if (card.isFrozen()) continue

      card.sporeTurnsUntilSpread = Math.max(0, card.sporeTurnsUntilSpread - 1)
      ticks.push({ laneIndex, distance, turnsUntilSpread: card.sporeTurnsUntilSpread })
    }

    return ticks
  }

  /** Infect from spores whose countdown already reached 0, then reset them to 2. */
  spreadReadySpores(): SporeSpread[] {
    const spreads: SporeSpread[] = []

    // Countdown and infection are deliberately split: the UI renders the 0턴
    // badge between these phases, while this snapshot prevents newborn spores
    // from acting during the same spread pass.
    for (const { card, laneIndex, distance } of this.collectSporeCountdownSources()) {
      if (card.isFrozen() || card.justEnteredRail || card.sporeTurnsUntilSpread > 0) continue

      const candidates = this.collectSporeTargets(laneIndex, distance, card)
      const infected: { laneIndex: number; distance: number }[] = []
      const infectCount = Math.min(card.groupCount, candidates.length)
      for (let n = 0; n < infectCount; n++) {
        const pickIndex = Math.floor(Math.random() * candidates.length)
        const [target] = candidates.splice(pickIndex, 1)
        const spore = new Card(
          `spore-${Date.now()}-${Math.random()}`,
          CardType.TRAP,
          '감염 포자',
          'Deals 1/3/5 damage and spreads every 2 turns',
          0,
          1,
          { trapKind: 'spore' }
        )
        // 감염된 포자는 새 2턴 주기를 받으며 이번 spread snapshot에는 포함되지 않는다.
        spore.sporeTurnsUntilSpread = 2
        this.gameState.lanes[target.laneIndex].setCardAtDistance(target.distance, spore)
        infected.push(target)
      }
      card.sporeTurnsUntilSpread = 2
      if (infected.length > 0) {
        spreads.push({ sourceLane: laneIndex, sourceDistance: distance, infected })
      }
    }

    // Spread runs after the usual cleanup regroup in the game loop, so newly
    // adjacent front-row spores need one immediate regroup pass to render and
    // act as a single 2/3-lane colony before the next player input.
    if (spreads.length > 0) this.gameState.regroupAllRows()
    return spreads
  }

  /** Tick infectious spores, spread ready colonies, and reset their timer. */
  applySporeSpread(): SporeSpread[] {
    this.tickSporeCountdowns()
    return this.spreadReadySpores()
  }

  /** Orthogonal-only spore candidates; no long-range spread after all sides are infected. */
  private collectSporeTargets(
    laneIndex: number,
    distance: number,
    source: Card
  ): { laneIndex: number; distance: number }[] {
    const targets: { laneIndex: number; distance: number }[] = []
    const offsets = [
      { laneIndex: laneIndex - 1, distance },
      { laneIndex: laneIndex + 1, distance },
      { laneIndex, distance: distance - 1 },
      { laneIndex, distance: distance + 1 },
    ]
    for (const target of offsets) {
      const lane = this.gameState.lanes[target.laneIndex]
      if (!lane || target.distance < 0 || target.distance >= LANE_DISTANCE_COUNT) continue
      const existing = lane.getCardAtDistance(target.distance)
      // Infection converts an actual neighboring card; transient holes wait
      // until gravity/refill has placed a card there, avoiding phantom spores.
      if (!existing || existing === source) continue
      // Do not partially overwrite a multi-lane card; wait for a single-cell
      // neighbor so infection cannot leave stale shared-card references behind.
      if (existing && existing.groupCount > 1) continue
      if (existing?.type === CardType.TRAP && existing.trapKind === 'spore') continue
      targets.push(target)
    }
    return targets
  }

  /** Bloom every seed that has just fallen into the active row. */
  bloomFrontSeeds(spawner: CardSpawner): FlowerBloom[] {
    const blooms: FlowerBloom[] = []
    for (let laneIndex = 0; laneIndex < this.gameState.lanes.length; laneIndex++) {
      const card = this.gameState.lanes[laneIndex].getCardAtDistance(0)
      if (!card || card.type !== CardType.FLOWER || card.flowerKind !== 'seed') continue
      card.bloom(spawner.randomBloomKind())
      blooms.push({
        laneIndex,
        distance: 0,
        cardId: card.id,
        flowerName: card.name,
        flowerKind: card.flowerKind,
      })
    }
    return blooms
  }

  /** Consume every final-ascent starlight that has fallen into the active row.
   *  씨앗 발화처럼 클릭 없이 전방 도달만으로 소비된다 — 좌우 레인을 별빛으로 막고
   *  중앙만 착취하는 구도를 차단하기 위해 "전방 도달 = 즉시 수집"으로 고정한다.
   *  제거한 키 목록을 돌려주어 호출부가 런 턴 +1과 HUD 블라스트를 처리한다. */
  sweepFrontStarlights(): StarlightSweep[] {
    const swept: StarlightSweep[] = []
    for (let laneIndex = 0; laneIndex < this.gameState.lanes.length; laneIndex++) {
      const lane = this.gameState.lanes[laneIndex]
      const card = lane.getCardAtDistance(0)
      if (!card || card.type !== CardType.TREASURE || card.treasureKind !== 'starlight') continue
      lane.setCardAtDistance(0, null)
      swept.push({ laneIndex, cardId: card.id })
    }
    return swept
  }

  /** 전방(활성 행)에 도달한 이벤트 문의 닫힘 카운트다운을 진행한다.
   *  -1(대기) → 도달 즉시 2로 시작(뱃지 '슈룩' 등장), 이후 매 턴 감소, 0 아래로 가면 닫혀 제거된다.
   *  대기행(distance>0)에서는 카운트다운하지 않으므로 뱃지도 붙지 않는다. */
  tickFrontEventDoors(): EventDoorTick[] {
    const ticks: EventDoorTick[] = []
    for (let laneIndex = 0; laneIndex < this.gameState.lanes.length; laneIndex++) {
      const lane = this.gameState.lanes[laneIndex]
      const card = lane.getCardAtDistance(0)
      if (!card || card.type !== CardType.EVENT) continue
      if (card.eventTurnsUntilClose < 0) {
        card.eventTurnsUntilClose = 2
        ticks.push({ laneIndex, cardId: card.id, phase: 'started', turnsLeft: 2 })
        continue
      }
      card.eventTurnsUntilClose -= 1
      if (card.eventTurnsUntilClose < 0) {
        lane.setCardAtDistance(0, null)
        ticks.push({ laneIndex, cardId: card.id, phase: 'closed', turnsLeft: -1 })
      } else {
        ticks.push({ laneIndex, cardId: card.id, phase: 'tick', turnsLeft: card.eventTurnsUntilClose })
      }
    }
    return ticks
  }

  /** Grow bloomed flowers, then roll their escalating wilt chance into monster flowers. */
  applyFlowerGrowthAndWilt(spawner: CardSpawner): { growths: FlowerGrowth[]; wilts: FlowerWilt[] } {
    const growths: FlowerGrowth[] = []
    const wilts: FlowerWilt[] = []
    const flowersAtTurnStart: { card: Card; laneIndex: number; distance: number }[] = []
    const seen = new Set<Card>()

    // Snapshot first so a replaced monster flower cannot be processed again in
    // the same scan, and shared future groups never double-tick.
    for (let laneIndex = 0; laneIndex < this.gameState.lanes.length; laneIndex++) {
      for (let distance = 0; distance < LANE_DISTANCE_COUNT; distance++) {
        const card = this.gameState.lanes[laneIndex].getCardAtDistance(distance)
        if (
          !card ||
          seen.has(card) ||
          card.type !== CardType.FLOWER ||
          card.flowerKind === 'seed'
        ) {
          continue
        }
        seen.add(card)
        flowersAtTurnStart.push({ card, laneIndex, distance })
      }
    }

    for (const { card, laneIndex, distance } of flowersAtTurnStart) {
      if (card.isFrozen()) continue
      const grew = card.growFlowerOneTurn()
      if (grew || card.flowerKind === 'marigold') {
        // Marigold grows every other turn; on the quiet in-between turn, report
        // a low-intensity progress beat so the player sees its clock advancing.
        growths.push({
          laneIndex,
          distance,
          cardId: card.id,
          flowerName: card.name,
          flowerKind: card.flowerKind,
          value: card.flowerValue,
          phase: grew ? 'growth' : 'progress',
        })
      }
      if (Math.random() >= card.getFlowerWiltChance()) continue

      const monster = spawner.spawnMonsterFlower(card.flowerValue)
      this.gameState.lanes[laneIndex].setCardAtDistance(distance, monster)
      wilts.push({
        laneIndex,
        distance,
        cardId: card.id,
        monsterCardId: monster.id,
        flowerName: card.name,
        flowerKind: card.flowerKind,
      })
    }

    return { growths, wilts }
  }

  /**
   * Three merged traps are no longer an automatic game-over condition. The
   * lethal-level damage is applied only when the player actually chooses them.
   */
  checkHazardLoss(): boolean {
    return false
  }

  /**
   * Tick the per-turn ember decay countdown. The ember loses 1 only when the
   * countdown expires (every active ember-decay cadence turn). Returns
   * `true` when the ember actually decreased on this turn so the caller can
   * surface the change in the activity log.
   *
   * Ember 0 does NOT end the game; the EmberSystem tier handles the
   * "extinguished" world instead.
   */
  tickEmberDecay(): boolean {
    return EmberSystem.tickDecayCountdown(this.gameState.character)
  }

  /** Read the active ember tier so the spawner / UI can sync. */
  getEmberTier() {
    return EmberSystem.getCharacterTier(this.gameState.character)
  }

  /** Whether the current tier should run enemy phase before the player phase. */
  isEnemyFirstStrike(): boolean {
    return EmberSystem.isEnemyFirstStrike(this.getEmberTier())
  }

  reset(): void {
    this.gameState.reset()
  }
}
