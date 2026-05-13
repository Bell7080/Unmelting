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

export type HandEffectSelection = 'target' | 'random' | 'all' | 'none'
export type HandEffectZone = 'front' | 'waiting' | 'field' | 'self' | 'hand' | 'none'

export interface HandEffectScope {
  /** Whether this effect is player-targeted, random, global, or targetless. */
  selection: HandEffectSelection
  /** Board/resource area affected by the effect. */
  zone: HandEffectZone
  /** Maximum affected cards/counts; null means no upper limit for this scope. */
  countLimit: number | null
  /** Optional validator used when selection === 'target'. */
  targetRule?: HandTargetRule
}

export interface HandEffectTargeting {
  /** Normal single-card use scope. */
  base: HandEffectScope
  /** Triple-merged use scope, which can broaden or remove targeting. */
  triple: HandEffectScope
}

export interface HandCardDefinition {
  id: HandCardId
  name: string
  category: HandCategory
  description: string
  /** Description shown for the triple-synthesis enhanced effect. */
  tripleDescription: string
  /** Declarative scope data shared by compendium text and real target validation. */
  targeting: HandEffectTargeting
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
