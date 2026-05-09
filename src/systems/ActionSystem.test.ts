import { afterEach, describe, expect, it, vi } from 'vitest'
import { Character } from '@entities/Character'
import { Card, CardType } from '@entities/Card'
import { Lane } from '@entities/Lane'
import { ActionSystem, ActionType } from './ActionSystem'

/** Tests for item reward counts produced by defeated enemies and opened chests. */
describe('ActionSystem rewards', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('drops three items when a two-lane mimic is defeated', () => {
    const character = new Character()
    const lane = new Lane('lane-0', 0)
    const mimic = new Card('mimic-test', CardType.ENEMY, '미믹', 'Was a 2-lane treasure once', 5, 3, {
      isSpecialEnemy: true,
      defeatDropCount: 3,
    })
    // Give enough damage to defeat the wider mimic in one deterministic strike.
    character.damage = 5
    mimic.groupCount = 2
    vi.spyOn(Math, 'random').mockReturnValue(0)

    const result = ActionSystem.executeAction(character, lane, mimic, ActionType.ATTACK_ENEMY)

    expect(result.cardRemoved).toBe(true)
    expect(result.itemGained).toContain('3개')
    expect(character.getItems()).toHaveLength(3)
  })

  it('drops three items from a three-lane treasure chest', () => {
    const character = new Character()
    const lane = new Lane('lane-0', 0)
    const treasure = new Card('treasure-test', CardType.TREASURE, '큰 상자', '3 item reward chest')
    // Treasure rewards are based on the occupied lane count and capped at three.
    treasure.groupCount = 3
    vi.spyOn(Math, 'random').mockReturnValue(0)

    const result = ActionSystem.executeAction(character, lane, treasure, ActionType.TAKE_TREASURE)

    expect(result.cardRemoved).toBe(true)
    expect(result.itemGained).toContain('3개')
    expect(character.getItems()).toHaveLength(3)
  })
})
