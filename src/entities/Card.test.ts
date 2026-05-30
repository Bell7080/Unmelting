import { describe, expect, it } from 'vitest'
import { Card, CardType } from './Card'

/**
 * Regression tests for merged enemies, which now sum member strength plus
 * lane-width bonuses while preserving damage already dealt before later merges.
 */
describe('Card enemy grouping health', () => {
  it('turns two normal enemies into a member-scaled 2-lane group', () => {
    const left = new Card('left', CardType.ENEMY, '양초 생쥐', 'Small candle mouse', 2, 1)
    const right = new Card('right', CardType.ENEMY, '양초 개구리', 'Leaping candle frog', 1, 2)

    left.merge(right)
    expect(left.name).toBe('양초 무리')
    expect(left.groupCount).toBe(2)
    expect(left.getHealth()).toBe(5)
    expect(left.getDamage()).toBe(5)

    left.takeDamage(1)
    expect(left.getHealth()).toBe(4)
    expect(left.getHealth()).toBe(4)
  })

  it('turns three normal enemies into a member-scaled 3-lane group', () => {
    const first = new Card('first', CardType.ENEMY, '양초 생쥐', 'Small candle mouse', 2, 1)
    const second = new Card('second', CardType.ENEMY, '양초 개구리', 'Leaping candle frog', 1, 2)
    const third = new Card('third', CardType.ENEMY, '양초 생쥐', 'Small candle mouse', 2, 1)

    first.merge(second)
    first.merge(third)
    expect(first.name).toBe('양초 군단')
    expect(first.groupCount).toBe(3)
    expect(first.getHealth()).toBe(8)
    expect(first.getDamage()).toBe(7)

    first.takeDamage(1)
    expect(first.getHealth()).toBe(7)
    expect(first.getHealth()).toBe(7)
  })

  it('preserves damage already dealt when enemies merge later', () => {
    const wounded = new Card('wounded', CardType.ENEMY, '양초 생쥐', 'Small candle mouse', 2, 1)
    const fresh = new Card('fresh', CardType.ENEMY, '양초 개구리', 'Leaping candle frog', 1, 2)

    wounded.takeDamage(1)
    wounded.merge(fresh)

    expect(wounded.groupCount).toBe(2)
    expect(wounded.getHealth()).toBe(4)
  })

  it('keeps flowers single-cell while monster flowers merge only with each other', () => {
    const flowerA = new Card('flower-a', CardType.FLOWER, '씨앗', 'seed', 0, 0, {
      flowerKind: 'seed',
    })
    const flowerB = new Card('flower-b', CardType.FLOWER, '씨앗', 'seed', 0, 0, {
      flowerKind: 'seed',
    })
    const monsterA = new Card('monster-a', CardType.ENEMY, '괴물꽃', 'wilted', 2, 2, {
      isSpecialEnemy: true,
      specialEnemyKind: 'monsterFlower',
    })
    const monsterB = new Card('monster-b', CardType.ENEMY, '괴물꽃', 'wilted', 3, 3, {
      isSpecialEnemy: true,
      specialEnemyKind: 'monsterFlower',
    })
    const normal = new Card('normal', CardType.ENEMY, '양초 생쥐', 'normal', 2, 1)

    flowerA.merge(flowerB)
    expect(flowerA.groupCount).toBe(1)
    normal.merge(monsterA)
    expect(normal.groupCount).toBe(1)
    monsterA.merge(monsterB)
    expect(monsterA.groupCount).toBe(2)
    expect(monsterA.getHealth()).toBe(5)
    expect(monsterA.getDamage()).toBe(5)
  })


  it('heals enemy-like cards without exceeding their max HP', () => {
    const boss = new Card('boss', CardType.BOSS, '레온하르트', 'Wax knight', 55, 2, {
      specialEnemyKind: 'waxKnight',
    })

    boss.takeDamage(5)

    // Boss card healing uses the same capped HP pool as enemies so HP bars stay stable.
    expect(boss.healEnemyLike(2)).toBe(2)
    expect(boss.getHealth()).toBe(52)
    expect(boss.healEnemyLike(99)).toBe(3)
    expect(boss.getHealth()).toBe(55)
  })

  it('keeps special mimic enemies from merging with normal enemies', () => {
    const enemy = new Card('enemy', CardType.ENEMY, '양초 생쥐', 'Small candle mouse', 2, 1)
    const mimic = new Card('mimic', CardType.ENEMY, '미믹', 'Was a treasure once', 1, 1, {
      isSpecialEnemy: true,
      defeatDropCount: 1,
    })

    enemy.merge(mimic)

    expect(enemy.groupCount).toBe(1)
    expect(enemy.getHealth()).toBe(2)
  })
})

describe('Card grouped traps and treasures', () => {
  it('uses requested trap damage by width', () => {
    const first = new Card('trap-1', CardType.TRAP, '양초 거미줄', 'Deals 2 damage', 0, 2)
    const second = new Card('trap-2', CardType.TRAP, '양초 거미줄', 'Deals 2 damage', 0, 2)
    const third = new Card('trap-3', CardType.TRAP, '양초 거미줄', 'Deals 2 damage', 0, 2)

    expect(first.getTrapDamagePenalty()).toBe(2)
    first.merge(second)
    expect(first.name).toBe('촛농 거미집')
    expect(first.getTrapDamagePenalty()).toBe(5)
    first.merge(third)
    expect(first.name).toBe('밀랍 거미굴')
    expect(first.getTrapDamagePenalty()).toBe(999)
  })

  it('keeps bombs unmerged and spores on 1/3/5 damage', () => {
    const bomb = new Card('bomb', CardType.TRAP, '양초 폭탄', 'test', 0, 0, { trapKind: 'bomb' })
    const web = new Card('web', CardType.TRAP, '양초 거미줄', 'test', 0, 2)
    const sporeA = new Card('spore-a', CardType.TRAP, '감염 포자', 'test', 0, 1, {
      trapKind: 'spore',
    })
    const sporeB = new Card('spore-b', CardType.TRAP, '감염 포자', 'test', 0, 1, {
      trapKind: 'spore',
    })

    bomb.merge(web)
    expect(bomb.groupCount).toBe(1)
    expect(bomb.getTrapDamagePenalty()).toBe(0)

    sporeA.merge(sporeB)
    expect(sporeA.groupCount).toBe(2)
    expect(sporeA.getTrapDamagePenalty()).toBe(3)
  })
})
