/**
 * Character Entity - The Unmelting Girl
 *
 * Tracks the player's combat stats plus the candle-themed resources:
 *   - ember (time pressure, decays each turn)
 *   - candle (combo gauge, fires Melt when full)
 *   - hand (consumable hand cards used to fight, recover, and combo)
 */

import { HandCard } from './HandCard'

export class Character {
  private static readonly STARTING_MAX_HEALTH = 20
  static readonly STARTING_EMBER = 10
  static readonly EMBER_MAX = 10
  static readonly CANDLE_MAX = 10
  /** Hand stacks bottom-up (slot 0 = bottommost). 10 slots total. */
  static readonly HAND_MAX = 10
  /** Ember wanes by 1 every EMBER_DECAY_TURNS turns. */
  static readonly EMBER_DECAY_TURNS = 10

  id: string
  name: string
  health: number
  maxHealth: number
  damage: number
  turn: number

  ember: number
  emberMax: number
  /** Turns remaining until the next ember tick (resets to EMBER_DECAY_TURNS). */
  emberDecayCountdown: number
  candle: number
  candleMax: number
  hand: HandCard[]
  handMax: number
  /** Damage shield charges from wax-shield style effects. */
  damageShieldTurns: number = 0
  damageShieldReduction: number = 0

  constructor(
    id: string = 'unmelting-girl',
    name: string = '녹지 않는 소녀',
  ) {
    this.id = id
    this.name = name
    this.health = Character.STARTING_MAX_HEALTH
    this.maxHealth = Character.STARTING_MAX_HEALTH
    this.damage = 1
    this.turn = 0

    this.ember = Character.STARTING_EMBER
    this.emberMax = Character.EMBER_MAX
    this.emberDecayCountdown = Character.EMBER_DECAY_TURNS
    this.candle = 0
    this.candleMax = Character.CANDLE_MAX
    this.hand = []
    this.handMax = Character.HAND_MAX
  }

  takeDamage(amount: number): number {
    let actualDamage = Math.max(0, amount)
    if (this.damageShieldTurns > 0 && actualDamage > 0) {
      actualDamage = Math.max(0, actualDamage - this.damageShieldReduction)
    }
    this.health = Math.max(0, this.health - actualDamage)
    return actualDamage
  }

  heal(amount: number): number {
    const actualHeal = Math.max(0, amount)
    const before = this.health
    this.health = Math.min(this.maxHealth, this.health + actualHeal)
    return this.health - before
  }

  fullHeal(): number {
    return this.heal(this.maxHealth)
  }

  /** Permanently raise max HP and heal by the same amount for this run. */
  increaseMaxHealth(amount: number): number {
    const actualIncrease = Math.max(0, amount)
    this.maxHealth += actualIncrease
    this.health += actualIncrease
    return actualIncrease
  }

  /** Permanently raise the player's attack stat. */
  applyDamageBoost(): void {
    this.damage += 1
  }

  /** Add a damage shield for `turns` turns reducing incoming damage by `reduction`. */
  addDamageShield(turns: number, reduction: number): void {
    this.damageShieldTurns = Math.max(this.damageShieldTurns, turns)
    this.damageShieldReduction = Math.max(this.damageShieldReduction, reduction)
  }

  isAlive(): boolean {
    return this.health > 0
  }

  /** Wane the ember by `amount` (clamped at 0). Returns the new ember value. */
  spendEmber(amount: number): number {
    this.ember = Math.max(0, this.ember - Math.max(0, amount))
    return this.ember
  }

  /** Recover ember up to emberMax. Returns the actual amount restored. */
  gainEmber(amount: number): number {
    const before = this.ember
    this.ember = Math.min(this.emberMax, this.ember + Math.max(0, amount))
    return this.ember - before
  }

  /** Add candle gauge progress, clamped at candleMax. Returns the new value. */
  gainCandle(amount: number): number {
    this.candle = Math.min(this.candleMax, this.candle + Math.max(0, amount))
    return this.candle
  }

  /** Reset the candle gauge after a Melt fires. */
  resetCandle(): void {
    this.candle = 0
  }

  isCandleFull(): boolean {
    return this.candle >= this.candleMax
  }

  /** Add a hand card to the next free slot. Returns true if accepted. */
  addHandCard(card: HandCard): boolean {
    if (this.hand.length >= this.handMax) return false
    this.hand.push(card)
    return true
  }

  /** Remove a hand card by index, returning the removed card or null. */
  removeHandCardAt(index: number): HandCard | null {
    if (index < 0 || index >= this.hand.length) return null
    const [card] = this.hand.splice(index, 1)
    return card ?? null
  }

  hasHandRoom(): boolean {
    return this.hand.length < this.handMax
  }

  nextTurn(): void {
    this.turn++
    if (this.damageShieldTurns > 0) {
      this.damageShieldTurns -= 1
      if (this.damageShieldTurns <= 0) {
        this.damageShieldTurns = 0
        this.damageShieldReduction = 0
      }
    }
  }

  reset(): void {
    this.maxHealth = Character.STARTING_MAX_HEALTH
    this.health = this.maxHealth
    this.damage = 1
    this.turn = 0
    this.ember = Character.STARTING_EMBER
    this.emberMax = Character.EMBER_MAX
    this.emberDecayCountdown = Character.EMBER_DECAY_TURNS
    this.candle = 0
    this.candleMax = Character.CANDLE_MAX
    this.hand = []
    this.handMax = Character.HAND_MAX
    this.damageShieldTurns = 0
    this.damageShieldReduction = 0
  }
}
