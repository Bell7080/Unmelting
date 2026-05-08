/**
 * CardSpawner - Generates random cards for each turn
 * MVP: 3 card types with simple naming
 */

import { Card, CardType } from '@entities/Card'

const ENEMY_NAMES = ['잉크 늑대', '양초 토끼', '검은 까마귀', '밀랍 사슴', '길 잃은 아이', '그림자']

const TRAP_NAMES = ['검은 비', '꺼진 등불', '진흙길', '찢긴 길', '꺼져가는 불꽃']

const TREASURE_NAMES = ['보물상자', '빛나는 상자', '황금 함', '낡은 보석함']

export class CardSpawner {
  private turnCount: number = 0

  /**
   * Spawn cards for this turn (one per lane)
   */
  spawnCardsForTurn(): Card[] {
    this.turnCount++
    const cards: Card[] = []

    for (let i = 0; i < 3; i++) {
      cards.push(this.generateRandomCard())
    }

    return cards
  }

  /**
   * Generate a single random card
   */
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

  private generateEnemy(): Card {
    const name = ENEMY_NAMES[Math.floor(Math.random() * ENEMY_NAMES.length)]
    const baseHealth = 3 + Math.floor(Math.random() * 3) // 3-5 health
    const baseDamage = 1 + Math.floor(Math.random() * 2) // 1-2 damage

    return new Card(
      `enemy-${this.turnCount}-${Math.random()}`,
      CardType.ENEMY,
      name,
      'Attacks the player',
      baseHealth,
      baseDamage
    )
  }

  private generateTrap(): Card {
    const name = TRAP_NAMES[Math.floor(Math.random() * TRAP_NAMES.length)]
    return new Card(
      `trap-${this.turnCount}-${Math.random()}`,
      CardType.TRAP,
      name,
      'Blocks the lane'
    )
  }

  private generateTreasure(): Card {
    const name = TREASURE_NAMES[Math.floor(Math.random() * TREASURE_NAMES.length)]
    return new Card(
      `treasure-${this.turnCount}-${Math.random()}`,
      CardType.TREASURE,
      name,
      'Provides rewards'
    )
  }
}
