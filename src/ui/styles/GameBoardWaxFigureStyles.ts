/**
 * 밀랍상(蠟像) 탭 — 경험 패널과 같은 어두운 반투명 레이어 + 유리질 모달 톤을 쓰되,
 * "전시관"답게 좌(정보창) · 중(풀 일러스트 갤러리) · 우(조합) 3단으로 구성한다.
 * 갤러리 카드는 필드 칸과 같은 비율·풀 일러스트를 쓴다(`spriteForCard()` 재사용,
 * 전용 아이콘을 새로 그리지 않는다). 정상 색은 촛불 금빛, 이로치(변종)는 이
 * 게임에서 안 쓰던 옥빛(초록)으로 갈라 한눈에 "이건 다르다"가 읽히게 한다.
 */
export const GAME_BOARD_WAX_FIGURE_STYLES = `
.wax-figure-overlay {
  position: fixed;
  inset: 0;
  display: none;
  align-items: center;
  justify-content: center;
  background:
    radial-gradient(90% 70% at 50% 36%, rgba(255, 198, 104, 0.08), transparent 52%),
    radial-gradient(120% 90% at 50% 35%, rgba(16, 13, 28, 0.58), rgba(2, 2, 6, 0.76));
  backdrop-filter: blur(5px);
  z-index: 10500;
  padding: 24px;
}
.wax-figure-overlay.is-open { display: flex; animation: codex-overlay-fade 0.3s ease; }
.wax-figure-overlay.is-open .wax-figure-modal { animation: experience-modal-rise 0.5s cubic-bezier(0.18, 0.9, 0.28, 1.08); }

.wax-figure-modal {
  position: relative;
  width: min(1180px, 97vw);
  max-height: 92vh;
  display: grid;
  grid-template-rows: auto auto 1fr;
  background:
    radial-gradient(115% 58% at 50% -6%, rgba(255, 206, 126, 0.16), transparent 64%),
    radial-gradient(90% 75% at 50% 44%, rgba(73, 58, 118, 0.12), transparent 66%),
    linear-gradient(180deg, rgba(24, 17, 12, 0.7), rgba(8, 7, 14, 0.8));
  backdrop-filter: blur(10px);
  border: 0;
  border-radius: 24px;
  box-shadow:
    0 30px 70px rgba(0, 0, 0, 0.6),
    0 0 46px rgba(244, 178, 86, 0.2),
    inset 0 1px 0 rgba(255, 236, 188, 0.08),
    inset 0 0 70px rgba(244, 164, 96, 0.04);
  overflow: hidden;
  color: #fde6c4;
}
.wax-figure-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 15px 22px;
  border-bottom: 1px solid rgba(255, 215, 120, 0.14);
}
.wax-figure-title {
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
.wax-figure-title-icon { display: inline-flex; width: 23px; height: 23px; color: #ffd178; }
.wax-figure-title-icon .icon { width: 23px; height: 23px; filter: drop-shadow(0 0 8px rgba(255, 210, 130, 0.7)); }
.wax-figure-capacity {
  margin-left: auto;
  font-size: 13px;
  font-weight: 800;
  color: var(--color-flame, #ffd778);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.04em;
}
.wax-figure-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 210, 130, 0.06);
  border: 1px solid rgba(255, 210, 130, 0.28);
  border-radius: 9px;
  color: #ffdf9e;
  width: 32px;
  height: 32px;
  cursor: pointer;
  transition: background 0.16s ease, box-shadow 0.16s ease;
}
.wax-figure-close .icon { width: 15px; height: 15px; }
.wax-figure-close:hover { background: rgba(255, 196, 110, 0.18); box-shadow: 0 0 14px rgba(244, 178, 86, 0.4); }

.wax-action-hint {
  margin: 0 22px 6px;
  padding: 7px 12px;
  border-radius: 10px;
  background: rgba(255, 210, 130, 0.1);
  border: 1px solid rgba(255, 210, 130, 0.28);
  color: #ffe9c4;
  font-size: 12px;
  text-align: center;
}

/* ── 전시관 3단 골격 ─────────────────────────────────────── */
.wax-figure-hall {
  min-height: 0;
  padding: 16px 20px 20px;
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr) 240px;
  gap: 16px;
  align-items: stretch;
}
@media (max-width: 900px) {
  .wax-figure-hall { grid-template-columns: 1fr; grid-template-rows: auto auto auto; }
}

.wax-section-title {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin: 0 0 10px;
  font-size: 12.5px;
  font-weight: 800;
  letter-spacing: 0.1em;
  color: #ffdf9e;
}
.wax-section-note { font-size: 10.5px; font-weight: 600; color: rgba(255, 233, 196, 0.48); letter-spacing: 0.02em; }
.wax-empty {
  margin: 0;
  padding: 20px 14px;
  text-align: center;
  font-size: 12px;
  color: rgba(255, 233, 196, 0.42);
  border: 1px dashed rgba(255, 215, 120, 0.18);
  border-radius: 12px;
}

/* ── 좌측 정보창 ────────────────────────────────────────── */
.wax-info-panel {
  border-radius: 14px;
  border: 1px solid rgba(255, 215, 120, 0.2);
  background: linear-gradient(180deg, rgba(40, 28, 20, 0.5), rgba(12, 9, 16, 0.55));
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
}
.wax-info-empty {
  margin: auto 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: rgba(255, 233, 196, 0.4);
  font-size: 12px;
  text-align: center;
}
.wax-info-empty-glyph { display: inline-flex; width: 30px; height: 30px; color: rgba(255, 210, 130, 0.35); }
.wax-info-empty-glyph .icon { width: 30px; height: 30px; }
.wax-info-portrait {
  width: 100%;
  aspect-ratio: 4 / 3.2;
  border-radius: 12px;
  border: 1px solid rgba(255, 215, 120, 0.36);
  background-size: cover;
  background-position: center 32%;
  box-shadow: inset 0 1px 0 rgba(255, 232, 168, 0.16), 0 10px 22px rgba(0, 0, 0, 0.5);
  filter: saturate(1.05) contrast(1.02);
}
.wax-info-portrait.is-shiny {
  border-color: rgba(120, 235, 175, 0.5);
  filter: saturate(1.2) hue-rotate(-14deg) contrast(1.02);
  box-shadow: inset 0 1px 0 rgba(190, 255, 220, 0.18), 0 10px 22px rgba(0, 0, 0, 0.5), 0 0 20px rgba(123, 240, 174, 0.22);
}
.wax-info-body { display: flex; flex-direction: column; gap: 8px; }
.wax-info-name { margin: 0; font-size: 15px; font-weight: 800; color: #fff5dc; line-height: 1.3; }
.wax-info-stars { font-size: 13px; color: var(--color-flame, #ffd778); text-shadow: 0 0 6px rgba(255, 215, 120, 0.5); display: flex; align-items: baseline; gap: 6px; }
.wax-info-star-num { font-size: 10.5px; font-weight: 700; color: rgba(255, 233, 196, 0.55); }
.wax-info-stats { margin: 4px 0 0; display: flex; flex-direction: column; gap: 6px; }
.wax-info-stats > div { display: flex; justify-content: space-between; gap: 8px; font-size: 11.5px; }
.wax-info-stats dt { margin: 0; color: rgba(255, 233, 196, 0.55); font-weight: 700; }
.wax-info-stats dd { margin: 0; color: #ffe9c4; font-weight: 700; text-align: right; }
.wax-info-stats dd b { color: var(--color-flame, #ffd778); font-variant-numeric: tabular-nums; }

/* ── 중앙 갤러리 열 ─────────────────────────────────────── */
.wax-gallery-column { display: flex; flex-direction: column; min-height: 0; gap: 14px; }
.wax-overflow-strip {
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px dashed rgba(255, 215, 120, 0.25);
  background: rgba(255, 210, 130, 0.04);
}
.wax-exhibit-row {
  list-style: none;
  margin: 8px 0 0;
  padding: 0 0 4px;
  display: flex;
  gap: 10px;
  overflow-x: auto;
}
.wax-gallery-scroll { flex: 1; min-height: 0; overflow-y: auto; scrollbar-width: thin; scrollbar-color: rgba(244, 178, 86, 0.7) transparent; }
.wax-gallery-scroll::-webkit-scrollbar { width: 4px; }
.wax-gallery-scroll::-webkit-scrollbar-thumb { background: linear-gradient(180deg, #ffd178, #c8842e); border-radius: 999px; }
.wax-exhibit-grid {
  list-style: none;
  margin: 0;
  padding: 2px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(168px, 1fr));
  gap: 12px;
}

/* 전시 카드 — 필드 칸과 같은 비율(4:3.2)에 풀 일러스트, 도감식 아이콘 배지를 쓰지 않는다. */
.wax-exhibit-card {
  position: relative;
  aspect-ratio: 4 / 3.2;
  border-radius: 12px;
  border: 1px solid rgba(255, 215, 120, 0.3);
  background: #1c1424;
  overflow: hidden;
  cursor: pointer;
  transition: transform 0.16s ease, box-shadow 0.16s ease, border-color 0.16s ease;
}
.wax-exhibit-card:hover { transform: translateY(-2px); box-shadow: 0 10px 20px rgba(0, 0, 0, 0.45); }
.wax-exhibit-card.is-selected {
  border-color: rgba(255, 215, 120, 0.85);
  box-shadow: 0 0 0 2px rgba(255, 215, 120, 0.35), 0 12px 22px rgba(0, 0, 0, 0.5);
}
.wax-exhibit-card.is-shiny { border-color: rgba(120, 235, 175, 0.5); }
.wax-exhibit-card.is-shiny.is-selected {
  border-color: rgba(123, 240, 174, 0.9);
  box-shadow: 0 0 0 2px rgba(123, 240, 174, 0.38), 0 12px 22px rgba(0, 0, 0, 0.5), 0 0 20px rgba(123, 240, 174, 0.25);
}
.wax-exhibit-art {
  position: absolute;
  inset: 0;
  background-size: cover;
  background-position: center 32%;
  filter: saturate(1.05) contrast(1.02);
}
.wax-exhibit-card.is-shiny .wax-exhibit-art { filter: saturate(1.2) hue-rotate(-14deg) contrast(1.02); }
.wax-exhibit-star {
  position: absolute;
  top: 6px;
  left: 8px;
  font-size: 11px;
  font-weight: 900;
  color: var(--color-flame, #ffd778);
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.85);
  z-index: 1;
}
.wax-exhibit-count {
  position: absolute;
  top: 6px;
  right: 8px;
  font-size: 11px;
  font-weight: 800;
  color: #fff5dc;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.85);
  z-index: 1;
}
.wax-exhibit-frame {
  position: absolute;
  left: 0; right: 0; bottom: 0;
  padding: 6px 8px 7px;
  background: linear-gradient(0deg, rgba(6, 4, 8, 0.92), rgba(6, 4, 8, 0));
  z-index: 1;
}
.wax-exhibit-name { font-size: 11.5px; font-weight: 800; color: #fff5dc; line-height: 1.25; }
.wax-exhibit-effect { display: block; margin-top: 2px; font-size: 10px; color: rgba(255, 233, 196, 0.65); line-height: 1.3; }
.wax-shiny-tag {
  font-style: normal;
  font-size: 9.5px;
  font-weight: 800;
  color: #7bf0ae;
  text-shadow: 0 0 6px rgba(123, 240, 174, 0.6);
  margin-left: 3px;
}

/* 넘친 봉인 카드는 갤러리 카드보다 살짝 작고, 정리/버리기 버튼을 얹는다. */
.wax-exhibit-card-overflow { flex: 0 0 148px; width: 148px; aspect-ratio: 4 / 3.4; cursor: default; }
.wax-exhibit-overflow-actions { display: flex; gap: 5px; margin-top: 5px; }

.wax-btn {
  border-radius: 8px;
  border: 1px solid rgba(255, 215, 120, 0.4);
  background: rgba(255, 210, 130, 0.1);
  color: #ffdf9e;
  font-size: 10.5px;
  font-weight: 800;
  letter-spacing: 0.03em;
  padding: 4px 9px;
  cursor: pointer;
  transition: background 0.14s ease, box-shadow 0.14s ease, transform 0.1s ease;
}
.wax-btn:hover { background: rgba(255, 210, 130, 0.22); box-shadow: 0 0 10px rgba(244, 178, 86, 0.35); transform: translateY(-1px); }
.wax-btn-discard {
  border-color: rgba(255, 130, 130, 0.32);
  color: rgba(255, 190, 190, 0.85);
  background: rgba(255, 90, 90, 0.08);
  padding: 4px 7px;
}
.wax-btn-discard:hover { background: rgba(255, 90, 90, 0.18); box-shadow: 0 0 10px rgba(255, 110, 110, 0.3); }
.wax-btn-stow-all { width: 100%; text-align: center; margin-top: 8px; }

/* ── 우측 조합 패널 ─────────────────────────────────────── */
.wax-compose-panel {
  border-radius: 14px;
  border: 1px solid rgba(255, 215, 120, 0.2);
  background: linear-gradient(180deg, rgba(40, 28, 20, 0.5), rgba(12, 9, 16, 0.55));
  padding: 14px;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}
.wax-compose-empty { margin: auto 0; text-align: center; font-size: 11.5px; color: rgba(255, 233, 196, 0.42); }
.wax-compose-recipe { display: flex; align-items: center; justify-content: center; gap: 8px; margin: 6px 0 10px; }
.wax-compose-slots { display: flex; flex-direction: column; gap: 5px; }
.wax-compose-slot {
  width: 30px;
  height: 30px;
  border-radius: 7px;
  border: 1px dashed rgba(255, 215, 120, 0.35);
  background-color: rgba(255, 210, 130, 0.05);
  background-size: cover;
  background-position: center 32%;
  opacity: 0.35;
}
.wax-compose-slot.is-filled { opacity: 1; border-style: solid; border-color: rgba(255, 215, 120, 0.55); }
.wax-compose-slot.is-shiny.is-filled { border-color: rgba(123, 240, 174, 0.6); }
.wax-compose-arrow { font-size: 18px; color: rgba(255, 215, 120, 0.7); }
.wax-compose-result {
  width: 56px;
  height: 56px;
  border-radius: 10px;
  border: 1px solid rgba(255, 215, 120, 0.55);
  background-size: cover;
  background-position: center 32%;
  position: relative;
  box-shadow: 0 0 14px rgba(244, 178, 86, 0.25);
}
.wax-compose-result.is-shiny { border-color: rgba(123, 240, 174, 0.6); box-shadow: 0 0 14px rgba(123, 240, 174, 0.3); }
.wax-compose-result-star {
  position: absolute;
  bottom: -4px;
  right: -4px;
  font-size: 10px;
  font-weight: 900;
  color: #140d08;
  background: var(--color-flame, #ffd778);
  border-radius: 999px;
  padding: 1px 5px;
}
.wax-compose-result-label { margin: 0 0 10px; font-size: 11px; line-height: 1.4; color: rgba(255, 233, 196, 0.75); text-align: center; }
.wax-compose-result-label b { color: var(--color-flame, #ffd778); font-variant-numeric: tabular-nums; }
.wax-compose-need { margin: 0; font-size: 11px; text-align: center; color: rgba(255, 233, 196, 0.45); }
.wax-btn-merge-big {
  width: 100%;
  padding: 9px 0;
  text-align: center;
  font-size: 12px;
  border-radius: 10px;
  background: linear-gradient(180deg, rgba(255, 210, 130, 0.22), rgba(255, 210, 130, 0.08));
}
.wax-btn-merge-big:hover { box-shadow: 0 0 14px rgba(244, 178, 86, 0.45); }

/* 필드에서부터 보이는 이로치 후보 — 밀랍상 탭과 같은 옥빛으로 "어 떴다"를 예고한다.
   깨우기 전부터 다르게 보여야 스쳐 지나가지 않고 붙잡고 싶어진다. */
.cell.card.is-wax-figure-shiny .card-illust,
.cell.card.is-wax-figure-shiny .card-art {
  filter: drop-shadow(0 0 8px rgba(123, 240, 174, 0.55)) saturate(1.15) hue-rotate(-14deg);
  animation: wax-figure-shiny-glint 2.4s ease-in-out infinite;
}
.cell.card.is-wax-figure-shiny::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  border-radius: inherit;
  box-shadow: inset 0 0 14px rgba(123, 240, 174, 0.35);
  animation: wax-figure-shiny-pulse 2.4s ease-in-out infinite;
}
@keyframes wax-figure-shiny-glint {
  0%, 100% { filter: drop-shadow(0 0 8px rgba(123, 240, 174, 0.55)) saturate(1.15) hue-rotate(-14deg); }
  50%      { filter: drop-shadow(0 0 13px rgba(123, 240, 174, 0.8)) saturate(1.3) hue-rotate(-14deg); }
}
@keyframes wax-figure-shiny-pulse {
  0%, 100% { opacity: 0.6; }
  50%      { opacity: 1; }
}
`
