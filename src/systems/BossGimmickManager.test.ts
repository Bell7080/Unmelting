import { describe, expect, it } from 'vitest'
import {
  BossGimmickManager,
  BOSS_GIMMICK_KIND_META,
  BOSS_GIMMICK_PROFILES,
} from './BossGimmickManager'

/** 셔플을 고정해 배치를 재현 가능하게 만든다(항상 0 → Fisher-Yates가 순서를 뒤집지 않음). */
function fixedRng(): () => number {
  return () => 0
}

describe('BossGimmickManager', () => {
  it('프로필이 있는 보스에서만 격자를 켠다', () => {
    const m = new BossGimmickManager(fixedRng())

    expect(m.beginEncounter('waxArmy')).toBe(true)
    expect(m.isActive).toBe(true)
    expect(m.cols).toBe(3)
    expect(m.rows).toBe(3)
    expect(m.getCells()).toHaveLength(9)

    // 프로필 없는 보스로 넘어가면 이전 격자를 물려받지 않고 꺼진다.
    expect(m.beginEncounter('waxKnight')).toBe(false)
    expect(m.isActive).toBe(false)
    expect(m.getCells()).toHaveLength(0)
  })

  it('배치표대로 특수 칸을 깔고 나머지는 평범한 칸으로 채운다', () => {
    const m = new BossGimmickManager(fixedRng())
    m.beginEncounter('waxArmy')

    const kinds = m.getCells().map((c) => c.kind)
    const profile = BOSS_GIMMICK_PROFILES.waxArmy
    for (const slot of profile?.slots ?? []) {
      expect(kinds.filter((k) => k === slot.kind), `${slot.kind} 칸 수`).toHaveLength(slot.count)
    }
    expect(kinds.filter((k) => k === 'plain')).toHaveLength(9 - 4)
  })

  it('약점 칸은 피해를 키우고 경화 칸은 줄인다', () => {
    const m = new BossGimmickManager(fixedRng())
    m.beginEncounter('waxArmy')
    const cells = m.getCells()
    const weak = cells.find((c) => c.kind === 'weak')
    const hardened = cells.find((c) => c.kind === 'hardened')
    const plain = cells.find((c) => c.kind === 'plain')
    expect(weak && hardened && plain).toBeTruthy()

    expect(m.strike({ cellIndex: weak?.index, baseDamage: 10 })?.damage)
      .toBe(10 * BOSS_GIMMICK_KIND_META.weak.multiplier)
    expect(m.strike({ cellIndex: hardened?.index, baseDamage: 10 })?.damage)
      .toBe(10 * BOSS_GIMMICK_KIND_META.hardened.multiplier)
    expect(m.strike({ cellIndex: plain?.index, baseDamage: 10 })?.damage).toBe(10)
  })

  it('경화 칸이라도 최소 1 피해는 남긴다 — 공격이 0으로 무의미해지지 않게', () => {
    const m = new BossGimmickManager(fixedRng())
    m.beginEncounter('waxArmy')
    const hardened = m.getCells().find((c) => c.kind === 'hardened')

    expect(m.strike({ cellIndex: hardened?.index, baseDamage: 1 })?.damage).toBe(1)
  })

  it('한 번 때린 칸은 드러난 채로 남고, 첫 타격에만 firstReveal이 선다', () => {
    const m = new BossGimmickManager(fixedRng())
    m.beginEncounter('waxArmy')

    expect(m.getCells().every((c) => !c.revealed)).toBe(true)
    expect(m.strike({ cellIndex: 0, baseDamage: 5 })?.firstReveal).toBe(true)
    expect(m.strike({ cellIndex: 0, baseDamage: 5 })?.firstReveal).toBe(false)
    expect(m.getCells()[0].revealed).toBe(true)
    expect(m.getCells().filter((c) => c.revealed)).toHaveLength(1)
  })

  it('칸 번호가 없거나 범위 밖이면 중앙 칸으로 접는다(키보드 조작 대비)', () => {
    const m = new BossGimmickManager(fixedRng())
    m.beginEncounter('waxArmy')

    expect(m.strike({ baseDamage: 5 })?.cell.index).toBe(4)
    expect(m.strike({ cellIndex: 99, baseDamage: 5 })?.cell.index).toBe(4)
    expect(m.strike({ cellIndex: -1, baseDamage: 5 })?.cell.index).toBe(4)
  })

  it('격자가 없으면 null을 돌려줘 호출부가 기존 피해를 그대로 쓰게 한다', () => {
    const m = new BossGimmickManager(fixedRng())
    expect(m.strike({ cellIndex: 0, baseDamage: 7 })).toBeNull()

    m.beginEncounter('waxArmy')
    m.reset()
    expect(m.isActive).toBe(false)
    expect(m.strike({ cellIndex: 0, baseDamage: 7 })).toBeNull()
  })

  it('조우마다 배치를 다시 굴린다', () => {
    // 주기가 없는 결정적 난수(LCG) — 두 번째 조우가 첫 번째 롤을 그대로 재생하지 않는다.
    let seed = 12345
    const m = new BossGimmickManager(() => {
      seed = (seed * 1103515245 + 12345) % 2147483648
      return seed / 2147483648
    })

    m.beginEncounter('waxArmy')
    const first = m.getCells().map((c) => c.kind).join(',')
    m.beginEncounter('waxArmy')
    const second = m.getCells().map((c) => c.kind).join(',')

    expect(first).not.toBe(second)
  })
})

describe('BossGimmickManager 광역/무작위 타격', () => {
  it('strikeAllCells는 칸마다 한 번씩, 각자의 배율로 때린다', () => {
    const m = new BossGimmickManager(fixedRng())
    m.beginEncounter('waxArmy')

    const strikes = m.strikeAllCells(10)

    expect(strikes).toHaveLength(9)
    // 약점 2칸 ×2, 경화 2칸 ×0.5, 나머지 5칸 ×1 = 20+20+5+5+10×5 = 100.
    const total = strikes.reduce((sum, s) => sum + s.damage, 0)
    expect(total).toBe(2 * 20 + 2 * 5 + 5 * 10)
    // 광역 한 방이면 격자 전체가 드러난다.
    expect(m.getCells().every((c) => c.revealed)).toBe(true)
  })

  it('strikeRandomCell은 격자 안의 칸만 고르고 그 칸을 드러낸다', () => {
    const m = new BossGimmickManager(fixedRng())
    m.beginEncounter('waxArmy')

    const struck = m.strikeRandomCell(4)

    expect(struck).not.toBeNull()
    expect(struck?.cell.index).toBeGreaterThanOrEqual(0)
    expect(struck?.cell.index).toBeLessThan(9)
    expect(m.getCells()[struck?.cell.index ?? 0].revealed).toBe(true)
  })

  it('격자가 없으면 광역/무작위 타격도 아무 일도 하지 않는다', () => {
    const m = new BossGimmickManager(fixedRng())
    expect(m.strikeAllCells(10)).toHaveLength(0)
    expect(m.strikeRandomCell(10)).toBeNull()
  })
})
