/**
 * 경험(성향) 패널 — 에나의 성향을 불빛 성좌(레이더)로 보여주는 읽기 전용 오버레이.
 * 도감 모달의 박스 톤이 아니라 화면 위 어두운 반투명 레이어에
 * 불빛 다이아 노드와 얇은 뉴럴 성좌 라인을 올린다.
 */
export const GAME_BOARD_EXPERIENCE_STYLES = `
.experience-overlay {
  position: fixed;
  inset: 0;
  display: none;
  align-items: center;
  justify-content: center;
  background:
    radial-gradient(90% 70% at 50% 36%, rgba(255, 198, 104, 0.08), transparent 52%),
    radial-gradient(120% 90% at 50% 35%, rgba(16, 13, 28, 0.58), rgba(2, 2, 6, 0.76));
  backdrop-filter: blur(5px);
  /* 에나 말풍선(.sb-host, 9999)보다 위 — 열람 중 도착한 바크는 이 레이어 아래에 깔려 보이지 않는다. */
  z-index: 10500;
  padding: 24px;
}
.experience-overlay.is-open { display: flex; animation: codex-overlay-fade 0.3s ease; }
/* 도감과 같은 등장 문법: 본문이 아래에서 올라와 살짝 넘쳤다가 안착한다. */
.experience-overlay.is-open .experience-modal { animation: experience-modal-rise 0.5s cubic-bezier(0.18, 0.9, 0.28, 1.08); }
@keyframes experience-modal-rise {
  from { opacity: 0; transform: translateY(72px) scale(0.96); }
  60% { opacity: 1; }
  to { opacity: 1; transform: none; }
}
.experience-modal {
  position: relative;
  width: min(680px, 96vw);
  max-height: 92vh;
  display: grid;
  grid-template-rows: auto 1fr auto;
  /* 어둡고 반투명한 유리 + 상단에서 번지는 황금 불빛. */
  background:
    radial-gradient(115% 58% at 50% -6%, rgba(255, 206, 126, 0.18), transparent 64%),
    radial-gradient(90% 75% at 50% 44%, rgba(73, 58, 118, 0.13), transparent 66%),
    linear-gradient(180deg, rgba(28, 20, 14, 0.68), rgba(10, 8, 16, 0.76));
  backdrop-filter: blur(10px);
  border: 0;
  border-radius: 24px;
  box-shadow:
    0 30px 70px rgba(0, 0, 0, 0.6),
    0 0 46px rgba(244, 178, 86, 0.22),
    inset 0 1px 0 rgba(255, 236, 188, 0.08),
    inset 0 0 70px rgba(244, 164, 96, 0.04);
  overflow: hidden;
  color: #fde6c4;
}
/* 화면 위에 뜬 어두운 레이어처럼 읽히게 외곽 테두리 대신 내부 광원만 둔다. */
.experience-modal::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background:
    linear-gradient(125deg, transparent 0 28%, rgba(255, 218, 150, 0.035) 28.4% 29%, transparent 29.4% 52%, rgba(126, 108, 190, 0.045) 52.4% 53%, transparent 53.4%),
    radial-gradient(80% 38% at 50% 0%, rgba(255, 211, 130, 0.12), transparent 72%);
  pointer-events: none;
}
.experience-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 15px 22px;
  border-bottom: 0;
}
.experience-title {
  display: flex;
  align-items: center;
  gap: 9px;
  font-size: 18px;
  font-weight: 800;
  letter-spacing: 0.12em;
  margin: 0;
  color: #ffdf9e;
  text-shadow: 0 0 14px rgba(244, 178, 86, 0.45);
}
.experience-title-icon { display: inline-flex; width: 23px; height: 23px; color: #ffd178; }
.experience-title-icon .icon { width: 23px; height: 23px; filter: drop-shadow(0 0 8px rgba(255, 210, 130, 0.7)); }
.experience-close {
  background: rgba(255, 210, 130, 0.06);
  border: 1px solid rgba(255, 210, 130, 0.28);
  border-radius: 9px;
  color: #ffdf9e;
  width: 32px;
  height: 32px;
  font-size: 16px;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.16s ease, box-shadow 0.16s ease;
}
.experience-close:hover { background: rgba(255, 196, 110, 0.18); box-shadow: 0 0 14px rgba(244, 178, 86, 0.4); }
.experience-body {
  overflow-y: auto;
  min-height: 0;
  padding: 16px 24px 22px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  scrollbar-width: thin;
  scrollbar-color: rgba(244, 178, 86, 0.7) transparent;
}
.experience-body::-webkit-scrollbar { width: 4px; }
.experience-body::-webkit-scrollbar-thumb {
  background: linear-gradient(180deg, #ffd178, #c8842e);
  border-radius: 999px;
}

/* ── 성좌(레이더) ─────────────────────────────────────────── */
.experience-constellation {
  position: relative;
  width: min(430px, 80vw);
  aspect-ratio: 1 / 1;
  margin-top: 6px;
  filter: drop-shadow(0 0 18px rgba(244, 178, 86, 0.14));
}
.experience-constellation::before {
  content: '';
  position: absolute;
  inset: 9%;
  border-radius: 50%;
  /* 희미한 우주/뉴럴 먼지층으로 레이더가 빈 도형처럼 보이지 않게 한다. */
  background:
    radial-gradient(circle at 25% 30%, rgba(255, 230, 170, 0.20) 0 1px, transparent 1.7px),
    radial-gradient(circle at 72% 24%, rgba(182, 168, 255, 0.16) 0 1px, transparent 1.8px),
    radial-gradient(circle at 66% 78%, rgba(255, 196, 110, 0.17) 0 1px, transparent 1.7px),
    radial-gradient(circle at 34% 70%, rgba(255, 244, 210, 0.13) 0 1px, transparent 1.8px);
  box-shadow: inset 0 0 40px rgba(255, 198, 104, 0.035);
  pointer-events: none;
}
.experience-radar {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
}
.exp-ring { fill: rgba(255, 205, 126, 0.006); stroke: rgba(255, 220, 160, 0.052); stroke-width: 0.18; }
.exp-spoke { stroke: rgba(186, 165, 255, 0.09); stroke-width: 0.14; }
.exp-base {
  fill: none;
  stroke: rgba(255, 210, 150, 0.20);
  stroke-width: 0.26;
  stroke-dasharray: 1.2 2.4;
  stroke-linejoin: round;
}
.exp-current {
  fill: rgba(255, 196, 110, 0.05);
  stroke: rgba(255, 246, 220, 0.66);
  stroke-width: 0.30;
  stroke-linejoin: round;
  filter: drop-shadow(0 0 5px rgba(255, 255, 255, 0.42)) drop-shadow(0 0 10px rgba(255, 204, 120, 0.24));
  animation: exp-line-glow 2.8s ease-in-out infinite;
}
.exp-node {
  fill: #fff4c8;
  stroke: rgba(255, 210, 130, 0.72);
  stroke-width: 0.16;
  filter: drop-shadow(0 0 5px rgba(255, 220, 140, 0.96)) drop-shadow(0 0 12px rgba(244, 178, 86, 0.38));
  animation: exp-node-pulse 2.4s ease-in-out infinite;
}
.exp-axis-label {
  position: absolute;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  pointer-events: none;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.9);
  /* 우측 림 라벨(left ~97%)은 shrink-to-fit 가용 폭이 몇 px뿐이라 CJK가 한 글자씩
     세로로 꺾인다 — 라벨은 항상 한 줄 고정. */
  white-space: nowrap;
}
.exp-axis-name {
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.08em;
  color: #ffe9c4;
}
.exp-axis-pct { font-size: 11px; font-weight: 700; color: #ffce7e; display: inline-flex; align-items: center; gap: 3px; }
/* 정산 화면 전용: 이번 런 상승분(%p) — 뱃지 대신 좌측 상단 불빛 수치와 같은
   금색 발광 숫자로 크게 강조한다(오른 축만 표시된다). */
.exp-axis-delta {
  font-size: 16px;
  font-weight: 900;
  line-height: 1;
  color: var(--color-flame, #ffd778);
  text-shadow:
    0 0 8px rgba(255, 215, 120, 0.55),
    0 0 18px rgba(244, 164, 96, 0.3);
  font-variant-numeric: tabular-nums;
  animation: exp-delta-glow 2s ease-in-out infinite;
}
@keyframes exp-delta-glow {
  0%, 100% { text-shadow: 0 0 8px rgba(255, 215, 120, 0.5), 0 0 16px rgba(244, 164, 96, 0.26); }
  50% { text-shadow: 0 0 12px rgba(255, 224, 150, 0.95), 0 0 26px rgba(255, 196, 110, 0.55); }
}
/* 이번 런에 오른 축 꼭짓점 — 기본 반짝임보다 크고 밝게 맥동한다. */
.exp-node.is-risen {
  animation: exp-node-risen 1.6s ease-in-out infinite;
}
@keyframes exp-node-risen {
  0%, 100% { opacity: 0.9; filter: drop-shadow(0 0 5px rgba(255, 220, 140, 0.96)) drop-shadow(0 0 12px rgba(244, 178, 86, 0.38)); }
  50% { opacity: 1; filter: drop-shadow(0 0 9px rgba(255, 235, 170, 1)) drop-shadow(0 0 22px rgba(255, 196, 110, 0.75)); }
}
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
.experience-core-icon { display: inline-flex; width: 26px; height: 26px; color: #ffd178; }
.experience-core-icon .icon { width: 26px; height: 26px; filter: drop-shadow(0 0 10px rgba(255, 210, 130, 0.85)); }
.experience-core-name {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.16em;
  color: rgba(255, 233, 196, 0.85);
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.9);
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
  padding: 9px 13px;
  background: linear-gradient(180deg, rgba(255, 210, 130, 0.032), rgba(8, 6, 12, 0.24));
  border: 0;
  border-radius: 12px;
}
.exp-legend-name { grid-area: name; font-size: 13px; font-weight: 800; color: #ffdf9e; letter-spacing: 0.06em; }
.exp-legend-bar {
  grid-area: bar;
  position: relative;
  height: 8px;
  border-radius: 999px;
  background: rgba(6, 4, 10, 0.6);
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.7);
  overflow: hidden;
}
.exp-legend-fill {
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: 999px;
  background: linear-gradient(90deg, #9b6ee8 0%, #c8842e 34%, #ffd887 100%);
  box-shadow: 0 0 8px rgba(255, 204, 120, 0.6);
}
.exp-legend-val { grid-area: val; display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; color: #fde6c4; }
.exp-drift { font-size: 11px; font-weight: 800; padding: 1px 6px; border-radius: 999px; }
.exp-drift.up { color: #ffe6a6; background: rgba(244, 178, 86, 0.22); }
.exp-drift.down { color: #bcc6e6; background: rgba(120, 140, 200, 0.2); }
.exp-legend-desc { grid-area: desc; font-size: 11px; color: rgba(255, 233, 196, 0.52); letter-spacing: 0.02em; }
.experience-footer {
  padding: 12px 22px;
  border-top: 0;
  font-size: 11px;
  color: rgba(255, 233, 196, 0.5);
  text-align: center;
  letter-spacing: 0.02em;
}
@keyframes exp-node-pulse {
  0%, 100% { opacity: 0.86; }
  50% { opacity: 1; }
}
@keyframes exp-line-glow {
  0%, 100% { opacity: 0.72; }
  50% { opacity: 1; }
}
`
