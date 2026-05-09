import { describe, expect, it } from 'vitest'
import { Card, CardType } from './Card'

/**
 * Regression tests for merged enemies, which now use exact requested 2/3-lane
 * stats while still preserving damage already dealt before later merges.
 */
describe('Card enemy grouping health', () => {
  it('turns two normal enemies into 성냥 무리 with fixed 3 attack and 5 HP', () => {
    const left = new Card('left', CardType.ENEMY, '양초 생쥐', 'Small candle mouse', 2, 1)
    const right = new Card('right', CardType.ENEMY, '양초 개구리', 'Leaping candle frog', 1, 2)

    left.merge(right)
    expect(left.name).toBe('성냥 무리')
    expect(left.groupCount).toBe(2)
    expect(left.getHealth()).toBe(5)
    expect(left.getDamage()).toBe(3)

    left.takeDamage(1)
    expect(left.getHealth()).toBe(4)
    expect(left.getHealth()).toBe(4)
  })

  it('turns three normal enemies into 밀랍 군단 with fixed 5 attack and 10 HP', () => {
    const first = new Card('first', CardType.ENEMY, '양초 생쥐', 'Small candle mouse', 2, 1)
    const second = new Card('second', CardType.ENEMY, '양초 개구리', 'Leaping candle frog', 1, 2)
    const third = new Card('third', CardType.ENEMY, '양초 생쥐', 'Small candle mouse', 2, 1)

    first.merge(second)
    first.merge(third)
    expect(first.name).toBe('밀랍 군단')
    expect(first.groupCount).toBe(3)
    expect(first.getHealth()).toBe(10)
    expect(first.getDamage()).toBe(5)

    first.takeDamage(1)
    expect(first.getHealth()).toBe(9)
    expect(first.getHealth()).toBe(9)
  })

  it('preserves damage already dealt when enemies merge later', () => {
    const wounded = new Card('wounded', CardType.ENEMY, '양초 생쥐', 'Small candle mouse', 2, 1)
    const fresh = new Card('fresh', CardType.ENEMY, '양초 개구리', 'Leaping candle frog', 1, 2)

    wounded.takeDamage(1)
    wounded.merge(fresh)

    expect(wounded.groupCount).toBe(2)
    expect(wounded.getHealth()).toBe(4)
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
})
