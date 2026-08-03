/**
 * Base shell, left HUD, score panel, and stage scaffolding for the game board.
 * Split from GameBoardRenderer so renderer logic stays navigable.
 */
export const GAME_BOARD_BASE_STYLES = `

/* 우측 하단 버전 배지 — 무대 안쪽 모서리에 조용히 붙어 어떤 빌드인지 알려 준다.
   클릭을 먹지 않고, 오버레이(70~) 아래에 두어 연출을 가리지 않는다. */
.version-badge {
  position: absolute;
  right: 10px;
  bottom: 6px;
  z-index: 60;
  padding: 3px 8px;
  border-radius: 8px;
  background: rgba(10, 8, 14, 0.42);
  border: 1px solid rgba(139, 111, 71, 0.28);
  color: rgba(243, 227, 194, 0.42);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.05em;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  pointer-events: none;
  user-select: none;
}

.icon {
  width: 1em;
  height: 1em;
  display: inline-block;
  vertical-align: -0.14em;
  flex-shrink: 0;
  color: currentColor;
}

.game-shell {
  /* 높이는 뷰포트가 아니라 비율이 고정된 #app을 따른다 — 잘라 낸 무대 밖으로 새지 않게. */
  width: 100%;
  height: 100%;
  max-height: 100%;
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
/*
 * ★ 열 배치는 grid가 아니라 flex다. 'grid-template-rows: auto auto 1fr'이던 시절,
 * 새싹 병아리처럼 화폐 패널이 숨겨지는 런('meta-currency-locked' → display: none)에서는
 * 남은 두 칸이 auto·auto 행으로 밀려 **1fr 행이 비었다**. 로그 목록은 자식이 절대배치라
 * auto 높이가 곧 0 — 로그창이 통째로 안 보였다. flex면 형제가 몇이든 남는 높이가
 * 로그로 간다.
 */
.score-panel {
  display: flex;
  flex-direction: column;
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
  /* 수치 칸은 내용 높이를 지킨다 — 줄어들면 큰 숫자가 잘린다. */
  flex: 0 0 auto;
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

/* 기록 패널은 **판이 아니라 빈 자리**다 — 테두리·배경·그림자 없이 로그 줄만 쌓인다.
   행 자체가 좌측 광원으로 범위를 말하므로 감싸는 상자가 있으면 톤이 두 번 겹친다. */
.score-log-list {
  position: relative;
  display: grid;
  grid-template-rows: minmax(0, 1fr);
  min-height: 0;
  overflow: hidden;
  border: 0;
  background: none;
  box-shadow: none;
}
/* 런 수명주기 게이트가 로비 교차 애니메이션의 잔류 클래스보다 우선한다.
   덕분에 첫 부팅 새싹 직행에서도 기록 패널이 화면 밖에 머물지 않는다. */
body.game-run-active .score-panel .left-swap > .score-log-list {
  transform: translateX(0);
  opacity: 1;
  pointer-events: auto;
}
/* 같은 슬롯의 로비 의뢰는 런 게이트가 열린 즉시 퇴장시켜 두 패널이 겹치지 않게 한다. */
body.game-run-active .score-panel .left-swap > .quest-list {
  transform: translateX(-140%);
  opacity: 0;
  pointer-events: none;
}
.score-log-scroll {
  display: flex;
  flex-direction: column;
  gap: 7px;
  min-height: 0;
  overflow-y: auto;
  /* 스크롤 손잡이를 패널 바깥쪽(왼쪽)에 두되 행의 읽기 방향은 아래에서 복구한다. */
  direction: rtl;
  padding: 2px 8px 10px 10px;
  scrollbar-width: thin;
  /* 트랙도 비운다 — 세로 막대가 남으면 걷어 낸 패널 테두리가 그 자리에 다시 생긴다. */
  scrollbar-color: rgba(244, 164, 96, 0.7) transparent;
}
.score-log-scroll > * {
  /* Reset content direction so log rows still flow left-to-right. */
  direction: ltr;
}
.score-log-scroll::-webkit-scrollbar {
  width: 4px;
}
.score-log-scroll::-webkit-scrollbar-track {
  background: transparent;
}
.score-log-scroll::-webkit-scrollbar-thumb {
  background: linear-gradient(180deg, var(--color-flame), var(--color-flame-deep));
  border-radius: 999px;
  box-shadow: 0 0 6px rgba(244, 164, 96, 0.4);
}
.score-log-scroll::-webkit-scrollbar-thumb:hover {
  background: linear-gradient(180deg, var(--color-flame), var(--color-flame-warm));
}

/*
 * 로그 한 줄 — **테두리 없는 투명 레이어**다. 판을 그리지 않고 좌측 광원이 오른쪽으로
 * 사그라들며 행의 범위를 알린다. 딱딱한 테두리·막대는 '선택된 UI'로 읽혀 배경의
 * 촛불 톤을 끊는다(UI 규칙: 강조는 발광으로 낸다).
 * 종류별 색은 --log-hue 하나로 갈린다 — 새 종류는 그 변수 한 줄만 더하면 된다.
 */
.score-log {
  position: relative;
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
  align-items: center;
  min-height: 36px;
  padding: 8px 10px 8px 14px;
  border: 0;
  border-radius: 10px;
  /* 좌 → 우로 사그라드는 호박빛 반투명 판. 오른쪽 끝은 완전히 투명하다. */
  background: linear-gradient(
    90deg,
    rgba(255, 206, 128, 0.115) 0%,
    rgba(255, 194, 110, 0.062) 38%,
    rgba(255, 186, 96, 0.016) 74%,
    rgba(255, 186, 96, 0) 100%
  );
  box-shadow: none;
  --log-hue: rgba(255, 196, 110, 1);
}
/* 좌측 색 라벨 — 막대가 아니라 **번지는 광원**이다. blur로 경계를 지워 빛으로만 남긴다. */
.score-log::before {
  content: '';
  position: absolute;
  left: 0;
  top: 5px;
  bottom: 5px;
  width: 44%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--log-hue) 0%, transparent 100%);
  filter: blur(6px);
  opacity: 0.34;
  pointer-events: none;
}
/* 광원의 심지 — 왼쪽 끝의 가는 빛줄기. 테두리가 아니라 빛이라 번져서 끝난다. */
.score-log::after {
  content: '';
  position: absolute;
  left: 0;
  top: 7px;
  bottom: 7px;
  width: 2px;
  border-radius: 999px;
  background: var(--log-hue);
  opacity: 0.82;
  filter: blur(0.4px) drop-shadow(0 0 5px var(--log-hue)) drop-shadow(0 0 11px var(--log-hue));
  pointer-events: none;
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
  padding: 3px 6px;
  border-radius: 999px;
  background: rgba(7, 5, 12, 0.38);
}

/* 종류별 좌측 광원 색 — 값 하나만 갈아 끼운다. */
.score-log-enemy { --log-hue: rgba(226, 96, 84, 1); }
.score-log-treasure { --log-hue: rgba(240, 197, 96, 1); }
.score-log-trap { --log-hue: rgba(162, 118, 220, 1); }
.score-log-item { --log-hue: rgba(255, 186, 110, 1); }
.score-log-item-gain { --log-hue: rgba(122, 224, 174, 1); }
.score-log-score { --log-hue: rgba(255, 219, 132, 1); }
.score-log-notice { --log-hue: rgba(160, 192, 232, 1); }
.score-log-win { --log-hue: rgba(122, 224, 174, 1); }
.score-log-hurt { --log-hue: rgba(232, 98, 90, 1); }
.score-log-item-gain .score-log-delta { color: #bff6d9; }
.score-log-notice .score-log-delta { color: #cbdaf0; }
.score-log-win .score-log-delta { color: #bff6d9; }
.score-log-hurt .score-log-delta { color: #ffd5c5; }

/* 빈 상태도 테두리 없이 — 점선 상자는 로그 줄보다 눈에 띄어 '없음'이 강조돼 보였다. */
.score-log-empty {
  margin: auto 0;
  padding: 20px 10px;
  color: var(--color-text-muted);
  border: 0;
  border-radius: 10px;
  background: linear-gradient(90deg, rgba(255, 206, 128, 0.05) 0%, rgba(255, 186, 96, 0) 82%);
  text-align: center;
  font-size: 12px;
}

/* (legacy stage-header / stage-main rules removed — title now lives in
   .brand inside .left-panel and Turn is rendered as a fixed top overlay) */



/* 에나의 설명 대상 공용 포커스 — 필드·손패·유물 모두 같은 촛불빛 어휘를 쓴다.
   별도 자식 레이어가 바깥으로 커지며 사라져 기존 카드 transform 애니메이션을 덮지 않는다.
   주기 길이·반복 수·시작 지연은 GameBoardRenderer가 인라인 변수로 넣는다(단일 출처는 TS). */
.ena-hint-pulse {
  position: absolute;
  inset: -4px;
  z-index: 95;
  pointer-events: none;
  border: 2px solid rgba(255, 221, 132, 0.96);
  border-radius: inherit;
  box-shadow:
    0 0 8px rgba(255, 213, 112, 0.92),
    0 0 22px rgba(244, 164, 96, 0.68),
    inset 0 0 10px rgba(255, 238, 184, 0.28);
  animation: ena-hint-focus-pulse var(--ena-hint-cycle, 760ms) cubic-bezier(0.2, 0.72, 0.25, 1)
    var(--ena-hint-repeat, 3) both;
}

/* 한 주기가 완전히 꺼진 뒤 다음 주기가 켜져야 '몇 번 깜빡였는지'가 세어진다 —
   여운을 길게 끌면 세 번이 한 번의 긴 발광으로 뭉친다. */
@keyframes ena-hint-focus-pulse {
  0% { opacity: 0; transform: scale(0.96); filter: brightness(1.6); }
  16% { opacity: 1; transform: scale(1); filter: brightness(1.3); }
  52% { opacity: 0.72; transform: scale(1.03); filter: brightness(1.08); }
  78% { opacity: 0; transform: scale(1.075); filter: brightness(1); }
  100% { opacity: 0; transform: scale(0.96); filter: brightness(1.6); }
}

@media (prefers-reduced-motion: reduce) {
  .ena-hint-pulse { animation-duration: 0.01ms; animation-iteration-count: 1; }
}
`
