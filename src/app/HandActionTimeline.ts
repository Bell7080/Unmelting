import type { HandCard, HandCardId } from '@entities/HandCard'

/** Stable board target captured when the player expresses a hand-card use. */
export interface HandIntentTarget {
  cardId: string
  laneIndex: number
  distance: number
  gimmickCellIndex?: number
}

/** A hand request never trusts a mutable slot number after it is enqueued. */
export interface HandUseIntent {
  uid: string
  defId: HandCardId
  merged: boolean
  requestedAt: number
  target?: HandIntentTarget
}

export type HandIntentCancelReason = 'card-missing' | 'card-changed' | 'target-dead' | 'phase-changed'

export interface HandIntentValidation {
  slotIndex: number
  card: HandCard
}

/**
 * FIFO store for hand intentions. It owns duplicate-tap protection and resolves
 * the current slot by UID immediately before the caller commits model changes.
 */
export class HandActionTimeline {
  private readonly intents: HandUseIntent[] = []

  constructor(private readonly capacity: number) {}

  enqueue(intent: HandUseIntent): boolean {
    // One physical card may only have one outstanding tap, on desktop or touch.
    if (this.intents.length >= this.capacity || this.intents.some((queued) => queued.uid === intent.uid)) return false
    this.intents.push(intent)
    return true
  }

  shift(): HandUseIntent | undefined { return this.intents.shift() }
  clear(): HandUseIntent[] { return this.intents.splice(0) }
  get length(): number { return this.intents.length }
  has(uid: string): boolean { return this.intents.some((intent) => intent.uid === uid) }
  orderOf(uid: string): number | null {
    const index = this.intents.findIndex((intent) => intent.uid === uid)
    return index < 0 ? null : index + 1
  }

  validate(
    intent: HandUseIntent,
    hand: readonly HandCard[],
    phaseAllowsHand: boolean,
    targetAlive: (target: HandIntentTarget) => boolean
  ): HandIntentValidation | HandIntentCancelReason {
    if (!phaseAllowsHand) return 'phase-changed'
    const slotIndex = hand.findIndex((card) => card.uid === intent.uid)
    if (slotIndex < 0) return 'card-missing'
    const card = hand[slotIndex]
    if (card.defId !== intent.defId || (card.merged === true) !== intent.merged) return 'card-changed'
    if (intent.target && !targetAlive(intent.target)) return 'target-dead'
    return { slotIndex, card }
  }
}
