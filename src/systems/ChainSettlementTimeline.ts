import { CHAIN_SETTLEMENT_GRACE_MS } from '@core/Timing'

/** UI와 입력 큐가 공유하는 체인 정산 시계의 최소 이벤트 계약이다. */
export interface ChainSettlementEvent {
  uid: string
  kind: 'card' | 'recipe' | 'gauge' | 'relic'
}

/**
 * 빠른 입력이 들어올 때마다 정산 마감만 뒤로 미루되, 이미 커밋된 이벤트 순서는
 * 절대 다시 만들지 않는다. Date.now 대신 now를 받아 타임라인 테스트를 결정적으로 만든다.
 */
export class ChainSettlementTimeline<T extends ChainSettlementEvent> {
  private events: T[] = []
  private chainSettlementDeadline: number | null = null

  /** 카드 판정 커밋과 동시에 배너 이벤트를 추가하고 입력 유예를 다시 시작한다. */
  commitCard(event: T, now: number): number {
    this.events.push(event)
    this.chainSettlementDeadline = now + CHAIN_SETTLEMENT_GRACE_MS
    return this.chainSettlementDeadline
  }

  /** 레시피/게이지는 이미 정산 중이므로 순서만 이어 붙이고 유예를 재개하지 않는다. */
  appendSettlement(event: T): void { this.events.push(event) }

  /** 큐 소진이나 다음 판정 의존 효과는 유예보다 규칙 정확성을 우선한다. */
  shouldSettle(now: number, queueEmpty: boolean, nextCardNeedsBoardSettlement: boolean): boolean {
    return queueEmpty || nextCardNeedsBoardSettlement || (
      this.chainSettlementDeadline !== null && now >= this.chainSettlementDeadline
    )
  }

  /** 남은 규칙 유예. 정산 호출부는 이 값만 기다려 기존 440ms 도입 반복을 피한다. */
  remainingGrace(now: number): number {
    return Math.max(0, (this.chainSettlementDeadline ?? now) - now)
  }

  snapshot(): readonly T[] { return [...this.events] }

  clear(): void {
    this.events = []
    this.chainSettlementDeadline = null
  }
}
