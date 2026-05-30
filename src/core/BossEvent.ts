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
import { ENEMY_DEFINITIONS } from '@systems/CardSpawner'

type WaxKnightCardEffect = 'shield' | 'heal' | 'strike'

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
  specialEnemyKind: 'waxArmy' | 'waxKnight' | 'waxSculptor'
  /** Card.groupCount 표시값 (점수·뱃지용). 실제 점유 행 수와 별도. */
  groupCount: number
  /** lanes에 보스 카드 인스턴스를 실제로 박을 dist 행 수.
   *  waxArmy(30F)는 CSS로 시각 확장하므로 dist 0에만 박아 1.
   *  waxSculptor(90F)는 실제 2행이므로 2. */
  occupiedDistRows: number
  /** 일러스트 URL */
  spriteUrl: string
  /** 보스 타일 등장 연출 선택자 */
  appearAnimation: 'landing' | 'waxKnightSwoop' | 'waxSculptor'
  /** 보스 대사 */
  introBubble: string
  playerResponseBubble: string
  /** 보스 말풍선 표시 후 대기 ms (등장+타자기+읽기 여유 합산) */
  introBubbleMs: number
  /** 플레이어 반응 말풍선 대기 ms */
  playerBubbleMs: number
  /** 인트로 오버레이에 표시되는 특징 한 줄 */
  trait: string
  /** 인트로 오버레이 상단 수식어 */
  kicker: string
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
  /** waxSculptor 전용: 현재 전방(front)/후방(back) 페이즈 */
  sculptorPhase: 'front' | 'back'
  /** waxSculptor 현재 점유 시작 dist-row (front=0, back=1) */
  sculptorStartRow: number
  /** waxSculptor 후방 페이즈 중 dist-0에 소환된 적 카드 id 집합 */
  summonedEnemyIds: Set<string>
  /** waxKnight 전용: 다음 피해를 먼저 흡수하는 밀랍 방패량 */
  bossShield: number
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
  /** 플레이어 체력 0 처리 — Hope 유물 부활 시 true, 실제 패배 시 false + 게임오버 화면 */
  handlePlayerDeath: () => Promise<boolean>
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
      // 등장(300ms) + 타자기(18자×70ms≈1260ms) + 읽기(2600ms)
      introBubbleMs: 4160,
      // 타자기(12자×70ms≈840ms) + 읽기(1800ms) + 퇴장(400ms)
      playerBubbleMs: 2800,
      trait: '보스 체력이 10 닳을 때마다 플레이어에게 랜덤 손패 1장을 지급한다.',
      kicker: '탐욕의 대가',
    }
    await this.runBossEvent(def)
  }

  /** 60F 보스 이벤트 실행. 30F의 3×3 구조를 유지하되 전용 카드 사용 패턴을 적용한다. */
  async run60F(): Promise<void> {
    const def: BossDef = {
      name: '레온하르트',
      flavor: '에나벨라를 위하여 검을 든 밀랍 기사',
      maxHp: 55,
      attack: 2,
      attackInterval: 3,
      handGiftStep: 0,
      specialEnemyKind: 'waxKnight',
      groupCount: 3,
      occupiedDistRows: 1,   // 30F처럼 데이터는 dist-0 한 줄, CSS가 3×3 중앙 보스로 확장한다.
      spriteUrl: this.sprites.boss60,
      appearAnimation: 'waxKnightSwoop',
      introBubble: '에나벨라님을... 위하여.',
      playerResponseBubble: '설마... 레온하르트...?',
      // 등장 훙! 연출(780ms) + 타자기(16자×70ms≈1120ms) + 읽기(2100ms)
      introBubbleMs: 3220,
      // 타자기(15자×70ms≈1050ms) + 읽기(1900ms) + 퇴장(400ms)
      playerBubbleMs: 3350,
      trait: '3턴마다 플레이어를 타격하고 방패 2 / 체력 2 / 플레이어 피해 2 중 2장을 랜덤 발동한다.',
      kicker: '충성의 잔향',
    }
    await this.runBossEvent(def)
  }

  /** 90F 보스 이벤트 실행. closeShopAndResume 제단 EXIT 분기에서 호출한다. */
  async run90F(): Promise<void> {
    const def: BossDef = {
      name: '밀랍 조각사',
      flavor: '밀랍으로 빚은 조각들의 집합체',
      maxHp: 60,
      attack: 4,
      attackInterval: 3,
      handGiftStep: 10,
      specialEnemyKind: 'waxSculptor',
      groupCount: 2,
      occupiedDistRows: 2,   // dist-0 + dist-1 두 행에 실제로 카드 박음
      spriteUrl: this.sprites.boss90,
      appearAnimation: 'waxSculptor',
      introBubble: '분명 실패작이었는데?',
      playerResponseBubble: '드디어 만났어. 널 불태워주마!',
      // 등장(300ms) + 타자기(9자×70ms≈630ms) + 읽기(1800ms)
      introBubbleMs: 2730,
      // 타자기(15자×70ms≈1050ms) + 읽기(2000ms)
      playerBubbleMs: 3050,
      trait: '3턴마다 밀랍을 조각해 양초를 소환하고 몸을 숨깁니다.',
      kicker: '광기의 예술가',
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
    const rawDamage = Math.min(character.damage, card.getHealth() + state.bossShield)
    const blocked = Math.min(state.bossShield, rawDamage)
    state.bossShield -= blocked
    const dealt = Math.min(rawDamage - blocked, card.getHealth())
    if (dealt > 0) card.takeDamage(dealt)
    if (blocked > 0) this.inject.recordNotice(`밀랍 방패가 피해 ${blocked}를 막았다`, 'info')
    state.turn += 1
    this.tm.tickEmberDecay()

    const remaining = state.def.attackInterval - (state.turn % state.def.attackInterval)
    const displayValue = remaining === state.def.attackInterval ? state.def.attackInterval : remaining
    this.br.setBossAttackCountdown(displayValue)
    await this.br.animateDamageNumbersById(dealt > 0 ? [{ cardId: card.id, amount: dealt }] : [])

    await this.consumeHandGiftThresholds(card.id)
    this.inject.render()

    if (card.getHealth() <= 0) {
      await this.handleDefeated()
      return
    }

    if (state.turn % state.def.attackInterval === 0) {
      if (state.def.specialEnemyKind === 'waxSculptor') {
        // 3턴마다 조각사 페이즈 교체 — 공격 대신 소환/후방 이동 연출
        await this.handleSculptorPhaseShift()
        return
      }
      if (state.def.specialEnemyKind === 'waxKnight') {
        // 레온하르트는 기본 타격 뒤 플레이어 손패처럼 2장의 효과 카드를 연속 사용한다.
        await this.resolveWaxKnightCardTurn(card.id)
      } else {
        character.takeDamage(card.getDamage())
        await this.br.animateEnemyAttacks([
          { cardId: card.id, cardName: card.name, laneIndex: 0, damage: card.getDamage() },
        ])
        await this.br.animateDamageFlash()
        this.inject.recordNotice(`보스 반격! 플레이어가 ${card.getDamage()} 피해를 받았다`, 'hurt')
        this.inject.render()
      }
      if (!this.gs.character.isAlive()) {
        await this.inject.handlePlayerDeath()
        return
      }
    }

    this.inject.setInputLocked(false)
  }

  /** 손패/조합식 데미지 후처리. checkBossDefeatedAfterHandEffect에서 위임. */
  async applyPostHandEffect(): Promise<void> {
    if (!this.eventState) return
    await this.consumeHandGiftThresholds(this.eventState.card.id)
    if (this.eventState.card.getHealth() <= 0) {
      await this.handleDefeated()
      return
    }
    // 손패로 소환 적을 처치했을 수 있으니, 후방 페이즈면 잔존 여부를 재집계한다.
    if (this.eventState.sculptorPhase === 'back') {
      await this.reconcileSummonedEnemiesAfterHand()
    }
  }

  /** 손패 효과가 소환 적을 제거한 뒤, lanes에 남지 않은 적을 집합에서 제거하고
   *  모두 사라졌으면 조각사를 전방으로 복귀시킨다. */
  private async reconcileSummonedEnemiesAfterHand(): Promise<void> {
    const state = this.eventState!
    const aliveIds = new Set<string>()
    for (let i = 0; i < 3; i++) {
      const c = this.gs.lanes[i].getCardAtDistance(0)
      if (c) aliveIds.add(c.id)
    }
    for (const id of [...state.summonedEnemyIds]) {
      if (!aliveIds.has(id)) state.summonedEnemyIds.delete(id)
    }
    if (state.summonedEnemyIds.size === 0) {
      await this.returnSculptorToFront()
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
      sculptorPhase: 'front',
      sculptorStartRow: 0,
      summonedEnemyIds: new Set<string>(),
      bossShield: 0,
    }

    this.tm.setTurnMode('boss_phase')
    this.gs.bossBattleActive = true
    this.br.setBossAttackCountdown(def.attackInterval)

    // 등장 연출
    this.inject.render()
    if (def.appearAnimation === 'waxSculptor') {
      await this.br.playWaxSculptorAppearAnimation(bossCard.id)
    } else if (def.appearAnimation === 'waxKnightSwoop') {
      await this.br.playWaxKnightSwoopAnimation(bossCard.id)
    } else {
      await this.br.playBossLandingAnimation(bossCard.id)
    }

    // 보스 대사
    this.bossBubble.show(def.introBubble)
    await new Promise((r) => window.setTimeout(r, def.introBubbleMs))
    this.bossBubble.dismiss()
    await new Promise((r) => window.setTimeout(r, 320))
    this.speechBubble.show(def.playerResponseBubble, 0)
    await new Promise((r) => window.setTimeout(r, def.playerBubbleMs))
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
      introBubble: def.introBubble,
      trait: def.trait,
      kicker: def.kicker,
    })
    await Promise.all([
      new Promise((r) => window.setTimeout(r, 560)),
      introClosed,
    ])

    // waxSculptor: 타이틀 닫힌 직후 추가 도발 대사 → 초기 소환 연출 (input 여전히 잠김)
    if (def.specialEnemyKind === 'waxSculptor') {
      this.bossBubble.show('고작… 실패작 주제에 내 걸작들의 상대가 되겠나?')
      await new Promise((r) => window.setTimeout(r, 2800))
      this.bossBubble.dismiss()
      await new Promise((r) => window.setTimeout(r, 300))
      await this.performSummonToBack()
    }

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
    if (!this.eventState || this.eventState.def.handGiftStep <= 0) return
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

  // ---- waxKnight 전용 카드 사용 메커니즘 ------------------------------------

  /** 레온하르트의 3턴 주기 행동: 기본 타격 + 랜덤 카드 2장 사용. */
  private async resolveWaxKnightCardTurn(bossCardId: string): Promise<void> {
    const state = this.eventState!
    const character = this.gs.character

    character.takeDamage(state.def.attack)
    await this.br.animateEnemyAttacks([
      { cardId: bossCardId, cardName: state.card.name, laneIndex: 0, damage: state.def.attack },
    ])
    await this.br.animateDamageFlash()
    this.inject.recordNotice(`레온하르트의 돌진! 플레이어가 ${state.def.attack} 피해를 받았다`, 'hurt')

    const cards = sampleWithoutReplacement<WaxKnightCardEffect>(['shield', 'heal', 'strike'], 2)
    for (const effect of cards) {
      if (effect === 'shield') {
        state.bossShield += 2
        await this.br.animateWaxKnightCardEffect(bossCardId, 'shield')
        this.inject.recordNotice('레온하르트가 카드 사용: 방패 +2', 'info')
      } else if (effect === 'heal') {
        const healed = state.card.healEnemyLike(2)
        await this.br.animateWaxKnightCardEffect(bossCardId, 'heal')
        this.inject.recordNotice(`레온하르트가 카드 사용: 체력 +${healed}`, 'info')
      } else {
        character.takeDamage(2)
        await this.br.animateWaxKnightCardEffect(bossCardId, 'strike')
        await this.br.animateDamageFlash()
        this.inject.recordNotice('레온하르트가 카드 사용: 플레이어에게 2 피해', 'hurt')
      }
      this.inject.render()
      if (!character.isAlive()) return
      await new Promise((r) => window.setTimeout(r, 180))
    }
  }

  // ---- waxSculptor 전용 페이즈 메커니즘 ------------------------------------

  /** 3턴 트리거 시 조각사를 후방으로 이동시키고 dist-0에 적을 소환한다. */
  private async handleSculptorPhaseShift(): Promise<void> {
    await this.performSummonToBack()
    this.inject.setInputLocked(false)
  }

  /** 레인 이동 + 적 소환 실체 — 인트로 연출과 3턴 트리거 양쪽에서 재사용. */
  private async performSummonToBack(): Promise<void> {
    const state = this.eventState!
    // front → back: dist-0+dist-1 → dist-1+dist-2, dist-0에 소환 적 배치
    for (let i = 0; i < 3; i++) {
      this.gs.lanes[i].setCardAtDistance(0, null)
      this.gs.lanes[i].setCardAtDistance(1, null)
    }
    for (let i = 0; i < 3; i++) {
      this.gs.lanes[i].setCardAtDistance(1, state.card)
      this.gs.lanes[i].setCardAtDistance(2, state.card)
    }
    state.sculptorPhase = 'back'
    state.sculptorStartRow = 1
    state.summonedEnemyIds.clear()

    // 각 레인에 후기 적 1마리씩 소환 (합산 금지 — 독립 인스턴스).
    // 이 적들은 컨트롤러가 직접 처리하므로 regroup/리필/턴 흐름을 타지 않는다.
    const pool = ENEMY_DEFINITIONS.slice(6, 12)
    for (let i = 0; i < 3; i++) {
      const enemyDef = pool[Math.floor(Math.random() * pool.length)]
      const enemy = new Card(
        `sculptor-summon-${i}-${Math.random()}`,
        CardType.ENEMY,
        enemyDef.name,
        enemyDef.description,
        enemyDef.healthOrDamage ?? 1,
        enemyDef.attack ?? 1,
        { enemySpriteId: enemyDef.enemySpriteId, enemyPower: enemyDef.enemyPower },
      )
      this.gs.lanes[i].setCardAtDistance(0, enemy)
      state.summonedEnemyIds.add(enemy.id)
    }

    this.inject.render()
    this.inject.recordNotice('밀랍 조각사가 후퇴하며 종복들을 소환했다!', 'hurt')
    // 좌→우 순서로 소환 연출 (enemyIds는 레인 0→1→2)
    const summonedIds = [...state.summonedEnemyIds]
    await this.br.animateSculptorSummonEnemies(summonedIds)
  }

  /** 후방 페이즈에 소환된 적 카드인지 식별. handleCardAction 라우팅에서 사용. */
  isSummonedEnemy(card: Card): boolean {
    return (
      this.eventState !== null &&
      this.eventState.sculptorPhase === 'back' &&
      this.eventState.summonedEnemyIds.has(card.id)
    )
  }

  /** 소환된 적 클릭 처리. 일반 턴 흐름(리필/상점/제단/합산)을 타지 않도록 컨트롤러가 직접 처리한다. */
  async handleSummonedEnemyClick(card: Card): Promise<void> {
    if (!this.eventState || !this.isSummonedEnemy(card)) return
    const state = this.eventState
    const character = this.gs.character
    this.inject.setInputLocked(true)

    // 플레이어 공격 + 데미지 적용
    await this.br.animatePlayerAttack(card)
    const tile = this.br.findCardElement(card.id)
    if (tile) SquareBurst.playOn(tile, 'damage', { count: 18, spread: 150, duration: 540 })
    const dealt = Math.min(character.damage, card.getHealth())
    card.takeDamage(dealt)
    await this.br.animateDamageNumbersById(dealt > 0 ? [{ cardId: card.id, amount: dealt }] : [])

    if (card.getHealth() <= 0) {
      await this.br.animateCardConsume(card)
      // 처치 보상: 손패 드롭 — lanes 제거 전에 실행해 트레일 출발점 DOM 유지
      const dropNames: string[] = []
      for (let k = 0; k < card.defeatDropCount; k++) {
        const drop = DropSystem.generateDrop()
        if (this.gs.character.addHandCard(drop)) dropNames.push(getHandCardDef(drop.defId).name)
      }
      if (dropNames.length > 0) {
        this.inject.render()  // 손패 슬롯 마운트 (카드는 아직 lanes에 있어 DOM 유지)
        this.inject.recordNotice(`${card.name} 처치! 손패: ${dropNames.join(', ')}`, 'win')
        await this.br.animateResourceTrailFromCard(card.id, 'hand', dropNames.length, 'hand-recovery')
      }
      // 트레일 완료 후 lanes·집합에서 제거
      for (let i = 0; i < 3; i++) {
        if (this.gs.lanes[i].getCardAtDistance(0) === card) this.gs.lanes[i].setCardAtDistance(0, null)
      }
      state.summonedEnemyIds.delete(card.id)
    }

    // 보스 턴 집계 — 불씨 감소 + 카운트다운 + HP 바 갱신
    state.turn += 1
    this.tm.tickEmberDecay()
    const remaining = state.def.attackInterval - (state.turn % state.def.attackInterval)
    const displayValue = remaining === state.def.attackInterval ? state.def.attackInterval : remaining
    this.br.setBossAttackCountdown(displayValue)
    this.inject.render()

    // 생존 소환 적 반격 — 일반 레일과 동일한 적 반격 타이밍으로 적용
    const aliveEnemies = this.getAliveSummonedCards()
    if (aliveEnemies.length > 0) {
      const hits = aliveEnemies.map((e, idx) => ({
        cardId: e.id, cardName: e.name, laneIndex: idx, damage: e.getDamage(),
      }))
      for (const e of aliveEnemies) character.takeDamage(e.getDamage())
      await this.br.animateEnemyAttacks(hits)
      await this.br.animateDamageFlash()
      const totalDmg = aliveEnemies.reduce((s, e) => s + e.getDamage(), 0)
      this.inject.recordNotice(`소환 적들의 반격! -${totalDmg}`, 'hurt')
      this.inject.render()
      if (!character.isAlive()) {
        await this.inject.handlePlayerDeath()
        return
      }
    }

    // 3턴 주기 도달 + 소환 적 생존 → 조각사가 후방에서 야비하게 돌진 타격
    if (state.turn % state.def.attackInterval === 0 && state.summonedEnemyIds.size > 0) {
      character.takeDamage(state.def.attack)
      await this.br.animateSculptorBackAttack(state.card.id)
      await this.br.animateDamageFlash()
      this.inject.recordNotice(`조각사가 후방에서 야비하게 강타! -${state.def.attack}`, 'hurt')
      this.inject.render()
      if (!character.isAlive()) {
        await this.inject.handlePlayerDeath()
        return
      }
    }

    if (state.summonedEnemyIds.size > 0) {
      this.inject.setInputLocked(false)
      return
    }
    await this.returnSculptorToFront()
  }

  /** 현재 dist-0에서 살아있는 소환 적 카드 목록 (레인 순서 유지) */
  private getAliveSummonedCards(): Card[] {
    if (!this.eventState) return []
    const { summonedEnemyIds } = this.eventState
    const result: Card[] = []
    for (let i = 0; i < 3; i++) {
      const c = this.gs.lanes[i].getCardAtDistance(0)
      if (c && summonedEnemyIds.has(c.id)) result.push(c)
    }
    return result
  }

  /** 소환 적 전멸 시 조각사를 전방(dist-0+1)으로 복귀시킨다. 쿵 착지 + 기절 블라스트 + 턴 초기화. */
  private async returnSculptorToFront(): Promise<void> {
    const state = this.eventState!
    // dist-1+2(후방) → dist-0+1(전방)으로 이동
    for (let i = 0; i < 3; i++) {
      this.gs.lanes[i].setCardAtDistance(1, null)
      this.gs.lanes[i].setCardAtDistance(2, null)
    }
    for (let i = 0; i < 3; i++) {
      this.gs.lanes[i].setCardAtDistance(0, state.card)
      this.gs.lanes[i].setCardAtDistance(1, state.card)
    }
    state.sculptorPhase = 'front'
    state.sculptorStartRow = 0
    this.inject.render()

    // 쿵 떨어지는 착지 + 기절하듯 사각 블라스트
    await this.br.playSculptorReturnAnimation(state.card.id)

    // 공격 카운트다운을 다시 3턴으로 초기화
    state.turn = 0
    this.br.setBossAttackCountdown(state.def.attackInterval)
    this.inject.recordNotice('밀랍 조각사가 다시 전방으로 내려왔다. 공격 주기 초기화!', 'info')
    this.inject.render()
    this.inject.setInputLocked(false)
  }

  private async handleDefeated(): Promise<void> {
    if (!this.eventState) return
    const state = this.eventState
    if (state.defeatTriggered) return
    state.defeatTriggered = true

    await this.br.playBossDefeatSequence(state.card.id)
    // 보스가 현재 실제로 점유 중인 행(startRow부터 occupiedDistRows)을 정리한다.
    const startRow = state.sculptorStartRow
    for (let row = startRow; row < startRow + state.def.occupiedDistRows; row++) {
      for (let i = 0; i < 3; i++) this.gs.lanes[i].setCardAtDistance(row, null)
    }
    // 후방 페이즈 중 격파된 경우 dist-0 소환 적도 제거
    if (state.def.specialEnemyKind === 'waxSculptor' && state.sculptorPhase === 'back') {
      for (let i = 0; i < 3; i++) this.gs.lanes[i].setCardAtDistance(0, null)
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
