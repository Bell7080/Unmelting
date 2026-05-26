/**
 * 턴 루프/UI 비트 간 공통 지연 상수.
 * 같은 beat 안의 연출이 겹치지 않도록 시스템 전반에서 동일 값을 참조한다.
 */

// 콤보 트리거는 카드 액션 직후 같은 비트로 묶이지 않게 살짝 늦춘다.
export const COMBO_TRIGGER_DELAY_MS = 440

// 손패 게이지는 카드/레시피 비트 다음 차례로 분리해 동시 폭발을 피한다.
export const GAUGE_TRIGGER_DELAY_MS = 440

// 활동 로그 패널이 보존하는 최대 항목 수.
export const MAX_ACTIVITY_LOGS = 80
