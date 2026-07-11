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
  /** 대사/로그가 추천 성격을 구분하도록 남기는 큰 분류. */
  recommendationKind: 'cleanup' | 'spore' | 'attack' | 'defense' | 'triple' | 'recipe' | null
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

/**
 * 다음 전방 행에서 실제로 이어질 수 있는(레인 인접) 거미줄 병합 군집을 추정한다.
 * 떨어져 있는 거미줄은 합쳐질 수 없으므로 병합 피해로 세지 않는다 — 단순 '발견'만으로
 * 에나의 예지/미숙 대사가 나가는 오발동을 막는 근거 값이다.
 */
function estimateImminentWebMerge(lanes: readonly Lane[]): { mergedSize: number; mergingOneWebs: number } {
  // 레인별 '다음 전방' 카드: 전방(0)이 차 있으면 그 카드(낙하 봉쇄), 비어 있으면 낙하 예정(1) 카드.
  const nextFrontWeb = lanes.map((lane) => {
    const candidate = lane.getCardAtDistance(0) ?? lane.getCardAtDistance(1)
    return candidate && candidate.type === CardType.TRAP && candidate.trapKind === 'web' ? candidate : null
  })
  let best = { mergedSize: 0, mergingOneWebs: 0 }
  let cluster = new Set<Card>()
  const flush = () => {
    // 서로 다른 거미줄 카드 2장 이상이 인접해야 '새 병합'이 일어난다(전방의 인접 동종은 이미 병합돼 한 카드다).
    if (cluster.size >= 2) {
      const cards = [...cluster]
      const mergedSize = cards.reduce((sum, card) => sum + Math.max(1, card.groupCount), 0)
      if (mergedSize > best.mergedSize) {
        best = { mergedSize, mergingOneWebs: cards.filter((card) => card.groupCount === 1).length }
      }
    }
    cluster = new Set<Card>()
  }
  for (const web of nextFrontWeb) {
    if (web) cluster.add(web)
    else flush()
  }
  flush()
  return best
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

/** 에나가 직접 줄 수 있는 주요 공격 손패의 즉시 피해를 현재 공격력 기준으로 보수 계산한다. */
function estimatedSingleTargetDamage(id: HandCardId, character: Character): number | null {
  const atk = character.damage
  switch (id) {
    case 'ember':
      return atk + 1
    case 'bonfire':
      return Math.floor(atk)
    case 'sword-and-shield':
      return Math.floor(0.5 * atk) + 1
    case 'slash':
      return Math.floor(2 * atk) + 2
    case 'fire-arrow':
      // 무작위 피해 카드는 최소치가 낮아 확정 킬 계산에는 쓰지 않는다.
      return null
    default:
      return null
  }
}

/** 필드/전방 필터를 만족하고, 지금 손에 없으며, 가장 깔끔하게 처치 가능한 공격 손패를 고른다. */
function bestKillSupport(strongEnemy: { card: Card; distance: number } | undefined, character: Character, unlocked: Set<HandCardId>): { id: HandCardId; damage: number } | null {
  if (!strongEnemy) return null
  const candidates: HandCardId[] = ['ember', 'bonfire', 'sword-and-shield', 'slash'] as HandCardId[]
  const viable = candidates
    .filter((id) => canUse(id, unlocked) && !hasHand(character, [id]))
    .filter((id) => HAND_CARD_DEFINITIONS[id].targeting.base.zone === 'field' || strongEnemy.distance === 0)
    .map((id) => ({ id, damage: estimatedSingleTargetDamage(id, character) }))
    .filter((plan): plan is { id: HandCardId; damage: number } => plan.damage !== null && plan.damage >= strongEnemy.card.getHealth())
    // 과잉 피해가 가장 적은 카드부터 추천해, '딱 맞는 도움'처럼 느껴지게 한다.
    .sort((a, b) => (a.damage - strongEnemy.card.getHealth()) - (b.damage - strongEnemy.card.getHealth()))
  return viable[0] ?? null
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
  // 빗자루는 1칸 거미줄 전용이라, 인접해서 실제 병합될 1칸 web이 2장 이상일 때만 추천한다.
  const recommendSweep = hasImminentWebDrop && webMerge.mergingOneWebs >= 2 && canUse('sweep' as HandCardId, unlocked)
  // 2칸 전방 거미줄 + 곧 내려올 1칸은 3칸 즉사 후보라 키틴(특히 트리플 대기)을 우선한다.
  const recommendChitin = canUse('chitin' as HandCardId, unlocked) && (frontTwoWeb || webCells.some(({ card, distance }) => distance === 0 && card.groupCount >= 2))
  const sporeReady = cells.some(({ card, distance }) => card.type === CardType.TRAP && card.trapKind === 'spore' && (distance === 0 || card.sporeTurnsUntilSpread <= 1))
  const strongEnemy = cells.find(({ card, distance }) => card.type === CardType.ENEMY && distance <= 1 && (card.groupCount >= 2 || card.health > character.damage + 1))
  const killSupport = bestKillSupport(strongEnemy, character, unlocked)
  // 처치각이 없을 때도 맞기 전 행동력이 필요하다. 전방 강적은 밀랍으로 공격 턴을 벌고,
  // 밀랍이 없으면 검과 방패로 피해와 방패를 동시에 확보한다.
  const defensiveSupport = strongEnemy && !killSupport && !hasHand(character, ['wax' as HandCardId, 'sword-and-shield' as HandCardId])
    ? (strongEnemy.distance === 0 && canUse('wax' as HandCardId, unlocked)
        ? 'wax' as HandCardId
        : (strongEnemy.distance === 0 && canUse('sword-and-shield' as HandCardId, unlocked) ? 'sword-and-shield' as HandCardId : null))
    : null
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
  let recommendationKind: ThreatReport['recommendationKind'] = null
  let playableInCards: number | undefined
  if (!hasHand(character, ['chitin' as HandCardId]) && recommendChitin) {
    recommendedCardId = 'chitin' as HandCardId
    recommendationKind = 'cleanup'
    // '3칸 합류' 근거는 인접 병합 군집이 실제로 3칸 이상일 때만 주장한다.
    recommendationReason = webMerge.mergedSize >= 3 ? '전방 2칸 거미줄에 1칸 거미줄이 합류해 3칸 위협이 될 수 있음' : '전방 병합 거미줄은 키틴으로 직접 제거 가능'
  } else if (!hasHand(character, ['sweep' as HandCardId, 'chitin' as HandCardId]) && recommendSweep) {
    recommendedCardId = 'sweep' as HandCardId
    recommendationKind = 'cleanup'
    recommendationReason = '1칸 거미줄들이 다음 전방에서 병합될 가능성이 높음'
  } else if (sporeReady && canUse('holy-water' as HandCardId, unlocked) && !hasHand(character, ['holy-water' as HandCardId])) {
    recommendedCardId = 'holy-water' as HandCardId
    recommendationKind = 'spore'
    recommendationReason = '포자 전염 카운트가 가까워 필드 정화 가치가 높음'
  } else if (killSupport) {
    recommendedCardId = killSupport.id
    recommendationKind = 'attack'
    recommendationReason = `전방/대기라인 강적을 피해 ${killSupport.damage} 손패로 처치 가능`
  } else if (defensiveSupport) {
    recommendedCardId = defensiveSupport
    recommendationKind = 'defense'
    recommendationReason = defensiveSupport === 'wax'
      ? '처치가 어려운 전방 강적의 반격 타이밍을 밀랍으로 늦출 수 있음'
      : '처치가 어려운 전방 강적에게 피해를 주며 방패를 확보할 수 있음'
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

  return { webCount, potentialWebDamage, webLethal, recommendCleanup: recommendSweep || recommendChitin, strongEnemyIncoming: !!strongEnemy, recommendedCardId, recommendationKind, recommendationReason, hasImminentWebDrop, playableInCards }
}
