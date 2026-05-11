/**
 * Unmelting - Main game loop
 *
 * Per-turn flow:
 *   1. Empty-rail analysis/refill → cards fall into holes before control returns
 *   2. Active-row regroup → adjacent same-type cards merge before turn start
 *   3. Player phase → player picks a card. In flickering / extinguished
 *      ember tiers the enemy phase fires BEFORE the player phase.
 *   4. Event phase → enemy attacks and treasure volatility resolve together
 *   5. Ember decay countdown ticks; chain resets; cleanup runs
 *
 * Chain combos: every hand card the player USES extends an active chain.
 * Whenever the chain's multiset contains a recipe, that recipe fires as an
 * additional bonus effect. The chain resets on a board action or turn end.
 */

import { GameState } from '@core/GameState'
import { TurnManager } from '@core/TurnManager'
import {
  GameBoardRenderer,
  CardActionDetail,
  ItemActionDetail,
  ActivityLogEntry,
} from '@ui/GameBoardRenderer'
import { CardSpawner } from '@systems/CardSpawner'
import { ActionSystem, ActionType } from '@systems/ActionSystem'
import { DropSystem } from '@systems/DropSystem'
import { HandSystem, ChainState } from '@systems/HandSystem'
import { EmberSystem } from '@systems/EmberSystem'
import { Card, CardType } from '@entities/Card'
import { LANE_DISTANCE_COUNT } from '@entities/Lane'
import { HandCardId, HandCategory } from '@entities/HandCard'
import { getHandCardDef } from '@data/HandCards'
import type { BurstTheme } from '@ui/SquareBurst'
import { FontManager } from '@ui/FontManager'
import { candleIcon } from '@ui/Icons'
import { SpriteUrls } from '@ui/Sprites'
import okDanDanBoldUrl from './assets/fonts/OkDanDanBold.woff2'

console.log('🕯 Unmelting starting...')

const app = document.getElementById('app')!
app.innerHTML = `
  <div id="game-board"></div>
`

FontManager.initializeDefaults()
FontManager.loadCustomFont({
  family: 'OkDanDan',
  url: okDanDanBoldUrl,
  weight: '100 900',
})
FontManager.setPrimaryFamily(`'OkDanDan', 'Georgia', 'Times New Roman', serif`)

document.body.style.backgroundImage =
  `linear-gradient(180deg, rgba(20, 16, 28, 0.55), rgba(8, 5, 14, 0.86)),` +
  `radial-gradient(ellipse at top, rgba(244, 164, 96, 0.18), transparent 65%),` +
  `url('${SpriteUrls.background}')`
document.body.style.backgroundSize = 'cover, cover, cover'
document.body.style.backgroundPosition = 'center, center top, center'
document.body.style.backgroundRepeat = 'no-repeat'
document.body.style.backgroundAttachment = 'fixed'

const gameState = new GameState()
const turnManager = new TurnManager(gameState)
const cardSpawner = new CardSpawner()
const boardRenderer = new GameBoardRenderer('game-board')

let gameActive = true
let inputLocked = false
let chain: ChainState = HandSystem.newChain()
/**
 * UI-side timeline of chain events. Mirrors `chain.sequence` for the cards
 * but also interleaves fired recipes in the exact order they happened so the
 * banner can read like "small candle → wax shield → ✦ Wax Rush → ...".
 * The renderer keys animations on each event's uid so a new addition pops in
 * without re-animating already-shown items.
 */
type ChainTimelineEvent =
  | { kind: 'card'; defId: HandCardId; name: string; category: HandCategory; uid: string }
  | { kind: 'recipe'; recipeId: string; name: string; flavor: string; uid: string }
let chainTimeline: ChainTimelineEvent[] = []
let chainEventCounter = 0
function nextChainUid(): string {
  chainEventCounter += 1
  return `c${chainEventCounter}`
}
function clearChainTimeline(): void {
  chainTimeline = []
}
/** Currently armed targeted hand card: waits for a board click to consume. */
let pendingHandTarget: { slotIndex: number; defId: HandCardId } | null = null

const SCORE_SPEND_COST = 250
const MAX_ACTIVITY_LOGS = 80
let score = 0
let scorePulseKey = 0
let nextActivityLogId = 1
let activityLogs: ActivityLogEntry[] = []

type ActivityLogDraft = Omit<ActivityLogEntry, 'id'>

function pushActivityLogsInDisplayOrder(logs: ActivityLogDraft[]): void {
  if (logs.length === 0) return
  const stampedLogs = logs.map((log) => ({
    id: nextActivityLogId++,
    ...log,
  }))
  activityLogs = [...stampedLogs, ...activityLogs].slice(0, MAX_ACTIVITY_LOGS)
}

/** Map a hand-card category to its SquareBurst palette. */
function burstThemeForCategory(cat: HandCategory): BurstTheme {
  switch (cat) {
    case 'recovery':
      return 'hand-recovery'
    case 'tool':
      return 'hand-tool'
    case 'control':
      return 'hand-control'
    case 'attack':
      return 'hand-attack'
  }
}

/** Score gain pulse — burst over the score number panel. */
function burstScoreGain(): void {
  const anchor = boardRenderer.findScorePulseAnchor()
  if (anchor) boardRenderer.burstAtElement(anchor, 'score', { count: 16, spread: 90 })
}

function createItemGainLogs(itemNames: string[]): ActivityLogDraft[] {
  return itemNames.map((name) => ({
    label: `손패 획득: ${name}`,
    itemCount: 1,
    kind: 'item-gain',
  }))
}

function getTurnScoreMultiplier(): number {
  return 1 + gameState.getCurrentTurn() * 0.08
}

function scoreForCardAction(
  card: Card,
  result: { cardRemoved: boolean },
): number {
  if (!result.cardRemoved) return 12
  if (card.type === CardType.ENEMY) {
    if (card.isSpecialEnemy)
      return 100 + card.groupCount * 80 + card.defeatDropCount * 25
    if (card.groupCount >= 3) return 450
    if (card.groupCount === 2) return 220
    return 80
  }
  if (card.type === CardType.TRAP) {
    if (card.groupCount >= 3) return 420
    if (card.groupCount === 2) return 140
    return 55
  }
  if (card.type === CardType.TREASURE)
    return 55 * Math.max(1, Math.min(3, card.groupCount))
  return 10
}

function activityKindForCard(card: Card): ActivityLogEntry['kind'] {
  if (card.type === CardType.ENEMY) return 'enemy'
  if (card.type === CardType.TRAP) return 'trap'
  return 'treasure'
}

function createScoreLog(
  label: string,
  baseValue: number,
  kind: ActivityLogEntry['kind'],
): ActivityLogDraft {
  const amount = Math.max(1, Math.round(baseValue * getTurnScoreMultiplier()))
  score += amount
  scorePulseKey++
  return { label, scoreDelta: amount, kind }
}

function recordScoreSpend(label: string, spent: number): ActivityLogDraft {
  score = Math.max(0, score - spent)
  scorePulseKey++
  return {
    label,
    scoreDelta: -spent,
    kind: 'score' as const,
  }
}

function actionTypeFor(cardType: CardType): ActionType | null {
  switch (cardType) {
    case CardType.ENEMY:
      return ActionType.ATTACK_ENEMY
    case CardType.TRAP:
      return ActionType.EVADE_TRAP
    case CardType.TREASURE:
      return ActionType.TAKE_TREASURE
    default:
      return null
  }
}

function syncSpawnerTier(): void {
  cardSpawner.setTier(turnManager.getEmberTier())
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

function compactAndRefillAllLanes(): boolean {
  const moved = gameState.compactLanes()
  fillEmptyTopSlots()
  return moved
}

function fillBoardAtStart(): void {
  syncSpawnerTier()
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

function grantStarterHand(): void {
  // Seed the hand with a small variety so all four categories are reachable
  // immediately. Player can begin experimenting with combos from turn 1.
  const seed: HandCardId[] = [
    'small-candle',
    'wax-shield',
    'matchstick',
    'cooled-candle',
    'match-bundle',
  ]
  for (const id of seed) {
    if (!gameState.character.hasHandRoom()) break
    HandSystem.enqueueDrop(gameState.character, DropSystem.makeCard(id))
  }
}

function startGame(): void {
  gameActive = true
  inputLocked = false
  chain = HandSystem.newChain()
  pendingHandTarget = null
  gameState.reset()
  score = 0
  scorePulseKey = 0
  nextActivityLogId = 1
  activityLogs = []
  syncSpawnerTier()
  grantStarterHand()
  fillBoardAtStart()
  boardRenderer.setHandTargetingMode(null)
  boardRenderer.clearSelection()
  render()
}

function buildChainHints() {
  return { events: chainTimeline }
}

function render(): void {
  const tier = turnManager.getEmberTier()
  boardRenderer.render(gameState, {
    score,
    logs: activityLogs,
    canSpend: score >= SCORE_SPEND_COST,
    spendCost: SCORE_SPEND_COST,
    scorePulseKey,
    emberTier: tier,
    spawnWeights: cardSpawner.getActiveWeights(),
    emberDecayCountdown: gameState.character.emberDecayCountdown,
    vignetteIntensity: EmberSystem.getVignetteIntensity(tier),
    chainHints: buildChainHints(),
    pendingHandTarget,
  })
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

type NoticeLogKind = 'info' | 'win' | 'hurt' | 'melt' | 'recipe'

function createNoticeLog(
  message: string,
  kind: NoticeLogKind = 'info',
): ActivityLogDraft {
  const badgeByKind: Record<NoticeLogKind, string> = {
    info: '알림',
    win: '완료',
    hurt: '위험',
    melt: '녹임',
    recipe: '조합',
  }
  const logKind: ActivityLogEntry['kind'] =
    kind === 'info'
      ? 'notice'
      : kind === 'recipe'
        ? 'melt'
        : kind === 'melt'
          ? 'melt'
          : kind
  return { label: message, badge: badgeByKind[kind], kind: logKind }
}

function recordNotice(message: string, kind: NoticeLogKind = 'info'): void {
  pushActivityLogsInDisplayOrder([createNoticeLog(message, kind)])
}

document.addEventListener('cardAction', (e: Event) => {
  void handleCardAction(e)
})

document.addEventListener('itemAction', (e: Event) => {
  const detail = (e as CustomEvent<ItemActionDetail>).detail
  void handleHandSlotClick(detail.itemIndex)
})

document.addEventListener('chainReset', () => {
  if (chain.sequence.length === 0 && chainTimeline.length === 0) return
  HandSystem.resetChain(chain)
  clearChainTimeline()
  recordNotice('체인 초기화', 'info')
  render()
})

document.addEventListener('scoreSpend', () => {
  handleScoreSpend()
})

function handleScoreSpend(): void {
  if (!gameActive || inputLocked || score < SCORE_SPEND_COST) return

  const itemCount = Math.max(
    1,
    Math.min(5, Math.floor(score / SCORE_SPEND_COST)),
  )
  const spent = itemCount * SCORE_SPEND_COST
  const gainedItems: string[] = []
  let dropped = 0
  for (let i = 0; i < itemCount; i++) {
    const drop = DropSystem.generateDrop()
    if (HandSystem.enqueueDrop(gameState.character, drop)) {
      gainedItems.push(getHandCardDef(drop.defId).name)
    } else {
      dropped++
    }
  }

  pushActivityLogsInDisplayOrder([
    ...createItemGainLogs(gainedItems),
    recordScoreSpend(`점수 변환: 손패 ${itemCount}개`, spent),
  ])
  if (dropped > 0) recordNotice(`손패 ${dropped}장 못 받음 (가득 참)`, 'hurt')
  render()
}

/** Click on a hand slot. Plain click = use single (or arm targeting). */
async function handleHandSlotClick(slotIndex: number): Promise<void> {
  if (!gameActive || inputLocked) return
  const character = gameState.character
  const card = character.hand[slotIndex]
  if (!card) return
  const def = getHandCardDef(card.defId)

  // Plain click on a targeted card arms it; second click cancels.
  if (def.needsTarget) {
    if (pendingHandTarget && pendingHandTarget.slotIndex === slotIndex) {
      pendingHandTarget = null
      boardRenderer.setHandTargetingMode(null)
      recordNotice(`${def.name} 사용 취소`, 'info')
      render()
      return
    }
    pendingHandTarget = { slotIndex, defId: def.id }
    boardRenderer.setHandTargetingMode({ slotIndex, defId: def.id })
    recordNotice(`${def.name}: 대상 카드를 선택해`, 'info')
    render()
    return
  }

  await applyHandSingle(slotIndex)
}

/** Apply a single-use hand card (with optional target). */
async function applyHandSingle(
  slotIndex: number,
  target?: { laneIndex: number; distance: number; card: Card },
): Promise<void> {
  inputLocked = true
  // Capture the card def BEFORE useSingle mutates the slot — we need the
  // category to pick a burst theme, and the slot is empty after consumption.
  const usedCard = gameState.character.hand[slotIndex]
  const usedDef = usedCard ? getHandCardDef(usedCard.defId) : null
  const result = HandSystem.useSingle(gameState, chain, slotIndex, target)
  if (!result.success) {
    recordNotice(result.message, 'hurt')
    inputLocked = false
    render()
    return
  }
  // Fire the per-category burst at the slot the card was consumed from.
  if (usedDef) {
    const slotEl = boardRenderer.findHandSlotElement(slotIndex)
    if (slotEl) {
      boardRenderer.burstAtElement(slotEl, burstThemeForCategory(usedDef.category), {
        count: 18,
        spread: 110,
      })
    }
  }
  // Append the just-used card to the on-screen chain timeline, then any
  // recipes that fired as a result. Order matches `chain.sequence`; recipes
  // are interleaved immediately after the card whose use satisfied them.
  if (usedDef) {
    chainTimeline.push({
      kind: 'card',
      defId: usedDef.id,
      name: usedDef.name,
      category: usedDef.category,
      uid: nextChainUid(),
    })
  }
  recordNotice(result.message, 'win')
  for (const merge of result.mergeMessages) {
    recordNotice(merge, 'melt')
  }
  for (const fired of result.firedRecipes) {
    recordNotice(`✦ ${fired.recipe.name}: ${fired.message}`, 'recipe')
    chainTimeline.push({
      kind: 'recipe',
      recipeId: fired.recipe.id,
      name: fired.recipe.name,
      flavor: fired.recipe.flavor,
      uid: nextChainUid(),
    })
  }
  pendingHandTarget = null
  boardRenderer.setHandTargetingMode(null)
  // Animate the "eaten" pop on every card removed by this hand use BEFORE
  // re-rendering. The DOM still shows the pre-mutation state at this point,
  // so the renderer can find the cells by data-card-id and play the consume
  // keyframe + themed SquareBurst on each.
  if (result.removedFieldCards.length > 0) {
    await boardRenderer.animateCardConsumeByIds(result.removedFieldCards)
  }
  // Refill after recipes that may have removed cards from the field. Wait
  // for the FLIP fall animation when something actually moved so the cards
  // visibly slide down into the gap (otherwise the rail "punches a hole").
  const moved = compactAndRefillAllLanes()
  gameState.regroupAllRows()
  render()
  if (moved) await wait(380)
  setTimeout(() => {
    inputLocked = false
  }, 200)
}

async function runCleanupPhase(advanceTurn: boolean): Promise<void> {
  if (advanceTurn) {
    gameState.nextTurn()
    // Reset chain on every turn boundary — the player should not be able to
    // hold an unbounded chain across many turns. Also clear the UI timeline
    // so the chain banner fades out at the same beat.
    HandSystem.resetChain(chain)
    clearChainTimeline()
    // Tick the ember decay countdown; ember decreases every 10th turn.
    const tickedDown = turnManager.tickEmberDecay()
    syncSpawnerTier()
    if (tickedDown) {
      const ember = gameState.character.ember
      recordNotice(`불씨가 사그라들었다 (${ember}/${gameState.character.emberMax})`, 'hurt')
    }
  }

  const moved = compactAndRefillAllLanes()
  render()
  if (moved) await wait(380)

  gameState.regroupAllRows()
  boardRenderer.clearSelection()
  render()
}

async function resolveEventPhaseAndPrepareNextTurn(): Promise<void> {
  const hits = turnManager.runEnemyPhase()
  const treasureChanges = turnManager.applyTreasureVolatility(cardSpawner)
  const eventAnimations: Promise<void>[] = []
  if (hits.length > 0)
    eventAnimations.push(boardRenderer.animateEnemyAttacks(hits))
  if (treasureChanges.length > 0) {
    eventAnimations.push(boardRenderer.animateTreasureChanges(treasureChanges))
  }
  if (eventAnimations.length > 0) await Promise.all(eventAnimations)

  const totalDamage = hits.reduce((acc, h) => acc + h.damage, 0)
  if (totalDamage > 0) {
    recordNotice(`적 공격! -${totalDamage}`, 'hurt')
    render()
    await boardRenderer.animateDamageFlash()
  }
  if (gameState.isGameOver) {
    finishTurn()
    return
  }

  await runCleanupPhase(true)

  setTimeout(() => {
    inputLocked = false
  }, 220)
}

/**
 * Resolve one player click as a deliberate turn timeline. In flickering and
 * extinguished tiers the enemy phase fires before the player phase.
 */
async function handleCardAction(e: Event): Promise<void> {
  if (!gameActive || inputLocked) return
  const detail = (e as CustomEvent<CardActionDetail>).detail
  const { laneIndex, distance, card } = detail

  if (distance !== 0) return

  const lane = gameState.getLane(laneIndex)
  if (!lane) return

  // Targeted hand card armed → board click feeds its target.
  if (pendingHandTarget !== null) {
    const armed = pendingHandTarget
    pendingHandTarget = null
    boardRenderer.setHandTargetingMode(null)
    await applyHandSingle(armed.slotIndex, { laneIndex, distance, card })
    return
  }

  const actionType = actionTypeFor(card.type)
  if (!actionType) return

  inputLocked = true

  if (turnManager.isEnemyFirstStrike()) {
    const hits = turnManager.runEnemyPhase()
    if (hits.length > 0) {
      await boardRenderer.animateEnemyAttacks(hits)
      const dmg = hits.reduce((acc, h) => acc + h.damage, 0)
      recordNotice(`불씨가 흔들려 적이 먼저 공격! -${dmg}`, 'hurt')
      render()
      if (!gameState.character.isAlive() || gameState.isGameOver) {
        finishTurn()
        return
      }
    }
  }

  if (card.type === CardType.ENEMY) {
    await boardRenderer.animatePlayerAttack(card)
  }
  const result = ActionSystem.executeAction(
    gameState.getCharacter(),
    lane,
    card,
    actionType,
  )
  if (result.success) {
    const gainedItems = result.itemGainedNames ?? []
    const actionLogs: ActivityLogDraft[] = [
      ...createItemGainLogs(gainedItems),
    ]
    if (gainedItems.length === 0) {
      actionLogs.push(
        createNoticeLog(result.message, result.damageTaken ? 'hurt' : 'info'),
      )
    }
    const scoreDelta = scoreForCardAction(card, result)
    actionLogs.push(
      createScoreLog(
        `${card.name} 선택`,
        scoreDelta,
        activityKindForCard(card),
      ),
    )
    pushActivityLogsInDisplayOrder(actionLogs)
    if (scoreDelta > 0) burstScoreGain()
    if (result.overflow && result.overflow.length > 0) {
      recordNotice(`손패가 가득 차 ${result.overflow.length}장 잃음`, 'hurt')
    }
    // Run auto-merges in case a drop produced a triple.
    const merges = HandSystem.runAutoMerges(gameState.character)
    for (const m of merges) recordNotice(m, 'melt')
  }
  if (result.damageTaken && result.damageTaken > 0) {
    await boardRenderer.animateDamageFlash()
  }

  if (result.cardRemoved) {
    // Trap/treasure: play the "eaten" pop on every cell of this Card (the
    // merge-aware animator handles 2/3-cell groups too). The themed
    // SquareBurst fires from the visual center. THEN we mutate the model
    // and re-render so the card vanishes cleanly.
    if (card.type === CardType.TRAP || card.type === CardType.TREASURE) {
      await boardRenderer.animateCardConsume(card)
    }
    gameState.removeCardFromRow(card, distance)
    boardRenderer.clearSelection()
  }

  // Board action resets the chain so combos do not bleed across turns.
  HandSystem.resetChain(chain)
  clearChainTimeline()

  render()

  if (!gameState.character.isAlive()) {
    gameState.endGame('character_defeated')
    finishTurn()
    return
  }

  if (turnManager.isEnemyFirstStrike()) {
    const treasureChanges = turnManager.applyTreasureVolatility(cardSpawner)
    if (treasureChanges.length > 0) {
      await boardRenderer.animateTreasureChanges(treasureChanges)
    }
    await runCleanupPhase(true)
    setTimeout(() => {
      inputLocked = false
    }, 220)
  } else {
    await resolveEventPhaseAndPrepareNextTurn()
  }
}

function finishTurn(): void {
  gameActive = false
  render()
  setTimeout(showGameOver, 300)
}

function showGameOver(): void {
  const reason =
    gameState.gameOverReason === 'character_defeated'
      ? '소녀의 심지가 꺼졌어요…'
      : gameState.gameOverReason === 'instant_death_trap'
        ? '모든 길이 함정으로 막혔어요.'
        : '게임 종료'

  const overlay = document.createElement('div')
  overlay.className = 'game-over-overlay'
  overlay.innerHTML = `
    <div class="game-over-card">
      <div class="game-over-icon">${candleIcon()}</div>
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
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--color-flame);
    font-size: 48px;
    line-height: 1;
    filter: drop-shadow(0 0 12px rgba(255, 215, 120, 0.5));
    margin-bottom: 8px;
  }
  .game-over-icon .icon { width: 1em; height: 1em; }
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
