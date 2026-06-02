/**
 * Unmelting - Main game loop
 *
 * Per-turn flow:
 *   1. Empty-rail analysis/refill → cards fall into holes before control returns
 *   2. Active-row regroup → adjacent same-type cards merge before turn start
 *   3. Player phase → player picks a card. In flickering / extinguished
 *      ember tiers the enemy phase fires BEFORE the player phase.
 *   4. Event phase → enemy attacks plus treasure/bomb/flower timers resolve
 *      against the pre-drop board
 *   5. Ember decay countdown ticks; chain resets; cleanup runs
 *   6. Post-drop spore spread infects cards that actually fell into neighbors
 *
 * Chain combos: every hand card the player USES extends an active chain.
 * Whenever the chain's multiset contains a recipe, that recipe fires as an
 * additional bonus effect. The chain resets on a board action or turn end.
 */

import { GameState } from '@core/GameState'
import { TurnManager } from '@core/TurnManager'
import { BossEventController } from '@core/BossEvent'
import {
  GameBoardRenderer,
  CardActionDetail,
  ItemActionDetail,
  ActivityLogEntry,
  ShopBuyDetail,
  ShopOfferView,
  ShopPackItemView,
  ShopPackKind,
  ShopPackPickDetail,
  ShopPackPickerView,
  ShopStateView,
  type ResourceTrailTarget,
} from '@ui/GameBoardRenderer'
import { CardSpawner } from '@systems/CardSpawner'
import { ActionSystem, ActionType } from '@systems/ActionSystem'
import { DropSystem } from '@systems/DropSystem'
import { HandSystem, ChainState } from '@systems/HandSystem'
import { EmberSystem } from '@systems/EmberSystem'
import { Card, CardType } from '@entities/Card'
import { LANE_DISTANCE_COUNT } from '@entities/Lane'
import { CandleMode } from '@entities/Character'
import { HandCardId, HandCategory } from '@entities/HandCard'
import { getHandCardDef, HAND_CARD_IDS } from '@data/HandCards'
import { getRelicDef, RELIC_IDS, type RelicId } from '@data/Relics'
import { RunCardPool } from '@core/RunCardPool'
import { COMBO_TRIGGER_DELAY_MS, GAUGE_TRIGGER_DELAY_MS, MAX_ACTIVITY_LOGS } from '@core/Timing'
import {
  RARITY_DRAW_WEIGHTS,
  sampleWeightedWithoutReplacement,
  sampleWithoutReplacement,
} from '@core/Sampling'
import { HAND_CARD_RARITY, SHOP_PACK_LABELS, SHOP_PACK_POOLS } from '@data/ShopPools'
import { BASIC_PACK_POOL } from '@data/BasicPackPool'
import { TRIAL_DEFINITIONS, type TrialEffectKind } from '@data/Trials'
import { buildUnlockedUpgradePool } from '@systems/UpgradePackPool'
import { buildUnlockedEnhancePool } from '@systems/EnhancePackPool'
import { SquareBurst, type BurstTheme } from '@ui/SquareBurst'
import { FontManager } from '@ui/FontManager'
import { candleIcon } from '@ui/Icons'
import { SpriteUrls, spriteForHandCard, spriteForBasicPackItem, spriteForUpgradePackItem } from '@ui/Sprites'
import { SpeechBubble } from '@ui/SpeechBubble'
import { BgmManager } from '@/audio/BgmManager'
import bgm001Url from './assets/audio/bgm_001.mp3'
import bgm002Url from './assets/audio/bgm_002.mp3'
import bgm003Url from './assets/audio/bgm_003.mp3'
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
// 배경음: 3트랙을 무작위 순서로 크로스페이드 연결, 첫 입력에서 자동재생.
const bgm = new BgmManager([bgm001Url, bgm002Url, bgm003Url])
const speechBubble = new SpeechBubble({ anchor: '.player-card', offsetX: 150, tail: 'bottom-left', fontSize: 22 })
const bossBubble   = new SpeechBubble({ anchor: '.cell.type-boss', offsetX: 40, offsetY: 70, tail: 'bottom-left', theme: 'boss', autoDismissMs: 0 })
let gameActive = true
let inputLocked = false
let chain: ChainState = HandSystem.newChain()
/**
 * UI-side timeline of chain events. Mirrors `chain.sequence` for the cards
 * but also interleaves fired recipes in the exact order they happened so the
 * banner can read like "촛농 → 양초 → ✦ 밀랍 돌진 → ...".
 * The renderer keys animations on each event's uid so a new addition pops in
 * without re-animating already-shown items.
 */
type ChainTimelineEvent =
  | { kind: 'card'; defId: HandCardId; name: string; category: HandCategory; uid: string }
  | { kind: 'recipe'; recipeId: string; name: string; flavor: string; uid: string }
  | { kind: 'gauge'; mode: CandleMode; name: string; flavor: string; uid: string }
  | { kind: 'relic'; relicId: RelicId; name: string; flavor: string; uid: string }
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

let score = 0
let coins = 0
let scorePulseKey = 0
let coinPulseKey = 0
let nextActivityLogId = 1
let activityLogs: ActivityLogEntry[] = []
let shopOpen = false
let currentShopOffers: ShopOfferView[] = []
let shopRerollCount = 0
let shopBasicPackBuys = 0
let shopUpgradePackBuys = 0
let shopUnlockPackBuys = 0
let freeCardClaimed = false
let freeCoinCardClaimed = false

// 공용 무료카드(선물 상자)는 방문마다 하나의 랜덤 효과로 고정한다.
type ShopFreeGiftKind = 'score-300' | 'coin-1' | 'health-5' | 'gauge-3' | 'ember-3' | 'hand-2'

/** 선물 상자 보상 표기 소스. 항목을 추가해도 랜덤 추첨 주석/개수가 자동으로 따라간다. */
const SHOP_FREE_GIFT_REWARDS: Record<ShopFreeGiftKind, { description: string; amount: number }> = {
  'score-300': { description: '✦300', amount: 300 },
  'coin-1': { description: '1$', amount: 1 },
  'health-5': { description: '체력 5', amount: 5 },
  'gauge-3': { description: '콤보 게이지 3', amount: 3 },
  'ember-3': { description: '불씨 게이지 3', amount: 3 },
  'hand-2': { description: '랜덤 손패 2', amount: 2 },
}
const SHOP_FREE_GIFT_KINDS = Object.keys(SHOP_FREE_GIFT_REWARDS) as ShopFreeGiftKind[]
let freeGiftKind: ShopFreeGiftKind = 'coin-1'
let currentShopMode: 'shop' | 'altar' = 'shop'
/** Active pack-picker session. Holds the rolled items + the pack kind so the
 *  shopPackPick handler can look the picked item up and apply its effect. */
interface ActivePackSession {
  kind: ShopPackKind
  items: ShopPackPickItem[]
}
interface ShopPackPickItem extends ShopPackItemView {
  /** Applied when the player picks this card. Coins/score may be mutated
   *  through closures, hence the void return + async wrapper. */
  apply: () => Promise<void> | void
}
let activePackSession: ActivePackSession | null = null
/** Run-length target and milestone placeholders for future boss/trial system. */
const RUN_TARGET_TURNS = 100
let altarBossPending = false
let altarBossDefeated = false
let trialPending = false
/** 90F 보스+시련 후 활성화: 별빛 칸을 먹은 행동만 90~100층 턴을 올린다. */
let finalAscentStarlightRuleActive = false
/** 보스/시련의 영속 modifier: 이번 런 내내 스폰/스탯/함정 계산에 누적된다.
 *  apply 시 CardSpawner.setTrialModifiers로도 동기화돼야 실제 스폰에 반영된다. */
const runModifiers = {
  enemyHpBonus: 0,
  enemyDamageBonus: 0,
  trapDamageBonus: 0,
  /** 보물상자 스폰 가중치 배율. '가난' 누적 시마다 0.75를 곱한다. */
  treasureSpawnScale: 1,
}
/** 사람 친화적 요약 한 줄: 적+1/1, 함정+1, 보물x0.75 같은 식으로. */
function formatTrialSummary(prefix: string): string {
  return `${prefix} · 적+${runModifiers.enemyHpBonus}/${runModifiers.enemyDamageBonus} · 함정+${runModifiers.trapDamageBonus} · 보물x${runModifiers.treasureSpawnScale.toFixed(2)}`
}
function syncFinalAscentRuleToSpawner(): void {
  cardSpawner.setFinalAscentActive(
    finalAscentStarlightRuleActive &&
      gameState.getCurrentTurn() >= 90 &&
      gameState.getCurrentTurn() < RUN_TARGET_TURNS
  )
}

function activateFinalAscentStarlightRule(): void {
  if (gameState.getCurrentTurn() !== 90 || finalAscentStarlightRuleActive) return
  // 셔터가 열린 직후부터 별빛만 층/턴 진행을 담당한다.
  finalAscentStarlightRuleActive = true
  syncFinalAscentRuleToSpawner()
  recordNotice('90층 이후 규칙 발동: 별빛을 모아야만 턴이 오른다', 'info')
}

function shouldAdvanceTurnForAction(starlightCollected: boolean): boolean {
  return !finalAscentStarlightRuleActive || starlightCollected
}

/** runModifiers의 현재 값을 CardSpawner로 흘려보내 다음 스폰부터 즉시 반영시킨다. */
function syncRunModifiersToSpawner(): void {
  cardSpawner.setTrialModifiers({
    enemyHpBonus: runModifiers.enemyHpBonus,
    enemyAtkBonus: runModifiers.enemyDamageBonus,
    trapDamageBonus: runModifiers.trapDamageBonus,
    treasureSpawnScale: runModifiers.treasureSpawnScale,
  })
}
/** effectKind 서술자를 런타임 apply()로 변환. runModifiers는 여기에 스코프돼 있으므로 index에서 해석한다. */
function applyTrialEffect(kind: TrialEffectKind): void {
  switch (kind.type) {
    case 'enemy-stat-bonus':
      runModifiers.enemyHpBonus += kind.hpBonus
      runModifiers.enemyDamageBonus += kind.atkBonus
      break
    case 'trap-damage-bonus':
      runModifiers.trapDamageBonus += kind.value
      break
    case 'treasure-spawn-scale':
      runModifiers.treasureSpawnScale = Math.max(0, runModifiers.treasureSpawnScale * kind.factor)
      break
  }
  syncRunModifiersToSpawner()
}

/** TRIAL_DEFINITIONS(src/data/Trials.ts)에서 파생. 일러스트는 trial_*.webp 파일 입고 시 spriteKey만 추가하면 된다. */
const FORCED_TRIAL_CARDS = TRIAL_DEFINITIONS.map((def) => ({
  id: def.id,
  title: def.title,
  effect: def.effect,
  spriteUrl: SpriteUrls.trials[def.spriteKey],
  apply: () => applyTrialEffect(def.effectKind),
}))
/** 메타 사당 해금(추후 저장소 연동) + 런 내 카드풀 분리를 위한 토대. */
// runLocked 카드는 런 시작 시 잠긴 상태로 출발해 해금팩으로만 획득 가능.
const metaUnlockedCardIds = HAND_CARD_IDS.filter((id) => !getHandCardDef(id).runLocked)
const runCardPool = new RunCardPool(HAND_CARD_IDS, metaUnlockedCardIds)
// 잠긴 카드가 드롭되지 않도록 초기 허용 풀을 동기화한다.
DropSystem.setAllowedPool(runCardPool.snapshot().unlocked)
boardRenderer.setLockedCardIds([...runCardPool.snapshot().locked, ...runCardPool.snapshot().banned])

// 보스 이벤트 컨트롤러 — 보스별 스탯/흐름/보상/시련을 모두 관리한다.
const bossController = new BossEventController(
  gameState, turnManager, boardRenderer, bossBubble, speechBubble, runCardPool, SpriteUrls,
  {
    setInputLocked: (v) => { inputLocked = v },
    addOneCoin: () => { coins += 1; coinPulseKey++; boardRenderer.playCoinGainFeedback(coins, coinPulseKey) },
    render: () => render(),
    clearChainTimeline: () => { clearChainTimeline(); boardRenderer.refreshChainBanner(buildChainHints()) },
    recordNotice: (msg, kind) => recordNotice(msg, kind),
    openTrialOverlayForced: () => openTrialOverlayForced(),
    applyRelicPurchaseEffect: (id) => applyRelicPurchaseEffect(id),
    handlePlayerDeath: async () => {
      if (await tryResolveHopeRevive()) return true
      gameState.endGame('character_defeated')
      finishTurn()
      return false
    },
  }
)
/** Dev-only command palette is temporary tooling and must be removed before release. */
const ENABLE_DEV_COMMAND_PALETTE = true

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

/** Score gain pulse — number tick, sparkle, and square burst all start on the
 *  currently visible panel so the reward value rises during the impact beat. */
function burstScoreGain(): void {
  boardRenderer.playScoreGainFeedback(score, scorePulseKey)
}

/** Coin gain pulse — mirrors score feedback, including ✦ ✧ ✦ sparkles and
 *  integer ticking, so shop currency no longer feels visually downgraded. */
function burstCoinGain(): void {
  boardRenderer.playCoinGainFeedback(coins, coinPulseKey)
}

interface FieldHealthSnapshotEntry {
  card: Card
  health: number
}

/** Snapshot enemy/boss HP before an effect so damage numbers can be derived after mutation. */
function snapshotFieldHealthState(): Map<string, FieldHealthSnapshotEntry> {
  const snapshot = new Map<string, FieldHealthSnapshotEntry>()
  for (const lane of gameState.lanes) {
    for (let distance = 0; distance < LANE_DISTANCE_COUNT; distance++) {
      const card = lane.getCardAtDistance(distance)
      // BOSS 포함: 레시피·손패 피해가 보스 HP 바에도 즉시 반영되도록 스냅샷에 넣는다.
      if (!card || snapshot.has(card.id)) continue
      if (card.type !== CardType.ENEMY && card.type !== CardType.BOSS) continue
      snapshot.set(card.id, { card, health: card.getHealth() })
    }
  }
  return snapshot
}

/** Return enemy HP losses since a snapshot for floating damage-number UI. */
function diffFieldHealthLosses(
  before: Map<string, FieldHealthSnapshotEntry>
): { cardId: string; amount: number }[] {
  const losses: { cardId: string; amount: number }[] = []
  for (const [cardId, { card, health }] of before.entries()) {
    const current = Math.max(0, card.getHealth())
    const amount = Math.max(0, health - current)
    if (amount > 0) losses.push({ cardId, amount })
  }
  return losses
}

/** Let boss-owned shields absorb damage from hand cards/recipes before UI diffs read HP loss. */
function absorbBossShieldAfterFieldEffect(before: Map<string, FieldHealthSnapshotEntry>): void {
  const state = bossController.eventState
  if (!state) return
  const snapshot = before.get(state.card.id)
  if (!snapshot) return
  bossController.absorbExternalBossDamageWithShield(snapshot.health)
}

interface FieldFreezeSnapshotEntry {
  card: Card
  frozenTurns: number
}

/** Snapshot unique field cards so freeze effects can be diffed after a hand
 *  card or recipe mutates the model. The UI uses this to play the one-shot
 *  wax-freeze SquareBurst exactly on cards whose status just hardened. */
function snapshotFieldFreezeState(): Map<string, FieldFreezeSnapshotEntry> {
  const snapshot = new Map<string, FieldFreezeSnapshotEntry>()
  for (const lane of gameState.lanes) {
    for (let distance = 0; distance < LANE_DISTANCE_COUNT; distance++) {
      const card = lane.getCardAtDistance(distance)
      if (!card || snapshot.has(card.id)) continue
      snapshot.set(card.id, { card, frozenTurns: card.frozenTurns })
    }
  }
  return snapshot
}

/** Return cards whose wax-freeze counter increased compared with a snapshot. */
function diffNewlyFrozenCards(before: Map<string, FieldFreezeSnapshotEntry>): string[] {
  const ids: string[] = []
  for (const { card, frozenTurns } of before.values()) {
    if (card.frozenTurns > frozenTurns) ids.push(card.id)
  }
  return ids
}

/** Return cards whose wax-freeze counter dropped to zero so thaw shards can play. */
function diffThawedCards(before: Map<string, FieldFreezeSnapshotEntry>): string[] {
  const ids: string[] = []
  for (const { card, frozenTurns } of before.values()) {
    if (frozenTurns > 0 && card.frozenTurns === 0) ids.push(card.id)
  }
  return ids
}

interface PlayerRecoverySnapshot {
  health: number
  maxHealth: number
}

/** Snapshot player recovery stats so relics can react after a mutation. */
function snapshotPlayerRecovery(): PlayerRecoverySnapshot {
  return {
    health: gameState.character.health,
    maxHealth: gameState.character.maxHealth,
  }
}

interface PlayerResourceSnapshot {
  health: number
  maxHealth: number
  shield: number
  ember: number
  candle: number
  damage: number
}

type ResourceTrailSource = { kind: 'card'; cardId: string } | { kind: 'center' } | { kind: 'chain' }

interface NumericResourceRule {
  target: ResourceTrailTarget
  theme: BurstTheme
}

/** Single rules table for numeric reward destinations. Every caller only
 *  chooses a source; this table owns the destination HUD and default palette. */
const NUMERIC_RESOURCE_TRAILS: Record<
  'health' | 'shield' | 'ember' | 'gauge' | 'attack' | 'score' | 'coin' | 'hand',
  NumericResourceRule
> = {
  health: { target: 'health', theme: 'health-gain' },
  shield: { target: 'shield', theme: 'shield-gain' },
  ember: { target: 'ember', theme: 'ember-gain' },
  gauge: { target: 'gauge', theme: 'gauge-gain' },
  attack: { target: 'attack', theme: 'attack-gain' },
  score: { target: 'score', theme: 'score' },
  coin: { target: 'coin', theme: 'score' },
  hand: { target: 'hand', theme: 'hand-tool' },
}

/** Flower reward trails override the default resource palette with species color. */
function flowerRewardTheme(kind: Card['flowerKind']): BurstTheme {
  switch (kind) {
    case 'chamomile':
      return 'flower-chamomile'
    case 'redRose':
      return 'flower-red-rose'
    case 'marigold':
      return 'flower-marigold'
    case 'oleander':
      return 'flower-oleander'
    case 'lavender':
      return 'flower-lavender'
    case 'seed':
      return 'flower-bloom'
  }
}

function snapshotPlayerResources(): PlayerResourceSnapshot {
  const c = gameState.character
  return {
    health: c.health,
    maxHealth: c.maxHealth,
    shield: c.shield,
    ember: c.ember,
    candle: c.candle,
    damage: c.damage,
  }
}

async function playResourceTrail(
  source: ResourceTrailSource,
  resource: keyof typeof NUMERIC_RESOURCE_TRAILS,
  count: number,
  themeOverride?: BurstTheme
): Promise<void> {
  if (count <= 0) return
  const rule = NUMERIC_RESOURCE_TRAILS[resource]
  const theme = themeOverride ?? rule.theme
  if (source.kind === 'card') {
    await boardRenderer.animateResourceTrailFromCard(source.cardId, rule.target, count, theme)
  } else if (source.kind === 'center') {
    await boardRenderer.animateResourceTrailFromCenter(rule.target, count, theme)
  } else {
    await boardRenderer.animateResourceTrailFromChain(rule.target, count, theme)
  }
  // Tick the destination HUD counter exactly when the trail lands so the
  // number visibly rolls during the impact beat. Light and wallet now use this
  // same landing hook instead of waiting for slower consume/cleanup animations,
  // while hand-card drops intentionally keep their non-numeric card materialize beat.
  tickHudCounterAfterTrail(resource)
}

/** Map a trail resource onto the matching HUD counter keys and roll them to
 *  the live model value. Centralizes the resource → counter wiring so future
 *  resources only have to extend this switch. */
function tickHudCounterAfterTrail(resource: keyof typeof NUMERIC_RESOURCE_TRAILS): void {
  const c = gameState.character
  switch (resource) {
    case 'health':
      // Healing and max-health gains share the same trail, so keep both rolls
      // in sync to avoid one number snapping while the other animates.
      boardRenderer.playHudCounterFeedback('health', c.health)
      boardRenderer.playHudCounterFeedback('maxHealth', c.maxHealth)
      return
    case 'shield':
      boardRenderer.playHudCounterFeedback('shield', Math.min(c.shield, 99))
      return
    case 'ember':
      boardRenderer.playHudCounterFeedback('ember', c.ember)
      boardRenderer.playHudCounterFeedback('emberMax', c.emberMax)
      return
    case 'gauge':
      boardRenderer.playHudCounterFeedback('candle', c.candle)
      return
    case 'attack':
      boardRenderer.playHudCounterFeedback('attack', c.damage)
      return
    case 'score':
      burstScoreGain()
      return
    case 'coin':
      burstCoinGain()
      return
    case 'hand':
      // Hand trails materialize cards rather than ticking a numeric HUD counter.
      return
  }
}

/** Diff player-facing numeric gains and route them through the shared table.
 *  Gauge consumption is intentionally ignored here; explicit spend beats such
 *  as shop purchases get their own source→target trail. */

/** Send the center played-card blast to every rail card touched by a hand effect. */
async function playHandTargetBlasts(cardIds: Iterable<string>, theme: BurstTheme): Promise<void> {
  const uniqueIds = [...new Set(cardIds)].filter(Boolean)
  if (uniqueIds.length === 0) return
  await Promise.all(
    uniqueIds.map((cardId) => boardRenderer.animateTargetBlastFromCenterToCard(cardId, theme))
  )
}

/** Collect currently rendered field cards once so grouped cards are only hit by
 *  one Hope cleanup blast even if they occupy multiple lane cells. */
function snapshotFieldCardPayloads(): { cardId: string; type: CardType }[] {
  const seen = new Set<string>()
  const payloads: { cardId: string; type: CardType }[] = []
  for (const lane of gameState.lanes) {
    for (let distance = 0; distance < LANE_DISTANCE_COUNT; distance++) {
      const card = lane.getCardAtDistance(distance)
      if (!card || seen.has(card.id)) continue
      seen.add(card.id)
      payloads.push({ cardId: card.id, type: card.type })
    }
  }
  return payloads
}

async function playPlayerGainTrails(
  source: ResourceTrailSource,
  before: PlayerResourceSnapshot,
  themeOverride?: Partial<Record<keyof typeof NUMERIC_RESOURCE_TRAILS, BurstTheme>>
): Promise<void> {
  const c = gameState.character
  const gains: Array<[keyof typeof NUMERIC_RESOURCE_TRAILS, number]> = [
    [
      'health',
      Math.max(Math.max(0, c.health - before.health), Math.max(0, c.maxHealth - before.maxHealth)),
    ],
    ['shield', Math.max(0, c.shield - before.shield)],
    ['ember', Math.max(0, c.ember - before.ember)],
    ['gauge', Math.max(0, c.candle - before.candle)],
    ['attack', Math.max(0, c.damage - before.damage)],
  ]
  // Fire independent stat trails together so HP / shield / ember / gauge
  // gains calculate on the same impact beat instead of queueing one by one.
  await Promise.all(
    gains.map(([resource, amount]) =>
      playResourceTrail(source, resource, amount, themeOverride?.[resource])
    )
  )
}

/** Heal from Red Potion after enemy defeats, then allow Blood Pack to react once. */
async function applyRedPotionEnemyDefeats(count: number, allowBloodPack = true): Promise<void> {
  if (count <= 0 || !gameState.character.hasRelic('red-potion')) return
  const before = snapshotPlayerRecovery()
  const beforeResources = snapshotPlayerResources()
  const healed = gameState.character.heal(count)
  if (healed <= 0) return
  recordRelicActivation('red-potion', `체력 +${healed}`)
  await playPlayerGainTrails({ kind: 'chain' }, beforeResources)
  if (allowBloodPack) await applyBloodPackRecoveryTrigger(before)
}

/** Shield from Wax Crow when treasure cards are actually acquired. */
async function applyWaxCrowTreasureGains(count: number): Promise<void> {
  if (count <= 0 || !gameState.character.hasRelic('wax-crow')) return
  const beforeResources = snapshotPlayerResources()
  const shielded = gameState.character.addShield(count)
  if (shielded <= 0) return
  recordRelicActivation('wax-crow', `방패 +${shielded}`)
  await playPlayerGainTrails({ kind: 'chain' }, beforeResources)
}

/** Blood Pack converts healing/max-HP gains into one random front enemy hit. */
async function applyBloodPackRecoveryTrigger(before: PlayerRecoverySnapshot): Promise<void> {
  const character = gameState.character
  const recovered = character.health > before.health || character.maxHealth > before.maxHealth
  if (!recovered || !character.hasRelic('blood-pack')) return
  const hit = gameState.damageRandomFrontEnemy(1)
  if (!hit) {
    recordRelicActivation('blood-pack', '전방 적 없음')
    return
  }
  recordRelicActivation('blood-pack', '전방 랜덤 적 피해 1')
  await boardRenderer.animateDamageNumbersById([{ cardId: hit.cardId, amount: hit.amount }])
  if (hit.defeated) {
    await boardRenderer.animateCardConsumeByIds([{ cardId: hit.cardId, type: CardType.ENEMY }], {
      suppressBurstIds: new Set([hit.cardId]),
    })
    await onEnemiesDefeated(1, false)
  }
}

/** 적 처치 시 처치 기반 유물을 한 번에 처리한다(붉은 포션 회복 + 잉크와 깃펜 카운트).
 *  blood-pack/품격있는 대처의 처치 후속도 이 함수로 모아 누락을 막는다. */
async function onEnemiesDefeated(count: number, allowBloodPack = true): Promise<void> {
  if (count <= 0) return
  await applyRedPotionEnemyDefeats(count, allowBloodPack)
  applyInkQuillKills(count)
}

/** 잉크와 깃펜: 적 5처치마다 손패 콤보 게이지 +1. 처치 수는 런 동안 누적한다.
 *  채워진 게이지는 액션 종료 시 resolveFullCandleGaugeEffects가 정산한다. */
let inkQuillKillCount = 0
function applyInkQuillKills(count: number): void {
  if (count <= 0 || !gameState.character.hasRelic('ink-quill')) return
  inkQuillKillCount += count
  while (inkQuillKillCount >= 5) {
    inkQuillKillCount -= 5
    gameState.character.gainCandle(1)
    boardRenderer.playHudCounterFeedback('candle', gameState.character.candle)
    recordRelicActivation('ink-quill', '콤보 게이지 +1')
  }
}

/** 품격있는 대처: 직전 타격으로 피해를 입고 아직 살아남은 적 1장에게 추가 피해 1. */
async function applyDignifiedResponseDamage(damagedIds: Set<string>): Promise<void> {
  if (damagedIds.size === 0 || !gameState.character.hasRelic('graceful-response')) return
  const aliveEnemyIds = new Set(
    snapshotFieldCardPayloads()
      .filter((p) => p.type === CardType.ENEMY)
      .map((p) => p.cardId)
  )
  const candidates = [...damagedIds].filter((id) => aliveEnemyIds.has(id))
  if (candidates.length === 0) return
  const pick = candidates[Math.floor(Math.random() * candidates.length)]
  const hit = gameState.damageEnemyById(pick, 1)
  if (!hit) return
  recordRelicActivation('graceful-response', '피해 입은 적 +1')
  await boardRenderer.animateDamageNumbersById([{ cardId: hit.cardId, amount: hit.amount }])
  if (hit.defeated) {
    await boardRenderer.animateCardConsumeByIds([{ cardId: hit.cardId, type: CardType.ENEMY }], {
      suppressBurstIds: new Set([hit.cardId]),
    })
    await onEnemiesDefeated(1, false)
  }
}

/** Hope is a one-shot revive: show its bespoke relic burst, remove itself,
 *  ban future offers, clear the rail, then hand control back to the player. */
async function tryResolveHopeRevive(): Promise<boolean> {
  const character = gameState.character
  if (character.isAlive() || !character.hasRelic('hope')) return false
  const beforeResources = snapshotPlayerResources()
  const fieldCards = snapshotFieldCardPayloads()

  // The relic must still be present in the owned fan while this plays, so the
  // one-shot removal happens after the centered shake/white-pop beat.
  await boardRenderer.animateHopeRelicRevive('hope')
  character.removeRelic('hope', true)

  // Hope is a full field-cleanup relic: first mark every visible card from the
  // center, then let the stale DOM cards burst/fade before the model is cleared.
  await playHandTargetBlasts(
    fieldCards.map((card) => card.cardId),
    'score'
  )
  await boardRenderer.animateCardConsumeByIds(fieldCards)

  gameState.clearField()
  character.maxHealth = Math.max(character.maxHealth, 10)
  character.health = 10
  gameState.isGameOver = false
  gameState.gameOverReason = ''
  recordRelicActivation('hope', '체력 10으로 부활, 필드 제거')
  render()
  await playPlayerGainTrails({ kind: 'center' }, beforeResources)
  await runPreparationRefreshAfterFieldEffects({ avoidFrontMergeOnFullRefill: true })
  return true
}

/** 별빛 랜턴(id: golden-squirrel)은 5턴마다 불빛 500을 흘려보낸다. */
async function applyTurnStartRelics(): Promise<void> {
  if (!gameState.character.hasRelic('golden-squirrel')) return
  if (gameState.getCurrentTurn() === 0 || gameState.getCurrentTurn() % 5 !== 0) return
  // 불빛은 턴 배율 없이 고정 500을 더하고 점수 패널로 트레일/버스트를 띄운다.
  score += 500
  scorePulseKey++
  pushActivityLogsInDisplayOrder([{ label: '별빛 랜턴', scoreDelta: 500, kind: 'score' }])
  recordRelicActivation('golden-squirrel', '불빛 +500')
  await playResourceTrail({ kind: 'chain' }, 'score', 1)
  burstScoreGain()
}

/** basePrice는 Relics.ts 정의에서 읽는다. 실제 식은 -76~+104 비대칭 지터를 만들어 비원형 가격을 낸다. */
function priceForRelic(id: RelicId): number {
  const base = getRelicDef(id).basePrice
  const jitter = Math.floor((Math.random() - 0.42) * 180)
  return Math.max(120, base + jitter)
}

/** Generate up to three unowned, unbanned relics + per-spawn score price. */
function rollShopOffers(excludeIds: string[] = []): ShopOfferView[] {
  const character = gameState.character
  const basePool = RELIC_IDS.filter(
    (id) => !character.hasRelic(id) && !character.bannedRelics.includes(id)
  )
  // 제단 유물 풀은 상위 등급만 허용해 분위기와 보상 체감을 분리한다.
  const allowedAltarRarity = new Set(['epic', 'unique', 'legendary'])
  const sourcePool = currentShopMode === 'altar'
    ? basePool.filter((id) => allowedAltarRarity.has(getRelicDef(id).rarity))
    : basePool
  // 리롤 시 현재 배치된 유물은 제외한다. 풀이 부족하면 제외 없이 폴백한다.
  const excludeSet = new Set(excludeIds)
  const filteredPool = excludeSet.size > 0
    ? sourcePool.filter((id) => !excludeSet.has(id))
    : sourcePool
  const effectivePool = filteredPool.length >= 3 ? filteredPool : sourcePool
  // common 등급이 자주, legendary가 드물게 등장하도록 등급별 가중치를 적용한다.
  const weightedPool = effectivePool.flatMap((relicId) => {
    const rarity = getRelicDef(relicId).rarity
    const weight = RARITY_DRAW_WEIGHTS[rarity] ?? 1
    return Array.from({ length: weight }, () => relicId)
  })
  return weightedPool
    .map((relicId) => ({ relicId, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    // 실제 노출 3장은 항상 중복 없이 보이도록 정규화한다.
    .filter((entry, i, arr) => arr.findIndex((v) => v.relicId === entry.relicId) === i)
    .slice(0, 3)
    .map(({ relicId }) => ({ relicId, price: priceForRelic(relicId) }))
}

/** 보스 흐름 외의 milestone 분기(maybeRunMilestoneEventsAfterTurn)에서 호출되는
 *  비상용 트라이얼 — 평소엔 사용되지 않지만 흐름이 살아 있을 때를 대비해 새 카드
 *  3종(방화광/양초 사냥꾼/가난) 정의를 그대로 사용한다. */
async function openTrialOverlay(): Promise<void> {
  inputLocked = true
  await openTrialOverlayForced()
  inputLocked = false
}

/** Pack cost source of truth. UI 표기와 실제 차감이 갈라지지 않도록 구매 처리도 이 함수만 사용한다. */
function currentShopPackCost(kind: ShopPackKind): number {
  if (currentShopMode === 'altar') return 500
  switch (kind) {
    case 'basic-pack': return 120 + shopBasicPackBuys * 40
    case 'upgrade-pack': return 500 + shopUpgradePackBuys * 130
    case 'unlock-pack': return 520 + shopUnlockPackBuys * 120
    // 제단 전용 팩이 일반 상점에서 호출되면 안전한 기본값으로 막는다.
    default: return 500
  }
}

/** Build the renderer-facing split-shop state with dynamic inflation costs.
 *  Reroll cost is denominated in coins (화폐) — the renderer reads `coins`
 *  to decide whether the reroll button is affordable. */
function buildShopStateView(): ShopStateView {
  return {
    mode: currentShopMode,
    relicOffers: currentShopOffers,
    freeCardClaimed,
    freeCoinCardClaimed,
    freeCardDescription: SHOP_FREE_GIFT_REWARDS[freeGiftKind].description,
    rerollCost: 1 + shopRerollCount,
    coins,
    basicPackCost: currentShopPackCost('basic-pack'),
    upgradePackCost: currentShopPackCost('upgrade-pack'),
    unlockPackCost: currentShopPackCost('unlock-pack'),
  }
}

/** Immediate stat effects for relics whose benefit is granted on purchase. */
async function applyRelicPurchaseEffect(id: RelicId): Promise<void> {
  // 구매 즉시 스탯만 올리고 체인 로그에는 남기지 않는다. 트레일은 상점에서
  // 숨겨진 체인 배너 대신 화면 중앙에서 HUD로 날린다.
  if (id === 'carving-knife') {
    const beforeResources = snapshotPlayerResources()
    gameState.character.applyDamageBoost(1)
    await playPlayerGainTrails({ kind: 'center' }, beforeResources)
    return
  }
  if (id === 'lifeline') {
    const before = snapshotPlayerRecovery()
    const beforeResources = snapshotPlayerResources()
    gameState.character.increaseMaxHealth(5)
    await playPlayerGainTrails({ kind: 'center' }, beforeResources)
    await applyBloodPackRecoveryTrigger(before)
  }
  if (id === 'first-candle') {
    const before = snapshotPlayerRecovery()
    const beforeResources = snapshotPlayerResources()
    // 첫 양초: 최대 체력 +5 / 공격력 +1 / 최대 불씨 게이지 +2 / 최대 손패 +2 / 최대 콤보 게이지 -1.
    // 손패·콤보 게이지 상한은 수치 트레일이 없으므로 체력/불씨/공격력만 중앙 트레일로 보인다.
    gameState.character.increaseMaxHealth(5)
    gameState.character.applyDamageBoost(1)
    gameState.character.increaseEmberMax(2)
    gameState.character.increaseHandMax(2)
    gameState.character.decreaseCandleMax(1)
    await playPlayerGainTrails({ kind: 'center' }, beforeResources)
    await applyBloodPackRecoveryTrigger(before)
  }
}

async function maybeOpenShopAfterTurn(): Promise<boolean> {
  // 보스 전투/최종 별빛 등반 중에는 10/30턴 상점·제단을 재트리거하지 않는다.
  if (gameState.bossBattleActive || finalAscentStarlightRuleActive) return false
  if (gameState.getCurrentTurn() === 0 || gameState.getCurrentTurn() % 10 !== 0) return false
  // Every 30 turns swaps to altar mode; this is the first phase of the
  // 100-turn run loop (10 shop, 20 shop, 30 altar ...).
  // 임시: 30턴도 상점 흐름 그대로 진입시키되, 배경만 altar 모드로 분기한다.
  currentShopMode = gameState.getCurrentTurn() % 30 === 0 ? 'altar' : 'shop'
  shopOpen = true
  inputLocked = true
  currentShopOffers = rollShopOffers()
  shopRerollCount = 0
  shopBasicPackBuys = 0
  shopUpgradePackBuys = 0
  shopUnlockPackBuys = 0
  freeCardClaimed = false
  // 제단 수당도 방문 단위 무료 보상이므로 30/60/90턴마다 다시 활성화한다.
  freeCoinCardClaimed = false
  // 방문 시작 시 선물 상자의 효과를 현재 등록된 n종 중 하나로 확정한다.
  freeGiftKind = SHOP_FREE_GIFT_KINDS[Math.floor(Math.random() * SHOP_FREE_GIFT_KINDS.length)]
  activePackSession = null
  // The shutter is a hard turn break: cut the chain before the shop overlay
  // appears so the floating chain text never hangs above the shop tab.
  HandSystem.resetChain(chain)
  clearChainTimeline()
  recordNotice(currentShopMode === 'altar' ? '레일이 멈추고 제단이 열렸다' : '레일이 멈추고 상점이 열렸다', 'info')
  render()
  await boardRenderer.playShopTransition()
  boardRenderer.openShop(buildShopStateView(), score, gameState.character)
  return true
}

/** Phase milestone controller: altar(30n) -> boss preview -> trial preview.
 *  This is a non-invasive scaffold so the core turn engine stays stable while
 *  boss combat rules are implemented in follow-up slices. */
async function maybeRunMilestoneEventsAfterTurn(): Promise<boolean> {
  // 보스 전투 중에는 마일스톤(제단/보스 게이트)을 재트리거하지 않는다.
  if (gameState.bossBattleActive) return false
  const turn = gameState.getCurrentTurn()
  if (turn >= RUN_TARGET_TURNS) {
    gameState.endGame('run_clear_100_turns')
    recordNotice('100턴 생존 성공 — 시련의 장막이 닫힌다', 'win')
    render()
    return true
  }
  // After each altar visit (30, 60, 90), queue a dedicated boss gate.
  // 임시 동결: 제단 진입 안정화 전까지 30턴 보스 게이트를 열지 않는다.
  if (turn > 0 && turn % 30 === 0 && !altarBossDefeated) altarBossPending = false
  if (altarBossPending) {
    altarBossPending = false
    altarBossDefeated = true
    trialPending = true
    turnManager.setTurnMode('boss_phase')
    recordNotice(`제단의 수문장 출현: 보스(HP${50}/ATK5, 3턴 주기) 설계 토대 활성`, 'hurt')
    // 현재는 프리뷰 단계이므로 즉시 일반 턴으로 되돌려 카운트 제외 규칙만 고정한다.
    turnManager.setTurnMode('normal_turn')
    render()
    return true
  }
  if (trialPending) {
    trialPending = false
    await openTrialOverlay()
    recordNotice(formatTrialSummary('시련 각인 완료'), 'info')
    render()
    return true
  }
  return false
}

/** Build the random "3-card" contents for a pack the player just bought.
 *  Each entry carries an `apply` closure so the pick handler stays small. */
function rollPackItems(kind: ShopPackKind): ShopPackPickItem[] {
  const character = gameState.character
  if (kind === 'basic-pack') {
    // 자원팩 — BasicPackPool.ts 에서 테이블 관리, 항목별 weight 사용.
    return sampleWeightedWithoutReplacement(
      BASIC_PACK_POOL.map((entry) => ({
        ...entry,
        theme: 'resource' as const,
        spriteUrl: spriteForBasicPackItem(entry.illu),
        apply: () => {
          switch (entry.id) {
            case 'basic_001': character.heal(3);        return
            case 'basic_002': character.gainEmber(1);   return
            case 'basic_003': character.gainCandle(1);  return
            case 'basic_004': character.heal(5);        return
            case 'basic_005': character.gainEmber(2);   return
            case 'basic_006': character.gainCandle(2);  return
            case 'basic_007': character.heal(10);       return
            case 'basic_008': character.gainEmber(3);   return
            case 'basic_009': character.gainCandle(3);  return
            case 'basic_010': character.addShield(3);   return
            case 'basic_011': coins += 1;               return
          }
        },
      })),
      3
    )
  }
  if (kind === 'blessing-pack') {
    return [1,2,3].map((n) => ({
      id: `blessing-${n}`,
      theme: 'upgrade' as const,
      title: `선택지 ${n}`,
      effect: '미정',
      rarity: 'epic' as const,
      apply: () => undefined,
    }))
  }
  if (kind === 'resource-pack') {
    // 제단 5번 팩 — 최대 수치/영구 보정. 6종 중 3종 랜덤 선택.
    const rawPool = SHOP_PACK_POOLS['resource-pack'].map((entry) => ({
      ...entry,
      apply: () => {
        switch (entry.id) {
          case 'res-atk-1':        character.applyDamageBoost(1);                                            return
          case 'res-handmax-2':    character.handMax += 2;                                                   return
          case 'res-maxhp-5':      character.increaseMaxHealth(5);                                           return
          case 'res-embermax-2':   character.emberMax += 2;                                                  return
          case 'res-candlemax-m1': character.candleMax = Math.max(1, character.candleMax - 1);               return
          case 'res-scoremult-15': gameState.enhancements.scoreMultiplier *= 1.15;                           return
        }
      },
    }))
    return sampleWeightedWithoutReplacement(rawPool, Math.min(3, rawPool.length))
  }
  if (kind === 'enhance-pack') {
    // 제단 6번 팩 — 해금된 카드의 단일 사용 효과 +1 (코인 제외).
    const entries = buildUnlockedEnhancePool(runCardPool.snapshot().unlocked)
    if (entries.length === 0) return []
    return sampleWeightedWithoutReplacement(entries, Math.min(3, entries.length)).map((entry) => ({
      ...entry,
      spriteUrl: spriteForHandCard(entry.targetCardId),
      apply: () => {
        const id = entry.targetCardId
        gameState.enhancements.singleBonus[id] = (gameState.enhancements.singleBonus[id] ?? 0) + 1
      },
    }))
  }
  if (kind === 'unlock-pack') {
    // 풀 = 런에서 잠긴 카드(runLocked) + 삭제팩으로 밴된 카드
    const { locked, banned } = runCardPool.snapshot()
    const pool = [...locked, ...banned]
    if (pool.length === 0) return []
    const drawIds = sampleWithoutReplacement(pool, Math.min(3, pool.length))
    return drawIds.map((id) => {
      const def = getHandCardDef(id)
      const isBanned = banned.includes(id)
      return {
        id: `unlock-${id}`,
        theme: 'unlock' as const,
        title: def.name,
        effect: isBanned ? `[재해금] ${def.description}` : def.description,
        rarity: HAND_CARD_RARITY[id],
        spriteUrl: spriteForHandCard(id),
        apply: () => {
          // 밴된 카드는 unban (풀 복귀), 잠긴 카드는 unlockForRun.
          // 해금은 드롭 풀 등장만 허용할 뿐 즉시 손패를 지급하지 않는다.
          if (isBanned) runCardPool.unban(id)
          else runCardPool.unlockForRun(id)
        },
      }
    })
  }
  if (kind === 'delete-pack') {
    // 풀 = 현재 해금된 카드 (런 내 활성 풀)
    const { unlocked } = runCardPool.snapshot()
    if (unlocked.length === 0) return []
    const drawIds = sampleWithoutReplacement(unlocked, Math.min(3, unlocked.length))
    return drawIds.map((id) => {
      const def = getHandCardDef(id)
      return {
        id: `delete-${id}`,
        theme: 'unlock' as const,
        title: def.name,
        effect: `앞으로 ${def.name} 등장 금지`,
        rarity: HAND_CARD_RARITY[id],
        spriteUrl: spriteForHandCard(id),
        apply: () => { runCardPool.ban(id) },
      }
    })
  }
  // 강화팩: 현재 해금된 카드/조합식 항목만 포함(systems/UpgradePackPool.ts).
  //   일러스트는 새 스프라이트 없이 기존 손패 아트를 재사용한다(triple→카드, recipe→첫 재료).
  const pool = buildUnlockedUpgradePool(runCardPool.snapshot().unlocked).map((entry) => ({
    ...entry,
    spriteUrl: spriteForUpgradePackItem(entry.id),
    apply: () => {
      switch (entry.id) {
        // 강화팩 common — 트리플 보너스
        case 'triple-wax-drop':   gameState.enhancements.tripleBonus['wax-drop'] = (gameState.enhancements.tripleBonus['wax-drop'] ?? 0) + 1; return
        case 'triple-candle':     gameState.enhancements.tripleBonus['candle']   = (gameState.enhancements.tripleBonus['candle']   ?? 0) + 1; return
        case 'triple-ember':      gameState.enhancements.tripleBonus['ember']    = (gameState.enhancements.tripleBonus['ember']    ?? 0) + 1; return
        case 'triple-match':      gameState.enhancements.tripleBonus['match']    = (gameState.enhancements.tripleBonus['match']    ?? 0) + 1; return
        case 'triple-coin':       gameState.enhancements.tripleBonus['coin']     = (gameState.enhancements.tripleBonus['coin']     ?? 0) + 1; return
        case 'triple-card':       gameState.enhancements.tripleBonus['card']     = (gameState.enhancements.tripleBonus['card']     ?? 0) + 1; return
        // 강화팩 rare — 레시피 피해 보너스
        case 'recipe-ignite':       gameState.enhancements.recipeBonus['ignite'] = (gameState.enhancements.recipeBonus['ignite'] ?? 0) + 1; return
        case 'recipe-hot':          gameState.enhancements.recipeBonus['hot']    = (gameState.enhancements.recipeBonus['hot']    ?? 0) + 1; return
        case 'recipe-fuse':         gameState.enhancements.recipeBonus['fuse']   = (gameState.enhancements.recipeBonus['fuse']   ?? 0) + 1; return
        // 강화팩 epic — 레시피 횟수 보너스
        case 'recipe-greed':        gameState.enhancements.recipeBonus['greed']        = (gameState.enhancements.recipeBonus['greed']        ?? 0) + 1; return
        case 'recipe-locksmith':    gameState.enhancements.recipeBonus['locksmith']    = (gameState.enhancements.recipeBonus['locksmith']    ?? 0) + 1; return
        case 'recipe-mine-sweeper': gameState.enhancements.recipeBonus['mine-sweeper'] = (gameState.enhancements.recipeBonus['mine-sweeper'] ?? 0) + 1; return
        // 강화팩 legendary — 레시피 보상 보너스
        case 'recipe-shuffle':  gameState.enhancements.recipeBonus['shuffle']  = (gameState.enhancements.recipeBonus['shuffle']  ?? 0) + 1; return
        case 'recipe-dividend': gameState.enhancements.recipeBonus['dividend'] = (gameState.enhancements.recipeBonus['dividend'] ?? 0) + 1; return
      }
    },
  }))
  return sampleWeightedWithoutReplacement(pool, 3)
}
/** Open the pack picker for the just-clicked pack tile. Deducts the price
 *  if the player can afford it, otherwise no-op. */
async function openPackPurchase(kind: ShopPackKind): Promise<void> {
  const cost = currentShopPackCost(kind)
  if (score < cost) return
  score = Math.max(0, score - cost)
  scorePulseKey++
  if (kind === 'basic-pack') shopBasicPackBuys += 1
  if (kind === 'upgrade-pack') shopUpgradePackBuys += 1
  if (kind === 'unlock-pack') shopUnlockPackBuys += 1
  // Keep picker title synchronized with the shared pack label table.
  const title = SHOP_PACK_LABELS[kind].title
  const items = rollPackItems(kind)
  activePackSession = { kind, items }
  // Spend feedback before the picker so the score panel ticks down on click.
  const packTile = document.querySelector<HTMLElement>(`#shop-overlay .shop-pack-card[data-shop-buy-kind="${kind}"]`)
  if (packTile) await boardRenderer.playShopPurchaseImpact(packTile, "score")
  boardRenderer.playScoreSpendFeedback(score, scorePulseKey)
  boardRenderer.openShop(buildShopStateView(), score, gameState.character)
  const view: ShopPackPickerView = {
    packKind: kind,
    title,
    // spriteUrl 포함: enhance/unlock/delete 팩은 카드별 일러스트가 있어야 식별 가능하다.
    items: items.map(({ id, title, effect, theme, rarity, spriteUrl }) => ({ id, title, effect, theme, rarity, spriteUrl })),
  }
  boardRenderer.openPackPicker(view)
}

/** Apply the player's pick from an active pack session, then close the picker. */
async function handleShopPackPick(detail: ShopPackPickDetail): Promise<void> {
  if (!activePackSession || activePackSession.kind !== detail.packKind) return
  const picked = activePackSession.items.find((it) => it.id === detail.itemId)
  if (!picked) return
  const beforeResources = snapshotPlayerResources()
  await picked.apply()
  // unlock-pack/delete-pack 선택 후 runCardPool이 바뀌므로 드롭 풀 및 도감 잠금 표시를 재동기화한다.
  const poolSnap = runCardPool.snapshot()
  DropSystem.setAllowedPool(poolSnap.unlocked)
  boardRenderer.setLockedCardIds([...poolSnap.locked, ...poolSnap.banned])
  activePackSession = null
  boardRenderer.closePackPicker()
  // Most pack effects mutate character stats; play the standard player-gain
  // trail so HP/방패/공격력 등 변화에 카드/숫자 피드백이 같이 따라온다.
  await playPlayerGainTrails({ kind: 'chain' }, beforeResources)
  // 자원팩 등 게이지 아이템 선택 시 게이지가 가득 찼으면 보상 효과를 즉시 발동한다.
  await resolveFullCandleGaugeEffects({ kind: 'chain' })
  render()
  boardRenderer.openShop(buildShopStateView(), score, gameState.character)
}

async function handleShopBuy(detail: ShopBuyDetail): Promise<void> {
  if (!shopOpen) return
  if (
    detail.kind !== 'relic' &&
    detail.kind !== 'free-card' &&
    detail.kind !== 'free-coin-card' &&
    detail.kind !== 'reroll' &&
    detail.kind !== 'basic-pack' &&
    detail.kind !== 'upgrade-pack' &&
    detail.kind !== 'unlock-pack' &&
    detail.kind !== 'blessing-pack' && detail.kind !== 'resource-pack' && detail.kind !== 'enhance-pack' && detail.kind !== 'delete-pack'
  )
    return
  if (detail.kind === 'free-card' || detail.kind === 'free-coin-card') {
    if (detail.kind === 'free-card') {
      if (freeCardClaimed) return
      freeCardClaimed = true
      // 선물 상자는 사용 즉시 소모되며, 실제 보상량과 트레일 입력을 같은 데이터에서 읽는다.
      const freeGift = SHOP_FREE_GIFT_REWARDS[freeGiftKind]
      if (freeGiftKind === 'score-300') {
        score += freeGift.amount
        scorePulseKey++
        // 불빛 보상은 무료카드에서 불빛 패널로 직접 날려 기존 획득 문법을 유지한다.
        await boardRenderer.consumeFreeCardAndRouteReward('free-card', 'score', freeGift.amount, 'score')
      } else if (freeGiftKind === 'coin-1') {
        coins += freeGift.amount
        coinPulseKey++
        // 화폐 보상은 코인 톤 burst(treasure-gain)로 발사 — 불빛(score) burst가
        // 같이 뜨던 버그 수정. 보상 종류에 맞는 입자 색감만 보이도록 한다.
        await boardRenderer.consumeFreeCardAndRouteReward('free-card', 'coin', freeGift.amount, 'treasure-gain')
      } else if (freeGiftKind === 'health-5') {
        gameState.character.heal(freeGift.amount)
        // 체력 보상은 HP 바로 꽂혀야 피드백이 정확히 읽힌다.
        await boardRenderer.consumeFreeCardAndRouteReward('free-card', 'health', freeGift.amount, 'health-gain')
      } else if (freeGiftKind === 'gauge-3') {
        gameState.character.gainCandle(freeGift.amount)
        // 게이지 보상은 캔들 게이지 목적지로 분기한다.
        await boardRenderer.consumeFreeCardAndRouteReward('free-card', 'gauge', freeGift.amount, 'gauge-gain')
        // 트레일 직후 게이지 카운터를 즉시 반영하고, 가득 찼을 경우 보상 효과까지 처리한다.
        boardRenderer.playHudCounterFeedback('candle', gameState.character.candle)
        await resolveFullCandleGaugeEffects({ kind: 'center' })
      } else if (freeGiftKind === 'ember-3') {
        gameState.character.gainEmber(freeGift.amount)
        // 불씨 보상은 상단 ember HUD로 직접 날린다.
        await boardRenderer.consumeFreeCardAndRouteReward('free-card', 'ember', freeGift.amount, 'score')
      } else {
        for (let i = 0; i < freeGift.amount; i += 1) {
          // 해금되지 않았거나 삭제팩으로 밴된 카드가 섞이지 않도록 드롭 풀(unlocked) 기준으로 뽑는다.
          gameState.character.addHandCard(DropSystem.generateDrop())
        }
        // 손패 보상은 손패 스택 목적지로 날려 카드 획득 흐름과 같은 언어를 사용한다.
        await boardRenderer.consumeFreeCardAndRouteReward('free-card', 'hand', freeGift.amount, 'hand-control')
      }
    } else {
      if (freeCoinCardClaimed) return
      freeCoinCardClaimed = true
      coins += 3
      coinPulseKey++
      // 제단 수당은 경제 밸런스 완화 후 3$만 지급한다. source burst도 코인 톤
      // (treasure-gain)으로 발사해 불빛 입자가 같이 뜨는 시각 혼선을 제거.
      await boardRenderer.consumeFreeCardAndRouteReward('free-coin-card', 'coin', 3, 'treasure-gain')
    }
    boardRenderer.playScoreGainFeedback(score, scorePulseKey)
    boardRenderer.playCoinGainFeedback(coins, coinPulseKey)
    render()
    boardRenderer.openShop(buildShopStateView(), score, gameState.character)
    return
  }
  if (
    detail.kind === 'basic-pack' || detail.kind === 'upgrade-pack' || detail.kind === 'unlock-pack' ||
    detail.kind === 'blessing-pack' || detail.kind === 'resource-pack' || detail.kind === 'enhance-pack' || detail.kind === 'delete-pack'
  ) {
    await openPackPurchase(detail.kind)
    return
  }
  if (detail.kind === 'reroll') {
    const rerollCost = 1 + shopRerollCount
    // Reroll is paid in 화폐(coins) now, not 불빛(score).
    if (coins < rerollCost) return
    coins = Math.max(0, coins - rerollCost)
    coinPulseKey++
    shopRerollCount += 1
    // Resolve the new offer slate BEFORE the flip so we can swap the
    // relic content mid-flip (180° back-face moment). Purchased slots
    // stay frozen so EXIT does not resurrect cards into bought gaps.
    // 현재 배치된 비구매 유물은 리롤 결과에서 제외한다(풀이 부족하면 자동 폴백).
    const currentRelicIds = currentShopOffers
      .filter((e) => !e.purchased)
      .map((e) => e.relicId)
    const freshOffers = rollShopOffers(currentRelicIds)
    let freshIndex = 0
    const nextOffers = currentShopOffers.map((entry) => {
      if (entry.purchased) return entry
      const next = freshOffers[freshIndex]
      freshIndex += 1
      return next ?? entry
    })
    const rerollBtn = document.querySelector<HTMLElement>('#shop-overlay .shop-reroll-btn')
    if (rerollBtn) await boardRenderer.playShopPurchaseImpact(rerollBtn, "score")
    boardRenderer.playCoinSpendFeedback(coins, coinPulseKey)
    // Commit the new offers BEFORE running the flip so any incidental
    // re-render (e.g. openShop's refresh path) sees the fresh data,
    // matching what the mid-flip swap puts on screen.
    currentShopOffers = nextOffers
    await boardRenderer.playShopRerollFeedback(rerollCost, nextOffers, score, gameState.character)
    boardRenderer.openShop(buildShopStateView(), score, gameState.character)
    return
  }
  if (!detail.relicId) return
  const offer = currentShopOffers.find((entry) => entry.relicId === detail.relicId)
  if (!offer || offer.purchased) return
  if (score < offer.price) { boardRenderer.openShop(buildShopStateView(), score, gameState.character); return }
  if (!gameState.character.addRelic(detail.relicId)) {
    render()
    return
  }
  // Pay the light price. We DO log the deduction — pure number-pulse on the
  // light panel is too easy to miss, so the activity log row makes the spend concrete.
  const def = getRelicDef(detail.relicId)
  score = Math.max(0, score - offer.price)
  scorePulseKey++
  pushActivityLogsInDisplayOrder([
    {
      label: `유물 구매: ${def.name}`,
      scoreDelta: -offer.price,
      kind: 'score' as const,
    },
  ])
  // Spend feedback reverses the usual gain trail: 불빛 leaves the left panel
  // and lands on the clicked relic card before that card turns purchased.
  const relicCard = document.querySelector<HTMLElement>(`#shop-overlay .shop-relic-card[data-shop-buy="${detail.relicId}"]`)
  if (relicCard) await boardRenderer.playShopPurchaseImpact(relicCard, "score")
  boardRenderer.playScoreSpendFeedback(score, scorePulseKey)
  await boardRenderer.animateShopPurchaseTrailToRelic(
    detail.relicId,
    Math.min(9, Math.max(1, Math.ceil(offer.price / 200)))
  )
  offer.purchased = true
  await applyRelicPurchaseEffect(detail.relicId)
  boardRenderer.prepareRelicArrivalFromShop(detail.relicId)
  render()
  await boardRenderer.animatePreparedRelicArrival()
  boardRenderer.openShop(buildShopStateView(), score, gameState.character)
}

async function closeShopAndResume(): Promise<void> {
  if (!shopOpen) return
  shopOpen = false
  currentShopOffers = []
  // EXIT while a pack picker is mid-open just drops the picker; the cost has
  // already been spent so the unused roll simply burns. Clearing the session
  // prevents stale picks from firing after the next shop opens.
  if (activePackSession) {
    activePackSession = null
    boardRenderer.closePackPicker()
  }
  // Exit beat: cards bounce down then swoosh upward in random staggered
  // order WITHOUT covering the candle gauge (clipped by the shell). Only
  // after the cards have fully left do we tear down the overlay and
  // raise the shutter so the player can resume the turn.
  await boardRenderer.playShopExitAnimation()
  boardRenderer.closeShop()
  // 제단 EXIT는 셔터를 올리지 않고 곧장 보스 게이트로 이어간다.
  // 30/60/90턴 제단은 각 층 보스 전투로 분기하고, 보상/시련 구조는 공통 컨트롤러가 재사용한다.
  if (currentShopMode === 'altar') {
    await boardRenderer.playAltarBossGateTransition()
    turnManager.setTurnMode('boss_phase')
    recordNotice('셔터 레일이 흔들리며 보스가 강림한다', 'hurt')
    if (gameState.getCurrentTurn() === 90) {
      await bossController.run90F()
    } else if (gameState.getCurrentTurn() === 60) {
      await bossController.run60F()
    } else {
      await bossController.run30F()
    }
    inputLocked = false
    render()
    return
  }
  await boardRenderer.playShopResumeTransition()
  inputLocked = false
  render()
}
/** Forced trial after boss: 베일이 레일 크기로 내려옴 → 카드들이 한 박자 늦게
 *  떨어진다. 선택 시 자동 EXIT 흐름(카드 회수 → 레이어 회수 → 셔터 상승).
 *  진동 없이 바로 열도록 변경 — quake가 셔터를 들썩여 보여 제거. */
async function openTrialOverlayForced(): Promise<void> {
  boardRenderer.openForcedTrialShopFlow(
    FORCED_TRIAL_CARDS.map(({ id, title, effect, spriteUrl }) => ({ id, title, effect, spriteUrl }))
  )
  await new Promise<void>((resolve) => {
    let picked = false
    const finalize = async (): Promise<void> => {
      document.removeEventListener('forcedTrialPick', onPick)
      // playShopExitAnimation: 카드들이 위로 빠진다 → closeShop: 레이어 회수
      // → playShopResumeTransition: 셔터 상승. 상점 EXIT와 완전히 같은 비트.
      await boardRenderer.playShopExitAnimation()
      boardRenderer.closeShop()
      await boardRenderer.playShopResumeTransition()
      if (gameState.getCurrentTurn() === 90) {
        // 셔터가 완전히 열린 뒤 짧은 정적을 두고, 화면 연출과 함께 최종 등반 규칙을 켠다.
        await wait(320)
        activateFinalAscentStarlightRule()
        await boardRenderer.playFinalAscentRuleAwakening()
      }
      // 시련 종료 직전 손패 차단 해제 → 일반 turn 입력 가능.
      bossController.postPhaseHandLocked = false
      resolve()
    }
    const onPick = (event: Event): void => {
      const custom = event as CustomEvent<{ id?: string }>
      const id = custom.detail?.id
      const pickedCard = FORCED_TRIAL_CARDS.find((card) => card.id === id)
      if (!pickedCard || picked) return
      picked = true
      pickedCard.apply()
      // 선택된 카드 자체에 burst 이펙트. 동일한 카드 위에서 효과가 "터지며 적용"되는
      // 시각 비트를 만든 뒤 자동으로 EXIT 시퀀스가 이어진다.
      const pickedEl = document.querySelector<HTMLElement>(`[data-trial-pick="${id}"]`)
      if (pickedEl) SquareBurst.playOn(pickedEl, 'score', { count: 18, spread: 140, duration: 620 })
      recordNotice(formatTrialSummary(`시련 적용: ${pickedCard.title}`), 'info')
      window.setTimeout(() => void finalize(), 620)
    }
    const onExit = (): void => {
      // EXIT 버튼은 제거됐지만 호환성을 위해 핸들러는 남겨 둔다(강제 선택 시 무시).
      if (!picked) return
      void finalize()
    }
    document.addEventListener('forcedTrialPick', onPick)
    document.addEventListener('forcedTrialExit', onExit as EventListener)
  })
}

/**
 * Preparation refresh used after hand/combo field removals. It compacts lanes,
 * refills the top row, regroups the active row, and renders once so removed
 * cards never leave visible holes before player control returns.
 */
interface PreparationRefreshOptions {
  /**
   * Full-field cleanup effects can refill an entire 3×3 board at once. Skip
   * immediate front-row grouping for that first rebuilt board so the player
   * gets one readable response window instead of facing a freshly merged wall.
   */
  suppressFrontRegroupOnce?: boolean
  /**
   * Hope-like full rebuilds should still regroup if overlap survives, but first
   * try to reroll adjacent front-row merge families so the fresh 3×3 board is
   * usually three readable choices.
   */
  avoidFrontMergeOnFullRefill?: boolean
}

function frontRowIsEmpty(): boolean {
  return gameState.lanes.every((lane) => !lane.getCardAtDistance(0))
}

function seedTopRowWithSeparatedRefillRow(): boolean {
  const cards = cardSpawner.spawnCardsForSeparatedRefillRow(gameState.lanes.length)
  const topDistance = LANE_DISTANCE_COUNT - 1
  let seeded = false
  for (let laneIndex = 0; laneIndex < gameState.lanes.length; laneIndex++) {
    const lane = gameState.lanes[laneIndex]
    if (lane.getCardAtDistance(topDistance)) continue
    // Keep the same safe-reroll logic, but place cards on the top rail so the
    // front row is still rebuilt through the normal falling animation beats.
    lane.setCardAtDistance(topDistance, cards[laneIndex] ?? null)
    seeded = true
  }
  return seeded
}

async function runPreparationRefreshAfterFieldEffects(
  options: PreparationRefreshOptions = {}
): Promise<void> {
  // 보스 전투 중: compact/regroup/리필이 보스 레이아웃과 소환 적을 망가뜨리므로 렌더만 갱신
  if (gameState.bossBattleActive) {
    render()
    return
  }
  // Mirror compactAndRefillRails() as visible beats: cards fall first, then new
  // top cards appear, and the loop repeats until every rail is continuous/full.
  let movedAny = false
  const shouldRegroupFront = !options.suppressFrontRegroupOnce
  if (options.avoidFrontMergeOnFullRefill && frontRowIsEmpty()) {
    // Full-board rebuilds still use merge-safe candidates, but now they enter
    // from the top row first so the front row also arrives via falling refill.
    const seededTop = seedTopRowWithSeparatedRefillRow()
    if (seededTop) {
      movedAny = true
      render()
      await wait(200)
    }
  }
  let safety = LANE_DISTANCE_COUNT * 3 + 3
  while (safety-- > 0) {
    const moved = gameState.compactLanes()
    if (moved) {
      movedAny = true
      if (shouldRegroupFront) gameState.regroupAllRows()
      // If a hand/combo effect makes a bomb fall into the front row, arm it in
      // the same preparation beat so every front-row bomb advertises the same
      // one-action fuse instead of waiting for a later cleanup path.
      turnManager.armFrontBombs()
      render()
      await wait(200)
    }

    let filled = false
    const topDistance = LANE_DISTANCE_COUNT - 1
    for (let laneIndex = 0; laneIndex < gameState.lanes.length; laneIndex++) {
      const lane = gameState.lanes[laneIndex]
      if (lane.getCardAtDistance(topDistance)) continue
      // 보스 전투 중에는 레일 최상단 리필을 억제해 보스 격리 공간을 유지한다
      if (gameState.bossBattleActive) continue
      lane.setCardAtDistance(topDistance, cardSpawner.spawnCardForRefill())
      filled = true
    }
    if (filled) {
      movedAny = true
      if (shouldRegroupFront) gameState.regroupAllRows()
      // If a hand/combo effect makes a bomb fall into the front row, arm it in
      // the same preparation beat so every front-row bomb advertises the same
      // one-action fuse instead of waiting for a later cleanup path.
      turnManager.armFrontBombs()
      render()
      await wait(200)
    }
    if (!moved && !filled) break
  }
  if (shouldRegroupFront) gameState.regroupAllRows()
  trackFieldEnemyEncounters()
  const blooms = turnManager.bloomFrontSeeds(cardSpawner)
  turnManager.armFrontBombs()
  render()
  if (blooms.length > 0) await boardRenderer.animateFlowerBlooms(blooms)
  if (movedAny) await wait(120)
}

function createItemGainLogs(itemNames: string[]): ActivityLogDraft[] {
  return itemNames.map((name) => ({
    label: `손패 획득: ${name}`,
    itemCount: 1,
    kind: 'item-gain',
  }))
}

/**
 * Turn-scaled light-income multiplier. Late turns should still pay more,
 * but the old quadratic curve made 90F wallets explode into six figures.
 * The softened linear curve keeps progression readable without runaway economy.
 *  - turn  1  : ×1.015
 *  - turn 30  : ×1.45
 *  - turn 60  : ×1.90
 *  - turn 90  : ×2.35
 */
function getTurnScoreMultiplier(): number {
  const turn = gameState.getCurrentTurn()
  const base = 1 + Math.max(0, turn) * 0.015
  return base * gameState.enhancements.scoreMultiplier
}

/**
 * Per-removal random jitter on the score reward. Keeps the displayed numbers
 * from looking "ruled" — same enemy kill on the same turn shouldn't always
 * land on exactly the same value. ±12% is enough to make the log read as
 * inflation/situation-driven without making payouts unpredictable.
 */
function scoreInflationJitter(): number {
  return 0.88 + Math.random() * 0.24 // 0.88 ~ 1.12
}

/**
 * Base score for processing one rail card (kill / evade / take / hand-card
 * destroy). Per the design rule: only "you actually dealt with this card"
 * pays out. Trap > Treasure for the same width because stepping on / clearing
 * a trap involves real risk; treasure pickup is a quiet gain.
 *
 *  - Enemy: strength-based — `HP * 12 + ATK * 20`. baseHealth / getDamage()
 *    already include the 2-/3-cell width bonus (Card.getNormalEnemyGroupStats),
 *    so we don't double-count width.
 *  - Mimic (isSpecialEnemy): flat strength + drop-count bonus so a wide / fat
 *    mimic still pays clearly more than a regular enemy of the same span.
 *  - Trap: small flat per width (1/2/3 = 30 / 65 / 110).
 *  - Treasure: smaller flat per width (1/2/3 = 18 / 40 / 75).
 *
 * Caller multiplies the result by `getTurnScoreMultiplier()` via createScoreLog.
 */
function scoreForCardRemoval(card: Card): number {
  if (card.type === CardType.ENEMY) {
    const hp = Math.max(0, card.baseHealth)
    const atk = Math.max(0, card.getDamage())
    const strength = hp * 12 + atk * 20
    const specialBonus = card.isSpecialEnemy ? 60 + card.defeatDropCount * 20 : 0
    return strength + specialBonus
  }
  if (card.type === CardType.TRAP) {
    if (card.groupCount >= 3) return 110
    if (card.groupCount === 2) return 65
    return 30
  }
  if (card.type === CardType.TREASURE) {
    if (card.groupCount >= 3) return 75
    if (card.groupCount === 2) return 40
    return 18
  }
  if (card.type === CardType.FLOWER) {
    return 24 + Math.max(1, card.flowerValue) * 12
  }
  return 0
}

function activityKindForCard(card: Card): ActivityLogEntry['kind'] {
  if (card.type === CardType.ENEMY) return 'enemy'
  if (card.type === CardType.TRAP) return 'trap'
  if (card.type === CardType.FLOWER) return 'score'
  return 'treasure'
}

/** Label shown on the left side of the score log row. Caller guarantees the
 *  card is actually removed by this beat. */
function scoreLabelForCard(card: Card): string {
  if (card.type === CardType.ENEMY) return `${card.name} 처치`
  if (card.type === CardType.TRAP) return `${card.name} 회피`
  if (card.type === CardType.FLOWER) return `${card.name} 수확`
  return `${card.name} 획득`
}

function createScoreLog(
  label: string,
  baseValue: number,
  kind: ActivityLogEntry['kind']
): ActivityLogDraft {
  const amount = Math.max(
    1,
    Math.round(baseValue * getTurnScoreMultiplier() * scoreInflationJitter())
  )
  score += amount
  scorePulseKey++
  return { label, scoreDelta: amount, kind }
}

/**
 * Capture every Card currently on the rail keyed by id, so a hand-card or
 * recipe effect that immediately mutates the model still leaves the score
 * helper a reference to the original Card object (with original baseHealth /
 * getDamage / groupCount intact for the strength formula).
 */
function snapshotFieldCardsById(): Map<string, Card> {
  const map = new Map<string, Card>()
  for (const lane of gameState.lanes) {
    for (let d = 0; d < LANE_DISTANCE_COUNT; d++) {
      const card = lane.getCardAtDistance(d)
      if (card && !map.has(card.id)) map.set(card.id, card)
    }
  }
  return map
}

/**
 * Push one light-gain log per removed rail card and fire ONE light-burst at
 * the end. Used by both the hand-card single-effect beat and the recipe beat.
 *
 * Cards that the snapshot can't resolve (e.g. spore offsprings spawned during
 * the same beat) are silently skipped — they were not "처리" by the player,
 * they appeared from another mechanic.
 */
async function awardScoreForRemovedCards(
  removed: { cardId: string; type: CardType }[],
  snapshot: Map<string, Card>
): Promise<void> {
  if (removed.length === 0) return
  const logs: ActivityLogDraft[] = []
  for (const r of removed) {
    const card = snapshot.get(r.cardId)
    if (!card) continue
    const base = scoreForCardRemoval(card)
    if (base <= 0) continue
    logs.push(createScoreLog(scoreLabelForCard(card), base, activityKindForCard(card)))
  }
  if (logs.length === 0) return
  pushActivityLogsInDisplayOrder(logs)
  await Promise.all(
    removed
      .filter((r) => snapshot.has(r.cardId))
      .map((r) => playResourceTrail({ kind: 'card', cardId: r.cardId }, 'score', 1))
  )
}

/** Coin gain log row — kind: 'score' for consistent warm color, but the
 *  delta is rendered as "+N$" via the badge slot so the wallet event reads
 *  differently from a score row. */
function recordCoinGain(label: string, amount: number): void {
  if (amount <= 0) return
  pushActivityLogsInDisplayOrder([
    {
      label,
      badge: `+${amount}$`,
      kind: 'score',
    },
  ])
}

function actionTypeFor(cardType: CardType): ActionType | null {
  switch (cardType) {
    case CardType.ENEMY:
      return ActionType.ATTACK_ENEMY
    case CardType.TRAP:
      return ActionType.EVADE_TRAP
    case CardType.TREASURE:
      return ActionType.TAKE_TREASURE
    case CardType.FLOWER:
      return ActionType.TAKE_FLOWER
    default:
      return null
  }
}

function syncSpawnerTier(): void {
  cardSpawner.setTier(turnManager.getEmberTier())
  // Spawn progression is based on the upcoming playable turn: 1-10, 11-20, 21+.
  cardSpawner.setProgressionTurn(gameState.getCurrentTurn() + 1)
  syncFinalAscentRuleToSpawner()
}

/** 현재 불씨 티어의 공격력 보너스를 필드의 모든 일반 적에게 동기화한다.
 *  공격력만 가감하고 HP는 절대 건드리지 않는다(회복으로 1체력 적 즉사 방지).
 *  공격력이 새로 증가한 적 id 목록을 반환해 호출부가 위험 연출을 띄울 수 있게 한다. */
function syncFieldEnemyEmberBonus(): string[] {
  const atk = EmberSystem.getEnemyStatBonus(turnManager.getEmberTier()).atk
  const increasedIds: string[] = []
  for (const lane of gameState.lanes) {
    for (let distance = 0; distance < LANE_DISTANCE_COUNT; distance++) {
      const card = lane.getCardAtDistance(distance)
      // 일반 적만 대상(보스/특수 적/합체 무리의 대표 카드는 baseDamage 고정).
      if (!card || card.type !== CardType.ENEMY || card.isSpecialEnemy) continue
      if (atk > card.emberAtkBonus && !increasedIds.includes(card.id)) increasedIds.push(card.id)
      card.emberAtkBonus = atk
    }
  }
  return increasedIds
}

function compactAndRefillAllLanes(): boolean {
  // Delegate gravity + top-refill rules to GameState so row-clearing combo
  // effects cannot leave half-empty rails after a single maintenance pass.
  return gameState.compactAndRefillRails(() => cardSpawner.spawnCardForRefill())
}

/** 현재 레일을 스캔해 적/보스/특수 카드 이름을 도감 발견 집합에 추가한다. */
function trackFieldEnemyEncounters(): void {
  const seen = new Set<Card>()
  for (const lane of gameState.lanes) {
    for (let d = 0; d < LANE_DISTANCE_COUNT; d++) {
      const card = lane.getCardAtDistance(d)
      if (!card || seen.has(card)) continue
      seen.add(card)
      if (card.type === CardType.ENEMY || card.type === CardType.BOSS) {
        gameState.encounteredEnemyNames.add(card.name)
      }
    }
  }
}

function fillBoardAtStart(): void {
  syncSpawnerTier()
  for (let distance = 0; distance < LANE_DISTANCE_COUNT; distance++) {
    const cards = cardSpawner.spawnCardsForOpeningRow(gameState.lanes.length)
    for (let i = 0; i < gameState.lanes.length; i++) {
      const lane = gameState.lanes[i]
      const card = cards[i]
      if (lane && card) {
        lane.setCardAtDistance(distance, card)
      }
    }
  }
  gameState.regroupAllRows()
  trackFieldEnemyEncounters()
}

/** Runs now begin with an empty hand; first cards must come from play rewards. */
function startGame(): void {
  gameActive = true
  inputLocked = false
  chain = HandSystem.newChain()
  pendingHandTarget = null
  gameState.reset()
  finalAscentStarlightRuleActive = false
  syncFinalAscentRuleToSpawner()
  score = 0
  scorePulseKey = 0
  coins = 0
  coinPulseKey = 0
  inkQuillKillCount = 0
  nextActivityLogId = 1
  activityLogs = []
  shopOpen = false
  currentShopOffers = []
  boardRenderer.closeShop()
  syncSpawnerTier()
  fillBoardAtStart()
  turnManager.armFrontBombs()
  boardRenderer.setHandTargetingMode(null)
  boardRenderer.clearSelection()
  const poolSnapshot = runCardPool.snapshot()
  // 메타 사당 해금(영구) + 런 카드풀(임시) 이중 구조를 플레이 로그로 명시한다.
  recordNotice(`카드 풀 초기화: 메타해금 ${poolSnapshot.unlocked.length} / 잠김 ${poolSnapshot.locked.length} / 금지 ${poolSnapshot.banned.length}`, 'info')
  render()
  // 1턴 시작 대사: 살짝 딜레이 후 캐릭터 말풍선 등장
  speechBubble.show('역경 아래, 작은 불빛을 밝혀야만 해.', 800)
}

function buildChainHints() {
  // Precompute which visible hand slots would complete at least one recipe if
  // clicked now. Keeping this in index.ts lets the renderer stay presentation-only
  // while the recipe rules remain centralized in HandSystem/Recipes.ts.
  const recipeReadyBySlot: Record<number, { id: string; name: string; flavor: string }[]> = {}
  gameState.character.hand.forEach((card, slotIndex) => {
    const recipes = HandSystem.previewTriggeredRecipes(chain, card.defId, card.merged === true)
    if (recipes.length === 0) return
    recipeReadyBySlot[slotIndex] = recipes.map((recipe) => ({
      id: recipe.id,
      name: recipe.name,
      flavor: recipe.flavor,
    }))
  })
  return { events: chainTimeline, recipeReadyBySlot }
}

function render(): void {
  const tier = turnManager.getEmberTier()
  // 불씨가 회복되면 적 공격력 보너스가 줄어들어야 하므로 매 렌더마다 필드 적을 동기화한다.
  // (HP는 불변이라 회복으로 적이 죽지 않는다. 증가 연출은 감소 턴 경로에서만 별도 처리.)
  syncFieldEnemyEmberBonus()
  boardRenderer.render(gameState, {
    score,
    logs: activityLogs,
    scorePulseKey,
    coins,
    coinPulseKey,
    emberTier: tier,
    spawnWeights: cardSpawner.getActiveWeights(),
    emberDecayCountdown: gameState.character.emberDecayCountdown,
    vignetteIntensity: EmberSystem.getVignetteIntensity(tier),
    chainHints: buildChainHints(),
    pendingHandTarget,
  })
}

/** Register slash-command debug palette. Opens with `/` like Minecraft chat.
 *  모바일에서는 좌상단 버튼으로 트리거한다. */
function setupDevCommandPalette(): void {
  if (!ENABLE_DEV_COMMAND_PALETTE) return
  const host = document.createElement('div')
  host.className = 'dev-command-palette'
  host.innerHTML = `
    <div class="dev-command-shell">
      <span class="dev-command-prefix">/</span>
      <input class="dev-command-input" type="text" spellcheck="false" autocomplete="off" />
      <button class="dev-command-close" aria-label="닫기">✕</button>
      <div class="dev-command-hint">예시: /25turn, /공격력7, /체력40, /희망, /양초, /1000불빛, /10$</div>
    </div>
    <button class="dev-command-run">실행</button>
  `
  document.body.appendChild(host)

  // 모바일 전용 트리거 버튼 (터치 기기에서만 표시)
  const mobileBtn = document.createElement('button')
  mobileBtn.className = 'dev-command-mobile-btn'
  mobileBtn.textContent = '/'
  mobileBtn.setAttribute('aria-label', '커멘드 팔레트 열기')
  document.body.appendChild(mobileBtn)

  const style = document.createElement('style')
  style.textContent = `
    .dev-command-palette { position: fixed; inset: 0 auto auto 0; width: 100%; z-index: 140; pointer-events: none; opacity: 0; transform: translateY(-8px); transition: opacity .14s ease, transform .14s ease; }
    .dev-command-palette.is-open { opacity: 1; transform: translateY(0); pointer-events: auto; }
    .dev-command-shell { margin: 8px auto 0; width: min(760px, calc(100% - 24px)); border: 1px solid rgba(255,215,120,.4); border-radius: 12px; background: linear-gradient(180deg, rgba(38,26,48,.98), rgba(18,12,24,.98)); box-shadow: 0 14px 28px rgba(0,0,0,.55); padding: 10px 12px; display: grid; grid-template-columns: 18px 1fr auto; grid-template-areas: "prefix input close" "hint hint hint"; column-gap: 8px; row-gap: 6px; }
    .dev-command-prefix { grid-area: prefix; color: rgba(255,215,120,.92); font-weight: 900; align-self: center; }
    .dev-command-input { grid-area: input; border: 0; outline: none; background: transparent; color: rgba(255,245,220,.98); font: 900 15px/1.3 'OkDanDan', Georgia, serif; }
    .dev-command-close { grid-area: close; background: none; border: none; color: rgba(255,215,120,.55); font-size: 14px; cursor: pointer; padding: 0 2px; align-self: center; line-height: 1; }
    .dev-command-close:hover { color: rgba(255,215,120,.9); }
    .dev-command-hint { grid-area: hint; color: rgba(232,214,180,.78); font-size: 12px; }
    .dev-command-run { display: none; margin: 6px auto 0; width: min(760px, calc(100% - 24px)); padding: 8px 0; border: 1px solid rgba(255,215,120,.35); border-radius: 10px; background: rgba(38,26,48,.92); color: rgba(255,215,120,.92); font: 900 14px/1 'OkDanDan', Georgia, serif; cursor: pointer; letter-spacing: .04em; }
    .dev-command-mobile-btn { display: none; position: fixed; top: 8px; left: 8px; width: 34px; height: 34px; border-radius: 9px; border: 1px solid rgba(255,215,120,.38); background: rgba(18,12,24,.88); color: rgba(255,215,120,.9); font: 900 17px/1 'OkDanDan', Georgia, serif; cursor: pointer; z-index: 141; align-items: center; justify-content: center; box-shadow: 0 2px 8px rgba(0,0,0,.5); }
    @media (hover: none) and (pointer: coarse) {
      .dev-command-run { display: block; }
      .dev-command-mobile-btn { display: flex; }
    }
  `
  document.head.appendChild(style)
  const input = host.querySelector<HTMLInputElement>('.dev-command-input')
  const hint = host.querySelector<HTMLDivElement>('.dev-command-hint')
  const runBtn = host.querySelector<HTMLButtonElement>('.dev-command-run')
  const closeBtn = host.querySelector<HTMLButtonElement>('.dev-command-close')
  if (!input || !hint || !runBtn || !closeBtn) return
  let opened = false
  const handNameMap = new Map<string, HandCardId>()
  for (const id of HAND_CARD_IDS) {
    handNameMap.set(id.toLowerCase(), id)
    handNameMap.set(getHandCardDef(id).name.toLowerCase(), id)
  }
  const relicNameMap = new Map<string, RelicId>()
  for (const id of RELIC_IDS) {
    relicNameMap.set(id.toLowerCase(), id)
    relicNameMap.set(getRelicDef(id).name.toLowerCase(), id)
  }
  const setHint = (msg: string): void => { hint.textContent = msg }
  const close = (): void => { opened = false; host.classList.remove('is-open'); input.value = '' }
  const open = (): void => {
    opened = true
    host.classList.add('is-open')
    setHint('예시: /25turn, /공격력7, /체력40, /희망, /양초, /1000불빛, /10$')
    input.value = ''
    window.setTimeout(() => input.focus(), 0)
  }
  const execute = (rawValue: string): void => {
    const token = rawValue.trim().replace(/^\/+/, '')
    if (!token) return
    // Resource debug grants: allow concise numeric commands so designers can
    // test shop pacing without spawning hand/relic side effects.
    const scoreGrantMatch = token.match(/^(\d{1,7})\s*(불빛|점수|score|light)$/i)
    if (scoreGrantMatch) {
      const amount = Number(scoreGrantMatch[1])
      if (!Number.isFinite(amount) || amount <= 0) { setHint('불빛 지급량은 1 이상이어야 합니다.'); return }
      score += amount
      render()
      setHint(`디버그: 불빛 +${amount.toLocaleString()} (현재 ${score.toLocaleString()})`)
      return
    }
    const coinGrantMatch = token.match(/^(\d{1,7})\s*(\$|화폐|코인|coin|coins)$/i)
    if (coinGrantMatch) {
      const amount = Number(coinGrantMatch[1])
      if (!Number.isFinite(amount) || amount <= 0) { setHint('화폐 지급량은 1 이상이어야 합니다.'); return }
      coins += amount
      render()
      setHint(`디버그: 화폐 +${amount.toLocaleString()}$ (현재 ${coins.toLocaleString()}$)`)
      return
    }
    const turnMatch = token.match(/^(\d{1,3})\s*turn$/i)
    if (turnMatch) {
      const turn = Number(turnMatch[1])
      if (!Number.isFinite(turn) || turn < 1 || turn > 100) { setHint('턴 이동은 1~100 범위만 가능합니다.'); return }
      gameState.setCurrentTurnForDebug(turn)
      syncSpawnerTier()
      render()
      setHint(`디버그: ${turn}턴으로 이동`)
      return
    }
    const attackSetMatch = token.match(/^공격력\s*(\d{1,4})$/i)
    if (attackSetMatch) {
      const amount = Number(attackSetMatch[1])
      if (!Number.isFinite(amount) || amount < 1) { setHint('공격력은 1 이상이어야 합니다.'); return }
      // 디버그 명령은 누적 증가가 아니라 현재 공격력을 지정값으로 맞춘다.
      gameState.character.setDamageForDebug(amount)
      render()
      boardRenderer.playHudCounterFeedback('attack', gameState.character.damage)
      setHint(`디버그: 공격력 ${gameState.character.damage.toLocaleString()}으로 설정`)
      return
    }
    const healthSetMatch = token.match(/^체력\s*(\d{1,4})$/i)
    if (healthSetMatch) {
      const amount = Number(healthSetMatch[1])
      if (!Number.isFinite(amount) || amount < 1) { setHint('체력은 1 이상이어야 합니다.'); return }
      // 체력 명령은 전투 테스트용으로 현재 HP와 최대 HP를 동시에 맞춘다.
      gameState.character.setHealthForDebug(amount)
      render()
      boardRenderer.playHudCounterFeedback('health', gameState.character.health)
      boardRenderer.playHudCounterFeedback('maxHealth', gameState.character.maxHealth)
      setHint(`디버그: 체력/최대체력 ${gameState.character.health.toLocaleString()}으로 설정`)
      return
    }
    const key = token.toLowerCase()
    const relicId = relicNameMap.get(key)
    if (relicId) {
      const ok = gameState.character.addRelic(relicId)
      render()
      setHint(ok ? `디버그: 유물 지급 (${getRelicDef(relicId).name})` : '이미 보유 중이거나 지급할 수 없습니다.')
      return
    }
    const handId = handNameMap.get(key)
    if (handId) {
      const ok = gameState.character.addHandCard(DropSystem.makeCard(handId))
      render()
      setHint(ok ? `디버그: 손패 지급 (${getHandCardDef(handId).name})` : '손패가 가득 찼습니다.')
      return
    }
    setHint('알 수 없는 명령어입니다. /25turn, /공격력7, /체력40, /희망, /양초, /1000불빛, /10$')
  }

  // 닫기 버튼 (shell 우상단 ✕)
  closeBtn.addEventListener('click', () => close())
  // 모바일 트리거 버튼 — 터치 기기에서 팔레트를 여는 진입점
  mobileBtn.addEventListener('click', () => open())
  // 모바일 실행 버튼 — 가상 키보드의 Enter 대신 탭으로 실행
  runBtn.addEventListener('click', () => { execute(input.value); input.select() })
  // 외부 클릭/탭으로 닫기 — host 영역 바깥을 누르면 닫힌다
  document.addEventListener('pointerdown', (e) => {
    if (!opened) return
    if (!host.contains(e.target as Node)) close()
  })

  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && !opened) {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return
      e.preventDefault()
      open()
      return
    }
    if (!opened) return
    if (e.key === 'Escape') {
      e.preventDefault()
      close()
    }
  })
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      execute(input.value)
      input.select()
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      close()
    }
  })
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

type NoticeLogKind = 'info' | 'win' | 'hurt' | 'melt' | 'recipe' | 'gauge' | 'relic'

/**
 * The activity log on the left panel is now strictly "resource acquired /
 * resource spent" — light / coin / hand card gain rows + the relic-purchase
 * deduction row. All other textual notices (damage taken, relic activation,
 * gauge / recipe text, ember decay, shop status) are communicated via the
 * chain banner, damage-float numbers, relic chip appearance, or the pulse
 * animations on the resource numbers. So recordNotice is kept as a no-op
 * stub (callers still compile) for any future opt-in channels.
 */
function recordNotice(_message: string, _kind: NoticeLogKind = 'info'): void {
  // Intentionally empty — see comment above. Do not push to activityLogs.
}

/** 상점/제단과 보스 보상·시련 단계에서는 체인 로그를 노출하지 않는다.
 *  - 상점: 유물 구매·선물 상자 등은 전투 콤보가 아니라 체인이 뜰 자리가 아니다.
 *  - 보스 보상: 손패 사용 차단(postPhaseHandLocked)과 함께 체인도 끊는다. */
function chainRecordingSuppressed(): boolean {
  return shopOpen || bossController.postPhaseHandLocked
}

/** Record relic activation in the floating chain-area toast only. */
function recordRelicActivation(relicId: RelicId, message: string): void {
  // 상점/보스 보상 단계에서 발동한 유물 효과는 체인 로그에 남기지 않는다.
  if (chainRecordingSuppressed()) return
  const relic = getRelicDef(relicId)
  chainTimeline.push({
    kind: 'relic',
    relicId,
    name: relic.name,
    flavor: message,
    uid: nextChainUid(),
  })
  boardRenderer.refreshChainBanner(buildChainHints())
}

function candleModeLabel(mode: CandleMode): string {
  switch (mode) {
    case 'max-health':
      return '최대 체력'
    case 'attack':
      return '공격력'
    case 'ember':
      return '불씨 최대치'
    case 'draw':
      return '손패 최대치'
  }
}

/** Apply the selected full-gauge payoff and preserve overflow for the next gauge. */
function fireCandleGaugeEffect(): {
  name: string
  message: string
  mode: CandleMode
} | null {
  const character = gameState.character
  if (!character.isCandleFull()) return null
  const mode = character.candleMode
  let message = ''
  switch (mode) {
    case 'max-health': {
      const amount = character.increaseMaxHealth(5)
      message = `최대 체력 +${amount}`
      break
    }
    case 'attack':
      character.applyDamageBoost()
      message = '공격력 +1'
      break
    case 'ember': {
      // 자원 회복 대신 불씨 최대치를 +2 영구 증가(헤드룸도 함께 채움)로 전환.
      const amount = character.increaseEmberMax(2)
      message = `불씨 최대치 +${amount}`
      break
    }
    case 'draw': {
      // 랜덤 손패 대신 손패 최대치를 +2 영구 증가로 전환.
      const amount = character.increaseHandMax(2)
      message = `손패 최대치 +${amount}`
      break
    }
  }
  // Spend only one full gauge so combo-count overflow starts filling the next one.
  character.consumeFullCandleGauge()
  return { name: `게이지: ${candleModeLabel(mode)}`, message, mode }
}

/** Resolve every full hand-combo gauge from any source that can add candle
 *  progress. Hand-card plays, lavender flowers, and future relics all share
 *  this payoff loop so a gauge reaching 10 never depends on which system
 *  supplied the final point. */
async function resolveFullCandleGaugeEffects(source: ResourceTrailSource): Promise<void> {
  while (gameState.character.isCandleFull()) {
    await wait(GAUGE_TRIGGER_DELAY_MS)
    const beforeGaugeRecovery = snapshotPlayerRecovery()
    const beforeGaugeResources = snapshotPlayerResources()
    const gauge = fireCandleGaugeEffect()
    if (!gauge) break
    recordNotice(`${gauge.name}: ${gauge.message}`, 'gauge')
    // 상점/보스 보상 단계의 게이지 페이오프는 체인 로그에서 제외한다.
    if (!chainRecordingSuppressed()) {
      chainTimeline.push({
        kind: 'gauge',
        mode: gauge.mode,
        name: gauge.name,
        flavor: gauge.message,
        uid: nextChainUid(),
      })
      boardRenderer.refreshChainBanner(buildChainHints())
    }
    // The payoff spends one full 10-step gauge immediately after firing. Roll
    // that decrease on the live gauge as its own drain beat, so overflow such
    // as 13 progress visibly settles to 3 instead of snapping on the next render.
    boardRenderer.playHudCounterFeedback('candle', gameState.character.candle)
    await playPlayerGainTrails(source, beforeGaugeResources)
    // 불씨/손패 최대치 모드는 상단 HUD 카운터를 즉시 굴려 증가를 읽히게 한다.
    if (gauge.mode === 'ember') {
      boardRenderer.playHudCounterFeedback('emberMax', gameState.character.emberMax)
    } else if (gauge.mode === 'draw') {
      render()
    }
    await applyBloodPackRecoveryTrigger(beforeGaugeRecovery)
  }
}

document.addEventListener('cardAction', (e: Event) => {
  speechBubble.dismiss()
  void handleCardAction(e)
})

document.addEventListener('itemAction', (e: Event) => {
  speechBubble.dismiss()
  const detail = (e as CustomEvent<ItemActionDetail>).detail
  void handleHandSlotClick(detail.itemIndex)
})

document.addEventListener('chainReset', () => {
  if (chain.sequence.length === 0 && chainTimeline.length === 0) return
  HandSystem.resetChain(chain)
  clearChainTimeline()
  render()
})

document.addEventListener('candleModeCycle', () => {
  // 상점/제단은 inputLocked 상태지만 콤보 게이지 모드 전환은 안전한 idle 동작이라 허용한다.
  if (!gameActive || (inputLocked && !shopOpen)) return
  gameState.character.cycleCandleMode()
  render()
})

document.addEventListener('candleModeSelect', (e: Event) => {
  // 상점/제단은 inputLocked 상태지만 콤보 게이지 모드 전환은 안전한 idle 동작이라 허용한다.
  if (!gameActive || (inputLocked && !shopOpen)) return
  const detail = (e as CustomEvent<{ mode: CandleMode }>).detail
  if (!detail?.mode) return
  gameState.character.setCandleMode(detail.mode)
  render()
})

document.addEventListener('shopBuy', (e: Event) => {
  void handleShopBuy((e as CustomEvent<ShopBuyDetail>).detail)
})

document.addEventListener('shopPackPick', (e: Event) => {
  void handleShopPackPick((e as CustomEvent<ShopPackPickDetail>).detail)
})

document.addEventListener('shopClose', () => {
  void closeShopAndResume()
})

/** Click on a hand slot. Plain click = use single (or arm targeting). */
async function handleHandSlotClick(slotIndex: number): Promise<void> {
  if (!gameActive || inputLocked) return
  // 보스 격파 후 보상·시련 단계 동안 손패 사용 차단(사용자 요청).
  if (bossController.postPhaseHandLocked) return
  const character = gameState.character
  const card = character.hand[slotIndex]
  if (!card) return
  const def = getHandCardDef(card.defId)

  // Plain click on a targeted card arms it; merged 키틴/밀랍 switch
  // to broad field/front effects, so those enhanced cards should fire directly.
  const activeTargeting = card.merged === true ? def.targeting.triple : def.targeting.base
  if (activeTargeting.selection === 'target') {
    if (pendingHandTarget && pendingHandTarget.slotIndex === slotIndex) {
      pendingHandTarget = null
      boardRenderer.setHandTargetingMode(null)
      render()
      return
    }
    pendingHandTarget = { slotIndex, defId: def.id }
    boardRenderer.setHandTargetingMode({ slotIndex, defId: def.id })
    render()
    return
  }

  await applyHandSingle(slotIndex)
}

/** Broad clears get the opening-board mercy rule: the freshly rebuilt front
 *  row waits one player action before it can collapse into a 2/3-lane group. */
function shouldSuppressRegroupAfterClear(removedCount: number): boolean {
  return removedCount >= Math.ceil(gameState.lanes.length * LANE_DISTANCE_COUNT * 0.65)
}

/** Apply a single-use hand card (with optional target). */
async function applyHandSingle(
  slotIndex: number,
  target?: { laneIndex: number; distance: number; card: Card }
): Promise<void> {
  inputLocked = true
  // Capture the card def BEFORE useSingle mutates the slot — we need the
  // category to pick a burst theme, and the slot is empty after consumption.
  const usedCard = gameState.character.hand[slotIndex]
  const usedDef = usedCard ? getHandCardDef(usedCard.defId) : null
  const beforeSingleFreeze = snapshotFieldFreezeState()
  const beforeSingleHealth = snapshotFieldHealthState()
  const beforeSingleRecovery = snapshotPlayerRecovery()
  const beforeSingleResources = snapshotPlayerResources()
  // Snapshot rail cards by id BEFORE useSingle mutates the model, so we can
  // still resolve baseHealth/getDamage on the removed cards for the score
  // strength formula.
  const beforeSingleCards = snapshotFieldCardsById()
  const result = HandSystem.useSingle(gameState, chain, slotIndex, target)
  if (!result.success) {
    inputLocked = false
    render()
    return
  }
  // 보스는 디버프 면역 규칙을 따른다. 밀랍 계열 사용 시 보스에게 굳음 스택이 남아있다면
  // 즉시 저항 연출을 띄우고 해제해, "저항 후 즉시 무효" 감각을 일관되게 유지한다.
  await resolveBossDebuffImmunityOnWaxUse(usedDef?.id ?? null)
  // Reveal the used hand card near screen center, then dissolve it with its
  // category burst. This makes the hand action read like a card being played
  // instead of a slot-local pop.
  const handUseTheme = usedDef ? burstThemeForCategory(usedDef.category) : null
  if (handUseTheme) {
    // Start the flight clone, then continue immediately. The model hand card is
    // already consumed, so the compact slot can disappear on the next render
    // while the larger played-card ghost lingers over the field.
    void boardRenderer.animateHandCardUse(slotIndex, handUseTheme)
  }
  // If this card damaged or hardened/thawed a target, add the one-shot
  // feedback before the next render changes the persistent field state. The
  // damaged id set is reused below so a lethal hit does not also fire a second
  // consume burst at the same location.
  absorbBossShieldAfterFieldEffect(beforeSingleHealth)
  const singleDamageLosses = diffFieldHealthLosses(beforeSingleHealth)
  const singleDamagedIds = new Set(singleDamageLosses.map((loss) => loss.cardId))
  const newlyFrozenIds = diffNewlyFrozenCards(beforeSingleFreeze)
  const thawedIds = diffThawedCards(beforeSingleFreeze)
  const affectedCardIds = [
    ...(target ? [target.card.id] : []),
    ...singleDamageLosses.map((loss) => loss.cardId),
    ...result.removedFieldCards.map((removed) => removed.cardId),
    ...newlyFrozenIds,
    ...thawedIds,
  ]
  // The played-card preview dissolves at center; this square-card blast points
  // from that center beat to every field cell that was hit, removed, gained, or hardened.
  if (handUseTheme) await playHandTargetBlasts(affectedCardIds, handUseTheme)
  await Promise.all([
    boardRenderer.animateDamageNumbersById(singleDamageLosses),
    boardRenderer.animateWaxFreezeByIds(newlyFrozenIds),
    boardRenderer.animateWaxThawByIds(thawedIds),
  ])
  // 손패 피해가 보스에게 닿았다면 HP 바 카운터를 즉시 반영한다.
  if (bossController.eventState && singleDamagedIds.has(bossController.eventState.card.id)) {
    boardRenderer.playHudCounterFeedback('boss-hp', Math.max(0, bossController.eventState.card.getHealth()))
  }
  await applyBloodPackRecoveryTrigger(beforeSingleRecovery)
  await applyDignifiedResponseDamage(singleDamagedIds)
  // Append only the just-used card first. Recipes are resolved below after
  // a small delay so the previous card's effect visibly lands before the combo.
  if (usedDef) {
    chainTimeline.push({
      kind: 'card',
      defId: usedDef.id,
      name: usedDef.name,
      category: usedDef.category,
      uid: nextChainUid(),
    })
    // Combo-count bonuses stay in the use result/log message only; adding
    // duplicate banner entries would read as extra physical cards consumed.
    boardRenderer.refreshChainBanner(buildChainHints())
  }
  await playPlayerGainTrails({ kind: 'center' }, beforeSingleResources)
  if (result.coinsGained && result.coinsGained > 0) {
    coins += result.coinsGained
    coinPulseKey++
    await playResourceTrail({ kind: 'center' }, 'coin', result.coinsGained)
    if (usedDef) recordCoinGain(usedDef.name, result.coinsGained)
  }
  pendingHandTarget = null
  boardRenderer.setHandTargetingMode(null)

  // Light for any field cards the hand-card effect just removed (kill / clear
  // / grab). Same strength formula as direct clicks, so 손패 사용 도 "직접
  // 타격" 과 동일한 점수 룰을 따른다.
  await awardScoreForRemovedCards(result.removedFieldCards, beforeSingleCards)

  // Animate removals caused by the single hand card while the old board DOM is
  // still present. This is the "previous effect" beat the combo waits for.
  if (result.removedFieldCards.length > 0) {
    await boardRenderer.animateCardConsumeByIds(result.removedFieldCards, {
      suppressBurstIds: singleDamagedIds,
    })
    await onEnemiesDefeated(
      result.removedFieldCards.filter((removed) => removed.type === CardType.ENEMY).length
    )
    await applyWaxCrowTreasureGains(
      result.removedFieldCards.filter((removed) => removed.type === CardType.TREASURE).length
    )
  }

  // Prepare the rail immediately after the single card effect. Recipes should
  // resolve against a compacted/refilled/front-regrouped board, preventing holes
  // after effects such as 한 걸음씩 or 밀매 remove cards from the field.
  await runPreparationRefreshAfterFieldEffects({
    suppressFrontRegroupOnce: shouldSuppressRegroupAfterClear(result.removedFieldCards.length),
  })

  // Resolve combo recipes one at a time. Each recipe gets its own delay,
  // animations, and preparation refresh so chained removals cannot leave rail
  // gaps and active-row cards can merge before the next recipe checks the board.
  let recipeSafety = 32
  while (HandSystem.hasPendingRecipe(chain) && recipeSafety-- > 0) {
    await wait(COMBO_TRIGGER_DELAY_MS)
    const beforeRecipeFreeze = snapshotFieldFreezeState()
    const beforeRecipeHealth = snapshotFieldHealthState()
    const beforeRecipeRecovery = snapshotPlayerRecovery()
    // Capture pre-recipe field so we can score whatever the recipe removes.
    const beforeRecipeCards = snapshotFieldCardsById()
    const recipeResult = HandSystem.fireNextPendingRecipe(gameState, chain)
    if (recipeResult.firedRecipes.length === 0) break
    if ((recipeResult.coinsGained ?? 0) > 0) {
      // Recipe currency uses the same wallet/pulse language as single coin cards.
      const gainedCoins = recipeResult.coinsGained ?? 0
      coins += gainedCoins
      coinPulseKey++
      await playResourceTrail({ kind: 'chain' }, 'coin', gainedCoins)
      // Attribute the coin log row to the first fired recipe that produced it.
      const coinRecipe = recipeResult.firedRecipes[0]?.recipe
      if (coinRecipe) recordCoinGain(coinRecipe.name, gainedCoins)
    }
    for (const fired of recipeResult.firedRecipes) {
      // 보스 전투 중 즉사·전방소멸 레시피 시도 → 보스는 이미 면역 처리됐으므로 저항 연출만 재생.
      if (
        bossController.eventState &&
        (fired.recipe.effect === 'destroy-random-front-enemy' || fired.recipe.effect === 'clear-front-cards')
      ) {
        void boardRenderer.playBossFreezeResist(bossController.eventState.card.id)
      }
      chainTimeline.push({
        kind: 'recipe',
        recipeId: fired.recipe.id,
        name: fired.recipe.name,
        flavor: fired.recipe.flavor,
        uid: nextChainUid(),
      })
    }
    boardRenderer.refreshChainBanner(buildChainHints())
    // Recipe-drawn hand cards (셔플 / 따뜻함 등) log one acquisition row each
    // so "손패를 뽑는 행위" 가 어디서 발생했든 일관되게 활동 로그에 표기된다.
    if (recipeResult.drawnHandCardDefIds && recipeResult.drawnHandCardDefIds.length > 0) {
      pushActivityLogsInDisplayOrder(
        createItemGainLogs(recipeResult.drawnHandCardDefIds.map((id) => getHandCardDef(id).name))
      )
      // Same pattern as the single-card path: mount the new slots first so
      // they hold invisibly at the spawn point during the trail flight and
      // pop in exactly when each burst lands.
      render()
      await playResourceTrail({ kind: 'chain' }, 'hand', recipeResult.drawnHandCardDefIds.length)
    }

    // Recipe effects get their own damage diff after the combo delay. As above,
    // cards killed by that damage keep their damage burst and only suppress the
    // later removal burst.
    absorbBossShieldAfterFieldEffect(beforeRecipeHealth)
    const recipeDamageLosses = diffFieldHealthLosses(beforeRecipeHealth)
    const recipeDamagedIds = new Set(recipeDamageLosses.map((loss) => loss.cardId))
    await boardRenderer.animateDamageNumbersById(recipeDamageLosses)
    // 보스 피해 시 HP 바 카운터를 즉시 반영한다.
    if (bossController.eventState && recipeDamagedIds.has(bossController.eventState.card.id)) {
      boardRenderer.playHudCounterFeedback('boss-hp', Math.max(0, bossController.eventState.card.getHealth()))
    }
    await applyBloodPackRecoveryTrigger(beforeRecipeRecovery)
    await applyDignifiedResponseDamage(recipeDamagedIds)
    await boardRenderer.animateWaxFreezeByIds(diffNewlyFrozenCards(beforeRecipeFreeze))
    await boardRenderer.animateWaxThawByIds(diffThawedCards(beforeRecipeFreeze))

    // Light for recipe-driven removals.
    await awardScoreForRemovedCards(recipeResult.removedFieldCards, beforeRecipeCards)

    // Animate cards removed by delayed recipes separately so combo impact reads
    // as its own hit instead of merging with the hand-card effect animation.
    if (recipeResult.removedFieldCards.length > 0) {
      await boardRenderer.animateCardConsumeByIds(recipeResult.removedFieldCards, {
        suppressBurstIds: recipeDamagedIds,
      })
      await onEnemiesDefeated(
        recipeResult.removedFieldCards.filter((removed) => removed.type === CardType.ENEMY).length
      )
      await applyWaxCrowTreasureGains(
        recipeResult.removedFieldCards.filter((removed) => removed.type === CardType.TREASURE)
          .length
      )
    }
    await runPreparationRefreshAfterFieldEffects({
      suppressFrontRegroupOnce: shouldSuppressRegroupAfterClear(
        recipeResult.removedFieldCards.length
      ),
    })
  }

  // Full gauge fires last: card effect -> recipe effect -> gauge effect.
  // Overflow is consumed one 10-slot gauge at a time so a large `카드` bonus can
  // roll remaining progress into the next gauge, and future larger bonuses can
  // safely trigger multiple payoffs in sequence.
  await resolveFullCandleGaugeEffects({ kind: 'chain' })

  // Refill after all delayed recipe/gauge effects have resolved. This is the
  // UI-facing preparation refresh: removed cards are compacted and replaced in
  // one beat so the rail never displays holes before input unlocks.
  await runPreparationRefreshAfterFieldEffects()
  // 손패 카드(조합식 포함)로 보스 HP가 깎였다면 HP 3 임계 손패 트리거 + 격파 검사.
  // 클릭 데미지·손패 데미지·조합식 데미지 어느 경로든 동일한 후처리가 적용된다.
  await bossController.applyPostHandEffect()
  setTimeout(() => {
    inputLocked = false
  }, 320)
}

/** Boss debuff immunity: wax attempts are resisted immediately, and legacy
 *  frozen stacks (if any) are cleared on that same beat so no carry-over freeze remains. */
async function resolveBossDebuffImmunityOnWaxUse(usedDefId: string | null): Promise<void> {
  if (!bossController.eventState) return
  if (usedDefId !== 'wax') return
  const boss = bossController.eventState.card
  const hadFrozen = boss.isFrozen()
  // 면역 대상은 스택 수와 무관하게 즉시 정리한다.
  if (hadFrozen) boss.clearFrozen()
  await boardRenderer.playBossFreezeResist(boss.id)
  recordNotice('보스가 디버프를 저항하며 굳음을 즉시 떨쳐냈다', 'info')
}

async function runCleanupPhase(advanceTurn: boolean): Promise<void> {
  if (advanceTurn && !turnManager.isBossPhase()) {
    const beforeTurnFreeze = snapshotFieldFreezeState()
    gameState.nextTurn()
    await boardRenderer.animateWaxThawByIds(diffThawedCards(beforeTurnFreeze))
    // Reset chain on every turn boundary — the player should not be able to
    // hold an unbounded chain across many turns. Also clear the UI timeline
    // so the chain banner fades out at the same beat.
    HandSystem.resetChain(chain)
    clearChainTimeline()
    // Tick the ember decay countdown; ember decreases every 3rd turn.
    const tickedDown = turnManager.tickEmberDecay()
    syncSpawnerTier()
    if (tickedDown) {
      const ember = gameState.character.ember
      recordNotice(`불씨가 사그라들었다 (${ember}/${gameState.character.emberMax})`, 'hurt')
      // 불씨 하락으로 필드 적의 공격력이 오르면, 적 카드가 붉게 확대되며
      // 잔상을 남기는 위험 연출을 띄운다(HP는 불변, 공격력만 동적 반영).
      const empoweredIds = syncFieldEnemyEmberBonus()
      if (empoweredIds.length > 0) {
        render()
        await boardRenderer.animateEnemyEmberEmpower(empoweredIds)
      }
    }
    await applyTurnStartRelics()
  }

  const moved = compactAndRefillAllLanes()
  render()
  if (moved) await wait(460)

  gameState.regroupAllRows()
  trackFieldEnemyEncounters()
  const blooms = turnManager.bloomFrontSeeds(cardSpawner)
  turnManager.armFrontBombs()
  boardRenderer.clearSelection()
  render()
  if (blooms.length > 0) await boardRenderer.animateFlowerBlooms(blooms)
}

async function resolvePostDropSporeSpread(): Promise<void> {
  // Spores are the only turn-timer event that intentionally waits for rail
  // gravity. This keeps enemy/chest/bomb/flower beats on the pre-drop board,
  // while still letting spores infect a real card that fell into a formerly
  // empty neighboring cell after the rail descended.
  const sporeTicks = turnManager.tickSporeCountdowns()
  const hasReadySpore = sporeTicks.some((tick) => tick.turnsUntilSpread === 0)
  if (sporeTicks.length > 0) {
    // 2→1→0 뱃지 흐름을 눈으로 읽은 뒤 전염/2턴 리셋이 이어지도록 분리 렌더한다.
    render()
    if (hasReadySpore) await wait(260)
  }

  const sporeSpreads = turnManager.spreadReadySpores()
  if (sporeSpreads.length === 0) {
    // 감염 대상이 없어도 준비된 포자는 0턴 시도 후 2턴으로 돌아가므로 뱃지를 갱신한다.
    if (hasReadySpore) render()
    return
  }

  const spreadCount = sporeSpreads.reduce((sum, spread) => sum + spread.infected.length, 0)
  // TurnManager already regroups newly adjacent front-row spores before this
  // render, so the shutter/open-turn view cannot show separate matching spores.
  recordNotice(`포자 번식: ${spreadCount}칸 감염`, 'hurt')
  render()
}

async function resolveEventPhaseAndPrepareNextTurn(advanceTurn: boolean = true): Promise<void> {
  const beforeTrapHealth = snapshotFieldHealthState()
  const hits = turnManager.runEnemyPhase()
  const treasureChanges = turnManager.applyTreasureVolatility(cardSpawner)
  const bombExplosions = turnManager.applyBombExplosions()
  const flowerChanges = turnManager.applyFlowerGrowthAndWilt(cardSpawner)
  const eventAnimations: Promise<void>[] = []
  if (hits.length > 0) eventAnimations.push(boardRenderer.animateEnemyAttacks(hits))
  if (treasureChanges.length > 0) {
    eventAnimations.push(boardRenderer.animateTreasureChanges(treasureChanges))
  }
  if (bombExplosions.length > 0) {
    for (const explosion of bombExplosions) {
      recordNotice(`${explosion.cardName} 폭발! -${explosion.playerDamage}`, 'hurt')
    }
    // Sequenced beat so the shake + bomb-blast burst is fully visible before
    // the floating damage numbers and player impact land on top of it.
    const playerDamageTotal = bombExplosions.reduce(
      (sum, explosion) => sum + explosion.playerDamage,
      0
    )
    const damageLosses = diffFieldHealthLosses(beforeTrapHealth)
    eventAnimations.push(
      (async () => {
        await boardRenderer.animateBombExplosion(bombExplosions)
        await Promise.all([
          boardRenderer.animateDamageNumbersById(damageLosses),
          boardRenderer.animateDamageImpactOnElement(
            boardRenderer.findCardElement('__player__') ??
              document.querySelector<HTMLElement>('.player-card'),
            playerDamageTotal
          ),
        ])
      })()
    )
  }
  if (flowerChanges.growths.length > 0) {
    eventAnimations.push(boardRenderer.animateFlowerGrowth(flowerChanges.growths))
  }
  if (flowerChanges.wilts.length > 0) {
    for (const wilt of flowerChanges.wilts)
      recordNotice(`${wilt.flowerName}이(가) 괴물꽃으로 시듦`, 'hurt')
    eventAnimations.push(boardRenderer.animateFlowerWilts(flowerChanges.wilts))
  }
  if (eventAnimations.length > 0) await Promise.all(eventAnimations)

  const totalDamage = hits.reduce((acc, h) => acc + h.damage, 0)
  if (totalDamage > 0) {
    recordNotice(`적 공격! -${totalDamage}`, 'hurt')
    render()
    await boardRenderer.animateDamageImpactOnElement(
      boardRenderer.findCardElement('__player__') ??
        document.querySelector<HTMLElement>('.player-card'),
      totalDamage
    )
  }
  if (gameState.isGameOver) {
    if (await tryResolveHopeRevive()) {
      // Hope consumes the fatal event and starts a fresh player decision beat;
      // do not continue into cleanup/shop timing from the lethal turn.
      inputLocked = false
      return
    }
    finishTurn()
    return
  }

  await runCleanupPhase(advanceTurn)
  await resolvePostDropSporeSpread()

  if (await maybeRunMilestoneEventsAfterTurn()) return
  if (await maybeOpenShopAfterTurn()) return

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

  const lane = gameState.getLane(laneIndex)
  if (!lane) return

  // Targeted hand card armed → any valid 3×3 field click can feed its target.
  // 보스 카드도 BOSS 타입으로 enemy 필터에 매칭되므로 동일한 흐름으로 처리.
  if (pendingHandTarget !== null) {
    const armed = pendingHandTarget
    pendingHandTarget = null
    boardRenderer.setHandTargetingMode(null)
    await applyHandSingle(armed.slotIndex, { laneIndex, distance, card })
    // 손패 효과로 BOSS HP가 0이 됐다면 같은 격파 흐름으로 합류한다.
    await bossController.applyPostHandEffect()
    return
  }

  if (distance !== 0) return

  // 보스 카드(5번째 카드 종류) 클릭은 일반 적 흐름이 아니라 별도 가상 턴 처리.
  if (card.type === CardType.BOSS && bossController.eventState && bossController.eventState.card === card) {
    await bossController.handleClick(card)
    return
  }

  // 밀랍 조각사 후방 페이즈의 소환 적은 일반 턴 흐름(리필/상점/제단/합산)을 타지 않도록
  // 컨트롤러가 직접 처리한다.
  if (bossController.isSummonedEnemy(card)) {
    await bossController.handleSummonedEnemyClick(card)
    return
  }

  // 보상 단계의 보물 카드 클릭은 일반 보물 ActionSystem 흐름이 아니라 보상 분기로.
  if (bossController.rewardState && bossController.isRewardCard(card)) {
    await bossController.handleRewardClaim(card)
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
      await boardRenderer.animateDamageImpactOnElement(
        document.querySelector<HTMLElement>('.player-card'),
        dmg
      )
      if (!gameState.character.isAlive() || gameState.isGameOver) {
        if (await tryResolveHopeRevive()) {
          // A fatal first strike is fully absorbed by Hope; resume on the
          // player's turn instead of spending the revived turn immediately.
          inputLocked = false
          return
        }
        finishTurn()
        return
      }
    }
  }

  if (card.type === CardType.ENEMY) {
    await boardRenderer.animatePlayerAttack(card)
  }
  const beforeActionHealth = snapshotFieldHealthState()
  const beforeActionResources = snapshotPlayerResources()
  const result = ActionSystem.executeAction(gameState.getCharacter(), lane, card, actionType)
  // Hand-card rewards are staged visually: first the freshly gained cards
  // drop into the hand, then any resulting triple synthesis resolves after
  // that landing beat instead of appearing as an already-merged card.
  let gainedHandCardCount = 0
  const rewardFeedbacks: Promise<void>[] = []
  if (result.success) {
    const gainedItems = result.itemGainedNames ?? []
    gainedHandCardCount = gainedItems.length
    // Only acquisitions produce log rows now: hand-card drops + light gain.
    // Damage / overflow / textual results live on damage-floats, the light
    // pulse, and the chain banner.
    if (gainedItems.length > 0) {
      pushActivityLogsInDisplayOrder(createItemGainLogs(gainedItems))
      // Mount the freshly-gained hand slots BEFORE the trail launches so each
      // slot can wait through the trail flight and materialize at the exact
      // moment its burst lands at the combo-gauge spawn point. The slots' CSS
      // delay (hand-card-drop) folds in the 330ms trail flight time, and
      // alignNewHandSlotsWithTrailSpawn pins their start offset to that same
      // spawn Y. The field card cell stays in DOM because gameState still
      // owns it until removeCardFromRow runs after sameBeatAnimations.
      render()
      rewardFeedbacks.push(
        playResourceTrail({ kind: 'card', cardId: card.id }, 'hand', gainedItems.length)
      )
    }
    if (result.cardRemoved && card.type !== CardType.FLOWER) {
      const base = scoreForCardRemoval(card)
      if (base > 0) {
        pushActivityLogsInDisplayOrder([
          createScoreLog(scoreLabelForCard(card), base, activityKindForCard(card)),
        ])
        rewardFeedbacks.push(playResourceTrail({ kind: 'card', cardId: card.id }, 'score', 1))
      }
    }
    if (result.cardRemoved && card.type === CardType.TREASURE) {
      // Relic side-rewards still mutate through their owner, but their visible
      // trail now resolves on impact so they no longer add an extra late delay.
      rewardFeedbacks.push(applyWaxCrowTreasureGains(1))
    }
    if (result.cardRemoved && card.type === CardType.FLOWER) {
      // Flower light/coin/stat rewards are kicked off together; the board render
      // below happens as the destination burst lands, not after a separate pause.
      const theme = flowerRewardTheme(card.flowerKind)
      if (result.flowerReward?.kind === 'score') {
        pushActivityLogsInDisplayOrder([
          createScoreLog(`${card.name} 수확`, 24 + result.flowerReward.amount * 12, 'score'),
        ])
        rewardFeedbacks.push(
          playResourceTrail({ kind: 'card', cardId: card.id }, 'score', 1, theme)
        )
      } else if (result.flowerReward?.kind === 'coin') {
        coins += result.flowerReward.amount
        coinPulseKey++
        recordCoinGain(`${card.name} 수확`, result.flowerReward.amount)
        rewardFeedbacks.push(
          playResourceTrail(
            { kind: 'card', cardId: card.id },
            'coin',
            result.flowerReward.amount,
            theme
          )
        )
      }
      rewardFeedbacks.push(
        playPlayerGainTrails({ kind: 'card', cardId: card.id }, beforeActionResources, {
          health: theme,
          shield: theme,
          gauge: theme,
        })
      )
    }
  }
  const sameBeatAnimations: Promise<void>[] = []
  if (result.damageDealt && result.damageDealt > 0) {
    sameBeatAnimations.push(
      boardRenderer.animateDamageNumbersById(diffFieldHealthLosses(beforeActionHealth))
    )
  }
  if (result.damageTaken && result.damageTaken > 0) {
    // Trap penalties are already applied by ActionSystem; render immediately so
    // the HP counter starts rolling on the same beat as the trap impact.
    render()
    sameBeatAnimations.push(
      boardRenderer.animateDamageImpactOnElement(
        document.querySelector<HTMLElement>('.player-card'),
        result.damageTaken
      )
    )
  }

  if (result.cardRemoved) {
    // Damage/reward math has already happened in the model; all visible beats
    // now start together so the player never sees calculation, hurt, and death
    // as separate delayed steps.
    sameBeatAnimations.push(boardRenderer.animateCardConsume(card))
  }
  if (rewardFeedbacks.length > 0)
    sameBeatAnimations.push(Promise.all(rewardFeedbacks).then(() => undefined))
  if (sameBeatAnimations.length > 0) await Promise.all(sameBeatAnimations)
  if (result.cardRemoved) {
    gameState.removeCardFromRow(card, distance)
    boardRenderer.clearSelection()
  }

  if (result.cardRemoved && card.type === CardType.ENEMY) {
    await onEnemiesDefeated(1)
  }
  // 품격있는 대처: 직격으로 피해만 입고 살아남은 적 1장에게 추가 피해 1.
  if (result.damageDealt && result.damageDealt > 0) {
    const clickDamagedIds = new Set(
      diffFieldHealthLosses(beforeActionHealth).map((loss) => loss.cardId)
    )
    await applyDignifiedResponseDamage(clickDamagedIds)
  }

  // Board action resets the chain so combos do not bleed across turns.
  HandSystem.resetChain(chain)
  clearChainTimeline()

  if (result.cardRemoved) {
    // Keep the clicked rail hole open through the enemy/event beat. Rails are
    // supposed to drop only after the enemy turn, so the next waiting enemy or
    // chest timer must not act on the same turn just because the player cleared
    // the front cell. Spores get their special post-drop infection window in
    // resolveEventPhaseAndPrepareNextTurn().
    render()
  } else {
    render()
  }

  if (gainedHandCardCount > 0) {
    // Let the acquisition drop finish before scanning triples. The delay scales
    // with reward count so a 5-card chest still lands in a steady top-to-bottom
    // rhythm without being interrupted by immediate synthesis.
    await wait(Math.min(1180, 740 + (gainedHandCardCount - 1) * 135))
    const merges = HandSystem.runAutoMerges(gameState.character)
    if (merges.length > 0) {
      for (const m of merges) recordNotice(m, 'melt')
      render()
      await wait(980)
    }
  }

  // Board rewards can also fill the combo gauge (notably lavender flowers).
  // Resolve that payoff before the enemy/event phase so reaching 10 always
  // behaves like hand-card combo progress without changing turn structure.
  await resolveFullCandleGaugeEffects({ kind: 'chain' })

  if (!gameState.character.isAlive()) {
    gameState.endGame('character_defeated')
    if (await tryResolveHopeRevive()) {
      // Trap/self-damage deaths should not fall through into the enemy phase
      // after the revive field reset. The next input is a normal player turn.
      inputLocked = false
      return
    }
    finishTurn()
    return
  }

  if (turnManager.isEnemyFirstStrike()) {
    const beforeTrapHealth = snapshotFieldHealthState()
    const treasureChanges = turnManager.applyTreasureVolatility(cardSpawner)
    const bombExplosions = turnManager.applyBombExplosions()
    const flowerChanges = turnManager.applyFlowerGrowthAndWilt(cardSpawner)
    const eventAnimations: Promise<void>[] = []
    if (treasureChanges.length > 0)
      eventAnimations.push(boardRenderer.animateTreasureChanges(treasureChanges))
    if (bombExplosions.length > 0) {
      for (const explosion of bombExplosions)
        recordNotice(`${explosion.cardName} 폭발! -${explosion.playerDamage}`, 'hurt')
      const playerDamageTotal = bombExplosions.reduce(
        (sum, explosion) => sum + explosion.playerDamage,
        0
      )
      const damageLosses = diffFieldHealthLosses(beforeTrapHealth)
      eventAnimations.push(
        (async () => {
          await boardRenderer.animateBombExplosion(bombExplosions)
          await Promise.all([
            boardRenderer.animateDamageNumbersById(damageLosses),
            boardRenderer.animateDamageImpactOnElement(
              boardRenderer.findCardElement('__player__') ??
                document.querySelector<HTMLElement>('.player-card'),
              playerDamageTotal
            ),
          ])
        })()
      )
    }
    if (flowerChanges.growths.length > 0) {
      eventAnimations.push(boardRenderer.animateFlowerGrowth(flowerChanges.growths))
    }
    if (flowerChanges.wilts.length > 0) {
      for (const wilt of flowerChanges.wilts)
        recordNotice(`${wilt.flowerName}이(가) 괴물꽃으로 시듦`, 'hurt')
      eventAnimations.push(boardRenderer.animateFlowerWilts(flowerChanges.wilts))
    }
    if (eventAnimations.length > 0) await Promise.all(eventAnimations)
    if (gameState.isGameOver) {
      if (await tryResolveHopeRevive()) {
        inputLocked = false
        return
      }
      finishTurn()
      return
    }
    await runCleanupPhase(shouldAdvanceTurnForAction(result.starlightCollected === true))
    await resolvePostDropSporeSpread()
    if (await maybeRunMilestoneEventsAfterTurn()) return
    if (await maybeOpenShopAfterTurn()) return
    setTimeout(() => {
      inputLocked = false
    }, 340)
  } else {
    await resolveEventPhaseAndPrepareNextTurn(shouldAdvanceTurnForAction(result.starlightCollected === true))
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

setupDevCommandPalette()
// 게임 부팅 후 첫 사용자 입력에서 배경음 루프를 켠다(브라우저 자동재생 정책).
bgm.armAutoplay()
startGame()
