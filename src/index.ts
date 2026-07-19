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
import { setupDevCommandPalette } from '@/app/DevCommandPalette'
import { SettlementScreen } from '@/app/SettlementScreen'
import { ShopFlowManager, ONBOARDING_BANNED_CARDS } from '@/app/ShopFlowManager'
import { EventFlowManager } from '@/app/EventFlowManager'
import { CompanionDirector, BARK_IMPORTANCE } from '@/app/CompanionDirector'
import { RelicEffectsManager } from '@/app/RelicEffectsManager'
import type { PlayerResourceSnapshot, ResourceTrailSource, TrailResourceKind } from '@/app/FeedbackTypes'
import { TurnManager } from '@core/TurnManager'
import { BossEventController } from '@core/BossEvent'
import {
  GameBoardRenderer,
  CardActionDetail,
  ItemActionDetail,
  ActivityLogEntry,
  ShopBuyDetail,
  ShopPackKind,
  ShopPackPickDetail,
  type ResourceTrailTarget,
} from '@ui/GameBoardRenderer'
import { experienceAxes } from '@ui/ExperienceAxes'
import { GAME_OVER_GLOBAL_STYLES } from '@ui/styles/GameOverStyles'
import { CardSpawner } from '@systems/CardSpawner'
import { ActionSystem, ActionType } from '@systems/ActionSystem'
import { DropSystem } from '@systems/DropSystem'
import { HandSystem, ChainState } from '@systems/HandSystem'
import { EmberSystem } from '@systems/EmberSystem'
import { Card, CardType } from '@entities/Card'
import { LANE_DISTANCE_COUNT } from '@entities/Lane'
import { type EventId } from '@data/Events'
import { CandleMode } from '@entities/Character'
import { HandCardId, HandCategory } from '@entities/HandCard'
import { getHandCardDef, HAND_CARD_IDS } from '@data/HandCards'
import { RECIPES } from '@data/Recipes'
import { getRelicDef, type CustomRelicProfile, type RelicId } from '@data/Relics'
import { RunCardPool } from '@core/RunCardPool'
import { ENEMY_LIGHT_BASE, ENEMY_LIGHT_PER_RANK, GROUP_LIGHT_DISCOUNT, BASE_LIGHT_GAIN_MULTIPLIER, lightTurnMultiplier } from '@core/LightEconomy'
import { COMBO_TRIGGER_DELAY_MS, GAUGE_TRIGGER_DELAY_MS, MAX_ACTIVITY_LOGS } from '@core/Timing'
import { HAND_CARD_RARITY } from '@data/ShopPools'
import { TRIAL_DEFINITIONS, type TrialEffectKind } from '@data/Trials'
import { JOBS } from '@data/Jobs'
import { SquareBurst, type BurstTheme } from '@ui/SquareBurst'
import { CursorFX } from '@ui/CursorFX'
import { FontManager } from '@ui/FontManager'
import { SpriteUrls, spriteForHearthStation } from '@ui/Sprites'
import { sparkleIcon } from '@ui/Icons'
import { SpeechBubble } from '@ui/SpeechBubble'
import { CompanionSystem, type SituationId, type BoardEncounterKind, type SystemEncounterKind } from '@systems/CompanionSystem'
import {
  loadDisposition,
  computeEnaGrowth,
} from '@systems/EnaDisposition'
import { HearthScene, HEARTH_DEV_UNLOCK_KEY, HEARTH_TRADE_CELEBRATED_KEY, type HearthDifficulty } from '@ui/hearth/HearthScene'
import { isMetaUnlocked, setMetaUnlocked, META_UNLOCKS } from '@core/MetaUnlocks'
import { ZoneCurtain, ZONE_LIST } from '@ui/ZoneCurtain'
import { playDialogueLine } from '@ui/DialoguePlayer'
import { EventSpawnController } from '@systems/EventSpawn'
import { BgmManager } from '@/audio/BgmManager'
import { sfx } from '@/audio/SfxManager'
import { enaRuntimeObserver } from '@/rl/EnaRuntimeObserver'
import {
  createBrowserEnaAutonomousLearner,
} from '@/rl/EnaAutonomousLearner'
import { createBrowserLifetimeRecordStore } from '@core/LifetimeRecord'
import bgm001Url from './assets/audio/bgm_001.mp3'
import bgm002Url from './assets/audio/bgm_002.mp3'
import bgm003Url from './assets/audio/bgm_003.mp3'
import okDanDanBoldUrl from './assets/fonts/OkDanDanBold.woff2'

console.log('🕯 Unmelting starting...')

const app = document.getElementById('app')!
app.innerHTML = `
  <div id="game-board"></div>
`

CursorFX.init()

// 모바일(터치) 주소창 숨김 best-effort: 첫 사용자 제스처에서 전체화면을 시도한다.
// - Android 크롬: 즉시 브라우저 주소창이 사라진다(전체화면 진입).
// - iOS 사파리: 요소 Fullscreen API 미지원이라 request가 없어 조용히 no-op이며,
//   '홈 화면에 추가'(apple-mobile-web-app-capable) 경로로만 주소창 없는 실행이 된다.
// 데스크탑(정밀 포인터)에서는 의도치 않은 전체화면을 막기 위해 동작하지 않는다.
function enableImmersiveFullscreenOnFirstTap(): void {
  if (!window.matchMedia('(hover: none) and (pointer: coarse)').matches) return
  const root = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => unknown }
  const request = root.requestFullscreen?.bind(root) ?? root.webkitRequestFullscreen?.bind(root)
  if (!request) return
  const onFirstGesture = (): void => {
    if (document.fullscreenElement) return
    // 권한 거부/미지원은 게임 흐름에 영향 주지 않도록 조용히 무시한다.
    Promise.resolve(request()).catch(() => {})
  }
  document.addEventListener('pointerdown', onFirstGesture, { once: true })
}
enableImmersiveFullscreenOnFirstTap()

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

// 로비 전용 배경(hearth_bg_001) — 거점에서만 노출되는 풀스크린 레이어.
// 인게임에서는 숨겨(opacity 0) body의 게임 배경(background_001)과 겹치지 않게 한다.
// 거점 진입 시 HearthStyles의 body.hearth-lobby 규칙이 이 레이어만 띄우고,
// 출발 시 is-out으로 페이드아웃해 검은 화면을 거쳐 게임 배경으로 넘긴다.
const ingameBackdrop = document.createElement('div')
ingameBackdrop.id = 'ingame-backdrop'
ingameBackdrop.setAttribute('aria-hidden', 'true')
ingameBackdrop.style.backgroundImage = `url('${SpriteUrls.hearth.backdrop}')`
document.body.insertBefore(ingameBackdrop, document.body.firstChild)

const ingameBackdropStyle = document.createElement('style')
ingameBackdropStyle.textContent = `
#ingame-backdrop {
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  filter: blur(7px) saturate(0.9) brightness(0.78);
  transform: scale(1.06);
  /* 인게임 기본값: 완전히 숨김(게임 배경만 보이게 이중 노출 제거). 거점에서만 떠오른다. */
  opacity: 0;
  transition: opacity 1.6s ease;
}
`
document.head.appendChild(ingameBackdropStyle)

const gameState = new GameState()
// 에나가 실제 런 로그를 플레이어에게 보이지 않는 자기반성으로 저장하는 내부 학습기.
const enaAutonomousLearner = createBrowserEnaAutonomousLearner()
// 통산 기록(평생 리더보드) — 런 종료마다 showGameOver가 1회 합산한다. 표시 위치는 추후 결정.
const lifetimeRecordStore = createBrowserLifetimeRecordStore()
// 에나 런타임 관측: 모든 endGame 호출을 한 곳에서 기록해 사망/클리어 결과를 플레이 로그에 누적한다.
const originalEndGame = gameState.endGame.bind(gameState)
gameState.endGame = (reason: string): void => {
  originalEndGame(reason)
  // 첫 런을 '온전히'(승리/패배 정산까지) 마친 순간에만 첫 실행을 소비한다 — 중도 이탈 후
  // 재부팅은 다시 첫 시작(새싹 직행 + 인트로)으로 이어진다.
  localStorage.setItem(BOOT_FIRST_RUN_KEY, '1')
  const won = reason.includes('clear') || reason.includes('win')
  // 보스전 도중 쓰러졌다면 보스 이름을 마지막 피해 원천(=사망 원인 회상 재료)으로 남긴다.
  if (!won && gameState.bossBattleActive && bossController.eventState) {
    enaRuntimeObserver.noteDamageSource(bossController.eventState.card.name)
  }
  enaRuntimeObserver.recordRunEnd(gameState, won, reason)
  // 에나 혼자 보는 자기학습: 디버그 리포트 노출 없이 실제 런 로그를 다음 판단 재료로 압축한다.
  enaAutonomousLearner.learnAfterRun(enaRuntimeObserver.getMemory(), enaRuntimeObserver.getEvents())
  // per-player 성향 온라인 적응: 런 결과로 에나의 성향을 미세조정하고 저장(세션 넘어 유지).
  companionDirector.adaptCompanionToRunOutcome(won)
  // 유대는 자기학습 저장에 함께 영속화한다(adapt에서 런 완료분이 오른 뒤 저장).
  enaAutonomousLearner.saveBond(companion.getBond())
  // 종막 대사: 게임오버/클리어 순간은 월드 바크 게이트(companionWorldCanSpeak)를 우회해 1회만 낸다.
  companionDirector.sayEnaBark(won ? companion.clearLine() : companion.deathLine(), { importance: BARK_IMPORTANCE.clutch })
}
const turnManager = new TurnManager(gameState)
const cardSpawner = new CardSpawner()
// 이벤트 문 PRD 컨트롤러 — 일반 스폰 버킷과 독립된 확률로 이벤트 칸을 생성한다.
const eventSpawnCtrl = new EventSpawnController()
// 레인이 가득 차 주입 못 한 이벤트 문을 다음 리필까지 보류한다.
let pendingEventDoor = false
// 이벤트 문 보류 상태의 예고선 전용 더미 카드. 실제 스폰은 generateEventDoor()가 담당하므로
// 렌더러가 흰색 special 라인을 고르는 데 필요한 타입 정보만 안정적으로 제공한다.
const pendingEventDoorPreviewCard = new Card('event-door-preview', CardType.EVENT, '이벤트', 'preview only')
// 디버그 전용: 이벤트N 커맨드로 스폰된 칸이 클릭될 때 강제 사용할 이벤트 ID.
let debugForcedEventId: EventId | null = null
const boardRenderer = new GameBoardRenderer('game-board')
// 거점(촛대) 화면. 기본 부팅은 여전히 직행 인게임이며, `/시작` 명령에서만 깨어난다.
const hearthScene = new HearthScene()
// 구역 전환 커튼 — 1F 시작과 30/60/90F 보스 시련 종료 후 상단에서 슬라이드 인/아웃.
const zoneCurtain = new ZoneCurtain()

const BG_GRADIENTS =
  `linear-gradient(180deg, rgba(20, 16, 28, 0.55), rgba(8, 5, 14, 0.86)),` +
  `radial-gradient(ellipse at top, rgba(244, 164, 96, 0.18), transparent 65%),`

/**
 * body 배경을 새 구역 이미지로 교체하고 크로스페이드를 재생한다.
 * background-image는 CSS transition이 불가하므로, 현재 배경을 임시 div로 덮어두고
 * body를 새 배경으로 교체한 뒤 임시 div를 opacity 페이드아웃으로 걷어낸다.
 *
 * onBodyReady가 커튼 상승 직전에 이 함수를 호출하므로, 페이드 아웃(0.6s)이
 * 커튼 슬라이드업(0.52s)과 겹쳐 배경이 자연스럽게 드러난다.
 */
function setZoneBackground(bgUrl: string, instant = false): void {
  const prev = document.body.style.backgroundImage
  // 즉시 body 배경을 새 이미지로 교체 (커튼이 덮고 있는 상태에서 invisible swap)
  document.body.style.backgroundImage = `${BG_GRADIENTS}url('${bgUrl}')`
  // instant: 첫 실행 인트로처럼 어둠이 덮은 상태에서 완성된 배경을 깔 때 — 크로스페이드 생략.
  if (instant || !prev.includes('url(')) return
  // 구 배경을 임시 div로 올려두고 Web Animations API로 2초 페이드아웃 → 새 배경 노출.
  // CSS transition + 단일 rAF는 브라우저가 두 변경을 배칭해 transition이 발동하지 않으므로
  // Web Animations API를 사용한다.
  const fade = document.createElement('div')
  fade.setAttribute('aria-hidden', 'true')
  // z-index: 0으로 step-8에 참여. html { background } 때문에 z-index: -1은 body 배경에 가려진다.
  // body 첫 번째 자식으로 insertBefore → 같은 step-8 내 DOM 순서상 #app보다 먼저 그려져
  // 게임 요소 아래에 위치한다(#app이 뒤에 있으므로 위에 그려짐).
  fade.style.cssText =
    'position:fixed;inset:0;z-index:0;pointer-events:none;' +
    `background-image:${prev};` +
    'background-size:cover,cover,cover;' +
    'background-position:center,center top,center;' +
    'background-repeat:no-repeat;' +
    'background-attachment:fixed;'
  document.body.insertBefore(fade, document.body.firstElementChild)
  fade.animate(
    [{ opacity: 1 }, { opacity: 0 }],
    { duration: 2000, easing: 'ease-in-out', fill: 'forwards' }
  ).finished.then(() => fade.remove())
}
// 거점 만찬은 런 시작 reset을 건너뛰어야 하므로, 실제 유물 지급 의도를 별도 플래그로 보존한다.
let pendingDinnerRelicProfile: CustomRelicProfile | null = null
// 배경음: 3트랙을 무작위 순서로 크로스페이드 연결, 첫 입력에서 자동재생.
const bgm = new BgmManager([bgm001Url, bgm002Url, bgm003Url])
const speechBubble = new SpeechBubble({ anchor: '.player-card', offsetX: 150, tail: 'bottom-left', fontSize: 22 })
const bossBubble   = new SpeechBubble({ anchor: '.cell.type-boss', offsetX: 40, offsetY: 70, tail: 'bottom-left', theme: 'boss', autoDismissMs: 0 })
// 이벤트 악마 대사 — 이벤트 오버레이 내부 앵커를 기준으로 띄워 커튼/레일 좌표 변화에도 가려지지 않게 한다.
const eventDemonBubble = new SpeechBubble({
  anchor: '#event-demon-anchor',
  offsetY: 8,
  tail: 'top',
  theme: 'boss',
  autoDismissMs: 0,
  fontSize: 20,
  maxWidth: 520,
})
let gameActive = true
let inputLocked = false

// ── 동료(에나) 반응 레이어 씨앗 ──────────────────────────────
// 학습 전 규칙 기반 스캐폴딩. 플레이어 프로필(.player-card) 터치에 횟수·시간·현재 상황으로
// 반응한다(패턴이 아니라 자아처럼). 설계: Ena_Companion_AI_Design.md
// 에나 성장(초보 동반자→베테랑): 누적 모험 xp(자기학습 저장, 층·플레이 기반)와 유대로
// growth(0~1)를 계산해 신규 폴백 성향과 평균회귀 앵커를 결정한다. 신규 플레이어는 growth 0
// → ROOKIE 근방에서 시작하며, 자살런 반복으로는 xp가 거의 쌓이지 않는다.
const initialEnaGrowth = computeEnaGrowth({
  adventureXp: enaAutonomousLearner.loadAdventureXp(),
  bond: enaAutonomousLearner.loadBond(),
})
// 축 특화(자기학습 저장 영속)를 먼저 복원해, 특화 확장 상한을 넘는 저장 성향이 로드에서 잘리지 않게 한다.
const initialEnaSpecialization = enaAutonomousLearner.loadSpecialization()
// 저장된 per-player 성향을 불러와 에나를 깨운다(없으면 성장 앵커 성향). 런 종료마다 적응·저장된다.
const companion = new CompanionSystem(
  loadDisposition(undefined, initialEnaGrowth, initialEnaSpecialization),
  initialEnaGrowth
)
companion.setSpecialization(initialEnaSpecialization)
// 유대(bond)는 성향과 별개로 자기학습 저장(unmelting.ena.self-learning.v1)에서 복원한다.
companion.setBond(enaAutonomousLearner.loadBond())


// 경험(성향) 패널이 현재 에나 성향/성장值(표기 배율용)를 읽어 성좌 시각화를 그릴 수 있게 연결한다.
// 점선 기준 별자리는 렌더러가 초보 시작 모양(ROOKIE, growth 0)으로 자체 앵커한다.
boardRenderer.setExperienceDataProvider(() => ({
  disp: companion.getDisposition(),
  learning: companion.getLearningSnapshot(),
  growth: companion.getGrowth(),
}))

/** 에나 지휘 매니저 — 바크 큐/예측/클러치와 런 종료 성장 적응을 담당한다. */
const companionDirector: CompanionDirector = new CompanionDirector({
  gameState, companion, speechBubble, boardRenderer, cardSpawner,
  enaAutonomousLearner,
  getRunCardPool: () => runCardPool,
  getChain: () => chain,
  isGameActive: () => gameActive,
  isInputLocked: () => inputLocked,
  isShopOpen: () => shopFlow.isOpen(),
  recordNotice,
  render,
  snapshotPlayerResources,
  playResourceTrail,
  playPlayerGainTrails,
})

// 보드는 재렌더로 .player-card를 다시 그리므로, 안정적인 #game-board에 위임 청취한다.
document.getElementById('game-board')?.addEventListener('click', (e) => {
  if ((e.target as HTMLElement | null)?.closest('.player-card')) companionDirector.onProfileTouched()
})

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
/** Currently armed targeted hand card: waits for a board click to consume.
 *  Keep `merged` here as well as in GameBoardRenderer so re-renders never
 *  fall back to the base targeting rule while a triple card is armed. */
let pendingHandTarget: { slotIndex: number; defId: HandCardId; merged?: boolean } | null = null

let score = 0
let coins = 0
let scorePulseKey = 0
let coinPulseKey = 0
let nextActivityLogId = 1
let activityLogs: ActivityLogEntry[] = []
/** Run-length target for the 100-floor arc. */
const RUN_TARGET_TURNS = 100
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

function shouldAdvanceTurnForAction(): boolean {
  // 최종 등반 중에는 일반 행동으로 턴이 오르지 않는다. 턴 진행은 전방 별빛
  // 자동 수집(sweepFrontStarlights)만 담당한다.
  return !finalAscentStarlightRuleActive
}

/** runModifiers의 현재 값을 CardSpawner로 흘려보내 다음 스폰부터 즉시 반영시킨다. */
function syncRunModifiersToSpawner(): void {
  cardSpawner.setTrialModifiers({
    enemyHpBonus: runModifiers.enemyHpBonus,
    enemyAtkBonus: runModifiers.enemyDamageBonus,
    treasureSpawnScale: runModifiers.treasureSpawnScale,
  })
}
/**
 * 거점(촛대) 진입: 빈 레일을 배경으로 거점 화면을 띄운다.
 * 현재 테스트 런 상태를 깨끗이 비우고 빈 보드를 렌더한 뒤 거점 오버레이를 마운트한다.
 * 모험 칸 클릭은 상점 셔터 하강까지만 연결한다(이후 모험 설정 페이지는 추후 단계).
 */
function enterHearth(): void {
  // 갓 게임을 켠 상태: 적·직업·유물 잔여 0. 빈 레일을 배경으로 거점 오버레이를 띄운다.
  pendingDinnerRelicProfile = null
  resetForNewRun()
  // 거점 로비 동안엔 플레이어 말풍선을 음소거한다. 보류 중인 지연 대사(시작 대사 등)도
  // 함께 취소돼 대문 열림 중에 인게임 대사가 새는 것을 막는다. startGame 시작 시 해제된다.
  speechBubble.setMuted(true)
  inputLocked = true // 거점 동안 뒤쪽 보드 입력 잠금(입력은 거점 오버레이가 가짐)
  gameActive = false
  // 아직 캐릭터를 고르지 않았으므로 플레이어 존을 숨긴다(레이어는 유지, visibility만 off).
  document.body.classList.add('hearth-lobby')
  // 거점(로비)에서도 미개방 메타 패널(화폐/의뢰)을 숨긴다 — 무역 개방 상태(isMetaUnlocked)에 따른다.
  document.body.classList.remove('onboarding-run')
  // 졸업 후 첫 로비 도착이면 화폐가 해금됐어도 무역 개방 팡! 순간까지 패널을 숨겨 함께 등장시킨다.
  const unlockCelebrationPending =
    enaAutonomousLearner.hasFirstSeen('onboarding-graduated') &&
    localStorage.getItem(HEARTH_TRADE_CELEBRATED_KEY) !== '1'
  document.body.classList.toggle('meta-currency-locked', !isMetaUnlocked('currency') || unlockCelebrationPending)
  document.body.classList.toggle('meta-reroll-locked', !isMetaUnlocked('shopReroll'))
  document.body.classList.toggle('meta-quests-locked', !isMetaUnlocked('quests'))
  document.body.classList.toggle('meta-freecard-locked', !isMetaUnlocked('freeCard'))
  render()
  hearthScene.enter({
    // 출발 버튼 → startGame이 다시 초기화 + 직업 선택 + 보드 채움을 수행한다.
    // 선택한 난이도(새싹=온보딩/쉬움=정규)가 온보딩 여부를 결정한다.
    onStart: () => { void startGame(hearthScene.getSelectedCharacterIndex(), hearthScene.getSelectedDifficulty()) },
    // 쉬움(정규 100층)은 새싹 병아리를 한 번 졸업해야 열린다.
    isEasyUnlocked: () => enaAutonomousLearner.hasFirstSeen('onboarding-graduated'),
    // 무역 개방 팡! 순간: 함께 해금된 화폐 패널을 버스트와 같이 등장시킨다.
    onUnlockCelebration: () => {
      document.body.classList.toggle('meta-currency-locked', !isMetaUnlocked('currency'))
      const wallet = document.querySelector<HTMLElement>('.coin-panel-total')
      if (wallet) SquareBurst.playOn(wallet, 'treasure-gain', { count: 20, spread: 130, duration: 620 })
    },
    // 서고 모험일지 — 통산 기록을 그대로 읽어 보여 준다.
    getLifetimeRecord: () => lifetimeRecordStore.load(),
    // 만찬 완료 즉시 Character.relics에 실제 RelicId를 넣고 렌더러의 유물 팬으로 보여 준다.
    onDinnerRelicCreate: async (profile) => {
      pendingDinnerRelicProfile = profile
      gameState.character.customRelicProfiles['last-supper'] = profile
      // 로비에서는 카드만 실제 인벤토리에 꽂고, 스탯 효과는 startGame 재지급 때 한 번 발동한다.
      gameState.character.addRelic('last-supper')
      render()
    },
  })
}
/** effectKind 서술자를 런타임 apply()로 변환. runModifiers는 여기에 스코프돼 있으므로 index에서 해석한다. */
function applyTrialEffect(kind: TrialEffectKind): void {
  switch (kind.type) {
    case 'enemy-stat-bonus': {
      runModifiers.enemyHpBonus += kind.hpBonus
      runModifiers.enemyDamageBonus += kind.atkBonus
      // 함정 시련과 동일하게, 이미 필드에 있는 적도 즉시 보너스를 받는다(이후 스폰 적과
      // 동일 취급). 합체 적은 한 인스턴스가 여러 칸을 점유하므로 Card 단위로 1회만 적용한다.
      const seenEnemies = new Set<Card>()
      for (const lane of gameState.lanes)
        for (let d = 0; d < LANE_DISTANCE_COUNT; d++) {
          const c = lane.getCardAtDistance(d)
          if (!c || seenEnemies.has(c)) continue
          seenEnemies.add(c)
          c.applyTrialEnemyStatBonus(kind.atkBonus, kind.hpBonus)
        }
      break
    }
    case 'trap-damage-bonus':
      runModifiers.trapDamageBonus += kind.value
      // 함정 피해 보너스는 character.trapDamageBonus(전역)에 누적한다. 모든 함정(현재 필드/
      // 이후 스폰/전염/그룹/추후 추가 종류)이 피해 계산 시점에 자동으로 받는다 — 카드별 주입 불필요.
      gameState.character.trapDamageBonus += kind.value
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
// 확률팩·직업 태그 가중치도 초기화 시점에 동기화한다(저장된 런 재개 대비).
DropSystem.setTier1CardBoosts(gameState.enhancements.tier1CardBoosts)
DropSystem.setTier1JobPoolBoosts(gameState.enhancements.tier1JobPoolBoosts)
boardRenderer.setLockedCardIds([...runCardPool.snapshot().locked, ...runCardPool.snapshot().banned])
// runLocked 레시피는 런 시작 시 전부 잠금 — 해금팩으로만 해제 가능하다.
boardRenderer.setLockedRecipeIds(RECIPES.filter((r) => r.runLocked).map((r) => r.id))

// 보스 국면 대사 중복 방지 — 보스 등장마다 비우고 phaseKey당 1회만 발화한다(조각사 반복 후퇴 등).
const announcedBossPhases = new Set<string>()

// 보스 이벤트 컨트롤러 — 보스별 스탯/흐름/보상/시련을 모두 관리한다.
const bossController: BossEventController = new BossEventController(
  gameState, turnManager, boardRenderer, bossBubble, speechBubble, runCardPool, SpriteUrls,
  {
    setInputLocked: (v) => { inputLocked = v },
    addOneCoin: () => { coins += 1; coinPulseKey++; boardRenderer.playCoinGainFeedback(coins, coinPulseKey); relicEffects.applyBlindFaithCoins(1) },
    render: () => render(),
    clearChainTimeline: () => { HandSystem.resetChain(chain); clearChainTimeline(); boardRenderer.refreshChainBanner(buildChainHints()) },
    recordNotice: (msg, kind) => recordNotice(msg, kind),
    applyAnomalyHealthLoss: () => relicEffects.applyAnomalyHealthLoss(),
    applyPreciousHeadCheck: () => relicEffects.applyPreciousHeadCheck(),
    applyPlayerAttackRelics: () => relicEffects.applyGreatNegotiationOnAttack(),
    openTrialOverlayForced: () => shopFlow.openTrialOverlayForced(),
    applyRelicPurchaseEffect: (id) => relicEffects.applyRelicPurchaseEffect(id),
    handlePlayerDeath: async () => {
      if (await relicEffects.tryResolveSurvivalRelics()) {
        // 권위/희망이 보스전 도중 살려냈다면 입력을 풀어 전투를 계속 잇게 한다.
        inputLocked = false
        return true
      }
      gameState.endGame('character_defeated')
      finishTurn()
      return false
    },
    // 동반자(에나) 보스 전용 대사 — 일반 월드 바크가 침묵하는 보스전에서 등장/국면/격파 순간만 말한다.
    // 보스 이름을 넘기면 이름을 아는 전용 대사가 해당 보스에게만 가끔 섞인다.
    onBossIntro: (name) => {
      announcedBossPhases.clear()
      // 태어나서 첫 보스라면 분위기 대사 대신 교육형 소개를 한 번 우선한다.
      companionDirector.sayEnaBark(encounterIntroLineOnce('boss') ?? companion.bossIntroLine(name), { importance: BARK_IMPORTANCE.situation })
    },
    onBossPhase: (_name, phaseKey) => {
      if (announcedBossPhases.has(phaseKey)) return
      announcedBossPhases.add(phaseKey)
      companionDirector.sayEnaBark(companion.bossPhaseLine(), { importance: BARK_IMPORTANCE.urgent })
    },
    onBossKill: (name) => {
      companionDirector.sayEnaBark(companion.bossKillLine(name), { importance: BARK_IMPORTANCE.clutch })
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
  // 100F 마녀 페이지 경계: UI diff가 읽기 전에 HP를 하한으로 되돌려 경계 아래로 깜빡이지 않게 한다.
  bossController.clampWaxWitchExternalDamageToPageFloor()
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



interface NumericResourceRule {
  target: ResourceTrailTarget
  theme: BurstTheme
}

/** Single rules table for numeric reward destinations. Every caller only
 *  chooses a source; this table owns the destination HUD and default palette. */
const NUMERIC_RESOURCE_TRAILS: Record<TrailResourceKind, NumericResourceRule> = {
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

/** 유물 발동/처리 매니저 — 처치·생존·구매·턴 시작 유물 효과를 위임한다. 상태(score/gameActive)는 index가 소유. */
const relicEffects = new RelicEffectsManager({
  gameState, boardRenderer, cardSpawner, companion, companionDirector,
  isGameActive: () => gameActive,
  addScore: (amount) => { score += amount; scorePulseKey++ },
  recordNotice,
  recordRelicActivation,
  render,
  pushActivityLogsInDisplayOrder,
  createScoreLog,
  createItemGainLogs,
  scoreForCardRemoval,
  scoreLabelForCard,
  snapshotPlayerResources,
  playResourceTrail,
  playPlayerGainTrails,
  playHandTargetBlasts,
  snapshotFieldCardPayloads,
  burstScoreGain,
  runPreparationRefreshAfterFieldEffects,
  encounterIntroLineOnce,
})

/** 상점 가격(불빛) 인플레이션 배수.
 *  첫 상점인 10층은 초기 자본(불빛 ~500-700)에 맞춰 살짝 더 싸게 ×0.8로 낮춘다.
 *  20층부터는 기존 곡선(1 + (turn-10)*0.02)을 그대로 유지한다.
 *  (예: 20층 ≈1.2배, 30층 ≈1.4배, 60층 ≈2배, 90층 ≈2.6배) */
/** 상점/제단/강제 시련 흐름 매니저 — 방문 상태와 구매/픽 핸들링을 담당한다. */
const shopFlow: ShopFlowManager = new ShopFlowManager({
  gameState, boardRenderer, companion, companionDirector, relicEffects, turnManager, bossController, runCardPool,
  resources: {
    get score() { return score }, set score(v) { score = v },
    get coins() { return coins }, set coins(v) { coins = v },
    get scorePulseKey() { return scorePulseKey }, set scorePulseKey(v) { scorePulseKey = v },
    get coinPulseKey() { return coinPulseKey }, set coinPulseKey(v) { coinPulseKey = v },
  },
  forcedTrialCards: FORCED_TRIAL_CARDS,
  getChain: () => chain,
  clearChainTimeline,
  setInputLocked: (v) => { inputLocked = v },
  render,
  recordNotice,
  wait,
  encounterIntroLineOnce,
  isOnboardingActive,
  snapshotPlayerResources,
  playPlayerGainTrails,
  playResourceTrail,
  resolveFullCandleGaugeEffects,
  pushActivityLogsInDisplayOrder,
  activateFinalAscentStarlightRule,
  formatTrialSummary,
  isGameActive: () => gameActive,
  recordCoinGain,
  finishTurn,
  runTargetTurns: RUN_TARGET_TURNS,
  showZoneCurtain: (zoneIndex) => zoneCurtain.show(ZONE_LIST[zoneIndex], () => setZoneBackground(ZONE_LIST[zoneIndex].bgUrl)),
  cardSpawner,
})


async function maybeOpenShopAfterTurn(): Promise<boolean> {
  // 보스 전투/최종 별빛 등반 중에는 상점·제단을 재트리거하지 않는다.
  if (gameState.bossBattleActive || finalAscentStarlightRuleActive) return false
  const turn = gameState.getCurrentTurn()
  if (turn === 0) return false

  if (turn % 10 !== 0) return false
  await shopFlow.openShopOverlay(turn % 30 === 0 ? 'altar' : 'shop')
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
    // 100층은 즉시 클리어가 아니라 최종 보스 '녹지 않는 마녀' 전투로 닫는다.
    // 보스 직전 마지막 제단을 먼저 열고(셔터 하강), 제단 EXIT가 보스 게이트로 이어진다.
    // 격파→보상→시련 흐름은 closeShopAndResume의 100F 분기와 runBossEvent가 그대로 잇는다.
    finalAscentStarlightRuleActive = false
    syncFinalAscentRuleToSpawner()
    await shopFlow.openShopOverlay('altar')
    return true
  }
  // 새싹 병아리(온보딩): 30층에서 양초 고양이 보스로 아크를 닫는다(제단/시련/보상 없이 종료).
  if (isOnboardingActive() && turn === 30 && !gameState.isGameOver) {
    turnManager.setTurnMode('boss_phase')
    // 인게임 상점/제단과 '동일한' 밀랍 셔터로 등장 연출한다(playShopTransition/Resume 재사용):
    // 셔터 하강 → 살짝 딜레이 → 양초 고양이 착지. 보스 타일(type-boss, z40)이 셔터(z35) 위로
    // 강하하므로 셔터를 배경으로 등장 연출이 그대로 보인다. 전투 종료 후 셔터를 올린다.
    await boardRenderer.playShopTransition()
    await wait(520)
    await bossController.runOnboardingCat()
    // 30층은 여기가 끝 — 셔터를 올리거나 보상을 내리지 않는다. 셔터는 내려온 채 두고,
    // 곧 runOnboardingClear → showGameOver의 검은 블러 클리어 창이 조용히 페이드인해 셔터를 덮는다.
    // 격파(생존)면 클리어 정산+졸업, 사망이면 runOnboardingCat 내부에서 게임오버 처리됨.
    if (!gameState.isGameOver && gameState.character.isAlive()) await runOnboardingClear()
    return true
  }
  return false
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
      lane.setCardAtDistance(topDistance, cardSpawner.spawnCardForRefill(laneIndex))
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
  // suppress는 낙하 중 중간 병합 연출을 막기 위한 것이므로 최종 정착 시엔 항상 regroup 한다.
  // 이를 빠뜨리면 거미줄 3칸이 별도 gc=1 객체로 남아 키틴이 1칸만 제거하는 버그가 발생한다.
  else gameState.regroupAllRows()
  trackFieldEnemyEncounters()
  const blooms = turnManager.bloomFrontSeeds(cardSpawner)
  turnManager.armFrontBombs()
  const startedEventDoors = turnManager.startFrontEventDoorArrivals()
  render()
  for (const t of startedEventDoors) boardRenderer.popEventBadge(t.cardId)
  if (blooms.length > 0) await boardRenderer.animateFlowerBlooms(blooms)
  if (movedAny) await wait(120)
  // 최종 등반: 손패/조합 효과가 별빛을 전방으로 떨어뜨렸다면 즉시 수집한다. 그렇지 않으면
  // 전방이 별빛로만 막혀 클릭할 카드가 없고 손패만으론 턴이 오르지 않아 교착될 수 있다.
  // (별빛은 클릭 수집이 없는 전방-도달 자동 수집 규칙이다.) 턴 100 도달 시 보스 게이트는
  // 일반 행동 종료 경로 maybeRunMilestoneEventsAfterTurn가 이어받으므로 여기선 수집/턴+1까지만 한다.
  if (finalAscentStarlightRuleActive) await sweepFrontStarlights()
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
  // 턴 인플레이션 선형식은 학습 시뮬과 공유하는 LightEconomy 단일 출처를 읽는다.
  return lightTurnMultiplier(gameState.getCurrentTurn()) * gameState.enhancements.scoreMultiplier
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
 *  - 일반 적: 강함 랭킹(enemyPower)에만 1차식으로 연동 — `BASE + RANK * enemyPower`.
 *    불빛을 HP/ATK 수치와 분리해, 기본 체력 버프나 100HP/1ATK 같은 특이 스탯 적을
 *    추가해도 불빛은 랭크 순서대로 유지된다(랭크만 부여하면 됨). enemyPower가 높을수록
 *    (=후반 배치) 항상 더 준다. 그룹은 칸 수만큼 곱하되 25% 감산.
 *  - Mimic/괴물꽃(isSpecialEnemy): 기존 강함(HP·ATK) 기반 불빛량을 그대로 유지한다.
 *  - Trap: small flat per width (1/2/3 = 30 / 65 / 110).
 *  - Treasure: smaller flat per width (1/2/3 = 18 / 40 / 75).
 *
 * Caller multiplies the result by `getTurnScoreMultiplier()` via createScoreLog.
 */
// 일반 적 불빛 = ENEMY_LIGHT_BASE + ENEMY_LIGHT_PER_RANK × enemyPower(1~18+), 전 랭크 단일 공식.
// HP/ATK와 분리돼 체력 버프·특이 스탯 적(100HP/1ATK 등)에도 랭크 순서대로 유지된다.
// 상수는 학습 시뮬과 공유하는 LightEconomy 단일 출처를 읽는다.
function scoreForCardRemoval(card: Card): number {
  if (card.type === CardType.ENEMY) {
    // 일반/특수(미믹·괴물꽃) 모두 강함수치(enemyPower) 단일 랭킹식으로 통일한다.
    // 미믹은 단계마다 2/4/6/8…, 합체 적/미믹/괴물꽃은 칸 수 배율로 불빛이 자연스럽게 오른다.
    const rankLight = ENEMY_LIGHT_BASE + Math.max(1, card.enemyPower) * ENEMY_LIGHT_PER_RANK
    // 그룹은 칸 수만큼 곱하되 감산 배율로 희석 — 단일보다 확실히 높되 배수 구조를 누른다.
    if (card.groupCount > 1) return Math.round(rankLight * card.groupCount * GROUP_LIGHT_DISCOUNT)
    return rankLight
  }
  // 함정/보물은 강함수치가 없으므로, 경과 턴(층)만큼 기본 불빛에 더해 인플레이션을 따라가게 한다.
  // 예) 함정 기본 30 → 10턴이면 40. (이후 createScoreLog의 턴 배율·지터는 동일하게 위에 곱해진다.)
  const turnBonus = Math.max(0, gameState.getCurrentTurn())
  if (card.type === CardType.TRAP) {
    const span = card.groupCount >= 3 ? 3 : card.groupCount === 2 ? 2 : 1
    // 종류별 기본 불빛: 거미줄 20/50/80, 포자 10/20/30, 폭탄 50(합체 없음).
    const base =
      card.trapKind === 'spore'
        ? [10, 20, 30][span - 1]
        : card.trapKind === 'bomb'
          ? 50
          : [20, 50, 80][span - 1]
    return base + turnBonus
  }
  if (card.type === CardType.TREASURE) {
    // 황금 상자는 일반 상자보다 불빛 2배. (기존 18/40/75 · 36/80/150에서 전체 2배 상향)
    const isGolden = card.treasureKind === 'goldenChest'
    const base =
      card.groupCount >= 3
        ? isGolden
          ? 300
          : 150
        : card.groupCount === 2
          ? isGolden
            ? 160
            : 80
          : isGolden
            ? 72
            : 36
    return base + turnBonus
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
  if (card.type === CardType.TRAP) return `${card.name} 처리`
  if (card.type === CardType.FLOWER) return `${card.name} 수확`
  return `${card.name} 획득`
}

// 기본 불빛 상향 배율(BASE_LIGHT_GAIN_MULTIPLIER)은 행동 기반 불빛에만 적용되고
// gainFixedLight(별빛 랜턴 등 고정 유물 보너스)에는 적용하지 않는다 — LightEconomy 공유값.

function createScoreLog(
  label: string,
  baseValue: number,
  kind: ActivityLogEntry['kind']
): ActivityLogDraft {
  const amount = Math.max(
    1,
    Math.round(baseValue * getTurnScoreMultiplier() * scoreInflationJitter() * BASE_LIGHT_GAIN_MULTIPLIER)
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

/** 카드가 현재 위치한 거리를 찾는다. 레일 하강 이후 카드가 이동했을 수 있어,
 *  제거 시 캡처된 옛 거리 대신 실시간 위치를 다시 조회할 때 쓴다. */
function locateCardDistance(card: Card): number | null {
  for (const lane of gameState.lanes) {
    for (let d = 0; d < LANE_DISTANCE_COUNT; d++) {
      if (lane.getCardAtDistance(d) === card) return d
    }
  }
  return null
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
  // 보류 이벤트 문은 laneIndex에 묶지 않고 첫 빈 슬롯에 주입해 유실을 막는다.
  let doorInjected = false
  const result = gameState.compactAndRefillRails((laneIndex) => {
    if (pendingEventDoor && !doorInjected) {
      doorInjected = true
      return cardSpawner.generateEventDoor()
    }
    return cardSpawner.spawnCardForRefill(laneIndex)
  })
  if (doorInjected) {
    pendingEventDoor = false
    // 동료(에나) 이벤트 문 등장 반응.
    if (companionDirector.companionWorldCanSpeak()) {
      const bark = companion.reactSituation('event', gameState.getCurrentTurn())
      if (bark) companionDirector.sayEnaBark(bark, { importance: BARK_IMPORTANCE.situation, situation: 'event' })
    }
  }
  return result
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
      } else if (
        card.type === CardType.TRAP ||
        card.type === CardType.TREASURE ||
        card.type === CardType.FLOWER
      ) {
        // 함정/보물/꽃도 필드에 등장하면 도감 발견 처리.
        gameState.encounteredCardNames.add(card.name)
      }
    }
  }
}

/** 카드가 첫 조우 소개 대상 보드 종류 중 무엇인지 판별한다(아니면 null). */
function boardIntroKindOf(card: Card): BoardEncounterKind | null {
  if (card.enemySpriteId === 'enemyRock') return 'rock'
  if (card.trapKind === 'bush') return 'bush'
  if (card.trapKind === 'web') return 'web'
  if (card.trapKind === 'bomb') return 'bomb'
  if (card.trapKind === 'spore') return 'spore'
  if (card.treasureKind === 'junk') return 'junk'
  if (card.treasureKind === 'starlight') return 'starlight'
  if (card.type === CardType.EVENT) return 'event-door'
  // 씨앗만 소개 대상 — 핀 꽃은 일반 상황 반응(flower 풀)이 담당한다.
  if (card.type === CardType.FLOWER && card.flowerKind === 'seed') return 'seed'
  return null
}

/** 첫 조우 영구 기록 키 — 필드 3종은 기존 저장본('field:*')과의 호환을 위해 접두사를 유지한다. */
function firstSeenKeyOf(kind: BoardEncounterKind | SystemEncounterKind): string {
  return kind === 'rock' || kind === 'bush' || kind === 'junk' ? `field:${kind}` : `encounter:${kind}`
}

/**
 * 보드에 새로 나타난 첫 조우 대상(필드 3종 + 거미줄/폭탄/포자/이벤트 문/별빛)을 태어나서 처음
 * 겪는 순간 에나가 한 번 소개하게 한다. 여러 종류가 한꺼번에 나와도 한 줄로 묶어 스팸을 막는다.
 * 영구 first-seen 기록(enaAutonomousLearner) 기반이라 죽어서 재시작해도 반복되지 않는다.
 */
function maybeIntroduceFields(): void {
  if (!companionDirector.companionWorldCanSpeak()) return
  // 현재 보드에 놓인 조우 종류를 모은다.
  const present = new Set<BoardEncounterKind>()
  for (const lane of gameState.lanes) {
    for (let d = 0; d < LANE_DISTANCE_COUNT; d++) {
      const card = lane.getCardAtDistance(d)
      const kind = card ? boardIntroKindOf(card) : null
      if (kind) present.add(kind)
    }
  }
  if (present.size === 0) return
  // 영구·세션 이중 가드로 '처음 본 종류'만 남긴다. 영구 기록은 조우 시점에 즉시 남겨 재시작 반복을 막는다.
  const fresh: BoardEncounterKind[] = []
  for (const kind of present) {
    if (sessionFieldsIntroduced.has(kind)) continue
    if (!enaAutonomousLearner.recordFirstSeen(firstSeenKeyOf(kind))) {
      sessionFieldsIntroduced.add(kind) // 이전 세션에서 이미 소개됨 — 세션 가드에도 반영.
      continue
    }
    sessionFieldsIntroduced.add(kind)
    fresh.push(kind)
  }
  const line = companion.introduceFields(fresh)
  if (line) companionDirector.sayEnaBark(line, { importance: BARK_IMPORTANCE.situation })
  // 획득 경로(enqueueDrop)에서 조용히 합성된 첫 트리플도 이 스캔이 받아 소개한다.
  if (gameState.character.hand.some((card) => card.merged)) {
    const tripleIntro = encounterIntroLineOnce('triple')
    if (tripleIntro) companionDirector.sayEnaBark(tripleIntro, { importance: BARK_IMPORTANCE.situation })
  }
}

/**
 * 보드 밖 시스템 흐름(보스/시련/상점/제단)의 첫 조우 소개 한 줄. 태어나서 최초 1회만 돌려주고,
 * 이후에는 null(호출부가 평소 대사로 폴백). 필드 소개와 같은 영구·세션 이중 가드를 쓴다.
 */
function encounterIntroLineOnce(kind: SystemEncounterKind): string | null {
  if (sessionFieldsIntroduced.has(kind)) return null
  if (!enaAutonomousLearner.recordFirstSeen(firstSeenKeyOf(kind))) {
    sessionFieldsIntroduced.add(kind)
    return null
  }
  sessionFieldsIntroduced.add(kind)
  return companion.introduceEncounter(kind)
}

function fillBoardAtStart(): void {
  syncSpawnerTier()

  // 최전방(distance 0): 적/거미줄/보물 각 1종 고정, 레인 순서만 무작위.
  const frontCards = cardSpawner.spawnFixedOpeningFrontRow(gameState.lanes.length)
  for (let i = 0; i < gameState.lanes.length; i++) {
    gameState.lanes[i]?.setCardAtDistance(0, frontCards[i])
  }

  // 대기 라인(distance 1, 2): 기존 가중치 스폰(3칸 병합만 금지) + 꽃·폭탄 각 1개 이상 보장.
  const waitingRows: Card[][] = []
  for (let distance = 1; distance < LANE_DISTANCE_COUNT; distance++) {
    waitingRows.push(cardSpawner.spawnCardsForOpeningRow(gameState.lanes.length, false, true))
  }
  cardSpawner.ensureWaitingRowsHaveFlowerAndBomb(waitingRows)
  waitingRows.forEach((row, idx) => {
    const distance = idx + 1
    for (let i = 0; i < gameState.lanes.length; i++) {
      gameState.lanes[i]?.setCardAtDistance(distance, row[i])
    }
  })

  gameState.regroupAllRows()
  trackFieldEnemyEncounters()
}

/** 이번 런이 새싹 병아리(온보딩)인지 — startGame에서 진입 방식(거점 vs 기본부팅)+졸업 여부로 정한다. */
let onboardingRunActive = false
/** 이번 런이 /시작 로비를 거쳐 들어왔는지(테스트 플레이=false). 클리어 창 버튼 분기에 쓴다. */
let runEnteredFromLobby = false
/** 이번 런의 통산 기록이 이미 합산됐는지 — showGameOver 중복 호출로 이중 집계되는 것을 막는다. */
let lifetimeRecorded = false
/** 이번 세션에서 이미 소개한 첫 조우 종류(보드 조우 + 보스/시련/상점/제단). 영구 기록과 별개로 세션 내 중복 발화를 막는다. */
const sessionFieldsIntroduced = new Set<string>()
/** 런 시작 시점의 경험 축 값 — 정산 육각형이 '이번 런 상승분'을 계산하는 기준점. */
let runStartAxisValues: number[] | null = null
function isOnboardingActive(): boolean {
  return onboardingRunActive
}

/** 온보딩 필드 카드 사라짐 블라스트 테마 — 종류별 팔레트. */
function fieldBurstTheme(card: Card): BurstTheme {
  if (card.trapKind === 'bush') return 'flower-wilt'       // 덤불 = 시드는 풀
  if (card.treasureKind === 'junk') return 'treasure-gain' // 잡동사니 = 흩어지는 잡동
  return 'vanish-smoke'                                    // 바위 = 흙먼지
}

/** 최전방에서 만료된 온보딩 필드 카드를 은은한 페이드+테마 블라스트로 지우고 라인 정리를 돌린다. */
/** 온보딩 필드 만료를 '레일 하강 전에' 처리한다: 최전방 필드 카드 턴 감소 → 0이면 페이드/블라스트/제거.
 *  빈칸 리필은 호출부의 레일 하강(compactAndRefillAllLanes)이 이어서 메우므로, 막 내려온 카드는
 *  이 감소를 겪지 않고 올바른 최대 턴수(2)로 시작한다(감소 → 하강 순서 보장). */
async function tickOnboardingFieldsBeforeDrop(): Promise<void> {
  const expired = turnManager.tickFieldExpiries()
  render()          // 감소를 즉시 뱃지에 반영(턴 지나면 바로 갱신) — 만료가 없어도 갱신한다.
  if (expired.length === 0) return
  await wait(420)   // 0턴에서 살짝 딜레이 후 사라짐(포자 0턴 표기와 같은 의도)
  // 은은하게 흐려지며 사라지고, 종류에 맞는 블럭 블라스트가 터진다.
  for (const { card } of expired) {
    const cell = document.querySelector<HTMLElement>(`.cell.card[data-card-id="${card.id}"]`)
    if (!cell) continue
    cell.classList.add('field-expire-fade')
    SquareBurst.playOn(cell, fieldBurstTheme(card), { count: 14, spread: 120, duration: 520 })
  }
  await wait(300)
  // 합체 카드는 tickFieldExpiries의 seen으로 이미 1회 취급됨 — 각 카드를 한 번씩 제거한다.
  for (const { card } of expired) gameState.removeCardFromRow(card, 0)
  render()
  // 리필은 여기서 하지 않는다 — 호출부의 레일 하강이 빈칸을 메운다.
}

/** 새싹 병아리 30F 클리어: 졸업 마킹(쉬움 개방) + 런 종료. 정산 화면은 showGameOver 분기가 렌더한다. */
async function runOnboardingClear(): Promise<void> {
  // 첫 30F 클리어 → 온보딩 졸업(다음 런부터 정상 스폰) + 쉬움 난이도 개방.
  enaAutonomousLearner.recordFirstSeen('onboarding-graduated')
  // 졸업 보상: 화폐($) 시스템도 함께 열린다 — 로비 도착 시 무역 개방 연출과 같은 beat에 등장.
  setMetaUnlocked('currency', true)
  recordNotice('새싹 병아리 클리어! 쉬움 난이도가 개방되었다', 'win')
  gameState.endGame('onboarding_clear_30')
  // 클리어 타이틀은 사망과 같은 finishTurn 경로로 연다(에나 클리어 대사가 끝난 뒤 페이드인).
  finishTurn()
}

/**
 * 온보딩 첫 필드: 3×3을 바위/덤불/잡동사니로 꽉 채운다. 각 행을 3종의 무작위 순열로 배치해
 * 가로 인접 동종이 없어 regroupAllRows가 합체하지 않는다("합체 안 된 채 스폰"). 진짜 위협은
 * 이후 리필로 뒤에서 내려온다. 정상 오프닝(fillBoardAtStart) 대신 호출한다.
 */
async function fillOnboardingField(): Promise<void> {
  syncSpawnerTier()
  const laneCount = gameState.lanes.length
  const kinds = ['rock', 'bush', 'junk'] as const
  // 뒤(위, dist-2)에서 앞(아래, dist-0)으로 '한 행씩' 천천히 스폰한다. 새 카드는 위에서 살짝
  // 떨어지며(card-enter-soft) 등장하므로, 카드가 위에서 아래로 내려온다는 걸 유저가 배우게 된다.
  for (let distance = LANE_DISTANCE_COUNT - 1; distance >= 0; distance--) {
    // 행마다 3종 순열을 섞어 불규칙하게 쌓되, 서로 다른 종이라 가로 합체가 없다.
    const row: Array<'rock' | 'bush' | 'junk'> = [...kinds]
    for (let i = row.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[row[i], row[j]] = [row[j], row[i]]
    }
    for (let i = 0; i < laneCount; i++) {
      gameState.lanes[i]?.setCardAtDistance(distance, cardSpawner.makeOnboardingFieldCard(row[i % row.length]))
    }
    gameState.regroupAllRows()
    trackFieldEnemyEncounters()
    render()
    await wait(340)   // 한 행씩 천천히 — '위→아래' 순차 채움을 눈에 보이게 한다.
  }
}

/** Runs now begin with an empty hand; first cards must come from play rewards. */
/**
 * 새 런/거점 진입 공통 초기화 — 적·직업·유물·시련·체인 등 이전 런 잔여를 모두 비운다.
 * 거점(enterHearth)은 이 위에 빈 레일만 노출하고, startGame은 이어서 직업 선택과 보드 채움을 한다.
 * 갓 게임을 켠 상태를 보장하려 직업/유물 스폰 보정·runModifiers·카드풀까지 메타 기준으로 되돌린다.
 */
function resetForNewRun(): void {
  gameActive = true
  inputLocked = false
  chain = HandSystem.newChain()
  pendingHandTarget = null
  // 동료(에나)의 런 한정 상태(의지/각성/턴 흐름) 초기화. 학습 가중치는 런 간 유지.
  companion.resetForRun()
  // 정산 육각형의 '이번 런 상승분' 기준점 — 런 시작 시점의 축 값을 캡처해 둔다.
  runStartAxisValues = experienceAxes(companion.getDisposition(), companion.getLearningSnapshot(), companion.getGrowth()).map((a) => a.value)
  companionDirector.resetRunDramaSignals() // 성장 점프 게이트 입력(드라마 신호)도 런 단위로 비운다.
  lifetimeRecorded = false // 통산 기록은 런당 1회 — 새 런에서 다시 열어 준다.
  sessionFieldsIntroduced.clear() // 세션 내 필드 소개 중복 가드도 런마다 비운다(영구 기록은 유지).
  companionDirector.pendingPrediction = null
  gameState.reset()
  // 헌혈팩 콜백: reset 이후 새 character 인스턴스에 설정해야 한다
  gameState.character.onHealGain = (amount) => {
    if (gameState.character.hasRelic('blood-pack')) void relicEffects.applyBloodPackHit(amount)
  }
  // 넘치는 촛농: 오버힐을 방패로 전환하고, 그 전환량을 '회복'으로도 집계해 헌혈팩까지 발동한다.
  gameState.character.onHealOverflow = (overflow) => {
    if (!gameState.character.hasRelic('overflow-wax')) return
    const shielded = gameState.character.addShield(overflow) // addShield가 가시 방패도 연쇄 발동
    recordRelicActivation('overflow-wax', `초과 회복 → 방패 +${shielded}`)
    boardRenderer.playHudCounterFeedback('shield', gameState.character.shield)
    if (gameState.character.hasRelic('blood-pack')) void relicEffects.applyBloodPackHit(overflow)
  }
  // 밀랍 조각: 굳은 카드가 필드에서 제거될 때(모든 처치 경로) 불빛·방패를 회수한다.
  gameState.onCardRemoved = (card) => {
    if (card.isFrozen() && gameState.character.hasRelic('wax-fragment')) void relicEffects.applyWaxFragmentOnFrozenClear()
  }
  // 가시 방패: 방패를 얻을 때마다 획득량만큼 전방 랜덤 적을 1씩 찌른다.
  gameState.character.onShieldGain = (amount) => {
    if (gameState.character.hasRelic('thorn-shield')) void relicEffects.applyThornShieldHits(amount)
  }
  cardSpawner.resetRelicModifiers()
  cardSpawner.resetSpawnState()
  // 비게임플레이(BGM)만 제외하고 잔여 상태를 모두 비운다: 체인 UID, 팩 세션, 디버그 이벤트, 말풍선.
  chainEventCounter = 0
  shopFlow.resetForNewRun()
  boardRenderer.closePackPicker()
  debugForcedEventId = null
  speechBubble.dismiss()
  bossBubble.dismiss()
  eventDemonBubble.dismiss()
  // 시련 영속 modifier(적 HP/공격력·함정 피해·보물 배율)도 런마다 비운다.
  // resetRelicModifiers는 유물/직업 보정만 지우므로, 여기서 runModifiers를 초기화하고
  // 스폰어에 0을 동기화하지 않으면 이전 런의 시련 버프가 다음 런 적/함정에 남는다.
  runModifiers.enemyHpBonus = 0
  runModifiers.enemyDamageBonus = 0
  runModifiers.trapDamageBonus = 0
  runModifiers.treasureSpawnScale = 1
  syncRunModifiersToSpawner()
  // 턴 모드·보스 컨트롤러 상태도 새 런을 위해 초기화한다.
  turnManager.setTurnMode('normal_turn')
  bossController.reset()
  clearChainTimeline()
  // 런 카드 풀(해금팩/삭제팩으로 바뀐 단일 해금·밴)과 확률팩 tier 보정을 메타 기준으로 되돌려,
  // 새로고침과 동일하게 언락 카드/드롭 풀까지 완전 초기화한다.
  runCardPool.reset(HAND_CARD_IDS, metaUnlockedCardIds)
  DropSystem.setAllowedPool(runCardPool.snapshot().unlocked)
  DropSystem.setTier1CardBoosts(gameState.enhancements.tier1CardBoosts)
  DropSystem.setTier1JobPoolBoosts(gameState.enhancements.tier1JobPoolBoosts)
  boardRenderer.setLockedCardIds([...runCardPool.snapshot().locked, ...runCardPool.snapshot().banned])
  boardRenderer.setLockedRecipeIds(RECIPES.filter((r) => r.runLocked).map((r) => r.id))
  eventSpawnCtrl.reset()
  pendingEventDoor = false
  finalAscentStarlightRuleActive = false
  syncFinalAscentRuleToSpawner()
  score = 0
  scorePulseKey = 0
  coins = 0
  coinPulseKey = 0
  // 처치/사용 카운터는 makeDefaultEnhancements()로 enhancements 재생성 시 함께 초기화된다.
  nextActivityLogId = 1
  activityLogs = []
  boardRenderer.closeShop()
  boardRenderer.resetShutter()
  syncSpawnerTier()
  boardRenderer.setHandTargetingMode(null)
  boardRenderer.clearSelection()
}

async function startGame(characterIndex = -1, difficulty: HearthDifficulty | null = null): Promise<void> {
  void characterIndex // 현재 캐릭터는 에나 단일이라 런 분기엔 미사용(추후 동행 해금 시 활용).
  const dinnerRelicProfile = pendingDinnerRelicProfile
  resetForNewRun()
  // 선택한 난이도가 온보딩 여부를 결정한다: 새싹 병아리 = 온보딩(30F 아크 + 필드 3종 + 양초 고양이),
  // 쉬움/보통 = 정규 스폰. 기본 부팅(difficulty=null=쉬움 테스트 필드)도 온보딩을 끈다.
  onboardingRunActive = difficulty === 'sprout'
  // 기본 부팅/게임오버 재시작(difficulty=null)은 '테스트 플레이'다 — /시작 로비를 거치지 않으므로
  // 메타 게이팅을 전부 우회해 직업·화폐·리롤을 모두 개방한다(개발용 플레이그라운드).
  // 로비(무역)를 거친 런(difficulty!=null)만 실제 개방 상태(isMetaUnlocked)를 따른다.
  const testPlay = difficulty === null
  runEnteredFromLobby = !testPlay
  document.body.classList.toggle('onboarding-run', onboardingRunActive)
  document.body.classList.toggle('meta-currency-locked', !testPlay && (onboardingRunActive || !isMetaUnlocked('currency')))
  document.body.classList.toggle('meta-reroll-locked', !testPlay && (onboardingRunActive || !isMetaUnlocked('shopReroll')))
  document.body.classList.toggle('meta-freecard-locked', !testPlay && (onboardingRunActive || !isMetaUnlocked('freeCard')))
  // 새싹 병아리: 런 카드 풀을 커먼 등급만 남겨 재구성한다(레어 이상 손패 잠금 — 검과 방패 등).
  // resetForNewRun이 전체 풀로 세팅한 뒤이므로 여기서 커먼 부분집합으로 덮어 드롭·팩·레시피에 일괄 반영한다.
  if (onboardingRunActive) {
    const commonUnlocked = metaUnlockedCardIds.filter(
      (id) => (HAND_CARD_RARITY[id] ?? 'common') === 'common' && !ONBOARDING_BANNED_CARDS.includes(id)
    )
    runCardPool.reset(HAND_CARD_IDS, commonUnlocked)
    DropSystem.setAllowedPool(runCardPool.snapshot().unlocked)
    boardRenderer.setLockedCardIds([...runCardPool.snapshot().locked, ...runCardPool.snapshot().banned])
  }
  pendingDinnerRelicProfile = dinnerRelicProfile
  // 런이 실제로 시작되므로 거점 로비에서 걸어 둔 말풍선 음소거를 해제한다(시작 대사 등 정상 출력).
  speechBubble.setMuted(false)
  // resetForNewRun이 거점 미리보기 유물을 지우므로, 만찬에서 만든 실제 유물은 런 시작 직후 재지급한다.
  if (pendingDinnerRelicProfile) {
    gameState.character.customRelicProfiles['last-supper'] = pendingDinnerRelicProfile
    if (gameState.character.addRelic('last-supper')) await relicEffects.applyRelicPurchaseEffect('last-supper')
  }
  pendingDinnerRelicProfile = null
  const poolSnapshot = runCardPool.snapshot()
  // 메타 사당 해금(영구) + 런 카드풀(임시) 이중 구조를 플레이 로그로 명시한다.
  recordNotice(`카드 풀 초기화: 메타해금 ${poolSnapshot.unlocked.length} / 잠김 ${poolSnapshot.locked.length} / 금지 ${poolSnapshot.banned.length}`, 'info')
  // 시작 직업 선택은 빈 레일 위의 암막 안에서 진행한다. 선택 전 3×3 스폰을 노출하지 않기 위함이다.
  render()
  // 거점→런: 로비 상태(off-screen)로 렌더된 런 패널/불씨 HUD를 다음 프레임에 해제해
  // 슬라이드 인 시킨다. 거점 미진입(기본 부팅)이면 클래스가 없어 즉시 정상 표시된다.
  requestAnimationFrame(() => document.body.classList.remove('hearth-lobby'))

  // 직업 선택 오버레이 — 테스트 플레이는 항상, 로비 런은 온보딩 아님 + jobSelect 개방 시에만 노출.
  let chosenJob: (typeof JOBS)[number] | undefined
  if (testPlay || (!isOnboardingActive() && isMetaUnlocked('jobSelect'))) {
    const chosenJobId = await boardRenderer.openJobSelect(JOBS)
    chosenJob = JOBS.find((j) => j.id === chosenJobId)
  }
  if (chosenJob) {
    const c = gameState.character
    // 체력 보너스: 양수는 maxHealth 증가, 음수는 maxHealth와 현재 HP를 함께 깎는다.
    if (chosenJob.healthBonus > 0) {
      c.increaseMaxHealth(chosenJob.healthBonus)
    } else if (chosenJob.healthBonus < 0) {
      c.maxHealth = Math.max(1, c.maxHealth + chosenJob.healthBonus)
      c.health = Math.min(c.health, c.maxHealth)
    }
    if (chosenJob.damageBonus > 0) c.applyDamageBoost(chosenJob.damageBonus)
    // 불빛 배율: 백분율을 scoreMultiplier 곱셈으로 누적한다.
    if (chosenJob.scorePct !== 0) {
      gameState.enhancements.scoreMultiplier *= (1 + chosenJob.scorePct / 100)
    }
    // 손패 한계 (증가만 허용)
    if (chosenJob.handLimitBonus > 0) c.increaseHandMax(chosenJob.handLimitBonus)
    // 불씨 한계: 양수는 increaseEmberMax, 음수는 직접 조정(최소 1 보장)
    if (chosenJob.emberLimitBonus > 0) {
      c.increaseEmberMax(chosenJob.emberLimitBonus)
    } else if (chosenJob.emberLimitBonus < 0) {
      c.emberMax = Math.max(1, c.emberMax + chosenJob.emberLimitBonus)
      c.ember = Math.min(c.ember, c.emberMax)
    }
    // 상점 할인율 저장 (상점 가격 계산 시 참조)
    if (chosenJob.shopDiscountPct !== 0) {
      gameState.enhancements.shopDiscountPct = chosenJob.shopDiscountPct
    }
    cardSpawner.setJobSpawnAdjust(chosenJob.spawnEnemy, chosenJob.spawnTrap, chosenJob.spawnTreasure, chosenJob.spawnFlower)
    // 기사/마법사: 직업 태그 그룹을 1차 거름망에 단일 항목(가중치 10)으로 추가한다.
    // 당첨 시 해당 태그 카드들 내에서 T2를 돌린다(개별 카드에 분산 추가하지 않음).
    if (chosenJob.id === 'knight' || chosenJob.id === 'mage') {
      gameState.enhancements.tier1JobPoolBoosts[chosenJob.id] = (gameState.enhancements.tier1JobPoolBoosts[chosenJob.id] ?? 0) + 10
      DropSystem.setTier1JobPoolBoosts(gameState.enhancements.tier1JobPoolBoosts)
    }
    // 도적: 함정 무시 확률 적용.
    if (chosenJob.trapIgnoreChance) c.trapIgnoreChance += chosenJob.trapIgnoreChance
  }
  // 보드 채움은 직업 유무와 무관하게 항상 실행한다(온보딩은 직업 선택을 건너뛰므로 밖으로 뺐다).
  // 온보딩(첫 경험)이면 잡동사니 필드로, 아니면 정상 오프닝으로 첫 보드를 채운다.
  // 온보딩이면 1~10층 저확률 필드 스폰도 켠다(첫 필드 이후 부드러운 전환 + 과도 합체 완화).
  cardSpawner.setOnboardingFieldSpawnChance(isOnboardingActive() ? 0.15 : 0)
  // 첫 실행 인트로: 칸이 내려오기 전 무대 비트(방사 밝힘→카드 안착→오프닝 대사→레일 등장)를 재생한다.
  const firstRunIntroActive = firstRunIntroPending
  firstRunIntroPending = false
  if (firstRunIntroActive) await playFirstRunIntroBeats()
  if (isOnboardingActive()) await fillOnboardingField()
  else fillBoardAtStart()
  turnManager.armFrontBombs()
  render()
  // 칸 드롭까지 끝났으면 좌우 UI를 슬라이드 인시키며 인트로를 닫는다.
  if (firstRunIntroActive) finishFirstRunIntro()
  // 직업을 골랐을 때만 직업 카드 HUD 이동 + 직업 암막 커튼 열림 연출을 재생한다.
  if (chosenJob) {
    await boardRenderer.animateJobCardToHud(chosenJob)
    await boardRenderer.playJobCurtainOpen()
  }

  // 1구역 커튼: 직업 선택 직후 항상 표시한다.
  // enterHearth()는 startGame()을 직접 호출하지 않으므로 로비 진입 자체에는 이 커튼이 나오지 않는다.
  // 첫 실행 인트로에서는 상단 커튼이 거슬리므로 생략한다(배경은 인트로가 이미 노출).
  if (!firstRunIntroActive) void zoneCurtain.show(ZONE_LIST[0], () => setZoneBackground(ZONE_LIST[0].bgUrl))

  // 1턴 시작 대사: 암막이 완전히 걷힌 뒤 살짝 딜레이 후 등장.
  {
    const opening = chosenJob
      ? companion.onJobSelect(chosenJob.id)
      : '역경 아래, 작은 불빛을 밝혀야만 해.'
    // 에나 자기학습 회상 — 직업 선택 런에서만 띄운다(튜토리얼 제외). 유대가 깊을수록 조금 더 자주(최대 +0.15).
    const memoryLine = enaAutonomousLearner.recallLineForNewRun(false, companion.getBond() * 0.15)
    // 인사와 회상을 같은 순차 큐(sayEnaBark→BarkSequencer)에 태운다: 인사가 먼저 뜨고,
    // 회상은 인사의 최소 노출 시간이 지난 뒤 이어서 나온다(뜨자마자 교체되는 충돌 제거).
    window.setTimeout(() => {
      if (!gameActive) return
      // 첫 실행 인트로에서는 오프닝 한마디를 중앙 안착 대사로 이미 쳤으므로 재발화하지 않는다.
      if (!firstRunIntroActive) {
        companionDirector.clearBarkQueue()
        companionDirector.enaSpeaking = false // 직전 런의 잔여 바크 상태와 무관하게 새 런 인사를 확정 표시한다.
        companionDirector.sayEnaBark(opening, { importance: BARK_IMPORTANCE.situation })
        if (memoryLine && companionDirector.companionWorldCanSpeak()) {
          companionDirector.sayEnaBark(memoryLine, { importance: BARK_IMPORTANCE.situation })
        }
      }
      // 인사 뒤, 첫 보드에 놓인 온보딩 필드(바위/덤불/잡동사니)를 한 줄로 묶어 소개한다.
      maybeIntroduceFields()
    }, 800)
  }
}

function buildChainHints() {
  // Precompute which visible hand slots would complete at least one recipe if
  // clicked now. Keeping this in index.ts lets the renderer stay presentation-only
  // while the recipe rules remain centralized in HandSystem/Recipes.ts.
  const recipeReadyBySlot: Record<number, { id: string; name: string; flavor: string }[]> = {}
  gameState.character.hand.forEach((card, slotIndex) => {
    const recipes = HandSystem.previewTriggeredRecipes(chain, card.defId, card.merged === true, gameState)
    if (recipes.length === 0) return
    recipeReadyBySlot[slotIndex] = recipes.map((recipe) => ({
      id: recipe.id,
      name: recipe.name,
      flavor: recipe.flavor,
    }))
  })
  // demon-summon은 chainTimeline에 추가되지 않으므로 별도 필터 불필요.
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
    // {{spawn}} 토큰 치환용 컨텍스트는 bright 기준 고정값을 사용한다.
    // 불씨 티어가 변해도 유물·시련 설명의 확률 표기가 흔들리지 않도록 하기 위함이다.
    spawnWeightContext: cardSpawner.getEffectiveWeightsForDisplay(),
    spawnPercents: cardSpawner.getEffectiveSpawnPercents(),
    emberDecayCountdown: gameState.character.emberDecayCountdown,
    vignetteIntensity: EmberSystem.getVignetteIntensity(tier),
    chainHints: buildChainHints(),
    pendingHandTarget,
    // 레일 상단 예고선은 화면 밖에서 다음에 실제로 들어올 리필 카드를 미리 보여준다.
    refillPreviewCards: buildRailRefillPreviewCards(),
  })
}

/** Build the same lane order that refill will use, including a pending event door override. */
function buildRailRefillPreviewCards(): (Card | null)[] {
  if (!gameActive || gameState.bossBattleActive || gameState.isGameOver) return []
  const preview = cardSpawner.peekNextRefillCards(gameState.lanes.length)
  if (!pendingEventDoor) return preview

  const topDistance = LANE_DISTANCE_COUNT - 1
  const firstRefillLane = gameState.lanes.findIndex((lane) => !lane.getCardAtDistance(topDistance))
  // 이벤트 문은 일반 리필보다 먼저 첫 빈 최상단 칸에 주입되므로 흰색 예고선을 우선 표시한다.
  if (firstRefillLane >= 0) preview[firstRefillLane] = pendingEventDoorPreviewCard
  return preview
}

/** Register slash-command debug palette. Opens with the `/` key.
 *  모바일에서는 좌상단 버튼으로 트리거한다. */
/** 디버그 악마 소환 가드 — 입력 잠금/보스전/게임오버 중엔 발동하지 않는다. */
function demonSummonDebugBlocked(): boolean {
  return inputLocked || Boolean(bossController.eventState) || gameState.isGameOver
}

/** 디버그 악마 소환 전체 연출 — 실제 레시피 발동과 같은 순서(불길함→배너 임팩트→커튼→보스). */
async function runDemonSummonDebug(): Promise<void> {
  inputLocked = true
  HandSystem.resetChain(chain)
  clearChainTimeline()
  boardRenderer.refreshChainBanner(buildChainHints())
  await wait(300)
  boardRenderer.playOminousShimmer()
  await playDialogueLine(speechBubble, null, '정말… 나타나는 건가…?', 2200, 280)
  chainTimeline.push({
    kind: 'recipe', recipeId: 'demon-summon',
    name: '악마 소환', flavor: '거짓 속의 진실을 직시하라.',
    uid: nextChainUid(),
  })
  boardRenderer.refreshChainBanner({
    events: [...chainTimeline],
    recipeReadyBySlot: {},
    demonImpactMode: true,
  })
  await wait(1800)
  await boardRenderer.playDemonBannerBurnFade()
  clearChainTimeline()
  boardRenderer.refreshChainBanner(buildChainHints())
  await boardRenderer.closeDemonCurtain()
  await bossController.runDemonSummon()
  setTimeout(() => { inputLocked = false }, 320)
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
 *  - 상점: 유물 구매·무료 카드 등은 전투 콤보가 아니라 체인이 뜰 자리가 아니다.
 *  - 보스 보상: 손패 사용 차단(postPhaseHandLocked)과 함께 체인도 끊는다. */
function chainRecordingSuppressed(): boolean {
  return shopFlow.isOpen() || bossController.postPhaseHandLocked
}

/** Record relic activation in the floating chain-area toast only. */
// 스택이 쌓여 발동하는(스탯 획득/강력한 한방) 누적형 유물 — 발동 순간 카드를 블라스트로 부상시킨다.
const STACK_BLAST_RELICS = new Set<RelicId>([
  'trump-shot', 'blood-sigil', 'coagulation', 'blood-writ', 'wax-recycle', 'wax-fragment',
  'demon-doll', 'ink-quill', 'ambition', 'honesty', 'luxury',
])

function recordRelicActivation(relicId: RelicId, message: string): void {
  // 상점/보스 보상 단계에서 발동한 유물 효과는 체인 로그에 남기지 않는다.
  if (chainRecordingSuppressed()) return
  // 누적형 유물이 조건을 채워 발동하면 보유 유물 팬에서 해당 카드를 부상시켜 확실히 알린다.
  if (STACK_BLAST_RELICS.has(relicId)) boardRenderer.playRelicStackBlast(relicId)
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
  return { name: `콤보 : ${candleModeLabel(mode)}`, message, mode }
}

/** Resolve every full hand-combo gauge from any source that can add candle
 *  progress. Hand-card plays, lavender flowers, and future relics all share
 *  this payoff loop so a gauge reaching 10 never depends on which system
 *  supplied the final point. */
async function resolveFullCandleGaugeEffects(source: ResourceTrailSource): Promise<void> {
  while (gameState.character.isCandleFull()) {
    await wait(GAUGE_TRIGGER_DELAY_MS)
    const beforeGaugeResources = snapshotPlayerResources()
    const gauge = fireCandleGaugeEffect()
    if (!gauge) break
    recordNotice(`${gauge.name}: ${gauge.message}`, 'gauge')
    // 태어나서 첫 게이지 만충 — 영구 성장/보상 선택 규칙을 그 자리에서 짧게 알려준다.
    const comboIntro = encounterIntroLineOnce('combo')
    if (comboIntro) companionDirector.sayEnaBark(comboIntro, { importance: BARK_IMPORTANCE.situation })
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
    // 게이지 페이오프로 HP/maxHP가 오르면 onHealGain 콜백이 blood-pack을 자동 처리한다.
    await playPlayerGainTrails(source, beforeGaugeResources)
    // 불씨/손패 최대치 모드는 상단 HUD 카운터를 즉시 굴려 증가를 읽히게 한다.
    if (gauge.mode === 'ember') {
      boardRenderer.playHudCounterFeedback('emberMax', gameState.character.emberMax)
    } else if (gauge.mode === 'draw') {
      render()
    }
  }
}

document.addEventListener('cardAction', (e: Event) => {
  // inputLocked 중엔 대사가 출력 중일 수 있으므로 강제 dismiss하지 않는다
  if (!inputLocked) speechBubble.dismiss()
  void handleCardAction(e)
})

document.addEventListener('itemAction', (e: Event) => {
  if (!inputLocked) speechBubble.dismiss()
  const detail = (e as CustomEvent<ItemActionDetail>).detail
  void handleHandSlotClick(detail.itemIndex)
})

// 대사 빨리감기/스킵 2단계: 1번째 클릭=빨리감기(읽기), 그 다음 클릭=스킵(닫기).
// 보스/이벤트 대사는 흐름 보호를 위해 기존대로 빨리감기만 한다.
document.addEventListener('mousedown', (e) => {
  // 모든 마우스 클릭에 클릭음 재생(우클릭 제외).
  if (e.button === 0) sfx.playClick()
  bossBubble.completeTyping()
  eventDemonBubble.completeTyping()
  const onProfile = (e.target as HTMLElement | null)?.closest('.player-card')
  if (speechBubble.isTyping) {
    speechBubble.completeTyping() // 1단계: 빨리감기(타이핑 즉시 완성 = 읽는 행위)
    return
  }
  if (!speechBubble.isShowing || onProfile) return
  // 2단계: 카드가 아닌 곳을 눌러 스킵 — 학습 판정/닫기는 디렉터가 담당한다.
  companionDirector.handleBubbleSkip()
})

document.addEventListener('chainReset', () => {
  if (chain.sequence.length === 0 && chainTimeline.length === 0) return
  HandSystem.resetChain(chain)
  clearChainTimeline()
  render()
})

document.addEventListener('candleModeCycle', () => {
  // 상점/제단은 inputLocked 상태지만 콤보 게이지 모드 전환은 안전한 idle 동작이라 허용한다.
  if (!gameActive || (inputLocked && !shopFlow.isOpen())) return
  gameState.character.cycleCandleMode()
  render()
})

document.addEventListener('candleModeSelect', (e: Event) => {
  // 상점/제단은 inputLocked 상태지만 콤보 게이지 모드 전환은 안전한 idle 동작이라 허용한다.
  if (!gameActive || (inputLocked && !shopFlow.isOpen())) return
  const detail = (e as CustomEvent<{ mode: CandleMode }>).detail
  if (!detail?.mode) return
  gameState.character.setCandleMode(detail.mode)
  render()
})

document.addEventListener('shopBuy', (e: Event) => {
  void shopFlow.handleShopBuy((e as CustomEvent<ShopBuyDetail>).detail)
})

document.addEventListener('shopPackPick', (e: Event) => {
  void shopFlow.handleShopPackPick((e as CustomEvent<ShopPackPickDetail>).detail)
})

document.addEventListener('shopPackReroll', (e: Event) => {
  void shopFlow.handleShopPackReroll((e as CustomEvent<{ packKind: ShopPackKind }>).detail.packKind)
})

document.addEventListener('shopPackPass', () => {
  shopFlow.resetPackSession()
  boardRenderer.closePackPicker()
  boardRenderer.openShop(shopFlow.buildShopStateView(), score, gameState.character)
})

document.addEventListener('shopClose', () => {
  void shopFlow.closeShopAndResume()
})

/** Click on a hand slot. Plain click = use single (or arm targeting). */
async function handleHandSlotClick(slotIndex: number): Promise<void> {
  if (!gameActive) return
  const character = gameState.character
  const card = character.hand[slotIndex]
  if (!card) return

  // 상점/제단 중에는 동전 손패만 사용 허용 — 턴·체인 없이 화폐만 지급하고 상점 표시를 갱신한다.
  const shopCoinUse = shopFlow.isOpen() && card.defId === 'coin'
  if (inputLocked && !shopCoinUse) return
  // 보스 격파 후 보상·시련 단계 동안 손패 사용 차단(사용자 요청). 상점 동전은 예외.
  if (bossController.postPhaseHandLocked && !shopCoinUse) return

  if (shopCoinUse) {
    const merged = card.merged === true
    const value = merged
      ? 5 + (gameState.enhancements.tripleBonus['coin'] ?? 0)
      : 1 + (gameState.enhancements.singleBonus['coin'] ?? 0)
    gameState.character.removeHandCardAt(slotIndex)
    shopFlow.gainCoinsFromCard(value)
    return
  }

  const def = getHandCardDef(card.defId)

  // Plain click on a targeted card arms it. The pending target stores
  // merged=true so UI target hints use the triple maxSpan/filter after render.
  const activeTargeting = card.merged === true ? def.targeting.triple : def.targeting.base
  if (activeTargeting.selection === 'target') {
    if (pendingHandTarget && pendingHandTarget.slotIndex === slotIndex) {
      pendingHandTarget = null
      boardRenderer.setHandTargetingMode(null)
      render()
      return
    }
    pendingHandTarget = { slotIndex, defId: def.id, merged: card.merged === true }
    boardRenderer.setHandTargetingMode(pendingHandTarget)
    render()
    return
  }

  await applyHandSingle(slotIndex)
  // 대상 미지정 손패(폭죽 등)가 보스 HP를 0으로 만들었을 수 있으니 같은 격파 흐름으로 합류한다.
  await bossController.applyPostHandEffect()
}

/** Broad clears get the opening-board mercy rule: the freshly rebuilt front
 *  row waits one player action before it can collapse into a 2/3-lane group. */
function shouldSuppressRegroupAfterClear(removedCount: number): boolean {
  return removedCount >= Math.ceil(gameState.lanes.length * LANE_DISTANCE_COUNT * 0.65)
}

/** 손패 이동/낙하 연출이 끝난 뒤 트리플 자동 합성을 별도 비트로 재생한다.
 *  useSingle에서 합성을 미뤘으므로(deferAutoMerge), 카드가 자리를 잡은 다음에 한 번에 합성해
 *  이동 애니메이션과 합성(is-entering) 애니메이션이 같은 렌더에서 충돌해 순간이동처럼 보이던
 *  문제를 막는다. 합성 대기 카드가 없으면 즉시 반환해 일반 사용 템포를 늦추지 않는다. */
async function resolveDeferredHandMerges(): Promise<void> {
  if (!HandSystem.hasPendingAutoMerge(gameState.character)) return
  // 빈 슬롯을 메우는 이동/낙하 연출(animateMovedHandSlots ~460ms)이 끝나길 기다린다.
  await wait(500)
  const merges = HandSystem.runAutoMerges(gameState.character)
  if (merges.length === 0) return
  // 태어나서 첫 트리플 합성 — 같은 카드 셋이 합쳐지는 규칙을 그 자리에서 짧게 알려준다.
  const tripleIntro = encounterIntroLineOnce('triple')
  if (tripleIntro) companionDirector.sayEnaBark(tripleIntro, { importance: BARK_IMPORTANCE.situation })
  // 합성 카드가 is-merged.is-entering으로 새로 렌더되어 수렴+버스트 연출이 온전히 재생된다.
  render()
  // 합성 연출(낙하 대기 620ms + 젤리/버스트)이 다음 렌더에 끊기지 않도록 충분히 기다린다.
  await wait(1180)
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
  const beforeSingleResources = snapshotPlayerResources()
  // Snapshot rail cards by id BEFORE useSingle mutates the model, so we can
  // still resolve baseHealth/getDamage on the removed cards for the score
  // strength formula.
  const beforeSingleCards = snapshotFieldCardsById()
  // 트리플 자동 합성은 미뤄 두고, 손패 이동/낙하 연출이 끝난 뒤 별도 비트로 재생한다
  // (이동 애니메이션과 합성 애니메이션이 한 렌더에서 충돌해 순간이동처럼 보이던 문제 방지).
  const result = HandSystem.useSingle(gameState, chain, slotIndex, target, true)
  if (!result.success) {
    inputLocked = false
    render()
    return
  }
  if (usedDef) {
    enaRuntimeObserver.recordHandDecision(gameState, usedDef.id, result.message)
    if (gameState.bossBattleActive) enaRuntimeObserver.recordBossDecision(gameState, `hand:${usedDef.id}:${result.message}`)
  }
  // 정직: 손패 1장 사용으로 집계(합체 카드도 슬롯 1장이므로 1로 센다).
  relicEffects.applyHonestyHandUse(1)
  // 태그 반응형 유물: 사용한 손패의 시너지 태그에 반응하는 유물 효과를 데이터 주도로 발동한다.
  if (usedDef) relicEffects.applyHandCardUseRelics(usedDef, usedCard?.merged === true)
  // 도서관: 마도서 태그 손패를 쓰면 다음 마도서까지의 카운트다운이 1 줄어든다(엔진 가속).
  if (usedDef?.synergyTags?.includes('tome')) relicEffects.advanceLibrary(1)
  // 동료(에나) 손패 사용 한줄평 — 가끔 그 카드의 능력에 대해 한마디.
  if (usedDef && companionDirector.companionWorldCanSpeak()) {
    const bark = companion.onUseCard(usedDef.id, usedDef.category, gameState.getCurrentTurn())
    if (bark) companionDirector.sayEnaBark(bark, { importance: BARK_IMPORTANCE.loot })
  }
  // 예측 대비 RL: 에나가 건넨 손패가 '곧바로/위기 타이밍에' 실제 효과를 냈는지 점수화한다.
  if (
    usedDef &&
    companionDirector.pendingPrediction &&
    companionDirector.pendingPrediction.cardIds.includes(usedDef.id) &&
    gameState.getCurrentTurn() <= companionDirector.pendingPrediction.deadlineTurn
  ) {
    const turnsHeld = Math.max(0, gameState.getCurrentTurn() - companionDirector.pendingPrediction.issuedTurn)
    const removedHazards = result.removedFieldCards.filter((c) => c.type === CardType.TRAP).length
    const immediateTimingBonus = turnsHeld === 0 ? 0.35 : turnsHeld === 1 ? 0.2 : 0
    // 청소 임팩트 보너스는 카드 id가 아니라 clean 태그로 판정한다 — 성수 등 기존/미래 청소 손패도 자동 포함.
    const cleanupImpactBonus = usedDef.synergyTags?.includes('clean') ? Math.min(0.45, removedHazards * 0.15) : 0
    const crisisTimingBonus = companionDirector.pendingPrediction.kind === 'cleanup' && removedHazards > 0 ? 0.25 : 0
    companion.recordPredictionOutcome(0.75 + immediateTimingBonus + cleanupImpactBonus + crisisTimingBonus)
    companionDirector.pendingPrediction = null
  }
  // 보스도 밀랍 굳음을 적용받는다(즉사만 면역). 굳음 중에는 보스가 반격/특수행동을 못 한다.
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
    relicEffects.applyBlindFaithCoins(result.coinsGained)
    await playResourceTrail({ kind: 'center' }, 'coin', result.coinsGained)
    if (usedDef) recordCoinGain(usedDef.name, result.coinsGained)
  }
  // 탐욕의 동전: 소량의 불빛을 주지만(인플레이션 적용) 사용자가 즉시 피해를 입는 찌꺼기.
  if (result.lightGained && result.lightGained > 0) {
    pushActivityLogsInDisplayOrder([createScoreLog('탐욕의 동전', result.lightGained, 'score')])
    await playResourceTrail({ kind: 'center' }, 'score', 1)
  }
  if (result.selfDamage && result.selfDamage > 0) {
    // 자해는 방패를 무시하고 HP에 직접 닳는다(takeDirectDamage).
    gameState.character.takeDirectDamage(result.selfDamage)
    recordNotice(`${usedDef?.name ?? '카드'}의 대가 — 자신이 ${result.selfDamage} 피해를 입었다`, 'hurt')
    render()
    await boardRenderer.animatePlayerDamageImpact(result.selfDamage)
    relicEffects.applyAnomalyHealthLoss()
    relicEffects.applyDemonDollSelfDamage(result.selfDamage)
    // 제물 패밀리: 자해를 카드(혈서)·방패(응고)·적 분산 피해(수혈)로 환급한다.
    relicEffects.applyBloodWritSelfDamage(result.selfDamage)
    relicEffects.applyCoagulationSelfDamage(result.selfDamage)
    await relicEffects.applyTransfusionSelfDamage(result.selfDamage)
    if (!gameState.character.isAlive() && !gameState.character.authoritySurvivePending) {
      gameState.endGame('character_defeated')
      if (!(await relicEffects.tryResolveSurvivalRelics())) finishTurn()
      inputLocked = false
      return
    }
  }
  // 검은 양초 사용 시 이벤트 보스 누적 카운터 동기화
  if (result.blackCandleCounterGain && bossController.eventState) {
    bossController.eventState.demonCandleCounter += result.blackCandleCounterGain
  }
  pendingHandTarget = null
  boardRenderer.setHandTargetingMode(null)

  // 손거울 트리플: 이전 손패 복제 로그를 남긴다.
  if (result.mirrorCopiedDefId) {
    const copiedName = getHandCardDef(result.mirrorCopiedDefId).name
    pushActivityLogsInDisplayOrder(createItemGainLogs([copiedName]))
    await playResourceTrail({ kind: 'center' }, 'hand', 1)
  }

  // 정원 가위로 수확된 꽃: 체력/방패/게이지는 HandSystem이 이미 반영했으므로
  // (playPlayerGainTrails가 위에서 이미 그 변화를 태웠다) 여기서는 캐릭터 상태가
  // 아닌 캐모마일(불빛)·금잔화(코인)만 ActionSystem.takeFlower와 동일하게 지급한다.
  const flowerHarvestIds = new Set((result.flowerHarvests ?? []).map((h) => h.cardId))
  for (const harvest of result.flowerHarvests ?? []) {
    const theme = flowerRewardTheme(harvest.kind)
    if (harvest.kind === 'chamomile') {
      const chamomileTier = Math.floor(gameState.getCurrentTurn() / 20) + 1
      pushActivityLogsInDisplayOrder([createScoreLog(`${harvest.name} 수확`, 30 * chamomileTier, 'score')])
      await playResourceTrail({ kind: 'card', cardId: harvest.cardId }, 'score', 1, theme)
    } else if (harvest.kind === 'marigold') {
      coins += harvest.amount
      coinPulseKey++
      relicEffects.applyBlindFaithCoins(harvest.amount)
      recordCoinGain(`${harvest.name} 수확`, harvest.amount)
      await playResourceTrail({ kind: 'card', cardId: harvest.cardId }, 'coin', harvest.amount, theme)
    }
  }

  // Light for any field cards the hand-card effect just removed (kill / clear
  // / grab). Same strength formula as direct clicks, so 손패 사용 도 "직접
  // 타격" 과 동일한 점수 룰을 따른다.
  // 청소(단일)는 불빛 없음 규칙으로 점수를 부여하지 않는다.
  // 정원 가위로 수확된 꽃은 위에서 이미 종류별 보상을 지급했으므로 일반 불빛 계산에서 제외한다.
  if (!result.suppressScoreForRemovedCards) {
    await awardScoreForRemovedCards(
      result.removedFieldCards.filter((r) => !flowerHarvestIds.has(r.cardId)),
      beforeSingleCards
    )
  }

  // Animate removals caused by the single hand card while the old board DOM is
  // still present. This is the "previous effect" beat the combo waits for.
  if (result.removedFieldCards.length > 0) {
    await boardRenderer.animateCardConsumeByIds(result.removedFieldCards, {
      suppressBurstIds: singleDamagedIds,
    })
    const singleEnemyKills = result.removedFieldCards.filter((removed) => removed.type === CardType.ENEMY).length
    await relicEffects.onEnemiesDefeated(singleEnemyKills)
    // 연료: 불씨 손패가 처치를 냈으면 불씨 게이지를 되채운다(flame 태그로 판정).
    if (usedDef) relicEffects.applyFuelOnFlameKill(usedDef, singleEnemyKills)
    // 확산: 불씨 손패로 처치한 레인마다 인접 레인 함정 1칸을 제거한다(처치 직후 안전 지점에서 board 변형).
    if (usedDef?.synergyTags?.includes('flame') && gameState.character.hasRelic('spread')) {
      const killedLanes = result.removedFieldCards
        .filter((r) => r.type === CardType.ENEMY && r.laneIndex !== undefined)
        .map((r) => r.laneIndex as number)
      if (killedLanes.length > 0) await relicEffects.applySpreadOnFlameKills(killedLanes)
    }
    await relicEffects.applyWaxCrowTreasureGains(
      result.removedFieldCards.filter((removed) => removed.type === CardType.TREASURE).length
    )
  }

  // 모닥불: 첫 타격으로 적이 처치됐을 때 즉시 체력을 회복한다.
  if (result.bonfireHealOnKill && result.bonfireHealOnKill > 0) {
    const enemiesKilled = result.removedFieldCards.filter((r) => r.type === CardType.ENEMY).length
    if (enemiesKilled > 0) {
      const beforeBonfireResources = snapshotPlayerResources()
      gameState.character.heal(result.bonfireHealOnKill)
      await playPlayerGainTrails({ kind: 'center' }, beforeBonfireResources)
    }
  }

  // Prepare the rail immediately after the single card effect. Recipes should
  // resolve against a compacted/refilled/front-regrouped board, preventing holes
  // after effects such as 한 걸음씩 or 밀매 remove cards from the field.
  // 샹들리에는 루프 종료 후 자체적으로 하강을 실행하므로 여기서는 건너뛴다.
  // (여기서 하강하면 새 적이 내려와 루프가 그 적까지 처치하는 연쇄가 발생한다.)
  if (!result.chandelierRepeat) {
    await runPreparationRefreshAfterFieldEffects({
      suppressFrontRegroupOnce: shouldSuppressRegroupAfterClear(result.removedFieldCards.length),
    })
  }

  // 손패가 빈 슬롯을 메우며 이동/낙하한 뒤, 충분히 자리잡은 다음 트리플 합성을 별도 비트로 재생한다.
  await resolveDeferredHandMerges()

  // 샹들리에: 처치 발생 시 동일 라운드를 빠른 딜레이로 반복 실행한다.
  // 반복 중에는 레일을 내리지 않고, 루프 종료 직후 하강을 1회 실행한다.
  if (result.chandelierRepeat) {
    const chandelierDamage = result.chandelierRepeat.isMerged ? 2 : 1
    let hadKills = result.removedFieldCards.some((r) => r.type === CardType.ENEMY)
    while (hadKills && !gameState.isGameOver) {
      await wait(80)
      if (gameState.isGameOver) break
      const beforeRepeatHealth = snapshotFieldHealthState()
      const beforeRepeatCards = snapshotFieldCardsById()
      const repeatResult = HandSystem.applyChandelierRound(gameState, chandelierDamage)
      const repeatLosses = diffFieldHealthLosses(beforeRepeatHealth)
      await boardRenderer.animateDamageNumbersById(repeatLosses)
      await awardScoreForRemovedCards(repeatResult.removedFieldCards, beforeRepeatCards)
      if (repeatResult.removedFieldCards.length > 0) {
        await boardRenderer.animateCardConsumeByIds(repeatResult.removedFieldCards, {
          suppressBurstIds: new Set(repeatLosses.map((l) => l.cardId)),
        })
        const chandelierKills = repeatResult.removedFieldCards.filter((r) => r.type === CardType.ENEMY).length
        await relicEffects.onEnemiesDefeated(chandelierKills)
        // 연료: 샹들리에 반복 처치도 불씨로 되돌린다(flame 태그 판정).
        if (usedDef) relicEffects.applyFuelOnFlameKill(usedDef, chandelierKills)
      }
      hadKills = repeatResult.removedFieldCards.some((r) => r.type === CardType.ENEMY)
    }
    // 루프 종료 후 레일을 한 번 하강/리필한다. 비-샹들리에 경로(위 2734)와 대칭이다.
    if (!gameState.isGameOver) {
      await runPreparationRefreshAfterFieldEffects({
        suppressFrontRegroupOnce: shouldSuppressRegroupAfterClear(result.removedFieldCards.length),
      })
    }
  }

  // 주전자: 첫 타격(useSingle에서 실행) 이후 나머지 타격을 빠른 딜레이로 순차 실행한다.
  // 40ms 간격으로 드르르르 연속 타격 → 루프 종료 후 단 1회 레일 정리를 수행한다.
  // (루프 내 runPreparationRefreshAfterFieldEffects는 레일 보충 애니메이션으로 연속감을 끊으므로 제거)
  if (result.teapotExtraHits && target) {
    const { damage: teapotDamage, totalCount } = result.teapotExtraHits
    let teapotHitsSinceHpUpdate = 0
    let teapotEnemiesKilled = 0
    for (let i = 1; i < totalCount; i++) {
      if (gameState.isGameOver) break
      if (target.card.getHealth() <= 0) break
      await wait(40)
      const beforeHitHealth = snapshotFieldHealthState()
      const beforeHitCards = snapshotFieldCardsById()
      const hitResult = HandSystem.applyTeapotHit(gameState, target, teapotDamage)
      const hitLosses = diffFieldHealthLosses(beforeHitHealth)
      // 피해 수치 표시: 매 타격마다 비동기로 띄워 촤르르 효과
      boardRenderer.animateDamageNumbersById(hitLosses)
      // HP 수치 갱신: 매 타격마다 render()로 카드 체력을 실시간 반영
      render()
      teapotHitsSinceHpUpdate += teapotDamage
      if (teapotHitsSinceHpUpdate >= 2) {
        teapotHitsSinceHpUpdate = 0
        if (bossController.eventState && hitLosses.some((l) => l.cardId === bossController.eventState!.card.id)) {
          boardRenderer.playHudCounterFeedback('boss-hp', Math.max(0, bossController.eventState.card.getHealth()), 120)
        }
      }
      await awardScoreForRemovedCards(hitResult.removedFieldCards, beforeHitCards)
      if (hitResult.removedFieldCards.length > 0) {
        await boardRenderer.animateCardConsumeByIds(hitResult.removedFieldCards, {
          suppressBurstIds: new Set(hitLosses.map((l) => l.cardId)),
        })
        teapotEnemiesKilled += hitResult.removedFieldCards.filter((r) => r.type === CardType.ENEMY).length
        // 레일 정리는 루프 종료 후 일괄 처리한다(중간 보충으로 연속감이 끊기는 것을 방지).
      }
      if (hitResult.targetKilled) break
    }
    // 루프 종료 후: 붉은 포션 등 처치 유물 일괄 처리 → 보스 HP 확정 갱신 → 레일 1회 정리
    if (teapotEnemiesKilled > 0) await relicEffects.onEnemiesDefeated(teapotEnemiesKilled)
    if (bossController.eventState) {
      boardRenderer.playHudCounterFeedback('boss-hp', Math.max(0, bossController.eventState.card.getHealth()))
    }
    if (!gameState.isGameOver) await runPreparationRefreshAfterFieldEffects()
  }

  // Resolve combo recipes one at a time. Each recipe gets its own delay,
  // animations, and preparation refresh so chained removals cannot leave rail
  // gaps and active-row cards can merge before the next recipe checks the board.
  let demonBossPending = false
  let recipeSafety = 32
  while (HandSystem.hasPendingRecipe(chain, gameState) && recipeSafety-- > 0) {
    await wait(COMBO_TRIGGER_DELAY_MS)
    const beforeRecipeFreeze = snapshotFieldFreezeState()
    const beforeRecipeHealth = snapshotFieldHealthState()
    // Capture pre-recipe field so we can score whatever the recipe removes.
    const beforeRecipeCards = snapshotFieldCardsById()
    const recipeResult = HandSystem.fireNextPendingRecipe(gameState, chain)
    if (recipeResult.firedRecipes.length === 0) break
    // 레시피 발동은 에나 기분을 살짝 끌어올린다(대사 없이 상태만).
    companion.noteMoodShift(0.05 * recipeResult.firedRecipes.length)
    // 태어나서 첫 레시피 발동 — 조합식 규칙을 그 자리에서 짧게 알려준다.
    const recipeIntro = encounterIntroLineOnce('recipe')
    if (recipeIntro) companionDirector.sayEnaBark(recipeIntro, { importance: BARK_IMPORTANCE.situation })
    if ((recipeResult.coinsGained ?? 0) > 0) {
      // Recipe currency uses the same wallet/pulse language as single coin cards.
      const gainedCoins = recipeResult.coinsGained ?? 0
      coins += gainedCoins
      coinPulseKey++
      relicEffects.applyBlindFaithCoins(gainedCoins)
      await playResourceTrail({ kind: 'chain' }, 'coin', gainedCoins)
      // Attribute the coin log row to the first fired recipe that produced it.
      const coinRecipe = recipeResult.firedRecipes[0]?.recipe
      if (coinRecipe) recordCoinGain(coinRecipe.name, gainedCoins)
    }
    for (const fired of recipeResult.firedRecipes) {
      if (fired.recipe.id === 'demon-summon') demonBossPending = true
      // 보스 전투 중 즉사·전방소멸 레시피 시도 → 보스는 이미 면역 처리됐으므로 저항 연출만 재생.
      if (
        bossController.eventState &&
        (fired.recipe.effect === 'destroy-random-front-enemy' || fired.recipe.effect === 'clear-front-cards')
      ) {
        void boardRenderer.playBossFreezeResist(bossController.eventState.card.id)
      }
      // demon-summon은 demonBossPending으로 별도 처리 — 체인 배너엔 표시하지 않는다.
      if (fired.recipe.id !== 'demon-summon') {
        chainTimeline.push({
          kind: 'recipe',
          recipeId: fired.recipe.id,
          name: fired.recipe.name,
          flavor: fired.recipe.flavor,
          uid: nextChainUid(),
        })
      }
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
      await relicEffects.onEnemiesDefeated(
        recipeResult.removedFieldCards.filter((removed) => removed.type === CardType.ENEMY).length
      )
      await relicEffects.applyWaxCrowTreasureGains(
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

  // 레바테인: 전투 페이즈 시뮬레이션(또는 보스 주기 전진) 후 최대체력 % 피해를 적용한다.
  // 시뮬레이션 중 플레이어/보스가 쓰러지면 조기 종료하고 후처리는 기존 경로에 맡긴다.
  if (result.simulatedBattlePhases && result.simulatedBattlePhases > 0) {
    const phases = result.simulatedBattlePhases
    // 턴 흐름: 각 시뮬레이션 페이즈마다 플레이어 카드 위에 황금 숫자(1,2…)를 흔들리게 띄운다.
    if (gameState.bossBattleActive && bossController.eventState) {
      for (let phase = 0; phase < phases; phase++) {
        if (gameState.isGameOver || !bossController.eventState) break
        boardRenderer.showLevateinChargeMark(phase + 1)
        await wait(340)
        await bossController.advanceBossTurnsForLevatein(1)
      }
    } else if (!gameState.bossBattleActive) {
      for (let phase = 0; phase < phases; phase++) {
        if (gameState.isGameOver) break
        boardRenderer.showLevateinChargeMark(phase + 1)
        await wait(340)
        await runSimulatedEnemyPhase()
      }
    }
    boardRenderer.clearLevateinChargeMark()

    // 시뮬레이션 이후 대상 카드가 아직 살아있으면 강타로 % 피해를 입힌다.
    const levDmg = result.levateainDamage ?? 0
    if (levDmg > 0 && !gameState.isGameOver && target && target.card.getHealth() > 0) {
      const targetId = target.card.id
      const beforeBossHp = bossController.eventState?.card.getHealth() ?? 0
      const beforeHp = target.card.getHealth()
      // 점수 정산은 제거 전 스냅샷이 필요하므로 takeDamage 이전에 캡처한다.
      const preStrikeSnapshot = snapshotFieldCardsById()
      target.card.takeDamage(levDmg)
      // 보스 밀랍 방패/페이지 클램프(보스 HP 보정)를 먼저 반영해 최종 HP를 확정한다.
      if (bossController.eventState) {
        bossController.absorbExternalBossDamageWithShield(beforeBossHp)
        bossController.clampWaxWitchExternalDamageToPageFloor()
      }
      const afterHp = target.card.getHealth()
      const killed = afterHp <= 0 && target.card.type !== CardType.BOSS
      if (killed) {
        // 시뮬레이션 중 레일 하강으로 대상이 이동했을 수 있어 현재 거리를 다시 찾아 제거한다.
        const currentDistance = locateCardDistance(target.card) ?? target.distance
        gameState.removeCardFromRow(target.card, currentDistance)
      }
      // 강타 연출: 화염 볼트 → 착탄 버스트 → 큰 피해 수치 + HP 1씩 롤링.
      // 보스가 대상이면 afterBossHp를 넘겨 볼트 착탄과 동시에 HUD 롤링이 시작되도록 한다.
      const afterBossHp = bossController.eventState?.card.getHealth() ?? null
      await boardRenderer.animateLevateinStrike(
        targetId, levDmg, beforeHp, Math.max(0, afterHp),
        bossController.eventState ? beforeBossHp : undefined,
        bossController.eventState && afterBossHp !== null ? Math.max(0, afterBossHp) : undefined
      )
      if (killed) {
        await awardScoreForRemovedCards([{ cardId: targetId, type: target.card.type }], preStrikeSnapshot)
        // 강타 후 적 처치 연출: 레바테인 볼트가 이미 버스트를 냈으므로 shrink만 재생한다.
        await boardRenderer.animateCardConsumeByIds([{ cardId: targetId, type: target.card.type }], {
          suppressBurstIds: new Set([targetId]),
        })
        await relicEffects.onEnemiesDefeated(1)
        if (!gameState.isGameOver) await runPreparationRefreshAfterFieldEffects()
      }
    }
  }

  // 악마 소환 레시피 발동 — 체인 초기화 → 불길한 연출 → 커튼 → 이벤트 보스 전투.
  if (demonBossPending && !bossController.eventState && !gameState.isGameOver) {
    demonBossPending = false
    // 1. 체인 배너 초기화
    HandSystem.resetChain(chain)
    clearChainTimeline()
    boardRenderer.refreshChainBanner(buildChainHints())
    await wait(300)
    // 2. 화면 일렁임 + 플레이어 대사 (동시 시작)
    boardRenderer.playOminousShimmer()
    await playDialogueLine(speechBubble, null, '정말… 나타나는 건가…?', 2200, 280)
    // 3. 악마 소환 체인 배너 임팩트 모드 (전체 레시피 항목, 더 크고 중앙, X 없음, 불타듯)
    chainTimeline.push({
      kind: 'recipe', recipeId: 'demon-summon',
      name: '악마 소환', flavor: '거짓 속의 진실을 직시하라.',
      uid: nextChainUid(),
    })
    boardRenderer.refreshChainBanner({
      events: [...chainTimeline],
      recipeReadyBySlot: {},
      demonImpactMode: true,
    })
    await wait(1800)
    // 4. 불타듯 사라지기 + 체인 정리
    await boardRenderer.playDemonBannerBurnFade()
    clearChainTimeline()
    boardRenderer.refreshChainBanner(buildChainHints())
    // 5. 커튼 닫힘 → 보스 전투
    await boardRenderer.closeDemonCurtain()
    await bossController.runDemonSummon()
    // 보스 전투·보상·시련 완료 후 입력 복귀.
    setTimeout(() => { inputLocked = false }, 320)
    return
  }

  // 손패 카드(조합식 포함)로 보스 HP가 깎였다면 HP 3 임계 손패 트리거 + 격파 검사.
  // 클릭 데미지·손패 데미지·조합식 데미지 어느 경로든 동일한 후처리가 적용된다.
  await bossController.applyPostHandEffect()
  // 보스전 체인은 손패 사용으론 끊지 않는다 — 직접 타격(applyBoardAction) 시에만 리셋.
  // 콤보 배너는 applyPostHandEffect 내 조합식 발동 후 buildChainHints로 갱신이 오므로 별도 갱신 불필요.
  setTimeout(() => {
    inputLocked = false
  }, 320)
}

/** 레바테인 전용: 적 공격/폭탄/꽃/보물 처리를 1회 실행하되 실제 턴 카운터를 올리지 않는다. */
async function runSimulatedEnemyPhase(): Promise<void> {
  const beforeTrapHealth = snapshotFieldHealthState()
  const hits = turnManager.runEnemyPhase({ shouldDodge: ({ damage }) => companionDirector.tryCompanionIncomingDodge(damage) })
  const treasureChanges = turnManager.applyTreasureVolatility(cardSpawner)
  const bombExplosions = turnManager.applyBombExplosions()
  const flowerChanges = turnManager.applyFlowerGrowthAndWilt(cardSpawner)

  const eventAnimations: Promise<void>[] = []
  if (hits.length > 0) eventAnimations.push(boardRenderer.animateEnemyAttacks(hits))
  if (treasureChanges.length > 0) eventAnimations.push(boardRenderer.animateTreasureChanges(treasureChanges))
  if (bombExplosions.length > 0) {
    const playerDamageTotal = bombExplosions.reduce((s, e) => s + e.playerDamage, 0)
    const damageLosses = diffFieldHealthLosses(beforeTrapHealth)
    for (const exp of bombExplosions) recordNotice(`${exp.cardName} 폭발! -${exp.playerDamage}`, 'hurt')
    eventAnimations.push(
      (async () => {
        await boardRenderer.animateBombExplosion(bombExplosions)
        await Promise.all([
          boardRenderer.animateDamageNumbersById(damageLosses),
          playerDamageTotal > 0
            ? boardRenderer.animateDamageImpactOnElement(
                boardRenderer.findCardElement('__player__') ?? document.querySelector<HTMLElement>('.player-card'),
                playerDamageTotal
              )
            : Promise.resolve(),
        ])
      })()
    )
  }
  if (flowerChanges.growths.length > 0) eventAnimations.push(boardRenderer.animateFlowerGrowth(flowerChanges.growths))
  if (flowerChanges.wilts.length > 0) eventAnimations.push(boardRenderer.animateFlowerWilts(flowerChanges.wilts))
  if (eventAnimations.length > 0) await Promise.all(eventAnimations)

  const totalDamage = hits.reduce((acc, h) => acc + h.damage, 0)
  if (totalDamage > 0) {
    recordNotice(`레바테인: 적 행동 (피해 ${totalDamage})`, 'hurt')
    render()
    await boardRenderer.animateDamageImpactOnElement(
      boardRenderer.findCardElement('__player__') ?? document.querySelector<HTMLElement>('.player-card'),
      totalDamage
    )
  }
  relicEffects.applyAnomalyHealthLoss()

  if (!gameState.character.isAlive() && !gameState.character.authoritySurvivePending) {
    gameState.endGame('character_defeated')
  }

  // 보물 휘발/폭탄 폭발 등으로 카드가 사라지면 레일에 구멍이 남는다. 일반 턴 cleanup과
  // 동일하게 하강·리필(+재그룹/개화/폭탄 점화)을 돌려 빈 레일을 메운다. 턴 카운터는 올리지 않는다.
  if (!gameState.isGameOver) {
    await runPreparationRefreshAfterFieldEffects()
    // 족쇄/레바테인의 시뮬레이션 1턴 흐름도 실제 턴처럼 포자 번식 카운트다운을 진행시킨다.
    await resolvePostDropSporeSpread()
  }
}

async function runCleanupPhase(advanceTurn: boolean): Promise<void> {
  const shouldTickEmber = advanceTurn
    || (!turnManager.isBossPhase() && finalAscentStarlightRuleActive)
  if (advanceTurn && !turnManager.isBossPhase()) {
    const beforeTurnFreeze = snapshotFieldFreezeState()
    gameState.nextTurn()
    await boardRenderer.animateWaxThawByIds(diffThawedCards(beforeTurnFreeze))
    // Reset chain on every turn boundary — the player should not be able to
    // hold an unbounded chain across many turns. Also clear the UI timeline
    // so the chain banner fades out at the same beat.
    HandSystem.resetChain(chain)
    clearChainTimeline()
  }
  // 일반 턴 전진 또는 90층 별빛 규칙 활성 시 불씨를 소모한다.
  // 별빛 규칙 중엔 실제 턴이 오르지 않으므로 가상 불씨 틱만 처리한다.
  if (shouldTickEmber && !turnManager.isBossPhase()) {
    // Tick the ember decay countdown; ember decreases every 3rd turn.
    const tickedDown = turnManager.tickEmberDecay()
    syncSpawnerTier()
    if (tickedDown) {
      const ember = gameState.character.ember
      recordNotice(`불씨가 사그라들었다 (${ember}/${gameState.character.emberMax})`, 'hurt')
      // 불씨가 dim→flickering 경계(4) 직전에 플레이어에게 경고 대사를 띄운다
      if (ember === 4) { companionDirector.enaSpeaking = false; speechBubble.show('불씨가 약해지고 있어. . .') }
      // 고품격 뗄감: 불씨가 완전히 꺼지면 가득 채우고 유물 파괴.
      if (ember <= 0 && gameState.character.hasRelic('premium-firewood')) {
        const beforeResources = snapshotPlayerResources()
        // 파괴 연출(강도 2)을 먼저 보여 준 뒤 불씨를 채우고 파괴한다.
        await boardRenderer.animateRelicDestroy('premium-firewood', 2)
        gameState.character.ember = gameState.character.emberMax
        syncSpawnerTier()
        gameState.character.removeRelic('premium-firewood', true)
        recordRelicActivation('premium-firewood', `불씨 완전 회복 (발동 후 파괴)`)
        render()
        await playPlayerGainTrails({ kind: 'chain' }, beforeResources)
      }
      // 소소한 클러치 — 불씨 수호: 게이지가 완전히 꺼지는 순간 에나가 몰래 한 칸을 살린다.
      // 고품격 뗄감이 있으면 유물의 완전 회복이 우선이므로 개입하지 않는다.
      if (
        gameState.character.ember <= 0 &&
        companionDirector.companionWorldCanSpeak() &&
        companion.rollMinorClutch('ember', { adversity: true })
      ) {
        gameState.character.ember = 1
        syncSpawnerTier()
        recordNotice('에나의 의지 — 불씨 수호! 불씨 +1', 'info')
        void boardRenderer.animateClutchOnPlayer('ember-gain')
        companionDirector.showClutchChain('ember-save', '꺼지려는 불씨 +1')
        companionDirector.sayEnaBark(companion.minorClutchLine('ember'), { importance: BARK_IMPORTANCE.clutch })
        render()
        // 불씨 수치 피드백을 다른 불씨 획득(변칙 등)과 같은 HUD 카운터 beat로 맞춘다.
        boardRenderer.playHudCounterFeedback('ember', gameState.character.ember)
      }
      // 불씨 하락으로 필드 적의 공격력이 오르면, 적 카드가 붉게 확대되며
      // 잔상을 남기는 위험 연출을 띄운다(HP는 불변, 공격력만 동적 반영).
      const empoweredIds = syncFieldEnemyEmberBonus()
      if (empoweredIds.length > 0) {
        render()
        await boardRenderer.animateEnemyEmberEmpower(empoweredIds)
      }
    }
    await relicEffects.applyTurnStartRelics()
  }

  // 이벤트 문 독립 PRD 롤: 실제 턴 전진 시에만, 보스·최종등반 중엔 중단.
  // 새싹 병아리(온보딩)에서는 이벤트 문이 아예 나오지 않는다(정규 런부터 등장).
  // 당장 주입 못 해도 pendingEventDoor=true로 보류하면 다음 빈 슬롯에 자동 주입된다.
  if (advanceTurn && !gameState.bossBattleActive && !finalAscentStarlightRuleActive &&
      !isOnboardingActive() &&
      eventSpawnCtrl.rollForTurn(gameState.getCurrentTurn())) {
    pendingEventDoor = true
  }
  // 온보딩 필드(바위/덤불/잡동사니) 만료는 레일 하강 '직전'에 처리한다 — 최전방에서 살아남은
  // 필드 카드만 턴을 깎고 0이면 제거한 뒤 하강시켜, 막 내려온 카드가 감소를 겪지 않게 한다.
  if (advanceTurn && isOnboardingActive()) await tickOnboardingFieldsBeforeDrop()
  const moved = compactAndRefillAllLanes()
  render()
  if (moved) await wait(460)

  gameState.regroupAllRows()
  trackFieldEnemyEncounters()
  // 새로 내려온 온보딩 필드(바위/덤불/잡동사니)를 처음 겪는 순간 에나가 한 번 소개한다.
  maybeIntroduceFields()
  const blooms = turnManager.bloomFrontSeeds(cardSpawner)
  turnManager.armFrontBombs()
  boardRenderer.clearSelection()
  render()
  if (blooms.length > 0) await boardRenderer.animateFlowerBlooms(blooms)
  await sweepFrontStarlights()
  await tickFrontEventDoors()
  // 보드 정비가 끝나 플레이어 차례 직전 — 위협을 미리 읽어 대비 카드를 건넨다.
  if (advanceTurn) await companionDirector.tryCompanionPrediction()
}

/** 전방 이벤트 문의 2턴 카운트다운을 진행한다. 도달 즉시 뱃지 '슈룩' 등장,
 *  0 경과 시 보물처럼 은은히 닫혀 사라진다. 진입(클릭)하지 않은 문만 대상이다. */
async function tickFrontEventDoors(): Promise<void> {
  const ticks = turnManager.tickFrontEventDoors()
  if (ticks.length === 0) return
  // closed 문은 이미 모델에서 제거됐으므로 render 전 현재 DOM에 소멸 애니메이션을 먼저 건다.
  const closedIds = ticks.filter((t) => t.phase === 'closed').map((t) => t.cardId)
  // 닫힌 문은 모델에서는 이미 빠졌지만 render 전 DOM은 살아 있으므로, 먼저 부드러운 소멸을 보여준다.
  if (closedIds.length > 0) await boardRenderer.animateEventDoorCloseByIds(closedIds)
  render()
  for (const t of ticks) if (t.phase === 'started') boardRenderer.popEventBadge(t.cardId)
  if (closedIds.length > 0) {
    // 사라진 뒤 즉시 레일을 정리/보충해 빈칸이 다음 턴까지 남지 않게 한다.
    compactAndRefillAllLanes()
    gameState.regroupAllRows()
    // 문 위에 있던 씨앗/별빛이 전방으로 내려왔다면 일반 턴 정비와 동일하게 발화/수집한다.
    // (문 닫힘 정리에서 이 처리를 빠뜨리면 씨앗이 개화하지 않고 별빛 턴 +1도 누락된다.)
    const blooms = turnManager.bloomFrontSeeds(cardSpawner)
    turnManager.armFrontBombs()
    const startedEventDoors = turnManager.startFrontEventDoorArrivals()
    render()
    if (blooms.length > 0) await boardRenderer.animateFlowerBlooms(blooms)
    for (const t of startedEventDoors) boardRenderer.popEventBadge(t.cardId)
    await sweepFrontStarlights()
  }
}

/** 전방에 내려앉은 별빛을 자동 수집한다. 별빛 1장당 런 턴 +1 + 턴 HUD 블라스트.
 *  최종 등반(90~100F) 외에는 별빛이 존재하지 않아 스캔 비용만 발생한다. */
async function sweepFrontStarlights(): Promise<void> {
  const swept = turnManager.sweepFrontStarlights()
  if (swept.length === 0) return
  // 별빛 수집 한마디 — 등반 내내 반복되는 이벤트라 낮은 확률 게이트로 스팸을 막는다.
  if (gameActive && !gameState.isGameOver && Math.random() < 0.35) {
    companionDirector.sayEnaBark(companion.starlightLine(), { importance: BARK_IMPORTANCE.touch })
  }
  // 모델에서 제거됐지만 아직 render() 전이라 DOM에는 별빛이 남아 있다.
  // 모든 출발 rect를 먼저 확보한 뒤 순차 연출해, 첫 render로 다음 별빛 노드가
  // 사라져도 좌표를 잃지 않게 한다.
  const shots = swept.map((s) => ({ rect: boardRenderer.getCardRect(s.cardId) }))
  for (const shot of shots) {
    // 한 번의 sweep에서 여러 별빛을 먹어 100턴을 넘기는 경우(손패 콤보 등): 100에 도달한
    // 뒤의 잔여 별빛은 수집(턴 +1)하지 않고 그 자리에서 소멸시켜 런 턴을 정확히 100으로
    // 고정한다. 100턴 도달 = 최종 보스 진입 트리거이므로 초과 진행을 만들지 않는다.
    if (gameState.getCurrentTurn() < RUN_TARGET_TURNS) {
      if (shot.rect) await boardRenderer.fireStarlightToTurn(shot.rect)
      gameState.nextTurn()
      render()
      await wait(140)
    } else {
      if (shot.rect) await boardRenderer.dissolveStarlight(shot.rect)
      render()
      await wait(100)
    }
  }
  // 별빛 제거로 빈칸이 생겼으면 즉시 정리/보충
  const moved = compactAndRefillAllLanes()
  gameState.regroupAllRows()
  turnManager.armFrontBombs()
  if (moved) {
    render()
    await wait(460)
  }
  // 별빛 제거 후 낙하한 씨앗이 전방에 도달했으면 개화 처리한다.
  const starlightBlooms = turnManager.bloomFrontSeeds(cardSpawner)
  if (starlightBlooms.length > 0) {
    render()
    await boardRenderer.animateFlowerBlooms(starlightBlooms)
  }
}

async function resolvePostDropSporeSpread(): Promise<void> {
  // (온보딩 필드 만료는 레일 하강 전 runCleanupPhase에서 tickOnboardingFieldsBeforeDrop로 처리한다.)
  // Spores are the only turn-timer event that intentionally waits for rail
  // gravity. This keeps enemy/chest/bomb/flower beats on the pre-drop board,
  // while still letting spores infect a real card that fell into a formerly
  // empty neighboring cell after the rail descended.
  const sporeTicks = turnManager.tickSporeCountdowns()
  const hasReadySpore = sporeTicks.some((tick) => tick.turnsUntilSpread === 0)
  if (sporeTicks.length > 0) {
    render()
    // 0턴 뱃지를 충분히 보여 준 뒤 전염/2턴 리셋이 이어지도록 멈춘다(보스 카운터 0 표기와 같은 의도).
    if (hasReadySpore) await wait(420)
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
  // 동료(에나) 포자 번식 반응.
  if (spreadCount > 0 && companionDirector.companionWorldCanSpeak()) {
    const bark = companion.reactSituation('spore', gameState.getCurrentTurn())
    if (bark) companionDirector.sayEnaBark(bark, { importance: BARK_IMPORTANCE.situation, situation: 'spore' })
  }
  render()
  // 소소한 클러치 — 정화: 전염이 2칸 이상 번진 순간, 방금 번진 포자 1장을 걷어낸다.
  if (spreadCount >= 2 && companionDirector.companionWorldCanSpeak()) {
    // 병합 군집이 아닌 새 1칸 포자만 대상으로 골라 정확히 '1장'만 제거한다. 대상 확보 후에만
    // 확률을 굴려 '도왔다는 기억만 남고 아무 일도 없는' 헛발동을 막는다.
    const target = sporeSpreads
      .flatMap((spread) => spread.infected)
      .map((pos) => ({ pos, card: gameState.lanes[pos.laneIndex].getCardAtDistance(pos.distance) }))
      .find((entry) => entry.card?.type === CardType.TRAP && entry.card.trapKind === 'spore' && entry.card.groupCount === 1)
    if (target?.card && companion.rollMinorClutch('cleanse', { adversity: spreadCount >= 3 })) {
      recordNotice('에나의 의지 — 정화! 번진 포자 1장 제거', 'info')
      companionDirector.showClutchChain('cleanse', '번진 포자 1장 제거')
      companionDirector.sayEnaBark(companion.minorClutchLine('cleanse'), { importance: BARK_IMPORTANCE.clutch })
      // 방금 render()로 DOM에 오른 포자를 소멸 연출 후 모델에서 제거한다.
      await boardRenderer.animateCardConsumeByIds([{ cardId: target.card.id, type: CardType.TRAP }])
      gameState.removeCardFromRow(target.card, target.pos.distance)
      render()
      // 정화는 일반 cleanup 이후에 실행되므로, 이벤트 문 닫힘 정리와 동일하게 즉시
      // 하강·리필·재그룹까지 돌려 빈칸이 다음 턴까지 남지 않게 한다(모델/렌더 동기화).
      compactAndRefillAllLanes()
      gameState.regroupAllRows()
      const cleanseBlooms = turnManager.bloomFrontSeeds(cardSpawner)
      turnManager.armFrontBombs()
      const cleanseDoors = turnManager.startFrontEventDoorArrivals()
      render()
      if (cleanseBlooms.length > 0) await boardRenderer.animateFlowerBlooms(cleanseBlooms)
      for (const t of cleanseDoors) boardRenderer.popEventBadge(t.cardId)
      await sweepFrontStarlights()
    }
  }
}

async function resolveEventPhaseAndPrepareNextTurn(advanceTurn: boolean = true): Promise<void> {
  const beforeTrapHealth = snapshotFieldHealthState()
  const hits = turnManager.runEnemyPhase({ shouldDodge: ({ damage }) => companionDirector.tryCompanionIncomingDodge(damage) })
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
      if (explosion.playerDamage > 0) enaRuntimeObserver.noteDamageSource(explosion.cardName)
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
  // 이번 beat에서 가장 아프게 때린 적 — 사망 원인 회상과 콜백('아까 그 적') 기억에 함께 쓴다.
  const biggestHit = totalDamage > 0 ? [...hits].sort((a, b) => b.damage - a.damage)[0] : undefined
  if (totalDamage > 0) {
    if (biggestHit) enaRuntimeObserver.noteDamageSource(biggestHit.cardName)
    recordNotice(`적 공격! -${totalDamage}`, 'hurt')
    render()
    await boardRenderer.animateDamageImpactOnElement(
      boardRenderer.findCardElement('__player__') ??
        document.querySelector<HTMLElement>('.player-card'),
      totalDamage
    )
  }
  // 반격 클러치 판정을 먼저 굴려 같은 피격 beat에서 '아픔' 바크와 '반격' 대사가 동시에
  // 나오는 감정 모순을 막는다 — 반격이 뜨면 그 대사가 이 beat의 감정을 대표한다.
  const counterClutchFires =
    totalDamage > 0 &&
    companionDirector.companionWorldCanSpeak() &&
    companion.rollMinorClutch('counter', {
      adversity: totalDamage >= Math.max(3, gameState.character.maxHealth * 0.25),
    })
  // 동료(에나) 피격 반응 — 확률+쿨다운으로 강약 조절(위급하면 더 다급한 말투).
  if (totalDamage > 0 && !counterClutchFires && companionDirector.companionWorldCanSpeak()) {
    const danger = companionDirector.companionInDanger()
    // 적 이름은 대사 풀 선택이 아니라 최근 사건 기록(복수 콜백 재료)에만 쓰인다.
    const line = companion.reactSituation('hit', gameState.getCurrentTurn(), danger ? 'urgent' : undefined, danger, biggestHit?.cardName)
    if (line) {
      companionDirector.sayEnaBark(line, {
        importance: danger ? BARK_IMPORTANCE.urgent : BARK_IMPORTANCE.situation,
        situation: 'hit',
      })
    }
  }
  // 폭탄 폭발 반응 바크.
  if (bombExplosions.length > 0 && companionDirector.companionWorldCanSpeak()) {
    const bark = companion.reactSituation('bomb', gameState.getCurrentTurn())
    if (bark) companionDirector.sayEnaBark(bark, { importance: BARK_IMPORTANCE.situation, situation: 'bomb' })
  }
  // 클러치 예산('에나의 의지') 충전: 이번 페이즈 역경(피해/불씨 고갈)에 비례.
  if (totalDamage > 0) companion.gainWill(totalDamage, gameState.character.maxHealth)
  if (gameState.character.ember <= 1) companion.gainWillFlat(15)
  // 드라마(모험의 질) 신호: 저체력 체류·불씨 고갈 위기·최저 체력비를 같은 역경 beat에서 기록한다.
  {
    const hpRatio =
      gameState.character.maxHealth > 0
        ? Math.max(0, gameState.character.health) / gameState.character.maxHealth
        : 0
    if (hpRatio > 0 && hpRatio <= 0.3) companionDirector.runDramaSignals.lowHpMoments += 1
    if (gameState.character.ember <= 1) companionDirector.runDramaSignals.emberCrises += 1
    companionDirector.runDramaSignals.lowestHpRatio = Math.min(companionDirector.runDramaSignals.lowestHpRatio, hpRatio)
  }
  // 회피 클러치는 TurnManager.runEnemyPhase의 공격 판정 순간에 처리된다.

  // 소소한 클러치 — 반격: 회피와 달리 피해는 받은 뒤, 공격력 기반으로 공격자를 되친다.
  if (counterClutchFires) {
    const attackerIds = [...new Set(hits.filter((h) => h.damage > 0).map((h) => h.cardId))]
    const counterDamage = Math.max(1, gameState.character.damage)
    const damaged: { cardId: string; amount: number }[] = []
    const killedIds: string[] = []
    for (const id of attackerIds) {
      const hit = gameState.damageEnemyById(id, counterDamage)
      if (!hit) continue
      damaged.push({ cardId: hit.cardId, amount: hit.amount })
      if (hit.defeated) killedIds.push(hit.cardId)
    }
    if (damaged.length > 0) {
      recordNotice(`에나의 의지 — 반격! 피해 ${counterDamage}`, 'info')
      companionDirector.showClutchChain('counter', `반격 피해 ${counterDamage}`)
      companionDirector.sayEnaBark(companion.minorClutchLine('counter'), { importance: BARK_IMPORTANCE.clutch })
      await boardRenderer.animateDamageNumbersById(damaged)
      if (killedIds.length > 0) {
        await boardRenderer.animateCardConsumeByIds(killedIds.map((cardId) => ({ cardId, type: CardType.ENEMY })), { suppressBurstIds: new Set(killedIds) })
        await relicEffects.onEnemiesDefeated(killedIds.length)
      }
      render()
    }
  }
  // 품격있는 대처: 피격 연출 뒤 나를 때린 적들에게 반격.
  await relicEffects.applyDignifiedRetaliation(hits)
  // 변칙: 이 페이즈에서 잃은 체력 10마다 불씨 +1.
  relicEffects.applyAnomalyHealthLoss()
  // 소중한 머리: 체력이 절반 이하이면 전체 회복 후 파괴.
  await relicEffects.applyPreciousHeadCheck()
  // 동료(에나) 클러치: 위기에 의지가 가득 찼으면 실제 지원 + '에나의 의지' 체인.
  companionDirector.tryCompanionClutch()
  if (gameState.isGameOver || gameState.character.authoritySurvivePending) {
    const authorityFired = gameState.character.authoritySurvivePending
    if (await relicEffects.tryResolveSurvivalRelics()) {
      // 권위: 필드를 유지하므로 레일 정리/리필이 필요하다. 희망은 자체 필드 리셋을 수행한다.
      if (authorityFired) await runCleanupPhase(advanceTurn)
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

/** 이벤트 대사 한 줄. DialoguePlayer 공통 클릭-스킵 로직 사용. */
/** 이벤트 문 흐름 매니저 — 문 클릭부터 커튼 복귀까지를 담당한다. */
const eventFlow = new EventFlowManager({
  gameState, boardRenderer, companion, companionDirector, turnManager, cardSpawner,
  speechBubble, eventDemonBubble,
  resources: {
    get score() { return score }, set score(v) { score = v },
    get scorePulseKey() { return scorePulseKey }, set scorePulseKey(v) { scorePulseKey = v },
  },
  setInputLocked: (v) => { inputLocked = v },
  render,
  wait,
  recordNotice,
  resolveFullCandleGaugeEffects,
  cutActiveChain: () => {
    if (chainTimeline.length === 0) return
    HandSystem.resetChain(chain)
    clearChainTimeline()
    boardRenderer.refreshChainBanner(buildChainHints())
  },
  consumeDebugForcedEventId: () => {
    const id = debugForcedEventId
    debugForcedEventId = null
    return id
  },
  compactAndRefillAllLanes,
  trackFieldEnemyEncounters,
  sweepFrontStarlights,
})

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

  // 이벤트 문 클릭: 불빛/행동 없이 이벤트 진입 연출로 분기한다(전방 도달 칸만 클릭 가능).
  if (card.type === CardType.EVENT) {
    await eventFlow.handleEventDoorClick(lane, card)
    return
  }

  const actionType = actionTypeFor(card.type)
  if (!actionType) return

  inputLocked = true

  if (turnManager.isEnemyFirstStrike()) {
    const hits = turnManager.runEnemyPhase({ shouldDodge: ({ damage }) => companionDirector.tryCompanionIncomingDodge(damage) })
    if (hits.length > 0) {
      await boardRenderer.animateEnemyAttacks(hits)
      const dmg = hits.reduce((acc, h) => acc + h.damage, 0)
      if (dmg > 0) {
        recordNotice(`불씨가 흔들려 적이 먼저 공격! -${dmg}`, 'hurt')
        render()
        await boardRenderer.animateDamageImpactOnElement(
          document.querySelector<HTMLElement>('.player-card'),
          dmg
        )
      }
      // 품격있는 대처: 먼저 때린 적들에게 반격(플레이어가 살아남았을 때만 동작).
      await relicEffects.applyDignifiedRetaliation(hits)
      // 변칙: 선공으로 잃은 체력 10마다 불씨 +1.
      relicEffects.applyAnomalyHealthLoss()
      // 소중한 머리: 선공 피해로 체력 절반 이하 시 전체 회복.
      await relicEffects.applyPreciousHeadCheck()
      if (!gameState.character.isAlive() || gameState.isGameOver || gameState.character.authoritySurvivePending) {
        if (await relicEffects.tryResolveSurvivalRelics()) {
          // 치명적 선공을 권위/희망이 흡수하고 플레이어 턴으로 복귀한다.
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

  // 정산용 런 카운터 — 플레이어 행동으로 제거된 적/함정/보물만 센다(만료 제거는 이 경로를 안 탄다).
  if (result.cardRemoved) {
    if (card.type === CardType.ENEMY) gameState.runDefeatedEnemies++
    else if (card.type === CardType.TRAP) gameState.runClearedTraps++
    else if (card.type === CardType.TREASURE) gameState.runOpenedTreasures++
  }

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
      rewardFeedbacks.push(relicEffects.applyWaxCrowTreasureGains(1))
    }
    if (result.cardRemoved && card.type === CardType.FLOWER) {
      // Flower light/coin/stat rewards are kicked off together; the board render
      // below happens as the destination burst lands, not after a separate pause.
      const theme = flowerRewardTheme(card.flowerKind)
      if (result.flowerReward?.kind === 'score') {
        // 캐모마일 불빛은 특수 적처럼 20층 단위로 30/60/90/120…씩 오른다(tier×30).
        const chamomileTier = Math.floor(gameState.getCurrentTurn() / 20) + 1
        pushActivityLogsInDisplayOrder([
          createScoreLog(`${card.name} 수확`, 30 * chamomileTier, 'score'),
        ])
        rewardFeedbacks.push(
          playResourceTrail({ kind: 'card', cardId: card.id }, 'score', 1, theme)
        )
      } else if (result.flowerReward?.kind === 'coin') {
        coins += result.flowerReward.amount
        coinPulseKey++
        relicEffects.applyBlindFaithCoins(result.flowerReward.amount)
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
  // 소소한 클러치 — 함정 무시: 가끔 함정 피해를 '진짜로' 무시한다(되돌림이 아니라 무시).
  // 렌더 전에 모델을 행동 직전 체력/방패로 복구해 HP가 닳아 보이지 않게 하고, "무시" 연출을 띄운다.
  let companionTrapIgnored = false
  if (
    card.type === CardType.TRAP &&
    result.damageTaken &&
    result.damageTaken > 0 &&
    !result.trapIgnored &&
    companionDirector.companionWorldCanSpeak() &&
    companion.rollMinorClutch('trap', { adversity: result.damageTaken >= Math.max(3, gameState.character.maxHealth * 0.25) })
  ) {
    gameState.character.health = Math.min(
      gameState.character.maxHealth,
      gameState.character.health + result.damageTaken
    )
    gameState.character.shield = beforeActionResources.shield
    companionTrapIgnored = true
  }

  if (result.damageTaken && result.damageTaken > 0 && !companionTrapIgnored) {
    // 함정 피해도 사망 원인 회상 후보로 남긴다(즉사 함정 포함).
    if (card.type === CardType.TRAP) enaRuntimeObserver.noteDamageSource(card.name)
    // Trap penalties are already applied by ActionSystem; render immediately so
    // the HP counter starts rolling on the same beat as the trap impact.
    render()
    sameBeatAnimations.push(
      boardRenderer.animateDamageImpactOnElement(
        document.querySelector<HTMLElement>('.player-card'),
        result.damageTaken
      )
    )
    // 변칙: 함정으로 잃은 체력 10마다 불씨 +1.
    relicEffects.applyAnomalyHealthLoss()
    // 소중한 머리: 함정 피해로 체력 절반 이하 시 전체 회복.
    await relicEffects.applyPreciousHeadCheck()
  }
  // 함정 무시: 도적/함정의 대가(유물) 또는 에나의 클러치 → "무시" 텍스트 + 트랩 지터.
  if (result.trapIgnored || companionTrapIgnored) {
    sameBeatAnimations.push(boardRenderer.playTrapIgnoreResist(card.id))
    if (result.trapIgnored && gameState.character.hasRelic('trap-master')) {
      recordRelicActivation('trap-master', '함정 무시')
    }
  }
  if (companionTrapIgnored) {
    recordNotice('에나의 의지 — 함정 무시!', 'info')
    void boardRenderer.animateClutchOnPlayer('health-gain')
    companionDirector.showClutchChain('trap', '함정 피해 무시')
    companionDirector.sayEnaBark(companion.minorClutchLine('trap'), { importance: BARK_IMPORTANCE.clutch })
  }
  // 달콤한 유혹: 함정 제거 시 기본 불빛의 30% 추가 획득. 무효화 시 미발동.
  if (result.cardRemoved && card.type === CardType.TRAP && !result.trapIgnored && gameState.character.hasRelic('sweet-temptation')) {
    const baseLight = scoreForCardRemoval(card)
    const bonus = Math.max(1, Math.ceil(baseLight * 0.3))
    const gained = relicEffects.gainFixedLight('달콤한 유혹', bonus)
    recordRelicActivation('sweet-temptation', `불빛 +${gained}`)
    void playResourceTrail({ kind: 'chain' }, 'score', 1)
    burstScoreGain()
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

  // 훌륭한 대화수단: 적을 직접 공격할 때마다 2.5% 파괴 판정.
  if (card.type === CardType.ENEMY) await relicEffects.applyGreatNegotiationOnAttack()

  if (result.cardRemoved && card.type === CardType.ENEMY) {
    // 자물쇠: 미믹 처치 시 불빛 +25% + 손패 +1.
    if (card.isSpecialEnemy) await relicEffects.applyPadlockMimicBonus(card)
    await relicEffects.onEnemiesDefeated(1)
  }

  // 찬스: 적이 살아있을 때만 15% 확률 추가 타격.
  if (!result.cardRemoved && card.type === CardType.ENEMY) {
    await relicEffects.applyChanceExtraHit(card, distance)
    // 물양동이: 25% 확률로 1 추가 피해 (찬스로 처치된 경우 이미 제거되므로 health 확인).
    await relicEffects.applyWaterBucketExtraDamage(card, distance)
    // 소소한 클러치 — 급소: 살아남은 적에게 가끔 추가 피해.
    await relicEffects.applyCompanionCrit(card, distance)
  }

  // 소소한 클러치 — 보물 추가 보상: 상자를 열 때 가끔 손패 1장을 덤으로.
  if (result.cardRemoved && card.type === CardType.TREASURE && companionDirector.companionWorldCanSpeak()) {
    const treasureClutch = companion.rollMinorClutch('treasure', { adversity: !result.itemGainedIds?.length })
    if (treasureClutch) {
      // 덤 1장은 아래 '획득 후 지연 합성 스캔'(gainedHandCardCount 분기)이 함께 정리한다 —
      // 상자가 빈손이면(손패 가득) 이 add도 실패하므로 스캔 누락 케이스는 없다.
      const drop = DropSystem.generateDrop('treasure')
      if (gameState.character.addHandCard(drop)) {
        recordNotice('에나의 의지 — 덤! 손패 +1', 'info')
        void boardRenderer.animateClutchOnPlayer('treasure-gain')
        companionDirector.showClutchChain('treasure', '손패 +1')
        companionDirector.sayEnaBark(companion.minorClutchLine('treasure'), { importance: BARK_IMPORTANCE.clutch })
        render()
      }
    } else if (!result.itemGainedIds?.length && !result.overflow?.length) {
      // 보물에서도 '찾지 못한 가능성'을 말로만 비춰, 초기 미숙함을 거미줄 밖으로 확장한다.
      // 단, 손패가 가득 차 보상을 잃은 경우는 탐색 실패가 아니므로(카드는 실제로 있었다)
      // 진짜 빈손일 때만 발화해 '가득 찬 손패에 미안해하는' 오발동을 막는다.
      const missed = companion.missedPotentialLine('treasure', gameState.getCurrentTurn())
      if (missed) companionDirector.sayEnaBark(missed, { importance: BARK_IMPORTANCE.situation, situation: 'treasure' })
    }
  }

  // 동료(에나) 행동 반응 — 손패 한줄평(획득 카드) 우선, 없으면 카드 종류별 상황 바크.
  // 확률+쿨다운으로 한 행동에 한 번만, 너무 수다스럽지 않게 강약을 준다.
  if (companionDirector.companionWorldCanSpeak()) {
    const turn = gameState.getCurrentTurn()
    // 손패 한줄평(획득 카드) 우선 — 학습 대상이 아니라 낮은 중요도.
    const gainedId = result.itemGainedIds?.[0]
    let loot: string | null = null
    if (gainedId) {
      const def = getHandCardDef(gainedId as HandCardId)
      loot = companion.onAcquireCard(gainedId, def.category, turn, {
        emberSufficient: gameState.character.ember >= 4,
      })
    }
    if (loot) {
      companionDirector.sayEnaBark(loot, { importance: BARK_IMPORTANCE.loot })
    } else {
      // 카드 종류별 상황 바크 — 스킵/읽음 학습 대상이라 situation을 함께 넘긴다.
      let sit: SituationId | null = null
      if (card.type === CardType.TRAP && card.trapKind === 'web' && result.cardRemoved) sit = 'web'
      else if (card.type === CardType.TREASURE && result.cardRemoved) sit = 'treasure'
      else if (card.type === CardType.FLOWER && result.cardRemoved) sit = 'flower'
      else if (card.type === CardType.ENEMY) sit = result.cardRemoved ? 'kill' : 'survive'
      if (sit) {
        // 적이면 이름을 넘겨, 핵심 키워드('양초 거미'→'거미') 전용 반응을 우선하게 한다.
        const enemyName = card.type === CardType.ENEMY ? card.name : undefined
        const bark = companion.reactSituation(sit, turn, undefined, false, enemyName)
        if (bark) companionDirector.sayEnaBark(bark, { importance: BARK_IMPORTANCE.situation, situation: sit })
      }
    }
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

  // 권위가 체력 1에서 막아냈다면(사망 아님) 연출만 처리하고 정상 흐름을 잇는다.
  if (gameState.character.authoritySurvivePending) {
    await relicEffects.tryResolveSurvivalRelics()
  }
  if (!gameState.character.isAlive()) {
    gameState.endGame('character_defeated')
    if (await relicEffects.tryResolveSurvivalRelics()) {
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
    if (gameState.isGameOver || gameState.character.authoritySurvivePending) {
      const authorityFired = gameState.character.authoritySurvivePending
      if (await relicEffects.tryResolveSurvivalRelics()) {
        if (authorityFired) await runCleanupPhase(shouldAdvanceTurnForAction())
        inputLocked = false
        return
      }
      finishTurn()
      return
    }
    await runCleanupPhase(shouldAdvanceTurnForAction())
    await resolvePostDropSporeSpread()
    if (await maybeRunMilestoneEventsAfterTurn()) return
    if (await maybeOpenShopAfterTurn()) return
    setTimeout(() => {
      inputLocked = false
    }, 340)
  } else {
    await resolveEventPhaseAndPrepareNextTurn(shouldAdvanceTurnForAction())
  }
}

function finishTurn(): void {
  gameActive = false
  render()
  // 종막 대사(사망/클리어 한마디)가 재생 중이면 말풍선이 닫힌 뒤에 정산 화면을 연다.
  // 어떤 이유로든 말풍선이 닫히지 않아도 화면은 뜨도록 안전 상한을 함께 건다.
  if (speechBubble.isShowing || speechBubble.isTyping) {
    let opened = false
    const openOnce = (): void => {
      if (opened) return
      opened = true
      window.setTimeout(() => settlement.showGameOver(), 300)
    }
    void speechBubble.waitForDismiss().then(openOnce)
    window.setTimeout(openOnce, 9000)
    return
  }
  setTimeout(() => settlement.showGameOver(), 300)
}

/** 정산 화면 매니저 — 결말 분기/통산 기록 합산은 SettlementScreen이 담당한다. */
const settlement = new SettlementScreen({
  gameState, boardRenderer, companion, lifetimeRecordStore,
  getScore: () => score,
  getRunStartAxisValues: () => runStartAxisValues,
  wasRunEnteredFromLobby: () => runEnteredFromLobby,
  tryMarkLifetimeRecorded: () => {
    if (lifetimeRecorded) return false
    lifetimeRecorded = true
    return true
  },
  enterHearth,
  startGame: () => startGame(),
})

// 게임오버/정산 오버레이 + 메타 잠금 전역 스타일은 GameOverStyles 모듈에서 1회 주입한다.
const globalStyle = document.createElement('style')
globalStyle.textContent = GAME_OVER_GLOBAL_STYLES
document.head.appendChild(globalStyle)

if (ENABLE_DEV_COMMAND_PALETTE) {
  setupDevCommandPalette({
    gameState, cardSpawner, boardRenderer, hearthScene,
    render,
    syncSpawnerTier,
    addScore: (n) => (score += n),
    addCoins: (n) => (coins += n),
    setDebugForcedEventId: (id) => { debugForcedEventId = id },
    applyRelicPurchaseEffect: (id) => relicEffects.applyRelicPurchaseEffect(id),
    relicPurchaseBlocked: (id) => relicEffects.relicPurchaseBlocked(id),
    demonSummonBlocked: demonSummonDebugBlocked,
    runDemonSummonDebug,
    enterHearth,
    finishTurn,
    openShopOverlay: (mode) => shopFlow.openShopOverlay(mode),
    openTrialOverlayForced: () => shopFlow.openTrialOverlayForced(),
    isInputLocked: () => inputLocked,
    setInputLocked: (v) => { inputLocked = v },
    isShopOpen: () => shopFlow.isOpen(),
    startTestRun,
  })
}
// 게임 부팅 후 첫 사용자 입력에서 배경음 루프를 켠다(브라우저 자동재생 정책).
bgm.armAutoplay()
// 첫 입력에서 효과음 컨텍스트도 함께 연다.
const unlockSfx = () => { void sfx.unlock(); window.removeEventListener('pointerdown', unlockSfx, true) }
window.addEventListener('pointerdown', unlockSfx, true)

/** 첫 실행(새싹 병아리 직행)을 이미 소비했는지 — unmelting. 접두사라 /리셋 시 첫 실행 상태로 돌아간다. */
const BOOT_FIRST_RUN_KEY = 'unmelting.boot.firstRunStarted'

/** 첫 실행 인트로 시네마틱 예약 — bootGame이 켜고 startGame 온보딩 경로가 1회 소비한다. */
let firstRunIntroPending = false

/** 첫 실행 인트로 무대 준비: 게이트 아래에 어둠(방사 베일)을 깔고 레일/카드/패널을 숨겨 둔다.
 *  이 인트로 동안 상단 구역 커튼은 생략한다(배경은 방사 밝힘이 직접 드러낸다). */
function prepareFirstRunIntro(): void {
  firstRunIntroPending = true
  const style = document.createElement('style')
  style.id = 'first-run-intro-style'
  style.textContent = `
    #first-run-veil { position: fixed; inset: 0; z-index: 10590; pointer-events: auto; --veil-r: 0%;
      background: radial-gradient(circle at 50% 44%, rgba(4,3,8,0) calc(var(--veil-r) - 14%), rgba(4,3,8,0.985) var(--veil-r)); }
    body.first-run-intro .rail { opacity: 0; }
    body.first-run-intro.first-run-rail-in .rail { opacity: 1; animation: first-run-rail-drop .72s cubic-bezier(.2,.84,.3,1) both; transform-origin: 50% 0; }
    body.first-run-intro.first-run-rail-done .rail { opacity: 1; }
    @keyframes first-run-rail-drop { from { transform: translateY(-44px) scaleX(.22); opacity: 0; } to { transform: none; opacity: 1; } }
    body.first-run-intro .player-row .player-card { opacity: 0; }
    body.first-run-intro.first-run-card-in .player-row .player-card { opacity: 1; }
    body.first-run-intro .ember-hud { opacity: 0; transform: translateY(-18px); }
    body.first-run-intro .left-panel { transform: translateX(-115%); opacity: 0; }
    body.first-run-intro .hand-column { transform: translateX(115%); opacity: 0; }
    body.first-run-intro.first-run-ui-in .ember-hud,
    body.first-run-intro.first-run-ui-in .left-panel,
    body.first-run-intro.first-run-ui-in .hand-column {
      opacity: 1; transform: none;
      transition: transform .62s cubic-bezier(.2,.84,.3,1), opacity .5s ease;
    }
  `
  document.head.appendChild(style)
  const veil = document.createElement('div')
  veil.id = 'first-run-veil'
  document.body.appendChild(veil)
  document.body.classList.add('first-run-intro')
}

/** 방사 밝힘: 중앙에서 퍼지듯 베일 반경을 넓혀 배경을 노출한다(rAF로 CSS 변수 구동). */
function animateVeilReveal(veil: HTMLElement, duration: number): Promise<void> {
  return new Promise((resolve) => {
    const start = performance.now()
    const step = (now: number): void => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 2.2) // 초반 빠르게, 끝은 은은하게
      veil.style.setProperty('--veil-r', `${(eased * 135).toFixed(1)}%`)
      if (t < 1) requestAnimationFrame(step)
      else resolve()
    }
    requestAnimationFrame(step)
  })
}

/** 첫 실행 인트로 비트: 방사 밝힘(배경 노출) → 플레이어 카드 후웅 안착 → 오프닝 대사 →
 *  하단 정위치 하강 → 레일 하강+좌우 확장. 이후 칸 드롭은 fillOnboardingField가 잇는다. */
async function playFirstRunIntroBeats(): Promise<void> {
  const veil = document.getElementById('first-run-veil')
  // 상단 구역 커튼 없이 배경만 즉시 세팅(크로스페이드 없음) — 방사 밝힘이 완성된 배경을 드러낸다.
  setZoneBackground(ZONE_LIST[0].bgUrl, true)
  await wait(300)
  if (veil) await animateVeilReveal(veil, 1150)
  const card = document.querySelector<HTMLElement>('.player-card')
  if (card) {
    const rect = card.getBoundingClientRect()
    const dx = window.innerWidth / 2 - (rect.left + rect.width / 2)
    const dy = window.innerHeight * 0.44 - (rect.top + rect.height / 2)
    document.body.classList.add('first-run-card-in')
    // 하스스톤 하수인 놓듯: 위에서 크게 들어와 중앙에 쿵 안착.
    const landing = card.animate(
      [
        { transform: `translate(${dx}px, ${dy - 130}px) scale(1.9)`, opacity: 0, filter: 'brightness(2)' },
        { transform: `translate(${dx}px, ${dy + 8}px) scale(1.06)`, opacity: 1, filter: 'brightness(1.2)', offset: 0.7 },
        { transform: `translate(${dx}px, ${dy}px) scale(1.14)`, filter: 'brightness(1)' },
      ],
      { duration: 780, easing: 'cubic-bezier(.22,.9,.3,1)' }
    )
    await landing.finished
    // 안착 상태를 인라인으로 고정한 뒤(WAAPI fill 잔류 방지) 착지 임팩트를 터뜨린다.
    card.style.transform = `translate(${dx}px, ${dy}px) scale(1.14)`
    SquareBurst.playOn(card, 'score', { count: 26, spread: 170, duration: 640, size: [10, 22] })
    // 중앙에서 오프닝 한마디 — 대사가 끝나면 하단 정위치로 내려간다.
    await playDialogueLine(speechBubble, null, '역경 아래, 작은 불빛을 밝혀야만 해.', 2000, 260)
    const settle = card.animate(
      [{ transform: `translate(${dx}px, ${dy}px) scale(1.14)` }, { transform: 'translate(0, 0) scale(1)' }],
      { duration: 640, easing: 'cubic-bezier(.2,.84,.3,1)' }
    )
    await settle.finished
    card.style.removeProperty('transform')
  }
  // 레일이 내려오며 좌우로 넓어진다 — 이어지는 칸 드롭(fillOnboardingField)의 무대가 된다.
  document.body.classList.add('first-run-rail-in')
  await wait(720)
  // 애니메이션이 끝나면 정적 표시 클래스로 바꾼다 — 이후 재렌더가 새 .rail을 만들어도
  // 드롭 연출이 반복 재생되지 않는다(화면이 계속 새로고침되는 듯한 체감 제거).
  document.body.classList.remove('first-run-rail-in')
  document.body.classList.add('first-run-rail-done')
}

/** 첫 실행 인트로 마무리: 좌우 패널/불씨 HUD 슬라이드 인 후 무대 장치를 정리한다. */
function finishFirstRunIntro(): void {
  document.body.classList.add('first-run-ui-in')
  window.setTimeout(() => {
    document.body.classList.remove('first-run-intro', 'first-run-card-in', 'first-run-rail-in', 'first-run-rail-done', 'first-run-ui-in')
    document.getElementById('first-run-veil')?.remove()
    document.getElementById('first-run-intro-style')?.remove()
  }, 940)
}

/** 메타 전부 해금 + 거점 강제 개방 후 테스트 런 직행 — /테스트 명령과 ?test=1 부팅이 공유한다. */
function startTestRun(): void {
  for (const { id } of META_UNLOCKS) setMetaUnlocked(id, true)
  localStorage.setItem(HEARTH_DEV_UNLOCK_KEY, '1')
  if (document.getElementById('hearth-overlay')) hearthScene.exit()
  void startGame()
}

/** 검은 타이틀 게이트: 게임 테마의 네 꼭짓점 반짝 다이아 5개가 실제 로딩(폰트+핵심 스프라이트
 *  프리로드) 진행에 따라 차례로 점등되는 게이지. 전부 켜지면 Click to Start로 전환되고,
 *  클릭 시 오버레이를 남긴 채 resolve(해제 함수 반환) — 호출부가 로비/런 DOM을 먼저 구성한 뒤
 *  해제해야 커튼 연출이 첫 프레임부터 온전히 보인다. 이 클릭이 오디오 언락·모바일 전체화면도 흡수한다. */
function showBootTitleGate(): Promise<() => void> {
  const style = document.createElement('style')
  style.textContent = `
    .boot-title-gate { position: fixed; inset: 0; z-index: 10600; background: #08060c; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 22px; transition: opacity .46s ease; }
    .boot-title-gate.is-leaving { opacity: 0; pointer-events: none; }
    .boot-title-name { font: 900 34px/1.2 'OkDanDan', Georgia, serif; color: rgba(255,226,150,.92); letter-spacing: .12em; text-shadow: 0 0 22px rgba(255,190,90,.25); }
    .boot-gauge { display: flex; gap: 16px; }
    .boot-gauge-star { width: 22px; height: 22px; color: rgba(120,102,78,.32); transform: scale(.92); transition: color .3s ease, filter .3s ease, transform .3s ease; }
    .boot-gauge-star svg { width: 100%; height: 100%; display: block; }
    .boot-gauge-star.is-lit { color: rgba(255,214,120,.95); transform: scale(1.12); filter: drop-shadow(0 0 9px rgba(255,190,90,.85)); }
    .boot-title-hint { font: 700 14px/1.4 'OkDanDan', Georgia, serif; color: rgba(232,214,180,.5); letter-spacing: .1em; }
    .boot-title-gate.is-ready .boot-title-hint { color: rgba(255,226,150,.88); animation: boot-hint-pulse 1.6s ease-in-out infinite; }
    @keyframes boot-hint-pulse { 0%, 100% { opacity: .45; } 50% { opacity: 1; } }
  `
  document.head.appendChild(style)
  const overlay = document.createElement('div')
  overlay.className = 'boot-title-gate'
  const STAR_COUNT = 5
  overlay.innerHTML = `
    <div class="boot-title-name">Unmelting</div>
    <div class="boot-gauge" aria-hidden="true">${Array.from({ length: STAR_COUNT }, () => `<span class="boot-gauge-star">${sparkleIcon()}</span>`).join('')}</div>
    <div class="boot-title-hint">불러오는 중…</div>
  `
  document.body.appendChild(overlay)

  // 로딩 태스크: OkDanDan 폰트 안정화 + 로비 첫 프레임에 보이는 핵심 스프라이트 프리로드.
  const preloadImage = (url: string): Promise<void> =>
    new Promise((res) => {
      const img = new Image()
      img.onload = () => res()
      img.onerror = () => res() // 실패해도 게이트가 영영 잠기지 않게 한다
      img.src = url
    })
  const spriteUrls = [
    SpriteUrls.player,
    SpriteUrls.cardBack,
    // 첫 실행 인트로가 곧바로 드러내는 1구역 배경까지 게이트에서 미리 받는다.
    ZONE_LIST[0].bgUrl,
    SpriteUrls.difficultySprout,
    ...Array.from({ length: 9 }, (_, i) => spriteForHearthStation(`hearth_00${i + 1}`)),
  ].filter((u): u is string => Boolean(u))
  const tasks: Promise<unknown>[] = [document.fonts.ready, ...spriteUrls.map(preloadImage)]

  const stars = [...overlay.querySelectorAll<HTMLElement>('.boot-gauge-star')]
  // 별 점등은 실제 완료 비율을 따르되, 즉시 완료(캐시)여도 순차 점등이 보이게 최소 간격을 둔다.
  let done = 0
  let litShown = 0
  const tick = (): void => { done += 1 }
  return new Promise((resolve) => {
    // 개별 태스크가 8초를 넘겨도 게이트는 열린다(네트워크 지연 안전판).
    const capped = tasks.map((t) => Promise.race([t, wait(8000)]).then(tick))
    const allDone = Promise.allSettled(capped)
    const pace = window.setInterval(() => {
      const targetLit = Math.floor((done / tasks.length) * STAR_COUNT)
      if (litShown < targetLit) {
        litShown += 1
        stars.forEach((s, i) => s.classList.toggle('is-lit', i < litShown))
      }
    }, 150)
    void allDone.then(async () => {
      // 남은 별이 진행률 페이싱을 마저 따라잡을 때까지 기다린 뒤 시작 문구로 전환한다.
      while (litShown < STAR_COUNT) await wait(160)
      window.clearInterval(pace)
      const hint = overlay.querySelector<HTMLElement>('.boot-title-hint')
      if (hint) hint.textContent = 'Click to Start'
      overlay.classList.add('is-ready')
      overlay.addEventListener('pointerdown', () => {
        // 오버레이는 남긴 채 resolve — 호출부가 장면을 구성한 뒤 해제한다.
        resolve(() => {
          overlay.classList.add('is-leaving')
          window.setTimeout(() => overlay.remove(), 500)
        })
      }, { once: true })
    })
  })
}

/** 부팅 분기: ?test=1 → 테스트 직행 / 첫 실행 → 새싹 병아리 직행 / 이후 → 거점 로비. */
async function bootGame(): Promise<void> {
  if (new URLSearchParams(window.location.search).get('test') === '1') {
    startTestRun()
    return
  }
  const dismissGate = await showBootTitleGate()
  // 장면(로비/런)을 게이트 아래에서 먼저 구성한 뒤 걷어야 커튼 연출이 첫 프레임부터 온전하다.
  if (!localStorage.getItem(BOOT_FIRST_RUN_KEY)) {
    // 첫 실행: 로비를 건너뛰고 곧바로 새싹 병아리 온보딩으로 들어간다(사망/클리어 후 로비 복귀).
    // 게이트가 걷혀도 어둠이 이어지는 첫 연출(방사 밝힘→카드 안착→대사→레일→칸→UI)을 예약한다.
    // 마킹은 endGame(승리/패배 정산)에서만 하므로, 중도 이탈 후 재부팅은 다시 이 경로를 탄다.
    prepareFirstRunIntro()
    void startGame(0, 'sprout')
  } else {
    enterHearth()
  }
  requestAnimationFrame(() => dismissGate())
}
void bootGame()
