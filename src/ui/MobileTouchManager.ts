/**
 * Mobile touch interaction layer.
 * All exports are gated on isTouchDevice() so PC hover/click behaviour
 * is never touched. Call sites in GameBoardRenderer remain unchanged for
 * the desktop path.
 */

// Which hand-slot index is currently showing a tap-preview.
let previewingSlotIndex: number | null = null
// Register the document-level outside-tap clear only once per page life.
let globalTapClearAttached = false

/** True when the primary input is a touchscreen (pointer: coarse + no hover). */
export function isTouchDevice(): boolean {
  return navigator.maxTouchPoints > 0
}

/**
 * Add is-touch-device to <body> once.
 * CSS touch rules are scoped under this class so they never fire on PC.
 */
export function initTouchBody(): void {
  if (!isTouchDevice()) return
  document.body.classList.add('is-touch-device')
}

// ── Long-press Shift detail (mobile only) ───────────────────────────────────

let _shiftTimer: ReturnType<typeof setTimeout> | null = null
let _shiftMoveHandler: ((e: TouchEvent) => void) | null = null
const LONG_PRESS_MS = 480  // 일반 탭/스크롤과 구분할 임계치

/**
 * 화면을 꾹 누르면 is-shift-detail 활성(Shift 자세히보기 효과).
 * 손가락을 떼거나 10px 이상 움직이면 즉시 해제.
 * PC(non-touch)에는 전혀 영향 없음 — 한 번만 등록.
 */
let _longPressAttached = false
export function initLongPressShiftDetail(): void {
  if (!isTouchDevice() || _longPressAttached) return
  _longPressAttached = true

  document.addEventListener('touchstart', (e) => {
    // 이전 타이머·무브 핸들러 정리
    if (_shiftTimer !== null) { clearTimeout(_shiftTimer); _shiftTimer = null }
    if (_shiftMoveHandler) { document.removeEventListener('touchmove', _shiftMoveHandler); _shiftMoveHandler = null }

    if (e.touches.length === 0) return
    const startX = e.touches[0].clientX
    const startY = e.touches[0].clientY
    let moved = false

    _shiftMoveHandler = (ev: TouchEvent) => {
      if (ev.touches.length === 0) return
      if (Math.abs(ev.touches[0].clientX - startX) > 10 ||
          Math.abs(ev.touches[0].clientY - startY) > 10) moved = true
    }
    document.addEventListener('touchmove', _shiftMoveHandler, { passive: true })

    _shiftTimer = setTimeout(() => {
      if (_shiftMoveHandler) { document.removeEventListener('touchmove', _shiftMoveHandler); _shiftMoveHandler = null }
      _shiftTimer = null
      if (!moved) document.body.classList.add('is-shift-detail')
    }, LONG_PRESS_MS)
  }, { passive: true })

  const release = () => {
    if (_shiftTimer !== null) { clearTimeout(_shiftTimer); _shiftTimer = null }
    if (_shiftMoveHandler) { document.removeEventListener('touchmove', _shiftMoveHandler); _shiftMoveHandler = null }
    document.body.classList.remove('is-shift-detail')
  }
  document.addEventListener('touchend', release, { passive: true })
  document.addEventListener('touchcancel', release, { passive: true })
}


/**
 * Wire tap-to-preview / tap-to-use onto hand cards after each board render.
 * Re-applies the preview class if the same slot is still active post-render.
 */
export function attachHandCardTouch(
  boardEl: HTMLElement,
  onItemAction: (itemIndex: number) => void
): void {
  if (!isTouchDevice()) return

  // After a re-render the DOM is rebuilt but the preview state survives in
  // the module; re-apply the class so the card stays visually open.
  if (previewingSlotIndex !== null) {
    boardEl
      .querySelector<HTMLElement>(
        `.hand-slot.hand-card button[data-item-index="${previewingSlotIndex}"]`
      )
      ?.closest<HTMLElement>('.hand-slot.hand-card')
      ?.classList.add('is-touch-previewing')
  }

  boardEl.querySelectorAll<HTMLElement>('.hand-card button[data-item-index]').forEach((btn) => {
    const slot = btn.closest<HTMLElement>('.hand-slot.hand-card')
    if (!slot) return
    const itemIndex = parseInt(btn.dataset.itemIndex ?? '-1', 10)

    btn.addEventListener(
      'touchend',
      (e) => {
        // Prevent the synthetic click that browsers fire ~300ms after touchend,
        // which would trigger the normal click handler and double-fire itemAction.
        e.preventDefault()
        e.stopPropagation()

        if (previewingSlotIndex === itemIndex) {
          // Second tap on the same card: use it.
          clearAllPreviewing()
          onItemAction(itemIndex)
        } else {
          // First tap: show preview; clear any previously previewing card.
          clearAllPreviewing()
          previewingSlotIndex = itemIndex
          slot.classList.add('is-touch-previewing')
        }
      },
      { passive: false }
    )
  })

  // One document listener clears the preview when the player taps anything
  // outside the hand area (field cards, HUD, shop, etc.).
  if (!globalTapClearAttached) {
    globalTapClearAttached = true
    document.addEventListener(
      'touchend',
      (e) => {
        if (previewingSlotIndex === null) return
        if (!(e.target instanceof HTMLElement)) return
        if (!e.target.closest('.hand-slot.hand-card')) {
          clearAllPreviewing()
        }
      },
      { passive: true }
    )
  }
}

function clearAllPreviewing(): void {
  document.querySelectorAll<HTMLElement>('.is-touch-previewing').forEach((el) =>
    el.classList.remove('is-touch-previewing')
  )
  previewingSlotIndex = null
}

// Guard: don't add multiple touchstart/end listeners to the same overlay.
const touchHighlightAttached = new WeakSet<HTMLElement>()

/**
 * Add visual touch-active states to shop and trial interactive elements.
 * Safe to call on every open — uses WeakSet to attach only once per overlay.
 * The existing click delegate already handles purchase/pick; this only
 * provides the hover-like scale feedback CSS :hover cannot do on touch.
 */
export function attachShopTouchHighlight(shopOverlay: HTMLElement): void {
  if (!isTouchDevice() || touchHighlightAttached.has(shopOverlay)) return
  touchHighlightAttached.add(shopOverlay)

  const TOUCHABLE = [
    '[data-shop-buy-kind]',
    '[data-trial-pick]',    // forced trial cards use a different data attr
    '.shop-pack-pick-card',
    '.shop-reroll-btn',
    '[data-shop-close]',
  ].join(', ')

  shopOverlay.addEventListener(
    'touchstart',
    (e) => {
      const hit = (e.target as HTMLElement).closest<HTMLElement>(TOUCHABLE)
      if (hit) hit.classList.add('is-touch-active')
    },
    { passive: true }
  )

  const clear = () =>
    shopOverlay
      .querySelectorAll<HTMLElement>('.is-touch-active')
      .forEach((el) => el.classList.remove('is-touch-active'))

  shopOverlay.addEventListener('touchend', clear, { passive: true })
  shopOverlay.addEventListener('touchcancel', clear, { passive: true })
}
