/**
 * GameBoardRenderer - MVP: Renders 3 lanes with cards
 * Simple HTML/CSS based renderer
 */

import { GameState } from '@core/GameState'
import { Card, CardType } from '@entities/Card'
import { Lane } from '@entities/Lane'

export class GameBoardRenderer {
  private boardElement: HTMLElement

  constructor(containerId: string = 'game-board') {
    const container = document.getElementById(containerId)
    if (!container) {
      throw new Error(`Container ${containerId} not found`)
    }
    this.boardElement = container
  }

  render(gameState: GameState): void {
    this.boardElement.innerHTML = `
      <div class="game-container">
        <div class="game-info">
          <div class="turn-counter">Turn: ${gameState.currentTurn}</div>
          <div class="player-health">
            <span class="health-label">Health:</span>
            <span class="health-value">${gameState.character.health}/${gameState.character.maxHealth}</span>
          </div>
        </div>

        <div class="game-board">
          ${gameState.lanes.map((lane, i) => this.renderLane(lane, i)).join('')}
          <div class="player-area">
            <div class="player-card">⚔️</div>
          </div>
        </div>

        <div class="inventory">
          <div class="inventory-label">Items (${gameState.character.items.length})</div>
          <div class="item-list">
            ${gameState.character.items.map((item, i) => `<div class="item" data-index="${i}">${item}</div>`).join('')}
          </div>
        </div>
      </div>
    `
    this.addStyles()
  }

  private renderLane(lane: Lane, laneIndex: number): string {
    const cards = lane.cards
    const cardElements = cards
      .map((card, distance) => {
        if (!card) return `<div class="card-slot empty"></div>`
        return this.renderCard(card, laneIndex, distance)
      })
      .join('')

    return `
      <div class="lane" data-lane-index="${laneIndex}">
        <div class="cards-container">
          ${cardElements}
        </div>
      </div>
    `
  }

  private renderCard(card: Card, laneIndex: number, distance: number): string {
    const typeClass = card.type
    const color = this.getCardColor(card.type)
    const stats = this.getCardStats(card)

    return `
      <div
        class="card-slot card ${typeClass}"
        data-lane="${laneIndex}"
        data-distance="${distance}"
        data-card-id="${card.id}"
        style="background-color: ${color};"
      >
        <div class="card-name">${card.name}</div>
        ${stats}
        ${card.groupCount > 1 ? `<div class="card-group">x${card.groupCount}</div>` : ''}
      </div>
    `
  }

  private getCardColor(type: CardType): string {
    switch (type) {
      case CardType.ENEMY:
        return '#8b3a3a'
      case CardType.TRAP:
        return '#4a3a2a'
      case CardType.TREASURE:
        return '#6b5a2a'
      default:
        return '#3a4a5a'
    }
  }

  private getCardStats(card: Card): string {
    if (card.type === CardType.ENEMY) {
      return `
        <div class="card-stats">
          <span class="stat health">❤️ ${card.getHealth()}</span>
          <span class="stat damage">⚔️ ${card.getDamage()}</span>
        </div>
      `
    }
    return ''
  }

  private addStyles(): void {
    // Check if styles already added
    if (document.getElementById('game-board-styles')) return

    const style = document.createElement('style')
    style.id = 'game-board-styles'
    style.textContent = `
      .game-container {
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100vh;
        background-color: var(--color-bg-primary);
        color: var(--color-text-primary);
        font-family: 'Courier New', monospace;
      }

      .game-info {
        padding: 16px 24px;
        border-bottom: 1px solid var(--color-card-border);
        display: flex;
        gap: 32px;
        font-size: var(--font-size-base);
      }

      .turn-counter, .player-health {
        display: flex;
        gap: 8px;
        align-items: center;
      }

      .health-value {
        font-weight: bold;
        color: #ff8c42;
      }

      .game-board {
        flex: 1;
        display: grid;
        grid-template-columns: 1fr 80px;
        gap: 24px;
        padding: 24px;
        overflow-y: auto;
      }

      .game-board > div:not(.player-area) {
        display: flex;
      }

      .lane {
        flex: 1;
        border: 1px solid var(--color-card-border);
        border-radius: 8px;
        padding: 12px;
        background-color: var(--color-bg-secondary);
      }

      .cards-container {
        display: grid;
        grid-template-rows: repeat(4, 1fr);
        gap: 8px;
        height: 100%;
      }

      .card-slot {
        padding: 12px;
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 4px;
        background-color: var(--color-card-bg);
        min-height: 80px;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        text-align: center;
        position: relative;
        font-size: var(--font-size-sm);
      }

      .card-slot.empty {
        background-color: transparent;
        border: 1px dashed rgba(255, 255, 255, 0.1);
      }

      .card-name {
        font-weight: bold;
        margin-bottom: 4px;
        font-size: var(--font-size-base);
      }

      .card-stats {
        display: flex;
        gap: 8px;
        font-size: var(--font-size-sm);
      }

      .stat {
        display: flex;
        align-items: center;
        gap: 2px;
      }

      .card-group {
        position: absolute;
        top: 4px;
        right: 4px;
        background-color: rgba(0, 0, 0, 0.5);
        padding: 2px 6px;
        border-radius: 3px;
        font-size: 10px;
        font-weight: bold;
      }

      .player-area {
        display: flex;
        align-items: center;
        justify-content: center;
        border: 2px solid #f4a460;
        border-radius: 8px;
        background-color: var(--color-bg-secondary);
        padding: 12px;
      }

      .player-card {
        font-size: 48px;
      }

      .inventory {
        border-top: 1px solid var(--color-card-border);
        padding: 16px 24px;
        background-color: var(--color-bg-secondary);
      }

      .inventory-label {
        font-size: var(--font-size-base);
        font-weight: bold;
        margin-bottom: 8px;
      }

      .item-list {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .item {
        background-color: var(--color-card-bg);
        padding: 6px 12px;
        border-radius: 4px;
        border: 1px solid var(--color-card-border);
        font-size: var(--font-size-sm);
        cursor: pointer;
        transition: all 0.2s;
      }

      .item:hover {
        background-color: #3a5a7a;
      }

      .card.enemy {
        border: 2px solid #ff8c42;
      }

      .card.trap {
        border: 2px solid #ff6b6b;
      }

      .card.treasure {
        border: 2px solid #ffd700;
      }
    `
    document.head.appendChild(style)
  }
}
