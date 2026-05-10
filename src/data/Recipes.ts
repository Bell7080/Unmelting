/**
 * Recipes - Chain-combo recipes.
 *
 * Each recipe is a multiset of HandCardId. When the recently played card
 * sequence (the active chain) contains every card in the recipe with at
 * least the listed counts, the recipe fires as an additional bonus effect
 * on top of each card's individual effect. Multiple recipes can fire as
 * the chain extends — short recipes fire first, longer ones fire as the
 * chain grows to include them.
 */

import { HandCardId } from '@entities/HandCard'

export type RecipeEffectKind =
  | 'destroy-front-enemy'
  | 'damage-all-front'
  | 'lane-burn-zero-one'
  | 'freeze-all'
  | 'cleanse-and-restore'
  | 'open-all-treasures'
  | 'multi-burn'
  | 'overflow-melt'

export interface Recipe {
  id: string
  /** Display name shown when the recipe fires. */
  name: string
  /** Cards required (multiset). The chain must contain at least these. */
  ingredients: Partial<Record<HandCardId, number>>
  /** Total count of cards in the ingredients multiset (cached). */
  totalCount: number
  effect: RecipeEffectKind
  /** Short Korean blurb shown in the activity log. */
  flavor: string
}

function totalCount(ing: Partial<Record<HandCardId, number>>): number {
  return Object.values(ing).reduce((sum: number, n) => sum + (n ?? 0), 0)
}

function recipe(
  id: string,
  name: string,
  ingredients: Partial<Record<HandCardId, number>>,
  effect: RecipeEffectKind,
  flavor: string,
): Recipe {
  return { id, name, ingredients, totalCount: totalCount(ingredients), effect, flavor }
}

export const RECIPES: Recipe[] = [
  recipe(
    'wax-rush',
    '밀랍 돌진',
    { 'small-candle': 1, 'wax-shield': 1 },
    'destroy-front-enemy',
    '돌진하여 가장 가까운 적 1체를 즉시 처치',
  ),
  recipe(
    'wax-strike',
    '밀랍 타격',
    { 'small-candle': 1, 'wax-shield': 1, 'large-candle': 1 },
    'damage-all-front',
    '활성 라인의 모든 적에게 5 피해',
  ),
  recipe(
    'fuse-line',
    '도화선',
    { matchstick: 1, 'match-bundle': 1 },
    'lane-burn-zero-one',
    '활성 라인 가까운 두 칸을 모두 점화',
  ),
  recipe(
    'frostbind',
    '결빙',
    { 'cooled-candle': 2 },
    'freeze-all',
    '모든 카드의 시간이 잠시 멎는다',
  ),
  recipe(
    'purifying-burst',
    '정화 폭발',
    { 'cleansing-ember': 1, matchstick: 1 },
    'cleanse-and-restore',
    '필드 정화와 함께 양초 +5',
  ),
  recipe(
    'master-key',
    '대장의 열쇠',
    { 'brass-key': 1, 'small-candle': 1 },
    'open-all-treasures',
    '모든 보물상자를 한 번에 연다',
  ),
  recipe(
    'pyrotechnic',
    '연쇄 점화',
    { matchstick: 2, 'match-bundle': 1 },
    'multi-burn',
    '여러 카드가 줄지어 발화',
  ),
  recipe(
    'overflow-melt',
    '소녀의 녹임',
    {
      'small-candle': 1,
      'wax-shield': 1,
      matchstick: 1,
      'cooled-candle': 1,
      'cleansing-ember': 1,
    },
    'overflow-melt',
    '소녀의 모든 양초가 동시에 녹아 세계를 다시 빚는다',
  ),
]

/** Lookup helper for the renderer/log. */
export function getRecipeById(id: string): Recipe | undefined {
  return RECIPES.find((r) => r.id === id)
}
