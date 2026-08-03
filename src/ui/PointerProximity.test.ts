import { describe, expect, it } from 'vitest'
import { isPointerNearRect, pointerDistanceToRect } from './PointerProximity'

describe('isPointerNearRect', () => {
  it('카드와 가까운 여백은 포함하고 그 바깥은 제외한다', () => {
    // 100~200 사각형에서 40px까지는 에나가 플레이어의 관심 대상으로 인식한다.
    const rect = { left: 100, right: 200, top: 100, bottom: 200 }
    expect(isPointerNearRect(140, 140, rect, 40)).toBe(true)
    expect(isPointerNearRect(60, 140, rect, 40)).toBe(true)
    expect(isPointerNearRect(59, 140, rect, 40)).toBe(false)
    expect(isPointerNearRect(140, 241, rect, 40)).toBe(false)
    // 여러 카드의 근접 여백이 겹치면 실제로 더 가까운 카드를 고를 수 있도록 거리를 제공한다.
    expect(pointerDistanceToRect(210, 140, rect)).toBe(10)
  })
})
