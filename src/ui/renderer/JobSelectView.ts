/**
 * JobSelectView — 시작 직업 선택 오버레이(레일 내부 암막 + 커버플로우 캐러셀 + HUD 블라스트).
 * GameBoardRenderer에서 표시 책임만 옮겨 왔다 — 렌더 상태의 단일 출처는 host다.
 */

import type { GameBoardRenderer } from '@ui/GameBoardRenderer'
import type { JobDef } from '@data/Jobs'
import { spriteForJob } from '@ui/Sprites'
import { SquareBurst, type BurstTheme } from '@ui/SquareBurst'

export class JobSelectView {
  constructor(private readonly host: GameBoardRenderer) {}

  /** 직업 선택 후 화면 중앙으로 날아간 카드 고스트 — 게임 진입 후 HUD 블라스트에 재사용. */
  jobFlightCard: HTMLElement | null = null
  /** 레일 내부 직업 선택 암막. 선택 후 보드가 채워질 때까지 남겨 몰입 전환을 가린다. */
  jobSelectOverlayElement: HTMLElement | null = null
  /** 창 크기 변화에도 직업 선택 암막이 레일 프레임에 붙어 있도록 유지하는 리스너. */
  jobSelectResizeListener: (() => void) | null = null

  /** In-rail job-selection overlay shown once at game start.
   *  Character-select grammar: trial/relic-card aspect (3/4) illustrated cards
   *  (job_001~, wired via spriteForJob — empty placeholder until art exists),
   *  with name/trait/stat/flavor on a bottom scrim. Unlocked jobs are sorted
   *  ahead of locked ones; a one-card-at-a-time carousel handles overflow
   *  (arrows + drag-to-fling). On pick: 비선택 카드는 어두워지고, 선택 카드는
   *  빛나는 잔상과 함께 축소되어 화면 중앙으로 날아가고 타이틀은 페이드 아웃된다.
   *  남은 고스트는 animateJobCardToHud가 HUD로 블라스트한다.
   *  Resolves with the chosen job id when the player clicks a non-locked card. */
  openJobSelect(jobs: JobDef[]): Promise<string> {
    this.clearJobSelectOverlay()
    return new Promise<string>((resolve) => {
      const lockIcon = `<svg class="job-card__lock-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"
          stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="5" y="11" width="14" height="10" rx="2"/>
        <path d="M8 11V7a4 4 0 0 1 8 0v4"/>
      </svg>`
      // 좌우 넘김 화살표 — chevron. 평소엔 투명, overlay hover 시 은은히 드러난다.
      const chevron = (dir: 'left' | 'right') => `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"
          stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="${dir === 'left' ? 'M15 5 L8 12 L15 19' : 'M9 5 L16 12 L9 19'}"/>
      </svg>`

      // 잠긴 직업은 뒤로(열린 직업 우선). 동일 그룹 내 원래 순서는 안정 정렬로 유지된다.
      const ordered = [...jobs].sort((a, b) => (a.locked ? 1 : 0) - (b.locked ? 1 : 0))

      const overlay = document.createElement('div')
      overlay.id = 'job-select-overlay'
      overlay.setAttribute('role', 'dialog')
      overlay.setAttribute('aria-label', '직업 선택')
      overlay.innerHTML = `
        <div class="job-select-rail-shell">
          <div class="job-rail-curtain job-rail-curtain--left" aria-hidden="true"></div>
          <div class="job-rail-curtain job-rail-curtain--right" aria-hidden="true"></div>
          <div class="job-select-content-bundle">
            <div class="job-select-header">
              <span class="job-select-rule"></span>
              <h2 class="job-select-title">직업 선택</h2>
              <span class="job-select-rule"></span>
            </div>
            <div class="job-select-stage">
              <button class="job-nav job-nav--left" type="button" data-job-nav="left" aria-label="이전">${chevron('left')}</button>
              <div class="job-coverflow">
                ${ordered.map((job) => {
                  const art = spriteForJob(job.illu)
                  return `
                  <button class="job-card${job.locked ? ' job-card--locked' : ''}"
                          data-job-id="${job.id}"
                          ${job.locked ? 'aria-disabled="true"' : ''}
                          type="button">
                    <div class="job-card__art${art ? '' : ' job-card__art--empty'}"
                         ${art ? `style="background-image:url('${art}')"` : ''} aria-hidden="true">
                      ${art ? '' : `<div class="job-card__symbol">${job.symbolSvg}</div>`}
                    </div>
                    <div class="job-card__sheen" aria-hidden="true"></div>
                    ${job.locked ? `<div class="job-card__lock">${lockIcon}<span class="job-card__lock-label">잠김</span></div>` : ''}
                    <div class="job-card__scrim">
                      <div class="job-card__name">${job.name}</div>
                      <div class="job-card__divider" aria-hidden="true"></div>
                      <div class="job-card__traits">${job.traits}</div>
                      ${job.stats ? `<div class="job-card__stats">${job.stats}</div>` : ''}
                      <div class="job-card__flavor">${job.flavor}</div>
                    </div>
                  </button>
                `}).join('')}
              </div>
              <button class="job-nav job-nav--right" type="button" data-job-nav="right" aria-label="다음">${chevron('right')}</button>
            </div>
          </div>
        </div>
      `
      document.body.appendChild(overlay)
      this.jobSelectOverlayElement = overlay

      // 상점처럼 body 레이어를 레일 rect에 고정해 HUD/손패는 살아 있고 선택 UI만 보드 안에 뜨게 한다.
      const alignToRail = (): void => {
        const rail = this.host.boardElement.querySelector<HTMLElement>('.rail')
        const shell = overlay.querySelector<HTMLElement>('.job-select-rail-shell')
        if (!rail || !shell) return
        const rect = rail.getBoundingClientRect()
        shell.style.left = `${rect.left}px`
        shell.style.top = `${rect.top}px`
        shell.style.width = `${rect.width}px`
        shell.style.height = `${rect.height}px`
      }
      let relayoutJobCards = (): void => {}
      const onShellResize = () => { alignToRail(); relayoutJobCards() }
      this.jobSelectResizeListener = onShellResize
      window.addEventListener('resize', onShellResize)
      window.addEventListener('scroll', onShellResize)

      // ── 커버플로우 캐러셀 ─────────────────────────────────────────
      // 무한 루프(끝↔끝 연결), 가운데 카드일수록 크고 밝게/좌우로 갈수록 작고 어둡게.
      // 화살표/드래그로 좌우 자유롭게 넘기고, 가운데 카드를 클릭하면 선택 확정된다.
      const flow = overlay.querySelector<HTMLElement>('.job-coverflow')!
      const leftBtn = overlay.querySelector<HTMLElement>('[data-job-nav="left"]')!
      const rightBtn = overlay.querySelector<HTMLElement>('[data-job-nav="right"]')!
      const cards = [...flow.querySelectorAll<HTMLElement>('.job-card')]
      const n = cards.length
      overlay.classList.toggle('has-overflow', n > 1)

      let current = 0      // 가운데 인덱스(드래그 중에는 소수값)
      let resolving = false

      // 인접 카드 간 가로 간격(카드 폭 기준) — 포커처럼 살짝 겹치도록 0.56배.
      const stepPx = () => (cards[0]?.offsetWidth || 200) * 0.56
      // current 기준 i의 최단 부호 거리(무한 루프 wrap).
      const wrapOff = (i: number) => {
        let o = (((i - current) % n) + n) % n
        if (o > n / 2) o -= n
        return o
      }
      const VISIBLE = 2   // 가운데 + 좌우 2장 = 5장 노출(ㅁㅁㅁㅁㅁ)
      const layout = () => {
        const sp = stepPx()
        for (let i = 0; i < n; i++) {
          const off = wrapOff(i)
          const a = Math.abs(off)
          const card = cards[i]
          const visible = a <= VISIBLE + 0.6
          const scale = Math.max(0.6, 1 - a * 0.15)
          const opacity = visible ? Math.max(0.16, 1 - a * 0.3) : 0
          card.style.transform =
            `translate(-50%, -50%) translateX(${off * sp}px) scale(${scale}) rotateY(${off * -7}deg)`
          card.style.opacity = String(opacity)
          card.style.zIndex = String(100 - Math.round(a * 10))
          card.style.filter = `brightness(${Math.max(0.4, 1 - a * 0.22)}) saturate(${Math.max(0.5, 1 - a * 0.14)})`
          card.style.pointerEvents = visible && opacity > 0.2 ? 'auto' : 'none'
          card.classList.toggle('is-center', a < 0.5)
        }
      }
      relayoutJobCards = layout
      const settle = (next: number) => { flow.classList.remove('is-dragging'); current = next; layout() }
      const go = (dir: number) => { if (!resolving) settle(Math.round(current) + dir) }

      // ── 선택 확정: 가운데 카드 빛나는 잔상→축소, 고스트로 복제해 게임 진입까지 유지 ──
      const confirmPick = (card: HTMLElement, job: JobDef) => {
        if (resolving) return
        resolving = true
        teardown()
        overlay.classList.add('is-resolving')
        card.classList.add('job-card--selected')
        window.setTimeout(() => {
          // 복사본 대신 원본 카드를 body로 이동해 고스트로 활용한다.
          // getBoundingClientRect() 로 현재 렌더 위치(scale 포함)를 캡처한 뒤
          // inline fixed 좌표로 고정해 시각적 점프 없이 DOM 위치만 바꾼다.
          const rect = card.getBoundingClientRect()
          card.classList.remove('job-card--selected', 'is-center')
          card.classList.add('job-flight-card')
          card.style.position = 'fixed'
          card.style.left = `${rect.left}px`
          card.style.top = `${rect.top}px`
          card.style.width = `${rect.width}px`
          card.style.height = `${rect.height}px`
          card.style.margin = '0'
          card.style.zIndex = '210'
          card.style.opacity = '1'
          card.style.transform = 'none'
          card.style.filter = 'none'
          card.style.transition = 'none'
          card.style.transformOrigin = 'center center'
          card.style.pointerEvents = 'none'
          document.body.appendChild(card)
          this.jobFlightCard = card
          // 선택 후에는 콘텐츠만 접고 암막은 유지한다. 호출부가 보드를 채운 뒤 playJobCurtainOpen()으로 걷는다.
          overlay.classList.add('job-select--picked')
          window.setTimeout(() => resolve(job.id), 360)
        }, 440)
      }

      // ── 입력: 화살표 / 카드 클릭(가운데=선택, 측면=가운데로) / 드래그 / 키보드 ──
      const onLeft = (e: Event) => { e.stopPropagation(); go(-1) }
      const onRight = (e: Event) => { e.stopPropagation(); go(1) }
      leftBtn.addEventListener('click', onLeft)
      rightBtn.addEventListener('click', onRight)

      let dragging = false
      let moved = false
      let startX = 0
      let startCurrent = 0
      let lastX = 0
      let lastT = 0
      let vel = 0
      const onDown = (e: PointerEvent) => {
        if (resolving) return
        dragging = true; moved = false
        startX = e.clientX; startCurrent = current
        lastX = e.clientX; lastT = performance.now(); vel = 0
        flow.classList.add('is-dragging')
      }
      const onMove = (e: PointerEvent) => {
        if (!dragging) return
        const dx = e.clientX - startX
        if (Math.abs(dx) > 6) moved = true
        current = startCurrent - dx / stepPx()
        layout()
        const now = performance.now()
        const dt = now - lastT
        if (dt > 0) vel = (e.clientX - lastX) / dt
        lastX = e.clientX; lastT = now
      }
      const onUp = () => {
        if (!dragging) return
        dragging = false
        // 플릭 속도가 빠르면 한두 칸 더 넘어가는 관성을 준다.
        let landing = current
        if (Math.abs(vel) > 0.45) landing += Math.sign(-vel) * (Math.abs(vel) > 1.1 ? 2 : 1)
        settle(Math.round(landing))
      }
      const onCardClick = (e: MouseEvent) => {
        if (resolving || moved) return
        const card = (e.target as HTMLElement).closest<HTMLElement>('.job-card')
        if (!card) return
        const i = cards.indexOf(card)
        if (i < 0) return
        const off = wrapOff(i)
        if (Math.round(off) !== 0) { settle(current + off); return }  // 측면 카드 → 가운데로
        const job = ordered[i]
        if (job.locked) {
          card.classList.add('is-denied')
          window.setTimeout(() => card.classList.remove('is-denied'), 420)
          return
        }
        confirmPick(card, job)
      }
      const onKey = (e: KeyboardEvent) => {
        if (resolving) return
        if (e.key === 'ArrowLeft') go(-1)
        else if (e.key === 'ArrowRight') go(1)
        else if (e.key === 'Enter') {
          const i = (((Math.round(current)) % n) + n) % n
          if (!ordered[i].locked) confirmPick(cards[i], ordered[i])
        }
      }
      const onResize = () => { alignToRail(); layout() }

      flow.addEventListener('pointerdown', onDown)
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      flow.addEventListener('click', onCardClick)
      window.addEventListener('keydown', onKey)
      window.addEventListener('resize', onResize)

      const teardown = () => {
        leftBtn.removeEventListener('click', onLeft)
        rightBtn.removeEventListener('click', onRight)
        flow.removeEventListener('pointerdown', onDown)
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        flow.removeEventListener('click', onCardClick)
        window.removeEventListener('keydown', onKey)
        window.removeEventListener('resize', onResize)
      }

      alignToRail()
      layout()
      requestAnimationFrame(() => { alignToRail(); layout() })   // 폰트/레이아웃 안정 후 카드 폭 재반영
    })
  }

  /** 게임 진입 직후, 화면 중앙에 남은 직업 고스트 카드가 능력에 맞는 HUD로 블라스트를
   *  날린 뒤 사라진다(스폰 확률 패널 / 체력 / 공격력 / 화폐). 수치 롤은 render()의
   *  자동 카운터가 담당하고, 여기서는 트레일/버스트와 카드 소멸 연출만 책임진다. */
  async animateJobCardToHud(job: JobDef): Promise<void> {
    const ghost = this.jobFlightCard
    if (!ghost) return
    const origin = ghost.getBoundingClientRect()

    // 스폰 보정은 한 직업당 한 종류만 있으므로 우선순위로 단일 테마를 고른다.
    let spawnTheme: BurstTheme | null = null
    if (job.spawnEnemy > 0) spawnTheme = 'damage'
    else if (job.spawnTreasure > 0) spawnTheme = 'treasure-gain'
    else if (job.spawnFlower > 0) spawnTheme = 'flower-bloom'

    const tasks: Promise<void>[] = []
    if (spawnTheme) {
      const panel = this.host.boardElement.querySelector<HTMLElement>('.spawn-prob-panel')
      if (panel) tasks.push(this.host.trails.animateResourceTrail(origin, panel, 1, spawnTheme))
    }
    if (job.healthBonus > 0) tasks.push(this.host.trails.animateResourceTrail(origin, this.host.trails.findResourceTrailTarget('health'), 1, 'health-gain'))
    if (job.damageBonus > 0) tasks.push(this.host.trails.animateResourceTrail(origin, this.host.trails.findResourceTrailTarget('attack'), 1, 'attack-gain'))

    if (tasks.length > 0) {
      ghost.classList.add('is-emitting')
      await Promise.all(tasks)
    } else {
      // 가지지 못한 자: 블라스트 없이 잠깐 머문 뒤 조용히 사라진다.
      await new Promise<void>((r) => window.setTimeout(r, 240))
    }

    // 카드 소멸 — 중앙에서 연기 버스트 후 축소 페이드.
    SquareBurst.playAt(
      origin.left + origin.width / 2,
      origin.top + origin.height / 2,
      'vanish-smoke',
      { count: 14, spread: 120, duration: 480 }
    )
    await ghost
      .animate(
        [
          { opacity: 1, transform: 'scale(1)' },
          { opacity: 0, transform: 'scale(0.72)' },
        ],
        { duration: 360, easing: 'ease', fill: 'forwards' }
      )
      .finished.catch(() => {})
    ghost.remove()
    this.jobFlightCard = null
  }

  /** 직업 선택 암막을 좌우로 걷어 새로 채워진 3×3 레일을 처음 공개한다. */
  playJobCurtainOpen(): Promise<void> {
    const overlay = this.jobSelectOverlayElement
    if (!overlay) return Promise.resolve()
    overlay.classList.add('job-select--opening')
    return new Promise((resolve) => {
      window.setTimeout(() => {
        this.clearJobSelectOverlay()
        resolve()
      }, 780)
    })
  }

  /** 직업 선택 레이어와 레일 정렬 리스너를 한 번에 치워 새 런/리셋 잔상을 막는다. */
  clearJobSelectOverlay(): void {
    if (this.jobSelectResizeListener) {
      window.removeEventListener('resize', this.jobSelectResizeListener)
      window.removeEventListener('scroll', this.jobSelectResizeListener)
      this.jobSelectResizeListener = null
    }
    this.jobSelectOverlayElement?.remove()
    this.jobSelectOverlayElement = null
  }
}
