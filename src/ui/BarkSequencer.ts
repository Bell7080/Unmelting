/**
 * BarkSequencer - 에나 바크(말풍선 한마디)의 순차 출력 큐.
 *
 * 게임 시작 직후 "새 런 회상"과 "직업 선택 인사"처럼 거의 동시에 도착한 바크가
 * 서로를 뜨자마자 덮어쓰지 않게, 표시 중인 바크의 최소 노출 시간(대사 길이 비례,
 * 1.5~3초)이 지난 뒤 다음 바크를 이어서 보여준다.
 *
 * 이 클래스는 큐잉/드롭/타이밍 '판단'만 담당한다 — 실제 표시(SpeechBubble)와
 * setTimeout 구동은 호출부(index.ts)가 맡아, 시계 주입(now)으로 결정적 테스트가 가능하다.
 * urgent/클러치급 바크가 큐를 건너뛰고 즉시 교체하는 규칙은 호출부의 기존 게이트가 유지한다.
 */

/** 큐에 담기는 바크 1건. situation은 호출부의 학습 신호 타입을 그대로 통과시킨다. */
export interface QueuedBark<S = unknown> {
  line: string
  importance: number
  situation: S | null
  /** 실제 말풍선에 표시되는 순간 함께 실행할 화면 포커스(큐에서 드롭되면 실행하지 않는다). */
  onDisplay?: () => void
}

/** 큐 상한 — 초과분은 중요도가 낮은 것부터(동률이면 오래된 것) 버린다. */
export const BARK_QUEUE_MAX = 3

/**
 * 바크 최소 노출 시간(ms): 타이핑(글자당 70ms)과 읽기 여유를 대사 길이에 비례해 잡되
 * 1.5~3초로 클램프한다. 이 시간 안에 도착한 다음 바크는 교체 대신 큐에서 기다린다.
 */
export function barkMinExposureMs(line: string): number {
  return Math.max(1500, Math.min(3000, 600 + line.length * 90))
}

/**
 * 설명(교육) 바크가 **넘기기 전까지** 최소로 버티는 시간(ms).
 *
 * 설명을 띄운 그 행동의 클릭이 곧바로 설명을 넘겨 버리면 한 글자도 못 읽는다 —
 * 이 시간 동안은 어떤 입력도 넘기지 못하게 막는 바닥이다.
 */
export const TEACH_HOLD_FLOOR_MS = 1200

/**
 * 설명 바크가 **아무 입력 없이도** 결국 풀리는 상한(ms).
 *
 * 설명은 플레이어가 넘길 때까지 기다리는 것이 원칙이지만, 판을 들여다보며 가만히 있는
 * 사람에게 영원히 붙어 있으면 그건 안내가 아니라 모달이다. 넉넉히 두되 끝은 있게 한다.
 */
export const TEACH_HOLD_MAX_MS = 12000

export class BarkSequencer<S = unknown> {
  private readonly queue: QueuedBark<S>[] = []
  /** 마지막 표시 시각/그 바크의 최소 노출 — 다음 드레인 시점 계산의 기준. */
  private shownAt = Number.NEGATIVE_INFINITY
  private minExposureMs = 0
  /** 표시 중인 것이 '넘겨야 지나가는' 설명 바크인가. */
  private holding = false

  constructor(
    private readonly now: () => number = Date.now,
    private readonly maxQueue: number = BARK_QUEUE_MAX
  ) {}

  /** 새 바크가 큐를 타야 하는가 — 이미 대기열이 있거나, 표시 중 바크가 최소 노출을 못 채웠으면 true. */
  busy(bubbleShowing: boolean): boolean {
    if (this.queue.length > 0) return true
    // 설명이 붙잡고 있는 동안에는 뒤에 온 대사가 끼어들지 못하고 전부 큐로 간다.
    if (bubbleShowing && this.isHolding()) return true
    return bubbleShowing && this.now() < this.shownAt + this.minExposureMs
  }

  /** 설명 바크가 아직 화면을 붙잡고 있는가(상한 시간까지). */
  isHolding(): boolean {
    if (!this.holding) return false
    if (this.now() >= this.shownAt + TEACH_HOLD_MAX_MS) {
      this.holding = false
      return false
    }
    return true
  }

  /**
   * 플레이어가 설명을 넘겼다 — 바닥 시간(TEACH_HOLD_FLOOR_MS)을 채웠을 때만 실제로 풀린다.
   * 설명을 띄운 그 행동의 입력이 곧바로 넘겨 버리는 것을 막는다. 풀렸으면 true.
   */
  release(): boolean {
    if (!this.holding) return false
    if (this.now() < this.shownAt + TEACH_HOLD_FLOOR_MS) return false
    this.holding = false
    // 플레이어가 스스로 넘겼으므로 남은 최소 노출도 채운 것으로 본다 —
    // 넘겼는데 다음 대사가 또 뜸을 들이면 "넘겼다"는 조작감이 사라진다.
    this.minExposureMs = 0
    return true
  }

  /** 바크를 실제로 표시한 직후 호출 — 이 바크의 최소 노출 시간이 여기서 확정된다. */
  noteDisplayed(line: string, hold: boolean = false): void {
    this.shownAt = this.now()
    this.minExposureMs = barkMinExposureMs(line)
    this.holding = hold
  }

  /** 큐에 추가. 상한 초과 시 중요도가 가장 낮은(동률이면 가장 오래된) 항목을 버리고 돌려준다. */
  enqueue(bark: QueuedBark<S>): QueuedBark<S> | null {
    this.queue.push(bark)
    if (this.queue.length <= this.maxQueue) return null
    let drop = 0
    for (let i = 1; i < this.queue.length; i++) {
      if (this.queue[i].importance < this.queue[drop].importance) drop = i
    }
    return this.queue.splice(drop, 1)[0]
  }

  /** 대기 중인 바크 수. */
  get pending(): number {
    return this.queue.length
  }

  /** 다음 바크를 꺼내도 될 때까지 남은 시간(ms). 0이면 지금 드레인해도 된다. */
  nextDelayMs(): number {
    // 설명이 붙잡고 있으면 상한까지 기다린다 — 그 사이 release()가 오면 바로 0이 된다.
    if (this.isHolding()) return Math.max(0, this.shownAt + TEACH_HOLD_MAX_MS - this.now())
    return Math.max(0, this.shownAt + this.minExposureMs - this.now())
  }

  /** 다음 바크를 꺼낸다(도착 순서 유지). 호출부가 표시 후 noteDisplayed를 다시 불러야 한다. */
  shift(): QueuedBark<S> | undefined {
    return this.queue.shift()
  }

  /** 큐 비우기 — 새 런 시작/게임오버처럼 흐름이 끊길 때 잔여 바크가 새지 않게 한다. */
  clear(): void {
    this.queue.length = 0
    this.holding = false
  }
}
