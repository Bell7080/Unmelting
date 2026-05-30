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

  it('excludes coin from normal enemy-kill drops even on the highest roll', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999)

    const drop = DropSystem.generateDrop('enemy-kill')

    expect(drop.defId).not.toBe('coin')
  })

  it('allows coin as a treasure-only bonus drop', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999)

    const drop = DropSystem.generateDrop('treasure')

    expect(drop.defId).toBe('coin')
  })
})
