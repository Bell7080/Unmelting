import { describe, expect, it } from 'vitest'
import { Card, CardType } from '@entities/Card'
import { boardIntroKindOf } from './BoardIntroKind'

/** 실제 스폰과 같은 방식으로 카드를 만든다 — 기본값이 그대로 들어가는 것이 요점이다. */
const make = (type: CardType, options: ConstructorParameters<typeof Card>[6] = {}): Card =>
  new Card('c', type, '카드', '설명', 1, 1, options)

describe('boardIntroKindOf — 첫 조우 소개 종류 판별', () => {
  it('★ 함정이 아닌 카드가 거미줄로 분류되지 않는다', () => {
    // Card 생성자가 trapKind를 'web'으로 기본값 설정하므로(options.trapKind ?? 'web'),
    // 종류를 안 가리고 trapKind부터 물으면 이 카드들이 전부 '거미줄'이 된다.
    // 첫 판에 잡동사니를 보고 거미줄 설명이 나오던 실제 결함이다.
    expect(make(CardType.TREASURE, { treasureKind: 'junk' }).trapKind).toBe('web') // 기본값 확인
    expect(boardIntroKindOf(make(CardType.TREASURE, { treasureKind: 'junk' }))).toBe('junk')
    expect(boardIntroKindOf(make(CardType.TREASURE, { treasureKind: 'chest' }))).toBeNull()
    expect(boardIntroKindOf(make(CardType.FLOWER, { flowerKind: 'seed' }))).toBe('seed')
    expect(boardIntroKindOf(make(CardType.ENEMY))).toBeNull()
  })

  it('새싹 병아리 첫 판 3종을 각각 제 이름으로 가른다', () => {
    // 첫 판에는 바위·덤불·잡동사니만 깔린다 — 셋이 서로 섞이면 소개가 통째로 어긋난다.
    expect(boardIntroKindOf(make(CardType.ENEMY, { enemySpriteId: 'enemyRock' }))).toBe('rock')
    expect(boardIntroKindOf(make(CardType.TRAP, { trapKind: 'bush' }))).toBe('bush')
    expect(boardIntroKindOf(make(CardType.TREASURE, { treasureKind: 'junk' }))).toBe('junk')
  })

  it('진짜 함정은 종류별로 제대로 가른다', () => {
    expect(boardIntroKindOf(make(CardType.TRAP, { trapKind: 'web' }))).toBe('web')
    expect(boardIntroKindOf(make(CardType.TRAP, { trapKind: 'bomb' }))).toBe('bomb')
    expect(boardIntroKindOf(make(CardType.TRAP, { trapKind: 'spore' }))).toBe('spore')
  })

  it('특수 적·이벤트 문·별빛·꽃도 각자 소개 종류를 얻는다', () => {
    expect(boardIntroKindOf(make(CardType.ENEMY, { specialEnemyKind: 'mimic' }))).toBe('mimic')
    expect(boardIntroKindOf(make(CardType.ENEMY, { specialEnemyKind: 'monsterFlower' }))).toBe('monster-flower')
    expect(boardIntroKindOf(make(CardType.EVENT))).toBe('event-door')
    expect(boardIntroKindOf(make(CardType.TREASURE, { treasureKind: 'starlight' }))).toBe('starlight')
    expect(boardIntroKindOf(make(CardType.FLOWER, { flowerKind: 'redRose' }))).toBe('red-rose')
    expect(boardIntroKindOf(make(CardType.FLOWER, { flowerKind: 'chamomile' }))).toBe('chamomile')
  })
})
