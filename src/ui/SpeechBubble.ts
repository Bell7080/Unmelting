/**
 * SpeechBubble - 캐릭터 대사용 말풍선.
 * fixed 포지션, pointer-events: none. .player-card 기준으로 우측 오프셋 배치.
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
  border-radius: 6px 10px 8px 11px / 10px 7px 11px 8px;
  padding: 12px 22px;
  box-shadow:
    0 8px 28px rgba(0, 0, 0, 0.82),
    0 2px 8px  rgba(0, 0, 0, 0.55),
    0 0 22px   rgba(255, 200, 80, 0.12),
    inset 0 1px 0 rgba(255, 215, 120, 0.09);
  font-size: 15px;
  font-weight: 600;
  line-height: 1.6;
  color: rgba(255, 248, 224, 0.97);
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
/* 꼬리 내부 (어두운 배경) */
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
  /* 숨쉬기: 흡기(+2.2%) → 호기(-0.6%) → 안정 */
  animation: sb-breathe 2.4s ease-in-out infinite;
}
.sb-bubble.is-exiting {
  animation: sb-exit 240ms ease-in forwards;
}
.sb-text {
  display: inline;
  white-space: pre-wrap;
}
/* 타자기로 나올 때 bounce 팝인 후 지속 떨림 */
.sb-char {
  display: inline-block;
  vertical-align: baseline;
  line-height: 1;
  /* 1) pop-in 0.32s (한 번만), 2) tremble 0.32s 이후 무한 */
  animation:
    sb-char-pop  0.32s cubic-bezier(0.22, 0.92, 0.36, 1) forwards,
    sb-tremble   2.4s  ease-in-out 0.32s infinite;
}
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
/* 글자 팝인: 아래서 튀어올라 살짝 오버슈팅 후 안착 */
@keyframes sb-char-pop {
  0%   { transform: translateY(8px)  scale(0.5);  opacity: 0; }
  55%  { transform: translateY(-4px) scale(1.2);  opacity: 1; }
  80%  { transform: translateY(1.5px) scale(0.96); }
  100% { transform: translateY(0px)  scale(1.0);  }
}
/* 지속 떨림: ±1.5px / ±0.8deg - 눈에 띄되 거슬리지 않는 강도 */
@keyframes sb-tremble {
  0%   { transform: translate(0px,    0px)    rotate(0deg);    }
  20%  { transform: translate(-1.3px,  0.8px) rotate(-0.7deg); }
  40%  { transform: translate( 1.5px, -1.0px) rotate( 0.8deg); }
  60%  { transform: translate(-1.0px,  1.2px) rotate( 0.55deg);}
  80%  { transform: translate( 1.2px, -0.8px) rotate(-0.6deg); }
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
        // 마지막 글자 후 4.2s 뒤 자동 소멸
        this.autoDismissTimer = window.setTimeout(() => this.dismiss(), 4200)
        return
      }
      const span = document.createElement('span')
      span.className = 'sb-char'
      // 각 글자가 70ms 간격으로 등장하므로 자연스럽게 떨림 위상이 분산됨
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
    // 플레이어 카드 중심에서 우측으로 40px 오프셋
    const cx = rect.left + rect.width / 2 + 40
    this.host.style.left = `${cx}px`
    this.host.style.top = `${rect.top}px`
    // 꼬리 높이(9px) + 여백(4px) 만큼 위로 올림
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
