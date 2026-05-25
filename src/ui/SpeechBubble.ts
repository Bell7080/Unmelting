/**
 * SpeechBubble - 범용 말풍선 시스템.
 *
 * 사용 예시:
 *   // 플레이어 대사
 *   const playerBubble = new SpeechBubble({ anchor: '.player-card', offsetX: 40 })
 *   playerBubble.show('역경 아래, 작은 불빛을 밝혀야만 해.', 800)
 *
 *   // 보스 대사 (보스 타일 아래에 꼬리가 위쪽으로)
 *   const bossBubble = new SpeechBubble({ anchor: '.boss-tile', theme: 'boss', tail: 'top' })
 *   bossBubble.show('감히 나에게 맞서려 하느냐.')
 *
 *   // 튜토리얼 (꼬리 없음, 특정 UI 앵커)
 *   const tutorialBubble = new SpeechBubble({ anchor: '.turn-brand', tail: 'none', theme: 'neutral' })
 *   tutorialBubble.show('카드를 클릭해 행동을 결정하세요.')
 */

export interface SpeechBubbleConfig {
  /** 앵커 CSS 셀렉터. 기본값: '.player-card' */
  anchor?: string
  /** 앵커 중심 기준 수평 오프셋(px). 양수 = 우측. 기본값: 0 */
  offsetX?: number
  /** 앵커 기준 수직 오프셋(px). 기본값: 0 */
  offsetY?: number
  /** 꼬리 방향. 'bottom'=버블 아래(앵커 위에 배치), 'top'=버블 위(앵커 아래에 배치), 'none'=꼬리 없음. 기본값: 'bottom' */
  tail?: 'bottom' | 'top' | 'none'
  /** 색상 테마. 기본값: 'player' */
  theme?: 'player' | 'boss' | 'neutral'
  /** 타이핑 완료 후 자동 소멸 딜레이(ms). 0이면 수동 dismiss만. 기본값: 4200 */
  autoDismissMs?: number
}

const STYLE_ID = 'speech-bubble-styles'

// 인스턴스 수에 관계없이 스타일은 한 번만 주입
let styleInjected = false

function injectStyles(): void {
  if (styleInjected || document.getElementById(STYLE_ID)) {
    styleInjected = true
    return
  }
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS
  document.head.appendChild(style)
  styleInjected = true
}

const CSS = `
/* ── 래퍼 ─────────────────────────────────────────── */
.sb-host {
  position: fixed;
  pointer-events: none;
  z-index: 9999;
}

/* ── 버블 공통 ───────────────────────────────────────*/
.sb-bubble {
  position: relative;
  background: rgba(14, 8, 24, 0.96);
  border: 1.5px solid rgba(255, 215, 120, 0.84);
  border-radius: 7px 12px 9px 13px / 12px 8px 13px 9px;
  padding: 14px 26px;
  box-shadow:
    0 8px 30px rgba(0, 0, 0, 0.84),
    0 2px 8px  rgba(0, 0, 0, 0.55),
    0 0 24px   rgba(255, 200, 80, 0.13),
    inset 0 1px 0 rgba(255, 215, 120, 0.09);
  font-size: 17px;
  font-weight: 600;
  line-height: 1.6;
  color: rgba(255, 248, 224, 0.97);
  white-space: nowrap;
  transform-origin: center bottom;
  opacity: 0;
}

/* ── 테마: 보스 ──────────────────────────────────────*/
.sb-bubble--boss {
  border-color: rgba(210, 65, 65, 0.88);
  box-shadow:
    0 8px 30px rgba(0, 0, 0, 0.84),
    0 2px 8px  rgba(0, 0, 0, 0.55),
    0 0 26px   rgba(220, 60, 60, 0.18),
    inset 0 1px 0 rgba(210, 65, 65, 0.10);
  color: rgba(255, 235, 230, 0.97);
}
/* ── 테마: 중립(튜토리얼 등) ─────────────────────────*/
.sb-bubble--neutral {
  border-color: rgba(210, 205, 230, 0.72);
  box-shadow:
    0 8px 30px rgba(0, 0, 0, 0.84),
    0 2px 8px  rgba(0, 0, 0, 0.55),
    0 0 18px   rgba(200, 200, 255, 0.09),
    inset 0 1px 0 rgba(210, 205, 230, 0.08);
  color: rgba(240, 240, 255, 0.96);
}

/* ── 꼬리: bottom (버블이 앵커 위) ──────────────────*/
.sb-bubble.tail-bottom::before {
  content: '';
  position: absolute;
  bottom: -9px; left: 50%;
  transform: translateX(-50%);
  width: 0; height: 0;
  border-left: 8px solid transparent;
  border-right: 8px solid transparent;
  border-top: 9px solid rgba(255, 215, 120, 0.84);
}
.sb-bubble.tail-bottom::after {
  content: '';
  position: absolute;
  bottom: -6px; left: 50%;
  transform: translateX(-50%);
  width: 0; height: 0;
  border-left: 6px solid transparent;
  border-right: 6px solid transparent;
  border-top: 7px solid rgba(14, 8, 24, 0.96);
}
.sb-bubble--boss.tail-bottom::before { border-top-color: rgba(210, 65, 65, 0.88); }
.sb-bubble--boss.tail-bottom::after  { border-top-color: rgba(14, 8, 24, 0.96); }
.sb-bubble--neutral.tail-bottom::before { border-top-color: rgba(210, 205, 230, 0.72); }
.sb-bubble--neutral.tail-bottom::after  { border-top-color: rgba(14, 8, 24, 0.96); }

/* ── 꼬리: top (버블이 앵커 아래) ───────────────────*/
.sb-bubble.tail-top {
  transform-origin: center top;
}
.sb-bubble.tail-top::before {
  content: '';
  position: absolute;
  top: -9px; left: 50%;
  transform: translateX(-50%);
  width: 0; height: 0;
  border-left: 8px solid transparent;
  border-right: 8px solid transparent;
  border-bottom: 9px solid rgba(255, 215, 120, 0.84);
}
.sb-bubble.tail-top::after {
  content: '';
  position: absolute;
  top: -6px; left: 50%;
  transform: translateX(-50%);
  width: 0; height: 0;
  border-left: 6px solid transparent;
  border-right: 6px solid transparent;
  border-bottom: 7px solid rgba(14, 8, 24, 0.96);
}
.sb-bubble--boss.tail-top::before    { border-bottom-color: rgba(210, 65, 65, 0.88); }
.sb-bubble--boss.tail-top::after     { border-bottom-color: rgba(14, 8, 24, 0.96); }
.sb-bubble--neutral.tail-top::before { border-bottom-color: rgba(210, 205, 230, 0.72); }
.sb-bubble--neutral.tail-top::after  { border-bottom-color: rgba(14, 8, 24, 0.96); }

/* ── 등장/소멸/숨쉬기 ────────────────────────────────*/
.sb-bubble.is-entering {
  animation: sb-enter 300ms cubic-bezier(0.22, 0.92, 0.36, 1) forwards;
}
.sb-bubble.is-visible {
  opacity: 1;
  animation: sb-breathe 2.4s ease-in-out infinite;
}
.sb-bubble.is-exiting {
  animation: sb-exit 240ms ease-in forwards;
}

/* ── 텍스트 컨테이너 ─────────────────────────────────*/
.sb-text {
  display: inline;
  white-space: pre-wrap;
}

/* ── 글자 단위 bounce pop-in + 지속 떨림 ────────────*/
.sb-char {
  display: inline-block;
  vertical-align: baseline;
  line-height: 1;
  /* pop-in 0.32s 후 떨림 무한 전환 */
  animation:
    sb-char-pop 0.32s cubic-bezier(0.22, 0.92, 0.36, 1) forwards,
    sb-tremble  2.4s ease-in-out 0.32s infinite;
}

/* ── keyframes ───────────────────────────────────────*/
@keyframes sb-enter {
  from { opacity: 0; transform: scale(0.82); }
  to   { opacity: 1; transform: scale(1.0);  }
}
@keyframes sb-exit {
  from { opacity: 1; transform: scale(1.0);  }
  to   { opacity: 0; transform: scale(0.82); }
}
@keyframes sb-breathe {
  0%   { transform: scale(1.0);   }
  35%  { transform: scale(1.022); }
  65%  { transform: scale(0.993); }
  100% { transform: scale(1.0);   }
}
@keyframes sb-char-pop {
  0%   { transform: translateY(8px)   scale(0.5);  opacity: 0; }
  55%  { transform: translateY(-4px)  scale(1.18); opacity: 1; }
  80%  { transform: translateY(1.5px) scale(0.97); }
  100% { transform: translateY(0px)   scale(1.0);  }
}
@keyframes sb-tremble {
  0%   { transform: translate(0px,    0px)    rotate(0deg);    }
  20%  { transform: translate(-0.7px,  0.5px) rotate(-0.4deg); }
  40%  { transform: translate( 0.9px, -0.6px) rotate( 0.5deg); }
  60%  { transform: translate(-0.6px,  0.7px) rotate( 0.35deg);}
  80%  { transform: translate( 0.8px, -0.5px) rotate(-0.4deg); }
  100% { transform: translate(0px,    0px)    rotate(0deg);    }
}
`

export class SpeechBubble {
  private readonly config: Required<SpeechBubbleConfig>
  private readonly host: HTMLDivElement
  private readonly bubble: HTMLDivElement
  private readonly textEl: HTMLSpanElement
  private state: 'hidden' | 'entering' | 'visible' | 'exiting' = 'hidden'
  private typewriterTimer = 0
  private autoDismissTimer = 0
  private enterListener: ((e: Event) => void) | null = null
  private exitListener: ((e: Event) => void) | null = null

  constructor(config: SpeechBubbleConfig = {}) {
    this.config = {
      anchor:        config.anchor        ?? '.player-card',
      offsetX:       config.offsetX       ?? 0,
      offsetY:       config.offsetY       ?? 0,
      tail:          config.tail          ?? 'bottom',
      theme:         config.theme         ?? 'player',
      autoDismissMs: config.autoDismissMs ?? 4200,
    }

    injectStyles()

    this.host = document.createElement('div')
    this.host.className = 'sb-host'
    this.host.setAttribute('aria-hidden', 'true')

    this.bubble = document.createElement('div')
    const tailClass = this.config.tail !== 'none' ? `tail-${this.config.tail}` : ''
    const themeClass = this.config.theme !== 'player' ? `sb-bubble--${this.config.theme}` : ''
    this.bubble.className = ['sb-bubble', tailClass, themeClass].filter(Boolean).join(' ')

    this.textEl = document.createElement('span')
    this.textEl.className = 'sb-text'

    this.bubble.appendChild(this.textEl)
    this.host.appendChild(this.bubble)
    document.body.appendChild(this.host)
  }

  show(text: string, delayMs = 0): void {
    if (delayMs > 0) {
      setTimeout(() => this._showNow(text), delayMs)
    } else {
      this._showNow(text)
    }
  }

  dismiss(): void {
    if (this.state === 'hidden' || this.state === 'exiting') return

    clearTimeout(this.typewriterTimer)
    clearTimeout(this.autoDismissTimer)
    this._removeListeners()

    this.state = 'exiting'
    this.bubble.classList.remove('is-entering', 'is-visible')
    this.bubble.classList.add('is-exiting')

    this.exitListener = (e: Event) => {
      if ((e as AnimationEvent).animationName !== 'sb-exit') return
      this._removeListeners()
      this.bubble.classList.remove('is-exiting')
      this.textEl.innerHTML = ''
      this.state = 'hidden'
    }
    this.bubble.addEventListener('animationend', this.exitListener)
  }

  /** 완전히 제거. 다시 사용하지 않을 인스턴스에 호출. */
  destroy(): void {
    this.dismiss()
    this.host.remove()
  }

  private _showNow(text: string): void {
    clearTimeout(this.typewriterTimer)
    clearTimeout(this.autoDismissTimer)
    this._removeListeners()

    this.bubble.classList.remove('is-entering', 'is-visible', 'is-exiting')
    this.textEl.innerHTML = ''

    this._updatePosition()

    this.state = 'entering'
    this.bubble.classList.add('is-entering')

    this.enterListener = (e: Event) => {
      if ((e as AnimationEvent).animationName !== 'sb-enter') return
      this._removeListeners()
      this.bubble.classList.remove('is-entering')
      this.bubble.classList.add('is-visible')
      this.state = 'visible'
      this._typewrite(text)
    }
    this.bubble.addEventListener('animationend', this.enterListener)
  }

  private _typewrite(text: string): void {
    const chars = [...text]
    let i = 0
    const next = () => {
      if (this.state !== 'visible') return
      if (i >= chars.length) {
        if (this.config.autoDismissMs > 0) {
          this.autoDismissTimer = window.setTimeout(() => this.dismiss(), this.config.autoDismissMs)
        }
        return
      }
      const span = document.createElement('span')
      span.className = 'sb-char'
      // 70ms 간격 등장으로 글자별 떨림 위상이 자연 분산됨 — JS delay 불필요
      span.textContent = chars[i++]
      this.textEl.appendChild(span)
      this.typewriterTimer = window.setTimeout(next, 70)
    }
    next()
  }

  private _updatePosition(): void {
    const anchor = document.querySelector<HTMLElement>(this.config.anchor)
    if (!anchor) return
    const rect = anchor.getBoundingClientRect()
    const cx = rect.left + rect.width / 2 + this.config.offsetX

    if (this.config.tail === 'top') {
      // 버블을 앵커 아래에 배치, 꼬리가 위를 향함
      this.host.style.left = `${cx}px`
      this.host.style.top  = `${rect.bottom + this.config.offsetY}px`
      this.host.style.transform = `translate(-50%, 13px)`
    } else {
      // 버블을 앵커 위에 배치, 꼬리가 아래를 향함 (bottom / none 공통)
      this.host.style.left = `${cx}px`
      this.host.style.top  = `${rect.top + this.config.offsetY}px`
      this.host.style.transform = `translate(-50%, calc(-100% - 13px))`
    }
  }

  private _removeListeners(): void {
    if (this.enterListener) {
      this.bubble.removeEventListener('animationend', this.enterListener)
      this.enterListener = null
    }
    if (this.exitListener) {
      this.bubble.removeEventListener('animationend', this.exitListener)
      this.exitListener = null
    }
  }
}
