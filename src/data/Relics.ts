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
}

/** Central relic table. Add future shop inventory here first. */
export const RELIC_DEFINITIONS: Record<RelicId, RelicDefinition> = {
  'golden-squirrel': {
    id: 'golden-squirrel',
    name: '황금 다람쥐',
    rarity: 'rare',
    effect: '5턴마다 1$ 획득',
    flavor: '작은 발톱으로 동전을 꼭 쥔 잡화점의 행운 부적.',
    basePrice: 540,
  },
  'wax-crow': {
    id: 'wax-crow',
    name: '밀랍 까마귀',
    rarity: 'epic',
    effect: '보물상자 획득 시 방패 1 획득',
    flavor: '밀랍 깃털이 상자 뚜껑 소리에 맞춰 바스락거린다.',
    basePrice: 720,
  },
  'carving-knife': {
    id: 'carving-knife',
    name: '조각칼',
    rarity: 'common',
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
    rarity: 'rare',
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
}

export const RELIC_IDS = Object.keys(RELIC_DEFINITIONS) as RelicId[]

/** Read a relic definition with a precise id type. */
export function getRelicDef(id: RelicId): RelicDefinition {
  return RELIC_DEFINITIONS[id]
}
