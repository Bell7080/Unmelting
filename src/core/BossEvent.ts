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
import { Card, CardType, type SpecialEnemyKind } from '@entities/Card'
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
import { getRelicDef, relicDrawWeight, RELIC_IDS, type RelicId } from '@data/Relics'
import { sampleWithoutReplacement } from '@core/Sampling'
import { ENEMY_DEFINITIONS } from '@systems/CardSpawner'
import { EmberSystem } from '@systems/EmberSystem'
import { BOSS_CORE_SPECS, ONBOARDING_CAT_SPEC, demonSummonSpec } from '@data/BossSpecs'
import {
  HALF_PAGE_BOSSES,
  halfPageFloor,
  waxWitchPageFloors,
  GREED_COIN_ID,
  GREED_COIN_TOLL_DAMAGE,
  GREED_SCATTER_MIN,
  GREED_SCATTER_MAX,
  CAT_GIFT_CARDS,
  CAT_PAGE_TWO_STEAL_CARDS,
  KNIGHT_BASE_CARDS,
  KNIGHT_HAND_CARD_AMOUNT,
  KNIGHT_PAGE_TWO_EXTRA_CARDS,
  KNIGHT_PAGE_TWO_AMOUNT_BONUS,
  SCULPTOR_SUMMON_COUNT,
  SCULPTOR_SWELL_HP,
  WITCH_BURN_CARDS,
  WITCH_HAND_CARD_AMOUNT,
  WITCH_PAGE_TWO_CARDS,
  WITCH_SUMMON_COUNT,
  WITCH_ENRAGE_ATK,
  WITCH_ENRAGE_HP,
} from '@data/BossPages'
import { BossGimmickManager, BOSS_GIMMICK_KIND_META } from '@systems/BossGimmickManager'
import { discardBossCellStrikes } from '@/app/BossCellFeedback'

type WaxKnightCardEffect = 'shield' | 'heal' | 'strike'
type BossPage = 1 | 2 | 3

/** 보스 행동 사이의 한 박자(ms). 살포·징수·타격이 각각 별개의 사건으로 읽히게 하는 간격. */
const BOSS_TURN_BEAT_MS = 300

/** 리미트 페이지가 피해를 막고 있을 때 피해 수치 자리에 대신 뜨는 문구. */
const PAGE_GATE_WARNING_TEXT = '칸을 파괴해야합니다.'

/**
 * 절반 HP 2페이지 전환 대사. 보스마다 한 묶음이며, 없는 보스는 대사 없이 넘어간다.
 */
const HALF_PAGE_TWO_LINES: Partial<Record<
  SpecialEnemyKind,
  ReadonlyArray<{ speaker: 'boss' | 'player'; text: string; holdMs: number }>
>> = {
  waxArmy: [
    { speaker: 'boss',   text: '흠. . .',                        holdMs: 1800 },
    { speaker: 'boss',   text: '자네는, 평범한 양초가 아닌가?',   holdMs: 2800 },
    { speaker: 'player', text: '탐욕에 물든 주제에…',             holdMs: 2400 },
  ],
  waxCat: [
    { speaker: 'boss',   text: '야옹. . .',                      holdMs: 1800 },
    { speaker: 'boss',   text: '준 건, 도로 가져갈 거야.',          holdMs: 2600 },
    { speaker: 'player', text: '내 손패를…!',                     holdMs: 2200 },
  ],
  waxKnight: [
    { speaker: 'boss',   text: '아직. . . 쓰러질 수 없다.',        holdMs: 2600 },
    { speaker: 'boss',   text: '한 장으로는 부족하겠군.',          holdMs: 2600 },
    { speaker: 'player', text: '왜 그렇게까지 하는 거야.',         holdMs: 2400 },
  ],
  waxSculptor: [
    { speaker: 'boss',   text: '. . .좋아. 재료가 더 필요해.',      holdMs: 2800 },
    { speaker: 'player', text: '저 몸집이. . . 부풀고 있어.',       holdMs: 2400 },
  ],
}
// ---- 보스별 스탯 정의 -------------------------------------------------------

export interface BossDef {
  /** 화면 표시 이름 */
  name: string
  maxHp: number
  attack: number
  attackInterval: number
  /** HP를 이 값만큼(15) 잃을 때마다 플레이어에게 손패 1장 지급(30/60/90/100F 공통). */
  handGiftStep: number
  /** 보스 손패 효과(방패/체력/피해) 공통 수치. waxKnight/waxWitch가 사용한다. */
  handCardAmount: number
  /** CSS boss-kind-* 마커 — Rail CSS 레이아웃과 연동 */
  specialEnemyKind: 'waxArmy' | 'waxKnight' | 'waxSculptor' | 'waxWitch' | 'waxDemon' | 'waxCat'
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
  /** true이면 보상 후 강제 시련 오버레이를 열지 않는다 (악마 소환 이벤트 보스 등). */
  skipForcedTrial?: boolean
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
  /** waxWitch 전용: 현재 HP 페이지. 경계는 최대 체력의 2/3·1/3(waxWitchPageFloors). */
  witchPage: BossPage
  /** waxDemon 현재 페이지 (1 → 2 전환은 HP 65% 이하 시). */
  demonPage: 1 | 2
  /** waxDemon 검은 양초 누적 피해 카운터 — 양초를 쓸 때마다 증가, 손패 black-candle 사용도 반영. */
  demonCandleCounter: number
  /** waxDemon 2페이지 전환 HP 임계값 (maxHp * 0.65 반올림). */
  nextDemonPageAt: number
  /** 절반 HP 페이지를 쓰는 보스(HALF_PAGE_BOSSES)의 현재 페이지. */
  halfPage: 1 | 2
  /**
   * 리미트 페이지에 처음 닿은 순간의 파괴 칸 수. 이 값을 넘겨야 페이지가 열린다.
   * 격자가 없어 부위 파괴를 요구하지 않는 보스는 쓰지 않는다(null 유지).
   */
  halfPageBrokenMark: number | null
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
  /** 체인 오브젝트 리셋 + 타임라인 제거 + 배너 갱신 — 직접 타격·보상 단계 진입 시 호출 */
  clearChainTimeline: () => void
  recordNotice: (msg: string, kind: 'info' | 'win' | 'hurt') => void
  /** 소중한 머리 유물: 체력이 절반 이하로 감소했을 때 전체 회복 후 파괴 */
  applyPreciousHeadCheck: () => Promise<void>
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
  /** 동반자(에나) 보스 전용 대사 훅 — 일반 월드 바크가 침묵하는 보스전에서 등장 순간만 알린다(선택적). */
  onBossIntro?: (bossName: string) => void
  /** 보스 국면 전환(페이지/후방 소환) 순간. phaseKey로 호출부가 이벤트당 1회 발화를 보장한다. */
  onBossPhase?: (bossName: string, phaseKey: string) => void
  /** 보스 격파 연출이 끝나고 레일이 정리된 직후. */
  onBossKill?: (bossName: string) => void
}

// ---- Controller ------------------------------------------------------------

export class BossEventController {
  /** index.ts에서 `bossEventState` 대신 이 프로퍼티를 참조한다. */
  eventState: BossEventState | null = null
  /** index.ts에서 `bossRewardState` 대신 이 프로퍼티를 참조한다. */
  rewardState: BossRewardState | null = null
  /** 보상/시련 단계 중 손패 카드 사용 차단 플래그 */
  postPhaseHandLocked = false
  /** 보스 타일 위에 겹치는 칸 기믹 격자(약점/경화). 프로필이 있는 보스에서만 켜진다. */
  readonly gimmicks = new BossGimmickManager()

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

  /** 런 리셋(게임오버 후 다시 시작) 시 보스 진행 상태를 비운다. 죽음이 보스전 도중
   *  발생했어도 다음 런에서 잔여 eventState/rewardState가 새 게임을 보스로 오인하지 않게 한다. */
  reset(): void {
    this.eventState = null
    this.rewardState = null
    this.postPhaseHandLocked = false
    this.clearGimmickGrid()
  }

  /** 격자를 비우고 렌더러의 오버레이도 함께 내린다(격파·런 리셋 공용). */
  private clearGimmickGrid(): void {
    this.gimmicks.reset()
    this.gs.bossGimmicks = null
    this.br.setBossGimmickGrid(null)
    this.br.setBossPageState([], null)
  }

  /** 인트로가 끝난 뒤 격자를 실제로 켠다 — 손패 피해 판정(GameState)과 화면 노출을 함께 연다. */
  private activateGimmickGrid(): void {
    if (!this.gimmicks.isActive) return
    this.gs.bossGimmicks = this.gimmicks
    this.syncGimmickGrid()
    this.inject.render()
  }

  /** 현재 격자 상태를 렌더러에 밀어 넣는다. 칸 균열/파괴는 타격마다 바뀌므로
   *  피해를 준 쪽(직접 타격·손패)이 렌더 직전에 이걸 한 번 불러 줘야 한다. */
  syncGimmickGrid(): void {
    this.syncGimmickShapeToBody()
    this.br.setBossGimmickGrid(
      this.gimmicks.isActive
        ? {
            cols: this.gimmicks.cols,
            rows: this.gimmicks.rows,
            cells: this.gimmicks.getCells(),
            // 레일 행을 실제로 여러 개 차지하는 보스는 타일마다 격자 한 행씩 그린다.
            tileRows: this.eventState?.def.occupiedDistRows ?? 1,
            startDistance: this.eventState?.sculptorStartRow ?? 0,
          }
        : null
    )
    this.syncPageState()
  }

  /**
   * 보스 몸집이 바뀌면 격자도 같은 모양으로 **다시 짠다**.
   *
   * 마녀 3페이지는 3×3 몸을 2×3으로 접으며 하수인을 부른다 — 그때 판정 칸도 6칸으로
   * 줄고, 그 6칸을 기준으로 **약점이 새로 노출된다**. 늘어나는 경우도 같은 규칙이다:
   * 몸이 커지면 커진 칸 수 기준으로 다시 굴린다.
   *
   * 몸집 변화를 감지해 자동으로 도는 자리라, 새로 몸이 변하는 보스를 만들어도
   * `occupiedDistRows`만 바꾸면 격자가 따라온다(전용 호출을 심을 필요가 없다).
   */
  private syncGimmickShapeToBody(): void {
    const state = this.eventState
    if (!state || !this.gimmicks.isActive) return
    // 레일 1행을 CSS로 3행처럼 늘려 그리는 보스는 프로필 기본 행 수를 그대로 쓴다.
    const desiredRows = state.def.occupiedDistRows > 1
      ? state.def.occupiedDistRows
      : this.gimmicks.profileRows
    if (desiredRows <= 0 || desiredRows === this.gimmicks.rows) return
    const before = this.gimmicks.cellCount
    // 내구도는 남은 체력에서 다시 뽑는다 — 바뀐 몸이 그 페이지 안에서 깨져야 한다.
    if (!this.gimmicks.resize(this.gimmicks.cols, desiredRows, state.card.getHealth())) return
    this.br.markBossGimmickRelabel()
    this.inject.recordNotice(
      `${state.card.name}의 몸이 바뀌었다 — 부위 ${before}칸 → ${this.gimmicks.cellCount}칸, 약점 재배치`,
      'info'
    )
  }

  /** HP바 경계선·페이지 열기를 렌더러에 밀어 넣는다. 페이지 규칙의 출처는 이 컨트롤러다. */
  syncPageState(): void {
    this.br.setBossPageState(this.bossPageMarkers(), this.bossPagePhase())
  }

  /**
   * 칸 타격 연출이 끝난 beat의 후처리 — 성한 칸의 배율만 다시 굴린다.
   * 누적 손상은 남으므로 "때려 둔 칸을 마저 깨서 부위 파괴 보너스를 받을지,
   * 새로 뜬 약점을 노릴지"가 매 타격마다 선택으로 돌아온다.
   * 보스가 이 beat에 쓰러졌으면 굴리지 않는다(격파 연출 위로 배율이 새로 뜬다).
   */
  async rerollGimmickCells(): Promise<void> {
    if (!this.eventState || this.eventState.card.getHealth() <= 0) return
    if (!this.gimmicks.canReroll()) return
    await this.br.fadeBossGimmickLabels()
    if (!this.gimmicks.rerollKinds()) return
    this.br.markBossGimmickRelabel()
    this.syncGimmickGrid()
    this.inject.render()
  }

  // ---- 공개 흐름 메서드 -------------------------------------------------------

  /** 30F 보스 이벤트 실행. closeShopAndResume 제단 EXIT 분기에서 호출한다. */
  async run30F(): Promise<void> {
    // 세계관: 양초 백작이 "내 저택"이라 부르는 곳은 본래 주인공 에나가 살던 집이다.
    // 플레이어의 격앙된 응답("네 저택이라고…?")이 이 빼앗긴 과거를 암시한다.
    const def: BossDef = {
      // 전투 핵심 수치(HP/공격/주기/손패 지급)는 BossSpecs 단일 출처를 쓴다 — 시뮬과 공유.
      ...BOSS_CORE_SPECS[30],
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
        '첫 번째 : 공격 주기마다 손패에 카드 2~4장을 흩뿌림. 일부는 「탐욕의 동전」.',
        '두 번째 : 공격 주기마다 손에 쥔 「탐욕의 동전」 1장당 1피해.',
        '체력 절반에서 칸을 파괴해야 다음 페이지로 넘어감.',
      ].join('\n'),
      kicker: '탐욕의 대가',
    }
    await this.runBossEvent(def)
  }

  /** 새싹 병아리(온보딩) 30F 보스. 양초 고양이 — 손패를 강탈해 촛농/양초/불씨면 직접 쓴다. */
  async runOnboardingCat(): Promise<void> {
    const def: BossDef = {
      // 전투 핵심 수치는 BossSpecs 단일 출처(handGiftStep 5 = 초보에게 넉넉한 지급 포함).
      ...ONBOARDING_CAT_SPEC,
      handCardAmount: 0,   // 손패 강탈+사용으로 대체(전용 손패 효과 미사용)
      specialEnemyKind: 'waxCat',
      groupCount: 3,
      occupiedDistRows: 1,   // waxArmy처럼 CSS가 dist-0을 3×3으로 확장한다
      spriteUrl: this.sprites.bossCat,   // 양초 고양이 전용 일러스트(boss_005)
      appearAnimation: 'landing',
      introBubble: '야옹… 여기까지 왔구나. 마지막 놀이 상대는 나야.',
      playerResponseBubble: '고양이…? 방심하면 안 되겠어.',
      introBubbleMs: 4000,
      playerBubbleMs: 2600,
      trait: [
        `첫 번째 : 공격 주기마다 손패 ${CAT_GIFT_CARDS}장을 굴려 줌.`,
        `두 번째 : 굴려 준 뒤 손패 ${CAT_PAGE_TWO_STEAL_CARDS}장을 도로 빼앗음. 촛농·양초·불씨면 직접 사용.`,
        '체력 절반에서 칸을 파괴해야 다음 페이지로 넘어감.',
      ].join('\n'),
      kicker: '장난기 어린 발톱',
    }
    await this.runBossEvent(def)
  }

  /** 60F 보스 이벤트 실행. 30F의 3×3 구조를 유지하되 전용 카드 사용 패턴을 적용한다. */
  async run60F(): Promise<void> {
    // 세계관: 불씨 기사단장의 정체는 기사왕 레온하르트로, 과거 주인공 에나(에나벨라)를
    // 섬기던 기사다. "에나벨라님을… 위하여…"라는 인트로와 이를 알아채는 플레이어
    // 응답으로만 그 정체를 암시한다.
    const def: BossDef = {
      // 전투 핵심 수치는 BossSpecs 단일 출처(체력 15 손실마다 손패 1장 지급 공통 포함).
      ...BOSS_CORE_SPECS[60],
      handCardAmount: KNIGHT_HAND_CARD_AMOUNT,
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
      trait: [
        '첫 번째 : 공격 주기마다 기사단장의 손패 2장 발동.',
        '두 번째 : 손패 3장으로 늘고 각 카드 수치 +1.',
      ].join('\n'),
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
      // 전투 핵심 수치는 BossSpecs 단일 출처를 쓴다 — 시뮬과 공유.
      ...BOSS_CORE_SPECS[90],
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
      // 다른 보스 특징과 어미를 맞춘다(존댓말 하나만 튀어 있었다).
      trait: [
        '첫 번째 : 공격 주기마다 밀랍을 조각해 종복을 소환하고 몸을 숨김.',
        '두 번째 : 소환하는 양초 조각이 비대화됨(체력 +5).',
      ].join('\n'),
      kicker: '광기의 예술가',
    }
    await this.runBossEvent(def)
  }


  /** 100F 보스 이벤트 실행. 최종 등반의 별빛 규칙이 100층에 닿으면 호출한다. */
  async run100F(): Promise<void> {
    // 최종 보스는 앞선 30/60/90F 보스 메커니즘을 페이지별로 압축해 재사용한다.
    // 3×3 타일은 양초 백작과 같은 CSS 확장 규칙을 쓰고, 3페이지에서만 2×3 후방 대기형으로 변한다.
    const def: BossDef = {
      // 전투 핵심 수치는 BossSpecs 단일 출처를 쓴다 — 시뮬과 공유.
      ...BOSS_CORE_SPECS[100],
      handCardAmount: WITCH_HAND_CARD_AMOUNT,
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
        '첫 번째 : 공격 주기마다 플레이어의 손패 2장을 불태움.',
        '두 번째 : 손패 4장을 펼치고, 겹친 손패가 있다면 추가 카드를 사용함.',
        '세 번째 : 광폭화된 종복을 소환함(공격력 +3 · 체력 +8).',
      ].join('\n'),
      kicker: '잿빛 굴레의 주인',
    }
    await this.runBossEvent(def)
  }

  /** 악마 소환 레시피 발동 시 이벤트 보스 전투 — index.ts가 커튼을 닫은 뒤 호출한다. */
  async runDemonSummon(): Promise<void> {
    const turnCount = this.gs.getCurrentTurn()
    const spriteUrl = spriteForEventBoss('eventboss_001') ?? this.sprites.boss
    const def: BossDef = {
      // 발동 턴 비례 성장 스펙은 BossSpecs 단일 출처를 쓴다.
      ...demonSummonSpec(turnCount),
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
      // 레시피 발동 이벤트 보스는 보상 후 강제 시련 없이 일반 레일로 복귀한다.
      skipForcedTrial: true,
    }
    await this.runBossEvent(def)
  }

  /** 보스 카드 클릭 처리. handleCardAction 내 BOSS 분기에서 호출한다. */
  async handleClick(card: Card, gimmickCellIndex?: number): Promise<void> {
    if (!this.eventState || this.eventState.card !== card) return
    const state = this.eventState
    const character = this.gs.character
    // 보스가 굳어 있으면 플레이어 공격은 정상으로 들어가되, 이번 보스 반격/특수행동은 건너뛴다.
    // (즉사만 면역, 굳음은 적용 — 굳음은 이 beat 끝에 1턴 소모한다.)
    const bossFrozen = card.isFrozen()

    // 직접 타격은 턴을 갱신하는 행위이므로 체인을 끊는다(카드 사용과 달리).
    this.inject.clearChainTimeline()
    this.inject.setInputLocked(true)

    await this.br.animatePlayerAttack(card)
    const bossTile = this.br.findCardElement(card.id)
    // 격자가 켜져 있으면 타일 전체 버스트를 생략한다 — 어느 칸을 때렸는지가 요점이라
    // 칸 블라스트/버스트가 그 역할을 대신한다.
    if (bossTile && !this.gimmicks.isActive) {
      SquareBurst.playOn(bossTile, 'damage', { count: 22, spread: 180, duration: 560 })
    }
    const beforeBossHp = card.getHealth()
    // 칸 기믹: 때린 격자 칸의 배율(+ 이번 타격에 깨졌다면 부위 파괴 보너스)을 먼저
    // 먹인 뒤 방패/페이지 상한을 계산한다.
    this.gimmicks.beginAction({ origin: 'direct', tags: [] })
    const struck = this.gimmicks.strike({ cellIndex: gimmickCellIndex, baseDamage: character.damage })
    const attackPower = struck ? struck.damage : character.damage
    if (struck) {
      if (struck.cell.kind !== 'plain') {
        const meta = BOSS_GIMMICK_KIND_META[struck.cell.kind]
        this.inject.recordNotice(
          `${meta.label} 부위를 때렸다 — 피해 ×${meta.multiplier}`,
          struck.cell.kind === 'weak' ? 'win' : 'info'
        )
      }
      if (struck.broke) {
        this.inject.recordNotice(
          `부위가 부서졌다 — 추가 피해 ${struck.breakDamage} (${this.gimmicks.brokenCount}/${this.gimmicks.cellCount})`,
          'win'
        )
      }
    }
    // 균열/파괴가 반영된 격자를 렌더러에 즉시 밀어 넣는다(이 beat의 render가 새 상태를 그린다).
    // 직접 타격은 struck을 그대로 그리므로 기록은 여기서 비운다 — 남겨 두면 뒤따르는
    // 피해 수치 호출이 같은 타격을 한 번 더 칸 연출로 재생한다.
    if (struck) {
      this.syncGimmickGrid()
      discardBossCellStrikes(this.gs)
    }
    const rawDamage = Math.min(attackPower, card.getHealth() + state.bossShield)
    const blocked = Math.min(state.bossShield, rawDamage)
    state.bossShield -= blocked
    this.syncBossShieldToCard()
    // 페이지 경계 초과 피해는 깎기 전에 버린다 — HP바가 경계 아래로 내려갔다 복구되며 깜빡이지 않게 한다.
    const pageFloor = this.bossPageFloor()
    const dealt = pageFloor > 0
      ? Math.min(rawDamage - blocked, Math.max(0, card.getHealth() - pageFloor))
      : Math.min(rawDamage - blocked, card.getHealth())
    if (dealt > 0) card.takeDamage(dealt)
    if (blocked > 0) {
      this.inject.recordNotice(`밀랍 방패가 피해 ${blocked}를 막았다`, 'info')
      // 보스도 막아 낸 사실을 화면에 남긴다 — 플레이어 쪽과 같은 회색 수치·흔들림이다.
      void this.br.playShieldBlockFeedback(this.br.findCardElement(card.id), blocked)
    }
    // 굳은 보스에게도 직접 공격 행동 비용은 적용한다.
    // 다만 밀랍 로직처럼 보스 반격 주기(state.turn)만 멈춰 카운트다운이 줄지 않게 한다.
    let turnMod = state.turn % state.def.attackInterval
    this.tm.tickEmberDecay()
    if (!bossFrozen) {
      state.turn += 1
      // 카운터: 0이면 이번 턴에 반격 — 0을 잠깐 보여 준 뒤 공격한다.
      turnMod = state.turn % state.def.attackInterval
      const displayValue = turnMod === 0 ? 0 : state.def.attackInterval - turnMod
      this.br.setBossAttackCountdown(displayValue)
      if (turnMod === 0) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, 220))
      }
    }
    if (struck) {
      // 수치는 보스 타일 중앙이 아니라 '때린 칸' 위에서 뜬다. 방패/페이지 경계에 잘렸으면
      // 배율 피해분을 먼저 채우고 남은 몫만 부위 파괴 보너스로 표기해 합이 실제 피해와 맞는다.
      const cellShown = Math.min(dealt, struck.cellDamage)
      await this.br.playBossGimmickStrikes(
        [{
          cellIndex: struck.cell.index,
          kind: struck.cell.kind,
          damage: cellShown,
          breakDamage: dealt - cellShown,
          wear: struck.cell.wear,
          broke: struck.broke,
        }],
        // 직접 타격은 블라스트를 쏘지 않는다 — animatePlayerAttack의 돌진(박치기)이
        // 이미 '내가 가서 때렸다'를 말한다. 여기에 발사체를 얹으면 원거리 사격처럼 읽힌다.
        // 손패는 반대로 화면 중앙에서 칸으로 날아가는 블라스트가 맞다.
        null
      )
      await this.rerollGimmickCells()
    } else {
      await this.br.animateDamageNumbersById(dealt > 0 ? [{ cardId: card.id, amount: dealt }] : [])
    }
    // 플레이어가 보스를 직접 공격했으므로 공격 시 발동 유물(훌륭한 대화수단)을 판정한다.
    await this.inject.applyPlayerAttackRelics()

    await this.consumeHandGiftThresholds(card.id)
    if (await this.resolveWaxWitchAfterDamage(beforeBossHp)) return
    if (await this.resolveDemonAfterDamage(beforeBossHp)) return
    if (await this.resolveHalfPage()) return
    this.inject.render()

    if (card.getHealth() <= 0) {
      await this.handleDefeated()
      return
    }

    if (bossFrozen) {
      // 굳음 중 — 행동 비용은 냈지만 보스 반격 주기는 줄이지 않고 밀랍 지속시간만 1턴 소모한다.
      this.inject.recordNotice('보스가 굳어 반격 주기가 멈췄다', 'info')
      card.tickFrozen()
      this.inject.render()
    } else if (turnMod === 0) {
      if (state.def.specialEnemyKind === 'waxWitch') {
        // 100F 페이지 능력은 해금 뒤에도 유지된다 — 상위 페이지는 하위 페이지 능력을 함께 발동한다.
        // 1페이지 능력(공격주기마다 손패 2장 소각)은 2·3페이지에서도 계속 실행한다.
        await this.burnRandomHandCardsFromWitch(card.id, WITCH_BURN_CARDS)
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
        await this.pauseBeat()
        if (state.demonPage >= 2) {
          if (await this.resolveDemonTruthLieTurn(card.id)) return
          if (!character.isAlive() || character.authoritySurvivePending) {
            await this.inject.handlePlayerDeath(); return
          }
          await this.pauseBeat()
        }
        character.takeDamage(card.getDamage())
        await this.br.animateBossSlamAttack(card.id)
        await this.br.animatePlayerDamageImpact(card.getDamage())
        this.inject.recordNotice(`검은 양초 악마의 강타! 플레이어가 ${card.getDamage()} 피해를 받았다`, 'hurt')
        this.inject.render()
        this.inject.applyAnomalyHealthLoss()
        await this.inject.applyPreciousHeadCheck()
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
        // 30F 양초 백작: 특징 연출(탐욕 살포 → 탐욕의 값)을 먼저 보여준 뒤 보스가 타격한다.
        if (state.def.specialEnemyKind === 'waxArmy') {
          if (await this.resolveWaxArmyGreedTurn(card.id)) return
        } else if (state.def.specialEnemyKind === 'waxCat') {
          await this.resolveWaxCatTurn()
          await this.pauseBeat()
        }
        character.takeDamage(card.getDamage())
        await this.br.animateBossSlamAttack(card.id)
        await this.br.animatePlayerDamageImpact(card.getDamage())
        this.inject.recordNotice(`보스 반격! 플레이어가 ${card.getDamage()} 피해를 받았다`, 'hurt')
        this.inject.render()
        this.inject.applyAnomalyHealthLoss()
        await this.inject.applyPreciousHeadCheck()
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
    if (await this.resolveHalfPage()) return
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

      // 굳어 있으면 이 가상 턴의 보스 반격/특수행동을 건너뛰고 굳음을 1턴 소모한다.
      if (state.card.isFrozen()) {
        if (lvTurnMod === 0) this.inject.recordNotice('보스가 굳어 반격하지 못한다', 'info')
        state.card.tickFrozen()
        this.inject.render()
        continue
      }

      if (lvTurnMod === 0) {
        if (state.def.specialEnemyKind === 'waxArmy') {
          // 탐욕 살포 → (2P) 탐욕의 값 → 플레이어 타격
          if (await this.resolveWaxArmyGreedTurn(state.card.id)) return
          const dmg = state.card.getDamage()
          character.takeDamage(dmg)
          await this.br.animateBossSlamAttack(state.card.id)
          await this.br.animatePlayerDamageImpact(dmg)
          this.inject.recordNotice(`레바테인: 보스 반격 — 피해 ${dmg}`, 'hurt')
          this.inject.render()
          this.inject.applyAnomalyHealthLoss()
          await this.inject.applyPreciousHeadCheck()
        } else if (state.def.specialEnemyKind === 'waxKnight') {
          if (await this.resolveWaxKnightCardTurn(state.card.id)) return
        } else if (state.def.specialEnemyKind === 'waxSculptor') {
          // handleSculptorPhaseShift 대신 내부 로직만 호출 (setInputLocked는 호출부가 관리)
          await this.performSummonToBack()
        } else if (state.def.specialEnemyKind === 'waxWitch') {
          // 1페이지 능력(손패 2장 소각)은 모든 페이지에서 매 공격주기마다 유지된다.
          await this.burnRandomHandCardsFromWitch(state.card.id, WITCH_BURN_CARDS)
          if (state.witchPage >= 2) {
            if (await this.resolveWaxWitchPageTwoTurn(state.card.id)) return
          } else {
            const dmg = state.def.attack
            character.takeDamage(dmg)
            await this.br.animateBossSlamAttack(state.card.id)
            await this.br.animatePlayerDamageImpact(dmg)
            this.inject.recordNotice(`레바테인: 보스 반격 — 피해 ${dmg}`, 'hurt')
            this.inject.render()
            this.inject.applyAnomalyHealthLoss()
            await this.inject.applyPreciousHeadCheck()
          }
        } else if (state.def.specialEnemyKind === 'waxDemon') {
          if (await this.resolveDemonCandleTurn(state.card.id)) return
          await this.pauseBeat()
          if (state.demonPage >= 2) {
            if (await this.resolveDemonTruthLieTurn(state.card.id)) return
            if (!character.isAlive() || character.authoritySurvivePending) {
              await this.inject.handlePlayerDeath(); return
            }
            await this.pauseBeat()
          }
          const dmg = state.card.getDamage()
          character.takeDamage(dmg)
          await this.br.animateBossSlamAttack(state.card.id)
          await this.br.animatePlayerDamageImpact(dmg)
          this.inject.recordNotice(`레바테인: 검은 양초 악마 반격 — 피해 ${dmg}`, 'hurt')
          this.inject.render()
          this.inject.applyAnomalyHealthLoss()
          await this.inject.applyPreciousHeadCheck()
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
      // 트레일 착탄에 맞춰 체력/불씨 숫자가 굴러가도록 트레일을 기다린 뒤 카운터를
      // 굴린다(이전엔 void로 흘려보내 뒤따르는 render()에서야 늦게 굴렀다).
      await Promise.all([
        this.br.animateResourceTrailFromCard(card.id, 'health', 1, 'health-gain'),
        this.br.animateResourceTrailFromCard(card.id, 'ember', 1, 'gauge-gain'),
      ])
      this.br.playHudCounterFeedback('health', character.health)
      this.br.playHudCounterFeedback('maxHealth', character.maxHealth)
      this.br.playHudCounterFeedback('ember', character.ember)
      this.br.playHudCounterFeedback('emberMax', character.emberMax)
    } else if (card.id === 'boss-reward-bounty') {
      const amount = 1 + Math.floor(Math.random() * 3)
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
      // 상점/제단과 동일하게 등급별 relicDrawWeight 가중치로 뽑는다.
      let relicId: RelicId | null = null
      if (unownedRelics.length > 0) {
        const totalW = unownedRelics.reduce((s, id) => s + relicDrawWeight(id), 0)
        let roll = Math.random() * totalW
        for (const id of unownedRelics) {
          roll -= relicDrawWeight(id)
          if (roll <= 0) { relicId = id; break }
        }
        relicId ??= unownedRelics[unownedRelics.length - 1]
      }
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
      // 손패가 가득 차면 가장 하단(인덱스 0) 칸을 소각하고 검은 양초를 추가한다.
      if (!character.hasHandRoom()) {
        await this.br.animateHandCardBurn(0)
        character.removeHandCardAt(0)
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
      demonPage: 1,
      demonCandleCounter: 0,
      nextDemonPageAt: def.specialEnemyKind === 'waxDemon'
        ? Math.ceil(def.maxHp * 0.65)  // HP 65% 이하에서 2페이지 전환
        : 0,
      halfPage: 1,
      halfPageBrokenMark: null,
    }
    this.syncBossShieldToCard()
    // HP바 경계선은 격자보다 먼저 보인다(격자는 인트로 뒤에 켜진다).
    this.syncPageState()
    // 칸 기믹 격자는 보스마다 새로 굴린다 — 약점 자리가 매 조우 달라진다.
    // 화면 노출과 판정 활성화는 인트로·타이틀이 끝난 뒤(activateGimmickGrid)로 미룬다.
    // 칸 내구도/부위 파괴 보너스는 보스 최대 체력에서 파생한다(칸 절반이면 쓰러지는 기준).
    this.gimmicks.beginEncounter(def.specialEnemyKind, def.maxHp)

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

    // 한번 만난 보스는 인트로 대사를 SKIP 버튼으로 건너뛸 수 있다(unmelting. 접두사라 /리셋 대상).
    // 등장 애니/타이틀 오버레이는 짧고 정체성이라 유지 — 대사만 줄 사이에서 끊는다.
    const seenKey = `unmelting.seen.boss.${def.specialEnemyKind}`
    const seenBefore = window.localStorage.getItem(seenKey) === '1'
    let introSkipRequested = false
    const removeSkipButton = seenBefore ? this.br.showBossSkipButton(() => { introSkipRequested = true }) : null

    // 보스 대사 — introSequence가 있으면 멀티라인 클릭-스킵 순차 표시, 없으면 기존 2줄.
    if (def.introSequence && def.introSequence.length > 0) {
      for (const line of def.introSequence) {
        if (introSkipRequested) break
        await this.playIntroLine(line.speaker, line.text, line.holdMs)
      }
      if (!introSkipRequested) await new Promise((r) => window.setTimeout(r, 160))
    } else {
      if (!introSkipRequested) await this.playIntroLine('boss', def.introBubble, def.introBubbleMs)
      if (!introSkipRequested) await this.playIntroLine('player', def.playerResponseBubble, def.playerBubbleMs)
    }
    removeSkipButton?.()
    window.localStorage.setItem(seenKey, '1')

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
      if (!introSkipRequested) await this.playIntroLine('boss', '고작… 실패작 주제에 내 걸작들의 상대가 되겠나?', 2800)
      await this.performSummonToBack()
    }

    // 인트로·타이틀이 모두 끝나고 실제 보스 페이지에 들어서는 시점에 칸 기믹 격자를 켠다.
    // 여기서 처음 화면에 올라가므로 렌더러가 칸을 스르륵 띄우는 등장 연출을 태운다.
    this.activateGimmickGrid()

    // 인트로/타이틀이 모두 끝난 뒤 에나의 보스 등장 한마디(보스·플레이어 대사와 겹치지 않는 시점).
    this.inject.onBossIntro?.(def.name)

    this.inject.setInputLocked(false)

    // 격파 대기
    await new Promise<void>((resolve) => {
      this.eventState!.defeated = resolve
    })

    this.inject.recordNotice('보스 처치! 레일 보상이 떨어진다', 'win')
    const bossKind = this.eventState!.def.specialEnemyKind
    this.eventState = null
    // 30층(양초 고양이)·100층(녹지 않는 마녀)은 각 난이도의 '끝'이라 보상/시련을 내리지 않고 종료한다.
    // 호출부가 곧바로 클리어 창(검은 블러 페이드인)을 띄운다 — 빈 셔터 위 보상 하강/셔터 상승 없이.
    if (bossKind === 'waxCat' || bossKind === 'waxWitch') {
      this.tm.setTurnMode('normal_turn')
      return
    }
    await this.stageBossRewardChests(savedField, bossKind)

    this.tm.setTurnMode('normal_turn')
    if (!def.skipForcedTrial) {
      await this.inject.openTrialOverlayForced()
    }

    // 악마 소환 커튼: stageBossRewardChests 안에서 openDemonCurtain()이 이미 처리한다.
    // 혹시 보상 단계를 건너뛴 경우를 대비한 안전망.
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
  /**
   * 양초 고양이의 공격 주기 능력 — **주기는 그대로, 2페이지에 뺏기가 얹힌다**.
   *
   *   1페이지: 손패를 `CAT_GIFT_CARDS`장 굴려 준다. 온보딩 보스라 첫 보스전에서 손이
   *            마르지 않게 하는 배려이고, "장난치며 갖고 논다"는 성격에도 맞는다.
   *   2페이지: 그 뒤에 `CAT_PAGE_TWO_STEAL_CARDS`장을 도로 가져간다.
   *
   * 순서가 **주기 → 뺏기**여야 하는 이유: 뺏는 후보가 방금 받은 두 장이 될 수도, 원래
   * 쥐고 있던 패가 될 수도 있어야 "줬다 뺏는다"가 한 주기 안에서 읽힌다. 두 박자 사이에
   * `pauseBeat()`를 두어 준 것과 뺏은 것이 한 덩어리로 뭉개지지 않게 한다.
   */
  private async resolveWaxCatTurn(): Promise<void> {
    if (!this.eventState) return
    await this.giftHandCards(CAT_GIFT_CARDS)
    if (this.eventState.halfPage < 2) return
    for (let i = 0; i < CAT_PAGE_TWO_STEAL_CARDS; i++) {
      await this.pauseBeat()
      await this.stealHandCard()
    }
  }

  /**
   * 양초 고양이: 랜덤 손패를 `count`장 흘려 준다.
   * 슬롯 도착은 살포 연출이 한 장씩 시차를 두고 그리므로 여러 장도 순서대로 읽힌다.
   */
  private async giftHandCards(count: number): Promise<void> {
    const character = this.gs.character
    if (!this.eventState) return
    const added: HandCard[] = []
    for (let i = 0; i < count; i++) {
      const card = DropSystem.generateDrop('enemy-kill')
      if (character.addHandCard(card)) added.push(card)
    }
    if (added.length === 0) {
      this.inject.recordNotice('양초 고양이가 손패를 흘렸지만 손이 가득 차 있었다', 'info')
      return
    }
    this.inject.render()
    const names = added.map((card) => getHandCardDef(card.defId).name).join(' · ')
    this.inject.recordNotice(`양초 고양이가 ${names}을(를) 굴려 보냈다 — 손패 +${added.length}`, 'info')
    // 동전 살포(animateBossScatterToHandSlots)는 양초 백작의 탐욕의 동전 전용 연출이다
    // (둥근 금화 = 그 유물의 정체성). 고양이가 주는 건 일반 손패라 카드 토큰
    // (animateResourceTrailFromCard → 'hand')을 쓴다 — 세로로 긴 사각 조각이라
    // 이 게임의 손패 획득 어휘와 일치한다.
    await this.br.animateResourceTrailFromCard(this.eventState.card.id, 'hand', added.length, 'hand-recovery')
  }

  /** 양초 고양이 2페이지: 손패 1장을 강탈한다. 촛농/양초/불씨(밀랍·불)면 삼켜서 보스가 HP를 회복한다. */
  private async stealHandCard(): Promise<void> {
    const character = this.gs.character
    if (character.hand.length === 0 || !this.eventState) return
    const idx = Math.floor(Math.random() * character.hand.length)
    const stolen = character.hand[idx]
    const name = getHandCardDef(stolen.defId).name
    const isWax = stolen.defId === 'ember' || stolen.defId === 'candle' || stolen.defId === 'wax-drop'
    // 마녀 소각 연출 참고 — 카드를 제거하기 전에 강탈 애니메이션(고양이로 낚아챔)을 먼저 재생한다.
    await this.br.animateBossStealHandSlot(this.eventState.card.id, idx)
    character.removeHandCardAt(idx)
    this.inject.render()
    if (isWax) {
      const healed = this.eventState.card.healEnemyLike(5)
      this.inject.recordNotice(`양초 고양이가 ${name}을(를) 삼켜 ${Math.max(0, healed)} 회복했다`, 'hurt')
    } else {
      this.inject.recordNotice(`양초 고양이가 ${name}을(를) 빼앗았다`, 'hurt')
    }
    this.inject.render()
  }

  private async scatterGreedCards(bossCardId: string): Promise<void> {
    const character = this.gs.character
    const count = GREED_SCATTER_MIN + Math.floor(Math.random() * (GREED_SCATTER_MAX - GREED_SCATTER_MIN + 1))
    let greedCount: number
    if (count === 2) greedCount = 1
    else if (count === 4) greedCount = 2
    else greedCount = 1 + Math.floor(Math.random() * 2) // 3장은 탐욕동전 1 또는 2
    const randomCount = count - greedCount

    const cards: HandCard[] = []
    for (let i = 0; i < greedCount; i++) cards.push(DropSystem.makeCard(GREED_COIN_ID))
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

  /**
   * 30F 양초 백작의 공격 주기 전반부 — **순차적으로** 보이게 나눈 세 박자다.
   *
   *   탐욕 살포(화면에 흩뿌림 → 손패로 짤랑) → [2P] 탐욕의 값 → (호출부의 타격)
   *
   * 붙여 두면 뿌리면서 동시에 때리는 것처럼 읽혀 무슨 일이 있었는지 남지 않는다.
   * 플레이어가 죽었으면 true — 호출부는 그대로 턴을 끝낸다.
   */
  private async resolveWaxArmyGreedTurn(bossCardId: string): Promise<boolean> {
    const state = this.eventState
    if (!state) return false
    await this.scatterGreedCards(bossCardId)
    await this.pauseBeat()
    if (state.halfPage >= 2) {
      if (await this.collectGreedCoinToll()) return true
      await this.pauseBeat()
    }
    return false
  }

  /**
   * 30F 2페이지 '탐욕의 값' — 손에 쥔 탐욕의 동전 1장당 1피해.
   * 동전은 쓰면 이득이지만 쥐고 있으면 매 주기 값을 치른다(쓸까 말까의 이지선다).
   */
  private async collectGreedCoinToll(): Promise<boolean> {
    const character = this.gs.character
    const slots = character.hand
      .map((card, index) => (card?.defId === GREED_COIN_ID ? index : -1))
      .filter((index) => index >= 0)
    if (slots.length === 0) return false

    this.inject.recordNotice(`탐욕의 값 — 손에 쥔 탐욕의 동전 ${slots.length}장이 값을 요구한다`, 'hurt')
    await this.br.animateGreedCoinToll(slots, () => {
      character.takeDamage(GREED_COIN_TOLL_DAMAGE)
      // 수치·버스트는 기다리지 않는다 — 한 장씩 파바박 꽂히는 리듬을 끊지 않기 위해서다.
      void this.br.animatePlayerDamageImpact(GREED_COIN_TOLL_DAMAGE)
      this.inject.render()
    })
    this.inject.recordNotice(`탐욕의 값! 플레이어가 ${slots.length * GREED_COIN_TOLL_DAMAGE} 피해를 받았다`, 'hurt')
    this.inject.render()
    if (!character.isAlive() || character.authoritySurvivePending) {
      await this.inject.handlePlayerDeath()
      return true
    }
    return false
  }

  /** 보스 행동 사이의 한 박자. 붙어 있으면 동시에 일어난 일로 읽힌다. */
  private pauseBeat(): Promise<void> {
    return new Promise<void>((resolve) => window.setTimeout(resolve, BOSS_TURN_BEAT_MS))
  }
  /**
   * 지금 걸려 있는 페이지 게이트. 모든 보스의 페이지 경계가 이 한 창구를 지난다 —
   * 하한(floor)은 경계를 넘는 피해를 깎기 전에 버려 HP바가 깜빡이지 않게 하고,
   * 요구 조건(requirement)은 그 하한을 무엇으로 여는지를 정한다.
   *
   *  - 'none'       : HP가 하한에 닿는 순간 스스로 열린다(기존 waxWitch/waxDemon 전환).
   *  - 'cell-break' : 닿은 뒤 부위를 하나 더 깨야 열린다. 격자가 있는 보스만 쓸 수 있다.
   *
   * 새 보스에 리미트 페이지를 붙이려면 여기 분기 하나와 전환 처리(resolve*AfterDamage)
   * 하나면 된다.
   */
  private bossPageGate(): { floor: number; requirement: 'none' | 'cell-break' } | null {
    const state = this.eventState
    if (!state) return null
    if (state.def.specialEnemyKind === 'waxWitch') {
      const [firstFloor, secondFloor] = waxWitchPageFloors(this.eventState?.def.maxHp ?? 0)
      if (state.witchPage === 1) return { floor: firstFloor, requirement: 'none' }
      if (state.witchPage === 2) return { floor: secondFloor, requirement: 'none' }
      return null
    }
    if (state.def.specialEnemyKind === 'waxDemon' && state.demonPage === 1) {
      return { floor: state.nextDemonPageAt, requirement: 'none' }
    }
    // 절반 HP 페이지 보스: 반쯤 깎으면 한 번 멈춘다. 격자가 켜져 있으면 그 자리에서
    // 부위를 하나 더 깨야 열리고(약점만 긁어 HP를 미는 진행을 끊는다), 격자가 없으면
    // 닿는 순간 스스로 열린다.
    if (HALF_PAGE_BOSSES.has(state.def.specialEnemyKind) && state.halfPage === 1) {
      return {
        floor: halfPageFloor(state.def.maxHp),
        requirement: this.gimmicks.isActive ? 'cell-break' : 'none',
      }
    }
    return null
  }

  /**
   * HP바에 그릴 페이지 경계선. 게이트와 같은 값에서 파생하되 **이미 지난 경계도** 남긴다 —
   * 뚫린 경계는 열린 표시로 바뀌어 "여기는 부쉈다"가 막대 위에 남는다.
   */
  bossPageMarkers(): Array<{ threshold: number; open: boolean }> {
    const state = this.eventState
    if (!state) return []
    const kind = state.def.specialEnemyKind
    if (kind === 'waxWitch') {
      const [firstFloor, secondFloor] = waxWitchPageFloors(this.eventState?.def.maxHp ?? 0)
      return [
        { threshold: firstFloor, open: state.witchPage > 1 },
        { threshold: secondFloor, open: state.witchPage > 2 },
      ]
    }
    if (kind === 'waxDemon') {
      return [{ threshold: state.nextDemonPageAt, open: state.demonPage > 1 }]
    }
    if (HALF_PAGE_BOSSES.has(kind)) {
      return [{ threshold: halfPageFloor(state.def.maxHp), open: state.halfPage > 1 }]
    }
    return []
  }

  /**
   * 보스가 지금 몇 페이지인가 + 어떤 빛을 띠는가. 페이지가 오를수록 카드에 열기가 돈다.
   * 이벤트로 불려 나온 악마만 보랏빛이다 — 다른 보스와 출신이 다르다는 표시다.
   */
  bossPagePhase(): { page: number; tone: 'ember' | 'violet' } | null {
    const state = this.eventState
    if (!state) return null
    const kind = state.def.specialEnemyKind
    if (kind === 'waxWitch') return { page: state.witchPage, tone: 'ember' }
    if (kind === 'waxDemon') return { page: state.demonPage, tone: 'violet' }
    if (HALF_PAGE_BOSSES.has(kind)) return { page: state.halfPage, tone: 'ember' }
    return null
  }

  /** 페이지 게이트 HP 하한. 게이트가 없으면 0(제한 없음). */
  private bossPageFloor(): number {
    return this.bossPageGate()?.floor ?? 0
  }

  /**
   * 지금 페이지 하한이 피해를 실제로 막고 있는가 — 막고 있으면 화면에 띄울 경고 문구.
   * 스스로 열리는 게이트('none')는 다음 beat에 전환 연출이 나가므로 알릴 것이 없다.
   */
  pageGateWarning(): { cardId: string; text: string } | null {
    const state = this.eventState
    const gate = this.bossPageGate()
    if (!state || !gate || gate.requirement !== 'cell-break') return null
    if (state.card.getHealth() > gate.floor) return null
    return { cardId: state.card.id, text: PAGE_GATE_WARNING_TEXT }
  }

  /** 손패/조합 등 외부 피해가 페이지 경계를 넘어 보스 HP를 깎았을 때, UI diff가 읽기 전에 하한으로 되돌린다. */
  clampExternalDamageToPageFloor(): void {
    const floor = this.bossPageFloor()
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
    void this.br.playShieldBlockFeedback(this.br.findCardElement(state.card.id), blocked)
    return blocked
  }


  // ---- waxWitch 전용 페이지 메커니즘 ----------------------------------------

  /** 100F 1페이지 능력: 공격주기(`turn % attackInterval === 0`)마다 손패를 소각한다.
   *  2·3페이지에서도 그대로 유지되지만 주기당 1회이며 장수는 누적되지 않는다.
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

    const [firstFloor, secondFloor] = waxWitchPageFloors(this.eventState?.def.maxHp ?? 0)
    if (state.witchPage === 1) {
      if (hp <= firstFloor) {
        // 페이지 경계는 초과 피해를 버리고 정확히 경계에서 멈춘다.
        if (state.card.health < firstFloor) state.card.health = firstFloor
        state.witchPage = 2
        state.turn = 0
        this.syncPageState()
        this.br.setBossAttackCountdown(state.def.attackInterval)
        this.inject.render()
        await this.playIntroLine('boss',   '그래, 정말 이 세계는 이제 다 끝났네.', 3100)
        await this.playIntroLine('player', '같잖은 말장난을...', 2500)
        this.inject.onBossPhase?.(state.def.name, 'witch-page-2')
        this.inject.setInputLocked(false)
        return true
      }
    }

    if (state.witchPage === 2 && hp <= secondFloor) {
      // 경계에서 멈춘 뒤 즉시 3페이지 소환을 연다.
      if (state.card.health < secondFloor) state.card.health = secondFloor
      state.witchPage = 3
      state.turn = 0
      this.syncPageState()
      this.br.setBossAttackCountdown(state.def.attackInterval)
      this.inject.render()
      await this.playIntroLine('boss',   '이제 너도 그만 사라져.', 2500)
      await this.playIntroLine('player', '. . .', 3300)
      await this.performWitchSummonToBack()
      this.inject.onBossPhase?.(state.def.name, 'witch-page-3')
      this.inject.setInputLocked(false)
      return true
    }

    return beforeHp !== null && beforeHp !== hp && false
  }

  /**
   * 절반 HP 2페이지 전환. 격자가 켜진 보스는 그 자리에서 **부위를 하나 더 깨야** 열리는
   * 리미트가 되고(약점만 긁어 HP만 미는 진행을 끊는다), 격자가 없는 보스는 닿는 순간
   * 열린다. 리미트가 잠겨 있는 동안에는 매 타격이 피해 대신 경고 문구를 띄운다.
   */
  private async resolveHalfPage(): Promise<boolean> {
    const state = this.eventState
    if (!state || state.halfPage !== 1) return false
    const gate = this.bossPageGate()
    if (!gate || state.card.getHealth() > gate.floor) return false

    if (gate.requirement === 'cell-break') {
      // 깰 부위가 하나도 안 남았다면 요구 조건이 성립하지 않는다 — 잠그지 않고 연다.
      const noCellsLeft = this.gimmicks.brokenCount >= this.gimmicks.cellCount
      // 리미트 도달 beat: 이 순간의 파괴 칸 수를 기준선으로 잡고 요구 조건을 알린다.
      if (state.halfPageBrokenMark === null && !noCellsLeft) {
        state.halfPageBrokenMark = this.gimmicks.brokenCount
        if (state.card.health < gate.floor) state.card.health = gate.floor
        this.inject.recordNotice(`${state.card.name}이(가) 밀랍으로 굳었다 — 칸을 파괴해야 더 들어간다`, 'info')
        this.inject.render()
        await this.br.playBossPageGateWarning(state.card.id, PAGE_GATE_WARNING_TEXT, true)
        return false
      }
      // 기준선을 넘겼다 = 리미트에서 부위를 하나 더 깼다 → 페이지가 열린다.
      if (!noCellsLeft && this.gimmicks.brokenCount <= (state.halfPageBrokenMark ?? 0)) return false
    } else if (state.card.health < gate.floor) {
      // 경계 초과 피해는 버리고 정확히 경계에서 멈춘다(HP바가 아래로 깜빡이지 않게).
      state.card.health = gate.floor
    }

    state.halfPage = 2
    state.turn = 0
    this.syncPageState()
    this.br.setBossAttackCountdown(state.def.attackInterval)
    this.inject.render()
    for (const line of HALF_PAGE_TWO_LINES[state.def.specialEnemyKind] ?? []) {
      await this.playIntroLine(line.speaker, line.text, line.holdMs)
    }
    await this.applyHalfPageTwoEntry()
    this.inject.onBossPhase?.(state.def.name, 'half-page-2')
    this.inject.setInputLocked(false)
    return true
  }

  /**
   * 2페이지 진입 순간 1회 발동하는 보스별 능력.
   * 매 턴 도는 능력(고양이 강탈·기사단장 추가 카드)은 각자의 턴 처리에 있고,
   * 여기 있는 것은 **전환 시점에 판을 바꾸는 것**뿐이다.
   */
  private async applyHalfPageTwoEntry(): Promise<void> {
    const state = this.eventState
    if (!state) return
    if (state.def.specialEnemyKind === 'waxSculptor') {
      // 조각사 본체는 그대로다 — 부푸는 것은 **소환된 양초 조각들**이다.
      const swollen = this.swellFieldEnemies(SCULPTOR_SWELL_HP)
      if (swollen > 0) {
        this.inject.recordNotice(
          `밀랍 조각사가 종복 ${swollen}체에 밀랍을 덧발랐다 — 비대화(체력 +${SCULPTOR_SWELL_HP})`,
          'hurt'
        )
        this.inject.render()
        await this.br.animateEnemySwell(this.getAliveSummonedCards().map((c) => c.id))
      }
    }
  }

  /**
   * 필드의 일반 적 전체를 비대화시킨다 — 체력만 소급으로 붙이고 '부풀었다' 표시를 건다.
   * 스탯 소급은 시련 '광란'과 같은 경로라 합체 적 배수·이미 입은 피해가 알아서 맞는다.
   * 보스와 특수 적은 대상에서 빠진다.
   */
  private swellFieldEnemies(hpBonus: number): number {
    let count = 0
    const seen = new Set<Card>()
    for (const lane of this.gs.lanes) {
      for (let d = 0; d < LANE_DISTANCE_COUNT; d++) {
        const card = lane.getCardAtDistance(d)
        if (!card || seen.has(card) || card.type !== CardType.ENEMY) continue
        seen.add(card)
        card.applyTrialEnemyStatBonus(0, hpBonus)
        card.swollen = true
        count++
      }
    }
    return count
  }

  /** 100F 2페이지: 보스 손패 4장을 공격 전에 사용하고, 같은 효과 2장 이상이면 추가 1회 발동한다. */
  private async resolveWaxWitchPageTwoTurn(bossCardId: string): Promise<boolean> {
    const state = this.eventState!
    const character = this.gs.character
    const amount = state.def.handCardAmount
    const effects: WaxKnightCardEffect[] = Array.from({ length: WITCH_PAGE_TWO_CARDS }, () => {
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

    // 카드가 전부 발동된 뒤에 때린다(기사단장과 같은 박자).
    await this.pauseBeat()
    character.takeDamage(state.def.attack)
    await this.br.animateBossSlamAttack(bossCardId)
    await this.br.animatePlayerDamageImpact(state.def.attack)
    this.inject.recordNotice(`녹지 않는 마녀의 반격! 플레이어가 ${state.def.attack} 피해를 받았다`, 'hurt')
    this.inject.render()
    this.inject.applyAnomalyHealthLoss()
    await this.inject.applyPreciousHeadCheck()
    return await this.retaliateGracefulResponse([bossCardId])
  }

  // ---- waxKnight 전용 카드 사용 메커니즘 ------------------------------------

  /** 불씨 기사단장의 주기 행동: 특징(손패 2장 발동)을 먼저 연출한 뒤 기본 타격.
   *  품격있는 대처 반격으로 보스가 쓰러지면 true를 반환한다. */
  private async resolveWaxKnightCardTurn(bossCardId: string): Promise<boolean> {
    const state = this.eventState!
    const character = this.gs.character

    // 1) 특징 연출: 손패를 한 번에 펼쳐 빠르게 순차 발동한다(이펙트 목적지는 살아 있는 보스 셀 기준).
    //    2페이지는 카드가 한 장 늘고 각 카드의 수치도 1씩 오른다 — 같은 패턴이 무거워진다.
    const page2 = state.halfPage >= 2
    const cardCount = KNIGHT_BASE_CARDS + (page2 ? KNIGHT_PAGE_TWO_EXTRA_CARDS : 0)
    // 효과 3종뿐이라 3장이면 중복 없이 전부 나온다(sampleWithoutReplacement 상한).
    const cards = sampleWithoutReplacement<WaxKnightCardEffect>(['shield', 'heal', 'strike'], cardCount)
    const amount = state.def.handCardAmount + (page2 ? KNIGHT_PAGE_TWO_AMOUNT_BONUS : 0)
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

    // 2) 카드가 **전부 발동된 뒤** 한 박자 띄우고 타격한다. 붙여 두면 마지막 카드와
    //    돌진이 동시에 일어난 일로 읽혀 무엇이 있었는지 남지 않는다.
    await this.pauseBeat()
    character.takeDamage(state.def.attack)
    await this.br.animateBossSlamAttack(bossCardId)
    await this.br.animatePlayerDamageImpact(state.def.attack)
    this.inject.recordNotice(`불씨 기사단장의 돌진! 플레이어가 ${state.def.attack} 피해를 받았다`, 'hurt')
    if (!character.isAlive() || character.authoritySurvivePending) return false

    // 변칙: 기사단장 한 턴에 잃은 체력 10마다 불씨 +1.
    this.inject.applyAnomalyHealthLoss()
    await this.inject.applyPreciousHeadCheck()
    // 품격있는 대처: 기사단장의 한 턴 타격에 한 번 되받아친다.
    return await this.retaliateGracefulResponse([bossCardId])
  }

  // ---- waxSculptor 전용 페이즈 메커니즘 ------------------------------------

  /** 3턴 트리거 시 조각사를 후방으로 이동시키고 dist-0에 적을 소환한다. */
  private async handleSculptorPhaseShift(): Promise<void> {
    await this.performSummonToBack()
    // 반복 트리거지만 phaseKey가 같아 호출부 중복 방지로 첫 후퇴에서만 발화된다.
    this.inject.onBossPhase?.(this.eventState!.def.name, 'sculptor-back')
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
    // 불씨 티어 공격력 보너스를 소환 적에게도 적용한다(필드 일반 적과 동일 — 불씨 부족 시 더 위협적).
    const emberAtk = EmberSystem.getEnemyStatBonus(this.tm.getEmberTier()).atk
    // 2페이지부터는 새로 부르는 양초 조각도 처음부터 부푼 채로 나온다 — 전환 시점의
    // 1회성 버프가 아니라 그 뒤 소환에도 계속 붙어야 "판이 무거워졌다"가 유지된다.
    const swellHp = state.halfPage >= 2 ? SCULPTOR_SWELL_HP : 0
    for (let i = 0; i < SCULPTOR_SUMMON_COUNT; i++) {
      const enemyDef = pool[Math.floor(Math.random() * pool.length)]
      const enemy = new Card(
        `sculptor-summon-${i}-${Math.random()}`,
        CardType.ENEMY,
        enemyDef.name,
        enemyDef.description,
        (enemyDef.healthOrDamage ?? 1) + swellHp,
        enemyDef.attack ?? 1,
        { enemySpriteId: enemyDef.enemySpriteId, enemyPower: enemyDef.enemyPower },
      )
      enemy.emberAtkBonus = emberAtk
      enemy.swollen = swellHp > 0
      this.gs.lanes[i].setCardAtDistance(0, enemy)
      state.summonedEnemyIds.add(enemy.id)
    }

    this.inject.render()
    this.inject.recordNotice(
      swellHp > 0
        ? '밀랍 조각사가 비대해진 양초 조각들을 소환했다!'
        : '밀랍 조각사가 후퇴하며 종복들을 소환했다!',
      'hurt'
    )
    // 좌→우 순서로 소환 연출 (enemyIds는 레인 0→1→2)
    const summonedIds = [...state.summonedEnemyIds]
    await this.br.animateSculptorSummonEnemies(summonedIds)
    if (swellHp > 0) await this.br.animateEnemySwell(summonedIds)
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
    // 몸이 3×3에서 2×3으로 접혔다 — 격자 재배치는 syncGimmickShapeToBody가 몸집 변화를
    // 보고 알아서 돈다(칸 6개로 줄고 약점이 새로 굴려진다).
    this.syncGimmickGrid()

    // 최종 보스 소환수는 90F 후기 적 풀을 기반으로 광폭화 버프를 받은 독립 개체다.
    const pool = ENEMY_DEFINITIONS.slice(12, 18)
    const emberAtk = EmberSystem.getEnemyStatBonus(this.tm.getEmberTier()).atk
    for (let i = 0; i < WITCH_SUMMON_COUNT; i++) {
      const enemyDef = pool[Math.floor(Math.random() * pool.length)]
      const enemy = new Card(
        `witch-summon-${i}-${Math.random()}`,
        CardType.ENEMY,
        enemyDef.name,
        enemyDef.description,
        (enemyDef.healthOrDamage ?? 1) + WITCH_ENRAGE_HP,
        (enemyDef.attack ?? 1) + WITCH_ENRAGE_ATK,
        { enemySpriteId: enemyDef.enemySpriteId, enemyPower: (enemyDef.enemyPower ?? 0) + 100 },
      )
      enemy.emberAtkBonus = emberAtk
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

  /** 생존 소환 적이 플레이어를 친다. 굳은(밀랍) 적은 이번 공격을 거르고 굳음 1턴 소모.
   *  label='선공'(불씨 부족 선공) / '반격'(평상시). 플레이어 사망 처리 시 true 반환. */
  private async summonedEnemiesStrike(label: '선공' | '반격'): Promise<boolean> {
    const character = this.gs.character
    const alive = this.getAliveSummonedCards()
    // 굳은 적은 공격하지 못하고 굳음만 1턴 줄어든다(밀랍이 실제로 효과를 낸다).
    for (const e of alive) if (e.isFrozen()) e.tickFrozen()
    const attackers = alive.filter((e) => !e.isFrozen())
    if (attackers.length === 0) {
      this.inject.render()
      return false
    }
    const hits = attackers.map((e, idx) => ({ cardId: e.id, cardName: e.name, laneIndex: idx, damage: e.getDamage() }))
    for (const e of attackers) character.takeDamage(e.getDamage())
    const totalDmg = attackers.reduce((s, e) => s + e.getDamage(), 0)
    await this.br.animateEnemyAttacks(hits)
    await this.br.animatePlayerDamageImpact(totalDmg)
    this.inject.recordNotice(`소환 적들의 ${label}! -${totalDmg}`, 'hurt')
    this.inject.render()
    if (!character.isAlive() || character.authoritySurvivePending) {
      await this.inject.handlePlayerDeath()
      return true
    }
    this.inject.applyAnomalyHealthLoss()
    await this.inject.applyPreciousHeadCheck()
    await this.retaliateGracefulResponse(attackers.map((e) => e.id))
    return false
  }

  /** 소환된 적 클릭 처리. 일반 턴 흐름(리필/상점/제단/합산)을 타지 않도록 컨트롤러가 직접 처리한다. */
  async handleSummonedEnemyClick(card: Card): Promise<void> {
    if (!this.eventState || !this.isSummonedEnemy(card)) return
    const state = this.eventState
    const character = this.gs.character
    this.inject.setInputLocked(true)

    // 불씨 부족(꺼져감/꺼졌다 티어) → 소환 적이 먼저 친다(선공). 굳은 적은 제외.
    const firstStrike = this.tm.isEnemyFirstStrike()
    if (firstStrike) {
      if (await this.summonedEnemiesStrike('선공')) return
    }

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

    // 생존 소환 적 반격 — 선공으로 이미 친 턴이면 생략(이중 타격 방지). 굳은 적은 거른다.
    if (!firstStrike) {
      if (await this.summonedEnemiesStrike('반격')) return
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
        await this.inject.applyPreciousHeadCheck()
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
    this.syncPageState()
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
    this.inject.onBossPhase?.(state.def.name, 'demon-page-2')
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
    this.clearGimmickGrid()
    this.inject.render()
    // 격파 연출·레일 정리가 끝난 시점 — 에나의 격파 한마디가 컷신 대사를 덮지 않는다.
    this.inject.onBossKill?.(state.def.name)
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
      bountyCard = new Card('boss-reward-bounty', CardType.TREASURE, '현상금',  '1~3$')
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

    // 보상 수령 완료 후 짧은 딜레이 → 커튼 열기 → 일반 레일로 복귀.
    await new Promise((r) => window.setTimeout(r, 300))
    await this.br.openDemonCurtain()
    this.postPhaseHandLocked = false
    this.inject.setInputLocked(false)
  }
}
