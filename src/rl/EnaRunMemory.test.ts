import { describe, expect, it } from 'vitest'
import type { HandCardId } from '@entities/HandCard'
import { EnaPlayLogMemory } from './EnaEffectProbe'
import type { EnaRuntimeEvent } from './EnaRuntimeObserver'
import { EnaAutonomousLearner, ENA_SELF_LEARNING_STORAGE_KEY, type EnaAutonomousLearningState } from './EnaAutonomousLearner'
import type { EnaPolicyStorage } from './EnaPolicyStore'

class MemoryStorage implements EnaPolicyStorage {
  private readonly values = new Map<string, string>()
  getItem(key: string): string | null { return this.values.get(key) ?? null }
  setItem(key: string, value: string): void { this.values.set(key, value) }
  removeItem(key: string): void { this.values.delete(key) }
}

const noEvents: EnaRuntimeEvent[] = []

function makeDeathMemory(floor: number, deathSource?: string): EnaPlayLogMemory {
  const memory = new EnaPlayLogMemory()
  memory.append({
    runId: `r-${floor}`,
    turnReached: floor,
    survived: false,
    usedHandCards: { ember: 1 } as Partial<Record<HandCardId, number>>,
    shopPurchases: [],
    deathReason: 'character_defeated',
    deathSource,
  })
  return memory
}

describe('EnaAutonomousLearner 구조화 기억', () => {
  it('런 종료 학습이 도달 층/결과/사망 원인을 구조화 기억으로 저장한다(version 1 유지)', () => {
    const storage = new MemoryStorage()
    const learner = new EnaAutonomousLearner(storage)
    learner.learnAfterRun(makeDeathMemory(37, '양초 거미'), noEvents, '2026-07-10T00:00:00.000Z')

    const saved = JSON.parse(storage.getItem(ENA_SELF_LEARNING_STORAGE_KEY) ?? '{}') as EnaAutonomousLearningState
    expect(saved.version).toBe(1)
    expect(saved.memories).toHaveLength(1)
    expect(saved.memories![0]).toMatchObject({ outcome: 'died', floor: 37, cause: '양초 거미' })
  })

  it('구조화 기억은 최근 12개만 유지한다', () => {
    const storage = new MemoryStorage()
    const learner = new EnaAutonomousLearner(storage)
    const memory = new EnaPlayLogMemory()
    for (let i = 1; i <= 15; i++) {
      memory.append({ runId: `r${i}`, turnReached: i, survived: false, usedHandCards: {}, shopPurchases: [], deathReason: 'character_defeated' })
      learner.learnAfterRun(memory, noEvents, '2026-07-10T00:00:00.000Z')
    }
    const saved = JSON.parse(storage.getItem(ENA_SELF_LEARNING_STORAGE_KEY) ?? '{}') as EnaAutonomousLearningState
    expect(saved.memories).toHaveLength(12)
    expect(saved.memories![11].floor).toBe(15)
  })

  it('회상은 도달 층/사망 원인을 채운 사실 기반 문장을 만들고 조사를 보정한다', () => {
    const storage = new MemoryStorage()
    const learner = new EnaAutonomousLearner(storage)
    learner.learnAfterRun(makeDeathMemory(37, '양초 거미'), noEvents)

    // 강제 회상을 여러 번 굴려 층수/원인 템플릿이 실제 값으로 채워지는지 확인한다.
    const lines = new Set<string>()
    for (let i = 0; i < 40; i++) {
      const line = learner.recallLineForNewRun(true)
      expect(line).not.toBeNull()
      expect(line!).not.toMatch(/[{}[\]]/)
      lines.add(line!)
    }
    const joined = [...lines].join('\n')
    expect(joined).toContain('37층')
    expect(joined).toContain('거미') // 사망 원인 회상
    expect(joined).not.toContain('거미은') // [은/는] 조사 보정 확인
  })

  it('같은 기억을 연속으로 반복 회상하지 않는다(직전 회상 키 저장)', () => {
    const storage = new MemoryStorage()
    const learner = new EnaAutonomousLearner(storage)
    learner.learnAfterRun(makeDeathMemory(37, '양초 거미'), noEvents)

    const first = learner.recallLineForNewRun(true)
    const second = learner.recallLineForNewRun(true)
    expect(first).not.toBeNull()
    expect(second).not.toBeNull()
    expect(second).not.toBe(first)
  })
})

describe('EnaAutonomousLearner bond 영속', () => {
  it('saveBond/loadBond가 기존 자기학습 저장 키에서 왕복되고 기존 필드를 깨지 않는다', () => {
    const storage = new MemoryStorage()
    const learner = new EnaAutonomousLearner(storage)
    learner.learnAfterRun(makeDeathMemory(10), noEvents, '2026-07-10T00:00:00.000Z')
    learner.saveBond(0.42)

    expect(learner.loadBond()).toBeCloseTo(0.42, 5)
    const saved = JSON.parse(storage.getItem(ENA_SELF_LEARNING_STORAGE_KEY) ?? '{}') as EnaAutonomousLearningState
    expect(saved.version).toBe(1)
    expect(saved.reflections).toHaveLength(1) // bond 저장이 기존 반성 기록을 지우지 않는다.
  })

  it('bond 필드가 없는 과거 스키마는 0으로 병합되고 범위를 클램프한다', () => {
    const storage = new MemoryStorage()
    storage.setItem(ENA_SELF_LEARNING_STORAGE_KEY, JSON.stringify({ version: 1, updatedAt: '', reflections: [] }))
    const learner = new EnaAutonomousLearner(storage)
    expect(learner.loadBond()).toBe(0)
    learner.saveBond(3)
    expect(learner.loadBond()).toBe(1)
  })

  it('저장소가 없으면 bond 저장/회상이 조용히 무시된다', () => {
    const learner = new EnaAutonomousLearner(undefined)
    learner.saveBond(0.5)
    expect(learner.loadBond()).toBe(0)
  })
})
