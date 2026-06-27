/**
 * 일회성 효과음 매니저.
 * BgmManager와 같은 AudioContext를 공유하지 않고 독립 컨텍스트를 사용한다.
 * 브라우저 자동재생 정책상 첫 사용자 입력 후 unlock() 을 한 번 호출해야 한다.
 */
import clickUrl from '../assets/audio/sfx_click.mp3'
import attackUrl from '../assets/audio/sfx_attack.mp3'

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
    // 미리 두 버퍼를 로드해 두면 첫 재생 지연이 없다.
    void this.load('click', clickUrl)
    void this.load('attack', attackUrl)
  }

  setVolume(value: number): void {
    this.volume = Math.max(0, Math.min(1, value))
  }

  playClick(): void {
    void this.play('click', clickUrl)
  }

  playAttack(): void {
    void this.play('attack', attackUrl)
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

  private async play(key: string, url: string): Promise<void> {
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
    src.connect(gain)
    src.onended = () => { src.disconnect(); gain.disconnect() }
    src.start()
  }
}

export const sfx = new SfxManager()
