/**
 * HandCards - MVP definitions for the 8 hand cards.
 *
 * Each definition carries metadata only (name, category, descriptions, gain).
 * The actual effect application happens in HandSystem so card data stays pure.
 */

import { HandCardDefinition, HandCardId } from '@entities/HandCard'

export const HAND_CARD_DEFINITIONS: Record<HandCardId, HandCardDefinition> = {
  'small-candle': {
    id: 'small-candle',
    name: '작은 양초',
    category: 'recovery',
    description: '체력 +2',
    tripleDescription: '체력 +6, 다음 턴 받는 피해 -1',
    candleGain: 1,
    dropWeight: 18,
  },
  'large-candle': {
    id: 'large-candle',
    name: '큰 양초',
    category: 'recovery',
    description: '체력 +5',
    tripleDescription: '체력 풀 회복',
    candleGain: 2,
    dropWeight: 10,
  },
  'wax-shield': {
    id: 'wax-shield',
    name: '밀랍 방패',
    category: 'recovery',
    description: '다음 턴 받는 피해 -2',
    tripleDescription: '다음 2턴 동안 모든 피해 무효',
    candleGain: 1,
    dropWeight: 12,
  },
  matchstick: {
    id: 'matchstick',
    name: '성냥 한 개비',
    category: 'tool',
    description: '대기 카드 1장 즉시 발화 (제거)',
    tripleDescription: '임의 카드 3장 즉시 발화',
    candleGain: 2,
    needsTarget: true,
    dropWeight: 14,
  },
  'brass-key': {
    id: 'brass-key',
    name: '황동 열쇠',
    category: 'tool',
    description: '잠긴 보물 해제, 없으면 불씨 +2',
    tripleDescription: '모든 보물 즉시 획득 + 불씨 +3',
    candleGain: 1,
    dropWeight: 8,
  },
  'cooled-candle': {
    id: 'cooled-candle',
    name: '식은 양초',
    category: 'control',
    description: '한 라인 카드 1턴 정지',
    tripleDescription: '모든 카드 2턴 정지',
    candleGain: 2,
    needsTarget: true,
    dropWeight: 12,
  },
  'cleansing-ember': {
    id: 'cleansing-ember',
    name: '정화의 불씨',
    category: 'control',
    description: '저주/곰팡이 제거, 없으면 양초 +2',
    tripleDescription: '필드 전체 정화 + 양초 +5',
    candleGain: 1,
    dropWeight: 8,
  },
  'match-bundle': {
    id: 'match-bundle',
    name: '성냥다발',
    category: 'attack',
    description: '한 라인 0~1칸 광역 피해 3',
    tripleDescription: '모든 라인 0~1칸 광역 피해 5',
    candleGain: 2,
    needsTarget: true,
    dropWeight: 12,
  },
}

export const HAND_CARD_IDS: HandCardId[] = Object.keys(
  HAND_CARD_DEFINITIONS,
) as HandCardId[]

export function getHandCardDef(id: HandCardId): HandCardDefinition {
  return HAND_CARD_DEFINITIONS[id]
}
