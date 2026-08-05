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

  // 처치 보상은 0~defeatDropCount 균등 굴림이다(카드에 적힌 '0~N장'과 같은 분포).
  const defeatMimic = (roll: number): ReturnType<typeof ActionSystem.executeAction> => {
    const character = new Character()
    const lane = new Lane('lane-0', 0)
    const mimic = new Card('mimic-test', CardType.ENEMY, '미믹', 'Was a 2-lane treasure once', 10, 5, {
      isSpecialEnemy: true,
      defeatDropCount: 5,
    })
    // Give enough damage to defeat the wider mimic in one deterministic strike.
    character.damage = 10
    mimic.groupCount = 2
    vi.spyOn(Math, 'random').mockReturnValue(roll)
    return ActionSystem.executeAction(character, lane, mimic, ActionType.ATTACK_ENEMY)
  }

  it('drops the range minimum (0) from a two-lane mimic when the roll bottoms out', () => {
    const result = defeatMimic(0)
    expect(result.cardRemoved).toBe(true)
    expect(result.itemGainedNames).toHaveLength(0)
    expect(result.message).toContain('전리품 없음')
  })

  it('drops the range maximum (5) from a two-lane mimic when the roll tops out', () => {
    const result = defeatMimic(0.999)
    expect(result.cardRemoved).toBe(true)
    expect(result.itemGainedNames).toHaveLength(5)
  })

  it('drops the span-3 range minimum from a three-lane treasure chest', () => {
    const character = new Character()
    const lane = new Lane('lane-0', 0)
    const treasure = new Card('treasure-test', CardType.TREASURE, '큰 상자', '3 item reward chest')
    // 보물 드랍은 폭별 [min,max] 범위 랜덤(3칸 = 3~6장). Math.random=0이면 최소치 3장.
    treasure.groupCount = 3
    vi.spyOn(Math, 'random').mockReturnValue(0)

    const result = ActionSystem.executeAction(character, lane, treasure, ActionType.TAKE_TREASURE)

    expect(result.cardRemoved).toBe(true)
    expect(result.itemGainedNames).toHaveLength(3)
    expect(character.hand).toHaveLength(3)
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
    // 0~1 굴림에서 실제로 1장이 나와야 넘침이 성립한다 — 0이 나오면 줄 것 자체가 없다.
    vi.spyOn(Math, 'random').mockReturnValue(0.999)

    const result = ActionSystem.executeAction(character, lane, enemy, ActionType.ATTACK_ENEMY)

    expect(result.cardRemoved).toBe(true)
    expect(result.itemGainedNames).toHaveLength(0)
    expect(result.overflow).toBeDefined()
    expect(result.overflow!.length).toBeGreaterThan(0)
  })
})

/**
 * 덤불 1칸은 0을 굴릴 수 있다. 0이 곱셈이 아니라 덧셈의 밑값이어야 시련 '역경'·유물
 * (character.trapDamageBonus)의 상승이 그대로 얹힌다 — 0에 갇히면 축이 통째로 죽는다.
 */
describe('ActionSystem 덤불 함정', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  const stepBush = (roll: 0 | 1, trapDamageBonus: number) => {
    const character = new Character()
    character.trapDamageBonus = trapDamageBonus
    const lane = new Lane('lane-0', 0)
    const bush = new Card('bush-test', CardType.TRAP, '덤불', 'bush', 0, 1, { trapKind: 'bush' })
    bush.bushDamageRoll = roll
    return ActionSystem.executeAction(character, lane, bush, ActionType.EVADE_TRAP)
  }

  it('0을 굴려도 시련·유물의 함정 피해 보너스는 그대로 더해진다', () => {
    expect(stepBush(0, 0).damageTaken).toBe(0)
    expect(stepBush(0, 2).damageTaken).toBe(2)
    expect(stepBush(1, 2).damageTaken).toBe(3)
  })

  it('피해가 0이면 (-0) 대신 문구로 말한다', () => {
    expect(stepBush(0, 0).message).toContain('피해 없음')
    expect(stepBush(1, 0).message).toContain('-1')
  })
})
