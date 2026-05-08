/**
 * TurnManager - Orchestrates a turn after the player picks a card.
 *
 * Turn order:
 *   1. Player phase  (handled in index.ts via cardAction event)
 *   2. Enemy phase   (active-row enemies still alive strike the player)
 *   3. Treasure volatility (50% disappear, 10% become a mimic enemy)
 *   4. Hazard check  (a full row of traps = instant death)
 *   5. Lane refill   (only lanes the player resolved get their stack pulled
 *      down + a fresh top card)  — handled in index.ts
 *   6. Re-group rows + nextTurn
 *
 * Cards do NOT auto-advance globally any more; an unselected card stays where
 * it is across turns.
 */

import { GameState } from './GameState'
import { Card, CardType } from '@entities/Card'
import { LANE_DISTANCE_COUNT } from '@entities/Lane'
import { CardSpawner } from '@systems/CardSpawner'

export interface EnemyHit {
  laneIndex: number
  cardName: string
  damage: number
}

export interface TreasureChange {
  laneIndex: number
  distance: number
  outcome: 'disappeared' | 'mimic'
  cardName: string
}

export class TurnManager {
  gameState: GameState

  constructor(gameState: GameState) {
    this.gameState = gameState
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
      if (!card || card.type !== CardType.ENEMY) continue
      if (seen.has(card)) continue
      seen.add(card)

      const damage = card.getDamage()
      character.takeDamage(damage)
      hits.push({ laneIndex: i, cardName: card.name, damage })

      if (!character.isAlive()) {
        this.gameState.endGame('character_defeated')
        return hits
      }
    }

    return hits
  }

  /**
   * Per-treasure roll: 50% it vanishes, 10% it morphs into a mimic enemy.
   * Runs against every treasure on the board.
   */
  applyTreasureVolatility(spawner: CardSpawner): TreasureChange[] {
    const changes: TreasureChange[] = []
    const visited = new Set<Card>()

    for (let d = 0; d < LANE_DISTANCE_COUNT; d++) {
      for (let i = 0; i < this.gameState.lanes.length; i++) {
        const card = this.gameState.lanes[i].getCardAtDistance(d)
        if (!card || card.type !== CardType.TREASURE) continue
        if (visited.has(card)) continue
        visited.add(card)

        const roll = Math.random()
        if (roll < 0.5) {
          this.gameState.removeCardFromRow(card, d)
          changes.push({
            laneIndex: i,
            distance: d,
            outcome: 'disappeared',
            cardName: card.name,
          })
        } else if (roll < 0.6) {
          const mimic = spawner.spawnMimic()
          this.gameState.removeCardFromRow(card, d)
          this.gameState.lanes[i].setCardAtDistance(d, mimic)
          changes.push({
            laneIndex: i,
            distance: d,
            outcome: 'mimic',
            cardName: card.name,
          })
        }
      }
    }

    return changes
  }

  /**
   * If the active row is fully traps (and they form one merged group),
   * the player can no longer pick anything safely → instant death.
   */
  checkHazardLoss(): boolean {
    const lanes = this.gameState.lanes
    if (lanes.length === 0) return false

    let allTrap = true
    for (const lane of lanes) {
      const card = lane.getCardAtDistance(0)
      if (!card || card.type !== CardType.TRAP) {
        allTrap = false
        break
      }
    }
    if (allTrap && lanes.every((l) => l.getCardAtDistance(0))) {
      this.gameState.endGame('instant_death_trap')
      return true
    }
    return false
  }

  reset(): void {
    this.gameState.reset()
  }
}
