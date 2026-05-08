/**
 * Unmelting - Main game loop
 *
 * UX:
 *   - Vertical 3-lane × 3-row rail.
 *   - Only the active (bottom) row is interactive.
 *   - 1st click highlights, 2nd click executes the action implied by the
 *     card's type (Enemy = attack, Trap = evade, Treasure = take).
 *   - Cards descend each turn; new cards spawn at the top.
 */

import { GameState } from '@core/GameState'
import { TurnManager } from '@core/TurnManager'
import { GameBoardRenderer, CardActionDetail } from '@ui/GameBoardRenderer'
import { CardSpawner } from '@systems/CardSpawner'
import { ActionSystem, ActionType } from '@systems/ActionSystem'
import { CardType } from '@entities/Card'
import { LANE_DISTANCE_COUNT } from '@entities/Lane'
import { FontManager } from '@ui/FontManager'

console.log('🕯 Unmelting starting...')

const app = document.getElementById('app')!
app.innerHTML = `
  <div id="game-board"></div>
  <div id="toast-host"></div>
`

FontManager.initializeDefaults()

const gameState = new GameState()
const turnManager = new TurnManager(gameState)
const cardSpawner = new CardSpawner()
const boardRenderer = new GameBoardRenderer('game-board')

let gameActive = true
let inputLocked = false

function actionTypeFor(cardType: CardType): ActionType | null {
  switch (cardType) {
    case CardType.ENEMY: return ActionType.ATTACK_ENEMY
    case CardType.TRAP: return ActionType.EVADE_TRAP
    case CardType.TREASURE: return ActionType.TAKE_TREASURE
    default: return null
  }
}

function spawnRow(): void {
  const cards = cardSpawner.spawnCardsForTurn()
  const topDistance = LANE_DISTANCE_COUNT - 1
  for (let i = 0; i < 3; i++) {
    const lane = gameState.getLane(i)
    const card = cards[i]
    if (lane && card) {
      lane.addCardAtDistance(topDistance, card)
    }
  }
}

function fillBoardAtStart(): void {
  // Pre-populate every row so the player sees the active bottom row plus
  // two upcoming rows from turn 1.
  for (let distance = 0; distance < LANE_DISTANCE_COUNT; distance++) {
    const cards = cardSpawner.spawnCardsForTurn()
    for (let i = 0; i < 3; i++) {
      const lane = gameState.getLane(i)
      const card = cards[i]
      if (lane && card) {
        lane.addCardAtDistance(distance, card)
      }
    }
  }
}

function startGame(): void {
  gameActive = true
  inputLocked = false
  gameState.reset()
  fillBoardAtStart()
  boardRenderer.clearSelection()
  render()
}

function render(): void {
  boardRenderer.render(gameState)
}

function showToast(message: string, kind: 'info' | 'win' | 'hurt' = 'info'): void {
  const host = document.getElementById('toast-host')
  if (!host) return
  const toast = document.createElement('div')
  toast.className = `toast toast-${kind}`
  toast.textContent = message
  host.appendChild(toast)
  setTimeout(() => toast.classList.add('show'), 10)
  setTimeout(() => {
    toast.classList.remove('show')
    setTimeout(() => toast.remove(), 250)
  }, 1400)
}

document.addEventListener('cardAction', (e: Event) => {
  if (!gameActive || inputLocked) return
  const detail = (e as CustomEvent<CardActionDetail>).detail
  const { laneIndex, card } = detail

  const lane = gameState.getLane(laneIndex)
  if (!lane) return

  const actionType = actionTypeFor(card.type)
  if (!actionType) return

  inputLocked = true
  const result = ActionSystem.executeAction(gameState.getCharacter(), lane, card, actionType)
  showToast(result.message, result.damageTaken ? 'hurt' : 'info')

  // Brief delay so the player can register the action before the world advances
  setTimeout(() => {
    endTurn()
    inputLocked = false
  }, 220)
})

function endTurn(): void {
  if (!gameActive) return

  turnManager.endPlayerTurn()

  if (gameState.isGameOver) {
    gameActive = false
    boardRenderer.render(gameState)
    showGameOver()
    return
  }

  spawnRow()
  boardRenderer.clearSelection()
  render()
}

function showGameOver(): void {
  const overlay = document.createElement('div')
  overlay.className = 'game-over-overlay'
  const reason =
    gameState.gameOverReason === 'character_defeated' ? '소녀의 심지가 꺼졌어요…' :
    gameState.gameOverReason === 'instant_death_trap' ? '함정에 모두 막혀 빛이 사라졌어요.' :
    '게임 종료'
  overlay.innerHTML = `
    <div class="game-over-card">
      <div class="game-over-icon">🕯</div>
      <h1>${reason}</h1>
      <p>버틴 턴: <strong>${gameState.getCurrentTurn()}</strong></p>
      <button class="primary-btn" id="restart-btn">다시 시작</button>
    </div>
  `
  document.body.appendChild(overlay)
  document.getElementById('restart-btn')?.addEventListener('click', () => {
    overlay.remove()
    startGame()
  })
}

// Inject global UI styles (toast + game over)
const globalStyle = document.createElement('style')
globalStyle.textContent = `
  #toast-host {
    position: fixed;
    top: 16px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    gap: 6px;
    z-index: 50;
    pointer-events: none;
  }
  .toast {
    background: rgba(31, 24, 48, 0.92);
    border: 1px solid var(--color-border-warm);
    color: var(--color-text-primary);
    padding: 8px 16px;
    border-radius: 999px;
    font-size: var(--font-size-sm);
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.4);
    opacity: 0;
    transform: translateY(-8px);
    transition: opacity 0.2s ease, transform 0.2s ease;
  }
  .toast.show { opacity: 1; transform: translateY(0); }
  .toast-hurt { border-color: var(--color-enemy); color: #ffd5c5; }
  .toast-win  { border-color: var(--color-treasure); color: #fff5d0; }

  .game-over-overlay {
    position: fixed;
    inset: 0;
    background: rgba(8, 5, 14, 0.82);
    backdrop-filter: blur(6px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    animation: fade-in 0.3s ease;
  }
  @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
  .game-over-card {
    text-align: center;
    background: linear-gradient(160deg, rgba(31, 24, 48, 0.95), rgba(20, 16, 28, 0.95));
    padding: 28px 36px;
    border: 1px solid var(--color-flame-warm);
    border-radius: 16px;
    box-shadow: 0 0 40px rgba(244, 164, 96, 0.2);
    max-width: 360px;
  }
  .game-over-icon {
    font-size: 48px;
    filter: drop-shadow(0 0 12px rgba(255, 215, 120, 0.5));
    margin-bottom: 8px;
  }
  .game-over-card h1 {
    font-size: var(--font-size-lg);
    color: var(--color-flame);
    margin-bottom: 6px;
    font-weight: 600;
  }
  .game-over-card p {
    color: var(--color-text-muted);
    font-size: var(--font-size-base);
    margin-bottom: 20px;
  }
  .primary-btn {
    padding: 10px 22px;
    background: linear-gradient(180deg, var(--color-flame-warm), var(--color-flame-deep));
    border: 1px solid var(--color-flame);
    color: var(--color-text-dark);
    font-weight: 700;
    font-size: var(--font-size-base);
    border-radius: 999px;
    cursor: pointer;
    transition: transform 0.15s ease, box-shadow 0.15s ease;
  }
  .primary-btn:hover {
    transform: translateY(-1px);
    box-shadow: 0 6px 18px rgba(244, 164, 96, 0.4);
  }
  .primary-btn:active { transform: translateY(0); }
`
document.head.appendChild(globalStyle)

startGame()
