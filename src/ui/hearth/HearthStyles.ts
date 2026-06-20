/**
 * 거점(촛대) 화면 전용 스타일.
 * 인게임 레일을 배경으로 재사용하므로 셸은 .rail rect에 고정되고, 칸은 실제 레일 칸
 * 문법(빈 칸=점선+해치, 활성=따뜻한 테두리+발광)을 따라 세련되게 맞춘다.
 * 커튼은 직업 선택 job-rail-curtain 그라디언트/열림 키프레임을 빌려 오로라빛으로 retint하고,
 * 모험 셔터는 상점 셔터 문법을 검은 모험용으로 변형해 로비 위로 내려온다.
 * 색은 index.html :root 토큰(--color-flame, --color-flame-warm, --color-border-soft/warm)을 공유한다.
 */
export const HEARTH_STYLES = `
#hearth-overlay {
  position: fixed;
  inset: 0;
  z-index: 140;
  pointer-events: none;
}
#hearth-overlay.is-leaving {
  opacity: 0;
  transition: opacity 0.36s ease;
}

/* 레일 rect에 고정되는 셸 — 커튼/배경/그리드/셔터를 클립한다. 레일 슬랩 톤을 공유. */
.hearth-shell {
  position: fixed;
  overflow: hidden;
  border-radius: 14px;
  pointer-events: auto;
  background: rgba(14, 10, 22, 0.62);
  border: 1px solid rgba(139, 111, 71, 0.55);
  box-shadow:
    inset 0 0 0 1px rgba(255, 215, 120, 0.05),
    inset 0 0 60px rgba(0, 0, 0, 0.5),
    0 8px 28px rgba(0, 0, 0, 0.55);
}

/* 폐저택/영지 배경. 실제 일러스트는 --hearth-bg(url)로 주입해 교체한다. */
.hearth-bg {
  position: absolute;
  inset: 0;
  z-index: 0;
  background:
    var(--hearth-bg, none),
    radial-gradient(ellipse at 50% 22%, rgba(86, 52, 104, 0.4), transparent 64%),
    radial-gradient(ellipse 80% 60% at 50% 116%, rgba(244, 164, 96, 0.16), transparent 70%),
    repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.016) 0 1px, transparent 1px 46px),
    linear-gradient(180deg, rgba(16, 11, 22, 0.95), rgba(7, 4, 12, 0.98));
  background-size: cover, auto, auto, auto, auto;
  background-position: center;
  filter: saturate(0.92);
}

/* 9칸 스테이션 그리드 — 인게임 레일 칸 느낌으로 3×3. */
.hearth-grid {
  position: absolute;
  inset: 0;
  z-index: 1;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(3, 1fr);
  gap: clamp(6px, 1vw, 12px);
  padding: clamp(10px, 1.6vw, 16px);
}

.hearth-cell {
  position: relative;
  border-radius: 10px;
  min-height: 0;
  min-width: 0;
}

/* 잠긴 칸 — 실제 .cell.empty 문법(점선 + 45° 해치)을 그대로 따르되 더 어둡고 자물쇠를 단다. */
.hearth-cell--locked {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: clamp(4px, 0.8vh, 8px);
  border: 1px dashed var(--color-border-soft, #4a3a2a);
  background:
    repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.012) 0 6px, transparent 6px 12px);
  box-shadow: inset 0 0 28px rgba(0, 0, 0, 0.55);
  color: rgba(220, 206, 184, 0.34);
  font-family: 'OkDanDan', Georgia, serif;
}
.hearth-cell__lock {
  width: clamp(16px, 2.4vh, 26px);
  height: clamp(16px, 2.4vh, 26px);
  opacity: 0.55;
  filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.6));
}
.hearth-cell__name {
  font-size: clamp(11px, 1.6vh, 16px);
  font-weight: 800;
  letter-spacing: 0.08em;
  text-shadow: 0 1px 6px rgba(0, 0, 0, 0.85);
}

/* 모험 칸 — 평소 희미, 점등(is-ignited) 시 화륵. 활성 레일 칸의 따뜻한 테두리/발광 문법. */
.hearth-cell--adventure {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  cursor: pointer;
  appearance: none;
  border: 1px solid var(--color-border-warm, #8b6f47);
  background: rgba(28, 20, 36, 0.6);
  color: rgba(255, 236, 188, 0.5);
  font-family: 'OkDanDan', Georgia, serif;
  opacity: 0.5;
  transition: opacity 0.5s ease, border-color 0.5s ease, box-shadow 0.5s ease, transform 0.18s ease;
}
.hearth-cell--adventure:hover {
  transform: translateY(-2px);
}
.hearth-cell__label {
  font-size: clamp(15px, 2.4vh, 26px);
  font-weight: 900;
  letter-spacing: 0.16em;
  text-shadow: 0 2px 12px rgba(0, 0, 0, 0.9);
}

.hearth-cell--adventure.is-ignited {
  opacity: 1;
  color: rgba(255, 240, 200, 0.98);
  border-color: var(--color-flame, #ffd778);
  box-shadow:
    inset 0 1px 0 rgba(255, 232, 168, 0.28),
    inset 0 0 30px rgba(244, 164, 96, 0.2),
    0 0 34px rgba(244, 164, 96, 0.3),
    0 0 0 1px rgba(220, 170, 70, 0.3);
  animation: hearth-ignite 0.66s cubic-bezier(0.2, 0.84, 0.3, 1) both;
}
@keyframes hearth-ignite {
  0%   { transform: scale(0.9); filter: brightness(0.5); }
  40%  { transform: scale(1.04); filter: brightness(1.6);
         box-shadow: 0 0 60px rgba(255, 200, 110, 0.6), inset 0 0 40px rgba(255, 200, 110, 0.4); }
  100% { transform: scale(1); filter: brightness(1); }
}

/* 촛불 — 점등 시 일렁인다. */
.hearth-flame {
  width: clamp(20px, 3vh, 34px);
  height: clamp(28px, 4.4vh, 50px);
  border-radius: 50% 50% 50% 50% / 62% 62% 40% 40%;
  background: radial-gradient(ellipse at 50% 72%, #fff3c4 0%, #ffcc63 36%, #f08a2e 66%, rgba(180, 60, 20, 0.2) 100%);
  filter: drop-shadow(0 0 12px rgba(244, 164, 96, 0.7));
  opacity: 0;
  transform: scale(0.4) translateY(6px);
  transition: opacity 0.5s ease, transform 0.5s ease;
}
.hearth-cell--adventure.is-ignited .hearth-flame {
  opacity: 1;
  transform: scale(1) translateY(0);
  animation: hearth-flame-flicker 1.9s ease-in-out infinite;
}
@keyframes hearth-flame-flicker {
  0%, 100% { transform: scale(1) translateY(0) skewX(0deg);
             filter: drop-shadow(0 0 12px rgba(244, 164, 96, 0.7)) brightness(1); }
  35% { transform: scale(1.06, 0.96) translateY(-1px) skewX(2deg);
        filter: drop-shadow(0 0 18px rgba(255, 200, 110, 0.85)) brightness(1.15); }
  68% { transform: scale(0.96, 1.05) translateY(1px) skewX(-2deg);
        filter: drop-shadow(0 0 10px rgba(244, 164, 96, 0.6)) brightness(0.92); }
}

/* ── 오로라 커튼 ─────────────────────────────────────────────────────
   job-rail-curtain(그라디언트 + 열림 키프레임)을 재사용한다.
   자동 close-in 애니메이션만 제거해 '닫힌 채로 시작'하고, is-opening에서
   거대한 문을 열듯 좌우로 갈라진다. hue-rotate로 칙칙한 오로라빛을 입힌다. */
#hearth-overlay .hearth-curtain {
  z-index: 5;
  animation: none !important;
  filter: saturate(0.8) hue-rotate(135deg) brightness(0.66);
}
#hearth-overlay .hearth-curtain::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(120% 60% at 50% 30%, rgba(120, 210, 200, 0.16), transparent 60%);
  mix-blend-mode: screen;
  animation: hearth-aurora 3.6s ease-in-out infinite;
}
@keyframes hearth-aurora {
  0%, 100% { opacity: 0.35; transform: translateY(-4%); }
  50%      { opacity: 0.7;  transform: translateY(4%); }
}
#hearth-overlay.is-opening .job-rail-curtain--left.hearth-curtain {
  animation: job-curtain-open-left 0.94s cubic-bezier(0.18, 0.82, 0.25, 1) forwards !important;
}
#hearth-overlay.is-opening .job-rail-curtain--right.hearth-curtain {
  animation: job-curtain-open-right 0.94s cubic-bezier(0.18, 0.82, 0.25, 1) forwards !important;
}

/* ── 검은 모험 셔터 ───────────────────────────────────────────────────
   상점 셔터 문법을 변형 — 로비 위로 위에서 내려온다. 본체는 검은 슬랩(가로 슬랫
   질감), 하단 중앙 칸(모험 자리)에 '출발' 버튼이 들어간다. */
.hearth-shutter {
  position: absolute;
  inset: 0;
  z-index: 6;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(3, 1fr);
  background:
    repeating-linear-gradient(180deg, rgba(255, 255, 255, 0.022) 0 1px, transparent 1px 26px),
    linear-gradient(180deg, #0b0910 0%, #060409 100%);
  border-bottom: 2px solid rgba(255, 215, 120, 0.16);
  box-shadow:
    inset 0 -40px 70px rgba(0, 0, 0, 0.6),
    0 18px 40px rgba(0, 0, 0, 0.7);
  transform: translateY(-101%);
  transition: transform 0.66s cubic-bezier(0.22, 0.61, 0.36, 1);
  pointer-events: none;
}
#hearth-overlay.is-shuttering .hearth-shutter {
  transform: translateY(0);
  pointer-events: auto;
}

/* 출발 버튼 — 셔터 그리드의 하단 중앙(모험 자리). 셔터가 다 내려온 뒤 드러난다. */
.hearth-depart {
  grid-column: 2;
  grid-row: 3;
  align-self: center;
  justify-self: center;
  padding: clamp(10px, 1.7vh, 16px) clamp(22px, 3vw, 42px);
  border-radius: 999px;
  border: 1px solid rgba(255, 222, 140, 0.7);
  background: linear-gradient(180deg, var(--color-flame, #ffd778), var(--color-flame-warm, #f4a460));
  color: #2a1b14;
  font: 900 clamp(16px, 2.3vh, 23px)/1 'OkDanDan', Georgia, serif;
  letter-spacing: 0.14em;
  cursor: pointer;
  opacity: 0;
  transform: translateY(10px) scale(0.94);
  box-shadow: 0 10px 26px rgba(244, 164, 96, 0.4), 0 0 0 1px rgba(220, 170, 70, 0.3);
  transition: opacity 0.32s ease, transform 0.32s ease, box-shadow 0.18s ease;
  pointer-events: none;
}
#hearth-overlay.is-shutter-rest .hearth-depart {
  opacity: 1;
  transform: translateY(0) scale(1);
  pointer-events: auto;
}
.hearth-depart:hover {
  transform: translateY(-2px) scale(1.04);
  box-shadow: 0 14px 32px rgba(244, 164, 96, 0.52);
}
.hearth-depart.is-pressed {
  transform: scale(0.96);
  filter: brightness(1.1);
}

/* ── /시작 검은 화면 페이드인 ───────────────────────────────────────────
   타이틀 직후 게임 진입처럼 검은 화면에서 천천히 떠오른다. 전체 화면을 덮고
   페이드아웃되며 닫힌 커튼의 거점을 드러낸 뒤 제거된다. */
#hearth-fade {
  position: fixed;
  inset: 0;
  z-index: 250;
  background: #000;
  opacity: 1;
  pointer-events: none;
  transition: opacity 0.85s ease;
}
#hearth-fade.is-out {
  opacity: 0;
}

/* ── 거점 동안 런 전용 패널 숨김 + 출발 시 슬라이드 전환 ─────────────────
   아직 캐릭터를 고르지 않았으므로 보드 레이어는 살려두되 런 UI만 끈다.
   전환이 재생되도록 transition은 클래스 밖(상시)에 두고, hearth-lobby가 off-state만
   준다. startGame이 로비 상태로 렌더 후 다음 프레임에 클래스를 떼면 슬라이드 인.
   화폐(.coin-panel-total)는 끄지 않아 거점↔런 공유 앵커로 남는다. */
.ember-hud,
.left-panel .turn-brand,
.left-panel .score-panel-total,
.hand-column {
  transition: transform 0.52s cubic-bezier(0.2, 0.8, 0.3, 1), opacity 0.42s ease;
}
/* 플레이어 카드는 슬라이드 없이 그냥 비운다(캐릭터 미선택). */
body.hearth-lobby .player-zone {
  visibility: hidden;
}
/* 불씨 게이지: 상단 밖으로 올려 숨김 → 출발 시 위에서 내려온다(translateX(-50%) 유지). */
body.hearth-lobby .ember-hud {
  transform: translate(-50%, -180%);
  opacity: 0;
  pointer-events: none;
}
/* 좌측 런 UI(턴/불빛)는 왼쪽 밖으로, 화폐만 남긴다. */
body.hearth-lobby .left-panel .turn-brand,
body.hearth-lobby .left-panel .score-panel-total {
  transform: translateX(-135%);
  opacity: 0;
  pointer-events: none;
}
/* 로그는 거점에서 흐름에서 제거(display)해 그 자리에 퀘스트 딱지가 정확히 들어오게 한다. */
body.hearth-lobby .left-panel .score-log-list {
  display: none;
}
/* 우측 손패/콤보게이지/확률은 오른쪽 밖으로(이 자리에 인스펙터가 들어갈 예정). */
body.hearth-lobby .hand-column {
  transform: translateX(135%);
  opacity: 0;
  pointer-events: none;
}
`
