/**
 * UpgradePackPool - 강화팩 동적 풀 빌더.
 *
 * 강화팩 항목은 해금된 카드/조합식에만 유효하다.
 * 예: triple-card는 card가 runLocked 상태면 표시하지 않음.
 * 이 파일은 순수 함수만 포함하고 게임 상태에 직접 접근하지 않는다.
 */

import type { HandCardId } from '@entities/HandCard'
import type { ShopPackPoolItem } from '@data/ShopPools'
import { SHOP_PACK_POOLS } from '@data/ShopPools'
import { RECIPES } from '@data/Recipes'

export type UpgradePackEntry = Omit<ShopPackPoolItem, 'apply'>

/**
 * 현재 런에서 해금된 카드/조합식에 해당하는 강화팩 항목만 반환한다.
 * - triple-{id}: 해당 카드가 unlocked 상태일 때만 포함.
 * - recipe-{id}: 해당 조합식의 모든 재료가 unlocked 상태일 때만 포함.
 */
export function buildUnlockedUpgradePool(
  unlockedIds: readonly HandCardId[]
): UpgradePackEntry[] {
  const unlocked = new Set<string>(unlockedIds)
  const recipeById = new Map(RECIPES.map((r) => [r.id, r]))

  return SHOP_PACK_POOLS['upgrade-pack'].filter((entry) => {
    if (entry.id.startsWith('triple-')) {
      const cardId = entry.id.slice('triple-'.length)
      return unlocked.has(cardId)
    }
    if (entry.id.startsWith('recipe-')) {
      const recipeId = entry.id.slice('recipe-'.length)
      const recipe = recipeById.get(recipeId)
      if (!recipe) return false
      return Object.keys(recipe.ingredients).every((id) => unlocked.has(id))
    }
    return true
  })
}
