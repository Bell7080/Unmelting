import { describe, expect, it } from 'vitest'
import { EnaTrainingSimulation, ENA_ACTION_SPACE } from './EnaTrainingSimulation'

describe('EnaTrainingSimulation', () => {
  it('딥러닝 입력 벡터와 행동 공간 크기를 고정한다', () => {
    const sim = new EnaTrainingSimulation(7)
    const observation = sim.reset()
    // 스칼라 34 + 9칸×14 + 손패 10×9 = 250.
    expect(observation.features).toHaveLength(250)
    // clickLane×3 + useHand×10 + wait + 상점×5 + 이벤트×2 = 21.
    expect(ENA_ACTION_SPACE).toHaveLength(21)
    expect(observation.legalActions.length).toBeGreaterThan(0)
  })

  it('교사 정책으로 100층 한 호의 국면/손패/보스 판단 학습 샘플을 생성한다', () => {
    const dataset = EnaTrainingSimulation.collectDataset(3, 11)
    expect(dataset.length).toBeGreaterThan(20)
    expect(dataset.every((sample) => sample.state.length === 250 && sample.nextState.length === 250)).toBe(true)
    expect(dataset.every((sample) => sample.actionIndex >= 0 && sample.actionIndex < ENA_ACTION_SPACE.length)).toBe(true)
  })

  it('상점·제단·보스 국면을 실제로 거치며 일부 런은 보스를 격파한다(완주 가능한 등반)', () => {
    let bossesCleared = 0
    let deepestTurn = 0
    const phases = new Set<string>()
    for (let seed = 0; seed < 30; seed++) {
      const sim = new EnaTrainingSimulation(seed * 13 + 1)
      const result = sim.runEpisode()
      bossesCleared = Math.max(bossesCleared, result.bossesCleared)
      deepestTurn = Math.max(deepestTurn, result.survivedTurns)
      for (const line of result.trace) phases.add(line.split(':')[1])
    }
    expect(phases.has('shop')).toBe(true)
    expect(phases.has('boss')).toBe(true)
    // 약한 교사 정책으로도 일부 시드는 30F 보스를 넘겨 등반이 이어진다(학습 그래디언트 존재).
    expect(bossesCleared).toBeGreaterThan(0)
    expect(deepestTurn).toBeGreaterThan(30)
  })

  it('현재 상황을 플레이어 체감 전략 문장으로 분석한다', () => {
    const sim = new EnaTrainingSimulation(13)
    const analysis = sim.analyzeDecision()
    expect(analysis.projectedDamage).toBeGreaterThan(0)
    expect(analysis.reason).toContain('불씨')
  })
})
