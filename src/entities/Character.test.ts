import { describe, expect, it } from 'vitest'
import { Character } from './Character'

/** Tests for permanent run-scoped item effects on the player character. */
describe('Character item effects', () => {
  it('keeps flame charm attack boosts permanently across turns', () => {
    const character = new Character()

    character.applyDamageBoost()
    character.nextTurn()

    expect(character.damage).toBe(2)
  })

  it('raises max health and heals by the same amount', () => {
    const character = new Character()
    character.takeDamage(5)

    character.increaseMaxHealth(2)

    expect(character.maxHealth).toBe(22)
    expect(character.health).toBe(17)
  })

  it('spends temporary shield before health damage', () => {
    const character = new Character()

    character.addShield(3)
    const damageToHealth = character.takeDamage(5)

    expect(damageToHealth).toBe(2)
    expect(character.shield).toBe(0)
    expect(character.health).toBe(18)
  })

  it('carries hand gauge overflow into the next gauge', () => {
    const character = new Character()

    character.gainCandle(17)
    character.consumeFullCandleGauge()

    expect(character.candle).toBe(2) // CANDLE_MAX=15, 17-15=2 overflow
  })

  it('spends stat currencies without dropping below one', () => {
    const character = new Character()

    expect(character.spendMaxHealth(19)).toBe(true)
    expect(character.maxHealth).toBe(1)
    expect(character.health).toBe(1)
    expect(character.spendMaxHealth(1)).toBe(false)
    expect(character.spendAttack(1)).toBe(false)

    character.applyDamageBoost(2)
    expect(character.spendAttack(1)).toBe(true)
    expect(character.damage).toBe(2)
  })

  it('tracks owned and permanently banned relics for shop offers', () => {
    const character = new Character()

    expect(character.addRelic('hope')).toBe(true)
    expect(character.hasRelic('hope')).toBe(true)
    expect(character.removeRelic('hope', true)).toBe(true)
    expect(character.hasRelic('hope')).toBe(false)
    expect(character.addRelic('hope')).toBe(false)
    expect(character.bannedRelics).toContain('hope')
  })

  it('resets max health back to the starting value for a new run', () => {
    const character = new Character()
    character.increaseMaxHealth(2)

    character.reset()

    expect(character.maxHealth).toBe(20)
    expect(character.health).toBe(20)
  })

  it('오버힐이 발생하면 onHealOverflow를 초과분으로 호출한다(넘치는 촛농 훅)', () => {
    const character = new Character() // 20/20 풀피
    let overflow = 0
    character.onHealOverflow = (o) => { overflow = o }

    const gained = character.heal(5)

    expect(gained).toBe(0)     // 풀피라 실제 회복 0
    expect(overflow).toBe(5)   // 5 전부 오버플로우
  })

  it('일부만 차면 회복분만큼 채우고 나머지가 오버플로우다', () => {
    const character = new Character()
    character.takeDamage(2) // 18/20
    let overflow = 0
    character.onHealOverflow = (o) => { overflow = o }

    const gained = character.heal(5) // 2 회복, 3 초과

    expect(gained).toBe(2)
    expect(overflow).toBe(3)
  })

  it('addShield는 onShieldGain을 획득량으로 호출한다(가시 방패 훅)', () => {
    const character = new Character()
    let shieldGain = 0
    character.onShieldGain = (a) => { shieldGain = a }

    character.addShield(3)

    expect(shieldGain).toBe(3)
  })
})
