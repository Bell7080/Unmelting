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
  /** 검은 양초 영구 피해 누적값(n). 사용할 때마다 단일 +2 / 트리플 +6 증가. */
  blackCandleBonus: number
  /** 직업 귀족·할인 쿠폰 유물로 누적되는 상점 할인율(%). 상점 가격 계산 시 참조한다. */
  shopDiscountPct: number
  /** 사치품 유물: 누적 불빛 소비량 추적(2000마다 공격력 +1). */
  luxuryScoreSpent: number
  /** 사치품 유물: 현재까지 실제 획득한 공격력 누적치(최대 5). */
  luxuryBonusAtk: number
  /** 악마 인형 유물: 누적 자해량 추적(10마다 불빛 +10%, 공격력 +1). */
  demonDollSelfDamageAccum: number
  /** 악마 인형 유물: 현재까지 실제 획득한 공격력 누적치 (표기용). */
  demonDollBonusAtk: number
  /** 주사기 유물: 누적 체력 손실 추적(자해+받는 피해, 5마다 바늘 손패 1장 지급). */
  syringeHpLossAccum: number
  /** 피의 대가 유물: 누적 체력 손실 추적(자해+받는 피해, 40마다 공격력 +1). */
  bloodPriceHpLossAccum: number
  /** 피의 대가 유물: 현재까지 실제 획득한 공격력 누적치 (표기용). */
  bloodPriceBonusAtk: number
  /** 확률팩으로 1차 거름망에 추가된 개별 카드 가중치: 카드 id → 누적값. */
  tier1CardBoosts: Partial<Record<string, number>>
  /** 직업 선택으로 1차 거름망에 추가된 태그 그룹 가중치: 태그명 → 누적값. 당첨 시 태그 내 T2를 돌린다. */
  tier1JobPoolBoosts: Partial<Record<string, number>>
  /** 잉크와 깃펜 현재 처치 누적 카운트 (5마다 콤보 게이지 +1). */
  inkQuillKillCount: number
  /** 정직 현재 손패 사용 누적 카운트 (5마다 불빛 획득). */
  honestyHandUseCount: number
  /** 야망 현재 처치 누적 카운트 (8마다 발동). */
  ambitionKillCount: number
  /** 야망 다음 발동 시 지급할 불빛량 (25→50→75…). */
  ambitionCurrentGain: number
  /** 도서관 유물: 다음 마도서 카드 지급까지 남은 카운트(턴/마도서 사용마다 -1, 0에서 지급 후 +4). */
  libraryCountdown: number
  /** 혈서 유물: 누적 자해량 추적(5마다 제물 손패 1장 지급). */
  bloodWritSelfDamageAccum: number
  /** 응고 유물: 누적 자해량 추적(2마다 방패 +1). */
  coagulationSelfDamageAccum: number
  /** 혈마법진 유물: 제물 손패 사용 누적 카운트(5마다 최대 체력 +2 · 불빛 +5%). */
  bloodSigilUseCount: number
  /** 재활용 유물: 양초 손패 사용 누적 카운트(2마다 전방 랜덤 타이머 카드 1턴 굳음). */
  recycleWaxUseCount: number
  /** 비장의 한발 유물: 칼날 파편 사용 누적 카운트(4마다 파편 1발 추가 투척). */
  trumpShotShardCount: number
  /** 칼날 파편 카드 사용 통산(칼날의 서 투척 횟수 스케일 · 투척 비술 20회 판정). 감소 없음. */
  bladeShardUseCount: number
  /** 투척 비술 유물: 현재까지 획득한 공격력 누적치(최대 5). */
  throwArtBonusAtk: number
  /** 라이터(연료) 유물: 불씨 손패 처치 누적(3마다 빛 게이지 +1). */
  fuelKillCount: number
  /** 연마 유물: 칼날 손패 사용 누적(3마다 모든 칼날 피해 영구 +1). 트리플도 1회로 센다. */
  sharpeningUseCount: number
  /** 방화광 유물: 불씨 손패 사용 누적(5마다 필드 전체 피해). */
  pyromaniacUseCount: number
  /** 불타는 허수아비 유물: 처치 없이 쓴 불씨 손패 누적(3마다 불씨 손패 지급). */
  scarecrowNoKillCount: number
  /** 기름병 유물: 이번 턴 사용한 불씨 손패 수(불씨 피해 +N, 턴 갱신 시 0으로). */
  oilBottleTurnUses: number
}

export function makeDefaultEnhancements(): RunEnhancements {
  return { tripleBonus: {}, singleBonus: {}, recipeBonus: {}, scoreMultiplier: 1, bookOfFlamesBonus: 0, blackCandleBonus: 0, shopDiscountPct: 0, luxuryScoreSpent: 0, luxuryBonusAtk: 0, demonDollSelfDamageAccum: 0, demonDollBonusAtk: 0, syringeHpLossAccum: 0, bloodPriceHpLossAccum: 0, bloodPriceBonusAtk: 0, tier1CardBoosts: {}, tier1JobPoolBoosts: {}, inkQuillKillCount: 0, honestyHandUseCount: 0, ambitionKillCount: 0, ambitionCurrentGain: 0, libraryCountdown: 4, bloodWritSelfDamageAccum: 0, coagulationSelfDamageAccum: 0, bloodSigilUseCount: 0, recycleWaxUseCount: 0, trumpShotShardCount: 0, bladeShardUseCount: 0, throwArtBonusAtk: 0, fuelKillCount: 0, sharpeningUseCount: 0, pyromaniacUseCount: 0, scarecrowNoKillCount: 0, oilBottleTurnUses: 0 }
}
