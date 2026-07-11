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

/** 순수 2단계 추첨(drawIdFromPool)은 RL 시뮬이 실게임과 같은 확률 구조를 쓰는 통로다. */
describe('DropSystem.drawIdFromPool', () => {
  it('허용 풀에 든 카드만 반환한다(잠금/밴 카드는 절대 새지 않음)', () => {
    const pool = ['ember', 'candle', 'match'] as const
    for (let i = 0; i < 300; i++) {
      const id = DropSystem.drawIdFromPool(pool, 'enemy-kill', {}, {})
      expect(pool).toContain(id)
    }
  })

  it('풀이 1장이면 그 카드가 확정 반환된다', () => {
    expect(DropSystem.drawIdFromPool(['ember'], 'enemy-kill', {}, {}, () => 0.5)).toBe('ember')
  })

  it('확률팩 T1 개별 카드 부스트가 해당 카드 당첨 비중을 지배적으로 키운다', () => {
    let boosted = 0
    for (let i = 0; i < 400; i++) {
      const id = DropSystem.drawIdFromPool(['ember', 'candle', 'wax-drop'], 'enemy-kill', { ember: 100000 }, {})
      if (id === 'ember') boosted++
    }
    expect(boosted).toBeGreaterThan(390)
  })

  it('주입된 rng만 사용해 결정론적으로 재현된다', () => {
    const seq = [0.1, 0.7, 0.3]
    const makeRng = () => { let i = 0; return () => seq[i++ % seq.length] }
    const a = DropSystem.drawIdFromPool(['ember', 'candle', 'match', 'key'], 'enemy-kill', {}, {}, makeRng())
    const b = DropSystem.drawIdFromPool(['ember', 'candle', 'match', 'key'], 'enemy-kill', {}, {}, makeRng())
    expect(a).toBe(b)
  })
})
