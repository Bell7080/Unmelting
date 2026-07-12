import { describe, expect, it } from 'vitest'
import { EXPERIENCE_AXIS_DISPLAY_SCALE, experienceAxes } from '@ui/ExperienceAxes'
import { BASE_DISPOSITION, cloneDisposition } from '@systems/EnaDisposition'

// 경험 탭 축 표기 감쇠가 "표시 전용"임을 보장한다 — 실제 성향(동작값)은 절대 변하면 안 된다.
describe('ExperienceAxes', () => {
  it('축 계산이 입력 성향(동작값)을 변형하지 않는다', () => {
    const disp = cloneDisposition(BASE_DISPOSITION)
    const before = JSON.stringify(disp)
    experienceAxes(disp)
    expect(JSON.stringify(disp)).toBe(before)
    // 특히 예지 동작값은 감쇠 없이 원시값 그대로 남아야 한다.
    expect(disp.predictBaseChance).toBe(BASE_DISPOSITION.predictBaseChance)
  })

  it('예지 축 표시값 = 정규화 원시값 × 표기 감쇠 계수', () => {
    const disp = cloneDisposition(BASE_DISPOSITION)
    const raw = Math.max(0, Math.min(1, (disp.predictBaseChance - 0.02) / (0.95 - 0.02)))
    const predictAxis = experienceAxes(disp).find((a) => a.key === '예지')!
    expect(predictAxis.value).toBeCloseTo(raw * EXPERIENCE_AXIS_DISPLAY_SCALE.predict, 10)
  })

  it('기본 토대 기준 예지 표시값이 다른 축과 비슷한 15~25% 대역에 들어온다', () => {
    const axes = experienceAxes(cloneDisposition(BASE_DISPOSITION))
    const predict = axes.find((a) => a.key === '예지')!.value
    expect(predict).toBeGreaterThanOrEqual(0.15)
    expect(predict).toBeLessThanOrEqual(0.25)
  })
})
