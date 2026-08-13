/**
 * 다듬기(trim) 판정 테스트.
 *
 * 실제 mp3 다섯 개가 전부 **파일 맨 끝 10ms에 인코더 패딩 잡음**(피크 대비 -23~-45dB)을
 * 갖고 있다. 그걸 소리의 끝으로 잡으면 무음까지 통째로 재생돼 다음 소리와 겹친다 —
 * 이 테스트는 그 상황을 합성 버퍼로 재현해 가드가 실제로 무는지 본다.
 */
import { describe, it, expect } from 'vitest'
import { measureTrimWindow } from './SfxTrim'
import { TRIM_LEAD_S, TRIM_TAIL_S, TRIM_END_GUARD_S } from './SfxLibrary'

const RATE = 48000

/** 테스트용 최소 AudioBuffer — measureTrimWindow가 쓰는 것만 갖춘다. */
function makeBuffer(samples: Float32Array): AudioBuffer {
  return {
    sampleRate: RATE,
    length: samples.length,
    duration: samples.length / RATE,
    numberOfChannels: 1,
    getChannelData: () => samples,
  } as unknown as AudioBuffer
}

/** [0, toneSec) 구간에 진폭 1의 소리, 나머지는 무음인 버퍼. */
function toneThenSilence(toneSec: number, totalSec: number): Float32Array {
  const out = new Float32Array(Math.round(totalSec * RATE))
  for (let i = 0; i < Math.round(toneSec * RATE); i++) out[i] = i % 2 === 0 ? 1 : -1
  return out
}

describe('measureTrimWindow', () => {
  it('뒤쪽 무음을 잘라 소리 구간 + 여유만 남긴다', () => {
    const buf = makeBuffer(toneThenSilence(0.5, 1.5))
    const { offset, duration } = measureTrimWindow(buf)
    expect(offset).toBe(0)
    // 0.5초 소리 + 꼬리 여유. 창(10ms) 단위로 잡히므로 한 창만큼의 오차를 허용한다.
    expect(duration).toBeGreaterThanOrEqual(0.5)
    expect(duration).toBeLessThanOrEqual(0.5 + TRIM_TAIL_S + 0.011)
  })

  it('★ 파일 맨 끝 인코더 패딩 잡음을 소리의 끝으로 잡지 않는다', () => {
    const samples = toneThenSilence(0.4, 1.5)
    // 실제 mp3와 같은 자리 — 마지막 10ms에 큰 잡음을 심는다.
    for (let i = samples.length - Math.round(0.01 * RATE); i < samples.length; i++) {
      samples[i] = i % 2 === 0 ? 0.5 : -0.5
    }
    const { duration } = measureTrimWindow(makeBuffer(samples))
    // 가드가 없으면 1.5초 전체가 잡힌다. 잡히면 안 된다.
    expect(duration).toBeLessThan(1.5 - TRIM_END_GUARD_S)
    expect(duration).toBeLessThanOrEqual(0.4 + TRIM_TAIL_S + 0.011)
  })

  it('앞쪽 무음을 건너뛰되 어택 앞 여유는 남긴다', () => {
    const samples = new Float32Array(Math.round(1.0 * RATE))
    const start = Math.round(0.3 * RATE)
    for (let i = start; i < start + Math.round(0.2 * RATE); i++) samples[i] = i % 2 === 0 ? 1 : -1
    const { offset } = measureTrimWindow(makeBuffer(samples))
    expect(offset).toBeGreaterThan(0.3 - TRIM_LEAD_S - 0.011)
    expect(offset).toBeLessThanOrEqual(0.3)
  })

  it('판정 기준은 절대값이 아니라 피크 대비다 — 작게 녹음된 소리도 같게 잘린다', () => {
    const loud = toneThenSilence(0.5, 1.5)
    const quiet = Float32Array.from(loud, (v) => v * 0.02) // 34dB 작게 녹음한 같은 소리
    expect(measureTrimWindow(makeBuffer(quiet)).duration).toBeCloseTo(
      measureTrimWindow(makeBuffer(loud)).duration,
      6
    )
  })

  it('통째로 조용한 버퍼는 손대지 않는다', () => {
    const buf = makeBuffer(new Float32Array(Math.round(0.5 * RATE)))
    const { offset, duration } = measureTrimWindow(buf)
    expect(offset).toBe(0)
    expect(duration).toBeCloseTo(0.5, 6)
  })
})
