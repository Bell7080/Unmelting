import { describe, expect, it } from 'vitest'
import { Character } from './Character'

describe('Character item effects', () => {
  it('keeps flame charm attack boosts permanently across turns', () => {
    const character = new Character()

    character.applyDamageBoost()
    character.nextTurn()

    expect(character.damage).toBe(2)
  })
})
