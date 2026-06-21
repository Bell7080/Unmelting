/**
 * CompanionSystem - 동료 캐릭터(에나)의 반응 레이어 씨앗.
 *
 * 학습 전 규칙 기반 스캐폴딩이지만, "패턴"이 아니라 "자아"처럼 보이게 하기 위해
 * 내부 상태(연타 횟수·마지막 터치 시각)와 호출 시점의 상황(위기 여부)을 함께 본다.
 *
 * 대사는 LLM 생성이 아니라 "사전 작성"이며, 두 형태를 같은 풀에 섞어 등록한다:
 *   1) 완성된 문장 문자열
 *   2) 템플릿({슬롯}+값 풀) — 조각 몇 개로 수십 변형을 조합한다.
 * 한국어 조사는 `{단어}[은/는]` 처럼 적으면 앞 글자 받침에 맞춰 자동 보정한다.
 *
 * 추후 이 자리에 관찰(state)·정책·보상 학습이 끼워진다 — 그때도 정책은
 * "언제/어느 줄을/어떤 말투로"만 고르고 단어를 새로 짓지는 않는다.
 * (설계: Ena_Companion_AI_Design.md)
 */

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

/** 대사 풀 식별자(연속 반복 회피 추적 + 외부 확장에 쓰인다). */
type PoolId = 'calm' | 'annoyed' | 'exasperated' | 'urgent' | 'settle' | 'interrupt'

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

/** 템플릿을 한 번 렌더한다: 슬롯 랜덤 치환 → 조사 보정. */
function renderTemplate(t: LineTemplate): string {
  // 슬롯 이름은 한글이 올 수 있으므로 \w가 아니라 } 직전까지를 잡는다.
  const filled = t.template.replace(/\{([^}]+)\}/g, (_m, name: string) => {
    const pool = t.slots[name]
    if (!pool || pool.length === 0) return ''
    return pool[Math.floor(Math.random() * pool.length)]
  })
  return resolveKoreanParticles(filled)
}

/** 한 줄(문자열/템플릿)을 실제 출력 문자열로 만든다. */
function renderLine(line: Line): string {
  return typeof line === 'string' ? line : renderTemplate(line)
}

/**
 * 에나의 대사 풀. 완성 문장과 템플릿을 섞어 둔다. 가변 배열이라 추후 성장/해금 층이
 * addLines로 풀을 넓힐 수 있다.
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
  // 너무 많이 만질 때(6회~)
  exasperated: [
    '그만! 진짜 그만 좀!',
    '계속 만지면… 나 삐진다?',
    '으으, 알았으니까 이제 모험하자!',
  ],
  // 위급한데 만졌을 때 — 연타 강도와 무관하게 우선한다
  urgent: [
    '지금 장난칠 때야?!',
    '위험하다고! 앞에 집중해!',
    '나중에! 지금은 위급하잖아!',
  ],
  // 연타하다가 손을 뗐을 때
  settle: [
    '…어라, 이제 끝났어?',
    '휴, 드디어 조용하네.',
    '자, 정신 차리고 — 앞으로 가자!',
  ],
  // 말하는 중에 빨리감기/스킵으로 끊겼을 때
  interrupt: [
    '아, 잠깐! 내 말 안 끝났어!',
    '중요한 얘기라고! 끝까지 들어!',
    '말 자르지 마, 치사하게…!',
  ],
}

/** 직전 터치로부터 이 시간이 지나면 연타 횟수를 0으로 되돌린다. */
const STREAK_RESET_MS = 4000

export class CompanionSystem {
  /** 짧은 시간 내 연속 터치 횟수 — 반응 강도를 끌어올린다. */
  private touchStreak = 0
  private lastTouchAt = 0
  /** 풀별 직전 선택 인덱스 — 같은 줄이 연속으로 나오지 않게 한다. */
  private readonly lastPick = new Map<PoolId, number>()

  /** 프로필을 만졌을 때. 위급하면 우선 꾸짖고, 아니면 연타 강도에 따라 반응한다. */
  onProfileTouch(now: number, ctx: CompanionContext): string {
    if (now - this.lastTouchAt > STREAK_RESET_MS) this.touchStreak = 0
    this.touchStreak += 1
    this.lastTouchAt = now
    if (ctx.danger) return this.pick('urgent')
    const pool: PoolId =
      this.touchStreak >= 6 ? 'exasperated' : this.touchStreak >= 3 ? 'annoyed' : 'calm'
    return this.pick(pool)
  }

  /** 연타 뒤 손을 뗐을 때(방치). 만진 적이 있을 때만 마무리 대사를 돌려준다. */
  onSettle(): string | null {
    if (this.touchStreak === 0) return null
    this.touchStreak = 0
    return this.pick('settle')
  }

  /** 말하는 중에 스킵/빨리감기로 끊겼을 때. */
  onInterrupt(): string {
    return this.pick('interrupt')
  }

  /** 추후 성장/해금 층이 대사 풀을 넓히는 확장 지점(가짜 학습이 아니라 데이터 주입 seam). */
  addLines(pool: PoolId, lines: Line[]): void {
    POOLS[pool].push(...lines)
  }

  /** 풀에서 직전과 다른 항목을 골라 렌더한다(템플릿이면 슬롯이 매번 달라져 변주가 더 커진다). */
  private pick(pool: PoolId): string {
    const lines = POOLS[pool]
    if (lines.length <= 1) return renderLine(lines[0])
    const prev = this.lastPick.get(pool)
    let idx = Math.floor(Math.random() * lines.length)
    if (idx === prev) idx = (idx + 1) % lines.length
    this.lastPick.set(pool, idx)
    return renderLine(lines[idx])
  }
}
