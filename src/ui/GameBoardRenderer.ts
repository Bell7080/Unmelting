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
import { Card, CardType } from '@entities/Card'
import { Lane, LANE_DISTANCE_COUNT } from '@entities/Lane'
import type { EnemyHit, TreasureChange } from '@core/TurnManager'
import { spriteForCard, SpriteUrls } from '@ui/Sprites'
import { Character } from '@entities/Character'
import { HandCardId, HandCategory } from '@entities/HandCard'
import { getHandCardDef } from '@data/HandCards'
import type { EmberTier, SpawnWeights } from '@systems/EmberSystem'
import { EmberSystem } from '@systems/EmberSystem'
import { SquareBurst, type BurstTheme } from '@ui/SquareBurst'
import {
  bigCandleIcon,
  candleIcon,
  coinIcon,
  flameIcon,
  heartIcon,
  pouchIcon,
  shieldIcon,
  smallCandleIcon,
  swordIcon,
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
}

export interface HandTargetingMode {
  slotIndex: number
  defId: HandCardId
}

export interface ChainHints {
  sequence: string[]
  firedRecipeIds: string[]
}

export interface ScorePanelState {
  score: number
  logs: ActivityLogEntry[]
  canSpend: boolean
  spendCost: number
  scorePulseKey: number
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
  private previousGroupSpans = new Map<string, number>()
  /** Hand-card UIDs from the previous render — used to mark only NEW cards
   *  with `is-entering` so the drop animation does not re-fire on every full
   *  re-render of the hand panel. */
  private previousHandUids = new Set<string>()
  private handTargetingMode: HandTargetingMode | null = null

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
    const previousRects = this.captureCardRects()
    this.currentGameState = gameState
    const character = gameState.getCharacter()
    const lanes = gameState.getLanes()
    const turn = gameState.getCurrentTurn()

    if (this.selected) {
      const lane = lanes[this.selected.laneIndex]
      if (!lane || !lane.getCardAtDistance(this.selected.distance)) {
        this.selected = null
      }
    }

    this.boardElement.innerHTML = `
      <div class="turn-overlay" aria-hidden="true">
        <div class="turn-overlay-inner">
          <span class="turn-overlay-kicker">Turn</span>
          <span class="turn-overlay-number">${turn}</span>
        </div>
      </div>
      ${this.renderEmberHud(scorePanel)}
      <div class="game-shell">
        <aside class="left-panel" aria-label="Brand and score">
          <header class="brand">
            <span class="brand-icon">${candleIcon()}</span>
            <span class="brand-text">Unmelting</span>
          </header>
          ${this.renderScorePanel(scorePanel)}
        </aside>
        <main class="stage">
          <section class="rail" aria-label="Card rail">
            ${this.renderRail(lanes)}
          </section>

          ${this.renderPlayer(character)}
          ${this.renderChainStrip(scorePanel)}
        </main>

        ${this.renderHand(character, scorePanel)}
      </div>
      ${this.renderVignette(scorePanel)}
    `

    this.injectStyles()
    this.attachListeners()
    this.animateMovedCards(previousRects)
    this.rememberRenderedCards()
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
    const spendDisabled = scorePanel.canSpend ? '' : 'disabled'
    const scorePulseClass =
      scorePanel.scorePulseKey > 0 ? 'is-score-popping' : ''

    return `
      <aside class="score-panel" aria-label="Action score panel">
        <section class="score-panel-total">
          <div class="score-kicker">
            <span class="score-kicker-icon">${coinIcon()}</span>
            종합 점수
          </div>
          <div class="score-number ${scorePulseClass}" data-score-pulse="${scorePanel.scorePulseKey}">
            ${scorePanel.score.toLocaleString()}
          </div>
        </section>
        <section class="score-log-list" aria-label="Action history">
          ${logs}
        </section>
        <button class="score-spend-btn" type="button" ${spendDisabled}>
          점수 ${scorePanel.spendCost}로 아이템 변환
        </button>
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
        cells.push(`<div class="cell empty" aria-hidden="true"></div>`)
        i++
        continue
      }

      // Detect span across consecutive same Card instances.
      // Only apply grouping to active row (distance 0); preview rows always render individually.
      let span = 1
      if (isActive) {
        while (
          i + span < lanes.length &&
          lanes[i + span].getCardAtDistance(distance) === card
        ) {
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
    isActive: boolean,
  ): string {
    const isSelected =
      !!this.selected &&
      this.selected.distance === distance &&
      this.selected.laneIndex >= laneIndex &&
      this.selected.laneIndex < laneIndex + span

    // When a targeted hand card is armed every active-row card is a viable
    // target, but only certain card types make sense for some hand cards. For
    // MVP every active-row card is highlighted as targetable.
    const isTargetingActive = isActive && this.handTargetingMode !== null

    const classes = [
      'cell',
      'card',
      `type-${card.type}`,
      isActive ? 'is-active' : 'is-preview',
      isSelected ? 'is-selected' : '',
      isTargetingActive ? 'is-hand-target' : '',
      span > 1 ? 'is-grouped' : '',
      this.hasRendered && !this.previousCardIds.has(card.id)
        ? 'is-entering'
        : '',
      this.shouldAnimateGroup(card.id, span) ? 'is-newly-grouped' : '',
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
    } else if (card.type === CardType.TRAP && card.groupCount >= 3) {
      stats = `<div class="card-stats danger">즉사</div>`
    } else if (card.type === CardType.TREASURE && card.groupCount > 1) {
      const mult = card.groupCount === 2 ? 'x2' : 'x3'
      stats = `<div class="card-stats good">보상 ${mult}</div>`
    }

    const groupBadge = span > 1 ? `<div class="group-badge">×${span}</div>` : ''

    const groupName =
      span > 1 && !card.isSpecialEnemy
        ? this.groupName(card.type, span)
        : card.name

    const sprite = spriteForCard(card)
    const artStyle = sprite ? `style="background-image: url('${sprite}')"` : ''

    return `
      ${groupBadge}
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
    if (type === CardType.ENEMY) return span === 2 ? '성냥 무리' : '밀랍 군단'
    if (type === CardType.TRAP)
      return span === 2 ? '촛농 거미집' : '밀랍 거미굴'
    if (type === CardType.TREASURE)
      return span === 2 ? '적당한 상자' : '큰 상자'
    return ''
  }

  private renderPlayer(character: any): string {
    const hpPct = Math.max(
      0,
      Math.min(100, (character.health / character.maxHealth) * 100),
    )
    return `
      <div class="player-row">
        <div class="player-card">
          <div class="player-art" style="background-image: url('${SpriteUrls.player}')" aria-hidden="true"></div>
          <div class="player-overlay" aria-hidden="true"></div>
          <div class="player-content">
            <div class="player-name">${character.name}</div>
            <div class="player-stats">
              <div class="hp-bar">
                <div class="hp-fill" style="width: ${hpPct}%"></div>
                <span class="hp-text">
                  <span class="hp-text-icon">${heartIcon()}</span>
                  ${character.health}/${character.maxHealth}
                </span>
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

  private iconForHandCard(defId: HandCardId): string {
    switch (defId) {
      case 'small-candle':
        return smallCandleIcon()
      case 'large-candle':
        return bigCandleIcon()
      case 'wax-shield':
        return shieldIcon()
      case 'matchstick':
      case 'match-bundle':
        return flameIcon()
      case 'brass-key':
        return pouchIcon()
      case 'cooled-candle':
        return candleIcon()
      case 'cleansing-ember':
        return flameIcon()
      default:
        return pouchIcon()
    }
  }

  private categoryClass(cat: HandCategory): string {
    return `hand-cat-${cat}`
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
    // the column reversed so slot 0 displays at the bottom.
    for (let i = 0; i < handMax; i++) {
      const card = character.hand[i]
      if (!card) {
        slots.push(
          `<li class="hand-slot is-empty" data-slot-index="${i}" aria-hidden="true"></li>`,
        )
        continue
      }
      const def = getHandCardDef(card.defId)
      const isArming = targeting && targeting.slotIndex === i
      const merged = card.merged ? 'is-merged' : ''
      // Only mark a hand card as `is-entering` when its uid wasn't present
      // in the previous render. This keeps the drop animation a *real* entry
      // beat instead of re-firing on every panel re-render.
      const isNew = !this.previousHandUids.has(card.uid)
      const classes = [
        'hand-slot',
        'hand-card',
        this.categoryClass(def.category),
        merged,
        isArming ? 'is-arming-target' : '',
        isNew ? 'is-entering' : '',
      ]
        .filter(Boolean)
        .join(' ')
      const description = card.merged ? def.tripleDescription : def.description
      slots.push(`
        <li class="${classes}" data-slot-index="${i}" data-hand-uid="${card.uid}">
          <button type="button" data-item-index="${i}"
                  aria-label="${def.name}: ${description}">
            ${card.merged ? '<span class="merged-mark" aria-hidden="true">✦</span>' : ''}
            <span class="hand-card-icon">${this.iconForHandCard(card.defId)}</span>
            <span class="hand-card-name">${def.name}${card.merged ? ' ★' : ''}</span>
            <span class="hand-card-effect">${description}</span>
          </button>
        </li>
      `)
    }

    // Reverse so slot 0 sits at the bottom of the visual stack.
    const reversed = slots.slice().reverse().join('')
    // Helper text is ALWAYS rendered to reserve its height — toggling
    // visibility keeps the hand from shifting up/down when the player arms
    // or cancels a targeted card.
    const helperText = targeting
      ? `${getHandCardDef(targeting.defId).name}: 대상 카드를 선택해 (다시 눌러 취소)`
      : ''
    const helperHiddenClass = targeting ? '' : 'is-hidden'

    const candle = character.candle ?? 0
    const candleMax = character.candleMax ?? 10
    const candlePct = Math.max(0, Math.min(100, (candle / candleMax) * 100))

    return `
      <aside class="hand-panel" aria-label="Hand">
        <header class="hand-header">
          <span class="hand-header-icon">${pouchIcon()}</span>
          손패 (${character.hand.length}/${handMax})
        </header>
        <div class="candle-gauge" aria-label="Candle gauge">
          <div class="candle-gauge-fill" style="height: ${candlePct}%"></div>
          <div class="candle-gauge-label">🕯 ${candle}/${candleMax}</div>
        </div>
        <ul class="hand-stack">${reversed}</ul>
        <div class="hand-helper ${helperHiddenClass}" aria-live="polite">${helperText}</div>
      </aside>
    `
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
      ? `적 ${weights.enemy}% · 함정 ${weights.trap}% · 보물 ${weights.treasure}%`
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

  /** Stretched chain strip below the player card showing recently played cards. */
  private renderChainStrip(scorePanel: ScorePanelState): string {
    const hints = scorePanel.chainHints
    if (!hints || hints.sequence.length === 0) return ''
    const items = hints.sequence
      .map(
        (name) => `<span class="chain-card">${name}</span>`,
      )
      .join('<span class="chain-arrow">→</span>')
    const fired = hints.firedRecipeIds.length
    const firedText = fired > 0 ? `<span class="chain-fired">조합 ${fired}회</span>` : ''
    return `
      <div class="chain-strip" aria-label="Active chain">
        <span class="chain-label">체인</span>
        <div class="chain-cards">${items}</div>
        ${firedText}
        <button class="chain-reset-btn" type="button" title="체인 초기화">×</button>
      </div>
    `
  }

  private attachListeners(): void {
    const activeCards = this.boardElement.querySelectorAll<HTMLElement>(
      '.cell.card.is-active',
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
            }),
          )
        })
      })

    this.boardElement
      .querySelector<HTMLElement>('.chain-reset-btn')
      ?.addEventListener('click', (e) => {
        e.stopPropagation()
        document.dispatchEvent(new CustomEvent('chainReset'))
      })

    // Score conversion is panel-level UI and does not spend a turn.
    this.boardElement
      .querySelector<HTMLElement>('.score-spend-btn')
      ?.addEventListener('click', (e) => {
        e.stopPropagation()
        document.dispatchEvent(new CustomEvent('scoreSpend'))
      })
  }

  private handleCardClick(
    el: HTMLElement,
    laneIndex: number,
    distance: number,
  ): void {
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
   * Play the upward pop used when the player actively attacks an enemy card.
   * The model is mutated after this promise resolves so the clicked card stays
   * visible for the full hit reaction. A 'damage'-themed burst is layered on
   * the attacked card so the impact reads even on quick chains.
   */
  animatePlayerAttack(card: Card): Promise<void> {
    const target = this.findCardElement(card.id)
    if (target) {
      SquareBurst.playOn(target, 'damage', { count: 18, spread: 100 })
    }
    return this.animateCardElements(card, 'is-player-striking', 280)
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
    return this.animateElements([...elements], 'is-enemy-slamming', 340)
  }

  /**
   * Player-hit feedback. Replaces the previous oxblood vignette with a
   * SquareBurst centered on the player card so the burst reads as a focused
   * impact rather than a screen-wide tint (which clashed with the ember
   * brightness pass). If the player card is offscreen for any reason we fall
   * back to a viewport-center burst.
   */
  animateDamageFlash(): Promise<void> {
    const playerCard = this.boardElement.querySelector<HTMLElement>(
      '.player-card, .player-row',
    )
    if (playerCard) {
      SquareBurst.playOn(playerCard, 'damage', { count: 20, spread: 150 })
    } else {
      SquareBurst.playAt(
        window.innerWidth / 2,
        window.innerHeight * 0.6,
        'damage',
        { count: 20, spread: 150 },
      )
    }
    return new Promise((resolve) => window.setTimeout(resolve, 420))
  }

  /** Generic effect dispatch — used by index.ts to fire bursts on events. */
  burstAtElement(target: HTMLElement | null, theme: BurstTheme, opts?: Parameters<typeof SquareBurst.playOn>[2]): void {
    if (!target) return
    SquareBurst.playOn(target, theme, opts)
  }

  burstAtPoint(x: number, y: number, theme: BurstTheme, opts?: Parameters<typeof SquareBurst.playAt>[3]): void {
    SquareBurst.playAt(x, y, theme, opts)
  }

  /** Find the rendered DOM element for a card (by id) for burst placement. */
  findCardElement(cardId: string): HTMLElement | null {
    return this.boardElement.querySelector<HTMLElement>(
      `.cell.card[data-card-id="${cardId}"]`,
    )
  }

  /** Find a hand slot element by index for burst placement. */
  findHandSlotElement(slotIndex: number): HTMLElement | null {
    return this.boardElement.querySelector<HTMLElement>(
      `.hand-slot[data-slot-index="${slotIndex}"]`,
    )
  }

  /** Find the score/log panel for score-pulse bursts. */
  findScorePulseAnchor(): HTMLElement | null {
    return this.boardElement.querySelector<HTMLElement>('.score-number') ??
      this.boardElement.querySelector<HTMLElement>('.score-panel')
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
    return this.animateElements([...elements], 'is-treasure-vanishing', 520)
  }

  /** Capture current card positions so the next render can FLIP-move survivors. */
  private captureCardRects(): Map<string, DOMRect> {
    const rects = new Map<string, DOMRect>()
    this.boardElement
      .querySelectorAll<HTMLElement>('.cell.card[data-card-id]')
      .forEach((el) => {
        const id = el.dataset.cardId
        if (id) rects.set(id, el.getBoundingClientRect())
      })
    return rects
  }

  /**
   * Smooth cards from their previous screen position to their new grid slot.
   * This avoids the previous full rerender flicker when lanes compact downward.
   */
  private animateMovedCards(previousRects: Map<string, DOMRect>): void {
    this.boardElement
      .querySelectorAll<HTMLElement>('.cell.card[data-card-id]')
      .forEach((el) => {
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
          { duration: 360, easing: 'cubic-bezier(0.18, 0.88, 0.22, 1)' },
        )
      })
  }

  /** Remember ids and spans after each render for enter/merge animations. */
  private rememberRenderedCards(): void {
    const ids = new Set<string>()
    const spans = new Map<string, number>()
    this.boardElement
      .querySelectorAll<HTMLElement>('.cell.card[data-card-id]')
      .forEach((el) => {
        const id = el.dataset.cardId
        if (!id) return
        ids.add(id)
        spans.set(id, parseInt(el.dataset.span || '1', 10))
      })
    this.previousCardIds = ids
    this.previousGroupSpans = spans
    // Mirror the same snapshot pattern for hand cards.
    const handUids = new Set<string>()
    this.boardElement
      .querySelectorAll<HTMLElement>('.hand-slot[data-hand-uid]')
      .forEach((el) => {
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
  private animateCardElements(
    card: Card,
    className: string,
    duration: number,
  ): Promise<void> {
    const elements = [
      ...this.boardElement.querySelectorAll<HTMLElement>('.cell.card'),
    ].filter((el) => el.dataset.cardId === card.id)
    return this.animateElements(elements, className, duration)
  }

  /** Shared class-based animation helper with cleanup after the CSS finishes. */
  private animateElements(
    elements: HTMLElement[],
    className: string,
    duration: number,
  ): Promise<void> {
    if (elements.length === 0) return Promise.resolve()
    elements.forEach((el) => {
      el.classList.remove(className)
      void el.offsetWidth
      el.classList.add(className)
    })
    return new Promise((resolve) => {
      window.setTimeout(() => {
        elements.forEach((el) => el.classList.remove(className))
        resolve()
      }, duration)
    })
  }

  private injectStyles(): void {
    if (document.getElementById('game-board-styles')) return
    const style = document.createElement('style')
    style.id = 'game-board-styles'
    style.textContent = STYLES
    document.head.appendChild(style)
  }
}

const STYLES = `
.icon {
  width: 1em;
  height: 1em;
  display: inline-block;
  vertical-align: -0.14em;
  flex-shrink: 0;
  color: currentColor;
}

.game-shell {
  width: 100%;
  height: 100vh;
  max-height: 100vh;
  display: grid;
  grid-template-columns:
    minmax(240px, 300px)
    minmax(0, 1fr)
    minmax(160px, 220px);
  gap: clamp(10px, 1.6vw, 20px);
  padding: clamp(58px, 7vh, 88px) clamp(8px, 1.4vw, 18px) clamp(8px, 1.5vh, 16px);
  overflow: hidden;
  font-family: inherit;
  align-items: stretch;
}

.stage {
  width: 100%;
  min-width: 0;
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  gap: clamp(8px, 1.4vh, 14px);
  overflow: hidden;
}

/* ---------- Top-center Turn overlay ---------- */
.turn-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 40;
  pointer-events: none;
  display: flex;
  justify-content: center;
  padding: 14px 0 36px;
  background: linear-gradient(
    180deg,
    rgba(8, 5, 14, 0.88) 0%,
    rgba(8, 5, 14, 0.55) 50%,
    rgba(8, 5, 14, 0.0) 100%
  );
}

.turn-overlay-inner {
  display: inline-flex;
  align-items: baseline;
  gap: 12px;
  font-variant-numeric: tabular-nums;
}

.turn-overlay-kicker {
  font-size: clamp(14px, 1.6vw, 20px);
  font-weight: 700;
  letter-spacing: 0.32em;
  color: rgba(255, 215, 120, 0.85);
  text-transform: uppercase;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.85);
}

.turn-overlay-number {
  font-size: clamp(34px, 4.6vw, 56px);
  font-weight: 900;
  letter-spacing: 0.05em;
  color: var(--color-flame);
  line-height: 1;
  text-shadow:
    0 0 20px rgba(255, 215, 120, 0.55),
    0 0 36px rgba(244, 164, 96, 0.32),
    0 2px 6px rgba(0, 0, 0, 0.85);
}

/* ---------- Left panel (brand + score) ---------- */
.left-panel {
  display: grid;
  grid-template-rows: auto 1fr;
  gap: 10px;
  min-height: 0;
  align-self: stretch;
  justify-self: start;
  width: 100%;
}

.brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 4px 10px 8px;
  border-bottom: 1px solid var(--color-border-soft);
}
.brand-icon {
  display: inline-flex;
  align-items: center;
  color: var(--color-flame);
  font-size: clamp(20px, 2.4vw, 26px);
  filter: drop-shadow(0 0 8px rgba(255, 215, 120, 0.5));
}
.brand-text {
  font-size: clamp(17px, 1.9vw, 22px);
  font-weight: 700;
  letter-spacing: 0.16em;
  color: var(--color-flame);
  text-shadow: 0 0 12px rgba(255, 215, 120, 0.25);
}

/* ---------- Score / Activity Panel ---------- */
.score-panel {
  display: grid;
  grid-template-rows: auto 1fr auto;
  gap: 10px;
  min-height: 0;
  padding: 12px;
  align-self: stretch;
  background:
    linear-gradient(180deg, rgba(31, 24, 48, 0.86), rgba(18, 14, 28, 0.94));
  border: 1px solid var(--color-border-soft);
  border-radius: 16px;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.05),
    0 0 28px rgba(0, 0, 0, 0.28);
}

.score-panel-total {
  position: relative;
  padding: 12px;
  border: 1px solid rgba(244, 164, 96, 0.28);
  border-radius: 14px;
  background: radial-gradient(circle at 50% 0%, rgba(255, 215, 120, 0.18), transparent 70%);
  overflow: hidden;
}

.score-kicker {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--color-text-muted);
  letter-spacing: 0.1em;
}
.score-kicker-icon {
  display: inline-flex;
  align-items: center;
  color: var(--color-flame);
  font-size: 13px;
}

.score-number {
  position: relative;
  margin-top: 4px;
  color: var(--color-flame);
  font-size: clamp(28px, 4vw, 42px);
  font-weight: 900;
  line-height: 1;
  text-shadow:
    0 0 8px rgba(255, 215, 120, 0.55),
    0 0 18px rgba(244, 164, 96, 0.3);
  font-variant-numeric: tabular-nums;
}

.score-number.is-score-popping {
  animation: score-slot-pop 0.62s cubic-bezier(0.16, 0.9, 0.22, 1);
}

.score-number.is-score-popping::after {
  content: '✦ ✧ ✦';
  position: absolute;
  right: 4px;
  top: -12px;
  color: rgba(255, 232, 168, 0.95);
  font-size: 13px;
  letter-spacing: 4px;
  animation: score-sparks 0.62s ease-out forwards;
}

.score-log-list {
  display: flex;
  flex-direction: column;
  gap: 7px;
  min-height: 0;
  overflow-y: auto;
  /* Move scrollbar to the LEFT side via direction trick. */
  direction: rtl;
  padding-left: 2px;
  scrollbar-width: thin;
  scrollbar-color: rgba(244, 164, 96, 0.7) rgba(20, 16, 28, 0.45);
}
.score-log-list > * {
  /* Reset content direction so log rows still flow left-to-right. */
  direction: ltr;
}
.score-log-list::-webkit-scrollbar {
  width: 4px;
}
.score-log-list::-webkit-scrollbar-track {
  background: rgba(20, 16, 28, 0.4);
  border-radius: 999px;
}
.score-log-list::-webkit-scrollbar-thumb {
  background: linear-gradient(180deg, var(--color-flame), var(--color-flame-deep));
  border-radius: 999px;
  box-shadow: 0 0 6px rgba(244, 164, 96, 0.4);
}
.score-log-list::-webkit-scrollbar-thumb:hover {
  background: linear-gradient(180deg, var(--color-flame), var(--color-flame-warm));
}

.score-log {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
  align-items: center;
  min-height: 36px;
  padding: 8px 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.045);
  box-shadow: inset 3px 0 0 rgba(244, 164, 96, 0.36);
}

.score-log-label {
  min-width: 0;
  color: var(--color-text-primary);
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.score-log-delta {
  color: var(--color-flame);
  font-size: 12px;
  font-weight: 800;
}

.score-log-enemy { box-shadow: inset 3px 0 0 rgba(168, 58, 58, 0.72); }
.score-log-treasure { box-shadow: inset 3px 0 0 rgba(201, 161, 58, 0.8); }
.score-log-trap { box-shadow: inset 3px 0 0 rgba(112, 76, 150, 0.8); }
.score-log-item { box-shadow: inset 3px 0 0 rgba(244, 164, 96, 0.72); }
.score-log-item-gain { box-shadow: inset 3px 0 0 rgba(103, 196, 152, 0.82); }
.score-log-item-gain .score-log-delta { color: #bff6d9; }
.score-log-score { box-shadow: inset 3px 0 0 rgba(255, 215, 120, 0.8); }
.score-log-notice { box-shadow: inset 3px 0 0 rgba(145, 174, 210, 0.75); }
.score-log-win { box-shadow: inset 3px 0 0 rgba(103, 196, 152, 0.82); }
.score-log-hurt { box-shadow: inset 3px 0 0 rgba(168, 58, 58, 0.82); }
.score-log-notice .score-log-delta { color: #cbdaf0; }
.score-log-win .score-log-delta { color: #bff6d9; }
.score-log-hurt .score-log-delta { color: #ffd5c5; }

.score-log-empty {
  padding: 14px 10px;
  color: var(--color-text-muted);
  border: 1px dashed var(--color-border-soft);
  border-radius: 10px;
  text-align: center;
  font-size: 12px;
}

.score-spend-btn {
  appearance: none;
  cursor: pointer;
  padding: 10px 12px;
  border: 1px solid var(--color-flame-warm);
  border-radius: 12px;
  color: #2a1f14;
  background: linear-gradient(135deg, var(--color-flame), var(--color-flame-warm));
  font-family: inherit;
  font-weight: 800;
  box-shadow: 0 0 18px rgba(244, 164, 96, 0.28);
}

.score-spend-btn:disabled {
  cursor: not-allowed;
  color: var(--color-text-muted);
  background: rgba(255, 255, 255, 0.04);
  border-color: var(--color-border-soft);
  box-shadow: none;
}

/* (legacy stage-header / stage-main rules removed — title now lives in
   .brand inside .left-panel and Turn is rendered as a fixed top overlay) */

/* ---------- Rail (3x3) ---------- */
.rail {
  display: grid;
  grid-template-rows: repeat(3, minmax(0, 1fr));
  gap: clamp(6px, 1vh, 10px);
  padding: clamp(10px, 1.6vh, 14px);
  /* Stays simple — a translucent dark slab so the page-level art reads
     through, with just enough shadow to separate the rail from the room. */
  background: rgba(14, 10, 22, 0.62);
  border: 1px solid rgba(139, 111, 71, 0.55);
  border-radius: 14px;
  box-shadow:
    inset 0 0 0 1px rgba(255, 215, 120, 0.05),
    inset 0 0 60px rgba(0, 0, 0, 0.45),
    0 8px 28px rgba(0, 0, 0, 0.55);
  position: relative;
  /* Visible so the ×N group badge can poke out of cell edges. */
  overflow: visible;
  min-height: 0;
  backdrop-filter: blur(2px);
}

.rail::before {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(
    ellipse 80% 60% at 50% 100%,
    rgba(244, 164, 96, 0.18),
    transparent 70%
  );
  pointer-events: none;
}

.rail-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: clamp(6px, 1vw, 10px);
  position: relative;
  z-index: 1;
  min-height: 0;
}

.rail-row.dist-2 {
  opacity: 0.42;
  transform: scale(0.92);
  transform-origin: center bottom;
}
.rail-row.dist-1 {
  opacity: 0.7;
  transform: scale(0.96);
  transform-origin: center bottom;
}
.rail-row.dist-0 {
  opacity: 1;
}

/* ---------- Cell / Card ---------- */
.cell {
  border-radius: 10px;
  border: 1px dashed var(--color-border-soft);
  background: rgba(255, 255, 255, 0.015);
  display: flex;
  align-items: stretch;
  justify-content: stretch;
  position: relative;
  transition: transform 0.18s ease, box-shadow 0.2s ease, border-color 0.2s ease;
  min-height: 0;
  min-width: 0;
}

.cell.empty {
  border-style: dashed;
  background:
    repeating-linear-gradient(
      45deg,
      rgba(255, 255, 255, 0.015) 0 6px,
      transparent 6px 12px
    );
}

.cell.card {
  cursor: default;
  border: 1px solid var(--color-border-warm);
  background: #1c1424;
  color: #fff5dc;
  /* Shared depth tokens keep the soft rear shadow identical for 1/2/3-cell cards. */
  --card-depth-shadow: 0 14px 24px rgba(0, 0, 0, 0.45);
  --card-lift-shadow: 0 4px 10px rgba(0, 0, 0, 0.55);
  --card-lift-shadow-grouped: var(--card-lift-shadow);
  box-shadow:
    inset 0 1px 0 rgba(255, 232, 168, 0.18),
    inset 0 -10px 18px rgba(0, 0, 0, 0.45),
    var(--card-lift-shadow),
    var(--card-depth-shadow);
  /* Sprite art is clipped by .card-face below — keep cell visible so the
     ×N group badge can poke out of the canvas edge. */
  overflow: visible;
  isolation: isolate;
}

.cell.is-active {
  cursor: pointer;
}
/* Hover only adds a subtle glow so it never fights hit/attack movement animations. */
.cell.is-active:hover {
  border-color: var(--color-flame-warm);
  box-shadow:
    inset 0 1px 0 rgba(255, 232, 168, 0.28),
    inset 0 -10px 18px rgba(0, 0, 0, 0.45),
    var(--card-lift-shadow),
    var(--card-depth-shadow),
    0 0 18px rgba(244, 164, 96, 0.36);
}

.cell.is-selected {
  border-color: var(--color-flame);
  box-shadow:
    inset 0 0 0 2px rgba(255, 215, 120, 0.6),
    0 0 22px rgba(255, 215, 120, 0.55),
    0 4px 14px rgba(0, 0, 0, 0.55);
  animation: candle-glow 1.6s ease-in-out infinite alternate;
}

@keyframes candle-glow {
  from {
    box-shadow:
      inset 0 0 0 2px rgba(255, 215, 120, 0.55),
      0 0 18px rgba(255, 215, 120, 0.5),
      0 4px 14px rgba(0, 0, 0, 0.55);
  }
  to {
    box-shadow:
      inset 0 0 0 2px rgba(255, 215, 120, 0.85),
      0 0 28px rgba(255, 215, 120, 0.75),
      0 4px 18px rgba(0, 0, 0, 0.6);
  }
}

.cell.card.is-grouped {
  border-width: 2px;
  box-shadow:
    inset 0 1px 0 rgba(255, 232, 168, 0.28),
    inset 0 -12px 22px rgba(0, 0, 0, 0.55),
    var(--card-lift-shadow-grouped),
    var(--card-depth-shadow),
    0 0 18px rgba(244, 164, 96, 0.18);
}

.cell.card.type-enemy { border-color: var(--color-enemy); }
.cell.card.type-enemy::before {
  content: '';
  position: absolute;
  left: 0; top: 0; bottom: 0;
  width: 3px;
  background: linear-gradient(180deg, var(--color-enemy), #5a1818);
  z-index: 3;
  pointer-events: none;
  box-shadow: 0 0 8px rgba(168, 58, 58, 0.6);
}
.cell.card.type-trap { border-color: var(--color-trap); }
.cell.card.type-trap::before {
  content: '';
  position: absolute;
  left: 0; top: 0; bottom: 0;
  width: 3px;
  background: linear-gradient(180deg, var(--color-trap), #2c1d44);
  z-index: 3;
  pointer-events: none;
  box-shadow: 0 0 8px rgba(112, 76, 150, 0.55);
}
.cell.card.type-treasure { border-color: var(--color-treasure); }
.cell.card.type-treasure::before {
  content: '';
  position: absolute;
  left: 0; top: 0; bottom: 0;
  width: 3px;
  background: linear-gradient(180deg, var(--color-flame), var(--color-treasure));
  z-index: 3;
  pointer-events: none;
  box-shadow: 0 0 8px rgba(255, 215, 120, 0.55);
}

.cell.card.type-trap.is-grouped[data-span="3"] {
  animation: trap-danger 1.2s ease-in-out infinite;
}
@keyframes trap-danger {
  0%, 100% { box-shadow: inset 0 1px 0 rgba(255,255,255,0.3), var(--card-lift-shadow-grouped), var(--card-depth-shadow), 0 0 12px rgba(168,58,58,0.4); }
  50%      { box-shadow: inset 0 1px 0 rgba(255,255,255,0.3), var(--card-lift-shadow-grouped), var(--card-depth-shadow), 0 0 22px rgba(168,58,58,0.85); }
}

/* Grouped cards should react exactly like single-cell cards: only the
   candlelight strength changes on hover, while the type-colored border stays
   intact because the later type rules keep ownership of border-color. */
.cell.card.is-active.is-grouped:hover {
  box-shadow:
    inset 0 1px 0 rgba(255, 232, 168, 0.28),
    inset 0 -12px 22px rgba(0, 0, 0, 0.55),
    var(--card-lift-shadow-grouped),
    var(--card-depth-shadow),
    0 0 18px rgba(244, 164, 96, 0.36);
}

/* The 3-cell trap's danger pulse is a keyframe animation, so hover must pause
   it before applying the same border-preserving candlelight used elsewhere. */
.cell.card.type-trap.is-active.is-grouped[data-span="3"]:hover {
  animation: none;
  box-shadow:
    inset 0 1px 0 rgba(255, 232, 168, 0.28),
    inset 0 -12px 22px rgba(0, 0, 0, 0.55),
    var(--card-lift-shadow-grouped),
    var(--card-depth-shadow),
    0 0 18px rgba(244, 164, 96, 0.36);
}

/* Grouped selected cards previously lost the single-cell selection glow because
   the grouped shadow rule had higher specificity; this restores parity while
   retaining the shared rear depth shadow. */
.cell.card.is-grouped.is-selected {
  box-shadow:
    inset 0 0 0 2px rgba(255, 215, 120, 0.6),
    0 0 22px rgba(255, 215, 120, 0.55),
    var(--card-lift-shadow-grouped),
    var(--card-depth-shadow);
  animation: grouped-candle-glow 1.6s ease-in-out infinite alternate;
}
@keyframes grouped-candle-glow {
  from {
    box-shadow:
      inset 0 0 0 2px rgba(255, 215, 120, 0.55),
      0 0 18px rgba(255, 215, 120, 0.5),
      var(--card-lift-shadow-grouped),
      var(--card-depth-shadow);
  }
  to {
    box-shadow:
      inset 0 0 0 2px rgba(255, 215, 120, 0.85),
      0 0 28px rgba(255, 215, 120, 0.75),
      var(--card-lift-shadow-grouped),
      var(--card-depth-shadow);
  }
}

.card-face {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  border-radius: inherit;
}

.card-art {
  position: absolute;
  inset: 0;
  background-size: cover;
  background-position: center 32%;
  background-repeat: no-repeat;
  z-index: 0;
  /* Slight desaturation so warm rail tone tints the art uniformly. */
  filter: saturate(1.05) contrast(1.02);
}

/* Bottom-anchored dark gradient so card-name + stats stay legible over art. */
.card-overlay {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  background:
    linear-gradient(
      180deg,
      rgba(20, 16, 28, 0.0) 38%,
      rgba(20, 16, 28, 0.55) 70%,
      rgba(10, 7, 18, 0.92) 100%
    ),
    radial-gradient(
      120% 60% at 50% 0%,
      rgba(244, 164, 96, 0.06),
      transparent 70%
    );
}

.card-content {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  align-items: center;
  text-align: center;
  padding: clamp(4px, 1vh, 8px) clamp(4px, 1vw, 8px);
  gap: 4px;
}

.card-name {
  font-size: var(--font-size-sm);
  font-weight: 700;
  color: #fff5dc;
  line-height: 1.15;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  width: 100%;
  padding: 0 2px;
  text-shadow:
    0 1px 2px rgba(0, 0, 0, 0.85),
    0 0 6px rgba(0, 0, 0, 0.6);
  letter-spacing: 0.02em;
}

.card-stats {
  display: flex;
  gap: 10px;
  font-size: 12px;
  font-weight: 700;
  color: #fff5dc;
  flex-wrap: wrap;
  justify-content: center;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.85);
}
.card-stats .stat {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  line-height: 1;
}
.card-stats .stat .icon { font-size: 13px; }
.card-stats .stat-value { font-variant-numeric: tabular-nums; }
.card-stats .stat.hp { color: #ffb3a1; }
.card-stats .stat.atk { color: #ffd58a; }
.card-stats.danger {
  color: #fff;
  background: var(--color-enemy);
  padding: 2px 10px;
  border-radius: 999px;
  letter-spacing: 0.08em;
  border: 1px solid rgba(255, 200, 200, 0.45);
  text-shadow: none;
}
.card-stats.good {
  color: #2a1f14;
  background: var(--color-treasure);
  padding: 2px 10px;
  border-radius: 999px;
  border: 1px solid rgba(255, 232, 168, 0.7);
  text-shadow: none;
}

.group-badge {
  position: absolute;
  /* Pulled outside the cell edge — cell + rail are now overflow:visible so
     the badge can sit on the canvas margin, like a wax seal stamped over it. */
  top: -16px;
  right: -16px;
  background: linear-gradient(135deg, var(--color-flame), var(--color-flame-deep));
  color: #fff8e0;
  border: 1px solid rgba(255, 232, 168, 0.95);
  font-size: 13px;
  font-weight: 900;
  padding: 4px 11px;
  border-radius: 999px;
  box-shadow:
    0 4px 10px rgba(0, 0, 0, 0.6),
    0 0 16px rgba(255, 215, 120, 0.45);
  transform: rotate(11deg);
  transform-origin: center;
  z-index: 30;
  pointer-events: none;
}


.cell.card.is-trap-disarm-target {
  border-color: var(--color-flame);
  box-shadow:
    inset 0 0 0 2px rgba(255, 215, 120, 0.7),
    0 0 20px rgba(255, 215, 120, 0.5);
}

.cell.card.is-trap-disarm-blocked {
  cursor: not-allowed;
  filter: grayscale(0.45) brightness(0.7);
}

.trap-block-mark {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 70, 70, 0.88);
  font-size: clamp(48px, 12vw, 96px);
  font-weight: 900;
  text-shadow:
    0 0 8px rgba(0, 0, 0, 0.9),
    0 0 18px rgba(168, 58, 58, 0.8);
  pointer-events: none;
  z-index: 8;
}

/* ---------- Player Card ---------- */
.player-row {
  display: flex;
  justify-content: center;
  align-items: end;
}

/* Player card mirrors the rail-card structure (sprite art → bottom dark
   gradient → content) so the player reads as the largest "card" on board. */
.player-card {
  position: relative;
  width: clamp(150px, 17vw, 200px);
  aspect-ratio: 3 / 4;
  border-radius: 14px;
  overflow: hidden;
  isolation: isolate;
  background: #14101c;
  border: 1px solid var(--color-flame-warm);
  box-shadow:
    inset 0 1px 0 rgba(255, 232, 168, 0.32),
    inset 0 -10px 22px rgba(0, 0, 0, 0.55),
    0 6px 14px rgba(0, 0, 0, 0.55),
    0 0 26px rgba(244, 164, 96, 0.28);
}

.player-art {
  position: absolute;
  inset: 0;
  background-size: cover;
  background-position: center 22%;
  background-repeat: no-repeat;
  filter: saturate(1.06) contrast(1.04);
  z-index: 0;
}

.player-overlay {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  background:
    linear-gradient(
      180deg,
      rgba(20, 16, 28, 0.0) 32%,
      rgba(20, 16, 28, 0.55) 65%,
      rgba(8, 5, 14, 0.94) 100%
    ),
    radial-gradient(
      120% 60% at 50% 0%,
      rgba(244, 164, 96, 0.1),
      transparent 70%
    );
}

.player-content {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  align-items: stretch;
  text-align: center;
  padding: 8px 10px 10px;
  gap: 6px;
}

.player-name {
  font-size: var(--font-size-sm);
  font-weight: 800;
  color: var(--color-flame);
  letter-spacing: 0.06em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-shadow:
    0 1px 2px rgba(0, 0, 0, 0.9),
    0 0 8px rgba(255, 215, 120, 0.35);
}

.player-stats {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
  align-items: center;
}

.hp-bar {
  position: relative;
  height: 16px;
  background: rgba(0, 0, 0, 0.5);
  border: 1px solid var(--color-border-soft);
  border-radius: 999px;
  overflow: hidden;
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.6);
}
.hp-fill {
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, #c9472a, #f4a460);
  transition: width 0.3s ease;
  box-shadow: inset 0 1px 0 rgba(255, 215, 120, 0.4);
}
.hp-text {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  height: 100%;
  font-size: 12px;
  font-weight: 700;
  color: #fff5dc;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.85);
  font-variant-numeric: tabular-nums;
}
.hp-text-icon {
  display: inline-flex;
  align-items: center;
  color: #ffd5c5;
  font-size: 12px;
}

.atk-stat {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: var(--font-size-sm);
  font-weight: 700;
  color: var(--color-flame);
  padding: 3px 12px;
  border: 1px solid rgba(255, 215, 120, 0.35);
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.32);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.atk-stat-icon {
  display: inline-flex;
  align-items: center;
  color: var(--color-flame);
  font-size: 13px;
}

/* ---------- Hand panel — see the bottom of the file for the active
   10-slot stack styles. The old deckbuilder layout (.hand-cards, the
   transform-lift hover, etc.) was removed because it both duplicated and
   clipped the new layout's animations. */

@media (max-width: 960px) {
  .game-shell {
    grid-template-columns: minmax(200px, 240px) minmax(0, 1fr) minmax(140px, 180px);
  }
}

@media (max-width: 760px) {
  .game-shell {
    grid-template-columns: 1fr;
    grid-template-rows: auto minmax(0, 1fr) auto;
  }
  .left-panel { min-height: 0; }
  .hand-panel { grid-row: 3; }
}

@media (max-width: 480px) {
  .game-shell { padding-left: 6px; padding-right: 6px; }
  .card-name { font-size: 12px; }
}

@media (max-height: 600px) {
  .rail-row.dist-2 { opacity: 0.3; transform: scale(0.86); }
  .rail-row.dist-1 { opacity: 0.6; transform: scale(0.92); }
  .player-card { width: clamp(120px, 14vw, 160px); }
}

/* ---------- Animation Effects ---------- */
@keyframes score-slot-pop {
  0% { transform: translateY(0) scale(1); filter: brightness(1); }
  24% { transform: translateY(-3px) scale(1.12, 0.92); filter: brightness(1.35); }
  48% { transform: translateY(2px) scale(0.96, 1.08); }
  72% { transform: translateY(-1px) scale(1.04); }
  100% { transform: translateY(0) scale(1); filter: brightness(1); }
}

@keyframes score-sparks {
  0% { opacity: 0; transform: translate(0, 6px) scale(0.6); }
  35% { opacity: 1; transform: translate(8px, -4px) scale(1); }
  100% { opacity: 0; transform: translate(18px, -18px) scale(1.25); }
}

/* Damage vignette intentionally removed — see SquareBurst.ts for the
   replacement. The unified effect system uses scattering solid squares so
   the visual stays compatible with the ember-driven brightness pass. */

@keyframes card-enter-soft {
  from {
    opacity: 0;
    transform: translateY(-18px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes player-strike-pop {
  0%, 100% {
    transform: translateY(0) scale(1);
    filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.5));
  }
  38% {
    transform: translateY(-18px) scale(1.05);
    filter: drop-shadow(0 12px 18px rgba(255, 215, 120, 0.45));
  }
  68% {
    transform: translateY(4px) scale(0.98);
  }
}

@keyframes enemy-down-slam {
  0%, 100% {
    transform: translateY(0) scale(1);
    filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.5));
  }
  42% {
    transform: translateY(24px) scale(1.04, 0.96);
    filter: drop-shadow(0 14px 18px rgba(168, 58, 58, 0.65));
  }
  66% {
    transform: translateY(-3px) scale(0.99, 1.02);
  }
}

@keyframes treasure-dust-fade {
  0% {
    opacity: 1;
    transform: translate(0, 0) rotate(0deg) scale(1);
    filter: blur(0) saturate(1);
  }
  24% {
    opacity: 0.92;
    transform: translate(-2px, 1px) rotate(-0.8deg) scale(1.01);
  }
  46% {
    opacity: 0.72;
    transform: translate(2px, -1px) rotate(0.8deg) scale(0.99);
  }
  100% {
    opacity: 0;
    transform: translate(0, 10px) rotate(0deg) scale(0.92);
    filter: blur(1px) saturate(0.75);
  }
}

@keyframes treasure-dust-burst {
  0% {
    opacity: 0;
    transform: scale(0.5);
    box-shadow: 0 0 0 rgba(201, 161, 58, 0);
  }
  35% {
    opacity: 0.9;
    transform: scale(1.05);
    box-shadow:
      -18px -8px 0 rgba(201, 161, 58, 0.22),
      14px -12px 0 rgba(255, 228, 154, 0.2),
      -8px 14px 0 rgba(182, 128, 42, 0.2),
      18px 10px 0 rgba(255, 228, 154, 0.16);
  }
  100% {
    opacity: 0;
    transform: scale(1.45);
    box-shadow:
      -28px -18px 0 rgba(201, 161, 58, 0),
      24px -24px 0 rgba(255, 228, 154, 0),
      -18px 24px 0 rgba(182, 128, 42, 0),
      30px 18px 0 rgba(255, 228, 154, 0);
  }
}

@keyframes group-squish {
  0%, 100% { transform: scale(1); }
  35% { transform: scale(1.06, 0.94); }
  62% { transform: scale(0.98, 1.05); }
}

.cell.card.is-entering {
  animation: card-enter-soft 0.34s cubic-bezier(0.2, 0.86, 0.28, 1);
}

.cell.card.is-player-striking {
  animation: player-strike-pop 0.28s cubic-bezier(0.2, 0.9, 0.25, 1);
  z-index: 5;
}

.cell.card.is-enemy-slamming {
  animation: enemy-down-slam 0.34s cubic-bezier(0.24, 0.92, 0.28, 1);
  z-index: 5;
}

.cell.card.is-treasure-vanishing {
  pointer-events: none;
  animation: treasure-dust-fade 0.52s ease-out forwards;
  z-index: 6;
}

.cell.card.is-treasure-vanishing::after {
  content: '';
  position: absolute;
  inset: 50% auto auto 50%;
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: rgba(255, 232, 168, 0.8);
  animation: treasure-dust-burst 0.52s ease-out forwards;
}

.cell.card.is-newly-grouped {
  animation: group-squish 0.3s cubic-bezier(0.18, 0.9, 0.18, 1);
  z-index: 4;
}

/* ---------- Ember HUD (top center) ---------- */
.ember-hud {
  position: fixed;
  top: clamp(56px, 7vh, 84px);
  left: 50%;
  transform: translateX(-50%);
  z-index: 35;
  width: min(640px, 92vw);
  pointer-events: none;
}
.ember-hud-inner {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 12px;
  background: linear-gradient(180deg, rgba(20, 16, 28, 0.78), rgba(8, 5, 14, 0.55));
  border: 1px solid rgba(255, 215, 120, 0.22);
  border-radius: 12px;
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.45);
}
.ember-line {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 10px;
  align-items: center;
}
.ember-icon {
  display: inline-flex;
  align-items: center;
  color: var(--color-flame);
  font-size: 16px;
  filter: drop-shadow(0 0 6px rgba(255, 215, 120, 0.5));
}
.ember-bar {
  position: relative;
  height: 14px;
  border-radius: 999px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
}
.ember-bar-fill {
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: 999px;
  transition: width 0.35s ease;
}
.ember-bar-fill.ember-tier-bright {
  background: linear-gradient(90deg, #ffe89a, #f4a460);
  box-shadow: 0 0 12px rgba(255, 215, 120, 0.55);
}
.ember-bar-fill.ember-tier-dim {
  background: linear-gradient(90deg, #f4a460, #c97640);
  box-shadow: 0 0 8px rgba(244, 164, 96, 0.4);
}
.ember-bar-fill.ember-tier-flickering {
  background: linear-gradient(90deg, #c97640, #8b3a2d);
  box-shadow: 0 0 8px rgba(168, 58, 58, 0.45);
  animation: ember-flicker 1.6s ease-in-out infinite;
}
.ember-bar-fill.ember-tier-extinguished {
  background: linear-gradient(90deg, #5a2828, #2d1818);
  animation: ember-flicker 0.8s ease-in-out infinite;
}
@keyframes ember-flicker {
  0%, 100% { filter: brightness(1); }
  50% { filter: brightness(0.65); }
}
.ember-bar-label {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  color: rgba(255, 245, 220, 0.95);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.85);
  letter-spacing: 0.04em;
}
.ember-countdown {
  font-size: 11px;
  color: rgba(255, 215, 120, 0.85);
  font-weight: 700;
  letter-spacing: 0.04em;
}
.ember-weights {
  font-size: 10px;
  color: rgba(255, 245, 220, 0.55);
  text-align: right;
  letter-spacing: 0.04em;
}

/* ---------- Vignette overlay (Darkest Dungeon torch feel) ---------- */
.ember-vignette {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 38;
  background: radial-gradient(
    ellipse at center,
    rgba(0, 0, 0, 0) 25%,
    rgba(0, 0, 0, calc(0.55 * var(--vignette-opacity, 0))) 65%,
    rgba(0, 0, 0, calc(0.85 * var(--vignette-opacity, 0))) 100%
  );
  transition: background 0.4s ease;
}

/* ---------- Hand stack (bottom-up, 10 fixed slots) ----------
   Layout rationale:
   - grid rows: [header, candle-gauge, stack (1fr), helper (reserved)]
   - The helper row is rendered with a fixed min-height even when empty so
     that arming a targeted card never shifts the stack up or down. This
     fixes the "선택하면 UI가 밀려나는" feel.
   - The stack uses justify-content:flex-end so filled slots dock to the
     BOTTOM of the column, matching the Tetris-stacking model. Empty slots
     are flattened (no height) so the bottom row of cards sits flush with
     the helper border, not floating at the column center.
   - overflow:visible on the stack so hover-pop/animation/burst don't get
     clipped against the panel wall when a card is selected.
*/
.hand-panel {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr) auto;
  gap: 8px;
  min-height: 0;
  padding: 10px;
  background: linear-gradient(180deg, rgba(31, 24, 48, 0.86), rgba(18, 14, 28, 0.94));
  border: 1px solid var(--color-border-soft);
  border-radius: 16px;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.05),
    0 0 28px rgba(0, 0, 0, 0.28);
  align-self: stretch;
  overflow: visible;
}
.hand-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 700;
  color: var(--color-flame);
  letter-spacing: 0.08em;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--color-border-soft);
}
.hand-header-icon {
  display: inline-flex;
  align-items: center;
  color: var(--color-flame);
  font-size: 14px;
}
.candle-gauge {
  position: relative;
  height: 10px;
  border-radius: 999px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
}
.candle-gauge-fill {
  position: absolute;
  inset: auto 0 0 0;
  width: 100%;
  height: 0;
  background: linear-gradient(180deg, #ffe89a, #f4a460);
  box-shadow: 0 0 10px rgba(255, 215, 120, 0.65);
  transition: height 0.3s ease;
}
.candle-gauge-label {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 700;
  color: rgba(255, 245, 220, 0.95);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.85);
  letter-spacing: 0.04em;
}
.hand-helper {
  font-size: 11px;
  color: var(--color-flame);
  text-align: center;
  padding: 4px 6px;
  border: 1px dashed rgba(244, 164, 96, 0.5);
  border-radius: 6px;
  background: rgba(244, 164, 96, 0.06);
  /* Reserve height even when text is empty so arming/disarming does not
     shift the stack vertically. */
  min-height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: opacity 0.18s ease;
}
.hand-helper.is-hidden {
  opacity: 0;
  border-color: transparent;
  background: transparent;
  color: transparent;
  pointer-events: none;
}
.hand-stack {
  list-style: none;
  margin: 0;
  padding: 4px 0;
  display: flex;
  flex-direction: column;
  justify-content: flex-end; /* Dock filled cards to the bottom. */
  gap: 6px;
  min-height: 0;
  overflow: visible;
}
.hand-slot {
  border-radius: 8px;
  flex-shrink: 0;
  position: relative;
}
/* Empty slots collapse so the visual stack reads bottom-up without
   floating filled cards in the column middle. */
.hand-slot.is-empty {
  height: 0;
  border: none;
  background: transparent;
  opacity: 0;
  margin: 0;
  padding: 0;
}
.hand-slot.hand-card {
  padding: 0;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.045);
  min-height: 56px;
  transition: transform 0.18s cubic-bezier(0.2, 0.86, 0.28, 1), box-shadow 0.18s ease;
}
/* Drop animation runs ONLY on the first render where this uid appears.
   Without this gate, every full re-render of the hand panel would replay
   the drop on every card, which made the whole stack twitch. */
.hand-slot.hand-card.is-entering {
  animation: hand-card-drop 0.32s cubic-bezier(0.18, 0.88, 0.22, 1);
}
@keyframes hand-card-drop {
  from { transform: translateY(-12px); opacity: 0.4; }
  to { transform: translateY(0); opacity: 1; }
}
.hand-slot.hand-card:hover,
.hand-slot.hand-card:focus-within {
  transform: translateY(-2px);
  z-index: 2;
  box-shadow:
    0 6px 18px rgba(0, 0, 0, 0.55),
    0 0 14px rgba(255, 215, 120, 0.35);
}
.hand-slot.hand-card button {
  width: 100%;
  height: 100%;
  display: grid;
  grid-template-columns: 30px 1fr auto;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  background: transparent;
  border: none;
  font-family: inherit;
  font-size: 13px;
  color: var(--color-text-primary);
  cursor: pointer;
  position: relative;
  min-height: 56px;
}
.hand-slot.hand-card button:hover {
  background: rgba(255, 215, 120, 0.06);
}
.hand-card .hand-card-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--color-flame);
  font-size: 22px;
}
.hand-card .hand-card-name {
  font-weight: 700;
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.hand-card .hand-card-effect {
  font-size: 11px;
  color: var(--color-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 120px;
}
.hand-cat-recovery { box-shadow: inset 4px 0 0 rgba(103, 196, 152, 0.85); }
.hand-cat-tool { box-shadow: inset 4px 0 0 rgba(255, 215, 120, 0.9); }
.hand-cat-control { box-shadow: inset 4px 0 0 rgba(145, 174, 210, 0.9); }
.hand-cat-attack { box-shadow: inset 4px 0 0 rgba(168, 58, 58, 0.9); }
.hand-slot.is-merged {
  background: rgba(255, 215, 120, 0.13);
  border-color: rgba(255, 215, 120, 0.55);
  box-shadow:
    0 0 12px rgba(255, 215, 120, 0.35),
    inset 4px 0 0 rgba(255, 215, 120, 1);
}
.hand-slot.is-merged .merged-mark {
  position: absolute;
  top: 4px;
  right: 6px;
  font-size: 12px;
  color: rgba(255, 232, 168, 0.95);
  text-shadow: 0 0 4px rgba(255, 215, 120, 0.85);
}
.hand-slot.is-arming-target {
  outline: 2px solid var(--color-flame);
  outline-offset: -2px;
  animation: hand-arm-pulse 1.1s ease-in-out infinite;
}
@keyframes hand-arm-pulse {
  0%, 100% { box-shadow: 0 0 0 rgba(255, 215, 120, 0); }
  50% { box-shadow: 0 0 14px rgba(255, 215, 120, 0.55); }
}

/* ---------- Hand-target highlighting on the rail ---------- */
.cell.card.is-hand-target {
  outline: 2px dashed rgba(255, 215, 120, 0.7);
  outline-offset: -3px;
  animation: hand-target-pulse 1.1s ease-in-out infinite;
}
@keyframes hand-target-pulse {
  0%, 100% { box-shadow: 0 0 0 rgba(255, 215, 120, 0); }
  50% { box-shadow: 0 0 16px rgba(255, 215, 120, 0.45); }
}

/* ---------- Chain strip below player card ---------- */
.chain-strip {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 10px;
  background: rgba(20, 16, 28, 0.6);
  border: 1px solid rgba(255, 215, 120, 0.18);
  font-size: 11px;
}
.chain-label {
  font-weight: 700;
  color: var(--color-flame);
  letter-spacing: 0.06em;
}
.chain-cards {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}
.chain-card {
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(255, 215, 120, 0.12);
  border: 1px solid rgba(255, 215, 120, 0.4);
  color: rgba(255, 245, 220, 0.95);
  font-weight: 600;
}
.chain-arrow {
  color: rgba(255, 215, 120, 0.5);
  font-weight: 600;
}
.chain-fired {
  font-size: 10px;
  color: rgba(255, 232, 168, 0.95);
  font-weight: 700;
}
.chain-reset-btn {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.05);
  color: var(--color-flame);
  cursor: pointer;
  font-weight: 800;
  font-family: inherit;
}
.chain-reset-btn:hover {
  background: rgba(244, 164, 96, 0.15);
}

/* Melt/recipe highlight in the activity log. */
.score-log-melt {
  box-shadow: inset 3px 0 0 rgba(255, 215, 120, 1);
  background: rgba(255, 215, 120, 0.08);
}
.score-log-melt .score-log-delta { color: rgba(255, 232, 168, 1); }
`
