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
import {
  Card,
  CardType,
  flowerDescription,
  flowerDisplayName,
  type FlowerKind,
} from '@entities/Card'
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
import { ENEMY_DEFINITIONS, TRAP_DEFINITIONS, MIMIC_BY_SPAN } from '@systems/CardSpawner'
import { HAND_CARD_DEFINITIONS, HAND_CARD_IDS } from '@data/HandCards'
import { getRelicDef, RELIC_DEFINITIONS, type RelicId } from '@data/Relics'
import { RECIPES } from '@data/Recipes'
import { SquareBurst, type BurstTheme } from '@ui/SquareBurst'
import { GAME_BOARD_STYLES } from '@ui/styles/GameBoardStyles'
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

export interface ShopBuyDetail {
  relicId: RelicId
}

export interface ShopOfferView {
  relicId: RelicId
  /** Per-spawn score price (mid-3-digit, with small jitter "inflation"
   *  so the displayed cost reads as 872 / 1183 / 491 etc rather than
   *  round numbers). Computed once when the shop is rolled. */
  price: number
  purchased?: boolean
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

export class GameBoardRenderer {
  private boardElement: HTMLElement
  private selected: { laneIndex: number; distance: number } | null = null
  private currentGameState: GameState | null = null
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
  /** True while the shop shutter must survive full board re-renders. Purchase
   *  refreshes rebuild the rail DOM, so the shutter state lives in the renderer
   *  instead of only in the transient `.rail-shutter` element. */
  private shopShutterLocked = false
  /** Resize/scroll listener that keeps the shop shell anchored over the
   *  rail. Stored so we can remove it cleanly on shop close. */
  private shopResizeListener: (() => void) | null = null

  constructor(containerId: string = 'game-board') {
    const container = document.getElementById(containerId)
    if (!container) {
      throw new Error(`Container ${containerId} not found`)
    }
    this.boardElement = container
  }

  /** Toggle the UI overlay used while a targeted hand card is awaiting a board click. */
  setHandTargetingMode(mode: HandTargetingMode | null): void {
    this.handTargetingMode = mode
    this.clearSelection()
  }

  render(gameState: GameState, scorePanel: ScorePanelState): void {
    // Detached relic previews are body-mounted during hover; remove stale ones
    // before replacing the board DOM so old hover cards never linger onscreen.
    document.querySelectorAll('.relic-hover-preview.is-floating').forEach((el) => el.remove())
    const previousRects = this.captureCardRects()
    const previousHandRects = this.captureHandRects()
    this.currentGameState = gameState
    const character = gameState.getCharacter()
    const lanes = gameState.getLanes()
    const turn = gameState.getCurrentTurn()
    // Trigger the small turn-tick pop animation only when the displayed
    // turn actually changes — re-renders within the same turn must not
    // re-fire the shimmer.
    const turnChanged = turn !== this.previousTurn && this.hasRendered
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
      ${this.renderVignette(scorePanel)}
    `

    this.injectStyles()
    this.attachListeners()
    this.animateRenderedResourceCounters()
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
    const scoreIncreasing = scoreChanged && scorePanel.score > this.displayedScoreValue
    const coinIncreasing = coinChanged && scorePanel.coins > this.displayedCoinValue
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
    const renderedScore = scoreIncreasing ? this.displayedScoreValue : scorePanel.score
    const renderedCoins = coinIncreasing ? this.displayedCoinValue : scorePanel.coins
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
          <div class="score-number ${scorePulseClass}" data-score-pulse="${scorePanel.scorePulseKey}" data-count-start="${renderedScore}" data-count-end="${scorePanel.score}">
            ${renderedScore.toLocaleString()}
          </div>
        </section>
        <section class="coin-panel-total" aria-label="Shop currency">
          <div class="score-kicker">
            <span class="score-kicker-icon">${coinIcon()}</span>
            화폐
          </div>
          <div class="coin-number ${coinPulseClass}" data-coin-pulse="${scorePanel.coinPulseKey}" data-count-start="${renderedCoins}" data-count-end="${scorePanel.coins}">
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

      // Detect span across consecutive same Card instances.
      // Only apply grouping to active row (distance 0); preview rows always render individually.
      let span = 1
      if (isActive) {
        while (i + span < lanes.length && lanes[i + span].getCardAtDistance(distance) === card) {
          span++
        }
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
    if (rule.filter === 'enemy') return card.type === CardType.ENEMY
    if (rule.filter === 'trap') return card.type === CardType.TRAP
    if (rule.filter === 'spore') {
      // Mirrors HandSystem's 성수-only 포자 targeting rule for hover hints.
      return card.type === CardType.TRAP && card.trapKind === 'spore'
    }
    if (rule.filter === 'treasure') return card.type === CardType.TREASURE
    if (rule.filter === 'enemy-or-treasure') {
      return card.type === CardType.ENEMY || card.type === CardType.TREASURE
    }
    if (rule.filter === 'hazard') return card.type === CardType.TRAP || card.isFrozen()
    if (rule.filter === 'any') return true
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
      const label = card.flowerKind === 'seed' ? '대기' : `+${card.flowerValue}`
      stats = `<div class="card-stats group-note flower-note">${sparkleIcon()}<span>${label}</span></div>`
    } else if (card.type === CardType.TREASURE && card.groupCount > 1) {
      // Treasure groups describe their extra pickup as text-only metadata under
      // the name, matching the flat no-plate language requested for web labels.
      stats = `<div class="card-stats group-note treasure-group-note">${sparkleIcon()}<span>카드 ${card.groupCount}장</span></div>`
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

    const groupName = span > 1 && !card.isSpecialEnemy ? this.groupName(card.type, span) : card.name

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

  private groupName(type: CardType, span: number): string {
    if (span <= 1) return ''
    if (type === CardType.ENEMY) return span === 2 ? '적 무리' : '거대 적 무리'
    if (type === CardType.TRAP) return span === 2 ? '함정 무리' : '거대 함정'
    if (type === CardType.TREASURE) return span === 2 ? '적당한 상자' : '큰 상자'
    if (type === CardType.FLOWER) return '꽃밭'
    return ''
  }

  private renderPlayerZone(character: Character): string {
    return `
      <div class="player-zone" aria-label="Player controls and relic plan">
        <div class="utility-layer utility-layer-left" aria-label="Utility buttons">
          <button class="compendium-btn compendium-btn-floating" type="button" data-open-compendium aria-label="도감 열기">
            <span class="compendium-btn-icon" aria-hidden="true">${bookIcon()}</span>
            <span class="compendium-btn-label">도감</span>
          </button>
        </div>
        ${this.renderPlayer(character)}
        <div class="utility-layer relic-layer" aria-label="Owned relics">
          ${this.renderRelicLayer(character)}
        </div>
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
    const candlePct = Math.max(0, Math.min(100, (candle / candleMax) * 100))
    const currentMode = character.candleMode ?? 'max-health'
    const mode = this.candleModeMeta(currentMode)
    const ticks = Array.from({ length: candleMax }, (_, idx) => {
      const filled = idx < candle ? 'is-filled' : ''
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
          <div class="candle-gauge-label">${candle}/${candleMax} · ${mode.effect}</div>
        </div>
      </div>
    `
  }

  /** Render owned relics as compact card previews beside the player. */
  private renderRelicLayer(character: Character): string {
    if (character.relics.length === 0) {
      return `<span class="relic-plan-label">유물 없음<br>상점 대기</span>`
    }
    const relics = character.relics.map((id) => this.renderRelicMiniCard(id)).join('')
    return `<div class="relic-stack" aria-label="보유 유물">${relics}</div>`
  }

  /** Small owned-relic chip: the rail shows only the illustration while the
   *  hidden hover card carries all readable relic details. */
  private renderRelicMiniCard(id: RelicId): string {
    const def = getRelicDef(id)
    return `
      <article class="relic-mini-card" aria-label="${def.name}: ${def.effect}">
        <div class="relic-mini-art" style="background-image: url('${spriteForRelic(id)}')" aria-hidden="true"></div>
        <div class="relic-hover-preview" style="--hand-card-back: url('${SpriteUrls.cardBack}');" aria-hidden="true">
          ${this.relicPreviewFace(def.id)}
        </div>
      </article>
    `
  }

  /** Full relic hover face, intentionally separate from hand cards so the
   *  preview reads as a wax-sealed artifact card rather than a playable card. */
  private relicPreviewFace(id: RelicId): string {
    const def = getRelicDef(id)
    return this.commonCardFace({
      artUrl: spriteForRelic(id),
      name: def.name,
      description: `${def.effect}<br><span class="common-card-subdesc">${def.flavor}</span>`,
      extraClass: 'relic-preview-card',
      badge: '유물',
    })
  }

  private renderPlayer(character: Character): string {
    const hpPct = Math.max(0, Math.min(100, (character.health / character.maxHealth) * 100))
    // Keep the exact shield amount in aria-label while capping the tiny in-icon
    // text at 99+ so large shield stacks do not spill outside the silhouette.
    const shieldDisplay = character.shield > 99 ? '99+' : String(character.shield)
    const shieldChip =
      character.shield > 0
        ? `<span class="player-shield-chip" aria-label="방패 ${character.shield}">
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
                    ${character.health}/${character.maxHealth}
                  </span>
                </div>
              </div>
              <div class="atk-stat">
                <span class="atk-stat-icon">${swordIcon()}</span>
                ${character.damage}
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

  /** Field-card compendium wrapper converts stat rows into compact effect text
   *  so enemies, traps, and treasures use the same large-name card template as
   *  playable hand cards. */
  private fieldCardFace(opts: {
    artUrl: string
    name: string
    badge: string
    stats: [string, string][]
    description: string
  }): string {
    const statText = opts.stats
      .map(([label, value]) => `<span class="common-card-subdesc">${label}</span> ${value}`)
      .join('<br>')
    return this.commonCardFace({
      artUrl: opts.artUrl,
      name: opts.name,
      badge: opts.badge,
      description: `${statText}<br>${opts.description}`,
      extraClass: 'compendium-field-card',
    })
  }

  /** Read hand-effect reach from the shared gameplay table for codex rows. */
  private handEffectScope(defId: HandCardId, merged = false): HandEffectTargeting {
    const def = getHandCardDef(defId)
    return merged ? def.targeting.triple : def.targeting.base
  }

  /** Korean labels for the shared hand-effect scope table shown in the compendium. */
  private handScopeLabel(defId: HandCardId, merged = false): string {
    const scope = this.handEffectScope(defId, merged)
    const selectionLabel =
      scope.selection === 'target'
        ? '대상'
        : scope.selection === 'random'
          ? '랜덤'
          : scope.selection === 'all'
            ? '전체'
            : '없음'
    const zoneLabel =
      scope.zone === 'front'
        ? '전방'
        : scope.zone === 'waiting'
          ? '대기'
          : scope.zone === 'field'
            ? '필드'
            : scope.zone === 'self'
              ? '자신'
              : scope.zone === 'hand'
                ? '손패'
                : '없음'
    const countLabel = scope.countLimit === null ? '제한 없음' : `${scope.countLimit}개`
    return `선택 ${selectionLabel} · 범위 ${zoneLabel} · 개수 ${countLabel}`
  }

  /** Compact two-line scope summary so balance changes remain visible in the codex. */
  private handScopeDescription(defId: HandCardId): string {
    return `<span class="common-card-subdesc">기본: ${this.handScopeLabel(defId)}</span><br><span class="common-card-subdesc">★: ${this.handScopeLabel(defId, true)}</span>`
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
      const description = card.merged ? def.tripleDescription : def.description
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

  /** Refresh an already-open shop in place. We only change classes, labels,
   *  and ARIA text so card art does not blink as if the shop reloaded. */
  private refreshOpenShopCards(offers: ShopOfferView[], score: number): boolean {
    const shell = this.shopOverlayElement?.querySelector<HTMLElement>('.shop-shell')
    const grid = shell?.querySelector<HTMLElement>('.shop-grid')
    if (!shell || !grid || !this.shopOverlayElement?.classList.contains('is-open')) return false
    const cards = Array.from(grid.querySelectorAll<HTMLElement>('.shop-relic-card'))
    if (cards.length !== offers.length) return false

    for (const offer of offers) {
      const def = RELIC_DEFINITIONS[offer.relicId]
      const card = grid.querySelector<HTMLElement>(`.shop-relic-card[data-shop-buy="${def.id}"]`)
      if (!card) return false
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
    shell.classList.add('has-entered')
    return true
  }

  /** Shop relic card. Click on the card itself buys the relic (the
   *  separate price button is gone). Price uses the flat tag icon from
   *  the shared SVG icon family instead of the old taped label.
   *
   *  The hover-grown card is the click target so the player naturally
   *  taps "the bigger card" instead of hunting for a small button. */
  private renderShopRelicCard(offer: ShopOfferView, score: number, _character: Character): string {
    const def = RELIC_DEFINITIONS[offer.relicId]
    const affordabilityClass = this.shopRelicAffordabilityClass(offer, score)
    const cardLeaveDelay = Math.floor(Math.random() * 240)
    return `
      <article class="shop-relic-card ${affordabilityClass}"
               data-shop-buy="${def.id}"
               style="--card-leave-delay:${cardLeaveDelay}ms;"
               tabindex="0"
               aria-label="${def.name} — ${offer.purchased ? '구매 완료' : `점수 ${offer.price}점`}">
        <div class="shop-relic-art" style="background-image: url('${spriteForRelic(def.id)}')" aria-hidden="true"></div>
        <div class="shop-relic-body">
          <h3 class="shop-relic-title">${def.name}</h3>
          <p class="shop-relic-effect">${def.effect}</p>
          <p class="shop-relic-flavor">${def.flavor}</p>
        </div>
        <span class="shop-price-label" aria-hidden="true">
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
  openShop(offers: ShopOfferView[], score: number, character: Character): void {
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
        const buyTarget = t.closest<HTMLElement>('[data-shop-buy]')
        if (!buyTarget || buyTarget.classList.contains('is-purchased')) return
        const relicId = buyTarget.dataset.shopBuy as RelicId | undefined
        if (!relicId) return
        document.dispatchEvent(new CustomEvent<ShopBuyDetail>('shopBuy', { detail: { relicId } }))
      })
      document.body.appendChild(this.shopOverlayElement)
    }

    if (this.refreshOpenShopCards(offers, score)) {
      this.positionShopShellOverRail()
      return
    }

    const cards =
      offers.length > 0
        ? offers.map((offer) => this.renderShopRelicCard(offer, score, character)).join('')
        : '<div class="shop-empty">오늘의 잡화는 모두 팔렸어.</div>'
    // A purchase refresh rebuilds the cards while the overlay is already
    // visible. Mark that shell so the entrance drop animation does not replay
    // after a click; only the first shop open should drop cards from above.
    const suppressEnterAnimation = this.shopOverlayElement.classList.contains('is-open')
      ? 'has-entered'
      : ''
    // Plain shell — no SHOP label, no separate header. Each card is its
    // own clickable buy target with a flat price tag at the bottom; the
    // EXIT button hangs off the bottom-right.
    this.shopOverlayElement.innerHTML = `
      <div class="shop-shell ${suppressEnterAnimation}" role="dialog" aria-label="상점">
        <section class="shop-grid" aria-label="상점 유물 목록">${cards}</section>
        <button class="shop-close-btn" type="button" data-shop-close aria-label="상점 나가기">EXIT</button>
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

  /** Re-anchor the shop shell so it always sits exactly over the rail. */
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
    const cards = Array.from(shell.querySelectorAll<HTMLElement>('.shop-relic-card'))
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
    return `<div class="${classes}" aria-hidden="true">${this.shopShutterPanelsFromLanes(lanes)}</div>`
  }

  /** Create the wax shutter grid used by shop stop/resume transitions. */
  private createShopShutter(rail?: HTMLElement): HTMLElement {
    const host = document.createElement('template')
    const panels = rail ? this.shopShutterPanelsFromRail(rail) : this.shopShutterPanelsFromLanes()
    host.innerHTML = `<div class="rail-shutter" aria-hidden="true">${panels}</div>`
    return host.content.firstElementChild as HTMLElement
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
      shutter.classList.add('is-closed')
      rail.appendChild(shutter)
    }

    // Resume mirrors the entry beat: first the rail clatters, then the closed
    // shutter reverses upward. This keeps the shutter from looking like it
    // escaped by itself while shop cards are still leaving.
    return new Promise((resolve) => {
      rail.classList.add('is-shop-quaking')
      window.setTimeout(() => rail.classList.remove('is-shop-quaking'), 520)
      window.setTimeout(() => shutter.classList.add('is-opening'), 560)
      window.setTimeout(() => {
        this.shopShutterLocked = false
        shutter.remove()
        rail.classList.remove('is-shop-shuttered')
        resolve()
      }, 560 + 760)
    })
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
      { id: 'hand', label: '손패' },
      { id: 'combo', label: '조합' },
      { id: 'relics', label: '유물' },
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
    const stackStats = (hp: number, atk: number, span: number): [string, string][] => {
      // Compendium rows show a same-enemy example of the real field rule:
      // sum each member, then add +2/+2 for 2칸 or +3/+3 for 3칸.
      const widthBonus = span === 2 ? 2 : span >= 3 ? 3 : 0
      return [
        [`${span}칸 HP`, String(hp * span + widthBonus)],
        [`${span}칸 ATK`, String(atk * span + widthBonus)],
      ]
    }
    const normal = ENEMY_DEFINITIONS.map((def) => {
      const baseHp = def.healthOrDamage ?? 1
      const baseAtk = def.attack ?? 1
      const spriteUrl = def.enemySpriteId ? SpriteUrls[def.enemySpriteId] : SpriteUrls.enemyMouse
      return this.fieldCardFace({
        artUrl: spriteUrl,
        name: def.name,
        badge: '기본 적',
        stats: [
          ['HP', String(baseHp)],
          ['ATK', String(baseAtk)],
        ],
        description: def.description,
      })
    }).join('')
    const groupRows: [string, string][] = ENEMY_DEFINITIONS.flatMap((def) => {
      const baseHp = def.healthOrDamage ?? 1
      const baseAtk = def.attack ?? 1
      const spanTwo = stackStats(baseHp, baseAtk, 2)
      const spanThree = stackStats(baseHp, baseAtk, 3)
      // Each enemy keeps one readable line for 2칸/3칸 group effects instead
      // of spawning six separate variant cards in the tab.
      return [
        [`${def.name} 2칸`, `HP ${spanTwo[0][1]} / ATK ${spanTwo[1][1]}`],
        [`${def.name} 3칸`, `HP ${spanThree[0][1]} / ATK ${spanThree[1][1]}`],
      ]
    })
    const groupCard = this.fieldCardFace({
      artUrl: SpriteUrls.enemyMole,
      name: '적 무리',
      badge: '추가 개체',
      stats: groupRows,
      description:
        '같은 전방 라인에서 합쳐진 적 무리는 실제 구성원의 HP/ATK를 합산한 뒤 2칸은 HP/ATK +2, 3칸은 +3을 더한다. 일러스트는 가장 강한 구성원을 따라간다.',
    })
    const mimicRows: [string, string][] = [1, 2, 3].flatMap((span) => {
      const stats = MIMIC_BY_SPAN[span]
      // Mimic span variants are summarized in one Mimic entry so changing
      // lane width reads as the same creature gaining stronger effects.
      return [
        [`${span}칸 HP/ATK`, `${stats.health} / ${stats.attack}`],
        [`${span}칸 드롭`, `${stats.drops}장`],
      ]
    })
    const mimicCard = this.fieldCardFace({
      artUrl: SpriteUrls.mimic,
      name: '미믹',
      badge: '특수',
      stats: mimicRows,
      description:
        '보물 카드가 변이된 특수 적. 한 도감 칸 안에서 1/2/3칸별 능력치와 드롭량을 한 번에 비교한다.',
    })
    return `
      <h3 class="compendium-section">일반 적</h3>
      <div class="compendium-grid">${normal}${groupCard}</div>
      <h3 class="compendium-section">특수 적</h3>
      <div class="compendium-grid">${mimicCard}</div>
    `
  }

  private renderCompendiumTraps(): string {
    const baseDamage = TRAP_DEFINITIONS[0].healthOrDamage ?? 2
    const spanRows: [string, string][] = [1, 2, 3].map((span) => {
      // Trap rows intentionally mirror enemy stat rows: the name/width is on
      // the left and only sword damage is shown on the right for quick reading.
      const damage = span >= 3 ? 999 : span === 2 ? 5 : baseDamage
      return [`${span}칸`, `${swordIcon()} ${damage}`]
    })
    const card = this.fieldCardFace({
      artUrl: SpriteUrls.traps.web,
      name: TRAP_DEFINITIONS[0].name,
      badge: '함정',
      stats: spanRows,
      description: '같은 함정 한 칸 안에서 1/2/3칸 폭에 따른 충돌 피해만 표시한다.',
    })
    return `<div class="compendium-grid">${card}</div>`
  }

  private renderCompendiumTreasures(): string {
    const spanRows: [string, string][] = [1, 2, 3].flatMap((span) => {
      // Treasure rows keep the shared vanish/mimic chances visible while only
      // the drop amount changes per width.
      return [
        [`${span}칸 드롭`, `손패 ${span}장`],
        [`${span}칸 변화`, '사라짐 50%/턴 · 미믹화 10%/턴'],
      ]
    })
    const card = this.fieldCardFace({
      artUrl: SpriteUrls.chestLarge,
      name: '보물상자',
      badge: '보물',
      stats: spanRows,
      description:
        '작은/큰/거대한 상자를 별도 카드로 나누지 않고, 보물상자 한 항목에서 칸 수별 보상과 변이 확률을 비교한다.',
    })
    return `<div class="compendium-grid">${card}</div>`
  }

  private renderCompendiumFlowers(): string {
    const flowerKinds: FlowerKind[] = [
      'seed',
      'chamomile',
      'redRose',
      'marigold',
      'oleander',
      'lavender',
    ]
    const rewardRows: Record<FlowerKind, [string, string][]> = {
      seed: [
        ['등장', '대기 라인에서 씨앗으로 등장'],
        ['전방 도착', '꽃 001~005 중 무작위 발화'],
      ],
      chamomile: [
        ['수확', '점수 획득'],
        ['성장', '턴마다 보상 증가'],
      ],
      redRose: [
        ['수확', '체력 회복'],
        ['성장', '1부터 턴마다 +1'],
      ],
      marigold: [
        ['수확', '화폐 획득'],
        ['성장', '1부터 2턴마다 +1'],
      ],
      oleander: [
        ['수확', '방패 획득'],
        ['성장', '1부터 턴마다 +1'],
      ],
      lavender: [
        ['수확', '손패 콤보 게이지 획득'],
        ['성장', '1부터 턴마다 +1'],
      ],
    }
    const cards = flowerKinds
      .map((kind) =>
        this.fieldCardFace({
          artUrl: SpriteUrls.flowers[kind],
          name: flowerDisplayName(kind),
          badge: kind === 'seed' ? '씨앗' : '버프칸',
          stats: rewardRows[kind],
          description:
            kind === 'seed'
              ? '시작 3×3에는 등장하지 않으며, 전방칸에 도착하면 색상 사각형 블라스트와 함께 무작위 꽃으로 발화한다.'
              : `${flowerDescription(kind)}. 성장할수록 수확량은 커지지만 매 턴 시들 확률도 10%부터 급격히 오른다.`,
        })
      )
      .join('')
    const monster = this.fieldCardFace({
      artUrl: SpriteUrls.monsterFlower,
      name: '괴물꽃',
      badge: '특수 적',
      stats: [
        ['기본', 'HP/ATK 1/1'],
        ['성장 꽃', '꽃 수확값만큼 HP/ATK'],
        ['병합', '괴물꽃끼리만 합체'],
      ],
      description: '꽃이 시들면 같은 칸에 등장하는 특수 적. 다른 적과는 합쳐지지 않는다.',
    })
    return `<div class="compendium-grid">${cards}${monster}</div>`
  }

  private renderCompendiumHand(): string {
    const groups: Record<string, string[]> = {
      recovery: [],
      tool: [],
      control: [],
      attack: [],
    }
    const groupLabels: Record<string, string> = {
      recovery: '회복',
      tool: '도구',
      control: '컨트롤',
      attack: '공격',
    }
    for (const id of HAND_CARD_IDS) {
      const def = HAND_CARD_DEFINITIONS[id]
      groups[def.category].push(
        this.handCardFace(
          def.id,
          `${def.description}<br>${this.handScopeDescription(def.id)}<br><span class="common-card-subdesc">★ 효과: ${def.tripleDescription}</span>`,
          false,
          `compendium-hand-card ${this.categoryClass(def.category)}`,
          groupLabels[def.category]
        )
      )
    }
    return Object.entries(groups)
      .map(
        ([cat, cards]) => `
          <h3 class="compendium-section">${groupLabels[cat]}</h3>
          <div class="compendium-grid">${cards.join('')}</div>
        `
      )
      .join('')
  }

  /** Relic tab documents shop relics and which ones the current run owns. */
  private renderCompendiumRelics(): string {
    const owned = new Set(this.currentGameState?.getCharacter().relics ?? [])
    const cards = Object.values(RELIC_DEFINITIONS)
      .map((def) =>
        this.compendiumCard({
          art: { kind: 'sprite', url: spriteForRelic(def.id) },
          name: def.name,
          badge: owned.has(def.id) ? '보유 중' : '상점 유물',
          categoryClass: owned.has(def.id) ? 'compendium-relic-owned' : 'compendium-relic-card',
          stats: [
            ['효과', def.effect],
            ['비용', '점수 (상점에서 매번 가격 변동)'],
          ],
          description: def.flavor,
        })
      )
      .join('')
    return `
      <h3 class="compendium-section">유물 (Relics)</h3>
      <p class="compendium-section-blurb">10턴마다 열리는 생쥐 상점에서 구매하는 지속 효과야. 발동한 유물은 활동 로그와 체인 배너 아래의 작은 토스트로 함께 표시된다.</p>
      <div class="compendium-grid compendium-relic-grid">${cards}</div>
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
        this.compendiumCard({
          art: { kind: 'icon', svg: bookIcon() },
          name,
          badge: '용어',
          stats: [['정의', description]],
        })
      )
      .join('')
    return `<div class="compendium-grid">${cards}</div>`
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
      const ingredientCards = Object.entries(r.ingredients).flatMap(([id, n]) => {
        const def = HAND_CARD_DEFINITIONS[id as HandCardId]
        if (!def) return []
        // Repeated ingredients are represented as overlapping mini hand cards
        // so combo recipes use the same visual language as the hand tab.
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
        name: r.name,
        badge: `${r.totalCount}장`,
        // Recipe cards use a denser codex variant because their visual payload
        // is already communicated by the stacked ingredient cards.
        categoryClass: 'compendium-recipe-card',
        stats: [['효과', r.flavor]],
      })
    }).join('')
    return `
      <h3 class="compendium-section">합성 (Synthesis)</h3>
      <div class="compendium-grid">${synthesisIntro}</div>
      <h3 class="compendium-section">조합 레시피 (Recipes)</h3>
      <p class="compendium-section-blurb">손패를 사용할 때마다 해당 카드가 활성 체인에 추가된다. 체인의 multiset이 아래 재료를 모두 포함하면 그 레시피가 보너스로 발동한다.</p>
      <div class="compendium-grid">${recipeCards}</div>
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
    const pct = Math.max(0, Math.min(100, (ember / emberMax) * 100))
    const countdown = scorePanel.emberDecayCountdown ?? 10
    const weights = scorePanel.spawnWeights
    const weightsText = weights
      ? `적 ${weights.enemy}% · 함정 ${weights.trap}% · 보물 ${weights.treasure}% · 꽃 ${weights.flower}%`
      : ''
    return `
      <div class="ember-hud" aria-label="Ember status">
        <div class="ember-hud-inner">
          <div class="ember-line">
            <span class="ember-icon">${flameIcon()}</span>
            <div class="ember-bar">
              <div class="ember-bar-fill ember-tier-${tier}" style="width: ${pct}%"></div>
              <span class="ember-bar-label">불씨 ${ember}/${emberMax} · ${EmberSystem.tierLabel(tier)}</span>
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
  private renderVignette(scorePanel: ScorePanelState): string {
    const intensity = Math.max(0, Math.min(1, scorePanel.vignetteIntensity ?? 0))
    if (intensity <= 0) return ''
    const opacity = intensity.toFixed(2)
    return `<div class="ember-vignette" style="--vignette-opacity: ${opacity};" aria-hidden="true"></div>`
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

    // Relic chips live inside a scroll well, so their fixed hover cards receive
    // viewport coordinates at hover-time to avoid clipping against that well.
    this.boardElement.querySelectorAll<HTMLElement>('.relic-mini-card').forEach((chip) => {
      const preview = chip.querySelector<HTMLElement>('.relic-hover-preview')
      if (!preview) return
      chip.addEventListener('mouseenter', () => this.showRelicPreview(chip, preview))
      chip.addEventListener('mouseleave', () => this.hideRelicPreview(chip, preview))
      chip.addEventListener('focusin', () => this.showRelicPreview(chip, preview))
      chip.addEventListener('focusout', () => this.hideRelicPreview(chip, preview))
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

  /** Move relic previews to <body> while visible so scroll wells cannot clip them. */
  private showRelicPreview(chip: HTMLElement, preview: HTMLElement): void {
    this.positionRelicPreview(chip, preview)
    preview.classList.add('is-floating')
    document.body.appendChild(preview)
  }

  /** Return a hidden relic preview to its chip after hover/focus ends. */
  private hideRelicPreview(chip: HTMLElement, preview: HTMLElement): void {
    preview.classList.remove('is-floating')
    chip.appendChild(preview)
  }

  /** Position the relic hover preview as a fixed card near its chip so the
   *  relic stack can keep its compact scroll layout without clipping previews. */
  private positionRelicPreview(chip: HTMLElement, preview: HTMLElement): void {
    const rect = chip.getBoundingClientRect()
    const previewWidth = 190
    const gap = 16
    const rightSideLeft = rect.right + gap
    const hasRightRoom = rightSideLeft + previewWidth < window.innerWidth - 12
    preview.style.left = `${hasRightRoom ? rightSideLeft : rect.left - previewWidth - gap}px`
    preview.style.top = `${rect.top + rect.height / 2}px`
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
      const selector = `.cell.card.is-active[data-lane="${hit.laneIndex}"]`
      const element = this.boardElement.querySelector<HTMLElement>(selector)
      if (element) elements.add(element)
    }
    return this.animateElements([...elements], 'is-enemy-slamming', 420)
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
        if (target && amount > 0)
          SquareBurst.playOn(target, 'damage', { count: 14, spread: 110, duration: 620 })
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
    return (
      this.boardElement.querySelector<HTMLElement>('.hand-stack') ??
      this.boardElement.querySelector<HTMLElement>('.hand-panel')
    )
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
              { size: 17, lag: 42, alpha: 0.52 },
              { size: 11, lag: 82, alpha: 0.36 },
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
            }, 330)
            Promise.all(finished).then(() => resolve())
          }, i * 135)
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
          { duration: 390, easing: 'cubic-bezier(0.18, 0.88, 0.22, 1)', fill: 'forwards' }
        )
        anim.onfinish = () => {
          piece.remove()
          resolve()
        }
        window.setTimeout(() => {
          piece.remove()
          resolve()
        }, 560)
      }, spec.lag)
    })
  }

  /** Start count-up animations that were requested by renderScorePanel().
   *  This covers resource changes that happen immediately before a render,
   *  while playScoreGainFeedback/playCoinGainFeedback covers changes that can
   *  safely animate on the already-mounted DOM. */
  private animateRenderedResourceCounters(): void {
    const scoreEl = this.boardElement.querySelector<HTMLElement>('.score-number[data-count-start]')
    const coinEl = this.boardElement.querySelector<HTMLElement>('.coin-number[data-count-start]')
    const run = (el: HTMLElement | null, suffix: string) => {
      if (!el) return
      const start = Number.parseInt(el.dataset.countStart ?? '', 10)
      const end = Number.parseInt(el.dataset.countEnd ?? '', 10)
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return
      this.animateResourceCounterElement(el, start, end, suffix)
    }
    run(scoreEl, '')
    run(coinEl, ' $')
  }

  /** Animate a resource number on the current DOM, then remember that the
   *  matching pulse key has already been handled so a later full render does
   *  not replay the same sparkle. The visible text changes in integer ticks,
   *  giving score and wallet gains a small "띠리리릭" counter feel. */
  private animateResourceCounter(
    selector: '.score-number' | '.coin-number',
    targetValue: number,
    suffix: string,
    duration = 640
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
    duration = 640
  ): void {
    const delta = targetValue - startValue
    const startedAt = performance.now()
    el.classList.remove('is-score-popping')
    void el.offsetWidth
    if (delta > 0) el.classList.add('is-score-popping')

    const tick = (now: number) => {
      const t = Math.min(1, (now - startedAt) / duration)
      // Ease out quickly at the end so the last few +1 ticks remain readable.
      const eased = 1 - Math.pow(1 - t, 3)
      const value = Math.round(startValue + delta * eased)
      el.textContent = `${value.toLocaleString()}${suffix}`
      if (t < 1) {
        requestAnimationFrame(tick)
      } else {
        el.textContent = `${targetValue.toLocaleString()}${suffix}`
        window.setTimeout(() => el.classList.remove('is-score-popping'), 120)
      }
    }
    requestAnimationFrame(tick)
  }

  /** Play score gain feedback immediately on the existing panel so the number
   *  rises during the same beat as the square burst and ✦ sparkle. */
  playScoreGainFeedback(targetScore: number, pulseKey: number): void {
    this.rememberImmediateResourcePulse('score', targetScore, pulseKey)
    this.animateResourceCounter('.score-number', targetScore, '')
    const anchor = this.findScorePulseAnchor()
    if (anchor) this.burstAtElement(anchor, 'score', { count: 22, spread: 170, duration: 640 })
  }

  /** Play shop-currency gain feedback with the exact same sparkle language as
   *  score, but keep the wallet's trailing dollar marker. */
  playCoinGainFeedback(targetCoins: number, pulseKey: number): void {
    this.rememberImmediateResourcePulse('coin', targetCoins, pulseKey)
    this.animateResourceCounter('.coin-number', targetCoins, ' $')
    const anchor = this.findCoinPulseAnchor()
    if (anchor) this.burstAtElement(anchor, 'score', { count: 22, spread: 170, duration: 640 })
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
    return this.animateElements(elements, 'is-consuming', 480, { persist: true })
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
      animations.push(this.animateElements(elements, 'is-consuming', 480, { persist: true }))
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
    const elements: HTMLElement[] = []
    for (const growth of growths) {
      const element = this.findCardElement(growth.cardId)
      if (!element) continue
      element.style.setProperty(
        '--flower-growth-scale',
        String(Math.min(1.8, 1 + growth.value * 0.08))
      )
      elements.push(element)
      SquareBurst.playOn(element, this.flowerBurstTheme(growth.flowerKind), {
        count: Math.min(30, 10 + growth.value * 3),
        spread: Math.min(170, 78 + growth.value * 12),
      })
    }
    return this.animateElements(elements, 'is-flower-growing', 520)
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
