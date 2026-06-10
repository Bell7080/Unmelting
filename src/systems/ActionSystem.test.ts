import { afterEach, describe, expect, it, vi } from 'vitest'
import { Character } from '@entities/Character'
import { Card, CardType } from '@entities/Card'
import { Lane } from '@entities/Lane'
import { ActionSystem, ActionType } from './ActionSystem'

/**
 * Tests for hand-card reward counts produced by defeated enemies and opened
 * chests after the hand-system redesign. Drops now land directly in the
 * character's bottom-up hand instead of as named string items.
 */
describe('ActionSystem rewards', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('drops five hand cards when a two-lane mimic is defeated', () => {
    const character = new Character()
    const lane = new Lane('lane-0', 0)
    const mimic = new Card(
      'mimic-test',
      CardType.ENEMY,
      '미믹',
      'Was a 2-lane treasure once',
      10,
      5,
      {
        isSpecialEnemy: true,
        defeatDropCount: 5,
      }
    )
    // Give enough damage to defeat the wider mimic in one deterministic strike.
    character.damage = 10
    mimic.groupCount = 2
    vi.spyOn(Math, 'random').mockReturnValue(0)

    const result = ActionSystem.executeAction(character, lane, mimic, ActionType.ATTACK_ENEMY)

    expect(result.cardRemoved).toBe(true)
    expect(result.itemGainedNames).toHaveLength(5)
    expect(character.hand).toHaveLength(5)
  })

  it('drops five hand cards from a three-lane treasure chest', () => {
    const character = new Character()
    const lane = new Lane('lane-0', 0)
    const treasure = new Card('treasure-test', CardType.TREASURE, '큰 상자', '3 item reward chest')
    // Treasure rewards follow the configured 1/3/5 reward table.
    treasure.groupCount = 3
    vi.spyOn(Math, 'random').mockReturnValue(0)

    const result = ActionSystem.executeAction(character, lane, treasure, ActionType.TAKE_TREASURE)

    expect(result.cardRemoved).toBe(true)
    expect(result.itemGainedNames).toHaveLength(5)
    expect(character.hand).toHaveLength(5)
  })

  it('does not let a click collect starlight; it is auto-swept at the front row instead', () => {
    const character = new Character()
    const lane = new Lane('lane-0', 0)
    const starlight = new Card('starlight-test', CardType.TREASURE, '별빛', 'turn key', 0, 0, {
      treasureKind: 'starlight',
    })

    const result = ActionSystem.executeAction(character, lane, starlight, ActionType.TAKE_TREASURE)

    // 클릭 수집 금지 — 좌우 봉쇄로 중앙만 착취하는 구도를 차단한다.
    expect(result.success).toBe(false)
    expect(result.cardRemoved).toBe(false)
    expect(character.hand).toHaveLength(0)
  })

  it('reports overflow when the hand is already full', () => {
    const character = new Character()
    while (character.hasHandRoom()) {
      character.addHandCard({ uid: `seed-${character.hand.length}`, defId: 'wax-drop' })
    }
    const lane = new Lane('lane-0', 0)
    const enemy = new Card('enemy-test', CardType.ENEMY, '양초 생쥐', 'mouse', 1, 1)
    character.damage = 10
    vi.spyOn(Math, 'random').mockReturnValue(0)

    const result = ActionSystem.executeAction(character, lane, enemy, ActionType.ATTACK_ENEMY)

    expect(result.cardRemoved).toBe(true)
    expect(result.itemGainedNames).toHaveLength(0)
    expect(result.overflow).toBeDefined()
    expect(result.overflow!.length).toBeGreaterThan(0)
  })
})
