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
/** 하단 좌측 = 무역, 하단 중앙 = 모험. 둘 다 셔터형 상세 화면을 가진다. */
const TRADE_INDEX = 6
const ADVENTURE_INDEX = 7
const DINNER_INDEX = 8

/** 마지막으로 본 모험 동행을 다음 거점 진입에도 복원하기 위한 로컬 저장 키. */
const HEARTH_LAST_CHARACTER_KEY = 'unmelting.hearth.lastCharacterIndex'

/** 모험 셔터 안에서 고를 수 있는 동행 목록. 3~4번은 아직 일러스트가 없는 잠금 카드로 유지한다. */
const HEARTH_CHARACTERS = [
  { id: 'sprout-chick', name: '새싹 병아리', role: '튜토리얼', desc: '첫 모험을 천천히 익히도록 돕는 작고 따뜻한 시작 동행.', art: SpriteUrls.playerTutorial, lockedArt: false },
  { id: 'haegang', name: '해강', role: '녹지 않는 소녀', desc: '검은 셔터 너머 첫 모험을 함께 시작하는 기본 동행.', art: SpriteUrls.player, lockedArt: false },
  { id: 'ember', name: '빈 동행 I', role: '추후 해금', desc: '새 캐릭터 설계가 들어올 때 연결할 임시 프로필 칸.', art: SpriteUrls.player, lockedArt: false },
  { id: 'ash', name: '빈 동행 II', role: '추후 해금', desc: '아직 초상화가 비어 있는 회색 카드 슬롯.', art: '', lockedArt: true },
  { id: 'candle', name: '빈 동행 III', role: '추후 해금', desc: '아직 초상화가 비어 있는 회색 카드 슬롯.', art: '', lockedArt: true },
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
  /** 커버플로우 드래그 시작 X 좌표. 좌우 한 바퀴 순환 입력을 판정한다. */
  private dragStartX: number | null = null
  /** 현재 무역 화면에서 선택된 임시 탭. */
  private selectedTradeTab = 0
  /** 만찬 선택 흐름 단계: 0=팩 레일, 1=메인 음식, 2~3=추가 스탯, 4=완성 연출. */
  private dinnerStep = 0
  /** 무료 만찬에서 고른 음식/스탯을 임시로 보관해 완성 카드 문구를 만든다. */
  private dinnerChoices: string[] = []

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
          <div class="hearth-trade-stage" aria-label="무역 임시 화면">
            <aside class="hearth-trade-tabs" role="tablist" aria-label="무역 분류">${this.renderTradeTabs()}</aside>
            <section class="hearth-trade-pack-area" aria-live="polite">
              <div class="hearth-trade-pack-grid">${this.renderTradePacks(0)}</div>
            </section>
          </div>
          <div class="hearth-dinner-stage" aria-label="만찬 임시 화면">
            <div class="hearth-dinner-curtain hearth-dinner-curtain--left" aria-hidden="true"></div>
            <div class="hearth-dinner-curtain hearth-dinner-curtain--right" aria-hidden="true"></div>
            <div class="hearth-dinner-bg" aria-hidden="true"></div>
            <div class="hearth-dinner-rail">${this.renderDinnerPacks()}</div>
            <div class="hearth-dinner-picked" aria-live="polite"></div>
            <div class="hearth-dinner-choices" aria-live="polite"></div>
          </div>
          <div class="hearth-character-stage" aria-live="polite">
            <div class="hearth-adventure-backdrop" aria-hidden="true"></div>
            <div class="hearth-showcase-card" aria-hidden="true">
              <div class="hearth-showcase-art" style="--character-art: url('${HEARTH_CHARACTERS[0].art}')"></div>
              <div class="hearth-showcase-overlay"></div>
            </div>
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
    // 커튼 대문과 모험 셔터 배경을 CSS 변수로 주입해 검은 슬랩 대신 실제 거점 배경을 쓴다.
    overlay.style.setProperty('--hearth-door', `url('${SpriteUrls.hearth.door}')`)
    overlay.style.setProperty('--hearth-adventure-bg', `url('${SpriteUrls.hearth.adventure}')`)
    overlay.style.setProperty('--hearth-trade-bg', `url('${SpriteUrls.hearth.trade}')`)
    overlay.style.setProperty('--hearth-dinner-bg', `url('${SpriteUrls.hearth.dinner}')`)
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

    overlay.addEventListener('pointerdown', (e) => this.beginCharacterDrag(e))
    overlay.addEventListener('pointerup', (e) => this.endCharacterDrag(e))

    overlay.addEventListener('click', (e) => {
      const t = e.target as HTMLElement
      if (t.closest('[data-hearth-back]')) {
        this.raiseShutter()
        return
      }
      const characterCard = t.closest<HTMLElement>('[data-hearth-character]')
      if (characterCard) {
        this.selectCharacter(Number(characterCard.dataset.hearthCharacter ?? 0), 'click')
        return
      }
      const dinnerPack = t.closest<HTMLElement>('[data-hearth-dinner-pack]')
      if (dinnerPack) {
        this.openDinnerPack()
        return
      }
      const dinnerChoice = t.closest<HTMLElement>('[data-hearth-dinner-choice]')
      if (dinnerChoice) {
        void this.pickDinnerChoice(Number(dinnerChoice.dataset.hearthDinnerChoice ?? 0))
        return
      }
      const tradeTab = t.closest<HTMLElement>('[data-hearth-trade-tab]')
      if (tradeTab) {
        this.selectTradeTab(Number(tradeTab.dataset.hearthTradeTab ?? 0))
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
      if (t.closest('[data-hearth-station="trade"]')) this.descendTradeShutter()
      if (t.closest('[data-hearth-station="dinner"]')) this.descendDinnerShutter()
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
    this.selectedCharacterIndex = this.readLastCharacterIndex()
    this.characterConfirmed = false
    this.overlay?.classList.remove('is-trade-mode', 'is-trade-leaving', 'is-dinner-mode', 'is-dinner-opened')
    this.overlay?.classList.add('is-shuttering', 'is-adventure-mode')
    const departButton = this.overlay?.querySelector<HTMLElement>('.hearth-depart')
    if (departButton) {
      departButton.textContent = '선택'
      departButton.removeAttribute('data-hearth-depart')
      departButton.setAttribute('data-hearth-select', '')
    }
    this.selectCharacter(this.selectedCharacterIndex)
    // 셔터 하강이 끝난 뒤 배경→우측 카드/좌측 소개→하단 슬라이드/선택 버튼 순서로 띄운다.
    window.setTimeout(() => this.overlay?.classList.add('is-shutter-rest'), 680)
  }


  /** 무역 선택 → hearth_bg_004 셔터가 내려오고 좌측 탭/우측 임시 카드팩 그리드를 보여 준다. */
  private descendTradeShutter(): void {
    if (this.shuttered) return
    this.shuttered = true
    this.hideInspector()
    this.selectedTradeTab = 0
    this.overlay?.classList.remove('is-adventure-mode', 'is-trade-leaving', 'is-dinner-mode', 'is-dinner-opened')
    this.overlay?.classList.add('is-shuttering', 'is-trade-mode')
    this.selectTradeTab(0)
    // 셔터가 충분히 닫힌 뒤 라벨과 카드팩을 좌측/하단에서 순차 진입시킨다.
    window.setTimeout(() => this.overlay?.classList.add('is-shutter-rest'), 680)
  }

  /** 만찬 선택 → 검붉은 커튼을 친 뒤 hearth_bg_005 만찬 배경과 무료 팩 레일을 보여 준다. */
  private descendDinnerShutter(): void {
    if (this.shuttered) return
    this.shuttered = true
    this.hideInspector()
    this.dinnerStep = 0
    this.dinnerChoices = []
    this.overlay?.classList.remove('is-adventure-mode', 'is-trade-mode', 'is-trade-leaving')
    this.overlay?.classList.add('is-shuttering', 'is-dinner-mode')
    this.resetDinnerStage()
    // 커튼이 먼저 닫힌 뒤 배경 레이어가 페이드인하도록 셔터 안정 클래스를 늦게 붙인다.
    window.setTimeout(() => this.overlay?.classList.add('is-shutter-rest'), 680)
  }

  /** 만찬 팩 레일/선택지를 초기 상태로 되돌려 뒤로가기 후 재진입도 같은 흐름을 보장한다. */
  private resetDinnerStage(): void {
    const root = this.overlay
    root?.classList.remove('is-dinner-opened', 'is-dinner-finalizing')
    const rail = root?.querySelector<HTMLElement>('.hearth-dinner-rail')
    const picked = root?.querySelector<HTMLElement>('.hearth-dinner-picked')
    const choices = root?.querySelector<HTMLElement>('.hearth-dinner-choices')
    if (rail) rail.innerHTML = this.renderDinnerPacks()
    if (picked) picked.innerHTML = ''
    if (choices) choices.innerHTML = ''
  }

  /** 무료 팩 클릭 → 레일을 은은하게 어둡고 흐리게 만들고 1단계 음식 3택을 띄운다. */
  private openDinnerPack(): void {
    if (this.dinnerStep !== 0) return
    this.dinnerStep = 1
    this.overlay?.classList.add('is-dinner-opened')
    this.renderDinnerChoices()
  }

  /** 만찬 카드 선택은 음식 1회 + 추가 스탯 2회, 총 3단계를 순서대로 진행한다. */
  private async pickDinnerChoice(index: number): Promise<void> {
    if (this.dinnerStep < 1 || this.dinnerStep > 3) return
    const options = this.getDinnerOptions()
    const picked = options[index] ?? options[0]
    this.dinnerChoices.push(picked.title)
    this.moveDinnerPickToPlate(picked)
    if (this.dinnerStep === 1) {
      this.dinnerStep = 2
      this.renderDinnerChoices()
      return
    }
    this.flashDinnerStatIntoPlate()
    if (this.dinnerStep === 2) {
      this.dinnerStep = 3
      this.renderDinnerChoices()
      return
    }
    this.dinnerStep = 4
    await this.finishDinner()
  }

  /** 만찬 레일은 무료 팩 하나와 추후 가격대별 잠금 팩 자리만 노출한다. */
  private renderDinnerPacks(): string {
    return `
      <button class="hearth-dinner-pack" type="button" data-hearth-dinner-pack>
        <span class="hearth-dinner-pack-art" aria-hidden="true"></span>
        <strong>무료</strong><small>빈 만찬 카드팩</small>
      </button>
      <article class="hearth-dinner-pack is-locked"><span class="hearth-dinner-pack-art"></span><strong>1$</strong><small>준비 중</small></article>
      <article class="hearth-dinner-pack is-locked"><span class="hearth-dinner-pack-art"></span><strong>3$</strong><small>준비 중</small></article>
      <article class="hearth-dinner-pack is-locked"><span class="hearth-dinner-pack-art"></span><strong>5$</strong><small>준비 중</small></article>
    `
  }

  /** 현재 단계에 맞는 임시 만찬 선택지 풀을 반환한다. */
  private getDinnerOptions(): Array<{ title: string; stat: string; color: string }> {
    if (this.dinnerStep === 1) return [
      { title: '치킨', stat: '체력 +5', color: '#8f3d2f' },
      { title: '머핀', stat: '불빛 획득량 +10%', color: '#8b6a35' },
      { title: '파스타', stat: '손패 한도 +2', color: '#7b7240' },
    ]
    return [
      { title: '따뜻한 소스', stat: '체력 +3', color: '#7e2630' },
      { title: '촛불 향신료', stat: '불빛 획득량 +5%', color: '#9a6b2f' },
      { title: '불씨 가니시', stat: '불씨 한도 +1', color: '#5f445f' },
    ]
  }

  /** 상단 3장 선택지를 카드팩/상점 카드 문법에 맞춰 다시 그린다. */
  private renderDinnerChoices(): void {
    const choices = this.overlay?.querySelector<HTMLElement>('.hearth-dinner-choices')
    if (!choices) return
    choices.innerHTML = this.getDinnerOptions().map((option, index) => `
      <button class="hearth-dinner-choice" type="button" data-hearth-dinner-choice="${index}" style="--food-color:${option.color}">
        <span class="hearth-dinner-choice-art" aria-hidden="true"></span>
        <strong>${option.title}</strong><small>${option.stat}</small>
      </button>
    `).join('')
    choices.animate([{ opacity: 0, transform: 'translateY(-18px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 260, easing: 'ease-out' })
  }

  /** 선택된 카드는 하단 중앙 접시 카드로 축소 복제해 누적 선택을 보여 준다. */
  private moveDinnerPickToPlate(picked: { title: string; stat: string; color: string }): void {
    const plate = this.overlay?.querySelector<HTMLElement>('.hearth-dinner-picked')
    if (!plate) return
    plate.innerHTML = `<div class="hearth-dinner-plate-card" style="--food-color:${picked.color}"><span></span><strong>${this.dinnerChoices[0] ?? picked.title}</strong><small>${this.dinnerChoices.join(' · ')}</small></div>`
    plate.animate([{ transform: 'translate(-50%, 18px) scale(0.9)', opacity: 0 }, { transform: 'translate(-50%, 0) scale(1)', opacity: 1 }], { duration: 320, easing: 'cubic-bezier(0.2,0.84,0.3,1)' })
  }

  /** 추가 스탯은 불빛처럼 하단 음식 카드에 꽂히는 사각 블라스트로 피드백한다. */
  private flashDinnerStatIntoPlate(): void {
    const plate = this.overlay?.querySelector<HTMLElement>('.hearth-dinner-picked')
    if (!plate) return
    SquareBurst.playOn(plate, 'score', { count: 22, spread: 130, duration: 520, size: [8, 18] })
  }

  /** 완성 만찬은 중앙에서 체류 후 빛 구슬이 되어 유물 인벤토리 방향으로 날아간다. */
  private async finishDinner(): Promise<void> {
    const root = this.overlay
    const plate = root?.querySelector<HTMLElement>('.hearth-dinner-picked')
    if (!root || !plate) return
    root.classList.add('is-dinner-finalizing')
    SquareBurst.playOn(plate, 'score', { count: 42, spread: 210, duration: 760, size: [10, 26] })
    await this.wait(720)
    const target = document.querySelector<HTMLElement>('.relic-stack') ?? document.querySelector<HTMLElement>('.player-card')
    const source = plate.getBoundingClientRect()
    const dest = target?.getBoundingClientRect()
    const orb = document.createElement('div')
    orb.className = 'hearth-dinner-orb'
    orb.style.left = `${source.left + source.width / 2 - 10}px`
    orb.style.top = `${source.top + source.height / 2 - 10}px`
    orb.style.setProperty('--orb-dx', `${dest ? dest.left + dest.width / 2 - (source.left + source.width / 2) : 180}px`)
    orb.style.setProperty('--orb-dy', `${dest ? dest.top + dest.height / 2 - (source.top + source.height / 2) : 120}px`)
    document.body.appendChild(orb)
    orb.classList.add('is-flying')
    await this.wait(660)
    if (target) SquareBurst.playOn(target, 'score', { count: 28, spread: 150, duration: 620, size: [8, 18] })
    orb.remove()
  }


  /** 뒤로가기 → 검은 셔터를 다시 올리고 로비 9칸 상호작용으로 돌아간다. */
  private raiseShutter(): void {
    if (!this.shuttered || this.departing) return
    this.shuttered = false
    this.characterConfirmed = false
    const root = this.overlay
    if (root?.classList.contains('is-dinner-mode')) {
      root.classList.remove('is-shuttering', 'is-shutter-rest', 'is-dinner-mode', 'is-dinner-opened', 'is-dinner-finalizing')
      this.dinnerStep = 0
      this.dinnerChoices = []
      return
    }
    if (root?.classList.contains('is-trade-mode')) {
      // 무역 퇴장은 카드팩 상승 → 좌측 패널 슬라이드아웃 → 셔터 상승 순서를 CSS로 읽히게 한다.
      root.classList.add('is-trade-leaving')
      window.setTimeout(() => root.classList.remove('is-shuttering', 'is-shutter-rest', 'is-trade-mode', 'is-trade-leaving'), 420)
      return
    }
    root?.classList.remove('is-shuttering', 'is-shutter-rest', 'is-character-confirmed', 'is-adventure-mode')
  }

  /** 얇은 프로필 카드 목록을 직업 선택 카드처럼 현재 선택 중심으로 갱신한다. */
  private selectCharacter(index: number, direction: 'left' | 'right' | 'click' = 'click'): void {
    const wrapped = (index + HEARTH_CHARACTERS.length) % HEARTH_CHARACTERS.length
    this.selectedCharacterIndex = wrapped
    this.writeLastCharacterIndex(wrapped)
    const character = HEARTH_CHARACTERS[wrapped]
    const root = this.overlay
    if (!root) return
    root.dataset.characterDirection = direction
    root.querySelectorAll<HTMLElement>('[data-hearth-character]').forEach((card) => {
      const cardIndex = Number(card.dataset.hearthCharacter ?? -1)
      const offset = this.circularOffset(cardIndex, wrapped)
      const active = cardIndex === wrapped
      card.classList.toggle('is-selected', active)
      card.setAttribute('aria-selected', active ? 'true' : 'false')
      const depth = Math.abs(offset)
      card.style.setProperty('--slot', String(offset))
      card.style.setProperty('--card-scale', String(Math.max(0.66, 1 - depth * 0.14)))
      card.style.setProperty('--card-brightness', String(Math.max(0.62, 1 - depth * 0.16)))
      card.style.setProperty('--card-opacity', String(Math.max(0.58, 1 - depth * 0.18)))
      card.style.zIndex = String(20 - depth)
    })
    const art = root.querySelector<HTMLElement>('.hearth-showcase-art')
    if (character.lockedArt) art?.style.removeProperty('--character-art')
    else art?.style.setProperty('--character-art', `url('${character.art}')`)
    art?.classList.toggle('is-empty', character.lockedArt)
    // 텍스트/일러스트 전환은 CSS 키프레임을 재시작해 동시에 페이드·슬라이드한다.
    root.querySelector<HTMLElement>('.hearth-character-copy strong')!.textContent = character.name
    root.querySelector<HTMLElement>('.hearth-character-copy small')!.textContent = character.desc
    root.querySelector<HTMLElement>('.hearth-character-copy')?.animate([
      { opacity: 0, transform: 'translateX(-18px)' },
      { opacity: 1, transform: 'translateX(0)' },
    ], { duration: 280, easing: 'ease-out' })
    art?.animate([
      { opacity: 0, transform: `translateX(${direction === 'right' ? '-' : ''}34px) scale(0.98)` },
      { opacity: 1, transform: 'translateX(0) scale(1)' },
    ], { duration: 340, easing: 'cubic-bezier(0.2, 0.84, 0.3, 1)' })
  }

  private beginCharacterDrag(e: PointerEvent): void {
    if (!(e.target as HTMLElement | null)?.closest('.hearth-character-strip')) return
    this.dragStartX = e.clientX
  }

  private endCharacterDrag(e: PointerEvent): void {
    if (this.dragStartX === null) return
    const delta = e.clientX - this.dragStartX
    this.dragStartX = null
    if (Math.abs(delta) < 34) return
    this.selectCharacter(this.selectedCharacterIndex + (delta < 0 ? 1 : -1), delta < 0 ? 'left' : 'right')
  }

  private circularOffset(index: number, center: number): number {
    const total = HEARTH_CHARACTERS.length
    let offset = index - center
    if (offset > total / 2) offset -= total
    if (offset < -total / 2) offset += total
    return offset
  }

  private readLastCharacterIndex(): number {
    const value = Number(window.localStorage.getItem(HEARTH_LAST_CHARACTER_KEY) ?? 0)
    return Number.isFinite(value) ? Math.max(0, Math.min(HEARTH_CHARACTERS.length - 1, value)) : 0
  }

  private writeLastCharacterIndex(index: number): void {
    window.localStorage.setItem(HEARTH_LAST_CHARACTER_KEY, String(index))
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
      if (!character.lockedArt) target.querySelector<HTMLElement>('.player-art')?.style.setProperty('background-image', `url('${character.art}')`)
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


  /** 무역 좌측 탭 라벨은 실제 데이터 연결 전까지 1번~8번 임시 문구를 쓴다. */
  private renderTradeTabs(): string {
    return Array.from({ length: 8 }, (_, index) => `
      <button class="hearth-trade-tab ${index === 0 ? 'is-active' : ''}" type="button" role="tab" aria-selected="${index === 0 ? 'true' : 'false'}" data-hearth-trade-tab="${index}">
        <span>${index + 1}번</span>
      </button>
    `).join('')
  }

  /** 각 무역 탭은 비어 있는 임시 카드팩 5개를 가진다. */
  private renderTradePacks(tabIndex: number): string {
    return Array.from({ length: 5 }, (_, index) => `
      <article class="hearth-trade-pack" style="--pack-order:${index}">
        <div class="hearth-trade-pack-art" aria-hidden="true"></div>
        <strong>${tabIndex + 1}-${index + 1}</strong>
        <small>빈 카드팩</small>
      </article>
    `).join('')
  }

  /** 탭 클릭 시 우측 카드팩 자리만 갈아 끼워 추후 실제 상품 매핑 지점을 고정한다. */
  private selectTradeTab(index: number): void {
    this.selectedTradeTab = Math.max(0, Math.min(7, index))
    const root = this.overlay
    if (!root) return
    root.querySelectorAll<HTMLElement>('[data-hearth-trade-tab]').forEach((tab) => {
      const active = Number(tab.dataset.hearthTradeTab ?? -1) === this.selectedTradeTab
      tab.classList.toggle('is-active', active)
      tab.setAttribute('aria-selected', active ? 'true' : 'false')
    })
    const grid = root.querySelector<HTMLElement>('.hearth-trade-pack-grid')
    if (grid) {
      grid.innerHTML = this.renderTradePacks(this.selectedTradeTab)
      grid.animate([{ opacity: 0, transform: 'translateY(18px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 260, easing: 'ease-out' })
    }
  }

  /** 셔터 하단의 캐릭터 슬롯은 텍스트 없이 일러스트만 보여 선택 흐름이 깨끗하게 읽히게 한다. */
  private renderCharacterCards(): string {
    return HEARTH_CHARACTERS.map((character, index) => `
      <button class="hearth-character-card ${index === 0 ? 'is-selected' : ''}" type="button" role="option" aria-label="${character.name}" aria-selected="${index === 0 ? 'true' : 'false'}" data-hearth-character="${index}">
        <span class="hearth-character-thumb ${character.lockedArt ? 'is-empty' : ''}" ${character.lockedArt ? '' : `style="--character-art: url('${character.art}')"`} aria-hidden="true"></span>
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
      if (i === TRADE_INDEX) {
        // 무역 칸 — 메타 해금/계승 UI의 임시 셔터 화면으로 진입한다.
        cells.push(
          `<button class="hearth-cell hearth-cell--open${artClass}" data-hearth-station="trade" type="button" aria-label="무역"` +
            `${inspectAttr}${artStyle}>` +
            `<span class="hearth-cell__label">${name}</span>` +
            `</button>`
        )
      } else if (i === DINNER_INDEX) {
        // 만찬 칸 — 무료 만찬 카드팩/3단계 음식 커스텀 임시 플로우로 진입한다.
        cells.push(
          `<button class="hearth-cell hearth-cell--open${artClass}" data-hearth-station="dinner" type="button" aria-label="만찬"` +
            `${inspectAttr}${artStyle}>` +
            `<span class="hearth-cell__label">${name}</span>` +
            `</button>`
        )
      } else if (i === ADVENTURE_INDEX) {
        // 모험 칸 — 셔터/캐릭터 선택/출발 동작을 갖는다. 가운데 불씨(촛불)는 빼고 일러스트로만 점등한다.
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
