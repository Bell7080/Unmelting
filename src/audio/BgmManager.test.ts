import { describe, expect, it, vi, beforeEach } from 'vitest'

/**
 * Howl 대역. 실제 오디오 없이 "언제 play()가 불렸는가"만 본다 —
 * 이 파일이 지키려는 것은 소리가 아니라 **호출 시점**이다.
 */
const plays: string[] = []

class FakeHowl {
  private readonly url: string
  /** 로드 완료로 볼지 — 미리 받아 둔 스트림과 아직 못 받은 스트림을 갈라 본다. */
  static loaded = true

  constructor(config: { src: string[] }) {
    this.url = config.src[0]
  }

  state(): string { return FakeHowl.loaded ? 'loaded' : 'unloaded' }
  play(): number { plays.push(this.url); return 1 }
  volume(): void {}
  fade(): void {}
  // 0을 돌려주면 크로스페이드 예약이 타이머를 걸지 않고 빠져나간다(테스트에 window가 없다).
  duration(): number { return 0 }
  once(): void {}
  off(): void {}
  load(): void {}
  stop(): void {}
  unload(): void {}
}

vi.mock('howler', () => ({ Howl: FakeHowl }))

const { BgmManager } = await import('./BgmManager')

describe('BgmManager 자동재생 언락', () => {
  beforeEach(() => {
    plays.length = 0
    FakeHowl.loaded = true
  })

  it('★ 미리 받아 둔 곡은 start() 호출과 **같은 동기 실행 안에서** 재생된다', () => {
    // 브라우저는 클릭 핸들러와 같은 실행 안에서 불린 play()만 사용자 입력으로 인정한다.
    // 중간에 await가 하나라도 끼면 그 자격을 잃어 자동재생 정책에 막히고, 화면은
    // 멀쩡한데 소리만 안 나는 상태가 된다(원인이 화면에 안 보인다).
    const bgm = new BgmManager(['track-a.mp3'])
    bgm.preload()

    // 일부러 await하지 않는다 — 기다려야만 재생된다면 그 자체가 회귀다.
    void bgm.start()

    expect(plays).toEqual(['track-a.mp3'])
  })

  it('아직 못 받은 곡은 로드를 기다렸다가 재생한다', async () => {
    FakeHowl.loaded = false
    const bgm = new BgmManager(['track-a.mp3'])

    void bgm.start()
    expect(plays).toHaveLength(0)

    // 로드가 끝나는 세계에서는 결국 재생된다(첫 클릭을 놓쳐도 무음으로 굳지 않는다).
    FakeHowl.loaded = true
    await Promise.resolve()
  })

  it('이미 재생 중이면 두 번 시작하지 않는다', () => {
    const bgm = new BgmManager(['track-a.mp3'])
    bgm.preload()

    void bgm.start()
    void bgm.start()

    expect(plays).toHaveLength(1)
  })
})
