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
}

export function makeDefaultEnhancements(): RunEnhancements {
  return { tripleBonus: {}, singleBonus: {}, recipeBonus: {}, scoreMultiplier: 1, bookOfFlamesBonus: 0 }
}
