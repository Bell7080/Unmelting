/**
 * Unmelting - Main game loop
 *
 * Per-turn flow:
 *   1. Player phase  → player picks a card (1st click highlights, 2nd executes)
 *      • Enemy = player strikes first
 *      • Trap  = player steps on it (takes penalty)
 *      • Treasure = player banks the rewards
 *   2. Refill        → only the lane(s) the player resolved collapse + spawn
 *      a fresh card at the top. Other lanes stay put.
 *   3. Enemy phase   → bottom-row enemies still alive strike the player
 *   4. Treasure roll → 50% disappear / 10% mimic conversion per treasure
 *   5. Hazard check  → all-trap active row = instant death
 *   6. Re-group rows → adjacent same-type cards merge into one
 *   7. nextTurn
 */

import { GameState } from '@core/GameState'
import { TurnManager } from '@core/TurnManager'
import { GameBoardRenderer, CardActionDetail } from '@ui/GameBoardRenderer'
import { CardSpawner } from '@systems/CardSpawner'
import { ActionSystem, ActionType } from '@systems/ActionSystem'
import { CardType } from '@entities/Card'
import { LANE_DISTANCE_COUNT } from '@entities/Lane'
import { FontManager } from '@ui/FontManager'
import okDanDanBoldUrl from './assets/fonts/OkDanDanBold.woff2'

console.log('🕯 Unmelting starting...')

const app = document.getElementById('app')!
app.innerHTML = `
  <div id="game-board"></div>
  <div id="toast-host"></div>
`

FontManager.initializeDefaults()
FontManager.loadCustomFont({
  family: 'OkDanDan',
  url: okDanDanBoldUrl,
  weight: '100 900',
})
FontManager.setPrimaryFamily(`'OkDanDan', 'Georgia', 'Times New Roman', serif`)

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

function fillEmptyTopSlots(): void {
  const topDistance = LANE_DISTANCE_COUNT - 1
  for (let i = 0; i < gameState.lanes.length; i++) {
    const lane = gameState.lanes[i]
    if (!lane.getCardAtDistance(topDistance)) {
      const fresh = cardSpawner.spawnCardsForTurn()
      lane.setCardAtDistance(topDistance, fresh[0])
    }
  }
}

/**
 * Drop every card down to fill any holes within a lane, then top-up the rail.
 * Used after treasure volatility (or any board mutation) so a vanished card
 * does not leave a gap in the active row.
 */
function compactAndRefillAllLanes(): void {
  for (let i = 0; i < gameState.lanes.length; i++) {
    const lane = gameState.lanes[i]
    // Repeatedly shift down until no holes remain below a card.
    let safety = LANE_DISTANCE_COUNT
    while (safety-- > 0) {
      let didShift = false
      for (let d = 0; d < LANE_DISTANCE_COUNT - 1; d++) {
        if (!lane.getCardAtDistance(d) && lane.getCardAtDistance(d + 1)) {
          lane.setCardAtDistance(d, lane.getCardAtDistance(d + 1))
          lane.setCardAtDistance(d + 1, null)
          didShift = true
        }
      }
      if (!didShift) break
    }
  }
  fillEmptyTopSlots()
}

function fillBoardAtStart(): void {
  for (let distance = 0; distance < LANE_DISTANCE_COUNT; distance++) {
    const cards = cardSpawner.spawnCardsForTurn()
    for (let i = 0; i < gameState.lanes.length; i++) {
      const lane = gameState.lanes[i]
      const card = cards[i]
      if (lane && card) {
        lane.setCardAtDistance(distance, card)
      }
    }
  }
  gameState.regroupAllRows()
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

function showToast(
  message: string,
  kind: 'info' | 'win' | 'hurt' = 'info'
): void {
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
  }, 1600)
}

document.addEventListener('cardAction', (e: Event) => {
  if (!gameActive || inputLocked) return
  const detail = (e as CustomEvent<CardActionDetail>).detail
  const { laneIndex, distance, card } = detail

  // Only the active row is interactive.
  if (distance !== 0) return

  const lane = gameState.getLane(laneIndex)
  if (!lane) return

  const actionType = actionTypeFor(card.type)
  if (!actionType) return

  inputLocked = true

  // 1. Player phase
  const result = ActionSystem.executeAction(
    gameState.getCharacter(),
    lane,
    card,
    actionType
  )
  showToast(result.message, result.damageTaken ? 'hurt' : 'info')

  // 2. Refill: every lane the resolved card occupied collapses + gets a fresh top card
  if (result.cardRemoved) {
    gameState.removeCardFromRow(card, distance)
    compactAndRefillAllLanes()
  }

  // Player's strike already might have killed them through enemy counter-attack
  if (!gameState.character.isAlive()) {
    gameState.endGame('character_defeated')
    finishTurn()
    return
  }

  // 3. Enemy phase
  const hits = turnManager.runEnemyPhase()
  if (hits.length > 0) {
    const total = hits.reduce((acc, h) => acc + h.damage, 0)
    showToast(`적 공격! -${total}`, 'hurt')
  }
  if (gameState.isGameOver) {
    finishTurn()
    return
  }

  // 4. Treasure volatility — vanished treasures leave holes; drop everything down + refill top
  turnManager.applyTreasureVolatility(cardSpawner)
  compactAndRefillAllLanes()

  // 5. Hazard check
  if (turnManager.checkHazardLoss()) {
    finishTurn()
    return
  }

  // 6. Regroup
  gameState.regroupAllRows()

  // 7. nextTurn
  gameState.nextTurn()
  boardRenderer.clearSelection()
  render()

  setTimeout(() => {
    inputLocked = false
  }, 200)
})

function finishTurn(): void {
  gameActive = false
  render()
  setTimeout(showGameOver, 300)
}

function showGameOver(): void {
  const reason =
    gameState.gameOverReason === 'character_defeated' ? '소녀의 심지가 꺼졌어요…' :
    gameState.gameOverReason === 'instant_death_trap' ? '모든 길이 함정으로 막혔어요.' :
    '게임 종료'

  const overlay = document.createElement('div')
  overlay.className = 'game-over-overlay'
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
    max-width: calc(100vw - 24px);
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
    text-align: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
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
    padding: 16px;
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
    width: 100%;
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
    font-family: inherit;
  }
  .primary-btn:hover {
    transform: translateY(-1px);
    box-shadow: 0 6px 18px rgba(244, 164, 96, 0.4);
  }
  .primary-btn:active { transform: translateY(0); }
`
document.head.appendChild(globalStyle)

startGame()
