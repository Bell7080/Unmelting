/**
 * ShopOverlayView — 상점/제단 오버레이·셔터·팩 피커·강제 시련 플로우 UI.
 * GameBoardRenderer에서 표시 책임만 옮겨 왔다 — 렌더 상태의 단일 출처는 host다.
 */

import type { GameBoardRenderer } from '@ui/GameBoardRenderer'
import { Lane, LANE_DISTANCE_COUNT } from '@entities/Lane'
import type { Character } from '@entities/Character'
import { getRelicDef, RELIC_DEFINITIONS, type RelicId } from '@data/Relics'
import { RARITY_CLASS_BY_TIER, SHOP_PACK_LABELS, type CardRarity } from '@data/ShopPools'
import { spriteForRelic, SpriteUrls } from '@ui/Sprites'
import { SquareBurst, type BurstTheme } from '@ui/SquareBurst'
import { sparkleIcon } from '@ui/Icons'
import { attachShopTouchHighlight } from '@ui/MobileTouchManager'
import type {
  ForcedTrialCardView,
  ResourceTrailTarget,
  ShopBuyDetail,
  ShopOfferView,
  ShopPackKind,
  ShopPackPickDetail,
  ShopPackPickerView,
  ShopStateView,
} from '@ui/renderer/RendererTypes'

export class ShopOverlayView {
  constructor(private readonly host: GameBoardRenderer) {}

  /** Body-level shop overlay is kept outside board re-renders. */
  private shopOverlayElement: HTMLElement | null = null
  /** Hold-to-peek button — shows during shop/altar/trial; fades overlay on hold. */
  private shopPeekButton: HTMLElement | null = null
  /** 현재 열린 상점 모드. 제단(altar) 유물은 무료라 가격 기반 affordable 판정을 건너뛴다. */
  private currentShopRenderMode: 'shop' | 'altar' = 'shop'
  /** Source rect for a just-bought shop relic; the next render uses it to
   *  fly a full artifact card into the owned fan instead of popping in. */
  private pendingRelicArrival: { relicId: RelicId; rect: DOMRect } | null = null
  /** 제단 유물 픽 순간 캡처한 rect — resolveAltarRelicPick이 채우고
   *  prepareRelicArrivalFromShop이 소비한다(애니메이션 진행 중 DOM 이동 보정). */
  private altarPickedRelicRect: { relicId: RelicId; rect: DOMRect } | null = null
  /** True while the shop shutter must survive full board re-renders. Purchase
   *  refreshes rebuild the rail DOM, so the shutter state lives in the renderer
   *  instead of only in the transient `.rail-shutter` element. */
  shopShutterLocked = false
  /** 셔터가 닫힌 시점의 패널 HTML 스냅샷. render() 재호출 시 lanes가 변해도
   *  (보스 보상 3-wide 등) 셔터 모양이 변형되지 않도록 최초 레이아웃을 고정한다. */
  private shopShutterSnapshot: string | null = null
  /** Resize/scroll listener that keeps the shop shell anchored over the
   *  rail. Stored so we can remove it cleanly on shop close. */
  private shopResizeListener: (() => void) | null = null

  /** Single source of truth for shop-card affordance classes. Keeping this
   *  separate lets purchase refreshes update existing DOM nodes without
   *  rebuilding images, which removes the small flash/reload feeling. */
  private shopRelicAffordabilityClass(offer: ShopOfferView, score: number): string {
    if (offer.purchased) return 'is-purchased'
    // 패도는 최대 체력 16 이상에서만 구매 가능(index.ts relicPurchaseBlocked와 동일 조건).
    const maxHealth = this.host.getGameState()?.getCharacter().maxHealth ?? 0
    if (offer.relicId === 'hegemony' && maxHealth < 16) return 'is-unaffordable'
    // 제단 유물은 무료 단일 픽이라 가격과 무관하게 항상 밝게(affordable) 표시한다.
    if (this.currentShopRenderMode === 'altar') return 'is-affordable'
    return score >= offer.price ? 'is-affordable' : 'is-unaffordable'
  }

  /** Reroll button — ornate candle-frame control matching the game's carved-wood palette. */
  private renderShopRerollButton(cost: number, coins: number): string {
    const affordable = coins >= cost ? 'is-affordable' : 'is-unaffordable'
    // 두 화살표 순환 아이콘 — Icons.ts 동일 flat SVG 스타일(currentColor, 단색 stroke).
    const rerollIcon = `<svg class="shop-reroll-icon" width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M4 11a7 7 0 0 1 12.3-4.6"/>
      <path d="M18 11a7 7 0 0 1-12.3 4.6"/>
      <polyline points="15.4 6.4 17.3 6.4 17.3 4.5"/>
      <polyline points="6.6 15.6 4.7 15.6 4.7 17.5"/>
    </svg>`
    return `
      <button type="button"
              class="shop-reroll-btn ${affordable}"
              data-shop-buy-kind="reroll"
              aria-label="ReRoll — ${cost}$">
        <span class="shop-reroll-btn-top">
          ${rerollIcon}
          <span class="shop-reroll-btn-label">RE-ROLL</span>
        </span>
        <span class="shop-reroll-btn-rule" aria-hidden="true"></span>
        <span class="shop-reroll-btn-cost">
          <span class="shop-reroll-btn-cost-text">${cost.toLocaleString()}$</span>
        </span>
      </button>
    `
  }

  /** Free card tile (voucher-style slot). Centered inside its bottom-left
   *  layer, fixed-size relic-card style. */
  private renderShopFreeCard(claimed: boolean, label: string, description: string, kind: 'free-card' | 'free-coin-card' = 'free-card'): string {
    const stateClass = claimed ? 'is-purchased' : 'is-affordable'
    return `
      <article class="shop-relic-card shop-free-card ${stateClass} ${RARITY_CLASS_BY_TIER.common}"
               data-shop-buy-kind="${kind}"
               tabindex="0"
               style="--cardback-url:url('${SpriteUrls.cardBack}');--shop-free-art:url('${kind === 'free-coin-card' ? SpriteUrls.freeCoinCard : SpriteUrls.freeCard}');"
               aria-label="${label} — ${claimed ? '획득 완료' : '무료 1회'}">
        <!-- 무료 카드도 유물 카드와 동일한 2면 구조를 사용해 항상 카드백에서 시작한다. -->
        <div class="shop-relic-flipper">
          <div class="shop-relic-front">
            <div class="shop-relic-art shop-free-art" aria-hidden="true"></div>
            <div class="shop-relic-body">
              <h3 class="shop-relic-title">${label}</h3>
              <p class="shop-relic-effect">${description}</p>
              <p class="shop-relic-flavor">촛불이 남긴 작은 호의</p>
            </div>
          </div>
          <div class="shop-relic-cardback" aria-hidden="true"></div>
        </div>
      </article>
    `
  }

  /** Pack tile — full illustration (pack_001/002/003.webp) with centered
   *  title/effect overlay. NOT the art+body card split: the pack reads as
   *  a sealed envelope, not a card with a separate text panel. */
  private renderShopPackCard(
    kind: ShopPackKind,
    title: string,
    effect: string,
    cost: number,
    score: number,
    theme: 'resource' | 'upgrade' | 'unlock',
    order: number
  ): string {
    const affordable = score >= cost ? 'is-affordable' : 'is-unaffordable'
    const artUrl = SpriteUrls.packs[kind]
    // Pack tiers are intentionally fixed by kind so shop, picker, and codex share
    // one rarity source instead of each view hardcoding different glow levels.
    const packRarityClassMap: Record<ShopPackKind, CardRarity> = {
      'basic-pack': 'common',
      'recipe-pack': 'epic',
      'unlock-pack': 'epic',
      'chance-pack': 'rare',
      'resource-pack': 'epic',
      'delete-pack': 'legendary',
    }
    const rarityClass = RARITY_CLASS_BY_TIER[packRarityClassMap[kind]]
    return `
      <article class="shop-pack-card pack-theme-${theme} ${affordable} ${rarityClass}"
               data-shop-buy-kind="${kind}"
               tabindex="0"
               style="--cardback-url:url('${SpriteUrls.cardBack}'); --shop-pack-order:${order};"
               aria-label="${title} — 불빛 ${cost}">
        <div class="shop-pack-illustration" style="background-image: url('${artUrl}')" aria-hidden="true"></div>
        <div class="shop-pack-overlay">
          <h3 class="shop-pack-title">${title}</h3>
          <p class="shop-pack-effect">${effect}</p>
        </div>
        <span class="shop-price-label shop-pack-price" aria-hidden="true">
          <span class="shop-price-label-icon">${sparkleIcon()}</span>
          <span class="shop-price-label-text">${cost.toLocaleString()}</span>
        </span>
      </article>
    `
  }

  /** Shared shop purchase impact: brief shake + palette square burst so every
   *  shop element uses one common buy beat before its own follow-up event. */
  async playShopPurchaseImpact(target: HTMLElement, theme: Parameters<typeof SquareBurst.playOn>[1] = 'score'): Promise<void> {
    target.classList.remove('is-shop-purchase-impact')
    void target.offsetWidth
    target.classList.add('is-shop-purchase-impact')
    SquareBurst.playOn(target, theme, { count: 20, spread: 110, duration: 520 })
    await new Promise((resolve) => window.setTimeout(resolve, 280))
  }

  /** Open the modal pack-picker: 3 cards pop out of the pack; the player
   *  picks one. The overlay sits above the shop shell and is dismissed
   *  automatically when index.ts applies the pick. */
  openPackPicker(view: ShopPackPickerView): void {
    if (!this.shopOverlayElement) return
    // Anchor the picker INSIDE the shop shell so it covers only the rail
    // area (where the shutter is) — not the entire screen. The shell is
    // already re-positioned over the rail's bounding rect.
    const shell = this.shopOverlayElement.querySelector<HTMLElement>('.shop-shell')
    if (!shell) return
    let host = shell.querySelector<HTMLElement>('.shop-pack-picker')
    if (!host) {
      host = document.createElement('div')
      host.className = 'shop-pack-picker'
      host.addEventListener('click', (e) => {
        if (host?.classList.contains('is-closing')) return
        const t = e.target as HTMLElement

        // 재뽑기 버튼 — 즉시 이벤트 (연타 방지: is-reroll-locked 체크)
        const rerollBtn = t.closest<HTMLElement>('[data-pack-reroll]')
        if (rerollBtn && !rerollBtn.classList.contains('is-unaffordable') && !rerollBtn.classList.contains('is-reroll-locked')) {
          rerollBtn.classList.add('is-reroll-locked')
          const packKind = rerollBtn.dataset.packReroll as ShopPackKind | undefined
          if (packKind) {
            document.dispatchEvent(new CustomEvent('shopPackReroll', { detail: { packKind } }))
          }
          return
        }

        // Pass 버튼 — 블라스트 터짐 → 눌림 → 빠른 페이드
        const passBtn = t.closest<HTMLElement>('[data-pack-pass]')
        if (passBtn) {
          const packKind = passBtn.dataset.packPass as ShopPackKind | undefined
          if (packKind) {
            SquareBurst.playOn(passBtn, 'damage', { count: 10, spread: 50, duration: 280 })
            passBtn.classList.add('is-passing')
            setTimeout(
              () => document.dispatchEvent(new CustomEvent('shopPackPass', { detail: { packKind } })),
              340
            )
          }
          return
        }

        const card = t.closest<HTMLElement>('[data-pack-pick]')
        if (!card) return
        const itemId = card.dataset.packPick
        const packKind = card.dataset.packKind as ShopPackKind | undefined
        if (!itemId || !packKind) return
          host?.classList.add('is-pick-resolving')
          const choices = Array.from(host?.querySelectorAll<HTMLElement>('.shop-pack-pick-card') ?? [])
          choices.forEach((choice) => {
            if (choice !== card) choice.classList.add('is-fading-out')
          })
          card.classList.add('is-selected')
          window.setTimeout(async () => {
            await this.playShopPurchaseImpact(card, 'score')
            document.dispatchEvent(
              new CustomEvent<ShopPackPickDetail>('shopPackPick', { detail: { packKind, itemId } })
            )
          }, 460)
      })
      shell.appendChild(host)
    }
    host.classList.remove('is-closing')
    host.innerHTML = `
      <div class="shop-pack-picker-veil" style="--shop-picker-bg:url('${SpriteUrls.shopPickerBg}');" aria-hidden="true"></div>
      <div class="shop-pack-picker-shell" role="dialog" aria-label="${view.title}">
        <header class="shop-pack-picker-head">
          <h2>${view.title}</h2>
          <p>3장 중 1장을 선택하시오.</p>
        </header>
        <div class="shop-pack-picker-cards">${this.buildPackPickerCardsHtml(view)}</div>
        ${this.buildPackPickerFooterHtml(view)}
      </div>
    `
    host.classList.add('is-open')
    shell.classList.add('is-pack-picker-open')
    // 최초 열림 페이드인 트리거 — 리롤(is-blast) 경로와 분리해 잔상 방지
    const pickerCardsEl = host.querySelector<HTMLElement>('.shop-pack-picker-cards')
    if (pickerCardsEl) {
      pickerCardsEl.classList.add('is-entering')
      window.setTimeout(() => pickerCardsEl.classList.remove('is-entering'), 1500)
    }
  }

  /** Refresh pack cards in-place for reroll — layer stays open.
   *  블라스트 아웃 없이 즉시 교체 후 팝인+버스트 링을 단일 이벤트로 처리한다.
   *  (블라스트 아웃→팝인 2단계가 이중 점멸로 지각되어 제거함) */
  refreshPackPickerCards(view: ShopPackPickerView): void {
    const host = this.shopOverlayElement?.querySelector<HTMLElement>('.shop-pack-picker')
    if (!host || !host.classList.contains('is-open')) {
      this.openPackPicker(view)
      return
    }
    const cardsEl = host.querySelector<HTMLElement>('.shop-pack-picker-cards')
    const footerEl = host.querySelector<HTMLElement>('.shop-pack-picker-footer')
    if (!cardsEl) return

    cardsEl.innerHTML = this.buildPackPickerCardsHtml(view)

    // 카드 즉시 풀사이즈 노출 후 카드당 SquareBurst.
    // CSS scale 팝 애니메이션을 제거했으므로 버스트 시 카드 위치가 정확하다.
    const pickCards = Array.from(cardsEl.querySelectorAll<HTMLElement>('.shop-pack-pick-card'))
    pickCards.forEach((card, i) => {
      window.setTimeout(() => SquareBurst.playOn(card, 'score', { count: 22, spread: 130, duration: 440 }), i * 55)
    })

    // Update reroll cost in-place without rebuilding the whole footer
    if (footerEl && view.rerollCost != null) {
      const btn = footerEl.querySelector<HTMLElement>('.shop-pack-picker-reroll-btn')
      if (btn) {
        const affordable = (view.coins ?? 0) >= view.rerollCost
        btn.classList.remove('is-reroll-locked')
        btn.classList.toggle('is-affordable', affordable)
        btn.classList.toggle('is-unaffordable', !affordable)
        const costEl = btn.querySelector<HTMLElement>('.shop-pack-picker-reroll-cost')
        if (costEl) costEl.textContent = `${view.rerollCost}$`
      }
    }
  }

  private buildPackPickerCardsHtml(view: ShopPackPickerView): string {
    return view.items.map((item, i) => {
      // 개별 카드 아트가 있으면 우선 사용, 없으면 팩 커버 fallback
      const artUrl = item.spriteUrl ?? SpriteUrls.packs[view.packKind]
      const rarityClass = RARITY_CLASS_BY_TIER[item.rarity]
      // 타입 접미사(' 트리플',' 강화')를 제거해 이름만 표시한다.
      const cleanTitle = item.title.replace(/ (트리플|강화)$/, '')
      const typeBadge = item.typeLabel
        ? `<div class="shop-pack-type-badge">[ ${item.typeLabel} ]</div>`
        : ''
      const recipeNoteLine = item.recipeNote
        ? `<p class="shop-pack-recipe-note">${item.recipeNote}</p>`
        : ''
      // 실제 손패 카드 항목이면 카테고리/직업 태그를 희귀도 뱃지 아래에 보여준다.
      // 뱃지와 태그를 한 기둥(.shop-pack-pick-corner)으로 묶어 뱃지 높이와 무관하게 겹침을 막는다.
      const tagsOverlay = item.handCardId ? this.host.faces.tagsOverlayHtml(this.host.faces.handCardTagLabels(item.handCardId)) : ''
      return `
        <article class="shop-pack-pick-card pack-theme-${item.theme} ${rarityClass}"
                 data-pack-pick="${item.id}"
                 data-pack-kind="${view.packKind}"
                 style="--pick-i:${i}; --cardback-url:url('${SpriteUrls.cardBack}');"
                 tabindex="0"
                 aria-label="${item.title} — ${item.effect}">
          <div class="shop-pack-pick-flipper">
            <div class="shop-pack-pick-back" aria-hidden="true"></div>
            <div class="shop-pack-pick-front">
              <div class="shop-pack-pick-art" style="background-image:url('${artUrl}');" aria-hidden="true">
                <div class="shop-pack-pick-corner">
                  <div class="shop-pack-pick-rarity-badge ${rarityClass}">${item.rarity}</div>
                  ${tagsOverlay}
                </div>
              </div>
              <div class="shop-pack-pick-body">
                <header class="shop-pack-pick-card-head">
                  ${typeBadge}
                  <span class="shop-pack-pick-card-name">${cleanTitle}</span>
                </header>
                <p class="shop-pack-pick-card-effect">${item.effect}</p>
                ${recipeNoteLine}
              </div>
            </div>
          </div>
        </article>`
    }).join('')
  }

  // 재뽑기 아이콘 — 유물 리롤 버튼과 동일한 flat SVG
  private readonly packRerollIcon = `<svg class="shop-pack-reroll-icon" width="20" height="20" viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M4 11a7 7 0 0 1 12.3-4.6"/>
    <path d="M18 11a7 7 0 0 1-12.3 4.6"/>
    <polyline points="15.4 6.4 17.3 6.4 17.3 4.5"/>
    <polyline points="6.6 15.6 4.7 15.6 4.7 17.5"/>
  </svg>`

  private buildPackPickerFooterHtml(view: ShopPackPickerView): string {
    const rerollAffordable = view.rerollCost != null && (view.coins ?? 0) >= view.rerollCost
    const rerollBtn = view.rerollCost != null
      ? `<button type="button"
                 class="shop-pack-picker-reroll-btn ${rerollAffordable ? 'is-affordable' : 'is-unaffordable'}"
                 data-pack-reroll="${view.packKind}"
                 aria-label="REROLL — ${view.rerollCost}$">
           <span class="shop-pack-picker-reroll-top">
             ${this.packRerollIcon}
             <span class="shop-pack-picker-reroll-label">REROLL</span>
           </span>
           <span class="shop-pack-picker-reroll-rule" aria-hidden="true"></span>
           <span class="shop-pack-picker-reroll-cost">${view.rerollCost}$</span>
         </button>`
      : ''
    const passBtn = view.passable
      ? `<button type="button"
                 class="shop-pack-pass-btn"
                 data-pack-pass="${view.packKind}"
                 aria-label="Pass">PASS</button>`
      : ''
    if (!rerollBtn && !passBtn) return ''
    return `<footer class="shop-pack-picker-footer">${rerollBtn}${passBtn}</footer>`
  }

  /** Hide the pack picker overlay. Plays the lift-out animation first
   *  (cards rise + veil retracts), then tears down the DOM. Idempotent —
   *  calling it again while already closing is a no-op so the click
   *  handler and the index.ts pick handler can both invoke it safely. */
  closePackPicker(): void {
    const host = this.shopOverlayElement?.querySelector<HTMLElement>('.shop-pack-picker')
    if (!host) return
    if (host.classList.contains('is-closing')) return
    if (!host.classList.contains('is-open')) {
      host.innerHTML = ''
      return
    }
    host.classList.add('is-closing')
    // Lift animation duration ≈ 340ms + max-stagger 160ms; tear down a hair
    // after the last card has left so nothing pops.
    window.setTimeout(() => {
      host.classList.remove('is-open', 'is-closing')
      host.innerHTML = ''
      const shell = this.shopOverlayElement?.querySelector<HTMLElement>('.shop-shell')
      shell?.classList.remove('is-pack-picker-open')
    }, 640)
  }

  /** Shop relic card. Click on the card itself buys the relic (the
   *  separate price button is gone). Price uses the flat diamond-like light
   *  icon from the shared SVG family instead of the old tag+점 label.
   *
   *  The hover-grown card is the click target so the player naturally
   *  taps "the bigger card" instead of hunting for a small button. */
  private renderShopRelicCard(offer: ShopOfferView, score: number, _character: Character): string {
    const def = RELIC_DEFINITIONS[offer.relicId]
    const rarityClass = RARITY_CLASS_BY_TIER[getRelicDef(offer.relicId).rarity]
    const affordabilityClass = this.shopRelicAffordabilityClass(offer, score)
    const cardLeaveDelay = Math.floor(Math.random() * 240)
    return `
      <article class="shop-relic-card ${affordabilityClass} ${rarityClass}"
               data-shop-buy="${def.id}"
               data-shop-buy-kind="relic"
               style="--card-leave-delay:${cardLeaveDelay}ms; --cardback-url:url('${SpriteUrls.cardBack}');"
               tabindex="0"
               aria-label="${def.name} — ${offer.purchased ? '구매 완료' : `불빛 ${offer.price}`}">
        <!-- Hand-preview와 동일한 2면 플립 구조: flipper 컨테이너 내부에 앞/뒷면을 고정한다. -->
        <div class="shop-relic-flipper">
        <div class="shop-relic-front">
          <div class="shop-relic-art" style="background-image: url('${spriteForRelic(def.id)}')" aria-hidden="true"></div>
          <div class="shop-relic-body">
            <h3 class="shop-relic-title">${def.name}</h3>
            <p class="shop-relic-effect">${this.host.faces.relicEffectHtml(this.host.faces.relicDynamicEffect(def.id, def.effect, false), def.spawnEffect, this.host.getSpawnWeightCtx(), false)}</p>
            <p class="shop-relic-flavor">${def.flavor}</p>
          </div>
        </div>
        <!-- Back face is ALWAYS present as a full cardbackground_001.webp panel.
             During rotation it behaves like a real card back, not an overlay hack. -->
        <div class="shop-relic-cardback" aria-hidden="true"></div>
        </div>
        <!-- 가격 라벨은 flipper(둥근 마스크) 밖으로 분리해서 카드 하단 아래에 항상 노출되게 유지한다. -->
        <span class="shop-price-label shop-relic-price-label" aria-hidden="true">
          <span class="shop-price-label-icon">${sparkleIcon()}</span>
          <span class="shop-price-label-text">${
            offer.purchased ? '구매 완료' : `${offer.price.toLocaleString()}`
          }</span>
        </span>
      </article>
    `
  }

  /** Build or refresh the in-rail shop after the 10-turn shutter drop.
   *
   *  The shop overlay no longer covers the full screen — it floats only
   *  over the rail area, with its `.shop-shell` positioned to match the
   *  rail's bounding rect. The score panel, hand panel, and player card
   *  stay fully visible so coins/HP/ATK/relics are readable while
   *  shopping. Outside the shell, pointer events pass through, but
   *  `inputLocked` blocks any actual game actions on those panels.
   */
  openShop(shop: ShopStateView, score: number, character: Character): void {
    this.currentShopRenderMode = shop.mode
    if (!this.shopOverlayElement) {
      this.shopOverlayElement = document.createElement('div')
      this.shopOverlayElement.id = 'shop-overlay'
      this.shopOverlayElement.className = 'shop-overlay'
      this.shopOverlayElement.addEventListener('click', (e) => {
        const t = e.target as HTMLElement
        const closeBtn = t.closest<HTMLElement>('[data-shop-close]')
        if (closeBtn) {
          document.dispatchEvent(new CustomEvent('shopClose'))
          return
        }
        // The whole relic card is the buy target now (no separate buy
        // button) — click the hover-grown card to purchase.
        const buyTarget = t.closest<HTMLElement>('[data-shop-buy-kind]')
        if (!buyTarget || buyTarget.classList.contains('is-purchased')) return
        const kind = buyTarget.dataset.shopBuyKind as ShopBuyDetail['kind'] | undefined
        // 리롤 애니메이션 중에는 같은 버튼에서 추가 shopBuy 이벤트를 만들지 않는다.
        if (!kind || buyTarget.classList.contains('is-reroll-locked')) return
        const relicId = buyTarget.dataset.shopBuy as RelicId | undefined
        document.dispatchEvent(new CustomEvent<ShopBuyDetail>('shopBuy', { detail: { kind, relicId } }))
      })
      document.body.appendChild(this.shopOverlayElement)
      // Mobile: add touch-active highlight so shop cards give visual feedback
      // equivalent to the :hover scale they show on desktop.
      attachShopTouchHighlight(this.shopOverlayElement)
    }
    // While the overlay is already open, refresh affordability/labels in place
    // on the existing DOM nodes — rebuilding innerHTML caused a visible white
    // flash on every purchase/reroll. Full HTML build is reserved for the very
    // first open of a shop visit.
    if (this.shopOverlayElement.classList.contains('is-open')) {
      this.refreshOpenShopInPlace(shop, score, character)
      this.positionShopShellOverRail()
      return
    }
    const cards =
      shop.relicOffers.length > 0
        ? shop.relicOffers
            .map((offer) => this.renderShopRelicCard(offer, score, character))
            .join('')
        : '<div class="shop-empty">오늘의 잡화는 모두 팔렸어.</div>'
    // Shared pack labels/effects avoid one-off hardcoded strings per view.
    const basicPackLabel = SHOP_PACK_LABELS['basic-pack']
    const recipePackLabel = SHOP_PACK_LABELS['recipe-pack']
    const unlockPackLabel = SHOP_PACK_LABELS['unlock-pack']
    // 무료카드 타이틀은 상점/제단 공통 '무료 카드'로 통일한다.
    const freeCardLabel = '무료 카드'
    // New layered layout:
    //   .rail-shutter   — original 9-panel wax shutter (in .rail), closes
    //                     sequentially first.
    //   .shop-dim-veil  — semi-transparent black sheet inside the shell,
    //                     descends top-down AFTER the shutter, providing the
    //                     unified darkening backdrop the player asked for.
    //   .shop-top-row   — 2:8 grid: reroll button (LEFT, small) + artifact
    //                     layer (RIGHT, 3 cards floating).
    //   .shop-bottom-row — 3:7 grid: free card layer (LEFT) + pack layer (RIGHT).
    //   .shop-layer     — hit/layout 전용 투명 레이어.
    //                     카드는 고정 크기를 유지하고 경계를 넘을 수 있다.
    this.shopOverlayElement.innerHTML = `
      <!-- 제단/상점 모드별 레이아웃 미세 조정을 위해 모드 데이터를 shell에 남긴다. -->
      <div class="shop-shell" data-shop-mode="${shop.mode}" role="dialog" aria-label="상점">
        <div class="shop-dim-veil" style="--shop-veil-bg:url('${shop.mode === 'altar' ? SpriteUrls.altarVeilBg : SpriteUrls.shopVeilBg}');" aria-hidden="true"></div>
        <!-- 셔터+일러스트(veil) 이후 동일 텀으로 상점/제단 콘텐츠가 한 번에 열리도록
             실제 상호작용 UI를 하나의 번들 레이어로 묶는다. -->
        <div class="shop-content-bundle">
          <section class="shop-row shop-top-row" aria-label="유물 상점">
            <div class="shop-layer shop-reroll-zone" aria-hidden="true"></div>
            <div class="shop-layer shop-artifact-layer">
              ${shop.mode === 'altar' ? '' : `<div class="shop-reroll-card-anchor">${this.renderShopRerollButton(shop.rerollCost, shop.coins)}</div>`}
              ${cards}
            </div>
          </section>
          <section class="shop-row shop-bottom-row" aria-label="카드 및 카드팩">
            <div class="shop-layer shop-free-layer">
              ${[
                this.renderShopFreeCard(shop.freeCardClaimed, freeCardLabel, shop.freeCardDescription ?? '1$', 'free-card'),
                shop.mode === 'altar' ? this.renderShopFreeCard(!!shop.freeCoinCardClaimed, '동전 한 닢', '1$', 'free-coin-card') : '',
              ].join('')}
            </div>
            <div class="shop-layer shop-pack-layer">
              ${(() => {
                if (shop.mode === 'altar') {
                  const altarAll: Array<[ShopPackKind, string, string, number, 'resource' | 'upgrade' | 'unlock', number]> = [
                    ['resource-pack', '자원팩', '체력·손패·불씨 한도 영구 상향', shop.packCosts?.['resource-pack'] ?? 500, 'resource', 0],
                    ['chance-pack', '확률팩', '특정 카드 1차 드롭 우선도 부여', shop.packCosts?.['chance-pack'] ?? 500, 'upgrade', 1],
                    ['delete-pack', '삭제팩', '카드 제거 · 드롭 집중도 상향', shop.packCosts?.['delete-pack'] ?? 500, 'unlock', 2],
                  ]
                  return altarAll.map(([k, t, d, c, th, n]) => this.renderShopPackCard(k, t, d, c, score, th, n)).join('')
                } else {
                  const shopAll: Array<[ShopPackKind, string, string, number, 'resource' | 'upgrade' | 'unlock', number]> = [
                    ['basic-pack', basicPackLabel.title, 'HP·불씨·게이지 즉시 보충', shop.packCosts?.['basic-pack'] ?? shop.basicPackCost, 'resource', 0],
                    ['recipe-pack', recipePackLabel.title, '조합식 해금 · 덱 심도 확장', shop.packCosts?.['recipe-pack'] ?? 400, 'upgrade', 1],
                    ['unlock-pack', unlockPackLabel.title, '잠긴 손패 해금 · 드롭 풀 확대', shop.packCosts?.['unlock-pack'] ?? 400, 'unlock', 2],
                  ]
                  return shopAll.map(([k, t, d, c, th, n]) => this.renderShopPackCard(k, t, d, c, score, th, n)).join('')
                }
              })()}
            </div>
          </section>
          <button class="shop-close-btn" type="button" data-shop-close aria-label="상점 나가기">EXIT</button>
        </div>
      </div>
    `
    this.shopOverlayElement.classList.add('is-open')
    this.showShopPeekButton()
    // 진입 페이드는 최초 오픈에서만 1회 재생한다. 이후 in-place 갱신/임팩트가
    // animation을 건드려도 재발동하지 않도록, 입장이 끝나면 마커를 제거한다.
    const enteringShell = this.shopOverlayElement.querySelector<HTMLElement>('.shop-shell')
    if (enteringShell) {
      enteringShell.classList.add('is-entering')
      window.setTimeout(() => enteringShell.classList.remove('is-entering'), 1200)
    }
    this.positionShopShellOverRail()
    if (!this.shopResizeListener) {
      this.shopResizeListener = () => this.positionShopShellOverRail()
      window.addEventListener('resize', this.shopResizeListener)
      window.addEventListener('scroll', this.shopResizeListener, { passive: true })
    }
  }

  /** Update labels, affordability classes, and purchased states on the
   *  already-rendered shop without touching innerHTML. This is what kills
   *  the white flash on purchase/reroll — the DOM nodes (and their images)
   *  stay mounted; only attributes/text change. */
  private refreshOpenShopInPlace(
    shop: ShopStateView,
    score: number,
    _character: Character
  ): void {
    const shell = this.shopOverlayElement?.querySelector<HTMLElement>('.shop-shell')
    if (!shell) return

    // 오퍼 목록에서 빠진 유물 카드는 DOM에서 제거한다(제단 무료 픽 후 선택/소실 카드 정리).
    const offerIds = new Set(shop.relicOffers.map((o) => RELIC_DEFINITIONS[o.relicId].id as string))
    shell
      .querySelectorAll<HTMLElement>('.shop-artifact-layer .shop-relic-card[data-shop-buy]')
      .forEach((card) => {
        if (!offerIds.has(card.dataset.shopBuy ?? '')) card.remove()
      })

    // Relic cards: replicate the old refreshOpenShopCards path.
    for (const offer of shop.relicOffers) {
      const def = RELIC_DEFINITIONS[offer.relicId]
      const card = shell.querySelector<HTMLElement>(
        `.shop-artifact-layer .shop-relic-card[data-shop-buy="${def.id}"]`
      )
      if (!card) continue
      card.classList.remove('is-affordable', 'is-unaffordable', 'is-purchased')
      card.classList.add(this.shopRelicAffordabilityClass(offer, score))
      card.setAttribute(
        'aria-label',
        `${def.name} — ${offer.purchased ? '구매 완료' : `불빛 ${offer.price}`}`
      )
      const label = card.querySelector<HTMLElement>('.shop-price-label-text')
      if (label)
        label.textContent = offer.purchased ? '구매 완료' : `${offer.price.toLocaleString()}`
    }

    // Reroll button (coins-based affordance + cost text).
    const reroll = shell.querySelector<HTMLElement>('.shop-reroll-btn')
    if (reroll) {
      // 임팩트 클래스를 정리해 다음 in-place 갱신에서 애니메이션이 재발동하지 않게 한다.
      reroll.classList.remove('is-affordable', 'is-unaffordable', 'is-reroll-impacted', 'is-shop-purchase-impact')
      reroll.classList.add(shop.coins >= shop.rerollCost ? 'is-affordable' : 'is-unaffordable')
      const costText = reroll.querySelector<HTMLElement>('.shop-reroll-btn-cost-text')
      if (costText) costText.textContent = `${shop.rerollCost.toLocaleString()}$`
      reroll.setAttribute('aria-label', `ReRoll — ${shop.rerollCost}$`)
    }

    // Free card claimed state. (무료 카드는 가격 라벨 없이 상태 클래스만 갱신한다.)
    const free = shell.querySelector<HTMLElement>('.shop-free-card')
    if (free) {
      free.classList.remove('is-affordable', 'is-purchased')
      free.classList.add(shop.freeCardClaimed ? 'is-purchased' : 'is-affordable')
    }

    // Pack tiles (cost + affordance based on score).
    const packMap: Record<ShopPackKind, number> = {
      'basic-pack': shop.packCosts?.['basic-pack'] ?? shop.basicPackCost,
      'recipe-pack': shop.packCosts?.['recipe-pack'] ?? 400,
      'unlock-pack': shop.packCosts?.['unlock-pack'] ?? 400,
      'chance-pack': shop.packCosts?.['chance-pack'] ?? 500,
      'resource-pack': shop.packCosts?.['resource-pack'] ?? 500,
      'delete-pack': shop.packCosts?.['delete-pack'] ?? 500,
    }
    for (const kind of Object.keys(packMap) as ShopPackKind[]) {
      const tile = shell.querySelector<HTMLElement>(
        `.shop-pack-card[data-shop-buy-kind="${kind}"]`
      )
      if (!tile) continue
      const cost = packMap[kind]
      tile.classList.remove('is-affordable', 'is-unaffordable')
      tile.classList.add(score >= cost ? 'is-affordable' : 'is-unaffordable')
      const priceText = tile.querySelector<HTMLElement>('.shop-price-label-text')
      if (priceText) priceText.textContent = `${cost.toLocaleString()}`
    }
  }

  /** Re-anchor the shop shell so it always sits exactly over the rail.
   *  On touch-landscape devices, CSS overrides these values with !important
   *  to fill the full overlay instead. */
  private positionShopShellOverRail(): void {
    if (!this.shopOverlayElement?.classList.contains('is-open')) return
    const rail = this.host.boardElement.querySelector<HTMLElement>('.rail')
    const shell = this.shopOverlayElement.querySelector<HTMLElement>('.shop-shell')
    if (!rail || !shell) return
    const rect = rail.getBoundingClientRect()
    shell.style.top = `${rect.top}px`
    shell.style.left = `${rect.left}px`
    shell.style.width = `${rect.width}px`
    shell.style.height = `${rect.height}px`
    // 미리보기 버튼을 레일 좌상단 안쪽에 맞춘다.
    if (this.shopPeekButton) {
      this.shopPeekButton.style.top = `${rect.top + 10}px`
      this.shopPeekButton.style.left = `${rect.left + 10}px`
    }
  }

  /** Play the cards-leaving animation: every relic card bounces down a
   *  little and then swooshes upward in random staggered order. The EXIT
   *  button is hidden during this beat so it doesn't linger on the way
   *  out. Resolves once all cards have left, so the caller can then
   *  hide the overlay and raise the shutter. */
  playShopExitAnimation(): Promise<void> {
    const shell = this.shopOverlayElement?.querySelector<HTMLElement>('.shop-shell')
    if (!shell) return Promise.resolve()
    const cards = Array.from(
      shell.querySelectorAll<HTMLElement>('.shop-relic-card, .shop-pack-card')
    ).filter((card) => !card.classList.contains('is-purchased'))
    shell.classList.add('is-closing')
    if (cards.length === 0) return Promise.resolve()

    // Wait for every upward swoosh animation instead of racing a fixed timer;
    // the shutter resume must not begin until the last relic has actually left.
    let finished = 0
    return new Promise((resolve) => {
      let resolved = false
      let fallback = 0
      const finishAll = (): void => {
        if (resolved) return
        resolved = true
        window.clearTimeout(fallback)
        resolve()
      }
      const finishOne = (): void => {
        finished += 1
        if (finished >= cards.length) finishAll()
      }
      fallback = window.setTimeout(finishAll, 220 + 240 + 700)
      cards.forEach((card) => {
        card.addEventListener('animationend', (event) => {
          if (event.animationName !== 'shop-card-swoosh') return
          finishOne()
        })
      })
    })
  }

  /** Hide the modal shop without destroying purchased state in index.ts. */
  closeShop(): void {
    this.shopOverlayElement?.classList.remove('is-open')
    this.shopOverlayElement
      ?.querySelector<HTMLElement>('.shop-shell')
      ?.classList.remove('is-closing')
    if (this.shopResizeListener) {
      window.removeEventListener('resize', this.shopResizeListener)
      window.removeEventListener('scroll', this.shopResizeListener)
      this.shopResizeListener = null
    }
    this.hideShopPeekButton()
  }

  /** Creates (once) and shows the hold-to-peek button in the viewport corner. */
  private showShopPeekButton(): void {
    if (!this.shopPeekButton) {
      const btn = document.createElement('button')
      btn.className = 'shop-peek-btn'
      btn.type = 'button'
      btn.setAttribute('aria-label', '레일 미리보기 (꾹 누르기)')
      // Magnifying glass with a small flame inside the lens — flat SVG, game style.
      btn.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" width="18" height="18">
        <circle cx="10" cy="10" r="6" fill="none" stroke="currentColor" stroke-width="1.7"/>
        <line x1="14.6" y1="14.6" x2="20.5" y2="20.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
        <path d="M10 7c-.45 1.3-1.1 2-1.1 3a1.1 1.1 0 0 0 2.2 0c0-1-.65-1.7-1.1-3Z" fill="currentColor"/>
      </svg>`
      const clearPeek = () => {
        document.body.classList.remove('body--peeking')
        btn.classList.remove('is-peeking')
      }
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault()
        document.body.classList.add('body--peeking')
        btn.classList.add('is-peeking')
        btn.setPointerCapture((e as PointerEvent).pointerId)
      })
      btn.addEventListener('pointerup', clearPeek)
      btn.addEventListener('pointercancel', clearPeek)
      document.body.appendChild(btn)
      this.shopPeekButton = btn
    }
    this.shopPeekButton.classList.add('is-visible')
  }

  /** Hides the peek button and clears any active peek state. */
  private hideShopPeekButton(): void {
    this.shopPeekButton?.classList.remove('is-visible')
    document.body.classList.remove('body--peeking')
  }

  /** Forced trial reuses shop shell/bundle grammar so altar->boss->trial feels
   *  like one uninterrupted rail event flow (drop layer -> pick -> EXIT). */
  openForcedTrialShopFlow(cards: ForcedTrialCardView[]): void {
    if (!this.shopOverlayElement) {
      this.shopOverlayElement = document.createElement('div')
      this.shopOverlayElement.id = 'shop-overlay'
      this.shopOverlayElement.className = 'shop-overlay'
      document.body.appendChild(this.shopOverlayElement)
    }
    this.shopOverlayElement.innerHTML = `
      <div class="shop-shell shop-shell--trial" data-shop-mode="altar" role="dialog" aria-label="시련 선택">
        <div class="shop-dim-veil" style="--shop-veil-bg:url('${SpriteUrls.trialVeilBg}');" aria-hidden="true"></div>
        <div class="shop-content-bundle">
          <section class="shop-row shop-top-row" aria-label="시련 카드">
            <div class="shop-layer shop-artifact-layer shop-trial-layer trial-rail-frame" aria-hidden="false">
              ${cards.map((card) => `
                <button class="shop-relic-card shop-trial-card is-affordable" data-trial-pick="${card.id}" type="button"
                        style="--cardback-url:url('${SpriteUrls.cardBack}');"
                        aria-label="${card.title}">
                  <div class="shop-relic-flipper">
                    <div class="shop-relic-front shop-trial-front">
                      <div class="shop-relic-art shop-trial-art" style="background-image: url('${card.spriteUrl}')" aria-hidden="true"></div>
                      <div class="shop-relic-body shop-trial-body">
                        <h3 class="shop-relic-title shop-trial-title">${card.title}</h3>
                        <p class="shop-relic-effect shop-trial-effect">${card.effect}</p>
                      </div>
                    </div>
                  </div>
                </button>
              `).join('')}
            </div>
          </section>
        </div>
      </div>
    `
    this.shopOverlayElement.onclick = (event) => {
      const target = event.target as HTMLElement
      const pick = target.closest<HTMLElement>('[data-trial-pick]')
      if (pick) {
        document.dispatchEvent(new CustomEvent('forcedTrialPick', { detail: { id: pick.dataset.trialPick } }))
      }
    }
    // Mobile: wire touch-active highlight (idempotent — safe after shop→trial reuse).
    attachShopTouchHighlight(this.shopOverlayElement)
    this.shopOverlayElement.classList.add('is-open')
    this.showShopPeekButton()
    this.positionShopShellOverRail()
  }

  /** Build shutter spans from the current rail. Grouped front cards (2/3칸)
   *  become one wide panel so no card art peeks through inner column gaps. */
  private shopShutterPanelsFromLanes(lanes?: Lane[]): string {
    let panelIndex = 0
    if (!lanes) {
      return Array.from(
        { length: 9 },
        () => `<span style="--shutter-i:${panelIndex++}"></span>`
      ).join('')
    }

    const rows: string[] = []
    for (let distance = LANE_DISTANCE_COUNT - 1; distance >= 0; distance--) {
      let laneIndex = 0
      while (laneIndex < lanes.length) {
        const card = lanes[laneIndex].getCardAtDistance(distance)
        let span = 1
        // Match renderRow's active-row grouping rule: only the front row can
        // merge adjacent same Card instances into a 2/3칸 object.
        if (distance === 0 && card) {
          while (
            laneIndex + span < lanes.length &&
            lanes[laneIndex + span].getCardAtDistance(distance) === card
          ) {
            span++
          }
        }
        rows.push(
          `<span style="--shutter-i:${panelIndex++};${span > 1 ? `grid-column: span ${span};` : ''}"></span>`
        )
        laneIndex += span
      }
    }
    return rows.join('')
  }

  /** Read the already-rendered rail when a live shutter transition starts. */
  private shopShutterPanelsFromRail(rail: HTMLElement): string {
    let panelIndex = 0
    const panels: string[] = []
    rail.querySelectorAll<HTMLElement>('.rail-row').forEach((row) => {
      row.querySelectorAll<HTMLElement>('.cell').forEach((cell) => {
        const span = Number(cell.dataset.span || '1')
        panels.push(
          `<span style="--shutter-i:${panelIndex++};${span > 1 ? `grid-column: span ${span};` : ''}"></span>`
        )
      })
    })
    return panels.length > 0 ? panels.join('') : this.shopShutterPanelsFromLanes()
  }

  /** Shared wax shutter markup used by both live transitions and render-restored
   *  shop state. `persistent` keeps a purchase refresh from replaying the drop. */
  renderShopShutter(persistent = false, lanes?: Lane[]): string {
    const classes = ['rail-shutter', persistent ? 'is-closed is-persistent' : '']
      .filter(Boolean)
      .join(' ')
    // 영구 셔터는 진입 시점 스냅샷 우선 — lanes가 보스 보상 등으로 변해도 모양 고정.
    const panels = persistent && this.shopShutterSnapshot
      ? this.shopShutterSnapshot
      : this.shopShutterPanelsFromLanes(lanes)
    return `<div class="${classes}" aria-hidden="true">${panels}</div>`
  }

  /** Create the wax shutter grid used by shop stop/resume transitions. */
  private createShopShutter(rail?: HTMLElement): HTMLElement {
    const host = document.createElement('template')
    const panels = rail ? this.shopShutterPanelsFromRail(rail) : this.shopShutterPanelsFromLanes()
    host.innerHTML = `<div class="rail-shutter" aria-hidden="true">${panels}</div>`
    return host.content.firstElementChild as HTMLElement
  }

  /** Project each shutter panel onto the current rail cell bounds so the shop
   *  shutter follows the same perspective (front/mid/top row scale + 2/3-span). */
  syncShopShutterToRailCells(): void {
    // 스냅샷이 활성화된 동안(보스 이벤트·보상 페이지)에는 CSS vars를 재계산하지 않는다.
    // 보상 3-wide 레이아웃이 셔터 위치를 덮어쓰는 것을 막는다.
    if (this.shopShutterSnapshot !== null) return
    const rail = this.host.boardElement.querySelector<HTMLElement>('.rail')
    const shutter = rail?.querySelector<HTMLElement>('.rail-shutter')
    if (!rail || !shutter) return

    const railRect = rail.getBoundingClientRect()
    const rowCells = [...rail.querySelectorAll<HTMLElement>('.rail-row .cell')]
    const panels = [...shutter.querySelectorAll<HTMLElement>('span')]
    if (rowCells.length === 0 || panels.length === 0) return

    const count = Math.min(rowCells.length, panels.length)
    for (let i = 0; i < count; i++) {
      const cellRect = rowCells[i].getBoundingClientRect()
      const panel = panels[i]
      panel.style.setProperty('--shutter-cell-x', `${cellRect.left - railRect.left}px`)
      panel.style.setProperty('--shutter-cell-y', `${cellRect.top - railRect.top}px`)
      panel.style.setProperty('--shutter-cell-w', `${cellRect.width}px`)
      panel.style.setProperty('--shutter-cell-h', `${cellRect.height}px`)
    }
  }

  /** 10-turn shop transition: rail quake, then the 3×3 shutter closes and stays closed. */
  playShopTransition(): Promise<void> {
    const rail = this.host.boardElement.querySelector<HTMLElement>('.rail')
    if (!rail) return Promise.resolve()
    this.shopShutterLocked = true
    const oldShutter = rail.querySelector<HTMLElement>('.rail-shutter')
    oldShutter?.remove()
    const shutter = this.createShopShutter(rail)
    rail.appendChild(shutter)
    // CSS vars(위치) 계산 후 스냅샷 저장 → re-render 시 CSS vars가 포함된 패널 HTML을
    // 재사용하고 syncShopShutterToRailCells()가 덮어쓰지 않도록 guard와 연동된다.
    this.syncShopShutterToRailCells()
    this.shopShutterSnapshot = shutter.innerHTML
    // While the shutter is down, pause only distracting in-rail loop effects
    // (not gameplay timers), so armed bombs do not sparkle behind the paper.
    rail.classList.add('is-shop-quaking', 'is-shop-shuttered')
    return new Promise((resolve) => {
      window.setTimeout(() => rail.classList.remove('is-shop-quaking'), 520)
      window.setTimeout(() => shutter.classList.add('is-closed'), 760)
      window.setTimeout(resolve, 860)
    })
  }

  /** Lift the shop shutter only after the player exits the shop. */
  playShopResumeTransition(): Promise<void> {
    const rail = this.host.boardElement.querySelector<HTMLElement>('.rail')
    if (!rail) return Promise.resolve()
    const shutter = rail.querySelector<HTMLElement>('.rail-shutter') ?? this.createShopShutter()
    if (!shutter.isConnected) {
      rail.appendChild(shutter)
    }
    // 항상 is-opening을 제거하고 is-closed+is-persistent로 강제 초기화.
    // 보스→시련 흐름에서 셔터가 중간 상태로 노출될 수 있어 매번 클린 상태로 시작.
    shutter.classList.remove('is-opening')
    shutter.classList.add('is-closed', 'is-persistent')
    // 스냅샷을 먼저 해제해야 syncShopShutterToRailCells()가 복원된 레인 기준으로 동작한다.
    this.shopShutterSnapshot = null
    this.syncShopShutterToRailCells()

    // 셔터가 닫힌 채 레일이 흔들리고, 그 직후 쿠궁하며 상승.
    // is-opening 추가 직전 is-persistent·is-closed를 제거해 CSS animation 충돌 방지.
    return new Promise((resolve) => {
      rail.classList.add('is-shop-quaking')
      window.setTimeout(() => rail.classList.remove('is-shop-quaking'), 520)
      window.setTimeout(() => {
        shutter.classList.remove('is-persistent', 'is-closed')
        shutter.classList.add('is-opening')
      }, 560)
      window.setTimeout(() => {
        this.shopShutterLocked = false
        this.shopShutterSnapshot = null
        shutter.remove()
        rail.classList.remove('is-shop-shuttered')
        resolve()
      }, 560 + 760)
    })
  }

  /** 새 런 시작 시 셔터 상태를 초기화한다. 보스전 중 게임오버 시 잠긴 상태가 잔류하는 걸 방지. */
  resetShutter(): void {
    this.host.jobSelect.clearJobSelectOverlay()
    this.host.jobSelect.jobFlightCard?.remove()
    this.host.jobSelect.jobFlightCard = null
    this.shopShutterLocked = false
    this.shopShutterSnapshot = null
    document.querySelector<HTMLElement>('#game-board .rail-shutter')?.remove()
    document.querySelector<HTMLElement>('#game-board .rail')?.classList.remove('is-shop-shuttered', 'is-shop-quaking')
  }

  /** Altar EXIT keeps the shutter closed and shakes the full rail before boss entry.
   *  The boss tile drops directly onto the shuttered rail in the new flow, so the
   *  quake is the only beat between shop exit and boss arrival. */
  async playAltarBossGateTransition(): Promise<void> {
    const rail = this.host.boardElement.querySelector<HTMLElement>('.rail')
    if (!rail) return
    rail.classList.add('is-shop-quaking')
    await new Promise((resolve) => window.setTimeout(resolve, 620))
    rail.classList.remove('is-shop-quaking')
  }

  /** 제단 무료 유물 단일 픽 연출: 비선택 카드가 먼저 사그라들고, 이후 선택 카드도 순차적으로 사라진다.
   *  버스트 없이 CSS fade만 사용해 조용한 연출을 유지한다. */
  async resolveAltarRelicPick(relicId: RelicId): Promise<void> {
    const cards = [
      ...(this.shopOverlayElement?.querySelectorAll<HTMLElement>(
        '.shop-relic-card[data-shop-buy-kind="relic"]'
      ) ?? []),
    ]
    if (cards.length === 0) return

    // 픽 순간 rect 캡처 — 애니메이션 전 원래 위치를 보존해 비행 연출 기준점으로 쓴다.
    const pickedCard = cards.find((c) => c.dataset.shopBuy === relicId) ?? null
    if (pickedCard) {
      this.altarPickedRelicRect = { relicId, rect: pickedCard.getBoundingClientRect() }
    }

    // 1단계: 비선택 카드 CSS 페이드(burst 없음).
    for (const card of cards) {
      if (card.dataset.shopBuy !== relicId) card.classList.add('is-altar-fading')
    }
    await new Promise<void>((resolve) => window.setTimeout(resolve, 340))

    // 2단계: 선택 카드도 순차적으로 사라진다.
    if (pickedCard) {
      pickedCard.classList.add('is-altar-fading')
      await new Promise<void>((resolve) => window.setTimeout(resolve, 280))
    }
  }

  /** Capture the clicked shop card before the board re-renders with the newly owned relic.
   *  제단 픽은 resolveAltarRelicPick에서 미리 캡처한 rect를 우선 사용한다(애니메이션 후 이동 보정). */
  prepareRelicArrivalFromShop(relicId: RelicId): void {
    if (this.altarPickedRelicRect?.relicId === relicId) {
      this.pendingRelicArrival = { relicId, rect: this.altarPickedRelicRect.rect }
      this.altarPickedRelicRect = null
      return
    }
    const source = this.shopOverlayElement?.querySelector<HTMLElement>(
      `.shop-relic-card[data-shop-buy="${relicId}"]`
    )
    this.pendingRelicArrival = source ? { relicId, rect: source.getBoundingClientRect() } : null
  }

  /** Fly a purchased relic card from the shop stall into its final fan slot. */
  animatePreparedRelicArrival(): Promise<void> {
    const pending = this.pendingRelicArrival
    this.pendingRelicArrival = null
    if (!pending) return Promise.resolve()
    const target = this.host.boardElement.querySelector<HTMLElement>(
      `.relic-mini-card[data-owned-relic="${pending.relicId}"]`
    )
    if (!target) return Promise.resolve()
    const targetRect = target.getBoundingClientRect()
    const clone = document.createElement('div')
    clone.className = 'relic-arrival-clone'
    clone.style.left = `${pending.rect.left}px`
    clone.style.top = `${pending.rect.top}px`
    clone.style.width = `${pending.rect.width}px`
    clone.style.height = `${pending.rect.height}px`
    clone.innerHTML = this.host.faces.relicPreviewFace(pending.relicId)
    document.body.appendChild(clone)
    target.classList.add('is-arriving')
    // Hide the real destination until the clone snaps into place, then pop it
    // back with the same card-draw shadow language as hover.
    const dx = targetRect.left - pending.rect.left
    const dy = targetRect.top - pending.rect.top
    const sx = targetRect.width / Math.max(1, pending.rect.width)
    const sy = targetRect.height / Math.max(1, pending.rect.height)
    return new Promise((resolve) => {
      const anim = clone.animate(
        [
          { transform: 'translate(0, 0) scale(1)', opacity: 1, filter: 'brightness(1.15)' },
          {
            transform: `translate(${dx * 0.72}px, ${dy - 38}px) scale(${(sx + sy) / 2 + 0.05})`,
            opacity: 1,
            filter: 'brightness(1.38)',
          },
          {
            transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`,
            opacity: 1,
            filter: 'brightness(1)',
          },
        ],
        { duration: 560, easing: 'cubic-bezier(0.18, 0.86, 0.22, 1)', fill: 'forwards' }
      )
      anim.onfinish = () => {
        clone.remove()
        target.classList.remove('is-arriving')
        target.classList.add('is-arrival-settling')
        window.setTimeout(() => target.classList.remove('is-arrival-settling'), 520)
        SquareBurst.playOn(target, 'score', { count: 18, spread: 90, duration: 620 })
        resolve()
      }
      anim.oncancel = () => {
        clone.remove()
        target.classList.remove('is-arriving')
        resolve()
      }
    })
  }

  /** 팩 구매 시 불빛 패널 → 팩 타일 트레일 (fire-and-forget).
   *  팩 피커가 곧바로 열리기 전 비용 시각화 — await 없이 배경에서 재생된다. */
  fireScoreSpendTrailToTarget(target: HTMLElement | null, cost: number): void {
    if (!target) return
    void this.host.trails.animateResourceTrail(
      this.host.trails.findScorePulseAnchor(),
      target,
      Math.min(8, Math.max(1, Math.ceil(cost / 300))),
      'score'
    )
  }

  /** Spend-light purchase trail: the blast starts on the 불빛 counter and
   *  lands on the clicked relic card before the shop refreshes its state. */
  animateShopPurchaseTrailToRelic(relicId: RelicId, count: number): Promise<void> {
    const target = document.querySelector<HTMLElement>(
      `#shop-overlay .shop-relic-card[data-shop-buy="${relicId}"]`
    )
    return this.host.trails.animateResourceTrail(this.host.trails.findScorePulseAnchor(), target, count, 'score')
  }

  /** 팩 피커 리롤 버튼 클릭 피드백: 화폐 패널 → 버튼 트레일 + 버튼 임팩트 burst.
   *  유물 리롤(playShopRerollFeedback)과 같은 흐름으로 트레일이 끝난 뒤 카드를 교체한다. */
  async playPackRerollFeedback(cost: number): Promise<void> {
    const btn = document.querySelector<HTMLElement>('.shop-pack-picker-reroll-btn')
    if (!btn) return
    await this.host.trails.animateResourceTrail(
      this.host.trails.findCoinPulseAnchor(),
      btn,
      Math.max(1, Math.min(6, cost)),
      'score'
    )
    btn.classList.remove('is-pack-reroll-impacted')
    void btn.offsetWidth
    btn.classList.add('is-pack-reroll-impacted')
    window.setTimeout(() => btn.classList.remove('is-pack-reroll-impacted'), 380)
    SquareBurst.playOn(btn, 'score', { count: 12, spread: 58, duration: 360 })
  }

  
  /** Consume a free card tile and route its blast to the matching HUD target.
   *  `amount` is the real reward value from gameplay; huge values such as ✦300
   *  are compressed into readable launch chunks inside freeRewardTrailCount(). */
  async consumeFreeCardAndRouteReward(
    kind: 'free-card' | 'free-coin-card',
    target: ResourceTrailTarget,
    amount: number,
    theme: BurstTheme = 'score'
  ): Promise<void> {
    const card = document.querySelector<HTMLElement>(`#shop-overlay .shop-free-card[data-shop-buy-kind="${kind}"]`)
    if (!card) return
    await this.playShopPurchaseImpact(card, 'score')
    await this.host.trails.animateResourceTrail(card, this.host.trails.findResourceTrailTarget(target), this.freeRewardTrailCount(target, amount), theme)
    // 무료 카드 소모는 선택 순간 "사라짐"이 읽히도록 약간 긴 퇴장 타이밍을 사용한다.
    card.classList.add('is-consumed')
    window.setTimeout(() => card.remove(), 420)
  }

  /** Convert actual reward numbers into trail launches without losing meaning.
   *  Score rewards are displayed in 100-light chunks so ✦300 becomes three trails;
   *  small HUD resources use their exact amount, capped only as a safety valve. */
  private freeRewardTrailCount(target: ResourceTrailTarget, amount: number): number {
    const safeAmount = Math.max(1, Math.floor(amount))
    if (target === 'score') return Math.max(1, Math.ceil(safeAmount / 100))
    return Math.min(12, safeAmount)
  }

  /** Shop reroll FX: wallet blast -> reroll impact -> instant content swap.
   *  We intentionally removed flip/fade phases so cards never disappear or
   *  go transparent during reroll; only a vivid burst sells the replacement. */
  async playShopRerollFeedback(
    cost: number,
    nextOffers: ShopOfferView[],
    score: number,
    character: Character
  ): Promise<void> {
    const reroll = document.querySelector<HTMLElement>('#shop-overlay .shop-reroll-btn')
    if (!reroll) return
    // 진행 중임을 DOM에도 남겨 빠른 연타/터치 반복이 시각적으로 막힌다.
    reroll.classList.add('is-reroll-locked')
    await this.host.trails.animateResourceTrail(
      this.host.trails.findCoinPulseAnchor(),
      reroll,
      Math.max(1, Math.min(6, cost)),
      'score'
    )
    SquareBurst.playOn(reroll, 'score', { count: 14, spread: 60, duration: 380 })
    reroll.classList.remove('is-reroll-impacted')
    void reroll.offsetWidth
    reroll.classList.add('is-reroll-impacted')
    // 임팩트 클래스 정리는 직후 호출되는 openShop → refreshOpenShopInPlace가 담당한다.

    // Only relic slots reroll — free/pack inventory stays fixed.
    const allCards = Array.from(
      document.querySelectorAll<HTMLElement>(
        '#shop-overlay .shop-artifact-layer .shop-relic-card[data-shop-buy-kind="relic"]'
      )
    )
    const swaps: Promise<void>[] = []
    let swapIndex = 0
    allCards.forEach((card, idx) => {
      const offer = nextOffers[idx]
      if (!offer) return
      // Purchased slots are already burned out — keep them as fixed empty slots.
      if (card.classList.contains('is-purchased')) return
      const delay = swapIndex * 70
      swapIndex += 1
      swaps.push(
        new Promise<void>((resolve) => {
          window.setTimeout(() => {
            this.applyShopRelicContent(card, offer, score, character)
            // Per-card burst keeps the reroll read flashy even without flip.
            SquareBurst.playOn(card, 'score', { count: 16, spread: 86, duration: 460 })
            card.classList.remove('is-reroll-impacted')
            void card.offsetWidth
            card.classList.add('is-reroll-impacted')
            window.setTimeout(() => card.classList.remove('is-reroll-impacted'), 260)
            resolve()
          }, delay)
        })
      )
    })
    await Promise.all(swaps)
    // Capstone burst once all replacement cards are set.
    const layer = document.querySelector<HTMLElement>('#shop-overlay .shop-artifact-layer')
    if (layer) SquareBurst.playOn(layer, 'score', { count: 34, spread: 160, duration: 620 })
  }

  /** Swap a single shop relic card's visible content in place. Used during the
   *  reroll mid-flip beat so the card finishes its turn already showing the
   *  new offer. Touches data attributes, classes, art, copy, and price label
   *  without rebuilding the DOM node. */
  private applyShopRelicContent(
    card: HTMLElement,
    offer: ShopOfferView,
    score: number,
    _character: Character
  ): void {
    const def = RELIC_DEFINITIONS[offer.relicId]
    card.dataset.shopBuy = def.id
    card.setAttribute(
      'aria-label',
      `${def.name} — ${offer.purchased ? '구매 완료' : `불빛 ${offer.price}`}`
    )
    // Swap the rarity glow class to match the new relic.
    const RARITY_CLASSES: readonly string[] = [
      RARITY_CLASS_BY_TIER.common,
      RARITY_CLASS_BY_TIER.rare,
      RARITY_CLASS_BY_TIER.epic,
      RARITY_CLASS_BY_TIER.unique,
      RARITY_CLASS_BY_TIER.legendary,
    ]
    for (const cls of RARITY_CLASSES) card.classList.remove(cls)
    card.classList.add(RARITY_CLASS_BY_TIER[getRelicDef(offer.relicId).rarity])
    // Affordability vs current score (purchased stays purchased — unreachable here).
    card.classList.remove('is-affordable', 'is-unaffordable', 'is-purchased')
    card.classList.add(this.shopRelicAffordabilityClass(offer, score))
    const art = card.querySelector<HTMLElement>('.shop-relic-art')
    if (art) art.style.backgroundImage = `url('${spriteForRelic(def.id)}')`
    const title = card.querySelector<HTMLElement>('.shop-relic-title')
    if (title) title.textContent = def.name
    const effect = card.querySelector<HTMLElement>('.shop-relic-effect')
    if (effect) effect.innerHTML = this.host.faces.relicEffectHtml(this.host.faces.relicDynamicEffect(def.id, def.effect, false), def.spawnEffect, this.host.getSpawnWeightCtx(), false)
    const flavor = card.querySelector<HTMLElement>('.shop-relic-flavor')
    if (flavor) flavor.textContent = def.flavor
    const label = card.querySelector<HTMLElement>('.shop-price-label-text')
    if (label)
      label.textContent = offer.purchased ? '구매 완료' : `${offer.price.toLocaleString()}`
  }
}
