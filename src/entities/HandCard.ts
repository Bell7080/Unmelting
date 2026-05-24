/**
 * HandCard - Player's consumable item cards.
 *
 * Cards auto-synthesize when three identical cards sit consecutively in hand.
 * The merged card keeps the existing "★ 트리플" UI, while design shorthand
 * such as "3-" remains documentation-only notation outside the code.
 */

export type HandCategory = 'recovery' | 'tool' | 'control' | 'attack'

/** Where a hand card can appear from during a run. */
export type HandCardDropSource =
  | 'any'        // 범용: 적 처치/보물/모든 일반 경로
  | 'enemy-kill' // 적 처치 전용
  | 'treasure'   // 보물상자 전용

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

export type HandEffectSelection = 'target' | 'random' | 'all' | 'none'

export type HandEffectZone = 'front' | 'waiting' | 'field' | 'self' | 'hand' | 'none'

export type HandEffectFilter =
  | 'enemy'
  | 'trap'
  | 'spore'
  | 'treasure'
  | 'enemy-or-treasure'
  | 'turn-timer'
  | 'hazard'
  | 'any'
  | 'none'

export interface HandEffectTargeting {
  /** How the affected object is chosen: 대상/랜덤/전체/없음. */
  selection: HandEffectSelection
  /** Where the effect can look: 전방/대기/필드/자신/손패/없음. */
  zone: HandEffectZone
  /** Which object family is valid inside the zone. */
  filter: HandEffectFilter
  /** Null means every valid object in the zone can be affected. */
  countLimit: number | null
}

export interface HandCardTargetingTable {
  /** Normal single-card behavior. */
  base: HandEffectTargeting
  /** Three-card merged behavior. */
  triple: HandEffectTargeting
}

export interface HandCardDefinition {
  id: HandCardId
  name: string
  category: HandCategory
  description: string
  /** Description shown for the triple-synthesis enhanced effect. */
  tripleDescription: string
  /** Shared targeting/scope data used by the renderer and HandSystem validation. */
  targeting: HandCardTargetingTable
  /** Optional weight that biases drop selection (defaults to 1). */
  dropWeight?: number
  /** Where this card can drop from during a run. */
  dropSource: HandCardDropSource
  /** Must be unlocked in the meta shrine before entering any run pool. */
  metaRequired: boolean
  /** Starts locked within a run even when meta-unlocked; needs an in-run event to unlock. */
  runLocked: boolean
}

export interface HandCard {
  /** Stable per-instance id so the UI can key animations even with duplicates. */
  uid: string
  defId: HandCardId
  /** Set when this card is the result of a 3-consecutive auto-merge in hand. */
  merged?: boolean
  /** Source instance ids consumed by the merge. The renderer uses these ids to
   *  animate the two upper cards from their real previous slots into the lower
   *  merged slot instead of faking a generic top-down convergence. */
  mergeSourceUids?: string[]
}
