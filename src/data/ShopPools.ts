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
    { id: 'atk-1', theme: 'upgrade', title: '벼린 칼날', effect: '공격력 +1', rarity: 'rare' },
    { id: 'maxhp-3', theme: 'upgrade', title: '굳어진 심지', effect: '최대 체력 +3', rarity: 'rare' },
    { id: 'maxhp-5', theme: 'upgrade', title: '굳어진 심지(대)', effect: '최대 체력 +5', rarity: 'epic' },
    { id: 'shield-1', theme: 'upgrade', title: '밀랍 방패', effect: '방패 +1', rarity: 'rare' },
    { id: 'shield-2', theme: 'upgrade', title: '밀랍 방패(대)', effect: '방패 +2', rarity: 'epic' },
    { id: 'ember-5', theme: 'upgrade', title: '불씨 보양', effect: '불씨 +5', rarity: 'epic' },
    { id: 'gauge-3', theme: 'upgrade', title: '심지 충전(대)', effect: '게이지 +3', rarity: 'legendary' },
  ],
  'unlock-pack': [],
  'blessing-pack': [],
  'resource-pack': [],
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
