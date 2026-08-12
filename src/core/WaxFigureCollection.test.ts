import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  captureWaxFigure,
  mergeWaxFigures,
  loadWaxFigureCollection,
  totalWaxFigureCount,
  waxFigureCapacity,
  grantWaxFigureCapacityBonus,
  waxFigureEffectChance,
  WAX_FIGURE_BASE_CAPACITY,
  WAX_FIGURE_MERGE_COUNT,
} from './WaxFigureCollection'

/** 메모리 저장소 — MetaWallet.test.ts와 같은 패턴(globalThis.localStorage 갈아 끼우기). */
class MemoryStorage {
  private map = new Map<string, string>()
  getItem(key: string): string | null { return this.map.get(key) ?? null }
  setItem(key: string, value: string): void { this.map.set(key, value) }
  removeItem(key: string): void { this.map.delete(key) }
}

describe('WaxFigureCollection', () => {
  let store: MemoryStorage

  beforeEach(() => {
    store = new MemoryStorage()
    ;(globalThis as { localStorage?: unknown }).localStorage = store
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('등록된 종은 봉인에 성공해 1성으로 들어간다', () => {
    const result = captureWaxFigure('양초 거미', { forceVariant: 'normal' })

    expect(result).not.toBeNull()
    expect(result?.enemyName).toBe('양초 거미')
    expect(result?.variant).toBe('normal')
    expect(totalWaxFigureCount()).toBe(1)
  })

  it('미등록 종은 봉인에 실패한다(콘텐츠 미비 — 조용히 null)', () => {
    expect(captureWaxFigure('없는 적', { forceVariant: 'normal' })).toBeNull()
    expect(totalWaxFigureCount()).toBe(0)
  })

  it('보관 한도에 닿으면 더 봉인되지 않는다', () => {
    for (let i = 0; i < WAX_FIGURE_BASE_CAPACITY; i++) {
      expect(captureWaxFigure('양초 거미', { forceVariant: 'normal' })).not.toBeNull()
    }
    expect(totalWaxFigureCount()).toBe(WAX_FIGURE_BASE_CAPACITY)

    expect(captureWaxFigure('양초 거미', { forceVariant: 'normal' })).toBeNull()
    expect(totalWaxFigureCount()).toBe(WAX_FIGURE_BASE_CAPACITY)
  })

  it('무역에서 산 확장분만큼 한도가 늘어난다', () => {
    expect(waxFigureCapacity()).toBe(WAX_FIGURE_BASE_CAPACITY)

    grantWaxFigureCapacityBonus(2)

    expect(waxFigureCapacity()).toBe(WAX_FIGURE_BASE_CAPACITY + 2)
  })

  it(`같은 종+색 ${WAX_FIGURE_MERGE_COUNT}개를 모으면 다음 성급으로 합칠 수 있다`, () => {
    for (let i = 0; i < WAX_FIGURE_MERGE_COUNT; i++) captureWaxFigure('양초 거미', { forceVariant: 'normal' })

    expect(mergeWaxFigures('양초 거미', 'normal', 1)).toBe(true)

    const state = loadWaxFigureCollection()
    expect(state.counts['양초 거미::normal::1']).toBeUndefined()
    expect(state.counts['양초 거미::normal::2']).toBe(1)
  })

  it('합성 재료가 모자라면 실패하고 아무것도 바뀌지 않는다', () => {
    captureWaxFigure('양초 거미', { forceVariant: 'normal' })

    expect(mergeWaxFigures('양초 거미', 'normal', 1)).toBe(false)
    expect(totalWaxFigureCount()).toBe(1)
  })

  it('합성은 보관 수를 줄이지 늘리지 않는다(3개 → 1개, 순감소 2)', () => {
    for (let i = 0; i < WAX_FIGURE_MERGE_COUNT; i++) captureWaxFigure('양초 거미', { forceVariant: 'normal' })
    expect(totalWaxFigureCount()).toBe(WAX_FIGURE_MERGE_COUNT)

    mergeWaxFigures('양초 거미', 'normal', 1)

    expect(totalWaxFigureCount()).toBe(1)
  })

  it('변종(이로치) 강제 지정도 정상 등록되고 정상 색과 별개로 쌓인다', () => {
    captureWaxFigure('양초 거미', { forceVariant: 'shiny' })
    captureWaxFigure('양초 거미', { forceVariant: 'normal' })

    const state = loadWaxFigureCollection()
    expect(state.counts['양초 거미::shiny::1']).toBe(1)
    expect(state.counts['양초 거미::normal::1']).toBe(1)
  })

  it('확률식은 성급이 오를수록 커지되 상한을 절대 넘지 않는다(수렴형)', () => {
    const cap = 0.5
    const chances = [1, 2, 3, 5, 10, 50].map((star) => waxFigureEffectChance(star, cap))

    for (let i = 1; i < chances.length; i++) expect(chances[i]).toBeGreaterThan(chances[i - 1])
    for (const c of chances) expect(c).toBeLessThan(cap)
    // 성급을 아무리 올려도(50성) 상한에 한참 못 미친다 — "100마리 모아도 100% 안 됨"의 취지.
    expect(chances[chances.length - 1]).toBeGreaterThan(cap * 0.99)
  })

  it('저장값이 손상되면 빈 컬렉션으로 취급한다', () => {
    store.setItem('unmelting.waxfigures.v1', '{broken json')

    expect(totalWaxFigureCount()).toBe(0)
  })

  it('/리셋이 지울 수 있게 unmelting. 접두사 키에 저장한다', () => {
    captureWaxFigure('양초 거미', { forceVariant: 'normal' })
    grantWaxFigureCapacityBonus(1)

    expect(store.getItem('unmelting.waxfigures.v1')).not.toBeNull()
    expect(store.getItem('unmelting.waxfigures.capacityBonus')).not.toBeNull()
  })
})
