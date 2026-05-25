/**
 * SpeechBubble - 캐릭터 대사용 말풍선.
 * fixed 포지션, pointer-events: none. .player-card 위에 자동 배치된다.
 */

const STYLE_ID = 'speech-bubble-styles'

const CSS = `
.sb-host {
  position: fixed;
  pointer-events: none;
  z-index: 9999;
}
.sb-bubble {
  position: relative;
  background: rgba(14, 8, 24, 0.95);
  border: 1.5px solid rgba(255, 215, 120, 0.82);
  /* 코너마다 반지름이 조금씩 달라 손으로 자른 듯한 질감 */
  border-radius: 6px 10px 8px 11px / 10px 7px 11px 8px;
  padding: 10px 15px;
  box-shadow:
    0 6px 24px rgba(0, 0, 0, 0.78),
    0 2px 8px  rgba(0, 0, 0, 0.55),
    0 0 18px   rgba(255, 200, 80, 0.09),
    inset 0 1px 0 rgba(255, 215, 120, 0.07);
  font-size: 14px;
  line-height: 1.55;
  color: rgba(255, 248, 224, 0.95);
  white-space: nowrap;
  transform-origin: center bottom;
  opacity: 0;
}
/* 꼬리 외곽 (금빛 테두리) */
.sb-bubble::before {
  content: '';
  position: absolute;
  bottom: -9px;
  left: 50%;
  transform: translateX(-50%);
  width: 0; height: 0;
  border-left: 8px solid transparent;
  border-right: 8px solid transparent;
  border-top: 9px solid rgba(255, 215, 120, 0.82);
}
/* 꼬리 내부 (어두운 배경색) */
.sb-bubble::after {
  content: '';
  position: absolute;
  bottom: -6px;
  left: 50%;
  transform: translateX(-50%);
  width: 0; height: 0;
  border-left: 6px solid transparent;
  border-right: 6px solid transparent;
  border-top: 7px solid rgba(14, 8, 24, 0.95);
}
.sb-bubble.is-entering {
  animation: sb-enter 300ms cubic-bezier(0.22, 0.92, 0.36, 1) forwards;
}
.sb-bubble.is-visible {
  opacity: 1;
  animation: sb-breathe 2.8s ease-in-out infinite;
}
.sb-bubble.is-exiting {
  animation: sb-exit 240ms ease-in forwards;
}
/* 각 글자에 개별 지연을 줘서 미세한 떨림 */
.sb-char {
  display: inline;
  animation: sb-tremble 3.2s ease-in-out infinite;
}
/* white-space: pre-wrap 으로 공백 span이 접히지 않게 */
.sb-text {
  display: inline;
  white-space: pre-wrap;
}
@keyframes sb-enter {
  from { opacity: 0; transform: scale(0.84); }
  to   { opacity: 1; transform: scale(1.0);  }
}
@keyframes sb-exit {
  from { opacity: 1; transform: scale(1.0);  }
  to   { opacity: 0; transform: scale(0.84); }
}
@keyframes sb-breathe {
  0%,100% { transform: scale(1.0);   }
  50%     { transform: scale(1.007); }
}
@keyframes sb-tremble {
  0%   { transform: translate(0px,    0px)    rotate(0deg);    }
  15%  { transform: translate(-0.4px,  0.3px) rotate(-0.25deg); }
  35%  { transform: translate( 0.5px, -0.4px) rotate( 0.3deg);  }
  55%  { transform: translate(-0.3px,  0.45px) rotate( 0.15deg); }
  75%  { transform: translate( 0.45px,-0.25px) rotate(-0.2deg);  }
  100% { transform: translate(0px,    0px)    rotate(0deg);    }
}
`

export class SpeechBubble {
  private readonly host: HTMLDivElement
  private readonly bubble: HTMLDivElement
  private readonly textEl: HTMLSpanElement
  private state: 'hidden' | 'entering' | 'visible' | 'exiting' = 'hidden'
  private typewriterTimer = 0
  private autoDismissTimer = 0
  private enterListener: ((e: Event) => void) | null = null
  private exitListener: ((e: Event) => void) | null = null

  constructor() {
    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement('style')
      style.id = STYLE_ID
      style.textContent = CSS
      document.head.appendChild(style)
    }

    this.host = document.createElement('div')
    this.host.className = 'sb-host'
    this.host.setAttribute('aria-hidden', 'true')

    this.bubble = document.createElement('div')
    this.bubble.className = 'sb-bubble'

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
      const ae = e as AnimationEvent
      if (ae.animationName !== 'sb-exit') return
      this._removeListeners()
      this.bubble.classList.remove('is-exiting')
      this.textEl.innerHTML = ''
      this.state = 'hidden'
    }
    this.bubble.addEventListener('animationend', this.exitListener)
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
      const ae = e as AnimationEvent
      if (ae.animationName !== 'sb-enter') return
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
        // 마지막 글자 이후 4.2초 뒤 자동 소멸
        this.autoDismissTimer = window.setTimeout(() => this.dismiss(), 4200)
        return
      }
      const span = document.createElement('span')
      span.className = 'sb-char'
      // 글자마다 다른 위상으로 떨림이 자연스럽게 분산됨
      span.style.animationDelay = `${((i * 113) % 3200) / 1000}s`
      span.textContent = chars[i++]
      this.textEl.appendChild(span)
      this.typewriterTimer = window.setTimeout(next, 70)
    }
    next()
  }

  private _updatePosition(): void {
    const card = document.querySelector<HTMLElement>('.player-card')
    if (!card) return
    const rect = card.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    // 꼬리 높이(9px) + 여백(4px) 확보
    this.host.style.left = `${cx}px`
    this.host.style.top = `${rect.top}px`
    this.host.style.transform = `translate(-50%, calc(-100% - 13px))`
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
