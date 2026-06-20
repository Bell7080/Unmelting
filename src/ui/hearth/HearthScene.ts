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

/** 우측 인스펙터에 띄울 각 스테이션의 한 줄 설명(§12-3 역할 요약). */
const STATION_DESC: Record<string, string> = {
  암시장: '턴이 갱신될 때마다 바뀌는 정해진 품목을 메타 화폐로 사들인다.',
  타로: '운명을 점친다. 어두운 거점에 드는 한 줄기 다른 빛.',
  도박장: '메타 코인을 걸어 유희를, 혹은 한탕을 노린다.',
  길드: '업적을 관리하고, 업적으로 새 동행 등을 해금한다.',
  '잿빛 굴레': '엔드리스 모드. 200층 진엔딩을 클리어하면 열린다.',
  서고: '전적과 기록을 보관하고, 그 기록을 바탕으로 영구 효과를 얻는다.',
  무역: '손패·유물 잠금·다음 판 계승 등을 메타 화폐로 영구 해금한다.',
  모험: '어둠으로 떠난다. 동행과 난이도를 정한 뒤 출발한다.',
  만찬: '모험 직전의 일회성 버프. 방문마다 무료 만찬이 한 번 차려진다.',
}

/**
 * 거점(촛대) 화면. `/시작`에서 진입하며 인게임 빈 레일을 배경으로 재사용한다.
 * 거대한 오로라 커튼이 열리며 폐저택풍 배경이 드러나고, 하단 중앙 '모험' 칸이
 * 화륵 점등된다. 모험을 누르면 로비 위로 검은 모험 셔터가 내려오고, 모험 자리의
 * '출발' 버튼을 누르면 호스트의 onStart(직업 선택/런 시작)가 돈다.
 * 나머지 8칸은 이름을 달고 어둡게 잠긴 상태로 1차 노출한다(해금은 추후 단계).
 *
 * 우측 인스펙터: 평소 비어 있고, `[data-inspect-title]` 요소(스테이션 칸·퀘스트 딱지)에
 * 마우스를 올리면 스르륵 떠올라 일러스트+제목/태그/설명을 보여 주고, 떼면 사라진다.
 */
export class HearthScene {
  private overlay: HTMLElement | null = null
  private inspector: HTMLElement | null = null
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

    // 우측 인스펙터(정보창) — 평소 비움, hover 시 떠오른다.
    const inspector = document.createElement('div')
    inspector.id = 'hearth-inspector'
    inspector.setAttribute('aria-hidden', 'true')
    inspector.innerHTML = `
      <div class="hearth-inspector-card">
        <div class="hearth-inspector-art" aria-hidden="true"></div>
        <div class="hearth-inspector-body">
          <div class="hearth-inspector-title"></div>
          <div class="hearth-inspector-divider" aria-hidden="true"></div>
          <div class="hearth-inspector-tags"></div>
          <div class="hearth-inspector-desc"></div>
        </div>
      </div>
    `
    document.body.appendChild(inspector)
    this.inspector = inspector

    this.alignToRail()
    this.alignInspector()
    const onResize = (): void => { this.alignToRail(); this.alignInspector() }
    this.resizeListener = onResize
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', onResize, true)

    // 인스펙터블(칸/딱지) hover 위임 — document 레벨이라 좌측 패널의 퀘스트 딱지도 잡는다.
    document.addEventListener('pointerover', this.onPointerOver)
    document.addEventListener('pointerout', this.onPointerOut)

    overlay.addEventListener('click', (e) => {
      const t = e.target as HTMLElement
      if (t.closest('[data-hearth-depart]')) {
        void this.depart()
        return
      }
      if (t.closest('[data-hearth-station="adventure"]')) this.descendShutter()
    })

    // /시작: 검은 화면에서 은은하게(천천히) 페이드인(타이틀 직후 게임 진입 연출).
    const fade = document.createElement('div')
    fade.id = 'hearth-fade'
    document.body.appendChild(fade)
    requestAnimationFrame(() => fade.classList.add('is-out'))
    window.setTimeout(() => fade.remove(), 1500)

    // 페이드인이 끝난 뒤에야 커튼 로직 시작: 조금 더 닫혀 있다가 천천히 열린다 → 모험 점등.
    window.setTimeout(() => this.overlay?.classList.add('is-opening'), 1700)
    window.setTimeout(() => {
      this.overlay?.querySelector<HTMLElement>('[data-hearth-station="adventure"]')?.classList.add('is-ignited')
    }, 1700 + 1500)
  }

  /** 인스펙터블에 들어오면 정보창을 채워 띄운다. */
  private onPointerOver = (e: PointerEvent): void => {
    const t = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-inspect-title]')
    if (t) this.showInspector(t)
  }

  /** 인스펙터블을 벗어나면 숨긴다(다른 인스펙터블로 옮겨가는 중이면 유지). */
  private onPointerOut = (e: PointerEvent): void => {
    const from = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-inspect-title]')
    if (!from) return
    const to = (e.relatedTarget as HTMLElement | null)?.closest?.('[data-inspect-title]')
    if (to) return
    this.hideInspector()
  }

  private showInspector(source: HTMLElement): void {
    const insp = this.inspector
    if (!insp) return
    const title = source.dataset.inspectTitle ?? ''
    const tag = source.dataset.inspectTag ?? ''
    const desc = source.dataset.inspectDesc ?? ''
    insp.querySelector<HTMLElement>('.hearth-inspector-title')!.textContent = title
    const tagEl = insp.querySelector<HTMLElement>('.hearth-inspector-tags')!
    tagEl.textContent = tag
    tagEl.style.display = tag ? '' : 'none'
    insp.querySelector<HTMLElement>('.hearth-inspector-desc')!.textContent = desc
    insp.classList.add('is-shown')
  }

  private hideInspector(): void {
    this.inspector?.classList.remove('is-shown')
  }

  /** 모험 선택 → 로비 위로 검은 모험 셔터가 내려오고, 모험 자리에 출발 버튼이 드러난다. */
  private descendShutter(): void {
    if (this.shuttered) return
    this.shuttered = true
    this.hideInspector()
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
   * 각 칸은 `data-inspect-*`로 우측 인스펙터 hover 정보를 제공한다.
   */
  private renderCells(): string {
    const lock =
      `<svg class="hearth-cell__lock" viewBox="0 0 24 24" fill="none" aria-hidden="true" ` +
      `stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">` +
      `<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>`
    const cells: string[] = []
    for (let i = 0; i < 9; i++) {
      const name = STATION_NAMES[i]
      const desc = STATION_DESC[name] ?? ''
      if (i === ADVENTURE_INDEX) {
        cells.push(
          `<button class="hearth-cell hearth-cell--adventure" data-hearth-station="adventure" type="button" aria-label="모험 시작"` +
            ` data-inspect-title="${name}" data-inspect-tag="개방" data-inspect-desc="${desc}">` +
            `<span class="hearth-flame" aria-hidden="true"></span>` +
            `<span class="hearth-cell__label">${name}</span>` +
            `</button>`
        )
      } else {
        cells.push(
          `<div class="hearth-cell hearth-cell--locked" aria-label="${name} · 잠김"` +
            ` data-inspect-title="${name}" data-inspect-tag="잠김" data-inspect-desc="${desc}">` +
            lock +
            `<span class="hearth-cell__name">${name}</span>` +
            `</div>`
        )
      }
    }
    return cells.join('')
  }

  /** 인스펙터를 우측 전체로 펼친다 — 레일 우측 절반부터 화면 우측 끝까지(레일을 일부 침범). */
  private alignInspector(): void {
    const rail = document.querySelector<HTMLElement>('#game-board .rail')
    const insp = this.inspector
    if (!rail || !insp) return
    const r = rail.getBoundingClientRect()
    const rightMargin = Math.max(12, window.innerWidth * 0.02)
    // 가장 우측 칸의 절반(≈레일 폭의 5/6 지점)부터 화면 우측 끝까지만 침범한다.
    const left = r.left + r.width * 0.82
    const right = window.innerWidth - rightMargin
    insp.style.left = `${left}px`
    insp.style.top = `${r.top}px`
    insp.style.width = `${Math.max(200, right - left)}px`
    insp.style.height = `${r.height}px`
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
    document.removeEventListener('pointerover', this.onPointerOver)
    document.removeEventListener('pointerout', this.onPointerOut)
    this.inspector?.remove()
    this.inspector = null
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
