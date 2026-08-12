/**
 * 밀랍상(蠟像) 탭 — 경험 패널과 같은 어두운 반투명 레이어 + 유리질 모달 톤을 쓰되,
 * "수집품 진열장"답게 타일 그리드로 구성한다. 정상 색은 촛불 금빛, 이로치(변종)는
 * 이 게임에서 안 쓰던 옥빛(초록)으로 갈라 한눈에 "이건 다르다"가 읽히게 한다.
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
  width: min(720px, 96vw);
  max-height: 92vh;
  display: grid;
  grid-template-rows: auto auto 1fr;
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
.wax-figure-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 15px 22px;
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

.wax-figure-body {
  overflow-y: auto;
  min-height: 0;
  padding: 4px 24px 22px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  scrollbar-width: thin;
  scrollbar-color: rgba(244, 178, 86, 0.7) transparent;
}
.wax-figure-body::-webkit-scrollbar { width: 4px; }
.wax-figure-body::-webkit-scrollbar-thumb { background: linear-gradient(180deg, #ffd178, #c8842e); border-radius: 999px; }

.wax-section-title {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin: 0 0 10px;
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.1em;
  color: #ffdf9e;
}
.wax-section-note { font-size: 11px; font-weight: 600; color: rgba(255, 233, 196, 0.5); letter-spacing: 0.02em; }
.wax-capacity {
  font-size: 12px;
  font-weight: 800;
  color: var(--color-flame, #ffd778);
  font-variant-numeric: tabular-nums;
}
.wax-empty {
  margin: 0;
  padding: 14px;
  text-align: center;
  font-size: 12px;
  color: rgba(255, 233, 196, 0.42);
  border: 1px dashed rgba(255, 215, 120, 0.18);
  border-radius: 12px;
}

/* ── 이번 모험(임시보관함) ─────────────────────────────────── */
.wax-hold-list { list-style: none; margin: 0 0 10px; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.wax-hold-row {
  display: grid;
  grid-template-columns: 30px 1fr auto;
  align-items: center;
  gap: 10px;
  padding: 7px 10px;
  border-radius: 10px;
  background: linear-gradient(180deg, rgba(255, 210, 130, 0.05), rgba(8, 6, 12, 0.28));
  border: 1px solid rgba(255, 215, 120, 0.14);
}
.wax-hold-row.is-shiny {
  border-color: rgba(120, 235, 175, 0.4);
  background: linear-gradient(180deg, rgba(120, 235, 175, 0.08), rgba(8, 6, 12, 0.28));
}
.wax-hold-glyph { display: inline-flex; width: 22px; height: 22px; color: #ffd178; }
.wax-hold-row.is-shiny .wax-hold-glyph { color: #7bf0ae; filter: drop-shadow(0 0 6px rgba(123, 240, 174, 0.6)); }
.wax-hold-glyph .icon { width: 22px; height: 22px; }
.wax-hold-body { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.wax-hold-name { font-size: 12px; font-weight: 800; color: #fff5dc; }
.wax-hold-effect { font-size: 11px; color: rgba(255, 233, 196, 0.62); }
.wax-hold-actions { display: flex; align-items: center; gap: 6px; }
.wax-shiny-tag {
  font-style: normal;
  font-size: 10px;
  font-weight: 800;
  color: #7bf0ae;
  text-shadow: 0 0 6px rgba(123, 240, 174, 0.6);
  margin-left: 4px;
}

.wax-btn {
  border-radius: 8px;
  border: 1px solid rgba(255, 215, 120, 0.4);
  background: rgba(255, 210, 130, 0.08);
  color: #ffdf9e;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.04em;
  padding: 5px 10px;
  cursor: pointer;
  transition: background 0.14s ease, box-shadow 0.14s ease, transform 0.1s ease;
}
.wax-btn:hover { background: rgba(255, 210, 130, 0.2); box-shadow: 0 0 10px rgba(244, 178, 86, 0.35); transform: translateY(-1px); }
.wax-btn-discard {
  border-color: rgba(255, 130, 130, 0.32);
  color: rgba(255, 190, 190, 0.85);
  background: rgba(255, 90, 90, 0.06);
  padding: 5px 8px;
}
.wax-btn-discard:hover { background: rgba(255, 90, 90, 0.16); box-shadow: 0 0 10px rgba(255, 110, 110, 0.3); }
.wax-btn-stow-all { width: 100%; text-align: center; }
.wax-btn-merge { margin-left: auto; }

/* ── 밀랍상함(영구 보관) ────────────────────────────────────── */
.wax-tile-grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 10px;
}
.wax-tile {
  position: relative;
  display: grid;
  grid-template-columns: 1fr auto;
  grid-template-rows: auto auto auto auto;
  grid-template-areas: 'glyph star' 'name name' 'count count' 'effect effect' 'merge merge';
  gap: 4px 6px;
  padding: 10px;
  border-radius: 12px;
  border: 1px solid rgba(255, 215, 120, 0.32);
  background: linear-gradient(180deg, rgba(45, 32, 50, 0.94), rgba(18, 12, 24, 0.98));
  box-shadow: inset 0 1px 0 rgba(255, 232, 168, 0.14), 0 8px 16px rgba(0, 0, 0, 0.45);
}
.wax-tile.is-shiny {
  border-color: rgba(120, 235, 175, 0.46);
  box-shadow: inset 0 1px 0 rgba(190, 255, 220, 0.14), 0 8px 16px rgba(0, 0, 0, 0.45), 0 0 16px rgba(123, 240, 174, 0.16);
}
.wax-tile-glyph { grid-area: glyph; display: inline-flex; width: 26px; height: 26px; color: #ffd178; filter: drop-shadow(0 0 6px rgba(255, 210, 130, 0.5)); }
.wax-tile.is-shiny .wax-tile-glyph { color: #7bf0ae; filter: drop-shadow(0 0 8px rgba(123, 240, 174, 0.65)); }
.wax-tile-glyph .icon { width: 26px; height: 26px; }
.wax-tile-star {
  grid-area: star;
  justify-self: end;
  align-self: start;
  font-size: 11px;
  font-weight: 900;
  color: var(--color-flame, #ffd778);
  text-shadow: 0 0 6px rgba(255, 215, 120, 0.5);
}
.wax-tile-name { grid-area: name; font-size: 12px; font-weight: 800; color: #fff5dc; line-height: 1.3; }
.wax-tile-count { grid-area: count; font-size: 11px; font-weight: 700; color: rgba(255, 233, 196, 0.66); font-variant-numeric: tabular-nums; }
.wax-tile-effect { grid-area: effect; font-size: 10.5px; color: rgba(255, 233, 196, 0.7); line-height: 1.35; }
.wax-tile-effect b { color: #ffe6a6; font-variant-numeric: tabular-nums; }
.wax-tile .wax-btn-merge { grid-area: merge; width: 100%; text-align: center; }
`
