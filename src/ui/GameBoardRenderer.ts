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
import { Card, CardType, flowerDisplayName, type FlowerKind } from '@entities/Card'
import { Lane, LANE_DISTANCE_COUNT } from '@entities/Lane'
import type {
  BombExplosion,
  EnemyHit,
  FlowerBloom,
  FlowerGrowth,
  FlowerWilt,
  TreasureChange,
} from '@core/TurnManager'
import { spriteForCard, spriteForHandCard, spriteForRelic, spriteForBasicPackItem, spriteForJob, spriteForEvent, SpriteUrls, recipeSprite001 } from '@ui/Sprites'
import type { EventDefinition } from '@data/Events'
import { CandleMode, Character } from '@entities/Character'
import { HandCardId, HandCategory, HandEffectTargeting } from '@entities/HandCard'
import { getHandCardDef } from '@data/HandCards'
import type { EmberTier, SpawnWeights } from '@systems/EmberSystem'
import { EmberSystem } from '@systems/EmberSystem'
import { ENEMY_DEFINITIONS, MIMIC_BY_SPAN } from '@systems/CardSpawner'
import { HAND_CARD_DEFINITIONS, HAND_CARD_IDS } from '@data/HandCards'
import { getRelicDef, RELIC_DEFINITIONS, type RelicId } from '@data/Relics'
import { HAND_CARD_RARITY, RARITY_CLASS_BY_TIER, SHOP_PACK_LABELS, SHOP_PACK_POOLS, type CardRarity } from '@data/ShopPools'
import { RECIPES, type Recipe } from '@data/Recipes'
import type { JobDef } from '@data/Jobs'
import { SquareBurst, type BurstTheme } from '@ui/SquareBurst'
import { GAME_BOARD_STYLES } from '@ui/styles/GameBoardStyles'
import { initTouchBody, attachHandCardTouch, attachShopTouchHighlight, initLongPressShiftDetail } from '@ui/MobileTouchManager'
import {
  bookIcon,
  candleIcon,
  flameIcon,
  heartIcon,
  pouchIcon,
  shieldIcon,
  sparkleIcon,
  swordIcon,
} from '@ui/Icons'
import { atkDmgHtml, hpDmgHtml, rangeDmgHtml } from '@ui/DamageDisplay'

export interface CardActionDetail {
  laneIndex: number
  distance: number
  card: Card
}

export interface ItemActionDetail {
  itemIndex: number
  shiftKey?: boolean
}

export type ShopPackKind = 'basic-pack' | 'recipe-pack' | 'unlock-pack' | 'chance-pack' | 'resource-pack' | 'delete-pack'

export interface ShopBuyDetail {
  kind: 'relic' | 'free-card' | 'free-coin-card' | 'reroll' | ShopPackKind
  relicId?: RelicId
}

export interface ShopPackPickDetail {
  packKind: ShopPackKind
  itemId: string
}

export interface ShopOfferView {
  relicId: RelicId
  /** Per-spawn score price (mid-3-digit, with small jitter "inflation"
   *  so the displayed cost reads as 872 / 1183 / 491 etc rather than
   *  round numbers). Computed once when the shop is rolled. */
  price: number
  purchased?: boolean
}
/** One option that pops out when a pack is torn open. */
export interface ShopPackItemView {
  /** Stable id within this picker session — echoed back via shopPackPick. */
  id: string
  title: string
  /** Effect line ("체력 +2", "공격력 +1" 등). */
  effect: string
  /** Theme tints the card frame: resource(자원)/upgrade(강화)/unlock(해금). */
  theme: 'resource' | 'upgrade' | 'unlock'
  rarity: CardRarity
  /** 카드별 개별 일러스트 URL. 없으면 팩 커버 이미지를 fallback으로 사용한다. */
  spriteUrl?: string
  /** 카드 상단 타입 배지 (트리플/레시피/손패/단일/삭제 등). */
  typeLabel?: string
  /** 레시피 재료 n+n 표기. 레시피 관련 아이템에만 설정한다. */
  recipeNote?: string
}
export interface ShopPackPickerView {
  packKind: ShopPackKind
  title: string
  items: ShopPackItemView[]
  /** 넘기기 버튼 표시 여부 (delete-pack / unlock-pack). */
  passable?: boolean
  /** 재뽑기 버튼의 화폐 비용. 없으면 버튼을 숨긴다. */
  rerollCost?: number
  /** 현재 보유 화폐 (재뽑기 버튼 활성화 판정에 사용). */
  coins?: number
}
export interface ShopStateView {
  /** Normal 10/20/... shop vs 30/60/... altar variant. */
  mode: 'shop' | 'altar'
  relicOffers: ShopOfferView[]
  freeCardClaimed: boolean
  freeCoinCardClaimed?: boolean
  /** 선물 상자 랜덤 결과 문구(예: ✦300 / 1$). */
  freeCardDescription?: string
  /** Reroll cost is paid from coins (화폐, $), not score (불빛). */
  rerollCost: number
  /** Current coin balance — used to compute reroll-button affordability. */
  coins: number
  basicPackCost: number
  /** 제단 4팩처럼 기본 3팩과 매핑이 다른 경우에도 각 팩 가격을 독립 갱신한다. */
  packCosts?: Partial<Record<ShopPackKind, number>>
}
export interface ForcedTrialCardView {
  id: string
  title: string
  effect: string
  /** 시련 카드 일러스트 URL. 일러스트 미준비 시 호출부가 임시 sprite를 넘긴다. */
  spriteUrl: string
}

export interface ActivityLogEntry {
  id: number
  label: string
  scoreDelta?: number
  itemCount?: number
  badge?: string
  kind:
    | 'enemy'
    | 'treasure'
    | 'trap'
    | 'item'
    | 'item-gain'
    | 'score'
    | 'notice'
    | 'win'
    | 'hurt'
    | 'melt'
    | 'gauge'
    | 'relic'
}

export interface HandTargetingMode {
  slotIndex: number
  defId: HandCardId
  /** 합체(트리플) 카드 여부 — 타겟 하이라이트가 base/triple 규칙을 올바로 고르게 한다. */
  merged?: boolean
}

export interface ChainEventBase {
  /** Stable per-event id so the renderer can detect new entries and pop-in
   *  the right one without re-firing the animation on every render. */
  uid: string
}
export interface ChainEventCard extends ChainEventBase {
  kind: 'card'
  defId: HandCardId
  name: string
  category: HandCategory
}
export interface ChainEventRecipe extends ChainEventBase {
  kind: 'recipe'
  recipeId: string
  name: string
  flavor: string
}
export interface ChainEventGauge extends ChainEventBase {
  kind: 'gauge'
  mode: CandleMode
  name: string
  flavor: string
}
export interface ChainEventRelic extends ChainEventBase {
  kind: 'relic'
  relicId: RelicId
  name: string
  flavor: string
}
export type ChainEvent = ChainEventCard | ChainEventRecipe | ChainEventGauge | ChainEventRelic

export interface ChainHints {
  events: ChainEvent[]
  /** Slots whose next click would immediately satisfy at least one recipe. */
  recipeReadyBySlot?: Record<number, { id: string; name: string; flavor: string }[]>
  /** 악마 소환 레시피가 체인에 포함됨 — 배너 최좌측 대형 붉은 다이아몬드로 이벤트 체인을 별도 표시. */
  demonPending?: boolean
  /** 악마 소환 임팩트 연출 — 체인 배너를 거대하게/중앙에/X 없이/불타듯 표시. */
  demonImpactMode?: boolean
}

export type ResourceTrailTarget =
  | 'hand'
  | 'score'
  | 'coin'
  | 'health'
  | 'shield'
  | 'ember'
  | 'gauge'
  | 'attack'
  | 'relic'

/** 실제 스폰 가중치 원시값 — 렌더러에서 % 변화량 계산에 사용한다. */
export interface SpawnWeightContext {
  enemy: number
  trap: number
  treasure: number
  flower: number
  total: number
}

export interface ScorePanelState {
  score: number
  logs: ActivityLogEntry[]
  scorePulseKey: number
  coins: number
  coinPulseKey: number
  emberTier?: EmberTier
  spawnWeights?: SpawnWeights
  /** 렌더러가 실제 % 표시와 유물 효과 텍스트 치환에 사용하는 실효 가중치. */
  spawnWeightContext?: SpawnWeightContext
  /** 가중치 기반으로 정규화된 0-100 실효 확률. */
  spawnPercents?: { enemy: number; trap: number; treasure: number; flower: number }
  emberDecayCountdown?: number
  vignetteIntensity?: number
  chainHints?: ChainHints
  pendingHandTarget?: HandTargetingMode | null
}

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

export class GameBoardRenderer {
  private boardElement: HTMLElement
  private selected: { laneIndex: number; distance: number } | null = null
  private currentGameState: GameState | null = null
  /** 현재 런에서 잠긴 손패 카드 ID 집합. 도감에서 해금 여부 표시에 사용한다. */
  private lockedCardIds = new Set<HandCardId>()
  /** 현재 런에서 잠긴 레시피 ID 집합. 해금팩으로 해금 전까지 도감에서 ??? 로 표시한다. */
  private lockedRecipeIds = new Set<string>()
  private hasRendered = false
  private previousCardIds = new Set<string>()
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
  private handTargetingMode: HandTargetingMode | null = null
  /** Body-level shop overlay is kept outside board re-renders. */
  private shopOverlayElement: HTMLElement | null = null
  /** Hold-to-peek button — shows during shop/altar/trial; fades overlay on hold. */
  private shopPeekButton: HTMLElement | null = null
  /** 악마 소환 레시피 발동 시 레일 위에 겹치는 커튼 오버레이. */
  private demonCurtainOverlay: HTMLElement | null = null
  /** 현재 열린 상점 모드. 제단(altar) 유물은 무료라 가격 기반 affordable 판정을 건너뛴다. */
  private currentShopRenderMode: 'shop' | 'altar' = 'shop'
  /** Source rect for a just-bought shop relic; the next render uses it to
   *  fly a full artifact card into the owned fan instead of popping in. */
  private pendingRelicArrival: { relicId: RelicId; rect: DOMRect } | null = null
  /** 제단 유물 픽 순간 캡처한 rect — resolveAltarRelicPick이 채우고
   *  prepareRelicArrivalFromShop이 소비한다(애니메이션 진행 중 DOM 이동 보정). */
  private altarPickedRelicRect: { relicId: RelicId; rect: DOMRect } | null = null
  /** True while the shop shutter must survive full board re-renders. Purchase
   *  refreshes rebuild the rail DOM, so the shutter state lives in the renderer
   *  instead of only in the transient `.rail-shutter` element. */
  private shopShutterLocked = false
  /** 셔터가 닫힌 시점의 패널 HTML 스냅샷. render() 재호출 시 lanes가 변해도
   *  (보스 보상 3-wide 등) 셔터 모양이 변형되지 않도록 최초 레이아웃을 고정한다. */
  private shopShutterSnapshot: string | null = null
  /** Resize/scroll listener that keeps the shop shell anchored over the
   *  rail. Stored so we can remove it cleanly on shop close. */
  private shopResizeListener: (() => void) | null = null
  /** Owned relic cards can be click-pinned for reading long text without
   *  requiring the mouse to stay perfectly over the fanned card. */
  private pinnedRelicId: RelicId | null = null
  /** Index of the hand slot currently under the cursor; null when no slot is hovered.
   *  Tracked via delegation so renders can restore the preview without relying on CSS :hover. */
  private hoveredHandSlotIndex: number | null = null
  /** 유물 효과 텍스트 {{spawn}} 치환에 쓰는 현재 실효 스폰 가중치. render() 마다 갱신. */
  private currentSpawnWeightCtx: SpawnWeightContext | undefined = undefined

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
        detail: { itemIndex, shiftKey: e.shiftKey },
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
        this.boardElement
          .querySelector<HTMLElement>(`.hand-slot[data-slot-index="${this.hoveredHandSlotIndex}"]`)
          ?.classList.remove('is-preview-open')
      }
      this.hoveredHandSlotIndex = idx >= 0 ? idx : null
      // is-preview-open은 여기서 추가하지 않는다 — :hover CSS가 첫 플립을 자연스럽게 처리
    }, { passive: true })

    this.boardElement.addEventListener('mouseleave', () => {
      if (this.hoveredHandSlotIndex !== null) {
        this.boardElement
          .querySelector<HTMLElement>(`.hand-slot[data-slot-index="${this.hoveredHandSlotIndex}"]`)
          ?.classList.remove('is-preview-open')
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
    const previousRects = this.captureCardRects()
    const previousHandRects = this.captureHandRects()
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
          <section class="rail ${this.shopShutterLocked ? 'is-shop-shuttered' : ''}" aria-label="Card rail">
            ${this.renderRail(lanes)}
            ${this.shopShutterLocked ? this.renderShopShutter(true, lanes) : ''}
          </section>

          ${this.renderPlayerZone(character)}
        </main>

        ${newHandHtml}
      </div>
    `

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

    // DOM이 교체된 경우에만 hover 미리보기 클래스를 복원한다.
    // 기존 DOM이 그대로 재사용됐다면 :hover와 is-preview-open 모두 유지되므로 불필요하다.
    if (!handDomPreserved) {
      this.restoreHandHoverState()
    }

    this.syncBodyVignette(scorePanel.vignetteIntensity ?? 0)
    this.injectStyles()
    this.attachListeners()
    // When the shop is open, the shutter must keep matching the rail's real
    // perspective-scaled cells even after full re-renders (purchase refresh etc.).
    this.syncShopShutterToRailCells()
    this.animateRenderedResourceCounters()
    this.alignNewHandSlotsWithTrailSpawn()
    this.animateMovedCards(previousRects)
    this.animateMovedHandSlots(previousHandRects)
    this.playNewHandMergeEffects(previousHandRects)
    this.rememberRenderedCards()
    // Floating chain banner (body-mounted, above the player profile).
    this.updateChainBanner(scorePanel.chainHints)
  }

  /** 적 선공 활성 여부. render() 시작에서 불씨 티어로 갱신하고, renderCardFace가 적 카드
   *  우상단에 '선공' 딱지를 붙일지 판단하는 데 쓴다. */
  private firstStrikeActive = false

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
          <section class="score-log-list" aria-label="Action history">
            ${logs}
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

  private renderRail(lanes: Lane[]): string {
    const rows: string[] = []
    for (let distance = LANE_DISTANCE_COUNT - 1; distance >= 0; distance--) {
      rows.push(this.renderRow(lanes, distance))
    }
    return rows.join('')
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
      this.hasRendered && !this.previousCardIds.has(card.id) ? 'is-entering' : '',
      this.shouldAnimateGroup(card.id, span) ? 'is-newly-grouped' : '',
      card.isFrozen() ? 'is-frozen' : '',
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
        ${this.renderCardFace(card, span)}
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
    return this.isValidTargetRule(rule, card, distance)
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

  private renderCardFace(card: Card, span: number): string {
    // 보스 face(BOSS 태그/이름/HP 바/ATK 칩/좌상단 N턴 뱃지)는 모든 보스 공통 그라마.
    // 3x3 확장 같은 "사이즈 유형"은 specialEnemyKind 마커로 CSS에서만 분기된다.
    if (card.type === CardType.BOSS) {
      return this.renderBossFace(card)
    }
    // 위 분기에서 BOSS는 이미 renderBossFace로 우회 처리됐으므로 여기는 ENEMY만 검사.
    let stats = ''
    if (card.type === CardType.ENEMY) {
      stats = `
        <div class="card-stats">
          <span class="stat hp">${heartIcon()}<span class="stat-value">${card.getHealth()}</span></span>
          <span class="stat atk">${swordIcon()}<span class="stat-value">${card.getDamage()}</span></span>
        </div>
      `
    } else if (card.type === CardType.TRAP) {
      // 모든 함정(거미줄/포자/폭탄, 2·3칸 포함)을 한 종류로 묶어 검+단일 피해 수치로
      // 표기한다. effectiveTrapDamage(card 자체 보너스=시련) + character.trapDamageBonus(유물)
      // 를 합산해 실제 ActionSystem과 동일한 최종 수치를 표기한다.
      const charTrapBonus = this.currentGameState?.getCharacter().trapDamageBonus ?? 0
      const damage = card.effectiveTrapDamage() + charTrapBonus
      stats = `
        <div class="card-stats">
          <span class="stat atk">${swordIcon()}<span class="stat-value">${damage}</span></span>
        </div>
      `
    } else if (card.type === CardType.FLOWER) {
      // Seeds wait to bloom; all grown flowers show current harvest value.
      const label = card.flowerKind === 'seed' ? '대기' : `+${card.flowerValue}`
      stats = `<div class="card-stats group-note flower-note">${sparkleIcon()}<span>${label}</span></div>`
    } else if (card.type === CardType.TREASURE && card.treasureKind === 'starlight') {
      // 90~100층 별빛은 손패 보상이 아닌 턴 열쇠임을 카드 자체에서 즉시 읽히게 한다.
      stats = `<div class="card-stats group-note treasure-group-note starlight-note">${sparkleIcon()}<span>턴 +1</span></div>`
    } else if (card.type === CardType.TREASURE) {
      // 일반·황금 상자 모두 1/2/3칸 동일하게 실제 드롭 수를 라벨로 표시한다(보스 보상은 효과 설명).
      const safeSpan = Math.min(3, Math.max(1, card.groupCount))
      let dropCount: number
      if (card.treasureKind === 'goldenChest') {
        dropCount = [3, 8, 15][safeSpan - 1]
      } else {
        dropCount = ({ 1: 1, 2: 3, 3: 5 } as Record<number, number>)[safeSpan] ?? safeSpan
      }
      const treasureNote = card.id.startsWith('boss-reward-')
        ? escapeHtml(card.description)
        : `손패 ${dropCount}장`
      stats = `<div class="card-stats group-note treasure-group-note">${sparkleIcon()}<span>${treasureNote}</span></div>`
    }

    const groupBadge = span > 1 ? `<div class="group-badge">×${span}</div>` : ''
    // 선공 딱지: 선공 활성 시 적/특수적/보스 소환적(모두 CardType.ENEMY) 우상단에 붙는다.
    const firstStrikeBadge = this.firstStrikeActive && card.type === CardType.ENEMY
      ? `<div class="first-strike-card-badge" aria-label="선공: 이 적이 먼저 공격합니다">선공</div>`
      : ''
    const frozenBadge = card.isFrozen()
      ? `<div class="frozen-badge">굳음 ${card.frozenTurns}</div>`
      : ''
    const trapBadge =
      card.type === CardType.TRAP && card.trapKind === 'bomb' && card.isBombArmed
        ? `<div class="frozen-badge bomb-badge">점화</div>`
        : card.type === CardType.TRAP && card.trapKind === 'spore'
          ? `<div class="frozen-badge spore-badge">번식 ${card.sporeTurnsUntilSpread}턴</div>`
          : ''
    // 꽃 성장 뱃지: 씨앗 제외, 다음 성장까지 남은 턴수를 포자 배지와 동일 방식으로 표시한다.
    const flowerGrowthBadge = card.type === CardType.FLOWER && card.flowerKind !== 'seed'
      ? `<div class="frozen-badge flower-growth-badge">성장 ${card.flowerKind === 'marigold' && card.flowerTurnsAlive % 2 === 1 ? 1 : card.flowerKind === 'marigold' ? 2 : 1}턴</div>`
      : ''
    // 이벤트 문 카운트다운 뱃지: 전방 도달(-1→2) 후에만 표시(대기행에서는 미부착). 흑백 톤.
    const eventBadge = card.type === CardType.EVENT && card.eventTurnsUntilClose >= 0
      ? `<div class="event-badge">${card.eventTurnsUntilClose}턴</div>`
      : ''

    // 보스 보상 카드는 3-wide span이어도 카드 자체 이름을 그대로 표시한다.
    // 함정은 합쳐질 때 Card가 도감과 동일한 이름(촛농 거미집/밀랍 거미굴, 번식 포자군/
    // 포자 군락)을 이미 갖고 있으므로 일반 라벨로 덮지 않고 card.name을 그대로 쓴다.
    const groupName = span > 1 && !card.isSpecialEnemy && card.type !== CardType.TRAP &&
      card.treasureKind !== 'starlight' && !card.id.startsWith('boss-reward-')
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
  private renderBossFace(card: Card): string {
    const sprite = spriteForCard(card)
    const hp = card.getHealth()
    const maxHp = card.enemyHealthTotal || card.baseHealth || hp
    // 보스 HP 막대도 플레이어 HP처럼 롤링 중인 표시값으로 폭을 잡아, 숫자가
    // 띠리링 깎이는 동안 막대가 한 번에 스냅하지 않도록 한다. maxHp는
    // syncHudCounterLinkedVisuals가 매 프레임 막대 폭을 다시 계산할 때 쓰므로 저장한다.
    this.bossHpMax = Math.max(1, maxHp)
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
    return `
      <article class="boss-face" style="--boss-art: url('${sprite}');">
        <div class="boss-face-art" aria-hidden="true"></div>
        <div class="boss-face-overlay" aria-hidden="true"></div>
        <div class="boss-face-badge" aria-label="다음 공격 카운트" data-boss-attack-countdown>${this.getBossAttackCountdownText()}</div>
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
      </article>
    `
  }

  /** 보스 HP바 페이지 경계선. 100F 마녀: 140/70, 악마: 65% 임계. */
  private renderBossHpPhaseMarkers(card: Card, maxHp: number): string {
    let thresholds: number[] = []
    if (card.specialEnemyKind === 'waxWitch' && maxHp === 210) {
      thresholds = [140, 70]
    } else if (card.specialEnemyKind === 'waxDemon') {
      thresholds = [Math.ceil(maxHp * 0.65)]
    }
    if (thresholds.length === 0) return ''
    return thresholds
      .map((threshold) => {
        const left = Math.max(0, Math.min(100, (threshold / maxHp) * 100))
        return `<span class="boss-face-hpbar-page-marker" style="left:${left}%" aria-hidden="true"></span>`
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
    const mode = this.candleModeMeta(currentMode)
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
        const meta = this.candleModeMeta(m)
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
          <div class="candle-gauge-label">${candleText}/${candleMaxText} · ${mode.effect}</div>
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
    const center = (total - 1) / 2
    const offset = index - center
    // 카드가 늘어도 ±18°/±54px 범위 안에서 균등 분포 — n≤6은 기존 스텝(7°/22px)과 동일.
    const rotStep    = center > 0 ? Math.min(7,  18 / center) : 0
    const spreadStep = center > 0 ? Math.min(22, 54 / center) : 0
    const rotate = offset * rotStep
    const spread = offset * spreadStep
    const lift   = center > 0 ? (Math.abs(offset) / center) * 8 : 0
    const pinnedClass = this.pinnedRelicId === def.id ? 'is-pinned' : ''
    return `
      <article class="relic-mini-card ${RARITY_CLASS_BY_TIER[def.rarity]} ${pinnedClass}"
               data-owned-relic="${def.id}"
               style="--relic-i:${index}; --relic-x:${spread}px; --relic-rot:${rotate}deg; --relic-y:${lift}px;"
               tabindex="0"
               title="${def.name}: ${def.effect}"
               aria-label="${def.name}: ${def.effect}">
        ${this.relicPreviewFace(def.id)}
      </article>
    `
  }

  /**
   * 유물 효과 본문을 화면용 HTML로 변환한다.
   *
   * 변환 규칙:
   * 1. `불빛` → ✦ 글리프 치환
   * 2. `{{spawn}}` → 실제 확률 변화량(%) 치환. spawnEffect 있는 유물 전용.
   *    - spawnEffect가 있으면 자동으로 shift-only 스폰 화살표 (밝음: N→M%) 추가
   * 3. `[dyn:기본|수식]` → desc-dyn 구조 (수식 부분만 감싸기, 도감/손패 방식과 동일)
   * 4. `[shift:텍스트]` → .shift-only span (기본 숨김, Shift 시 표시)
   */
  private relicEffectHtml(
    effect: string,
    spawnEffect?: { type: 'enemy' | 'treasure' | 'spore' | 'flower'; delta: number },
    ctx?: SpawnWeightContext,
    isOwned: boolean = false,
  ): string {
    // atkDmgHtml 등으로 미리 조립된 HTML은 \x00 접두사로 표시 → escapeHtml 건너뜀
    if (effect.charCodeAt(0) === 0) return effect.slice(1).replace(/불빛/g, '✦')

    let t = escapeHtml(effect).replace(/불빛/g, '✦')

    // {{spawn}} 치환: 밝음 티어 기준 확률 변화량
    if (spawnEffect && ctx && ctx.total > 0) {
      const ctxVal = spawnEffect.type === 'enemy' ? ctx.enemy
        : spawnEffect.type === 'treasure' ? ctx.treasure
        : spawnEffect.type === 'flower' ? ctx.flower
        : ctx.trap
      let pctChange: number
      let beforePct: number, afterPct: number
      if (isOwned) {
        const beforeVal = ctxVal - spawnEffect.delta
        const beforeTotal = ctx.total - spawnEffect.delta
        pctChange = beforeTotal > 0
          ? Math.round((ctxVal / ctx.total - beforeVal / beforeTotal) * 100)
          : 0
        beforePct = beforeTotal > 0 ? Math.round(beforeVal / beforeTotal * 100) : 0
        afterPct = ctx.total > 0 ? Math.round(ctxVal / ctx.total * 100) : 0
      } else {
        const newVal = Math.max(0, ctxVal + spawnEffect.delta)
        const newTotal = Math.max(1, ctx.total + spawnEffect.delta)
        pctChange = Math.round((newVal / newTotal - ctxVal / ctx.total) * 100)
        beforePct = ctx.total > 0 ? Math.round(ctxVal / ctx.total * 100) : 0
        afterPct = Math.round(newVal / newTotal * 100)
      }
      const sign = pctChange >= 0 ? '+' : ''
      t = t.replace('{{spawn}}', `${sign}${pctChange}%`)
      // spawn 유물은 자동으로 Shift 시 밝음 기준 before→after% 추가
      t += `<span class="shift-only"> (밝음: ${beforePct}→${afterPct}%)</span>`
    } else {
      t = t.replace('{{spawn}}', '')
    }

    // [atk]를 먼저 치환해야 [dyn:...|([atk]×...)] 수식 안의 ] 가 [^\]]+ 패턴을 조기 종료시키지 않는다.
    t = t.replace(/\[atk\]/g, swordIcon())

    // [dyn:기본|수식] → 수식 부분만 desc-dyn으로 감싸기 (도감/손패 방식과 동일)
    t = t.replace(/\[dyn:([^\|]+)\|([^\]]+)\]/g, (_, s, d) => {
      return `<span class="desc-dyn"><span class="desc-dyn__s">${s}</span><span class="desc-dyn__d">${d}</span></span>`
    })

    // [shift:텍스트] → .shift-only span
    t = t.replace(/\[shift:([^\]]+)\]/g, (_, x) => {
      return `<span class="shift-only">${x}</span>`
    })

    return t
  }

  /** 런타임 상태에 따라 effect 문자열을 완성해 반환한다.
   *  [dyn:기본|수식] / [shift:텍스트] 토큰을 실제 수치로 채워 넣는다.
   *  상태 없이는 staticEffect를 그대로 반환한다. */
  private relicDynamicEffect(id: RelicId, staticEffect: string, isOwned: boolean = false): string {
    const enh = this.currentGameState?.enhancements
    const char = this.currentGameState?.getCharacter()

    // scoreMultiplier 영향 불빛 획득 유물: 합산 수치 표시 + Shift에 (기본+보너스) 분해
    if (id === 'golden-squirrel' && enh) {
      const base = 200; const actual = Math.round(base * enh.scoreMultiplier)
      const bonus = actual - base
      return bonus > 0
        ? `5턴마다 불빛 [dyn:${actual}|(${base}+${bonus})] 획득`
        : `5턴마다 불빛 ${actual} 획득`
    }
    if (id === 'blind-faith' && enh) {
      const base = 50; const actual = Math.round(base * enh.scoreMultiplier)
      const bonus = actual - base
      return bonus > 0
        ? `$1 획득마다 불빛 [dyn:${actual}|(${base}+${bonus})] 획득`
        : `$1 획득마다 불빛 ${actual} 획득`
    }
    if (id === 'honesty' && enh) {
      const base = 100; const actual = Math.round(base * enh.scoreMultiplier)
      const bonus = actual - base
      return bonus > 0
        ? `손패 5장 사용마다 불빛 [dyn:${actual}|(${base}+${bonus})] 획득`
        : `손패 5장 사용마다 불빛 ${actual} 획득`
    }

    // 모래시계: 현재 소모 주기 기준 before→after
    if (id === 'hourglass' && char) {
      const after = isOwned ? char.emberDecayTurns : char.emberDecayTurns + 1
      const before = after - 1
      return `${staticEffect}[shift: (${before}→${after})]`
    }

    // 할인 쿠폰: 현재 할인율 기준 before→after
    if (id === 'discount-coupon' && enh) {
      const before = isOwned ? enh.shopDiscountPct - 5 : enh.shopDiscountPct
      const after = isOwned ? enh.shopDiscountPct : enh.shopDiscountPct + 5
      return `${staticEffect}[shift: (${before}→${after}%)]`
    }

    // 도끼: 불빛 배율 before→after
    if (id === 'axe' && enh) {
      const before = isOwned
        ? Math.round((enh.scoreMultiplier / 1.1 - 1) * 100)
        : Math.round((enh.scoreMultiplier - 1) * 100)
      const after = isOwned
        ? Math.round((enh.scoreMultiplier - 1) * 100)
        : Math.round((enh.scoreMultiplier * 1.1 - 1) * 100)
      return `${staticEffect}[shift: (+${before}%→+${after}%)]`
    }

    // 함정의 대가: 함정 무시 확률 before→after
    if (id === 'trap-master' && char) {
      const before = isOwned
        ? Math.round((char.trapIgnoreChance - 0.15) * 100)
        : Math.round(char.trapIgnoreChance * 100)
      const after = isOwned
        ? Math.round(char.trapIgnoreChance * 100)
        : Math.round((char.trapIgnoreChance + 0.15) * 100)
      return `${staticEffect}[shift: (${before}→${after}%)]`
    }

    // 개봉식: 보물 사라짐 확률 50→40% (항상 고정, 중복 획득 불가)
    if (id === 'opening-ceremony') {
      return `${staticEffect}[shift: (50→40%)]`
    }

    // 황금 열쇠: 항상 0→10% (중복 획득 불가)
    if (id === 'golden-key') {
      return `${staticEffect}[shift: (0→10%)]`
    }

    // 달콤한 유혹: 함정 피해 보너스 + 불빛 before→after
    if (id === 'sweet-temptation' && char) {
      const dmgCurrent = char.trapDamageBonus
      const dmgBefore = isOwned ? dmgCurrent - 1 : dmgCurrent
      const dmgAfter = isOwned ? dmgCurrent : dmgCurrent + 1
      return `함정 피해 [dyn:+1|(+${dmgBefore}→+${dmgAfter})] · 함정 처리 불빛 [dyn:+30%|(0→30%)]`
    }

    // 품격있는 대처 / 물양동이: atkDmgHtml과 동일한 Math.floor 공식으로 실시간 계산.
    // \x00 접두사로 relicEffectHtml의 escapeHtml을 건너뛴다.
    if (id === 'graceful-response' && char) {
      return '\x00피해를 입힌 적에게 반격 ' + atkDmgHtml(char.damage, 0.3, 1)
    }
    if (id === 'water-bucket' && char) {
      return '\x00직접 타격한 적 25% 확률 추가 ' + atkDmgHtml(char.damage, 0.5, 1)
    }

    return staticEffect
  }

  /** Owned relics reuse the shop card reading structure without the price tag.
   *  Keeping the same art/body/title/effect/flavor class names lets inventory
   *  cards scale up on hover with text legibility matching shop relic cards. */
  private relicPreviewFace(id: RelicId): string {
    const def = getRelicDef(id)
    const enh = this.currentGameState?.enhancements
    const char = this.currentGameState?.getCharacter()
    // 유물별 런타임 누적치를 카드 하단 칩으로 표기한다.
    let bonusChip = ''
    if (id === 'luxury' && enh) {
      // 사치품: 불빛 소모치와 공격력 보너스를 별도 줄로 분리
      const atkLabel = enh.luxuryBonusAtk >= 3 ? `공격력 +${enh.luxuryBonusAtk} (MAX)` : `공격력 +${enh.luxuryBonusAtk}`
      bonusChip = `<p class="shop-relic-bonus-chip">불빛 소모치 <strong>${enh.luxuryScoreSpent}</strong></p><p class="shop-relic-bonus-chip">${atkLabel}</p>`
    } else if (id === 'demon-doll' && enh) {
      bonusChip = `<p class="shop-relic-bonus-chip">자해 <strong>${enh.demonDollSelfDamageAccum}</strong>/20 · 공격력 +<strong>${enh.demonDollBonusAtk}</strong></p>`
    } else if (id === 'anomaly' && char) {
      // 변칙: 5 손실마다 발동, 현재 누적치 표시
      bonusChip = `<p class="shop-relic-bonus-chip">손실 누적 <strong>${char.relicDamageTaken}</strong>/5</p>`
    } else if (id === 'ink-quill' && enh) {
      bonusChip = `<p class="shop-relic-bonus-chip">처치 <strong>${enh.inkQuillKillCount}</strong>/5</p>`
    } else if (id === 'honesty' && enh) {
      bonusChip = `<p class="shop-relic-bonus-chip">사용 <strong>${enh.honestyHandUseCount}</strong>/5</p>`
    } else if (id === 'ambition' && enh) {
      const nextGain = enh.ambitionCurrentGain + 25
      bonusChip = `<p class="shop-relic-bonus-chip">처치 <strong>${enh.ambitionKillCount}</strong>/8 · 다음 <strong>+${nextGain}</strong>✦</p>`
    }
    return `
      <article class="relic-preview-card" aria-hidden="true">
        <div class="shop-relic-art" style="background-image: url('${spriteForRelic(def.id)}')" aria-hidden="true"></div>
        <div class="shop-relic-body">
          <h3 class="shop-relic-title">${def.name}</h3>
          <p class="shop-relic-effect">${this.relicEffectHtml(this.relicDynamicEffect(id, def.effect, true), def.spawnEffect, this.currentSpawnWeightCtx, true)}</p>
          ${bonusChip}
          <p class="shop-relic-flavor">${def.flavor}</p>
        </div>
      </article>
    `
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
    return `
      <div class="player-row">
        <div class="player-card">
          <div class="player-art" style="background-image: url('${SpriteUrls.player}')" aria-hidden="true"></div>
          <div class="player-overlay" aria-hidden="true"></div>
          <div class="player-content">
            <div class="player-stats">
              <div class="hp-column">
                ${shieldChip}
                <div class="hp-bar">
                  <div class="hp-fill" style="width: ${hpPct}%"></div>
                  <span class="hp-text">
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

  private categoryClass(cat: HandCategory): string {
    return `hand-cat-${cat}`
  }

  /** Shared card face used by hover previews and the compendium. It accepts
   *  arbitrary art so field-card codex entries can follow the exact hand-card
   *  frame without scaling the original sprite data. */
  private commonCardFace(opts: {
    artUrl: string
    name: string
    description: string
    extraClass?: string
    badge?: string
    /** 다중 뱃지 — badge보다 우선 적용된다. */
    badges?: string[]
  }): string {
    const badgeList = opts.badges ?? (opts.badge ? [opts.badge] : [])
    const badgeHtml = badgeList.map(b => `<span class="common-card-badge">${b}</span>`).join('')
    return `
      <article class="common-card-face ${opts.extraClass ?? ''}" style="--hand-card-art: url('${opts.artUrl}'); --hand-card-back: url('${SpriteUrls.cardBack}');">
        <div class="common-card-art" aria-hidden="true">
          <img src="${opts.artUrl}" alt="" loading="lazy" />
        </div>
        <div class="common-card-body">
          <header class="common-card-title-row">
            <span class="common-card-name">${opts.name}</span>
            ${badgeHtml}
          </header>
          <p class="common-card-desc">${opts.description}</p>
        </div>
      </article>
    `
  }
  /** Hand-card convenience wrapper keeps merged-star naming in one place while
   *  still delegating the actual visual frame to commonCardFace(). */
  private handCardFace(
    defId: HandCardId,
    description: string,
    merged = false,
    extraClass = '',
    badge?: string
  ): string {
    const def = getHandCardDef(defId)
    // 텍스트가 시각적으로 3줄 이상이 될 때 폰트를 살짝 줄인다.
    // <br> 2개 이상이면 확실히 3줄, <br> 1개 + 긴 텍스트면 래핑으로 3줄 될 가능성이 있다.
    const brCount = (description.match(/<br\s*\/?>/gi) ?? []).length
    const strippedLen = description.replace(/<[^>]*>/g, '').length
    const longClass = (brCount >= 2 || (brCount >= 1 && strippedLen >= 25)) ? 'is-long-desc' : ''
    return this.commonCardFace({
      artUrl: spriteForHandCard(defId),
      name: `${def.name}${merged ? ' ★' : ''}`,
      description,
      extraClass: [extraClass, longClass].filter(Boolean).join(' '),
      badge,
    })
  }

  /**
   * Normalized codex tile shared across the catalog tabs (enemies/traps/
   * treasures/flowers/relics/terms). One tile communicates: art → name + tag →
   * a small set of stat chips → optional one-line note + flavor. Keeps the
   * warm-gold / dark-glass visual language consistent with the rail cards and
   * the owned-relic fan.
   */
  private codexTile(opts: {
    art: { kind: 'sprite'; url: string } | { kind: 'icon'; svg: string }
    name: string
    /** 단일 태그. tags가 제공되면 무시된다. */
    tag?: string
    /** 다중 태그 — 카테고리 뱃지 옆에 순서대로 표시. */
    tags?: string[]
    rarityClass?: string
    chips?: Array<{
      label?: string
      value: string
      icon?: string
      tone?: 'hp' | 'atk' | 'gold' | 'shield' | 'spore' | 'bomb' | 'flower' | 'plain'
    }>
    note?: string
    flavor?: string
    extraClass?: string
  }): string {
    const tagList = opts.tags ?? (opts.tag ? [opts.tag] : [])
    const tagsOverlay = tagList.length
      ? `<div class="codex-tile-tags" aria-hidden="true">${tagList.map(t => `<span class="codex-tile-tag">${t}</span>`).join('')}</div>`
      : ''
    const artHtml =
      opts.art.kind === 'sprite'
        ? `<div class="codex-tile-art" style="background-image: url('${opts.art.url}');" aria-hidden="true">${tagsOverlay}</div>`
        : `<div class="codex-tile-art codex-tile-art--icon" aria-hidden="true">${opts.art.svg}${tagsOverlay}</div>`
    const chipsHtml = (opts.chips ?? [])
      .map((c) => {
        const tone = c.tone && c.tone !== 'plain' ? `is-${c.tone}` : ''
        const iconHtml = c.icon ?? ''
        // label+value를 하나의 span으로 묶어 단일 flex item으로 만든다.
        // 묶지 않으면 텍스트 노드와 desc-dyn span이 각각 별개의 flex item이 되어
        // 두 칸으로 분리되는 레이아웃 버그가 발생한다.
        const bodyHtml = `<span class="codex-chip-body">${c.label ? `<span class="codex-stat-key">${c.label}</span>` : ''}${c.value}</span>`
        return `<span class="codex-stat-chip ${tone}">${iconHtml}${bodyHtml}</span>`
      })
      .join('')
    const noteHtml = opts.note ? `<p class="codex-tile-note">${opts.note}</p>` : ''
    const flavorHtml = opts.flavor ? `<p class="codex-tile-flavor">${opts.flavor}</p>` : ''
    const chipsRow = chipsHtml ? `<div class="codex-tile-stats">${chipsHtml}</div>` : ''
    const classes = ['codex-tile', opts.rarityClass ?? '', opts.extraClass ?? ''].filter(Boolean).join(' ')
    return `
      <article class="${classes}">
        ${artHtml}
        <header class="codex-tile-head">
          <span class="codex-tile-name">${opts.name}</span>
        </header>
        ${chipsRow}
        ${noteHtml}
        ${flavorHtml}
      </article>
    `
  }






  /**
   * 강화팩으로 누적된 singleBonus/tripleBonus를 반영한 설명 문자열을 반환한다.
   * 보너스가 없으면 정적 def.description을 그대로 사용해 불필요한 재계산을 피한다.
   */
  /**
   * 손패 설명문 반환. 강화 보너스가 0이면 HandCards.ts의 원본 문자열을 그대로 사용한다.
   * 반환값은 미리보기 tooltip과 도감(renderCompendiumHand) 모두에 쓰이므로
   * 여기서 스타일을 바꾸면 두 곳 모두 반영된다. 텍스트 규칙은 HandCards.ts 주석 참고.
   */
  /** 팩 피커 effect 문자열 생성 — rollPackItems에서 호출. */
  public cardEffectHtml(id: HandCardId, merged = false): string {
    return this.enhancedHandCardDescription(id, merged)
  }

  private enhancedHandCardDescription(id: HandCardId, merged: boolean): string {
    const def = getHandCardDef(id)
    const enhancements = this.currentGameState?.enhancements
    // 화염의 서는 bookOfFlamesBonus가 0이어도 항상 현재 누적값으로 동적 표시한다.
    if (id === 'book-of-flames') {
      const n = enhancements?.bookOfFlamesBonus ?? 0
      return merged
        ? `필드 선택 적 1장 피해 ${2 * n}<br>화염의 서 피해 2 증가`
        : `필드 선택 적 1장 피해 ${n}<br>화염의 서 피해 1 증가`
    }
    // 검은 양초: book-of-flames와 동일하게 blackCandleBonus를 읽어 실시간 피해 표시.
    if (id === 'black-candle') {
      const n = enhancements?.blackCandleBonus ?? 0
      return merged
        ? `자해 4 · 필드 선택 적 1장 피해 ${6 + n}<br>검은 양초 피해 +6 · 손패로 돌아옴`
        : `자해 2 · 필드 선택 적 1장 피해 ${2 + n}<br>검은 양초 피해 +2 · 손패로 돌아옴`
    }
    // 불씨: 합산 수치가 기본 표시(__s). Shift 누름 중엔 공격력 수식(__d)으로 전환.
    if (id === 'ember') {
      const atk = this.currentGameState?.getCharacter().damage ?? 1
      const emberBonus = merged
        ? (enhancements?.tripleBonus['ember'] ?? 0)
        : (enhancements?.singleBonus['ember'] ?? 0)
      const total = merged ? 3 * atk + 5 + emberBonus : atk + 1 + emberBonus
      const formula = merged ? `3.0${swordIcon()}+5` : `1.0${swordIcon()}+1`
      const bonusSuffix = emberBonus > 0 ? `+${emberBonus}` : ''
      return `필드 선택 적 1장 <span class="desc-dyn"><span class="desc-dyn__s">${total}피해</span><span class="desc-dyn__d">(${formula}${bonusSuffix})피해</span></span>`
    }
    // ATK 연동 공격 카드: 기본 합산 수치, Shift 수식 (DamageDisplay 매니저 사용)
    const atk = this.currentGameState?.getCharacter().damage ?? 1
    if (id === 'sacrifice-candle') {
      const b = merged ? (enhancements?.tripleBonus['sacrifice-candle'] ?? 0) : (enhancements?.singleBonus['sacrifice-candle'] ?? 0)
      const selfTag = merged ? '자해 5 · ' : '자해 2 · '
      const dmg = merged ? atkDmgHtml(atk, 5, 10, b) : atkDmgHtml(atk, 1.5, 3, b)
      return `${selfTag}필드 선택 적 1장 ${dmg}`
    }
    if (id === 'levatein') {
      const b = merged ? (enhancements?.tripleBonus['levatein'] ?? 0) : (enhancements?.singleBonus['levatein'] ?? 0)
      const turns = merged ? '즉시 1턴 흐름' : '즉시 2턴 흐름'
      const dmg = merged ? hpDmgHtml(0.45, 15, b) : hpDmgHtml(0.3, 10, b)
      return `${turns}<br>필드 선택 적 1장 ${dmg}`
    }
    if (id === 'firework') {
      const b = merged ? (enhancements?.tripleBonus['firework'] ?? 0) : (enhancements?.singleBonus['firework'] ?? 0)
      const dmg = merged ? atkDmgHtml(atk, 3, 10, b) : atkDmgHtml(atk, 1, 2, b)
      return `필드 랜덤 적 전체 ${dmg} 분산`
    }
    if (id === 'fire-arrow') {
      const b = merged ? (enhancements?.tripleBonus['fire-arrow'] ?? 0) : (enhancements?.singleBonus['fire-arrow'] ?? 0)
      const dmg = merged ? rangeDmgHtml(atk, 5, 3, 0, b) : rangeDmgHtml(atk, 1, 1, 3, b)
      return `전방 선택 적 1장 ${dmg}`
    }
    if (id === 'chandelier') {
      const b = merged ? (enhancements?.tripleBonus['chandelier'] ?? 0) : (enhancements?.singleBonus['chandelier'] ?? 0)
      const dmg = merged ? atkDmgHtml(atk, 3, 0, b) : atkDmgHtml(atk, 1.5, 0, b)
      return `필드 전체 적 ${dmg} · 처치 시 반복`
    }
    if (id === 'bonfire') {
      const b = merged ? (enhancements?.tripleBonus['bonfire'] ?? 0) : (enhancements?.singleBonus['bonfire'] ?? 0)
      const healVal = merged ? 5 + b : 3 + b
      const dmg = merged ? atkDmgHtml(atk, 3, 3, b) : atkDmgHtml(atk, 1, 0, b)
      return `필드 선택 적 1장 ${dmg} · 처치 시 체력 +${healVal}`
    }
    if (id === 'teapot') {
      const b = merged ? (enhancements?.tripleBonus['teapot'] ?? 0) : (enhancements?.singleBonus['teapot'] ?? 0)
      const suffix = merged ? ' × 필드 적 수 × 3' : ' × 필드 적 수'
      const dmg = merged ? atkDmgHtml(atk, 3, 0, b) : atkDmgHtml(atk, 1.5, 0, b)
      return `전방 선택 적 1장 ${dmg}${suffix}`
    }
    if (id === 'slash') {
      if (merged) return getHandCardDef(id).tripleDescription // 즉사 텍스트 그대로
      const b = enhancements?.singleBonus['slash'] ?? 0
      return `전방 선택 적 1장 ${atkDmgHtml(atk, 2, 2, b)}`
    }
    if (id === 'candle-tome') {
      if (!merged) return getHandCardDef(id).description // 단일은 정적 텍스트
      const b = enhancements?.tripleBonus['candle-tome'] ?? 0
      return `필드 전체 적 ${atkDmgHtml(atk, 1, 0, b)} · 적 수×3 방패 획득`
    }
    if (id === 'sword-and-shield') {
      const b = merged ? (enhancements?.tripleBonus['sword-and-shield'] ?? 0) : (enhancements?.singleBonus['sword-and-shield'] ?? 0)
      const shieldVal = merged ? 4 + b : 1 + b
      const dmg = merged ? atkDmgHtml(atk, 2, 3, b) : atkDmgHtml(atk, 0.5, 1, b)
      return `전방 선택 적 1장 ${dmg} · 방패 +${shieldVal}`
    }
    const bonus = merged
      ? (enhancements?.tripleBonus[id] ?? 0)
      : (enhancements?.singleBonus[id] ?? 0)
    if (bonus === 0) return merged ? def.tripleDescription : def.description
    switch (id) {
      case 'wax-drop': return merged ? `체력 +${5 + bonus}` : `체력 +${1 + bonus}`
      case 'candle':   return merged ? `방패 +${5 + bonus}` : `방패 +${1 + bonus}`
      case 'match':    return merged ? `불씨 게이지 +${5 + bonus}` : `불씨 게이지 +${1 + bonus}`
      case 'card':     return merged ? `콤보 게이지 +${7 + bonus}` : `콤보 게이지 +${1 + bonus}`
      case 'coin':     return merged ? `+${5 + bonus}$` : `+${1 + bonus}$`
      default:         return merged ? def.tripleDescription : def.description
    }
  }
  private candleModeMeta(mode: CandleMode): { label: string; effect: string; icon: string } {
    switch (mode) {
      case 'max-health':
        return { label: '체력', effect: '최대 체력 +5', icon: heartIcon() }
      case 'attack':
        return { label: '공격', effect: '공격력 +1', icon: swordIcon() }
      case 'ember':
        return { label: '불씨', effect: '불씨 한도 +2', icon: flameIcon() }
      case 'draw':
        return { label: '손패', effect: '손패 최대 +2', icon: pouchIcon() }
    }
  }

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
                  const flavorHtml = recipeDef ? this.recipeFlavorHtml(recipeDef) : recipe.flavor
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
        this.categoryClass(def.category),
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
      const description = this.enhancedHandCardDescription(card.defId, card.merged === true)
      // aria-label에는 HTML/SVG 태그 없이 텍스트만 삽입한다.
      const ariaDesc = description.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
      const handArt = spriteForHandCard(card.defId)
      // Triple cards keep two lightweight visual copies in the DOM. CSS only
      // reveals them during the first merged-card entry so players see three
      // cards converge before the final starred card settles.
      const tripleMergeCopies = card.merged
        ? '<span class="triple-merge-copy copy-a" aria-hidden="true"></span><span class="triple-merge-copy copy-b" aria-hidden="true"></span>'
        : ''
      // Persist source ids into data attributes for exactly the render where a
      // merge appears; playNewHandMergeEffects reads the previous rects and
      // converts them into CSS offsets for the copy layers.
      const mergeSourceUids = card.mergeSourceUids?.join('|') ?? ''
      slots.push(`
        <li class="${classes}" data-slot-index="${i}" data-hand-uid="${card.uid}"
            ${mergeSourceUids ? `data-merge-source-uids="${mergeSourceUids}"` : ''}
            style="--slot-index: ${i}; --hand-enter-order: ${enterOrder};"
            ${recipeReadyTitle ? `title="${recipeReadyTitle}"` : ''}>
          <button type="button" data-item-index="${i}"
                  style="--hand-card-art: url('${handArt}');"
                  aria-label="${def.name}: ${ariaDesc}${recipeReadyTitle ? ` · ${recipeReadyTitle}` : ''}">
            ${tripleMergeCopies}
            ${demonReady ? `<span class="recipe-ready-mark recipe-ready-mark--demon" aria-hidden="true">✦</span>` : ''}
            ${hasOtherRecipes ? `<span class="recipe-ready-mark${demonReady ? ' is-has-demon' : ''}" aria-hidden="true">✦</span>` : ''}
            ${card.merged ? '<span class="merged-mark" aria-hidden="true">✦</span>' : ''}
            <span class="hand-card-thumb" aria-hidden="true">
              <img src="${handArt}" alt="" loading="lazy" />
            </span>
            <span class="hand-card-name">${def.name}${card.merged ? ' ★' : ''}</span>
          </button>
          <div class="hand-card-preview" style="--hand-card-back: url('${SpriteUrls.cardBack}');" aria-hidden="true">
            ${this.handCardFace(card.defId, description, card.merged)}
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
          <header class="hand-header">
            <span class="hand-header-icon">${pouchIcon()}</span>
            손패 (${character.hand.length}/${handMax})
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

  /** Single source of truth for shop-card affordance classes. Keeping this
   *  separate lets purchase refreshes update existing DOM nodes without
   *  rebuilding images, which removes the small flash/reload feeling. */
  private shopRelicAffordabilityClass(offer: ShopOfferView, score: number): string {
    if (offer.purchased) return 'is-purchased'
    // 패도는 최대 체력 16 이상에서만 구매 가능(index.ts relicPurchaseBlocked와 동일 조건).
    const maxHealth = this.currentGameState?.getCharacter().maxHealth ?? 0
    if (offer.relicId === 'hegemony' && maxHealth < 16) return 'is-unaffordable'
    // 제단 유물은 무료 단일 픽이라 가격과 무관하게 항상 밝게(affordable) 표시한다.
    if (this.currentShopRenderMode === 'altar') return 'is-affordable'
    return score >= offer.price ? 'is-affordable' : 'is-unaffordable'
  }

  /** Reroll button — ornate candle-frame control matching the game's carved-wood palette. */
  private renderShopRerollButton(cost: number, coins: number): string {
    const affordable = coins >= cost ? 'is-affordable' : 'is-unaffordable'
    // 두 화살표 순환 아이콘 — Icons.ts 동일 flat SVG 스타일(currentColor, 단색 stroke).
    const rerollIcon = `<svg class="shop-reroll-icon" width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M4 11a7 7 0 0 1 12.3-4.6"/>
      <path d="M18 11a7 7 0 0 1-12.3 4.6"/>
      <polyline points="15.4 6.4 17.3 6.4 17.3 4.5"/>
      <polyline points="6.6 15.6 4.7 15.6 4.7 17.5"/>
    </svg>`
    return `
      <button type="button"
              class="shop-reroll-btn ${affordable}"
              data-shop-buy-kind="reroll"
              aria-label="ReRoll — ${cost}$">
        <span class="shop-reroll-btn-top">
          ${rerollIcon}
          <span class="shop-reroll-btn-label">RE-ROLL</span>
        </span>
        <span class="shop-reroll-btn-rule" aria-hidden="true"></span>
        <span class="shop-reroll-btn-cost">
          <span class="shop-reroll-btn-cost-text">${cost.toLocaleString()}$</span>
        </span>
      </button>
    `
  }

  /** Free card tile (Balatro voucher slot). Centered inside its bottom-left
   *  layer, fixed-size relic-card style. */
  private renderShopFreeCard(claimed: boolean, label: string, description: string, kind: 'free-card' | 'free-coin-card' = 'free-card'): string {
    const stateClass = claimed ? 'is-purchased' : 'is-affordable'
    return `
      <article class="shop-relic-card shop-free-card ${stateClass} ${RARITY_CLASS_BY_TIER.common}"
               data-shop-buy-kind="${kind}"
               tabindex="0"
               style="--cardback-url:url('${SpriteUrls.cardBack}');--shop-free-art:url('${kind === 'free-coin-card' ? SpriteUrls.freeCoinCard : SpriteUrls.freeCard}');"
               aria-label="${label} — ${claimed ? '획득 완료' : '무료 1회'}">
        <!-- 무료 카드도 유물 카드와 동일한 2면 구조를 사용해 항상 카드백에서 시작한다. -->
        <div class="shop-relic-flipper">
          <div class="shop-relic-front">
            <div class="shop-relic-art shop-free-art" aria-hidden="true"></div>
            <div class="shop-relic-body">
              <h3 class="shop-relic-title">${label}</h3>
              <p class="shop-relic-effect">${description}</p>
              <p class="shop-relic-flavor">촛불이 남긴 작은 호의</p>
            </div>
          </div>
          <div class="shop-relic-cardback" aria-hidden="true"></div>
        </div>
      </article>
    `
  }

  /** Pack tile — full illustration (pack_001/002/003.webp) with centered
   *  title/effect overlay. NOT the art+body card split: the pack reads as
   *  a sealed envelope, not a card with a separate text panel. */
  private renderShopPackCard(
    kind: ShopPackKind,
    title: string,
    effect: string,
    cost: number,
    score: number,
    theme: 'resource' | 'upgrade' | 'unlock',
    order: number
  ): string {
    const affordable = score >= cost ? 'is-affordable' : 'is-unaffordable'
    const artUrl = SpriteUrls.packs[kind]
    // Pack tiers are intentionally fixed by kind so shop, picker, and codex share
    // one rarity source instead of each view hardcoding different glow levels.
    const packRarityClassMap: Record<ShopPackKind, CardRarity> = {
      'basic-pack': 'common',
      'recipe-pack': 'epic',
      'unlock-pack': 'epic',
      'chance-pack': 'rare',
      'resource-pack': 'epic',
      'delete-pack': 'legendary',
    }
    const rarityClass = RARITY_CLASS_BY_TIER[packRarityClassMap[kind]]
    return `
      <article class="shop-pack-card pack-theme-${theme} ${affordable} ${rarityClass}"
               data-shop-buy-kind="${kind}"
               tabindex="0"
               style="--cardback-url:url('${SpriteUrls.cardBack}'); --shop-pack-order:${order};"
               aria-label="${title} — 불빛 ${cost}">
        <div class="shop-pack-illustration" style="background-image: url('${artUrl}')" aria-hidden="true"></div>
        <div class="shop-pack-overlay">
          <h3 class="shop-pack-title">${title}</h3>
          <p class="shop-pack-effect">${effect}</p>
        </div>
        <span class="shop-price-label shop-pack-price" aria-hidden="true">
          <span class="shop-price-label-icon">${sparkleIcon()}</span>
          <span class="shop-price-label-text">${cost.toLocaleString()}</span>
        </span>
      </article>
    `
  }

  /** Shared shop purchase impact: brief shake + palette square burst so every
   *  shop element uses one common buy beat before its own follow-up event. */
  async playShopPurchaseImpact(target: HTMLElement, theme: Parameters<typeof SquareBurst.playOn>[1] = 'score'): Promise<void> {
    target.classList.remove('is-shop-purchase-impact')
    void target.offsetWidth
    target.classList.add('is-shop-purchase-impact')
    SquareBurst.playOn(target, theme, { count: 20, spread: 110, duration: 520 })
    await new Promise((resolve) => window.setTimeout(resolve, 280))
  }

  /** Open the modal pack-picker: 3 cards pop out of the pack; the player
   *  picks one. The overlay sits above the shop shell and is dismissed
   *  automatically when index.ts applies the pick. */
  openPackPicker(view: ShopPackPickerView): void {
    if (!this.shopOverlayElement) return
    // Anchor the picker INSIDE the shop shell so it covers only the rail
    // area (where the shutter is) — not the entire screen. The shell is
    // already re-positioned over the rail's bounding rect.
    const shell = this.shopOverlayElement.querySelector<HTMLElement>('.shop-shell')
    if (!shell) return
    let host = shell.querySelector<HTMLElement>('.shop-pack-picker')
    if (!host) {
      host = document.createElement('div')
      host.className = 'shop-pack-picker'
      host.addEventListener('click', (e) => {
        if (host?.classList.contains('is-closing')) return
        const t = e.target as HTMLElement

        // 재뽑기 버튼 — 즉시 이벤트 (연타 방지: is-reroll-locked 체크)
        const rerollBtn = t.closest<HTMLElement>('[data-pack-reroll]')
        if (rerollBtn && !rerollBtn.classList.contains('is-unaffordable') && !rerollBtn.classList.contains('is-reroll-locked')) {
          rerollBtn.classList.add('is-reroll-locked')
          const packKind = rerollBtn.dataset.packReroll as ShopPackKind | undefined
          if (packKind) {
            document.dispatchEvent(new CustomEvent('shopPackReroll', { detail: { packKind } }))
          }
          return
        }

        // Pass 버튼 — 블라스트 터짐 → 눌림 → 빠른 페이드
        const passBtn = t.closest<HTMLElement>('[data-pack-pass]')
        if (passBtn) {
          const packKind = passBtn.dataset.packPass as ShopPackKind | undefined
          if (packKind) {
            SquareBurst.playOn(passBtn, 'damage', { count: 10, spread: 50, duration: 280 })
            passBtn.classList.add('is-passing')
            setTimeout(
              () => document.dispatchEvent(new CustomEvent('shopPackPass', { detail: { packKind } })),
              340
            )
          }
          return
        }

        const card = t.closest<HTMLElement>('[data-pack-pick]')
        if (!card) return
        const itemId = card.dataset.packPick
        const packKind = card.dataset.packKind as ShopPackKind | undefined
        if (!itemId || !packKind) return
          host?.classList.add('is-pick-resolving')
          const choices = Array.from(host?.querySelectorAll<HTMLElement>('.shop-pack-pick-card') ?? [])
          choices.forEach((choice) => {
            if (choice !== card) choice.classList.add('is-fading-out')
          })
          card.classList.add('is-selected')
          window.setTimeout(async () => {
            await this.playShopPurchaseImpact(card, 'score')
            document.dispatchEvent(
              new CustomEvent<ShopPackPickDetail>('shopPackPick', { detail: { packKind, itemId } })
            )
          }, 460)
      })
      shell.appendChild(host)
    }
    host.classList.remove('is-closing')
    host.innerHTML = `
      <div class="shop-pack-picker-veil" style="--shop-picker-bg:url('${SpriteUrls.shopPickerBg}');" aria-hidden="true"></div>
      <div class="shop-pack-picker-shell" role="dialog" aria-label="${view.title}">
        <header class="shop-pack-picker-head">
          <h2>${view.title}</h2>
          <p>3장 중 1장을 선택하시오.</p>
        </header>
        <div class="shop-pack-picker-cards">${this.buildPackPickerCardsHtml(view)}</div>
        ${this.buildPackPickerFooterHtml(view)}
      </div>
    `
    host.classList.add('is-open')
    shell.classList.add('is-pack-picker-open')
    // 최초 열림 페이드인 트리거 — 리롤(is-blast) 경로와 분리해 잔상 방지
    const pickerCardsEl = host.querySelector<HTMLElement>('.shop-pack-picker-cards')
    if (pickerCardsEl) {
      pickerCardsEl.classList.add('is-entering')
      window.setTimeout(() => pickerCardsEl.classList.remove('is-entering'), 1500)
    }
  }

  /** Refresh pack cards in-place for reroll — layer stays open.
   *  블라스트 아웃 없이 즉시 교체 후 팝인+버스트 링을 단일 이벤트로 처리한다.
   *  (블라스트 아웃→팝인 2단계가 이중 점멸로 지각되어 제거함) */
  refreshPackPickerCards(view: ShopPackPickerView): void {
    const host = this.shopOverlayElement?.querySelector<HTMLElement>('.shop-pack-picker')
    if (!host || !host.classList.contains('is-open')) {
      this.openPackPicker(view)
      return
    }
    const cardsEl = host.querySelector<HTMLElement>('.shop-pack-picker-cards')
    const footerEl = host.querySelector<HTMLElement>('.shop-pack-picker-footer')
    if (!cardsEl) return

    cardsEl.innerHTML = this.buildPackPickerCardsHtml(view)

    // 카드 즉시 풀사이즈 노출 후 카드당 SquareBurst.
    // CSS scale 팝 애니메이션을 제거했으므로 버스트 시 카드 위치가 정확하다.
    const pickCards = Array.from(cardsEl.querySelectorAll<HTMLElement>('.shop-pack-pick-card'))
    pickCards.forEach((card, i) => {
      window.setTimeout(() => SquareBurst.playOn(card, 'score', { count: 22, spread: 130, duration: 440 }), i * 55)
    })

    // Update reroll cost in-place without rebuilding the whole footer
    if (footerEl && view.rerollCost != null) {
      const btn = footerEl.querySelector<HTMLElement>('.shop-pack-picker-reroll-btn')
      if (btn) {
        const affordable = (view.coins ?? 0) >= view.rerollCost
        btn.classList.remove('is-reroll-locked')
        btn.classList.toggle('is-affordable', affordable)
        btn.classList.toggle('is-unaffordable', !affordable)
        const costEl = btn.querySelector<HTMLElement>('.shop-pack-picker-reroll-cost')
        if (costEl) costEl.textContent = `${view.rerollCost}$`
      }
    }
  }

  private buildPackPickerCardsHtml(view: ShopPackPickerView): string {
    return view.items.map((item, i) => {
      // 개별 카드 아트가 있으면 우선 사용, 없으면 팩 커버 fallback
      const artUrl = item.spriteUrl ?? SpriteUrls.packs[view.packKind]
      const rarityClass = RARITY_CLASS_BY_TIER[item.rarity]
      // 타입 접미사(' 트리플',' 강화')를 제거해 이름만 표시한다.
      const cleanTitle = item.title.replace(/ (트리플|강화)$/, '')
      const typeBadge = item.typeLabel
        ? `<div class="shop-pack-type-badge">[ ${item.typeLabel} ]</div>`
        : ''
      const recipeNoteLine = item.recipeNote
        ? `<p class="shop-pack-recipe-note">${item.recipeNote}</p>`
        : ''
      return `
        <article class="shop-pack-pick-card pack-theme-${item.theme} ${rarityClass}"
                 data-pack-pick="${item.id}"
                 data-pack-kind="${view.packKind}"
                 style="--pick-i:${i}; --cardback-url:url('${SpriteUrls.cardBack}');"
                 tabindex="0"
                 aria-label="${item.title} — ${item.effect}">
          <div class="shop-pack-pick-flipper">
            <div class="shop-pack-pick-back" aria-hidden="true"></div>
            <div class="shop-pack-pick-front">
              <div class="shop-pack-pick-art" style="background-image:url('${artUrl}');" aria-hidden="true">
                <div class="shop-pack-pick-rarity-badge ${rarityClass}">${item.rarity}</div>
              </div>
              <div class="shop-pack-pick-body">
                <header class="shop-pack-pick-card-head">
                  ${typeBadge}
                  <span class="shop-pack-pick-card-name">${cleanTitle}</span>
                </header>
                <p class="shop-pack-pick-card-effect">${item.effect}</p>
                ${recipeNoteLine}
              </div>
            </div>
          </div>
        </article>`
    }).join('')
  }

  // 재뽑기 아이콘 — 유물 리롤 버튼과 동일한 flat SVG
  private readonly packRerollIcon = `<svg class="shop-pack-reroll-icon" width="20" height="20" viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M4 11a7 7 0 0 1 12.3-4.6"/>
    <path d="M18 11a7 7 0 0 1-12.3 4.6"/>
    <polyline points="15.4 6.4 17.3 6.4 17.3 4.5"/>
    <polyline points="6.6 15.6 4.7 15.6 4.7 17.5"/>
  </svg>`

  private buildPackPickerFooterHtml(view: ShopPackPickerView): string {
    const rerollAffordable = view.rerollCost != null && (view.coins ?? 0) >= view.rerollCost
    const rerollBtn = view.rerollCost != null
      ? `<button type="button"
                 class="shop-pack-picker-reroll-btn ${rerollAffordable ? 'is-affordable' : 'is-unaffordable'}"
                 data-pack-reroll="${view.packKind}"
                 aria-label="REROLL — ${view.rerollCost}$">
           <span class="shop-pack-picker-reroll-top">
             ${this.packRerollIcon}
             <span class="shop-pack-picker-reroll-label">REROLL</span>
           </span>
           <span class="shop-pack-picker-reroll-rule" aria-hidden="true"></span>
           <span class="shop-pack-picker-reroll-cost">${view.rerollCost}$</span>
         </button>`
      : ''
    const passBtn = view.passable
      ? `<button type="button"
                 class="shop-pack-pass-btn"
                 data-pack-pass="${view.packKind}"
                 aria-label="Pass">PASS</button>`
      : ''
    if (!rerollBtn && !passBtn) return ''
    return `<footer class="shop-pack-picker-footer">${rerollBtn}${passBtn}</footer>`
  }

  /** Hide the pack picker overlay. Plays the lift-out animation first
   *  (cards rise + veil retracts), then tears down the DOM. Idempotent —
   *  calling it again while already closing is a no-op so the click
   *  handler and the index.ts pick handler can both invoke it safely. */
  closePackPicker(): void {
    const host = this.shopOverlayElement?.querySelector<HTMLElement>('.shop-pack-picker')
    if (!host) return
    if (host.classList.contains('is-closing')) return
    if (!host.classList.contains('is-open')) {
      host.innerHTML = ''
      return
    }
    host.classList.add('is-closing')
    // Lift animation duration ≈ 340ms + max-stagger 160ms; tear down a hair
    // after the last card has left so nothing pops.
    window.setTimeout(() => {
      host.classList.remove('is-open', 'is-closing')
      host.innerHTML = ''
      const shell = this.shopOverlayElement?.querySelector<HTMLElement>('.shop-shell')
      shell?.classList.remove('is-pack-picker-open')
    }, 640)
  }

  /** Shop relic card. Click on the card itself buys the relic (the
   *  separate price button is gone). Price uses the flat diamond-like light
   *  icon from the shared SVG family instead of the old tag+점 label.
   *
   *  The hover-grown card is the click target so the player naturally
   *  taps "the bigger card" instead of hunting for a small button. */
  private renderShopRelicCard(offer: ShopOfferView, score: number, _character: Character): string {
    const def = RELIC_DEFINITIONS[offer.relicId]
    const rarityClass = RARITY_CLASS_BY_TIER[getRelicDef(offer.relicId).rarity]
    const affordabilityClass = this.shopRelicAffordabilityClass(offer, score)
    const cardLeaveDelay = Math.floor(Math.random() * 240)
    return `
      <article class="shop-relic-card ${affordabilityClass} ${rarityClass}"
               data-shop-buy="${def.id}"
               data-shop-buy-kind="relic"
               style="--card-leave-delay:${cardLeaveDelay}ms; --cardback-url:url('${SpriteUrls.cardBack}');"
               tabindex="0"
               aria-label="${def.name} — ${offer.purchased ? '구매 완료' : `불빛 ${offer.price}`}">
        <!-- Hand-preview와 동일한 2면 플립 구조: flipper 컨테이너 내부에 앞/뒷면을 고정한다. -->
        <div class="shop-relic-flipper">
        <div class="shop-relic-front">
          <div class="shop-relic-art" style="background-image: url('${spriteForRelic(def.id)}')" aria-hidden="true"></div>
          <div class="shop-relic-body">
            <h3 class="shop-relic-title">${def.name}</h3>
            <p class="shop-relic-effect">${this.relicEffectHtml(this.relicDynamicEffect(def.id, def.effect, false), def.spawnEffect, this.currentSpawnWeightCtx, false)}</p>
            <p class="shop-relic-flavor">${def.flavor}</p>
          </div>
        </div>
        <!-- Back face is ALWAYS present as a full cardbackground_001.webp panel.
             During rotation it behaves like a real card back, not an overlay hack. -->
        <div class="shop-relic-cardback" aria-hidden="true"></div>
        </div>
        <!-- 가격 라벨은 flipper(둥근 마스크) 밖으로 분리해서 카드 하단 아래에 항상 노출되게 유지한다. -->
        <span class="shop-price-label shop-relic-price-label" aria-hidden="true">
          <span class="shop-price-label-icon">${sparkleIcon()}</span>
          <span class="shop-price-label-text">${
            offer.purchased ? '구매 완료' : `${offer.price.toLocaleString()}`
          }</span>
        </span>
      </article>
    `
  }

  /** Build or refresh the in-rail shop after the 10-turn shutter drop.
   *
   *  The shop overlay no longer covers the full screen — it floats only
   *  over the rail area, with its `.shop-shell` positioned to match the
   *  rail's bounding rect. The score panel, hand panel, and player card
   *  stay fully visible so coins/HP/ATK/relics are readable while
   *  shopping. Outside the shell, pointer events pass through, but
   *  `inputLocked` blocks any actual game actions on those panels.
   */
  openShop(shop: ShopStateView, score: number, character: Character): void {
    this.currentShopRenderMode = shop.mode
    if (!this.shopOverlayElement) {
      this.shopOverlayElement = document.createElement('div')
      this.shopOverlayElement.id = 'shop-overlay'
      this.shopOverlayElement.className = 'shop-overlay'
      this.shopOverlayElement.addEventListener('click', (e) => {
        const t = e.target as HTMLElement
        const closeBtn = t.closest<HTMLElement>('[data-shop-close]')
        if (closeBtn) {
          document.dispatchEvent(new CustomEvent('shopClose'))
          return
        }
        // The whole relic card is the buy target now (no separate buy
        // button) — click the hover-grown card to purchase.
        const buyTarget = t.closest<HTMLElement>('[data-shop-buy-kind]')
        if (!buyTarget || buyTarget.classList.contains('is-purchased')) return
        const kind = buyTarget.dataset.shopBuyKind as ShopBuyDetail['kind'] | undefined
        // 리롤 애니메이션 중에는 같은 버튼에서 추가 shopBuy 이벤트를 만들지 않는다.
        if (!kind || buyTarget.classList.contains('is-reroll-locked')) return
        const relicId = buyTarget.dataset.shopBuy as RelicId | undefined
        document.dispatchEvent(new CustomEvent<ShopBuyDetail>('shopBuy', { detail: { kind, relicId } }))
      })
      document.body.appendChild(this.shopOverlayElement)
      // Mobile: add touch-active highlight so shop cards give visual feedback
      // equivalent to the :hover scale they show on desktop.
      attachShopTouchHighlight(this.shopOverlayElement)
    }
    // While the overlay is already open, refresh affordability/labels in place
    // on the existing DOM nodes — rebuilding innerHTML caused a visible white
    // flash on every purchase/reroll. Full HTML build is reserved for the very
    // first open of a shop visit.
    if (this.shopOverlayElement.classList.contains('is-open')) {
      this.refreshOpenShopInPlace(shop, score, character)
      this.positionShopShellOverRail()
      return
    }
    const cards =
      shop.relicOffers.length > 0
        ? shop.relicOffers
            .map((offer) => this.renderShopRelicCard(offer, score, character))
            .join('')
        : '<div class="shop-empty">오늘의 잡화는 모두 팔렸어.</div>'
    // Shared pack labels/effects avoid one-off hardcoded strings per view.
    const basicPackLabel = SHOP_PACK_LABELS['basic-pack']
    const recipePackLabel = SHOP_PACK_LABELS['recipe-pack']
    const unlockPackLabel = SHOP_PACK_LABELS['unlock-pack']
    const freeCardLabel = shop.mode === 'altar' ? '제단의 무료 축복' : '무료 카드'
    // New layered layout:
    //   .rail-shutter   — original 9-panel wax shutter (in .rail), closes
    //                     sequentially first.
    //   .shop-dim-veil  — semi-transparent black sheet inside the shell,
    //                     descends top-down AFTER the shutter, providing the
    //                     unified darkening backdrop the player asked for.
    //   .shop-top-row   — 2:8 grid: reroll button (LEFT, small) + artifact
    //                     layer (RIGHT, 3 cards floating).
    //   .shop-bottom-row — 3:7 grid: free card layer (LEFT) + pack layer (RIGHT).
    //   .shop-layer     — hit/layout 전용 투명 레이어.
    //                     카드는 고정 크기를 유지하고 경계를 넘을 수 있다.
    this.shopOverlayElement.innerHTML = `
      <!-- 제단/상점 모드별 레이아웃 미세 조정을 위해 모드 데이터를 shell에 남긴다. -->
      <div class="shop-shell" data-shop-mode="${shop.mode}" role="dialog" aria-label="상점">
        <div class="shop-dim-veil" style="--shop-veil-bg:url('${shop.mode === 'altar' ? SpriteUrls.altarVeilBg : SpriteUrls.shopVeilBg}');" aria-hidden="true"></div>
        <!-- 셔터+일러스트(veil) 이후 동일 텀으로 상점/제단 콘텐츠가 한 번에 열리도록
             실제 상호작용 UI를 하나의 번들 레이어로 묶는다. -->
        <div class="shop-content-bundle">
          <section class="shop-row shop-top-row" aria-label="유물 상점">
            <div class="shop-layer shop-reroll-zone" aria-hidden="true"></div>
            <div class="shop-layer shop-artifact-layer">
              ${shop.mode === 'altar' ? '' : `<div class="shop-reroll-card-anchor">${this.renderShopRerollButton(shop.rerollCost, shop.coins)}</div>`}
              ${cards}
            </div>
          </section>
          <section class="shop-row shop-bottom-row" aria-label="카드 및 카드팩">
            <div class="shop-layer shop-free-layer">
              ${this.renderShopFreeCard(shop.freeCardClaimed, freeCardLabel, shop.freeCardDescription ?? '1$', 'free-card')}
              ${shop.mode === 'altar' ? this.renderShopFreeCard(!!shop.freeCoinCardClaimed, '수당', '3$', 'free-coin-card') : ''}
            </div>
            <div class="shop-layer shop-pack-layer">
              ${shop.mode === 'altar'
                ? [
                    this.renderShopPackCard('resource-pack', '자원팩', '체력·손패·불씨 한도 영구 상향', shop.packCosts?.['resource-pack'] ?? 500, score, 'resource', 0),
                    this.renderShopPackCard('chance-pack', '확률팩', '특정 카드 1차 드롭 우선도 부여', shop.packCosts?.['chance-pack'] ?? 500, score, 'upgrade', 1),
                    this.renderShopPackCard('delete-pack', '삭제팩', '카드 제거 · 드롭 집중도 상향', shop.packCosts?.['delete-pack'] ?? 500, score, 'unlock', 2),
                  ].join('')
                : [
                    this.renderShopPackCard('basic-pack', basicPackLabel.title, 'HP·불씨·게이지 즉시 보충', shop.packCosts?.['basic-pack'] ?? shop.basicPackCost, score, 'resource', 0),
                    this.renderShopPackCard('recipe-pack', recipePackLabel.title, '조합식 해금 · 덱 심도 확장', shop.packCosts?.['recipe-pack'] ?? 400, score, 'upgrade', 1),
                    this.renderShopPackCard('unlock-pack', unlockPackLabel.title, '잠긴 손패 해금 · 드롭 풀 확대', shop.packCosts?.['unlock-pack'] ?? 400, score, 'unlock', 2),
                  ].join('')}
            </div>
          </section>
          <button class="shop-close-btn" type="button" data-shop-close aria-label="상점 나가기">EXIT</button>
        </div>
      </div>
    `
    this.shopOverlayElement.classList.add('is-open')
    this.showShopPeekButton()
    // 진입 페이드는 최초 오픈에서만 1회 재생한다. 이후 in-place 갱신/임팩트가
    // animation을 건드려도 재발동하지 않도록, 입장이 끝나면 마커를 제거한다.
    const enteringShell = this.shopOverlayElement.querySelector<HTMLElement>('.shop-shell')
    if (enteringShell) {
      enteringShell.classList.add('is-entering')
      window.setTimeout(() => enteringShell.classList.remove('is-entering'), 1200)
    }
    this.positionShopShellOverRail()
    if (!this.shopResizeListener) {
      this.shopResizeListener = () => this.positionShopShellOverRail()
      window.addEventListener('resize', this.shopResizeListener)
      window.addEventListener('scroll', this.shopResizeListener, { passive: true })
    }
  }

  /** Update labels, affordability classes, and purchased states on the
   *  already-rendered shop without touching innerHTML. This is what kills
   *  the white flash on purchase/reroll — the DOM nodes (and their images)
   *  stay mounted; only attributes/text change. */
  private refreshOpenShopInPlace(
    shop: ShopStateView,
    score: number,
    _character: Character
  ): void {
    const shell = this.shopOverlayElement?.querySelector<HTMLElement>('.shop-shell')
    if (!shell) return

    // 오퍼 목록에서 빠진 유물 카드는 DOM에서 제거한다(제단 무료 픽 후 선택/소실 카드 정리).
    const offerIds = new Set(shop.relicOffers.map((o) => RELIC_DEFINITIONS[o.relicId].id as string))
    shell
      .querySelectorAll<HTMLElement>('.shop-artifact-layer .shop-relic-card[data-shop-buy]')
      .forEach((card) => {
        if (!offerIds.has(card.dataset.shopBuy ?? '')) card.remove()
      })

    // Relic cards: replicate the old refreshOpenShopCards path.
    for (const offer of shop.relicOffers) {
      const def = RELIC_DEFINITIONS[offer.relicId]
      const card = shell.querySelector<HTMLElement>(
        `.shop-artifact-layer .shop-relic-card[data-shop-buy="${def.id}"]`
      )
      if (!card) continue
      card.classList.remove('is-affordable', 'is-unaffordable', 'is-purchased')
      card.classList.add(this.shopRelicAffordabilityClass(offer, score))
      card.setAttribute(
        'aria-label',
        `${def.name} — ${offer.purchased ? '구매 완료' : `불빛 ${offer.price}`}`
      )
      const label = card.querySelector<HTMLElement>('.shop-price-label-text')
      if (label)
        label.textContent = offer.purchased ? '구매 완료' : `${offer.price.toLocaleString()}`
    }

    // Reroll button (coins-based affordance + cost text).
    const reroll = shell.querySelector<HTMLElement>('.shop-reroll-btn')
    if (reroll) {
      // 임팩트 클래스를 정리해 다음 in-place 갱신에서 애니메이션이 재발동하지 않게 한다.
      reroll.classList.remove('is-affordable', 'is-unaffordable', 'is-reroll-impacted', 'is-shop-purchase-impact')
      reroll.classList.add(shop.coins >= shop.rerollCost ? 'is-affordable' : 'is-unaffordable')
      const costText = reroll.querySelector<HTMLElement>('.shop-reroll-btn-cost-text')
      if (costText) costText.textContent = `${shop.rerollCost.toLocaleString()}$`
      reroll.setAttribute('aria-label', `ReRoll — ${shop.rerollCost}$`)
    }

    // Free card claimed state. (무료 카드는 가격 라벨 없이 상태 클래스만 갱신한다.)
    const free = shell.querySelector<HTMLElement>('.shop-free-card')
    if (free) {
      free.classList.remove('is-affordable', 'is-purchased')
      free.classList.add(shop.freeCardClaimed ? 'is-purchased' : 'is-affordable')
    }

    // Pack tiles (cost + affordance based on score).
    const packMap: Record<ShopPackKind, number> = {
      'basic-pack': shop.packCosts?.['basic-pack'] ?? shop.basicPackCost,
      'recipe-pack': shop.packCosts?.['recipe-pack'] ?? 400,
      'unlock-pack': shop.packCosts?.['unlock-pack'] ?? 400,
      'chance-pack': shop.packCosts?.['chance-pack'] ?? 500,
      'resource-pack': shop.packCosts?.['resource-pack'] ?? 500,
      'delete-pack': shop.packCosts?.['delete-pack'] ?? 500,
    }
    for (const kind of Object.keys(packMap) as ShopPackKind[]) {
      const tile = shell.querySelector<HTMLElement>(
        `.shop-pack-card[data-shop-buy-kind="${kind}"]`
      )
      if (!tile) continue
      const cost = packMap[kind]
      tile.classList.remove('is-affordable', 'is-unaffordable')
      tile.classList.add(score >= cost ? 'is-affordable' : 'is-unaffordable')
      const priceText = tile.querySelector<HTMLElement>('.shop-price-label-text')
      if (priceText) priceText.textContent = `${cost.toLocaleString()}`
    }
  }

  /** Re-anchor the shop shell so it always sits exactly over the rail.
   *  On touch-landscape devices, CSS overrides these values with !important
   *  to fill the full overlay instead. */
  private positionShopShellOverRail(): void {
    if (!this.shopOverlayElement?.classList.contains('is-open')) return
    const rail = this.boardElement.querySelector<HTMLElement>('.rail')
    const shell = this.shopOverlayElement.querySelector<HTMLElement>('.shop-shell')
    if (!rail || !shell) return
    const rect = rail.getBoundingClientRect()
    shell.style.top = `${rect.top}px`
    shell.style.left = `${rect.left}px`
    shell.style.width = `${rect.width}px`
    shell.style.height = `${rect.height}px`
    // 미리보기 버튼을 레일 좌상단 안쪽에 맞춘다.
    if (this.shopPeekButton) {
      this.shopPeekButton.style.top = `${rect.top + 10}px`
      this.shopPeekButton.style.left = `${rect.left + 10}px`
    }
  }

  /** Play the cards-leaving animation: every relic card bounces down a
   *  little and then swooshes upward in random staggered order. The EXIT
   *  button is hidden during this beat so it doesn't linger on the way
   *  out. Resolves once all cards have left, so the caller can then
   *  hide the overlay and raise the shutter. */
  playShopExitAnimation(): Promise<void> {
    const shell = this.shopOverlayElement?.querySelector<HTMLElement>('.shop-shell')
    if (!shell) return Promise.resolve()
    const cards = Array.from(
      shell.querySelectorAll<HTMLElement>('.shop-relic-card, .shop-pack-card')
    ).filter((card) => !card.classList.contains('is-purchased'))
    shell.classList.add('is-closing')
    if (cards.length === 0) return Promise.resolve()

    // Wait for every upward swoosh animation instead of racing a fixed timer;
    // the shutter resume must not begin until the last relic has actually left.
    let finished = 0
    return new Promise((resolve) => {
      let resolved = false
      let fallback = 0
      const finishAll = (): void => {
        if (resolved) return
        resolved = true
        window.clearTimeout(fallback)
        resolve()
      }
      const finishOne = (): void => {
        finished += 1
        if (finished >= cards.length) finishAll()
      }
      fallback = window.setTimeout(finishAll, 220 + 240 + 700)
      cards.forEach((card) => {
        card.addEventListener('animationend', (event) => {
          if (event.animationName !== 'shop-card-swoosh') return
          finishOne()
        })
      })
    })
  }

  /** 직업 선택 후 화면 중앙으로 날아간 카드 고스트 — 게임 진입 후 HUD 블라스트에 재사용. */
  private jobFlightCard: HTMLElement | null = null
  /** 레일 내부 직업 선택 암막. 선택 후 보드가 채워질 때까지 남겨 몰입 전환을 가린다. */
  private jobSelectOverlayElement: HTMLElement | null = null
  /** 창 크기 변화에도 직업 선택 암막이 레일 프레임에 붙어 있도록 유지하는 리스너. */
  private jobSelectResizeListener: (() => void) | null = null

  /** In-rail job-selection overlay shown once at game start.
   *  Character-select grammar: trial/relic-card aspect (3/4) illustrated cards
   *  (job_001~, wired via spriteForJob — empty placeholder until art exists),
   *  with name/trait/stat/flavor on a bottom scrim. Unlocked jobs are sorted
   *  ahead of locked ones; a one-card-at-a-time carousel handles overflow
   *  (arrows + drag-to-fling). On pick: 비선택 카드는 어두워지고, 선택 카드는
   *  빛나는 잔상과 함께 축소되어 화면 중앙으로 날아가고 타이틀은 페이드 아웃된다.
   *  남은 고스트는 animateJobCardToHud가 HUD로 블라스트한다.
   *  Resolves with the chosen job id when the player clicks a non-locked card. */
  openJobSelect(jobs: JobDef[]): Promise<string> {
    this.clearJobSelectOverlay()
    return new Promise<string>((resolve) => {
      const lockIcon = `<svg class="job-card__lock-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"
          stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="5" y="11" width="14" height="10" rx="2"/>
        <path d="M8 11V7a4 4 0 0 1 8 0v4"/>
      </svg>`
      // 좌우 넘김 화살표 — chevron. 평소엔 투명, overlay hover 시 은은히 드러난다.
      const chevron = (dir: 'left' | 'right') => `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"
          stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="${dir === 'left' ? 'M15 5 L8 12 L15 19' : 'M9 5 L16 12 L9 19'}"/>
      </svg>`

      // 잠긴 직업은 뒤로(열린 직업 우선). 동일 그룹 내 원래 순서는 안정 정렬로 유지된다.
      const ordered = [...jobs].sort((a, b) => (a.locked ? 1 : 0) - (b.locked ? 1 : 0))

      const overlay = document.createElement('div')
      overlay.id = 'job-select-overlay'
      overlay.setAttribute('role', 'dialog')
      overlay.setAttribute('aria-label', '직업 선택')
      overlay.innerHTML = `
        <div class="job-select-rail-shell">
          <div class="job-rail-curtain job-rail-curtain--left" aria-hidden="true"></div>
          <div class="job-rail-curtain job-rail-curtain--right" aria-hidden="true"></div>
          <div class="job-select-content-bundle">
            <div class="job-select-header">
              <span class="job-select-rule"></span>
              <h2 class="job-select-title">직업 선택</h2>
              <span class="job-select-rule"></span>
            </div>
            <div class="job-select-stage">
              <button class="job-nav job-nav--left" type="button" data-job-nav="left" aria-label="이전">${chevron('left')}</button>
              <div class="job-coverflow">
                ${ordered.map((job) => {
                  const art = spriteForJob(job.illu)
                  return `
                  <button class="job-card${job.locked ? ' job-card--locked' : ''}"
                          data-job-id="${job.id}"
                          ${job.locked ? 'aria-disabled="true"' : ''}
                          type="button">
                    <div class="job-card__art${art ? '' : ' job-card__art--empty'}"
                         ${art ? `style="background-image:url('${art}')"` : ''} aria-hidden="true">
                      ${art ? '' : `<div class="job-card__symbol">${job.symbolSvg}</div>`}
                    </div>
                    <div class="job-card__sheen" aria-hidden="true"></div>
                    ${job.locked ? `<div class="job-card__lock">${lockIcon}<span class="job-card__lock-label">잠김</span></div>` : ''}
                    <div class="job-card__scrim">
                      <div class="job-card__name">${job.name}</div>
                      <div class="job-card__divider" aria-hidden="true"></div>
                      <div class="job-card__traits">${job.traits}</div>
                      ${job.stats ? `<div class="job-card__stats">${job.stats}</div>` : ''}
                      <div class="job-card__flavor">${job.flavor}</div>
                    </div>
                  </button>
                `}).join('')}
              </div>
              <button class="job-nav job-nav--right" type="button" data-job-nav="right" aria-label="다음">${chevron('right')}</button>
            </div>
          </div>
        </div>
      `
      document.body.appendChild(overlay)
      this.jobSelectOverlayElement = overlay

      // 상점처럼 body 레이어를 레일 rect에 고정해 HUD/손패는 살아 있고 선택 UI만 보드 안에 뜨게 한다.
      const alignToRail = (): void => {
        const rail = this.boardElement.querySelector<HTMLElement>('.rail')
        const shell = overlay.querySelector<HTMLElement>('.job-select-rail-shell')
        if (!rail || !shell) return
        const rect = rail.getBoundingClientRect()
        shell.style.left = `${rect.left}px`
        shell.style.top = `${rect.top}px`
        shell.style.width = `${rect.width}px`
        shell.style.height = `${rect.height}px`
      }
      let relayoutJobCards = (): void => {}
      const onShellResize = () => { alignToRail(); relayoutJobCards() }
      this.jobSelectResizeListener = onShellResize
      window.addEventListener('resize', onShellResize)
      window.addEventListener('scroll', onShellResize)

      // ── 커버플로우 캐러셀 ─────────────────────────────────────────
      // 무한 루프(끝↔끝 연결), 가운데 카드일수록 크고 밝게/좌우로 갈수록 작고 어둡게.
      // 화살표/드래그로 좌우 자유롭게 넘기고, 가운데 카드를 클릭하면 선택 확정된다.
      const flow = overlay.querySelector<HTMLElement>('.job-coverflow')!
      const leftBtn = overlay.querySelector<HTMLElement>('[data-job-nav="left"]')!
      const rightBtn = overlay.querySelector<HTMLElement>('[data-job-nav="right"]')!
      const cards = [...flow.querySelectorAll<HTMLElement>('.job-card')]
      const n = cards.length
      overlay.classList.toggle('has-overflow', n > 1)

      let current = 0      // 가운데 인덱스(드래그 중에는 소수값)
      let resolving = false

      // 인접 카드 간 가로 간격(카드 폭 기준) — 포커처럼 살짝 겹치도록 0.56배.
      const stepPx = () => (cards[0]?.offsetWidth || 200) * 0.56
      // current 기준 i의 최단 부호 거리(무한 루프 wrap).
      const wrapOff = (i: number) => {
        let o = (((i - current) % n) + n) % n
        if (o > n / 2) o -= n
        return o
      }
      const VISIBLE = 2   // 가운데 + 좌우 2장 = 5장 노출(ㅁㅁㅁㅁㅁ)
      const layout = () => {
        const sp = stepPx()
        for (let i = 0; i < n; i++) {
          const off = wrapOff(i)
          const a = Math.abs(off)
          const card = cards[i]
          const visible = a <= VISIBLE + 0.6
          const scale = Math.max(0.6, 1 - a * 0.15)
          const opacity = visible ? Math.max(0.16, 1 - a * 0.3) : 0
          card.style.transform =
            `translate(-50%, -50%) translateX(${off * sp}px) scale(${scale}) rotateY(${off * -7}deg)`
          card.style.opacity = String(opacity)
          card.style.zIndex = String(100 - Math.round(a * 10))
          card.style.filter = `brightness(${Math.max(0.4, 1 - a * 0.22)}) saturate(${Math.max(0.5, 1 - a * 0.14)})`
          card.style.pointerEvents = visible && opacity > 0.2 ? 'auto' : 'none'
          card.classList.toggle('is-center', a < 0.5)
        }
      }
      relayoutJobCards = layout
      const settle = (next: number) => { flow.classList.remove('is-dragging'); current = next; layout() }
      const go = (dir: number) => { if (!resolving) settle(Math.round(current) + dir) }

      // ── 선택 확정: 가운데 카드 빛나는 잔상→축소, 고스트로 복제해 게임 진입까지 유지 ──
      const confirmPick = (card: HTMLElement, job: JobDef) => {
        if (resolving) return
        resolving = true
        teardown()
        overlay.classList.add('is-resolving')
        card.classList.add('job-card--selected')
        window.setTimeout(() => {
          // 복사본 대신 원본 카드를 body로 이동해 고스트로 활용한다.
          // getBoundingClientRect() 로 현재 렌더 위치(scale 포함)를 캡처한 뒤
          // inline fixed 좌표로 고정해 시각적 점프 없이 DOM 위치만 바꾼다.
          const rect = card.getBoundingClientRect()
          card.classList.remove('job-card--selected', 'is-center')
          card.classList.add('job-flight-card')
          card.style.position = 'fixed'
          card.style.left = `${rect.left}px`
          card.style.top = `${rect.top}px`
          card.style.width = `${rect.width}px`
          card.style.height = `${rect.height}px`
          card.style.margin = '0'
          card.style.zIndex = '210'
          card.style.opacity = '1'
          card.style.transform = 'none'
          card.style.filter = 'none'
          card.style.transition = 'none'
          card.style.transformOrigin = 'center center'
          card.style.pointerEvents = 'none'
          document.body.appendChild(card)
          this.jobFlightCard = card
          // 선택 후에는 콘텐츠만 접고 암막은 유지한다. 호출부가 보드를 채운 뒤 playJobCurtainOpen()으로 걷는다.
          overlay.classList.add('job-select--picked')
          window.setTimeout(() => resolve(job.id), 360)
        }, 440)
      }

      // ── 입력: 화살표 / 카드 클릭(가운데=선택, 측면=가운데로) / 드래그 / 키보드 ──
      const onLeft = (e: Event) => { e.stopPropagation(); go(-1) }
      const onRight = (e: Event) => { e.stopPropagation(); go(1) }
      leftBtn.addEventListener('click', onLeft)
      rightBtn.addEventListener('click', onRight)

      let dragging = false
      let moved = false
      let startX = 0
      let startCurrent = 0
      let lastX = 0
      let lastT = 0
      let vel = 0
      const onDown = (e: PointerEvent) => {
        if (resolving) return
        dragging = true; moved = false
        startX = e.clientX; startCurrent = current
        lastX = e.clientX; lastT = performance.now(); vel = 0
        flow.classList.add('is-dragging')
      }
      const onMove = (e: PointerEvent) => {
        if (!dragging) return
        const dx = e.clientX - startX
        if (Math.abs(dx) > 6) moved = true
        current = startCurrent - dx / stepPx()
        layout()
        const now = performance.now()
        const dt = now - lastT
        if (dt > 0) vel = (e.clientX - lastX) / dt
        lastX = e.clientX; lastT = now
      }
      const onUp = () => {
        if (!dragging) return
        dragging = false
        // 플릭 속도가 빠르면 한두 칸 더 넘어가는 관성을 준다.
        let landing = current
        if (Math.abs(vel) > 0.45) landing += Math.sign(-vel) * (Math.abs(vel) > 1.1 ? 2 : 1)
        settle(Math.round(landing))
      }
      const onCardClick = (e: MouseEvent) => {
        if (resolving || moved) return
        const card = (e.target as HTMLElement).closest<HTMLElement>('.job-card')
        if (!card) return
        const i = cards.indexOf(card)
        if (i < 0) return
        const off = wrapOff(i)
        if (Math.round(off) !== 0) { settle(current + off); return }  // 측면 카드 → 가운데로
        const job = ordered[i]
        if (job.locked) {
          card.classList.add('is-denied')
          window.setTimeout(() => card.classList.remove('is-denied'), 420)
          return
        }
        confirmPick(card, job)
      }
      const onKey = (e: KeyboardEvent) => {
        if (resolving) return
        if (e.key === 'ArrowLeft') go(-1)
        else if (e.key === 'ArrowRight') go(1)
        else if (e.key === 'Enter') {
          const i = (((Math.round(current)) % n) + n) % n
          if (!ordered[i].locked) confirmPick(cards[i], ordered[i])
        }
      }
      const onResize = () => { alignToRail(); layout() }

      flow.addEventListener('pointerdown', onDown)
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      flow.addEventListener('click', onCardClick)
      window.addEventListener('keydown', onKey)
      window.addEventListener('resize', onResize)

      const teardown = () => {
        leftBtn.removeEventListener('click', onLeft)
        rightBtn.removeEventListener('click', onRight)
        flow.removeEventListener('pointerdown', onDown)
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        flow.removeEventListener('click', onCardClick)
        window.removeEventListener('keydown', onKey)
        window.removeEventListener('resize', onResize)
      }

      alignToRail()
      layout()
      requestAnimationFrame(() => { alignToRail(); layout() })   // 폰트/레이아웃 안정 후 카드 폭 재반영
    })
  }

  /** 게임 진입 직후, 화면 중앙에 남은 직업 고스트 카드가 능력에 맞는 HUD로 블라스트를
   *  날린 뒤 사라진다(스폰 확률 패널 / 체력 / 공격력 / 화폐). 수치 롤은 render()의
   *  자동 카운터가 담당하고, 여기서는 트레일/버스트와 카드 소멸 연출만 책임진다. */
  async animateJobCardToHud(job: JobDef): Promise<void> {
    const ghost = this.jobFlightCard
    if (!ghost) return
    const origin = ghost.getBoundingClientRect()

    // 스폰 보정은 한 직업당 한 종류만 있으므로 우선순위로 단일 테마를 고른다.
    let spawnTheme: BurstTheme | null = null
    if (job.spawnEnemy > 0) spawnTheme = 'damage'
    else if (job.spawnTreasure > 0) spawnTheme = 'treasure-gain'
    else if (job.spawnFlower > 0) spawnTheme = 'flower-bloom'

    const tasks: Promise<void>[] = []
    if (spawnTheme) {
      const panel = this.boardElement.querySelector<HTMLElement>('.spawn-prob-panel')
      if (panel) tasks.push(this.animateResourceTrail(origin, panel, 1, spawnTheme))
    }
    if (job.healthBonus > 0) tasks.push(this.animateResourceTrail(origin, this.findResourceTrailTarget('health'), 1, 'health-gain'))
    if (job.damageBonus > 0) tasks.push(this.animateResourceTrail(origin, this.findResourceTrailTarget('attack'), 1, 'attack-gain'))

    if (tasks.length > 0) {
      ghost.classList.add('is-emitting')
      await Promise.all(tasks)
    } else {
      // 가지지 못한 자: 블라스트 없이 잠깐 머문 뒤 조용히 사라진다.
      await new Promise<void>((r) => window.setTimeout(r, 240))
    }

    // 카드 소멸 — 중앙에서 연기 버스트 후 축소 페이드.
    SquareBurst.playAt(
      origin.left + origin.width / 2,
      origin.top + origin.height / 2,
      'vanish-smoke',
      { count: 14, spread: 120, duration: 480 }
    )
    await ghost
      .animate(
        [
          { opacity: 1, transform: 'scale(1)' },
          { opacity: 0, transform: 'scale(0.72)' },
        ],
        { duration: 360, easing: 'ease', fill: 'forwards' }
      )
      .finished.catch(() => {})
    ghost.remove()
    this.jobFlightCard = null
  }

  /** 직업 선택 암막을 좌우로 걷어 새로 채워진 3×3 레일을 처음 공개한다. */
  playJobCurtainOpen(): Promise<void> {
    const overlay = this.jobSelectOverlayElement
    if (!overlay) return Promise.resolve()
    overlay.classList.add('job-select--opening')
    return new Promise((resolve) => {
      window.setTimeout(() => {
        this.clearJobSelectOverlay()
        resolve()
      }, 780)
    })
  }

  /** 직업 선택 레이어와 레일 정렬 리스너를 한 번에 치워 새 런/리셋 잔상을 막는다. */
  private clearJobSelectOverlay(): void {
    if (this.jobSelectResizeListener) {
      window.removeEventListener('resize', this.jobSelectResizeListener)
      window.removeEventListener('scroll', this.jobSelectResizeListener)
      this.jobSelectResizeListener = null
    }
    this.jobSelectOverlayElement?.remove()
    this.jobSelectOverlayElement = null
  }

  /** 이벤트 문 진입 레이어와 정렬 리스너. */
  private eventEntryOverlayElement: HTMLElement | null = null
  private eventEntryResizeListener: (() => void) | null = null

  /**
   * 이벤트 문 진입 연출 + 대사/선택 흐름.
   * 흐름: 클릭 즉시 넓은 블라스트 → 직업선택 암막커튼 닫힘 → onConsume()으로 문 소비 →
   *   이벤트 배경 일러스트 페이드인 → 대사 진행(클릭으로 넘김) → 하단 선택 버튼 노출.
   * 선택 버튼이 눌리면 { index, buttonRect }로 resolve한다(오버레이는 닫지 않는다).
   *   호출부가 효과를 적용하고 playEventGainBlast로 버튼→HUD 블라스트를 쏜 뒤
   *   closeEventEntry()로 커튼을 열어 마무리한다.
   * @param emberAvailable 손패 불씨 보유 여부(불태우기 등 requiresHand 버튼 활성 판정).
   */
  async runEventEntry(
    cardId: string,
    def: EventDefinition,
    emberAvailable: boolean,
    onConsume: () => void,
    playDialogue: () => Promise<void>
  ): Promise<{ index: number; buttonRect: DOMRect }> {
    this.ensureEventEntryStyles()

    // 1) 즉시 넓고 화려한 진입 블라스트(문 위치 기준). 별빛 톤 + 보물 톤 혼합.
    const doorEl = this.findCardElement(cardId)
    if (doorEl) {
      const r = doorEl.getBoundingClientRect()
      const cx = r.left + r.width / 2
      const cy = r.top + r.height / 2
      SquareBurst.playAt(cx, cy, 'starlight', { count: 34, spread: 250, duration: 660, size: [10, 26] })
      SquareBurst.playAt(cx, cy, 'treasure-gain', { count: 20, spread: 180, duration: 560 })
    }

    // 2) 레일 위에 암막커튼 + 콘텐츠 오버레이(.job-rail-curtain CSS/키프레임 재사용 → 마운트 시 자동 닫힘).
    //    위협 버튼(emphasis==='danger')은 행에서 빼서 하단 중앙에 단독 배치한다.
    const dangerIdx = def.choices.findIndex((c) => c.emphasis === 'danger')
    const rowChoices = def.choices.map((c, i) => ({ c, i })).filter(({ i }) => i !== dangerIdx)
    // 디메리트 텍스트(체력 감소/소모 등)를 붉은 span으로 마킹한다.
    const DEMERIT_RE = /\s-\d|소모|손해|감소/
    const renderEffectParts = (lines: readonly string[]): string =>
      lines.join(' · ').split(' · ').map((p) => {
        const cls = DEMERIT_RE.test(p) ? 'event-effect-part is-demerit' : 'event-effect-part'
        return `<span class="${cls}">${escapeHtml(p.trim())}</span>`
      }).join('<span class="event-effect-sep"> · </span>')

    const choiceBtnHtml = (c: EventDefinition['choices'][number], i: number, extraClass = ''): string => {
      const themeClass = c.themeClass ? `event-choice--${c.themeClass}` : ''
      return `
      <button class="event-choice-btn ${themeClass} ${extraClass}" type="button" data-choice="${i}" data-choice-label="${escapeHtml(c.label)}">
        <span class="event-choice-copy">
          <span class="event-choice-label">${escapeHtml(c.label)}</span>
          <span class="event-choice-divider-line" aria-hidden="true"></span>
          <span class="event-choice-effects">${renderEffectParts(c.effectLines)}</span>
        </span>
      </button>`
    }
    const overlay = document.createElement('div')
    overlay.id = 'event-entry-overlay'
    const art = spriteForEvent(def.illu)
    overlay.innerHTML = `
      <div class="event-entry-shell">
        <div class="event-entry-illu${art ? '' : ' event-entry-illu--empty'}"
             ${art ? `style="background-image:url('${art}')"` : ''} aria-hidden="true"></div>
        <div class="job-rail-curtain job-rail-curtain--left" aria-hidden="true"></div>
        <div class="job-rail-curtain job-rail-curtain--right" aria-hidden="true"></div>
        <div id="event-demon-anchor" class="event-dialogue-anchor event-dialogue-anchor--demon" aria-hidden="true"></div>
        <div class="event-entry-content">
          <div class="event-choices" hidden>
            <div class="event-choices-row">
              ${rowChoices.map(({ c, i }) => choiceBtnHtml(c, i)).join('')}
            </div>
            ${dangerIdx >= 0 ? choiceBtnHtml(def.choices[dangerIdx], dangerIdx, `event-burn-btn ${emberAvailable ? 'is-armed' : 'is-disabled'}`) : ''}
          </div>
        </div>
      </div>`
    document.body.appendChild(overlay)
    this.eventEntryOverlayElement = overlay

    // 상점/직업선택과 동일하게 레일 rect에 셸을 고정한다.
    const alignToRail = (): void => {
      const rail = this.boardElement.querySelector<HTMLElement>('.rail')
      const shell = overlay.querySelector<HTMLElement>('.event-entry-shell')
      if (!rail || !shell) return
      const rect = rail.getBoundingClientRect()
      shell.style.left = `${rect.left}px`
      shell.style.top = `${rect.top}px`
      shell.style.width = `${rect.width}px`
      shell.style.height = `${rect.height}px`
    }
    alignToRail()
    this.eventEntryResizeListener = alignToRail
    window.addEventListener('resize', alignToRail)
    window.addEventListener('scroll', alignToRail)

    // 3) 느린 이벤트 커튼이 충분히 닫힐 때까지 기다린 뒤 문을 소비한다.
    //    선택지는 hidden 우선 CSS로 잠가 대사가 끝나기 전 버튼이 비치지 않게 한다.
    await new Promise((r) => window.setTimeout(r, 1320))
    onConsume()
    alignToRail()

    // 4) 커튼이 닫힌 뒤 한 박자 쉬고, 씬 일러스트를 세로 슬릿에서 좌우로 열어 공개한다.
    await new Promise((r) => window.setTimeout(r, 260))
    overlay.querySelector<HTMLElement>('.event-entry-illu')?.classList.add('is-shown')
    await new Promise((r) => window.setTimeout(r, 760))

    // 5) 대사 진행: 별도 대사창 없이 게임의 말풍선 시스템(다라라락 타이핑)으로 출력한다.
    //    플레이어/악마 위치는 호출부가 말풍선 앵커로 잡아 처리한다.
    await playDialogue()

    // 6) 대사 종료 후 하단 선택 버튼을 열고, 버튼 클릭을 기다려 resolve한다.
    const choicesEl = overlay.querySelector<HTMLElement>('.event-choices')!
    choicesEl.hidden = false
    choicesEl.classList.add('is-in')
    return await new Promise<{ index: number; buttonRect: DOMRect }>((resolve) => {
      choicesEl.querySelectorAll<HTMLButtonElement>('.event-choice-btn').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation()
          if (btn.classList.contains('is-disabled')) return
          // 선택 직후에는 입력만 잠그고, 효과/마무리 대사가 끝난 뒤 별도 메서드로 버튼을 접는다.
          choicesEl.classList.add('is-resolved')
          btn.classList.add('is-selected')
          const index = Number(btn.dataset.choice)
          resolve({ index, buttonRect: btn.getBoundingClientRect() })
        })
      })
    })
  }

  /** 선택이 실제 효과까지 끝난 뒤 버튼들이 커졌다가 슉 사라지는 마무리 연출. */
  async hideEventChoicesAfterSelection(index: number): Promise<void> {
    const choicesEl = this.eventEntryOverlayElement?.querySelector<HTMLElement>('.event-choices')
    if (!choicesEl) return
    choicesEl.querySelectorAll<HTMLElement>('.event-choice-btn').forEach((btn) => {
      btn.classList.toggle('is-selected', Number(btn.dataset.choice) === index)
    })
    choicesEl.classList.add('is-choice-finished')
    await new Promise((r) => window.setTimeout(r, 460))
    choicesEl.hidden = true
  }

  /** 선택 효과 획득 블라스트: 눌린 버튼 위치에서 각 HUD 타깃으로 트레일을 쏜다. */
  async playEventGainBlast(buttonRect: DOMRect, targets: readonly string[]): Promise<void> {
    const themeByTarget: Record<string, BurstTheme> = {
      health: 'health-gain', attack: 'attack-gain', hand: 'hand-tool',
      ember: 'ember-gain', gauge: 'gauge-gain', shield: 'shield-gain', score: 'score', coin: 'treasure-gain',
    }
    await Promise.all(
      targets.map((t) =>
        this.animateResourceTrail(buttonRect, this.findResourceTrailTarget(t as ResourceTrailTarget), 3, themeByTarget[t] ?? 'score')
      )
    )
  }

  /** 이벤트 종료: 일러스트가 완전히 접혀 사라진 뒤, 커튼이 천천히 열리고 오버레이를 제거한다. */
  async closeEventEntry(): Promise<void> {
    const overlay = this.eventEntryOverlayElement
    if (!overlay) return
    overlay.classList.add('is-opening')
    await new Promise((r) => window.setTimeout(r, 1720))
    this.clearEventEntryOverlay()
  }

  private clearEventEntryOverlay(): void {
    if (this.eventEntryResizeListener) {
      window.removeEventListener('resize', this.eventEntryResizeListener)
      window.removeEventListener('scroll', this.eventEntryResizeListener)
      this.eventEntryResizeListener = null
    }
    this.eventEntryOverlayElement?.remove()
    this.eventEntryOverlayElement = null
  }

  /** 전방 도달 시 이벤트 문 2턴 뱃지를 "슈룩" 팝인시킨다(슬라이드인 1회 재생). */
  popEventBadge(cardId: string): void {
    const badge = this.findCardElement(cardId)?.querySelector<HTMLElement>('.event-badge')
    if (!badge) return
    badge.classList.remove('is-pop'); void badge.offsetWidth; badge.classList.add('is-pop')
  }

  /** 이벤트 문이 닫힐 때(0턴) 카드 자체가 은은하게 흔들리며 흩어지는 연출. */
  async animateEventDoorCloseByIds(cardIds: readonly string[]): Promise<void> {
    const nodes = cardIds
      .map((id) => this.findCardElement(id))
      .filter((el): el is HTMLElement => Boolean(el))
    for (const el of nodes) {
      const rect = el.getBoundingClientRect()
      el.classList.add('is-event-door-closing')
      SquareBurst.playAt(rect.left + rect.width / 2, rect.top + rect.height / 2, 'vanish-smoke', {
        count: 22, spread: 132, duration: 720,
      })
    }
    if (nodes.length > 0) await new Promise((r) => window.setTimeout(r, 680))
  }

  /** 이벤트 진입 오버레이 전용 스타일. 커튼 자체는 .job-rail-curtain(GAME_BOARD_STYLES)을
   *  재사용하고, 여기서는 셸/일러스트/대사창/선택 버튼과 커튼 열기 재생만 정의한다.
   *  버튼은 색감을 빼고 황금빛 테두리 + 검은 반투명 내부의 고풍 스타일을 따른다. */
  private ensureEventEntryStyles(): void {
    if (document.getElementById('event-entry-styles')) return
    const style = document.createElement('style')
    style.id = 'event-entry-styles'
    style.textContent = `
#event-entry-overlay { position: fixed; inset: 0; z-index: 140; }
.event-entry-shell { position: fixed; overflow: hidden; border-radius: 14px; }
.event-entry-illu {
  position: absolute; inset: 0; z-index: 5;
  background-size: cover; background-position: center;
  opacity: 0;
  clip-path: inset(0 50% 0 50%);
  transform: scaleY(0.965);
  filter: saturate(0.88) brightness(0.72);
}
.event-entry-illu.is-shown { animation: event-illu-reveal 0.72s cubic-bezier(0.18, 0.82, 0.22, 1) both; }
.event-entry-illu.event-entry-illu--empty {
  background: radial-gradient(120% 90% at 50% 38%, rgba(40, 28, 52, 0.96), rgba(8, 5, 13, 0.99));
}
#event-entry-overlay .job-rail-curtain {
  width: 56%;
  animation-duration: 1.22s;
  animation-timing-function: cubic-bezier(0.15, 0.78, 0.22, 1);
}
#event-entry-overlay .job-rail-curtain--left {
  background:
    linear-gradient(90deg, rgba(0, 0, 0, 0.56) 0%, rgba(7, 5, 13, 0.93) 18%, rgba(21, 15, 33, 0.95) 58%, rgba(6, 4, 12, 0.9) 82%, rgba(6, 4, 12, 0) 100%),
    repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.028) 0 1px, transparent 1px 18px);
}
#event-entry-overlay .job-rail-curtain--right {
  background:
    linear-gradient(270deg, rgba(0, 0, 0, 0.56) 0%, rgba(7, 5, 13, 0.93) 18%, rgba(21, 15, 33, 0.95) 58%, rgba(6, 4, 12, 0.9) 82%, rgba(6, 4, 12, 0) 100%),
    repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.028) 0 1px, transparent 1px 18px);
}
.event-dialogue-anchor {
  position: absolute;
  width: 1px; height: 1px;
  pointer-events: none;
}
.event-dialogue-anchor--demon { left: 50%; top: 74%; z-index: 7; }
.event-entry-content {
  position: absolute; inset: 0; z-index: 6;
  display: flex; flex-direction: column; justify-content: flex-end; align-items: center;
  padding: 0 4% 6%; gap: 14px; pointer-events: none;
}
.event-entry-content > * { pointer-events: auto; }

/* ── 선택지 컨테이너: 배경·테두리 없이 폰트 중심 ── */
.event-choices[hidden] { display: none !important; }
.event-choices {
  position: relative;
  width: min(96%, 840px);
  display: flex; flex-direction: column; align-items: stretch; gap: 10px;
  padding: 20px 10px 14px;
}
.event-choices.is-in { animation: event-line-in 0.32s ease both; }
.event-choices.is-resolved { pointer-events: none; }
.event-choices.is-choice-finished { animation: event-choice-finished 0.44s cubic-bezier(0.2, 0.72, 0.2, 1) both; }

/* 좌우 양초 선택지 row — row 전체에 수평 그림자 띠를 씌워 버튼 개별이 밖으로 삐져나가지 않게 함 */
.event-choices-row {
  position: relative;
  display: flex; flex-direction: row; gap: 20px; justify-content: center;
}
/* row 전체를 가로지르는 그림자 띠: 세로는 은은하게, 가로는 좌우 40px까지만 확장 */
.event-choices-row::before {
  content: '';
  position: absolute;
  left: -40px; right: -40px; top: 0; bottom: 0;
  background: linear-gradient(180deg,
    transparent 0%,
    rgba(0, 0, 0, 0.30) 20%,
    rgba(0, 0, 0, 0.38) 50%,
    rgba(0, 0, 0, 0.30) 80%,
    transparent 100%
  );
  pointer-events: none; z-index: 0;
  transition: opacity 0.18s;
}

/* ── 공통 선택 버튼: 테두리·배경 없음, 폰트와 그림자로만 표현 ── */
.event-choice-btn {
  position: relative;
  flex: 1;
  display: flex; flex-direction: column; align-items: flex-start;
  min-height: 80px; padding: 16px 22px 14px;
  border: none; background: none;
  cursor: pointer; overflow: visible;
  font-family: 'OkDanDan', Georgia, serif;
  color: rgba(255, 238, 200, 0.88);
  transition: color 0.18s, transform 0.14s;
}
.event-choice-btn:hover { color: rgba(255, 248, 226, 0.98); transform: translateY(-3px); }

/* 레이블·구분선·효과 텍스트 — 그림자 레이어 위로 */
.event-choice-copy {
  position: relative; z-index: 1;
  display: flex; flex-direction: column; gap: 7px; width: 100%;
}
.event-choice-label {
  font-size: 22px; font-weight: 900; letter-spacing: 0.07em; line-height: 1.1; display: block;
  text-shadow: 0 2px 14px rgba(0, 0, 0, 0.9), 0 1px 4px rgba(0, 0, 0, 0.95);
  transition: text-shadow 0.18s, transform 0.14s;
}
.event-choice-btn:hover .event-choice-label {
  text-shadow: 0 2px 18px rgba(0, 0, 0, 0.9), 0 0 28px currentColor, 0 1px 4px rgba(0, 0, 0, 0.95);
}
/* 직업카드 divider 스타일 — 좌측 currentColor에서 우측 투명으로 페이드 */
.event-choice-divider-line {
  display: block; height: 1.5px; width: 44px; border-radius: 2px;
  background: linear-gradient(90deg, currentColor 0%, transparent 100%);
  opacity: 0.40; margin: 1px 0;
  transition: width 0.2s, opacity 0.18s;
}
.event-choice-btn:hover .event-choice-divider-line { width: 70px; opacity: 0.62; }
.event-choice-effects {
  font-size: 13px; color: rgba(210, 198, 178, 0.72); letter-spacing: 0.04em;
  text-shadow: 0 1px 5px rgba(0, 0, 0, 0.88); line-height: 1.5; white-space: normal;
}
.event-effect-part { color: rgba(244, 206, 112, 0.85); }
.event-effect-part.is-demerit {
  color: rgba(218, 72, 52, 0.88);
  text-shadow: 0 1px 5px rgba(0, 0, 0, 0.88), 0 0 10px rgba(200, 40, 28, 0.18);
}
.event-effect-sep { color: rgba(180, 168, 148, 0.55); }

/* 붉은 양초 — 따뜻한 연붉은, 좌측 배치: 바깥쪽 패딩을 줄여 왼쪽에 밀착 */
.event-choice--candle-red { color: rgba(238, 126, 112, 0.9); padding-left: 8px; }
.event-choice--candle-red:hover { color: rgba(255, 152, 138, 1); }
.event-choice--candle-red .event-choice-divider-line {
  align-self: center;
  background: linear-gradient(90deg, transparent 0%, rgba(238, 100, 82, 0.85) 50%, transparent 100%);
}

/* 푸른 양초 — 우측 배치 대칭: 텍스트·라인 우정렬, 바깥쪽 패딩 대칭 조정 */
.event-choice--candle-blue { color: rgba(104, 158, 240, 0.9); padding-right: 8px; }
.event-choice--candle-blue:hover { color: rgba(130, 186, 255, 1); }
.event-choice--candle-blue .event-choice-copy { align-items: center; }
.event-choice--candle-blue .event-choice-label { text-align: center; }
.event-choice--candle-blue .event-choice-effects { text-align: center; }
.event-choice--candle-blue .event-choice-divider-line {
  align-self: center;
  background: linear-gradient(90deg, transparent 0%, rgba(88, 148, 228, 0.85) 50%, transparent 100%);
}

/* 불태우기 — 하단 중앙 단독 배치, 일렁이는 위험한 색. 자체 수평 그림자 띠 포함. */
.event-burn-btn {
  flex: none; align-self: center;
  width: min(60%, 360px); min-height: 68px;
  align-items: center; text-align: center;
  margin-top: 4px;
}
.event-burn-btn::before {
  content: '';
  position: absolute;
  left: -32px; right: -32px; top: 0; bottom: 0;
  background: linear-gradient(180deg,
    transparent 0%,
    rgba(0, 0, 0, 0.26) 20%,
    rgba(0, 0, 0, 0.34) 50%,
    rgba(0, 0, 0, 0.26) 80%,
    transparent 100%
  );
  pointer-events: none; z-index: 0;
}
.event-burn-btn .event-choice-copy { align-items: center; }
.event-burn-btn .event-choice-divider-line {
  background: linear-gradient(90deg, transparent 0%, rgba(210, 72, 40, 0.72) 50%, transparent 100%);
  width: 52px;
}
.event-burn-btn:hover .event-choice-divider-line { width: 80px; }
.event-burn-btn.is-disabled { opacity: 0.28; pointer-events: none; }
/* 비활성 상태: 소灯 회색톤 */
.event-burn-btn:not(.is-armed) .event-choice-label { color: rgba(110, 100, 104, 0.60); }
.event-burn-btn:not(.is-armed) .event-choice-effects { color: rgba(96, 88, 92, 0.55); }
/* 활성 상태: 일렁이는 불꽃 */
.event-burn-btn.is-armed .event-choice-label {
  animation: event-burn-flicker 1.8s ease-in-out infinite;
}
.event-burn-btn.is-armed:hover { transform: translateY(-2px) scale(1.04); }

/* 선택 완료 애니메이션 */
.event-choice-btn.is-selected { animation: event-choice-pick-pop 0.48s cubic-bezier(0.18, 0.86, 0.24, 1) both; }

/* 열기·닫기 */
#event-entry-overlay.is-opening { pointer-events: none; }
#event-entry-overlay.is-opening .event-entry-content { opacity: 0; transition: opacity 0.22s ease; }
#event-entry-overlay.is-opening .event-entry-illu { animation: event-illu-fold-out 0.72s cubic-bezier(0.2, 0.72, 0.26, 1) forwards; }
#event-entry-overlay.is-opening .job-rail-curtain--left { animation: job-curtain-open-left 0.9s 0.72s cubic-bezier(0.18, 0.82, 0.25, 1) forwards; }
#event-entry-overlay.is-opening .job-rail-curtain--right { animation: job-curtain-open-right 0.9s 0.72s cubic-bezier(0.18, 0.82, 0.25, 1) forwards; }

@keyframes event-illu-reveal {
  0% { opacity: 0; clip-path: inset(0 50% 0 50%); transform: scaleY(0.965); filter: saturate(0.75) brightness(0.58); }
  48% { opacity: 0.52; clip-path: inset(0 28% 0 28%); }
  100% { opacity: 1; clip-path: inset(0 0 0 0); transform: scaleY(1); filter: saturate(1) brightness(1); }
}
@keyframes event-illu-fold-out {
  0% { opacity: 1; clip-path: inset(0 0 0 0); transform: scaleY(1); filter: saturate(1) brightness(1); }
  62% { opacity: 0.48; clip-path: inset(0 43% 0 43%); }
  100% { opacity: 0; clip-path: inset(0 50% 0 50%); transform: scaleY(0.965); filter: saturate(0.75) brightness(0.54); }
}
@keyframes event-line-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
@keyframes event-choice-pick-pop {
  0% { transform: scale(1); filter: brightness(1); }
  42% { transform: scale(1.07); filter: brightness(1.28); }
  100% { transform: scale(1.01); filter: brightness(1.04); }
}
@keyframes event-choice-finished {
  0% { opacity: 1; transform: scale(1); }
  42% { opacity: 0.92; transform: scale(1.05); }
  100% { opacity: 0; transform: scale(0.88) translateY(8px); filter: blur(4px); }
}
/* 불태우기 일렁임: 주황-적-황색 사이를 비규칙적으로 반짝인다 */
@keyframes event-burn-flicker {
  0%   { color: rgba(218, 78, 44, 0.92); text-shadow: 0 2px 14px rgba(0,0,0,0.9), 0 0 14px rgba(200, 58, 28, 0.28); }
  18%  { color: rgba(255, 134, 54, 0.98); text-shadow: 0 2px 14px rgba(0,0,0,0.9), 0 0 22px rgba(255, 100, 38, 0.50); }
  42%  { color: rgba(196, 44, 24, 0.88); text-shadow: 0 2px 14px rgba(0,0,0,0.9), 0 0 8px rgba(180, 28, 18, 0.16); }
  66%  { color: rgba(255, 172, 64, 0.96); text-shadow: 0 2px 14px rgba(0,0,0,0.9), 0 0 30px rgba(255, 126, 44, 0.62); }
  84%  { color: rgba(230, 60, 36, 0.90); text-shadow: 0 2px 14px rgba(0,0,0,0.9), 0 0 16px rgba(210, 48, 28, 0.36); }
  100% { color: rgba(218, 78, 44, 0.92); text-shadow: 0 2px 14px rgba(0,0,0,0.9), 0 0 14px rgba(200, 58, 28, 0.28); }
}
`
    document.head.appendChild(style)
  }

  /** Hide the modal shop without destroying purchased state in index.ts. */
  closeShop(): void {
    this.shopOverlayElement?.classList.remove('is-open')
    this.shopOverlayElement
      ?.querySelector<HTMLElement>('.shop-shell')
      ?.classList.remove('is-closing')
    if (this.shopResizeListener) {
      window.removeEventListener('resize', this.shopResizeListener)
      window.removeEventListener('scroll', this.shopResizeListener)
      this.shopResizeListener = null
    }
    this.hideShopPeekButton()
  }

  /** Creates (once) and shows the hold-to-peek button in the viewport corner. */
  private showShopPeekButton(): void {
    if (!this.shopPeekButton) {
      const btn = document.createElement('button')
      btn.className = 'shop-peek-btn'
      btn.type = 'button'
      btn.setAttribute('aria-label', '레일 미리보기 (꾹 누르기)')
      // Magnifying glass with a small flame inside the lens — flat SVG, game style.
      btn.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" width="18" height="18">
        <circle cx="10" cy="10" r="6" fill="none" stroke="currentColor" stroke-width="1.7"/>
        <line x1="14.6" y1="14.6" x2="20.5" y2="20.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
        <path d="M10 7c-.45 1.3-1.1 2-1.1 3a1.1 1.1 0 0 0 2.2 0c0-1-.65-1.7-1.1-3Z" fill="currentColor"/>
      </svg>`
      const clearPeek = () => {
        document.body.classList.remove('body--peeking')
        btn.classList.remove('is-peeking')
      }
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault()
        document.body.classList.add('body--peeking')
        btn.classList.add('is-peeking')
        btn.setPointerCapture((e as PointerEvent).pointerId)
      })
      btn.addEventListener('pointerup', clearPeek)
      btn.addEventListener('pointercancel', clearPeek)
      document.body.appendChild(btn)
      this.shopPeekButton = btn
    }
    this.shopPeekButton.classList.add('is-visible')
  }

  /** Hides the peek button and clears any active peek state. */
  private hideShopPeekButton(): void {
    this.shopPeekButton?.classList.remove('is-visible')
    document.body.classList.remove('body--peeking')
  }

  /** 악마 소환 레시피 발동 시 레일 위에 커튼을 닫는다.
   *  job-rail-curtain의 기본 close 애니메이션(양쪽에서 중앙으로)을 재활용한다. */
  async closeDemonCurtain(): Promise<void> {
    this.ensureDemonCurtainStyles()
    const overlay = document.createElement('div')
    overlay.id = 'demon-curtain-overlay'
    const shell = document.createElement('div')
    shell.className = 'demon-curtain-shell'
    const rail = this.boardElement.querySelector<HTMLElement>('.rail')
    if (rail) {
      const rect = rail.getBoundingClientRect()
      shell.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;overflow:hidden;border-radius:14px;`
    }
    shell.innerHTML = `
      <div class="job-rail-curtain job-rail-curtain--left demon-curtain-panel" aria-hidden="true"></div>
      <div class="job-rail-curtain job-rail-curtain--right demon-curtain-panel" aria-hidden="true"></div>`
    overlay.appendChild(shell)
    document.body.appendChild(overlay)
    this.demonCurtainOverlay = overlay
    // 기본 close 애니메이션(0.68s)이 끝날 때까지 대기.
    await new Promise<void>((r) => window.setTimeout(r, 740))
  }

  /** 악마 소환 직전 — 화면에 불길한 붉은 일렁임을 잠시 띄운다 (fire-and-forget). */
  playOminousShimmer(): void {
    const el = document.createElement('div')
    el.className = 'demon-summon-shimmer'
    document.body.appendChild(el)
    window.setTimeout(() => el.remove(), 1400)
  }

  /** 악마 소환 체인 배너를 화르르 사라지게 한다. */
  async playDemonBannerBurnFade(): Promise<void> {
    const banner = document.getElementById('chain-banner')
    if (!banner) return
    banner.classList.remove('is-demon-impact')
    banner.classList.add('is-demon-impact-fading')
    await new Promise<void>((r) => window.setTimeout(r, 720))
    banner.classList.remove('is-demon-impact-fading')
  }

  /** 악마 보스 커튼 앞 등장: 게임 보드를 커튼 오버레이보다 높은 z-index로 올린다. */
  elevateBoardAboveCurtain(): void {
    this.boardElement.style.position = 'relative'
    this.boardElement.style.zIndex = '150'
    this.boardElement.style.isolation = 'isolate'
  }

  /** 악마 보스 커튼 제거 및 보드 z-index 복원. */
  removeDemonCurtain(): void {
    this.boardElement.style.position = ''
    this.boardElement.style.zIndex = ''
    this.boardElement.style.isolation = ''
    if (this.demonCurtainOverlay) {
      this.demonCurtainOverlay.remove()
      this.demonCurtainOverlay = null
    }
  }

  /**
   * 악마 보스 등장 연출: 커튼은 그대로 둔 채 보드를 올린 뒤
   * 보스 타일이 작고 어두운 상태에서 점차 커지고(Phase1), 그 뒤 흐림이 걷히며 선명해진다(Phase2).
   * 두 페이즈는 딜레이로 분리해 순차 진행한다.
   */
  async playDemonFireAppearAnimation(cardId: string): Promise<void> {
    this.elevateBoardAboveCurtain()
    const tile = this.findCardElement(cardId)
    // render() 직후 풀 사이즈로 노출되지 않도록 즉시 숨긴 상태로 고정
    if (tile) {
      tile.style.transition = 'none'
      tile.style.transform = 'scale(0.12)'
      tile.style.opacity = '0'
      tile.style.filter = 'blur(20px) brightness(0.08)'
      void tile.offsetWidth  // reflow
    }
    // 커튼 뒤 암흑 유지 후 등장 시작
    await new Promise((r) => window.setTimeout(r, 700))
    if (!tile) return
    // reflow 없이 바로 transition 적용 (이미 초기 상태 고정됨)
    // Phase 1: 규모 성장 + 투명도 해소 (흐림은 유지)
    tile.style.transition = 'transform 0.82s cubic-bezier(0.18, 0.82, 0.25, 1), opacity 0.65s ease-out'
    tile.style.transform = 'scale(1.0)'
    tile.style.opacity = '1'
    await new Promise((r) => window.setTimeout(r, 860))
    // Phase 2: 흐림 해소 + 밝기 복원
    tile.style.transition = 'filter 0.74s ease-out'
    tile.style.filter = 'blur(0px) brightness(1)'
    await new Promise((r) => window.setTimeout(r, 780))
    // 인라인 스타일 정리
    tile.style.transition = ''
    tile.style.transform = ''
    tile.style.opacity = ''
    tile.style.filter = ''
    await new Promise((r) => window.setTimeout(r, 300))
  }

  /** 악마 보스 등장 후 커튼을 열어 보스를 공개한다.
   *  커튼이 보드 위에 있어야 열리면서 레일이 드러나므로, 먼저 보드 elevation을 복원한다. */
  async openDemonCurtain(): Promise<void> {
    const overlay = this.demonCurtainOverlay
    if (!overlay) return
    // 보드를 커튼 아래로 복원해야 커튼 열림 연출이 레일을 가리다 걷히는 효과를 낸다.
    this.boardElement.style.position = ''
    this.boardElement.style.zIndex = ''
    this.boardElement.style.isolation = ''
    overlay.classList.add('is-opening')
    await new Promise<void>((r) => window.setTimeout(r, 1100))
    overlay.remove()
    this.demonCurtainOverlay = null
  }

  private ensureDemonCurtainStyles(): void {
    if (document.getElementById('demon-curtain-styles')) return
    const style = document.createElement('style')
    style.id = 'demon-curtain-styles'
    style.textContent = `
#demon-curtain-overlay {
  position: fixed; inset: 0; z-index: 145; pointer-events: none;
}
#demon-curtain-overlay .demon-curtain-panel {
  width: 56%;
  filter: saturate(0.55) hue-rotate(-12deg) brightness(0.82);
}
#demon-curtain-overlay.is-opening .job-rail-curtain--left {
  animation: job-curtain-open-left 0.92s cubic-bezier(0.18, 0.82, 0.25, 1) forwards;
}
#demon-curtain-overlay.is-opening .job-rail-curtain--right {
  animation: job-curtain-open-right 0.92s cubic-bezier(0.18, 0.82, 0.25, 1) forwards;
}
`
    document.head.appendChild(style)
  }

  /** Forced trial reuses shop shell/bundle grammar so altar->boss->trial feels
   *  like one uninterrupted rail event flow (drop layer -> pick -> EXIT). */
  openForcedTrialShopFlow(cards: ForcedTrialCardView[]): void {
    if (!this.shopOverlayElement) {
      this.shopOverlayElement = document.createElement('div')
      this.shopOverlayElement.id = 'shop-overlay'
      this.shopOverlayElement.className = 'shop-overlay'
      document.body.appendChild(this.shopOverlayElement)
    }
    this.shopOverlayElement.innerHTML = `
      <div class="shop-shell shop-shell--trial" data-shop-mode="altar" role="dialog" aria-label="시련 선택">
        <div class="shop-dim-veil" style="--shop-veil-bg:url('${SpriteUrls.trialVeilBg}');" aria-hidden="true"></div>
        <div class="shop-content-bundle">
          <section class="shop-row shop-top-row" aria-label="시련 카드">
            <div class="shop-layer shop-artifact-layer shop-trial-layer trial-rail-frame" aria-hidden="false">
              ${cards.map((card) => `
                <button class="shop-relic-card shop-trial-card is-affordable" data-trial-pick="${card.id}" type="button"
                        style="--cardback-url:url('${SpriteUrls.cardBack}');"
                        aria-label="${card.title}">
                  <div class="shop-relic-flipper">
                    <div class="shop-relic-front shop-trial-front">
                      <div class="shop-relic-art shop-trial-art" style="background-image: url('${card.spriteUrl}')" aria-hidden="true"></div>
                      <div class="shop-relic-body shop-trial-body">
                        <h3 class="shop-relic-title shop-trial-title">${card.title}</h3>
                        <p class="shop-relic-effect shop-trial-effect">${card.effect}</p>
                      </div>
                    </div>
                  </div>
                </button>
              `).join('')}
            </div>
          </section>
        </div>
      </div>
    `
    this.shopOverlayElement.onclick = (event) => {
      const target = event.target as HTMLElement
      const pick = target.closest<HTMLElement>('[data-trial-pick]')
      if (pick) {
        document.dispatchEvent(new CustomEvent('forcedTrialPick', { detail: { id: pick.dataset.trialPick } }))
        return
      }
      if (target.closest('[data-trial-exit]')) document.dispatchEvent(new CustomEvent('forcedTrialExit'))
    }
    // Mobile: wire touch-active highlight (idempotent — safe after shop→trial reuse).
    attachShopTouchHighlight(this.shopOverlayElement)
    this.shopOverlayElement.classList.add('is-open')
    this.showShopPeekButton()
    this.positionShopShellOverRail()
  }

  /** Build shutter spans from the current rail. Grouped front cards (2/3칸)
   *  become one wide panel so no card art peeks through inner column gaps. */
  private shopShutterPanelsFromLanes(lanes?: Lane[]): string {
    let panelIndex = 0
    if (!lanes) {
      return Array.from(
        { length: 9 },
        () => `<span style="--shutter-i:${panelIndex++}"></span>`
      ).join('')
    }

    const rows: string[] = []
    for (let distance = LANE_DISTANCE_COUNT - 1; distance >= 0; distance--) {
      let laneIndex = 0
      while (laneIndex < lanes.length) {
        const card = lanes[laneIndex].getCardAtDistance(distance)
        let span = 1
        // Match renderRow's active-row grouping rule: only the front row can
        // merge adjacent same Card instances into a 2/3칸 object.
        if (distance === 0 && card) {
          while (
            laneIndex + span < lanes.length &&
            lanes[laneIndex + span].getCardAtDistance(distance) === card
          ) {
            span++
          }
        }
        rows.push(
          `<span style="--shutter-i:${panelIndex++};${span > 1 ? `grid-column: span ${span};` : ''}"></span>`
        )
        laneIndex += span
      }
    }
    return rows.join('')
  }

  /** Read the already-rendered rail when a live shutter transition starts. */
  private shopShutterPanelsFromRail(rail: HTMLElement): string {
    let panelIndex = 0
    const panels: string[] = []
    rail.querySelectorAll<HTMLElement>('.rail-row').forEach((row) => {
      row.querySelectorAll<HTMLElement>('.cell').forEach((cell) => {
        const span = Number(cell.dataset.span || '1')
        panels.push(
          `<span style="--shutter-i:${panelIndex++};${span > 1 ? `grid-column: span ${span};` : ''}"></span>`
        )
      })
    })
    return panels.length > 0 ? panels.join('') : this.shopShutterPanelsFromLanes()
  }

  /** Shared wax shutter markup used by both live transitions and render-restored
   *  shop state. `persistent` keeps a purchase refresh from replaying the drop. */
  private renderShopShutter(persistent = false, lanes?: Lane[]): string {
    const classes = ['rail-shutter', persistent ? 'is-closed is-persistent' : '']
      .filter(Boolean)
      .join(' ')
    // 영구 셔터는 진입 시점 스냅샷 우선 — lanes가 보스 보상 등으로 변해도 모양 고정.
    const panels = persistent && this.shopShutterSnapshot
      ? this.shopShutterSnapshot
      : this.shopShutterPanelsFromLanes(lanes)
    return `<div class="${classes}" aria-hidden="true">${panels}</div>`
  }

  /** Create the wax shutter grid used by shop stop/resume transitions. */
  private createShopShutter(rail?: HTMLElement): HTMLElement {
    const host = document.createElement('template')
    const panels = rail ? this.shopShutterPanelsFromRail(rail) : this.shopShutterPanelsFromLanes()
    host.innerHTML = `<div class="rail-shutter" aria-hidden="true">${panels}</div>`
    return host.content.firstElementChild as HTMLElement
  }

  /** Project each shutter panel onto the current rail cell bounds so the shop
   *  shutter follows the same perspective (front/mid/top row scale + 2/3-span). */
  private syncShopShutterToRailCells(): void {
    // 스냅샷이 활성화된 동안(보스 이벤트·보상 페이지)에는 CSS vars를 재계산하지 않는다.
    // 보상 3-wide 레이아웃이 셔터 위치를 덮어쓰는 것을 막는다.
    if (this.shopShutterSnapshot !== null) return
    const rail = this.boardElement.querySelector<HTMLElement>('.rail')
    const shutter = rail?.querySelector<HTMLElement>('.rail-shutter')
    if (!rail || !shutter) return

    const railRect = rail.getBoundingClientRect()
    const rowCells = [...rail.querySelectorAll<HTMLElement>('.rail-row .cell')]
    const panels = [...shutter.querySelectorAll<HTMLElement>('span')]
    if (rowCells.length === 0 || panels.length === 0) return

    const count = Math.min(rowCells.length, panels.length)
    for (let i = 0; i < count; i++) {
      const cellRect = rowCells[i].getBoundingClientRect()
      const panel = panels[i]
      panel.style.setProperty('--shutter-cell-x', `${cellRect.left - railRect.left}px`)
      panel.style.setProperty('--shutter-cell-y', `${cellRect.top - railRect.top}px`)
      panel.style.setProperty('--shutter-cell-w', `${cellRect.width}px`)
      panel.style.setProperty('--shutter-cell-h', `${cellRect.height}px`)
    }
  }

  /** 10-turn shop transition: rail quake, then the 3×3 shutter closes and stays closed. */
  playShopTransition(): Promise<void> {
    const rail = this.boardElement.querySelector<HTMLElement>('.rail')
    if (!rail) return Promise.resolve()
    this.shopShutterLocked = true
    const oldShutter = rail.querySelector<HTMLElement>('.rail-shutter')
    oldShutter?.remove()
    const shutter = this.createShopShutter(rail)
    rail.appendChild(shutter)
    // CSS vars(위치) 계산 후 스냅샷 저장 → re-render 시 CSS vars가 포함된 패널 HTML을
    // 재사용하고 syncShopShutterToRailCells()가 덮어쓰지 않도록 guard와 연동된다.
    this.syncShopShutterToRailCells()
    this.shopShutterSnapshot = shutter.innerHTML
    // While the shutter is down, pause only distracting in-rail loop effects
    // (not gameplay timers), so armed bombs do not sparkle behind the paper.
    rail.classList.add('is-shop-quaking', 'is-shop-shuttered')
    return new Promise((resolve) => {
      window.setTimeout(() => rail.classList.remove('is-shop-quaking'), 520)
      window.setTimeout(() => shutter.classList.add('is-closed'), 760)
      window.setTimeout(resolve, 860)
    })
  }

  /** Lift the shop shutter only after the player exits the shop. */
  playShopResumeTransition(): Promise<void> {
    const rail = this.boardElement.querySelector<HTMLElement>('.rail')
    if (!rail) return Promise.resolve()
    const shutter = rail.querySelector<HTMLElement>('.rail-shutter') ?? this.createShopShutter()
    if (!shutter.isConnected) {
      rail.appendChild(shutter)
    }
    // 항상 is-opening을 제거하고 is-closed+is-persistent로 강제 초기화.
    // 보스→시련 흐름에서 셔터가 중간 상태로 노출될 수 있어 매번 클린 상태로 시작.
    shutter.classList.remove('is-opening')
    shutter.classList.add('is-closed', 'is-persistent')
    // 스냅샷을 먼저 해제해야 syncShopShutterToRailCells()가 복원된 레인 기준으로 동작한다.
    this.shopShutterSnapshot = null
    this.syncShopShutterToRailCells()

    // 셔터가 닫힌 채 레일이 흔들리고, 그 직후 쿠궁하며 상승.
    // is-opening 추가 직전 is-persistent·is-closed를 제거해 CSS animation 충돌 방지.
    return new Promise((resolve) => {
      rail.classList.add('is-shop-quaking')
      window.setTimeout(() => rail.classList.remove('is-shop-quaking'), 520)
      window.setTimeout(() => {
        shutter.classList.remove('is-persistent', 'is-closed')
        shutter.classList.add('is-opening')
      }, 560)
      window.setTimeout(() => {
        this.shopShutterLocked = false
        this.shopShutterSnapshot = null
        shutter.remove()
        rail.classList.remove('is-shop-shuttered')
        resolve()
      }, 560 + 760)
    })
  }

  /** 새 런 시작 시 셔터 상태를 초기화한다. 보스전 중 게임오버 시 잠긴 상태가 잔류하는 걸 방지. */
  resetShutter(): void {
    this.clearJobSelectOverlay()
    this.jobFlightCard?.remove()
    this.jobFlightCard = null
    this.shopShutterLocked = false
    this.shopShutterSnapshot = null
    document.querySelector<HTMLElement>('#game-board .rail-shutter')?.remove()
    document.querySelector<HTMLElement>('#game-board .rail')?.classList.remove('is-shop-shuttered', 'is-shop-quaking')
  }

  /** Altar EXIT keeps the shutter closed and shakes the full rail before boss entry.
   *  The boss tile drops directly onto the shuttered rail in the new flow, so the
   *  quake is the only beat between shop exit and boss arrival. */
  async playAltarBossGateTransition(): Promise<void> {
    const rail = this.boardElement.querySelector<HTMLElement>('.rail')
    if (!rail) return
    rail.classList.add('is-shop-quaking')
    await new Promise((resolve) => window.setTimeout(resolve, 620))
    rail.classList.remove('is-shop-quaking')
  }

  /** 보스 등장 직전, 화면을 어둡게 가린 풀스크린 인트로 카드:
   *  좌측에 보스 일러스트, 우측에 이름/HP/공격력/특수/연출 설명. 어느 곳이나
   *  클릭하면 닫히고 다음 비트(셔터 위 보스 타일 강하)로 이어진다. */
  async openBossIntroOverlay(opts: {
    name: string
    maxHp: number
    attack: number
    attackInterval: number
    handGiftStep: number
    spriteUrl?: string
    /** 인트로 카드에 표시할 보스 첫 대사 */
    introBubble?: string
    /** 인트로 카드에 표시할 특징 한 줄 */
    trait?: string
    /** 인트로 카드 상단 수식어 (기본: 탐욕의 대가) */
    kicker?: string
  }): Promise<void> {
    // 잔재 정리: 직전 보스 이벤트가 비정상 종료됐다면 같은 노드가 남아 있을 수 있다.
    document.getElementById('boss-intro-overlay')?.remove()
    const spriteUrl = opts.spriteUrl ?? SpriteUrls.enemyWaves[3]
    const traitLines = (opts.trait ?? `보스 체력이 ${opts.handGiftStep} 닳을 때마다 플레이어에게 랜덤 손패 1장을 지급한다.`)
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
    const traitMarkup = traitLines.length > 1
      ? `<div class="boss-intro-overlay-trait"><strong>특징</strong><ul>${traitLines.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul></div>`
      : `<p class="boss-intro-overlay-trait"><strong>특징</strong> · ${escapeHtml(traitLines[0] ?? '')}</p>`
    // 모든 보스 공통 규칙 레이어 — 특징과 같은 양식이되 색감만 살짝 다른 차가운 촛불 톤.
    const commonMarkup = `<p class="boss-intro-overlay-trait boss-intro-overlay-common"><strong>공통</strong> · 보스 체력 10 감소마다 손패 1장 획득</p>`
    const host = document.createElement('div')
    host.id = 'boss-intro-overlay'
    host.className = 'boss-intro-overlay'
    host.innerHTML = `
      <section class="boss-intro-overlay-card" role="dialog" aria-label="보스 출현">
        <div class="boss-intro-overlay-art" style="background-image:url('${spriteUrl}');" aria-hidden="true"></div>
        <div class="boss-intro-overlay-body">
          <span class="boss-intro-overlay-kicker">${escapeHtml(opts.kicker ?? '탐욕의 대가')}</span>
          <h2 class="boss-intro-overlay-name">${escapeHtml(opts.name)}</h2>
          <ul class="boss-intro-overlay-stats">
            <li><span class="boss-intro-overlay-stat-label">체력</span><span class="boss-intro-overlay-stat-value">${opts.maxHp}</span></li>
            <li><span class="boss-intro-overlay-stat-label">공격력</span><span class="boss-intro-overlay-stat-value">${opts.attack}</span></li>
            <li><span class="boss-intro-overlay-stat-label">반격 주기</span><span class="boss-intro-overlay-stat-value">${opts.attackInterval}턴</span></li>
          </ul>
          <p class="boss-intro-overlay-desc">"${escapeHtml(opts.introBubble ?? '내 저택에 온 것을 환영하네, 위태로운 불씨여.')}"</p>
          ${commonMarkup}
          ${traitMarkup}
        </div>
      </section>
      <div class="boss-intro-overlay-hint" aria-hidden="true">CLICK ANYWHERE TO CONTINUE</div>
    `
    document.body.appendChild(host)
    // 타이틀 카드가 완전히 떠오른 뒤에만 하단 문구와 클릭 입력을 연다.
    await new Promise((resolve) => window.setTimeout(resolve, 1700))
    host.classList.add('is-ready')
    await new Promise<void>((resolve) => {
      const close = (): void => {
        host.classList.add('is-closing')
        window.setTimeout(() => {
          host.remove()
          resolve()
        }, 240)
      }
      host.addEventListener('click', close, { once: true })
    })
  }


  /** 일반 적 카드에 사용하는 .damage-float(붉은 부유 숫자)을 카드 인스턴스
   *  없이 임의 좌표에 띄우기 위한 public 래퍼. 보스 타일이 일반 적과 같은
   *  데미지 글자 톤/모션을 그대로 받도록 한다. */
  spawnFieldDamageNumber(x: number, y: number, amount: number): Promise<void> {
    return this.animateDamageNumberAt(x, y, amount)
  }

  /** 보스 좌상단 뱃지에 표시할 "N턴 뒤 공격" 카운트. null이면 마크업이 정적 텍스트로
   *  fallback 한다. index.ts의 보스 가상 턴 흐름이 매 턴마다 update한다. */
  private bossAttackCountdown: number | null = null
  setBossAttackCountdown(n: number | null): void {
    this.bossAttackCountdown = n
    // 보스 카드가 화면에 있다면 바로 텍스트만 in-place로 갱신해 render 부담을 줄인다.
    document.querySelectorAll<HTMLElement>('[data-boss-attack-countdown]').forEach((el) => {
      el.textContent = n == null ? '' : `${n}턴`
    })
  }
  getBossAttackCountdownText(): string {
    return this.bossAttackCountdown == null ? '3턴' : `${this.bossAttackCountdown}턴`
  }

  /** 보스 보상 카드 클릭 시 일반 보물칸 처치 그라마를 그대로 재사용해 흔들+확대 사라짐.
   *  .is-consuming(공통 card-consume 키프레임) + boss-reward 전용 회전·blur를 한 비트
   *  더 얹는 .is-boss-reward-claimed 키프레임. SquareBurst는 treasure-gain 톤. */
  async playBossRewardClaimedConsume(cardId: string): Promise<void> {
    const tile = this.findCardElement(cardId)
    if (!tile) return
    SquareBurst.playOn(tile, 'treasure-gain', { count: 18, spread: 140, duration: 560 })
    tile.classList.add('is-boss-reward-claimed')
    await new Promise((r) => window.setTimeout(r, 520))
  }

  /** 함정 무시(도적/함정의 대가) 판정 성공 시 함정 카드를 잠깐 흔들고
   *  "무시" 글자를 플레이어 카드 위에 띄워 피해가 없음을 시각적으로 확인시킨다. */
  async playTrapIgnoreResist(trapCardId: string): Promise<void> {
    const trapTile = this.findCardElement(trapCardId)
    const playerCard = this.boardElement.querySelector<HTMLElement>('.player-card, .player-row')
    if (trapTile) {
      trapTile.classList.add('is-trap-ignored')
    }
    if (playerCard) {
      const rect = playerCard.getBoundingClientRect()
      void this.spawnFieldFloatText(rect.left + rect.width / 2, rect.top + rect.height * 0.3, '무시')
    }
    await new Promise((r) => window.setTimeout(r, 460))
    if (trapTile) trapTile.classList.remove('is-trap-ignored')
  }

  /** 보스가 굳음(밀랍 freeze) 상태일 때 가격을 시도하면 데미지 대신 "저항" 글자를
   *  데미지 부유 숫자와 같은 양식으로 띄우고, 카드가 살짝 발작하듯 떨린다.
   *  손패 freeze 효과가 보스에 정상 적용되었음을 명확히 보여주는 피드백. */
  async playBossFreezeResist(cardId: string): Promise<void> {
    const tile = this.findCardElement(cardId)
    if (!tile) return
    tile.classList.add('is-boss-resisting')
    const rect = tile.getBoundingClientRect()
    void this.spawnFieldFloatText(rect.left + rect.width / 2, rect.top + rect.height * 0.34, '저항')
    await new Promise((r) => window.setTimeout(r, 460))
    tile.classList.remove('is-boss-resisting')
  }

  /** 데미지 부유 숫자와 동일 톤으로 임의 텍스트를 띄운다(저항/면역 등 상태 피드백용). */
  spawnFieldFloatText(x: number, y: number, text: string): Promise<void> {
    const el = document.createElement('div')
    el.className = 'damage-float damage-float--text'
    el.textContent = text
    el.style.left = `${x}px`
    el.style.top = `${y}px`
    document.body.appendChild(el)
    const anim = el.animate(
      [
        { transform: 'translate(-50%, -20%) scale(0.78)', opacity: 0, filter: 'brightness(1.2)' },
        { transform: 'translate(-50%, -68%) scale(1.2)', opacity: 1, filter: 'brightness(1.65)', offset: 0.22 },
        { transform: 'translate(-50%, -110%) scale(1.08)', opacity: 1, filter: 'brightness(1.32)', offset: 0.65 },
        { transform: 'translate(-50%, -160%) scale(1)', opacity: 0, filter: 'brightness(1)' },
      ],
      { duration: 980, easing: 'cubic-bezier(0.16, 0.86, 0.28, 1)', fill: 'forwards' }
    )
    return new Promise((resolve) => {
      anim.onfinish = () => {
        el.remove()
        resolve()
      }
      window.setTimeout(() => { el.remove(); resolve() }, 1120)
    })
  }

  /** 보스 격파 시퀀스(공통): 짧은 흔들 → 사각 burst 연발 → 갈라짐 → 펑(큰 burst) →
   *  흐릿하게 확대되며 사라짐. 모든 burst는 기존 SquareBurst 그라마(damage/treasure-gain)
   *  를 그대로 사용해 일반 게임 톤과 통일된다. */
  /**
   * 보스 카드 최초 착지 연출: 위에서 낙하 → 바운스 → 바닥 충격 시 좌우 먼지 burst.
   * render() 직후 호출해 DOM에 타일이 있는 상태에서 진행한다.
   */
  async playBossLandingAnimation(cardId: string): Promise<void> {
    const tile = this.findCardElement(cardId)
    if (!tile) return
    // 착지 애니메이션 적용
    tile.classList.remove('is-boss-landing')
    void tile.offsetWidth  // reflow로 애니메이션 재시작
    tile.classList.add('is-boss-landing')
    // 55%(0.72s × 0.55 ≈ 396ms) 지점이 최초 착지 순간 → 먼지 burst 발사
    await new Promise((r) => window.setTimeout(r, 400))
    const rect = tile.getBoundingClientRect()
    const bottomY = rect.bottom - 4
    const centerX = rect.left + rect.width / 2
    // 좌우로 넓게 퍼지는 먼지 이펙트: 중앙 + 좌 + 우 세 포인트에서 폭발
    SquareBurst.playAt(centerX,       bottomY, 'damage',        { count: 22, spread: 220, duration: 560 })
    SquareBurst.playAt(centerX - 80, bottomY, 'bomb-blast',    { count: 14, spread: 140, duration: 480 })
    SquareBurst.playAt(centerX + 80, bottomY, 'bomb-blast',    { count: 14, spread: 140, duration: 480 })
    // 바운스가 완전히 끝날 때까지 대기
    await new Promise((r) => window.setTimeout(r, 340))
    tile.classList.remove('is-boss-landing')
  }
  /** 불씨 기사단장(60F) 등장 연출: 왼쪽 밖에서 오른쪽으로 천천히 날아와 중앙 3×3에 쿵 정착한다. */
  async playWaxKnightSwoopAnimation(cardId: string): Promise<void> {
    const tile = this.findCardElement(cardId)
    if (!tile) return
    const rail = this.boardElement.querySelector<HTMLElement>('.rail')
    tile.classList.remove('is-wax-knight-swooping')
    rail?.classList.remove('is-boss-quaking')
    void tile.offsetWidth  // CSS animation 재시작용 reflow
    tile.classList.add('is-wax-knight-swooping')

    // 느린 비행의 끝부분(약 70%)에 착지 임팩트를 몰아, 도착-쿵 beat가 분리되어 보이게 한다.
    await new Promise((r) => window.setTimeout(r, 880))
    const rect = tile.getBoundingClientRect()
    const centerY = rect.top + rect.height * 0.58
    const centerX = rect.left + rect.width / 2
    rail?.classList.add('is-boss-quaking')
    SquareBurst.playAt(centerX - 132, centerY, 'bomb-blast', { count: 18, spread: 150, duration: 620 })
    SquareBurst.playAt(centerX - 18,  centerY, 'damage',     { count: 32, spread: 240, duration: 720 })
    SquareBurst.playAt(centerX + 104, centerY, 'bomb-blast', { count: 18, spread: 150, duration: 620 })

    await new Promise((r) => window.setTimeout(r, 480))
    tile.classList.remove('is-wax-knight-swooping')
    rail?.classList.remove('is-boss-quaking')
  }
  /** 불씨 기사단장이 사용하는 보스 카드 효과를 한 박자짜리 사각 블라스트로 표시한다. */
  /** 불씨 기사단장 카드 발동 연출:
   *  보스 전용 손패(시련 톤 붉은 카드, 상단 촛농/양초/불씨 일러스트)가 보스 중앙에서
   *  커지듯 나타나 ~1.5초 잔류한 뒤, 팡 터지며 효과별 수치가 알맞은 HUD로 블라스트된다.
   *  - 방패 → 플레이어 방패 칩, 체력 → 플레이어 체력, 피해 → 플레이어 카드로 발사. */
  /** 보스 손패 콤보 공통 연출: 손패 N장을 중앙 정렬로 한 번에 펼친 뒤 중복 카드를 빛내고
   *  보너스 카드를 추가해 순차 해결한다. 100F 마녀(4장)와 60F 불씨 기사단장(2장)이 공유한다.
   *  목적지는 매 해결마다 살아 있는 보스 셀을 다시 찾아 이펙트가 엉뚱한 곳으로 날아가지 않는다. */
  async animateBossHandCombo(
    cardId: string,
    effects: ('shield' | 'heal' | 'strike')[],
    bonusEffects: ('shield' | 'heal' | 'strike')[],
    amount: number,
    onResolve: (effect: 'shield' | 'heal' | 'strike') => Promise<void>,
  ): Promise<void> {
    const tile = this.findCardElement(cardId)
    if (!tile) return

    const cells = Array.from(
      this.boardElement.querySelectorAll<HTMLElement>(`.cell.card[data-card-id="${cardId}"]`)
    ).filter((el) => el.offsetParent !== null)
    const rects = cells.map((c) => c.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0)
    const baseRect = rects.length > 0 ? rects[0] : tile.getBoundingClientRect()
    const bossX = rects.length > 0
      ? (Math.min(...rects.map((r) => r.left)) + Math.max(...rects.map((r) => r.right))) / 2
      : baseRect.left + baseRect.width / 2
    const bossY = rects.length > 0
      ? (Math.min(...rects.map((r) => r.top)) + Math.max(...rects.map((r) => r.bottom))) / 2
      : baseRect.top + baseRect.height / 2
    const metaFor = (effect: 'shield' | 'heal' | 'strike') => ({
      shield: { title: '밀랍 방패', desc: `방패 +${amount}`, label: `방패 +${amount}`, illust: spriteForHandCard('candle'),   burst: 'boss-candle-flame' as const, dest: 'boss-shield' as const },
      heal:   { title: '촛불 가호', desc: `체력 +${amount}`, label: `체력 +${amount}`, illust: spriteForHandCard('wax-drop'), burst: 'boss-wax-drip' as const,     dest: 'boss-health' as const },
      strike: { title: '불씨 일격', desc: `피해 ${amount}`,  label: `피해 ${amount}`,  illust: spriteForHandCard('ember'),    burst: 'boss-ember-spark' as const,  dest: 'player' as const },
    }[effect])
    const createCard = (effect: 'shield' | 'heal' | 'strike', index: number, bonus = false): HTMLElement => {
      const meta = metaFor(effect)
      const card = document.createElement('div')
      card.className = `boss-cast-card boss-cast-card--${effect} boss-witch-combo-card${bonus ? ' is-bonus' : ''}`
      card.dataset.effect = effect
      card.style.left = `${bossX}px`
      card.style.top = `${bossY}px`
      card.style.setProperty('--combo-index', String(index))
      card.innerHTML = `
        <span class="boss-cast-card-glow" aria-hidden="true"></span>
        <span class="boss-cast-card-illust" aria-hidden="true"><img src="${meta.illust}" alt="" /></span>
        <span class="boss-cast-card-title">${meta.title}</span>
        <span class="boss-cast-card-effect">${meta.desc}</span>
      `
      document.body.appendChild(card)
      return card
    }

    // 기본 손패를 같은 박자에 차라락 펼치되, index별 지연으로 좌→우 리듬을 만든다.
    // 카드 장수에 맞춰 중앙 정렬한다(4장이면 ±1.5, 2장이면 ±0.5로 좌우 대칭).
    const centerOffset = (effects.length - 1) / 2
    const cards = effects.map((effect, index) => createCard(effect, index))
    await Promise.all(cards.map((card, index) => card.animate(
      [
        { transform: 'translate(-50%, -50%) scale(0.18) rotate(-7deg)', opacity: 0, filter: 'brightness(1.8)' },
        { transform: `translate(calc(-50% + ${(index - centerOffset) * 118}px), -50%) scale(1.08) rotate(${(index - centerOffset) * 2}deg)`, opacity: 1, filter: 'brightness(1.18)', offset: 0.76 },
        { transform: `translate(calc(-50% + ${(index - centerOffset) * 118}px), -50%) scale(1) rotate(${(index - centerOffset) * 1.2}deg)`, opacity: 1, filter: 'brightness(1)' },
      ],
      { duration: 360, delay: index * 70, easing: 'cubic-bezier(0.18, 0.86, 0.24, 1.18)', fill: 'forwards' }
    ).finished))

    const duplicated = new Set(bonusEffects)
    if (duplicated.size > 0) {
      cards.forEach((card) => {
        if (duplicated.has(card.dataset.effect as 'shield' | 'heal' | 'strike')) card.classList.add('is-duplicate')
      })
      await new Promise((r) => window.setTimeout(r, 420))
    }

    // 중복 효과가 있으면 오른쪽 끝에 5번째 이후 추가 카드를 띵! 하고 꽂는다.
    const bonusCards = bonusEffects.map((effect, bonusIndex) => createCard(effect, effects.length + bonusIndex, true))
    await Promise.all(bonusCards.map((card, bonusIndex) => card.animate(
      [
        { transform: 'translate(calc(-50% + 244px), -50%) scale(0.25) rotate(7deg)', opacity: 0, filter: 'brightness(2.2)' },
        { transform: `translate(calc(-50% + ${244 + bonusIndex * 82}px), -50%) scale(1.16) rotate(4deg)`, opacity: 1, filter: 'brightness(1.7)', offset: 0.62 },
        { transform: `translate(calc(-50% + ${244 + bonusIndex * 82}px), -50%) scale(1) rotate(2deg)`, opacity: 1, filter: 'brightness(1)' },
      ],
      { duration: 320, delay: bonusIndex * 80, easing: 'cubic-bezier(0.18, 0.86, 0.24, 1.22)', fill: 'forwards' }
    ).finished))

    const sequence = [...cards, ...bonusCards]
    for (const card of sequence) {
      const effect = card.dataset.effect as 'shield' | 'heal' | 'strike'
      const meta = metaFor(effect)
      card.classList.add('is-resolving')
      await onResolve(effect)
      const cardRect = card.getBoundingClientRect()
      const originX = cardRect.left + cardRect.width / 2
      const originY = cardRect.top + cardRect.height / 2
      // onResolve가 보드를 다시 렌더해 캡처해 둔 tile이 떨어져 나갔을 수 있다.
      // 방패/체력 목적지는 매번 살아 있는 보스 셀을 다시 찾아 좌표가 화면 밖/0,0으로 새는 걸 막는다.
      const liveTile = this.findCardElement(cardId) ?? tile
      const destEl =
        meta.dest === 'player'
          ? this.boardElement.querySelector<HTMLElement>('.player-card')
          : meta.dest === 'boss-shield'
            ? (liveTile.querySelector<HTMLElement>('.boss-face-shield-chip') ?? liveTile.querySelector<HTMLElement>('.boss-face-hp-column'))
            : (liveTile.querySelector<HTMLElement>('.boss-face-hpbar') ?? liveTile.querySelector<HTMLElement>('.boss-face-hp-column'))
      SquareBurst.playAt(originX, originY, meta.burst, { count: effect === 'strike' ? 24 : 18, spread: 180, duration: 520 })
      void this.spawnFieldFloatText(originX, originY - 24, meta.label)
      liveTile.classList.add('is-wax-knight-casting')
      // 카드별 사용 템포를 더 빠르게 — 트레일 입자 수와 퇴장/간격을 줄여 하나씩 처리되는 답답함을 줄인다.
      if (destEl) await this.animateResourceTrail(new DOMRect(originX - 10, originY - 10, 20, 20), destEl, effect === 'strike' ? 4 : 3, meta.burst)
      liveTile.classList.remove('is-wax-knight-casting')
      await card.animate(
        [
          { transform: getComputedStyle(card).transform === 'none' ? 'translate(-50%, -50%) scale(1)' : getComputedStyle(card).transform, opacity: 1, filter: 'brightness(1.4)' },
          { transform: 'translate(-50%, -50%) scale(0.38) rotate(5deg)', opacity: 0, filter: 'brightness(2.4)' },
        ],
        { duration: 150, easing: 'cubic-bezier(0.5, 0, 0.6, 1)', fill: 'forwards' }
      ).finished
      card.remove()
      if (effect === 'strike') await new Promise((r) => window.setTimeout(r, 30))
    }
  }

  /** 밀랍 조각사(2×3) 등장 연출.
   *  6칸 동시 투명→확대→쿵 착지. 착지 순간 중심 블라스트. */
  async playWaxSculptorAppearAnimation(cardId: string): Promise<void> {
    const allFaces = Array.from(
      document.querySelectorAll<HTMLElement>(
        `.rail-row.dist-0 .cell[data-card-id="${cardId}"] .boss-face,
         .rail-row.dist-1 .cell[data-card-id="${cardId}"] .boss-face`
      )
    )
    if (allFaces.length === 0) return

    // 6칸 동시 등장 애니메이션 시작
    allFaces.forEach((face) => face.classList.add('is-wax-sculptor-entering'))

    // 55%=308ms 지점이 최대 확대(peak), 80%=448ms 지점이 쿵 착지
    // 블라스트는 착지 순간(448ms)에 맞춰 발사한다
    await new Promise((r) => window.setTimeout(r, 448))

    // 착지 순간 가시 face(display:none인 행은 제외)의 중심 기준 블라스트
    const rects = allFaces
      .map((f) => f.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.height > 0)
    if (rects.length === 0) return
    const cx = (Math.min(...rects.map((r) => r.left)) + Math.max(...rects.map((r) => r.right))) / 2
    const cy = (Math.min(...rects.map((r) => r.top))  + Math.max(...rects.map((r) => r.bottom))) / 2
    SquareBurst.playAt(cx, cy, 'damage', { count: 32, spread: 260, duration: 580 })

    // 나머지 애니메이션(80%→100% = 108ms) 완료 후 클래스 정리
    await new Promise((r) => window.setTimeout(r, 160))
    allFaces.forEach((face) => face.classList.remove('is-wax-sculptor-entering'))
    await new Promise((r) => window.setTimeout(r, 180))
  }

  /** 밀랍 조각사 전방 복귀 연출: 위에서 쿵 떨어지듯 착지 → 기절하듯 사각 블라스트. */
  async playSculptorReturnAnimation(cardId: string): Promise<void> {
    const faces = Array.from(
      this.boardElement.querySelectorAll<HTMLElement>(
        `.cell.card[data-card-id="${cardId}"] .boss-face`
      )
    )
    if (faces.length === 0) return
    faces.forEach((f) => {
      f.classList.remove('is-wax-sculptor-returning')
      void f.offsetWidth  // reflow로 재시작
      f.classList.add('is-wax-sculptor-returning')
    })
    // 쿵 착지(85% ≈ 408ms) 시점에 맞춰 블라스트
    await new Promise((r) => window.setTimeout(r, 408))
    const rects = faces
      .map((f) => f.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.height > 0)
    if (rects.length > 0) {
      const cx = (Math.min(...rects.map((r) => r.left)) + Math.max(...rects.map((r) => r.right))) / 2
      const cy = (Math.min(...rects.map((r) => r.top))  + Math.max(...rects.map((r) => r.bottom))) / 2
      // 중앙 강타 + 좌우로 튀는 기절 톤 사각 블라스트
      SquareBurst.playAt(cx,       cy, 'damage',     { count: 28, spread: 240, duration: 560 })
      SquareBurst.playAt(cx - 90,  cy, 'bomb-blast', { count: 14, spread: 150, duration: 480 })
      SquareBurst.playAt(cx + 90,  cy, 'bomb-blast', { count: 14, spread: 150, duration: 480 })
    }
    await new Promise((r) => window.setTimeout(r, 200))
    faces.forEach((f) => f.classList.remove('is-wax-sculptor-returning'))
  }

  /** 조각사 소환 연출 — 좌→우 순서로 각 적이 작은 상태에서 확대되며 격렬하게 흔들려 들어온다.
   *  enemyIds는 레인 0→1→2 순서로 전달한다. */
  async animateSculptorSummonEnemies(enemyIds: string[]): Promise<void> {
    const STAGGER = 160  // 레인 간 지연 ms
    const animations: Promise<void>[] = []

    for (let i = 0; i < enemyIds.length; i++) {
      const delay = i * STAGGER
      const id = enemyIds[i]
      animations.push(
        new Promise<void>((resolve) => {
          window.setTimeout(() => {
            const el = this.boardElement.querySelector<HTMLElement>(
              `.cell.card[data-card-id="${id}"]`
            )
            if (!el) { resolve(); return }
            // 소환 시 사각 버스트 (작은 폭발 톤)
            SquareBurst.playOn(el, 'damage', { count: 12, spread: 100, duration: 480 })
            el.classList.add('is-sculptor-summoning')
            window.setTimeout(() => {
              el.classList.remove('is-sculptor-summoning')
              resolve()
            }, 620)
          }, delay)
        })
      )
    }
    await Promise.all(animations)
    // 마지막 카드 애니메이션이 끝난 후 짧은 여운
    await new Promise((r) => window.setTimeout(r, 120))
  }

  /** 후방 페이즈 조각사 공격 전용 연출 — 들어올려짐 → 돌진 → 쾅 착지 → 복귀.
   *  일반 animateEnemyAttacks보다 dy 범위가 크고 위로 들어올리는 프리임이 추가된다. */
  async animateSculptorBackAttack(cardId: string): Promise<void> {
    const element = this.findCardElement(cardId)
    if (!element) return
    const player = this.boardElement.querySelector<HTMLElement>('.player-card, .player-row')
    if (!player) return
    const rect = element.getBoundingClientRect()
    const playerRect = player.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return

    const dx = (playerRect.left + playerRect.width / 2 - (rect.left + rect.width / 2)) * 0.30
    // 조각사 상단 → 플레이어 상단까지 전체 거리 (캡 없음 — 실제 이동량)
    const dy = playerRect.top - rect.top + 24

    const clone = element.cloneNode(true) as HTMLElement
    element.classList.add('is-enemy-slamming-source')
    clone.classList.add('enemy-attack-clone')
    clone.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;margin:0;z-index:250;pointer-events:none;transform-origin:50% 100%`
    document.body.appendChild(clone)

    const animation = clone.animate(
      [
        // 현재 위치
        { transform: 'translate(0,0) scale(1,1)',                                        filter: 'brightness(1)',                                                               offset: 0    },
        // 위로 들어올려짐 — 대기라인 이탈 느낌
        { transform: 'translate(0,-38px) scale(1.09,0.93)',                              filter: 'brightness(1.45) drop-shadow(0 -14px 20px rgba(220,110,50,0.65))',            offset: 0.17 },
        // 돌진 중간
        { transform: `translate(${dx*0.52}px,${dy*0.52}px) scale(1.15,0.85)`,           filter: 'brightness(1.7) drop-shadow(0 32px 40px rgba(200,48,48,0.82))',               offset: 0.50 },
        // 쾅 착지
        { transform: `translate(${dx}px,${dy}px) scale(1.26,0.70)`,                     filter: 'brightness(1.9) drop-shadow(0 44px 52px rgba(224,24,24,0.96))',               offset: 0.61 },
        // 반동
        { transform: `translate(${dx*0.07}px,${dy*0.03}px) scale(0.97,1.05)`,           filter: 'brightness(1.06)',                                                            offset: 0.82 },
        { transform: 'translate(0,0) scale(1,1)',                                        filter: 'brightness(1)',                                                               offset: 1    },
      ],
      { duration: 760, easing: 'cubic-bezier(0.18, 0.96, 0.22, 1)', fill: 'forwards' }
    )

    return new Promise<void>((resolve) => {
      animation.onfinish = () => { clone.remove(); element.classList.remove('is-enemy-slamming-source'); resolve() }
      window.setTimeout(() => { clone.remove(); element.classList.remove('is-enemy-slamming-source'); resolve() }, 940)
    })
  }

  async playBossDefeatSequence(cardId: string): Promise<void> {
    const tile = this.findCardElement(cardId)
    if (!tile) return
    // 확대 폭발이 레일/스테이지 밖으로 번져도 잘리지 않도록 상위 클리핑을 잠시 푼다.
    this.boardElement.classList.add('is-boss-finale')
    tile.classList.add('is-boss-defeating')

    // beat 1: 흔들 + 작은 burst 두 번 — 일반 enemy hit burst('damage') 톤.
    SquareBurst.playOn(tile, 'damage', { count: 16, spread: 140, duration: 520 })
    await new Promise((r) => window.setTimeout(r, 220))
    SquareBurst.playOn(tile, 'damage', { count: 18, spread: 160, duration: 520 })
    await new Promise((r) => window.setTimeout(r, 240))

    // beat 2: 3~5줄 랜덤 균열선 삽입 + 갈라짐 클래스 + burst.
    const lineCount = 3 + Math.floor(Math.random() * 3)
    for (let i = 0; i < lineCount; i++) {
      const line = document.createElement('div')
      // 대각선 방향 유지: 50~130도 기반, 50% 확률로 방향 반전, ±10 jitter
      const base = 50 + Math.random() * 80
      const angle = (Math.random() < 0.5 ? 1 : -1) * base
      const pos = 12 + Math.random() * 76        // 카드 전체에 분산 (12~88%)
      const w = 1.1 + Math.random() * 1.1        // 선 굵기 1.1~2.2%
      const alpha = (0.82 + Math.random() * 0.15).toFixed(2)
      line.className = 'boss-crack-line'
      line.style.background = [
        `linear-gradient(${angle.toFixed(1)}deg,`,
        `transparent ${(pos - w).toFixed(1)}%,`,
        `rgba(255,224,168,${alpha}) ${(pos - w * 0.3).toFixed(1)}%,`,
        `rgba(255,204,120,${alpha}) ${(pos + w * 0.3).toFixed(1)}%,`,
        `transparent ${(pos + w).toFixed(1)}%)`,
      ].join(' ')
      line.style.animationDelay = `${Math.round(Math.random() * 110)}ms`
      tile.appendChild(line)
    }
    tile.classList.add('is-boss-cracking')
    SquareBurst.playOn(tile, 'treasure-gain', { count: 22, spread: 180, duration: 560 })
    await new Promise((r) => window.setTimeout(r, 360))

    // beat 3: 펑 — 큰 burst + 흐릿 확대 사라짐(.is-boss-blown).
    SquareBurst.playOn(tile, 'treasure-gain', { count: 32, spread: 230, duration: 760 })
    tile.classList.add('is-boss-blown')
    await new Promise((r) => window.setTimeout(r, 640))
    // 격파 연출 종료 — 상위 컨테이너 클리핑을 원복한다.
    this.boardElement.classList.remove('is-boss-finale')
  }

  /** 검은 양초 악마 공격 주기: 1~3장의 검은 양초 보스 손패를 순차 발동한다.
   *  각 카드에 실시간 누적 피해(startingCounter+1, +2, ...) 를 표시하고, onEachCandle 콜백으로 효과를 적용한다. */
  async animateDemonCandleTurn(
    cardId: string,
    count: number,
    startingCounter: number,
    onEachCandle: (index: number) => Promise<void>,
  ): Promise<void> {
    const tile = this.findCardElement(cardId)
    if (!tile) return

    const cells = Array.from(
      this.boardElement.querySelectorAll<HTMLElement>(`.cell.card[data-card-id="${cardId}"]`)
    ).filter((el) => el.offsetParent !== null)
    const rects = cells.map((c) => c.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0)
    const baseRect = rects.length > 0 ? rects[0] : tile.getBoundingClientRect()
    const bossX = rects.length > 0
      ? (Math.min(...rects.map((r) => r.left)) + Math.max(...rects.map((r) => r.right))) / 2
      : baseRect.left + baseRect.width / 2
    const bossY = rects.length > 0
      ? (Math.min(...rects.map((r) => r.top)) + Math.max(...rects.map((r) => r.bottom))) / 2
      : baseRect.top + baseRect.height / 2

    const centerOffset = (count - 1) / 2
    const createCandleCard = (index: number, counter: number): HTMLElement => {
      const card = document.createElement('div')
      card.className = 'boss-cast-card boss-cast-card--demon-candle'
      card.style.left = `${bossX}px`
      card.style.top = `${bossY}px`
      card.style.setProperty('--combo-index', String(index))
      card.innerHTML = `
        <span class="boss-cast-card-glow" aria-hidden="true"></span>
        <span class="boss-cast-card-illust" aria-hidden="true"><img src="${spriteForHandCard('black-candle')}" alt="" /></span>
        <span class="boss-cast-card-title">검은 양초</span>
        <span class="boss-cast-card-effect">피해 ${counter}</span>
      `
      document.body.appendChild(card)
      return card
    }

    // 전체 카드를 미리 펼쳐 예고한 뒤 순차 발동한다.
    const cards = Array.from({ length: count }, (_, i) => createCandleCard(i, startingCounter + i + 1))
    await Promise.all(cards.map((card, index) => card.animate(
      [
        { transform: 'translate(-50%, -50%) scale(0.18) rotate(-7deg)', opacity: 0, filter: 'brightness(1.8)' },
        { transform: `translate(calc(-50% + ${(index - centerOffset) * 118}px), -50%) scale(1.08) rotate(${(index - centerOffset) * 2}deg)`, opacity: 1, filter: 'brightness(1.18)', offset: 0.76 },
        { transform: `translate(calc(-50% + ${(index - centerOffset) * 118}px), -50%) scale(1) rotate(${(index - centerOffset) * 1.2}deg)`, opacity: 1, filter: 'brightness(1)' },
      ],
      { duration: 360, delay: index * 70, easing: 'cubic-bezier(0.18, 0.86, 0.24, 1.18)', fill: 'forwards' }
    ).finished))

    for (let i = 0; i < count; i++) {
      const card = cards[i]
      card.classList.add('is-resolving')
      await onEachCandle(i)
      const counter = startingCounter + i + 1
      const cardRect = card.getBoundingClientRect()
      const originX = cardRect.left + cardRect.width / 2
      const originY = cardRect.top + cardRect.height / 2
      SquareBurst.playAt(originX, originY, 'demon-vortex', { count: 20, spread: 160, duration: 480 })
      void this.spawnFieldFloatText(originX, originY - 24, `피해 ${counter}`)
      const playerEl = this.boardElement.querySelector<HTMLElement>('.player-card')
      if (playerEl) await this.animateResourceTrail(new DOMRect(originX - 10, originY - 10, 20, 20), playerEl, 4, 'demon-vortex')
      await card.animate(
        [
          { opacity: 1, filter: 'brightness(1.4)' },
          { opacity: 0, transform: 'translate(-50%, -50%) scale(0.38) rotate(5deg)', filter: 'brightness(2.4)' },
        ],
        { duration: 150, easing: 'cubic-bezier(0.5, 0, 0.6, 1)', fill: 'forwards' }
      ).finished
      card.remove()
    }
  }

  /** 거짓과 진실: 단일 크고 보라빛 카드를 펼쳐 isTrue 여부를 보여주고 applyEffect 콜백으로 게임 로직을 적용한다. */
  async animateDemonTruthLie(
    cardId: string,
    isTrue: boolean,
    onResolve: () => Promise<void>,
  ): Promise<void> {
    const tile = this.findCardElement(cardId)
    if (!tile) return

    const cells = Array.from(
      this.boardElement.querySelectorAll<HTMLElement>(`.cell.card[data-card-id="${cardId}"]`)
    ).filter((el) => el.offsetParent !== null)
    const rects = cells.map((c) => c.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0)
    const baseRect = rects.length > 0 ? rects[0] : tile.getBoundingClientRect()
    const bossX = rects.length > 0
      ? (Math.min(...rects.map((r) => r.left)) + Math.max(...rects.map((r) => r.right))) / 2
      : baseRect.left + baseRect.width / 2
    const bossY = rects.length > 0
      ? (Math.min(...rects.map((r) => r.top)) + Math.max(...rects.map((r) => r.bottom))) / 2
      : baseRect.top + baseRect.height / 2

    const card = document.createElement('div')
    card.className = `boss-cast-card demon-truth-lie-card boss-cast-card--${isTrue ? 'truth' : 'lie'}`
    card.style.left = `${bossX}px`
    card.style.top = `${bossY}px`
    card.innerHTML = `
      <span class="boss-cast-card-glow" aria-hidden="true"></span>
      <span class="boss-cast-card-illust demon-truth-lie-illust" aria-hidden="true">
        <span class="demon-truth-lie-symbol">${isTrue ? '眞' : '假'}</span>
      </span>
      <span class="boss-cast-card-title">거짓과 진실</span>
      <span class="boss-cast-card-effect">${isTrue ? '진실' : '거짓'}</span>
    `
    document.body.appendChild(card)

    await card.animate(
      [
        { transform: 'translate(-50%, -50%) scale(0.18) rotate(-7deg)', opacity: 0, filter: 'brightness(1.8)' },
        { transform: 'translate(-50%, -50%) scale(1.12) rotate(0deg)', opacity: 1, filter: 'brightness(1.3)', offset: 0.7 },
        { transform: 'translate(-50%, -50%) scale(1) rotate(0deg)', opacity: 1, filter: 'brightness(1)' },
      ],
      { duration: 520, easing: 'cubic-bezier(0.18, 0.86, 0.24, 1.18)', fill: 'forwards' }
    ).finished
    await new Promise((r) => window.setTimeout(r, 600))

    card.classList.add('is-resolving')
    await onResolve()

    const cardRect = card.getBoundingClientRect()
    const originX = cardRect.left + cardRect.width / 2
    const originY = cardRect.top + cardRect.height / 2
    SquareBurst.playAt(originX, originY, 'demon-vortex', { count: 28, spread: 200, duration: 600 })
    const liveTile = this.findCardElement(cardId) ?? tile
    if (isTrue) {
      void this.spawnFieldFloatText(originX, originY - 24, '진실 — 체력+10 공격+1')
      const atkEl = liveTile.querySelector<HTMLElement>('.boss-face-atk') ?? liveTile
      await this.animateResourceTrail(new DOMRect(originX - 10, originY - 10, 20, 20), atkEl, 6, 'demon-vortex')
    } else {
      void this.spawnFieldFloatText(originX, originY - 24, '거짓 — 손패 파괴')
    }

    await card.animate(
      [
        { opacity: 1, filter: 'brightness(1.4)' },
        { opacity: 0, transform: 'translate(-50%, -50%) scale(0.38) rotate(5deg)', filter: 'brightness(2.4)' },
      ],
      { duration: 200, easing: 'cubic-bezier(0.5, 0, 0.6, 1)', fill: 'forwards' }
    ).finished
    card.remove()
  }

  /** 검은 양초 악마 격파 시 보라빛 균열 소용돌이 소멸 연출. */
  async playDemonDefeatSequence(cardId: string): Promise<void> {
    const tile = this.findCardElement(cardId)
    if (!tile) return
    this.boardElement.classList.add('is-boss-finale')
    tile.classList.add('is-boss-defeating')
    tile.classList.add('is-demon-dying')

    SquareBurst.playOn(tile, 'demon-vortex', { count: 20, spread: 160, duration: 560 })
    await new Promise((r) => window.setTimeout(r, 280))
    SquareBurst.playOn(tile, 'demon-vortex', { count: 24, spread: 200, duration: 560 })
    await new Promise((r) => window.setTimeout(r, 300))

    // 보라빛 균열선 삽입
    const cells = this.collectVisibleBossCells(cardId)
    for (const cell of cells) {
      for (let i = 0; i < 4; i++) {
        const line = document.createElement('div')
        const base = 40 + Math.random() * 100
        const angle = (Math.random() < 0.5 ? 1 : -1) * base
        const pos = 12 + Math.random() * 76
        const w = 1.1 + Math.random() * 1.1
        const alpha = (0.82 + Math.random() * 0.15).toFixed(2)
        line.className = 'boss-crack-line demon-crack-line'
        line.style.background = [
          `linear-gradient(${angle.toFixed(1)}deg,`,
          `transparent ${(pos - w).toFixed(1)}%,`,
          `rgba(180,80,240,${alpha}) ${(pos - w * 0.3).toFixed(1)}%,`,
          `rgba(140,40,200,${alpha}) ${(pos + w * 0.3).toFixed(1)}%,`,
          `transparent ${(pos + w).toFixed(1)}%)`,
        ].join(' ')
        line.style.animationDelay = `${Math.round(Math.random() * 110)}ms`
        cell.appendChild(line)
      }
      cell.classList.add('is-boss-cracking')
    }
    SquareBurst.playOn(tile, 'demon-vortex', { count: 30, spread: 220, duration: 640 })
    await new Promise((r) => window.setTimeout(r, 400))

    SquareBurst.playOn(tile, 'demon-vortex', { count: 40, spread: 280, duration: 800 })
    tile.classList.add('is-boss-blown')
    await new Promise((r) => window.setTimeout(r, 700))
    this.boardElement.classList.remove('is-boss-finale')
  }

  /** 100F 마녀 격파 직전 컷신의 보스 칸 전부를 모으는 헬퍼. 3×3 보스라 보이는 셀이 여러 장이다. */
  private collectVisibleBossCells(cardId: string): HTMLElement[] {
    return Array.from(
      this.boardElement.querySelectorAll<HTMLElement>(`.cell.card[data-card-id="${cardId}"]`)
    ).filter((el) => el.offsetParent !== null)
  }

  /** 격파 직전 빛의 선 한 줄을 보스 칸에 그린다. beat가 커질수록 더 밝고 가는 빛이 늘어난다. */
  private drawWitchLightLine(cell: HTMLElement): void {
    const line = document.createElement('div')
    const base = 40 + Math.random() * 100
    const angle = (Math.random() < 0.5 ? 1 : -1) * base
    const pos = 8 + Math.random() * 84            // 칸 전체에 분산
    const w = 0.5 + Math.random() * 0.9           // 가는 빛줄기
    line.className = 'witch-light-line'
    line.style.background = [
      `linear-gradient(${angle.toFixed(1)}deg,`,
      `transparent ${(pos - w).toFixed(1)}%,`,
      `rgba(255,250,232,0.96) ${pos.toFixed(1)}%,`,
      `transparent ${(pos + w).toFixed(1)}%)`,
    ].join(' ')
    line.style.animationDelay = `${Math.round(Math.random() * 130)}ms`
    cell.appendChild(line)
  }

  /** 마녀 격파 직전 한 마디: 빛의 선 묶음을 긋고, 미세 떨림과 칸 확대를 건다. */
  async playWaxWitchDeathBeat(cardId: string, beat: number): Promise<void> {
    const cells = this.collectVisibleBossCells(cardId)
    if (cells.length === 0) return
    // 컷신 확대도 레일/스테이지 밖으로 번질 수 있게 클리핑을 푼다(폭발 시퀀스 종료 시 원복).
    this.boardElement.classList.add('is-boss-finale')
    const scale = (1 + beat * 0.05).toFixed(3)
    for (const cell of cells) {
      for (let i = 0; i < beat + 1; i++) this.drawWitchLightLine(cell)
      cell.classList.add('is-witch-dying')
      cell.style.setProperty('--witch-death-scale', scale)
      // 떨림은 매 마디 1회 재시작(클래스 토글 + reflow).
      cell.classList.remove('is-witch-trembling')
      void cell.offsetWidth
      cell.classList.add('is-witch-trembling')
    }
    // 빛줄기가 번지는 만큼만 짧게 기다리고 반환 — 떨림/확대는 대사가 뜬 동안 이어진다.
    await new Promise((r) => window.setTimeout(r, 320))
  }

  /** 마지막 마디: 빛의 선이 마구 그어진다. 직후 호출되는 폭발 시퀀스로 자연스럽게 넘어간다. */
  async playWaxWitchDeathFrenzy(cardId: string): Promise<void> {
    const cells = this.collectVisibleBossCells(cardId)
    if (cells.length === 0) return
    for (const cell of cells) {
      cell.classList.add('is-witch-dying')
      cell.style.setProperty('--witch-death-scale', '1.2')
      cell.classList.add('is-witch-frenzy')
    }
    // 빛의 선을 짧은 간격으로 연달아 긋는다.
    for (let burst = 0; burst < 5; burst++) {
      for (const cell of cells) {
        this.drawWitchLightLine(cell)
        this.drawWitchLightLine(cell)
      }
      await new Promise((r) => window.setTimeout(r, 90))
    }
    await new Promise((r) => window.setTimeout(r, 160))
    // 폭발 시퀀스가 transform을 다시 잡도록 확대/떨림 잔여 클래스를 정리한다.
    for (const cell of cells) {
      cell.classList.remove('is-witch-trembling', 'is-witch-frenzy', 'is-witch-dying')
      cell.style.removeProperty('--witch-death-scale')
    }
  }

  /** runCardPool이 바뀔 때마다 호출해 도감 손패/조합 탭의 잠금 표시를 갱신한다. */
  setLockedCardIds(ids: readonly HandCardId[]): void {
    this.lockedCardIds = new Set(ids)
  }

  /** 해금팩 선택 후 호출해 도감 조합 탭의 레시피 잠금 표시를 갱신한다. */
  setLockedRecipeIds(ids: readonly string[]): void {
    this.lockedRecipeIds = new Set(ids)
  }

  /** Open the compendium overlay listing every field-card + hand-card def
   *  with stats and descriptions. Pure read-only browser; pressing the
   *  close button or ESC dismisses. */
  openCompendium(): void {
    let host = document.getElementById('compendium-overlay') as HTMLElement | null
    if (!host) {
      host = document.createElement('div')
      host.id = 'compendium-overlay'
      host.className = 'compendium-overlay'
      document.body.appendChild(host)
      host.addEventListener('click', (e) => {
        const t = e.target as HTMLElement
        if (t.dataset.compendiumClose !== undefined || t === host) {
          this.closeCompendium()
        }
        if (t.dataset.compendiumTab) {
          this.switchCompendiumTab(t.dataset.compendiumTab)
        }
      })
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && host?.classList.contains('is-open')) {
          this.closeCompendium()
        }
      })
    }
    host.innerHTML = this.renderCompendium('enemies')
    this.attachCompendiumRecipeFloat(host)
    host.classList.add('is-open')
  }

  private closeCompendium(): void {
    document.querySelectorAll('.compendium-recipe-float').forEach((el) => el.remove())
    document.getElementById('compendium-overlay')?.classList.remove('is-open')
  }

  private switchCompendiumTab(tab: string): void {
    const host = document.getElementById('compendium-overlay')
    if (!host) return
    document.querySelectorAll('.compendium-recipe-float').forEach((el) => el.remove())
    host.innerHTML = this.renderCompendium(tab)
    this.attachCompendiumRecipeFloat(host)
  }

  private renderCompendium(activeTab: string): string {
    const tabs: { id: string; label: string }[] = [
      { id: 'enemies', label: '적' },
      { id: 'traps', label: '함정' },
      { id: 'treasures', label: '보물' },
      { id: 'flowers', label: '꽃' },
      { id: 'packs', label: '카드팩' },
      { id: 'relics', label: '유물' },
      { id: 'hand', label: '손패' },
      { id: 'combo', label: '조합' },
      { id: 'terms', label: '용어' },
    ]
    const tabBar = tabs
      .map(
        (t) =>
          `<button class="compendium-tab ${t.id === activeTab ? 'is-active' : ''}" data-compendium-tab="${t.id}">${t.label}</button>`
      )
      .join('')
    let body = ''
    if (activeTab === 'enemies') body = this.renderCompendiumEnemies()
    else if (activeTab === 'traps') body = this.renderCompendiumTraps()
    else if (activeTab === 'treasures') body = this.renderCompendiumTreasures()
    else if (activeTab === 'flowers') body = this.renderCompendiumFlowers()
    else if (activeTab === 'hand') body = this.renderCompendiumHand()
    else if (activeTab === 'combo') body = this.renderCompendiumCombo()
    else if (activeTab === 'packs') body = this.renderCompendiumPacks()
    else if (activeTab === 'relics') body = this.renderCompendiumRelics()
    else body = this.renderCompendiumTerms()
    return `
      <div class="compendium-modal" role="dialog" aria-label="도감">
        <header class="compendium-header">
          <h2 class="compendium-title">
            <span class="compendium-title-icon">${bookIcon()}</span>
            도감
          </h2>
          <button class="compendium-close" data-compendium-close type="button" aria-label="닫기">✕</button>
        </header>
        <nav class="compendium-tabs" role="tablist">${tabBar}</nav>
        <section class="compendium-body" role="tabpanel">${body}</section>
        <footer class="compendium-footer">ESC 또는 바깥 클릭으로 닫기</footer>
      </div>
    `
  }

  private renderCompendiumEnemies(): string {
    const heart = heartIcon()
    const sword = swordIcon()
    const encountered = this.currentGameState?.encounteredEnemyNames ?? new Set<string>()

    // 개별 적 타일: 만난 적은 정상 표시, 미발견은 어둡게 처리.
    const enemyTile = (def: (typeof ENEMY_DEFINITIONS)[0]) => {
      const hp = def.healthOrDamage ?? 1
      const atk = def.attack ?? 1
      const spriteUrl = def.enemySpriteId ? SpriteUrls[def.enemySpriteId] : SpriteUrls.enemyMouse
      const known = encountered.has(def.name)
      return this.codexTile({
        art: { kind: 'sprite', url: spriteUrl },
        name: known ? def.name : '???',
        tag: '1칸',
        chips: known
          ? [{ icon: heart, value: String(hp), tone: 'hp' }, { icon: sword, value: String(atk), tone: 'atk' }]
          : [],
        extraClass: known ? undefined : 'codex-tile--unknown',
      })
    }
    const allEnemyTiles = ENEMY_DEFINITIONS.map(enemyTile).join('')

    // 합쳐진 적: 해당 이름이 encounteredEnemyNames에 있으면 표시.
    const formationTile = (span: 2 | 3, name: string, sprite: string) => {
      const bonus = span === 2 ? 2 : 3
      const known = encountered.has(name)
      return this.codexTile({
        art: { kind: 'sprite', url: sprite },
        name: known ? name : '???',
        tag: `${span}칸`,
        chips: known
          ? [{ icon: heart, value: `합산 +${bonus}`, tone: 'hp' }, { icon: sword, value: `합산 +${bonus}`, tone: 'atk' }]
          : [],
        note: known ? `구성원 HP/ATK 합 +${bonus}/${bonus}.` : undefined,
        extraClass: known ? undefined : 'codex-tile--unknown',
      })
    }
    const mergeTwo = formationTile(2, '양초 무리', SpriteUrls.enemyWaves[2])
    const mergeThree = formationTile(3, '양초 군단', SpriteUrls.enemyWaves[3])

    // 미믹: 3가지 크기를 각각 독립 타일로.
    const mimicTiles = ([1, 2, 3] as const).map((span) => {
      const stats = MIMIC_BY_SPAN[span]
      const known = encountered.has('미믹')
      return this.codexTile({
        art: { kind: 'sprite', url: SpriteUrls.mimic },
        name: known ? '미믹' : '???',
        tag: `${span}칸`,
        chips: known
          ? [
              { icon: heart, value: String(stats.health), tone: 'hp' },
              { icon: sword, value: String(stats.attack), tone: 'atk' },
              { label: '드롭 ', value: `${stats.drops}장`, tone: 'gold' },
            ]
          : [],
        note: known && span === 1 ? '보물상자가 변이된 특수 적.' : undefined,
        extraClass: known ? undefined : 'codex-tile--unknown',
      })
    }).join('')

    // 괴물꽃 (꽃 탭에서 이동).
    const monsterFlowerKnown = encountered.has('괴물꽃')
    const monsterFlowerTile = this.codexTile({
      art: { kind: 'sprite', url: SpriteUrls.monsterFlower },
      name: monsterFlowerKnown ? '괴물꽃' : '???',
      tag: '특수 적',
      chips: monsterFlowerKnown
        ? [{ icon: heart, value: '꽃 수확값', tone: 'hp' }, { icon: sword, value: '꽃 수확값', tone: 'atk' }]
        : [],
      note: monsterFlowerKnown ? '꽃이 시들면 변이. 괴물꽃끼리만 병합.' : undefined,
      extraClass: monsterFlowerKnown ? undefined : 'codex-tile--unknown',
    })

    // 보스: 층별로 별도 타일을 유지해 처치/조우 진행도가 더 잘 읽히게 한다.
    const bossTile = (name: string, sprite: string, floor: string, hp: string, atk: string, note: string) => {
      const known = encountered.has(name)
      return this.codexTile({
        art: { kind: 'sprite', url: sprite },
        name: known ? name : '???',
        tag: `${floor} 보스`,
        chips: known
          ? [{ icon: heart, value: hp, tone: 'hp' }, { icon: sword, value: atk, tone: 'atk' }]
          : [],
        note: known ? note : undefined,
        extraClass: known ? undefined : 'codex-tile--unknown',
      })
    }
    const bossTiles = [
      bossTile('양초 백작', SpriteUrls.boss, '30F', '50', '5', '30턴 제단 수문장. 3×3 보스.'),
      bossTile('불씨 기사단장', SpriteUrls.boss60, '60F', '80', '7', '저택의 방패. 3턴마다 기사단장의 손패 2장 발동.'),
      bossTile('밀랍 조각사', SpriteUrls.boss90, '90F', '60', '4', '90턴 제단 보스. 3턴마다 후방 이동과 소환 페이즈 사용.'),
    ].join('')

    return `
      <h3 class="compendium-section">적</h3>
      <div class="codex-tile-grid">${allEnemyTiles}</div>
      <h3 class="compendium-section">합쳐진 적</h3>
      <div class="codex-tile-grid">${mergeTwo}${mergeThree}</div>
      <h3 class="compendium-section">특수 적</h3>
      <div class="codex-tile-grid">${mimicTiles}${monsterFlowerTile}</div>
      <h3 class="compendium-section">보스</h3>
      <div class="codex-tile-grid">${bossTiles}</div>
    `
  }

  private renderCompendiumTraps(): string {
    const sword = swordIcon()
    const seen = this.currentGameState?.encounteredCardNames ?? new Set<string>()

    const webNames: Record<1 | 2 | 3, string> = { 1: '양초 거미줄', 2: '촛농 거미집', 3: '밀랍 거미굴' }
    const webDamage: Record<1 | 2 | 3, string> = { 1: '1', 2: '5', 3: '999' }
    const webTiles = ([1, 2, 3] as const)
      .map((span) => {
        const known = seen.has(webNames[span])
        return this.codexTile({
          art: { kind: 'sprite', url: SpriteUrls.trapGroups.web[span] },
          name: known ? webNames[span] : '???',
          tag: `${span}칸`,
          chips: known ? [{ icon: sword, value: webDamage[span], tone: 'atk' }] : [],
          extraClass: known ? undefined : 'codex-tile--unknown',
        })
      })
      .join('')

    const sporeNames: Record<1 | 2 | 3, string> = { 1: '감염 포자', 2: '번식 포자군', 3: '포자 군락' }
    const sporeDamage: Record<1 | 2 | 3, string> = { 1: '1', 2: '3', 3: '5' }
    const sporeTiles = ([1, 2, 3] as const)
      .map((span) => {
        const known = seen.has(sporeNames[span])
        return this.codexTile({
          art: { kind: 'sprite', url: SpriteUrls.trapGroups.spore[span] },
          name: known ? sporeNames[span] : '???',
          tag: `${span}칸`,
          chips: known
            ? [
                { icon: sword, value: sporeDamage[span], tone: 'atk' },
                { label: '전염 ', value: '2턴마다', tone: 'spore' },
              ]
            : [],
          extraClass: known ? undefined : 'codex-tile--unknown',
        })
      })
      .join('')

    const bombKnown = seen.has('양초 폭탄')
    const bombTile = this.codexTile({
      art: { kind: 'sprite', url: SpriteUrls.traps.bomb },
      name: bombKnown ? '양초 폭탄' : '???',
      tag: '1칸',
      chips: bombKnown
        ? [
            { icon: sword, value: '5', tone: 'bomb' },
            { label: '점화 ', value: '1턴', tone: 'bomb' },
          ]
        : [],
      note: bombKnown ? '전방 도착 시 점화, 다음 턴 폭발. 인접 적도 피해.' : undefined,
      extraClass: bombKnown ? undefined : 'codex-tile--unknown',
    })

    return `
      <h3 class="compendium-section">거미줄</h3>
      <div class="codex-tile-grid">${webTiles}</div>
      <h3 class="compendium-section">폭탄</h3>
      <div class="codex-tile-grid">${bombTile}</div>
      <h3 class="compendium-section">포자</h3>
      <div class="codex-tile-grid">${sporeTiles}</div>
    `
  }

  private renderCompendiumTreasures(): string {
    const seen = this.currentGameState?.encounteredCardNames ?? new Set<string>()
    const char = this.currentGameState?.getCharacter()
    // 개봉식 유물 보유 시 사라짐 50→40%, 미믹화 10% 고정.
    const hasCeremony = char?.relics.includes('opening-ceremony') ?? false
    const disappearPct = hasCeremony ? 40 : 50
    const mimicPct = 10

    // 일반 상자: 드롭 수 1/3/5, 기본 50% 사라짐 + 10% 미믹화.
    const CHEST_DROPS = [1, 3, 5] as const
    const chestSpec: Array<{ span: 1 | 2 | 3; name: string; sprite: string }> = [
      { span: 1, name: '작은 상자',  sprite: SpriteUrls.chestSmall  },
      { span: 2, name: '적당한 상자', sprite: SpriteUrls.chestMedium },
      { span: 3, name: '큰 상자',    sprite: SpriteUrls.chestLarge  },
    ]
    const normalTiles = chestSpec
      .map((c) => {
        const known = seen.has(c.name)
        return this.codexTile({
          art: { kind: 'sprite', url: c.sprite },
          name: known ? c.name : '???',
          tag: `${c.span}칸`,
          chips: known
            ? [
                { label: '드롭 ', value: `손패 ${CHEST_DROPS[c.span - 1]}장`, tone: 'gold' },
                { label: '사라짐 ', value: `${disappearPct}%`, tone: 'plain' },
                { label: '미믹화 ', value: `${mimicPct}%`, tone: 'spore' },
              ]
            : [],
          extraClass: known ? undefined : 'codex-tile--unknown',
        })
      })
      .join('')

    // 황금 상자: 드롭 수 3/8/15, 50% 사라짐, 미믹화 없음 (황금 열쇠 유물 필요).
    const GOLDEN_DROPS = [3, 8, 15] as const
    const goldenSpec: Array<{ span: 1 | 2 | 3; name: string }> = [
      { span: 1, name: '황금 상자'       },
      { span: 2, name: '적당한 황금 상자' },
      { span: 3, name: '대형 황금 상자'   },
    ]
    const goldenTiles = goldenSpec
      .map((c) => {
        const known = seen.has(c.name)
        return this.codexTile({
          art: { kind: 'sprite', url: SpriteUrls.chestGolden },
          name: known ? c.name : '???',
          tag: `${c.span}칸`,
          chips: known
            ? [
                { label: '드롭 ', value: `손패 ${GOLDEN_DROPS[c.span - 1]}장`, tone: 'gold' },
                { label: '사라짐 ', value: '50%', tone: 'plain' },
                { label: '불빛 ', value: '×2', tone: 'gold' },
              ]
            : [],
          extraClass: known ? 'codex-tile--golden' : 'codex-tile--unknown',
        })
      })
      .join('')

    const goldenKeyNote = char?.relics.includes('golden-key')
      ? '황금 열쇠 유물 보유 중 · 보물상자의 10%가 황금 상자로 교체. 미믹화 없음.'
      : '황금 열쇠 유물 보유 시 등장. 미믹화 없음.'

    return `
      <h3 class="compendium-section">일반 상자</h3>
      <div class="codex-tile-grid">${normalTiles}</div>
      <h3 class="compendium-section">황금 상자</h3>
      <p class="compendium-section-blurb">${goldenKeyNote}</p>
      <div class="codex-tile-grid">${goldenTiles}</div>
    `
  }

  private renderCompendiumFlowers(): string {
    const seen = this.currentGameState?.encounteredCardNames ?? new Set<string>()

    type Spec = {
      kind: FlowerKind
      harvest: { label: string; value: string; tone: 'hp' | 'atk' | 'gold' | 'shield' | 'flower' }
      growth: string
    }
    const specs: Spec[] = [
      { kind: 'chamomile', harvest: { label: '수확 ', value: '불빛',      tone: 'gold'   }, growth: '턴마다 +1'   },
      { kind: 'redRose',   harvest: { label: '수확 ', value: '체력',      tone: 'hp'     }, growth: '턴마다 +1'   },
      { kind: 'marigold',  harvest: { label: '수확 ', value: '화폐',      tone: 'gold'   }, growth: '2턴마다 +1'  },
      { kind: 'oleander',  harvest: { label: '수확 ', value: '방패',      tone: 'shield' }, growth: '턴마다 +1'   },
      { kind: 'lavender',  harvest: { label: '수확 ', value: '손패 게이지', tone: 'flower' }, growth: '턴마다 +1'  },
    ]

    const seedKnown = seen.has(flowerDisplayName('seed'))
    const seedTile = this.codexTile({
      art: { kind: 'sprite', url: SpriteUrls.flowers.seed },
      name: seedKnown ? flowerDisplayName('seed') : '???',
      tag: '씨앗',
      chips: seedKnown ? [{ label: '발화 ', value: '5종 중 랜덤', tone: 'flower' }] : [],
      note: seedKnown ? '대기 라인에서만 등장. 전방 도착 시 꽃으로 발화.' : undefined,
      extraClass: seedKnown ? undefined : 'codex-tile--unknown',
    })

    const flowerTiles = specs
      .map((s) => {
        const name = flowerDisplayName(s.kind)
        const known = seen.has(name)
        return this.codexTile({
          art: { kind: 'sprite', url: SpriteUrls.flowers[s.kind] },
          name: known ? name : '???',
          tag: '버프칸',
          chips: known
            ? [
                { label: s.harvest.label, value: s.harvest.value, tone: s.harvest.tone },
                { label: '성장 ', value: s.growth, tone: 'plain' },
              ]
            : [],
          extraClass: known ? undefined : 'codex-tile--unknown',
        })
      })
      .join('')

    return `
      <h3 class="compendium-section">씨앗</h3>
      <div class="codex-tile-grid">${seedTile}</div>
      <h3 class="compendium-section">꽃</h3>
      <div class="codex-tile-grid">${flowerTiles}</div>
    `
  }

  private renderCompendiumHand(): string {
    // 보스 전용 찌꺼기 카드(탐욕의 동전)는 플레이어 덱 카드가 아니므로 손패 도감에서 숨긴다.
    const tiles = HAND_CARD_IDS.filter((id) => HAND_CARD_DEFINITIONS[id].dropSource !== 'boss').map((id) => {
      const def = HAND_CARD_DEFINITIONS[id]
      const locked = this.lockedCardIds.has(id)
      // ATK 연동 카드: <br>만 · 로 치환, desc-dyn span은 유지해 Shift 토글이 도감에서도 동작.
      // 나머지 카드: <br>→· 후 HTML 태그 전부 제거한 평문 사용.
      const chipDesc = (desc: string) => desc.replace(/<br>/g, ' · ').replace(/<[^>]*>/g, '')
      const chipDescAtk = (desc: string) => desc.replace(/<br>/g, ' · ')
      const ATK_CARDS: ReadonlySet<HandCardId> = new Set([
        'ember', 'sacrifice-candle', 'levatein', 'firework', 'fire-arrow',
        'chandelier', 'bonfire', 'teapot', 'slash', 'candle-tome', 'sword-and-shield',
      ])
      const toChip = ATK_CARDS.has(def.id) ? chipDescAtk : chipDesc
      const singleDesc = toChip(this.enhancedHandCardDescription(def.id, false))
      const tripleDesc = toChip(this.enhancedHandCardDescription(def.id, true))
      return this.codexTile({
        art: { kind: 'sprite', url: spriteForHandCard(def.id) },
        name: locked ? '???' : def.name,
        tags: locked ? ['잠김'] : [
          def.category === 'recovery' ? '회복' : def.category === 'tool' ? '도구' : def.category === 'control' ? '컨트롤' : '공격',
          ...((def.jobTags ?? []).map(t => t === 'knight' ? '기사' : '마법사')),
        ],
        rarityClass: RARITY_CLASS_BY_TIER[HAND_CARD_RARITY[id]],
        chips: locked ? [] : [
          { label: '', value: singleDesc, tone: 'plain' },
          { label: '★ ', value: tripleDesc, tone: 'plain' },
        ],
        extraClass: locked ? 'codex-tile--unknown' : 'codex-tile--hand',
      })
    })
    return `
      <h3 class="compendium-section">손패 카드</h3>
      <div class="codex-tile-grid">${tiles.join('')}</div>
    `
  }

  /** Pack tab: 손패/유물 탭과 같은 codexTile 그리드 양식으로 팩별 등장 항목을 보여준다.
   *  상점/제단 방문 전에는 해당 팩 섹션이 ???로 마스킹된다. */
  private renderCompendiumPacks(): string {
    const seenPacks = this.currentGameState?.encounteredPackKinds ?? new Set<string>()
    const rarityLabel: Record<CardRarity, string> = {
      common: '일반', rare: '희귀', epic: '영웅', unique: '고유', legendary: '전설',
    }

    const itemTile = (
      item: { title: string; effect: string; rarity: CardRarity; illu?: string },
      packKind: ShopPackKind
    ): string => {
      const itemArt =
        (item.illu ? spriteForBasicPackItem(item.illu) : undefined) ??
        SpriteUrls.packs[packKind]
      return this.codexTile({
        art: { kind: 'sprite', url: itemArt },
        name: item.title,
        tag: rarityLabel[item.rarity],
        rarityClass: RARITY_CLASS_BY_TIER[item.rarity],
        chips: [{ value: item.effect, tone: 'gold' }],
        extraClass: 'codex-tile--relic',
      })
    }

    const noteTile = (packKind: ShopPackKind, name: string, effect: string, rarity: CardRarity): string =>
      this.codexTile({
        art: { kind: 'sprite', url: SpriteUrls.packs[packKind] },
        name,
        tag: '가변',
        rarityClass: RARITY_CLASS_BY_TIER[rarity],
        chips: [{ value: effect, tone: 'gold' }],
        extraClass: 'codex-tile--relic',
      })

    // 팩 섹션: 방문 전에는 간판 카드 1장만 ???로 표시하고 항목 타일은 숨긴다.
    const packSection = (
      packKind: ShopPackKind,
      venue: '상점' | '제단',
      theme: string,
      tiles: string[]
    ): string => {
      const label = SHOP_PACK_LABELS[packKind]
      const known = seenPacks.has(packKind)
      const coverArt = SpriteUrls.packs[packKind]
      const coverCard = known
        ? this.codexTile({
            art: { kind: 'sprite', url: coverArt },
            name: label.title,
            tag: venue,
            chips: [{ value: theme, tone: 'gold' }],
            extraClass: 'codex-tile--relic codex-tile--packcover',
          })
        : this.codexTile({
            art: { kind: 'sprite', url: coverArt },
            name: '???',
            tag: venue,
            chips: [],
            extraClass: 'codex-tile--relic codex-tile--packcover codex-tile--unknown',
          })
      return `
        <h3 class="compendium-section">${known ? label.title : '???'} · ${venue}</h3>
        <div class="codex-tile-grid codex-tile-grid--relics">${coverCard}${known ? tiles.join('') : ''}</div>
      `
    }

    const basicTiles = SHOP_PACK_POOLS['basic-pack'].map((i) => itemTile(i, 'basic-pack'))
    const resourceTiles = SHOP_PACK_POOLS['resource-pack'].map((i) => itemTile(i, 'resource-pack'))

    return `
      <h3 class="compendium-section">카드팩 (Packs)</h3>
      <p class="compendium-section-blurb">10·20턴 상점과 30턴 제단에서 구매하는 팩. 방문해야 내용이 공개된다.</p>
      ${packSection('basic-pack', '상점', '즉시 효과 — 체력·불씨·콤보 게이지·방패·화폐를 즉시 보충한다.', basicTiles)}
      ${packSection('recipe-pack', '상점', '레시피 해금 — runLocked 레시피를 해금해 조합 발동 범위를 확장한다.', [
        noteTile('recipe-pack', '레시피 해금', '해금되지 않은 조합 레시피 중 재료가 갖춰진 항목을 해금 (런 보유 카드에 따라 변동)', 'rare'),
      ])}
      ${packSection('unlock-pack', '상점', '해금 — 손패 카드를 새로 해금해 드로우 풀을 확장한다.', [
        noteTile('unlock-pack', '손패 카드 해금', '해금되지 않은 손패 카드 중 1장을 해금 (런 보유 카드에 따라 변동)', 'rare'),
      ])}
      ${packSection('chance-pack', '제단', '확률 상승 — 특정 손패 카드의 드롭 가중치를 영구적으로 높인다.', [
        noteTile('chance-pack', '카드 등장률 상승', '현재 해금된 카드 중 1장 선택 — 해당 카드의 드롭 가중치를 기본값만큼 영구 추가', 'rare'),
      ])}
      ${packSection('resource-pack', '제단', '최대치 증가 — 최대 체력·손패·불씨 게이지 등 영구 상한을 높인다.', resourceTiles)}
      ${packSection('delete-pack', '제단', '삭제 — 드로우 풀에서 손패 카드를 제거해 덱 농도를 높인다.', [
        noteTile('delete-pack', '손패 카드 삭제', '현재 런 드로우 풀에서 특정 카드를 제거해 뽑힐 빈도를 낮춘다', 'rare'),
      ])}
    `
  }

  private renderCompendiumRelics(): string {
    const owned = new Set(this.currentGameState?.getCharacter().relics ?? [])
    const cards = Object.values(RELIC_DEFINITIONS)
      .map((def) => {
        const isOwned = owned.has(def.id)
        return this.codexTile({
          art: { kind: 'sprite', url: spriteForRelic(def.id) },
          name: def.name,
          tag: isOwned ? '보유 중' : '상점',
          rarityClass: RARITY_CLASS_BY_TIER[def.rarity],
          chips: [{ value: this.relicEffectHtml(this.relicDynamicEffect(def.id, def.effect, isOwned), def.spawnEffect, this.currentSpawnWeightCtx, isOwned), tone: 'gold' }],
          flavor: def.flavor,
          extraClass: ['codex-tile--relic', isOwned ? 'codex-tile--owned' : ''].filter(Boolean).join(' '),
        })
      })
      .join('')
    return `
      <h3 class="compendium-section">유물 (Relics)</h3>
      <p class="compendium-section-blurb">10턴마다 열리는 생쥐 상점에서 구매하는 지속 효과. 보유 중인 유물은 초록색 테두리로 표시된다.</p>
      <div class="codex-tile-grid codex-tile-grid--relics">${cards}</div>
    `
  }

  /**
   * Recipe mini-cards need the compendium body to scroll, but scroll containers
   * clip overflowing children. Clone the hovered stack into a fixed body-layer
   * so only that preview escapes the panel while the codex keeps its scrollbar.
   */
  private attachCompendiumRecipeFloat(host: HTMLElement): void {
    document.querySelectorAll('.compendium-recipe-float').forEach((el) => el.remove())
    let floating: HTMLElement | null = null
    const removeFloating = () => {
      // Restore the compact in-panel stack only after the detached fan preview
      // has folded away, preventing the two stacks from visually colliding.
      host
        .querySelectorAll<HTMLElement>('.compendium-card-art--recipe.is-floating')
        .forEach((el) => el.classList.remove('is-floating'))
      floating?.remove()
      floating = null
    }
    host.querySelectorAll<HTMLElement>('.compendium-card-art--recipe').forEach((art) => {
      const showFloating = () => {
        const stack = art.querySelector<HTMLElement>('.compendium-recipe-stack')
        if (!stack) return
        removeFloating()
        const rect = stack.getBoundingClientRect()
        // While the body clone is expanded, fade the original mini-cards in the
        // card art slot so the readable floating cards are not backed by ghosts.
        art.classList.add('is-floating')
        floating = stack.cloneNode(true) as HTMLElement
        floating.classList.add('compendium-recipe-float')
        floating.style.left = `${rect.left}px`
        floating.style.top = `${rect.top}px`
        floating.style.width = `${rect.width}px`
        floating.style.height = `${rect.height}px`
        floating.setAttribute('aria-hidden', 'true')
        document.body.appendChild(floating)
      }
      art.addEventListener('mouseenter', showFloating)
      art.addEventListener('focusin', showFloating)
      art.addEventListener('mouseleave', removeFloating)
      art.addEventListener('focusout', removeFloating)
    })
  }

  /** Terms tab summarizing current field, resource, and status vocabulary. */
  private renderCompendiumTerms(): string {
    const terms: [string, string][] = [
      ['필드', '플레이어 앞 3×3 그리드 레일 전체. 전방 3칸과 대기 6칸을 모두 포함한다.'],
      [
        '전방',
        '플레이어 카드와 직접 대면 중인 최전방 라인(distance 0). 일반 보드 행동은 전방만 선택한다.',
      ],
      [
        '대기',
        '전방이 아닌 준비 중인 후방 2줄(distance 1~2), 총 6칸. 필드 지정 효과는 대기 칸도 대상으로 삼을 수 있다.',
      ],
      [
        '트리플',
        '같은 손패 카드 3장이 연속으로 쌓이면 기존 ★ 강화 카드 양식으로 자동 합성되는 효과. 기획서의 3- 표기는 이 효과 설명용이다.',
      ],
      ['방패', '체력 위에 표시되는 임시 체력. 피해를 먼저 흡수하고 소모된다.'],
      [
        '굳음',
        '밀랍으로 하얗게 굳은 정지 상태. 남은 턴 동안 적 공격/보물 변동 같은 전방 이벤트가 멈춘다.',
      ],
      [
        '불씨 게이지',
        '우측 상단 불씨 자원. 성냥이 회복하며, 낮아질수록 전투/스폰 위험도가 오른다.',
      ],
      [
        '콤보 게이지',
        '손패 10장 사용 시 선택한 게이지 보너스(최대 체력/공격력/불씨/손패)를 발동하는 진행도. 카드 아이템은 이 게이지를 추가로 채우며, 10칸 초과분은 다음 게이지에 남는다.',
      ],
      [
        '동전($)',
        '상점용 화폐. 현재는 점수 집계 아래 별도 지갑으로 표시되며, 추후 상점에서 사용한다.',
      ],
      ['정화', '성수는 기본 사용 시 랜덤 포자 2장, 트리플 사용 시 필드 전체 포자를 제거한다.'],
    ]
    const cards = terms
      .map(([name, description]) =>
        this.codexTile({
          art: { kind: 'icon', svg: bookIcon() },
          name,
          tag: '용어',
          note: description,
          extraClass: 'codex-tile--term',
        })
      )
      .join('')
    return `<div class="codex-tile-grid codex-tile-grid--terms">${cards}</div>`
  }

  private renderCompendiumCombo(): string {
    const synthesisIntro = `
      <article class="compendium-card compendium-card-wide">
        <div class="compendium-card-art compendium-card-art--icon">${flameIcon()}</div>
        <header class="compendium-card-head">
          <span class="compendium-card-name">자동 합성 (트리플)</span>
          <span class="compendium-card-badge">합성</span>
        </header>
        <div class="compendium-card-row"><span class="compendium-card-label">조건</span><span class="compendium-card-value">손패에 같은 카드 3장이 연속</span></div>
        <div class="compendium-card-row"><span class="compendium-card-label">결과</span><span class="compendium-card-value">즉시 1장의 ★ 강화 카드로 합쳐짐. 사용 시 트리플 효과 발동.</span></div>
        <p class="compendium-card-desc">손패 슬롯 0~9 중 인접한 3칸이 같은 종류면 자동 합성. 별도 조작 없이 발동되며, 합성된 카드는 단일 슬롯을 차지한다.</p>
      </article>
    `
    const recipeCards = RECIPES.map((r) => {
      // 재료 카드 중 하나라도 잠겨 있으면 레시피 전체를 미발견 처리.
      const isLocked =
        this.lockedRecipeIds.has(r.id) ||
        Object.keys(r.ingredients).some((id) => this.lockedCardIds.has(id as HandCardId))
      const ingredientCards = Object.entries(r.ingredients).flatMap(([id, n]) => {
        const def = HAND_CARD_DEFINITIONS[id as HandCardId]
        if (!def) return []
        return Array.from({ length: n ?? 1 }, () =>
          this.handCardFace(
            def.id,
            def.description,
            false,
            `compendium-recipe-mini ${this.categoryClass(def.category)}`
          )
        )
      })
      return this.compendiumCard({
        art: {
          kind: 'recipe',
          html: `<div class="compendium-recipe-stack" style="--recipe-count: ${ingredientCards.length}; --recipe-center: ${(ingredientCards.length - 1) / 2}">${ingredientCards.join('')}</div>`,
        },
        name: isLocked ? '???' : r.name,
        badge: `${r.totalCount}장`,
        categoryClass: `compendium-recipe-card${isLocked ? ' compendium-card--unknown' : ''}`,
        stats: isLocked ? [] : [['효과', this.recipeFlavorHtml(r)]],
      })
    }).join('')
    return `
      <h3 class="compendium-section">조합 레시피 (Recipes)</h3>
      <p class="compendium-section-blurb">손패를 사용할 때마다 해당 카드가 활성 체인에 추가된다. 체인의 multiset이 아래 재료를 모두 포함하면 그 레시피가 보너스로 발동한다.</p>
      <div class="compendium-grid">${recipeCards}</div>
      <h3 class="compendium-section">합성 (Synthesis)</h3>
      <div class="compendium-grid">${synthesisIntro}</div>
    `
  }

  /**
   * ATK 연동 레시피의 효과 설명을 desc-dyn HTML로 반환한다.
   * 기본: 합산 피해 수치. Shift: 공격력 배율 수식.
   * enemy maxHP 기반(hot-water-maxhp)은 런타임에 알 수 없으므로 정적 텍스트로 반환.
   */
  /** 조합팩 피커 effect 문자열 생성 — rollPackItems에서 호출. */
  public recipeEffectHtml(r: Recipe): string {
    return this.recipeFlavorHtml(r)
  }

  private recipeFlavorHtml(r: Recipe): string {
    const atk = this.currentGameState?.getCharacter().damage ?? 1
    const bonus = this.currentGameState?.enhancements.recipeBonus[r.id] ?? 0
    switch (r.effect) {
      case 'ignite-atk':      return `필드 모든 적에게 ${atkDmgHtml(atk, 0.3, 1, bonus)}`
      case 'hot-atk':         return `전방 모든 적에게 ${atkDmgHtml(atk, 0.5, 2, bonus)}`
      case 'fuse-atk':        return `전방 모든 적에게 ${atkDmgHtml(atk, 1.5, 0, bonus)}`
      case 'backfire-atk':    return `필드 모든 적에게 ${atkDmgHtml(atk, 1, 0, bonus)}`
      case 'rage-atk':        return `전방 모든 적에게 ${atkDmgHtml(atk, 1, 3, bonus)}`
      case 'flame-chain-atk': return `방패 +2 · 필드 적 전체 ${atkDmgHtml(atk, 1, 0, bonus)}`
      case 'glass-shards-atk':return `필드 랜덤 적 전체 ${atkDmgHtml(atk, 0.5, 3, bonus)} 분산`
      case 'fireworks-atk':   return `필드 랜덤 적 전체 ${atkDmgHtml(atk, 3, 3, bonus)} 분산`
      case 'banquet-atk':     return `필드 랜덤 적 ${atkDmgHtml(atk, 1, 0, bonus)} × 공격력 횟수`
      case 'hot-water-maxhp': return r.flavor  // 대상 적 최대체력 불명 → 정적 텍스트
      default:                return r.flavor
    }
  }

  /**
   * Unified compendium card template — every section uses this so the visual
   * grammar (art slot → name + badge → stat rows → description) reads as one
   * design language.
   */
  private compendiumCard(opts: {
    art:
      | { kind: 'sprite'; url: string }
      | { kind: 'icon'; svg: string }
      | { kind: 'recipe'; html: string }
    name: string
    badge?: string
    categoryClass?: string
    stats?: [string, string][]
    description?: string
  }): string {
    const artHtml =
      opts.art.kind === 'sprite'
        ? `<div class="compendium-card-art compendium-card-art--sprite" style="background-image: url('${opts.art.url}');"></div>`
        : opts.art.kind === 'icon'
          ? `<div class="compendium-card-art compendium-card-art--icon">${opts.art.svg}</div>`
          : `<div class="compendium-card-art compendium-card-art--recipe">${opts.art.html}</div>`
    const badgeHtml = opts.badge ? `<span class="compendium-card-badge">${opts.badge}</span>` : ''
    const statRows = (opts.stats ?? [])
      .map(
        ([k, v]) =>
          `<div class="compendium-card-row"><span class="compendium-card-label">${k}</span><span class="compendium-card-value">${v}</span></div>`
      )
      .join('')
    const descHtml = opts.description
      ? `<p class="compendium-card-desc">${opts.description}</p>`
      : ''
    const classes = ['compendium-card', opts.categoryClass ?? ''].filter(Boolean).join(' ')
    return `
      <article class="${classes}">
        ${artHtml}
        <header class="compendium-card-head">
          <span class="compendium-card-name">${opts.name}</span>
          ${badgeHtml}
        </header>
        ${statRows}
        ${descHtml}
      </article>
    `
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
        const flavorHtml = recipeDef ? this.recipeFlavorHtml(recipeDef) : ev.flavor
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
        this.handleCardClick(el, laneIndex, distance)
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
        this.openCompendium()
      })
  }

  private updatePinnedRelicClasses(): void {
    this.boardElement.querySelectorAll<HTMLElement>('.relic-mini-card').forEach((card) => {
      card.classList.toggle('is-pinned', card.dataset.ownedRelic === this.pinnedRelicId)
    })
  }

  /** DOM 교체 후 손패 hover 미리보기를 복원한다.
   *  is-preview-open(CSS animation:none)만 추가 — :hover의 flip 재실행을 CSS 레벨에서 막는다. */
  private restoreHandHoverState(): void {
    if (this.hoveredHandSlotIndex === null) return
    const slot = this.boardElement.querySelector<HTMLElement>(
      `.hand-slot[data-slot-index="${this.hoveredHandSlotIndex}"]`
    )
    if (slot?.classList.contains('hand-card')) {
      slot.classList.add('is-preview-open')
    } else {
      this.hoveredHandSlotIndex = null
    }
  }

  private handleCardClick(_el: HTMLElement, laneIndex: number, distance: number): void {
    this.dispatchAction(laneIndex, distance)
  }

  private dispatchAction(laneIndex: number, distance: number): void {
    const lane = this.currentGameState?.getLane(laneIndex)
    const card = lane?.getCardAtDistance(distance)
    if (!card) return

    const event = new CustomEvent<CardActionDetail>('cardAction', {
      detail: { laneIndex, distance, card },
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
    return this.animateDamageImpactOnElement(playerCard, amount)
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
  animateDamageNumberOnElement(target: HTMLElement | null, amount: number): Promise<void> {
    if (!target || amount <= 0) return Promise.resolve()
    const rect = target.getBoundingClientRect()
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
    return Promise.all(
      damages.map(({ cardId, amount }) => {
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
    const el = document.createElement('div')
    el.className = 'damage-float'
    el.textContent = `-${amount}`
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
      { duration: 980, easing: 'cubic-bezier(0.16, 0.86, 0.28, 1)', fill: 'forwards' }
    )
    return new Promise((resolve) => {
      anim.onfinish = () => {
        el.remove()
        resolve()
      }
      window.setTimeout(() => {
        el.remove()
        resolve()
      }, 1120)
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

  /** Wax release effect: wider, softer shards as hardened wax cracks open. */
  animateWaxThawByIds(cardIds: string[]): Promise<void> {
    if (cardIds.length === 0) return Promise.resolve()
    for (const cardId of cardIds) {
      const target = this.findCardElement(cardId)
      if (!target) continue
      SquareBurst.playOn(target, 'wax-freeze', { count: 14, spread: 180, duration: 760 })
      target.classList.add('is-wax-thawing')
      window.setTimeout(() => target.classList.remove('is-wax-thawing'), 620)
    }
    return new Promise((resolve) => window.setTimeout(resolve, 620))
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
.clutch-banner-title { font-weight: 800; font-size: 22px; color: rgba(255, 238, 196, 0.98); letter-spacing: 1px; white-space: nowrap; text-shadow: 0 0 14px rgba(255, 200, 90, 0.55), 0 2px 6px rgba(0, 0, 0, 0.82); }
.clutch-banner-desc { margin-top: 3px; font-size: 15px; font-weight: 600; color: rgba(255, 224, 170, 0.92); white-space: nowrap; text-shadow: 0 1px 4px rgba(0, 0, 0, 0.85); }
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
      `<div class="clutch-banner-title">『 ${title} 』</div>` +
      `<div class="clutch-banner-desc">${description}</div>`
    host.style.left = `${rect.left + rect.width / 2}px`
    host.style.top = `${rect.top - 10}px`
    document.body.appendChild(host)
    const anim = host.animate(
      [
        { opacity: 0, transform: 'translate(-50%, -86%) scale(0.84)', filter: 'blur(0px)' },
        { opacity: 1, transform: 'translate(-50%, -100%) scale(1)', filter: 'blur(0px)', offset: 0.07 },
        { opacity: 1, transform: 'translate(-50%, -100%) scale(1)', filter: 'blur(0px)', offset: 0.62 },
        { opacity: 0, transform: 'translate(-50%, -122%) scale(1.02)', filter: 'blur(2.6px)', offset: 1 },
      ],
      { duration: 3600, easing: 'cubic-bezier(0.2, 0.8, 0.25, 1)', fill: 'forwards' }
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

  /** 별빛 자동 소비 연출: 원점에서 별빛이 흩어지며 턴 브랜드로 사각 블라스트를
   *  쏘고, 착탄(onImpact)에서 호출부가 턴을 +1 시킨다("탕" 맞으며 턴 상승). */
  async fireStarlightToTurn(sourceRect: DOMRect): Promise<void> {
    const turnBrand = this.boardElement.querySelector<HTMLElement>('.turn-brand')
    const cx = sourceRect.left + sourceRect.width / 2
    const cy = sourceRect.top + sourceRect.height / 2
    // 원점 별빛 흩뿌림 — 카드가 빛으로 풀리는 출발 블라스트.
    SquareBurst.playAt(cx, cy, 'starlight', { count: 14, spread: 80, duration: 420 })
    // 트레일이 턴 브랜드에 닿으면 animateResourceTrail이 도착 버스트를 같은 beat에 찍는다.
    await this.animateResourceTrail(sourceRect, turnBrand, 1, 'starlight')
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

  /** Boss-origin blast that burns a specific hand slot before the model re-renders it away. */
  async animateBossBlastToHandSlot(cardId: string, slotIndex: number, theme: BurstTheme): Promise<void> {
    const boss = this.findCardElement(cardId)
    const slot = this.findHandSlotElement(slotIndex)
    if (!boss || !slot) return
    await this.animateResourceTrail(boss, slot, 3, theme)
    SquareBurst.playOn(slot, theme, { count: 18, spread: 125, duration: 520 })
    // 즉시 사라지지 않고 잿불에 닿은 듯 흔들→회색→검게 타오르며 사라진다.
    await slot.animate(
      [
        { transform: 'translateX(0) rotate(0deg) scale(1)', opacity: 1, filter: 'brightness(1) saturate(1) grayscale(0)' },
        { transform: 'translateX(-3px) rotate(-2deg) scale(1.01)', opacity: 1, filter: 'brightness(0.96) saturate(0.4) grayscale(0.6)', offset: 0.2 },
        { transform: 'translateX(3px) rotate(2deg) scale(1)', opacity: 1, filter: 'brightness(0.72) saturate(0) grayscale(1)', offset: 0.42 },
        { transform: 'translateX(-2px) rotate(-1.4deg) scale(0.97)', opacity: 0.92, filter: 'brightness(0.42) saturate(0) grayscale(1)', offset: 0.64 },
        { transform: 'translateX(0) rotate(0deg) scale(0.9)', opacity: 0, filter: 'brightness(0.06) saturate(0) grayscale(1) blur(2px)' },
      ],
      { duration: 620, easing: 'cubic-bezier(0.3, 0.1, 0.35, 1)', fill: 'forwards' }
    ).finished
  }

  /** 이벤트 불태우기: 지정 손패 슬롯을 흔들→회색화→위로 떠오르며 사라지는 소각 연출. */
  async animateHandCardBurn(slotIndex: number): Promise<void> {
    const slot = this.findHandSlotElement(slotIndex)
    if (!slot) return
    SquareBurst.playOn(slot, 'damage', { count: 12, spread: 72, duration: 380 })
    await new Promise<void>((r) => window.setTimeout(r, 55))
    await slot.animate(
      [
        { transform: 'translateX(0) translateY(0) scale(1)',       opacity: 1,    filter: 'brightness(1)    saturate(1)    grayscale(0)' },
        { transform: 'translateX(-4px) translateY(-3px) scale(1.02)', opacity: 1, filter: 'brightness(1.08) saturate(0.55) grayscale(0.32)', offset: 0.14 },
        { transform: 'translateX(4px)  translateY(-6px) scale(1.01)', opacity: 0.96, filter: 'brightness(0.88) saturate(0.2)  grayscale(0.72)', offset: 0.30 },
        { transform: 'translateX(-3px) translateY(-11px) scale(0.97)', opacity: 0.80, filter: 'brightness(0.58) saturate(0)   grayscale(1)',    offset: 0.50 },
        { transform: 'translateX(2px)  translateY(-18px) scale(0.93)', opacity: 0.50, filter: 'brightness(0.32) saturate(0)   grayscale(1)',    offset: 0.70 },
        { transform: 'translateX(0)    translateY(-28px) scale(0.85)', opacity: 0,    filter: 'brightness(0.06) saturate(0)  grayscale(1) blur(3px)' },
      ],
      { duration: 760, easing: 'cubic-bezier(0.28, 0.1, 0.32, 1)', fill: 'forwards' }
    ).finished
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

  /** 30F 양초 백작: 보스에서 황금빛 분수 블라스트가 폭죽처럼 터진 뒤, 새로 생긴 손패
   *  슬롯들로 트레일이 날아가며 카드가 톡 생성되는 연출. (소각 연출의 반대 방향) */
  async animateBossScatterToHandSlots(cardId: string, slotIndices: number[]): Promise<void> {
    const boss = this.findCardElement(cardId)
    if (!boss || slotIndices.length === 0) return
    // 분수처럼 솟구치는 황금빛 폭죽 블라스트.
    SquareBurst.playOn(boss, 'treasure-gain', { count: 30, spread: 200, duration: 640, size: [8, 18] })
    await new Promise((r) => window.setTimeout(r, 180))
    // 각 슬롯으로 트레일을 순차 발사하고, 도착 시 슬롯이 톡 생성되도록 팝인.
    await Promise.all(
      slotIndices.map(async (slotIndex, i) => {
        await new Promise((r) => window.setTimeout(r, i * 110))
        const slot = this.findHandSlotElement(slotIndex)
        if (!slot) return
        await this.animateResourceTrail(boss, slot, 3, 'treasure-gain')
        await slot.animate(
          [
            { transform: 'scale(0.6)', opacity: 0.2 },
            { transform: 'scale(1.12)', opacity: 1, offset: 0.6 },
            { transform: 'scale(1)', opacity: 1 },
          ],
          { duration: 320, easing: 'cubic-bezier(0.34,1.56,0.64,1)', fill: 'forwards' }
        ).finished
      })
    )
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
   * Resource rewards are introduced by a short square-card trail from the
   * concrete source (rail card / combo banner / played-card center) into the
   * destination HUD. The trail lands before the normal counter/drop animation,
   * so all reward types share one source-aware acquisition rule.
   */
  animateResourceTrailFromCard(
    cardId: string,
    target: ResourceTrailTarget,
    count: number,
    theme: BurstTheme
  ): Promise<void> {
    const source = this.findCardElement(cardId)
    return this.animateResourceTrail(source, this.findResourceTrailTarget(target), count, theme)
  }

  /** Fly a resource trail from a captured card rect after the model was already cleaned up. */
  animateResourceTrailFromRect(
    source: DOMRect,
    target: ResourceTrailTarget,
    count: number,
    theme: BurstTheme
  ): Promise<void> {
    return this.animateResourceTrail(source, this.findResourceTrailTarget(target), count, theme)
  }

  /** Fly a resource trail from the center-screen played-card impact point. */
  animateResourceTrailFromCenter(
    target: ResourceTrailTarget,
    count: number,
    theme: BurstTheme
  ): Promise<void> {
    const center = new DOMRect(window.innerWidth / 2 - 8, window.innerHeight * 0.46 - 8, 16, 16)
    return this.animateResourceTrail(center, this.findResourceTrailTarget(target), count, theme)
  }

  /** Fly a square-card target blast from the played-card center toward an affected rail card. */
  animateTargetBlastFromCenterToCard(cardId: string, theme: BurstTheme): Promise<void> {
    const center = new DOMRect(window.innerWidth / 2 - 8, window.innerHeight * 0.46 - 8, 16, 16)
    return this.animateResourceTrail(center, this.findCardElement(cardId), 1, theme)
  }

  /** Fly a resource trail from the currently visible chain/combo banner. */
  animateResourceTrailFromChain(
    target: ResourceTrailTarget,
    count: number,
    theme: BurstTheme
  ): Promise<void> {
    const chainSource =
      document.querySelector<HTMLElement>('#chain-banner .chain-event:last-child') ??
      document.querySelector<HTMLElement>('#chain-banner')
    return this.animateResourceTrail(
      chainSource,
      this.findResourceTrailTarget(target),
      count,
      theme
    )
  }

  /** 제단 무료 유물 단일 픽 연출: 비선택 카드가 먼저 사그라들고, 이후 선택 카드도 순차적으로 사라진다.
   *  버스트 없이 CSS fade만 사용해 조용한 연출을 유지한다. */
  async resolveAltarRelicPick(relicId: RelicId): Promise<void> {
    const cards = [
      ...(this.shopOverlayElement?.querySelectorAll<HTMLElement>(
        '.shop-relic-card[data-shop-buy-kind="relic"]'
      ) ?? []),
    ]
    if (cards.length === 0) return

    // 픽 순간 rect 캡처 — 애니메이션 전 원래 위치를 보존해 비행 연출 기준점으로 쓴다.
    const pickedCard = cards.find((c) => c.dataset.shopBuy === relicId) ?? null
    if (pickedCard) {
      this.altarPickedRelicRect = { relicId, rect: pickedCard.getBoundingClientRect() }
    }

    // 1단계: 비선택 카드 CSS 페이드(burst 없음).
    for (const card of cards) {
      if (card.dataset.shopBuy !== relicId) card.classList.add('is-altar-fading')
    }
    await new Promise<void>((resolve) => window.setTimeout(resolve, 340))

    // 2단계: 선택 카드도 순차적으로 사라진다.
    if (pickedCard) {
      pickedCard.classList.add('is-altar-fading')
      await new Promise<void>((resolve) => window.setTimeout(resolve, 280))
    }
  }

  /** Capture the clicked shop card before the board re-renders with the newly owned relic.
   *  제단 픽은 resolveAltarRelicPick에서 미리 캡처한 rect를 우선 사용한다(애니메이션 후 이동 보정). */
  prepareRelicArrivalFromShop(relicId: RelicId): void {
    if (this.altarPickedRelicRect?.relicId === relicId) {
      this.pendingRelicArrival = { relicId, rect: this.altarPickedRelicRect.rect }
      this.altarPickedRelicRect = null
      return
    }
    const source = this.shopOverlayElement?.querySelector<HTMLElement>(
      `.shop-relic-card[data-shop-buy="${relicId}"]`
    )
    this.pendingRelicArrival = source ? { relicId, rect: source.getBoundingClientRect() } : null
  }

  /** Fly a purchased relic card from the shop stall into its final fan slot. */
  animatePreparedRelicArrival(): Promise<void> {
    const pending = this.pendingRelicArrival
    this.pendingRelicArrival = null
    if (!pending) return Promise.resolve()
    const target = this.boardElement.querySelector<HTMLElement>(
      `.relic-mini-card[data-owned-relic="${pending.relicId}"]`
    )
    if (!target) return Promise.resolve()
    const targetRect = target.getBoundingClientRect()
    const clone = document.createElement('div')
    clone.className = 'relic-arrival-clone'
    clone.style.left = `${pending.rect.left}px`
    clone.style.top = `${pending.rect.top}px`
    clone.style.width = `${pending.rect.width}px`
    clone.style.height = `${pending.rect.height}px`
    clone.innerHTML = this.relicPreviewFace(pending.relicId)
    document.body.appendChild(clone)
    target.classList.add('is-arriving')
    // Hide the real destination until the clone snaps into place, then pop it
    // back with the same card-draw shadow language as hover.
    const dx = targetRect.left - pending.rect.left
    const dy = targetRect.top - pending.rect.top
    const sx = targetRect.width / Math.max(1, pending.rect.width)
    const sy = targetRect.height / Math.max(1, pending.rect.height)
    return new Promise((resolve) => {
      const anim = clone.animate(
        [
          { transform: 'translate(0, 0) scale(1)', opacity: 1, filter: 'brightness(1.15)' },
          {
            transform: `translate(${dx * 0.72}px, ${dy - 38}px) scale(${(sx + sy) / 2 + 0.05})`,
            opacity: 1,
            filter: 'brightness(1.38)',
          },
          {
            transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`,
            opacity: 1,
            filter: 'brightness(1)',
          },
        ],
        { duration: 560, easing: 'cubic-bezier(0.18, 0.86, 0.22, 1)', fill: 'forwards' }
      )
      anim.onfinish = () => {
        clone.remove()
        target.classList.remove('is-arriving')
        target.classList.add('is-arrival-settling')
        window.setTimeout(() => target.classList.remove('is-arrival-settling'), 520)
        SquareBurst.playOn(target, 'score', { count: 18, spread: 90, duration: 620 })
        resolve()
      }
      anim.oncancel = () => {
        clone.remove()
        target.classList.remove('is-arriving')
        resolve()
      }
    })
  }

  /** 팩 구매 시 불빛 패널 → 팩 타일 트레일 (fire-and-forget).
   *  팩 피커가 곧바로 열리기 전 비용 시각화 — await 없이 배경에서 재생된다. */
  fireScoreSpendTrailToTarget(target: HTMLElement | null, cost: number): void {
    if (!target) return
    void this.animateResourceTrail(
      this.findScorePulseAnchor(),
      target,
      Math.min(8, Math.max(1, Math.ceil(cost / 300))),
      'score'
    )
  }

  /** Spend-light purchase trail: the blast starts on the 불빛 counter and
   *  lands on the clicked relic card before the shop refreshes its state. */
  animateShopPurchaseTrailToRelic(relicId: RelicId, count: number): Promise<void> {
    const target = document.querySelector<HTMLElement>(
      `#shop-overlay .shop-relic-card[data-shop-buy="${relicId}"]`
    )
    return this.animateResourceTrail(this.findScorePulseAnchor(), target, count, 'score')
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

  /** 팩 피커 리롤 버튼 클릭 피드백: 화폐 패널 → 버튼 트레일 + 버튼 임팩트 burst.
   *  유물 리롤(playShopRerollFeedback)과 같은 흐름으로 트레일이 끝난 뒤 카드를 교체한다. */
  async playPackRerollFeedback(cost: number): Promise<void> {
    const btn = document.querySelector<HTMLElement>('.shop-pack-picker-reroll-btn')
    if (!btn) return
    await this.animateResourceTrail(
      this.findCoinPulseAnchor(),
      btn,
      Math.max(1, Math.min(6, cost)),
      'score'
    )
    btn.classList.remove('is-pack-reroll-impacted')
    void btn.offsetWidth
    btn.classList.add('is-pack-reroll-impacted')
    window.setTimeout(() => btn.classList.remove('is-pack-reroll-impacted'), 380)
    SquareBurst.playOn(btn, 'score', { count: 12, spread: 58, duration: 360 })
  }

  
  /** Consume a free card tile and route its blast to the matching HUD target.
   *  `amount` is the real reward value from gameplay; huge values such as ✦300
   *  are compressed into readable launch chunks inside freeRewardTrailCount(). */
  async consumeFreeCardAndRouteReward(
    kind: 'free-card' | 'free-coin-card',
    target: ResourceTrailTarget,
    amount: number,
    theme: BurstTheme = 'score'
  ): Promise<void> {
    const card = document.querySelector<HTMLElement>(`#shop-overlay .shop-free-card[data-shop-buy-kind="${kind}"]`)
    if (!card) return
    await this.playShopPurchaseImpact(card, 'score')
    await this.animateResourceTrail(card, this.findResourceTrailTarget(target), this.freeRewardTrailCount(target, amount), theme)
    // 무료 카드 소모는 선택 순간 "사라짐"이 읽히도록 약간 긴 퇴장 타이밍을 사용한다.
    card.classList.add('is-consumed')
    window.setTimeout(() => card.remove(), 420)
  }

  /** Convert actual reward numbers into trail launches without losing meaning.
   *  Score rewards are displayed in 100-light chunks so ✦300 becomes three trails;
   *  small HUD resources use their exact amount, capped only as a safety valve. */
  private freeRewardTrailCount(target: ResourceTrailTarget, amount: number): number {
    const safeAmount = Math.max(1, Math.floor(amount))
    if (target === 'score') return Math.max(1, Math.ceil(safeAmount / 100))
    return Math.min(12, safeAmount)
  }

  /** Shop reroll FX: wallet blast -> reroll impact -> instant content swap.
   *  We intentionally removed flip/fade phases so cards never disappear or
   *  go transparent during reroll; only a vivid burst sells the replacement. */
  async playShopRerollFeedback(
    cost: number,
    nextOffers: ShopOfferView[],
    score: number,
    character: Character
  ): Promise<void> {
    const reroll = document.querySelector<HTMLElement>('#shop-overlay .shop-reroll-btn')
    if (!reroll) return
    // 진행 중임을 DOM에도 남겨 빠른 연타/터치 반복이 시각적으로 막힌다.
    reroll.classList.add('is-reroll-locked')
    await this.animateResourceTrail(
      this.findCoinPulseAnchor(),
      reroll,
      Math.max(1, Math.min(6, cost)),
      'score'
    )
    SquareBurst.playOn(reroll, 'score', { count: 14, spread: 60, duration: 380 })
    reroll.classList.remove('is-reroll-impacted')
    void reroll.offsetWidth
    reroll.classList.add('is-reroll-impacted')
    // 임팩트 클래스 정리는 직후 호출되는 openShop → refreshOpenShopInPlace가 담당한다.

    // Only relic slots reroll — free/pack inventory stays fixed.
    const allCards = Array.from(
      document.querySelectorAll<HTMLElement>(
        '#shop-overlay .shop-artifact-layer .shop-relic-card[data-shop-buy-kind="relic"]'
      )
    )
    const swaps: Promise<void>[] = []
    let swapIndex = 0
    allCards.forEach((card, idx) => {
      const offer = nextOffers[idx]
      if (!offer) return
      // Purchased slots are already burned out — keep them as fixed empty slots.
      if (card.classList.contains('is-purchased')) return
      const delay = swapIndex * 70
      swapIndex += 1
      swaps.push(
        new Promise<void>((resolve) => {
          window.setTimeout(() => {
            this.applyShopRelicContent(card, offer, score, character)
            // Per-card burst keeps the reroll read flashy even without flip.
            SquareBurst.playOn(card, 'score', { count: 16, spread: 86, duration: 460 })
            card.classList.remove('is-reroll-impacted')
            void card.offsetWidth
            card.classList.add('is-reroll-impacted')
            window.setTimeout(() => card.classList.remove('is-reroll-impacted'), 260)
            resolve()
          }, delay)
        })
      )
    })
    await Promise.all(swaps)
    // Capstone burst once all replacement cards are set.
    const layer = document.querySelector<HTMLElement>('#shop-overlay .shop-artifact-layer')
    if (layer) SquareBurst.playOn(layer, 'score', { count: 34, spread: 160, duration: 620 })
  }

  /** Swap a single shop relic card's visible content in place. Used during the
   *  reroll mid-flip beat so the card finishes its turn already showing the
   *  new offer. Touches data attributes, classes, art, copy, and price label
   *  without rebuilding the DOM node. */
  private applyShopRelicContent(
    card: HTMLElement,
    offer: ShopOfferView,
    score: number,
    _character: Character
  ): void {
    const def = RELIC_DEFINITIONS[offer.relicId]
    card.dataset.shopBuy = def.id
    card.setAttribute(
      'aria-label',
      `${def.name} — ${offer.purchased ? '구매 완료' : `불빛 ${offer.price}`}`
    )
    // Swap the rarity glow class to match the new relic.
    const RARITY_CLASSES: readonly string[] = [
      RARITY_CLASS_BY_TIER.common,
      RARITY_CLASS_BY_TIER.rare,
      RARITY_CLASS_BY_TIER.epic,
      RARITY_CLASS_BY_TIER.unique,
      RARITY_CLASS_BY_TIER.legendary,
    ]
    for (const cls of RARITY_CLASSES) card.classList.remove(cls)
    card.classList.add(RARITY_CLASS_BY_TIER[getRelicDef(offer.relicId).rarity])
    // Affordability vs current score (purchased stays purchased — unreachable here).
    card.classList.remove('is-affordable', 'is-unaffordable', 'is-purchased')
    card.classList.add(this.shopRelicAffordabilityClass(offer, score))
    const art = card.querySelector<HTMLElement>('.shop-relic-art')
    if (art) art.style.backgroundImage = `url('${spriteForRelic(def.id)}')`
    const title = card.querySelector<HTMLElement>('.shop-relic-title')
    if (title) title.textContent = def.name
    const effect = card.querySelector<HTMLElement>('.shop-relic-effect')
    if (effect) effect.innerHTML = this.relicEffectHtml(this.relicDynamicEffect(def.id, def.effect, false), def.spawnEffect, this.currentSpawnWeightCtx, false)
    const flavor = card.querySelector<HTMLElement>('.shop-relic-flavor')
    if (flavor) flavor.textContent = def.flavor
    const label = card.querySelector<HTMLElement>('.shop-price-label-text')
    if (label)
      label.textContent = offer.purchased ? '구매 완료' : `${offer.price.toLocaleString()}`
  }

  private findResourceTrailTarget(target: ResourceTrailTarget): HTMLElement | DOMRect | null {
    if (target === 'score') return this.findScorePulseAnchor()
    if (target === 'coin') return this.findCoinPulseAnchor()
    if (target === 'health') {
      return (
        this.boardElement.querySelector<HTMLElement>('.hp-bar') ??
        this.boardElement.querySelector<HTMLElement>('.player-card')
      )
    }
    if (target === 'shield') {
      return (
        this.boardElement.querySelector<HTMLElement>('.player-shield-chip') ??
        this.boardElement.querySelector<HTMLElement>('.hp-column') ??
        this.boardElement.querySelector<HTMLElement>('.player-card')
      )
    }
    if (target === 'ember') {
      return (
        this.boardElement.querySelector<HTMLElement>('.ember-bar') ??
        this.boardElement.querySelector<HTMLElement>('.ember-hud')
      )
    }
    if (target === 'gauge') return this.boardElement.querySelector<HTMLElement>('.candle-gauge')
    if (target === 'attack') return this.boardElement.querySelector<HTMLElement>('.atk-stat')
    if (target === 'relic') {
      const latestRelic = this.boardElement.querySelector<HTMLElement>('.relic-mini-card:last-child')
      // Boss/reward relic trails should land on the artifact fan, not on the
      // light panel; fall back to the player card before the first relic exists.
      return (
        latestRelic ??
        this.boardElement.querySelector<HTMLElement>('.relic-stack') ??
        this.boardElement.querySelector<HTMLElement>('.player-card')
      )
    }
    const handStack = this.boardElement.querySelector<HTMLElement>('.hand-stack')
    if (handStack) {
      const rect = handStack.getBoundingClientRect()
      // Hand rewards aim just below the combo gauge, nudged down a little so
      // the first visible card starts at the top edge instead of popping in mid-stack.
      return new DOMRect(rect.left + rect.width / 2 - 8, rect.top + 22, 16, 16)
    }
    return this.boardElement.querySelector<HTMLElement>('.hand-panel')
  }

  private ensureResourceTrailStyles(): void {
    if (document.getElementById('resource-trail-styles')) return
    const style = document.createElement('style')
    style.id = 'resource-trail-styles'
    style.textContent = `
.resource-trail-piece {
  position: fixed;
  left: 0;
  top: 0;
  z-index: 230;
  border-radius: 4px;
  pointer-events: none;
  background: var(--trail-color, rgba(255, 232, 168, 0.82));
  box-shadow: 0 0 14px var(--trail-glow, rgba(255, 218, 132, 0.28));
  will-change: transform, opacity, filter;
}
`
    document.head.appendChild(style)
  }

  private trailColors(theme: BurstTheme): { color: string; glow: string } {
    switch (theme) {
      case 'score':
      case 'treasure-gain':
      case 'flower-chamomile':
      case 'flower-marigold':
        return { color: 'rgba(255, 224, 126, 0.86)', glow: 'rgba(255, 211, 92, 0.34)' }
      case 'health-gain':
      case 'flower-red-rose':
        return { color: 'rgba(240, 106, 114, 0.8)', glow: 'rgba(255, 216, 201, 0.3)' }
      case 'shield-gain':
      case 'flower-oleander':
        return { color: 'rgba(227, 184, 78, 0.78)', glow: 'rgba(255, 241, 184, 0.3)' }
      case 'ember-gain':
        return { color: 'rgba(255, 122, 44, 0.78)', glow: 'rgba(255, 240, 164, 0.3)' }
      case 'gauge-gain':
      case 'flower-lavender':
        return { color: 'rgba(169, 150, 238, 0.76)', glow: 'rgba(238, 230, 255, 0.28)' }
      case 'attack-gain':
      case 'hand-attack':
        return { color: 'rgba(214, 73, 47, 0.78)', glow: 'rgba(244, 195, 74, 0.28)' }
      case 'hand-control':
        return { color: 'rgba(95, 166, 216, 0.74)', glow: 'rgba(220, 238, 252, 0.26)' }
      case 'hand-recovery':
        return { color: 'rgba(126, 208, 145, 0.76)', glow: 'rgba(226, 247, 200, 0.24)' }
      // 불씨 기사단장 카드 효과 — 촛농/양초/불씨 트레일 톤.
      case 'boss-wax-drip':
        return { color: 'rgba(217, 154, 58, 0.8)', glow: 'rgba(255, 230, 173, 0.3)' }
      case 'boss-candle-flame':
        return { color: 'rgba(242, 214, 80, 0.8)', glow: 'rgba(255, 248, 220, 0.3)' }
      case 'boss-ember-spark':
        return { color: 'rgba(255, 122, 44, 0.8)', glow: 'rgba(255, 217, 138, 0.3)' }
      case 'starlight':
        return { color: 'rgba(170, 166, 245, 0.84)', glow: 'rgba(224, 228, 255, 0.36)' }
      default:
        return { color: 'rgba(220, 162, 51, 0.78)', glow: 'rgba(255, 233, 164, 0.26)' }
    }
  }

  private rectCenter(target: HTMLElement | DOMRect): { x: number; y: number } {
    const rect = target instanceof HTMLElement ? target.getBoundingClientRect() : target
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
  }

  private animateResourceTrail(
    source: HTMLElement | DOMRect | null,
    target: HTMLElement | DOMRect | null,
    count: number,
    theme: BurstTheme
  ): Promise<void> {
    if (!source || !target || count <= 0) return Promise.resolve()
    this.ensureResourceTrailStyles()
    const from = this.rectCenter(source)
    const to = this.rectCenter(target)
    const colors = this.trailColors(theme)
    const launches: Promise<void>[] = []
    for (let i = 0; i < count; i += 1) {
      launches.push(
        new Promise((resolve) => {
          window.setTimeout(() => {
            const finished: Promise<void>[] = []
            const specs = [
              { size: 24, lag: 0, alpha: 0.72 },
              // Tighter lags keep the familiar triple-tail silhouette while
              // reducing the small pause before the HUD number starts ticking.
              { size: 17, lag: 30, alpha: 0.52 },
              { size: 11, lag: 58, alpha: 0.36 },
            ]
            for (const spec of specs) {
              finished.push(this.spawnResourceTrailPiece(from, to, colors, spec))
            }
            window.setTimeout(() => {
              SquareBurst.playAt(to.x, to.y, theme, {
                count: 12,
                spread: 74,
                duration: 420,
                size: [6, 14],
              })
              // Resolve on impact, not after every tail particle fades. Callers
              // can update counters/hand cards during this burst beat.
              resolve()
            }, 280)
            // Trail pieces remove themselves asynchronously after the impact;
            // keeping that cleanup separate prevents old sequential calculations.
            void Promise.all(finished)
          }, i * 95)
        })
      )
    }
    return Promise.all(launches).then(() => undefined)
  }

  private spawnResourceTrailPiece(
    from: { x: number; y: number },
    to: { x: number; y: number },
    colors: { color: string; glow: string },
    spec: { size: number; lag: number; alpha: number }
  ): Promise<void> {
    return new Promise((resolve) => {
      window.setTimeout(() => {
        const piece = document.createElement('div')
        piece.className = 'resource-trail-piece'
        piece.style.width = `${spec.size}px`
        piece.style.height = `${Math.round(spec.size * 1.34)}px`
        piece.style.setProperty('--trail-color', colors.color)
        piece.style.setProperty('--trail-glow', colors.glow)
        piece.style.opacity = `${spec.alpha}`
        document.body.appendChild(piece)
        const dx = to.x - from.x
        const dy = to.y - from.y
        const curve = Math.min(90, Math.max(34, Math.abs(dx) * 0.08 + Math.abs(dy) * 0.05))
        const anim = piece.animate(
          [
            {
              transform: `translate(${from.x - spec.size / 2}px, ${from.y - spec.size / 2}px) rotate(-8deg) scale(0.82)`,
              opacity: 0,
              filter: 'blur(0.2px)',
            },
            {
              transform: `translate(${from.x + dx * 0.58 - spec.size / 2}px, ${from.y + dy * 0.58 - curve - spec.size / 2}px) rotate(10deg) scale(1)`,
              opacity: spec.alpha,
              filter: 'blur(0px)',
              offset: 0.58,
            },
            {
              transform: `translate(${to.x - spec.size / 2}px, ${to.y - spec.size / 2}px) rotate(2deg) scale(0.54)`,
              opacity: 0,
              filter: 'blur(0.8px)',
            },
          ],
          { duration: 330, easing: 'cubic-bezier(0.18, 0.88, 0.22, 1)', fill: 'forwards' }
        )
        anim.onfinish = () => {
          piece.remove()
          resolve()
        }
        window.setTimeout(() => {
          piece.remove()
          resolve()
        }, 500)
      }, spec.lag)
    })
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
    const anchor = this.findScorePulseAnchor()
    if (anchor) this.burstAtElement(anchor, 'score', { count: 22, spread: 170, duration: 640 })
  }

  /** Play shop-currency gain feedback with the exact same sparkle language as
   *  score, but keep the wallet's trailing dollar marker.
   *  pulseKey 미변동 시 skip — 점수 보상 시 화폐 패널 burst가 같이 뜨던 문제 차단. */
  playCoinGainFeedback(targetCoins: number, pulseKey: number): void {
    if (pulseKey === this.previousCoinPulseKey && pulseKey === this.activeCoinPulseKey) return
    this.rememberImmediateResourcePulse('coin', targetCoins, pulseKey)
    this.animateResourceCounter('.coin-number', targetCoins, ' $')
    const anchor = this.findCoinPulseAnchor()
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

  /** Find the score/log panel for score-pulse bursts. */
  findScorePulseAnchor(): HTMLElement | null {
    return (
      this.boardElement.querySelector<HTMLElement>('.score-number') ??
      this.boardElement.querySelector<HTMLElement>('.score-panel')
    )
  }

  /** Find the coin number element for coin-pulse bursts. */
  findCoinPulseAnchor(): HTMLElement | null {
    return (
      this.boardElement.querySelector<HTMLElement>('.coin-number') ??
      this.boardElement.querySelector<HTMLElement>('.coin-panel-total') ??
      this.boardElement.querySelector<HTMLElement>('.score-panel')
    )
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
    // Matches the impact beat of one resource-trail piece in
    // animateResourceTrail (window.setTimeout at 330ms).
    const trailLandMs = 330
    enteringSlots.forEach((el) => {
      const slotRect = el.getBoundingClientRect()
      const offsetY = spawnY - slotRect.top
      el.style.setProperty('--hand-drop-start-y', `${offsetY}px`)
      el.style.setProperty('--hand-drop-delay-ms', String(trailLandMs))
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

/** HTML 직접 삽입용 문자열 이스케이프(보스 인트로의 카드 이름 등에 사용). */
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))
}
