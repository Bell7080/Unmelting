/**
 * CompanionSystem - 동료 캐릭터(에나)의 반응 레이어 씨앗.
 *
 * 학습 전 규칙 기반 스캐폴딩이지만, "패턴"이 아니라 "자아"처럼 보이게 하기 위해
 * 내부 상태(연타·발화 시각·상황별 학습 가중치)와 호출 시점의 상황을 함께 본다.
 *
 * 대사는 LLM 생성이 아니라 "사전 작성"이며, 세 겹으로 변주를 만든다(B안 = 가짜 LLM):
 *   1) 완성 문장 / 템플릿({슬롯}+값 풀)을 같은 풀에 섞어 등록 → 조각 몇 개로 수십 조합
 *   2) 말투 변조 토큰({강조}{종결}{재촉})을 긴급도(intensity)에 맞춰 치환
 *   3) `{단어}[은/는]` 조사 토큰을 앞 글자 받침에 맞춰 자동 보정
 *
 * 상황 바크(피격/거미줄/보물/처치 등)는 매번 터지면 시끄러우므로 확률+쿨다운으로 줄이고,
 * 플레이어가 스킵한 상황은 가중치를 낮춰 점점 덜 말한다(가짜 RL: 스킵=부정 보상).
 * (설계: Ena_Companion_AI_Design.md)
 */

import type { HandCategory } from '@entities/HandCard'

/** 반응을 고를 때 함께 보는, 호출 시점의 게임 상황. */
export interface CompanionContext {
  /** 체력/불씨가 위태로운 위급 상황인가. */
  danger: boolean
}

/** 템플릿 대사: `{슬롯}` 자리를 slots의 값 중 하나로 랜덤 치환한 뒤 조사를 보정한다. */
export interface LineTemplate {
  template: string
  slots: Record<string, readonly string[]>
}

/** 풀에 등록 가능한 한 줄 — 완성 문자열이거나 템플릿. */
export type Line = string | LineTemplate

/** 프로필 터치/상태 반응 풀. */
type TouchPoolId = 'calm' | 'annoyed' | 'exasperated' | 'urgent' | 'settle' | 'quiet'
/** 게임 이벤트 상황 반응 풀. */
type SituationPoolId =
  | 'hit' | 'web' | 'treasure' | 'kill' | 'survive' | 'flower' | 'event'
  | 'loot-match-ok' | 'loot-match-low'
type PoolId = TouchPoolId | SituationPoolId

/** 확률+턴 간격+학습 가중치로 다스리는 게임 이벤트 종류. */
export type SituationId = 'hit' | 'web' | 'treasure' | 'kill' | 'survive' | 'flower' | 'event'

/** 말투 강도 — 같은 내용도 종결부호/강조어를 달리해 톤을 바꾼다. */
export type Intensity = 'soft' | 'normal' | 'urgent'

/** 클러치(에나의 의지) 종류 — 위기에 실제 게임플레이 지원을 한다. */
export type ClutchKind = 'heal' | 'shield' | 'ember'
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
  urgent: { 강조: ['얼른 ', '빨리 ', '당장 '], 종결: ['!', '!!'], 재촉: [' 빨리!', ' 어서!', ''] },
}
const TONE_TOKENS = new Set(['강조', '종결', '재촉'])

function randOf(arr: readonly string[]): string {
  return arr[Math.floor(Math.random() * arr.length)]
}

function clampInt(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(v)))
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

// ── 대사 백과사전(B안 템플릿으로 광범위하게) ──────────────────────

const POOLS: Record<PoolId, Line[]> = {
  // 가볍게 한두 번 만졌을 때.
  calm: [
    {
      template: '{감탄} 왜 {동작}! {느낌}!',
      slots: {
        감탄: ['응?', '꺄', '엣', '에구', '우왓'],
        동작: ['만져', '건드려', '콕콕 찌르지', '쿡쿡 찌르지', '톡톡 치지'],
        느낌: ['간지러워', '부끄럽잖아', '놀랐잖아', '깜짝이야', '당황스럽잖아'],
      },
    },
    {
      template: '{머뭇} 거기 누르지 마… {이유}.',
      slots: { 머뭇: ['음…', '저기', '에…'], 이유: ['부끄럽잖아', '간지럽잖아', '쑥스럽단 말야'] },
    },
    '갑자기 그러면 놀라지!',
    '히익, 차가운 손!',
  ],
  // 자꾸 만질 때(3회~).
  annoyed: [
    {
      template: '{대상}[은/는] 그만 만지고, {목표}[을/를] {행동}!',
      slots: {
        대상: ['나', '얼굴', '머리'],
        목표: ['앞', '적', '불씨', '길'],
        행동: ['봐', '신경 써', '살펴', '챙겨'],
      },
    },
    {
      template: '{빈도} 만지지 좀 마…',
      slots: { 빈도: ['자꾸', '계속', '또'] },
    },
    '에잇, 모험에 집중해야지!',
    '왜 이렇게 손이 근질거려?',
  ],
  // 너무 많이 만질 때(6회~).
  exasperated: [
    '{강조}그만 좀 만져{종결}{재촉}',
    {
      template: '계속 만지면… {위협}?',
      slots: { 위협: ['나 삐진다', '화낼 거야', '모른 척할 거야'] },
    },
    '으으, 알았으니까 이제 모험하자!',
    '진짜 너무하네!',
  ],
  // 위급한데 만졌을 때.
  urgent: [
    {
      template: '지금 {상황}[이/가] 위급한데 장난이야?!',
      slots: { 상황: ['상황', '앞', '불씨'] },
    },
    '{강조}앞에 집중해{종결}{재촉}',
    '나중에! 지금은 위급하잖아!',
    '한눈팔 때가 아니라고!',
  ],
  // 연타하다 손을 뗐을 때.
  settle: [
    '{강조}이제 끝났어{종결}',
    {
      template: '휴, {표현}.',
      slots: { 표현: ['드디어 조용하네', '한숨 돌렸다', '이제 좀 살겠다'] },
    },
    '자, 정신 차리고 — 앞으로 가자!',
  ],
  // 스킵이 누적돼 과묵해질 때(가끔) — 삐침이 아니라 배려의 톤.
  quiet: [
    '내가 이야기하는 게 거슬렸구나…? 알았어, 조용히 할게.',
    '음… 말이 너무 많았나 봐. 좀 과묵해질게.',
    '신경 쓰이게 했다면 미안. 중요할 때만 말할게.',
  ],

  // ── 게임 이벤트 상황 반응 ──
  hit: [
    {
      template: '{비명}! {느낌}…',
      slots: { 비명: ['아얏', '으악', '윽', '아야'], 느낌: ['아파', '따가워', '방심했어', '깜짝이야'] },
    },
    '{강조}조심하라니까{종결}',
    '맞기 싫어…!',
    '이 정도쯤이야!',
  ],
  web: [
    {
      template: '{비명}! 거미줄은 {감정}…',
      slots: { 비명: ['으', '윽', '으윽'], 감정: ['싫은데', '질색이야', '끔찍해'] },
    },
    {
      template: '으, {표현}…',
      slots: { 표현: ['끈적끈적해', '달라붙어', '찝찝해'] },
    },
    '거미줄은 딱 질색!',
    '이런 거 정말 싫어…',
  ],
  treasure: [
    {
      template: '{감탄}, {표현}!',
      slots: {
        감탄: ['오', '우와', '히히', '오오'],
        표현: ['좋은 거 들었다', '이게 웬 행운이야', '반짝이는 거다', '운수 좋은걸'],
      },
    },
    '{강조}챙겨두자{종결}',
    '보물은 언제 봐도 좋아!',
    '안에 뭐가 있을까?',
  ],
  kill: [
    {
      template: '{감탄}, {표현}!',
      slots: { 감탄: ['좋아', '아싸', '옳지', '후훗'], 표현: ['하나 처리', '잡았다', '해치웠어', '정리 완료'] },
    },
    '{강조}덤비지 말랬지{종결}',
    '이런 건 식은 죽 먹기지.',
    '다음은 누구야?',
  ],
  survive: [
    {
      template: '{놀람}, {표현}…?',
      slots: { 놀람: ['어라', '흠', '으음'], 표현: ['단단한데', '질긴데', '멀쩡하네'] },
    },
    '한 번 더 쳐야겠어!',
    '아직 안 죽었어, 조심해.',
    '제법인걸…?',
  ],
  // 꽃을 주웠을 때.
  flower: [
    {
      template: '{감탄}, 꽃이다! {표현}.',
      slots: { 감탄: ['와', '오', '어머'], 표현: ['향기가 좋아', '예쁘다', '기운이 나네'] },
    },
    '꽃을 줍는 순간만큼은 평화롭네.',
    '이런 게 모험의 즐거움이지.',
  ],
  // 이벤트 문이 나타났을 때.
  event: [
    {
      template: '문이…? {표현}.',
      slots: { 표현: ['뭐가 있으려나', '들어가 볼까', '조심해야겠어'] },
    },
    '저 너머에 뭔가 있어.',
    '선택의 갈림길이네.',
  ],
  'loot-match-ok': [
    '불씨 게이지는 아직 충분하네, 나중에 써도 되겠어… 그치?',
    '성냥이다. 급하진 않으니 아껴두자.',
    '불씨는 넉넉하니까, 잘 챙겨두자.',
  ],
  'loot-match-low': [
    '마침 성냥이야! {강조}얼른 불씨를 채우자{종결}',
    '오, 성냥! 지금 딱 필요했는데.',
    '불씨가 위태로웠는데 — 다행이다!',
  ],
}

/**
 * 카드 카테고리별 폴백 한줄평 — 전용 대사가 없는 손패는 모두 자기 카테고리 대사를 쓴다.
 * 덕분에 카드를 새로 추가해도 "하나하나 등록" 없이 즉시 한줄평이 붙는다.
 */
const CATEGORY_COMMENTS: Record<HandCategory, Line[]> = {
  attack: [
    { template: '공격 카드네, {대상}[을/를] 혼내주자!', slots: { 대상: ['적', '저 녀석'] } },
    '이걸로 한 방 먹이면 되겠어.',
    '싸울 준비 됐어!',
  ],
  recovery: ['회복 카드다, 다치면 쓰자.', '든든한걸, 챙겨두자.', '이거면 좀 버틸 수 있겠어.'],
  tool: ['오, 쓸모 있어 보여.', '도구는 많을수록 좋지.', '요긴하게 쓰자.'],
  control: ['요건 잘 쓰면 판을 바꾸겠는걸.', '영리하게 써먹자.', '타이밍 맞춰 쓰면 좋겠어.'],
}

/** 손패를 '사용'했을 때의 카테고리별 폴백 한마디(획득 한줄평과 톤이 다르다). */
const USE_COMMENTS: Record<HandCategory, Line[]> = {
  attack: ['받아라!', '이걸로 한 방!', '맞고 정신 차려!'],
  recovery: ['후… 좀 낫다.', '이제 좀 버틸 만해.', '회복!'],
  tool: ['요건 이렇게 쓰는 거야.', '제때 써야 빛나지.', '쓸 만하네!'],
  control: ['판을 흔들어 볼까?', '이렇게 하면 되지?', '영리하게!'],
}

/** 직업별 시작 인사(없으면 공용). 시작 한 번뿐이라 빈도 제한 없이 늘 나온다. */
const JOB_LINES: Record<string, Line[]> = {
  knight: ['기사구나! 방패는 내가 거들게.', '튼튼해 보여 — 함께라면 든든하겠어.'],
  mage: ['마법사라니 멋져! 불씨는 내게 맡겨.', '지혜로운 선택이야. 잘 부탁해.'],
}
const JOB_GENERIC: Line[] = [
  '역경 아래, 작은 불빛을 밝혀야만 해.',
  '준비됐어? 함께 가보자.',
  '어떤 길이든, 내가 곁에 있을게.',
]

/** 손패 id별 전용 한줄평. 없는 카드는 CATEGORY_COMMENTS로 자동 폴백한다. */
const CARD_COMMENTS: Record<string, Line[]> = {
  wax: [
    {
      template: '밀랍이다! {대상}[을/를] {동작}{종결}',
      slots: { 대상: ['적', '저 녀석', '앞의 함정'], 동작: ['꽁꽁 굳혀버리자', '멈춰 세우자', '묶어둬야지'] },
    },
    '끈적한 밀랍… 시간을 벌 수 있어.',
  ],
  chitin: [
    {
      template: '키틴이네. {표현}!',
      slots: { 표현: ['함정은 내가 치울게', '저런 건 치워버리자', '길을 터줄게'] },
    },
    '함정 따위 무섭지 않아.',
  ],
  candle: [
    {
      template: '양초다! {표현}.',
      slots: { 표현: ['방패로 막자', '든든하게 버티자', '몸을 지키자'] },
    },
    '불빛이 우릴 지켜줄 거야.',
  ],
}

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
}

const STREAK_RESET_MS = 4000
const LOOT_COMMENT_CHANCE = 0.45
/** 학습 가중치 하한 — 아무리 스킵해도 침묵이 아니라 '과묵'에서 멈춘다. */
const SITUATION_WEIGHT_FLOOR = 0.2
/** 학습 가중치 상한 — 대사를 잘 봐 주는 플레이어에겐 더 수다스러워진다. */
const SITUATION_WEIGHT_MAX = 1.8

/** 클러치 예산('의지') 최대치 — 역경(피해)으로 차고, 발동 시 0으로 비운다. */
const WILL_MAX = 100
/**
 * 클러치 효과 '보통' 강도 배율. 추후 "플레이어가 역경을 얼마나 겪는지"를 RL로 분석해
 * 이 배율을 조정한다(지금은 테스트라 1.0 고정 = 보통).
 */
const CLUTCH_STRENGTH = 1.0
/** 클러치 종류별 거의 확정으로 나오는 대사. */
const CLUTCH_LINES: Record<ClutchKind, string[]> = {
  heal: ['아직 끝낼 수 없어!', '내가… 지켜줄게!', '포기하긴 일러!'],
  shield: ['이건 내가 막을게!', '여기서 쓰러질 순 없어!', '버텨 — 방패를 들어!'],
  ember: ['불씨가 꺼지면 안 돼 — 자, 성냥!', '내가 챙겨뒀어, 어서 불을 켜!', '이걸로 버티자!'],
}

export class CompanionSystem {
  private touchStreak = 0
  private lastTouchAt = 0
  /** 마지막으로 월드 바크를 낸 턴 — 시간(쿨타임)이 아니라 '턴 간격'으로 빈도를 다스린다. */
  private lastWorldBarkTurn = -999
  /** 풀별 직전 선택 인덱스 — 같은 줄이 연속으로 나오지 않게 한다. */
  private readonly lastPick = new Map<string, number>()
  /**
   * 상황별 학습 가중치(0.15~1). 스킵하면 내려가 덜 말하고, 평가될 때마다 천천히 회복한다.
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
  }
  /** 누적 스킵 횟수 — 과묵 안내 대사 타이밍에 쓴다. */
  private skipCount = 0
  /** 클러치 예산('에나의 의지'). 역경으로 차고 발동 시 0이 된다. */
  private will = 0

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
   * 게임 이벤트 상황 반응. 시간 쿨다운이 아니라 **턴 간격**으로 빈도를 다스린다:
   * 직전 발화로부터 minTurnGap(수다 수치가 높을수록 짧음)턴이 지났고, (기본확률×학습
   * 가중치)에 걸렸을 때만. important(위급 등)는 간격을 우회해 경고 기회를 보장한다.
   */
  reactSituation(
    id: SituationId,
    turn: number,
    intensityOverride?: Intensity,
    important = false
  ): string | null {
    if (!important && turn - this.lastWorldBarkTurn < this.minTurnGap()) return null
    let chance = Math.min(0.95, SITUATION[id].chance * this.situationWeight[id])
    if (important) chance = Math.max(chance, 0.7)
    if (Math.random() >= chance) return null
    this.lastWorldBarkTurn = turn
    return this.pickFrom(id, POOLS[id], intensityOverride ?? SITUATION[id].intensity)
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
   * 정책은 '언제/어떤 종류'만 정하고 위력(수치)은 상한 고정이라 밸런스를 깨지 않는다.
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

  /** 손패 '사용' 한줄평. 같은 턴 간격을 공유해 너무 수다스럽지 않게 가끔만 능력을 언급한다. */
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
   * (수다스러워 게임에 방해되지 않도록 기본을 넉넉히 띄웠다.)
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
