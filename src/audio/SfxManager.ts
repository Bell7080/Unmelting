/**
 * 일회성 효과음 매니저.
 * 브라우저 자동재생 정책상 첫 사용자 입력 후 unlock()을 한 번 호출해야 한다.
 *
 * 목록(어떤 소리가 있고 기본 음정/볼륨이 얼마인지)은 `SfxLibrary.ts`가 갖고, 이 파일은
 * **재생 방법**만 갖는다. 호출부는 URL이 아니라 키를 넘긴다.
 *
 * 두 가지가 이 매니저의 일이다.
 *  1) **다듬기**: 디코딩한 버퍼에서 실제 소리 구간을 찾아 그 구간만 재생한다. 파일
 *     앞뒤 무음이 그대로여도 누른 순간 소리가 나 재생 타이밍이 화면과 맞는다.
 *  2) **체인 고조**: 체인이 쌓일수록 반음씩 올리고 울림(딜레이 잔향)을 더해, 이어 갈수록
 *     소리 자체가 고조되게 한다.
 */
import {
  SFX_LIBRARY,
  CHAIN_SFX_BY_KIND,
  HIT_TONE_BY_TAG,
  HIT_TONE_PRIORITY,
  SFX_VARIANTS,
  TRAP_TONE_BY_KIND,
  type SfxVariantGroup,
  type HitToneSpec,
  FADE_OUT_S,
  type SfxKey,
  type ChainSfxKind,
} from './SfxLibrary'
import { measureTrimWindow, type TrimWindow } from './SfxTrim'

interface PlayOptions {
  /** playbackRate 범위. 생략하면 라이브러리 기본값. */
  rateRange?: [number, number]
  /** 재생 전 대기 시간(ms). */
  delayMs?: number
  /** 반음 단위 이조(+12 = 한 옥타브 위). rateRange 위에 곱해진다. */
  semitones?: number
  /** 라이브러리 기본 gain에 곱할 배수. */
  gainScale?: number
  /** 잔향 강도 0~1. 0이면 딜레이 계통을 아예 만들지 않는다. */
  ring?: number
  /** 파형을 뒤집어 재생한다 — 소리가 부풀어 오르다 터진다. */
  reverse?: boolean
}

/** 체인 한 단계마다 올릴 반음 수. */
const CHAIN_SEMITONE_STEP = 1.5
/** 체인 고조 상한(반음). 이 위로는 소리가 얇아져 쾌감보다 피로가 커진다. */
const CHAIN_SEMITONE_MAX = 14
/** 잔향 탭 간격(초) — 짧아야 '울림'으로 뭉치고, 길면 메아리로 갈라진다. */
const RING_DELAY_S = 0.085
/** 잔향 되먹임 상한. 1에 가까우면 영영 울린다. */
const RING_FEEDBACK_MAX = 0.42

export class SfxManager {
  private ctx: AudioContext | null = null
  private readonly buffers = new Map<SfxKey, AudioBuffer>()
  /** 역재생용 뒤집은 사본. 뒤집는 비용은 키마다 한 번만 치른다. */
  private readonly reversed = new Map<SfxKey, AudioBuffer>()
  private readonly trims = new Map<SfxKey, TrimWindow>()
  private readonly loads = new Map<SfxKey, Promise<AudioBuffer | null>>()
  private volume = 0.7

  /** 첫 사용자 입력 시 컨텍스트를 열고 버퍼를 미리 디코딩한다. */
  async unlock(): Promise<void> {
    if (this.ctx) return
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    this.ctx = new Ctor()
    // 라이브러리 전체를 미리 받아 둔다 — 체인음은 첫 손패에서 바로 필요하다.
    for (const key of Object.keys(SFX_LIBRARY) as SfxKey[]) void this.load(key)
  }

  setVolume(value: number): void {
    this.volume = Math.max(0, Math.min(1, value))
  }

  /** 클릭음 — 25ms 딜레이로 즉발감을 살짝 죽인다. */
  playClick(): void {
    void this.play('click', { delayMs: 25 })
  }

  /** 플레이어가 적을 공격할 때 타격음. */
  playAttack(): void {
    void this.play('attack')
  }

  /** 동전이 손패로 들어올 때의 짤랑임 — 전용 소스가 없어 클릭음을 높은 음정으로 굴린다. */
  playCoin(): void {
    void this.play('click', { rateRange: [1.55, 1.95] })
  }

  /** 적이 플레이어를 공격할 때 타격음 — 낮은 음정으로 피격감을 구분한다. */
  playPlayerHit(): void {
    void this.play('attack', { rateRange: [0.72, 0.84] })
  }

  /**
   * 체인음. `depth`는 이 이벤트가 체인의 **몇 번째**인가(1부터)다.
   * 쌓일수록 반음이 올라가고 잔향이 길어져, 이어 갈수록 소리가 고조된다.
   */
  playChain(kind: ChainSfxKind, depth: number): void {
    const step = Math.max(0, depth - 1)
    const semitones = Math.min(CHAIN_SEMITONE_MAX, step * CHAIN_SEMITONE_STEP)
    // 게이지 만충은 체인의 결산이라 한 옥타브 위에서 시작한다.
    const base = kind === 'gauge' ? 12 : 0
    void this.play(CHAIN_SFX_BY_KIND[kind], {
      semitones: base + semitones,
      // 깊어질수록 조금 더 크게, 다만 귀가 아플 만큼은 아니게 완만히.
      gainScale: Math.min(1.35, 1 + step * 0.06),
      // 울림도 함께 자란다 — "쌓을수록 더 울린다"의 실체다.
      ring: Math.min(1, step * 0.16 + (kind === 'gauge' ? 0.5 : 0)),
    })
  }

  /**
   * 카드가 적을 때린 소리. 카드의 시너지 태그에서 테마를 골라 같은 타격음을
   * 음정·잔향·반복·역재생으로 변주한다 — 무엇으로 때렸는지가 소리로 갈린다.
   * 태그가 없거나 표에 없는 태그뿐이면 기본 타격음으로 떨어진다.
   */
  playHandHit(tags: readonly string[] = []): void {
    const tag = HIT_TONE_PRIORITY.find((candidate) => tags.includes(candidate))
    const tone = tag ? HIT_TONE_BY_TAG[tag] : undefined
    if (!tone) {
      this.playAttack()
      return
    }
    const shots = tone.repeat?.times ?? 1
    for (let i = 0; i < shots; i++) {
      void this.play('attack', {
        semitones: tone.semitones + (tone.repeat?.semitoneStep ?? 0) * i,
        // 뒤따르는 타격은 조금씩 여리게 — 같은 세기로 겹치면 한 덩어리로 뭉친다.
        gainScale: tone.gain * (i === 0 ? 1 : 0.78),
        ring: tone.ring,
        reverse: tone.reverse,
        delayMs: (tone.repeat?.gapMs ?? 0) * i,
      })
    }
  }

  /**
   * 상자·잡동사니를 여는 소리. 자원(불빛/화폐)이 롤링하며 터지는 그 박자에 맞춰 부른다.
   * 같은 사건에 여러 장이 등록돼 있으면 매번 무작위로 골라 단조로움을 던다.
   */
  playChestOpen(opts: { semitones?: number; gain?: number; ring?: number } = {}): void {
    this.playVariant('chest', { semitones: opts.semitones ?? 0, gain: opts.gain ?? 1, ring: opts.ring ?? 0.25 })
  }

  /** 상점·제단에서 물건을 샀을 때 — 상자와 같은 음색을 조금 높여 '값을 치렀다'로 쓴다. */
  playPurchase(): void {
    this.playVariant('chest', { semitones: 3, gain: 0.95, ring: 0.35 })
  }

  /** 함정을 처리했을 때. 함정 종류(거미줄/폭탄/포자/덤불)로 음색이 갈린다. */
  playTrapClear(trapKind?: string): void {
    const tone = (trapKind && TRAP_TONE_BY_KIND[trapKind]) || { semitones: 0, gain: 1, ring: 0.2 }
    this.playVariant('trap', tone)
  }

  /** 미믹이 정체를 드러내거나 씨앗이 괴물꽃이 될 때 — 무언가가 다른 것이 되는 순간. */
  playTransform(opts: { semitones?: number; ring?: number } = {}): void {
    void this.play('transform', { semitones: opts.semitones ?? 0, ring: opts.ring ?? 0.5 })
  }

  /** 여러 장 중 하나를 무작위로 골라 같은 변주 규칙으로 재생한다. */
  private playVariant(group: SfxVariantGroup, tone: Pick<HitToneSpec, 'semitones' | 'gain' | 'ring'>): void {
    const keys = SFX_VARIANTS[group]
    const key = keys[Math.min(Math.floor(Math.random() * keys.length), keys.length - 1)]!
    void this.play(key, { semitones: tone.semitones, gainScale: tone.gain, ring: tone.ring })
  }

  /** 에나가 판을 뒤집는 순간(클러치) — 체인 음색을 낮고 길게 울려 무게를 준다. */
  playCompanionClutch(): void {
    void this.play('chainRecipe', { semitones: -5, gainScale: 0.9, ring: 0.75 })
  }

  /** 다듬은 구간만 잘라 뒤집은 버퍼. 키마다 한 번 만들어 캐시한다. */
  private reversedBufferOf(key: SfxKey, source: AudioBuffer, trim: TrimWindow, ctx: AudioContext): AudioBuffer {
    const cached = this.reversed.get(key)
    if (cached) return cached
    const start = Math.floor(trim.offset * source.sampleRate)
    const length = Math.max(1, Math.floor(trim.duration * source.sampleRate))
    const out = ctx.createBuffer(source.numberOfChannels, length, source.sampleRate)
    for (let ch = 0; ch < source.numberOfChannels; ch++) {
      const from = source.getChannelData(ch)
      const to = out.getChannelData(ch)
      for (let i = 0; i < length; i++) to[i] = from[start + length - 1 - i] ?? 0
    }
    this.reversed.set(key, out)
    return out
  }

  private async load(key: SfxKey): Promise<AudioBuffer | null> {
    const cached = this.buffers.get(key)
    if (cached) return cached
    const inflight = this.loads.get(key)
    if (inflight) return inflight
    const ctx = this.ctx
    if (!ctx) return null
    const { url } = SFX_LIBRARY[key]
    const task = fetch(url)
      .then((r) => r.arrayBuffer())
      .then((data) => ctx.decodeAudioData(data))
      .then((buf) => {
        this.buffers.set(key, buf)
        this.trims.set(key, measureTrimWindow(buf))
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

  private async play(key: SfxKey, opts: PlayOptions = {}): Promise<void> {
    const def = SFX_LIBRARY[key]
    const { rateRange = def.rateRange, delayMs = 0, semitones = 0, gainScale = 1, ring = 0, reverse = false } = opts
    if (delayMs > 0) await new Promise<void>((r) => window.setTimeout(r, delayMs))
    if (!this.ctx) return
    if (this.ctx.state === 'suspended') {
      try { await this.ctx.resume() } catch { return }
    }
    const loaded = await this.load(key)
    const ctx = this.ctx
    if (!loaded || !ctx) return
    const trim = this.trims.get(key) ?? { offset: 0, duration: loaded.duration }
    // 역재생은 **다듬은 구간을 뒤집은** 사본을 쓴다 — 원본을 통째로 뒤집으면 앞쪽
    // 무음이 뒤로 가 소리가 늦게 시작한다.
    const buf = reverse ? this.reversedBufferOf(key, loaded, trim, ctx) : loaded
    const playOffset = reverse ? 0 : trim.offset

    const level = this.volume * def.gain * gainScale
    const out = ctx.createGain()
    out.gain.value = level
    out.connect(ctx.destination)

    const src = ctx.createBufferSource()
    src.buffer = buf
    // 매 재생마다 음정을 살짝 흔들고, 그 위에 반음 이조를 곱한다.
    const jitter = rateRange[0] + Math.random() * (rateRange[1] - rateRange[0])
    const rate = jitter * Math.pow(2, semitones / 12)
    src.playbackRate.value = rate
    src.connect(out)

    // 자른 끝은 여운 한가운데라 파형이 0이 아니다 — 짧게 훑어 내려 단차를 없앤다.
    // 실제 흐르는 시간은 재생 속도로 나눈 값이다(이조가 클수록 짧게 끝난다).
    const playSec = trim.duration / rate
    const fade = Math.min(FADE_OUT_S, playSec * 0.5)
    const now = ctx.currentTime
    out.gain.setValueAtTime(level, now + playSec - fade)
    out.gain.linearRampToValueAtTime(0.0001, now + playSec)

    // 잔향 — 짧은 되먹임 딜레이 하나로 "울림"을 만든다. 0이면 계통 자체를 안 만든다.
    let ringNodes: { delay: DelayNode; feedback: GainNode; wet: GainNode } | null = null
    if (ring > 0) {
      const delay = ctx.createDelay(1)
      delay.delayTime.value = RING_DELAY_S
      const feedback = ctx.createGain()
      feedback.gain.value = Math.min(RING_FEEDBACK_MAX, ring * RING_FEEDBACK_MAX)
      const wet = ctx.createGain()
      wet.gain.value = this.volume * def.gain * gainScale * 0.5 * ring
      src.connect(delay)
      delay.connect(feedback)
      feedback.connect(delay) // 되먹임 고리 — feedback < 1이라 스스로 잦아든다.
      delay.connect(wet)
      wet.connect(ctx.destination)
      ringNodes = { delay, feedback, wet }
    }

    src.onended = () => {
      src.disconnect()
      out.disconnect()
      if (!ringNodes) return
      // 되먹임이 잦아들 시간을 준 뒤 끊는다 — 바로 끊으면 여운이 잘린다.
      const tailMs = RING_DELAY_S * 1000 * 12
      window.setTimeout(() => {
        ringNodes.feedback.disconnect()
        ringNodes.delay.disconnect()
        ringNodes.wet.disconnect()
      }, tailMs)
    }
    // 소리가 실제로 나는 구간만 재생한다 — 파일 앞 무음을 건너뛰어 즉발로 들린다.
    src.start(0, playOffset, trim.duration)
  }
}

export const sfx = new SfxManager()
