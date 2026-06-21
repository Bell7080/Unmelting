/**
 * CompanionSystem - 동료 캐릭터(에나)의 반응 레이어 씨앗.
 *
 * 학습 전 규칙 기반 스캐폴딩이지만, "패턴"이 아니라 "자아"처럼 보이게 하기 위해
 * 내부 상태(연타 횟수·마지막 터치 시각)와 호출 시점의 상황(위기 여부)을 함께 본다.
 * 추후 이 자리에 관찰(state)·정책·보상 학습이 끼워진다 — 그때도 대사는 "사전 작성"이고
 * 정책은 "언제/어느 줄을/어떤 말투로"만 고른다. (설계: Ena_Companion_AI_Design.md)
 */

/** 반응을 고를 때 함께 보는, 호출 시점의 게임 상황. 필드는 점차 늘려간다. */
export interface CompanionContext {
  /** 체력/불씨가 위태로운 위급 상황인가. true면 장난에 응할 여유가 없다. */
  danger: boolean
}

/** 대사 풀 식별자(연속 반복 회피 추적 + 외부 확장에 쓰인다). */
type PoolId = 'calm' | 'annoyed' | 'exasperated' | 'urgent' | 'settle' | 'interrupt'

/**
 * 에나의 대사 풀. 생성이 아니라 사전 작성이며, 같은 상황이라도 어미·문장부호·강도를
 * 달리한 변주를 함께 둔다(말투 변주의 손작업 버전). 가변 배열이라 추후 성장/해금 층이
 * addLines로 풀을 넓힐 수 있다.
 */
const POOLS: Record<PoolId, string[]> = {
  // 가볍게 한두 번 만졌을 때
  calm: [
    '응? 왜 만져! 간지러워!',
    '거기 누르지 마… 부끄럽잖아.',
    '꺄! 갑자기 만지면 놀라잖아!',
  ],
  // 자꾸 만질 때(3회~)
  annoyed: [
    '왜 이렇게 자꾸 건드려…?',
    '에잇, 모험에 집중해야지!',
    '나 말고 앞을 봐, 앞을!',
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
  addLines(pool: PoolId, lines: string[]): void {
    POOLS[pool].push(...lines)
  }

  /** 풀에서 직전과 다른 한 줄을 고른다. */
  private pick(pool: PoolId): string {
    const lines = POOLS[pool]
    if (lines.length <= 1) return lines[0]
    const prev = this.lastPick.get(pool)
    let idx = Math.floor(Math.random() * lines.length)
    if (idx === prev) idx = (idx + 1) % lines.length
    this.lastPick.set(pool, idx)
    return lines[idx]
  }
}
