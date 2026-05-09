/**
 * Flat inline-SVG iconography. Replaces the previous emoji icons so the UI tone
 * matches the hand-illustrated card art (warm candlelight, ink lines).
 *
 * Each helper returns an SVG string. Consumers wrap them in <span class="icon">
 * so styling (size, color via currentColor) stays consistent.
 */

const stroke = (d: string, w = 1.6) =>
  `<path d="${d}" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`

const fill = (d: string) => `<path d="${d}" fill="currentColor"/>`

function svg(content: string, viewBox = '0 0 24 24'): string {
  return `<svg class="icon" viewBox="${viewBox}" aria-hidden="true" focusable="false">${content}</svg>`
}

/** Heart — used for HP. Solid silhouette so it reads even at 12px. */
export function heartIcon(): string {
  return svg(
    fill(
      'M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.7a4.3 4.3 0 0 1 7.5 2.6c0 5.6-7.5 10.2-7.5 10.2Z',
    ),
  )
}

/** Sword — used for attack power. Mixes solid blade + thin guard. */
export function swordIcon(): string {
  return svg(
    [
      fill(
        'M19.7 3.4 14 9.1l1.5 1.5 5.7-5.7a1 1 0 0 0-1.5-1.5Z',
      ),
      fill(
        'M13.2 9.9 5.4 17.7l-1.1 3.6 3.6-1.1 7.8-7.8-2.5-2.5Z',
      ),
      stroke('M14.4 13.7 16 15.3', 1.5),
    ].join(''),
  )
}

/** Small candle flame — kept for the stage title and game-over card. */
export function candleIcon(): string {
  return svg(
    [
      fill(
        'M12 3.2c-.6 1.5-1.8 2.5-1.8 4.1a1.8 1.8 0 0 0 3.6 0c0-1.6-1.2-2.6-1.8-4.1Z',
      ),
      fill('M9 11h6v6H9z'),
      stroke('M9 17.5h6', 1.4),
    ].join(''),
  )
}

/** Pouch / hand shape — replaces the inventory emoji. */
export function pouchIcon(): string {
  return svg(
    [
      stroke(
        'M7.5 9c0-1.5 2-3 4.5-3s4.5 1.5 4.5 3v1H7.5V9Z',
      ),
      fill(
        'M5.5 10h13l-1.4 8.4a2 2 0 0 1-2 1.6h-6.2a2 2 0 0 1-2-1.6L5.5 10Z',
      ),
      stroke('M10 13.5v3M14 13.5v3', 1.4),
    ].join(''),
  )
}

/** Coin / score — used by the score panel header. */
export function coinIcon(): string {
  return svg(
    [
      fill('M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z'),
      stroke('M9.5 9.5h3a1.5 1.5 0 1 1 0 3h-3v-3Zm0 3h4', 1.4),
    ].join(''),
  )
}
