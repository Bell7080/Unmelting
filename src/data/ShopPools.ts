import type { HandCardId } from '@entities/HandCard'
import type { ShopPackKind } from '@ui/GameBoardRenderer'

/** Shared rarity palette across relic/shop/free-pack visuals. */
export type CardRarity = 'common' | 'rare' | 'epic' | 'unique' | 'legendary'

/** Pack picker option payload that index.ts can execute directly. */
export interface ShopPackPoolItem {
  id: string
  theme: 'resource' | 'upgrade' | 'unlock'
  title: string
  effect: string
  rarity: CardRarity
  apply: () => void | Promise<void>
}

/** Rarity glow colors are CSS-driven via this stable class mapping. */
export const RARITY_CLASS_BY_TIER: Record<CardRarity, string> = {
  common: 'rarity-common',
  rare: 'rarity-rare',
  epic: 'rarity-epic',
  unique: 'rarity-unique',
  legendary: 'rarity-legendary',
}

/** Unlock-pack rarity lookup for hand cards shown in picker cards. */
export const HAND_CARD_RARITY: Record<HandCardId, CardRarity> = {
  'wax-drop': 'common', candle: 'common', ember: 'rare', key: 'rare', wax: 'epic',
  match: 'common', 'holy-water': 'epic', chitin: 'rare', card: 'legendary', coin: 'common',
}

/** Shop pack pool config moved to data so shop/free/pack roll tables are data-driven. */
export const SHOP_PACK_POOLS: Record<ShopPackKind, Omit<ShopPackPoolItem, 'apply'>[]> = {
  'basic-pack': [
    // Common
    { id: 'heal-3',   theme: 'resource', title: '체력 회복',       effect: '체력 +3',   rarity: 'common' },
    { id: 'ember-1',  theme: 'resource', title: '불씨 한 점',      effect: '불씨 +1',   rarity: 'common' },
    { id: 'gauge-1',  theme: 'resource', title: '심지 한 마디',    effect: '게이지 +1', rarity: 'common' },
    // Rare
    { id: 'heal-5',   theme: 'resource', title: '체력 회복(대)',    effect: '체력 +5',   rarity: 'rare' },
    { id: 'ember-3',  theme: 'resource', title: '불씨 회복',       effect: '불씨 +3',   rarity: 'rare' },
    { id: 'gauge-3',  theme: 'resource', title: '콤보 충전',       effect: '게이지 +3', rarity: 'rare' },
    // Epic
    { id: 'coin-1p',  theme: 'resource', title: '화폐 한 닢',      effect: '화폐 +1',   rarity: 'epic' },
    { id: 'heal-10',  theme: 'resource', title: '체력 회복(극대)', effect: '체력 +10',  rarity: 'epic' },
    { id: 'ember-10', theme: 'resource', title: '불씨 폭발',       effect: '불씨 +10',  rarity: 'epic' },
    { id: 'gauge-5',  theme: 'resource', title: '심지 대충전',     effect: '게이지 +5', rarity: 'epic' },
    { id: 'shield-3', theme: 'resource', title: '밀랍 방패(대)',    effect: '방패 +3',   rarity: 'epic' },
  ],
  'upgrade-pack': [
    // Common — 손패 트리플 효과 +1
    { id: 'triple-wax-drop', theme: 'upgrade', title: '촛농의 여운',   effect: '촛농 트리플 체력 +1',   rarity: 'common' },
    { id: 'triple-candle',   theme: 'upgrade', title: '양초의 온기',   effect: '양초 트리플 방패 +1',   rarity: 'common' },
    { id: 'triple-ember',    theme: 'upgrade', title: '불씨의 격렬함', effect: '불씨 트리플 피해 +1',   rarity: 'common' },
    { id: 'triple-match',    theme: 'upgrade', title: '성냥의 기세',   effect: '성냥 트리플 불씨 +1',   rarity: 'common' },
    { id: 'triple-coin',     theme: 'upgrade', title: '동전의 중력',   effect: '동전 트리플 화폐 +1',   rarity: 'common' },
    { id: 'triple-card',     theme: 'upgrade', title: '카드의 울림',   effect: '카드 트리플 게이지 +1', rarity: 'common' },
    // Rare — 레시피 피해 +1
    { id: 'recipe-ignite',       theme: 'upgrade', title: '점화 강화',   effect: '점화 피해 +1',   rarity: 'rare' },
    { id: 'recipe-hot',          theme: 'upgrade', title: '뜨거움 강화', effect: '뜨거움 피해 +1', rarity: 'rare' },
    { id: 'recipe-fuse',         theme: 'upgrade', title: '도화선 강화', effect: '도화선 피해 +1', rarity: 'rare' },
    // Epic — 레시피 범위/횟수 +1
    { id: 'recipe-greed',        theme: 'upgrade', title: '탐욕 강화',     effect: '탐욕 변환 +1칸',   rarity: 'epic' },
    { id: 'recipe-locksmith',    theme: 'upgrade', title: '열쇠공 강화',   effect: '열쇠공 획득 +1개', rarity: 'epic' },
    { id: 'recipe-mine-sweeper', theme: 'upgrade', title: '지뢰제거반 강화', effect: '지뢰제거 +1칸', rarity: 'epic' },
    // Legendary — 레시피 보상 +1
    { id: 'recipe-shuffle',   theme: 'upgrade', title: '셔플 강화',   effect: '셔플 드로우 +1장', rarity: 'legendary' },
    { id: 'recipe-dividend',  theme: 'upgrade', title: '배당금 강화', effect: '배당금 +1$',       rarity: 'legendary' },
  ],
  'unlock-pack': [],
  'blessing-pack': [],
  'resource-pack': [
    // 제단 전용 — 최대 수치/영구 보정 팩. 3종 랜덤 선택.
    { id: 'res-atk-1',        theme: 'upgrade', title: '칼날 벼리기',     effect: '공격력 +1',              rarity: 'rare' },
    { id: 'res-handmax-2',    theme: 'upgrade', title: '넉넉한 손',        effect: '최대 손패 +2',           rarity: 'rare' },
    { id: 'res-maxhp-5',      theme: 'upgrade', title: '심지 연장',        effect: '최대 체력 +5',           rarity: 'rare' },
    { id: 'res-embermax-2',   theme: 'upgrade', title: '불씨 그릇',        effect: '최대 불씨 게이지 +2',    rarity: 'rare' },
    { id: 'res-candlemax-m1', theme: 'upgrade', title: '빠른 손',          effect: '손패 콤보 게이지 -1',    rarity: 'epic' },
    { id: 'res-scoremult-15', theme: 'upgrade', title: '촛불의 축복',      effect: '불빛 획득량 +15%',       rarity: 'epic' },
  ],
  'enhance-pack': [],
  'delete-pack': [],
}

/** Shop pack UI copy source of truth.
 *  Keep names/effects centralized so shop tiles and pack picker titles never drift. */
export const SHOP_PACK_LABELS: Record<ShopPackKind, { title: string; effect: string }> = {
  'basic-pack': { title: '자원팩', effect: '자원 보충' },
  'upgrade-pack': { title: '강화팩', effect: '카드 강화' },
  'unlock-pack': { title: '해금팩', effect: '카드 해금' },
  'blessing-pack': { title: '축복팩', effect: '패시브 능력 획득' },
  'resource-pack': { title: '자원팩', effect: '최대 수치 증가' },
  'enhance-pack': { title: '강화팩', effect: '카드 단일 강화' },
  'delete-pack': { title: '삭제팩', effect: '등장 카드 삭제' },
}
