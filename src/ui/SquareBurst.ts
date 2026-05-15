/**
 * SquareBurst — Unmelting's unified visual effect system.
 *
 * Each effect is a burst of 16~20 solid-color squares scattering outward from
 * an origin. Every theme uses a 4-shade palette interpolated between two
 * anchor colors (e.g. red → yellow, black → white). The palette stays small
 * so bursts read as clearly themed silhouettes rather than noisy particles.
 *
 * Public API:
 *   SquareBurst.playAt(x, y, theme)         — pixel-coordinate origin
 *   SquareBurst.playOn(target, theme)       — DOM element / DOMRect origin
 *
 * Each square is absolutely positioned in a single body-mounted overlay,
 * animated via Web Animations API, and removed on finish. No per-frame
 * JS work; the GPU does the transform interpolation.
 */

export type BurstTheme =
  | 'damage'
  | 'score'
  | 'treasure-gain'
  | 'vanish-smoke'
  | 'mimic-shift'
  | 'wax-freeze'
  | 'bomb-blast'
  | 'hand-recovery'
  | 'hand-tool'
  | 'hand-control'
  | 'hand-attack'

interface Palette {
  shades: [string, string, string, string]
}

const PALETTES: Record<BurstTheme, Palette> = {
  // Hit / take damage — dark oxblood → ember yellow.
  damage: { shades: ['#1c0608', '#7a1f22', '#d6492f', '#f4c34a'] },
  // Score gain — deep wax-brown → warm candle yellow.
  score: { shades: ['#2a1808', '#8a5a18', '#e6b542', '#fff0bd'] },
  // Treasure chest opened — rich brass → bright gold.
  'treasure-gain': { shades: ['#2c1c06', '#7a4e10', '#e3a624', '#ffe28a'] },
  // Smoke / disappear — char black → ash white.
  'vanish-smoke': { shades: ['#0e0e10', '#3a3a3e', '#9a9a9e', '#e8e8ec'] },
  // Mimic transformation — bruised violet → murky moss.
  'mimic-shift': { shades: ['#0c0a14', '#3b1e44', '#6a3a2c', '#a8c25c'] },
  // Wax hardening — cold slate → milky candle wax for freeze impacts.
  'wax-freeze': { shades: ['#172033', '#5f7898', '#d6e4ee', '#fff8df'] },
  // Bomb detonation — char black → white-hot fire, hotter than the regular
  // damage burst so the explosion reads as a focal event without breaking
  // the warm ember palette that the rest of the UI lives in.
  'bomb-blast': { shades: ['#0a0508', '#5c1410', '#ff5a1c', '#fff3a0'] },
  // Hand-use, per category — each is a two-tone interpolation.
  'hand-recovery': { shades: ['#0e1f12', '#2c5e34', '#7ed091', '#e2f7c8'] },
  'hand-tool': { shades: ['#1c1304', '#6b4910', '#dca233', '#ffe9a4'] },
  'hand-control': { shades: ['#06121e', '#1f4a72', '#5fa6d8', '#dceefc'] },
  'hand-attack': { shades: ['#1c0608', '#7a1f22', '#d6492f', '#f4c34a'] },
}

export interface BurstOptions {
  /** How many squares to spawn (default 18). */
  count?: number
  /** Max travel distance from origin in px (default 120). */
  spread?: number
  /** Animation duration in ms (default 560). */
  duration?: number
  /** Min/max square edge length in px (default [10, 22]). */
  size?: [number, number]
}

const OVERLAY_ID = 'square-burst-overlay'
const STYLE_ID = 'square-burst-styles'

function getOverlay(): HTMLElement {
  let el = document.getElementById(OVERLAY_ID)
  if (el) return el
  el = document.createElement('div')
  el.id = OVERLAY_ID
  el.setAttribute('aria-hidden', 'true')
  document.body.appendChild(el)
  return el
}

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
#${OVERLAY_ID} {
  position: fixed;
  inset: 0;
  z-index: 220;
  pointer-events: none;
  overflow: visible;
}
.square-burst-piece {
  position: absolute;
  width: 14px;
  height: 14px;
  will-change: transform, opacity;
  pointer-events: none;
}
`
  document.head.appendChild(style)
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

function pickShade(palette: Palette): string {
  const i = Math.floor(Math.random() * palette.shades.length)
  return palette.shades[i]
}

function spawnSquare(
  overlay: HTMLElement,
  originX: number,
  originY: number,
  palette: Palette,
  spread: number,
  duration: number,
  sizeRange: [number, number],
): void {
  const piece = document.createElement('div')
  piece.className = 'square-burst-piece'
  const size = rand(sizeRange[0], sizeRange[1])
  const angle = rand(0, Math.PI * 2)
  // Bias the radius slightly outward so the burst silhouette feels chunky,
  // not a tight cluster.
  const distance = rand(spread * 0.35, spread)
  const dx = Math.cos(angle) * distance
  const dy = Math.sin(angle) * distance
  const startRotate = rand(-30, 30)
  const endRotate = startRotate + rand(-90, 90)

  piece.style.left = `${originX - size / 2}px`
  piece.style.top = `${originY - size / 2}px`
  piece.style.width = `${size}px`
  piece.style.height = `${size}px`
  piece.style.background = pickShade(palette)

  overlay.appendChild(piece)

  const anim = piece.animate(
    [
      {
        transform: `translate(0px, 0px) rotate(${startRotate}deg) scale(0.6)`,
        opacity: 1,
      },
      {
        transform: `translate(${dx * 0.55}px, ${dy * 0.55}px) rotate(${
          startRotate + (endRotate - startRotate) * 0.55
        }deg) scale(1)`,
        opacity: 0.95,
        offset: 0.45,
      },
      {
        transform: `translate(${dx}px, ${dy}px) rotate(${endRotate}deg) scale(0.85)`,
        opacity: 0,
      },
    ],
    {
      duration,
      easing: 'cubic-bezier(0.18, 0.78, 0.28, 1)',
      fill: 'forwards',
    },
  )

  anim.onfinish = () => piece.remove()
  // Safety net in case the animation is interrupted.
  window.setTimeout(() => piece.remove(), duration + 200)
}

export const SquareBurst = {
  /**
   * Play a burst at viewport pixel coordinates. Use this when the origin is
   * not bound to a DOM node (e.g. center-of-screen events).
   */
  playAt(x: number, y: number, theme: BurstTheme, opts: BurstOptions = {}): void {
    ensureStyles()
    const overlay = getOverlay()
    const palette = PALETTES[theme]
    const count = opts.count ?? Math.floor(rand(16, 21))
    const spread = opts.spread ?? 120
    const duration = opts.duration ?? 560
    const sizeRange = opts.size ?? [10, 22]
    for (let i = 0; i < count; i += 1) {
      spawnSquare(overlay, x, y, palette, spread, duration, sizeRange)
    }
  },

  /**
   * Play a burst centered on a DOM element (or DOMRect). The element does not
   * have to remain mounted after the call; squares live on the body overlay.
   */
  playOn(
    target: HTMLElement | DOMRect | null | undefined,
    theme: BurstTheme,
    opts: BurstOptions = {},
  ): void {
    if (!target) return
    const rect = target instanceof HTMLElement ? target.getBoundingClientRect() : target
    const x = rect.left + rect.width / 2
    const y = rect.top + rect.height / 2
    SquareBurst.playAt(x, y, theme, opts)
  },
}
