/**
 * Relic catalog: static definitions + shop pricing.
 *
 * costOptions(화폐 기반)는 제거됨 — 상점 구매는 불빛(score)으로 통일.
 * basePrice는 priceForRelic()의 비대칭 지터(-76~+104) 기준값이며 등급과 효과 체감에 비례해 설정.
 */

import type { CardRarity } from '@data/ShopPools'

/** Stable id used for save/run state and shop offer generation. */
export type RelicId =
  | 'red-potion'
  | 'golden-squirrel'
  | 'wax-crow'
  | 'carving-knife'
  | 'lifeline'
  | 'blood-pack'
  | 'hope'
  | 'ink-quill'
  | 'first-candle'
  | 'graceful-response'

/** Immutable relic rules used by gameplay and presentation. */
export interface RelicDefinition {
  id: RelicId
  name: string
  rarity: CardRarity
  effect: string
  flavor: string
  /** Base score(불빛) cost. priceForRelic()이 -76~+104 비대칭 지터로 실제 가격을 산출한다. */
  basePrice: number
  /** Prevents this relic from appearing again after its one-shot removal. */
  banWhenRemoved?: boolean
  /** 상점 등장 가중치 개별 지정값. 없으면 등급 기본값(RELIC_BASE_DRAW_WEIGHTS)을 쓴다.
   *  같은 등급이라도 유물마다 다른 등장 빈도를 주고 싶을 때 사용한다. */
  weight?: number
}

/** 유물 상점 등장 가중치의 등급별 기본값. 개별 유물의 weight가 우선한다.
 *  (팩 추첨이 쓰는 공통 RARITY_DRAW_WEIGHTS와 분리해 유물에만 적용한다.) */
export const RELIC_BASE_DRAW_WEIGHTS: Record<CardRarity, number> = {
  common: 10,
  rare: 5,
  epic: 2,
  unique: 1,
  legendary: 1,
}

/** Central relic table. Add future shop inventory here first. */
export const RELIC_DEFINITIONS: Record<RelicId, RelicDefinition> = {
  // id는 세이브/핸들러 키라 유지하고 표시 이름·효과·설명만 별빛 랜턴으로 교체한다.
  'golden-squirrel': {
    id: 'golden-squirrel',
    name: '별빛 랜턴',
    rarity: 'rare',
    // '불빛'은 GameBoardRenderer.relicEffectHtml가 본문에서 다이아(✦) 아이콘으로 치환한다.
    effect: '5턴마다 불빛 500 획득',
    flavor: '별빛을 모아 둔 등불, 다섯 걸음마다 한 줌의 빛을 흘려보낸다.',
    basePrice: 600,
  },
  // id는 유지하고 표시 이름·설명만 귀족의 품격으로 교체한다(효과 동일).
  'wax-crow': {
    id: 'wax-crow',
    name: '귀족의 품격',
    rarity: 'epic',
    effect: '보물상자 획득 시 방패 1 획득',
    flavor: '전리품마저 품위 있게 두르는 옛 귀족의 몸가짐.',
    basePrice: 720,
  },
  'carving-knife': {
    id: 'carving-knife',
    name: '조각칼',
    rarity: 'rare',
    effect: '공격력 1 증가',
    flavor: '어둠을 얇게 깎아낼 수 있을 것 같은 작은 칼.',
    basePrice: 800,
  },
  'red-potion': {
    id: 'red-potion',
    name: '붉은 포션',
    rarity: 'common',
    effect: '적 처치 시 체력 1 회복',
    flavor: '촛농처럼 진한 붉은 빛이 병 안에서 천천히 돈다.',
    basePrice: 870,
  },
  lifeline: {
    id: 'lifeline',
    name: '생명선',
    rarity: 'common',
    effect: '최대 체력 5 증가',
    flavor: '끊어질 듯 이어지는 따뜻한 실 한 가닥.',
    basePrice: 880,
  },
  'blood-pack': {
    id: 'blood-pack',
    name: '헌혈팩',
    rarity: 'epic',
    effect: '최대 체력 획득 또는 체력 회복 시 전방 랜덤 적 1장에게 피해 1',
    flavor: '누군가의 온기가 아직 식지 않은 붉은 주머니.',
    basePrice: 1020,
  },
  hope: {
    id: 'hope',
    name: '희망',
    rarity: 'unique',
    effect: '사망 시 체력 10으로 부활하고 필드 모든 카드를 제거. 발동 후 다시 등장하지 않음.',
    flavor: '꺼진 심지 끝에 남은 아주 작은 불빛.',
    basePrice: 1240,
    banWhenRemoved: true,
  },
  'ink-quill': {
    id: 'ink-quill',
    name: '잉크와 깃펜',
    rarity: 'epic',
    effect: '적을 5번 잡을 때마다 손패 콤보 게이지 +1',
    flavor: '쓰러뜨린 수를 적어 내려갈수록 손끝의 합이 무르익는다.',
    basePrice: 940,
  },
  'first-candle': {
    id: 'first-candle',
    name: '첫 양초',
    rarity: 'legendary',
    effect: '최대 체력 +5, 공격력 +1, 최대 불씨 게이지 +2, 최대 손패 +2, 최대 손패 콤보 게이지 -1',
    flavor: '가장 먼저 밝힌 초 한 자루가 모든 시작을 든든히 데운다.',
    basePrice: 1500,
  },
  'graceful-response': {
    id: 'graceful-response',
    name: '품격있는 대처',
    rarity: 'epic',
    effect: '피해를 입힌 적 1장에게 피해 1',
    flavor: '흐트러짐 없는 한 수가 상처 입은 적을 마저 갈무리한다.',
    basePrice: 1000,
  },
}

export const RELIC_IDS = Object.keys(RELIC_DEFINITIONS) as RelicId[]

/** Read a relic definition with a precise id type. */
export function getRelicDef(id: RelicId): RelicDefinition {
  return RELIC_DEFINITIONS[id]
}

/** 상점 등장 가중치. 유물별 weight 지정이 있으면 우선, 없으면 등급 기본값을 쓴다. */
export function relicDrawWeight(id: RelicId): number {
  const def = RELIC_DEFINITIONS[id]
  return def.weight ?? RELIC_BASE_DRAW_WEIGHTS[def.rarity] ?? 1
}
