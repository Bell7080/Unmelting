/**
 * CursorFX — 커스텀 커서, 마우스 꼬리 잔상, 클릭 리플/블라스트 효과.
 *
 * 커서  : 황금 밀랍 화살표 SVG (핫스팟 상단-좌 (3,3))
 * 꼬리  : 캔버스 기반 황금 잔상 선 — "그림 그리는 듯" 느낌
 * 리플  : 테두리만 있는 원이 점에서 커지며 페이드아웃
 * 블라스트: 검붉은 조각들이 위로 피어오르듯 사라짐
 */

interface TrailPoint {
  x: number
  y: number
  t: number
}

const TRAIL_CAP = 22       // 잔상 최대 포인트 수
const TRAIL_FADE = 260     // ms — 잔상 소멸 시간

// ── 커서 SVG ────────────────────────────────────────────────────────────────

function buildCursorDataUrl(): string {
  // 밀랍 화살표: 상단-좌 끝이 핫스팟, 황금 그라데이션 + 따뜻한 발광
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="30" viewBox="0 0 24 30">',
    '<defs>',
    '<filter id="gl" x="-120%" y="-120%" width="340%" height="340%">',
    '<feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="blur"/>',
    '<feColorMatrix in="blur" type="matrix"',
    ' values="1.4 0.6 0 0 0.08  0.9 0.5 0 0 0.02  0 0.1 0 0 0  0 0 0 0.55 0"',
    ' result="glow"/>',
    '<feMerge><feMergeNode in="glow"/><feMergeNode in="SourceGraphic"/></feMerge>',
    '</filter>',
    '<linearGradient id="wax" x1="0%" y1="0%" x2="70%" y2="100%">',
    '<stop offset="0%" stop-color="#fff8c8"/>',
    '<stop offset="30%" stop-color="#f0b030"/>',
    '<stop offset="100%" stop-color="#7a3e08"/>',
    '</linearGradient>',
    '</defs>',
    // 화살표 몸체: 좌상단 끝(3,3) → 아래로 내려와 꺾임 → 우하단 꼬리
    '<path d="M3 3 L3 23 L8.5 17.5 L12 27 L15 26 L11.5 16.5 L20 16.5 Z"',
    ' fill="url(#wax)" stroke="rgba(80,35,5,0.45)" stroke-width="0.6"',
    ' stroke-linejoin="round" filter="url(#gl)"/>',
    '</svg>',
  ].join('')
  return `url("data:image/svg+xml;base64,${btoa(svg)}") 3 3, auto`
}

// ── 스타일 주입 ──────────────────────────────────────────────────────────────

function injectStyles(cursorUrl: string): void {
  const s = document.createElement('style')
  s.id = 'cursor-fx-styles'
  s.textContent = `
/* 커스텀 커서 전체 적용 */
*,
a, button, [role="button"], [tabindex], input, label, select {
  cursor: ${cursorUrl} !important;
}

/* ── 리플 ── */
@keyframes cfx-ripple {
  0%   { transform: scale(0);   opacity: 0.85; }
  60%  { opacity: 0.4; }
  100% { transform: scale(1);   opacity: 0; }
}
.cfx-ripple {
  position: absolute;
  border-radius: 50%;
  border: 1.5px solid rgba(240, 190, 60, 0.9);
  /* 테두리만, 내부 투명 */
  background: transparent;
  width: 56px; height: 56px;
  margin: -28px 0 0 -28px;
  pointer-events: none;
  animation: cfx-ripple 0.48s cubic-bezier(0.2, 0.8, 0.4, 1) forwards;
}

/* ── 블라스트 조각 ── */
@keyframes cfx-ember {
  0%   { opacity: 0.95; transform: translate(0,0) scale(1); }
  100% { opacity: 0;    transform: translate(var(--ex), var(--ey)) scale(0.2); }
}
.cfx-ember {
  position: absolute;
  width: var(--esz); height: var(--esz);
  background: var(--ecol);
  pointer-events: none;
  animation: cfx-ember var(--edur) ease-out forwards;
}
`
  document.head.appendChild(s)
}

// ── 캔버스 (꼬리 잔상) ───────────────────────────────────────────────────────

function createCanvas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas')
  canvas.id = 'cfx-trail-canvas'
  canvas.setAttribute('aria-hidden', 'true')
  canvas.style.cssText =
    'position:fixed;inset:0;width:100%;height:100%;' +
    'z-index:9990;pointer-events:none;mix-blend-mode:screen;'
  document.body.appendChild(canvas)
  const ctx = canvas.getContext('2d')!
  return { canvas, ctx }
}

// ── 오버레이 (리플 + 블라스트) ───────────────────────────────────────────────

function createOverlay(): HTMLElement {
  const el = document.createElement('div')
  el.id = 'cfx-overlay'
  el.setAttribute('aria-hidden', 'true')
  el.style.cssText =
    'position:fixed;inset:0;z-index:9991;pointer-events:none;overflow:visible;'
  document.body.appendChild(el)
  return el
}

// ── 메인 클래스 ──────────────────────────────────────────────────────────────

class CursorFXManager {
  private canvas!: HTMLCanvasElement
  private ctx!: CanvasRenderingContext2D
  private overlay!: HTMLElement
  private trail: TrailPoint[] = []
  private raf = 0

  init(): void {
    const cursorUrl = buildCursorDataUrl()
    injectStyles(cursorUrl)

    const { canvas, ctx } = createCanvas()
    this.canvas = canvas
    this.ctx = ctx
    this.overlay = createOverlay()

    this.resizeCanvas()
    window.addEventListener('resize', () => this.resizeCanvas())
    document.addEventListener('mousemove', (e) => this.onMove(e), { passive: true })
    document.addEventListener('click', (e) => this.onClick(e))

    this.raf = requestAnimationFrame(() => this.tick())
  }

  private resizeCanvas(): void {
    this.canvas.width = window.innerWidth
    this.canvas.height = window.innerHeight
  }

  private onMove(e: MouseEvent): void {
    this.trail.push({ x: e.clientX, y: e.clientY, t: performance.now() })
    if (this.trail.length > TRAIL_CAP) this.trail.shift()
  }

  private onClick(e: MouseEvent): void {
    this.spawnRipple(e.clientX, e.clientY)
    this.spawnEmberBlast(e.clientX, e.clientY)
  }

  // ── 리플 ──

  private spawnRipple(x: number, y: number): void {
    const el = document.createElement('div')
    el.className = 'cfx-ripple'
    el.style.left = `${x}px`
    el.style.top = `${y}px`
    this.overlay.appendChild(el)
    el.addEventListener('animationend', () => el.remove(), { once: true })
    // 안전망: 애니메이션 이벤트 미발화 대비
    window.setTimeout(() => el.remove(), 700)
  }

  // ── 블라스트 ──

  private spawnEmberBlast(x: number, y: number): void {
    // 검붉은 연기 느낌 팔레트 — 깊은 암적색 → 잿빛 연기
    const colors = [
      '#0e0002', '#3a0808', '#6e1212', '#9b2018',
      '#c03828', '#7a5040', '#4a3830', '#1e1410',
    ]
    const count = 12
    for (let i = 0; i < count; i++) {
      const el = document.createElement('div')
      el.className = 'cfx-ember'

      const size = 3 + Math.random() * 6
      // 위를 향해(−y) 펴지되 좌우로도 살짝 흩어짐
      const spreadAngle = -90 + (Math.random() - 0.5) * 100
      const dist = 22 + Math.random() * 55
      const rad = (spreadAngle * Math.PI) / 180
      const ex = Math.cos(rad) * dist
      const ey = Math.sin(rad) * dist
      const dur = 340 + Math.random() * 280

      el.style.setProperty('--esz', `${size}px`)
      el.style.setProperty('--ecol', colors[Math.floor(Math.random() * colors.length)])
      el.style.setProperty('--ex', `${ex.toFixed(1)}px`)
      el.style.setProperty('--ey', `${ey.toFixed(1)}px`)
      el.style.setProperty('--edur', `${dur.toFixed(0)}ms`)
      el.style.left = `${x - size / 2}px`
      el.style.top = `${y - size / 2}px`

      this.overlay.appendChild(el)
      window.setTimeout(() => el.remove(), dur + 80)
    }
  }

  // ── 꼬리 드로우 루프 ──

  private tick(): void {
    this.drawTrail()
    this.raf = requestAnimationFrame(() => this.tick())
  }

  private drawTrail(): void {
    const { canvas, ctx, trail } = this
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (trail.length < 2) return

    const now = performance.now()
    // 오래된 포인트 정리
    while (trail.length > 0 && now - trail[0].t > TRAIL_FADE + 80) {
      trail.shift()
    }

    ctx.shadowBlur = 0

    for (let i = 1; i < trail.length; i++) {
      const p0 = trail[i - 1]
      const p1 = trail[i]
      const age = now - p1.t
      const lifeRatio = Math.max(0, 1 - age / TRAIL_FADE)
      // 앞쪽(최신) 세그먼트일수록 더 밝게
      const segRatio = i / trail.length
      const alpha = lifeRatio * segRatio * 0.65

      if (alpha <= 0.01) continue

      // 밝은 황금 코어 + 약한 외부 글로우
      const lineW = 1.8 * segRatio * lifeRatio
      ctx.beginPath()
      ctx.moveTo(p0.x, p0.y)
      ctx.lineTo(p1.x, p1.y)
      ctx.strokeStyle = `rgba(255, 215, 80, ${alpha})`
      ctx.lineWidth = lineW
      ctx.lineCap = 'round'
      ctx.shadowColor = `rgba(255, 165, 20, ${alpha * 0.5})`
      ctx.shadowBlur = 5
      ctx.stroke()
      ctx.shadowBlur = 0
    }
  }
}

export const CursorFX = new CursorFXManager()
