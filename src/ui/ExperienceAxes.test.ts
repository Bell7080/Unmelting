import { describe, expect, it } from 'vitest'
import { EXPERIENCE_AXIS_DISPLAY_REMAP, experienceAxes } from '@ui/ExperienceAxes'
import { BASE_DISPOSITION, ROOKIE_DISPOSITION, cloneDisposition } from '@systems/EnaDisposition'
import type { EnaDisposition } from '@systems/EnaDisposition'

// 경험 탭 개입 축 표기 리매핑이 "표시 전용"임을 보장한다 — 실제 성향(동작값)은 절대 변하면 안 된다.
const INTERVENTION_AXES = [
  { key: '예지', end: EXPERIENCE_AXIS_DISPLAY_REMAP.end.predict },
  { key: '수호', end: EXPERIENCE_AXIS_DISPLAY_REMAP.end.protection },
  { key: '온정', end: EXPERIENCE_AXIS_DISPLAY_REMAP.end.minor },
  { key: '불굴', end: EXPERIENCE_AXIS_DISPLAY_REMAP.end.grit },
] as const

function axisValue(disp: EnaDisposition, key: string): number {
  return experienceAxes(disp).find((a) => a.key === key)!.value
}

/** 리매핑 축이 쓰는 동작값 노브만 ROOKIE→BASE로 t만큼 보간한 "성장 중간" 성향. */
function grownDisposition(t: number): EnaDisposition {
  const d = cloneDisposition(ROOKIE_DISPOSITION)
  const lerp = (from: number, to: number) => from + (to - from) * t
  d.predictBaseChance = lerp(d.predictBaseChance, BASE_DISPOSITION.predictBaseChance)
  d.clutchStrength = lerp(d.clutchStrength, BASE_DISPOSITION.clutchStrength)
  d.willGainPerDamage = lerp(d.willGainPerDamage, BASE_DISPOSITION.willGainPerDamage)
  d.clutchHpThreshold = lerp(d.clutchHpThreshold, BASE_DISPOSITION.clutchHpThreshold)
  d.awakenChance = lerp(d.awakenChance, BASE_DISPOSITION.awakenChance)
  d.clutchAdversityBoost = lerp(d.clutchAdversityBoost, BASE_DISPOSITION.clutchAdversityBoost)
  d.bondClimaxChance = lerp(d.bondClimaxChance, BASE_DISPOSITION.bondClimaxChance)
  for (const k of Object.keys(d.minorClutchChance) as (keyof typeof d.minorClutchChance)[]) {
    d.minorClutchChance[k] = lerp(d.minorClutchChance[k], BASE_DISPOSITION.minorClutchChance[k])
  }
  return d
}

describe('ExperienceAxes', () => {
  it('축 계산이 입력 성향(동작값)을 변형하지 않는다', () => {
    for (const source of [ROOKIE_DISPOSITION, BASE_DISPOSITION]) {
      const disp = cloneDisposition(source)
      const before = JSON.stringify(disp)
      experienceAxes(disp)
      expect(JSON.stringify(disp)).toBe(before)
      // 특히 예지 동작값은 리매핑과 무관하게 원시값 그대로 남아야 한다.
      expect(disp.predictBaseChance).toBe(source.predictBaseChance)
    }
  })

  it('신규(ROOKIE 앵커) 성향의 개입 축 표시값이 13~17% 대역에서 시작한다', () => {
    const disp = cloneDisposition(ROOKIE_DISPOSITION)
    for (const { key } of INTERVENTION_AXES) {
      const v = axisValue(disp, key)
      expect(v, key).toBeGreaterThanOrEqual(0.13)
      expect(v, key).toBeLessThanOrEqual(0.17)
    }
  })

  it('성장 완료(BASE 앵커) 성향의 개입 축 표시값이 축별 END에 도달한다', () => {
    const disp = cloneDisposition(BASE_DISPOSITION)
    for (const { key, end } of INTERVENTION_AXES) {
      expect(axisValue(disp, key), key).toBeCloseTo(end, 10)
    }
  })

  it('중간 성장 성향의 표시값은 ROOKIE보다 크고 BASE보다 작다(단조 증가)', () => {
    const rookie = cloneDisposition(ROOKIE_DISPOSITION)
    const mid = grownDisposition(0.5)
    const base = cloneDisposition(BASE_DISPOSITION)
    for (const { key } of INTERVENTION_AXES) {
      expect(axisValue(mid, key), key).toBeGreaterThan(axisValue(rookie, key))
      expect(axisValue(mid, key), key).toBeLessThan(axisValue(base, key))
    }
  })

  it('수다 축은 리매핑 없이 원시 정규화 표기를 유지한다', () => {
    const disp = cloneDisposition(BASE_DISPOSITION)
    const sc = disp.situationChance
    const chat = (sc.hit + sc.web + sc.treasure + sc.kill + sc.survive + sc.flower + sc.event + sc.spore + sc.bomb) / 9
    const expected = Math.max(0, Math.min(1, (chat - 0.12) / (0.62 - 0.12)))
    expect(axisValue(disp, '수다')).toBeCloseTo(expected, 10)
  })
})
