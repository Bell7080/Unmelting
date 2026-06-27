/**
 * 일회성 효과음 매니저.
 * 브라우저 자동재생 정책상 첫 사용자 입력 후 unlock()을 한 번 호출해야 한다.
 *
 * 모든 재생은 `playbackRate`를 ±6% 범위에서 무작위로 흔들어 반복 청각 피로를 줄인다.
 * 적이 플레이어를 공격할 때는 음정을 낮게(0.72~0.84) 설정해 피격감을 구분한다.
 */
import clickUrl from '../assets/audio/sfx_click.mp3'
import attackUrl from '../assets/audio/sfx_attack.mp3'

interface PlayOptions {
  /** playbackRate 범위 [min, max]. 기본 [0.94, 1.06]. */
  rateRange?: [number, number]
  /** 재생 전 대기 시간(ms). */
  delayMs?: number
}

export class SfxManager {
  private ctx: AudioContext | null = null
  private readonly buffers = new Map<string, AudioBuffer>()
  private readonly loads = new Map<string, Promise<AudioBuffer | null>>()
  private volume = 0.7

  /** 첫 사용자 입력 시 컨텍스트를 열고 버퍼를 미리 디코딩한다. */
  async unlock(): Promise<void> {
    if (this.ctx) return
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    this.ctx = new Ctor()
    void this.load('click', clickUrl)
    void this.load('attack', attackUrl)
  }

  setVolume(value: number): void {
    this.volume = Math.max(0, Math.min(1, value))
  }

  /** 클릭음 — 25ms 딜레이로 즉발감을 살짝 죽인다. */
  playClick(): void {
    void this.play('click', clickUrl, { delayMs: 25 })
  }

  /** 플레이어가 적을 공격할 때 타격음. */
  playAttack(): void {
    void this.play('attack', attackUrl)
  }

  /** 적이 플레이어를 공격할 때 타격음 — 낮은 음정으로 피격감을 구분한다. */
  playPlayerHit(): void {
    void this.play('attack', attackUrl, { rateRange: [0.72, 0.84] })
  }

  private async load(key: string, url: string): Promise<AudioBuffer | null> {
    const cached = this.buffers.get(key)
    if (cached) return cached
    const inflight = this.loads.get(key)
    if (inflight) return inflight
    const ctx = this.ctx
    if (!ctx) return null
    const task = fetch(url)
      .then((r) => r.arrayBuffer())
      .then((data) => ctx.decodeAudioData(data))
      .then((buf) => {
        this.buffers.set(key, buf)
        this.loads.delete(key)
        return buf
      })
      .catch((err) => {
        console.warn(`[sfx] 로드 실패: ${url}`, err)
        this.loads.delete(key)
        return null
      })
    this.loads.set(key, task)
    return task
  }

  private async play(key: string, url: string, opts: PlayOptions = {}): Promise<void> {
    const { rateRange = [0.94, 1.06], delayMs = 0 } = opts
    if (delayMs > 0) await new Promise<void>((r) => window.setTimeout(r, delayMs))
    if (!this.ctx) return
    if (this.ctx.state === 'suspended') {
      try { await this.ctx.resume() } catch { return }
    }
    const buf = await this.load(key, url)
    if (!buf || !this.ctx) return
    const gain = this.ctx.createGain()
    gain.gain.value = this.volume
    gain.connect(this.ctx.destination)
    const src = this.ctx.createBufferSource()
    src.buffer = buf
    // 매 재생마다 음정을 살짝 흔들어 단조로움을 줄인다.
    src.playbackRate.value = rateRange[0] + Math.random() * (rateRange[1] - rateRange[0])
    src.connect(gain)
    src.onended = () => { src.disconnect(); gain.disconnect() }
    src.start()
  }
}

export const sfx = new SfxManager()
