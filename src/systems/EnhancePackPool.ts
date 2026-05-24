/**
 * EnhancePackPool - 강화팩(단일 사용 효과 +1) 동적 풀 빌더.
 *
 * 수치형 단일 효과를 가진 해금된 카드만 포함.
 * key/wax/holy-water/chitin은 수치 보너스를 적용하기 어려우므로 제외.
 */

import type { HandCardId } from '@entities/HandCard'
import type { CardRarity } from '@data/ShopPools'
import { HAND_CARD_RARITY } from '@data/ShopPools'
import { getHandCardDef } from '@data/HandCards'

export interface EnhancePackEntry {
  id: string
  theme: 'upgrade'
  title: string
  effect: string
  rarity: CardRarity
  targetCardId: HandCardId
}

// 수치 보너스가 의미 있는 카드만 포함.
// coin(동전)은 화폐 가치 설계상 제외. key/wax/holy-water/chitin은 비수치 효과라 제외.
const ENHANCEABLE_CARDS: HandCardId[] = [
  'wax-drop', 'candle', 'ember', 'match', 'card',
]

/**
 * 현재 해금된 카드 중 강화 가능한 항목만 반환한다.
 * 강화팩은 단일 사용 효과(+1)를 올린다 — 트리플 강화팩과 별개.
 */
export function buildUnlockedEnhancePool(
  unlockedIds: readonly HandCardId[]
): EnhancePackEntry[] {
  const unlocked = new Set<string>(unlockedIds)
  return ENHANCEABLE_CARDS
    .filter((id) => unlocked.has(id))
    .map((id) => {
      const def = getHandCardDef(id)
      return {
        id: `single-${id}`,
        theme: 'upgrade' as const,
        title: `${def.name} 강화`,
        effect: `${def.name} 사용 효과 +1`,
        rarity: HAND_CARD_RARITY[id],
        targetCardId: id,
      }
    })
}
