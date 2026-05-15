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

/** Single small candle (양초 small) — max-health small item. */
export function smallCandleIcon(): string {
  return svg(
    [
      // flame
      fill(
        'M12 3.2c-.6 1.4-1.6 2.2-1.6 3.6a1.6 1.6 0 0 0 3.2 0c0-1.4-1-2.2-1.6-3.6Z',
      ),
      // candle body
      fill('M10 9.5h4v8h-4z'),
      // base ring
      stroke('M9.4 17.5h5.2', 1.4),
    ].join(''),
  )
}

/** Tall thick candle — max-health large item. */
export function bigCandleIcon(): string {
  return svg(
    [
      // bigger flame
      fill(
        'M12 2.2c-1 1.8-2.4 2.8-2.4 5a2.4 2.4 0 0 0 4.8 0c0-2.2-1.4-3.2-2.4-5Z',
      ),
      // wider candle body
      fill('M8.5 9.6h7v9.4h-7z'),
      // wax drip
      fill('M9 11.4c.6 1.5 1 1.5 1 2.6.4-.6.6-.8.6-1.6'),
      // base ring
      stroke('M7.6 19h8.8', 1.5),
    ].join(''),
  )
}

/** Flame charm — damage boost item. */
export function flameIcon(): string {
  return svg(
    [
      fill(
        'M12 2.5c.4 2.6-2.6 3.7-2.6 6.7 0 1.4.7 2.4 1.7 2.7-.5-.7-.6-1.5-.2-2.5.5 1.6 2.1 2.2 2.1 4 0 1.1-.7 2-1.7 2.2 3.6.2 6.2-2.4 6.2-5.7 0-3.9-3.7-4.4-5.5-7.4Z',
      ),
      fill(
        'M9.4 13.4c-1.7 1-2.6 2.6-2.6 4.4 0 2.5 2 4.2 5 4.2 2.6 0 4.8-1.4 4.8-3.7 0-1.7-1-2.7-2.4-3.4.5 1 .4 2-.4 2.7-1 1-2.6.6-2.8-.6-.2-1.2.7-1.7-.6-2.7-.4-.3-.7-.6-1-.9Z',
      ),
    ].join(''),
  )
}

/** Wax shield — trap disarm item. */
export function shieldIcon(): string {
  return svg(
    [
      fill(
        'M12 2.6 4.5 5.2v6c0 4.5 3.1 8.6 7.5 10.2 4.4-1.6 7.5-5.7 7.5-10.2v-6L12 2.6Z',
      ),
      stroke('M9 11.6l2.2 2.4L15.4 9.6', 1.6),
    ].join(''),
  )
}

/** Small spade-shaped jewel — flanks the SHOP label on the shop panel. */
export function spadeGemIcon(): string {
  return svg(
    [
      fill(
        'M12 2.6 C 16.4 7.2 20 11.1 20 14.6 C 20 17.6 17.6 19.6 14.8 19.6 C 13.6 19.6 12.6 19 12 18 C 11.4 19 10.4 19.6 9.2 19.6 C 6.4 19.6 4 17.6 4 14.6 C 4 11.1 7.6 7.2 12 2.6 Z',
      ),
      stroke('M12 4.4 L 9.6 7.6 M12 4.4 L 14.4 7.6', 1.1),
      stroke('M9.6 7.6 L 7.4 12.4 M14.4 7.6 L 16.6 12.4', 1),
      fill('M11 19.4 L 13 19.4 L 13 22 C 13 22.6 12.6 23 12 23 C 11.4 23 11 22.6 11 22 Z'),
    ].join(''),
  )
}

/** Open book — used for the compendium button so the chrome stays
 *  flat-iconic instead of relying on an emoji. */
export function bookIcon(): string {
  return svg(
    [
      // Two pages, V-spread at the spine.
      fill(
        'M3.4 5.4c2.8-.4 5.6-.2 7.6 1.2v12c-2-1.4-4.8-1.6-7.6-1.2V5.4Z',
      ),
      fill(
        'M20.6 5.4c-2.8-.4-5.6-.2-7.6 1.2v12c2-1.4 4.8-1.6 7.6-1.2V5.4Z',
      ),
      // Faint line work for page texture.
      stroke('M5.6 8.4c1.6-.2 3.2-.1 4.4.6M5.6 11c1.6-.2 3.2-.1 4.4.6', 1),
      stroke('M14 9c1.2-.7 2.8-.8 4.4-.6M14 11.6c1.2-.7 2.8-.8 4.4-.6', 1),
    ].join(''),
  )
}
