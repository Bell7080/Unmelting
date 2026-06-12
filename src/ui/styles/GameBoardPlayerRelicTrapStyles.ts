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

.player-shield-chip.is-gone {
  opacity: 0;
  transform: translateY(-3px) scale(0.86);
  transition: opacity 0.18s ease, transform 0.18s ease;
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

/* ---------- 레바테인 연출 ----------
   턴 흐름(황금 숫자) · 화염 볼트 · 대형 피해 수치 · HP 롤링 틱. */

/* 플레이어 카드 위에 뜨는 황금 턴 흐름 숫자(외곽: 위치 고정 / 내부: 흔들림). */
.levatein-charge-mark {
  position: fixed;
  z-index: 248;
  pointer-events: none;
  transform: translate(-50%, -100%);
}
.levatein-charge-inner {
  display: inline-block;
  font-family: var(--font-family-display);
  font-size: clamp(40px, 5.4vw, 76px);
  font-weight: 950;
  line-height: 1;
  color: #ffe07a;
  text-shadow:
    0 2px 3px rgba(0, 0, 0, 0.92),
    0 0 10px rgba(255, 210, 90, 0.95),
    0 0 26px rgba(240, 170, 40, 0.72),
    0 0 46px rgba(200, 120, 20, 0.5);
  -webkit-text-stroke: 1px rgba(90, 50, 8, 0.7);
}
/* 등장 펄스(1회) 후 흔들림(무한)으로 이어진다. */
.levatein-charge-inner.is-pulsing {
  animation:
    levatein-mark-in 0.28s cubic-bezier(0.2, 0.9, 0.24, 1) backwards,
    levatein-mark-shake 0.46s ease-in-out 0.28s infinite;
}
.levatein-charge-inner.is-leaving {
  animation: levatein-mark-out 0.3s ease forwards;
}
@keyframes levatein-mark-in {
  0%   { opacity: 0; transform: scale(0.5) translateY(22px); }
  60%  { opacity: 1; transform: scale(1.22) translateY(-6px); }
  100% { opacity: 1; transform: scale(1) translateY(0); }
}
@keyframes levatein-mark-shake {
  0%, 100% { transform: translate(0, 0) rotate(-3.2deg); }
  25%      { transform: translate(-2px, -1px) rotate(2.6deg); }
  50%      { transform: translate(2px, 1px) rotate(-2deg); }
  75%      { transform: translate(-1px, 1px) rotate(3deg); }
}
@keyframes levatein-mark-out {
  0%   { opacity: 1; transform: scale(1) translateY(0); }
  100% { opacity: 0; transform: scale(1.4) translateY(-26px); }
}

/* 플레이어 → 적으로 날아가는 황금 화염 볼트(streak). */
.levatein-bolt {
  position: fixed;
  z-index: 246;
  pointer-events: none;
  width: 132px;
  height: 16px;
  border-radius: 9px;
  transform-origin: 50% 50%;
  background: linear-gradient(90deg,
    rgba(255, 160, 40, 0) 0%,
    rgba(255, 200, 80, 0.92) 42%,
    #fff3c0 72%,
    rgba(255, 255, 255, 0.96) 100%);
  box-shadow:
    0 0 18px rgba(255, 180, 60, 0.92),
    0 0 38px rgba(240, 140, 30, 0.7);
  filter: drop-shadow(0 0 9px rgba(255, 200, 90, 0.82));
}

/* 레바테인 대형 피해 수치 — 기본 damage-float보다 크고 황금빛이 강하다. */
.damage-float--levatein {
  color: #ffd24a;
  font-size: clamp(48px, 7.2vw, 104px);
  text-shadow:
    0 3px 4px rgba(0, 0, 0, 0.96),
    0 0 14px rgba(255, 210, 90, 0.96),
    0 0 30px rgba(240, 150, 40, 0.82),
    0 0 52px rgba(200, 110, 20, 0.6);
  -webkit-text-stroke: 1px rgba(86, 38, 6, 0.8);
}

/* HP 롤링 틱: 깎이는 동안 붉게 달아오르고, 한 칸 줄 때마다 톡 튄다. */
.stat.hp .stat-value.is-hp-draining {
  color: #ff6a4a;
}
.stat.hp .stat-value.is-hp-tick {
  animation: levatein-hp-tick 0.09s ease;
}
@keyframes levatein-hp-tick {
  0%   { transform: scale(1.34); filter: brightness(1.6); }
  100% { transform: scale(1); filter: brightness(1); }
}
.is-levatein-struck {
  z-index: 60;
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

/* Owned relics now sit as a transparent fan of full preview cards beside
   the player. There is intentionally no empty-state plate or label: with zero
   relics the right utility layer is not rendered at all. */
.relic-layer {
  /* Owned relics now start larger and sit a touch lower, so reading is
     possible before hover; hover is mostly for layer priority. */
  align-self: center;
  height: clamp(168px, 22vh, 232px);
  max-height: clamp(168px, 22vh, 232px);
  align-items: center;
  justify-content: center;
  padding: 0;
  overflow: visible;
  border-color: transparent;
  background: transparent;
  backdrop-filter: none;
}
.relic-stack {
  position: relative;
  width: clamp(194px, 21vw, 272px);
  height: 100%;
  overflow: visible;
  transform: translateY(16px);
  isolation: isolate;
}
.relic-mini-card {
  position: absolute;
  left: 50%;
  bottom: 4px;
  width: clamp(112px, 9.4vw, 148px);
  aspect-ratio: 0.72;
  min-width: 0;
  overflow: visible;
  border: 0;
  border-radius: 14px;
  background: transparent;
  box-shadow: none;
  cursor: pointer;
  transform-origin: 50% 112%;
  transform:
    translateX(calc(-50% + var(--relic-x, 0px) + var(--relic-extra-x, 0px)))
    translateY(var(--relic-y, 0px))
    rotate(var(--relic-rot, 0deg))
    scale(0.98);
  z-index: calc(10 + var(--relic-i, 0));
  transition:
    transform 0.36s cubic-bezier(0.18, 0.86, 0.22, 1),
    filter 0.28s ease;
}
/* 마우스 포커스 추적 중 transition을 짧게 줄여 빠른 마우스 움직임에 반응한다 */
.relic-stack.is-focus-tracked .relic-mini-card {
  transition:
    transform 0.14s ease,
    filter 0.28s ease;
}
.relic-mini-card .relic-preview-card {
  display: grid;
  grid-template-rows: 44% minmax(0, 1fr);
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  pointer-events: none;
  border-radius: 14px;
  /* 기본 테두리는 중립 톤 — 등급별 glow가 덮어쓴다. */
  border: 1px solid rgba(90, 80, 70, 0.35);
  background: linear-gradient(180deg, rgba(45, 30, 39, 0.96), rgba(18, 12, 24, 0.96));
  box-shadow:
    0 10px 18px rgba(0, 0, 0, 0.5),
    inset 0 1px 0 rgba(255, 232, 168, 0.18);
}
/* 등급별 테두리 + 발광 */
.relic-mini-card.rarity-common   .relic-preview-card { border-color: rgba(116, 124, 136, 0.45); box-shadow: 0 10px 18px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,232,168,0.18); }
.relic-mini-card.rarity-rare     .relic-preview-card { border-color: rgba(80, 152, 255, 0.52); box-shadow: 0 10px 18px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,232,168,0.18), 0 0 14px rgba(80,152,255,0.22); }
.relic-mini-card.rarity-epic     .relic-preview-card { border-color: rgba(210, 50, 235, 0.56); box-shadow: 0 10px 18px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,232,168,0.18), 0 0 16px rgba(210,50,235,0.26); }
.relic-mini-card.rarity-unique   .relic-preview-card { border-color: rgba(242, 212, 92, 0.62); box-shadow: 0 10px 18px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,232,168,0.18), 0 0 18px rgba(242,212,92,0.32); }
.relic-mini-card.rarity-legendary .relic-preview-card { border-color: rgba(220, 78, 78, 0.62); box-shadow: 0 10px 18px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,232,168,0.18), 0 0 20px rgba(220,78,78,0.34); }
.relic-mini-card .shop-relic-art {
  border-radius: 14px 14px 0 0;
}
.relic-mini-card .shop-relic-body {
  padding: 7px 8px 8px;
  gap: 3px;
  overflow: hidden;
}
.relic-mini-card .shop-relic-title {
  font-size: clamp(11px, 1vw, 13px);
  line-height: 1.05;
}
.relic-mini-card .shop-relic-effect {
  font-size: clamp(10px, 0.78vw, 11.5px);
  line-height: 1.12;
}
.relic-mini-card .shop-relic-flavor {
  font-size: clamp(8px, 0.62vw, 9.5px);
  line-height: 1.08;
}
/* Hover/focus only nudges the artifact forward instead of becoming the
   primary reading state; the card is already legible at rest. */
/* 클릭 핀(is-pinned) + 키보드 포커스만 크게 올라오게 — hover는 펼침만 담당.
   핀 시 중앙 이동 없이 팬 위치 그대로 확대된다 (--relic-hover-shift 제거). */
.relic-mini-card:not(.is-revive-locked):focus-visible,
.relic-mini-card.is-pinned:not(.is-revive-locked) {
  transform:
    translateX(calc(-50% + var(--relic-x, 0px) + var(--relic-extra-x, 0px)))
    translateY(calc(var(--relic-y, 0px) - 18px))
    rotate(calc(var(--relic-rot, 0deg) * 0.08))
    scale(1.22);
  z-index: 160;
  filter: drop-shadow(0 16px 24px rgba(0, 0, 0, 0.72));
}
/* hover: 테두리 발광만 — lift/scale 없이 JS spreading으로 카드를 구분한다 */
.relic-mini-card:not(.is-revive-locked):hover .relic-preview-card,
.relic-mini-card:not(.is-revive-locked):focus-visible .relic-preview-card,
.relic-mini-card.is-pinned:not(.is-revive-locked) .relic-preview-card {
  border-color: rgba(255, 232, 168, 0.7);
  box-shadow:
    0 20px 34px rgba(0, 0, 0, 0.72),
    0 0 26px rgba(244, 164, 96, 0.34),
    inset 0 1px 0 rgba(255, 232, 168, 0.3);
}
/* hover 시 등급 색 glow — 기본 금빛 hover를 등급 색상으로 덮어쓴다 */
.relic-mini-card.rarity-common:not(.is-revive-locked):hover .relic-preview-card { border-color: rgba(200,204,214,0.65); box-shadow: 0 20px 34px rgba(0,0,0,0.72), 0 0 22px rgba(160,168,185,0.3), inset 0 1px 0 rgba(255,232,168,0.22); }
.relic-mini-card.rarity-rare:not(.is-revive-locked):hover .relic-preview-card { border-color: rgba(80,152,255,0.72); box-shadow: 0 20px 34px rgba(0,0,0,0.72), 0 0 34px rgba(80,152,255,0.52), inset 0 1px 0 rgba(160,210,255,0.24); }
.relic-mini-card.rarity-epic:not(.is-revive-locked):hover .relic-preview-card { border-color: rgba(210,50,235,0.72); box-shadow: 0 20px 34px rgba(0,0,0,0.72), 0 0 36px rgba(210,50,235,0.54), inset 0 1px 0 rgba(230,140,255,0.22); }
.relic-mini-card.rarity-unique:not(.is-revive-locked):hover .relic-preview-card { border-color: rgba(242,212,92,0.78); box-shadow: 0 20px 34px rgba(0,0,0,0.72), 0 0 38px rgba(242,212,92,0.56), inset 0 1px 0 rgba(255,240,160,0.28); }
.relic-mini-card.rarity-legendary:not(.is-revive-locked):hover .relic-preview-card { border-color: rgba(220,78,78,0.78); box-shadow: 0 20px 34px rgba(0,0,0,0.72), 0 0 40px rgba(220,78,78,0.58), inset 0 1px 0 rgba(255,160,140,0.26); }
.relic-mini-card:not(.is-revive-locked):hover .shop-relic-title,
.relic-mini-card:not(.is-revive-locked):focus-visible .shop-relic-title,
.relic-mini-card.is-pinned:not(.is-revive-locked) .shop-relic-title {
  font-size: clamp(12px, 0.95vw, 13px);
}
.relic-mini-card:not(.is-revive-locked):hover .shop-relic-effect,
.relic-mini-card:not(.is-revive-locked):focus-visible .shop-relic-effect,
.relic-mini-card.is-pinned:not(.is-revive-locked) .shop-relic-effect {
  font-size: clamp(10.5px, 0.86vw, 12px);
}
.relic-mini-card:not(.is-revive-locked):hover .shop-relic-flavor,
.relic-mini-card:not(.is-revive-locked):focus-visible .shop-relic-flavor,
.relic-mini-card.is-pinned:not(.is-revive-locked) .shop-relic-flavor {
  font-size: clamp(8.5px, 0.68vw, 10px);
}
.relic-mini-card.is-arriving {
  opacity: 0;
}
.relic-mini-card.is-arrival-settling {
  animation: relic-arrival-settle 0.48s cubic-bezier(0.18, 0.86, 0.22, 1);
}
.relic-arrival-clone {
  position: fixed;
  z-index: 260;
  pointer-events: none;
  transform-origin: top left;
  filter: drop-shadow(0 18px 30px rgba(0, 0, 0, 0.74));
}
.relic-arrival-clone .relic-preview-card {
  width: 100%;
  height: 100%;
  min-height: 0;
}
@keyframes relic-arrival-settle {
  0% { filter: brightness(1.5); }
  38% { transform: translateX(calc(-50% + var(--relic-x, 0px))) translateY(calc(var(--relic-y, 0px) - 10px)) rotate(calc(var(--relic-rot, 0deg) * 0.7)) scale(1.03); }
  100% { filter: brightness(1); }
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
.flower-growth-badge { border-color: transparent; background: transparent; box-shadow: none; color: rgba(255, 220, 160, 0.95); text-shadow: 0 1px 3px rgba(0,0,0,0.92), 0 0 9px currentColor; animation: trap-turn-label-glimmer 1.9s ease-in-out infinite; }

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
