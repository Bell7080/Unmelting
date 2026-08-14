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
  discardWaxFigurePermanent,
  waxFigureEffectStar,
  rollWaxFigureEffect,
  getWaxFigureArchive,
  restoreWaxFigureArchiveEntry,
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

  it('자리가 있으면 봉인은 곧장 영구 밀랍상함에 들어간다', () => {
    const result = captureWaxFigure('양초 거미', { forceVariant: 'normal' })

    expect(result).not.toBeNull()
    expect(result?.enemyName).toBe('양초 거미')
    expect(result?.variant).toBe('normal')
    expect(result?.stowed).toBe(true)
    expect(getWaxFigureRunHold()).toHaveLength(0)
    expect(totalWaxFigureCount()).toBe(1)
  })

  it('미등록 종은 봉인에 실패한다(콘텐츠 미비 — 조용히 null)', () => {
    expect(captureWaxFigure('없는 적', { forceVariant: 'normal' })).toBeNull()
    expect(getWaxFigureRunHold()).toHaveLength(0)
  })

  it('영구 밀랍상함이 가득 차면 그 뒤 봉인만 임시보관함으로 넘친다', () => {
    for (let i = 0; i < WAX_FIGURE_BASE_CAPACITY; i++) {
      const r = captureWaxFigure('양초 거미', { forceVariant: 'normal' })!
      expect(r.stowed).toBe(true)
    }
    expect(totalWaxFigureCount()).toBe(WAX_FIGURE_BASE_CAPACITY)
    expect(getWaxFigureRunHold()).toHaveLength(0)

    const overflow = captureWaxFigure('양초 거미', { forceVariant: 'normal' })!

    expect(overflow.stowed).toBe(false)
    expect(totalWaxFigureCount()).toBe(WAX_FIGURE_BASE_CAPACITY)
    expect(getWaxFigureRunHold()).toHaveLength(1)
  })

  it('정리(stow)하면 임시보관함의 넘친 몫이 영구 밀랍상함으로 옮겨간다', () => {
    for (let i = 0; i < WAX_FIGURE_BASE_CAPACITY; i++) captureWaxFigure('양초 거미', { forceVariant: 'normal' })
    // 여기서 하나를 버려 자리를 만들어야 다음 정리가 성공한다.
    const overflow = captureWaxFigure('양초 거미', { forceVariant: 'normal' })!
    expect(overflow.stowed).toBe(false)
    discardWaxFigureCatch(overflow.id)
    const overflow2 = captureWaxFigure('양초 거미', { forceVariant: 'shiny' })!

    // 영구함이 여전히 가득 차 있으므로 정리는 거절된다.
    expect(stowWaxFigureCatch(overflow2.id)).toBe(false)
    expect(getWaxFigureRunHold()).toHaveLength(1)
  })

  it('런 종료(리셋)를 부르면 정리하지 않은 임시보관함(넘친 몫)은 전부 사라진다', () => {
    for (let i = 0; i < WAX_FIGURE_BASE_CAPACITY; i++) captureWaxFigure('양초 거미', { forceVariant: 'normal' })
    captureWaxFigure('양초 거미', { forceVariant: 'shiny' })
    expect(getWaxFigureRunHold()).toHaveLength(1)

    resetWaxFigureRunHold()

    expect(getWaxFigureRunHold()).toHaveLength(0)
    expect(totalWaxFigureCount()).toBe(WAX_FIGURE_BASE_CAPACITY)
  })

  it('임시보관함(넘친 몫) 항목을 직접 버릴 수도 있다', () => {
    for (let i = 0; i < WAX_FIGURE_BASE_CAPACITY; i++) captureWaxFigure('양초 거미', { forceVariant: 'normal' })
    const overflow = captureWaxFigure('양초 거미', { forceVariant: 'normal' })!

    expect(discardWaxFigureCatch(overflow.id)).toBe(true)
    expect(getWaxFigureRunHold()).toHaveLength(0)
    expect(discardWaxFigureCatch(overflow.id)).toBe(false)
  })

  it('밀랍상함에 담긴 항목도 하나씩 버릴 수 있다(마지막 하나면 항목이 사라진다)', () => {
    captureWaxFigure('양초 거미', { forceVariant: 'normal' })
    captureWaxFigure('양초 거미', { forceVariant: 'normal' })

    expect(discardWaxFigurePermanent('양초 거미', 'normal', 1)).toBe(true)
    expect(totalWaxFigureCount()).toBe(1)

    expect(discardWaxFigurePermanent('양초 거미', 'normal', 1)).toBe(true)
    expect(totalWaxFigureCount()).toBe(0)
    expect(loadWaxFigureCollection().counts['양초 거미::normal::1']).toBeUndefined()

    expect(discardWaxFigurePermanent('양초 거미', 'normal', 1)).toBe(false)
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

  it('보유하지 않은 효과는 성급 0, 확률 0으로 절대 발동하지 않는다', () => {
    expect(waxFigureEffectStar('web-trap-ignore')).toBe(0)
    expect(rollWaxFigureEffect('web-trap-ignore')).toBe(false)
  })

  it('밀랍상함에 담긴 종+색의 성급을 실제 효과 판정 창구가 그대로 읽는다', () => {
    captureWaxFigure('양초 거미', { forceVariant: 'normal' })

    expect(waxFigureEffectStar('web-trap-ignore')).toBe(1)
    vi.spyOn(Math, 'random').mockReturnValue(0) // 항상 확률 안에 들게 강제
    expect(rollWaxFigureEffect('web-trap-ignore')).toBe(true)
  })

  it('합성으로 성급이 오르면 판정 확률도 함께 커진다', () => {
    for (let i = 0; i < WAX_FIGURE_MERGE_COUNT; i++) captureWaxFigure('양초 거미', { forceVariant: 'normal' })
    mergeWaxFigures('양초 거미', 'normal', 1)

    expect(waxFigureEffectStar('web-trap-ignore')).toBe(2)
  })

  describe('밀랍 회고록', () => {
    it('밀랍상함에서 버린 항목은 레이어 1로, 성급 그대로 기록된다', () => {
      for (let i = 0; i < WAX_FIGURE_MERGE_COUNT; i++) captureWaxFigure('양초 거미', { forceVariant: 'normal' })
      mergeWaxFigures('양초 거미', 'normal', 1)
      discardWaxFigurePermanent('양초 거미', 'normal', 2)

      const archive = getWaxFigureArchive()
      expect(archive).toHaveLength(1)
      expect(archive[0]).toMatchObject({ enemyName: '양초 거미', variant: 'normal', star: 2, layer: 1 })
    })

    it('임시보관함에서 직접 버린 항목은 레이어 2로, 항상 ★1로 기록된다', () => {
      for (let i = 0; i < WAX_FIGURE_BASE_CAPACITY; i++) captureWaxFigure('양초 거미', { forceVariant: 'normal' })
      const overflow = captureWaxFigure('양초 거미', { forceVariant: 'shiny' })!

      discardWaxFigureCatch(overflow.id)

      const archive = getWaxFigureArchive()
      expect(archive).toHaveLength(1)
      expect(archive[0]).toMatchObject({ enemyName: '양초 거미', variant: 'shiny', star: 1, layer: 2 })
    })

    it('정리 안 하고 런이 끝나 임시보관함이 비워지면 그 항목도 레이어 2로 남는다', () => {
      for (let i = 0; i < WAX_FIGURE_BASE_CAPACITY; i++) captureWaxFigure('양초 거미', { forceVariant: 'normal' })
      captureWaxFigure('양초 키틴벌레', { forceVariant: 'normal' })

      resetWaxFigureRunHold()

      const archive = getWaxFigureArchive()
      expect(archive).toHaveLength(1)
      expect(archive[0]).toMatchObject({ enemyName: '양초 키틴벌레', variant: 'normal', star: 1, layer: 2 })
      expect(getWaxFigureRunHold()).toHaveLength(0)
    })

    it('최신 항목이 맨 앞에 온다', () => {
      discardWaxFigurePermanent('양초 거미', 'normal', 1) // 존재하지 않아 실패 — 기록 없음
      captureWaxFigure('양초 거미', { forceVariant: 'normal' })
      captureWaxFigure('양초 키틴벌레', { forceVariant: 'normal' })
      discardWaxFigurePermanent('양초 거미', 'normal', 1)
      discardWaxFigurePermanent('양초 키틴벌레', 'normal', 1)

      const archive = getWaxFigureArchive()
      expect(archive.map((e) => e.enemyName)).toEqual(['양초 키틴벌레', '양초 거미'])
    })

    it('자리가 있으면 회고록 항목을 밀랍상함으로 되돌릴 수 있다', () => {
      captureWaxFigure('양초 거미', { forceVariant: 'normal' })
      discardWaxFigurePermanent('양초 거미', 'normal', 1)
      const entryId = getWaxFigureArchive()[0].id

      expect(restoreWaxFigureArchiveEntry(entryId)).toBe(true)
      expect(totalWaxFigureCount()).toBe(1)
      expect(getWaxFigureArchive()).toHaveLength(0)
    })

    it('밀랍상함이 가득 차 있으면 복구가 실패하고 회고록에 그대로 남는다', () => {
      captureWaxFigure('양초 거미', { forceVariant: 'normal' })
      discardWaxFigurePermanent('양초 거미', 'normal', 1)
      const entryId = getWaxFigureArchive()[0].id
      for (let i = 0; i < WAX_FIGURE_BASE_CAPACITY; i++) captureWaxFigure('양초 키틴벌레', { forceVariant: 'normal' })

      expect(restoreWaxFigureArchiveEntry(entryId)).toBe(false)
      expect(getWaxFigureArchive()).toHaveLength(1)
    })

    it('존재하지 않는 항목 복구는 조용히 실패한다', () => {
      expect(restoreWaxFigureArchiveEntry('arc-없음')).toBe(false)
    })
  })

  describe('임시보관함은 효과를 발동하지 않는다', () => {
    it('한도를 넘겨 임시보관함으로 흘러간 밀랍상은 효과 성급이 0이다', () => {
      // 밀랍상함을 다른 종으로 가득 채운 뒤 거미를 잡으면 거미는 임시보관함으로 간다.
      for (let i = 0; i < WAX_FIGURE_BASE_CAPACITY; i++) captureWaxFigure('양초 키틴벌레', { forceVariant: 'normal' })
      const spilled = captureWaxFigure('양초 거미', { forceVariant: 'normal' })

      expect(spilled?.stowed).toBe(false)
      expect(getWaxFigureRunHold()).toHaveLength(1)
      // 임시보관함은 "아직 내 것이 아닌" 자리다 — 정리해 넣기 전에는 효과가 붙지 않는다.
      expect(waxFigureEffectStar('web-trap-ignore')).toBe(0)
      expect(rollWaxFigureEffect('web-trap-ignore')).toBe(false)
    })

    it('임시보관함에서 밀랍상함으로 옮기면 그때부터 효과가 붙는다', () => {
      for (let i = 0; i < WAX_FIGURE_BASE_CAPACITY; i++) captureWaxFigure('양초 키틴벌레', { forceVariant: 'normal' })
      captureWaxFigure('양초 거미', { forceVariant: 'normal' })
      expect(waxFigureEffectStar('web-trap-ignore')).toBe(0)

      // 자리를 하나 비우고 옮기면 영구 보유가 되어 효과가 산다.
      discardWaxFigurePermanent('양초 키틴벌레', 'normal', 1)
      expect(stowWaxFigureCatch(getWaxFigureRunHold()[0].id)).toBe(true)

      expect(waxFigureEffectStar('web-trap-ignore')).toBe(1)
    })

    it('런이 끝나 임시보관함이 비워져도 영구 보유분의 효과는 그대로다', () => {
      captureWaxFigure('양초 거미', { forceVariant: 'normal' })
      for (let i = 0; i < WAX_FIGURE_BASE_CAPACITY; i++) captureWaxFigure('양초 키틴벌레', { forceVariant: 'normal' })
      expect(getWaxFigureRunHold().length).toBeGreaterThan(0)

      resetWaxFigureRunHold()

      expect(getWaxFigureRunHold()).toHaveLength(0)
      expect(waxFigureEffectStar('web-trap-ignore')).toBe(1)
    })
  })
})
