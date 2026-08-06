import { describe, it, expect, beforeEach } from 'vitest'
import { loadMetaCurrency, saveMetaCurrency, depositMetaCurrency, spendMetaCurrency } from './MetaWallet'

/** 메모리 저장소 — 지갑이 globalThis.localStorage를 경유하므로 그대로 갈아 끼운다. */
class MemoryStorage {
  private map = new Map<string, string>()
  getItem(key: string): string | null { return this.map.get(key) ?? null }
  setItem(key: string, value: string): void { this.map.set(key, value) }
  raw(key: string): string | null { return this.getItem(key) }
}

describe('MetaWallet', () => {
  let store: MemoryStorage

  beforeEach(() => {
    store = new MemoryStorage()
    ;(globalThis as { localStorage?: unknown }).localStorage = store
  })

  it('런이 남긴 화폐를 저축하고 다음 부팅에서 그대로 읽는다', () => {
    expect(loadMetaCurrency()).toBe(0)
    depositMetaCurrency(7)
    depositMetaCurrency(5)

    expect(loadMetaCurrency()).toBe(12)
  })

  it('/리셋이 지울 수 있게 unmelting. 접두사 키에 저장한다', () => {
    saveMetaCurrency(4)

    expect(store.raw('unmelting.meta.currency.v1')).toBe('4')
  })

  it('잔액이 모자라면 한 푼도 깎지 않고 거절한다', () => {
    depositMetaCurrency(2)

    expect(spendMetaCurrency(3)).toBe(false)
    expect(loadMetaCurrency()).toBe(2)
  })

  it('결제가 성사되면 그만큼만 줄어든다', () => {
    depositMetaCurrency(10)

    expect(spendMetaCurrency(3)).toBe(true)
    expect(loadMetaCurrency()).toBe(7)
  })

  it('손상된 저장값과 음수 입금은 0으로 다룬다', () => {
    store.setItem('unmelting.meta.currency.v1', 'broken')
    expect(loadMetaCurrency()).toBe(0)

    depositMetaCurrency(-5)
    expect(loadMetaCurrency()).toBe(0)
  })
})
