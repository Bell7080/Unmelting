import { describe, expect, it } from 'vitest'
import { Card, CardType } from './Card'

/**
 * Regression tests for merged enemies, which previously recalculated their
 * grouped HP multiplier every time they were damaged and could heal upward.
 */
describe('Card enemy grouping health', () => {
  it('keeps a damaged two-lane enemy from gaining health on subsequent reads', () => {
    const left = new Card('left', CardType.ENEMY, '잉크 늑대', 'Attacks the player', 3, 1)
    const right = new Card('right', CardType.ENEMY, '잉크 늑대', 'Attacks the player', 3, 1)

    left.merge(right)
    expect(left.groupCount).toBe(2)
    expect(left.getHealth()).toBe(9)

    left.takeDamage(1)
    expect(left.getHealth()).toBe(8)
    expect(left.getHealth()).toBe(8)
  })

  it('keeps a damaged three-lane enemy from gaining health on subsequent reads', () => {
    const first = new Card('first', CardType.ENEMY, '그림자', 'Attacks the player', 2, 1)
    const second = new Card('second', CardType.ENEMY, '그림자', 'Attacks the player', 2, 1)
    const third = new Card('third', CardType.ENEMY, '그림자', 'Attacks the player', 2, 1)

    first.merge(second)
    first.merge(third)
    expect(first.groupCount).toBe(3)
    expect(first.getHealth()).toBe(12)

    first.takeDamage(1)
    expect(first.getHealth()).toBe(11)
    expect(first.getHealth()).toBe(11)
  })

  it('preserves damage already dealt when enemies merge later', () => {
    const wounded = new Card('wounded', CardType.ENEMY, '미믹', 'Was a treasure once', 4, 1)
    const fresh = new Card('fresh', CardType.ENEMY, '미믹', 'Was a treasure once', 4, 1)

    wounded.takeDamage(2)
    wounded.merge(fresh)

    expect(wounded.groupCount).toBe(2)
    expect(wounded.getHealth()).toBe(10)
  })
})
