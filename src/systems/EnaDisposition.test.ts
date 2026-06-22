import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DISPOSITION,
  defaultDisposition,
  cloneDisposition,
  clampDisposition,
  dispositionFromJSON,
} from './EnaDisposition'
import { CompanionSystem } from './CompanionSystem'

describe('EnaDisposition', () => {
  it('기본 성향은 기존 하드코딩 상수와 일치한다(도입 무변화 보장)', () => {
    expect(DEFAULT_DISPOSITION.situationChance.web).toBe(0.35)
    expect(DEFAULT_DISPOSITION.situationChance.event).toBe(0.6)
    expect(DEFAULT_DISPOSITION.lootCommentChance).toBe(0.45)
    expect(DEFAULT_DISPOSITION.awakenChance).toBe(0.12)
    expect(DEFAULT_DISPOSITION.predictBaseChance).toBe(0.5)
    expect(DEFAULT_DISPOSITION.clutchHpThreshold).toBe(0.4)
    expect(DEFAULT_DISPOSITION.minorClutchChance.trap).toBe(0.12)
  })

  it('cloneDisposition은 중첩 레코드까지 깊게 복제한다', () => {
    const a = defaultDisposition()
    const b = cloneDisposition(a)
    b.situationChance.web = 0.9
    b.minorClutchChance.trap = 0.9
    expect(a.situationChance.web).toBe(0.35)
    expect(a.minorClutchChance.trap).toBe(0.12)
  })

  it('clampDisposition은 모든 값을 안전 경계 안으로 가둔다', () => {
    const wild = defaultDisposition()
    wild.situationChance.web = 5 // 비정상
    wild.awakenChance = 0.99 // 너무 큼
    wild.skipDecay = 0.1 // 너무 작음
    const safe = clampDisposition(wild)
    expect(safe.situationChance.web).toBeLessThanOrEqual(0.95)
    expect(safe.awakenChance).toBeLessThanOrEqual(0.4)
    expect(safe.skipDecay).toBeGreaterThanOrEqual(0.5)
  })

  it('dispositionFromJSON은 누락 필드를 기본값으로 채우고 클램프한다', () => {
    const loaded = dispositionFromJSON({ awakenChance: 0.99, situationChance: { web: 0.8 } })
    expect(loaded.awakenChance).toBeLessThanOrEqual(0.4) // 클램프됨
    expect(loaded.situationChance.web).toBe(0.8) // 주입값 유지
    expect(loaded.situationChance.event).toBe(0.6) // 누락 → 기본
    expect(loaded.lootCommentChance).toBe(0.45) // 누락 → 기본
  })

  it('주입한 성향이 실제로 CompanionSystem 동작을 바꾼다(배선 검증)', () => {
    const never = defaultDisposition()
    never.minorClutchChance.crit = 0
    const always = defaultDisposition()
    always.minorClutchChance.crit = 1
    const cNever = new CompanionSystem(never)
    const cAlways = new CompanionSystem(always)
    // Math.random() < chance 경로라 0=항상 false, 1=항상 true로 결정적.
    let neverFired = false
    let alwaysFired = true
    for (let i = 0; i < 50; i++) {
      if (cNever.rollMinorClutch('crit')) neverFired = true
      if (!cAlways.rollMinorClutch('crit')) alwaysFired = false
    }
    expect(neverFired).toBe(false)
    expect(alwaysFired).toBe(true)
    expect(cAlways.getDisposition()).toBe(always)
  })
})
