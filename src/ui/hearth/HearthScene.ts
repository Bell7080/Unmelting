import { HEARTH_STYLES } from './HearthStyles'
import { SpriteUrls, spriteForHearthStation } from '../Sprites'
import { isTouchDevice } from '../MobileTouchManager'
import { SquareBurst } from '../SquareBurst'

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
/** 하단 중앙 = 모험. 나머지 칸도 임시 잠금 해제 상태로 점등해 로비 전체를 테스트한다. */
const ADVENTURE_INDEX = 7

/** 모험 셔터 안에서 고를 수 있는 동행 목록. 해강 외 슬롯은 추후 캐릭터 설계 연결용 임시 자리다. */
const HEARTH_CHARACTERS = [
  { id: 'haegang', name: '해강', role: '녹지 않는 소녀', desc: '검은 셔터 너머 첫 모험을 함께 시작하는 기본 동행.', art: SpriteUrls.player },
  { id: 'ember', name: '빈 동행 I', role: '추후 해금', desc: '새 캐릭터 설계가 들어올 때 연결할 임시 프로필 칸.', art: SpriteUrls.player },
  { id: 'wax', name: '빈 동행 II', role: '추후 해금', desc: '업적·길드 해금과 이어질 캐릭터 자리.', art: SpriteUrls.player },
  { id: 'ash', name: '빈 동행 III', role: '추후 해금', desc: '서고 기록 또는 엔드리스 보상과 연결할 예비 칸.', art: SpriteUrls.player },
  { id: 'candle', name: '빈 동행 IV', role: '추후 해금', desc: '추후 프로필 배경/능력치를 대체할 수 있는 얇은 카드.', art: SpriteUrls.player },
] as const

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
  /** 대문이 열리기 전(고정 인트로 연출) 동안엔 hover 인스펙터를 막는다. */
  private interactive = false
  /** 터치 기기: hover 대신 탭으로 인스펙터를 토글한다. */
  private touchMode = false
  /** 현재 인스펙터를 띄운 소스 요소(터치 탭 토글 판정용). */
  private inspectSource: HTMLElement | null = null
  /** 셔터 내부 캐릭터 선택 인덱스. 선택 전에는 카드 스트립과 큰 배경을 동기화한다. */
  private selectedCharacterIndex = 0
  /** 캐릭터 확정 후 출발 버튼을 다시 띄워 중복 선택 애니메이션을 막는다. */
  private characterConfirmed = false

  enter(handlers: HearthHandlers): void {
    this.injectStyles()
    this.handlers = handlers
    this.shuttered = false
    this.departing = false
    this.interactive = false

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
          <button class="hearth-back" type="button" data-hearth-back>뒤로가기</button>
          <div class="hearth-character-stage" aria-live="polite">
            <div class="hearth-character-bg" style="--character-art: url('${HEARTH_CHARACTERS[0].art}')" aria-hidden="true"></div>
            <div class="hearth-character-copy">
              <span class="hearth-character-kicker">동행 선택</span>
              <strong>${HEARTH_CHARACTERS[0].name}</strong>
              <small>${HEARTH_CHARACTERS[0].desc}</small>
            </div>
          </div>
          <button class="hearth-depart" type="button" data-hearth-select>선택</button>
          <div class="hearth-character-strip" role="listbox" aria-label="캐릭터 선택">${this.renderCharacterCards()}</div>
        </div>
      </div>
    `
    // 커튼 위에 반투명하게 깔리는 대문(hearth_bg_002)을 변수로 주입한다.
    overlay.style.setProperty('--hearth-door', `url('${SpriteUrls.hearth.door}')`)
    document.body.appendChild(overlay)
    this.overlay = overlay

    // 우측 인스펙터(정보창) — 평소 비움, hover 시 떠오른다.
    const inspector = document.createElement('div')
    inspector.id = 'hearth-inspector'
    inspector.setAttribute('aria-hidden', 'true')
    inspector.innerHTML = `
      <div class="hearth-inspector-card">
        <div class="hearth-inspector-scrim" aria-hidden="true">
          <div class="hearth-inspector-art"></div>
          <div class="hearth-inspector-grad"></div>
        </div>
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

    // 인스펙터블(칸/딱지) 위임 — document 레벨이라 좌측 패널의 퀘스트 딱지도 잡는다.
    // 터치 기기엔 hover가 없으므로 탭 토글(capture 단계)로 대체한다.
    this.touchMode = isTouchDevice()
    if (this.touchMode) {
      document.addEventListener('click', this.onTap, true)
    } else {
      document.addEventListener('pointerover', this.onPointerOver)
      document.addEventListener('pointerout', this.onPointerOut)
    }

    overlay.addEventListener('click', (e) => {
      const t = e.target as HTMLElement
      if (t.closest('[data-hearth-back]')) {
        this.raiseShutter()
        return
      }
      const characterCard = t.closest<HTMLElement>('[data-hearth-character]')
      if (characterCard) {
        this.selectCharacter(Number(characterCard.dataset.hearthCharacter ?? 0))
        return
      }
      if (t.closest('[data-hearth-select]')) {
        void this.confirmCharacter()
        return
      }
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
      this.overlay?.querySelectorAll<HTMLElement>('.hearth-cell--open, [data-hearth-station="adventure"]').forEach((cell, idx) => {
        // 임시 전면 개방 상태에서도 모든 칸이 모험처럼 같은 beat로 점등되도록 순차 발화한다.
        window.setTimeout(() => cell.classList.add('is-ignited'), idx * 55)
      })
      // 대문이 다 열리고 모험이 점등된 뒤에야 hover 인스펙터를 허용한다(플레이어블 시작).
      this.interactive = true
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

  /**
   * 터치 탭 토글(capture 단계).
   *   - 인스펙터블 첫 탭: 정보 표시 + 이 탭의 칸 동작(모험 셔터 등)은 막는다.
   *   - 같은 칸 두 번째 탭: 정보 닫고 칸 동작은 진행시킨다.
   *   - 빈 곳 탭: 정보 닫기.
   */
  private onTap = (e: MouseEvent): void => {
    if (!this.interactive) return
    const el = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-inspect-title]') ?? null
    if (!el) { this.hideInspector(); return }
    if (this.inspectSource === el) { this.hideInspector(); return }
    this.showInspector(el)
    this.inspectSource = el
    // 첫 탭은 정보 표시 전용 — 칸의 click 동작(overlay 핸들러)으로 전파되지 않게 막는다.
    e.stopPropagation()
  }

  private showInspector(source: HTMLElement): void {
    // 인트로(대문 열림) 동안엔 막는다 — 플레이어블 상태에서만 정보창을 띄운다.
    if (!this.interactive) return
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
    // 일러스트: data-inspect-art가 있으면 실제 이미지로, 없으면 CSS 플레이스홀더로 되돌린다.
    const artUrl = source.dataset.inspectArt
    insp.querySelector<HTMLElement>('.hearth-inspector-art')!.style.backgroundImage = artUrl ? `url('${artUrl}')` : ''
    insp.classList.add('is-shown')
  }

  private hideInspector(): void {
    this.inspector?.classList.remove('is-shown')
    this.inspectSource = null
  }

  /** 모험 선택 → 로비 위로 검은 모험 셔터가 내려오고, 모험 자리에 출발 버튼이 드러난다. */
  private descendShutter(): void {
    if (this.shuttered) return
    this.shuttered = true
    this.hideInspector()
    this.selectedCharacterIndex = 0
    this.characterConfirmed = false
    this.overlay?.classList.add('is-shuttering')
    const departButton = this.overlay?.querySelector<HTMLElement>('.hearth-depart')
    if (departButton) {
      departButton.textContent = '선택'
      departButton.removeAttribute('data-hearth-depart')
      departButton.setAttribute('data-hearth-select', '')
    }
    this.selectCharacter(0)
    // 셔터 하강이 끝난 뒤 출발 버튼을 띄운다(셔터 transition과 동기).
    window.setTimeout(() => this.overlay?.classList.add('is-shutter-rest'), 680)
  }


  /** 뒤로가기 → 검은 셔터를 다시 올리고 로비 9칸 상호작용으로 돌아간다. */
  private raiseShutter(): void {
    if (!this.shuttered || this.departing) return
    this.shuttered = false
    this.characterConfirmed = false
    this.overlay?.classList.remove('is-shuttering', 'is-shutter-rest', 'is-character-confirmed')
  }

  /** 얇은 프로필 카드 목록을 직업 선택 카드처럼 현재 선택 중심으로 갱신한다. */
  private selectCharacter(index: number): void {
    const clamped = Math.max(0, Math.min(HEARTH_CHARACTERS.length - 1, index))
    this.selectedCharacterIndex = clamped
    const character = HEARTH_CHARACTERS[clamped]
    const root = this.overlay
    if (!root) return
    root.querySelectorAll<HTMLElement>('[data-hearth-character]').forEach((card) => {
      const active = Number(card.dataset.hearthCharacter ?? -1) === clamped
      card.classList.toggle('is-selected', active)
      card.setAttribute('aria-selected', active ? 'true' : 'false')
    })
    const bg = root.querySelector<HTMLElement>('.hearth-character-bg')
    bg?.style.setProperty('--character-art', `url('${character.art}')`)
    root.querySelector<HTMLElement>('.hearth-character-copy strong')!.textContent = character.name
    root.querySelector<HTMLElement>('.hearth-character-copy small')!.textContent = character.desc
  }

  /** 캐릭터 확정 → 카드/버튼 하강, 큰 배경이 빛으로 접힌 뒤 플레이어 카드 위치에 꽂힌다. */
  private async confirmCharacter(): Promise<void> {
    if (this.characterConfirmed || this.departing) return
    this.characterConfirmed = true
    const root = this.overlay
    const stage = root?.querySelector<HTMLElement>('.hearth-character-stage')
    const target = document.querySelector<HTMLElement>('.player-card')
    if (!root || !stage) return
    const character = HEARTH_CHARACTERS[this.selectedCharacterIndex]
    root.classList.add('is-character-confirming')
    await this.wait(360)
    const rect = stage.getBoundingClientRect()
    const orb = document.createElement('div')
    orb.className = 'hearth-character-orb'
    orb.style.left = `${rect.left + rect.width / 2 - 9}px`
    orb.style.top = `${rect.top + rect.height / 2 - 9}px`
    document.body.appendChild(orb)
    const dest = target?.getBoundingClientRect()
    const dx = dest ? dest.left + dest.width / 2 - (rect.left + rect.width / 2) : 0
    const dy = dest ? dest.top + dest.height / 2 - (rect.top + rect.height / 2) : 120
    orb.style.setProperty('--orb-dx', `${dx}px`)
    orb.style.setProperty('--orb-dy', `${dy}px`)
    orb.classList.add('is-flying')
    await this.wait(620)
    if (target) {
      target.querySelector<HTMLElement>('.player-art')?.style.setProperty('background-image', `url('${character.art}')`)
      SquareBurst.playOn(target, 'score', { count: 34, spread: 180, duration: 720, size: [10, 24] })
      target.classList.add('hearth-character-installed')
      window.setTimeout(() => target.classList.remove('hearth-character-installed'), 760)
    }
    orb.remove()
    root.classList.remove('is-character-confirming')
    root.classList.add('is-character-confirmed')
    const departButton = root.querySelector<HTMLElement>('.hearth-depart')
    if (departButton) {
      departButton.textContent = '출발'
      departButton.removeAttribute('data-hearth-select')
      departButton.setAttribute('data-hearth-depart', '')
    }
  }

  /** 셔터 하단에 놓이는 임시 캐릭터 프로필 카드. 실제 캐릭터 데이터 연동 전까지 UI 흐름만 보장한다. */
  private renderCharacterCards(): string {
    return HEARTH_CHARACTERS.map((character, index) => `
      <button class="hearth-character-card ${index === 0 ? 'is-selected' : ''}" type="button" role="option" aria-selected="${index === 0 ? 'true' : 'false'}" data-hearth-character="${index}">
        <span class="hearth-character-thumb" style="--character-art: url('${character.art}')" aria-hidden="true"></span>
        <span class="hearth-character-name">${character.name}</span>
        <span class="hearth-character-role">${character.role}</span>
      </button>
    `).join('')
  }

  /** 출발 → 직업 선택/런 시작. 직업 오버레이(z=200)가 검은 셔터 위로 떠 이음새를 가린 뒤 허브를 걷는다. */
  private async depart(): Promise<void> {
    if (this.departing) return
    this.departing = true
    this.overlay?.querySelector<HTMLElement>('[data-hearth-depart]')?.classList.add('is-pressed')
    // 로비 배경(hearth_bg_001)을 페이드아웃해 검은 화면을 만든 뒤, 런이 시작되며
    // body의 원래 배경(background_001)이 페이드인된다(두 배경이 겹치지 않게 분리).
    document.getElementById('ingame-backdrop')?.classList.add('is-out')
    await this.wait(520)
    void this.handlers?.onStart()
    await this.wait(480)
    this.exit()
  }

  /**
   * 9칸 스테이션 그리드(0~8, row-major). 전체 배치/역할/해금 게이팅은
   * 기획서 `Unmelting_Game_Concept.md` §12(거점 화면)에 확정 명시돼 있다.
   *   0 암시장 / 1 타로 / 2 도박장 / 3 길드 / 4 잿빛 굴레(중앙) / 5 서고
   *   6 무역 / 7 모험(하단 중앙) / 8 만찬
   * 현 단계는 임시 해금 상태로 9칸 모두 점등·인스펙터 접근이 가능하다.
   * 모험(index 7)만 셔터/출발 동작을 갖고, 나머지는 정보 확인용 칸이다.
   * 각 칸은 `data-inspect-*`로 우측 인스펙터 hover 정보를 제공한다.
   */
  private renderCells(): string {
    const cells: string[] = []
    for (let i = 0; i < 9; i++) {
      const name = STATION_NAMES[i]
      const desc = STATION_DESC[name] ?? ''
      // 칸 인스펙터 일러스트는 row-major index+1로 hearth_001~009와 1:1 매핑한다.
      // 아직 파일이 없는 칸은 undefined → CSS 플레이스홀더로 폴백한다.
      const art = spriteForHearthStation(`hearth_00${i + 1}`)
      const artAttr = art ? ` data-inspect-art="${art}"` : ''
      // 일러스트가 있으면 칸 배경으로도 직접 깐다(--cell-art) + has-art 클래스로 오버레이 톤 적용.
      const artClass = art ? ' hearth-cell--has-art' : ''
      const artStyle = art ? ` style="--cell-art: url('${art}')"` : ''
      const inspectAttr = ` data-inspect-title="${name}" data-inspect-tag="개방" data-inspect-desc="${desc}"${artAttr}`
      if (i === ADVENTURE_INDEX) {
        // 모험 칸 — 유일한 상호작용 칸(셔터/출발). 가운데 불씨(촛불)는 빼고 일러스트로만 점등한다.
        cells.push(
          `<button class="hearth-cell hearth-cell--adventure${artClass}" data-hearth-station="adventure" type="button" aria-label="모험 시작"` +
            `${inspectAttr}${artStyle}>` +
            `<span class="hearth-cell__label">${name}</span>` +
            `</button>`
        )
      } else {
        // 임시: 나머지 칸도 모두 개방(스타일리시 점등 + hover 인스펙터). 해금 게이팅은 추후.
        cells.push(
          `<div class="hearth-cell hearth-cell--open${artClass}" tabindex="0" aria-label="${name}"` +
            `${inspectAttr}${artStyle}>` +
            `<span class="hearth-cell__label">${name}</span>` +
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
    // 가로: 가장 우측 칸의 절반(≈레일 폭의 5/6 지점)부터 화면 우측 끝까지(여백 0).
    // 세로: 레일이 아니라 화면 위아래 끝(뷰포트 전체 높이)을 다 채운다.
    const left = r.left + r.width * 0.82
    const right = window.innerWidth
    insp.style.left = `${left}px`
    insp.style.top = `0px`
    insp.style.width = `${Math.max(200, right - left)}px`
    insp.style.height = `${window.innerHeight}px`
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
    document.removeEventListener('click', this.onTap, true)
    // 로비 backdrop 페이드아웃 상태 해제(런 중에는 index.ts 기본 backdrop 규칙으로 복귀).
    document.getElementById('ingame-backdrop')?.classList.remove('is-out')
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
