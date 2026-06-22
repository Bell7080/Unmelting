import { describe, expect, it } from 'vitest'
import { EnaTrainingSimulation, ENA_ACTION_SPACE } from './EnaTrainingSimulation'

describe('EnaTrainingSimulation', () => {
  it('딥러닝 입력 벡터와 확장 행동 공간 크기를 고정한다', () => {
    const sim = new EnaTrainingSimulation(7)
    const observation = sim.reset()
    expect(observation.features).toHaveLength(120)
    expect(ENA_ACTION_SPACE).toHaveLength(25)
    expect(observation.legalActions.length).toBeGreaterThan(0)
  })

  it('교사 정책으로 국면/손패/보스 판단이 포함된 학습 샘플을 생성한다', () => {
    const dataset = EnaTrainingSimulation.collectDataset(3, 11)
    expect(dataset.length).toBeGreaterThan(5)
    expect(dataset.every((sample) => sample.state.length === 120 && sample.nextState.length === 120)).toBe(true)
    expect(dataset.every((sample) => sample.actionIndex >= 0 && sample.actionIndex < ENA_ACTION_SPACE.length)).toBe(true)
  })

  it('현재 상황을 플레이어 체감 전략 문장으로 분석한다', () => {
    const sim = new EnaTrainingSimulation(13)
    const analysis = sim.analyzeDecision()
    expect(analysis.projectedDamage).toBeGreaterThan(0)
    expect(analysis.reason).toContain('불씨')
  })
})
