import { afterEach, describe, expect, it, vi } from 'vitest'
import { Character } from '@entities/Character'
import { Card, CardType } from '@entities/Card'
import { Lane } from '@entities/Lane'
import { ActionSystem, ActionType } from './ActionSystem'

describe('ActionSystem enemy rewards', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('drops three items when a mimic is defeated', () => {
    const character = new Character()
    const lane = new Lane('lane-0', 0)
    const mimic = new Card('mimic-test', CardType.ENEMY, '미믹', 'Was a treasure once', 1, 1, {
      isSpecialEnemy: true,
      defeatDropCount: 3,
    })
    vi.spyOn(Math, 'random').mockReturnValue(0)

    const result = ActionSystem.executeAction(character, lane, mimic, ActionType.ATTACK_ENEMY)

    expect(result.cardRemoved).toBe(true)
    expect(result.itemGained).toContain('3개')
    expect(character.getItems()).toHaveLength(3)
  })
})
