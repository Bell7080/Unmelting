/**
 * Relic catalog: static definitions + shop pricing.
 *
 * costOptions(화폐 기반)는 제거됨 — 상점 구매는 불빛(score)으로 통일.
 * basePrice는 priceForRelic()의 비대칭 지터(-76~+104) 기준값이며 등급과 효과 체감에 비례해 설정.
 */

import type { CardRarity } from '@data/ShopPools'
import type { SynergyTag } from './Tags'
import type { RunEnhancements } from '@core/RunEnhancements'

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
  | 'chivalry'
  | 'sweet-temptation'
  | 'discount-coupon'
  | 'luxury'
  | 'sanitizer'
  | 'wax-harmony'
  | 'trap-master'
  | 'demon-doll'
  | 'last-supper'
  // 태그 반응형 유물(TagReactions 프레임워크로 효과 발동 — index.ts 하드코딩 불필요).
  | 'whetstone'
  | 'hammer'
  | 'sharpening'
  // 행동 수정자형 유물(자연 연계 시너지).
  | 'overflow-wax'
  | 'thorn-shield'
  | 'library'
  // 제물(sacrifice) 시너지 패밀리 — 자해를 자원으로 되돌리는 눈덩이 축.
  | 'blood-writ'
  | 'transfusion'
  | 'coagulation'
  | 'blood-sigil'
  // 불씨(flame)·양초(wax) 시너지 — 태그 반응형이라 미래 불씨/양초 손패도 자동 적용.
  | 'fuel'
  | 'wax-recycle'
  | 'hot-stone'
  | 'wax-fragment'
  | 'spread'
  // 칼날(blade) 단검 투척 밀도 — 파편 증식/연격.
  | 'hidden-shard'
  | 'trump-shot'
  // 칼날 파편 심화 — 관통/도탄/연격/광역.
  | 'pierce-shard'
  | 'ricochet'
  | 'throw-art'
  | 'blade-storm'
  | 'trap-collect'


/** Runtime-customized relic face/effect. Hearth dinner uses this so one real relic id can
 *  display the exact ingredients and stat lines the player assembled in the lobby. */
export interface CustomRelicProfile {
  name: string
  effect: string
  flavor: string
  /** 커스텀 일러스트 URL — 설정 시 기본 스프라이트를 대체한다(만찬 유물에서 메인 음식 아트 사용). */
  art?: string
  stats: Partial<{ maxHealth: number; emberMax: number; handMax: number; scorePct: number; damage: number; shopDiscount: number; startScore: number }>
}

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
   *  렌더러가 현 시점 실제 확률 변화량(%)으로 치환할 때 사용한다.
   *  'spore'/'flower'는 포자·꽃 스폰 가중치 보정에 사용한다. */
  spawnEffect?: { type: 'enemy' | 'treasure' | 'spore' | 'flower'; delta: number }
  /** 시너지 태그 — 손패 synergyTags와 겹치면 에나 판단/학습이 자동 가점하고,
   *  TagReactions 반응형 유물의 발동 조건(anyTag)이 된다. 값은 Tags.ts SYNERGY_TAGS 등록분만.
   *  (예: 'flame' 태그 유물이 데이터에 들어오면 화염 손패 평가가 코드 수정 없이 올라간다.) */
  synergyTags?: readonly SynergyTag[]
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

/**
 * 유물 effect 스타일 규칙
 * - 명사형 종결: 동사문·경어체 금지. 예) `증가` `획득` `제거` `반격` `파괴`
 * - 1인칭 금지: `나에게` 대신 서술어 없는 조건문
 * - 수치 표기: `+N` / 피해는 `피해 N` (조사 `에게` 생략)
 * - 다중 효과 구분: 한 문장은 `·`, 별도 조건절은 `. ` 마침표로 분리
 * - 발동·파괴 조건: `~시` 트리거 표기 (`~되면`/`~하면` 대신 명사형으로)
 * - `불빛` 텍스트는 relicEffectHtml이 ✦ 글리프로 자동 치환하므로 그대로 쓴다
 * - `{{spawn}}`은 렌더러가 실제 확률 변화량으로 치환한다
 * - effect 문자열이 도감·상점 그대로 표시됨 — flavor와 혼용 금지
 *
 * Shift 자세히보기 토큰 패턴:
 * - effect 문자열에 인라인 토큰으로 수식/맥락 지정 (shiftDetail 필드 없음)
 * - [dyn:기본|수식]: 기본 수치 표시 → Shift 시 수식으로 전환 (수식 부분만 desc-dyn으로 감쌈)
 *   예) '반격 [dyn:1|(공×0.3+1)]피해' → 기본: '반격 1피해' / Shift: '반격 (공×0.3+1)피해'
 * - [shift:텍스트]: Shift 시에만 보이는 부가 맥락 (surrounding text 유지)
 *   예) '불씨 소모 주기 +1턴[shift: (3→4)]' → Shift: '불씨 소모 주기 +1턴 (3→4)'
 * - {{spawn}} 유물은 relicEffectHtml이 spawnEffect 정보로 자동으로 [shift:(밝음: N→M%)] 추가
 * - 런타임 의존 수치(배율·스택)는 relicDynamicEffect()에서 effect 문자열 자체를 완성해 반환
 */
/** Central relic table. Add future shop inventory here first. */
export const RELIC_DEFINITIONS: Record<RelicId, RelicDefinition> = {
  // id는 세이브/핸들러 키라 유지하고 표시 이름·효과·설명만 별빛 랜턴으로 교체한다.
  'golden-squirrel': {
    id: 'golden-squirrel',
    name: '별빛 랜턴',
    rarity: 'rare',
    // '불빛'은 GameBoardRenderer.relicEffectHtml가 본문에서 다이아(✦) 아이콘으로 치환한다.
    effect: '5턴마다 불빛 200 획득',
    flavor: '별빛을 모아 둔 등불, 다섯 걸음마다 한 줌의 빛을 흘려보낸다.',
    basePrice: 700,
  },
  // id는 유지하고 표시 이름·설명만 귀족의 품격으로 교체한다(효과 동일).
  'wax-crow': {
    id: 'wax-crow',
    name: '귀족의 품격',
    rarity: 'epic',
    effect: '보물 획득 시 방패 1 획득',
    flavor: '전리품마저 품위 있게 두르는 옛 귀족의 몸가짐.',
    basePrice: 950,
  },
  'carving-knife': {
    id: 'carving-knife',
    name: '조각칼',
    rarity: 'epic',
    effect: '공격력 +1',
    flavor: '어둠을 얇게 깎아낼 수 있을 것 같은 작은 칼.',
    basePrice: 1100,
  },
  'red-potion': {
    id: 'red-potion',
    name: '붉은 포션',
    rarity: 'common',
    effect: '적 처치 시 체력 1 회복',
    flavor: '촛농처럼 진한 붉은 빛이 병 안에서 천천히 돈다.',
    basePrice: 650,
  },
  lifeline: {
    id: 'lifeline',
    name: '생명선',
    rarity: 'common',
    effect: '최대 체력 +5',
    flavor: '끊어질 듯 이어지는 따뜻한 실 한 가닥.',
    basePrice: 680,
  },
  'blood-pack': {
    id: 'blood-pack',
    name: '헌혈팩',
    rarity: 'epic',
    effect: '전방 랜덤 적 1장에게 체력 회복 수치만큼 피해',
    flavor: '누군가의 온기가 아직 식지 않은 붉은 주머니.',
    basePrice: 1020,
  },
  hope: {
    id: 'hope',
    name: '희망',
    rarity: 'unique',
    effect: '사망 시 체력 10 부활 · 필드 전체 제거. 이후 파괴.',
    flavor: '꺼진 심지 끝에 남은 아주 작은 불빛.',
    basePrice: 1500,
    banWhenRemoved: true,
  },
  'ink-quill': {
    id: 'ink-quill',
    name: '잉크와 깃펜',
    rarity: 'epic',
    effect: '적 5회 처치마다 콤보 게이지 +1',
    flavor: '쓰러뜨린 수를 적어 내려갈수록 손끝의 합이 무르익는다.',
    basePrice: 940,
  },
  'first-candle': {
    id: 'first-candle',
    name: '첫 양초',
    rarity: 'legendary',
    effect: '최대 체력 +5 · 공격력 +1 · 불씨 한도 +2 · 손패 한도 +2 · 콤보 한도 -1',
    flavor: '가장 먼저 밝힌 초 한 자루가 모든 시작을 든든히 데운다.',
    basePrice: 1500,
  },
  'graceful-response': {
    id: 'graceful-response',
    name: '품격있는 대처',
    rarity: 'epic',
    effect: '피해를 입힌 적에게 반격 1피해',
    flavor: '받은 만큼 품위 있게 되돌려 주는 단정한 응수.',
    basePrice: 1100,
  },
  // --- 체스 테마 유물(011~016) ---
  ambition: {
    id: 'ambition',
    name: '야망',
    rarity: 'common',
    // '불빛'은 relicEffectHtml가 다이아(✦) 글리프로 치환한다. 획득량은 발동마다 +25 누적.
    effect: '적 8회 처치마다 불빛 25 획득 (+25 누적)',
    flavor: '한 칸씩 전진할 때마다 더 멀리 내다보는 야심.',
    basePrice: 620,
  },
  anomaly: {
    id: 'anomaly',
    name: '변칙',
    rarity: 'rare',
    effect: '체력 5 손실마다 빛 게이지 +1',
    flavor: '정석을 벗어난 한 수가 판을 뒤집는다.',
    basePrice: 600,
  },
  'blind-faith': {
    id: 'blind-faith',
    name: '맹신',
    rarity: 'rare',
    effect: '$1 획득마다 불빛 50 획득',
    flavor: '의심 없는 믿음이 곳간을 빛으로 채운다.',
    basePrice: 760,
  },
  honesty: {
    id: 'honesty',
    name: '정직',
    rarity: 'epic',
    effect: '손패 5장 사용마다 불빛 100 획득',
    flavor: '꾸밈없는 수순이 결국 가장 큰 보상을 부른다.',
    basePrice: 960,
  },
  hegemony: {
    id: 'hegemony',
    name: '패도',
    rarity: 'legendary',
    effect: '구매 즉시 최대 체력 -10 · 공격력 +2 (체력 11+ 필요)',
    flavor: '제 살을 깎아 칼끝을 세우는 패자의 길.',
    basePrice: 1250,
  },
  authority: {
    id: 'authority',
    name: '권위',
    rarity: 'unique',
    effect: '치명적 피해 1회를 체력 1로 버팀. 이후 파괴.',
    flavor: '누구도 거역 못 할 한 번의 명령, 너는 아직 쓰러지지 않는다.',
    basePrice: 1300,
    banWhenRemoved: true,
  },
  // --- 추가 유물(017~029) ---
  hourglass: {
    id: 'hourglass',
    name: '모래시계',
    rarity: 'epic',
    effect: '불씨 소모 주기 +1턴',
    flavor: '모래가 더 천천히 흘러내린다. 불빛이 조금 더 버틸 수 있을 것 같다.',
    basePrice: 950,
  },
  'great-negotiation': {
    id: 'great-negotiation',
    name: '훌륭한 대화수단',
    rarity: 'legendary',
    effect: '공격력 +2. 적 공격마다 2.5% 확률로 파괴 · 공격력 원상복귀.',
    flavor: '날이 서있는 동안만 통하는 설득이다.',
    basePrice: 1600,
    banWhenRemoved: true,
  },
  'premium-firewood': {
    id: 'premium-firewood',
    name: '고품격 뗄감',
    rarity: 'rare',
    effect: '빛 게이지 완전 소모 시 즉시 가득 채움. 이후 파괴.',
    flavor: '한 번은 살릴 수 있다. 한 번만.',
    basePrice: 780,
    banWhenRemoved: true,
  },
  pickaxe: {
    id: 'pickaxe',
    name: '곡괭이',
    rarity: 'common',
    effect: '보물 상자 등장 확률 {{spawn}}',
    flavor: '암반을 깨면 반드시 무언가 나온다.',
    basePrice: 500,
    spawnEffect: { type: 'treasure', delta: 8 },
  },
  axe: {
    id: 'axe',
    name: '도끼',
    rarity: 'common',
    effect: '불빛 획득량 +10%',
    flavor: '잘 벤 장작은 더 오래, 더 밝게 탄다.',
    basePrice: 580,
  },
  'annabella-ring': {
    id: 'annabella-ring',
    name: '에나벨라의 반지',
    rarity: 'unique',
    effect: '7턴마다 최하단 손패 1장을 트리플로 승격',
    flavor: '에나벨라는 언제나 가장 낡은 것을 가장 벼려 두었다.',
    basePrice: 1000,
  },
  'annabella-pendant': {
    id: 'annabella-pendant',
    name: '에나벨라의 펜던트',
    rarity: 'epic',
    effect: '공격력 +2. 이후 등장 적 체력 +3 (보스 미적용). 적 등장 확률 {{spawn}}.',
    flavor: '강해질수록 맞서는 것도 강해진다.',
    basePrice: 1200,
    spawnEffect: { type: 'enemy', delta: 15 },
  },
  'precious-head': {
    id: 'precious-head',
    name: '소중한 머리',
    rarity: 'epic',
    effect: '체력 최대치 절반 이하 감소 시 전부 회복. 이후 파괴.',
    flavor: '머리가 붙어있는 한 다시 일어설 수 있다.',
    basePrice: 1100,
    banWhenRemoved: true,
  },
  chance: {
    id: 'chance',
    name: '찬스',
    rarity: 'common',
    effect: '직접 타격 15% 확률로 1회 추가 타격',
    flavor: '기회는 준비된 자에게 두 번 온다.',
    basePrice: 500,
  },
  'opening-ceremony': {
    id: 'opening-ceremony',
    name: '개봉식',
    rarity: 'common',
    effect: '보물 상자 생존 확률 +10%',
    flavor: '뚜껑을 열기 전까지는 사라지지 않는다.',
    basePrice: 450,
  },
  padlock: {
    id: 'padlock',
    name: '자물쇠',
    rarity: 'epic',
    effect: '보물 상자 등장 확률 {{spawn}}. 미믹 보상 불빛 +25% · 손패 +1.',
    flavor: '잠긴 것은 더 값지다.',
    basePrice: 1050,
    spawnEffect: { type: 'treasure', delta: -8 },
  },
  'charred-paper': {
    id: 'charred-paper',
    name: '불 탄 종이',
    rarity: 'common',
    effect: '적 등장 확률 {{spawn}}',
    flavor: '읽힌 경고는 이미 늦다.',
    basePrice: 480,
    spawnEffect: { type: 'enemy', delta: -8 },
  },
  'water-bucket': {
    id: 'water-bucket',
    name: '물양동이',
    rarity: 'rare',
    effect: '직접 타격한 적 25% 확률 추가 1피해',
    flavor: '물이 닿은 자리는 더 잘 무너진다.',
    basePrice: 760,
  },
  'golden-key': {
    id: 'golden-key',
    name: '황금 열쇠',
    rarity: 'unique',
    // 황금 상자는 일반 상자보다 카드와 불빛을 2배 주는 희귀 보물칸.
    effect: '보물 스폰 중 30% 확률로 황금 상자 대체',
    flavor: '어떤 자물쇠도 이 열쇠를 거부하지 못한다.',
    basePrice: 1000,
  },
  // --- 신규 유물(031~037) ---
  chivalry: {
    id: 'chivalry',
    name: '기사도',
    rarity: 'unique',
    effect: '4턴마다 기사 카드 획득',
    flavor: '기사도를 지키는 자만이 이 힘을 쓸 수 있다.',
    basePrice: 1000,
  },
  'sweet-temptation': {
    id: 'sweet-temptation',
    name: '달콤한 유혹',
    rarity: 'epic',
    effect: '함정 피해 +1 · 함정 처리 시 불빛 +30%',
    flavor: '유혹은 달콤하게 오지만 그 값은 언제나 무겁다.',
    basePrice: 1050,
  },
  'discount-coupon': {
    id: 'discount-coupon',
    name: '할인 쿠폰',
    rarity: 'common',
    effect: '상점 품목 5% 할인',
    flavor: '한 번 접힌 종이에는 묘한 가치가 있다.',
    basePrice: 480,
  },
  luxury: {
    id: 'luxury',
    name: '사치품',
    rarity: 'rare',
    effect: '불빛 2000 소비마다 공격력 +1 (최대 +3)',
    flavor: '사치는 힘을 낳는다 — 쓰는 자만이 얻는다.',
    basePrice: 750,
  },
  sanitizer: {
    id: 'sanitizer',
    name: '살균제',
    rarity: 'rare',
    effect: '포자 등장 확률 {{spawn}}',
    flavor: '퍼지기 전에 막아야 한다.',
    basePrice: 700,
    spawnEffect: { type: 'spore', delta: -2 },
  },
  'wax-harmony': {
    id: 'wax-harmony',
    name: '밀랍 조화',
    rarity: 'common',
    effect: '꽃 등장 확률 {{spawn}}',
    flavor: '밀랍과 꽃이 함께할 때 이 공간은 더 따뜻해진다.',
    basePrice: 450,
    spawnEffect: { type: 'flower', delta: 2 },
  },
  'trap-master': {
    id: 'trap-master',
    name: '함정의 대가',
    rarity: 'legendary',
    effect: '함정 무시 확률 30% 증가',
    flavor: '모든 덫을 꿰뚫는 발걸음.',
    basePrice: 1400,
  },
  // 거점 만찬에서 만들어지는 실제 유물 카드. 상점 추첨에는 섞지 않는다.
  'last-supper': {
    id: 'last-supper',
    name: '최후의 만찬',
    rarity: 'unique',
    effect: '선택한 음식 재료 3종의 스탯 적용',
    flavor: '만찬 탭에서 직접 조합한 한 접시. 카드 이름·효과·설명은 선택 재료로 결정된다.',
    basePrice: 0,
    weight: 0,
  },
  // 악마 이벤트 보스 전용 보상 유물. 자해 20마다 불빛 배율 +10%, 공격력 +1.
  'demon-doll': {
    id: 'demon-doll',
    name: '악마 인형',
    rarity: 'legendary',
    effect: '자해 20마다 불빛 +10% · 공격력 +1',
    flavor: '인형 안에는 뭔가 남아 있다 — 고통마다 조금씩 강해진다.',
    basePrice: 0,   // 상점 미등장 — 이벤트 보스 보상 전용
    weight: 0,
  },
  // --- 태그 반응형 유물(TagReactions 프레임워크) ---
  // 효과 로직은 index.ts 하드코딩이 아니라 src/systems/TagReactions.ts 데이터로만 정의된다.
  // 새 태그 반응형 유물은 여기 정의 + TAG_REACTIONS/생성기 항목만 추가하면 된다.
  //
  // [칼날(blade) 시너지 패밀리] 커먼 씨앗 2종(처치/사용) → 에픽 증폭 1종.
  // 숫돌(커먼): 처치마다 칼날 파편을 흘려 칼날 빌드를 시작하게 한다.
  whetstone: {
    id: 'whetstone',
    name: '숫돌',
    rarity: 'common',
    effect: '적 처치 시 칼날 파편 1장 획득',
    flavor: '갈아낼수록 부스러기가 떨어진다 — 하나하나가 새 칼날의 씨앗이다.',
    basePrice: 520,
    synergyTags: ['blade'],
  },
  // 망치(커먼): 칼날 손패를 쓸 때마다 낮은 확률로 파편이 떨어지는 사용 기반 씨앗.
  hammer: {
    id: 'hammer',
    name: '망치',
    rarity: 'common',
    effect: '칼날 손패 사용 시 25% 확률로 칼날 파편 1장 획득',
    flavor: '두드릴 때마다 튀는 불똥 같은 쇳조각 — 쓸수록 씨앗이 흩어진다.',
    basePrice: 520,
    synergyTags: ['blade'],
  },
  // 연마(에픽 증폭): 칼날 씨앗(숫돌/망치/파편)을 눈덩이로 키우는 페이오프 엔진.
  sharpening: {
    id: 'sharpening',
    name: '연마',
    rarity: 'epic',
    effect: '칼날 손패 3회 사용마다 모든 칼날 손패 피해 영구 +1',
    flavor: '벨수록 손에 붙는 날 — 한 번 벼릴 때마다 모든 칼이 더 깊이 파고든다.',
    basePrice: 1050,
    synergyTags: ['blade'],
  },
  // [행동 수정자] 넘치는 촛농(레어): 풀피 초과 회복이 낭비되지 않고 방패로 전환된다.
  // 전환량은 '회복'으로도 집계돼 헌혈팩(회복→전방 피해)까지 발동 — 붉은 포션과 3중 연계.
  'overflow-wax': {
    id: 'overflow-wax',
    name: '넘치는 촛농',
    rarity: 'rare',
    effect: '최대치를 넘긴 회복량을 방패로 전환(회복으로도 집계)',
    flavor: '가득 찬 잔을 넘어 흘러도, 촛농은 굳어 또 하나의 벽이 된다.',
    basePrice: 820,
    synergyTags: ['heal'],
  },
  // [행동 수정자] 가시 방패(에픽): 방패를 얻는 행위 자체가 압박이 된다(방어=공격).
  'thorn-shield': {
    id: 'thorn-shield',
    name: '가시 방패',
    rarity: 'epic',
    effect: '방패 1 획득마다 전방 랜덤 적에게 피해 1',
    flavor: '막기만 하던 방패에 날이 섰다.',
    basePrice: 1080,
    synergyTags: ['shield'],
  },
  // [행동 수정자] 도서관(유니크): 마도서 엔진. 마도서를 굴릴수록 다음 마도서가 빨리 온다.
  library: {
    id: 'library',
    name: '도서관',
    rarity: 'unique',
    effect: '4턴마다 마도서 카드 획득 · 마도서 사용 시 남은 턴 -1',
    flavor: '한 장을 읽어치울 때마다 다음 책장이 저절로 넘어간다.',
    basePrice: 1200,
    synergyTags: ['tome'],
  },
  // [제물(sacrifice) 시너지 패밀리] 자해를 3방향(카드·화력·방어)으로 환급하고,
  // 유니크 혈마법진이 제물 사용을 영구 성장으로 복리화한다. 효과 로직은 자해 sink에서 직접 처리한다.
  // 씨앗: 혈서(커먼) — 자해 5 누적마다 제물 손패를 흘려 넣어 제물 빌드를 굴린다.
  'blood-writ': {
    id: 'blood-writ',
    name: '혈서',
    rarity: 'common',
    effect: '자해 5 누적마다 제물 손패 1장 획득',
    flavor: '피로 적어 내려간 계약 — 아플수록 새 장이 손에 쥐어진다.',
    basePrice: 520,
    synergyTags: ['sacrifice'],
  },
  // 환급(화력): 수혈(레어) — 입은 자해 피해를 곧바로 필드 적에게 랜덤 분산한다.
  transfusion: {
    id: 'transfusion',
    name: '수혈',
    rarity: 'rare',
    effect: '자해 피해만큼 필드 랜덤 적에게 피해 분산',
    flavor: '흘린 피를 그대로 적에게 되돌려 붓는다.',
    basePrice: 780,
    synergyTags: ['sacrifice'],
  },
  // 환급(방어): 응고(에픽) — 자해 2 누적마다 방패 1로 굳는다(절반 효율이 폭주 방지 브레이크).
  coagulation: {
    id: 'coagulation',
    name: '응고',
    rarity: 'epic',
    effect: '자해 2 누적마다 방패 +1',
    flavor: '흘러나온 피가 굳어 또 하나의 벽이 된다.',
    basePrice: 1050,
    synergyTags: ['sacrifice'],
  },
  // 복리 페이오프: 혈마법진(유니크) — 제물 손패를 쓸수록 연료(최대 체력)와 불빛이 함께 자란다.
  'blood-sigil': {
    id: 'blood-sigil',
    name: '혈마법진',
    rarity: 'unique',
    effect: '제물 손패 5회 사용마다 최대 체력 +2 · 불빛 획득량 +5%',
    flavor: '제물을 바칠수록 진해지는 문양 — 태울 그릇도, 타오르는 빛도 함께 커진다.',
    basePrice: 1250,
    synergyTags: ['sacrifice'],
  },
  // [불씨(flame) 시너지] 라이터(커먼 씨앗, id는 'fuel' 유지): 불씨 손패로 처치를 쌓아 빛 게이지를
  // 되채워 화염 빌드가 스폰 압박 속에서 자립하게 한다. flame 태그로 반응하므로
  // 앞으로 추가되는 불씨 공격 손패도 코드 수정 없이 자동으로 굴린다.
  fuel: {
    id: 'fuel',
    name: '라이터',
    rarity: 'common',
    effect: '불씨 손패로 적 3회 처치마다 빛 게이지 +1',
    flavor: '몇 번을 그어야 붙지만, 한 번 붙으면 쉬이 꺼지지 않는다.',
    basePrice: 520,
    synergyTags: ['flame'],
  },
  // [양초(wax) 시너지] 재활용(에픽): 양초 손패를 쓸 때마다 밀랍이 레일에 굳음을 흘려
  // 정체를 만든다(생존 템포). wax 태그 반응이라 미래 양초 손패도 자동으로 굳음을 쌓는다.
  'wax-recycle': {
    id: 'wax-recycle',
    name: '재활용',
    rarity: 'epic',
    effect: '양초 손패 2회 사용마다 전방 랜덤 타이머 카드 1턴 굳음',
    flavor: '녹아내린 밀랍도 버리지 않는다 — 굳혀 다시 벽으로 세운다.',
    basePrice: 1050,
    synergyTags: ['wax'],
  },
  // [불씨(flame) 시너지] 뜨거운 돌(레어 페이오프): 불씨 밝음 상태에서 불씨 공격 손패 피해를 증폭.
  // HandSystem.flameHotStoneBonus가 flame+damageProfile로 판정 → 미래 불씨 공격 손패도 자동 적용.
  'hot-stone': {
    id: 'hot-stone',
    name: '뜨거운 돌',
    rarity: 'rare',
    effect: '불씨 밝음(불씨 7↑)일 때 불씨 손패 피해 +(0.25공+1)',
    flavor: '오래 달군 돌은 쉽게 식지 않는다 — 불길이 왕성할 때 가장 뜨겁게 탄다.',
    basePrice: 780,
    synergyTags: ['flame'],
  },
  // [양초(wax) 시너지] 밀랍 조각(에픽 페이오프): 굳은 카드를 처리(처치/클리어)할 때 불빛·방패를
  // 회수한다. 재활용(굳음 씨앗)과 짝. GameState.onCardRemoved 훅으로 처치 경로(손패/직접타격)를
  // 모두 잡으므로 굳히는 손패가 앞으로 늘어도 자동 반영된다.
  'wax-fragment': {
    id: 'wax-fragment',
    name: '밀랍 조각',
    rarity: 'epic',
    effect: '굳은 카드 처리 시 불빛 획득 · 방패 +2',
    flavor: '굳어 떨어진 밀랍 조각도 값지다 — 부수는 손에 온기와 방벽을 남긴다.',
    basePrice: 1050,
    synergyTags: ['wax'],
  },
  // [불씨(flame) 시너지] 확산(유니크 페이오프): 불씨 손패로 처치하면 불길이 옆 레인으로 번져
  // 함정을 태운다. flame 태그로 판정하므로 미래 불씨 공격 손패도 자동으로 확산을 일으킨다.
  spread: {
    id: 'spread',
    name: '확산',
    rarity: 'epic',
    effect: '불씨 손패로 적 처치 시 인접 레인 함정 1칸 제거',
    flavor: '한 번 붙은 불은 옆으로 옮겨붙는다 — 길을 막던 것들이 재로 스러진다.',
    basePrice: 1080,
    synergyTags: ['flame'],
  },
  // [칼날(blade) 시너지] 숨겨둔 파편(레어 증식): 칼날 손패를 쓸 때마다 낮은 확률로 파편 1발이
  // 덤으로 날아간다. blade 태그 반응이라 미래 칼날 손패도 자동으로 덤 투척을 굴린다.
  // 던지는 파편 피해는 연마 강화(칼날 파편 singleBonus)를 그대로 받는다.
  'hidden-shard': {
    id: 'hidden-shard',
    name: '숨겨둔 파편',
    rarity: 'rare',
    effect: '칼날 손패 사용 시 25% 확률로 칼날 파편 1발 추가 투척',
    flavor: '소매 안에 늘 한 조각을 숨겨 둔다 — 벨 때마다 덤으로 튀어나간다.',
    basePrice: 780,
    synergyTags: ['blade'],
  },
  // [칼날(blade) 시너지] 비장의 한발(커먼 연격): 칼날 파편 4회 사용마다 4번째 파편이 한 발 더 나간다.
  'trump-shot': {
    id: 'trump-shot',
    name: '비장의 한발',
    rarity: 'common',
    effect: '칼날 파편 4회 사용 시 파편 1발 추가 투척',
    flavor: '네 번을 세어 두었다가, 마지막 한 발을 두 번 던진다.',
    basePrice: 520,
    synergyTags: ['blade'],
  },
  // 관통 파편(에픽): 파편으로 적을 처치하면 그 세로열 나머지 적까지 꿰뚫는다(베어 넘김).
  'pierce-shard': {
    id: 'pierce-shard',
    name: '관통 파편',
    rarity: 'epic',
    effect: '칼날 파편으로 적 처치 시 그 세로열 모든 적에게 피해',
    flavor: '멈추지 않는 날은 뒤에 선 것들까지 가른다.',
    basePrice: 1080,
    synergyTags: ['blade'],
  },
  // 도탄(레어): 파편으로 처치하고 남은 피해가 인접 레인 적에게 튕겨 전이한다.
  ricochet: {
    id: 'ricochet',
    name: '도탄',
    rarity: 'rare',
    effect: '칼날 파편으로 적 처치 시 남은 피해가 인접 레인 적에게 전이',
    flavor: '빗맞은 각도가 오히려 옆의 적을 노린다.',
    basePrice: 780,
    synergyTags: ['blade'],
  },
  // 투척 비술(유니크): 파편을 던질수록 팔이 익는다 — 20회마다 공격력 영구 +1(최대 +5).
  'throw-art': {
    id: 'throw-art',
    name: '투척 비술',
    rarity: 'unique',
    effect: '칼날 파편 20회 사용마다 공격력 +1 (최대 +5)',
    flavor: '천 번을 던진 손은 겨누지 않아도 꽂힌다.',
    basePrice: 1200,
    synergyTags: ['blade'],
  },
  // 칼날 폭풍(레전더리): 파편이 한 적이 아니라 필드 전체 적을 동시에 벤다.
  'blade-storm': {
    id: 'blade-storm',
    name: '칼날 폭풍',
    rarity: 'legendary',
    effect: '칼날 파편이 필드 전체 적을 대상으로 바뀜',
    flavor: '한 자루가 백 자루가 되어 사방을 채운다.',
    basePrice: 1600,
    synergyTags: ['blade'],
  },
  // 함정 수집(커먼): 함정을 처리(제거)할 때마다 그 조각으로 칼날 파편을 얻는다(칼날 씨앗 겸 청소 보상).
  'trap-collect': {
    id: 'trap-collect',
    name: '함정 수집',
    rarity: 'common',
    effect: '함정 처리 시 칼날 파편 1장 획득',
    flavor: '부서진 덫의 날붙이도 훌륭한 무기가 된다.',
    basePrice: 520,
    synergyTags: ['blade'],
  },
}

/**
 * 누적형(스택) 유물 UI 피드백 레지스트리 — "이 유형의 유물"을 한 곳에서 관리한다.
 * 여기 등록된 유물은 발동 시(recordRelicActivation) 보유 유물 팬에서 **스택 블라스트**로 부상하고,
 * `charge`를 지정하면 발동 직전(카운터 ≥ threshold-1)에 **충전 발광**으로 준비됨을 알린다.
 * 새 누적형 유물은 여기 한 줄만 추가하면 UI(GameBoardRenderer)가 코드 수정 없이 자동 연동된다.
 */
export interface RelicStackFeedback {
  /** 활성화형(재카운팅) 유물의 발동 직전 판정. 이 카운터가 threshold-1 이상이면 '충전됨' 발광. */
  charge?: { counter: keyof RunEnhancements; threshold: number }
}

export const RELIC_STACK_FEEDBACK: Partial<Record<RelicId, RelicStackFeedback>> = {
  'trump-shot':   { charge: { counter: 'trumpShotShardCount', threshold: 4 } },
  'throw-art':    { charge: { counter: 'bladeShardUseCount', threshold: 20 } },
  'blood-sigil':  { charge: { counter: 'bloodSigilUseCount', threshold: 5 } },
  'blood-writ':   { charge: { counter: 'bloodWritSelfDamageAccum', threshold: 5 } },
  'demon-doll':   { charge: { counter: 'demonDollSelfDamageAccum', threshold: 20 } },
  'ambition':     { charge: { counter: 'ambitionKillCount', threshold: 8 } },
  'honesty':      { charge: { counter: 'honestyHandUseCount', threshold: 5 } },
  'ink-quill':    { charge: { counter: 'inkQuillKillCount', threshold: 5 } },
  // 블라스트만(작은 주기라 충전 발광은 생략): 응고/재활용/사치품/밀랍 조각.
  'coagulation':  {},
  'wax-recycle':  {},
  'luxury':       {},
  'wax-fragment': {},
}

/** 누적형 유물이면 UI 피드백 메타를 돌려준다(스택 블라스트 대상 판정 겸용). */
export function relicStackFeedback(id: RelicId): RelicStackFeedback | undefined {
  return RELIC_STACK_FEEDBACK[id]
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
