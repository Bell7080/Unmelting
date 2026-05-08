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

export interface CardActionDetail {
  laneIndex: number
  distance: number
  card: Card
}

export interface ItemActionDetail {
  itemIndex: number
}

export class GameBoardRenderer {
  private boardElement: HTMLElement
  private selected: { laneIndex: number; distance: number } | null = null
  private currentGameState: GameState | null = null
  private hasRendered = false
  private previousCardIds = new Set<string>()
  private previousGroupSpans = new Map<string, number>()
  private trapDisarmItemIndex: number | null = null

  constructor(containerId: string = 'game-board') {
    const container = document.getElementById(containerId)
    if (!container) {
      throw new Error(`Container ${containerId} not found`)
    }
    this.boardElement = container
  }

  render(gameState: GameState): void {
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
      <div class="stage">
        <header class="stage-header">
          <div class="stage-title">🕯 Unmelting</div>
          <div class="turn-pill">Turn ${turn}</div>
        </header>

        <main class="stage-main">
          <section class="rail" aria-label="Card rail">
            ${this.renderRail(lanes)}
          </section>

          ${this.renderPlayer(character)}

          ${this.renderItems(character)}
        </main>
      </div>
    `

    this.injectStyles()
    this.attachListeners()
    this.animateMovedCards(previousRects)
    this.rememberRenderedCards()
  }

  clearSelection(): void {
    this.selected = null
  }

  /** Toggle the UI overlay used while the wax shield is waiting for a trap. */
  setTrapDisarmMode(itemIndex: number | null): void {
    this.trapDisarmItemIndex = itemIndex
    this.clearSelection()
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
    isActive: boolean
  ): string {
    const isSelected =
      !!this.selected &&
      this.selected.distance === distance &&
      this.selected.laneIndex >= laneIndex &&
      this.selected.laneIndex < laneIndex + span

    const isTrapDisarmBlocked =
      isActive && this.trapDisarmItemIndex !== null && card.type !== CardType.TRAP
    const isTrapDisarmTarget =
      isActive && this.trapDisarmItemIndex !== null && card.type === CardType.TRAP

    const classes = [
      'cell',
      'card',
      `type-${card.type}`,
      isActive ? 'is-active' : 'is-preview',
      isSelected ? 'is-selected' : '',
      isTrapDisarmBlocked ? 'is-trap-disarm-blocked' : '',
      isTrapDisarmTarget ? 'is-trap-disarm-target' : '',
      span > 1 ? 'is-grouped' : '',
      this.hasRendered && !this.previousCardIds.has(card.id) ? 'is-entering' : '',
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
        ${isTrapDisarmBlocked ? '<div class="trap-block-mark" aria-hidden="true">×</div>' : ''}
      </div>
    `
  }

  private renderCardFace(card: Card, span: number): string {
    const icon = this.iconFor(card.type)

    let stats = ''
    if (card.type === CardType.ENEMY) {
      stats = `
        <div class="card-stats">
          <span class="stat hp">❤ ${card.getHealth()}</span>
          <span class="stat atk">⚔ ${card.getDamage()}</span>
        </div>
      `
    } else if (card.type === CardType.TRAP && card.groupCount >= 3) {
      stats = `<div class="card-stats danger">즉사</div>`
    } else if (card.type === CardType.TREASURE && card.groupCount > 1) {
      const mult = card.groupCount === 2 ? 'x2' : 'x4'
      stats = `<div class="card-stats good">보상 ${mult}</div>`
    }

    const groupBadge =
      span > 1 ? `<div class="group-badge">×${span}</div>` : ''

    const groupName = span > 1 ? this.groupName(card.type, span) : card.name

    return `
      <div class="card-face">
        ${groupBadge}
        <div class="card-icon">${icon}</div>
        <div class="card-name">${groupName}</div>
        ${stats}
      </div>
    `
  }

  private groupName(type: CardType, span: number): string {
    if (span <= 1) return ''
    if (type === CardType.ENEMY) return span === 2 ? '적 무리' : '적 군단'
    if (type === CardType.TRAP) return span === 2 ? '큰 함정' : '함정 지대'
    if (type === CardType.TREASURE) return span === 2 ? '보물 더미' : '대보물'
    return ''
  }

  private iconFor(type: CardType): string {
    switch (type) {
      case CardType.ENEMY: return '🐺'
      case CardType.TRAP: return '🕸'
      case CardType.TREASURE: return '🎁'
      default: return '?'
    }
  }

  private renderPlayer(character: any): string {
    const hpPct = Math.max(
      0,
      Math.min(100, (character.health / character.maxHealth) * 100)
    )
    return `
      <div class="player-row">
        <div class="player-card">
          <div class="player-icon">🕯</div>
          <div class="player-info">
            <div class="player-name">${character.name}</div>
            <div class="player-stats">
              <div class="hp-bar">
                <div class="hp-fill" style="width: ${hpPct}%"></div>
                <span class="hp-text">❤ ${character.health}/${character.maxHealth}</span>
              </div>
              <div class="atk-stat">⚔ ${character.damage}</div>
            </div>
          </div>
        </div>
      </div>
    `
  }

  private renderItems(character: any): string {
    if (!character.items || character.items.length === 0) {
      return `
        <div class="items-row empty">
          <span class="items-empty">📦 손패가 비어 있어</span>
        </div>
      `
    }
    const badges = character.items
      .map((item: string, index: number) =>
        `<button class="item-pill ${this.trapDisarmItemIndex === index ? 'is-arming-trap-disarm' : ''}" data-item-index="${index}" type="button">${item}</button>`
      )
      .join('')
    const helper = this.trapDisarmItemIndex !== null
      ? '<div class="items-helper danger">밀랍 방패: 파괴할 함정을 선택하거나 방패를 다시 눌러 취소</div>'
      : ''
    return `
      <div class="items-row">
        <div class="items-label">📦 손패 (${character.items.length})</div>
        ${helper}
        <div class="items-list">${badges}</div>
      </div>
    `
  }

  private attachListeners(): void {
    const activeCards = this.boardElement.querySelectorAll<HTMLElement>(
      '.cell.card.is-active'
    )
    activeCards.forEach((el) => {
      el.addEventListener('click', (e) => {
        e.stopPropagation()
        const laneIndex = parseInt(el.dataset.lane || '0', 10)
        const distance = parseInt(el.dataset.distance || '0', 10)
        this.handleCardClick(el, laneIndex, distance)
      })
    })

    // Hand items are buttons so they can be used without selecting a rail card.
    this.boardElement.querySelectorAll<HTMLElement>('.item-pill').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.stopPropagation()
        const itemIndex = parseInt(el.dataset.itemIndex || '-1', 10)
        document.dispatchEvent(new CustomEvent<ItemActionDetail>('itemAction', {
          detail: { itemIndex },
        }))
      })
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
   * Play the upward pop used when the player actively attacks an enemy card.
   * The model is mutated after this promise resolves so the clicked card stays
   * visible for the full hit reaction.
   */
  animatePlayerAttack(card: Card): Promise<void> {
    return this.animateCardElements(card, 'is-player-striking', 280)
  }

  /**
   * Play the downward slam used during the enemy phase. Enemy hits are grouped
   * by Card instance in TurnManager, so each visual card should only slam once.
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

  /** Flash the stage red when the player takes damage. */
  animateDamageFlash(): Promise<void> {
    return this.animateElements([this.boardElement], 'is-damage-flashing', 260)
  }

  /**
   * Treasure volatility mutates the model before the next render, but the old
   * DOM is still present. Use that old DOM to show dust and fading first.
   */
  animateTreasureChanges(changes: TreasureChange[]): Promise<void> {
    const elements = new Set<HTMLElement>()
    for (const change of changes) {
      if (change.outcome !== 'disappeared') continue
      const selector =
        `.cell.card.type-treasure[data-lane="${change.laneIndex}"]` +
        `[data-distance="${change.distance}"]`
      const element = this.boardElement.querySelector<HTMLElement>(selector)
      if (element) elements.add(element)
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
          { duration: 360, easing: 'cubic-bezier(0.18, 0.88, 0.22, 1)' }
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
    duration: number
  ): Promise<void> {
    const elements = [...this.boardElement.querySelectorAll<HTMLElement>('.cell.card')]
      .filter((el) => el.dataset.cardId === card.id)
    return this.animateElements(elements, className, duration)
  }

  /** Shared class-based animation helper with cleanup after the CSS finishes. */
  private animateElements(
    elements: HTMLElement[],
    className: string,
    duration: number
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
.stage {
  width: 100%;
  height: 100vh;
  max-height: 100vh;
  display: grid;
  grid-template-rows: auto 1fr;
  padding: clamp(8px, 1.5vh, 16px) clamp(12px, 4vw, 36px);
  gap: clamp(6px, 1vh, 12px);
  max-width: 720px;
  margin: 0 auto;
  overflow: hidden;
  font-family: inherit;
}

.stage-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 0 8px;
  border-bottom: 1px solid var(--color-border-soft);
}

.stage-title {
  font-size: var(--font-size-lg);
  font-weight: 600;
  letter-spacing: 0.08em;
  color: var(--color-flame);
  text-shadow: 0 0 12px rgba(255, 215, 120, 0.25);
}

.turn-pill {
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
  padding: 4px 12px;
  border: 1px solid var(--color-border-soft);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.02);
}

.stage-main {
  display: grid;
  grid-template-rows: 1fr auto auto;
  gap: clamp(8px, 1.5vh, 14px);
  min-height: 0;
}

/* ---------- Rail (3x3) ---------- */
.rail {
  display: grid;
  grid-template-rows: repeat(3, minmax(0, 1fr));
  gap: clamp(6px, 1vh, 10px);
  padding: clamp(8px, 1.5vh, 12px);
  background:
    linear-gradient(180deg, rgba(31, 24, 48, 0.4) 0%, rgba(31, 24, 48, 0.7) 100%);
  border: 1px solid var(--color-border-soft);
  border-radius: 12px;
  position: relative;
  overflow: hidden;
  min-height: 0;
}

.rail::before {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(
    ellipse 80% 60% at 50% 100%,
    rgba(244, 164, 96, 0.16),
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
  background:
    linear-gradient(160deg, var(--color-parchment) 0%, var(--color-parchment-shadow) 100%);
  color: var(--color-text-dark);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.4),
    0 2px 8px rgba(0, 0, 0, 0.5);
  overflow: hidden;
}

.cell.is-active {
  cursor: pointer;
}
.cell.is-active:hover {
  transform: translateY(-2px);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.4),
    0 4px 14px rgba(0, 0, 0, 0.55),
    0 0 14px rgba(244, 164, 96, 0.25);
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
  background:
    linear-gradient(135deg, var(--color-parchment) 0%, var(--color-parchment-shadow) 60%, #b9986a 100%);
  border-width: 2px;
}

.cell.card.type-enemy { border-color: var(--color-enemy); }
.cell.card.type-enemy::before {
  content: '';
  position: absolute;
  left: 0; top: 0; bottom: 0;
  width: 4px;
  background: var(--color-enemy);
  border-top-left-radius: 9px;
  border-bottom-left-radius: 9px;
}
.cell.card.type-trap { border-color: var(--color-trap); }
.cell.card.type-trap::before {
  content: '';
  position: absolute;
  left: 0; top: 0; bottom: 0;
  width: 4px;
  background: var(--color-trap);
  border-top-left-radius: 9px;
  border-bottom-left-radius: 9px;
}
.cell.card.type-treasure { border-color: var(--color-treasure); }
.cell.card.type-treasure::before {
  content: '';
  position: absolute;
  left: 0; top: 0; bottom: 0;
  width: 4px;
  background: var(--color-treasure);
  border-top-left-radius: 9px;
  border-bottom-left-radius: 9px;
}

.cell.card.type-trap.is-grouped[data-span="3"] {
  animation: trap-danger 1.2s ease-in-out infinite;
}
@keyframes trap-danger {
  0%, 100% { box-shadow: inset 0 1px 0 rgba(255,255,255,0.3), 0 0 12px rgba(168,58,58,0.4); }
  50%      { box-shadow: inset 0 1px 0 rgba(255,255,255,0.3), 0 0 22px rgba(168,58,58,0.85); }
}

.card-face {
  width: 100%;
  height: 100%;
  display: grid;
  grid-template-rows: 1fr auto auto;
  align-items: center;
  justify-items: center;
  padding: clamp(4px, 1vh, 8px) clamp(4px, 1vw, 8px);
  text-align: center;
  position: relative;
  min-height: 0;
}

.card-icon {
  font-size: clamp(20px, 4.5vw, 36px);
  line-height: 1;
  filter: drop-shadow(0 1px 0 rgba(0, 0, 0, 0.2));
}

.card-name {
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--color-text-dark);
  line-height: 1.15;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  width: 100%;
  padding: 0 2px;
}

.card-stats {
  display: flex;
  gap: 8px;
  margin-top: 2px;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-dark);
  flex-wrap: wrap;
  justify-content: center;
}
.card-stats.danger {
  color: #fff;
  background: var(--color-enemy);
  padding: 2px 8px;
  border-radius: 999px;
  letter-spacing: 0.05em;
}
.card-stats.good {
  color: #2a1f14;
  background: var(--color-treasure);
  padding: 2px 8px;
  border-radius: 999px;
}
.card-stats .stat.hp { color: #8b1f1f; }
.card-stats .stat.atk { color: #5a3a14; }

.group-badge {
  position: absolute;
  top: -4px;
  right: -2px;
  background: var(--color-flame-deep);
  color: #fff8e0;
  border: 1px solid var(--color-flame);
  font-size: 11px;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 999px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.5);
  z-index: 2;
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
}

.player-card {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 14px;
  align-items: center;
  padding: clamp(8px, 1.5vh, 12px) clamp(12px, 3vw, 18px);
  width: 100%;
  max-width: 420px;
  background:
    linear-gradient(135deg, rgba(244, 164, 96, 0.12) 0%, rgba(31, 24, 48, 0.6) 100%);
  border: 1px solid var(--color-flame-warm);
  border-radius: 12px;
  box-shadow:
    inset 0 1px 0 rgba(255, 215, 120, 0.2),
    0 0 24px rgba(244, 164, 96, 0.18);
}

.player-icon {
  font-size: clamp(24px, 4vw, 40px);
  filter: drop-shadow(0 0 8px rgba(255, 215, 120, 0.6));
  line-height: 1;
}

.player-info {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.player-name {
  font-size: var(--font-size-base);
  font-weight: 600;
  color: var(--color-flame);
  letter-spacing: 0.03em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.player-stats {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 10px;
  align-items: center;
}

.hp-bar {
  position: relative;
  height: 14px;
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid var(--color-border-soft);
  border-radius: 999px;
  overflow: hidden;
}
.hp-fill {
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, var(--color-enemy), #d97a2c);
  transition: width 0.3s ease;
}
.hp-text {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  font-size: 11px;
  font-weight: 600;
  color: #fff5dc;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
}

.atk-stat {
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--color-flame-warm);
  padding: 2px 10px;
  border: 1px solid var(--color-border-soft);
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.25);
  white-space: nowrap;
}

/* ---------- Items / Inventory ---------- */
.items-row {
  padding: clamp(8px, 1.5vh, 10px) 14px;
  background: rgba(31, 24, 48, 0.5);
  border: 1px solid var(--color-border-soft);
  border-radius: 10px;
  display: grid;
  gap: 6px;
  max-height: 22vh;
  overflow-y: auto;
}

.items-row.empty {
  text-align: center;
  max-height: none;
}

.items-empty {
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
  font-style: italic;
}

.items-label {
  font-size: var(--font-size-sm);
  color: var(--color-flame-warm);
  font-weight: 600;
}

.items-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.item-pill {
  appearance: none;
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  padding: 4px 10px;
  background: rgba(244, 164, 96, 0.1);
  border: 1px solid var(--color-border-warm);
  color: var(--color-text-primary);
  border-radius: 999px;
  white-space: nowrap;
}
.item-pill:hover {
  border-color: var(--color-flame);
  box-shadow: 0 0 10px rgba(244, 164, 96, 0.25);
}
.item-pill.is-arming-trap-disarm {
  border-color: var(--color-enemy);
  color: #ffd5d5;
  box-shadow: 0 0 14px rgba(168, 58, 58, 0.45);
}
.items-helper {
  font-size: 12px;
  color: var(--color-text-muted);
}
.items-helper.danger {
  color: #ffd5d5;
}

@media (max-width: 480px) {
  .stage { padding: 8px 10px; }
  .stage-title { letter-spacing: 0.04em; }
  .player-card { gap: 10px; }
  .card-icon { font-size: 22px; }
  .card-name { font-size: 12px; }
}

@media (max-height: 600px) {
  .rail-row.dist-2 { opacity: 0.3; transform: scale(0.86); }
  .rail-row.dist-1 { opacity: 0.6; transform: scale(0.92); }
  .player-card { padding: 6px 12px; }
}

/* ---------- Animation Effects ---------- */
@keyframes damage-screen-flash {
  0%, 100% { box-shadow: none; }
  35% { box-shadow: inset 0 0 0 9999px rgba(168, 58, 58, 0.22); }
}

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

.stage.is-damage-flashing,
.is-damage-flashing .stage {
  animation: damage-screen-flash 0.26s ease-out;
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
`
