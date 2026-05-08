/**
 * Unmelting Game - MVP: Main Game Loop
 */

import { GameState } from '@core/GameState'
import { TurnManager } from '@core/TurnManager'
import { GameBoardRenderer } from '@ui/GameBoardRenderer'
import { ActionUI } from '@ui/ActionUI'
import { CardSpawner } from '@systems/CardSpawner'
import { ActionSystem } from '@systems/ActionSystem'
import { FontManager } from '@ui/FontManager'

console.log('🕯️ Unmelting Game Starting...')

// Initialize game
const gameState = new GameState()
const turnManager = new TurnManager(gameState)
const cardSpawner = new CardSpawner()
const boardRenderer = new GameBoardRenderer('app')
const actionUI = new ActionUI('app')
let gameActive = true

// Create app container with two sections
const app = document.getElementById('app')!
app.innerHTML = `
  <div id="game-board" style="flex: 1;"></div>
  <div id="action-ui" style="position: fixed; bottom: 0; left: 0; right: 0; background: var(--color-bg-primary);"></div>
  <div id="turn-button-panel" style="position: fixed; bottom: 100px; right: 24px; z-index: 100;"></div>
`

// Initialize fonts
FontManager.initializeDefaults()

/**
 * Start a new game
 */
function startGame(): void {
  gameActive = true
  gameState.reset()
  spawnInitialCards()
  render()
}

/**
 * Spawn cards at the farthest distance (distance 3) for first turn
 */
function spawnInitialCards(): void {
  const cards = cardSpawner.spawnCardsForTurn()
  for (let i = 0; i < 3; i++) {
    const lane = gameState.getLane(i)!
    const card = cards[i]
    if (card && !lane.addCardAtDistance(3, card)) {
      console.warn(`Could not add card to lane ${i}`)
    }
  }
}

/**
 * Add new cards at distance 3 each turn
 */
function spawnNewCards(): void {
  const cards = cardSpawner.spawnCardsForTurn()
  for (let i = 0; i < 3; i++) {
    const lane = gameState.getLane(i)!
    const card = cards[i]
    if (card && !lane.addCardAtDistance(3, card)) {
      console.warn(`Could not add card to lane ${i}`)
    }
  }
}

/**
 * Render game state
 */
function render(): void {
  boardRenderer.render(gameState)
  attachCardClickListeners()
  updateTurnButton()
}

/**
 * Attach click listeners to cards
 */
function attachCardClickListeners(): void {
  const cardElements = document.querySelectorAll('.card-slot.card')
  cardElements.forEach((element) => {
    element.addEventListener('click', (e) => {
      e.preventDefault()
      const laneIndex = parseInt((element as HTMLElement).dataset.lane || '0')
      const distance = parseInt((element as HTMLElement).dataset.distance || '0')
      const lane = gameState.getLane(laneIndex)!
      const card = lane.getCardAtDistance(distance)

      if (card && gameActive) {
        actionUI.showActions(laneIndex, card)
      }
    })
  })
}

/**
 * Handle player action
 */
actionUI.onAction((laneIndex, card, actionType) => {
  if (!gameActive) return

  const lane = gameState.getLane(laneIndex)!
  const result = ActionSystem.executeAction(gameState.character, lane, card, actionType)

  console.log(`${result.message}`)

  // Small delay for visual feedback
  setTimeout(() => {
    endTurn()
  }, 300)
})

/**
 * End player's turn: advance cards, process collisions, spawn new cards
 */
function endTurn(): void {
  if (!gameActive) return

  // Advance cards and process collisions
  turnManager.endPlayerTurn()

  // Check if game over
  if (gameState.isGameOver) {
    gameActive = false
    console.log(`Game Over: ${gameState.gameOverReason}`)
    showGameOverScreen()
    return
  }

  // Spawn new cards for this lane
  spawnNewCards()

  // Re-render
  render()
}

/**
 * Update turn button
 */
function updateTurnButton(): void {
  const panel = document.getElementById('turn-button-panel')!
  if (!gameActive) {
    panel.innerHTML = `
      <button id="restart-btn" class="turn-btn">Start New Game</button>
    `
    const restartBtn = document.getElementById('restart-btn')
    if (restartBtn) {
      restartBtn.addEventListener('click', startGame)
    }
  } else {
    panel.innerHTML = `
      <div style="text-align: right; color: #f4a460; font-size: var(--font-size-base); margin-bottom: 8px;">
        Click a card to act
      </div>
    `
  }
}

/**
 * Show game over screen
 */
function showGameOverScreen(): void {
  const overlay = document.createElement('div')
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
  `

  const content = document.createElement('div')
  content.style.cssText = `
    background: var(--color-bg-secondary);
    padding: 32px;
    border-radius: 8px;
    text-align: center;
    border: 2px solid #f4a460;
  `

  const reason = gameState.gameOverReason === 'character_defeated' ? 'You were defeated!' : 'Game Over!'
  const turns = gameState.currentTurn

  content.innerHTML = `
    <h1 style="font-size: 32px; color: #f4a460; margin-bottom: 16px;">💀 ${reason}</h1>
    <p style="font-size: 18px; margin-bottom: 24px;">Survived ${turns} turns</p>
    <button id="game-over-restart" class="turn-btn" style="padding: 12px 24px; font-size: 16px;">Play Again</button>
  `

  overlay.appendChild(content)
  document.body.appendChild(overlay)

  const restartBtn = document.getElementById('game-over-restart')
  if (restartBtn) {
    restartBtn.addEventListener('click', () => {
      overlay.remove()
      startGame()
    })
  }
}

/**
 * Add turn button styles
 */
const turnBtnStyle = document.createElement('style')
turnBtnStyle.textContent = `
  .turn-btn {
    padding: 12px 24px;
    background-color: #2a3d5a;
    border: 2px solid #f4a460;
    color: var(--color-text-primary);
    border-radius: 4px;
    cursor: pointer;
    font-size: var(--font-size-base);
    font-weight: bold;
    transition: all 0.2s;
  }

  .turn-btn:hover {
    background-color: #3a5d7a;
    border-color: #ff8c42;
    transform: scale(1.05);
  }

  .turn-btn:active {
    transform: scale(0.98);
  }
`
document.head.appendChild(turnBtnStyle)

// Start the game!
startGame()
