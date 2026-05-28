/**
 * 상점/제단/팩 등에서 공유하는 랜덤 샘플링 유틸.
 * 희귀도 가중치는 common~legendary 공용 팔레트 비율을 따른다.
 */

import { CardRarity } from '@data/ShopPools'

export const RARITY_DRAW_WEIGHTS: Record<CardRarity, number> = {
  common: 5,
  rare: 3,
  epic: 2,
  unique: 1,
  legendary: 1,
}

/**
 * 희귀도 가중 비복원 추출. 각 항목을 가중치만큼 복제한 풀을 셔플한 뒤
 * 앞에서부터 고유 참조를 n개 채워 반환한다. 가중치가 높을수록 첫 픽에 등장할 확률이 커진다.
 */
export function sampleWeightedWithoutReplacement<T extends { rarity: CardRarity; weight?: number }>(
  pool: T[],
  n: number
): T[] {
  const weighted = pool.flatMap((item) =>
    // weight 직접 지정 시 우선 사용, 없으면 등급 공통 테이블로 폴백
    Array.from({ length: item.weight ?? RARITY_DRAW_WEIGHTS[item.rarity] ?? 1 }, () => item)
  )
  for (let i = weighted.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[weighted[i], weighted[j]] = [weighted[j], weighted[i]]
  }
  const seen = new Set<T>()
  const out: T[] = []
  for (const item of weighted) {
    if (!seen.has(item)) {
      seen.add(item)
      out.push(item)
    }
    if (out.length >= n) break
  }
  return out
}

/** 가중치 없이 풀에서 최대 n개를 비복원으로 뽑아 반환한다. */
export function sampleWithoutReplacement<T>(pool: T[], n: number): T[] {
  const copy = pool.slice()
  const out: T[] = []
  while (copy.length > 0 && out.length < n) {
    const idx = Math.floor(Math.random() * copy.length)
    out.push(copy.splice(idx, 1)[0])
  }
  return out
}
