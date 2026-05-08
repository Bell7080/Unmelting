/**
 * Card Entity - MVP: 3 card types only (Enemy, Trap, Treasure)
 */

export enum CardType {
  ENEMY = 'enemy',
  TRAP = 'trap',
  TREASURE = 'treasure',
}

export interface CardOptions {
  /** Special enemies stay as standalone threats and never merge with other cards. */
  isSpecialEnemy?: boolean
  /** Number of items awarded when this enemy is defeated. */
  defeatDropCount?: number
}

export class Card {
  id: string
  type: CardType
  name: string
  description: string
  baseHealth: number
  baseDamage: number
  groupCount: number // How many identical cards are stacked
  health: number // Current effective enemy HP after group bonuses are applied
  isSpecialEnemy: boolean // Special enemies, such as mimics, never merge into wider groups
  defeatDropCount: number // Number of item drops awarded when this enemy is defeated

  constructor(
    id: string,
    type: CardType,
    name: string,
    description: string,
    baseHealth: number = 0,
    baseDamage: number = 0,
    options: CardOptions = {}
  ) {
    this.id = id
    this.type = type
    this.name = name
    this.description = description
    this.baseHealth = baseHealth
    this.baseDamage = baseDamage
    this.groupCount = 1
    this.health = type === CardType.ENEMY ? baseHealth : 0
    this.isSpecialEnemy = options.isSpecialEnemy ?? false
    this.defeatDropCount = options.defeatDropCount ?? 1
  }

  /**
   * Calculate the maximum HP for an enemy group from its ungrouped HP pool.
   * Keeping this pure prevents repeated multiplier application after damage.
   */
  private static calculateGroupedHealth(baseHealth: number, groupCount: number): number {
    if (groupCount <= 1) return baseHealth
    if (groupCount === 2) return Math.floor(baseHealth * 1.5)
    return Math.floor(baseHealth * 2)
  }

  /**
   * Read the current enemy HP. Grouping bonuses are applied only when the
   * group is formed, so damaged 2/3-lane enemies cannot heal on the next read.
   */
  getHealth(): number {
    if (this.type !== CardType.ENEMY) return 0
    return this.health
  }

  getDamage(): number {
    if (this.type !== CardType.ENEMY) return 0
    if (this.groupCount === 1) return this.baseDamage
    return this.baseDamage + (this.groupCount - 1)
  }

  /**
   * Apply damage directly to the current HP pool and return remaining HP.
   * This keeps baseHealth as the original group-size calculation input.
   */
  takeDamage(amount: number): number {
    if (this.type !== CardType.ENEMY) return 0
    const actualDamage = Math.max(0, amount)
    this.health = Math.max(0, this.health - actualDamage)
    return this.health
  }

  // For traps: damage taken increases with group
  getTrapDamagePenalty(): number {
    if (this.type !== CardType.TRAP) return 0
    if (this.groupCount === 1) return 1
    if (this.groupCount === 2) return 2
    return 999 // 3칸 트랩 = 즉사
  }

  /**
   * Decide whether two cards can share a single multi-lane group. Mimics and
   * other special enemies are intentionally kept separate so a treasure-turned
   * threat cannot be absorbed into an ordinary enemy cell.
   */
  canMergeWith(other: Card): boolean {
    if (this.type !== other.type) return false
    if (this.isSpecialEnemy || other.isSpecialEnemy) return false
    return true
  }

  /**
   * Merge another card into this one. Same type required.
   * For enemies: keep baseHealth as the ungrouped HP pool, then calculate the
   * grouped max HP exactly once while preserving damage already dealt to either
   * enemy. groupCount tracks how many lane cells the card occupies.
   */
  merge(other: Card): void {
    if (!this.canMergeWith(other)) return

    if (this.type === CardType.ENEMY) {
      const thisMaxHealth = Card.calculateGroupedHealth(this.baseHealth, this.groupCount)
      const otherMaxHealth = Card.calculateGroupedHealth(other.baseHealth, other.groupCount)
      const existingDamage = Math.max(0, thisMaxHealth - this.health)
      const otherDamage = Math.max(0, otherMaxHealth - other.health)

      this.groupCount += other.groupCount
      this.baseHealth += other.baseHealth
      this.baseDamage = Math.max(this.baseDamage, other.baseDamage)

      const mergedMaxHealth = Card.calculateGroupedHealth(this.baseHealth, this.groupCount)
      this.health = Math.max(0, mergedMaxHealth - existingDamage - otherDamage)
      return
    }

    this.groupCount += other.groupCount
  }

  clone(): Card {
    const cloned = new Card(
      this.id,
      this.type,
      this.name,
      this.description,
      this.baseHealth,
      this.baseDamage,
      {
        isSpecialEnemy: this.isSpecialEnemy,
        defeatDropCount: this.defeatDropCount,
      }
    )
    cloned.groupCount = this.groupCount
    cloned.health = this.health
    return cloned
  }
}
