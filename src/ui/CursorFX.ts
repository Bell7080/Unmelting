/**
 * CursorFX — 커스텀 커서, 마우스 먼지 잔상, 클릭 리플/블라스트 효과.
 *
 * 커서  : 반투명 다크 삼각형 + 황금 외곽 발광 (SVG, 핫스팟 2,2)
 * 꼬리  : 이동 경로에 작은 황금 사각형을 그 자리에 남기고 페이드 — 발자국 느낌
 * 리플  : 테두리만 있는 원이 점에서 커지며 페이드아웃
 * 블라스트: 검붉은 조각들이 위로 피어오르며 소멸
 */

// ── 커서 SVG ────────────────────────────────────────────────────────────────

function buildCursorDataUrl(): string {
  // 단순 삼각형 포인터: 끝(2,2) → 아래(2,21) → 오른쪽(17,12) → 닫힘
  // fill은 반투명 다크, stroke는 얇은 황금, 외곽 발광 필터
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="23" viewBox="0 0 20 23">',
    '<defs>',
    // SourceAlpha 기반 아우터 글로우 — 내부에는 번지지 않음
    '<filter id="gl" x="-120%" y="-120%" width="340%" height="340%">',
    '<feGaussianBlur in="SourceAlpha" stdDeviation="2" result="blur"/>',
    '<feFlood flood-color="#c8900a" flood-opacity="0.9" result="gc"/>',
    '<feComposite in="gc" in2="blur" operator="in" result="glow"/>',
    '<feMerge><feMergeNode in="glow"/><feMergeNode in="SourceGraphic"/></feMerge>',
    '</filter>',
    '</defs>',
    '<path d="M2,2 L2,21 L17,12 Z"',
    ' fill="#060408" fill-opacity="0.68"',
    ' stroke="#e0a820" stroke-width="0.9" stroke-linejoin="round"',
    ' filter="url(#gl)"/>',
    '</svg>',
  ].join('')
  return `url("data:image/svg+xml;base64,${btoa(svg)}") 2 2, auto`
}

// ── 스타일 주입 ──────────────────────────────────────────────────────────────

function injectStyles(cursorUrl: string): void {
  const s = document.createElement('style')
  s.id = 'cursor-fx-styles'
  s.textContent = `
/* 커스텀 커서 */
*, a, button, [role="button"], [tabindex], input, label, select {
  cursor: ${cursorUrl} !important;
}

/* ── 먼지 잔상 (그 자리 고정 → 페이드) ── */
@keyframes cfx-dust {
  0%   { opacity: 0.5; transform: scale(1); }
  100% { opacity: 0;   transform: scale(0.25); }
}
.cfx-dust {
  position: fixed;
  width: var(--dsz); height: var(--dsz);
  background: var(--dcol);
  pointer-events: none;
  animation: cfx-dust var(--ddur) ease-out forwards;
}

/* ── 클릭 리플 (테두리만, 내부 투명) ── */
@keyframes cfx-ripple {
  0%   { transform: scale(0); opacity: 0.9; }
  55%  { opacity: 0.45; }
  100% { transform: scale(1); opacity: 0; }
}
.cfx-ripple {
  position: fixed;
  border-radius: 50%;
  border: 1.5px solid rgba(235, 185, 50, 0.88);
  background: transparent;
  width: 52px; height: 52px;
  margin: -26px 0 0 -26px;
  pointer-events: none;
  animation: cfx-ripple 0.46s cubic-bezier(0.15, 0.8, 0.35, 1) forwards;
}

/* ── 클릭 블라스트 조각 ── */
@keyframes cfx-ember {
  0%   { opacity: 0.9; transform: translate(0,0) scale(1); }
  100% { opacity: 0;   transform: translate(var(--ex), var(--ey)) scale(0.15); }
}
.cfx-ember {
  position: fixed;
  width: var(--esz); height: var(--esz);
  background: var(--ecol);
  pointer-events: none;
  animation: cfx-ember var(--edur) ease-out forwards;
}
`
  document.head.appendChild(s)
}

// ── 오버레이 (리플 + 블라스트 + 먼지) ──────────────────────────────────────

function createOverlay(): HTMLElement {
  const el = document.createElement('div')
  el.id = 'cfx-overlay'
  el.setAttribute('aria-hidden', 'true')
  el.style.cssText = 'position:fixed;inset:0;z-index:9990;pointer-events:none;overflow:visible;'
  document.body.appendChild(el)
  return el
}

// ── 메인 클래스 ──────────────────────────────────────────────────────────────

// 황금 먼지 팔레트 — 약간 다양하되 전체적으로 따뜻한 호박색
const DUST_COLORS = ['#e0a820', '#c88010', '#f0c040', '#b87018', '#d49830']
// 검붉은 블라스트 팔레트
const EMBER_COLORS = ['#0e0002', '#3a0808', '#6e1010', '#9b1c18', '#c03020', '#7a4a38']

class CursorFXManager {
  private overlay!: HTMLElement
  private lastDustX = -999
  private lastDustY = -999
  // 잔상 생성 최소 거리 (px) — 너무 촘촘하지 않게
  private readonly DUST_STEP = 14

  init(): void {
    injectStyles(buildCursorDataUrl())
    this.overlay = createOverlay()

    document.addEventListener('mousemove', (e) => this.onMove(e), { passive: true })
    document.addEventListener('click', (e) => this.onClick(e))
  }

  private onMove(e: MouseEvent): void {
    const dx = e.clientX - this.lastDustX
    const dy = e.clientY - this.lastDustY
    // 이동 거리가 임계값 이상일 때만 파티클 생성
    if (dx * dx + dy * dy < this.DUST_STEP * this.DUST_STEP) return
    this.spawnDust(e.clientX, e.clientY)
    this.lastDustX = e.clientX
    this.lastDustY = e.clientY
  }

  private onClick(e: MouseEvent): void {
    this.spawnRipple(e.clientX, e.clientY)
    this.spawnEmberBlast(e.clientX, e.clientY)
  }

  // ── 먼지 잔상 ──

  private spawnDust(x: number, y: number): void {
    // 점 하나만 — 작고 은은하게
    const el = document.createElement('div')
    el.className = 'cfx-dust'
    const size = 2 + Math.random() * 2.5
    const dur = 260 + Math.random() * 160
    const jx = (Math.random() - 0.5) * 4
    const jy = (Math.random() - 0.5) * 4
    el.style.setProperty('--dsz', `${size.toFixed(1)}px`)
    el.style.setProperty('--dcol', DUST_COLORS[Math.floor(Math.random() * DUST_COLORS.length)])
    el.style.setProperty('--ddur', `${dur.toFixed(0)}ms`)
    el.style.left = `${(x + jx - size / 2).toFixed(1)}px`
    el.style.top  = `${(y + jy - size / 2).toFixed(1)}px`
    this.overlay.appendChild(el)
    window.setTimeout(() => el.remove(), dur + 40)
  }

  // ── 리플 ──

  private spawnRipple(x: number, y: number): void {
    const el = document.createElement('div')
    el.className = 'cfx-ripple'
    el.style.left = `${x}px`
    el.style.top  = `${y}px`
    this.overlay.appendChild(el)
    el.addEventListener('animationend', () => el.remove(), { once: true })
    window.setTimeout(() => el.remove(), 700)
  }

  // ── 클릭 블라스트 ──

  private spawnEmberBlast(x: number, y: number): void {
    const count = 10
    for (let i = 0; i < count; i++) {
      const el = document.createElement('div')
      el.className = 'cfx-ember'
      const size = 3 + Math.random() * 5
      // 위쪽으로 퍼지되 좌우로도 흩어짐 (−90도 기준 ±55도)
      const angle = -90 + (Math.random() - 0.5) * 110
      const dist  = 18 + Math.random() * 48
      const rad = (angle * Math.PI) / 180
      const dur = 320 + Math.random() * 260
      el.style.setProperty('--esz', `${size.toFixed(1)}px`)
      el.style.setProperty('--ecol', EMBER_COLORS[Math.floor(Math.random() * EMBER_COLORS.length)])
      el.style.setProperty('--ex', `${(Math.cos(rad) * dist).toFixed(1)}px`)
      el.style.setProperty('--ey', `${(Math.sin(rad) * dist).toFixed(1)}px`)
      el.style.setProperty('--edur', `${dur.toFixed(0)}ms`)
      el.style.left = `${(x - size / 2).toFixed(1)}px`
      el.style.top  = `${(y - size / 2).toFixed(1)}px`
      this.overlay.appendChild(el)
      window.setTimeout(() => el.remove(), dur + 60)
    }
  }
}

export const CursorFX = new CursorFXManager()
