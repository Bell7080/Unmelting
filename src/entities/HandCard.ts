/**
 * HandCard - Player's hand of consumable items used to fight, recover, and combo.
 *
 * Each card belongs to a category (recovery/tool/control/attack). The category
 * drives Melt resolution and combo pattern detection. Concrete card definitions
 * live in src/data/HandCards.ts.
 */

export type HandCategory = 'recovery' | 'tool' | 'control' | 'attack'

export type HandCardId =
  | 'small-candle'
  | 'large-candle'
  | 'wax-shield'
  | 'matchstick'
  | 'brass-key'
  | 'cooled-candle'
  | 'cleansing-ember'
  | 'match-bundle'

export interface HandCardDefinition {
  id: HandCardId
  name: string
  category: HandCategory
  description: string
  /** Description shown for the triple-synthesis enhanced effect. */
  tripleDescription: string
  /** Candle gained from a single use. */
  candleGain: number
  /** Whether single use requires a target card on the active row. */
  needsTarget?: boolean
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
