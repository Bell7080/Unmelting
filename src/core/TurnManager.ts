/**
 * TurnManager - Orchestrates a turn after the player picks a card.
 *
 * Turn order:
 *   1. Pre-turn refill/drop + active-row regroup (handled in index.ts)
 *   2. Player phase  (handled in index.ts via cardAction event)
 *   3. Enemy phase and treasure volatility resolve as the end-turn event beat
 *   4. Turn end prepares the next row for the next turn-start cleanup page
 *
 * Cards do NOT auto-advance globally any more; only holes created by resolved
 * cards are compacted so upper cards fall into empty rail cells.
 */

import { GameState } from './GameState'
import { Card, CardType } from '@entities/Card'
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

      // Record actual damage so the UI and death check match state.
      const damage = character.takeDamage(card.getDamage())
      hits.push({ laneIndex: i, cardName: card.name, damage })

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
   */
  applyTreasureVolatility(spawner: CardSpawner): TreasureChange[] {
    const changes: TreasureChange[] = []
    const visited = new Set<Card>()
    const d = 0 // Only check active row

    for (let i = 0; i < this.gameState.lanes.length; i++) {
      const card = this.gameState.lanes[i].getCardAtDistance(d)
      if (!card || card.type !== CardType.TREASURE) continue
      if (visited.has(card)) continue
      visited.add(card)

      const roll = Math.random()
      if (roll < 0.3) {
        this.gameState.removeCardFromRow(card, d)
        changes.push({
          laneIndex: i,
          distance: d,
          outcome: 'disappeared',
          cardName: card.name,
        })
      } else if (roll < 0.4) {
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

  /**
   * Three merged traps are no longer an automatic game-over condition. The
   * lethal-level damage is applied only when the player actually chooses them.
   */
  checkHazardLoss(): boolean {
    return false
  }

  reset(): void {
    this.gameState.reset()
  }
}
