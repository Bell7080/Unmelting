/**
 * 배경음 매니저. 여러 트랙을 무작위 순서로 이어 재생한다.
 * - 트랙 사이는 끝 페이드아웃 ↔ 다음 시작 페이드인이 겹치는 크로스페이드로 잇는다.
 * - 첫 곡도, 다음 곡도 순수 무작위로 고른다(같은 곡이 연달아 나올 수 있다).
 * - 메모리는 현재+다음 트랙 버퍼만 유지하고 나머지는 비운다(필요 시 재디코딩).
 *
 * 브라우저 자동재생 정책상 소리는 첫 사용자 입력 전까지 막히므로,
 * `armAutoplay()`로 최초 클릭/키 입력에 컨텍스트를 열고 재생을 시작한다.
 */
export class BgmManager {
  private ctx: AudioContext | null = null
  private masterGain: GainNode | null = null
  private started = false
  private loopTimer: number | null = null
  /** 디코딩된 트랙 버퍼 캐시(인덱스 → 버퍼). 현재/다음만 유지한다. */
  private readonly buffers = new Map<number, AudioBuffer>()
  /** 진행 중인 디코딩(인덱스 → Promise)으로 중복 fetch를 막는다. */
  private readonly loads = new Map<number, Promise<AudioBuffer | null>>()
  /** armAutoplay에서 미리 골라 둔 첫 트랙(첫 클릭 즉시 시작용). */
  private firstIndex = -1
  /** 자동재생 언락 리스너 핸들러(성공 시 제거하려고 보관). */
  private kickHandler: ((event: Event) => void) | null = null
  /** 루프 경계에서 겹쳐 들려줄 페이드 길이(초). */
  private readonly fadeSeconds = 3
  /** 첫 재생의 페이드인은 짧게 잡아 시작 직후 바로 들리게 한다. */
  private readonly introFadeSeconds = 0.6
  /** 다음 구간을 실제 시작 시점보다 얼마나 미리 예약할지(초). */
  private readonly lookaheadSeconds = 1
  private volume = 0.55

  constructor(private readonly urls: string[]) {}

  /** 첫 사용자 입력에서 컨텍스트를 열고 재생을 시작한다(자동재생 정책 우회). */
  armAutoplay(): void {
    if (!this.ensureContext()) return
    // 첫 곡을 미리 골라 디코딩해 두면 첫 클릭 즉시 끊김 없이 시작된다.
    this.firstIndex = this.randomIndex()
    void this.ensureBuffer(this.firstIndex)
    // 캡처 단계로 등록해야 게임 카드 핸들러가 stopPropagation 해도 첫 입력을 잡는다.
    // 시작이 실제로 성공할 때까지 리스너를 유지해 한 번 막혀도 다음 입력에 재시도한다.
    this.kickHandler = () => { void this.start() }
    window.addEventListener('pointerdown', this.kickHandler, true)
    window.addEventListener('keydown', this.kickHandler, true)
    window.addEventListener('touchstart', this.kickHandler, true)
  }

  /** 컨텍스트를 깨우고 무작위 트랙으로 재생을 시작한다. 이미 재생 중이면 무시. */
  async start(): Promise<void> {
    if (this.started) return
    if (!this.ensureContext() || !this.ctx) return
    // 동시 입력(pointerdown+touchstart 등)으로 두 번 시작되지 않게 먼저 잠근다.
    this.started = true
    if (this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume()
      } catch {
        this.started = false
        return
      }
    }
    const first = this.firstIndex >= 0 ? this.firstIndex : this.randomIndex()
    const buffer = await this.ensureBuffer(first)
    if (!buffer) {
      this.started = false
      return
    }
    this.removeUnlockListeners()
    // 첫 곡은 짧은 페이드인으로 시작해 클릭 직후 바로 들리게 한다.
    this.scheduleIteration(first, buffer, this.ctx.currentTime + 0.04, this.introFadeSeconds)
  }

  /** 재생이 시작되면 자동재생 언락 리스너를 떼어낸다. */
  private removeUnlockListeners(): void {
    if (!this.kickHandler) return
    window.removeEventListener('pointerdown', this.kickHandler, true)
    window.removeEventListener('keydown', this.kickHandler, true)
    window.removeEventListener('touchstart', this.kickHandler, true)
    this.kickHandler = null
  }

  /** 0~1 음량. 즉시 반영한다. */
  setVolume(value: number): void {
    this.volume = Math.max(0, Math.min(1, value))
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.05)
    }
  }

  /** 재생을 멈추고 다음 예약을 취소한다(컨텍스트는 재시작 대비 유지). */
  stop(): void {
    if (this.loopTimer !== null) {
      window.clearTimeout(this.loopTimer)
      this.loopTimer = null
    }
    this.started = false
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2)
    }
  }

  private randomIndex(): number {
    return Math.floor(Math.random() * this.urls.length)
  }

  /** AudioContext/마스터 게인을 1회 생성한다. 생성 가능 여부를 반환. */
  private ensureContext(): boolean {
    if (this.ctx) return true
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return false
    this.ctx = new Ctor()
    this.masterGain = this.ctx.createGain()
    this.masterGain.gain.value = this.volume
    this.masterGain.connect(this.ctx.destination)
    return true
  }

  /** 트랙을 fetch+decode 해 캐시한다. 실패 시 null. */
  private ensureBuffer(index: number): Promise<AudioBuffer | null> {
    const cached = this.buffers.get(index)
    if (cached) return Promise.resolve(cached)
    const inflight = this.loads.get(index)
    if (inflight) return inflight
    const ctx = this.ctx
    if (!ctx) return Promise.resolve(null)
    const task = fetch(this.urls[index])
      .then((res) => res.arrayBuffer())
      .then((data) => ctx.decodeAudioData(data))
      .then((buf) => {
        this.buffers.set(index, buf)
        this.loads.delete(index)
        return buf
      })
      .catch((err) => {
        // 자산 로드/디코딩 실패 시 무음이 되므로 원인을 콘솔로 남긴다.
        console.warn(`[bgm] 트랙 로드 실패: ${this.urls[index]}`, err)
        this.loads.delete(index)
        return null
      })
    this.loads.set(index, task)
    return task
  }

  /** 현재/다음으로 지정한 인덱스 외의 캐시 버퍼는 비워 메모리를 제한한다. */
  private evictExcept(keep: number[]): void {
    for (const index of [...this.buffers.keys()]) {
      if (!keep.includes(index)) this.buffers.delete(index)
    }
  }

  /**
   * 한 트랙의 재생 구간을 페이드 인/아웃 엔벨로프와 함께 예약하고, 꼬리 페이드아웃
   * 구간에 다음(무작위) 트랙의 페이드인이 겹치도록 다음 호출을 타이머로 잡는다.
   * 시작 시각을 절대값(startAt)으로 넘기므로 타이머가 약간 늦어도 자연스럽게 이어진다.
   */
  private scheduleIteration(
    index: number,
    buffer: AudioBuffer,
    startAt: number,
    fadeInSeconds: number = this.fadeSeconds
  ): void {
    if (!this.ctx || !this.masterGain) return
    const dur = buffer.duration
    // 꼬리 페이드아웃은 항상 fadeSeconds — 다음 곡의 fadeSeconds 페이드인과 크로스페이드된다.
    const fade = Math.min(this.fadeSeconds, dur / 2)
    const fadeIn = Math.min(fadeInSeconds, dur / 2)

    const src = this.ctx.createBufferSource()
    src.buffer = buffer
    const gain = this.ctx.createGain()
    src.connect(gain).connect(this.masterGain)

    // 시작 페이드인 → 유지 → 꼬리 페이드아웃.
    gain.gain.setValueAtTime(0, startAt)
    gain.gain.linearRampToValueAtTime(1, startAt + fadeIn)
    gain.gain.setValueAtTime(1, startAt + dur - fade)
    gain.gain.linearRampToValueAtTime(0, startAt + dur)

    src.start(startAt)
    src.stop(startAt + dur + 0.1)
    src.onended = () => {
      src.disconnect()
      gain.disconnect()
    }

    // 다음 트랙은 순수 무작위(같은 곡 연속 허용), 이 구간의 꼬리 페이드 지점에서 출발한다.
    const nextIndex = this.randomIndex()
    const nextAt = startAt + dur - fade
    void this.ensureBuffer(nextIndex).then((nextBuffer) => {
      // 현재 재생 중인 트랙은 꼬리 페이드가 끝날 때까지 필요하므로 함께 남긴다.
      this.evictExcept([index, nextIndex])
      if (!nextBuffer || !this.ctx || !this.started) return
      const fireInMs = (nextAt - this.lookaheadSeconds - this.ctx.currentTime) * 1000
      this.loopTimer = window.setTimeout(
        () => this.scheduleIteration(nextIndex, nextBuffer, nextAt),
        Math.max(0, fireInMs)
      )
    })
  }
}
