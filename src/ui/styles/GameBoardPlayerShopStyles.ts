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

/* ---------- Shop shutter (보자기) + modal ---------- */
.rail.is-shop-quaking {
  animation: shop-rail-quake 0.52s cubic-bezier(0.18, 0.9, 0.24, 1);
}
/* New shutter behavior: a single 보자기-style cloth panel unfurls top-down
   in one motion, replacing the previous 9 individual wax drapes. The cloth
   is semi-transparent black with a subtle woven texture so the rail
   underneath shows just enough to remind the player "the run is paused,
   but still there".  All inner span panels are hidden — kept around only
   so existing shutter-build code doesn't break. */
.rail-shutter {
  position: absolute;
  inset: 0;
  z-index: 35;
  pointer-events: none;
  background:
    repeating-linear-gradient(
      135deg,
      rgba(255, 232, 168, 0.04) 0 6px,
      rgba(0, 0, 0, 0.16) 6px 12px
    ),
    linear-gradient(180deg, rgba(8, 5, 14, 0.78) 0%, rgba(4, 2, 8, 0.92) 100%);
  border-bottom: 1px solid rgba(255, 215, 120, 0.18);
  box-shadow: inset 0 -22px 40px rgba(0, 0, 0, 0.5);
  transform: scaleY(0);
  transform-origin: top;
  animation: shop-cloth-unfurl 0.58s cubic-bezier(0.18, 0.86, 0.22, 1) forwards;
}
.rail-shutter span {
  /* The old per-panel drapes are replaced by a single cloth; legacy spans
     are kept for backward compat but hidden so they don't render. */
  display: none;
}
.rail-shutter.is-closed {
  transform: scaleY(1);
}
.rail-shutter.is-persistent {
  /* Purchase renders recreate the rail while the shop is open. Lock the
     already-unfurled cloth in place instead of replaying the drop. */
  animation: none;
  transform: scaleY(1);
}
.rail-shutter.is-opening {
  animation: shop-cloth-furl 0.42s cubic-bezier(0.42, 0, 0.24, 1) forwards;
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
  padding: clamp(14px, 1.6vh, 22px) clamp(12px, 1.4vw, 18px) clamp(18px, 2.2vh, 26px);
  display: grid;
  grid-template-rows: 1fr 1fr;
  gap: clamp(10px, 1.4vh, 16px);
  align-items: stretch;
  overflow: visible;
  animation: shop-overlay-in 0.32s cubic-bezier(0.18, 0.86, 0.22, 1);
}
/* The 보자기 cloth backdrop lives in .rail-shutter (single cloth panel,
   styled above). The shop-shell itself stays transparent; the layers
   provide their own subtle dark backgrounds on top of that cloth. */

/* Layered shop layout:
   - Top : artifact layer (8) + reroll zone (2)
   - Bottom: free-card layer (3) + pack layer (7)
   Each layer is a subtle dark "tray" without a border so the contents read as
   loosely placed objects, not as a boxed-up grid cell.  Cards/buttons inside
   keep fixed sizes — the layers absorb the slack. */
.shop-row {
  position: relative;
  z-index: 1;
  display: grid;
  gap: clamp(10px, 1.4vw, 18px);
  align-items: stretch;
  min-height: 0;
}
.shop-top-row    { grid-template-columns: 8fr 2fr; }
.shop-bottom-row { grid-template-columns: 3fr 7fr; }

.shop-layer {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: clamp(8px, 1.2vw, 16px);
  padding: clamp(8px, 1.2vh, 14px) clamp(10px, 1.4vw, 18px);
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.34);
  box-shadow: inset 0 0 24px rgba(0, 0, 0, 0.45);
  min-height: 0;
  overflow: visible;
}
.shop-artifact-layer {
  justify-content: space-around;
  gap: clamp(10px, 1.6vw, 22px);
  padding-left: clamp(14px, 2vw, 26px);
  padding-right: clamp(14px, 2vw, 26px);
}
.shop-pack-layer {
  justify-content: space-around;
  gap: clamp(10px, 1.4vw, 20px);
}
.shop-free-layer,
.shop-reroll-zone {
  /* Free-card and reroll layers center their single child. */
  justify-content: center;
}

/* Reroll button — compact rectangle, fixed size, paid in 화폐(coins). Lives in
   the small top-right layer.  Carved-wood frame matches the existing buy/EXIT
   button family so it reads as "control" rather than a card. */
.shop-reroll-btn {
  appearance: none;
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: clamp(96px, 11vw, 130px);
  height: clamp(64px, 8vh, 86px);
  padding: 6px 12px;
  border: 2px solid rgba(28, 14, 6, 0.92);
  border-radius: 6px;
  background:
    linear-gradient(180deg, rgba(120, 76, 36, 0.96), rgba(58, 30, 14, 0.96)),
    repeating-linear-gradient(135deg, rgba(0, 0, 0, 0.06) 0 2px, rgba(255, 232, 168, 0.04) 2px 5px);
  color: rgba(255, 232, 168, 0.96);
  font-family: inherit;
  font-weight: 900;
  letter-spacing: 0.04em;
  cursor: pointer;
  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.85);
  box-shadow:
    inset 0 1px 0 rgba(255, 232, 168, 0.3),
    inset 0 -3px 6px rgba(0, 0, 0, 0.55),
    0 6px 14px rgba(0, 0, 0, 0.55);
  transition: transform 0.16s ease, box-shadow 0.16s ease, filter 0.16s ease;
}
.shop-reroll-btn:hover {
  transform: translateY(-1px);
  filter: brightness(1.1);
  box-shadow:
    inset 0 1px 0 rgba(255, 232, 168, 0.5),
    inset 0 -3px 6px rgba(0, 0, 0, 0.6),
    0 8px 18px rgba(0, 0, 0, 0.65),
    0 0 16px rgba(244, 164, 96, 0.35);
}
.shop-reroll-btn-label { font-size: 13px; }
.shop-reroll-btn-cost {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-variant-numeric: tabular-nums;
}
.shop-reroll-btn-cost-icon {
  display: inline-flex;
  width: 14px;
  height: 14px;
  color: #ffd778;
}
.shop-reroll-btn-cost-icon .icon { width: 100%; height: 100%; }
.shop-reroll-btn-cost-text { font-size: 13px; }
.shop-reroll-btn.is-unaffordable {
  filter: saturate(0.7) brightness(0.78);
  cursor: not-allowed;
}
.shop-reroll-btn.is-unaffordable .shop-reroll-btn-cost-icon { color: rgba(255, 197, 181, 0.6); }
.shop-reroll-btn.is-affordable { border-color: rgba(122, 202, 113, 0.7); }

/* Free-card tile gets a warm candle-glow art band. */
.shop-free-card .shop-free-art {
  background:
    radial-gradient(ellipse 60% 80% at 50% 60%, rgba(255, 232, 168, 0.55), transparent 70%),
    radial-gradient(circle at 50% 30%, rgba(255, 188, 96, 0.32), transparent 60%),
    linear-gradient(180deg, rgba(48, 31, 43, 0.92), rgba(18, 12, 24, 0.96));
}

/* Pack tile — FULL illustration with centered title/effect overlay. This is
   intentionally NOT the relic-card art+body split: the pack reads as a
   single illustrated envelope, not a card with a separate text panel. */
.shop-pack-card {
  position: relative;
  flex: 0 0 auto;
  width: clamp(110px, 10.5vw, 158px);
  aspect-ratio: 3 / 4;
  border-radius: 14px;
  border: 1px solid rgba(255, 215, 120, 0.4);
  overflow: visible;
  cursor: pointer;
  box-shadow:
    inset 0 1px 0 rgba(255, 232, 168, 0.18),
    0 14px 26px rgba(0, 0, 0, 0.6);
  transform-origin: center bottom;
  transition: transform 0.22s cubic-bezier(0.18, 0.86, 0.22, 1), box-shadow 0.22s ease;
  animation:
    shop-card-enter 0.5s cubic-bezier(0.18, 0.86, 0.22, 1) both,
    shop-pack-drift 4.6s ease-in-out 0.55s infinite alternate;
}
.shop-pack-layer > .shop-pack-card:nth-child(1) { animation-delay: 100ms, 0.6s; }
.shop-pack-layer > .shop-pack-card:nth-child(2) { animation-delay: 200ms, 1s; }
.shop-pack-layer > .shop-pack-card:nth-child(3) { animation-delay: 300ms, 1.4s; }
.shop-pack-card:hover,
.shop-pack-card:focus-visible {
  transform: translateY(-2px) scale(1.05);
  box-shadow:
    inset 0 1px 0 rgba(255, 232, 168, 0.32),
    0 20px 38px rgba(0, 0, 0, 0.7),
    0 0 28px rgba(244, 164, 96, 0.4);
  z-index: 6;
}
.shop-pack-card.is-unaffordable {
  filter: saturate(0.82) brightness(0.84);
  border-color: rgba(166, 62, 58, 0.5);
}
.shop-pack-illustration {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background-position: center;
  background-size: cover;
  pointer-events: none;
}
.shop-pack-illustration::after {
  /* Wax-stamp dot near the upper-third of the illustration so each pack
     reads as a sealed envelope rather than a blank tile. */
  content: '';
  position: absolute;
  top: 22%;
  left: 50%;
  width: 30%;
  aspect-ratio: 1;
  border-radius: 50%;
  transform: translateX(-50%);
  background: radial-gradient(circle at 35% 30%, #ffd778, #c44a1c 65%, #58140c 100%);
  box-shadow: 0 0 16px rgba(255, 188, 96, 0.55);
  opacity: 0.92;
}
.shop-pack-overlay {
  position: absolute;
  inset: 0;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  padding: clamp(8px, 1vw, 14px);
  text-align: center;
  background: linear-gradient(180deg, transparent 35%, rgba(0, 0, 0, 0.78) 100%);
  border-radius: inherit;
  pointer-events: none;
}
.shop-pack-title {
  margin: 0;
  color: rgba(255, 244, 210, 0.98);
  font-size: var(--font-size-base);
  font-weight: 900;
  letter-spacing: 0.03em;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9);
}
.shop-pack-effect {
  margin: 4px 0 0;
  color: rgba(255, 244, 210, 0.86);
  font-size: var(--font-size-sm);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.85);
}
.shop-pack-price {
  bottom: -10px;
}
.pack-theme-resource .shop-pack-illustration {
  background-image:
    radial-gradient(circle at 50% 60%, rgba(176, 230, 152, 0.4), transparent 60%),
    linear-gradient(170deg, rgba(40, 70, 38, 0.95) 0%, rgba(12, 30, 18, 0.98) 100%);
}
.pack-theme-upgrade .shop-pack-illustration {
  background-image:
    radial-gradient(circle at 50% 60%, rgba(255, 188, 96, 0.42), transparent 60%),
    linear-gradient(170deg, rgba(96, 44, 24, 0.95) 0%, rgba(30, 14, 12, 0.98) 100%);
}
.pack-theme-unlock .shop-pack-illustration {
  background-image:
    radial-gradient(circle at 50% 60%, rgba(196, 158, 240, 0.4), transparent 60%),
    linear-gradient(170deg, rgba(58, 36, 88, 0.95) 0%, rgba(20, 12, 36, 0.98) 100%);
}
.shop-pack-card.pack-theme-resource { border-color: rgba(146, 220, 138, 0.5); }
.shop-pack-card.pack-theme-upgrade { border-color: rgba(244, 164, 96, 0.55); }
.shop-pack-card.pack-theme-unlock { border-color: rgba(180, 142, 230, 0.55); }

/* Pack-picker overlay: a half-screen modal on top of the shop shell showing
   the 3 candidate cards. Background dims the shop slightly. */
.shop-pack-picker {
  position: absolute;
  inset: 0;
  z-index: 9;
  display: none;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}
.shop-pack-picker.is-open {
  display: flex;
  pointer-events: auto;
  background: radial-gradient(ellipse at 50% 50%, rgba(10, 6, 14, 0.68), rgba(4, 2, 8, 0.88));
  backdrop-filter: blur(2px);
  animation: shop-overlay-in 0.22s ease;
}
.shop-pack-picker-shell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 18px;
  max-width: 92%;
}
.shop-pack-picker-head {
  text-align: center;
  color: rgba(255, 232, 168, 0.96);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.85);
}
.shop-pack-picker-head h2 {
  margin: 0;
  font-size: 18px;
  letter-spacing: 0.08em;
  font-weight: 900;
}
.shop-pack-picker-head p {
  margin: 4px 0 0;
  color: rgba(232, 214, 180, 0.82);
  font-size: 13px;
}
.shop-pack-picker-cards {
  display: grid;
  grid-template-columns: repeat(3, minmax(140px, 200px));
  gap: clamp(10px, 1.4vw, 18px);
}
.shop-pack-pick-card {
  position: relative;
  border-radius: 14px;
  border: 1px solid rgba(255, 215, 120, 0.5);
  background: linear-gradient(180deg, rgba(45, 30, 39, 0.98), rgba(18, 12, 24, 0.98));
  box-shadow:
    inset 0 1px 0 rgba(255, 232, 168, 0.22),
    0 14px 28px rgba(0, 0, 0, 0.65);
  padding: 14px 12px 16px;
  min-height: 160px;
  cursor: pointer;
  transform-origin: center bottom;
  transition: transform 0.18s ease, box-shadow 0.18s ease;
  animation: shop-pack-pick-in 0.4s cubic-bezier(0.18, 0.86, 0.22, 1) backwards;
  animation-delay: calc(var(--pick-i, 0) * 80ms);
}
.shop-pack-pick-card:hover,
.shop-pack-pick-card:focus-visible {
  transform: translateY(-3px) scale(1.04);
  box-shadow:
    inset 0 1px 0 rgba(255, 232, 168, 0.32),
    0 18px 36px rgba(0, 0, 0, 0.7),
    0 0 28px rgba(244, 164, 96, 0.4);
}
.shop-pack-pick-card.pack-theme-resource { border-color: rgba(146, 220, 138, 0.62); }
.shop-pack-pick-card.pack-theme-upgrade { border-color: rgba(244, 164, 96, 0.62); }
.shop-pack-pick-card.pack-theme-unlock { border-color: rgba(180, 142, 230, 0.62); }
@keyframes shop-pack-pick-in {
  0% { transform: translateY(-40%) scale(0.86); opacity: 0; }
  72% { transform: translateY(6px) scale(1.02); opacity: 1; }
  100% { transform: translateY(0) scale(1); opacity: 1; }
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
  /* Fixed dimensions — the surrounding layer absorbs any extra space, so the
     cards always read as the same physical objects regardless of layer width. */
  flex: 0 0 auto;
  width: clamp(110px, 10.5vw, 158px);
  aspect-ratio: 3 / 4;
  height: auto;
  min-height: 0;
  cursor: pointer;
  transform-origin: center bottom;
  transition: transform 0.22s cubic-bezier(0.18, 0.86, 0.22, 1),
              box-shadow 0.22s ease;
  /* Two animations: enter (one-shot drop-in) then float (idle sway). Float
     waits ~0.55s so it doesn't clobber the drop-in transform during the
     first half-second. Per-card animation-delay below desyncs the float so
     the row doesn't sway in lock-step. */
  animation:
    shop-card-enter 0.5s cubic-bezier(0.18, 0.86, 0.22, 1) both,
    shop-card-float 5.4s ease-in-out 0.55s infinite alternate;
}
.shop-artifact-layer > .shop-relic-card:nth-child(1) { animation-delay: 60ms, 0.55s; }
.shop-artifact-layer > .shop-relic-card:nth-child(2) { animation-delay: 160ms, 0.95s; }
.shop-artifact-layer > .shop-relic-card:nth-child(3) { animation-delay: 260ms, 1.4s; }
@keyframes shop-card-enter {
  0%   { transform: translateY(-130%) scale(0.9); opacity: 0; }
  72%  { transform: translateY(8px) scale(1.02); opacity: 1; }
  100% { transform: translateY(0) scale(1); opacity: 1; }
}
/* Idle side-to-side drift for the artifact cards — they should feel like
   they were tossed onto the cloth, rocking gently rather than locked to a
   grid cell.  Per-card initial transform sets the rest pose; the keyframes
   only nudge a few px on each side. */
@keyframes shop-card-float {
  0%   { transform: translate(-3px, 0) rotate(-1.6deg); }
  50%  { transform: translate(4px, -2px) rotate(0.8deg); }
  100% { transform: translate(-2px, 1px) rotate(-0.4deg); }
}
@keyframes shop-pack-drift {
  0%   { transform: translateY(0) rotate(-0.6deg); }
  50%  { transform: translateY(-3px) rotate(0.4deg); }
  100% { transform: translateY(0) rotate(-0.2deg); }
}
@keyframes shop-cloth-unfurl {
  0%   { transform: scaleY(0); opacity: 0.6; }
  100% { transform: scaleY(1); opacity: 1; }
}
@keyframes shop-cloth-furl {
  0%   { transform: scaleY(1); opacity: 1; }
  100% { transform: scaleY(0); opacity: 0; }
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
  animation: shop-card-burnout 0.42s ease forwards;
}
@keyframes shop-card-burnout {
  0% { opacity: 1; clip-path: inset(0 0 0 0); }
  100% { opacity: 0; clip-path: inset(100% 0 0 0); }
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
.shop-shell.is-closing .shop-relic-card,
.shop-shell.is-closing .shop-pack-card {
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
  .shop-top-row,
  .shop-bottom-row { grid-template-columns: 1fr; }
  .shop-artifact-layer,
  .shop-pack-layer { flex-wrap: wrap; }
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
