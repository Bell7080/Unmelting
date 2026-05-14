/**
 * Card Entity - MVP card model for enemies, traps, and treasures.
 */

export enum CardType {
  ENEMY = 'enemy',
  TRAP = 'trap',
  TREASURE = 'treasure',
}

export type TrapKind = 'web' | 'bomb' | 'spore'

export type EnemySpriteId =
  | 'enemyMouse'
  | 'enemyFrog'
  | 'enemyMoth'
  | 'enemyChitin'
  | 'enemyBird'
  | 'enemyMole'

export interface CardOptions {
  /** Special enemies stay as standalone threats and never merge with other cards. */
  isSpecialEnemy?: boolean
  /** Number of items awarded when this enemy is defeated. */
  defeatDropCount?: number
  /** Enemy illustration id used to keep merged groups on the strongest art. */
  enemySpriteId?: EnemySpriteId
  /** Relative enemy strength; higher values supply merged group name/art. */
  enemyPower?: number
  /** Trap subtype with distinct art and behavior. */
  trapKind?: TrapKind
}

interface EnemyGroupStats {
  /** Display name for the merged enemy card. */
  name: string
  /** Exact max HP for this group width. */
  health: number
  /** Exact attack damage for this group width. */
  damage: number
}

/** Extra stats added to a same-row enemy formation after member stats are summed. */
function enemyGroupBonus(groupCount: number): { hp: number; damage: number } {
  if (groupCount >= 3) return { hp: 3, damage: 3 }
  if (groupCount === 2) return { hp: 2, damage: 2 }
  return { hp: 0, damage: 0 }
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
  /** Wax status: turns remaining while this field card is '굳음' and cannot act. */
  frozenTurns: number
  /** Enemy group internals keep merged stats proportional to the actual members. */
  enemyHealthTotal: number
  enemyDamageTotal: number
  enemySpriteId: EnemySpriteId | null
  enemyPower: number
  /** Trap subtype and behavior state for web/bomb/spore rules. */
  trapKind: TrapKind
  isBombArmed: boolean
  sporeTurnsUntilSpread: number

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
    this.frozenTurns = 0
    this.enemyHealthTotal = type === CardType.ENEMY ? baseHealth : 0
    this.enemyDamageTotal = type === CardType.ENEMY ? baseDamage : 0
    this.enemySpriteId = options.enemySpriteId ?? null
    this.enemyPower = options.enemyPower ?? 0
    this.trapKind = options.trapKind ?? 'web'
    this.isBombArmed = false
    this.sporeTurnsUntilSpread = this.trapKind === 'spore' ? 2 : 0
  }

  /** Return proportional stats for a merged enemy group based on real members. */
  private getNormalEnemyGroupStats(groupCount: number): EnemyGroupStats | null {
    if (groupCount <= 1) return null
    const bonus = enemyGroupBonus(groupCount)
    const strongestName = this.name.replace(/ 무리$/, '')
    return {
      name: `${strongestName} 무리`,
      health: this.enemyHealthTotal + bonus.hp,
      damage: this.enemyDamageTotal + bonus.damage,
    }
  }

  /** Read the max HP that corresponds to this card's current grouping state. */
  private getCurrentMaxHealth(): number {
    if (this.type !== CardType.ENEMY) return 0
    const groupedStats = this.isSpecialEnemy ? null : this.getNormalEnemyGroupStats(this.groupCount)
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
    const groupedStats = this.getNormalEnemyGroupStats(this.groupCount)
    return groupedStats?.damage ?? this.baseDamage
  }

  /** Apply damage directly to the current HP pool and return remaining HP. */
  takeDamage(amount: number): number {
    if (this.type !== CardType.ENEMY) return 0
    const actualDamage = Math.max(0, amount)
    this.health = Math.max(0, this.health - actualDamage)
    return this.health
  }

  /** Apply the wax '굳음' status, keeping the longest remaining duration. */
  freeze(turns: number): void {
    this.frozenTurns = Math.max(this.frozenTurns, Math.max(0, turns))
  }

  /** Tick one turn of wax '굳음'. Returns true when the status remains active. */
  tickFrozen(): boolean {
    if (this.frozenTurns <= 0) return false
    this.frozenTurns = Math.max(0, this.frozenTurns - 1)
    return this.frozenTurns > 0
  }

  /** Whether this card is currently stopped by wax. */
  isFrozen(): boolean {
    return this.frozenTurns > 0
  }

  /** Return trap damage for the current trap width and subtype. */
  getTrapDamagePenalty(): number {
    if (this.type !== CardType.TRAP) return 0
    if (this.trapKind === 'bomb') return 0
    if (this.trapKind === 'spore') {
      if (this.groupCount >= 3) return 5
      if (this.groupCount === 2) return 3
      return 1
    }
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
    if (this.type === CardType.TRAP) {
      // Bomb timing should never be reset by lane grouping, and unlike trap
      // subtypes should not merge into one ambiguous hazard.
      if (this.trapKind === 'bomb' || other.trapKind === 'bomb') return false
      return this.trapKind === other.trapKind
    }
    return true
  }

  /** Update a merged card's name/stat shell to the fixed requested 2/3-lane card. */
  private applyNormalGroupPresentation(existingDamage: number): void {
    if (this.type === CardType.ENEMY) {
      const groupedStats = this.getNormalEnemyGroupStats(this.groupCount)
      if (!groupedStats) return
      this.name = groupedStats.name
      this.description = 'Merged enemy formation'
      this.baseHealth = groupedStats.health
      this.baseDamage = groupedStats.damage
      this.health = Math.max(0, groupedStats.health - existingDamage)
      return
    }

    if (this.type === CardType.TRAP) {
      if (this.trapKind === 'bomb') return
      if (this.trapKind === 'spore') {
        this.name = this.groupCount === 2 ? '번식 포자군' : '포자 군락'
        this.description =
          this.groupCount === 2
            ? 'Deals 3 damage and spreads twice'
            : 'Deals 5 damage and spreads three times'
      } else {
        this.name = this.groupCount === 2 ? '촛농 거미집' : '밀랍 거미굴'
        this.description = this.groupCount === 2 ? 'Deals 5 damage' : 'Deals lethal damage'
      }
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
      const existingDamage = Math.max(0, this.getCurrentMaxHealth() - this.health)
      const otherDamage = Math.max(0, other.getCurrentMaxHealth() - other.health)
      this.enemyHealthTotal += other.enemyHealthTotal
      this.enemyDamageTotal += other.enemyDamageTotal
      if (other.enemyPower > this.enemyPower) {
        this.enemyPower = other.enemyPower
        this.enemySpriteId = other.enemySpriteId
        this.name = other.name
      }
      this.groupCount += other.groupCount
      this.applyNormalGroupPresentation(existingDamage + otherDamage)
      return
    }

    if (this.type === CardType.TRAP && this.trapKind === 'spore') {
      // The merged spore colony keeps the shorter countdown so a nearly-ready
      // spore does not get delayed by joining a fresh colony.
      this.sporeTurnsUntilSpread = Math.min(this.sporeTurnsUntilSpread, other.sporeTurnsUntilSpread)
    }
    this.groupCount += other.groupCount
    this.applyNormalGroupPresentation(0)
  }
}
