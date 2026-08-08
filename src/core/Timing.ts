/**
 * 턴 루프/UI 비트 간 공통 지연 상수.
 * 같은 beat 안의 연출이 겹치지 않도록 시스템 전반에서 동일 값을 참조한다.
 */

// 규칙 지연: 마지막 카드 모델 커밋 뒤 추가 입력을 같은 체인으로 받을 유예다.
export const CHAIN_SETTLEMENT_GRACE_MS = 220

// 시각 지연: 한 정산 묶음 안에서 효과별 타격을 읽히게 떼는 간격이다.
export const CHAIN_EFFECT_STAGGER_MS = 110

// 시각 지연: 레시피 정산 뒤 게이지 보상이 겹쳐 보이지 않게 정박시키는 beat다.
export const GAUGE_SETTLEMENT_ANCHOR_MS = 440

/** 일반 손패의 핵심 타격이 읽힌 뒤 입력을 다시 여는 목표 시간(모델은 이미 커밋됨). */
export const HAND_ACTION_INPUT_RESUME_MS = 320

/** 연속 카드의 중앙 비행이 한 덩어리로 뭉치지 않게 보장하는 최소 시각 간격. */
export const HAND_ACTION_MIN_VISUAL_GAP_MS = 150

/** 440ms 강조는 모든 손패가 아니라 새 레시피가 실제 발동할 때만 사용한다. */
export const HAND_RECIPE_EMPHASIS_DELAY_MS = 440

// 활동 로그 패널이 보존하는 최대 항목 수.
export const MAX_ACTIVITY_LOGS = 80
