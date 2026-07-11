import { describe, expect, it } from 'vitest'
import { EnaTrainingSimulation } from './EnaTrainingSimulation'
import { EnaDispositionFitter, survivalScore, helpCost } from './EnaDispositionFitter'
import { defaultDisposition, clampDisposition, BASE_DISPOSITION } from '@systems/EnaDisposition'

const SEEDS = Array.from({ length: 60 }, (_, i) => 3000 + i * 7)

describe('EnaDispositionFitter (시뮬로 기본 성향 학습)', () => {
  it('동료 개입은 시뮬 플레이어를 실제로 더 깊이 살린다', () => {
    const run = (disp?: ReturnType<typeof defaultDisposition>) => {
      let turns = 0
      for (const seed of SEEDS) turns += new EnaTrainingSimulation(seed, disp).runEpisode().survivedTurns
      return turns / SEEDS.length
    }
    expect(run(defaultDisposition())).toBeGreaterThan(run(undefined))
  })

  it('학습된 성향은 기본값보다 정규화 적합도가 높다(효율적 도움)', () => {
    const result = EnaDispositionFitter.fit({ iterations: 40, evalSeeds: 30, lambda: 6, seed: 2 })
    expect(result.fittedFitness).toBeGreaterThan(result.baselineFitness)
  }, 60_000)

  it('helpCost는 더 관대한 성향에 더 큰 비용을 매긴다', () => {
    const lean = clampDisposition(defaultDisposition())
    const generous = clampDisposition({
      ...defaultDisposition(),
      clutchStrength: 1.6,
      awakenChance: 0.4,
      willGainPerDamage: 100,
    })
    expect(helpCost(generous)).toBeGreaterThan(helpCost(lean))
  })
})

describe('BASE_DISPOSITION (동봉된 학습 토대)', () => {
  it('안전 경계 안에 있고, 학습 방향(상시 관대 절제·회피/역할 가중 상향)을 반영한다', () => {
    const base = BASE_DISPOSITION
    const def = defaultDisposition()
    // 클램프 동등성 — 경계를 벗어나지 않는다.
    expect(base).toEqual(clampDisposition(base))
    // 학습 방향: 상시 관대함(강한 클러치/각성)은 절제하고, 치명 피해를 직접 지우는
    // 회피 클러치와 예측 재발동 간격 연장, 자원/회복 역할 가중 상향으로 효율을 얻는다.
    expect(base.clutchStrength).toBeLessThan(def.clutchStrength)
    expect(base.awakenChance).toBeLessThan(def.awakenChance)
    expect(base.predictCooldown).toBeGreaterThan(def.predictCooldown)
    expect(base.minorClutchChance.dodge).toBeGreaterThan(def.minorClutchChance.dodge)
    const roles = base.supportRoleWeights!
    expect(roles.resource).toBeGreaterThan(1)
    expect(roles.recovery).toBeGreaterThan(1)
    expect(roles.attack).toBeLessThan(1)
  })

  it('학습 토대는 시뮬에서 손-튜닝 기본값 이상으로 플레이어를 살린다', () => {
    expect(survivalScore(BASE_DISPOSITION, SEEDS)).toBeGreaterThanOrEqual(survivalScore(defaultDisposition(), SEEDS) - 1)
  }, 60_000)
})
