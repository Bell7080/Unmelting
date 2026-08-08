import { HAND_ACTION_MIN_VISUAL_GAP_MS } from '@core/Timing'

/** 손패 작업의 네 단계. `commit`만 모델을 바꾸며 나머지는 저장된 스냅샷으로 DOM을 연출한다. */
export type HandActionPhase = 'commit' | 'core-impact' | 'follow-up' | 'stabilize'

/**
 * 판정 직후 동결하는 연출 자료. 모델 객체/HTMLElement 대신 값과 DOMRect만 보관하므로
 * 뒤 렌더가 노드를 교체해도 앞 작업이 안전하다. 이 타입 자체는 모델을 변경하지 않는다.
 */
export interface HandActionSnapshot {
  readonly targetRects: Readonly<Record<string, DOMRectReadOnly>>
  readonly damage: ReadonlyArray<Readonly<{ cardId: string; amount: number }>>
  readonly removedCardIds: readonly string[]
  readonly resourceChanges: Readonly<Record<string, number>>
  readonly bossCellHits: ReadonlyArray<Readonly<{ cellId: string; damage: number }>>
}

/** 공개 작업 계약. `commit`만 동기 모델 변경, 세 비동기 콜백은 DOM 연출/정리만 수행한다. */
export interface HandActionWork<TSnapshot extends HandActionSnapshot = HandActionSnapshot> {
  /** 모델 변경: 카드 효과·소비·체인 반영을 await 없이 한 번에 끝낸다. */
  commit: (actionId: string) => TSnapshot
  /** DOM 전용: 중앙 카드 비행과 최초 타격. 입력을 막는 유일한 시각 beat다. */
  playCoreImpact: (snapshot: TSnapshot, signal: AbortSignal) => Promise<void>
  /** DOM 전용: 자원 트레일·처치 보상처럼 다음 입력과 병렬 가능한 연출. */
  playFollowUp?: (snapshot: TSnapshot, signal: AbortSignal) => Promise<void>
  /** DOM 전용: 레일 재배치 등 후속 연출이 끝난 뒤의 보드 안정화. */
  stabilize?: (snapshot: TSnapshot, signal: AbortSignal) => Promise<void>
  /** DOM 전용: 취소된 작업이 만든 복제 노드/클래스를 제거한다. */
  cleanup?: (actionId: string) => void
}

/** 등록 결과. `committed`는 이미 확정된 불변 판정, `coreDone`은 입력 재개 경계다. */
export interface HandActionHandle<TSnapshot extends HandActionSnapshot = HandActionSnapshot> {
  readonly actionId: string
  readonly committed: TSnapshot
  readonly coreDone: Promise<void>
  readonly settled: Promise<void>
  cancel: () => void
}

/** 손패 판정과 시각 채널을 분리하고 핵심 beat만 직렬화하는 전용 매니저. */
export class HandActionTimeline {
  private nextId = 1
  private coreTail: Promise<void> = Promise.resolve()
  private stabilizeTail: Promise<void> = Promise.resolve()
  private lastCoreStartedAt = Number.NEGATIVE_INFINITY

  constructor(
    private readonly now: () => number = () => Date.now(),
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    private readonly minVisualGapMs = HAND_ACTION_MIN_VISUAL_GAP_MS
  ) {}

  /** commit은 호출 스택에서 동기 실행하고, DOM 단계만 각 채널의 Promise로 예약한다. */
  register<TSnapshot extends HandActionSnapshot>(work: HandActionWork<TSnapshot>): HandActionHandle<TSnapshot> {
    const actionId = `hand-action-${this.nextId++}`
    const controller = new AbortController()
    let cleaned = false
    // 취소와 정상 종료가 경합해도 DOM 정리는 정확히 한 번만 실행한다.
    const cleanup = (): void => {
      if (cleaned) return
      cleaned = true
      work.cleanup?.(actionId)
    }
    const committed = work.commit(actionId)
    const coreDone = this.coreTail.then(async () => {
      const delay = Math.max(0, this.lastCoreStartedAt + this.minVisualGapMs - this.now())
      if (delay > 0) await this.sleep(delay)
      if (controller.signal.aborted) return
      this.lastCoreStartedAt = this.now()
      await work.playCoreImpact(committed, controller.signal)
    })
    // 실패한 한 연출이 다음 카드 채널을 영구 정지시키지 않게 tail만 복구한다.
    this.coreTail = coreDone.catch(() => undefined)
    const followUp = coreDone.then(async () => {
      if (!controller.signal.aborted) await work.playFollowUp?.(committed, controller.signal)
    })
    const settled = followUp.then(() => {
      const stabilization = this.stabilizeTail.then(async () => {
        if (!controller.signal.aborted) await work.stabilize?.(committed, controller.signal)
      })
      this.stabilizeTail = stabilization.catch(() => undefined)
      return stabilization
    }).finally(cleanup)
    return {
      actionId,
      committed,
      coreDone,
      settled,
      cancel: () => {
        controller.abort()
        cleanup()
      },
    }
  }
}
