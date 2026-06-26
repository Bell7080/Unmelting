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

/* 개방(언락) 칸 — 모험 칸과 같은 흐름으로 시작은 어둡게 잠겨 있다가
   JS가 is-ignited를 붙이는 순간부터 따뜻한 황금 불빛이 켜진다. */
.hearth-cell--open {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding-bottom: clamp(8px, 1.8vh, 18px);
  cursor: pointer;
  /* 모험 칸과 같이 어두운 테두리에서 시작해 is-ignited 시 밝아진다 */
  border: 1px solid var(--color-border-warm, #8b6f47);
  background: #1c1424;
  color: rgba(255, 236, 188, 0.5);
  font-family: 'OkDanDan', Georgia, serif;
  isolation: isolate;
  box-shadow:
    inset 0 1px 0 rgba(255, 232, 168, 0.08),
    inset 0 -10px 18px rgba(0, 0, 0, 0.46),
    0 4px 10px rgba(0, 0, 0, 0.54),
    0 12px 22px rgba(0, 0, 0, 0.44);
  opacity: 0.5;
}
@keyframes hearth-open-breathe {
  0%, 100% { box-shadow: inset 0 1px 0 rgba(255,232,168,0.3), inset 0 0 28px rgba(244,164,96,0.12), inset 0 -10px 18px rgba(0,0,0,0.42), 0 4px 10px rgba(0,0,0,0.5), 0 0 18px rgba(244,164,96,0.24), 0 12px 22px rgba(0,0,0,0.42); }
  50%      { box-shadow: inset 0 1px 0 rgba(255,232,168,0.36), inset 0 0 32px rgba(244,164,96,0.18), inset 0 -10px 18px rgba(0,0,0,0.42), 0 4px 10px rgba(0,0,0,0.5), 0 0 30px rgba(255,184,104,0.4), 0 12px 22px rgba(0,0,0,0.42); }
}
/* hover 시엔 상시 글로우 애니메이션을 멈춰 hover 박스섀도(팝 글로우)가 그대로 적용되게 한다. */
.hearth-cell--open:hover,
.hearth-cell--open:focus-visible { animation: none; }
.hearth-cell--open.is-ignited {
  color: rgba(255, 244, 210, 0.98);
  opacity: 1;
  border-color: var(--color-flame, #ffd778);
  animation: hearth-open-ignite 0.72s cubic-bezier(0.2, 0.84, 0.3, 1) backwards, hearth-open-breathe 3.6s ease-in-out 0.72s infinite;
}
@keyframes hearth-open-ignite {
  0%   { transform: scale(0.92); filter: brightness(0.52) saturate(0.78); }
  42%  { transform: scale(1.04); filter: brightness(1.45) saturate(1.12); box-shadow: 0 0 54px rgba(255, 200, 110, 0.54), inset 0 0 38px rgba(255, 200, 110, 0.32); }
  100% { transform: scale(1); filter: brightness(1) saturate(1); }
}
.hearth-cell--open.hearth-cell--has-art {
  background-image:
    linear-gradient(to bottom, rgba(8, 5, 20, 0.5) 0%, rgba(10, 6, 24, 0.82) 100%),
    var(--cell-art, none);
  background-size: cover;
  background-position: center top;
}
.hearth-cell--open.hearth-cell--has-art.is-ignited {
  background-image:
    linear-gradient(to bottom, rgba(8, 5, 20, 0.28) 0%, rgba(10, 6, 24, 0.62) 100%),
    var(--cell-art, none);
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

/* ── 모험 셔터 ─────────────────────────────────────────────────────
   셔터 자체는 hearth_bg_003을 배경으로 쓰고, 하강 완료 후 배경 흐림/어둠 →
   좌측 소개·우측 플레이어 카드·하단 커버플로우가 순차적으로 열린다. */
.hearth-shutter {
  position: absolute;
  inset: 0;
  z-index: 6;
  display: grid;
  grid-template-columns: minmax(0, 1.05fr) minmax(0, 0.95fr);
  grid-template-rows: 1fr auto;
  background:
    linear-gradient(180deg, rgba(5, 3, 10, 0.62), rgba(2, 1, 5, 0.9)),
    var(--hearth-adventure-bg, none),
    linear-gradient(180deg, #0b0910 0%, #060409 100%);
  background-size: cover;
  background-position: center;
  border-bottom: 2px solid rgba(255, 215, 120, 0.16);
  box-shadow: inset 0 -40px 70px rgba(0,0,0,0.6), 0 18px 40px rgba(0,0,0,0.7);
  transform: translateY(-101%);
  transition: transform 0.66s cubic-bezier(0.22, 0.61, 0.36, 1);
  pointer-events: none;
}
.hearth-shutter::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: rgba(4, 2, 8, 0.1);
  backdrop-filter: blur(0px);
  transition: background 0.48s ease 0.66s, backdrop-filter 0.48s ease 0.66s;
}
#hearth-overlay.is-shuttering .hearth-shutter { transform: translateY(0); pointer-events: auto; }
/* 상세 화면 veil은 배경이 죽었다는 느낌만 나도록 아주 약하게 둔다. */
#hearth-overlay.is-shutter-rest .hearth-shutter::before { background: rgba(4, 2, 8, 0.12); backdrop-filter: blur(0.35px); }
.hearth-back {
  position: absolute; left: clamp(10px, 1.6vw, 18px); bottom: clamp(10px, 1.6vh, 18px); z-index: 8;
  display: flex; align-items: center; justify-content: center;
  width: clamp(36px, 4.4vh, 50px); height: clamp(36px, 4.4vh, 50px);
  border-radius: 50%; border: 1px solid rgba(255, 222, 140, 0.34);
  background: rgba(11, 6, 18, 0.7); color: rgba(255, 232, 168, 0.9);
  backdrop-filter: blur(4px);
  opacity: 0; transform: translateX(-10px); pointer-events: none;
  transition: opacity 0.28s ease 0.78s, transform 0.28s ease 0.78s, border-color 0.18s ease, background 0.18s ease;
}
.hearth-back > svg { width: 52%; height: 52%; }
#hearth-overlay.is-shutter-rest .hearth-back { opacity: 1; transform: translateX(0); pointer-events: auto; }
.hearth-back:hover { border-color: var(--color-flame, #ffd778); background: rgba(22, 12, 32, 0.9); }
.hearth-character-stage { grid-column: 1 / 3; grid-row: 1 / 3; position: relative; overflow: hidden; pointer-events: none; }
.hearth-adventure-backdrop { position: absolute; inset: 0; background: radial-gradient(circle at 66% 42%, rgba(255,215,120,0.1), transparent 34%); }
.hearth-showcase-card {
  position: absolute; right: clamp(28px, 7vw, 96px); top: clamp(24px, 6vh, 70px); bottom: clamp(96px, 17vh, 150px);
  aspect-ratio: 3 / 4; border-radius: 14px; overflow: hidden; isolation: isolate;
  border: 1px solid var(--color-flame-warm, #f4a460); background: #14101c;
  box-shadow: inset 0 1px 0 rgba(255,232,168,0.32), inset 0 -10px 22px rgba(0,0,0,0.55), 0 34px 80px rgba(0,0,0,0.88), 0 0 46px rgba(244,164,96,0.22);
  opacity: 0; transform: translateX(18%); transition: opacity 0.42s ease 0.94s, transform 0.48s cubic-bezier(0.2,0.84,0.3,1) 0.94s;
}
#hearth-overlay.is-shutter-rest .hearth-showcase-card { opacity: 1; transform: translateX(0); }
.hearth-showcase-art { position: absolute; inset: 0; background-image: var(--character-art, none); background-size: cover; background-position: center 22%; filter: saturate(1.06) contrast(1.04); z-index: 0; }
.hearth-showcase-art.is-empty { background: linear-gradient(160deg, #4a4a4f, #202027); filter: none; }
.hearth-showcase-overlay { position: absolute; inset: 0; z-index: 1; background: linear-gradient(180deg, rgba(20,16,28,0) 32%, rgba(20,16,28,0.55) 65%, rgba(8,5,14,0.94) 100%), radial-gradient(120% 60% at 50% 0%, rgba(244,164,96,0.1), transparent 70%); }
.hearth-character-copy { position: absolute; left: clamp(34px, 7%, 74px); top: clamp(42px, 14vh, 120px); width: min(38%, 440px); z-index: 3; color: #ffe7a8; text-shadow: 0 2px 14px rgba(0,0,0,0.9); font-family: 'OkDanDan', Georgia, serif; opacity: 0; transform: translateY(12px); transition: opacity 0.36s ease 0.86s, transform 0.36s ease 0.86s; }
#hearth-overlay.is-shutter-rest .hearth-character-copy { opacity: 1; transform: translateY(0); }
.hearth-character-kicker { display: block; color: rgba(248,206,120,0.88); font-size: clamp(13px,1.8vh,17px); letter-spacing: 0.18em; margin-bottom: 8px; }
.hearth-character-copy strong { display: block; font-size: clamp(32px,6vh,64px); letter-spacing: 0.08em; }
.hearth-character-copy small { display: block; margin-top: 8px; color: rgba(225,210,188,0.86); font-size: clamp(13px,1.8vh,18px); line-height: 1.45; }
.hearth-character-strip { grid-column: 1 / 3; grid-row: 2; align-self: end; justify-self: center; position: relative; z-index: 7; width: min(96%, 900px); height: clamp(136px, 21vh, 208px); margin-bottom: clamp(10px, 1.7vh, 20px); opacity: 0; transform: translateY(18px); pointer-events: none; transition: opacity 0.34s ease 1.02s, transform 0.34s cubic-bezier(0.2,0.8,0.3,1) 1.02s; touch-action: pan-y; }
#hearth-overlay.is-shutter-rest .hearth-character-strip { opacity: 1; transform: translateY(0); pointer-events: auto; }
.hearth-character-card { position: absolute; left: 50%; top: 50%; width: clamp(132px, 17vw, 200px); height: clamp(96px, 14.5vh, 142px); padding: 7px; border-radius: 16px; border: 1px solid rgba(200,152,60,0.48); background: linear-gradient(180deg, rgba(108,62,22,0.92), rgba(32,14,6,0.97)); cursor: pointer; box-shadow: inset 0 1px 0 rgba(255,228,160,0.22), inset 0 -5px 12px rgba(0,0,0,0.58), 0 12px 28px rgba(0,0,0,0.64); transform: translate(-50%, -50%) translateX(calc(var(--slot) * clamp(112px, 15vw, 172px))) scale(var(--card-scale, 1)); filter: brightness(var(--card-brightness, 1)); opacity: var(--card-opacity, 1); transition: transform 0.42s cubic-bezier(0.2,0.84,0.3,1), filter 0.42s ease, opacity 0.42s ease, border-color 0.18s ease, box-shadow 0.18s ease; overflow: hidden; }
.hearth-character-card::before { content: ''; position: absolute; inset: 0; border-radius: inherit; pointer-events: none; background: linear-gradient(90deg, transparent 10%, rgba(255,228,160,0.2) 50%, transparent 90%); opacity: 0.38; }
.hearth-character-card.is-selected { border-color: var(--color-flame,#ffd778); box-shadow: inset 0 1px 0 rgba(255,232,168,0.34), inset 0 -5px 12px rgba(0,0,0,0.5), 0 20px 42px rgba(0,0,0,0.74), 0 0 34px rgba(244,164,96,0.4); }
.hearth-character-card:hover { border-color: var(--color-flame,#ffd778); filter: brightness(calc(var(--card-brightness, 1) * 1.08)); }
.hearth-character-thumb { position: absolute; inset: 7px; border-radius: 11px; background-image: var(--character-art, none); background-size: cover; background-position: center 24%; background-repeat: no-repeat; opacity: 0.96; overflow: hidden; box-shadow: inset 0 0 0 1px rgba(255,232,168,0.1), inset 0 -28px 34px rgba(8,5,14,0.42); }
.hearth-character-thumb.is-empty { background: radial-gradient(circle at 50% 42%, rgba(255,232,168,0.12), transparent 58%), linear-gradient(160deg, #505055, #232329); opacity: 0.86; }
.hearth-character-thumb::after { content: ''; position: absolute; inset: 0; border-radius: inherit; background: linear-gradient(180deg, rgba(255,240,200,0.08), transparent 38%, rgba(9,5,14,0.22)); pointer-events: none; }
.hearth-depart { grid-column: 1 / 3; grid-row: 2; align-self: end; justify-self: center; z-index: 9; margin-bottom: clamp(128px, 18.2vh, 178px); min-width: clamp(116px, 13vw, 164px); padding: clamp(11px,1.75vh,17px) clamp(24px,3.2vw,46px); border-radius: 16px; border: 1px solid rgba(200,152,60,0.64); background: linear-gradient(180deg, rgba(108,62,22,0.97) 0%, rgba(72,36,14,0.98) 52%, rgba(32,14,6,0.99) 100%); color: rgba(255,228,160,0.96); font: 900 clamp(16px,2.3vh,23px)/1 'OkDanDan', Georgia, serif; letter-spacing: 0.16em; cursor: pointer; opacity: 0; transform: translateY(10px) scale(0.94); text-shadow: 0 1px 3px rgba(0,0,0,0.9); box-shadow: inset 0 1px 0 rgba(255,228,160,0.24), inset 0 -4px 8px rgba(0,0,0,0.6), 0 8px 20px rgba(0,0,0,0.6), 0 0 18px rgba(220,140,40,0.22); transition: opacity 0.32s ease 1.14s, transform 0.32s ease 1.14s, box-shadow 0.18s ease, border-color 0.18s ease, filter 0.16s ease; pointer-events: none; }
.hearth-depart::before { content: ''; position: absolute; left: 14%; right: 14%; top: 0; height: 1px; background: linear-gradient(90deg, transparent, rgba(255,228,160,0.42), transparent); }
#hearth-overlay.is-shutter-rest .hearth-depart { opacity: 1; transform: translateY(0) scale(1); pointer-events: auto; }
.hearth-depart:hover { transform: translateY(-2px) scale(1.03); border-color: rgba(220,172,80,0.78); box-shadow: inset 0 1px 0 rgba(255,228,160,0.32), inset 0 -4px 8px rgba(0,0,0,0.55), 0 12px 26px rgba(0,0,0,0.68), 0 0 24px rgba(220,140,40,0.32); filter: brightness(1.08); }
.hearth-depart.is-pressed { transform: scale(0.96); filter: brightness(1.1); }
.hearth-character-orb { position: fixed; z-index: 260; width: 18px; height: 18px; border-radius: 50%; pointer-events: none; background: #fff3bd; box-shadow: 0 0 22px #ffd778, 0 0 56px rgba(244,164,96,0.72); }
.hearth-character-orb.is-flying { animation: hearth-character-orb-flight 0.6s cubic-bezier(0.18,0.78,0.22,1) forwards; }
@keyframes hearth-character-orb-flight { to { transform: translate(var(--orb-dx), var(--orb-dy)) scale(0.45); opacity: 0.82; } }
.player-card.hearth-character-installed { animation: hearth-character-installed 0.72s cubic-bezier(0.2,0.8,0.3,1); }
@keyframes hearth-character-installed { 0% { filter: brightness(1.7); transform: translateY(-3px) scale(1.03); } 100% { filter: brightness(1); transform: none; } }

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
  /* 첫 거점 방문 배경은 흐림 없이 원본 일러스트를 보여 준다. */
  filter: blur(0) saturate(0.98) brightness(0.96) !important;
  transform: scale(1) !important;
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
/* ── 모험 셔터: 캐릭터 선택 coverflow ────────────────────────────────
   직업 선택(JobSelectStyles)과 동일한 coverflow 문법을 로비 셔터 하단에 적용.
   세로 포트레이트 카드 + 좌우 화살표 + 드래그 순환. */

/* character stage override — 애니메이션 진입 */
.hearth-character-stage {
  grid-column: 1 / 4; grid-row: 1 / 4; position: relative; overflow: hidden;
  opacity: 0; transform: translateY(14px); pointer-events: none;
  transition: opacity 0.38s ease, transform 0.38s cubic-bezier(0.2, 0.8, 0.3, 1), filter 0.34s ease;
}
#hearth-overlay.is-shutter-rest .hearth-character-stage { opacity: 1; transform: translateY(0); }

/* copy text override — 위치 정밀 조정 */
.hearth-character-copy {
  position: absolute; left: 7%; right: 7%; top: 10%;
  color: #ffe7a8; text-shadow: 0 2px 14px rgba(0,0,0,0.9); font-family: 'OkDanDan', Georgia, serif;
}
.hearth-character-kicker { display: block; color: rgba(248, 206, 120, 0.88); font-size: clamp(13px, 1.8vh, 17px); letter-spacing: 0.18em; margin-bottom: 8px; }
.hearth-character-copy strong { display: block; font-size: clamp(32px, 6vh, 64px); letter-spacing: 0.08em; }
.hearth-character-copy small { display: block; max-width: 28em; margin-top: 8px; color: rgba(225, 210, 188, 0.86); font-size: clamp(13px, 1.8vh, 18px); line-height: 1.45; }

/* depart button — 모험 모드에서는 확정 전까지 숨김; is-character-confirmed가 중앙에 표시 */
.hearth-depart { margin-bottom: clamp(152px, 24vh, 200px); }
#hearth-overlay.is-adventure-mode:not(.is-character-confirmed) .hearth-depart {
  opacity: 0 !important;
  pointer-events: none !important;
  transform: translateY(10px) scale(0.94) !important;
  transition: none !important;
}

/* ── 캐릭터 캐러셀 컨테이너 ────────────────────────────────────────── */
.hearth-character-carousel {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: clamp(136px, 21vh, 172px);
  z-index: 7;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transform: translateY(18px);
  pointer-events: none;
  transition: opacity 0.32s ease 1.02s, transform 0.32s cubic-bezier(0.2, 0.8, 0.3, 1) 1.02s;
}
#hearth-overlay.is-shutter-rest .hearth-character-carousel {
  opacity: 1;
  transform: translateY(0);
  pointer-events: auto;
}

/* ── 캐러셀 스트립: coverflow 뷰포트 ──────────────────────────────── */
.hearth-character-strip {
  position: relative;
  width: 100%;
  height: 100%;
  perspective: 1600px;
  touch-action: pan-y;
  cursor: grab;
  overflow: visible;
}
.hearth-character-strip:active { cursor: grabbing; }

/* ── 가로 얇은 띠 캐릭터 카드 ──────────────────────────────────────
   height:width = 1:3 비율(매우 얇은 가로 직사각형) — 일러스트 중앙 포커싱.
   transform/opacity/filter/z-index는 JS가 인라인으로 제어한다. */
.hearth-character-card {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  height: min(70%, 104px);
  aspect-ratio: 3 / 1;
  cursor: pointer;
  padding: 0;
  border: 1px solid rgba(255, 215, 120, 0.24);
  border-radius: 16px;
  overflow: hidden;
  background: linear-gradient(180deg, rgba(22, 14, 34, 0.98) 0%, rgba(7, 4, 12, 0.99) 100%);
  box-shadow:
    inset 0 1px 0 rgba(255, 232, 168, 0.1),
    0 14px 36px rgba(0, 0, 0, 0.68),
    0 4px 12px rgba(0, 0, 0, 0.5);
  transform-style: preserve-3d;
  transition:
    transform 0.42s cubic-bezier(0.2, 0.84, 0.3, 1),
    opacity 0.42s ease,
    filter 0.42s ease,
    box-shadow 0.28s ease,
    border-color 0.28s ease;
  will-change: transform, opacity, filter;
  display: block;
  text-align: left;
}
/* 드래그 중엔 easing 없이 즉시 추적 */
.hearth-character-strip:active .hearth-character-card { transition: none; }

/* 가운데(is-selected) 카드 — 숨쉬는 발광 */
.hearth-character-card.is-selected {
  border-color: rgba(255, 222, 140, 0.62);
  box-shadow:
    inset 0 1px 0 rgba(255, 232, 168, 0.22),
    0 14px 36px rgba(0, 0, 0, 0.68),
    0 0 0 1px rgba(220, 170, 70, 0.28),
    0 0 32px rgba(244, 164, 96, 0.22);
  animation: hearth-card-breathe 2.6s ease-in-out infinite;
}
@keyframes hearth-card-breathe {
  0%, 100% {
    box-shadow:
      inset 0 1px 0 rgba(255, 232, 168, 0.18),
      0 14px 36px rgba(0, 0, 0, 0.68),
      0 0 0 1px rgba(220, 170, 70, 0.24),
      0 0 28px rgba(244, 164, 96, 0.2);
    border-color: rgba(255, 222, 140, 0.56);
  }
  50% {
    box-shadow:
      inset 0 1px 0 rgba(255, 232, 168, 0.38),
      0 18px 44px rgba(0, 0, 0, 0.74),
      0 0 0 1px rgba(220, 170, 70, 0.56),
      0 0 60px rgba(244, 164, 96, 0.52),
      0 0 90px rgba(255, 200, 100, 0.22);
    border-color: rgba(255, 222, 140, 0.96);
  }
}
/* 드래그·거부·확정 상태에서는 발광 애니메이션 정지 */
.hearth-character-strip:active .hearth-character-card.is-selected,
.hearth-character-card.is-selected.is-denied,
#hearth-overlay.is-character-confirming .hearth-character-card.is-selected,
#hearth-overlay.is-character-confirmed .hearth-character-card.is-selected { animation: none; }

.hearth-character-card.is-selected:hover:not(.is-locked) {
  border-color: rgba(255, 222, 140, 0.92);
  box-shadow:
    inset 0 1px 0 rgba(255, 232, 168, 0.3),
    0 20px 52px rgba(0, 0, 0, 0.82),
    0 0 0 1px rgba(220, 170, 70, 0.48),
    0 0 62px rgba(244, 164, 96, 0.38);
}
.hearth-character-card.is-locked { cursor: not-allowed; }
.hearth-character-card.is-denied { animation: hearth-char-deny 0.42s ease; }
@keyframes hearth-char-deny {
  0%, 100% { margin-left: 0; }
  22% { margin-left: -8px; }
  55% { margin-left: 7px; }
  82% { margin-left: -4px; }
}

/* ── 일러스트 ──────────────────────────────────────────────────────── */
.hearth-character-art {
  position: absolute;
  inset: 0;
  background-size: cover;
  background-position: center 30%;
  background-repeat: no-repeat;
}
.hearth-character-art.is-empty {
  background:
    radial-gradient(circle at 50% 38%, rgba(255, 232, 168, 0.07), transparent 62%),
    repeating-linear-gradient(135deg, rgba(255,255,255,0.016) 0 2px, transparent 2px 9px),
    linear-gradient(180deg, rgba(30, 20, 42, 0.94), rgba(9, 6, 15, 0.97));
}

/* 광택 스윕 — 선택된 카드 hover 시만 */
.hearth-character-sheen {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(115deg, transparent 36%, rgba(255, 240, 200, 0.15) 50%, transparent 64%);
  transform: translateX(-120%);
  transition: transform 0.62s ease;
}
.hearth-character-card.is-selected:hover:not(.is-locked) .hearth-character-sheen {
  transform: translateX(120%);
}

/* ── 잠금 오버레이 ──────────────────────────────────────────────────── */
.hearth-character-lock {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  z-index: 4;
  pointer-events: none;
  background: rgba(0, 0, 0, 0.66);
  color: rgba(220, 206, 184, 0.66);
}
.hearth-char-lock-icon {
  width: clamp(22px, 3.4vh, 36px);
  height: clamp(22px, 3.4vh, 36px);
  filter: drop-shadow(0 3px 8px rgba(0,0,0,0.72));
}
.hearth-character-lock span {
  display: none;
}

/* ── 하단 스크림 + 텍스트 ───────────────────────────────────────────── */
/* 얇은 가로 카드(3:1)에서는 일러스트만 노출 — 텍스트 영역 전체 숨김 */
.hearth-character-scrim {
  display: none;
}
.hearth-character-name {
  font-family: 'OkDanDan', Georgia, serif;
  font-size: clamp(12px, 1.8vh, 20px);
  font-weight: 900;
  letter-spacing: 0.06em;
  line-height: 1.12;
  color: rgba(255, 238, 196, 0.98);
  text-shadow: 0 2px 7px rgba(0,0,0,0.95), 0 0 14px rgba(244,164,96,0.16);
}
.hearth-character-divider {
  width: clamp(20px, 2vw, 36px);
  height: 1.5px;
  border-radius: 2px;
  background: linear-gradient(90deg, rgba(255, 215, 120, 0.7), rgba(255, 215, 120, 0.04));
  margin: clamp(1px, 0.3vh, 3px) 0;
}
/* role + tagline 한 줄 — job-card__traits 톤 */
.hearth-character-meta {
  display: flex;
  gap: clamp(4px, 0.6vw, 8px);
  align-items: baseline;
  white-space: nowrap;
  overflow: hidden;
}
.hearth-character-role {
  font-family: 'OkDanDan', Georgia, serif;
  font-size: clamp(9px, 1.15vh, 12px);
  color: rgba(206, 188, 160, 0.82);
  line-height: 1.4;
  white-space: nowrap;
  flex-shrink: 0;
}
/* job-card__flavor 톤 — role 뒤 중점 구분 후 설명 */
.hearth-character-tagline {
  font-family: 'OkDanDan', Georgia, serif;
  font-size: clamp(8px, 1.05vh, 10px);
  color: rgba(244, 200, 120, 0.54);
  letter-spacing: 0.05em;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
}
.hearth-character-tagline::before {
  content: '· ';
  color: rgba(255, 215, 120, 0.32);
}
/* showcase 우측 대형 카드 — 이름 아래 부제 */
.hearth-character-copy-tagline {
  display: block;
  font-style: normal;
  font-family: 'OkDanDan', Georgia, serif;
  font-size: clamp(13px, 1.8vh, 18px);
  color: rgba(248, 206, 120, 0.72);
  letter-spacing: 0.1em;
  margin-top: 4px;
}

/* ── 화살표 버튼 — 캐릭터 카드 바로 좌우에 붙는 작은 원형 버튼 ─────── */
.hearth-char-nav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px; height: 28px;
  border-radius: 50%;
  border: 1px solid rgba(255, 215, 120, 0.22);
  background: rgba(9, 5, 16, 0.72);
  color: rgba(255, 232, 168, 0.84);
  cursor: pointer;
  opacity: 0.28;
  transition: opacity 0.22s ease, background 0.18s ease, border-color 0.18s ease, transform 0.16s ease;
  backdrop-filter: blur(2px);
}
/* 카드 중심(50%)에서 카드 반폭(~90px) 만큼 안쪽에 배치 */
.hearth-char-nav--left  { left: calc(50% - clamp(100px, 13vw, 138px)); }
.hearth-char-nav--right { right: calc(50% - clamp(100px, 13vw, 138px)); }
.hearth-char-nav > svg { width: 55%; height: 55%; }
.hearth-character-carousel:hover .hearth-char-nav { opacity: 0.48; }
.hearth-char-nav:hover {
  opacity: 1 !important;
  background: rgba(22, 12, 30, 0.9);
  border-color: rgba(255, 222, 140, 0.6);
  transform: translateY(-50%) scale(1.12);
}
/* 캐릭터 선택 화살표는 모험 셔터에서만 표시 */
#hearth-overlay:not(.is-adventure-mode) .hearth-char-nav { display: none; }

/* ── 확정/확인 상태 ──────────────────────────────────────────────────── */

/* 캐러셀: 아래로 퇴장 — 진입 딜레이(1.02s)를 0으로 덮어 즉시 슬라이드아웃 */
#hearth-overlay.is-character-confirming .hearth-character-carousel {
  transform: translateY(110%);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.24s ease 0s, transform 0.32s cubic-bezier(0.3, 0.8, 0.4, 1) 0s;
}
/* 카피 텍스트: 위로 역퇴장 (아래서 들어왔으므로 반대 방향) */
#hearth-overlay.is-character-confirming .hearth-character-copy {
  transform: translateY(-14px);
  opacity: 0;
  pointer-events: none;
  transition: transform 0.26s ease 0s, opacity 0.22s ease 0s;
}
/* 쇼케이스 카드: JS WAAPI가 직접 제어 — CSS transition 해제 후 z-index 올림 */
#hearth-overlay.is-character-confirming .hearth-showcase-card {
  transition: none !important;
  z-index: 12;
}
/* 확정 후: stage/carousel 숨기고 뒤로가기(back)는 유지해 재선택 진입 허용 */
#hearth-overlay.is-character-confirmed .hearth-character-stage,
#hearth-overlay.is-character-confirmed .hearth-character-carousel { display: none; }
#hearth-overlay.is-character-confirmed .hearth-depart {
  position: absolute;
  top: 50%;
  left: 50%;
  margin: 0;
  opacity: 1;
  transform: translate(-50%, -50%);
  pointer-events: auto;
  /* 확정 후 재등장은 딜레이 없이 바로 */
  transition: opacity 0.36s ease 0s, transform 0.36s cubic-bezier(0.2, 0.84, 0.3, 1) 0s, box-shadow 0.18s ease, border-color 0.18s ease;
}

/* ── orb / 설치 애니메이션 ──────────────────────────────────────────── */
.hearth-character-orb { position: fixed; z-index: 260; width: 18px; height: 18px; border-radius: 50%; pointer-events: none; background: #fff3bd; box-shadow: 0 0 22px #ffd778, 0 0 56px rgba(244,164,96,0.72); }
.hearth-character-orb.is-flying { animation: hearth-character-orb-flight 0.6s cubic-bezier(0.18,0.78,0.22,1) forwards; }
@keyframes hearth-character-orb-flight { to { transform: translate(var(--orb-dx), var(--orb-dy)) scale(0.45); opacity: 0.82; } }
.player-card.hearth-character-installed { animation: hearth-character-installed 0.72s cubic-bezier(0.2,0.8,0.3,1); }
@keyframes hearth-character-installed { 0% { filter: brightness(1.7); transform: translateY(-3px) scale(1.03); } 100% { filter: brightness(1); transform: none; } }

/* ── 무역 셔터 임시 화면 ──────────────────────────────────────────────
   hearth_bg_004 원본 배경 위에 좌측 2 : 우측 8 비율의 메타 상점 뼈대를 둔다.
   좌측은 글자/그림자/발광만 쓰는 라벨, 우측은 추후 실제 카드팩이 들어갈
   가로 슬라이드 레일과 떠 있는 듯한 하단 타원 그림자를 탭별로 매핑한다. */
#hearth-overlay.is-trade-mode .hearth-shutter {
  grid-template-columns: minmax(120px, 20%) minmax(0, 80%);
  grid-template-rows: 1fr;
  /* 무역은 배경 감상을 우선해 별도 암전/블러 veil 없이 원본 일러스트를 그대로 노출한다. */
  background:
    var(--hearth-trade-bg, none),
    linear-gradient(180deg, #0b0910 0%, #060409 100%);
  background-size: cover;
  background-position: center;
}

#hearth-overlay.is-trade-mode.is-shutter-rest .hearth-shutter::before {
  /* 공통 셔터 veil을 무역에서는 꺼서 hearth_bg_004가 선명하게 남도록 한다. */
  background: transparent;
  backdrop-filter: none;
}
#hearth-overlay.is-trade-mode .hearth-character-stage,
#hearth-overlay.is-trade-mode .hearth-character-strip,
#hearth-overlay.is-trade-mode .hearth-depart {
  display: none;
}
.hearth-trade-stage {
  grid-column: 1 / 3;
  grid-row: 1;
  position: relative;
  z-index: 7;
  display: grid;
  grid-template-columns: minmax(150px, 20%) minmax(0, 80%);
  gap: clamp(12px, 2vw, 28px);
  padding: clamp(18px, 3vh, 34px) clamp(14px, 2vw, 28px) clamp(56px, 8vh, 84px);
  opacity: 0;
  pointer-events: none;
}
#hearth-overlay.is-trade-mode.is-shutter-rest .hearth-trade-stage {
  opacity: 1;
  pointer-events: auto;
}
#hearth-overlay:not(.is-trade-mode) .hearth-trade-stage {
  display: none;
}
.hearth-trade-tabs {
  min-height: 0;
  overflow-y: auto;
  padding: 4px 10px 4px 4px;
  display: flex;
  flex-direction: column;
  gap: clamp(7px, 1.2vh, 12px);
  scrollbar-width: thin;
  scrollbar-color: rgba(244, 164, 96, 0.72) rgba(20, 16, 28, 0.18);
  transform: translateX(-120%);
  transition: transform 0.42s cubic-bezier(0.2, 0.84, 0.3, 1) 0.08s;
}
#hearth-overlay.is-trade-mode.is-shutter-rest .hearth-trade-tabs { transform: translateX(0); }
#hearth-overlay.is-trade-leaving .hearth-trade-tabs { transform: translateX(-120%); transition-delay: 0.12s; }
.hearth-trade-tabs::-webkit-scrollbar { width: 7px; }
.hearth-trade-tabs::-webkit-scrollbar-track { background: rgba(20, 16, 28, 0.18); border-radius: 999px; }
.hearth-trade-tabs::-webkit-scrollbar-thumb { background: linear-gradient(180deg, rgba(255, 215, 120, 0.55), rgba(150, 86, 38, 0.72)); border-radius: 999px; }
.hearth-trade-tab {
  min-height: clamp(48px, 7.8vh, 74px);
  border: 0;
  background: transparent;
  color: rgba(255, 238, 196, 0.82);
  font: 900 clamp(21px, 3.4vh, 34px)/1 'OkDanDan', Georgia, serif;
  letter-spacing: 0.18em;
  text-align: center;
  padding: 0 clamp(10px, 1.5vw, 18px);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: none;
  text-shadow: 0 8px 16px rgba(0, 0, 0, 0.78), 0 0 14px rgba(244, 164, 96, 0.2);
  transform: translateX(-18px);
  opacity: 0;
  animation: hearth-trade-label-in 0.42s cubic-bezier(0.2, 0.84, 0.3, 1) both;
  transition: transform 0.18s ease, color 0.18s ease, text-shadow 0.18s ease, filter 0.18s ease;
}
/* 라벨 자체만 남기고 뒤 그림자는 텍스트 계층으로 만든다. */
.hearth-trade-tab span {
  position: relative;
  display: inline-block;
  transition: transform 0.18s ease;
}
.hearth-trade-tab span::before {
  content: attr(data-shadow-text);
  position: absolute;
  inset: 0;
  z-index: -1;
  color: rgba(0, 0, 0, 0.68);
  transform: translate(8px, 12px) scale(1.04);
  filter: blur(3px);
  opacity: 0.62;
  pointer-events: none;
  transition: transform 0.18s ease, opacity 0.18s ease, filter 0.18s ease;
}
.hearth-trade-tab:nth-child(1) { animation-delay: 0.74s; }
.hearth-trade-tab:nth-child(2) { animation-delay: 0.79s; }
.hearth-trade-tab:nth-child(3) { animation-delay: 0.84s; }
.hearth-trade-tab:nth-child(4) { animation-delay: 0.89s; }
.hearth-trade-tab:nth-child(5) { animation-delay: 0.94s; }
.hearth-trade-tab:nth-child(n+6) { animation-delay: 0.99s; }
.hearth-trade-tab:hover,
.hearth-trade-tab.is-active {
  color: #fff0ba;
  filter: brightness(1.08);
  text-shadow: 0 12px 18px rgba(0, 0, 0, 0.9), 0 0 10px rgba(255, 231, 168, 0.78), 0 0 30px rgba(244, 164, 96, 0.5);
}
.hearth-trade-tab:hover span,
.hearth-trade-tab.is-active span {
  transform: translateY(-2px) scale(1.035);
}
.hearth-trade-tab:hover span::before,
.hearth-trade-tab.is-active span::before {
  transform: translate(14px, 18px) scale(1.1);
  opacity: 0.94;
  filter: blur(4px);
}
@keyframes hearth-trade-label-in { to { transform: translateX(0); opacity: 1; } }
.hearth-trade-pack-area {
  min-height: 0;
  height: 100%;
  display: flex;
  align-items: center;
  gap: clamp(8px, 1vw, 14px);
  padding: clamp(24px, 5vh, 72px) clamp(8px, 1vw, 12px) clamp(46px, 8vh, 92px);
}
/* 팩 목록은 뷰포트 안에서 스크롤, 스크롤바는 숨김 */
.hearth-trade-pack-viewport {
  flex: 1;
  min-height: 0;
  height: 100%;
  overflow-x: auto;
  overflow-y: visible;
  scrollbar-width: none;
  display: flex;
  align-items: center;
}
.hearth-trade-pack-viewport::-webkit-scrollbar { display: none; }
.hearth-trade-pack-grid {
  display: flex;
  flex-wrap: nowrap;
  gap: clamp(16px, 2.4vw, 30px);
  align-items: center;
  min-width: max-content;
  padding: clamp(18px, 3vh, 30px) clamp(10px, 1.5vw, 20px) clamp(28px, 5vh, 50px);
}
/* 무역 팩 영역 전용 화살표 — 팩 뷰포트 양옆에 고정 */
.hearth-trade-nav {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  width: clamp(36px, 4vh, 50px);
  height: clamp(36px, 4vh, 50px);
  border-radius: 50%;
  border: 1px solid rgba(255, 215, 120, 0.3);
  background: rgba(9, 5, 16, 0.72);
  color: rgba(255, 232, 168, 0.9);
  cursor: pointer;
  opacity: 0.64;
  transition: opacity 0.22s ease, background 0.2s ease, border-color 0.2s ease, transform 0.18s ease;
  backdrop-filter: blur(3px);
}
.hearth-trade-nav > svg { width: 52%; height: 52%; }
.hearth-trade-nav:hover {
  opacity: 1;
  background: rgba(22, 12, 32, 0.9);
  border-color: rgba(255, 222, 140, 0.72);
  transform: scale(1.1);
}
.hearth-trade-pack {
  flex: 0 0 clamp(142px, 17vw, 210px);
  min-height: clamp(184px, 32vh, 276px);
  border-radius: 16px;
  border: 1px solid rgba(200, 152, 60, 0.42);
  background: linear-gradient(180deg, rgba(36, 24, 38, 0.72), rgba(14, 9, 18, 0.86));
  box-shadow: inset 0 1px 0 rgba(255, 232, 168, 0.16), inset 0 -14px 24px rgba(0, 0, 0, 0.42), 0 18px 28px rgba(0, 0, 0, 0.38);
  padding: clamp(10px, 1.6vh, 16px);
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 6px;
  color: rgba(255, 236, 188, 0.9);
  font-family: 'OkDanDan', Georgia, serif;
  opacity: 0;
  position: relative;
  transform: translateY(44px);
  animation: hearth-trade-pack-rise 0.48s cubic-bezier(0.2, 0.84, 0.3, 1) forwards;
  animation-delay: calc(0.86s + var(--pack-order, 0) * 0.06s);
}
#hearth-overlay.is-trade-leaving .hearth-trade-pack {
  animation: hearth-trade-pack-leave 0.28s ease-in forwards;
  animation-delay: calc(var(--pack-order, 0) * 0.035s);
}
.hearth-trade-pack::after {
  content: '';
  position: absolute;
  left: 12%;
  right: 12%;
  bottom: clamp(-28px, -4vh, -18px);
  height: clamp(18px, 3.8vh, 32px);
  border-radius: 50%;
  background: radial-gradient(ellipse at center, rgba(0, 0, 0, 0.56), rgba(0, 0, 0, 0.22) 48%, transparent 72%);
  filter: blur(4px);
  z-index: -1;
  pointer-events: none;
}
.hearth-trade-pack-art {
  flex: 1;
  min-height: 110px;
  border-radius: 12px;
  background:
    radial-gradient(circle at 50% 38%, rgba(255, 232, 168, 0.14), transparent 54%),
    repeating-linear-gradient(135deg, rgba(255,255,255,0.026) 0 2px, transparent 2px 10px),
    linear-gradient(160deg, rgba(74, 56, 78, 0.48), rgba(24, 16, 30, 0.92));
  border: 1px dashed rgba(255, 222, 140, 0.2);
}
.hearth-trade-pack strong { font-size: clamp(18px, 2.5vh, 25px); letter-spacing: 0.08em; }
.hearth-trade-pack small { color: rgba(214, 200, 178, 0.72); font-size: clamp(12px, 1.7vh, 15px); }
@keyframes hearth-trade-pack-rise { to { opacity: 1; transform: translateY(0); } }
@keyframes hearth-trade-pack-leave { to { opacity: 0; transform: translateY(-48px); } }

/* ── 만찬 셔터 임시 화면 ──────────────────────────────────────────────
   hearth_bg_005 즉시 페이드인 → 무료 팩 레일 → 강한 암전 선택 → 완료 후 검은 커튼/006 일러스트 대사.
   실제 버프 데이터 연결 전까지 단색 임시 일러스트를 카드 안에 채운다. */
#hearth-overlay.is-dinner-mode .hearth-shutter {
  background: linear-gradient(180deg, rgba(5, 2, 6, 0.82), rgba(2, 1, 4, 0.94));
}
#hearth-overlay.is-dinner-mode .hearth-character-stage,
#hearth-overlay.is-dinner-mode .hearth-character-strip,
#hearth-overlay.is-dinner-mode .hearth-depart,
#hearth-overlay.is-dinner-mode .hearth-trade-stage { display: none; }
#hearth-overlay:not(.is-dinner-mode) .hearth-dinner-stage { display: none; }
/* 셸(overflow:hidden)이 외부 클립을 담당하므로 stage는 visible — 하단 그림자 컷 방지 */
.hearth-dinner-stage { grid-column: 1 / 4; grid-row: 1 / 4; position: relative; overflow: visible; z-index: 6; opacity: 0; pointer-events: none; }
#hearth-overlay.is-dinner-mode.is-shutter-rest .hearth-dinner-stage { opacity: 1; pointer-events: auto; transition: opacity 0.28s ease; }
.hearth-dinner-bg { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(7,2,7,0.18), rgba(2,1,4,0.28)), var(--hearth-dinner-bg, none), radial-gradient(circle at 50% 42%, rgba(150,28,34,0.12), transparent 56%); background-size: cover; background-position: center; opacity: 0; filter: saturate(0.96) brightness(0.82); transition: opacity 0.52s ease 0.18s, filter 0.52s ease 0.18s; }
#hearth-overlay.is-dinner-mode.is-shutter-rest .hearth-dinner-bg { opacity: 1; filter: saturate(0.98) brightness(0.84); }
#hearth-overlay.is-dinner-opened .hearth-dinner-bg { filter: saturate(0.94) brightness(0.74) blur(0.35px); }
#hearth-overlay.is-dinner-after .hearth-dinner-bg { filter: saturate(0.92) brightness(0.72); }
.hearth-dinner-curtain { display: none; position: absolute; top: 0; bottom: 0; width: 54%; z-index: 3; background: repeating-linear-gradient(90deg, rgba(70,8,18,0.98) 0 18px, rgba(24,2,10,0.98) 18px 34px), linear-gradient(180deg, #2a0610, #070207); box-shadow: inset 0 0 34px rgba(0,0,0,0.72), 0 0 28px rgba(0,0,0,0.56); transition: transform 0.92s cubic-bezier(0.2,0.84,0.3,1) 0.08s; }
.hearth-dinner-curtain--left { left: 0; }
.hearth-dinner-curtain--right { right: 0; }
#hearth-overlay.is-dinner-mode.is-shutter-rest .hearth-dinner-curtain--left { transform: translateX(-96%); }
#hearth-overlay.is-dinner-mode.is-shutter-rest .hearth-dinner-curtain--right { transform: translateX(96%); }
/* 4팩을 1:1:1:1 그리드로 균등 배치, overflow visible로 그림자 컷 방지 */
.hearth-dinner-rail {
  position: absolute; left: 4%; right: 4%; top: 50%;
  display: grid; grid-template-columns: repeat(4, 1fr);
  gap: clamp(10px,1.6vw,20px);
  overflow: visible;
  padding: 20px 6px 32px; z-index: 4; opacity: 0;
  transform: translateY(-50%) translateY(26px);
  transition: opacity 0.38s ease 0.98s, transform 0.38s cubic-bezier(0.2,0.84,0.3,1) 0.98s, filter 0.3s ease;
}
#hearth-overlay.is-dinner-mode.is-shutter-rest .hearth-dinner-rail { opacity: 1; transform: translateY(-50%); }
#hearth-overlay.is-dinner-opened .hearth-dinner-rail { filter: blur(5px) brightness(0.22); opacity: 0.3; pointer-events: none; }
#hearth-overlay.is-dinner-finalizing .hearth-dinner-rail { opacity: 0; transform: translateY(-50%) scale(0.94); transition: opacity 0.34s ease, transform 0.34s ease; }
/* 팩 오픈/최종 공개 공용 오버레이 — z5(선택지 z6 아래)로 레일만 덮는다 */
.hearth-dinner-resolve-overlay {
  position: absolute; inset: 0; z-index: 5;
  background: rgba(4,2,8,0.88);
  opacity: 0; pointer-events: none;
  transition: opacity 0.44s ease;
}
/* 팩을 까면 레일 전체에 반투명 어둠 — 선택지(z6)는 그 위에 뜬다 */
#hearth-overlay.is-dinner-opened .hearth-dinner-resolve-overlay { opacity: 0.56; }
#hearth-overlay.is-dinner-finalizing .hearth-dinner-resolve-overlay { opacity: 1; }
/* 만찬 팩 카드: 컨테이너는 투명, 이름·가격은 텍스트만 부유, 일러스트가 시각 중심 */
.hearth-dinner-pack {
  flex: 0 0 clamp(118px, 16vw, 168px);
  border-radius: 18px;
  border: none;
  background: transparent;
  color: #ffe7a8;
  font-family: 'OkDanDan', Georgia, serif;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: clamp(9px,1.4vh,13px) clamp(8px,1.1vw,11px);
  cursor: pointer;
  transition: transform 0.22s cubic-bezier(0.34,1.56,0.5,1);
}
.hearth-dinner-pack:not(.is-locked):hover {
  transform: translateY(-9px) scale(1.05);
}
.hearth-dinner-pack.is-locked { opacity: 0.42; cursor: default; filter: saturate(0.7); }
.hearth-dinner-pack-name {
  font-size: clamp(11px,1.5vh,15px);
  font-weight: 900;
  letter-spacing: 0.06em;
  text-align: center;
  color: rgba(255,236,188,0.96);
  margin-bottom: clamp(6px,0.9vh,10px);
  text-shadow: 0 2px 8px rgba(0,0,0,0.8);
}
.hearth-dinner-pack-art {
  width: 100%;
  aspect-ratio: 1 / 1;
  border-radius: 12px;
  border: 1px dashed rgba(255,222,140,0.24);
  background:
    radial-gradient(circle at 44% 36%, rgba(255,232,168,0.18), transparent 52%),
    repeating-linear-gradient(135deg, rgba(255,255,255,0.022) 0 2px, transparent 2px 10px),
    linear-gradient(148deg, rgba(110,30,42,0.56), rgba(22,10,26,0.97));
  flex-shrink: 0;
  box-shadow: 0 14px 36px rgba(0,0,0,0.72), 0 0 22px rgba(244,164,96,0.1);
}
.hearth-dinner-pack-price {
  font-size: clamp(14px,1.9vh,20px);
  font-weight: 900;
  letter-spacing: 0.1em;
  text-align: center;
  margin-top: clamp(6px,0.9vh,10px);
  color: rgba(255,215,120,0.92);
  text-shadow: 0 0 16px rgba(244,164,96,0.42);
}
/* ── 만찬 선택지 — 인게임 카드팩 피커 스타일 ───────────────────────── */
/* 전체 오버레이 채움, 셸이 flex-column으로 카드를 세로 중앙에 배치 */
.hearth-dinner-choices {
  position: absolute; inset: 0;
  z-index: 6; display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: clamp(10px, 1.6vh, 18px);
  padding: clamp(56px,8vh,80px) clamp(10px,1.4vw,18px) clamp(10px,1.4vh,14px);
  pointer-events: none;
}
#hearth-overlay.is-dinner-opened .hearth-dinner-choices { pointer-events: auto; }
/* 상단 고정 헤더 — 인게임 shop-pack-picker-head 구조 참고 */
.hearth-dinner-choices-header {
  position: absolute; top: clamp(18px,2.4vh,28px);
  text-align: center; margin: 0;
  color: rgba(255,232,168,0.96); font-family: 'OkDanDan', Georgia, serif;
  text-shadow: 0 1px 2px rgba(0,0,0,0.85);
  animation: hearth-dinner-head-in 0.32s ease 0.1s both;
}
@keyframes hearth-dinner-head-in { 0% { opacity:0; transform:translateY(-6px); } 100% { opacity:1; transform:translateY(0); } }
.hearth-dinner-choices-pack {
  display: block; margin: 0;
  font-size: clamp(18px,2.2vh,24px); letter-spacing: 0.08em; font-weight: 900;
}
.hearth-dinner-choices-step {
  display: block; margin: 4px 0 0;
  font-size: clamp(13px,1.4vh,15px);
  color: rgba(232,214,180,0.82); letter-spacing: 0.04em;
}
/* 3장 카드 그리드 — shop-pack-picker-cards 참고 */
.hearth-dinner-choices-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(clamp(140px,16vw,188px), 1fr));
  gap: clamp(8px,1.2vw,16px);
  width: 100%; max-width: clamp(460px,66vw,760px);
}
/* 선택 카드 — shop-pack-pick-card 스타일 기반, 촛불 테마 유지 */
.hearth-dinner-choice {
  position: relative; padding: 0;
  border-radius: 14px;
  border: 1.5px solid rgba(200,152,60,0.52);
  background: linear-gradient(180deg, rgba(18,8,26,0.99) 0%, rgba(28,12,34,0.97) 40%, rgba(10,5,14,0.99) 100%);
  color: #ffe7a8; font-family: 'OkDanDan', Georgia, serif;
  display: flex; flex-direction: column;
  overflow: hidden; cursor: pointer;
  min-height: clamp(200px,34vh,300px); aspect-ratio: 3 / 4;
  box-shadow: inset 0 1px 0 rgba(255,232,168,0.16), 0 16px 42px rgba(0,0,0,0.72);
  transition: transform 0.22s cubic-bezier(0.34,1.56,0.5,1), box-shadow 0.22s ease, border-color 0.2s ease;
}
.hearth-dinner-choice:hover {
  transform: translateY(-8px) scale(1.03);
  box-shadow: inset 0 1px 0 rgba(255,232,168,0.24), 0 28px 56px rgba(0,0,0,0.82), 0 0 32px rgba(244,164,96,0.28);
}
/* 등급별 테두리/발광 */
.hearth-dinner-choice[data-rarity="common"] { border-color: rgba(184,168,138,0.5); }
.hearth-dinner-choice[data-rarity="rare"]   { border-color: rgba(100,178,218,0.7); box-shadow: inset 0 1px 0 rgba(160,220,255,0.12), 0 16px 42px rgba(0,0,0,0.72), 0 0 16px rgba(80,160,220,0.2); }
.hearth-dinner-choice[data-rarity="epic"]   { border-color: rgba(192,100,220,0.8); box-shadow: inset 0 1px 0 rgba(220,160,255,0.16), 0 16px 42px rgba(0,0,0,0.72), 0 0 24px rgba(160,60,220,0.36); }
.hearth-dinner-choice[data-rarity="rare"]:hover  { border-color: rgba(130,210,255,0.9); box-shadow: inset 0 1px 0 rgba(160,220,255,0.2), 0 28px 56px rgba(0,0,0,0.82), 0 0 36px rgba(80,160,220,0.44); }
.hearth-dinner-choice[data-rarity="epic"]:hover  { border-color: rgba(220,130,255,0.92); box-shadow: inset 0 1px 0 rgba(220,160,255,0.26), 0 28px 56px rgba(0,0,0,0.82), 0 0 48px rgba(160,60,220,0.58); }
/* 일러스트 영역 */
.hearth-dinner-choice-art {
  flex: 1; min-height: 0;
  background:
    var(--dinner-art, none) center/cover no-repeat,
    radial-gradient(circle at 52% 38%, rgba(255,236,188,0.16), transparent 38%),
    linear-gradient(145deg, var(--food-color,#7e2630), rgba(16,7,18,0.97));
}
/* 하단 푸터: 등급뱃지 + 이름 + 스탯 */
.hearth-dinner-choice-footer {
  padding: clamp(8px,1.2vh,12px) clamp(10px,1.4vw,14px);
  border-top: 1px solid rgba(255,215,120,0.1);
  background: linear-gradient(0deg, rgba(0,0,0,0.38), transparent);
  display: flex; flex-direction: column; gap: 3px; flex-shrink: 0;
}
.hearth-dinner-choice-rarity {
  display: block;
  font-size: clamp(9px,1.1vh,11px); font-weight: 900; letter-spacing: 0.1em;
  padding: 0; margin-bottom: 1px;
}
.hearth-dinner-choice[data-rarity="common"] .hearth-dinner-choice-rarity { color: rgba(200,184,148,0.78); }
.hearth-dinner-choice[data-rarity="rare"]   .hearth-dinner-choice-rarity { color: rgba(130,200,255,0.9); text-shadow: 0 0 6px rgba(80,160,220,0.6); }
.hearth-dinner-choice[data-rarity="epic"]   .hearth-dinner-choice-rarity { color: rgba(210,150,255,0.95); text-shadow: 0 0 8px rgba(160,60,220,0.7); }
.hearth-dinner-choice-footer strong { font-size: clamp(14px,1.9vh,20px); letter-spacing: 0.06em; display: block; }
.hearth-dinner-choice-footer small { color: rgba(220,206,172,0.78); font-size: clamp(10px,1.3vh,13px); display: block; line-height: 1.3; }
.hearth-dinner-choice[data-rarity="rare"] .hearth-dinner-choice-footer small { color: rgba(140,210,255,0.88); }
.hearth-dinner-choice[data-rarity="epic"] .hearth-dinner-choice-footer small { color: rgba(210,150,255,0.92); }
/* 최종 완성 유물 카드 — finalizing 오버레이(z6) 위에서 카드팩처럼 등장 */
.hearth-dinner-picked {
  position: absolute; left: 50%; top: 50%;
  transform: translate(-50%, -50%);
  z-index: 7;
  width: clamp(148px,20vw,210px);
  aspect-ratio: 3 / 4;
  pointer-events: none;
  opacity: 0;
}
.hearth-dinner-plate-card {
  width: 100%; height: 100%;
  border-radius: 18px;
  border: 1.5px solid rgba(255,215,120,0.66);
  background: linear-gradient(180deg, rgba(18,9,26,0.99) 0%, rgba(34,18,40,0.97) 38%, rgba(10,6,14,0.99) 100%);
  color: #ffe7a8; font-family: 'OkDanDan', Georgia, serif;
  padding: 0;
  display: flex; flex-direction: column; overflow: hidden;
  box-shadow:
    inset 0 1px 0 rgba(255,232,168,0.26),
    inset 0 -1px 0 rgba(244,164,96,0.14),
    0 0 56px rgba(244,164,96,0.28),
    0 0 18px rgba(0,0,0,0.72);
}
.hearth-dinner-plate-art {
  flex: 1; min-height: 0;
  background:
    var(--dinner-art, none) center/cover no-repeat,
    radial-gradient(circle at 50% 44%, rgba(255,236,188,0.28), transparent 42%),
    linear-gradient(145deg, var(--food-color,#7e2630), rgba(16,7,18,0.98));
}
.hearth-dinner-plate-body {
  padding: 10px 12px 12px; flex-shrink: 0;
  border-top: 1px solid rgba(255,215,120,0.16);
  background: linear-gradient(0deg, rgba(0,0,0,0.36), transparent);
}
.hearth-dinner-plate-body strong { font-size: clamp(13px,1.8vh,19px); letter-spacing: 0.06em; display: block; }
.hearth-dinner-plate-body small { color: rgba(220,204,178,0.76); font-size: clamp(10px,1.3vh,13px); display: block; line-height: 1.3; margin-top: 3px; }
/* finalizing 시 choices 페이드아웃 */
#hearth-overlay.is-dinner-finalizing .hearth-dinner-choices { opacity: 0; transition: opacity 0.28s ease; pointer-events: none; }
/* 뒤로가기 버튼은 finalizing·after 동안 숨긴다 */
#hearth-overlay.is-dinner-finalizing .hearth-back,
#hearth-overlay.is-dinner-after .hearth-back { opacity: 0 !important; pointer-events: none !important; transition: none !important; }
.hearth-dinner-final-curtain { position: absolute; top: 0; bottom: 0; width: 52%; z-index: 8; background: linear-gradient(180deg, #030204, #000 58%, #050306); box-shadow: inset 0 0 42px rgba(0,0,0,0.9), 0 0 34px rgba(0,0,0,0.7); opacity: 0; pointer-events: none; }
.hearth-dinner-final-curtain--left { left: 0; transform: translateX(-104%); }
.hearth-dinner-final-curtain--right { right: 0; transform: translateX(104%); }
#hearth-overlay.is-dinner-closing .hearth-dinner-final-curtain--left,
#hearth-overlay.is-dinner-after .hearth-dinner-final-curtain--left { animation: hearth-dinner-black-close-left 0.78s cubic-bezier(0.16,0.84,0.24,1) forwards; }
#hearth-overlay.is-dinner-closing .hearth-dinner-final-curtain--right,
#hearth-overlay.is-dinner-after .hearth-dinner-final-curtain--right { animation: hearth-dinner-black-close-right 0.78s cubic-bezier(0.16,0.84,0.24,1) forwards; }
.hearth-dinner-illustration { position: absolute; inset: 8% 9% 18%; z-index: 9; background: var(--hearth-dinner-host, none) center/cover no-repeat; border: 1px solid rgba(255,215,120,0.28); border-radius: 18px; box-shadow: inset 0 0 80px rgba(0,0,0,0.42), 0 26px 68px rgba(0,0,0,0.68); clip-path: inset(0 50% 0 50%); opacity: 0; pointer-events: none; }
#hearth-overlay.is-dinner-after .hearth-dinner-illustration { animation: hearth-dinner-illu-open 0.86s 0.78s cubic-bezier(0.18,0.82,0.25,1) forwards; }
.hearth-dinner-dialogue { position: absolute; left: 10%; right: 10%; bottom: 6%; z-index: 10; min-height: 54px; padding: 16px 22px; border: 1px solid rgba(255,215,120,0.42); border-radius: 18px; background: linear-gradient(180deg, rgba(25,16,24,0.92), rgba(8,5,10,0.96)); color: #ffe7a8; font-family: 'OkDanDan', Georgia, serif; font-size: clamp(16px, 2.2vh, 22px); line-height: 1.45; text-align: center; letter-spacing: 0.03em; box-shadow: inset 0 1px 0 rgba(255,232,168,0.14), 0 18px 42px rgba(0,0,0,0.62); opacity: 0; transform: translateY(16px); pointer-events: none; }
#hearth-overlay.is-dinner-after .hearth-dinner-dialogue { animation: hearth-dinner-dialogue-in 0.36s 1.42s ease-out forwards; }
#hearth-overlay.is-dinner-after .hearth-dinner-rail,
#hearth-overlay.is-dinner-after .hearth-dinner-choices,
#hearth-overlay.is-dinner-after .hearth-dinner-picked { display: none; }
.hearth-dinner-relic-card { width: 54px; min-height: 74px; border-radius: 10px; border: 1px solid rgba(255,215,120,0.5); background: linear-gradient(180deg, rgba(54,36,42,0.96), rgba(12,8,14,0.98)); color: #ffe7a8; font-family: 'OkDanDan', Georgia, serif; font-size: 10px; padding: 5px; box-shadow: inset 0 1px 0 rgba(255,232,168,0.18), 0 0 18px rgba(244,164,96,0.35); }
.hearth-dinner-relic-card span { display: block; height: 30px; border-radius: 7px; margin-bottom: 4px; background: radial-gradient(circle at 50% 38%, rgba(255,236,188,0.28), transparent 42%), linear-gradient(145deg, #7e2630, rgba(22,10,24,0.94)); }
.hearth-dinner-relic-card strong, .hearth-dinner-relic-card small { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
@keyframes hearth-dinner-black-close-left { to { transform: translateX(0); opacity: 1; } }
@keyframes hearth-dinner-black-close-right { to { transform: translateX(0); opacity: 1; } }
@keyframes hearth-dinner-illu-open { 0% { clip-path: inset(0 50% 0 50%); opacity: 0; } 100% { clip-path: inset(0 0 0 0); opacity: 1; } }
@keyframes hearth-dinner-dialogue-in { to { opacity: 1; transform: translateY(0); } }
.hearth-dinner-orb { position: fixed; z-index: 260; width: 20px; height: 20px; border-radius: 50%; pointer-events: none; background: #ffe7a8; box-shadow: 0 0 22px #ffd778, 0 0 58px rgba(244,164,96,0.76); }
.hearth-dinner-orb.is-flying { animation: hearth-dinner-orb-flight 0.64s cubic-bezier(0.18,0.78,0.22,1) forwards; }
@keyframes hearth-dinner-orb-flight { to { transform: translate(var(--orb-dx), var(--orb-dy)) scale(0.38); opacity: 0.84; } }

`
