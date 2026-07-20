/**
 * HandCard - Player's consumable item cards.
 *
 * Cards auto-synthesize when three identical cards sit consecutively in hand.
 * The merged card keeps the existing "★ 트리플" UI, while design shorthand
 * such as "3-" remains documentation-only notation outside the code.
 */

import type { SynergyTag } from '../data/Tags'

export type HandCategory = 'recovery' | 'tool' | 'control' | 'attack'

/** 직업별 전용 태그 — 도감·호버 미리보기에 카테고리 뱃지 옆에 표시한다. */
export type JobTag = 'knight' | 'mage'

/** Where a hand card can appear from during a run. */
export type HandCardDropSource =
  | 'any'        // 범용: 적 처치/보물/모든 일반 경로
  | 'enemy-kill' // 적 처치 전용
  | 'treasure'   // 보물상자 전용
  | 'boss'       // 보스 전용(일반 드롭/드로우 풀에 절대 섞이지 않음)
  | 'relic'      // 유물 생성 전용 파편 카드(일반 드롭/드로우 풀에 절대 섞이지 않음)

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
  | 'greed-coin'
  | 'sacrifice-candle'
  | 'levatein'
  | 'firework'
  | 'book-of-flames'
  | 'fire-arrow'
  | 'shield-bash'
  | 'sacrifice-shield'
  | 'sweep'
  | 'hand-mirror'
  | 'chandelier'
  | 'bonfire'
  | 'teapot'
  | 'teacup'
  | 'top-hat'
  | 'slash'
  | 'shackles'
  | 'candle-tome'
  | 'sword-and-shield'
  | 'watering-can'
  | 'garden-scissors'
  | 'ritual-candle'
  | 'black-candle'
  // 제물(sacrifice) 축 손패 — 바늘: 자해 딜+처치 회복 씨앗 / 부두 인형: 자해로 보물·함정 조작
  //                         / 단두대: 대량 자해 필드 전체 피해 펌프.
  | 'needle'
  | 'voodoo-doll'
  | 'guillotine'
  // 유물 생성 전용 파편 카드(시너지 씨앗). 일반 풀에는 없고 생성기 유물이 지급한다.
  | 'blade-shard'
  // 검집: 칼날 파편을 손에 생성하는 손패(단검 투척 빌드의 손패 생성원).
  | 'scabbard'
  // 칼날의 서: 통산 파편 사용 수에 비례해 파편을 여러 발 투척하는 마법사 손패(램프형).
  | 'blade-tome'

export type HandEffectSelection = 'target' | 'random' | 'all' | 'none'

export type HandEffectZone = 'front' | 'waiting' | 'field' | 'self' | 'hand' | 'none'

export type HandEffectFilter =
  | 'enemy'
  | 'trap'
  | 'spore'
  | 'treasure'
  | 'enemy-or-treasure'
  | 'trap-or-treasure'
  | 'turn-timer'
  | 'hazard'
  | 'any'
  | 'none'
  | 'flower'
  | 'flower-or-monsterflower'

export interface HandEffectTargeting {
  /** How the affected object is chosen: 대상/랜덤/전체/없음. */
  selection: HandEffectSelection
  /** Where the effect can look: 전방/대기/필드/자신/손패/없음. */
  zone: HandEffectZone
  /** Which object family is valid inside the zone. */
  filter: HandEffectFilter
  /** Null means every valid object in the zone can be affected. */
  countLimit: number | null
  /** 대상 카드의 최대 폭(칸=groupCount) 제한. 지정 시 이 폭을 넘는 카드는 대상에서 제외한다. */
  maxSpan?: number
}

export interface HandCardTargetingTable {
  /** Normal single-card behavior. */
  base: HandEffectTargeting
  /** Three-card merged behavior. */
  triple: HandEffectTargeting
}

/** 즉시 피해 근사 파라미터: floor(atkMult×공격력)+flat.
 *  실제 실행 공식은 HandSystem이 소유하며, 이 테이블은 에나 판단(HandCardAdvisor)용
 *  보수 근사다 — HandSystem 공식이 바뀌면 함께 갱신한다. */
export interface HandDamageProfile {
  base: { atkMult: number; flat: number }
  triple: { atkMult: number; flat: number }
  /** false면 무작위/조건부 피해라 확정 처치 계산에 쓰지 않는다. */
  deterministic: boolean
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
  /** 직업 태그 — 기사/마법사 전용 카드임을 표기한다. */
  jobTags?: ReadonlyArray<JobTag>
  /** 시너지 태그(예: 'flame','shield','sacrifice') — 카드↔레시피↔유물 태그 겹침을
   *  에나 판단(HandCardAdvisor)·지식(EnaKnowledgeAdapter)·유물 반응(TagReactions)이 읽는다.
   *  값은 반드시 src/data/Tags.ts SYNERGY_TAGS에 등록된 것이어야 하며, 카드당 1~5개. */
  synergyTags?: readonly SynergyTag[]
  /** 단일 대상 즉시 피해 근사(확정 킬 계산용). 없으면 피해 카드로 보지 않는다. */
  damageProfile?: HandDamageProfile
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
