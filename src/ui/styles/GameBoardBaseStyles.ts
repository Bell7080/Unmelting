/**
 * Base shell, left HUD, score panel, and stage scaffolding for the game board.
 * Split from GameBoardRenderer so renderer logic stays navigable.
 */
export const GAME_BOARD_BASE_STYLES = `

.icon {
  width: 1em;
  height: 1em;
  display: inline-block;
  vertical-align: -0.14em;
  flex-shrink: 0;
  color: currentColor;
}

.game-shell {
  width: 100%;
  height: 100vh;
  max-height: 100vh;
  display: grid;
  grid-template-columns:
    minmax(240px, 300px)
    minmax(0, 1fr)
    minmax(160px, 220px);
  gap: clamp(10px, 1.6vw, 20px);
  /* Ember HUD now sits at top:14-22px so the shell only needs ~40px to
     clear it. The TURN counter moved into the left-panel header so the
     old ~88px reservation for the centered turn overlay is gone. */
  padding: clamp(38px, 4.8vh, 56px) clamp(8px, 1.4vw, 18px) clamp(8px, 1.5vh, 16px);
  overflow: hidden;
  font-family: inherit;
  align-items: stretch;
}

.stage {
  width: 100%;
  min-width: 0;
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  gap: clamp(8px, 1.4vh, 14px);
  overflow: hidden;
}

/* ---------- Top-center Turn overlay ---------- */
/* The "Unmelting" brand was removed in favor of the in-place TURN counter
   — one less HUD element competing for the player's eye. The TURN number
   itself takes the spot and shimmers softly each time it advances. */
.left-panel {
  display: grid;
  grid-template-rows: auto 1fr;
  gap: 10px;
  min-height: 0;
  align-self: stretch;
  justify-self: start;
  width: 100%;
}

.turn-brand {
  display: inline-flex;
  align-items: baseline;
  gap: 10px;
  padding: 6px 10px 9px;
  border-bottom: 1px solid var(--color-border-soft);
  font-variant-numeric: tabular-nums;
}
.turn-brand-icon {
  display: inline-flex;
  align-items: center;
  color: var(--color-flame);
  font-size: clamp(18px, 2vw, 22px);
  align-self: center;
  filter: drop-shadow(0 0 8px rgba(255, 215, 120, 0.5));
}
.turn-brand-kicker {
  font-size: clamp(18px, 1.9vw, 23px);
  font-weight: 900;
  letter-spacing: 0.12em;
  color: rgba(255, 215, 120, 0.78);
  text-transform: uppercase;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.85);
}
.turn-brand-number {
  font-size: clamp(24px, 2.55vw, 31px);
  font-weight: 900;
  letter-spacing: 0.04em;
  color: var(--color-flame);
  line-height: 1;
  text-shadow:
    0 0 12px rgba(255, 215, 120, 0.55),
    0 0 26px rgba(244, 164, 96, 0.32),
    0 2px 4px rgba(0, 0, 0, 0.85);
  animation: turn-label-glimmer 2.6s ease-in-out infinite;
}
/* On turn advance, the number quickly bumps up with a brighter glow then
   settles. The class is added by render() only when the value actually
   changes; subsequent re-renders within the same turn don't re-trigger. */
.turn-brand.is-tick-popping .turn-brand-number {
  animation: turn-tick-pop 0.62s cubic-bezier(0.16, 0.9, 0.22, 1);
}
.turn-brand.is-tick-popping .turn-brand-kicker {
  animation: turn-tick-shimmer 0.62s ease-out;
}
@keyframes turn-label-glimmer {
  0%, 100% { filter: brightness(1); opacity: 0.92; }
  48% { filter: brightness(1.18); opacity: 1; }
  58% { filter: brightness(1.06); opacity: 0.96; }
}
@keyframes turn-tick-pop {
  0%   { transform: translateY(0) scale(1); filter: brightness(1.1); }
  28%  { transform: translateY(-3px) scale(1.16); filter: brightness(1.55) saturate(1.3); }
  62%  { transform: translateY(2px) scale(0.98); filter: brightness(1.22); }
  100% { transform: translateY(0) scale(1); filter: brightness(1); }
}
@keyframes turn-tick-shimmer {
  0%   { color: rgba(255, 215, 120, 0.78); text-shadow: 0 1px 3px rgba(0, 0, 0, 0.85); }
  35%  { color: rgba(255, 248, 210, 1); text-shadow: 0 0 12px rgba(255, 232, 168, 0.95), 0 1px 3px rgba(0, 0, 0, 0.85); }
  100% { color: rgba(255, 215, 120, 0.78); text-shadow: 0 1px 3px rgba(0, 0, 0, 0.85); }
}

/* ---------- Score / Activity Panel ---------- */
/* Translucent panel — the score numbers, coin and activity log are the
   actors here, so the back plate is intentionally close to invisible:
   no hard border, only a whisper of dark wash so the area still reads as
   a region without separating it from the rest of the candlelit room. */
.score-panel {
  display: grid;
  grid-template-rows: auto auto 1fr;
  gap: 10px;
  min-height: 0;
  padding: 12px;
  align-self: stretch;
  background: linear-gradient(180deg, rgba(20, 16, 28, 0.22), rgba(8, 5, 14, 0.32));
  border: 0;
  border-radius: 16px;
  box-shadow: none;
}

.coin-panel-total,
.score-panel-total {
  position: relative;
  padding: 12px;
  border: 0;
  border-radius: 14px;
  background: radial-gradient(circle at 50% 0%, rgba(255, 215, 120, 0.14), transparent 70%);
  /* overflow:visible so the score/coin pop sparkles (::before/::after that
     extend above and below the number) are not clipped by the panel's
     rounded box — visible was hidden previously which silently killed the
     coin sparkle that the score happened to retain. */
  overflow: visible;
}

.score-kicker {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--color-text-muted);
  letter-spacing: 0.1em;
}
.score-kicker-icon {
  display: inline-flex;
  align-items: center;
  color: var(--color-flame);
  font-size: 13px;
}

.coin-number,
.score-number {
  position: relative;
  margin-top: 4px;
  color: var(--color-flame);
  font-size: clamp(28px, 4vw, 42px);
  font-weight: 900;
  line-height: 1;
  text-shadow:
    0 0 8px rgba(255, 215, 120, 0.55),
    0 0 18px rgba(244, 164, 96, 0.3);
  font-variant-numeric: tabular-nums;
}

/* 불빛 수치는 화폐의 "10 $"와 대칭으로 앞쪽에 불빛(✦) 아이콘을 붙인다. 카운터 롤 애니메이션이
   숫자 span의 textContent를 덮어쓰므로 아이콘은 형제 span으로 분리해 둔다. */
.score-value-row {
  margin-top: 4px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.score-value-row .score-number {
  margin-top: 0;
}
.score-value-icon {
  display: inline-flex;
  align-items: center;
  color: var(--color-flame);
  font-size: clamp(20px, 2.9vw, 30px);
}
/* 화폐 키커는 ● 동전 대신 $ 글자를 쓴다. */
.score-kicker-icon--coin {
  font-weight: 900;
}

/* Pop on gain — exaggerates the original slot-pop with a brighter
   candle-flash and a second sparkle ring that arcs the OTHER way so the
   payoff reads as a proper "ding" instead of a small bounce. */
.coin-number.is-score-popping,
.score-number.is-score-popping {
  animation: score-slot-pop 0.72s cubic-bezier(0.16, 0.9, 0.22, 1);
  filter: drop-shadow(0 0 10px rgba(255, 215, 120, 0.5));
}

/* Shared numeric roll for resource HUD values beyond just score/coin. It keeps
   the existing warm candle glow but stays subtle inside dense labels like HP. */
[data-count-start].is-counter-ticking {
  font-variant-numeric: tabular-nums;
  text-shadow:
    0 0 6px rgba(255, 232, 168, 0.45),
    0 1px 2px rgba(0, 0, 0, 0.72);
}

.coin-number.is-score-popping::after,
.score-number.is-score-popping::after {
  content: '✦ ✧ ✦';
  position: absolute;
  right: 4px;
  top: -14px;
  color: rgba(255, 232, 168, 1);
  font-size: 15px;
  letter-spacing: 4px;
  text-shadow:
    0 0 6px rgba(255, 232, 168, 0.95),
    0 0 14px rgba(244, 164, 96, 0.78);
  animation: score-sparks 0.72s ease-out forwards;
  pointer-events: none;
  z-index: 3;
}

.coin-number.is-score-popping::before,
.score-number.is-score-popping::before {
  content: '✧ ✦ ✧';
  position: absolute;
  left: -2px;
  bottom: -10px;
  color: rgba(255, 215, 120, 0.96);
  font-size: 12px;
  letter-spacing: 5px;
  text-shadow: 0 0 8px rgba(244, 164, 96, 0.86);
  animation: score-sparks-mirror 0.72s ease-out forwards;
  pointer-events: none;
  z-index: 3;
}

.score-log-list {
  display: flex;
  flex-direction: column;
  gap: 7px;
  min-height: 0;
  overflow-y: auto;
  /* Move scrollbar to the LEFT side via direction trick. */
  direction: rtl;
  padding-left: 2px;
  scrollbar-width: thin;
  scrollbar-color: rgba(244, 164, 96, 0.7) rgba(20, 16, 28, 0.45);
}
.score-log-list > * {
  /* Reset content direction so log rows still flow left-to-right. */
  direction: ltr;
}
.score-log-list::-webkit-scrollbar {
  width: 4px;
}
.score-log-list::-webkit-scrollbar-track {
  background: rgba(20, 16, 28, 0.4);
  border-radius: 999px;
}
.score-log-list::-webkit-scrollbar-thumb {
  background: linear-gradient(180deg, var(--color-flame), var(--color-flame-deep));
  border-radius: 999px;
  box-shadow: 0 0 6px rgba(244, 164, 96, 0.4);
}
.score-log-list::-webkit-scrollbar-thumb:hover {
  background: linear-gradient(180deg, var(--color-flame), var(--color-flame-warm));
}

.score-log {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
  align-items: center;
  min-height: 36px;
  padding: 8px 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.045);
  box-shadow: inset 3px 0 0 rgba(244, 164, 96, 0.36);
}

.score-log-label {
  min-width: 0;
  color: var(--color-text-primary);
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.score-log-delta {
  color: var(--color-flame);
  font-size: 12px;
  font-weight: 800;
}

.score-log-enemy { box-shadow: inset 3px 0 0 rgba(168, 58, 58, 0.72); }
.score-log-treasure { box-shadow: inset 3px 0 0 rgba(201, 161, 58, 0.8); }
.score-log-trap { box-shadow: inset 3px 0 0 rgba(112, 76, 150, 0.8); }
.score-log-item { box-shadow: inset 3px 0 0 rgba(244, 164, 96, 0.72); }
.score-log-item-gain { box-shadow: inset 3px 0 0 rgba(103, 196, 152, 0.82); }
.score-log-item-gain .score-log-delta { color: #bff6d9; }
.score-log-score { box-shadow: inset 3px 0 0 rgba(255, 215, 120, 0.8); }
.score-log-notice { box-shadow: inset 3px 0 0 rgba(145, 174, 210, 0.75); }
.score-log-win { box-shadow: inset 3px 0 0 rgba(103, 196, 152, 0.82); }
.score-log-hurt { box-shadow: inset 3px 0 0 rgba(168, 58, 58, 0.82); }
.score-log-notice .score-log-delta { color: #cbdaf0; }
.score-log-win .score-log-delta { color: #bff6d9; }
.score-log-hurt .score-log-delta { color: #ffd5c5; }

.score-log-empty {
  padding: 14px 10px;
  color: var(--color-text-muted);
  border: 1px dashed var(--color-border-soft);
  border-radius: 10px;
  text-align: center;
  font-size: 12px;
}

/* (legacy stage-header / stage-main rules removed — title now lives in
   .brand inside .left-panel and Turn is rendered as a fixed top overlay) */

/* ── Tutorial spotlight: 황금빛 맥동 테두리로 카드/손패 슬롯을 강조 ── */
@keyframes tutorial-pulse {
  from { box-shadow: 0 0 0 2px #f0c060, 0 0 10px 4px rgba(240,192,96,0.55); }
  to   { box-shadow: 0 0 0 4px #f0c060, 0 0 22px 9px rgba(240,192,96,0.85); }
}

.tutorial-spotlight {
  animation: tutorial-pulse 0.9s ease-in-out infinite alternate;
  position: relative;
  z-index: 5;
  border-radius: 6px;
}

/* 튜토리얼 잠금 메시지 — 클릭 위치 부근에 뜨다가 위로 사라짐 */
@keyframes tutorial-lock-fade {
  0%   { opacity: 1;   transform: translateX(-50%) translateY(0);     }
  70%  { opacity: 0.7; transform: translateX(-50%) translateY(-10px);  }
  100% { opacity: 0;   transform: translateX(-50%) translateY(-22px);  }
}

.tutorial-lock-msg {
  position: fixed;
  transform: translateX(-50%);
  background: rgba(18, 10, 4, 0.88);
  color: #f0c060;
  padding: 5px 12px;
  border-radius: 8px;
  border: 1px solid rgba(240,192,96,0.55);
  font-size: 13px;
  letter-spacing: 0.02em;
  pointer-events: none;
  z-index: 9999;
  white-space: nowrap;
  animation: tutorial-lock-fade 1.7s ease-out forwards;
}

`
