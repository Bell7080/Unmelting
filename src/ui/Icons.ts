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


/** Four-point sparkle — tiny flat metadata marker for treasure/card-count labels. */
export function sparkleIcon(): string {
  return svg(
    fill(
      'M12 2.8 14.1 9.9 21.2 12 14.1 14.1 12 21.2 9.9 14.1 2.8 12 9.9 9.9 12 2.8Z',
    ),
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

/** 경험(성향) — 불빛/재화와 같은 네 꼭짓점 반짝임을 메인 상징으로 재사용한다. */
export function experienceIcon(): string {
  return svg(
    [
      // 중앙 다이아는 기존 불빛 패널의 sparkle 언어와 맞추고, 경험 탭에서도 같은 재화감을 준다.
      fill('M12 2.8 14.1 9.9 21.2 12 14.1 14.1 12 21.2 9.9 14.1 2.8 12 9.9 9.9 12 2.8Z'),
      // 얇은 대각 광맥은 뉴럴/성좌 느낌을 더하되 currentColor 단색 규칙을 유지한다.
      stroke('M12 5.6 12 18.4M5.6 12 18.4 12', 0.95),
      stroke('M8.1 8.1 15.9 15.9M15.9 8.1 8.1 15.9', 0.72),
    ].join(''),
  )
}
