import { HEARTH_STYLES } from './HearthStyles'

export interface HearthHandlers {
  /** 모험 칸 클릭 — 런 진입 트리거. 현재는 상점 셔터 하강까지만 연결한다. */
  onAdventure: () => void | Promise<void>
}

/**
 * 거점(촛대) 화면. `/시작`에서 진입하며 인게임 빈 레일을 배경으로 재사용한다.
 * 거대한 오로라 커튼이 열리며 폐저택풍 배경이 드러나고, 하단 중앙 '모험' 칸이
 * 화륵 점등된다. 모험을 누르면 호스트가 넘긴 onAdventure(상점 셔터 하강)가 돈다.
 * 설정/도감 등은 플레이어 카드 옆 아이콘으로 빠지므로 여기선 9칸 스테이션만 다룬다.
 */
export class HearthScene {
  private overlay: HTMLElement | null = null
  private resizeListener: (() => void) | null = null
  private handlers: HearthHandlers | null = null
  /** 모험 칸 중복 클릭으로 셔터 연출이 겹치지 않도록 1회만 허용한다. */
  private resolved = false

  enter(handlers: HearthHandlers): void {
    this.injectStyles()
    this.handlers = handlers
    this.resolved = false

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
      const station = (e.target as HTMLElement).closest<HTMLElement>('[data-hearth-station="adventure"]')
      if (!station || this.resolved) return
      this.resolved = true
      void this.chooseAdventure(station)
    })

    // 거대한 문 열림(커튼) → 레일 공개 → 모험 칸 점등 순서.
    window.setTimeout(() => overlay.classList.add('is-opening'), 320)
    window.setTimeout(() => {
      overlay.querySelector<HTMLElement>('[data-hearth-station="adventure"]')?.classList.add('is-ignited')
    }, 320 + 940)
  }

  /** 모험 선택: 칸을 밝힌 뒤 허브 레이어를 걷고, 호스트의 셔터 하강을 호출한다. */
  private async chooseAdventure(station: HTMLElement): Promise<void> {
    station.classList.add('is-chosen')
    await this.wait(280)
    // 허브를 페이드아웃해 레일을 드러낸 다음 셔터가 그 위로 내려오게 한다.
    this.overlay?.classList.add('is-leaving')
    await this.wait(360)
    await this.handlers?.onAdventure()
    this.exit()
  }

  /**
   * 9칸 스테이션 그리드(0~8, row-major). 전체 배치/역할/해금 게이팅은
   * 기획서 `Unmelting_Game_Concept.md` §12(거점 화면)에 확정 명시돼 있다.
   *   0 길드 / 1 잿빛 굴레 / 2 현상금 / 3 암시장 / 4 타로 / 5 도박장
   *   6 무역 / 7 모험(하단 중앙) / 8 만찬
   * 현 단계는 `모험`(index 7) 한 칸만 점등·상호작용하고 나머지는 어둠으로 둔다
   * (초기 해금 상태). 무역·만찬 등은 추후 단계에서 같은 그리드에 점등한다.
   */
  private renderCells(): string {
    const cells: string[] = []
    for (let i = 0; i < 9; i++) {
      if (i === 7) {
        cells.push(
          `<button class="hearth-cell hearth-cell--adventure" data-hearth-station="adventure" type="button" aria-label="모험 시작">` +
            `<span class="hearth-flame" aria-hidden="true"></span>` +
            `<span class="hearth-cell__label">모험</span>` +
            `</button>`
        )
      } else {
        cells.push(`<div class="hearth-cell hearth-cell--dark" aria-hidden="true"></div>`)
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
