/**
 * SpeechBubble - 범용 말풍선 시스템.
 *
 * 사용 예시:
 *   // 플레이어 대사
 *   const playerBubble = new SpeechBubble({ anchor: '.player-card', offsetX: 120, tail: 'bottom-left' })
 *   playerBubble.show('역경 아래, 작은 불빛을 밝혀야만 해.', 800)
 *
 *   // 보스 대사 (보스 타일 아래, 꼬리는 위)
 *   const bossBubble = new SpeechBubble({ anchor: '.boss-tile', theme: 'boss', tail: 'top' })
 *   bossBubble.show('감히 나에게 맞서려 하느냐.')
 *
 *   // 튜토리얼 (꼬리 없음, UI 요소 옆)
 *   const tutorialBubble = new SpeechBubble({ anchor: '.turn-brand', tail: 'none', theme: 'neutral', autoDismissMs: 0 })
 *   tutorialBubble.show('카드를 클릭해 행동을 결정하세요.')
 */

export interface SpeechBubbleConfig {
  /** 앵커 CSS 셀렉터. 기본값: '.player-card' */
  anchor?: string
  /** 앵커 중심 기준 수평 오프셋(px). 양수=우측. 기본값: 0 */
  offsetX?: number
  /** 앵커 기준 수직 오프셋(px). 기본값: 0 */
  offsetY?: number
  /** 폰트 크기(px). 기본값: 20 */
  fontSize?: number
  /**
   * 꼬리 방향.
   *   'bottom'       버블 아래 중앙, 앵커 위에 배치
   *   'bottom-left'  버블 아래 좌측, 앵커 위에 배치
   *   'bottom-right' 버블 아래 우측, 앵커 위에 배치
   *   'top'          버블 위 중앙,   앵커 아래에 배치
   *   'none'         꼬리 없음
   * 기본값: 'bottom'
   */
  tail?: 'bottom' | 'bottom-left' | 'bottom-right' | 'top' | 'none'
  /** 색상 테마. 기본값: 'player' */
  theme?: 'player' | 'boss' | 'neutral'
  /** 타이핑 완료 후 자동 소멸(ms). 0이면 수동 dismiss만. 기본값: 4200 */
  autoDismissMs?: number
}

const STYLE_ID = 'speech-bubble-styles'
let styleInjected = false

function injectStyles(): void {
  if (styleInjected || document.getElementById(STYLE_ID)) { styleInjected = true; return }
  const el = document.createElement('style')
  el.id = STYLE_ID
  el.textContent = CSS
  document.head.appendChild(el)
  styleInjected = true
}

const CSS = `
/* ── 래퍼 ─────────────────────────────────────── */
.sb-host { position: fixed; pointer-events: none; z-index: 9999; }

/* ── 버블 공통 ─────────────────────────────────── */
.sb-bubble {
  /* 테마 컬러 변수 — 테마 클래스에서 덮어씀 */
  --sb-border: rgba(255, 215, 120, 0.86);
  --sb-bg:     rgba(14, 8, 24, 0.96);
  --sb-glow:   rgba(255, 200, 80, 0.14);
  --sb-text:   rgba(255, 248, 224, 0.97);

  position: relative;
  background: var(--sb-bg);
  border: 1.5px solid var(--sb-border);
  border-radius: 7px 13px 10px 14px / 13px 8px 14px 10px;
  padding: 14px 28px;
  box-shadow:
    0 10px 34px rgba(0, 0, 0, 0.86),
    0 3px 10px  rgba(0, 0, 0, 0.58),
    0 0 28px    var(--sb-glow),
    inset 0 1px 0 rgba(255, 255, 255, 0.06);
  font-size: 20px;
  font-weight: 600;
  line-height: 1.58;
  color: var(--sb-text);
  white-space: nowrap;
  transform-origin: center bottom;
  opacity: 0;
}

/* 꼬리 위치에 맞게 팝인 scale 기준점을 고정 */
.sb-bubble.tail-bottom-left  { transform-origin: left bottom; }
.sb-bubble.tail-bottom-right { transform-origin: right bottom; }

/* ── 테마 ───────────────────────────────────────── */
.sb-bubble--boss {
  --sb-border: rgba(212, 62, 62, 0.90);
  --sb-glow:   rgba(220, 60, 60, 0.20);
  --sb-text:   rgba(255, 232, 228, 0.97);
}
.sb-bubble--neutral {
  --sb-border: rgba(208, 203, 232, 0.74);
  --sb-glow:   rgba(200, 200, 255, 0.10);
  --sb-text:   rgba(238, 238, 255, 0.96);
}

/* ── 꼬리 공통 헬퍼 ─────────────────────────────── */
/* ::before = 테두리 삼각, ::after = 어두운 채움 */

/* bottom 계열: 버블 아래 ─── */
.sb-bubble.tail-bottom::before,
.sb-bubble.tail-bottom-left::before,
.sb-bubble.tail-bottom-right::before {
  content: ''; position: absolute;
  bottom: -10px;
  width: 0; height: 0;
  border-left: 9px solid transparent;
  border-right: 9px solid transparent;
  border-top: 10px solid var(--sb-border);
}
.sb-bubble.tail-bottom::after,
.sb-bubble.tail-bottom-left::after,
.sb-bubble.tail-bottom-right::after {
  content: ''; position: absolute;
  bottom: -7px;
  width: 0; height: 0;
  border-left: 7px solid transparent;
  border-right: 7px solid transparent;
  border-top: 7px solid var(--sb-bg);
}
/* 중앙 */
.sb-bubble.tail-bottom::before { left: 50%; transform: translateX(-50%); }
.sb-bubble.tail-bottom::after  { left: 50%; transform: translateX(-50%); }
/* 좌측 (::before center at left+9=~27px from edge) */
.sb-bubble.tail-bottom-left::before { left: 18px; }
.sb-bubble.tail-bottom-left::after  { left: 20px; }
/* 우측 */
.sb-bubble.tail-bottom-right::before { right: 18px; }
.sb-bubble.tail-bottom-right::after  { right: 20px; }

/* top: 버블 위 ─────────────────────────────────── */
.sb-bubble.tail-top { transform-origin: center top; }
.sb-bubble.tail-top::before {
  content: ''; position: absolute;
  top: -10px; left: 50%; transform: translateX(-50%);
  width: 0; height: 0;
  border-left: 9px solid transparent;
  border-right: 9px solid transparent;
  border-bottom: 10px solid var(--sb-border);
}
.sb-bubble.tail-top::after {
  content: ''; position: absolute;
  top: -7px; left: 50%; transform: translateX(-50%);
  width: 0; height: 0;
  border-left: 7px solid transparent;
  border-right: 7px solid transparent;
  border-bottom: 7px solid var(--sb-bg);
}

/* ── 등장 / 소멸 / 숨쉬기 ──────────────────────── */
.sb-bubble.is-entering { animation: sb-enter 300ms cubic-bezier(0.22, 0.92, 0.36, 1) forwards; }
.sb-bubble.is-visible  { opacity: 1; animation: sb-breathe 2.4s ease-in-out infinite; }
.sb-bubble.is-exiting  { animation: sb-exit 240ms ease-in forwards; }

/* ── 텍스트 컨테이너 ─────────────────────────────── */
.sb-text { display: inline; white-space: pre-wrap; }

/* ── 글자 단위: bounce pop-in + 지속 떨림 ─────────*/
.sb-char {
  display: inline-block;
  vertical-align: baseline;
  line-height: 1;
  animation:
    sb-char-pop 0.32s cubic-bezier(0.22, 0.92, 0.36, 1) forwards,
    sb-tremble  2.4s ease-in-out 0.32s infinite;
}

/* ── keyframes ──────────────────────────────────── */
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
  0%   { transform: translateY(9px)   scale(0.45); opacity: 0; }
  55%  { transform: translateY(-5px)  scale(1.2);  opacity: 1; }
  80%  { transform: translateY(2px)   scale(0.97); }
  100% { transform: translateY(0px)   scale(1.0);  }
}
@keyframes sb-tremble {
  0%   { transform: translate(0px,    0px)    rotate(0deg);     }
  20%  { transform: translate(-0.7px,  0.5px) rotate(-0.4deg);  }
  40%  { transform: translate( 0.9px, -0.6px) rotate( 0.5deg);  }
  60%  { transform: translate(-0.5px,  0.7px) rotate( 0.35deg); }
  80%  { transform: translate( 0.8px, -0.5px) rotate(-0.4deg);  }
  100% { transform: translate(0px,    0px)    rotate(0deg);     }
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
      fontSize:      config.fontSize      ?? 20,
    }

    injectStyles()

    this.host = document.createElement('div')
    this.host.className = 'sb-host'
    this.host.setAttribute('aria-hidden', 'true')

    this.bubble = document.createElement('div')
    const tailClass  = this.config.tail !== 'none' ? `tail-${this.config.tail}` : ''
    const themeClass = this.config.theme !== 'player' ? `sb-bubble--${this.config.theme}` : ''
    this.bubble.className = ['sb-bubble', tailClass, themeClass].filter(Boolean).join(' ')
    // 인스턴스별 폰트 크기 — CSS 기본값(20px)과 다를 때만 설정
    if (this.config.fontSize !== 20) {
      this.bubble.style.fontSize = `${this.config.fontSize}px`
    }

    this.textEl = document.createElement('span')
    this.textEl.className = 'sb-text'

    this.bubble.appendChild(this.textEl)
    this.host.appendChild(this.bubble)
    document.body.appendChild(this.host)
  }

  show(text: string, delayMs = 0): void {
    if (delayMs > 0) { setTimeout(() => this._showNow(text), delayMs) }
    else              { this._showNow(text) }
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

  /** DOM에서 완전히 제거. 재사용하지 않을 때 호출. */
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
        if (this.config.autoDismissMs > 0)
          this.autoDismissTimer = window.setTimeout(() => this.dismiss(), this.config.autoDismissMs)
        return
      }
      const span = document.createElement('span')
      span.className = 'sb-char'
      span.textContent = chars[i++]
      this.textEl.appendChild(span)
      this.typewriterTimer = window.setTimeout(next, 70)
    }
    next()
  }

  private _updatePosition(): void {
    const anchor = document.querySelector<HTMLElement>(this.config.anchor)
    if (!anchor) return
    const rect   = anchor.getBoundingClientRect()
    const tail   = this.config.tail
    const isBelow = tail === 'top'

    // 꼬리 방향에 따라 버블의 성장 방향을 결정:
    //   bottom-left  → 버블 좌측 고정, 텍스트가 오른쪽으로만 늘어남
    //   bottom-right → 버블 우측 고정, 텍스트가 왼쪽으로만 늘어남
    //   그 외         → 중앙 기준 양방향 성장
    let left: number
    let tx: string
    if (tail === 'bottom-left') {
      left = rect.left + this.config.offsetX
      tx   = '0%'
    } else if (tail === 'bottom-right') {
      left = rect.right + this.config.offsetX
      tx   = '-100%'
    } else {
      left = rect.left + rect.width / 2 + this.config.offsetX
      tx   = '-50%'
    }

    this.host.style.left = `${left}px`
    if (isBelow) {
      this.host.style.top       = `${rect.bottom + this.config.offsetY}px`
      this.host.style.transform = `translate(${tx}, 13px)`
    } else {
      this.host.style.top       = `${rect.top + this.config.offsetY}px`
      this.host.style.transform = `translate(${tx}, calc(-100% - 13px))`
    }
  }

  private _removeListeners(): void {
    if (this.enterListener) { this.bubble.removeEventListener('animationend', this.enterListener); this.enterListener = null }
    if (this.exitListener)  { this.bubble.removeEventListener('animationend', this.exitListener);  this.exitListener  = null }
  }
}
