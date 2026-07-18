/**
 * BossFxView — 보스 인트로/전투 연출·격파 시퀀스·악마 커튼 오버레이.
 * GameBoardRenderer에서 표시 책임만 옮겨 왔다 — 렌더 상태의 단일 출처는 host다.
 */

import type { GameBoardRenderer } from '@ui/GameBoardRenderer'
import { spriteForHandCard, SpriteUrls } from '@ui/Sprites'
import { SquareBurst, type BurstTheme } from '@ui/SquareBurst'
import { escapeHtml } from '@ui/renderer/Html'

export class BossFxView {
  constructor(private readonly host: GameBoardRenderer) {}

  /** 악마 소환 레시피 발동 시 레일 위에 겹치는 커튼 오버레이. */
  private demonCurtainOverlay: HTMLElement | null = null

  /** 악마 소환 레시피 발동 시 레일 위에 커튼을 닫는다.
   *  job-rail-curtain의 기본 close 애니메이션(양쪽에서 중앙으로)을 재활용한다. */
  async closeDemonCurtain(): Promise<void> {
    this.ensureDemonCurtainStyles()
    const overlay = document.createElement('div')
    overlay.id = 'demon-curtain-overlay'
    const shell = document.createElement('div')
    shell.className = 'demon-curtain-shell'
    const rail = this.host.boardElement.querySelector<HTMLElement>('.rail')
    if (rail) {
      const rect = rail.getBoundingClientRect()
      shell.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;overflow:hidden;border-radius:14px;`
    }
    shell.innerHTML = `
      <div class="job-rail-curtain job-rail-curtain--left demon-curtain-panel" aria-hidden="true"></div>
      <div class="job-rail-curtain job-rail-curtain--right demon-curtain-panel" aria-hidden="true"></div>`
    overlay.appendChild(shell)
    document.body.appendChild(overlay)
    this.demonCurtainOverlay = overlay
    // 기본 close 애니메이션(0.68s)이 끝날 때까지 대기.
    await new Promise<void>((r) => window.setTimeout(r, 740))
  }

  /** 악마 소환 직전 — 화면에 불길한 붉은 일렁임을 잠시 띄운다 (fire-and-forget). */
  playOminousShimmer(): void {
    const el = document.createElement('div')
    el.className = 'demon-summon-shimmer'
    document.body.appendChild(el)
    window.setTimeout(() => el.remove(), 1400)
  }

  /** 악마 소환 체인 배너를 화르르 사라지게 한다. */
  async playDemonBannerBurnFade(): Promise<void> {
    const banner = document.getElementById('chain-banner')
    if (!banner) return
    banner.classList.remove('is-demon-impact')
    banner.classList.add('is-demon-impact-fading')
    await new Promise<void>((r) => window.setTimeout(r, 720))
    banner.classList.remove('is-demon-impact-fading')
  }

  /** 악마 보스 커튼 앞 등장: 게임 보드를 커튼 오버레이보다 높은 z-index로 올린다. */
  elevateBoardAboveCurtain(): void {
    this.host.boardElement.style.position = 'relative'
    this.host.boardElement.style.zIndex = '150'
    this.host.boardElement.style.isolation = 'isolate'
  }

  /** 악마 보스 커튼 제거 및 보드 z-index 복원. */
  removeDemonCurtain(): void {
    this.host.boardElement.style.position = ''
    this.host.boardElement.style.zIndex = ''
    this.host.boardElement.style.isolation = ''
    if (this.demonCurtainOverlay) {
      this.demonCurtainOverlay.remove()
      this.demonCurtainOverlay = null
    }
  }

  /**
   * 악마 보스 등장 연출: 커튼은 그대로 둔 채 보드를 올린 뒤
   * 보스 타일이 작고 어두운 상태에서 점차 커지고(Phase1), 그 뒤 흐림이 걷히며 선명해진다(Phase2).
   * 두 페이즈는 딜레이로 분리해 순차 진행한다.
   */
  async playDemonFireAppearAnimation(cardId: string): Promise<void> {
    this.elevateBoardAboveCurtain()
    const tile = this.host.findCardElement(cardId)
    // render() 직후 풀 사이즈로 노출되지 않도록 즉시 숨긴 상태로 고정
    if (tile) {
      tile.style.transition = 'none'
      tile.style.transform = 'scale(0.12)'
      tile.style.opacity = '0'
      tile.style.filter = 'blur(20px) brightness(0.08)'
      void tile.offsetWidth  // reflow
    }
    // 커튼 뒤 암흑 유지 후 등장 시작
    await new Promise((r) => window.setTimeout(r, 700))
    if (!tile) return
    // reflow 없이 바로 transition 적용 (이미 초기 상태 고정됨)
    // Phase 1: 규모 성장 + 투명도 해소 (흐림은 유지)
    tile.style.transition = 'transform 0.82s cubic-bezier(0.18, 0.82, 0.25, 1), opacity 0.65s ease-out'
    tile.style.transform = 'scale(1.0)'
    tile.style.opacity = '1'
    await new Promise((r) => window.setTimeout(r, 860))
    // Phase 2: 흐림 해소 + 밝기 복원
    tile.style.transition = 'filter 0.74s ease-out'
    tile.style.filter = 'blur(0px) brightness(1)'
    await new Promise((r) => window.setTimeout(r, 780))
    // 인라인 스타일 정리
    tile.style.transition = ''
    tile.style.transform = ''
    tile.style.opacity = ''
    tile.style.filter = ''
    await new Promise((r) => window.setTimeout(r, 300))
  }

  /** 악마 보스 등장 후 커튼을 열어 보스를 공개한다.
   *  커튼이 보드 위에 있어야 열리면서 레일이 드러나므로, 먼저 보드 elevation을 복원한다. */
  async openDemonCurtain(): Promise<void> {
    const overlay = this.demonCurtainOverlay
    if (!overlay) return
    // 보드를 커튼 아래로 복원해야 커튼 열림 연출이 레일을 가리다 걷히는 효과를 낸다.
    this.host.boardElement.style.position = ''
    this.host.boardElement.style.zIndex = ''
    this.host.boardElement.style.isolation = ''
    overlay.classList.add('is-opening')
    await new Promise<void>((r) => window.setTimeout(r, 1100))
    overlay.remove()
    this.demonCurtainOverlay = null
  }

  private ensureDemonCurtainStyles(): void {
    if (document.getElementById('demon-curtain-styles')) return
    const style = document.createElement('style')
    style.id = 'demon-curtain-styles'
    style.textContent = `
#demon-curtain-overlay {
  position: fixed; inset: 0; z-index: 145; pointer-events: none;
}
#demon-curtain-overlay .demon-curtain-panel {
  width: 56%;
  filter: saturate(0.55) hue-rotate(-12deg) brightness(0.82);
}
#demon-curtain-overlay.is-opening .job-rail-curtain--left {
  animation: job-curtain-open-left 0.92s cubic-bezier(0.18, 0.82, 0.25, 1) forwards;
}
#demon-curtain-overlay.is-opening .job-rail-curtain--right {
  animation: job-curtain-open-right 0.92s cubic-bezier(0.18, 0.82, 0.25, 1) forwards;
}
`
    document.head.appendChild(style)
  }

  /** 보스 등장 직전, 화면을 어둡게 가린 풀스크린 인트로 카드:
   *  좌측에 보스 일러스트, 우측에 이름/HP/공격력/특수/연출 설명. 어느 곳이나
   *  클릭하면 닫히고 다음 비트(셔터 위 보스 타일 강하)로 이어진다. */
  async openBossIntroOverlay(opts: {
    name: string
    maxHp: number
    attack: number
    attackInterval: number
    handGiftStep: number
    spriteUrl?: string
    /** 인트로 카드에 표시할 보스 첫 대사 */
    introBubble?: string
    /** 인트로 카드에 표시할 특징 한 줄 */
    trait?: string
    /** 인트로 카드 상단 수식어 (기본: 탐욕의 대가) */
    kicker?: string
  }): Promise<void> {
    // 잔재 정리: 직전 보스 이벤트가 비정상 종료됐다면 같은 노드가 남아 있을 수 있다.
    document.getElementById('boss-intro-overlay')?.remove()
    const spriteUrl = opts.spriteUrl ?? SpriteUrls.enemyWaves[3]
    const traitLines = (opts.trait ?? `보스 체력이 ${opts.handGiftStep} 닳을 때마다 플레이어에게 랜덤 손패 1장을 지급한다.`)
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
    const traitMarkup = traitLines.length > 1
      ? `<div class="boss-intro-overlay-trait"><strong>특징</strong><ul>${traitLines.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul></div>`
      : `<p class="boss-intro-overlay-trait"><strong>특징</strong> · ${escapeHtml(traitLines[0] ?? '')}</p>`
    // 모든 보스 공통 규칙 레이어 — 실제 지급 간격(handGiftStep)을 그대로 표기(양초 고양이=5).
    const commonMarkup = `<p class="boss-intro-overlay-trait boss-intro-overlay-common"><strong>공통</strong> · 보스 체력 ${opts.handGiftStep} 감소마다 손패 1장 획득</p>`
    const host = document.createElement('div')
    host.id = 'boss-intro-overlay'
    host.className = 'boss-intro-overlay'
    host.innerHTML = `
      <section class="boss-intro-overlay-card" role="dialog" aria-label="보스 출현">
        <div class="boss-intro-overlay-art" style="background-image:url('${spriteUrl}');" aria-hidden="true"></div>
        <div class="boss-intro-overlay-body">
          <span class="boss-intro-overlay-kicker">${escapeHtml(opts.kicker ?? '탐욕의 대가')}</span>
          <h2 class="boss-intro-overlay-name">${escapeHtml(opts.name)}</h2>
          <ul class="boss-intro-overlay-stats">
            <li><span class="boss-intro-overlay-stat-label">체력</span><span class="boss-intro-overlay-stat-value">${opts.maxHp}</span></li>
            <li><span class="boss-intro-overlay-stat-label">공격력</span><span class="boss-intro-overlay-stat-value">${opts.attack}</span></li>
            <li><span class="boss-intro-overlay-stat-label">반격 주기</span><span class="boss-intro-overlay-stat-value">${opts.attackInterval}턴</span></li>
          </ul>
          <p class="boss-intro-overlay-desc">"${escapeHtml(opts.introBubble ?? '내 저택에 온 것을 환영하네, 위태로운 불씨여.')}"</p>
          ${commonMarkup}
          ${traitMarkup}
        </div>
      </section>
      <div class="boss-intro-overlay-hint" aria-hidden="true">CLICK ANYWHERE TO CONTINUE</div>
    `
    document.body.appendChild(host)
    // 타이틀 카드가 완전히 떠오른 뒤에만 하단 문구와 클릭 입력을 연다.
    await new Promise((resolve) => window.setTimeout(resolve, 1700))
    host.classList.add('is-ready')
    await new Promise<void>((resolve) => {
      const close = (): void => {
        host.classList.add('is-closing')
        window.setTimeout(() => {
          host.remove()
          resolve()
        }, 240)
      }
      host.addEventListener('click', close, { once: true })
    })
  }


  /** 보스 좌상단 뱃지에 표시할 "N턴 뒤 공격" 카운트. null이면 마크업이 정적 텍스트로
   *  fallback 한다. index.ts의 보스 가상 턴 흐름이 매 턴마다 update한다. */
  private bossAttackCountdown: number | null = null
  setBossAttackCountdown(n: number | null): void {
    this.bossAttackCountdown = n
    // 보스 카드가 화면에 있다면 바로 텍스트만 in-place로 갱신해 render 부담을 줄인다.
    document.querySelectorAll<HTMLElement>('[data-boss-attack-countdown]').forEach((el) => {
      el.textContent = n == null ? '' : `${n}턴`
    })
  }
  getBossAttackCountdownText(): string {
    const n = this.bossAttackCountdown == null ? 3 : this.bossAttackCountdown
    // 좌상단 배지는 카드의 다른 턴 표기와 맞춰 명령형 문구 없이 숫자만 읽히게 한다.
    return `${Math.max(0, n)}턴`
  }

  /** 보스 보상 카드 클릭 시 일반 보물칸 처치 그라마를 그대로 재사용해 흔들+확대 사라짐.
   *  .is-consuming(공통 card-consume 키프레임) + boss-reward 전용 회전·blur를 한 비트
   *  더 얹는 .is-boss-reward-claimed 키프레임. SquareBurst는 treasure-gain 톤. */
  async playBossRewardClaimedConsume(cardId: string): Promise<void> {
    const tile = this.host.findCardElement(cardId)
    if (!tile) return
    SquareBurst.playOn(tile, 'treasure-gain', { count: 18, spread: 140, duration: 560 })
    tile.classList.add('is-boss-reward-claimed')
    await new Promise((r) => window.setTimeout(r, 520))
  }

  /** 함정 무시(도적/함정의 대가) 판정 성공 시 함정 카드를 잠깐 흔들고
   *  "무시" 글자를 플레이어 카드 위에 띄워 피해가 없음을 시각적으로 확인시킨다. */
  async playTrapIgnoreResist(trapCardId: string): Promise<void> {
    const trapTile = this.host.findCardElement(trapCardId)
    const playerCard = this.host.boardElement.querySelector<HTMLElement>('.player-card, .player-row')
    if (trapTile) {
      trapTile.classList.add('is-trap-ignored')
    }
    if (playerCard) {
      const rect = playerCard.getBoundingClientRect()
      void this.spawnFieldFloatText(rect.left + rect.width / 2, rect.top + rect.height * 0.3, '무시')
    }
    await new Promise((r) => window.setTimeout(r, 460))
    if (trapTile) trapTile.classList.remove('is-trap-ignored')
  }

  /** 보스가 굳음(밀랍 freeze) 상태일 때 가격을 시도하면 데미지 대신 "저항" 글자를
   *  데미지 부유 숫자와 같은 양식으로 띄우고, 카드가 살짝 발작하듯 떨린다.
   *  손패 freeze 효과가 보스에 정상 적용되었음을 명확히 보여주는 피드백. */
  async playBossFreezeResist(cardId: string): Promise<void> {
    const tile = this.host.findCardElement(cardId)
    if (!tile) return
    tile.classList.add('is-boss-resisting')
    const rect = tile.getBoundingClientRect()
    void this.spawnFieldFloatText(rect.left + rect.width / 2, rect.top + rect.height * 0.34, '저항')
    await new Promise((r) => window.setTimeout(r, 460))
    tile.classList.remove('is-boss-resisting')
  }

  /** 데미지 부유 숫자와 동일 톤으로 임의 텍스트를 띄운다(저항/면역 등 상태 피드백용). */
  spawnFieldFloatText(x: number, y: number, text: string): Promise<void> {
    const el = document.createElement('div')
    el.className = 'damage-float damage-float--text'
    el.textContent = text
    el.style.left = `${x}px`
    el.style.top = `${y}px`
    document.body.appendChild(el)
    const anim = el.animate(
      [
        { transform: 'translate(-50%, -20%) scale(0.78)', opacity: 0, filter: 'brightness(1.2)' },
        { transform: 'translate(-50%, -68%) scale(1.2)', opacity: 1, filter: 'brightness(1.65)', offset: 0.22 },
        { transform: 'translate(-50%, -110%) scale(1.08)', opacity: 1, filter: 'brightness(1.32)', offset: 0.65 },
        { transform: 'translate(-50%, -160%) scale(1)', opacity: 0, filter: 'brightness(1)' },
      ],
      { duration: 980, easing: 'cubic-bezier(0.16, 0.86, 0.28, 1)', fill: 'forwards' }
    )
    return new Promise((resolve) => {
      anim.onfinish = () => {
        el.remove()
        resolve()
      }
      window.setTimeout(() => { el.remove(); resolve() }, 1120)
    })
  }

  /** 보스 격파 시퀀스(공통): 짧은 흔들 → 사각 burst 연발 → 갈라짐 → 펑(큰 burst) →
   *  흐릿하게 확대되며 사라짐. 모든 burst는 기존 SquareBurst 그라마(damage/treasure-gain)
   *  를 그대로 사용해 일반 게임 톤과 통일된다. */
  /**
   * 보스 카드 최초 착지 연출: 위에서 낙하 → 바운스 → 바닥 충격 시 좌우 먼지 burst.
   * render() 직후 호출해 DOM에 타일이 있는 상태에서 진행한다.
   */
  async playBossLandingAnimation(cardId: string): Promise<void> {
    const tile = this.host.findCardElement(cardId)
    if (!tile) return
    // 착지 애니메이션 적용
    tile.classList.remove('is-boss-landing')
    void tile.offsetWidth  // reflow로 애니메이션 재시작
    tile.classList.add('is-boss-landing')
    // 55%(0.72s × 0.55 ≈ 396ms) 지점이 최초 착지 순간 → 먼지 burst 발사
    await new Promise((r) => window.setTimeout(r, 400))
    const rect = tile.getBoundingClientRect()
    const bottomY = rect.bottom - 4
    const centerX = rect.left + rect.width / 2
    // 좌우로 넓게 퍼지는 먼지 이펙트: 중앙 + 좌 + 우 세 포인트에서 폭발
    SquareBurst.playAt(centerX,       bottomY, 'damage',        { count: 22, spread: 220, duration: 560 })
    SquareBurst.playAt(centerX - 80, bottomY, 'bomb-blast',    { count: 14, spread: 140, duration: 480 })
    SquareBurst.playAt(centerX + 80, bottomY, 'bomb-blast',    { count: 14, spread: 140, duration: 480 })
    // 바운스가 완전히 끝날 때까지 대기
    await new Promise((r) => window.setTimeout(r, 340))
    tile.classList.remove('is-boss-landing')
  }
  /** 불씨 기사단장(60F) 등장 연출: 왼쪽 밖에서 오른쪽으로 천천히 날아와 중앙 3×3에 쿵 정착한다. */
  async playWaxKnightSwoopAnimation(cardId: string): Promise<void> {
    const tile = this.host.findCardElement(cardId)
    if (!tile) return
    const rail = this.host.boardElement.querySelector<HTMLElement>('.rail')
    tile.classList.remove('is-wax-knight-swooping')
    rail?.classList.remove('is-boss-quaking')
    void tile.offsetWidth  // CSS animation 재시작용 reflow
    tile.classList.add('is-wax-knight-swooping')

    // 느린 비행의 끝부분(약 70%)에 착지 임팩트를 몰아, 도착-쿵 beat가 분리되어 보이게 한다.
    await new Promise((r) => window.setTimeout(r, 880))
    const rect = tile.getBoundingClientRect()
    const centerY = rect.top + rect.height * 0.58
    const centerX = rect.left + rect.width / 2
    rail?.classList.add('is-boss-quaking')
    SquareBurst.playAt(centerX - 132, centerY, 'bomb-blast', { count: 18, spread: 150, duration: 620 })
    SquareBurst.playAt(centerX - 18,  centerY, 'damage',     { count: 32, spread: 240, duration: 720 })
    SquareBurst.playAt(centerX + 104, centerY, 'bomb-blast', { count: 18, spread: 150, duration: 620 })

    await new Promise((r) => window.setTimeout(r, 480))
    tile.classList.remove('is-wax-knight-swooping')
    rail?.classList.remove('is-boss-quaking')
  }
  /** 불씨 기사단장이 사용하는 보스 카드 효과를 한 박자짜리 사각 블라스트로 표시한다. */
  /** 불씨 기사단장 카드 발동 연출:
   *  보스 전용 손패(시련 톤 붉은 카드, 상단 촛농/양초/불씨 일러스트)가 보스 중앙에서
   *  커지듯 나타나 ~1.5초 잔류한 뒤, 팡 터지며 효과별 수치가 알맞은 HUD로 블라스트된다.
   *  - 방패 → 플레이어 방패 칩, 체력 → 플레이어 체력, 피해 → 플레이어 카드로 발사. */
  /** 보스 손패 콤보 공통 연출: 손패 N장을 중앙 정렬로 한 번에 펼친 뒤 중복 카드를 빛내고
   *  보너스 카드를 추가해 순차 해결한다. 100F 마녀(4장)와 60F 불씨 기사단장(2장)이 공유한다.
   *  목적지는 매 해결마다 살아 있는 보스 셀을 다시 찾아 이펙트가 엉뚱한 곳으로 날아가지 않는다. */
  async animateBossHandCombo(
    cardId: string,
    effects: ('shield' | 'heal' | 'strike')[],
    bonusEffects: ('shield' | 'heal' | 'strike')[],
    amount: number,
    onResolve: (effect: 'shield' | 'heal' | 'strike') => Promise<void>,
  ): Promise<void> {
    const tile = this.host.findCardElement(cardId)
    if (!tile) return

    const cells = Array.from(
      this.host.boardElement.querySelectorAll<HTMLElement>(`.cell.card[data-card-id="${cardId}"]`)
    ).filter((el) => el.offsetParent !== null)
    const rects = cells.map((c) => c.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0)
    const baseRect = rects.length > 0 ? rects[0] : tile.getBoundingClientRect()
    const bossX = rects.length > 0
      ? (Math.min(...rects.map((r) => r.left)) + Math.max(...rects.map((r) => r.right))) / 2
      : baseRect.left + baseRect.width / 2
    const bossY = rects.length > 0
      ? (Math.min(...rects.map((r) => r.top)) + Math.max(...rects.map((r) => r.bottom))) / 2
      : baseRect.top + baseRect.height / 2
    const metaFor = (effect: 'shield' | 'heal' | 'strike') => ({
      shield: { title: '밀랍 방패', desc: `방패 +${amount}`, label: `방패 +${amount}`, illust: spriteForHandCard('candle'),   burst: 'boss-candle-flame' as const, dest: 'boss-shield' as const },
      heal:   { title: '촛불 가호', desc: `체력 +${amount}`, label: `체력 +${amount}`, illust: spriteForHandCard('wax-drop'), burst: 'boss-wax-drip' as const,     dest: 'boss-health' as const },
      strike: { title: '불씨 일격', desc: `피해 ${amount}`,  label: `피해 ${amount}`,  illust: spriteForHandCard('ember'),    burst: 'boss-ember-spark' as const,  dest: 'player' as const },
    }[effect])
    const createCard = (effect: 'shield' | 'heal' | 'strike', index: number, bonus = false): HTMLElement => {
      const meta = metaFor(effect)
      const card = document.createElement('div')
      card.className = `boss-cast-card boss-cast-card--${effect} boss-witch-combo-card${bonus ? ' is-bonus' : ''}`
      card.dataset.effect = effect
      card.style.left = `${bossX}px`
      card.style.top = `${bossY}px`
      card.style.setProperty('--combo-index', String(index))
      card.innerHTML = `
        <span class="boss-cast-card-glow" aria-hidden="true"></span>
        <span class="boss-cast-card-illust" aria-hidden="true"><img src="${meta.illust}" alt="" /></span>
        <span class="boss-cast-card-title">${meta.title}</span>
        <span class="boss-cast-card-effect">${meta.desc}</span>
      `
      document.body.appendChild(card)
      return card
    }

    // 기본 손패를 같은 박자에 차라락 펼치되, index별 지연으로 좌→우 리듬을 만든다.
    // 카드 장수에 맞춰 중앙 정렬한다(4장이면 ±1.5, 2장이면 ±0.5로 좌우 대칭).
    const centerOffset = (effects.length - 1) / 2
    const cards = effects.map((effect, index) => createCard(effect, index))
    await Promise.all(cards.map((card, index) => card.animate(
      [
        { transform: 'translate(-50%, -50%) scale(0.18) rotate(-7deg)', opacity: 0, filter: 'brightness(1.8)' },
        { transform: `translate(calc(-50% + ${(index - centerOffset) * 118}px), -50%) scale(1.08) rotate(${(index - centerOffset) * 2}deg)`, opacity: 1, filter: 'brightness(1.18)', offset: 0.76 },
        { transform: `translate(calc(-50% + ${(index - centerOffset) * 118}px), -50%) scale(1) rotate(${(index - centerOffset) * 1.2}deg)`, opacity: 1, filter: 'brightness(1)' },
      ],
      { duration: 360, delay: index * 70, easing: 'cubic-bezier(0.18, 0.86, 0.24, 1.18)', fill: 'forwards' }
    ).finished))

    const duplicated = new Set(bonusEffects)
    if (duplicated.size > 0) {
      cards.forEach((card) => {
        if (duplicated.has(card.dataset.effect as 'shield' | 'heal' | 'strike')) card.classList.add('is-duplicate')
      })
      await new Promise((r) => window.setTimeout(r, 420))
    }

    // 중복 효과가 있으면 오른쪽 끝에 5번째 이후 추가 카드를 띵! 하고 꽂는다.
    const bonusCards = bonusEffects.map((effect, bonusIndex) => createCard(effect, effects.length + bonusIndex, true))
    await Promise.all(bonusCards.map((card, bonusIndex) => card.animate(
      [
        { transform: 'translate(calc(-50% + 244px), -50%) scale(0.25) rotate(7deg)', opacity: 0, filter: 'brightness(2.2)' },
        { transform: `translate(calc(-50% + ${244 + bonusIndex * 82}px), -50%) scale(1.16) rotate(4deg)`, opacity: 1, filter: 'brightness(1.7)', offset: 0.62 },
        { transform: `translate(calc(-50% + ${244 + bonusIndex * 82}px), -50%) scale(1) rotate(2deg)`, opacity: 1, filter: 'brightness(1)' },
      ],
      { duration: 320, delay: bonusIndex * 80, easing: 'cubic-bezier(0.18, 0.86, 0.24, 1.22)', fill: 'forwards' }
    ).finished))

    const sequence = [...cards, ...bonusCards]
    for (const card of sequence) {
      const effect = card.dataset.effect as 'shield' | 'heal' | 'strike'
      const meta = metaFor(effect)
      card.classList.add('is-resolving')
      await onResolve(effect)
      const cardRect = card.getBoundingClientRect()
      const originX = cardRect.left + cardRect.width / 2
      const originY = cardRect.top + cardRect.height / 2
      // onResolve가 보드를 다시 렌더해 캡처해 둔 tile이 떨어져 나갔을 수 있다.
      // 방패/체력 목적지는 매번 살아 있는 보스 셀을 다시 찾아 좌표가 화면 밖/0,0으로 새는 걸 막는다.
      const liveTile = this.host.findCardElement(cardId) ?? tile
      const destEl =
        meta.dest === 'player'
          ? this.host.boardElement.querySelector<HTMLElement>('.player-card')
          : meta.dest === 'boss-shield'
            ? (liveTile.querySelector<HTMLElement>('.boss-face-shield-chip') ?? liveTile.querySelector<HTMLElement>('.boss-face-hp-column'))
            : (liveTile.querySelector<HTMLElement>('.boss-face-hpbar') ?? liveTile.querySelector<HTMLElement>('.boss-face-hp-column'))
      SquareBurst.playAt(originX, originY, meta.burst, { count: effect === 'strike' ? 24 : 18, spread: 180, duration: 520 })
      void this.spawnFieldFloatText(originX, originY - 24, meta.label)
      liveTile.classList.add('is-wax-knight-casting')
      // 카드별 사용 템포를 더 빠르게 — 트레일 입자 수와 퇴장/간격을 줄여 하나씩 처리되는 답답함을 줄인다.
      if (destEl) await this.host.trails.animateResourceTrail(new DOMRect(originX - 10, originY - 10, 20, 20), destEl, effect === 'strike' ? 4 : 3, meta.burst)
      liveTile.classList.remove('is-wax-knight-casting')
      await card.animate(
        [
          { transform: getComputedStyle(card).transform === 'none' ? 'translate(-50%, -50%) scale(1)' : getComputedStyle(card).transform, opacity: 1, filter: 'brightness(1.4)' },
          { transform: 'translate(-50%, -50%) scale(0.38) rotate(5deg)', opacity: 0, filter: 'brightness(2.4)' },
        ],
        { duration: 150, easing: 'cubic-bezier(0.5, 0, 0.6, 1)', fill: 'forwards' }
      ).finished
      card.remove()
      if (effect === 'strike') await new Promise((r) => window.setTimeout(r, 30))
    }
  }

  /** 밀랍 조각사(2×3) 등장 연출.
   *  6칸 동시 투명→확대→쿵 착지. 착지 순간 중심 블라스트. */
  async playWaxSculptorAppearAnimation(cardId: string): Promise<void> {
    const allFaces = Array.from(
      document.querySelectorAll<HTMLElement>(
        `.rail-row.dist-0 .cell[data-card-id="${cardId}"] .boss-face,
         .rail-row.dist-1 .cell[data-card-id="${cardId}"] .boss-face`
      )
    )
    if (allFaces.length === 0) return

    // 6칸 동시 등장 애니메이션 시작
    allFaces.forEach((face) => face.classList.add('is-wax-sculptor-entering'))

    // 55%=308ms 지점이 최대 확대(peak), 80%=448ms 지점이 쿵 착지
    // 블라스트는 착지 순간(448ms)에 맞춰 발사한다
    await new Promise((r) => window.setTimeout(r, 448))

    // 착지 순간 가시 face(display:none인 행은 제외)의 중심 기준 블라스트
    const rects = allFaces
      .map((f) => f.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.height > 0)
    if (rects.length === 0) return
    const cx = (Math.min(...rects.map((r) => r.left)) + Math.max(...rects.map((r) => r.right))) / 2
    const cy = (Math.min(...rects.map((r) => r.top))  + Math.max(...rects.map((r) => r.bottom))) / 2
    SquareBurst.playAt(cx, cy, 'damage', { count: 32, spread: 260, duration: 580 })

    // 나머지 애니메이션(80%→100% = 108ms) 완료 후 클래스 정리
    await new Promise((r) => window.setTimeout(r, 160))
    allFaces.forEach((face) => face.classList.remove('is-wax-sculptor-entering'))
    await new Promise((r) => window.setTimeout(r, 180))
  }

  /** 밀랍 조각사 전방 복귀 연출: 위에서 쿵 떨어지듯 착지 → 기절하듯 사각 블라스트. */
  async playSculptorReturnAnimation(cardId: string): Promise<void> {
    const faces = Array.from(
      this.host.boardElement.querySelectorAll<HTMLElement>(
        `.cell.card[data-card-id="${cardId}"] .boss-face`
      )
    )
    if (faces.length === 0) return
    faces.forEach((f) => {
      f.classList.remove('is-wax-sculptor-returning')
      void f.offsetWidth  // reflow로 재시작
      f.classList.add('is-wax-sculptor-returning')
    })
    // 쿵 착지(85% ≈ 408ms) 시점에 맞춰 블라스트
    await new Promise((r) => window.setTimeout(r, 408))
    const rects = faces
      .map((f) => f.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.height > 0)
    if (rects.length > 0) {
      const cx = (Math.min(...rects.map((r) => r.left)) + Math.max(...rects.map((r) => r.right))) / 2
      const cy = (Math.min(...rects.map((r) => r.top))  + Math.max(...rects.map((r) => r.bottom))) / 2
      // 중앙 강타 + 좌우로 튀는 기절 톤 사각 블라스트
      SquareBurst.playAt(cx,       cy, 'damage',     { count: 28, spread: 240, duration: 560 })
      SquareBurst.playAt(cx - 90,  cy, 'bomb-blast', { count: 14, spread: 150, duration: 480 })
      SquareBurst.playAt(cx + 90,  cy, 'bomb-blast', { count: 14, spread: 150, duration: 480 })
    }
    await new Promise((r) => window.setTimeout(r, 200))
    faces.forEach((f) => f.classList.remove('is-wax-sculptor-returning'))
  }

  /** 조각사 소환 연출 — 좌→우 순서로 각 적이 작은 상태에서 확대되며 격렬하게 흔들려 들어온다.
   *  enemyIds는 레인 0→1→2 순서로 전달한다. */
  async animateSculptorSummonEnemies(enemyIds: string[]): Promise<void> {
    const STAGGER = 160  // 레인 간 지연 ms
    const animations: Promise<void>[] = []

    for (let i = 0; i < enemyIds.length; i++) {
      const delay = i * STAGGER
      const id = enemyIds[i]
      animations.push(
        new Promise<void>((resolve) => {
          window.setTimeout(() => {
            const el = this.host.boardElement.querySelector<HTMLElement>(
              `.cell.card[data-card-id="${id}"]`
            )
            if (!el) { resolve(); return }
            // 소환 시 사각 버스트 (작은 폭발 톤)
            SquareBurst.playOn(el, 'damage', { count: 12, spread: 100, duration: 480 })
            el.classList.add('is-sculptor-summoning')
            window.setTimeout(() => {
              el.classList.remove('is-sculptor-summoning')
              resolve()
            }, 620)
          }, delay)
        })
      )
    }
    await Promise.all(animations)
    // 마지막 카드 애니메이션이 끝난 후 짧은 여운
    await new Promise((r) => window.setTimeout(r, 120))
  }

  /** 후방 페이즈 조각사 공격 전용 연출 — 들어올려짐 → 돌진 → 쾅 착지 → 복귀.
   *  일반 animateEnemyAttacks보다 dy 범위가 크고 위로 들어올리는 프리임이 추가된다. */
  async animateSculptorBackAttack(cardId: string): Promise<void> {
    const element = this.host.findCardElement(cardId)
    if (!element) return
    const player = this.host.boardElement.querySelector<HTMLElement>('.player-card, .player-row')
    if (!player) return
    const rect = element.getBoundingClientRect()
    const playerRect = player.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return

    const dx = (playerRect.left + playerRect.width / 2 - (rect.left + rect.width / 2)) * 0.30
    // 조각사 상단 → 플레이어 상단까지 전체 거리 (캡 없음 — 실제 이동량)
    const dy = playerRect.top - rect.top + 24

    const clone = element.cloneNode(true) as HTMLElement
    element.classList.add('is-enemy-slamming-source')
    clone.classList.add('enemy-attack-clone')
    clone.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;margin:0;z-index:250;pointer-events:none;transform-origin:50% 100%`
    document.body.appendChild(clone)

    const animation = clone.animate(
      [
        // 현재 위치
        { transform: 'translate(0,0) scale(1,1)',                                        filter: 'brightness(1)',                                                               offset: 0    },
        // 위로 들어올려짐 — 대기라인 이탈 느낌
        { transform: 'translate(0,-38px) scale(1.09,0.93)',                              filter: 'brightness(1.45) drop-shadow(0 -14px 20px rgba(220,110,50,0.65))',            offset: 0.17 },
        // 돌진 중간
        { transform: `translate(${dx*0.52}px,${dy*0.52}px) scale(1.15,0.85)`,           filter: 'brightness(1.7) drop-shadow(0 32px 40px rgba(200,48,48,0.82))',               offset: 0.50 },
        // 쾅 착지
        { transform: `translate(${dx}px,${dy}px) scale(1.26,0.70)`,                     filter: 'brightness(1.9) drop-shadow(0 44px 52px rgba(224,24,24,0.96))',               offset: 0.61 },
        // 반동
        { transform: `translate(${dx*0.07}px,${dy*0.03}px) scale(0.97,1.05)`,           filter: 'brightness(1.06)',                                                            offset: 0.82 },
        { transform: 'translate(0,0) scale(1,1)',                                        filter: 'brightness(1)',                                                               offset: 1    },
      ],
      { duration: 760, easing: 'cubic-bezier(0.18, 0.96, 0.22, 1)', fill: 'forwards' }
    )

    return new Promise<void>((resolve) => {
      animation.onfinish = () => { clone.remove(); element.classList.remove('is-enemy-slamming-source'); resolve() }
      window.setTimeout(() => { clone.remove(); element.classList.remove('is-enemy-slamming-source'); resolve() }, 940)
    })
  }

  async playBossDefeatSequence(cardId: string): Promise<void> {
    const tile = this.host.findCardElement(cardId)
    if (!tile) return
    // 확대 폭발이 레일/스테이지 밖으로 번져도 잘리지 않도록 상위 클리핑을 잠시 푼다.
    this.host.boardElement.classList.add('is-boss-finale')
    tile.classList.add('is-boss-defeating')

    // beat 1: 흔들 + 작은 burst 두 번 — 일반 enemy hit burst('damage') 톤.
    SquareBurst.playOn(tile, 'damage', { count: 16, spread: 140, duration: 520 })
    await new Promise((r) => window.setTimeout(r, 220))
    SquareBurst.playOn(tile, 'damage', { count: 18, spread: 160, duration: 520 })
    await new Promise((r) => window.setTimeout(r, 240))

    // beat 2: 3~5줄 랜덤 균열선 삽입 + 갈라짐 클래스 + burst.
    const lineCount = 3 + Math.floor(Math.random() * 3)
    for (let i = 0; i < lineCount; i++) {
      const line = document.createElement('div')
      // 대각선 방향 유지: 50~130도 기반, 50% 확률로 방향 반전, ±10 jitter
      const base = 50 + Math.random() * 80
      const angle = (Math.random() < 0.5 ? 1 : -1) * base
      const pos = 12 + Math.random() * 76        // 카드 전체에 분산 (12~88%)
      const w = 1.1 + Math.random() * 1.1        // 선 굵기 1.1~2.2%
      const alpha = (0.82 + Math.random() * 0.15).toFixed(2)
      line.className = 'boss-crack-line'
      line.style.background = [
        `linear-gradient(${angle.toFixed(1)}deg,`,
        `transparent ${(pos - w).toFixed(1)}%,`,
        `rgba(255,224,168,${alpha}) ${(pos - w * 0.3).toFixed(1)}%,`,
        `rgba(255,204,120,${alpha}) ${(pos + w * 0.3).toFixed(1)}%,`,
        `transparent ${(pos + w).toFixed(1)}%)`,
      ].join(' ')
      line.style.animationDelay = `${Math.round(Math.random() * 110)}ms`
      tile.appendChild(line)
    }
    tile.classList.add('is-boss-cracking')
    SquareBurst.playOn(tile, 'treasure-gain', { count: 22, spread: 180, duration: 560 })
    await new Promise((r) => window.setTimeout(r, 360))

    // beat 3: 펑 — 큰 burst + 흐릿 확대 사라짐(.is-boss-blown).
    SquareBurst.playOn(tile, 'treasure-gain', { count: 32, spread: 230, duration: 760 })
    tile.classList.add('is-boss-blown')
    await new Promise((r) => window.setTimeout(r, 640))
    // 격파 연출 종료 — 상위 컨테이너 클리핑을 원복한다.
    this.host.boardElement.classList.remove('is-boss-finale')
  }

  /** 검은 양초 악마 공격 주기: 1~3장의 검은 양초 보스 손패를 순차 발동한다.
   *  각 카드에 실시간 누적 피해(startingCounter+1, +2, ...) 를 표시하고, onEachCandle 콜백으로 효과를 적용한다. */
  async animateDemonCandleTurn(
    cardId: string,
    count: number,
    startingCounter: number,
    onEachCandle: (index: number) => Promise<void>,
  ): Promise<void> {
    const tile = this.host.findCardElement(cardId)
    if (!tile) return

    const cells = Array.from(
      this.host.boardElement.querySelectorAll<HTMLElement>(`.cell.card[data-card-id="${cardId}"]`)
    ).filter((el) => el.offsetParent !== null)
    const rects = cells.map((c) => c.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0)
    const baseRect = rects.length > 0 ? rects[0] : tile.getBoundingClientRect()
    const bossX = rects.length > 0
      ? (Math.min(...rects.map((r) => r.left)) + Math.max(...rects.map((r) => r.right))) / 2
      : baseRect.left + baseRect.width / 2
    const bossY = rects.length > 0
      ? (Math.min(...rects.map((r) => r.top)) + Math.max(...rects.map((r) => r.bottom))) / 2
      : baseRect.top + baseRect.height / 2

    const centerOffset = (count - 1) / 2
    const createCandleCard = (index: number, counter: number): HTMLElement => {
      const card = document.createElement('div')
      card.className = 'boss-cast-card boss-cast-card--demon-candle'
      card.style.left = `${bossX}px`
      card.style.top = `${bossY}px`
      card.style.setProperty('--combo-index', String(index))
      card.innerHTML = `
        <span class="boss-cast-card-glow" aria-hidden="true"></span>
        <span class="boss-cast-card-illust" aria-hidden="true"><img src="${spriteForHandCard('black-candle')}" alt="" /></span>
        <span class="boss-cast-card-title">검은 양초</span>
        <span class="boss-cast-card-effect">피해 ${counter}</span>
      `
      document.body.appendChild(card)
      return card
    }

    // 전체 카드를 미리 펼쳐 예고한 뒤 순차 발동한다.
    const cards = Array.from({ length: count }, (_, i) => createCandleCard(i, startingCounter + i + 1))
    await Promise.all(cards.map((card, index) => card.animate(
      [
        { transform: 'translate(-50%, -50%) scale(0.18) rotate(-7deg)', opacity: 0, filter: 'brightness(1.8)' },
        { transform: `translate(calc(-50% + ${(index - centerOffset) * 118}px), -50%) scale(1.08) rotate(${(index - centerOffset) * 2}deg)`, opacity: 1, filter: 'brightness(1.18)', offset: 0.76 },
        { transform: `translate(calc(-50% + ${(index - centerOffset) * 118}px), -50%) scale(1) rotate(${(index - centerOffset) * 1.2}deg)`, opacity: 1, filter: 'brightness(1)' },
      ],
      { duration: 360, delay: index * 70, easing: 'cubic-bezier(0.18, 0.86, 0.24, 1.18)', fill: 'forwards' }
    ).finished))

    for (let i = 0; i < count; i++) {
      const card = cards[i]
      card.classList.add('is-resolving')
      await onEachCandle(i)
      const counter = startingCounter + i + 1
      const cardRect = card.getBoundingClientRect()
      const originX = cardRect.left + cardRect.width / 2
      const originY = cardRect.top + cardRect.height / 2
      SquareBurst.playAt(originX, originY, 'demon-vortex', { count: 20, spread: 160, duration: 480 })
      void this.spawnFieldFloatText(originX, originY - 24, `피해 ${counter}`)
      const playerEl = this.host.boardElement.querySelector<HTMLElement>('.player-card')
      if (playerEl) await this.host.trails.animateResourceTrail(new DOMRect(originX - 10, originY - 10, 20, 20), playerEl, 4, 'demon-vortex')
      await card.animate(
        [
          { opacity: 1, filter: 'brightness(1.4)' },
          { opacity: 0, transform: 'translate(-50%, -50%) scale(0.38) rotate(5deg)', filter: 'brightness(2.4)' },
        ],
        { duration: 150, easing: 'cubic-bezier(0.5, 0, 0.6, 1)', fill: 'forwards' }
      ).finished
      card.remove()
    }
  }

  /** 거짓과 진실: 단일 크고 보라빛 카드를 펼쳐 isTrue 여부를 보여주고 applyEffect 콜백으로 게임 로직을 적용한다. */
  async animateDemonTruthLie(
    cardId: string,
    isTrue: boolean,
    onResolve: () => Promise<void>,
  ): Promise<void> {
    const tile = this.host.findCardElement(cardId)
    if (!tile) return

    const cells = Array.from(
      this.host.boardElement.querySelectorAll<HTMLElement>(`.cell.card[data-card-id="${cardId}"]`)
    ).filter((el) => el.offsetParent !== null)
    const rects = cells.map((c) => c.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0)
    const baseRect = rects.length > 0 ? rects[0] : tile.getBoundingClientRect()
    const bossX = rects.length > 0
      ? (Math.min(...rects.map((r) => r.left)) + Math.max(...rects.map((r) => r.right))) / 2
      : baseRect.left + baseRect.width / 2
    const bossY = rects.length > 0
      ? (Math.min(...rects.map((r) => r.top)) + Math.max(...rects.map((r) => r.bottom))) / 2
      : baseRect.top + baseRect.height / 2

    const card = document.createElement('div')
    card.className = `boss-cast-card demon-truth-lie-card boss-cast-card--${isTrue ? 'truth' : 'lie'}`
    card.style.left = `${bossX}px`
    card.style.top = `${bossY}px`
    card.innerHTML = `
      <span class="boss-cast-card-glow" aria-hidden="true"></span>
      <span class="boss-cast-card-illust demon-truth-lie-illust" aria-hidden="true">
        <span class="demon-truth-lie-symbol">${isTrue ? '眞' : '假'}</span>
      </span>
      <span class="boss-cast-card-title">거짓과 진실</span>
      <span class="boss-cast-card-effect">${isTrue ? '진실' : '거짓'}</span>
    `
    document.body.appendChild(card)

    await card.animate(
      [
        { transform: 'translate(-50%, -50%) scale(0.18) rotate(-7deg)', opacity: 0, filter: 'brightness(1.8)' },
        { transform: 'translate(-50%, -50%) scale(1.12) rotate(0deg)', opacity: 1, filter: 'brightness(1.3)', offset: 0.7 },
        { transform: 'translate(-50%, -50%) scale(1) rotate(0deg)', opacity: 1, filter: 'brightness(1)' },
      ],
      { duration: 520, easing: 'cubic-bezier(0.18, 0.86, 0.24, 1.18)', fill: 'forwards' }
    ).finished
    await new Promise((r) => window.setTimeout(r, 600))

    card.classList.add('is-resolving')
    await onResolve()

    const cardRect = card.getBoundingClientRect()
    const originX = cardRect.left + cardRect.width / 2
    const originY = cardRect.top + cardRect.height / 2
    SquareBurst.playAt(originX, originY, 'demon-vortex', { count: 28, spread: 200, duration: 600 })
    const liveTile = this.host.findCardElement(cardId) ?? tile
    if (isTrue) {
      void this.spawnFieldFloatText(originX, originY - 24, '진실 — 체력+10 공격+1')
      const atkEl = liveTile.querySelector<HTMLElement>('.boss-face-atk') ?? liveTile
      await this.host.trails.animateResourceTrail(new DOMRect(originX - 10, originY - 10, 20, 20), atkEl, 6, 'demon-vortex')
    } else {
      void this.spawnFieldFloatText(originX, originY - 24, '거짓 — 손패 파괴')
    }

    await card.animate(
      [
        { opacity: 1, filter: 'brightness(1.4)' },
        { opacity: 0, transform: 'translate(-50%, -50%) scale(0.38) rotate(5deg)', filter: 'brightness(2.4)' },
      ],
      { duration: 200, easing: 'cubic-bezier(0.5, 0, 0.6, 1)', fill: 'forwards' }
    ).finished
    card.remove()
  }

  /** 검은 양초 악마 격파 시 보라빛 균열 소용돌이 소멸 연출. */
  async playDemonDefeatSequence(cardId: string): Promise<void> {
    const tile = this.host.findCardElement(cardId)
    if (!tile) return
    this.host.boardElement.classList.add('is-boss-finale')
    tile.classList.add('is-boss-defeating')
    tile.classList.add('is-demon-dying')

    SquareBurst.playOn(tile, 'demon-vortex', { count: 20, spread: 160, duration: 560 })
    await new Promise((r) => window.setTimeout(r, 280))
    SquareBurst.playOn(tile, 'demon-vortex', { count: 24, spread: 200, duration: 560 })
    await new Promise((r) => window.setTimeout(r, 300))

    // 보라빛 균열선 삽입
    const cells = this.collectVisibleBossCells(cardId)
    for (const cell of cells) {
      for (let i = 0; i < 4; i++) {
        const line = document.createElement('div')
        const base = 40 + Math.random() * 100
        const angle = (Math.random() < 0.5 ? 1 : -1) * base
        const pos = 12 + Math.random() * 76
        const w = 1.1 + Math.random() * 1.1
        const alpha = (0.82 + Math.random() * 0.15).toFixed(2)
        line.className = 'boss-crack-line demon-crack-line'
        line.style.background = [
          `linear-gradient(${angle.toFixed(1)}deg,`,
          `transparent ${(pos - w).toFixed(1)}%,`,
          `rgba(180,80,240,${alpha}) ${(pos - w * 0.3).toFixed(1)}%,`,
          `rgba(140,40,200,${alpha}) ${(pos + w * 0.3).toFixed(1)}%,`,
          `transparent ${(pos + w).toFixed(1)}%)`,
        ].join(' ')
        line.style.animationDelay = `${Math.round(Math.random() * 110)}ms`
        cell.appendChild(line)
      }
      cell.classList.add('is-boss-cracking')
    }
    SquareBurst.playOn(tile, 'demon-vortex', { count: 30, spread: 220, duration: 640 })
    await new Promise((r) => window.setTimeout(r, 400))

    SquareBurst.playOn(tile, 'demon-vortex', { count: 40, spread: 280, duration: 800 })
    tile.classList.add('is-boss-blown')
    await new Promise((r) => window.setTimeout(r, 700))
    this.host.boardElement.classList.remove('is-boss-finale')
  }

  /** 100F 마녀 격파 직전 컷신의 보스 칸 전부를 모으는 헬퍼. 3×3 보스라 보이는 셀이 여러 장이다. */
  private collectVisibleBossCells(cardId: string): HTMLElement[] {
    return Array.from(
      this.host.boardElement.querySelectorAll<HTMLElement>(`.cell.card[data-card-id="${cardId}"]`)
    ).filter((el) => el.offsetParent !== null)
  }

  /** 격파 직전 빛의 선 한 줄을 보스 칸에 그린다. beat가 커질수록 더 밝고 가는 빛이 늘어난다. */
  private drawWitchLightLine(cell: HTMLElement): void {
    const line = document.createElement('div')
    const base = 40 + Math.random() * 100
    const angle = (Math.random() < 0.5 ? 1 : -1) * base
    const pos = 8 + Math.random() * 84            // 칸 전체에 분산
    const w = 0.5 + Math.random() * 0.9           // 가는 빛줄기
    line.className = 'witch-light-line'
    line.style.background = [
      `linear-gradient(${angle.toFixed(1)}deg,`,
      `transparent ${(pos - w).toFixed(1)}%,`,
      `rgba(255,250,232,0.96) ${pos.toFixed(1)}%,`,
      `transparent ${(pos + w).toFixed(1)}%)`,
    ].join(' ')
    line.style.animationDelay = `${Math.round(Math.random() * 130)}ms`
    cell.appendChild(line)
  }

  /** 마녀 격파 직전 한 마디: 빛의 선 묶음을 긋고, 미세 떨림과 칸 확대를 건다. */
  async playWaxWitchDeathBeat(cardId: string, beat: number): Promise<void> {
    const cells = this.collectVisibleBossCells(cardId)
    if (cells.length === 0) return
    // 컷신 확대도 레일/스테이지 밖으로 번질 수 있게 클리핑을 푼다(폭발 시퀀스 종료 시 원복).
    this.host.boardElement.classList.add('is-boss-finale')
    const scale = (1 + beat * 0.05).toFixed(3)
    for (const cell of cells) {
      for (let i = 0; i < beat + 1; i++) this.drawWitchLightLine(cell)
      cell.classList.add('is-witch-dying')
      cell.style.setProperty('--witch-death-scale', scale)
      // 떨림은 매 마디 1회 재시작(클래스 토글 + reflow).
      cell.classList.remove('is-witch-trembling')
      void cell.offsetWidth
      cell.classList.add('is-witch-trembling')
    }
    // 빛줄기가 번지는 만큼만 짧게 기다리고 반환 — 떨림/확대는 대사가 뜬 동안 이어진다.
    await new Promise((r) => window.setTimeout(r, 320))
  }

  /** 마지막 마디: 빛의 선이 마구 그어진다. 직후 호출되는 폭발 시퀀스로 자연스럽게 넘어간다. */
  async playWaxWitchDeathFrenzy(cardId: string): Promise<void> {
    const cells = this.collectVisibleBossCells(cardId)
    if (cells.length === 0) return
    for (const cell of cells) {
      cell.classList.add('is-witch-dying')
      cell.style.setProperty('--witch-death-scale', '1.2')
      cell.classList.add('is-witch-frenzy')
    }
    // 빛의 선을 짧은 간격으로 연달아 긋는다.
    for (let burst = 0; burst < 5; burst++) {
      for (const cell of cells) {
        this.drawWitchLightLine(cell)
        this.drawWitchLightLine(cell)
      }
      await new Promise((r) => window.setTimeout(r, 90))
    }
    await new Promise((r) => window.setTimeout(r, 160))
    // 폭발 시퀀스가 transform을 다시 잡도록 확대/떨림 잔여 클래스를 정리한다.
    for (const cell of cells) {
      cell.classList.remove('is-witch-trembling', 'is-witch-frenzy', 'is-witch-dying')
      cell.style.removeProperty('--witch-death-scale')
    }
  }

  /** Boss-origin blast that burns a specific hand slot before the model re-renders it away. */
  async animateBossBlastToHandSlot(cardId: string, slotIndex: number, theme: BurstTheme): Promise<void> {
    const boss = this.host.findCardElement(cardId)
    const slot = this.host.findHandSlotElement(slotIndex)
    if (!boss || !slot) return
    await this.host.trails.animateResourceTrail(boss, slot, 3, theme)
    SquareBurst.playOn(slot, theme, { count: 18, spread: 125, duration: 520 })
    // 즉시 사라지지 않고 잿불에 닿은 듯 흔들→회색→검게 타오르며 사라진다.
    await slot.animate(
      [
        { transform: 'translateX(0) rotate(0deg) scale(1)', opacity: 1, filter: 'brightness(1) saturate(1) grayscale(0)' },
        { transform: 'translateX(-3px) rotate(-2deg) scale(1.01)', opacity: 1, filter: 'brightness(0.96) saturate(0.4) grayscale(0.6)', offset: 0.2 },
        { transform: 'translateX(3px) rotate(2deg) scale(1)', opacity: 1, filter: 'brightness(0.72) saturate(0) grayscale(1)', offset: 0.42 },
        { transform: 'translateX(-2px) rotate(-1.4deg) scale(0.97)', opacity: 0.92, filter: 'brightness(0.42) saturate(0) grayscale(1)', offset: 0.64 },
        { transform: 'translateX(0) rotate(0deg) scale(0.9)', opacity: 0, filter: 'brightness(0.06) saturate(0) grayscale(1) blur(2px)' },
      ],
      { duration: 620, easing: 'cubic-bezier(0.3, 0.1, 0.35, 1)', fill: 'forwards' }
    ).finished
  }

  /** 양초 고양이 손패 강탈 — 마녀 소각(animateBossBlastToHandSlot)을 참고하되 태우지 않고,
   *  발톱 스파크 블라스트 후 손패가 고양이 쪽으로 낚아채여 회전·축소·소멸하는 '뺏김' 연출. */
  async animateBossStealHandSlot(cardId: string, slotIndex: number): Promise<void> {
    const boss = this.host.findCardElement(cardId)
    const slot = this.host.findHandSlotElement(slotIndex)
    if (!slot) return
    // 발톱 스파크(마녀 소각과 같은 boss-ember-spark 테마)로 강탈 순간을 강조한다.
    SquareBurst.playOn(slot, 'boss-ember-spark', { count: 16, spread: 112, duration: 460 })
    // 보스 위치가 잡히면 손패를 그 방향으로 빨아들이고, 없으면 위로 낚아채 올린다.
    const sr = slot.getBoundingClientRect()
    const br = boss?.getBoundingClientRect()
    const dx = br ? (br.left + br.width / 2) - (sr.left + sr.width / 2) : 0
    const dy = br ? (br.top + br.height / 2) - (sr.top + sr.height / 2) : -sr.height * 2.2
    await slot.animate(
      [
        { transform: 'translate(0,0) rotate(0deg) scale(1)', opacity: 1, filter: 'brightness(1)' },
        { transform: `translate(${(dx * 0.26).toFixed(1)}px, ${(dy * 0.26).toFixed(1)}px) rotate(-11deg) scale(1.05)`, opacity: 1, filter: 'brightness(1.15)', offset: 0.24 },
        { transform: `translate(${(dx * 0.7).toFixed(1)}px, ${(dy * 0.7).toFixed(1)}px) rotate(20deg) scale(0.58)`, opacity: 0.72, filter: 'brightness(0.9)', offset: 0.7 },
        { transform: `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) rotate(36deg) scale(0.16)`, opacity: 0, filter: 'brightness(0.5)' },
      ],
      { duration: 560, easing: 'cubic-bezier(0.4, 0.05, 0.5, 1)', fill: 'forwards' }
    ).finished
  }

  /** 이벤트 불태우기: 지정 손패 슬롯을 흔들→회색화→위로 떠오르며 사라지는 소각 연출. */
  async animateHandCardBurn(slotIndex: number): Promise<void> {
    const slot = this.host.findHandSlotElement(slotIndex)
    if (!slot) return
    SquareBurst.playOn(slot, 'damage', { count: 12, spread: 72, duration: 380 })
    await new Promise<void>((r) => window.setTimeout(r, 55))
    await slot.animate(
      [
        { transform: 'translateX(0) translateY(0) scale(1)',       opacity: 1,    filter: 'brightness(1)    saturate(1)    grayscale(0)' },
        { transform: 'translateX(-4px) translateY(-3px) scale(1.02)', opacity: 1, filter: 'brightness(1.08) saturate(0.55) grayscale(0.32)', offset: 0.14 },
        { transform: 'translateX(4px)  translateY(-6px) scale(1.01)', opacity: 0.96, filter: 'brightness(0.88) saturate(0.2)  grayscale(0.72)', offset: 0.30 },
        { transform: 'translateX(-3px) translateY(-11px) scale(0.97)', opacity: 0.80, filter: 'brightness(0.58) saturate(0)   grayscale(1)',    offset: 0.50 },
        { transform: 'translateX(2px)  translateY(-18px) scale(0.93)', opacity: 0.50, filter: 'brightness(0.32) saturate(0)   grayscale(1)',    offset: 0.70 },
        { transform: 'translateX(0)    translateY(-28px) scale(0.85)', opacity: 0,    filter: 'brightness(0.06) saturate(0)  grayscale(1) blur(3px)' },
      ],
      { duration: 760, easing: 'cubic-bezier(0.28, 0.1, 0.32, 1)', fill: 'forwards' }
    ).finished
  }

  /** 30F 양초 백작: 보스에서 황금빛 분수 블라스트가 폭죽처럼 터진 뒤, 새로 생긴 손패
   *  슬롯들로 트레일이 날아가며 카드가 톡 생성되는 연출. (소각 연출의 반대 방향) */
  async animateBossScatterToHandSlots(cardId: string, slotIndices: number[]): Promise<void> {
    const boss = this.host.findCardElement(cardId)
    if (!boss || slotIndices.length === 0) return
    // 분수처럼 솟구치는 황금빛 폭죽 블라스트.
    SquareBurst.playOn(boss, 'treasure-gain', { count: 30, spread: 200, duration: 640, size: [8, 18] })
    await new Promise((r) => window.setTimeout(r, 180))
    // 각 슬롯으로 트레일을 순차 발사하고, 도착 시 슬롯이 톡 생성되도록 팝인.
    await Promise.all(
      slotIndices.map(async (slotIndex, i) => {
        await new Promise((r) => window.setTimeout(r, i * 110))
        const slot = this.host.findHandSlotElement(slotIndex)
        if (!slot) return
        await this.host.trails.animateResourceTrail(boss, slot, 3, 'treasure-gain')
        await slot.animate(
          [
            { transform: 'scale(0.6)', opacity: 0.2 },
            { transform: 'scale(1.12)', opacity: 1, offset: 0.6 },
            { transform: 'scale(1)', opacity: 1 },
          ],
          { duration: 320, easing: 'cubic-bezier(0.34,1.56,0.64,1)', fill: 'forwards' }
        ).finished
      })
    )
  }
}
