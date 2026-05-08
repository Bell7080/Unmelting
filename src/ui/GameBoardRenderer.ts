/**
 * GameBoardRenderer - 3분할 레이아웃
 * 좌우는 비우고 중앙에 게임보드
 * 1클릭: 선택 (하이라이트), 더블클릭: 액션
 */

import { GameState } from '@core/GameState'
import { CardType } from '@entities/Card'

export class GameBoardRenderer {
  private boardElement: HTMLElement
  private selectedCard: { laneIndex: number; distance: number } | null = null

  constructor(containerId: string = 'game-board') {
    const container = document.getElementById(containerId)
    if (!container) {
      throw new Error(`Container ${containerId} not found`)
    }
    this.boardElement = container
  }

  render(gameState: GameState): void {
    const character = gameState.getCharacter()
    const lanes = gameState.getLanes()
    const turn = gameState.getCurrentTurn()

    this.boardElement.innerHTML = `
      <div class="three-column-layout">
        <!-- 좌측: 비움 -->
        <div class="column left"></div>

        <!-- 중앙: 게임보드 -->
        <div class="column center">
          <div class="game-center">
            <!-- 플레이어 정보 (상단) -->
            <div class="player-info-box">
              <div class="player-name">🕯️ ${character.name}</div>
              <div class="player-stats">
                <div class="stat">❤️ ${character.stats.health}/${character.stats.maxHealth}</div>
              </div>
              <div class="turn-info">Turn: ${turn}</div>
            </div>

            <!-- 게임 보드 (3 레인) -->
            <div class="game-board">
              ${lanes.map((lane, i) => this.renderLane(lane, i, gameState)).join('')}
            </div>

            <!-- 힌트/상태 정보 -->
            <div class="game-info-box">
              <div class="info-label">⚔️ Power Level: Click cards to interact</div>
            </div>
          </div>
        </div>

        <!-- 우측: 비움 -->
        <div class="column right"></div>
      </div>
    `

    this.addStyles()
    this.attachEventListeners(gameState)
  }

  private renderLane(lane: any, laneIndex: number, _gameState: GameState): string {
    const slots = []
    for (let distance = 0; distance < 4; distance++) {
      const card = lane.getCardAtDistance(distance)
      const isSelected =
        !!this.selectedCard &&
        this.selectedCard.laneIndex === laneIndex &&
        this.selectedCard.distance === distance

      if (card) {
        const cardHtml = this.renderCard(card, laneIndex, distance, isSelected as boolean)
        slots.push(cardHtml)
      } else {
        slots.push(`<div class="card-slot empty"></div>`)
      }
    }

    return `
      <div class="lane" data-lane="${laneIndex}">
        ${slots.join('')}
      </div>
    `
  }

  private renderCard(card: any, laneIndex: number, distance: number, isSelected: boolean): string {
    const classList = ['card-slot', 'card', `type-${card.type}`, isSelected ? 'selected' : '']
      .filter(Boolean)
      .join(' ')

    let content = ''
    if (card.type === CardType.ENEMY) {
      content = `
        <div class="card-content">
          <div class="card-name">${card.name}</div>
          <div class="card-stats">
            <div class="stat">❤️ ${card.health || 0}</div>
            <div class="stat">⚔️ ${card.power || 0}</div>
          </div>
        </div>
      `
    } else if (card.type === CardType.OBSTACLE) {
      content = `
        <div class="card-content">
          <div class="card-name">🔓 ${card.name}</div>
        </div>
      `
    } else {
      content = `
        <div class="card-content">
          <div class="card-name">💰 ${card.name}</div>
        </div>
      `
    }

    return `<div class="${classList}" data-lane="${laneIndex}" data-distance="${distance}">${content}</div>`
  }

  private attachEventListeners(gameState: GameState): void {
    const cardElements = this.boardElement.querySelectorAll('.card')

    cardElements.forEach((el) => {
      // 1클릭: 선택
      el.addEventListener('click', (e) => {
        e.stopPropagation()
        const laneIndex = parseInt((el as HTMLElement).dataset.lane || '0')
        const distance = parseInt((el as HTMLElement).dataset.distance || '0')

        // 이전 선택 해제
        this.boardElement.querySelectorAll('.card.selected').forEach((c) => {
          c.classList.remove('selected')
        })

        // 새로 선택
        this.selectedCard = { laneIndex, distance }
        ;(el as HTMLElement).classList.add('selected')
      })

      // 더블클릭: 액션 실행
      el.addEventListener('dblclick', (e) => {
        e.stopPropagation()
        const laneIndex = parseInt((el as HTMLElement).dataset.lane || '0')
        const distance = parseInt((el as HTMLElement).dataset.distance || '0')
        const lane = gameState.getLane(laneIndex)
        const card = lane?.getCardAtDistance(distance)

        if (card) {
          // ActionUI와 동일하게 액션 실행 트리거
          const event = new CustomEvent('cardAction', {
            detail: { laneIndex, distance, card },
          })
          document.dispatchEvent(event)
        }
      })
    })
  }

  private addStyles(): void {
    if (document.getElementById('game-board-styles')) return

    const style = document.createElement('style')
    style.id = 'game-board-styles'
    style.textContent = `
      .three-column-layout {
        display: grid;
        grid-template-columns: 1fr 2fr 1fr;
        width: 100%;
        height: 100vh;
        gap: 16px;
        padding: 16px;
      }

      .column {
        display: flex;
        flex-direction: column;
      }

      .column.left, .column.right {
        background: transparent;
      }

      .column.center {
        background: var(--color-bg-secondary);
        border: 2px solid #f4a460;
        border-radius: 8px;
        padding: 16px;
        overflow-y: auto;
      }

      .game-center {
        display: flex;
        flex-direction: column;
        gap: 16px;
        height: 100%;
      }

      .player-info-box {
        background: var(--color-bg-primary);
        border: 2px solid #f4a460;
        border-radius: 8px;
        padding: 12px;
        text-align: center;
      }

      .player-name {
        font-size: var(--font-size-lg);
        font-weight: bold;
        color: #f4a460;
        margin-bottom: 8px;
      }

      .player-stats {
        display: flex;
        gap: 16px;
        justify-content: center;
        margin-bottom: 8px;
      }

      .stat {
        font-size: var(--font-size-base);
        color: #e8e8e8;
      }

      .turn-info {
        font-size: var(--font-size-sm);
        color: #aaa;
      }

      .game-board {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 8px;
        overflow-y: auto;
      }

      .lane {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 6px;
        height: 90px;
      }

      .card-slot {
        background: var(--color-card-bg);
        border: 2px solid var(--color-card-border);
        border-radius: 6px;
        padding: 8px;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        cursor: pointer;
        transition: all 0.2s;
        min-height: 80px;
      }

      .card-slot.empty {
        background: transparent;
        border: 1px dashed #666;
        cursor: default;
      }

      .card-slot.card {
        background: linear-gradient(135deg, #2a3d5a 0%, #1a2332 100%);
        border: 2px solid #f4a460;
        cursor: pointer;
      }

      .card-slot.card:hover {
        border-color: #ff8c42;
        box-shadow: 0 0 8px rgba(244, 164, 96, 0.3);
        transform: translateY(-2px);
      }

      .card-slot.selected {
        border-color: #ff8c42;
        box-shadow: 0 0 12px rgba(255, 140, 66, 0.6);
        background: linear-gradient(135deg, #3a5d7a 0%, #2a3d5a 100%);
      }

      .card-slot.type-enemy {
        border-color: #c73e3e;
      }

      .card-slot.type-trap {
        border-color: #8b7e3e;
      }

      .card-slot.type-treasure {
        border-color: #3e8b6f;
      }

      .card-content {
        width: 100%;
        text-align: center;
        position: relative;
      }

      .card-name {
        font-size: var(--font-size-sm);
        font-weight: bold;
        color: #f4a460;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .card-stats {
        display: flex;
        gap: 4px;
        justify-content: center;
        font-size: var(--font-size-sm);
        color: #ccc;
        margin-top: 2px;
      }

      .group-badge {
        position: absolute;
        top: 2px;
        right: 4px;
        background: #ff8c42;
        color: #000;
        padding: 2px 6px;
        border-radius: 3px;
        font-size: 10px;
        font-weight: bold;
      }

      .game-info-box {
        background: var(--color-bg-primary);
        border: 2px solid #f4a460;
        border-radius: 8px;
        padding: 12px;
        text-align: center;
      }

      .info-label {
        font-size: var(--font-size-sm);
        color: #aaa;
      }
    `
    document.head.appendChild(style)
  }
}
