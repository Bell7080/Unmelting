import { describe, expect, it } from 'vitest'
import { CardType } from '@entities/Card'
import { TRIAL_DEFINITIONS } from '@data/Trials'
import { ENEMY_DEFINITIONS } from '@systems/CardSpawner'
import { BOSS_CORE_SPECS } from '@data/BossSpecs'
import {
  GREED_COIN_TOLL_DAMAGE,
  SCULPTOR_SUMMON_COUNT,
  SCULPTOR_SWELL_HP,
  WITCH_ENRAGE_ATK,
  WITCH_ENRAGE_HP,
  WITCH_SUMMON_COUNT,
  halfPageFloor,
} from '@data/BossPages'
import { EnaTrainingSimulation, ENA_ACTION_SPACE, ENA_FEATURE_COUNT, type EnaSimCard } from './EnaTrainingSimulation'

/** 보스 국면 내부 상태 창구 — 실게임과 시뮬이 같은 규칙을 도는지 확인하기 위한 최소 접근. */
interface BossProbe {
  enterBoss: (floor: number) => void
  advanceBossTurn: () => void
  damageBoss: (raw: number, source: 'basic' | 'ember', scope?: 'single' | 'area') => number
  phase: string
  hp: number
  hand: { id: string; merged: boolean }[]
  bossFloor: number
  bossHp: number
  bossPage: number
  bossAttackCountdown: number
  bossSummons: { hp: number; atk: number }[]
  bossGateDamage: number
}

function bossProbe(sim: EnaTrainingSimulation): BossProbe {
  return sim as unknown as BossProbe
}

/** 보스 국면으로 밀어 넣고 첫 페이지 경계 바로 위까지 깎아 둔다. */
function stagedBoss(seed: number, floor: number): BossProbe {
  const sim = new EnaTrainingSimulation(seed)
  sim.reset()
  const p = bossProbe(sim)
  p.enterBoss(floor)
  return p
}

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

/** 꽃/괴물꽃 정합성 검사 창구 — 공개 학습 API를 늘리지 않고 내부 턴 규칙만 고정한다. */
interface FlowerProbe extends TrialProbe {
  growAndWiltFlowers: () => void
  bloomFrontSeeds: () => void
  regroupFrontRow: () => void
  applyFlower: (card: EnaSimCard) => void
  applyTreasure: (card: EnaSimCard) => void
  applyTreasureVolatility: () => void
  encodeCard: (card: EnaSimCard | null, row: number) => number[]
  rng: { next: () => number; int: (max: number) => number; pick: <T>(items: readonly T[]) => T }
  turn: number
  light: number
  coins: number
  shield: number
  ember: number
  hp: number
  attack: number
}

function flowerProbe(sim: EnaTrainingSimulation): FlowerProbe {
  return sim as unknown as FlowerProbe
}

describe('EnaTrainingSimulation', () => {
  it('딥러닝 입력 벡터와 행동 공간 크기를 고정한다', () => {
    const sim = new EnaTrainingSimulation(7)
    const observation = sim.reset()
    // 스칼라 79(이벤트/별빛/보스 정체·격자·부가물 칸·페이지 게이트·종복/상점/시련/유물 엔진/카드 풀
    //          + 밀랍상 4종 확률 + 손패 한도·여유·낭비율 포함)
    // + 예고 3칸×6 + 9칸×17(괴물꽃 성장 위협 포함) + 손패 10×13 = 380.
    expect(observation.features).toHaveLength(ENA_FEATURE_COUNT)
    expect(ENA_FEATURE_COUNT).toBe(380)
    // clickLane×3 + useHand×10 + wait + 상점×9(무료/유물/6종 팩/EXIT) + 이벤트×4(safe/greedy/trick/bail) = 27.
    expect(ENA_ACTION_SPACE).toHaveLength(27)
    expect(observation.legalActions.length).toBeGreaterThan(0)
  })

  it('꽃 개화·성장·시듦·보상과 괴물꽃 관측을 실게임 규칙으로 함께 계산한다', () => {
    const sim = new EnaTrainingSimulation(17)
    sim.reset()
    const p = flowerProbe(sim)
    // 개화는 캐모마일을 포함한 5종 중 하나이며 씨앗 가치 0을 정확히 1로 바꾼다.
    const seed: EnaSimCard = { type: CardType.FLOWER, hp: 0, atk: 0, group: 1, flowerKind: 'seed', value: 0, growth: 0, sporeTimer: 0, eventTimer: -1, frozen: 0 }
    p.board[0][0] = seed
    p.rng.pick = (items) => items[0]
    p.bloomFrontSeeds()
    expect({ kind: seed.flowerKind, value: seed.value }).toEqual({ kind: 'chamomile', value: 1 })

    // 일반 꽃은 매 턴 가치 +1, 금잔화는 두 번째 턴에만 +1 한다. 높은 난수로 시듦은 막는다.
    p.rng.next = () => 0.99
    p.growAndWiltFlowers()
    expect(seed.value).toBe(2)
    const marigold: EnaSimCard = { ...seed, flowerKind: 'marigold', value: 1, growth: 0 }
    p.board[0][0] = marigold
    p.growAndWiltFlowers()
    expect(marigold.value).toBe(1)
    p.growAndWiltFlowers()
    expect(marigold.value).toBe(2)

    // 20턴 티어 2와 시련 보너스를 변이 초기 공/체 및 이후 성장량에 모두 반영한다.
    p.turn = 20
    p.trialEnemyHpBonus = 2
    p.trialEnemyAtkBonus = 1
    const rose: EnaSimCard = { ...seed, flowerKind: 'redRose', value: 1, growth: 0 }
    p.board[0][0] = rose
    p.rng.next = () => 0
    p.growAndWiltFlowers()
    const monster = p.board[0][0]
    expect(monster).toMatchObject({
      type: CardType.ENEMY,
      hp: 6,
      atk: 5,
      enemyPower: 6,
      defeatDropCount: 1,
      monsterGrowthTimer: 2,
      monsterGrowthAmount: 2,
    })
    // 관측 마지막 3축은 괴물꽃 여부·남은 성장 시계·주기 성장량이다.
    expect(p.encodeCard(monster, 0).slice(-3)).toEqual([1, 1, 0.4])

    // 일반 적과 괴물꽃은 인접해도 합쳐지지 않는다.
    const normal: EnaSimCard = { type: CardType.ENEMY, hp: 3, atk: 1, group: 1, value: 0, growth: 0, sporeTimer: 0, eventTimer: -1, frozen: 0 }
    p.board[0][1] = normal
    p.regroupFrontRow()
    expect(p.board[0][0]).toBe(monster)
    expect(p.board[0][1]).toBe(normal)

    // 캐모마일은 공통 불빛+티어 불빛, 금잔화는 공통 불빛+꽃 가치만큼 화폐를 준다.
    p.light = 0
    p.coins = 0
    p.applyFlower({ ...seed, flowerKind: 'chamomile', value: 2 })
    const chamomileLight = p.light
    p.light = 0
    p.applyFlower({ ...seed, flowerKind: 'marigold', value: 3 })
    // 양쪽 모두 gainLight의 턴/직업 배율을 타므로 원시 상수 대신 캐모마일 추가분의 우위를 검증한다.
    expect(chamomileLight).toBeGreaterThan(p.light)
    expect(p.coins).toBe(3)
  })

  it('선공 순서와 보물 드롭·변동성을 런타임 순서와 수치로 처리한다', () => {
    const sim = new EnaTrainingSimulation(29)
    sim.reset()
    const p = flowerProbe(sim)
    // 불씨 0 선공에서 1HP 적을 클릭해도 적이 먼저 2피해를 주고 난 뒤 처치된다.
    p.ember = 0
    p.hp = 10
    p.attack = 2
    p.board[0][0] = { type: CardType.ENEMY, hp: 1, atk: 2, group: 1, value: 1, growth: 0, sporeTimer: 0, eventTimer: -1, frozen: 0 }
    p.board[0][1] = null
    p.board[0][2] = null
    sim.step(0)
    expect(p.hp).toBe(8)

    // 2칸 일반 상자는 최소 2장 드롭하며 예전 가짜 화폐/방패 보상을 만들지 않는다.
    p.coins = 0
    p.shield = 0
    p.rng.int = () => 0
    p.applyTreasure({ type: CardType.TREASURE, hp: 0, atk: 0, group: 2, treasureKind: 'normal', value: 0, growth: 0, sporeTimer: 0, eventTimer: -1, frozen: 0 })
    expect({ coins: p.coins, shield: p.shield }).toEqual({ coins: 0, shield: 0 })

    // 일반 상자의 50~60% 구간은 같은 폭·티어의 미믹으로 바뀐다.
    const chest: EnaSimCard = { type: CardType.TREASURE, hp: 0, atk: 0, group: 1, treasureKind: 'normal', value: 0, growth: 0, sporeTimer: 0, eventTimer: -1, frozen: 0 }
    p.board[0][0] = chest
    p.rng.next = () => 0.55
    p.applyTreasureVolatility()
    expect(p.board[0][0]).toMatchObject({ type: CardType.ENEMY, specialEnemyKind: 'mimic' })
  })

  it('교사 정책으로 100층 한 호의 국면/손패/보스 판단 학습 샘플을 생성한다', () => {
    // 정확한 선공 순서로 짧게 끝나는 시드도 있으므로 5호를 모아 학습 배치 최소량을 보장한다.
    const dataset = EnaTrainingSimulation.collectDataset(5, 11)
    expect(dataset.length).toBeGreaterThan(20)
    expect(dataset.every((sample) => sample.state.length === ENA_FEATURE_COUNT && sample.nextState.length === ENA_FEATURE_COUNT)).toBe(true)
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
    // 스칼라 구간을 지나 예고 3칸(6축) 뒤부터가 9칸 인코딩이다.
    const scalarCount = ENA_FEATURE_COUNT - 6 * 3 - 17 * 9 - 13 * 10
    const incomingCount = 6 * 3
    const cellFeatures = observation.features.slice(scalarCount + incomingCount, scalarCount + incomingCount + 14)
    expect(cellFeatures[1]).toBe(1) // TRAP one-hot
    expect(cellFeatures[6]).toBeCloseTo(3 / 30, 6)
  })

  it('30F 리미트 페이지는 경계에 닿는 것만으로 열리지 않는다(부위 하나만큼 더)', () => {
    // 실게임 'cell-break' 요구를 화력으로 환산한 자리. 없으면 약점만 긁어 경계를 밀고 지나간다.
    const p = stagedBoss(21, 30)
    const floor = halfPageFloor(BOSS_CORE_SPECS[30].maxHp)
    p.damageBoss(BOSS_CORE_SPECS[30].maxHp, 'basic') // 경계 초과 피해 한 방
    // ★ 리미트를 뚫는 타격이라도 HP는 경계에서 멈춘다(실게임 bossPageFloor와 같은 규칙) —
    // 한 방에 페이지를 통째로 건너뛰고 격파하는 일이 없어야 한다.
    expect(p.bossHp).toBe(floor)
    expect(p.bossPage).toBe(1) // 초과분이 그대로 부위 파괴에 들어가 열린다
    expect(p.bossGateDamage).toBe(0)

    // 초과분이 없으면(경계에 딱 닿으면) 잠긴 채로 남는다.
    const q = stagedBoss(22, 30)
    q.bossHp = floor
    q.damageBoss(0, 'basic')
    expect(q.bossPage).toBe(0)
  })

  it('30F 2페이지는 손에 쥔 탐욕의 동전 1장당 값을 요구한다', () => {
    const p = stagedBoss(23, 30)
    p.bossPage = 1
    p.bossAttackCountdown = 1
    p.hand = [
      { id: 'greed-coin', merged: false },
      { id: 'greed-coin', merged: false },
    ]
    const before = p.hp
    p.advanceBossTurn()
    // 보스 기본 타격 + 동전 2장의 값. 살포로 동전이 더 들어올 수 있어 하한만 본다.
    const minLoss = BOSS_CORE_SPECS[30].attack + 2 * GREED_COIN_TOLL_DAMAGE
    expect(before - p.hp).toBeGreaterThanOrEqual(minLoss)
  })

  it('90F 조각사는 주기마다 종복을 세우고 2페이지부터 비대화시킨다', () => {
    // 소환 풀은 실게임과 같은 60~90층대 적(ENEMY_DEFINITIONS 12~17)이라 개체차가 있다.
    // 랜덤 표본끼리 비교하지 않고 풀의 하한/상한과 비교해 판정한다.
    const pool = ENEMY_DEFINITIONS.slice(12, 18)
    const poolHp = pool.map((d) => d.healthOrDamage ?? 1)
    const poolAtk = pool.map((d) => d.attack ?? 1)

    const p = stagedBoss(24, 90)
    p.bossAttackCountdown = 1
    p.advanceBossTurn()
    expect(p.bossSummons).toHaveLength(SCULPTOR_SUMMON_COUNT)
    expect(p.bossSummons.every((e) => e.hp <= Math.max(...poolHp))).toBe(true)

    p.bossPage = 1
    p.bossAttackCountdown = 1
    p.advanceBossTurn()
    expect(p.bossSummons).toHaveLength(SCULPTOR_SUMMON_COUNT)
    // 비대화는 체력만 올린다 — 공격력은 건드리지 않는다(광폭화와 다른 어휘).
    expect(p.bossSummons.every((e) => e.hp >= Math.min(...poolHp) + SCULPTOR_SWELL_HP)).toBe(true)
    expect(p.bossSummons.every((e) => e.atk <= Math.max(...poolAtk))).toBe(true)
  })

  it('100F 마녀 3페이지는 광폭화 종복을 부르고 격자가 6칸으로 줄어든다', () => {
    const p = stagedBoss(25, 100)
    p.bossPage = 2
    p.bossAttackCountdown = 1
    p.advanceBossTurn()
    expect(p.bossSummons).toHaveLength(WITCH_SUMMON_COUNT)
    // 광폭화는 체력과 공격력을 함께 올린다.
    expect(Math.min(...p.bossSummons.map((e) => e.atk))).toBeGreaterThan(WITCH_ENRAGE_ATK)
    expect(Math.min(...p.bossSummons.map((e) => e.hp))).toBeGreaterThan(WITCH_ENRAGE_HP)
    // 몸이 접혀 판정 칸이 9 → 6으로 줄고, 그 칸 수가 관측에도 그대로 나온다.
    expect((p as unknown as EnaTrainingSimulation).observe().snapshot.bossGridCells).toBe(6)
  })

  it('보스 격자·페이지 게이트·종복이 관측에 그대로 실린다', () => {
    const p = stagedBoss(26, 30)
    const snap = (p as unknown as EnaTrainingSimulation).observe().snapshot
    expect(snap.bossGridCells).toBe(9)
    expect(snap.bossGridBestMultiplier).toBe(2)
    expect(snap.bossPageGateLocked).toBe(false)
    expect(snap.bossPageProximity).toBeGreaterThan(0)

    p.bossHp = halfPageFloor(BOSS_CORE_SPECS[30].maxHp)
    const gated = (p as unknown as EnaTrainingSimulation).observe().snapshot
    expect(gated.bossPageGateLocked).toBe(true)
    expect(gated.bossPageGateRemaining).toBeGreaterThan(0)
    expect(gated.bossPageProximity).toBe(0)
  })

  it('현재 상황을 플레이어 체감 전략 문장으로 분석한다', () => {
    const sim = new EnaTrainingSimulation(13)
    const analysis = sim.analyzeDecision()
    expect(analysis.projectedDamage).toBeGreaterThan(0)
    expect(analysis.reason).toContain('불씨')
  })
})
