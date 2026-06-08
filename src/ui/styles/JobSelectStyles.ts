/**
 * Job selection overlay — in-rail coverflow shown once at game start
 * (before the player intro dialogue). Cards are stacked like a fanned poker
 * hand: the centre card is largest/brightest, side cards shrink, dim and tilt
 * away with a separating shadow. The carousel loops infinitely; arrows, drag
 * and clicking a side card flip a new job to the centre. Clicking the centre
 * card confirms — it glows, settles smaller, then flies on as a flight ghost.
 * Candlelight + parchment palette.
 */
export const JOB_SELECT_STYLES = `
/* ─── Overlay shell ────────────────────────────────────────────────── */
#job-select-overlay {
  position: fixed;
  inset: 0;
  z-index: 200;
  pointer-events: none;
  animation: job-overlay-in 0.24s ease both;
}

.job-select-rail-shell {
  position: fixed;
  z-index: 201;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: clamp(8px, 1.6vh, 18px);
  padding: clamp(10px, 2.1vh, 24px) clamp(8px, 1.2vw, 18px);
  overflow: hidden;
  pointer-events: auto;
  border-radius: clamp(18px, 3.2vh, 28px);
  background:
    radial-gradient(circle at 50% 36%, rgba(72, 44, 92, 0.5), transparent 68%),
    radial-gradient(circle at 50% 118%, rgba(111, 62, 31, 0.28), transparent 64%),
    rgba(5, 3, 10, 0.66);
  box-shadow:
    inset 0 0 0 1px rgba(255, 215, 120, 0.14),
    inset 0 0 48px rgba(0, 0, 0, 0.76),
    0 18px 54px rgba(0, 0, 0, 0.48);
  backdrop-filter: blur(7px);
}

.job-select-content-bundle {
  position: relative;
  z-index: 4;
  width: 100%;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: clamp(8px, 1.5vh, 16px);
  animation: job-content-in 0.45s 0.32s ease both;
}

.job-rail-curtain {
  position: absolute;
  top: 0;
  bottom: 0;
  z-index: 3;
  width: 54%;
  pointer-events: none;
  /* 바깥쪽(outer edge)은 두껍고 불투명, 안쪽(center-facing edge)은 투명으로 페이드해
     두 커튼이 겹치는 중간 지점에서 경계선 없이 자연스럽게 이어진다. */
  background:
    linear-gradient(90deg,
      rgba(0, 0, 0, 0.58) 0%,
      rgba(7, 5, 13, 0.94) 18%,
      rgba(21, 15, 33, 0.96) 56%,
      rgba(6, 4, 12, 0.98) 74%,
      rgba(6, 4, 12, 0) 100%),
    repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.028) 0 1px, transparent 1px 18px);
  /* 바깥 가장자리에만 따뜻한 광택, 안쪽 inset shadow 제거(겹침 경계 방지) */
  box-shadow: inset 10px 0 26px rgba(255, 232, 168, 0.03);
  filter: saturate(0.85);
  animation: job-curtain-close-left 0.68s cubic-bezier(0.16, 0.84, 0.24, 1) both;
}
.job-rail-curtain--left { left: 0; }
.job-rail-curtain--right {
  right: 0;
  /* 270deg로 방향을 반전 — 안쪽(왼쪽) 끝도 동일하게 투명으로 페이드. */
  background:
    linear-gradient(270deg,
      rgba(0, 0, 0, 0.58) 0%,
      rgba(7, 5, 13, 0.94) 18%,
      rgba(21, 15, 33, 0.96) 56%,
      rgba(6, 4, 12, 0.98) 74%,
      rgba(6, 4, 12, 0) 100%),
    repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.028) 0 1px, transparent 1px 18px);
  box-shadow: inset -10px 0 26px rgba(255, 232, 168, 0.03);
  animation-name: job-curtain-close-right;
}

#job-select-overlay.job-select--picked .job-select-content-bundle {
  opacity: 0;
  transform: translateY(-8px) scale(0.98);
  transition: opacity 0.34s ease, transform 0.34s ease;
  pointer-events: none;
}
#job-select-overlay.job-select--opening { pointer-events: none; }
#job-select-overlay.job-select--opening .job-select-rail-shell { background: transparent; box-shadow: none; backdrop-filter: none; transition: background 0.36s ease, box-shadow 0.36s ease, backdrop-filter 0.36s ease; }
#job-select-overlay.job-select--opening .job-select-content-bundle { opacity: 0; pointer-events: none; }
#job-select-overlay.job-select--opening .job-rail-curtain--left { animation: job-curtain-open-left 0.72s cubic-bezier(0.18, 0.82, 0.25, 1) forwards; }
#job-select-overlay.job-select--opening .job-rail-curtain--right { animation: job-curtain-open-right 0.72s cubic-bezier(0.18, 0.82, 0.25, 1) forwards; }

@keyframes job-overlay-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes job-content-in { from { opacity: 0; transform: translateY(12px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
@keyframes job-curtain-close-left { from { transform: translateX(-104%) skewX(-2deg); } to { transform: translateX(0) skewX(0deg); } }
@keyframes job-curtain-close-right { from { transform: translateX(104%) skewX(2deg); } to { transform: translateX(0) skewX(0deg); } }
@keyframes job-curtain-open-left { from { transform: translateX(0) skewX(0deg); opacity: 1; } to { transform: translateX(-104%) skewX(-2deg); opacity: 0.78; } }
@keyframes job-curtain-open-right { from { transform: translateX(0) skewX(0deg); opacity: 1; } to { transform: translateX(104%) skewX(2deg); opacity: 0.78; } }

/* ─── Title with rule lines ────────────────────────────────────────── */
.job-select-header {
  display: flex;
  align-items: center;
  gap: clamp(12px, 1.6vw, 26px);
  flex: 0 0 auto;
  animation: job-card-enter 0.4s ease both;
}
.job-select-rule {
  display: block;
  width: clamp(40px, 8vw, 130px);
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(255, 215, 120, 0.55), transparent);
}
.job-select-title {
  font-family: 'OkDanDan', Georgia, serif;
  font-size: clamp(20px, 3vh, 34px);
  font-weight: 900;
  letter-spacing: 0.22em;
  margin: 0;
  padding-left: 0.22em;
  color: rgba(255, 236, 188, 0.94);
  text-shadow: 0 2px 16px rgba(0, 0, 0, 0.95), 0 0 30px rgba(244, 164, 96, 0.26);
}
/* Title gently fades out as the pick resolves into the game */
#job-select-overlay.is-resolving .job-select-header {
  opacity: 0;
  transition: opacity 0.5s ease;
}

/* ─── Stage: arrows flank the coverflow ────────────────────────────── */
.job-select-stage {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  flex: 1 1 auto;
  min-height: 0;
}

/* Coverflow viewport — cards are absolutely centred and transformed by JS */
.job-coverflow {
  position: relative;
  width: 100%;
  height: 100%;
  perspective: 1500px;
  touch-action: pan-y;
  cursor: grab;
}
.job-coverflow.is-dragging { cursor: grabbing; }

/* ─── Individual job card — narrower than trial cards (2:3) ────────── */
.job-card {
  position: absolute;
  left: 50%;
  top: 50%;
  /* transform/opacity/filter/z-index are driven inline by the coverflow JS;
     translate(-50%,-50%) base keeps cards centred before the offset. */
  transform: translate(-50%, -50%);
  height: min(78%, 420px);
  aspect-ratio: 2 / 3;
  cursor: pointer;
  padding: 0;
  border: 1px solid rgba(255, 215, 120, 0.26);
  border-radius: 16px;
  overflow: hidden;
  background: linear-gradient(180deg, rgba(26, 18, 38, 0.96) 0%, rgba(8, 5, 14, 0.99) 100%);
  /* Separating drop shadow so stacked cards read as distinct sheets */
  box-shadow:
    inset 0 1px 0 rgba(255, 232, 168, 0.1),
    0 14px 34px rgba(0, 0, 0, 0.66),
    0 4px 12px rgba(0, 0, 0, 0.5);
  text-align: left;
  transform-style: preserve-3d;
  transition: transform 0.42s cubic-bezier(0.2, 0.84, 0.3, 1),
              opacity 0.42s ease,
              filter 0.42s ease,
              box-shadow 0.3s ease,
              border-color 0.3s ease;
  will-change: transform, opacity, filter;
}
/* During drag the cards track the pointer with no easing lag */
.job-coverflow.is-dragging .job-card { transition: none; }

/* Centre card — brightest, sharpest, strongest glow/separation */
.job-card.is-center {
  border-color: rgba(255, 222, 140, 0.6);
  box-shadow:
    inset 0 1px 0 rgba(255, 232, 168, 0.24),
    0 26px 60px rgba(0, 0, 0, 0.82),
    0 0 0 1px rgba(220, 170, 70, 0.3),
    0 0 40px rgba(244, 164, 96, 0.22);
}
.job-card.is-center:hover:not(.job-card--locked) {
  border-color: rgba(255, 222, 140, 0.92);
  box-shadow:
    inset 0 1px 0 rgba(255, 232, 168, 0.32),
    0 30px 64px rgba(0, 0, 0, 0.86),
    0 0 0 1px rgba(220, 170, 70, 0.5),
    0 0 52px rgba(244, 164, 96, 0.34);
}
.job-card:focus-visible { outline: none; }

@keyframes job-card-enter {
  from { opacity: 0; transform: translateY(26px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* Locked centre card click is denied with a small shake */
.job-card.is-denied { animation: job-card-deny 0.4s ease; }
@keyframes job-card-deny {
  0%, 100% { margin-left: 0; }
  20% { margin-left: -7px; }
  50% { margin-left: 6px; }
  80% { margin-left: -4px; }
}

/* ─── Illustration area — fills the whole card; scrim sits on top ─── */
.job-card__art {
  position: absolute;
  inset: 0;
  background-size: cover;
  background-position: center 22%;
  background-repeat: no-repeat;
}
.job-card__art--empty {
  display: flex;
  align-items: center;
  justify-content: center;
  background:
    radial-gradient(circle at 50% 40%, rgba(255, 232, 168, 0.1), transparent 62%),
    repeating-linear-gradient(135deg,
      rgba(255, 255, 255, 0.018) 0px,
      rgba(255, 255, 255, 0.018) 2px,
      transparent 2px, transparent 9px),
    linear-gradient(180deg, rgba(34, 24, 46, 0.9), rgba(12, 8, 18, 0.95));
}
.job-card__symbol {
  width: clamp(48px, 8vh, 100px);
  height: clamp(48px, 8vh, 100px);
  color: rgba(255, 215, 120, 0.42);
  filter: drop-shadow(0 4px 18px rgba(0, 0, 0, 0.6));
}

/* Sheen sweep only on the focused centre card */
.job-card__sheen {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(115deg, transparent 38%, rgba(255, 240, 200, 0.16) 50%, transparent 62%);
  transform: translateX(-120%);
  transition: transform 0.6s ease;
}
.job-card.is-center:hover:not(.job-card--locked) .job-card__sheen {
  transform: translateX(120%);
}

/* ─── Bottom scrim with text ───────────────────────────────────────── */
.job-card__scrim {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  gap: clamp(3px, 0.7vh, 8px);
  padding: clamp(30px, 4.6vh, 54px) clamp(11px, 0.9vw, 18px) clamp(12px, 1.7vh, 19px);
  background: linear-gradient(180deg,
    transparent 0%,
    rgba(8, 5, 14, 0.55) 30%,
    rgba(6, 4, 11, 0.92) 68%,
    rgba(5, 3, 10, 0.98) 100%);
}

.job-card__name {
  font-family: 'OkDanDan', Georgia, serif;
  font-size: clamp(14px, 2.1vh, 24px);
  font-weight: 900;
  letter-spacing: 0.05em;
  line-height: 1.15;
  color: rgba(255, 238, 196, 0.98);
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.95), 0 0 18px rgba(244, 164, 96, 0.2);
}

.job-card__divider {
  width: clamp(26px, 2.6vw, 48px);
  height: 2px;
  border-radius: 2px;
  background: linear-gradient(90deg, rgba(255, 215, 120, 0.78), rgba(255, 215, 120, 0.05));
  margin: clamp(1px, 0.4vh, 4px) 0;
}

.job-card__traits {
  font-family: 'OkDanDan', Georgia, serif;
  font-size: clamp(10px, 1.4vh, 14px);
  color: rgba(206, 192, 170, 0.82);
  line-height: 1.4;
}

.job-card__stats {
  font-family: 'OkDanDan', Georgia, serif;
  font-size: clamp(11px, 1.6vh, 16px);
  font-weight: 800;
  color: rgba(248, 206, 120, 0.96);
  line-height: 1.3;
  text-shadow: 0 1px 5px rgba(0, 0, 0, 0.85);
}

.job-card__flavor {
  font-family: 'OkDanDan', Georgia, serif;
  font-size: clamp(9px, 1.2vh, 12px);
  color: rgba(186, 170, 150, 0.6);
  line-height: 1.5;
  font-style: italic;
  margin-top: clamp(2px, 0.5vh, 6px);
  padding-top: clamp(4px, 0.7vh, 8px);
  border-top: 1px solid rgba(255, 255, 255, 0.07);
}

/* ─── Stat color coding: golden for gains, red for losses ──────────── */
.job-up { color: rgba(255, 215, 100, 0.96); }
.job-dn { color: rgba(220, 80, 60, 0.96); }

/* ─── Locked card ──────────────────────────────────────────────────── */
.job-card--locked { cursor: not-allowed; }
.job-card__lock {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  z-index: 4;
  pointer-events: none;
  background: rgba(0, 0, 0, 0.5);
  color: rgba(220, 206, 184, 0.7);
}
.job-card__lock-icon {
  width: clamp(28px, 4vh, 46px);
  height: clamp(28px, 4vh, 46px);
  filter: drop-shadow(0 3px 10px rgba(0, 0, 0, 0.7));
}
.job-card__lock-label {
  font-family: 'OkDanDan', Georgia, serif;
  font-size: clamp(11px, 1.5vh, 15px);
  letter-spacing: 0.14em;
  color: rgba(220, 206, 184, 0.72);
}

/* ─── Resolving: everything but the chosen card dims away ──────────── */
#job-select-overlay.is-resolving .job-card:not(.job-card--selected) {
  opacity: 0.08 !important;
  filter: grayscale(0.7) brightness(0.35) !important;
  transition: opacity 0.42s ease, filter 0.42s ease;
}
#job-select-overlay.is-resolving .job-nav { opacity: 0 !important; }

/* Chosen card: glowing afterimage flare, then settles a touch smaller */
.job-card--selected {
  border-color: rgba(255, 222, 140, 0.95) !important;
  box-shadow:
    inset 0 1px 0 rgba(255, 232, 168, 0.4),
    0 0 0 2px rgba(255, 222, 140, 0.7),
    0 0 64px rgba(244, 164, 96, 0.55),
    0 30px 64px rgba(0, 0, 0, 0.9) !important;
  z-index: 130 !important;
  animation: job-card-pick 0.46s ease forwards !important;
}
@keyframes job-card-pick {
  0%   { transform: translate(-50%, -50%) scale(1); filter: brightness(1); }
  38%  { transform: translate(-50%, -50%) scale(1.08); filter: brightness(1.28); }
  100% { transform: translate(-50%, -50%) scale(0.96); filter: brightness(1.08); }
}

/* ─── Flight ghost (lives on body, flies/blasts after overlay removal) ─ */
.job-flight-card {
  border-radius: 16px;
  overflow: hidden;
  animation: none !important;
  box-shadow:
    0 0 56px rgba(244, 164, 96, 0.5),
    0 24px 60px rgba(0, 0, 0, 0.85);
}
.job-flight-card.is-emitting { animation: job-flight-pulse 0.6s ease-in-out infinite !important; }
@keyframes job-flight-pulse {
  0%, 100% { filter: brightness(1.06); }
  50% { filter: brightness(1.26); }
}

/* ─── Carousel arrows — transparent, reveal subtly on overlay hover ── */
.job-nav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  z-index: 120;
  display: flex;
  align-items: center;
  justify-content: center;
  width: clamp(42px, 4.6vw, 64px);
  height: clamp(42px, 4.6vw, 64px);
  border-radius: 50%;
  border: 1px solid rgba(255, 215, 120, 0.28);
  background: rgba(12, 8, 20, 0.6);
  color: rgba(255, 232, 168, 0.92);
  cursor: pointer;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.26s ease, background 0.2s ease, border-color 0.2s ease, transform 0.18s ease;
  backdrop-filter: blur(3px);
}
.job-nav--left  { left: clamp(4px, 2vw, 40px); }
.job-nav--right { right: clamp(4px, 2vw, 40px); }
.job-nav > svg { width: 56%; height: 56%; }

#job-select-overlay.has-overflow .job-nav { pointer-events: auto; }
#job-select-overlay.has-overflow:hover .job-nav { opacity: 0.42; }
#job-select-overlay.has-overflow .job-nav:hover {
  opacity: 1;
  background: rgba(28, 18, 34, 0.86);
  border-color: rgba(255, 222, 140, 0.7);
  transform: translateY(-50%) scale(1.08);
}

/* ─── Narrow screens keep the centre card readable ──────────────────── */
@media (max-width: 680px) {
  .job-card { height: min(72%, 340px); }
  .job-select-title { font-size: clamp(16px, 2.7vh, 24px); }
}
`
