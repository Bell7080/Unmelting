/**
 * DevCommandPalette — `/` 커맨드 팔레트 매니저.
 * DOM/파싱/도움말은 여기서 소유하고, 런 상태를 건드리는 동작은 전부 deps 콜백으로 위임한다.
 * (index.ts가 컴포지션 루트로서 실제 상태 변이를 담당한다.)
 */

import { GameState } from '@core/GameState'
import { CardSpawner } from '@systems/CardSpawner'
import { GameBoardRenderer } from '@ui/GameBoardRenderer'
import { HearthScene, HEARTH_DEV_UNLOCK_KEY } from '@ui/hearth/HearthScene'
import { DropSystem } from '@systems/DropSystem'
import { LANE_DISTANCE_COUNT } from '@entities/Lane'
import { EVENT_IDS, type EventId } from '@data/Events'
import { HAND_CARD_DEFINITIONS, HAND_CARD_IDS, getHandCardDef } from '@data/HandCards'
import { RELIC_IDS, getRelicDef, type RelicId } from '@data/Relics'
import { RECIPES } from '@data/Recipes'
import type { HandCardId } from '@entities/HandCard'
import { ENA_DISPOSITION_STORAGE_KEY } from '@systems/EnaDisposition'
import { ENA_SELF_LEARNING_STORAGE_KEY } from '@/rl/EnaAutonomousLearner'
import { ENA_POLICY_STORAGE_KEY } from '@/rl/EnaPolicyStore'

/** 팔레트가 런 상태를 조작할 때 쓰는 주입 계약 — 상태 소유는 index.ts에 남긴다. */
export interface DevCommandPaletteDeps {
  gameState: GameState
  cardSpawner: CardSpawner
  boardRenderer: GameBoardRenderer
  hearthScene: HearthScene
  render(): void
  syncSpawnerTier(): void
  /** 불빛 지급 후 총액 반환(힌트 표기용). */
  addScore(amount: number): number
  /** 화폐 지급 후 총액 반환(힌트 표기용). */
  addCoins(amount: number): number
  setDebugForcedEventId(id: EventId): void
  applyRelicPurchaseEffect(id: RelicId): Promise<void>
  relicPurchaseBlocked(id: RelicId): boolean
  /** 악마 소환 디버그 가드 — 입력 잠금/보스전/게임오버면 true. */
  demonSummonBlocked(): boolean
  /** 악마 소환 전체 연출 플로우(입력 잠금 포함) — index.ts가 소유. */
  runDemonSummonDebug(): Promise<void>
  enterHearth(): void
  finishTurn(): void
  openShopOverlay(mode: 'shop' | 'altar'): Promise<void>
  openTrialOverlayForced(): Promise<void>
  isInputLocked(): boolean
  setInputLocked(locked: boolean): void
  isShopOpen(): boolean
}

export function setupDevCommandPalette(deps: DevCommandPaletteDeps): void {
  const { gameState, cardSpawner, boardRenderer, hearthScene } = deps
  const host = document.createElement('div')
  host.className = 'dev-command-palette'
  host.innerHTML = `
    <div class="dev-command-shell">
      <span class="dev-command-prefix">/</span>
      <input class="dev-command-input" type="text" spellcheck="false" autocomplete="off" />
      <button class="dev-command-close" aria-label="닫기">✕</button>
      <div class="dev-command-hint">예시: /시작, /리셋, /부자, /상점, /제단, /시련, /25turn, /공격력7, /체력40, /희망, /양초, /1000불빛, /10$, /적, /보물, /씨앗, /함정, /이벤트, /이벤트1, /악마소환, /악마소환준비</div>
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
    .dev-command-hint { grid-area: hint; color: rgba(232,214,180,.78); font-size: 12px; display: flex; flex-wrap: wrap; gap: 4px 12px; max-height: 96px; overflow-y: auto; }
    .dev-cmd-item { white-space: nowrap; color: rgba(226,210,182,.72); }
    .dev-cmd-item b { color: rgba(255,215,120,.94); font-weight: 900; margin-right: 3px; }
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
  // 칠 수 있는 명령어 목록 — /를 치면 하단에 도움말로 뜨고, 입력 중엔 일치 항목만 좁혀 보여준다.
  const DEV_COMMANDS: { name: string; desc: string }[] = [
    { name: '시작', desc: '거점(로비) 진입' },
    { name: '개방', desc: '거점 모든 칸 강제 개방' },
    { name: '잠금', desc: '거점 개방 해제(모험/무역만)' },
    { name: '리셋', desc: '에나 경험 초기화' },
    { name: '부자', desc: '불빛/화폐 대량 지급' },
    { name: '상점', desc: '상점 열기' },
    { name: '제단', desc: '제단 열기' },
    { name: '시련', desc: '강제 시련 열기' },
    { name: '사망', desc: '즉시 사망(정산 화면 점검)' },
    { name: '승리', desc: '즉시 100F 클리어(정산 화면 점검)' },
    { name: '25turn', desc: 'N턴 이동(1~100)' },
    { name: '공격력7', desc: '공격력 설정' },
    { name: '체력40', desc: '체력 설정' },
    { name: '1000불빛', desc: '불빛 N 지급' },
    { name: '10$', desc: '화폐 N 지급' },
    { name: '적', desc: '적 스폰' },
    { name: '보물', desc: '보물 스폰' },
    { name: '씨앗', desc: '씨앗 스폰' },
    { name: '함정', desc: '함정 스폰' },
    { name: '이벤트', desc: '이벤트 문 스폰' },
    { name: '악마소환', desc: '악마 보스 소환' },
    { name: '랜덤유물', desc: '랜덤 유물 지급' },
    { name: '랜덤손패', desc: '랜덤 손패 지급' },
  ]
  const renderHelp = (raw: string): void => {
    const q = raw.trim().replace(/^\/+/, '').toLowerCase()
    // 숫자로 시작하면 수치형 명령(불빛/턴/$)이 후보이므로 전부 보여준다.
    const matches = q && !/^\d/.test(q) ? DEV_COMMANDS.filter((c) => c.name.toLowerCase().includes(q)) : DEV_COMMANDS
    const shown = matches.slice(0, 10)
    hint.innerHTML = shown.length
      ? shown.map((c) => `<span class="dev-cmd-item"><b>/${c.name}</b> ${c.desc}</span>`).join('')
      : '일치하는 명령어가 없습니다.'
  }
  const close = (): void => { opened = false; host.classList.remove('is-open'); input.value = '' }
  const open = (): void => {
    opened = true
    host.classList.add('is-open')
    renderHelp('')
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
      const total = deps.addScore(amount)
      deps.render()
      setHint(`디버그: 불빛 +${amount.toLocaleString()} (현재 ${total.toLocaleString()})`)
      return
    }
    const coinGrantMatch = token.match(/^(\d{1,7})\s*(\$|화폐|코인|coin|coins)$/i)
    if (coinGrantMatch) {
      const amount = Number(coinGrantMatch[1])
      if (!Number.isFinite(amount) || amount <= 0) { setHint('화폐 지급량은 1 이상이어야 합니다.'); return }
      const total = deps.addCoins(amount)
      deps.render()
      setHint(`디버그: 화폐 +${amount.toLocaleString()}$ (현재 ${total.toLocaleString()}$)`)
      return
    }
    const turnMatch = token.match(/^(\d{1,3})\s*turn$/i)
    if (turnMatch) {
      const turn = Number(turnMatch[1])
      if (!Number.isFinite(turn) || turn < 1 || turn > 100) { setHint('턴 이동은 1~100 범위만 가능합니다.'); return }
      gameState.setCurrentTurnForDebug(turn)
      deps.syncSpawnerTier()
      deps.render()
      setHint(`디버그: ${turn}턴으로 이동`)
      return
    }
    const attackSetMatch = token.match(/^공격력\s*(\d{1,4})$/i)
    if (attackSetMatch) {
      const amount = Number(attackSetMatch[1])
      if (!Number.isFinite(amount) || amount < 1) { setHint('공격력은 1 이상이어야 합니다.'); return }
      // 디버그 명령은 누적 증가가 아니라 현재 공격력을 지정값으로 맞춘다.
      gameState.character.setDamageForDebug(amount)
      deps.render()
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
      deps.render()
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
      deps.render()
      deps.setDebugForcedEventId(id)
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
      deps.render()
      setHint(`디버그: ${token} 칸을 ${laneIndex + 1}번 레인 맨 위 대기칸에 스폰`)
      return
    }
    const key = token.toLowerCase()
    const relicId = relicNameMap.get(key)
    if (relicId) {
      const ok = gameState.character.addRelic(relicId)
      if (ok) await deps.applyRelicPurchaseEffect(relicId)
      deps.render()
      setHint(ok ? `디버그: 유물 지급 (${getRelicDef(relicId).name})` : '이미 보유 중이거나 지급할 수 없습니다.')
      return
    }
    const handId = handNameMap.get(key)
    if (handId) {
      const ok = gameState.character.addHandCard(DropSystem.makeCard(handId))
      deps.render()
      setHint(ok ? `디버그: 손패 지급 (${getHandCardDef(handId).name})` : '손패가 가득 찼습니다.')
      return
    }
    // 악마 소환 레시피 즉시 발동 — 전체 연출 포함 (불길함 → 배너 임팩트 → 커튼 → 보스).
    if (key === '악마소환' || key === '악마 소환') {
      if (deps.demonSummonBlocked()) {
        setHint('현재 입력이 잠겨 있거나 보스 전투 중입니다.')
        return
      }
      close()
      await deps.runDemonSummonDebug()
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
      deps.render()
      setHint(`디버그: 악마 소환 레시피 해금 + 손패 ${added}장 지급 (${ingredients.map((id) => getHandCardDef(id).name).join('/')}`)
      return
    }
    // 랜덤 유물 10장 지급 (미보유·비차단 풀에서 셔플 후 순서대로)
    if (key === '랜덤유물' || key === '랜덤 유물') {
      const pool = RELIC_IDS
        .filter((id) => !gameState.character.hasRelic(id) && !deps.relicPurchaseBlocked(id))
        .sort(() => Math.random() - 0.5)
      let added = 0
      for (const id of pool.slice(0, 10)) {
        if (gameState.character.addRelic(id)) {
          await deps.applyRelicPurchaseEffect(id)
          added++
        }
      }
      deps.render()
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
      deps.render()
      setHint(`디버그: 랜덤 손패 ${added}장 지급`)
      return
    }
    // 거점(촛대) 진입. 빈 레일을 배경으로 거점 화면을 띄운다.
    if (/^(시작|start)$/i.test(token)) {
      close()
      deps.enterHearth()
      return
    }
    // 개발용: 거점의 모든 칸을 강제 개방한다(로컬 저장). 거점 화면이 떠 있으면 즉시 재구성한다.
    if (/^(개방|unlock)$/i.test(token)) {
      localStorage.setItem(HEARTH_DEV_UNLOCK_KEY, '1')
      close()
      if (document.getElementById('hearth-overlay')) {
        hearthScene.exit()
        deps.enterHearth()
      }
      setHint('디버그: 거점 모든 칸 개방')
      return
    }
    // 개발용: 거점 강제 개방을 해제해 실제 해금 조건(모험/무역만)으로 되돌린다.
    if (/^(잠금|lock)$/i.test(token)) {
      localStorage.removeItem(HEARTH_DEV_UNLOCK_KEY)
      close()
      if (document.getElementById('hearth-overlay')) {
        hearthScene.exit()
        deps.enterHearth()
      }
      setHint('디버그: 거점 개방 해제(모험/무역만)')
      return
    }
    // 전체 진행 초기화: 에나 경험(성향/자기학습/정책망)뿐 아니라 통산 기록·메타 해금(무역)·
    // 거점 기억(마지막 캐릭터/난이도·개발 개방)·첫 조우 기록까지 — 'unmelting.' 접두사 저장을
    // 통째로 지워, 새 진행도 키가 추가돼도 리셋에서 빠지지 않게 한다(에나 성향 키만 구형
    // 이름이라 별도 나열). 부팅 시점에 로드된 상태를 되돌리려면 재부팅이 필요하다.
    if (/^(리셋|reset)$/i.test(token)) {
      const doomed = new Set<string>([ENA_DISPOSITION_STORAGE_KEY, ENA_SELF_LEARNING_STORAGE_KEY, ENA_POLICY_STORAGE_KEY])
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key?.startsWith('unmelting.')) doomed.add(key)
      }
      for (const storageKey of doomed) localStorage.removeItem(storageKey)
      setHint('모든 진행(에나 경험·해금·통산 기록·거점 상태)을 초기화했습니다. 새로 시작합니다…')
      window.setTimeout(() => window.location.reload(), 700)
      return
    }
    // 디버그: 즉시 부유 — 불빛/화폐를 대량 지급한다.
    if (/^(부자|rich)$/i.test(token)) {
      deps.addScore(100_000_000)
      deps.addCoins(1_000_000)
      deps.render()
      setHint('디버그: 불빛 +100,000,000 / 화폐 +1,000,000$')
      return
    }
    // 디버그: 상점/제단을 셔터 연출과 함께 즉시 연다(일반 방문과 동일 흐름).
    if (/^상점$/.test(token)) {
      if (deps.isInputLocked() || deps.isShopOpen() || gameState.isGameOver) { setHint('지금은 상점을 열 수 없습니다.'); return }
      close()
      await deps.openShopOverlay('shop')
      return
    }
    if (/^제단$/.test(token)) {
      if (deps.isInputLocked() || deps.isShopOpen() || gameState.isGameOver) { setHint('지금은 제단을 열 수 없습니다.'); return }
      close()
      await deps.openShopOverlay('altar')
      return
    }
    // 디버그: 즉시 사망/승리 — 정산 화면(모바일 포함) 점검용. 실제 종료 흐름과 같은 finishTurn을 탄다.
    if (/^(사망|death)$/i.test(token)) {
      if (gameState.isGameOver) { setHint('이미 게임이 끝났습니다.'); return }
      close()
      gameState.endGame('character_defeated')
      deps.finishTurn()
      return
    }
    if (/^(승리|clear)$/i.test(token)) {
      if (gameState.isGameOver) { setHint('이미 게임이 끝났습니다.'); return }
      close()
      gameState.endGame('run_clear_100_turns')
      deps.finishTurn()
      return
    }
    // 디버그: 강제 시련을 셔터 연출과 함께 즉시 연다.
    if (/^시련$/.test(token)) {
      if (deps.isInputLocked() || deps.isShopOpen() || gameState.isGameOver) { setHint('지금은 시련을 열 수 없습니다.'); return }
      close()
      deps.setInputLocked(true)
      await boardRenderer.playShopTransition()
      await deps.openTrialOverlayForced()
      deps.setInputLocked(false)
      deps.render()
      return
    }
    setHint('알 수 없는 명령어입니다. /시작, /리셋, /부자, /상점, /제단, /시련, /25turn, /공격력7, /체력40, /1000불빛, /10$, /악마소환')
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
  // 입력 중 실시간으로 일치하는 명령어 도움말을 좁혀 보여준다.
  input.addEventListener('input', () => renderHelp(input.value))
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
