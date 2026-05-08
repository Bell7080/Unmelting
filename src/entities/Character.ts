/**
 * Character Entity - The Unmelting Girl (player character)
 * Single card that grows and changes throughout the game
 */

export interface CharacterStats {
  health: number
  maxHealth: number
  actionPoints: number
  maxActionPoints: number
  candles: number // Recovery/resource
  stamps: number // Passive enhancement
  wax: number // Power enhancement (risky)
  memory: number // Unlocks abilities
  curses: number // Risk mechanic
}

export class Character {
  id: string
  name: string
  description: string
  stats: CharacterStats
  private baseStats: CharacterStats

  constructor(
    id: string = 'unmelting-girl',
    name: string = 'The Unmelting Girl',
    description: string = 'A girl made of or cursed by candles, who refuses to melt'
  ) {
    this.id = id
    this.name = name
    this.description = description

    // Initialize base stats
    this.baseStats = {
      health: 20,
      maxHealth: 20,
      actionPoints: 2,
      maxActionPoints: 2,
      candles: 3,
      stamps: 0,
      wax: 0,
      memory: 0,
      curses: 0,
    }

    this.stats = { ...this.baseStats }
  }

  takeDamage(amount: number): number {
    const actualDamage = Math.max(0, amount)
    this.stats.health = Math.max(0, this.stats.health - actualDamage)
    return actualDamage
  }

  heal(amount: number): number {
    const actualHeal = Math.min(amount, this.stats.maxHealth - this.stats.health)
    this.stats.health = Math.min(this.stats.maxHealth, this.stats.health + actualHeal)
    return actualHeal
  }

  useActionPoint(): boolean {
    if (this.stats.actionPoints > 0) {
      this.stats.actionPoints--
      return true
    }
    return false
  }

  restoreActionPoints(): void {
    this.stats.actionPoints = this.stats.maxActionPoints
  }

  addCandle(count: number = 1): void {
    this.stats.candles += count
  }

  useCandle(): boolean {
    if (this.stats.candles > 0) {
      this.stats.candles--
      return true
    }
    return false
  }

  addStamp(count: number = 1): void {
    this.stats.stamps += count
  }

  addWax(count: number = 1): void {
    this.stats.wax += count
  }

  addMemory(count: number = 1): void {
    this.stats.memory += count
  }

  addCurse(count: number = 1): void {
    this.stats.curses += count
  }

  isAlive(): boolean {
    return this.stats.health > 0
  }

  reset(): void {
    this.stats = { ...this.baseStats }
  }

  clone(): Character {
    const cloned = new Character(this.id, this.name, this.description)
    cloned.stats = { ...this.stats }
    return cloned
  }
}
