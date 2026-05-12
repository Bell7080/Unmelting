/**
 * Recipes - Chain-combo recipes for the current hand-card set.
 *
 * Recipes are intentionally supplemental: they preserve the existing combo
 * system while the primary card effects follow the latest item design sheet.
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
  flavor: string
): Recipe {
  return { id, name, ingredients, totalCount: totalCount(ingredients), effect, flavor }
}

export const RECIPES: Recipe[] = [
  recipe(
    'wax-rush',
    '밀랍 돌진',
    { 'wax-drop': 1, candle: 1 },
    'destroy-front-enemy',
    '전방 적 1체를 즉시 처치'
  ),
  recipe(
    'wax-strike',
    '밀랍 타격',
    { 'wax-drop': 1, candle: 1, ember: 1 },
    'damage-all-front',
    '전방 모든 적에게 5 피해'
  ),
  recipe(
    'fuse-line',
    '도화선',
    { match: 1, ember: 1 },
    'lane-burn-zero-one',
    '무작위 라인 가까운 두 칸을 점화'
  ),
  recipe('hard-freeze', '백색 굳음', { wax: 2 }, 'freeze-all', '전방 위협의 움직임이 잠시 멎는다'),
  recipe(
    'purifying-burst',
    '정화 폭발',
    { 'holy-water': 1, match: 1 },
    'cleanse-and-restore',
    '필드 정화와 함께 양초 +5'
  ),
  recipe(
    'master-key',
    '대장의 열쇠',
    { key: 1, 'wax-drop': 1 },
    'open-all-treasures',
    '모든 보물상자를 한 번에 연다'
  ),
  recipe(
    'pyrotechnic',
    '연쇄 점화',
    { match: 2, ember: 1 },
    'multi-burn',
    '여러 카드가 줄지어 발화'
  ),
  recipe(
    'overflow-melt',
    '소녀의 녹임',
    { 'wax-drop': 1, candle: 1, ember: 1, wax: 1, 'holy-water': 1 },
    'overflow-melt',
    '소녀의 모든 양초가 동시에 녹아 세계를 다시 빚는다'
  ),
]

/** Lookup helper for the renderer/log. */
export function getRecipeById(id: string): Recipe | undefined {
  return RECIPES.find((r) => r.id === id)
}
