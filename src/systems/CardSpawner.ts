/**
 * CardSpawner - Generates random cards from the current base card set.
 */

import { Card, CardType } from '@entities/Card'

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

  /** Spawn one random card per lane for the current turn refill. */
  spawnCardsForTurn(): Card[] {
    this.turnCount++
    const cards: Card[] = []

    for (let i = 0; i < 3; i++) {
      cards.push(this.generateRandomCard())
    }

    return cards
  }

  /** Generate a random enemy, trap, or treasure using the current spawn weights. */
  private generateRandomCard(): Card {
    const cardTypeRoll = Math.random()

    if (cardTypeRoll < 0.5) {
      return this.generateEnemy()
    } else if (cardTypeRoll < 0.75) {
      return this.generateTrap()
    } else {
      return this.generateTreasure()
    }
  }

  /** Pick one of the current one-lane enemies. */
  private generateEnemy(): Card {
    const definition = ENEMY_DEFINITIONS[Math.floor(Math.random() * ENEMY_DEFINITIONS.length)]
    return new Card(
      `enemy-${this.turnCount}-${Math.random()}`,
      CardType.ENEMY,
      definition.name,
      definition.description,
      definition.healthOrDamage ?? 1,
      definition.attack ?? 1
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
      definition.healthOrDamage ?? 2
    )
  }

  /** Spawn the current one-lane chest; wider chests are produced by row grouping. */
  private generateTreasure(): Card {
    const definition = TREASURE_DEFINITIONS[Math.floor(Math.random() * TREASURE_DEFINITIONS.length)]
    return new Card(
      `treasure-${this.turnCount}-${Math.random()}`,
      CardType.TREASURE,
      definition.name,
      definition.description
    )
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
      }
    )

    // Special mimics do not merge, so their width is assigned directly from the source chest.
    mimic.groupCount = safeSpan
    return mimic
  }
}
