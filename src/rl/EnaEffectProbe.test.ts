import { describe, expect, it } from 'vitest'
import { verifyHandSystemAgainstKnowledge, EnaPlayLogMemory } from './EnaEffectProbe'

describe('EnaEffectProbe', () => {
  it('HandSystem 실제 실행 결과와 어댑터 추정값을 대조한다', () => {
    const reports = verifyHandSystemAgainstKnowledge(['ember', 'chitin', 'coin'])
    expect(reports).toHaveLength(3)
    expect(reports.every((report) => Number.isFinite(report.actualImpact))).toBe(true)
    expect(reports.find((report) => report.id === 'ember')?.singleSuccess).toBe(true)
  })

  it('플레이 로그를 저장/복원하고 손패 가치 보정치를 만든다', () => {
    const memory = new EnaPlayLogMemory()
    memory.append({ runId: 'r1', turnReached: 35, survived: true, usedHandCards: { ember: 2 }, shopPurchases: ['unlock-pack'] })
    memory.append({ runId: 'r2', turnReached: 12, survived: false, usedHandCards: { chitin: 1 }, shopPurchases: ['basic-pack'], deathReason: 'trap' })
    const restored = EnaPlayLogMemory.fromJSON(memory.toJSON())
    const tuning = restored.tuneHandCardValues()
    expect(restored.all()).toHaveLength(2)
    expect(tuning.some((entry) => entry.id === 'ember' && entry.valueDelta > 0)).toBe(true)
    expect(tuning.some((entry) => entry.id === 'chitin')).toBe(true)
  })
})
