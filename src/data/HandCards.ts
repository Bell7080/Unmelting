/**
 * HandCards - Current hand item list from the design sheet.
 *
 * Data stays declarative here: names, categories, UI text, targeting rules, and
 * drop weights. HandSystem owns the actual gameplay mutations so item behavior
 * remains centralized and testable.
 */

import { HandCardDefinition, HandCardId, HandEffectTargeting } from '@entities/HandCard'
// dropSource / metaRequired / runLocked: 현재 10종 모두 범용 기본값.
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
    description: '전방 선택 함정 1장 제거',
    tripleDescription: '필드 모든 함정 제거',
    targeting: {
      base: { selection: 'target', zone: 'front', filter: 'trap', countLimit: 1 },
      triple: { selection: 'all', zone: 'field', filter: 'trap', countLimit: null },
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
    dropSource: 'any',
    metaRequired: false,
    runLocked: false,
  },
}

export const HAND_CARD_IDS: HandCardId[] = Object.keys(HAND_CARD_DEFINITIONS) as HandCardId[]

export function getHandCardDef(id: HandCardId): HandCardDefinition {
  return HAND_CARD_DEFINITIONS[id]
}
