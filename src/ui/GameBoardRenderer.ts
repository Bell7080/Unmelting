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
import { spriteForCard, spriteForHandCard, spriteForRelic, SpriteUrls } from '@ui/Sprites'
import { CandleMode, Character } from '@entities/Character'
import { HandCardId, HandCategory, HandEffectTargeting } from '@entities/HandCard'
import { getHandCardDef } from '@data/HandCards'
import type { EmberTier, SpawnWeights } from '@systems/EmberSystem'
import { EmberSystem } from '@systems/EmberSystem'
import { ENEMY_DEFINITIONS, MIMIC_BY_SPAN } from '@systems/CardSpawner'
import { HAND_CARD_DEFINITIONS, HAND_CARD_IDS } from '@data/HandCards'
import { getRelicDef, RELIC_DEFINITIONS, type RelicId } from '@data/Relics'
import { HAND_CARD_RARITY, RARITY_CLASS_BY_TIER, SHOP_PACK_LABELS, type CardRarity } from '@data/ShopPools'
import { RECIPES } from '@data/Recipes'
import { SquareBurst, type BurstTheme } from '@ui/SquareBurst'
import { GAME_BOARD_STYLES } from '@ui/styles/GameBoardStyles'
import { initTouchBody, attachHandCardTouch, attachShopTouchHighlight } from '@ui/MobileTouchManager'
import {
  bookIcon,
  candleIcon,
  coinIcon,
  flameIcon,
  heartIcon,
  pouchIcon,
  shieldIcon,
  sparkleIcon,
  swordIcon,
  tagIcon,
} from '@ui/Icons'

export interface CardActionDetail {
  laneIndex: number
  distance: number
  card: Card
}

export interface ItemActionDetail {
  itemIndex: number
  shiftKey?: boolean
}

export type ShopPackKind = 'basic-pack' | 'upgrade-pack' | 'unlock-pack' | 'blessing-pack' | 'resource-pack' | 'enhance-pack' | 'delete-pack'

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
}
export interface ShopPackPickerView {
  packKind: ShopPackKind
  title: string
  items: ShopPackItemView[]
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
  upgradePackCost: number
  unlockPackCost: number
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

export interface ScorePanelState {
  score: number
  logs: ActivityLogEntry[]
  scorePulseKey: number
  coins: number
  coinPulseKey: number
  emberTier?: EmberTier
  spawnWeights?: SpawnWeights
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
  /** Source rect for a just-bought shop relic; the next render uses it to
   *  fly a full artifact card into the owned fan instead of popping in. */
  private pendingRelicArrival: { relicId: RelicId; rect: DOMRect } | null = null
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

    if (this.selected) {
      const lane = lanes[this.selected.laneIndex]
      if (!lane || !lane.getCardAtDistance(this.selected.distance)) {
        this.selected = null
      }
    }

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

        ${this.renderHand(character, scorePanel)}
      </div>
    `

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
    const renderedScore = activeScoreAnim
      ? this.computeActiveCounterValue(activeScoreAnim)
      : scoreCounting
        ? this.displayedScoreValue
        : scorePanel.score
    const renderedCoins = activeCoinAnim
      ? this.computeActiveCounterValue(activeCoinAnim)
      : coinCounting
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
            <span class="score-kicker-icon">${coinIcon()}</span>
            불빛
          </div>
          <div class="score-number ${scorePulseClass}" data-score-pulse="${scorePanel.scorePulseKey}" data-count-start="${renderedScore}" data-count-end="${scorePanel.score}" data-count-suffix="">
            ${renderedScore.toLocaleString()}
          </div>
        </section>
        <section class="coin-panel-total" aria-label="Shop currency">
          <div class="score-kicker">
            <span class="score-kicker-icon">${coinIcon()}</span>
            화폐
          </div>
          <div class="coin-number ${coinPulseClass}" data-coin-pulse="${scorePanel.coinPulseKey}" data-count-start="${renderedCoins}" data-count-end="${scorePanel.coins}" data-count-suffix=" $">
            ${renderedCoins.toLocaleString()} $
          </div>
        </section>
        <section class="score-log-list" aria-label="Action history">
          ${logs}
        </section>
      </aside>
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
    return this.isValidTargetRule(def.targeting.base, card, distance)
  }

  /** Check a hand target rule without mutating game state. */
  private isValidTargetRule(rule: HandEffectTargeting, card: Card, distance: number): boolean {
    if (rule.selection !== 'target') return false
    if (rule.zone === 'front' && distance !== 0) return false
    if (rule.zone === 'waiting' && distance === 0) return false
    if (rule.zone !== 'front' && rule.zone !== 'waiting' && rule.zone !== 'field') return false
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
      // Trap stats use the same flat sword + number layout as enemies so
      // every "이 카드가 주는 피해" reads identically across the rail. The
      // only exceptions are the bomb's countdown state and the 3-trap death
      // gate, which are status words rather than numeric damage.
      if (card.trapKind === 'bomb') {
        const bombText = card.isBombArmed ? '점화' : '폭발'
        stats = `<div class="card-stats"><span class="stat trap-state">${bombText}</span></div>`
      } else {
        // Every non-bomb trap (including the 3-cell "instant death" gate
        // and spore) uses the same flat sword+number readout as enemies.
        // 3-cell traps display 999 instead of their actual penalty so the
        // "you'll die" weight reads at a glance without falling back to
        // a text pill.
        const damage =
          card.groupCount >= 3 && card.trapKind !== 'spore' ? 999 : card.getTrapDamagePenalty()
        stats = `
          <div class="card-stats">
            <span class="stat atk">${swordIcon()}<span class="stat-value">${damage}</span></span>
          </div>
        `
      }
    } else if (card.type === CardType.FLOWER) {
      // Flower cells expose their current harvest value. Seeds show a waiting
      // label because they cannot be picked until the front-row bloom beat.
      const label =
        card.flowerKind === 'seed'
          ? '대기'
          : card.flowerKind === 'marigold' && card.flowerTurnsAlive % 2 === 1
            ? `다음 +${card.flowerValue + 1}`
            : `+${card.flowerValue}`
      stats = `<div class="card-stats group-note flower-note">${sparkleIcon()}<span>${label}</span></div>`
    } else if (card.type === CardType.TREASURE && card.groupCount > 1) {
      // 보스 보상 카드는 개별 효과 설명을, 일반 상자는 실제 드롭 수(1/3/5)를 표시한다.
      const CHEST_DROP_BY_SPAN: Record<number, number> = { 1: 1, 2: 3, 3: 5 }
      const dropCount = CHEST_DROP_BY_SPAN[Math.min(3, Math.max(1, card.groupCount))] ?? card.groupCount
      const treasureNote = card.id.startsWith('boss-reward-')
        ? escapeHtml(card.description)
        : `손패 ${dropCount}장`
      stats = `<div class="card-stats group-note treasure-group-note">${sparkleIcon()}<span>${treasureNote}</span></div>`
    }

    const groupBadge = span > 1 ? `<div class="group-badge">×${span}</div>` : ''
    const frozenBadge = card.isFrozen()
      ? `<div class="frozen-badge">굳음 ${card.frozenTurns}</div>`
      : ''
    const trapBadge =
      card.type === CardType.TRAP && card.trapKind === 'bomb' && card.isBombArmed
        ? `<div class="frozen-badge bomb-badge">점화</div>`
        : card.type === CardType.TRAP && card.trapKind === 'spore'
          ? `<div class="frozen-badge spore-badge">번식 ${card.sporeTurnsUntilSpread}</div>`
          : ''

    // 보스 보상 카드는 3-wide span이어도 카드 자체 이름을 그대로 표시한다.
    const groupName = span > 1 && !card.isSpecialEnemy && !card.id.startsWith('boss-reward-')
      ? this.groupName(card.type, span)
      : card.name

    const sprite = spriteForCard(card)
    const artStyle = sprite ? `style="background-image: url('${sprite}')"` : ''

    return `
      ${groupBadge}
      ${frozenBadge}
      ${trapBadge}
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
    const hpPct = Math.max(0, Math.min(100, (hp / Math.max(1, maxHp)) * 100))
    const atk = card.getDamage()
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
          <div class="boss-face-hpbar" aria-label="보스 체력">
            <div class="boss-face-hpbar-fill" style="width:${hpPct}%"></div>
            <span class="boss-face-hpbar-text">
              <span class="boss-face-hpbar-icon">${heartIcon()}</span>
              ${this.renderHudCounter('boss-hp', hp)}<span class="boss-face-hpbar-sep">/</span><span>${maxHp}</span>
            </span>
          </div>
          <span class="boss-face-atk">${swordIcon()}<span class="boss-face-atk-value">${atk}</span></span>
        </div>
      </article>
    `
  }

  private groupName(type: CardType, span: number): string {
    if (span <= 1) return ''
    if (type === CardType.ENEMY) return span === 2 ? '적 무리' : '거대 적 무리'
    if (type === CardType.TRAP) return span === 2 ? '함정 무리' : '거대 함정'
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
    const currentMode = character.candleMode ?? 'max-health'
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
    const allModes: CandleMode[] = ['max-health', 'attack', 'ember', 'draw']
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
          <div class="candle-gauge-meter" style="--candle-fill: ${candlePct}%">
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
    const rotate = Math.max(-18, Math.min(18, offset * 7))
    const spread = Math.max(-54, Math.min(54, offset * 22))
    const lift = Math.abs(offset) * 3
    // Edge cards enlarge inward so a large relic fan remains readable instead
    // of letting the left/right cards grow offscreen.
    const hoverShift = Math.round(Math.max(-92, Math.min(92, -offset * 18)))
    const pinnedClass = this.pinnedRelicId === def.id ? 'is-pinned' : ''
    return `
      <article class="relic-mini-card ${pinnedClass}"
               data-owned-relic="${def.id}"
               style="--relic-i:${index}; --relic-x:${spread}px; --relic-rot:${rotate}deg; --relic-y:${lift}px; --relic-hover-shift:${hoverShift}px;"
               tabindex="0"
               title="${def.name}: ${def.effect}"
               aria-label="${def.name}: ${def.effect}">
        ${this.relicPreviewFace(def.id)}
      </article>
    `
  }

  /** Owned relics reuse the shop card reading structure without the price tag.
   *  Keeping the same art/body/title/effect/flavor class names lets inventory
   *  cards scale up on hover with text legibility matching shop relic cards. */
  private relicPreviewFace(id: RelicId): string {
    const def = getRelicDef(id)
    return `
      <article class="relic-preview-card" aria-hidden="true">
        <div class="shop-relic-art" style="background-image: url('${spriteForRelic(def.id)}')" aria-hidden="true"></div>
        <div class="shop-relic-body">
          <h3 class="shop-relic-title">${def.name}</h3>
          <p class="shop-relic-effect">${def.effect}</p>
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
  }): string {
    const badgeHtml = opts.badge ? `<span class="common-card-badge">${opts.badge}</span>` : ''
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
    return this.commonCardFace({
      artUrl: spriteForHandCard(defId),
      name: `${def.name}${merged ? ' ★' : ''}`,
      description,
      extraClass,
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
    tag?: string
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
    const artHtml =
      opts.art.kind === 'sprite'
        ? `<div class="codex-tile-art" style="background-image: url('${opts.art.url}');" aria-hidden="true"></div>`
        : `<div class="codex-tile-art codex-tile-art--icon" aria-hidden="true">${opts.art.svg}</div>`
    const tagHtml = opts.tag ? `<span class="codex-tile-tag">${opts.tag}</span>` : ''
    const chipsHtml = (opts.chips ?? [])
      .map((c) => {
        const tone = c.tone && c.tone !== 'plain' ? `is-${c.tone}` : ''
        const iconHtml = c.icon ?? ''
        const labelHtml = c.label ? `<span class="codex-stat-key">${c.label}</span>` : ''
        return `<span class="codex-stat-chip ${tone}">${iconHtml}${labelHtml}${c.value}</span>`
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
          ${tagHtml}
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
  private enhancedHandCardDescription(id: HandCardId, merged: boolean): string {
    const def = getHandCardDef(id)
    const enhancements = this.currentGameState?.enhancements
    const bonus = merged
      ? (enhancements?.tripleBonus[id] ?? 0)
      : (enhancements?.singleBonus[id] ?? 0)
    if (bonus === 0) return merged ? def.tripleDescription : def.description
    switch (id) {
      case 'wax-drop': return merged ? `체력 +${5 + bonus}` : `체력 +${1 + bonus}`
      case 'candle':   return merged ? `방패 +${5 + bonus}` : `방패 +${1 + bonus}`
      case 'ember':    return merged ? `필드 선택 적 1장 피해 ${10 + bonus}` : `필드 선택 적 1장 피해 ${2 + bonus}`
      case 'match':    return merged ? `불씨 카운트 +${5 + bonus}` : `불씨 카운트 +${1 + bonus}`
      case 'card':     return merged ? `손패 콤보 카운트 +${7 + bonus}` : `손패 콤보 카운트 +${1 + bonus}`
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
        return { label: '불씨', effect: '불씨 +3', icon: flameIcon() }
      case 'draw':
        return { label: '손패', effect: '랜덤 3장', icon: pouchIcon() }
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
                (recipe) => `
                  <span class="hand-recipe-preview-row">
                    <strong>${recipe.name}</strong>
                    <em>${recipe.flavor}</em>
                  </span>
                `
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
                  aria-label="${def.name}: ${description}${recipeReadyTitle ? ` · ${recipeReadyTitle}` : ''}">
            ${tripleMergeCopies}
            ${recipeReady ? '<span class="recipe-ready-mark" aria-hidden="true">✦</span>' : ''}
            ${card.merged ? '<span class="merged-mark" aria-hidden="true">✦</span>' : ''}
            <span class="hand-card-thumb" aria-hidden="true">
              <img src="${handArt}" alt="" loading="lazy" />
            </span>
            <span class="hand-card-name">${def.name}${card.merged ? ' ★' : ''}</span>
          </button>
          <div class="hand-card-preview" style="--hand-card-back: url('${SpriteUrls.cardBack}');" aria-hidden="true">
            ${this.handCardFace(card.defId, description, card.merged)}
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
      <aside class="hand-panel" aria-label="Hand">
        <header class="hand-header">
          <span class="hand-header-icon">${pouchIcon()}</span>
          손패 (${character.hand.length}/${handMax})
        </header>
        ${this.renderCandleGauge(character)}
        <ul class="hand-stack ${character.hand.length >= 8 ? 'is-crowded' : ''}" style="--hand-count: ${character.hand.length}">${reversed}</ul>
      </aside>
    `
  }

  /** Single source of truth for shop-card affordance classes. Keeping this
   *  separate lets purchase refreshes update existing DOM nodes without
   *  rebuilding images, which removes the small flash/reload feeling. */
  private shopRelicAffordabilityClass(offer: ShopOfferView, score: number): string {
    if (offer.purchased) return 'is-purchased'
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
            <span class="shop-price-label" aria-hidden="true">
              <span class="shop-price-label-icon">${tagIcon()}</span>
              <span class="shop-price-label-text">${claimed ? '획득 완료' : '무료'}</span>
            </span>
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
      'upgrade-pack': 'rare',
      'unlock-pack': 'epic',
      'blessing-pack': 'epic',
      'resource-pack': 'epic',
      'enhance-pack': 'unique',
      'delete-pack': 'legendary',
    }
    const rarityClass = RARITY_CLASS_BY_TIER[packRarityClassMap[kind]]
    return `
      <article class="shop-pack-card pack-theme-${theme} ${affordable} ${rarityClass}"
               data-shop-buy-kind="${kind}"
               tabindex="0"
               style="--cardback-url:url('${SpriteUrls.cardBack}'); --shop-pack-order:${order};"
               aria-label="${title} — ${cost}점">
        <div class="shop-pack-illustration" style="background-image: url('${artUrl}')" aria-hidden="true"></div>
        <div class="shop-pack-overlay">
          <h3 class="shop-pack-title">${title}</h3>
          <p class="shop-pack-effect">${effect}</p>
        </div>
        <span class="shop-price-label shop-pack-price" aria-hidden="true">
          <span class="shop-price-label-icon">${tagIcon()}</span>
          <span class="shop-price-label-text">${cost.toLocaleString()}점</span>
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
    const cards = view.items
      .map(
        (item, i) => {
          // 개별 카드 아트가 있으면 우선 사용, 없으면 팩 커버 fallback
          const artUrl = item.spriteUrl ?? SpriteUrls.packs[view.packKind]
          return `
          <article class="shop-pack-pick-card pack-theme-${item.theme} ${RARITY_CLASS_BY_TIER[item.rarity]}"
                   data-pack-pick="${item.id}"
                   data-pack-kind="${view.packKind}"
                   style="--pick-i:${i}; --cardback-url:url('${SpriteUrls.cardBack}');"
                   tabindex="0"
                   aria-label="${item.title} — ${item.effect}">
            <!-- 카드 팩 3선택도 flipper 내부 2면을 회전시켜 테두리/배경/콘텐츠가 함께 뒤집힌다. -->
            <div class="shop-pack-pick-flipper">
              <div class="shop-pack-pick-back" aria-hidden="true"></div>
              <div class="shop-pack-pick-front">
                <div class="shop-pack-pick-art" style="background-image:url('${artUrl}');" aria-hidden="true"></div>
                <div class="shop-pack-pick-body">
                  <header class="shop-pack-pick-card-head">
                    <span class="shop-pack-pick-card-name">${item.title}</span>
                    <span class="shop-pack-pick-card-rarity ${RARITY_CLASS_BY_TIER[item.rarity]}">${item.rarity}</span>
                  </header>
                  <p class="shop-pack-pick-card-effect">${item.effect}</p>
                </div>
              </div>
            </div>
          </article>`
        }
      )
      .join('')
    host.classList.remove('is-closing')
    host.innerHTML = `
      <div class="shop-pack-picker-veil" style="--shop-picker-bg:url('${SpriteUrls.shopPickerBg}');" aria-hidden="true"></div>
      <div class="shop-pack-picker-shell" role="dialog" aria-label="${view.title}">
        <header class="shop-pack-picker-head">
          <h2>${view.title}</h2>
          <p>3장 중 1장을 골라.</p>
        </header>
        <div class="shop-pack-picker-cards">${cards}</div>
      </div>
    `
    host.classList.add('is-open')
    shell.classList.add('is-pack-picker-open')
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
   *  separate price button is gone). Price uses the flat tag icon from
   *  the shared SVG icon family instead of the old taped label.
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
               aria-label="${def.name} — ${offer.purchased ? '구매 완료' : `점수 ${offer.price}점`}">
        <!-- Hand-preview와 동일한 2면 플립 구조: flipper 컨테이너 내부에 앞/뒷면을 고정한다. -->
        <div class="shop-relic-flipper">
        <div class="shop-relic-front">
          <div class="shop-relic-art" style="background-image: url('${spriteForRelic(def.id)}')" aria-hidden="true"></div>
          <div class="shop-relic-body">
            <h3 class="shop-relic-title">${def.name}</h3>
            <p class="shop-relic-effect">${def.effect}</p>
            <p class="shop-relic-flavor">${def.flavor}</p>
          </div>
        </div>
        <!-- Back face is ALWAYS present as a full cardbackground_001.webp panel.
             During rotation it behaves like a real card back, not an overlay hack. -->
        <div class="shop-relic-cardback" aria-hidden="true"></div>
        </div>
        <!-- 가격 라벨은 flipper(둥근 마스크) 밖으로 분리해서 카드 하단 아래에 항상 노출되게 유지한다. -->
        <span class="shop-price-label shop-relic-price-label" aria-hidden="true">
          <span class="shop-price-label-icon">${tagIcon()}</span>
          <span class="shop-price-label-text">${
            offer.purchased ? '구매 완료' : `${offer.price.toLocaleString()}점`
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
        if (!kind) return
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
    const upgradePackLabel = SHOP_PACK_LABELS['upgrade-pack']
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
              ${shop.mode === 'altar' ? this.renderShopFreeCard(!!shop.freeCoinCardClaimed, '수당', '5$', 'free-coin-card') : ''}
            </div>
            <div class="shop-layer shop-pack-layer">
              ${shop.mode === 'altar'
                ? [
                    this.renderShopPackCard('blessing-pack', '축복팩', '패시브 능력 3택1 획득', shop.basicPackCost, score, 'upgrade', 0),
                    this.renderShopPackCard('resource-pack', '자원팩', '최대 수치 3택1 증가', shop.upgradePackCost, score, 'resource', 1),
                    this.renderShopPackCard('enhance-pack', '강화팩', '카드 단일 능력 3택1 강화', shop.unlockPackCost, score, 'unlock', 2),
                    this.renderShopPackCard('delete-pack', '삭제팩', '카드 등장 금지 3택1', shop.unlockPackCost, score, 'unlock', 3),
                  ].join('')
                : [
                    this.renderShopPackCard('basic-pack', basicPackLabel.title, basicPackLabel.effect, shop.basicPackCost, score, 'resource', 0),
                    this.renderShopPackCard('upgrade-pack', upgradePackLabel.title, upgradePackLabel.effect, shop.upgradePackCost, score, 'upgrade', 1),
                    this.renderShopPackCard('unlock-pack', unlockPackLabel.title, unlockPackLabel.effect, shop.unlockPackCost, score, 'unlock', 2),
                  ].join('')}
            </div>
          </section>
          <button class="shop-close-btn" type="button" data-shop-close aria-label="상점 나가기">EXIT</button>
        </div>
      </div>
    `
    this.shopOverlayElement.classList.add('is-open')
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
        `${def.name} — ${offer.purchased ? '구매 완료' : `점수 ${offer.price}점`}`
      )
      const label = card.querySelector<HTMLElement>('.shop-price-label-text')
      if (label)
        label.textContent = offer.purchased ? '구매 완료' : `${offer.price.toLocaleString()}점`
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

    // Free card claimed state.
    const free = shell.querySelector<HTMLElement>('.shop-free-card')
    if (free) {
      free.classList.remove('is-affordable', 'is-purchased')
      free.classList.add(shop.freeCardClaimed ? 'is-purchased' : 'is-affordable')
      const freeLabel = free.querySelector<HTMLElement>('.shop-price-label-text')
      if (freeLabel) freeLabel.textContent = shop.freeCardClaimed ? '획득 완료' : '무료'
    }

    // Pack tiles (cost + affordance based on score).
    const packMap: Record<ShopPackKind, number> = {
      'basic-pack': shop.basicPackCost,
      'upgrade-pack': shop.upgradePackCost,
      'unlock-pack': shop.unlockPackCost,
      'blessing-pack': shop.basicPackCost,
      'resource-pack': shop.upgradePackCost,
      'enhance-pack': shop.unlockPackCost,
      'delete-pack': shop.unlockPackCost,
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
      if (priceText) priceText.textContent = `${cost.toLocaleString()}점`
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
    spriteUrl?: string
  }): Promise<void> {
    // 잔재 정리: 직전 보스 이벤트가 비정상 종료됐다면 같은 노드가 남아 있을 수 있다.
    document.getElementById('boss-intro-overlay')?.remove()
    const spriteUrl = opts.spriteUrl ?? SpriteUrls.enemyWaves[3]
    const host = document.createElement('div')
    host.id = 'boss-intro-overlay'
    host.className = 'boss-intro-overlay'
    host.innerHTML = `
      <section class="boss-intro-overlay-card" role="dialog" aria-label="보스 출현">
        <div class="boss-intro-overlay-art" style="background-image:url('${spriteUrl}');" aria-hidden="true"></div>
        <div class="boss-intro-overlay-body">
          <span class="boss-intro-overlay-kicker">탐욕의 대가</span>
          <h2 class="boss-intro-overlay-name">${escapeHtml(opts.name)}</h2>
          <ul class="boss-intro-overlay-stats">
            <li><span class="boss-intro-overlay-stat-label">체력</span><span class="boss-intro-overlay-stat-value">${opts.maxHp}</span></li>
            <li><span class="boss-intro-overlay-stat-label">공격력</span><span class="boss-intro-overlay-stat-value">${opts.attack}</span></li>
            <li><span class="boss-intro-overlay-stat-label">반격 주기</span><span class="boss-intro-overlay-stat-value">3턴</span></li>
          </ul>
          <p class="boss-intro-overlay-desc">"내 저택에 온 것을 환영하네, 위태로운 불씨여."</p>
          <p class="boss-intro-overlay-trait"><strong>특징</strong> · 보스 체력이 3 닳을 때마다 플레이어에게 랜덤 손패 1장을 지급한다.</p>
        </div>
      </section>
      <div class="boss-intro-overlay-hint" aria-hidden="true">CLICK ANYWHERE TO CONTINUE</div>
    `
    document.body.appendChild(host)
    // 등장 비트가 자리잡도록 한 프레임 정도 대기 후 클릭 수락.
    await new Promise((resolve) => window.setTimeout(resolve, 80))
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

  async playBossDefeatSequence(cardId: string): Promise<void> {
    const tile = this.findCardElement(cardId)
    if (!tile) return
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
  }

  /** runCardPool이 바뀔 때마다 호출해 도감 손패/조합 탭의 잠금 표시를 갱신한다. */
  setLockedCardIds(ids: readonly HandCardId[]): void {
    this.lockedCardIds = new Set(ids)
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

    // 보스.
    const bossKnown = encountered.has('양초 백작')
    const bossTile = this.codexTile({
      art: { kind: 'sprite', url: SpriteUrls.boss },
      name: bossKnown ? '양초 백작' : '???',
      tag: '보스',
      chips: bossKnown
        ? [{ icon: heart, value: '30', tone: 'hp' }, { icon: sword, value: '5', tone: 'atk' }]
        : [],
      note: bossKnown ? '30턴 제단 수문장. 3칸을 점령.' : undefined,
      extraClass: bossKnown ? undefined : 'codex-tile--unknown',
    })

    return `
      <h3 class="compendium-section">적</h3>
      <div class="codex-tile-grid">${allEnemyTiles}</div>
      <h3 class="compendium-section">합쳐진 적</h3>
      <div class="codex-tile-grid">${mergeTwo}${mergeThree}</div>
      <h3 class="compendium-section">특수 적</h3>
      <div class="codex-tile-grid">${mimicTiles}${monsterFlowerTile}</div>
      <h3 class="compendium-section">보스</h3>
      <div class="codex-tile-grid">${bossTile}</div>
    `
  }

  private renderCompendiumTraps(): string {
    const sword = swordIcon()
    // Web variants: one tile per merge stage with that stage's actual name.
    const webNames: Record<1 | 2 | 3, string> = {
      1: '양초 거미줄',
      2: '촛농 거미집',
      3: '밀랍 거미굴',
    }
    const webDamage: Record<1 | 2 | 3, string> = { 1: '2', 2: '5', 3: '999' }
    const webTiles = ([1, 2, 3] as const)
      .map((span) =>
        this.codexTile({
          art: { kind: 'sprite', url: SpriteUrls.trapGroups.web[span] },
          name: webNames[span],
          tag: `${span}칸`,
          chips: [{ icon: sword, value: webDamage[span], tone: 'atk' }],
        })
      )
      .join('')

    // Spore variants. Spores carry both bite damage and a 2-turn spread tick.
    const sporeNames: Record<1 | 2 | 3, string> = {
      1: '감염 포자',
      2: '번식 포자군',
      3: '포자 군락',
    }
    const sporeDamage: Record<1 | 2 | 3, string> = { 1: '1', 2: '3', 3: '5' }
    const sporeTiles = ([1, 2, 3] as const)
      .map((span) =>
        this.codexTile({
          art: { kind: 'sprite', url: SpriteUrls.trapGroups.spore[span] },
          name: sporeNames[span],
          tag: `${span}칸`,
          chips: [
            { icon: sword, value: sporeDamage[span], tone: 'atk' },
            { label: '전염 ', value: '2턴마다', tone: 'spore' },
          ],
        })
      )
      .join('')

    // Bomb does not merge by design, so it's documented as a single 1칸 tile.
    const bombTile = this.codexTile({
      art: { kind: 'sprite', url: SpriteUrls.traps.bomb },
      name: '양초 폭탄',
      tag: '1칸',
      chips: [
        { icon: sword, value: '5', tone: 'bomb' },
        { label: '점화 ', value: '1턴', tone: 'bomb' },
      ],
      note: '전방 도착 시 점화, 다음 턴 폭발. 인접 적도 피해.',
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
    // One tile per chest size mirrors the rail: the sprite, the lane name,
    // and only the per-size drop count differ; vanish/mimic odds are shared.
    // 이름은 rail의 groupName과 일치시킨다. 드롭 수는 ActionSystem.TREASURE_DROPS_BY_SPAN(1/3/5) 기준.
    const CHEST_DROPS = [1, 3, 5] as const
    const chestSpec: Array<{ span: 1 | 2 | 3; name: string; sprite: string }> = [
      { span: 1, name: '작은 상자', sprite: SpriteUrls.chestSmall },
      { span: 2, name: '적당한 상자', sprite: SpriteUrls.chestMedium },
      { span: 3, name: '큰 상자', sprite: SpriteUrls.chestLarge },
    ]
    const tiles = chestSpec
      .map((c) =>
        this.codexTile({
          art: { kind: 'sprite', url: c.sprite },
          name: c.name,
          tag: `${c.span}칸`,
          chips: [
            { label: '드롭 ', value: `손패 ${CHEST_DROPS[c.span - 1]}장`, tone: 'gold' },
            { label: '사라짐 ', value: '50%/턴', tone: 'plain' },
            { label: '미믹화 ', value: '10%/턴', tone: 'spore' },
          ],
        })
      )
      .join('')
    return `<div class="codex-tile-grid">${tiles}</div>`
  }

  private renderCompendiumFlowers(): string {
    type Spec = {
      kind: FlowerKind
      harvest: { label: string; value: string; tone: 'hp' | 'atk' | 'gold' | 'shield' | 'flower' }
      growth: string
    }
    const specs: Spec[] = [
      {
        kind: 'chamomile',
        harvest: { label: '수확 ', value: '불빛', tone: 'gold' },
        growth: '턴마다 +1',
      },
      {
        kind: 'redRose',
        harvest: { label: '수확 ', value: '체력', tone: 'hp' },
        growth: '턴마다 +1',
      },
      {
        kind: 'marigold',
        harvest: { label: '수확 ', value: '화폐', tone: 'gold' },
        growth: '2턴마다 +1',
      },
      {
        kind: 'oleander',
        harvest: { label: '수확 ', value: '방패', tone: 'shield' },
        growth: '턴마다 +1',
      },
      {
        kind: 'lavender',
        harvest: { label: '수확 ', value: '손패 게이지', tone: 'flower' },
        growth: '턴마다 +1',
      },
    ]
    const seedTile = this.codexTile({
      art: { kind: 'sprite', url: SpriteUrls.flowers.seed },
      name: flowerDisplayName('seed'),
      tag: '씨앗',
      chips: [{ label: '발화 ', value: '5종 중 랜덤', tone: 'flower' }],
      note: '대기 라인에서만 등장. 전방 도착 시 꽃으로 발화.',
    })
    const flowerTiles = specs
      .map((s) =>
        this.codexTile({
          art: { kind: 'sprite', url: SpriteUrls.flowers[s.kind] },
          name: flowerDisplayName(s.kind),
          tag: '버프칸',
          chips: [
            { label: s.harvest.label, value: s.harvest.value, tone: s.harvest.tone },
            { label: '성장 ', value: s.growth, tone: 'plain' },
          ],
        })
      )
      .join('')
    return `
      <h3 class="compendium-section">씨앗</h3>
      <div class="codex-tile-grid">${seedTile}</div>
      <h3 class="compendium-section">꽃</h3>
      <div class="codex-tile-grid">${flowerTiles}</div>
    `
  }

  private renderCompendiumHand(): string {
    const tiles = HAND_CARD_IDS.map((id) => {
      const def = HAND_CARD_DEFINITIONS[id]
      const locked = this.lockedCardIds.has(id)
      const singleDesc = this.enhancedHandCardDescription(def.id, false)
      const tripleDesc = this.enhancedHandCardDescription(def.id, true)
      return this.codexTile({
        art: { kind: 'sprite', url: spriteForHandCard(def.id) },
        name: locked ? '???' : def.name,
        tag: locked ? '잠김' : def.category === 'recovery' ? '회복' : def.category === 'tool' ? '도구' : def.category === 'control' ? '컨트롤' : '공격',
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

  /** Relic tab documents shop relics and which ones the current run owns. */
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
          chips: [{ value: def.effect, tone: 'gold' }],
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
        '불씨 카운트',
        '우측 상단 불씨 자원. 성냥이 회복하며, 낮아질수록 전투/스폰 위험도가 오른다.',
      ],
      [
        '손패 콤보 카운트',
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
      const isLocked = Object.keys(r.ingredients).some((id) => this.lockedCardIds.has(id as HandCardId))
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
        stats: isLocked ? [] : [['효과', r.flavor]],
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
    const weights = scorePanel.spawnWeights
    const weightsText = weights
      ? `적 ${weights.enemy}% · 함정 ${weights.trap}% · 보물 ${weights.treasure}% · 꽃 ${weights.flower}%`
      : ''
    // dim→flickering 경계(ember < 4)에 디메리트 경고 라인 표시.
    const demeritLinePct = Math.min(100, (4 / visualEmberMax) * 100)
    return `
      <div class="ember-hud" aria-label="Ember status">
        <div class="ember-hud-inner">
          <div class="ember-line">
            <span class="ember-icon">${flameIcon()}</span>
            <div class="ember-bar">
              <div class="ember-bar-fill ember-tier-${tier}" style="width: ${pct}%"></div>
              <div class="ember-demerit-line" style="left: ${demeritLinePct.toFixed(1)}%" title="이 아래로 내려가면 적이 먼저 공격합니다" aria-hidden="true"></div>
              <span class="ember-bar-label">불씨 ${emberText}/${emberMaxText} · ${EmberSystem.tierLabel(tier)}</span>
            </div>
            <span class="ember-countdown" title="다음 불씨 감소까지 남은 턴">
              ${countdown}턴 뒤 -1
            </span>
          </div>
          <div class="ember-weights">${weightsText}</div>
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
    if (events.length === 0) {
      banner.classList.remove('is-on')
      this.previousChainUids = new Set()
      return
    }
    const parts: string[] = ['<span class="chain-banner-label">체인</span>']
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
        parts.push(`
          <span class="chain-event chain-event-recipe ${isNew}" data-chain-uid="${ev.uid}" title="${ev.flavor}">
            <span class="chain-event-mark">✦</span>
            <span class="chain-event-copy"><span class="chain-event-name">${ev.name}</span><span class="chain-event-flavor">${ev.flavor}</span></span>
          </span>
        `)
      } else if (ev.kind === 'gauge') {
        parts.push(`
          <span class="chain-event chain-event-gauge ${isNew}" data-chain-uid="${ev.uid}" title="${ev.flavor}">
            <span class="chain-event-mark">◆</span>
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
    parts.push(
      '<button class="chain-banner-reset" type="button" data-chain-reset title="체인 초기화">×</button>'
    )
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

    // Hand cards: clicking dispatches itemAction which the main loop turns
    // into a single-use (or arms targeting) on that slot.
    this.boardElement
      .querySelectorAll<HTMLElement>('.hand-card button[data-item-index]')
      .forEach((el) => {
        el.addEventListener('click', (e) => {
          e.stopPropagation()
          const itemIndex = parseInt(el.dataset.itemIndex || '-1', 10)
          document.dispatchEvent(
            new CustomEvent<ItemActionDetail>('itemAction', {
              detail: { itemIndex, shiftKey: (e as MouseEvent).shiftKey },
            })
          )
        })
      })

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

  private handleCardClick(el: HTMLElement, laneIndex: number, distance: number): void {
    const isAlreadySelected =
      !!this.selected &&
      this.selected.laneIndex === laneIndex &&
      this.selected.distance === distance

    if (isAlreadySelected) {
      this.dispatchAction(laneIndex, distance)
      return
    }

    this.boardElement
      .querySelectorAll('.cell.card.is-selected')
      .forEach((c) => c.classList.remove('is-selected'))
    el.classList.add('is-selected')
    this.selected = { laneIndex, distance }
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

  /** Find the rendered DOM element for a card (by id) for burst placement. */
  findCardElement(cardId: string): HTMLElement | null {
    return this.boardElement.querySelector<HTMLElement>(`.cell.card[data-card-id="${cardId}"]`)
  }

  /** Find a hand slot element by index for burst placement. */
  findHandSlotElement(slotIndex: number): HTMLElement | null {
    return this.boardElement.querySelector<HTMLElement>(
      `.hand-slot[data-slot-index="${slotIndex}"]`
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

  /** Capture the clicked shop card before the board re-renders with the newly owned relic. */
  prepareRelicArrivalFromShop(relicId: RelicId): void {
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

  
  /** Consume a free card tile and route its blast to the matching HUD target.
   *  This keeps free-card rewards aligned with existing source→destination grammar
   *  (coin→wallet, hand→hand stack, health→hp bar, gauge→candle gauge). */
  async consumeFreeCardAndRouteReward(
    kind: 'free-card' | 'free-coin-card',
    target: ResourceTrailTarget,
    amount: number,
    theme: BurstTheme = 'score'
  ): Promise<void> {
    const card = document.querySelector<HTMLElement>(`#shop-overlay .shop-free-card[data-shop-buy-kind="${kind}"]`)
    if (!card) return
    await this.playShopPurchaseImpact(card, 'score')
    await this.animateResourceTrail(card, this.findResourceTrailTarget(target), Math.max(1, amount), theme)
    // 무료 카드 소모는 선택 순간 "사라짐"이 읽히도록 약간 긴 퇴장 타이밍을 사용한다.
    card.classList.add('is-consumed')
    window.setTimeout(() => card.remove(), 420)
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
      `${def.name} — ${offer.purchased ? '구매 완료' : `점수 ${offer.price}점`}`
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
    if (effect) effect.textContent = def.effect
    const flavor = card.querySelector<HTMLElement>('.shop-relic-flavor')
    if (flavor) flavor.textContent = def.flavor
    const label = card.querySelector<HTMLElement>('.shop-price-label-text')
    if (label)
      label.textContent = offer.purchased ? '구매 완료' : `${offer.price.toLocaleString()}점`
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
