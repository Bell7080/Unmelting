/**
 * Card Entity - MVP: 3 card types only (Enemy, Trap, Treasure)
 */

export enum CardType {
  ENEMY = 'enemy',
  TRAP = 'trap',
  TREASURE = 'treasure',
}

export interface CardStats {
  baseHealth?: number
  baseDamage?: number
}

export class Card {
  id: string
  type: CardType
  name: string
  description: string
  baseHealth: number
  baseDamage: number
  groupCount: number // How many identical cards are stacked

  constructor(
    id: string,
    type: CardType,
    name: string,
    description: string,
    baseHealth: number = 0,
    baseDamage: number = 0
  ) {
    this.id = id
    this.type = type
    this.name = name
    this.description = description
    this.baseHealth = baseHealth
    this.baseDamage = baseDamage
    this.groupCount = 1
  }

  // Get actual stats with grouping multiplier applied
  getHealth(): number {
    if (this.type !== CardType.ENEMY) return 0
    if (this.groupCount === 1) return this.baseHealth
    if (this.groupCount === 2) return Math.floor(this.baseHealth * 1.5)
    return Math.floor(this.baseHealth * 2)
  }

  getDamage(): number {
    if (this.type !== CardType.ENEMY) return 0
    if (this.groupCount === 1) return this.baseDamage
    return this.baseDamage + (this.groupCount - 1)
  }

  // For traps: damage taken increases with group
  getTrapDamagePenalty(): number {
    if (this.type !== CardType.TRAP) return 0
    if (this.groupCount === 1) return 1
    if (this.groupCount === 2) return 2
    return 999 // 3칸 트랩 = 즉사
  }

  /**
   * Merge another card into this one. Same type required.
   * For enemies: pool the base stats (HP/damage) so the merged group is
   * meaningfully bigger than either individual.
   * groupCount tracks how many lane cells the card occupies.
   */
  merge(other: Card): void {
    if (this.type !== other.type) return
    this.groupCount += other.groupCount
    if (this.type === CardType.ENEMY) {
      this.baseHealth += other.baseHealth
      this.baseDamage = Math.max(this.baseDamage, other.baseDamage)
    }
  }

  clone(): Card {
    const cloned = new Card(
      this.id,
      this.type,
      this.name,
      this.description,
      this.baseHealth,
      this.baseDamage
    )
    cloned.groupCount = this.groupCount
    return cloned
  }
}
