import { HEARTH_STYLES } from './HearthStyles'

export interface HearthHandlers {
  /** 출발 버튼 클릭 — 직업 선택/런 시작으로 연결한다. */
  onStart: () => void | Promise<void>
}

/**
 * 9칸 스테이션 이름(0~8, row-major). 배치/역할/해금은 기획서
 * `Unmelting_Game_Concept.md` §12 참조 — 잿빛 굴레가 중앙(index 4).
 */
const STATION_NAMES = [
  '암시장', '타로', '도박장',
  '길드', '잿빛 굴레', '서고',
  '무역', '모험', '만찬',
] as const
/** 하단 중앙 = 모험. 현 단계는 이 칸만 점등·상호작용한다. */
const ADVENTURE_INDEX = 7

/**
 * 거점(촛대) 화면. `/시작`에서 진입하며 인게임 빈 레일을 배경으로 재사용한다.
 * 거대한 오로라 커튼이 열리며 폐저택풍 배경이 드러나고, 하단 중앙 '모험' 칸이
 * 화륵 점등된다. 모험을 누르면 로비 위로 검은 모험 셔터가 내려오고, 모험 자리의
 * '출발' 버튼을 누르면 호스트의 onStart(직업 선택/런 시작)가 돈다.
 * 나머지 8칸은 이름을 달고 어둡게 잠긴 상태로 1차 노출한다(해금은 추후 단계).
 */
export class HearthScene {
  private overlay: HTMLElement | null = null
  private resizeListener: (() => void) | null = null
  private handlers: HearthHandlers | null = null
  /** 모험 칸 1회만 셔터를 내린다. */
  private shuttered = false
  /** 출발 1회만 런으로 넘어간다. */
  private departing = false

  enter(handlers: HearthHandlers): void {
    this.injectStyles()
    this.handlers = handlers
    this.shuttered = false
    this.departing = false

    const overlay = document.createElement('div')
    overlay.id = 'hearth-overlay'
    overlay.setAttribute('role', 'dialog')
    overlay.setAttribute('aria-label', '거점')
    overlay.innerHTML = `
      <div class="hearth-shell">
        <div class="hearth-bg" aria-hidden="true"></div>
        <div class="hearth-grid">${this.renderCells()}</div>
        <div class="job-rail-curtain job-rail-curtain--left hearth-curtain" aria-hidden="true"></div>
        <div class="job-rail-curtain job-rail-curtain--right hearth-curtain" aria-hidden="true"></div>
        <div class="hearth-shutter" aria-hidden="true">
          <button class="hearth-depart" type="button" data-hearth-depart>출발</button>
        </div>
      </div>
    `
    document.body.appendChild(overlay)
    this.overlay = overlay

    this.alignToRail()
    const onResize = (): void => this.alignToRail()
    this.resizeListener = onResize
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', onResize, true)

    overlay.addEventListener('click', (e) => {
      const t = e.target as HTMLElement
      if (t.closest('[data-hearth-depart]')) {
        void this.depart()
        return
      }
      if (t.closest('[data-hearth-station="adventure"]')) this.descendShutter()
    })

    // /시작: 검은 화면에서 천천히 페이드인(타이틀 직후 게임 진입 연출).
    const fade = document.createElement('div')
    fade.id = 'hearth-fade'
    document.body.appendChild(fade)
    requestAnimationFrame(() => fade.classList.add('is-out'))
    window.setTimeout(() => fade.remove(), 1000)

    // 페이드인이 끝난 뒤: 거대한 문 열림(커튼) → 레일 공개 → 모험 칸 점등 순서.
    window.setTimeout(() => overlay.classList.add('is-opening'), 820)
    window.setTimeout(() => {
      overlay.querySelector<HTMLElement>('[data-hearth-station="adventure"]')?.classList.add('is-ignited')
    }, 820 + 940)
  }

  /** 모험 선택 → 로비 위로 검은 모험 셔터가 내려오고, 모험 자리에 출발 버튼이 드러난다. */
  private descendShutter(): void {
    if (this.shuttered) return
    this.shuttered = true
    this.overlay?.classList.add('is-shuttering')
    // 셔터 하강이 끝난 뒤 출발 버튼을 띄운다(셔터 transition과 동기).
    window.setTimeout(() => this.overlay?.classList.add('is-shutter-rest'), 680)
  }

  /** 출발 → 직업 선택/런 시작. 직업 오버레이(z=200)가 검은 셔터 위로 떠 이음새를 가린 뒤 허브를 걷는다. */
  private async depart(): Promise<void> {
    if (this.departing) return
    this.departing = true
    this.overlay?.querySelector<HTMLElement>('[data-hearth-depart]')?.classList.add('is-pressed')
    void this.handlers?.onStart()
    await this.wait(480)
    this.exit()
  }

  /**
   * 9칸 스테이션 그리드(0~8, row-major). 전체 배치/역할/해금 게이팅은
   * 기획서 `Unmelting_Game_Concept.md` §12(거점 화면)에 확정 명시돼 있다.
   *   0 암시장 / 1 타로 / 2 도박장 / 3 길드 / 4 잿빛 굴레(중앙) / 5 서고
   *   6 무역 / 7 모험(하단 중앙) / 8 만찬
   * 현 단계는 `모험`(index 7)만 점등·상호작용하고, 나머지는 이름을 단 채
   * 어둡게 잠긴 칸으로 노출한다(초기 해금 상태). 해금은 추후 단계.
   */
  private renderCells(): string {
    const lock =
      `<svg class="hearth-cell__lock" viewBox="0 0 24 24" fill="none" aria-hidden="true" ` +
      `stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">` +
      `<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>`
    const cells: string[] = []
    for (let i = 0; i < 9; i++) {
      if (i === ADVENTURE_INDEX) {
        cells.push(
          `<button class="hearth-cell hearth-cell--adventure" data-hearth-station="adventure" type="button" aria-label="모험 시작">` +
            `<span class="hearth-flame" aria-hidden="true"></span>` +
            `<span class="hearth-cell__label">모험</span>` +
            `</button>`
        )
      } else {
        cells.push(
          `<div class="hearth-cell hearth-cell--locked" aria-label="${STATION_NAMES[i]} · 잠김">` +
            lock +
            `<span class="hearth-cell__name">${STATION_NAMES[i]}</span>` +
            `</div>`
        )
      }
    }
    return cells.join('')
  }

  /** 상점/직업 선택과 동일하게 셸을 실제 레일 rect에 고정한다. */
  private alignToRail(): void {
    const rail = document.querySelector<HTMLElement>('#game-board .rail')
    const shell = this.overlay?.querySelector<HTMLElement>('.hearth-shell')
    if (!rail || !shell) return
    const rect = rail.getBoundingClientRect()
    shell.style.left = `${rect.left}px`
    shell.style.top = `${rect.top}px`
    shell.style.width = `${rect.width}px`
    shell.style.height = `${rect.height}px`
  }

  exit(): void {
    if (this.resizeListener) {
      window.removeEventListener('resize', this.resizeListener)
      window.removeEventListener('scroll', this.resizeListener, true)
      this.resizeListener = null
    }
    this.overlay?.remove()
    this.overlay = null
    this.handlers = null
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => window.setTimeout(resolve, ms))
  }

  private injectStyles(): void {
    if (document.getElementById('hearth-styles')) return
    const style = document.createElement('style')
    style.id = 'hearth-styles'
    style.textContent = HEARTH_STYLES
    document.head.appendChild(style)
  }
}
