/**
 * 효과음 라이브러리 — **무엇이 있고 어떻게 울리는지**의 단일 출처.
 *
 * 재생 로직(`SfxManager`)과 목록을 갈라 둔 이유는, 새 효과음을 넣을 때 고쳐야 할 곳이
 * 이 표 한 줄이 되게 하기 위해서다. 재생 코드에 URL을 직접 넘기지 않는다 —
 * 키만 넘기면 기본 음정/볼륨/다듬기 여유까지 이 표에서 따라온다.
 *
 * 트리밍(`trim`)은 원본 파일을 자르지 않는다. 디코딩한 버퍼에서 **실제 소리가 나는
 * 구간**을 찾아 그 구간만 재생하는 방식이라, 파일 앞뒤의 무음이 그대로 있어도
 * 재생 타이밍이 즉발로 맞는다. 여유(margin)를 둬서 어택이 잘리거나 여운이 뚝
 * 끊기지 않게 한다.
 */
import clickUrl from '../assets/audio/sfx_click.mp3'
import attackUrl from '../assets/audio/sfx_attack.mp3'
import chain001Url from '../assets/audio/chain_001.mp3'
import chain002Url from '../assets/audio/chain_002.mp3'
import chain003Url from '../assets/audio/chain_003.mp3'

/**
 * 무음 판정 임계값 — **최대 진폭 대비 dB**다. 절대값으로 재면 파일마다 녹음 레벨이 달라
 * 어떤 소리는 통째로 잘리고 어떤 소리는 하나도 안 잘린다.
 */
export const TRIM_THRESHOLD_DB = -42
/** 판정 창 길이(초). 표본 하나가 아니라 이 창의 최대값으로 재야 튀는 표본에 속지 않는다. */
export const TRIM_WINDOW_S = 0.01
/**
 * 파일 **맨 끝**에서 무시할 길이(초). 지금 쓰는 mp3는 다섯 개 전부 마지막 10ms에
 * 인코더 패딩이 만든 큰 잡음(피크 대비 -23~-45dB)이 박혀 있다 — 그냥 훑으면 그 '툭'이
 * 소리의 끝으로 잡혀 무음까지 통째로 재생된다. 그 구간은 아예 후보에서 뺀다.
 */
export const TRIM_END_GUARD_S = 0.06
/** 어택 앞에 남길 여유(초). 0으로 자르면 첫 파형이 깎여 '툭' 하고 시작한다. */
export const TRIM_LEAD_S = 0.006
/** 여운 뒤에 남길 여유(초). */
export const TRIM_TAIL_S = 0.03
/**
 * 끝을 끊을 때 넣는 페이드(초). 여운이 남은 자리에서 자르므로 파형이 0이 아니다 —
 * 그냥 끊으면 그 단차가 다시 '툭' 소리가 된다. 짧게 훑어 내려 0으로 만든다.
 */
export const FADE_OUT_S = 0.03

export interface SfxDef {
  url: string
  /** 기본 playbackRate 범위 — 매 재생마다 이 안에서 흔들어 반복 청각 피로를 줄인다. */
  rateRange: [number, number]
  /** 기본 볼륨 배수(마스터 볼륨에 곱해진다). */
  gain: number
}

/**
 * 체인 3종은 파일이 서로 다르다(같은 길이로 뽑혔을 뿐이다). 손패/레시피/유물이
 * 각자의 음색을 갖고, 체인이 쌓일수록 `SfxManager.playChain`이 반음씩 올려 준다.
 */
export const SFX_LIBRARY = {
  click: { url: clickUrl, rateRange: [0.94, 1.06], gain: 1 },
  attack: { url: attackUrl, rateRange: [0.94, 1.06], gain: 1 },
  /** 체인 1 — 손패를 썼을 때. */
  chainHand: { url: chain001Url, rateRange: [0.99, 1.01], gain: 0.72 },
  /** 체인 2 — 레시피가 터졌을 때. */
  chainRecipe: { url: chain002Url, rateRange: [0.99, 1.01], gain: 0.78 },
  /** 체인 3 — 유물이 발동했을 때. */
  chainRelic: { url: chain003Url, rateRange: [0.99, 1.01], gain: 0.74 },
} as const satisfies Record<string, SfxDef>

export type SfxKey = keyof typeof SFX_LIBRARY

/** 체인 배너 이벤트 종류 → 효과음 키. 새 체인 종류는 여기 한 줄이면 소리가 붙는다. */
export const CHAIN_SFX_BY_KIND = {
  card: 'chainHand',
  recipe: 'chainRecipe',
  relic: 'chainRelic',
  /** 게이지 만충은 체인의 결산이라 유물 음색을 한 옥타브 위에서 울린다. */
  gauge: 'chainRelic',
} as const satisfies Record<string, SfxKey>

export type ChainSfxKind = keyof typeof CHAIN_SFX_BY_KIND
