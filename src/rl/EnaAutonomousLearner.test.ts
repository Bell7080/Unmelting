import { describe, expect, it } from 'vitest'
import type { HandCardId } from '@entities/HandCard'
import { EnaPlayLogMemory } from './EnaEffectProbe'
import type { EnaRuntimeEvent } from './EnaRuntimeObserver'
import { EnaAutonomousLearner, ENA_SELF_LEARNING_STORAGE_KEY, buildRuntimePreferenceSignals } from './EnaAutonomousLearner'
import type { EnaPolicyStorage } from './EnaPolicyStore'

class MemoryStorage implements EnaPolicyStorage {
  private readonly values = new Map<string, string>()
  getItem(key: string): string | null { return this.values.get(key) ?? null }
  setItem(key: string, value: string): void { this.values.set(key, value) }
  removeItem(key: string): void { this.values.delete(key) }
}

function makeMemory(): EnaPlayLogMemory {
  const memory = new EnaPlayLogMemory()
  memory.append({ runId: 'r1', turnReached: 40, survived: true, usedHandCards: { ember: 2 } as Partial<Record<HandCardId, number>>, shopPurchases: ['pack:resource'] })
  memory.append({ runId: 'r2', turnReached: 12, survived: false, usedHandCards: { sweep: 1 } as Partial<Record<HandCardId, number>>, shopPurchases: [], deathReason: 'web' })
  return memory
}

const events: EnaRuntimeEvent[] = [
  { kind: 'hand', turn: 8, detail: 'ember', frameSummary: '8턴 HP 10/20, 즉시 위험 낮음' },
  { kind: 'shop', turn: 10, detail: 'pack:resource', frameSummary: '10턴 HP 9/20, 즉시 위험 낮음' },
  { kind: 'run-end', turn: 12, detail: 'defeated:web', frameSummary: '12턴 HP 0/20, 현재 전방 위협 99' },
]

describe('EnaAutonomousLearner', () => {
  it('실제 런 로그를 에나 내부 선호 신호로 압축한다', () => {
    const signals = buildRuntimePreferenceSignals(makeMemory(), events)

    expect(signals.some((signal) => signal.kind === 'hand')).toBe(true)
    expect(signals.some((signal) => signal.kind === 'shop' && signal.id === 'pack:resource')).toBe(true)
    expect(signals.some((signal) => signal.kind === 'danger')).toBe(true)
  })

  it('플레이어에게 보여주지 않는 자기반성을 저장한다', () => {
    const storage = new MemoryStorage()
    const learner = new EnaAutonomousLearner(storage)
    const reflection = learner.learnAfterRun(makeMemory(), events, '2026-06-25T00:00:00.000Z')

    expect(reflection.lessons.length).toBeGreaterThan(0)
    const saved = JSON.parse(storage.getItem(ENA_SELF_LEARNING_STORAGE_KEY) ?? '{}')
    expect(saved.reflections).toHaveLength(1)
  })



  it('저장된 자기반성을 새 런의 자연스러운 기억 대사로 바꾼다', () => {
    const storage = new MemoryStorage()
    const learner = new EnaAutonomousLearner(storage)
    learner.learnAfterRun(makeMemory(), events, '2026-06-25T00:00:00.000Z')

    const line = learner.recallLineForNewRun(true)

    expect(line).toContain('지난번')
    expect(line).toContain('이번')
    expect(line).not.toContain('레일')
  })

  it('저장소가 없어도 런 종료 학습은 조용히 계산만 하고 실패하지 않는다', () => {
    const learner = new EnaAutonomousLearner(undefined)
    const reflection = learner.learnAfterRun(makeMemory(), events)

    expect(reflection.runCount).toBe(2)
    expect(learner.loadState().reflections).toHaveLength(0)
  })
})
