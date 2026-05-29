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
}

/** Shop pack pool config moved to data so shop/free/pack roll tables are data-driven. */
export const SHOP_PACK_POOLS: Record<ShopPackKind, Omit<ShopPackPoolItem, 'apply'>[]> = {
  'basic-pack': BASIC_PACK_POOL,
  // 강화팩 항목 테이블은 UpgradePackItems.ts에서 관리한다(트리플/레시피 강화, 항목별 weight).
  'upgrade-pack': UPGRADE_PACK_POOL,
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
