import { describe, expect, it, vi } from 'vitest'
import { HandActionTimeline, type HandActionSnapshot } from './HandActionTimeline'

/** 테스트용 빈 판정도 실제 공개 스냅샷 계약을 그대로 지킨다. */
const snapshot = (): HandActionSnapshot => ({
  targetRects: Object.freeze({}), damage: Object.freeze([]), removedCardIds: Object.freeze([]),
  resourceChanges: Object.freeze({}), bossCellHits: Object.freeze([]),
})

describe('HandActionTimeline', () => {
  it('판정은 동기 순서, 핵심은 직렬, 후속은 다음 핵심과 병렬로 허용한다', async () => {
    const events: string[] = []
    let releaseFollowUp!: () => void
    const followUpGate = new Promise<void>((resolve) => { releaseFollowUp = resolve })
    const timeline = new HandActionTimeline(() => 1000, async () => undefined, 0)
    const first = timeline.register({
      commit: () => { events.push('commit-1'); return snapshot() },
      playCoreImpact: async () => { events.push('core-1') },
      playFollowUp: async () => { events.push('follow-1'); await followUpGate },
    })
    const second = timeline.register({
      commit: () => { events.push('commit-2'); return snapshot() },
      playCoreImpact: async () => { events.push('core-2') },
    })
    await second.coreDone
    expect(events).toEqual(['commit-1', 'commit-2', 'core-1', 'follow-1', 'core-2'])
    releaseFollowUp()
    await Promise.all([first.settled, second.settled])
  })

  it('취소하면 대기 DOM 단계를 건너뛰고 정리를 수행한다', async () => {
    const core = vi.fn(async () => undefined)
    const cleanup = vi.fn()
    const timeline = new HandActionTimeline(() => 0, async () => undefined, 0)
    const handle = timeline.register({ commit: snapshot, playCoreImpact: core, cleanup })
    handle.cancel()
    await handle.settled
    expect(core).not.toHaveBeenCalled()
    expect(cleanup).toHaveBeenCalledOnce()
    expect(cleanup).toHaveBeenCalledWith(handle.actionId)
  })

  it('핵심 시작 간격을 지키고 안정화는 실제 규칙 순서로 직렬화한다', async () => {
    let clock = 0
    const sleeps: number[] = []
    const stable: string[] = []
    const timeline = new HandActionTimeline(
      () => clock,
      async (ms) => { sleeps.push(ms); clock += ms },
      150
    )
    const makeWork = (label: string) => ({
      commit: snapshot,
      playCoreImpact: async () => undefined,
      stabilize: async () => { stable.push(label) },
    })
    const first = timeline.register(makeWork('first'))
    const second = timeline.register(makeWork('second'))
    await Promise.all([first.settled, second.settled])
    expect(sleeps).toEqual([150])
    expect(stable).toEqual(['first', 'second'])
  })
})
