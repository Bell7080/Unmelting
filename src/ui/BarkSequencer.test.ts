import { describe, expect, it } from 'vitest'
import { BarkSequencer, barkMinExposureMs, BARK_QUEUE_MAX } from './BarkSequencer'

/** index.ts BARK_IMPORTANCE와 같은 눈금(테스트 가독용). */
const IMPORTANCE = { loot: 0, touch: 1, situation: 2 } as const

describe('barkMinExposureMs (최소 노출 시간)', () => {
  it('대사 길이에 비례하되 1.5~3초로 클램프된다', () => {
    expect(barkMinExposureMs('짧다')).toBe(1500)
    const mid = barkMinExposureMs('열다섯 글자쯤 되는 보통 대사야!')
    expect(mid).toBeGreaterThan(1500)
    expect(mid).toBeLessThan(3000)
    expect(barkMinExposureMs('아주 길고 긴 대사 '.repeat(10))).toBe(3000)
  })
})

describe('BarkSequencer (바크 순차 출력 큐)', () => {
  it('시작 인사 직후 도착한 회상은 교체되지 않고 큐에서 최소 노출 후 이어진다', () => {
    let t = 0
    const seq = new BarkSequencer<string>(() => t)
    // 1) 직업 선택 인사 표시 — 아무것도 안 떠 있으므로 즉시.
    expect(seq.busy(false)).toBe(false)
    seq.noteDisplayed('촛불지기라니, 든든한걸!')
    // 2) 곧바로 새 런 회상 도착 — 인사가 표시 중이라 큐잉된다.
    expect(seq.busy(true)).toBe(true)
    seq.enqueue({ line: '지난번엔 34층에서 멈췄지. 이번엔 더 가 보자.', importance: IMPORTANCE.situation, situation: null })
    // 3) 인사의 최소 노출(1.5초 이상)이 지나기 전에는 드레인 불가.
    expect(seq.nextDelayMs()).toBeGreaterThanOrEqual(1500)
    t += 100
    expect(seq.nextDelayMs()).toBeGreaterThan(0)
    // 4) 최소 노출이 지나면 회상이 순서대로 나온다.
    t += seq.nextDelayMs()
    expect(seq.nextDelayMs()).toBe(0)
    const next = seq.shift()
    expect(next?.line).toContain('지난번')
    seq.noteDisplayed(next!.line)
    expect(seq.pending).toBe(0)
  })

  it('표시 중 바크가 최소 노출을 이미 채웠으면 busy가 아니다(즉시 교체 허용)', () => {
    let t = 0
    const seq = new BarkSequencer<string>(() => t)
    seq.noteDisplayed('먼저 나온 대사')
    t += barkMinExposureMs('먼저 나온 대사') + 1
    expect(seq.busy(true)).toBe(false)
  })

  it('버블이 떠 있지 않으면 노출 시간과 무관하게 busy가 아니다', () => {
    const seq = new BarkSequencer<string>(() => 0)
    seq.noteDisplayed('먼저 나온 대사')
    expect(seq.busy(false)).toBe(false)
  })

  it('큐가 남아 있으면 새 바크도 큐를 타 도착 순서를 지킨다', () => {
    let t = 0
    const seq = new BarkSequencer<string>(() => t)
    seq.noteDisplayed('첫 대사')
    seq.enqueue({ line: '둘째', importance: IMPORTANCE.situation, situation: null })
    // 노출 시간이 지나도 대기열이 있으면 새 바크는 그 뒤로 줄을 선다.
    t += 10000
    expect(seq.busy(true)).toBe(true)
    seq.enqueue({ line: '셋째', importance: IMPORTANCE.situation, situation: null })
    expect(seq.shift()?.line).toBe('둘째')
    expect(seq.shift()?.line).toBe('셋째')
  })

  it('상한 초과 시 중요도 낮은 것부터(동률이면 오래된 것) 드롭한다', () => {
    const seq = new BarkSequencer<string>(() => 0)
    seq.noteDisplayed('표시 중')
    seq.enqueue({ line: '상황1', importance: IMPORTANCE.situation, situation: null })
    seq.enqueue({ line: '한줄평', importance: IMPORTANCE.loot, situation: null })
    seq.enqueue({ line: '상황2', importance: IMPORTANCE.situation, situation: null })
    expect(seq.pending).toBe(BARK_QUEUE_MAX)
    // 4번째가 들어오면 중요도 최하(한줄평)가 밀려난다.
    const dropped = seq.enqueue({ line: '터치 반응', importance: IMPORTANCE.touch, situation: null })
    expect(dropped?.line).toBe('한줄평')
    expect(seq.pending).toBe(BARK_QUEUE_MAX)
    // 동률(터치 vs 터치)에서는 오래된 쪽이 먼저 밀려난다.
    const dropped2 = seq.enqueue({ line: '터치 반응2', importance: IMPORTANCE.touch, situation: null })
    expect(dropped2?.line).toBe('터치 반응')
  })

  it('clear는 대기열을 비워 새 런 시작 시 잔여 바크가 새지 않게 한다', () => {
    const seq = new BarkSequencer<string>(() => 0)
    seq.noteDisplayed('표시 중')
    seq.enqueue({ line: '남은 대사', importance: IMPORTANCE.situation, situation: null })
    seq.clear()
    expect(seq.pending).toBe(0)
    expect(seq.shift()).toBeUndefined()
  })
})
