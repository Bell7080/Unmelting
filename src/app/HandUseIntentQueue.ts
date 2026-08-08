import type { HandCardId } from '@entities/HandCard'

/** 사용 요청 시점의 표적 식별자. 값만 보관하며 모델이나 DOM을 변경하지 않는다. */
export interface HandUseIntentTarget {
  readonly cardId: string
  readonly laneIndex: number
  readonly distance: number
  readonly bossGimmickCellIndex?: number
}

/** 슬롯 번호가 아닌 카드 인스턴스를 단일 출처로 삼는 불변 손패 사용 의도다. */
export interface HandUseIntent {
  readonly uid: string
  readonly defId: HandCardId
  readonly merged: boolean
  readonly requestedAt: number
  readonly target?: HandUseIntentTarget
}

/** 실행 직전 현재 모델에서 다시 찾은 카드 위치다. 이 타입 자체는 모델을 변경하지 않는다. */
export interface ResolvedHandUseIntent {
  readonly intent: HandUseIntent
  readonly slotIndex: number
}

export type HandIntentCancelReason = 'card-missing' | 'target-missing' | 'phase-changed' | 'queue-cleared'

/** FIFO 판정 결과. `run`만 호출자가 제공한 동기 모델 커밋을 수행한다. */
export interface HandIntentQueueHooks {
  resolveSlot(uid: string): number
  isPhaseValid(intent: HandUseIntent): boolean
  isTargetValid(intent: HandUseIntent): boolean
  run(resolved: ResolvedHandUseIntent): void
  cancel(intent: HandUseIntent, reason: HandIntentCancelReason): void
  changed?(queued: readonly HandUseIntent[]): void
}

/**
 * 손패 입력을 중복 없이 FIFO로 보존하는 판정 큐다. `drainOne`은 모델 커밋 하나만 동기로
 * 실행하며, 애니메이션 Promise를 소유하지 않아 규칙 잠금과 시각 재생을 결합하지 않는다.
 */
export class HandUseIntentQueue {
  private readonly items: HandUseIntent[] = []

  constructor(private readonly capacity: number, private readonly hooks: HandIntentQueueHooks) {}

  /** 모델 변경 없음: 동일 UID/용량 초과를 거부하고 불변 의도만 저장한다. */
  enqueue(intent: HandUseIntent): boolean {
    if (this.items.length >= this.capacity || this.items.some((item) => item.uid === intent.uid)) return false
    this.items.push(Object.freeze({ ...intent, target: intent.target ? Object.freeze({ ...intent.target }) : undefined }))
    this.notify()
    return true
  }

  /** 모델 변경: UID·대상·게임 단계를 재검증한 뒤 유효한 맨 앞 의도 하나만 커밋한다. */
  drainOne(): boolean {
    const intent = this.items.shift()
    if (!intent) return false
    const slotIndex = this.hooks.resolveSlot(intent.uid)
    let reason: HandIntentCancelReason | null = null
    if (slotIndex < 0) reason = 'card-missing'
    else if (!this.hooks.isPhaseValid(intent)) reason = 'phase-changed'
    else if (!this.hooks.isTargetValid(intent)) reason = 'target-missing'
    if (reason) this.hooks.cancel(intent, reason)
    else this.hooks.run({ intent, slotIndex })
    this.notify()
    return true
  }

  /** 모델 변경 없음: 대기 의도를 폐기하고 각 슬롯의 취소 DOM 피드백을 요청한다. */
  clear(): void {
    for (const intent of this.items.splice(0)) this.hooks.cancel(intent, 'queue-cleared')
    this.notify()
  }

  /** 렌더 전용 읽기 스냅샷. 작은 순번 표시에만 사용한다. */
  snapshot(): readonly HandUseIntent[] { return this.items.map((item) => item) }

  get length(): number { return this.items.length }

  private notify(): void { this.hooks.changed?.(this.snapshot()) }
}
