import { describe, expect, it } from 'vitest'
import { CHAIN_SETTLEMENT_GRACE_MS } from '@core/Timing'
import { ChainSettlementTimeline, type ChainSettlementEvent } from './ChainSettlementTimeline'

interface TestEvent extends ChainSettlementEvent { order: number }

describe('ChainSettlementTimeline', () => {
  it('빠른 10회 입력의 커밋 순서를 보존하고 마지막 입력까지 정산 마감을 미룬다', () => {
    const timeline = new ChainSettlementTimeline<TestEvent>()
    for (let order = 0; order < 10; order++) {
      // 20ms 입력은 220ms 규칙 유예 안에 있으므로 하나의 연속 동작이다.
      timeline.commitCard({ uid: `card-${order}`, kind: 'card', order }, order * 20)
    }

    expect(timeline.snapshot().map((event) => event.order)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(timeline.shouldSettle(9 * 20 + CHAIN_SETTLEMENT_GRACE_MS - 1, false, false)).toBe(false)
    expect(timeline.shouldSettle(9 * 20 + CHAIN_SETTLEMENT_GRACE_MS, false, false)).toBe(true)
  })

  it('큐 소진이나 다음 카드가 의존하는 모델 효과는 마감 전에 즉시 정산한다', () => {
    const timeline = new ChainSettlementTimeline<TestEvent>()
    timeline.commitCard({ uid: 'card-0', kind: 'card', order: 0 }, 100)

    expect(timeline.shouldSettle(101, true, false)).toBe(true)
    expect(timeline.shouldSettle(101, false, true)).toBe(true)
  })
})
