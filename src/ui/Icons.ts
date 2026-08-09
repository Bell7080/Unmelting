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

/** 한 path 안에서 안쪽 서브패스를 **뚫어** 배경이 비치게 한다.
 *  배경색으로 덮으면 어떤 표면 위에서는 사각형 얼룩이 남으므로 단색 규칙과 함께 이 방식을 쓴다. */
const punch = (d: string) => `<path d="${d}" fill="currentColor" fill-rule="evenodd"/>`

/**
 * 글리프마다 그려진 높이·위치가 달라, 같은 크기로 놓아도 글줄 위에서 미묘하게 어긋난다
 * (하트는 아래로 처지고 불꽃·게이지는 위로 뜬다). 실제 상하 경계(y0..y1)를 24 박스
 * 한가운데로 옮기고, 필요하면 목표 높이까지 키운다 — 정렬 보정은 CSS가 아니라 여기 한 곳이다.
 */
const fitBox = (content: string, y0: number, y1: number, targetHeight = y1 - y0): string => {
  const scale = targetHeight / (y1 - y0)
  const cy = (y0 + y1) / 2
  return `<g transform="translate(12 12) scale(${scale.toFixed(3)}) translate(-12 ${(-cy).toFixed(2)})">${content}</g>`
}

function svg(content: string, viewBox = '0 0 24 24'): string {
  return `<svg class="icon" viewBox="${viewBox}" aria-hidden="true" focusable="false">${content}</svg>`
}

/** Heart — used for HP. Solid silhouette so it reads even at 12px. */
export function heartIcon(): string {
  return svg(
    fitBox(
      fill(
        'M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.7a4.3 4.3 0 0 1 7.5 2.6c0 5.6-7.5 10.2-7.5 10.2Z',
      ),
      6,
      20.5,
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
    fitBox(
      [
        fill(
          'M12 3.2c-.6 1.5-1.8 2.5-1.8 4.1a1.8 1.8 0 0 0 3.6 0c0-1.6-1.2-2.6-1.8-4.1Z',
        ),
        fill('M9 11h6v6H9z'),
        stroke('M9 17.5h6', 1.4),
      ].join(''),
      3.2,
      18.2,
    ),
  )
}

/** Pouch / hand shape — replaces the inventory emoji. */
export function pouchIcon(): string {
  return svg(
    fitBox(
      [
        stroke(
          'M7.5 9c0-1.5 2-3 4.5-3s4.5 1.5 4.5 3v1H7.5V9Z',
        ),
        fill(
          'M5.5 10h13l-1.4 8.4a2 2 0 0 1-2 1.6h-6.2a2 2 0 0 1-2-1.6L5.5 10Z',
        ),
        stroke('M10 13.5v3M14 13.5v3', 1.4),
      ].join(''),
      5.2,
      20,
    ),
  )
}

/**
 * 불꽃 — 빛 게이지(불씨)를 말하는 자리에 쓴다.
 * 두 겹으로 휘감던 이전 부적 실루엣은 작은 크기에서 뭉쳐 불꽃으로 읽히지 않았다.
 * 아래가 통통하고 위로 좁아지며 끝이 갈라지는 한 덩어리 실루엣이라 14px에서도 살아남는다.
 */
export function flameIcon(): string {
  return svg(
    fitBox(
      fill(
        'M12 2.4c1.9 3.4 5 5.6 5 9.2a5 5 0 0 1-10 0c0-1.6.7-2.7 1.6-3.8.3 1 .9 1.7 1.7 2 .1-3 .9-5.1 1.7-7.4Z',
      ),
      2.4,
      16.6,
      17.4,
    ),
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

/**
 * 함정 — 마주 문 이빨(턱). **함정 피해 전용**이며 공격력(검)과 구분하기 위해 만들었다.
 * 검을 쓰면 "이 함정이 나를 공격한다"로 읽혀, 밟아서 받는 피해라는 게 사라진다.
 */
export function trapIcon(): string {
  return svg(
    [
      // 위턱 — 가로 막대 + 아래로 향한 삼각 이빨 3개.
      fill('M2.4 3.2h19.2v1.9H2.4ZM3.6 5.1 7.2 5.1 5.4 9.6ZM10.2 5.1 13.8 5.1 12 9.6ZM16.8 5.1 20.4 5.1 18.6 9.6Z'),
      // 아래턱 — 위턱을 뒤집어 맞물린 모양. 이빨은 굵게 3개만 둔다(14px에서 뭉치지 않게).
      fill('M2.4 18.9h19.2v1.9H2.4ZM3.6 18.9 7.2 18.9 5.4 14.4ZM10.2 18.9 13.8 18.9 12 14.4ZM16.8 18.9 20.4 18.9 18.6 14.4Z'),
    ].join(''),
  )
}

/** 금지 표기 X — 대각선 두 획. 무언가를 껐다/막았다는 뜻으로 쓴다(온오프 꺼짐 등). */
export function closeIcon(): string {
  return svg([stroke('M6 6 L18 18', 2.2), stroke('M18 6 L6 18', 2.2)].join(''))
}

/**
 * 손패 카드 — 세로 카드 1장에 반짝임을 음각으로 판 모양.
 * '손패를 얻는다'를 말하는 자리에 쓴다(보물 보상·무료 카드·자원팩·손패 한도).
 * 주머니(pouchIcon)는 '가방'이라 카드 자체를 뜻하지 못한다.
 */
export function handCardIcon(): string {
  return svg(
    [
      // 카드 면의 반짝임은 배경색으로 덮지 않고 **뚫는다** — 도감/상점 등 표면 색이 달라도 얼룩이 남지 않는다.
      punch(
        'M7.2 2.9h9.6a1.7 1.7 0 0 1 1.7 1.7v14.8a1.7 1.7 0 0 1-1.7 1.7H7.2a1.7 1.7 0 0 1-1.7-1.7V4.6a1.7 1.7 0 0 1 1.7-1.7Z' +
          'M12 6.6 13.2 10.6 17.2 11.8 13.2 13 12 17 10.8 13 6.8 11.8 10.8 10.6Z',
      ),
    ].join(''),
  )
}

/**
 * 콤보 게이지 — 차오르는 눈금 + 위쪽 반짝임.
 * 게이지는 손패를 쓸 때마다 차고(1장 +1 · 트리플 +3), 가득 차면 영구 성장이 터진다.
 * 눈금이 '차오르는 중'을, 반짝임이 '다 차면 보상'을 말한다.
 */
export function comboGaugeIcon(): string {
  // 4칸 중 3칸이 찬 상태. 찬 칸은 채우고 빈 칸은 얇은 테두리만 남겨 대비를 만든다.
  // 칸을 6개까지 늘렸더니 12px에서 눈금이 서로 뭉개져 얼룩으로 읽혔다 — 굵고 적게 간다.
  const total = 4
  const x0 = 2.4
  const width = 19.2
  const gap = 1.5
  const tick = (width - gap * (total - 1)) / total
  const ticks: string[] = []
  for (let i = 0; i < total; i++) {
    const x = (x0 + i * (tick + gap)).toFixed(2)
    ticks.push(
      i < 3
        ? fill(`M${x} 14h${tick.toFixed(2)}v7.2h-${tick.toFixed(2)}Z`)
        : stroke(`M${(Number(x) + 0.6).toFixed(2)} 14.6h${(tick - 1.2).toFixed(2)}v6h-${(tick - 1.2).toFixed(2)}Z`, 1.2),
    )
  }
  // 반짝임은 눈금 위로 완전히 빼 둔다 — 겹치면 작은 크기에서 둘 다 뭉친다.
  return svg(
    fitBox(
      [...ticks, fill('M12 2.6 13.35 5.65 16.4 7 13.35 8.35 12 11.4 10.65 8.35 7.6 7 10.65 5.65Z')].join(''),
      2.6,
      21.2,
    ),
  )
}
