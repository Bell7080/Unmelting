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
    // 테스트 속도를 위해 작게 돌리되, 학습 신호가 분명히 나타나도록 구성한다.
    const result = EnaTrainer.train({ hidden: 48, bcEpisodes: 40, bcEpochs: 3, rlEpisodes: 60, seed: 4 })
    // 학습된 정책은 무작위 초기 정책보다 더 오래 살아남고 더 큰 리턴을 얻는다.
    expect(result.trained.averageTurns).toBeGreaterThan(result.random.averageTurns)
    expect(result.trained.averageReturn).toBeGreaterThan(result.random.averageReturn)
  }, 60_000)

  it('학습된 망을 EnaPolicy로 감싸 시뮬레이터를 그대로 구동한다', () => {
    const { network } = EnaTrainer.train({ hidden: 32, bcEpisodes: 20, bcEpochs: 2, rlEpisodes: 20, seed: 9 })
    const policy = policyFromNetwork(network, true)
    const r = new EnaTrainingSimulation(123).runEpisode(policy)
    expect(r.survivedTurns).toBeGreaterThan(0)
    expect(r.samples.length).toBeGreaterThan(0)
  }, 60_000)
})
