import { describe, it, expect } from 'vitest'
import { CompanionSystem } from './CompanionSystem'
import { defaultDisposition } from './EnaDisposition'

// 지속 감정 상태(mood/bond)와 침묵 구간 전용 대사 풀의 경계/청결성 검증.
describe('CompanionSystem mood', () => {
  it('noteMoodShift는 -1~1로 클램프된다', () => {
    const c = new CompanionSystem()
    c.noteMoodShift(-5)
    expect(c.getMood()).toBe(-1)
    c.noteMoodShift(10)
    expect(c.getMood()).toBe(1)
  })

  it('gainWill은 피해 비례로 기분을 내리되 과하게 떨어뜨리지 않는다', () => {
    const c = new CompanionSystem()
    c.gainWill(5, 20)
    expect(c.getMood()).toBeLessThan(0)
    expect(c.getMood()).toBeGreaterThanOrEqual(-0.25)
  })

  it('syncMoodToTurn은 턴당 0.02씩 0으로 자연 회복하고 0을 넘어가지 않는다', () => {
    const c = new CompanionSystem()
    c.resetForRun()
    c.noteMoodShift(-0.1)
    c.syncMoodToTurn(3) // 3턴 경과 → +0.06 회복
    expect(c.getMood()).toBeCloseTo(-0.04, 5)
    c.syncMoodToTurn(100) // 충분히 지나도 0에서 멈춘다(양수로 튀지 않음).
    expect(c.getMood()).toBe(0)
    // 양수 기분도 같은 속도로 0으로 내려온다.
    c.noteMoodShift(0.5)
    c.syncMoodToTurn(110)
    expect(c.getMood()).toBeCloseTo(0.3, 5)
  })

  it('resetForRun은 기분만 0으로 되돌리고 유대는 유지한다', () => {
    const c = new CompanionSystem()
    c.noteMoodShift(-0.8)
    c.setBond(0.4)
    c.resetForRun()
    expect(c.getMood()).toBe(0)
    expect(c.getBond()).toBeCloseTo(0.4, 5)
  })

  it('보스 등장은 기분을 낮추고 격파는 끌어올린다', () => {
    const c = new CompanionSystem()
    c.resetForRun()
    c.bossIntroLine()
    expect(c.getMood()).toBeLessThan(0)
    c.resetForRun()
    c.bossKillLine()
    expect(c.getMood()).toBeGreaterThan(0)
  })
})

describe('CompanionSystem bond', () => {
  it('setBond는 0~1로 클램프되고 recordHeard는 단조 증가만 한다', () => {
    const c = new CompanionSystem()
    c.setBond(-1)
    expect(c.getBond()).toBe(0)
    c.setBond(2)
    expect(c.getBond()).toBe(1)
    c.setBond(0.1)
    c.recordHeard('hit')
    expect(c.getBond()).toBeGreaterThan(0.1)
    // 아무리 많이 들어도 1을 넘지 않는다.
    for (let i = 0; i < 1000; i++) c.recordHeard('hit')
    expect(c.getBond()).toBeLessThanOrEqual(1)
  })

  it('소소한 클러치가 발동하면 유대가 조금 오른다', () => {
    const d = defaultDisposition()
    d.minorClutchChance.crit = 1 // 확정 발동으로 만들어 결정적으로 검증한다.
    const c = new CompanionSystem(d)
    expect(c.rollMinorClutch('crit')).toBe(true)
    expect(c.getBond()).toBeGreaterThan(0)
  })

  it('큰 클러치 계획이 잡히면 유대가 오른다', () => {
    const c = new CompanionSystem()
    c.gainWillFlat(100)
    const plan = c.evaluateClutch({ hp: 3, maxHp: 20, hpRatio: 0.15, emberLow: false })
    expect(plan).not.toBeNull()
    expect(c.getBond()).toBeGreaterThan(0)
  })

  it('런 종료 소화(adaptToOutcome)는 유대를 소량 올린다', () => {
    const c = new CompanionSystem()
    c.adaptToOutcome({ died: true, floorReached: 12 })
    const afterDeath = c.getBond()
    expect(afterDeath).toBeGreaterThan(0)
    c.adaptToOutcome({ died: false, floorReached: 100 })
    expect(c.getBond()).toBeGreaterThan(afterDeath)
  })
})

describe('침묵 구간 전용 대사 풀', () => {
  it('보스/종막/시련/별빛 대사가 미치환 자국 없이 나온다', () => {
    const c = new CompanionSystem()
    for (let i = 0; i < 20; i++) {
      expect(c.bossIntroLine()).not.toMatch(/[{}[\]]/)
      expect(c.bossPhaseLine()).not.toMatch(/[{}[\]]/)
      expect(c.bossKillLine()).not.toMatch(/[{}[\]]/)
      expect(c.deathLine()).not.toMatch(/[{}[\]]/)
      expect(c.clearLine()).not.toMatch(/[{}[\]]/)
      expect(c.trialLine()).not.toMatch(/[{}[\]]/)
      expect(c.starlightLine()).not.toMatch(/[{}[\]]/)
    }
  })

  it('팩 감상은 6종 팩 전부에서 깨끗한 문자열로 나온다', () => {
    const c = new CompanionSystem()
    const kinds = ['basic-pack', 'recipe-pack', 'unlock-pack', 'chance-pack', 'resource-pack', 'delete-pack'] as const
    for (const kind of kinds) {
      const line = c.packLine(kind)
      expect(line.length).toBeGreaterThan(0)
      expect(line).not.toMatch(/[{}[\]]/)
    }
  })

  it('감정 모순 게이트 재료: 저기분에서도 위급 경고 강도는 유지된다(대사가 항상 나온다)', () => {
    const c = new CompanionSystem()
    c.noteMoodShift(-1)
    // 저기분이어도 urgent 풀 자체가 깨지지 않고 렌더된다(말투만 보정, 경고는 침묵하지 않음).
    expect(c.minorClutchLine('dodge').length).toBeGreaterThan(0)
    expect(c.bossPhaseLine().length).toBeGreaterThan(0)
  })
})
