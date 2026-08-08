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

// 활동 로그 패널이 보존하는 최대 항목 수.
export const MAX_ACTIVITY_LOGS = 80
