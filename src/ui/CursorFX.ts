/**
 * CursorFX — 커스텀 커서, 클릭 리플/블라스트 효과.
 *
 * 커서  : 가는 다트형 포인터 (SVG, 핫스팟 2,2) — 다크 글래스 + 황금 림 라이트
 * 리플  : 테두리만 있는 원이 점에서 커지며 페이드아웃 + 은은한 발광
 * 블라스트: 검붉은 조각들이 위로 피어오르며 소멸
 */

// ── 커서 SVG ────────────────────────────────────────────────────────────────

function buildCursorDataUrl(): string {
  // 스테인글래스 다트 포인터: 내부 딥 블랙, 테두리 없이 황금 발광으로만 형태 묘사.
  // 이중 글로우(타이트 밝음 + 넓은 아우라)로 스테인글래스 특유의 빛 번짐 재현.
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="26" viewBox="0 0 22 26">',
    '<defs>',
    '<filter id="gl" x="-140%" y="-140%" width="380%" height="380%">',
    // SourceAlpha 블러 → 황금 컬러 적용 → 원본 알파를 out으로 빼서 외부만 남김
    '<feGaussianBlur in="SourceAlpha" stdDeviation="3.2" result="blur"/>',
    '<feFlood flood-color="#e8a020" flood-opacity="0.88" result="col"/>',
    '<feComposite in="col" in2="blur" operator="in" result="glow"/>',
    '<feComposite in="glow" in2="SourceAlpha" operator="out" result="outerGlow"/>',
    '<feMerge><feMergeNode in="outerGlow"/><feMergeNode in="SourceGraphic"/></feMerge>',
    '</filter>',
    '</defs>',
    // 노치 있는 다트형 — stroke 없이 발광으로만 윤곽 표현
    '<path d="M2,2 L20,12 L11,14.5 L8.5,24 Z"',
    ' fill="#050208" fill-opacity="0.82"',
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

/* ── 클릭 리플 (테두리만, 내부 투명, 은은한 발광) ── */
@keyframes cfx-ripple {
  0%   { transform: scale(0); opacity: 0.95; }
  55%  { opacity: 0.5; }
  100% { transform: scale(1); opacity: 0; }
}
.cfx-ripple {
  position: fixed;
  border-radius: 50%;
  border: 1.5px solid rgba(240, 195, 70, 0.92);
  background: transparent;
  width: 52px; height: 52px;
  margin: -26px 0 0 -26px;
  pointer-events: none;
  /* 안쪽/바깥쪽 모두로 번지는 황금 발광 */
  box-shadow:
    0 0 10px rgba(240, 180, 50, 0.55),
    0 0 20px rgba(240, 160, 30, 0.3),
    inset 0 0 8px rgba(255, 210, 90, 0.45);
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

// ── 오버레이 (리플 + 블라스트) ──────────────────────────────────────────────

function createOverlay(): HTMLElement {
  const el = document.createElement('div')
  el.id = 'cfx-overlay'
  el.setAttribute('aria-hidden', 'true')
  el.style.cssText = 'position:fixed;inset:0;z-index:9990;pointer-events:none;overflow:visible;'
  document.body.appendChild(el)
  return el
}

// ── 메인 클래스 ──────────────────────────────────────────────────────────────

// 검붉은 블라스트 팔레트
const EMBER_COLORS = ['#0e0002', '#3a0808', '#6e1010', '#9b1c18', '#c03020', '#7a4a38']

class CursorFXManager {
  private overlay!: HTMLElement

  init(): void {
    injectStyles(buildCursorDataUrl())
    this.overlay = createOverlay()
    // capture: true — 카드/적 요소가 stopPropagation을 해도 반드시 수신
    window.addEventListener('click', (e) => this.onClick(e), { capture: true })
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
