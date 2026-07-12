import { afterEach, describe, expect, it, vi } from 'vitest'
import { CompanionSystem } from './CompanionSystem'
import {
  BASE_DISPOSITION,
  ROOKIE_DISPOSITION,
  cloneDisposition,
  computeEnaGrowth,
  growthAnchorDisposition,
  loadDisposition,
  saveDisposition,
} from './EnaDisposition'
import { EnaAutonomousLearner, ENA_SELF_LEARNING_STORAGE_KEY } from '../rl/EnaAutonomousLearner'

/** 테스트용 인메모리 localStorage 스텁. */
function installLocalStorage(): Map<string, string> {
  const store = new Map<string, string>()
  ;(globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  }
  return store
}

describe('에나 성장 곡선(computeEnaGrowth)', () => {
  it('0런·0유대는 growth 0(=ROOKIE 앵커)이다', () => {
    expect(computeEnaGrowth({ runCount: 0, bond: 0 })).toBe(0)
    expect(growthAnchorDisposition(0)).toEqual(ROOKIE_DISPOSITION)
  })

  it('다수 런 + 고유대에서 0.9 근방까지 완만히 포화한다', () => {
    const veteran = computeEnaGrowth({ runCount: 15, bond: 0.9 })
    expect(veteran).toBeGreaterThanOrEqual(0.85)
    expect(veteran).toBeLessThanOrEqual(1)
    // growth 1 앵커는 학습된 기본 토대(BASE)와 일치한다.
    expect(growthAnchorDisposition(1)).toEqual(cloneDisposition(BASE_DISPOSITION))
  })

  it('런 수와 유대 각각에 대해 단조 증가한다', () => {
    let prev = -1
    for (const runs of [0, 1, 3, 5, 10, 15, 30]) {
      const g = computeEnaGrowth({ runCount: runs, bond: 0.2 })
      expect(g).toBeGreaterThan(prev)
      prev = g
    }
    expect(computeEnaGrowth({ runCount: 5, bond: 0.8 })).toBeGreaterThan(
      computeEnaGrowth({ runCount: 5, bond: 0.1 })
    )
  })

  it('비정상 입력(음수 런/범위 밖 유대)도 0~1 안에 머문다', () => {
    expect(computeEnaGrowth({ runCount: -5, bond: -1 })).toBe(0)
    expect(computeEnaGrowth({ runCount: 9999, bond: 99 })).toBeLessThanOrEqual(1)
  })
})

describe('ROOKIE_DISPOSITION (입만 있는 동반자)', () => {
  it('기계적 개입 노브는 BASE보다 훨씬 낮고, 대사 노브는 BASE와 같다', () => {
    // 개입: 소소한 클러치 전종·각성·예지·의지 충전 모두 하한 근처.
    for (const k of Object.keys(ROOKIE_DISPOSITION.minorClutchChance) as Array<
      keyof typeof ROOKIE_DISPOSITION.minorClutchChance
    >) {
      expect(ROOKIE_DISPOSITION.minorClutchChance[k]).toBeLessThanOrEqual(0.02)
    }
    expect(ROOKIE_DISPOSITION.awakenChance).toBeLessThanOrEqual(0.02)
    expect(ROOKIE_DISPOSITION.predictBaseChance).toBeLessThanOrEqual(0.02)
    expect(ROOKIE_DISPOSITION.willGainPerDamage).toBeLessThan(BASE_DISPOSITION.willGainPerDamage)
    expect(ROOKIE_DISPOSITION.clutchStrength).toBeLessThan(BASE_DISPOSITION.clutchStrength)
    for (const k of Object.keys(ROOKIE_DISPOSITION.supportRoleWeights!) as Array<
      keyof NonNullable<typeof ROOKIE_DISPOSITION.supportRoleWeights>
    >) {
      expect(ROOKIE_DISPOSITION.supportRoleWeights![k]).toBe(0.5)
    }
    // 대사: 상황 발화/한줄평/턴 간격은 초보라도 그대로 말한다.
    expect(ROOKIE_DISPOSITION.situationChance).toEqual(BASE_DISPOSITION.situationChance)
    expect(ROOKIE_DISPOSITION.lootCommentChance).toBe(BASE_DISPOSITION.lootCommentChance)
    expect(ROOKIE_DISPOSITION.minTurnGapBase).toBe(BASE_DISPOSITION.minTurnGapBase)
  })
})

describe('성장 앵커 평균회귀(adaptToOutcome)', () => {
  it('growth 0에서 사망이 반복돼도 ROOKIE 하한에 눌러붙지 않는다(사망 상향이 앵커 회귀와 균형)', () => {
    const c = new CompanionSystem(cloneDisposition(ROOKIE_DISPOSITION), 0)
    for (let i = 0; i < 40; i++) c.adaptToOutcome({ died: true, floorReached: 8 })
    const d = c.getDisposition()
    expect(d.minorClutchChance.trap).toBeGreaterThan(ROOKIE_DISPOSITION.minorClutchChance.trap)
    expect(d.willGainPerDamage).toBeGreaterThan(ROOKIE_DISPOSITION.willGainPerDamage)
    // 반대로 베테랑 토대(BASE)까지 튀지도 않는다 — 초보 구간의 완만한 개인화만 허용.
    expect(d.predictBaseChance).toBeLessThan(BASE_DISPOSITION.predictBaseChance)
  })

  it('성장이 축적되면(setGrowth) 같은 결과 반복에도 성향이 BASE 방향으로 상향 회귀한다', () => {
    const c = new CompanionSystem(cloneDisposition(ROOKIE_DISPOSITION), 0)
    for (let i = 0; i < 10; i++) c.adaptToOutcome({ died: false, floorReached: 30 })
    const rookiePhase = cloneDisposition(c.getDisposition())
    c.setGrowth(1) // 런/유대 축적으로 베테랑 도달 가정
    for (let i = 0; i < 10; i++) c.adaptToOutcome({ died: false, floorReached: 30 })
    const veteranPhase = c.getDisposition()
    expect(veteranPhase.predictBaseChance).toBeGreaterThan(rookiePhase.predictBaseChance)
    expect(veteranPhase.willGainPerDamage).toBeGreaterThan(rookiePhase.willGainPerDamage)
    expect(veteranPhase.minorClutchChance.dodge).toBeGreaterThan(rookiePhase.minorClutchChance.dodge)
  })

  it('growth 조회 API를 노출한다(추후 경험 탭 연동용)', () => {
    const c = new CompanionSystem(cloneDisposition(ROOKIE_DISPOSITION), 0.3)
    expect(c.getGrowth()).toBe(0.3)
    c.setGrowth(2) // 범위 밖 입력은 0~1로 가둔다
    expect(c.getGrowth()).toBe(1)
  })
})

describe('미숙(놓친 개입) 대사 성장 연동', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('growth가 낮으면 미숙 대사가 더 자주, 높으면 원래 빈도(0.45)로 나온다', () => {
    // 0.45 <= 0.5 < 0.70 구간의 난수로 초보/베테랑 확률 차이를 결정적으로 가른다.
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    const rookie = new CompanionSystem(cloneDisposition(ROOKIE_DISPOSITION), 0)
    expect(rookie.missedPotentialLine('web', 50)).not.toBeNull()
    const veteran = new CompanionSystem(cloneDisposition(BASE_DISPOSITION), 1)
    expect(veteran.missedPotentialLine('web', 50)).toBeNull()
  })

  it('턴 간격 게이트는 성장과 무관하게 유지된다', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01)
    const rookie = new CompanionSystem(cloneDisposition(ROOKIE_DISPOSITION), 0)
    expect(rookie.missedPotentialLine('web', 50)).not.toBeNull()
    // 직전 발화 직후에는 초보라도 연속으로 내지 않는다.
    expect(rookie.missedPotentialLine('web', 51)).toBeNull()
  })
})

describe('신규 폴백/기존 저장 호환', () => {
  afterEach(() => {
    delete (globalThis as { localStorage?: unknown }).localStorage
  })

  it('기존 저장본 보유 플레이어는 growth와 무관하게 저장값 그대로 로드된다(급격한 하향 금지)', () => {
    installLocalStorage()
    const d = cloneDisposition(BASE_DISPOSITION)
    d.predictBaseChance = 0.7
    d.minorClutchChance.trap = 0.3
    saveDisposition(d)
    const loaded = loadDisposition(undefined, 0) // 신규 폴백이 ROOKIE여도 저장본이 우선
    expect(loaded.predictBaseChance).toBeCloseTo(0.7)
    expect(loaded.minorClutchChance.trap).toBeCloseTo(0.3)
  })

  it('저장본이 없으면 fallbackGrowth 앵커에서 시작한다', () => {
    installLocalStorage()
    expect(loadDisposition(undefined, 0)).toEqual(ROOKIE_DISPOSITION)
    const mid = loadDisposition(undefined, 0.5)
    expect(mid.predictBaseChance).toBeGreaterThan(ROOKIE_DISPOSITION.predictBaseChance)
    expect(mid.predictBaseChance).toBeLessThan(BASE_DISPOSITION.predictBaseChance)
  })
})

describe('누적 런 수 저장(EnaAutonomousLearner.loadRunCount)', () => {
  const makeStorage = (store: Map<string, string>) => ({
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  })

  it('totalRuns 필드가 있으면 그대로 읽는다(20개 reflections 상한과 무관하게 계속 센다)', () => {
    const store = new Map<string, string>()
    const storage = makeStorage(store)
    store.set(
      ENA_SELF_LEARNING_STORAGE_KEY,
      JSON.stringify({ version: 1, updatedAt: '', reflections: [], totalRuns: 33 })
    )
    expect(new EnaAutonomousLearner(storage).loadRunCount()).toBe(33)
  })

  it('구버전 저장본(totalRuns 없음)은 reflections 길이로 폴백하고, 저장소가 없으면 0이다', () => {
    const store = new Map<string, string>()
    const storage = makeStorage(store)
    store.set(
      ENA_SELF_LEARNING_STORAGE_KEY,
      JSON.stringify({ version: 1, updatedAt: '', reflections: [{}, {}, {}] })
    )
    expect(new EnaAutonomousLearner(storage).loadRunCount()).toBe(3)
    expect(new EnaAutonomousLearner(undefined).loadRunCount()).toBe(0)
  })
})
