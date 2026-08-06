import { describe, expect, it } from 'vitest'
import { Card, CardType } from './Card'

/**
 * Regression tests for merged enemies, which now sum member strength plus
 * lane-width bonuses while preserving damage already dealt before later merges.
 */
describe('Card wax 굳음 stacking', () => {
  it('밀랍을 여러 번 쓰면 굳음 턴이 누적된다(상한 9)', () => {
    const enemy = new Card('e', CardType.ENEMY, '양초 거미', 'spider', 3, 1)
    enemy.freeze(2)
    expect(enemy.frozenTurns).toBe(2)
    enemy.freeze(3)
    expect(enemy.frozenTurns).toBe(5) // 누적(기존 max 동작이면 3에서 멈췄을 것)
    enemy.freeze(9)
    expect(enemy.frozenTurns).toBe(9) // 상한 9
  })

  it('tickFrozen은 1턴씩 줄이고 0에서 비활성', () => {
    const enemy = new Card('e', CardType.ENEMY, '양초 거미', 'spider', 3, 1)
    enemy.freeze(2)
    expect(enemy.tickFrozen()).toBe(true)
    expect(enemy.frozenTurns).toBe(1)
    expect(enemy.tickFrozen()).toBe(false)
    expect(enemy.isFrozen()).toBe(false)
  })
})

describe('Card enemy grouping health', () => {
  it('turns two normal enemies into a member-scaled 2-lane group', () => {
    const left = new Card('left', CardType.ENEMY, '양초 생쥐', 'Small candle mouse', 2, 1)
    const right = new Card('right', CardType.ENEMY, '양초 개구리', 'Leaping candle frog', 1, 2)

    left.merge(right)
    expect(left.name).toBe('양초 무리')
    expect(left.groupCount).toBe(2)
    expect(left.getHealth()).toBe(4)
    expect(left.getDamage()).toBe(4)

    left.takeDamage(1)
    expect(left.getHealth()).toBe(3)
    expect(left.getHealth()).toBe(3)
  })

  it('turns three normal enemies into a member-scaled 3-lane group', () => {
    const first = new Card('first', CardType.ENEMY, '양초 생쥐', 'Small candle mouse', 2, 1)
    const second = new Card('second', CardType.ENEMY, '양초 개구리', 'Leaping candle frog', 1, 2)
    const third = new Card('third', CardType.ENEMY, '양초 생쥐', 'Small candle mouse', 2, 1)

    first.merge(second)
    first.merge(third)
    expect(first.name).toBe('양초 군단')
    expect(first.groupCount).toBe(3)
    expect(first.getHealth()).toBe(7)
    expect(first.getDamage()).toBe(6)

    first.takeDamage(1)
    expect(first.getHealth()).toBe(6)
    expect(first.getHealth()).toBe(6)
  })

  it('preserves damage already dealt when enemies merge later', () => {
    const wounded = new Card('wounded', CardType.ENEMY, '양초 생쥐', 'Small candle mouse', 2, 1)
    const fresh = new Card('fresh', CardType.ENEMY, '양초 개구리', 'Leaping candle frog', 1, 2)

    wounded.takeDamage(1)
    wounded.merge(fresh)

    expect(wounded.groupCount).toBe(2)
    expect(wounded.getHealth()).toBe(3)
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
    expect(monsterA.getDamage()).toBe(6) // 30층 전 2칸 합체 보너스는 +1이다.
  })

  it('doubles 2/3-lane merge bonuses after each 30-floor boss milestone', () => {
    // 멤버 합계가 2/2인 동일 적으로 폭 보너스만 분리해 0/30/60/90층 표를 고정한다.
    const mergeAt = (turn: number, width: 2 | 3): Card => {
      const cards = Array.from({ length: width }, (_, index) =>
        new Card(`milestone-${turn}-${index}`, CardType.ENEMY, '양초 생쥐', 'test', 1, 1))
      cards.slice(1).forEach((card) => cards[0].merge(card, turn))
      return cards[0]
    }

    expect([0, 30, 60, 90].map((turn) => mergeAt(turn, 2).getHealth())).toEqual([3, 4, 6, 10])
    expect([0, 30, 60, 90].map((turn) => mergeAt(turn, 3).getDamage())).toEqual([5, 7, 11, 19])
  })


  it('heals enemy-like cards without exceeding their max HP', () => {
    const boss = new Card('boss', CardType.BOSS, '불씨 기사단장', 'Wax knight', 80, 7, {
      specialEnemyKind: 'waxKnight',
    })

    boss.takeDamage(5)

    // Boss card healing uses the same capped HP pool as enemies so HP bars stay stable.
    expect(boss.healEnemyLike(2)).toBe(2)
    expect(boss.getHealth()).toBe(77)
    expect(boss.healEnemyLike(99)).toBe(3)
    expect(boss.getHealth()).toBe(80)
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

describe('Card trial enemy stat bonus (retroactive)', () => {
  it('adds the trial bonus to a single field enemy like a fresh spawn', () => {
    const enemy = new Card('enemy', CardType.ENEMY, '양초 생쥐', 'normal', 2, 1)

    enemy.applyTrialEnemyStatBonus(1, 2)

    expect(enemy.getDamage()).toBe(2) // 1 + 1
    expect(enemy.getHealth()).toBe(4) // 2 + 2
  })

  it('preserves damage already dealt when buffing HP', () => {
    const enemy = new Card('enemy', CardType.ENEMY, '양초 생쥐', 'normal', 2, 1)
    enemy.takeDamage(1)

    enemy.applyTrialEnemyStatBonus(0, 2)

    // max HP 2→4, but the 1 damage already taken stays → 3/4
    expect(enemy.getHealth()).toBe(3)
    expect(enemy.getDamage()).toBe(1)
  })

  it('scales the bonus by group size so a merged colony matches per-member spawns', () => {
    const left = new Card('left', CardType.ENEMY, '양초 생쥐', 'normal', 2, 1)
    const right = new Card('right', CardType.ENEMY, '양초 개구리', 'normal', 1, 2)
    left.merge(right) // 2-group: HP 4 / DMG 4

    left.applyTrialEnemyStatBonus(1, 1) // ×groupCount(2) → +2/+2

    expect(left.getHealth()).toBe(6)
    expect(left.getDamage()).toBe(6)
  })

  it('ignores special enemies and bosses', () => {
    const mimic = new Card('mimic', CardType.ENEMY, '미믹', 'test', 3, 2, {
      isSpecialEnemy: true,
      defeatDropCount: 1,
    })

    mimic.applyTrialEnemyStatBonus(5, 5)

    expect(mimic.getHealth()).toBe(3)
    expect(mimic.getDamage()).toBe(2)
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

  it('온보딩 덤불은 1칸 0~1 · 2칸 2~3 · 3칸 5로 오른다 — 값은 밟는 순간(호출 시점)에 굴린다', () => {
    const makeBush = (id: string) =>
      new Card(id, CardType.TRAP, '덤불', 'bush', 0, 1, { trapKind: 'bush' })
    const bush = makeBush('bush-1')
    // 잡동사니(보물)와 같은 패턴 — 카드에 값을 굽지 않고 호출마다 새로 굴린다.
    // 여러 번 불러 범위 안에서만 나오는지 확인한다(고정값이 아님을 함께 증명).
    const rolls1 = Array.from({ length: 40 }, () => bush.getTrapDamagePenalty())
    expect(rolls1.every((v) => v === 0 || v === 1)).toBe(true)
    expect(new Set(rolls1).size).toBeGreaterThan(1)

    bush.merge(makeBush('bush-2'))
    expect(bush.name).toBe('적당한 덤불')
    const rolls2 = Array.from({ length: 40 }, () => bush.getTrapDamagePenalty())
    expect(rolls2.every((v) => v === 2 || v === 3)).toBe(true)
    expect(new Set(rolls2).size).toBeGreaterThan(1)
    // 표기 문구는 확정 수치가 아니라 범위다 — 여기서 굳히면 실제 피해와 갈린다.
    expect(bush.description).toBe('Deals 2~3 damage brush')

    bush.merge(makeBush('bush-3'))
    expect(bush.name).toBe('큰 덤불')
    expect(bush.getTrapDamagePenalty()).toBe(5)
    expect(bush.description).toBe('Deals 5 damage brush')
  })
})

describe('온보딩 바위', () => {
  it('칸수만큼 선형으로 커진다(1/1 → 2/2 → 3/3)', () => {
    const makeRock = (id: string) =>
      new Card(id, CardType.ENEMY, '바위', 'rock', 1, 1, { enemySpriteId: 'enemyRock', enemyPower: 0 })
    const rock = makeRock('rock-1')
    expect(rock.getHealth()).toBe(1)
    expect(rock.getDamage()).toBe(1)

    rock.merge(makeRock('rock-2'))
    expect(rock.name).toBe('적당한 바위')
    expect(rock.getHealth()).toBe(2)
    expect(rock.getDamage()).toBe(2)

    rock.merge(makeRock('rock-3'))
    expect(rock.name).toBe('큰 바위')
    expect(rock.getHealth()).toBe(3)
    expect(rock.getDamage()).toBe(3)
  })
})
