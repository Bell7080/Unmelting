/**
 * RendererTypes — GameBoardRenderer와 서브 렌더러(도감/상점/이벤트 등)가 공유하는
 * 뷰 계약 타입 모음. 렌더러 분리 시 순환 import를 피하기 위해 타입만 둔다.
 */

import type { Card } from '@entities/Card'
import type { CandleMode } from '@entities/Character'
import type { HandCardId, HandCategory } from '@entities/HandCard'
import type { EmberTier, SpawnWeights } from '@systems/EmberSystem'
import type { RelicId } from '@data/Relics'
import type { CardRarity } from '@data/ShopPools'

export interface CardActionDetail {
  laneIndex: number
  distance: number
  card: Card
}

export interface ItemActionDetail {
  itemIndex: number
  shiftKey?: boolean
  /** 클릭 좌표 — 튜토리얼 잠금 메시지 위치에 사용. */
  clientX?: number
  clientY?: number
}

export type ShopPackKind = 'basic-pack' | 'recipe-pack' | 'unlock-pack' | 'chance-pack' | 'resource-pack' | 'delete-pack'

export interface ShopBuyDetail {
  kind: 'relic' | 'free-card' | 'free-coin-card' | 'reroll' | ShopPackKind
  relicId?: RelicId
}

export interface ShopPackPickDetail {
  packKind: ShopPackKind
  itemId: string
}

export interface ShopOfferView {
  relicId: RelicId
  /** Per-spawn score price (mid-3-digit, with small jitter "inflation"
   *  so the displayed cost reads as 872 / 1183 / 491 etc rather than
   *  round numbers). Computed once when the shop is rolled. */
  price: number
  purchased?: boolean
}
/** One option that pops out when a pack is torn open. */
export interface ShopPackItemView {
  /** Stable id within this picker session — echoed back via shopPackPick. */
  id: string
  title: string
  /** Effect line ("체력 +2", "공격력 +1" 등). */
  effect: string
  /** Theme tints the card frame: resource(자원)/upgrade(강화)/unlock(해금). */
  theme: 'resource' | 'upgrade' | 'unlock'
  rarity: CardRarity
  /** 카드별 개별 일러스트 URL. 없으면 팩 커버 이미지를 fallback으로 사용한다. */
  spriteUrl?: string
  /** 카드 상단 타입 배지 (트리플/레시피/손패/단일/삭제 등). */
  typeLabel?: string
  /** 레시피 재료 n+n 표기. 레시피 관련 아이템에만 설정한다. */
  recipeNote?: string
  /** 실제 손패 카드에 대응하는 항목이면 설정 — 카테고리/직업 태그 오버레이 표시용. */
  handCardId?: HandCardId
}
export interface ShopPackPickerView {
  packKind: ShopPackKind
  title: string
  items: ShopPackItemView[]
  /** 넘기기 버튼 표시 여부 (delete-pack / unlock-pack). */
  passable?: boolean
  /** 재뽑기 버튼의 화폐 비용. 없으면 버튼을 숨긴다. */
  rerollCost?: number
  /** 현재 보유 화폐 (재뽑기 버튼 활성화 판정에 사용). */
  coins?: number
}
export interface ShopStateView {
  /** Normal 10/20/... shop vs 30/60/... altar variant. */
  mode: 'shop' | 'altar'
  relicOffers: ShopOfferView[]
  freeCardClaimed: boolean
  freeCoinCardClaimed?: boolean
  /** 무료 카드 랜덤 결과 문구(예: ✦300 / 1$). */
  freeCardDescription?: string
  /** Reroll cost is paid from coins (화폐, $), not score (불빛). */
  rerollCost: number
  /** Current coin balance — used to compute reroll-button affordability. */
  coins: number
  basicPackCost: number
  /** 제단 4팩처럼 기본 3팩과 매핑이 다른 경우에도 각 팩 가격을 독립 갱신한다. */
  packCosts?: Partial<Record<ShopPackKind, number>>
}
export interface ForcedTrialCardView {
  id: string
  title: string
  effect: string
  /** 시련 카드 일러스트 URL. 일러스트 미준비 시 호출부가 임시 sprite를 넘긴다. */
  spriteUrl: string
}

export interface ActivityLogEntry {
  id: number
  label: string
  scoreDelta?: number
  itemCount?: number
  badge?: string
  kind:
    | 'enemy'
    | 'treasure'
    | 'trap'
    | 'item'
    | 'item-gain'
    | 'score'
    | 'notice'
    | 'win'
    | 'hurt'
    | 'melt'
    | 'gauge'
    | 'relic'
}

export interface HandTargetingMode {
  slotIndex: number
  defId: HandCardId
  /** 합체(트리플) 카드 여부 — 타겟 하이라이트가 base/triple 규칙을 올바로 고르게 한다. */
  merged?: boolean
}

export interface ChainEventBase {
  /** Stable per-event id so the renderer can detect new entries and pop-in
   *  the right one without re-firing the animation on every render. */
  uid: string
}
export interface ChainEventCard extends ChainEventBase {
  kind: 'card'
  defId: HandCardId
  name: string
  category: HandCategory
}
export interface ChainEventRecipe extends ChainEventBase {
  kind: 'recipe'
  recipeId: string
  name: string
  flavor: string
}
export interface ChainEventGauge extends ChainEventBase {
  kind: 'gauge'
  mode: CandleMode
  name: string
  flavor: string
}
export interface ChainEventRelic extends ChainEventBase {
  kind: 'relic'
  relicId: RelicId
  name: string
  flavor: string
}
export type ChainEvent = ChainEventCard | ChainEventRecipe | ChainEventGauge | ChainEventRelic

export interface ChainHints {
  events: ChainEvent[]
  /** Slots whose next click would immediately satisfy at least one recipe. */
  recipeReadyBySlot?: Record<number, { id: string; name: string; flavor: string }[]>
  /** 악마 소환 레시피가 체인에 포함됨 — 배너 최좌측 대형 붉은 다이아몬드로 이벤트 체인을 별도 표시. */
  demonPending?: boolean
  /** 악마 소환 임팩트 연출 — 체인 배너를 거대하게/중앙에/X 없이/불타듯 표시. */
  demonImpactMode?: boolean
}

export type ResourceTrailTarget =
  | 'hand'
  | 'score'
  | 'coin'
  | 'health'
  | 'shield'
  | 'ember'
  | 'gauge'
  | 'attack'
  | 'relic'

/** 실제 스폰 가중치 원시값 — 렌더러에서 % 변화량 계산에 사용한다. */
export interface SpawnWeightContext {
  enemy: number
  trap: number
  treasure: number
  flower: number
  total: number
}

export interface ScorePanelState {
  score: number
  logs: ActivityLogEntry[]
  scorePulseKey: number
  coins: number
  coinPulseKey: number
  emberTier?: EmberTier
  spawnWeights?: SpawnWeights
  /** 렌더러가 실제 % 표시와 유물 효과 텍스트 치환에 사용하는 실효 가중치. */
  spawnWeightContext?: SpawnWeightContext
  /** 가중치 기반으로 정규화된 0-100 실효 확률. */
  spawnPercents?: { enemy: number; trap: number; treasure: number; flower: number }
  emberDecayCountdown?: number
  vignetteIntensity?: number
  chainHints?: ChainHints
  pendingHandTarget?: HandTargetingMode | null
  /** 실제 다음 리필 카드 예고용. index가 laneIndex와 일치한다. */
  refillPreviewCards?: readonly (Card | null)[]
}
