import { describe, expect, it } from 'vitest'
import { EXPERIENCE_AXIS_DISPLAY_BOOST, experienceAxes } from '@ui/ExperienceAxes'
import {
  BASE_DISPOSITION,
  ROOKIE_DISPOSITION,
  cloneDisposition,
  growthAnchorDisposition,
} from '@systems/EnaDisposition'
import type { EnaDisposition } from '@systems/EnaDisposition'

// 경험 탭 표기 원칙을 보장한다:
// 1) 표시 전용 — 실제 성향(동작값)은 절대 변하면 안 된다.
// 2) 실질 동작값 기반 — 육각형 모양은 원시 정규화값 비율 그대로, 성장 배율만 공통으로 곱한다.
const INTERVENTION_AXES = ['예지', '수호', '온정', '불굴'] as const

function axisValue(disp: EnaDisposition, key: string, growth?: number): number {
  return experienceAxes(disp, undefined, growth).find((a) => a.key === key)!.value
}

describe('ExperienceAxes', () => {
  it('축 계산이 입력 성향(동작값)을 변형하지 않는다', () => {
    for (const [source, growth] of [
      [ROOKIE_DISPOSITION, 0],
      [BASE_DISPOSITION, 1],
    ] as const) {
      const disp = cloneDisposition(source)
      const before = JSON.stringify(disp)
      experienceAxes(disp, undefined, growth)
      expect(JSON.stringify(disp)).toBe(before)
      // 특히 예지 동작값은 표기 배율과 무관하게 원시값 그대로 남아야 한다.
      expect(disp.predictBaseChance).toBe(source.predictBaseChance)
    }
  })

  it('신규(ROOKIE, growth 0) 개입 축은 서로 다른 값으로 자연 비율 순서를 유지한다', () => {
    const disp = cloneDisposition(ROOKIE_DISPOSITION)
    const v = Object.fromEntries(INTERVENTION_AXES.map((k) => [k, axisValue(disp, k, 0)]))
    // ROOKIE 원시 비율 순서: 예지 > 수호 > 온정 > 불굴 — 균일 클램프가 아니라 축별 고유값.
    expect(v['예지']).toBeGreaterThan(v['수호'])
    expect(v['수호']).toBeGreaterThan(v['온정'])
    expect(v['온정']).toBeGreaterThan(v['불굴'])
    // 캘리브레이션 대역 — ROOKIE 재피팅으로 어긋나면 여기서 잡는다.
    expect(v['예지']).toBeGreaterThanOrEqual(0.15)
    expect(v['예지']).toBeLessThanOrEqual(0.2)
    expect(v['불굴']).toBeGreaterThanOrEqual(0.06)
    expect(v['불굴']).toBeLessThanOrEqual(0.1)
  })

  it('성장 완료(BASE, growth 1) 개입 축은 원시값×end 배율로 상한 대역에 안착한다', () => {
    const disp = cloneDisposition(BASE_DISPOSITION)
    const predict = axisValue(disp, '예지', 1)
    // BASE 예지 원시값(~0.49) × end(1.05) ≈ 51% — 기존 표기 상한 감각(~45~55%) 대역.
    expect(predict).toBeGreaterThanOrEqual(0.45)
    expect(predict).toBeLessThanOrEqual(0.55)
    // 성장 완료에도 축별 고유 비율은 유지된다(예지가 가장 길다).
    for (const key of ['수호', '온정', '불굴'] as const) {
      expect(axisValue(disp, key, 1), key).toBeLessThan(predict)
      expect(axisValue(disp, key, 1), key).toBeGreaterThan(0.15)
    }
  })

  it('개입 축 배율은 성장 단계 공통이다 — 같은 성향이면 모든 축의 growth 0↔1 표시비가 같다', () => {
    const disp = cloneDisposition(BASE_DISPOSITION)
    const expected = EXPERIENCE_AXIS_DISPLAY_BOOST.interventionStart / EXPERIENCE_AXIS_DISPLAY_BOOST.interventionEnd
    for (const key of INTERVENTION_AXES) {
      expect(axisValue(disp, key, 0) / axisValue(disp, key, 1), key).toBeCloseTo(expected, 10)
    }
  })

  it('실제 성장 앵커 경로(ROOKIE→BASE, growth 동반 상승)에서 표시값은 단조 증가한다', () => {
    const steps = [0, 0.25, 0.5, 0.75, 1]
    for (const key of INTERVENTION_AXES) {
      const values = steps.map((t) => axisValue(growthAnchorDisposition(t), key, t))
      for (let i = 1; i < values.length; i++) {
        expect(values[i], `${key} @${steps[i]}`).toBeGreaterThan(values[i - 1])
      }
    }
  })

  it('개인화 적응으로 동작값이 움직이면 표기가 같은 성장 단계에서 즉시 따라 움직인다', () => {
    const disp = cloneDisposition(ROOKIE_DISPOSITION)
    const before = axisValue(disp, '예지', 0)
    disp.predictBaseChance += 0.1 // 앵커 보간이 실제 값 변화를 가리면 안 된다.
    expect(axisValue(disp, '예지', 0)).toBeGreaterThan(before)
    // 다른 축은 예지 노브와 무관 — 그대로여야 한다.
    const untouched = cloneDisposition(ROOKIE_DISPOSITION)
    for (const key of ['수호', '온정', '불굴'] as const) {
      expect(axisValue(disp, key, 0), key).toBeCloseTo(axisValue(untouched, key, 0), 10)
    }
  })

  it('수다 축은 신규(growth 0)에 낮게 시작해 성장하면 원시 표기를 회복한다', () => {
    const disp = cloneDisposition(BASE_DISPOSITION)
    const sc = disp.situationChance
    const chat = (sc.hit + sc.web + sc.treasure + sc.kill + sc.survive + sc.flower + sc.event + sc.spore + sc.bomb) / 9
    const raw = Math.max(0, Math.min(1, (chat - 0.12) / (0.62 - 0.12)))
    // 성장 완료(생략 시 기본 growth 1)는 리매핑 없는 원시 정규화 표기 그대로.
    expect(axisValue(disp, '수다')).toBeCloseTo(raw, 10)
    expect(axisValue(disp, '수다', 1)).toBeCloseTo(raw, 10)
    // 신규는 chatStart 배율(초보 동반자의 어색함) — ~18% 대역.
    expect(axisValue(disp, '수다', 0)).toBeCloseTo(raw * EXPERIENCE_AXIS_DISPLAY_BOOST.chatStart, 10)
    expect(axisValue(disp, '수다', 0)).toBeGreaterThanOrEqual(0.16)
    expect(axisValue(disp, '수다', 0)).toBeLessThanOrEqual(0.21)
    // growth에 단조 증가.
    expect(axisValue(disp, '수다', 0.5)).toBeGreaterThan(axisValue(disp, '수다', 0))
    expect(axisValue(disp, '수다', 1)).toBeGreaterThan(axisValue(disp, '수다', 0.5))
  })
})
