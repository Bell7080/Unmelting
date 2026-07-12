/**
 * EnaAutonomousLearner - 에나가 런 로그를 조용히 되새기는 내부 학습 장치.
 *
 * 플레이어에게 디버그 리포트를 보여주지 않고, EnaRuntimeObserver가 모은 실제 런 기록을
 * 요약해 다음 런의 성향/정책 연결에 쓸 수 있는 사적인 기억으로 저장한다.
 */

import type { HandCardId } from '@entities/HandCard'
import { getHandCardDef } from '@data/HandCards'
import { RELIC_DEFINITIONS, type RelicId } from '@data/Relics'
import { resolveKoreanParticles } from '@systems/CompanionSystem'
import {
  accumulateSpecialization,
  computeRunAdventureXp,
  normalizeSpecialization,
  type EnaRunDramaSignals,
  type EnaRunSpecializationSignals,
  type EnaSpecialization,
  type EnaSpecializationAxis,
} from '@systems/EnaDisposition'
import type { EnaPlayLogMemory, EnaPlayLogEntry } from './EnaEffectProbe'
import type { EnaRuntimeEvent } from './EnaRuntimeObserver'
import { EnaPolicyStore, type EnaPolicyStorage } from './EnaPolicyStore'

export const ENA_SELF_LEARNING_STORAGE_KEY = 'unmelting.ena.self-learning.v1'

/** 구조화 런 기억 1건 — 도달 층/사망 원인 같은 구체 사실 회상의 재료. */
export interface EnaRunMemory {
  outcome: 'died' | 'cleared' | 'retired'
  floor: number
  cause?: string
  note?: string
  runIndex: number
}

/** 최근 몇 개의 구조화 기억만 유지한다(회상은 최신 기억 위주라 길게 쌓을 필요가 없다). */
const MAX_RUN_MEMORIES = 12

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
  /** 플레이어와의 누적 유대(0~1). CompanionSystem이 세션 간 복원한다. version 1 유지 — 누락 시 0으로 병합. */
  bond?: number
  /** 누적 완주 런 수(참고용 병행 유지). version 1 유지 — 누락 시 reflections 길이로 폴백. */
  totalRuns?: number
  /** 누적 모험 xp — 에나 성장 곡선(computeEnaGrowth)의 주 입력. 누락(구버전) 시 totalRuns×보수 계수로 1회 이전. */
  adventureXp?: number
  /** 지금까지의 최고 도달 층 — 기록 경신(점프 자격) 판정용. */
  bestFloor?: number
  /** 이미 겪은 '첫 경험' 키 집합 — 첫 경험 xp의 1회성 보장. */
  experienced?: string[]
  /** 축 특화 점수(0~1, 단조) — 특정 축을 일관되게 먹인 플레이가 안전 상한을 넘겨 자라는 근거.
   *  version 1 유지 — 누락(구버전) 시 전 축 0으로 병합. */
  specialization?: Partial<Record<EnaSpecializationAxis, number>>
  /** 구체 회상용 구조화 기억(최근 12개). 누락 시 빈 배열로 병합. */
  memories?: EnaRunMemory[]
  /** 직전 회상 키 — 같은 기억/문형이 연속 반복되지 않게 한다. */
  lastRecallKey?: string
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
  if (dangerEvents.length > 0) signals.push({ kind: 'danger', id: 'immediate-threat', reward: dangerEvents.length * -0.1, confidence: Math.min(1, dangerEvents.length / 8) })
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
  if (signals.some((s) => s.kind === 'danger')) lessons.push('위험한 기척이 반복되면 예지와 도움을 더 신중히 한다.')
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

  /** 실제 런 종료 후 호출된다. 저장 정책을 확인하고, 런 로그 자기반성과 구조화 기억을 조용히 누적한다. */
  learnAfterRun(memory: EnaPlayLogMemory, events: readonly EnaRuntimeEvent[], now: string = new Date().toISOString()): EnaSelfReflection {
    const hasStoredPolicy = this.policyStore.load() !== undefined
    const reflection = summarizeSelfReflection(memory, events, hasStoredPolicy)
    this.saveReflection(reflection, now, buildRunMemory(memory))
    return reflection
  }

  /** 누적 완주 런 수(참고용). 구버전 저장본은 reflections 길이(최근 20 상한)로 폴백. */
  loadRunCount(): number {
    return runCountOf(this.loadState())
  }

  /** 누적 모험 xp — 성장 곡선의 주 입력. 구버전 저장본(totalRuns만 있음)은 보수 계수로 환산해 읽는다. */
  loadAdventureXp(): number {
    return adventureXpOf(this.loadState())
  }

  /**
   * 런 1회의 모험 xp를 계산·누적한다(성장의 유일한 적립 경로). 첫 경험 키는 저장된 집합으로
   * 걸러 1회성만 인정하고, 최고 기록(bestFloor)도 여기서 갱신한다. 반환: 이번 런에 적립된 xp.
   * 구버전 저장본은 첫 적립 시점에 totalRuns×보수 계수 이전값 위에 이어 쌓는다(1회 이전 확정).
   */
  accrueAdventureXp(run: {
    floorReached: number
    cleared: boolean
    decisions?: number
    progressTurns?: number
    experienceKeys?: readonly string[]
    drama?: EnaRunDramaSignals
  }): number {
    const state = this.loadState()
    const previousBestFloor = typeof state.bestFloor === 'number' && state.bestFloor > 0 ? state.bestFloor : 0
    const experienced = new Set(state.experienced ?? [])
    // 카테고리 1회성: 'rare-relic' 같은 무접미 키는 카테고리 자체가 키다.
    const firstExperiences = [...new Set(run.experienceKeys ?? [])].filter((key) => !experienced.has(key))
    const xp = computeRunAdventureXp({
      floorReached: run.floorReached,
      cleared: run.cleared,
      decisions: run.decisions,
      progressTurns: run.progressTurns,
      previousBestFloor,
      firstExperiences,
      drama: run.drama,
    })
    if (!this.storage) return xp
    for (const key of firstExperiences) experienced.add(key)
    state.adventureXp = adventureXpOf(state) + xp
    state.bestFloor = Math.max(previousBestFloor, Math.max(0, run.floorReached))
    state.experienced = [...experienced]
    this.storage.setItem(ENA_SELF_LEARNING_STORAGE_KEY, JSON.stringify(state))
    return xp
  }

  /** 저장된 축 특화(0~1). 구버전 저장본/손상 값은 전 축 0으로 병합한다. */
  loadSpecialization(): EnaSpecialization {
    return normalizeSpecialization(this.loadState().specialization)
  }

  /**
   * 런 1회의 행동 신호로 축 특화를 소량 적립·영속한다(단조, 축별 캡·총 캡·얕은 런 감쇠는
   * ENA_SPECIALIZATION_TUNING). 반환: 적립 후 특화 — 호출부가 CompanionSystem에 즉시 주입한다.
   */
  accrueSpecialization(signals: EnaRunSpecializationSignals): EnaSpecialization {
    const state = this.loadState()
    const next = accumulateSpecialization(state.specialization, signals)
    if (this.storage) {
      state.specialization = next
      this.storage.setItem(ENA_SELF_LEARNING_STORAGE_KEY, JSON.stringify(state))
    }
    return next
  }

  /** 저장된 누적 유대(0~1). 없거나 손상됐으면 0. */
  loadBond(): number {
    const bond = this.loadState().bond
    return typeof bond === 'number' && Number.isFinite(bond) ? Math.max(0, Math.min(1, bond)) : 0
  }

  /** 누적 유대를 기존 자기학습 저장에 함께 남긴다(별도 키를 만들지 않는다). */
  saveBond(bond: number): void {
    if (!this.storage) return
    const state = this.loadState()
    state.bond = Math.max(0, Math.min(1, bond))
    this.storage.setItem(ENA_SELF_LEARNING_STORAGE_KEY, JSON.stringify(state))
  }

  /**
   * 새 런 시작 때 에나가 자연스럽게 꺼낼 수 있는 기억 한 줄. 없으면 침묵한다.
   * bondBonus(0~0.15)는 유대가 깊을수록 회상을 조금 더 자주 허용한다.
   */
  recallLineForNewRun(force = false, bondBonus = 0): string | null {
    const state = this.loadState()
    const last = state.reflections[state.reflections.length - 1]
    const memories = state.memories ?? []
    if (!last && memories.length === 0) return null
    // 매번 말하면 기억이 디버그처럼 느껴지므로, 필요할 때만 드문 회상을 허용한다.
    const chance = 0.45 + Math.max(0, Math.min(0.15, bondBonus))
    if (!force && Math.random() >= chance) return null

    // 구체 기억이 있으면 사실 기반 문장을 우선한다(직전 회상 키와 겹치지 않는 것만).
    const fact = pickFactRecall(memories, state.lastRecallKey)
    if (fact) {
      this.saveRecallKey(state, fact.key)
      return fact.line
    }
    if (!last) return null

    const danger = last.preferenceSignals.find((signal) => signal.kind === 'danger')
    if (danger && last.lastOutcome === 'defeated') return '지난번엔 위협을 늦게 봤어. 이번엔 먼저 살필게.'

    const bestHand = last.preferenceSignals
      .filter((signal) => signal.kind === 'hand' && signal.reward > 0)
      .sort((a, b) => b.reward - a.reward)[0]
    if (bestHand) return `전에 ${handName(bestHand.id)} 덕분에 오래 버텼어. 그런 기회는 기억해 둘게.`

    const shop = last.preferenceSignals.find((signal) => signal.kind === 'shop')
    if (shop) return shop.id.includes('resource') ? '너는 자원이 흔들릴 때 상점을 잘 써. 이번에도 불씨부터 볼게.' : '지난 선택들도 기억하고 있어. 이번엔 더 조용히 살펴볼게.'

    return last.lastOutcome === 'survived' ? '지난 여정의 리듬은 남아 있어. 이번에도 그 흐름을 따라가 보자.' : '지난 실패는 잊지 않았어. 이번엔 조금 더 먼저 볼게.'
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

  private saveReflection(reflection: EnaSelfReflection, now: string, runMemory: EnaRunMemory | null): void {
    if (!this.storage) return
    const state = this.loadState()
    // 성장 곡선용 누적 런 수 — reflections는 20개로 잘리므로 별도 카운터로 계속 센다.
    state.totalRuns = runCountOf(state) + 1
    state.updatedAt = now
    state.reflections.push(reflection)
    // 장기 저장은 최근 흐름만 있으면 충분하므로 너무 큰 localStorage 사용을 피한다.
    if (state.reflections.length > 20) state.reflections.splice(0, state.reflections.length - 20)
    if (runMemory) {
      state.memories = [...(state.memories ?? []), runMemory].slice(-MAX_RUN_MEMORIES)
    }
    this.storage.setItem(ENA_SELF_LEARNING_STORAGE_KEY, JSON.stringify(state))
  }

  private saveRecallKey(state: EnaAutonomousLearningState, key: string): void {
    if (!this.storage) return
    state.lastRecallKey = key
    this.storage.setItem(ENA_SELF_LEARNING_STORAGE_KEY, JSON.stringify(state))
  }
}

/** 저장 상태의 누적 런 수. totalRuns가 없는 구버전 저장본은 reflections 길이로 폴백한다. */
function runCountOf(state: EnaAutonomousLearningState): number {
  const total = state.totalRuns
  if (typeof total === 'number' && Number.isFinite(total) && total >= 0) return Math.floor(total)
  return state.reflections.length
}

/** 구 저장본(런 수만 있음) → 모험 xp 1회 이전 보수 계수. 층 기록이 없어 얕은 런 가정으로 낮게 잡는다. */
export const LEGACY_XP_PER_RUN = 12

/** 저장 상태의 누적 모험 xp. adventureXp가 없는 구버전 저장본은 totalRuns×보수 계수로 환산한다. */
function adventureXpOf(state: EnaAutonomousLearningState): number {
  const xp = state.adventureXp
  if (typeof xp === 'number' && Number.isFinite(xp) && xp >= 0) return xp
  return runCountOf(state) * LEGACY_XP_PER_RUN
}

/** 희귀(rare) 이상으로 치는 유물 등급 — '희귀 유물 첫 획득' 판정. */
const RARE_PLUS_RARITIES = new Set(['rare', 'epic', 'unique', 'legendary'])

/**
 * 이번 런 로그에서 '처음 겪는 경험' 후보 키를 도출한다(1회성 필터는 accrueAdventureXp의 저장 집합).
 * 층/클리어와 상점 구매 로그처럼 이미 관측되는 사실에서만 만든다 — 별도 런타임 배선 불필요.
 */
export function deriveRunExperienceKeys(run: {
  floorReached: number
  cleared: boolean
  shopPurchases: readonly string[]
}): string[] {
  const keys = new Set<string>()
  // 보스 격파: 해당 보스 층을 '지나야'(전투 승리 후 진행) 격파로 친다. 클리어는 100F 격파.
  if (run.floorReached > 30 || run.cleared) keys.add('boss-kill:30')
  if (run.floorReached > 60 || run.cleared) keys.add('boss-kill:60')
  if (run.floorReached > 90 || run.cleared) keys.add('boss-kill:90')
  if (run.cleared) keys.add('boss-kill:100')
  // 제단(30턴)·별빛 등반(90층 이후) 도달.
  if (run.floorReached >= 30) keys.add('altar')
  if (run.floorReached >= 91 || run.cleared) keys.add('starlight')
  for (const purchase of run.shopPurchases) {
    if (purchase.startsWith('relic:')) {
      const def = RELIC_DEFINITIONS[purchase.slice('relic:'.length) as RelicId]
      if (def && RARE_PLUS_RARITIES.has(def.rarity)) keys.add('rare-relic')
    }
    // 해금팩 사용(팩 구매/픽) — 새 카드 첫 해금 경험.
    if (purchase === 'pack:unlock-pack' || purchase === 'pick:unlock-pack') keys.add('card-unlock')
  }
  return [...keys]
}

/**
 * '새로운 체계적 시도' 신호 — 과거 런들에서 한 번도 안 쓰던 카드를 이번 런에 유의미하게(2회+)
 * 사용한 종 수. 한 번 실험만으로는 새 전략으로 치지 않는다(드라마 novelty 계열 입력).
 */
export function countNovelCardUses(entries: readonly EnaPlayLogEntry[]): number {
  const last = entries[entries.length - 1]
  if (!last) return 0
  const seen = new Set<string>()
  for (const entry of entries.slice(0, -1)) for (const id of Object.keys(entry.usedHandCards)) seen.add(id)
  return Object.entries(last.usedHandCards).filter(([id, uses]) => !seen.has(id) && (uses ?? 0) >= 2).length
}

/** 마지막 런 로그를 구조화 기억 1건으로 요약한다. 로그가 없으면 null. */
function buildRunMemory(memory: EnaPlayLogMemory): EnaRunMemory | null {
  const entries = memory.all()
  const last = entries[entries.length - 1]
  if (!last) return null
  return {
    outcome: last.survived ? 'cleared' : 'died',
    floor: last.turnReached,
    cause: last.deathSource,
    runIndex: entries.length,
  }
}

/**
 * 최신 구조화 기억에서 사실 기반 회상 후보를 만들고, 직전 회상 키와 다른 하나를 고른다.
 * 모든 문형은 '지난(번)' + '이번'을 담아 회고→기약의 톤을 유지한다.
 */
function pickFactRecall(
  memories: readonly EnaRunMemory[],
  lastRecallKey: string | undefined
): { key: string; line: string } | null {
  const m = memories[memories.length - 1]
  if (!m) return null
  const options: Array<{ key: string; line: string }> = []
  if (m.outcome === 'cleared') {
    options.push({ key: `${m.runIndex}:clear-a`, line: '지난번 여정은 끝까지 닿았지. 이번에도 그 빛까지 가 보자.' })
    options.push({ key: `${m.runIndex}:clear-b`, line: `지난번엔 ${m.floor}층의 빛을 봤어. 이번 길도 곁에서 볼게.` })
  } else {
    options.push({ key: `${m.runIndex}:floor-a`, line: `지난번엔 ${m.floor}층에서 멈췄지. 이번엔 더 가 보자.` })
    if (m.floor >= 60) {
      options.push({ key: `${m.runIndex}:floor-b`, line: `지난번엔 ${m.floor}층까지 갔어. 그 길, 이번에도 기억하고 있어.` })
    }
    if (m.cause) {
      options.push({ key: `${m.runIndex}:cause-a`, line: resolveKoreanParticles(`지난번 ${m.cause}[은/는] 이제 요령을 알 것 같아. 이번엔 덜 아플 거야.`) })
      options.push({ key: `${m.runIndex}:cause-b`, line: resolveKoreanParticles(`${m.floor}층의 ${m.cause}[을/를] 지난번엔 못 넘었지. 이번엔 먼저 준비하자.`) })
    }
  }
  const fresh = options.filter((option) => option.key !== lastRecallKey)
  const pool = fresh.length > 0 ? fresh : options
  if (pool.length === 0) return null
  return pool[Math.floor(Math.random() * pool.length)]
}

/** 브라우저 localStorage가 없을 수 있는 테스트/SSR 환경에서 안전하게 learner를 만든다. */
export function createBrowserEnaAutonomousLearner(): EnaAutonomousLearner {
  const storage = typeof globalThis === 'undefined' ? undefined : (globalThis as { localStorage?: EnaPolicyStorage }).localStorage
  return new EnaAutonomousLearner(storage)
}


function handName(id: string): string {
  // preference signal의 id는 실제 손패 ID에서 오지만, 저장값 변조에 대비해 원문 fallback을 둔다.
  const def = getHandCardDef(id as HandCardId)
  return def?.name ?? id
}
