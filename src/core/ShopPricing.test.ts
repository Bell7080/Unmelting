import { describe, expect, it } from 'vitest'
import { altarPackBaseCost, packCostWithRepeats, regularShopPackBaseCost, difficultyPriceScale, SPROUT_SHOP_PRICE_SCALE } from './ShopPricing'

describe('ShopPricing', () => {
  it('일반 상점 3팩 시작가: 10층 120에서 10층마다 +40, 최저 120 보장', () => {
    expect(regularShopPackBaseCost(0)).toBe(120)
    expect(regularShopPackBaseCost(10)).toBe(120)
    expect(regularShopPackBaseCost(20)).toBe(160)
    expect(regularShopPackBaseCost(40)).toBe(240)
  })

  it('제단 팩 층별 시작가: 30F 500 · 60F 1500 · 90F 이상 2500', () => {
    expect(altarPackBaseCost(30)).toBe(500)
    expect(altarPackBaseCost(59)).toBe(500)
    expect(altarPackBaseCost(60)).toBe(1500)
    expect(altarPackBaseCost(90)).toBe(2500)
    expect(altarPackBaseCost(95)).toBe(2500)
  })

  it('방문 내 반복 구매 누적가: 구매마다 시작가만큼 증가', () => {
    expect(packCostWithRepeats(500, 0)).toBe(500)
    expect(packCostWithRepeats(500, 1)).toBe(1000)
    expect(packCostWithRepeats(500, 2)).toBe(1500)
    expect(packCostWithRepeats(120, 3)).toBe(480)
  })
})

describe('난이도 물가 배수 — 새싹 병아리 절반값', () => {
  it('새싹은 절반, 정규는 그대로', () => {
    expect(difficultyPriceScale(true)).toBe(SPROUT_SHOP_PRICE_SCALE)
    expect(difficultyPriceScale(true)).toBe(0.5)
    expect(difficultyPriceScale(false)).toBe(1)
  })

  it('★ 할인(shopDiscountPct)과 별도 축이라 곱해서 함께 걸린다', () => {
    // 직업 선택이 enhancements.shopDiscountPct를 대입(=)으로 덮으므로 거기 얹으면
    // 난이도 보정이 조용히 사라진다. 두 축을 곱으로 합치는 것이 이 계약이다.
    const base = regularShopPackBaseCost(10)
    const jobDiscount = 1 - 0.2 // 직업 할인 20%
    const sprout = difficultyPriceScale(true)

    expect(Math.round(base * jobDiscount * sprout)).toBe(Math.round(120 * 0.8 * 0.5))
  })
})
