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
import { spriteForEventBoss } from '@ui/Sprites'
import type { SpeechBubble } from '@ui/SpeechBubble'
import { playDialogueLine } from '@ui/DialoguePlayer'
import { getHandCardDef } from '@data/HandCards'
import type { HandCard } from '@entities/HandCard'
import { getRelicDef, RELIC_IDS, type RelicId } from '@data/Relics'
import { sampleWithoutReplacement } from '@core/Sampling'
import { ENEMY_DEFINITIONS } from '@systems/CardSpawner'

type WaxKnightCardEffect = 'shield' | 'heal' | 'strike'
type BossPage = 1 | 2 | 3

// ---- 보스별 스탯 정의 -------------------------------------------------------

export interface BossDef {
  /** 화면 표시 이름 */
  name: string
  maxHp: number
  attack: number
  attackInterval: number
  /** HP를 이 값만큼 잃을 때마다 플레이어에게 손패 1장 지급(30/60/90/100F 공통). */
  handGiftStep: number
  /** 보스 손패 효과(방패/체력/피해) 공통 수치. waxKnight/waxWitch가 사용한다. */
  handCardAmount: number
  /** CSS boss-kind-* 마커 — Rail CSS 레이아웃과 연동 */
  specialEnemyKind: 'waxArmy' | 'waxKnight' | 'waxSculptor' | 'waxWitch' | 'waxDemon'
  /** Card.groupCount 표시값 (점수·뱃지용). 실제 점유 행 수와 별도. */
  groupCount: number
  /** lanes에 보스 카드 인스턴스를 실제로 박을 dist 행 수.
   *  waxArmy(30F)는 CSS로 시각 확장하므로 dist 0에만 박아 1.
   *  waxSculptor(90F)는 실제 2행이므로 2. */
  occupiedDistRows: number
  /** 일러스트 URL */
  spriteUrl: string
  /** 보스 타일 등장 연출 선택자 */
  appearAnimation: 'landing' | 'waxKnightSwoop' | 'waxSculptor' | 'demonFire'
  /** 보스 대사 */
  introBubble: string
  playerResponseBubble: string
  /** 보스 말풍선 표시 후 대기 ms (등장+타자기+읽기 여유 합산) */
  introBubbleMs: number
  /** 플레이어 반응 말풍선 대기 ms */
  playerBubbleMs: number
  /** 인트로 오버레이에 표시되는 특징 문구. 줄바꿈을 넣으면 인트로 카드에서 3줄 목록으로 표시된다. */
  trait: string
  /** 인트로 오버레이 상단 수식어 */
  kicker: string
  /** 멀티라인 인트로 대사 — 지정 시 introBubble/playerResponseBubble 2줄 대신 순차 표시한다. */
  introSequence?: Array<{ speaker: 'boss' | 'player'; text: string; holdMs: number }>
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
  /** waxKnight/waxWitch 전용: 다음 피해를 먼저 흡수하는 밀랍 방패량 */
  bossShield: number
  /** waxWitch 전용: 현재 HP 페이지(210~141 / 140~71 / 70~0). */
  witchPage: BossPage
  /** waxWitch 1페이지: (미사용 — 공격주기 소각으로 전환됨) */
  nextWitchHandBurnAt: number
  /** waxDemon 현재 페이지 (1 → 2 전환은 HP 65% 이하 시). */
  demonPage: 1 | 2
  /** waxDemon 검은 양초 누적 피해 카운터 — 양초를 쓸 때마다 증가, 손패 black-candle 사용도 반영. */
  demonCandleCounter: number
  /** waxDemon 2페이지 전환 HP 임계값 (maxHp * 0.65 반올림). */
  nextDemonPageAt: number
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
  /** 체인 타임라인을 비우고 배너를 갱신 — 보스 보상 단계 진입 시 잔존 전투 체인 제거 */
  clearChainTimeline: () => void
  recordNotice: (msg: string, kind: 'info' | 'win' | 'hurt') => void
  /** 변칙 유물: 누적 피해 10마다 불씨 +1 (보스 피격 직후 호출) */
  applyAnomalyHealthLoss: () => void
  /** 플레이어가 적(보스/소환물)을 직접 공격할 때마다 발동하는 유물(훌륭한 대화수단 등) */
  applyPlayerAttackRelics: () => Promise<void>
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
    // 세계관: 양초 백작이 "내 저택"이라 부르는 곳은 본래 주인공 에나가 살던 집이다.
    // 플레이어의 격앙된 응답("네 저택이라고…?")이 이 빼앗긴 과거를 암시한다.
    const def: BossDef = {
      name: '양초 백작',
      maxHp: 45,
      attack: 3,
      attackInterval: 2,
      handGiftStep: 10,
      handCardAmount: 0,   // 30F는 전용 손패 효과를 쓰지 않는다(탐욕 살포로 대체).
      specialEnemyKind: 'waxArmy',
      groupCount: 3,
      occupiedDistRows: 1,   // CSS가 dist-0을 시각적으로 3행으로 확장, 데이터는 dist-0만
      spriteUrl: this.sprites.boss,
      appearAnimation: 'landing',
      introBubble: '내 저택에 온 것을 환영하네, 위태로운 불씨여',
      playerResponseBubble: '네 저택이라고…? 웃기시네!',
      // 등장(300ms) + 타자기(18자×70ms≈1260ms) + 읽기(2600ms)
      introBubbleMs: 4160,
      // 타자기(13자×70ms≈910ms) + 읽기(1800ms) + 퇴장(400ms)
      playerBubbleMs: 2800,
      trait: [
        '호화로운 탐욕을 선물한다 — 공격 주기마다 손패에 카드 2~4장을 흩뿌린다.',
        '그중 일부는 쓰면 자신을 다치게 하는 「탐욕의 동전」이다.',
      ].join('\n'),
      kicker: '탐욕의 대가',
    }
    await this.runBossEvent(def)
  }

  /** 60F 보스 이벤트 실행. 30F의 3×3 구조를 유지하되 전용 카드 사용 패턴을 적용한다. */
  async run60F(): Promise<void> {
    // 세계관: 불씨 기사단장의 정체는 기사왕 레온하르트로, 과거 주인공 에나(에나벨라)를
    // 섬기던 기사다. "에나벨라님을… 위하여…"라는 인트로와 이를 알아채는 플레이어
    // 응답으로만 그 정체를 암시한다.
    const def: BossDef = {
      name: '불씨 기사단장',
      maxHp: 60,
      attack: 5,
      attackInterval: 2,
      // 보스 체력 10 손실마다 손패 1장 지급(30/60/90/100F 공통).
      handGiftStep: 10,
      handCardAmount: 3,
      specialEnemyKind: 'waxKnight',
      groupCount: 3,
      occupiedDistRows: 1,   // 30F처럼 데이터는 dist-0 한 줄, CSS가 3×3 중앙 보스로 확장한다.
      spriteUrl: this.sprites.boss60,
      appearAnimation: 'waxKnightSwoop',
      introBubble: '에나벨라님을… 위하여…',
      // 플레이어만 숨은 정체(레온하르트)를 눈치채는 스토리 암시 대사다.
      playerResponseBubble: '설마... 레온하르트...?',
      // 등장 훙! 연출(780ms) + 타자기(11자×70ms≈770ms) + 읽기(2100ms)
      introBubbleMs: 3220,
      // 타자기(15자×70ms≈1050ms) + 읽기(1900ms) + 퇴장(400ms)
      playerBubbleMs: 3350,
      trait: '2턴마다 기사단장의 손패 2장 발동.',
      kicker: '저택의 방패',
    }
    await this.runBossEvent(def)
  }

  /** 90F 보스 이벤트 실행. closeShopAndResume 제단 EXIT 분기에서 호출한다. */
  async run90F(): Promise<void> {
    // 세계관: 밀랍 조각사는 스스로 만든 존재가 아니라 누군가에게 조각된 꼭두각시다.
    // 그를 빚어낸 조각가가 제피르였다는 사실이 추후 밝혀지며, 플레이어 응답
    // ("제피르의 꼭두각시")이 그 복선을 미리 깐다.
    const def: BossDef = {
      name: '밀랍 조각사',
      maxHp: 100,
      attack: 7,
      attackInterval: 3,
      // 보스 체력 10 손실마다 손패 1장 지급(30/60/90/100F 공통).
      handGiftStep: 10,
      handCardAmount: 0,   // 조각사는 전용 손패 효과를 쓰지 않는다.
      specialEnemyKind: 'waxSculptor',
      groupCount: 2,
      occupiedDistRows: 2,   // dist-0 + dist-1 두 행에 실제로 카드 박음
      spriteUrl: this.sprites.boss90,
      appearAnimation: 'waxSculptor',
      introBubble: '분명히 넌… 실패작이었는데?',
      playerResponseBubble: '드디어 만났다, 제피르의 꼭두각시.',
      // 등장(300ms) + 타자기(13자×70ms≈910ms) + 읽기(1800ms)
      introBubbleMs: 3010,
      // 타자기(16자×70ms≈1120ms) + 읽기(2000ms)
      playerBubbleMs: 3050,
      trait: '3턴마다 밀랍을 조각해 양초를 소환하고 몸을 숨깁니다.',
      kicker: '광기의 예술가',
    }
    await this.runBossEvent(def)
  }


  /** 100F 보스 이벤트 실행. 최종 등반의 별빛 규칙이 100층에 닿으면 호출한다. */
  async run100F(): Promise<void> {
    // 최종 보스는 앞선 30/60/90F 보스 메커니즘을 페이지별로 압축해 재사용한다.
    // 3×3 타일은 양초 백작과 같은 CSS 확장 규칙을 쓰고, 3페이지에서만 2×3 후방 대기형으로 변한다.
    const def: BossDef = {
      name: '녹지 않는 마녀',
      maxHp: 210,
      attack: 15,
      attackInterval: 2,
      // 보스 체력 10 손실마다 손패 1장 지급(30/60/90/100F 공통).
      handGiftStep: 10,
      handCardAmount: 5,
      specialEnemyKind: 'waxWitch',
      groupCount: 3,
      occupiedDistRows: 1,
      spriteUrl: this.sprites.boss100,
      appearAnimation: 'landing',
      introBubble: '. . .',
      playerResponseBubble: '이제 다 끝났어.',
      // 각 점 사이 침묵을 길게 읽히게 하기 위해 일반 타자기 시간보다 넉넉히 둔다.
      introBubbleMs: 3600,
      playerBubbleMs: 2500,
      trait: [
        '첫 번째 : 체력을 10 잃을 때마다 플레이어의 손패 2장을 불태움.',
        '두 번째 : 공격 주기마다 손패 4장을 펼치고, 겹친 손패가 있다면 추가 카드를 사용함.',
        '세 번째 : 광폭화된 양초 적들을 소환함.',
      ].join('\n'),
      kicker: '잿빛 굴레의 주인',
    }
    await this.runBossEvent(def)
  }

  /** 악마 소환 레시피 발동 시 이벤트 보스 전투 — index.ts가 커튼을 닫은 뒤 호출한다. */
  async runDemonSummon(): Promise<void> {
    const turnCount = this.gs.getCurrentTurn()
    const maxHp = 100 + turnCount
    const attack = 3 + Math.floor(turnCount / 10)
    const spriteUrl = spriteForEventBoss('eventboss_001') ?? this.sprites.boss
    const def: BossDef = {
      name: '검은 양초 악마',
      maxHp,
      attack,
      attackInterval: 2,
      handGiftStep: 10,
      handCardAmount: 0,
      specialEnemyKind: 'waxDemon',
      groupCount: 3,
      occupiedDistRows: 1,
      spriteUrl,
      appearAnimation: 'demonFire',
      // introSequence가 있으므로 아래 두 필드는 인트로 오버레이 카드에만 쓰인다.
      introBubble: '현실을 직면해라, 그리고 진실 앞에 녹아내려라.',
      playerResponseBubble: '네 놈은. . . 정체가 뭐야?',
      introBubbleMs: 2400,
      playerBubbleMs: 2200,
      trait: [
        '첫 번째 : 점차 강해지는 검은 양초 1~3장 랜덤 사용.',
        '두 번째 : 검은 양초 + 거짓과 진실.',
      ].join('\n'),
      kicker: '어둠의 속삭임',
      introSequence: [
        { speaker: 'boss',   text: '결국 . . .',                                        holdMs: 2000 },
        { speaker: 'boss',   text: '문을 열었군. . .',                                   holdMs: 2200 },
        { speaker: 'boss',   text: '달콤한 꿈 속에 빠져서 녹았다면 편했을 것을. . .', holdMs: 3400 },
        { speaker: 'player', text: '네 놈은. . . 정체가 뭐야?',                          holdMs: 2400 },
        { speaker: 'boss',   text: '지금처럼 진실, 그 너머를 갈망한다면. . .',           holdMs: 3000 },
        { speaker: 'player', text: '. . . 뭐?',                                         holdMs: 1600 },
        { speaker: 'boss',   text: '마녀가 남긴 미처 끄지 못한 잔불이여.',              holdMs: 2800 },
        { speaker: 'boss',   text: '현실을 직면해라, 그리고 진실 앞에 녹아내려라.',     holdMs: 3200 },
      ],
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
    const beforeBossHp = card.getHealth()
    const rawDamage = Math.min(character.damage, card.getHealth() + state.bossShield)
    const blocked = Math.min(state.bossShield, rawDamage)
    state.bossShield -= blocked
    this.syncBossShieldToCard()
    // 페이지 경계 초과 피해는 깎기 전에 버린다 — HP바가 경계 아래로 내려갔다 복구되며 깜빡이지 않게 한다.
    const pageFloor = this.waxWitchPageFloor()
    const dealt = pageFloor > 0
      ? Math.min(rawDamage - blocked, Math.max(0, card.getHealth() - pageFloor))
      : Math.min(rawDamage - blocked, card.getHealth())
    if (dealt > 0) card.takeDamage(dealt)
    if (blocked > 0) this.inject.recordNotice(`밀랍 방패가 피해 ${blocked}를 막았다`, 'info')
    state.turn += 1
    this.tm.tickEmberDecay()

    // 카운터: 0이면 이번 턴에 반격 — 0을 잠깐 보여 준 뒤 공격한다.
    const turnMod = state.turn % state.def.attackInterval
    const displayValue = turnMod === 0 ? 0 : state.def.attackInterval - turnMod
    this.br.setBossAttackCountdown(displayValue)
    if (turnMod === 0) {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 220))
    }
    await this.br.animateDamageNumbersById(dealt > 0 ? [{ cardId: card.id, amount: dealt }] : [])
    // 플레이어가 보스를 직접 공격했으므로 공격 시 발동 유물(훌륭한 대화수단)을 판정한다.
    await this.inject.applyPlayerAttackRelics()

    await this.consumeHandGiftThresholds(card.id)
    if (await this.resolveWaxWitchAfterDamage(beforeBossHp)) return
    if (await this.resolveDemonAfterDamage(beforeBossHp)) return
    this.inject.render()

    if (card.getHealth() <= 0) {
      await this.handleDefeated()
      return
    }

    if (turnMod === 0) {
      if (state.def.specialEnemyKind === 'waxWitch') {
        // 100F 페이지 능력은 해금 뒤 사라지지 않는다.
        if (state.witchPage === 1) {
          // 1페이지: 공격주기마다 손패 2장 소각
          await this.burnRandomHandCardsFromWitch(card.id, 2)
        }
        if (state.witchPage >= 2) {
          if (await this.resolveWaxWitchPageTwoTurn(card.id)) return
          if (!this.gs.character.isAlive() || this.gs.character.authoritySurvivePending) {
            await this.inject.handlePlayerDeath()
            return
          }
          if (state.witchPage === 3) {
            await this.performWitchSummonToBack()
          }
          this.inject.setInputLocked(false)
          return
        }
      } else if (state.def.specialEnemyKind === 'waxSculptor') {
        await this.handleSculptorPhaseShift()
        return
      } else if (state.def.specialEnemyKind === 'waxDemon') {
        // 1P: 검은 양초만 / 2P: 검은 양초 + 거짓/진실
        if (await this.resolveDemonCandleTurn(card.id)) return
        if (state.demonPage >= 2) {
          if (await this.resolveDemonTruthLieTurn(card.id)) return
          if (!character.isAlive() || character.authoritySurvivePending) {
            await this.inject.handlePlayerDeath(); return
          }
        }
        character.takeDamage(card.getDamage())
        await this.br.animateEnemyAttacks([
          { cardId: card.id, cardName: card.name, laneIndex: 0, damage: card.getDamage() },
        ])
        await this.br.animatePlayerDamageImpact(card.getDamage())
        this.inject.recordNotice(`검은 양초 악마의 강타! 플레이어가 ${card.getDamage()} 피해를 받았다`, 'hurt')
        this.inject.render()
        this.inject.applyAnomalyHealthLoss()
        if (await this.retaliateGracefulResponse([card.id])) return
        if (!character.isAlive() || character.authoritySurvivePending) {
          await this.inject.handlePlayerDeath(); return
        }
        this.br.setBossAttackCountdown(state.def.attackInterval)
        this.inject.setInputLocked(false)
        return
      }
      if (state.def.specialEnemyKind === 'waxKnight') {
        // 불씨 기사단장은 특징(손패 2장) 연출 후 기본 타격 순으로 행동한다.
        if (await this.resolveWaxKnightCardTurn(card.id)) return
      } else {
        // 30F 양초 백작: 특징 연출(탐욕의 손패 살포)을 먼저 보여준 뒤 보스가 타격한다.
        if (state.def.specialEnemyKind === 'waxArmy') {
          await this.scatterGreedCards(card.id)
        }
        character.takeDamage(card.getDamage())
        await this.br.animateEnemyAttacks([
          { cardId: card.id, cardName: card.name, laneIndex: 0, damage: card.getDamage() },
        ])
        await this.br.animatePlayerDamageImpact(card.getDamage())
        this.inject.recordNotice(`보스 반격! 플레이어가 ${card.getDamage()} 피해를 받았다`, 'hurt')
        this.inject.render()
        this.inject.applyAnomalyHealthLoss()
        // 품격있는 대처: 보스의 반격에 되받아친다.
        if (await this.retaliateGracefulResponse([card.id])) return
      }
      if (!this.gs.character.isAlive() || this.gs.character.authoritySurvivePending) {
        await this.inject.handlePlayerDeath()
        return
      }
    }

    // 반격이 끝났으면 카운터를 다음 주기 초기값으로 복구한다.
    if (turnMod === 0) {
      this.br.setBossAttackCountdown(state.def.attackInterval)
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
    if (await this.resolveWaxWitchAfterDamage(null)) return
    if (await this.resolveDemonAfterDamage(null)) return
    if (this.eventState.card.getHealth() <= 0) {
      await this.handleDefeated()
      return
    }
    // 손패로 소환 적을 처치했을 수 있으니, 후방 페이즈면 잔존 여부를 재집계한다.
    if (this.eventState.sculptorPhase === 'back') {
      await this.reconcileSummonedEnemiesAfterHand()
    }
  }

  /** 레바테인 손패 전용: 보스 공격 주기 카운터를 n 증가시키고, 주기 도달마다 보스 행동을 즉시 실행한다.
   *  실제 런 턴 카운터(GameState.turn)는 건드리지 않는다. inputLocked은 호출부가 관리한다. */
  async advanceBossTurnsForLevatein(n: number): Promise<void> {
    if (!this.eventState) return
    const state = this.eventState
    const character = this.gs.character

    for (let i = 0; i < n; i++) {
      if (state.defeatTriggered || !character.isAlive()) break

      state.turn += 1
      this.tm.tickEmberDecay()
      const lvTurnMod = state.turn % state.def.attackInterval
      const lvDisplayValue = lvTurnMod === 0 ? 0 : state.def.attackInterval - lvTurnMod
      this.br.setBossAttackCountdown(lvDisplayValue)
      if (lvTurnMod === 0) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, 220))
      }

      // HP 10 손실 보상 손패 지급
      await this.consumeHandGiftThresholds(state.card.id)
      if (state.card.getHealth() <= 0) { await this.handleDefeated(); return }

      if (lvTurnMod === 0) {
        if (state.def.specialEnemyKind === 'waxArmy') {
          // 탐욕 살포 → 플레이어 타격
          await this.scatterGreedCards(state.card.id)
          const dmg = state.card.getDamage()
          character.takeDamage(dmg)
          await this.br.animateEnemyAttacks([{ cardId: state.card.id, cardName: state.card.name, laneIndex: 0, damage: dmg }])
          await this.br.animatePlayerDamageImpact(dmg)
          this.inject.recordNotice(`레바테인: 보스 반격 — 피해 ${dmg}`, 'hurt')
          this.inject.render()
          this.inject.applyAnomalyHealthLoss()
        } else if (state.def.specialEnemyKind === 'waxKnight') {
          if (await this.resolveWaxKnightCardTurn(state.card.id)) return
        } else if (state.def.specialEnemyKind === 'waxSculptor') {
          // handleSculptorPhaseShift 대신 내부 로직만 호출 (setInputLocked는 호출부가 관리)
          await this.performSummonToBack()
        } else if (state.def.specialEnemyKind === 'waxWitch') {
          if (state.witchPage >= 2) {
            if (await this.resolveWaxWitchPageTwoTurn(state.card.id)) return
          } else {
            const dmg = state.def.attack
            character.takeDamage(dmg)
            await this.br.animateEnemyAttacks([{ cardId: state.card.id, cardName: state.card.name, laneIndex: 0, damage: dmg }])
            await this.br.animatePlayerDamageImpact(dmg)
            this.inject.recordNotice(`레바테인: 보스 반격 — 피해 ${dmg}`, 'hurt')
            this.inject.render()
            this.inject.applyAnomalyHealthLoss()
          }
        } else if (state.def.specialEnemyKind === 'waxDemon') {
          if (await this.resolveDemonCandleTurn(state.card.id)) return
          if (state.demonPage >= 2) {
            if (await this.resolveDemonTruthLieTurn(state.card.id)) return
            if (!character.isAlive() || character.authoritySurvivePending) {
              await this.inject.handlePlayerDeath(); return
            }
          }
          const dmg = state.card.getDamage()
          character.takeDamage(dmg)
          await this.br.animateEnemyAttacks([{ cardId: state.card.id, cardName: state.card.name, laneIndex: 0, damage: dmg }])
          await this.br.animatePlayerDamageImpact(dmg)
          this.inject.recordNotice(`레바테인: 검은 양초 악마 반격 — 피해 ${dmg}`, 'hurt')
          this.inject.render()
          this.inject.applyAnomalyHealthLoss()
        }

        if (!character.isAlive() || character.authoritySurvivePending) {
          await this.inject.handlePlayerDeath()
          return
        }
        this.br.setBossAttackCountdown(state.def.attackInterval)
      }

      this.inject.render()
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
      const amount = 1 + Math.floor(Math.random() * 5)
      for (let i = 0; i < amount; i++) {
        // 현상금은 한 덩어리 합산이 아니라 코인 트레일 1개가 닿을 때마다
        // 지갑을 +1씩 굴려 “띠리리릭” 증가 리듬이 보이게 한다.
        await this.br.animateResourceTrailFromCard(card.id, 'coin', 1, 'treasure-gain')
        this.inject.addOneCoin()
        await new Promise((r) => window.setTimeout(r, 70))
      }
      this.inject.recordNotice(`현상금: +$${amount}`, 'info')
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
        this.inject.render()
      } else {
        this.inject.recordNotice('전리품: 획득 가능한 유물이 없다', 'info')
      }
      await this.br.animateResourceTrailFromCard(card.id, 'relic', 1, 'treasure-gain')
    } else if (card.id === 'boss-reward-demon-relic') {
      // 이벤트 보스 전용: 악마 인형 유물 고정 지급 (이미 보유 중이면 건너뜀)
      const relicId: RelicId = 'demon-doll'
      if (!character.hasRelic(relicId) && !character.bannedRelics.includes(relicId)) {
        character.addRelic(relicId)
        this.inject.recordNotice(`${getRelicDef(relicId).name} 획득`, 'win')
        await this.inject.applyRelicPurchaseEffect(relicId)
        this.inject.render()
      } else {
        this.inject.recordNotice('악마 인형: 이미 보유 중', 'info')
      }
      await this.br.animateResourceTrailFromCard(card.id, 'relic', 1, 'demon-vortex')
    } else if (card.id === 'boss-reward-demon-hand') {
      // 손패가 가득 차면 마지막 칸을 소각하고 검은 양초를 추가한다.
      if (!character.hasHandRoom()) {
        await this.br.animateHandCardBurn(character.hand.length - 1)
        character.removeHandCardAt(character.hand.length - 1)
      }
      character.addHandCard(DropSystem.makeCard('black-candle'))
      this.inject.recordNotice('검은 양초 획득', 'win')
      this.inject.render()
      await this.br.animateResourceTrailFromCard(card.id, 'hand', 1, 'demon-vortex')
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

  /** 보스/플레이어 대사 한 줄. DialoguePlayer 공통 클릭-스킵 로직 사용. */
  private async playIntroLine(speaker: 'boss' | 'player', text: string, holdMs: number): Promise<void> {
    const bubble = speaker === 'boss' ? this.bossBubble : this.speechBubble
    const other  = speaker === 'boss' ? this.speechBubble : this.bossBubble
    await playDialogueLine(bubble, other, text, holdMs, 260)
  }

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
      def.name,   // 보스 카드 description은 화면에 노출되지 않아 이름으로 채운다(과거 flavor 제거).
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
      witchPage: 1,
      nextWitchHandBurnAt: 0, // 체력 임계 소각 로직 제거 — 공격주기마다 소각으로 전환
      demonPage: 1,
      demonCandleCounter: 0,
      nextDemonPageAt: def.specialEnemyKind === 'waxDemon'
        ? Math.ceil(def.maxHp * 0.65)  // HP 65% 이하에서 2페이지 전환
        : 0,
    }
    this.syncBossShieldToCard()

    this.tm.setTurnMode('boss_phase')
    this.gs.bossBattleActive = true
    this.br.setBossAttackCountdown(def.attackInterval)

    // 등장 연출
    this.inject.render()
    if (def.appearAnimation === 'waxSculptor') {
      await this.br.playWaxSculptorAppearAnimation(bossCard.id)
    } else if (def.appearAnimation === 'waxKnightSwoop') {
      await this.br.playWaxKnightSwoopAnimation(bossCard.id)
    } else if (def.appearAnimation !== 'demonFire') {
      // demonFire는 커튼 이후 별도 블록에서 elevateBoardAboveCurtain + 화염 폭발로 등장한다.
      await this.br.playBossLandingAnimation(bossCard.id)
    }
    // demonFire: 커튼 위로 보스가 순차 성장(크기→선명도) 등장. 커튼은 절대 걷히지 않는다.
    if (def.appearAnimation === 'demonFire') {
      await this.br.playDemonFireAppearAnimation(bossCard.id)
    }

    // 보스 대사 — introSequence가 있으면 멀티라인 클릭-스킵 순차 표시, 없으면 기존 2줄.
    if (def.introSequence && def.introSequence.length > 0) {
      for (const line of def.introSequence) {
        await this.playIntroLine(line.speaker, line.text, line.holdMs)
      }
      await new Promise((r) => window.setTimeout(r, 160))
    } else {
      await this.playIntroLine('boss',   def.introBubble,          def.introBubbleMs)
      await this.playIntroLine('player', def.playerResponseBubble, def.playerBubbleMs)
    }

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
      await this.playIntroLine('boss', '고작… 실패작 주제에 내 걸작들의 상대가 되겠나?', 2800)
      await this.performSummonToBack()
    }

    this.inject.setInputLocked(false)

    // 격파 대기
    await new Promise<void>((resolve) => {
      this.eventState!.defeated = resolve
    })

    this.inject.recordNotice('보스 처치! 레일 보상이 떨어진다', 'win')
    const bossKind = this.eventState!.def.specialEnemyKind
    this.eventState = null
    await this.stageBossRewardChests(savedField, bossKind)

    this.tm.setTurnMode('normal_turn')
    await this.inject.openTrialOverlayForced()

    // 악마 소환 커튼: 보스전 완전히 끝난 뒤 제거하고 보드 z-index 복원.
    if (def.appearAnimation === 'demonFire') {
      this.br.removeDemonCurtain()
    }

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
    // generateDrop은 런 해금 풀 + dropSource 필터를 모두 거치므로 보물 전용 카드(동전)가
    // 보스 손패 지급으로 새지 않는다. 일반 적 처치 드롭과 같은 풀을 공유한다.
    const drop = DropSystem.generateDrop('enemy-kill')
    const accepted = character.addHandCard(drop)
    if (!accepted) {
      this.inject.recordNotice('보스 피해 보상: 손패가 가득 차 카드를 받지 못했다', 'info')
      return
    }
    this.inject.recordNotice(`보스 피해 보상: 손패 ${getHandCardDef(drop.defId).name} 획득`, 'info')
    this.inject.render()
    await this.br.animateResourceTrailFromCard(bossCardId, 'hand', 1, 'hand-recovery')
  }

  /** 30F 양초 백작 특징: 공격 주기마다 손패에 카드 2~4장을 흩뿌린다.
   *  2장=탐욕동전1+랜덤1, 3장=탐욕동전1~2+랜덤(합3), 4장=탐욕동전2+랜덤2.
   *  탐욕의 동전은 쓰면 자신을 다치게 하는 찌꺼기 카드라 손패를 갉아먹는다. */
  private async scatterGreedCards(bossCardId: string): Promise<void> {
    const character = this.gs.character
    const count = 2 + Math.floor(Math.random() * 3) // 2~4
    let greedCount: number
    if (count === 2) greedCount = 1
    else if (count === 4) greedCount = 2
    else greedCount = 1 + Math.floor(Math.random() * 2) // 3장은 탐욕동전 1 또는 2
    const randomCount = count - greedCount

    const cards: HandCard[] = []
    for (let i = 0; i < greedCount; i++) cards.push(DropSystem.makeCard('greed-coin'))
    for (let i = 0; i < randomCount; i++) cards.push(DropSystem.generateDrop('enemy-kill'))
    // 탐욕 동전이 항상 같은 자리에 몰리지 않도록 순서를 섞는다.
    for (let i = cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[cards[i], cards[j]] = [cards[j], cards[i]]
    }

    const addedUids: string[] = []
    for (const c of cards) {
      if (character.addHandCard(c)) addedUids.push(c.uid)
    }
    if (addedUids.length === 0) {
      this.inject.recordNotice('양초 백작이 탐욕을 뿌렸지만 손패가 가득 차 있었다', 'info')
      return
    }
    this.inject.render()
    const slotIndices = addedUids
      .map((uid) => character.hand.findIndex((h) => h?.uid === uid))
      .filter((idx) => idx >= 0)
    const greedAdded = addedUids.filter((uid) => uid.startsWith('greed-coin')).length
    this.inject.recordNotice(
      `양초 백작이 호화로운 탐욕을 뿌렸다 — 손패 ${addedUids.length}장(탐욕의 동전 ${greedAdded})`,
      'hurt'
    )
    await this.br.animateBossScatterToHandSlots(bossCardId, slotIndices)
  }
  /** 보스 페이지 HP 하한 — 경계를 넘는 피해를 깎기 전에 버려 HP바가 깜빡이지 않게 한다.
   *  waxWitch: 1P→140, 2P→70, 3P→0. waxDemon: 1P→nextDemonPageAt, 2P→0. */
  private waxWitchPageFloor(): number {
    const state = this.eventState
    if (!state) return 0
    if (state.def.specialEnemyKind === 'waxWitch') {
      if (state.witchPage === 1) return 140
      if (state.witchPage === 2) return 70
      return 0
    }
    if (state.def.specialEnemyKind === 'waxDemon' && state.demonPage === 1) {
      return state.nextDemonPageAt
    }
    return 0
  }

  /** 손패/조합 등 외부 피해가 페이지 경계를 넘어 보스 HP를 깎았을 때, UI diff가 읽기 전에 하한으로 되돌린다. */
  clampWaxWitchExternalDamageToPageFloor(): void {
    const floor = this.waxWitchPageFloor()
    if (floor > 0 && this.eventState && this.eventState.card.health < floor) {
      this.eventState.card.health = floor
    }
  }

  /** waxKnight 방패량을 Card에 복사해 렌더러가 플레이어와 같은 방패 칩을 그리게 한다. */
  private syncBossShieldToCard(): void {
    if (!this.eventState) return
    this.eventState.card.bossShield = Math.max(0, this.eventState.bossShield)
  }

  /** 손패/레시피처럼 외부 시스템이 보스 HP를 직접 깎은 뒤, waxKnight 방패로 피해를 되돌린다. */
  absorbExternalBossDamageWithShield(beforeHealth: number): number {
    if (!this.eventState || this.eventState.bossShield <= 0) return 0
    const state = this.eventState
    const damage = Math.max(0, beforeHealth - state.card.getHealth())
    if (damage <= 0) return 0
    const blocked = Math.min(state.bossShield, damage)
    state.bossShield -= blocked
    this.syncBossShieldToCard()
    state.card.healEnemyLike(blocked)
    this.inject.recordNotice(`밀랍 방패가 손패 피해 ${blocked}를 막았다`, 'info')
    return blocked
  }


  // ---- waxWitch 전용 페이지 메커니즘 ----------------------------------------

  /** 100F 1페이지: 공격주기마다(또는 2페이지 이상 손패 콤보 도중) 손패를 소각한다.
   *  카드는 흔들→회색→검게 타며 동시에 사라진다. */
  private async burnRandomHandCardsFromWitch(bossCardId: string, requestedCount: number): Promise<void> {
    const hand = this.gs.character.hand
    if (hand.length === 0) {
      this.inject.recordNotice('녹지 않는 마녀의 잿불이 빈 손패를 훑고 지나갔다', 'info')
      return
    }
    const count = Math.min(requestedCount, hand.length)
    if (count <= 0) return
    // 내림차순 인덱스: 애니메이션 뒤 한꺼번에 제거해도 남은 인덱스가 밀리지 않는다.
    const indices = sampleWithoutReplacement(
      Array.from({ length: hand.length }, (_, i) => i),
      count,
    ).sort((a, b) => b - a)
    const names = indices.map((i) => getHandCardDef(hand[i].defId).name)

    // 개수만큼 블라스트 + 소각 애니메이션을 동시에 재생한 뒤 카드를 한 번에 제거한다.
    await Promise.all(indices.map((slotIndex) =>
      this.br.animateBossBlastToHandSlot(bossCardId, slotIndex, 'boss-ember-spark')
    ))
    for (const slotIndex of indices) this.gs.character.removeHandCardAt(slotIndex)
    this.inject.recordNotice(`잿빛 소각: ${names.join(', ')} 손패 소실`, 'hurt')
    this.inject.render()
  }

  /** 100F 피격 뒤 페이지 전환을 처리한다. 전환 연출이 끼면 true로 턴을 종료한다. */
  private async resolveWaxWitchAfterDamage(beforeHp: number | null): Promise<boolean> {
    const state = this.eventState
    if (!state || state.def.specialEnemyKind !== 'waxWitch') return false
    const hp = state.card.getHealth()

    if (state.witchPage === 1) {
      if (hp <= 140) {
        // 페이지 경계는 초과 피해를 버리고 정확히 140에서 멈춘다.
        if (state.card.health < 140) state.card.health = 140
        state.witchPage = 2
        state.turn = 0
        this.br.setBossAttackCountdown(state.def.attackInterval)
        this.inject.render()
        await this.playIntroLine('boss',   '그래, 정말 이 세계는 이제 다 끝났네.', 3100)
        await this.playIntroLine('player', '같잖은 말장난을...', 2500)
        this.inject.setInputLocked(false)
        return true
      }
    }

    if (state.witchPage === 2 && hp <= 70) {
      // 페이지 경계는 초과 피해를 버리고 정확히 70에서 멈춘 뒤 즉시 3페이지 소환을 연다.
      if (state.card.health < 70) state.card.health = 70
      state.witchPage = 3
      state.turn = 0
      this.br.setBossAttackCountdown(state.def.attackInterval)
      this.inject.render()
      await this.playIntroLine('boss',   '이제 너도 그만 사라져.', 2500)
      await this.playIntroLine('player', '. . .', 3300)
      await this.performWitchSummonToBack()
      this.inject.setInputLocked(false)
      return true
    }

    return beforeHp !== null && beforeHp !== hp && false
  }

  /** 100F 2페이지: 보스 손패 4장을 공격 전에 사용하고, 같은 효과 2장 이상이면 추가 1회 발동한다. */
  private async resolveWaxWitchPageTwoTurn(bossCardId: string): Promise<boolean> {
    const state = this.eventState!
    const character = this.gs.character
    const amount = state.def.handCardAmount
    const effects: WaxKnightCardEffect[] = Array.from({ length: 4 }, () => {
      const pool: WaxKnightCardEffect[] = ['shield', 'heal', 'strike']
      return pool[Math.floor(Math.random() * pool.length)]
    })
    const bonusEffects = (['shield', 'heal', 'strike'] as WaxKnightCardEffect[])
      .filter((effect) => effects.filter((v) => v === effect).length >= 2)
    const applyWitchCardEffect = async (effect: WaxKnightCardEffect): Promise<void> => {
      if (effect === 'shield') {
        state.bossShield += amount
        this.syncBossShieldToCard()
        this.inject.recordNotice(`녹지 않는 마녀가 손패 사용: 방패 +${amount}`, 'info')
      } else if (effect === 'heal') {
        // 페이지 경계는 최초 하향 돌파 이벤트만 막고, 회복은 현재 페이지를 되돌리지 않는다.
        const healed = state.card.healEnemyLike(amount)
        this.inject.recordNotice(`녹지 않는 마녀가 손패 사용: 체력 +${healed}`, 'info')
      } else {
        character.takeDamage(amount)
        await this.br.animatePlayerDamageImpact(amount)
        this.inject.recordNotice(`녹지 않는 마녀가 손패 사용: 플레이어에게 ${amount} 피해`, 'hurt')
      }
      this.inject.render()
    }

    await this.br.animateBossHandCombo(bossCardId, effects, bonusEffects, amount, applyWitchCardEffect)
    if (!character.isAlive() || character.authoritySurvivePending) return false

    character.takeDamage(state.def.attack)
    await this.br.animateEnemyAttacks([
      { cardId: bossCardId, cardName: state.card.name, laneIndex: 0, damage: state.def.attack },
    ])
    await this.br.animatePlayerDamageImpact(state.def.attack)
    this.inject.recordNotice(`녹지 않는 마녀의 반격! 플레이어가 ${state.def.attack} 피해를 받았다`, 'hurt')
    this.inject.render()
    this.inject.applyAnomalyHealthLoss()
    return await this.retaliateGracefulResponse([bossCardId])
  }

  // ---- waxKnight 전용 카드 사용 메커니즘 ------------------------------------

  /** 불씨 기사단장의 주기 행동: 특징(손패 2장 발동)을 먼저 연출한 뒤 기본 타격.
   *  품격있는 대처 반격으로 보스가 쓰러지면 true를 반환한다. */
  private async resolveWaxKnightCardTurn(bossCardId: string): Promise<boolean> {
    const state = this.eventState!
    const character = this.gs.character

    // 1) 특징 연출: 손패 2장을 한 번에 펼쳐 빠르게 순차 발동한다(이펙트 목적지는 살아 있는 보스 셀 기준).
    const cards = sampleWithoutReplacement<WaxKnightCardEffect>(['shield', 'heal', 'strike'], 2)
    const amount = state.def.handCardAmount
    const applyKnightCardEffect = async (effect: WaxKnightCardEffect): Promise<void> => {
      if (effect === 'shield') {
        state.bossShield += amount
        this.syncBossShieldToCard()
        this.inject.recordNotice(`불씨 기사단장이 손패 사용: 방패 +${amount}`, 'info')
      } else if (effect === 'heal') {
        const healed = state.card.healEnemyLike(amount)
        this.inject.recordNotice(`불씨 기사단장이 손패 사용: 체력 +${healed}`, 'info')
      } else {
        character.takeDamage(amount)
        await this.br.animatePlayerDamageImpact(amount)
        this.inject.recordNotice(`불씨 기사단장이 손패 사용: 플레이어에게 ${amount} 피해`, 'hurt')
      }
      this.inject.render()
    }
    await this.br.animateBossHandCombo(bossCardId, cards, [], amount, applyKnightCardEffect)
    if (!character.isAlive() || character.authoritySurvivePending) return false

    // 2) 특징 연출이 끝난 뒤 보스가 플레이어를 타격한다.
    character.takeDamage(state.def.attack)
    await this.br.animateEnemyAttacks([
      { cardId: bossCardId, cardName: state.card.name, laneIndex: 0, damage: state.def.attack },
    ])
    await this.br.animatePlayerDamageImpact(state.def.attack)
    this.inject.recordNotice(`불씨 기사단장의 돌진! 플레이어가 ${state.def.attack} 피해를 받았다`, 'hurt')
    if (!character.isAlive() || character.authoritySurvivePending) return false

    // 변칙: 기사단장 한 턴에 잃은 체력 10마다 불씨 +1.
    this.inject.applyAnomalyHealthLoss()
    // 품격있는 대처: 기사단장의 한 턴 타격에 한 번 되받아친다.
    return await this.retaliateGracefulResponse([bossCardId])
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
    // 90F 보스답게 60~90층대 적 풀(인덱스 12~17: 풍뎅이/전갈/담비/오소리/나무늘보/자칼)에서 소환한다.
    const pool = ENEMY_DEFINITIONS.slice(12, 18)
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


  /** 100F 3페이지 전용 소환: 3×3 마녀를 후방 2×3으로 접고, 강화된 소환 적 3마리를 세운다. */
  private async performWitchSummonToBack(): Promise<void> {
    const state = this.eventState!
    for (let i = 0; i < 3; i++) {
      this.gs.lanes[i].setCardAtDistance(0, null)
      this.gs.lanes[i].setCardAtDistance(1, null)
      this.gs.lanes[i].setCardAtDistance(2, null)
    }
    for (let i = 0; i < 3; i++) {
      this.gs.lanes[i].setCardAtDistance(1, state.card)
      this.gs.lanes[i].setCardAtDistance(2, state.card)
    }
    state.def.occupiedDistRows = 2
    state.sculptorPhase = 'back'
    state.sculptorStartRow = 1
    state.summonedEnemyIds.clear()

    // 최종 보스 소환수는 90F 후기 적 풀을 기반으로 HP+10/ATK+3 버프를 받은 독립 개체다.
    const pool = ENEMY_DEFINITIONS.slice(12, 18)
    for (let i = 0; i < 3; i++) {
      const enemyDef = pool[Math.floor(Math.random() * pool.length)]
      const enemy = new Card(
        `witch-summon-${i}-${Math.random()}`,
        CardType.ENEMY,
        enemyDef.name,
        enemyDef.description,
        (enemyDef.healthOrDamage ?? 1) + 10,
        (enemyDef.attack ?? 1) + 3,
        { enemySpriteId: enemyDef.enemySpriteId, enemyPower: (enemyDef.enemyPower ?? 0) + 100 },
      )
      this.gs.lanes[i].setCardAtDistance(0, enemy)
      state.summonedEnemyIds.add(enemy.id)
    }

    this.inject.render()
    this.inject.recordNotice('녹지 않는 마녀가 후방으로 물러나 강화된 잿빛 종복을 불렀다!', 'hurt')
    const summonedIds = [...state.summonedEnemyIds]
    await this.br.animateSculptorSummonEnemies(summonedIds)
    await this.br.animateEnemyEmberEmpower(summonedIds)
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
    // 소환물도 직접 공격이므로 공격 시 발동 유물(훌륭한 대화수단)을 판정한다.
    await this.inject.applyPlayerAttackRelics()

    if (card.getHealth() <= 0) {
      await this.defeatSummonedEnemy(card)
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
      const totalDmg = aliveEnemies.reduce((s, e) => s + e.getDamage(), 0)
      await this.br.animateEnemyAttacks(hits)
      await this.br.animatePlayerDamageImpact(totalDmg)
      this.inject.recordNotice(`소환 적들의 반격! -${totalDmg}`, 'hurt')
      this.inject.render()
      if (!character.isAlive() || character.authoritySurvivePending) {
        await this.inject.handlePlayerDeath()
        return
      }
      this.inject.applyAnomalyHealthLoss()
      // 품격있는 대처: 나를 때린 소환 적들에게 각 1 반격.
      await this.retaliateGracefulResponse(aliveEnemies.map((e) => e.id))
    }

    // 3턴 주기 도달 + 소환 적 생존 → 보스가 후방에서 공격한다.
    if (state.turn % state.def.attackInterval === 0 && state.summonedEnemyIds.size > 0) {
      if (state.def.specialEnemyKind === 'waxWitch') {
        // 마녀는 후방 대기 중에도 공격 주기마다 손패 콤보를 펼쳐 사용하고 반격한다.
        // resolveWaxWitchPageTwoTurn이 콤보 + 본체 공격 + 변칙/품격 반격까지 모두 처리한다.
        if (await this.resolveWaxWitchPageTwoTurn(state.card.id)) return
        if (!character.isAlive() || character.authoritySurvivePending) {
          await this.inject.handlePlayerDeath()
          return
        }
      } else {
        // 조각사: 후방에서 야비하게 돌진 타격
        character.takeDamage(state.def.attack)
        await this.br.animateSculptorBackAttack(state.card.id)
        await this.br.animatePlayerDamageImpact(state.def.attack)
        this.inject.recordNotice(`조각사가 후방에서 야비하게 강타! -${state.def.attack}`, 'hurt')
        this.inject.render()
        if (!character.isAlive() || character.authoritySurvivePending) {
          await this.inject.handlePlayerDeath()
          return
        }
        this.inject.applyAnomalyHealthLoss()
        // 품격있는 대처: 후방에서 강타한 조각사에게 되받아친다.
        if (await this.retaliateGracefulResponse([state.card.id])) return
      }
    }

    if (state.summonedEnemyIds.size > 0) {
      this.inject.setInputLocked(false)
      return
    }
    await this.returnSculptorToFront()
  }

  /** 소환 적 처치 처리: 소멸 연출 → 모델 제거 → 보상 손패 드롭. 클릭/반격 공통. */
  private async defeatSummonedEnemy(card: Card): Promise<void> {
    const state = this.eventState
    if (!state) return
    const defeatedTile = this.br.findCardElement(card.id)
    const defeatedRect = defeatedTile?.getBoundingClientRect()
    await this.br.animateCardConsume(card)
    // 사망한 소환 적은 보상 손패 렌더보다 먼저 모델에서 제거해 재등장 잔상을 막는다.
    for (let i = 0; i < 3; i++) {
      if (this.gs.lanes[i].getCardAtDistance(0) === card) this.gs.lanes[i].setCardAtDistance(0, null)
    }
    state.summonedEnemyIds.delete(card.id)

    const dropNames: string[] = []
    for (let k = 0; k < card.defeatDropCount; k++) {
      const drop = DropSystem.generateDrop()
      if (this.gs.character.addHandCard(drop)) dropNames.push(getHandCardDef(drop.defId).name)
    }
    if (dropNames.length > 0) {
      this.inject.render()
      this.inject.recordNotice(`${card.name} 처치! 손패: ${dropNames.join(', ')}`, 'win')
      if (defeatedRect) await this.br.animateResourceTrailFromRect(defeatedRect, 'hand', dropNames.length, 'hand-recovery')
    }
  }

  /** 품격있는 대처(반격): 보스 전투에서 나를 때린 보스/소환 적에게 각 1 피해.
   *  보스가 반격으로 쓰러지면 처치 흐름을 돌리고 true를 반환한다(호출부는 즉시 return). */
  private async retaliateGracefulResponse(attackerIds: string[]): Promise<boolean> {
    const state = this.eventState
    if (!state || this.gs.character.health <= 0) return false
    if (!this.gs.character.hasRelic('graceful-response')) return false
    const damaged: { cardId: string; amount: number }[] = []
    const killedSummons: Card[] = []
    let bossHit = false
    for (const id of [...new Set(attackerIds)]) {
      if (id === state.card.id) {
        // 보스는 밀랍 방패와 무관한 순수 반사 피해 1을 HP에 직접 입힌다.
        if (state.card.getHealth() <= 0) continue
        state.card.takeDamage(1)
        bossHit = true
        damaged.push({ cardId: id, amount: 1 })
      } else {
        const card = this.getAliveSummonedCards().find((c) => c.id === id)
        if (!card) continue
        card.takeDamage(1)
        damaged.push({ cardId: id, amount: 1 })
        if (card.getHealth() <= 0) killedSummons.push(card)
      }
    }
    if (damaged.length === 0) return false
    this.inject.recordNotice(`품격있는 대처: 반격 피해 1 (${damaged.length}체)`, 'info')
    await this.br.animateDamageNumbersById(damaged)
    if (bossHit) this.br.playHudCounterFeedback('boss-hp', Math.max(0, state.card.getHealth()))
    for (const card of killedSummons) await this.defeatSummonedEnemy(card)
    this.inject.render()
    if (bossHit && state.card.getHealth() <= 0) {
      await this.handleDefeated()
      return true
    }
    return false
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

  /** 소환 적 전멸 시 보스를 전방으로 복귀시킨다. 쿵 착지 + 기절 블라스트 + 턴 초기화. */
  private async returnSculptorToFront(): Promise<void> {
    const state = this.eventState!
    const isWitch = state.def.specialEnemyKind === 'waxWitch'
    // 후방 점유(dist-1+2)를 지운 뒤, 조각사는 2×3 / 마녀는 3×3 전방 형태로 복귀한다.
    for (let i = 0; i < 3; i++) {
      this.gs.lanes[i].setCardAtDistance(1, null)
      this.gs.lanes[i].setCardAtDistance(2, null)
    }
    for (let i = 0; i < 3; i++) {
      this.gs.lanes[i].setCardAtDistance(0, state.card)
      if (!isWitch) this.gs.lanes[i].setCardAtDistance(1, state.card)
    }
    state.def.occupiedDistRows = isWitch ? 1 : 2
    state.sculptorPhase = 'front'
    state.sculptorStartRow = 0
    this.inject.render()

    // 쿵 떨어지는 착지 + 기절하듯 사각 블라스트
    await this.br.playSculptorReturnAnimation(state.card.id)

    // 공격 카운트다운을 다시 3턴으로 초기화
    state.turn = 0
    this.br.setBossAttackCountdown(state.def.attackInterval)
    this.inject.recordNotice(`${state.def.name}이(가) 다시 전방으로 내려왔다. 공격 주기 초기화!`, 'info')
    this.inject.render()
    this.inject.setInputLocked(false)
  }

  // ---- waxDemon 전용 페이지 메커니즘 ----------------------------------------

  /** 피격 후 HP가 65% 임계(nextDemonPageAt) 이하로 내려가면 2페이지로 전환한다. */
  private async resolveDemonAfterDamage(_beforeHp: number | null): Promise<boolean> {
    const state = this.eventState
    if (!state || state.def.specialEnemyKind !== 'waxDemon') return false
    if (state.demonPage !== 1) return false
    if (state.card.getHealth() > state.nextDemonPageAt) return false

    // 경계 초과 피해를 버리고 정확히 임계값에서 멈춘다.
    if (state.card.health < state.nextDemonPageAt) state.card.health = state.nextDemonPageAt
    state.demonPage = 2
    state.turn = 0
    this.br.setBossAttackCountdown(state.def.attackInterval)
    this.inject.render()

    const lines = [
      '과연. . .',
      '아직, 이쪽에도. . . 이 정도 되는 작품이 남아 있던 건가.',
      '. . .',
      '흥미롭군.',
    ]
    for (const text of lines) {
      await this.playIntroLine('boss', text, 2200)
    }
    this.inject.setInputLocked(false)
    return true
  }

  /** 공격 주기마다 검은 양초 1~3장 사용. 양초마다 전역 카운터++ 피해 + 보스 체력 +5. */
  private async resolveDemonCandleTurn(bossCardId: string): Promise<boolean> {
    const state = this.eventState!
    const character = this.gs.character
    const count = 1 + Math.floor(Math.random() * 3)
    const startingCounter = state.demonCandleCounter

    const applyCandle = async (_index: number): Promise<void> => {
      state.demonCandleCounter += 1
      const dmg = state.demonCandleCounter
      character.takeDamage(dmg)
      state.card.healEnemyLike(5)
      this.inject.recordNotice(`검은 양초! 피해 ${dmg} (악마 체력 +5)`, 'hurt')
      this.inject.render()
      this.inject.applyAnomalyHealthLoss()
    }

    await this.br.animateDemonCandleTurn(bossCardId, count, startingCounter, applyCandle)

    if (!character.isAlive() || character.authoritySurvivePending) {
      await this.inject.handlePlayerDeath()
      return true
    }
    if (await this.retaliateGracefulResponse([bossCardId])) return true
    return false
  }

  /** 2페이지마다 거짓과 진실 카드 발동. 진실: 체력+10/공격+1. 거짓: 손패 1~3장 파괴+체력+5씩. */
  private async resolveDemonTruthLieTurn(bossCardId: string): Promise<boolean> {
    const state = this.eventState!
    const character = this.gs.character
    const isTrue = Math.random() < 0.5

    const applyEffect = async (): Promise<void> => {
      if (isTrue) {
        state.card.healEnemyLike(10)
        state.def.attack += 1
        state.card.baseDamage += 1
        state.card.enemyDamageTotal = state.card.baseDamage
        this.inject.recordNotice('거짓과 진실 — 진실: 악마 체력 +10, 공격력 +1', 'hurt')
        this.inject.render()
      } else {
        const hand = character.hand
        if (hand.length === 0) {
          this.inject.recordNotice('거짓과 진실 — 거짓: 빈 손패, 효과 없음', 'info')
          return
        }
        const destroyCount = Math.min(1 + Math.floor(Math.random() * 3), hand.length)
        const indices = sampleWithoutReplacement(
          Array.from({ length: hand.length }, (_, i) => i),
          destroyCount,
        ).sort((a, b) => b - a)
        const names = indices.map((i) => getHandCardDef(hand[i].defId).name)
        await Promise.all(indices.map((slotIndex) =>
          this.br.animateBossBlastToHandSlot(bossCardId, slotIndex, 'demon-vortex')
        ))
        for (const slotIndex of indices) character.removeHandCardAt(slotIndex)
        state.card.healEnemyLike(destroyCount * 5)
        this.inject.recordNotice(`거짓과 진실 — 거짓: ${names.join(', ')} 파괴, 악마 체력 +${destroyCount * 5}`, 'hurt')
        this.inject.render()
      }
    }

    await this.br.animateDemonTruthLie(bossCardId, isTrue, applyEffect)
    return false
  }

  /** 검은 양초 악마 격파 후 8줄 대화 컷신. */
  private async playDemonDeathCutscene(_cardId: string): Promise<void> {
    const lines: Array<{ speaker: 'boss' | 'player'; text: string; holdMs: number }> = [
      { speaker: 'boss',   text: '. . .',                                              holdMs: 1800 },
      { speaker: 'player', text: '다 끝났어. 진실에 대해 알려줘.',                    holdMs: 2600 },
      { speaker: 'boss',   text: '정녕, 현실을 알고 싶은 건가?',                      holdMs: 2400 },
      { speaker: 'player', text: '그래.',                                              holdMs: 1600 },
      { speaker: 'boss',   text: '잿빛 굴레를 끊어내라, 그렇다면 직면할 수 있겠지.', holdMs: 3200 },
      { speaker: 'player', text: '그게 무슨 소리야?',                                 holdMs: 2000 },
      { speaker: 'boss',   text: '. . .',                                              holdMs: 1600 },
      { speaker: 'boss',   text: '진실의 앞에서. . . 그분과 함께, 기다리고 있겠다.', holdMs: 3400 },
    ]
    for (const line of lines) {
      await this.playIntroLine(line.speaker, line.text, line.holdMs)
    }
  }

  /** 100F 마녀 전용 격파 직전 컷신. 빛의 선이 한 줄씩 늘며 칸이 미세히 떨리고 확대되고,
   *  세 마디 독백을 지나 빛의 선이 마구 그어진 뒤 폭발(playBossDefeatSequence)로 이어진다. */
  private async playWitchDeathCutscene(cardId: string): Promise<void> {
    const lines = [
      '결국. . . 이렇게 되는 건가.',
      '하나만. . . 기억해.',
      '현실이 이상은 아니라는 것을. . . . . .',
    ]
    const holdMs = [2600, 2300, 3300]
    for (let beat = 0; beat < lines.length; beat++) {
      // 빛의 선 + 미세 떨림 + 칸 확대를 먼저 깐 뒤, 떨리는 동안 대사를 띄운다.
      await this.br.playWaxWitchDeathBeat(cardId, beat + 1)
      await this.playIntroLine('boss', lines[beat], holdMs[beat])
    }
    // 빛의 선이 하나 둘 더 그어지다 마구 그어진다 — 폭발 직전 마디.
    await this.br.playWaxWitchDeathFrenzy(cardId)
  }

  private async handleDefeated(): Promise<void> {
    if (!this.eventState) return
    const state = this.eventState
    if (state.defeatTriggered) return
    state.defeatTriggered = true

    // 악마: 격파 후 대화 컷신 → 보라 소용돌이 소멸 연출
    if (state.def.specialEnemyKind === 'waxDemon') {
      await this.playDemonDeathCutscene(state.card.id)
      await this.br.playDemonDefeatSequence(state.card.id)
    } else {
      // 100F 마녀는 최종 보스답게 빛의 선이 번지며 칸이 확대되는 격파 직전 독백 컷신을 먼저 재생한다.
      if (state.def.specialEnemyKind === 'waxWitch') {
        await this.playWitchDeathCutscene(state.card.id)
      }
      await this.br.playBossDefeatSequence(state.card.id)
    }
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

  private async stageBossRewardChests(savedField: (Card | null)[][], kind?: BossDef['specialEnemyKind']): Promise<void> {
    let healCard: Card, chestCard: Card, bountyCard: Card
    if (kind === 'waxDemon') {
      // 이벤트 보스 전용 보상: 회복 / 악마 인형 유물 / 검은 양초 손패
      healCard   = new Card('boss-reward-heal',        CardType.TREASURE, '점화액',    '체력 / 불씨 회복')
      chestCard  = new Card('boss-reward-demon-relic', CardType.TREASURE, '악마 인형', '유물 획득')
      bountyCard = new Card('boss-reward-demon-hand',  CardType.TREASURE, '검은 양초', '손패 획득')
    } else {
      healCard   = new Card('boss-reward-heal',   CardType.TREASURE, '점화액',  '체력 / 불씨 회복')
      chestCard  = new Card('boss-reward-chest',  CardType.TREASURE, '전리품',  '유물 획득')
      bountyCard = new Card('boss-reward-bounty', CardType.TREASURE, '현상금',  '1~5$')
    }
    for (const c of [healCard, chestCard, bountyCard]) c.groupCount = 3
    for (let lane = 0; lane < 3; lane++) {
      this.gs.lanes[lane].setCardAtDistance(0, healCard)
      this.gs.lanes[lane].setCardAtDistance(1, chestCard)
      this.gs.lanes[lane].setCardAtDistance(2, bountyCard)
    }
    this.postPhaseHandLocked = true
    // 보상·시련 단계에서는 손패 사용과 함께 체인도 끊는다(전투 중 쌓인 체인 잔상 제거).
    this.inject.clearChainTimeline()
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
