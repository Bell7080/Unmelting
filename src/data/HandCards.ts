/**
 * HandCards - Current hand item list from the design sheet.
 *
 * Data stays declarative here: names, categories, UI text, targeting rules, and
 * drop weights. HandSystem owns the actual gameplay mutations so item behavior
 * remains centralized and testable.
 */

import { HandCardDefinition, HandCardId, HandEffectTargeting } from '@entities/HandCard'
// dropSource가 'treasure'인 카드는 보물상자 전용 보너스 풀에만 섞인다.
// 이후 시트에서 등장 조건/해금 조건을 지정하면 이 파일에서만 수치를 수정하면 된다.

const selfOne: HandEffectTargeting = {
  selection: 'none',
  zone: 'self',
  filter: 'none',
  countLimit: 1,
}
const handOne: HandEffectTargeting = {
  selection: 'none',
  zone: 'hand',
  filter: 'none',
  countLimit: 1,
}
const handSeven: HandEffectTargeting = {
  selection: 'none',
  zone: 'hand',
  filter: 'none',
  countLimit: 7,
}

/**
 * 설명문 스타일 규칙 (description / tripleDescription)
 * - 명사형 종결: 동사문·경어체 금지. 예) `피해 2` `굳음` `+1` `분산` `제거`
 * - 대상 수식: `필드 선택 적 1장`, `전방 랜덤 함정 1장` 순서 고정
 * - 수치 표기: 스탯 증감은 `+N` / 피해는 `피해 N` / 자해는 `자해 N`
 * - 다중 효과: 같은 행은 `·` 구분, 줄바꿈 필요 시 `<br>` (도감 chip에서 ` · `로 치환됨)
 * - 1인칭/수동 금지: `나에게` `자신에게` 대신 `자해 N` 표기
 * - description 문자열이 도감·미리보기 그대로 표시됨 — 항상 동일하게 유지
 */
export const HAND_CARD_DEFINITIONS: Record<HandCardId, HandCardDefinition> = {
  'wax-drop': {
    id: 'wax-drop',
    name: '촛농',
    category: 'recovery',
    description: '체력 +1',
    tripleDescription: '체력 +5',
    targeting: { base: selfOne, triple: { ...selfOne, countLimit: 5 } },
    dropWeight: 14,
    dropSource: 'any',
    metaRequired: false,
    runLocked: false,
  },
  candle: {
    id: 'candle',
    name: '양초',
    category: 'recovery',
    description: '방패 +1',
    tripleDescription: '방패 +5',
    targeting: { base: selfOne, triple: { ...selfOne, countLimit: 5 } },
    dropWeight: 14,
    dropSource: 'any',
    metaRequired: false,
    runLocked: false,
  },
  ember: {
    id: 'ember',
    name: '불씨',
    category: 'attack',
    description: '필드 선택 적 1장 피해 2',
    tripleDescription: '필드 선택 적 1장 피해 10',
    targeting: {
      base: { selection: 'target', zone: 'field', filter: 'enemy', countLimit: 1 },
      triple: { selection: 'target', zone: 'field', filter: 'enemy', countLimit: 1 },
    },
    dropWeight: 13,
    dropSource: 'any',
    metaRequired: false,
    runLocked: false,
  },
  key: {
    id: 'key',
    name: '열쇠',
    category: 'tool',
    description: '필드 랜덤 보물상자 1장 획득',
    tripleDescription: '필드 모든 보물상자 획득',
    targeting: {
      base: { selection: 'random', zone: 'field', filter: 'treasure', countLimit: 1 },
      triple: { selection: 'all', zone: 'field', filter: 'treasure', countLimit: null },
    },
    dropWeight: 9,
    dropSource: 'any',
    metaRequired: false,
    runLocked: false,
  },
  wax: {
    id: 'wax',
    name: '밀랍',
    category: 'control',
    description: '전방 선택 턴 타이머 카드 1장 1턴 굳음',
    tripleDescription: '전방 모든 턴 타이머 카드 3턴 굳음',
    targeting: {
      base: { selection: 'target', zone: 'front', filter: 'turn-timer', countLimit: 1 },
      triple: { selection: 'all', zone: 'front', filter: 'turn-timer', countLimit: null },
    },
    dropWeight: 11,
    dropSource: 'any',
    metaRequired: false,
    runLocked: true, // 해금팩으로만 입수
  },
  match: {
    id: 'match',
    name: '성냥',
    category: 'tool',
    description: '불씨 카운트 +1',
    tripleDescription: '불씨 카운트 +5',
    targeting: { base: selfOne, triple: { ...selfOne, countLimit: 5 } },
    dropWeight: 11,
    dropSource: 'any',
    metaRequired: false,
    runLocked: false,
  },
  'holy-water': {
    id: 'holy-water',
    name: '성수',
    category: 'control',
    description: '필드 랜덤 포자 2장 제거',
    tripleDescription: '필드 전체 포자 제거',
    targeting: {
      // 성수는 이제 저주/곰팡이 대체 규칙이 아니라 포자 함정만 정화한다.
      base: { selection: 'random', zone: 'field', filter: 'spore', countLimit: 2 },
      triple: { selection: 'all', zone: 'field', filter: 'spore', countLimit: null },
    },
    dropWeight: 8,
    dropSource: 'any',
    metaRequired: false,
    runLocked: true, // 해금팩으로만 입수
  },
  chitin: {
    id: 'chitin',
    name: '키틴',
    category: 'control',
    description: '전방 2칸 이하 함정 1장 제거',
    tripleDescription: '전방 3칸 이하 함정 1장 제거',
    targeting: {
      base: { selection: 'target', zone: 'front', filter: 'trap', countLimit: 1, maxSpan: 2 },
      triple: { selection: 'target', zone: 'front', filter: 'trap', countLimit: 1, maxSpan: 3 },
    },
    dropWeight: 8,
    dropSource: 'any',
    metaRequired: false,
    runLocked: false,
  },
  card: {
    id: 'card',
    name: '카드',
    category: 'tool',
    description: '손패 콤보 카운트 +1',
    tripleDescription: '손패 콤보 카운트 +7',
    targeting: { base: handOne, triple: handSeven },
    dropWeight: 8,
    dropSource: 'any',
    metaRequired: false,
    runLocked: true, // 해금팩으로만 입수
  },
  coin: {
    id: 'coin',
    name: '동전',
    category: 'tool',
    description: '+1$',
    tripleDescription: '+5$',
    targeting: { base: selfOne, triple: { ...selfOne, countLimit: 5 } },
    dropWeight: 10,
    dropSource: 'treasure',
    metaRequired: false,
    runLocked: false,
  },
  // 탐욕의 동전: 양초 백작이 손패에 뿌리는 불편한 찌꺼기. 소량의 불빛을 주지만
  // 사용 시 자신이 3 피해를 입는다. 보스 전용이라 일반 드롭/드로우 풀에는 섞이지 않고,
  // 트리플 합성도 되지 않아 손패를 갉아먹는다.
  'greed-coin': {
    id: 'greed-coin',
    name: '탐욕의 동전',
    category: 'tool',
    description: '소량의 불빛 · 자해 3',
    tripleDescription: '소량의 불빛 · 자해 3',
    targeting: { base: selfOne, triple: selfOne },
    dropSource: 'boss',
    metaRequired: false,
    runLocked: true,
  },
  // 제물 양초: 자신을 제물로 바쳐 강하게 내리치는 단일 공격. 트리플은 자해 없이 더 큰 피해.
  'sacrifice-candle': {
    id: 'sacrifice-candle',
    name: '제물 양초',
    category: 'attack',
    description: '자해 2 · 필드 선택 적 1장 피해 5',
    tripleDescription: '필드 선택 적 1장 피해 7',
    targeting: {
      base: { selection: 'target', zone: 'field', filter: 'enemy', countLimit: 1 },
      triple: { selection: 'target', zone: 'field', filter: 'enemy', countLimit: 1 },
    },
    dropWeight: 7,
    dropSource: 'any',
    metaRequired: false,
    runLocked: false,
  },
  // 레바테인: 사용 전 N회 적 행동을 먼저 실행(턴 카운터 비소모), 이후 선택 적의 최대 체력 %를 피해로 입힌다.
  // 보스 전투 중에는 공격 주기 카운터를 N 증가시켜 주기 도달 시 보스 행동이 즉시 발동한다.
  levatein: {
    id: 'levatein',
    name: '레바테인',
    category: 'attack',
    description: '즉시 2턴 흐름<br>이후, 선택 적 1장 최대체력 30% 피해 (최소 10)',
    tripleDescription: '즉시 1턴 흐름<br>이후, 선택 적 1장 최대체력 45% 피해 (최소 15)',
    targeting: {
      base: { selection: 'target', zone: 'field', filter: 'enemy', countLimit: 1 },
      triple: { selection: 'target', zone: 'field', filter: 'enemy', countLimit: 1 },
    },
    dropWeight: 1,
    dropSource: 'any',
    metaRequired: false,
    runLocked: false,
  },
  // 폭죽: 필드의 적들에게 총 피해를 무작위로 쪼개 분배한다(대상 지정 없음).
  firework: {
    id: 'firework',
    name: '폭죽',
    category: 'attack',
    description: '필드 랜덤 적 전체 피해 3 분산',
    tripleDescription: '필드 랜덤 적 전체 피해 12 분산',
    targeting: {
      base: { selection: 'random', zone: 'field', filter: 'enemy', countLimit: null },
      triple: { selection: 'random', zone: 'field', filter: 'enemy', countLimit: null },
    },
    dropWeight: 6,
    dropSource: 'any',
    metaRequired: false,
    runLocked: false,
  },
  // 화염의 서: 쓸수록 영구히 강해지는 누적 공격(n). 단일 +1, 트리플 +3씩 영구 증가.
  // 설명의 피해 수치는 GameBoardRenderer.enhancedHandCardDescription이 bookOfFlamesBonus를 읽어 동적 표시한다.
  'book-of-flames': {
    id: 'book-of-flames',
    name: '화염의 서',
    category: 'attack',
    description: '필드 선택 적 1장 피해 0<br>화염의 서 피해 1 증가',
    tripleDescription: '필드 선택 적 1장 피해 3<br>화염의 서 피해 3 증가',
    targeting: {
      base: { selection: 'target', zone: 'field', filter: 'enemy', countLimit: 1 },
      triple: { selection: 'target', zone: 'field', filter: 'enemy', countLimit: 1 },
    },
    dropWeight: 5,
    dropSource: 'any',
    metaRequired: false,
    runLocked: false,
  },
}

export const HAND_CARD_IDS: HandCardId[] = Object.keys(HAND_CARD_DEFINITIONS) as HandCardId[]

export function getHandCardDef(id: HandCardId): HandCardDefinition {
  return HAND_CARD_DEFINITIONS[id]
}
