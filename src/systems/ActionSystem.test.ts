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

  it('drops five items when a two-lane mimic is defeated', () => {
    const character = new Character()
    const lane = new Lane('lane-0', 0)
    const mimic = new Card('mimic-test', CardType.ENEMY, '미믹', 'Was a 2-lane treasure once', 10, 5, {
      isSpecialEnemy: true,
      defeatDropCount: 5,
    })
    // Give enough damage to defeat the wider mimic in one deterministic strike.
    character.damage = 10
    mimic.groupCount = 2
    vi.spyOn(Math, 'random').mockReturnValue(0)

    const result = ActionSystem.executeAction(character, lane, mimic, ActionType.ATTACK_ENEMY)

    expect(result.cardRemoved).toBe(true)
    expect(result.itemGained).toContain('5개')
    expect(character.getItems()).toHaveLength(5)
  })

  it('drops five items from a three-lane treasure chest', () => {
    const character = new Character()
    const lane = new Lane('lane-0', 0)
    const treasure = new Card('treasure-test', CardType.TREASURE, '큰 상자', '3 item reward chest')
    // Treasure rewards follow the configured 1/3/5 reward table.
    treasure.groupCount = 3
    vi.spyOn(Math, 'random').mockReturnValue(0)

    const result = ActionSystem.executeAction(character, lane, treasure, ActionType.TAKE_TREASURE)

    expect(result.cardRemoved).toBe(true)
    expect(result.itemGained).toContain('5개')
    expect(character.getItems()).toHaveLength(5)
  })
})
