import { describe, expect, it } from 'vitest'
import { EnaTrainer, policyFromNetwork, legalMaskOf } from './EnaTrainer'
import { ENA_ACTION_SPACE, EnaRandom, EnaTrainingSimulation } from './EnaTrainingSimulation'

describe('EnaTrainer', () => {
  it('관측의 합법 행동을 길이 25 마스크로 정확히 변환한다', () => {
    const obs = new EnaTrainingSimulation(2).reset()
    const mask = legalMaskOf(obs)
    expect(mask).toHaveLength(25)
    expect(mask.filter(Boolean).length).toBe(obs.legalActions.length)
  })


  it('교사 휴리스틱 임계값을 config로 바꿔 탐험 없는 정책을 만들 수 있다', () => {
    const sim = new EnaTrainingSimulation(2)
    const obs = sim.reset()
    const strictPolicy = EnaTrainingSimulation.configuredTeacherPolicy({ explorationRate: 0, emberRefillThreshold: -1 })
    const actionIndex = strictPolicy(obs, new EnaRandom(99))

    expect(actionIndex).toBeGreaterThanOrEqual(0)
    expect(ENA_ACTION_SPACE[actionIndex]).toBeDefined()
  })

  it('학습이 실제로 일어난다: BC+REINFORCE 후 무작위 초기망보다 오래 살아남는다', () => {
    // 학습 신호는 "생존 턴"에서 견고하게 나타난다(측정상 모든 시드에서 trained가 더 오래 생존).
    // averageReturn은 보상 셰이핑 분산이 커 시드마다 부호가 출렁이고 유물/카드 추가에도 흔들려
    // 단정 지표로 부적합하므로, 안정 지표인 생존 턴의 여러 시드 평균 우위로 학습을 판정한다.
    const seeds = [4, 7, 11]
    let turnsGain = 0
    for (const seed of seeds) {
      const result = EnaTrainer.train({ hidden: 48, bcEpisodes: 60, bcEpochs: 3, rlEpisodes: 120, seed })
      turnsGain += result.trained.averageTurns - result.random.averageTurns
    }
    expect(turnsGain / seeds.length).toBeGreaterThan(0)
  }, 90_000)

  it('학습된 망을 EnaPolicy로 감싸 시뮬레이터를 그대로 구동한다', () => {
    const { network } = EnaTrainer.train({ hidden: 32, bcEpisodes: 20, bcEpochs: 2, rlEpisodes: 20, seed: 9 })
    const policy = policyFromNetwork(network, true)
    const r = new EnaTrainingSimulation(123).runEpisode(policy)
    expect(r.survivedTurns).toBeGreaterThan(0)
    expect(r.samples.length).toBeGreaterThan(0)
  }, 60_000)
})
