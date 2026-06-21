/**
 * CompanionSystem - 동료 캐릭터(에나)의 반응 레이어 씨앗.
 *
 * 학습 전 규칙 기반 스캐폴딩이지만, "패턴"이 아니라 "자아"처럼 보이게 하기 위해
 * 내부 상태(연타 횟수·마지막 발화 시각)와 호출 시점의 상황을 함께 본다.
 *
 * 대사는 LLM 생성이 아니라 "사전 작성"이며, 세 겹으로 변주를 만든다:
 *   1) 완성 문장 / 템플릿({슬롯}+값 풀)을 같은 풀에 섞어 등록
 *   2) 말투 변조 토큰({강조}{종결}{재촉})을 긴급도(intensity)에 맞춰 치환
 *   3) `{단어}[은/는]` 조사 토큰을 앞 글자 받침에 맞춰 자동 보정
 * → "가짜 LLM": 즉흥 생성은 못 하지만, 작성한 커버리지 안에서 풍부하게 살아 보인다.
 *
 * 상황 바크(피격/거미줄/보물/처치 등)는 매번 터지면 시끄러우므로 확률 + 쿨다운으로
 * 강약을 조절한다(이것이 추후 학습으로 옮길 "침묵의 절제" 자리다).
 * (설계: Ena_Companion_AI_Design.md)
 */

import type { HandCategory } from '@entities/HandCard'

/** 반응을 고를 때 함께 보는, 호출 시점의 게임 상황. 필드는 점차 늘려간다. */
export interface CompanionContext {
  /** 체력/불씨가 위태로운 위급 상황인가. true면 장난에 응할 여유가 없다. */
  danger: boolean
}

/** 템플릿 대사: `{슬롯}` 자리를 slots의 값 중 하나로 랜덤 치환한 뒤 조사를 보정한다. */
export interface LineTemplate {
  template: string
  slots: Record<string, readonly string[]>
}

/** 풀에 등록 가능한 한 줄 — 완성 문자열이거나 템플릿. */
export type Line = string | LineTemplate

/** 프로필 터치/상태 반응 풀(기본 긴급도가 풀로 정해진다). */
type TouchPoolId = 'calm' | 'annoyed' | 'exasperated' | 'urgent' | 'settle' | 'interrupt'
/** 게임 이벤트 상황 반응 풀(긴급도는 상황 설정/호출자가 정한다). */
type SituationPoolId = 'hit' | 'web' | 'treasure' | 'kill' | 'survive' | 'loot-match-ok' | 'loot-match-low'
type PoolId = TouchPoolId | SituationPoolId

/** 확률+쿨다운으로 강약을 조절하는 게임 이벤트 종류. */
export type SituationId = 'hit' | 'web' | 'treasure' | 'kill' | 'survive'

/** 말투 강도 — 같은 내용도 종결부호/강조어를 달리해 톤을 바꾼다. */
export type Intensity = 'soft' | 'normal' | 'urgent'

// ── 조사 보정 ────────────────────────────────────────────────

/**
 * 한 글자에 한글 종성(받침)이 있는지. 한글 음절 영역만 검사하고, 한글이 아니면 false.
 * (음절코드 - 0xAC00) % 28 === 0 이면 받침 없음.
 */
function hasFinalConsonant(ch?: string): boolean {
  if (!ch) return false
  const code = ch.charCodeAt(0)
  if (code < 0xac00 || code > 0xd7a3) return false
  return (code - 0xac00) % 28 !== 0
}

/** 종성이 ㄹ(받침 인덱스 8)인지 — '(으)로' 보정에 쓴다. */
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
 * 앞 글자가 한글이 아니거나 문자열 시작이면 "받침 없음"으로 본다.
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

/** 긴급도별 변조 토큰 값. 같은 강도 안에서도 랜덤으로 골라 변주를 더한다. */
const TONE: Record<Intensity, Record<'강조' | '종결' | '재촉', readonly string[]>> = {
  soft: { 강조: [''], 종결: ['…', '.'], 재촉: [''] },
  normal: { 강조: [''], 종결: ['!', '.'], 재촉: [''] },
  urgent: { 강조: ['얼른 ', '빨리 ', '당장 '], 종결: ['!', '!!'], 재촉: [' 빨리!', ' 어서!', ''] },
}
const TONE_TOKENS = new Set(['강조', '종결', '재촉'])

function randOf(arr: readonly string[]): string {
  return arr[Math.floor(Math.random() * arr.length)]
}

/** 한 줄(문자열/템플릿)을 긴급도에 맞춰 렌더한다: 변조/슬롯 치환 → 조사 보정. */
function renderLine(line: Line, intensity: Intensity): string {
  const template = typeof line === 'string' ? line : line.template
  const slots: Record<string, readonly string[]> = typeof line === 'string' ? {} : line.slots
  const tone = TONE[intensity]
  // 슬롯/변조 토큰은 한글이 올 수 있으므로 \w가 아니라 } 직전까지를 잡는다.
  const filled = template.replace(/\{([^}]+)\}/g, (_m, name: string) => {
    if (TONE_TOKENS.has(name)) return randOf(tone[name as '강조' | '종결' | '재촉'])
    const pool = slots[name]
    return pool && pool.length > 0 ? randOf(pool) : ''
  })
  return resolveKoreanParticles(filled)
}

// ── 대사 풀 ──────────────────────────────────────────────────

/**
 * 에나의 대사 풀. 완성 문장·템플릿·변조 토큰을 섞어 둔다. 가변 배열이라 추후
 * 성장/해금 층이 addLines로 풀을 넓힐 수 있다.
 */
const POOLS: Record<PoolId, Line[]> = {
  // 가볍게 한두 번 만졌을 때 — 템플릿 하나로 감탄×동작×느낌 조합을 낸다.
  calm: [
    {
      template: '{감탄} 왜 {동작}! {느낌}!',
      slots: {
        감탄: ['응?', '꺄', '엣'],
        동작: ['만져', '건드려', '콕콕 찌르지'],
        느낌: ['간지러워', '부끄럽잖아', '놀랐잖아'],
      },
    },
    '거기 누르지 마… 부끄럽잖아.',
  ],
  // 자꾸 만질 때(3회~) — 조사 보정 템플릿 예시 포함.
  annoyed: [
    {
      template: '{대상}[은/는] 그만 만지고, {목표}[을/를] 봐!',
      slots: { 대상: ['나', '얼굴'], 목표: ['앞', '적', '불씨'] },
    },
    '왜 이렇게 자꾸 건드려…?',
    '에잇, 모험에 집중해야지!',
  ],
  // 너무 많이 만질 때(6회~) — 변조 토큰으로 강하게.
  exasperated: [
    '{강조}그만 좀 만져{종결}{재촉}',
    '계속 만지면… 나 삐진다?',
    '으으, 알았으니까 이제 모험하자!',
  ],
  // 위급한데 만졌을 때 — 연타 강도와 무관하게 우선한다.
  urgent: [
    '지금 장난칠 때야?!',
    '{강조}앞에 집중해{종결}{재촉}',
    '나중에! 지금은 위급하잖아!',
  ],
  // 연타하다가 손을 뗐을 때 — 부드럽게.
  settle: [
    '{강조}이제 끝났어{종결}',
    '휴, 드디어 조용하네.',
    '자, 정신 차리고 — 앞으로 가자!',
  ],
  // 말하는 중에 빨리감기/스킵으로 끊겼을 때.
  interrupt: [
    '아, 잠깐! 내 말 안 끝났어!',
    '중요한 얘기라고! 끝까지 들어!',
    '말 자르지 마, 치사하게…!',
  ],

  // ── 게임 이벤트 상황 반응 ──
  // 적에게 맞았을 때.
  hit: [
    '아얏! 아파…',
    '윽… 방심했어.',
    '{강조}조심하라니까{종결}',
    '맞기 싫어…!',
  ],
  // 거미줄을 밟았을 때.
  web: [
    '윽! 거미줄은 싫은데…',
    '으, 끈적끈적해…',
    '{강조}거미줄은 질색이야{종결}',
  ],
  // 보물을 먹었을 때.
  treasure: [
    '오, 좋은 거 들었다!',
    '{강조}이게 웬 행운이야{종결}',
    '반짝이는 거 좋아!',
    '히히, 챙겨두자.',
  ],
  // 적을 처치했을 때.
  kill: [
    '좋았어, 하나 처리!',
    '{강조}덤비지 말랬지{종결}',
    '아싸, 잡았다!',
    '이런 건 식은 죽 먹기지.',
  ],
  // 공격했는데 적이 살아남았을 때.
  survive: [
    '어라, 단단한데…?',
    '한 번 더 쳐야겠어!',
    '아직 안 죽었어, 조심해.',
  ],
  // 성냥 획득 + 불씨가 충분할 때.
  'loot-match-ok': [
    '불씨 게이지는 아직 충분하네, 나중에 써도 되겠어… 그치?',
    '성냥이다. 급하진 않으니 아껴두자.',
  ],
  // 성냥 획득 + 불씨가 부족할 때.
  'loot-match-low': [
    '마침 성냥이야! {강조}얼른 불씨를 채우자{종결}',
    '오, 성냥! 지금 딱 필요했는데.',
  ],
}

/**
 * 카드 카테고리별 폴백 한줄평 — 전용 대사가 없는 손패는 모두 자기 카테고리 대사를 쓴다.
 * 덕분에 카드를 새로 추가해도 "하나하나 등록" 없이 즉시 한줄평이 붙는다.
 */
const CATEGORY_COMMENTS: Record<HandCategory, Line[]> = {
  attack: ['공격 카드네, 적을 혼내주자!', '이걸로 한 방 먹이면 되겠어.'],
  recovery: ['회복 카드다, 다치면 쓰자.', '든든한걸, 챙겨두자.'],
  tool: ['오, 쓸모 있어 보여.', '도구는 많을수록 좋지.'],
  control: ['요건 잘 쓰면 판을 바꾸겠는걸.', '영리하게 써먹자.'],
}

/**
 * 손패 id별 전용 한줄평(옵션). 특별히 살려 주고 싶은 카드만 여기에 추가하면 되고,
 * 없는 카드는 CATEGORY_COMMENTS로 자동 폴백한다. (성냥은 불씨 상태에 따라 onAcquireCard가
 * 별도 처리하므로 여기 넣지 않는다.)
 */
const CARD_COMMENTS: Record<string, Line[]> = {
  // 예) wax: ['밀랍이다. 굳혀버리자!'],  ← id만 알면 이렇게 한 줄 추가
}

/** 터치/상태 반응 풀의 기본 말투 강도. 상황(=어느 풀)이 곧 긴급도를 정한다. */
const POOL_INTENSITY: Record<TouchPoolId, Intensity> = {
  calm: 'normal',
  annoyed: 'normal',
  exasperated: 'urgent',
  urgent: 'urgent',
  settle: 'soft',
  interrupt: 'urgent',
}

/** 상황 바크별 발화 확률 + 기본 말투. 너무 수다스럽지 않게 1 미만으로 둔다. */
const SITUATION: Record<SituationId, { chance: number; intensity: Intensity }> = {
  hit: { chance: 0.5, intensity: 'normal' },
  web: { chance: 0.7, intensity: 'normal' },
  treasure: { chance: 0.5, intensity: 'normal' },
  kill: { chance: 0.4, intensity: 'normal' },
  survive: { chance: 0.35, intensity: 'normal' },
}

/** 직전 터치로부터 이 시간이 지나면 연타 횟수를 0으로 되돌린다. */
const STREAK_RESET_MS = 4000
/** 상황 바크 사이 최소 간격 — 한 턴에 여러 이벤트가 터져도 한 번만 말하게 한다. */
const SITUATION_COOLDOWN_MS = 3000
/** 손패 획득 한줄평 발화 확률. */
const LOOT_COMMENT_CHANCE = 0.5

export class CompanionSystem {
  /** 짧은 시간 내 연속 터치 횟수 — 반응 강도를 끌어올린다. */
  private touchStreak = 0
  private lastTouchAt = 0
  /** 마지막으로 무언가 말한 시각 — 상황 바크 쿨다운 기준. */
  private lastSpokeAt = 0
  /** 풀별 직전 선택 인덱스 — 같은 줄이 연속으로 나오지 않게 한다. */
  private readonly lastPick = new Map<string, number>()

  /** 프로필을 만졌을 때. 위급하면 우선 꾸짖고, 아니면 연타 강도에 따라 반응한다. */
  onProfileTouch(now: number, ctx: CompanionContext): string {
    if (now - this.lastTouchAt > STREAK_RESET_MS) this.touchStreak = 0
    this.touchStreak += 1
    this.lastTouchAt = now
    this.lastSpokeAt = now // 플레이어가 부른 발화도 쿨다운 시계를 갱신한다.
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

  /** 말하는 중에 스킵/빨리감기로 끊겼을 때. */
  onInterrupt(): string {
    return this.pickPool('interrupt')
  }

  /**
   * 게임 이벤트 상황 반응. 확률에 걸리고 쿨다운이 지났을 때만 한 줄을 돌려주고,
   * 아니면 null(침묵). intensityOverride로 위급 피격 등을 더 다급하게 만들 수 있다.
   */
  reactSituation(id: SituationId, now: number, intensityOverride?: Intensity): string | null {
    if (!this.passSpeakGate(now, SITUATION[id].chance)) return null
    this.lastSpokeAt = now
    return this.pickFrom(id, POOLS[id], intensityOverride ?? SITUATION[id].intensity)
  }

  /**
   * 손패 획득 한줄평. 우선순위: 성냥(불씨 상태별) → id 전용(CARD_COMMENTS) → 카테고리 폴백.
   * 덕분에 모든 손패가 최소 카테고리 대사를 갖고, 특별한 카드만 전용 대사를 더하면 된다.
   */
  onAcquireCard(
    cardId: string,
    category: HandCategory,
    now: number,
    ctx?: { emberSufficient?: boolean }
  ): string | null {
    if (!this.passSpeakGate(now, LOOT_COMMENT_CHANCE)) return null
    this.lastSpokeAt = now
    if (cardId === 'match') {
      const key: PoolId = (ctx?.emberSufficient ?? true) ? 'loot-match-ok' : 'loot-match-low'
      return this.pickFrom(key, POOLS[key], 'normal')
    }
    const bespoke = CARD_COMMENTS[cardId]
    if (bespoke) return this.pickFrom(`card:${cardId}`, bespoke, 'normal')
    return this.pickFrom(`cat:${category}`, CATEGORY_COMMENTS[category], 'normal')
  }

  /** 추후 성장/해금 층이 대사 풀을 넓히는 확장 지점(가짜 학습이 아니라 데이터 주입 seam). */
  addLines(pool: PoolId, lines: Line[]): void {
    POOLS[pool].push(...lines)
  }

  /** 쿨다운이 지났고 확률에 걸렸는지 — 상황 바크의 강약 게이트. */
  private passSpeakGate(now: number, chance: number): boolean {
    if (now - this.lastSpokeAt < SITUATION_COOLDOWN_MS) return false
    return Math.random() < chance
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
