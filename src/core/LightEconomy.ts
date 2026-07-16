/**
 * LightEconomy — 불빛(score) 지급 경제의 공유 상수/공식.
 *
 * index.ts(실게임 지급)와 EnaTrainingSimulation·EnaKnowledgeAdapter(학습 세계)가
 * 같은 값을 복제해 들고 있던 누수를 막는다. 경제 밸런싱은 이 파일만 고치면 된다.
 */

/** 일반 적 처치 불빛 1차식: base + rank × perRank (rank = enemyPower). */
export const ENEMY_LIGHT_BASE = 17
export const ENEMY_LIGHT_PER_RANK = 6

/** 합체(그룹) 처치 불빛 감산 배율 — 칸 수 배수 구조를 25% 희석한다. */
export const GROUP_LIGHT_DISCOUNT = 0.75

/** 모든 불빛 지급의 공통 상향 배율(지터와 별개 고정 계수). */
export const BASE_LIGHT_GAIN_MULTIPLIER = 1.4

/** 완만한 선형 턴 인플레이션(1 + 턴×0.015) — 90턴대 경제 폭증을 제한한다. */
export function lightTurnMultiplier(turn: number): number {
  return 1 + Math.max(0, turn) * 0.015
}
