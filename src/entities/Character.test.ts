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
})
