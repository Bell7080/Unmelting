import { describe, expect, it } from 'vitest'
import { CardType } from '@entities/Card'
import { TRIAL_DEFINITIONS } from '@data/Trials'
import { EnaTrainingSimulation, ENA_ACTION_SPACE, type EnaSimCard } from './EnaTrainingSimulation'

/** 테스트 전용 내부 상태 접근 — 강제 시련 누적치·보드를 검사하기 위한 최소 창구. */
interface TrialProbe {
  applyForcedTrial: () => void
  board: (EnaSimCard | null)[][]
  trialEnemyHpBonus: number
  trialEnemyAtkBonus: number
  trialTrapDamageBonus: number
  trialTreasureScale: number
}

function probe(sim: EnaTrainingSimulation): TrialProbe {
  return sim as unknown as TrialProbe
}

describe('EnaTrainingSimulation', () => {
  it('딥러닝 입력 벡터와 행동 공간 크기를 고정한다', () => {
    const sim = new EnaTrainingSimulation(7)
    const observation = sim.reset()
    // 스칼라 60(이벤트/별빛/보스 정체/상점/시련/유물 엔진 포함) + 예고 3칸×6 + 9칸×14 + 손패 10×12 = 324.
    expect(observation.features).toHaveLength(324)
    // clickLane×3 + useHand×10 + wait + 상점×9(무료/유물/6종 팩/EXIT) + 이벤트×4(safe/greedy/trick/bail) = 27.
    expect(ENA_ACTION_SPACE).toHaveLength(27)
    expect(observation.legalActions.length).toBeGreaterThan(0)
  })

  it('교사 정책으로 100층 한 호의 국면/손패/보스 판단 학습 샘플을 생성한다', () => {
    const dataset = EnaTrainingSimulation.collectDataset(3, 11)
    expect(dataset.length).toBeGreaterThan(20)
    expect(dataset.every((sample) => sample.state.length === 324 && sample.nextState.length === 324)).toBe(true)
    expect(dataset.every((sample) => sample.actionIndex >= 0 && sample.actionIndex < ENA_ACTION_SPACE.length)).toBe(true)
  })

  it('상점·제단·보스 국면을 실제로 거치며 일부 런은 보스를 격파한다(완주 가능한 등반)', () => {
    let bossesCleared = 0
    let deepestTurn = 0
    let trialAppliedAfterBoss = false
    const phases = new Set<string>()
    // 약한 교사 정책의 30F 격파는 본래 드문 사건(~1%)이고, 유물/카드가 추가될 때마다
    // EnaKnowledgeAdapter의 텍스트/평균가 기반 지식이 흔들려 시드별 궤적이 이동한다.
    // 특정 30시드에 의존하지 않도록 넉넉한 표본으로 "격파가 가능함(그래디언트 존재)"만 확인한다.
    // (에피소드는 대부분 30F 벽에서 끝나 매우 짧아 수백 시드도 1초 미만이다.)
    const SEED_COUNT = 600
    for (let seed = 0; seed < SEED_COUNT; seed++) {
      const sim = new EnaTrainingSimulation(seed * 13 + 1)
      const result = sim.runEpisode()
      bossesCleared = Math.max(bossesCleared, result.bossesCleared)
      deepestTurn = Math.max(deepestTurn, result.survivedTurns)
      for (const line of result.trace) phases.add(line.split(':')[1])
      // 30/60/90F 격파가 있었던 런은 강제 시련 3종 중 1개가 반드시 적용돼 있어야 한다.
      if (result.bossesCleared > 0) {
        const p = probe(sim)
        const anyTrial =
          p.trialEnemyHpBonus > 0 || p.trialTrapDamageBonus > 0 || p.trialTreasureScale < 1
        trialAppliedAfterBoss = trialAppliedAfterBoss || anyTrial
        expect(anyTrial).toBe(true)
      }
    }
    expect(phases.has('shop')).toBe(true)
    expect(phases.has('boss')).toBe(true)
    // 약한 교사 정책으로도 일부 시드는 30F 보스를 넘겨 등반이 이어진다(학습 그래디언트 존재).
    expect(bossesCleared).toBeGreaterThan(0)
    expect(deepestTurn).toBeGreaterThan(30) // 보스 격파 시에만 런 턴이 30을 넘어간다.
    expect(trialAppliedAfterBoss).toBe(true)
  })

  it('새싹 병아리 난이도는 30층 양초 고양이 아크로 분류되고 클리어에 강제 시련이 없다', () => {
    // 아크 길이/보스 층 분류가 온보딩 규격(30층 · 보스 [30])으로 잡히는지 확인.
    const cfgProbe = new EnaTrainingSimulation(1, undefined, 'sprout') as unknown as {
      runTargetTurns: number
      bossFloors: readonly number[]
    }
    expect(cfgProbe.runTargetTurns).toBe(30)
    expect([...cfgProbe.bossFloors]).toEqual([30])

    let reachedBoss = false
    let cleared = false
    let deepest = 0
    const SEED_COUNT = 400
    for (let seed = 0; seed < SEED_COUNT; seed++) {
      const sim = new EnaTrainingSimulation(seed * 7 + 3, undefined, 'sprout')
      const result = sim.runEpisode()
      deepest = Math.max(deepest, result.survivedTurns)
      if (result.trace.some((line) => line.split(':')[1] === 'boss')) reachedBoss = true
      // 온보딩은 30층을 넘지 않는다(별빛 등반/추가 보스 없음).
      expect(result.survivedTurns).toBeLessThanOrEqual(30)
      expect(result.bossesCleared).toBeLessThanOrEqual(1)
      if (result.bossesCleared > 0) {
        cleared = true
        expect(result.won).toBe(true)
        // 새싹 병아리 클리어에는 강제 시련이 붙지 않는다(정규 30/60/90F와 다른 지점).
        const p = probe(sim)
        expect(p.trialEnemyHpBonus).toBe(0)
        expect(p.trialEnemyAtkBonus).toBe(0)
        expect(p.trialTrapDamageBonus).toBe(0)
        expect(p.trialTreasureScale).toBe(1)
      }
    }
    expect(reachedBoss).toBe(true) // 양초 고양이 보스 국면에 도달한다.
    expect(cleared).toBe(true) // 약한 교사 정책으로도 일부 시드는 30F를 클리어한다(가벼운 온보딩).
    expect(deepest).toBeLessThanOrEqual(30)
  })

  it('강제 시련은 실제 TRIAL_DEFINITIONS 수치 단위로 누적되고 필드 적에도 소급된다', () => {
    const sim = new EnaTrainingSimulation(5)
    sim.reset()
    const p = probe(sim)
    // 소급 검증용 고정 적 1칸을 전방에 심는다.
    const enemy: EnaSimCard = { type: CardType.ENEMY, hp: 4, atk: 2, group: 1, value: 1, growth: 0, sporeTimer: 0, eventTimer: -1, frozen: 0 }
    p.board[0][0] = enemy

    const applications = 24
    for (let i = 0; i < applications; i++) p.applyForcedTrial()

    // 광란(+2/+1) 단위: hp 보너스는 항상 atk 보너스의 2배.
    expect(p.trialEnemyHpBonus).toBe(p.trialEnemyAtkBonus * 2)
    // 역경(+2) 단위 누적.
    expect(p.trialTrapDamageBonus % 2).toBe(0)
    // 가난(×0.75) 누적 곱 — 세 종류 적용 횟수 합이 총 시행 수와 일치해야 한다.
    const arsonistCount = p.trialEnemyAtkBonus
    const hunterCount = p.trialTrapDamageBonus / 2
    const povertyCount = applications - arsonistCount - hunterCount
    expect(povertyCount).toBeGreaterThanOrEqual(0)
    expect(p.trialTreasureScale).toBeCloseTo(0.75 ** povertyCount, 6)
    // 소급 적용: 필드의 일반 적은 group×보너스만큼 즉시 강화된다(실게임 applyTrialEnemyStatBonus).
    expect(enemy.hp).toBe(4 + p.trialEnemyHpBonus)
    expect(enemy.atk).toBe(2 + p.trialEnemyAtkBonus)
    // 시련 데이터가 3종을 유지하는 동안 랜덤 24회면 통계적으로 전 종류가 나온다(LCG 고정 시드).
    expect(TRIAL_DEFINITIONS).toHaveLength(3)
  })

  it('시련 함정 피해 보너스는 스냅샷과 관측(함정 위협 축)에 실효값으로 반영된다', () => {
    const sim = new EnaTrainingSimulation(9)
    sim.reset()
    const p = probe(sim)
    p.trialTrapDamageBonus = 2
    // 전방 0번 칸을 1칸 거미줄로 고정하고 관측 인코딩을 비교한다.
    p.board[0][0] = { type: CardType.TRAP, hp: 0, atk: 0, group: 1, trapKind: 'web', value: 0, growth: 0, sporeTimer: 0, eventTimer: -1, frozen: 0 }
    const observation = sim.observe()
    expect(observation.snapshot.trapDamageBonus).toBe(2)
    // 9칸 인코딩의 첫 칸(전방 0레인) 위협 축(atk/trap 피해)은 (1+2)/30이어야 한다.
    const scalarCount = 60
    const incomingCount = 6 * 3
    const cellFeatures = observation.features.slice(scalarCount + incomingCount, scalarCount + incomingCount + 14)
    expect(cellFeatures[1]).toBe(1) // TRAP one-hot
    expect(cellFeatures[6]).toBeCloseTo(3 / 30, 6)
  })

  it('현재 상황을 플레이어 체감 전략 문장으로 분석한다', () => {
    const sim = new EnaTrainingSimulation(13)
    const analysis = sim.analyzeDecision()
    expect(analysis.projectedDamage).toBeGreaterThan(0)
    expect(analysis.reason).toContain('불씨')
  })
})
