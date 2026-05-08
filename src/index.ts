/**
 * Unmelting - Main game loop
 *
 * Per-turn flow:
 *   1. Empty-rail analysis/refill → cards fall into holes before control returns
 *   2. Active-row regroup → adjacent same-type cards merge before turn start
 *   3. Player phase → player picks a card (1st click highlights, 2nd executes)
 *   4. Event phase → enemy attacks and treasure volatility resolve together
 *   5. Turn end → board prepares the next turn-start cleanup page
 */

import { GameState } from '@core/GameState'
import { TurnManager } from '@core/TurnManager'
import { GameBoardRenderer, CardActionDetail, ItemActionDetail } from '@ui/GameBoardRenderer'
import { CardSpawner } from '@systems/CardSpawner'
import { ActionSystem, ActionType } from '@systems/ActionSystem'
import { DropSystem } from '@systems/DropSystem'
import { Card, CardType } from '@entities/Card'
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
let pendingTrapDisarmItemIndex: number | null = null

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
function compactAndRefillAllLanes(): boolean {
  const moved = gameState.compactLanes()
  fillEmptyTopSlots()
  return moved
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

function grantStarterItems(): void {
  // Give one of each current item so every item mechanic is testable from turn 1.
  for (const item of DropSystem.getItemPool()) {
    gameState.character.addItem(item.name)
  }
}

function startGame(): void {
  gameActive = true
  inputLocked = false
  gameState.reset()
  grantStarterItems()
  fillBoardAtStart()
  pendingTrapDisarmItemIndex = null
  boardRenderer.setTrapDisarmMode(null)
  boardRenderer.clearSelection()
  render()
}

function render(): void {
  boardRenderer.render(gameState)
}

/** Pause turn resolution so CSS/Web Animations can read as intentional beats. */
function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
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
  void handleCardAction(e)
})

document.addEventListener('itemAction', (e: Event) => {
  handleItemAction((e as CustomEvent<ItemActionDetail>).detail.itemIndex)
})

/** Apply a hand item or arm a targeted item mode without spending a turn. */
function handleItemAction(itemIndex: number): void {
  if (!gameActive || inputLocked) return
  const itemName = gameState.character.items[itemIndex]
  if (!itemName) return

  const item = DropSystem.getItemByName(itemName)
  if (!item) {
    showToast(`${itemName}은(는) 아직 효과가 없어`, 'info')
    render()
    return
  }

  // Wax shield is a targeting mode: click again to cancel, or pick a trap to destroy.
  if (item.effect === 'trap-disarm') {
    pendingTrapDisarmItemIndex = pendingTrapDisarmItemIndex === itemIndex ? null : itemIndex
    boardRenderer.setTrapDisarmMode(pendingTrapDisarmItemIndex)
    showToast(
      pendingTrapDisarmItemIndex === null ? '밀랍 방패 선택 취소' : '밀랍 방패: 파괴할 함정을 선택',
      pendingTrapDisarmItemIndex === null ? 'info' : 'hurt'
    )
    render()
    return
  }

  // Using a different item cancels any armed shield so item indices stay valid.
  pendingTrapDisarmItemIndex = null
  boardRenderer.setTrapDisarmMode(null)

  const removedItemName = gameState.character.removeItem(itemIndex)
  if (!removedItemName) return
  DropSystem.applyItem(item, (effect, value = 0) => {
    if (effect === 'heal') gameState.character.heal(value)
    if (effect === 'damage-boost') gameState.character.applyDamageBoost()
  })
  showToast(`${item.name} 사용: ${item.description}`, 'win')
  render()
}

/** Run the cleanup page: compact gaps, refill top slots, then merge active cards. */
async function runCleanupPhase(advanceTurn: boolean): Promise<void> {
  // Normal card actions consume the playing turn; free item cleanup does not.
  if (advanceTurn) gameState.nextTurn()

  const moved = compactAndRefillAllLanes()
  render()
  if (moved) await wait(380)

  // Regroup after movement has settled so 3-card trap merges can animate too.
  gameState.regroupAllRows()
  boardRenderer.clearSelection()
  render()
}

/** Destroy a trap with a selected wax shield, then run cleanup without play events. */
async function handleTrapDisarm(distance: number, card: Card): Promise<void> {
  inputLocked = true
  const itemName = gameState.character.removeItem(pendingTrapDisarmItemIndex ?? -1)
  pendingTrapDisarmItemIndex = null
  boardRenderer.setTrapDisarmMode(null)
  if (!itemName) {
    inputLocked = false
    render()
    return
  }

  gameState.removeCardFromRow(card, distance)
  boardRenderer.clearSelection()
  showToast(`${itemName}: ${card.name} 파괴`, 'win')
  await runCleanupPhase(false)

  setTimeout(() => {
    inputLocked = false
  }, 220)
}

/** Resolve enemy/treasure events and then run the next turn-start cleanup page. */
async function resolveEventPhaseAndPrepareNextTurn(): Promise<void> {
  // Event phase — enemy attacks and treasure volatility are processed together.
  const hits = turnManager.runEnemyPhase()
  const treasureChanges = turnManager.applyTreasureVolatility(cardSpawner)
  const eventAnimations: Promise<void>[] = []
  if (hits.length > 0) eventAnimations.push(boardRenderer.animateEnemyAttacks(hits))
  if (treasureChanges.length > 0) {
    eventAnimations.push(boardRenderer.animateTreasureChanges(treasureChanges))
  }
  if (eventAnimations.length > 0) await Promise.all(eventAnimations)

  const totalDamage = hits.reduce((acc, h) => acc + h.damage, 0)
  if (totalDamage > 0) {
    showToast(`적 공격! -${totalDamage}`, 'hurt')
    await boardRenderer.animateDamageFlash()
  }
  if (gameState.isGameOver) {
    finishTurn()
    return
  }

  // Playing-card actions consume the turn, then run the cleanup page.
  await runCleanupPhase(true)

  setTimeout(() => {
    inputLocked = false
  }, 220)
}

/**
 * Resolve one player click as a deliberate turn timeline: player action first,
 * then enemy/treasure events, then the rail falls and merges for next turn.
 */
async function handleCardAction(e: Event): Promise<void> {
  if (!gameActive || inputLocked) return
  const detail = (e as CustomEvent<CardActionDetail>).detail
  const { laneIndex, distance, card } = detail

  // Only the active row is interactive.
  if (distance !== 0) return

  const lane = gameState.getLane(laneIndex)
  if (!lane) return

  // Wax shield mode can only target traps; other cards are visually blocked.
  if (pendingTrapDisarmItemIndex !== null) {
    if (card.type !== CardType.TRAP) {
      showToast('밀랍 방패는 함정만 파괴할 수 있어', 'hurt')
      return
    }
    await handleTrapDisarm(distance, card)
    return
  }

  const actionType = actionTypeFor(card.type)
  if (!actionType) return

  inputLocked = true

  // Player phase — enemy cards pop upward only when the player strikes.
  if (card.type === CardType.ENEMY) {
    await boardRenderer.animatePlayerAttack(card)
  }
  const result = ActionSystem.executeAction(
    gameState.getCharacter(),
    lane,
    card,
    actionType
  )
  showToast(result.message, result.damageTaken ? 'hurt' : 'info')
  if (result.damageTaken && result.damageTaken > 0) {
    await boardRenderer.animateDamageFlash()
  }

  // Resolved cards are removed now, but the rail does not fall until turn end.
  if (result.cardRemoved) {
    gameState.removeCardFromRow(card, distance)
    boardRenderer.clearSelection()
  }
  render()

  // Trap damage can still defeat the character immediately after its animation.
  if (!gameState.character.isAlive()) {
    gameState.endGame('character_defeated')
    finishTurn()
    return
  }

  await resolveEventPhaseAndPrepareNextTurn()
}

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
