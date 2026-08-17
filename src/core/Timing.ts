/**
 * 턴 루프/UI 비트 간 공통 지연 상수.
 * 같은 beat 안의 연출이 겹치지 않도록 시스템 전반에서 동일 값을 참조한다.
 */

/**
 * 손패 사용 연출 속도 프리셋. 나중에 설정 화면을 붙일 때 이 네 단계만 저장하고,
 * 실제 ms 값은 여기서 계속 관리해 기존 저장 데이터와 연출 수치가 결합되지 않게 한다.
 */
export type HandAnimationSpeed = 'very-fast' | 'fast' | 'normal' | 'slow'

export const HAND_ANIMATION_SPEED_SCALE: Record<HandAnimationSpeed, number> = {
  'very-fast': 0.65,
  fast: 0.8,
  normal: 1,
  slow: 1.25,
}

// 현재 기본값은 종전의 보통보다 한 단계 빠름이다. 미래 설정 UI는 이 값 대신 저장값을 넘긴다.
export const ACTIVE_HAND_ANIMATION_SPEED: HandAnimationSpeed = 'fast'

/** 보통 속도로 작성한 연출 시간을 현재 손패 속도 프리셋에 맞춰 정수 ms로 바꾼다. */
export function handAnimationMs(normalMs: number, speed: HandAnimationSpeed = ACTIVE_HAND_ANIMATION_SPEED): number {
  return Math.round(normalMs * HAND_ANIMATION_SPEED_SCALE[speed])
}

// 콤보 트리거는 카드 액션 직후 같은 비트로 묶이지 않게 살짝 늦춘다.
export const COMBO_TRIGGER_DELAY_MS = handAnimationMs(440)

// 손패 게이지는 카드/레시피 비트 다음 차례로 분리해 동시 폭발을 피한다.
export const GAUGE_TRIGGER_DELAY_MS = handAnimationMs(440)

// 활동 로그 패널이 보존하는 최대 항목 수.
export const MAX_ACTIVITY_LOGS = 80
