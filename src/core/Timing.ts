/**
 * 턴 루프/UI 비트 간 공통 지연 상수.
 * 같은 beat 안의 연출이 겹치지 않도록 시스템 전반에서 동일 값을 참조한다.
 */

// 손패 게이지는 카드/레시피 비트 다음 차례로 분리해 동시 폭발을 피한다.
export const GAUGE_TRIGGER_DELAY_MS = 440

/** 일반 손패의 핵심 타격이 읽힌 뒤 입력을 다시 여는 목표 시간(모델은 이미 커밋됨). */
export const HAND_ACTION_INPUT_RESUME_MS = 320

/** 연속 카드의 중앙 비행이 한 덩어리로 뭉치지 않게 보장하는 최소 시각 간격. */
export const HAND_ACTION_MIN_VISUAL_GAP_MS = 150

/** 440ms 강조는 모든 손패가 아니라 새 레시피가 실제 발동할 때만 사용한다. */
export const HAND_RECIPE_EMPHASIS_DELAY_MS = 440

// 활동 로그 패널이 보존하는 최대 항목 수.
export const MAX_ACTIVITY_LOGS = 80
