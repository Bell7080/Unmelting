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

/* 일반 레일 칸(.cell) 문법을 그대로 빌린다 — 둥근 모서리, 점선 테두리, 옅은 배경. */
.hearth-cell {
  position: relative;
  border-radius: 10px;
  border: 1px dashed var(--color-border-soft, #4a3a2a);
  background: rgba(255, 255, 255, 0.015);
  transition: transform 0.18s ease, box-shadow 0.2s ease, border-color 0.2s ease;
  min-height: 0;
  min-width: 0;
}

/* 잠긴 칸 — 실제 .cell.empty 문법(점선 + 45° 해치)을 그대로 따른다(자물쇠만 추가). */
.hearth-cell--locked {
  display: flex;
  flex-direction: column;
  align-items: center;
  /* 글자를 칸 하단 쪽으로 내린다(일러스트가 위로 더 드러나게). */
  justify-content: flex-end;
  gap: clamp(4px, 0.8vh, 8px);
  padding-bottom: clamp(8px, 1.8vh, 18px);
  border: 1px dashed var(--color-border-soft, #4a3a2a);
  background:
    repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.015) 0 6px, transparent 6px 12px);
  box-shadow: inset 0 0 22px rgba(0, 0, 0, 0.4);
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

/* 일러스트가 있는 스테이션 칸(hearth_007~009 → 무역/모험/만찬).
   --cell-art(url)을 칸 배경 최하단에 깔고 그 위에 어둠 그라데이션을 얹어
   레일 칸 톤(어둡고 따뜻)을 유지하면서 일러스트가 은은히 비치게 한다. */
.hearth-cell--has-art {
  background-image:
    linear-gradient(to bottom, rgba(8, 5, 20, 0.46) 0%, rgba(10, 6, 24, 0.82) 100%),
    var(--cell-art, none);
  background-size: cover;
  background-position: center top;
}
/* 잠긴 칸 + 일러스트: 해치 패턴을 일러스트 위에 유지하고 더 어둡게 덮는다. */
.hearth-cell--locked.hearth-cell--has-art {
  background-image:
    repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.012) 0 6px, transparent 6px 12px),
    linear-gradient(to bottom, rgba(8, 5, 20, 0.56) 0%, rgba(10, 6, 24, 0.84) 100%),
    var(--cell-art, none);
  background-size: auto, cover, cover;
  background-position: center, center top, center top;
}
/* 모험 칸 + 일러스트: 점등 전엔 어둡게, 점등(is-ignited) 시 덮개를 옅혀 일러스트를 밝힌다. */
.hearth-cell--adventure.hearth-cell--has-art {
  background-image:
    linear-gradient(to bottom, rgba(8, 5, 20, 0.5) 0%, rgba(10, 6, 24, 0.82) 100%),
    var(--cell-art, none);
  background-size: cover;
  background-position: center top;
}
.hearth-cell--adventure.hearth-cell--has-art.is-ignited {
  background-image:
    linear-gradient(to bottom, rgba(8, 5, 20, 0.28) 0%, rgba(10, 6, 24, 0.62) 100%),
    var(--cell-art, none);
}

/* 모험 칸 — 평소 희미, 점등(is-ignited) 시 화륵. 채워진 레일 칸(.cell.card) 문법을 빌린다:
   따뜻한 실선 테두리 + #1c1424 슬랩 + 상단 하이라이트/하단 그림자/리프트/깊이 그림자 스택. */
.hearth-cell--adventure {
  display: flex;
  flex-direction: column;
  align-items: center;
  /* 글자를 칸 하단 쪽으로 내린다(촛불/일러스트가 위로 더 드러나게). */
  justify-content: flex-end;
  gap: 8px;
  padding-bottom: clamp(8px, 1.8vh, 18px);
  cursor: pointer;
  appearance: none;
  border: 1px solid var(--color-border-warm, #8b6f47);
  background: #1c1424;
  color: rgba(255, 236, 188, 0.5);
  font-family: 'OkDanDan', Georgia, serif;
  isolation: isolate;
  box-shadow:
    inset 0 1px 0 rgba(255, 232, 168, 0.18),
    inset 0 -10px 18px rgba(0, 0, 0, 0.45),
    0 4px 10px rgba(0, 0, 0, 0.55),
    0 14px 24px rgba(0, 0, 0, 0.45);
  opacity: 0.5;
  transition: opacity 0.5s ease, border-color 0.5s ease, box-shadow 0.5s ease, transform 0.18s ease;
}
/* 활성 칸 hover 글로우(.cell.is-active:hover)를 따른다. */
.hearth-cell--adventure:hover {
  transform: translateY(-2px);
  border-color: var(--color-flame-warm, #f4a460);
  box-shadow:
    inset 0 1px 0 rgba(255, 232, 168, 0.28),
    inset 0 -10px 18px rgba(0, 0, 0, 0.45),
    0 4px 10px rgba(0, 0, 0, 0.55),
    0 14px 24px rgba(0, 0, 0, 0.45),
    0 0 18px rgba(244, 164, 96, 0.36);
}
.hearth-cell__label {
  font-size: clamp(15px, 2.4vh, 26px);
  font-weight: 900;
  letter-spacing: 0.16em;
  text-shadow: 0 2px 12px rgba(0, 0, 0, 0.9);
}

/* 개방(언락) 칸 — 잠긴 칸과 분명히 구분되도록 따뜻한 황금 불빛이 은은히 깃든 점등 칸.
   모험 칸의 화륵 점등보다는 가라앉되, '빛나는 부분'이 빠져 보이지 않게 상시 글로우를 둔다. */
.hearth-cell--open {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding-bottom: clamp(8px, 1.8vh, 18px);
  cursor: pointer;
  border: 1px solid var(--color-flame-warm, #f4a460);
  background: #1c1424;
  color: rgba(255, 244, 210, 0.98);
  font-family: 'OkDanDan', Georgia, serif;
  isolation: isolate;
  box-shadow:
    inset 0 1px 0 rgba(255, 232, 168, 0.3),
    inset 0 0 28px rgba(244, 164, 96, 0.14),
    inset 0 -10px 18px rgba(0, 0, 0, 0.42),
    0 4px 10px rgba(0, 0, 0, 0.5),
    0 0 22px rgba(244, 164, 96, 0.3),
    0 12px 22px rgba(0, 0, 0, 0.42);
  animation: hearth-open-breathe 3.6s ease-in-out infinite;
}
@keyframes hearth-open-breathe {
  0%, 100% { box-shadow: inset 0 1px 0 rgba(255,232,168,0.3), inset 0 0 28px rgba(244,164,96,0.12), inset 0 -10px 18px rgba(0,0,0,0.42), 0 4px 10px rgba(0,0,0,0.5), 0 0 18px rgba(244,164,96,0.24), 0 12px 22px rgba(0,0,0,0.42); }
  50%      { box-shadow: inset 0 1px 0 rgba(255,232,168,0.36), inset 0 0 32px rgba(244,164,96,0.18), inset 0 -10px 18px rgba(0,0,0,0.42), 0 4px 10px rgba(0,0,0,0.5), 0 0 30px rgba(255,184,104,0.4), 0 12px 22px rgba(0,0,0,0.42); }
}
/* hover 시엔 상시 글로우 애니메이션을 멈춰 hover 박스섀도(팝 글로우)가 그대로 적용되게 한다. */
.hearth-cell--open:hover,
.hearth-cell--open:focus-visible { animation: none; }
.hearth-cell--open.is-ignited {
  animation: hearth-open-ignite 0.72s cubic-bezier(0.2, 0.84, 0.3, 1) backwards, hearth-open-breathe 3.6s ease-in-out 0.72s infinite;
}
@keyframes hearth-open-ignite {
  0%   { transform: scale(0.92); filter: brightness(0.52) saturate(0.78); }
  42%  { transform: scale(1.04); filter: brightness(1.45) saturate(1.12); box-shadow: 0 0 54px rgba(255, 200, 110, 0.54), inset 0 0 38px rgba(255, 200, 110, 0.32); }
  100% { transform: scale(1); filter: brightness(1) saturate(1); }
}
.hearth-cell--open.hearth-cell--has-art {
  background-image:
    linear-gradient(to bottom, rgba(8, 5, 20, 0.32) 0%, rgba(10, 6, 24, 0.64) 100%),
    var(--cell-art, none);
  background-size: cover;
  background-position: center top;
}
/* 통통 튀어나오는 hover(개방 칸 + 모험 공통) — 오버슈트 easing으로 '뽈롱'. */
.hearth-cell--open,
.hearth-cell--adventure {
  transition-property: transform, box-shadow, border-color, opacity;
  transition-duration: 0.3s, 0.22s, 0.22s, 0.5s;
  transition-timing-function: cubic-bezier(0.34, 1.56, 0.5, 1), ease, ease, ease;
}
.hearth-cell--open:hover,
.hearth-cell--open:focus-visible,
.hearth-cell--adventure:hover {
  transform: translateY(-7px) scale(1.07);
  border-color: var(--color-flame, #ffd778);
  box-shadow:
    inset 0 1px 0 rgba(255, 232, 168, 0.32),
    inset 0 -10px 18px rgba(0, 0, 0, 0.4),
    0 12px 24px rgba(0, 0, 0, 0.5),
    0 0 28px rgba(244, 164, 96, 0.52);
  outline: none;
  z-index: 3;
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
  /* fill을 backwards로 둔다. both/forwards면 끝난 점등 애니메이션이 transform:scale(1)을
     계속 고정해 hover 팝(translateY+scale)을 덮어버린다(개방 칸은 안 겪는 문제). 최종 키프레임이
     기본값(scale1/brightness1)이라 고정할 이득이 없어 hover만 되살린다. */
  animation: hearth-ignite 0.66s cubic-bezier(0.2, 0.84, 0.3, 1) backwards;
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
   거대한 문을 열듯 좌우로 갈라진다.
   대문(hearth_bg_002)은 ::before 없이 각 커튼 background-image 스택 최하단에 직접 깐다.
   왼쪽 커튼은 문의 왼쪽 절반, 오른쪽 커튼은 오른쪽 절반을 보여 열릴 때 문이 갈라진다.
   커튼 하나의 폭(~54%)에서 전체 문이 셸 폭을 채우도록 background-size 185%로 조정. */
#hearth-overlay .hearth-curtain {
  z-index: 5;
  animation: none !important;
}
#hearth-overlay .job-rail-curtain--left.hearth-curtain {
  background-image:
    linear-gradient(160deg, rgba(5, 3, 9, 0.46) 0%, rgba(2, 1, 4, 0.64) 100%),
    var(--hearth-door, none);
  background-size: auto, 185% 100%;
  background-position: center, left center;
  background-repeat: no-repeat;
}
#hearth-overlay .job-rail-curtain--right.hearth-curtain {
  background-image:
    linear-gradient(160deg, rgba(2, 1, 4, 0.64) 0%, rgba(5, 3, 9, 0.46) 100%),
    var(--hearth-door, none);
  background-size: auto, 185% 100%;
  background-position: center, right center;
  background-repeat: no-repeat;
}
#hearth-overlay .hearth-curtain::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(120% 60% at 50% 30%, rgba(120, 210, 200, 0.08), transparent 60%);
  mix-blend-mode: screen;
  animation: hearth-aurora 3.6s ease-in-out infinite;
}
@keyframes hearth-aurora {
  0%, 100% { opacity: 0.22; transform: translateY(-4%); }
  50%      { opacity: 0.42; transform: translateY(4%); }
}
#hearth-overlay.is-opening .job-rail-curtain--left.hearth-curtain {
  animation: job-curtain-open-left 1.45s cubic-bezier(0.22, 0.78, 0.28, 1) forwards !important;
}
#hearth-overlay.is-opening .job-rail-curtain--right.hearth-curtain {
  animation: job-curtain-open-right 1.45s cubic-bezier(0.22, 0.78, 0.28, 1) forwards !important;
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
  /* 더 은은하게(천천히) 떠오른다. 커튼 로직은 이 페이드가 끝난 뒤에 시작된다(HearthScene 타이밍). */
  transition: opacity 1.3s ease;
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
/* 플레이어 카드는 로비에서도 그대로 노출한다(캐릭터 미선택 상태의 기본 카드). */
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
/* 우측 손패/콤보게이지/확률은 오른쪽 밖으로(이 자리에 인스펙터가 들어간다). */
body.hearth-lobby .hand-column {
  transform: translateX(135%);
  opacity: 0;
  pointer-events: none;
}
/* 로비 배경: hearth_bg_001(ingame-backdrop)만 보이게 한다.
   body의 레일 배경(background_001)은 끄고 backdrop은 선명하게(블러 약화) 채운다.
   출발 시 backdrop을 is-out으로 페이드아웃 → 검은 화면 → body 배경 페이드인(겹치지 않음). */
body.hearth-lobby {
  background-image: none !important;
}
body.hearth-lobby #ingame-backdrop {
  opacity: 1 !important;
  filter: blur(2px) saturate(0.95) brightness(0.86) !important;
  transform: scale(1.02) !important;
  transition: opacity 0.5s ease, filter 1.6s ease, transform 1.6s ease !important;
}
/* 출발 시 backdrop 페이드아웃(검은 배경 노출) — 그 뒤 body 배경이 페이드인된다. */
body.hearth-lobby #ingame-backdrop.is-out {
  opacity: 0 !important;
}

/* ── 우측 인스펙터(정보창) ──────────────────────────────────────────────
   평소 비움(여백의 미). 인스펙터블(칸/딱지) hover 시 스르륵 떠오르고 떼면 사라진다.
   직업 카드 문법 참고: 상단 일러스트 + 하단 노란 제목/구분선/태그/설명.
   좌측 경계는 투명도 그라데이션 마스크로 흐려 자연스럽게 떠 있게 한다. */
/* 카드로 분리하지 않고 우측 전체를 쓴다. 위치/크기는 JS(alignInspector)가 레일 우측
   절반~화면 우측 끝으로 맞춘다(레일 우측을 일부 침범). 좌측 경계는 마스크로 흐려 녹인다. */
#hearth-inspector {
  position: fixed;
  z-index: 142;
  pointer-events: none;
}
/* 카드 자체는 마스크/배경 없이 클립 컨테이너 역할만 한다(텍스트는 마스크 영향 X). */
.hearth-inspector-card {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  opacity: 0;
  transform: translateY(14px);
  transition: opacity 0.28s ease, transform 0.28s cubic-bezier(0.2, 0.8, 0.3, 1);
}
#hearth-inspector.is-shown .hearth-inspector-card {
  opacity: 1;
  transform: translateY(0);
}
/* 배경 스크림(일러스트 + 어둠 그라데이션)만 좌측 페이드 마스크를 받는다.
   art와 grad를 한 부모(scrim)에서 합성 후 단일 마스크로 클립 → 이중-페이드 없음.
   좌측 페이드는 36%까지로 이전(42%)보다 살짝 덜하게 줄였다. */
.hearth-inspector-scrim {
  position: absolute;
  inset: 0;
  -webkit-mask-image: linear-gradient(90deg, transparent 0, #000 36%, #000 100%);
  mask-image: linear-gradient(90deg, transparent 0, #000 36%, #000 100%);
}
/* 일러스트 — 상단 정렬, 패널의 76%를 채운다. 최하단부는 가파른 마스크로 자연스럽게
   투명 처리해 하드 컷 라인을 없앤다. */
.hearth-inspector-art {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  height: 76%;
  background:
    radial-gradient(circle at 54% 32%, rgba(255, 232, 168, 0.12), transparent 58%),
    repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.02) 0 2px, transparent 2px 9px),
    linear-gradient(160deg, rgba(44, 30, 56, 0.95), rgba(12, 8, 18, 0.98));
  background-size: cover;
  background-position: center top;
  -webkit-mask-image: linear-gradient(180deg, #000 84%, transparent 100%);
  mask-image: linear-gradient(180deg, #000 84%, transparent 100%);
}
/* 검은 그라데이션 스크림 — 더 높은 범위(0/25/50/75/100/100)로 일찍 짙어지고, 색은
   상단의 옅은 남색에서 하단으로 갈수록 거의 완전한 어둠(near-black)으로 수렴한다. */
.hearth-inspector-grad {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    180deg,
    rgba(8, 5, 16, 0) 0%,
    rgba(7, 4, 14, 0.25) 20%,
    rgba(5, 3, 10, 0.5) 40%,
    rgba(3, 2, 6, 0.75) 60%,
    rgba(1, 1, 3, 1) 80%,
    rgba(0, 0, 1, 1) 100%
  );
}
/* 텍스트 레이어 — 하단 정렬이되 큰 하단 패딩으로 그라데이션 상단부(어둠이 막 짙어지는 곳)에
   올려 배치한다. 마스크/배경 없음(글자는 투명화 영향 X). */
/* 텍스트 블록을 패널 세로 50% 지점(그라데이션 시작선)에 앵커하고, 작은 상단 패딩으로
   중앙에서 살짝 아래(≈55%)에 제목이 오게 한다. 마스크/배경 없음(글자 또렷). */
.hearth-inspector-body {
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  bottom: 0;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  gap: clamp(6px, 1.1vh, 12px);
  padding: clamp(10px, 4vh, 44px) clamp(18px, 1.6vw, 28px) clamp(20px, 3vh, 40px) clamp(62px, 6vw, 92px);
}
.hearth-inspector-title {
  font-family: 'OkDanDan', Georgia, serif;
  font-weight: 900;
  font-size: clamp(24px, 3.4vh, 36px);
  line-height: 1.12;
  color: #ffe7a8;
  text-shadow: 0 2px 12px rgba(0, 0, 0, 0.92), 0 0 22px rgba(244, 164, 96, 0.28);
}
.hearth-inspector-divider {
  width: clamp(30px, 3vw, 54px);
  height: 2px;
  border-radius: 2px;
  background: linear-gradient(90deg, rgba(255, 215, 120, 0.8), rgba(255, 215, 120, 0.05));
}
.hearth-inspector-tags {
  font-family: 'OkDanDan', Georgia, serif;
  font-weight: 800;
  font-size: clamp(15px, 2vh, 19px);
  color: rgba(248, 206, 120, 0.96);
}
.hearth-inspector-desc {
  font-family: 'OkDanDan', Georgia, serif;
  font-size: clamp(14px, 1.8vh, 18px);
  line-height: 1.45;
  color: rgba(214, 200, 178, 0.86);
}
`
