import { describe, expect, it, vi, beforeEach } from 'vitest'

/**
 * Howl 대역. 실제 오디오 대신 **언제 인스턴스가 만들어지고 언제 play()가 불렸는가**만 본다 —
 * 이 파일이 지키는 것은 소리가 아니라 그 두 시점이다.
 */
const created: string[] = []
const plays: string[] = []
/** 재생 순서를 그대로 기록한다 — fade가 play보다 먼저/사이에 끼면 여기서 드러난다. */
const calls: string[] = []

class FakeHowl {
  private readonly url: string
  /** once('play')로 등록된 콜백. 실제 Howler처럼 재생이 시작된 뒤에만 불러 준다. */
  private playHandlers: (() => void)[] = []

  constructor(config: { src: string[] }) {
    this.url = config.src[0]
    created.push(this.url)
  }

  state(): string { return 'loaded' }
  play(): number { plays.push(this.url); calls.push('play'); return 1 }
  volume(): void { calls.push('volume') }
  fade(): void { calls.push('fade') }
  // 0을 돌려주면 크로스페이드 예약이 타이머를 걸지 않고 빠져나간다.
  duration(): number { return 0 }
  once(event: string, fn: () => void): void {
    calls.push(`once:${event}`)
    if (event === 'play') this.playHandlers.push(fn)
  }
  /** html5 스트림의 비동기 play()가 실제로 시작되는 순간을 흉내 낸다. */
  emitPlay(): void { this.playHandlers.splice(0).forEach((fn) => fn()) }
  off(): void {}
  load(): void {}
  stop(): void {}
  unload(): void {}

  static last: FakeHowl | null = null
}

vi.mock('howler', () => ({ Howl: FakeHowl }))

/** window 대역 — 어떤 이벤트를 어느 단계로 듣는지 기록한다. */
interface Listener { type: string; capture: unknown }
const listeners: Listener[] = []

beforeEach(() => {
  created.length = 0
  plays.length = 0
  calls.length = 0
  listeners.length = 0
  ;(globalThis as { window?: unknown }).window = {
    addEventListener: (type: string, _fn: unknown, capture?: unknown) => {
      listeners.push({ type, capture })
    },
    removeEventListener: () => {},
    setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
    clearTimeout: (id: number) => clearTimeout(id),
  }
})

const { BgmManager } = await import('./BgmManager')

describe('BgmManager 자동재생 언락', () => {
  it('★ 사용자 입력 전에는 Howl을 하나도 만들지 않는다', () => {
    // Howler의 html5 오디오 풀은 **첫 사용자 입력에** 채워진다. 그 전에 Howl을 만들면
    // 빈 풀에서 잠긴 노드를 받아, 나중에 play()를 불러도 조용히 아무 일도 안 한다.
    // 에러도 안 나고 화면도 멀쩡해서 원인이 어디에도 안 보이는 종류의 고장이다.
    const bgm = new BgmManager(['track-a.mp3'])
    bgm.armAutoplay()

    expect(created).toEqual([])
  })

  it('★ 언락 리스너는 버블 단계로, Howler가 쓰는 이벤트에 건다', () => {
    // window 캡처는 Howler가 언락을 걸어 둔 document 캡처보다 **먼저** 돈다.
    // 캡처로 잡으면 언락 전에 Howl을 만들어 위와 같은 함정에 빠진다.
    const bgm = new BgmManager(['track-a.mp3'])
    bgm.armAutoplay()

    expect(listeners.map((l) => l.type).sort()).toEqual(['click', 'keydown', 'touchend'])
    for (const l of listeners) expect(l.capture, `${l.type} 단계`).toBeFalsy()
    // pointerdown은 click보다 앞서므로 언락이 아직 안 돌았을 수 있다.
    expect(listeners.map((l) => l.type)).not.toContain('pointerdown')
  })

  it('start()가 그제야 Howl을 만들고 재생한다', () => {
    const bgm = new BgmManager(['track-a.mp3'])
    bgm.armAutoplay()

    // 일부러 await하지 않는다 — 기다려야만 재생된다면 사용자 입력 자격을 잃는다.
    void bgm.start()

    expect(plays).toEqual(['track-a.mp3'])
  })

  it('★ 페이드인은 play() 직후가 아니라 재생이 시작된 뒤에 건다', () => {
    // html5 스트림의 play()는 비동기다(Howler playLock). 그 사이에 건 fade는 내부 큐에
    // 갇혀 영영 실행되지 않고, 스트림은 도는데 음량이 0에 머문다 — 재생 위치는 흘러가서
    // "소리만 안 난다"는 것 말고는 화면 어디에도 단서가 남지 않는 종류의 고장이다.
    const bgm = new BgmManager(['track-a.mp3'])
    void bgm.start()

    // play 직후에 fade를 걸지 않았고, 대신 재생 시작을 기다리고 있어야 한다.
    expect(calls).not.toContain('fade')
    expect(calls).toContain('once:play')
  })

  it('이미 재생 중이면 두 번 시작하지 않는다', () => {
    const bgm = new BgmManager(['track-a.mp3'])

    void bgm.start()
    void bgm.start()

    expect(plays).toHaveLength(1)
  })

  it('armAutoplay를 두 번 불러도 리스너가 겹치지 않는다', () => {
    const bgm = new BgmManager(['track-a.mp3'])
    bgm.armAutoplay()
    bgm.armAutoplay()

    expect(listeners).toHaveLength(3)
  })
})
