/**
 * RunEnhancements - 런 내 트리플/레시피 강화 누적 상태.
 *
 * 강화팩 구매 시 apply()가 여기 값을 증가시키고,
 * HandSystem이 triple/recipe 효과를 적용할 때 이 값을 읽어 수치에 더한다.
 */

import type { HandCardId } from '@entities/HandCard'

export interface RunEnhancements {
  /** 트리플 효과의 수치 보너스: 카드 id → 추가값. */
  tripleBonus: Partial<Record<HandCardId, number>>
  /** 단일 사용 효과의 수치 보너스: 카드 id → 추가값. */
  singleBonus: Partial<Record<HandCardId, number>>
  /** 레시피 효과의 수치 보너스: recipe id → 추가값 (피해/칸/화폐/드로우). */
  recipeBonus: Partial<Record<string, number>>
  /** 불빛 획득량 배율. 기본 1.0, 리소스팩 구매마다 누적 곱셈. */
  scoreMultiplier: number
  /** 화염의 서 영구 피해 누적값(n). 사용할 때마다 단일 +1 / 트리플 +3 증가. */
  bookOfFlamesBonus: number
  /** 직업 귀족·할인 쿠폰 유물로 누적되는 상점 할인율(%). 상점 가격 계산 시 참조한다. */
  shopDiscountPct: number
  /** 사치품 유물: 누적 불빛 소비량 추적(2000마다 공격력 +1). */
  luxuryScoreSpent: number
  /** 사치품 유물: 현재까지 실제 획득한 공격력 누적치(최대 5). */
  luxuryBonusAtk: number
  /** 악마 인형 유물: 누적 자해량 추적(20마다 불빛 +10%, 공격력 +1). */
  demonDollSelfDamageAccum: number
  /** 악마 인형 유물: 현재까지 실제 획득한 공격력 누적치 (표기용). */
  demonDollBonusAtk: number
  /** 확률팩으로 1차 거름망에 추가된 개별 카드 가중치: 카드 id → 누적값. */
  tier1CardBoosts: Partial<Record<string, number>>
  /** 직업 선택으로 1차 거름망에 추가된 태그 그룹 가중치: 태그명 → 누적값. 당첨 시 태그 내 T2를 돌린다. */
  tier1JobPoolBoosts: Partial<Record<string, number>>
}

export function makeDefaultEnhancements(): RunEnhancements {
  return { tripleBonus: {}, singleBonus: {}, recipeBonus: {}, scoreMultiplier: 1, bookOfFlamesBonus: 0, shopDiscountPct: 0, luxuryScoreSpent: 0, luxuryBonusAtk: 0, demonDollSelfDamageAccum: 0, demonDollBonusAtk: 0, tier1CardBoosts: {}, tier1JobPoolBoosts: {} }
}
