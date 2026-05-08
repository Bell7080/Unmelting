/**
 * GameBoardRenderer - Vertical 3x3 lane grid + player card below
 *
 * Layout (top → bottom):
 *   row distance 2  (farthest, faintest)   [□] [□] [□]
 *   row distance 1  (mid, dimmed)          [□] [□] [□]
 *   row distance 0  (active, full opacity) [○] [○] [○]
 *                          🕯  Player Card
 *
 * Interaction:
 *   1st click  → card glows (selected)
 *   2nd click  → action executes (no popup)
 */

import { GameState } from '@core/GameState'
import { Card, CardType } from '@entities/Card'
import { Lane, LANE_DISTANCE_COUNT } from '@entities/Lane'

export interface CardActionDetail {
  laneIndex: number
  distance: number
  card: Card
}

export class GameBoardRenderer {
  private boardElement: HTMLElement
  private selected: { laneIndex: number; distance: number } | null = null
  private currentGameState: GameState | null = null

  constructor(containerId: string = 'game-board') {
    const container = document.getElementById(containerId)
    if (!container) {
      throw new Error(`Container ${containerId} not found`)
    }
    this.boardElement = container
  }

  render(gameState: GameState): void {
    this.currentGameState = gameState
    const character = gameState.getCharacter()
    const lanes = gameState.getLanes()
    const turn = gameState.getCurrentTurn()

    // Clear selection if the selected card is gone
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
          <div class="rail">
            ${this.renderRail(lanes)}
          </div>

          ${this.renderPlayer(character)}

          ${this.renderItems(character)}
        </main>
      </div>
    `

    this.injectStyles()
    this.attachListeners()
  }

  private renderRail(lanes: Lane[]): string {
    // Render rows from farthest (top) to closest (bottom)
    const rows: string[] = []
    for (let distance = LANE_DISTANCE_COUNT - 1; distance >= 0; distance--) {
      rows.push(this.renderRow(lanes, distance))
    }
    return rows.join('')
  }

  private renderRow(lanes: Lane[], distance: number): string {
    const rowClass = `rail-row dist-${distance}` + (distance === 0 ? ' active' : ' upcoming')
    const cells = lanes
      .map((lane, laneIndex) => this.renderCell(lane, laneIndex, distance))
      .join('')
    return `<div class="${rowClass}">${cells}</div>`
  }

  private renderCell(lane: Lane, laneIndex: number, distance: number): string {
    const card = lane.getCardAtDistance(distance)
    if (!card) {
      return `<div class="cell empty" aria-hidden="true"></div>`
    }

    const isActive = distance === 0
    const isSelected =
      !!this.selected &&
      this.selected.laneIndex === laneIndex &&
      this.selected.distance === distance

    const classes = [
      'cell',
      'card',
      `type-${card.type}`,
      isActive ? 'is-active' : 'is-preview',
      isSelected ? 'is-selected' : '',
    ]
      .filter(Boolean)
      .join(' ')

    return `
      <div class="${classes}"
           data-lane="${laneIndex}"
           data-distance="${distance}"
           role="button"
           tabindex="${isActive ? '0' : '-1'}">
        ${this.renderCardFace(card)}
      </div>
    `
  }

  private renderCardFace(card: Card): string {
    const icon = this.iconFor(card.type)
    const stats = card.type === CardType.ENEMY
      ? `<div class="card-stats">
           <span class="stat hp">❤ ${card.getHealth()}</span>
           <span class="stat atk">⚔ ${card.getDamage()}</span>
         </div>`
      : ''

    const groupBadge = card.groupCount > 1
      ? `<div class="group-badge">×${card.groupCount}</div>`
      : ''

    return `
      <div class="card-face">
        ${groupBadge}
        <div class="card-icon">${icon}</div>
        <div class="card-name">${card.name}</div>
        ${stats}
      </div>
    `
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
    const hpPct = Math.max(0, Math.min(100, (character.health / character.maxHealth) * 100))
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
      .map((item: string) => `<div class="item-pill">${item}</div>`)
      .join('')
    return `
      <div class="items-row">
        <div class="items-label">📦 손패 (${character.items.length})</div>
        <div class="items-list">${badges}</div>
      </div>
    `
  }

  private attachListeners(): void {
    // Only the active row (distance 0) is interactive
    const activeCards = this.boardElement.querySelectorAll<HTMLElement>('.cell.card.is-active')
    activeCards.forEach((el) => {
      el.addEventListener('click', (e) => {
        e.stopPropagation()
        const laneIndex = parseInt(el.dataset.lane || '0', 10)
        const distance = parseInt(el.dataset.distance || '0', 10)
        this.handleCardClick(el, laneIndex, distance)
      })
    })
  }

  private handleCardClick(el: HTMLElement, laneIndex: number, distance: number): void {
    const isAlreadySelected =
      !!this.selected &&
      this.selected.laneIndex === laneIndex &&
      this.selected.distance === distance

    if (isAlreadySelected) {
      // Second click → execute action
      this.dispatchAction(laneIndex, distance)
      return
    }

    // First click → highlight
    this.boardElement.querySelectorAll('.cell.card.is-selected').forEach((c) => {
      c.classList.remove('is-selected')
    })
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

  clearSelection(): void {
    this.selected = null
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
  height: 100%;
  display: grid;
  grid-template-rows: auto 1fr;
  padding: 16px clamp(16px, 4vw, 48px) 24px;
  gap: 12px;
  max-width: 720px;
  margin: 0 auto;
}

.stage-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 4px 12px;
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
  gap: 16px;
  align-content: stretch;
}

/* ----- Rail (3x3 grid) ----- */
.rail {
  display: grid;
  grid-template-rows: repeat(3, 1fr);
  gap: 10px;
  padding: 12px;
  background:
    linear-gradient(180deg, rgba(31, 24, 48, 0.4) 0%, rgba(31, 24, 48, 0.7) 100%);
  border: 1px solid var(--color-border-soft);
  border-radius: 12px;
  position: relative;
  overflow: hidden;
}

.rail::before {
  /* candlelight wash from the bottom */
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
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  position: relative;
  z-index: 1;
}

.rail-row.dist-2 { opacity: 0.35; transform: scale(0.9); transform-origin: center; }
.rail-row.dist-1 { opacity: 0.65; transform: scale(0.95); transform-origin: center; }
.rail-row.dist-0 { opacity: 1; }

/* ----- Cell / Card ----- */
.cell {
  aspect-ratio: 3 / 4;
  border-radius: 10px;
  border: 1px dashed var(--color-border-soft);
  background: rgba(255, 255, 255, 0.015);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  transition: all 0.25s ease;
  min-height: 0;
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
  transform: translateY(-2px);
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

/* Card type accents (left wax-seal stripe) */
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

.card-face {
  width: 100%;
  height: 100%;
  display: grid;
  grid-template-rows: 1fr auto auto;
  align-items: center;
  justify-items: center;
  padding: 8px 6px 10px;
  text-align: center;
  position: relative;
}

.card-icon {
  font-size: clamp(24px, 4vw, 36px);
  line-height: 1;
  filter: drop-shadow(0 1px 0 rgba(0, 0, 0, 0.2));
}

.card-name {
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--color-text-dark);
  line-height: 1.2;
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
}

.card-stats .stat.hp { color: #8b1f1f; }
.card-stats .stat.atk { color: #5a3a14; }

.group-badge {
  position: absolute;
  top: -6px;
  right: -6px;
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

/* ----- Player Card ----- */
.player-row {
  display: flex;
  justify-content: center;
  padding: 4px 0;
}

.player-card {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 14px;
  align-items: center;
  padding: 12px 18px;
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
  font-size: clamp(28px, 4vw, 40px);
  filter: drop-shadow(0 0 8px rgba(255, 215, 120, 0.6));
  line-height: 1;
}

.player-info {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.player-name {
  font-size: var(--font-size-base);
  font-weight: 600;
  color: var(--color-flame);
  letter-spacing: 0.04em;
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
}

/* ----- Items / Inventory ----- */
.items-row {
  padding: 10px 14px;
  background: rgba(31, 24, 48, 0.5);
  border: 1px solid var(--color-border-soft);
  border-radius: 10px;
  display: grid;
  gap: 8px;
}

.items-row.empty {
  text-align: center;
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
  font-size: 12px;
  padding: 4px 10px;
  background: rgba(244, 164, 96, 0.1);
  border: 1px solid var(--color-border-warm);
  color: var(--color-text-primary);
  border-radius: 999px;
}

@media (max-width: 480px) {
  .stage { padding: 12px 12px 18px; }
  .rail { padding: 8px; gap: 8px; }
  .rail-row { gap: 8px; }
  .card-icon { font-size: 22px; }
}
`
