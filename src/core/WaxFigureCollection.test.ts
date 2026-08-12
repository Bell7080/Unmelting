import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  captureWaxFigure,
  mergeWaxFigures,
  loadWaxFigureCollection,
  totalWaxFigureCount,
  waxFigureCapacity,
  grantWaxFigureCapacityBonus,
  waxFigureEffectChance,
  getWaxFigureRunHold,
  resetWaxFigureRunHold,
  stowWaxFigureCatch,
  discardWaxFigureCatch,
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
    resetWaxFigureRunHold()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('등록된 종은 봉인에 성공해 임시보관함에 들어간다(영구함은 아직 그대로)', () => {
    const result = captureWaxFigure('양초 거미', { forceVariant: 'normal' })

    expect(result).not.toBeNull()
    expect(result?.enemyName).toBe('양초 거미')
    expect(result?.variant).toBe('normal')
    expect(getWaxFigureRunHold()).toHaveLength(1)
    expect(totalWaxFigureCount()).toBe(0)
  })

  it('미등록 종은 봉인에 실패한다(콘텐츠 미비 — 조용히 null)', () => {
    expect(captureWaxFigure('없는 적', { forceVariant: 'normal' })).toBeNull()
    expect(getWaxFigureRunHold()).toHaveLength(0)
  })

  it('런 중에는 보관 한도를 넘어도 임시보관함에 계속 쌓인다', () => {
    for (let i = 0; i < WAX_FIGURE_BASE_CAPACITY + 5; i++) {
      expect(captureWaxFigure('양초 거미', { forceVariant: 'normal' })).not.toBeNull()
    }

    expect(getWaxFigureRunHold()).toHaveLength(WAX_FIGURE_BASE_CAPACITY + 5)
  })

  it('정리(stow)해야 영구 밀랍상함에 실제로 담긴다', () => {
    const result = captureWaxFigure('양초 거미', { forceVariant: 'normal' })!

    expect(stowWaxFigureCatch(result.id)).toBe(true)
    expect(totalWaxFigureCount()).toBe(1)
    expect(getWaxFigureRunHold()).toHaveLength(0)
  })

  it('영구 밀랍상함이 가득 차면 정리가 거절되고 임시보관함에 남는다', () => {
    for (let i = 0; i < WAX_FIGURE_BASE_CAPACITY; i++) {
      const r = captureWaxFigure('양초 거미', { forceVariant: 'normal' })!
      expect(stowWaxFigureCatch(r.id)).toBe(true)
    }
    const overflow = captureWaxFigure('양초 거미', { forceVariant: 'normal' })!

    expect(stowWaxFigureCatch(overflow.id)).toBe(false)
    expect(totalWaxFigureCount()).toBe(WAX_FIGURE_BASE_CAPACITY)
    expect(getWaxFigureRunHold()).toHaveLength(1)
  })

  it('런 종료(리셋)를 부르면 정리하지 않은 임시보관함은 전부 사라진다', () => {
    captureWaxFigure('양초 거미', { forceVariant: 'shiny' })
    expect(getWaxFigureRunHold()).toHaveLength(1)

    resetWaxFigureRunHold()

    expect(getWaxFigureRunHold()).toHaveLength(0)
    expect(totalWaxFigureCount()).toBe(0)
  })

  it('임시보관함 항목을 직접 버릴 수도 있다', () => {
    const result = captureWaxFigure('양초 거미', { forceVariant: 'normal' })!

    expect(discardWaxFigureCatch(result.id)).toBe(true)
    expect(getWaxFigureRunHold()).toHaveLength(0)
    expect(discardWaxFigureCatch(result.id)).toBe(false)
  })

  it('무역에서 산 확장분만큼 한도가 늘어난다', () => {
    expect(waxFigureCapacity()).toBe(WAX_FIGURE_BASE_CAPACITY)

    grantWaxFigureCapacityBonus(2)

    expect(waxFigureCapacity()).toBe(WAX_FIGURE_BASE_CAPACITY + 2)
  })

  it(`같은 종+색 ${WAX_FIGURE_MERGE_COUNT}개를 모으면 다음 성급으로 합칠 수 있다`, () => {
    for (let i = 0; i < WAX_FIGURE_MERGE_COUNT; i++) {
      const r = captureWaxFigure('양초 거미', { forceVariant: 'normal' })!
      stowWaxFigureCatch(r.id)
    }

    expect(mergeWaxFigures('양초 거미', 'normal', 1)).toBe(true)

    const state = loadWaxFigureCollection()
    expect(state.counts['양초 거미::normal::1']).toBeUndefined()
    expect(state.counts['양초 거미::normal::2']).toBe(1)
  })

  it('합성 재료가 모자라면 실패하고 아무것도 바뀌지 않는다', () => {
    const r = captureWaxFigure('양초 거미', { forceVariant: 'normal' })!
    stowWaxFigureCatch(r.id)

    expect(mergeWaxFigures('양초 거미', 'normal', 1)).toBe(false)
    expect(totalWaxFigureCount()).toBe(1)
  })

  it('합성은 보관 수를 줄이지 늘리지 않는다(3개 → 1개, 순감소 2)', () => {
    for (let i = 0; i < WAX_FIGURE_MERGE_COUNT; i++) {
      const r = captureWaxFigure('양초 거미', { forceVariant: 'normal' })!
      stowWaxFigureCatch(r.id)
    }
    expect(totalWaxFigureCount()).toBe(WAX_FIGURE_MERGE_COUNT)

    mergeWaxFigures('양초 거미', 'normal', 1)

    expect(totalWaxFigureCount()).toBe(1)
  })

  it('변종(이로치) 강제 지정도 정상 등록되고 정상 색과 별개로 쌓인다', () => {
    const shiny = captureWaxFigure('양초 거미', { forceVariant: 'shiny' })!
    const normal = captureWaxFigure('양초 거미', { forceVariant: 'normal' })!
    stowWaxFigureCatch(shiny.id)
    stowWaxFigureCatch(normal.id)

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
    const r = captureWaxFigure('양초 거미', { forceVariant: 'normal' })!
    stowWaxFigureCatch(r.id)
    grantWaxFigureCapacityBonus(1)

    expect(store.getItem('unmelting.waxfigures.v1')).not.toBeNull()
    expect(store.getItem('unmelting.waxfigures.capacityBonus')).not.toBeNull()
  })
})
