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
import type { HandCardId } from '@entities/HandCard'
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
  /** 빗자루 오지급 방지를 위해 실제 전방 진입 가능성이 있는지 별도로 드러낸다. */
  hasImminentWebDrop: boolean
}

export interface ForesightOptions {
  /** 이번 런에서 실제로 해금되어 에나가 건넬 수 있는 카드 풀. */
  unlockedCardIds?: readonly HandCardId[]
  /** 런에서 발동 가능한 레시피 ID. 없으면 기본 해금 레시피만 본다. */
  unlockedRecipeIds?: ReadonlySet<string>
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
  const activeRecipes = RECIPES.filter((recipe) => !recipe.runLocked || options.unlockedRecipeIds?.has(recipe.id))
  const hasTacticalRecipeBoard = cells.some(({ card, distance }) =>
    distance <= 1 && (card.type === CardType.ENEMY || card.type === CardType.TRAP || card.type === CardType.TREASURE)
  )
  const recipeNeed = hasTacticalRecipeBoard
    ? activeRecipes.find((recipe) => Object.keys(recipe.ingredients).some((id) => canUse(id as HandCardId, unlocked) && !hasHand(character, [id as HandCardId])))
    : undefined
  const tripleNeed = character.hand.find((held, _index, hand) => !held.merged && canUse(held.defId, unlocked) && hand.filter((c) => c.defId === held.defId && !c.merged).length === 2)

  let recommendedCardId: HandCardId | null = null
  let recommendationReason = ''
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
    recommendedCardId = tripleNeed.defId
    recommendationReason = '같은 손패 2장이 있어 3장 연속 트리플 완성 지원 가치가 있음'
  } else if (recipeNeed) {
    const ingredient = Object.keys(recipeNeed.ingredients).find((id) => canUse(id as HandCardId, unlocked) && !hasHand(character, [id as HandCardId])) as HandCardId | undefined
    recommendedCardId = ingredient ?? null
    recommendationReason = recipeNeed ? `${recipeNeed.name} 레시피 발동 재료를 보충하면 필드 이득을 볼 수 있음` : ''
  }

  return { webCount, potentialWebDamage, webLethal, recommendCleanup: recommendSweep || recommendChitin, recommendedCardId, recommendationReason, hasImminentWebDrop }
}
