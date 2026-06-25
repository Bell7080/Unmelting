/**
 * EnaAutonomousLearner - 에나가 런 로그를 조용히 되새기는 내부 학습 장치.
 *
 * 플레이어에게 디버그 리포트를 보여주지 않고, EnaRuntimeObserver가 모은 실제 런 기록을
 * 요약해 다음 런의 성향/정책 연결에 쓸 수 있는 사적인 기억으로 저장한다.
 */

import type { EnaPlayLogMemory } from './EnaEffectProbe'
import type { EnaRuntimeEvent } from './EnaRuntimeObserver'
import { EnaPolicyStore, type EnaPolicyStorage } from './EnaPolicyStore'

export const ENA_SELF_LEARNING_STORAGE_KEY = 'unmelting.ena.self-learning.v1'

export interface EnaRuntimePreferenceSignal {
  kind: 'hand' | 'shop' | 'danger'
  id: string
  reward: number
  confidence: number
}

export interface EnaSelfReflection {
  runCount: number
  lastOutcome: 'survived' | 'defeated' | 'unknown'
  /** 에나가 스스로 남기는 압축 교훈. UI에 표시하지 않는 내부 기억이다. */
  lessons: string[]
  preferenceSignals: EnaRuntimePreferenceSignal[]
  hasStoredPolicy: boolean
}

export interface EnaAutonomousLearningState {
  version: 1
  updatedAt: string
  reflections: EnaSelfReflection[]
}

/** 런 로그를 손패/상점/위험 선호 신호로 압축한다. 실제 플레이에서 나온 결과만 사용한다. */
export function buildRuntimePreferenceSignals(memory: EnaPlayLogMemory, events: readonly EnaRuntimeEvent[]): EnaRuntimePreferenceSignal[] {
  const signals: EnaRuntimePreferenceSignal[] = []
  for (const adjustment of memory.tuneHandCardValues()) {
    signals.push({
      kind: 'hand',
      id: adjustment.id,
      reward: adjustment.valueDelta,
      confidence: Math.min(1, adjustment.usageCount / 6),
    })
  }

  const shopCounts = new Map<string, number>()
  for (const event of events) if (event.kind === 'shop') shopCounts.set(event.detail, (shopCounts.get(event.detail) ?? 0) + 1)
  for (const [id, count] of shopCounts) signals.push({ kind: 'shop', id, reward: Math.min(2, count * 0.25), confidence: Math.min(1, count / 4) })

  const dangerEvents = events.filter((event) => event.frameSummary.includes('위협'))
  if (dangerEvents.length > 0) signals.push({ kind: 'danger', id: 'rail-threat', reward: dangerEvents.length * -0.1, confidence: Math.min(1, dangerEvents.length / 8) })
  return signals.slice(0, 24)
}

/** 플레이어에게 보이지 않는 짧은 자기 교훈을 만든다. 수치 덤프 대신 다음 판단에 쓸 문장만 남긴다. */
export function summarizeSelfReflection(memory: EnaPlayLogMemory, events: readonly EnaRuntimeEvent[], hasStoredPolicy: boolean): EnaSelfReflection {
  const entries = memory.all()
  const last = entries[entries.length - 1]
  const signals = buildRuntimePreferenceSignals(memory, events)
  const lessons: string[] = []

  if (last) lessons.push(last.survived ? `${last.turnReached}턴까지 버틴 선택은 보존한다.` : `${last.turnReached}턴에서 쓰러진 이유(${last.deathReason ?? 'unknown'})를 다음 예지에서 경계한다.`)
  const bestHand = signals.filter((s) => s.kind === 'hand').sort((a, b) => b.reward - a.reward)[0]
  if (bestHand && bestHand.reward > 0) lessons.push(`${bestHand.id} 사용은 생존에 도움이 된 편이라 가치 평가를 올린다.`)
  const riskyHand = signals.filter((s) => s.kind === 'hand').sort((a, b) => a.reward - b.reward)[0]
  if (riskyHand && riskyHand.reward < 0) lessons.push(`${riskyHand.id} 사용 뒤 결과가 나빴으니 과신하지 않는다.`)
  if (signals.some((s) => s.kind === 'danger')) lessons.push('레일 위협 문장이 반복되면 예지/클러치 판단을 더 신중히 한다.')
  if (lessons.length === 0) lessons.push('아직 뚜렷한 교훈이 없어 기존 성향을 유지한다.')

  return {
    runCount: entries.length,
    lastOutcome: last ? (last.survived ? 'survived' : 'defeated') : 'unknown',
    lessons: lessons.slice(0, 5),
    preferenceSignals: signals,
    hasStoredPolicy,
  }
}

export class EnaAutonomousLearner {
  private readonly policyStore: EnaPolicyStore

  constructor(
    private readonly storage: EnaPolicyStorage | undefined,
    policyStore: EnaPolicyStore = new EnaPolicyStore(storage)
  ) {
    this.policyStore = policyStore
  }

  /** 실제 런 종료 후 호출된다. 저장 정책을 확인하고, 런 로그 자기반성만 조용히 누적한다. */
  learnAfterRun(memory: EnaPlayLogMemory, events: readonly EnaRuntimeEvent[], now: string = new Date().toISOString()): EnaSelfReflection {
    const hasStoredPolicy = this.policyStore.load() !== undefined
    const reflection = summarizeSelfReflection(memory, events, hasStoredPolicy)
    this.saveReflection(reflection, now)
    return reflection
  }

  loadState(): EnaAutonomousLearningState {
    if (!this.storage) return { version: 1, updatedAt: '', reflections: [] }
    const raw = this.storage.getItem(ENA_SELF_LEARNING_STORAGE_KEY)
    if (!raw) return { version: 1, updatedAt: '', reflections: [] }
    try {
      const parsed = JSON.parse(raw) as EnaAutonomousLearningState
      return parsed.version === 1 ? parsed : { version: 1, updatedAt: '', reflections: [] }
    } catch {
      // 손상된 자기학습 저장값은 버리고 새로 쌓는다. 플레이어에게 오류를 노출하지 않는다.
      return { version: 1, updatedAt: '', reflections: [] }
    }
  }

  private saveReflection(reflection: EnaSelfReflection, now: string): void {
    if (!this.storage) return
    const state = this.loadState()
    state.updatedAt = now
    state.reflections.push(reflection)
    // 장기 저장은 최근 흐름만 있으면 충분하므로 너무 큰 localStorage 사용을 피한다.
    if (state.reflections.length > 20) state.reflections.splice(0, state.reflections.length - 20)
    this.storage.setItem(ENA_SELF_LEARNING_STORAGE_KEY, JSON.stringify(state))
  }
}

/** 브라우저 localStorage가 없을 수 있는 테스트/SSR 환경에서 안전하게 learner를 만든다. */
export function createBrowserEnaAutonomousLearner(): EnaAutonomousLearner {
  const storage = typeof globalThis === 'undefined' ? undefined : (globalThis as { localStorage?: EnaPolicyStorage }).localStorage
  return new EnaAutonomousLearner(storage)
}
