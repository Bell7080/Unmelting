import { describe, it, expect } from 'vitest'
import { emptyLifetimeRecord, type LifetimeRecord } from './LifetimeRecord'
import {
  computePlayerLegacyBonus,
  LEGACY_LIGHT_PCT_CAP,
  LEGACY_STARTING_LIGHT_CAP,
  LEGACY_MAX_HEALTH_CAP,
  LEGACY_RUNS_ANCHOR,
} from './PlayerLegacy'

function record(overrides: Partial<LifetimeRecord>): LifetimeRecord {
  return { ...emptyLifetimeRecord(), ...overrides }
}

describe('computePlayerLegacyBonus', () => {
  it('런이 0회면 전부 0이다', () => {
    const bonus = computePlayerLegacyBonus(emptyLifetimeRecord())
    expect(bonus).toEqual({
      lightPct: 0, startingLight: 0, maxHealth: 0, emberMax: 0, handMax: 0, damage: 0,
      dominant: 'balanced', progress: 0,
    })
  })

  it('안전 축은 어떤 성향이든 캡을 넘지 않는다', () => {
    const saturated = record({ totalRuns: 10000, totalKills: 500000, clears: 10000, totalTraps: 50000, totalTreasures: 50000, totalLight: 50000000, totalFlowers: 50000 })
    const bonus = computePlayerLegacyBonus(saturated)
    expect(bonus.lightPct).toBeLessThanOrEqual(LEGACY_LIGHT_PCT_CAP + 1e-9)
    expect(bonus.startingLight).toBeLessThanOrEqual(LEGACY_STARTING_LIGHT_CAP)
    expect(bonus.maxHealth).toBeLessThanOrEqual(LEGACY_MAX_HEALTH_CAP)
  })

  it('진행도는 런 수가 늘수록 단조 증가하다가 1에서 포화한다', () => {
    const at = (runs: number) => computePlayerLegacyBonus(record({ totalRuns: runs, clears: Math.floor(runs / 2) })).progress
    expect(at(1)).toBeGreaterThan(0)
    expect(at(LEGACY_RUNS_ANCHOR)).toBeCloseTo(1, 5)
    expect(at(LEGACY_RUNS_ANCHOR * 4)).toBe(1)
    expect(at(5)).toBeLessThan(at(30))
    expect(at(30)).toBeLessThan(at(LEGACY_RUNS_ANCHOR))
  })

  it('처치 위주로 쌓으면 전투형으로 갈리고, 공격력 희귀 보너스는 극단적일 때만 붙는다', () => {
    const combatHeavy = record({ totalRuns: 200, totalKills: 200 * 30, clears: 20, totalTraps: 0, totalTreasures: 0, totalLight: 0, totalFlowers: 0 })
    const bonus = computePlayerLegacyBonus(combatHeavy)
    expect(bonus.dominant).toBe('combat')
    expect(bonus.damage).toBe(1)
    expect(bonus.emberMax).toBe(0)
    expect(bonus.handMax).toBe(0)
  })

  it('보물·불빛 위주로 쌓으면 수집형으로 갈린다', () => {
    const gatherHeavy = record({ totalRuns: 200, totalKills: 10, clears: 20, totalTraps: 0, totalTreasures: 200 * 20, totalLight: 200 * 50000, totalFlowers: 200 * 20 })
    const bonus = computePlayerLegacyBonus(gatherHeavy)
    expect(bonus.dominant).toBe('gathering')
  })

  it('덜 쌓았으면(진행도 낮음) 극단적 비중이어도 희귀 보너스는 나오지 않는다', () => {
    const earlyCombat = record({ totalRuns: 5, totalKills: 5 * 30, clears: 1 })
    const bonus = computePlayerLegacyBonus(earlyCombat)
    expect(bonus.damage).toBe(0)
    expect(bonus.emberMax).toBe(0)
    expect(bonus.handMax).toBe(0)
  })
})
