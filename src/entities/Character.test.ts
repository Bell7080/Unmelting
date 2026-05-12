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

  it('resets max health back to the starting value for a new run', () => {
    const character = new Character()
    character.increaseMaxHealth(2)

    character.reset()

    expect(character.maxHealth).toBe(20)
    expect(character.health).toBe(20)
  })
})
