/**
 * Job selection overlay — full-screen, shown once at game start before the
 * player intro dialogue. Shares the candlelight/parchment colour palette
 * with the shop / trial cards.
 */
export const JOB_SELECT_STYLES = `
/* ─── Job Select Overlay ───────────────────────────────────────────── */
#job-select-overlay {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: clamp(14px, 2.2vh, 28px);
  padding: clamp(10px, 1.8vh, 22px) clamp(10px, 1.6vw, 22px);
  background: rgba(6, 3, 12, 0.96);
  backdrop-filter: blur(10px);
  animation: job-overlay-in 0.32s ease both;
}

#job-select-overlay.job-select--exiting {
  animation: job-overlay-out 0.35s ease forwards;
  pointer-events: none;
}

@keyframes job-overlay-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}
@keyframes job-overlay-out {
  from { opacity: 1; }
  to   { opacity: 0; }
}

.job-select-title {
  font-family: 'OkDanDan', Georgia, serif;
  font-size: clamp(18px, 2.6vh, 30px);
  font-weight: 900;
  letter-spacing: 0.1em;
  color: rgba(255, 232, 168, 0.88);
  text-shadow: 0 2px 14px rgba(0, 0, 0, 0.95), 0 0 28px rgba(244, 164, 96, 0.18);
  margin: 0;
}

/* Card row — flex so 5-6 cards scale naturally */
.job-select-cards {
  display: flex;
  flex-direction: row;
  gap: clamp(8px, 1vw, 16px);
  align-items: stretch;
  width: 100%;
  max-width: clamp(560px, 88vw, 1200px);
  /* Never taller than the viewport minus title row */
  max-height: calc(100vh - clamp(60px, 10vh, 110px));
}

/* Individual job card */
.job-card {
  flex: 1 1 0;
  min-width: 0;
  aspect-ratio: 3 / 4.6;
  cursor: pointer;
  border: 1px solid rgba(255, 215, 120, 0.24);
  border-radius: 14px;
  background:
    radial-gradient(circle at 50% 12%, rgba(255, 232, 168, 0.06), transparent 55%),
    linear-gradient(180deg, rgba(22, 14, 32, 0.98) 0%, rgba(10, 6, 16, 0.99) 100%);
  box-shadow:
    inset 0 1px 0 rgba(255, 232, 168, 0.1),
    0 14px 36px rgba(0, 0, 0, 0.72);
  display: grid;
  grid-template-rows: 36% 1fr;
  overflow: hidden;
  position: relative;
  /* text-align reset so inherited 'center' from <button> doesn't bleed in */
  text-align: left;
  transition: scale 0.18s ease, box-shadow 0.22s ease, border-color 0.2s ease, filter 0.18s ease;
  animation: job-card-enter 0.38s ease both;
}

.job-card:hover:not(.job-card--locked) {
  scale: 1.04;
  border-color: rgba(255, 215, 120, 0.65);
  box-shadow:
    inset 0 1px 0 rgba(255, 232, 168, 0.22),
    0 18px 44px rgba(0, 0, 0, 0.82),
    0 0 0 1px rgba(200, 160, 60, 0.32);
}

.job-card:focus-visible {
  outline: 2px solid rgba(255, 215, 120, 0.7);
  outline-offset: 2px;
}

/* Entrance stagger (up to 6 cards) */
.job-select-cards > .job-card:nth-child(1) { animation-delay:  60ms; }
.job-select-cards > .job-card:nth-child(2) { animation-delay: 130ms; }
.job-select-cards > .job-card:nth-child(3) { animation-delay: 200ms; }
.job-select-cards > .job-card:nth-child(4) { animation-delay: 270ms; }
.job-select-cards > .job-card:nth-child(5) { animation-delay: 340ms; }
.job-select-cards > .job-card:nth-child(6) { animation-delay: 410ms; }

@keyframes job-card-enter {
  from { opacity: 0; transform: translateY(18px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* Symbol panel — top 36% */
.job-card__symbol {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: clamp(10px, 1.6vh, 20px);
  color: rgba(255, 215, 120, 0.68);
  border-bottom: 1px solid rgba(160, 90, 40, 0.3);
  background: radial-gradient(circle at 50% 35%, rgba(255, 232, 168, 0.07), transparent 66%);
}

.job-card__symbol > svg {
  width: clamp(36px, 5.2vh, 64px);
  height: clamp(36px, 5.2vh, 64px);
}

/* Body — everything below the symbol */
.job-card__body {
  display: flex;
  flex-direction: column;
  gap: clamp(3px, 0.6vh, 7px);
  padding: clamp(8px, 1.2vh, 14px) clamp(10px, 1.3vw, 16px) clamp(10px, 1.4vh, 16px);
  overflow: hidden;
}

.job-card__name {
  font-family: 'OkDanDan', Georgia, serif;
  font-size: clamp(13px, 1.85vh, 20px);
  font-weight: 900;
  letter-spacing: 0.05em;
  color: rgba(255, 232, 168, 0.95);
  text-shadow: 0 1px 6px rgba(0, 0, 0, 0.9);
  line-height: 1.2;
}

.job-card__traits {
  font-family: 'OkDanDan', Georgia, serif;
  font-size: clamp(11px, 1.3vh, 13px);
  color: rgba(200, 185, 165, 0.72);
  line-height: 1.45;
}

.job-card__stats {
  font-family: 'OkDanDan', Georgia, serif;
  font-size: clamp(12px, 1.5vh, 14px);
  font-weight: 700;
  color: rgba(244, 200, 118, 0.9);
  line-height: 1.35;
}

.job-card__flavor {
  font-family: 'OkDanDan', Georgia, serif;
  font-size: clamp(10px, 1.15vh, 12px);
  color: rgba(180, 162, 144, 0.56);
  line-height: 1.5;
  font-style: italic;
  margin-top: auto;
  padding-top: clamp(4px, 0.6vh, 8px);
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}

/* ── Locked card ─────────────────────────────────────────────────────── */
.job-card--locked {
  cursor: not-allowed;
  filter: brightness(0.38) saturate(0.45);
}

.job-card__lock {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  background: rgba(0, 0, 0, 0.38);
  z-index: 2;
  pointer-events: none;
  color: rgba(200, 185, 165, 0.55);
}

.job-card__lock-icon {
  width: clamp(24px, 3.4vh, 40px);
  height: clamp(24px, 3.4vh, 40px);
}

.job-card__lock-label {
  font-family: 'OkDanDan', Georgia, serif;
  font-size: clamp(10px, 1.2vh, 12px);
  letter-spacing: 0.06em;
  color: rgba(200, 185, 165, 0.55);
}

/* ── Selected flash before exit ──────────────────────────────────────── */
.job-card--selected {
  border-color: rgba(255, 215, 120, 0.9) !important;
  box-shadow:
    inset 0 1px 0 rgba(255, 232, 168, 0.38),
    0 0 0 2px rgba(255, 215, 120, 0.55),
    0 22px 48px rgba(0, 0, 0, 0.9) !important;
  filter: brightness(1.1);
  animation: job-card-pick 0.32s ease forwards;
}

@keyframes job-card-pick {
  0%   { scale: 1.04; }
  40%  { scale: 1.08; }
  100% { scale: 1.04; }
}
`
