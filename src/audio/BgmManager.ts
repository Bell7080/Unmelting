import { Howl } from 'howler'

/**
 * 배경음 매니저. 여러 트랙을 무작위 순서로 이어 재생한다.
 * - 트랙 사이는 끝 페이드아웃 ↔ 다음 시작 페이드인이 겹치는 크로스페이드로 잇는다.
 * - 첫 곡도, 다음 곡도 순수 무작위로 고른다(같은 곡이 연달아 나올 수 있다).
 *
 * 재생은 Howler의 HTML5 **스트리밍**(`html5: true`)을 쓴다. 3분짜리 스테레오
 * 트랙을 `decodeAudioData`로 전량 디코딩하면 트랙당 약 60MB의 PCM이 상주하고
 * 크로스페이드마다 재디코딩 스파이크가 생긴다. BGM은 앞에서부터 흘려보내기만
 * 하면 되므로 랜덤 액세스가 필요 없다 — 스트리밍이 맞는 도구다.
 *
 * 크로스페이드 구간마다 **새 Howl 인스턴스**를 만든다. 같은 곡이 연달아 뽑혀도
 * 겹쳐 재생돼야 하는데, html5 스트림은 인스턴스당 오디오 요소 하나를 공유해서
 * 한 인스턴스에 두 소리를 겹칠 수 없기 때문이다. 페이드아웃이 끝난 인스턴스는
 * 즉시 `unload()`하므로 동시에 살아 있는 스트림은 최대 둘이다.
 *
 * 브라우저 자동재생 정책상 소리는 첫 사용자 입력 전까지 막히므로,
 * `armAutoplay()`로 최초 클릭/키 입력에 재생을 시작한다.
 */

interface Segment {
  howl: Howl
  /** Howler가 발급한 재생 인스턴스 id. 페이드/정지 대상 지정에 쓴다. */
  id: number
}

export class BgmManager {
  /** Howler가 html5 언락에 쓰는 이벤트와 같은 목록 — 언락이 먼저 돌았음을 보장한다. */
  private static readonly UNLOCK_EVENTS = ['click', 'touchend', 'keydown'] as const

  private current: Segment | null = null
  /** 다음 구간용으로 미리 만들어 메타데이터를 받아 두는 인스턴스. */
  private pending: Howl | null = null
  private started = false
  private fadeTimer: number | null = null
  private releaseTimer: number | null = null
  /** 자동재생 언락 리스너 핸들러(성공 시 제거하려고 보관). */
  private kickHandler: ((event: Event) => void) | null = null
  /** 루프 경계에서 겹쳐 들려줄 페이드 길이(ms). */
  private readonly fadeMs = 3000
  /** 첫 재생의 페이드인은 짧게 잡아 시작 직후 바로 들리게 한다. */
  private readonly introFadeMs = 600
  /** 로드가 연달아 실패해도 무한 재시도하지 않는다. */
  private readonly maxLoadAttempts = 3
  private volume = 0.55

  constructor(private readonly urls: string[]) {}

  /**
   * 첫 사용자 입력에서 재생을 시작한다(자동재생 정책 우회).
   *
   * ★ **Howl 인스턴스를 사용자 입력 전에 만들면 안 된다.** Howler는 html5 오디오 노드를
   * 풀에 담아 두는데, 그 풀은 자신의 언락 핸들러가 도는 **첫 사용자 입력에** 채워진다.
   * 그 전에 Howl을 만들면 빈 풀에서 "잠긴 오디오 객체"를 받고(콘솔에 'HTML5 Audio pool
   * exhausted' 경고가 뜬다), 그 노드는 나중에 `play()`를 불러도 조용히 아무 일도 하지
   * 않는다 — 에러도 안 나고 화면도 멀쩡해서 원인이 어디에도 안 보인다.
   *
   * ★ **그래서 캡처 단계로 등록하지 않는다.** Howler는 언락을 `document` 캡처에 걸어 두는데
   * `window` 캡처는 그보다 **먼저** 돈다. 캡처로 잡으면 우리가 언락 전에 Howl을 만들어
   * 같은 함정에 빠진다. 버블 단계로 미뤄 Howler가 풀을 채운 뒤에 시작한다.
   *
   * 듣는 이벤트도 Howler가 언락에 쓰는 것과 맞춘다(click/touchend/keydown) — 그래야
   * "언락이 이미 돌았다"가 보장된다. 성공할 때까지 리스너를 유지해 한 번 막혀도
   * 다음 입력에 재시도한다.
   */
  armAutoplay(): void {
    if (!this.urls.length || this.kickHandler) return
    this.kickHandler = () => {
      void this.start()
    }
    for (const type of BgmManager.UNLOCK_EVENTS) {
      window.addEventListener(type, this.kickHandler)
    }
  }

  /** 무작위 트랙으로 재생을 시작한다. 이미 재생 중이면 무시. */
  async start(): Promise<void> {
    if (this.started || !this.urls.length) return
    // 동시 입력(pointerdown+touchstart 등)으로 두 번 시작되지 않게 먼저 잠근다.
    this.started = true
    const first = this.pending ?? this.createHowl(this.randomIndex())
    this.pending = null
    const ok = await this.playSegment(first, this.introFadeMs)
    if (!ok) {
      this.started = false
      return
    }
    this.removeUnlockListeners()
  }

  /** 0~1 음량. 즉시 반영한다. */
  setVolume(value: number): void {
    this.volume = Math.max(0, Math.min(1, value))
    // 페이드 중이면 진행 중인 램프가 이 값을 덮을 수 있으나, 다음 구간부터
    // 새 음량으로 페이드하므로 한 번의 전환 안에서 수렴한다.
    if (this.current) this.current.howl.volume(this.volume, this.current.id)
  }

  /** 재생을 멈추고 다음 예약을 취소한다. 스트림은 전부 해제한다. */
  stop(): void {
    this.clearTimers()
    this.started = false
    const finishing = this.current
    this.current = null
    if (finishing) {
      finishing.howl.fade(this.volume, 0, 200, finishing.id)
      window.setTimeout(() => {
        finishing.howl.stop(finishing.id)
        finishing.howl.unload()
      }, 240)
    }
    this.pending?.unload()
    this.pending = null
  }

  /** 재생이 시작되면 자동재생 언락 리스너를 떼어낸다. */
  private removeUnlockListeners(): void {
    if (!this.kickHandler) return
    for (const type of BgmManager.UNLOCK_EVENTS) {
      window.removeEventListener(type, this.kickHandler)
    }
    this.kickHandler = null
  }

  private randomIndex(): number {
    return Math.floor(Math.random() * this.urls.length)
  }

  private createHowl(index: number): Howl {
    return new Howl({
      src: [this.urls[index]],
      html5: true, // 스트리밍 — 전량 PCM 디코딩을 하지 않는다.
      preload: 'metadata',
      loop: false, // 곡이 끝나기 전에 다음 무작위 트랙으로 크로스페이드한다.
      volume: 0,
      pool: 1,
    })
  }

  /**
   * 한 구간을 페이드인으로 시작하고, 꼬리 페이드 지점에 다음 구간을 예약한다.
   * 로드에 실패하면 다른 트랙으로 몇 번 갈아타 본다(무음 고착 방지).
   */
  private async playSegment(howl: Howl, fadeInMs: number, attempt = 1): Promise<boolean> {
    // ★ 이미 로드된 스트림은 **await 없이 그 자리에서** 재생한다.
    //
    // async 함수는 첫 `await`까지 동기로 흐른다. 그래서 여기서 기다리지 않으면
    // `play()`가 클릭 핸들러와 같은 실행 안에서 불리고, 브라우저는 그것을
    // "사용자가 눌러서 난 소리"로 인정한다. 한 번이라도 await를 지나면 그 자격을
    // 잃어 자동재생 정책에 막힌다 — 게이트에서 미리 받아 두는 이유가 이것이다.
    if (howl.state() === 'loaded') return this.launch(howl, fadeInMs)

    const loaded = await this.whenLoaded(howl)
    if (!this.started) {
      howl.unload()
      return false
    }
    if (!loaded) {
      howl.unload()
      if (attempt >= this.maxLoadAttempts) return false
      return this.playSegment(this.createHowl(this.randomIndex()), fadeInMs, attempt + 1)
    }
    return this.launch(howl, fadeInMs)
  }

  /** 실제 재생 시작 — 로드가 끝난 스트림에만 부른다. 동기라 사용자 입력 자격을 잃지 않는다. */
  private launch(howl: Howl, fadeInMs: number): boolean {
    const id = howl.play()
    // ★ 페이드는 **재생이 실제로 시작된 뒤에** 건다. html5 스트림의 play()는 비동기라
    //   그 사이(Howler 내부 playLock) 걸린 fade/volume은 큐에 갇혀 영영 실행되지 않는다.
    //   그러면 스트림은 도는데 음량이 0에 머문다 — 에러도 없고 재생 위치는 흘러가서
    //   "소리만 안 난다"는 것 말고는 화면 어디에도 단서가 남지 않는다.
    //   Howl은 volume: 0으로 만들어 두므로 이 사이에 큰 소리가 새지 않는다.
    howl.once('play', () => howl.fade(0, this.volume, fadeInMs, id), id)
    this.current = { howl, id }

    // 다음 구간 인스턴스를 지금 만들어 메타데이터를 미리 받아 둔다.
    this.pending = this.createHowl(this.randomIndex())
    void this.whenLoaded(this.pending)

    this.scheduleCrossfade(howl, id)
    return true
  }

  /** 곡 끝 `fadeMs` 구간에서 현재 구간을 내리고 다음 구간을 겹쳐 올린다. */
  private scheduleCrossfade(howl: Howl, id: number): void {
    const durationMs = howl.duration(id) * 1000
    // 메타데이터를 못 읽은 스트림은 예약할 지점이 없다 — 끝나면 그대로 멈춘다.
    if (!Number.isFinite(durationMs) || durationMs <= 0) return
    const fade = Math.min(this.fadeMs, durationMs / 2)
    const startAt = Math.max(0, durationMs - fade)

    this.fadeTimer = window.setTimeout(() => {
      this.fadeTimer = null
      if (!this.started) return

      howl.fade(this.volume, 0, fade, id)
      // 페이드가 끝난 스트림은 바로 해제해 살아 있는 스트림을 둘로 제한한다.
      this.releaseTimer = window.setTimeout(() => {
        this.releaseTimer = null
        howl.stop(id)
        howl.unload()
      }, fade + 100)

      const next = this.pending ?? this.createHowl(this.randomIndex())
      this.pending = null
      void this.playSegment(next, fade)
    }, startAt)
  }

  /** 메타데이터 로드 완료를 기다린다. 실패면 false. */
  private whenLoaded(howl: Howl): Promise<boolean> {
    if (howl.state() === 'loaded') return Promise.resolve(true)
    return new Promise<boolean>((resolve) => {
      const finish = (ok: boolean) => {
        howl.off('load', onLoad)
        howl.off('loaderror', onError)
        resolve(ok)
      }
      const onLoad = () => finish(true)
      const onError = () => {
        // 트랙 하나가 막혀도 게임 진입을 막지 않는다. 무음으로 흘려보낸다.
        console.warn('[bgm] 트랙 로드 실패')
        finish(false)
      }
      howl.once('load', onLoad)
      howl.once('loaderror', onError)
      if (howl.state() === 'unloaded') howl.load()
    })
  }

  private clearTimers(): void {
    if (this.fadeTimer !== null) {
      window.clearTimeout(this.fadeTimer)
      this.fadeTimer = null
    }
    if (this.releaseTimer !== null) {
      window.clearTimeout(this.releaseTimer)
      this.releaseTimer = null
    }
  }
}
