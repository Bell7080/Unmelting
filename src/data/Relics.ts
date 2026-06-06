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
  | 'ambition'
  | 'anomaly'
  | 'blind-faith'
  | 'honesty'
  | 'hegemony'
  | 'authority'
  | 'hourglass'
  | 'great-negotiation'
  | 'premium-firewood'
  | 'pickaxe'
  | 'axe'
  | 'annabella-ring'
  | 'annabella-pendant'
  | 'precious-head'
  | 'chance'
  | 'opening-ceremony'
  | 'padlock'
  | 'charred-paper'
  | 'water-bucket'
  | 'golden-key'

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
  /** 스폰 가중치를 바꾸는 유물 전용. effect 텍스트 안의 {{spawn}} 토큰을
   *  렌더러가 현 시점 실제 확률 변화량(%)으로 치환할 때 사용한다. */
  spawnEffect?: { type: 'enemy' | 'treasure'; delta: number }
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
    effect: '5턴마다 불빛 150 획득',
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
    rarity: 'epic',
    effect: '공격력 1 증가',
    flavor: '어둠을 얇게 깎아낼 수 있을 것 같은 작은 칼.',
    basePrice: 1100,
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
    effect: '나에게 피해를 입힌 적에게 피해 1',
    flavor: '받은 만큼 품위 있게 되돌려 주는 단정한 응수.',
    basePrice: 1000,
  },
  // --- 체스 테마 유물(011~016) ---
  ambition: {
    id: 'ambition',
    name: '야망',
    rarity: 'common',
    // '불빛'은 relicEffectHtml가 다이아(✦) 글리프로 치환한다. 획득량은 발동마다 +25 누적.
    effect: '적 10회 처치마다 불빛 25 획득(발동마다 +25 누적)',
    flavor: '한 칸씩 전진할 때마다 더 멀리 내다보는 야심.',
    basePrice: 620,
  },
  anomaly: {
    id: 'anomaly',
    name: '변칙',
    rarity: 'rare',
    effect: '체력을 10 잃을 때마다 불씨 게이지 1 획득',
    flavor: '정석을 벗어난 한 수가 판을 뒤집는다.',
    basePrice: 720,
  },
  'blind-faith': {
    id: 'blind-faith',
    name: '맹신',
    rarity: 'rare',
    effect: '1$ 획득 시마다 불빛 50 획득',
    flavor: '의심 없는 믿음이 곳간을 빛으로 채운다.',
    basePrice: 760,
  },
  honesty: {
    id: 'honesty',
    name: '정직',
    rarity: 'epic',
    effect: '손패 5장 사용마다 불빛 50 획득',
    flavor: '꾸밈없는 수순이 결국 가장 큰 보상을 부른다.',
    basePrice: 960,
  },
  hegemony: {
    id: 'hegemony',
    name: '패도',
    rarity: 'legendary',
    effect: '구매 즉시 최대 체력 -15, 공격력 +2 (최대 체력 16 이상에서만 구매)',
    flavor: '제 살을 깎아 칼끝을 세우는 패자의 길.',
    basePrice: 1400,
  },
  authority: {
    id: 'authority',
    name: '권위',
    rarity: 'unique',
    effect: '치명적인 피해를 단 한 번 체력 1로 버틴다. 발동 후 다시 등장하지 않음.',
    flavor: '누구도 거역 못 할 한 번의 명령, 너는 아직 쓰러지지 않는다.',
    basePrice: 1300,
    banWhenRemoved: true,
  },
  // --- 추가 유물(017~029) ---
  hourglass: {
    id: 'hourglass',
    name: '모래시계',
    rarity: 'epic',
    effect: '불씨 게이지 소모 주기 +1턴 (3턴마다 → 4턴마다)',
    flavor: '모래가 더 천천히 흘러내린다. 불빛이 조금 더 버틸 수 있을 것 같다.',
    basePrice: 1100,
  },
  'great-negotiation': {
    id: 'great-negotiation',
    name: '훌륭한 대화수단',
    rarity: 'legendary',
    effect: '공격력 +2. 단, 적을 공격할 때마다 2.5% 확률로 파괴되며 공격력도 원상복귀.',
    flavor: '날이 서있는 동안만 통하는 설득이다.',
    basePrice: 1600,
    banWhenRemoved: true,
  },
  'premium-firewood': {
    id: 'premium-firewood',
    name: '고품격 뗄감',
    rarity: 'rare',
    effect: '불씨 게이지가 완전히 소모되면 즉시 가득 채움. 이후 파괴.',
    flavor: '한 번은 살릴 수 있다. 한 번만.',
    basePrice: 800,
    banWhenRemoved: true,
  },
  pickaxe: {
    id: 'pickaxe',
    name: '곡괭이',
    rarity: 'common',
    effect: '보물 상자 등장 확률 {{spawn}}',
    flavor: '암반을 깨면 반드시 무언가 나온다.',
    basePrice: 500,
    spawnEffect: { type: 'treasure', delta: 5 },
  },
  axe: {
    id: 'axe',
    name: '도끼',
    rarity: 'common',
    effect: '불빛 획득량 +10%',
    flavor: '잘 벤 장작은 더 오래, 더 밝게 탄다.',
    basePrice: 520,
  },
  'annabella-ring': {
    id: 'annabella-ring',
    name: '에나벨라의 반지',
    rarity: 'unique',
    effect: '매 턴 최하단 손패 한 장을 최상단으로 끌어올림',
    flavor: '에나벨라는 언제나 가장 낡은 것을 앞에 두었다.',
    basePrice: 1400,
  },
  'annabella-pendant': {
    id: 'annabella-pendant',
    name: '에나벨라의 펜던트',
    rarity: 'epic',
    effect: '공격력 +2. 앞으로 등장하는 적 체력 +3 (보스 미적용). 적 등장 확률 {{spawn}}.',
    flavor: '강해질수록 맞서는 것도 강해진다.',
    basePrice: 1200,
    spawnEffect: { type: 'enemy', delta: 5 },
  },
  'precious-head': {
    id: 'precious-head',
    name: '소중한 머리',
    rarity: 'epic',
    effect: '체력이 최대치의 절반 이하로 감소하면 체력을 전부 회복. 이후 파괴.',
    flavor: '머리가 붙어있는 한 다시 일어설 수 있다.',
    basePrice: 1000,
    banWhenRemoved: true,
  },
  chance: {
    id: 'chance',
    name: '찬스',
    rarity: 'common',
    effect: '적을 직접 타격할 때 10% 확률로 한 번 더 타격',
    flavor: '기회는 준비된 자에게 두 번 온다.',
    basePrice: 580,
  },
  'opening-ceremony': {
    id: 'opening-ceremony',
    name: '개봉식',
    rarity: 'common',
    effect: '보물 상자가 사라질 확률 5% 감소',
    flavor: '뚜껑을 열기 전까지는 사라지지 않는다.',
    basePrice: 450,
  },
  padlock: {
    id: 'padlock',
    name: '자물쇠',
    rarity: 'epic',
    effect: '보물 상자 등장 확률 {{spawn}}. 미믹이 주는 불빛 +25%, 손패 +1.',
    flavor: '잠긴 것은 더 값지다.',
    basePrice: 1050,
    spawnEffect: { type: 'treasure', delta: -5 },
  },
  'charred-paper': {
    id: 'charred-paper',
    name: '불 탄 종이',
    rarity: 'common',
    effect: '적 등장 확률 {{spawn}}',
    flavor: '읽힌 경고는 이미 늦다.',
    basePrice: 480,
    spawnEffect: { type: 'enemy', delta: -5 },
  },
  'water-bucket': {
    id: 'water-bucket',
    name: '물양동이',
    rarity: 'rare',
    effect: '직접 타격한 적의 체력 15% 확률로 1 추가 감소',
    flavor: '물이 닿은 자리는 더 잘 무너진다.',
    basePrice: 760,
  },
  'golden-key': {
    id: 'golden-key',
    name: '황금 열쇠',
    rarity: 'unique',
    // 황금 상자는 일반 상자보다 카드와 불빛을 2배 주는 희귀 보물칸.
    effect: '보물 스폰 중 10% 확률이 황금 상자로 대체됩니다.',
    flavor: '어떤 자물쇠도 이 열쇠를 거부하지 못한다.',
    basePrice: 1400,
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
