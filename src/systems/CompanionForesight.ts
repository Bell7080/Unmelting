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

export interface ThreatReport {
  /** 합쳐지기 전 청소 가능한 1칸 거미줄 수. */
  webCount: number
  /** 그 거미줄들이 전방으로 내려와 한 행으로 합쳐졌을 때 추정 피해(3칸=치명적, 2칸=5). */
  potentialWebDamage: number
  /** 합쳐진 거미줄 피해가 현재 체력으로 치명적인가. */
  webLethal: boolean
  /** 합쳐지기 전에 청소/키틴으로 미리 치우는 게 이로운가. */
  recommendCleanup: boolean
  /** 함정 제거를 넘어 공격/포자/레시피/트리플까지 본 최종 추천 손패. */
  recommendedCardId: HandCardId | null
  /** 추천을 택한 이유. 로그/학습 trace에서 사람이 읽기 쉽게 남긴다. */
  recommendationReason: string
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
}

/** 합쳐졌을 때 칸 수별 거미줄 추정 피해. 3칸 이상은 '즉사'급으로 크게 본다. */
function mergedWebDamage(webCount: number): number {
  if (webCount >= 3) return 99
  if (webCount === 2) return 5
  return webCount
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
  const incomingOneWebs = oneWebs.filter(({ distance }) => distance <= 1).length
  const webCount = oneWebs.length
  const potentialWebDamage = mergedWebDamage(frontTwoWeb && incomingOneWebs > 0 ? 3 : incomingOneWebs)
  const webLethal = potentialWebDamage >= character.health
  // 빗자루는 1칸 거미줄 전용이라, 실제 전방 진입 임박한 1칸 web이 없으면 추천하지 않는다.
  const recommendSweep = hasImminentWebDrop && incomingOneWebs >= 2 && canUse('sweep' as HandCardId, unlocked)
  // 2칸 전방 거미줄 + 곧 내려올 1칸은 3칸 즉사 후보라 키틴(특히 트리플 대기)을 우선한다.
  const recommendChitin = canUse('chitin' as HandCardId, unlocked) && (frontTwoWeb || webCells.some(({ card, distance }) => distance === 0 && card.groupCount >= 2))
  const sporeReady = cells.some(({ card, distance }) => card.type === CardType.TRAP && card.trapKind === 'spore' && (distance === 0 || card.sporeTurnsUntilSpread <= 1))
  const strongEnemy = cells.find(({ card, distance }) => card.type === CardType.ENEMY && distance <= 1 && (card.groupCount >= 2 || card.health > character.damage + 1))
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
  let playableInCards: number | undefined
  if (!hasHand(character, ['chitin' as HandCardId]) && recommendChitin) {
    recommendedCardId = 'chitin' as HandCardId
    recommendationReason = frontTwoWeb && incomingOneWebs > 0 ? '전방 2칸 거미줄에 1칸 거미줄이 합류해 3칸 위협이 될 수 있음' : '전방 병합 거미줄은 키틴으로 직접 제거 가능'
  } else if (!hasHand(character, ['sweep' as HandCardId, 'chitin' as HandCardId]) && recommendSweep) {
    recommendedCardId = 'sweep' as HandCardId
    recommendationReason = '1칸 거미줄들이 다음 전방에서 병합될 가능성이 높음'
  } else if (sporeReady && canUse('holy-water' as HandCardId, unlocked) && !hasHand(character, ['holy-water' as HandCardId])) {
    recommendedCardId = 'holy-water' as HandCardId
    recommendationReason = '포자 전염 카운트가 가까워 필드 정화 가치가 높음'
  } else if (strongEnemy && canUse('ember' as HandCardId, unlocked) && !hasHand(character, ['ember' as HandCardId])) {
    recommendedCardId = 'ember' as HandCardId
    recommendationReason = '전방/대기라인 강적을 단일 고화력 손패로 끊을 필요가 있음'
  } else if (tripleNeed) {
    recommendedCardId = tripleNeed.id
    playableInCards = tripleNeed.turns
    recommendationReason = `현재 손패 순서대로 ${tripleNeed.turns}장 안에 트리플 완성 가능`
  } else if (recipeNeed) {
    recommendedCardId = recipeNeed.ingredient
    playableInCards = recipeNeed.turns
    recommendationReason = `${recipeNeed.recipe.name} 레시피가 현재 체인/손패 순서에서 ${recipeNeed.turns}장 안에 발동 가능`
  }

  return { webCount, potentialWebDamage, webLethal, recommendCleanup: recommendSweep || recommendChitin, recommendedCardId, recommendationReason, hasImminentWebDrop, playableInCards }
}
