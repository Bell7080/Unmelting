/**
 * Compendium overlay, codex cards, recipe art, and floating compendium launcher styling.
 * Split from GameBoardRenderer so renderer logic stays navigable.
 */
export const GAME_BOARD_COMPENDIUM_STYLES = `
/* ---------- Compendium (도감) overlay ---------- */
.compendium-overlay {
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
.compendium-overlay.is-open { display: flex; }
.compendium-modal {
  width: min(880px, 96vw);
  height: 86vh;
  display: grid;
  grid-template-rows: auto auto 1fr auto;
  background: linear-gradient(180deg, rgba(34, 26, 50, 0.96), rgba(18, 14, 28, 0.98));
  border: 1px solid var(--color-border-warm);
  border-radius: 18px;
  box-shadow: 0 24px 48px rgba(0, 0, 0, 0.65);
  /* overflow: visible so recipe hover-float clones can escape the modal boundary. */
  overflow: visible;
  color: #fff5dc;
}
.compendium-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  border-bottom: 1px solid var(--color-border-soft);
}
.compendium-title {
  font-size: 18px;
  font-weight: 800;
  letter-spacing: 0.06em;
  margin: 0;
  color: var(--color-flame-warm);
}
.compendium-close {
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
.compendium-close:hover { background: rgba(244, 164, 96, 0.18); }
.compendium-tabs {
  display: flex;
  gap: 4px;
  padding: 8px 16px 0;
  border-bottom: 1px solid var(--color-border-soft);
}
.compendium-tab {
  appearance: none;
  background: transparent;
  border: 1px solid transparent;
  border-bottom: none;
  padding: 8px 16px;
  border-radius: 8px 8px 0 0;
  color: var(--color-text-muted);
  cursor: pointer;
  font-family: inherit;
  font-size: 13px;
  font-weight: 700;
}
.compendium-tab.is-active {
  color: var(--color-flame-warm);
  background: rgba(244, 164, 96, 0.1);
  border-color: rgba(244, 164, 96, 0.4);
}
.compendium-body {
  /* overflow-y: auto 로 탭 내용이 적어도 패널 크기는 고정. 레시피 hover float는
     JS가 body에 클론을 붙이므로 스크롤 컨테이너여도 잘린다. */
  overflow-y: auto;
  min-height: 0;
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  /* Match the score-log scrollbar style so every scrollable UI uses the
     same warm candle thumb and dark recessed track. */
  scrollbar-width: thin;
  scrollbar-color: rgba(244, 164, 96, 0.7) rgba(20, 16, 28, 0.45);
}
.compendium-body::-webkit-scrollbar {
  width: 4px;
}
.compendium-body::-webkit-scrollbar-track {
  background: rgba(20, 16, 28, 0.4);
  border-radius: 999px;
}
.compendium-body::-webkit-scrollbar-thumb {
  background: linear-gradient(180deg, var(--color-flame), var(--color-flame-deep));
  border-radius: 999px;
  box-shadow: 0 0 6px rgba(244, 164, 96, 0.4);
}
.compendium-body::-webkit-scrollbar-thumb:hover {
  background: linear-gradient(180deg, var(--color-flame), var(--color-flame-warm));
}
.compendium-section {
  margin: 14px 0 6px;
  padding-left: 10px;
  font-size: 12px;
  color: var(--color-flame);
  letter-spacing: 0.16em;
  text-transform: uppercase;
  font-weight: 800;
  border-left: 2px solid rgba(244, 164, 96, 0.55);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.7);
}
.compendium-section:first-child { margin-top: 4px; }
.compendium-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
}

/* ---------- Codex tile: normalized compact card for catalog tabs ----------
   Used by enemies, traps, treasures, flowers, relics, terms. Mirrors the
   warm-gold / dark-glass language from the shop-relic card so the codex
   shares visual grammar with the left panel and the rail. */
.codex-tile-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(178px, 1fr));
  gap: 12px;
}
.codex-tile {
  position: relative;
  display: grid;
  grid-template-rows: 152px auto auto auto;
  gap: 8px;
  padding: 10px 10px 12px;
  border-radius: 12px;
  border: 1px solid rgba(255, 215, 120, 0.36);
  background:
    linear-gradient(180deg, rgba(45, 32, 50, 0.96), rgba(18, 12, 24, 0.98));
  box-shadow:
    inset 0 1px 0 rgba(255, 232, 168, 0.16),
    0 8px 18px rgba(0, 0, 0, 0.5);
  color: rgba(255, 245, 220, 0.96);
  min-height: 0;
  transition: transform 0.18s ease, box-shadow 0.2s ease, border-color 0.2s ease;
}
.codex-tile:hover {
  transform: translateY(-2px);
  border-color: rgba(255, 215, 120, 0.62);
  box-shadow:
    inset 0 1px 0 rgba(255, 232, 168, 0.22),
    0 12px 26px rgba(0, 0, 0, 0.6),
    0 0 18px rgba(244, 164, 96, 0.22);
}
.codex-tile-art {
  position: relative;
  border-radius: 8px;
  /* cover (not contain) lets the sprite fill the upper panel edge-to-edge so
     square or portrait illustrations stop reading as a postage stamp. The
     panel itself preserves the image's aspect ratio because background-size
     keeps the source proportional; only the crop window changes. */
  background: rgba(10, 7, 18, 0.55) center / cover no-repeat;
  border: 1px solid rgba(255, 232, 168, 0.16);
  box-shadow: inset 0 0 22px rgba(0, 0, 0, 0.55);
  overflow: hidden;
}
.codex-tile-art::after {
  /* Subtle vignette so sprites with hard edges blend into the tile body. */
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(120% 70% at 50% 0%, transparent 55%, rgba(8, 5, 14, 0.62) 100%);
}
.codex-tile-art--icon {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-flame);
  background-color: rgba(10, 7, 18, 0.55);
}
.codex-tile-art--icon .icon {
  width: 46px;
  height: 46px;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.55));
}
.codex-tile-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  min-width: 0;
}
.codex-tile-name {
  font-size: 13px;
  font-weight: 900;
  color: #fff5dc;
  letter-spacing: 0.02em;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.78);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.codex-tile-tag {
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.08em;
  padding: 2px 7px;
  border-radius: 999px;
  color: var(--color-flame);
  background: rgba(0, 0, 0, 0.32);
  border: 1px solid rgba(244, 164, 96, 0.42);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.78);
}
.codex-tile-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.codex-stat-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.02em;
  font-variant-numeric: tabular-nums;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 232, 168, 0.18);
  color: rgba(255, 245, 220, 0.92);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.7);
}
.codex-stat-chip .icon {
  width: 13px;
  height: 13px;
}
.codex-stat-chip.is-hp {
  color: #ffb3a1;
  border-color: rgba(255, 150, 130, 0.35);
}
.codex-stat-chip.is-atk {
  color: #ffd58a;
  border-color: rgba(255, 215, 120, 0.4);
}
.codex-stat-chip.is-gold {
  color: #ffe8a0;
  border-color: rgba(255, 215, 120, 0.42);
}
.codex-stat-chip.is-shield {
  color: #ffe0b0;
  border-color: rgba(255, 215, 120, 0.32);
}
.codex-stat-chip.is-spore {
  color: #c9b6e0;
  border-color: rgba(176, 150, 220, 0.4);
}
.codex-stat-chip.is-bomb {
  color: #ffb088;
  border-color: rgba(255, 130, 90, 0.42);
}
.codex-stat-chip.is-flower {
  color: #ffd2c8;
  border-color: rgba(255, 200, 200, 0.34);
}
.codex-tile-note {
  margin: 0;
  font-size: 11px;
  line-height: 1.42;
  color: rgba(232, 214, 180, 0.78);
  word-break: keep-all;
}
.codex-tile-flavor {
  margin: 0;
  font-size: 11px;
  line-height: 1.4;
  color: rgba(232, 214, 180, 0.6);
  font-style: italic;
  word-break: keep-all;
}
/* 유물 탭: 카드 폭/아트 높이 확대해 효과 텍스트 가독성 향상 */
.codex-tile-grid--relics {
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
}
.codex-tile--relic {
  grid-template-rows: 180px auto auto auto;
}
.codex-tile--relic .codex-stat-chip {
  font-size: 13px;
  white-space: normal;
  word-break: keep-all;
  line-height: 1.45;
}
/* 손패 탭: 기본/★ 항상 세로 2줄, 폰트 확대 */
.codex-tile--hand .codex-tile-stats {
  flex-direction: column;
  gap: 5px;
}
.codex-tile--hand .codex-stat-chip {
  font-size: 13px;
  white-space: normal;
  word-break: keep-all;
  line-height: 1.45;
}
.codex-tile-grid--terms {
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
}
.codex-tile--term {
  grid-template-rows: 48px auto auto;
  padding-top: 8px;
}
.codex-tile--term .codex-tile-art {
  background: transparent;
  border: 0;
  box-shadow: none;
}
.codex-tile--term .codex-tile-art::after { display: none; }
.codex-tile--term .codex-tile-art--icon .icon {
  width: 32px;
  height: 32px;
}
/* 미발견 적/잠긴 카드: 실루엣 느낌으로 어둡게 처리 */
.codex-tile--unknown {
  border-color: rgba(255, 255, 255, 0.07);
  background: linear-gradient(180deg, rgba(14, 10, 20, 0.97), rgba(8, 5, 14, 0.99));
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.04), 0 6px 14px rgba(0,0,0,0.6);
}
.codex-tile--unknown:hover {
  transform: none;
  border-color: rgba(255, 255, 255, 0.07);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.04), 0 6px 14px rgba(0,0,0,0.6);
}
.codex-tile--unknown .codex-tile-art {
  filter: brightness(0.06) saturate(0);
}
.codex-tile--unknown .codex-tile-name {
  color: rgba(255, 255, 255, 0.18);
}
.codex-tile--unknown .codex-tile-tag {
  opacity: 0.22;
}
/* 잠긴 레시피 카드 */
.compendium-card--unknown {
  opacity: 0.3;
  filter: saturate(0.1);
  pointer-events: none;
}
.codex-tile--owned {
  border-color: rgba(132, 215, 112, 0.58);
  box-shadow:
    inset 0 1px 0 rgba(223, 255, 183, 0.22),
    0 8px 18px rgba(0, 0, 0, 0.5),
    0 0 18px rgba(78, 168, 82, 0.18);
}
.codex-tile--owned .codex-tile-tag {
  color: rgba(224, 255, 190, 0.96);
  border-color: rgba(132, 215, 112, 0.58);
  background: linear-gradient(180deg, rgba(35, 70, 38, 0.92), rgba(18, 38, 23, 0.96));
}
/* Shared card-shaped face for hand hover previews and hand-card compendium
   entries. The art is clipped through a rounded mask and object-fit preserves
   the source image ratio while filling the top frame. */
.common-card-face {
  position: relative;
  display: grid;
  grid-template-rows: minmax(142px, auto) auto;
  gap: 10px;
  width: 100%;
  height: 100%;
  min-height: 260px;
  padding: 12px;
  border-radius: 14px;
  overflow: hidden;
  background:
    linear-gradient(180deg, rgba(47, 35, 58, 0.98), rgba(18, 13, 26, 0.98)),
    radial-gradient(circle at 50% 0%, rgba(255, 215, 120, 0.16), transparent 64%);
  border: 1px solid rgba(255, 215, 120, 0.46);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.08),
    inset 0 0 0 2px rgba(0, 0, 0, 0.24),
    0 0 22px rgba(244, 164, 96, 0.18);
  color: #fff5dc;
}

.common-card-face::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  /* Reuse the current card-back art as a softened front-face pattern so the
     playable card face has ornament without competing with the illustration. */
  background: var(--hand-card-back) center / cover no-repeat;
  opacity: 0.18;
  filter: saturate(0.72) brightness(1.28) sepia(0.2);
  mix-blend-mode: screen;
}

.common-card-face::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    linear-gradient(180deg, rgba(255, 232, 168, 0.08), transparent 34%, rgba(0, 0, 0, 0.22)),
    radial-gradient(120% 95% at 50% 6%, transparent 54%, rgba(7, 5, 12, 0.5) 100%);
}
.common-card-art {
  position: relative;
  z-index: 1;
  height: 142px;
  min-height: 142px;
  border-radius: 10px;
  overflow: hidden;
  clip-path: inset(0 round 10px);
  background: rgba(0, 0, 0, 0.34);
  border: 1px solid rgba(255, 232, 168, 0.2);
  box-shadow: inset 0 0 20px rgba(0, 0, 0, 0.38);
}
.common-card-art img {
  width: 100%;
  height: 100%;
  display: block;
  /* Cover plus the rounded overflow mask gives every thumbnail the same
     visible frame while preserving the original image asset unchanged. */
  object-fit: cover;
  object-position: center;
}
.common-card-body {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-rows: auto 1fr;
  gap: 8px;
  min-height: 82px;
  text-align: center;
}
.common-card-title-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-width: 0;
}
.common-card-name {
  font-size: 16px;
  font-weight: 900;
  letter-spacing: 0.04em;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.86);
}
.common-card-badge {
  flex-shrink: 0;
  padding: 2px 7px;
  border-radius: 999px;
  border: 1px solid rgba(244, 164, 96, 0.48);
  color: var(--color-flame);
  background: rgba(0, 0, 0, 0.22);
  font-size: 10px;
  font-weight: 800;
}
.common-card-desc {
  margin: 0;
  /* Center the effect copy within the lower text area rather than letting it
     sit on the card bottom edge. */
  align-self: center;
  color: rgba(255, 232, 168, 0.9);
  font-size: 15px;
  line-height: 1.42;
  word-break: keep-all;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.72);
}
.common-card-subdesc {
  color: rgba(255, 245, 220, 0.72);
}
.compendium-hand-card {
  /* Codex-only hand cards may grow vertically with long effect text instead of
     squeezing the title upward into the illustration. */
  aspect-ratio: auto;
  height: auto;
  min-height: 270px;
}
.compendium-grid .common-card-face {
  height: auto;
}

/* Unified compendium card. Every tab uses the same skeleton:
   art slot → head (name + badge) → stat rows → optional description.
   The art slot has three variants (sprite / icon / recipe ingredients) but
   shares the same height + framed background so the grid reads as one
   design language. */
.compendium-card {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 200px;
}
.compendium-card-wide {
  grid-column: 1 / -1;
}
.compendium-card-art {
  height: 88px;
  border-radius: 8px;
  background-color: rgba(0, 0, 0, 0.32);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
}
.compendium-card-art--sprite {
  background-size: contain;
  background-repeat: no-repeat;
  background-position: center;
}
.compendium-card-art--icon {
  color: var(--color-flame);
}
.compendium-card-art--icon .icon {
  width: 56px;
  height: 56px;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.55));
}
.compendium-card-art--recipe {
  flex-wrap: wrap;
  gap: 6px;
  padding: 8px;
  height: auto;
  min-height: 88px;
  align-content: center;
  background-color: rgba(0, 0, 0, 0.2);
}
.compendium-card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 6px;
}
.compendium-card-name {
  font-weight: 800;
  color: #fff5dc;
  font-size: 13px;
}
.compendium-card-badge {
  font-size: 10px;
  color: var(--color-flame);
  padding: 2px 8px;
  border: 1px solid rgba(244, 164, 96, 0.45);
  border-radius: 999px;
  white-space: nowrap;
  letter-spacing: 0.04em;
}
.compendium-card-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
  font-size: 11px;
  color: var(--color-text-muted);
}
.compendium-card-label {
  font-weight: 600;
  flex-shrink: 0;
}
.compendium-card-value {
  color: #fff5dc;
  text-align: right;
}
.compendium-card-desc {
  margin: 2px 0 0;
  font-size: 11px;
  color: var(--color-text-muted);
  line-height: 1.45;
}

/* Recipe ingredient pills shown in the combo tab's art slot. */
.compendium-recipe-ing {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.12);
  font-size: 11px;
  color: #fff5dc;
}
.compendium-recipe-ing-icon {
  display: inline-flex;
  width: 16px;
  height: 16px;
  color: var(--color-flame);
}
.compendium-recipe-ing-icon .icon {
  width: 16px;
  height: 16px;
}
.compendium-recipe-ing-name {
  font-weight: 600;
  letter-spacing: 0.02em;
}
.compendium-recipe-ing-count {
  color: var(--color-flame);
  font-weight: 700;
}
/* Reuse the hand-cat-* tint for the pill left edge so categories read
   instantly inside a recipe. */
.compendium-recipe-ing.hand-cat-recovery { box-shadow: inset 3px 0 0 rgba(103, 196, 152, 0.85); }
.compendium-recipe-ing.hand-cat-tool     { box-shadow: inset 3px 0 0 rgba(255, 215, 120, 0.9); }
.compendium-recipe-ing.hand-cat-control  { box-shadow: inset 3px 0 0 rgba(145, 174, 210, 0.9); }
.compendium-recipe-ing.hand-cat-attack   { box-shadow: inset 3px 0 0 rgba(168, 58, 58, 0.9); }

.compendium-section-blurb {
  margin: 0 0 4px;
  font-size: 11px;
  color: var(--color-text-muted);
  line-height: 1.5;
}


.compendium-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.compendium-title-icon {
  display: inline-flex;
  color: var(--color-flame-warm);
  width: 20px;
  height: 20px;
}
.compendium-title-icon .icon {
  width: 20px;
  height: 20px;
}

.compendium-footer {
  padding: 8px 20px 12px;
  font-size: 11px;
  color: var(--color-text-muted);
  text-align: center;
  border-top: 1px solid var(--color-border-soft);
}

/* Floating compendium launcher: the button keeps semantic click behavior,
   but visually reads as only a flat icon with a pre-reserved label below it. */
.compendium-btn {
  appearance: none;
  background: transparent;
  border: none;
  color: var(--color-flame-warm);
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  font-weight: 800;
  white-space: nowrap;
}
.compendium-btn-floating {
  position: relative;
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 74px;
  min-height: 82px;
  padding: 4px;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.85);
}
.compendium-btn-icon {
  display: inline-flex;
  width: 46px;
  height: 46px;
  color: rgba(255, 232, 168, 0.88);
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.65));
  transition: transform 0.18s cubic-bezier(0.2, 0.86, 0.28, 1), filter 0.18s ease, color 0.18s ease;
}
.compendium-btn-icon .icon {
  width: 46px;
  height: 46px;
}
.compendium-btn-label {
  min-height: 14px;
  color: rgba(255, 232, 168, 0.92);
  letter-spacing: 0.08em;
  opacity: 0;
  transform: translateY(-2px);
  transition: opacity 0.16s ease, transform 0.16s ease;
}
.compendium-btn-floating:hover .compendium-btn-icon,
.compendium-btn-floating:focus-visible .compendium-btn-icon {
  color: #fff3c8;
  transform: translateY(-2px) scale(1.08);
  filter:
    drop-shadow(0 2px 4px rgba(0, 0, 0, 0.7))
    drop-shadow(0 0 10px rgba(255, 215, 120, 0.62));
  animation: compendium-icon-sparkle 0.82s ease-in-out infinite;
}
.compendium-btn-floating:hover .compendium-btn-label,
.compendium-btn-floating:focus-visible .compendium-btn-label {
  opacity: 1;
  transform: translateY(0);
}
.compendium-btn-floating:focus-visible {
  outline: 1px solid rgba(255, 215, 120, 0.55);
  outline-offset: 4px;
  border-radius: 12px;
}
@keyframes compendium-icon-sparkle {
  0%, 100% {
    filter:
      drop-shadow(0 2px 4px rgba(0, 0, 0, 0.7))
      drop-shadow(0 0 8px rgba(255, 215, 120, 0.48));
  }
  50% {
    filter:
      drop-shadow(0 2px 4px rgba(0, 0, 0, 0.7))
      drop-shadow(0 0 16px rgba(255, 232, 168, 0.82));
  }
}

/* ─── Compendium: mobile responsive ────────────────────────────────────── */
/* Portrait phones: tighter padding, smaller grid cells, enable body scroll. */
@media (max-width: 480px) {
  .compendium-overlay { padding: 10px; }
  /* Allow scrolling; recipe card fan outside modal is secondary on mobile. */
  .compendium-body { overflow-y: auto; }
  .compendium-grid,
  .codex-tile-grid { grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); }
}
/* Landscape phones: maximize modal height and enable scroll. */
@media (max-width: 760px) and (orientation: landscape) {
  .compendium-overlay { padding: 6px; }
  .compendium-modal { max-height: 96vh; }
  .compendium-body { overflow-y: auto; }
}

`
