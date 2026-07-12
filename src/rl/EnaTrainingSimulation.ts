/**
 * EnaTrainingSimulation - 에나(플레이어 카드) RL/딥러닝용 헤드리스 가상 게임.
 *
 * UI/애니메이션/턴 딜레이만 제거하고, 플레이어가 실제로 겪는 100층 등반을 그대로 모델링한다.
 * 3×3 전투 · 개별 손패(트리플 합성 포함) · 거미줄 병합/포자 전염/씨앗 개화 · 이벤트 문 ·
 * 불씨 티어 스폰 압박 · 10/20/30 상점·제단(불빛/화폐 재화 분리, 실제 6종 팩·ShopPricing 공유 가격,
 * 런 카드 풀 해금/밴·확률팩 T1 부스트를 DropSystem 2단계 추첨으로 반영) ·
 * 30/60/90/100F 실제 보스(30/60/90F 격파 후 실제 TRIAL_DEFINITIONS 강제 시련 1개 적용) ·
 * 90~100F 별빛 등반까지
 * 한 호(arc)로 굴려, 외부 학습기가 (state, action, reward, nextState, done)으로 소비하게 한다.
 *
 * 목표: "플레이어가 진짜 하는 게임을 에나 혼자서 미리 모험하며 준비한다"는 느낌의 그릇.
 * 실제 데이터(EmberSystem 스폰 버킷·ENEMY_DEFINITIONS·HandCards·보스 스펙)를 직접 읽어
 * 콘텐츠가 바뀌어도 시뮬과 실게임이 함께 움직이게 한다.
 */

import { CardType, type FlowerKind, type TrapKind } from '@entities/Card'
import type { HandCardId, HandCardDefinition, HandCardDropSource } from '@entities/HandCard'
import { HAND_CARD_DEFINITIONS, HAND_CARD_IDS } from '@data/HandCards'
import { TRIAL_DEFINITIONS } from '@data/Trials'
import { HAND_CARD_RARITY, type CardRarity } from '@data/ShopPools'
import { EmberSystem, type EmberTier } from '@systems/EmberSystem'
import { ENEMY_DEFINITIONS } from '@systems/CardSpawner'
import { DropSystem } from '@systems/DropSystem'
import { altarPackBaseCost, packCostWithRepeats, regularShopPackBaseCost } from '@core/ShopPricing'
import { buildEnaKnowledgeBase, type EnaKnowledgeBase, type EnaHandCardTactic } from './EnaKnowledgeAdapter'
import { estimateImminentWebMergeFromCells, type ImminentWebMergeEstimate } from '@systems/CompanionForesight'
import { bestSupportCard } from '@systems/HandCardAdvisor'
import type { EnaDisposition } from '@systems/EnaDisposition'

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
  treasureKind?: 'normal' | 'starlight'
  value: number
  /** 꽃 성장 누적 턴(시듦 확률 상승에 사용). */
  growth: number
  /** 포자 전염 카운트다운(2→0에서 인접 전염). */
  sporeTimer: number
  /** 이벤트 문 닫힘 카운트다운(-1=대기, 2→0 닫힘). */
  eventTimer: number
  /** 밀랍 굳음 잔여 턴. */
  frozen: number
}

/** 손패 1장. 실제처럼 개별 카드 정체성을 유지해 "이 카드는 보스용으로 아낀다"를 학습 가능하게 한다. */
export interface EnaHandSlot {
  id: HandCardId
  merged: boolean
}

/** 손패/상점/이벤트/보스까지 포괄하는 고정 행동. lane/slot이 없는 행동은 -1을 쓴다.
 *  상점 행동은 실제 상점/제단 콘텐츠(무료카드·유물·6종 팩·EXIT)와 1:1로 맞춘다. */
export type EnaSimActionKind =
  | 'clickLane'
  | 'useHand'
  | 'wait'
  | 'shopFree'
  | 'shopRelic'
  | 'shopBasicPack'
  | 'shopRecipePack'
  | 'shopUnlockPack'
  | 'shopChancePack'
  | 'shopDeletePack'
  | 'shopResourcePack'
  | 'shopExit'
  | 'eventSafe'
  | 'eventGreedy'

export interface EnaSimAction {
  kind: EnaSimActionKind
  /** clickLane은 lane(0..2), useHand는 손패 슬롯(0..HAND_MAX-1)을 담는다. 그 외 -1. */
  arg: number
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
  bossesCleared: number
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
  emberTier: EmberTier
  /** 불빛(score) — 팩/유물 구매 재화. */
  light: number
  /** 화폐($) — 보물 동전/보스 현상금 등 희소 재화. */
  coins: number
  attack: number
  combo: number
  comboMax: number
  /** 런 카드 풀 상태 요약 — 상점 팩 판단에 쓴다. */
  lockedCount: number
  unlockedCount: number
  chanceBoostTotal: number
  recipeTripleBonus: number
  hand: EnaHandSlot[]
  turn: number
  turnsToShop: number
  turnsToBoss: number
  shopMode: 'shop' | 'altar'
  finalAscent: boolean
  bossFloor: number
  bossHp: number
  bossMaxHp: number
  bossAttackCountdown: number
  bossPage: number
  eventRisk: number
  /** 강제 시련 '역경' 등으로 누적된 전역 함정 피해 보너스 — 정책의 실효 함정 피해 계산용. */
  trapDamageBonus: number
  /** 다음 전방에서 실제 인접 병합될 1칸 거미줄 수(런타임 예지와 공유 판정). */
  webThreat: number
  /** 에나가 보는 레일 상단 예고선: 다음에 실제 리필될 lane별 카드 정보. */
  incomingRefill: (EnaSimCard | null)[]
  board: (EnaSimCard | null)[][]
}

/** 외부 모델이 없을 때 사용하는 정책 인터페이스. 신경망 추론기는 이 함수만 맞추면 교체 가능하다. */
export type EnaPolicy = (observation: EnaObservation, rng: EnaRandom) => number

const LANES = 3
const ROWS = 3
const RUN_TARGET_TURNS = 100
const SHOP_INTERVAL = 10
const ALTAR_INTERVAL = 30
const EMBER_DECAY_TURNS = 3
const HAND_MAX = 10
const CANDLE_MAX = 15
const STARTING_HP = 20
const STARTING_EMBER = 10
const EMBER_MAX = 10
const BOSS_FLOORS = [30, 60, 90, 100]

/** 실제 BossEvent.ts의 보스 스펙을 학습용으로 압축. 굳음 면역/손패 지급/페이지 규칙을 포함한다. */
interface BossProfile {
  name: string
  maxHp: number
  attack: number
  interval: number
  /** HP를 이 값만큼 잃을 때마다 손패 1장 지급(실게임 공통 10). */
  handGiftStep: number
  /** 공격 주기마다 쓰는 고유 패턴. */
  behavior: 'greed' | 'knightHand' | 'summon' | 'witch'
  /** waxWitch 페이지 경계(이 HP에서 멈춰 다음 페이지로). */
  pages?: number[]
}

const BOSS_PROFILES: Record<number, BossProfile> = {
  30: { name: '양초 백작', maxHp: 45, attack: 3, interval: 2, handGiftStep: 10, behavior: 'greed' },
  60: { name: '불씨 기사단장', maxHp: 60, attack: 5, interval: 2, handGiftStep: 10, behavior: 'knightHand' },
  90: { name: '밀랍 조각사', maxHp: 100, attack: 7, interval: 3, handGiftStep: 10, behavior: 'summon' },
  100: { name: '녹지 않는 마녀', maxHp: 210, attack: 15, interval: 2, handGiftStep: 10, behavior: 'witch', pages: [140, 70, 0] },
}

/** 시뮬 상점이 다루는 실제 팩 종류(가격 반복 누적 추적용). */
type EnaSimPackKind = 'basic-pack' | 'recipe-pack' | 'unlock-pack' | 'chance-pack' | 'delete-pack' | 'resource-pack'

/** 확률팩 T1 부스트(실게임 index.ts rollPackItems의 RARITY_BOOST와 동일). */
const CHANCE_PACK_RARITY_BOOST: Record<CardRarity, number> = { common: 18, rare: 14, epic: 8, unique: 5, legendary: 5 }

/** 삭제팩으로 풀을 깎아도 최소한 남겨 두는 카드 수(런 붕괴 방지). */
const MIN_POOL_AFTER_DELETE = 5

/** 실게임 createScoreLog의 기본 불빛 상향 배율(지터 0.88~1.12는 평균 1로 근사). */
const BASE_LIGHT_GAIN_MULTIPLIER = 1.4

/** 실게임 scoreForCardRemoval의 일반 적 불빛 1차식 상수. */
const ENEMY_LIGHT_BASE = 17
const ENEMY_LIGHT_PER_RANK = 6

const FEATURE_SCALARS = 38
const FEATURE_PER_INCOMING = 6
const FEATURE_PER_CELL = 14
const FEATURE_PER_HAND = 9
export const ENA_FEATURE_COUNT = FEATURE_SCALARS + FEATURE_PER_INCOMING * LANES + FEATURE_PER_CELL * ROWS * LANES + FEATURE_PER_HAND * HAND_MAX

/** 모든 행동 인덱스를 고정해 신경망 출력 차원을 안정화한다.
 *  = 레인 3 + 손패 10 + 대기 1 + 상점 9 + 이벤트 2 = 25. */
export const ENA_ACTION_SPACE: EnaSimAction[] = [
  { kind: 'clickLane', arg: 0 },
  { kind: 'clickLane', arg: 1 },
  { kind: 'clickLane', arg: 2 },
  ...Array.from({ length: HAND_MAX }, (_, slot) => ({ kind: 'useHand' as const, arg: slot })),
  { kind: 'wait', arg: -1 },
  { kind: 'shopFree', arg: -1 },
  { kind: 'shopRelic', arg: -1 },
  { kind: 'shopBasicPack', arg: -1 },
  { kind: 'shopRecipePack', arg: -1 },
  { kind: 'shopUnlockPack', arg: -1 },
  { kind: 'shopChancePack', arg: -1 },
  { kind: 'shopDeletePack', arg: -1 },
  { kind: 'shopResourcePack', arg: -1 },
  { kind: 'shopExit', arg: -1 },
  { kind: 'eventSafe', arg: -1 },
  { kind: 'eventGreedy', arg: -1 },
]


/** 휴리스틱 교사 정책의 임계값. RL 워밍업 규칙을 코드 곳곳의 매직 넘버가 아니라 실험 가능한 계약으로 둔다. */
export interface EnaHeuristicPolicyConfig {
  explorationRate: number
  emberRefillThreshold: number
  lowHpRecoveryThreshold: number
  safeRewardHpThreshold: number
  safeEventHpThreshold: number
  webCleanupThreshold: number
  shopCriticalHpThreshold: number
  shopCriticalEmberThreshold: number
  /** 잠긴 카드가 이만큼 남아 있으면 해금팩을 우선 구매한다. */
  unlockPackLockedThreshold: number
  /** 확률팩 누적 부스트가 이 값을 넘으면 더 사지 않는다. */
  chanceBoostCap: number
  /** 삭제팩은 해금 풀이 이 크기보다 클 때만 산다(풀 고갈 방지). */
  deletePackPoolFloor: number
  attackGrowthTarget: number
  eventGreedySafetyMargin: number
  eventGreedyBossWindow: number
  bossEmergencyCountdown: number
  bossEmergencyEffectiveHp: number
}

/** 기본 교사 설정은 현재 밸런스 기준값이며, 테스트/오프라인 실험에서 부분 오버라이드한다. */
export const DEFAULT_ENA_HEURISTIC_POLICY_CONFIG: EnaHeuristicPolicyConfig = {
  explorationRate: 0.1,
  emberRefillThreshold: 6,
  lowHpRecoveryThreshold: 6,
  safeRewardHpThreshold: 8,
  safeEventHpThreshold: 10,
  webCleanupThreshold: 2,
  shopCriticalHpThreshold: 8,
  shopCriticalEmberThreshold: 4,
  unlockPackLockedThreshold: 8,
  chanceBoostCap: 40,
  deletePackPoolFloor: 14,
  attackGrowthTarget: 5,
  eventGreedySafetyMargin: 6,
  eventGreedyBossWindow: 12,
  bossEmergencyCountdown: 1,
  bossEmergencyEffectiveHp: 12,
}

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

/** UI 없는 3×3 100층 가상 런. 실제 게임을 직접 돌리지 않아 대량 학습을 빠르게 수행한다. */
export class EnaTrainingSimulation {
  private readonly rng: EnaRandom
  private readonly knowledge: EnaKnowledgeBase
  private board: (EnaSimCard | null)[][] = []
  /** 학습세계의 예고선 큐. observe()에서 미리 뽑고 compactColumns()가 같은 카드를 소비한다. */
  private incomingRefillQueue: (EnaSimCard | null)[] = Array<EnaSimCard | null>(LANES).fill(null)
  private phase: EnaSimPhase = 'field'
  private hp = STARTING_HP
  private maxHp = STARTING_HP
  private shield = 0
  private ember = STARTING_EMBER
  private emberMax = EMBER_MAX
  private emberDecayCountdown = EMBER_DECAY_TURNS
  /** 불씨 소모 주기 — 자원팩 '두꺼운 심지'로 늘어난다. */
  private emberDecayTurns = EMBER_DECAY_TURNS
  /** 불빛(score): 팩/유물 구매 재화. 화폐(coins)와 분리해 실제 경제와 맞춘다. */
  private light = 0
  private coins = 0
  /** 랜턴 등 영구 불빛 배율(실게임 enhancements.scoreMultiplier). */
  private scoreMultiplier = 1
  private attack = 1
  private combo = 0
  private comboMax = CANDLE_MAX
  /** 최대 손패 수 — 자원팩 '큰 배낭'으로 +2. 관측/행동은 앞 HAND_MAX칸만 다룬다. */
  private handMax = HAND_MAX
  private hand: EnaHandSlot[] = []
  /** 조합팩 근사: 레시피 해금의 화력 기대값을 트리플 위력 영구 보너스로 압축. */
  private recipeTripleBonus = 0
  // 런 카드 풀: 실게임 RunCardPool과 같은 해금/잠금/밴 3분할 + 확률팩 T1 부스트.
  private unlockedPool = new Set<HandCardId>()
  private lockedPool = new Set<HandCardId>()
  private bannedPool = new Set<HandCardId>()
  private tier1CardBoosts: Partial<Record<string, number>> = {}
  private turn = 0
  private shopMode: 'shop' | 'altar' = 'shop'
  private shopActionsLeft = 0
  /** 방문 내 동일 팩 반복 구매 누적(가격 상승) — 방문 진입 시 초기화. */
  private shopPackBuysThisVisit: Partial<Record<EnaSimPackKind, number>> = {}
  /** 방문당 무료카드 사용 가능 횟수(상점 1, 제단 2 — 두 번째는 수당 3$). */
  private shopFreeUsesLeft = 0
  /** 방문당 유물 획득 가능 횟수(상점 불빛 구매 최대 3, 제단 무료 1픽). */
  private shopRelicBuysLeft = 0
  /** 이번 step에서 수집한 별빛 수 — 순간 보상 shaping에 쓴다. */
  private starlightsThisStep = 0
  private finalAscent = false
  private bossFloor = 0
  private bossHp = 0
  private bossMaxHp = 0
  private bossAttackCountdown = 0
  private bossPage = 0
  private bossDamageSinceGift = 0
  private bossesCleared = 0
  private eventRisk = 0
  /** 유물로 얻는 턴당 방패 재생. 실게임 유물 경제(상점·제단마다 1개 획득)를 압축한 영구 성장. */
  private shieldRegen = 0
  // 강제 시련(30/60/90F 보스 격파 후 3택 1선택) 누적 — 실게임 runModifiers와 같은 축.
  private trialEnemyHpBonus = 0
  private trialEnemyAtkBonus = 0
  /** 실게임은 character.trapDamageBonus로 일원화 — 모든 함정 피해 계산에 전역 합산된다. */
  private trialTrapDamageBonus = 0
  /** 시련 '가난' 보물상자 스폰 가중치 배율(누적 곱). */
  private trialTreasureScale = 1
  private done = false

  // 동료(에나) 개입 — 성향(disposition)이 주어졌을 때만 활성. 미지정 시 순수 플레이어 시뮬(기존 동작 유지).
  private readonly companion?: EnaDisposition
  /** 클러치 예산('의지'). 피해로 차고, 위기에 클러치를 터뜨리면 0으로 비운다. */
  private will = 0
  /** 각성(최후의 의지)은 런당 1회. */
  private companionAwakened = false

  constructor(seed: number = 1, disposition?: EnaDisposition) {
    this.rng = new EnaRandom(seed)
    this.knowledge = buildEnaKnowledgeBase()
    this.companion = disposition
    this.reset()
  }

  /** 새 에피소드 시작. 초기 보드는 실제 시작처럼 전방엔 꽃 없이, 대기칸엔 꽃 절반 가중치로 채운다. */
  reset(): EnaObservation {
    this.board = Array.from({ length: ROWS }, () => Array<EnaSimCard | null>(LANES).fill(null))
    this.incomingRefillQueue = Array<EnaSimCard | null>(LANES).fill(null)
    this.phase = 'field'
    this.hp = this.maxHp = STARTING_HP
    this.shield = 0
    this.ember = this.emberMax = EMBER_MAX
    this.emberDecayCountdown = EMBER_DECAY_TURNS
    this.emberDecayTurns = EMBER_DECAY_TURNS
    this.light = 0
    this.coins = 0
    this.scoreMultiplier = 1
    this.attack = 1
    this.combo = 0
    this.comboMax = CANDLE_MAX
    this.handMax = HAND_MAX
    this.hand = []
    this.recipeTripleBonus = 0
    // 런 카드 풀 초기화: 실게임 메타 해금과 같은 기준(runLocked=false ∩ 일반 드롭 'any').
    this.unlockedPool = new Set(HAND_CARD_IDS.filter((id) => {
      const def = HAND_CARD_DEFINITIONS[id]
      return !def.runLocked && def.dropSource === 'any'
    }))
    this.lockedPool = new Set(HAND_CARD_IDS.filter((id) => {
      const def = HAND_CARD_DEFINITIONS[id]
      return def.runLocked && def.dropSource !== 'boss'
    }))
    this.bannedPool = new Set()
    this.tier1CardBoosts = {}
    this.turn = 0
    this.shopMode = 'shop'
    this.shopActionsLeft = 0
    this.shopPackBuysThisVisit = {}
    this.shopFreeUsesLeft = 0
    this.shopRelicBuysLeft = 0
    this.starlightsThisStep = 0
    this.finalAscent = false
    this.bossFloor = 0
    this.bossHp = this.bossMaxHp = 0
    this.bossAttackCountdown = 0
    this.bossPage = 0
    this.bossDamageSinceGift = 0
    this.bossesCleared = 0
    this.eventRisk = 0
    this.shieldRegen = 0
    this.trialEnemyHpBonus = 0
    this.trialEnemyAtkBonus = 0
    this.trialTrapDamageBonus = 0
    this.trialTreasureScale = 1
    this.will = 0
    this.companionAwakened = false
    this.done = false
    // 실게임은 직업/유물/레시피로 초반 화력을 보강한다. 그 성장원을 개별 모델링하지 않는 대신
    // 시작 공격력 2로 그 보정을 압축한다(거치지 않은 power source의 prior). 시작 손패는 공격/제어/회복 1장씩.
    this.attack = 2
    this.grantRelic(false) // 시작 직업/유물 보정 1개(초반 발판).
    this.drawCard('ember')
    this.drawCard('chitin')
    this.drawCard('candle')
    for (let row = 0; row < ROWS; row++) {
      for (let lane = 0; lane < LANES; lane++) {
        // 전방행(row 0)만 꽃 제외, 대기행은 꽃 허용으로 실제 초기 배치를 흉내낸다.
        this.board[row][lane] = this.spawnCard(row === 0 ? 'front' : 'waiting')
      }
    }
    this.regroupFrontRow()
    return this.observe()
  }

  /** 현재 상태에서 행동 하나를 적용하고 보상/다음 관측을 돌려준다. */
  step(actionIndex: number): { observation: EnaObservation; reward: number; done: boolean } {
    if (this.done) return { observation: this.observe(), reward: 0, done: true }
    this.starlightsThisStep = 0
    const beforeHp = this.hp
    const beforeBossHp = this.bossHp
    const beforeBosses = this.bossesCleared
    const phaseBefore = this.phase
    const action = ENA_ACTION_SPACE[actionIndex] ?? ENA_ACTION_SPACE[actionIndexOf('wait', -1)]
    let reward = this.applyAction(action)

    // 국면별 시간 진행. 행동 적용 전 국면 기준으로 결정해, 상점 EXIT가 즉시 한 턴을 더
    // 진행시키는 이중 처리를 막는다. 상점/이벤트는 전투 턴을 소모하지 않는 의사결정 샘플이다.
    if (phaseBefore === 'field') this.advanceFieldTurn()
    else if (phaseBefore === 'boss') this.advanceBossTurn()

    reward += this.shapeReward(beforeHp, beforeBossHp, beforeBosses)
    this.finishIfNeeded()
    reward += this.terminalReward()
    return { observation: this.observe(), reward, done: this.done }
  }

  /** 고정 길이 숫자 입력: 스칼라 38 + 예고 3칸×6 + 9칸×14 + 손패 10×9 = ENA_FEATURE_COUNT. */
  observe(): EnaObservation {
    const legalActions = ENA_ACTION_SPACE.filter((action) => this.isLegal(action))
    const tier = EmberSystem.getTier(this.ember)
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
      tierIndex(tier) / 3,
      this.light / 3000,
      this.coins / 10,
      this.attack / 12,
      this.combo / this.comboMax,
      this.hand.length / HAND_MAX,
      this.turn / RUN_TARGET_TURNS,
      this.turnsToShop() / SHOP_INTERVAL,
      this.turnsToBoss() / ALTAR_INTERVAL,
      this.finalAscent ? 1 : 0,
      this.estimateFrontThreat() / 40,
      lightMultiplier(this.turn) / 3,
      this.knowledge.economy.averageRelicBasePrice / 2000,
      this.knowledge.trialPressure / 10,
      this.knowledge.eventPressure / 10,
      this.averageHandBossValue() / 10,
      this.averageHandSynergyValue() / 10,
      this.bossMaxHp > 0 ? this.bossHp / this.bossMaxHp : 0,
      this.bossAttackCountdown / 3,
      this.bossPage / 3,
      EmberSystem.isEnemyFirstStrike(tier) ? 1 : 0,
      this.webThreatCount() / 3,
      this.imminentWebThreatCount() / 3,
      this.readySporeThreatCount() / 3,
      this.strongEnemyThreatCount() / 3,
      this.tripleOpportunityCount() / 3,
      // 런 카드 풀/경제 성장 상태 — 상점 팩 가치 판단용.
      this.lockedPool.size / 20,
      this.totalChanceBoost() / 60,
      this.scoreMultiplier / 3,
    ]
    for (let lane = 0; lane < LANES; lane++) features.push(...this.encodeIncomingCard(this.peekIncomingRefillCard(lane)))
    for (let row = 0; row < ROWS; row++) {
      for (let lane = 0; lane < LANES; lane++) features.push(...this.encodeCard(this.board[row][lane], row))
    }
    for (let slot = 0; slot < HAND_MAX; slot++) features.push(...this.encodeHand(this.hand[slot]))
    // 관측 차원이 깨지면 학습 모델 입출력 계약이 흔들리므로 즉시 드러나게 한다.
    if (features.length !== ENA_FEATURE_COUNT) throw new Error(`Ena feature size mismatch: ${features.length} != ${ENA_FEATURE_COUNT}`)
    return { features, legalActions, snapshot: this.snapshot() }
  }

  /** 현재 스냅샷을 사람이 읽을 수 있는 플레이 조언으로 바꿔 대사/설명 학습에 쓴다. */
  analyzeDecision(observation: EnaObservation = this.observe()): EnaStrategicAnalysis {
    const { snapshot } = observation
    const recommendedActionIndex = EnaTrainingSimulation.teacherPolicy(observation, this.rng)
    const action = ENA_ACTION_SPACE[recommendedActionIndex]
    const projectedDamage = emberDamage(snapshot.attack, false)
    const frontThreat = this.estimateFrontThreat()
    const bossPlanValue = this.bossPreparationValue(snapshot)
    const reason = this.buildReason(snapshot, action, projectedDamage, frontThreat, bossPlanValue)
    return { recommendedActionIndex, reason, projectedDamage, frontThreat, bossPlanValue }
  }

  /** 교사 정책으로 에피소드를 굴려 초기 학습 데이터/회귀 테스트를 만든다. */
  runEpisode(policy: EnaPolicy = EnaTrainingSimulation.teacherPolicy): EnaEpisodeResult {
    const samples: EnaTrainingSample[] = []
    const trace: string[] = []
    let observation = this.reset()
    let totalReward = 0
    let guard = 0
    // 100층 + 보스/상점 의사결정까지 도는 한 호. guard로 정책 버그발 무한루프를 방지한다.
    while (!this.done && guard++ < 5000) {
      const actionIndex = policy(observation, this.rng)
      const state = observation.features
      const result = this.step(actionIndex)
      totalReward += result.reward
      samples.push({ state, actionIndex, reward: result.reward, nextState: result.observation.features, done: result.done })
      trace.push(`${this.turn}:${this.phase}:${ENA_ACTION_SPACE[actionIndex]?.kind ?? 'unknown'}`)
      observation = result.observation
    }
    return {
      survivedTurns: this.turn,
      totalReward,
      won: this.turn >= RUN_TARGET_TURNS && this.bossesCleared >= BOSS_FLOORS.length && this.hp > 0,
      bossesCleared: this.bossesCleared,
      samples,
      trace,
    }
  }

  /** 여러 에피소드의 전이 샘플을 모아 외부 딥러닝 트레이너에 넘길 배치를 만든다. */
  static collectDataset(episodes: number, seed: number = 1, policy: EnaPolicy = EnaTrainingSimulation.teacherPolicy): EnaTrainingSample[] {
    const dataset: EnaTrainingSample[] = []
    for (let i = 0; i < episodes; i++) dataset.push(...new EnaTrainingSimulation(seed + i).runEpisode(policy).samples)
    return dataset
  }

  /** 휴리스틱 교사 정책. 클러치/손패/상점·이벤트·보스 준비를 반영하고, ε 확률로 탐험한다.
   *  탐험(ε)은 부트스트랩 데이터에 다양성을 주어 모방학습이 한 궤적에 갇히지 않게 한다. */
  static teacherPolicy(observation: EnaObservation, rng: EnaRandom): number {
    const legal = observation.legalActions
    if (legal.length === 0) return actionIndexOf('wait', -1)
    if (rng.next() < DEFAULT_ENA_HEURISTIC_POLICY_CONFIG.explorationRate) {
      const pick = legal[rng.int(legal.length)]
      return ENA_ACTION_SPACE.findIndex((a) => a.kind === pick.kind && a.arg === pick.arg)
    }
    const { snapshot } = observation
    if (snapshot.phase === 'shop') return shopPolicy(snapshot, legal, DEFAULT_ENA_HEURISTIC_POLICY_CONFIG)
    if (snapshot.phase === 'event') return eventPolicy(snapshot, DEFAULT_ENA_HEURISTIC_POLICY_CONFIG)
    if (snapshot.phase === 'boss') return bossPolicy(snapshot, DEFAULT_ENA_HEURISTIC_POLICY_CONFIG)
    return fieldPolicy(snapshot, DEFAULT_ENA_HEURISTIC_POLICY_CONFIG)
  }

  /** 기본 휴리스틱에서 일부 임계값만 바꾼 교사 정책을 만든다. 실험은 이 경로로 하드코딩 없이 분기한다. */
  static configuredTeacherPolicy(config: Partial<EnaHeuristicPolicyConfig>): EnaPolicy {
    const cfg = { ...DEFAULT_ENA_HEURISTIC_POLICY_CONFIG, ...config }
    return (observation: EnaObservation, rng: EnaRandom): number => {
      const legal = observation.legalActions
      if (legal.length === 0) return actionIndexOf('wait', -1)
      if (rng.next() < cfg.explorationRate) {
        const pick = legal[rng.int(legal.length)]
        return ENA_ACTION_SPACE.findIndex((a) => a.kind === pick.kind && a.arg === pick.arg)
      }
      const { snapshot } = observation
      if (snapshot.phase === 'shop') return shopPolicy(snapshot, legal, cfg)
      if (snapshot.phase === 'event') return eventPolicy(snapshot, cfg)
      if (snapshot.phase === 'boss') return bossPolicy(snapshot, cfg)
      return fieldPolicy(snapshot, cfg)
    }
  }

  // ── 행동 적용 ────────────────────────────────────────────────────────────

  private applyAction(action: EnaSimAction): number {
    if (!this.isLegal(action)) return -4
    if (this.phase === 'shop') return this.applyShopAction(action)
    if (this.phase === 'event') return this.applyEventAction(action)
    if (this.phase === 'boss') return this.applyBossAction(action)
    return this.applyFieldAction(action)
  }

  private applyFieldAction(action: EnaSimAction): number {
    if (action.kind === 'useHand') return this.useHandCard(action.arg)
    if (action.kind === 'wait') return -0.5
    if (action.kind === 'clickLane') {
      const card = this.board[0][action.arg]
      if (!card) return -1
      if (card.type === CardType.ENEMY) return this.damageFrontEnemy(action.arg, this.attack, 'basic')
      if (card.type === CardType.TREASURE) {
        if (card.treasureKind === 'starlight') return -1 // 별빛은 클릭이 아니라 전방 자동 수집
        this.applyTreasure(card)
        this.board[0][action.arg] = null
        return 1.5
      }
      if (card.type === CardType.FLOWER) {
        if (card.flowerKind === 'seed') return -0.8 // 씨앗은 개화 전이라 수확 가치 없음
        this.applyFlower(card)
        this.board[0][action.arg] = null
        return 1.5
      }
      if (card.type === CardType.EVENT) {
        // 문 진입 → 이벤트 국면. 닫히기 전에 들어가는 선택을 학습한다.
        this.board[0][action.arg] = null
        this.phase = 'event'
        this.eventRisk = 2 + this.rng.int(5)
        return 0.4
      }
      if (card.type === CardType.TRAP) {
        // 맨손으로 함정을 밟아 치움 — 피해를 그대로 받되 처리 불빛은 지급(실게임 규칙).
        this.takeDamage(trapDamage(card, this.trialTrapDamageBonus))
        this.gainLight(this.trapClearLightBase(card))
        this.board[0][action.arg] = null
        return -0.6
      }
    }
    return -1
  }

  /** 손패 1장을 카테고리/타겟팅 기준으로 자동 대상에 사용한다(가장 합리적인 레인 선택). */
  private useHandCard(slot: number): number {
    const held = this.hand[slot]
    if (!held) return -1
    const def = HAND_CARD_DEFINITIONS[held.id]
    const tactic = this.knowledge.handCards[held.id]
    let reward = 0
    const merged = held.merged

    if (def.category === 'attack') {
      reward = this.resolveAttackCard(def, merged)
    } else if (def.category === 'control') {
      reward = this.resolveControlCard(held.id, def, merged)
    } else if (def.category === 'recovery') {
      reward = this.resolveRecoveryCard(held.id, tactic)
    } else {
      reward = this.resolveToolCard(held.id)
    }
    this.consumeHand(slot)
    return reward
  }

  private resolveAttackCard(def: HandCardDefinition, merged: boolean): number {
    // 조합팩 근사 보너스는 트리플에만 붙는다(레시피=합성 강화 압축).
    const dmg = emberDamage(this.attack, merged) + (merged ? this.recipeTripleBonus : 0)
    const targeting = merged ? def.targeting.triple : def.targeting.base
    const hitAll = targeting.selection === 'all'
    const lanes = hitAll ? [0, 1, 2] : [this.toughestEnemyLane()]
    let reward = -0.4
    let hit = false
    for (const lane of lanes) {
      if (lane < 0) continue
      const card = this.board[0][lane]
      if (card?.type !== CardType.ENEMY) continue
      hit = true
      reward += this.damageFrontEnemy(lane, dmg, 'ember') + 0.5
    }
    return hit ? reward : -0.4
  }

  private resolveControlCard(id: HandCardId, def: HandCardDefinition, merged: boolean): number {
    const targeting = merged ? def.targeting.triple : def.targeting.base
    // 밀랍 계열: 전방의 가장 위협적인 적을 굳힌다(보스는 면역).
    if (id === 'wax') {
      const lane = this.toughestEnemyLane()
      const card = lane >= 0 ? this.board[0][lane] : null
      if (!card) return -0.6
      card.frozen = 2
      return 1.2
    }
    // 키틴/청소/성수 등 함정 제거: maxSpan 폭 제한을 존중한다.
    const maxSpan = targeting.maxSpan ?? (id === 'sweep' ? 1 : 3)
    const lane = this.worstTrapLane(maxSpan, id === 'sweep')
    if (lane < 0) return -0.6
    const card = this.board[0][lane]!
    const removedDamage = trapDamage(card, this.trialTrapDamageBonus)
    this.gainLight(this.trapClearLightBase(card)) // 함정 처리도 불빛을 지급(실게임 근사)
    this.board[0][lane] = null
    if (id === 'sweep' && !merged) {
      // 청소 단일은 1칸 거미줄 전체만 치우는 무점수 정리. 같은 행의 다른 1칸 web도 정리한다.
      for (let l = 0; l < LANES; l++) {
        const c = this.board[0][l]
        if (c?.type === CardType.TRAP && c.trapKind === 'web' && c.group === 1) this.board[0][l] = null
      }
    }
    return 1.2 + Math.min(2, removedDamage * 0.1)
  }

  private resolveRecoveryCard(id: HandCardId, tactic: EnaHandCardTactic): number {
    const lowHp = this.hp <= 6
    if (id === 'sacrifice-shield' || id === 'sword-and-shield') {
      this.shield += 6
      return lowHp ? 2 : 0.4
    }
    if (id === 'candle' || id === 'candle-tome') {
      this.gainCombo(4)
      return 0.8
    }
    // 기본 회복: 체력 회복. 가치는 지식 어댑터의 fieldValue로 스케일.
    const heal = Math.max(3, Math.round(tactic.fieldValue))
    const before = this.hp
    this.hp = Math.min(this.maxHp, this.hp + heal)
    return (this.hp - before) > 0 ? (lowHp ? 2.5 : 0.6) : -0.3
  }

  private resolveToolCard(id: HandCardId): number {
    if (id === 'match') {
      this.ember = Math.min(this.emberMax, this.ember + 1)
      return this.ember <= 3 ? 2 : 0.5
    }
    if (id === 'coin' || id === 'greed-coin') {
      this.coins += id === 'greed-coin' ? 3 : 1
      if (id === 'greed-coin') this.takeDamage(2) // 탐욕의 동전 자해
      return 0.6
    }
    if (id === 'card') {
      const added = this.drawCard()
      return added ? 0.8 : -0.5
    }
    if (id === 'key') {
      // 보물칸 개봉 보조 — 전방 보물이 있으면 코인 획득.
      const lane = this.board[0].findIndex((c) => c?.type === CardType.TREASURE && c.treasureKind !== 'starlight')
      if (lane < 0) return -0.4
      const card = this.board[0][lane]!
      this.applyTreasure(card)
      this.board[0][lane] = null
      return 1.4
    }
    // 기타 도구: 가벼운 불빛 이득(화폐는 보물/보스 등 실제 원천만 유지).
    this.gainLight(20)
    return 0.3
  }

  private applyShopAction(action: EnaSimAction): number {
    if (action.kind === 'shopExit') {
      // 제단 EXIT가 30/60/90F 보스 게이트로 이어진다(실게임 흐름). 아직 안 잡은 차례면 보스 진입.
      const bossIndex = BOSS_FLOORS.indexOf(this.turn)
      if (bossIndex >= 0 && this.bossesCleared === bossIndex) {
        this.enterBoss(this.turn)
      } else {
        this.phase = 'field'
        this.dropAndRefill()
      }
      return 0.1
    }
    this.shopActionsLeft--
    switch (action.kind) {
      case 'shopFree': return this.useShopFreeCard()
      case 'shopRelic': {
        // 상점 유물은 불빛 구매, 제단 유물은 무료 1픽(실게임 규칙).
        if (this.shopMode === 'shop') this.spendLight(this.relicCost())
        this.shopRelicBuysLeft--
        this.grantRelic(this.shopMode === 'altar')
        return this.turnsToBoss() <= 10 ? 2.5 : 1.5
      }
      case 'shopBasicPack': return this.buyBasicPack()
      case 'shopRecipePack': return this.buyRecipePack()
      case 'shopUnlockPack': return this.buyUnlockPack()
      case 'shopChancePack': return this.buyChancePack()
      case 'shopDeletePack': return this.buyDeletePack()
      case 'shopResourcePack': return this.buyResourcePack()
      default:
        return -2
    }
  }

  // ── 상점 콘텐츠(실제 6종 팩·무료카드·유물) ─────────────────────────────────

  /** 방문 내 반복 구매 누적을 반영한 현재 팩 가격(ShopPricing 공유 공식). */
  private packCost(kind: EnaSimPackKind): number {
    const base = this.shopMode === 'altar' ? altarPackBaseCost(this.turn) : regularShopPackBaseCost(this.turn)
    return packCostWithRepeats(base, this.shopPackBuysThisVisit[kind] ?? 0)
  }

  /** 상점 유물 가격 근사: 실제 오퍼는 3장 개별가라 플레이어는 보통 저가 카드를 고를 수 있다.
   *  평균 basePrice의 0.75배로 "3장 중 살 만한 것" 기대가를 압축한다. */
  private relicCost(): number {
    return Math.round(this.knowledge.economy.averageRelicBasePrice * 0.75)
  }

  private payPack(kind: EnaSimPackKind): void {
    this.spendLight(this.packCost(kind))
    this.shopPackBuysThisVisit[kind] = (this.shopPackBuysThisVisit[kind] ?? 0) + 1
  }

  /** 무료카드: 선물 상자(6종 랜덤). 제단 두 번째 장은 수당 3$ 고정(실게임 free_002). */
  private useShopFreeCard(): number {
    this.shopFreeUsesLeft--
    if (this.shopMode === 'altar' && this.shopFreeUsesLeft === 0) {
      this.coins += 3
      return 1
    }
    switch (this.rng.int(6)) {
      case 0: this.light += Math.round(300 * this.scoreMultiplier); break // ✦300(고정 불빛 — 턴 배율 미적용)
      case 1: this.coins += 1; break
      case 2: this.hp = Math.min(this.maxHp, this.hp + 5); break
      case 3: this.gainCombo(3); break
      case 4: this.ember = Math.min(this.emberMax, this.ember + 3); break
      default: this.drawCard(); this.drawCard(); break
    }
    return 1
  }

  /** 자원팩(basic): 실게임 BASIC_PACK_POOL 근사. 실제 팩은 3택이라
   *  "지금 필요한 것을 고르는" 플레이어 선택을 필요 우선순위로 압축한다. */
  private buyBasicPack(): number {
    this.payPack('basic-pack')
    const needHeal = this.maxHp - this.hp >= 5
    const needEmber = this.emberMax - this.ember >= 2
    if (needHeal) this.hp = Math.min(this.maxHp, this.hp + 5)
    else if (needEmber) this.ember = Math.min(this.emberMax, this.ember + 2)
    else if (this.shield < 5) this.shield += 5
    else this.gainCombo(2)
    return needHeal || needEmber ? 2 : 0.8
  }

  /** 조합팩: 시뮬에는 레시피 실행 모델이 없어 정직한 근사 — 트리플 위력 영구 +2. */
  private buyRecipePack(): number {
    this.payPack('recipe-pack')
    this.recipeTripleBonus += 2
    return 1
  }

  /** 해금팩: 잠긴 카드(없으면 밴 해제) 중 지식 가치가 높은 1종 해금 + 그 카드 1장 지급.
   *  실게임 맛보기(첫 구매 1장)를 매 구매 1장으로 압축한다. */
  private buyUnlockPack(): number {
    this.payPack('unlock-pack')
    const pickFrom = this.lockedPool.size > 0 ? this.lockedPool : this.bannedPool
    const best = [...pickFrom].sort((a, b) => this.cardWorth(b) - this.cardWorth(a))[0]
    if (!best) return -1
    this.lockedPool.delete(best)
    this.bannedPool.delete(best)
    this.unlockedPool.add(best)
    this.drawCard(best)
    return 1.5
  }

  /** 확률팩: 해금 풀에서 가치 높은 카드 1종에 등급별 T1 부스트 누적(실게임 RARITY_BOOST). */
  private buyChancePack(): number {
    this.payPack('chance-pack')
    const target = [...this.unlockedPool]
      .filter((id) => (HAND_CARD_DEFINITIONS[id].dropWeight ?? 0) > 0)
      .sort((a, b) => this.cardWorth(b) - this.cardWorth(a))[0]
    if (!target) return -1
    const rarity = HAND_CARD_RARITY[target] ?? 'common'
    this.tier1CardBoosts[target] = (this.tier1CardBoosts[target] ?? 0) + CHANCE_PACK_RARITY_BOOST[rarity]
    return 1.2
  }

  /** 삭제팩: 해금 풀에서 가치가 가장 낮은 카드 1종을 밴해 드롭 질을 올린다. */
  private buyDeletePack(): number {
    this.payPack('delete-pack')
    const worst = [...this.unlockedPool].sort((a, b) => this.cardWorth(a) - this.cardWorth(b))[0]
    if (!worst) return -1
    this.unlockedPool.delete(worst)
    this.bannedPool.add(worst)
    delete this.tier1CardBoosts[worst]
    return 1
  }

  /** 제단 자원팩: 실제 8종 풀을 weight 기반 1택으로 압축 적용(피커 3택 근사). */
  private buyResourcePack(): number {
    this.payPack('resource-pack')
    // weight: 의복3/가열1/배낭20/성냥갑15/심지3/조커1/랜턴10/동전1 (ShopPools 동일).
    const entries: { weight: number; apply: () => void }[] = [
      { weight: 3, apply: () => { this.maxHp += 5; this.hp += 5 } },
      { weight: 1, apply: () => { this.attack += 1 } },
      // 큰 배낭: 관측 10칸 초과분은 트리플 합성 대기 버퍼로만 동작(행동은 앞 10칸).
      { weight: 20, apply: () => { this.handMax = Math.min(HAND_MAX + 2, this.handMax + 2) } },
      { weight: 15, apply: () => { this.emberMax += 2 } },
      { weight: 3, apply: () => { this.emberDecayTurns += 1 } },
      { weight: 1, apply: () => { this.comboMax = Math.max(8, this.comboMax - 1) } },
      { weight: 10, apply: () => { this.scoreMultiplier *= 1.10 } },
      { weight: 1, apply: () => { this.coins += 1 } },
    ]
    const total = entries.reduce((sum, e) => sum + e.weight, 0)
    let roll = this.rng.next() * total
    for (const entry of entries) {
      roll -= entry.weight
      if (roll <= 0) { entry.apply(); break }
    }
    return 1.5
  }

  /** 지식 어댑터 기반 카드 종합 가치 — 해금/확률/삭제팩의 대상 선택에 쓴다. */
  private cardWorth(id: HandCardId): number {
    const tactic = this.knowledge.handCards[id]
    if (!tactic) return 0
    return tactic.fieldValue + tactic.bossValue + tactic.synergyValue * 0.3 - tactic.liability
  }

  private applyEventAction(action: EnaSimAction): number {
    if (action.kind === 'eventSafe') {
      this.hp = Math.min(this.maxHp, this.hp + 3)
      this.phase = 'field'
      return this.hp <= 8 ? 3 : 1
    }
    if (action.kind === 'eventGreedy') {
      this.takeDamage(this.eventRisk)
      this.coins += 3
      this.drawCard()
      this.phase = 'field'
      return this.hp > 0 ? 2.5 - this.eventRisk * 0.2 : -12
    }
    return -2
  }

  private applyBossAction(action: EnaSimAction): number {
    if (action.kind === 'clickLane') return this.damageBoss(this.attack, 'basic')
    if (action.kind === 'useHand') {
      const held = this.hand[action.arg]
      if (!held) return -1
      const def = HAND_CARD_DEFINITIONS[held.id]
      if (def.category === 'attack') {
        const dmg = emberDamage(this.attack, held.merged) + (held.merged ? this.recipeTripleBonus : 0)
        const reward = this.damageBoss(dmg, 'ember')
        this.consumeHand(action.arg)
        return reward
      }
      if (def.category === 'recovery') {
        const reward = this.resolveRecoveryCard(held.id, this.knowledge.handCards[held.id])
        this.consumeHand(action.arg)
        return reward
      }
      if (def.category === 'control') {
        // 보스는 굳음 면역 — 밀랍/제어는 헛스윙이다.
        this.consumeHand(action.arg)
        return held.id === 'wax' ? -1 : -0.4
      }
      const reward = this.resolveToolCard(held.id)
      this.consumeHand(action.arg)
      return reward
    }
    return -1
  }

  // ── 데미지/자원 ──────────────────────────────────────────────────────────

  private damageFrontEnemy(lane: number, amount: number, source: 'basic' | 'ember'): number {
    const card = this.board[0][lane]
    if (!card || card.type !== CardType.ENEMY) return -1
    card.hp -= amount
    if (card.hp <= 0) {
      this.board[0][lane] = null
      // 처치 콤보(촛불): 폭이 큰 무리를 잡을수록 더 채운다 → 공격력 성장 동력.
      this.gainCombo((source === 'ember' ? 4 : 2) + (card.group - 1))
      // 처치 불빛: 실게임 scoreForCardRemoval 근사 — 랭크(enemyPower) 1차식 + 그룹 25% 감산 배수.
      const rankLight = ENEMY_LIGHT_BASE + Math.max(1, card.value) * ENEMY_LIGHT_PER_RANK
      this.gainLight(card.group > 1 ? rankLight * card.group * 0.75 : rankLight)
      if (this.rng.next() < 0.3) this.drawCard()
      // 동료 깜짝 지원(치명타): 가끔 보너스 손패 1장.
      if (this.companion && this.rng.next() < this.companion.minorClutchChance.crit) this.drawCard()
      return source === 'ember' ? 3.2 : 2.3
    }
    // 적중(미처치)도 콤보 게이지(촛불)를 조금 채운다 — 실게임처럼 공격력 성장의 동력을 만든다.
    this.gainCombo(1)
    // 처치 실패 시 반격은 적 페이즈(resolveFrontHazards)가 한 번만 처리한다 — 여기서 중복 적용하지 않는다.
    return source === 'ember' ? 0.2 : -0.5
  }

  private damageBoss(amount: number, source: 'basic' | 'ember'): number {
    const before = this.bossHp
    this.bossHp -= amount
    const floor = this.bossPageFloor()
    if (this.bossHp < floor) this.bossHp = floor // 페이지 경계 초과 피해 컷
    const dealt = before - this.bossHp
    this.bossDamageSinceGift += dealt
    const profile = BOSS_PROFILES[this.bossFloor]
    // HP 10 손실마다 손패 1장 지급(실게임 공통).
    while (this.bossDamageSinceGift >= profile.handGiftStep) {
      this.bossDamageSinceGift -= profile.handGiftStep
      this.drawCard()
    }
    this.gainCombo(source === 'ember' ? 3 : 1)
    this.checkBossProgress()
    return source === 'ember' ? 2.2 : 0.8
  }

  /** 보스 HP가 현재 페이지 경계에 닿으면 다음 페이지로 넘기거나 격파 처리한다.
   *  경계에서 HP를 그대로 유지(능력 누적)하며, 마지막 페이지(=0) 도달이 격파다. */
  private checkBossProgress(): void {
    const profile = BOSS_PROFILES[this.bossFloor]
    const floor = this.bossPageFloor()
    if (this.bossHp > floor) return
    this.bossHp = floor
    if (profile.pages && this.bossPage < profile.pages.length - 1) {
      this.bossPage++ // 다음 페이지 — 경계 HP가 새 페이지의 천장이 된다.
      this.bossAttackCountdown = profile.interval
      return
    }
    this.defeatBoss()
  }

  private takeDamage(amount: number): void {
    if (amount <= 0) return
    const blocked = Math.min(this.shield, amount)
    this.shield -= blocked
    this.hp -= amount - blocked
    // 동료: 역경(피해)에 비례해 '의지'를 쌓는다(클러치 예산).
    if (this.companion && this.maxHp > 0) {
      this.will = Math.min(100, this.will + Math.round((amount / this.maxHp) * this.companion.willGainPerDamage) + this.companion.willGainFlatBonus)
      // 각성: 진짜 죽음 직전에 런당 1회, 드물게 — 풀 회복 + 공격력 +1로 버틴다.
      if (this.hp <= 0 && !this.companionAwakened && this.rng.next() < this.companion.awakenChance) {
        this.companionAwakened = true
        this.hp = this.maxHp
        this.attack += 1
      }
    }
  }

  /** 실게임 createScoreLog 근사: 기본값 × (1+턴×0.015) × scoreMultiplier × 1.4(지터 평균 1). */
  private gainLight(base: number): number {
    const amount = Math.max(1, Math.round(base * lightMultiplier(this.turn) * this.scoreMultiplier * BASE_LIGHT_GAIN_MULTIPLIER))
    this.light += amount
    return amount
  }

  private spendLight(amount: number): void {
    this.light = Math.max(0, this.light - amount)
  }

  /** 함정 처리 불빛(실게임: 거미줄 20/50/80, 포자 10/20/30, 폭탄 50 + 턴 보너스). */
  private trapClearLightBase(card: EnaSimCard): number {
    const span = Math.min(3, Math.max(1, card.group))
    const base = card.trapKind === 'spore'
      ? [10, 20, 30][span - 1]
      : card.trapKind === 'bomb'
        ? 50
        : [20, 50, 80][span - 1]
    return base + this.turn
  }

  private gainCombo(amount: number): void {
    this.combo += amount
    if (this.combo >= this.comboMax) {
      this.combo -= this.comboMax
      this.attack++ // candle 'attack' 모드: 게이지 충전 시 공격력 +1
    }
  }

  private applyTreasure(card: EnaSimCard): void {
    // 보물 불빛: 일반 상자 기본 36 + 턴 보너스(실게임 근사, 시뮬 보물은 1칸 고정).
    this.gainLight(36 + this.turn + card.value * 4)
    // 보물상자 전용 손패 풀(동전 포함 실제 dropSource 'treasure') 보너스 드롭.
    if (this.rng.next() < 0.35) this.drawCard(undefined, 'treasure')
    // 화폐는 보물 동전에서만 낮은 확률로 나온다(실게임 희소 재화 유지).
    if (this.rng.next() < 0.15) this.coins += 1
    if (this.rng.next() < 0.2) this.shield += 3
    // 동료 깜짝 지원(보물): 가끔 보너스 손패 1장.
    if (this.companion && this.rng.next() < this.companion.minorClutchChance.treasure) this.drawCard()
  }

  private applyFlower(card: EnaSimCard): void {
    const v = card.value
    // 수확 불빛(실게임 24 + 가치×12) + 꽃 종류별 즉시 효과.
    this.gainLight(24 + v * 12)
    if (card.flowerKind === 'redRose') this.hp = Math.min(this.maxHp, this.hp + v)
    else if (card.flowerKind === 'oleander') this.shield += v
    else if (card.flowerKind === 'lavender') this.gainCombo(v)
    else if (card.flowerKind === 'marigold') this.gainLight(24 + v * 12) // 금잔화: 불빛 보너스 꽃
  }

  // ── 손패 관리(트리플 합성 포함) ────────────────────────────────────────────

  /** 손패에 카드를 더한다. 지정 id가 없으면 런 카드 풀에서 실제 2단계 추첨. 손패가 가득 차면 실패. */
  private drawCard(id?: HandCardId, source: HandCardDropSource = 'enemy-kill'): boolean {
    if (this.hand.length >= this.handMax) return false
    const drawn = id ?? this.drawPoolId(source)
    this.hand.push({ id: drawn, merged: false })
    this.autoMergeHand()
    return true
  }

  /** 실게임 DropSystem과 같은 2단계(등급 T1→dropWeight T2) 추첨을 런 풀/확률팩 부스트째로 공유한다. */
  private drawPoolId(source: HandCardDropSource): HandCardId {
    return DropSystem.drawIdFromPool([...this.unlockedPool], source, this.tier1CardBoosts, {}, () => this.rng.next())
  }

  /** 확률팩 누적 부스트 총량 — 관측/상점 판단용. */
  private totalChanceBoost(): number {
    return Object.values(this.tier1CardBoosts).reduce<number>((sum, v) => sum + (v ?? 0), 0)
  }

  /** 같은 카드 3장이 연속이면 트리플로 합성한다(실게임 자동 합성 규칙). */
  private autoMergeHand(): void {
    for (let i = 0; i + 2 < this.hand.length; i++) {
      const a = this.hand[i]
      const b = this.hand[i + 1]
      const c = this.hand[i + 2]
      if (!a.merged && !b.merged && !c.merged && a.id === b.id && b.id === c.id) {
        this.hand.splice(i, 3, { id: a.id, merged: true })
        return
      }
    }
  }

  private consumeHand(slot: number): void {
    if (slot >= 0 && slot < this.hand.length) this.hand.splice(slot, 1)
  }

  /** 소소한 회피 클러치는 피해 적용 직전에 굴려 런타임의 incoming-damage 타이밍과 맞춘다. */
  private companionDodges(amount: number, adversity: boolean): boolean {
    const d = this.companion
    if (!d || amount <= 0) return false
    let chance = d.minorClutchChance.dodge
    if (adversity) chance *= d.clutchAdversityBoost
    chance = Math.min(adversity ? 0.45 : 0.22, chance)
    return this.rng.next() < chance
  }

  /** 동료(에나) 개입: 회복/방패뿐 아니라 위험별 손패 보급까지 같은 의지 예산에서 다룬다. */
  private companionInterventions(): void {
    const d = this.companion
    if (!d || this.done) return
    const aid = this.predictiveAidCard()
    if (this.will >= 100 && this.hp > 0 && this.hp / this.maxHp <= d.clutchHpThreshold) {
      this.will = 0
      if (this.rng.next() < d.clutchHealVsShield) {
        this.hp = Math.min(this.maxHp, this.hp + clampInt(this.maxHp * d.clutchHealRatio * d.clutchStrength, 4, 12))
      } else {
        this.shield += clampInt(this.maxHp * d.clutchShieldRatio * d.clutchStrength, 3, 10)
      }
    } else if (this.will >= 100 && this.ember <= 3) {
      // 런타임과 동일하게 즉시 게이지를 올리지 않고 성냥을 건네, 플레이어 손패 의사결정을 보존한다.
      this.will = 0
      this.drawCard('match')
    } else if (this.will >= 100 && aid && this.canHandOutAid(aid)) {
      // 위험 대비 RL 경험: 거미줄/포자/강적/트리플 각에 맞는 손패 보급도 큰 클러치로 학습한다.
      this.will = 0
      this.drawCard(aid)
    }
    // 소소한 예지 지원은 큰 의지를 쓰지 않는 낮은 빈도 보조로 유지한다.
    if (this.rng.next() < Math.min(0.95, d.predictBaseChance)) {
      const minorAid = aid ?? this.predictiveAidCard()
      if (minorAid && this.canHandOutAid(minorAid)) this.drawCard(minorAid)
    }
  }

  /** 지원 카드 중복 지급 방지 — 단, 비합체 2장 보유는 3장째가 트리플로 완성되므로 허용한다(런타임 동일 규칙). */
  private canHandOutAid(aid: HandCardId): boolean {
    const count = this.hand.filter((s) => !s.merged && s.id === aid).length
    return count === 0 || count === 2
  }

  // ── 턴 진행 ──────────────────────────────────────────────────────────────

  private advanceFieldTurn(): void {
    // 0) 유물 방패 재생(턴당) — 영구 성장이 생존을 받쳐 준다.
    if (this.shieldRegen > 0) this.shield += this.shieldRegen
    // 1) 전방에 남은 위험이 턴 종료 피해를 준다(낮은 티어는 반격감 강화).
    this.resolveFrontHazards()
    // 1.5) 동료 개입 — 이번 턴 피해로 쌓인 의지로 위기 클러치, 거미줄 예측 대비를 시도한다.
    this.companionInterventions()
    // 2) 포자 전염 / 꽃 성장·시듦.
    this.spreadSpores()
    this.growAndWiltFlowers()
    // 3) 불씨 소모(3턴 주기). 최종 등반에선 일반 행동이 턴을 올리지 않는다.
    if (!this.finalAscent) {
      this.turn++
      if (--this.emberDecayCountdown <= 0) {
        this.emberDecayCountdown = this.emberDecayTurns
        this.ember = Math.max(0, this.ember - 1)
      }
    }
    // 4) 마일스톤: 10/20/30…/90 상점·제단 진입(30/60/90F는 제단 EXIT가 보스로 잇는다).
    if (this.maybeEnterMilestone()) return
    // 5) 레일 하강·리필·정리, 씨앗 개화, 별빛 자동 수집(최종 등반).
    this.dropAndRefill()
    // 별빛 등반으로 100층에 도달하면 즉시 클리어가 아니라 100F 보스로 진입한다.
    if (this.finalAscent && this.turn >= RUN_TARGET_TURNS && this.bossesCleared === 3) this.enterBoss(100)
  }

  /** 상점/제단 진입 여부를 판정한다(최종 등반 중에는 열지 않는다). 진입 시 레일 리필을 건너뛴다. */
  private maybeEnterMilestone(): boolean {
    if (this.finalAscent) return false
    if (this.turn > 0 && this.turn % SHOP_INTERVAL === 0 && this.turn < RUN_TARGET_TURNS) {
      this.phase = 'shop'
      this.shopMode = this.turn % ALTAR_INTERVAL === 0 ? 'altar' : 'shop'
      // 방문 단위 상태: 팩 반복가/무료카드/유물 한도. 유물은 이제 자동 지급이 아니라 shopRelic 행동.
      this.shopPackBuysThisVisit = {}
      this.shopFreeUsesLeft = this.shopMode === 'altar' ? 2 : 1
      this.shopRelicBuysLeft = this.shopMode === 'altar' ? 1 : 3
      this.shopActionsLeft = 12 // 정책 버그로 방문이 무한히 길어지지 않게 하는 상한
      return true
    }
    return false
  }

  /** 유물 획득을 영구 스탯 성장으로 압축한다(개별 유물 효과 대신 등반 파워커브 prior).
   *  실제 상점/제단은 3장 중 1택이므로 무작위 2후보 중 현재 필요에 더 맞는 쪽을 고른다. */
  private grantRelic(strong: boolean): void {
    const scale = strong ? 2 : 1
    const apply = (roll: number): void => {
      switch (roll) {
        case 0: this.maxHp += 4 * scale; this.hp += 4 * scale; break          // 활력
        case 1: this.attack += scale; break                                   // 예기
        case 2: this.emberMax += 2; this.ember = Math.min(this.emberMax, this.ember + 3 * scale); break // 불씨
        case 3: this.shieldRegen += scale; break                              // 방벽(턴당 방패)
        default: this.comboMax = Math.max(8, this.comboMax - 2 * scale); break // 촛불(멜트 가속)
      }
    }
    const need = (roll: number): number => {
      if (roll === 1) return this.attack < 6 ? 3 : 1            // 공격력은 보스 등반 핵심
      if (roll === 0) return this.maxHp - this.hp >= 6 ? 2.5 : 1.5
      if (roll === 2) return this.ember <= 4 ? 2 : 1
      return 1.2
    }
    const a = this.rng.int(5)
    const b = this.rng.int(5)
    apply(need(a) >= need(b) ? a : b)
  }

  /** 턴 종료 시 전방의 적만 능동 공격한다. 함정(거미줄/포자/폭탄)은 '밟았을 때'(클릭) 피해라
   *  여기서 수동 피해를 주지 않는다 — 처리하지 않은 전방행은 다음 레일 하강에서 내려가 사라진다. */
  private resolveFrontHazards(): void {
    const tier = EmberSystem.getTier(this.ember)
    const firstStrike = EmberSystem.isEnemyFirstStrike(tier)
    for (const card of this.uniqueFrontCards()) {
      if (card.frozen > 0) {
        card.frozen--
        continue
      }
      if (card.type === CardType.ENEMY) {
        // 선공 티어는 실게임에서 '적 페이즈가 플레이어 행동보다 먼저'인 순서 역전이다.
        // 시뮬은 행동 후 일괄 처리 구조라 순서를 뒤집는 대신 +1 피해로 그 압박을 근사한다.
        const incoming = card.atk + (firstStrike ? 1 : 0)
        const adversity = this.hp + this.shield - incoming <= Math.max(1, this.maxHp * 0.35)
        if (this.companionDodges(incoming, adversity)) continue
        this.takeDamage(incoming)
        // 에나 반격은 회피와 달리 피해를 받은 뒤 현재 공격력만큼 되친다.
        if (this.companion && this.rng.next() < this.companion.minorClutchChance.counter) {
          card.hp -= this.attack
          if (card.hp <= 0) this.removeCardReference(card)
        }
      }
      else if (card.type === CardType.FLOWER && card.flowerKind === 'oleander') this.shield += card.value
    }
  }

  /** 포자 전염: 카운트다운 0이면 인접(상하좌우) 빈칸이 아닌 일반칸을 포자로 바꾼다. */
  private spreadSpores(): void {
    const sources: { row: number; lane: number; card: EnaSimCard }[] = []
    for (let row = 0; row < ROWS; row++) {
      for (let lane = 0; lane < LANES; lane++) {
        const card = this.board[row][lane]
        if (card?.type === CardType.TRAP && card.trapKind === 'spore') {
          if (card.sporeTimer > 0) card.sporeTimer--
          else sources.push({ row, lane, card })
        }
      }
    }
    for (const { row, lane, card } of sources) {
      const offsets = [[row - 1, lane], [row + 1, lane], [row, lane - 1], [row, lane + 1]]
      let infected = 0
      for (const [r, l] of offsets) {
        if (infected >= card.group) break
        if (r < 0 || r >= ROWS || l < 0 || l >= LANES) continue
        const target = this.board[r][l]
        if (!target || target.group > 1 || (target.type === CardType.TRAP && target.trapKind === 'spore')) continue
        this.board[r][l] = { type: CardType.TRAP, hp: 0, atk: 0, group: 1, trapKind: 'spore', value: 0, growth: 0, sporeTimer: 2, eventTimer: -1, frozen: 0 }
        infected++
      }
      card.sporeTimer = 2
    }
  }

  /** 꽃 성장 후 누적 성장에 비례한 확률로 몬스터꽃(적)으로 시든다. */
  private growAndWiltFlowers(): void {
    for (let row = 0; row < ROWS; row++) {
      for (let lane = 0; lane < LANES; lane++) {
        const card = this.board[row][lane]
        if (!card || card.type !== CardType.FLOWER || card.flowerKind === 'seed' || card.frozen > 0) continue
        card.growth++
        const wiltChance = Math.min(0.6, 0.08 * card.growth)
        if (this.rng.next() < wiltChance) {
          // 몬스터꽃: 꽃 가치에 비례한 적으로 바뀐다.
          this.board[row][lane] = { type: CardType.ENEMY, hp: 3 + card.value, atk: 1 + Math.floor(card.value / 2), group: 1, value: card.value, growth: 0, sporeTimer: 0, eventTimer: -1, frozen: 0 }
        }
      }
    }
  }

  private dropAndRefill(): void {
    for (let row = 0; row < ROWS - 1; row++) this.board[row] = this.board[row + 1]
    this.board[ROWS - 1] = Array.from({ length: LANES }, () => this.spawnCard('waiting'))
    this.regroupFrontRow()
    this.bloomFrontSeeds()
    this.tickFrontEventDoors()
    if (this.finalAscent) this.sweepFrontStarlights()
  }

  /** 씨앗이 전방행에 도달하면 즉시 개화한다(실게임 bloomFrontSeeds). */
  private bloomFrontSeeds(): void {
    for (let lane = 0; lane < LANES; lane++) {
      const card = this.board[0][lane]
      if (card?.type === CardType.FLOWER && card.flowerKind === 'seed') {
        card.flowerKind = this.rng.pick(['redRose', 'marigold', 'oleander', 'lavender'] as const)
        card.value = 1 + this.rng.int(4)
        card.growth = 0
      }
    }
  }

  /** 전방 별빛은 클릭 없이 자동 수집되어 런 턴 +1(최종 등반 규칙). 100 도달 시 멈춘다. */
  private sweepFrontStarlights(): void {
    for (let lane = 0; lane < LANES; lane++) {
      const card = this.board[0][lane]
      if (card?.type === CardType.TREASURE && card.treasureKind === 'starlight') {
        this.board[0][lane] = null
        if (this.turn < RUN_TARGET_TURNS) {
          this.turn++
          this.starlightsThisStep++ // 별빛 획득 순간 보상 shaping용
        }
      }
    }
    // 별빛 제거로 빈칸이 생기면 정리/리필 후 새로 도달한 씨앗도 개화.
    if (this.board[0].some((c) => c === null)) {
      this.compactColumns()
      this.bloomFrontSeeds()
    }
  }

  /** 이벤트 문 2턴 닫힘. 닫히면 위 칸의 씨앗/별빛이 내려오며 개화/수집된다(실게임 버그 수정 반영). */
  private tickFrontEventDoors(): void {
    let closed = false
    for (let lane = 0; lane < LANES; lane++) {
      const card = this.board[0][lane]
      if (card?.type !== CardType.EVENT) continue
      if (card.eventTimer < 0) {
        card.eventTimer = 2
        continue
      }
      card.eventTimer--
      if (card.eventTimer <= 0) {
        this.board[0][lane] = null
        closed = true
      }
    }
    if (closed) {
      this.compactColumns()
      this.regroupFrontRow()
      this.bloomFrontSeeds()
      if (this.finalAscent) this.sweepFrontStarlights()
    }
  }

  /** 빈칸을 메우도록 각 레인을 아래로 당기고, 맨 뒤를 새 카드로 채운다. */
  private compactColumns(): void {
    for (let lane = 0; lane < LANES; lane++) {
      const column: (EnaSimCard | null)[] = []
      for (let row = 0; row < ROWS; row++) {
        const card = this.board[row][lane]
        if (card) column.push(card)
      }
      while (column.length < ROWS) column.push(this.consumeIncomingRefillCard(lane))
      for (let row = 0; row < ROWS; row++) this.board[row][lane] = column[row]
    }
  }

  private advanceBossTurn(): void {
    this.bossAttackCountdown--
    const profile = BOSS_PROFILES[this.bossFloor]
    if (this.bossAttackCountdown <= 0 && this.bossHp > 0) {
      const adversity = this.hp + this.shield - profile.attack <= Math.max(1, this.maxHp * 0.35)
      if (!this.companionDodges(profile.attack, adversity)) this.takeDamage(profile.attack)
      this.applyBossBehavior(profile)
      this.bossAttackCountdown = profile.interval
    }
    // 불씨는 보스전에도 천천히 줄어 시간 압박을 유지한다.
    if (--this.emberDecayCountdown <= 0) {
      this.emberDecayCountdown = this.emberDecayTurns
      this.ember = Math.max(0, this.ember - 1)
    }
  }

  private applyBossBehavior(profile: BossProfile): void {
    switch (profile.behavior) {
      case 'greed':
        // 탐욕 살포: 손패에 동전/탐욕의 동전을 흩뿌린다(일부 자해).
        for (let n = 0; n < 2 + this.rng.int(3); n++) this.drawCard(this.rng.next() < 0.5 ? 'greed-coin' : 'coin')
        break
      case 'knightHand':
        // 기사단장 손패 2장: 추가 피해.
        this.takeDamage(2)
        break
      case 'summon':
        // 조각사 소환 + 은신(방패). 직접 피해 대신 방어 강화로 장기전 유도.
        this.bossHp = Math.min(this.bossMaxHp, this.bossHp + 4)
        break
      case 'witch':
        // 마녀: 손패 1장 소각 + 강화 소환 피해.
        if (this.hand.length > 0) this.consumeHand(this.hand.length - 1)
        this.takeDamage(3)
        break
    }
  }

  /** 보스 격파 — 보상 후 일반 등반 복귀(100F는 클리어로 종료). 페이지 전환은 checkBossProgress가 담당. */
  private defeatBoss(): void {
    this.bossesCleared++
    // 실게임 보스 보상: 현상금 1~3$ + 전리품 유물 + 손패.
    this.coins += 1 + this.rng.int(3)
    this.grantRelic(true)
    this.drawCard()
    if (this.bossFloor === 100) {
      this.done = true
      this.phase = 'done'
      return
    }
    // 30/60/90F 격파 직후 강제 시련(실게임: 보상 → 시련 3택 → 셔터 상승 순서).
    this.applyForcedTrial()
    if (this.bossFloor === 90) {
      // 90F 격파 직후 90~100 별빛 등반 발동.
      this.finalAscent = true
      this.clearIncomingRefillQueue()
    }
    this.bossFloor = 0
    this.bossHp = this.bossMaxHp = 0
    this.bossPage = 0
    this.phase = 'field'
    this.dropAndRefill()
  }

  /** 실게임 강제 시련(index.ts FORCED_TRIAL_CARDS = TRIAL_DEFINITIONS 파생)을 그대로 읽어 적용한다.
   *  실게임은 플레이어가 3택 중 1개를 고르지만, 시뮬은 그 선택을 랜덤 1개로 압축한다(근사). */
  private applyForcedTrial(): void {
    const kind = this.rng.pick(TRIAL_DEFINITIONS).effectKind
    if (kind.type === 'enemy-stat-bonus') {
      this.trialEnemyHpBonus += kind.hpBonus
      this.trialEnemyAtkBonus += kind.atkBonus
      // 실게임 applyTrialEffect와 동일하게 이미 필드에 있는 적에게도 소급 적용한다.
      // 합체 적은 구성 칸 수(group)만큼 누적해 "이후 스폰됐다면 받았을 양"과 맞춘다.
      for (const card of new Set(this.board.flat().filter((c): c is EnaSimCard => !!c))) {
        if (card.type !== CardType.ENEMY) continue
        card.hp += kind.hpBonus * Math.max(1, card.group)
        card.atk += kind.atkBonus * Math.max(1, card.group)
      }
    } else if (kind.type === 'trap-damage-bonus') {
      this.trialTrapDamageBonus += kind.value
    } else {
      this.trialTreasureScale = Math.max(0, this.trialTreasureScale * kind.factor)
    }
    // 스폰/스탯 규칙이 바뀌었으니 예고 큐를 현행화한다(실게임 setTrialModifiers의 preview 클리어와 동일).
    this.clearIncomingRefillQueue()
  }

  private enterBoss(floor: number): void {
    const profile = BOSS_PROFILES[floor]
    this.phase = 'boss'
    this.bossFloor = floor
    this.bossHp = this.bossMaxHp = profile.maxHp
    this.bossAttackCountdown = profile.interval
    this.bossPage = 0
    this.bossDamageSinceGift = 0
    if (floor === 100) this.finalAscent = false
  }

  private bossPageFloor(): number {
    const profile = BOSS_PROFILES[this.bossFloor]
    if (!profile?.pages) return 0
    return this.bossPage < profile.pages.length ? profile.pages[this.bossPage] : 0
  }

  // ── 스폰 ────────────────────────────────────────────────────────────────

  /** lane별 예고선이 본 카드를 그대로 소비해 학습 관측과 실제 리필을 일치시킨다. */
  private consumeIncomingRefillCard(lane: number): EnaSimCard {
    const queued = this.incomingRefillQueue[lane]
    if (queued) {
      this.incomingRefillQueue[lane] = null
      return queued
    }
    return this.spawnCard('waiting')
  }

  /** observe()가 부르는 실제 다음 리필 카드. 없으면 미리 뽑아 예고선 큐에 고정한다. */
  private peekIncomingRefillCard(lane: number): EnaSimCard {
    let queued = this.incomingRefillQueue[lane]
    if (!queued) {
      queued = this.spawnCard('waiting')
      this.incomingRefillQueue[lane] = queued
    }
    return queued
  }

  /** 스폰 규칙이 크게 바뀌면 오래된 예고를 버려 에나 관측을 현재 규칙에 맞춘다. */
  private clearIncomingRefillQueue(): void {
    this.incomingRefillQueue = Array<EnaSimCard | null>(LANES).fill(null)
  }

  /** 불씨 티어 스폰 버킷(실제 EmberSystem)으로 카드를 뽑는다. 최종 등반에선 별빛을 섞는다. */
  private spawnCard(zone: 'front' | 'waiting'): EnaSimCard {
    if (this.finalAscent && zone === 'waiting' && this.rng.next() < 0.3) {
      return { type: CardType.TREASURE, hp: 0, atk: 0, group: 1, treasureKind: 'starlight', value: 0, growth: 0, sporeTimer: 0, eventTimer: -1, frozen: 0 }
    }
    // 최종 등반이 아니고 일반 턴이면 가끔 이벤트 문이 대기칸에 등장한다(실게임 PRD 롤 감각).
    if (!this.finalAscent && zone === 'waiting' && this.turn > 3 && this.rng.next() < 0.05) {
      return { type: CardType.EVENT, hp: 0, atk: 0, group: 1, value: 0, growth: 0, sporeTimer: 0, eventTimer: -1, frozen: 0 }
    }
    const tier = EmberSystem.getTier(this.ember)
    const b = EmberSystem.getSpawnBuckets(tier)
    const flowerWeight = zone === 'front' ? 0 : b.flower * 0.5
    // 시련 '가난'은 보물 가중치를 배율로 깎되, 실게임 CardSpawner처럼 최소 1을 보장한다.
    const treasureWeight = Math.max(1, b.treasure * this.trialTreasureScale)
    const total = b.enemy + b.webTrap + b.bombTrap + b.sporeTrap + treasureWeight + flowerWeight
    let roll = this.rng.next() * total
    if ((roll -= b.enemy) < 0) return this.spawnEnemy(tier)
    if ((roll -= b.webTrap) < 0) return this.spawnTrap('web')
    if ((roll -= b.bombTrap) < 0) return this.spawnTrap('bomb')
    if ((roll -= b.sporeTrap) < 0) return this.spawnTrap('spore')
    if ((roll -= treasureWeight) < 0) return { type: CardType.TREASURE, hp: 0, atk: 0, group: 1, treasureKind: 'normal', value: 1 + this.rng.int(3), growth: 0, sporeTimer: 0, eventTimer: -1, frozen: 0 }
    // 꽃은 씨앗으로 등장해 전방 도달 시 개화한다.
    return { type: CardType.FLOWER, hp: 0, atk: 0, group: 1, flowerKind: 'seed', value: 1 + this.rng.int(4), growth: 0, sporeTimer: 0, eventTimer: -1, frozen: 0 }
  }

  /** 진행 턴 밴드에 따른 실제 적 풀에서 HP/ATK를 가져오고, 티어·시련(광란) 보너스를 더한다. */
  private spawnEnemy(tier: EmberTier): EnaSimCard {
    const pool = activeEnemyBand(this.turn)
    const def = this.rng.pick(pool)
    const bonus = EmberSystem.getEnemyStatBonus(tier)
    return {
      type: CardType.ENEMY,
      hp: (def.healthOrDamage ?? 1) + bonus.hp + this.trialEnemyHpBonus,
      atk: (def.attack ?? 1) + bonus.atk + this.trialEnemyAtkBonus,
      group: 1,
      value: (def.enemyPower ?? 1),
      growth: 0,
      sporeTimer: 0,
      eventTimer: -1,
      frozen: 0,
    }
  }

  private spawnTrap(kind: TrapKind): EnaSimCard {
    return { type: CardType.TRAP, hp: 0, atk: 0, group: 1, trapKind: kind, value: 0, growth: 0, sporeTimer: kind === 'spore' ? 2 : 0, eventTimer: -1, frozen: 0 }
  }

  /** 전방행에서 같은 종류(적/거미줄/포자)가 인접하면 한 무리로 합쳐 폭(group)을 키운다. */
  private regroupFrontRow(): void {
    for (let lane = 0; lane < LANES - 1; lane++) {
      const left = this.board[0][lane]
      const right = this.board[0][lane + 1]
      if (!left || !right || left === right) continue
      const sameEnemy = left.type === CardType.ENEMY && right.type === CardType.ENEMY
      const sameTrap = left.type === CardType.TRAP && right.type === CardType.TRAP && left.trapKind === right.trapKind && left.trapKind !== 'bomb'
      if (sameEnemy) {
        left.group += right.group
        left.hp += right.hp + (left.group >= 3 ? 3 : 2)
        left.atk += right.atk + (left.group >= 3 ? 3 : 2)
        this.board[0][lane + 1] = left
      } else if (sameTrap) {
        // 거미줄/포자 병합: 폭이 커지면 피해가 1→5→즉사(거미줄)/1→3→5(포자)로 급증한다.
        left.group += right.group
        this.board[0][lane + 1] = left
      }
    }
  }

  // ── 합법성/관측 ───────────────────────────────────────────────────────────

  private isLegal(action: EnaSimAction): boolean {
    if (this.phase === 'shop') {
      if (action.kind === 'shopExit') return true
      if (this.shopActionsLeft <= 0) return false
      // 팩/유물 합법성은 재화(불빛)와 모드(상점 3팩 / 제단 3팩)로 결정 — 실게임 노출 규칙.
      switch (action.kind) {
        case 'shopFree': return this.shopFreeUsesLeft > 0
        case 'shopRelic': return this.shopRelicBuysLeft > 0 && (this.shopMode === 'altar' || this.light >= this.relicCost())
        case 'shopBasicPack': return this.shopMode === 'shop' && this.light >= this.packCost('basic-pack')
        case 'shopRecipePack': return this.shopMode === 'shop' && this.light >= this.packCost('recipe-pack')
        case 'shopUnlockPack':
          return this.shopMode === 'shop' && this.lockedPool.size + this.bannedPool.size > 0 && this.light >= this.packCost('unlock-pack')
        case 'shopChancePack': return this.shopMode === 'altar' && this.light >= this.packCost('chance-pack')
        case 'shopDeletePack':
          return this.shopMode === 'altar' && this.unlockedPool.size > MIN_POOL_AFTER_DELETE && this.light >= this.packCost('delete-pack')
        case 'shopResourcePack': return this.shopMode === 'altar' && this.light >= this.packCost('resource-pack')
        default: return false
      }
    }
    if (this.phase === 'event') return action.kind === 'eventSafe' || action.kind === 'eventGreedy'
    if (this.phase === 'boss') {
      if (action.kind === 'clickLane') return action.arg === 0 // 보스 직접 공격(대표 1행동)
      if (action.kind === 'useHand') return action.arg < this.hand.length
      return false
    }
    // field
    if (action.kind === 'wait') return true
    if (action.kind === 'useHand') return action.arg < this.hand.length
    if (action.kind === 'clickLane') return this.board[0][action.arg] !== null
    return false
  }

  private terminalReward(): number {
    if (!this.done) return 0
    if (this.hp <= 0) return -15 // 사망은 큰 음의 종단 보상
    if (this.bossesCleared >= BOSS_FLOORS.length) return 40 // 최종 보스까지 격파 = 완전한 모험
    return 0 // 도달 깊이는 shaping의 보스 +8만으로 계상(이중 계상 제거)
  }

  private shapeReward(beforeHp: number, beforeBossHp: number, beforeBosses: number): number {
    let reward = 0.08
    reward -= Math.max(0, beforeHp - this.hp) * 0.8
    reward += this.hp <= 5 ? -1 : 0
    reward += this.ember <= 3 && this.phase === 'field' ? -0.4 : 0
    reward += this.phase === 'boss' && this.bossHp < beforeBossHp ? (beforeBossHp - this.bossHp) * 0.06 : 0
    reward += this.bossesCleared > beforeBosses ? 8 : 0 // 보스 격파마다 굵은 보상
    reward += this.starlightsThisStep * 0.6 // 별빛은 구간 상주 보상 대신 획득 순간에만 보상
    return reward
  }

  private finishIfNeeded(): void {
    if (this.hp <= 0) {
      this.done = true
      this.phase = 'done'
    }
  }

  private estimateFrontThreat(): number {
    return this.uniqueFrontCards().reduce((sum, card) => sum + (card.type === CardType.ENEMY ? card.atk : card.type === CardType.TRAP ? trapDamage(card, this.trialTrapDamageBonus) : 0), 0)
  }

  private webThreatCount(): number {
    // 런타임 예지(CompanionForesight)와 같은 병합 판정을 공유: 다음 전방에서 실제로
    // 인접 병합될 1칸 거미줄 수만 위협으로 센다(흩어진 발견은 세지 않는다).
    return this.imminentWebMerge().mergingOneWebs
  }

  /** 시뮬 보드 → 레인별 '다음 전방' 거미줄 셀 어댑터. 전방이 차 있으면 그 카드, 비면 낙하 예정(1행) 카드. */
  private imminentWebMerge(): ImminentWebMergeEstimate {
    return estimateImminentWebMergeFromCells(
      this.board[0].map((front, lane) => {
        const candidate = front ?? this.board[1][lane]
        return candidate && candidate.type === CardType.TRAP && candidate.trapKind === 'web'
          ? { key: candidate, groupCount: candidate.group }
          : null
      })
    )
  }

  private imminentWebThreatCount(): number {
    let count = 0
    for (let row = 0; row <= 1; row++) for (const c of new Set(this.board[row].filter(Boolean) as EnaSimCard[])) if (c.type === CardType.TRAP && c.trapKind === 'web' && c.group === 1) count++
    return count
  }

  private readySporeThreatCount(): number {
    let count = 0
    for (const row of this.board) for (const c of new Set(row.filter(Boolean) as EnaSimCard[])) if (c.type === CardType.TRAP && c.trapKind === 'spore' && c.sporeTimer <= 1) count++
    return count
  }

  private strongEnemyThreatCount(): number {
    return this.board.slice(0, 2).flat().filter((c) => c?.type === CardType.ENEMY && (c.group >= 2 || c.hp > this.attack + 1)).length
  }

  private tripleOpportunityCount(): number {
    const counts = new Map<HandCardId, number>()
    for (const s of this.hand) if (!s.merged) counts.set(s.id, (counts.get(s.id) ?? 0) + 1)
    return [...counts.values()].filter((n) => n >= 2).length
  }

  /** 필드 전체의 1칸 거미줄 수 — 병합각 없이도 '많이 널렸으면' 광역 청소 근거(런타임 webCount와 동형). */
  private fieldOneWebCount(): number {
    let count = 0
    for (const row of this.board) for (const c of new Set(row.filter(Boolean) as EnaSimCard[])) if (c.type === CardType.TRAP && c.trapKind === 'web' && c.group === 1) count++
    return count
  }

  /** 비합체 보유 장수 맵 — advisor 트리플 완성각(정확히 2장) 판단과 공유한다. */
  private heldCardCounts(): Partial<Record<HandCardId, number>> {
    const counts: Partial<Record<HandCardId, number>> = {}
    for (const s of this.hand) if (!s.merged) counts[s.id] = (counts[s.id] ?? 0) + 1
    return counts
  }

  private predictiveAidCard(): HandCardId | null {
    // 지원 카드는 런타임 예지와 같은 범용 스코어러(HandCardAdvisor)를 공유한다 —
    // 하드코딩 목록 대신 해금 풀 안에서 targeting/damageProfile/synergyTags로 고른다.
    const frontWideWebSpan = Math.max(0, ...this.uniqueFrontCards().filter((c) => c.type === CardType.TRAP && c.trapKind === 'web').map((c) => c.group))
    const strongEnemy = this.board.slice(0, 2).flat().find((c) => c?.type === CardType.ENEMY && (c.group >= 2 || c.hp > this.attack + 1))
    const strongEnemyAtFront = !!strongEnemy && this.board[0].includes(strongEnemy)
    const support = bestSupportCard(
      {
        playerAttack: this.attack,
        playerHealth: this.hp,
        playerMaxHealth: this.maxHp,
        playerShield: this.shield,
        emberLow: this.ember <= 3,
        frontWideWebSpan,
        webMerge: this.imminentWebMerge(),
        fieldOneWebCount: this.fieldOneWebCount(),
        // 시련 '역경' 누적치 — 런타임 assessThreats의 character.trapDamageBonus 전달과 동일 축.
        // handSingleBonus는 전달하지 않는다: 실게임 강화팩이 제거되어(enhancements.singleBonus
        // 작성자 없음) 런타임 입력도 항상 빈 값이라, 생략이 실효값 0으로 동일하다.
        trapDamageBonus: this.trialTrapDamageBonus,
        sporeReady: this.readySporeThreatCount() > 0,
        // 실효값: 시뮬 카드의 실제 공격력과 굳음 잔여 턴으로 반격 임박도를 채운다.
        // attackInTurns는 런타임 예지와 동일 규칙(전방 비굳음=0 즉시, 굳음=잔여 턴, 대기=1).
        // 선공 티어(꺼져감/꺼짐)는 적 페이즈가 행동보다 먼저 오지만 전방 임박도는 이미
        // 최대(0)라 별도 인코딩이 없다 — 런타임 assessThreats도 같은 값을 쓴다.
        strongEnemy: strongEnemy
          ? {
              health: strongEnemy.hp,
              atFront: strongEnemyAtFront,
              attack: strongEnemy.atk,
              attackInTurns: strongEnemyAtFront ? strongEnemy.frozen : 1,
            }
          : undefined,
        // 처치각이 없는 비전방 강적에도 미리 피해를 쌓는 경험을 학습한다(기존 ember 폴백 계승).
        allowChipDamage: true,
        heldCardIds: this.hand.map((slot) => slot.id),
        heldCardCounts: this.heldCardCounts(),
        // 시간 축: 레일 예고 큐(관측 incomingRefill과 동일 데이터)의 같은 위협 도착을 보정에 쓴다.
        incomingRefill: {
          webs: this.incomingRefillQueue.filter((c) => c?.type === CardType.TRAP && c.trapKind === 'web').length,
          spores: this.incomingRefillQueue.filter((c) => c?.type === CardType.TRAP && c.trapKind === 'spore').length,
          enemies: this.incomingRefillQueue.filter((c) => c?.type === CardType.ENEMY).length,
        },
        supportRoleWeights: this.companion?.supportRoleWeights,
        // unlockedRecipeIds는 생략: 시뮬에는 레시피 해금 모델이 없다(조합팩은 트리플 위력 근사).
        // 기본 해금 레시피의 완성각 가산은 advisor가 손패 장수만으로 동일하게 계산한다.
      },
      [...this.unlockedPool]
    )
    if (support) return support.cardId
    const pair = this.hand.find((s) => !s.merged && this.hand.filter((x) => !x.merged && x.id === s.id).length === 2)
    if (pair) return pair.id
    return null
  }

  private toughestEnemyLane(): number {
    let best = -1
    let bestHp = -1
    for (let lane = 0; lane < LANES; lane++) {
      const card = this.board[0][lane]
      if (card?.type === CardType.ENEMY && card.hp > bestHp) {
        best = lane
        bestHp = card.hp
      }
    }
    return best
  }

  private worstTrapLane(maxSpan: number, webOnly: boolean): number {
    let best = -1
    let bestDmg = -1
    for (let lane = 0; lane < LANES; lane++) {
      const card = this.board[0][lane]
      if (card?.type !== CardType.TRAP) continue
      if (card.group > maxSpan) continue
      if (webOnly && card.trapKind !== 'web') continue
      const dmg = trapDamage(card, this.trialTrapDamageBonus)
      if (dmg > bestDmg) {
        best = lane
        bestDmg = dmg
      }
    }
    return best
  }

  private removeCardReference(target: EnaSimCard): void {
    for (let row = 0; row < ROWS; row++) {
      for (let lane = 0; lane < LANES; lane++) {
        if (this.board[row][lane] === target) this.board[row][lane] = null
      }
    }
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
    if (!card) return [0, 0, 0, 0, 0, 0, 0, row / (ROWS - 1), 0, 0, 0, 0, 0, 0]
    return [
      card.type === CardType.ENEMY ? 1 : 0,
      card.type === CardType.TRAP ? 1 : 0,
      card.type === CardType.TREASURE ? 1 : 0,
      card.type === CardType.FLOWER ? 1 : 0,
      card.type === CardType.EVENT ? 1 : 0,
      card.hp / 30,
      // 함정 칸의 위협 축은 시련 보너스가 붙은 실효 피해로 관측한다(적은 atk 그대로).
      (card.atk || trapDamage(card, this.trialTrapDamageBonus)) / 30,
      card.group / 3,
      row / (ROWS - 1),
      card.value / 5,
      Math.max(card.sporeTimer, card.eventTimer < 0 ? 0 : card.eventTimer, card.growth) / 3,
      card.flowerKind === 'seed' ? 1 : 0,
      card.treasureKind === 'starlight' ? 1 : 0,
      card.frozen > 0 ? 1 : 0,
    ]
  }

  /** Encode the top-rail preview line that Ena can use for broader next-turn planning. */
  private encodeIncomingCard(card: EnaSimCard | null): number[] {
    if (!card) return [0, 0, 0, 0, 0, 0]
    const isSpecial = card.type === CardType.EVENT || card.treasureKind === 'starlight'
    const isThreat = card.type === CardType.ENEMY || card.type === CardType.TRAP
    return [
      card.type === CardType.ENEMY ? 1 : 0,
      card.type === CardType.TRAP ? 1 : 0,
      card.type === CardType.TREASURE && card.treasureKind !== 'starlight' ? 1 : 0,
      card.type === CardType.FLOWER ? 1 : 0,
      isSpecial ? 1 : 0,
      isThreat ? 1 : 0,
    ]
  }

  private encodeHand(slot: EnaHandSlot | undefined): number[] {
    if (!slot) return [0, 0, 0, 0, 0, 0, 0, 0, 0]
    const def = HAND_CARD_DEFINITIONS[slot.id]
    const tactic = this.knowledge.handCards[slot.id]
    return [
      1,
      def.category === 'attack' ? 1 : 0,
      def.category === 'control' ? 1 : 0,
      def.category === 'recovery' ? 1 : 0,
      def.category === 'tool' ? 1 : 0,
      tactic.fieldValue / 10,
      tactic.bossValue / 10,
      tactic.tripleValue / 5,
      slot.merged ? 1 : 0,
    ]
  }

  private turnsToShop(): number {
    if (this.turn >= RUN_TARGET_TURNS) return 0
    return SHOP_INTERVAL - (this.turn % SHOP_INTERVAL)
  }

  private turnsToBoss(): number {
    for (const floor of BOSS_FLOORS) if (floor > this.turn) return floor - this.turn
    return 0
  }

  private bossPreparationValue(snapshot: EnaGameSnapshot): number {
    const fullComboSoon = snapshot.combo >= snapshot.comboMax - 3 ? 1 : 0
    const attackCards = snapshot.hand.filter((s) => HAND_CARD_DEFINITIONS[s.id].category === 'attack').length
    const learnedBossValue = this.averageHandBossValue() * 0.2
    return snapshot.attack + attackCards * 1.5 + fullComboSoon * 2 + learnedBossValue
  }

  private averageHandBossValue(): number {
    if (this.hand.length === 0) return 0
    const values = this.hand.map((s) => this.knowledge.handCards[s.id].bossValue)
    return values.reduce((sum, v) => sum + v, 0) / values.length
  }

  private averageHandSynergyValue(): number {
    if (this.hand.length === 0) return 0
    const values = this.hand.map((s) => this.knowledge.handCards[s.id].synergyValue)
    return values.reduce((sum, v) => sum + v, 0) / values.length
  }

  private buildReason(snapshot: EnaGameSnapshot, action: EnaSimAction, projectedDamage: number, frontThreat: number, bossPlanValue: number): string {
    const tier = EmberSystem.tierLabel(snapshot.emberTier)
    if (snapshot.phase === 'boss') {
      return `${snapshot.bossFloor}층 보스 ${BOSS_PROFILES[snapshot.bossFloor]?.name}: 공격력 ${snapshot.attack}, 불씨 피해 ${projectedDamage}, 콤보 ${snapshot.combo}/${snapshot.comboMax}, 준비값 ${bossPlanValue.toFixed(1)} → ${action.kind}`
    }
    if (snapshot.phase === 'shop') return `${snapshot.shopMode === 'altar' ? '제단' : '상점'}: 보스까지 ${snapshot.turnsToBoss}턴, 불씨 ${snapshot.ember}, 불빛 ${snapshot.light}, 화폐 ${snapshot.coins} → ${action.kind}`
    if (snapshot.phase === 'event') return `이벤트: 위험 ${snapshot.eventRisk}, HP ${snapshot.hp}+방패 ${snapshot.shield}, 불씨 ${tier} → ${action.kind}`
    const target = action.kind === 'clickLane' ? snapshot.board[0][action.arg] : null
    if (target?.type === CardType.ENEMY) return `${snapshot.turn}층(불씨 ${tier}): 공격력 ${snapshot.attack}, 불씨 피해 ${projectedDamage}, 전방 ${target.group}칸 적 HP ${target.hp}/ATK ${target.atk}, 위협 ${frontThreat} → ${action.kind}`
    if (snapshot.webThreat >= 2) return `불씨 ${tier}: 전방 1칸 거미줄 ${snapshot.webThreat}개가 합쳐지기 전 청소 권장 → ${action.kind}`
    return `${snapshot.turn}층: HP ${snapshot.hp}, 불씨 ${snapshot.ember}(${tier}), 보스까지 ${snapshot.turnsToBoss}턴 → ${action.kind}`
  }

  private snapshot(): EnaGameSnapshot {
    return {
      phase: this.phase,
      hp: this.hp,
      maxHp: this.maxHp,
      shield: this.shield,
      ember: this.ember,
      emberMax: this.emberMax,
      emberTier: EmberSystem.getTier(this.ember),
      light: this.light,
      coins: this.coins,
      attack: this.attack,
      combo: this.combo,
      comboMax: this.comboMax,
      lockedCount: this.lockedPool.size,
      unlockedCount: this.unlockedPool.size,
      chanceBoostTotal: this.totalChanceBoost(),
      recipeTripleBonus: this.recipeTripleBonus,
      hand: this.hand.map((s) => ({ ...s })),
      turn: this.turn,
      turnsToShop: this.turnsToShop(),
      turnsToBoss: this.turnsToBoss(),
      shopMode: this.shopMode,
      finalAscent: this.finalAscent,
      bossFloor: this.bossFloor,
      bossHp: this.bossHp,
      bossMaxHp: this.bossMaxHp,
      bossAttackCountdown: this.bossAttackCountdown,
      bossPage: this.bossPage,
      eventRisk: this.eventRisk,
      trapDamageBonus: this.trialTrapDamageBonus,
      webThreat: this.webThreatCount(),
      incomingRefill: this.incomingRefillQueue.map((card, lane) => {
        const queued = card ?? this.peekIncomingRefillCard(lane)
        return queued ? { ...queued } : null
      }),
      board: this.board.map((row) => row.map((card) => (card ? { ...card } : null))),
    }
  }
}

// ── 휴리스틱 교사 정책(국면별) ───────────────────────────────────────────────

function fieldPolicy(snapshot: EnaGameSnapshot, cfg: EnaHeuristicPolicyConfig): number {
  const front = snapshot.board[0]
  const incomingThreatCount = snapshot.incomingRefill.filter((c) => c?.type === CardType.ENEMY || c?.type === CardType.TRAP).length
  const incomingSpecialLane = snapshot.incomingRefill.findIndex((c) => c?.type === CardType.EVENT || c?.treasureKind === 'starlight')
  const findHand = (pred: (id: HandCardId) => boolean) => snapshot.hand.findIndex((s) => pred(s.id))

  // 0) 불씨 관리가 생존의 핵심: 불씨가 낮으면 적·함정 스폰이 폭증한다. 성냥으로 미리 밝힌다.
  if (snapshot.ember <= cfg.emberRefillThreshold) {
    const match = findHand((id) => id === 'match')
    if (match >= 0) return actionIndexOf('useHand', match)
  }

  // 1) 치명적 함정은 키틴/청소로 먼저 치운다(시련 보너스 포함 실효 피해 기준).
  const lethalTrapLane = front.findIndex((c) => c?.type === CardType.TRAP && trapDamage(c, snapshot.trapDamageBonus) > snapshot.hp + snapshot.shield)
  if (lethalTrapLane >= 0) {
    const cleaner = findHand((id) => id === 'chitin' || id === 'sweep' || id === 'holy-water')
    if (cleaner >= 0) return actionIndexOf('useHand', cleaner)
  }
  // 2) 위급하거나 보스 직전이면 회복/방패 손패로 미리 체력을 채운다.
  if (snapshot.hp <= cfg.lowHpRecoveryThreshold || (snapshot.turnsToBoss <= 3 && snapshot.hp <= snapshot.maxHp - 4)) {
    const heal = findHand((id) => HAND_CARD_DEFINITIONS[id].category === 'recovery')
    if (heal >= 0) return actionIndexOf('useHand', heal)
  }
  // 3) 거미줄 2개+면 청소로 합체 차단.
  if (snapshot.webThreat >= cfg.webCleanupThreshold) {
    const sweep = findHand((id) => id === 'sweep' || id === 'chitin')
    if (sweep >= 0) return actionIndexOf('useHand', sweep)
  }
  // 3.5) 예고선에 위협이 많이 보이면 다음 하강 전에 광역/정리 손패를 아껴두지 않고 선제 사용한다.
  if (incomingThreatCount >= 2 && snapshot.hp <= cfg.safeRewardHpThreshold + 2) {
    const stabilizer = findHand((id) => id === 'sweep' || id === 'wax' || id === 'chitin')
    if (stabilizer >= 0) return actionIndexOf('useHand', stabilizer)
  }
  // 4) 강한 적(2칸+ 또는 공격력 초과)은 불씨 공격 손패로 처리.
  const dangerLane = front.findIndex((c) => c?.type === CardType.ENEMY && (c.group >= 2 || c.hp > snapshot.attack))
  if (dangerLane >= 0) {
    const atk = findHand((id) => HAND_CARD_DEFINITIONS[id].category === 'attack')
    if (atk >= 0) return actionIndexOf('useHand', atk)
    // 공격 손패가 없으면 밀랍으로 굳혀 반격을 막는다(2턴 무력화).
    const wax = findHand((id) => id === 'wax')
    if (wax >= 0) return actionIndexOf('useHand', wax)
  }
  // 5) 보상(보물/개화한 꽃)은 클릭 수확.
  const rewardLane = front.findIndex((c) => (c?.type === CardType.TREASURE && c.treasureKind !== 'starlight') || (c?.type === CardType.FLOWER && c.flowerKind !== 'seed'))
  if (rewardLane >= 0 && snapshot.hp > cfg.safeRewardHpThreshold) return actionIndexOf('clickLane', rewardLane)
  // 6) 잡을 수 있는 적은 맨손 공격(불씨 손패 아껴 보스 대비).
  const killLane = front.findIndex((c) => c?.type === CardType.ENEMY && c.hp <= snapshot.attack)
  if (killLane >= 0) return actionIndexOf('clickLane', killLane)
  // 7) 이벤트 문은 여유 있을 때 진입.
  const eventLane = front.findIndex((c) => c?.type === CardType.EVENT)
  if (eventLane >= 0 && snapshot.hp > cfg.safeEventHpThreshold) return actionIndexOf('clickLane', eventLane)
  // 7.5) 흰색 예고(이벤트/별빛)가 보이면 해당 레인의 전방 안전 칸을 우선 비워 다음 기회를 당긴다.
  if (incomingSpecialLane >= 0) {
    const frontCard = front[incomingSpecialLane]
    if (frontCard && frontCard.type !== CardType.ENEMY && frontCard.type !== CardType.TRAP) {
      return actionIndexOf('clickLane', incomingSpecialLane)
    }
  }
  // 8) 남은 적이라도 친다. 아니면 클릭 가능한 칸을 친다.
  const enemyLane = front.findIndex((c) => c?.type === CardType.ENEMY)
  if (enemyLane >= 0) return actionIndexOf('clickLane', enemyLane)
  const anyLane = front.findIndex((c) => c !== null && c.treasureKind !== 'starlight')
  if (anyLane >= 0) return actionIndexOf('clickLane', anyLane)
  return actionIndexOf('wait', -1)
}

function shopPolicy(snapshot: EnaGameSnapshot, legal: EnaSimAction[], cfg: EnaHeuristicPolicyConfig): number {
  const canBuy = (kind: EnaSimActionKind) => legal.some((a) => a.kind === kind)
  // 0) 무료카드는 비용이 없으니 항상 먼저 받는다(제단 수당 포함).
  if (canBuy('shopFree')) return actionIndexOf('shopFree', -1)
  // 1) 유물은 영구 성장 — 제단 무료 1픽/상점 불빛 구매 모두 최우선.
  if (canBuy('shopRelic')) return actionIndexOf('shopRelic', -1)
  if (snapshot.shopMode === 'altar') {
    // 제단: 자원팩(영구 스탯) → 확률팩(핵심 카드 부스트) → 삭제팩(풀 정리) 순.
    if (canBuy('shopResourcePack')) return actionIndexOf('shopResourcePack', -1)
    if (canBuy('shopChancePack') && snapshot.chanceBoostTotal < cfg.chanceBoostCap) return actionIndexOf('shopChancePack', -1)
    if (canBuy('shopDeletePack') && snapshot.unlockedCount > cfg.deletePackPoolFloor) return actionIndexOf('shopDeletePack', -1)
    return actionIndexOf('shopExit', -1)
  }
  // 상점: 위급하면 즉시 자원팩, 잠긴 카드가 많으면 해금팩, 화력이 모자라면 조합팩(트리플 강화).
  if ((snapshot.hp <= cfg.shopCriticalHpThreshold || snapshot.ember <= cfg.shopCriticalEmberThreshold) && canBuy('shopBasicPack')) return actionIndexOf('shopBasicPack', -1)
  if (snapshot.lockedCount >= cfg.unlockPackLockedThreshold && canBuy('shopUnlockPack')) return actionIndexOf('shopUnlockPack', -1)
  if (snapshot.attack < cfg.attackGrowthTarget && canBuy('shopRecipePack')) return actionIndexOf('shopRecipePack', -1)
  if (canBuy('shopUnlockPack')) return actionIndexOf('shopUnlockPack', -1)
  if (canBuy('shopBasicPack')) return actionIndexOf('shopBasicPack', -1)
  return actionIndexOf('shopExit', -1)
}

function eventPolicy(snapshot: EnaGameSnapshot, cfg: EnaHeuristicPolicyConfig): number {
  const canSurviveGreed = snapshot.hp + snapshot.shield - snapshot.eventRisk > cfg.eventGreedySafetyMargin
  return canSurviveGreed && snapshot.turnsToBoss <= cfg.eventGreedyBossWindow ? actionIndexOf('eventGreedy', -1) : actionIndexOf('eventSafe', -1)
}

function bossPolicy(snapshot: EnaGameSnapshot, cfg: EnaHeuristicPolicyConfig): number {
  // 위급 + 회복 손패면 회복.
  if (snapshot.bossAttackCountdown <= cfg.bossEmergencyCountdown && snapshot.hp + snapshot.shield <= cfg.bossEmergencyEffectiveHp) {
    const heal = snapshot.hand.findIndex((s) => HAND_CARD_DEFINITIONS[s.id].category === 'recovery')
    if (heal >= 0) return actionIndexOf('useHand', heal)
  }
  // 불씨 공격 손패로 큰 피해.
  const atk = snapshot.hand.findIndex((s) => HAND_CARD_DEFINITIONS[s.id].category === 'attack')
  if (atk >= 0) return actionIndexOf('useHand', atk)
  return actionIndexOf('clickLane', 0)
}

// ── 순수 유틸 ────────────────────────────────────────────────────────────────

function actionIndexOf(kind: EnaSimActionKind, arg: number): number {
  return ENA_ACTION_SPACE.findIndex((action) => action.kind === kind && action.arg === arg)
}

function clampInt(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(value)))
}

function emberDamage(attack: number, merged: boolean): number {
  // 실제 손패 공식: 불씨 단일 = 공격력×1+1, 트리플 = 공격력×3+5.
  return merged ? attack * 3 + 5 : attack * 1 + 1
}

/** 함정 실효 피해. bonus는 시련 '역경' 등 전역 함정 피해 보너스(실게임 character.trapDamageBonus). */
function trapDamage(card: EnaSimCard, bonus: number = 0): number {
  if (card.type !== CardType.TRAP) return 0
  if (card.trapKind === 'bomb') return 5 + bonus
  if (card.trapKind === 'spore') return (card.group >= 3 ? 5 : card.group === 2 ? 3 : 1) + bonus
  // web: 1칸=1, 2칸=5, 3칸=즉사(학습용 큰 수 — 보너스와 무관하게 이미 최상위 위협).
  return card.group >= 3 ? 999 : (card.group === 2 ? 5 : 1) + bonus
}

function tierIndex(tier: EmberTier): number {
  return tier === 'bright' ? 0 : tier === 'dim' ? 1 : tier === 'flickering' ? 2 : 3
}

function lightMultiplier(turn: number): number {
  // index.ts/EnaKnowledgeAdapter와 같은 선형 보정.
  return 1 + turn * 0.015
}

/** 진행 턴 밴드별 실제 적 풀(CardSpawner.getActiveEnemyDefinitions와 동일 구간). */
function activeEnemyBand(turn: number): typeof ENEMY_DEFINITIONS {
  if (turn < 11) return ENEMY_DEFINITIONS.slice(0, 2)
  if (turn < 21) return ENEMY_DEFINITIONS.slice(0, 4)
  if (turn < 30) return ENEMY_DEFINITIONS.slice(0, 6)
  if (turn < 40) return [...ENEMY_DEFINITIONS.slice(6, 8), ...ENEMY_DEFINITIONS.slice(2, 6)]
  if (turn < 50) return [...ENEMY_DEFINITIONS.slice(6, 10), ...ENEMY_DEFINITIONS.slice(4, 6)]
  if (turn < 60) return ENEMY_DEFINITIONS.slice(6, 12)
  if (turn < 70) return [...ENEMY_DEFINITIONS.slice(12, 14), ...ENEMY_DEFINITIONS.slice(8, 12)]
  if (turn < 80) return [...ENEMY_DEFINITIONS.slice(12, 16), ...ENEMY_DEFINITIONS.slice(10, 12)]
  return ENEMY_DEFINITIONS.slice(12, 18)
}
