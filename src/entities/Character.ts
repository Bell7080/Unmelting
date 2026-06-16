/**
 * Character Entity - The Unmelting Girl
 *
 * Tracks the player's combat stats plus the candle-themed resources:
 *   - ember (time pressure, decays each turn)
 *   - candle (combo gauge, fires Melt when full)
 *   - hand (consumable hand cards used to fight, recover, and combo)
 */

import { HandCard } from './HandCard'
import type { RelicId } from '@data/Relics'

/** Full hand-gauge payoff selected by the player from the hand UI. */
export type CandleMode = 'max-health' | 'attack' | 'ember' | 'draw'

export class Character {
  private static readonly STARTING_MAX_HEALTH = 20
  static readonly STARTING_EMBER = 10
  static readonly EMBER_MAX = 10
  static readonly CANDLE_MAX = 15
  /** Hand stacks bottom-up (slot 0 = bottommost). 10 slots total. */
  static readonly HAND_MAX = 10
  /** Base cadence before altar resource-pack modifiers slow ember decay. */
  static readonly EMBER_DECAY_TURNS = 3

  id: string
  name: string
  health: number
  maxHealth: number
  damage: number
  turn: number

  ember: number
  emberMax: number
  /** Turns remaining until the next ember tick (resets to the active decay cadence). */
  emberDecayCountdown: number
  /** Active ember-decay cadence; altar rewards can raise this from 3 to 4+. */
  emberDecayTurns: number
  candle: number
  candleMax: number
  hand: HandCard[]
  handMax: number
  /** Selected payoff that fires when the 10-step candle gauge fills. */
  candleMode: CandleMode
  /** Temporary shield HP shown above the health bar and consumed before HP. */
  shield: number = 0
  /** Relics owned during this run, shown in the right-side relic layer. */
  relics: RelicId[]
  /** One-shot relics that should never reappear after being consumed. */
  bannedRelics: RelicId[]
  /** 변칙 유물용 누적 피해(10 잃을 때마다 발동). takeDamage가 더하고 외부가 소비한다. */
  relicDamageTaken: number = 0
  /** 권위: 치명타를 체력 1에서 막아냈음을 표시한다. 외부가 연출/파괴 후 false로 소비한다.
   *  (체력이 0으로 떨어졌다가 부활하는 대신, 처음부터 1에서 멈추게 한다.) */
  authoritySurvivePending: boolean = false
  /** 달콤한 유혹: 함정 밟음 피해에 더할 추가 피해량. */
  trapDamageBonus: number = 0
  /** 함정의 대가: 함정 무효화 확률(0~1). 매 함정 밟음마다 독립 판정. */
  trapIgnoreChance: number = 0

  constructor(id: string = 'unmelting-girl', name: string = '녹지 않는 소녀') {
    this.id = id
    this.name = name
    this.health = Character.STARTING_MAX_HEALTH
    this.maxHealth = Character.STARTING_MAX_HEALTH
    this.damage = 1
    this.turn = 0

    this.ember = Character.STARTING_EMBER
    this.emberMax = Character.EMBER_MAX
    this.emberDecayTurns = Character.EMBER_DECAY_TURNS
    this.emberDecayCountdown = this.emberDecayTurns
    this.candle = 0
    this.candleMax = Character.CANDLE_MAX
    this.candleMode = 'attack'
    this.hand = []
    this.handMax = Character.HAND_MAX
    this.relics = []
    this.bannedRelics = []
  }

  takeDamage(amount: number): number {
    let actualDamage = Math.max(0, amount)
    const blocked = Math.min(this.shield, actualDamage)
    this.shield -= blocked
    actualDamage -= blocked
    // 권위: 이 피해가 치명적이면 체력 0으로 내려가지 않고 1에서 멈춘다. 한 번만 흡수하며
    // (authoritySurvivePending), 실제 연출/유물 파괴는 외부 생존 처리에서 마무리한다.
    if (
      this.health - actualDamage <= 0 &&
      this.hasRelic('authority') &&
      !this.authoritySurvivePending
    ) {
      actualDamage = Math.max(0, this.health - 1)
      this.health = 1
      this.authoritySurvivePending = true
    } else {
      this.health = Math.max(0, this.health - actualDamage)
    }
    // 방패로 막지 못하고 실제 HP가 깎인 양만 변칙 유물 누적 피해로 적립한다.
    this.relicDamageTaken += actualDamage
    return actualDamage
  }

  /** 자해 전용: 방패를 무시하고 HP에 직접 피해를 입힌다. 권위 유물은 여전히 사망을 막는다. */
  takeDirectDamage(amount: number): number {
    let actualDamage = Math.max(0, amount)
    if (
      this.health - actualDamage <= 0 &&
      this.hasRelic('authority') &&
      !this.authoritySurvivePending
    ) {
      actualDamage = Math.max(0, this.health - 1)
      this.health = 1
      this.authoritySurvivePending = true
    } else {
      this.health = Math.max(0, this.health - actualDamage)
    }
    this.relicDamageTaken += actualDamage
    return actualDamage
  }

  /** 헌혈팩 유물용: heal()로 실제 HP가 회복될 때마다 호출된다. 비동기 처리는 외부에서 담당. */
  onHealGain?: (amount: number) => void

  heal(amount: number): number {
    const actualHeal = Math.max(0, amount)
    const before = this.health
    this.health = Math.min(this.maxHealth, this.health + actualHeal)
    const gained = this.health - before
    if (gained > 0) this.onHealGain?.(gained)
    return gained
  }

  fullHeal(): number {
    return this.heal(this.maxHealth)
  }

  /** Permanently raise max HP and heal by the same amount for this run. */
  increaseMaxHealth(amount: number): number {
    const actualIncrease = Math.max(0, amount)
    this.maxHealth += actualIncrease
    this.health += actualIncrease
    // maxHP 증가 시에도 혈팩 발동 (최대치 상승량 = 즉시 HP 회복량)
    if (actualIncrease > 0) this.onHealGain?.(actualIncrease)
    return actualIncrease
  }

  /** Permanently raise the player's attack stat. */
  applyDamageBoost(amount: number = 1): void {
    this.damage += Math.max(0, amount)
  }

  /** Permanently raise the ember ceiling (and top off the new headroom). */
  increaseEmberMax(amount: number): number {
    const actualIncrease = Math.max(0, amount)
    this.emberMax += actualIncrease
    this.ember += actualIncrease
    return actualIncrease
  }

  /** Permanently raise the hand-size ceiling for this run. */
  increaseHandMax(amount: number): number {
    const actualIncrease = Math.max(0, amount)
    this.handMax += actualIncrease
    return actualIncrease
  }

  /** Slow ember decay by extending the active countdown cadence for this run. */
  increaseEmberDecayTurns(amount: number): number {
    const actualIncrease = Math.max(0, amount)
    this.emberDecayTurns += actualIncrease
    // 현재 남은 카운트도 같이 늘려 보상을 받은 직후의 체감 지연을 보장한다.
    this.emberDecayCountdown += actualIncrease
    return actualIncrease
  }

  /** Permanently lower the combo-gauge ceiling (min 1) so payoffs fire sooner.
   *  Returns the amount actually reduced. */
  decreaseCandleMax(amount: number): number {
    const before = this.candleMax
    this.candleMax = Math.max(1, this.candleMax - Math.max(0, amount))
    return before - this.candleMax
  }

  /** Debug command setter: keep attack in a safe positive integer range. */
  setDamageForDebug(value: number): void {
    this.damage = Math.max(1, Math.floor(value))
  }

  /** Debug command setter: 체력 명령은 현재/최대 체력을 같은 값으로 맞춘다. */
  setHealthForDebug(value: number): void {
    const safeHealth = Math.max(1, Math.floor(value))
    this.maxHealth = safeHealth
    this.health = safeHealth
  }

  /** Spend max HP as a shop currency while keeping the run alive. */
  spendMaxHealth(amount: number): boolean {
    const cost = Math.max(0, amount)
    if (this.maxHealth - cost < 1) return false
    this.maxHealth -= cost
    this.health = Math.min(this.health, this.maxHealth)
    this.health = Math.max(1, this.health)
    return true
  }

  /** Spend attack as a shop currency without letting attack drop below 1. */
  spendAttack(amount: number): boolean {
    const cost = Math.max(0, amount)
    if (this.damage - cost < 1) return false
    this.damage -= cost
    return true
  }

  /** Add temporary shield HP. It lasts until consumed or the run resets. */
  addShield(amount: number): number {
    const actualShield = Math.max(0, amount)
    this.shield += actualShield
    return actualShield
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

  /** Add gauge progress without clamping so overflow can carry into the next gauge. */
  gainCandle(amount: number): number {
    const gained = Math.max(0, amount)
    this.candle += gained
    return gained
  }

  /** Cycle the 10-slot gauge's payoff mode from the UI icon button. */
  cycleCandleMode(): CandleMode {
    const modes: CandleMode[] = ['attack', 'max-health', 'ember', 'draw']
    const current = modes.indexOf(this.candleMode)
    this.candleMode = modes[(current + 1) % modes.length]
    return this.candleMode
  }

  /** Pick a specific gauge mode (used by the radial fan picker). */
  setCandleMode(mode: CandleMode): CandleMode {
    this.candleMode = mode
    return this.candleMode
  }

  /** Consume exactly one full 10-slot gauge, preserving overflow for the next gauge. */
  consumeFullCandleGauge(): void {
    this.candle = Math.max(0, this.candle - this.candleMax)
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

  /** Add a relic if it is not already owned or permanently removed. */
  addRelic(id: RelicId): boolean {
    if (this.relics.includes(id) || this.bannedRelics.includes(id)) return false
    this.relics.push(id)
    return true
  }

  hasRelic(id: RelicId): boolean {
    return this.relics.includes(id)
  }

  /** Remove a relic; optionally ban it from future random shop offers. */
  removeRelic(id: RelicId, ban: boolean = false): boolean {
    const before = this.relics.length
    this.relics = this.relics.filter((relicId) => relicId !== id)
    if (ban && !this.bannedRelics.includes(id)) this.bannedRelics.push(id)
    return this.relics.length !== before
  }

  nextTurn(): void {
    this.turn++
  }

  reset(): void {
    this.maxHealth = Character.STARTING_MAX_HEALTH
    this.health = this.maxHealth
    this.damage = 1
    this.turn = 0
    this.ember = Character.STARTING_EMBER
    this.emberMax = Character.EMBER_MAX
    this.emberDecayTurns = Character.EMBER_DECAY_TURNS
    this.emberDecayCountdown = this.emberDecayTurns
    this.candle = 0
    this.candleMax = Character.CANDLE_MAX
    this.candleMode = 'attack'
    this.hand = []
    this.handMax = Character.HAND_MAX
    this.relics = []
    this.bannedRelics = []
    this.shield = 0
    this.relicDamageTaken = 0
    this.authoritySurvivePending = false
    this.trapDamageBonus = 0
    this.trapIgnoreChance = 0
  }
}
