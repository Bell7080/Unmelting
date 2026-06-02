/**
 * 배경음 매니저. Web Audio API로 mp3를 디코딩해 끝과 시작이 겹치는
 * 크로스페이드 루프(끝 페이드아웃 ↔ 시작 페이드인)를 만든다.
 *
 * 브라우저 자동재생 정책상 소리는 첫 사용자 입력 전까지 막히므로,
 * `armAutoplay()`로 최초 클릭/키 입력에 컨텍스트를 열고 루프를 시작한다.
 */
export class BgmManager {
  private ctx: AudioContext | null = null
  private buffer: AudioBuffer | null = null
  private masterGain: GainNode | null = null
  private loadPromise: Promise<void> | null = null
  private started = false
  private loopTimer: number | null = null
  /** 루프 경계에서 겹쳐 들려줄 페이드 길이(초). */
  private readonly fadeSeconds = 3
  /** 다음 구간을 실제 시작 시점보다 얼마나 미리 예약할지(초). */
  private readonly lookaheadSeconds = 1
  private volume = 0.55

  constructor(private readonly url: string) {}

  /** 첫 사용자 입력에서 컨텍스트를 열고 재생을 시작한다(자동재생 정책 우회). */
  armAutoplay(): void {
    // 입력 전에 미리 디코딩해 두면 첫 클릭 즉시 끊김 없이 시작된다.
    void this.ensureLoaded()
    const kick = (): void => {
      void this.start()
      window.removeEventListener('pointerdown', kick)
      window.removeEventListener('keydown', kick)
      window.removeEventListener('touchstart', kick)
    }
    window.addEventListener('pointerdown', kick, { once: true })
    window.addEventListener('keydown', kick, { once: true })
    window.addEventListener('touchstart', kick, { once: true })
  }

  /** 컨텍스트를 깨우고 크로스페이드 루프를 시작한다. 이미 재생 중이면 무시. */
  async start(): Promise<void> {
    if (this.started) return
    await this.ensureLoaded()
    if (!this.ctx || !this.buffer || !this.masterGain) return
    if (this.ctx.state === 'suspended') await this.ctx.resume()
    this.started = true
    this.scheduleIteration(this.ctx.currentTime + 0.08)
  }

  /** 0~1 음량. 즉시 반영한다. */
  setVolume(value: number): void {
    this.volume = Math.max(0, Math.min(1, value))
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.05)
    }
  }

  /** 루프를 멈추고 다음 예약을 취소한다. */
  stop(): void {
    if (this.loopTimer !== null) {
      window.clearTimeout(this.loopTimer)
      this.loopTimer = null
    }
    this.started = false
    if (this.masterGain && this.ctx) {
      // 부드럽게 죽인 뒤 컨텍스트는 유지(재시작 대비).
      this.masterGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2)
    }
  }

  /** mp3를 한 번만 fetch+decode 한다. 반복 호출은 같은 Promise를 돌려준다. */
  private ensureLoaded(): Promise<void> {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as {
        webkitAudioContext?: typeof AudioContext
      }).webkitAudioContext
      if (!Ctor) return Promise.resolve()
      this.ctx = new Ctor()
      this.masterGain = this.ctx.createGain()
      this.masterGain.gain.value = this.volume
      this.masterGain.connect(this.ctx.destination)
    }
    if (!this.loadPromise) {
      const ctx = this.ctx
      this.loadPromise = fetch(this.url)
        .then((res) => res.arrayBuffer())
        .then((data) => ctx.decodeAudioData(data))
        .then((buf) => {
          this.buffer = buf
        })
    }
    return this.loadPromise
  }

  /**
   * 한 번의 재생 구간을 페이드 인/아웃 엔벨로프와 함께 예약하고, 꼬리 페이드아웃
   * 구간에 다음 구간의 페이드인이 겹치도록 다음 호출을 타이머로 잡는다.
   * 시작 시각을 절대값(startAt)으로 넘기므로 타이머가 약간 늦어도 샘플 단위로 이어진다.
   */
  private scheduleIteration(startAt: number): void {
    if (!this.ctx || !this.buffer || !this.masterGain) return
    const dur = this.buffer.duration
    const fade = Math.min(this.fadeSeconds, dur / 2)

    const src = this.ctx.createBufferSource()
    src.buffer = this.buffer
    const gain = this.ctx.createGain()
    src.connect(gain).connect(this.masterGain)

    // 시작 페이드인 → 유지 → 꼬리 페이드아웃.
    gain.gain.setValueAtTime(0, startAt)
    gain.gain.linearRampToValueAtTime(1, startAt + fade)
    gain.gain.setValueAtTime(1, startAt + dur - fade)
    gain.gain.linearRampToValueAtTime(0, startAt + dur)

    src.start(startAt)
    src.stop(startAt + dur + 0.1)
    src.onended = () => {
      src.disconnect()
      gain.disconnect()
    }

    // 다음 구간은 이 구간의 꼬리 페이드 시작 지점에서 출발 → 크로스페이드.
    const nextAt = startAt + dur - fade
    const fireInMs = (nextAt - this.lookaheadSeconds - this.ctx.currentTime) * 1000
    this.loopTimer = window.setTimeout(() => this.scheduleIteration(nextAt), Math.max(0, fireInMs))
  }
}
