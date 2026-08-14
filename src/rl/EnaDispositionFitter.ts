/**
 * EnaDispositionFitter - 시뮬레이터로 에나의 '기본 성향'을 학습하는 블랙박스 최적화기(순수 TS).
 *
 * 동료 개입(클러치/예측/깜짝지원/각성)을 켠 시뮬에서, 어떤 성향이 시뮬 플레이어를 더 깊이
 * 살리는지를 측정해 게임플레이 관련 성향 노브를 맞춘다. "도움이 많을수록 무조건 생존이 깊어지는"
 * 퇴행을 막기 위해 과보호 비용(helpCost) 정규화를 더해, 무작정 최대치가 아니라 **효율적인 도움
 * 배분**을 찾는다. 수다/취향 노브(발화확률·턴 간격 등)는 시뮬로 평가 불가라 손대지 않고
 * 온라인 per-player 적응에 맡긴다.
 *
 * 결과(학습된 기본 성향)는 EnaDisposition.BASE_DISPOSITION으로 동봉되어 라이브 토대가 되고,
 * 그 위에서 per-player 적응이 개인화한다.
 */

import { EnaTrainingSimulation, EnaRandom, type EnaPolicy } from './EnaTrainingSimulation'
import { EnaTrainer, policyFromNetwork, type EnaTrainConfig } from './EnaTrainer'
import {
  cloneDisposition,
  clampDisposition,
  blendSimFitted,
  buildRookieFrom,
  toSimFittedSnapshot,
  fromSimFittedSnapshot,
  CURRENT_SIM_FITTED,
  SUPPORT_ROLE_WEIGHT_BOUND,
  type EnaDisposition,
  type SupportRoleWeights,
} from '@systems/EnaDisposition'
import { experienceCalibrationViolations } from '@ui/ExperienceAxes'

/** 기본 시뮬 플레이어 = 교사 휴리스틱 정책. 피팅은 이 위에 학습된 정책망을 더해 다양화한다. */
const TEACHER_PLAYER: EnaPolicy = EnaTrainingSimulation.teacherPolicy

/** 시뮬로 맞추는 '게임플레이 도움' 노브와 각 탐색 범위. 취향(수다) 노브는 제외한다. */
const FIT_RANGES: { key: keyof EnaDisposition; lo: number; hi: number }[] = [
  { key: 'clutchHpThreshold', lo: 0.2, hi: 0.6 },
  { key: 'clutchHealVsShield', lo: 0, hi: 1 },
  { key: 'clutchHealRatio', lo: 0.15, hi: 0.5 },
  { key: 'clutchShieldRatio', lo: 0.1, hi: 0.45 },
  { key: 'clutchStrength', lo: 0.6, hi: 1.6 },
  { key: 'willGainPerDamage', lo: 30, hi: 100 },
  { key: 'willGainFlatBonus', lo: 0, hi: 15 },
  { key: 'awakenChance', lo: 0.02, hi: 0.4 },
  { key: 'predictBaseChance', lo: 0.02, hi: 0.95 },
  { key: 'predictCooldown', lo: 2, hi: 20 },
]

/** 깜짝지원 확률(중첩 레코드)도 같은 범위로 탐색한다. */
const MINOR_KEYS = ['crit', 'dodge', 'trap', 'treasure'] as const

/** HandCardAdvisor 기대 HP 환산의 역할 가중(청소/처치/방어/자원/회복)도 피팅 대상으로 노출한다.
 *  동봉된 SIM_FITTED에 함께 반영되어 있으며, 재피팅 실행 시 같은 범위에서 다시 탐색된다. */
export const SUPPORT_ROLE_KEYS = ['cleanup', 'attack', 'defense', 'resource', 'recovery'] as const satisfies readonly (keyof SupportRoleWeights)[]

export interface FitConfig {
  iterations: number
  evalSeeds: number
  /** 과보호 패널티 가중치(클수록 도움을 아낀다). */
  lambda: number
  /** 섭동 크기(각 노브 범위 대비 비율). */
  stepScale: number
  seed: number
  /** 시뮬 플레이어 정책 풀. 여러 개면 모두에게 두루 좋은(robust) 성향을 찾는다. 기본=교사. */
  playerPolicies: EnaPolicy[]
  /**
   * 언덕 오르기 출발점. 생략하면 **현재 동봉 스냅샷**에서 시작한다.
   *
   * 손-튜닝 기본값에서 시작하지 않는 이유가 둘이다. ① 재피팅의 목적은 "지금 배송 중인
   * 값보다 나은가"이므로 그 값이 출발점이어야 비교가 성립한다. ② 기본값은 경험 탭 성좌
   * 대역(isShippable) 밖이라, 거기서 출발하면 무작위 섭동이 대역 안으로 들어올 때까지
   * 후보가 전부 −∞로 탈락해 탐색이 헛돈다.
   */
  start?: EnaDisposition
}

export const DEFAULT_FIT_CONFIG: FitConfig = {
  iterations: 120,
  evalSeeds: 60,
  lambda: 6,
  stepScale: 0.18,
  seed: 1,
  playerPolicies: [TEACHER_PLAYER],
  start: fromSimFittedSnapshot(CURRENT_SIM_FITTED),
}

export interface FitResult {
  disposition: EnaDisposition
  baselineScore: number
  baselineFitness: number
  fittedScore: number
  fittedFitness: number
}

/** 시뮬 플레이어가 이 성향의 동료와 함께 얼마나 깊이 가는지 — 생존+보스 깊이 점수(여러 정책 평균). */
export function survivalScore(
  disp: EnaDisposition,
  seeds: number[],
  policies: EnaPolicy[] = [TEACHER_PLAYER]
): number {
  let total = 0
  for (const policy of policies) {
    for (const seed of seeds) {
      const r = new EnaTrainingSimulation(seed, disp).runEpisode(policy)
      total += r.survivedTurns + r.bossesCleared * 15 + (r.won ? 40 : 0)
    }
  }
  return total / (seeds.length * policies.length)
}

/** 과보호 비용 — 게임플레이 도움 노브가 얼마나 관대한지의 정규화 합(0=인색, 큼=과보호). */
export function helpCost(disp: EnaDisposition): number {
  const norm = (v: number, lo: number, hi: number) => (v - lo) / (hi - lo)
  let cost = 0
  cost += norm(disp.clutchStrength, 0.6, 1.6)
  cost += norm(disp.willGainPerDamage, 30, 100)
  cost += norm(disp.willGainFlatBonus, 0, 15)
  cost += norm(disp.awakenChance, 0.02, 0.4)
  cost += norm(disp.predictBaseChance, 0.02, 0.95)
  cost += norm(disp.clutchHpThreshold, 0.2, 0.6) // 높을수록 더 자주 클러치(더 관대)
  cost += 1 - norm(disp.predictCooldown, 2, 20) // 짧을수록 더 자주 예측(더 관대)
  for (const k of MINOR_KEYS) cost += norm(disp.minorClutchChance[k], 0.02, 0.95)
  return cost
}

/**
 * 후보가 **배송 가능한가** — 경험 탭 성좌 대역을 지키는지 본다.
 *
 * 시뮬은 생존만 본다. 생존에 좋다는 이유로 각성을 상한까지 밀면 불굴 축만 튀어 육각형이
 * 한 축짜리로 보이는 식으로, 점수는 오르는데 화면이 무너지는 후보가 나온다. 그런 후보는
 * 사람이 나중에 걸러야 하고 그러면 피팅이 헛돈다 — 탐색 단계에서 잘라 낸다.
 * 판정은 **배송되는 형태**(0.5 블렌드 + 그 토대에서 파생한 초보 성향)에서 한다.
 */
export function isShippable(disp: EnaDisposition): boolean {
  const base = blendSimFitted(toSimFittedSnapshot(disp))
  return experienceCalibrationViolations(base, buildRookieFrom(base)).length === 0
}

/** 정규화 목적함수: 생존 점수 − λ·과보호 비용. 효율적 도움 배분을 찾게 한다.
 *  표기 대역을 어긴 후보는 점수와 무관하게 탈락시킨다(−∞). */
export function dispositionFitness(
  disp: EnaDisposition,
  seeds: number[],
  lambda: number,
  policies: EnaPolicy[] = [TEACHER_PLAYER]
): number {
  if (!isShippable(disp)) return Number.NEGATIVE_INFINITY
  return survivalScore(disp, seeds, policies) - lambda * helpCost(disp)
}

/** 게임플레이 노브 일부에 가우시안 섭동을 가한 후보 성향을 만든다(취향 노브는 불변). */
function perturb(base: EnaDisposition, rng: EnaRandom, stepScale: number): EnaDisposition {
  const d = cloneDisposition(base)
  for (const { key, lo, hi } of FIT_RANGES) {
    if (rng.next() < 0.5) continue
    const noise = gaussian(rng) * (hi - lo) * stepScale
    ;(d[key] as number) = (d[key] as number) + noise
  }
  for (const k of MINOR_KEYS) {
    if (rng.next() < 0.5) continue
    d.minorClutchChance[k] += gaussian(rng) * (0.95 - 0.02) * stepScale
  }
  // 역할 가중 섭동: 시뮬 예지/클러치가 advisor를 공유하므로 이 노브도 생존 점수에 반영된다.
  d.supportRoleWeights = d.supportRoleWeights ?? { cleanup: 1, attack: 1, defense: 1, resource: 1, recovery: 1 }
  for (const k of SUPPORT_ROLE_KEYS) {
    if (rng.next() < 0.5) continue
    d.supportRoleWeights[k] += gaussian(rng) * (SUPPORT_ROLE_WEIGHT_BOUND.hi - SUPPORT_ROLE_WEIGHT_BOUND.lo) * stepScale
  }
  return clampDisposition(d)
}

/** (1+1) 진화 전략 / 언덕 오르기로 기본 성향을 맞춘다. 결정적 평가 시드라 안정적으로 수렴한다. */
export class EnaDispositionFitter {
  static fit(config: Partial<FitConfig> = {}): FitResult {
    const cfg = { ...DEFAULT_FIT_CONFIG, ...config }
    const rng = new EnaRandom(cfg.seed)
    const seeds = Array.from({ length: cfg.evalSeeds }, (_, i) => 3000 + i * 7)
    const policies = cfg.playerPolicies

    let best = clampDisposition(cloneDisposition(cfg.start ?? fromSimFittedSnapshot(CURRENT_SIM_FITTED)))
    const baselineScore = survivalScore(best, seeds, policies)
    // 출발점이 이미 표기 대역을 어기면 −∞로 시작해, 처음 나온 배송 가능한 후보가 곧장 이긴다.
    let bestFit = dispositionFitness(best, seeds, cfg.lambda, policies)
    const baselineFitness = bestFit

    for (let i = 0; i < cfg.iterations; i++) {
      const cand = perturb(best, rng, cfg.stepScale)
      const fit = dispositionFitness(cand, seeds, cfg.lambda, policies)
      if (fit > bestFit) {
        best = cand
        bestFit = fit
      }
    }

    return {
      disposition: best,
      baselineScore,
      baselineFitness,
      fittedScore: survivalScore(best, seeds, policies),
      fittedFitness: bestFit,
    }
  }

  /** 정책망을 학습해 시뮬 플레이어(그리디 추론) 하나를 만든다. 피팅 루프에 '학습된 플레이어'를 넣는다. */
  static makeLearnedPlayer(trainConfig: Partial<EnaTrainConfig> = {}): EnaPolicy {
    const { network } = EnaTrainer.train(trainConfig)
    return policyFromNetwork(network, true)
  }
}

/** Box-Muller 표준정규 표본(섭동용). */
function gaussian(rng: EnaRandom): number {
  const u = Math.max(1e-9, rng.next())
  const v = rng.next()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}
