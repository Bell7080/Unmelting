/**
 * CompanionDirector — 에나(동료) 반응 지휘 매니저.
 * 바크 큐/중요도, 프로필 터치 반응, 예측 지원, 클러치(에나의 의지), 런 드라마 신호,
 * 런 종료 성장 적응까지 에나의 런타임 행동을 한곳에서 관리한다.
 * 설계: Ena_Companion_AI_Design.md. 런 상태 소유는 index.ts(컴포지션 루트)에 남긴다.
 */

import { GameState } from '@core/GameState'
import { CardSpawner } from '@systems/CardSpawner'
import { CompanionSystem, type SituationId, type ClutchPlan } from '@systems/CompanionSystem'
import { assessThreats, type ForesightOptions } from '@systems/CompanionForesight'
import { saveDisposition, computeEnaGrowth, type EnaRunDramaSignals } from '@systems/EnaDisposition'
import { DropSystem } from '@systems/DropSystem'
import { HandSystem, type ChainState } from '@systems/HandSystem'
import { getHandCardDef } from '@data/HandCards'
import { GameBoardRenderer } from '@ui/GameBoardRenderer'
import { SpeechBubble } from '@ui/SpeechBubble'
import { BarkSequencer } from '@ui/BarkSequencer'
import { RunCardPool } from '@core/RunCardPool'
import { enaRuntimeObserver } from '@/rl/EnaRuntimeObserver'
import {
  EnaAutonomousLearner,
  deriveRunExperienceKeys,
  countNovelCardUses,
} from '@/rl/EnaAutonomousLearner'
import type { PlayerResourceSnapshot, ResourceTrailSource, TrailResourceKind } from '@/app/FeedbackTypes'

// 연타 후 손을 떼면 '…이제 끝났어?'를 띄우기 위한 방치 시간.
const COMPANION_IDLE_MS = 2600
// 버블이 fully-visible 된 이후 이 시간이 지나야 스킵(닫기)이 허용된다.
// SpeechBubble.visibleSinceMs 로 측정하므로 별도 타이머는 불필요.
const SKIP_MIN_VISIBLE_MS = 1000
// 이 시간 넘게 떠 있었으면 "읽었다"로 본다(이후 스킵은 학습 신호로 치지 않음).
const COMPANION_READ_MS = 1500

/** 바크 중요도: 손패 한줄평<일반 반응<상황<위급/항의. 읽는 중엔 더 높은 것만 끼어든다. */
export const BARK_IMPORTANCE = { loot: 0, touch: 1, situation: 2, urgent: 3, clutch: 4 } as const

/** 클러치 종류별 전용 체인 제목(플레이어 카드 위 배너). */
const CLUTCH_TITLES: Record<string, string> = {
  crit: '모험의 긍지',
  dodge: '날렵한 몸놀림',
  counter: '맞서는 용기',
  trap: '굳건한 의지',
  treasure: '행운의 손길',
  'ember-save': '되살린 불씨',
  cleanse: '맑게 씻는 손',
  heal: '포기를 모르는 마음',
  shield: '수호의 결의',
  ember: '꺼지지 않는 불씨',
  hand: '건네는 손패',
  awaken: '에나의 각성',
  predict: '앞을 내다보는 눈',
}

/** 디렉터가 런 상태·연출을 조작할 때 쓰는 주입 계약. */
export interface CompanionDirectorDeps {
  gameState: GameState
  companion: CompanionSystem
  speechBubble: SpeechBubble
  boardRenderer: GameBoardRenderer
  cardSpawner: CardSpawner
  enaAutonomousLearner: EnaAutonomousLearner
  getRunCardPool(): RunCardPool
  getChain(): ChainState
  isGameActive(): boolean
  isInputLocked(): boolean
  isShopOpen(): boolean
  recordNotice(message: string, kind: 'info'): void
  render(): void
  snapshotPlayerResources(): PlayerResourceSnapshot
  playResourceTrail(source: ResourceTrailSource, resource: TrailResourceKind, count: number): Promise<void>
  playPlayerGainTrails(source: ResourceTrailSource, before: PlayerResourceSnapshot): Promise<void>
}

export class CompanionDirector {
  /** 현재 player 말풍선이 에나 본인의 대사(바크)인지. */
  enaSpeaking = false
  // 연타 후 손을 떼면 '…이제 끝났어?'를 띄우기 위한 방치 타이머.
  private companionIdleTimer = 0
  // 현재 떠 있는 바크의 학습 대상 상황(없으면 null) / 중요도 / 등장 시각.
  private currentBarkSituation: SituationId | null = null
  private currentBarkImportance = 0
  private barkShownAt = 0
  private companionHeardTimer = 0

  // 비긴급 바크의 순차 출력 큐 — 시작 인사+회상처럼 연달아 온 바크가 서로를 즉시 덮지 않게,
  // 표시 중 바크의 최소 노출 시간(대사 길이 비례 1.5~3초)이 지난 뒤 이어서 보여준다.
  private readonly barkSequencer = new BarkSequencer<SituationId>()
  private barkQueueTimer = 0

  /** 예측 대비로 건넨 카드를 플레이어가 기한 내 쓰는지 추적(RL 신호). */
  pendingPrediction: {
    cardIds: readonly string[]
    issuedTurn: number
    deadlineTurn: number
    kind: string
  } | null = null

  /** 런 단위 드라마(모험의 질) 신호 — 성장 점프 게이트 입력. 피격/위협 beat에서 채우고 새 런에 비운다. */
  readonly runDramaSignals = {
    lowHpMoments: 0,
    emberCrises: 0,
    lethalThreatsFaced: 0,
    /** 이번 런 최저 체력 비율 — 컴백 폭(최저→최종) 계산용. */
    lowestHpRatio: 1,
  }

  constructor(private readonly deps: CompanionDirectorDeps) {}

  resetRunDramaSignals(): void {
    this.runDramaSignals.lowHpMoments = 0
    this.runDramaSignals.emberCrises = 0
    this.runDramaSignals.lethalThreatsFaced = 0
    this.runDramaSignals.lowestHpRatio = 1
  }

  /** 런 종료 결과로 모험 xp를 적립하고 성장 앵커를 옮긴 뒤, 에나 성향을 온라인 적응시키고 저장한다. */
  adaptCompanionToRunOutcome(won: boolean): void {
    const { gameState, companion, enaAutonomousLearner } = this.deps
    const floor = gameState.getCurrentTurn()
    const c = gameState.character
    // 이번 런 로그(endGame에서 방금 recordRunEnd로 확정됨)에서 의사결정·새 시도 신호를 집계한다.
    const entries = enaRuntimeObserver.getMemory().all()
    const lastRun = entries[entries.length - 1]
    const handUses = lastRun
      ? Object.values(lastRun.usedHandCards).reduce((sum: number, n) => sum + (n ?? 0), 0)
      : 0
    const decisions = handUses + (lastRun?.shopPurchases.length ?? 0) + companion.getRunInteractionCount()
    const finalHpRatio = c.maxHealth > 0 ? Math.max(0, c.health) / c.maxHealth : 0
    const drama: EnaRunDramaSignals = {
      lowHpMoments: this.runDramaSignals.lowHpMoments,
      emberCrises: this.runDramaSignals.emberCrises,
      lethalThreatsFaced: this.runDramaSignals.lethalThreatsFaced,
      effectiveClutches: companion.getRunClutchCount(),
      timelyPredictions: companion.getRunTimelyPredictionCount(),
      // 컴백 폭: 최저 체력비에서 런 종료 체력비까지 회복한 깊이(사망 런은 자연히 0에 가깝다).
      comebackDepth: Math.max(0, finalHpRatio - this.runDramaSignals.lowestHpRatio),
      novelCardsUsed: countNovelCardUses(entries),
    }
    // 모험 xp 적립(층·의사결정·진행 턴 + 첫 경험 + 드라마 게이트 점프) 후 성장 앵커 갱신.
    enaAutonomousLearner.accrueAdventureXp({
      floorReached: floor,
      cleared: won,
      decisions,
      progressTurns: floor,
      experienceKeys: deriveRunExperienceKeys({
        floorReached: floor,
        cleared: won,
        shopPurchases: lastRun?.shopPurchases ?? [],
      }),
      drama,
    })
    companion.setGrowth(
      computeEnaGrowth({ adventureXp: enaAutonomousLearner.loadAdventureXp(), bond: companion.getBond() })
    )
    // 축 특화 적립: 이번 런이 실제로 먹인 축(제때 예측/클러치/온정/피해 견딤×깊이)만 아주 소량 자란다.
    const specialization = enaAutonomousLearner.accrueSpecialization({
      floorReached: floor,
      timelyPredictions: companion.getRunTimelyPredictionCount(),
      effectiveClutches: companion.getRunClutchCount(),
      warmthInteractions: companion.getRunWarmthSignalCount(),
      damageTakenRatio: companion.getRunDamageTakenRatio(),
    })
    companion.setSpecialization(specialization)
    const adapted = companion.adaptToOutcome({ died: !won, floorReached: floor })
    saveDisposition(adapted, undefined, specialization)
  }

  /** 큐 드레인 예약 — 현재 바크의 최소 노출이 끝나는 시점에 다음 바크를 꺼낸다(이미 예약돼 있으면 무시). */
  private scheduleBarkQueueDrain(): void {
    if (this.barkQueueTimer !== 0) return
    this.barkQueueTimer = window.setTimeout(() => {
      this.barkQueueTimer = 0
      if (this.barkSequencer.pending === 0) return
      if (!this.deps.isGameActive()) {
        this.barkSequencer.clear()
        return
      }
      // urgent가 중간에 끼어들어 노출 기준이 뒤로 밀렸으면 남은 시간만큼 재예약한다.
      if (this.barkSequencer.nextDelayMs() > 30) {
        this.scheduleBarkQueueDrain()
        return
      }
      const next = this.barkSequencer.shift()
      if (!next) return
      this.displayEnaBarkNow(next.line, next.importance, next.situation)
      if (this.barkSequencer.pending > 0) this.scheduleBarkQueueDrain()
    }, this.barkSequencer.nextDelayMs())
  }

  /** 바크 큐/드레인 타이머 정리 — 새 런 시작 등 흐름이 끊기는 지점에서 잔여 대사가 새지 않게 한다. */
  clearBarkQueue(): void {
    this.barkSequencer.clear()
    clearTimeout(this.barkQueueTimer)
    this.barkQueueTimer = 0
  }

  /** 바크를 지금 즉시 말풍선에 띄우고 학습/노출 추적 상태를 갱신한다(큐 판단은 sayEnaBark가 담당). */
  private displayEnaBarkNow(line: string, importance: number, situation: SituationId | null): void {
    const { companion, speechBubble } = this.deps
    clearTimeout(this.companionHeardTimer)
    this.companionHeardTimer = 0
    this.enaSpeaking = true
    this.currentBarkImportance = importance
    this.currentBarkSituation = situation
    this.barkShownAt = Date.now()
    this.barkSequencer.noteDisplayed(line)
    speechBubble.show(line)
    if (situation) {
      this.companionHeardTimer = window.setTimeout(() => {
        companion.recordHeard(situation)
        this.companionHeardTimer = 0
        this.currentBarkSituation = null // 읽힘으로 정산됐으니 더는 스킵 대상이 아니다.
      }, COMPANION_READ_MS)
    }
  }

  /**
   * 에나의 한마디를 player 말풍선으로 띄운다.
   * - urgent/클러치급은 기존 규칙 유지: 큐를 건너뛰고 즉시 교체(더 높은 중요도 타이핑 중에만 양보).
   * - 그 외에는 표시 중 바크가 최소 노출 시간을 채우도록 짧은 큐(상한 3, 초과분은 낮은 중요도부터
   *   드롭)를 타고 순차 출력된다 — 시작 인사와 회상이 서로를 덮지 않는 근거.
   * - 상황 바크는 읽기 임계 시간 뒤까지 살아있으면 '읽음'으로 학습(더 말하게)한다.
   */
  sayEnaBark(
    line: string,
    opts: { importance?: number; situation?: SituationId | null } = {}
  ): void {
    const { speechBubble } = this.deps
    const importance = opts.importance ?? BARK_IMPORTANCE.touch
    const situation = opts.situation ?? null
    if (importance >= BARK_IMPORTANCE.urgent) {
      if (this.enaSpeaking && speechBubble.isTyping && importance <= this.currentBarkImportance) return
      this.displayEnaBarkNow(line, importance, situation)
      return
    }
    if (this.barkSequencer.busy(this.enaSpeaking && speechBubble.isShowing)) {
      this.barkSequencer.enqueue({ line, importance, situation })
      this.scheduleBarkQueueDrain()
      return
    }
    this.displayEnaBarkNow(line, importance, situation)
  }

  /** 체력/불씨가 위태로운 위급 상황인지 — 위급할 때 만지면 에나가 "지금 장난칠 때야?" 한다. */
  companionInDanger(): boolean {
    const c = this.deps.gameState.character
    const lowHp = c.maxHealth > 0 && c.health / c.maxHealth <= 0.3
    const lowEmber = c.ember <= 1
    return lowHp || lowEmber
  }

  /** 프로필을 만졌을 때 — 상황/연타 반응 + 방치 마무리 예약. 스킵은 플레이어 자유라 항의는 없다. */
  onProfileTouched(): void {
    const { companion, speechBubble } = this.deps
    if (!this.deps.isGameActive() || this.deps.isInputLocked()) return
    // 이미 대사가 출력 중(타이핑)이면 새 대사를 띄우지 않는다 — 중복 출력 방지(먹통 느낌 없게).
    if (speechBubble.isTyping) return
    const now = Date.now()
    const danger = this.companionInDanger()
    const line = companion.onProfileTouch(now, { danger })
    // 위급은 읽는 중에도 끼어들도록 높은 중요도, 평범한 반응은 낮은 중요도.
    this.sayEnaBark(line, { importance: danger ? BARK_IMPORTANCE.urgent : BARK_IMPORTANCE.touch })
    clearTimeout(this.companionIdleTimer)
    this.companionIdleTimer = window.setTimeout(() => {
      if (!this.deps.isGameActive() || this.deps.isInputLocked()) return
      const settle = companion.onSettle()
      if (settle) this.sayEnaBark(settle, { importance: BARK_IMPORTANCE.touch })
    }, COMPANION_IDLE_MS)
  }

  /** 말풍선 스킵 클릭 처리 — '안 읽고 넘김'만 학습 스킵으로 정산하고 버블을 닫는다. */
  handleBubbleSkip(): void {
    const { companion, speechBubble } = this.deps
    // 버블이 fully-visible 된 후 최소 1초가 지나야 스킵 허용 — 연타로 대사를 넘기는 것 방지.
    if (speechBubble.visibleSinceMs < SKIP_MIN_VISIBLE_MS) return
    // 카드가 아닌 곳을 눌러 스킵. 단, '안 읽고 빨리 따닥 넘긴' 경우만 학습 스킵으로 본다.
    const skippedUnread = this.currentBarkSituation !== null && Date.now() - this.barkShownAt < COMPANION_READ_MS
    if (skippedUnread) {
      companion.recordSkip(this.currentBarkSituation!)
      clearTimeout(this.companionHeardTimer)
      this.companionHeardTimer = 0
      const remark = companion.maybeQuietRemark()
      this.currentBarkSituation = null
      speechBubble.dismiss()
      // 과묵 안내 대사는 스킵 직후 조용히 한 번(낮은 중요도).
      if (remark && this.companionWorldCanSpeak()) this.sayEnaBark(remark, { importance: BARK_IMPORTANCE.touch })
      return
    }
    this.currentBarkSituation = null
    speechBubble.dismiss()
  }

  /** 일반 월드 바크가 떠도 되는 상황인지 — 상점/보스/게임오버 중엔 침묵한다.
   *  보스 전용 대사(등장/국면/격파)와 종막 대사(사망/클리어), 상점 구매평은 이 게이트를
   *  의도적으로 우회해 각 이벤트 지점에서 1회씩만 직접 발화한다. */
  companionWorldCanSpeak(): boolean {
    const { gameState } = this.deps
    return this.deps.isGameActive() && !this.deps.isShopOpen() && !gameState.bossBattleActive && !gameState.isGameOver
  }

  /** 적 공격 판정 직전에 회피 클러치를 굴린다. 체력 되돌림이 아니라 피해 적용 전 무효화라 타이밍이 자연스럽다. */
  tryCompanionIncomingDodge(incomingDamage: number): boolean {
    const { gameState, companion, boardRenderer } = this.deps
    if (incomingDamage <= 0 || !this.companionWorldCanSpeak()) return false
    const projectedHealth = gameState.character.health - incomingDamage
    const adversity = projectedHealth <= Math.max(1, gameState.character.maxHealth * 0.35)
    // bond는 하드코딩하지 않는다 — CompanionSystem이 누적 유대(bond >= 0.35)에서 파생한다.
    if (!companion.rollMinorClutch('dodge', { adversity })) return false
    this.deps.recordNotice(`에나의 의지 — 회피! 피해 ${incomingDamage} 무효`, 'info')
    void boardRenderer.animateClutchOnPlayer('health-gain')
    this.showClutchChain('dodge', `피해 ${incomingDamage} 무효`)
    this.sayEnaBark(companion.minorClutchLine('dodge'), { importance: BARK_IMPORTANCE.clutch })
    return true
  }

  /** 예지/클러치가 공유하는 위협 추정 입력 — 레일 예고 큐·강화팩 실효값·역할 가중을 함께 전달한다. */
  private companionForesightOptions(): ForesightOptions {
    const { gameState, companion, cardSpawner } = this.deps
    const chain = this.deps.getChain()
    return {
      unlockedCardIds: this.deps.getRunCardPool().snapshot().unlocked,
      unlockedRecipeIds: gameState.unlockedRecipeIds,
      chainSequence: chain.sequence,
      firedRecipeIds: chain.firedRecipeIds,
      // 예고선과 같은 실제 다음 리필 큐(peek은 소비하지 않음) — 시간 축 보정 입력.
      incomingRefill: cardSpawner.peekNextRefillCards(gameState.lanes.length),
      handSingleBonus: gameState.enhancements.singleBonus,
      supportRoleWeights: companion.getSupportRoleWeights(),
    }
  }

  /** 예측 대비: 위협 추정(그릇)을 미리 읽고 대비 카드를 건넨다. 플레이어 차례 직전 호출. */
  async tryCompanionPrediction(): Promise<void> {
    const { gameState, companion, boardRenderer } = this.deps
    const turn = gameState.getCurrentTurn()
    // RL: 건넨 대비 카드를 기한 내 안 썼으면 '불필요'로 학습(덜 주게).
    if (this.pendingPrediction && turn > this.pendingPrediction.deadlineTurn) {
      companion.recordPredictionWasted()
      this.pendingPrediction = null
    }
    if (!this.companionWorldCanSpeak() || gameState.bossBattleActive || this.pendingPrediction) return
    const report = assessThreats(gameState.lanes, gameState.character, this.companionForesightOptions())
    // 드라마 '위기감' 신호: 즉사 후보 병합 위협을 실제로 마주한 턴을 센다(계열 캡이 과대 계상을 막는다).
    if (report.webLethal) this.runDramaSignals.lethalThreatsFaced += 1
    const suggested = report.recommendedCardId
    // HandCardAdvisor가 보유 손패의 같은 역할(청소류 포함)까지 보고 추천을 접으므로,
    // 여기서는 같은 카드 중복 지급만 추가로 막으면 된다. 단, 비합체 2장 보유 카드는
    // 3장째가 즉시 트리플로 완성되므로(트리플 보조 추천 경로) 지급을 허용한다.
    const heldNonMerged = suggested
      ? gameState.character.hand.filter((c) => c.defId === suggested && !c.merged).length
      : 0
    const needsPrediction = !!suggested && (heldNonMerged === 0 || heldNonMerged === 2)
    if (!suggested) return
    if (!companion.evaluateWebPrediction(needsPrediction, false, turn)) {
      // 후반부 고점 에나라면 터졌을 예측 지원을 지금은 말로만 비춰, 초반 미숙함을 드러낸다.
      // 실패 회고 대사는 '눈앞에 보였다' 수준이 아니라 실제 피해/즉사 후보를 놓쳤을 때만 낸다.
      if (needsPrediction && this.shouldSayMissedWebPrediction(report, gameState.character.health)) {
        const missed = companion.missedPotentialLine('web', turn)
        if (missed) this.sayEnaBark(missed, { importance: BARK_IMPORTANCE.situation, situation: 'web' })
      }
      return
    }
    // 판 분석 결과가 고른 해금 손패를 건넨다. 함정 외 공격/포자/레시피/트리플 보조도 이 경로를 공유한다.
    // enqueueDrop = 일반 획득과 같은 정리(addHandCard 후 트리플 자동 합성 검사) — 3장째 지급도 즉시 합성된다.
    const drop = DropSystem.makeCard(suggested)
    if (!HandSystem.enqueueDrop(gameState.character, drop)) return // 손패 가득 — 다음 기회에
    this.pendingPrediction = { cardIds: [suggested], issuedTurn: turn, deadlineTurn: turn + 3, kind: report.recommendationKind ?? 'support' }
    this.deps.recordNotice(`에나의 의지 — ${getHandCardDef(suggested).name} 지원: ${report.recommendationReason}`, 'info')
    this.deps.render()
    void boardRenderer.animateClutchOnPlayer('hand-control')
    this.showClutchChain('predict', report.webLethal ? `${getHandCardDef(suggested).name} 지원 (위험!)` : `${getHandCardDef(suggested).name} 지원`)
    const predictLineKind = report.recommendationKind === 'cleanup' ? 'web' : report.recommendationKind ?? 'support'
    // '왜 이 카드인지' 짧은 구(HandCardAdvisor reason)를 대사 {이유} 슬롯에 섞는다.
    this.sayEnaBark(companion.predictLine(predictLineKind, report.recommendationShortReason), { importance: BARK_IMPORTANCE.clutch })
    // 지원 카드는 이미 손패에 들어갔으므로 트레일 실패가 입력 잠금 해제를 막지 않게 연출만 분리한다.
    void this.deps.playResourceTrail({ kind: 'chain' }, 'hand', 1)
  }

  /** 거미줄 예측 실패 회고는 임박 피해가 큰 경우로 좁혀, 단순 함정 발견 대사처럼 보이지 않게 한다. */
  private shouldSayMissedWebPrediction(report: ReturnType<typeof assessThreats>, currentHealth: number): boolean {
    if (!report.recommendCleanup || !report.hasImminentWebDrop) return false
    if (report.webLethal) return true
    // 현재 체력의 절반 이상을 잃을 병합 위협일 때만 '고점이면 막았을' 아쉬움으로 취급한다.
    return report.potentialWebDamage > 0 && report.potentialWebDamage >= Math.max(2, Math.ceil(currentHealth * 0.5))
  }

  /** 클러치 발동 시 플레이어 카드 위에 『 제목 』 + 효과 배너를 띄운다(소소한 클러치 연출도 공유). */
  showClutchChain(kind: string, desc: string): void {
    this.deps.boardRenderer.showClutchBanner(CLUTCH_TITLES[kind] ?? '에나의 의지', desc)
  }

  /**
   * 클러치(에나의 의지) 평가 + 실행. 위기에 '의지'가 가득 차면 보통 강도의 실제 지원을 하고,
   * 클러치 전용 체인을 플레이어 카드 위에 띄우며 거의 확정으로 대사를 친다.
   */
  tryCompanionClutch(): void {
    const { gameState, companion } = this.deps
    if (!this.companionWorldCanSpeak()) return
    const c = gameState.character
    const turn = gameState.getCurrentTurn()
    const report = assessThreats(gameState.lanes, c, this.companionForesightOptions())
    const plan = companion.evaluateClutch({
      hp: c.health,
      maxHp: c.maxHealth,
      hpRatio: c.maxHealth > 0 ? c.health / c.maxHealth : 1,
      emberLow: c.ember <= 1,
      supportCardId: report.recommendedCardId,
      supportReason: report.recommendationReason,
      supportShortReason: report.recommendationShortReason,
    })
    if (plan) {
      this.applyClutch(plan)
      return
    }
    // 강적 미숙 대사는 '마주침'만으로는 내지 않는다 — 고점 에나라면 실제로 건넸을
    // 공격/방어 지원각(해금 카드·플레이어 미보유)이 있는데 의지 예산이 모자라 클러치가
    // 못 뜬 경우에만 낮은 빈도로 아쉬움을 표현한다(단순 조우 오발동 방지).
    // 여기에 '실제로 싸우는 중' 게이트를 더한다: 최근 2턴 안에 맞았거나 처치한 적이 없으면
    // 아직 아무 일도 안 일어난 것이므로 "이 정도밖에 못 해…" 류의 사과가 나가지 않는다.
    const hadInterventionAngle =
      report.recommendationKind === 'attack' || report.recommendationKind === 'defense'
    const engagedRecently = companion.hasRecentEvent('hit', turn) || companion.hasRecentEvent('kill', turn)
    if (report.strongEnemyIncoming && hadInterventionAngle && engagedRecently) {
      const missed = companion.missedPotentialLine('shield', turn)
      if (missed) this.sayEnaBark(missed, { importance: BARK_IMPORTANCE.situation, situation: 'hit' })
    }
  }

  /** 클러치 효과를 실제로 적용하고 연출(체인 배너·대사·트레일·로그)을 함께 낸다. */
  private applyClutch(plan: ClutchPlan): void {
    const { gameState, boardRenderer } = this.deps
    const c = gameState.character
    const before = this.deps.snapshotPlayerResources()
    let detail = ''
    if (plan.kind === 'heal') {
      const healed = c.heal(plan.amount)
      detail = `체력 +${healed}`
    } else if (plan.kind === 'shield') {
      const shielded = c.addShield(plan.amount)
      detail = `방패 +${shielded}`
    } else if (plan.kind === 'ember' || plan.kind === 'hand') {
      // 에나가 직접 손패를 건네는 클러치. 불씨 위기면 성냥, 예지 위기면 추천 손패를 준다.
      // enqueueDrop = 일반 획득과 같은 정리 경로 — 같은 카드 3장째 보급도 즉시 트리플로 합성된다.
      const cardId = plan.cardId ?? 'match'
      const drop = DropSystem.makeCard(cardId)
      detail = HandSystem.enqueueDrop(c, drop) ? `${getHandCardDef(cardId).name} +1` : '손패가 가득 참'
    }
    this.deps.recordNotice(`에나의 의지 — ${detail}`, 'info')
    this.deps.render()
    // 플레이어 카드 들썩 + 블라스트(종류별 팔레트) + 전용 체인 배너.
    const clutchTheme = plan.kind === 'shield' ? 'shield-gain' : (plan.kind === 'ember' || plan.kind === 'hand') ? 'ember-gain' : 'health-gain'
    void boardRenderer.animateClutchOnPlayer(clutchTheme)
    this.showClutchChain(plan.kind, detail)
    // 거의 확정 대사 + 자원 트레일(같은 beat). 클러치는 최상위 중요도라 다른 대사가 떠 있어도 끼어든다.
    this.sayEnaBark(plan.line, { importance: BARK_IMPORTANCE.clutch })
    void this.deps.playPlayerGainTrails({ kind: 'center' }, before)
  }
}
