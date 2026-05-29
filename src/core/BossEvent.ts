/**
 * BossEventController — 모든 보스 이벤트 상태·흐름을 관리.
 * index.ts가 직접 소유하던 보스 관련 함수/상태를 이 클래스로 추출해
 * 보스를 추가할 때 index.ts를 건드리지 않아도 된다.
 *
 * 외부 의존(render, recordNotice 등)은 생성 시 BossInjected로 주입한다.
 */

import { GameState } from '@core/GameState'
import { TurnManager } from '@core/TurnManager'
import type { GameBoardRenderer } from '@ui/GameBoardRenderer'
import { Card, CardType } from '@entities/Card'
import { LANE_DISTANCE_COUNT } from '@entities/Lane'
import { DropSystem } from '@systems/DropSystem'
import type { RunCardPool } from '@core/RunCardPool'
import { SquareBurst } from '@ui/SquareBurst'
import type { SpriteUrls as SpriteUrlsType } from '@ui/Sprites'
import type { SpeechBubble } from '@ui/SpeechBubble'
import { getHandCardDef } from '@data/HandCards'
import { getRelicDef, RELIC_IDS, type RelicId } from '@data/Relics'
import { sampleWithoutReplacement } from '@core/Sampling'

// ---- 보스별 스탯 정의 -------------------------------------------------------

export interface BossDef {
  /** 화면 표시 이름 */
  name: string
  flavor: string
  maxHp: number
  attack: number
  attackInterval: number
  /** HP가 이 배수 이하가 될 때마다 손패 1장 지급 */
  handGiftStep: number
  /** CSS boss-kind-* 마커 — Rail CSS 레이아웃과 연동 */
  specialEnemyKind: 'waxArmy' | 'waxSculptor'
  /** Card.groupCount 표시값 (점수·뱃지용). 실제 점유 행 수와 별도. */
  groupCount: number
  /** lanes에 보스 카드 인스턴스를 실제로 박을 dist 행 수.
   *  waxArmy(30F)는 CSS로 시각 확장하므로 dist 0에만 박아 1.
   *  waxSculptor(90F)는 실제 2행이므로 2. */
  occupiedDistRows: number
  /** 일러스트 URL */
  spriteUrl: string
  /** 보스 타일 등장 연출 선택자 */
  appearAnimation: 'landing' | 'waxSculptor'
  /** 보스 대사 */
  introBubble: string
  playerResponseBubble: string
}

// ---- 내부 상태 인터페이스 ---------------------------------------------------

export interface BossEventState {
  card: Card
  def: BossDef
  turn: number
  nextHandGiftAt: number
  defeated: (() => void) | null
  savedActiveRow: (Card | null)[]
  defeatTriggered: boolean
}

export interface BossRewardState {
  resolved: (() => void) | null
  remaining: number
}

// ---- index.ts에서 주입하는 콜백 --------------------------------------------

export interface BossInjected {
  /** index.ts의 `inputLocked` 변수를 외부에서 set */
  setInputLocked: (v: boolean) => void
  /** 화폐 1단위씩 증가 + HUD 피드백까지 처리 */
  addOneCoin: () => void
  render: () => void
  recordNotice: (msg: string, kind: 'info' | 'win' | 'hurt') => void
  /** 보스 격파 후 시련 오버레이를 열고 완료까지 대기 */
  openTrialOverlayForced: () => Promise<void>
  /** 유물 구매 즉발 효과 적용 */
  applyRelicPurchaseEffect: (id: RelicId) => Promise<void>
}

// ---- Controller ------------------------------------------------------------

export class BossEventController {
  /** index.ts에서 `bossEventState` 대신 이 프로퍼티를 참조한다. */
  eventState: BossEventState | null = null
  /** index.ts에서 `bossRewardState` 대신 이 프로퍼티를 참조한다. */
  rewardState: BossRewardState | null = null
  /** 보상/시련 단계 중 손패 카드 사용 차단 플래그 */
  postPhaseHandLocked = false

  constructor(
    private readonly gs: GameState,
    private readonly tm: TurnManager,
    private readonly br: GameBoardRenderer,
    private readonly bossBubble: SpeechBubble,
    private readonly speechBubble: SpeechBubble,
    private readonly runCardPool: RunCardPool,
    private readonly sprites: typeof SpriteUrlsType,
    private readonly inject: BossInjected,
  ) {}

  // ---- 공개 흐름 메서드 -------------------------------------------------------

  /** 30F 보스 이벤트 실행. closeShopAndResume 제단 EXIT 분기에서 호출한다. */
  async run30F(): Promise<void> {
    const def: BossDef = {
      name: '양초 백작',
      flavor: '제단의 수문장',
      maxHp: 50,
      attack: 5,
      attackInterval: 3,
      handGiftStep: 10,
      specialEnemyKind: 'waxArmy',
      groupCount: 3,
      occupiedDistRows: 1,   // CSS가 dist-0을 시각적으로 3행으로 확장, 데이터는 dist-0만
      spriteUrl: this.sprites.boss,
      appearAnimation: 'landing',
      introBubble: '내 저택에 온 것을 환영하네, 위태로운 불씨여',
      playerResponseBubble: '네 저택이라고? 웃기시네!',
    }
    await this.runBossEvent(def)
  }

  /** 90F 보스 이벤트 실행. closeShopAndResume 제단 EXIT 분기에서 호출한다. */
  async run90F(): Promise<void> {
    const def: BossDef = {
      name: '밀랍 조각사',
      flavor: '밀랍으로 빚은 조각들의 집합체',
      maxHp: 50,
      attack: 6,
      attackInterval: 3,
      handGiftStep: 10,
      specialEnemyKind: 'waxSculptor',
      groupCount: 2,
      occupiedDistRows: 2,   // dist-0 + dist-1 두 행에 실제로 카드 박음
      spriteUrl: this.sprites.boss90,
      appearAnimation: 'waxSculptor',
      introBubble: '...... 조각들이 당신을 바라본다',
      playerResponseBubble: '말이 없군. 더 무서워!',
    }
    await this.runBossEvent(def)
  }

  /** 보스 카드 클릭 처리. handleCardAction 내 BOSS 분기에서 호출한다. */
  async handleClick(card: Card): Promise<void> {
    if (!this.eventState || this.eventState.card !== card) return
    const state = this.eventState
    const character = this.gs.character
    const shouldTickFreezeAfterBeat = card.isFrozen()

    if (card.isFrozen()) {
      await this.br.playBossFreezeResist(card.id)
      this.inject.recordNotice('보스가 굳어 있어 공격이 통하지 않는다', 'info')
      if (shouldTickFreezeAfterBeat) card.tickFrozen()
      return
    }

    this.inject.setInputLocked(true)

    await this.br.animatePlayerAttack(card)
    const bossTile = this.br.findCardElement(card.id)
    if (bossTile) SquareBurst.playOn(bossTile, 'damage', { count: 22, spread: 180, duration: 560 })
    const dealt = Math.min(character.damage, card.getHealth())
    card.takeDamage(dealt)
    state.turn += 1
    this.tm.tickEmberDecay()

    const remaining = state.def.attackInterval - (state.turn % state.def.attackInterval)
    const displayValue = remaining === state.def.attackInterval ? state.def.attackInterval : remaining
    this.br.setBossAttackCountdown(displayValue)
    await this.br.animateDamageNumbersById([{ cardId: card.id, amount: dealt }])

    await this.consumeHandGiftThresholds(card.id)
    this.inject.render()

    if (card.getHealth() <= 0) {
      await this.handleDefeated()
      return
    }

    if (state.turn % state.def.attackInterval === 0) {
      character.takeDamage(card.getDamage())
      await this.br.animateEnemyAttacks([
        { cardId: card.id, cardName: card.name, laneIndex: 0, damage: card.getDamage() },
      ])
      await this.br.animateDamageFlash()
      this.inject.recordNotice(`보스 반격! 플레이어가 ${card.getDamage()} 피해를 받았다`, 'hurt')
      this.inject.render()
    }

    this.inject.setInputLocked(false)
  }

  /** 손패/조합식 데미지 후처리. checkBossDefeatedAfterHandEffect에서 위임. */
  async applyPostHandEffect(): Promise<void> {
    if (!this.eventState) return
    await this.consumeHandGiftThresholds(this.eventState.card.id)
    if (this.eventState.card.getHealth() <= 0) {
      await this.handleDefeated()
    }
  }

  /** 보상 chest 클릭 처리. handleCardAction 내 boss-reward 분기에서 호출한다. */
  async handleRewardClaim(card: Card): Promise<void> {
    if (!this.rewardState) return
    const character = this.gs.character
    this.inject.setInputLocked(true)

    if (card.id === 'boss-reward-heal') {
      character.heal(character.maxHealth)
      character.gainEmber(character.emberMax)
      this.inject.recordNotice('회복의 봉인함: 체력 풀 회복 / 불씨 가득', 'win')
      void this.br.animateResourceTrailFromCard(card.id, 'health', 1, 'health-gain')
      void this.br.animateResourceTrailFromCard(card.id, 'ember', 1, 'gauge-gain')
    } else if (card.id === 'boss-reward-bounty') {
      const amount = 1 + Math.floor(Math.random() * 10)
      for (let i = 0; i < amount; i++) {
        this.inject.addOneCoin()
        await new Promise((r) => window.setTimeout(r, 70))
      }
      this.inject.recordNotice(`현상금: +$${amount}`, 'info')
      void this.br.animateResourceTrailFromCard(card.id, 'coin', amount, 'treasure-gain')
    } else if (card.id === 'boss-reward-chest') {
      const unownedRelics = RELIC_IDS.filter(
        (id) => !character.hasRelic(id) && !character.bannedRelics.includes(id)
      ) as RelicId[]
      const relicId = unownedRelics.length > 0
        ? unownedRelics[Math.floor(Math.random() * unownedRelics.length)]
        : null
      if (relicId) {
        character.addRelic(relicId)
        this.inject.recordNotice(`전리품: 유물 ${getRelicDef(relicId).name} 획득`, 'info')
        await this.inject.applyRelicPurchaseEffect(relicId)
      } else {
        this.inject.recordNotice('전리품: 획득 가능한 유물이 없다', 'info')
      }
      void this.br.animateResourceTrailFromCard(card.id, 'score', 1, 'treasure-gain')
    }

    await this.br.playBossRewardClaimedConsume(card.id)
    for (let i = 0; i < 3; i++) this.gs.lanes[i].setCardAtDistance(0, null)
    this.gs.compactLanes()
    this.inject.render()
    await new Promise((r) => window.setTimeout(r, 280))

    this.rewardState.remaining -= 1
    if (this.rewardState.remaining <= 0) {
      this.rewardState.resolved?.()
    }
    this.inject.setInputLocked(false)
  }

  /** 보상 chest 카드 여부 식별. handleCardAction 라우팅에서 사용. */
  isRewardCard(card: Card): boolean {
    return card.type === CardType.TREASURE && card.id.startsWith('boss-reward-')
  }

  // ---- 내부 구현 -------------------------------------------------------------

  /** 보스 종류에 무관한 공통 이벤트 흐름. BossDef가 종류별 분기를 담는다. */
  private async runBossEvent(def: BossDef): Promise<void> {
    const frozenRunTurn = this.gs.getCurrentTurn()

    // 필드 전체 백업 후 비우기 — 보스/보상 카드만 lanes에 존재하도록 격리.
    const savedField: (Card | null)[][] = []
    for (let d = 0; d < LANE_DISTANCE_COUNT; d++) {
      const row: (Card | null)[] = []
      for (let i = 0; i < this.gs.lanes.length; i++) {
        row.push(this.gs.lanes[i].getCardAtDistance(d))
        this.gs.lanes[i].setCardAtDistance(d, null)
      }
      savedField.push(row)
    }

    const bossCard = new Card(
      `boss-altar-${def.specialEnemyKind}-${this.gs.getCurrentTurn()}`,
      CardType.BOSS,
      def.name,
      def.flavor,
      def.maxHp,
      def.attack,
      { specialEnemyKind: def.specialEnemyKind }
    )
    bossCard.groupCount = def.groupCount
    bossCard.enemyHealthTotal = def.maxHp
    bossCard.enemyDamageTotal = def.attack
    for (let row = 0; row < def.occupiedDistRows; row++) {
      for (let i = 0; i < 3; i++) {
        this.gs.lanes[i].setCardAtDistance(row, bossCard)
      }
    }
    this.gs.encounteredEnemyNames.add(bossCard.name)

    this.eventState = {
      card: bossCard,
      def,
      turn: 0,
      nextHandGiftAt: def.maxHp - def.handGiftStep,
      defeated: null,
      savedActiveRow: savedField[0],
      defeatTriggered: false,
    }

    this.tm.setTurnMode('boss_phase')
    this.gs.bossBattleActive = true
    this.br.setBossAttackCountdown(def.attackInterval)

    // 등장 연출
    this.inject.render()
    if (def.appearAnimation === 'waxSculptor') {
      await this.br.playWaxSculptorAppearAnimation(bossCard.id)
    } else {
      await this.br.playBossLandingAnimation(bossCard.id)
    }

    // 보스 대사
    this.bossBubble.show(def.introBubble)
    await new Promise((r) => window.setTimeout(r, def.appearAnimation === 'waxSculptor' ? 3800 : 4160))
    this.bossBubble.dismiss()
    await new Promise((r) => window.setTimeout(r, 320))
    this.speechBubble.show(def.playerResponseBubble, 0)
    await new Promise((r) => window.setTimeout(r, def.appearAnimation === 'waxSculptor' ? 2600 : 2800))
    this.speechBubble.dismiss()
    await new Promise((r) => window.setTimeout(r, 400))

    // 인트로 오버레이
    const introClosed = this.br.openBossIntroOverlay({
      name: def.name,
      maxHp: def.maxHp,
      attack: def.attack,
      attackInterval: def.attackInterval,
      handGiftStep: def.handGiftStep,
      spriteUrl: def.spriteUrl,
    })
    await Promise.all([
      new Promise((r) => window.setTimeout(r, 560)),
      introClosed,
    ])

    this.inject.setInputLocked(false)

    // 격파 대기
    await new Promise<void>((resolve) => {
      this.eventState!.defeated = resolve
    })

    this.inject.recordNotice('보스 처치! 레일 보상이 떨어진다', 'win')
    this.eventState = null
    await this.stageBossRewardChests(savedField)

    this.tm.setTurnMode('normal_turn')
    await this.inject.openTrialOverlayForced()

    if (this.gs.getCurrentTurn() !== frozenRunTurn)
      this.inject.recordNotice(`경고: 보스 이벤트 중 실제 턴(${frozenRunTurn})이 변경됨`, 'hurt')
  }

  private async consumeHandGiftThresholds(bossCardId: string): Promise<void> {
    if (!this.eventState) return
    const state = this.eventState
    while (state.card.getHealth() <= state.nextHandGiftAt && state.nextHandGiftAt > 0) {
      await this.grantHandGift(bossCardId)
      state.nextHandGiftAt -= state.def.handGiftStep
    }
  }

  private async grantHandGift(bossCardId: string): Promise<void> {
    const character = this.gs.character
    const { unlocked } = this.runCardPool.snapshot()
    if (unlocked.length === 0) return
    const drawIds = sampleWithoutReplacement(unlocked, 1)
    const id = drawIds[0]
    if (!id) return
    const accepted = character.addHandCard(DropSystem.makeCard(id))
    if (!accepted) {
      this.inject.recordNotice('보스 피해 보상: 손패가 가득 차 카드를 받지 못했다', 'info')
      return
    }
    this.inject.recordNotice(`보스 피해 보상: 손패 ${getHandCardDef(id).name} 획득`, 'info')
    this.inject.render()
    await this.br.animateResourceTrailFromCard(bossCardId, 'hand', 1, 'hand-recovery')
  }

  private async handleDefeated(): Promise<void> {
    if (!this.eventState) return
    const state = this.eventState
    if (state.defeatTriggered) return
    state.defeatTriggered = true

    await this.br.playBossDefeatSequence(state.card.id)
    // 보스가 실제로 점유했던 모든 행(occupiedDistRows)을 정리한다.
    for (let row = 0; row < state.def.occupiedDistRows; row++) {
      for (let i = 0; i < 3; i++) this.gs.lanes[i].setCardAtDistance(row, null)
    }
    this.gs.bossBattleActive = false
    this.br.setBossAttackCountdown(null)
    this.inject.render()
    state.defeated?.()
  }

  private async stageBossRewardChests(savedField: (Card | null)[][]): Promise<void> {
    const healCard   = new Card('boss-reward-heal',   CardType.TREASURE, '점화액',  '체력 / 불씨 회복')
    const chestCard  = new Card('boss-reward-chest',  CardType.TREASURE, '전리품',  '유물 획득')
    const bountyCard = new Card('boss-reward-bounty', CardType.TREASURE, '현상금',  '1~10$')
    for (const c of [healCard, chestCard, bountyCard]) c.groupCount = 3
    for (let lane = 0; lane < 3; lane++) {
      this.gs.lanes[lane].setCardAtDistance(0, healCard)
      this.gs.lanes[lane].setCardAtDistance(1, chestCard)
      this.gs.lanes[lane].setCardAtDistance(2, bountyCard)
    }
    this.postPhaseHandLocked = true
    this.inject.setInputLocked(false)
    this.inject.render()
    await new Promise<void>((resolve) => {
      this.rewardState = { resolved: resolve, remaining: 3 }
    })
    this.rewardState = null
    this.inject.setInputLocked(true)
    for (let d = 0; d < savedField.length; d++) {
      for (let i = 0; i < 3; i++) {
        this.gs.lanes[i].setCardAtDistance(d, savedField[d][i])
      }
    }
    this.inject.render()
  }
}
