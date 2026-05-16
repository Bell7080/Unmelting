/**
 * Player shield, owned relics, relic activation, bomb, and spore visual state styling.
 * Split from GameBoardRenderer so renderer logic stays navigable.
 */
export const GAME_BOARD_PLAYER_RELIC_TRAP_STYLES = `
/* Flat shield chip — larger standalone shield sitting above the HP bar.
   It now shares the floating compendium button's warm parchment-gold icon
   family so the player utility icons read as one set. */
.player-shield-chip {
  display: inline-flex;
  align-items: center;
  align-self: flex-start;
  line-height: 1;
}
.player-shield-chip-icon {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  color: rgba(255, 232, 168, 0.88);
  filter:
    drop-shadow(0 2px 3px rgba(0, 0, 0, 0.72))
    drop-shadow(0 0 7px rgba(244, 164, 96, 0.28));
}
.player-shield-chip-icon .icon { width: 100%; height: 100%; }
.player-shield-chip-icon .icon path:first-child {
  /* Match the 도감 launcher fill while keeping the shield silhouette flat. */
  fill: rgba(255, 232, 168, 0.88);
}
.player-shield-chip-icon .icon path:not(:first-child) {
  color: rgba(255, 248, 224, 0.92);
}
.player-shield-chip-value {
  position: absolute;
  left: 50%;
  top: 52%;
  transform: translate(-50%, -50%);
  min-width: 1.2em;
  color: #2a1b14;
  font-size: 13px;
  font-weight: 1000;
  font-variant-numeric: tabular-nums;
  text-align: center;
  text-shadow:
    0 1px 0 rgba(255, 255, 255, 0.62),
    0 0 4px rgba(255, 248, 224, 0.7);
}
.player-shield-chip-value.is-capped {
  /* 99+ is intentionally smaller so the plus sign stays inside the shield. */
  font-size: 11px;
  letter-spacing: -0.04em;
}


.hp-column {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.damage-float {
  position: fixed;
  z-index: 240;
  pointer-events: none;
  /* Damage numbers use the same oxblood/ember family as SquareBurst damage,
     but bias the fill toward readable crimson so floating hits feel dangerous
     instead of looking like pale healing or treasure feedback. */
  color: #ff3f32;
  font-size: clamp(30px, 4.2vw, 58px);
  font-weight: 950;
  line-height: 1;
  letter-spacing: 0.02em;
  font-family: var(--font-family-display);
  text-shadow:
    0 2px 2px rgba(0, 0, 0, 0.96),
    0 0 8px rgba(255, 63, 50, 0.96),
    0 0 20px rgba(176, 28, 34, 0.9),
    0 0 34px rgba(244, 83, 49, 0.5);
  -webkit-text-stroke: 1px rgba(74, 8, 13, 0.86);
}


/* Restored codex scrolling while hovered recipe previews escape via the
   body-mounted .compendium-recipe-float clone rather than by disabling scroll. */
.compendium-modal {
  overflow: visible;
}
.compendium-body {
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 0;
}
.compendium-recipe-float {
  position: fixed;
  z-index: 270;
  pointer-events: none;
  margin: 0;
  transform: translateZ(0);
}
.compendium-recipe-float .compendium-recipe-mini {
  transform: translate(-50%, -50%) translateX(calc((var(--i, 0) - var(--recipe-center, 0)) * 66px)) rotate(calc((var(--i, 0) - var(--recipe-center, 0)) * 9deg));
  filter: brightness(1.08);
}
.compendium-relic-owned {
  border-color: rgba(255, 215, 120, 0.48);
  box-shadow: inset 0 1px 0 rgba(255, 232, 168, 0.12), 0 0 22px rgba(244, 164, 96, 0.18);
}
.compendium-relic-card .compendium-card-art--sprite,
.compendium-relic-owned .compendium-card-art--sprite {
  background-size: cover;
  background-position: center 20%;
  box-shadow: inset 0 -44px 54px rgba(13, 9, 19, 0.76);
}

/* Owned relics now match the player-card height and wrap vertically inside a
   warm themed scroll well instead of drifting sideways in a horizontal strip. */
.relic-layer {
  align-self: center;
  height: clamp(92px, 14vh, 140px);
  max-height: clamp(92px, 14vh, 140px);
  align-items: center;
  padding: 6px;
  overflow: visible;
}
.relic-stack {
  width: 100%;
  max-width: clamp(150px, 17vw, 200px);
  height: 100%;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(58px, 1fr));
  grid-auto-rows: minmax(76px, 1fr);
  align-content: start;
  gap: 7px;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 3px 5px 4px 2px;
  scrollbar-width: thin;
  scrollbar-color: rgba(244, 164, 96, 0.72) rgba(20, 16, 28, 0.5);
}
.relic-stack::-webkit-scrollbar { width: 5px; }
.relic-stack::-webkit-scrollbar-track {
  background: rgba(20, 16, 28, 0.48);
  border-radius: 999px;
  box-shadow: inset 0 0 0 1px rgba(255, 232, 168, 0.08);
}
.relic-stack::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: linear-gradient(180deg, var(--color-flame), var(--color-flame-deep));
  box-shadow: 0 0 8px rgba(244, 164, 96, 0.36);
}
.relic-mini-card {
  width: 100%;
  min-width: 0;
}
.relic-hover-preview {
  display: none;
  position: fixed;
  left: 0;
  top: 0;
  width: 190px;
  aspect-ratio: 0.72;
  opacity: 0;
  pointer-events: none;
  transform: translateY(-50%) translateX(-10px) rotateY(-88deg);
  transform-origin: left center;
  transform-style: preserve-3d;
  z-index: 120;
  filter: drop-shadow(0 16px 28px rgba(0, 0, 0, 0.72));
}
.relic-hover-preview.is-floating {
  display: block;
  animation: relic-preview-flip 0.62s cubic-bezier(0.16, 0.84, 0.2, 1) forwards;
}
.relic-hover-preview::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 2;
  border-radius: 14px;
  background: var(--hand-card-back) center / cover no-repeat;
  backface-visibility: hidden;
  transform: rotateY(0deg);
}
.relic-mini-card:hover .relic-hover-preview,
.relic-mini-card:focus-within .relic-hover-preview {
  display: block;
  animation: relic-preview-flip 0.62s cubic-bezier(0.16, 0.84, 0.2, 1) forwards;
}
.relic-hover-preview.is-floating::before,
.relic-mini-card:hover .relic-hover-preview::before,
.relic-mini-card:focus-within .relic-hover-preview::before {
  animation: relic-preview-back-flip 0.62s cubic-bezier(0.16, 0.84, 0.2, 1) forwards;
}
.relic-preview-card {
  min-height: 264px;
  border-color: rgba(255, 215, 120, 0.58);
  background:
    radial-gradient(circle at 50% 0%, rgba(255, 215, 120, 0.18), transparent 56%),
    linear-gradient(180deg, rgba(48, 34, 43, 0.99), rgba(13, 9, 19, 0.99));
}
.relic-preview-card .common-card-art {
  border-radius: 999px 999px 12px 12px;
  box-shadow:
    inset 0 -34px 46px rgba(13, 9, 19, 0.7),
    0 0 18px rgba(255, 215, 120, 0.16);
}
.relic-preview-card .common-card-badge {
  color: rgba(255, 232, 168, 0.96);
  border-color: rgba(255, 215, 120, 0.56);
  background: rgba(128, 77, 33, 0.28);
}
@keyframes relic-preview-flip {
  0% { opacity: 0; transform: translateY(-50%) translateX(-14px) rotateY(-92deg); }
  48% { opacity: 1; transform: translateY(-50%) translateX(-5px) rotateY(-28deg); }
  100% { opacity: 1; transform: translateY(-50%) translateX(0) rotateY(0deg); }
}
@keyframes relic-preview-back-flip {
  0%, 42% { opacity: 1; transform: rotateY(0deg); }
  76%, 100% { opacity: 0; transform: rotateY(102deg); }
}

/* Legacy .shop-modal/.shop-relic-card overrides removed — the in-rail shop
   shell handles its own background and the new compact card carries its
   own hover transform. */

/* Relic activations appear as a small toast-like line under the active chain. */
.chain-event-relic {
  flex-basis: 100%;
  justify-content: center;
  margin-top: -2px;
  font-size: clamp(13px, 1.3vw, 16px);
  color: rgba(255, 232, 168, 0.92);
  letter-spacing: 0.03em;
  text-shadow:
    0 1px 2px rgba(0, 0, 0, 0.94),
    0 0 14px rgba(244, 164, 96, 0.52);
}
.chain-event-relic .chain-event-mark {
  color: rgba(255, 215, 120, 0.96);
}
.chain-event-relic.is-new {
  animation: chain-card-pop 0.42s cubic-bezier(0.2, 1.4, 0.32, 1) 1;
}
.score-log-relic {
  box-shadow: inset 3px 0 0 rgba(255, 215, 120, 0.9);
  background: rgba(244, 164, 96, 0.09);
}
.score-log-relic .score-log-delta { color: rgba(255, 232, 168, 1); }

/* Bomb detonation: focal cell snaps outward as the fuse pops, while
   neighbouring cells rattle to sell the blast wave. Both animations stop
   short of yanking the cards off in one frame — the lingering rattle/fade
   gives the eye time to register what just happened. */
.cell.card.is-bomb-detonating {
  animation: bomb-detonate-pop 0.42s cubic-bezier(0.22, 0.84, 0.26, 1);
  z-index: 9;
}
@keyframes bomb-detonate-pop {
  0%   { transform: scale(1) rotate(0deg); filter: brightness(1) saturate(1); }
  18%  { transform: scale(1.16) rotate(-2deg); filter: brightness(1.6) saturate(1.4); }
  42%  { transform: scale(1.04) rotate(2.4deg); filter: brightness(1.32) saturate(1.2); }
  72%  { transform: scale(1.1) rotate(-1.2deg); filter: brightness(1.18) saturate(1.1); }
  100% { transform: scale(1) rotate(0deg); filter: brightness(1) saturate(1); }
}
.cell.card.is-bomb-rattled {
  animation: bomb-rattle 0.5s cubic-bezier(0.18, 0.86, 0.24, 1);
  z-index: 6;
}
@keyframes bomb-rattle {
  0%   { transform: translate(0, 0) rotate(0deg); }
  14%  { transform: translate(-3px, 2px) rotate(-1.4deg); }
  28%  { transform: translate(4px, -2px) rotate(1.2deg); }
  42%  { transform: translate(-3px, 3px) rotate(-0.9deg); }
  58%  { transform: translate(3px, -2px) rotate(0.8deg); }
  72%  { transform: translate(-2px, 1px) rotate(-0.5deg); }
  100% { transform: translate(0, 0) rotate(0deg); }
}

/* Lit bombs read as an ember fuse rather than an alarm light — the warmth
   stays on-theme while still feeling clearly dangerous. */
.cell.card.type-trap.trap-bomb.is-bomb-armed {
  animation: bomb-fuse-flicker 0.52s steps(2, end) infinite;
  border-color: rgba(244, 164, 96, 0.92);
}
.rail.is-shop-shuttered .cell.card.type-trap.trap-bomb.is-bomb-armed,
.rail.is-shop-shuttered .bomb-badge {
  /* Shutter pause is visual-only: no turn state resets, just no glow behind paper. */
  animation-play-state: paused;
  filter: none;
  box-shadow: var(--card-depth-shadow);
}
.rail.is-shop-shuttered .cell.card.type-trap.trap-bomb.is-bomb-armed .card-overlay {
  background:
    linear-gradient(180deg, rgba(20, 16, 28, 0.0) 38%, rgba(20, 16, 28, 0.55) 70%, rgba(10, 7, 18, 0.92) 100%);
}
.cell.card.type-trap.trap-bomb.is-bomb-armed .card-overlay {
  background:
    radial-gradient(circle at 50% 38%, rgba(255, 158, 64, 0.36), rgba(74, 22, 12, 0.5) 72%),
    linear-gradient(180deg, rgba(20, 16, 28, 0.0) 38%, rgba(20, 16, 28, 0.55) 70%, rgba(10, 7, 18, 0.92) 100%);
}
@keyframes bomb-fuse-flicker {
  0%, 100% { filter: saturate(1.08); box-shadow: var(--card-depth-shadow), 0 0 14px rgba(244, 164, 96, 0.42); }
  50% { filter: saturate(1.5) brightness(1.12); box-shadow: var(--card-depth-shadow), 0 0 26px rgba(255, 170, 80, 0.82); }
}
.spore-badge { border-color: rgba(147, 209, 118, 0.7); color: rgba(220, 255, 190, 0.95); }
.bomb-badge { border-color: rgba(255, 92, 72, 0.72); color: rgba(255, 214, 190, 0.98); }

/* Spore traps get a quiet moss-tinted overlay so their breeding state reads
   at a glance, similar to how 굳음 marks waxed cards but without competing
   with the bomb's red-orange fuse. */
.cell.card.type-trap.trap-spore .card-overlay {
  background:
    radial-gradient(circle at 50% 38%, rgba(135, 188, 96, 0.22), rgba(28, 36, 22, 0.42) 70%),
    linear-gradient(180deg, rgba(20, 16, 28, 0.0) 38%, rgba(20, 16, 28, 0.55) 70%, rgba(10, 7, 18, 0.92) 100%);
}
.cell.card.type-trap.trap-spore {
  border-color: rgba(147, 209, 118, 0.78);
}

`
