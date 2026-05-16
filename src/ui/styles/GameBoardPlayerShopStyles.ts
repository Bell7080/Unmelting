/**
 * Player zone, utility layers, shop shutter, relic shop cards, and responsive layout styling.
 * Split from GameBoardRenderer so renderer logic stays navigable.
 */
export const GAME_BOARD_PLAYER_SHOP_STYLES = `
/* ---------- Player Card + transparent utility layers ---------- */
.player-zone {
  display: grid;
  grid-template-columns: minmax(88px, 0.7fr) auto minmax(88px, 0.7fr);
  align-items: end;
  justify-items: center;
  gap: clamp(8px, 1.4vw, 18px);
  min-height: 0;
}
.utility-layer {
  width: 100%;
  min-height: clamp(92px, 14vh, 140px);
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 14px;
  background: rgba(8, 5, 14, 0.12);
  backdrop-filter: blur(1px);
}
.utility-layer-left {
  justify-content: flex-end;
  padding-right: clamp(4px, 0.8vw, 10px);
}
.relic-layer {
  justify-content: flex-start;
  padding-left: clamp(4px, 0.8vw, 10px);
  overflow: visible;
}
.relic-plan-label {
  max-width: 104px;
  color: rgba(255, 232, 168, 0.46);
  border: 1px dashed rgba(255, 232, 168, 0.18);
  border-radius: 999px;
  padding: 6px 9px;
  font-size: 12px;
  text-align: center;
  line-height: 1.2;
}
.relic-stack {
  display: flex;
  align-items: center;
  gap: 7px;
  max-width: clamp(120px, 16vw, 190px);
  overflow-x: auto;
  padding: 4px 2px 6px;
}
.relic-mini-card {
  flex: 0 0 clamp(58px, 5.4vw, 72px);
  aspect-ratio: 1;
  position: relative;
  overflow: visible;
  /* Wax-sealed pocket case: brass-rimmed parchment back with a subtle inner
     ring so each owned relic reads as a small artifact card rather than a
     screenshot thumbnail. */
  border-radius: 12px;
  border: 1px solid rgba(255, 215, 120, 0.5);
  background:
    radial-gradient(circle at 50% 18%, rgba(255, 232, 168, 0.26), transparent 50%),
    linear-gradient(160deg, rgba(44, 32, 40, 0.96), rgba(13, 9, 19, 0.96));
  box-shadow:
    inset 0 1px 0 rgba(255, 232, 168, 0.28),
    inset 0 0 0 1px rgba(74, 58, 42, 0.5),
    inset 0 -10px 18px rgba(0, 0, 0, 0.36),
    0 8px 18px rgba(0, 0, 0, 0.5);
  transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
}
.relic-mini-card:hover {
  transform: translateY(-1px);
  border-color: rgba(255, 232, 168, 0.82);
  box-shadow:
    inset 0 1px 0 rgba(255, 232, 168, 0.42),
    inset 0 0 0 1px rgba(120, 90, 60, 0.6),
    inset 0 -10px 18px rgba(0, 0, 0, 0.42),
    0 10px 22px rgba(0, 0, 0, 0.55),
    0 0 18px rgba(244, 164, 96, 0.28);
}
.relic-mini-art {
  position: absolute;
  inset: 5px;
  border-radius: 8px;
  background-size: cover;
  background-position: center 20%;
  filter: sepia(0.18) saturate(0.92) brightness(0.94);
}
.relic-mini-card::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  border-radius: inherit;
  background:
    linear-gradient(180deg, rgba(255, 232, 168, 0.22), transparent 36%, rgba(13, 9, 19, 0.42)),
    radial-gradient(circle at 50% 50%, transparent 56%, rgba(0, 0, 0, 0.42) 100%);
}
.player-row {
  display: flex;
  justify-content: center;
  align-items: end;
}

/* ---------- Shop shutter + modal ---------- */
.rail.is-shop-quaking {
  animation: shop-rail-quake 0.52s cubic-bezier(0.18, 0.9, 0.24, 1);
}
.rail-shutter {
  position: absolute;
  inset: 0;
  z-index: 35;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(3, 1fr);
  gap: clamp(7px, 1vw, 12px);
  padding: clamp(7px, 1vw, 12px);
  pointer-events: none;
}
/* Shutter panels read as candle-stained parchment drapes hanging from the
   rail header: warm wax flecks running diagonally, a slightly torn lower
   edge implied by a soft ember glow, and the upper hem caught in shadow.
   Each panel still slides in with its own short delay so the closure has
   the feel of paper drapes dropping one by one. */
.rail-shutter span {
  position: relative;
  border-radius: 8px 8px 14px 14px;
  background:
    radial-gradient(ellipse 80% 35% at 50% 100%, rgba(244, 164, 96, 0.32), transparent 70%),
    radial-gradient(circle at 18% 18%, rgba(0, 0, 0, 0.45), transparent 38%),
    repeating-linear-gradient(
      125deg,
      rgba(255, 232, 168, 0.08) 0 3px,
      rgba(0, 0, 0, 0.25) 3px 9px
    ),
    linear-gradient(180deg, rgba(120, 64, 28, 0.72) 0%, rgba(48, 24, 14, 0.92) 35%, rgba(20, 10, 14, 0.98) 100%);
  border: 1px solid rgba(180, 110, 52, 0.46);
  box-shadow:
    inset 0 1px 0 rgba(255, 232, 168, 0.18),
    inset 0 -10px 16px rgba(0, 0, 0, 0.55),
    0 10px 22px rgba(0, 0, 0, 0.6);
  transform: translateY(-120%) scaleY(0.82);
  transform-origin: top;
  animation: shop-shutter-drop 0.52s cubic-bezier(0.18, 0.86, 0.22, 1) forwards;
  animation-delay: calc(var(--shutter-i) * 36ms);
  overflow: hidden;
}
.rail-shutter span::before {
  /* Wax seal dot near the top centre of each drape — small candlelit accent
     that ties the shutter back to the rest of the wax/seal/parchment UI. */
  content: '';
  position: absolute;
  top: 4px;
  left: 50%;
  width: 8px;
  height: 8px;
  margin-left: -4px;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, #ffd778, #c44a1c 70%, #58140c 100%);
  box-shadow: 0 0 6px rgba(255, 188, 96, 0.55);
}
.rail-shutter span::after {
  /* Torn bottom hem hinted by a soft warm gradient bleeding off the panel. */
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: -4px;
  height: 8px;
  background: radial-gradient(ellipse 70% 90% at 50% 0%, rgba(244, 164, 96, 0.38), transparent 72%);
  pointer-events: none;
}
.rail-shutter.is-closed span {
  transform: translateY(0) scaleY(1);
}
.rail-shutter.is-persistent span {
  /* Purchase renders recreate the rail while the shop is open. Keep the
     already-closed shutter visually locked instead of replaying its drop. */
  animation: none;
  opacity: 1;
  transform: translateY(0) scaleY(1);
}
.rail-shutter.is-opening span {
  animation: shop-shutter-open 0.42s cubic-bezier(0.42, 0, 0.24, 1) forwards;
  animation-delay: calc(var(--shutter-i) * 18ms);
}
/* In-rail shop overlay. Body-mounted but pointer-transparent, so the score
   panel, hand panel and player card stay readable AND interactive for
   non-game actions (hover previews, compendium). The actual shop shell is
   re-anchored over the rail's bounding rect in JS. */
.shop-overlay {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: none;
  pointer-events: none;
  background: transparent;
}
.shop-overlay.is-open {
  display: block;
}
.shop-shell {
  position: fixed;
  pointer-events: auto;
  background: transparent;
  border: 0;
  box-shadow: none;
  /* No SHOP label any more, so the top padding shrinks to just enough
     room for the card drop-in arc + the flat price tag that hangs off
     the bottom. */
  padding: clamp(14px, 1.6vh, 22px) clamp(12px, 1.4vw, 18px) clamp(18px, 2.2vh, 26px);
  display: grid;
  grid-template-rows: 1fr;
  align-items: stretch;
  overflow: visible;
  animation: shop-overlay-in 0.32s cubic-bezier(0.18, 0.86, 0.22, 1);
}

/* SHOP stamp removed by player request — shop now identifies itself
   purely by the relic stalls + EXIT label. */

/* 3 relic cards across the rail, one card per lane. Cards drop in from
   above and on close bounce-down then swoosh-up in random order. */
.shop-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: clamp(8px, 1.4vw, 18px);
  align-items: stretch;
  height: 100%;
  width: 100%;
  padding: 0 6px;
  overflow: visible;
}

.shop-relic-card {
  position: relative;
  display: grid;
  grid-template-rows: 50% 1fr;
  overflow: visible; /* let the flat price tag poke past the bottom */
  border-radius: 14px;
  border: 1px solid rgba(255, 215, 120, 0.42);
  background: linear-gradient(180deg, rgba(45, 30, 39, 0.96), rgba(18, 12, 24, 0.96));
  box-shadow: inset 0 1px 0 rgba(255, 232, 168, 0.18), 0 12px 24px rgba(0, 0, 0, 0.55);
  height: 100%;
  min-height: 0;
  cursor: pointer;
  transform-origin: center bottom;
  transition: transform 0.22s cubic-bezier(0.18, 0.86, 0.22, 1),
              box-shadow 0.22s ease;
  /* Drop-in entrance animation when the shop opens. Each card uses a
     per-card stagger via --card-i. */
  animation: shop-card-enter 0.5s cubic-bezier(0.18, 0.86, 0.22, 1) backwards;
}
.shop-grid > .shop-relic-card:nth-child(1) { animation-delay: 60ms; }
.shop-grid > .shop-relic-card:nth-child(2) { animation-delay: 160ms; }
.shop-grid > .shop-relic-card:nth-child(3) { animation-delay: 260ms; }
.shop-shell.has-entered .shop-relic-card {
  /* Buying a card rebuilds the shop contents; this guard prevents that
     refresh from replaying the first-open drop animation. */
  animation: none;
}
@keyframes shop-card-enter {
  0%   { transform: translateY(-130%) scale(0.9); opacity: 0; }
  72%  { transform: translateY(8px) scale(1.02); opacity: 1; }
  100% { transform: translateY(0) scale(1); opacity: 1; }
}

/* Hover scale — clicking the grown card buys it. */
.shop-relic-card:hover,
.shop-relic-card:focus-visible {
  transform: scale(1.06) translateY(-2px);
  box-shadow: inset 0 1px 0 rgba(255, 232, 168, 0.32),
              0 18px 36px rgba(0, 0, 0, 0.65),
              0 0 30px rgba(244, 164, 96, 0.4);
  z-index: 6;
}
.shop-relic-card.is-affordable {
  border-color: rgba(122, 202, 113, 0.62);
  box-shadow:
    inset 0 1px 0 rgba(223, 255, 183, 0.22),
    0 12px 24px rgba(0, 0, 0, 0.55),
    0 0 20px rgba(78, 168, 82, 0.16);
}
.shop-relic-card.is-unaffordable {
  border-color: rgba(166, 62, 58, 0.58);
  filter: saturate(0.82) brightness(0.86);
}
.shop-relic-card.is-unaffordable .shop-relic-title,
.shop-relic-card.is-unaffordable .shop-relic-effect {
  color: rgba(202, 174, 158, 0.76);
}
.shop-relic-card.is-purchased {
  filter: saturate(0.55) brightness(0.72);
  pointer-events: none;
}
.shop-relic-art {
  min-height: 0;
  background-size: cover;
  background-position: center 18%;
  border-bottom: 1px solid rgba(255, 215, 120, 0.18);
  box-shadow: inset 0 -36px 46px rgba(13, 9, 19, 0.74);
  border-radius: 14px 14px 0 0;
}
.shop-relic-body {
  padding: 10px 12px 12px;
  display: grid;
  grid-template-rows: auto 1fr auto;
  gap: 6px;
  min-height: 0;
}
.shop-relic-title {
  margin: 0;
  color: rgba(255, 232, 168, 0.98);
  font-size: var(--font-size-base);
  font-weight: 900;
  letter-spacing: 0.02em;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.85);
}
.shop-relic-effect {
  margin: 0;
  color: rgba(255, 244, 210, 0.94);
  line-height: 1.32;
  font-size: var(--font-size-sm);
}
.shop-relic-flavor {
  margin: 0;
  color: rgba(232, 214, 180, 0.62);
  font-size: 11px;
  line-height: 1.3;
}

/* Flat shop price label: replaces the taped parchment with the shared tag
   icon language used by the rest of the UI chrome. */
.shop-price-label {
  position: absolute;
  bottom: -8px;
  left: 50%;
  transform: translateX(-50%);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 92px;
  justify-content: center;
  padding: 5px 12px 5px 9px;
  border-radius: 999px;
  border: 1px solid rgba(255, 215, 120, 0.38);
  background: linear-gradient(180deg, rgba(42, 31, 46, 0.96), rgba(20, 14, 28, 0.98));
  color: rgba(255, 232, 168, 0.96);
  font-weight: 900;
  font-size: 13px;
  letter-spacing: 0.04em;
  font-variant-numeric: tabular-nums;
  box-shadow:
    inset 0 1px 0 rgba(255, 232, 168, 0.14),
    0 8px 18px rgba(0, 0, 0, 0.5);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.88);
  z-index: 7;
  pointer-events: none;
}
.shop-price-label-icon {
  display: inline-flex;
  width: 15px;
  height: 15px;
  color: currentColor;
  filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.55));
}
.shop-price-label-icon .icon { width: 100%; height: 100%; }
.shop-relic-card.is-affordable .shop-price-label {
  border-color: rgba(132, 215, 112, 0.58);
  background: linear-gradient(180deg, rgba(35, 70, 38, 0.96), rgba(18, 38, 23, 0.98));
  color: rgba(224, 255, 190, 0.96);
}
.shop-relic-card.is-unaffordable .shop-price-label {
  border-color: rgba(166, 62, 58, 0.5);
  background: linear-gradient(180deg, rgba(88, 42, 42, 0.92), rgba(42, 20, 26, 0.96));
  color: rgba(255, 197, 181, 0.82);
}
.shop-relic-card.is-purchased .shop-price-label {
  border-color: rgba(154, 188, 132, 0.46);
  background: linear-gradient(180deg, rgba(53, 74, 48, 0.9), rgba(28, 42, 30, 0.94));
  color: rgba(216, 240, 198, 0.86);
}


/* Closing — bounce down then swoosh up in random per-card order. The
   per-card random delay is set inline as --card-leave-delay (0~240ms).
   EXIT button hides during the close so it doesn't linger over the
   leaving cards. */
.shop-shell.is-closing {
  overflow: hidden; /* clip the swoosh so cards don't pass over the candle gauge */
}
.shop-shell.is-closing .shop-close-btn { opacity: 0; pointer-events: none; transition: opacity 0.18s ease; }
.shop-shell.is-closing .shop-relic-card {
  pointer-events: none;
  animation:
    shop-card-bounce 0.22s cubic-bezier(0.2, 0.86, 0.22, 1) forwards,
    shop-card-swoosh 0.5s cubic-bezier(0.18, 0.86, 0.22, 1) forwards;
  animation-delay:
    0s,
    calc(220ms + var(--card-leave-delay, 0ms));
}
@keyframes shop-card-bounce {
  0%   { transform: translateY(0) scale(1); }
  60%  { transform: translateY(14px) scale(0.99); }
  100% { transform: translateY(8px) scale(1); }
}
@keyframes shop-card-swoosh {
  0%   { transform: translateY(8px) scale(1); opacity: 1; }
  100% { transform: translateY(-260%) scale(0.92); opacity: 0; }
}
/* Rugged carved-wood buy buttons: deep umber base, dark inset rim, warm
   ember type. Replaces the flat candle-pill button so the prices feel
   like they're stamped onto thick wood. */
.shop-buy-btn {
  appearance: none;
  border: 2px solid rgba(28, 14, 6, 0.92);
  border-radius: 4px;
  background:
    linear-gradient(180deg, rgba(120, 76, 36, 0.96), rgba(58, 30, 14, 0.96)),
    repeating-linear-gradient(135deg, rgba(0, 0, 0, 0.06) 0 2px, rgba(255, 232, 168, 0.04) 2px 5px);
  color: rgba(255, 232, 168, 0.96);
  font-family: inherit;
  font-weight: 900;
  font-size: 11px;
  cursor: pointer;
  padding: 4px 6px;
  box-shadow:
    inset 0 1px 0 rgba(255, 232, 168, 0.32),
    inset 0 -3px 6px rgba(0, 0, 0, 0.6),
    0 3px 8px rgba(0, 0, 0, 0.55);
  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.85);
  letter-spacing: 0.02em;
  transition: transform 0.16s ease, box-shadow 0.16s ease, filter 0.16s ease;
}
.shop-buy-btn:not(:disabled):hover {
  transform: translateY(-1px);
  filter: brightness(1.08);
  box-shadow:
    inset 0 1px 0 rgba(255, 232, 168, 0.5),
    inset 0 -3px 6px rgba(0, 0, 0, 0.6),
    0 5px 12px rgba(0, 0, 0, 0.65),
    0 0 14px rgba(244, 164, 96, 0.32);
}
.shop-buy-btn:disabled {
  cursor: not-allowed;
  opacity: 0.4;
  filter: grayscale(0.5);
}

/* EXIT label: rugged red wax tag perched on the bottom edge of the shop
   shell, drooping slightly into the player-card area so it reads as a
   "leave" sign nailed to the doorway. */
.shop-close-btn {
  position: absolute;
  bottom: -18px;
  right: clamp(10px, 1.8vw, 24px);
  z-index: 8;
  transform: rotate(-3deg);
  padding: 6px 18px;
  font-family: inherit;
  font-weight: 900;
  letter-spacing: 0.22em;
  font-size: 13px;
  color: #fff5dc;
  cursor: pointer;
  border-radius: 4px;
  border: 2px solid #220707;
  background:
    linear-gradient(180deg, rgba(180, 48, 36, 0.98), rgba(96, 16, 16, 0.98)),
    repeating-linear-gradient(125deg, rgba(0, 0, 0, 0.1) 0 2px, rgba(255, 80, 80, 0.05) 2px 6px);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.85);
  box-shadow:
    inset 0 1px 0 rgba(255, 200, 200, 0.32),
    inset 0 -3px 6px rgba(0, 0, 0, 0.55),
    0 8px 18px rgba(0, 0, 0, 0.55),
    0 0 24px rgba(176, 28, 28, 0.42);
  transition: transform 0.16s ease, filter 0.16s ease;
}
.shop-close-btn:hover {
  transform: rotate(-3deg) translateY(-1px);
  filter: brightness(1.08);
}
.shop-empty {
  grid-column: 1 / -1;
  min-height: 120px;
  display: grid;
  place-items: center;
  color: rgba(255, 232, 168, 0.72);
  border: 1px dashed rgba(255, 232, 168, 0.22);
  border-radius: 16px;
}
@keyframes shop-rail-quake {
  0%, 100% { transform: translate(0, 0) rotate(0); }
  16% { transform: translate(-8px, 3px) rotate(-0.55deg); }
  32% { transform: translate(7px, -4px) rotate(0.5deg); }
  48% { transform: translate(-5px, 4px) rotate(-0.35deg); }
  64% { transform: translate(4px, -2px) rotate(0.25deg); }
  80% { transform: translate(-2px, 1px) rotate(-0.12deg); }
}
@keyframes shop-shutter-drop {
  0% { transform: translateY(-120%) scaleY(0.82); opacity: 0.2; }
  82% { transform: translateY(5%) scaleY(1.04); opacity: 1; }
  100% { transform: translateY(0) scaleY(1); opacity: 1; }
}
@keyframes shop-shutter-open {
  0% { transform: translateY(0) scaleY(1); opacity: 1; }
  100% { transform: translateY(-120%) scaleY(0.78); opacity: 0; }
}
@keyframes shop-overlay-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
@media (max-width: 820px) {
  .shop-grid { grid-template-columns: 1fr; }
  .shop-relic-card { min-height: 360px; }
}

/* Player card mirrors the rail-card structure (sprite art → bottom dark
   gradient → content) so the player reads as the largest "card" on board. */
.player-card {
  position: relative;
  width: clamp(150px, 17vw, 200px);
  aspect-ratio: 3 / 4;
  border-radius: 14px;
  overflow: hidden;
  isolation: isolate;
  background: #14101c;
  border: 1px solid var(--color-flame-warm);
  box-shadow:
    inset 0 1px 0 rgba(255, 232, 168, 0.32),
    inset 0 -10px 22px rgba(0, 0, 0, 0.55),
    0 6px 14px rgba(0, 0, 0, 0.55),
    0 0 26px rgba(244, 164, 96, 0.28);
}

.player-art {
  position: absolute;
  inset: 0;
  background-size: cover;
  background-position: center 22%;
  background-repeat: no-repeat;
  filter: saturate(1.06) contrast(1.04);
  z-index: 0;
}

.player-overlay {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  background:
    linear-gradient(
      180deg,
      rgba(20, 16, 28, 0.0) 32%,
      rgba(20, 16, 28, 0.55) 65%,
      rgba(8, 5, 14, 0.94) 100%
    ),
    radial-gradient(
      120% 60% at 50% 0%,
      rgba(244, 164, 96, 0.1),
      transparent 70%
    );
}

.player-content {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  align-items: stretch;
  text-align: center;
  padding: 8px 10px 10px;
  gap: 6px;
}

.player-stats {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
  align-items: center;
}

.hp-bar {
  position: relative;
  height: 16px;
  background: rgba(0, 0, 0, 0.5);
  border: 1px solid var(--color-border-soft);
  border-radius: 999px;
  overflow: hidden;
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.6);
}
.hp-fill {
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, #c9472a, #f4a460);
  transition: width 0.3s ease;
  box-shadow: inset 0 1px 0 rgba(255, 215, 120, 0.4);
}
.hp-text {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  height: 100%;
  font-size: 12px;
  font-weight: 700;
  color: #fff5dc;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.85);
  font-variant-numeric: tabular-nums;
}
.hp-text-icon {
  display: inline-flex;
  align-items: center;
  color: #ffd5c5;
  font-size: 12px;
}

.atk-stat {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: var(--font-size-sm);
  font-weight: 700;
  color: var(--color-flame);
  padding: 3px 12px;
  border: 1px solid rgba(255, 215, 120, 0.35);
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.32);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.atk-stat-icon {
  display: inline-flex;
  align-items: center;
  color: var(--color-flame);
  font-size: 13px;
}

/* ---------- Hand panel — see the bottom of the file for the active
   10-slot stack styles. The old deckbuilder layout (.hand-cards, the
   transform-lift hover, etc.) was removed because it both duplicated and
   clipped the new layout's animations. */

@media (max-width: 960px) {
  .game-shell {
    grid-template-columns: minmax(200px, 240px) minmax(0, 1fr) minmax(140px, 180px);
  }
}

@media (max-width: 760px) {
  .game-shell {
    grid-template-columns: 1fr;
    grid-template-rows: auto minmax(0, 1fr) auto;
  }
  .left-panel { min-height: 0; }
  .hand-panel { grid-row: 3; }
}

@media (max-width: 480px) {
  .game-shell { padding-left: 6px; padding-right: 6px; }
  .card-name { font-size: 12px; }
}

@media (max-height: 600px) {
  .rail-row.dist-2 { opacity: 0.3; transform: scale(0.86); }
  .rail-row.dist-1 { opacity: 0.6; transform: scale(0.92); }
  .player-card { width: clamp(120px, 14vw, 160px); }
}

`
