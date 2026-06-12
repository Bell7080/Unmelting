/**
 * Hand targeting, use ghosts, recipe hover previews, chain banner, and wax status styling.
 * Split from GameBoardRenderer so renderer logic stays navigable.
 */
export const GAME_BOARD_HAND_CHAIN_STYLES = `
/* Body-mounted target banner — appears at top-center of the viewport when
   a targeted hand card is armed. Subtle pulse so it stays readable without
   demanding attention. Positioned slightly below the ember HUD strip. */
.target-banner {
  position: fixed;
  top: 8vh;
  left: 50%;
  transform: translateX(-50%) translateY(-12px);
  pointer-events: none;
  z-index: 210;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 22px;
  text-align: center;
  color: rgba(255, 232, 168, 0.96);
  text-shadow:
    0 1px 2px rgba(0, 0, 0, 0.85),
    0 0 18px rgba(244, 164, 96, 0.4);
  opacity: 0;
  transition: opacity 0.22s ease, transform 0.22s cubic-bezier(0.18, 0.88, 0.22, 1);
  will-change: opacity, transform;
}
.target-banner.is-on {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
  animation: target-banner-pulse 1.8s ease-in-out infinite;
}
.target-banner-title {
  font-size: clamp(20px, 2.6vw, 28px);
  font-weight: 800;
  letter-spacing: 0.04em;
}
.target-banner-sub {
  font-size: clamp(12px, 1.2vw, 14px);
  color: rgba(255, 232, 168, 0.78);
  letter-spacing: 0.04em;
}
@keyframes target-banner-pulse {
  0%, 100% {
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.85), 0 0 14px rgba(244, 164, 96, 0.35);
    filter: brightness(1);
  }
  50% {
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.85), 0 0 22px rgba(244, 164, 96, 0.7);
    filter: brightness(1.08);
  }
}
.hand-stack {
  list-style: none;
  margin: 0;
  padding: 4px 0;
  display: flex;
  flex-direction: column;
  justify-content: flex-end; /* Dock filled cards to the bottom. */
  /* Let the full 10-card hand use the whole space below the combo gauge before
     allowing overlap. The row is height-limited by the panel, so a full hand
     gently compresses card height instead of suddenly stacking on card 8. */
  gap: clamp(1px, calc(8px - max(0, var(--hand-count, 0) - 6) * 1.2px), 6px);
  min-height: 0;
  overflow: visible;
}

.hand-stack.is-crowded .hand-slot.hand-card {
  /* Crowded hands should still read as separate cards. Prefer shorter cards
     over negative margins; only very small viewports will visually touch. */
  min-height: clamp(58px, calc((100vh - 210px) / var(--hand-count, 10)), 78px);
  margin-top: 0;
}
.hand-slot {
  border-radius: 8px;
  flex-shrink: 0;
  position: relative;
}
/* Empty slots collapse so the visual stack reads bottom-up without
   floating filled cards in the column middle. */
.hand-slot.is-empty {
  height: 0;
  border: none;
  background: transparent;
  opacity: 0;
  margin: 0;
  padding: 0;
}
.hand-slot.hand-card {
  padding: 0;
  border: 2px solid rgba(255, 232, 168, 0.3);
  background: rgba(255, 255, 255, 0.045);
  min-height: 78px;
  box-shadow:
    inset 0 0 0 1px rgba(0, 0, 0, 0.55),
    0 0 0 1px rgba(244, 164, 96, 0.12);
  transition: transform 0.18s cubic-bezier(0.2, 0.86, 0.28, 1), box-shadow 0.18s ease;
  /* Keep hand-card motion on the compositor; this prevents crowded hands from
     looking like cards vanish while several entries/drop-shifts overlap. */
  backface-visibility: hidden;
  transform: translateZ(0);
  will-change: transform, opacity, filter;
  isolation: isolate;
  /* Lower model slots are visually in front of later/upper cards. */
  z-index: calc(120 - var(--slot-index, 0));
}
/* Drop animation runs ONLY on the first render where this uid appears.
   Without this gate, every full re-render of the hand panel would replay
   the drop on every card, which made the whole stack twitch. */
.hand-slot.hand-card.is-entering {
  /* New cards now enter from the top edge directly under the combo gauge,
     then fall into their bottom-up slot so rewards do not appear mid-column.
     --hand-drop-start-y is set per-slot in JS to (spawnY - slotFinalY) so
     every entering slot starts at the same screen point (matching the
     resource-trail target) regardless of which slot it ends up in.
     --hand-drop-delay-ms is the trail flight time before the slot becomes
     visible, so the slot materializes exactly when the trail lands. */
  animation: hand-card-drop 0.62s cubic-bezier(0.16, 0.92, 0.14, 1.04) both;
  animation-delay: calc(
    var(--hand-enter-order, 0) * 135ms + var(--hand-drop-delay-ms, 0) * 1ms
  );
}
@keyframes hand-card-drop {
  /* Held invisible while the resource trail is in flight, then materialize
     at the spawn point right under the combo gauge and fall to the slot. */
  0%   { transform: translate3d(0, var(--hand-drop-start-y, -160px), 0) scale(0.96, 1.06); opacity: 0; filter: brightness(1.32); }
  1%   { opacity: 1; }
  52%  { transform: translate3d(0, 6px, 0) scale(1.018, 0.952); opacity: 1; filter: brightness(1.12); }
  69%  { transform: translate3d(0, -4px, 0) scale(0.99, 1.026); }
  84%  { transform: translate3d(0, 1.5px, 0) scale(1.004, 0.994); }
  100% { transform: translate3d(0, 0, 0) scale(1); opacity: 1; filter: brightness(1); }
}
.hand-slot.hand-card.is-merged.is-entering {
  /* A freshly synthesized triple waits until the falling beat lands, then
     performs the merge snap instead of disappearing instantly. */
  animation: hand-merge-jelly 0.78s cubic-bezier(0.16, 0.9, 0.18, 1) both;
  animation-delay: calc(var(--hand-enter-order, 0) * 135ms + 620ms);
}
.triple-merge-copy {
  /* Hidden by default; newly merged entries reveal these two real DOM layers so
     the synthesis remains visible even if pseudo-element painting is throttled. */
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  background:
    linear-gradient(90deg, rgba(12, 8, 18, 0.7), rgba(12, 8, 18, 0.2) 58%, rgba(12, 8, 18, 0.62)),
    linear-gradient(180deg, rgba(255, 232, 168, 0.08), rgba(0, 0, 0, 0.32)),
    var(--hand-card-art) center / cover no-repeat;
  box-shadow: inset 0 0 0 2px rgba(255, 232, 168, 0.32), 0 8px 16px rgba(0, 0, 0, 0.34);
  opacity: 0;
  z-index: 2;
  will-change: transform, opacity, filter;
}
.hand-slot.hand-card.is-merged.is-entering .triple-merge-copy.copy-a {
  animation: hand-merge-copy-left 0.82s cubic-bezier(0.16, 0.92, 0.18, 1) both;
  animation-delay: calc(var(--hand-enter-order, 0) * 135ms + 80ms);
}
.hand-slot.hand-card.is-merged.is-entering .triple-merge-copy.copy-b {
  animation: hand-merge-copy-right 0.82s cubic-bezier(0.16, 0.92, 0.18, 1) both;
  animation-delay: calc(var(--hand-enter-order, 0) * 135ms + 140ms);
}
.hand-slot.hand-card.is-merge-bursting::after {
  content: '✦ ✧ ✦';
  position: absolute;
  inset: -12px;
  z-index: 9;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 244, 190, 0.98);
  font-weight: 900;
  letter-spacing: 0.22em;
  text-shadow: 0 0 14px rgba(255, 215, 120, 0.92), 0 0 28px rgba(244, 164, 96, 0.62);
  pointer-events: none;
  animation: hand-merge-sparkle 0.72s ease-out both;
}
@keyframes hand-merge-jelly {
  0%, 18% { transform: translateY(0) scale(1); filter: brightness(1); }
  34% { transform: translateY(5px) scale(1.08, 0.88); filter: brightness(1.55) saturate(1.18); }
  48% { transform: translateY(-4px) scale(0.94, 1.1); }
  64% { transform: translateY(2px) scale(1.025, 0.98); }
  82% { transform: translateY(-1px) scale(0.995, 1.01); }
  100% { transform: translateY(0) scale(1); filter: brightness(1); }
}
@keyframes hand-merge-copy-left {
  0% { opacity: 0; transform: translate3d(var(--merge-copy-a-dx, -18px), var(--merge-copy-a-dy, -64px), 0) scale(0.98, 1.02); filter: brightness(1.12); }
  54% { opacity: 0.9; transform: translate3d(-6px, -3px, 0) scale(1.012, 0.972); }
  70% { opacity: 0.86; transform: translate3d(3px, 2px, 0) scale(0.998, 1.01); }
  82% { opacity: 0.82; transform: translate3d(-2px, -1px, 0) scale(1); filter: brightness(1.28); }
  100% { opacity: 0; transform: translate3d(0, 0, 0) scale(0.9); filter: brightness(1.7); }
}
@keyframes hand-merge-copy-right {
  0% { opacity: 0; transform: translate3d(var(--merge-copy-b-dx, 18px), var(--merge-copy-b-dy, -82px), 0) scale(0.98, 1.02); filter: brightness(1.12); }
  54% { opacity: 0.9; transform: translate3d(6px, -3px, 0) scale(1.012, 0.972); }
  70% { opacity: 0.86; transform: translate3d(-3px, 2px, 0) scale(0.998, 1.01); }
  82% { opacity: 0.82; transform: translate3d(2px, -1px, 0) scale(1); filter: brightness(1.28); }
  100% { opacity: 0; transform: translate3d(0, 0, 0) scale(0.9); filter: brightness(1.7); }
}
@keyframes hand-merge-sparkle {
  0% { opacity: 0; transform: scale(0.62) rotate(-4deg); }
  34% { opacity: 1; transform: scale(1.18) rotate(3deg); }
  100% { opacity: 0; transform: scale(1.55) rotate(0deg); }
}
/* Used hand-card ghost: cloned into body by animateHandCardUse so the card
   visibly travels from the hand stack toward the player-card area before it
   dissolves. It reuses the original hand-card styling for theme continuity. */
.hand-use-ghost {
  position: fixed;
  z-index: 225;
  margin: 0;
  pointer-events: none;
  list-style: none;
  transform-origin: center;
  transform-style: preserve-3d;
  box-shadow:
    0 10px 28px rgba(0, 0, 0, 0.64),
    0 0 18px rgba(255, 215, 120, 0.28);
}
.hand-use-ghost.is-preview-flight {
  /* This element can also carry .hand-card-preview, so pin the flight ghost
     back to fixed positioning after the preview rules are applied. */
  position: fixed !important;
  right: auto !important;
  display: block;
  opacity: 1;
  border-radius: 14px;
  overflow: visible;
  transform: none;
  animation: none;
}
.hand-use-ghost.is-preview-flight::before {
  display: none;
}
.hand-use-ghost button { cursor: default; }
.hand-slot.is-hand-use-source {
  /* The clicked compact card should disappear quietly while the preview
     carries the actual use animation to the center. */
  opacity: 0;
  transform: translateY(2px) scale(0.985);
  filter: saturate(0.72) brightness(0.82);
}
.hand-slot.hand-card:hover,
.hand-slot.hand-card:focus-within {
  transform: translateY(-2px);
  /* hover 시 transform이 새 쌓임 맥락을 만들어 미리보기(z-index 70)를 그 안에 가둔다.
     상점/제단 오버레이(z-index 60) 위로 미리보기가 떠 잘리지 않도록 슬롯 자체를 더 높인다. */
  z-index: 130;
  box-shadow:
    0 6px 18px rgba(0, 0, 0, 0.55),
    0 0 14px rgba(255, 215, 120, 0.35);
}
.hand-slot.hand-card button {
  width: 100%;
  height: 100%;
  display: grid;
  grid-template-columns: 1fr;
  align-items: end;
  gap: 0;
  padding: 8px 10px;
  /* Compact hand entries use the card illustration as their full background
     instead of confining it to the old left thumbnail box. */
  background:
    linear-gradient(90deg, rgba(12, 8, 18, 0.7), rgba(12, 8, 18, 0.2) 58%, rgba(12, 8, 18, 0.62)),
    linear-gradient(180deg, rgba(255, 232, 168, 0.06), rgba(0, 0, 0, 0.34)),
    var(--hand-card-art) center / cover no-repeat;
  border: none;
  font-family: inherit;
  font-size: 13px;
  color: var(--color-text-primary);
  cursor: pointer;
  position: relative;
  min-height: 0;
  overflow: hidden;
}
.hand-slot.hand-card button:hover {
  background:
    linear-gradient(90deg, rgba(12, 8, 18, 0.62), rgba(255, 215, 120, 0.08) 58%, rgba(12, 8, 18, 0.56)),
    linear-gradient(180deg, rgba(255, 232, 168, 0.1), rgba(0, 0, 0, 0.28)),
    var(--hand-card-art) center / cover no-repeat;
}

.hand-card-thumb {
  position: relative;
  display: none;
  width: 44px;
  height: 56px;
  border-radius: 7px;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.3);
  box-shadow:
    inset 0 0 0 1px rgba(255, 232, 168, 0.18),
    0 2px 8px rgba(0, 0, 0, 0.45);
  clip-path: inset(0 round 7px);
}
.hand-card-thumb::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    linear-gradient(180deg, rgba(255, 232, 168, 0.08), rgba(0, 0, 0, 0.08)),
    radial-gradient(120% 95% at 50% 10%, transparent 46%, rgba(10, 7, 18, 0.38) 100%);
}
.hand-card-thumb img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
  object-position: center;
}
.hand-card .hand-card-name {
  position: relative;
  z-index: 1;
  justify-self: start;
  max-width: 100%;
  padding: 4px 7px;
  border-radius: 999px;
  background: rgba(10, 7, 16, 0.48);
  box-shadow: 0 0 12px rgba(0, 0, 0, 0.34);
  font-weight: 900;
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  letter-spacing: 0.03em;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
}
.hand-card-preview {
  display: none;
  position: absolute;
  right: calc(100% + 16px);
  top: 50%;
  width: 188px;
  aspect-ratio: 0.72;
  opacity: 0;
  pointer-events: none;
  transform: translateY(-50%) translateX(8px) rotateY(86deg);
  transform-origin: right center;
  transform-style: preserve-3d;
  z-index: 70;
  filter: drop-shadow(0 16px 28px rgba(0, 0, 0, 0.72));
}
.hand-slot.is-low-preview .hand-card-preview {
  /* Bottom hand slots otherwise clip against the viewport; anchor their
     preview by the lower edge and nudge it upward. */
  top: auto;
  bottom: -10px;
  transform: translateY(-8px) translateX(8px) rotateY(86deg);
}

.hand-card-preview::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 14px;
  background: var(--hand-card-back) center / cover no-repeat;
  backface-visibility: hidden;
  transform: rotateY(0deg);
  z-index: 2;
}
.hand-slot.hand-card:hover .hand-card-preview,
.hand-slot.hand-card:focus-within .hand-card-preview {
  display: block;
  animation: hand-preview-flip 0.62s cubic-bezier(0.16, 0.84, 0.2, 1) forwards;
}
.hand-slot.hand-card.is-arming-target .hand-card-preview {
  /* Targeted cards stay previewed after click so the cursor can leave the hand
     and pick a rail target without replaying the back-to-front flip. */
  display: block;
  opacity: 1;
  transform: translateY(-50%) translateX(0) rotateY(0deg);
  animation: none;
}
@keyframes hand-preview-flip {
  0% { opacity: 0; transform: translateY(-50%) translateX(14px) rotateY(92deg); }
  48% { opacity: 1; transform: translateY(-50%) translateX(5px) rotateY(28deg); }
  100% { opacity: 1; transform: translateY(-50%) translateX(0) rotateY(0deg); }
}
.hand-slot.is-low-preview:hover .hand-card-preview,
.hand-slot.is-low-preview:focus-within .hand-card-preview {
  animation-name: hand-preview-low-flip;
}
.hand-slot.is-low-preview.is-arming-target .hand-card-preview {
  transform: translateY(-8px) translateX(0) rotateY(0deg);
  animation: none;
}
@keyframes hand-preview-low-flip {
  0% { opacity: 0; transform: translateY(-8px) translateX(14px) rotateY(92deg); }
  48% { opacity: 1; transform: translateY(-8px) translateX(5px) rotateY(28deg); }
  100% { opacity: 1; transform: translateY(-8px) translateX(0) rotateY(0deg); }
}
.hand-slot.hand-card:hover .hand-card-preview::before,
.hand-slot.hand-card:focus-within .hand-card-preview::before {
  animation: hand-preview-back-flip 0.62s cubic-bezier(0.16, 0.84, 0.2, 1) forwards;
}
.hand-slot.hand-card.is-arming-target .hand-card-preview::before {
  opacity: 0;
  transform: rotateY(-102deg);
  animation: none;
}
@keyframes hand-preview-back-flip {
  0%, 42% { opacity: 1; transform: rotateY(0deg); }
  76%, 100% { opacity: 0; transform: rotateY(-102deg); }
}

/* Recipe hover preview: appears to the left of the hand-card preview so the
   glowing recipe-ready state names the exact combo and its payoff. */
.hand-recipe-preview {
  display: none;
  position: absolute;
  right: calc(100% + 222px);
  top: 50%;
  width: 214px;
  padding: 10px 12px;
  border-radius: 13px;
  border: 1px solid rgba(255, 215, 120, 0.44);
  background:
    linear-gradient(180deg, rgba(48, 33, 55, 0.96), rgba(15, 10, 22, 0.98)),
    radial-gradient(circle at 20% 10%, rgba(255, 215, 120, 0.18), transparent 56%);
  box-shadow:
    0 16px 30px rgba(0, 0, 0, 0.62),
    inset 0 1px 0 rgba(255, 245, 220, 0.1),
    0 0 22px rgba(244, 164, 96, 0.16);
  opacity: 0;
  pointer-events: none;
  transform: translateY(-50%) translateX(10px);
  z-index: 72;
}
.hand-slot.is-low-preview .hand-recipe-preview {
  top: auto;
  bottom: 8px;
  transform: translateY(0) translateX(10px);
}
.hand-slot.hand-card.is-recipe-ready:hover .hand-recipe-preview,
.hand-slot.hand-card.is-recipe-ready:focus-within .hand-recipe-preview {
  display: grid;
  gap: 7px;
  animation: recipe-preview-slide 0.28s cubic-bezier(0.16, 0.84, 0.2, 1) forwards;
}
.hand-recipe-preview-kicker {
  font-size: 12px;
  color: rgba(255, 215, 120, 0.78);
  letter-spacing: 0.12em;
}
.hand-recipe-preview-row {
  display: grid;
  gap: 2px;
  padding-left: 8px;
  border-left: 3px solid rgba(255, 215, 120, 0.72);
}
.hand-recipe-preview-row strong {
  color: #fff5dc;
  font-size: 15px;
  line-height: 1.2;
}
.hand-recipe-preview-row em {
  color: rgba(255, 245, 220, 0.78);
  font-size: 12px;
  font-style: normal;
  line-height: 1.35;
}
@keyframes recipe-preview-slide {
  from { opacity: 0; transform: translateY(-50%) translateX(16px); }
  to { opacity: 1; transform: translateY(-50%) translateX(0); }
}
.hand-slot.is-low-preview:hover .hand-recipe-preview,
.hand-slot.is-low-preview:focus-within .hand-recipe-preview {
  animation-name: recipe-preview-low-slide;
}
@keyframes recipe-preview-low-slide {
  from { opacity: 0; transform: translateY(0) translateX(16px); }
  to { opacity: 1; transform: translateY(0) translateX(0); }
}

.hand-cat-recovery { box-shadow: inset 4px 0 0 rgba(103, 196, 152, 0.85); }
.hand-cat-tool { box-shadow: inset 4px 0 0 rgba(255, 215, 120, 0.9); }
.hand-cat-control { box-shadow: inset 4px 0 0 rgba(145, 174, 210, 0.9); }
.hand-cat-attack { box-shadow: inset 4px 0 0 rgba(168, 58, 58, 0.9); }
.hand-slot.is-merged {
  background: rgba(255, 215, 120, 0.13);
  border-color: rgba(255, 215, 120, 0.55);
  box-shadow:
    0 0 12px rgba(255, 215, 120, 0.35),
    inset 4px 0 0 rgba(255, 215, 120, 1);
}
.hand-slot.is-merged .merged-mark {
  position: absolute;
  top: 4px;
  right: 6px;
  font-size: 12px;
  color: rgba(255, 232, 168, 0.95);
  text-shadow: 0 0 4px rgba(255, 215, 120, 0.85);
}

/* Recipe-ready hand cards glow from the left edge toward the adjacent plus/chain
   direction. The effect is intentionally soft and candle-colored so it reads as
   a hint, not as the stronger recipe-fire banner. */
.hand-slot.is-recipe-ready {
  border-color: rgba(255, 215, 120, 0.46);
  box-shadow:
    -10px 0 24px rgba(255, 182, 85, 0.22),
    -2px 0 13px rgba(255, 215, 120, 0.26),
    inset 4px 0 0 rgba(255, 215, 120, 0.95);
  animation: recipe-ready-side-glow 1.8s ease-in-out infinite;
}
.hand-slot.is-recipe-ready::before {
  content: '';
  position: absolute;
  top: 8px;
  bottom: 8px;
  left: -18px;
  width: 24px;
  border-radius: 999px;
  background: radial-gradient(ellipse at right, rgba(255, 218, 138, 0.34), rgba(255, 172, 74, 0.12) 48%, transparent 72%);
  filter: blur(1px);
  opacity: 0.8;
  pointer-events: none;
}
.hand-slot.is-recipe-ready .recipe-ready-mark {
  position: absolute;
  top: 4px;
  left: 6px;
  z-index: 1;
  font-size: 12px;
  color: rgba(255, 237, 184, 0.96);
  text-shadow: 0 0 8px rgba(255, 201, 104, 0.9);
}
/* 악마 소환 발동 직전 — 가장 좌측에 단독 표시되는 씨뻘건 발광 다이아몬드 */
.recipe-ready-mark--demon,
.hand-slot.is-recipe-ready .recipe-ready-mark--demon {
  position: absolute;
  top: 2px;
  left: 4px;
  z-index: 2;
  font-size: 22px;
  color: rgba(220, 20, 10, 0.97);
  text-shadow:
    0 0 6px rgba(255, 0, 0, 1.0),
    0 0 14px rgba(220, 10, 0, 0.85),
    0 0 28px rgba(180, 0, 0, 0.60);
  animation: demon-diamond-pulse 0.65s ease-in-out infinite alternate;
  pointer-events: none;
}
/* 악마 다이아가 떠 있을 때 — 일반 금빛 ✦ 를 우측으로 밀어 겹침 방지.
   .hand-slot.is-recipe-ready .recipe-ready-mark (0,3,0) 보다 명시도가 높아야 override된다. */
.hand-slot.is-recipe-ready .recipe-ready-mark.is-has-demon {
  left: 32px;
}
@keyframes demon-diamond-pulse {
  from {
    text-shadow:
      0 0 4px rgba(255, 0, 0, 0.80),
      0 0 10px rgba(200, 0, 0, 0.55),
      0 0 20px rgba(160, 0, 0, 0.30);
    filter: brightness(0.90);
  }
  to {
    text-shadow:
      0 0 8px rgba(255, 0, 0, 1.0),
      0 0 20px rgba(220, 0, 0, 0.90),
      0 0 40px rgba(180, 0, 0, 0.65);
    filter: brightness(1.25);
  }
}

/* 체인 배너 왼쪽 악마 소환 대형 다이아몬드 — 다른 체인 이벤트와 분리된 이벤트 체인 표시 */
.chain-banner-demon-diamond {
  display: inline-block;
  font-size: clamp(20px, 2.8vw, 36px);
  line-height: 1;
  color: rgba(220, 20, 10, 0.97);
  text-shadow:
    0 0 6px rgba(255, 0, 0, 1.0),
    0 0 14px rgba(220, 10, 0, 0.85),
    0 0 28px rgba(180, 0, 0, 0.60);
  animation: demon-banner-pulse 0.82s ease-in-out infinite alternate;
  margin-right: 8px;
}
@keyframes demon-banner-pulse {
  from {
    text-shadow:
      0 0 6px rgba(222, 50, 20, 0.8),
      0 0 18px rgba(200, 30, 10, 0.55),
      0 0 36px rgba(180, 20, 0, 0.32);
    filter: brightness(0.92);
  }
  to {
    text-shadow:
      0 0 14px rgba(255, 60, 20, 1.0),
      0 0 30px rgba(220, 40, 20, 0.80),
      0 0 56px rgba(200, 20, 0, 0.55);
    filter: brightness(1.12);
  }
}
/* 악마 소환 이벤트 구분자 — 대형 다이아와 일반 체인 이벤트 사이 */
.chain-banner-demon-sep {
  color: rgba(222, 38, 18, 0.48);
  font-size: clamp(12px, 1.2vw, 16px);
  font-weight: 700;
  margin: 0 4px;
  align-self: center;
}


/* 악마 소환 화면 일렁임 */
.demon-summon-shimmer {
  position: fixed;
  inset: 0;
  z-index: 140;
  pointer-events: none;
  background: radial-gradient(ellipse at center, rgba(160, 20, 20, 0.20) 0%, transparent 72%);
  animation: demon-shimmer-flicker 1.4s ease-in-out forwards;
}
@keyframes demon-shimmer-flicker {
  0%   { opacity: 0; }
  18%  { opacity: 1; }
  45%  { opacity: 0.6; }
  62%  { opacity: 0.88; }
  82%  { opacity: 0.5; }
  100% { opacity: 0; }
}

/* 악마 소환 체인 배너 임팩트 모드 — 더 크고 중앙에, X 버튼 없음, 불타듯 */
.chain-banner.is-demon-impact {
  top: 38vh;
  max-width: min(92vw, 960px);
  animation: demon-banner-burn-pulse 0.88s ease-in-out infinite alternate;
  /* 레일 위에 떠있어 가독성이 낮으므로 어두운 타원형 그림자를 배경에 깐다 */
  background: radial-gradient(ellipse at 50% 60%, rgba(8, 3, 20, 0.82) 0%, transparent 76%);
  border-radius: 16px;
  padding: 8px 24px;
}
.chain-banner.is-demon-impact .chain-event-recipe {
  font-size: clamp(28px, 4vw, 52px);
  letter-spacing: 0.08em;
}
.chain-banner.is-demon-impact .chain-banner-label {
  font-size: clamp(14px, 1.4vw, 18px);
}
.chain-banner.is-demon-impact .chain-banner-reset {
  display: none;
}
/* 임팩트·페이드아웃 모드 내 악마 소환 레시피 이벤트 — 붉은 발광.
   페이드 중에도 붉은 색을 유지해 황금색 일반 체인으로 순간 전환되는 현상을 방지한다. */
.chain-banner.is-demon-impact .chain-event-recipe--demon,
.chain-banner.is-demon-impact-fading .chain-event-recipe--demon {
  color: rgba(222, 50, 28, 0.96);
  font-size: clamp(30px, 4.4vw, 58px);
}
.chain-banner.is-demon-impact .chain-event-recipe--demon .chain-event-name,
.chain-banner.is-demon-impact .chain-event-recipe--demon .chain-event-flavor,
.chain-banner.is-demon-impact-fading .chain-event-recipe--demon .chain-event-name,
.chain-banner.is-demon-impact-fading .chain-event-recipe--demon .chain-event-flavor {
  color: rgba(222, 50, 28, 0.96);
  text-shadow: 0 0 10px rgba(200, 38, 18, 0.48);
}
.chain-banner.is-demon-impact .chain-event-recipe--demon .chain-event-mark,
.chain-banner.is-demon-impact-fading .chain-event-recipe--demon .chain-event-mark {
  color: rgba(240, 60, 28, 1);
  text-shadow: 0 0 8px rgba(220, 40, 20, 0.75);
}
@keyframes demon-banner-burn-pulse {
  from {
    text-shadow:
      0 1px 2px rgba(0,0,0,0.92),
      0 0 20px rgba(200, 30, 10, 0.55),
      0 0 48px rgba(180, 15, 0, 0.30);
    filter: brightness(0.92);
  }
  to {
    text-shadow:
      0 1px 2px rgba(0,0,0,0.92),
      0 0 32px rgba(240, 50, 20, 0.90),
      0 0 70px rgba(220, 30, 0, 0.60);
    filter: brightness(1.18);
  }
}
.chain-banner.is-demon-impact-fading {
  animation: demon-banner-burn-out 0.72s ease-in forwards !important;
}
@keyframes demon-banner-burn-out {
  0%   { opacity: 1; filter: blur(0px) brightness(1.1); transform: translateX(-50%) translateY(0); }
  35%  { opacity: 0.85; filter: blur(1px) brightness(1.5); transform: translateX(-50%) translateY(-4px); }
  100% { opacity: 0; filter: blur(6px) brightness(0.2); transform: translateX(-50%) translateY(-12px); }
}

@keyframes recipe-ready-side-glow {
  0%, 100% {
    box-shadow:
      -8px 0 20px rgba(255, 182, 85, 0.18),
      -2px 0 10px rgba(255, 215, 120, 0.22),
      inset 4px 0 0 rgba(255, 215, 120, 0.82);
  }
  50% {
    box-shadow:
      -15px 0 30px rgba(255, 182, 85, 0.32),
      -3px 0 16px rgba(255, 226, 154, 0.36),
      inset 4px 0 0 rgba(255, 232, 168, 1);
  }
}
.hand-slot.is-arming-target {
  outline: 2px solid var(--color-flame);
  outline-offset: -2px;
  animation: hand-arm-pulse 1.1s ease-in-out infinite;
}
@keyframes hand-arm-pulse {
  0%, 100% { box-shadow: 0 0 0 rgba(255, 215, 120, 0); }
  50% { box-shadow: 0 0 14px rgba(255, 215, 120, 0.55); }
}

/* Larger, warmer compendium panel pass: closer to the hand-card theme with
   waxed-paper panels, candle borders, and readable description sizes. */
.compendium-overlay {
  background:
    radial-gradient(circle at 50% 18%, rgba(244, 164, 96, 0.16), transparent 42%),
    rgba(8, 5, 14, 0.82);
  backdrop-filter: blur(4px) saturate(1.08);
}
.compendium-modal {
  width: min(1040px, 96vw);
  background:
    linear-gradient(180deg, rgba(53, 39, 63, 0.97), rgba(18, 14, 28, 0.99)),
    radial-gradient(circle at 50% 0%, rgba(255, 215, 120, 0.12), transparent 52%);
  border-color: rgba(244, 164, 96, 0.58);
  box-shadow:
    0 28px 64px rgba(0, 0, 0, 0.72),
    inset 0 0 0 1px rgba(255, 232, 168, 0.08),
    0 0 36px rgba(244, 164, 96, 0.14);
}
.compendium-header {
  background: linear-gradient(90deg, rgba(244, 164, 96, 0.12), rgba(255, 215, 120, 0.04), rgba(145, 174, 210, 0.08));
}
.compendium-title { font-size: 22px; }
.compendium-tabs {
  gap: 6px;
  padding: 10px 18px 0;
  background: rgba(0, 0, 0, 0.14);
}
.compendium-tab {
  min-width: 74px;
  padding: 10px 16px;
  border-color: rgba(255, 232, 168, 0.08);
  color: rgba(255, 232, 168, 0.72);
  background: rgba(255, 255, 255, 0.025);
  font-size: 15px;
}
.compendium-tab:hover {
  color: #fff5dc;
  background: rgba(244, 164, 96, 0.1);
}
.compendium-tab.is-active {
  color: #fff5dc;
  background:
    linear-gradient(180deg, rgba(244, 164, 96, 0.24), rgba(244, 164, 96, 0.09));
  box-shadow: inset 0 3px 0 rgba(255, 215, 120, 0.42);
}
.compendium-body { padding: 20px 24px; gap: 16px; }
.compendium-section { font-size: 16px; color: var(--color-flame-warm); }
.compendium-section-blurb,
.compendium-footer { font-size: 14px; }
.compendium-grid { grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 16px; }
.compendium-card {
  min-height: 248px;
  padding: 14px;
  border-radius: 14px;
  gap: 10px;
  background:
    linear-gradient(180deg, rgba(255, 245, 220, 0.07), rgba(255, 255, 255, 0.028)),
    rgba(12, 8, 18, 0.62);
  border-color: rgba(255, 232, 168, 0.16);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.08),
    0 12px 24px rgba(0, 0, 0, 0.28);
}
.compendium-card-art { height: 112px; border-radius: 11px; border: 1px solid rgba(255, 232, 168, 0.12); }
.compendium-card-name { font-size: 17px; }
.compendium-card-badge { font-size: 12px; }
.compendium-card-row { font-size: 14px; line-height: 1.35; }
.compendium-card-value .icon {
  width: 15px;
  height: 15px;
  vertical-align: -2px;
  color: var(--color-flame);
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.55));
}
.compendium-card-desc { font-size: 14px; line-height: 1.55; }
.common-card-name { font-size: 18px; }
.common-card-badge { font-size: 12px; }
.common-card-desc { font-size: 16px; }
.compendium-hand-card { min-height: 316px; height: auto; }

/* Combo tab recipe cards: mini hand cards overlap by default and fan out on
   hover/focus, matching the requested hand-card stack interaction. */
.compendium-card-art--recipe {
  min-height: 116px;
  height: 116px;
  overflow: hidden;
  background:
    radial-gradient(circle at 50% 8%, rgba(255, 215, 120, 0.12), transparent 58%),
    rgba(0, 0, 0, 0.26);
}
.compendium-recipe-stack {
  position: relative;
  width: min(100%, 240px);
  height: 102px;
  margin: 0 auto;
}
.compendium-recipe-mini {
  position: absolute;
  grid-template-rows: 44px auto;
  left: 50%;
  top: 50%;
  width: 82px;
  min-height: 98px;
  height: 98px;
  padding: 5px;
  gap: 4px;
  transform: translate(-50%, -50%) translateX(calc((var(--i, 0) - var(--recipe-center, 0)) * 18px)) rotate(calc((var(--i, 0) - var(--recipe-center, 0)) * 4deg));
  transform-origin: 50% 96%;
  transition: transform 0.28s cubic-bezier(0.16, 0.86, 0.26, 1), filter 0.28s ease, opacity 0.18s ease;
  box-shadow: 0 10px 22px rgba(0, 0, 0, 0.42);
}
.compendium-recipe-stack .compendium-recipe-mini:nth-child(1) { --i: 0; z-index: 1; }
.compendium-recipe-stack .compendium-recipe-mini:nth-child(2) { --i: 1; z-index: 2; }
.compendium-recipe-stack .compendium-recipe-mini:nth-child(3) { --i: 2; z-index: 3; }
.compendium-recipe-stack .compendium-recipe-mini:nth-child(4) { --i: 3; z-index: 4; }
.compendium-recipe-stack .compendium-recipe-mini:nth-child(5) { --i: 4; z-index: 5; }
.compendium-card:hover,
.compendium-card:focus-within {
  z-index: 6;
}
/* The actual fan-out is rendered by a body-mounted floating clone; keeping
   the in-card stack compact prevents a second expanded stack from stretching
   the recipe card's lower area under the clone. */
.compendium-card:hover .compendium-card-art--recipe .compendium-recipe-mini,
.compendium-card:focus-within .compendium-card-art--recipe .compendium-recipe-mini {
  filter: brightness(1.04);
}
/* When the detached hover fan is visible, hide the compact source stack so
   background mini-cards do not overlap with and distract from the preview. */
.compendium-card-art--recipe.is-floating .compendium-recipe-mini {
  opacity: 0;
}
.compendium-recipe-mini .common-card-art { height: 44px; min-height: 44px; border-radius: 8px; }
.compendium-recipe-mini .common-card-body { grid-template-rows: auto; min-height: 18px; gap: 1px; }
.compendium-recipe-mini .common-card-title-row { gap: 3px; }
.compendium-recipe-mini .common-card-name { font-size: 12px; line-height: 1.05; }
.compendium-recipe-mini .common-card-badge { display: none; }
.compendium-recipe-mini .common-card-desc { display: none; }
/* Recipe entries intentionally break from the larger default codex card height:
   the compact card keeps the ingredients and one effect line without the large
   blank lower area visible in the combo tab. */
.compendium-recipe-card {
  min-height: 0;
  padding: 10px;
  gap: 7px;
}
.compendium-recipe-card .compendium-card-head {
  min-height: 22px;
}
.compendium-recipe-card .compendium-card-row {
  align-items: start;
  line-height: 1.28;
}

/* Hide the hover preview immediately once a card has been accepted for use;
   only the dedicated flight ghost remains until the use animation completes. */
.hand-slot.is-hand-use-source .hand-card-preview {
  display: none !important;
  opacity: 0 !important;
  animation: none !important;
}

/* ---------- Hand-target highlighting on the rail ---------- */
.cell.card.is-hand-target {
  outline: 2px dashed rgba(255, 215, 120, 0.7);
  outline-offset: -3px;
  animation: hand-target-pulse 1.1s ease-in-out infinite;
}
.cell.is-hand-target-blocked {
  cursor: not-allowed;
  filter: grayscale(0.42) brightness(0.68) saturate(0.82);
}
.cell.is-hand-target-blocked::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: rgba(12, 6, 12, 0.34);
  pointer-events: none;
  z-index: 7;
}
.cell.empty.is-hand-target-blocked {
  border-color: rgba(168, 58, 58, 0.68);
  background:
    repeating-linear-gradient(45deg, rgba(168, 58, 58, 0.08) 0 6px, transparent 6px 12px),
    rgba(16, 8, 16, 0.28);
}
.target-block-mark {
  font-size: clamp(44px, 8vw, 104px);
  z-index: 32;
}
@keyframes hand-target-pulse {
  0%, 100% { box-shadow: 0 0 0 rgba(255, 215, 120, 0); }
  50% { box-shadow: 0 0 16px rgba(255, 215, 120, 0.45); }
}

/* ---------- Floating chain banner (top-center text glow) ----------
   The chain banner lives on the body, not inside the stage layout, so it
   never shifts other UI as the player extends the chain. Position is fixed
   near the top-center target banner language for HUD consistency. Card events
   use a restrained shared warm tone; recipe/gauge events scale up with a
   brighter glow so their trigger beats read without a circular/pill backing. */
.chain-banner {
  position: fixed;
  left: 50%;
  top: 20vh;
  transform: translateX(-50%) translateY(-10px);
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  max-width: min(78vw, 840px);
  padding: 4px 12px;
  z-index: 205;
  pointer-events: none;
  opacity: 0;
  text-align: center;
  /* Text-only glow matches the target banner/turn overlay and removes the old
     pill-like circular backing that made combo feedback feel off-tone. */
  text-shadow:
    0 1px 2px rgba(0, 0, 0, 0.92),
    0 0 18px rgba(244, 164, 96, 0.36);
  transition: opacity 0.32s ease, transform 0.32s cubic-bezier(0.18, 0.88, 0.22, 1);
}
.chain-banner.is-on {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
  /* 체인 배너 본체는 클릭을 아래 보드로 통과시킨다 */
  pointer-events: none;
}
.chain-banner.is-on .chain-banner-reset {
  pointer-events: auto;
}
.chain-banner-label {
  font-size: clamp(12px, 1.1vw, 14px);
  font-weight: 800;
  letter-spacing: 0.22em;
  color: rgba(255, 215, 120, 0.78);
  margin-right: 2px;
  text-transform: uppercase;
}
.chain-banner-arrow {
  color: rgba(255, 232, 168, 0.68);
  font-weight: 900;
  font-size: clamp(15px, 1.6vw, 20px);
  filter: drop-shadow(0 0 8px rgba(255, 215, 120, 0.35));
}
.chain-event {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0 2px;
  border-radius: 0;
  font-weight: 800;
  font-size: clamp(14px, 1.45vw, 18px);
  color: #fff5dc;
  background: transparent;
  border: 0;
  box-shadow: none;
  white-space: nowrap;
  will-change: transform, filter, text-shadow;
}
.chain-event-card.hand-cat-recovery,
.chain-event-card.hand-cat-tool,
.chain-event-card.hand-cat-control,
.chain-event-card.hand-cat-attack {
  color: rgba(255, 232, 168, 0.9);
}
.chain-event-recipe,
.chain-event-gauge {
  font-size: clamp(20px, 2.6vw, 32px);
  letter-spacing: 0.06em;
  color: rgba(255, 232, 168, 1);
  background: transparent;
  border-color: transparent;
  text-shadow:
    0 1px 2px rgba(0, 0, 0, 0.92),
    0 0 18px rgba(255, 215, 120, 0.78),
    0 0 36px rgba(244, 164, 96, 0.42);
  animation: chain-recipe-glow 1.35s ease-in-out infinite;
}
.chain-event-gauge {
  color: rgba(213, 230, 255, 1);
  text-shadow:
    0 1px 2px rgba(0, 0, 0, 0.92),
    0 0 18px rgba(145, 174, 210, 0.82),
    0 0 36px rgba(255, 215, 120, 0.22);
}
.chain-event-mark {
  color: rgba(255, 232, 168, 1);
  filter: drop-shadow(0 0 6px rgba(255, 215, 120, 0.9));
  font-weight: 900;
}
.chain-event-mark--sparkle .icon {
  width: 1em; height: 1em;
  vertical-align: -0.12em;
}
.chain-event-copy { display: inline-grid; gap: 2px; justify-items: center; }
.chain-event-name { font-weight: 800; }
.chain-event-flavor { font-size: clamp(12px, 1.05vw, 14px); color: rgba(255, 245, 220, 0.78); letter-spacing: 0.02em; }

/* Pop-in for newly added card events: scale + slight horizontal shake. */
.chain-event-card.is-new {
  animation: chain-card-pop 0.42s cubic-bezier(0.2, 1.4, 0.32, 1) 1;
}
/* Recipe events flash brighter on entry, layered on top of the steady glow. */
.chain-event-recipe.is-new,
.chain-event-gauge.is-new {
  animation:
    chain-recipe-burst 0.6s cubic-bezier(0.16, 0.88, 0.3, 1) 1,
    chain-recipe-glow 1.4s ease-in-out infinite 0.6s;
}

@keyframes chain-card-pop {
  0%   { transform: scale(0.55) translateX(0);  opacity: 0; filter: brightness(1.8); }
  40%  { transform: scale(1.22) translateX(-3px); opacity: 1; filter: brightness(1.28); }
  55%  { transform: scale(1.05) translateX(4px); }
  70%  { transform: scale(1.1) translateX(-2px); }
  100% { transform: scale(1) translateX(0); filter: brightness(1); }
}
@keyframes chain-recipe-burst {
  0%   {
    transform: scale(0.6) rotate(0deg);
    opacity: 0;
    filter: brightness(2.4) saturate(1.6);
    text-shadow:
      0 1px 2px rgba(0, 0, 0, 0.92),
      0 0 34px rgba(255, 215, 120, 1),
      0 0 68px rgba(244, 164, 96, 0.9);
  }
  22%  { transform: scale(1.18) rotate(-2.8deg); }
  34%  { transform: scale(1.08) rotate(2.4deg); }
  45%  {
    transform: scale(1.16) rotate(-1.2deg);
    opacity: 1;
    filter: brightness(1.6) saturate(1.3);
  }
  72%  { transform: scale(0.98) rotate(0.8deg); }
  100% { transform: scale(1) rotate(0deg); filter: brightness(1) saturate(1); }
}
@keyframes chain-recipe-glow {
  0%, 100% {
    filter: brightness(1);
    text-shadow:
      0 1px 2px rgba(0, 0, 0, 0.92),
      0 0 16px rgba(255, 215, 120, 0.58),
      0 0 30px rgba(244, 164, 96, 0.34);
  }
  50% {
    filter: brightness(1.14);
    text-shadow:
      0 1px 2px rgba(0, 0, 0, 0.92),
      0 0 24px rgba(255, 215, 120, 0.92),
      0 0 46px rgba(244, 164, 96, 0.58);
  }
}

.chain-banner-reset {
  width: 24px;
  height: 24px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.22);
  background: rgba(20, 16, 28, 0.7);
  color: var(--color-flame);
  cursor: pointer;
  font-weight: 800;
  font-family: inherit;
  font-size: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-left: 4px;
}
.chain-banner-reset:hover { background: rgba(244, 164, 96, 0.18); }

/* Melt/recipe highlight in the activity log. */
.score-log-gauge {
  box-shadow: inset 3px 0 0 rgba(145, 174, 210, 1);
  background: rgba(145, 174, 210, 0.1);
}
.score-log-gauge .score-log-delta { color: rgba(213, 230, 255, 1); }
.score-log-melt {
  box-shadow: inset 3px 0 0 rgba(255, 215, 120, 1);
  background: rgba(255, 215, 120, 0.08);
}
.score-log-melt .score-log-delta { color: rgba(255, 232, 168, 1); }
/* Wax hardening: a white shell overlay plus a small turn badge. */
.cell.card.is-freeze-triggering {
  animation: wax-freeze-impact 0.42s cubic-bezier(0.16, 0.9, 0.18, 1);
  z-index: 8;
}
.cell.card.is-freeze-triggering .card-face::before {
  content: '';
  position: absolute;
  inset: -2px;
  border-radius: inherit;
  border: 2px solid rgba(246, 250, 255, 0.9);
  box-shadow: 0 0 22px rgba(214, 228, 238, 0.62);
  pointer-events: none;
}
@keyframes wax-freeze-impact {
  0% { transform: scale(1); filter: brightness(1) saturate(1); }
  45% { transform: scale(1.08); filter: brightness(1.42) saturate(0.72); }
  100% { transform: scale(1); filter: brightness(1.08) saturate(0.86); }
}
.cell.card.is-wax-thawing {
  animation: wax-thaw-crack 0.62s cubic-bezier(0.16, 0.9, 0.18, 1);
  z-index: 9;
}
@keyframes wax-thaw-crack {
  0% { transform: scale(1); filter: brightness(1.02) saturate(0.88); }
  42% { transform: scale(1.045); filter: brightness(1.36) saturate(0.72); }
  100% { transform: scale(1); filter: brightness(1) saturate(1); }
}
.cell.card.is-frozen .card-face::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.34), rgba(232, 238, 246, 0.08)),
    repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.22) 0 4px, transparent 4px 12px);
  mix-blend-mode: screen;
  pointer-events: none;
  animation: wax-harden-shimmer 1.6s ease-in-out infinite alternate;
}
.frozen-badge {
  position: absolute;
  top: 6px;
  left: 8px;
  z-index: 6;
  padding: 2px 7px;
  border-radius: 999px;
  color: #1c1424;
  background: rgba(228, 234, 244, 0.88);
  border: 1px solid rgba(255, 255, 255, 0.62);
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0.04em;
  box-shadow: 0 0 6px rgba(216, 232, 248, 0.22);
}
.bomb-badge,
.spore-badge {
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  letter-spacing: 0.04em;
  text-shadow:
    0 1px 3px rgba(0, 0, 0, 0.92),
    0 0 9px currentColor;
  animation: trap-turn-label-glimmer 1.9s ease-in-out infinite;
}
@keyframes trap-turn-label-glimmer {
  0%, 100% { opacity: 0.78; filter: brightness(1); }
  45% { opacity: 1; filter: brightness(1.26); }
}
@keyframes wax-harden-shimmer {
  from { opacity: 0.72; filter: brightness(1); }
  to { opacity: 0.95; filter: brightness(1.18); }
}

/* ─── Mobile landscape: hand card sizing ────────────────────────────────── */
/* The 3-column layout is restored by GameBoardPlayerShopStyles.ts so the
   hand panel is back in its own right column (~120-180px wide). Width/margin
   constraints are not needed; we only need to scale card heights to fit the
   full viewport height available to the hand column. */
@media (max-width: 760px) and (orientation: landscape) {
  /* Non-crowded (< 8 cards): each card claims a fair share of the panel height.
     125px accounts for game-shell padding + panel header + combo gauge + gaps. */
  .hand-slot.hand-card {
    min-height: clamp(30px, calc((100vh - 125px) / var(--hand-count, 6)), 78px);
  }
  /* Crowded (8+ cards): compress further so all 10 cards stay inside the panel. */
  .hand-stack.is-crowded .hand-slot.hand-card {
    min-height: clamp(22px, calc((100vh - 125px) / var(--hand-count, 10)), 78px);
  }
  .hand-card-preview {
    /* Narrower preview to match the narrower hand column. */
    width: clamp(108px, 19vw, 155px);
  }
  /* Recipe preview needs ~430px horizontal space — not available in landscape. */
  .hand-recipe-preview { display: none !important; }
}

/* ─── Mobile touch: is-touch-previewing mirrors :hover / :focus-within ─── */
/* Scoped to (hover: none) so PC :hover rules are never overridden. */
@media (hover: none) and (pointer: coarse) {
  .hand-slot.hand-card.is-touch-previewing {
    transform: translateY(-2px);
    z-index: 32;
    box-shadow:
      0 6px 18px rgba(0, 0, 0, 0.55),
      0 0 14px rgba(255, 215, 120, 0.35);
  }
  .hand-slot.hand-card.is-touch-previewing .hand-card-preview {
    display: block;
    animation: hand-preview-flip 0.62s cubic-bezier(0.16, 0.84, 0.2, 1) forwards;
  }
  .hand-slot.is-low-preview.is-touch-previewing .hand-card-preview {
    animation-name: hand-preview-low-flip;
  }
  .hand-slot.hand-card.is-touch-previewing .hand-card-preview::before {
    animation: hand-preview-back-flip 0.62s cubic-bezier(0.16, 0.84, 0.2, 1) forwards;
  }
  .hand-slot.is-low-preview.is-touch-previewing .hand-card-preview::before {
    animation: hand-preview-back-flip 0.62s cubic-bezier(0.16, 0.84, 0.2, 1) forwards;
  }
  .hand-slot.hand-card.is-recipe-ready.is-touch-previewing .hand-recipe-preview {
    display: grid;
    gap: 7px;
    animation: recipe-preview-slide 0.28s cubic-bezier(0.16, 0.84, 0.2, 1) forwards;
  }
  .hand-slot.is-low-preview.is-recipe-ready.is-touch-previewing .hand-recipe-preview {
    animation-name: recipe-preview-low-slide;
  }
}

/* 손패 등급별 테두리 + 은은한 발광 — is-recipe-ready/is-merged 등 강조 상태와 겹쳐도
   자연스럽게 보이도록 box-shadow 합성으로 처리한다. */
.hand-slot.hand-card.rarity-rare     { border-color: rgba(80, 152, 255, 0.38); box-shadow: 0 0 10px rgba(80, 152, 255, 0.16), inset 0 0 8px rgba(80, 152, 255, 0.08); }
.hand-slot.hand-card.rarity-epic     { border-color: rgba(210, 50, 235, 0.44); box-shadow: 0 0 12px rgba(210, 50, 235, 0.20), inset 0 0 8px rgba(210, 50, 235, 0.10); }
.hand-slot.hand-card.rarity-unique   { border-color: rgba(242, 212, 92, 0.46); box-shadow: 0 0 14px rgba(242, 212, 92, 0.22), inset 0 0 9px rgba(242, 212, 92, 0.1); }
.hand-slot.hand-card.rarity-legendary { border-color: rgba(220, 78, 78, 0.46); box-shadow: 0 0 14px rgba(220, 78, 78, 0.22), inset 0 0 9px rgba(220, 78, 78, 0.1); }
`
