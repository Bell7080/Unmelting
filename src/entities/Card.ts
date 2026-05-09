/**
 * Card Entity - MVP card model for enemies, traps, and treasures.
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

interface EnemyGroupStats {
  /** Display name for the merged enemy card. */
  name: string
  /** Exact max HP for this group width. */
  health: number
  /** Exact attack damage for this group width. */
  damage: number
}

export class Card {
  id: string
  type: CardType
  name: string
  description: string
  baseHealth: number
  baseDamage: number
  groupCount: number // How many lane cells this card currently occupies.
  health: number // Current effective enemy HP after any group/special rules are applied.
  isSpecialEnemy: boolean // Special enemies, such as mimics, never merge into wider normal groups.
  defeatDropCount: number // Number of item drops awarded when this enemy is defeated.

  constructor(
    id: string,
    type: CardType,
    name: string,
    description: string,
    baseHealth: number = 0,
    baseDamage: number = 0,
    options: CardOptions = {},
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

  /** Return the fixed normal-enemy stats requested for merged 2/3-lane cards. */
  private static getNormalEnemyGroupStats(
    groupCount: number,
  ): EnemyGroupStats | null {
    if (groupCount === 2) return { name: '성냥 무리', health: 5, damage: 3 }
    if (groupCount >= 3) return { name: '밀랍 군단', health: 10, damage: 5 }
    return null
  }

  /** Read the max HP that corresponds to this card's current grouping state. */
  private getCurrentMaxHealth(): number {
    if (this.type !== CardType.ENEMY) return 0
    const groupedStats = this.isSpecialEnemy
      ? null
      : Card.getNormalEnemyGroupStats(this.groupCount)
    return groupedStats?.health ?? this.baseHealth
  }

  /** Read the current enemy HP. Non-enemies never expose HP. */
  getHealth(): number {
    if (this.type !== CardType.ENEMY) return 0
    return this.health
  }

  /** Read the exact attack value for enemies, including fixed grouped enemies. */
  getDamage(): number {
    if (this.type !== CardType.ENEMY) return 0
    if (this.isSpecialEnemy) return this.baseDamage
    const groupedStats = Card.getNormalEnemyGroupStats(this.groupCount)
    return groupedStats?.damage ?? this.baseDamage
  }

  /** Apply damage directly to the current HP pool and return remaining HP. */
  takeDamage(amount: number): number {
    if (this.type !== CardType.ENEMY) return 0
    const actualDamage = Math.max(0, amount)
    this.health = Math.max(0, this.health - actualDamage)
    return this.health
  }

  /** Return trap damage for the current trap width: 2, 5, or lethal 999. */
  getTrapDamagePenalty(): number {
    if (this.type !== CardType.TRAP) return 0
    if (this.groupCount >= 3) return 999
    if (this.groupCount === 2) return 5
    return this.baseDamage || 2
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

  /** Update a merged card's name/stat shell to the fixed requested 2/3-lane card. */
  private applyNormalGroupPresentation(existingDamage: number): void {
    if (this.type === CardType.ENEMY) {
      const groupedStats = Card.getNormalEnemyGroupStats(this.groupCount)
      if (!groupedStats) return
      this.name = groupedStats.name
      this.description = 'Merged enemy formation'
      this.baseHealth = groupedStats.health
      this.baseDamage = groupedStats.damage
      this.health = Math.max(0, groupedStats.health - existingDamage)
      return
    }

    if (this.type === CardType.TRAP) {
      this.name = this.groupCount === 2 ? '촛농 거미집' : '밀랍 거미굴'
      this.description =
        this.groupCount === 2 ? 'Deals 5 damage' : 'Deals lethal damage'
      return
    }

    if (this.type === CardType.TREASURE) {
      this.name = this.groupCount === 2 ? '적당한 상자' : '큰 상자'
      const chestDrops = this.groupCount === 2 ? 3 : 5
      // Keep grouped chest text aligned with the 1/3/5 reward table.
      this.description = `${chestDrops} item reward chest`
    }
  }

  /**
   * Merge another card into this one. Same type required.
   * Normal enemies transform into the exact requested 2-lane/3-lane enemies,
   * while damage already dealt before a later merge is still preserved.
   */
  merge(other: Card): void {
    if (!this.canMergeWith(other)) return

    if (this.type === CardType.ENEMY) {
      const existingDamage = Math.max(
        0,
        this.getCurrentMaxHealth() - this.health,
      )
      const otherDamage = Math.max(
        0,
        other.getCurrentMaxHealth() - other.health,
      )
      this.groupCount += other.groupCount
      this.applyNormalGroupPresentation(existingDamage + otherDamage)
      return
    }

    this.groupCount += other.groupCount
    this.applyNormalGroupPresentation(0)
  }
}
