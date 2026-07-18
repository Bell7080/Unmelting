/**
 * EventOverlayView — 이벤트 문 진입 연출/씬 셸/미니게임(미니언 흥정·백작 RPS) UI.
 * GameBoardRenderer에서 표시 책임만 옮겨 왔다 — 렌더 상태의 단일 출처는 host다.
 */

import type { GameBoardRenderer } from '@ui/GameBoardRenderer'
import type {
  EventDefinition,
  EventChoice,
  MinionExchangeConfig,
  CountRpsConfig,
  RiskOffer,
  RiskOutcome,
  EventResourceSink,
  EventResourceKind,
  EventResourceSnapshot,
  RpsHand,
  RpsItemDef,
  RpsItemId,
} from '@data/Events'
import type { EventMinigameMoment } from '@data/CompanionLines'
import type { ResourceTrailTarget } from '@ui/renderer/RendererTypes'
import { spriteForEvent, spriteForRps } from '@ui/Sprites'
import { SquareBurst, type BurstTheme } from '@ui/SquareBurst'
import { sparkleIcon } from '@ui/Icons'
import { escapeHtml } from '@ui/renderer/Html'

export class EventOverlayView {
  constructor(private readonly host: GameBoardRenderer) {}

  /** 이벤트 문 진입 레이어와 정렬 리스너. */
  private eventEntryOverlayElement: HTMLElement | null = null
  private eventEntryResizeListener: (() => void) | null = null
  /** 기방문 이벤트 SKIP 버튼이 눌렸는지 — 연출/대사만 건너뛰고 본편은 그대로 연다. */
  private eventIntroSkipped = false

  /** 이번 이벤트 진입에서 SKIP이 눌렸는지(호출부가 마무리 대사 생략 판단에 쓴다). */
  wasEventIntroSkipped(): boolean {
    return this.eventIntroSkipped
  }

  /** 기방문 보스 인트로용 SKIP 버튼 — 레일 우하단에 띄우고 제거 함수를 돌려준다.
   *  이벤트 셸과 같은 .event-skip-btn 스타일을 재사용한다(보스는 오버레이가 없어 fixed 배치). */
  showBossSkipButton(onSkip: () => void): () => void {
    this.ensureEventEntryStyles()
    const btn = document.createElement('button')
    btn.className = 'event-skip-btn'
    btn.type = 'button'
    btn.innerHTML = 'SKIP &gt;&gt;'
    const rail = this.host.boardElement.querySelector<HTMLElement>('.rail')
    const r = rail?.getBoundingClientRect()
    btn.style.position = 'fixed'
    btn.style.zIndex = '160'
    if (r) {
      btn.style.right = `${window.innerWidth - r.right + r.width * 0.03}px`
      btn.style.top = `${r.bottom - 46}px`
    }
    btn.addEventListener('click', (e) => { e.stopPropagation(); onSkip(); btn.remove() })
    document.body.appendChild(btn)
    return () => btn.remove()
  }

  /**
   * 이벤트 문 진입 연출 + 대사/선택 흐름.
   * 흐름: 클릭 즉시 넓은 블라스트 → 직업선택 암막커튼 닫힘 → onConsume()으로 문 소비 →
   *   이벤트 배경 일러스트 페이드인 → 대사 진행(클릭으로 넘김) → 하단 선택 버튼 노출.
   * 선택 버튼이 눌리면 { index, buttonRect }로 resolve한다(오버레이는 닫지 않는다).
   *   호출부가 효과를 적용하고 playEventGainBlast로 버튼→HUD 블라스트를 쏜 뒤
   *   closeEventEntry()로 커튼을 열어 마무리한다.
   * @param emberAvailable 손패 불씨 보유 여부(불태우기 등 requiresHand 버튼 활성 판정).
   */
  async runEventEntry(
    cardId: string,
    def: EventDefinition,
    emberAvailable: boolean,
    onConsume: () => void,
    playDialogue: () => Promise<void>,
    skippable = false
  ): Promise<{ index: number; buttonRect: DOMRect }> {
    // 공용 진입 셸(블라스트 → 커튼 → 문 소비 → 일러스트 → 대사)을 열고 콘텐츠 마운트를 받는다.
    const content = await this.openEventScene(cardId, def.illu, onConsume, playDialogue, skippable)

    // 위협 버튼(emphasis==='danger')은 행에서 빼서 하단 중앙에 단독 배치한다.
    const choices = def.choices ?? []
    const dangerIdx = choices.findIndex((c) => c.emphasis === 'danger')
    const rowChoices = choices.map((c, i) => ({ c, i })).filter(({ i }) => i !== dangerIdx)
    // 디메리트 텍스트(체력 감소/소모 등)를 붉은 span으로 마킹한다.
    const DEMERIT_RE = /\s-\d|소모|손해|감소/
    const renderEffectParts = (lines: readonly string[]): string =>
      lines.join(' · ').split(' · ').map((p) => {
        const cls = DEMERIT_RE.test(p) ? 'event-effect-part is-demerit' : 'event-effect-part'
        return `<span class="${cls}">${escapeHtml(p.trim())}</span>`
      }).join('<span class="event-effect-sep"> · </span>')

    const choiceBtnHtml = (c: EventChoice, i: number, extraClass = ''): string => {
      const themeClass = c.themeClass ? `event-choice--${c.themeClass}` : ''
      return `
      <button class="event-choice-btn ${themeClass} ${extraClass}" type="button" data-choice="${i}" data-choice-label="${escapeHtml(c.label)}">
        <span class="event-choice-copy">
          <span class="event-choice-label">${escapeHtml(c.label)}</span>
          <span class="event-choice-divider-line" aria-hidden="true"></span>
          <span class="event-choice-effects">${renderEffectParts(c.effectLines)}</span>
        </span>
      </button>`
    }

    // 대사 종료 후 하단 선택 버튼을 콘텐츠 마운트에 붙여 노출한다.
    content.innerHTML = `
      <div class="event-choices">
        <div class="event-choices-row">
          ${rowChoices.map(({ c, i }) => choiceBtnHtml(c, i)).join('')}
        </div>
        ${dangerIdx >= 0 ? choiceBtnHtml(choices[dangerIdx], dangerIdx, `event-burn-btn ${emberAvailable ? 'is-armed' : 'is-disabled'}`) : ''}
      </div>`
    const choicesEl = content.querySelector<HTMLElement>('.event-choices')!
    choicesEl.classList.add('is-in')
    return await new Promise<{ index: number; buttonRect: DOMRect }>((resolve) => {
      choicesEl.querySelectorAll<HTMLButtonElement>('.event-choice-btn').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation()
          if (btn.classList.contains('is-disabled')) return
          // 선택 직후에는 입력만 잠그고, 효과/마무리 대사가 끝난 뒤 별도 메서드로 버튼을 접는다.
          choicesEl.classList.add('is-resolved')
          btn.classList.add('is-selected')
          const index = Number(btn.dataset.choice)
          resolve({ index, buttonRect: btn.getBoundingClientRect() })
        })
      })
    })
  }

  /**
   * 이벤트 진입 공용 셸: 블라스트 → 암막커튼 닫힘 → onConsume(문 소비) → 일러스트 슬릿 공개 →
   * 대사 진행까지 처리하고, 콘텐츠를 붙일 .event-entry-content 마운트를 돌려준다.
   * choice형/미니게임형 모두 이 셸을 공유한다. 종료는 공용 closeEventEntry() 를 쓴다.
   */
  private async openEventScene(
    cardId: string,
    illu: string,
    onConsume: () => void,
    playDialogue: () => Promise<void>,
    skippable = false
  ): Promise<HTMLElement> {
    this.ensureEventEntryStyles()
    this.eventIntroSkipped = false

    // 1) 즉시 넓고 화려한 진입 블라스트(문 위치 기준). 별빛 톤 + 보물 톤 혼합.
    const doorEl = this.host.findCardElement(cardId)
    if (doorEl) {
      const r = doorEl.getBoundingClientRect()
      const cx = r.left + r.width / 2
      const cy = r.top + r.height / 2
      SquareBurst.playAt(cx, cy, 'starlight', { count: 34, spread: 250, duration: 660, size: [10, 26] })
      SquareBurst.playAt(cx, cy, 'treasure-gain', { count: 20, spread: 180, duration: 560 })
    }

    // 2) 레일 위에 암막커튼 + 빈 콘텐츠 마운트(.job-rail-curtain CSS/키프레임 재사용 → 자동 닫힘).
    const overlay = document.createElement('div')
    overlay.id = 'event-entry-overlay'
    const art = spriteForEvent(illu)
    overlay.innerHTML = `
      <div class="event-entry-shell">
        <div class="event-entry-illu${art ? '' : ' event-entry-illu--empty'}"
             ${art ? `style="background-image:url('${art}')"` : ''} aria-hidden="true"></div>
        <div class="job-rail-curtain job-rail-curtain--left" aria-hidden="true"></div>
        <div class="job-rail-curtain job-rail-curtain--right" aria-hidden="true"></div>
        <div id="event-demon-anchor" class="event-dialogue-anchor event-dialogue-anchor--demon" aria-hidden="true"></div>
        <div class="event-entry-content"></div>
        ${skippable ? '<button class="event-skip-btn" type="button">SKIP &gt;&gt;</button>' : ''}
      </div>`
    document.body.appendChild(overlay)
    this.eventEntryOverlayElement = overlay
    // 기방문 이벤트 SKIP — 누르는 즉시 진입 대기가 끝나고 대사도 줄 사이에서 끊긴다.
    const skipBtn = overlay.querySelector<HTMLButtonElement>('.event-skip-btn')
    skipBtn?.addEventListener('click', (e) => {
      e.stopPropagation()
      this.eventIntroSkipped = true
      skipBtn.remove()
    })
    // SKIP이 눌리면 남은 시간을 기다리지 않고 즉시 넘어가는 대기.
    const skippableWait = (ms: number): Promise<void> => new Promise((resolve) => {
      const startedAt = performance.now()
      const tick = (): void => {
        if (this.eventIntroSkipped || performance.now() - startedAt >= ms) resolve()
        else window.setTimeout(tick, 60)
      }
      tick()
    })

    // 상점/직업선택과 동일하게 레일 rect에 셸을 고정한다.
    const alignToRail = (): void => {
      const rail = this.host.boardElement.querySelector<HTMLElement>('.rail')
      const shell = overlay.querySelector<HTMLElement>('.event-entry-shell')
      if (!rail || !shell) return
      const rect = rail.getBoundingClientRect()
      shell.style.left = `${rect.left}px`
      shell.style.top = `${rect.top}px`
      shell.style.width = `${rect.width}px`
      shell.style.height = `${rect.height}px`
    }
    alignToRail()
    this.eventEntryResizeListener = alignToRail
    window.addEventListener('resize', alignToRail)
    window.addEventListener('scroll', alignToRail)

    // 3) 느린 이벤트 커튼이 충분히 닫힐 때까지 기다린 뒤 문을 소비한다(SKIP 시 즉시).
    await skippableWait(1320)
    onConsume()
    alignToRail()

    // 4) 커튼이 닫힌 뒤 한 박자 쉬고, 씬 일러스트를 세로 슬릿에서 좌우로 열어 공개한다.
    await skippableWait(260)
    overlay.querySelector<HTMLElement>('.event-entry-illu')?.classList.add('is-shown')
    await skippableWait(760)

    // 5) 대사 진행: 게임의 말풍선 시스템(다라라락 타이핑)으로 출력한다. SKIP 시 생략.
    if (!this.eventIntroSkipped) await playDialogue()

    // 본편(선택지/미니게임) 진입 — 스킵 버튼은 여기서 역할이 끝난다.
    overlay.querySelector<HTMLElement>('.event-skip-btn')?.remove()
    return overlay.querySelector<HTMLElement>('.event-entry-content')!
  }

  /** 선택이 실제 효과까지 끝난 뒤 버튼들이 커졌다가 슉 사라지는 마무리 연출. */
  async hideEventChoicesAfterSelection(index: number): Promise<void> {
    const choicesEl = this.eventEntryOverlayElement?.querySelector<HTMLElement>('.event-choices')
    if (!choicesEl) return
    choicesEl.querySelectorAll<HTMLElement>('.event-choice-btn').forEach((btn) => {
      btn.classList.toggle('is-selected', Number(btn.dataset.choice) === index)
    })
    choicesEl.classList.add('is-choice-finished')
    await new Promise((r) => window.setTimeout(r, 460))
    choicesEl.hidden = true
  }

  /** 선택 효과 획득 블라스트: 눌린 버튼 위치에서 각 HUD 타깃으로 트레일을 쏜다. */
  async playEventGainBlast(buttonRect: DOMRect, targets: readonly string[]): Promise<void> {
    const themeByTarget: Record<string, BurstTheme> = {
      health: 'health-gain', attack: 'attack-gain', hand: 'hand-tool',
      ember: 'ember-gain', gauge: 'gauge-gain', shield: 'shield-gain', score: 'score', coin: 'treasure-gain',
    }
    await Promise.all(
      targets.map((t) =>
        this.host.trails.animateResourceTrail(buttonRect, this.host.trails.findResourceTrailTarget(t as ResourceTrailTarget), 3, themeByTarget[t] ?? 'score')
      )
    )
  }

  /** 이벤트 종료: 일러스트가 완전히 접혀 사라진 뒤, 커튼이 천천히 열리고 오버레이를 제거한다. */
  async closeEventEntry(): Promise<void> {
    const overlay = this.eventEntryOverlayElement
    if (!overlay) return
    overlay.classList.add('is-opening')
    await new Promise((r) => window.setTimeout(r, 1720))
    this.clearEventEntryOverlay()
  }

  private clearEventEntryOverlay(): void {
    if (this.eventEntryResizeListener) {
      window.removeEventListener('resize', this.eventEntryResizeListener)
      window.removeEventListener('scroll', this.eventEntryResizeListener)
      this.eventEntryResizeListener = null
    }
    this.eventEntryOverlayElement?.remove()
    this.eventEntryOverlayElement = null
  }

  /** 미니게임 획득 트레일: 소스(버튼/결과) 위치에서 해당 HUD로 기존 자원 트레일을 쏜다. */
  private blastEventGain(from: DOMRect, res: EventResourceKind, count = 3): void {
    const map: Record<EventResourceKind, { target: ResourceTrailTarget; theme: BurstTheme }> = {
      light: { target: 'score', theme: 'score' },
      health: { target: 'health', theme: 'health-gain' },
      candle: { target: 'gauge', theme: 'gauge-gain' },
      shield: { target: 'shield', theme: 'shield-gain' },
      hand: { target: 'hand', theme: 'hand-tool' },
    }
    const m = map[res]
    void this.host.trails.animateResourceTrail(from, this.host.trails.findResourceTrailTarget(m.target), count, m.theme)
  }

  // ─────────────────────────────────────────────────────────────────────────
  // event_002 — 겁쟁이 미니언의 아슬아슬 흥정(위험 관리 미니게임)
  // ─────────────────────────────────────────────────────────────────────────
  /**
   * 로스트아크 돌깎기식 위험 흥정. 정해진 기회 안에서, 조를(성공할)수록 불안이 올라 성공 확률이
   * 내려가고, 실패하면 진정해 확률이 회복된다. 탐욕형(성공=보상/실패=디메리트)과 협박(실패=대박)을
   * 현재 성공 확률에 맞춰 갈아타는 게 실력. 결과는 매번 실제 자원으로 즉시 반영된다(sink).
   */
  async runMinionExchange(
    cardId: string,
    def: EventDefinition,
    cfg: MinionExchangeConfig,
    snap: EventResourceSnapshot,
    sink: EventResourceSink,
    onConsume: () => void,
    playDialogue: () => Promise<void>,
    onMoment?: (kind: EventMinigameMoment) => void,
    skippable = false
  ): Promise<void> {
    this.ensureEventMinigameStyles()
    const content = await this.openEventScene(cardId, def.illu, onConsume, playDialogue, skippable)
    void snap

    const RES_LABEL: Record<EventResourceKind, string> = {
      light: '불빛', hand: '손패', candle: '콤보 게이지', health: '체력', shield: '방패',
    }
    const FIELDS: EventResourceKind[] = ['light', 'health', 'candle', 'shield', 'hand']
    const byId = new Map<string, RiskOffer>(cfg.offers.map((o) => [o.id, o]))
    let anxiety = 0
    let triesLeft = cfg.attempts

    const successChance = (): number =>
      Math.max(cfg.minSuccess, Math.min(cfg.maxSuccess, cfg.baseSuccess - anxiety * cfg.anxietyStep))
    // 노린 결과(aim 분기)의 양수 불빛에만 불안 비례 리스크 프리미엄을 얹는다.
    const fieldVal = (b: RiskOutcome, res: EventResourceKind): number =>
      res === 'light' ? (b.light ?? 0) : res === 'health' ? (b.health ?? 0)
        : res === 'candle' ? (b.candle ?? 0) : res === 'shield' ? (b.shield ?? 0) : (b.hand ?? 0)
    const shownVal = (res: EventResourceKind, raw: number, isAimed: boolean): number =>
      res === 'light' && raw > 0 && isAimed ? Math.round(raw * (1 + anxiety * cfg.riskPremium)) : raw
    const outcomeText = (b: RiskOutcome, isAimed: boolean): string => {
      const parts = FIELDS.map((res) => {
        const raw = fieldVal(b, res)
        if (!raw) return ''
        const v = shownVal(res, raw, isAimed)
        return `${RES_LABEL[res]} ${v > 0 ? '+' : ''}${v}`
      }).filter(Boolean)
      return parts.join(' · ') || '—'
    }
    // 결과 분기를 실제 자원으로 즉시 반영하고, 획득(양수)엔 해당 HUD로 트레일을 쏜다.
    const applyOutcome = (b: RiskOutcome, isAimed: boolean, from: DOMRect): void => {
      for (const res of FIELDS) {
        const raw = fieldVal(b, res)
        if (!raw) continue
        const v = shownVal(res, raw, isAimed)
        if (res === 'light') sink.gainLight(v)
        else if (res === 'health') sink.changeHealth(v)
        else if (res === 'candle') sink.gainCandle(v)
        else if (res === 'shield') sink.gainShield(v)
        else { if (v >= 0) sink.buyHand(v); else sink.sellHand(-v) }
        if (v > 0) this.blastEventGain(from, res)
      }
    }

    // 불안(공포)은 오밀조밀한 작은 pip 미터로, 남은 기회는 큼직한 별 depletion으로 나눠 보여준다.
    const anxPipsHtml = Array.from({ length: cfg.anxietyPips }, () => `<span class="mini-anx-pip">${sparkleIcon()}</span>`).join('')
    const triesStarsHtml = Array.from({ length: cfg.attempts }, () => `<span class="mini-tries-star">${sparkleIcon()}</span>`).join('')
    const offerHtml = cfg.offers.map((o) => `
      <button class="mini-ex-offer${o.aim === 'fail' ? ' is-reckless' : ''}" type="button" data-offer="${o.id}">
        <span class="mini-ex-offer-label">${escapeHtml(o.label)}${o.aim === 'fail' ? '<span class="mini-ex-aim-tag">실패 노림</span>' : ''}</span>
        <span class="mini-ex-branches">
          <span class="mini-ex-branch${o.aim === 'success' ? ' is-aim' : ''}"><em>성공</em> <span data-branch="success"></span></span>
          <span class="mini-ex-branch${o.aim === 'fail' ? ' is-aim' : ''}"><em>실패</em> <span data-branch="fail"></span></span>
        </span>
        <span class="mini-ex-offer-hint">${escapeHtml(o.hint)}</span>
      </button>`).join('')
    content.innerHTML = `
      <div class="mini-exchange is-in">
        <div class="mini-ex-head">
          <div class="mini-ex-gauge">
            <span class="mini-meter-key">성공 확률</span>
            <b class="mini-ex-chance-val">–</b>
            <span class="mini-anx-pips" title="불안">${anxPipsHtml}</span>
          </div>
          <div class="mini-ex-tries">
            <span class="mini-meter-key">남은 기회</span>
            <span class="mini-ex-tries-stars">${triesStarsHtml}</span>
          </div>
        </div>
        <div class="mini-ex-result"></div>
        <div class="mini-ex-offers">${offerHtml}</div>
        <button class="mini-ex-done" type="button">거래 종료</button>
      </div>`

    const panel = content.querySelector<HTMLElement>('.mini-exchange')!
    const chanceEl = panel.querySelector<HTMLElement>('.mini-ex-chance-val')!
    const anxPipEls = Array.from(panel.querySelectorAll<HTMLElement>('.mini-anx-pip'))
    const triesStarEls = Array.from(panel.querySelectorAll<HTMLElement>('.mini-tries-star'))
    const resultEl = panel.querySelector<HTMLElement>('.mini-ex-result')!
    const offerEls = Array.from(panel.querySelectorAll<HTMLButtonElement>('.mini-ex-offer'))
    const doneEl = panel.querySelector<HTMLButtonElement>('.mini-ex-done')!

    const update = (): void => {
      chanceEl.textContent = `${Math.round(successChance() * 100)}%`
      anxPipEls.forEach((p, i) => p.classList.toggle('is-lit', i < Math.min(anxiety, cfg.anxietyPips)))
      // 남은 기회 = 채워진 별(밝게), 소진분은 흐리게.
      triesStarEls.forEach((s, i) => s.classList.toggle('is-lit', i < triesLeft))
      offerEls.forEach((btn) => {
        const o = byId.get(btn.dataset.offer!)!
        btn.querySelector('[data-branch="success"]')!.textContent = outcomeText(o.onSuccess, o.aim === 'success')
        btn.querySelector('[data-branch="fail"]')!.textContent = outcomeText(o.onFail, o.aim === 'fail')
        btn.classList.toggle('is-disabled', triesLeft <= 0)
      })
    }
    update()

    await new Promise<void>((resolve) => {
      const finish = (): void => { panel.classList.add('is-closing'); window.setTimeout(resolve, 340) }
      offerEls.forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation()
          if (triesLeft <= 0) return
          const o = byId.get(btn.dataset.offer!)
          if (!o) return
          const r = btn.getBoundingClientRect()
          // 현재 성공 확률로 판정 → 노린 결과(aim)와 일치하면 '좋은' 결과.
          const success = Math.random() < successChance()
          const branch = success ? o.onSuccess : o.onFail
          const isAimed = (success && o.aim === 'success') || (!success && o.aim === 'fail')
          applyOutcome(branch, isAimed, r)
          anxiety = success ? anxiety + 1 : Math.max(0, anxiety - cfg.failRecovery)
          triesLeft -= 1
          resultEl.className = `mini-ex-result ${isAimed ? 'is-good' : 'is-bad'}`
          resultEl.textContent = `${success ? '성공' : '실패'} — ${outcomeText(branch, isAimed)}`
          // 에나 반응 — 결과가 화면에 찍히는 바로 이 순간에 알린다.
          onMoment?.(isAimed ? (o.aim === 'fail' ? 'minion-jackpot' : 'minion-good') : 'minion-sting')
          SquareBurst.playAt(r.left + r.width / 2, r.top + r.height / 2, isAimed ? 'starlight' : 'vanish-smoke', { count: 10, spread: 90, duration: 460 })
          btn.classList.remove('is-pulse'); void btn.offsetWidth; btn.classList.add('is-pulse')
          update()
          if (triesLeft <= 0) window.setTimeout(finish, 1050)
        })
      })
      doneEl.addEventListener('click', (e) => { e.stopPropagation(); finish() })
    })
  }

  // ─────────────────────────────────────────────────────────────────────────
  // event_003 — 가위바위보 백작(벅샷 룰렛식 아이템 도박)
  // ─────────────────────────────────────────────────────────────────────────
  /**
   * 백작 가위바위보 미니게임. 백작 덱은 조성만 공개되고 순서는 숨겨져 카운팅으로 확률을 읽는다.
   * 매 판 백작이 확률 선언("바위가 끌리는군 — 70%")을 치는데, 예고된 패를 꺾은 승리는 보상이
   * 절반이라 예고를 따를지(안전·소득 적음) 거짓을 노릴지(위험·전액)가 실력이 된다. 아이템 3종 —
   * 차단(패 한 종류 봉쇄)/두배(손익 2배)/보호(손실 무효) — 로 판을 조작하며, 비김은 레이크가
   * 있어 무손해 손이 없다. 불빛·자원 지불/보상은 모두 실제 HUD로 즉시 반영된다.
   */
  async runCountRps(
    cardId: string,
    def: EventDefinition,
    cfg: CountRpsConfig,
    snap: EventResourceSnapshot,
    sink: EventResourceSink,
    onConsume: () => void,
    playDialogue: () => Promise<void>,
    onMoment?: (kind: EventMinigameMoment) => void,
    skippable = false
  ): Promise<void> {
    this.ensureEventMinigameStyles()
    const content = await this.openEventScene(cardId, def.illu, onConsume, playDialogue, skippable)

    const HAND_LABEL: Record<RpsHand, string> = { rock: '바위', paper: '보', scissors: '가위' }
    const RES_LABEL: Record<EventResourceKind, string> = { light: '불빛', hand: '손패', candle: '콤보 게이지', health: '체력', shield: '방패' }
    const HANDS: RpsHand[] = ['rock', 'paper', 'scissors']
    const beats = (a: RpsHand, b: RpsHand): boolean =>
      (a === 'rock' && b === 'scissors') || (a === 'scissors' && b === 'paper') || (a === 'paper' && b === 'rock')

    // 백작 덱을 조성대로 만든 뒤 순서를 섞어 숨긴다(벅샷 탄창). 개수만 공개된다.
    const deckQueue: RpsHand[] = []
    for (const h of HANDS) for (let i = 0; i < cfg.deck[h]; i += 1) deckQueue.push(h)
    for (let i = deckQueue.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[deckQueue[i], deckQueue[j]] = [deckQueue[j], deckQueue[i]]
    }
    // 판별 결과 기록 — 상단 별(노랑=승/빨강=패/회색=비김)로 도전 이력을 보여준다.
    const totalRounds = deckQueue.length
    const roundResults: ('win' | 'lose' | 'tie')[] = []
    let net = 0
    let streak = 0
    // 아이템으로 지불하는 자원의 로컬 미러(불빛은 avail()로 계산). 상한/가용 판정에 쓴다.
    const mirror: Record<EventResourceKind, number> = {
      light: snap.light, health: snap.health, candle: snap.candle, shield: snap.shield, hand: snap.hand,
    }
    const tieFrac = Math.max(0, Math.min(1, cfg.tieLossFraction))
    const stakeUnit = Math.max(1, Math.round(cfg.baseStake * (1 + snap.floor * 0.02)))
    const stakeMults = [1, 2, 4]
    let selectedMult = 1
    let busy = false
    // 이번 판 한정 아이템 효과.
    let blocked: RpsHand | null = null
    let lastPlayed: RpsHand | null = null
    let spinning = false
    let doubleNext = false
    let wardNext = false
    // 백작의 확률 선언 — '끌리는군(will)'은 표기 확률 그대로 그 패를, '안 내겠네(wont)'는
    // 표기 확률로 그 패를 회피한다. 예고된 패를 꺾은 승리는 보상 절반(싱거운 승부).
    let declHand: RpsHand | null = null
    let declMode: 'will' | 'wont' = 'will'
    let declProb = 0
    const usedItems = new Set<RpsItemId>()
    const itemById = new Map<RpsItemId, RpsItemDef>(cfg.items.map((it) => [it.id, it]))

    const deckCount = (h: RpsHand): number => deckQueue.filter((x) => x === h).length
    const deckEmpty = (): boolean => deckQueue.length === 0
    const avail = (): number => snap.light + net
    const resLeft = (res: EventResourceKind): number => (res === 'light' ? avail() : mirror[res])
    const streakMult = (s: number): number => Math.min(3, 1 + Math.max(0, s) * 0.5)
    const remainingTypes = (): RpsHand[] => HANDS.filter((h) => deckCount(h) > 0)
    // 불빛 비용은 판돈과 같은 층 인플레이션을 받는다(차단 등 정보 아이템 가치 보정).
    const itemCost = (it: RpsItemDef): number =>
      it.costRes === 'light' ? Math.max(1, Math.round(it.costAmount * (1 + snap.floor * 0.02))) : it.costAmount

    const itemAffordable = (it: RpsItemDef): boolean => {
      if (busy || deckEmpty() || usedItems.has(it.id)) return false
      if (resLeft(it.costRes) < itemCost(it)) return false
      // 체력 지불은 5 아래로 못 내려간다(자살 방지).
      if (it.costRes === 'health' && mirror.health - itemCost(it) < 5) return false
      // 차단은 남은 패 종류가 2개 이상이어야 의미가 있다(마지막 한 종류는 못 막음).
      if (it.id === 'block' && remainingTypes().length < 2) return false
      return true
    }
    const payItem = (it: RpsItemDef): void => {
      const c = itemCost(it)
      if (it.costRes === 'light') { sink.gainLight(-c); net -= c }
      else if (it.costRes === 'health') { sink.changeHealth(-c); mirror.health -= c }
      else if (it.costRes === 'candle') { sink.gainCandle(-c); mirror.candle -= c }
      else if (it.costRes === 'shield') { sink.spendShield(c); mirror.shield -= c }
      else { sink.sellHand(c); mirror.hand -= c }
    }
    // 차단은 픽커에서 손을 고른 순간 지불·발동한다(아래 픽커 핸들러). 나머지는 즉시 발동.
    const useItem = (it: RpsItemDef): void => {
      payItem(it)
      usedItems.add(it.id)
      if (it.id === 'double') doubleNext = true
      else if (it.id === 'ward') wardNext = true
    }

    // 이번 판 백작이 각 손을 낼 종합 확률 — 선언(will/wont)·차단·남은 장수를 실제 추첨
    // 로직과 동일한 식으로 합성한다. 표시가 곧 진실이라 순수 추리/EV 계산 재료가 된다.
    const throwOdds = (): Record<RpsHand, number> => {
      const odds: Record<RpsHand, number> = { rock: 0, paper: 0, scissors: 0 }
      let candidates = deckQueue.filter((h) => h !== blocked)
      if (candidates.length === 0) candidates = [...deckQueue]
      const total = candidates.length
      if (total === 0) return odds
      const cnt = (h: RpsHand): number => candidates.filter((x) => x === h).length
      const declLive = declHand !== null && cnt(declHand) > 0
      const rest = declLive ? candidates.filter((h) => h !== declHand) : []
      if (declLive && declMode === 'will') {
        for (const h of HANDS) {
          if (h === declHand) odds[h] = rest.length ? declProb : 1
          else odds[h] = rest.length ? (1 - declProb) * (rest.filter((x) => x === h).length / rest.length) : 0
        }
      } else if (declLive && declMode === 'wont') {
        for (const h of HANDS) {
          const avoidPart = rest.length ? declProb * (rest.filter((x) => x === h).length / rest.length) : declProb * (cnt(h) / total)
          odds[h] = (h === declHand ? 0 : avoidPart) + (1 - declProb) * (cnt(h) / total)
        }
      } else {
        for (const h of HANDS) odds[h] = cnt(h) / total
      }
      return odds
    }

    // 매 판 백작의 확률 선언을 굴린다. 선언 패는 남은 장수 비례로 고르고,
    // 표기 %는 실제 이행 확률과 정확히 일치시켜 계산 가능한 정보(실력 재료)로 만든다.
    const rollDeclaration = (): void => {
      const pool = [...deckQueue]
      if (pool.length === 0) { declHand = null; return }
      declHand = pool[Math.floor(Math.random() * pool.length)]
      declMode = Math.random() < 0.7 ? 'will' : 'wont'
      const opts = declMode === 'will' ? [0.55, 0.65, 0.75, 0.85] : [0.7, 0.8, 0.9]
      declProb = opts[Math.floor(Math.random() * opts.length)]
    }

    // 손 이미지 타일(정사각 둥근모서리 + 풀인 마스크). 파일 없으면 텍스트 라벨로 폴백한다.
    const handArt = (h: RpsHand): string => {
      const art = spriteForRps(h)
      return art
        ? `<span class="rps-hand-art" style="background-image:url('${art}')"></span>`
        : `<span class="rps-hand-text">${HAND_LABEL[h]}</span>`
    }
    // 도전 별: 총 판수만큼 깔고 결과(승/패/비김)에 따라 노랑/빨강/회색으로 채운다.
    const triesHtml = Array.from({ length: totalRounds }, () => `<span class="mini-rps-try">${sparkleIcon()}</span>`).join('')
    // 아이템은 레일 좌측에 세로 부채꼴로 — 인덱스로 회전각을 계산해 살짝 펼친다.
    // 차단은 버튼 옆으로 손 선택 픽커가 떠서 원하는 패를 직접 봉쇄한다.
    const n = cfg.items.length
    const itemHtml = cfg.items.map((it, i) => {
      const angle = (i - (n - 1) / 2) * 6
      const picker = it.id === 'block'
        ? `<span class="rps-block-picker" hidden>${HANDS.map((h) => `<button class="rps-block-opt" type="button" data-hand="${h}" title="${HAND_LABEL[h]}">${handArt(h)}</button>`).join('')}</span>`
        : ''
      return `<span class="rps-item-slot" style="transform:rotate(${angle}deg)">
        <button class="mini-rps-item" type="button" data-item="${it.id}" title="${escapeHtml(it.desc)}">
          <span class="it-label">${escapeHtml(it.label)}</span>
          <span class="it-cost">${RES_LABEL[it.costRes]} ${itemCost(it).toLocaleString()}</span>
        </button>
        ${picker}
      </span>`
    }).join('')
    // 판돈은 별(sparkle) 개수 + 수치로 스타일리시하게.
    const stakeHtml = stakeMults.map((m, i) => {
      const stars = Array.from({ length: i + 1 }, () => `<span class="stake-star">${sparkleIcon()}</span>`).join('')
      return `<button class="mini-rps-stake" type="button" data-mult="${m}">
        <span class="stake-stars">${stars}</span>
        <span class="stake-amt">${(stakeUnit * m).toLocaleString()}</span>
      </button>`
    }).join('')
    const throwHtml = HANDS.map((h) => `<button class="mini-rps-throw" type="button" data-throw="${h}">${handArt(h)}<span class="rps-throw-name">${HAND_LABEL[h]}</span></button>`).join('')
    // 컨트롤을 레일 전체에 넓게 분포한다: 상단 중앙 슬롯 아래 종합 확률·선언, 좌측 아이템,
    // 우측 판돈, 하단 던지기. 판정 토스트는 중간 하단 여백(던지기 위)에 크게 떠오른다.
    content.innerHTML = `
      <div class="mini-rps-cardslot" data-state="empty">
        <span class="cs-face" aria-hidden="true">${handArt('rock')}${handArt('paper')}${handArt('scissors')}<span class="cs-empty">?</span></span>
        <span class="cs-tag"></span>
        <div class="mini-rps-odds" aria-live="polite"></div>
        <div class="mini-rps-decl" aria-live="polite"></div>
      </div>
      <div class="mini-rps is-in">
        <div class="mini-rps-top">
          <div class="mini-rps-tries">${triesHtml}</div>
          <div class="mini-rps-streak">연승 <b>x1.0</b></div>
        </div>
        <div class="mini-rps-items">${itemHtml}</div>
        <div class="mini-rps-stakes">${stakeHtml}</div>
        <div class="mini-rps-toasts" aria-live="polite"></div>
        <div class="mini-rps-throws">${throwHtml}</div>
        <button class="mini-rps-done" type="button">물러나기</button>
      </div>`

    const slotEl = content.querySelector<HTMLElement>('.mini-rps-cardslot')!
    const slotFaces = new Map<RpsHand, HTMLElement>()
    slotEl.querySelectorAll<HTMLElement>('.cs-face .rps-hand-art, .cs-face .rps-hand-text').forEach((el, i) => slotFaces.set(HANDS[i], el))
    const slotTagEl = slotEl.querySelector<HTMLElement>('.cs-tag')!
    const panel = content.querySelector<HTMLElement>('.mini-rps')!
    const tryEls = Array.from(panel.querySelectorAll<HTMLElement>('.mini-rps-try'))
    const streakEl = panel.querySelector<HTMLElement>('.mini-rps-streak b')!
    const declEl = content.querySelector<HTMLElement>('.mini-rps-decl')!
    const oddsEl = content.querySelector<HTMLElement>('.mini-rps-odds')!
    const toastsEl = panel.querySelector<HTMLElement>('.mini-rps-toasts')!
    const itemEls = Array.from(panel.querySelectorAll<HTMLButtonElement>('.mini-rps-item'))
    const blockPickerEl = panel.querySelector<HTMLElement>('.rps-block-picker')
    const blockOptEls = Array.from(panel.querySelectorAll<HTMLButtonElement>('.rps-block-opt'))
    const stakeEls = Array.from(panel.querySelectorAll<HTMLButtonElement>('.mini-rps-stake'))
    const throwEls = Array.from(panel.querySelectorAll<HTMLButtonElement>('.mini-rps-throw'))
    const doneEl = panel.querySelector<HTMLButtonElement>('.mini-rps-done')!

    const update = (): void => {
      // 도전 별 — 결과별 색을 채우고, 남은 판은 흐리게 둔다.
      tryEls.forEach((el, i) => {
        const r = roundResults[i]
        el.classList.toggle('is-win', r === 'win')
        el.classList.toggle('is-lose', r === 'lose')
        el.classList.toggle('is-tie', r === 'tie')
      })
      streakEl.textContent = `x${streakMult(streak).toFixed(1)}`
      // 상단 슬롯: 방금 낸 패 > 빈 슬롯. 손 이미지를 얼굴 부근에 크게 보여준다.
      // 슬롯머신 스핀 중에는 스핀 연출이 슬롯을 직접 제어하므로 건드리지 않는다.
      if (!spinning) {
        slotEl.dataset.state = lastPlayed ? 'played' : 'empty'
        for (const [h, el] of slotFaces) el.classList.toggle('is-shown', h === lastPlayed)
        slotTagEl.textContent = lastPlayed ? '백작이 낸 패' : ''
      }
      // 백작 선언 — 대사와 표기 확률을 함께 보여 계산 재료로 삼는다.
      declEl.textContent = declHand
        ? (declMode === 'will'
          ? `“이번 손은 ${HAND_LABEL[declHand]}가 끌리는군.” (${HAND_LABEL[declHand]} ${Math.round(declProb * 100)}%)`
          : `“${HAND_LABEL[declHand]}는 내지 않겠네.” (회피 ${Math.round(declProb * 100)}%)`)
        : ''
      // 종합 확률 — 선언·차단·잔량이 합쳐진 이번 판 백작의 손 분포.
      // 글자 대신 손 엠블럼 이미지 + % 배지로, 던지기 타일과 같은 양식을 쓴다(차단은 붉은 ×).
      const odds = throwOdds()
      oddsEl.innerHTML = HANDS.map((h) =>
        `<span class="odds-chip${h === blocked ? ' is-blocked' : ''}" title="${HAND_LABEL[h]}">${handArt(h)}<b>${h === blocked ? '×' : `${Math.round(odds[h] * 100)}%`}</b></span>`
      ).join('')
      // 아이템 장전 상태는 별도 줄 대신 버튼 자체 발광(is-armed)으로 보여준다.
      itemEls.forEach((b) => {
        const it = itemById.get(b.dataset.item as RpsItemId)!
        const armed = (it.id === 'double' && doubleNext) || (it.id === 'ward' && wardNext)
        b.classList.toggle('is-armed', armed)
        b.classList.toggle('is-disabled', !armed && !itemAffordable(it))
        b.classList.toggle('is-used', !armed && usedItems.has(it.id))
      })
      // 차단 픽커 옵션은 실제 남아 있는 패만 활성화한다.
      blockOptEls.forEach((b) => b.classList.toggle('is-disabled', deckCount(b.dataset.hand as RpsHand) === 0))
      const affordable = (m: number): boolean => stakeUnit * m <= avail()
      stakeEls.forEach((b) => {
        const m = Number(b.dataset.mult)
        b.classList.toggle('is-disabled', busy || !affordable(m))
        b.classList.toggle('is-selected', m === selectedMult)
      })
      if (!affordable(selectedMult)) {
        const best = [...stakeMults].reverse().find((m) => affordable(m))
        selectedMult = best ?? 0
        stakeEls.forEach((b) => b.classList.toggle('is-selected', Number(b.dataset.mult) === selectedMult))
      }
      const canThrow = !busy && !deckEmpty() && selectedMult > 0 && avail() > 0
      throwEls.forEach((b) => b.classList.toggle('is-disabled', !canThrow))
    }

    // 판정 토스트 — 중간 하단 여백에 크게 떠서 오래 머물다 스르륵 사라진다(체인 로그 톤).
    // 생성 직후 rect를 돌려줘 획득 블라스트의 출발점으로 쓴다.
    const RESULT_HEAD: Record<'win' | 'lose' | 'tie', string> = { win: '승리!', lose: '패배', tie: '비김' }
    const pushToast = (kind: 'win' | 'lose' | 'tie', detail: string): DOMRect => {
      const t = document.createElement('div')
      t.className = `rps-toast is-${kind}`
      t.innerHTML = `<b class="rps-toast-head">${RESULT_HEAD[kind]}</b><span class="rps-toast-detail">${escapeHtml(detail)}</span>`
      toastsEl.appendChild(t)
      while (toastsEl.children.length > 2) toastsEl.firstElementChild?.remove()
      const rect = t.getBoundingClientRect()
      window.setTimeout(() => {
        t.classList.add('is-out')
        window.setTimeout(() => t.remove(), 760)
      }, 2600)
      return rect
    }

    const beginRound = (): void => {
      busy = false
      blocked = null
      doubleNext = false
      wardNext = false
      usedItems.clear()
      if (blockPickerEl) blockPickerEl.hidden = true
      rollDeclaration()
      update()
    }

    // 백작이 낼 때 슬롯머신처럼 세 장이 띠리리릭 돌다가 탕! 하고 착지한다.
    const spinReveal = (final: RpsHand, done: () => void): void => {
      spinning = true
      slotEl.dataset.state = 'spin'
      slotTagEl.textContent = '. . .'
      const total = 11
      let t = 0
      const step = (): void => {
        // 감속하며 무작위 손을 번갈아 보인다.
        const rnd = HANDS[Math.floor(Math.random() * HANDS.length)]
        for (const [h, el] of slotFaces) el.classList.toggle('is-shown', h === rnd)
        slotEl.classList.remove('is-tick'); void slotEl.offsetWidth; slotEl.classList.add('is-tick')
        t += 1
        if (t < total) window.setTimeout(step, 45 + t * t * 2)
        else {
          // 착지 — 탕!
          for (const [h, el] of slotFaces) el.classList.toggle('is-shown', h === final)
          spinning = false
          lastPlayed = final
          slotEl.dataset.state = 'played'
          slotTagEl.textContent = '백작이 낸 패'
          slotEl.classList.remove('is-tick', 'is-impact'); void slotEl.offsetWidth; slotEl.classList.add('is-impact')
          window.setTimeout(done, 300)
        }
      }
      step()
    }

    await new Promise<void>((resolve) => {
      // 종료: 완승 유물 판정 후 패널을 접고 resolve → 호출부가 마무리 대사를 UI가 사라진 뒤 출력.
      const finish = (): void => {
        if (deckEmpty() && net >= cfg.relicWinMultiple * stakeUnit) {
          sink.grantRelic()
          void this.host.trails.animateResourceTrail(slotEl.getBoundingClientRect(), this.host.trails.findResourceTrailTarget('relic'), 4, 'treasure-gain')
          onMoment?.('rps-relic')
        }
        panel.classList.add('is-closing')
        window.setTimeout(resolve, 340)
      }
      itemEls.forEach((b) => {
        b.addEventListener('click', (e) => {
          e.stopPropagation()
          const it = itemById.get(b.dataset.item as RpsItemId)
          if (!it || !itemAffordable(it)) return
          // 차단은 즉시 발동 대신 손 선택 픽커를 연다(선택 시 지불·발동, 재클릭으로 취소).
          if (it.id === 'block') {
            if (blockPickerEl) blockPickerEl.hidden = !blockPickerEl.hidden
            return
          }
          useItem(it)
          const r = b.getBoundingClientRect()
          SquareBurst.playAt(r.left + r.width / 2, r.top + r.height / 2, 'starlight', { count: 8, spread: 80, duration: 420 })
          b.classList.remove('is-pulse'); void b.offsetWidth; b.classList.add('is-pulse')
          update()
        })
      })
      // 차단 픽커 — 원하는 손을 고르면 그 순간 값을 치르고 봉쇄한다.
      blockOptEls.forEach((opt) => {
        opt.addEventListener('click', (e) => {
          e.stopPropagation()
          const it = itemById.get('block')
          if (!it || opt.classList.contains('is-disabled') || !itemAffordable(it)) return
          payItem(it)
          usedItems.add('block')
          blocked = opt.dataset.hand as RpsHand
          if (blockPickerEl) blockPickerEl.hidden = true
          const r = opt.getBoundingClientRect()
          SquareBurst.playAt(r.left + r.width / 2, r.top + r.height / 2, 'starlight', { count: 8, spread: 80, duration: 420 })
          update()
        })
      })
      stakeEls.forEach((b) => {
        b.addEventListener('click', (e) => {
          e.stopPropagation()
          if (b.classList.contains('is-disabled')) return
          selectedMult = Number(b.dataset.mult)
          update()
        })
      })
      throwEls.forEach((b) => {
        b.addEventListener('click', (e) => {
          e.stopPropagation()
          if (b.classList.contains('is-disabled')) return
          const mine = b.dataset.throw as RpsHand
          const stake = stakeUnit * selectedMult
          if (busy || spinning || deckEmpty() || stake > avail() || stake <= 0) return
          busy = true
          const mult = doubleNext ? 2 : 1
          const ward = wardNext
          // 백작의 손 결정 — 차단된 패를 후보에서 빼고, 선언(will/wont)을 표기 확률 그대로 이행한다.
          // 후보 배열은 남은 장수 비례라 카운팅이 그대로 확률 계산 재료가 된다.
          const pickFrom = (pool: RpsHand[]): RpsHand => pool[Math.floor(Math.random() * pool.length)]
          let candidates = deckQueue.filter((h) => h !== blocked)
          if (candidates.length === 0) candidates = [...deckQueue]
          let theirs: RpsHand
          const declLive = declHand !== null && candidates.includes(declHand)
          if (declLive && declMode === 'will') {
            const rest = candidates.filter((h) => h !== declHand)
            theirs = Math.random() < declProb || rest.length === 0 ? (declHand as RpsHand) : pickFrom(rest)
          } else if (declLive && declMode === 'wont') {
            const rest = candidates.filter((h) => h !== declHand)
            theirs = Math.random() < declProb && rest.length > 0 ? pickFrom(rest) : pickFrom(candidates)
          } else {
            theirs = pickFrom(candidates)
          }
          deckQueue.splice(deckQueue.indexOf(theirs), 1)
          b.classList.remove('is-pulse'); void b.offsetWidth; b.classList.add('is-pulse')
          update() // 스핀 동안 입력 잠금
          // 슬롯머신 스핀 → 착지 뒤에 승패를 정산한다.
          spinReveal(theirs, () => {
            const outcome: 'win' | 'lose' | 'tie' = mine === theirs ? 'tie' : beats(mine, theirs) ? 'win' : 'lose'
            roundResults.push(outcome) // 상단 도전 별 기록(노랑/빨강/회색)
            const vs = `${HAND_LABEL[mine]} vs ${HAND_LABEL[theirs]}`
            if (outcome === 'win') {
              // 예고('끌리는군')대로 낸 패를 꺾은 승리는 싱겁다 — 보상 절반.
              // 예고를 무시하거나 거짓을 잡아낸 승리만 전액이라, 따라갈지 노릴지가 실력이 된다.
              const tame = declMode === 'will' && declHand === theirs
              const payout = Math.max(1, Math.round(stake * streakMult(streak + 1) * mult * (tame ? 0.5 : 1)))
              net += payout
              streak += 1
              sink.gainLight(payout)
              const rect = pushToast('win', `${vs} · 불빛 +${payout.toLocaleString()}${tame ? ' (예고된 승부 · 절반)' : ''}${mult > 1 ? ' (두배)' : ''}`)
              this.blastEventGain(rect, 'light', 4)
              // 에나 반응 — 결과 확정 순간. 연승 3+는 흐름 대사를 우선한다.
              onMoment?.(tame ? 'rps-tame' : streak >= 3 ? 'rps-streak' : 'rps-win')
            } else if (outcome === 'lose') {
              const loss = ward ? 0 : stake * mult
              net -= loss
              streak = 0
              if (loss > 0) sink.gainLight(-loss)
              pushToast('lose', ward ? `${vs} · 보호가 손실을 막았다` : `${vs} · 불빛 -${loss.toLocaleString()}${mult > 1 ? ' (두배)' : ''}`)
              onMoment?.('rps-lose')
            } else {
              const rake = ward ? 0 : Math.round(stake * tieFrac)
              net -= rake
              streak = 0
              if (rake > 0) sink.gainLight(-rake)
              pushToast('tie', ward ? `${vs} · 보호가 백작 몫을 막았다` : `${vs} · 백작 몫 -${rake.toLocaleString()}`)
            }
            update()
            if (deckEmpty()) window.setTimeout(finish, 950)
            else window.setTimeout(beginRound, 850)
          })
        })
      })
      doneEl.addEventListener('click', (e) => { e.stopPropagation(); if (!busy) finish() })
      beginRound()
    })
  }

  /** 전방 도달 시 이벤트 문 2턴 뱃지를 "슈룩" 팝인시킨다(슬라이드인 1회 재생). */
  popEventBadge(cardId: string): void {
    const badge = this.host.findCardElement(cardId)?.querySelector<HTMLElement>('.event-badge')
    if (!badge) return
    badge.classList.remove('is-pop'); void badge.offsetWidth; badge.classList.add('is-pop')
  }

  /** 이벤트 문이 닫힐 때(0턴) 카드 자체가 은은하게 흔들리며 흩어지는 연출. */
  async animateEventDoorCloseByIds(cardIds: readonly string[]): Promise<void> {
    const nodes = cardIds
      .map((id) => this.host.findCardElement(id))
      .filter((el): el is HTMLElement => Boolean(el))
    for (const el of nodes) {
      const rect = el.getBoundingClientRect()
      el.classList.add('is-event-door-closing')
      SquareBurst.playAt(rect.left + rect.width / 2, rect.top + rect.height / 2, 'vanish-smoke', {
        count: 22, spread: 132, duration: 720,
      })
    }
    if (nodes.length > 0) await new Promise((r) => window.setTimeout(r, 680))
  }

  /** 이벤트 진입 오버레이 전용 스타일. 커튼 자체는 .job-rail-curtain(GAME_BOARD_STYLES)을
   *  재사용하고, 여기서는 셸/일러스트/대사창/선택 버튼과 커튼 열기 재생만 정의한다.
   *  버튼은 색감을 빼고 황금빛 테두리 + 검은 반투명 내부의 고풍 스타일을 따른다. */
  private ensureEventEntryStyles(): void {
    if (document.getElementById('event-entry-styles')) return
    const style = document.createElement('style')
    style.id = 'event-entry-styles'
    style.textContent = `
#event-entry-overlay { position: fixed; inset: 0; z-index: 140; }
.event-entry-shell { position: fixed; overflow: hidden; border-radius: 14px; }
.event-entry-illu {
  position: absolute; inset: 0; z-index: 5;
  background-size: cover; background-position: center;
  opacity: 0;
  clip-path: inset(0 50% 0 50%);
  transform: scaleY(0.965);
  filter: saturate(0.88) brightness(0.72);
}
.event-entry-illu.is-shown { animation: event-illu-reveal 0.72s cubic-bezier(0.18, 0.82, 0.22, 1) both; }
.event-entry-illu.event-entry-illu--empty {
  background: radial-gradient(120% 90% at 50% 38%, rgba(40, 28, 52, 0.96), rgba(8, 5, 13, 0.99));
}
#event-entry-overlay .job-rail-curtain {
  width: 56%;
  animation-duration: 1.22s;
  animation-timing-function: cubic-bezier(0.15, 0.78, 0.22, 1);
}
#event-entry-overlay .job-rail-curtain--left {
  background:
    linear-gradient(90deg, rgba(0, 0, 0, 0.56) 0%, rgba(7, 5, 13, 0.93) 18%, rgba(21, 15, 33, 0.95) 58%, rgba(6, 4, 12, 0.9) 82%, rgba(6, 4, 12, 0) 100%),
    repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.028) 0 1px, transparent 1px 18px);
}
#event-entry-overlay .job-rail-curtain--right {
  background:
    linear-gradient(270deg, rgba(0, 0, 0, 0.56) 0%, rgba(7, 5, 13, 0.93) 18%, rgba(21, 15, 33, 0.95) 58%, rgba(6, 4, 12, 0.9) 82%, rgba(6, 4, 12, 0) 100%),
    repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.028) 0 1px, transparent 1px 18px);
}
.event-dialogue-anchor {
  position: absolute;
  width: 1px; height: 1px;
  pointer-events: none;
}
/* 기방문 이벤트 연출 스킵 — 레일 우하단의 조용한 글자 버튼 */
.event-skip-btn {
  position: absolute; right: 3%; bottom: 3.5%; z-index: 9;
  border: none; background: none; cursor: pointer; padding: 6px 10px;
  font-family: 'OkDanDan', Georgia, serif; font-size: 15px; font-weight: 900; letter-spacing: 0.14em;
  color: rgba(255, 238, 200, 0.62);
  text-shadow: 0 1px 6px rgba(0, 0, 0, 0.9);
  transition: color 0.16s, text-shadow 0.16s, transform 0.14s;
}
.event-skip-btn:hover {
  color: rgba(255, 248, 226, 1); transform: translateX(2px);
  text-shadow: 0 1px 6px rgba(0, 0, 0, 0.9), 0 0 14px rgba(255, 210, 120, 0.6);
}
.event-dialogue-anchor--demon { left: 50%; top: 74%; z-index: 7; }
.event-entry-content {
  position: absolute; inset: 0; z-index: 6;
  display: flex; flex-direction: column; justify-content: flex-end; align-items: center;
  padding: 0 4% 6%; gap: 14px; pointer-events: none;
}
.event-entry-content > * { pointer-events: auto; }

/* ── 선택지 컨테이너: 배경·테두리 없이 폰트 중심 ── */
.event-choices[hidden] { display: none !important; }
.event-choices {
  position: relative;
  width: min(96%, 840px);
  display: flex; flex-direction: column; align-items: stretch; gap: 10px;
  padding: 20px 10px 14px;
}
.event-choices.is-in { animation: event-line-in 0.32s ease both; }
.event-choices.is-resolved { pointer-events: none; }
.event-choices.is-choice-finished { animation: event-choice-finished 0.44s cubic-bezier(0.2, 0.72, 0.2, 1) both; }

/* 좌우 양초 선택지 row — row 전체에 수평 그림자 띠를 씌워 버튼 개별이 밖으로 삐져나가지 않게 함 */
.event-choices-row {
  position: relative;
  display: flex; flex-direction: row; gap: 20px; justify-content: center;
}
/* row 전체를 가로지르는 그림자 띠: 세로는 은은하게, 가로는 좌우 40px까지만 확장 */
.event-choices-row::before {
  content: '';
  position: absolute;
  left: -40px; right: -40px; top: 0; bottom: 0;
  background: linear-gradient(180deg,
    transparent 0%,
    rgba(0, 0, 0, 0.30) 20%,
    rgba(0, 0, 0, 0.38) 50%,
    rgba(0, 0, 0, 0.30) 80%,
    transparent 100%
  );
  pointer-events: none; z-index: 0;
  transition: opacity 0.18s;
}

/* ── 공통 선택 버튼: 테두리·배경 없음, 폰트와 그림자로만 표현 ── */
.event-choice-btn {
  position: relative;
  flex: 1;
  display: flex; flex-direction: column; align-items: flex-start;
  min-height: 80px; padding: 16px 22px 14px;
  border: none; background: none;
  cursor: pointer; overflow: visible;
  font-family: 'OkDanDan', Georgia, serif;
  color: rgba(255, 238, 200, 0.88);
  transition: color 0.18s, transform 0.14s;
}
.event-choice-btn:hover { color: rgba(255, 248, 226, 0.98); transform: translateY(-3px); }

/* 레이블·구분선·효과 텍스트 — 그림자 레이어 위로 */
.event-choice-copy {
  position: relative; z-index: 1;
  display: flex; flex-direction: column; gap: 7px; width: 100%;
}
.event-choice-label {
  font-size: 22px; font-weight: 900; letter-spacing: 0.07em; line-height: 1.1; display: block;
  text-shadow: 0 2px 14px rgba(0, 0, 0, 0.9), 0 1px 4px rgba(0, 0, 0, 0.95);
  transition: text-shadow 0.18s, transform 0.14s;
}
.event-choice-btn:hover .event-choice-label {
  text-shadow: 0 2px 18px rgba(0, 0, 0, 0.9), 0 0 28px currentColor, 0 1px 4px rgba(0, 0, 0, 0.95);
}
/* 직업카드 divider 스타일 — 좌측 currentColor에서 우측 투명으로 페이드 */
.event-choice-divider-line {
  display: block; height: 1.5px; width: 44px; border-radius: 2px;
  background: linear-gradient(90deg, currentColor 0%, transparent 100%);
  opacity: 0.40; margin: 1px 0;
  transition: width 0.2s, opacity 0.18s;
}
.event-choice-btn:hover .event-choice-divider-line { width: 70px; opacity: 0.62; }
.event-choice-effects {
  font-size: 13px; color: rgba(210, 198, 178, 0.72); letter-spacing: 0.04em;
  text-shadow: 0 1px 5px rgba(0, 0, 0, 0.88); line-height: 1.5; white-space: normal;
}
.event-effect-part { color: rgba(244, 206, 112, 0.85); }
.event-effect-part.is-demerit {
  color: rgba(218, 72, 52, 0.88);
  text-shadow: 0 1px 5px rgba(0, 0, 0, 0.88), 0 0 10px rgba(200, 40, 28, 0.18);
}
.event-effect-sep { color: rgba(180, 168, 148, 0.55); }

/* 붉은 양초 — 따뜻한 연붉은, 좌측 배치: 바깥쪽 패딩을 줄여 왼쪽에 밀착 */
.event-choice--candle-red { color: rgba(238, 126, 112, 0.9); padding-left: 8px; }
.event-choice--candle-red:hover { color: rgba(255, 152, 138, 1); }
.event-choice--candle-red .event-choice-divider-line {
  align-self: center;
  background: linear-gradient(90deg, transparent 0%, rgba(238, 100, 82, 0.85) 50%, transparent 100%);
}

/* 푸른 양초 — 우측 배치 대칭: 텍스트·라인 우정렬, 바깥쪽 패딩 대칭 조정 */
.event-choice--candle-blue { color: rgba(104, 158, 240, 0.9); padding-right: 8px; }
.event-choice--candle-blue:hover { color: rgba(130, 186, 255, 1); }
.event-choice--candle-blue .event-choice-copy { align-items: center; }
.event-choice--candle-blue .event-choice-label { text-align: center; }
.event-choice--candle-blue .event-choice-effects { text-align: center; }
.event-choice--candle-blue .event-choice-divider-line {
  align-self: center;
  background: linear-gradient(90deg, transparent 0%, rgba(88, 148, 228, 0.85) 50%, transparent 100%);
}

/* 불태우기 — 하단 중앙 단독 배치, 일렁이는 위험한 색. 자체 수평 그림자 띠 포함. */
.event-burn-btn {
  flex: none; align-self: center;
  width: min(60%, 360px); min-height: 68px;
  align-items: center; text-align: center;
  margin-top: 4px;
}
.event-burn-btn::before {
  content: '';
  position: absolute;
  left: -32px; right: -32px; top: 0; bottom: 0;
  background: linear-gradient(180deg,
    transparent 0%,
    rgba(0, 0, 0, 0.26) 20%,
    rgba(0, 0, 0, 0.34) 50%,
    rgba(0, 0, 0, 0.26) 80%,
    transparent 100%
  );
  pointer-events: none; z-index: 0;
}
.event-burn-btn .event-choice-copy { align-items: center; }
.event-burn-btn .event-choice-divider-line {
  background: linear-gradient(90deg, transparent 0%, rgba(210, 72, 40, 0.72) 50%, transparent 100%);
  width: 52px;
}
.event-burn-btn:hover .event-choice-divider-line { width: 80px; }
.event-burn-btn.is-disabled { opacity: 0.28; pointer-events: none; }
/* 비활성 상태: 소灯 회색톤 */
.event-burn-btn:not(.is-armed) .event-choice-label { color: rgba(110, 100, 104, 0.60); }
.event-burn-btn:not(.is-armed) .event-choice-effects { color: rgba(96, 88, 92, 0.55); }
/* 활성 상태: 일렁이는 불꽃 */
.event-burn-btn.is-armed .event-choice-label {
  animation: event-burn-flicker 1.8s ease-in-out infinite;
}
.event-burn-btn.is-armed:hover { transform: translateY(-2px) scale(1.04); }

/* 선택 완료 애니메이션 */
.event-choice-btn.is-selected { animation: event-choice-pick-pop 0.48s cubic-bezier(0.18, 0.86, 0.24, 1) both; }

/* 열기·닫기 */
#event-entry-overlay.is-opening { pointer-events: none; }
#event-entry-overlay.is-opening .event-entry-content { opacity: 0; transition: opacity 0.22s ease; }
#event-entry-overlay.is-opening .event-entry-illu { animation: event-illu-fold-out 0.72s cubic-bezier(0.2, 0.72, 0.26, 1) forwards; }
#event-entry-overlay.is-opening .job-rail-curtain--left { animation: job-curtain-open-left 0.9s 0.72s cubic-bezier(0.18, 0.82, 0.25, 1) forwards; }
#event-entry-overlay.is-opening .job-rail-curtain--right { animation: job-curtain-open-right 0.9s 0.72s cubic-bezier(0.18, 0.82, 0.25, 1) forwards; }

@keyframes event-illu-reveal {
  0% { opacity: 0; clip-path: inset(0 50% 0 50%); transform: scaleY(0.965); filter: saturate(0.75) brightness(0.58); }
  48% { opacity: 0.52; clip-path: inset(0 28% 0 28%); }
  100% { opacity: 1; clip-path: inset(0 0 0 0); transform: scaleY(1); filter: saturate(1) brightness(1); }
}
@keyframes event-illu-fold-out {
  0% { opacity: 1; clip-path: inset(0 0 0 0); transform: scaleY(1); filter: saturate(1) brightness(1); }
  62% { opacity: 0.48; clip-path: inset(0 43% 0 43%); }
  100% { opacity: 0; clip-path: inset(0 50% 0 50%); transform: scaleY(0.965); filter: saturate(0.75) brightness(0.54); }
}
@keyframes event-line-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
@keyframes event-choice-pick-pop {
  0% { transform: scale(1); filter: brightness(1); }
  42% { transform: scale(1.07); filter: brightness(1.28); }
  100% { transform: scale(1.01); filter: brightness(1.04); }
}
@keyframes event-choice-finished {
  0% { opacity: 1; transform: scale(1); }
  42% { opacity: 0.92; transform: scale(1.05); }
  100% { opacity: 0; transform: scale(0.88) translateY(8px); filter: blur(4px); }
}
/* 불태우기 일렁임: 주황-적-황색 사이를 비규칙적으로 반짝인다 */
@keyframes event-burn-flicker {
  0%   { color: rgba(218, 78, 44, 0.92); text-shadow: 0 2px 14px rgba(0,0,0,0.9), 0 0 14px rgba(200, 58, 28, 0.28); }
  18%  { color: rgba(255, 134, 54, 0.98); text-shadow: 0 2px 14px rgba(0,0,0,0.9), 0 0 22px rgba(255, 100, 38, 0.50); }
  42%  { color: rgba(196, 44, 24, 0.88); text-shadow: 0 2px 14px rgba(0,0,0,0.9), 0 0 8px rgba(180, 28, 18, 0.16); }
  66%  { color: rgba(255, 172, 64, 0.96); text-shadow: 0 2px 14px rgba(0,0,0,0.9), 0 0 30px rgba(255, 126, 44, 0.62); }
  84%  { color: rgba(230, 60, 36, 0.90); text-shadow: 0 2px 14px rgba(0,0,0,0.9), 0 0 16px rgba(210, 48, 28, 0.36); }
  100% { color: rgba(218, 78, 44, 0.92); text-shadow: 0 2px 14px rgba(0,0,0,0.9), 0 0 14px rgba(200, 58, 28, 0.28); }
}
`
    document.head.appendChild(style)
  }

  /** 이벤트 미니게임(미니언 저울 / 백작 가위바위보) 전용 스타일. 촛불·낡은 종이 톤 유지,
   *  겁 게이지는 별빛(starlight) 다이아 pip 으로만 표현해 이모지 없이 스타일리시하게 채운다. */
  private ensureEventMinigameStyles(): void {
    if (document.getElementById('event-minigame-styles')) return
    const style = document.createElement('style')
    style.id = 'event-minigame-styles'
    style.textContent = `
/* 공통 패널 — 테두리/박스 없이 은은한 방사형 어둠만 깔아 뒷배경과 경계를 허문다.
   자원 수치는 별도 원장 없이 실제 HUD가 실시간으로 보여준다. */
.mini-exchange, .mini-rps {
  width: min(96%, 700px);
  display: flex; flex-direction: column; gap: 12px;
  padding: 14px 16px 16px;
  background: radial-gradient(125% 135% at 50% 62%, rgba(6, 4, 12, 0.5) 0%, rgba(6, 4, 12, 0.22) 52%, rgba(6, 4, 12, 0) 82%);
  font-family: 'OkDanDan', Georgia, serif;
  color: rgba(255, 238, 200, 0.92);
  text-shadow: 0 1px 6px rgba(0, 0, 0, 0.85);
}
/* 백작은 컨트롤을 레일 전체에 넓게 분포한다: 상단 중앙 슬롯+확률·선언, 좌측 아이템 열,
   우측 판돈 열, 하단 던지기, 우하단 물러나기. 패널은 레일을 꽉 채우고(flex:1) 판정 토스트가
   중간 하단 여백을 차지한다. 배경 어둠은 옅게 깔아 일러스트가 잘 비치게 한다. */
.mini-rps {
  flex: 1 1 auto; min-height: 0; align-self: stretch; position: relative;
  width: auto; max-width: none; justify-content: flex-end;
  gap: 10px; padding-bottom: 4px;
  background: radial-gradient(130% 140% at 50% 60%, rgba(6, 4, 12, 0.3) 0%, rgba(6, 4, 12, 0.12) 50%, rgba(6, 4, 12, 0) 80%);
}
.mini-exchange.is-in, .mini-rps.is-in { animation: event-line-in 0.34s ease both; }
/* 접히는 동안엔 입력을 막아, UI가 사라진 뒤 나오는 마무리 대사 클릭이 버튼에 가로채이지 않게 한다. */
.mini-exchange.is-closing, .mini-rps.is-closing { pointer-events: none; animation: mini-panel-out 0.32s cubic-bezier(0.2, 0.72, 0.2, 1) forwards; }

/* ── 미니언 아슬아슬 흥정 ── */
/* 미니언 패널은 조금 더 큼직하게(중요 수치 위주) */
.mini-exchange { width: min(97%, 780px); gap: 16px; padding: 16px 24px 20px; }
.mini-meter-key { color: rgba(210, 198, 178, 0.66); font-size: 13px; letter-spacing: 0.08em; margin-right: 9px; }
.mini-ex-head { display: flex; align-items: center; justify-content: space-between; gap: 30px; flex-wrap: wrap; padding: 2px 6px; }
.mini-ex-gauge { display: inline-flex; align-items: center; gap: 13px; flex-wrap: wrap; }
.mini-ex-tries { display: inline-flex; align-items: center; }
/* 성공 확률 — 가장 중요한 수치라 크게 */
.mini-ex-chance-val { color: rgba(150, 224, 160, 0.99); font-size: 36px; font-weight: 900; letter-spacing: 0.01em; line-height: 1; text-shadow: 0 2px 10px rgba(0,0,0,0.85), 0 0 18px rgba(90, 190, 110, 0.28); }
/* 불안 — 오밀조밀한 작은 pip 미터(확률과 연동, 채워질수록 위험) */
.mini-anx-pips { display: inline-flex; gap: 3px; align-items: center; }
.mini-anx-pip { display: inline-flex; width: 11px; height: 11px; color: rgba(150, 110, 96, 0.38); transition: color 0.2s, filter 0.2s; }
.mini-anx-pip svg { width: 100%; height: 100%; }
.mini-anx-pip.is-lit { color: rgba(255, 168, 110, 0.98); filter: drop-shadow(0 0 4px rgba(232, 120, 70, 0.9)); }
/* 남은 기회 — 큼직한 별 depletion(쓸수록 흐려짐) */
.mini-ex-tries-stars { display: inline-flex; gap: 6px; }
.mini-tries-star { display: inline-flex; width: 19px; height: 19px; color: rgba(120, 108, 86, 0.32); transition: color 0.25s, filter 0.25s, transform 0.25s; }
.mini-tries-star svg { width: 100%; height: 100%; }
.mini-tries-star.is-lit { color: rgba(255, 226, 150, 0.99); filter: drop-shadow(0 0 6px rgba(244, 206, 112, 0.8)); }
.mini-ex-result { min-height: 24px; text-align: center; font-size: 17px; font-weight: 800; }
.mini-ex-result.is-good { color: rgba(154, 228, 162, 0.99); animation: mini-result-pop 0.4s ease; }
.mini-ex-result.is-bad { color: rgba(230, 104, 86, 0.97); animation: mini-result-pop 0.4s ease; }

/* 옵션 탭 — 여백을 넉넉히 줘 번잡하지 않게 */
.mini-ex-offers { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.mini-ex-offer {
  display: flex; flex-direction: column; gap: 5px; align-items: flex-start;
  padding: 14px 20px; border-radius: 13px; cursor: pointer; border: none;
  background: rgba(18, 12, 9, 0.32);
  font-family: inherit; color: inherit; text-align: left;
  transition: transform 0.14s, background 0.18s, opacity 0.18s;
}
.mini-ex-offer:hover { transform: translateY(-2px); background: rgba(40, 28, 16, 0.48); }
/* 협박(실패 노림)은 역발상 옵션 — 보랏빛 기운으로 구분 */
.mini-ex-offer.is-reckless { background: rgba(30, 16, 30, 0.4); }
.mini-ex-offer.is-reckless:hover { background: rgba(52, 26, 52, 0.52); }
.mini-ex-offer-label { font-size: 18px; font-weight: 900; letter-spacing: 0.04em; color: rgba(255, 236, 190, 0.97); display: inline-flex; align-items: center; gap: 8px; }
.mini-ex-aim-tag { font-size: 11px; font-weight: 800; letter-spacing: 0.04em; color: rgba(206, 156, 244, 0.95); }
.mini-ex-branches { display: flex; gap: 20px; font-size: 14px; flex-wrap: wrap; margin-top: 2px; }
.mini-ex-branch { color: rgba(198, 188, 168, 0.58); }
.mini-ex-branch em { font-style: normal; color: rgba(188, 176, 156, 0.55); font-size: 12px; margin-right: 3px; }
/* 노린 분기(성공형=성공 / 협박=실패)의 보상 수치를 가장 크고 밝게 */
.mini-ex-branch.is-aim { color: rgba(150, 224, 160, 0.99); font-size: 17px; font-weight: 800; }
.mini-ex-branch.is-aim em { color: rgba(150, 224, 160, 0.82); font-size: 12px; }
.mini-ex-offer.is-reckless .mini-ex-branch.is-aim { color: rgba(216, 170, 250, 0.99); }
.mini-ex-offer.is-reckless .mini-ex-branch.is-aim em { color: rgba(216, 170, 250, 0.82); }
/* 하단 설명은 장식 — 작고 흐리게 */
.mini-ex-offer-hint { font-size: 10.5px; color: rgba(176, 166, 148, 0.38); letter-spacing: 0.02em; margin-top: 1px; }
.mini-ex-offer.is-disabled { opacity: 0.3; pointer-events: none; }
.mini-ex-offer.is-pulse { animation: mini-offer-pulse 0.4s cubic-bezier(0.2, 0.8, 0.2, 1); }

.mini-ex-done, .mini-rps-done {
  align-self: center; margin-top: 2px;
  padding: 8px 30px; border-radius: 999px; cursor: pointer; border: none;
  background: rgba(46, 34, 16, 0.5);
  color: rgba(255, 232, 176, 0.96); font-family: inherit; font-size: 15px; font-weight: 800; letter-spacing: 0.06em;
  text-shadow: 0 1px 6px rgba(0, 0, 0, 0.85);
  transition: transform 0.14s, background 0.18s, text-shadow 0.18s;
}
.mini-ex-done:hover, .mini-rps-done:hover { transform: translateY(-2px); background: rgba(64, 48, 22, 0.66); text-shadow: 0 1px 6px rgba(0,0,0,0.85), 0 0 16px rgba(255, 210, 120, 0.5); }

/* ── 백작 가위바위보 ── */
/* 공통 손 이미지 타일 — 정사각 둥근모서리, 테두리 없이 풀인 마스크(가장자리 페이드) + 그림자 */
.rps-hand-art {
  display: block; width: 100%; aspect-ratio: 1 / 1;
  background-size: cover; background-position: center;
  /* 마스크를 엠블럼 원 가장자리(closest-side 기준 ~52%)에 딱 맞춰 조이고 짧게 페이드 —
     엠블럼 밖 이미지 자체의 어두운 배경이 남아 비치던 경계를 잘라낸다. */
  -webkit-mask-image: radial-gradient(circle closest-side at 50% 50%, #000 50%, rgba(0,0,0,0.45) 62%, transparent 74%);
  mask-image: radial-gradient(circle closest-side at 50% 50%, #000 50%, rgba(0,0,0,0.45) 62%, transparent 74%);
}
.rps-hand-text { display: flex; align-items: center; justify-content: center; width: 100%; aspect-ratio: 1 / 1; font-size: 22px; font-weight: 900; color: rgba(255, 238, 196, 0.97); }

/* 상단 슬롯 — 백작 얼굴 부근(가운데 상단). 레일 전체(content) 기준 절대배치라 아이템에 안 가린다.
   종합 확률 칩과 확률 선언을 슬롯 바로 아래에 붙여 중앙 칩이 슬롯 뒤에 가려지던 문제를 없앤다. */
.mini-rps-cardslot { position: absolute; left: 50%; top: 3%; transform: translateX(-50%); width: clamp(104px, 15%, 172px); text-align: center; pointer-events: none; z-index: 3; }
.mini-rps-cardslot .cs-face { position: relative; display: block; width: 100%; aspect-ratio: 1 / 1; }
.mini-rps-cardslot .cs-face > * { position: absolute; inset: 0; opacity: 0; transition: opacity 0.16s; }
.mini-rps-cardslot .cs-face > .is-shown { opacity: 1; }
.mini-rps-cardslot .cs-empty { display: flex; align-items: center; justify-content: center; font-size: 54px; font-weight: 900; color: rgba(200, 190, 170, 0.28); }
.mini-rps-cardslot[data-state="empty"] .cs-empty { opacity: 1; }
.mini-rps-cardslot .cs-tag { display: block; margin-top: 2px; font-size: 14px; letter-spacing: 0.06em; color: rgba(220, 206, 252, 0.78); text-shadow: 0 1px 5px rgba(0, 0, 0, 0.85); }
.mini-rps-cardslot.is-tick .cs-face { filter: brightness(1.18); }
.mini-rps-cardslot.is-impact { animation: rps-slot-impact 0.36s cubic-bezier(0.2, 0.8, 0.2, 1); }

/* 상단 정보줄은 패널 flex에서 빼서 레일 좌·우 상단 코너에 고정 — 중앙 카드 슬롯과 같은 높이.
   세로 예산을 차지하지 않아 아래 컨트롤들이 레일 밖으로 밀리지 않는다. */
.mini-rps-top { position: absolute; left: 2%; right: 2%; top: 3.5%; display: flex; justify-content: space-between; align-items: center; z-index: 3; }
/* 도전 별 — 총 판수를 깔아두고 결과별로 채운다: 노랑=승 / 빨강=패 / 회색=비김 / 흐림=남은 판 */
.mini-rps-tries { display: inline-flex; gap: 7px; align-items: center; }
.mini-rps-try { display: inline-flex; width: 20px; height: 20px; color: rgba(120, 108, 86, 0.32); transition: color 0.25s, filter 0.25s; }
.mini-rps-try svg { width: 100%; height: 100%; }
.mini-rps-try.is-win { color: rgba(255, 226, 150, 0.99); filter: drop-shadow(0 0 6px rgba(244, 206, 112, 0.8)); }
.mini-rps-try.is-lose { color: rgba(236, 96, 72, 0.97); filter: drop-shadow(0 0 6px rgba(210, 54, 32, 0.65)); }
.mini-rps-try.is-tie { color: rgba(178, 172, 158, 0.85); filter: drop-shadow(0 0 4px rgba(150, 144, 130, 0.4)); }
.mini-rps-dot { color: rgba(180, 168, 148, 0.4); }
/* 종합 확률 칩 — 슬롯 아래 중앙, 슬롯 폭보다 넓게 탈출해 세 칩을 큼직하게 편다.
   손 엠블럼 이미지 + % 배지(던지기 타일과 같은 양식). 차단은 흐린 엠블럼 + 붉은 × */
.mini-rps-odds {
  position: relative; left: 50%; transform: translateX(-50%); width: max-content;
  margin-top: 10px; display: flex; align-items: flex-start; gap: 48px;
}
.odds-chip { position: relative; display: inline-flex; width: 60px; }
.odds-chip .rps-hand-art, .odds-chip .rps-hand-text { width: 100%; }
.odds-chip b {
  position: absolute; left: 50%; bottom: -6px; transform: translateX(-50%);
  font-size: 20px; font-weight: 900; color: rgba(255, 232, 176, 0.99);
  text-shadow: 0 1px 6px rgba(0, 0, 0, 0.95), 0 0 10px rgba(0, 0, 0, 0.8);
  white-space: nowrap;
}
.odds-chip.is-blocked .rps-hand-art { filter: grayscale(0.75) brightness(0.55); }
.odds-chip.is-blocked b { font-size: 25px; color: rgba(236, 92, 68, 0.97); text-shadow: 0 1px 6px rgba(0, 0, 0, 0.95), 0 0 10px rgba(210, 54, 32, 0.6); }
.mini-rps-streak { font-size: 17px; color: rgba(210, 198, 178, 0.74); }
.mini-rps-streak b { color: rgba(244, 206, 112, 0.96); font-size: 23px; font-weight: 900; }
/* 백작의 확률 선언 — 확률 칩 아래 중앙. 대사 + 표기 % (계산 가능한 정보라 은은히 발광) */
.mini-rps-decl {
  position: relative; left: 50%; transform: translateX(-50%); width: max-content; max-width: min(86vw, 620px);
  margin-top: 14px; text-align: center; font-size: 20px; letter-spacing: 0.02em;
  color: rgba(222, 208, 252, 0.98);
  text-shadow: 0 1px 6px rgba(0, 0, 0, 0.9), 0 0 16px rgba(150, 130, 224, 0.45);
}

/* 판정 토스트 레인 — 남는 세로 여백(중간 하단)을 전부 차지하고, 토스트를 바닥(던지기 위)에
   쌓는다. 체인 로그처럼 오래 머물다 스르륵 사라진다. */
.mini-rps-toasts {
  flex: 1 1 auto; min-height: 0;
  display: flex; flex-direction: column; justify-content: flex-end; align-items: center; gap: 8px;
  pointer-events: none; z-index: 5;
}
.rps-toast {
  display: flex; align-items: baseline; gap: 14px; max-width: 72%;
  animation: rps-toast-in 0.36s cubic-bezier(0.2, 0.8, 0.2, 1) both;
}
.rps-toast-head { font-size: 30px; font-weight: 900; letter-spacing: 0.06em; line-height: 1; }
.rps-toast.is-win .rps-toast-head { color: rgba(158, 232, 166, 1); text-shadow: 0 2px 10px rgba(0, 0, 0, 0.92), 0 0 24px rgba(90, 190, 110, 0.55); }
.rps-toast.is-lose .rps-toast-head { color: rgba(238, 104, 84, 0.98); text-shadow: 0 2px 10px rgba(0, 0, 0, 0.92), 0 0 24px rgba(210, 54, 32, 0.5); }
.rps-toast.is-tie .rps-toast-head { color: rgba(218, 208, 190, 0.92); text-shadow: 0 2px 10px rgba(0, 0, 0, 0.92); }
.rps-toast-detail { font-size: 17px; font-weight: 800; color: rgba(242, 230, 202, 0.96); text-shadow: 0 1px 7px rgba(0, 0, 0, 0.92); }
.rps-toast.is-out { animation: rps-toast-out 0.76s ease forwards; }

/* 아이템 — 레일 좌측 세로 열(살짝 부채꼴). 테두리 없이 폰트 위주, hover 시 발광+확대 */
.mini-rps-items {
  position: absolute; left: 2%; top: 38%; transform: translateY(-50%);
  display: flex; flex-direction: column; align-items: flex-start; gap: 20px; z-index: 4;
}
.rps-item-slot { position: relative; transform-origin: left center; }
/* 차단 픽커 — 차단 버튼 옆에 떠서 봉쇄할 손을 직접 고른다 */
.rps-block-picker {
  position: absolute; left: calc(100% + 12px); top: 50%; transform: translateY(-50%);
  display: flex; gap: 10px; padding: 6px 9px; border-radius: 12px;
  background: rgba(20, 12, 24, 0.88); box-shadow: 0 8px 22px rgba(0, 0, 0, 0.6);
  z-index: 4;
}
.rps-block-picker[hidden] { display: none; }
/* 픽커 옵션도 손 엠블럼 이미지 타일 — 던지기 타일과 같은 양식, hover 시 보랏빛 발광·확대 */
.rps-block-opt {
  width: 58px; padding: 1px; border-radius: 10px; cursor: pointer; border: none;
  background: none; font-family: inherit;
  transition: transform 0.14s, filter 0.16s, opacity 0.16s;
}
.rps-block-opt .rps-hand-art, .rps-block-opt .rps-hand-text { width: 100%; }
.rps-block-opt:hover { transform: translateY(-2px) scale(1.12); filter: drop-shadow(0 0 10px rgba(190, 150, 240, 0.8)); }
.rps-block-opt.is-disabled { opacity: 0.3; pointer-events: none; }
.mini-rps-item {
  display: flex; flex-direction: column; align-items: flex-start; gap: 3px;
  padding: 6px 12px; cursor: pointer; border: none; background: none; font-family: inherit;
  color: rgba(238, 226, 250, 0.95); text-align: left;
  text-shadow: 0 1px 6px rgba(0, 0, 0, 0.9), 0 1px 3px rgba(0, 0, 0, 0.95);
  transition: transform 0.14s, color 0.18s, text-shadow 0.18s, opacity 0.18s;
}
.mini-rps-item .it-label { font-size: 21px; font-weight: 900; letter-spacing: 0.04em; }
.mini-rps-item .it-cost { font-size: 14px; color: rgba(206, 172, 244, 0.84); }
.mini-rps-item:hover { transform: translateX(3px) scale(1.06); color: rgba(255, 246, 255, 1); text-shadow: 0 1px 6px rgba(0, 0, 0, 0.9), 0 0 16px rgba(190, 150, 240, 0.75); }
.mini-rps-item.is-disabled { opacity: 0.26; pointer-events: none; }
.mini-rps-item.is-used { opacity: 0.4; pointer-events: none; }
/* 이번 판 장전된 아이템(두배/보호)은 흐려지지 않고 보랏빛으로 타오른다 */
.mini-rps-item.is-armed { opacity: 1; pointer-events: none; color: rgba(236, 224, 255, 1); }
.mini-rps-item.is-armed .it-label { text-shadow: 0 1px 6px rgba(0, 0, 0, 0.9), 0 0 20px rgba(190, 150, 240, 0.95); }
.mini-rps-item.is-armed .it-cost { visibility: hidden; }
.mini-rps-item.is-armed::after { content: '이번 판 적용'; font-size: 12.5px; font-weight: 800; letter-spacing: 0.05em; color: rgba(216, 190, 255, 0.96); text-shadow: 0 0 12px rgba(150, 130, 224, 0.7); margin-top: -17px; }
.mini-rps-item.is-pulse { animation: mini-offer-pulse 0.4s cubic-bezier(0.2, 0.8, 0.2, 1); }

/* 판돈 — 레일 우측 세로 열. 별 개수 + 수치, 폰트 위주 */
.mini-rps-stakes {
  position: absolute; right: 2%; top: 38%; transform: translateY(-50%);
  display: flex; flex-direction: column; align-items: flex-end; gap: 16px; z-index: 4;
}
.mini-rps-stake { display: flex; flex-direction: column; align-items: flex-end; gap: 3px; padding: 5px 12px; cursor: pointer; border: none; background: none; font-family: inherit; transition: transform 0.14s, opacity 0.18s; }
.mini-rps-stake .stake-stars { display: inline-flex; gap: 4px; }
.mini-rps-stake .stake-star { display: inline-flex; width: 20px; height: 20px; color: rgba(160, 142, 96, 0.5); transition: color 0.18s, filter 0.18s; }
.mini-rps-stake .stake-star svg { width: 100%; height: 100%; }
.mini-rps-stake .stake-amt { font-size: 18px; font-weight: 800; color: rgba(230, 216, 180, 0.78); text-shadow: 0 1px 5px rgba(0, 0, 0, 0.85); }
.mini-rps-stake:hover { transform: translateX(-3px); }
.mini-rps-stake.is-selected .stake-star { color: rgba(255, 224, 150, 0.99); filter: drop-shadow(0 0 6px rgba(244, 206, 112, 0.85)); }
.mini-rps-stake.is-selected .stake-amt { color: rgba(255, 236, 180, 0.99); font-size: 20px; }
.mini-rps-stake.is-disabled { opacity: 0.3; pointer-events: none; }

/* 물러나기 — 우상단 연승 아래 고정. 우하단은 가위 타일과 겹쳐서 위로 뺀다(중앙 세로 예산 절약) */
.mini-rps .mini-rps-done { position: absolute; right: 2%; top: 11%; margin: 0; z-index: 6; }

/* 던지기 — 손 이미지 타일. 넓은 간격으로 하단을 가로지른다. hover 시 발광 + 확대 + 흔들림 */
.mini-rps-throws { display: flex; justify-content: center; gap: 52px; }
.mini-rps-throw { position: relative; display: flex; flex-direction: column; align-items: center; gap: 3px; width: clamp(96px, 11vw, 136px); padding: 0; cursor: pointer; border: none; background: none; font-family: inherit; transition: transform 0.16s, opacity 0.18s; }
/* hover 발광은 drop-shadow 대신 뒤쪽 radial 글로우 — 마스크 알파를 따라 그림자가 지며
   생기던 원형 경계를 없앤다(::before는 자식보다 먼저 칠해져 자연히 이미지 뒤에 깔림). */
.mini-rps-throw::before {
  content: ''; position: absolute; left: -8%; right: -8%; top: -10%; height: 110%; border-radius: 50%;
  background: radial-gradient(circle, rgba(255, 214, 130, 0.28) 0%, rgba(255, 200, 110, 0.11) 46%, transparent 72%);
  opacity: 0; transition: opacity 0.18s; pointer-events: none;
}
.mini-rps-throw .rps-hand-art { transition: filter 0.18s; }
.mini-rps-throw .rps-throw-name { font-size: 19px; font-weight: 900; letter-spacing: 0.06em; color: rgba(255, 238, 196, 0.92); text-shadow: 0 1px 6px rgba(0, 0, 0, 0.9); }
.mini-rps-throw:hover { transform: translateY(-4px) scale(1.09); animation: rps-throw-wobble 0.5s ease-in-out; }
.mini-rps-throw:hover::before { opacity: 1; }
.mini-rps-throw:hover .rps-hand-art { filter: brightness(1.16) saturate(1.05); }
.mini-rps-throw:hover .rps-throw-name { color: rgba(255, 248, 220, 1); text-shadow: 0 1px 6px rgba(0, 0, 0, 0.9), 0 0 14px rgba(255, 210, 120, 0.7); }
.mini-rps-throw.is-disabled { opacity: 0.34; pointer-events: none; }

@keyframes mini-offer-pulse { 0% { transform: scale(1); } 42% { transform: scale(1.04); filter: brightness(1.2); } 100% { transform: scale(1); } }
@keyframes mini-result-pop { 0% { transform: scale(0.9); opacity: 0.4; } 60% { transform: scale(1.08); } 100% { transform: scale(1); opacity: 1; } }
@keyframes mini-panel-out { 0% { opacity: 1; transform: scale(1); } 100% { opacity: 0; transform: scale(0.94) translateY(8px); filter: blur(3px); } }
@keyframes rps-slot-impact { 0% { transform: translateX(-50%) scale(1.2); filter: brightness(1.45); } 55% { transform: translateX(-50%) scale(0.97); } 100% { transform: translateX(-50%) scale(1); filter: brightness(1); } }
@keyframes rps-throw-wobble { 0%, 100% { rotate: 0deg; } 25% { rotate: -5deg; } 75% { rotate: 5deg; } }
/* 토스트 등장(팡 떠오름)과 퇴장(스르륵 — 위로 스미며 흐려짐) */
@keyframes rps-toast-in { 0% { opacity: 0; transform: translateY(14px) scale(0.92); } 60% { transform: translateY(-2px) scale(1.04); } 100% { opacity: 1; transform: none; } }
@keyframes rps-toast-out { 0% { opacity: 1; } 100% { opacity: 0; transform: translateY(10px); filter: blur(3px); } }

/* 낮은 화면 보정 — 상단 슬롯 열과 던지기 타일을 줄여 판정 토스트 레인(중간 하단 여백)을
   확보한다. 높은 화면에서는 큰 사이즈가 그대로 살아난다. */
@media (max-height: 880px) {
  .mini-rps-cardslot { width: clamp(92px, 13%, 150px); }
  .mini-rps-odds { margin-top: 8px; gap: 40px; }
  .odds-chip { width: 52px; }
  .odds-chip b { font-size: 17px; bottom: -5px; }
  .odds-chip.is-blocked b { font-size: 21px; }
  .mini-rps-decl { margin-top: 10px; font-size: 17px; }
  .mini-rps-throw { width: clamp(88px, 10vw, 118px); }
  .mini-rps-throw .rps-throw-name { font-size: 17px; }
  .rps-toast-head { font-size: 26px; }
  .rps-toast-detail { font-size: 15px; }
}

/* 모바일 보정 — 좌우 열/큰 타일을 줄여 좁은 레일에서도 겹치지 않게 한다 */
@media (max-width: 700px) {
  .mini-rps-cardslot { width: clamp(84px, 16%, 118px); }
  .mini-rps-odds { gap: 24px; }
  .odds-chip { width: 44px; }
  .odds-chip b { font-size: 15px; }
  .mini-rps-decl { font-size: 14px; max-width: 88vw; }
  .mini-rps-items { gap: 8px; }
  .mini-rps-item .it-label { font-size: 15px; }
  .mini-rps-item .it-cost { font-size: 11px; }
  .rps-block-opt { width: 42px; }
  .mini-rps-stakes { gap: 8px; }
  .mini-rps-stake .stake-star { width: 14px; height: 14px; }
  .mini-rps-stake .stake-amt { font-size: 13px; }
  .mini-rps-throws { gap: 20px; }
  .mini-rps-throw { width: clamp(66px, 19vw, 92px); }
  .mini-rps-throw .rps-throw-name { font-size: 14px; }
  .rps-toast-head { font-size: 21px; }
  .rps-toast-detail { font-size: 12.5px; }
  .mini-rps-try { width: 14px; height: 14px; }
  .mini-rps-streak { font-size: 13px; }
  .mini-rps-streak b { font-size: 16px; }
}
`
    document.head.appendChild(style)
  }
}
