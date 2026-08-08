import { describe, expect, it, vi } from 'vitest'
import { HandUseIntentQueue, type HandUseIntent } from './HandUseIntentQueue'

const intent = (uid: string, cardId = 'enemy'): HandUseIntent => ({
  uid, defId: 'needle', merged: false, requestedAt: 10,
  target: { cardId, laneIndex: 0, distance: 0 },
})

describe('HandUseIntentQueue', () => {
  it('UID로 현재 슬롯을 다시 찾고 FIFO 판정 순서를 보존한다', () => {
    const order: string[] = []
    const slots = new Map([['a', 2], ['b', 0]])
    const queue = new HandUseIntentQueue(10, {
      resolveSlot: (uid) => slots.get(uid) ?? -1,
      isPhaseValid: () => true, isTargetValid: () => true,
      run: ({ intent: item, slotIndex }) => order.push(`${item.uid}:${slotIndex}`), cancel: vi.fn(),
    })
    queue.enqueue(intent('a')); queue.enqueue(intent('b'))
    slots.set('a', 1)
    queue.drainOne(); queue.drainOne()
    expect(order).toEqual(['a:1', 'b:0'])
  })

  it('합성으로 사라진 카드와 죽은 대상을 다른 카드에 적용하지 않고 취소한다', () => {
    const cancelled: string[] = []
    const run = vi.fn()
    const queue = new HandUseIntentQueue(10, {
      resolveSlot: (uid) => uid === 'merged-away' ? -1 : 0,
      isPhaseValid: () => true,
      isTargetValid: (item) => item.target?.cardId !== 'dead',
      run, cancel: (item, reason) => cancelled.push(`${item.uid}:${reason}`),
    })
    queue.enqueue(intent('merged-away')); queue.enqueue(intent('alive-card', 'dead'))
    queue.drainOne(); queue.drainOne()
    expect(run).not.toHaveBeenCalled()
    expect(cancelled).toEqual(['merged-away:card-missing', 'alive-card:target-missing'])
  })

  it('보스 격파 시 남은 큐를 폐기하고 모바일 중복 탭·용량 초과를 막는다', () => {
    const cancel = vi.fn()
    const queue = new HandUseIntentQueue(2, {
      resolveSlot: () => 0, isPhaseValid: () => true, isTargetValid: () => true,
      run: vi.fn(), cancel,
    })
    expect(queue.enqueue(intent('tap'))).toBe(true)
    expect(queue.enqueue(intent('tap'))).toBe(false)
    expect(queue.enqueue(intent('second'))).toBe(true)
    expect(queue.enqueue(intent('third'))).toBe(false)
    queue.clear()
    expect(cancel).toHaveBeenCalledTimes(2)
    expect(queue.length).toBe(0)
  })
})
