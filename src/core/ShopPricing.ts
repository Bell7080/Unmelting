/**
 * ShopPricing - 상점/제단 카드팩 가격 공식의 단일 출처.
 *
 * index.ts(실게임 UI/차감)와 에나 RL 시뮬레이터(EnaTrainingSimulation)·지식 어댑터가
 * 같은 순수 함수를 읽어, 밸런스 조정 시 표기·차감·학습 경제가 함께 움직인다.
 */

/** 일반 상점 3팩(자원/조합/해금) 공통 시작가: 10층 120에서 10층마다 +40. */
export function regularShopPackBaseCost(turn: number): number {
  return Math.max(120, 80 + turn * 4)
}

/** 제단 팩 층별 고정 시작가: 30F 500 · 60F 1500 · 90F 2500. */
export function altarPackBaseCost(turn: number): number {
  if (turn >= 90) return 2500
  if (turn >= 60) return 1500
  return 500
}

/** 방문 내 동일 팩 반복 구매 누적가: 구매할 때마다 시작가만큼 증가(예: 500→1000→1500). */
export function packCostWithRepeats(base: number, priorBuys: number): number {
  return base * (Math.max(0, priorBuys) + 1)
}
