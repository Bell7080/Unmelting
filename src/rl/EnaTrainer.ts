/**
 * EnaTrainer - 에나 정책망을 시뮬레이터로 학습시키는 온디바이스 학습 루프(순수 TS).
 *
 * 2단계: (1) 교사 정책 행동 클로닝(BC)으로 빠른 워밍업, (2) REINFORCE 정책경사로 보상 기반 개선.
 * 둘 다 EnaTrainingSimulation의 (state, action, reward)만으로 동작하며, 학습된 EnaPolicyNetwork는
 * 게임에 동봉하거나 localStorage에 저장해 추론에 쓴다. 이후 플레이어별 미세조정은 같은 루프에
 * 실제 런 로그를 넣어 이어 돌리면 된다.
 */

import {
  EnaTrainingSimulation,
  ENA_ACTION_SPACE,
  EnaRandom,
  ENA_FEATURE_COUNT,
  type EnaObservation,
  type EnaPolicy,
  type EnaSimDifficulty,
} from './EnaTrainingSimulation'
import { EnaPolicyNetwork } from './EnaPolicyNetwork'

const ACTION_DIM = ENA_ACTION_SPACE.length

/** 학습 하이퍼파라미터. 테스트는 작게, 실제 사전학습은 크게 돌린다. */
export interface EnaTrainConfig {
  hidden: number
  bcEpisodes: number
  bcEpochs: number
  bcLr: number
  rlEpisodes: number
  rlLr: number
  gamma: number
  seed: number
  /** 학습 아크 난이도. 'sprout'로 두면 새싹 병아리 30층 온보딩을 별도 헤드리스 사전학습으로 돌린다. */
  difficulty: EnaSimDifficulty
}

export const DEFAULT_TRAIN_CONFIG: EnaTrainConfig = {
  hidden: 64,
  bcEpisodes: 60,
  bcEpochs: 4,
  bcLr: 1e-3,
  rlEpisodes: 150,
  rlLr: 5e-4,
  gamma: 0.99,
  seed: 1,
  difficulty: 'standard',
}

export interface EnaEvalMetrics {
  averageReturn: number
  averageTurns: number
  averageBosses: number
  winRate: number
}

export interface EnaTrainResult {
  network: EnaPolicyNetwork
  random: EnaEvalMetrics
  trained: EnaEvalMetrics
}

interface Step {
  x: number[]
  mask: boolean[]
  action: number
  reward: number
}

/** 관측의 합법 행동 목록을 길이 21 불리언 마스크로 변환한다. */
export function legalMaskOf(obs: EnaObservation): boolean[] {
  const mask = new Array<boolean>(ACTION_DIM).fill(false)
  for (const a of obs.legalActions) {
    const idx = ENA_ACTION_SPACE.findIndex((s) => s.kind === a.kind && s.arg === a.arg)
    if (idx >= 0) mask[idx] = true
  }
  return mask
}

/** 학습된 망을 시뮬레이터용 EnaPolicy로 감싼다. greedy=true면 argmax 추론. */
export function policyFromNetwork(net: EnaPolicyNetwork, greedy: boolean): EnaPolicy {
  return (obs: EnaObservation, rng: EnaRandom): number => {
    const mask = legalMaskOf(obs)
    return greedy ? net.act(obs.features, mask) : net.sample(obs.features, mask, rng).action
  }
}

/** 한 에피소드를 정책으로 굴리며 각 스텝의 (state, mask, action, reward)를 기록한다. */
function rollout(sim: EnaTrainingSimulation, policy: EnaPolicy, rng: EnaRandom): Step[] {
  const steps: Step[] = []
  let obs = sim.reset()
  let guard = 0
  while (guard++ < 5000) {
    const mask = legalMaskOf(obs)
    const action = policy(obs, rng)
    const res = sim.step(action)
    steps.push({ x: obs.features, mask, action, reward: res.reward })
    obs = res.observation
    if (res.done) break
  }
  return steps
}

export class EnaTrainer {
  /** 교사 정책으로 BC 학습 데이터(각 스텝의 마스크/행동)를 모은다. */
  static collectTeacherData(episodes: number, seed: number, rng: EnaRandom, difficulty: EnaSimDifficulty = 'standard'): Step[] {
    const data: Step[] = []
    for (let i = 0; i < episodes; i++) {
      const sim = new EnaTrainingSimulation(seed + i, undefined, difficulty)
      for (const s of rollout(sim, EnaTrainingSimulation.teacherPolicy, rng)) data.push(s)
    }
    return data
  }

  /** 행동 클로닝: 교사 행동을 정답으로 한 지도학습으로 망을 빠르게 워밍업한다. */
  static behaviorClone(net: EnaPolicyNetwork, data: Step[], epochs: number, lr: number, rng: EnaRandom): void {
    const order = data.map((_, i) => i)
    for (let e = 0; e < epochs; e++) {
      shuffle(order, rng)
      for (const i of order) {
        const s = data[i]
        net.trainBehaviorClone(s.x, s.action, s.mask, lr)
      }
    }
  }

  /** REINFORCE: 망 자신의 표본 궤적과 정규화된 리턴(우위)으로 정책을 개선한다. */
  static reinforce(net: EnaPolicyNetwork, episodes: number, seed: number, lr: number, gamma: number, rng: EnaRandom, difficulty: EnaSimDifficulty = 'standard'): void {
    const samplePolicy = policyFromNetwork(net, false)
    for (let i = 0; i < episodes; i++) {
      const sim = new EnaTrainingSimulation(seed + i * 101 + 7, undefined, difficulty)
      const steps = rollout(sim, samplePolicy, rng)
      if (steps.length === 0) continue
      // 할인 리턴 후 에피소드 단위 z-정규화로 분산을 줄인다(베이스라인 역할).
      const returns = new Array<number>(steps.length)
      let g = 0
      for (let t = steps.length - 1; t >= 0; t--) {
        g = steps[t].reward + gamma * g
        returns[t] = g
      }
      const mean = returns.reduce((a, b) => a + b, 0) / returns.length
      const variance = returns.reduce((a, b) => a + (b - mean) * (b - mean), 0) / returns.length
      const std = Math.sqrt(variance) + 1e-6
      for (let t = 0; t < steps.length; t++) {
        const advantage = (returns[t] - mean) / std
        net.trainReinforce(steps[t].x, steps[t].action, advantage, steps[t].mask, lr)
      }
    }
  }

  /** 정책을 여러 시드로 그리디 평가해 평균 리턴/생존턴/보스/승률을 낸다. */
  static evaluate(policy: EnaPolicy, seeds: number[], difficulty: EnaSimDifficulty = 'standard'): EnaEvalMetrics {
    let ret = 0
    let turns = 0
    let bosses = 0
    let wins = 0
    for (const seed of seeds) {
      const sim = new EnaTrainingSimulation(seed, undefined, difficulty)
      const r = sim.runEpisode(policy)
      ret += r.totalReward
      turns += r.survivedTurns
      bosses += r.bossesCleared
      if (r.won) wins++
    }
    const n = seeds.length
    return { averageReturn: ret / n, averageTurns: turns / n, averageBosses: bosses / n, winRate: wins / n }
  }

  /** 전체 파이프라인: 무작위 baseline 평가 → BC 워밍업 → REINFORCE → 학습 후 평가. */
  static train(config: Partial<EnaTrainConfig> = {}): EnaTrainResult {
    const cfg = { ...DEFAULT_TRAIN_CONFIG, ...config }
    const rng = new EnaRandom(cfg.seed)
    const net = new EnaPolicyNetwork(ENA_FEATURE_COUNT, cfg.hidden, ACTION_DIM, new EnaRandom(cfg.seed + 1))
    const evalSeeds = Array.from({ length: 40 }, (_, i) => 5000 + i * 7)

    const random = EnaTrainer.evaluate(policyFromNetwork(net, true), evalSeeds, cfg.difficulty)

    const teacherData = EnaTrainer.collectTeacherData(cfg.bcEpisodes, cfg.seed * 31 + 3, rng, cfg.difficulty)
    EnaTrainer.behaviorClone(net, teacherData, cfg.bcEpochs, cfg.bcLr, rng)
    EnaTrainer.reinforce(net, cfg.rlEpisodes, cfg.seed * 53 + 11, cfg.rlLr, cfg.gamma, rng, cfg.difficulty)

    const trained = EnaTrainer.evaluate(policyFromNetwork(net, true), evalSeeds, cfg.difficulty)
    return { network: net, random, trained }
  }
}

function shuffle<T>(arr: T[], rng: EnaRandom): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rng.int(i + 1)
    const tmp = arr[i]
    arr[i] = arr[j]
    arr[j] = tmp
  }
}
