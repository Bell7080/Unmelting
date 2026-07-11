import { describe, expect, it } from 'vitest'
import { altarPackBaseCost, packCostWithRepeats, regularShopPackBaseCost } from './ShopPricing'

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
