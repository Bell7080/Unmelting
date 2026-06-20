/**
 * 거점(촛대) 화면 전용 스타일.
 * 인게임 레일을 배경으로 재사용하므로 셸은 .rail rect에 고정되고,
 * 커튼은 직업 선택의 job-rail-curtain 그라디언트/열림 키프레임을 그대로 빌려
 * 오로라빛으로 retint 한다(자동 close-in만 제거해 '닫힌 채로 시작'한다).
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

/* 레일 rect에 고정되는 셸 — 커튼/배경/그리드를 클립한다. */
.hearth-shell {
  position: fixed;
  overflow: hidden;
  border-radius: 14px;
  pointer-events: auto;
  box-shadow:
    inset 0 0 0 1px rgba(255, 215, 120, 0.12),
    inset 0 0 60px rgba(0, 0, 0, 0.7);
}

/* 폐저택/영지 배경. 실제 일러스트는 --hearth-bg(url)로 주입해 교체한다. */
.hearth-bg {
  position: absolute;
  inset: 0;
  z-index: 0;
  background:
    var(--hearth-bg, none),
    radial-gradient(ellipse at 50% 22%, rgba(86, 52, 104, 0.42), transparent 64%),
    radial-gradient(ellipse at 50% 120%, rgba(120, 70, 34, 0.3), transparent 62%),
    repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.018) 0 1px, transparent 1px 46px),
    linear-gradient(180deg, rgba(16, 11, 22, 0.97), rgba(7, 4, 12, 0.99));
  background-size: cover, auto, auto, auto, auto;
  background-position: center;
  filter: saturate(0.9);
}

/* 9칸 스테이션 그리드 — 인게임 레일 칸 느낌으로 3×3. */
.hearth-grid {
  position: absolute;
  inset: 0;
  z-index: 1;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(3, 1fr);
  gap: clamp(6px, 1vw, 14px);
  padding: clamp(8px, 1.4vw, 18px);
}

.hearth-cell {
  position: relative;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.05);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.015), rgba(0, 0, 0, 0.18));
}
/* 잠긴/미점등 칸은 어둠 그대로 — 다음 해금 자리를 어렴풋이 남긴다. */
.hearth-cell--dark {
  box-shadow: inset 0 0 26px rgba(0, 0, 0, 0.6);
}

/* 모험 칸: 평소 희미, 점등(is-ignited) 시 화륵 타오른다. */
.hearth-cell--adventure {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  cursor: pointer;
  appearance: none;
  border: 1px solid rgba(255, 215, 120, 0.22);
  color: rgba(255, 236, 188, 0.55);
  font-family: 'OkDanDan', Georgia, serif;
  opacity: 0.42;
  transition: opacity 0.5s ease, border-color 0.5s ease, box-shadow 0.5s ease, transform 0.2s ease;
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
  border-color: rgba(255, 222, 140, 0.7);
  box-shadow:
    inset 0 0 30px rgba(244, 164, 96, 0.22),
    0 0 34px rgba(244, 164, 96, 0.28),
    0 0 0 1px rgba(220, 170, 70, 0.32);
  animation: hearth-ignite 0.66s cubic-bezier(0.2, 0.84, 0.3, 1) both;
}
@keyframes hearth-ignite {
  0%   { transform: scale(0.9); filter: brightness(0.5); }
  40%  { transform: scale(1.04); filter: brightness(1.6);
         box-shadow: 0 0 60px rgba(255, 200, 110, 0.6), inset 0 0 40px rgba(255, 200, 110, 0.4); }
  100% { transform: scale(1); filter: brightness(1); }
}
.hearth-cell--adventure.is-chosen {
  box-shadow:
    0 0 0 2px rgba(255, 222, 140, 0.85),
    0 0 60px rgba(244, 164, 96, 0.5);
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
`
