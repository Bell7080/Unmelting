import { describe, expect, it } from 'vitest'
import {
  ACTIVE_HAND_ANIMATION_SPEED,
  COMBO_TRIGGER_DELAY_MS,
  GAUGE_TRIGGER_DELAY_MS,
  handAnimationMs,
} from './Timing'

describe('손패 연출 속도 프리셋', () => {
  it('매우 빠름·빠름·보통·느림을 보통 기준의 일관된 비율로 변환한다', () => {
    expect(handAnimationMs(1000, 'very-fast')).toBe(650)
    expect(handAnimationMs(1000, 'fast')).toBe(800)
    expect(handAnimationMs(1000, 'normal')).toBe(1000)
    expect(handAnimationMs(1000, 'slow')).toBe(1250)
  })

  it('현재 기본값은 빠름이며 콤보와 게이지 비트에 함께 적용된다', () => {
    expect(ACTIVE_HAND_ANIMATION_SPEED).toBe('fast')
    expect(COMBO_TRIGGER_DELAY_MS).toBe(352)
    expect(GAUGE_TRIGGER_DELAY_MS).toBe(352)
  })
})
