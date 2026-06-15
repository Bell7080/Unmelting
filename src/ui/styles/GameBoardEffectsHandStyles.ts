/**
 * Shared animation effects, ember HUD, vignette, hand stack, and candle gauge styling.
 * Split from GameBoardRenderer so renderer logic stays navigable.
 */
export const GAME_BOARD_EFFECTS_HAND_STYLES = `
/* ---------- Animation Effects ---------- */
@keyframes score-slot-pop {
  0%   { transform: translateY(0) scale(1); filter: brightness(1); }
  18%  { transform: translateY(-5px) scale(1.18, 0.86); filter: brightness(1.6) saturate(1.3); }
  42%  { transform: translateY(3px) scale(0.94, 1.1); filter: brightness(1.3); }
  68%  { transform: translateY(-2px) scale(1.06); filter: brightness(1.18); }
  100% { transform: translateY(0) scale(1); filter: brightness(1); }
}

@keyframes score-sparks {
  0%   { opacity: 0; transform: translate(0, 6px) scale(0.6) rotate(0deg); }
  30%  { opacity: 1; transform: translate(8px, -6px) scale(1.1) rotate(8deg); }
  100% { opacity: 0; transform: translate(22px, -24px) scale(1.35) rotate(18deg); }
}

@keyframes score-sparks-mirror {
  0%   { opacity: 0; transform: translate(0, -4px) scale(0.55) rotate(0deg); }
  35%  { opacity: 1; transform: translate(-8px, 4px) scale(1.05) rotate(-10deg); }
  100% { opacity: 0; transform: translate(-22px, 20px) scale(1.3) rotate(-20deg); }
}

/* Damage vignette intentionally removed — see SquareBurst.ts for the
   replacement. The unified effect system uses scattering solid squares so
   the visual stays compatible with the ember-driven brightness pass. */

@keyframes card-enter-soft {
  from {
    opacity: 0;
    transform: translateY(-18px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes player-strike-pop {
  0%, 100% {
    transform: translateY(0) scale(1);
    filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.5));
  }
  38% {
    transform: translateY(-18px) scale(1.05);
    filter: drop-shadow(0 12px 18px rgba(255, 215, 120, 0.45));
  }
  68% {
    transform: translateY(4px) scale(0.98);
  }
}

@keyframes enemy-down-slam {
  0%, 100% {
    transform: translateY(0) scale(1);
    filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.5));
  }
  42% {
    transform: translateY(34px) scale(1.04, 0.96);
    filter: drop-shadow(0 18px 22px rgba(168, 58, 58, 0.7));
  }
  66% {
    transform: translateY(9px) scale(0.99, 1.02);
  }
}

@keyframes treasure-dust-fade {
  0% {
    opacity: 1;
    transform: translate(0, 0) rotate(0deg) scale(1);
    filter: blur(0) saturate(1);
  }
  24% {
    opacity: 0.92;
    transform: translate(-2px, 1px) rotate(-0.8deg) scale(1.01);
  }
  46% {
    opacity: 0.72;
    transform: translate(2px, -1px) rotate(0.8deg) scale(0.99);
  }
  100% {
    opacity: 0;
    transform: translate(0, 10px) rotate(0deg) scale(0.92);
    filter: blur(1px) saturate(0.75);
  }
}

@keyframes group-squish {
  0%, 100% { transform: scale(1); }
  35% { transform: scale(1.06, 0.94); }
  62% { transform: scale(0.98, 1.05); }
}

.cell.card.is-entering {
  animation: card-enter-soft 0.34s cubic-bezier(0.2, 0.86, 0.28, 1);
}

.cell.card.is-player-striking {
  animation: player-strike-pop 0.36s cubic-bezier(0.2, 0.9, 0.25, 1);
  z-index: 5;
}

.cell.card.is-enemy-slamming {
  animation: enemy-down-slam 0.42s cubic-bezier(0.24, 0.92, 0.28, 1);
  z-index: 5;
}

.cell.card.is-enemy-slamming-source {
  /* The body-mounted clone performs the unclipped lunge; dim the in-rail
     source slightly so the player follows the charging copy. */
  opacity: 0.38;
}

.enemy-attack-clone {
  box-sizing: border-box;
}

.cell.card.is-treasure-vanishing {
  pointer-events: none;
  animation: treasure-dust-fade 0.52s ease-out forwards;
  z-index: 6;
}

/* Treasure vanish keeps only the card fade here; the actual particulate
   state-change feedback is supplied by SquareBurst in animateTreasureChanges. */
.cell.card.is-newly-grouped {
  animation: group-squish 0.3s cubic-bezier(0.18, 0.9, 0.18, 1);
  z-index: 4;
}

/* Eaten / consumed card — used when a trap/treasure (or any hand-ability
   removal) leaves the board. The card briefly puffs outward and fades so
   the moment of "먹는" reads, instead of the card just disappearing. */
.cell.card.is-consuming {
  pointer-events: none;
  animation: card-consume 0.48s cubic-bezier(0.2, 0.78, 0.32, 1) forwards;
  z-index: 7;
}

/* Defeated enemies collapse inward like their candle body is snuffed, which
   distinguishes kills from treasure/trap puffs that expand outward. */
.cell.card.is-enemy-defeated-consuming {
  pointer-events: none;
  animation: enemy-defeat-shrink 0.56s cubic-bezier(0.18, 0.86, 0.22, 1) forwards;
  transform-origin: center bottom;
  z-index: 8;
}
@keyframes enemy-defeat-shrink {
  0% {
    transform: translateY(0) scale(1);
    opacity: 1;
    filter: brightness(1) saturate(1);
  }
  42% {
    transform: translateY(5px) scale(0.86, 1.08);
    opacity: 0.9;
    filter: brightness(1.45) saturate(1.22);
  }
  72% {
    transform: translateY(10px) scale(0.62, 0.7);
    opacity: 0.62;
    filter: brightness(1.1) saturate(0.82);
  }
  100% {
    transform: translateY(18px) scale(0.18, 0.12);
    opacity: 0;
    filter: brightness(0.65) saturate(0.45) blur(0.6px);
  }
}
@keyframes card-consume {
  0% {
    transform: scale(1);
    opacity: 1;
    filter: brightness(1) saturate(1);
  }
  35% {
    transform: scale(1.18);
    opacity: 0.95;
    filter: brightness(1.35) saturate(1.15);
  }
  100% {
    transform: scale(1.42);
    opacity: 0;
    filter: brightness(1.1) saturate(1);
  }
}

/* ---------- Ember HUD (center, below the turn label) ----------
   Visual stays the new "brightness lantern" design (no boxed panel, just
   a glowing horizontal light pipe). The TURN counter moved into the
   left-panel header so the ember pipe can sit higher / closer to the
   top edge for clear separation. */
.ember-hud {
  position: fixed;
  top: clamp(14px, 1.6vh, 22px);
  left: 50%;
  transform: translateX(-50%);
  z-index: 35;
  width: min(560px, 80vw);
  pointer-events: none;
}

/* ────────────────── 선공(적 우선 공격) 딱지 ──────────────────
   선공 활성 동안 적/특수적/보스 소환적 카드 우상단에 붙는 작은 불씨 라벨.
   불씨 게이지가 차서 선공이 풀리면 다음 렌더에서 조건이 거짓이 되어 사라진다. */
.first-strike-card-badge {
  position: absolute;
  top: 5px;
  right: 5px;
  z-index: 8;
  padding: 1px 6px;
  border-radius: 999px;
  pointer-events: none;
  font-family: 'OkDanDan', Georgia, serif;
  font-weight: 900;
  font-size: 10px;
  letter-spacing: 0.04em;
  color: #fff3d6;
  border: 1px solid rgba(255, 138, 60, 0.85);
  background: linear-gradient(180deg, rgba(110, 30, 12, 0.96), rgba(58, 13, 7, 0.97));
  box-shadow:
    0 1px 4px rgba(0, 0, 0, 0.6),
    0 0 10px rgba(255, 110, 40, 0.45);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.9), 0 0 8px rgba(255, 140, 50, 0.5);
}
.ember-hud-inner {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 0;
  background: none;
  border: 0;
  box-shadow: none;
}
.ember-line {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 10px;
  align-items: center;
}
.ember-icon {
  display: inline-flex;
  align-items: center;
  color: var(--color-flame);
  font-size: 18px;
  filter: drop-shadow(0 0 8px rgba(255, 215, 120, 0.7));
}
.ember-bar {
  position: relative;
  height: 10px;
  border-radius: 999px;
  overflow: visible;
  background: rgba(20, 16, 28, 0.42);
  border: 0;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.32);
}
.ember-bar::after {
  /* Subtle inner highlight so the rail reads as a tube of light without a
     hard outline. */
  content: '';
  position: absolute;
  inset: 1px 1px auto 1px;
  height: 2px;
  border-radius: 999px;
  background: linear-gradient(90deg, transparent, rgba(255, 232, 168, 0.18), transparent);
  pointer-events: none;
}
.ember-bar-fill {
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: 999px;
  transition: width 0.4s ease, box-shadow 0.4s ease;
}
.ember-bar-fill.ember-tier-bright {
  background: linear-gradient(90deg, #fff3c2, #ffd778 35%, #f4a460);
  box-shadow:
    0 0 14px rgba(255, 232, 168, 0.85),
    0 0 28px rgba(244, 164, 96, 0.55),
    0 0 52px rgba(244, 164, 96, 0.32);
}
.ember-bar-fill.ember-tier-dim {
  background: linear-gradient(90deg, #ffd778, #f4a460 50%, #c97640);
  box-shadow:
    0 0 10px rgba(244, 164, 96, 0.6),
    0 0 22px rgba(244, 164, 96, 0.32);
}
.ember-bar-fill.ember-tier-flickering {
  background: linear-gradient(90deg, #f4a460, #c97640 55%, #7a2a22);
  box-shadow:
    0 0 8px rgba(168, 58, 58, 0.55),
    0 0 18px rgba(168, 58, 58, 0.3);
  animation: ember-flicker 1.6s ease-in-out infinite;
}
.ember-bar-fill.ember-tier-extinguished {
  background: linear-gradient(90deg, #5a2828, #2d1818);
  box-shadow: 0 0 6px rgba(72, 22, 22, 0.6);
  animation: ember-flicker 0.8s ease-in-out infinite;
}
@keyframes ember-flicker {
  0%, 100% { filter: brightness(1); }
  50% { filter: brightness(0.65); }
}
/* 디메리트 경계선 — dim→flickering 임계점(ember < 4)에 얇은 적색 마커 표시 */
/* 적 공격력 +1 경계 — 얇지만 또렷한 붉은빛 주황 라인. */
.ember-atk1-line {
  position: absolute;
  top: -1px;
  bottom: -1px;
  width: 1px;
  transform: translateX(-50%);
  background: rgba(255, 116, 48, 0.95);
  border-radius: 1px;
  box-shadow: 0 0 4px rgba(255, 116, 48, 0.7), 0 0 8px rgba(255, 90, 40, 0.4);
  pointer-events: none;
  z-index: 2;
}
/* 적 공격력 +2 경계 — 또렷한 붉은 라인. */
.ember-atk2-line {
  position: absolute;
  top: -2px;
  bottom: -2px;
  width: 2px;
  transform: translateX(-50%);
  background: rgba(232, 58, 46, 0.92);
  border-radius: 1px;
  box-shadow: 0 0 4px rgba(232, 58, 46, 0.65), 0 0 8px rgba(232, 58, 46, 0.35);
  pointer-events: none;
  z-index: 3;
}
.ember-bar-label {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 800;
  color: rgba(255, 245, 220, 0.96);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.9), 0 0 6px rgba(0, 0, 0, 0.6);
  letter-spacing: 0.06em;
}
.ember-countdown {
  font-size: 11px;
  color: rgba(255, 215, 120, 0.86);
  font-weight: 800;
  letter-spacing: 0.04em;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.85);
}
/* ember-weights div removed from HUD; kept hidden for any remnant references */
.ember-weights {
  display: none;
}

/* ---------- Hand column wrapper — 손패 패널 위에 스폰 패널을 띄우는 flex 컬럼 ---------- */
.hand-column {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-height: 0;
  align-self: stretch;
}
/* hand-panel은 hand-column 내부에서 남은 공간을 채운다 */
.hand-column > .hand-panel {
  flex: 1;
  min-height: 0;
}

/* ---------- Spawn Probability Panel — 레일 스폰 확률 독립 레이어 ----------
   손패 패널 위에 텍스트+% 한 줄로 노출. 황금빛(#F0C84A) 수치 강조.  */
.spawn-prob-panel {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: nowrap;
  gap: 4px;
  padding: 5px 8px;
  width: 100%;
  min-width: 0;
  background: rgba(10, 7, 18, 0.45);
  border: 1px solid rgba(200, 165, 80, 0.14);
  border-radius: 7px;
  box-sizing: border-box;
}
.spp-item {
  display: flex;
  align-items: baseline;
  gap: 3px;
  white-space: nowrap;
}
.spp-cat {
  font-size: 11px;
  font-weight: 500;
  color: rgba(210, 175, 90, 0.70);
  letter-spacing: 0.01em;
}
.spp-pct {
  font-size: 12px;
  font-weight: 700;
  color: #F0C84A;
  text-shadow: 0 0 8px rgba(240, 180, 40, 0.55);
  letter-spacing: 0.02em;
}
.spp-sep {
  font-size: 11px;
  color: rgba(200, 165, 80, 0.30);
  user-select: none;
}

/* ---------- Vignette overlay (불씨 소멸 위태로움 연출) ----------
   body 최상단에 단일 persistent 요소로 마운트되어 모든 UI 레이어를 덮는다.
   사이드 비네팅(좌우 어둠) + backdrop-filter 탈색으로 중앙 가시성은 유지하면서
   화면 전체가 서서히 회색빛으로 바래는 느낌을 준다. */
.ember-vignette {
  position: fixed;
  inset: 0;
  pointer-events: none;
  /* 모든 UI(상점/보스/오버레이) 위 */
  z-index: 9999;
  /* 좌우 사이드만 어두워짐 — 중앙 38~62%는 투명 유지 */
  background:
    linear-gradient(90deg,
      rgba(10, 5, 20, calc(0.72 * var(--vignette-opacity, 0))) 0%,
      rgba(10, 5, 20, calc(0.38 * var(--vignette-opacity, 0))) 15%,
      rgba(10, 5, 20, calc(0.06 * var(--vignette-opacity, 0))) 28%,
      transparent 38%,
      transparent 62%,
      rgba(10, 5, 20, calc(0.06 * var(--vignette-opacity, 0))) 72%,
      rgba(10, 5, 20, calc(0.38 * var(--vignette-opacity, 0))) 85%,
      rgba(10, 5, 20, calc(0.72 * var(--vignette-opacity, 0))) 100%);
  /* 전체 화면 탈색 — 불빛이 꺼질수록 색조가 빠짐 (최대 40% 탈색) */
  backdrop-filter: saturate(calc(1 - 0.4 * var(--vignette-opacity, 0)));
  -webkit-backdrop-filter: saturate(calc(1 - 0.4 * var(--vignette-opacity, 0)));
  transition: background 0.6s ease, backdrop-filter 0.6s ease;
}
/* 선공 구간(불씨 낮음): 가장자리 어둠이 촛불처럼 아주 미세하게 일렁인다. */
.ember-vignette.is-first-strike-shimmer {
  animation: ember-first-strike-shimmer 2.6s ease-in-out infinite;
}
@keyframes ember-first-strike-shimmer {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%      { opacity: 0.86; transform: scale(1.012); }
}

/* ---------- Hand stack (bottom-up, 10 fixed slots) ----------
   Layout rationale:
   - grid rows: [header, candle-gauge, stack (1fr)]
   - Targeting prompt lives on a separate body-mounted .target-banner, NOT
     in the panel — keeping it in the panel pushed the UI around when arming
     a card.
   - The stack uses justify-content:flex-end so filled slots dock to the
     BOTTOM of the column, matching the Tetris-stacking model. Empty slots
     are flattened (no height) so the bottom row of cards sits flush with
     the panel border, not floating at the column center.
   - overflow:visible on the stack so hover-pop/animation/burst don't get
     clipped against the panel wall when a card is selected.
*/
/* Hand panel — three rows: header (auto), candle gauge (auto), stack (1fr).
   스폰 확률 패널은 hand-column 래퍼 맨 위에 별도 레이어로 분리됐다. */
.hand-panel {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  gap: 8px;
  min-height: 0;
  padding: 10px;
  background:
    linear-gradient(180deg, rgba(20, 16, 28, 0.22), rgba(8, 5, 14, 0.34)),
    radial-gradient(circle at 50% 0%, rgba(255, 215, 120, 0.06), transparent 58%);
  border: 0;
  border-radius: 16px;
  box-shadow: none;
  align-self: stretch;
  overflow: visible;
}
.hand-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 700;
  color: var(--color-flame);
  letter-spacing: 0.08em;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--color-border-soft);
}
.hand-header-icon {
  display: inline-flex;
  align-items: center;
  color: var(--color-flame);
  font-size: 14px;
}
/* Linear combo gauge at the top of the hand panel. Mode wheel sits on the
   left, 10-tick meter expands to the right. The mode picker fan opens as
   a simple vertical list to the LEFT of the wheel. */
.candle-gauge {
  position: relative;
  display: grid;
  grid-template-columns: 46px 1fr;
  gap: 8px;
  align-items: stretch;
  min-height: 48px;
  padding: 6px;
  border-radius: 12px;
  overflow: visible;
  background:
    linear-gradient(180deg, rgba(255, 215, 120, 0.06), rgba(255, 255, 255, 0.02)),
    rgba(20, 16, 28, 0.32);
  border: 0;
  box-shadow: none;
}
.candle-gauge-body {
  display: grid;
  grid-template-rows: 1fr auto;
  gap: 4px;
  min-width: 0;
}
.candle-gauge-meter {
  position: relative;
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(0, 1fr);
  gap: 2px;
  padding: 3px;
  border-radius: 9px;
  background: rgba(0, 0, 0, 0.34);
  border: 1px solid rgba(255, 255, 255, 0.08);
  overflow: hidden;
}
/* 채움 게이지(이전 디자인 유지): 반투명 가로 그라데이션 fill을 tick 위(z-index 2)에 깔되,
   '채움 비율 컷 × 칸 그리드' 마스크 교집합으로 칸 안쪽에만 보이게 한다.
   아래 is-filled 칸의 세로 그라데이션과 겹쳐 이전과 같은 깊은 색감을 내고,
   gap에는 fill이 새지 않는다. drop-shadow는 마스크된 칸 모양을 따라 은은히 발광한다. */
.candle-gauge-meter::before {
  content: '';
  position: absolute;
  inset: 3px;
  z-index: 2;
  pointer-events: none;
  border-radius: 6px;
  background: linear-gradient(90deg, rgba(244, 164, 96, 0.42), rgba(255, 215, 120, 0.7));
  filter: drop-shadow(0 0 5px rgba(255, 215, 120, 0.34));
  /* 칸 1개 너비 = (내부 폭 − gap합) / 칸 수 */
  --tw: calc((100% - (var(--candle-max, 10) - 1) * 2px) / var(--candle-max, 10));
  -webkit-mask:
    linear-gradient(90deg, #000 0, #000 var(--candle-fill, 0%), transparent var(--candle-fill, 0%)),
    repeating-linear-gradient(90deg, #000 0, #000 var(--tw), transparent var(--tw), transparent calc(var(--tw) + 2px));
  -webkit-mask-composite: source-in;
  mask:
    linear-gradient(90deg, #000 0, #000 var(--candle-fill, 0%), transparent var(--candle-fill, 0%)),
    repeating-linear-gradient(90deg, #000 0, #000 var(--tw), transparent var(--tw), transparent calc(var(--tw) + 2px));
  mask-composite: intersect;
}
.candle-gauge-tick {
  position: relative;
  z-index: 1;
  min-height: 18px;
  border-radius: 5px;
  border: 1px solid rgba(255, 232, 168, 0.18);
  background: rgba(255, 255, 255, 0.045);
}
.candle-gauge-tick.is-filled {
  border-color: rgba(255, 232, 168, 0.56);
  background: linear-gradient(180deg, rgba(255, 232, 168, 0.75), rgba(244, 164, 96, 0.58));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.22);
}
.candle-gauge-label {
  position: static;
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  font-weight: 800;
  color: rgba(255, 232, 168, 0.86);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.85);
  letter-spacing: 0.02em;
}

/* Candle mode wheel: the centre button shows the active mode; on click,
   four petals (max-health/attack/ember/draw) fan out radially like a cat
   paw and snap back when one is chosen. */
.candle-mode-wheel {
  position: relative;
  width: 40px;
  min-width: 40px;
  align-self: stretch;
  display: flex;
  align-items: center;
  justify-content: center;
  /* Keep mode-list above shop/illustration overlays so it never gets clipped. */
  z-index: 120;
}
.candle-mode-btn {
  appearance: none;
  display: grid;
  grid-template-rows: 1fr auto;
  align-items: center;
  justify-items: center;
  gap: 2px;
  width: 100%;
  height: 100%;
  border: 1px solid rgba(255, 215, 120, 0.42);
  border-radius: 10px;
  color: var(--color-flame);
  background: radial-gradient(circle at 50% 0%, rgba(255, 215, 120, 0.18), rgba(0, 0, 0, 0.18));
  cursor: pointer;
  font-family: inherit;
  box-shadow: 0 0 12px rgba(255, 215, 120, 0.12);
  transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
  z-index: 2;
}
.candle-mode-btn:hover {
  border-color: rgba(255, 215, 120, 0.72);
  background: rgba(244, 164, 96, 0.16);
}
.candle-mode-wheel.is-fan-open .candle-mode-btn {
  border-color: rgba(255, 215, 120, 0.9);
  box-shadow: 0 0 18px rgba(255, 215, 120, 0.4);
  transform: scale(1.04);
}
.candle-mode-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
}
.candle-mode-label {
  color: rgba(255, 232, 168, 0.86);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.04em;
}
/* Mode picker is a sleeve of standalone buttons that unfurl one-by-one
   to the LEFT of the wheel — no back panel/box, just the floating
   buttons themselves with their own pill chrome. Each item starts
   stacked behind the wheel (hidden, slid right) and "촤라락" pops out
   with a per-item delay when the wheel is toggled. */
.candle-mode-list {
  position: absolute;
  top: 50%;
  right: calc(100% + 6px);
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 0;
  background: none;
  border: 0;
  border-radius: 0;
  box-shadow: none;
  pointer-events: none;
  /* Floating menu must stay on the very top interaction layer. */
  z-index: 130;
}
.candle-mode-wheel.is-fan-open .candle-mode-list {
  pointer-events: auto;
}

.candle-mode-list-item {
  appearance: none;
  /* Match the currently-selected mode button (.candle-mode-btn) shape —
     small square with icon stacked above label, rather than a wide
     horizontal pill. */
  width: 40px;
  height: 44px;
  display: grid;
  grid-template-rows: 1fr auto;
  align-items: center;
  justify-items: center;
  gap: 2px;
  padding: 4px 2px;
  border: 1px solid rgba(255, 215, 120, 0.42);
  border-radius: 10px;
  background: radial-gradient(circle at 50% 0%, rgba(255, 215, 120, 0.18), rgba(0, 0, 0, 0.18));
  color: var(--color-flame);
  cursor: pointer;
  font-family: inherit;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.02em;
  text-align: center;
  white-space: nowrap;
  box-shadow: 0 6px 14px rgba(0, 0, 0, 0.5);
  /* Closed: each button sits ON TOP of the wheel and is invisible. The
     "is-fan-open" state animates them out leftward via the keyframe
     below, staggered per-item with nth-child(). */
  opacity: 0;
  pointer-events: none;
  transform: translateX(36px) scale(0.7);
  transition: background 0.16s ease, border-color 0.16s ease, filter 0.16s ease;
}
.candle-mode-wheel.is-fan-open .candle-mode-list-item {
  pointer-events: auto;
  animation: candle-mode-unfurl 0.32s cubic-bezier(0.18, 0.86, 0.22, 1) forwards;
}
/* Staggered timing — first item snaps out fast, the rest follow in a
   quick chain so the open feels like cards being dealt to the left. */
.candle-mode-wheel.is-fan-open .candle-mode-list-item:nth-child(1) { animation-delay: 0ms; }
.candle-mode-wheel.is-fan-open .candle-mode-list-item:nth-child(2) { animation-delay: 55ms; }
.candle-mode-wheel.is-fan-open .candle-mode-list-item:nth-child(3) { animation-delay: 110ms; }
.candle-mode-wheel.is-fan-open .candle-mode-list-item:nth-child(4) { animation-delay: 165ms; }

@keyframes candle-mode-unfurl {
  0%   { opacity: 0; transform: translateX(36px) scale(0.7); }
  60%  { opacity: 1; transform: translateX(-3px) scale(1.04); }
  100% { opacity: 1; transform: translateX(0)    scale(1); }
}

.candle-mode-list-item:hover {
  background: radial-gradient(circle at 50% 0%, rgba(255, 215, 120, 0.36), rgba(0, 0, 0, 0.2));
  border-color: rgba(255, 232, 168, 0.86);
}
.candle-mode-list-item.is-current {
  border-color: rgba(120, 90, 60, 0.6);
  background: rgba(10, 8, 14, 0.92);
  color: rgba(255, 232, 168, 0.42);
  filter: brightness(0.78);
  cursor: default;
}
.candle-mode-list-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  color: var(--color-flame);
}
.candle-mode-list-item.is-current .candle-mode-list-icon {
  color: rgba(255, 232, 168, 0.42);
}
.candle-mode-list-label {
  font-family: inherit;
  color: rgba(255, 232, 168, 0.86);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.04em;
}
.candle-mode-list-item.is-current .candle-mode-list-label {
  color: rgba(255, 232, 168, 0.42);
}
`
