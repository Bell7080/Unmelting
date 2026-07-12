/**
 * CompanionSystem - 동료 캐릭터(에나)의 반응 "엔진".
 *
 * "무엇을 말하는가"(대사 데이터)는 src/data/CompanionLines.ts가 갖고,
 * 이 파일은 "언제/어떻게 고르는가"(빈도·연타·학습·클러치 판단)만 담당한다.
 *
 * 대사는 LLM 생성이 아니라 사전 작성이며, 세 겹으로 변주한다(B안 = 가짜 LLM):
 *   1) 완성 문장 / 템플릿({슬롯}+값 풀) 조합
 *   2) 말투 변조 토큰({강조}{종결}{재촉})을 긴급도에 맞춰 치환
 *   3) `{단어}[은/는]` 조사 토큰을 앞 글자 받침에 맞춰 자동 보정
 * (설계: Ena_Companion_AI_Design.md)
 */

import {
  POOLS,
  CATEGORY_COMMENTS,
  CARD_COMMENTS,
  USE_CARD_COMMENTS,
  USE_COMMENTS,
  JOB_LINES,
  JOB_GENERIC,
  CLUTCH_LINES,
  MINOR_CLUTCH_LINES,
  AWAKEN_LINES,
  ENEMY_LINES,
  RELIC_LINES,
  RELIC_RARITY_LINES,
  GENERIC_BUY_LINES,
  PREDICT_LINES,
  BOSS_INTRO_LINES,
  BOSS_INTRO_BY_NAME,
  BOSS_PHASE_LINES,
  BOSS_KILL_LINES,
  BOSS_KILL_BY_NAME,
  DEATH_LINES,
  CLEAR_LINES,
  TRIAL_LINES,
  STARLIGHT_LINES,
  PACK_LINES,
  CALLBACK_LINES,
} from '@data/CompanionLines'
import type { CardRarity } from '@data/ShopPools'
import type {
  Line,
  LineTemplate,
  PoolId,
  TouchPoolId,
  SituationId,
  ClutchKind,
  MinorClutchKind,
  PackLineKind,
  CallbackKind,
} from '@data/CompanionLines'
import type { HandCategory, HandCardId } from '@entities/HandCard'
import {
  defaultDisposition,
  clampDisposition,
  revertDispositionTowardBase,
  growthAnchorDisposition,
  type EnaDisposition,
  type SupportRoleWeights,
} from './EnaDisposition'

// 대사 데이터 쪽 타입을 그대로 다시 노출해 기존 import 경로(@systems/CompanionSystem)를 유지한다.
export type { Line, LineTemplate, SituationId, ClutchKind, MinorClutchKind, PackLineKind, CallbackKind }

/** 콜백 대사의 재료가 되는 최근 사건 한 건(링버퍼 항목). */
export interface RecentCompanionEvent {
  kind: 'hit' | 'kill' | 'web' | 'treasure' | 'clutch'
  enemyName?: string
  turn: number
}

/** 반응을 고를 때 함께 보는, 호출 시점의 게임 상황. */
export interface CompanionContext {
  /** 체력/불씨가 위태로운 위급 상황인가. */
  danger: boolean
}

/** 말투 강도 — 같은 내용도 종결부호/강조어를 달리해 톤을 바꾼다. */
export type Intensity = 'soft' | 'normal' | 'urgent'

/** 클러치 1회 계획: 효과 종류/수치 + 거의 확정 대사 + 체인 배너 설명. */
export interface ClutchPlan {
  kind: ClutchKind
  amount: number
  line: string
  flavor: string
  /** 손패 보급 클러치일 때 실제로 건넬 카드. 런타임과 시뮬의 지원 어휘를 맞춘다. */
  cardId?: HandCardId
}
/** 클러치 판단에 필요한 현재 상태 스냅샷. */
export interface ClutchContext {
  hp: number
  maxHp: number
  hpRatio: number
  emberLow: boolean
  /** 위험 예지/조합각 등으로 지금 건네면 좋은 손패. 없으면 회복·방패·성냥만 본다. */
  supportCardId?: HandCardId | null
  /** 사람이 읽는 로그/배너용 지원 이유. */
  supportReason?: string
  /** 대사 {이유} 슬롯에 섞는 짧은 명사구(HandCardAdvisor reason). */
  supportShortReason?: string | null
}

/** 소소한 클러치 판정에 붙는 맥락. 역경/유대가 클라이맥스 상한을 임시로 연다. */
export interface MinorClutchContext {
  /** 죽음 직전·강적·보상 실패처럼 평소보다 극적인 순간인가. */
  adversity?: boolean
  /** 유대 보정 강제 오버라이드. 생략하면 누적 bond(≥0.35)에서 자동 파생된다. */
  bond?: boolean
}

/** 런 종료 신호 — per-player 성향 온라인 적응의 입력. */
export interface EnaLearningSnapshot {
  /** 런 안에서 바로 움직이는 수다 가중치 평균. 경험 탭의 실시간 수다 표시용이다. */
  chattiness: number
  /** 예측 대비가 이번 런에서 유용했는지 보는 단기 가중치. */
  predictiveWeight: number
  /** 상황별 단기 수다 가중치 복사본. */
  situationWeight: Record<SituationId, number>
}

export interface RunOutcome {
  /** 사망으로 끝났는가(아니면 클리어/도달). */
  died: boolean
  /** 도달한 층(≈ 턴). 깊이 살아남았는지 판단에 쓴다. */
  floorReached: number
}

// ── 조사 보정 ────────────────────────────────────────────────

function hasFinalConsonant(ch?: string): boolean {
  if (!ch) return false
  const code = ch.charCodeAt(0)
  if (code < 0xac00 || code > 0xd7a3) return false
  return (code - 0xac00) % 28 !== 0
}

function finalIsRieul(ch?: string): boolean {
  if (!ch) return false
  const code = ch.charCodeAt(0)
  if (code < 0xac00 || code > 0xd7a3) return false
  return (code - 0xac00) % 28 === 8
}

/** ㄹ 받침이 뒤항을 따르는 특수쌍('서울로', '기니'). 일반쌍 규칙보다 먼저 검사한다. */
const RIEUL_DROP_PAIRS = new Set(['으로/로', '으니/니'])

/**
 * `앞글자[A/B]` 조사 토큰을 받침 유무로 해석한다.
 *   - 일반쌍: 받침 있으면 A, 없으면 B (을/를, 은/는, 이/가, 과/와, 아/야, 이었/였, 이라/라 …)
 *   - '으로/로'·'으니/니' 특수쌍: 받침 없거나 ㄹ받침이면 뒤항(로/니), 그 외엔 앞항(으로/으니)
 */
export function resolveKoreanParticles(text: string): string {
  return text.replace(/(.)?\[([^\]/]+)\/([^\]]+)\]/g, (_m, prev: string | undefined, a: string, b: string) => {
    const base = prev ?? ''
    if (RIEUL_DROP_PAIRS.has(`${a}/${b}`)) {
      const useShort = !hasFinalConsonant(prev) || finalIsRieul(prev)
      return base + (useShort ? b : a)
    }
    return base + (hasFinalConsonant(prev) ? a : b)
  })
}

// ── 말투 변조 ────────────────────────────────────────────────

const TONE: Record<Intensity, Record<'강조' | '종결' | '재촉', readonly string[]>> = {
  soft: { 강조: [''], 종결: ['…', '.'], 재촉: [''] },
  normal: { 강조: [''], 종결: ['!', '.'], 재촉: [''] },
  urgent: { 강조: ['얼른 ', '어서 ', '당장 '], 종결: ['!', '!!'], 재촉: [' 어서!', ' 서둘러!', ''] },
}
const TONE_TOKENS = new Set(['강조', '종결', '재촉'])

function randOf(arr: readonly string[]): string {
  return arr[Math.floor(Math.random() * arr.length)]
}

function clampInt(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(v)))
}

/** 적 이름에서 핵심 낱말('양초 거미'→'거미')을 찾아 전용 반응 풀을 돌려준다(없으면 null). */
function matchEnemyKeyword(name: string): { key: string; lines: Line[] } | null {
  for (const key of Object.keys(ENEMY_LINES)) {
    if (name.includes(key)) return { key, lines: ENEMY_LINES[key] }
  }
  return null
}

/** 한 줄(문자열/템플릿)을 긴급도에 맞춰 렌더한다: 변조/슬롯 치환 → 조사 보정.
 *  데이터 품질 테스트가 같은 경로를 검사할 수 있게 export한다.
 *  extraSlots는 데이터의 기본 슬롯 풀을 런타임 값(예: 지원 이유 구)으로 덮는다. */
export function renderLine(line: Line, intensity: Intensity, extraSlots?: Record<string, readonly string[]>): string {
  const template = typeof line === 'string' ? line : line.template
  const slots: Record<string, readonly string[]> = { ...(typeof line === 'string' ? {} : line.slots), ...(extraSlots ?? {}) }
  const tone = TONE[intensity]
  const filled = template.replace(/\{([^}]+)\}/g, (_m, name: string) => {
    if (TONE_TOKENS.has(name)) return randOf(tone[name as '강조' | '종결' | '재촉'])
    const pool = slots[name]
    return pool && pool.length > 0 ? randOf(pool) : ''
  })
  return resolveKoreanParticles(filled)
}

/**
 * 데이터 품질 검사용: 한 줄이 만들 수 있는 완성 문장을 결정적으로 나열한다.
 * 각 토큰 자리(같은 이름이라도 자리마다 독립)를 혼합 기수로 순회해 슬롯×말투 조합을 빠짐없이 덮고,
 * 조합 폭발은 cap으로 제한한다(현재 대사 데이터는 cap 안에 전부 들어온다).
 */
export function enumerateLineRenders(line: Line, intensity: Intensity, cap = 4000): string[] {
  const template = typeof line === 'string' ? line : line.template
  const slots: Record<string, readonly string[]> = typeof line === 'string' ? {} : line.slots
  const tone = TONE[intensity]
  const tokenPattern = /\{([^}]+)\}/g
  const choicesPerToken: readonly string[][] = []
  for (const match of template.matchAll(tokenPattern)) {
    const name = match[1]
    const pool = TONE_TOKENS.has(name) ? tone[name as '강조' | '종결' | '재촉'] : slots[name]
    ;(choicesPerToken as string[][]).push(pool && pool.length > 0 ? [...pool] : [''])
  }
  const total = Math.min(cap, choicesPerToken.reduce((product, pool) => product * pool.length, 1))
  const out: string[] = []
  for (let combo = 0; combo < total; combo++) {
    let radix = combo
    let cursor = 0
    const filled = template.replace(tokenPattern, () => {
      const pool = choicesPerToken[cursor++]
      const pick = pool[radix % pool.length]
      radix = Math.floor(radix / pool.length)
      return pick
    })
    out.push(resolveKoreanParticles(filled))
  }
  return out
}

// ── 튜닝(빈도·강도) ──────────────────────────────────────────

/** 터치/상태 반응 풀의 기본 말투 강도. */
const POOL_INTENSITY: Record<TouchPoolId, Intensity> = {
  calm: 'normal',
  annoyed: 'normal',
  exasperated: 'urgent',
  urgent: 'urgent',
  quiet: 'soft',
}

/** 상황 바크별 기본 발화 확률 + 말투. 너무 수다스럽지 않게 낮게 둔다. */
const SITUATION: Record<SituationId, { chance: number; intensity: Intensity }> = {
  hit: { chance: 0.3, intensity: 'normal' },
  web: { chance: 0.35, intensity: 'normal' },
  treasure: { chance: 0.3, intensity: 'normal' },
  kill: { chance: 0.15, intensity: 'normal' },
  survive: { chance: 0.18, intensity: 'normal' },
  flower: { chance: 0.3, intensity: 'normal' },
  // 이벤트 문은 드물게 등장하므로 떴을 때는 비교적 자주 반응한다.
  event: { chance: 0.6, intensity: 'normal' },
  spore: { chance: 0.4, intensity: 'normal' },
  bomb: { chance: 0.55, intensity: 'normal' },
}

const STREAK_RESET_MS = 4000
/** 클러치 예산('의지') 최대치 — 역경(피해)으로 차고, 발동 시 0으로 비운다(구조 상한이라 성향과 분리). */
const WILL_MAX = 100
/** 최근 사건 링버퍼 크기 — 콜백 대사가 되짚는 기억의 폭. */
const RECENT_EVENT_MAX = 8
/** 상황 바크가 일반 풀 대신 콜백 대사를 우선할 확률(문맥이 있을 때만). */
const CALLBACK_CHANCE = 0.25
/** kill 콜백이 인정하는 '아까 맞았다' 기억의 턴 폭. */
const CALLBACK_HIT_MEMORY_TURNS = 3
/** treasure 콜백이 인정하는 '방금 도와줬다' 기억의 턴 폭. */
const CALLBACK_CLUTCH_MEMORY_TURNS = 5

// ── 지속 감정 상태(mood/bond) 튜닝 ──────────────────────────
/** mood 자연 회복 속도 — 매 턴 0으로 이만큼 수렴한다. */
const MOOD_RECOVERY_PER_TURN = 0.02
/** 상황별 mood 변화량. 대사 발화 여부와 무관하게 상황 자체가 기분을 흔든다.
 *  hit은 gainWill의 피해 비례 하락이 담당하므로 여기서 이중 반영하지 않는다. */
const MOOD_SHIFT: Record<SituationId, number> = {
  hit: 0,
  web: -0.05,
  treasure: 0.08,
  kill: 0.06,
  survive: -0.02,
  flower: 0.05,
  event: 0.02,
  spore: -0.05,
  bomb: -0.08,
}
/** 이 유대치 이상이면 소소한 클러치의 유대 보정이 자동으로 켜진다(과거 bond:true 하드코딩 대체). */
const BOND_CLUTCH_THRESHOLD = 0.35
/** 미숙(놓친 개입) 대사 기본 확률(베테랑, growth=1) — 기존 0.45 유지. */
const MISSED_POTENTIAL_BASE_CHANCE = 0.45
/** growth=0 초보일 때 미숙 대사에 더해지는 가점(0.45→0.70). */
const MISSED_POTENTIAL_ROOKIE_BONUS = 0.25

export class CompanionSystem {
  /** 성향 파라미터(임의값 그릇). 기본값은 기존 상수와 동일해 도입만으로 동작이 변하지 않는다.
   *  런-내 빠른 학습(situationWeight/predictiveWeight)이 런 종료 시 이 느린 성향으로 소화된다. */
  private disp: EnaDisposition

  /** 성장值(0~1). 평균회귀 앵커(ROOKIE→BASE)와 미숙 대사 빈도를 결정한다.
   *  기본 1(베테랑) = 기존 동작 보존 — 실제 성장 연동은 호출부(index.ts)가 setGrowth로 주입한다. */
  private growth = 1

  constructor(disposition: EnaDisposition = defaultDisposition(), growth = 1) {
    this.growth = Math.max(0, Math.min(1, growth))
    this.disp = disposition
  }

  /** 현재 성향 파라미터(저장/적응/디버그용). */
  getDisposition(): EnaDisposition {
    return this.disp
  }

  /** 현재 성장值(0~1). 경험 탭 등 추후 UI가 초보→베테랑 진행도를 읽는 조회 API. */
  getGrowth(): number {
    return this.growth
  }

  /** 성장值 주입 — 런 수/유대에서 계산한 computeEnaGrowth 결과를 호출부가 넣는다. */
  setGrowth(growth: number): void {
    this.growth = Math.max(0, Math.min(1, growth))
  }

  /** 지원 판단 역할 가중 — 예지/클러치가 HandCardAdvisor 환산값에 곱해 읽는다(없으면 1.0 취급). */
  getSupportRoleWeights(): SupportRoleWeights | undefined {
    return this.disp.supportRoleWeights
  }

  /** 경험 탭이 런-내 학습까지 볼 수 있도록 단기 가중치를 읽기 전용 스냅샷으로 제공한다. */
  getLearningSnapshot(): EnaLearningSnapshot {
    return {
      chattiness: this.chattiness(),
      predictiveWeight: this.predictiveWeight,
      situationWeight: { ...this.situationWeight },
    }
  }

  /** 런 내 지속 기분(-1~1). 피해·위협에 내려가고 처치·보물·레시피·보스 격파에 올라가며 턴마다 0으로 회복한다. */
  private mood = 0
  /** mood 자연 회복을 마지막으로 정산한 턴 — 턴을 아는 기존 훅이 지나갈 때 lazy하게 정산한다. */
  private lastMoodTurn = 0
  /** 런을 넘는 유대(0~1). 대사 열람·클러치 발동·런 종료로만 천천히 오르고 절대 내려가지 않는다. */
  private bond = 0
  /** 짧은 시간 내 연속 터치 횟수 — 반응 강도를 끌어올린다. */
  private touchStreak = 0
  private lastTouchAt = 0
  /** 마지막으로 월드 바크를 낸 턴 — 시간(쿨타임)이 아니라 '턴 간격'으로 빈도를 다스린다. */
  private lastWorldBarkTurn = -999
  /** 풀별 직전 선택 인덱스 — 같은 줄이 연속으로 나오지 않게 한다. */
  private readonly lastPick = new Map<string, number>()
  /** 풀별 최근 선택 이력 — 넓은 풀에서는 같은 대사가 여러 번 사이클 뒤에나 돌아오게 한다. */
  private readonly recentPickHistory = new Map<string, number[]>()
  /** 풀별 최근 완성 문장 — 템플릿 슬롯이 우연히 같은 문장으로 붙는 반복도 낮춘다. */
  private readonly recentRenderedHistory = new Map<string, string[]>()
  /**
   * 상황별 학습 가중치(0.2~1.8). 스킵하면 내려가 덜 말하고, 끝까지 읽어주면 올라가 더 말한다.
   * = 가짜 RL: "스킵 = 이 상황은 덜 중요하다"는 신호를 누적한다.
   */
  private readonly situationWeight: Record<SituationId, number> = {
    hit: 1,
    web: 1,
    treasure: 1,
    kill: 1,
    survive: 1,
    flower: 1,
    event: 1,
    spore: 1,
    bomb: 1,
  }
  /** 누적 스킵 횟수 — 과묵 안내 대사 타이밍에 쓴다. */
  private skipCount = 0
  /** 최근 사건 링버퍼(최대 8건) — 직전 사건을 되짚는 콜백 대사의 재료. 새 런에서 비운다. */
  private readonly recentEvents: RecentCompanionEvent[] = []
  /** 클러치 예산('에나의 의지'). 역경으로 차고 발동 시 0이 된다. */
  private will = 0
  /** 각성은 런당 한 번뿐. 새 런에서 resetForRun으로 풀린다. */
  private awakened = false
  /** 마지막 예측 대비 발동 턴(예측 남발 방지). */
  private lastPredictTurn = -999
  /** 후반부라면 도왔을 상황을 초반부에는 말로만 비추는 미숙 대사 쿨다운. */
  private lastMissedPotentialTurn = -999
  /**
   * 예측 대비 학습 가중치(0.2~1.8). 건넨 대비 카드를 플레이어가 곧 쓰면(유용) 오르고,
   * 기한 내 안 쓰면(불필요) 내려간다. = 가짜 RL: "이 대비가 도움이 됐나"를 누적.
   */
  private predictiveWeight = 1

  // ── 지속 감정 상태(mood/bond) ──────────────────────────────

  /** 현재 기분(-1~1). UI/디버그와 말투 보정에서 읽는다. */
  getMood(): number {
    return this.mood
  }

  /** 누적 유대(0~1). 회상 확률 가산 등 호출부 파생값에 쓴다. */
  getBond(): number {
    return this.bond
  }

  /** 저장소에서 복원한 유대를 주입한다(런을 넘는 영속값). */
  setBond(value: number): void {
    this.bond = Math.max(0, Math.min(1, value))
  }

  /** 외부 이벤트(보스 격파/레시피 발동 등)가 기분을 직접 흔들 때 쓴다. */
  noteMoodShift(delta: number): void {
    this.mood = Math.max(-1, Math.min(1, this.mood + delta))
  }

  /** 턴 경과에 따른 기분 자연 회복(턴당 0.02씩 0으로). 턴을 아는 기존 훅이 지나갈 때 호출된다. */
  syncMoodToTurn(turn: number): void {
    if (turn <= this.lastMoodTurn) return
    const recovery = (turn - this.lastMoodTurn) * MOOD_RECOVERY_PER_TURN
    this.lastMoodTurn = turn
    if (this.mood > 0) this.mood = Math.max(0, this.mood - recovery)
    else if (this.mood < 0) this.mood = Math.min(0, this.mood + recovery)
  }

  /** 유대는 느린 단조 성장만 한다 — 하락 경로를 두지 않는다. */
  private gainBond(amount: number): void {
    this.bond = Math.min(1, this.bond + Math.max(0, amount))
  }

  /**
   * 프로필을 만졌을 때. 연타 강도(streak)에 따라 calm→annoyed→exasperated로 반응한다.
   * 중복 출력 방지(이미 대사가 나오는 중엔 무시)는 호출부(UI)가 담당한다.
   */
  onProfileTouch(now: number, ctx: CompanionContext): string {
    if (now - this.lastTouchAt > STREAK_RESET_MS) this.touchStreak = 0
    this.touchStreak += 1
    this.lastTouchAt = now
    if (ctx.danger) return this.pickPool('urgent')
    const pool: TouchPoolId =
      this.touchStreak >= 6 ? 'exasperated' : this.touchStreak >= 3 ? 'annoyed' : 'calm'
    return this.pickPool(pool)
  }

  /** 연타 뒤 손을 뗐을 때(방치). 클릭 멈춤 자체에는 반응하지 않고 내부 연타 상태만 정리한다. */
  onSettle(): string | null {
    if (this.touchStreak === 0) return null
    this.touchStreak = 0
    return null
  }

  /**
   * 게임 이벤트 상황 반응. 시간 쿨다운이 아니라 턴 간격으로 빈도를 다스린다:
   * 직전 발화로부터 minTurnGap턴이 지났고, (기본확률×학습 가중치)에 걸렸을 때만.
   * important(위급 등)는 간격을 우회해 경고 기회를 보장한다.
   */
  reactSituation(
    id: SituationId,
    turn: number,
    intensityOverride?: Intensity,
    important = false,
    name?: string
  ): string | null {
    // 상황 자체는 발화 여부와 무관하게 기분을 흔든다(자연 회복 정산 → 상황 변화 반영).
    this.syncMoodToTurn(turn)
    this.noteMoodShift(MOOD_SHIFT[id])
    // 콜백 문맥은 이번 사건을 기록하기 전의 버퍼로 판정한다(자기 자신과의 비교 방지).
    const callbackKind = this.callbackContext(id, turn, name)
    if (id === 'hit' || id === 'kill' || id === 'web' || id === 'treasure') this.recordRecentEvent(id, turn, name)
    if (!important && turn - this.lastWorldBarkTurn < this.minTurnGap()) return null
    let chance = Math.min(0.95, this.disp.situationChance[id] * this.situationWeight[id])
    if (important) chance = Math.max(chance, 0.7)
    if (Math.random() >= chance) return null
    this.lastWorldBarkTurn = turn
    const intensity = intensityOverride ?? SITUATION[id].intensity
    // 직전 사건을 기억하는 콜백 대사를 낮은 확률로 우선해 '함께 겪는 중' 감각을 준다.
    if (callbackKind && Math.random() < CALLBACK_CHANCE) return this.callbackLine(callbackKind, name)
    // 적 이름이 주어지면 처치/생존 반응만 핵심 키워드('거미' 등) 전용 풀을 우선한다(수식어는 무시).
    const kw = (id === 'kill' || id === 'survive') && name ? matchEnemyKeyword(name) : null
    if (kw) return this.pickFrom(`enemy:${kw.key}`, kw.lines, intensity)
    return this.pickFrom(id, POOLS[id], intensity)
  }

  /** 최근 사건을 링버퍼에 남긴다(최대 8건). 상황 바크와 클러치가 자동으로 부르고, 호출부가 직접 남겨도 된다. */
  recordRecentEvent(kind: RecentCompanionEvent['kind'], turn: number, enemyName?: string): void {
    this.recentEvents.push({ kind, enemyName, turn })
    if (this.recentEvents.length > RECENT_EVENT_MAX) this.recentEvents.shift()
  }

  /** 지금 상황이 버퍼 속 직전 사건과 이어지는가(복수/연속 피격/도움 뒤 보상)를 판정한다. */
  private callbackContext(id: SituationId, turn: number, name?: string): CallbackKind | null {
    if (id === 'kill' && name) {
      const payback = this.recentEvents.some(
        (e) => e.kind === 'hit' && e.enemyName === name && turn - e.turn <= CALLBACK_HIT_MEMORY_TURNS
      )
      if (payback) return 'kill'
    }
    if (id === 'hit' && this.recentEvents.some((e) => e.kind === 'hit' && turn - e.turn === 1)) return 'hit'
    if (id === 'treasure' && this.recentEvents.some((e) => e.kind === 'clutch' && turn - e.turn <= CALLBACK_CLUTCH_MEMORY_TURNS)) {
      return 'treasure'
    }
    return null
  }

  /** 콜백 대사 한 줄. kill 콜백은 {적} 슬롯을 실제 적 이름으로 바꿔 방금 그 상대를 지목한다. */
  private callbackLine(kind: CallbackKind, enemyName?: string): string {
    const lines = CALLBACK_LINES[kind].map((line): Line => {
      const base: LineTemplate = typeof line === 'string' ? { template: line, slots: {} } : line
      return enemyName ? { template: base.template, slots: { ...base.slots, 적: [enemyName] } } : base
    })
    return this.pickFrom(`callback:${kind}`, lines, 'normal')
  }

  /** 상점 유물 구매 감상평. id 전용 → 등급별 → 공용 폴백. 구매는 드무니 늘 한마디 한다. */
  onBuyRelic(id: string, rarity: CardRarity): string {
    const lines = RELIC_LINES[id] ?? RELIC_RARITY_LINES[rarity] ?? GENERIC_BUY_LINES
    return this.pickFrom(`buy:${id in RELIC_LINES ? id : rarity}`, lines, 'normal')
  }

  /** 플레이어가 안 읽고 빨리 넘긴 상황 → 다음부터 덜 말한다(가짜 RL 부정 보상). */
  recordSkip(id: SituationId): void {
    this.skipCount += 1
    this.situationWeight[id] = Math.max(this.disp.weightFloor, this.situationWeight[id] * this.disp.skipDecay)
  }

  /** 플레이어가 대사를 끝까지 봐 준 상황 → 점점 더 수다스러워지고, 유대가 아주 조금 오른다. */
  recordHeard(id: SituationId): void {
    this.situationWeight[id] = Math.min(this.disp.weightMax, this.situationWeight[id] * this.disp.heardGrowth)
    this.gainBond(0.002)
  }

  /** 스킵이 누적됐을 때 가끔 '조용히 할게'류로 과묵해짐을 알린다(드물게). */
  maybeQuietRemark(): string | null {
    if (this.skipCount === 3 || (this.skipCount > 3 && this.skipCount % 6 === 0)) {
      return this.pickFrom('quiet', POOLS.quiet, 'soft')
    }
    return null
  }

  /** 손패 획득 한줄평. 성냥(불씨 상태별) → id 전용 → 카테고리 폴백 순. */
  onAcquireCard(
    cardId: string,
    category: HandCategory,
    turn: number,
    ctx?: { emberSufficient?: boolean }
  ): string | null {
    this.syncMoodToTurn(turn)
    if (turn - this.lastWorldBarkTurn < this.minTurnGap()) return null
    if (Math.random() >= this.disp.lootCommentChance) return null
    this.lastWorldBarkTurn = turn
    if (cardId === 'match') {
      const key: PoolId = (ctx?.emberSufficient ?? true) ? 'loot-match-ok' : 'loot-match-low'
      return this.pickFrom(key, POOLS[key], 'normal')
    }
    const bespoke = CARD_COMMENTS[cardId]
    if (bespoke) return this.pickFrom(`card:${cardId}`, bespoke, 'normal')
    return this.pickFrom(`cat:${category}`, CATEGORY_COMMENTS[category], 'normal')
  }

  /** 손패 '사용' 한줄평. 같은 턴 간격을 공유해 가끔만 능력을 언급한다. */
  onUseCard(cardId: string, category: HandCategory, turn: number): string | null {
    this.syncMoodToTurn(turn)
    if (turn - this.lastWorldBarkTurn < this.minTurnGap()) return null
    if (Math.random() >= this.disp.lootCommentChance) return null
    this.lastWorldBarkTurn = turn
    const bespoke = USE_CARD_COMMENTS[cardId]
    if (bespoke) return this.pickFrom(`use:${cardId}`, bespoke, 'normal')
    return this.pickFrom(`use-cat:${category}`, USE_COMMENTS[category], 'normal')
  }

  /** 직업 선택 직후의 시작 인사. 시작 한 번뿐이라 빈도 제한 없이 늘 나온다. */
  onJobSelect(jobId: string): string {
    const lines = JOB_LINES[jobId] ?? JOB_GENERIC
    return this.pickFrom(`job:${jobId}`, lines, 'normal')
  }

  // ── 클러치(에나의 의지): 대사만이 아니라 실제 서포팅 ──────────

  /** 피해를 입은 만큼 '의지'를 쌓는다(역경에 비례). 클러치 예산의 충전 + 기분 하락(피해 비례 소량). */
  gainWill(damage: number, maxHp: number): void {
    if (damage <= 0 || maxHp <= 0) return
    this.will = Math.min(WILL_MAX, this.will + Math.round((damage / maxHp) * this.disp.willGainPerDamage) + this.disp.willGainFlatBonus)
    this.noteMoodShift(-Math.min(0.25, (damage / maxHp) * 0.5))
  }

  /** 피해 외 지속 역경(불씨 고갈 등)으로도 의지를 조금 쌓는다. */
  gainWillFlat(amount: number): void {
    if (amount <= 0) return
    this.will = Math.min(WILL_MAX, this.will + amount)
  }

  /** 현재 의지 게이지(0~100). UI 표기/디버그용. */
  getWill(): number {
    return this.will
  }

  /**
   * 의지가 가득 찼고 위기일 때, '보통' 강도의 클러치 한 번을 계획해 돌려준다(아니면 null).
   * 우선순위: 체력 위기(회복/방패) > 불씨 위기(성냥) > 예지 손패 보급. 발동 시 의지를 0으로 비운다.
   */
  evaluateClutch(ctx: ClutchContext): ClutchPlan | null {
    if (this.will < WILL_MAX) return null
    if (ctx.hp > 0 && ctx.hpRatio <= this.disp.clutchHpThreshold) {
      this.will = 0
      this.gainBond(0.005) // 함께 위기를 넘긴 큰 클러치는 유대를 조금 더 올린다.
      this.recordRecentEvent('clutch', this.lastMoodTurn) // 콜백 대사('아까 도와준 보람') 재료.
      if (Math.random() < this.disp.clutchHealVsShield) {
        const amount = clampInt(ctx.maxHp * this.disp.clutchHealRatio * this.disp.clutchStrength, 4, 12)
        return { kind: 'heal', amount, line: this.pickFrom('clutch-heal', CLUTCH_LINES.heal, 'urgent'), flavor: '위기의 순간, 의지로 버텼다' }
      }
      const amount = clampInt(ctx.maxHp * this.disp.clutchShieldRatio * this.disp.clutchStrength, 3, 10)
      return { kind: 'shield', amount, line: this.pickFrom('clutch-shield', CLUTCH_LINES.shield, 'urgent'), flavor: '위기의 순간, 방패를 들어올렸다' }
    }
    if (ctx.emberLow) {
      this.will = 0
      this.gainBond(0.005)
      this.recordRecentEvent('clutch', this.lastMoodTurn)
      return { kind: 'ember', amount: 1, cardId: 'match' as HandCardId, line: this.pickFrom('clutch-ember', CLUTCH_LINES.ember, 'urgent'), flavor: '불씨가 꺼지기 전에' }
    }
    if (ctx.supportCardId) {
      this.will = 0
      this.gainBond(0.005)
      this.recordRecentEvent('clutch', this.lastMoodTurn)
      // '왜 이 카드인지' 이유 구가 오면 대사에 자연스럽게 섞는다({이유} 슬롯 줄 우선).
      return { kind: 'hand', amount: 1, cardId: ctx.supportCardId, line: this.pickWithReason('clutch-hand', CLUTCH_LINES.hand, 'urgent', ctx.supportShortReason), flavor: ctx.supportReason || '위험을 넘길 손패를 건넸다' }
    }
    return null
  }

  /**
   * 소소한 일상 클러치 판정. 기본은 낮은 확률이지만, 치명적/극적 맥락에서는
   * clutchAdversityBoost와 유대(chattiness)를 곱해 일시적으로 상한을 연다.
   */
  rollMinorClutch(kind: MinorClutchKind, ctx: MinorClutchContext = {}): boolean {
    // 호출부가 명시하지 않으면 누적 유대에서 파생한다(과거 bond:true 하드코딩 대체).
    const bonded = ctx.bond ?? this.bond >= BOND_CLUTCH_THRESHOLD
    let chance = this.disp.minorClutchChance[kind]
    if (ctx.adversity) chance *= this.disp.clutchAdversityBoost
    if (bonded) chance += this.disp.bondClimaxChance * Math.max(0, this.chattiness() - 0.8)
    if (chance <= 0) return false
    const cap = ctx.adversity || bonded ? 0.45 : 0.22
    const fired = chance >= 1 || Math.random() < Math.min(cap, chance)
    if (fired) {
      this.gainBond(0.003) // 소소한 개입도 함께한 기억으로 유대에 남는다.
      // 콜백 대사('아까 도와준 보람') 재료 — 턴은 mood 정산이 추적한 현재 턴을 쓴다.
      this.recordRecentEvent('clutch', this.lastMoodTurn)
    }
    return fired
  }

  /** 소소한 클러치 대사 한 줄. */
  minorClutchLine(kind: MinorClutchKind): string {
    return this.pickFrom(`minor:${kind}`, MINOR_CLUTCH_LINES[kind], 'urgent')
  }

  /**
   * 각성: 진짜 죽음 직전(다른 부활 수단이 모두 실패했을 때 호출)에만, 런당 한 번,
   * 아주 드물게 터진다. true면 호출부가 풀 회복 + 공격력 +1 + 화려한 연출을 한다.
   */
  tryAwaken(): boolean {
    if (this.awakened) return false
    if (Math.random() >= this.disp.awakenChance) return false
    this.awakened = true
    this.gainBond(0.01) // 죽음 직전을 함께 넘긴 각성은 가장 큰 유대 신호다.
    return true
  }

  /** 각성 대사 한 줄. */
  awakenLine(): string {
    return this.pickFrom('awaken', AWAKEN_LINES, 'urgent')
  }

  // ── 침묵 구간 전용 대사(보스/종막/시련/팩/별빛) ─────────────────
  // 일반 월드 바크 게이트(companionWorldCanSpeak) 밖에서 호출부가 이벤트당 1회만 띄운다.

  /** 보스 등장 — 위압감으로 기분이 살짝 가라앉은 채 각오를 말한다.
   *  보스 이름 전용 풀이 있으면 가끔 그쪽을 골라, 이름을 아는 대사가 엉뚱한 보스에게 새지 않게 한다. */
  bossIntroLine(bossName?: string): string {
    this.noteMoodShift(-0.1)
    const specific = bossName ? BOSS_INTRO_BY_NAME[bossName] : undefined
    if (specific && specific.length > 0 && Math.random() < 0.45) {
      return this.pickFrom(`boss-intro:${bossName}`, specific, 'normal')
    }
    return this.pickFrom('boss-intro', BOSS_INTRO_LINES, 'normal')
  }

  /** 보스 국면 전환/위기 — 흐름이 바뀌는 순간의 경계 한마디. */
  bossPhaseLine(): string {
    return this.pickFrom('boss-phase', BOSS_PHASE_LINES, 'urgent')
  }

  /** 보스 격파 — 큰 승리는 기분을 크게 끌어올린다. 이름 전용 격파 대사도 가끔 섞는다. */
  bossKillLine(bossName?: string): string {
    this.noteMoodShift(0.3)
    const specific = bossName ? BOSS_KILL_BY_NAME[bossName] : undefined
    if (specific && specific.length > 0 && Math.random() < 0.5) {
      return this.pickFrom(`boss-kill:${bossName}`, specific, 'normal')
    }
    return this.pickFrom('boss-kill', BOSS_KILL_LINES, 'normal')
  }

  /** 게임오버 — 슬프지만 다음 런을 기약한다. */
  deathLine(): string {
    return this.pickFrom('death', DEATH_LINES, 'soft')
  }

  /** 100층 클리어. */
  clearLine(): string {
    this.noteMoodShift(0.5)
    return this.pickFrom('clear', CLEAR_LINES, 'normal')
  }

  /** 강제 시련 선택 직후의 각오. */
  trialLine(): string {
    return this.pickFrom('trial', TRIAL_LINES, 'normal')
  }

  /** 별빛 획득(최종 등반) — 반복 이벤트라 호출부가 확률 게이트를 건다. */
  starlightLine(): string {
    return this.pickFrom('starlight', STARLIGHT_LINES, 'soft')
  }

  /** 카드팩 구매 감상 — 팩 종류별 실제 효과에 맞는 풀에서만 고른다. */
  packLine(kind: PackLineKind): string {
    return this.pickFrom(`pack:${kind}`, PACK_LINES[kind] ?? GENERIC_BUY_LINES, 'normal')
  }

  // ── 예측 대비: 위협을 미리 읽고 대비 도구를 건넨다 ──────────

  /**
   * 예측 대비 발동 여부. 위협 추정(CompanionForesight)이 청소를 권하고, 청소 수단이 손에
   * 없고, 예측 간격/학습 가중치 게이트를 통과하면 true(호출부가 청소 카드를 건넨다).
   */
  evaluateWebPrediction(recommend: boolean, hasCleanup: boolean, turn: number): boolean {
    if (hasCleanup || !recommend) return false
    if (turn - this.lastPredictTurn < this.disp.predictCooldown) return false
    if (Math.random() >= Math.min(0.95, this.disp.predictBaseChance * this.predictiveWeight)) return false
    this.lastPredictTurn = turn
    return true
  }

  /** 예측 대비 대사 한 줄(상황 키별). reason이 오면 '왜 이 카드인지' 구를 {이유} 슬롯에 섞는다.
   *  전용 풀이 없는 새 지원 분류(ember/recovery 등)는 support 풀로 폴백한다. */
  predictLine(kind: string, reason?: string | null): string {
    const pool = PREDICT_LINES[kind] ?? PREDICT_LINES.support
    return this.pickWithReason(`predict:${kind}`, pool, 'normal', reason)
  }

  /** {이유} 슬롯이 있는 줄이 풀에 있고 이유 구가 준비됐으면 그 줄에 이유를 주입한다. */
  private pickWithReason(key: string, lines: Line[], intensity: Intensity, reason?: string | null): string {
    const reasonLines = reason ? lines.filter((line) => typeof line !== 'string' && '이유' in line.slots) : []
    if (reason && reasonLines.length > 0) {
      return this.pickFrom(`${key}:reason`, reasonLines, intensity, { 이유: [reason] })
    }
    return this.pickFrom(key, lines, intensity)
  }

  /**
   * 후반부 고점 에나라면 개입했을 법한 위협을 지금은 놓치는 연출.
   * 실제 효과는 주지 않고, 플레이어에게 '알고 있었지만 아직 부족하다'는 신호만 남긴다.
   */
  missedPotentialLine(kind: 'web' | 'shield' | 'treasure', turn: number): string | null {
    if (turn - this.lastMissedPotentialTurn < this.minTurnGap()) return null
    // 성장이 낮은 초보 에나일수록 '알지만 아직 못 돕는' 아쉬움을 더 자주 낸다.
    // 게이트(실제 개입 기회 조건)는 호출부가 그대로 유지하고 여기서는 확률만 보정한다.
    const chance = MISSED_POTENTIAL_BASE_CHANCE + (1 - this.growth) * MISSED_POTENTIAL_ROOKIE_BONUS
    if (Math.random() >= chance) return null
    this.lastMissedPotentialTurn = turn
    return this.pickFrom(`predict:miss-${kind}`, PREDICT_LINES[`miss-${kind}`], kind === 'shield' ? 'urgent' : 'normal')
  }

  /** 건넨 대비가 실제 플레이에 얼마나 도움 됐는지 반영한다. 1보다 크면 더 믿고, 작으면 덜 믿는다. */
  recordPredictionOutcome(helpScore: number): void {
    const score = Math.max(0, Math.min(1.6, helpScore))
    if (score >= 1) {
      // 위기 직후 사용·거미줄 다수 제거처럼 '타이밍이 맞았다'는 신호는 성장을 조금 더 준다.
      this.predictiveWeight = Math.min(this.disp.weightMax, this.predictiveWeight * (1 + (this.disp.predictUpGrowth - 1) * score))
      return
    }
    // 늦게 쓰거나 효과가 작으면 완전 낭비보다는 약한 감쇠로 기록한다.
    const decay = 1 - (1 - this.disp.predictDownDecay) * (1 - score)
    this.predictiveWeight = Math.max(this.disp.weightFloor, this.predictiveWeight * decay)
  }

  /** 건넨 대비 카드를 플레이어가 곧 썼다 → 예측이 유용했다(더 적극적으로 대비). */
  recordPredictionUsed(): void {
    this.recordPredictionOutcome(1)
  }

  /** 건넨 대비 카드를 기한 내 안 썼다 → 불필요했다(덜 대비). */
  recordPredictionWasted(): void {
    this.recordPredictionOutcome(0)
  }

  /**
   * 런 종료 시 per-player 성향을 실제 플레이 신호로 미세조정한다(전부 안전 경계 안 bounded nudge).
   * - 런-내 빠른 학습(수다/예측 가중치)을 느린 영구 성향에 소화시켜 세션 넘어 남긴다.
   * - 사망이면 다음 런에 더 적극적으로 돕고(방어/예측/깜짝지원↑), 깊이 살아남았으면 과보호를 살짝 완화.
   * 갱신된 성향을 돌려주어 호출부가 저장(saveDisposition)하게 한다.
   */
  adaptToOutcome(outcome: RunOutcome): EnaDisposition {
    // 0) 평균회귀: 사망 상향이 생존 완화보다 잦아 상·하한에 눌러붙는 장기 편향을 막기 위해
    //    매 런 5%씩 성장 앵커(ROOKIE→BASE 보간) 방향으로 되돌린 뒤 이번 런의 신호를 얹는다.
    //    성장이 쌓일수록 앵커가 BASE로 이동해 개입 성향이 자연히 상향 회귀한다.
    const d = revertDispositionTowardBase(this.disp, 0.05, growthAnchorDisposition(this.growth))
    // 1) 수다 성향 영속화: 이번 런 동안 학습된 chattiness(스킵=싫음/열람=좋음)를 기본 발화확률·턴 간격에 반영.
    const chatDelta = (this.chattiness() - 1) * 0.04
    for (const id of Object.keys(d.situationChance) as SituationId[]) d.situationChance[id] *= 1 + chatDelta
    d.minTurnGapBase *= 1 - chatDelta * 0.5
    // 2) 예측 성향 영속화: 건넨 대비가 유용했는지(predictiveWeight)를 기본 예측 게이트에 반영.
    d.predictBaseChance *= 1 + (this.predictiveWeight - 1) * 0.04
    // 3) 방어 성향: 사망이면 더 적극 지원, 깊이(≥60층) 살아남았으면 과보호 완화(기본값 쪽으로 약하게).
    if (outcome.died) {
      d.willGainPerDamage *= 1.05
      d.clutchHpThreshold += 0.015
      d.clutchStrength *= 1.03
      d.predictBaseChance *= 1.04
      for (const k of Object.keys(d.minorClutchChance) as MinorClutchKind[]) d.minorClutchChance[k] *= 1.05
    } else if (outcome.floorReached >= 60) {
      d.willGainPerDamage *= 0.99
      d.clutchStrength *= 0.99
      for (const k of Object.keys(d.minorClutchChance) as MinorClutchKind[]) d.minorClutchChance[k] *= 0.99
    }
    this.disp = clampDisposition(d)
    // 빠른 런-내 학습은 느린 성향으로 소화됐으니 1로 초기화해 다음 런에서 이중 반영을 막는다.
    for (const id of Object.keys(this.situationWeight) as SituationId[]) this.situationWeight[id] = 1
    this.predictiveWeight = 1
    // 한 런을 끝까지 함께한 것 자체가 유대다 — 클리어가 조금 더 크다.
    this.gainBond(outcome.died ? 0.004 : 0.01)
    return this.disp
  }

  /** 새 런 시작 시 런 한정 상태(의지/각성/턴 흐름/기분/최근 사건)를 초기화한다. 학습 가중치·유대는 유지. */
  resetForRun(): void {
    this.will = 0
    this.awakened = false
    this.lastWorldBarkTurn = -999
    this.lastPredictTurn = -999
    this.lastMissedPotentialTurn = -999
    this.touchStreak = 0
    this.mood = 0
    this.lastMoodTurn = 0
    // 지난 런의 사건을 되짚는 콜백이 새 런에서 새지 않게 링버퍼를 비운다.
    this.recentEvents.length = 0
  }

  /** 추후 성장/해금 층이 대사 풀을 넓히는 확장 지점(가짜 학습이 아니라 데이터 주입 seam). */
  addLines(pool: PoolId, lines: Line[]): void {
    POOLS[pool].push(...lines)
  }

  /** 전반적 수다 수치(상황 가중치 평균). 잘 들어주면 오르고 스킵하면 내려간다. */
  private chattiness(): number {
    const vals = Object.values(this.situationWeight)
    return vals.reduce((sum, v) => sum + v, 0) / vals.length
  }

  /**
   * 월드 바크 사이 최소 턴 간격. 수다 수치가 높을수록 짧아진다(자주 말함).
   * 기본 수치(1.0)에서 8턴, 수다(1.8)면 ~4턴, 과묵(0.2)이면 최대 16턴까지 벌어진다.
   */
  private minTurnGap(): number {
    return Math.min(
      this.disp.minTurnGapMax,
      Math.max(this.disp.minTurnGapMin, Math.round(this.disp.minTurnGapBase / this.chattiness()))
    )
  }

  /** 터치/상태 풀(기본 긴급도 사용)에서 한 줄 고른다. */
  private pickPool(pool: TouchPoolId): string {
    return this.pickFrom(pool, POOLS[pool], POOL_INTENSITY[pool])
  }

  /** 현재 기분이 말투 토큰 선택을 보정한다 — 저기분은 차분/짧은 종결, 고기분은 밝은 종결. 위급 경고는 그대로 둔다. */
  private moodAdjustedIntensity(intensity: Intensity): Intensity {
    if (intensity === 'urgent') return 'urgent'
    if (this.mood <= -0.35) return 'soft'
    if (this.mood >= 0.5) return 'normal'
    return intensity
  }

  /** 주어진 줄 목록에서 최근에 나오지 않은 항목과 완성 문장을 골라 긴급도에 맞춰 렌더한다. */
  private pickFrom(key: string, lines: Line[], baseIntensity: Intensity, extraSlots?: Record<string, readonly string[]>): string {
    const intensity = this.moodAdjustedIntensity(baseIntensity)
    if (lines.length <= 1) return this.rememberRendered(key, renderLine(lines[0], intensity, extraSlots))
    const recent = this.recentPickHistory.get(key) ?? []
    const avoid = new Set(recent)
    const candidates = lines.map((_, i) => i).filter((i) => !avoid.has(i))
    let idx = candidates.length > 0 ? candidates[Math.floor(Math.random() * candidates.length)] : Math.floor(Math.random() * lines.length)
    let rendered = renderLine(lines[idx], intensity, extraSlots)
    const recentRendered = this.recentRenderedHistory.get(key) ?? []
    // 템플릿 슬롯 조합까지 포함해 직전 완성 문장과 겹치면 몇 번 더 굴려 체감 반복을 줄인다.
    for (let attempt = 0; attempt < 6 && recentRendered.includes(rendered); attempt++) {
      idx = candidates.length > 0 ? candidates[Math.floor(Math.random() * candidates.length)] : Math.floor(Math.random() * lines.length)
      rendered = renderLine(lines[idx], intensity, extraSlots)
    }
    this.lastPick.set(key, idx)
    const windowSize = Math.min(3, Math.max(1, lines.length - 1), Math.floor(lines.length / 2))
    this.recentPickHistory.set(key, [...recent, idx].slice(-windowSize))
    return this.rememberRendered(key, rendered)
  }

  /** 완성 문장 이력을 짧게 보관해 같은 카드/상황에서 바로 같은 문장이 반복되지 않게 한다. */
  private rememberRendered(key: string, rendered: string): string {
    const recentRendered = this.recentRenderedHistory.get(key) ?? []
    this.recentRenderedHistory.set(key, [...recentRendered, rendered].slice(-4))
    return rendered
  }
}
