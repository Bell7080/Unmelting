/**
 * EnaPolicyNetwork - 에나 정책망(경량 MLP). 외부 ML 라이브러리 없이 순수 TS로 구현해
 * 브라우저/온디바이스에서 그대로 추론·학습할 수 있게 한다.
 *
 * 입력: EnaTrainingSimulation의 246차원 관측. 출력: 21개 행동 로짓.
 * 합법 행동 마스킹 소프트맥스 + 수동 역전파(Adam)로 행동 클로닝/REINFORCE를 모두 지원한다.
 * 가중치는 JSON 직렬화가 가능해 사전학습 결과를 게임에 동봉하거나 localStorage에 저장한다.
 */

import { EnaRandom } from './EnaTrainingSimulation'

/** 직렬화 가능한 가중치 묶음(게임 동봉/저장용). */
export interface EnaPolicyWeights {
  inDim: number
  hidden: number
  outDim: number
  w1: number[][] // hidden x inDim
  b1: number[] // hidden
  w2: number[][] // outDim x hidden
  b2: number[] // outDim
}

/** 한 번의 forward에서 역전파에 필요한 중간값을 캐싱한다. */
interface ForwardCache {
  x: number[]
  z1: number[] // 은닉 사전활성
  h: number[] // relu(z1)
  logits: number[]
}

const ADAM_B1 = 0.9
const ADAM_B2 = 0.999
const ADAM_EPS = 1e-8

/** Adam 상태(파라미터별 1·2차 모멘트). */
interface AdamTensor2D {
  m: number[][]
  v: number[][]
}
interface AdamTensor1D {
  m: number[]
  v: number[]
}

export class EnaPolicyNetwork {
  readonly inDim: number
  readonly hidden: number
  readonly outDim: number
  private w1: number[][]
  private b1: number[]
  private w2: number[][]
  private b2: number[]

  // Adam 상태 + 스텝 카운터.
  private aw1: AdamTensor2D
  private ab1: AdamTensor1D
  private aw2: AdamTensor2D
  private ab2: AdamTensor1D
  private adamStep = 0

  constructor(inDim: number, hidden: number, outDim: number, rng: EnaRandom = new EnaRandom(1)) {
    this.inDim = inDim
    this.hidden = hidden
    this.outDim = outDim
    // Xavier 균등 초기화 — 깊지 않은 망의 학습 안정성을 위해.
    const s1 = Math.sqrt(6 / (inDim + hidden))
    const s2 = Math.sqrt(6 / (hidden + outDim))
    this.w1 = grid(hidden, inDim, () => (rng.next() * 2 - 1) * s1)
    this.b1 = vec(hidden, 0)
    this.w2 = grid(outDim, hidden, () => (rng.next() * 2 - 1) * s2)
    this.b2 = vec(outDim, 0)
    this.aw1 = { m: grid(hidden, inDim, () => 0), v: grid(hidden, inDim, () => 0) }
    this.ab1 = { m: vec(hidden, 0), v: vec(hidden, 0) }
    this.aw2 = { m: grid(outDim, hidden, () => 0), v: grid(outDim, hidden, () => 0) }
    this.ab2 = { m: vec(outDim, 0), v: vec(outDim, 0) }
  }

  /** 순전파: 입력 → 은닉(ReLU) → 로짓. 역전파용 캐시를 함께 반환한다. */
  private forward(x: number[]): ForwardCache {
    const z1 = vec(this.hidden, 0)
    const h = vec(this.hidden, 0)
    for (let j = 0; j < this.hidden; j++) {
      let sum = this.b1[j]
      const row = this.w1[j]
      for (let i = 0; i < this.inDim; i++) sum += row[i] * x[i]
      z1[j] = sum
      h[j] = sum > 0 ? sum : 0
    }
    const logits = vec(this.outDim, 0)
    for (let k = 0; k < this.outDim; k++) {
      let sum = this.b2[k]
      const row = this.w2[k]
      for (let j = 0; j < this.hidden; j++) sum += row[j] * h[j]
      logits[k] = sum
    }
    return { x, z1, h, logits }
  }

  /** 합법 행동 마스킹 소프트맥스. legalMask[i]=true인 행동에만 확률을 분배한다. */
  policy(x: number[], legalMask: boolean[]): number[] {
    const { logits } = this.forward(x)
    return maskedSoftmax(logits, legalMask)
  }

  /** 그리디(argmax) 추론 — 평가/실전 추론에 사용한다. 합법 행동 중 최댓값. */
  act(x: number[], legalMask: boolean[]): number {
    const { logits } = this.forward(x)
    let best = -1
    let bestVal = -Infinity
    for (let k = 0; k < this.outDim; k++) {
      if (!legalMask[k]) continue
      if (logits[k] > bestVal) {
        bestVal = logits[k]
        best = k
      }
    }
    return best
  }

  /** 확률 표본 추출(탐험). 학습 롤아웃에서 행동을 샘플링한다. */
  sample(x: number[], legalMask: boolean[], rng: EnaRandom): { action: number; probs: number[] } {
    const probs = this.policy(x, legalMask)
    let roll = rng.next()
    for (let k = 0; k < this.outDim; k++) {
      roll -= probs[k]
      if (roll <= 0 && legalMask[k]) return { action: k, probs }
    }
    // 수치 잔차 보정: 마지막 합법 행동으로 폴백.
    for (let k = this.outDim - 1; k >= 0; k--) if (legalMask[k]) return { action: k, probs }
    return { action: 0, probs }
  }

  /**
   * 한 표본에 대한 그래디언트 스텝. dLogits를 받아 역전파 + Adam 갱신한다.
   * - 행동 클로닝(BC): dLogits = probs - onehot(teacherAction)
   * - REINFORCE: dLogits = (probs - onehot(chosen)) * advantage
   * 호출부가 dLogits를 만들고, 합법 마스크 밖 항은 0으로 둔다.
   */
  applyGradient(cache: ForwardCache, dLogits: number[], lr: number): void {
    const { x, z1, h } = cache
    // 출력층 그래디언트.
    const gw2 = grid(this.outDim, this.hidden, () => 0)
    const gb2 = vec(this.outDim, 0)
    const dh = vec(this.hidden, 0)
    for (let k = 0; k < this.outDim; k++) {
      const g = dLogits[k]
      if (g === 0) continue
      gb2[k] = g
      const w2row = this.w2[k]
      const gw2row = gw2[k]
      for (let j = 0; j < this.hidden; j++) {
        gw2row[j] = g * h[j]
        dh[j] += g * w2row[j]
      }
    }
    // 은닉층 그래디언트(ReLU 미분).
    const gw1 = grid(this.hidden, this.inDim, () => 0)
    const gb1 = vec(this.hidden, 0)
    for (let j = 0; j < this.hidden; j++) {
      const dz = z1[j] > 0 ? dh[j] : 0
      if (dz === 0) continue
      gb1[j] = dz
      const gw1row = gw1[j]
      for (let i = 0; i < this.inDim; i++) gw1row[i] = dz * x[i]
    }
    // Adam 갱신.
    this.adamStep++
    adam2D(this.w2, gw2, this.aw2, lr, this.adamStep)
    adam1D(this.b2, gb2, this.ab2, lr, this.adamStep)
    adam2D(this.w1, gw1, this.aw1, lr, this.adamStep)
    adam1D(this.b1, gb1, this.ab1, lr, this.adamStep)
  }

  /** BC 스텝: 교사 행동을 정답으로 한 교차엔트로피 그래디언트를 적용하고 -logπ를 돌려준다. */
  trainBehaviorClone(x: number[], teacherAction: number, legalMask: boolean[], lr: number): number {
    const cache = this.forward(x)
    const probs = maskedSoftmax(cache.logits, legalMask)
    const dLogits = vec(this.outDim, 0)
    for (let k = 0; k < this.outDim; k++) dLogits[k] = (legalMask[k] ? probs[k] : 0) - (k === teacherAction ? 1 : 0)
    this.applyGradient(cache, dLogits, lr)
    return -Math.log(Math.max(1e-9, probs[teacherAction]))
  }

  /** REINFORCE 스텝: 표본 행동/우위로 정책 경사 상승(= 손실 하강) 한 스텝. */
  trainReinforce(x: number[], chosenAction: number, advantage: number, legalMask: boolean[], lr: number): void {
    const cache = this.forward(x)
    const probs = maskedSoftmax(cache.logits, legalMask)
    const dLogits = vec(this.outDim, 0)
    for (let k = 0; k < this.outDim; k++) dLogits[k] = ((legalMask[k] ? probs[k] : 0) - (k === chosenAction ? 1 : 0)) * advantage
    this.applyGradient(cache, dLogits, lr)
  }

  /** 가중치를 JSON으로 직렬화(게임 동봉/저장). Adam 상태는 추론에 불필요해 제외한다. */
  toWeights(): EnaPolicyWeights {
    return {
      inDim: this.inDim,
      hidden: this.hidden,
      outDim: this.outDim,
      w1: this.w1.map((r) => r.slice()),
      b1: this.b1.slice(),
      w2: this.w2.map((r) => r.slice()),
      b2: this.b2.slice(),
    }
  }

  /** 직렬화 가중치로 추론용 망을 복원한다. */
  static fromWeights(weights: EnaPolicyWeights): EnaPolicyNetwork {
    const net = new EnaPolicyNetwork(weights.inDim, weights.hidden, weights.outDim)
    net.w1 = weights.w1.map((r) => r.slice())
    net.b1 = weights.b1.slice()
    net.w2 = weights.w2.map((r) => r.slice())
    net.b2 = weights.b2.slice()
    return net
  }
}

/** 합법 행동만 남기고 소프트맥스. 불법 행동은 확률 0. */
export function maskedSoftmax(logits: number[], legalMask: boolean[]): number[] {
  let max = -Infinity
  for (let k = 0; k < logits.length; k++) if (legalMask[k] && logits[k] > max) max = logits[k]
  if (max === -Infinity) max = 0
  const exps = logits.map((l, k) => (legalMask[k] ? Math.exp(l - max) : 0))
  const sum = exps.reduce((a, b) => a + b, 0) || 1
  return exps.map((e) => e / sum)
}

function adam2D(param: number[][], grad: number[][], state: AdamTensor2D, lr: number, step: number): void {
  const bc1 = 1 - Math.pow(ADAM_B1, step)
  const bc2 = 1 - Math.pow(ADAM_B2, step)
  for (let i = 0; i < param.length; i++) {
    const p = param[i]
    const g = grad[i]
    const m = state.m[i]
    const v = state.v[i]
    for (let j = 0; j < p.length; j++) {
      m[j] = ADAM_B1 * m[j] + (1 - ADAM_B1) * g[j]
      v[j] = ADAM_B2 * v[j] + (1 - ADAM_B2) * g[j] * g[j]
      p[j] -= (lr * (m[j] / bc1)) / (Math.sqrt(v[j] / bc2) + ADAM_EPS)
    }
  }
}

function adam1D(param: number[], grad: number[], state: AdamTensor1D, lr: number, step: number): void {
  const bc1 = 1 - Math.pow(ADAM_B1, step)
  const bc2 = 1 - Math.pow(ADAM_B2, step)
  for (let j = 0; j < param.length; j++) {
    state.m[j] = ADAM_B1 * state.m[j] + (1 - ADAM_B1) * grad[j]
    state.v[j] = ADAM_B2 * state.v[j] + (1 - ADAM_B2) * grad[j] * grad[j]
    param[j] -= (lr * (state.m[j] / bc1)) / (Math.sqrt(state.v[j] / bc2) + ADAM_EPS)
  }
}

function grid(rows: number, cols: number, fill: () => number): number[][] {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, fill))
}

function vec(n: number, value: number): number[] {
  return new Array(n).fill(value)
}
