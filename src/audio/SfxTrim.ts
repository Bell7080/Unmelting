/**
 * 효과음 다듬기 판정 — 디코딩한 버퍼에서 **실제 소리가 나는 구간**을 찾는다.
 *
 * 원본 파일을 자르지 않고 재생 구간만 좁히는 방식이라, 에셋을 다시 뽑지 않아도
 * 재생 타이밍이 화면과 맞는다. `SfxManager`에서 갈라 둔 이유는 순수 함수라
 * 테스트로 규칙을 고정하기 위해서다(`SfxTrim.test.ts`).
 */
import {
  TRIM_THRESHOLD_DB,
  TRIM_WINDOW_S,
  TRIM_END_GUARD_S,
  TRIM_LEAD_S,
  TRIM_TAIL_S,
} from './SfxLibrary'

/** 소리가 실제로 나는 구간(초). */
export interface TrimWindow {
  offset: number
  duration: number
}

/**
 * 창(10ms) 단위 최대 진폭을 **피크 대비 dB**로 재서 앞뒤를 자른다.
 *
 * 두 가지가 핵심이다.
 *  - 절대값이 아니라 피크 대비로 잰다. 절대값이면 녹음 레벨이 낮은 파일이 통째로 잘린다.
 *  - 파일 **맨 끝**은 후보에서 뺀다. 지금 쓰는 mp3는 전부 마지막 10ms에 인코더 패딩이
 *    만든 큰 잡음이 있어, 그냥 훑으면 그게 소리의 끝으로 잡혀 무음까지 재생된다.
 */
export function measureTrimWindow(buf: AudioBuffer): TrimWindow {
  const rate = buf.sampleRate
  const win = Math.max(1, Math.floor(rate * TRIM_WINDOW_S))
  const winCount = Math.ceil(buf.length / win)
  const winPeak = new Float32Array(winCount)
  let peak = 0
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const data = buf.getChannelData(ch)
    for (let i = 0; i < data.length; i++) {
      const v = Math.abs(data[i]!)
      const w = (i / win) | 0
      if (v > winPeak[w]!) winPeak[w] = v
      if (v > peak) peak = v
    }
  }
  if (peak <= 0) return { offset: 0, duration: buf.duration }
  const threshold = peak * Math.pow(10, TRIM_THRESHOLD_DB / 20)
  const guard = Math.ceil(TRIM_END_GUARD_S / TRIM_WINDOW_S)

  let firstWin = -1
  for (let w = 0; w < winCount; w++) {
    if (winPeak[w]! >= threshold) { firstWin = w; break }
  }
  let lastWin = -1
  for (let w = winCount - 1 - guard; w >= 0; w--) {
    if (winPeak[w]! >= threshold) { lastWin = w; break }
  }
  // 판정이 서지 않으면(전부 조용하거나 가드가 파일보다 길면) 손대지 않는다.
  if (firstWin < 0 || lastWin < firstWin) return { offset: 0, duration: buf.duration }

  const offset = Math.max(0, (firstWin * win) / rate - TRIM_LEAD_S)
  const end = Math.min(buf.duration, ((lastWin + 1) * win) / rate + TRIM_TAIL_S)
  return { offset, duration: Math.max(0.02, end - offset) }
}
