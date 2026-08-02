import { describe, expect, it } from 'vitest'
import {
  BossGimmickManager,
  BOSS_GIMMICK_BREAK_DAMAGE_RATIO,
  BOSS_GIMMICK_KIND_META,
  BOSS_GIMMICK_PROFILES,
  bossGimmickBreakBonusFactor,
  bossGimmickBreakDamage,
  bossGimmickCellDurability,
  bossGimmickExpectation,
  type BossGimmickCell,
  type BossGimmickResolvedContext,
} from './BossGimmickManager'
import type { SpecialEnemyKind } from '@entities/Card'

/** 셔플을 고정해 배치를 재현 가능하게 만든다(항상 0 → Fisher-Yates가 순서를 뒤집지 않음). */
function fixedRng(): () => number {
  return () => 0
}

/** 30F 양초 백작 기준 격자. 내구도/파괴 보너스가 최대 체력에서 파생되므로 함께 넘긴다. */
const WAX_ARMY_HP = 100

function stagedGrid(maxHp = WAX_ARMY_HP): BossGimmickManager {
  const m = new BossGimmickManager(fixedRng())
  m.beginEncounter('waxArmy', maxHp)
  return m
}

describe('BossGimmickManager', () => {
  it('프로필이 있는 보스에서만 격자를 켠다', () => {
    const m = new BossGimmickManager(fixedRng())

    expect(m.beginEncounter('waxArmy', WAX_ARMY_HP)).toBe(true)
    expect(m.isActive).toBe(true)
    expect(m.cols).toBe(3)
    expect(m.rows).toBe(3)
    expect(m.getCells()).toHaveLength(9)

    // 프로필 없는 적(보스가 아닌 특수 적)으로 넘어가면 이전 격자를 물려받지 않고 꺼진다.
    expect(m.beginEncounter('mimic', 80)).toBe(false)
    expect(m.isActive).toBe(false)
    expect(m.getCells()).toHaveLength(0)
  })

  it('모든 보스에 격자가 켜져 있고, 칸 수가 점유 행 수와 맞는다', () => {
    // "다른 보스들도 모두 약점 칸" — 새 보스를 추가하고 프로필을 빠뜨리면 여기서 잡힌다.
    const bosses: SpecialEnemyKind[] = ['waxArmy', 'waxCat', 'waxKnight', 'waxSculptor', 'waxWitch', 'waxDemon']
    for (const kind of bosses) {
      const profile = BOSS_GIMMICK_PROFILES[kind]
      expect(profile, `${kind} 프로필`).toBeTruthy()
      // 화면의 몸집과 판정 칸이 어긋나면 어디를 때리는지가 안 읽힌다 — 3×3 또는 2×3.
      expect([6, 9], `${kind} 칸 수`).toContain((profile?.cols ?? 0) * (profile?.rows ?? 0))
      // 특수 칸이 격자를 다 먹으면 평범한 칸이 사라져 선택이 없어진다.
      const special = (profile?.slots ?? []).reduce((n, slot) => n + slot.count, 0)
      expect(special, `${kind} 특수 칸 수`).toBeLessThan((profile?.cols ?? 0) * (profile?.rows ?? 0))
    }
  })

  it('격자를 줄이면 칸이 다시 굴려지고 내구도는 남은 체력에서 파생된다', () => {
    // 100F 마녀 3페이지: 3×3 몸이 2×3으로 접히면 판정 격자도 함께 접힌다.
    const m = new BossGimmickManager(fixedRng())
    m.beginEncounter('waxWitch', 300)
    m.strike({ cellIndex: 0, baseDamage: 20 })
    expect(m.getCells()[0].damage).toBeGreaterThan(0)

    expect(m.resize(3, 2, 100)).toBe(true)

    expect(m.cols).toBe(3)
    expect(m.rows).toBe(2)
    expect(m.getCells()).toHaveLength(6)
    // 몸이 바뀌었으니 부위도 새로 난다 — 누적 손상·파괴를 물려받지 않는다.
    expect(m.getCells().every((c) => c.damage === 0 && !c.broken)).toBe(true)
    // 내구도는 남은 체력 기준 — 최대 체력 기준이면 마지막 페이지에서 못 깬다.
    expect(m.cellDurability).toBe(bossGimmickCellDurability(100, 6))
    expect(m.breakDamage).toBe(bossGimmickBreakDamage(100))
    // 줄어든 격자에도 평범한 칸이 남아 선택이 성립한다.
    expect(m.getCells().some((c) => c.kind === 'plain')).toBe(true)
  })

  it('배치표대로 특수 칸을 깔고 나머지는 평범한 칸으로 채운다', () => {
    const kinds = stagedGrid().getCells().map((c) => c.kind)
    const profile = BOSS_GIMMICK_PROFILES.waxArmy
    for (const slot of profile?.slots ?? []) {
      expect(kinds.filter((k) => k === slot.kind), `${slot.kind} 칸 수`).toHaveLength(slot.count)
    }
    expect(kinds.filter((k) => k === 'plain')).toHaveLength(9 - 4)
  })

  it('약점 칸은 피해를 키우고 경화 칸은 줄인다', () => {
    const m = stagedGrid(10_000) // 내구도를 크게 잡아 한 대에 깨지지 않게 한다.
    const cells = m.getCells()
    const weak = cells.find((c) => c.kind === 'weak')
    const hardened = cells.find((c) => c.kind === 'hardened')
    const plain = cells.find((c) => c.kind === 'plain')
    expect(weak && hardened && plain).toBeTruthy()

    expect(m.strike({ cellIndex: weak?.index, baseDamage: 10 })?.cellDamage)
      .toBe(10 * BOSS_GIMMICK_KIND_META.weak.multiplier)
    expect(m.strike({ cellIndex: hardened?.index, baseDamage: 10 })?.cellDamage)
      .toBe(10 * BOSS_GIMMICK_KIND_META.hardened.multiplier)
    expect(m.strike({ cellIndex: plain?.index, baseDamage: 10 })?.cellDamage).toBe(10)
  })

  it('경화 칸이라도 최소 1 피해는 남긴다 — 공격이 0으로 무의미해지지 않게', () => {
    const m = stagedGrid()
    const hardened = m.getCells().find((c) => c.kind === 'hardened')

    expect(m.strike({ cellIndex: hardened?.index, baseDamage: 1 })?.cellDamage).toBe(1)
  })

  it('칸 번호가 없거나 범위 밖이면 중앙 칸으로 접는다(키보드 조작 대비)', () => {
    const m = stagedGrid(10_000)

    expect(m.strike({ baseDamage: 5 })?.cell.index).toBe(4)
    expect(m.strike({ cellIndex: 99, baseDamage: 5 })?.cell.index).toBe(4)
    expect(m.strike({ cellIndex: -1, baseDamage: 5 })?.cell.index).toBe(4)
  })

  it('격자가 없으면 null을 돌려줘 호출부가 기존 피해를 그대로 쓰게 한다', () => {
    const m = new BossGimmickManager(fixedRng())
    expect(m.strike({ cellIndex: 0, baseDamage: 7 })).toBeNull()

    m.beginEncounter('waxArmy', WAX_ARMY_HP)
    m.reset()
    expect(m.isActive).toBe(false)
    expect(m.strike({ cellIndex: 0, baseDamage: 7 })).toBeNull()
  })

  it('격자가 켜진 보스는 전부 학습 시뮬용 기대값을 낸다', () => {
    // 프로필만 늘리고 시뮬 요약을 빠뜨리면 학습이 실게임과 다른 보스를 배운다.
    for (const kind of Object.keys(BOSS_GIMMICK_PROFILES) as SpecialEnemyKind[]) {
      const expectation = bossGimmickExpectation(kind)
      expect(expectation, `${kind} 기대값`).not.toBeNull()
      expect(expectation?.cells).toBeGreaterThan(0)
      expect(expectation?.averageMultiplier).toBeGreaterThan(0)
    }
  })

  it('새싹 고양이 격자도 최대 체력에서 내구도를 파생한다', () => {
    const m = new BossGimmickManager(fixedRng())
    expect(m.beginEncounter('waxCat', 30)).toBe(true)
    expect(m.cellCount).toBe(9)
    expect(m.cellDurability).toBe(bossGimmickCellDurability(30, 9))
    expect(m.breakDamage).toBe(bossGimmickBreakDamage(30))
  })

  it('조우마다 배치를 다시 굴린다', () => {
    // 주기가 없는 결정적 난수(LCG) — 두 번째 조우가 첫 번째 롤을 그대로 재생하지 않는다.
    let seed = 12345
    const m = new BossGimmickManager(() => {
      seed = (seed * 1103515245 + 12345) % 2147483648
      return seed / 2147483648
    })

    m.beginEncounter('waxArmy', WAX_ARMY_HP)
    const first = m.getCells().map((c) => c.kind).join(',')
    m.beginEncounter('waxArmy', WAX_ARMY_HP)
    const second = m.getCells().map((c) => c.kind).join(',')

    expect(first).not.toBe(second)
  })
})

describe('BossGimmickManager 부위 파괴', () => {
  it('30F 기준 내구도·파괴 보너스는 최대 체력에서 파생된다', () => {
    const m = stagedGrid()
    // maxHp × (2/9 − 0.1) = 100 × 0.1222 ≈ 12, 보너스는 maxHp의 10%.
    expect(m.cellDurability).toBe(bossGimmickCellDurability(WAX_ARMY_HP, 9))
    expect(m.cellDurability).toBe(12)
    expect(m.breakDamage).toBe(bossGimmickBreakDamage(WAX_ARMY_HP))
    expect(m.breakDamage).toBe(10)
  })

  it('같은 칸을 계속 때리면 닳다가 깨지고, 깨진 타격에만 파괴 보너스가 붙는다', () => {
    const m = stagedGrid()
    const plain = m.getCells().find((c) => c.kind === 'plain')

    // 내구도 12 — 6+6으로 정확히 두 대 만에 깨진다.
    const first = m.strike({ cellIndex: plain?.index, baseDamage: 6 })
    expect(first?.broke).toBe(false)
    expect(first?.breakDamage).toBe(0)
    expect(first?.damage).toBe(6)
    expect(first?.cell.wear).toBeCloseTo(0.5, 5)

    const second = m.strike({ cellIndex: plain?.index, baseDamage: 6 })
    expect(second?.broke).toBe(true)
    expect(second?.breakDamage).toBe(10)
    // 호출부가 쓰는 damage는 배율 피해 + 파괴 보너스의 합이다.
    expect(second?.damage).toBe(16)
    expect(second?.cell.broken).toBe(true)
    expect(m.brokenCount).toBe(1)
  })

  it('약점 칸은 두 배로 빨리 깨진다 — 한 칸만 파먹지 못하게 하는 장치', () => {
    const m = stagedGrid()
    const weak = m.getCells().find((c) => c.kind === 'weak')
    const hardened = m.getCells().find((c) => c.kind === 'hardened')

    // 약점: 기본 6 → 12 누적으로 한 대에 파괴.
    expect(m.strike({ cellIndex: weak?.index, baseDamage: 6 })?.broke).toBe(true)
    // 경화: 같은 기본 6이 3만 쌓이므로 네 대가 필요하다.
    for (let i = 0; i < 3; i++) {
      expect(m.strike({ cellIndex: hardened?.index, baseDamage: 6 })?.broke).toBe(false)
    }
    expect(m.strike({ cellIndex: hardened?.index, baseDamage: 6 })?.broke).toBe(true)
  })

  it('깨진 칸은 다시 때려지지 않고 성한 칸으로 흘러간다', () => {
    const m = stagedGrid()
    const plain = m.getCells().find((c) => c.kind === 'plain')
    m.strike({ cellIndex: plain?.index, baseDamage: 999 })
    expect(m.getCells()[plain?.index ?? 0].broken).toBe(true)

    const redirected = m.strike({ cellIndex: plain?.index, baseDamage: 3 })
    expect(redirected?.cell.index).not.toBe(plain?.index)
    expect(redirected?.cell.broken).toBe(false)
  })

  it('칸을 절반쯤 깨면 보스를 쓰러뜨릴 만큼의 피해가 누적된다', () => {
    const m = stagedGrid()
    let total = 0
    let broken = 0
    // 약점부터가 아니라 배치 순서대로 — 평균적인 진행을 본다.
    for (const cell of m.getCells()) {
      while (!m.getCells()[cell.index].broken) {
        const struck = m.strike({ cellIndex: cell.index, baseDamage: 3 })
        total += struck?.damage ?? 0
      }
      broken += 1
      if (broken >= Math.ceil(9 / 2)) break
    }
    // 절반(5칸)을 깬 시점의 누적 피해가 30F 체력 100 언저리에 놓인다.
    expect(total).toBeGreaterThanOrEqual(WAX_ARMY_HP * 0.85)
    expect(total).toBeLessThanOrEqual(WAX_ARMY_HP * 1.35)
  })

  it('모든 칸이 깨지면 격자는 null/빈 배열을 돌려줘 기존 피해로 되돌아간다', () => {
    const m = stagedGrid()
    for (const cell of m.getCells()) m.strike({ cellIndex: cell.index, baseDamage: 999 })
    expect(m.brokenCount).toBe(9)

    expect(m.strike({ cellIndex: 0, baseDamage: 5 })).toBeNull()
    expect(m.strikeRandomCell(5)).toBeNull()
    expect(m.strikeAllCells(5)).toHaveLength(0)
  })

  it('타격 기록은 쌓였다가 takeHits 한 번에 비워진다', () => {
    const m = stagedGrid()
    m.strike({ cellIndex: 0, baseDamage: 3 })
    m.strike({ cellIndex: 1, baseDamage: 3 })

    expect(m.takeHits().map((h) => h.cell.index)).toEqual([0, 1])
    expect(m.takeHits()).toHaveLength(0)
  })
})

describe('BossGimmickManager 배율 리롤', () => {
  /** 주기가 없는 결정적 난수 — 리롤이 매번 같은 배치를 재생하지 않는지 볼 때 쓴다. */
  function lcgGrid(maxHp = WAX_ARMY_HP): BossGimmickManager {
    let seed = 987654321
    const m = new BossGimmickManager(() => {
      seed = (seed * 1103515245 + 12345) % 2147483648
      return seed / 2147483648
    })
    m.beginEncounter('waxArmy', maxHp)
    return m
  }

  it('리롤은 배율만 다시 굴리고 누적 손상·파괴 상태는 남긴다', () => {
    const m = lcgGrid()
    m.strike({ cellIndex: 0, baseDamage: 3 })
    const wornBefore = m.getCells()[0].damage
    expect(wornBefore).toBeGreaterThan(0)

    expect(m.rerollKinds()).toBe(true)

    // 손상은 그대로 남아 "마저 깨서 파괴 보너스를 받을지"라는 선택이 유지된다.
    expect(m.getCells()[0].damage).toBe(wornBefore)
    expect(m.brokenCount).toBe(0)
  })

  it('여러 번 굴리면 약점 자리가 실제로 옮겨 다닌다', () => {
    const m = lcgGrid(10_000)
    const first = m.getCells().map((c) => c.kind).join(',')
    const layouts = new Set([first])
    for (let i = 0; i < 5; i++) {
      m.rerollKinds()
      layouts.add(m.getCells().map((c) => c.kind).join(','))
    }
    expect(layouts.size).toBeGreaterThan(1)
  })

  it('깨진 칸은 후보에서 빠져 특수 칸 수가 성한 칸 수만큼으로 줄어든다', () => {
    const m = lcgGrid()
    // 여섯 칸을 깨서 성한 칸을 셋만 남긴다.
    for (let i = 0; i < 6; i++) m.strike({ cellIndex: i, baseDamage: 999 })
    expect(m.brokenCount).toBe(6)

    m.rerollKinds()

    const living = m.getCells().filter((c) => !c.broken)
    expect(living).toHaveLength(3)
    // 9칸 프로필의 특수 칸 4개를 남은 3칸에 그대로 얹지 않는다.
    expect(living.filter((c) => c.kind !== 'plain').length).toBeLessThanOrEqual(3)
  })

  it('성한 칸이 하나뿐이거나 격자가 없으면 굴리지 않는다', () => {
    const m = lcgGrid()
    for (let i = 0; i < 8; i++) m.strike({ cellIndex: i, baseDamage: 999 })
    expect(m.canReroll()).toBe(false)
    expect(m.rerollKinds()).toBe(false)

    const empty = new BossGimmickManager(fixedRng())
    expect(empty.canReroll()).toBe(false)
    expect(empty.rerollKinds()).toBe(false)
  })
})

describe('BossGimmickManager 광역/무작위 타격', () => {
  it('strikeAllCells는 성한 칸마다 한 번씩, 각자의 배율로 때린다', () => {
    const m = stagedGrid(10_000) // 내구도를 크게 잡아 파괴 보너스가 총합에 섞이지 않게 한다.

    const strikes = m.strikeAllCells(10)

    expect(strikes).toHaveLength(9)
    // 약점 2칸 ×2, 경화 2칸 ×0.5, 나머지 5칸 ×1 = 20+20+5+5+10×5 = 100.
    const total = strikes.reduce((sum, s) => sum + s.damage, 0)
    expect(total).toBe(2 * 20 + 2 * 5 + 5 * 10)
    // 칸마다 정확히 한 번씩, 인덱스 중복 없이 들어간다.
    expect(new Set(strikes.map((s) => s.cell.index)).size).toBe(9)
  })

  it('부위를 깨 나갈수록 광역기가 닿는 칸도 줄어든다', () => {
    const m = stagedGrid()
    const weak = m.getCells().find((c) => c.kind === 'weak')
    m.strike({ cellIndex: weak?.index, baseDamage: 999 })

    const strikes = m.strikeAllCells(1)

    expect(strikes).toHaveLength(8)
    expect(strikes.some((s) => s.cell.index === weak?.index)).toBe(false)
  })

  it('strikeRandomCell은 격자 안의 성한 칸만 고른다', () => {
    const m = stagedGrid(10_000)

    const struck = m.strikeRandomCell(4)

    expect(struck).not.toBeNull()
    expect(struck?.cell.index).toBeGreaterThanOrEqual(0)
    expect(struck?.cell.index).toBeLessThan(9)
    // 고른 칸의 종류가 실제 격자 배치와 일치한다.
    expect(struck?.cell.kind).toBe(m.getCells()[struck?.cell.index ?? 0].kind)
  })

  it('격자가 없으면 광역/무작위 타격도 아무 일도 하지 않는다', () => {
    const m = new BossGimmickManager(fixedRng())
    expect(m.strikeAllCells(10)).toHaveLength(0)
    expect(m.strikeRandomCell(10)).toBeNull()
  })
})

describe('BossGimmickManager 판정 컨텍스트 — 향후 기믹의 이음매', () => {
  /** resolveMultiplier에 실제로 무엇이 들어오는지 기록하는 관찰용 파생 클래스. */
  class SpyGrid extends BossGimmickManager {
    readonly seen: BossGimmickResolvedContext[] = []
    protected override resolveMultiplier(
      cell: BossGimmickCell,
      ctx: BossGimmickResolvedContext
    ): number {
      this.seen.push(ctx)
      return super.resolveMultiplier(cell, ctx)
    }
  }

  function spy(): SpyGrid {
    const m = new SpyGrid(fixedRng())
    m.beginEncounter('waxArmy', 10_000)
    return m
  }

  it('출처·태그·범위가 배율 판정까지 그대로 닿는다', () => {
    const m = spy()
    m.beginAction({ origin: 'hand', tags: ['flame'] })

    m.strike({ cellIndex: 0, baseDamage: 3 })
    m.strikeAllCells(2)

    expect(m.seen[0].origin).toBe('hand')
    expect(m.seen[0].tags).toEqual(['flame'])
    expect(m.seen[0].scope).toBe('single')
    // 광역 타격은 칸마다 scope 'area'로 들어온다 — 광역 감쇠/반사 기믹의 판정 근거다.
    expect(m.seen.slice(1).every((ctx) => ctx.scope === 'area')).toBe(true)
  })

  it('출처를 선언하지 않은 경로는 other로 남아 조건부 보정을 타지 않는다', () => {
    const m = spy()
    m.strike({ cellIndex: 0, baseDamage: 3 })

    expect(m.seen[0].origin).toBe('other')
    expect(m.seen[0].tags).toEqual([])
  })

  it('조우가 새로 시작되면 이전 행동의 출처가 남지 않는다', () => {
    const m = spy()
    m.beginAction({ origin: 'hand', tags: ['flame'] })
    m.beginEncounter('waxArmy', 10_000)

    m.strike({ cellIndex: 0, baseDamage: 3 })

    expect(m.seen.at(-1)?.origin).toBe('other')
  })

  it('칸 종류마다 연출 톤이 정해져 있다 — 렌더러가 종류로 분기하지 않게', () => {
    for (const meta of Object.values(BOSS_GIMMICK_KIND_META)) {
      expect(['hot', 'cold', 'neutral']).toContain(meta.tone)
    }
  })
})

describe('bossGimmickExpectation — 칸 개념이 없는 학습 시뮬용 요약', () => {
  it('파괴 보너스를 누적 배수로 환산해 함께 넘긴다', () => {
    const expectation = bossGimmickExpectation('waxArmy')
    expect(expectation?.breakBonusFactor).toBeCloseTo(bossGimmickBreakBonusFactor(9), 10)
  })

  it('환산 배수가 실제 모델의 누적 피해와 어긋나지 않는다', () => {
    // 근사가 불가피한 자리라 정합 테스트를 함께 둔다(CLAUDE.md 경제·스폰 규칙).
    const m = stagedGrid()
    const plain = m.getCells().find((c) => c.kind === 'plain')
    let cellDamageTotal = 0
    let bossDamageTotal = 0
    while (!m.getCells()[plain?.index ?? 0].broken) {
      const struck = m.strike({ cellIndex: plain?.index, baseDamage: 1 })
      cellDamageTotal += struck?.cellDamage ?? 0
      bossDamageTotal += struck?.damage ?? 0
    }
    const actual = bossDamageTotal / cellDamageTotal
    // 내구도 반올림(12.22 → 12) 만큼의 오차만 허용한다.
    expect(actual).toBeCloseTo(bossGimmickBreakBonusFactor(9), 1)
  })

  it('파괴 보너스 비율이 배수 식과 같은 상수를 쓴다', () => {
    // 비율을 한쪽만 고치면 시뮬과 런타임이 조용히 어긋난다.
    const durability = bossGimmickCellDurability(WAX_ARMY_HP, 9)
    const bonus = Math.round(WAX_ARMY_HP * BOSS_GIMMICK_BREAK_DAMAGE_RATIO)
    expect(bossGimmickBreakDamage(WAX_ARMY_HP)).toBe(bonus)
    expect((durability + bonus) / durability).toBeCloseTo(bossGimmickBreakBonusFactor(9), 1)
  })
})
