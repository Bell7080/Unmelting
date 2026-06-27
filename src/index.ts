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
import { TurnManager, type EnemyHit } from '@core/TurnManager'
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
import { LANE_DISTANCE_COUNT, Lane } from '@entities/Lane'
import { pickEventForDoor, getEventDef, EVENT_IDS, type EventId, type EventDefinition, type EventDialogueLine } from '@data/Events'
import { CandleMode } from '@entities/Character'
import { HandCardId, HandCategory } from '@entities/HandCard'
import { getHandCardDef, HAND_CARD_IDS, HAND_CARD_DEFINITIONS } from '@data/HandCards'
import { RECIPES } from '@data/Recipes'
import { getRelicDef, relicDrawWeight, RELIC_IDS, type CustomRelicProfile, type RelicId } from '@data/Relics'
import { RunCardPool } from '@core/RunCardPool'
import { COMBO_TRIGGER_DELAY_MS, GAUGE_TRIGGER_DELAY_MS, MAX_ACTIVITY_LOGS } from '@core/Timing'
import {
  sampleWeightedWithoutReplacement,
  sampleWithoutReplacement,
} from '@core/Sampling'
import { HAND_CARD_RARITY, SHOP_PACK_LABELS, SHOP_PACK_POOLS } from '@data/ShopPools'
import { BASIC_PACK_POOL } from '@data/BasicPackPool'
import { TRIAL_DEFINITIONS, type TrialEffectKind } from '@data/Trials'
import { JOBS } from '@data/Jobs'
import { SquareBurst, type BurstTheme } from '@ui/SquareBurst'
import { CursorFX } from '@ui/CursorFX'
import { FontManager } from '@ui/FontManager'
import { candleIcon } from '@ui/Icons'
import { SpriteUrls, spriteForHandCard, spriteForBasicPackItem, recipeSprite001 } from '@ui/Sprites'
import { SpeechBubble } from '@ui/SpeechBubble'
import { CompanionSystem, type SituationId, type ClutchPlan } from '@systems/CompanionSystem'
import { loadDisposition, saveDisposition, BASE_DISPOSITION } from '@systems/EnaDisposition'
import { assessThreats } from '@systems/CompanionForesight'
import { HearthScene } from '@ui/hearth/HearthScene'
import { ZoneCurtain, ZONE_LIST } from '@ui/ZoneCurtain'
import { playDialogueLine } from '@ui/DialoguePlayer'
import { EventSpawnController } from '@systems/EventSpawn'
import { BgmManager } from '@/audio/BgmManager'
import { enaRuntimeObserver, shopKindToPurchaseId } from '@/rl/EnaRuntimeObserver'
import { createBrowserEnaAutonomousLearner } from '@/rl/EnaAutonomousLearner'
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
// 에나 런타임 관측: 모든 endGame 호출을 한 곳에서 기록해 사망/클리어 결과를 플레이 로그에 누적한다.
const originalEndGame = gameState.endGame.bind(gameState)
gameState.endGame = (reason: string): void => {
  originalEndGame(reason)
  const won = reason.includes('clear') || reason.includes('win')
  enaRuntimeObserver.recordRunEnd(gameState, won, reason)
  // 에나 혼자 보는 자기학습: 디버그 리포트 노출 없이 실제 런 로그를 다음 판단 재료로 압축한다.
  enaAutonomousLearner.learnAfterRun(enaRuntimeObserver.getMemory(), enaRuntimeObserver.getEvents())
  // per-player 성향 온라인 적응: 런 결과로 에나의 성향을 미세조정하고 저장(세션 넘어 유지).
  adaptCompanionToRunOutcome(won)
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
 * body 배경을 새 구역 이미지로 교체한다.
 * background-image는 CSS transition이 불가하므로, 현재 배경을 임시 div로 덮어두고
 * body를 새 배경으로 교체한 뒤 임시 div를 opacity 페이드아웃으로 걷어낸다.
 */
function setZoneBackground(bgUrl: string): void {
  const prev = document.body.style.backgroundImage
  if (prev.includes('url(')) {
    const fade = document.createElement('div')
    fade.setAttribute('aria-hidden', 'true')
    fade.style.cssText =
      'position:fixed;inset:0;z-index:-1;pointer-events:none;' +
      `background-image:${prev};` +
      'background-size:cover,cover,cover;' +
      'background-position:center,center top,center;' +
      'background-repeat:no-repeat;' +
      'background-attachment:fixed;' +
      'opacity:1;transition:opacity 0.9s ease;'
    document.body.appendChild(fade)
    // 두 프레임 뒤에 페이드 시작 — 새 body 배경이 페인트된 뒤에 fade-out해야 시각적 공백이 없다.
    requestAnimationFrame(() => requestAnimationFrame(() => { fade.style.opacity = '0' }))
    setTimeout(() => fade.remove(), 960)
  }
  document.body.style.backgroundImage = `${BG_GRADIENTS}url('${bgUrl}')`
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
// 저장된 per-player 성향을 불러와 에나를 깨운다(없으면 기본 성향). 런 종료마다 적응·저장된다.
const companion = new CompanionSystem(loadDisposition())

/** 런 종료 결과로 에나 성향을 온라인 적응시키고 저장한다. endGame 후크에서 호출(함수 선언이라 호이스팅). */
function adaptCompanionToRunOutcome(won: boolean): void {
  const adapted = companion.adaptToOutcome({ died: !won, floorReached: gameState.getCurrentTurn() })
  saveDisposition(adapted)
}

// 경험(성향) 패널이 현재 에나 성향과 학습된 기본 토대를 읽어 성좌 시각화를 그릴 수 있게 연결한다.
boardRenderer.setExperienceDataProvider(() => ({
  disp: companion.getDisposition(),
  base: BASE_DISPOSITION,
  learning: companion.getLearningSnapshot(),
}))
// 현재 player 말풍선이 에나 본인의 대사(바크)인지.
let enaSpeaking = false
// 연타 후 손을 떼면 '…이제 끝났어?'를 띄우기 위한 방치 타이머.
let companionIdleTimer = 0
const COMPANION_IDLE_MS = 2600
// 현재 떠 있는 바크의 학습 대상 상황(없으면 null) / 중요도 / 등장 시각.
let currentBarkSituation: SituationId | null = null
let currentBarkImportance = 0
let barkShownAt = 0
// 이 시각 전까지는 스킵(닫기)을 막는다 — 출력/빨리감기 직후 더블클릭으로 바로 넘어가는 것 방지.
let barkSkipLockUntil = 0
// 출력(또는 빨리감기) 이후 스킵을 잠그는 유예 시간. 고정 대사처럼 살짝의 딜레이를 준다.
const BARK_SKIP_GRACE_MS = 600
// 이 시간 넘게 떠 있었으면 "읽었다"로 본다(이후 스킵은 학습 신호로 치지 않음).
let companionHeardTimer = 0
const COMPANION_READ_MS = 1500

/** 바크 중요도: 손패 한줄평<일반 반응<상황<위급/항의. 읽는 중엔 더 높은 것만 끼어든다. */
const BARK_IMPORTANCE = { loot: 0, touch: 1, situation: 2, urgent: 3, clutch: 4 } as const

/**
 * 에나의 한마디를 player 말풍선으로 띄운다.
 * - 읽는 중(타이핑)에는 더 낮거나 같은 중요도가 끼어들어 덮어쓰지 못하게 한다.
 * - 상황 바크는 읽기 임계 시간 뒤까지 살아있으면 '읽음'으로 학습(더 말하게)한다.
 */
function sayEnaBark(
  line: string,
  opts: { importance?: number; situation?: SituationId | null } = {}
): void {
  const importance = opts.importance ?? BARK_IMPORTANCE.touch
  if (enaSpeaking && speechBubble.isTyping && importance <= currentBarkImportance) return
  clearTimeout(companionHeardTimer)
  companionHeardTimer = 0
  enaSpeaking = true
  currentBarkImportance = importance
  currentBarkSituation = opts.situation ?? null
  barkShownAt = Date.now()
  // 출력 직후 잠깐은 스킵 불가(고정 대사 같은 살짝의 딜레이). 긴 줄은 빨리감기 시점에 다시 잠근다.
  barkSkipLockUntil = barkShownAt + BARK_SKIP_GRACE_MS
  speechBubble.show(line)
  const situation = currentBarkSituation
  if (situation) {
    companionHeardTimer = window.setTimeout(() => {
      companion.recordHeard(situation)
      companionHeardTimer = 0
      currentBarkSituation = null // 읽힘으로 정산됐으니 더는 스킵 대상이 아니다.
    }, COMPANION_READ_MS)
  }
}

/** 체력/불씨가 위태로운 위급 상황인지 — 위급할 때 만지면 에나가 "지금 장난칠 때야?" 한다. */
function companionInDanger(): boolean {
  const c = gameState.character
  const lowHp = c.maxHealth > 0 && c.health / c.maxHealth <= 0.3
  const lowEmber = c.ember <= 1
  return lowHp || lowEmber
}

/** 프로필을 만졌을 때 — 상황/연타 반응 + 방치 마무리 예약. 스킵은 플레이어 자유라 항의는 없다. */
function onProfileTouched(): void {
  if (!gameActive || inputLocked) return
  // 이미 대사가 출력 중(타이핑)이면 새 대사를 띄우지 않는다 — 중복 출력 방지(먹통 느낌 없게).
  if (speechBubble.isTyping) return
  const now = Date.now()
  const danger = companionInDanger()
  const line = companion.onProfileTouch(now, { danger })
  // 위급은 읽는 중에도 끼어들도록 높은 중요도, 평범한 반응은 낮은 중요도.
  sayEnaBark(line, { importance: danger ? BARK_IMPORTANCE.urgent : BARK_IMPORTANCE.touch })
  clearTimeout(companionIdleTimer)
  companionIdleTimer = window.setTimeout(() => {
    if (!gameActive || inputLocked) return
    const settle = companion.onSettle()
    if (settle) sayEnaBark(settle, { importance: BARK_IMPORTANCE.touch })
  }, COMPANION_IDLE_MS)
}

/** 월드 이벤트 바크가 떠도 되는 상황인지 — 상점/보스/게임오버 중엔 침묵한다. */
function companionWorldCanSpeak(): boolean {
  return gameActive && !shopOpen && !gameState.bossBattleActive && !gameState.isGameOver
}

/** 적 공격 판정 직전에 회피 클러치를 굴린다. 체력 되돌림이 아니라 피해 적용 전 무효화라 타이밍이 자연스럽다. */
function tryCompanionIncomingDodge(incomingDamage: number): boolean {
  if (incomingDamage <= 0 || !companionWorldCanSpeak()) return false
  const projectedHealth = gameState.character.health - incomingDamage
  const adversity = projectedHealth <= Math.max(1, gameState.character.maxHealth * 0.35)
  if (!companion.rollMinorClutch('dodge', { adversity, bond: true })) return false
  recordNotice(`에나의 의지 — 회피! 피해 ${incomingDamage} 무효`, 'info')
  void boardRenderer.animateClutchOnPlayer('health-gain')
  showClutchChain('dodge', `피해 ${incomingDamage} 무효`)
  sayEnaBark(companion.minorClutchLine('dodge'), { importance: BARK_IMPORTANCE.clutch })
  return true
}

/** 클러치 종류별 전용 체인 제목(플레이어 카드 위 배너). */
const CLUTCH_TITLES: Record<string, string> = {
  crit: '모험의 긍지',
  dodge: '날렵한 몸놀림',
  counter: '맞서는 용기',
  trap: '굳건한 의지',
  treasure: '행운의 손길',
  heal: '포기를 모르는 마음',
  shield: '수호의 결의',
  ember: '꺼지지 않는 불씨',
  hand: '건네는 손패',
  awaken: '에나의 각성',
  predict: '앞을 내다보는 눈',
}

/** 청소 수단 손패 후보 — 방향성을 열어둔다(청소=1칸 거미줄 전체, 키틴=함정 1장). */
const CLEANUP_CARD_IDS: readonly HandCardId[] = ['sweep', 'chitin'] as unknown as HandCardId[]

/** 예측 대비로 건넨 카드를 플레이어가 기한 내 쓰는지 추적(RL 신호). */
let pendingPrediction: {
  cardIds: readonly string[]
  issuedTurn: number
  deadlineTurn: number
  kind: string
} | null = null

/** 예측 대비: 위협 추정(그릇)을 미리 읽고 대비 카드를 건넨다. 플레이어 차례 직전 호출. */
async function tryCompanionPrediction(): Promise<void> {
  const turn = gameState.getCurrentTurn()
  // RL: 건넨 대비 카드를 기한 내 안 썼으면 '불필요'로 학습(덜 주게).
  if (pendingPrediction && turn > pendingPrediction.deadlineTurn) {
    companion.recordPredictionWasted()
    pendingPrediction = null
  }
  if (!companionWorldCanSpeak() || gameState.bossBattleActive || pendingPrediction) return
  const report = assessThreats(gameState.lanes, gameState.character, {
    unlockedCardIds: runCardPool.snapshot().unlocked,
    unlockedRecipeIds: gameState.unlockedRecipeIds,
    chainSequence: chain.sequence,
    firedRecipeIds: chain.firedRecipeIds,
  })
  const suggested = report.recommendedCardId
  const hasSuggested = suggested ? gameState.character.hand.some((c) => c.defId === suggested) : false
  const hasCleanup = gameState.character.hand.some((c) => CLEANUP_CARD_IDS.includes(c.defId))
  // 거미줄 예측은 실제 전방 진입 가능성이 있을 때만 통과시켜 1칸 web 오판 빗자루 지급을 줄인다.
  const needsPrediction = !!suggested && (report.recommendCleanup ? !hasCleanup : !hasSuggested)
  if (!suggested) return
  if (!companion.evaluateWebPrediction(needsPrediction, false, turn)) {
    // 후반부 고점 에나라면 터졌을 예측 지원을 지금은 말로만 비춰, 초반 미숙함을 드러낸다.
    // 실패 회고 대사는 '눈앞에 보였다' 수준이 아니라 실제 피해/즉사 후보를 놓쳤을 때만 낸다.
    if (needsPrediction && shouldSayMissedWebPrediction(report, gameState.character.health)) {
      const missed = companion.missedPotentialLine('web', turn)
      if (missed) sayEnaBark(missed, { importance: BARK_IMPORTANCE.situation, situation: 'web' })
    }
    return
  }
  // 판 분석 결과가 고른 해금 손패를 건넨다. 함정 외 공격/포자/레시피/트리플 보조도 이 경로를 공유한다.
  const drop = DropSystem.makeCard(suggested)
  if (!gameState.character.addHandCard(drop)) return // 손패 가득 — 다음 기회에
  pendingPrediction = { cardIds: [suggested], issuedTurn: turn, deadlineTurn: turn + 3, kind: report.recommendationKind ?? 'support' }
  recordNotice(`에나의 의지 — ${getHandCardDef(suggested).name} 지원: ${report.recommendationReason}`, 'info')
  render()
  void boardRenderer.animateClutchOnPlayer('hand-control')
  showClutchChain('predict', report.webLethal ? `${getHandCardDef(suggested).name} 지원 (위험!)` : `${getHandCardDef(suggested).name} 지원`)
  const predictLineKind = report.recommendationKind === 'cleanup' ? 'web' : report.recommendationKind ?? 'support'
  sayEnaBark(companion.predictLine(predictLineKind), { importance: BARK_IMPORTANCE.clutch })
  // 지원 카드는 이미 손패에 들어갔으므로 트레일 실패가 입력 잠금 해제를 막지 않게 연출만 분리한다.
  void playResourceTrail({ kind: 'chain' }, 'hand', 1)
}


/** 거미줄 예측 실패 회고는 임박 피해가 큰 경우로 좁혀, 단순 함정 발견 대사처럼 보이지 않게 한다. */
function shouldSayMissedWebPrediction(report: ReturnType<typeof assessThreats>, currentHealth: number): boolean {
  if (!report.recommendCleanup || !report.hasImminentWebDrop) return false
  if (report.webLethal) return true
  // 현재 체력의 절반 이상을 잃을 병합 위협일 때만 '고점이면 막았을' 아쉬움으로 취급한다.
  return report.potentialWebDamage > 0 && report.potentialWebDamage >= Math.max(2, Math.ceil(currentHealth * 0.5))
}

/** 클러치 발동 시 플레이어 카드 위에 『 제목 』 + 효과 배너를 띄운다. */
function showClutchChain(kind: string, desc: string): void {
  boardRenderer.showClutchBanner(CLUTCH_TITLES[kind] ?? '에나의 의지', desc)
}

/**
 * 클러치(에나의 의지) 평가 + 실행. 위기에 '의지'가 가득 차면 보통 강도의 실제 지원을 하고,
 * 클러치 전용 체인을 플레이어 카드 위에 띄우며 거의 확정으로 대사를 친다.
 */
function tryCompanionClutch(): void {
  if (!companionWorldCanSpeak()) return
  const c = gameState.character
  const turn = gameState.getCurrentTurn()
  const report = assessThreats(gameState.lanes, c, {
    unlockedCardIds: runCardPool.snapshot().unlocked,
    unlockedRecipeIds: gameState.unlockedRecipeIds,
    chainSequence: chain.sequence,
    firedRecipeIds: chain.firedRecipeIds,
  })
  const plan = companion.evaluateClutch({
    hp: c.health,
    maxHp: c.maxHealth,
    hpRatio: c.maxHealth > 0 ? c.health / c.maxHealth : 1,
    emberLow: c.ember <= 1,
    supportCardId: report.recommendedCardId,
    supportReason: report.recommendationReason,
  })
  if (plan) {
    applyClutch(plan)
    return
  }
  // 강적을 보고도 아직 방패를 크게 못 올리는 초반 에나의 '말뿐인 도움'을 낮은 빈도로 표현한다.
  if (report.strongEnemyIncoming) {
    const missed = companion.missedPotentialLine('shield', turn)
    if (missed) sayEnaBark(missed, { importance: BARK_IMPORTANCE.situation, situation: 'hit' })
  }
}

/** 클러치 효과를 실제로 적용하고 연출(체인 배너·대사·트레일·로그)을 함께 낸다. */
function applyClutch(plan: ClutchPlan): void {
  const c = gameState.character
  const before = snapshotPlayerResources()
  let detail = ''
  if (plan.kind === 'heal') {
    const healed = c.heal(plan.amount)
    detail = `체력 +${healed}`
  } else if (plan.kind === 'shield') {
    const shielded = c.addShield(plan.amount)
    detail = `방패 +${shielded}`
  } else if (plan.kind === 'ember' || plan.kind === 'hand') {
    // 에나가 직접 손패를 건네는 클러치. 불씨 위기면 성냥, 예지 위기면 추천 손패를 준다.
    const cardId = plan.cardId ?? 'match'
    const drop = DropSystem.makeCard(cardId)
    detail = c.addHandCard(drop) ? `${getHandCardDef(cardId).name} +1` : '손패가 가득 참'
  }
  recordNotice(`에나의 의지 — ${detail}`, 'info')
  render()
  // 플레이어 카드 들썩 + 블라스트(종류별 팔레트) + 전용 체인 배너.
  const clutchTheme = plan.kind === 'shield' ? 'shield-gain' : (plan.kind === 'ember' || plan.kind === 'hand') ? 'ember-gain' : 'health-gain'
  void boardRenderer.animateClutchOnPlayer(clutchTheme)
  showClutchChain(plan.kind, detail)
  // 거의 확정 대사 + 자원 트레일(같은 beat). 클러치는 최상위 중요도라 다른 대사가 떠 있어도 끼어든다.
  sayEnaBark(plan.line, { importance: BARK_IMPORTANCE.clutch })
  void playPlayerGainTrails({ kind: 'center' }, before)
}

// 보드는 재렌더로 .player-card를 다시 그리므로, 안정적인 #game-board에 위임 청취한다.
document.getElementById('game-board')?.addEventListener('click', (e) => {
  if ((e.target as HTMLElement | null)?.closest('.player-card')) onProfileTouched()
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
let shopOpen = false
let currentShopOffers: ShopOfferView[] = []
/** 제단(30턴) 무료 유물은 1회 단일 픽이다. 한 번 고르면 다시 못 고르게 잠근다. */
let altarRelicPicked = false
let shopRerollCount = 0
const SHOP_PACK_KINDS: readonly ShopPackKind[] = ['basic-pack', 'recipe-pack', 'unlock-pack', 'chance-pack', 'resource-pack', 'delete-pack']
/** 방문 내 카드팩별 구매 횟수. 가격은 각 팩의 초기 가격을 매 구매마다 한 번 더 얹는다. */
let shopPackBuys: Record<ShopPackKind, number> = Object.fromEntries(
  SHOP_PACK_KINDS.map((kind) => [kind, 0])
) as Record<ShopPackKind, number>
/** 리롤 연타로 유물 DOM/상태가 엇갈리지 않도록 비동기 리롤 동안 입력을 잠근다. */
let shopRerollInProgress = false
let freeCardClaimed = false
let freeCoinCardClaimed = false

// 공용 무료카드(선물 상자)는 방문마다 하나의 랜덤 효과로 고정한다.
type ShopFreeGiftKind = 'score-300' | 'coin-1' | 'health-5' | 'gauge-3' | 'ember-3' | 'hand-2'

/** 선물 상자 보상 표기 소스. 항목을 추가해도 랜덤 추첨 주석/개수가 자동으로 따라간다. */
const SHOP_FREE_GIFT_REWARDS: Record<ShopFreeGiftKind, { description: string; amount: number }> = {
  'score-300': { description: '✦300', amount: 300 },
  'coin-1': { description: '1$', amount: 1 },
  'health-5': { description: '체력 5', amount: 5 },
  'gauge-3': { description: '콤보 게이지 +3', amount: 3 },
  'ember-3': { description: '불씨 게이지 +3', amount: 3 },
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
  /** 세션 내 재뽑기 횟수. 비용은 1 + rerollCount$ */
  rerollCount: number
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
  render()
  hearthScene.enter({
    // 출발 버튼 → startGame이 다시 초기화 + 직업 선택 + 보드 채움을 수행한다.
    onStart: () => { void startGame() },
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

// 보스 이벤트 컨트롤러 — 보스별 스탯/흐름/보상/시련을 모두 관리한다.
const bossController = new BossEventController(
  gameState, turnManager, boardRenderer, bossBubble, speechBubble, runCardPool, SpriteUrls,
  {
    setInputLocked: (v) => { inputLocked = v },
    addOneCoin: () => { coins += 1; coinPulseKey++; boardRenderer.playCoinGainFeedback(coins, coinPulseKey); applyBlindFaithCoins(1) },
    render: () => render(),
    clearChainTimeline: () => { HandSystem.resetChain(chain); clearChainTimeline(); boardRenderer.refreshChainBanner(buildChainHints()) },
    recordNotice: (msg, kind) => recordNotice(msg, kind),
    applyAnomalyHealthLoss: () => applyAnomalyHealthLoss(),
    applyPreciousHeadCheck: () => applyPreciousHeadCheck(),
    applyPlayerAttackRelics: () => applyGreatNegotiationOnAttack(),
    openTrialOverlayForced: () => openTrialOverlayForced(),
    applyRelicPurchaseEffect: (id) => applyRelicPurchaseEffect(id),
    handlePlayerDeath: async () => {
      if (await tryResolveSurvivalRelics()) {
        // 권위/희망이 보스전 도중 살려냈다면 입력을 풀어 전투를 계속 잇게 한다.
        inputLocked = false
        return true
      }
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

/** Heal 1 HP per defeated enemy; Blood Pack reacts via onHealGain callback. */
async function applyRedPotionEnemyDefeats(count: number): Promise<void> {
  if (count <= 0 || !gameState.character.hasRelic('red-potion')) return
  for (let i = 0; i < count; i++) {
    const beforeResources = snapshotPlayerResources()
    const healed = gameState.character.heal(1)
    if (healed <= 0) continue
    recordRelicActivation('red-potion', `체력 +${healed}`)
    await playPlayerGainTrails({ kind: 'chain' }, beforeResources)
  }
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

/** 헌혈팩: 회복량만큼 전방 랜덤 적 1장에게 피해. onHealGain 콜백에서 호출된다. */
async function applyBloodPackHit(amount: number): Promise<void> {
  const hit = gameState.damageRandomFrontEnemy(amount)
  if (!hit) {
    recordRelicActivation('blood-pack', '전방 적 없음')
    return
  }
  recordRelicActivation('blood-pack', `전방 랜덤 적 피해 ${hit.amount}`)
  await boardRenderer.animateDamageNumbersById([{ cardId: hit.cardId, amount: hit.amount }])
  if (hit.defeated) {
    await boardRenderer.animateCardConsumeByIds([{ cardId: hit.cardId, type: CardType.ENEMY }], {
      suppressBurstIds: new Set([hit.cardId]),
    })
    await onEnemiesDefeated(1)
  }
}

/** 적 처치 시 처치 기반 유물을 한 번에 처리한다(붉은 포션 회복 + 잉크와 깃펜 카운트).
 *  blood-pack은 onHealGain 콜백으로 자동 발동되므로 별도 파라미터 불필요. */
async function onEnemiesDefeated(count: number): Promise<void> {
  if (count <= 0) return
  await applyRedPotionEnemyDefeats(count)
  applyInkQuillKills(count)
  applyAmbitionKills(count)
}

/** 야망: 적 8처치마다 불빛을 25씩 늘어나며(25→50→75…) 획득한다. 누적 보너스는 런 동안 유지. */
function applyAmbitionKills(count: number): void {
  if (count <= 0 || !gameState.character.hasRelic('ambition')) return
  gameState.enhancements.ambitionKillCount += count
  while (gameState.enhancements.ambitionKillCount >= 8) {
    gameState.enhancements.ambitionKillCount -= 8
    gameState.enhancements.ambitionCurrentGain += 25
    const gained = gainFixedLight('야망', gameState.enhancements.ambitionCurrentGain)
    recordRelicActivation('ambition', `불빛 +${gained}`)
    void playResourceTrail({ kind: 'chain' }, 'score', 1)
    burstScoreGain()
  }
}

/** 정직: 손패 5장 사용마다 불빛 100 획득. 사용 수는 런 동안 누적. */
function applyHonestyHandUse(count: number): void {
  if (count <= 0 || !gameState.character.hasRelic('honesty')) return
  gameState.enhancements.honestyHandUseCount += count
  while (gameState.enhancements.honestyHandUseCount >= 5) {
    gameState.enhancements.honestyHandUseCount -= 5
    const gained = gainFixedLight('정직', 100)
    recordRelicActivation('honesty', `불빛 +${gained}`)
    void playResourceTrail({ kind: 'chain' }, 'score', 1)
    burstScoreGain()
  }
}

/** 변칙: 플레이어가 체력을 5 잃을 때마다 불씨 게이지 +1. 누적 피해는 Character가 보관한다.
 *  미보유 시 누적을 비워, 나중에 획득해도 이전 피해가 소급 발동하지 않게 한다. */
function applyAnomalyHealthLoss(): void {
  const character = gameState.character
  if (!character.hasRelic('anomaly')) { character.relicDamageTaken = 0; return }
  while (character.relicDamageTaken >= 5) {
    character.relicDamageTaken -= 5
    character.gainEmber(1)
    boardRenderer.playHudCounterFeedback('ember', character.ember)
    recordRelicActivation('anomaly', '불씨 +1')
  }
}

/** 맹신: 1$ 획득마다 불빛 50 획득(코인 1당 +50). 코인 획득 지점마다 amount로 호출한다. */
function applyBlindFaithCoins(amount: number): void {
  if (amount <= 0 || !gameState.character.hasRelic('blind-faith')) return
  const gained = gainFixedLight('맹신', 50 * amount)
  recordRelicActivation('blind-faith', `불빛 +${gained}`)
  void playResourceTrail({ kind: 'chain' }, 'score', 1)
  burstScoreGain()
}

/** 잉크와 깃펜: 적 5처치마다 콤보 게이지 +1. 처치 수는 런 동안 누적한다.
 *  채워진 게이지는 액션 종료 시 resolveFullCandleGaugeEffects가 정산한다. */
function applyInkQuillKills(count: number): void {
  if (count <= 0 || !gameState.character.hasRelic('ink-quill')) return
  gameState.enhancements.inkQuillKillCount += count
  while (gameState.enhancements.inkQuillKillCount >= 5) {
    gameState.enhancements.inkQuillKillCount -= 5
    gameState.character.gainCandle(1)
    boardRenderer.playHudCounterFeedback('candle', gameState.character.candle)
    recordRelicActivation('ink-quill', '콤보 게이지 +1')
  }
}

/** 품격있는 대처: 나에게 피해를 입힌 적들에게 각각 피해 1로 반격한다.
 *  적 페이즈(runEnemyPhase) 직후, 플레이어 피격 연출이 끝난 뒤 호출한다. */
async function applyDignifiedRetaliation(hits: EnemyHit[]): Promise<void> {
  if (gameState.isGameOver || !gameState.character.hasRelic('graceful-response')) return
  // 실제로 피해를 입힌 적만(방패로 0이면 제외), 다중 레인 점유 적은 cardId로 중복 제거.
  const attackerIds = [...new Set(hits.filter((h) => h.damage > 0).map((h) => h.cardId))]
  if (attackerIds.length === 0) return
  const damaged: { cardId: string; amount: number }[] = []
  const killedIds: string[] = []
  // 반격 피해: Math.floor(공격력 × 0.3) + 1 — atkDmgHtml과 동일한 공식
  const dmg = Math.max(1, Math.floor(gameState.character.damage * 0.3) + 1)
  for (const id of attackerIds) {
    const hit = gameState.damageEnemyById(id, dmg)
    if (!hit) continue
    damaged.push({ cardId: hit.cardId, amount: hit.amount })
    if (hit.defeated) killedIds.push(hit.cardId)
  }
  if (damaged.length === 0) return
  const dmgForLog = Math.max(1, Math.floor(gameState.character.damage * 0.3) + 1)
  recordRelicActivation('graceful-response', `반격 피해 ${dmgForLog} (${damaged.length}체)`)
  await boardRenderer.animateDamageNumbersById(damaged)
  if (killedIds.length > 0) {
    await boardRenderer.animateCardConsumeByIds(
      killedIds.map((cardId) => ({ cardId, type: CardType.ENEMY })),
      { suppressBurstIds: new Set(killedIds) }
    )
    await onEnemiesDefeated(killedIds.length)
  }
}

/** Hope is a one-shot revive: show its bespoke relic burst, remove itself,
 *  ban future offers, clear the rail, then hand control back to the player. */
/** 권위: 치명적 피해를 단 한 번 체력 1로 버틴다(필드는 그대로). 발동 후 다시 등장하지 않게 밴한다.
 *  희망처럼 화면 중앙 연출 + 체력 게이지 확대 + 붉은빛을 보여 준 뒤 유물을 파괴한다. */
async function tryResolveAuthoritySurvive(): Promise<boolean> {
  const character = gameState.character
  // takeDamage가 체력을 1에서 멈추고 세운 pending 플래그로만 발동한다(0→부활이 아니라 1에서 정지).
  if (!character.authoritySurvivePending) return false
  character.authoritySurvivePending = false
  await boardRenderer.animateAuthoritySurvive('authority')
  character.removeRelic('authority', true)
  character.health = Math.max(1, character.health)
  gameState.isGameOver = false
  gameState.gameOverReason = ''
  recordRelicActivation('authority', '체력 1로 생존')
  render()
  return true
}

/** 사망(치명타) 처리 순서: 권위(체력 1로 생존, 필드 유지) → 희망(체력 10 부활, 필드 제거). */
async function tryResolveSurvivalRelics(): Promise<boolean> {
  if (await tryResolveAuthoritySurvive()) return true
  if (await tryResolveHopeRevive()) return true
  // 최후의 수단: 다른 부활 수단이 모두 실패한 진짜 죽음 직전, 아주 드물게 에나가 각성한다.
  if (await tryResolveCompanionAwaken()) return true
  return false
}

/**
 * 에나의 각성(최후의 의지). 다른 부활 수단이 전부 실패한 사망 직전에만, 런당 한 번,
 * 아주 드물게 발동한다. 화려한 연출과 함께 체력 전체 회복 + 공격력 +1로 되살린다.
 */
async function tryResolveCompanionAwaken(): Promise<boolean> {
  const character = gameState.character
  if (character.isAlive()) return false
  if (!companion.tryAwaken()) return false
  await boardRenderer.animateClutchOnPlayer('attack-gain', true)
  character.fullHeal()
  character.applyDamageBoost(1)
  gameState.isGameOver = false
  gameState.gameOverReason = ''
  recordNotice('에나의 각성! 체력 전체 회복 · 공격력 +1', 'info')
  render()
  showClutchChain('awaken', '체력 전체 회복 · 공격력 +1')
  sayEnaBark(companion.awakenLine(), { importance: BARK_IMPORTANCE.clutch })
  return true
}

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

/** 고정 불빛 획득 공통 경로. 턴 배율(getTurnScoreMultiplier)은 적용하지 않되, 자원팩 등이
 *  올리는 글로벌 불빛 획득량 보너스(enhancements.scoreMultiplier)는 모든 불빛 획득에 반영한다.
 *  야망/맹신/정직/별빛 랜턴/무료카드 등 고정 불빛 획득이 모두 이 함수를 거친다. */
function gainFixedLight(label: string, baseValue: number, kind: ActivityLogEntry['kind'] = 'score'): number {
  if (baseValue <= 0) return 0
  const amount = Math.max(0, Math.round(baseValue * gameState.enhancements.scoreMultiplier))
  if (amount <= 0) return 0
  score += amount
  scorePulseKey++
  pushActivityLogsInDisplayOrder([{ label, scoreDelta: amount, kind }])
  return amount
}

/** 매 턴 발동하는 유물 효과를 한 곳에서 처리한다. */
async function applyTurnStartRelics(): Promise<void> {
  const character = gameState.character
  const turn = gameState.getCurrentTurn()

  // 별빛 랜턴: 5턴마다 불빛 200 (턴 배율 없음).
  if (character.hasRelic('golden-squirrel') && turn !== 0 && turn % 5 === 0) {
    const gained = gainFixedLight('별빛 랜턴', 200)
    recordRelicActivation('golden-squirrel', `불빛 +${gained}`)
    await playResourceTrail({ kind: 'chain' }, 'score', 1)
    burstScoreGain()
  }

  // 에나벨라의 반지: 최하단 손패 → 최상단 이동.
  if (character.hasRelic('annabella-ring') && character.hand.length > 1) {
    character.hand.push(character.hand.shift()!)
    render()
  }

  // 기사도: 4턴마다 knight 태그 손패 중 dropWeight 기반 랜덤 1장 지급.
  if (character.hasRelic('chivalry') && turn !== 0 && turn % 4 === 0) {
    const knightPool = HAND_CARD_IDS.filter((id) => HAND_CARD_DEFINITIONS[id].jobTags?.includes('knight'))
    if (knightPool.length > 0) {
      const total = knightPool.reduce((s, id) => s + (HAND_CARD_DEFINITIONS[id].dropWeight ?? 1), 0)
      let roll = Math.random() * total
      let picked = knightPool[0]
      for (const id of knightPool) {
        roll -= HAND_CARD_DEFINITIONS[id].dropWeight ?? 1
        if (roll <= 0) { picked = id; break }
      }
      const drop = DropSystem.makeCard(picked)
      const added = character.addHandCard(drop)
      if (added) {
        const name = HAND_CARD_DEFINITIONS[picked].name
        recordRelicActivation('chivalry', `${name} 획득`)
        render()
        await playResourceTrail({ kind: 'chain' }, 'hand', 1)
      }
    }
  }
}

/** 소중한 머리: 체력이 최대치의 절반 이하로 감소하면 전체 회복 후 파괴.
 *  fullHeal()이 onHealGain 콜백을 발동해 blood-pack을 자동 처리한다. */
async function applyPreciousHeadCheck(): Promise<void> {
  const character = gameState.character
  if (!character.hasRelic('precious-head')) return
  if (character.health <= 0 || character.health > character.maxHealth / 2) return
  const beforeResources = snapshotPlayerResources()
  // 파괴 연출(강도 2)을 먼저 보여 준 뒤 회복/파괴를 확정한다.
  await boardRenderer.animateRelicDestroy('precious-head', 2)
  character.fullHeal()
  character.removeRelic('precious-head', true)
  recordRelicActivation('precious-head', '체력 전체 회복 (발동 후 파괴)')
  render()
  await playPlayerGainTrails({ kind: 'chain' }, beforeResources)
}

/** 훌륭한 대화수단: 플레이어가 적을 공격할 때마다 2.5% 확률로 파괴, 공격력 +2 환원. */
async function applyGreatNegotiationOnAttack(): Promise<void> {
  const character = gameState.character
  if (!character.hasRelic('great-negotiation') || Math.random() >= 0.025) return
  // 파괴 연출(강도 1: 정말 간단한 소각)을 유물이 부채에 남아 있는 동안 먼저 재생한다.
  await boardRenderer.animateRelicDestroy('great-negotiation', 1)
  character.damage = Math.max(1, character.damage - 2)
  character.removeRelic('great-negotiation', true)
  recordRelicActivation('great-negotiation', '파괴! 공격력 -2 환원')
  render()
}

/** 찬스: 적 타격 후 15% 확률로 추가 타격. 빠른 따닥 느낌으로 짧게 처리. */
async function applyChanceExtraHit(card: Card, distance: number): Promise<void> {
  if (!gameState.character.hasRelic('chance') || Math.random() >= 0.15) return
  if (card.health <= 0) return
  const char = gameState.character
  // 빠른 추가 타격 — 공격 애니메이션 없이 피해 숫자만 즉시 표시.
  const newHealth = card.takeDamage(char.damage)
  recordRelicActivation('chance', `추가 타격 ${char.damage}`)
  await boardRenderer.animateDamageNumbersById([{ cardId: card.id, amount: char.damage }])
  if (newHealth <= 0) {
    const base = scoreForCardRemoval(card)
    if (base > 0) {
      pushActivityLogsInDisplayOrder([createScoreLog(scoreLabelForCard(card), base, 'enemy')])
      await playResourceTrail({ kind: 'card', cardId: card.id }, 'score', 1)
    }
    if (card.isSpecialEnemy) await applyPadlockMimicBonus(card)
    await boardRenderer.animateCardConsumeByIds([{ cardId: card.id, type: CardType.ENEMY }], {
      suppressBurstIds: new Set([card.id]),
    })
    gameState.removeCardFromRow(card, distance)
    await onEnemiesDefeated(1)
  }
}

/** 물양동이: 타격한 적 25% 확률로 추가 피해(공격력 × 0.5 + 1, 최소 1). */
async function applyWaterBucketExtraDamage(card: Card, distance: number): Promise<void> {
  if (!gameState.character.hasRelic('water-bucket') || Math.random() >= 0.25) return
  if (card.health <= 0) return
  // atkDmgHtml과 동일한 공식
  const dmg = Math.max(1, Math.floor(gameState.character.damage * 0.5) + 1)
  const newHealth = card.takeDamage(dmg)
  recordRelicActivation('water-bucket', `추가 피해 ${dmg}`)
  await boardRenderer.animateDamageNumbersById([{ cardId: card.id, amount: dmg }])
  if (newHealth <= 0) {
    const base = scoreForCardRemoval(card)
    if (base > 0) {
      pushActivityLogsInDisplayOrder([createScoreLog(scoreLabelForCard(card), base, 'enemy')])
      await playResourceTrail({ kind: 'card', cardId: card.id }, 'score', 1)
    }
    if (card.isSpecialEnemy) await applyPadlockMimicBonus(card)
    await boardRenderer.animateCardConsumeByIds([{ cardId: card.id, type: CardType.ENEMY }], {
      suppressBurstIds: new Set([card.id]),
    })
    gameState.removeCardFromRow(card, distance)
    await onEnemiesDefeated(1)
  }
}

/** 소소한 클러치 — 급소: 살아남은 적에게 가끔 추가 피해(공격력 + 2). */
async function applyCompanionCrit(card: Card, distance: number): Promise<void> {
  if (!companionWorldCanSpeak() || card.health <= 0) return
  if (!companion.rollMinorClutch('crit', { adversity: card.enemyPower >= 6 || card.getHealth() > gameState.character.damage * 2, bond: true })) return
  const dmg = Math.max(1, gameState.character.damage + 2)
  const newHealth = card.takeDamage(dmg)
  recordNotice(`에나의 의지 — 급소! 추가 피해 ${dmg}`, 'info')
  void boardRenderer.animateClutchOnPlayer('attack-gain')
  showClutchChain('crit', `급소 추가 타격 ${dmg}`)
  sayEnaBark(companion.minorClutchLine('crit'), { importance: BARK_IMPORTANCE.clutch })
  // 급소 피해는 레바테인 스타일 특수 폰트로 한 번 더(일반 -1 뒤에 -2가 황금빛으로).
  await boardRenderer.animateCritDamageOnCard(card.id, dmg)
  if (newHealth <= 0) {
    const base = scoreForCardRemoval(card)
    if (base > 0) {
      pushActivityLogsInDisplayOrder([createScoreLog(scoreLabelForCard(card), base, 'enemy')])
      await playResourceTrail({ kind: 'card', cardId: card.id }, 'score', 1)
    }
    if (card.isSpecialEnemy) await applyPadlockMimicBonus(card)
    await boardRenderer.animateCardConsumeByIds([{ cardId: card.id, type: CardType.ENEMY }], {
      suppressBurstIds: new Set([card.id]),
    })
    gameState.removeCardFromRow(card, distance)
    await onEnemiesDefeated(1)
  }
}

/** 자물쇠: 미믹 처치 시 불빛 +25% + 손패 +1. */
async function applyPadlockMimicBonus(card: Card): Promise<void> {
  if (!gameState.character.hasRelic('padlock')) return
  // 불빛 +25% (미믹 기본 점수 기준, 턴 배율 없이 고정 지급)
  const baseScore = scoreForCardRemoval(card)
  const bonusLight = Math.max(1, Math.ceil(baseScore * 0.25))
  const gained = gainFixedLight('자물쇠 · 미믹 불빛', bonusLight)
  recordRelicActivation('padlock', `미믹 불빛 +${gained}`)
  await playResourceTrail({ kind: 'chain' }, 'score', 1)
  burstScoreGain()
  // 손패 +1
  const drop = DropSystem.generateDrop('enemy-kill')
  const added = gameState.character.addHandCard(drop)
  if (added) {
    const dropDef = getHandCardDef(drop.defId)
    pushActivityLogsInDisplayOrder(createItemGainLogs([dropDef.name]))
    render()
    await playResourceTrail({ kind: 'chain' }, 'hand', 1)
  }
}

/** 상점 가격(불빛) 인플레이션 배수.
 *  첫 상점인 10층은 초기 자본(불빛 ~500-700)에 맞춰 살짝 더 싸게 ×0.8로 낮춘다.
 *  20층부터는 기존 곡선(1 + (turn-10)*0.02)을 그대로 유지한다.
 *  (예: 20층 ≈1.2배, 30층 ≈1.4배, 60층 ≈2배, 90층 ≈2.6배) */
function getShopPriceMultiplier(): number {
  const turn = gameState.getCurrentTurn()
  if (turn <= 10) return 0.8
  return 1 + Math.max(0, turn - 10) * 0.02
}

/** basePrice는 Relics.ts 정의에서 읽는다. 실제 식은 -76~+104 비대칭 지터를 만들어 비원형 가격을 낸다.
 *  후반 인플레이션 배수를 곱해 고층에서 불빛 가격이 가팔라지게 한다.
 *  할인 쿠폰 등 shopDiscountPct가 0 초과이면 해당 비율만큼 추가 인하한다. */
function priceForRelic(id: RelicId): number {
  const base = getRelicDef(id).basePrice
  const jitter = Math.floor((Math.random() - 0.42) * 180)
  const raw = Math.max(120, Math.round((base + jitter) * getShopPriceMultiplier()))
  const discountFactor = 1 - Math.min(0.8, gameState.enhancements.shopDiscountPct / 100)
  return Math.max(120, Math.round(raw * discountFactor))
}

/** Generate up to three unowned, unbanned relics + per-spawn score price. */
function rollShopOffers(excludeIds: string[] = []): ShopOfferView[] {
  const character = gameState.character
  // 제단도 상점과 동일하게 전체 유물 풀에서 3장을 뽑는다(상위 등급 제한 없음).
  const sourcePool = RELIC_IDS.filter(
    (id) => !character.hasRelic(id) && !character.bannedRelics.includes(id)
  )
  // 리롤 시 현재 배치된 유물은 제외한다. 풀이 부족하면 제외 없이 폴백한다.
  const excludeSet = new Set(excludeIds)
  const filteredPool = excludeSet.size > 0
    ? sourcePool.filter((id) => !excludeSet.has(id))
    : sourcePool
  const effectivePool = filteredPool.length >= 3 ? filteredPool : sourcePool
  // 등급 기본 가중치(common 자주, legendary 드물게)에 유물별 지정 weight를 더해 적용한다.
  const weightedPool = effectivePool.flatMap((relicId) => {
    const weight = relicDrawWeight(relicId)
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
 *  3종(광란/역경/가난) 정의를 그대로 사용한다. */
async function openTrialOverlay(): Promise<void> {
  inputLocked = true
  await openTrialOverlayForced()
  inputLocked = false
}

/** Pack cost source of truth. UI 표기와 실제 차감이 갈라지지 않도록 구매 처리도 이 함수만 사용한다.
 *  카드팩은 유물과 달리 고정 시작가에 방문 내 구매 횟수만 누적한다. */
function altarBasePackCost(): number {
  const turn = gameState.getCurrentTurn()
  // 30/60/90층 제단 팩은 층별 고정 시작가를 사용해 UI 표기와 차감을 정확히 맞춘다.
  if (turn >= 90) return 2500
  if (turn >= 60) return 1500
  return 500
}

function baseShopPackCost(kind: ShopPackKind): number {
  if (currentShopMode === 'altar') return altarBasePackCost()
  switch (kind) {
    case 'basic-pack': return 120
    case 'recipe-pack': return 400
    case 'unlock-pack': return 400
    // 제단 전용 팩이 일반 상점에서 호출되면 안전한 기본값으로 막는다.
    default: return altarBasePackCost()
  }
}

function currentShopPackCost(kind: ShopPackKind): number {
  const base = baseShopPackCost(kind)
  // 각 팩은 구매할 때마다 자기 초기 가격만큼 증가한다(예: 1500→3000→4500).
  const raw = base * ((shopPackBuys[kind] ?? 0) + 1)
  const discountFactor = 1 - Math.min(0.8, gameState.enhancements.shopDiscountPct / 100)
  return Math.max(1, Math.round(raw * discountFactor))
}

/** Build the renderer-facing split-shop state with visit-local pack costs.
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
    packCosts: Object.fromEntries(
      SHOP_PACK_KINDS.map((kind) => [kind, currentShopPackCost(kind)])
    ) as Partial<Record<ShopPackKind, number>>,
  }
}

/** Immediate stat effects for relics whose benefit is granted on purchase. */
async function applyRelicPurchaseEffect(id: RelicId): Promise<void> {
  // 동료(에나) 구매 감상평 — 상점/제단에서도 한마디(사치품엔 짓궂게, 가문 물건엔 반갑게).
  // companionWorldCanSpeak는 상점을 막으므로 여기선 가볍게 게이팅한다(.player-card HUD에 표시).
  if (gameActive && !gameState.isGameOver) {
    sayEnaBark(companion.onBuyRelic(id, getRelicDef(id).rarity), { importance: BARK_IMPORTANCE.situation })
  }
  // 구매 즉시 스탯만 올리고 체인 로그에는 남기지 않는다. 트레일은 상점에서
  // 숨겨진 체인 배너 대신 화면 중앙에서 HUD로 날린다.
  if (id === 'carving-knife') {
    const beforeResources = snapshotPlayerResources()
    gameState.character.applyDamageBoost(1)
    await playPlayerGainTrails({ kind: 'center' }, beforeResources)
    return
  }
  if (id === 'lifeline') {
    const beforeResources = snapshotPlayerResources()
    // increaseMaxHealth가 onHealGain 콜백으로 blood-pack을 자동 처리한다.
    gameState.character.increaseMaxHealth(5)
    await playPlayerGainTrails({ kind: 'center' }, beforeResources)
  }
  if (id === 'first-candle') {
    const beforeResources = snapshotPlayerResources()
    // 첫 양초: 최대 체력 +5 / 공격력 +1 / 불씨 한도 +2 / 최대 손패 +2 / 콤보 한도 -1.
    // 손패·콤보 한도는 수치 트레일이 없으므로 체력/불씨/공격력만 중앙 트레일로 보인다.
    // increaseMaxHealth가 onHealGain 콜백으로 blood-pack을 자동 처리한다.
    gameState.character.increaseMaxHealth(5)
    gameState.character.applyDamageBoost(1)
    gameState.character.increaseEmberMax(2)
    gameState.character.increaseHandMax(2)
    gameState.character.decreaseCandleMax(1)
    await playPlayerGainTrails({ kind: 'center' }, beforeResources)
  }
  if (id === 'hegemony') {
    const beforeResources = snapshotPlayerResources()
    // 패도: 최대 체력 -15(제 살 깎기) + 공격력 +2. 구매 가능 여부는 relicPurchaseBlocked가 막는다.
    gameState.character.spendMaxHealth(15)
    gameState.character.applyDamageBoost(2)
    render()
    await playPlayerGainTrails({ kind: 'center' }, beforeResources)
  }
  if (id === 'hourglass') {
    // 불씨 소모 주기 +1턴.
    const beforeResources = snapshotPlayerResources()
    gameState.character.increaseEmberDecayTurns(1)
    await playPlayerGainTrails({ kind: 'center' }, beforeResources)
  }
  if (id === 'great-negotiation') {
    // 공격력 +2. 매 턴 파괴 확률은 applyTurnStartRelics에서 처리.
    const beforeResources = snapshotPlayerResources()
    gameState.character.applyDamageBoost(2)
    await playPlayerGainTrails({ kind: 'center' }, beforeResources)
  }
  if (id === 'pickaxe') {
    // 보물 스폰 가중치 +5.
    cardSpawner.adjustRelicSpawn('treasure', 5)
  }
  if (id === 'axe') {
    // 불빛 획득량 +10% (글로벌 scoreMultiplier에 누적).
    gameState.enhancements.scoreMultiplier *= 1.10
  }
  if (id === 'annabella-pendant') {
    const beforeResources = snapshotPlayerResources()
    // 공격력 +2 + 적 스폰 HP +3 + 적 스폰 가중치 +5.
    gameState.character.applyDamageBoost(2)
    cardSpawner.adjustRelicSpawn('enemy', 5)
    cardSpawner.adjustRelicEnemyHpBonus(3)
    await playPlayerGainTrails({ kind: 'center' }, beforeResources)
  }
  if (id === 'padlock') {
    // 보물 스폰 가중치 -5.
    cardSpawner.adjustRelicSpawn('treasure', -5)
  }
  if (id === 'charred-paper') {
    // 적 스폰 가중치 -5.
    cardSpawner.adjustRelicSpawn('enemy', -5)
  }
  if (id === 'golden-key') {
    // 보물 스폰 중 10% 확률로 황금 상자로 대체한다.
    cardSpawner.adjustGoldenChestWeight(0.1)
  }
  if (id === 'sweet-temptation') {
    // 함정 피해 +1 (ActionSystem이 character.trapDamageBonus를 읽는다).
    gameState.character.trapDamageBonus += 1
  }
  if (id === 'discount-coupon') {
    // 상점 품목 5% 할인 (priceForRelic / currentShopPackCost에서 참조).
    gameState.enhancements.shopDiscountPct += 5
  }
  if (id === 'sanitizer') {
    // 포자 스폰 가중치 -2 (spawnEffect.delta와 동기화).
    cardSpawner.adjustRelicSpawn('spore', -2)
  }
  if (id === 'wax-harmony') {
    // 꽃 스폰 가중치 +2 (spawnEffect.delta와 동기화).
    cardSpawner.adjustRelicSpawn('flower', 2)
  }
  if (id === 'trap-master') {
    // 함정 15% 무효화 확률 (ActionSystem이 character.trapIgnoreChance를 읽는다).
    gameState.character.trapIgnoreChance += 0.15
  }
  if (id === 'last-supper') {
    const beforeResources = snapshotPlayerResources()
    const stats = gameState.character.customRelicProfiles['last-supper']?.stats ?? {}
    // 만찬 유물은 유저가 고른 3개 재료의 누적 스탯을 그대로 적용한다.
    if (stats.maxHealth) gameState.character.increaseMaxHealth(stats.maxHealth)
    if (stats.emberMax) gameState.character.increaseEmberMax(stats.emberMax)
    if (stats.handMax) gameState.character.increaseHandMax(stats.handMax)
    if (stats.damage) gameState.character.applyDamageBoost(stats.damage)
    if (stats.scorePct) gameState.enhancements.scoreMultiplier *= (1 + stats.scorePct / 100)
    await playPlayerGainTrails({ kind: 'center' }, beforeResources)
  }
  // chivalry, luxury: 구매 즉발 효과 없음 — 각각 매 3턴 트리거 / 불빛 소비 시 트리거.
}

/** 일부 유물은 불빛 가격 외 추가 구매 조건이 있다(패도: 최대 체력 16 이상). 충족 못 하면 true. */
function relicPurchaseBlocked(id: RelicId): boolean {
  // spendMaxHealth는 최대 체력이 1 미만이 되지 않게 막으므로, -15 후 최소 1이 남는 16 이상이어야 한다.
  if (id === 'hegemony') return gameState.character.maxHealth < 16
  return false
}

/** 악마 인형 유물: 자해 20마다 불빛 획득량 +10% · 공격력 +1. */
function applyDemonDollSelfDamage(amount: number): void {
  if (!gameState.character.hasRelic('demon-doll') || amount <= 0) return
  const enhancements = gameState.enhancements
  enhancements.demonDollSelfDamageAccum += amount
  const gained = Math.floor(enhancements.demonDollSelfDamageAccum / 20)
  if (gained <= 0) return
  enhancements.demonDollSelfDamageAccum %= 20
  enhancements.demonDollBonusAtk += gained
  for (let i = 0; i < gained; i++) {
    enhancements.scoreMultiplier *= 1.10
    gameState.character.applyDamageBoost(1)
  }
  recordRelicActivation('demon-doll', `자해 20 누적 → 불빛 +10%, 공격력 +${gained} (누적 +${enhancements.demonDollBonusAtk})`)
}

/** 사치품 유물: 불빛 소비량 누적 후 2000마다 공격력 +1 처리. 최대 누적 공격력 +3. */
function applyLuxuryScoreSpend(amount: number): void {
  if (!gameState.character.hasRelic('luxury') || amount <= 0) return
  const enhancements = gameState.enhancements
  const maxBonus = 3
  if (enhancements.luxuryBonusAtk >= maxBonus) return // 이미 최대치
  enhancements.luxuryScoreSpent += amount
  const potential = Math.floor(enhancements.luxuryScoreSpent / 2000)
  if (potential <= 0) return
  enhancements.luxuryScoreSpent %= 2000
  const gained = Math.min(potential, maxBonus - enhancements.luxuryBonusAtk)
  if (gained <= 0) return
  enhancements.luxuryBonusAtk += gained
  gameState.character.applyDamageBoost(gained)
  recordRelicActivation('luxury', `불빛 2000 소비 → 공격력 +${gained} (누적 +${enhancements.luxuryBonusAtk})`)
}

/** 상점/제단 오버레이를 연다. 셔터를 내리고 방문 단위 상태를 초기화한 뒤 본문을 노출한다.
 *  10/20턴 상점, 30/60/90턴 제단, 100F 보스 직전 마지막 제단이 모두 이 경로를 공유한다. */
async function openShopOverlay(mode: 'shop' | 'altar'): Promise<void> {
  currentShopMode = mode
  shopOpen = true
  inputLocked = true
  currentShopOffers = rollShopOffers()
  altarRelicPicked = false
  shopRerollCount = 0
  shopPackBuys = Object.fromEntries(
    SHOP_PACK_KINDS.map((kind) => [kind, 0])
  ) as Record<ShopPackKind, number>
  shopRerollInProgress = false
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
  // 상점/제단 방문 시 해당 모드의 팩 종류를 발견 처리한다.
  const packsByMode: Record<'shop' | 'altar', string[]> = {
    shop:  ['basic-pack', 'recipe-pack', 'unlock-pack'],
    altar: ['resource-pack', 'delete-pack', 'chance-pack'],
  }
  for (const k of packsByMode[mode]) gameState.encounteredPackKinds.add(k)
  recordNotice(mode === 'altar' ? '레일이 멈추고 제단이 열렸다' : '레일이 멈추고 상점이 열렸다', 'info')
  render()
  await boardRenderer.playShopTransition()
  boardRenderer.openShop(buildShopStateView(), score, gameState.character)
}

async function maybeOpenShopAfterTurn(): Promise<boolean> {
  // 보스 전투/최종 별빛 등반 중에는 10/30턴 상점·제단을 재트리거하지 않는다.
  if (gameState.bossBattleActive || finalAscentStarlightRuleActive) return false
  if (gameState.getCurrentTurn() === 0 || gameState.getCurrentTurn() % 10 !== 0) return false
  // Every 30 turns swaps to altar mode; this is the first phase of the
  // 100-turn run loop (10 shop, 20 shop, 30 altar ...).
  await openShopOverlay(gameState.getCurrentTurn() % 30 === 0 ? 'altar' : 'shop')
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
    await openShopOverlay('altar')
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

/** 레시피 재료를 "양초 + 불씨" / "성냥 ×2" 형식의 한 줄 문자열로 변환한다. */
function buildRecipeNote(ingredients: Partial<Record<HandCardId, number>>): string {
  return Object.entries(ingredients)
    .filter(([, n]) => n && n > 0)
    .map(([id, n]) => n === 1
      ? getHandCardDef(id as HandCardId).name
      : `${getHandCardDef(id as HandCardId).name} ×${n}`)
    .join(' + ')
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
            case 'basic_010': character.addShield(5);   return
            case 'basic_011': coins += 1; applyBlindFaithCoins(1); return
          }
        },
      })),
      3
    )
  }
  if (kind === 'recipe-pack') {
    // 조합팩 — runLocked 레시피 중 재료가 이미 해금된 항목만 제시한다.
    const { unlocked } = runCardPool.snapshot()
    const lockedRecipes = RECIPES.filter((r) =>
      r.runLocked &&
      !r.eventOnly &&
      !gameState.unlockedRecipeIds.has(r.id) &&
      Object.keys(r.ingredients).every((id) => unlocked.includes(id as HandCardId))
    )
    if (lockedRecipes.length === 0) return []
    return sampleWithoutReplacement(lockedRecipes, Math.min(3, lockedRecipes.length)).map((r) => ({
      id: `recipe-${r.id}`,
      theme: 'unlock' as const,
      title: r.name,
      effect: boardRenderer.recipeEffectHtml(r),
      rarity: 'rare' as const,
      spriteUrl: recipeSprite001 ?? SpriteUrls.packs['recipe-pack'],
      typeLabel: '레시피',
      recipeNote: buildRecipeNote(r.ingredients),
      apply: () => { gameState.unlockedRecipeIds.add(r.id) },
    }))
  }
  if (kind === 'chance-pack') {
    // 확률팩 — 해금된 일반 드롭 풀 카드 중 3장 제시, 선택 시 T1 개별 카드 가중치 영구 추가.
    const { unlocked } = runCardPool.snapshot()
    // boss 전용·dropWeight 0 카드(검은 양초 등 이벤트 아이템) 제외
    const chancePool = unlocked.filter(id => {
      const d = HAND_CARD_DEFINITIONS[id]
      return d && d.dropSource !== 'boss' && (d.dropWeight ?? 0) > 0
    })
    if (chancePool.length === 0) return []
    // 등급별 부스트 가중치 — 커먼에 가까울수록 더 큰 폭 조정
    const RARITY_BOOST: Record<string, number> = { common: 5, rare: 3, epic: 2, unique: 1, legendary: 1 }
    // 확률을 2자리까지 표기하되 불필요한 끝자리 0 제거
    const fmt = (p: number) => String(parseFloat((p * 100).toFixed(2)))
    const drawIds = sampleWithoutReplacement(chancePool, Math.min(3, chancePool.length))
    return drawIds.map((id) => {
      const def = getHandCardDef(id)
      const boostToAdd = RARITY_BOOST[HAND_CARD_RARITY[id] ?? 'common'] ?? 1
      const { before, after } = DropSystem.computeDropProbability(
        id, chancePool, gameState.enhancements.tier1CardBoosts, boostToAdd,
      )
      return {
        id: `chance-${id}`,
        theme: 'unlock' as const,
        title: def.name,
        effect: `등장 확률 ${fmt(before)}% → ${fmt(after)}%`,
        rarity: HAND_CARD_RARITY[id],
        spriteUrl: spriteForHandCard(id),
        typeLabel: '확률',
        apply: () => {
          gameState.enhancements.tier1CardBoosts[id] = (gameState.enhancements.tier1CardBoosts[id] ?? 0) + boostToAdd
          DropSystem.setTier1CardBoosts(gameState.enhancements.tier1CardBoosts)
        },
      }
    })
  }
  if (kind === 'resource-pack') {
    // 제단 자원팩 — 30층마다 고정 가격으로 열리는 영구 보정 풀이며 항목별 weight를 따른다.
    const rawPool = SHOP_PACK_POOLS['resource-pack'].map((entry) => ({
      ...entry,
      spriteUrl: entry.illu ? spriteForBasicPackItem(entry.illu) : undefined,
      apply: () => {
        switch (entry.id) {
          case 'altar-clothes-thick':  character.increaseMaxHealth(5);                 return
          case 'altar-heating':        character.applyDamageBoost(1);                  return
          case 'altar-backpack-large': character.increaseHandMax(2);                   return
          case 'altar-matchbox':       character.increaseEmberMax(2);                  return
          case 'altar-wick-thick':     character.increaseEmberDecayTurns(1);           return
          case 'altar-joker-card':     character.decreaseCandleMax(1);                 return
          case 'altar-lantern':        gameState.enhancements.scoreMultiplier *= 1.10; return
          case 'altar-one-coin':       coins += 1; applyBlindFaithCoins(1);            return
        }
      },
    }))
    return sampleWeightedWithoutReplacement(rawPool, Math.min(3, rawPool.length))
  }
  if (kind === 'unlock-pack') {
    // 해금팩 — 런에서 잠긴 카드(runLocked) + 삭제팩으로 밴된 카드를 해금한다.
    // 보스 전용 찌꺼기 카드(탐욕의 동전 등)는 제외한다.
    const { locked, banned } = runCardPool.snapshot()
    const cardPool = [...locked, ...banned].filter((id) => getHandCardDef(id).dropSource !== 'boss')
    if (cardPool.length === 0) return []
    return sampleWithoutReplacement(cardPool, Math.min(3, cardPool.length)).map((id) => {
      const def = getHandCardDef(id)
      const isBanned = banned.includes(id)
      return {
        id: `unlock-${id}`,
        theme: 'unlock' as const,
        title: def.name,
        effect: isBanned ? `[재해금] ${boardRenderer.cardEffectHtml(id)}` : boardRenderer.cardEffectHtml(id),
        rarity: HAND_CARD_RARITY[id],
        spriteUrl: spriteForHandCard(id),
        typeLabel: '손패',
        apply: () => {
          if (isBanned) runCardPool.unban(id)
          else runCardPool.unlockForRun(id)
        },
      }
    })
  }
  if (kind === 'delete-pack') {
    // 풀 = 현재 해금된 카드 중 이벤트 보스 전용(검은 양초 등) 제외
    const { unlocked } = runCardPool.snapshot()
    const deletePool = unlocked.filter(id => getHandCardDef(id).dropSource !== 'boss')
    if (deletePool.length === 0) return []
    const drawIds = sampleWithoutReplacement(deletePool, Math.min(3, deletePool.length))
    return drawIds.map((id) => {
      const def = getHandCardDef(id)
      return {
        id: `delete-${id}`,
        theme: 'unlock' as const,
        title: def.name,
        effect: `앞으로 ${def.name} 등장 금지`,
        rarity: HAND_CARD_RARITY[id],
        spriteUrl: spriteForHandCard(id),
        typeLabel: '삭제',
        apply: () => { runCardPool.ban(id) },
      }
    })
  }
  return []
}
/** Open the pack picker for the just-clicked pack tile. Deducts the price
 *  if the player can afford it, otherwise no-op. */
async function openPackPurchase(kind: ShopPackKind): Promise<void> {
  const cost = currentShopPackCost(kind)
  if (score < cost) return
  score = Math.max(0, score - cost)
  scorePulseKey++
  // 사치품: 불빛 소비 추적 (2000마다 공격력 +1).
  applyLuxuryScoreSpend(cost)
  // 구매 직후 같은 팩 가격을 초기 가격만큼 올려 다음 표기/차감에 반영한다.
  shopPackBuys[kind] = (shopPackBuys[kind] ?? 0) + 1
  enaRuntimeObserver.recordShopPurchase(gameState, shopKindToPurchaseId(kind))
  // Keep picker title synchronized with the shared pack label table.
  const title = SHOP_PACK_LABELS[kind].title
  const items = rollPackItems(kind)
  activePackSession = { kind, items, rerollCount: 0 }
  // Spend feedback before the picker so the score panel ticks down on click.
  const packTile = document.querySelector<HTMLElement>(`#shop-overlay .shop-pack-card[data-shop-buy-kind="${kind}"]`)
  if (packTile) await boardRenderer.playShopPurchaseImpact(packTile, "score")
  boardRenderer.playScoreSpendFeedback(score, scorePulseKey)
  // 불빛 → 팩 타일 트레일 (피커 열림과 동시에 배경 재생)
  boardRenderer.fireScoreSpendTrailToTarget(packTile, cost)
  boardRenderer.openShop(buildShopStateView(), score, gameState.character)
  const view: ShopPackPickerView = {
    packKind: kind,
    title,
    // 삭제팩·해금팩·조합팩·확률팩은 선택을 강제하지 않고 넘기기 버튼으로 패스 가능하다.
    passable: kind === 'delete-pack' || kind === 'unlock-pack' || kind === 'recipe-pack' || kind === 'chance-pack',
    // spriteUrl 포함: enhance/unlock/delete 팩은 카드별 일러스트가 있어야 식별 가능하다.
    items: items.map(({ id, title, effect, theme, rarity, spriteUrl, typeLabel, recipeNote }) => ({ id, title, effect, theme, rarity, spriteUrl, typeLabel, recipeNote })),
    rerollCost: 1 + (activePackSession?.rerollCount ?? 0),
    coins,
  }
  boardRenderer.openPackPicker(view)
}

/** Apply the player's pick from an active pack session, then close the picker. */
async function handleShopPackPick(detail: ShopPackPickDetail): Promise<void> {
  if (!activePackSession || activePackSession.kind !== detail.packKind) return
  const picked = activePackSession.items.find((it) => it.id === detail.itemId)
  if (!picked) return
  const beforeResources = snapshotPlayerResources()
  const beforeCoins = coins
  await picked.apply()
  // unlock-pack/delete-pack 선택 후 runCardPool이 바뀌므로 드롭 풀 및 도감 잠금 표시를 재동기화한다.
  const poolSnap = runCardPool.snapshot()
  DropSystem.setAllowedPool(poolSnap.unlocked)
  boardRenderer.setLockedCardIds([...poolSnap.locked, ...poolSnap.banned])
  // runLocked 레시피 잠금도 재동기화한다.
  boardRenderer.setLockedRecipeIds(
    RECIPES.filter((r) => r.runLocked && !gameState.unlockedRecipeIds.has(r.id)).map((r) => r.id)
  )
  activePackSession = null
  boardRenderer.closePackPicker()
  // Most pack effects mutate character stats; play the standard player-gain
  // trail so HP/방패/공격력 등 변화에 카드/숫자 피드백이 같이 따라온다.
  await playPlayerGainTrails({ kind: 'chain' }, beforeResources)
  // '동전 한 닢' 등 화폐 아이템은 playPlayerGainTrails가 다루지 않으므로(coin 미포함)
  // 단독 코인 카드/수당과 같은 펄스키+트레일+지갑 버스트 문법으로 별도 라우팅한다.
  // applyBlindFaithCoins는 apply() 내부에서 이미 처리됐으므로 여기서 재호출하지 않는다.
  const pickedCoinGain = coins - beforeCoins
  if (pickedCoinGain > 0) {
    coinPulseKey++
    recordCoinGain(picked.title, pickedCoinGain)
    await playResourceTrail({ kind: 'chain' }, 'coin', pickedCoinGain)
  }
  // 자원팩 등 게이지 아이템 선택 시 게이지가 가득 찼으면 보상 효과를 즉시 발동한다.
  await resolveFullCandleGaugeEffects({ kind: 'chain' })
  render()
  boardRenderer.openShop(buildShopStateView(), score, gameState.character)
}

/** 팩 피커 재뽑기: 1+횟수$ 차감 후 같은 팩 종류로 새 3장을 뽑아 피커를 갱신한다. */
async function handleShopPackReroll(packKind: ShopPackKind): Promise<void> {
  if (!activePackSession || activePackSession.kind !== packKind) return
  const cost = 1 + activePackSession.rerollCount
  if (coins < cost) return
  coins -= cost
  coinPulseKey++
  applyBlindFaithCoins(-cost)
  boardRenderer.playCoinSpendFeedback(coins, coinPulseKey)
  await boardRenderer.playPackRerollFeedback(cost)
  activePackSession.rerollCount++
  activePackSession.items = rollPackItems(packKind)
  const newView: ShopPackPickerView = {
    packKind,
    title: SHOP_PACK_LABELS[packKind].title,
    passable: packKind === 'delete-pack' || packKind === 'unlock-pack' || packKind === 'recipe-pack' || packKind === 'chance-pack',
    items: activePackSession.items.map(({ id, title, effect, theme, rarity, spriteUrl, typeLabel, recipeNote }) => ({ id, title, effect, theme, rarity, spriteUrl, typeLabel, recipeNote })),
    rerollCost: 1 + activePackSession.rerollCount,
    coins,
  }
  boardRenderer.refreshPackPickerCards(newView)
}

async function handleShopBuy(detail: ShopBuyDetail): Promise<void> {
  if (!shopOpen) return
  if (
    detail.kind !== 'relic' &&
    detail.kind !== 'free-card' &&
    detail.kind !== 'free-coin-card' &&
    detail.kind !== 'reroll' &&
    detail.kind !== 'basic-pack' &&
    detail.kind !== 'recipe-pack' &&
    detail.kind !== 'unlock-pack' &&
    detail.kind !== 'chance-pack' && detail.kind !== 'resource-pack' && detail.kind !== 'delete-pack'
  )
    return
  if (detail.kind === 'free-card' || detail.kind === 'free-coin-card') {
    if (detail.kind === 'free-card') {
      if (freeCardClaimed) return
      freeCardClaimed = true
      // 선물 상자는 사용 즉시 소모되며, 실제 보상량과 트레일 입력을 같은 데이터에서 읽는다.
      const freeGift = SHOP_FREE_GIFT_REWARDS[freeGiftKind]
      if (freeGiftKind === 'score-300') {
        // 불빛 보상도 글로벌 불빛 획득량 보너스(scoreMultiplier)를 공통 적용한다.
        gainFixedLight('선물 상자', freeGift.amount)
        // 불빛 보상은 무료카드에서 불빛 패널로 직접 날려 기존 획득 문법을 유지한다.
        await boardRenderer.consumeFreeCardAndRouteReward('free-card', 'score', freeGift.amount, 'score')
      } else if (freeGiftKind === 'coin-1') {
        coins += freeGift.amount
        coinPulseKey++
        applyBlindFaithCoins(freeGift.amount)
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
      applyBlindFaithCoins(3)
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
    detail.kind === 'basic-pack' || detail.kind === 'recipe-pack' || detail.kind === 'unlock-pack' ||
    detail.kind === 'chance-pack' || detail.kind === 'resource-pack' || detail.kind === 'delete-pack'
  ) {
    await openPackPurchase(detail.kind)
    return
  }
  if (detail.kind === 'reroll') {
    if (shopRerollInProgress) return
    shopRerollInProgress = true
    try {
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
      // 애니메이션이 시작되기 전부터 버튼을 비활성처럼 보여 연타 피드백을 차단한다.
      rerollBtn?.classList.add('is-reroll-locked')
      if (rerollBtn) await boardRenderer.playShopPurchaseImpact(rerollBtn, "score")
      boardRenderer.playCoinSpendFeedback(coins, coinPulseKey)
      // Commit the new offers BEFORE running the flip so any incidental
      // re-render (e.g. openShop's refresh path) sees the fresh data,
      // matching what the mid-flip swap puts on screen.
      currentShopOffers = nextOffers
      await boardRenderer.playShopRerollFeedback(rerollCost, nextOffers, score, gameState.character)
      boardRenderer.openShop(buildShopStateView(), score, gameState.character)
    } finally {
      // 어떤 애니메이션 경로로 끝나도 다음 리롤은 완료 후에만 다시 열린다.
      document.querySelector<HTMLElement>('#shop-overlay .shop-reroll-btn')?.classList.remove('is-reroll-locked')
      shopRerollInProgress = false
    }
    return
  }
  if (!detail.relicId) return
  const offer = currentShopOffers.find((entry) => entry.relicId === detail.relicId)
  if (!offer || offer.purchased) return
  // 불빛 가격 외 추가 구매 조건(패도 최대 체력 등) 미충족 시 자원 부족처럼 막는다(상점·제단 공통).
  if (relicPurchaseBlocked(detail.relicId)) { boardRenderer.openShop(buildShopStateView(), score, gameState.character); return }
  // 제단: 유물은 무료 단일 픽 — 가격 없이 1장만 획득하고 나머지는 사그라들며 사라진다.
  if (currentShopMode === 'altar') {
    await pickAltarRelicFree(detail.relicId)
    return
  }
  if (score < offer.price) { boardRenderer.openShop(buildShopStateView(), score, gameState.character); return }
  if (!gameState.character.addRelic(detail.relicId)) {
    render()
    return
  }
  enaRuntimeObserver.recordShopPurchase(gameState, `relic:${detail.relicId}`)
  // Pay the light price. We DO log the deduction — pure number-pulse on the
  // light panel is too easy to miss, so the activity log row makes the spend concrete.
  const def = getRelicDef(detail.relicId)
  score = Math.max(0, score - offer.price)
  scorePulseKey++
  // 사치품: 불빛 소비 추적 (2000마다 공격력 +1).
  applyLuxuryScoreSpend(offer.price)
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

/** 제단 무료 유물 단일 픽: 선택 1장만 무료로 획득하고, 비선택 2장은 불씨가 사그라들듯
 *  사라진다. 픽 후에는 제단 유물 레이어를 비워 재선택을 막는다. */
async function pickAltarRelicFree(relicId: RelicId): Promise<void> {
  if (altarRelicPicked) return
  if (!gameState.character.addRelic(relicId)) { render(); return }
  altarRelicPicked = true
  const def = getRelicDef(relicId)
  pushActivityLogsInDisplayOrder([{ label: `제단 유물: ${def.name}`, kind: 'item-gain' as const }])
  // 선택 1장은 살짝 떠오르고, 나머지 2장은 ember 버스트와 함께 사그라든다.
  await boardRenderer.resolveAltarRelicPick(relicId)
  // 즉발 효과(조각칼/첫 양초 등) 적용 후 보유 유물 부채꼴로 이동.
  await applyRelicPurchaseEffect(relicId)
  boardRenderer.prepareRelicArrivalFromShop(relicId)
  // 픽이 끝나면 유물 오퍼를 비워 재렌더 시 제단 유물 카드가 사라지게 한다.
  currentShopOffers = []
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
    if (gameState.getCurrentTurn() >= RUN_TARGET_TURNS) {
      // 100F 최종 보스: 격파 후 runBossEvent가 보상/시련까지 잇고, 돌아오면 런 클리어로 닫는다.
      recordNotice('100층 최종 보스가 잿빛 굴레를 드리운다', 'hurt')
      await bossController.run100F()
      gameState.endGame('run_clear_100_turns')
      recordNotice('100층 보스 격파 — 잿빛 굴레가 풀렸다', 'win')
    } else if (gameState.getCurrentTurn() === 90) {
      await bossController.run90F()
      // 90F 시련 종료 → 구역 4 (더욱 깊은 숲) 전환
      await zoneCurtain.show(ZONE_LIST[3], () => setZoneBackground(ZONE_LIST[3].bgUrl))
    } else if (gameState.getCurrentTurn() === 60) {
      await bossController.run60F()
      // 60F 시련 종료 → 구역 3 (어두운 숲) 전환
      await zoneCurtain.show(ZONE_LIST[2], () => setZoneBackground(ZONE_LIST[2].bgUrl))
    } else {
      await bossController.run30F()
      // 30F 시련 종료 → 구역 2 (정원 풀밭) 전환
      await zoneCurtain.show(ZONE_LIST[1], () => setZoneBackground(ZONE_LIST[1].bgUrl))
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
    FORCED_TRIAL_CARDS.map(({ id, title, effect, spriteUrl }) => {
      // 시련 {{trial-spawn}} 토큰을 현 시점 실효 확률 변화량으로 치환한다.
      const resolvedEffect = effect.replace('{{trial-spawn}}', () => {
        const def = TRIAL_DEFINITIONS.find((d) => d.id === id)
        if (def?.effectKind.type === 'treasure-spawn-scale') {
          const pct = cardSpawner.trialScaleToPct(def.effectKind.factor)
          return `${pct >= 0 ? '+' : ''}${pct}%`
        }
        return ''
      })
      return { id, title, effect: resolvedEffect, spriteUrl }
    })
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
// BASE는 초반(랭크 1) 값을 현재(≈32)와 맞추고, PER_RANK는 후반 상승폭을 조절한다(낮을수록 완만).
const ENEMY_LIGHT_BASE = 17
const ENEMY_LIGHT_PER_RANK = 6
function scoreForCardRemoval(card: Card): number {
  if (card.type === CardType.ENEMY) {
    // 일반/특수(미믹·괴물꽃) 모두 강함수치(enemyPower) 단일 랭킹식으로 통일한다.
    // 미믹은 단계마다 2/4/6/8…, 합체 적/미믹/괴물꽃은 칸 수 배율로 불빛이 자연스럽게 오른다.
    const rankLight = ENEMY_LIGHT_BASE + Math.max(1, card.enemyPower) * ENEMY_LIGHT_PER_RANK
    // 그룹은 칸 수만큼 곱하되 25% 감산 — 단일보다 확실히 높되 배수 구조를 희석한다.
    if (card.groupCount > 1) return Math.round(rankLight * card.groupCount * 0.75)
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

/** 플레이어 기본 불빛 획득량 전체 상향 배율(약 +0.2x). 카드 처리/수확 등 행동 기반 불빛에만
 *  적용되며, gainFixedLight(별빛 랜턴 등 고정 유물 보너스)에는 적용하지 않는다. */
const BASE_LIGHT_GAIN_MULTIPLIER = 1.25

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
    if (companionWorldCanSpeak()) {
      const bark = companion.reactSituation('event', gameState.getCurrentTurn())
      if (bark) sayEnaBark(bark, { importance: BARK_IMPORTANCE.situation, situation: 'event' })
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

function fillBoardAtStart(): void {
  syncSpawnerTier()
  for (let distance = 0; distance < LANE_DISTANCE_COUNT; distance++) {
    // 전방 라인(distance 0)은 2칸 병합도 막아 즉시 2/3-lane 벽이 서지 않게 한다.
    // 후방 라인은 3칸 병합만 막아 ■ㅁ■ 고정 패턴을 피한다.
    const strict = distance === 0
    const isWaiting = distance > 0
    const cards = cardSpawner.spawnCardsForOpeningRow(gameState.lanes.length, strict, isWaiting)
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
  pendingPrediction = null
  gameState.reset()
  // 헌혈팩 콜백: reset 이후 새 character 인스턴스에 설정해야 한다
  gameState.character.onHealGain = (amount) => {
    if (gameState.character.hasRelic('blood-pack')) void applyBloodPackHit(amount)
  }
  cardSpawner.resetRelicModifiers()
  cardSpawner.resetSpawnState()
  // 비게임플레이(BGM)만 제외하고 잔여 상태를 모두 비운다: 체인 UID, 팩 세션, 디버그 이벤트, 말풍선.
  chainEventCounter = 0
  activePackSession = null
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
  // 보스/제단 게이트·시련·턴 모드·보스 컨트롤러 상태도 새 런을 위해 초기화한다.
  altarBossPending = false
  altarBossDefeated = false
  trialPending = false
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
  shopOpen = false
  currentShopOffers = []
  altarRelicPicked = false
  boardRenderer.closeShop()
  boardRenderer.resetShutter()
  syncSpawnerTier()
  boardRenderer.setHandTargetingMode(null)
  boardRenderer.clearSelection()
}

async function startGame(): Promise<void> {
  // 거점에서 출발할 때만 구역 커튼을 표시한다. 부팅 직행·재시작은 스킵.
  const showZoneCurtain = document.body.classList.contains('hearth-lobby')
  const dinnerRelicProfile = pendingDinnerRelicProfile
  resetForNewRun()
  pendingDinnerRelicProfile = dinnerRelicProfile
  // 런이 실제로 시작되므로 거점 로비에서 걸어 둔 말풍선 음소거를 해제한다(시작 대사 등 정상 출력).
  speechBubble.setMuted(false)
  // resetForNewRun이 거점 미리보기 유물을 지우므로, 만찬에서 만든 실제 유물은 런 시작 직후 재지급한다.
  if (pendingDinnerRelicProfile) {
    gameState.character.customRelicProfiles['last-supper'] = pendingDinnerRelicProfile
    if (gameState.character.addRelic('last-supper')) await applyRelicPurchaseEffect('last-supper')
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

  // 직업 선택 오버레이 — 플레이어 대사 전에 한 번만 선택한다.
  // 선택 카드는 화면 중앙으로 남고, 암막이 닫힌 동안 실제 3×3 레일을 준비한다.
  const chosenJobId = await boardRenderer.openJobSelect(JOBS)
  const chosenJob = JOBS.find((j) => j.id === chosenJobId)
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
    // 닫힌 암막 뒤에서 최초 보드를 채워, 레일 공개가 직업 선택의 후속 연출처럼 이어지게 한다.
    fillBoardAtStart()
    turnManager.armFrontBombs()
    // render()가 스폰 확률 패널/체력/공격력/화폐 카운터를 새 값으로 굴린다.
    render()
    // 중앙 고스트 카드가 적용된 능력을 HUD로 블라스트하며 소멸한다.
    await boardRenderer.animateJobCardToHud(chosenJob)
    await boardRenderer.playJobCurtainOpen()
  }

  // 1구역 커튼: 거점에서 출발한 경우만 표시 (부팅 직행·재시작은 스킵).
  if (showZoneCurtain) {
    void zoneCurtain.show(ZONE_LIST[0], () => setZoneBackground(ZONE_LIST[0].bgUrl))
  }

  // 1턴 시작 대사: 암막이 완전히 걷힌 뒤 살짝 딜레이 후 등장. 직업을 고른 경우 그에 맞는 인사.
  enaSpeaking = false
  const opening = chosenJob
    ? companion.onJobSelect(chosenJob.id)
    : '역경 아래, 작은 불빛을 밝혀야만 해.'
  speechBubble.show(opening, 800)
  const memoryLine = enaAutonomousLearner.recallLineForNewRun()
  if (memoryLine) {
    // 시작 인사를 덮지 않도록 한 박자 뒤, 플레이어가 보는 자연스러운 회상으로만 보여준다.
    window.setTimeout(() => {
      if (companionWorldCanSpeak()) sayEnaBark(memoryLine, { importance: BARK_IMPORTANCE.situation })
    }, 2200)
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
      <div class="dev-command-hint">예시: /시작, /부자, /상점, /제단, /시련, /25turn, /공격력7, /체력40, /희망, /양초, /1000불빛, /10$, /적, /보물, /씨앗, /함정, /이벤트, /이벤트1, /악마소환, /악마소환준비</div>
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

  // 모바일 전용 새로고침 버튼 (최하단). 아이콘은 작게, 터치 범위는 크게.
  const refreshBtn = document.createElement('button')
  refreshBtn.className = 'dev-refresh-mobile-btn'
  refreshBtn.setAttribute('aria-label', '새로고침')
  // 플랫 inline-SVG 원형 화살표(단색 stroke, currentColor) — Icons.ts 스타일 유지.
  refreshBtn.innerHTML = `
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
         stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v6h-6" />
    </svg>`
  refreshBtn.addEventListener('click', () => window.location.reload())
  document.body.appendChild(refreshBtn)

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
    .dev-command-mobile-btn { display: none; position: fixed; bottom: calc(8px + env(safe-area-inset-bottom)); left: max(4px, env(safe-area-inset-left)); width: 34px; height: 34px; border-radius: 9px; border: 1px solid rgba(255,215,120,.38); background: rgba(18,12,24,.88); color: rgba(255,215,120,.9); font: 900 17px/1 'OkDanDan', Georgia, serif; cursor: pointer; z-index: 141; align-items: center; justify-content: center; box-shadow: 0 2px 8px rgba(0,0,0,.5); }
    .dev-refresh-mobile-btn { display: none; position: fixed; top: calc(8px + env(safe-area-inset-top)); left: max(4px, env(safe-area-inset-left)); width: 34px; height: 34px; border-radius: 9px; border: 1px solid rgba(255,215,120,.38); background: rgba(18,12,24,.88); color: rgba(255,215,120,.9); cursor: pointer; z-index: 141; align-items: center; justify-content: center; box-shadow: 0 2px 8px rgba(0,0,0,.5); padding: 0; }
    /* 보이는 크기(34px)는 유지하되, 투명 ::before로 히트 영역만 크게 + 대칭으로 확장한다.
       엄지로 버튼 근처 어디를 눌러도 들어가게 한다(iPhone 사이드 잘림 보완). */
    .dev-command-mobile-btn::before,
    .dev-refresh-mobile-btn::before { content: ''; position: absolute; inset: -46px; }
    @media (hover: none) and (pointer: coarse) {
      .dev-command-run { display: block; }
      .dev-command-mobile-btn { display: flex; }
      .dev-refresh-mobile-btn { display: flex; }
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
    setHint('예시: /시작, /25turn, /공격력7, /체력40, /희망, /양초, /1000불빛, /10$, /적, /보물, /씨앗, /함정, /이벤트, /이벤트1, /악마소환, /악마소환준비, /랜덤유물, /랜덤손패')
    input.value = ''
    window.setTimeout(() => input.focus(), 0)
  }
  const execute = async (rawValue: string): Promise<void> => {
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
    // 이벤트N 커맨드: N번 이벤트가 고정 등장하는 문 칸을 스폰한다(테스트 전용).
    const fixedEventMatch = token.match(/^이벤트([1-9]\d*)$/)
    if (fixedEventMatch) {
      const idx = Number(fixedEventMatch[1]) - 1
      const id = EVENT_IDS[idx] as EventId | undefined
      if (!id) { setHint(`이벤트${idx + 1}번은 없습니다. (현재 ${EVENT_IDS.length}종)`); return }
      const topDistance = LANE_DISTANCE_COUNT - 1
      const laneIndex = Math.floor(Math.random() * gameState.lanes.length)
      gameState.lanes[laneIndex].setCardAtDistance(topDistance, cardSpawner.generateEventDoor())
      gameState.regroupAllRows()
      render()
      debugForcedEventId = id
      setHint(`디버그: 이벤트${idx + 1} (${id}) 칸을 ${laneIndex + 1}번 레인 맨 위에 스폰`)
      return
    }

    // 칸 스폰 디버그: 지정 종류 카드를 맨 위 대기행(distance 2)의 랜덤 한 칸에 박는다.
    // 이후 평소처럼 진행하면 그 칸이 하강·도착하는 과정을 그대로 검증할 수 있다.
    const spawnKindByAlias: Record<string, 'enemy' | 'trap' | 'treasure' | 'seed' | 'event'> = {
      '적': 'enemy', 'enemy': 'enemy',
      '함정': 'trap', 'trap': 'trap',
      '보물': 'treasure', 'treasure': 'treasure',
      '씨앗': 'seed', '꽃': 'seed', 'seed': 'seed',
      '이벤트': 'event', '문': 'event', 'event': 'event',
    }
    const spawnKind = spawnKindByAlias[token.toLowerCase()]
    if (spawnKind) {
      const topDistance = LANE_DISTANCE_COUNT - 1
      const laneIndex = Math.floor(Math.random() * gameState.lanes.length)
      gameState.lanes[laneIndex].setCardAtDistance(topDistance, cardSpawner.spawnDebugCard(spawnKind))
      gameState.regroupAllRows()
      render()
      setHint(`디버그: ${token} 칸을 ${laneIndex + 1}번 레인 맨 위 대기칸에 스폰`)
      return
    }
    const key = token.toLowerCase()
    const relicId = relicNameMap.get(key)
    if (relicId) {
      const ok = gameState.character.addRelic(relicId)
      if (ok) await applyRelicPurchaseEffect(relicId)
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
    // 악마 소환 레시피 즉시 발동 — 전체 연출 포함 (불길함 → 배너 임팩트 → 커튼 → 보스).
    if (key === '악마소환' || key === '악마 소환') {
      if (inputLocked || bossController.eventState || gameState.isGameOver) {
        setHint('현재 입력이 잠겨 있거나 보스 전투 중입니다.')
        return
      }
      close()
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
      return
    }
    // 악마 소환 준비 — 레시피 해금 + 필요 손패 4장 지급.
    if (key === '악마소환준비' || key === '악마 소환 준비') {
      gameState.unlockedRecipeIds.add('demon-summon')
      boardRenderer.setLockedRecipeIds(
        RECIPES.filter((r) => r.runLocked && !gameState.unlockedRecipeIds.has(r.id)).map((r) => r.id)
      )
      const ingredients: HandCardId[] = ['sacrifice-candle', 'ritual-candle', 'candle', 'ember']
      let added = 0
      for (const id of ingredients) {
        const ok = gameState.character.addHandCard(DropSystem.makeCard(id))
        if (ok) added++
      }
      render()
      setHint(`디버그: 악마 소환 레시피 해금 + 손패 ${added}장 지급 (${ingredients.map((id) => getHandCardDef(id).name).join('/')}`)
      return
    }
    // 랜덤 유물 10장 지급 (미보유·비차단 풀에서 셔플 후 순서대로)
    if (key === '랜덤유물' || key === '랜덤 유물') {
      const pool = RELIC_IDS
        .filter((id) => !gameState.character.hasRelic(id) && !relicPurchaseBlocked(id))
        .sort(() => Math.random() - 0.5)
      let added = 0
      for (const id of pool.slice(0, 10)) {
        if (gameState.character.addRelic(id)) {
          await applyRelicPurchaseEffect(id)
          added++
        }
      }
      render()
      setHint(`디버그: 랜덤 유물 ${added}장 지급`)
      return
    }
    // 랜덤 손패 10장 지급 (boss 전용 드롭 제외)
    if (key === '랜덤손패' || key === '랜덤 손패') {
      const pool = HAND_CARD_IDS.filter((id) => HAND_CARD_DEFINITIONS[id].dropSource !== 'boss')
      let added = 0
      for (let i = 0; i < 10; i++) {
        const id = pool[Math.floor(Math.random() * pool.length)]
        const ok = gameState.character.addHandCard(DropSystem.makeCard(id))
        if (ok) added++
      }
      render()
      setHint(`디버그: 랜덤 손패 ${added}장 지급`)
      return
    }
    // 거점(촛대) 진입. 빈 레일을 배경으로 거점 화면을 띄운다.
    if (/^(시작|start)$/i.test(token)) {
      close()
      enterHearth()
      return
    }
    // 디버그: 즉시 부유 — 불빛/화폐를 대량 지급한다.
    if (/^(부자|rich)$/i.test(token)) {
      score += 100_000_000
      coins += 1_000_000
      render()
      setHint('디버그: 불빛 +100,000,000 / 화폐 +1,000,000$')
      return
    }
    // 디버그: 상점/제단을 셔터 연출과 함께 즉시 연다(일반 방문과 동일 흐름).
    if (/^상점$/.test(token)) {
      if (inputLocked || shopOpen || gameState.isGameOver) { setHint('지금은 상점을 열 수 없습니다.'); return }
      close()
      await openShopOverlay('shop')
      return
    }
    if (/^제단$/.test(token)) {
      if (inputLocked || shopOpen || gameState.isGameOver) { setHint('지금은 제단을 열 수 없습니다.'); return }
      close()
      await openShopOverlay('altar')
      return
    }
    // 디버그: 강제 시련을 셔터 연출과 함께 즉시 연다.
    if (/^시련$/.test(token)) {
      if (inputLocked || shopOpen || gameState.isGameOver) { setHint('지금은 시련을 열 수 없습니다.'); return }
      close()
      inputLocked = true
      await boardRenderer.playShopTransition()
      await openTrialOverlayForced()
      inputLocked = false
      render()
      return
    }
    setHint('알 수 없는 명령어입니다. /시작, /부자, /상점, /제단, /시련, /25turn, /공격력7, /체력40, /1000불빛, /10$, /악마소환')
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
  bossBubble.completeTyping()
  eventDemonBubble.completeTyping()
  const onProfile = (e.target as HTMLElement | null)?.closest('.player-card')
  if (speechBubble.isTyping) {
    speechBubble.completeTyping() // 1단계: 빨리감기(타이핑 즉시 완성 = 읽는 행위)
    // 빨리감겨 전체가 막 떴으므로, 출력 직후처럼 잠깐은 스킵을 막는다(더블클릭 즉시 스킵 방지).
    barkSkipLockUntil = Date.now() + BARK_SKIP_GRACE_MS
    return
  }
  if (!speechBubble.isShowing || onProfile) return
  // 출력/빨리감기 직후 유예 동안엔 스킵(닫기)을 무시한다 — 고정 대사처럼 살짝의 딜레이.
  if (Date.now() < barkSkipLockUntil) return
  // 2단계: 카드가 아닌 곳을 눌러 스킵. 단, '안 읽고 빨리 따닥 넘긴' 경우만 학습 스킵으로 본다.
  const skippedUnread = currentBarkSituation !== null && Date.now() - barkShownAt < COMPANION_READ_MS
  if (skippedUnread) {
    companion.recordSkip(currentBarkSituation!)
    clearTimeout(companionHeardTimer)
    companionHeardTimer = 0
    const remark = companion.maybeQuietRemark()
    currentBarkSituation = null
    speechBubble.dismiss()
    // 과묵 안내 대사는 스킵 직후 조용히 한 번(낮은 중요도).
    if (remark && companionWorldCanSpeak()) sayEnaBark(remark, { importance: BARK_IMPORTANCE.touch })
    return
  }
  currentBarkSituation = null
  speechBubble.dismiss()
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

document.addEventListener('shopPackReroll', (e: Event) => {
  void handleShopPackReroll((e as CustomEvent<{ packKind: ShopPackKind }>).detail.packKind)
})

document.addEventListener('shopPackPass', () => {
  activePackSession = null
  boardRenderer.closePackPicker()
  boardRenderer.openShop(buildShopStateView(), score, gameState.character)
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
  applyHonestyHandUse(1)
  // 동료(에나) 손패 사용 한줄평 — 가끔 그 카드의 능력에 대해 한마디.
  if (usedDef && companionWorldCanSpeak()) {
    const bark = companion.onUseCard(usedDef.id, usedDef.category, gameState.getCurrentTurn())
    if (bark) sayEnaBark(bark, { importance: BARK_IMPORTANCE.loot })
  }
  // 예측 대비 RL: 에나가 건넨 손패가 '곧바로/위기 타이밍에' 실제 효과를 냈는지 점수화한다.
  if (
    usedDef &&
    pendingPrediction &&
    pendingPrediction.cardIds.includes(usedDef.id) &&
    gameState.getCurrentTurn() <= pendingPrediction.deadlineTurn
  ) {
    const turnsHeld = Math.max(0, gameState.getCurrentTurn() - pendingPrediction.issuedTurn)
    const removedHazards = result.removedFieldCards.filter((c) => c.type === CardType.TRAP).length
    const immediateTimingBonus = turnsHeld === 0 ? 0.35 : turnsHeld === 1 ? 0.2 : 0
    const cleanupImpactBonus = usedDef.id === 'sweep' || usedDef.id === 'chitin' ? Math.min(0.45, removedHazards * 0.15) : 0
    const crisisTimingBonus = pendingPrediction.kind === 'cleanup' && removedHazards > 0 ? 0.25 : 0
    companion.recordPredictionOutcome(0.75 + immediateTimingBonus + cleanupImpactBonus + crisisTimingBonus)
    pendingPrediction = null
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
    applyBlindFaithCoins(result.coinsGained)
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
    applyAnomalyHealthLoss()
    applyDemonDollSelfDamage(result.selfDamage)
    if (!gameState.character.isAlive() && !gameState.character.authoritySurvivePending) {
      gameState.endGame('character_defeated')
      if (!(await tryResolveSurvivalRelics())) finishTurn()
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

  // Light for any field cards the hand-card effect just removed (kill / clear
  // / grab). Same strength formula as direct clicks, so 손패 사용 도 "직접
  // 타격" 과 동일한 점수 룰을 따른다.
  // 청소(단일)는 불빛 없음 규칙으로 점수를 부여하지 않는다.
  if (!result.suppressScoreForRemovedCards) {
    await awardScoreForRemovedCards(result.removedFieldCards, beforeSingleCards)
  }

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
        await onEnemiesDefeated(
          repeatResult.removedFieldCards.filter((r) => r.type === CardType.ENEMY).length
        )
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
    if (teapotEnemiesKilled > 0) await onEnemiesDefeated(teapotEnemiesKilled)
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
    if ((recipeResult.coinsGained ?? 0) > 0) {
      // Recipe currency uses the same wallet/pulse language as single coin cards.
      const gainedCoins = recipeResult.coinsGained ?? 0
      coins += gainedCoins
      coinPulseKey++
      applyBlindFaithCoins(gainedCoins)
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
        await onEnemiesDefeated(1)
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
  const hits = turnManager.runEnemyPhase({ shouldDodge: ({ damage }) => tryCompanionIncomingDodge(damage) })
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
  applyAnomalyHealthLoss()

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
      if (ember === 4) { enaSpeaking = false; speechBubble.show('불씨가 약해지고 있어. . .') }
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

  // 이벤트 문 독립 PRD 롤: 실제 턴 전진 시에만, 보스·최종등반 중엔 중단.
  // 당장 주입 못 해도 pendingEventDoor=true로 보류하면 다음 빈 슬롯에 자동 주입된다.
  if (advanceTurn && !gameState.bossBattleActive && !finalAscentStarlightRuleActive &&
      eventSpawnCtrl.rollForTurn(gameState.getCurrentTurn())) {
    pendingEventDoor = true
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
  await sweepFrontStarlights()
  await tickFrontEventDoors()
  // 보드 정비가 끝나 플레이어 차례 직전 — 위협을 미리 읽어 대비 카드를 건넨다.
  if (advanceTurn) await tryCompanionPrediction()
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
  if (spreadCount > 0 && companionWorldCanSpeak()) {
    const bark = companion.reactSituation('spore', gameState.getCurrentTurn())
    if (bark) sayEnaBark(bark, { importance: BARK_IMPORTANCE.situation, situation: 'spore' })
  }
  render()
}

async function resolveEventPhaseAndPrepareNextTurn(advanceTurn: boolean = true): Promise<void> {
  const beforeTrapHealth = snapshotFieldHealthState()
  const hits = turnManager.runEnemyPhase({ shouldDodge: ({ damage }) => tryCompanionIncomingDodge(damage) })
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
  // 동료(에나) 피격 반응 — 확률+쿨다운으로 강약 조절(위급하면 더 다급한 말투).
  if (totalDamage > 0 && companionWorldCanSpeak()) {
    const danger = companionInDanger()
    const line = companion.reactSituation('hit', gameState.getCurrentTurn(), danger ? 'urgent' : undefined, danger)
    if (line) {
      sayEnaBark(line, {
        importance: danger ? BARK_IMPORTANCE.urgent : BARK_IMPORTANCE.situation,
        situation: 'hit',
      })
    }
  }
  // 폭탄 폭발 반응 바크.
  if (bombExplosions.length > 0 && companionWorldCanSpeak()) {
    const bark = companion.reactSituation('bomb', gameState.getCurrentTurn())
    if (bark) sayEnaBark(bark, { importance: BARK_IMPORTANCE.situation, situation: 'bomb' })
  }
  // 클러치 예산('에나의 의지') 충전: 이번 페이즈 역경(피해/불씨 고갈)에 비례.
  if (totalDamage > 0) companion.gainWill(totalDamage, gameState.character.maxHealth)
  if (gameState.character.ember <= 1) companion.gainWillFlat(15)
  // 회피 클러치는 TurnManager.runEnemyPhase의 공격 판정 순간에 처리된다.

  // 소소한 클러치 — 반격: 회피와 달리 피해는 받은 뒤, 공격력 기반으로 공격자를 되친다.
  if (totalDamage > 0 && companionWorldCanSpeak() && companion.rollMinorClutch('counter', { adversity: totalDamage >= Math.max(3, gameState.character.maxHealth * 0.25), bond: true })) {
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
      showClutchChain('counter', `반격 피해 ${counterDamage}`)
      sayEnaBark(companion.minorClutchLine('counter'), { importance: BARK_IMPORTANCE.clutch })
      await boardRenderer.animateDamageNumbersById(damaged)
      if (killedIds.length > 0) {
        await boardRenderer.animateCardConsumeByIds(killedIds.map((cardId) => ({ cardId, type: CardType.ENEMY })), { suppressBurstIds: new Set(killedIds) })
        await onEnemiesDefeated(killedIds.length)
      }
      render()
    }
  }
  // 품격있는 대처: 피격 연출 뒤 나를 때린 적들에게 반격.
  await applyDignifiedRetaliation(hits)
  // 변칙: 이 페이즈에서 잃은 체력 10마다 불씨 +1.
  applyAnomalyHealthLoss()
  // 소중한 머리: 체력이 절반 이하이면 전체 회복 후 파괴.
  await applyPreciousHeadCheck()
  // 동료(에나) 클러치: 위기에 의지가 가득 찼으면 실제 지원 + '에나의 의지' 체인.
  tryCompanionClutch()
  if (gameState.isGameOver || gameState.character.authoritySurvivePending) {
    const authorityFired = gameState.character.authoritySurvivePending
    if (await tryResolveSurvivalRelics()) {
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
async function playEventDialogueLine(line: EventDialogueLine): Promise<void> {
  const bubble = line.speaker === 'player' ? speechBubble : eventDemonBubble
  const otherBubble = line.speaker === 'player' ? eventDemonBubble : speechBubble
  await playDialogueLine(bubble, otherBubble, line.text)
}

/** 이벤트 문 클릭 → 불빛/행동 없이 이벤트 진입(대사 → 선택 → 효과). 진입 동안 손패/칸
 *  선택을 잠그고, 선택 효과를 적용한 뒤 버튼→HUD 획득 블라스트를 쏘고 커튼을 열어 마무리한다.
 *  이벤트 진입은 런 턴을 올리지 않는다(상점처럼 막간 상호작용). */
async function handleEventDoorClick(lane: Lane, card: Card): Promise<void> {
  inputLocked = true
  // 이벤트 진입 시 진행 중인 체인을 즉시 끊는다.
  if (chainTimeline.length > 0) {
    HandSystem.resetChain(chain)
    clearChainTimeline()
    boardRenderer.refreshChainBanner(buildChainHints())
  }
  // 레일 안정화: 적 턴 없이 빈칸 낙하·전방 병합만 실행한다.
  // 꽃 성장·포자 감소·적 공격·상자 소멸 등 적 처리 로직은 건드리지 않는다.
  {
    let anyMoved = false
    let safety = LANE_DISTANCE_COUNT * 3 + 3
    while (safety-- > 0) {
      const moved = gameState.compactLanes()
      if (!moved) break
      anyMoved = true
      gameState.regroupAllRows()
      turnManager.armFrontBombs()
      render()
      await wait(200)
    }
    if (anyMoved) {
      gameState.regroupAllRows()
      render()
      await wait(340)
    }
  }
  // 디버그 커맨드로 고정 이벤트가 예약된 경우 그것을 사용하고, 아니면 랜덤 선택.
  const def = debugForcedEventId ? getEventDef(debugForcedEventId) : pickEventForDoor()
  debugForcedEventId = null
  const emberAvailable = gameState.character.hand.some((h) => h.defId === 'ember')
  // 대사는 게임의 말풍선 시스템으로 출력한다. NPC 말풍선은 하단 배치/상단 꼬리로,
  // 클릭 시 타이핑 완료 또는 다음 줄 스킵이 가능하게 보스/플레이어 대사와 같은 촉감을 맞춘다.
  const playDialogue = async (lines: readonly EventDialogueLine[] = def.dialogue): Promise<void> => {
    for (const ln of lines) await playEventDialogueLine(ln)
    speechBubble.dismiss()
    eventDemonBubble.dismiss()
  }
  const { index, buttonRect } = await boardRenderer.runEventEntry(card.id, def, emberAvailable, () => {
    // 문 소비: 레일에서 제거(불빛 미지급). 커튼 뒤에서 제거돼 빈칸 노출이 없다.
    lane.setCardAtDistance(0, null)
    render()
  }, playDialogue)
  // 불태우기(combat) 선택 시: 소비될 손패 불씨를 model 제거 전에 소각 연출.
  const choiceEffect = def.choices[index]?.effect
  if (choiceEffect?.kind === 'combat') {
    const burnIdx = gameState.character.hand.findIndex((h) => h.defId === choiceEffect.consumeHand)
    if (burnIdx >= 0) await boardRenderer.animateHandCardBurn(burnIdx)
  }
  // 선택 효과 적용 → HUD 갱신 → 눌린 버튼에서 해당 HUD로 획득 블라스트.
  const targets = applyEventChoice(def, index)
  render()
  await boardRenderer.playEventGainBlast(buttonRect, targets)
  await boardRenderer.hideEventChoicesAfterSelection(index)
  await playDialogue(def.choices[index]?.afterDialogue ?? [])
  // combat + 레시피 해금: 마무리 대사 직후 해금 카드 연출 → 도감으로 블라스트.
  if (choiceEffect?.kind === 'combat' && choiceEffect.unlocksRecipe) {
    const recipe = RECIPES.find((r) => r.id === choiceEffect.unlocksRecipe)
    if (recipe) {
      const ingredientText = Object.keys(recipe.ingredients)
        .map((id) => getHandCardDef(id as Parameters<typeof getHandCardDef>[0])?.name ?? id)
        .join(' + ')
      await boardRenderer.animateEventRecipeUnlock(recipe.id, recipe.name, recipe.flavor, ingredientText)
    }
  }
  await boardRenderer.closeEventEntry()
  // 종료: 소비된 칸을 메우고 일반 진행으로 복귀한다.
  compactAndRefillAllLanes()
  gameState.regroupAllRows()
  trackFieldEnemyEncounters()
  turnManager.armFrontBombs()
  // 이벤트는 턴을 올리지 않으므로 포자·성장·시듦 틱은 건너뛴다.
  // 씨앗 개화는 위치 기반 트리거(전방 도달)이므로 이벤트 후에도 처리한다.
  const blooms = turnManager.bloomFrontSeeds(cardSpawner)
  // 리필로 새 이벤트 문이 전방에 도달했다면 일반 턴과 동일하게 즉시 카운트다운 뱃지를 띄운다.
  const startedEventDoors = turnManager.startFrontEventDoorArrivals()
  render()
  for (const t of startedEventDoors) boardRenderer.popEventBadge(t.cardId)
  if (blooms.length > 0) await boardRenderer.animateFlowerBlooms(blooms)
  inputLocked = false
}

/** 이벤트 선택 효과를 게임 상태에 적용하고, 획득 블라스트를 쏠 HUD 타깃 목록을 돌려준다. */
function applyEventChoice(def: EventDefinition, index: number): string[] {
  const character = gameState.character
  const choice = def.choices[index]
  const effect = choice.effect
  if (effect.kind === 'stat') {
    const targets: string[] = []
    if (effect.maxHealth) {
      if (effect.maxHealth < 0) character.spendMaxHealth(-effect.maxHealth)
      else character.increaseMaxHealth(effect.maxHealth)
      targets.push('health')
    }
    if (effect.damage) {
      character.applyDamageBoost(effect.damage)
      targets.push('attack')
    }
    recordNotice(`이벤트: ${choice.label} 선택`, 'info')
    return targets
  }
  if (effect.kind === 'randomHand') {
    let added = 0
    for (const drop of DropSystem.generateDrops(effect.count)) {
      if (character.addHandCard(drop)) added++
    }
    recordNotice(`이벤트: ${choice.label} — 랜덤 손패 +${added}`, 'info')
    return ['hand']
  }
  // combat: 손패 불씨를 소모하고 레시피를 해금한다.
  const idx = character.hand.findIndex((h) => h.defId === effect.consumeHand)
  if (idx >= 0) character.removeHandCardAt(idx)
  if (effect.unlocksRecipe) {
    gameState.unlockedRecipeIds.add(effect.unlocksRecipe)
    // 도감 레시피 잠금 상태도 즉시 동기화한다.
    boardRenderer.setLockedRecipeIds(
      RECIPES.filter((r) => r.runLocked && !gameState.unlockedRecipeIds.has(r.id)).map((r) => r.id)
    )
  }
  recordNotice(`이벤트: 불태우기 — ${effect.unlocksRecipe ? '레시피 해금됨' : '위험한 기운이 깨어난다'}`, 'hurt')
  return []
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

  // 이벤트 문 클릭: 불빛/행동 없이 이벤트 진입 연출로 분기한다(전방 도달 칸만 클릭 가능).
  if (card.type === CardType.EVENT) {
    await handleEventDoorClick(lane, card)
    return
  }

  const actionType = actionTypeFor(card.type)
  if (!actionType) return

  inputLocked = true

  if (turnManager.isEnemyFirstStrike()) {
    const hits = turnManager.runEnemyPhase({ shouldDodge: ({ damage }) => tryCompanionIncomingDodge(damage) })
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
      await applyDignifiedRetaliation(hits)
      // 변칙: 선공으로 잃은 체력 10마다 불씨 +1.
      applyAnomalyHealthLoss()
      // 소중한 머리: 선공 피해로 체력 절반 이하 시 전체 회복.
      await applyPreciousHeadCheck()
      if (!gameState.character.isAlive() || gameState.isGameOver || gameState.character.authoritySurvivePending) {
        if (await tryResolveSurvivalRelics()) {
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
        applyBlindFaithCoins(result.flowerReward.amount)
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
    companionWorldCanSpeak() &&
    companion.rollMinorClutch('trap', { adversity: result.damageTaken >= Math.max(3, gameState.character.maxHealth * 0.25), bond: true })
  ) {
    gameState.character.health = Math.min(
      gameState.character.maxHealth,
      gameState.character.health + result.damageTaken
    )
    gameState.character.shield = beforeActionResources.shield
    companionTrapIgnored = true
  }

  if (result.damageTaken && result.damageTaken > 0 && !companionTrapIgnored) {
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
    applyAnomalyHealthLoss()
    // 소중한 머리: 함정 피해로 체력 절반 이하 시 전체 회복.
    await applyPreciousHeadCheck()
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
    showClutchChain('trap', '함정 피해 무시')
    sayEnaBark(companion.minorClutchLine('trap'), { importance: BARK_IMPORTANCE.clutch })
  }
  // 달콤한 유혹: 함정 제거 시 기본 불빛의 30% 추가 획득. 무효화 시 미발동.
  if (result.cardRemoved && card.type === CardType.TRAP && !result.trapIgnored && gameState.character.hasRelic('sweet-temptation')) {
    const baseLight = scoreForCardRemoval(card)
    const bonus = Math.max(1, Math.ceil(baseLight * 0.3))
    const gained = gainFixedLight('달콤한 유혹', bonus)
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
  if (card.type === CardType.ENEMY) await applyGreatNegotiationOnAttack()

  if (result.cardRemoved && card.type === CardType.ENEMY) {
    // 자물쇠: 미믹 처치 시 불빛 +25% + 손패 +1.
    if (card.isSpecialEnemy) await applyPadlockMimicBonus(card)
    await onEnemiesDefeated(1)
  }

  // 찬스: 적이 살아있을 때만 15% 확률 추가 타격.
  if (!result.cardRemoved && card.type === CardType.ENEMY) {
    await applyChanceExtraHit(card, distance)
    // 물양동이: 25% 확률로 1 추가 피해 (찬스로 처치된 경우 이미 제거되므로 health 확인).
    await applyWaterBucketExtraDamage(card, distance)
    // 소소한 클러치 — 급소: 살아남은 적에게 가끔 추가 피해.
    await applyCompanionCrit(card, distance)
  }

  // 소소한 클러치 — 보물 추가 보상: 상자를 열 때 가끔 손패 1장을 덤으로.
  if (result.cardRemoved && card.type === CardType.TREASURE && companionWorldCanSpeak()) {
    const treasureClutch = companion.rollMinorClutch('treasure', { adversity: !result.itemGainedIds?.length, bond: true })
    if (treasureClutch) {
      const drop = DropSystem.generateDrop('treasure')
      if (gameState.character.addHandCard(drop)) {
        recordNotice('에나의 의지 — 덤! 손패 +1', 'info')
        void boardRenderer.animateClutchOnPlayer('treasure-gain')
        showClutchChain('treasure', '손패 +1')
        sayEnaBark(companion.minorClutchLine('treasure'), { importance: BARK_IMPORTANCE.clutch })
        render()
      }
    } else if (!result.itemGainedIds?.length) {
      // 보물에서도 '찾지 못한 가능성'을 말로만 비춰, 초기 미숙함을 거미줄 밖으로 확장한다.
      const missed = companion.missedPotentialLine('treasure', gameState.getCurrentTurn())
      if (missed) sayEnaBark(missed, { importance: BARK_IMPORTANCE.situation, situation: 'treasure' })
    }
  }

  // 동료(에나) 행동 반응 — 손패 한줄평(획득 카드) 우선, 없으면 카드 종류별 상황 바크.
  // 확률+쿨다운으로 한 행동에 한 번만, 너무 수다스럽지 않게 강약을 준다.
  if (companionWorldCanSpeak()) {
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
      sayEnaBark(loot, { importance: BARK_IMPORTANCE.loot })
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
        if (bark) sayEnaBark(bark, { importance: BARK_IMPORTANCE.situation, situation: sit })
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
    await tryResolveSurvivalRelics()
  }
  if (!gameState.character.isAlive()) {
    gameState.endGame('character_defeated')
    if (await tryResolveSurvivalRelics()) {
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
      if (await tryResolveSurvivalRelics()) {
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
    // 새로고침 대신 startGame()으로 초기화한다(추후 로비 시스템 연동 대비). startGame이
    // 카드 풀/드롭 풀/도감 잠금까지 메타 기준으로 되돌려 새로고침과 같은 완전 초기화를 만든다.
    overlay.remove()
    void startGame()
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
    /* 콤보 게이지 휠(z-index 120)·셔터(470) 등 모든 보드 오버레이 위를 덮어야 패배 화면에서
       콤보 버튼이 튀어나오지 않는다. */
    z-index: 1000;
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
void startGame()
