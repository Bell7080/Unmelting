import { afterEach, describe, expect, it } from 'vitest'
import { CompanionSystem } from './CompanionSystem'
import {
  defaultDisposition,
  cloneDisposition,
  loadDisposition,
  saveDisposition,
  growthAnchorDisposition,
  BASE_DISPOSITION,
  ROOKIE_DISPOSITION,
} from './EnaDisposition'

describe('에나 온라인 per-player 적응', () => {
  it('사망으로 끝나면 다음 런에 더 적극적으로 돕도록 방어/지원 성향이 오른다', () => {
    const c = new CompanionSystem(defaultDisposition())
    const before = cloneDisposition(c.getDisposition())
    const after = c.adaptToOutcome({ died: true, floorReached: 14 })
    expect(after.willGainPerDamage).toBeGreaterThan(before.willGainPerDamage)
    expect(after.clutchStrength).toBeGreaterThan(before.clutchStrength)
    expect(after.minorClutchChance.trap).toBeGreaterThan(before.minorClutchChance.trap)
    expect(after.predictBaseChance).toBeGreaterThan(before.predictBaseChance)
  })

  it('깊이 살아남으면 과보호를 살짝 완화한다', () => {
    const c = new CompanionSystem(defaultDisposition())
    // 평균회귀는 기본 토대 방향으로 끌므로, 사망 반복으로 토대 위로 올려둔 뒤 완화를 검증한다.
    for (let i = 0; i < 10; i++) c.adaptToOutcome({ died: true, floorReached: 5 })
    const before = cloneDisposition(c.getDisposition())
    const after = c.adaptToOutcome({ died: false, floorReached: 72 })
    expect(after.willGainPerDamage).toBeLessThan(before.willGainPerDamage)
    expect(after.clutchStrength).toBeLessThan(before.clutchStrength)
  })

  it('사망이 반복돼도 평균회귀로 상한에 영구히 눌러붙지 않는다', () => {
    const c = new CompanionSystem(defaultDisposition())
    for (let i = 0; i < 50; i++) c.adaptToOutcome({ died: true, floorReached: 5 })
    const saturated = c.getDisposition().willGainPerDamage
    // 무난한 생존 런이 이어지면 성향이 기본 토대 방향으로 회복된다.
    for (let i = 0; i < 30; i++) c.adaptToOutcome({ died: false, floorReached: 40 })
    expect(c.getDisposition().willGainPerDamage).toBeLessThan(saturated)
  })

  it('런-내 수다 학습(열람)을 영구 성향(발화확률)으로 소화한다', () => {
    const c = new CompanionSystem(defaultDisposition())
    const before = c.getDisposition().situationChance.hit
    for (let i = 0; i < 20; i++) c.recordHeard('web') // chattiness > 1로 끌어올림
    const after = c.adaptToOutcome({ died: false, floorReached: 20 })
    expect(after.situationChance.hit).toBeGreaterThan(before)
  })

  it('모든 적응은 안전 경계 안에 머문다(라이브 동작 보호)', () => {
    const c = new CompanionSystem(defaultDisposition())
    // 사망을 여러 번 반복해도 폭주하지 않고 상한에서 멈춘다.
    let d = c.getDisposition()
    for (let i = 0; i < 200; i++) d = c.adaptToOutcome({ died: true, floorReached: 5 })
    expect(d.willGainPerDamage).toBeLessThanOrEqual(100)
    expect(d.clutchStrength).toBeLessThanOrEqual(1.6)
    expect(d.minorClutchChance.trap).toBeLessThanOrEqual(0.95)
    expect(d.predictBaseChance).toBeLessThanOrEqual(0.95)
  })
})

describe('성향 영구 저장(per-player)', () => {
  afterEach(() => {
    delete (globalThis as { localStorage?: unknown }).localStorage
  })

  it('저장 후 불러오면 적응된 값이 세션을 넘어 유지된다', () => {
    const store = new Map<string, string>()
    ;(globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
      key: () => null,
      length: 0,
    }
    const d = defaultDisposition()
    d.awakenChance = 0.2
    d.predictBaseChance = 0.7
    saveDisposition(d)
    const loaded = loadDisposition()
    expect(loaded.awakenChance).toBe(0.2)
    expect(loaded.predictBaseChance).toBe(0.7)
  })

  it('저장본이 없으면(신규 플레이어) growth=0 앵커(ROOKIE 근방)에서 시작한다', () => {
    const loaded = loadDisposition()
    expect(loaded).toEqual(ROOKIE_DISPOSITION) // growth 0 → 앵커 = ROOKIE
    expect(loaded).not.toBe(ROOKIE_DISPOSITION) // 복제라 라이브가 원본을 변형하지 않는다
    // 대사 성향은 초보라도 BASE와 같다('입만 있는 동반자').
    expect(loaded.situationChance).toEqual(BASE_DISPOSITION.situationChance)
    expect(loaded.lootCommentChance).toBe(BASE_DISPOSITION.lootCommentChance)
    saveDisposition(defaultDisposition()) // throw 없이 무시
  })

  it('저장본이 없어도 성장이 쌓였으면(fallbackGrowth) 앵커 성향에서 시작한다', () => {
    const loaded = loadDisposition(undefined, 1)
    expect(loaded).toEqual(growthAnchorDisposition(1)) // growth 1 → 앵커 = BASE
    expect(loaded.awakenChance).toBe(BASE_DISPOSITION.awakenChance)
  })
})
