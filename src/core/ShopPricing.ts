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

/**
 * 새싹 병아리(온보딩) 물가 배수 — 모든 것이 절반값이다. 상점을 많이 열어 보라고 만든
 * 자리라, 한 번 살 것을 두 번 사게 하는 쪽이 배우기에 좋다.
 *
 * ★ 이 값은 `enhancements.shopDiscountPct`(직업·만찬 할인)와 **별도 축**이다.
 * 직업 선택이 그 필드를 대입(`=`)으로 덮으므로 거기 얹으면 조용히 사라진다.
 * 두 축은 곱해져 함께 걸린다.
 */
export const SPROUT_SHOP_PRICE_SCALE = 0.5

/** 난이도 물가 배수. 정규 런은 1(변화 없음). */
export function difficultyPriceScale(onboarding: boolean): number {
  return onboarding ? SPROUT_SHOP_PRICE_SCALE : 1
}
