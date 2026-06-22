/**
 * 경험(성향) 패널 — 에나의 성향을 '다이아 성좌(레이더)'로 보여주는 읽기 전용 오버레이.
 * 도감(compendium) 오버레이와 같은 촛불/낡은 종이 다크판타지 톤을 따른다.
 */
export const GAME_BOARD_EXPERIENCE_STYLES = `
.experience-overlay {
  position: fixed;
  inset: 0;
  display: none;
  align-items: center;
  justify-content: center;
  background: rgba(8, 5, 14, 0.78);
  backdrop-filter: blur(2px);
  z-index: 240;
  padding: 24px;
}
.experience-overlay.is-open { display: flex; }
.experience-modal {
  width: min(560px, 96vw);
  max-height: 92vh;
  display: grid;
  grid-template-rows: auto 1fr auto;
  background:
    radial-gradient(120% 80% at 50% 0%, rgba(58, 44, 80, 0.55), transparent 60%),
    linear-gradient(180deg, rgba(34, 26, 50, 0.97), rgba(16, 12, 26, 0.99));
  border: 1px solid var(--color-border-warm);
  border-radius: 18px;
  box-shadow: 0 24px 48px rgba(0, 0, 0, 0.65), inset 0 1px 0 rgba(255, 232, 168, 0.14);
  overflow: hidden;
  color: #fff5dc;
}
.experience-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  border-bottom: 1px solid var(--color-border-soft);
}
.experience-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 18px;
  font-weight: 800;
  letter-spacing: 0.1em;
  margin: 0;
  color: var(--color-flame-warm);
}
.experience-title-icon { display: inline-flex; width: 22px; height: 22px; color: var(--color-flame); }
.experience-title-icon .icon { width: 22px; height: 22px; filter: drop-shadow(0 0 6px rgba(255, 215, 120, 0.5)); }
.experience-close {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  color: var(--color-flame-warm);
  width: 32px;
  height: 32px;
  font-size: 16px;
  cursor: pointer;
  font-family: inherit;
}
.experience-close:hover { background: rgba(244, 164, 96, 0.18); }
.experience-body {
  overflow-y: auto;
  min-height: 0;
  padding: 14px 22px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  scrollbar-width: thin;
  scrollbar-color: rgba(244, 164, 96, 0.7) rgba(20, 16, 28, 0.45);
}
.experience-body::-webkit-scrollbar { width: 4px; }
.experience-body::-webkit-scrollbar-thumb {
  background: linear-gradient(180deg, var(--color-flame), var(--color-flame-deep));
  border-radius: 999px;
}

/* ── 성좌(레이더) ─────────────────────────────────────────── */
.experience-constellation {
  position: relative;
  width: min(360px, 76vw);
  aspect-ratio: 1 / 1;
  margin-top: 6px;
}
.experience-radar {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
}
.exp-ring { fill: none; stroke: rgba(255, 232, 168, 0.14); stroke-width: 0.35; }
.exp-spoke { stroke: rgba(255, 232, 168, 0.12); stroke-width: 0.3; }
.exp-base {
  fill: none;
  stroke: rgba(244, 164, 96, 0.65);
  stroke-width: 0.55;
  stroke-dasharray: 1.6 1.4;
  stroke-linejoin: round;
}
.exp-current {
  fill: rgba(255, 196, 110, 0.22);
  stroke: var(--color-flame, #ffd778);
  stroke-width: 0.8;
  stroke-linejoin: round;
  filter: drop-shadow(0 0 4px rgba(255, 200, 110, 0.55));
}
.exp-node {
  fill: #fff3c4;
  stroke: rgba(180, 120, 40, 0.6);
  stroke-width: 0.3;
  filter: drop-shadow(0 0 3px rgba(255, 215, 120, 0.8));
}
.exp-axis-label {
  position: absolute;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  pointer-events: none;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9);
}
.exp-axis-name {
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.08em;
  color: rgba(255, 240, 200, 0.96);
}
.exp-axis-pct { font-size: 11px; font-weight: 700; color: var(--color-flame-warm); }
.experience-core {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  pointer-events: none;
}
.experience-core-icon { display: inline-flex; width: 26px; height: 26px; color: var(--color-flame); }
.experience-core-icon .icon { width: 26px; height: 26px; filter: drop-shadow(0 0 8px rgba(255, 215, 120, 0.7)); }
.experience-core-name {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.14em;
  color: rgba(255, 240, 200, 0.82);
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9);
}

/* ── 범례(축 상세 + 기본 토대 대비 드리프트) ───────────────── */
.experience-legend {
  list-style: none;
  margin: 0;
  padding: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.exp-legend-row {
  display: grid;
  grid-template-columns: 46px 1fr auto;
  grid-template-areas: 'name bar val' 'desc desc desc';
  align-items: center;
  gap: 4px 10px;
  padding: 8px 12px;
  background: rgba(20, 16, 30, 0.5);
  border: 1px solid var(--color-border-soft);
  border-radius: 10px;
}
.exp-legend-name { grid-area: name; font-size: 13px; font-weight: 800; color: var(--color-flame-warm); letter-spacing: 0.06em; }
.exp-legend-bar {
  grid-area: bar;
  position: relative;
  height: 8px;
  border-radius: 999px;
  background: rgba(8, 5, 14, 0.6);
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.6);
  overflow: hidden;
}
.exp-legend-fill {
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--color-flame-deep), var(--color-flame));
  box-shadow: 0 0 6px rgba(255, 200, 110, 0.5);
}
.exp-legend-val { grid-area: val; display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; color: #fff5dc; }
.exp-drift { font-size: 11px; font-weight: 800; padding: 1px 5px; border-radius: 999px; }
.exp-drift.up { color: #ffe6a6; background: rgba(244, 164, 96, 0.2); }
.exp-drift.down { color: #b9c4e6; background: rgba(120, 140, 200, 0.18); }
.exp-legend-desc { grid-area: desc; font-size: 11px; color: var(--color-text-muted); letter-spacing: 0.02em; }
.experience-footer {
  padding: 11px 20px;
  border-top: 1px solid var(--color-border-soft);
  font-size: 11px;
  color: var(--color-text-muted);
  text-align: center;
  letter-spacing: 0.02em;
}
`
