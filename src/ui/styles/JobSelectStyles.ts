/**
 * Job selection overlay — full-screen character-select shown once at game start
 * (before the player intro dialogue). Tall cards nearly fill the screen; each
 * card is dominated by its illustration (job_001~) with a bottom scrim carrying
 * the name / trait / stat / flavor. Candlelight + parchment palette.
 */
export const JOB_SELECT_STYLES = `
/* ─── Overlay shell ────────────────────────────────────────────────── */
#job-select-overlay {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: clamp(10px, 1.8vh, 22px);
  padding: clamp(12px, 2.4vh, 30px) clamp(14px, 2vw, 40px);
  background:
    radial-gradient(circle at 50% 36%, rgba(46, 30, 60, 0.55), transparent 70%),
    radial-gradient(circle at 50% 120%, rgba(80, 44, 24, 0.35), transparent 60%),
    rgba(5, 3, 10, 0.97);
  backdrop-filter: blur(12px);
  animation: job-overlay-in 0.34s ease both;
}

#job-select-overlay.job-select--exiting {
  animation: job-overlay-out 0.4s ease forwards;
  pointer-events: none;
}

@keyframes job-overlay-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes job-overlay-out { from { opacity: 1; } to { opacity: 0; transform: scale(1.015); } }

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

/* ─── Card row — fills the screen ──────────────────────────────────── */
.job-select-cards {
  display: flex;
  flex-direction: row;
  gap: clamp(8px, 0.9vw, 18px);
  align-items: stretch;
  justify-content: center;
  width: 100%;
  flex: 1 1 auto;
  min-height: 0;
  max-width: 1700px;
}

/* ─── Individual job card ──────────────────────────────────────────── */
.job-card {
  flex: 1 1 0;
  min-width: 0;
  height: 100%;
  position: relative;
  cursor: pointer;
  padding: 0;
  border: 1px solid rgba(255, 215, 120, 0.26);
  border-radius: 18px;
  overflow: hidden;
  background: linear-gradient(180deg, rgba(26, 18, 38, 0.96) 0%, rgba(8, 5, 14, 0.99) 100%);
  box-shadow:
    inset 0 1px 0 rgba(255, 232, 168, 0.12),
    0 18px 48px rgba(0, 0, 0, 0.72);
  text-align: left;
  transition: transform 0.2s ease, box-shadow 0.24s ease, border-color 0.22s ease, filter 0.2s ease;
  animation: job-card-enter 0.42s ease both;
  will-change: transform;
}

.job-card:hover:not(.job-card--locked),
.job-card:focus-visible:not(.job-card--locked) {
  transform: translateY(-10px) scale(1.025);
  border-color: rgba(255, 222, 140, 0.85);
  box-shadow:
    inset 0 1px 0 rgba(255, 232, 168, 0.3),
    0 28px 60px rgba(0, 0, 0, 0.85),
    0 0 0 1px rgba(220, 170, 70, 0.42),
    0 0 36px rgba(244, 164, 96, 0.24);
  z-index: 3;
}
.job-card:focus-visible { outline: none; }

/* Staggered entrance (up to 6 cards) */
.job-select-cards > .job-card:nth-child(1) { animation-delay:  80ms; }
.job-select-cards > .job-card:nth-child(2) { animation-delay: 150ms; }
.job-select-cards > .job-card:nth-child(3) { animation-delay: 220ms; }
.job-select-cards > .job-card:nth-child(4) { animation-delay: 290ms; }
.job-select-cards > .job-card:nth-child(5) { animation-delay: 360ms; }
.job-select-cards > .job-card:nth-child(6) { animation-delay: 430ms; }

@keyframes job-card-enter {
  from { opacity: 0; transform: translateY(26px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* ─── Illustration area — fills the whole card; scrim sits on top ─── */
.job-card__art {
  position: absolute;
  inset: 0;
  background-size: cover;
  background-position: center 22%;
  background-repeat: no-repeat;
  /* warm/cool grade so unkeyed art still matches the candlelit tone */
  filter: saturate(1.02) brightness(0.96);
  transition: transform 0.4s ease, filter 0.3s ease;
}
.job-card:hover:not(.job-card--locked) .job-card__art {
  transform: scale(1.06);
  filter: saturate(1.08) brightness(1.04);
}

/* Empty placeholder until job_00X.webp exists — centered symbol on a soft glow */
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
  width: clamp(58px, 11vh, 132px);
  height: clamp(58px, 11vh, 132px);
  color: rgba(255, 215, 120, 0.42);
  filter: drop-shadow(0 4px 18px rgba(0, 0, 0, 0.6));
}

/* Diagonal sheen sweep on hover */
.job-card__sheen {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(115deg, transparent 38%, rgba(255, 240, 200, 0.16) 50%, transparent 62%);
  transform: translateX(-120%);
  transition: transform 0.6s ease;
}
.job-card:hover:not(.job-card--locked) .job-card__sheen {
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
  padding: clamp(36px, 6vh, 64px) clamp(12px, 1vw, 20px) clamp(14px, 2vh, 22px);
  background: linear-gradient(180deg,
    transparent 0%,
    rgba(8, 5, 14, 0.55) 32%,
    rgba(6, 4, 11, 0.92) 70%,
    rgba(5, 3, 10, 0.98) 100%);
  transition: padding 0.2s ease;
}

.job-card__name {
  font-family: 'OkDanDan', Georgia, serif;
  font-size: clamp(15px, 2.3vh, 26px);
  font-weight: 900;
  letter-spacing: 0.05em;
  line-height: 1.15;
  color: rgba(255, 238, 196, 0.98);
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.95), 0 0 18px rgba(244, 164, 96, 0.2);
}

.job-card__divider {
  width: clamp(28px, 3vw, 52px);
  height: 2px;
  border-radius: 2px;
  background: linear-gradient(90deg, rgba(255, 215, 120, 0.78), rgba(255, 215, 120, 0.05));
  margin: clamp(1px, 0.4vh, 4px) 0;
}

.job-card__traits {
  font-family: 'OkDanDan', Georgia, serif;
  font-size: clamp(11px, 1.5vh, 15px);
  color: rgba(206, 192, 170, 0.82);
  line-height: 1.4;
}

.job-card__stats {
  font-family: 'OkDanDan', Georgia, serif;
  font-size: clamp(12px, 1.7vh, 17px);
  font-weight: 800;
  color: rgba(248, 206, 120, 0.96);
  line-height: 1.3;
  text-shadow: 0 1px 5px rgba(0, 0, 0, 0.85);
}

.job-card__flavor {
  font-family: 'OkDanDan', Georgia, serif;
  font-size: clamp(10px, 1.3vh, 13px);
  color: rgba(186, 170, 150, 0.6);
  line-height: 1.5;
  font-style: italic;
  margin-top: clamp(2px, 0.6vh, 7px);
  padding-top: clamp(4px, 0.8vh, 9px);
  border-top: 1px solid rgba(255, 255, 255, 0.07);
}

/* ─── Locked card ──────────────────────────────────────────────────── */
.job-card--locked {
  cursor: not-allowed;
  filter: grayscale(0.6) brightness(0.42) saturate(0.5);
}
.job-card--locked:hover { transform: none; }

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
  background: rgba(0, 0, 0, 0.34);
  color: rgba(220, 206, 184, 0.7);
}
.job-card__lock-icon {
  width: clamp(28px, 4vh, 48px);
  height: clamp(28px, 4vh, 48px);
  filter: drop-shadow(0 3px 10px rgba(0, 0, 0, 0.7));
}
.job-card__lock-label {
  font-family: 'OkDanDan', Georgia, serif;
  font-size: clamp(11px, 1.5vh, 15px);
  letter-spacing: 0.14em;
  color: rgba(220, 206, 184, 0.72);
}

/* ─── Selected pick animation before exit ──────────────────────────── */
.job-card--selected {
  border-color: rgba(255, 222, 140, 0.95) !important;
  box-shadow:
    inset 0 1px 0 rgba(255, 232, 168, 0.4),
    0 0 0 2px rgba(255, 222, 140, 0.7),
    0 0 56px rgba(244, 164, 96, 0.5),
    0 30px 64px rgba(0, 0, 0, 0.9) !important;
  z-index: 5;
  animation: job-card-pick 0.42s ease forwards;
}
@keyframes job-card-pick {
  0%   { transform: translateY(-10px) scale(1.025); }
  35%  { transform: translateY(-14px) scale(1.07); filter: brightness(1.18); }
  100% { transform: translateY(-12px) scale(1.05); filter: brightness(1.1); }
}

/* ─── Narrow screens: allow horizontal scroll instead of crushing cards ─ */
@media (max-width: 680px) {
  .job-select-cards {
    overflow-x: auto;
    justify-content: flex-start;
    padding-bottom: 6px;
  }
  .job-card {
    flex: 0 0 clamp(150px, 44vw, 210px);
  }
}
`
