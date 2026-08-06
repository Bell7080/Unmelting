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
   * 첫 곡의 메타데이터를 미리 받아 둔다 — 재생은 시작하지 않는다.
   * 시작 지점을 화면 연출(부팅 게이트의 Click to Start)에 맞추고 싶을 때, 호출부가
   * 그 순간 `start()`만 부르면 곧바로 소리가 나게 하려는 준비 단계다.
   */
  preload(): void {
    if (!this.urls.length || this.pending || this.started) return
    this.pending = this.createHowl(this.randomIndex())
    void this.whenLoaded(this.pending)
  }

  /** 첫 사용자 입력에서 재생을 시작한다(자동재생 정책 우회). */
  armAutoplay(): void {
    if (!this.urls.length) return
    this.preload()
    // 캡처 단계로 등록해야 게임 카드 핸들러가 stopPropagation 해도 첫 입력을 잡는다.
    // 시작이 실제로 성공할 때까지 리스너를 유지해 한 번 막혀도 다음 입력에 재시도한다.
    this.kickHandler = () => {
      void this.start()
    }
    window.addEventListener('pointerdown', this.kickHandler, true)
    window.addEventListener('keydown', this.kickHandler, true)
    window.addEventListener('touchstart', this.kickHandler, true)
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
    window.removeEventListener('pointerdown', this.kickHandler, true)
    window.removeEventListener('keydown', this.kickHandler, true)
    window.removeEventListener('touchstart', this.kickHandler, true)
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

    const id = howl.play()
    howl.volume(0, id)
    howl.fade(0, this.volume, fadeInMs, id)
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
