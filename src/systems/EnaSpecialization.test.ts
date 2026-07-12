import { afterEach, describe, expect, it } from 'vitest'
import {
  BASE_DISPOSITION,
  ENA_SPECIALIZATION_TUNING,
  SPECIALIZATION_MAX_EXTENSION,
  accumulateSpecialization,
  clampDisposition,
  cloneDisposition,
  computeRunSpecializationGain,
  defaultDisposition,
  growthAnchorDisposition,
  loadDisposition,
  saveDisposition,
  specializedAnchorDisposition,
  zeroSpecialization,
  normalizeSpecialization,
} from './EnaDisposition'
import { CompanionSystem } from './CompanionSystem'
import { EnaAutonomousLearner, ENA_SELF_LEARNING_STORAGE_KEY } from '../rl/EnaAutonomousLearner'
import { experienceAxes } from '@ui/ExperienceAxes'

/** 테스트용 인메모리 저장소(learner/localStorage 공용 최소 계약). */
function makeStorage(store: Map<string, string>) {
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
}

/** 경험 탭 '불굴' 표시값(성장 완료 표기 기준). */
function gritDisplay(disp: Parameters<typeof experienceAxes>[0]): number {
  return experienceAxes(disp, undefined, 1).find((a) => a.key === '불굴')!.value
}

describe('축 특화 초과 성장 — 상한 확장(clampDisposition)', () => {
  it('특화 0이면 기존 클램프/앵커와 완전히 동일하다(회귀 보존)', () => {
    const wild = defaultDisposition()
    wild.awakenChance = 0.99
    wild.minorClutchChance.trap = 5
    wild.predictBaseChance = 2
    wild.willGainPerDamage = 500
    expect(clampDisposition(wild, zeroSpecialization())).toEqual(clampDisposition(wild))
    const anchor = growthAnchorDisposition(0.6)
    expect(specializedAnchorDisposition(anchor, zeroSpecialization())).toEqual(anchor)
    expect(specializedAnchorDisposition(anchor)).toEqual(anchor)
    // 손상/부분 저장본 병합도 0으로 안전하게 정규화된다.
    expect(normalizeSpecialization({ grit: Number.NaN, predict: -3 })).toEqual(zeroSpecialization())
  })

  it('특화 축의 노브만 hi × (1 + spec × MAX_EXTENSION)까지 열린다', () => {
    const d = defaultDisposition()
    d.awakenChance = 0.7 // 기존 상한 0.4 초과
    d.predictBaseChance = 1.2 // 기존 상한 0.95 초과
    const gritOnly = clampDisposition(d, { grit: 1 })
    expect(gritOnly.awakenChance).toBeCloseTo(0.7, 10) // grit 특화 → 0.8까지 허용
    expect(gritOnly.predictBaseChance).toBeCloseTo(0.95, 10) // 예지 특화 아님 → 기존 상한 유지
    const both = clampDisposition(d, { grit: 1, predict: 1 })
    expect(both.predictBaseChance).toBeCloseTo(1.2, 10)
    // 부분 특화는 부분 확장 — spec 0.5면 hi 0.4 → 0.6.
    const half = clampDisposition(d, { grit: 0.5 })
    expect(half.awakenChance).toBeCloseTo(0.4 * (1 + 0.5 * SPECIALIZATION_MAX_EXTENSION), 10)
    // 하한은 특화와 무관하게 그대로다(하락 방향 안전 유지).
    const low = defaultDisposition()
    low.awakenChance = 0
    expect(clampDisposition(low, { grit: 1 }).awakenChance).toBeCloseTo(0.02, 10)
  })
})

describe('축 특화 초과 성장 — 런 신호 적립', () => {
  it('탱킹 깊은 런 반복은 grit만 소량·단조·포화 적립한다', () => {
    let spec = zeroSpecialization()
    const tankRun = { floorReached: 60, damageTakenRatio: 3 }
    const firstGain = computeRunSpecializationGain(spec, tankRun).grit
    expect(firstGain).toBeGreaterThan(0.004) // 런당 '아주 찔끔'이되 0은 아님
    expect(firstGain).toBeLessThanOrEqual(ENA_SPECIALIZATION_TUNING.axisRunCap)
    for (let i = 0; i < 400; i++) {
      const next = accumulateSpecialization(spec, tankRun)
      expect(next.grit).toBeGreaterThanOrEqual(spec.grit) // 단조(하락 없음)
      expect(next.grit).toBeLessThanOrEqual(1)
      spec = next
    }
    expect(spec.grit).toBeGreaterThan(0.9) // 장기 일관 플레이는 특화 고점에 도달
    // 완만 포화: 고점에서는 같은 신호의 적립이 처음보다 훨씬 작다.
    expect(computeRunSpecializationGain(spec, tankRun).grit).toBeLessThan(firstGain * 0.2)
    // 신호가 없던 축은 그대로 0 — 축별 독립 적립.
    expect(spec.predict).toBe(0)
    expect(spec.minor).toBe(0)
  })

  it('얕은 자살런은 모든 신호가 미미하다(깊이 감쇠)', () => {
    const gain = computeRunSpecializationGain(zeroSpecialization(), {
      floorReached: 5,
      damageTakenRatio: 1,
      timelyPredictions: 3,
      effectiveClutches: 3,
      warmthInteractions: 5,
    })
    expect(gain.grit).toBeLessThan(0.001)
    expect(gain.predict + gain.protection + gain.minor + gain.grit).toBeLessThan(0.01)
  })

  it('축별 독립 적립이되 런당 총 적립은 runTotalCap을 넘지 않는다', () => {
    const gain = computeRunSpecializationGain(zeroSpecialization(), {
      floorReached: 100,
      damageTakenRatio: 50,
      timelyPredictions: 50,
      effectiveClutches: 50,
      warmthInteractions: 50,
    })
    const total = gain.predict + gain.protection + gain.minor + gain.grit
    expect(total).toBeCloseTo(ENA_SPECIALIZATION_TUNING.runTotalCap, 10)
    for (const v of Object.values(gain)) {
      expect(v).toBeLessThanOrEqual(ENA_SPECIALIZATION_TUNING.axisRunCap)
    }
  })
})

describe('축 특화 초과 성장 — 저장 왕복(EnaAutonomousLearner, version 1)', () => {
  it('accrueSpecialization은 version 1 저장에 optional 필드로 병합·영속되고 왕복된다', () => {
    const store = new Map<string, string>()
    const learner = new EnaAutonomousLearner(makeStorage(store))
    expect(learner.loadSpecialization()).toEqual(zeroSpecialization()) // 구버전/무저장 → 전 축 0
    const spec = learner.accrueSpecialization({
      floorReached: 60,
      damageTakenRatio: 3,
      timelyPredictions: 2,
    })
    expect(spec.grit).toBeGreaterThan(0)
    expect(spec.predict).toBeGreaterThan(0)
    const saved = JSON.parse(store.get(ENA_SELF_LEARNING_STORAGE_KEY)!) as {
      version: number
      specialization?: Record<string, number>
    }
    expect(saved.version).toBe(1) // 저장 버전 유지(마이그레이션 불필요)
    expect(saved.specialization!.grit).toBeCloseTo(spec.grit, 10)
    // 새 인스턴스 왕복 + 다른 필드 저장(bond)이 특화를 지우지 않는다.
    const reloaded = new EnaAutonomousLearner(makeStorage(store))
    expect(reloaded.loadSpecialization()).toEqual(spec)
    reloaded.saveBond(0.5)
    expect(new EnaAutonomousLearner(makeStorage(store)).loadSpecialization()).toEqual(spec)
    // 저장소 없는 환경(테스트/SSR)에서도 계산값은 돌려주되 영속만 건너뛴다.
    const volatile = new EnaAutonomousLearner(undefined)
    expect(volatile.accrueSpecialization({ floorReached: 60, damageTakenRatio: 3 }).grit).toBeGreaterThan(0)
    expect(volatile.loadSpecialization()).toEqual(zeroSpecialization())
  })
})

describe('축 특화 초과 성장 — 평형 상승과 표시 추종', () => {
  afterEach(() => {
    delete (globalThis as { localStorage?: unknown }).localStorage
  })

  it('grit 특화 고점이면 평균회귀 평형점이 상향된 앵커로 올라간다(앵커 리프트)', () => {
    const c = new CompanionSystem(cloneDisposition(BASE_DISPOSITION), 1)
    c.setSpecialization({ grit: 1 })
    for (let i = 0; i < 200; i++) c.adaptToOutcome({ died: false, floorReached: 30 })
    const d = c.getDisposition()
    // grit 노브는 런 결과 상향(bump)이 없어 평형=앵커 — 리프트로 BASE(0.07)의 4배 이상으로 상승.
    const liftedAnchor = specializedAnchorDisposition(growthAnchorDisposition(1), { grit: 1 })
    expect(d.awakenChance).toBeGreaterThan(BASE_DISPOSITION.awakenChance * 4)
    expect(d.awakenChance).toBeCloseTo(liftedAnchor.awakenChance, 3)
    expect(gritDisplay(d)).toBeGreaterThan(0.2) // 표시도 기존 평형(~19.7%)을 넘는다
    // 특화 0 대조군: 같은 반복에도 기존 평형(BASE 앵커) 그대로.
    const c0 = new CompanionSystem(cloneDisposition(BASE_DISPOSITION), 1)
    for (let i = 0; i < 200; i++) c0.adaptToOutcome({ died: false, floorReached: 30 })
    expect(c0.getDisposition().awakenChance).toBeCloseTo(BASE_DISPOSITION.awakenChance, 5)
  })

  it('사망 상향이 있는 노브(수호 축)는 특화 고점에서 기존 안전 상한을 실제로 넘는다', () => {
    const p = new CompanionSystem(cloneDisposition(BASE_DISPOSITION), 1)
    p.setSpecialization({ protection: 1 })
    for (let i = 0; i < 200; i++) p.adaptToOutcome({ died: true, floorReached: 30 })
    // willGainPerDamage 기존 상한 100 — 특화 1이면 사망 상향(×1.05)이 확장 상한(200)까지 자란다.
    expect(p.getDisposition().willGainPerDamage).toBeGreaterThan(100)
    // 특화 0 대조군: 같은 사망 반복에도 기존 상한(100)에 머문다.
    const p0 = new CompanionSystem(cloneDisposition(BASE_DISPOSITION), 1)
    for (let i = 0; i < 200; i++) p0.adaptToOutcome({ died: true, floorReached: 30 })
    expect(p0.getDisposition().willGainPerDamage).toBeLessThanOrEqual(100)
  })

  it('saveDisposition/loadDisposition 왕복이 특화 초과값을 자르지 않는다', () => {
    const store = new Map<string, string>()
    ;(globalThis as { localStorage?: unknown }).localStorage = makeStorage(store)
    const d = cloneDisposition(BASE_DISPOSITION)
    d.awakenChance = 0.7
    saveDisposition(d, undefined, { grit: 1 })
    expect(loadDisposition(undefined, 1, { grit: 1 }).awakenChance).toBeCloseTo(0.7, 10)
    // 특화 없이 읽으면(특화 저장 소실 등) 기존 안전 상한으로 되돌아온다 — 안전 우선.
    expect(loadDisposition(undefined, 1).awakenChance).toBeCloseTo(0.4, 10)
  })

  it('불굴 표시가 기존 평형(~20%)을 넘어 spec에 단조로 자라고, spec=1 앵커는 ~90%에 닿는다', () => {
    const base = growthAnchorDisposition(1)
    const before = gritDisplay(base)
    expect(before).toBeLessThan(0.2) // 기존 베테랑 평형 표시(~19.7%)
    const at = (grit: number) => gritDisplay(specializedAnchorDisposition(base, { grit }))
    expect(at(0.25)).toBeGreaterThan(before)
    expect(at(0.5)).toBeGreaterThan(at(0.25))
    expect(at(1)).toBeGreaterThan(at(0.5))
    // spec=1 이론 앵커: awaken 0.3255/adversity 2.33/bondClimax 0.227 → raw 0.867 × 1.05 ≈ 91%.
    expect(at(1)).toBeGreaterThanOrEqual(0.9)
    expect(at(1)).toBeLessThanOrEqual(1) // clamp01 — 표시 100% 상한은 유지
  })

  it('CompanionSystem이 런 내 온정/피해 견딤 신호를 세고 resetForRun으로 비운다', () => {
    const d = defaultDisposition()
    d.minorClutchChance.treasure = 1 // chance ≥ 1 → 확정 발동으로 결정적 검증
    const c = new CompanionSystem(d)
    expect(c.rollMinorClutch('treasure')).toBe(true)
    c.recordRecentEvent('treasure', 3)
    c.gainWill(30, 60)
    expect(c.getRunWarmthSignalCount()).toBe(2)
    expect(c.getRunDamageTakenRatio()).toBeCloseTo(0.5, 10)
    c.resetForRun()
    expect(c.getRunWarmthSignalCount()).toBe(0)
    expect(c.getRunDamageTakenRatio()).toBe(0)
  })
})
