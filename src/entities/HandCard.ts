/**
 * HandCard - Player's consumable item cards.
 *
 * Cards auto-synthesize when three identical cards sit consecutively in hand.
 * The merged card keeps the existing "★ 트리플" UI, while design shorthand
 * such as "3-" remains documentation-only notation outside the code.
 */

export type HandCategory = 'recovery' | 'tool' | 'control' | 'attack'

export type HandCardId =
  | 'wax-drop'
  | 'candle'
  | 'ember'
  | 'key'
  | 'wax'
  | 'match'
  | 'holy-water'
  | 'chitin'
  | 'card'
  | 'coin'

export type HandTargetRule = 'field-enemy' | 'front-card-or-treasure' | 'front-trap'

export interface HandCardDefinition {
  id: HandCardId
  name: string
  category: HandCategory
  description: string
  /** Description shown for the triple-synthesis enhanced effect. */
  tripleDescription: string
  /** Candle gained from a single use. */
  candleGain: number
  /** Optional targeting rule used by the renderer and HandSystem validation. */
  targetRule?: HandTargetRule
  /** Optional weight that biases drop selection (defaults to 1). */
  dropWeight?: number
}

export interface HandCard {
  /** Stable per-instance id so the UI can key animations even with duplicates. */
  uid: string
  defId: HandCardId
  /** Set when this card is the result of a 3-consecutive auto-merge in hand. */
  merged?: boolean
}
