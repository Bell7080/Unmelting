import { afterEach, describe, expect, it, vi } from 'vitest'
import { DropSystem } from './DropSystem'

/**
 * Drop source gating keeps economy cards scarce: 일반 처치/드로우는 기존
 * 공용 풀만 쓰고, 보물상자만 동전을 추가 풀로 섞는다.
 */
describe('DropSystem source pools', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('excludes coin and boss-only cards from normal enemy-kill drops', () => {
    // 풀 순서에 의존하지 않도록 충분히 샘플링해 economy/보스 전용 카드가 새지 않는지 확인한다.
    for (let i = 0; i < 600; i++) {
      const defId = DropSystem.generateDrop('enemy-kill').defId
      expect(defId).not.toBe('coin')
      expect(defId).not.toBe('greed-coin')
    }
  })

  it('allows coin as a treasure-only bonus drop while still hiding boss-only cards', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 600; i++) seen.add(DropSystem.generateDrop('treasure').defId)
    expect(seen.has('coin')).toBe(true)
    expect(seen.has('greed-coin')).toBe(false)
  })
})
