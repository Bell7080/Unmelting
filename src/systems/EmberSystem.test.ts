import { describe, expect, it } from 'vitest'
import { Character } from '@entities/Character'
import { EmberSystem } from './EmberSystem'

describe('EmberSystem decay cadence', () => {
  it('wanes the ember once every three completed turns', () => {
    const character = new Character()

    expect(EmberSystem.tickDecayCountdown(character)).toBe(false)
    expect(character.ember).toBe(10)
    expect(EmberSystem.tickDecayCountdown(character)).toBe(false)
    expect(character.ember).toBe(10)
    expect(EmberSystem.tickDecayCountdown(character)).toBe(true)
    expect(character.ember).toBe(9)
    expect(character.emberDecayCountdown).toBe(Character.EMBER_DECAY_TURNS)
  })
})
