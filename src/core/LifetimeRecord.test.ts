import { describe, it, expect } from 'vitest'
import { LifetimeRecordStore, emptyLifetimeRecord, type LifetimeStorage } from './LifetimeRecord'

/** 테스트용 인메모리 storage — setItem/getItem/removeItem 계약만 만족한다. */
function makeMemoryStorage(): LifetimeStorage {
  const map = new Map<string, string>()
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  }
}

describe('LifetimeRecordStore', () => {
  it('빈 저장본은 0 기록으로 로드된다', () => {
    const store = new LifetimeRecordStore(makeMemoryStorage())
    expect(store.load()).toEqual(emptyLifetimeRecord())
  })

  it('여러 런을 누적하고 최고 층은 단조 증가한다', () => {
    const store = new LifetimeRecordStore(makeMemoryStorage())
    store.recordRun({ outcome: 'death', floor: 17, kills: 23, traps: 8, treasures: 5, light: 4120 })
    const rec = store.recordRun({ outcome: 'clear', floor: 30, kills: 40, traps: 10, treasures: 7, light: 9000 })
    expect(rec.totalRuns).toBe(2)
    expect(rec.clears).toBe(1)
    expect(rec.deaths).toBe(1)
    expect(rec.bestFloor).toBe(30)
    expect(rec.totalKills).toBe(63)
    expect(rec.totalTraps).toBe(18)
    expect(rec.totalTreasures).toBe(12)
    expect(rec.totalLight).toBe(13120)
  })

  it('낮은 층 런이 뒤에 와도 최고 층을 낮추지 않는다', () => {
    const store = new LifetimeRecordStore(makeMemoryStorage())
    store.recordRun({ outcome: 'clear', floor: 30, kills: 1, traps: 0, treasures: 0, light: 0 })
    const rec = store.recordRun({ outcome: 'death', floor: 5, kills: 1, traps: 0, treasures: 0, light: 0 })
    expect(rec.bestFloor).toBe(30)
  })

  it('음수/NaN 입력은 0으로 정규화된다', () => {
    const store = new LifetimeRecordStore(makeMemoryStorage())
    const rec = store.recordRun({ outcome: 'death', floor: -3, kills: NaN, traps: -1, treasures: 2, light: 100 })
    expect(rec.bestFloor).toBe(0)
    expect(rec.totalKills).toBe(0)
    expect(rec.totalTraps).toBe(0)
    expect(rec.totalTreasures).toBe(2)
    expect(rec.totalLight).toBe(100)
  })

  it('손상된 저장본은 조용히 빈 기록으로 회복된다', () => {
    const storage = makeMemoryStorage()
    storage.setItem('unmelting.lifetime.v1', '{not json')
    const store = new LifetimeRecordStore(storage)
    expect(store.load()).toEqual(emptyLifetimeRecord())
  })

  it('저장본은 세션 간 복원된다(같은 storage 재부착)', () => {
    const storage = makeMemoryStorage()
    new LifetimeRecordStore(storage).recordRun({ outcome: 'clear', floor: 30, kills: 5, traps: 2, treasures: 1, light: 500 })
    const reopened = new LifetimeRecordStore(storage).load()
    expect(reopened.totalRuns).toBe(1)
    expect(reopened.bestFloor).toBe(30)
  })

  it('storage 없이도 세션 내 누적은 유지된다', () => {
    const store = new LifetimeRecordStore()
    store.recordRun({ outcome: 'death', floor: 10, kills: 3, traps: 1, treasures: 0, light: 50 })
    const rec = store.recordRun({ outcome: 'death', floor: 12, kills: 2, traps: 0, treasures: 1, light: 60 })
    expect(rec.totalRuns).toBe(2)
    expect(rec.bestFloor).toBe(12)
    expect(rec.totalKills).toBe(5)
  })

  it('clear()는 통산값을 0으로 되돌린다', () => {
    const storage = makeMemoryStorage()
    const store = new LifetimeRecordStore(storage)
    store.recordRun({ outcome: 'clear', floor: 30, kills: 5, traps: 2, treasures: 1, light: 500 })
    store.clear()
    expect(store.load()).toEqual(emptyLifetimeRecord())
  })
})
