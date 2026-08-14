import { describe, expect, it } from 'vitest'
import { EnaTrainingSimulation } from './EnaTrainingSimulation'
import { EnaDispositionFitter, survivalScore, helpCost, isShippable } from './EnaDispositionFitter'
import {
  defaultDisposition,
  clampDisposition,
  fromSimFittedSnapshot,
  BASE_DISPOSITION,
  ROOKIE_DISPOSITION,
  CURRENT_SIM_FITTED,
} from '@systems/EnaDisposition'
import { experienceCalibrationViolations } from '@ui/ExperienceAxes'

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

  it('동봉 토대는 재피팅이 후보에 요구하는 경험 탭 대역을 스스로도 지킨다', () => {
    // 피터가 후보를 이 대역으로 거른다(isShippable). 정작 배송 중인 값이 대역 밖이면
    // 재피팅은 '지금보다 나쁜 것만 통과하는' 검사가 된다 — 기준선부터 맞아야 한다.
    expect(isShippable(fromSimFittedSnapshot(CURRENT_SIM_FITTED))).toBe(true)
    expect(experienceCalibrationViolations(BASE_DISPOSITION, ROOKIE_DISPOSITION)).toEqual([])
  })

  it('학습 토대는 시뮬에서 손-튜닝 기본값 이상으로 플레이어를 살린다', () => {
    // 합체 적 보너스 구간표처럼 공용 전장 밸런스가 바뀌면 고정 시드 평균이 소폭 이동한다.
    // 1.5턴 허용폭은 동봉 성향의 실질 퇴행을 막으면서 60개 시드 중 일부 경로 변화는 받아들인다.
    expect(survivalScore(BASE_DISPOSITION, SEEDS)).toBeGreaterThanOrEqual(survivalScore(defaultDisposition(), SEEDS) - 1.5)
  }, 60_000)
})
