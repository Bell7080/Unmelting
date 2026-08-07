/**
 * GameBoardRenderer - 3-lane × 3-row vertical rail.
 *
 * Layout (top → bottom):
 *   distance 2  faintest preview
 *   distance 1  dimmer preview
 *   distance 0  full-opacity active row (the only interactive row)
 *                          🕯  Player Card
 *                          📦  Items
 *
 * Grouping: when a Card instance is referenced by adjacent lane slots in the
 * same row, that Card is rendered ONCE as a cell that spans those columns.
 *
 * Interaction:
 *   1st click   → card glows (selected)
 *   2nd click   → fires `cardAction` event (action runs in main loop)
 */

import { GameState } from '@core/GameState'
import { Card, CardType, type FlowerKind } from '@entities/Card'
import { Lane, LANE_DISTANCE_COUNT } from '@entities/Lane'
import type {
  BombExplosion,
  EnemyHit,
  FlowerBloom,
  FlowerGrowth,
  FlowerWilt,
  TreasureChange,
} from '@core/TurnManager'
import { spriteForCard, spriteForHandCard, SpriteUrls, recipeSprite001 } from '@ui/Sprites'
import type {
  EventDefinition,
  MinionExchangeConfig,
  CountRpsConfig,
  EventResourceSink,
  EventResourceSnapshot,
} from '@data/Events'
import type { EventMinigameMoment } from '@data/CompanionLines'
import { CandleMode, Character } from '@entities/Character'
import { HandCardId, HandEffectTargeting } from '@entities/HandCard'
import { getHandCardDef } from '@data/HandCards'
import { EmberSystem } from '@systems/EmberSystem'
import { bossFixtureMatchesFilter } from '@systems/BossGimmickManager'
import { getRelicDef, relicStackFeedback, type RelicId } from '@data/Relics'
import { HAND_CARD_RARITY, RARITY_CLASS_BY_TIER } from '@data/ShopPools'
import { RECIPES, type Recipe } from '@data/Recipes'
import type { JobDef } from '@data/Jobs'
import { SquareBurst, type BurstTheme } from '@ui/SquareBurst'
import { GAME_BOARD_STYLES } from '@ui/styles/GameBoardStyles'
import { initTouchBody, attachHandCardTouch, initLongPressShiftDetail } from '@ui/MobileTouchManager'
import {
  bookIcon,
  candleIcon,
  comboGaugeIcon,
  experienceIcon,
  handCardIcon,
  heartIcon,
  shieldIcon,
  sparkleIcon,
  swordIcon,
  trapIcon,
} from '@ui/Icons'
import type { EnaDisposition } from '@systems/EnaDisposition'
import type { EnaLearningSnapshot } from '@systems/CompanionSystem'
import { escapeHtml } from '@ui/renderer/Html'
import { CardFaceRenderer } from '@ui/renderer/CardFaceRenderer'
import { CompendiumView } from '@ui/renderer/CompendiumView'
import { ExperienceView } from '@ui/renderer/ExperienceView'
import { ResourceTrailFx, HAND_TOKEN_LAND_MS, handTokenStaggerMs } from '@ui/renderer/ResourceTrailFx'
import { JobSelectView } from '@ui/renderer/JobSelectView'
import { EventOverlayView } from '@ui/renderer/EventOverlayView'
import { BossFxView } from '@ui/renderer/BossFxView'
import { ShopOverlayView } from '@ui/renderer/ShopOverlayView'
import { sfx } from '@/audio/SfxManager'
import { pointerDistanceToRect } from '@ui/PointerProximity'

// 뷰 계약 타입은 renderer/RendererTypes.ts로 분리 — 기존 import 경로 호환을 위해 재수출한다.
export * from '@ui/renderer/RendererTypes'
import type {
  BossGimmickGridView,
  BossGimmickStrikeView,
  BossHpRollStart,
  CardActionDetail,
  CardProximityDetail,
  ChainHints,
  ForcedTrialCardView,
  EnaHintTargets,
  HandTargetingMode,
  ItemActionDetail,
  ResourceTrailTarget,
  ScorePanelState,
  ShopOfferView,
  ShopPackPickerView,
  ShopStateView,
  SpawnWeightContext,
} from '@ui/renderer/RendererTypes'

/** Tracks one in-flight number roll so a re-render can resume it on the new
 *  span at the current animated value instead of letting innerHTML replace it
 *  with the final target (which produced the visible "snaps to target"
 *  symptom on large score gains). */
interface CounterAnimationState {
  startedAt: number
  duration: number
  startValue: number
  endValue: number
  suffix: string
  popClass: boolean
}

/** 피격 체력 게이지 연출 길이. CSS `hp-damage-jolt`와 같은 값이어야 한다. */
/** 카드 낙하(card-enter-soft) 길이. CSS와 같은 값이어야 연출이 정확히 그만큼만 유지된다. */
const CARD_ENTER_MS = 340
/** 보스 격자 등장·배율 리롤 연출 길이(칸별 시차 30ms × 8 + 본 애니메이션). CSS와 같은 값. */
const BOSS_GIMMICK_ENTER_MS = 900
const BOSS_GIMMICK_RELABEL_MS = 760

const HP_DAMAGE_PULSE_MS = 640

/** 방패로 막아 냈을 때의 흔들림 길이. CSS `shield-block-shake`와 같은 값이어야 한다. */
const SHIELD_BLOCK_SHAKE_MS = 380
/** 적 돌진이 플레이어에 닿는 순간(돌진 560ms의 0.58 지점). 막아 낸 표시가 이 박자에 나간다. */
const ENEMY_SLAM_IMPACT_MS = 325

/** 에나 강조 맥동 — 시작 지연 / 1회 길이 / 반복 횟수. CSS(.ena-hint-pulse)와 같은 값을 쓴다. */
const ENA_HINT_START_DELAY_MS = 240
const ENA_HINT_CYCLE_MS = 1350
const ENA_HINT_REPEAT = 3
/** 대상이 여럿일 때 하나씩 짚어 가는 간격 — 한꺼번에 켜면 어디를 보라는 건지 흩어진다. */
const ENA_HINT_STAGGER_MS = 180

export class GameBoardRenderer {
  /** 서브 렌더러 공유 — 보드 루트 요소. */
  readonly boardElement: HTMLElement
  private selected: { laneIndex: number; distance: number } | null = null
  private currentGameState: GameState | null = null
  /** 현재 런에서 잠긴 손패 카드 ID 집합. 도감에서 해금 여부 표시에 사용한다. */
  private lockedCardIds = new Set<HandCardId>()
  /** 현재 런에서 잠긴 레시피 ID 집합. 해금팩으로 해금 전까지 도감에서 ??? 로 표시한다. */
  private lockedRecipeIds = new Set<string>()
  private hasRendered = false
  private previousCardIds = new Set<string>()
  /** 카드 등장(낙하) 연출이 끝나는 시각(카드 id → epoch ms).
   *
   *  `is-entering`을 "이번 렌더에 처음 보이는 카드"에만 붙이면, 낙하 도중 다른 이유로
   *  render가 한 번 더 돌 때 그 클래스가 사라져 애니메이션이 통째로 끊긴다(카드가 뚝
   *  제자리로 스냅한다). 빗자루로 거미줄을 여러 장 치우는 것처럼 한 행동에서 렌더가
   *  몇 번씩 도는 구간에서 이게 화면이 버벅이는 것처럼 보였다.
   *  CLAUDE.md 규칙대로 **만료 시각을 상태로 두고 render가 다시 심어**, 남은 시간 동안
   *  클래스가 유지되고 restoreBoardAnimationPhases가 재생 위치를 그대로 이어 붙인다. */
  private cardEnterUntil = new Map<string, number>()
  /** 온보딩 필드 만료 뱃지의 카드별 직전 표시 턴수. 값이 바뀐 렌더에만 팝(is-pop)을 1회 부여해
      매 렌더 DOM 재생성으로 인한 연속 깜빡임을 막는다(갱신 턴에만 딱 한 번). */
  private fieldExpiryLastShown = new Map<string, number>()
  /** Track the last score/coin pulse keys so the pop animation only re-fires
   *  when the value actually changes, not on every render. */
  private previousScorePulseKey = 0
  private previousCoinPulseKey = 0
  /** Last resource values rendered or animated in the left panel. These let
   *  score/coin increases start from the old number and tick up in-place
   *  while the sparkle/burst effect is playing. */
  private displayedScoreValue = 0
  private displayedCoinValue = 0
  /** Generic HUD counters (HP, shield, ember, candle gauge, attack) keep
   *  their own last rendered value so full re-renders can still count from
   *  the previous visible number instead of jumping straight to the model. */
  private displayedHudCounters = new Map<string, number>()
  /** 현재 렌더된 보스의 최대 HP. boss-hp 카운터 롤링 중 막대 폭을 다시 계산할 때 쓴다. */
  private bossHpMax = 1
  /** 마지막으로 렌더된 보스 모델 HP(= 피해가 이미 반영된 값). 칸 타격 연출이
   *  "이 beat 시작 전 HP"를 되짚어 단계별 롤링을 시작하는 기준이다. */
  private bossHpCurrent = 0
  /** In-flight counter rolls keyed by stable element identity ('score',
   *  'coin', `hud:<key>`). The roll lifetime can span re-renders: each
   *  render's innerHTML wipe orphans the previous span, and this map is what
   *  lets animateRenderedResourceCounters take over the freshly rendered
   *  span at the current animated value instead of letting it snap to the
   *  final target. */
  private activeCounterAnimations = new Map<string, CounterAnimationState>()
  /** Immediate gain feedback can be followed by a full board re-render. Keep
   *  that pulse key alive for one CSS beat so the newly-rendered number still
   *  receives the ✦ sparkle class instead of only leaving the body SquareBurst. */
  private activeScorePulseKey = 0
  private activeCoinPulseKey = 0
  private activeScorePulseUntil = 0
  private activeCoinPulseUntil = 0
  /** Track the displayed turn so the turn-brand only shimmers when the
   *  number actually advances (not on every intra-turn render). */
  private previousTurn = -1
  private previousGroupSpans = new Map<string, number>()
  /** Hand-card UIDs from the previous render — used to mark only NEW cards
   *  with `is-entering` so the drop animation does not re-fire on every full
   *  re-render of the hand panel. */
  private previousHandUids = new Set<string>()
  /** Same idea for the chain banner — track per-event uids so only newly
   *  appended chain entries play their pop-in animation. */
  private previousChainUids = new Set<string>()
  /** 지금 화면에서 도는 에나 강조 레이어들 — 다음 설명이나 플레이어 행동에 한꺼번에 거둔다. */
  private readonly activeEnaHintPulses = new Set<HTMLElement>()
  /** 무엇을 언제부터 가리키는 중인지 — 렌더가 레이어를 지워 가도 남은 시간만큼 다시 심는다. */
  private activeEnaHint:
    | { targets: Required<EnaHintTargets>; startedAt: number; endsAt: number }
    | null = null
  private handTargetingMode: HandTargetingMode | null = null
  /** Owned relic cards can be click-pinned for reading long text without
   *  requiring the mouse to stay perfectly over the fanned card. */
  private pinnedRelicId: RelicId | null = null
  /** Index of the hand slot currently under the cursor; null when no slot is hovered.
   *  Tracked via delegation so renders can restore the preview without relying on CSS :hover. */
  private hoveredHandSlotIndex: number | null = null
  /** 포인터가 가까이 있는 다음 줄 카드. 같은 카드 위에서 mousemove가 반복돼도 소개 신호는 한 번만 보낸다. */
  private nearbyIntroCardId: string | null = null
  /** 유물 효과 텍스트 {{spawn}} 치환에 쓰는 현재 실효 스폰 가중치. render() 마다 갱신. */
  private currentSpawnWeightCtx: SpawnWeightContext | undefined = undefined

  /** 카드/유물 face HTML 빌더 — 서브 렌더러들과 공유한다. */
  readonly faces = new CardFaceRenderer({
    getGameState: () => this.currentGameState,
    getSpawnWeightCtx: () => this.currentSpawnWeightCtx,
  })

  /** 경험(에나 성향) 탭 뷰. */
  readonly experience = new ExperienceView()
  /** 도감 오버레이 뷰. */
  readonly compendium = new CompendiumView(this)
  /** 자원 트레일/버스트 연출 엔진 — 서브 렌더러들과 공유한다. */
  readonly trails = new ResourceTrailFx(this)
  /** 시작 직업 선택 오버레이 뷰. */
  readonly jobSelect = new JobSelectView(this)
  /** 이벤트 문 진입/씬/미니게임 오버레이 뷰. */
  readonly eventOverlay = new EventOverlayView(this)
  /** 보스 전투 연출·악마 커튼 뷰. */
  readonly bossFx = new BossFxView(this)
  /** 상점/제단 오버레이·셔터·팩 피커·강제 시련 뷰. */
  readonly shopOverlay = new ShopOverlayView(this)

  /** 서브 렌더러 공유 접근자 — 뷰 분리 후에도 렌더 상태의 단일 출처는 GameBoardRenderer다. */
  getGameState(): GameState | null { return this.currentGameState }
  getSpawnWeightCtx(): SpawnWeightContext | undefined { return this.currentSpawnWeightCtx }
  getLockedCardIds(): ReadonlySet<HandCardId> { return this.lockedCardIds }
  getLockedRecipeIds(): ReadonlySet<string> { return this.lockedRecipeIds }
  getBossGimmickGrid(): BossGimmickGridView | null { return this.bossGimmickGrid }
  getHandTargetingMode(): HandTargetingMode | null { return this.handTargetingMode }

  /** 보스 HP바 페이지 경계선(임계값 + 이미 뚫렸는지). 규칙의 출처는 BossEventController다. */
  private bossPageMarkers: ReadonlyArray<{ threshold: number; open: boolean }> = []
  /**
   * 보스가 몇 페이지인가 + 어떤 빛을 띠는가. 페이지가 오를수록 카드에 열기가 돌아
   * 수치를 읽지 않아도 "강해졌다"가 보인다. 이벤트로 불려 나온 악마만 보랏빛이다.
   */
  private bossPagePhase: { page: number; tone: 'ember' | 'violet' } | null = null
  setBossPageState(
    markers: ReadonlyArray<{ threshold: number; open: boolean }>,
    phase: { page: number; tone: 'ember' | 'violet' } | null
  ): void {
    this.bossPageMarkers = markers
    this.bossPagePhase = phase
  }

  /** 보스 칸 기믹 격자 뷰. BossEventController가 굴린 격자를 그대로 밀어 넣는다. */
  private bossGimmickGrid: BossGimmickGridView | null = null
  /** 격자 등장 연출이 끝나는 시각. 1회 소비가 아니라 **만료 시각**인 이유는 카드 낙하와
   *  같다 — 연출이 도는 동안 다른 이유로 render가 한 번 더 돌면 클래스가 사라져
   *  애니메이션이 통째로 끊긴다(화면이 버벅이는 것처럼 보인다). */
  private bossGimmickEnteringUntil = 0
  setBossGimmickGrid(grid: BossGimmickGridView | null): void {
    // null → 격자로 바뀌는 순간(= 보스 페이지 진입)에만 등장 연출을 예약한다.
    if (grid && !this.bossGimmickGrid) this.bossGimmickEnteringUntil = Date.now() + BOSS_GIMMICK_ENTER_MS
    if (!grid) this.bossGimmickEnteringUntil = 0
    this.bossGimmickGrid = grid
  }
  /** 등장 연출이 아직 도는 중인가. 만료 전까지 참이라 렌더가 몇 번 돌아도 이어진다
   *  (재생 위치는 restoreBoardAnimationPhases가 신원으로 인계한다). */
  consumeBossGimmickEntering(): boolean {
    return this.bossGimmickEnteringUntil > Date.now()
  }
  /** 렌더 호출 횟수. 여러 타일이 같은 render 안에서 같은 1회성 플래그를 보게 한다. */
  private renderPass = 0
  /** 피격 게이지 연출이 유지되는 시각. 이 사이의 render는 클래스를 다시 심는다. */
  private hpDamagePulseUntil = 0
  getRenderPass(): number { return this.renderPass }
  /** 새 배율 등장 연출이 끝나는 시각(등장 플래그와 같은 이유로 만료식이다). */
  private bossGimmickRelabelUntil = 0
  markBossGimmickRelabel(): void {
    this.bossGimmickRelabelUntil = Date.now() + BOSS_GIMMICK_RELABEL_MS
  }
  consumeBossGimmickRelabel(): boolean {
    return this.bossGimmickRelabelUntil > Date.now()
  }
  /** 배율 리롤 직전 — 지금 붙어 있는 배율 표기를 먼저 사그라뜨린다(연출은 BossFxView). */
  fadeBossGimmickLabels(): Promise<void> {
    return this.bossFx.fadeBossGimmickLabels()
  }
  /**
   * 페이지 게이트 경고 문구 공급자. 피해가 하한에 막힌 beat에서 데미지 수치 대신
   * 무엇이 필요한지를 알린다 — 상태는 보스 컨트롤러가 알고 있으므로 연출 시점에 물어본다.
   */
  private bossPageGateSource: (() => { cardId: string; text: string } | null) | null = null
  setBossPageGateSource(source: (() => { cardId: string; text: string } | null) | null): void {
    this.bossPageGateSource = source
  }
  bossPageGateNotice(): { cardId: string; text: string } | null {
    return this.bossPageGateSource?.() ?? null
  }
  /** 페이지 게이트 경고 문구를 띄운다 — 연출은 BossFxView. */
  playBossPageGateWarning(cardId: string, text: string, emphatic = false): Promise<void> {
    return this.bossFx.playBossPageGateWarning(cardId, text, emphatic)
  }
  /**
   * 보스 격자 칸 하나의 화면 자리. 그 칸에서 얻은 것(보물 부위의 손패)이 **얻은 자리에서**
   * 나오게 하려고 연다 — 보스 타일 중앙에서 나오면 아홉 칸 중 어디였는지가 사라진다.
   */
  bossGimmickCellRect(cellIndex: number): DOMRect | null {
    return this.bossFx.findBossGimmickCell(cellIndex)?.getBoundingClientRect() ?? null
  }
  /** 보스 칸 타격 한 beat(블라스트 → 균열/파괴 → 칸 위 피해 수치) — 연출은 BossFxView. */
  playBossGimmickStrikes(
    hits: readonly BossGimmickStrikeView[],
    source: HTMLElement | DOMRect | null,
    hpRoll?: BossHpRollStart
  ): Promise<void> {
    return this.bossFx.playBossGimmickStrikes(hits, source, hpRoll)
  }
  /** 손패가 화면 중앙에서 터지는 지점 — 칸 블라스트의 출발 rect. */
  handUseCenterRect(): DOMRect {
    return new DOMRect(window.innerWidth / 2 - 8, window.innerHeight * 0.46 - 8, 16, 16)
  }
  /**
   * 보스 칸 타격 기록 공급자. index가 한 번만 배선하면 `animateDamageNumbersById`를
   * 부르는 모든 경로(손패·조합·유물·반복 라운드)가 자동으로 칸 단위 표기로 갈린다 —
   * 호출부 열 곳을 각각 고치지 않기 위한 단일 배선점이다.
   */
  private bossCellStrikeSource: ((cardId: string, observedLoss: number) => BossGimmickStrikeView[]) | null = null
  /** 칸 타격 연출이 끝난 뒤 격자 쪽에 알린다(배율 리롤 등 beat 후처리). */
  private bossCellStrikeSettled: (() => Promise<void> | void) | null = null
  setBossCellStrikeSource(
    source: ((cardId: string, observedLoss: number) => BossGimmickStrikeView[]) | null,
    onSettled: (() => Promise<void> | void) | null = null
  ): void {
    this.bossCellStrikeSource = source
    this.bossCellStrikeSettled = onSettled
  }

  constructor(containerId: string = 'game-board') {
    const container = document.getElementById(containerId)
    if (!container) {
      throw new Error(`Container ${containerId} not found`)
    }
    this.boardElement = container

    // Mark touch devices once so mobile CSS rules and JS branches activate.
    initTouchBody()

    // A single document-level dismiss listener keeps pinned relic previews
    // transient: clicking any non-relic UI releases the enlarged card.
    document.addEventListener(
      'click',
      (e) => {
        if (!this.pinnedRelicId) return
        // Keep the pin while the click is on any owned relic; every other
        // board/HUD click should dismiss it, even if that target stops bubbling.
        if (e.target instanceof HTMLElement && e.target.closest('.relic-mini-card')) return
        this.pinnedRelicId = null
        this.updatePinnedRelicClasses()
      },
      { capture: true }
    )

    this.initRelicStackFocus()

    // 렌더러 초기화 시 shift 상태를 반드시 리셋.
    document.body.classList.remove('is-shift-detail')

    // Shift 키를 누르는 동안만 수식 표시, 놓으면 합산 수치로 복귀.
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Shift') document.body.classList.add('is-shift-detail')
    })
    document.addEventListener('keyup', (e) => {
      if (e.key === 'Shift') document.body.classList.remove('is-shift-detail')
    })
    // blur·mousemove 이중 가드: 포커스 이탈이나 keyup 누락으로 클래스가 잔류할 때
    // 마우스 이동으로 즉시 정정해 첫 hover부터 수치가 정상 표시된다.
    window.addEventListener('blur', () => {
      document.body.classList.remove('is-shift-detail')
    })
    this.boardElement.addEventListener('mousemove', (e: MouseEvent) => {
      if (!e.shiftKey) document.body.classList.remove('is-shift-detail')
      // 다음 줄은 자동으로 설명하지 않는다. 플레이어가 포인터를 가까이 가져가 관심을 보일 때만
      // 에나에게 신호를 보내, 대사와 플레이어가 보고 있는 대상을 같은 순간에 맞춘다.
      this.dispatchNearbyCardIntroduction(e)
    }, { passive: true })

    // 모바일 전용: 화면 꾹 누름으로 Shift 자세히보기 활성
    initLongPressShiftDetail()

    // ── Hand card click delegation (permanent, avoids listener accumulation on re-renders) ──
    this.boardElement.addEventListener('click', (e: MouseEvent) => {
      const btn = (e.target as Element).closest<HTMLElement>('.hand-card button[data-item-index]')
      if (!btn) return
      e.stopPropagation()
      const itemIndex = parseInt(btn.dataset.itemIndex ?? '-1', 10)
      document.dispatchEvent(new CustomEvent<ItemActionDetail>('itemAction', {
        detail: { itemIndex, shiftKey: e.shiftKey, clientX: e.clientX, clientY: e.clientY },
      }))
    })

    // ── Hand slot hover tracking (survives DOM replacement; preview restored after each render) ──
    // 이 핸들러는 인덱스 추적만 한다. 첫 진입 플립은 CSS :hover가 담당하고,
    // 렌더 후 복원은 restoreHandHoverState()가 is-preview-open(animation:none)으로 처리한다.
    this.boardElement.addEventListener('mouseover', (e: MouseEvent) => {
      const slot = (e.target as Element).closest<HTMLElement>('.hand-slot.hand-card')
      const idx = slot ? parseInt(slot.dataset.slotIndex ?? '-1', 10) : -1
      if (idx === this.hoveredHandSlotIndex) return
      if (this.hoveredHandSlotIndex !== null) {
        const previousSlot = this.boardElement
          .querySelector<HTMLElement>(`.hand-slot[data-slot-index="${this.hoveredHandSlotIndex}"]`)
        // Stable-preview classes are only valid while the cursor is on the
        // same card; clear them before letting a different slot play its first flip.
        this.clearStableHandPreviewClasses(previousSlot)
      }
      this.hoveredHandSlotIndex = idx >= 0 ? idx : null
      // is-preview-open은 여기서 추가하지 않는다 — :hover CSS가 첫 플립을 자연스럽게 처리
    }, { passive: true })

    this.boardElement.addEventListener('mouseleave', () => {
      if (this.hoveredHandSlotIndex !== null) {
        const slot = this.boardElement
          .querySelector<HTMLElement>(`.hand-slot[data-slot-index="${this.hoveredHandSlotIndex}"]`)
        // Leaving the hand column returns the preview to normal hidden CSS state.
        this.clearStableHandPreviewClasses(slot)
        this.hoveredHandSlotIndex = null
      }
    }, { passive: true })
  }

  // WeakSet 키: DOM 리빌드 때마다 이전 stack 요소가 GC되므로 별도 cleanup 불필요.
  private readonly relicFocusAttached = new WeakSet<HTMLElement>()

  /** boardElement의 mouseover 위임으로 .relic-stack이 새로 생겨도 재부착 없이 동작한다. */
  private initRelicStackFocus(): void {
    this.boardElement.addEventListener('mouseover', (e: MouseEvent) => {
      const stack = (e.target as HTMLElement).closest<HTMLElement>('.relic-stack')
      if (!stack || this.relicFocusAttached.has(stack)) return
      this.relicFocusAttached.add(stack)

      const applyFocus = (ev: MouseEvent): void => {
        const cards = Array.from(stack.querySelectorAll<HTMLElement>('.relic-mini-card'))
        const n = cards.length
        if (n < 2) return
        const rect = stack.getBoundingClientRect()
        const t = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width))
        // 커서 바로 아래 카드를 pivot으로 고정 — 소수점 focusIdx로 hovered 카드가 흔들리는 걸 방지.
        const pivotIdx = Math.round(t * (n - 1))
        cards.forEach((card, i) => {
          const dist = i - pivotIdx
          const isPivot = dist === 0
          // transform-origin(50% 112%) 기준 회전 확대로 자연스러운 부채꼴 펼침을 구현한다.
          card.style.setProperty('--relic-extra-rot', `${dist * 5}deg`)
          // X 이동은 회전이 일부 담당하므로 기존보다 줄인다.
          card.style.setProperty('--relic-extra-x', `${dist * 7}px`)
          // pivot 카드만 살짝 위로 올려 시선을 끈다.
          card.style.setProperty('--relic-extra-y', isPivot ? '-8px' : '0px')
          // pivot 카드 미세 확대 — 핀(is-pinned) scale 1.22보다 훨씬 작게 유지.
          card.style.setProperty('--relic-extra-scale', isPivot ? '0.06' : '0')
          // z-index는 CSS calc로 표현 불가하므로 inline 직접 지정; mouseleave에서 복원.
          card.style.zIndex = isPivot ? '100' : ''
        })
      }

      const clearFocus = (): void => {
        stack.classList.remove('is-focus-tracked')
        Array.from(stack.querySelectorAll<HTMLElement>('.relic-mini-card')).forEach(card => {
          card.style.removeProperty('--relic-extra-x')
          card.style.removeProperty('--relic-extra-rot')
          card.style.removeProperty('--relic-extra-y')
          card.style.removeProperty('--relic-extra-scale')
          card.style.zIndex = ''
        })
        this.relicFocusAttached.delete(stack)
        stack.removeEventListener('mousemove', applyFocus)
        stack.removeEventListener('mouseleave', clearFocus)
      }

      stack.classList.add('is-focus-tracked')
      stack.addEventListener('mousemove', applyFocus)
      stack.addEventListener('mouseleave', clearFocus)
    })
  }

  /** Toggle the UI overlay used while a targeted hand card is awaiting a board click. */
  setHandTargetingMode(mode: HandTargetingMode | null): void {
    this.handTargetingMode = mode
    this.clearSelection()
  }


  render(gameState: GameState, scorePanel: ScorePanelState): void {
    // 렌더 1회를 세는 토큰. 한 번의 render에서 보스 타일이 여러 개 그려질 때
    // 1회성 연출 플래그(등장/리롤)를 타일마다 나눠 먹지 않게 하는 기준이다.
    this.renderPass++
    const previousRects = this.captureCardRects()
    const previousHandRects = this.captureHandRects()
    // 보드는 innerHTML 통째 교체로 다시 그려진다 — 그대로 두면 진행 중이던 CSS 애니메이션이
    // 전부 0프레임으로 되감겨 화면이 한 번 번쩍인다. 재생 위치를 먼저 걷어 둔다.
    const previousAnimationPhases = this.captureBoardAnimationPhases()
    this.currentGameState = gameState
    this.currentSpawnWeightCtx = scorePanel.spawnWeightContext
    // Main state is authoritative for armed hand targeting; syncing here keeps
    // board highlights correct even after any render that did not call the
    // imperative setHandTargetingMode path first.
    if ('pendingHandTarget' in scorePanel) {
      this.handTargetingMode = scorePanel.pendingHandTarget ?? null
    }
    const character = gameState.getCharacter()
    const lanes = gameState.getLanes()
    const turn = gameState.getCurrentTurn()
    // A run restart renders turn 0 after previously showing later turns. Clear
    // remembered counters so fresh runs start at their reset values, not by
    // rolling down from the previous death/shop state.
    const isRunReset = this.hasRendered && turn === 0 && this.previousTurn > 0
    if (isRunReset) {
      this.displayedHudCounters.clear()
      this.activeCounterAnimations.clear()
      this.displayedScoreValue = scorePanel.score
      this.displayedCoinValue = scorePanel.coins
    }
    // Trigger the small turn-tick pop animation only when the displayed
    // turn actually changes — re-renders within the same turn must not
    // re-fire the shimmer.
    const turnChanged = turn !== this.previousTurn && this.hasRendered && !isRunReset
    const turnPopClass = turnChanged ? 'is-tick-popping' : ''
    this.previousTurn = turn

    // 선공 딱지: 적/특수적/보스 소환적 카드 우상단에 붙일지 결정하는 현재 선공 상태(불씨 티어 기반).
    // 불씨가 차서 선공이 풀리면 다음 렌더에서 조건이 거짓이 되어 딱지가 자연히 사라진다.
    this.firstStrikeActive = scorePanel.emberTier
      ? EmberSystem.isEnemyFirstStrike(scorePanel.emberTier)
      : false
    if (this.selected) {
      const lane = lanes[this.selected.laneIndex]
      if (!lane || !lane.getCardAtDistance(this.selected.distance)) {
        this.selected = null
      }
    }

    // 손패 패널을 미리 렌더해 기존 DOM과 비교한다. 내용이 동일하면 기존 요소를 복원해
    // CSS hover 상태(미리보기)가 레일 하강 중 깜빡이지 않게 한다.
    // 비교는 .hand-panel(카드 목록)만 사용한다 — .spawn-prob-panel은 불씨 티어에 따라
    // 독립적으로 변하므로 비교에서 제외해 tier 변경이 hover 상태를 끊지 않도록 한다.
    const prevHandEl = this.boardElement.querySelector<HTMLElement>('.hand-column')
    const prevHandPanelEl = prevHandEl?.querySelector<HTMLElement>('.hand-panel')
    const prevHandPanelHtml = prevHandPanelEl ? prevHandPanelEl.outerHTML : ''
    // Hover preview is a reading surface, not part of board refresh feedback.
    // Keep the exact open preview DOM so rail drops, HUD ticks, or effect
    // re-renders do not replay its flip/refresh while the cursor stays put.
    const stableHandPreview = this.captureStableHandPreview()
    const previousRailHints = this.captureRailNextHints()
    const newHandHtml = this.renderHand(character, scorePanel)

    this.boardElement.innerHTML = `
      ${this.renderEmberHud(scorePanel)}
      <div class="game-shell">
        <aside class="left-panel" aria-label="Turn and score">
          <header class="turn-brand ${turnPopClass}" data-turn="${turn}">
            <span class="turn-brand-icon">${candleIcon()}</span>
            <span class="turn-brand-kicker">TURN</span>
            <span class="turn-brand-number">${turn}</span>
          </header>
          ${this.renderScorePanel(scorePanel)}
        </aside>
        <main class="stage">
          <section class="rail ${this.shopOverlay.shopShutterLocked ? 'is-shop-shuttered' : ''} ${(scorePanel.pendingHandTarget ?? this.handTargetingMode) ? 'is-targeting' : ''}" aria-label="Card rail" style="--lane-count:${lanes.length}">
            ${this.renderRail(lanes, scorePanel.refillPreviewCards)}
            ${this.shopOverlay.shopShutterLocked ? this.shopOverlay.renderShopShutter(true, lanes) : ''}
          </section>

          ${this.renderPlayerZone(character)}
        </main>

        ${newHandHtml}
      </div>
    `

    this.restoreRailNextHints(previousRailHints)

    // 카드 목록(.hand-panel)이 바뀌지 않았으면 기존 DOM 노드를 복원해 hover 상태를 보존한다.
    // 복원 후 spawn-prob-panel만 새 퍼센트로 교체해 불씨 티어 변경을 반영한다.
    let handDomPreserved = false
    if (prevHandEl && prevHandPanelHtml) {
      const freshHandEl = this.boardElement.querySelector<HTMLElement>('.hand-column')
      if (freshHandEl) {
        const freshHandPanelEl = freshHandEl.querySelector<HTMLElement>('.hand-panel')
        if (freshHandPanelEl && freshHandPanelEl.outerHTML === prevHandPanelHtml) {
          freshHandEl.replaceWith(prevHandEl)
          // spawn-prob-panel만 새 수치로 교체 (불씨 티어 변경 반영)
          const freshSpawnPanel = freshHandEl.querySelector<HTMLElement>('.spawn-prob-panel')
          const prevSpawnPanel = prevHandEl.querySelector<HTMLElement>('.spawn-prob-panel')
          if (freshSpawnPanel && prevSpawnPanel) {
            prevSpawnPanel.replaceWith(freshSpawnPanel)
          } else if (freshSpawnPanel) {
            prevHandEl.insertAdjacentElement('afterbegin', freshSpawnPanel)
          } else if (prevSpawnPanel) {
            prevSpawnPanel.remove()
          }
          handDomPreserved = true
        }
      }
    }

    // DOM이 교체된 경우에도 같은 손패 위에 있다면 기존 미리보기 노드를 되심어
    // 이미 열린 카드가 다른 새로고침/애니메이션의 영향을 받지 않게 고정한다.
    if (!handDomPreserved) {
      this.restoreStableHandPreview(stableHandPreview)
    }
    // Whether the hand DOM was preserved or rebuilt, freeze the currently
    // hovered preview in its already-open pose so board/effect refreshes cannot
    // restart the back-to-front flip animation.
    this.restoreHandHoverState()

    this.syncBodyVignette(scorePanel.vignetteIntensity ?? 0)
    this.injectStyles()
    this.attachListeners()
    // When the shop is open, the shutter must keep matching the rail's real
    // perspective-scaled cells even after full re-renders (purchase refresh etc.).
    this.shopOverlay.syncShopShutterToRailCells()
    // 되감긴 애니메이션들을 원래 재생 위치로 돌려놓는다(무한 루프는 공용 시계에 맞춘다).
    this.restoreBoardAnimationPhases(previousAnimationPhases)
    this.animateRenderedResourceCounters()
    this.alignNewHandSlotsWithTrailSpawn()
    this.animateMovedCards(previousRects)
    this.animateMovedHandSlots(previousHandRects)
    this.playNewHandMergeEffects(previousHandRects)
    this.rememberRenderedCards()
    // 에나 강조는 카드 안에 심긴 레이어라 innerHTML 교체에 통째로 날아간다. 세 번 맥동이
    // 4초를 쓰는 만큼 그 사이 렌더가 한 번은 돌기 마련이라, 남은 시간만큼 이어 심는다.
    this.reattachEnaHintPulses()
    // Floating chain banner (body-mounted, above the player profile).
    this.updateChainBanner(scorePanel.chainHints)
  }

  /** 적 선공 활성 여부. render() 시작에서 불씨 티어로 갱신하고, renderCardFace가 적 카드
   *  우상단에 '선공' 딱지를 붙일지 판단하는 데 쓴다. */
  private firstStrikeActive = false

  /**
   * 재생 위치를 이어 붙일 요소의 신원. 이 값이 있는 요소만 **유한 애니메이션**의 진행이
   * 렌더를 넘어 살아남는다(무한 루프는 신원 없이도 공용 시계로 맞춘다).
   *
   * 새 요소가 이 대열에 끼려면 `data-fx-id`를 하나 달면 된다 — 렌더 코드를 고칠 필요 없다.
   */
  private animationIdentity(el: Element): string | null {
    const d = (el as HTMLElement).dataset
    if (!d) return null
    if (d.fxId) return `fx:${d.fxId}`
    if (d.cardId) return `card:${d.cardId}`
    if (d.bossGimmickCell) return `cell:${d.bossGimmickCell}`
    if (d.handUid) return `hand:${d.handUid}`
    return null
  }

  /**
   * 보드 전체가 innerHTML로 갈리기 직전, 돌고 있던 CSS 애니메이션의 재생 위치를 걷어 둔다.
   *
   * 이 게임의 render()는 보드를 통째로 다시 그린다. 아무것도 하지 않으면 그 순간
   * **모든 CSS 애니메이션이 동시에 0프레임으로 되감긴다** — 촛불 발광·함정 경고 맥동·
   * 보스 뱃지/열기 호흡·약점 칸 맥동이 한꺼번에 튀어 화면이 번쩍인 것처럼 보인다.
   * 손패 하강, 유물 발동, 보스 칸 리롤처럼 렌더가 잦은 구간에서 특히 두드러진다.
   */
  private captureBoardAnimationPhases(): Map<string, number> {
    const phases = new Map<string, number>()
    // getAnimations 미지원 브라우저는 지금까지의 동작(되감김)으로 조용히 내려간다 —
    // 연출 보정이 없다고 게임이 멈춰서는 안 된다.
    if (!this.hasRendered || typeof this.boardElement.getAnimations !== 'function') return phases
    for (const anim of this.boardElement.getAnimations({ subtree: true })) {
      const name = (anim as CSSAnimation).animationName
      const effect = anim.effect as KeyframeEffect | null
      const target = effect?.target
      const time = anim.currentTime
      if (!name || !target || typeof time !== 'number') continue
      // 무한 루프는 신원 없이 **이름 하나**로 걷는다. 같은 이름의 루프는 이미 같은 위상으로
      // 숨쉬고 있으므로(같은 렌더에서 함께 태어난다) 이름만으로 되돌려도 어긋나지 않고,
      // 신원을 못 다는 요소(촛불·예고선·보스 뱃지 …)까지 한 번에 구제된다.
      if (effect?.getComputedTiming().iterations === Infinity) {
        if (!phases.has(name)) phases.set(name, time)
        continue
      }
      const identity = this.animationIdentity(target)
      if (identity) phases.set(`${identity}|${name}`, time)
    }
    return phases
  }

  /**
   * 새로 그려진 보드의 애니메이션을 원래 위치로 되돌린다.
   *
   *   - 무한 루프 → 이름이 같은 루프가 렌더 직전에 있던 위상으로 되돌린다. 그래서
   *     되감김이 **한 프레임도** 없다. 이번에 처음 생긴 이름이면 손대지 않는다.
   *   - 신원이 있는 요소(같은 카드·같은 칸)의 유한 애니메이션 → 걷어 둔 재생 위치로 이어 붙인다.
   *     끊긴 자리에서 다시 시작하는 게 아니라 **끊긴 적이 없던 것처럼** 이어진다.
   *
   * 새로 생긴 요소(이전 신원이 없음)의 유한 애니메이션은 손대지 않는다 — 그건 실제로
   * 지금 시작한 연출이므로 처음부터 재생돼야 한다.
   */
  private restoreBoardAnimationPhases(phases: Map<string, number>): void {
    if (phases.size === 0 || typeof this.boardElement.getAnimations !== 'function') return
    for (const anim of this.boardElement.getAnimations({ subtree: true })) {
      const name = (anim as CSSAnimation).animationName
      const effect = anim.effect as KeyframeEffect | null
      const target = effect?.target
      if (!name || !target) continue
      const key = effect?.getComputedTiming().iterations === Infinity
        ? name
        : `${this.animationIdentity(target) ?? ''}|${name}`
      const previous = phases.get(key)
      if (previous !== undefined) anim.currentTime = previous
    }
  }

  clearSelection(): void {
    this.selected = null
  }

  /** Build a numeric HUD span that starts from the previous visible value.
   *  The actual text animation runs after render() in animateRenderedResourceCounters().
   *  When a roll is already in flight for this key (because render fired
   *  mid-animation), start from the current animated value so the new span
   *  does not briefly show the final target before the transfer kicks in. */
  private renderHudCounter(key: string, targetValue: number, suffix = '', extraAttrs = ''): string {
    const safeTarget = Math.round(Number.isFinite(targetValue) ? targetValue : 0)
    const startValue = this.hudCounterVisibleStartValue(key, safeTarget)
    this.displayedHudCounters.set(key, safeTarget)
    return `<span ${extraAttrs} data-count-key="${key}" data-count-start="${startValue}" data-count-end="${safeTarget}" data-count-suffix="${suffix}">${startValue.toLocaleString()}${suffix}</span>`
  }

  /** Identify which active-animation slot owns a given counter element. */
  private counterKeyFor(el: HTMLElement): string | null {
    if (el.dataset.countKey) return `hud:${el.dataset.countKey}`
    if (el.classList.contains('score-number')) return 'score'
    if (el.classList.contains('coin-number')) return 'coin'
    return null
  }

  /** Sample the current animated integer for an in-flight counter roll. */
  private computeActiveCounterValue(
    anim: CounterAnimationState,
    now: number = performance.now()
  ): number {
    const t = Math.min(1, Math.max(0, (now - anim.startedAt) / anim.duration))
    const eased = 1 - Math.pow(1 - t, 3)
    return Math.round(anim.startValue + (anim.endValue - anim.startValue) * eased)
  }

  /** Pick the visible start value that a freshly-rendered HUD number should
   *  display before its roll begins. Bars/ticks use the same value so HP,
   *  ember, and gauge fills drain/fill in lockstep with the text instead of
   *  snapping to the model target on render. */
  private hudCounterVisibleStartValue(key: string, targetValue: number): number {
    const safeTarget = Math.round(Number.isFinite(targetValue) ? targetValue : 0)
    const active = this.activeCounterAnimations.get(`hud:${key}`)
    if (active) return this.computeActiveCounterValue(active)
    const previous = this.displayedHudCounters.get(key)
    if (this.hasRendered && previous !== undefined) return previous
    return safeTarget
  }

  private renderScorePanel(scorePanel: ScorePanelState): string {
    const logs =
      scorePanel.logs.length > 0
        ? scorePanel.logs
            .map((log) => {
              // Score rows keep the old +/- number, while item rows use a
              // compact acquisition count in the same right-side badge slot.
              const deltaText =
                typeof log.scoreDelta === 'number'
                  ? `${log.scoreDelta >= 0 ? '+' : ''}${log.scoreDelta}`
                  : log.itemCount && log.itemCount > 1
                    ? `${log.itemCount}개`
                    : log.badge
                      ? log.badge
                      : '획득'
              return `
          <div class="score-log score-log-${log.kind}">
            <span class="score-log-label">${log.label}</span>
            <span class="score-log-delta">${deltaText}</span>
          </div>
        `
            })
            .join('')
        : '<div class="score-log-empty">아직 기록된 행동이 없어</div>'
    // Only attach the pulse animation class when the key actually changed
    // since the last render, and only when the new key is positive (so a
    // reset back to 0 does not fire a phantom pop). Without this gate every
    // full re-render of the panel would replay the pop animation on every
    // action, even on actions that did not change the resource — which is
    // exactly what the player was seeing as "effects firing on plain actions".
    // Only attach the pulse animation class when the key actually changed
    // since the last render. This keeps the pop from re-firing on every
    // render of an unrelated action. Both score and coin use the same
    // unified `is-score-popping` class so the panel animation language
    // stays consistent (per request to roll back task 7).
    const scoreChanged =
      scorePanel.scorePulseKey !== this.previousScorePulseKey && scorePanel.scorePulseKey > 0
    const coinChanged =
      scorePanel.coinPulseKey !== this.previousCoinPulseKey && scorePanel.coinPulseKey > 0
    const scoreCounting = scoreChanged && scorePanel.score !== this.displayedScoreValue
    const coinCounting = coinChanged && scorePanel.coins !== this.displayedCoinValue
    const scoreIncreasing = scoreCounting && scorePanel.score > this.displayedScoreValue
    const coinIncreasing = coinCounting && scorePanel.coins > this.displayedCoinValue
    // Immediate feedback is played on the mounted DOM before some flows trigger
    // a full render. If that render lands inside the same pulse beat, re-apply
    // the sparkle class to the replacement DOM so score and wallet behave alike.
    const now = performance.now()
    const scorePulseStillActive =
      scorePanel.scorePulseKey === this.activeScorePulseKey && now < this.activeScorePulseUntil
    const coinPulseStillActive =
      scorePanel.coinPulseKey === this.activeCoinPulseKey && now < this.activeCoinPulseUntil
    const scorePulseClass = scoreIncreasing || scorePulseStillActive ? 'is-score-popping' : ''
    const coinPulseClass = coinIncreasing || coinPulseStillActive ? 'is-score-popping' : ''
    // Mid-roll renders: if a live counter animation is in flight, render the
    // current animated value so the freshly-mounted number does not flash the
    // final target before animateRenderedResourceCounters resumes the roll.
    const activeScoreAnim = this.activeCounterAnimations.get('score')
    const activeCoinAnim = this.activeCounterAnimations.get('coin')
    // Safety net: roll from the previously displayed value on ANY real change,
    // not only when a caller remembered to bump the pulse key. 불빛/화폐를 바꾸는
    // 새 경로가 펄스키 갱신을 빠뜨려도 숫자가 스냅하지 않고 굴러가게 한다. 스파클/팝
    // 클래스는 펄스키 게이트(scoreIncreasing 등)에 그대로 두므로 무관한 렌더에서
    // 유령 롤링/팝이 생기지 않는다(직전 렌더 끝에서 displayed=score로 맞춰지기 때문).
    const scoreNeedsRoll = this.hasRendered && this.displayedScoreValue !== scorePanel.score
    const coinNeedsRoll = this.hasRendered && this.displayedCoinValue !== scorePanel.coins
    const renderedScore = activeScoreAnim
      ? this.computeActiveCounterValue(activeScoreAnim)
      : scoreNeedsRoll
        ? this.displayedScoreValue
        : scorePanel.score
    const renderedCoins = activeCoinAnim
      ? this.computeActiveCounterValue(activeCoinAnim)
      : coinNeedsRoll
        ? this.displayedCoinValue
        : scorePanel.coins
    this.previousScorePulseKey = scorePanel.scorePulseKey
    this.previousCoinPulseKey = scorePanel.coinPulseKey
    this.displayedScoreValue = scorePanel.score
    this.displayedCoinValue = scorePanel.coins

    return `
      <aside class="score-panel" aria-label="Action score panel">
        <section class="score-panel-total">
          <div class="score-kicker">
            <span class="score-kicker-icon">${sparkleIcon()}</span>
            불빛
          </div>
          <div class="score-value-row">
            <span class="score-value-icon" aria-hidden="true">${sparkleIcon()}</span>
            <span class="score-number ${scorePulseClass}" data-score-pulse="${scorePanel.scorePulseKey}" data-count-start="${renderedScore}" data-count-end="${scorePanel.score}" data-count-suffix="">${renderedScore.toLocaleString()}</span>
          </div>
        </section>
        <section class="coin-panel-total" aria-label="Shop currency">
          <div class="score-kicker">
            <span class="score-kicker-icon score-kicker-icon--coin">$</span>
            화폐
          </div>
          <div class="coin-number ${coinPulseClass}" data-coin-pulse="${scorePanel.coinPulseKey}" data-count-start="${renderedCoins}" data-count-end="${scorePanel.coins}" data-count-suffix=" $">
            ${renderedCoins.toLocaleString()} $
          </div>
        </section>
        <div class="left-swap">
          <!-- 판도 제목도 없는 투명 레이어 — 기록은 배경 위에 그냥 쌓인다. -->
          <section class="score-log-list" aria-label="Action history">
            <div class="score-log-scroll">${logs}</div>
          </section>
          ${this.renderLobbyQuests()}
        </div>
      </aside>
    `
  }

  /**
   * 거점 좌측 패널의 퀘스트(의뢰) 딱지 — 로그 자리에 노출된다(런에서는 CSS로 숨김).
   * 현재는 정적 전시 + 보상 미지급. 등급(중요한/적당한/사소한)은 색으로 중요도를 표현하고,
   * 세부(목표/보상/기한)는 추후 우측 인스펙터(hover)로 띄운다. 배치/규칙은 기획서 §12-5.
   * `<details>`로 화살표 접기/펼치기를 네이티브 처리한다(의뢰가 많아지면 접어 둘 수 있게).
   */
  private renderLobbyQuests(): string {
    const quests: { tier: 'major' | 'medium' | 'minor'; name: string; cur: number; goal: number }[] = [
      { tier: 'major', name: '중요한 의뢰', cur: 0, goal: 100 },
      { tier: 'medium', name: '적당한 의뢰', cur: 0, goal: 10 },
      { tier: 'minor', name: '사소한 의뢰', cur: 0, goal: 1 },
      { tier: 'minor', name: '사소한 의뢰', cur: 0, goal: 1 },
      { tier: 'minor', name: '사소한 의뢰', cur: 0, goal: 1 },
    ]
    // 등급 라벨 — 인스펙터 태그에 중요도+진행도를 함께 노출한다.
    const tierLabel: Record<'major' | 'medium' | 'minor', string> = { major: '중요', medium: '적당', minor: '사소' }
    const tickets = quests
      .map(
        (q) => `
          <li class="quest-ticket quest-ticket--${q.tier}" data-quest="${q.name}"
              data-inspect-title="${q.name}" data-inspect-tag="${tierLabel[q.tier]} 의뢰 · ${q.cur}/${q.goal}"
              data-inspect-desc="세부 목표와 보상은 준비 중입니다." data-inspect-art="${SpriteUrls.questTickets[q.tier]}">
            <span class="quest-ticket-name">${q.name}</span>
            <span class="quest-ticket-count">${q.cur}/${q.goal}</span>
          </li>`
      )
      .join('')
    return `
      <details class="quest-list" open aria-label="의뢰">
        <summary class="quest-list-head"><span class="quest-list-title">의뢰</span><span class="quest-arrow" aria-hidden="true"></span></summary>
        <ul class="quest-tickets">${tickets}</ul>
      </details>
    `
  }

  private renderRail(lanes: Lane[], refillPreviewCards: readonly (Card | null)[] = []): string {
    const rows: string[] = []
    for (let distance = LANE_DISTANCE_COUNT - 1; distance >= 0; distance--) {
      rows.push(this.renderRow(lanes, distance))
    }
    // Top-edge hints mirror the queued refill cards, so players can read the
    // next off-screen spawn without adding new icons or breaking theme.
    return `${this.renderRailIncomingHints(lanes, refillPreviewCards)}${rows.join('')}`
  }

  /** Render subtle per-lane glow lines inside the rail's upper boundary. */
  private renderRailIncomingHints(lanes: Lane[], refillPreviewCards: readonly (Card | null)[]): string {
    const hints = lanes
      .map((_lane, laneIndex) => {
        const card = refillPreviewCards[laneIndex] ?? null
        const kind = card ? this.incomingHintKind(card) : 'empty'
        return `<span class="rail-next-hint rail-next-hint--${kind}" data-lane="${laneIndex}" data-kind="${kind}" aria-hidden="true"></span>`
      })
      .join('')
    return `<div class="rail-next-hints" aria-hidden="true">${hints}</div>`
  }

  /** Keep the old hint DOM so its glow animation does not restart on full board renders. */
  private captureRailNextHints(): HTMLElement | null {
    return this.boardElement.querySelector<HTMLElement>('.rail-next-hints')
  }

  /** Reuse hint nodes and update only their kind classes, preserving animation progress. */
  private restoreRailNextHints(previous: HTMLElement | null): void {
    if (!previous) return
    const fresh = this.boardElement.querySelector<HTMLElement>('.rail-next-hints')
    if (!fresh) return
    const previousHints = [...previous.querySelectorAll<HTMLElement>('.rail-next-hint')]
    const freshHints = [...fresh.querySelectorAll<HTMLElement>('.rail-next-hint')]
    if (previousHints.length !== freshHints.length) return

    previousHints.forEach((hint, index) => {
      const nextKind = freshHints[index].dataset.kind ?? 'empty'
      // lane span stays stable; only the semantic color class changes when the queued kind changes.
      hint.dataset.kind = nextKind
      hint.className = `rail-next-hint rail-next-hint--${nextKind}`
    })
    fresh.replaceWith(previous)
  }

  /** Map card type to the existing rail palette used by card accent strips. */
  private incomingHintKind(card: Card): 'enemy' | 'trap' | 'treasure' | 'flower' | 'special' | 'empty' {
    if (card.type === CardType.EVENT) return 'special'
    if (card.type === CardType.TREASURE && card.treasureKind === 'starlight') return 'special'
    if (card.type === CardType.ENEMY) return 'enemy'
    if (card.type === CardType.TRAP) return 'trap'
    if (card.type === CardType.TREASURE) return 'treasure'
    if (card.type === CardType.FLOWER) return 'flower'
    return 'empty'
  }

  private renderRow(lanes: Lane[], distance: number): string {
    const isActive = distance === 0
    const rowClass = `rail-row dist-${distance} ${isActive ? 'active' : 'upcoming'}`

    const cells: string[] = []
    let i = 0
    while (i < lanes.length) {
      const card = lanes[i].getCardAtDistance(distance)
      if (!card) {
        cells.push(this.renderEmptyCell(i, distance))
        i++
        continue
      }

      // 같은 카드 인스턴스가 인접 lane에 연속해 있으면 한 칸으로 grouping한다.
      // 일반 게임은 active row 외에서 같은 인스턴스를 박지 않으므로 영향이 없고,
      // 보스/보상 카드(같은 인스턴스를 3-cell span으로 박는다)는 모든 row에서 한 칸
      // wide tile로 표현된다.
      let span = 1
      while (i + span < lanes.length && lanes[i + span].getCardAtDistance(distance) === card) {
        span++
      }
      cells.push(this.renderCardCell(card, i, distance, span, isActive))
      i += span
    }

    return `<div class="${rowClass}">${cells.join('')}</div>`
  }

  private renderCardCell(
    card: Card,
    laneIndex: number,
    distance: number,
    span: number,
    isActive: boolean
  ): string {
    const isSelected =
      !!this.selected &&
      this.selected.distance === distance &&
      this.selected.laneIndex >= laneIndex &&
      this.selected.laneIndex < laneIndex + span

    // While a targeted hand card is armed, distinguish valid targets from
    // blocked cells. The blocked state renders the shared red X overlay so
    // enemies-only cards visibly reject chests/traps, and front-only cards
    // visibly reject the waiting rows.
    const isValidHandTarget = this.isValidHandTarget(card, distance)
    const isBlockedHandTarget = this.handTargetingMode !== null && !isValidHandTarget

    const classes = [
      'cell',
      'card',
      `type-${card.type}`,
      card.type === CardType.TRAP ? `trap-${card.trapKind}` : '',
      card.type === CardType.FLOWER ? `flower-${card.flowerKind}` : '',
      card.type === CardType.TRAP && card.isBombArmed ? 'is-bomb-armed' : '',
      isActive ? 'is-active' : 'is-preview',
      isSelected ? 'is-selected' : '',
      isValidHandTarget ? 'is-hand-target' : '',
      isBlockedHandTarget ? 'is-hand-target-blocked' : '',
      span > 1 ? 'is-grouped' : '',
      this.isCardEntering(card.id) ? 'is-entering' : '',
      this.shouldAnimateGroup(card.id, span) ? 'is-newly-grouped' : '',
      card.isFrozen() ? 'is-frozen' : '',
      // 비대화된 양초 조각 — 부푼 상태가 다음 턴에도 남아야 "판이 무거워졌다"가 보인다.
      card.swollen ? 'is-swollen' : '',
      // 보스는 5번째 카드 종류. 보스마다 메커니즘/스타일이 다를 수 있으므로,
      // 공통은 type-boss(셔터 위 z-index) 하나만 적용하고, 이 보스(밀랍 군단)만의
      // 풀필드 확장·좌상단 3T 뱃지 등은 boss-kind-<id> 마커로 한정한다.
      card.type === CardType.BOSS && card.specialEnemyKind
        ? `boss-kind-${card.specialEnemyKind}`
        : '',
      // 보스 격파 후 lanes에 박히는 보상 chest도 닫힌 셔터 위에 노출되어야 한다.
      card.type === CardType.TREASURE && card.id.startsWith('boss-reward-')
        ? 'is-boss-reward'
        : '',
    ]
      .filter(Boolean)
      .join(' ')

    const styleSpan = span > 1 ? `style="grid-column: span ${span};"` : ''
    const tabIndex = isActive ? '0' : '-1'

    return `
      <div class="${classes}"
           ${styleSpan}
           data-lane="${laneIndex}"
           data-distance="${distance}"
           data-span="${span}"
           data-card-id="${card.id}"
           role="button"
           tabindex="${tabIndex}">
        ${this.renderCardFace(card, span, isValidHandTarget, distance)}
        ${isBlockedHandTarget ? this.renderBlockedTargetMark() : ''}
      </div>
    `
  }

  /** Render an empty rail cell, including target-block feedback during hand targeting. */
  private renderEmptyCell(laneIndex: number, distance: number): string {
    const isBlockedHandTarget = this.handTargetingMode !== null
    const classes = ['cell', 'empty', isBlockedHandTarget ? 'is-hand-target-blocked' : '']
      .filter(Boolean)
      .join(' ')
    return `
      <div class="${classes}"
           data-lane="${laneIndex}"
           data-distance="${distance}"
           aria-hidden="true">
        ${isBlockedHandTarget ? this.renderBlockedTargetMark() : ''}
      </div>
    `
  }

  /** Shared target validation mirror for preview/UI hints. HandSystem remains authoritative. */
  private isValidHandTarget(card: Card, distance: number): boolean {
    if (!this.handTargetingMode) return false
    const def = getHandCardDef(this.handTargetingMode.defId)
    const rule = this.handTargetingMode.merged ? def.targeting.triple : def.targeting.base
    if (this.isValidTargetRule(rule, card, distance)) return true
    // 보스 타일은 칸에 얹힌 부가물만으로도 대상이 된다 — 아니면 키틴을 들었을 때
    // 보스 전체가 차단 표시로 덮여 그 아래 함정 칸을 고를 수 없다.
    return card.type === CardType.BOSS && this.hasTargetableFixtureCell()
  }

  /** 지금 든 손패가 닿는 부가물 칸이 하나라도 있는가. */
  private hasTargetableFixtureCell(): boolean {
    const cells = this.bossGimmickGrid?.cells
    if (!cells) return false
    return cells.some((cell) => !cell.broken && this.isValidHandTargetCell(cell.index))
  }

  /**
   * 보스 격자의 이 칸이 지금 든 손패의 유효 대상인가.
   * 카드 자체가 대상이 아니어도(키틴은 BOSS를 못 겨눈다) 그 칸에 함정이 얹혀 있으면
   * 칸 하나가 대상이 된다 — 판정은 `bossFixtureMatchesFilter`가 HandSystem과 공유한다.
   */
  isValidHandTargetCell(cellIndex: number): boolean {
    if (!this.handTargetingMode) return false
    const fixture = this.bossGimmickGrid?.cells[cellIndex]?.fixture
    if (!fixture) return false
    const def = getHandCardDef(this.handTargetingMode.defId)
    const rule = this.handTargetingMode.merged ? def.targeting.triple : def.targeting.base
    return rule.selection === 'target' && bossFixtureMatchesFilter(fixture, rule.filter)
  }

  /** Check a hand target rule without mutating game state. */
  private isValidTargetRule(rule: HandEffectTargeting, card: Card, distance: number): boolean {
    if (rule.selection !== 'target') return false
    if (rule.zone === 'front' && distance !== 0) return false
    if (rule.zone === 'waiting' && distance === 0) return false
    if (rule.zone !== 'front' && rule.zone !== 'waiting' && rule.zone !== 'field') return false
    // 폭 제한(키틴 2칸/3칸): maxSpan을 넘는 폭의 카드는 대상에서 제외한다.
    if (rule.maxSpan != null && card.groupCount > rule.maxSpan) return false
    // 보스는 적과 같은 양식을 따르므로 enemy/enemy-or-treasure/turn-timer 등
     // "적을 향한" 손패 타겟팅 필터에 모두 포함된다.
    if (rule.filter === 'enemy') return card.type === CardType.ENEMY || card.type === CardType.BOSS
    if (rule.filter === 'trap') return card.type === CardType.TRAP
    if (rule.filter === 'spore') {
      // Mirrors HandSystem's 성수-only 포자 targeting rule for hover hints.
      return card.type === CardType.TRAP && card.trapKind === 'spore'
    }
    if (rule.filter === 'treasure') return card.type === CardType.TREASURE
    if (rule.filter === 'enemy-or-treasure') {
      return card.type === CardType.ENEMY || card.type === CardType.BOSS || card.type === CardType.TREASURE
    }
    if (rule.filter === 'turn-timer') return this.isTurnTimerHandTarget(card)
    if (rule.filter === 'hazard') return card.type === CardType.TRAP || card.isFrozen()
    if (rule.filter === 'flower') return card.type === CardType.FLOWER && card.flowerKind !== 'seed'
    if (rule.filter === 'flower-or-monsterflower') {
      if (card.type === CardType.FLOWER) return true
      return card.type === CardType.ENEMY && card.specialEnemyKind === 'monsterFlower'
    }
    if (rule.filter === 'any') return true
    return false
  }

  /** UI mirror of HandSystem's wax target family, kept local so hover hints
   *  highlight every front-row card whose own turn beat can be paused. */
  private isTurnTimerHandTarget(card: Card): boolean {
    if (card.type === CardType.ENEMY) return true
    if (card.type === CardType.BOSS) return true
    if (card.type === CardType.TREASURE) return true
    if (card.type === CardType.TRAP) return card.trapKind === 'bomb' || card.trapKind === 'spore'
    if (card.type === CardType.FLOWER) return card.flowerKind !== 'seed'
    return false
  }

  /** Hand-drawn X used when a card/cell cannot accept the armed hand effect.
   *  Two slightly mis-aligned ink strokes give it a sketched feel, with a
   *  subtle idle wobble + soft ember pulse so the block stays "alive" while
   *  the player decides which lane to use instead. */
  private renderBlockedTargetMark(): string {
    return `
      <div class="trap-block-mark target-block-mark" aria-hidden="true">
        <svg viewBox="0 0 64 64" class="trap-block-mark-svg" aria-hidden="true">
          <path class="trap-block-mark-stroke trap-block-mark-stroke-a"
                d="M12 14 Q 18 24 26 31 T 50 50" />
          <path class="trap-block-mark-stroke trap-block-mark-stroke-b"
                d="M52 14 Q 46 24 38 30 T 14 50" />
        </svg>
      </div>
    `
  }

  private renderCardFace(card: Card, span: number, isValidHandTarget = false, distance = 0): string {
    // 보스 face(BOSS 태그/이름/HP 바/ATK 칩/좌상단 N턴 뱃지)는 모든 보스 공통 그라마.
    // 3x3 확장 같은 "사이즈 유형"은 specialEnemyKind 마커로 CSS에서만 분기된다.
    if (card.type === CardType.BOSS) {
      return this.renderBossFace(card, isValidHandTarget, distance)
    }
    // 위 분기에서 BOSS는 이미 renderBossFace로 우회 처리됐으므로 여기는 ENEMY만 검사.
    let stats = ''
    if (card.type === CardType.ENEMY) {
      // 적 수치는 카드 하단 양 끝(체력 좌 / 공격력 우)에 크게 붙여, 일러스트를 가리지 않으면서
      // 한눈에 읽히게 한다. 배치/크기는 .card-stats--corners가 담당한다.
      // 전리품 표기는 체력/공격력 사이 가운데 빈자리에 둔다. 위협 수치보다 한 단계 작게
      // 눌러, 먼저 읽혀야 하는 것(얼마나 아픈가)을 가리지 않게 한다.
      const dropMax = Math.max(0, card.defeatDropCount)
      const dropNote =
        dropMax > 0
          ? `<span class="stat drop">${handCardIcon()}<span class="stat-value">0~${dropMax}장</span></span>`
          : ''
      stats = `
        <div class="card-stats card-stats--corners">
          <span class="stat hp">${heartIcon()}<span class="stat-value">${card.getHealth()}</span></span>
          ${dropNote}
          <span class="stat atk">${swordIcon()}<span class="stat-value">${card.getDamage()}</span></span>
        </div>
      `
    } else if (card.type === CardType.TRAP) {
      // 모든 함정(거미줄/포자/폭탄, 2·3칸 포함)을 한 종류로 묶어 검+단일 피해 수치로
      // 표기한다. effectiveTrapDamage(card 자체 보너스=시련) + character.trapDamageBonus(유물)
      // 를 합산해 실제 ActionSystem과 동일한 최종 수치를 표기한다.
      const charTrapBonus = this.currentGameState?.getCharacter().trapDamageBonus ?? 0
      // 아이콘은 검이 아니라 함정(이빨)이다 — 검을 쓰면 "이 함정이 공격한다"로 읽혀
      // '밟아서 받는 피해'라는 성격이 사라진다.
      let damageLabel: string
      if (card.trapKind === 'bush') {
        // 덤불은 잡동사니(보물)와 같은 패턴이다 — 실제 피해는 밟는 순간에 굴리므로,
        // 카드 얼굴은 확정 수치가 아니라 범위를 보여 준다. effectiveTrapDamage()를
        // 매 렌더마다 부르면 그때그때 새로 굴려 화면에서 수치가 깜빡인다.
        const span = Math.min(3, Math.max(1, card.groupCount))
        const BUSH_RANGES: [number, number][] = [[0, 1], [2, 3], [5, 5]]
        const [lo, hi] = BUSH_RANGES[span - 1]
        const min = lo + charTrapBonus
        const max = hi + charTrapBonus
        damageLabel = min === max ? `${min}` : `${min}~${max}`
      } else {
        damageLabel = `${card.effectiveTrapDamage() + charTrapBonus}`
      }
      stats = `
        <div class="card-stats card-stats--trap">
          <span class="stat atk">${trapIcon()}<span class="stat-value">${damageLabel}</span></span>
        </div>
      `
    } else if (card.type === CardType.FLOWER) {
      // Seeds wait to bloom; all grown flowers show current harvest value.
      const label = card.flowerKind === 'seed' ? '대기' : `+${card.flowerValue}`
      // 꽃은 종류마다 **주는 자원이 다르다**. 전부 ✦로 표기하면 무슨 꽃을 키우는지
      // 이름을 외우지 않고서는 알 수 없다 — 수확물 아이콘을 그대로 보여 준다.
      stats = `<div class="card-stats group-note flower-note">${this.faces.flowerHarvestMeta(card.flowerKind).icon}<span>${label}</span></div>`
    } else if (card.type === CardType.TREASURE && card.treasureKind === 'starlight') {
      // 90~100층 별빛은 손패 보상이 아닌 턴 열쇠임을 카드 자체에서 즉시 읽히게 한다.
      // 별빛이 주는 것은 불빛이 아니라 **턴**이므로 턴 상징(촛불)을 쓴다.
      stats = `<div class="card-stats group-note treasure-group-note starlight-note">${candleIcon()}<span>턴 +1</span></div>`
    } else if (card.type === CardType.TREASURE) {
      // 일반·황금 상자: 드롭 범위를 라벨로 표시한다(보스 보상은 효과 설명).
      const safeSpan = Math.min(3, Math.max(1, card.groupCount))
      const CHEST_RANGES:   [number, number][] = [[1,2],[2,4],[3,6]]
      const GOLDEN_RANGES:  [number, number][] = [[2,3],[4,6],[6,9]]
      const JUNK_RANGES:    [number, number][] = [[0,1],[1,2],[2,3]]  // 온보딩 잡동사니
      const rangeTable = card.treasureKind === 'goldenChest' ? GOLDEN_RANGES
        : card.treasureKind === 'junk' ? JUNK_RANGES
        : CHEST_RANGES
      const [rMin, rMax] = rangeTable[safeSpan - 1]
      // 앞의 카드 아이콘이 이미 '손패'를 말하므로 글자로 한 번 더 적지 않는다 — 좁은 카드에서
      // 수치가 클수록 유리하다.
      const isBossReward = card.id.startsWith('boss-reward-')
      const treasureNote = isBossReward ? escapeHtml(card.description) : `${rMin}~${rMax}장`
      // 상자가 주는 것은 손패다 — 보스 보상(효과 설명)만 ✦를 유지한다.
      const treasureIcon = isBossReward ? sparkleIcon() : handCardIcon()
      // 보스 보상만 수치가 아니라 문장('체력 / 불씨 회복')이라 크게 키우면 줄이 넘친다.
      const noteClass = isBossReward ? ' group-note--sentence' : ''
      stats = `<div class="card-stats group-note treasure-group-note${noteClass}">${treasureIcon}<span>${treasureNote}</span></div>`
    }

    const groupBadge = span > 1 ? `<div class="group-badge">×${span}</div>` : ''
    // 선공 딱지: 선공 활성 시 적/특수적/보스 소환적(모두 CardType.ENEMY) 우상단에 붙는다.
    const firstStrikeBadge = this.firstStrikeActive && card.type === CardType.ENEMY
      ? `<div class="first-strike-card-badge" aria-label="선공: 이 적이 먼저 공격합니다">선공</div>`
      : ''
    // 굳음 표기는 별도 배지 판 없이 글자만 띄워 카드 일러스트와 HP바를 덜 가린다.
    const frozenBadge = card.isFrozen()
      ? `<div class="frozen-center-badge" aria-label="굳음 ${card.frozenTurns}턴"><span class="frozen-center-title">굳음</span><span class="frozen-center-turns">${card.frozenTurns}턴</span></div>`
      : ''
    const trapBadge =
      card.type === CardType.TRAP && card.trapKind === 'bomb' && card.isBombArmed
        ? `<div class="frozen-badge bomb-badge">점화</div>`
        : card.type === CardType.TRAP && card.trapKind === 'spore'
          ? `<div class="frozen-badge spore-badge">번식 ${card.sporeTurnsUntilSpread}턴</div>`
          : ''
    // 온보딩 필드 카드(바위/덤불/잡동사니) 만료 카운트다운 뱃지 — 좌상단, 종류별 색감(2→1→0).
    // 직전 렌더 대비 턴수가 실제로 바뀐 경우에만 is-pop을 부여해 갱신 턴에만 1회 확대 연출한다.
    let fieldExpiryBadge = ''
    if (card.isOnboardingField()) {
      const kind = card.enemySpriteId === 'enemyRock' ? 'rock' : card.trapKind === 'bush' ? 'bush' : 'junk'
      const prevShown = this.fieldExpiryLastShown.get(card.id)
      const changed = prevShown !== undefined && prevShown !== card.fieldExpiryTurns
      this.fieldExpiryLastShown.set(card.id, card.fieldExpiryTurns)
      fieldExpiryBadge = `<div class="field-expiry-badge field-expiry-${kind}${changed ? ' is-pop' : ''}">${card.fieldExpiryTurns}턴</div>`
    }
    // 꽃 성장 뱃지: 씨앗 제외, 다음 성장까지 남은 턴수를 포자 배지와 동일 방식으로 표시한다.
    const flowerGrowthBadge = card.type === CardType.FLOWER && card.flowerKind !== 'seed'
      ? `<div class="frozen-badge flower-growth-badge">성장 ${card.flowerKind === 'marigold' && card.flowerTurnsAlive % 2 === 1 ? 1 : card.flowerKind === 'marigold' ? 2 : 1}턴</div>`
      : ''
    // 괴물꽃은 원래 꽃의 성장 표기를 시든 회녹색으로 계승해, 작아도 커질 위협을 예고한다.
    const monsterFlowerGrowthBadge = card.type === CardType.ENEMY && card.specialEnemyKind === 'monsterFlower'
      ? `<div class="frozen-badge monster-flower-growth-badge">성장 ${card.monsterFlowerGrowthTurns}턴</div>`
      : ''
    // 이벤트 문 카운트다운 뱃지: 전방 도달(-1→2) 후에만 표시(대기행에서는 미부착). 흑백 톤.
    const eventBadge = card.type === CardType.EVENT && card.eventTurnsUntilClose >= 0
      ? `<div class="event-badge">${card.eventTurnsUntilClose}턴</div>`
      : ''

    // 보스 보상 카드는 3-wide span이어도 카드 자체 이름을 그대로 표시한다.
    // 함정은 합쳐질 때 Card가 도감과 동일한 이름(촛농 거미집/밀랍 거미굴, 번식 포자군/
    // 포자 군락)을 이미 갖고 있으므로 일반 라벨로 덮지 않고 card.name을 그대로 쓴다.
    // 온보딩 바위/잡동사니도 Card가 폭별 전용 이름(적당한/큰 바위, 오래된 물건/방치된 가구)을
    // 정하므로 일반 라벨('적 무리'/'적당한 상자')로 덮지 않는다.
    const groupName = span > 1 && !card.isSpecialEnemy && card.type !== CardType.TRAP &&
      card.treasureKind !== 'starlight' && card.treasureKind !== 'junk' &&
      card.enemySpriteId !== 'enemyRock' && !card.id.startsWith('boss-reward-')
      ? this.groupName(card.type, span)
      : card.name

    const sprite = spriteForCard(card)
    const artStyle = sprite ? `style="background-image: url('${sprite}')"` : ''

    return `
      ${groupBadge}
      ${firstStrikeBadge}
      ${frozenBadge}
      ${trapBadge}
      ${flowerGrowthBadge}
      ${monsterFlowerGrowthBadge}
      ${fieldExpiryBadge}
      ${eventBadge}
      <div class="card-face">
        <div class="card-art" ${artStyle} aria-hidden="true"></div>
        <div class="card-overlay" aria-hidden="true"></div>
        <div class="card-content">
          <div class="card-name">${groupName}</div>
          ${stats}
        </div>
      </div>
    `
  }

  /** 보스 공통 face. 풀-아트 + 하단 보스바(플레이어 hp-bar 톤) + 큰 ATK 칩 +
   *  좌상단 N턴 뱃지 layout. "3x3 거대" 같은 사이즈 유형은 specialEnemyKind 마커가
   *  걸리는 .boss-kind-* CSS에서 분기된다(face 마크업은 동일). */
  private renderBossFace(card: Card, isValidHandTarget = false, distance = 0): string {
    const sprite = spriteForCard(card)
    const hp = card.getHealth()
    const maxHp = card.enemyHealthTotal || card.baseHealth || hp
    // 보스 HP 막대도 플레이어 HP처럼 롤링 중인 표시값으로 폭을 잡아, 숫자가
    // 띠리링 깎이는 동안 막대가 한 번에 스냅하지 않도록 한다. maxHp는
    // syncHudCounterLinkedVisuals가 매 프레임 막대 폭을 다시 계산할 때 쓰므로 저장한다.
    this.bossHpMax = Math.max(1, maxHp)
    this.bossHpCurrent = hp
    const visualHp = this.hudCounterVisibleStartValue('boss-hp', hp)
    const hpPct = Math.max(0, Math.min(100, (visualHp / this.bossHpMax) * 100))
    const atk = card.getDamage()
    // waxKnight의 밀랍 방패는 플레이어 HP 영역처럼 HP 게이지 좌상단에 붙여
    // 체력/방패를 같은 시선 흐름에서 읽게 한다.
    const shield = Math.max(0, card.bossShield ?? 0)
    const shieldDisplay = shield > 99 ? '99+' : String(shield)
    const shieldChip = shield > 0
      ? `<span class="boss-face-shield-chip" aria-label="보스 방패 ${shield}">
           <span class="boss-face-shield-chip-icon" aria-hidden="true">
             ${shieldIcon()}
             <span class="boss-face-shield-chip-value ${shield > 99 ? 'is-capped' : ''}">${shieldDisplay}</span>
           </span>
         </span>`
      : ''
    // 보스는 일반 card-face를 우회하므로 굳음 중앙 표기를 boss-face 내부에도 직접 넣는다.
    const frozenBadge = card.isFrozen()
      ? `<div class="frozen-center-badge boss-frozen-center-badge" aria-label="굳음 ${card.frozenTurns}턴"><span class="frozen-center-title">굳음</span><span class="frozen-center-turns">${card.frozenTurns}턴</span></div>`
      : ''
    // 칸 타겟팅 중에는 보스 face 전체가 '고를 칸만 남기는' 모드로 바뀐다.
    // 일러스트·이름·HP바·뱃지를 뒤로 밀고 성한 칸만 앞으로 끌어올린다.
    const cellTargeting = this.handTargetingMode !== null && isValidHandTarget && this.bossGimmickGrid !== null
    // 보스 카드 자체가 대상인가(불씨 등) — 아니면 부가물 칸만 대상인 손패(키틴·열쇠)다.
    // 후자는 함정/보물 칸만 빛나야 하므로 격자가 칸별로 갈라 그린다.
    const cardLevelTarget = this.handTargetingMode !== null && this.isValidTargetRule(
      this.handTargetingMode.merged
        ? getHandCardDef(this.handTargetingMode.defId).targeting.triple
        : getHandCardDef(this.handTargetingMode.defId).targeting.base,
      card,
      distance
    )
    // 페이지가 오를수록 카드에 열기가 오른다. 세기는 data-page(2·3)로, 색은 tone으로 갈린다.
    const phase = this.bossPagePhase
    const phaseAttrs = phase && phase.page >= 2
      ? ` data-page="${Math.min(3, phase.page)}" data-page-tone="${phase.tone}"`
      : ''
    // 보스 종류를 face에 실어 둔다 — 조각사 비대화처럼 '이 보스만' 붙는 연출을 CSS에서
    // 고를 수 있게 하기 위해서다(렌더러에 보스별 분기를 늘리지 않는다).
    const kindAttr = card.specialEnemyKind ? ` data-boss-kind="${card.specialEnemyKind}"` : ''
    return `
      <article class="boss-face ${cellTargeting ? 'is-cell-targeting' : ''}"${phaseAttrs}${kindAttr} style="--boss-art: url('${sprite}');">
        ${frozenBadge}
        <div class="boss-face-art" aria-hidden="true"></div>
        <div class="boss-face-overlay" aria-hidden="true"></div>
        ${phaseAttrs ? '<div class="boss-face-phase-heat" aria-hidden="true"></div>' : ''}
        <div class="boss-face-badge" aria-label="다음 공격 카운트" data-boss-attack-countdown>${this.bossFx.getBossAttackCountdownText()}</div>
        <div class="boss-face-title-row">
          <span class="boss-face-tag">BOSS</span>
          <span class="boss-face-name">${escapeHtml(card.name)}</span>
        </div>
        <div class="boss-face-stats">
          <div class="boss-face-hp-column">
            ${shieldChip}
            <div class="boss-face-hpbar" aria-label="보스 체력">
              <div class="boss-face-hpbar-fill" style="width:${hpPct}%"></div>
              ${this.renderBossHpPhaseMarkers(card, maxHp)}
              <span class="boss-face-hpbar-text">
                <span class="boss-face-hpbar-icon">${heartIcon()}</span>
                ${this.renderHudCounter('boss-hp', hp)}<span class="boss-face-hpbar-sep">/</span><span>${maxHp}</span>
              </span>
            </div>
          </div>
          <span class="boss-face-atk">${swordIcon()}<span class="boss-face-atk-value">${atk}</span></span>
        </div>
        ${this.bossFx.bossGimmickGridHtml(isValidHandTarget, distance, cardLevelTarget)}
      </article>
    `
  }

  /**
   * 보스 HP바 페이지 경계선. 어디에 몇 개 긋는지는 보스 컨트롤러가 정한다
   * (`bossPageMarkers`) — 페이지 규칙의 단일 출처가 둘로 갈리지 않게 한다.
   * 이미 뚫린 경계는 `is-open`으로 점선이 되어 "여기는 지났다"가 막대에 남는다.
   */
  private renderBossHpPhaseMarkers(_card: Card, maxHp: number): string {
    return this.bossPageMarkers
      .filter(({ threshold }) => threshold > 0 && threshold < maxHp)
      .map(({ threshold, open }) => {
        const left = Math.max(0, Math.min(100, (threshold / maxHp) * 100))
        return `<span class="boss-face-hpbar-page-marker ${open ? 'is-open' : ''}"
                      style="left:${left}%" aria-hidden="true"></span>`
      })
      .join('')
  }

  private groupName(type: CardType, span: number): string {
    if (span <= 1) return ''
    if (type === CardType.ENEMY) return span === 2 ? '적 무리' : '거대 적 무리'
    // 함정은 호출부에서 card.name(도감명)을 직접 쓰므로 여기서 라벨을 만들지 않는다.
    if (type === CardType.TREASURE) return span === 2 ? '적당한 상자' : '큰 상자'
    if (type === CardType.FLOWER) return '꽃밭'
    return ''
  }

  private renderPlayerZone(character: Character): string {
    const relicLayer =
      character.relics.length > 0
        ? `<div class="utility-layer relic-layer" aria-label="Owned relics">${this.renderRelicLayer(character)}</div>`
        : ''
    return `
      <div class="player-zone" aria-label="Player controls and relic plan">
        <div class="utility-layer utility-layer-left" aria-label="Utility buttons">
          <button class="compendium-btn compendium-btn-floating" type="button" data-open-experience aria-label="경험 열기">
            <span class="compendium-btn-icon" aria-hidden="true">${experienceIcon()}</span>
            <span class="compendium-btn-label">경험</span>
          </button>
          <button class="compendium-btn compendium-btn-floating" type="button" data-open-compendium aria-label="도감 열기">
            <span class="compendium-btn-icon" aria-hidden="true">${bookIcon()}</span>
            <span class="compendium-btn-label">도감</span>
          </button>
        </div>
        ${this.renderPlayer(character)}
        ${relicLayer}
      </div>
    `
  }

  /** Linear combo gauge at the top of the hand panel: a small mode button
   *  on the LEFT, then 10 candle ticks across as a horizontal bar. Clicking
   *  the mode button opens a simple vertical list of the four modes,
   *  anchored to its left edge. The wheel keeps the same data-candle-wheel /
   *  data-candle-mode hooks so the existing listeners just work. */
  private renderCandleGauge(character: Character): string {
    const candle = character.candle ?? 0
    const candleMax = character.candleMax ?? 10
    const visualCandle = this.hudCounterVisibleStartValue('candle', candle)
    const candlePct = Math.max(0, Math.min(100, (visualCandle / candleMax) * 100))
    const currentMode = character.candleMode ?? 'attack'
    const mode = this.faces.candleModeMeta(currentMode)
    const candleText = this.renderHudCounter('candle', candle)
    const candleMaxText = this.renderHudCounter('candleMax', candleMax)
    const ticks = Array.from({ length: candleMax }, (_, idx) => {
      const filled = idx < visualCandle ? 'is-filled' : ''
      return `<span class="candle-gauge-tick ${filled}" aria-hidden="true"></span>`
    }).join('')

    // Vertical mode list: ordered from "next-to-current at top" through the
    // rest. We render in a fixed canonical order so the player can rely on
    // muscle memory; the currently-selected mode reads as sunken/dark.
    const allModes: CandleMode[] = ['attack', 'max-health', 'ember', 'draw']
    const listItems = allModes
      .map((m) => {
        const meta = this.faces.candleModeMeta(m)
        const isCurrent = m === currentMode ? 'is-current' : ''
        return `
          <button class="candle-mode-list-item ${isCurrent}"
                  type="button"
                  data-candle-mode="${m}"
                  title="${meta.label}: ${meta.effect}"
                  aria-label="${meta.label}: ${meta.effect}">
            <span class="candle-mode-list-icon">${meta.icon}</span>
            <span class="candle-mode-list-label">${meta.label}</span>
          </button>
        `
      })
      .join('')

    return `
      <div class="candle-gauge" aria-label="콤보 게이지 (${candle}/${candleMax}, ${mode.label})">
        <div class="candle-mode-wheel" data-candle-wheel>
          <button class="candle-mode-btn" type="button" data-toggle-candle-fan
                  aria-label="게이지 모드: ${mode.label}. ${mode.effect}"
                  title="${mode.label}: ${mode.effect}">
            <span class="candle-mode-icon">${mode.icon}</span>
            <span class="candle-mode-label">${mode.label}</span>
          </button>
          <div class="candle-mode-list" aria-hidden="true">${listItems}</div>
        </div>
        <div class="candle-gauge-body">
          <div class="candle-gauge-meter" style="--candle-fill: ${candlePct}%; --candle-max: ${candleMax}">
            ${ticks}
          </div>
          <div class="candle-gauge-label"><span class="candle-gauge-label-icon">${comboGaugeIcon()}</span>${candleText}/${candleMaxText} · ${mode.effect}</div>
        </div>
      </div>
    `
  }

  /** Render owned relics as a fanned hand of artifact preview cards beside the player. */
  private renderRelicLayer(character: Character): string {
    const total = character.relics.length
    const relics = character.relics
      .map((id, index) => this.renderRelicMiniCard(id, index, total))
      .join('')
    return `<div class="relic-stack" aria-label="보유 유물" style="--relic-count:${total}">${relics}</div>`
  }

  /** Owned relic card in the fan. The card itself is the preview, so hover only
   *  lifts this card above its siblings rather than opening a separate layer. */
  private renderRelicMiniCard(id: RelicId, index: number, total: number): string {
    const def = getRelicDef(id)
    const profile = this.currentGameState?.getCharacter().customRelicProfiles[id]
    const title = profile?.name ?? def.name
    const effect = profile?.effect ?? def.effect
    const center = (total - 1) / 2
    const offset = index - center
    // 카드가 늘어도 ±18°/±54px 범위 안에서 균등 분포 — n≤6은 기존 스텝(7°/22px)과 동일.
    const rotStep    = center > 0 ? Math.min(7,  18 / center) : 0
    const spreadStep = center > 0 ? Math.min(22, 54 / center) : 0
    const rotate = offset * rotStep
    const spread = offset * spreadStep
    const lift   = center > 0 ? (Math.abs(offset) / center) * 8 : 0
    const pinnedClass = this.pinnedRelicId === def.id ? 'is-pinned' : ''
    // 활성화형 유물이 발동 직전(다음 1회면 발사)이면 '충전됨'으로 발광·부상시켜 준비됐음을 알린다.
    // 판정 대상·카운터·문턱은 RELIC_STACK_FEEDBACK 레지스트리로 관리 — 새 유물은 거기 등록만 하면 자동.
    const enh = this.currentGameState?.enhancements
    const charge = relicStackFeedback(def.id)?.charge
    // 리셋형(0..N-1 순환)·단조 증가형(20주기 등) 카운터 모두 modulo로 '발동 직전'을 판정한다.
    const chargedClass = enh && charge && (enh[charge.counter] as number) % charge.threshold === charge.threshold - 1 ? 'is-charged' : ''
    return `
      <article class="relic-mini-card ${RARITY_CLASS_BY_TIER[def.rarity]} ${pinnedClass} ${chargedClass}"
               data-owned-relic="${def.id}"
               style="--relic-i:${index}; --relic-x:${spread}px; --relic-rot:${rotate}deg; --relic-y:${lift}px;"
               tabindex="0"
               title="${title}: ${effect}"
               aria-label="${title}: ${effect}">
        ${this.faces.relicPreviewFace(def.id)}
      </article>
    `
  }

  /** 유물 스택 누적/발동 시 해당 유물 카드를 블라스트로 부상시켜 확실히 알린다:
   *  z상단으로 올라와 확대(불빛 획득 톤) → 증가분 확인용 체류 → 스르륵 원위치로 하강.
   *  같은 카드가 부상 중이면 재시작하지 않는다(연속 발동 시 깜빡임 방지). */
  playRelicStackBlast(relicId: RelicId): void {
    const card = this.boardElement.querySelector<HTMLElement>(`.relic-mini-card[data-owned-relic="${relicId}"]`)
    if (!card || card.dataset.stackBlasting === '1') return
    card.dataset.stackBlasting = '1'
    const prevZ = card.style.zIndex
    card.style.zIndex = '60' // 팬 상단으로 부상(충전 발광 42보다 위)
    const baseX = 'translateX(calc(-50% + var(--relic-x, 0px)))'
    const rest = `${baseX} translateY(var(--relic-y, 0px)) rotate(var(--relic-rot, 0deg)) scale(0.98)`
    const anim = card.animate(
      [
        { offset: 0,    transform: rest, filter: 'brightness(1)' },
        // 부상 + 확대 + 발광 블라스트
        { offset: 0.2,  transform: `${baseX} translateY(-34px) rotate(0deg) scale(1.3)`,  filter: 'brightness(1.5) drop-shadow(0 0 14px rgba(255,206,120,0.95))' },
        // 체류 — 커진 상태로 잠시 머물러 증가한 스택을 확실히 보여준다
        { offset: 0.62, transform: `${baseX} translateY(-30px) rotate(0deg) scale(1.24)`, filter: 'brightness(1.3) drop-shadow(0 0 12px rgba(255,206,120,0.8))' },
        // 스르륵 원위치로 하강
        { offset: 1,    transform: rest, filter: 'brightness(1)' },
      ],
      { duration: 1400, easing: 'cubic-bezier(0.18, 0.86, 0.22, 1)' }
    )
    const restore = () => { card.style.zIndex = prevZ; delete card.dataset.stackBlasting }
    anim.onfinish = restore
    anim.oncancel = restore
  }

  private renderPlayer(character: Character): string {
    const visualHealth = this.hudCounterVisibleStartValue('health', character.health)
    const visualMaxHealth = Math.max(
      1,
      this.hudCounterVisibleStartValue('maxHealth', character.maxHealth)
    )
    const hpPct = Math.max(0, Math.min(100, (visualHealth / visualMaxHealth) * 100))
    const hpText = this.renderHudCounter('health', character.health)
    const maxHpText = this.renderHudCounter('maxHealth', character.maxHealth)
    const previousShield = this.displayedHudCounters.get('shield') ?? 0
    const shouldRenderShieldChip = character.shield > 0 || (this.hasRendered && previousShield > 0)
    // Keep the exact shield amount in aria-label while capping the tiny in-icon
    // text at 99+ so large shield stacks do not spill outside the silhouette.
    const shieldTarget = Math.min(character.shield, 99)
    if (character.shield > 99) this.displayedHudCounters.set('shield', shieldTarget)
    const shieldHideAttr = character.shield <= 0 ? 'data-count-hide-when-zero="true"' : ''
    const shieldCounter = this.renderHudCounter('shield', shieldTarget, '', shieldHideAttr)
    const shieldDisplay = character.shield > 99 ? '99+' : shieldCounter
    const shieldChip = shouldRenderShieldChip
      ? `<span class="player-shield-chip ${character.shield <= 0 ? 'is-emptying' : ''}" aria-label="방패 ${character.shield}">
             <span class="player-shield-chip-icon" aria-hidden="true">
               ${shieldIcon()}
               <span class="player-shield-chip-value ${character.shield > 99 ? 'is-capped' : ''}">${shieldDisplay}</span>
             </span>
           </span>`
      : ''
    // 피격 게이지 연출이 도는 동안에는 render가 클래스를 다시 심는다 —
    // 진행 위치는 restoreBoardAnimationPhases가 이어 붙이므로 되감기지 않는다.
    const hpDamageClass = performance.now() < this.hpDamagePulseUntil ? 'is-hp-damaged' : ''
    return `
      <div class="player-row">
        <div class="player-card">
          <div class="player-art" style="background-image: url('${SpriteUrls.player}')" aria-hidden="true"></div>
          <div class="player-overlay" aria-hidden="true"></div>
          <div class="player-content">
            <div class="player-stats">
              <div class="hp-column ${hpDamageClass}">
                ${shieldChip}
                <div class="hp-bar" data-fx-id="hp-bar">
                  <div class="hp-fill" style="width: ${hpPct}%" data-fx-id="hp-fill"></div>
                  <span class="hp-text" data-fx-id="hp-text">
                    <span class="hp-text-icon">${heartIcon()}</span>
                    ${hpText}/${maxHpText}
                  </span>
                </div>
              </div>
              <div class="atk-stat">
                <span class="atk-stat-icon">${swordIcon()}</span>
                ${this.renderHudCounter('attack', character.damage)}
              </div>
            </div>
          </div>
        </div>
      </div>
    `
  }

  /** 팩 피커 등 외부 호출 호환용 위임. */
  public cardEffectHtml(id: HandCardId, merged = false): string { return this.faces.cardEffectHtml(id, merged) }
  public recipeEffectHtml(r: Recipe): string { return this.faces.recipeEffectHtml(r) }

  /**
   * Render the 10-slot bottom-up hand stack. Slot 0 (model) is the bottom of
   * the stack; slot HAND_MAX-1 is the top. Empty slots above the hand are
   * still rendered as outlines so falling animations have a target column.
   */
  private renderHand(character: Character, scorePanel: ScorePanelState): string {
    const slots: string[] = []
    const handMax = character.handMax || 10
    const targeting = scorePanel.pendingHandTarget ?? this.handTargetingMode

    // Build each slot bottom-up in MODEL order (slot 0 first), then we render
    // the column reversed so slot 0 displays at the bottom. New cards receive
    // a compact acquisition ordinal so multi-card rewards fall one-by-one
    // starting from the first newly stacked card, not from their absolute slot.
    let enteringOrdinal = 0
    for (let i = 0; i < handMax; i++) {
      const card = character.hand[i]
      if (!card) {
        slots.push(`<li class="hand-slot is-empty" data-slot-index="${i}" aria-hidden="true"></li>`)
        continue
      }
      const def = getHandCardDef(card.defId)
      const isArming = targeting && targeting.slotIndex === i
      const readyRecipes = scorePanel.chainHints?.recipeReadyBySlot?.[i] ?? []
      const recipeReady = readyRecipes.length > 0
      const demonReady = readyRecipes.some((r) => r.id === 'demon-summon')
      // demon-summon을 제외한 다른 레시피가 준비된 경우에만 일반 금빛 다이아를 표시한다.
      const otherRecipesReady = readyRecipes.filter((r) => r.id !== 'demon-summon')
      const hasOtherRecipes = otherRecipesReady.length > 0
      const recipeReadyTitle = recipeReady
        ? `즉시 조합: ${readyRecipes.map((r) => r.name).join(', ')}`
        : ''
      // Recipe previews sit left of the normal card hover preview, giving the
      // player the recipe name/effect before they commit to the glowing slot.
      const recipePreviewHtml = recipeReady
        ? `<aside class="hand-recipe-preview" aria-hidden="true">
            <span class="hand-recipe-preview-kicker">발동 조합</span>
            ${readyRecipes
              .map(
                (recipe) => {
                  const recipeDef = RECIPES.find((r) => r.id === recipe.id)
                  const flavorHtml = recipeDef ? this.faces.recipeFlavorHtml(recipeDef) : recipe.flavor
                  return `
                  <span class="hand-recipe-preview-row">
                    <strong>${recipe.name}</strong>
                    <em>${flavorHtml}</em>
                  </span>
                `
                }
              )
              .join('')}
          </aside>`
        : ''
      const merged = card.merged ? 'is-merged' : ''
      // Only mark a hand card as `is-entering` when its uid wasn't present
      // in the previous render. This keeps the drop animation a *real* entry
      // beat instead of re-firing on every panel re-render.
      const isNew = !this.previousHandUids.has(card.uid)
      const enterOrder = isNew ? enteringOrdinal++ : 0
      const classes = [
        'hand-slot',
        'hand-card',
        this.faces.categoryClass(def.category),
        RARITY_CLASS_BY_TIER[HAND_CARD_RARITY[card.defId] ?? 'common'],
        merged,
        isArming ? 'is-arming-target' : '',
        recipeReady ? 'is-recipe-ready' : '',
        // Lower hand slots sit close to the viewport bottom, so their hover
        // previews are anchored upward to keep the full card readable.
        i <= 2 ? 'is-low-preview' : '',
        isNew ? 'is-entering' : '',
      ]
        .filter(Boolean)
        .join(' ')
      // 강화팩 보너스를 반영한 동적 설명을 사용해 손패 미리보기에서 강화 수치가 즉시 보이도록 한다.
      const description = this.faces.resourceIconTextHtml(
        this.faces.enhancedHandCardDescription(card.defId, card.merged === true)
      )
      // aria-label에는 HTML/SVG 태그 없이 텍스트만 삽입한다.
      const ariaDesc = description.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
      const handArt = spriteForHandCard(card.defId)
      // Triple cards keep two lightweight visual copies in the DOM. CSS only
      // reveals them during the first merged-card entry so players see three
      // cards converge before the final starred card settles.
      const tripleMergeCopies = card.merged
        ? '<span class="triple-merge-copy copy-a" aria-hidden="true"></span><span class="triple-merge-copy copy-b" aria-hidden="true"></span>'
        : ''
      // 트리플 전용 호일 레이어(little_token .card-foil 기법). 전용 요소로 두는 이유는
      // 반짝임과 광택 스윕이 각각 자기 의사 요소를 필요로 하기 때문이다 — 버튼의
      // ::before/::after는 이미 황금빛 색 오버레이가 쓰고 있다.
      const tripleFoil = card.merged ? '<span class="triple-foil" aria-hidden="true"></span>' : ''
      // Persist source ids into data attributes for exactly the render where a
      // merge appears; playNewHandMergeEffects reads the previous rects and
      // converts them into CSS offsets for the copy layers.
      const mergeSourceUids = card.mergeSourceUids?.join('|') ?? ''
      slots.push(`
        <li class="${classes}" data-slot-index="${i}" data-hand-uid="${card.uid}" data-hand-def="${card.defId}"
            ${mergeSourceUids ? `data-merge-source-uids="${mergeSourceUids}"` : ''}
            style="--slot-index: ${i}; --hand-enter-order: ${enterOrder};"
            ${recipeReadyTitle ? `title="${recipeReadyTitle}"` : ''}>
          <button type="button" data-item-index="${i}"
                  style="--hand-card-art: url('${handArt}');"
                  aria-label="${def.name}: ${ariaDesc}${recipeReadyTitle ? ` · ${recipeReadyTitle}` : ''}">
            ${tripleMergeCopies}
            ${tripleFoil}
            ${demonReady ? `<span class="recipe-ready-mark recipe-ready-mark--demon" aria-hidden="true">✦</span>` : ''}
            ${hasOtherRecipes ? `<span class="recipe-ready-mark${demonReady ? ' is-has-demon' : ''}" aria-hidden="true">✦</span>` : ''}
            <span class="hand-card-thumb" aria-hidden="true">
              <img src="${handArt}" alt="" loading="lazy" />
            </span>
            <span class="hand-card-name">${def.name}${card.merged ? ' ★' : ''}</span>
          </button>
          <div class="hand-card-preview" style="--hand-card-back: url('${SpriteUrls.cardBack}');" aria-hidden="true">
            ${this.faces.handCardFace(card.defId, description, card.merged)}
            <span class="hand-shift-hint" aria-hidden="true">Shift 자세히 보기</span>
          </div>
          ${recipePreviewHtml}
        </li>
      `)
    }

    // Reverse so slot 0 sits at the bottom of the visual stack.
    const reversed = slots.slice().reverse().join('')

    // Targeting helper used to live as a row inside the hand panel, but with
    // a partially filled hand that pushed the UI around as it appeared and
    // disappeared. Now the prompt floats at the *top center of the viewport*
    // (see updateTargetBanner / .target-banner) so it never shifts layout.
    this.updateTargetBanner(targeting)

    return `
      <div class="hand-column">
        ${this.renderSpawnProbPanel(scorePanel)}
        <aside class="hand-panel" aria-label="Hand">
          <header class="hand-header" aria-label="손패 ${character.hand.length}/${handMax}">
            <!-- 카드 아이콘이 '손패'를 말하므로 낱말을 겹쳐 적지 않는다(아이콘 = 낱말 규칙). -->
            <span class="hand-header-icon">${handCardIcon()}</span>
            ${character.hand.length}/${handMax}
          </header>
          ${this.renderCandleGauge(character)}
          <ul class="hand-stack ${character.hand.length >= 8 ? 'is-crowded' : ''}" style="--hand-count: ${character.hand.length}">${reversed}</ul>
        </aside>
      </div>
    `
  }

  /** 손패 컬럼 상단에 독립 레이어로 표시하는 4종 스폰 확률.
   *  불씨 등급·유물·시련 모두 반영한 실효 가중치를 텍스트+% 한 줄로 표시한다. */
  private renderSpawnProbPanel(scorePanel: ScorePanelState): string {
    const p = scorePanel.spawnPercents
    if (!p) return ''
    const cats: Array<{ key: keyof typeof p; label: string }> = [
      { key: 'enemy',    label: '적'   },
      { key: 'trap',     label: '함정' },
      { key: 'treasure', label: '보물' },
      { key: 'flower',   label: '꽃'   },
    ]
    const items = cats
      .filter(({ key }) => p[key] > 0)
      .map(({ key, label }) =>
        `<span class="spp-item"><span class="spp-cat">${label}</span><span class="spp-pct">${p[key]}%</span></span>`
      )
      .join('<span class="spp-sep">·</span>')
    return `
      <div class="spawn-prob-panel" aria-label="스폰 확률">
        ${items}
      </div>
    `
  }

  /** 시작 직업 선택(외부 index 계약) — 구현은 renderer/JobSelectView.ts로 이동, 얇은 위임만 유지. */
  openJobSelect(jobs: JobDef[]): Promise<string> {
    return this.jobSelect.openJobSelect(jobs)
  }

  /** 직업 고스트 카드 → HUD 블라스트 위임. */
  animateJobCardToHud(job: JobDef): Promise<void> {
    return this.jobSelect.animateJobCardToHud(job)
  }

  /** 직업 선택 암막 걷기 위임. */
  playJobCurtainOpen(): Promise<void> {
    return this.jobSelect.playJobCurtainOpen()
  }

  /** 이벤트 씬/미니게임 위임 — 본체는 renderer/EventOverlayView. */
  wasEventIntroSkipped(): boolean {
    return this.eventOverlay.wasEventIntroSkipped()
  }

  showBossSkipButton(onSkip: () => void): () => void {
    return this.eventOverlay.showBossSkipButton(onSkip)
  }

  runEventEntry(
    cardId: string,
    def: EventDefinition,
    emberAvailable: boolean,
    onConsume: () => void,
    playDialogue: () => Promise<void>,
    skippable = false
  ): Promise<{ index: number; buttonRect: DOMRect }> {
    return this.eventOverlay.runEventEntry(cardId, def, emberAvailable, onConsume, playDialogue, skippable)
  }

  hideEventChoicesAfterSelection(index: number): Promise<void> {
    return this.eventOverlay.hideEventChoicesAfterSelection(index)
  }

  playEventGainBlast(buttonRect: DOMRect, targets: readonly string[]): Promise<void> {
    return this.eventOverlay.playEventGainBlast(buttonRect, targets)
  }

  closeEventEntry(): Promise<void> {
    return this.eventOverlay.closeEventEntry()
  }

  runMinionExchange(
    cardId: string,
    def: EventDefinition,
    cfg: MinionExchangeConfig,
    snap: EventResourceSnapshot,
    sink: EventResourceSink,
    onConsume: () => void,
    playDialogue: () => Promise<void>,
    onMoment?: (kind: EventMinigameMoment) => void,
    skippable = false
  ): Promise<void> {
    return this.eventOverlay.runMinionExchange(cardId, def, cfg, snap, sink, onConsume, playDialogue, onMoment, skippable)
  }

  runCountRps(
    cardId: string,
    def: EventDefinition,
    cfg: CountRpsConfig,
    snap: EventResourceSnapshot,
    sink: EventResourceSink,
    onConsume: () => void,
    playDialogue: () => Promise<void>,
    onMoment?: (kind: EventMinigameMoment) => void,
    skippable = false
  ): Promise<void> {
    return this.eventOverlay.runCountRps(cardId, def, cfg, snap, sink, onConsume, playDialogue, onMoment, skippable)
  }

  popEventBadge(cardId: string): void {
    this.eventOverlay.popEventBadge(cardId)
  }

  animateEventDoorCloseByIds(cardIds: readonly string[]): Promise<void> {
    return this.eventOverlay.animateEventDoorCloseByIds(cardIds)
  }

  /** 상점/제단 오버레이 위임 — 본체는 renderer/ShopOverlayView. */
  openShop(shop: ShopStateView, score: number, character: Character): void {
    this.shopOverlay.openShop(shop, score, character)
  }

  /** 상점 닫기 위임. */
  closeShop(): void {
    this.shopOverlay.closeShop()
  }

  /** 상점 퇴장 카드 연출 위임. */
  playShopExitAnimation(): Promise<void> {
    return this.shopOverlay.playShopExitAnimation()
  }

  /** 상점 구매 공통 임팩트 위임. */
  async playShopPurchaseImpact(target: HTMLElement, theme: Parameters<typeof SquareBurst.playOn>[1] = 'score'): Promise<void> {
    return this.shopOverlay.playShopPurchaseImpact(target, theme)
  }

  /** 팩 피커 열기 위임. */
  openPackPicker(view: ShopPackPickerView): void {
    this.shopOverlay.openPackPicker(view)
  }

  /** 팩 피커 카드 리롤 갱신 위임. */
  refreshPackPickerCards(view: ShopPackPickerView): void {
    this.shopOverlay.refreshPackPickerCards(view)
  }

  /** 팩 피커 닫기 위임. */
  closePackPicker(): void {
    this.shopOverlay.closePackPicker()
  }

  /** 강제 시련 선택 플로우 위임. */
  openForcedTrialShopFlow(cards: ForcedTrialCardView[]): void {
    this.shopOverlay.openForcedTrialShopFlow(cards)
  }

  /** 상점 진입 셔터 전이 위임. */
  playShopTransition(): Promise<void> {
    return this.shopOverlay.playShopTransition()
  }

  /** 상점 종료 셔터 상승 전이 위임. */
  playShopResumeTransition(): Promise<void> {
    return this.shopOverlay.playShopResumeTransition()
  }

  /** 셔터 상태 초기화 위임. */
  resetShutter(): void {
    this.shopOverlay.resetShutter()
  }

  /** 제단 EXIT → 보스 게이트 진동 전이 위임. */
  async playAltarBossGateTransition(): Promise<void> {
    return this.shopOverlay.playAltarBossGateTransition()
  }

  /** 제단 무료 유물 단일 픽 연출 위임. */
  async resolveAltarRelicPick(relicId: RelicId): Promise<void> {
    return this.shopOverlay.resolveAltarRelicPick(relicId)
  }

  /** 구매 유물 출발 rect 캡처 위임. */
  prepareRelicArrivalFromShop(relicId: RelicId): void {
    this.shopOverlay.prepareRelicArrivalFromShop(relicId)
  }

  /** 구매 유물 → 보유 팬 비행 연출 위임. */
  animatePreparedRelicArrival(): Promise<void> {
    return this.shopOverlay.animatePreparedRelicArrival()
  }

  /** 팩 구매 불빛 소비 트레일 위임. */
  fireScoreSpendTrailToTarget(target: HTMLElement | null, cost: number): void {
    this.shopOverlay.fireScoreSpendTrailToTarget(target, cost)
  }

  /** 유물 구매 트레일 위임. */
  animateShopPurchaseTrailToRelic(relicId: RelicId, count: number): Promise<void> {
    return this.shopOverlay.animateShopPurchaseTrailToRelic(relicId, count)
  }

  /** 팩 피커 리롤 피드백 위임. */
  async playPackRerollFeedback(cost: number): Promise<void> {
    return this.shopOverlay.playPackRerollFeedback(cost)
  }

  /** 무료 카드 소비/보상 라우팅 위임. */
  async consumeFreeCardAndRouteReward(
    kind: 'free-card' | 'free-coin-card',
    target: ResourceTrailTarget,
    amount: number,
    theme: BurstTheme = 'score'
  ): Promise<void> {
    return this.shopOverlay.consumeFreeCardAndRouteReward(kind, target, amount, theme)
  }

  /** 유물 슬롯 리롤 피드백 위임. */
  async playShopRerollFeedback(
    cost: number,
    nextOffers: ShopOfferView[],
    score: number,
    character: Character
  ): Promise<void> {
    return this.shopOverlay.playShopRerollFeedback(cost, nextOffers, score, character)
  }

  /** 악마 커튼 위임 — 본체는 renderer/BossFxView. */
  async closeDemonCurtain(): Promise<void> {
    return this.bossFx.closeDemonCurtain()
  }

  /** 불길한 붉은 일렁임 위임. */
  playOminousShimmer(): void {
    this.bossFx.playOminousShimmer()
  }

  /** 악마 소환 체인 배너 소멸 위임. */
  async playDemonBannerBurnFade(): Promise<void> {
    return this.bossFx.playDemonBannerBurnFade()
  }

  /** 악마 커튼 제거/보드 z-index 복원 위임. */
  removeDemonCurtain(): void {
    this.bossFx.removeDemonCurtain()
  }

  /** 악마 보스 등장 연출 위임. */
  async playDemonFireAppearAnimation(cardId: string): Promise<void> {
    return this.bossFx.playDemonFireAppearAnimation(cardId)
  }

  /** 악마 커튼 열기 위임. */
  async openDemonCurtain(): Promise<void> {
    return this.bossFx.openDemonCurtain()
  }

  /** 보스 인트로/전투 연출 위임 — 본체는 renderer/BossFxView. (인트로 카드 옵션 타입은 뷰가 단일 출처) */
  async openBossIntroOverlay(opts: Parameters<BossFxView['openBossIntroOverlay']>[0]): Promise<void> {
    return this.bossFx.openBossIntroOverlay(opts)
  }

  /** 보스 공격 카운트다운 갱신 위임(BossEvent 계약). */
  setBossAttackCountdown(n: number | null): void {
    this.bossFx.setBossAttackCountdown(n)
  }

  /** 보스 보상 카드 소비 연출 위임. */
  async playBossRewardClaimedConsume(cardId: string): Promise<void> {
    return this.bossFx.playBossRewardClaimedConsume(cardId)
  }

  /** 함정 무시 판정 연출 위임. */
  async playTrapIgnoreResist(trapCardId: string): Promise<void> {
    return this.bossFx.playTrapIgnoreResist(trapCardId)
  }

  /** 보스 굳음 저항 연출 위임. */
  async playBossFreezeResist(cardId: string): Promise<void> {
    return this.bossFx.playBossFreezeResist(cardId)
  }

  /** 보스 착지 연출 위임. */
  async playBossLandingAnimation(cardId: string): Promise<void> {
    return this.bossFx.playBossLandingAnimation(cardId)
  }

  /** 불씨 기사단장 등장 연출 위임. */
  async playWaxKnightSwoopAnimation(cardId: string): Promise<void> {
    return this.bossFx.playWaxKnightSwoopAnimation(cardId)
  }

  /** 보스 손패 콤보 연출 위임. */
  async animateBossHandCombo(cardId: string, effects: ('shield' | 'heal' | 'strike')[], bonusEffects: ('shield' | 'heal' | 'strike')[], amount: number, onResolve: (effect: 'shield' | 'heal' | 'strike') => Promise<void>): Promise<void> {
    return this.bossFx.animateBossHandCombo(cardId, effects, bonusEffects, amount, onResolve)
  }

  /** 밀랍 조각사 등장 연출 위임. */
  async playWaxSculptorAppearAnimation(cardId: string): Promise<void> {
    return this.bossFx.playWaxSculptorAppearAnimation(cardId)
  }

  /** 밀랍 조각사 전방 복귀 연출 위임. */
  async playSculptorReturnAnimation(cardId: string): Promise<void> {
    return this.bossFx.playSculptorReturnAnimation(cardId)
  }

  /** 조각사 소환 연출 위임. */
  async animateSculptorSummonEnemies(enemyIds: string[]): Promise<void> {
    return this.bossFx.animateSculptorSummonEnemies(enemyIds)
  }

  /** 후방 조각사 공격 연출 위임. */
  async animateSculptorBackAttack(cardId: string): Promise<void> {
    return this.bossFx.animateSculptorBackAttack(cardId)
  }

  /** 보스 격파 시퀀스 위임. */
  async playBossDefeatSequence(cardId: string): Promise<void> {
    return this.bossFx.playBossDefeatSequence(cardId)
  }

  /** 검은 양초 악마 공격 주기 연출 위임. */
  async animateDemonCandleTurn(cardId: string, count: number, startingCounter: number, onEachCandle: (index: number) => Promise<void>): Promise<void> {
    return this.bossFx.animateDemonCandleTurn(cardId, count, startingCounter, onEachCandle)
  }

  /** 거짓과 진실 연출 위임. */
  async animateDemonTruthLie(cardId: string, isTrue: boolean, onResolve: () => Promise<void>): Promise<void> {
    return this.bossFx.animateDemonTruthLie(cardId, isTrue, onResolve)
  }

  /** 악마 격파 시퀀스 위임. */
  async playDemonDefeatSequence(cardId: string): Promise<void> {
    return this.bossFx.playDemonDefeatSequence(cardId)
  }

  /** 마녀 격파 직전 한 마디 연출 위임. */
  async playWaxWitchDeathBeat(cardId: string, beat: number): Promise<void> {
    return this.bossFx.playWaxWitchDeathBeat(cardId, beat)
  }

  /** 마녀 격파 마지막 마디 연출 위임. */
  async playWaxWitchDeathFrenzy(cardId: string): Promise<void> {
    return this.bossFx.playWaxWitchDeathFrenzy(cardId)
  }

  /** runCardPool이 바뀔 때마다 호출해 도감 손패/조합 탭의 잠금 표시를 갱신한다. */
  setLockedCardIds(ids: readonly HandCardId[]): void {
    this.lockedCardIds = new Set(ids)
  }

  /** 해금팩 선택 후 호출해 도감 조합 탭의 레시피 잠금 표시를 갱신한다. */
  setLockedRecipeIds(ids: readonly string[]): void {
    this.lockedRecipeIds = new Set(ids)
  }

  // ── 도감/경험 탭 본체는 renderer/CompendiumView·ExperienceView로 이동 ──
  // index.ts 호환 위임 — 경험 데이터 공급자 연결.
  setExperienceDataProvider(fn: () => { disp: EnaDisposition; learning?: EnaLearningSnapshot; growth?: number }): void {
    this.experience.setExperienceDataProvider(fn)
  }

  // index.ts 호환 위임 — 정산 화면 성좌 위젯.
  renderSettlementHexagon(disp: EnaDisposition, learning?: EnaLearningSnapshot, growth?: number, prevAxisValues?: number[]): string {
    return this.experience.renderSettlementHexagon(disp, learning, growth, prevAxisValues)
  }

  /** Body-mounted center banner showing "대상 카드를 선택해" while a
   *  targeted hand card is armed. Pulses softly. */
  private updateTargetBanner(targeting: HandTargetingMode | null): void {
    let banner = document.getElementById('target-banner') as HTMLElement | null
    if (!banner) {
      banner = document.createElement('div')
      banner.id = 'target-banner'
      banner.className = 'target-banner'
      banner.setAttribute('aria-live', 'polite')
      banner.setAttribute('aria-hidden', 'true')
      document.body.appendChild(banner)
    }
    // 타겟팅 동안 칸이 잘 보이도록 배너/체인 토스트를 반투명 처리하는 전역 훅.
    document.body.classList.toggle('is-hand-targeting', targeting !== null)
    if (targeting) {
      const def = getHandCardDef(targeting.defId)
      banner.innerHTML = `
        <span class="target-banner-title">${def.name}</span>
        <span class="target-banner-sub">대상 카드를 선택해 · 다시 눌러 취소</span>
      `
      banner.classList.add('is-on')
    } else {
      banner.classList.remove('is-on')
    }
  }

  /** Top HUD: ember bar + decay timer + tier label + spawn weights chip. */
  private renderEmberHud(scorePanel: ScorePanelState): string {
    if (!scorePanel.emberTier) return ''
    const tier = scorePanel.emberTier
    const character = this.currentGameState?.getCharacter()
    if (!character) return ''
    const ember = character.ember
    const emberMax = character.emberMax
    const visualEmber = this.hudCounterVisibleStartValue('ember', ember)
    const visualEmberMax = Math.max(1, this.hudCounterVisibleStartValue('emberMax', emberMax))
    const pct = Math.max(0, Math.min(100, (visualEmber / visualEmberMax) * 100))
    const emberText = this.renderHudCounter('ember', ember)
    const emberMaxText = this.renderHudCounter('emberMax', emberMax)
    const countdown = scorePanel.emberDecayCountdown ?? 10
    // 적 공격력 +1 경계(dim→flickering, ember < 4)는 얇고 연한 라인,
    // 공격력 +2로 심화되는 경계(flickering→extinguished, ember < 1)는 더 진한 붉은 라인.
    // 선공은 두 구간(ember < 4) 모두에서 발동한다.
    const atk1LinePct = Math.min(100, (4 / visualEmberMax) * 100)
    const atk2LinePct = Math.min(100, (1 / visualEmberMax) * 100)
    return `
      <div class="ember-hud" aria-label="Ember status">
        <div class="ember-hud-inner">
          <div class="ember-line">
            <span class="ember-icon ember-flame ember-flame--${tier}" aria-hidden="true"><i class="ember-flame-body"></i></span>
            <div class="ember-bar">
              <div class="ember-bar-fill ember-tier-${tier}" style="width: ${pct}%"></div>
              <div class="ember-atk1-line" style="left: ${atk1LinePct.toFixed(1)}%" title="이 아래로 내려가면 적 공격력 +1, 적이 먼저 공격합니다" aria-hidden="true"></div>
              <div class="ember-atk2-line" style="left: ${atk2LinePct.toFixed(1)}%" title="이 아래로 내려가면 적 공격력 +2" aria-hidden="true"></div>
              <span class="ember-bar-label">불씨 ${emberText}/${emberMaxText} · ${EmberSystem.tierLabel(tier)}</span>
            </div>
            <span class="ember-countdown" title="다음 불씨 감소까지 남은 턴">
              ${countdown}턴 뒤 -1
            </span>
          </div>
        </div>
      </div>
    `
  }

  /** Vignette overlay whose intensity follows the ember tier. */
  /** body 최상단에 비네팅 오버레이를 영속 유지.
   *  innerHTML 재생성과 무관하게 전환 애니메이션이 끊기지 않으며,
   *  모든 UI 레이어(상점/보스/오버레이)를 덮는다. */
  private syncBodyVignette(intensity: number): void {
    const clamped = Math.max(0, Math.min(1, intensity))
    let el = document.getElementById('ember-vignette-overlay') as HTMLElement | null
    if (!el) {
      el = document.createElement('div')
      el.id = 'ember-vignette-overlay'
      el.className = 'ember-vignette'
      el.setAttribute('aria-hidden', 'true')
      document.body.appendChild(el)
    }
    el.style.setProperty('--vignette-opacity', clamped.toFixed(2))
    // 선공(불씨 낮음) 동안에는 화면 가장자리가 사알짝 일렁이는 느낌을 더해 위기감을 준다.
    el.classList.toggle('is-first-strike-shimmer', this.firstStrikeActive)
  }

  /**
   * Body-mounted floating chain banner. Sits above the player profile
   * (mirrors the target banner's positioning style) so the player can read
   * the chain without it cluttering the board. Each new event pops in with
   * a short shake; fired recipes get a brighter pulse glow + bigger font.
   *
   * Newness is detected by comparing event uids against the previous render
   * snapshot (`previousChainUids`) so already-shown items do not re-animate.
   */
  /** Refresh only the body-mounted chain banner without rebuilding the board.
   *  The hand flow uses this between delayed combo beats so text feedback can
   *  appear immediately while the old board DOM remains available for removal
   *  animations. */
  refreshChainBanner(hints?: ChainHints): void {
    this.updateChainBanner(hints)
  }

  private updateChainBanner(hints?: ChainHints): void {
    let banner = document.getElementById('chain-banner') as HTMLElement | null
    if (!banner) {
      banner = document.createElement('div')
      banner.id = 'chain-banner'
      banner.className = 'chain-banner'
      banner.setAttribute('aria-label', 'Active chain')
      banner.setAttribute('aria-live', 'polite')
      document.body.appendChild(banner)
      // Reset button is delegated to the same custom event the old strip used.
      banner.addEventListener('click', (e) => {
        const t = e.target as HTMLElement
        if (t.dataset.chainReset !== undefined) {
          document.dispatchEvent(new CustomEvent('chainReset'))
        }
      })
    }
    const events = hints?.events ?? []
    const demonPending = hints?.demonPending ?? false
    const demonImpactMode = hints?.demonImpactMode ?? false
    if (events.length === 0 && !demonPending && !demonImpactMode) {
      banner.classList.remove('is-on')
      banner.classList.remove('is-demon-impact')
      this.previousChainUids = new Set()
      return
    }
    // 임팩트 모드: 체인 배너를 크게/중앙으로/불타듯 표시 (X 버튼 없음).
    if (demonImpactMode) {
      banner.classList.add('is-demon-impact')
    } else {
      banner.classList.remove('is-demon-impact')
    }
    const parts: string[] = ['<span class="chain-banner-label">체인</span>']
    // 악마 소환 이벤트 체인은 배너 가장 좌측에 대형 붉은 다이아몬드로 별도 표시한다.
    if (demonPending) {
      parts.push(`<span class="chain-banner-demon-diamond" aria-label="악마 소환" title="악마 소환">✦</span>`)
      if (events.length > 0) {
        parts.push('<span class="chain-banner-demon-sep">|</span>')
      }
    }
    for (let i = 0; i < events.length; i++) {
      const ev = events[i]
      const isNew = !this.previousChainUids.has(ev.uid) ? 'is-new' : ''
      if (ev.kind === 'card') {
        parts.push(`
          <span class="chain-event chain-event-card hand-cat-${ev.category} ${isNew}" data-chain-uid="${ev.uid}">
            ${ev.name}
          </span>
        `)
      } else if (ev.kind === 'recipe') {
        // 임팩트 모드에서만 is-demon-impact 스코프 CSS가 적용되므로 일반 체인엔 영향 없음.
        const demonClass = ev.recipeId === 'demon-summon' ? 'chain-event-recipe--demon' : ''
        // recipeFlavorHtml로 desc-dyn 스팬 포함 실시간 수치 렌더; 정의 없으면 정적 텍스트 폴백
        const recipeDef = RECIPES.find((r) => r.id === ev.recipeId)
        const flavorHtml = recipeDef ? this.faces.recipeFlavorHtml(recipeDef) : ev.flavor
        parts.push(`
          <span class="chain-event chain-event-recipe ${demonClass} ${isNew}" data-chain-uid="${ev.uid}" title="${ev.flavor}">
            <span class="chain-event-mark">✦</span>
            <span class="chain-event-copy"><span class="chain-event-name">${ev.name}</span><span class="chain-event-flavor">${flavorHtml}</span></span>
          </span>
        `)
      } else if (ev.kind === 'gauge') {
        parts.push(`
          <span class="chain-event chain-event-gauge ${isNew}" data-chain-uid="${ev.uid}" title="${ev.flavor}">
            <span class="chain-event-mark chain-event-mark--sparkle">${sparkleIcon()}</span>
            <span class="chain-event-name">${ev.name}</span>
          </span>
        `)
      } else {
        parts.push(`
          <span class="chain-event chain-event-relic ${isNew}" data-chain-uid="${ev.uid}" title="${ev.flavor}">
            <span class="chain-event-mark">✧</span>
            <span class="chain-event-copy"><span class="chain-event-name">${ev.name}</span><span class="chain-event-flavor">${ev.flavor}</span></span>
          </span>
        `)
      }
      if (i < events.length - 1) {
        parts.push('<span class="chain-banner-arrow">→</span>')
      }
    }
    if (!demonImpactMode) {
      parts.push(
        '<button class="chain-banner-reset" type="button" data-chain-reset title="체인 초기화">×</button>'
      )
    }
    banner.innerHTML = parts.join('')
    banner.classList.add('is-on')
    // Snapshot uids so the next render won't re-animate existing events.
    this.previousChainUids = new Set(events.map((e) => e.uid))
  }

  private attachListeners(): void {
    const activeCards = this.boardElement.querySelectorAll<HTMLElement>(
      this.handTargetingMode ? '.cell.card.is-hand-target' : '.cell.card.is-active'
    )
    activeCards.forEach((el) => {
      el.addEventListener('click', (e) => {
        e.stopPropagation()
        const laneIndex = parseInt(el.dataset.lane || '0', 10)
        const distance = parseInt(el.dataset.distance || '0', 10)
        // 보스 칸 기믹 격자를 눌렀다면 그 하위 칸 번호를 함께 실어 보낸다.
        // 키보드(Enter)로 타일을 직접 열면 target이 격자 밖이라 undefined가 되고,
        // 모델이 중앙 칸으로 접어 처리한다.
        const gimmickCell = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-boss-gimmick-cell]')
        // 부서진 칸은 클릭을 여기서 삼킨다. 칸을 pointer-events로 비워 두면 클릭이
        // 보스 타일로 새어 엉뚱한(성한) 칸이 대신 맞는다.
        if (gimmickCell?.dataset.broken === '1') return
        const cellIndex = gimmickCell ? Number(gimmickCell.dataset.bossGimmickCell) : undefined
        this.handleCardClick(el, laneIndex, distance, cellIndex)
      })
    })

    // Hand card clicks are handled by permanent delegation in the constructor.

    // Mobile: first tap shows preview, second tap fires itemAction.
    // The touchend handler calls e.preventDefault() to suppress the ghost click
    // so the click listener above does not double-fire on touch devices.
    attachHandCardTouch(this.boardElement, (itemIndex) => {
      document.dispatchEvent(
        new CustomEvent<ItemActionDetail>('itemAction', {
          detail: { itemIndex, shiftKey: false },
        })
      )
    })

    // Chain reset is bound on the body-mounted chain banner (updateChainBanner)
    // since the old in-stage strip is gone.

    // Candle mode picker: clicking the centre toggles the 4-direction fan;
    // clicking a petal commits that mode and snaps the fan back closed.
    const wheel = this.boardElement.querySelector<HTMLElement>('[data-candle-wheel]')
    if (wheel) {
      const toggleBtn = wheel.querySelector<HTMLElement>('[data-toggle-candle-fan]')
      toggleBtn?.addEventListener('click', (e) => {
        e.stopPropagation()
        wheel.classList.toggle('is-fan-open')
      })
      wheel.querySelectorAll<HTMLElement>('[data-candle-mode]').forEach((petal) => {
        petal.addEventListener('click', (e) => {
          e.stopPropagation()
          const mode = petal.dataset.candleMode as CandleMode | undefined
          wheel.classList.remove('is-fan-open')
          if (!mode) return
          document.dispatchEvent(new CustomEvent('candleModeSelect', { detail: { mode } }))
        })
      })
      // Click anywhere else closes the fan so it never lingers open while
      // the player is interacting with the field.
      document.addEventListener(
        'click',
        (e) => {
          if (!wheel.classList.contains('is-fan-open')) return
          if (e.target instanceof Node && wheel.contains(e.target)) return
          wheel.classList.remove('is-fan-open')
        },
        { capture: true }
      )
    }

    // Owned relics can be click-pinned so long descriptions can be read
    // without holding a hover. Keyboard Enter/Space mirrors the same toggle.
    this.boardElement.querySelectorAll<HTMLElement>('.relic-mini-card').forEach((el) => {
      const togglePinned = () => {
        const relicId = el.dataset.ownedRelic as RelicId | undefined
        if (!relicId) return
        this.pinnedRelicId = this.pinnedRelicId === relicId ? null : relicId
        this.updatePinnedRelicClasses()
      }
      el.addEventListener('click', (e) => {
        e.stopPropagation()
        togglePinned()
      })
      el.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return
        e.preventDefault()
        e.stopPropagation()
        togglePinned()
      })
    })

    // Compendium opens an overlay browser of every spawning card + every hand
    // card. It is purely informational (does not pause/advance a turn).
    this.boardElement
      .querySelector<HTMLElement>('[data-open-compendium]')
      ?.addEventListener('click', (e) => {
        e.stopPropagation()
        this.compendium.openCompendium()
      })

    // 경험(성향) 패널 — 공급자가 연결돼 있으면 현재 성향/기본 토대를 읽어 성좌 시각화를 연다.
    this.boardElement
      .querySelector<HTMLElement>('[data-open-experience]')
      ?.addEventListener('click', (e) => {
        e.stopPropagation()
        this.experience.openFromProvider()
      })
  }

  private updatePinnedRelicClasses(): void {
    this.boardElement.querySelectorAll<HTMLElement>('.relic-mini-card').forEach((card) => {
      card.classList.toggle('is-pinned', card.dataset.ownedRelic === this.pinnedRelicId)
    })
  }


  /** 현재 hover 중인 손패 미리보기 DOM을 보존하기 위한 스냅샷.
   *  HTML 문자열이 아니라 실제 노드를 들고 있어 CSS 애니메이션 진행 상태까지 유지한다. */
  private captureStableHandPreview(): {
    slotIndex: number
    handUid: string
    preview: HTMLElement
    recipePreview: HTMLElement | null
  } | null {
    if (this.hoveredHandSlotIndex === null) return null
    const slot = this.boardElement.querySelector<HTMLElement>(
      `.hand-slot.hand-card[data-slot-index="${this.hoveredHandSlotIndex}"]`
    )
    const preview = slot?.querySelector<HTMLElement>(':scope > .hand-card-preview')
    const handUid = slot?.dataset.handUid
    if (!slot || !preview || !handUid) return null

    // 리렌더 직전부터 열린 상태 클래스를 박아 두면 노드를 잠깐 떼었다가
    // 되심는 브라우저 레이아웃 타이밍에서도 :hover 애니메이션이 재시작되지 않는다.
    this.markStableHandPreview(slot)
    const recipePreview = slot.querySelector<HTMLElement>(':scope > .hand-recipe-preview')
    return {
      slotIndex: this.hoveredHandSlotIndex,
      handUid,
      preview,
      recipePreview,
    }
  }

  /** 리렌더 후 같은 UID의 손패 슬롯에 기존 미리보기 DOM을 되돌려 놓는다. */
  private restoreStableHandPreview(snapshot: ReturnType<GameBoardRenderer['captureStableHandPreview']>): void {
    if (!snapshot) return
    const slot = this.boardElement.querySelector<HTMLElement>(
      `.hand-slot.hand-card[data-slot-index="${snapshot.slotIndex}"][data-hand-uid="${snapshot.handUid}"]`
    )
    if (!slot) return

    const freshPreview = slot.querySelector<HTMLElement>(':scope > .hand-card-preview')
    if (freshPreview) freshPreview.replaceWith(snapshot.preview)
    // Re-apply after replacement because a fresh slot may not carry the stable
    // classes captured from the old DOM tree.
    this.markStableHandPreview(slot)

    const freshRecipePreview = slot.querySelector<HTMLElement>(':scope > .hand-recipe-preview')
    if (snapshot.recipePreview && freshRecipePreview) {
      freshRecipePreview.replaceWith(snapshot.recipePreview)
    } else if (!snapshot.recipePreview && freshRecipePreview) {
      freshRecipePreview.remove()
    } else if (snapshot.recipePreview) {
      slot.appendChild(snapshot.recipePreview)
    }
  }

  /** DOM 교체 후 손패 hover 미리보기를 복원한다.
   *  is-preview-open(CSS animation:none)만 추가 — :hover의 flip 재실행을 CSS 레벨에서 막는다. */
  private restoreHandHoverState(): void {
    if (this.hoveredHandSlotIndex === null) return
    const slot = this.boardElement.querySelector<HTMLElement>(
      `.hand-slot[data-slot-index="${this.hoveredHandSlotIndex}"]`
    )
    if (slot?.classList.contains('hand-card')) {
      this.markStableHandPreview(slot)
    } else {
      this.hoveredHandSlotIndex = null
    }
  }

  /** Hover previews are read-only surfaces; this helper pins the current card
   *  to the open pose until the pointer leaves or moves to another hand slot. */
  private markStableHandPreview(slot: HTMLElement): void {
    slot.classList.add('is-preview-open')
    slot.querySelector<HTMLElement>(':scope > .hand-card-preview')
      ?.classList.add('is-preview-stable')
    slot.querySelector<HTMLElement>(':scope > .hand-recipe-preview')
      ?.classList.add('is-preview-stable')
  }

  /** Remove all JS-applied preview-freeze classes from a slot. */
  private clearStableHandPreviewClasses(slot: HTMLElement | null | undefined): void {
    if (!slot) return
    slot.classList.remove('is-preview-open')
    slot.querySelector<HTMLElement>(':scope > .hand-card-preview')
      ?.classList.remove('is-preview-stable')
    slot.querySelector<HTMLElement>(':scope > .hand-recipe-preview')
      ?.classList.remove('is-preview-stable')
  }

  /**
   * 에나가 말하는 필드·손패·유물을 같은 황금빛 맥동으로 짧게 가리킨다.
   * 대상 내부에 독립 레이어를 넣어 카드 고유 transform/hover/피격 애니메이션과 충돌하지 않는다.
   */
  pulseEnaHint(targets: EnaHintTargets, deferIfMissing = true, startedAt = Date.now()): void {
    // Iterable을 배열로 고정해, 같은 프레임 뒤 재시도해도 generator가 이미 소비된 문제가 없게 한다.
    const stableTargets = {
      fieldCardIds: [...(targets.fieldCardIds ?? [])],
      handDefIds: [...(targets.handDefIds ?? [])],
      handSlotIndices: [...(targets.handSlotIndices ?? [])],
      relicIds: [...(targets.relicIds ?? [])],
    }
    const elements = new Set<HTMLElement>()
    for (const cardId of stableTargets.fieldCardIds) {
      this.boardElement.querySelectorAll<HTMLElement>(`.cell.card[data-card-id="${cardId}"]`).forEach((el) => elements.add(el))
    }
    for (const defId of stableTargets.handDefIds) {
      this.boardElement.querySelectorAll<HTMLElement>(`.hand-slot[data-hand-def="${defId}"]`).forEach((el) => elements.add(el))
    }
    for (const slotIndex of stableTargets.handSlotIndices) {
      const el = this.boardElement.querySelector<HTMLElement>(`.hand-slot[data-slot-index="${slotIndex}"]`)
      if (el) elements.add(el)
    }
    for (const relicId of stableTargets.relicIds) {
      const el = this.boardElement.querySelector<HTMLElement>(`.relic-mini-card[data-owned-relic="${relicId}"]`)
      if (el) elements.add(el)
    }

    // 획득 직후처럼 모델이 먼저 바뀌고 DOM render가 같은 task 뒤에 오는 경로는 다음 frame에 한 번 재탐색한다.
    if (elements.size === 0 && deferIfMissing) {
      requestAnimationFrame(() => this.pulseEnaHint(stableTargets, false, startedAt))
      return
    }

    // 맥동은 세 번 되풀이되므로 다 끝나기 전에 다음 설명이 올 수 있다. 새 설명이 오면
    // 이전 대상의 강조는 **그 자리에서 끊는다** — 겹쳐 두면 무엇을 가리키는지 흐려진다.
    this.clearEnaHintPulses()
    if (elements.size === 0) return
    // 렌더를 넘어 이어 심을 수 있게 무엇을 가리키는 중인지와 시작·종료 시각을 남긴다.
    // 종료는 대상 수에 따라 달라진다 — 어긋내 켠 만큼 마지막 대상이 늦게 끝난다.
    this.activeEnaHint = {
      targets: stableTargets,
      startedAt,
      endsAt:
        startedAt +
        ENA_HINT_START_DELAY_MS +
        (elements.size - 1) * ENA_HINT_STAGGER_MS +
        ENA_HINT_CYCLE_MS * ENA_HINT_REPEAT,
    }

    // 이미 흐른 시간만큼 시작 지연을 당겨(음수 delay) 렌더 뒤에도 같은 위상에서 이어진다.
    const elapsed = Date.now() - startedAt
    let order = 0
    for (const element of elements) {
      // 대상이 여럿이면 어긋내 켠다 — 순서는 필드 → 손패 → 유물(삽입 순서)이라 렌더를 다시
      // 심어도 같은 대상이 같은 차례를 받는다.
      const delay = ENA_HINT_START_DELAY_MS + order * ENA_HINT_STAGGER_MS - elapsed
      order++
      const pulse = document.createElement('span')
      pulse.className = 'ena-hint-pulse'
      pulse.setAttribute('aria-hidden', 'true')
      pulse.style.setProperty('--ena-hint-delay', `${delay}ms`)
      element.appendChild(pulse)
      this.activeEnaHintPulses.add(pulse)
      pulse.addEventListener('animationend', () => {
        this.activeEnaHintPulses.delete(pulse)
        pulse.remove()
        if (this.activeEnaHintPulses.size === 0) this.activeEnaHint = null
      }, { once: true })
    }
  }

  /** 렌더가 지워 간 강조를 남은 시간만큼 다시 심는다(대상이 사라졌으면 그대로 끝난다). */
  private reattachEnaHintPulses(): void {
    const active = this.activeEnaHint
    if (!active) return
    if (Date.now() >= active.endsAt) {
      this.activeEnaHint = null
      return
    }
    if (this.boardElement.querySelector('.ena-hint-pulse')) return // 살아남았으면 그대로 둔다.
    this.activeEnaHintPulses.clear()
    this.pulseEnaHint(active.targets, false, active.startedAt)
  }

  /** 진행 중인 에나 강조를 즉시 거둔다(플레이어가 먼저 움직이거나 다음 설명이 올 때). */
  clearEnaHintPulses(): void {
    this.activeEnaHint = null
    this.activeEnaHintPulses.clear()
    this.boardElement.querySelectorAll('.ena-hint-pulse').forEach((el) => el.remove())
  }

  /** 다음 줄 카드 주변 40px 안에 포인터가 들어온 첫 순간만 소개 이벤트를 보낸다. */
  private dispatchNearbyCardIntroduction(e: MouseEvent): void {
    const proximityMargin = 40
    const candidates = this.boardElement
      .querySelectorAll<HTMLElement>('.cell.card[data-distance="1"][data-card-id]')
    let nearby: HTMLElement | null = null
    let nearestDistance = Number.POSITIVE_INFINITY
    for (const candidate of candidates) {
      const distance = pointerDistanceToRect(e.clientX, e.clientY, candidate.getBoundingClientRect())
      // 카드 주변 여백이 겹치면 DOM 순서가 아니라 실제 포인터에 더 가까운 카드를 가리킨다.
      if (distance <= proximityMargin && distance < nearestDistance) {
        nearby = candidate
        nearestDistance = distance
      }
    }

    const cardId = nearby?.dataset.cardId ?? null
    if (cardId === this.nearbyIntroCardId) return
    this.nearbyIntroCardId = cardId
    if (!nearby) return

    const laneIndex = Number(nearby.dataset.lane)
    const distance = Number(nearby.dataset.distance)
    const card = this.currentGameState?.getLane(laneIndex)?.getCardAtDistance(distance)
    if (!card || card.id !== cardId) return
    document.dispatchEvent(new CustomEvent<CardProximityDetail>('cardProximity', {
      detail: { laneIndex, distance, card },
    }))
  }

  private handleCardClick(
    _el: HTMLElement,
    laneIndex: number,
    distance: number,
    bossGimmickCellIndex?: number
  ): void {
    this.dispatchAction(laneIndex, distance, bossGimmickCellIndex)
  }

  private dispatchAction(laneIndex: number, distance: number, bossGimmickCellIndex?: number): void {
    const lane = this.currentGameState?.getLane(laneIndex)
    const card = lane?.getCardAtDistance(distance)
    if (!card) return

    const event = new CustomEvent<CardActionDetail>('cardAction', {
      detail: { laneIndex, distance, card, bossGimmickCellIndex },
    })
    document.dispatchEvent(event)
  }

  /**
   * Play only the attack motion used when the player actively swings at an
   * enemy card. Impact feedback is intentionally NOT fired here: the real
   * damage result is rendered by `animateDamageNumbersById` after the model
   * resolves, which prevents one click from producing duplicate hit bursts.
   */
  animatePlayerAttack(card: Card): Promise<void> {
    return this.animateCardElements(card, 'is-player-striking', 360)
  }

  /**
   * Play the downward slam used during the enemy phase. Enemy hits are grouped
   * by Card instance in TurnManager, so each visual card should only slam once.
   *
   * Important: the SquareBurst for an enemy-phase hit belongs on the *victim*
   * (the player), not on the attacker. The slam class alone communicates the
   * attacker's motion; `animateDamageFlash` follows up with the burst anchored
   * to the player card.
   */
  animateEnemyAttacks(hits: EnemyHit[]): Promise<void> {
    const elements = new Set<HTMLElement>()
    for (const hit of hits) {
      // Grouped enemies render once at the group's leftmost lane, so cardId is
      // authoritative; lane fallback keeps older hit payloads harmless.
      const element =
        this.findCardElement(hit.cardId) ??
        this.boardElement.querySelector<HTMLElement>(
          `.cell.card.is-active[data-lane="${hit.laneIndex}"]`
        )
      if (element) elements.add(element)
    }

    const attackers = [...elements]
    const player = this.boardElement.querySelector<HTMLElement>('.player-card, .player-row')
    if (!player || attackers.length === 0) return Promise.resolve()

    // Enemy cells live inside the rail grid, whose boundaries can visually clip
    // a full-width front-row group. Clone each attacker into a fixed overlay and
    // lunge the clone toward the player so 3-lane wax armies always read as a
    // real charge rather than a cut-off in-rail nudge.
    const playerRect = player.getBoundingClientRect()
    const playerCenterX = playerRect.left + playerRect.width / 2
    const playerTop = playerRect.top + playerRect.height * 0.08

    // 방패가 먹은 양 — 돌진이 플레이어에 닿는 박자에 맞춰 "막았다"를 띄운다.
    // 이 한 줄이 없으면 방패가 전부 막은 턴은 화면에서 아무 일도 없던 것으로 지나간다.
    const blockedTotal = hits.reduce((sum, hit) => sum + (hit.dodged ? 0 : (hit.blocked ?? 0)), 0)
    if (blockedTotal > 0) {
      window.setTimeout(() => void this.playShieldBlockFeedback(player, blockedTotal), ENEMY_SLAM_IMPACT_MS)
    }

    return Promise.all(
      attackers.map((element) => {
        const rect = element.getBoundingClientRect()
        const clone = element.cloneNode(true) as HTMLElement
        const dx = (playerCenterX - (rect.left + rect.width / 2)) * 0.22
        const dy = Math.min(210, Math.max(58, playerTop - rect.bottom + 18))
        element.classList.add('is-enemy-slamming-source')
        clone.classList.add('enemy-attack-clone')
        clone.style.position = 'fixed'
        clone.style.left = `${rect.left}px`
        clone.style.top = `${rect.top}px`
        clone.style.width = `${rect.width}px`
        clone.style.height = `${rect.height}px`
        clone.style.margin = '0'
        clone.style.zIndex = '245'
        clone.style.pointerEvents = 'none'
        clone.style.transformOrigin = '50% 100%'
        document.body.appendChild(clone)

        const animation = clone.animate(
          [
            { transform: 'translate(0, 0) scale(1)', filter: 'brightness(1)' },
            {
              transform: `translate(${dx * 0.35}px, ${dy * 0.22}px) scale(1.03, 0.98)`,
              filter: 'brightness(1.18)',
              offset: 0.28,
            },
            {
              transform: `translate(${dx}px, ${dy}px) scale(1.08, 0.92)`,
              filter: 'brightness(1.35) drop-shadow(0 22px 26px rgba(168, 58, 58, 0.74))',
              offset: 0.58,
            },
            {
              transform: `translate(${dx * 0.2}px, ${dy * 0.08}px) scale(0.99, 1.02)`,
              filter: 'brightness(1.05)',
              offset: 0.78,
            },
            { transform: 'translate(0, 0) scale(1)', filter: 'brightness(1)' },
          ],
          { duration: 560, easing: 'cubic-bezier(0.2, 0.9, 0.24, 1)', fill: 'forwards' }
        )

        return new Promise<void>((resolve) => {
          animation.onfinish = () => {
            clone.remove()
            element.classList.remove('is-enemy-slamming-source')
            resolve()
          }
          window.setTimeout(() => {
            clone.remove()
            element.classList.remove('is-enemy-slamming-source')
            resolve()
          }, 760)
        })
      })
    ).then(() => undefined)
  }

  /**
   * Player-hit feedback. Replaces the previous oxblood vignette with a
   * SquareBurst centered on the player card so the burst reads as a focused
   * impact rather than a screen-wide tint (which clashed with the ember
   * brightness pass). If the player card is offscreen for any reason we fall
   * back to a viewport-center burst.
   */
  /** 보스전 플레이어 피격 피드백: 일반 적 피격과 같은 붉은 피해 수치 + 버스트를 player-card에 띄운다.
   *  기존 animateDamageFlash(버스트만)를 대체해 보스전에서도 수치 애니메이션이 보이게 통일한다. */
  animatePlayerDamageImpact(amount: number): Promise<void> {
    const playerCard = this.boardElement.querySelector<HTMLElement>('.player-card, .player-row')
    if (!playerCard || amount <= 0) return this.animateDamageFlash()
    sfx.playPlayerHit()
    this.playPlayerHealthDamageFeedback()
    return this.animateDamageImpactOnElement(playerCard, amount)
  }

  /**
   * 피격 한 박자 — 체력 게이지가 확대되며 흔들리고 시뻘게졌다가 돌아온다.
   * 수치도 같은 beat에서 굴러 내려가 "얼마나 깎였는지"가 게이지 위에서 읽힌다.
   *
   * 방패가 전부 막아 체력이 그대로면 아무것도 하지 않는다 — 안 깎였는데 게이지가
   * 비명을 지르면 방패가 막아 준 사실이 지워진다.
   *
   * 클래스는 `hpDamagePulseUntil` 동안 renderPlayer가 다시 심어 주고, 진행 위치는
   * `restoreBoardAnimationPhases`가 이어 붙인다 — 곧바로 render가 돌아도 끊기지 않는다.
   */
  playPlayerHealthDamageFeedback(): void {
    const character = this.currentGameState?.getCharacter()
    if (!character) return
    const previous = this.displayedHudCounters.get('health')
    if (previous === undefined || character.health >= previous) return
    this.playHudCounterFeedback('health', character.health)
    this.hpDamagePulseUntil = performance.now() + HP_DAMAGE_PULSE_MS
    const column = this.boardElement.querySelector<HTMLElement>('.hp-column')
    if (!column) return
    column.classList.remove('is-hp-damaged')
    // 리플로우 1회 — 연타로 맞아도 매번 처음부터 재생된다.
    void column.offsetWidth
    column.classList.add('is-hp-damaged')
  }

  animateDamageFlash(): Promise<void> {
    const playerCard = this.boardElement.querySelector<HTMLElement>('.player-card, .player-row')
    if (playerCard) {
      SquareBurst.playOn(playerCard, 'damage', { count: 20, spread: 150, duration: 640 })
    } else {
      SquareBurst.playAt(window.innerWidth / 2, window.innerHeight * 0.6, 'damage', {
        count: 20,
        spread: 150,
        duration: 640,
      })
    }
    return new Promise((resolve) => window.setTimeout(resolve, 520))
  }

  /** Float a glowing damage number above a specific element. */
  animateDamageNumberOnElement(target: HTMLElement | DOMRect | null, amount: number): Promise<void> {
    if (!target || amount <= 0) return Promise.resolve()
    // DOMRect도 받는다 — 파괴된 보스 칸처럼 연출 도중 노드가 교체되는 자리는 좌표만 남는다.
    const rect = target instanceof HTMLElement ? target.getBoundingClientRect() : target
    return this.animateDamageNumberAt(
      rect.left + rect.width / 2,
      rect.top + rect.height * 0.34,
      amount
    )
  }

  /** Player damage feedback in one beat: number and burst start together. */
  animateDamageImpactOnElement(target: HTMLElement | null, amount: number): Promise<void> {
    if (!target || amount <= 0) return Promise.resolve()
    SquareBurst.playOn(target, 'damage', { count: 20, spread: 150, duration: 660 })
    return this.animateDamageNumberOnElement(target, amount)
  }

  /** Float damage numbers for card-id keyed model diffs. */
  animateDamageNumbersById(damages: { cardId: string; amount: number }[]): Promise<void> {
    // 실제 피해가 1건 이상일 때만 타격음을 한 번 재생한다(중복 방지).
    if (damages.some(({ amount }) => amount > 0)) sfx.playAttack()
    return Promise.all(
      damages.map(({ cardId, amount }) => {
        // 격자를 낀 보스면 타일 중앙이 아니라 '맞은 칸'마다 블라스트+수치를 낸다.
        // 광역 손패가 9칸을 동시에 때려도 합계 하나가 아니라 칸마다 따로 뜬다.
        const cellStrikes = this.bossCellStrikeSource?.(cardId, amount) ?? []
        if (cellStrikes.length > 0) {
          // 연출이 끝난 뒤에 후처리를 알린다 — 배율 리롤이 수치보다 먼저 돌면
          // 방금 어느 배율로 맞았는지가 화면에서 사라진다.
          // 모델은 이미 깎인 뒤라 이 beat 시작 전 HP는 '지금 HP + 관측된 손실'이다.
          // 그 값에서 시작해 배율 피해·부위 파괴 보너스가 뜰 때마다 나눠 굴린다.
          return this.playBossGimmickStrikes(cellStrikes, this.handUseCenterRect(), {
            hpBefore: this.bossHpCurrent + Math.max(0, amount),
          })
            .then(() => this.bossCellStrikeSettled?.())
            .then(() => undefined)
        }
        const target = this.findCardElement(cardId)
        if (target && amount > 0) {
          SquareBurst.playOn(target, 'damage', { count: 14, spread: 110, duration: 620 })
          // 피격 반동 애니메이션: 밝아지며 좌우 흔들림으로 타격감을 전달한다.
          target.classList.remove('is-enemy-hit')
          void target.offsetWidth
          target.classList.add('is-enemy-hit')
          window.setTimeout(() => target.classList.remove('is-enemy-hit'), 420)
        }
        return this.animateDamageNumberOnElement(target, amount)
      })
    ).then(() => undefined)
  }

  /** Create the red ember-glow numeric hit text at viewport coordinates. */
  private animateDamageNumberAt(x: number, y: number, amount: number): Promise<void> {
    return this.animateFloatTextAt(x, y, `-${amount}`)
  }

  /**
   * 방패가 막아 낸 피격 — 체력이 안 깎여도 **맞았다는 사실**은 남아야 한다.
   *
   * 방패 수치만 조용히 줄면 화면에서는 아무 일도 안 일어난 것으로 읽힌다. 그래서
   * 같은 자리에 같은 양식으로 **회색빛 `-N`** 을 띄우고(붉은 피해와 색만 다르다),
   * 대상은 관통당한 게 아니라 **버텨 낸 흔들림**으로 반응한다 — 짧고 단단한 좌우 진동에
   * 은빛 잔광이다. 피격 반동(`is-enemy-hit`)처럼 밝아지며 튀지 않는다.
   *
   * 체력이 실제로 깎인 경우에도 방패가 일부를 먹었으면 함께 호출한다 — 두 수치가
   * 나란히 떠야 "몇 대 맞고 몇을 막았는지"가 읽힌다.
   */
  playShieldBlockFeedback(target: HTMLElement | null, blocked: number): Promise<void> {
    if (!target || blocked <= 0) return Promise.resolve()
    target.classList.remove('is-shield-blocked')
    // 리플로우 1회 — 연타로 막아도 매번 처음부터 재생된다.
    void target.offsetWidth
    target.classList.add('is-shield-blocked')
    window.setTimeout(() => target.classList.remove('is-shield-blocked'), SHIELD_BLOCK_SHAKE_MS)
    SquareBurst.playOn(target, 'shield-gain', { count: 9, spread: 78, duration: 380, size: [5, 12] })
    const rect = target.getBoundingClientRect()
    // 실 피해 수치와 겹치지 않게 살짝 위에서 뜬다(둘 다 나올 수 있다).
    return this.animateFloatTextAt(
      rect.left + rect.width / 2,
      rect.top + rect.height * 0.22,
      `-${blocked}`,
      { className: 'damage-float--blocked' }
    )
  }

  /**
   * 피해 수치 부유 텍스트의 공용 구현. 수치가 아닌 문구(리미트 페이지 경고 등)도
   * **같은 양식**으로 같은 자리에 떠야 "여기 원래 수치가 뜨는 자리"임이 읽히므로,
   * 색·크기만 클래스로 갈고 움직임은 하나로 둔다.
   */
  animateFloatTextAt(
    x: number,
    y: number,
    text: string,
    opts: { className?: string; durationMs?: number } = {}
  ): Promise<void> {
    const duration = opts.durationMs ?? 980
    const el = document.createElement('div')
    el.className = `damage-float ${opts.className ?? ''}`.trim()
    el.textContent = text
    el.style.left = `${x}px`
    el.style.top = `${y}px`
    document.body.appendChild(el)
    const anim = el.animate(
      [
        { transform: 'translate(-50%, -20%) scale(0.78)', opacity: 0, filter: 'brightness(1.2)' },
        {
          transform: 'translate(-50%, -68%) scale(1.2)',
          opacity: 1,
          filter: 'brightness(1.65)',
          offset: 0.22,
        },
        {
          transform: 'translate(-50%, -110%) scale(1.08)',
          opacity: 1,
          filter: 'brightness(1.32)',
          offset: 0.65,
        },
        { transform: 'translate(-50%, -160%) scale(1)', opacity: 0, filter: 'brightness(1)' },
      ],
      { duration, easing: 'cubic-bezier(0.16, 0.86, 0.28, 1)', fill: 'forwards' }
    )
    return new Promise((resolve) => {
      anim.onfinish = () => {
        el.remove()
        resolve()
      }
      window.setTimeout(() => {
        el.remove()
        resolve()
      }, duration + 140)
    })
  }

  /** 레바테인 턴 흐름 표시: 플레이어 카드 위에 황금빛 숫자(1,2…)를 흔들리며 띄운다.
   *  같은 요소를 갱신해 시뮬레이션 페이즈마다 숫자만 교체한다(흔들림 지속). */
  showLevateinChargeMark(n: number): void {
    const player = this.boardElement.querySelector<HTMLElement>('.player-card, .player-row')
    if (!player) return
    const rect = player.getBoundingClientRect()
    let mark = document.getElementById('levatein-charge-mark')
    if (!mark) {
      mark = document.createElement('div')
      mark.id = 'levatein-charge-mark'
      mark.className = 'levatein-charge-mark'
      mark.innerHTML = '<span class="levatein-charge-inner"></span>'
      document.body.appendChild(mark)
    }
    mark.style.left = `${rect.left + rect.width / 2}px`
    mark.style.top = `${rect.top - rect.height * 0.06}px`
    const inner = mark.querySelector<HTMLElement>('.levatein-charge-inner')
    if (inner) {
      inner.textContent = String(n)
      // 숫자가 바뀔 때마다 등장 펄스를 재시작해 "차오르는" 느낌을 준다.
      inner.classList.remove('is-pulsing')
      void inner.offsetWidth
      inner.classList.add('is-pulsing')
    }
  }

  /** 레바테인 턴 흐름 숫자를 위로 흩어지며 사라지게 한다(강타 직전 정리). */
  clearLevateinChargeMark(): void {
    const mark = document.getElementById('levatein-charge-mark')
    if (!mark) return
    const inner = mark.querySelector<HTMLElement>('.levatein-charge-inner')
    inner?.classList.add('is-leaving')
    window.setTimeout(() => mark.remove(), 320)
  }

  /** 레바테인 강타: 플레이어 카드에서 대상 적으로 황금 화염 볼트를 쏘고, 착탄 시
   *  큰 버스트 + 큰 피해 수치를 출력하며 대상 HP 숫자를 1씩 빠르게 깎아낸다.
   *  보스는 HP 숫자(.stat.hp)가 없어 HP바가 따로 갱신되므로 틱은 자동 생략된다. */
  async animateLevateinStrike(cardId: string, damage: number, fromHp: number, toHp: number, bossFromHp?: number, bossToHp?: number): Promise<void> {
    const enemy = this.findCardElement(cardId)
    if (!enemy) return
    const enemyRect = enemy.getBoundingClientRect()
    const ex = enemyRect.left + enemyRect.width / 2
    const ey = enemyRect.top + enemyRect.height / 2

    // 1) 플레이어 → 적으로 화염 볼트가 날아가는 연출.
    const player = this.boardElement.querySelector<HTMLElement>('.player-card, .player-row')
    if (player) {
      const pRect = player.getBoundingClientRect()
      const px = pRect.left + pRect.width / 2
      const py = pRect.top + pRect.height * 0.28
      const dx = ex - px
      const dy = ey - py
      const angle = (Math.atan2(dy, dx) * 180) / Math.PI
      const bolt = document.createElement('div')
      bolt.className = 'levatein-bolt'
      bolt.style.left = `${px}px`
      bolt.style.top = `${py}px`
      document.body.appendChild(bolt)
      const fly = bolt.animate(
        [
          { transform: `translate(-50%, -50%) rotate(${angle}deg) scaleX(0.35)`, opacity: 0 },
          {
            transform: `translate(calc(-50% + ${dx * 0.5}px), calc(-50% + ${dy * 0.5}px)) rotate(${angle}deg) scaleX(1.25)`,
            opacity: 1,
            offset: 0.55,
          },
          {
            transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) rotate(${angle}deg) scaleX(0.55)`,
            opacity: 0.85,
          },
        ],
        { duration: 240, easing: 'cubic-bezier(0.3, 0.7, 0.2, 1)', fill: 'forwards' }
      )
      await new Promise<void>((resolve) => {
        fly.onfinish = () => {
          bolt.remove()
          resolve()
        }
        window.setTimeout(() => {
          bolt.remove()
          resolve()
        }, 340)
      })
    }

    // 2) 착탄: 강렬한 이중 버스트 + 피격 반동.
    SquareBurst.playAt(ex, ey, 'bomb-blast', { count: 30, spread: 210, duration: 720, size: [12, 30] })
    SquareBurst.playAt(ex, ey, 'hand-attack', { count: 22, spread: 150, duration: 640 })
    enemy.classList.remove('is-enemy-hit')
    void enemy.offsetWidth
    enemy.classList.add('is-enemy-hit', 'is-levatein-struck')
    window.setTimeout(() => enemy.classList.remove('is-enemy-hit', 'is-levatein-struck'), 540)

    // 3) 큰 피해 수치 + 대상 HP 1씩 롤링 다운(같은 beat). 보스 HP HUD도 동시 롤링.
    if (bossFromHp !== undefined && bossToHp !== undefined && bossFromHp !== bossToHp) {
      this.playHudCounterFeedback('boss-hp', Math.max(0, bossToHp))
    }
    await Promise.all([
      this.animateBigDamageNumberAt(ex, enemyRect.top + enemyRect.height * 0.28, damage),
      this.tickCardHealthDown(enemy, fromHp, toHp),
    ])
  }

  /** 급소(클러치) 전용: 대상 카드 위에 레바테인 스타일 대형 황금 피해 수치를 띄운다. */
  animateCritDamageOnCard(cardId: string, amount: number): Promise<void> {
    const el = this.findCardElement(cardId)
    if (!el || amount <= 0) return Promise.resolve()
    const rect = el.getBoundingClientRect()
    return this.animateBigDamageNumberAt(rect.left + rect.width / 2, rect.top + rect.height / 2, amount)
  }

  /** 레바테인 전용 대형 피해 수치(기본 damage-float보다 크고 황금빛). */
  private animateBigDamageNumberAt(x: number, y: number, amount: number): Promise<void> {
    if (amount <= 0) return Promise.resolve()
    const el = document.createElement('div')
    el.className = 'damage-float damage-float--levatein'
    el.textContent = `-${amount}`
    el.style.left = `${x}px`
    el.style.top = `${y}px`
    document.body.appendChild(el)
    const anim = el.animate(
      [
        { transform: 'translate(-50%, -18%) scale(0.6)', opacity: 0, filter: 'brightness(1.3)' },
        { transform: 'translate(-50%, -70%) scale(1.32)', opacity: 1, filter: 'brightness(1.7)', offset: 0.24 },
        { transform: 'translate(-50%, -116%) scale(1.12)', opacity: 1, filter: 'brightness(1.34)', offset: 0.68 },
        { transform: 'translate(-50%, -168%) scale(1)', opacity: 0, filter: 'brightness(1)' },
      ],
      { duration: 1120, easing: 'cubic-bezier(0.16, 0.86, 0.28, 1)', fill: 'forwards' }
    )
    return new Promise((resolve) => {
      anim.onfinish = () => {
        el.remove()
        resolve()
      }
      window.setTimeout(() => {
        el.remove()
        resolve()
      }, 1240)
    })
  }

  /** 대상 카드의 HP 숫자를 fromHp→toHp까지 1씩 빠르게(띠리릭) 깎아내린다. */
  private tickCardHealthDown(enemyEl: HTMLElement, fromHp: number, toHp: number): Promise<void> {
    const valueEl = enemyEl.querySelector<HTMLElement>('.stat.hp .stat-value')
    if (!valueEl || fromHp <= toHp) return Promise.resolve()
    const total = fromHp - toHp
    // 1씩 깎되 전체가 너무 길어지지 않게 스텝 간격을 동적으로 잡는다(대략 ~620ms 내).
    const stepMs = Math.max(16, Math.min(64, Math.floor(620 / total)))
    return new Promise<void>((resolve) => {
      let cur = fromHp
      valueEl.classList.add('is-hp-draining')
      const tick = () => {
        cur -= 1
        const shown = Math.max(toHp, cur)
        valueEl.textContent = String(shown)
        valueEl.classList.remove('is-hp-tick')
        void valueEl.offsetWidth
        valueEl.classList.add('is-hp-tick')
        if (cur > toHp) {
          window.setTimeout(tick, stepMs)
        } else {
          window.setTimeout(() => valueEl.classList.remove('is-hp-draining', 'is-hp-tick'), 120)
          resolve()
        }
      }
      window.setTimeout(tick, stepMs)
    })
  }

  /** Wax release effect: show a readable 0-turn beat first, then crack the hardened wax open. */
  animateWaxThawByIds(cardIds: string[]): Promise<void> {
    if (cardIds.length === 0) return Promise.resolve()
    const targets: HTMLElement[] = []
    for (const cardId of cardIds) {
      const target = this.findCardElement(cardId)
      if (!target) continue
      targets.push(target)
      target.classList.add('is-wax-zero-pending')
      // 해동 직전에는 포자 0턴처럼 남은 턴을 먼저 0으로 고쳐 보여 준다.
      let badge = target.querySelector<HTMLElement>('.frozen-center-badge')
      if (!badge) {
        badge = document.createElement('div')
        badge.className = 'frozen-center-badge'
        target.appendChild(badge)
      }
      badge.setAttribute('aria-label', '굳음 0턴')
      badge.innerHTML = '<span class="frozen-center-title">굳음</span><span class="frozen-center-turns">0턴</span>'
    }
    if (targets.length === 0) return Promise.resolve()

    return new Promise((resolve) => {
      window.setTimeout(() => {
        for (const target of targets) {
          SquareBurst.playOn(target, 'wax-freeze', { count: 14, spread: 180, duration: 760 })
          target.classList.remove('is-wax-zero-pending')
          target.classList.add('is-wax-thawing')
          window.setTimeout(() => target.classList.remove('is-wax-thawing'), 620)
        }
        window.setTimeout(resolve, 620)
      }, 360)
    })
  }

  /** Generic effect dispatch — used by index.ts to fire bursts on events. */
  burstAtElement(
    target: HTMLElement | null,
    theme: BurstTheme,
    opts?: Parameters<typeof SquareBurst.playOn>[2]
  ): void {
    if (!target) return
    SquareBurst.playOn(target, theme, opts)
  }

  burstAtPoint(
    x: number,
    y: number,
    theme: BurstTheme,
    opts?: Parameters<typeof SquareBurst.playAt>[3]
  ): void {
    SquareBurst.playAt(x, y, theme, opts)
  }

  /** One-shot Hope revive presentation: spotlight the owned relic before it is
   *  consumed, shake it like a desperate charm, then burst into the existing
   *  square sparkle language used by score/treasure/health feedback. */
  animateHopeRelicRevive(relicId: RelicId = 'hope'): Promise<void> {
    const source = this.boardElement.querySelector<HTMLElement>(
      `.relic-mini-card[data-owned-relic="${relicId}"]`
    )
    const sourceRect = source?.getBoundingClientRect()
    if (!source || !sourceRect) {
      SquareBurst.playAt(window.innerWidth / 2, window.innerHeight * 0.48, 'health-gain', {
        count: 34,
        spread: 180,
        duration: 900,
      })
      return new Promise((resolve) => window.setTimeout(resolve, 780))
    }

    const overlay = document.createElement('div')
    overlay.className = 'hope-revive-overlay'
    overlay.setAttribute('aria-hidden', 'true')
    overlay.style.position = 'fixed'
    overlay.style.inset = '0'
    overlay.style.zIndex = '285'
    overlay.style.pointerEvents = 'none'
    overlay.style.background =
      'radial-gradient(circle at 50% 46%, rgba(255,245,220,0.14), rgba(8,5,14,0.72) 64%, rgba(8,5,14,0.86))'
    overlay.style.opacity = '0'
    document.body.appendChild(overlay)

    source.classList.add('is-revive-locked')
    const clone = source.cloneNode(true) as HTMLElement
    // The revive clone must ignore normal inventory hover/pin enlargement;
    // the WebAnimation below owns its exact center-screen placement.
    clone.classList.add('hope-revive-card', 'is-revive-locked')
    clone.style.position = 'fixed'
    clone.style.left = `${sourceRect.left}px`
    clone.style.top = `${sourceRect.top}px`
    clone.style.width = `${sourceRect.width}px`
    clone.style.height = `${sourceRect.height}px`
    clone.style.margin = '0'
    clone.style.zIndex = '286'
    clone.style.pointerEvents = 'none'
    clone.style.transformOrigin = '50% 50%'
    document.body.appendChild(clone)

    const targetWidth = Math.min(230, Math.max(188, window.innerWidth * 0.18))
    const targetHeight = targetWidth / 0.72
    const targetLeft = window.innerWidth / 2 - targetWidth / 2
    const targetTop = window.innerHeight * 0.46 - targetHeight / 2
    const dx = targetLeft - sourceRect.left
    const dy = targetTop - sourceRect.top
    const sx = targetWidth / Math.max(1, sourceRect.width)
    const sy = targetHeight / Math.max(1, sourceRect.height)
    const centerX = window.innerWidth / 2
    const centerY = window.innerHeight * 0.46

    // Do not animate the whole board here: browser zoom/transform stacks can
    // make fixed-position relic clones drift on some web runtimes. The overlay
    // and relic clone now carry the revival emphasis by themselves.
    overlay.animate([{ opacity: 0 }, { opacity: 1 }, { opacity: 0 }], {
      duration: 2300,
      easing: 'ease-in-out',
      fill: 'forwards',
    })

    return new Promise((resolve) => {
      const sparkleTimers: number[] = []
      const sparkleThemes: BurstTheme[] = ['score', 'treasure-gain', 'health-gain', 'gauge-gain']
      for (let i = 0; i < 7; i += 1) {
        sparkleTimers.push(
          window.setTimeout(
            () => {
              SquareBurst.playAt(centerX, centerY, sparkleThemes[i % sparkleThemes.length], {
                count: 12 + (i % 3) * 3,
                spread: 76 + i * 10,
                duration: 620,
                size: [6, 15],
              })
            },
            520 + i * 150
          )
        )
      }

      const zoom = clone.animate(
        [
          { transform: 'translate(0, 0) scale(1)', filter: 'brightness(1)', opacity: 1 },
          {
            transform: `translate(${dx * 0.7}px, ${dy - 18}px) scale(${(sx + sy) / 2 + 0.12})`,
            filter: 'brightness(1.35) drop-shadow(0 24px 40px rgba(255, 232, 168, 0.36))',
            opacity: 1,
            offset: 0.42,
          },
          {
            transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`,
            filter: 'brightness(1.18) drop-shadow(0 28px 50px rgba(255, 232, 168, 0.42))',
            opacity: 1,
          },
        ],
        { duration: 620, easing: 'cubic-bezier(0.18, 0.86, 0.22, 1)', fill: 'forwards' }
      )

      zoom.onfinish = () => {
        const shake = clone.animate(
          [
            {
              transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy}) rotate(0deg)`,
              filter: 'brightness(1.2)',
            },
            {
              transform: `translate(${dx - 16}px, ${dy + 2}px) scale(${sx * 1.02}, ${sy * 0.98}) rotate(-3deg)`,
              filter: 'brightness(1.38)',
            },
            {
              transform: `translate(${dx + 18}px, ${dy - 1}px) scale(${sx * 0.99}, ${sy * 1.02}) rotate(3.5deg)`,
              filter: 'brightness(1.55)',
            },
            {
              transform: `translate(${dx - 12}px, ${dy + 1}px) scale(${sx * 1.03}, ${sy * 0.97}) rotate(-4deg)`,
              filter: 'brightness(1.76)',
            },
            {
              transform: `translate(${dx + 10}px, ${dy}px) scale(${sx}, ${sy}) rotate(2deg)`,
              filter: 'brightness(2.2) saturate(0.45)',
            },
            {
              transform: `translate(${dx}px, ${dy}px) scale(${sx * 1.1}, ${sy * 1.1}) rotate(0deg)`,
              filter: 'brightness(4) saturate(0) contrast(1.35)',
            },
          ],
          { duration: 900, easing: 'cubic-bezier(0.22, 0.96, 0.28, 1)', fill: 'forwards' }
        )

        shake.onfinish = () => {
          SquareBurst.playAt(centerX, centerY, 'score', {
            count: 34,
            spread: 170,
            duration: 920,
            size: [8, 22],
          })
          SquareBurst.playAt(centerX, centerY, 'health-gain', {
            count: 30,
            spread: 135,
            duration: 860,
            size: [7, 18],
          })
          const vanish = clone.animate(
            [
              {
                transform: `translate(${dx}px, ${dy}px) scale(${sx * 1.08}, ${sy * 1.08})`,
                opacity: 1,
                filter: 'brightness(4) saturate(0)',
              },
              {
                transform: `translate(${dx}px, ${dy}px) scale(${sx * 1.36}, ${sy * 1.36})`,
                opacity: 0,
                filter: 'brightness(6) saturate(0) blur(1px)',
              },
            ],
            { duration: 420, easing: 'cubic-bezier(0.16, 0.88, 0.26, 1)', fill: 'forwards' }
          )
          vanish.onfinish = () => {
            sparkleTimers.forEach((timer) => window.clearTimeout(timer))
            source.classList.remove('is-revive-locked')
            clone.remove()
            overlay.remove()
            resolve()
          }
        }
      }
    })
  }

  /** 권위 발동 연출: 유물을 화면 중앙으로 띄워 붉은 빛으로 떨다 터지고, 동시에 플레이어
   *  체력 게이지를 크게 확대해 붉은 잔광을 남긴다("피 1로 버텼다"는 강조). 희망과 같은 톤. */
  animateAuthoritySurvive(relicId: RelicId = 'authority'): Promise<void> {
    const centerX = window.innerWidth / 2
    const centerY = window.innerHeight * 0.46

    // 체력 게이지를 확 키웠다가 붉은 잔광으로 줄인다. (다음 render가 요소를 새로 그린다)
    const hpBar = this.boardElement.querySelector<HTMLElement>('.player-card .hp-bar')
    hpBar?.animate(
      [
        { transform: 'scale(1)', filter: 'none' },
        { transform: 'scale(1.5)', filter: 'drop-shadow(0 0 18px rgba(220, 60, 60, 0.85)) brightness(1.2)', offset: 0.4 },
        { transform: 'scale(1.18)', filter: 'drop-shadow(0 0 10px rgba(220, 60, 60, 0.5))' },
      ],
      { duration: 1400, easing: 'cubic-bezier(0.18, 0.86, 0.22, 1)', fill: 'forwards' }
    )

    const source = this.boardElement.querySelector<HTMLElement>(`.relic-mini-card[data-owned-relic="${relicId}"]`)
    const sourceRect = source?.getBoundingClientRect()
    if (!source || !sourceRect) {
      SquareBurst.playAt(centerX, centerY, 'damage', { count: 32, spread: 175, duration: 900 })
      return new Promise((resolve) => window.setTimeout(resolve, 900))
    }

    const overlay = document.createElement('div')
    overlay.setAttribute('aria-hidden', 'true')
    overlay.style.cssText =
      'position:fixed;inset:0;z-index:285;pointer-events:none;opacity:0;background:radial-gradient(circle at 50% 46%, rgba(120,18,18,0.20), rgba(8,5,14,0.74) 62%, rgba(8,5,14,0.88));'
    document.body.appendChild(overlay)

    source.classList.add('is-revive-locked')
    const clone = source.cloneNode(true) as HTMLElement
    clone.classList.add('hope-revive-card', 'is-revive-locked')
    clone.style.cssText = `position:fixed;left:${sourceRect.left}px;top:${sourceRect.top}px;width:${sourceRect.width}px;height:${sourceRect.height}px;margin:0;z-index:286;pointer-events:none;transform-origin:50% 50%;`
    document.body.appendChild(clone)

    const targetWidth = Math.min(230, Math.max(188, window.innerWidth * 0.18))
    const targetHeight = targetWidth / 0.72
    const dx = window.innerWidth / 2 - targetWidth / 2 - sourceRect.left
    const dy = centerY - targetHeight / 2 - sourceRect.top
    const sx = targetWidth / Math.max(1, sourceRect.width)
    const sy = targetHeight / Math.max(1, sourceRect.height)

    overlay.animate([{ opacity: 0 }, { opacity: 1 }, { opacity: 0 }], {
      duration: 1700,
      easing: 'ease-in-out',
      fill: 'forwards',
    })

    return new Promise((resolve) => {
      const timers: number[] = []
      for (let i = 0; i < 5; i += 1) {
        timers.push(
          window.setTimeout(() => {
            SquareBurst.playAt(centerX, centerY, 'damage', { count: 12 + i * 2, spread: 80 + i * 14, duration: 600, size: [6, 16] })
          }, 360 + i * 150)
        )
      }
      const zoom = clone.animate(
        [
          { transform: 'translate(0,0) scale(1)', filter: 'brightness(1)' },
          { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, filter: 'brightness(1.2) drop-shadow(0 22px 44px rgba(220, 60, 60, 0.5))' },
        ],
        { duration: 560, easing: 'cubic-bezier(0.18, 0.86, 0.22, 1)', fill: 'forwards' }
      )
      zoom.onfinish = () => {
        const shake = clone.animate(
          [
            { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy}) rotate(0deg)`, filter: 'brightness(1.2)' },
            { transform: `translate(${dx - 12}px, ${dy}px) scale(${sx}, ${sy}) rotate(-3deg)`, filter: 'brightness(1.5) drop-shadow(0 0 16px rgba(220,60,60,0.7))' },
            { transform: `translate(${dx + 12}px, ${dy}px) scale(${sx}, ${sy}) rotate(3deg)`, filter: 'brightness(1.7) drop-shadow(0 0 20px rgba(220,60,60,0.8))' },
            { transform: `translate(${dx}px, ${dy}px) scale(${sx * 1.08}, ${sy * 1.08}) rotate(0deg)`, filter: 'brightness(2.2) saturate(1.4)' },
          ],
          { duration: 620, easing: 'cubic-bezier(0.22, 0.96, 0.28, 1)', fill: 'forwards' }
        )
        shake.onfinish = () => {
          SquareBurst.playAt(centerX, centerY, 'damage', { count: 34, spread: 170, duration: 900, size: [8, 22] })
          const vanish = clone.animate(
            [
              { transform: `translate(${dx}px, ${dy}px) scale(${sx * 1.08}, ${sy * 1.08})`, opacity: 1 },
              { transform: `translate(${dx}px, ${dy}px) scale(${sx * 1.36}, ${sy * 1.36})`, opacity: 0, filter: 'brightness(2) blur(1px)' },
            ],
            { duration: 420, easing: 'cubic-bezier(0.16, 0.88, 0.26, 1)', fill: 'forwards' }
          )
          vanish.onfinish = () => {
            timers.forEach((t) => window.clearTimeout(t))
            source.classList.remove('is-revive-locked')
            clone.remove()
            overlay.remove()
            resolve()
          }
        }
      }
    })
  }

  /**
   * 에나의 클러치 피드백: 플레이어 카드를 들썩이며 블라스트를 터뜨린다.
   * strong(각성)은 카드를 크게 쾅 내려앉히고 금빛 섬광 + 다단 블라스트를 추가한다.
   */
  animateClutchOnPlayer(theme: BurstTheme = 'health-gain', strong = false): Promise<void> {
    const card = this.boardElement.querySelector<HTMLElement>('.player-card')
    if (!card) return Promise.resolve()
    if (!strong) {
      // 소소한/일반 클러치: 카드 살짝 들썩 + 단발 블라스트.
      card.animate(
        [
          { transform: 'translateY(0) scale(1)', filter: 'brightness(1)' },
          { transform: 'translateY(-9px) scale(1.06)', filter: 'brightness(1.25)', offset: 0.35 },
          { transform: 'translateY(0) scale(1)', filter: 'brightness(1)' },
        ],
        { duration: 480, easing: 'cubic-bezier(0.22,0.92,0.36,1)' }
      )
      SquareBurst.playOn(card, theme, { count: 16, spread: 92, duration: 620 })
      return new Promise((resolve) => window.setTimeout(resolve, 480))
    }
    // 각성: 금빛 섬광 + 카드 쾅 내려앉기 + 팡팡팡 다단 블라스트.
    const overlay = document.createElement('div')
    overlay.setAttribute('aria-hidden', 'true')
    overlay.style.cssText =
      'position:fixed;inset:0;z-index:285;pointer-events:none;opacity:0;background:radial-gradient(circle at 50% 60%, rgba(255,214,120,0.34), rgba(8,5,14,0.72) 60%, rgba(8,5,14,0.86));'
    document.body.appendChild(overlay)
    overlay.animate([{ opacity: 0 }, { opacity: 1, offset: 0.3 }, { opacity: 0 }], {
      duration: 1500,
      easing: 'ease-in-out',
      fill: 'forwards',
    })
    card.animate(
      [
        { transform: 'translateY(-26px) scale(1.16)', filter: 'brightness(1.7) drop-shadow(0 0 26px rgba(255,210,110,0.9))', offset: 0 },
        { transform: 'translateY(8px) scale(0.97)', filter: 'brightness(1.3) drop-shadow(0 0 18px rgba(255,190,90,0.7))', offset: 0.42 },
        { transform: 'translateY(0) scale(1)', filter: 'brightness(1)', offset: 1 },
      ],
      { duration: 1100, easing: 'cubic-bezier(0.2,0.9,0.2,1)', fill: 'forwards' }
    )
    return new Promise((resolve) => {
      const rect = card.getBoundingClientRect()
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 2
      for (let i = 0; i < 5; i += 1) {
        window.setTimeout(() => {
          SquareBurst.playAt(cx, cy, i % 2 === 0 ? 'score' : 'attack-gain', {
            count: 18 + i * 3,
            spread: 110 + i * 22,
            duration: 720,
            size: [8, 20],
          })
        }, 200 + i * 150)
      }
      window.setTimeout(() => {
        overlay.remove()
        resolve()
      }, 1500)
    })
  }

  private ensureClutchBannerStyles(): void {
    if (document.getElementById('clutch-banner-styles')) return
    const el = document.createElement('style')
    el.id = 'clutch-banner-styles'
    el.textContent = `
.clutch-banner { position: fixed; z-index: 9998; pointer-events: none; text-align: center; will-change: transform, opacity, filter; }
.clutch-banner-backdrop { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: 150%; height: 230%; z-index: -1; filter: blur(4px); background: radial-gradient(ellipse at center, rgba(8, 5, 14, 0.82) 0%, rgba(8, 5, 14, 0.5) 42%, rgba(8, 5, 14, 0) 72%); }
.clutch-banner-title { font-weight: 800; font-size: 29px; color: rgba(255, 240, 200, 0.99); letter-spacing: 1.5px; white-space: nowrap; text-shadow: 0 0 18px rgba(255, 200, 90, 0.62), 0 3px 8px rgba(0, 0, 0, 0.85); }
.clutch-banner-desc { margin-top: 4px; font-size: 18px; font-weight: 700; color: rgba(255, 226, 172, 0.95); white-space: nowrap; text-shadow: 0 0 10px rgba(255, 190, 80, 0.4), 0 2px 5px rgba(0, 0, 0, 0.88); }
`
    document.head.appendChild(el)
  }

  /**
   * 클러치 전용 체인 배너: 플레이어 카드 위에 『 제목 』 + 효과 설명을 띄우고,
   * 충분히 머문 뒤 흐려지듯 천천히 위로 사라진다.
   */
  showClutchBanner(title: string, description: string): void {
    this.ensureClutchBannerStyles()
    const card = this.boardElement.querySelector<HTMLElement>('.player-card')
    if (!card) return
    const rect = card.getBoundingClientRect()
    const host = document.createElement('div')
    host.className = 'clutch-banner'
    host.setAttribute('aria-hidden', 'true')
    host.innerHTML =
      `<div class="clutch-banner-backdrop"></div>` +
      `<div class="clutch-banner-title">『 ${title} 』</div>` +
      `<div class="clutch-banner-desc">${description}</div>`
    // 플레이어 카드 위(중하단 → 상단)에서 솟아오르되, 카드 위쪽 말풍선 영역까지는 올라가지 않는다.
    host.style.left = `${rect.left + rect.width / 2}px`
    host.style.top = `${rect.top}px`
    document.body.appendChild(host)
    const anim = host.animate(
      [
        { opacity: 0, transform: 'translate(-50%, 46px) scale(0.82)', filter: 'blur(0px)' },
        { opacity: 1, transform: 'translate(-50%, 2px) scale(1.06)', filter: 'blur(0px)', offset: 0.1 },
        { opacity: 1, transform: 'translate(-50%, -8px) scale(1.0)', filter: 'blur(0px)', offset: 0.18 },
        // 가장 뚜렷한 구간 — 카드 상단에 걸친 채 오래 부유하며 체류(말풍선과는 겹치지 않음).
        { opacity: 1, transform: 'translate(-50%, -14px) scale(1.0)', filter: 'blur(0px)', offset: 0.46 },
        { opacity: 1, transform: 'translate(-50%, -4px) scale(1.0)', filter: 'blur(0px)', offset: 0.72 },
        { opacity: 1, transform: 'translate(-50%, -12px) scale(1.0)', filter: 'blur(0px)', offset: 0.84 },
        { opacity: 0, transform: 'translate(-50%, -34px) scale(1.03)', filter: 'blur(2.6px)', offset: 1 },
      ],
      { duration: 5200, easing: 'cubic-bezier(0.2, 0.8, 0.25, 1)', fill: 'forwards' }
    )
    anim.onfinish = () => host.remove()
  }

  /** 유물 파괴 공통 연출(희망/권위와 같은 톤이되 더 가볍다). 강도로 규모를 나눈다:
   *  1 = 제자리에서 짧게 흔들다 회색으로 타들어가며 사라짐(정말 간단한 파괴),
   *  2 = 유물을 살짝 중앙으로 띄워 떨다 터지는 간결 연출(생사엔 큰 지장 없는 효과).
   *  희망/권위(강도 3)는 각자 전용 연출(animateHopeRelicRevive/animateAuthoritySurvive)을 유지한다. */
  animateRelicDestroy(relicId: RelicId, intensity: 1 | 2 = 2): Promise<void> {
    const source = this.boardElement.querySelector<HTMLElement>(
      `.relic-mini-card[data-owned-relic="${relicId}"]`
    )
    const sourceRect = source?.getBoundingClientRect()
    const centerX = window.innerWidth / 2
    const centerY = window.innerHeight * 0.46
    if (!source || !sourceRect) {
      // DOM을 못 찾으면 중앙 버스트로 폴백한다.
      SquareBurst.playAt(centerX, centerY, 'damage', {
        count: intensity === 1 ? 16 : 26,
        spread: intensity === 1 ? 90 : 150,
        duration: 600,
      })
      return new Promise((resolve) => window.setTimeout(resolve, intensity === 1 ? 340 : 600))
    }

    source.classList.add('is-revive-locked')
    const clone = source.cloneNode(true) as HTMLElement
    clone.classList.add('hope-revive-card', 'is-revive-locked')
    clone.style.cssText = `position:fixed;left:${sourceRect.left}px;top:${sourceRect.top}px;width:${sourceRect.width}px;height:${sourceRect.height}px;margin:0;z-index:286;pointer-events:none;transform-origin:50% 50%;`
    document.body.appendChild(clone)
    const cloneCx = sourceRect.left + sourceRect.width / 2
    const cloneCy = sourceRect.top + sourceRect.height / 2

    // 강도 1: 제자리 짧은 흔들림 + 회색 소각. 별도 띄움/오버레이 없이 간결하게.
    if (intensity === 1) {
      SquareBurst.playAt(cloneCx, cloneCy, 'damage', { count: 12, spread: 70, duration: 460, size: [5, 12] })
      return new Promise((resolve) => {
        clone
          .animate(
            [
              { transform: 'translateX(0) rotate(0deg) scale(1)', opacity: 1, filter: 'brightness(1) saturate(1) grayscale(0)' },
              { transform: 'translateX(-4px) rotate(-3deg) scale(1.02)', opacity: 1, filter: 'brightness(1.1) saturate(0.5) grayscale(0.5)', offset: 0.3 },
              { transform: 'translateX(4px) rotate(3deg) scale(0.99)', opacity: 0.95, filter: 'brightness(0.7) saturate(0) grayscale(1)', offset: 0.6 },
              { transform: 'translateX(0) rotate(0deg) scale(0.86)', opacity: 0, filter: 'brightness(0.1) saturate(0) grayscale(1) blur(2px)' },
            ],
            { duration: 460, easing: 'cubic-bezier(0.3, 0.1, 0.35, 1)', fill: 'forwards' }
          )
          .finished.then(() => {
            source.classList.remove('is-revive-locked')
            clone.remove()
            resolve()
          })
      })
    }

    // 강도 2: 살짝 중앙으로 띄워 떨다 터지고 사라진다(권위보다 짧고 가벼운 버전).
    const overlay = document.createElement('div')
    overlay.setAttribute('aria-hidden', 'true')
    overlay.style.cssText =
      'position:fixed;inset:0;z-index:285;pointer-events:none;opacity:0;background:radial-gradient(circle at 50% 46%, rgba(70,40,20,0.18), rgba(8,5,14,0.55) 66%, rgba(8,5,14,0.7));'
    document.body.appendChild(overlay)
    overlay.animate([{ opacity: 0 }, { opacity: 1 }, { opacity: 0 }], {
      duration: 1100,
      easing: 'ease-in-out',
      fill: 'forwards',
    })

    const targetWidth = Math.min(180, Math.max(150, window.innerWidth * 0.13))
    const targetHeight = targetWidth / 0.72
    const dx = centerX - targetWidth / 2 - sourceRect.left
    const dy = centerY - targetHeight / 2 - sourceRect.top
    const sx = targetWidth / Math.max(1, sourceRect.width)
    const sy = targetHeight / Math.max(1, sourceRect.height)

    return new Promise((resolve) => {
      const zoom = clone.animate(
        [
          { transform: 'translate(0,0) scale(1)', filter: 'brightness(1)' },
          { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, filter: 'brightness(1.2) drop-shadow(0 16px 32px rgba(255, 200, 120, 0.4))' },
        ],
        { duration: 420, easing: 'cubic-bezier(0.18, 0.86, 0.22, 1)', fill: 'forwards' }
      )
      zoom.onfinish = () => {
        const shake = clone.animate(
          [
            { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy}) rotate(0deg)`, filter: 'brightness(1.2)' },
            { transform: `translate(${dx - 10}px, ${dy}px) scale(${sx}, ${sy}) rotate(-3deg)`, filter: 'brightness(1.5)' },
            { transform: `translate(${dx + 10}px, ${dy}px) scale(${sx}, ${sy}) rotate(3deg)`, filter: 'brightness(1.8) saturate(0.6)' },
            { transform: `translate(${dx}px, ${dy}px) scale(${sx * 1.06}, ${sy * 1.06}) rotate(0deg)`, filter: 'brightness(2.4) saturate(0)' },
          ],
          { duration: 480, easing: 'cubic-bezier(0.22, 0.96, 0.28, 1)', fill: 'forwards' }
        )
        shake.onfinish = () => {
          SquareBurst.playAt(centerX, centerY, 'damage', { count: 26, spread: 140, duration: 760, size: [7, 18] })
          const vanish = clone.animate(
            [
              { transform: `translate(${dx}px, ${dy}px) scale(${sx * 1.06}, ${sy * 1.06})`, opacity: 1, filter: 'brightness(2.4) saturate(0)' },
              { transform: `translate(${dx}px, ${dy}px) scale(${sx * 1.3}, ${sy * 1.3})`, opacity: 0, filter: 'brightness(3) saturate(0) blur(1px)' },
            ],
            { duration: 380, easing: 'cubic-bezier(0.16, 0.88, 0.26, 1)', fill: 'forwards' }
          )
          vanish.onfinish = () => {
            source.classList.remove('is-revive-locked')
            clone.remove()
            overlay.remove()
            resolve()
          }
        }
      }
    })
  }

  /** Find the rendered DOM element for a card (by id) for burst placement. */
  findCardElement(cardId: string): HTMLElement | null {
    // 보스는 2행에 걸쳐 박히고 한쪽 행은 display:none이다. querySelector는 DOM 순서상
    // 먼저 오는(숨겨진) 셀을 반환할 수 있어 rect=(0,0)으로 이펙트/대사가 좌상단에 찍힌다.
    // 실제로 보이는(offsetParent 존재) 셀을 우선 반환한다.
    const matches = this.boardElement.querySelectorAll<HTMLElement>(
      `.cell.card[data-card-id="${cardId}"]`
    )
    if (matches.length === 0) return null
    for (const el of matches) {
      if (el.offsetParent !== null) return el
    }
    return matches[0]
  }

  /** Capture a card's current screen rect before the model removes it, so a
   *  follow-up blast can launch from where the card visually sat. */
  getCardRect(cardId: string): DOMRect | null {
    const el = this.findCardElement(cardId)
    return el ? el.getBoundingClientRect() : null
  }

  /**
   * 별빛 자동 소비 연출: 카드가 빛으로 풀려 **떠오르고 → 두둥실 표류하다 → 턴 카운터에
   * 꽂힌다**. 이 함수가 끝난 뒤 호출부가 턴을 +1 시킨다 — 꽂힘과 턴 상승이 한 박자로
   * 이어져야 "별빛이 턴을 열었다"가 읽힌다.
   */
  async fireStarlightToTurn(sourceRect: DOMRect): Promise<void> {
    const turnBrand = this.boardElement.querySelector<HTMLElement>('.turn-brand-number')
      ?? this.boardElement.querySelector<HTMLElement>('.turn-brand')
    const cx = sourceRect.left + sourceRect.width / 2
    const cy = sourceRect.top + sourceRect.height / 2
    // 원점 별빛 흩뿌림 — 카드가 빛으로 풀리는 출발 블라스트.
    SquareBurst.playAt(cx, cy, 'starlight', { count: 14, spread: 80, duration: 420 })
    await this.trails.animateStarlightToken(sourceRect, turnBrand)
  }

  /** 100턴 초과분 별빛 소멸 연출: 수집(턴 +1)하지 않고 그 자리에서 빛으로 흩어져 사라진다.
   *  fireStarlightToTurn과 달리 턴 브랜드로 가는 트레일이 없다(턴을 올리지 않으므로). */
  async dissolveStarlight(sourceRect: DOMRect): Promise<void> {
    const cx = sourceRect.left + sourceRect.width / 2
    const cy = sourceRect.top + sourceRect.height / 2
    SquareBurst.playAt(cx, cy, 'starlight', { count: 20, spread: 130, duration: 520 })
    await new Promise((r) => window.setTimeout(r, 320))
  }

  /** Find a hand slot element by index for burst placement. */
  findHandSlotElement(slotIndex: number): HTMLElement | null {
    return this.boardElement.querySelector<HTMLElement>(
      `.hand-slot[data-slot-index="${slotIndex}"]`
    )
  }

  /** 플레이어 카드 DOM — 보스 쪽 연출이 '플레이어에게로' 향할 때의 목적지. */
  findPlayerCardElement(): HTMLElement | null {
    return this.boardElement.querySelector<HTMLElement>('.player-card, .player-row')
  }

  /** 보스 직접 타격(들어올림 → 뒤로 당김 → 쾅) 연출 위임. 착지 순간에 resolve된다. */
  async animateBossSlamAttack(cardId: string): Promise<void> {
    return this.bossFx.animateBossSlamAttack(cardId)
  }

  /** 30F 탐욕의 값(웨이브 카운트 → 동전마다 1피해) 연출 위임. */
  async animateGreedCoinToll(
    slotIndices: readonly number[],
    onCoin: (slotIndex: number) => Promise<void> | void
  ): Promise<void> {
    return this.bossFx.animateGreedCoinToll(slotIndices, onCoin)
  }

  /** 보스↔손패 슬롯 연출 위임 — 본체는 renderer/BossFxView. */
  async animateBossBlastToHandSlot(cardId: string, slotIndex: number, theme: BurstTheme): Promise<void> {
    return this.bossFx.animateBossBlastToHandSlot(cardId, slotIndex, theme)
  }

  /** 양초 고양이 손패 강탈 연출 위임. */
  async animateBossStealHandSlot(cardId: string, slotIndex: number): Promise<void> {
    return this.bossFx.animateBossStealHandSlot(cardId, slotIndex)
  }

  /** 손패 소각 연출 위임. */
  async animateHandCardBurn(slotIndex: number): Promise<void> {
    return this.bossFx.animateHandCardBurn(slotIndex)
  }

  /** 이벤트 불태우기: 레시피 해금 카드가 등장해 불길하게 확대됐다 화염과 함께 도감으로 빨려 들어간다. */
  async animateEventRecipeUnlock(_recipeId: string, recipeName: string, recipeEffect: string, ingredientText?: string): Promise<void> {
    const spriteUrl = recipeSprite001 ?? ''
    const compendiumBtn = this.boardElement.querySelector<HTMLElement>('[data-open-compendium]')

    // 고정 오버레이에 해금 카드 DOM을 생성한다 (카드팩 카드 양식).
    const overlay = document.createElement('div')
    overlay.style.cssText = [
      'position:fixed;inset:0;z-index:9200',
      'display:flex;align-items:center;justify-content:center',
      'pointer-events:none',
    ].join(';')

    const card = document.createElement('div')
    card.style.cssText = [
      'width:clamp(148px,20vw,220px)',
      'aspect-ratio:3/4',
      'border-radius:14px',
      'overflow:hidden',
      'display:grid',
      'grid-template-rows:55% 45%',
      // legendary 티어 테두리·그림자 (팩 피커 카드 기준)
      'border:1px solid rgba(255,215,120,0.5)',
      'background:linear-gradient(180deg,rgba(45,30,39,0.98),rgba(18,12,24,0.98))',
      'box-shadow:0 12px 24px rgba(0,0,0,0.55),0 0 28px rgba(255,140,60,0.18)',
      'will-change:transform,opacity',
      'transform:scale(0.55) translateY(60px)',
      'opacity:0',
      'font-family:OkDanDan,Georgia,serif',
    ].join(';')

    const art = document.createElement('div')
    art.style.cssText = [
      `background-image:url('${spriteUrl}')`,
      'background-size:cover',
      'background-position:center 15%',
      // 팩 피커 ::after 역할을 inline으로 대체
      'box-shadow:inset 0 -52px 64px rgba(6,6,12,0.52)',
      'border-bottom:1px solid rgba(180,100,40,0.35)',
      'border-radius:14px 14px 0 0',
      'overflow:hidden',
      'position:relative',
    ].join(';')

    // 희귀도 배지 (팩 피커의 .shop-pack-pick-rarity-badge — legendary 주황)
    const rarityBadge = document.createElement('span')
    rarityBadge.textContent = 'legendary'
    rarityBadge.style.cssText = [
      'position:absolute;top:7px;left:7px;z-index:3',
      'font-size:9px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase',
      'padding:2px 6px;border-radius:999px;border:1px solid currentColor;opacity:0.85',
      'pointer-events:none;background:rgba(10,7,18,0.55)',
      'color:rgba(255,140,60,0.9)',
    ].join(';')
    art.appendChild(rarityBadge)

    const body = document.createElement('div')
    body.style.cssText = [
      'padding:10px 10px 12px',
      'display:flex;flex-direction:column;align-items:center;gap:5px',
    ].join(';')

    // 타입 배지 (팩 피커의 .shop-pack-type-badge)
    const typeBadge = document.createElement('div')
    typeBadge.textContent = '[ 레시피 ]'
    typeBadge.style.cssText = [
      'font-size:10px;color:rgba(200,195,180,0.58)',
      'letter-spacing:0.12em;line-height:1;white-space:nowrap;text-align:center',
    ].join(';')

    const title = document.createElement('h3')
    title.textContent = recipeName
    title.style.cssText = [
      'margin:0;font-size:clamp(14px,1.3vw,16px)',
      'font-weight:900;letter-spacing:0.04em;line-height:1.2',
      'color:rgba(255,232,168,0.96)',
      'text-shadow:0 1px 2px rgba(0,0,0,0.8)',
      'text-align:center;white-space:normal',
    ].join(';')

    const effect = document.createElement('p')
    effect.textContent = recipeEffect
    effect.style.cssText = [
      'margin:0;font-size:13px',
      'line-height:1.4',
      'color:rgba(220,200,170,0.82)',
      'text-shadow:0 1px 2px rgba(0,0,0,0.7)',
      'text-align:center',
    ].join(';')

    body.appendChild(typeBadge)
    body.appendChild(title)
    body.appendChild(effect)

    if (ingredientText) {
      const divider = document.createElement('div')
      divider.style.cssText = 'width:100%;height:1px;background:rgba(200,175,110,0.18);margin:2px 0 3px'
      const ingredients = document.createElement('p')
      ingredients.textContent = ingredientText
      ingredients.style.cssText = [
        'margin:0;font-size:11px',
        'line-height:1.3;letter-spacing:0.02em',
        'color:rgba(200,185,165,0.58)',
        'text-align:center;white-space:normal',
      ].join(';')
      body.appendChild(divider)
      body.appendChild(ingredients)
    }

    card.appendChild(art)
    card.appendChild(body)
    overlay.appendChild(card)
    document.body.appendChild(overlay)

    // 단계1: 카드가 화면 중앙에 무겁게 등장한다.
    await card.animate(
      [
        { transform: 'scale(0.55) translateY(60px)', opacity: 0, filter: 'brightness(0.5)' },
        { transform: 'scale(1.08) translateY(-8px)',  opacity: 1, filter: 'brightness(1.2)', offset: 0.55 },
        { transform: 'scale(1.18) translateY(-14px)', opacity: 1, filter: 'brightness(1.0)' },
      ],
      { duration: 850, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'forwards' }
    ).finished

    // 카드를 충분히 읽을 수 있게 잔류시킨다.
    await new Promise<void>((r) => window.setTimeout(r, 2200))

    // 단계2: 화염 파티클 폭발.
    SquareBurst.playOn(card, 'damage', { count: 22, spread: 110, duration: 520, size: [6, 16] })
    SquareBurst.playOn(card, 'ember-gain', { count: 10, spread: 80, duration: 400 })
    await new Promise<void>((r) => window.setTimeout(r, 90))

    // 단계3: 카드가 도감 버튼으로 빠르게 날아가며 사라진다.
    const cardRect = card.getBoundingClientRect()
    const compRect = compendiumBtn?.getBoundingClientRect()
    const tx = compRect ? compRect.left + compRect.width / 2 - (cardRect.left + cardRect.width / 2) : 0
    const ty = compRect ? compRect.top  + compRect.height / 2 - (cardRect.top  + cardRect.height / 2) : -200
    await card.animate(
      [
        { transform: 'scale(1.18) translateY(-14px)',                                        opacity: 1,   filter: 'brightness(1.0)' },
        { transform: `scale(0.18) translate(${tx}px, ${ty}px) rotate(8deg)`,                opacity: 0,   filter: 'brightness(2.5) blur(5px)' },
      ],
      { duration: 440, easing: 'cubic-bezier(0.55, 0, 0.7, 0.6)', fill: 'forwards' }
    ).finished

    // 도감 버튼 뽀용 + 황금 스파크.
    if (compendiumBtn) {
      SquareBurst.playOn(compendiumBtn, 'treasure-gain', { count: 16, spread: 55, duration: 380 })
      await compendiumBtn.animate(
        [
          { transform: 'scale(1)' },
          { transform: 'scale(1.38)', offset: 0.28 },
          { transform: 'scale(0.90)', offset: 0.58 },
          { transform: 'scale(1.10)', offset: 0.78 },
          { transform: 'scale(1)' },
        ],
        { duration: 440, easing: 'ease-out' }
      ).finished
    }

    overlay.remove()
  }

  /** Flower-specific SquareBurst palettes keep red rose, marigold, lavender,
   *  oleander, and chamomile rewards visually distinct while still using the
   *  same square language as the rest of the board. */
  private flowerBurstTheme(kind: FlowerKind): BurstTheme {
    switch (kind) {
      case 'chamomile':
        return 'flower-chamomile'
      case 'redRose':
        return 'flower-red-rose'
      case 'marigold':
        return 'flower-marigold'
      case 'oleander':
        return 'flower-oleander'
      case 'lavender':
        return 'flower-lavender'
      case 'seed':
        return 'flower-bloom'
    }
  }

  /**
   * 자원 트레일 공개 진입점(외부 index/BossEvent 계약) — 구현은
   * renderer/ResourceTrailFx.ts로 이동, 얇은 위임만 유지한다.
   */
  animateResourceTrailFromCard(
    cardId: string,
    target: ResourceTrailTarget,
    count: number,
    theme: BurstTheme
  ): Promise<void> {
    return this.trails.animateResourceTrailFromCard(cardId, target, count, theme)
  }

  animateResourceTrailFromRect(
    source: DOMRect,
    target: ResourceTrailTarget,
    count: number,
    theme: BurstTheme
  ): Promise<void> {
    return this.trails.animateResourceTrailFromRect(source, target, count, theme)
  }

  animateResourceTrailFromCenter(
    target: ResourceTrailTarget,
    count: number,
    theme: BurstTheme
  ): Promise<void> {
    return this.trails.animateResourceTrailFromCenter(target, count, theme)
  }

  animateTargetBlastFromCenterToCard(cardId: string, theme: BurstTheme): Promise<void> {
    return this.trails.animateTargetBlastFromCenterToCard(cardId, theme)
  }

  animateTargetBlastFromChainToCard(cardId: string, theme: BurstTheme): Promise<void> {
    return this.trails.animateTargetBlastFromChainToCard(cardId, theme)
  }

  animateResourceTrailFromChain(
    target: ResourceTrailTarget,
    count: number,
    theme: BurstTheme
  ): Promise<void> {
    return this.trails.animateResourceTrailFromChain(target, count, theme)
  }

  /** Count down spent light immediately so purchases share the same numeric
   *  beat as gains instead of silently jumping after the shop re-render. */
  playScoreSpendFeedback(targetScore: number, pulseKey: number): void {
    this.rememberImmediateResourcePulse('score', targetScore, pulseKey)
    this.animateResourceCounter('.score-number', targetScore, '')
  }

  /** Coin counterpart of playScoreSpendFeedback — used for shop reroll which
   *  is paid in 화폐 (coins). Ticks the wallet without firing a gain burst. */
  playCoinSpendFeedback(targetCoins: number, pulseKey: number): void {
    this.rememberImmediateResourcePulse('coin', targetCoins, pulseKey)
    this.animateResourceCounter('.coin-number', targetCoins, ' $')
  }

  /** Start count-up animations that were requested by renderScorePanel().
   *  This covers resource changes that happen immediately before a render,
   *  while playScoreGainFeedback/playCoinGainFeedback covers changes that can
   *  safely animate on the already-mounted DOM. Crucially, if a counter was
   *  already mid-roll on the OLD DOM (because burstScoreGain/playHudCounter
   *  Feedback fired right before this render), the active map lets us seam
   *  lessly transfer that roll to the new span instead of letting it snap. */
  /** 모든 수치형 HUD(불빛/화폐/체력/방패/불씨/콤보 게이지/공격력)에 롤링 카운터를 적용한다.
   *  renderHudCounter가 data-count-start/end 속성을 심고, 이 함수가 render() 직후에 인계받아
   *  integer tick 증감 — "띠리리릭" 슬롯머신 느낌 — 을 재생한다. 새 수치 HUD를 추가할 때는
   *  반드시 renderHudCounter를 통해 span을 만들어야 자동으로 이 애니메이션이 적용된다. */
  private animateRenderedResourceCounters(): void {
    this.boardElement
      .querySelectorAll<HTMLElement>('[data-count-start][data-count-end]')
      .forEach((el) => {
        const suffix = el.dataset.countSuffix ?? ''
        const key = this.counterKeyFor(el)
        const active = key ? this.activeCounterAnimations.get(key) : null
        const end = Number.parseInt(el.dataset.countEnd ?? '', 10)
        if (!Number.isFinite(end)) return
        if (active) {
          // Pick up the in-flight roll on the new span. Use the current
          // animated value as the visible/start point so the slot-machine
          // never visually jumps backward; target the latest data-count-end
          // so cumulative gains during the roll still resolve to the right
          // number.
          const now = performance.now()
          const currentValue = this.computeActiveCounterValue(active, now)
          if (currentValue === end) {
            el.textContent = `${end.toLocaleString()}${suffix}`
            this.activeCounterAnimations.delete(key!)
            return
          }
          // If the target hasn't moved, finish the remaining time the
          // original animation budgeted. Otherwise extend the duration
          // proportionally to the new delta so an enlarged target still
          // reads as a slot-machine instead of a faster jump.
          const elapsed = now - active.startedAt
          const remaining = Math.max(40, active.duration - elapsed)
          const freshDuration = this.counterDurationForDelta(Math.abs(end - currentValue))
          const duration = end === active.endValue ? remaining : Math.max(remaining, freshDuration)
          el.textContent = `${currentValue.toLocaleString()}${suffix}`
          if (active.popClass) el.classList.add('is-score-popping')
          // animateResourceCounterElement re-registers a fresh active state
          // keyed under the same counter, replacing the orphaned entry.
          this.animateResourceCounterElement(el, currentValue, end, suffix, duration)
          return
        }
        const start = Number.parseInt(el.dataset.countStart ?? '', 10)
        if (!Number.isFinite(start) || end === start) return
        this.animateResourceCounterElement(el, start, end, suffix)
      })
  }

  /** Animate a resource number on the current DOM, then remember that the
   *  matching pulse key has already been handled so a later full render does
   *  not replay the same sparkle. The visible text changes in integer ticks,
   *  giving score and wallet gains a small "띠리리릭" counter feel. */
  private animateResourceCounter(
    selector: '.score-number' | '.coin-number',
    targetValue: number,
    suffix: string,
    duration?: number
  ): void {
    const el = this.boardElement.querySelector<HTMLElement>(selector)
    if (!el) return
    const numericText = el.textContent?.replace(/[^0-9-]/g, '') ?? ''
    const startValue = Number.parseInt(numericText, 10) || 0
    this.animateResourceCounterElement(el, startValue, targetValue, suffix, duration)
  }

  private animateResourceCounterElement(
    el: HTMLElement,
    startValue: number,
    targetValue: number,
    suffix: string,
    duration?: number
  ): void {
    const delta = targetValue - startValue
    const absDelta = Math.abs(delta)
    const startedAt = performance.now()
    const runDuration = duration ?? this.counterDurationForDelta(absDelta)
    el.classList.remove('is-score-popping', 'is-counter-ticking')
    void el.offsetWidth
    el.classList.add('is-counter-ticking')
    const isScoreCoin =
      el.classList.contains('score-number') || el.classList.contains('coin-number')
    const popClass = delta > 0 && isScoreCoin
    if (popClass) el.classList.add('is-score-popping')

    // Register this roll so a re-render that orphans `el` can resume the
    // count on the freshly-mounted span via animateRenderedResourceCounters.
    const key = this.counterKeyFor(el)
    if (key) {
      this.activeCounterAnimations.set(key, {
        startedAt,
        duration: runDuration,
        startValue,
        endValue: targetValue,
        suffix,
        popClass,
      })
    }

    const tick = (now: number) => {
      // The OLD span gets detached the moment innerHTML is replaced. Stop
      // ticking that orphan; the transfer path in animateRenderedResource
      // Counters has already mounted a fresh tick on the new span.
      if (!document.contains(el)) return
      // Stale-animation guard: when a newer roll has claimed the same slot
      // (e.g. two score gains in quick succession), abandon this tick so
      // two rAF chains don't both write to el.textContent each frame.
      if (key) {
        const current = this.activeCounterAnimations.get(key)
        if (current && current.startedAt !== startedAt) return
      }
      const t = Math.min(1, (now - startedAt) / runDuration)
      // Ease out quickly at the end so small deltas read as +1/-1 ticks, while
      // huge light purchases/rewards still finish in a compact accelerated roll.
      const eased = 1 - Math.pow(1 - t, 3)
      const value = Math.round(startValue + delta * eased)
      el.textContent = `${value.toLocaleString()}${suffix}`
      if (key?.startsWith('hud:')) this.syncHudCounterLinkedVisuals(key.slice(4), value)
      if (t < 1) {
        requestAnimationFrame(tick)
      } else {
        el.textContent = `${targetValue.toLocaleString()}${suffix}`
        if (key?.startsWith('hud:')) this.syncHudCounterLinkedVisuals(key.slice(4), targetValue)
        if (el.dataset.countHideWhenZero === 'true' && targetValue <= 0) {
          el.closest<HTMLElement>('.player-shield-chip')?.classList.add('is-gone')
        }
        window.setTimeout(() => el.classList.remove('is-score-popping', 'is-counter-ticking'), 120)
        if (key) {
          // Only clear if no fresher roll has replaced this one in the slot.
          const current = this.activeCounterAnimations.get(key)
          if (current?.startedAt === startedAt) this.activeCounterAnimations.delete(key)
        }
      }
    }
    requestAnimationFrame(tick)
  }

  /** Keep non-text meters visually tied to the same integer roll. The model
   *  value may already be final, but this method deliberately paints the
   *  displayed value so decreases (HP damage, ember decay, gauge spend) drain
   *  one visible step at a time instead of snapping their bars/ticks. */
  private syncHudCounterLinkedVisuals(key: string, value: number): void {
    // 보스 HP 막대는 캐릭터가 아니라 필드 보스 카드 소유라 character 가드보다 먼저 처리한다.
    if (key === 'boss-hp') {
      const fill = this.boardElement.querySelector<HTMLElement>('.boss-face-hpbar-fill')
      if (fill) fill.style.width = `${Math.max(0, Math.min(100, (value / this.bossHpMax) * 100))}%`
      return
    }
    const character = this.currentGameState?.getCharacter()
    if (!character) return
    if (key === 'health' || key === 'maxHealth') {
      const health =
        key === 'health' ? value : (this.displayedHudCounters.get('health') ?? character.health)
      const maxHealth = Math.max(1, key === 'maxHealth' ? value : character.maxHealth)
      const fill = this.boardElement.querySelector<HTMLElement>('.hp-fill')
      if (fill) fill.style.width = `${Math.max(0, Math.min(100, (health / maxHealth) * 100))}%`
      return
    }
    if (key === 'ember' || key === 'emberMax') {
      const ember =
        key === 'ember' ? value : (this.displayedHudCounters.get('ember') ?? character.ember)
      const emberMax = Math.max(1, key === 'emberMax' ? value : character.emberMax)
      const fill = this.boardElement.querySelector<HTMLElement>('.ember-bar-fill')
      if (fill) fill.style.width = `${Math.max(0, Math.min(100, (ember / emberMax) * 100))}%`
      return
    }
    if (key === 'candle' || key === 'candleMax') {
      const candle =
        key === 'candle' ? value : (this.displayedHudCounters.get('candle') ?? character.candle)
      const candleMax = Math.max(1, key === 'candleMax' ? value : character.candleMax)
      const clampedPct = Math.max(0, Math.min(100, (candle / candleMax) * 100))
      const meter = this.boardElement.querySelector<HTMLElement>('.candle-gauge-meter')
      if (meter) meter.style.setProperty('--candle-fill', `${clampedPct}%`)
      this.boardElement.querySelectorAll<HTMLElement>('.candle-gauge-tick').forEach((tick, idx) => {
        tick.classList.toggle('is-filled', idx < candle)
      })
    }
  }

  /** Larger jumps run longer but not linearly longer, so 5 HP ticks stay
   *  readable and 500 light still resolves as a fast slot-machine roll. */
  private counterDurationForDelta(absDelta: number): number {
    if (absDelta <= 0) return 0
    return Math.min(1080, Math.max(220, 220 + Math.sqrt(absDelta) * 82))
  }

  /** Play score gain feedback immediately on the existing panel so the number
   *  rises during the same beat as the square burst and ✦ sparkle.
   *  pulseKey가 직전과 같다면 실제 변동이 없는 호출이므로 burst를 발동하지 않는다
   *  (화폐 보상 등 무관한 단계에서 점수 패널 burst가 같이 뜨던 시각 혼선 제거). */
  playScoreGainFeedback(targetScore: number, pulseKey: number): void {
    if (pulseKey === this.previousScorePulseKey && pulseKey === this.activeScorePulseKey) return
    this.rememberImmediateResourcePulse('score', targetScore, pulseKey)
    this.animateResourceCounter('.score-number', targetScore, '')
    const anchor = this.trails.findScorePulseAnchor()
    if (anchor) this.burstAtElement(anchor, 'score', { count: 22, spread: 170, duration: 640 })
  }

  /** Play shop-currency gain feedback with the exact same sparkle language as
   *  score, but keep the wallet's trailing dollar marker.
   *  pulseKey 미변동 시 skip — 점수 보상 시 화폐 패널 burst가 같이 뜨던 문제 차단. */
  playCoinGainFeedback(targetCoins: number, pulseKey: number): void {
    if (pulseKey === this.previousCoinPulseKey && pulseKey === this.activeCoinPulseKey) return
    this.rememberImmediateResourcePulse('coin', targetCoins, pulseKey)
    this.animateResourceCounter('.coin-number', targetCoins, ' $')
    const anchor = this.trails.findCoinPulseAnchor()
    if (anchor) this.burstAtElement(anchor, 'score', { count: 22, spread: 170, duration: 640 })
  }

  /**
   * Tick a generic HUD counter (HP/maxHP/shield/ember/emberMax/candle/
   * candleMax/attack) on the LIVE DOM so the number visibly rolls during the
   * same beat the resource trail lands, instead of waiting for the next full
   * board re-render. Mirrors the existing playScoreGainFeedback /
   * playCoinGainFeedback path so every resource shares one ticking grammar.
   *
   * Without this hook, an enemy defeat → heal/shield/ember trail would fly,
   * burst at the HUD, and the number would only update much later when an
   * unrelated render() ran. The counter still rolls correctly on the next
   * render because displayedHudCounters is synced here.
   */
  playHudCounterFeedback(key: string, targetValue: number, duration?: number): void {
    const safeTarget = Math.round(Number.isFinite(targetValue) ? targetValue : 0)
    const active = this.activeCounterAnimations.get(`hud:${key}`)
    const previous = active
      ? this.computeActiveCounterValue(active)
      : this.displayedHudCounters.get(key)
    if (previous === undefined || previous === safeTarget) {
      this.displayedHudCounters.set(key, safeTarget)
      return
    }
    const els = this.boardElement.querySelectorAll<HTMLElement>(`[data-count-key="${key}"]`)
    this.displayedHudCounters.set(key, safeTarget)
    els.forEach((el) => {
      const suffix = el.dataset.countSuffix ?? ''
      el.dataset.countStart = String(previous)
      el.dataset.countEnd = String(safeTarget)
      this.animateResourceCounterElement(el, previous, safeTarget, suffix, duration)
    })
  }

  /** Store the currently-playing direct resource pulse so a near-immediate
   *  board re-render cannot sever the CSS sparkle from the persistent burst. */
  private rememberImmediateResourcePulse(
    resource: 'score' | 'coin',
    targetValue: number,
    pulseKey: number
  ): void {
    const pulseUntil = performance.now() + 760
    if (resource === 'score') {
      this.previousScorePulseKey = pulseKey
      this.displayedScoreValue = targetValue
      this.activeScorePulseKey = pulseKey
      this.activeScorePulseUntil = pulseUntil
      return
    }
    this.previousCoinPulseKey = pulseKey
    this.displayedCoinValue = targetValue
    this.activeCoinPulseKey = pulseKey
    this.activeCoinPulseUntil = pulseUntil
  }

  /**
   * Animate the already-open hover preview, not the compact hand slot. The
   * source hand card quietly fades while the preview keeps its original size,
   * shoots to screen center, pauses briefly, then blooms and dissolves.
   */
  animateHandCardUse(slotIndex: number, theme: BurstTheme): Promise<void> {
    const source = this.findHandSlotElement(slotIndex)
    if (!source) return Promise.resolve()

    const sourceRect = source.getBoundingClientRect()
    const preview = source.querySelector<HTMLElement>('.hand-card-preview')
    const previewRect = preview?.getBoundingClientRect()
    const hasVisiblePreview = !!previewRect && previewRect.width > 0 && previewRect.height > 0
    const ghostWidth = hasVisiblePreview ? previewRect.width : 188
    const ghostHeight = hasVisiblePreview ? previewRect.height : ghostWidth / 0.72
    const startLeft = hasVisiblePreview ? previewRect.left : sourceRect.left - ghostWidth - 16
    const startTop = hasVisiblePreview
      ? previewRect.top
      : sourceRect.top + sourceRect.height / 2 - ghostHeight / 2
    const targetX = window.innerWidth / 2
    const targetY = window.innerHeight * 0.46
    const deltaX = targetX - (startLeft + ghostWidth / 2)
    const deltaY = targetY - (startTop + ghostHeight / 2)
    const ghost = (preview ?? source).cloneNode(true) as HTMLElement

    // The ghost is fixed-size from start to finish so the preview art does not
    // stretch; only the final center bloom scales up slightly for impact.
    ghost.classList.add('hand-use-ghost', 'is-preview-flight')
    ghost.style.left = `${startLeft}px`
    ghost.style.top = `${startTop}px`
    ghost.style.width = `${ghostWidth}px`
    ghost.style.height = `${ghostHeight}px`
    ghost.setAttribute('aria-hidden', 'true')
    document.body.appendChild(ghost)
    source.classList.add('is-hand-use-source')

    const anim = ghost.animate(
      [
        { transform: 'translate(0, 0) scale(1)', opacity: 1, filter: 'brightness(1)' },
        {
          transform: `translate(${deltaX * 0.78}px, ${deltaY * 0.78}px) scale(1)`,
          opacity: 1,
          filter: 'brightness(1.16)',
          offset: 0.58,
        },
        {
          transform: `translate(${deltaX}px, ${deltaY}px) scale(1)`,
          opacity: 1,
          filter: 'brightness(1.2)',
          offset: 0.76,
        },
        {
          transform: `translate(${deltaX}px, ${deltaY}px) scale(1.03)`,
          opacity: 1,
          filter: 'brightness(1.14)',
          offset: 0.88,
        },
        {
          transform: `translate(${deltaX}px, ${deltaY}px) scale(1.12)`,
          opacity: 0,
          filter: 'brightness(1.46)',
        },
      ],
      { duration: 900, easing: 'cubic-bezier(0.18, 0.88, 0.22, 1)', fill: 'forwards' }
    )

    return new Promise((resolve) => {
      // Fire the burst while the ghost is fading (the 0.88 → 1.0 phase of
      // the WebAnimation above starts around ~720ms in). Three concentric
      // bursts at slightly offset points across the ghost card cover the
      // full card area instead of pinpointing the centre — radiates outward
      // evenly so the dissolve and burst read as one beat.
      window.setTimeout(() => {
        const radius = Math.min(ghostWidth, ghostHeight) * 0.28
        SquareBurst.playAt(targetX, targetY, theme, {
          count: 26,
          spread: 270,
          duration: 680,
          size: [7, 16],
        })
        SquareBurst.playAt(targetX - radius, targetY - radius * 0.4, theme, {
          count: 10,
          spread: 165,
          duration: 600,
          size: [6, 13],
        })
        SquareBurst.playAt(targetX + radius, targetY + radius * 0.4, theme, {
          count: 10,
          spread: 165,
          duration: 600,
          size: [6, 13],
        })
      }, 640)
      // Intentionally do NOT remove `is-hand-use-source` when the ghost is
      // done. The hand is already mutated; the slot DOM is stale and will
      // be rebuilt on the next render(). If we restored the slot's opacity
      // here, the player would briefly see the used card reappear (which
      // looks exactly like the "card slides away → reappears → slides away
      // again" flicker reported on slow machines). Leaving the class in
      // place keeps the slot invisible until render() drops the node.
      anim.onfinish = () => {
        ghost.remove()
        resolve()
      }
      window.setTimeout(() => {
        ghost.remove()
        resolve()
      }, 1080)
    })
  }

  /**
   * Burst on cards that just received the wax-freeze status. This is separate
   * from the persistent CSS shell so the exact trigger moment has the same
   * SquareBurst language as damage, treasure, and vanish effects.
   */
  animateWaxFreezeByIds(cardIds: string[]): Promise<void> {
    if (cardIds.length === 0) return Promise.resolve()
    const animations: Promise<void>[] = []
    for (const cardId of cardIds) {
      const elements = [
        ...this.boardElement.querySelectorAll<HTMLElement>(`.cell.card[data-card-id="${cardId}"]`),
      ]
      if (elements.length === 0) continue
      const r1 = elements[0].getBoundingClientRect()
      const r2 = elements[elements.length - 1].getBoundingClientRect()
      SquareBurst.playAt((r1.left + r2.right) / 2, (r1.top + r2.bottom) / 2, 'wax-freeze', {
        count: 20,
        spread: 120 + (elements.length - 1) * 24,
        duration: 620,
      })
      animations.push(this.animateElements(elements, 'is-freeze-triggering', 420))
    }
    return Promise.all(animations).then(() => undefined)
  }

  /**
   * "Eaten" animation for trap/treasure (and any other consumed card):
   * the card scales up + brightens + fades out while a themed SquareBurst
   * fires from its center. All DOM cells belonging to this Card instance
   * play in lockstep so 2/3-cell merges read as a single consumption.
   *
   * Theme defaults by card type. Falls back to vanish-smoke.
   */
  animateCardConsume(card: Card): Promise<void> {
    const elements = [
      ...this.boardElement.querySelectorAll<HTMLElement>(`.cell.card[data-card-id="${card.id}"]`),
    ]
    if (elements.length === 0) return Promise.resolve()
    const theme: BurstTheme =
      card.type === CardType.TREASURE
        ? 'treasure-gain'
        : card.type === CardType.ENEMY
          ? 'damage'
          : 'vanish-smoke'
    // Burst from the visual center of the (possibly wide) group.
    const first = elements[0]
    const last = elements[elements.length - 1]
    const r1 = first.getBoundingClientRect()
    const r2 = last.getBoundingClientRect()
    const x = (r1.left + r2.right) / 2
    const y = (r1.top + r2.bottom) / 2
    SquareBurst.playAt(x, y, theme, {
      count: 20,
      spread: 130 + (elements.length - 1) * 30,
      duration: 640,
    })
    // Persist `is-consuming` so the fade-out final frame (opacity:0) holds
    // until the next render() actually drops the card. Otherwise the class
    // is removed mid-await and the card visibly snaps back to full opacity
    // for a frame — that's the "blink" the player sees on slow machines.
    return this.animateElements(
      elements,
      card.type === CardType.ENEMY ? 'is-enemy-defeated-consuming' : 'is-consuming',
      card.type === CardType.ENEMY ? 560 : 480,
      { persist: true }
    )
  }

  /**
   * Consume a list of cards by id+type — used by hand-ability paths where
   * HandSystem mutates the model BEFORE we can capture the Card object.
   * The DOM is still showing the pre-mutation state when this is invoked.
   * `suppressBurstIds` is for cards that already received a same-beat impact
   * burst (usually lethal damage), so removal can fade without double popping.
   */
  animateCardConsumeByIds(
    payload: { cardId: string; type: CardType }[],
    options: { suppressBurstIds?: Set<string> } = {}
  ): Promise<void> {
    if (payload.length === 0) return Promise.resolve()
    const animations: Promise<void>[] = []
    for (const { cardId, type } of payload) {
      const elements = [
        ...this.boardElement.querySelectorAll<HTMLElement>(`.cell.card[data-card-id="${cardId}"]`),
      ]
      if (elements.length === 0) continue
      const theme: BurstTheme =
        type === CardType.TREASURE
          ? 'treasure-gain'
          : type === CardType.ENEMY
            ? 'damage'
            : 'vanish-smoke'
      const r1 = elements[0].getBoundingClientRect()
      const r2 = elements[elements.length - 1].getBoundingClientRect()
      // Damage numbers already play the exact hit burst for cards that lost
      // HP this beat. Suppressing only the consume burst keeps the fade-out
      // readable without making a killed enemy explode twice.
      if (!options.suppressBurstIds?.has(cardId)) {
        SquareBurst.playAt((r1.left + r2.right) / 2, (r1.top + r2.bottom) / 2, theme, {
          count: 20,
          spread: 130 + (elements.length - 1) * 30,
          duration: 640,
        })
      }
      animations.push(
        this.animateElements(
          elements,
          type === CardType.ENEMY ? 'is-enemy-defeated-consuming' : 'is-consuming',
          type === CardType.ENEMY ? 560 : 480,
          { persist: true }
        )
      )
    }
    return Promise.all(animations).then(() => undefined)
  }

  /**
   * Bomb detonation beat. TurnManager removed the bomb from the model already,
   * but the DOM still shows it (next render is later in the turn). So we can
   * still find the bomb element, shake it with the adjacent cells, fire a
   * bomb-blast SquareBurst on the fuse origin, and only then let the rail
   * regroup. Adjacent enemies that took splash damage shake along with the
   * bomb so the blast wave reads visibly through the rail instead of feeling
   * like cards simply popping off.
   */
  animateBombExplosion(explosions: BombExplosion[]): Promise<void> {
    if (explosions.length === 0) return Promise.resolve()
    const promises: Promise<void>[] = []
    for (const explosion of explosions) {
      const bombEl = this.findCardElement(explosion.bombCardId)
      // Surrounding cells (whether they got splash damage or not) rattle along
      // with the bomb so the blast feels physical — but the bomb itself is the
      // only cell that actually fades out from this animation. Damage numbers
      // and consume bursts are still played by the caller.
      const adjacentRattle = new Set<HTMLElement>()
      for (const id of explosion.adjacentCardIds) {
        const el = this.findCardElement(id)
        if (el) adjacentRattle.add(el)
      }
      // Also include lane-only neighbors that weren't enemies — traps/treasures
      // visibly tremble in the blast even though the bomb doesn't delete them.
      for (const lane of [explosion.laneIndex - 1, explosion.laneIndex + 1]) {
        const neighborEl = this.boardElement.querySelector<HTMLElement>(
          `.cell.card.is-active[data-lane="${lane}"]`
        )
        if (neighborEl) adjacentRattle.add(neighborEl)
      }

      for (const el of adjacentRattle) {
        el.classList.add('is-bomb-rattled')
        window.setTimeout(() => el.classList.remove('is-bomb-rattled'), 520)
      }

      if (bombEl) {
        // Bigger spread + the bomb-blast palette so the focal hit reads as the
        // "boom" while neighbour bursts (damage theme) read as the wave.
        SquareBurst.playOn(bombEl, 'bomb-blast', {
          count: 24,
          spread: 200,
          duration: 720,
        })
        bombEl.classList.add('is-bomb-detonating')
        const fade = new Promise<void>((resolve) => {
          window.setTimeout(() => {
            bombEl.classList.remove('is-bomb-detonating')
            // After the initial rattle, fade the bomb cell out so the next
            // render doesn't snap it away — `is-consuming` reuses the unified
            // card-consume fade.
            bombEl.classList.add('is-consuming')
            resolve()
          }, 360)
        })
        promises.push(fade)
      }

      // Tiny secondary bursts on damaged neighbours so the blast wave is
      // visible across the lane group, slightly delayed so it reads as a
      // ripple coming from the fuse origin.
      window.setTimeout(() => {
        for (const id of explosion.adjacentCardIds) {
          const el = this.findCardElement(id)
          if (!el) continue
          SquareBurst.playOn(el, 'damage', { count: 12, spread: 100, duration: 540 })
        }
      }, 140)
    }
    // Resolve once the bomb fade beat has played; total ~520ms.
    return Promise.all(promises).then(
      () => new Promise<void>((resolve) => window.setTimeout(resolve, 160))
    )
  }

  /** 불씨 하락으로 필드 적의 공격력이 오르는 위험 연출.
   *  각 적 카드가 붉게 빛나며 살짝 확대되고, 상승 스탯이 잔상을 남기며 커졌다 가라앉는다.
   *  불씨가 줄어드는 순간 필드 전체가 강해지는 위협감을 전달한다. */
  async animateEnemyEmberEmpower(enemyIds: string[]): Promise<void> {
    const elements: HTMLElement[] = []
    for (const id of enemyIds) {
      const el = this.findCardElement(id)
      if (!el) continue
      elements.push(el)
      // 공격력 칩에 잔상 확대 클래스를 걸어 수치가 커지는 느낌을 강조한다.
      const atkChip = el.querySelector<HTMLElement>('.stat.atk')
      if (atkChip) {
        atkChip.classList.remove('is-ember-empowering')
        void atkChip.offsetWidth
        atkChip.classList.add('is-ember-empowering')
        window.setTimeout(() => atkChip.classList.remove('is-ember-empowering'), 760)
      }
      // 붉은 불씨 톤 사각 블라스트로 강화 순간을 친다.
      SquareBurst.playOn(el, 'damage', { count: 12, spread: 90, duration: 480 })
    }
    return this.animateElements(elements, 'is-ember-empowering', 760)
  }

  /**
   * 비대화 — 90F 조각사가 양초 조각에 밀랍을 덧발라 부풀리는 순간.
   * 광폭화(붉은 잔상 + 공격력 강조)와 **다른 어휘**로 읽혀야 하므로, 붉게 달구지 않고
   * 몸집이 커지는 쪽으로만 친다: 체력 칩을 강조하고 밀랍 톤 버스트를 쓴다.
   */
  async animateEnemySwell(enemyIds: string[]): Promise<void> {
    const elements: HTMLElement[] = []
    for (const id of enemyIds) {
      const el = this.findCardElement(id)
      if (!el) continue
      elements.push(el)
      const hpChip = el.querySelector<HTMLElement>('.stat.hp')
      if (hpChip) {
        hpChip.classList.remove('is-swelling')
        void hpChip.offsetWidth
        hpChip.classList.add('is-swelling')
        window.setTimeout(() => hpChip.classList.remove('is-swelling'), 760)
      }
      SquareBurst.playOn(el, 'boss-wax-drip', { count: 14, spread: 96, duration: 520 })
    }
    return this.animateElements(elements, 'is-swelling', 760)
  }

  /** Seed bloom beat: color-matched square burst and a quick growing flower pop. */
  async animateFlowerBlooms(blooms: FlowerBloom[]): Promise<void> {
    const elements: HTMLElement[] = []
    for (const bloom of blooms) {
      const element = this.findCardElement(bloom.cardId)
      if (!element) continue
      elements.push(element)
      SquareBurst.playOn(element, this.flowerBurstTheme(bloom.flowerKind), {
        count: 22,
        spread: 120,
      })
    }
    return this.animateElements(elements, 'is-flower-blooming', 560)
  }

  /** Flower growth feedback scales via CSS using the current harvest value. */
  async animateFlowerGrowth(growths: FlowerGrowth[]): Promise<void> {
    const grownElements: HTMLElement[] = []
    const progressElements: HTMLElement[] = []
    for (const growth of growths) {
      const element = this.findCardElement(growth.cardId)
      if (!element) continue
      element.style.setProperty(
        '--flower-growth-scale',
        String(Math.min(1.8, 1 + growth.value * 0.08))
      )
      if (growth.phase === 'progress') {
        // Marigold's odd turn gets a small anticipatory glint, not the full
        // reward-increase burst used when the value actually rises.
        progressElements.push(element)
        SquareBurst.playOn(element, this.flowerBurstTheme(growth.flowerKind), {
          count: 8,
          spread: 62,
          duration: 420,
        })
      } else {
        grownElements.push(element)
        SquareBurst.playOn(element, this.flowerBurstTheme(growth.flowerKind), {
          count: Math.min(30, 10 + growth.value * 3),
          spread: Math.min(170, 78 + growth.value * 12),
        })
      }
    }
    await Promise.all([
      this.animateElements(grownElements, 'is-flower-growing', 520),
      this.animateElements(progressElements, 'is-flower-progressing', 420),
    ])
  }

  /** Wilting uses a grey-green burst on the flower cell before the monster art appears. */
  async animateFlowerWilts(wilts: FlowerWilt[]): Promise<void> {
    const elements: HTMLElement[] = []
    for (const wilt of wilts) {
      const element = this.findCardElement(wilt.monsterCardId) ?? this.findCardElement(wilt.cardId)
      if (!element) continue
      elements.push(element)
      SquareBurst.playOn(element, 'flower-wilt', { count: 24, spread: 135 })
    }
    return this.animateElements(elements, 'is-flower-wilting', 620)
  }

  /**
   * Treasure volatility mutates the model before the next render, but the old
   * DOM is still present. Use that old DOM to show dust and fading first.
   *
   * Both 'disappeared' and 'mimic' outcomes also fire a SquareBurst on the
   * affected cell — smoke for vanish, oxblood→moss for mimic — so the unified
   * effect language reads at every state change.
   */
  animateTreasureChanges(changes: TreasureChange[]): Promise<void> {
    const elements = new Set<HTMLElement>()
    for (const change of changes) {
      const selector =
        `.cell.card.type-treasure[data-lane="${change.laneIndex}"]` +
        `[data-distance="${change.distance}"]`
      const element = this.boardElement.querySelector<HTMLElement>(selector)
      if (!element) continue
      if (change.outcome === 'disappeared') {
        elements.add(element)
        SquareBurst.playOn(element, 'vanish-smoke', { count: 18, spread: 110 })
      } else if (change.outcome === 'mimic') {
        SquareBurst.playOn(element, 'mimic-shift', { count: 20, spread: 130 })
      }
    }
    return this.animateElements([...elements], 'is-treasure-vanishing', 520, { persist: true })
  }

  /** Capture current card positions so the next render can FLIP-move survivors. */
  private captureCardRects(): Map<string, DOMRect> {
    const rects = new Map<string, DOMRect>()
    this.boardElement.querySelectorAll<HTMLElement>('.cell.card[data-card-id]').forEach((el) => {
      const id = el.dataset.cardId
      if (id) rects.set(id, el.getBoundingClientRect())
    })
    return rects
  }

  /** Capture hand-card slot positions keyed by hand-uid for FLIP movement. */
  private captureHandRects(): Map<string, DOMRect> {
    const rects = new Map<string, DOMRect>()
    this.boardElement.querySelectorAll<HTMLElement>('.hand-slot[data-hand-uid]').forEach((el) => {
      const uid = el.dataset.handUid
      if (uid) rects.set(uid, el.getBoundingClientRect())
    })
    return rects
  }

  /** Per-render pass that aligns every freshly-entering hand slot with the
   *  resource-trail spawn point. The trail target (findResourceTrailTarget
   *  for 'hand') is `stackTop + 22`, so each new slot starts at exactly that
   *  screen Y and falls down to its real slot position. Without this, the
   *  CSS keyframe used a generic -640px fallback so cards visibly slid in
   *  from off-screen, disconnected from the burst that landed under the
   *  combo gauge. The trail flight time is also folded into the animation
   *  delay so each card materializes the instant its trail lands. */
  private alignNewHandSlotsWithTrailSpawn(): void {
    const handStack = this.boardElement.querySelector<HTMLElement>('.hand-stack')
    const enteringSlots = this.boardElement.querySelectorAll<HTMLElement>(
      '.hand-slot.hand-card.is-entering'
    )
    if (!handStack || enteringSlots.length === 0) return
    const stackRect = handStack.getBoundingClientRect()
    // Match the spawn Y used by findResourceTrailTarget('hand'): a tiny nudge
    // below the combo gauge so the first visible card peeks out at the top.
    const spawnY = stackRect.top + 22
    // ★ 슬롯이 뜨는 시각은 **카드 토큰이 손패에 닿는 시각**과 같아야 한다. 예전 자원 트레일의
    //   330ms를 그대로 두고 있어, 토큰이 아직 날아오는 중에 카드가 먼저 자리에 앉았다.
    //   등장 간격도 토큰 발사 간격과 같은 값을 써야 장마다 짝이 맞는다.
    const step = handTokenStaggerMs(enteringSlots.length)
    enteringSlots.forEach((el) => {
      const slotRect = el.getBoundingClientRect()
      const offsetY = spawnY - slotRect.top
      el.style.setProperty('--hand-drop-start-y', `${offsetY}px`)
      el.style.setProperty('--hand-drop-delay-ms', String(HAND_TOKEN_LAND_MS))
      el.style.setProperty('--hand-enter-step', String(step))
    })
  }

  /** Smooth hand-card slots from their previous position when the hand is
   *  spliced (a used card creates a hole and the cards above compact down).
   *  Without this the entire hand visibly snapped one slot down whenever a
   *  card was used, which read as a flicker. */
  private animateMovedHandSlots(previousRects: Map<string, DOMRect>): void {
    this.boardElement.querySelectorAll<HTMLElement>('.hand-slot[data-hand-uid]').forEach((el) => {
      const uid = el.dataset.handUid
      if (!uid) return
      const previousRect = previousRects.get(uid)
      if (!previousRect) return
      const nextRect = el.getBoundingClientRect()
      const deltaX = previousRect.left - nextRect.left
      const deltaY = previousRect.top - nextRect.top
      if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) return
      el.animate(
        [
          { transform: `translate3d(${deltaX}px, ${deltaY}px, 0) scale(1, 1)`, opacity: 0.96 },
          { transform: 'translate3d(0, 4px, 0) scale(1.01, 0.982)', opacity: 1, offset: 0.72 },
          { transform: 'translate3d(0, 0, 0) scale(1)', opacity: 1 },
        ],
        { duration: 460, easing: 'cubic-bezier(0.16, 0.92, 0.18, 1)' }
      )
    })
  }

  /**
   * Smooth cards from their previous screen position to their new grid slot.
   * This avoids the previous full rerender flicker when lanes compact downward.
   */
  private animateMovedCards(previousRects: Map<string, DOMRect>): void {
    this.boardElement.querySelectorAll<HTMLElement>('.cell.card[data-card-id]').forEach((el) => {
      const id = el.dataset.cardId
      if (!id) return
      const previousRect = previousRects.get(id)
      if (!previousRect) return
      const nextRect = el.getBoundingClientRect()
      const deltaX = previousRect.left - nextRect.left
      const deltaY = previousRect.top - nextRect.top
      if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) return

      el.animate(
        [
          { transform: `translate(${deltaX}px, ${deltaY}px)`, opacity: 0.94 },
          { transform: 'translate(0, 0)', opacity: 1 },
        ],
        { duration: 360, easing: 'cubic-bezier(0.18, 0.88, 0.22, 1)' }
      )
    })
  }

  /** New merged hand cards get a delayed jelly snap plus the same square/sparkle
   *  language as score gains, so triples are readable before settling into one card. */
  private playNewHandMergeEffects(previousRects: Map<string, DOMRect>): void {
    this.boardElement
      .querySelectorAll<HTMLElement>('.hand-slot.hand-card.is-merged.is-entering')
      .forEach((el) => {
        const uid = el.dataset.handUid
        if (!uid || this.previousHandUids.has(uid)) return

        // Source-aware triple merge: use the exact card rects from the previous
        // render, so the consumed upper cards fly into the lower merged slot.
        // If an old rect is missing (e.g. first render/debug state), CSS vars
        // fall back to a short top-down convergence instead of breaking.
        const sourceUids = (el.dataset.mergeSourceUids ?? '').split('|').filter(Boolean)
        const targetRect = el.getBoundingClientRect()
        const copySources = [sourceUids[1], sourceUids[2]]
        copySources.forEach((sourceUid, copyIndex) => {
          const sourceRect = sourceUid ? previousRects.get(sourceUid) : null
          if (!sourceRect) return
          const dx =
            sourceRect.left + sourceRect.width / 2 - (targetRect.left + targetRect.width / 2)
          const dy =
            sourceRect.top + sourceRect.height / 2 - (targetRect.top + targetRect.height / 2)
          const prefix = copyIndex === 0 ? 'a' : 'b'
          el.style.setProperty(`--merge-copy-${prefix}-dx`, `${dx}px`)
          el.style.setProperty(`--merge-copy-${prefix}-dy`, `${dy}px`)
        })

        // Match the CSS delay: once acquisition has landed, exact-source
        // copies converge immediately, then the merged card compresses and bursts.
        const enterOrder = Number.parseFloat(el.style.getPropertyValue('--hand-enter-order') || '0')
        const burstDelay = 860 + Math.max(0, enterOrder) * 135
        window.setTimeout(() => {
          if (!el.isConnected) return
          el.classList.add('is-merge-bursting')
          SquareBurst.playOn(el, 'score', { count: 22, spread: 92, duration: 660, size: [7, 16] })
          window.setTimeout(() => el.classList.remove('is-merge-bursting'), 760)
        }, burstDelay)
      })
  }


  /**
   * 90F 시련 종료 직후 최종 등반 규칙을 고지하는 전용 화면 연출.
   * 보스 타이틀처럼 화면이 어둡게 잠긴 뒤, 텍스트만 떠오르고 하단 문구가 켜진 후 클릭을 받는다.
   */
  async playFinalAscentRuleAwakening(): Promise<void> {
    const styleId = 'final-ascent-awakening-styles'
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style')
      style.id = styleId
      style.textContent = `
.final-ascent-awakening {
  position: fixed;
  inset: 0;
  z-index: 218;
  pointer-events: auto;
  overflow: hidden;
  display: grid;
  place-items: center;
  background:
    radial-gradient(circle at 50% 52%, rgba(79, 61, 146, 0.26), rgba(24, 18, 55, 0.52) 38%, rgba(4, 5, 14, 0.94) 100%),
    linear-gradient(180deg, rgba(8, 12, 31, 0.68), rgba(3, 3, 10, 0.98));
  cursor: default;
  animation: final-ascent-nightfall 1180ms cubic-bezier(0.18, 0.86, 0.2, 1) both;
}
.final-ascent-awakening.is-ready { cursor: pointer; }
.final-ascent-awakening.is-closing { animation: final-ascent-fade-out 260ms ease-in forwards; }
.final-ascent-awakening::before {
  content: '';
  position: absolute;
  inset: -16%;
  background:
    radial-gradient(circle at 24% 26%, rgba(116, 146, 255, 0.22), transparent 24%),
    radial-gradient(circle at 78% 72%, rgba(172, 94, 236, 0.22), transparent 28%),
    radial-gradient(circle at 52% 58%, rgba(80, 72, 154, 0.34), transparent 42%);
  mix-blend-mode: screen;
  filter: blur(14px);
  opacity: 0;
  animation: final-ascent-veil-bloom 1680ms ease-out forwards;
}
.final-ascent-awakening-copyblock {
  position: relative;
  z-index: 2;
  text-align: center;
  transform: translateY(18px) scale(0.96);
  opacity: 0;
  animation: final-ascent-title-rise 860ms cubic-bezier(0.18, 0.88, 0.2, 1) 760ms forwards;
}
.final-ascent-awakening-title {
  display: block;
  color: #e9e6ff;
  font-size: clamp(34px, 5vw, 70px);
  font-weight: 900;
  letter-spacing: 0.16em;
  text-shadow:
    0 0 26px rgba(121, 139, 255, 0.64),
    0 0 42px rgba(147, 82, 220, 0.42),
    0 3px 3px rgba(0, 0, 0, 0.92);
}
.final-ascent-awakening-copy {
  display: block;
  margin-top: 14px;
  color: rgba(205, 198, 238, 0.88);
  font-size: clamp(15px, 1.65vw, 22px);
  font-weight: 800;
  letter-spacing: 0.08em;
  text-shadow: 0 0 18px rgba(112, 126, 255, 0.36), 0 2px 2px rgba(0, 0, 0, 0.9);
}
.final-ascent-awakening-hint {
  position: fixed;
  left: 50%;
  bottom: clamp(28px, 6vh, 56px);
  transform: translateX(-50%);
  z-index: 3;
  color: rgba(220, 220, 238, 0.78);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.32em;
  text-shadow: 0 1px 0 rgba(0, 0, 0, 0.86), 0 0 12px rgba(117, 132, 255, 0.34);
  opacity: 0;
  pointer-events: none;
}
.final-ascent-awakening.is-ready .final-ascent-awakening-hint {
  animation: final-ascent-hint-pulse 2.2s ease-in-out infinite;
}
.final-ascent-star {
  position: absolute;
  left: var(--star-x);
  top: var(--star-y);
  width: var(--star-size);
  height: var(--star-size);
  background: rgba(207, 213, 255, 0.88);
  border-radius: 50%;
  box-shadow: 0 0 12px rgba(133, 148, 255, 0.68), 0 0 24px rgba(165, 94, 236, 0.34);
  opacity: 0;
  animation: final-ascent-star-fall var(--star-dur) ease-out var(--star-delay) forwards;
}
@keyframes final-ascent-nightfall {
  0% { opacity: 0; filter: brightness(1.08) saturate(0.85); }
  48% { opacity: 1; filter: brightness(0.78) saturate(1.08); }
  100% { opacity: 1; filter: brightness(0.64) saturate(1.15); }
}
@keyframes final-ascent-fade-out {
  from { opacity: 1; }
  to { opacity: 0; }
}
@keyframes final-ascent-veil-bloom {
  0% { opacity: 0; transform: scale(0.96) rotate(0deg); }
  42% { opacity: 0.94; }
  100% { opacity: 0.62; transform: scale(1.08) rotate(3deg); }
}
@keyframes final-ascent-title-rise {
  0% { opacity: 0; transform: translateY(22px) scale(0.95); filter: blur(2px); }
  100% { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
}
@keyframes final-ascent-hint-pulse {
  0%, 100% { opacity: 0.32; }
  50% { opacity: 0.96; }
}
@keyframes final-ascent-star-fall {
  0% { opacity: 0; transform: translate3d(0, -18px, 0) scale(0.65); }
  18% { opacity: 0.9; }
  100% { opacity: 0; transform: translate3d(var(--star-drift), 118vh, 0) scale(0.35); }
}
      `
      document.head.appendChild(style)
    }

    document.querySelector('.final-ascent-awakening')?.remove()
    const overlay = document.createElement('div')
    overlay.className = 'final-ascent-awakening'
    overlay.setAttribute('aria-live', 'polite')
    overlay.innerHTML = `
      <div class="final-ascent-awakening-copyblock">
        <span class="final-ascent-awakening-title">잿빛 굴레</span>
        <span class="final-ascent-awakening-copy">- 별빛으로 굴레를 벗어나리 -</span>
      </div>
      <div class="final-ascent-awakening-hint" aria-hidden="true">CLICK ANYWHERE TO CONTINUE</div>
    `

    // 별빛 입자는 고정 개수만 생성해 보스 인트로급 화면 효과를 유지하면서 비용을 제한한다.
    for (let i = 0; i < 42; i++) {
      const star = document.createElement('span')
      star.className = 'final-ascent-star'
      star.style.setProperty('--star-x', `${Math.random() * 100}%`)
      star.style.setProperty('--star-y', `${-12 + Math.random() * 44}%`)
      star.style.setProperty('--star-size', `${2 + Math.random() * 5}px`)
      star.style.setProperty('--star-drift', `${-80 + Math.random() * 160}px`)
      star.style.setProperty('--star-dur', `${1260 + Math.random() * 780}ms`)
      star.style.setProperty('--star-delay', `${Math.random() * 580}ms`)
      overlay.appendChild(star)
    }

    document.body.appendChild(overlay)
    const cx = window.innerWidth / 2
    const cy = window.innerHeight * 0.54
    SquareBurst.playAt(cx, cy, 'vanish-smoke', { count: 30, spread: 330, duration: 1120, size: [7, 18] })
    SquareBurst.playAt(cx, cy, 'hand-control', { count: 24, spread: 250, duration: 980, size: [6, 16] })

    await new Promise((resolve) => window.setTimeout(resolve, 1900))
    overlay.classList.add('is-ready')
    await new Promise<void>((resolve) => {
      const close = (): void => {
        overlay.classList.add('is-closing')
        window.setTimeout(() => {
          overlay.remove()
          resolve()
        }, 260)
      }
      overlay.addEventListener('click', close, { once: true })
    })
  }

  /** 이 카드가 아직 낙하 연출 중인가 — 처음 보이면 만료 시각을 새로 찍고, 그 뒤로는
   *  남은 시간 동안 계속 true다(렌더가 여러 번 돌아도 연출이 끊기지 않는다). */
  private isCardEntering(cardId: string): boolean {
    if (!this.hasRendered) return false
    if (!this.previousCardIds.has(cardId)) {
      this.cardEnterUntil.set(cardId, Date.now() + CARD_ENTER_MS)
      return true
    }
    return (this.cardEnterUntil.get(cardId) ?? 0) > Date.now()
  }

  /** Remember ids and spans after each render for enter/merge animations. */
  private rememberRenderedCards(): void {
    const ids = new Set<string>()
    const spans = new Map<string, number>()
    this.boardElement.querySelectorAll<HTMLElement>('.cell.card[data-card-id]').forEach((el) => {
      const id = el.dataset.cardId
      if (!id) return
      ids.add(id)
      spans.set(id, parseInt(el.dataset.span || '1', 10))
    })
    this.previousCardIds = ids
    this.previousGroupSpans = spans
    // 사라진 필드 카드의 만료-표시 캐시를 정리해 맵이 무한정 커지지 않게 한다.
    for (const cachedId of this.fieldExpiryLastShown.keys()) {
      if (!ids.has(cachedId)) this.fieldExpiryLastShown.delete(cachedId)
    }
    // 낙하 연출 만료표도 같이 턴다(사라진 카드 + 이미 끝난 연출).
    const now = Date.now()
    for (const [cachedId, until] of this.cardEnterUntil) {
      if (!ids.has(cachedId) || until <= now) this.cardEnterUntil.delete(cachedId)
    }
    // Mirror the same snapshot pattern for hand cards.
    const handUids = new Set<string>()
    this.boardElement.querySelectorAll<HTMLElement>('.hand-slot[data-hand-uid]').forEach((el) => {
      const uid = el.dataset.handUid
      if (uid) handUids.add(uid)
    })
    this.previousHandUids = handUids
    this.hasRendered = true
  }

  /** Newly larger spans get a short sticky merge pulse after movement settles. */
  private shouldAnimateGroup(cardId: string, span: number): boolean {
    if (!this.hasRendered || span <= 1) return false
    const previousSpan = this.previousGroupSpans.get(cardId) || 1
    return span > previousSpan
  }

  /** Add a temporary animation class to all rendered elements for one card. */
  private animateCardElements(card: Card, className: string, duration: number): Promise<void> {
    const elements = [...this.boardElement.querySelectorAll<HTMLElement>('.cell.card')].filter(
      (el) => el.dataset.cardId === card.id
    )
    return this.animateElements(elements, className, duration)
  }

  /** Shared class-based animation helper with cleanup after the CSS finishes. */
  /**
   * Add an animation class to a set of elements and resolve after `duration`.
   *
   * `persist: true` keeps the class applied after the timeout. This matters
   * for "fade-out" classes (`is-consuming`, `is-treasure-vanishing`,
   * `is-bomb-detonating`) — the cards they target are about to be dropped
   * by the next render(), and if we remove the class before that render
   * runs, the card would snap back to full opacity for a frame, which the
   * player reads as a flicker.
   */
  private animateElements(
    elements: HTMLElement[],
    className: string,
    duration: number,
    options: { persist?: boolean } = {}
  ): Promise<void> {
    if (elements.length === 0) return Promise.resolve()
    elements.forEach((el) => {
      el.classList.remove(className)
      void el.offsetWidth
      el.classList.add(className)
    })
    return new Promise((resolve) => {
      window.setTimeout(() => {
        if (!options.persist) {
          elements.forEach((el) => el.classList.remove(className))
        }
        resolve()
      }, duration)
    })
  }

  private injectStyles(): void {
    if (document.getElementById('game-board-styles')) return
    const style = document.createElement('style')
    style.id = 'game-board-styles'
    style.textContent = GAME_BOARD_STYLES
    document.head.appendChild(style)
  }

}
