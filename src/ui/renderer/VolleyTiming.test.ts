import { describe, expect, it } from 'vitest'
import { handVolleyIntervalMs, handVolleyReleaseDelayMs } from './VolleyTiming'

describe('hand volley timing contract', () => {
  it('후속 발은 45~75ms이고 발수가 네 배여도 입력 재개 시간이 네 배로 늘지 않는다', () => {
    for (const shots of [2, 3, 6, 12, 30]) {
      expect(handVolleyIntervalMs(shots)).toBeGreaterThanOrEqual(45)
      expect(handVolleyIntervalMs(shots)).toBeLessThanOrEqual(75)
    }
    expect(handVolleyReleaseDelayMs(12)).toBeLessThan(handVolleyReleaseDelayMs(3) * 4)
  })

  it('단발은 잔광 Promise와 무관하게 즉시 입력 재개 계약을 갖는다', () => {
    expect(handVolleyReleaseDelayMs(1)).toBe(0)
  })
})
