/**
 * Character Entity - MVP: Simplified (health, damage, items only)
 * The Unmelting Girl - player character
 */

export class Character {
  id: string
  name: string
  health: number
  maxHealth: number
  damage: number
  items: string[] // Inventory of item names
  turn: number

  constructor(
    id: string = 'unmelting-girl',
    name: string = '녹지 않는 소녀'
  ) {
    this.id = id
    this.name = name
    this.health = 20
    this.maxHealth = 20
    this.damage = 1
    this.items = []
    this.turn = 0
  }

  takeDamage(amount: number): number {
    // Damage is clamped so healing/negative damage can never occur by mistake.
    const actualDamage = Math.max(0, amount)
    this.health = Math.max(0, this.health - actualDamage)
    return actualDamage
  }

  heal(amount: number): number {
    const actualHeal = Math.min(amount, this.maxHealth - this.health)
    this.health = Math.min(this.maxHealth, this.health + actualHeal)
    return actualHeal
  }

  addItem(itemName: string): void {
    this.items.push(itemName)
  }

  removeItem(index: number): string | null {
    if (index < 0 || index >= this.items.length) return null
    const item = this.items[index]
    this.items.splice(index, 1)
    return item
  }

  getItems(): string[] {
    return [...this.items]
  }

  /** Permanently raise the player's attack stat. */
  applyDamageBoost(): void {
    this.damage += 1
  }

  isAlive(): boolean {
    return this.health > 0
  }

  nextTurn(): void {
    // Attack boosts are permanent, so only the turn counter advances here.
    this.turn++
  }

  reset(): void {
    this.health = this.maxHealth
    this.damage = 1
    this.items = []
    this.turn = 0
  }
}
