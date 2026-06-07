// 강화팩(upgrade-pack) 항목 테이블. 레벨 디자인 전용 파일 — 여기서만 수정한다.
//
// 추가 양식 (한 줄 복사 후 수정):
// { id: 'triple-{cardId}' | 'recipe-{recipeId}', theme: 'upgrade', title: '이름', effect: '효과 텍스트', rarity: 'common'|'rare'|'epic'|'unique'|'legendary', weight: 숫자 }
//
// id 규칙 — 효과/등장 조건/일러스트가 모두 id 접두사로 연결된다:
//   triple-{cardId}    → 해당 손패 카드가 해금된 런에서만 등장. 트리플 발동 효과를 +1 한다.
//   recipe-{recipeId}  → 레시피 재료가 모두 해금된 런에서만 등장. 레시피 효과를 +1 한다.
// 등장 필터는 systems/UpgradePackPool.ts, 실제 적용은 index.ts rollPackItems가 담당한다.
// weight → 높을수록 팩 오픈 시 등장 확률↑.
// 일러스트는 새 스프라이트를 만들지 않고 기존 손패 아트를 재사용한다(spriteForUpgradePackItem):
//   triple → 그 카드 아트, recipe → 레시피 첫 재료 카드 아트.

import type { CardRarity } from '@data/ShopPools'

export interface UpgradePackItem {
  id: string
  theme: 'upgrade'
  title: string
  effect: string
  rarity: CardRarity
  weight: number
}

export const UPGRADE_PACK_POOL: UpgradePackItem[] = [
  // Common — 트리플 발동 효과 +1, weight 20
  { id: 'triple-wax-drop', theme: 'upgrade', title: '촛농 트리플', effect: '촛농 트리플 발동 시 체력 +1 추가',  rarity: 'common',    weight: 20 },
  { id: 'triple-candle',   theme: 'upgrade', title: '양초 트리플', effect: '양초 트리플 발동 시 방패 +1 추가',  rarity: 'common',    weight: 20 },
  { id: 'triple-ember',    theme: 'upgrade', title: '불씨 트리플', effect: '불씨 트리플 발동 시 피해 +1 추가',  rarity: 'common',    weight: 20 },
  { id: 'triple-match',    theme: 'upgrade', title: '성냥 트리플', effect: '성냥 트리플 발동 시 불씨 +1 추가',  rarity: 'common',    weight: 20 },
  // Legendary — 희귀 트리플 발동 효과 +1, weight 1
  { id: 'triple-coin',     theme: 'upgrade', title: '동전 트리플', effect: '동전 트리플 발동 시 화폐 +1 추가',  rarity: 'legendary', weight: 1  },
  { id: 'triple-card',     theme: 'upgrade', title: '카드 트리플', effect: '카드 트리플 발동 시 콤보 게이지 +1 추가', rarity: 'legendary', weight: 1  },
  // Rare — 레시피 피해 +1, weight 10
  { id: 'recipe-ignite',       theme: 'upgrade', title: '점화 강화',   effect: '점화 레시피 피해 +1',   rarity: 'rare', weight: 10 },
  { id: 'recipe-hot',          theme: 'upgrade', title: '뜨거움 강화', effect: '뜨거움 레시피 피해 +1', rarity: 'rare', weight: 10 },
  { id: 'recipe-fuse',         theme: 'upgrade', title: '도화선 강화', effect: '도화선 레시피 피해 +1', rarity: 'rare', weight: 10 },
  // Epic — 레시피 변환/획득 +1, weight 5
  { id: 'recipe-greed',        theme: 'upgrade', title: '탐욕 강화',     effect: '탐욕 레시피 변환 +1칸',     rarity: 'epic', weight: 5 },
  { id: 'recipe-locksmith',    theme: 'upgrade', title: '열쇠공 강화',   effect: '열쇠공 레시피 획득 +1개',   rarity: 'epic', weight: 5 },
  { id: 'recipe-mine-sweeper', theme: 'upgrade', title: '지뢰제거반 강화', effect: '지뢰제거반 레시피 변환 +1칸', rarity: 'epic', weight: 5 },
  // Legendary — 레시피 보상 +1, weight 1
  { id: 'recipe-shuffle',  theme: 'upgrade', title: '셔플 강화',   effect: '셔플 레시피 드로우 +1장', rarity: 'legendary', weight: 1 },
  { id: 'recipe-dividend', theme: 'upgrade', title: '배당금 강화', effect: '배당금 레시피 화폐 +1$',  rarity: 'legendary', weight: 1 },
  // 해금팩 전용 레시피 강화 — 해금 후 런 내 강화팩에 등장
  { id: 'recipe-backfire',     theme: 'upgrade', title: '역화 강화',       effect: '역화 레시피 피해 +1',       rarity: 'rare',      weight: 10 },
  { id: 'recipe-rage',         theme: 'upgrade', title: '분노 강화',       effect: '분노 레시피 피해 +1',       rarity: 'rare',      weight: 10 },
  { id: 'recipe-mythic-flame', theme: 'upgrade', title: '신화의 불꽃 강화', effect: '신화의 불꽃 레시피 피해 +1', rarity: 'legendary', weight: 1  },
]
