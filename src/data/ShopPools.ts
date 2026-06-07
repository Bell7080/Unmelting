import type { HandCardId } from '@entities/HandCard'
import type { ShopPackKind } from '@ui/GameBoardRenderer'
import { BASIC_PACK_POOL } from '@data/BasicPackPool'
import { UPGRADE_PACK_POOL } from '@data/UpgradePackItems'

/** Shared rarity palette across relic/shop/free-pack visuals. */
export type CardRarity = 'common' | 'rare' | 'epic' | 'unique' | 'legendary'

/** Pack picker option payload that index.ts can execute directly. */
export interface ShopPackPoolItem {
  id: string
  illu?: string     // 항목 전용 일러스트 파일명 (basic_001 등) — 없으면 팩 기본 이미지 폴백
  theme: 'resource' | 'upgrade' | 'unlock'
  title: string
  effect: string
  rarity: CardRarity
  weight?: number   // 직접 지정 가중치 — 없으면 RARITY_DRAW_WEIGHTS 사용
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
  // 탐욕의 동전은 보스 전용 찌꺼기 카드(상점/도감 풀에는 노출되지 않음).
  'greed-coin': 'common',
  'sacrifice-candle': 'rare', levatein: 'legendary', firework: 'rare', 'book-of-flames': 'epic',
  'fire-arrow': 'rare', 'shield-bash': 'rare', 'sacrifice-shield': 'rare',
  sweep: 'rare', 'hand-mirror': 'epic',
  chandelier: 'rare', bonfire: 'rare', teapot: 'epic', teacup: 'rare',
  'top-hat': 'rare', slash: 'rare', shackles: 'epic',
}

/** Shop pack pool config moved to data so shop/free/pack roll tables are data-driven. */
export const SHOP_PACK_POOLS: Record<ShopPackKind, Omit<ShopPackPoolItem, 'apply'>[]> = {
  'basic-pack': BASIC_PACK_POOL,
  // 강화팩 항목 테이블은 UpgradePackItems.ts에서 관리한다(트리플/레시피 강화, 항목별 weight).
  'upgrade-pack': UPGRADE_PACK_POOL,
  'unlock-pack': [],
  'blessing-pack': [],
  'resource-pack': [
    // 제단 전용 자원팩 — basic2_001~007을 순서대로 쓰고, 동전만 기존 basic_011을 재사용한다.
    { id: 'altar-clothes-thick',  illu: 'basic2_001', theme: 'resource', title: '두꺼운 의복', effect: '최대체력 +5',              rarity: 'common',    weight: 20 },
    { id: 'altar-heating',        illu: 'basic2_002', theme: 'resource', title: '가열',        effect: '공격력 +1',                rarity: 'legendary', weight: 1  },
    { id: 'altar-backpack-large', illu: 'basic2_003', theme: 'resource', title: '큰 배낭',     effect: '최대 손패 +2',             rarity: 'common',    weight: 20 },
    { id: 'altar-matchbox',       illu: 'basic2_004', theme: 'resource', title: '성냥갑',      effect: '불씨 한도 +2',            rarity: 'rare',      weight: 15 },
    { id: 'altar-wick-thick',     illu: 'basic2_005', theme: 'resource', title: '두꺼운 심지', effect: '불씨 소모 주기 +1턴',       rarity: 'epic',      weight: 3  },
    { id: 'altar-joker-card',     illu: 'basic2_006', theme: 'resource', title: '조커 카드',   effect: '콤보 한도 -1',             rarity: 'legendary', weight: 1  },
    { id: 'altar-lantern',        illu: 'basic2_007', theme: 'resource', title: '랜턴',        effect: '불빛 획득량 +10%',         rarity: 'rare',      weight: 10 },
    { id: 'altar-one-coin',       illu: 'basic_011',  theme: 'resource', title: '동전 한 닢',  effect: '1$',                       rarity: 'unique',    weight: 1  },
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
