/**
 * EnaTrainingSimulation - 에나(플레이어 카드) RL/딥러닝용 헤드리스 가상 게임.
 *
 * UI, 애니메이션, 턴 딜레이를 제거하고 '실제 플레이어가 느끼는 판단 변수'를 숫자 관측으로 압축한다.
 * 3×3 전투, 손패 사용 위치, 상점/이벤트 진입, 30층 보스 준비까지 빠르게 반복해
 * DQN/PPO 같은 외부 학습기가 (state, action, reward, nextState, done) 샘플로 소비할 수 있게 한다.
 */

import { CardType, type FlowerKind, type TrapKind } from '@entities/Card'
import { buildEnaKnowledgeBase, type EnaKnowledgeBase } from './EnaKnowledgeAdapter'

/** 시뮬레이터의 현재 국면. 전투 외 의사결정도 같은 정책망이 고르게 한다. */
export type EnaSimPhase = 'field' | 'shop' | 'event' | 'boss' | 'done'

/** 학습 시뮬레이터가 다루는 추상 카드. 실제 Card 전체 대신 판단 변수만 보존한다. */
export interface EnaSimCard {
  type: CardType
  hp: number
  atk: number
  group: number
  trapKind?: TrapKind
  flowerKind?: FlowerKind
  value: number
  timer: number
}

/** 손패/상점/이벤트/보스까지 포괄하는 고정 행동. lane이 없는 행동은 -1을 쓴다. */
export type EnaSimActionKind =
  | 'attack'
  | 'clearTrap'
  | 'takeReward'
  | 'useEmber'
  | 'useChitin'
  | 'useShield'
  | 'wait'
  | 'shopResource'
  | 'shopUpgrade'
  | 'shopRemove'
  | 'eventSafe'
  | 'eventGreedy'
  | 'bossAttack'
  | 'bossEmber'
  | 'bossBurst'

export interface EnaSimAction {
  kind: EnaSimActionKind
  lane: number
}

/** 딥러닝 입력 벡터와 디버깅용 원문 스냅샷을 함께 반환한다. */
export interface EnaObservation {
  features: number[]
  legalActions: EnaSimAction[]
  snapshot: EnaGameSnapshot
}

/** 리플레이 버퍼/오프라인 RL에 바로 저장 가능한 전이 샘플. */
export interface EnaTrainingSample {
  state: number[]
  actionIndex: number
  reward: number
  nextState: number[]
  done: boolean
}

/** 한 에피소드 결과. trace는 실패/성공 원인 분석용으로 의도적으로 가볍게 둔다. */
export interface EnaEpisodeResult {
  survivedTurns: number
  totalReward: number
  won: boolean
  samples: EnaTrainingSample[]
  trace: string[]
}

/** 현재 상태를 사람이 읽는 전략 문장으로 뽑아 에나 대사/설명 학습에도 재사용한다. */
export interface EnaStrategicAnalysis {
  recommendedActionIndex: number
  reason: string
  projectedDamage: number
  frontThreat: number
  bossPlanValue: number
}

interface EnaGameSnapshot {
  phase: EnaSimPhase
  hp: number
  maxHp: number
  shield: number
  ember: number
  emberMax: number
  coins: number
  attack: number
  combo: number
  comboMax: number
  emberCards: number
  chitinCards: number
  shieldCards: number
  turn: number
  turnsToShop: number
  turnsToBoss: number
  bossHp: number
  bossAttackCountdown: number
  eventRisk: number
  board: (EnaSimCard | null)[][]
}

/** 외부 모델이 없을 때 사용하는 정책 인터페이스. 신경망 추론기는 이 함수만 맞추면 교체 가능하다. */
export type EnaPolicy = (observation: EnaObservation, rng: EnaRandom) => number

const LANES = 3
const ROWS = 3
const WIN_TURNS = 35
const FIRST_BOSS_TURN = 30
const SHOP_INTERVAL = 10
const FEATURE_COUNT = 120

/** 모든 행동 인덱스를 고정해 신경망 출력 차원을 안정화한다. */
export const ENA_ACTION_SPACE: EnaSimAction[] = [
  { kind: 'attack', lane: 0 },
  { kind: 'attack', lane: 1 },
  { kind: 'attack', lane: 2 },
  { kind: 'clearTrap', lane: 0 },
  { kind: 'clearTrap', lane: 1 },
  { kind: 'clearTrap', lane: 2 },
  { kind: 'takeReward', lane: 0 },
  { kind: 'takeReward', lane: 1 },
  { kind: 'takeReward', lane: 2 },
  { kind: 'useEmber', lane: 0 },
  { kind: 'useEmber', lane: 1 },
  { kind: 'useEmber', lane: 2 },
  { kind: 'useChitin', lane: 0 },
  { kind: 'useChitin', lane: 1 },
  { kind: 'useChitin', lane: 2 },
  { kind: 'useShield', lane: -1 },
  { kind: 'wait', lane: -1 },
  { kind: 'shopResource', lane: -1 },
  { kind: 'shopUpgrade', lane: -1 },
  { kind: 'shopRemove', lane: -1 },
  { kind: 'eventSafe', lane: -1 },
  { kind: 'eventGreedy', lane: -1 },
  { kind: 'bossAttack', lane: -1 },
  { kind: 'bossEmber', lane: -1 },
  { kind: 'bossBurst', lane: -1 },
]

/** 재현 가능한 셀프플레이가 필요해서 Math.random 대신 작은 LCG를 사용한다. */
export class EnaRandom {
  private seed: number

  constructor(seed: number = 1) {
    this.seed = seed >>> 0
  }

  next(): number {
    this.seed = (1664525 * this.seed + 1013904223) >>> 0
    return this.seed / 0x100000000
  }

  int(maxExclusive: number): number {
    return Math.floor(this.next() * maxExclusive)
  }

  pick<T>(items: readonly T[]): T {
    return items[this.int(items.length)]
  }
}

/** UI 없는 3×3 가상 런. 실제 게임을 직접 돌리지 않아 대량 학습을 빠르게 수행한다. */
export class EnaTrainingSimulation {
  private readonly rng: EnaRandom
  private readonly knowledge: EnaKnowledgeBase
  private board: (EnaSimCard | null)[][] = []
  private phase: EnaSimPhase = 'field'
  private hp = 20
  private maxHp = 20
  private shield = 0
  private ember = 10
  private emberMax = 10
  private coins = 0
  private attack = 2
  private combo = 0
  private comboMax = 15
  private emberCards = 1
  private chitinCards = 1
  private shieldCards = 0
  private turn = 0
  private bossHp = 0
  private bossAttackCountdown = 3
  private eventRisk = 0
  private done = false

  constructor(seed: number = 1) {
    this.rng = new EnaRandom(seed)
    this.knowledge = buildEnaKnowledgeBase()
    this.reset()
  }

  /** 새 에피소드 시작. 초기 보드는 실제 시작처럼 꽃 없이 위험/보상만 섞는다. */
  reset(): EnaObservation {
    this.board = Array.from({ length: ROWS }, () => Array<EnaSimCard | null>(LANES).fill(null))
    this.phase = 'field'
    this.hp = this.maxHp = 20
    this.shield = 0
    this.ember = this.emberMax = 10
    this.coins = 0
    this.attack = 2
    this.combo = 0
    this.comboMax = 15
    this.emberCards = 1
    this.chitinCards = 1
    this.shieldCards = 0
    this.turn = 0
    this.bossHp = 0
    this.bossAttackCountdown = 3
    this.eventRisk = 0
    this.done = false
    for (let row = 0; row < ROWS; row++) {
      for (let lane = 0; lane < LANES; lane++) this.board[row][lane] = this.spawnCard(false)
    }
    this.regroupFrontEnemies()
    return this.observe()
  }

  /** 현재 상태에서 행동 하나를 적용하고 보상/다음 관측을 돌려준다. */
  step(actionIndex: number): { observation: EnaObservation; reward: number; done: boolean } {
    if (this.done) return { observation: this.observe(), reward: 0, done: true }
    const beforeHp = this.hp
    const beforeBossHp = this.bossHp
    const action = ENA_ACTION_SPACE[actionIndex] ?? ENA_ACTION_SPACE[actionIndexOf('wait', -1)]
    let reward = this.applyAction(action)

    // 국면별로 시간 진행이 다르다. 상점/이벤트는 전투 턴을 소모하지 않는 의사결정 샘플이다.
    if (this.phase === 'field') this.advanceFieldTurn()
    else if (this.phase === 'boss') this.advanceBossTurn()

    reward += this.shapeReward(beforeHp, beforeBossHp)
    this.finishIfNeeded()
    return { observation: this.observe(), reward, done: this.done }
  }

  /** 고정 길이 숫자 입력: 플레이어/국면/지식 30개 + 9칸×10개 = 120차원. */
  observe(): EnaObservation {
    const legalActions = ENA_ACTION_SPACE.filter((action) => this.isLegal(action))
    const features = [
      this.phase === 'field' ? 1 : 0,
      this.phase === 'shop' ? 1 : 0,
      this.phase === 'event' ? 1 : 0,
      this.phase === 'boss' ? 1 : 0,
      this.hp / this.maxHp,
      this.maxHp / 40,
      this.shield / 30,
      this.ember / this.emberMax,
      this.emberMax / 20,
      this.coins / 20,
      this.attack / 10,
      this.combo / this.comboMax,
      this.comboMax / 20,
      this.emberCards / 6,
      this.chitinCards / 6,
      this.shieldCards / 6,
      this.turn / WIN_TURNS,
      this.turnsToShop() / SHOP_INTERVAL,
      this.turnsToBoss() / FIRST_BOSS_TURN,
      this.bossHp / 80,
      this.bossAttackCountdown / 3,
      this.estimateFrontThreat() / 40,
      this.knowledge.economy.lightTurnMultiplierAt30 / 3,
      this.knowledge.economy.lightTurnMultiplierAt60 / 3,
      this.knowledge.economy.lightTurnMultiplierAt90 / 3,
      this.knowledge.economy.averageRelicBasePrice / 2000,
      this.knowledge.trialPressure / 10,
      this.knowledge.eventPressure / 10,
      this.averageHandBossValue() / 10,
      this.averageHandSynergyValue() / 10,
    ]
    for (let row = 0; row < ROWS; row++) {
      for (let lane = 0; lane < LANES; lane++) features.push(...this.encodeCard(this.board[row][lane], row))
    }
    // FEATURE_COUNT가 깨지면 학습 모델 입출력 계약이 흔들리므로 즉시 드러나게 한다.
    if (features.length !== FEATURE_COUNT) throw new Error(`Ena feature size mismatch: ${features.length}`)
    return { features, legalActions, snapshot: this.snapshot() }
  }

  /** 현재 스냅샷을 사람이 읽을 수 있는 플레이 조언으로 바꿔 대사/설명 학습에 쓴다. */
  analyzeDecision(observation: EnaObservation = this.observe()): EnaStrategicAnalysis {
    const { snapshot } = observation
    const recommendedActionIndex = EnaTrainingSimulation.teacherPolicy(observation, this.rng)
    const action = ENA_ACTION_SPACE[recommendedActionIndex]
    const projectedDamage = emberDamage(snapshot.attack)
    const frontThreat = this.estimateFrontThreat()
    const bossPlanValue = this.bossPreparationValue(snapshot)
    const reason = this.buildReason(snapshot, action, projectedDamage, frontThreat, bossPlanValue)
    return { recommendedActionIndex, reason, projectedDamage, frontThreat, bossPlanValue }
  }

  /** 휴리스틱 교사 정책으로 에피소드를 굴려 초기 학습 데이터/회귀 테스트를 만든다. */
  runEpisode(policy: EnaPolicy = EnaTrainingSimulation.teacherPolicy): EnaEpisodeResult {
    const samples: EnaTrainingSample[] = []
    const trace: string[] = []
    let observation = this.reset()
    let totalReward = 0
    while (!this.done) {
      const actionIndex = policy(observation, this.rng)
      const state = observation.features
      const result = this.step(actionIndex)
      totalReward += result.reward
      samples.push({ state, actionIndex, reward: result.reward, nextState: result.observation.features, done: result.done })
      trace.push(`${this.turn}:${this.phase}:${ENA_ACTION_SPACE[actionIndex]?.kind ?? 'unknown'}:${this.analyzeDecision(result.observation).reason}`)
      observation = result.observation
    }
    return { survivedTurns: this.turn, totalReward, won: this.turn >= WIN_TURNS && this.hp > 0, samples, trace }
  }

  /** 여러 에피소드의 전이 샘플을 모아 외부 딥러닝 트레이너에 넘길 배치를 만든다. */
  static collectDataset(episodes: number, seed: number = 1, policy: EnaPolicy = EnaTrainingSimulation.teacherPolicy): EnaTrainingSample[] {
    const dataset: EnaTrainingSample[] = []
    for (let i = 0; i < episodes; i++) dataset.push(...new EnaTrainingSimulation(seed + i).runEpisode(policy).samples)
    return dataset
  }

  /** 클러치/위치별 손패/상점·이벤트·보스 준비를 반영한 기본 교사 정책. */
  static teacherPolicy(observation: EnaObservation, _rng: EnaRandom): number {
    const { snapshot } = observation
    if (snapshot.phase === 'shop') return shopPolicy(snapshot)
    if (snapshot.phase === 'event') return eventPolicy(snapshot)
    if (snapshot.phase === 'boss') return bossPolicy(snapshot)

    const front = snapshot.board[0]
    const lethalTrapLane = front.findIndex((card) => card?.type === CardType.TRAP && trapDamage(card) > snapshot.hp + snapshot.shield)
    if (lethalTrapLane >= 0 && snapshot.chitinCards > 0) return actionIndexOf('useChitin', lethalTrapLane)
    if (snapshot.hp <= 6 && snapshot.shieldCards > 0) return actionIndexOf('useShield', -1)

    const dangerousEnemyLane = front.findIndex((card) => card?.type === CardType.ENEMY && card.group >= 2 && card.hp > snapshot.attack)
    if (dangerousEnemyLane >= 0 && snapshot.emberCards > 0) return actionIndexOf('useEmber', dangerousEnemyLane)

    const rewardLane = front.findIndex((card) => card?.type === CardType.TREASURE || card?.type === CardType.FLOWER)
    if (rewardLane >= 0 && snapshot.hp > 8) return actionIndexOf('takeReward', rewardLane)

    const killLane = front.findIndex((card) => card?.type === CardType.ENEMY && card.hp <= snapshot.attack)
    if (killLane >= 0) return actionIndexOf('attack', killLane)

    const trapLane = front.findIndex((card) => card?.type === CardType.TRAP)
    if (trapLane >= 0 && snapshot.chitinCards > 0) return actionIndexOf('useChitin', trapLane)
    if (trapLane >= 0) return actionIndexOf('clearTrap', trapLane)

    const enemyLane = front.findIndex((card) => card?.type === CardType.ENEMY)
    return enemyLane >= 0 ? actionIndexOf('attack', enemyLane) : actionIndexOf('wait', -1)
  }

  private applyAction(action: EnaSimAction): number {
    if (!this.isLegal(action)) return -4
    if (this.phase === 'shop') return this.applyShopAction(action)
    if (this.phase === 'event') return this.applyEventAction(action)
    if (this.phase === 'boss') return this.applyBossAction(action)
    return this.applyFieldAction(action)
  }

  private applyFieldAction(action: EnaSimAction): number {
    const card = action.lane >= 0 ? this.board[0][action.lane] : null
    switch (action.kind) {
      case 'attack':
        return card ? this.damageFrontCard(action.lane, this.attack, 'basic') : -1
      case 'clearTrap':
        this.board[0][action.lane] = null
        return 0.6
      case 'takeReward':
        if (!card) return -1
        this.applyReward(card)
        this.board[0][action.lane] = null
        return 2
      case 'useEmber':
        this.emberCards--
        return card ? this.damageFrontCard(action.lane, emberDamage(this.attack), 'ember') + 0.5 : -1
      case 'useChitin':
        this.chitinCards--
        this.board[0][action.lane] = null
        return card?.type === CardType.TRAP ? 1.8 : -0.8
      case 'useShield':
        this.shieldCards--
        this.shield += 6
        return this.hp <= 6 ? 2 : 0.3
      case 'wait':
        return -0.5
      default:
        return -1
    }
  }

  private applyShopAction(action: EnaSimAction): number {
    // 상점은 10/20층에는 준비를, 30층 직전에는 보스 버스트 플랜을 우선 학습한다.
    switch (action.kind) {
      case 'shopResource':
        this.coins = Math.max(0, this.coins - 2)
        this.ember = Math.min(this.emberMax, this.ember + 3)
        this.shieldCards++
        this.phase = 'field'
        return this.ember <= 3 ? 3 : 1
      case 'shopUpgrade':
        this.coins = Math.max(0, this.coins - 4)
        this.attack++
        this.emberCards++
        this.phase = 'field'
        return this.turnsToBoss() <= 10 ? 4 : 2
      case 'shopRemove':
        this.coins = Math.max(0, this.coins - 1)
        this.combo = Math.min(this.comboMax, this.combo + 4)
        this.chitinCards++
        this.phase = 'field'
        return 1.5
      default:
        return -2
    }
  }

  private applyEventAction(action: EnaSimAction): number {
    // 이벤트는 안전 선택과 탐욕 선택을 모두 학습한다. 위험도가 낮고 보스 준비가 부족하면 탐욕을 택할 여지가 있다.
    if (action.kind === 'eventSafe') {
      this.hp = Math.min(this.maxHp, this.hp + 3)
      this.phase = 'field'
      return this.hp <= 8 ? 3 : 1
    }
    if (action.kind === 'eventGreedy') {
      this.takeDamage(this.eventRisk)
      this.coins += 3
      this.emberCards++
      this.combo = Math.min(this.comboMax, this.combo + 3)
      this.phase = 'field'
      return this.hp > 0 ? 2.5 - this.eventRisk * 0.2 : -12
    }
    return -2
  }

  private applyBossAction(action: EnaSimAction): number {
    switch (action.kind) {
      case 'bossAttack':
        this.bossHp -= this.attack
        return 0.8
      case 'bossEmber':
        this.emberCards--
        this.bossHp -= emberDamage(this.attack)
        return 2.2
      case 'bossBurst':
        this.emberCards--
        this.combo = 0
        this.attack++
        this.bossHp -= emberDamage(this.attack) + this.attack * 2
        return 4
      case 'useShield':
        this.shieldCards--
        this.shield += 6
        return this.bossAttackCountdown <= 1 ? 2 : 0.2
      default:
        return -2
    }
  }

  private damageFrontCard(lane: number, amount: number, source: 'basic' | 'ember'): number {
    const card = this.board[0][lane]
    if (!card || card.type !== CardType.ENEMY) return -1
    card.hp -= amount
    if (card.hp <= 0) {
      this.board[0][lane] = null
      this.gainCombo(source === 'ember' ? 3 : 1)
      if (this.rng.next() < 0.3) this.emberCards++
      return source === 'ember' ? 3.2 : 2.3
    }
    this.takeDamage(card.atk)
    return source === 'ember' ? 0.2 : -0.5
  }

  private advanceFieldTurn(): void {
    this.resolveFrontHazards()
    this.turn++
    this.ember -= this.turn % 3 === 0 ? 1 : 0
    if (this.turn === FIRST_BOSS_TURN) {
      this.enterBoss()
      return
    }
    if (this.turn > 0 && this.turn % SHOP_INTERVAL === 0) {
      this.phase = 'shop'
      return
    }
    if (this.rng.next() < 0.08 && this.turn > 3) {
      this.phase = 'event'
      this.eventRisk = 2 + this.rng.int(5)
      return
    }
    this.dropAndRefill()
  }

  private advanceBossTurn(): void {
    this.bossAttackCountdown--
    if (this.bossAttackCountdown <= 0 && this.bossHp > 0) {
      this.takeDamage(8)
      this.bossAttackCountdown = 3
    }
    if (this.bossHp <= 0) {
      this.coins += 5
      this.phase = 'field'
      this.dropAndRefill()
    }
  }

  private resolveFrontHazards(): void {
    for (const card of this.uniqueFrontCards()) {
      if (card.type === CardType.ENEMY) this.takeDamage(card.atk)
      if (card.type === CardType.TRAP) this.takeDamage(trapDamage(card))
      if (card.type === CardType.FLOWER && card.flowerKind === 'oleander') this.shield += card.value
    }
  }

  private dropAndRefill(): void {
    for (let row = 0; row < ROWS - 1; row++) this.board[row] = this.board[row + 1]
    this.board[ROWS - 1] = Array.from({ length: LANES }, () => this.spawnCard(true))
    this.regroupFrontEnemies()
  }

  private enterBoss(): void {
    // 30층 보스는 공격력·콤보·아껴둔 불씨 손패를 검사하는 전략 훈련용 관문이다.
    this.phase = 'boss'
    this.bossHp = 50
    this.bossAttackCountdown = 3
  }

  private spawnCard(allowFlower: boolean): EnaSimCard {
    const pressure = this.ember <= 3 ? 0.18 : this.ember <= 6 ? 0.08 : 0
    const roll = this.rng.next()
    if (roll < 0.42 + pressure) return { type: CardType.ENEMY, hp: 3 + this.rng.int(8), atk: 1 + this.rng.int(4), group: 1, value: 0, timer: 0 }
    if (roll < 0.68 + pressure) return { type: CardType.TRAP, hp: 0, atk: 0, group: 1, trapKind: this.rng.pick(['web', 'bomb', 'spore'] as const), value: 0, timer: 2 }
    if (roll < 0.9 || !allowFlower) return { type: CardType.TREASURE, hp: 0, atk: 0, group: 1, value: 1 + this.rng.int(3), timer: 0 }
    return { type: CardType.FLOWER, hp: 0, atk: 0, group: 1, flowerKind: this.rng.pick(['redRose', 'marigold', 'oleander', 'lavender'] as const), value: 1 + this.rng.int(4), timer: 0 }
  }

  private regroupFrontEnemies(): void {
    // 실제 체감의 핵심: 불씨가 낮으면 적 비중이 늘고, 전방에서 2~3칸 적으로 합쳐져 클러치 판단을 만든다.
    let lane = 0
    while (lane < LANES - 1) {
      const left = this.board[0][lane]
      const right = this.board[0][lane + 1]
      if (left?.type === CardType.ENEMY && right?.type === CardType.ENEMY && left !== right) {
        left.group += right.group
        left.hp += right.hp + (left.group >= 3 ? 3 : 2)
        left.atk += right.atk + (left.group >= 3 ? 3 : 2)
        this.board[0][lane + 1] = left
      }
      lane++
    }
  }

  private isLegal(action: EnaSimAction): boolean {
    if (this.phase === 'shop') return ['shopResource', 'shopUpgrade', 'shopRemove'].includes(action.kind)
    if (this.phase === 'event') return action.kind === 'eventSafe' || action.kind === 'eventGreedy'
    if (this.phase === 'boss') {
      if (action.kind === 'bossAttack') return true
      if (action.kind === 'bossEmber') return this.emberCards > 0
      if (action.kind === 'bossBurst') return this.emberCards > 0 && this.combo >= this.comboMax
      if (action.kind === 'useShield') return this.shieldCards > 0
      return false
    }
    const card = action.lane >= 0 ? this.board[0][action.lane] : null
    if (action.kind === 'wait') return true
    if (action.kind === 'useShield') return this.shieldCards > 0
    if (action.kind === 'useEmber') return this.emberCards > 0 && card?.type === CardType.ENEMY
    if (action.kind === 'useChitin') return this.chitinCards > 0 && !!card && card.type === CardType.TRAP && card.group <= 3
    if (action.kind === 'attack') return card?.type === CardType.ENEMY
    if (action.kind === 'clearTrap') return card?.type === CardType.TRAP
    if (action.kind === 'takeReward') return card?.type === CardType.TREASURE || card?.type === CardType.FLOWER
    return false
  }

  private takeDamage(amount: number): void {
    const blocked = Math.min(this.shield, amount)
    this.shield -= blocked
    this.hp -= amount - blocked
  }

  private applyReward(card: EnaSimCard): void {
    if (card.type === CardType.TREASURE) {
      this.coins += card.value
      if (this.rng.next() < 0.35) this.emberCards++
      if (this.rng.next() < 0.25) this.shieldCards++
    } else if (card.flowerKind === 'redRose') this.hp = Math.min(this.maxHp, this.hp + card.value)
    else if (card.flowerKind === 'marigold') this.coins += card.value
    else if (card.flowerKind === 'oleander') this.shield += card.value
    else if (card.flowerKind === 'lavender') this.gainCombo(card.value)
  }

  private gainCombo(amount: number): void {
    this.combo += amount
    if (this.combo >= this.comboMax) {
      this.combo -= this.comboMax
      this.attack++
    }
  }

  private shapeReward(beforeHp: number, beforeBossHp: number): number {
    let reward = 0.08
    reward -= Math.max(0, beforeHp - this.hp) * 0.9
    reward += this.hp <= 5 ? -1.2 : 0
    reward += this.ember <= 3 && this.phase === 'field' ? -0.4 : 0
    reward += this.bossHp < beforeBossHp ? (beforeBossHp - this.bossHp) * 0.08 : 0
    reward += this.phase === 'boss' && this.combo >= this.comboMax - 2 && this.emberCards > 0 ? 0.4 : 0
    return reward
  }

  private finishIfNeeded(): void {
    if (this.hp <= 0 || this.ember <= 0) {
      this.done = true
      this.phase = 'done'
    } else if (this.turn >= WIN_TURNS && this.phase !== 'boss') {
      this.done = true
      this.phase = 'done'
    }
  }

  private estimateFrontThreat(): number {
    return this.uniqueFrontCards().reduce((sum, card) => sum + (card.type === CardType.ENEMY ? card.atk : card.type === CardType.TRAP ? trapDamage(card) : 0), 0)
  }

  private uniqueFrontCards(): EnaSimCard[] {
    const seen = new Set<EnaSimCard>()
    const cards: EnaSimCard[] = []
    for (const card of this.board[0]) {
      if (card && !seen.has(card)) {
        seen.add(card)
        cards.push(card)
      }
    }
    return cards
  }

  private encodeCard(card: EnaSimCard | null, row: number): number[] {
    if (!card) return [0, 0, 0, 0, 0, 0, 0, row / (ROWS - 1), 0, 0]
    return [
      card.type === CardType.ENEMY ? 1 : 0,
      card.type === CardType.TRAP ? 1 : 0,
      card.type === CardType.TREASURE ? 1 : 0,
      card.type === CardType.FLOWER ? 1 : 0,
      card.hp / 30,
      (card.atk || trapDamage(card)) / 30,
      card.group / 3,
      row / (ROWS - 1),
      card.value / 5,
      card.timer / 3,
    ]
  }

  private turnsToShop(): number {
    if (this.turn >= FIRST_BOSS_TURN) return 0
    return SHOP_INTERVAL - (this.turn % SHOP_INTERVAL)
  }

  private turnsToBoss(): number {
    return Math.max(0, FIRST_BOSS_TURN - this.turn)
  }

  private bossPreparationValue(snapshot: EnaGameSnapshot): number {
    const fullComboSoon = snapshot.combo >= snapshot.comboMax - 3 ? 1 : 0
    const learnedBossValue = this.averageHandBossValue() * 0.2
    return snapshot.attack + snapshot.emberCards * 1.5 + fullComboSoon * 2 + snapshot.shieldCards + learnedBossValue
  }

  private averageHandBossValue(): number {
    // 전체 HandCards.ts 분석 결과를 런 관측에 압축해, 정책망이 현재 손패 수량 너머의 카드 풀 성향을 알게 한다.
    const values = Object.values(this.knowledge.handCards).map((card) => card.bossValue)
    return values.reduce((sum, value) => sum + value, 0) / values.length
  }

  private averageHandSynergyValue(): number {
    // 레시피·유물·직업·이벤트 연계 평균값은 장기 성장/상점 선택의 prior로 사용된다.
    const values = Object.values(this.knowledge.handCards).map((card) => card.synergyValue)
    return values.reduce((sum, value) => sum + value, 0) / values.length
  }

  private buildReason(snapshot: EnaGameSnapshot, action: EnaSimAction, projectedDamage: number, frontThreat: number, bossPlanValue: number): string {
    if (snapshot.phase === 'boss') {
      return `30층 보스: 공격력 ${snapshot.attack}, 불씨 피해 ${projectedDamage}, 콤보 ${snapshot.combo}/${snapshot.comboMax}, 데이터 기반 준비값 ${bossPlanValue.toFixed(1)}라서 ${action.kind} 선택`
    }
    if (snapshot.phase === 'shop') return `상점: 보스까지 ${snapshot.turnsToBoss}턴, 공격력 ${snapshot.attack}, 불씨 손패 ${snapshot.emberCards}장 기준 ${action.kind} 선택`
    if (snapshot.phase === 'event') return `이벤트: 위험 ${snapshot.eventRisk}, 현재 HP ${snapshot.hp}+방패 ${snapshot.shield} 기준 ${action.kind} 선택`
    const target = action.lane >= 0 ? snapshot.board[0][action.lane] : null
    if (target?.type === CardType.ENEMY) return `${snapshot.turn}층: 공격력 ${snapshot.attack}, 불씨 피해 ${projectedDamage}, 전방 ${target.group}칸 적 HP ${target.hp}/ATK ${target.atk}, 전방 위협 ${frontThreat}, 손패 평균 보스가치 ${this.averageHandBossValue().toFixed(1)}라서 ${action.kind}`
    if (snapshot.ember <= 3) return `불씨 ${snapshot.ember}/${snapshot.emberMax}: 적 스폰 압박이 커져 3칸 적 위험이 높으므로 ${action.kind}`
    return `${snapshot.turn}층: HP ${snapshot.hp}, 불씨 ${snapshot.ember}, 보스까지 ${snapshot.turnsToBoss}턴이라서 ${action.kind}`
  }

  private snapshot(): EnaGameSnapshot {
    return {
      phase: this.phase,
      hp: this.hp,
      maxHp: this.maxHp,
      shield: this.shield,
      ember: this.ember,
      emberMax: this.emberMax,
      coins: this.coins,
      attack: this.attack,
      combo: this.combo,
      comboMax: this.comboMax,
      emberCards: this.emberCards,
      chitinCards: this.chitinCards,
      shieldCards: this.shieldCards,
      turn: this.turn,
      turnsToShop: this.turnsToShop(),
      turnsToBoss: this.turnsToBoss(),
      bossHp: this.bossHp,
      bossAttackCountdown: this.bossAttackCountdown,
      eventRisk: this.eventRisk,
      board: this.board.map((row) => row.map((card) => (card ? { ...card } : null))),
    }
  }
}

function shopPolicy(snapshot: EnaGameSnapshot): number {
  if (snapshot.turnsToBoss <= 10 && snapshot.attack < 3) return actionIndexOf('shopUpgrade', -1)
  if (snapshot.ember <= 4) return actionIndexOf('shopResource', -1)
  return actionIndexOf('shopRemove', -1)
}

function eventPolicy(snapshot: EnaGameSnapshot): number {
  const canSurviveGreed = snapshot.hp + snapshot.shield - snapshot.eventRisk > 6
  return canSurviveGreed && snapshot.turnsToBoss <= 12 ? actionIndexOf('eventGreedy', -1) : actionIndexOf('eventSafe', -1)
}

function bossPolicy(snapshot: EnaGameSnapshot): number {
  if (snapshot.bossAttackCountdown <= 1 && snapshot.hp + snapshot.shield <= 8 && snapshot.shieldCards > 0) return actionIndexOf('useShield', -1)
  if (snapshot.combo >= snapshot.comboMax && snapshot.emberCards > 0) return actionIndexOf('bossBurst', -1)
  if (snapshot.emberCards > 0 && snapshot.bossHp > snapshot.attack * 2) return actionIndexOf('bossEmber', -1)
  return actionIndexOf('bossAttack', -1)
}

function actionIndexOf(kind: EnaSimActionKind, lane: number): number {
  return ENA_ACTION_SPACE.findIndex((action) => action.kind === kind && action.lane === lane)
}

function emberDamage(attack: number): number {
  // 실제 손패 공식과 같은 감각: 불씨 단일 = 공격력×1.0+1.
  return attack + 1
}

function trapDamage(card: EnaSimCard): number {
  if (card.trapKind === 'bomb') return 5
  if (card.trapKind === 'spore') return 2
  return card.group >= 3 ? 99 : card.group === 2 ? 5 : 1
}
