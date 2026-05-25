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

/**
 * Add visual touch-active states to shop interactive elements.
 * Call once when the shop overlay element is first created.
 * The existing click delegate on the overlay already handles purchase — this
 * only provides the hover-like scale feedback that CSS :hover cannot do on touch.
 */
export function attachShopTouchHighlight(shopOverlay: HTMLElement): void {
  if (!isTouchDevice()) return

  const TOUCHABLE = [
    '[data-shop-buy-kind]',
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
