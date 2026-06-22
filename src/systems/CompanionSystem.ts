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
} from '@data/CompanionLines'
import type { HandCategory } from '@entities/HandCard'

// 대사 데이터 쪽 타입을 그대로 다시 노출해 기존 import 경로(@systems/CompanionSystem)를 유지한다.
export type { Line, LineTemplate, SituationId, ClutchKind, MinorClutchKind }

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
}
/** 클러치 판단에 필요한 현재 상태 스냅샷. */
export interface ClutchContext {
  hp: number
  maxHp: number
  hpRatio: number
  emberLow: boolean
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

/**
 * `앞글자[A/B]` 조사 토큰을 받침 유무로 해석한다.
 *   - 일반쌍: 받침 있으면 A, 없으면 B (을/를, 은/는, 이/가, 과/와, 아/야 …)
 *   - '으로/로' 특수쌍: 받침 없거나 ㄹ받침이면 '로', 그 외엔 '으로'
 */
export function resolveKoreanParticles(text: string): string {
  return text.replace(/(.)?\[([^\]/]+)\/([^\]]+)\]/g, (_m, prev: string | undefined, a: string, b: string) => {
    const base = prev ?? ''
    if (a === '으로' && b === '로') {
      const useRo = !hasFinalConsonant(prev) || finalIsRieul(prev)
      return base + (useRo ? '로' : '으로')
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

/** 한 줄(문자열/템플릿)을 긴급도에 맞춰 렌더한다: 변조/슬롯 치환 → 조사 보정. */
function renderLine(line: Line, intensity: Intensity): string {
  const template = typeof line === 'string' ? line : line.template
  const slots: Record<string, readonly string[]> = typeof line === 'string' ? {} : line.slots
  const tone = TONE[intensity]
  const filled = template.replace(/\{([^}]+)\}/g, (_m, name: string) => {
    if (TONE_TOKENS.has(name)) return randOf(tone[name as '강조' | '종결' | '재촉'])
    const pool = slots[name]
    return pool && pool.length > 0 ? randOf(pool) : ''
  })
  return resolveKoreanParticles(filled)
}

// ── 튜닝(빈도·강도) ──────────────────────────────────────────

/** 터치/상태 반응 풀의 기본 말투 강도. */
const POOL_INTENSITY: Record<TouchPoolId, Intensity> = {
  calm: 'normal',
  annoyed: 'normal',
  exasperated: 'urgent',
  urgent: 'urgent',
  settle: 'soft',
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
const LOOT_COMMENT_CHANCE = 0.45
/** 학습 가중치 하한 — 아무리 스킵해도 침묵이 아니라 '과묵'에서 멈춘다. */
const SITUATION_WEIGHT_FLOOR = 0.2
/** 학습 가중치 상한 — 대사를 잘 봐 주는 플레이어에겐 더 수다스러워진다. */
const SITUATION_WEIGHT_MAX = 1.8

/** 클러치 예산('의지') 최대치 — 역경(피해)으로 차고, 발동 시 0으로 비운다. */
const WILL_MAX = 100
/** 클러치 효과 '보통' 강도 배율. 추후 역경 분석 RL로 조정(지금은 1.0 고정). */
const CLUTCH_STRENGTH = 1.0
/** 소소한 일상 클러치 발동 확률(낮게 — 가끔 깜짝 지원). */
const MINOR_CLUTCH_CHANCE: Record<MinorClutchKind, number> = {
  crit: 0.06,
  dodge: 0.05,
  trap: 0.12,
  treasure: 0.15,
}
/** 각성(최후의 의지) — 진짜 죽음 직전, 아주 드물게 터지는 클라이맥스. */
const AWAKEN_CHANCE = 0.12

export class CompanionSystem {
  /** 짧은 시간 내 연속 터치 횟수 — 반응 강도를 끌어올린다. */
  private touchStreak = 0
  private lastTouchAt = 0
  /** 마지막으로 월드 바크를 낸 턴 — 시간(쿨타임)이 아니라 '턴 간격'으로 빈도를 다스린다. */
  private lastWorldBarkTurn = -999
  /** 풀별 직전 선택 인덱스 — 같은 줄이 연속으로 나오지 않게 한다. */
  private readonly lastPick = new Map<string, number>()
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
  /** 클러치 예산('에나의 의지'). 역경으로 차고 발동 시 0이 된다. */
  private will = 0
  /** 각성은 런당 한 번뿐. 새 런에서 resetForRun으로 풀린다. */
  private awakened = false
  /** 마지막 예측 대비 발동 턴(예측 남발 방지). */
  private lastPredictTurn = -999
  /**
   * 예측 대비 학습 가중치(0.2~1.8). 건넨 대비 카드를 플레이어가 곧 쓰면(유용) 오르고,
   * 기한 내 안 쓰면(불필요) 내려간다. = 가짜 RL: "이 대비가 도움이 됐나"를 누적.
   */
  private predictiveWeight = 1

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

  /** 연타 뒤 손을 뗐을 때(방치). 만진 적이 있을 때만 마무리 대사를 돌려준다. */
  onSettle(): string | null {
    if (this.touchStreak === 0) return null
    this.touchStreak = 0
    return this.pickPool('settle')
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
    if (!important && turn - this.lastWorldBarkTurn < this.minTurnGap()) return null
    let chance = Math.min(0.95, SITUATION[id].chance * this.situationWeight[id])
    if (important) chance = Math.max(chance, 0.7)
    if (Math.random() >= chance) return null
    this.lastWorldBarkTurn = turn
    const intensity = intensityOverride ?? SITUATION[id].intensity
    // 적 이름이 주어지면 핵심 키워드('거미' 등) 전용 반응을 우선한다(수식어는 무시).
    const kw = name ? matchEnemyKeyword(name) : null
    if (kw) return this.pickFrom(`enemy:${kw.key}`, kw.lines, intensity)
    return this.pickFrom(id, POOLS[id], intensity)
  }

  /** 상점 유물 구매 감상평. id 전용 → 등급별 → 공용 폴백. 구매는 드무니 늘 한마디 한다. */
  onBuyRelic(id: string, rarity: CardRarity): string {
    const lines = RELIC_LINES[id] ?? RELIC_RARITY_LINES[rarity] ?? GENERIC_BUY_LINES
    return this.pickFrom(`buy:${id in RELIC_LINES ? id : rarity}`, lines, 'normal')
  }

  /** 플레이어가 안 읽고 빨리 넘긴 상황 → 다음부터 덜 말한다(가짜 RL 부정 보상). */
  recordSkip(id: SituationId): void {
    this.skipCount += 1
    this.situationWeight[id] = Math.max(SITUATION_WEIGHT_FLOOR, this.situationWeight[id] * 0.7)
  }

  /** 플레이어가 대사를 끝까지 봐 준 상황 → 점점 더 수다스러워진다(긍정 보상). */
  recordHeard(id: SituationId): void {
    this.situationWeight[id] = Math.min(SITUATION_WEIGHT_MAX, this.situationWeight[id] * 1.08)
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
    if (turn - this.lastWorldBarkTurn < this.minTurnGap()) return null
    if (Math.random() >= LOOT_COMMENT_CHANCE) return null
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
    if (turn - this.lastWorldBarkTurn < this.minTurnGap()) return null
    if (Math.random() >= LOOT_COMMENT_CHANCE) return null
    this.lastWorldBarkTurn = turn
    const bespoke = CARD_COMMENTS[cardId]
    if (bespoke) return this.pickFrom(`use:${cardId}`, bespoke, 'normal')
    return this.pickFrom(`use-cat:${category}`, USE_COMMENTS[category], 'normal')
  }

  /** 직업 선택 직후의 시작 인사. 시작 한 번뿐이라 빈도 제한 없이 늘 나온다. */
  onJobSelect(jobId: string): string {
    const lines = JOB_LINES[jobId] ?? JOB_GENERIC
    return this.pickFrom(`job:${jobId}`, lines, 'normal')
  }

  // ── 클러치(에나의 의지): 대사만이 아니라 실제 서포팅 ──────────

  /** 피해를 입은 만큼 '의지'를 쌓는다(역경에 비례). 클러치 예산의 충전. */
  gainWill(damage: number, maxHp: number): void {
    if (damage <= 0 || maxHp <= 0) return
    this.will = Math.min(WILL_MAX, this.will + Math.round((damage / maxHp) * 60) + 5)
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
   * 우선순위: 체력 위기(회복/방패) > 불씨 위기(성냥). 발동 시 의지를 0으로 비운다.
   */
  evaluateClutch(ctx: ClutchContext): ClutchPlan | null {
    if (this.will < WILL_MAX) return null
    if (ctx.hp > 0 && ctx.hpRatio <= 0.4) {
      this.will = 0
      if (Math.random() < 0.5) {
        const amount = clampInt(ctx.maxHp * 0.3 * CLUTCH_STRENGTH, 4, 12)
        return { kind: 'heal', amount, line: this.pickFrom('clutch-heal', CLUTCH_LINES.heal, 'urgent'), flavor: '위기의 순간, 의지로 버텼다' }
      }
      const amount = clampInt(ctx.maxHp * 0.25 * CLUTCH_STRENGTH, 3, 10)
      return { kind: 'shield', amount, line: this.pickFrom('clutch-shield', CLUTCH_LINES.shield, 'urgent'), flavor: '위기의 순간, 방패를 들어올렸다' }
    }
    if (ctx.emberLow) {
      this.will = 0
      return { kind: 'ember', amount: 1, line: this.pickFrom('clutch-ember', CLUTCH_LINES.ember, 'urgent'), flavor: '불씨가 꺼지기 전에' }
    }
    return null
  }

  /** 소소한 일상 클러치가 이번 행동에 발동하는지(낮은 확률). */
  rollMinorClutch(kind: MinorClutchKind): boolean {
    return Math.random() < MINOR_CLUTCH_CHANCE[kind]
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
    if (Math.random() >= AWAKEN_CHANCE) return false
    this.awakened = true
    return true
  }

  /** 각성 대사 한 줄. */
  awakenLine(): string {
    return this.pickFrom('awaken', AWAKEN_LINES, 'urgent')
  }

  // ── 예측 대비: 위협을 미리 읽고 대비 도구를 건넨다 ──────────

  /**
   * 거미줄 누적 예측. 위협(분리된 거미줄 수)이 충분하고, 청소 수단이 손에 없고,
   * 예측 간격/학습 가중치 게이트를 통과하면 true(호출부가 키틴을 건넨다).
   */
  evaluateWebPrediction(webThreats: number, hasCleanup: boolean, turn: number): boolean {
    if (hasCleanup || webThreats < 2) return false
    if (turn - this.lastPredictTurn < 6) return false
    if (Math.random() >= Math.min(0.95, 0.5 * this.predictiveWeight)) return false
    this.lastPredictTurn = turn
    return true
  }

  /** 예측 대비 대사 한 줄(상황 키별). */
  predictLine(kind: string): string {
    return this.pickFrom(`predict:${kind}`, PREDICT_LINES[kind], 'normal')
  }

  /** 건넨 대비 카드를 플레이어가 곧 썼다 → 예측이 유용했다(더 적극적으로 대비). */
  recordPredictionUsed(): void {
    this.predictiveWeight = Math.min(SITUATION_WEIGHT_MAX, this.predictiveWeight * 1.15)
  }

  /** 건넨 대비 카드를 기한 내 안 썼다 → 불필요했다(덜 대비). */
  recordPredictionWasted(): void {
    this.predictiveWeight = Math.max(SITUATION_WEIGHT_FLOOR, this.predictiveWeight * 0.7)
  }

  /** 새 런 시작 시 런 한정 상태(의지/각성/턴 흐름)를 초기화한다. 학습 가중치는 유지. */
  resetForRun(): void {
    this.will = 0
    this.awakened = false
    this.lastWorldBarkTurn = -999
    this.lastPredictTurn = -999
    this.touchStreak = 0
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
    return Math.min(16, Math.max(3, Math.round(8 / this.chattiness())))
  }

  /** 터치/상태 풀(기본 긴급도 사용)에서 한 줄 고른다. */
  private pickPool(pool: TouchPoolId): string {
    return this.pickFrom(pool, POOLS[pool], POOL_INTENSITY[pool])
  }

  /** 주어진 줄 목록에서 직전과 다른 항목을 골라 긴급도에 맞춰 렌더한다. */
  private pickFrom(key: string, lines: Line[], intensity: Intensity): string {
    if (lines.length <= 1) return renderLine(lines[0], intensity)
    const prev = this.lastPick.get(key)
    let idx = Math.floor(Math.random() * lines.length)
    if (idx === prev) idx = (idx + 1) % lines.length
    this.lastPick.set(key, idx)
    return renderLine(lines[idx], intensity)
  }
}
