/**
 * CardSpawner - Generates random cards from the current base card set.
 *
 * Spawn weights and enemy stat bonuses are driven by the EmberSystem tier so
 * the field gets harder as the player's ember runs low.
 */

import { Card, CardType } from '@entities/Card'
import { EmberSystem, EmberTier, SpawnWeights } from './EmberSystem'

interface CardDefinition {
  /** Korean display name shown on the card face. */
  name: string
  /** Short English description used internally and in debug-friendly text. */
  description: string
  /** Enemy HP or trap damage, depending on card type. */
  healthOrDamage?: number
  /** Enemy attack value. */
  attack?: number
}

const ENEMY_DEFINITIONS: CardDefinition[] = [
  { name: '양초 생쥐', description: 'Small candle mouse', healthOrDamage: 2, attack: 1 },
  { name: '양초 개구리', description: 'Leaping candle frog', healthOrDamage: 1, attack: 2 },
]

const TRAP_DEFINITIONS: CardDefinition[] = [
  { name: '양초 거미줄', description: 'Deals 2 damage', healthOrDamage: 2 },
]

const TREASURE_DEFINITIONS: CardDefinition[] = [
  { name: '작은 상자', description: '1 item reward chest' },
]

const MIMIC_BY_SPAN: Record<number, { health: number; attack: number; drops: number }> = {
  // Mimics are riskier than their source chests and pay the requested bonus loot on defeat.
  1: { health: 4, attack: 2, drops: 2 },
  2: { health: 10, attack: 5, drops: 5 },
  3: { health: 20, attack: 10, drops: 10 },
}

export class CardSpawner {
  private turnCount: number = 0
  private currentTier: EmberTier = 'bright'

  /** Update the active ember tier so the next spawn run uses the matching weights. */
  setTier(tier: EmberTier): void {
    this.currentTier = tier
  }

  /** Spawn one random card per lane for the current turn refill. */
  spawnCardsForTurn(): Card[] {
    this.turnCount++
    const cards: Card[] = []

    for (let i = 0; i < 3; i++) {
      cards.push(this.generateRandomCard())
    }

    return cards
  }

  /** Pick a card type using the active spawn weights, then build the card. */
  private generateRandomCard(): Card {
    const weights = EmberSystem.getSpawnWeights(this.currentTier)
    const total = weights.enemy + weights.trap + weights.treasure
    const roll = Math.random() * total

    if (roll < weights.enemy) return this.generateEnemy()
    if (roll < weights.enemy + weights.trap) return this.generateTrap()
    return this.generateTreasure()
  }

  /** Pick one of the current one-lane enemies, applying tier bonus if any. */
  private generateEnemy(): Card {
    const definition = ENEMY_DEFINITIONS[Math.floor(Math.random() * ENEMY_DEFINITIONS.length)]
    const bonus = EmberSystem.getEnemyStatBonus(this.currentTier)
    return new Card(
      `enemy-${this.turnCount}-${Math.random()}`,
      CardType.ENEMY,
      definition.name,
      definition.description,
      (definition.healthOrDamage ?? 1) + bonus.hp,
      (definition.attack ?? 1) + bonus.atk,
    )
  }

  /** Spawn the current one-lane trap; wider traps are produced by row grouping. */
  private generateTrap(): Card {
    const definition = TRAP_DEFINITIONS[Math.floor(Math.random() * TRAP_DEFINITIONS.length)]
    return new Card(
      `trap-${this.turnCount}-${Math.random()}`,
      CardType.TRAP,
      definition.name,
      definition.description,
      0,
      definition.healthOrDamage ?? 2,
    )
  }

  /** Spawn the current one-lane chest; wider chests are produced by row grouping. */
  private generateTreasure(): Card {
    const definition = TREASURE_DEFINITIONS[Math.floor(Math.random() * TREASURE_DEFINITIONS.length)]
    return new Card(
      `treasure-${this.turnCount}-${Math.random()}`,
      CardType.TREASURE,
      definition.name,
      definition.description,
    )
  }

  /** Read the active spawn weights so the UI can show the tier visually. */
  getActiveWeights(): SpawnWeights {
    return EmberSystem.getSpawnWeights(this.currentTier)
  }

  /**
   * Mimic: treasure event enemy whose stats and rewards mirror the chest width.
   * The 3-lane case is implemented even though normal play almost never creates it.
   */
  spawnMimic(span: number = 1): Card {
    const safeSpan = Math.max(1, Math.min(3, span))
    const stats = MIMIC_BY_SPAN[safeSpan]
    const mimic = new Card(
      `mimic-${this.turnCount}-${Math.random()}`,
      CardType.ENEMY,
      '미믹',
      `Was a ${safeSpan}-lane treasure once`,
      stats.health,
      stats.attack,
      {
        isSpecialEnemy: true,
        defeatDropCount: stats.drops,
      },
    )

    // Special mimics do not merge, so their width is assigned directly from the source chest.
    mimic.groupCount = safeSpan
    return mimic
  }
}
