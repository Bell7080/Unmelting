/**
 * CompanionForesight - 예측 대비의 '그릇'(위협 추정 모듈).
 *
 * 3x3 보드 + 손패/해금 풀을 읽어 에나가 어떤 손패를 건네면 좋은지 고른다.
 * 모든 판정은 순수 함수로 유지해 런타임, 헤드리스 시뮬, 향후 RL 학습이 같은 기준을 공유한다.
 */

import type { Lane } from '@entities/Lane'
import { LANE_DISTANCE_COUNT } from '@entities/Lane'
import { CardType } from '@entities/Card'
import type { Card } from '@entities/Card'
import type { Character } from '@entities/Character'
import type { HandCard, HandCardId } from '@entities/HandCard'
import { HAND_CARD_DEFINITIONS } from '@data/HandCards'
import { RECIPES } from '@data/Recipes'
import { RELIC_DEFINITIONS } from '@data/Relics'
import { bestSupportCard, type IncomingRefillSummary, type SupportFit, type SupportRoleWeights } from './HandCardAdvisor'

export interface ThreatReport {
  /** 합쳐지기 전 청소 가능한 1칸 거미줄 수. */
  webCount: number
  /** 인접 레인 기준, 다음 전방에서 실제로 병합 가능한 거미줄 군집의 추정 피해(2칸=5, 3칸+=즉사급). 병합각이 없으면 0. */
  potentialWebDamage: number
  /** 합쳐진 거미줄 피해가 현재 체력으로 치명적인가. */
  webLethal: boolean
  /** 합쳐지기 전에 청소/키틴으로 미리 치우는 게 이로운가. */
  recommendCleanup: boolean
  /** 전방/대기 1칸 안의 강적 존재. 에나 미숙 대사와 방어 대비 판단에 쓴다. */
  strongEnemyIncoming: boolean
  /** 함정 제거를 넘어 공격/포자/레시피/트리플까지 본 최종 추천 손패. */
  recommendedCardId: HandCardId | null
  /** 대사/로그가 추천 성격을 구분하도록 남기는 큰 분류(위협 지원은 HandCardAdvisor fit 공유). */
  recommendationKind: SupportFit | 'triple' | 'recipe' | null
  /** 추천을 택한 이유. 로그/학습 trace에서 사람이 읽기 쉽게 남긴다. */
  recommendationReason: string
  /** 대사 슬롯에 섞는 짧은 명사구('왜 이 카드인지'). 위협 지원 추천에서만 채워진다. */
  recommendationShortReason?: string
  /** 현재 손패 순서/체인에서 보조 카드까지 포함해 몇 장 안에 조합각이 열리는지. */
  playableInCards?: number
  /** 빗자루 오지급 방지를 위해 실제 전방 진입 가능성이 있는지 별도로 드러낸다. */
  hasImminentWebDrop: boolean
}

export interface ForesightOptions {
  /** 이번 런에서 실제로 해금되어 에나가 건넬 수 있는 카드 풀. */
  unlockedCardIds?: readonly HandCardId[]
  /** 런에서 발동 가능한 레시피 ID. 없으면 기본 해금 레시피만 본다. */
  unlockedRecipeIds?: ReadonlySet<string>
  /** 지금 유지 중인 체인. 없으면 빈 체인으로 보고, 손패 순서만 계산한다. */
  chainSequence?: readonly HandCardId[]
  /** 이미 이번 체인에서 발동한 레시피는 다시 추천하지 않는다. */
  firedRecipeIds?: ReadonlySet<string>
  /** 보조각으로 인정할 최대 손패 진행 수. 너무 먼 조합은 자연스럽지 않아 제외한다. */
  lookaheadCards?: number
  /** 레일 예고선이 보여 주는 다음 리필 카드(CardSpawner.peekNextRefillCards). 시간 축 보정에 쓴다. */
  incomingRefill?: readonly (Card | null)[]
  /** 강화팩 단일 flat 피해 보너스(gameState.enhancements.singleBonus) — 실효 처치 계산용. */
  handSingleBonus?: Readonly<Partial<Record<HandCardId, number>>>
  /** RL 피팅 역할 가중(EnaDisposition.supportRoleWeights). */
  supportRoleWeights?: SupportRoleWeights
}

/** 예고 카드 배열 → 위협 종류 요약. 런타임 Card와 시뮬 카드가 같은 형태로 환산된다. */
function summarizeIncomingRefill(cards: readonly (Card | null)[] | undefined): IncomingRefillSummary | undefined {
  if (!cards) return undefined
  return {
    webs: cards.filter((c) => c?.type === CardType.TRAP && c.trapKind === 'web').length,
    spores: cards.filter((c) => c?.type === CardType.TRAP && c.trapKind === 'spore').length,
    enemies: cards.filter((c) => c?.type === CardType.ENEMY).length,
  }
}

/** 비합체 보유 장수 맵 — 트리플 완성각(정확히 2장) 판단의 근거로 advisor에 넘긴다. */
function heldCardCounts(character: Character): Partial<Record<HandCardId, number>> {
  const counts: Partial<Record<HandCardId, number>> = {}
  for (const card of character.hand) {
    if (card.merged) continue
    counts[card.defId] = (counts[card.defId] ?? 0) + 1
  }
  return counts
}

/** 합쳐졌을 때 칸 수별 거미줄 추정 피해. 3칸 이상은 '즉사'급으로 크게 본다. */
function mergedWebDamage(webCount: number): number {
  if (webCount >= 3) return 99
  if (webCount === 2) return 5
  return webCount
}

/** 레인별 '다음 전방' 거미줄 요약. 보드 표현이 달라도(런타임 Lane/헤드리스 시뮬) 이 형태로
 *  변환해 넘기면 같은 병합 판정을 공유한다. key는 같은 병합 카드가 여러 레인에 걸칠 때
 *  동일해야 하는 카드 식별자(보통 카드 객체 참조)다. */
export interface NextFrontWebCell {
  key: unknown
  /** 이 카드가 차지한 칸 수(1=단일 거미줄). */
  groupCount: number
}

export interface ImminentWebMergeEstimate {
  /** 다음 전방에서 실제 병합될 군집의 합산 칸 수(병합각 없으면 0). */
  mergedSize: number
  /** 그 군집에 참여하는 1칸 거미줄 수 — 빗자루(1칸 전용) 추천 근거. */
  mergingOneWebs: number
}

/**
 * 병합 판정의 핵심(순수 함수): 레인 순서대로 놓인 '다음 전방' 거미줄 배열에서
 * 서로 다른 카드 2장 이상이 인접한 군집만 '새 병합'으로 세고, 가장 큰 군집을 돌려준다.
 * 떨어져 있는 거미줄은 합쳐질 수 없으므로 병합 피해로 세지 않는다 — 단순 '발견'만으로
 * 에나의 예지/미숙 대사가 나가는 오발동을 막는 근거 값이며, 런타임과 학습 시뮬이 공유한다.
 */
export function estimateImminentWebMergeFromCells(
  nextFrontWebs: readonly (NextFrontWebCell | null)[]
): ImminentWebMergeEstimate {
  let best: ImminentWebMergeEstimate = { mergedSize: 0, mergingOneWebs: 0 }
  let cluster = new Map<unknown, number>()
  const flush = () => {
    // 서로 다른 거미줄 카드 2장 이상이 인접해야 '새 병합'이 일어난다(전방의 인접 동종은 이미 병합돼 한 카드다).
    if (cluster.size >= 2) {
      const groups = [...cluster.values()]
      const mergedSize = groups.reduce((sum, group) => sum + Math.max(1, group), 0)
      if (mergedSize > best.mergedSize) {
        best = { mergedSize, mergingOneWebs: groups.filter((group) => group === 1).length }
      }
    }
    cluster = new Map()
  }
  for (const cell of nextFrontWebs) {
    if (cell) cluster.set(cell.key, cell.groupCount)
    else flush()
  }
  flush()
  return best
}

/** 런타임 Lane 보드용 어댑터: 레인별 '다음 전방' 카드(전방(0)이 차 있으면 그 카드(낙하 봉쇄),
 *  비어 있으면 낙하 예정(1) 카드)를 뽑아 공유 병합 판정에 넘긴다. */
function estimateImminentWebMerge(lanes: readonly Lane[]): ImminentWebMergeEstimate {
  return estimateImminentWebMergeFromCells(
    lanes.map((lane) => {
      const candidate = lane.getCardAtDistance(0) ?? lane.getCardAtDistance(1)
      return candidate && candidate.type === CardType.TRAP && candidate.trapKind === 'web'
        ? { key: candidate, groupCount: candidate.groupCount }
        : null
    })
  )
}

/** 같은 Card 객체가 여러 칸에 걸친 병합 카드일 수 있어 한 번만 센다. */
function uniqueCards(lanes: readonly Lane[]): { card: Card; lane: number; distance: number }[] {
  const seen = new Set<Card>()
  const out: { card: Card; lane: number; distance: number }[] = []
  for (let lane = 0; lane < lanes.length; lane++) {
    for (let distance = 0; distance < LANE_DISTANCE_COUNT; distance++) {
      const card = lanes[lane].getCardAtDistance(distance)
      if (!card || seen.has(card)) continue
      seen.add(card)
      out.push({ card, lane, distance })
    }
  }
  return out
}

function canUse(id: HandCardId, unlocked: Set<HandCardId>): boolean {
  return unlocked.has(id) && !!HAND_CARD_DEFINITIONS[id]
}

function hasHand(character: Character, ids: readonly HandCardId[]): boolean {
  return character.hand.some((card) => ids.includes(card.defId))
}

/** 보유 유물의 synergyTags를 평탄화한다 — 태그가 달린 유물이 데이터에 들어오면 자동 가점된다. */
function ownedRelicTags(character: Character): string[] {
  return character.relics.flatMap((id) => [...(RELIC_DEFINITIONS[id]?.synergyTags ?? [])])
}

/** 현재 체인과 앞으로 누를 손패 순서를 합쳐 레시피 충족까지 필요한 장수를 계산한다. */
function cardsUntilRecipe(recipe: (typeof RECIPES)[number], chain: readonly HandCardId[], orderedHand: readonly HandCard[], candidate: HandCardId, lookahead: number): number | null {
  const counts = new Map<HandCardId, number>()
  for (const id of chain) counts.set(id, (counts.get(id) ?? 0) + 1)
  const satisfies = () => Object.entries(recipe.ingredients).every(([id, need]) => (counts.get(id as HandCardId) ?? 0) >= (need ?? 0))
  if (satisfies()) return 0

  const future = [...orderedHand.map((card) => card.defId), candidate]
  let candidateSeen = false
  for (let i = 0; i < Math.min(lookahead, future.length); i++) {
    const id = future[i]
    if (id === candidate && i === future.length - 1) candidateSeen = true
    counts.set(id, (counts.get(id) ?? 0) + 1)
    if (candidateSeen && satisfies()) return i + 1
  }
  return null
}

/** 같은 카드 2장이 이미 손에 있을 때, 보조 카드가 실제로 몇 번째 위치에서 트리플이 되는지 본다. */
function cardsUntilTriple(orderedHand: readonly HandCard[], candidate: HandCardId, lookahead: number): number | null {
  const future = [...orderedHand.map((card) => card.defId), candidate]
  for (let i = 0; i < Math.min(lookahead, future.length); i++) {
    const window = future.slice(0, i + 1)
    if (window.filter((id) => id === candidate).length >= 3) return i + 1
  }
  return null
}

/** 3x3 보드 + 플레이어 상태를 읽어 가까운 위협과 추천 지원 손패를 추정한다. */
export function assessThreats(lanes: readonly Lane[], character: Character, options: ForesightOptions = {}): ThreatReport {
  const unlocked = new Set(options.unlockedCardIds ?? (Object.keys(HAND_CARD_DEFINITIONS) as HandCardId[]).filter((id) => !HAND_CARD_DEFINITIONS[id].runLocked))
  const cells = uniqueCards(lanes)
  const webCells = cells.filter(({ card }) => card.type === CardType.TRAP && card.trapKind === 'web')
  const oneWebs = webCells.filter(({ card }) => card.groupCount === 1)
  const frontTwoWeb = webCells.some(({ card, distance }) => distance === 0 && card.groupCount === 2)
  const hasImminentWebDrop = oneWebs.some(({ distance }) => distance <= 1)
  const webCount = oneWebs.length
  // 병합 피해는 레인 인접성이 있는 실제 군집만 본다 — 흩어진 거미줄 발견을 위협으로 오판하지 않는다.
  const webMerge = estimateImminentWebMerge(lanes)
  const potentialWebDamage = mergedWebDamage(webMerge.mergedSize)
  const webLethal = potentialWebDamage >= character.health
  const sporeReady = cells.some(({ card, distance }) => card.type === CardType.TRAP && card.trapKind === 'spore' && (distance === 0 || card.sporeTurnsUntilSpread <= 1))
  const strongEnemy = cells.find(({ card, distance }) => card.type === CardType.ENEMY && distance <= 1 && (card.groupCount >= 2 || card.health > character.damage + 1))
  // 위협 지원 카드는 전 손패 범용 스코어러(HandCardAdvisor)가 데이터 주도로 고른다.
  const frontWideWebSpan = Math.max(0, ...webCells.filter(({ distance }) => distance === 0).map(({ card }) => card.groupCount))
  const support = bestSupportCard(
    {
      playerAttack: character.damage,
      playerHealth: character.health,
      playerMaxHealth: character.maxHealth,
      playerShield: character.shield,
      emberLow: character.ember <= 1,
      // 청소 추천은 실제 낙하/병합 가능성이 있을 때만(1칸 web 오판 빗자루 방지).
      frontWideWebSpan: frontTwoWeb || frontWideWebSpan >= 2 ? frontWideWebSpan : 0,
      webMerge: hasImminentWebDrop ? webMerge : { mergedSize: 0, mergingOneWebs: 0 },
      // 필드 오염(1칸 거미줄 다수)은 병합각 없이도 광역 청소 근거가 된다.
      fieldOneWebCount: webCount,
      // 실효값 원칙: 시련/유물의 런 단위 함정 피해 보너스를 환산에 반영한다.
      trapDamageBonus: character.trapDamageBonus,
      sporeReady,
      strongEnemy: strongEnemy
        ? {
            health: strongEnemy.card.getHealth(),
            atFront: strongEnemy.distance === 0,
            // 실효 공격력(불씨 티어 보너스 포함) + 반격 임박 턴(전방 비굳음=0, 굳음=잔여 턴, 대기=1).
            attack: strongEnemy.card.getDamage(),
            attackInTurns: strongEnemy.distance === 0 ? (strongEnemy.card.isFrozen() ? strongEnemy.card.frozenTurns : 0) : 1,
          }
        : undefined,
      heldCardIds: character.hand.map((card) => card.defId),
      heldCardCounts: heldCardCounts(character),
      handSingleBonus: options.handSingleBonus,
      incomingRefill: summarizeIncomingRefill(options.incomingRefill),
      ownedRelicTags: ownedRelicTags(character),
      supportRoleWeights: options.supportRoleWeights,
      // 레시피 완성각: 런타임은 gameState.unlockedRecipeIds가 그대로 흘러온다(기본 레시피는 항상 활성).
      unlockedRecipeIds: options.unlockedRecipeIds,
    },
    [...unlocked]
  )
  const lookahead = options.lookaheadCards ?? 4
  const chainSequence = options.chainSequence ?? []
  const firedRecipeIds = options.firedRecipeIds ?? new Set<string>()
  const activeRecipes = RECIPES.filter((recipe) => (!recipe.runLocked || options.unlockedRecipeIds?.has(recipe.id)) && !firedRecipeIds.has(recipe.id))
  const hasTacticalRecipeBoard = cells.some(({ card, distance }) =>
    distance <= 1 && (card.type === CardType.ENEMY || card.type === CardType.TRAP || card.type === CardType.TREASURE)
  )
  const recipeNeed = hasTacticalRecipeBoard
    ? activeRecipes
        .flatMap((recipe) => Object.keys(recipe.ingredients)
          .filter((id) => canUse(id as HandCardId, unlocked) && !hasHand(character, [id as HandCardId]))
          .map((id) => ({ recipe, ingredient: id as HandCardId, turns: cardsUntilRecipe(recipe, chainSequence, character.hand, id as HandCardId, lookahead) })))
        .filter((plan): plan is { recipe: (typeof RECIPES)[number]; ingredient: HandCardId; turns: number } => plan.turns !== null)
        .sort((a, b) => a.turns - b.turns || a.recipe.totalCount - b.recipe.totalCount)[0]
    : undefined
  const tripleNeed = character.hand
    .filter((held, _index, hand) => !held.merged && canUse(held.defId, unlocked) && hand.filter((c) => c.defId === held.defId && !c.merged).length === 2)
    .map((held) => ({ id: held.defId, turns: cardsUntilTriple(character.hand.filter((c) => !c.merged), held.defId, lookahead) }))
    .filter((plan): plan is { id: HandCardId; turns: number } => plan.turns !== null)
    .sort((a, b) => a.turns - b.turns)[0]

  let recommendedCardId: HandCardId | null = null
  let recommendationReason = ''
  let recommendationShortReason: string | undefined
  let recommendationKind: ThreatReport['recommendationKind'] = null
  let playableInCards: number | undefined
  if (support) {
    // 청소/포자/처치/방어/불씨/회복 지원은 전부 범용 스코어러 결과를 그대로 쓴다.
    recommendedCardId = support.cardId
    recommendationKind = support.fit
    recommendationReason = support.detail
    recommendationShortReason = support.reason
  } else if (tripleNeed) {
    recommendedCardId = tripleNeed.id
    playableInCards = tripleNeed.turns
    recommendationKind = 'triple'
    recommendationReason = `현재 손패 순서대로 ${tripleNeed.turns}장 안에 트리플 완성 가능`
  } else if (recipeNeed) {
    recommendedCardId = recipeNeed.ingredient
    playableInCards = recipeNeed.turns
    recommendationKind = 'recipe'
    recommendationReason = `${recipeNeed.recipe.name} 레시피가 현재 체인/손패 순서에서 ${recipeNeed.turns}장 안에 발동 가능`
  }

  return { webCount, potentialWebDamage, webLethal, recommendCleanup: support?.fit === 'cleanup', strongEnemyIncoming: !!strongEnemy, recommendedCardId, recommendationKind, recommendationReason, recommendationShortReason, hasImminentWebDrop, playableInCards }
}
