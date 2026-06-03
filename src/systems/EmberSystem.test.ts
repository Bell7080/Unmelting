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

  it('uses the upgraded four-turn cadence after a thick wick reward', () => {
    const character = new Character()

    character.increaseEmberDecayTurns(1)

    // 두꺼운 심지는 현재 남은 카운트와 이후 리셋 카운트를 모두 1턴 늘린다.
    expect(character.emberDecayTurns).toBe(4)
    expect(character.emberDecayCountdown).toBe(4)
    expect(EmberSystem.tickDecayCountdown(character)).toBe(false)
    expect(EmberSystem.tickDecayCountdown(character)).toBe(false)
    expect(EmberSystem.tickDecayCountdown(character)).toBe(false)
    expect(EmberSystem.tickDecayCountdown(character)).toBe(true)
    expect(character.ember).toBe(9)
    expect(character.emberDecayCountdown).toBe(4)
  })
})
