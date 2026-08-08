import { describe, expect, it } from 'vitest'
import type { HandCard } from '@entities/HandCard'
import { HandActionTimeline, type HandUseIntent } from './HandActionTimeline'

const card = (uid: string, defId: HandCard['defId'] = 'wax-drop'): HandCard => ({ uid, defId })
const intent = (uid: string, overrides: Partial<HandUseIntent> = {}): HandUseIntent => ({
  uid, defId: 'wax-drop', merged: false, requestedAt: 1, ...overrides,
})

describe('HandActionTimeline', () => {
  it('re-finds a moved card by UID instead of retaining its old slot', () => {
    const timeline = new HandActionTimeline(3)
    expect(timeline.validate(intent('b'), [card('b')], true, () => true)).toMatchObject({ slotIndex: 0 })
  })

  it('cancels a reservation consumed by automatic synthesis', () => {
    const timeline = new HandActionTimeline(3)
    expect(timeline.validate(intent('consumed'), [card('merged')], true, () => true)).toBe('card-missing')
  })

  it('revalidates a dead target immediately before commit', () => {
    const timeline = new HandActionTimeline(3)
    const requested = intent('a', { target: { cardId: 'enemy', laneIndex: 0, distance: 0 } })
    expect(timeline.validate(requested, [card('a')], true, () => false)).toBe('target-dead')
  })

  it('discards the remaining FIFO when a boss defeat changes phase', () => {
    const timeline = new HandActionTimeline(3)
    timeline.enqueue(intent('a')); timeline.enqueue(intent('b'))
    expect(timeline.clear().map((entry) => entry.uid)).toEqual(['a', 'b'])
    expect(timeline.length).toBe(0)
  })

  it('blocks duplicate mobile taps and enforces the visible-hand cap', () => {
    const timeline = new HandActionTimeline(2)
    expect(timeline.enqueue(intent('a'))).toBe(true)
    expect(timeline.enqueue(intent('a'))).toBe(false)
    expect(timeline.enqueue(intent('b'))).toBe(true)
    expect(timeline.enqueue(intent('c'))).toBe(false)
  })
})
