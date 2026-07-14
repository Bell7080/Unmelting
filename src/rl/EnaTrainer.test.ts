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

  it('학습이 실제로 일어난다: BC+REINFORCE 후 무작위 초기망보다 좋아진다', () => {
    // 단일 시드 마진은 보상 분산으로 출렁이므로(생존 턴은 견고, 리턴은 노이즈), 여러 시드
    // 평균 우위로 학습 신호를 측정한다. 예산도 신호가 분명해지는 수준으로 키운다.
    const seeds = [4, 7, 11]
    let turnsGain = 0
    let returnGain = 0
    for (const seed of seeds) {
      const result = EnaTrainer.train({ hidden: 48, bcEpisodes: 60, bcEpochs: 3, rlEpisodes: 120, seed })
      turnsGain += result.trained.averageTurns - result.random.averageTurns
      returnGain += result.trained.averageReturn - result.random.averageReturn
    }
    // 학습된 정책은 무작위 초기 정책보다 평균적으로 더 오래 살아남고 더 큰 리턴을 얻는다.
    expect(turnsGain / seeds.length).toBeGreaterThan(0)
    expect(returnGain / seeds.length).toBeGreaterThan(0)
  }, 90_000)

  it('학습된 망을 EnaPolicy로 감싸 시뮬레이터를 그대로 구동한다', () => {
    const { network } = EnaTrainer.train({ hidden: 32, bcEpisodes: 20, bcEpochs: 2, rlEpisodes: 20, seed: 9 })
    const policy = policyFromNetwork(network, true)
    const r = new EnaTrainingSimulation(123).runEpisode(policy)
    expect(r.survivedTurns).toBeGreaterThan(0)
    expect(r.samples.length).toBeGreaterThan(0)
  }, 60_000)
})
