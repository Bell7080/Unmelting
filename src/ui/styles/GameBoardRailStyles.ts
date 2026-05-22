/**
 * Rail cells, field cards, grouping, selection, and trap-block mark styling.
 * Split from GameBoardRenderer so renderer logic stays navigable.
 */
export const GAME_BOARD_RAIL_STYLES = `
/* ---------- Rail (3x3) ---------- */
.rail {
  display: grid;
  grid-template-rows: repeat(3, minmax(0, 1fr));
  gap: clamp(6px, 1vh, 10px);
  padding: clamp(10px, 1.6vh, 14px);
  /* Stays simple — a translucent dark slab so the page-level art reads
     through, with just enough shadow to separate the rail from the room. */
  background: rgba(14, 10, 22, 0.62);
  border: 1px solid rgba(139, 111, 71, 0.55);
  border-radius: 14px;
  box-shadow:
    inset 0 0 0 1px rgba(255, 215, 120, 0.05),
    inset 0 0 60px rgba(0, 0, 0, 0.45),
    0 8px 28px rgba(0, 0, 0, 0.55);
  position: relative;
  /* Visible so the ×N group badge can poke out of cell edges. */
  overflow: visible;
  min-height: 0;
  backdrop-filter: blur(2px);
}

.rail::before {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(
    ellipse 80% 60% at 50% 100%,
    rgba(244, 164, 96, 0.18),
    transparent 70%
  );
  pointer-events: none;
}

.rail-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: clamp(6px, 1vw, 10px);
  position: relative;
  z-index: 1;
  min-height: 0;
}

.rail-row.dist-2 {
  opacity: 0.42;
  transform: scale(0.92);
  transform-origin: center bottom;
}
.rail-row.dist-1 {
  opacity: 0.7;
  transform: scale(0.96);
  transform-origin: center bottom;
}
.rail-row.dist-0 {
  opacity: 1;
}

/* ---------- Cell / Card ---------- */
.cell {
  border-radius: 10px;
  border: 1px dashed var(--color-border-soft);
  background: rgba(255, 255, 255, 0.015);
  display: flex;
  align-items: stretch;
  justify-content: stretch;
  position: relative;
  transition: transform 0.18s ease, box-shadow 0.2s ease, border-color 0.2s ease;
  min-height: 0;
  min-width: 0;
}

.cell.empty {
  border-style: dashed;
  background:
    repeating-linear-gradient(
      45deg,
      rgba(255, 255, 255, 0.015) 0 6px,
      transparent 6px 12px
    );
}

.cell.card {
  cursor: default;
  border: 1px solid var(--color-border-warm);
  background: #1c1424;
  color: #fff5dc;
  /* Shared depth tokens keep the soft rear shadow identical for 1/2/3-cell cards. */
  --card-depth-shadow: 0 14px 24px rgba(0, 0, 0, 0.45);
  --card-lift-shadow: 0 4px 10px rgba(0, 0, 0, 0.55);
  --card-lift-shadow-grouped: var(--card-lift-shadow);
  box-shadow:
    inset 0 1px 0 rgba(255, 232, 168, 0.18),
    inset 0 -10px 18px rgba(0, 0, 0, 0.45),
    var(--card-lift-shadow),
    var(--card-depth-shadow);
  /* Sprite art is clipped by .card-face below — keep cell visible so the
     ×N group badge can poke out of the canvas edge. */
  overflow: visible;
  isolation: isolate;
}

.cell.is-active {
  cursor: pointer;
}
/* Hover only adds a subtle glow so it never fights hit/attack movement animations. */
.cell.is-active:hover {
  border-color: var(--color-flame-warm);
  box-shadow:
    inset 0 1px 0 rgba(255, 232, 168, 0.28),
    inset 0 -10px 18px rgba(0, 0, 0, 0.45),
    var(--card-lift-shadow),
    var(--card-depth-shadow),
    0 0 18px rgba(244, 164, 96, 0.36);
}

.cell.is-selected {
  border-color: var(--color-flame);
  box-shadow:
    inset 0 0 0 2px rgba(255, 215, 120, 0.6),
    0 0 22px rgba(255, 215, 120, 0.55),
    0 4px 14px rgba(0, 0, 0, 0.55);
  animation: candle-glow 1.6s ease-in-out infinite alternate;
}

@keyframes candle-glow {
  from {
    box-shadow:
      inset 0 0 0 2px rgba(255, 215, 120, 0.55),
      0 0 18px rgba(255, 215, 120, 0.5),
      0 4px 14px rgba(0, 0, 0, 0.55);
  }
  to {
    box-shadow:
      inset 0 0 0 2px rgba(255, 215, 120, 0.85),
      0 0 28px rgba(255, 215, 120, 0.75),
      0 4px 18px rgba(0, 0, 0, 0.6);
  }
}

.cell.card.is-grouped {
  border-width: 2px;
  box-shadow:
    inset 0 1px 0 rgba(255, 232, 168, 0.28),
    inset 0 -12px 22px rgba(0, 0, 0, 0.55),
    var(--card-lift-shadow-grouped),
    var(--card-depth-shadow),
    0 0 18px rgba(244, 164, 96, 0.18);
}

/* Type accent is now a soft wax band along the bottom edge of the card,
   echoing the candle-wax/sealing-wax tone from the rest of the UI instead of
   the harder neon-coloured side strip. The base border stays warm aged brass
   so every card reads as part of the same parchment family. */
.cell.card.type-enemy { border-color: rgba(168, 58, 58, 0.78); }
.cell.card.type-enemy::before {
  content: '';
  position: absolute;
  left: 6px; right: 6px; top: 2px;
  height: 3px;
  border-radius: 4px;
  background: linear-gradient(90deg, transparent, var(--color-enemy) 26%, #5a1818 74%, transparent);
  z-index: 3;
  pointer-events: none;
  opacity: 0.78;
}
.cell.card.type-trap { border-color: rgba(112, 76, 150, 0.78); }
.cell.card.type-trap::before {
  content: '';
  position: absolute;
  left: 6px; right: 6px; top: 2px;
  height: 3px;
  border-radius: 4px;
  background: linear-gradient(90deg, transparent, var(--color-trap) 26%, #2c1d44 74%, transparent);
  z-index: 3;
  pointer-events: none;
  opacity: 0.78;
}
.cell.card.type-treasure { border-color: rgba(201, 161, 58, 0.86); }
.cell.card.type-treasure::before {
  content: '';
  position: absolute;
  left: 6px; right: 6px; top: 2px;
  height: 3px;
  border-radius: 4px;
  background: linear-gradient(90deg, transparent, var(--color-flame) 26%, var(--color-treasure) 74%, transparent);
  z-index: 3;
  pointer-events: none;
  opacity: 0.86;
}

.cell.card.type-trap.is-grouped[data-span="3"] {
  animation: trap-danger 1.2s ease-in-out infinite;
}
@keyframes trap-danger {
  0%, 100% { box-shadow: inset 0 1px 0 rgba(255,255,255,0.3), var(--card-lift-shadow-grouped), var(--card-depth-shadow), 0 0 12px rgba(168,58,58,0.4); }
  50%      { box-shadow: inset 0 1px 0 rgba(255,255,255,0.3), var(--card-lift-shadow-grouped), var(--card-depth-shadow), 0 0 22px rgba(168,58,58,0.85); }
}

/* Grouped cards should react exactly like single-cell cards: only the
   candlelight strength changes on hover, while the type-colored border stays
   intact because the later type rules keep ownership of border-color. */
.cell.card.is-active.is-grouped:hover {
  box-shadow:
    inset 0 1px 0 rgba(255, 232, 168, 0.28),
    inset 0 -12px 22px rgba(0, 0, 0, 0.55),
    var(--card-lift-shadow-grouped),
    var(--card-depth-shadow),
    0 0 18px rgba(244, 164, 96, 0.36);
}

/* The 3-cell trap's danger pulse is a keyframe animation, so hover must pause
   it before applying the same border-preserving candlelight used elsewhere. */
.cell.card.type-trap.is-active.is-grouped[data-span="3"]:hover {
  animation: none;
  box-shadow:
    inset 0 1px 0 rgba(255, 232, 168, 0.28),
    inset 0 -12px 22px rgba(0, 0, 0, 0.55),
    var(--card-lift-shadow-grouped),
    var(--card-depth-shadow),
    0 0 18px rgba(244, 164, 96, 0.36);
}

/* Grouped selected cards previously lost the single-cell selection glow because
   the grouped shadow rule had higher specificity; this restores parity while
   retaining the shared rear depth shadow. */
.cell.card.is-grouped.is-selected {
  box-shadow:
    inset 0 0 0 2px rgba(255, 215, 120, 0.6),
    0 0 22px rgba(255, 215, 120, 0.55),
    var(--card-lift-shadow-grouped),
    var(--card-depth-shadow);
  animation: grouped-candle-glow 1.6s ease-in-out infinite alternate;
}
@keyframes grouped-candle-glow {
  from {
    box-shadow:
      inset 0 0 0 2px rgba(255, 215, 120, 0.55),
      0 0 18px rgba(255, 215, 120, 0.5),
      var(--card-lift-shadow-grouped),
      var(--card-depth-shadow);
  }
  to {
    box-shadow:
      inset 0 0 0 2px rgba(255, 215, 120, 0.85),
      0 0 28px rgba(255, 215, 120, 0.75),
      var(--card-lift-shadow-grouped),
      var(--card-depth-shadow);
  }
}

.card-face {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  border-radius: inherit;
}

.card-art {
  position: absolute;
  inset: 0;
  background-size: cover;
  background-position: center 32%;
  background-repeat: no-repeat;
  z-index: 0;
  /* Slight desaturation so warm rail tone tints the art uniformly. */
  filter: saturate(1.05) contrast(1.02);
}

/* Bottom-anchored dark gradient so card-name + stats stay legible over art. */
.card-overlay {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  background:
    linear-gradient(
      180deg,
      rgba(20, 16, 28, 0.0) 38%,
      rgba(20, 16, 28, 0.55) 70%,
      rgba(10, 7, 18, 0.92) 100%
    ),
    radial-gradient(
      120% 60% at 50% 0%,
      rgba(244, 164, 96, 0.06),
      transparent 70%
    );
}

.card-content {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  align-items: center;
  text-align: center;
  padding: clamp(4px, 1vh, 8px) clamp(4px, 1vw, 8px);
  gap: 4px;
}

.card-name {
  font-size: var(--font-size-sm);
  font-weight: 700;
  color: #fff5dc;
  line-height: 1.15;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  width: 100%;
  padding: 0 2px;
  text-shadow:
    0 1px 2px rgba(0, 0, 0, 0.85),
    0 0 6px rgba(0, 0, 0, 0.6);
  letter-spacing: 0.02em;
}

.card-stats {
  display: flex;
  gap: 10px;
  font-size: 12px;
  font-weight: 700;
  color: #fff5dc;
  flex-wrap: wrap;
  justify-content: center;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.85);
}
.card-stats .stat {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  line-height: 1;
}
.card-stats .stat .icon { font-size: 13px; }
.card-stats .stat-value { font-variant-numeric: tabular-nums; }
.card-stats .stat.hp { color: #ffb3a1; }
.card-stats .stat.atk { color: #ffd58a; }
/* Trap "점화 / 폭발 / 즉사" status word: flat warm-ink chip, matched to
   the bomb/spore badges instead of a bright red pill. */
.card-stats .stat.trap-state {
  color: #ffd9c3;
  font-size: 11px;
  letter-spacing: 0.16em;
  padding: 1px 6px;
  border-radius: 4px;
  border: 1px solid rgba(255, 150, 120, 0.42);
  background: rgba(76, 22, 18, 0.62);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.85);
}
.card-stats.danger {
  color: #fff;
  background: var(--color-enemy);
  padding: 2px 10px;
  border-radius: 999px;
  letter-spacing: 0.08em;
  border: 1px solid rgba(255, 200, 200, 0.45);
  text-shadow: none;
}
.card-stats.good {
  color: #2a1f14;
  background: var(--color-treasure);
  padding: 2px 10px;
  border-radius: 999px;
  border: 1px solid rgba(255, 232, 168, 0.7);
  text-shadow: none;
}
.card-stats.group-note {
  gap: 4px;
  padding: 0;
  color: rgba(255, 232, 168, 0.96);
  background: transparent;
  border: 0;
  border-radius: 0;
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-shadow:
    0 1px 3px rgba(0, 0, 0, 0.92),
    0 0 10px rgba(255, 215, 120, 0.58);
}
.card-stats.group-note .icon {
  width: 13px;
  height: 13px;
  color: currentColor;
  filter: drop-shadow(0 0 7px rgba(255, 215, 120, 0.45));
}

.group-badge {
  position: absolute;
  /* Text-only group count: keep it stamped over the corner, but remove the
     wax-plate backing so 2/3-wide cards read like inked web labels. */
  top: -14px;
  right: -12px;
  padding: 0;
  color: rgba(255, 248, 224, 0.98);
  background: transparent;
  border: 0;
  border-radius: 0;
  box-shadow: none;
  font-size: 16px;
  font-weight: 1000;
  letter-spacing: 0.02em;
  text-shadow:
    0 2px 2px rgba(0, 0, 0, 0.96),
    0 0 7px rgba(255, 232, 168, 0.94),
    0 0 18px rgba(244, 164, 96, 0.72);
  -webkit-text-stroke: 0.45px rgba(48, 26, 14, 0.86);
  transform: rotate(10deg);
  transform-origin: center;
  z-index: 30;
  pointer-events: none;
}



/* Hand-drawn block X: two thick ink-brush strokes, each with its own slight
   wobble so the mark feels sketched rather than a hard character glyph. The
   idle animation keeps the X alive without yanking the player's eye. */
.trap-block-mark {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  z-index: 8;
  filter: drop-shadow(0 0 6px rgba(0, 0, 0, 0.8));
}
.trap-block-mark-svg {
  width: 78%;
  height: 78%;
  overflow: visible;
  animation: trap-block-breathe 1.8s ease-in-out infinite;
}
.trap-block-mark-stroke {
  fill: none;
  stroke: rgba(255, 110, 92, 0.94);
  stroke-width: 7;
  stroke-linecap: round;
  stroke-linejoin: round;
  /* Inner highlight via a paired stroke would double the markup — instead we
     stack a slight stroke filter so the line reads as inky and a little
     uneven, like brush work. */
  filter: drop-shadow(0 1px 0 rgba(20, 12, 14, 0.6));
}
.trap-block-mark-stroke-a {
  animation: trap-block-wobble-a 2.4s ease-in-out infinite;
  transform-origin: 32px 32px;
}
.trap-block-mark-stroke-b {
  stroke: rgba(255, 92, 80, 0.96);
  animation: trap-block-wobble-b 2.4s ease-in-out infinite;
  transform-origin: 32px 32px;
}
@keyframes trap-block-breathe {
  0%, 100% { transform: scale(1); opacity: 0.95; }
  50%      { transform: scale(1.04); opacity: 1; }
}
@keyframes trap-block-wobble-a {
  0%, 100% { transform: rotate(-1.2deg) translate(0, 0); }
  30%      { transform: rotate(1.4deg) translate(0.4px, -0.6px); }
  60%      { transform: rotate(-0.6deg) translate(-0.4px, 0.4px); }
}
@keyframes trap-block-wobble-b {
  0%, 100% { transform: rotate(0.8deg) translate(0, 0); }
  35%      { transform: rotate(-1.6deg) translate(-0.5px, 0.4px); }
  65%      { transform: rotate(0.4deg) translate(0.5px, -0.5px); }
}

/* Flower buff cells use a muted living-green accent that still sits inside the
   parchment/wax card language used by enemies, traps, and treasures. */
.cell.card.type-flower { border-color: rgba(124, 184, 92, 0.82); }
.cell.card.type-flower::before {
  content: '';
  position: absolute;
  left: 6px; right: 6px; top: 2px;
  height: 3px;
  border-radius: 4px;
  background: linear-gradient(90deg, transparent, rgba(120, 196, 92, 0.92) 26%, rgba(229, 180, 76, 0.84) 74%, transparent);
  z-index: 3;
  pointer-events: none;
  opacity: 0.82;
}
.cell.card.type-flower .card-overlay {
  background:
    radial-gradient(circle at 50% 38%, rgba(145, 205, 105, 0.2), rgba(42, 48, 28, 0.38) 70%),
    linear-gradient(180deg, rgba(20, 16, 28, 0.0) 38%, rgba(20, 16, 28, 0.55) 70%, rgba(10, 7, 18, 0.92) 100%);
}
.cell.card.type-flower.flower-seed .card-overlay {
  background:
    radial-gradient(circle at 50% 42%, rgba(190, 164, 96, 0.16), rgba(44, 34, 26, 0.42) 72%),
    linear-gradient(180deg, rgba(20, 16, 28, 0.0) 38%, rgba(20, 16, 28, 0.55) 70%, rgba(10, 7, 18, 0.92) 100%);
}
.flower-note { color: rgba(224, 255, 196, 0.96); }
.cell.card.is-flower-blooming .card-art {
  animation: flower-bloom-pop 0.56s cubic-bezier(.17, .84, .28, 1.25) both;
}
.cell.card.is-flower-growing {
  animation: flower-growth-shimmer 0.52s ease-out both;
}
.cell.card.is-flower-progressing {
  animation: flower-progress-glint 0.42s ease-out both;
}
.cell.card.is-flower-wilting .card-art {
  animation: flower-wilt-crumble 0.62s ease-in both;
  filter: grayscale(0.82) brightness(0.7) saturate(0.55);
}
@keyframes flower-bloom-pop {
  0% { transform: scale(0.22); filter: brightness(1.35) saturate(1.45); opacity: 0.15; }
  58% { transform: scale(1.14); filter: brightness(1.18) saturate(1.28); opacity: 1; }
  100% { transform: scale(1); filter: none; opacity: 1; }
}
@keyframes flower-growth-shimmer {
  0% { filter: brightness(1) saturate(1); box-shadow: var(--card-depth-shadow); }
  45% { filter: brightness(1.24) saturate(1.28); box-shadow: var(--card-depth-shadow), 0 0 calc(16px * var(--flower-growth-scale, 1)) rgba(164, 220, 104, 0.52); }
  100% { filter: brightness(1) saturate(1); box-shadow: var(--card-depth-shadow); }
}
@keyframes flower-progress-glint {
  0% { filter: brightness(1) saturate(1); box-shadow: var(--card-depth-shadow); }
  48% { filter: brightness(1.12) saturate(1.14); box-shadow: var(--card-depth-shadow), 0 0 12px rgba(243, 167, 43, 0.42); }
  100% { filter: brightness(1) saturate(1); box-shadow: var(--card-depth-shadow); }
}
@keyframes flower-wilt-crumble {
  0% { transform: scale(1); opacity: 1; }
  48% { transform: scale(0.9) rotate(-1deg); opacity: 0.58; }
  100% { transform: scale(1.08); opacity: 1; }
}

/* ---------- Boss rail event ----------
   보스는 5번째 카드 종류(CardType.BOSS)로 lanes의 active row에 정식 박힌다.
   공통: 카드면이 .boss-face 풀-아트 + 하단 보스바 + 좌상단 N턴 뱃지 그라마를 따른다.
   사이즈 유형(3x3 거대, 1x3, 1x1 등)은 .boss-kind-* 마커별 CSS에서 분기. */
.cell.card.type-boss {
  position: relative;
  z-index: 40;
  /* 보스 임팩트만 약간 보강 — 일반 적 카드의 빨간 톤은 그대로 유지하고 빛만 추가. */
  border-color: rgba(244, 164, 96, 0.78);
  box-shadow:
    inset 0 1px 0 rgba(255, 232, 168, 0.28),
    inset 0 -12px 22px rgba(0, 0, 0, 0.55),
    var(--card-lift-shadow-grouped, 0 4px 10px rgba(0, 0, 0, 0.55)),
    var(--card-depth-shadow, 0 14px 24px rgba(0, 0, 0, 0.45)),
    0 0 26px rgba(244, 164, 96, 0.42);
  overflow: hidden;
}
/* 보스 phase 동안 active row가 셔터 위에 노출되도록 row stacking context도 함께 올린다. */
.rail-row.dist-0:has(.cell.card.type-boss) {
  position: relative;
  z-index: 40;
}
/* ---- 사이즈 유형: boss-kind-waxArmy = 3x3 거대 적 ----
   active row의 grouped 3-cell이 .rail의 3 row를 모두 점유해 3x3 풀필드로 보인다.
   윗 두 row(dist-1, dist-2)는 보스 phase 동안 보스에 가려져야 하므로 숨긴다.
   (lanes 데이터는 그대로 보존 — 격파/시련 종료 후 자연 복원된다.) */
.rail:has(.cell.card.boss-kind-waxArmy) .rail-row.dist-0 {
  grid-row: 1 / -1;
}
.rail:has(.cell.card.boss-kind-waxArmy) .rail-row.dist-1,
.rail:has(.cell.card.boss-kind-waxArmy) .rail-row.dist-2 {
  display: none;
}

/* ---- 보스 공통 face(풀-아트 + overlay + 하단 보스바 + 좌상단 N턴 뱃지) ---- */
.boss-face {
  position: absolute;
  inset: 0;
  display: block;
  isolation: isolate;
  background: #14101c;
  border-radius: 9px;
  overflow: hidden;
}
.boss-face-art {
  position: absolute;
  inset: 0;
  z-index: 0;
  background: var(--boss-art) center 32% / cover no-repeat;
  filter: saturate(1.06) contrast(1.04);
}
.boss-face-overlay {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  background:
    linear-gradient(180deg, rgba(20, 16, 28, 0) 28%, rgba(20, 16, 28, 0.55) 62%, rgba(8, 5, 14, 0.95) 100%),
    radial-gradient(130% 60% at 50% 0%, rgba(244, 164, 96, 0.14), transparent 70%);
}
/* 좌상단 N턴 뱃지 — 폭탄/포자 frozen-badge 톤을 따라 어두운 wax 칩으로. */
.boss-face-badge {
  position: absolute;
  top: 10px;
  left: 10px;
  z-index: 3;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.18em;
  color: #ffd178;
  border: 1px solid rgba(255, 196, 120, 0.6);
  border-radius: 999px;
  background: rgba(28, 18, 12, 0.85);
  text-shadow: 0 1px 0 rgba(0, 0, 0, 0.7);
}
.boss-face-title-row {
  position: absolute;
  top: 14px;
  left: 0;
  right: 0;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  flex-wrap: wrap;
}
.boss-face-tag {
  font-size: 11px;
  letter-spacing: 0.22em;
  padding: 3px 9px;
  border-radius: 4px;
  border: 1px solid rgba(255, 196, 120, 0.7);
  color: #ffd178;
  background: rgba(48, 22, 18, 0.85);
  text-shadow: 0 1px 0 rgba(0, 0, 0, 0.7);
}
.boss-face-name {
  font-size: clamp(20px, 3.2vh, 30px);
  letter-spacing: 0.04em;
  color: #ffe1a3;
  text-shadow: 0 2px 0 rgba(0, 0, 0, 0.75), 0 0 16px rgba(244, 164, 96, 0.5);
}
/* 하단 stats: 플레이어 hp-bar + atk-stat 톤. */
.boss-face-stats {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 2;
  padding: clamp(10px, 1.4vh, 14px) clamp(14px, 2vw, 22px);
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 12px;
  align-items: center;
  color: #f7e7c8;
}
.boss-face-hpbar {
  position: relative;
  height: clamp(18px, 2.4vh, 24px);
  border-radius: 999px;
  border: 1px solid rgba(168, 58, 58, 0.78);
  background: rgba(0, 0, 0, 0.55);
  box-shadow:
    inset 0 1px 0 rgba(255, 232, 168, 0.16),
    inset 0 -6px 12px rgba(0, 0, 0, 0.55);
  overflow: hidden;
}
.boss-face-hpbar-fill {
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, #c9472a 0%, #f4a460 100%);
  box-shadow: inset 0 1px 0 rgba(255, 215, 120, 0.4);
  transition: width 0.28s cubic-bezier(0.2, 0.86, 0.28, 1);
}
.boss-face-hpbar-text {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  height: 100%;
  font-size: clamp(12px, 1.6vh, 14px);
  font-weight: 700;
  color: #fff5dc;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.9);
  font-variant-numeric: tabular-nums;
}
.boss-face-hpbar-icon { color: #ffd5c5; display: inline-flex; align-items: center; }
.boss-face-hpbar-sep { opacity: 0.55; margin: 0 2px; }
/* ATK는 일반 적 톤이지만 보스라 한 단계 큼. 아이콘/숫자 모두 키운다. */
.boss-face-atk {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 14px;
  font-weight: 700;
  border-radius: 999px;
  color: var(--color-flame);
  border: 1px solid rgba(255, 215, 120, 0.4);
  background: rgba(0, 0, 0, 0.45);
  white-space: nowrap;
}
.boss-face-atk svg { width: clamp(20px, 2.6vh, 26px); height: clamp(20px, 2.6vh, 26px); }
.boss-face-atk-value {
  font-size: clamp(18px, 2.4vh, 22px);
  font-variant-numeric: tabular-nums;
}
/* 보스 등장 시 셔터 진동을 한 비트 강화. 인트로 + 강하와 함께 묵직한 쿵 임팩트. */
.rail.is-boss-quaking {
  animation: boss-rail-impact-quake 0.62s cubic-bezier(0.32, 0.04, 0.18, 0.96);
}
@keyframes boss-rail-impact-quake {
  0%   { transform: translate(0, 0); }
  14%  { transform: translate(-3px, 2px); }
  28%  { transform: translate(4px, -2px); }
  42%  { transform: translate(-2px, 3px); }
  56%  { transform: translate(3px, 1px); }
  72%  { transform: translate(-2px, -1px); }
  100% { transform: translate(0, 0); }
}

/* 풀스크린 보스 인트로: 보스 타일이 셔터 위로 강하하기 직전, 화면 전체를
   어둡게 가린 채 좌측 일러스트 + 우측 보스 정보(이름/능력치/특수/연출)를
   보여준다. 어느 곳이나 클릭하면 닫히고 다음 비트로 이어진다. */
.boss-intro-overlay {
  position: fixed;
  inset: 0;
  z-index: 470;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: clamp(16px, 4vh, 36px);
  background: rgba(4, 2, 8, 0.92);
  cursor: pointer;
  animation: boss-intro-overlay-fade-in 0.32s ease-out both;
}
.boss-intro-overlay.is-closing {
  animation: boss-intro-overlay-fade-out 0.24s ease-in forwards;
}
@keyframes boss-intro-overlay-fade-in {
  from { opacity: 0; backdrop-filter: blur(0); }
  to   { opacity: 1; backdrop-filter: blur(2px); }
}
@keyframes boss-intro-overlay-fade-out {
  from { opacity: 1; }
  to   { opacity: 0; }
}
.boss-intro-overlay-card {
  display: grid;
  /* 프로필을 더 크게 — 왼쪽 art 컬럼을 우측 정보보다 더 넓게 가져간다. */
  grid-template-columns: minmax(320px, 46%) 1fr;
  gap: clamp(20px, 3vw, 36px);
  width: min(1080px, 94vw);
  padding: clamp(20px, 2.8vh, 32px);
  /* 테두리 제거 + 거의 순흑에 가까운 톤으로 자연스럽게 가라앉힌다. */
  border: none;
  border-radius: 18px;
  background: linear-gradient(180deg, rgba(8, 6, 12, 0.96), rgba(4, 2, 8, 0.98));
  box-shadow: 0 24px 56px rgba(0, 0, 0, 0.7);
  color: #f7e7c8;
  transform: translateY(18px) scale(0.96);
  opacity: 0;
  animation: boss-intro-overlay-card-rise 0.46s cubic-bezier(0.18, 0.86, 0.22, 1) 0.08s forwards;
}
@keyframes boss-intro-overlay-card-rise {
  from { transform: translateY(18px) scale(0.96); opacity: 0; }
  to   { transform: translateY(0) scale(1); opacity: 1; }
}
.boss-intro-overlay-art {
  aspect-ratio: 1;
  border-radius: 14px;
  /* 테두리/내부 그림자 제거 — 일러스트가 검은 배경에 자연스럽게 흡수되게 한다. */
  border: none;
  box-shadow: none;
  background-position: center;
  background-repeat: no-repeat;
  background-size: cover;
}
.boss-intro-overlay-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}
.boss-intro-overlay-kicker {
  font-size: 11px;
  letter-spacing: 0.18em;
  color: #ffb3a1;
  text-transform: uppercase;
}
.boss-intro-overlay-name {
  margin: 0;
  font-size: clamp(24px, 3.4vh, 32px);
  color: #ffe1a3;
  text-shadow: 0 2px 0 rgba(0, 0, 0, 0.7), 0 0 16px rgba(244, 164, 96, 0.42);
}
.boss-intro-overlay-stats {
  list-style: none;
  margin: 6px 0 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}
.boss-intro-overlay-stats li {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 12px;
  border: 1px solid rgba(230, 194, 129, 0.4);
  border-radius: 10px;
  background: rgba(20, 12, 26, 0.78);
}
.boss-intro-overlay-stat-label {
  font-size: 11px;
  letter-spacing: 0.14em;
  opacity: 0.74;
}
.boss-intro-overlay-stat-value {
  font-size: 18px;
  color: #ffd57a;
  font-weight: 700;
}
.boss-intro-overlay-desc {
  margin: 6px 0 0;
  line-height: 1.55;
  font-size: 13px;
  opacity: 0.88;
}
/* 보스 특징 한 줄 — 인트로 카드 안에 추가. 회색-금색 톤으로 desc와 구분. */
.boss-intro-overlay-trait {
  margin: 8px 0 0;
  padding: 8px 12px;
  font-size: 12px;
  line-height: 1.45;
  border-radius: 8px;
  background: rgba(255, 232, 168, 0.06);
  color: #f7e7c8;
  border-left: 2px solid rgba(244, 164, 96, 0.55);
}
.boss-intro-overlay-trait strong { color: #ffd178; letter-spacing: 0.04em; }

/* 인트로 hint는 카드 옆/안이 아니라 화면 하단에 회색 톤으로 깜빡인다. */
.boss-intro-overlay-hint {
  position: fixed;
  left: 50%;
  bottom: clamp(28px, 6vh, 56px);
  transform: translateX(-50%);
  font-size: 12px;
  letter-spacing: 0.32em;
  font-weight: 600;
  color: rgba(220, 220, 220, 0.78);
  text-shadow: 0 1px 0 rgba(0, 0, 0, 0.8);
  pointer-events: none;
  animation: boss-intro-hint-pulse 2.2s ease-in-out infinite;
  z-index: 1; /* host(z=470) 내부 안에 있으므로 카드보다만 살짝 앞 */
}
@keyframes boss-intro-hint-pulse {
  0%, 100% { opacity: 0.35; }
  50%      { opacity: 0.95; }
}

/* 보스 등장 시 셔터 진동을 한 비트 더 강화. 기본 quake와 결합해 더 묵직한 쿵 임팩트. */
.rail.is-boss-quaking {
  animation: boss-rail-impact-quake 0.62s cubic-bezier(0.32, 0.04, 0.18, 0.96);
}
@keyframes boss-rail-impact-quake {
  0%   { transform: translate(0, 0); }
  14%  { transform: translate(-3px, 2px); }
  28%  { transform: translate(4px, -2px); }
  42%  { transform: translate(-2px, 3px); }
  56%  { transform: translate(3px, 1px); }
  72%  { transform: translate(-2px, -1px); }
  100% { transform: translate(0, 0); }
}

.boss-rail-chest-row .boss-chest-tile {
  cursor: pointer;
  animation: boss-rail-drop 0.5s cubic-bezier(0.16, 0.86, 0.22, 1) both;
  animation-delay: var(--boss-chest-delay, 0ms);
}
.boss-chest-face {
  position: relative;
  flex: 1 1 auto;
  display: grid;
  grid-template-rows: 1fr auto;
  gap: 4px;
  padding: clamp(8px, 1.2vh, 12px);
  overflow: hidden;
  border-radius: 9px;
}
.boss-chest-art {
  background: var(--boss-chest-art) center / contain no-repeat;
  filter: drop-shadow(0 6px 14px rgba(0, 0, 0, 0.55));
  min-height: 0;
}
.boss-chest-label {
  text-align: center;
  font-size: clamp(12px, 1.4vh, 14px);
  color: #ffe1a3;
  letter-spacing: 0.04em;
  text-shadow: 0 1px 0 rgba(0, 0, 0, 0.55);
}

/* 보스 카운터 비트의 원본 dim은 일반 적용 opacity 0.38이 너무 강해
   "보스가 사라진 것처럼" 보였다. 보스 타일은 0.78로만 살짝 어두워지게 override.
   (clone은 그대로 player 쪽으로 lunge하므로 두 마리가 동시에 보이는 효과가 된다.) */
.boss-rail-tile.is-enemy-slamming-source {
  opacity: 0.78;
}

`
