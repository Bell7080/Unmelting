/**
 * 밀랍상(蠟像) 탭 — 경험 패널과 같은 어두운 반투명 레이어 + 유리질 모달 톤을 쓰되,
 * "전시관"답게 좌(정보창) · 중(풀 일러스트 갤러리) · 우(임시보관칸) · 하단(조합)으로
 * 구성한다. 갤러리 카드는 더 많은 전시물이 한눈에 들어오도록 작게 잡고, 필드 칸과
 * 같은 비율·풀 일러스트를 쓴다(`spriteForCard()` 재사용, 전용 아이콘을 새로 그리지
 * 않는다). 정상 색은 촛불 금빛, 이로치(변종)는 이 게임에서 안 쓰던 옥빛(초록)으로
 * 갈라 한눈에 "이건 다르다"가 읽히게 한다.
 */
export const GAME_BOARD_WAX_FIGURE_STYLES = `
/* 브라우저 기본 폼 요소는 font-family를 상속하지 않는다 — 이 한 줄이 없으면
   조합 리스트/마법진 코어/담기 같은 button 글자만 UA 산세리프로 튄다. */
.wax-figure-overlay button { font-family: inherit; }
.wax-figure-overlay {
  position: fixed;
  inset: 0;
  display: none;
  align-items: center;
  justify-content: center;
  background:
    radial-gradient(90% 70% at 50% 36%, rgba(96, 214, 200, 0.06), transparent 52%),
    radial-gradient(120% 90% at 50% 35%, rgba(10, 14, 28, 0.6), rgba(2, 3, 8, 0.8));
  backdrop-filter: blur(6px);
  z-index: 10500;
  /* 화면을 거의 다 쓴다 — 전시관은 훑어보는 곳이라 여백이 넓을수록 한 번에 덜 보인다. */
  padding: clamp(8px, 1.4vh, 18px);
}
.wax-figure-overlay.is-open { display: flex; animation: codex-overlay-fade 0.3s ease; }
.wax-figure-overlay.is-open .wax-figure-modal { animation: experience-modal-rise 0.5s cubic-bezier(0.18, 0.9, 0.28, 1.08); }

.wax-figure-modal {
  position: relative;
  width: min(1560px, 99vw);
  height: min(1020px, 96vh);
  max-height: 96vh;
  display: grid;
  grid-template-rows: auto auto 1fr;
  /* 차가운 오로라 유리 — 밀랍상은 '얼어붙어 보관된 것'이라 상점의 촛불 호박빛과 갈린다.
     반투명 판(0.34~0.5) + 강한 블러로 뒤가 비치는 유리로 읽히게 하고, 색은 청록↔남보라
     사이에서만 논다(호박빛 금지). 일렁임은 아래 ::before가 맡는다. */
  background:
    radial-gradient(120% 60% at 50% -8%, rgba(96, 214, 200, 0.14), transparent 62%),
    radial-gradient(90% 75% at 50% 46%, rgba(78, 96, 176, 0.1), transparent 68%),
    linear-gradient(180deg, rgba(14, 24, 34, 0.5), rgba(6, 9, 18, 0.62));
  backdrop-filter: blur(18px) saturate(1.15);
  border: 1px solid rgba(150, 226, 214, 0.16);
  border-radius: 22px;
  box-shadow:
    0 30px 80px rgba(0, 0, 0, 0.62),
    0 0 60px rgba(88, 200, 190, 0.14),
    inset 0 1px 0 rgba(198, 246, 238, 0.14),
    inset 0 0 90px rgba(70, 150, 170, 0.06);
  overflow: hidden;
  color: #e6f4f2;
}
/* 오로라 — 색 띠 두 겹이 서로 다른 속도로 아주 느리게 흐른다. 판을 덮지 않고 빛만 더하도록
   screen 블렌드에 낮은 불투명도로 얹는다(불투명하게 채우면 안이 안 보인다). */
.wax-figure-modal::before {
  content: '';
  position: absolute;
  inset: -30%;
  z-index: 0;
  pointer-events: none;
  opacity: 0.5;
  mix-blend-mode: screen;
  filter: blur(42px);
  background:
    radial-gradient(38% 26% at 22% 18%, rgba(86, 226, 208, 0.5), transparent 70%),
    radial-gradient(34% 24% at 74% 26%, rgba(122, 148, 240, 0.42), transparent 72%),
    radial-gradient(42% 28% at 58% 82%, rgba(74, 186, 214, 0.36), transparent 74%),
    radial-gradient(30% 22% at 14% 78%, rgba(150, 122, 226, 0.3), transparent 74%);
  animation: wax-aurora-drift 26s ease-in-out infinite alternate;
}
@keyframes wax-aurora-drift {
  0%   { transform: translate3d(-4%, -2%, 0) scale(1.02); opacity: 0.42; }
  35%  { transform: translate3d(3%, 2%, 0) scale(1.08); opacity: 0.56; }
  70%  { transform: translate3d(-2%, 4%, 0) scale(1.04); opacity: 0.46; }
  100% { transform: translate3d(4%, -3%, 0) scale(1.1); opacity: 0.58; }
}
@media (prefers-reduced-motion: reduce) {
  .wax-figure-modal::before { animation: none; }
}
/* 오로라 위에 내용이 오게 — ::before가 z-index 0이라 자식들을 띄워 준다. */
.wax-figure-header,
.wax-action-hint,
.wax-figure-hall { position: relative; z-index: 1; }
.wax-figure-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: clamp(14px, 1.6vh, 20px) clamp(18px, 1.6vw, 28px);
  border-bottom: 1px solid rgba(150, 226, 214, 0.16);
}
.wax-figure-title {
  display: flex;
  align-items: center;
  gap: 9px;
  font-size: clamp(20px, 1.7vw, 26px);
  font-weight: 800;
  letter-spacing: 0.14em;
  margin: 0;
  color: #d8fbf4;
  text-shadow: 0 0 16px rgba(110, 226, 212, 0.5);
}
.wax-figure-title-icon { display: inline-flex; width: 26px; height: 26px; color: #8fe8dc; }
.wax-figure-title-icon .icon { width: 26px; height: 26px; filter: drop-shadow(0 0 9px rgba(110, 226, 212, 0.75)); }
.wax-figure-capacity {
  margin-left: auto;
  font-size: 12.5px;
  font-weight: 700;
  color: rgba(206, 236, 232, 0.72);
  letter-spacing: 0.02em;
}
.wax-figure-capacity b {
  font-weight: 900;
  color: #8fe8dc;
  font-variant-numeric: tabular-nums;
}
.wax-figure-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(140, 226, 214, 0.07);
  border: 1px solid rgba(150, 226, 214, 0.3);
  border-radius: 9px;
  color: #cdf3ec;
  width: 32px;
  height: 32px;
  cursor: pointer;
  transition: background 0.16s ease, box-shadow 0.16s ease;
}
.wax-figure-close .icon { width: 15px; height: 15px; }
.wax-figure-close:hover { background: rgba(120, 220, 208, 0.2); box-shadow: 0 0 14px rgba(110, 226, 212, 0.42); }

.wax-action-hint {
  margin: 0 22px 6px;
  padding: 7px 12px;
  border-radius: 10px;
  background: rgba(120, 220, 208, 0.1);
  border: 1px solid rgba(150, 226, 214, 0.3);
  color: #d5f4ee;
  font-size: 12.5px;
  text-align: center;
}

/* ── 전시관 골격: 좌(정보) · 중(갤러리) · 우(임시보관) 위, 조합은 하단 통짜 바 ── */
.wax-figure-hall {
  min-height: 0;
  padding: 16px 20px 20px;
  display: grid;
  grid-template-columns: clamp(230px, 17vw, 300px) minmax(0, 1fr) clamp(190px, 14vw, 250px);
  grid-template-rows: minmax(0, 1fr) auto;
  grid-template-areas:
    'info gallery hold'
    'compose compose compose';
  gap: 14px;
}
.wax-info-panel { grid-area: info; }
.wax-gallery-scroll { grid-area: gallery; }
.wax-hold-panel { grid-area: hold; }
.wax-compose-bar { grid-area: compose; }
@media (max-width: 900px) {
  .wax-figure-hall {
    grid-template-columns: 1fr;
    grid-template-rows: auto auto auto auto;
    grid-template-areas: 'info' 'gallery' 'hold' 'compose';
  }
}

.wax-section-title {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin: 0 0 10px;
  font-size: 12.5px;
  font-weight: 800;
  letter-spacing: 0.1em;
  color: #b9ece2;
}
.wax-section-note { font-size: 10.5px; font-weight: 600; color: rgba(200, 232, 228, 0.5); letter-spacing: 0.02em; }

/* ── 좌측 정보창 ────────────────────────────────────────── */
.wax-info-panel {
  border-radius: 14px;
  border: 1px solid rgba(150, 226, 214, 0.18);
  background: linear-gradient(180deg, rgba(18, 32, 42, 0.42), rgba(8, 12, 22, 0.5));
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
  position: relative;
  isolation: isolate;
  border-color: rgba(120, 235, 175, 0.5);
  /* 큰 초상도 같은 색조 규칙을 타되 밝기 보정은 뺀다 — 전시관 판이 필드보다 밝아
     필드와 같은 값을 주면 밀랍이 아니라 네온으로 튄다. */
  filter: saturate(1.15) contrast(1.02);
  box-shadow: inset 0 1px 0 rgba(190, 255, 220, 0.18), 0 10px 22px rgba(0, 0, 0, 0.5), 0 0 20px rgba(123, 240, 174, 0.22);
}
.wax-info-portrait.is-shiny::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: rgba(74, 226, 158, 0.5);
  mix-blend-mode: color;
}
.wax-info-body { display: flex; flex-direction: column; gap: 8px; }
.wax-info-name { margin: 0; font-size: 15px; font-weight: 800; color: #fff5dc; line-height: 1.3; }
.wax-info-stars { font-size: 13px; color: var(--color-flame, #ffd778); text-shadow: 0 0 6px rgba(255, 215, 120, 0.5); display: flex; align-items: baseline; gap: 6px; }
.wax-info-star-num { font-size: 12px; font-weight: 700; color: rgba(255, 233, 196, 0.55); }
.wax-info-stats { margin: 4px 0 0; display: flex; flex-direction: column; gap: 6px; }
.wax-info-stats > div { display: flex; justify-content: space-between; gap: 8px; font-size: 12px; }
.wax-info-stats dt { margin: 0; color: rgba(255, 233, 196, 0.55); font-weight: 700; }
.wax-info-stats dd { margin: 0; color: #ffe9c4; font-weight: 700; text-align: right; }
.wax-info-stats dd b { color: var(--color-flame, #ffd778); font-variant-numeric: tabular-nums; }
/* 좌측 정보창 하단의 작은 버리기 — 이미 가진 밀랍상도 여기서 1개씩 정리할 수 있다. */
.wax-info-discard {
  margin-top: auto;
  align-self: flex-end;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 7px;
  border: 1px solid rgba(255, 130, 130, 0.32);
  background: rgba(255, 90, 90, 0.07);
  color: rgba(255, 190, 190, 0.8);
  font-size: 12px;
  cursor: pointer;
  transition: background 0.14s ease, box-shadow 0.14s ease;
}
.wax-info-discard:hover { background: rgba(255, 90, 90, 0.18); box-shadow: 0 0 10px rgba(255, 110, 110, 0.3); }
/* 임시보관함 항목을 골랐을 때 — 안내 문구 + 담기/버리기 두 버튼이 나란히 하단에 붙는다. */
.wax-info-hold-note { margin: 0; font-size: 12px; line-height: 1.4; color: rgba(255, 233, 196, 0.5); }
.wax-info-hold-actions { margin-top: auto; align-self: flex-end; display: flex; gap: 6px; }
.wax-info-hold-actions .wax-info-discard { margin-top: 0; align-self: auto; }

/* ── 중앙 갤러리 ────────────────────────────────────────── */
.wax-gallery-scroll { min-height: 0; overflow-y: auto; scrollbar-width: thin; scrollbar-color: rgba(120, 220, 208, 0.7) transparent; }
.wax-gallery-scroll::-webkit-scrollbar { width: 4px; }
.wax-gallery-scroll::-webkit-scrollbar-thumb { background: linear-gradient(180deg, #8fe8dc, #2f8b86); border-radius: 999px; }
.wax-exhibit-grid {
  list-style: none;
  margin: 0;
  padding: 2px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(clamp(128px, 11vw, 176px), 1fr));
  grid-auto-rows: max-content;
  gap: clamp(10px, 0.9vw, 14px);
  align-content: start;
}

/* 전시 카드 — 필드 칸과 같은 비율(4:3.2)에 풀 일러스트, 도감식 아이콘 배지를 쓰지 않는다.
   더 많은 전시물을 한눈에 담아야 하므로 작게 잡는다(전시관 규모는 모달 자체가 낸다). */
.wax-exhibit-card {
  position: relative;
  aspect-ratio: 4 / 3.2;
  border-radius: 10px;
  border: 1px solid rgba(150, 226, 214, 0.26);
  background: rgba(12, 20, 30, 0.68);
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
/* 남은 자리 — 채워지지 않은 밀랍상함 용량을 투명 칸으로 보여준다. 클릭할 것이 없으니
   커서/호버 반응도 끈다. */
.wax-exhibit-card-empty {
  border-style: dashed;
  border-color: rgba(255, 215, 120, 0.16);
  background: transparent;
  cursor: default;
}
.wax-exhibit-card-empty:hover { transform: none; box-shadow: none; }
.wax-exhibit-art {
  position: absolute;
  inset: 0;
  background-size: cover;
  background-position: center 32%;
  filter: saturate(1.05) contrast(1.02);
}
/* 이로치 썸네일 — 필드 카드와 **같은 방식**으로 색조를 간다(색만 옥빛, 명암은 원본).
   여기만 hue-rotate를 쓰면 전시관과 필드에서 같은 개체가 다른 색으로 보인다. */
.wax-exhibit-card.is-shiny .wax-exhibit-art { filter: saturate(1.15) contrast(1.02); }
.wax-exhibit-card.is-shiny { isolation: isolate; }
.wax-exhibit-card.is-shiny .wax-exhibit-art::after {
  content: '';
  position: absolute;
  inset: 0;
  background: rgba(74, 226, 158, 0.5);
  mix-blend-mode: color;
}
.wax-exhibit-star {
  position: absolute;
  top: 5px;
  left: 6px;
  font-size: 12px;
  font-weight: 900;
  color: var(--color-flame, #ffd778);
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.85);
  z-index: 1;
}
.wax-exhibit-count {
  position: absolute;
  top: 5px;
  right: 6px;
  font-size: 12px;
  font-weight: 800;
  color: #fff5dc;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.85);
  z-index: 1;
}
.wax-exhibit-frame {
  position: absolute;
  left: 0; right: 0; bottom: 0;
  padding: 5px 7px 6px;
  background: linear-gradient(0deg, rgba(6, 4, 8, 0.94), rgba(6, 4, 8, 0));
  z-index: 1;
}
.wax-exhibit-name { font-size: 12px; font-weight: 800; color: #fff5dc; line-height: 1.2; }
/* 이로치 표식 — 글자('이로치')가 아니라 반짝이 아이콘 하나다. 이름 옆에 붙는 짧은
   표식이라 글자로 두면 종 이름이 밀리고, 색이 이미 이로치를 말하고 있어 글자는 중복이다. */
.wax-shiny-tag {
  display: inline-flex;
  align-items: center;
  vertical-align: -1px;
  width: 12px;
  height: 12px;
  margin-left: 4px;
  color: #7bf0ae;
  filter: drop-shadow(0 0 5px rgba(123, 240, 174, 0.6));
}
.wax-shiny-tag .icon { width: 12px; height: 12px; }

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

/* ── 우측 임시보관칸: 갤러리와 같은 카드 어휘, 더 작은 칸일 뿐이다 ─────── */
.wax-hold-panel {
  border-radius: 14px;
  border: 1px dashed rgba(255, 215, 120, 0.28);
  background: rgba(255, 210, 130, 0.03);
  padding: 12px;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow-y: auto;
}
.wax-hold-empty { margin: auto 0; text-align: center; font-size: 12px; color: rgba(255, 233, 196, 0.4); }
.wax-hold-grid { grid-template-columns: repeat(auto-fill, minmax(64px, 1fr)); gap: 8px; }
.wax-hold-card { border-color: rgba(255, 215, 120, 0.2); }
.wax-hold-card.is-shiny { border-color: rgba(120, 235, 175, 0.35); }

/* ── 하단 조합 바: 좌(합성 가능 리스트) + 우(큰 마법진) ──────────────── */
.wax-compose-bar {
  border-radius: 14px;
  border: 1px solid rgba(150, 226, 214, 0.18);
  background: linear-gradient(180deg, rgba(18, 32, 42, 0.42), rgba(8, 12, 22, 0.5));
  padding: clamp(14px, 1.6vh, 20px) clamp(18px, 1.6vw, 26px);
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.wax-compose-bar .wax-section-title { margin: 0; }
/* 여백만 남기지 않도록 이 구역의 실제 높이(260px)를 여기서 확정한다 — 자식들이
   그 높이를 나눠 쓴다(리스트는 스크롤, 마법진은 가운데 정렬). */
/* 조합 구역의 실제 높이. 화면이 커져도 이 판이 갤러리를 밀어내지 않도록 뷰포트에
   비례해 잡되 상한을 둔다 — 전시관에서 가장 넓어야 하는 곳은 갤러리다. */
.wax-compose-layout { display: flex; align-items: stretch; gap: 32px; height: clamp(190px, 24vh, 260px); }
.wax-compose-empty { margin: 0; font-size: 12px; color: rgba(200, 232, 228, 0.45); }

/* 좌측 — 지금 합성할 수 있는 조합만 골라 버튼으로 나열한다(재료가 덜 찬 조합은 여기 안 뜬다). */
.wax-compose-list-col {
  flex: 0 0 240px;
  align-self: stretch;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: rgba(244, 178, 86, 0.7) transparent;
}
.wax-compose-list-empty { margin: 0; font-size: 13px; line-height: 1.6; color: rgba(255, 233, 196, 0.42); }
.wax-compose-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.wax-compose-list-btn {
  width: 100%;
  display: grid;
  grid-template-columns: 40px 1fr auto;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border-radius: 11px;
  border: 1px solid rgba(255, 215, 120, 0.22);
  background: rgba(255, 210, 130, 0.05);
  cursor: pointer;
  text-align: left;
  transition: background 0.14s ease, border-color 0.14s ease;
}
.wax-compose-list-btn:hover { background: rgba(255, 210, 130, 0.14); }
.wax-compose-list-btn.is-active { border-color: rgba(255, 215, 120, 0.75); background: rgba(255, 210, 130, 0.2); box-shadow: 0 0 10px rgba(244, 178, 86, 0.3); }
.wax-compose-list-glyph {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  background-size: cover;
  background-position: center 32%;
  border: 1px solid rgba(255, 215, 120, 0.3);
}
.wax-compose-list-name { font-size: 13px; font-weight: 800; color: #fff5dc; line-height: 1.3; }
.wax-compose-list-star { font-size: 13px; font-weight: 900; color: var(--color-flame, #ffd778); }

/* 우측 — 마법진 무대. 구역 높이를 그대로 채워 크게 잡는다("누르고 싶게"가 목적이라
   작게 떠 있으면 안 된다). */
.wax-compose-stage { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; min-width: 0; }

/* 밀랍 조각진 — 재료 3개가 원 둘레에 놓이고 그 힘이 가운데 결과로 모이는 의식 도형.
   한 줄 슬롯 나열 대신 이 시스템의 봉인/제물 테마에 맞춘 원형 구성이다. */
.wax-compose-circle {
  position: relative;
  width: 220px;
  height: 220px;
  flex: 0 0 auto;
}
.wax-compose-ring {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 1px dashed rgba(255, 215, 120, 0.55);
  animation: wax-compose-ring-spin 26s linear infinite;
}
.wax-compose-ring-inner { inset: 26px; border-color: rgba(255, 215, 120, 0.38); animation-duration: 18s; animation-direction: reverse; }
@keyframes wax-compose-ring-spin { to { transform: rotate(360deg); } }
/* 클릭 순간의 "위잉" — 링이 빠르게 가속하며 밝아진다. JS가 짧게 붙였다 뗀다. */
.wax-compose-circle.is-merging .wax-compose-ring { animation: wax-compose-ring-spin 0.6s linear infinite; border-color: rgba(255, 225, 160, 0.95); }
.wax-compose-circle.is-merging .wax-compose-ring-inner { animation-duration: 0.42s; }
.wax-compose-circle.is-merging .wax-compose-core { animation: wax-compose-core-flash 0.6s ease-in-out; }
@keyframes wax-compose-core-flash {
  0%, 100% { filter: brightness(1); transform: scale(1); }
  50% { filter: brightness(1.7); transform: scale(1.08); }
}
@media (prefers-reduced-motion: reduce) {
  .wax-compose-ring, .wax-compose-circle.is-merging .wax-compose-core { animation: none; }
}
/* 재료 노드 3개 — 정삼각형 배치(위 / 좌하 / 우하). */
.wax-compose-node {
  position: absolute;
  width: 46px;
  height: 46px;
  border-radius: 10px;
  border: 1px solid rgba(255, 215, 120, 0.6);
  background-size: cover;
  background-position: center 32%;
  box-shadow: 0 0 10px rgba(244, 178, 86, 0.4);
  z-index: 1;
}
.wax-compose-node.is-shiny { border-color: rgba(123, 240, 174, 0.65); box-shadow: 0 0 10px rgba(123, 240, 174, 0.4); }
.wax-compose-node-1 { top: -10px; left: 50%; transform: translateX(-50%); }
.wax-compose-node-2 { bottom: 8px; left: -8px; }
.wax-compose-node-3 { bottom: 8px; right: -8px; }
/* 가운데 결과 — 재료보다 크게, 노드보다 위 레이어에 둬 조각진의 중심임을 읽게 한다.
   숨쉬듯 맥동시켜(is-pulse) 눌러 보고 싶게 만든다 — 이게 곧 합성 버튼이다. */
.wax-compose-core {
  position: absolute;
  inset: 64px;
  border-radius: 50%;
  border: 2px solid rgba(255, 215, 120, 0.7);
  background-size: cover;
  background-position: center 32%;
  box-shadow: 0 0 22px rgba(244, 178, 86, 0.35);
  z-index: 2;
  padding: 0;
  cursor: pointer;
  transition: box-shadow 0.16s ease;
}
.wax-compose-core.is-pulse { animation: wax-compose-core-pulse 2.2s ease-in-out infinite; }
@keyframes wax-compose-core-pulse {
  0%, 100% { transform: scale(1); box-shadow: 0 0 16px rgba(244, 178, 86, 0.32); }
  50% { transform: scale(1.06); box-shadow: 0 0 28px rgba(244, 178, 86, 0.55); }
}
.wax-compose-core.is-shiny { border-color: rgba(123, 240, 174, 0.75); box-shadow: 0 0 18px rgba(123, 240, 174, 0.4); }
.wax-compose-core.is-shiny.is-pulse { animation-name: wax-compose-core-pulse-shiny; }
@keyframes wax-compose-core-pulse-shiny {
  0%, 100% { transform: scale(1); box-shadow: 0 0 16px rgba(123, 240, 174, 0.35); }
  50% { transform: scale(1.06); box-shadow: 0 0 28px rgba(123, 240, 174, 0.6); }
}
.wax-compose-core:hover { box-shadow: 0 0 24px rgba(244, 178, 86, 0.55); }
.wax-compose-core.is-shiny:hover { box-shadow: 0 0 24px rgba(123, 240, 174, 0.55); }
@media (prefers-reduced-motion: reduce) {
  .wax-compose-core.is-pulse { animation: none; }
}
.wax-compose-core-star {
  position: absolute;
  bottom: -10px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 13px;
  font-weight: 900;
  color: #140d08;
  background: var(--color-flame, #ffd778);
  border-radius: 999px;
  padding: 3px 10px;
  white-space: nowrap;
}
.wax-compose-result-label { margin: 0; font-size: 13px; line-height: 1.4; color: rgba(255, 233, 196, 0.75); text-align: center; }
.wax-compose-result-label b { color: var(--color-flame, #ffd778); font-variant-numeric: tabular-nums; }

/* 합성 결과가 마법진에서 튀어나와 갤러리의 새 칸으로 날아가 꽂히는 토큰. */
.wax-compose-flight {
  position: fixed;
  top: 0;
  left: 0;
  border-radius: 10px;
  border: 1px solid rgba(255, 215, 120, 0.7);
  background-size: cover;
  background-position: center 32%;
  box-shadow: 0 0 20px rgba(244, 178, 86, 0.5);
  z-index: 10600;
  pointer-events: none;
  will-change: transform, opacity;
}
.wax-compose-flight.is-shiny { border-color: rgba(123, 240, 174, 0.75); box-shadow: 0 0 20px rgba(123, 240, 174, 0.5); }

/* 필드에서부터 보이는 이로치 후보 — 밀랍상 탭과 같은 옥빛 **개체**로 보여야 한다.
   "빛난다"가 아니라 "색이 다르다"가 이로치의 말이다.

   색을 바꾸는 방법으로 hue-rotate를 쓰지 않는다: 결과가 원본 색에 따라 제각각이라
   키틴은 청록, 거미는 보라 하는 식으로 적마다 다른 색이 나와 '이로치'라는 규칙이 안 읽힌다.
   대신 옥빛 판을 mix-blend-mode: color 로 얹어 **명암은 원본 그대로 두고 색조만** 갈아끼운다 —
   어떤 적이든 같은 옥빛 개체가 되고, 밀랍 질감도 살아 있다(불투명하게 채우면 일러스트가
   사라진다는 규칙과 같은 이유로 블렌드를 쓴다). */
.cell.card.is-wax-figure-shiny .card-art {
  /* 색조를 갈기 전에 채도를 올려 둔다 — 원본이 무채색에 가까우면 color 블렌드가 먹지 않는다.
     밝기도 함께 올린다: color 블렌드는 명도를 원본에서 그대로 가져오므로, 어두운 밀랍
     일러스트에 그냥 얹으면 옥빛이 아니라 탁한 이끼색으로 가라앉는다. */
  filter: saturate(1.25) brightness(1.1) contrast(1.03);
}
/* 색조 판은 자기 엘리먼트를 갖는다 — .card-face 의사요소는 굳음 연출이 이미 쓴다.
   isolation: isolate 로 블렌드를 카드 안에 가둔다(밖으로 새면 레일 배경까지 물든다). */
.cell.card.is-wax-figure-shiny .card-face { isolation: isolate; }
.card-shiny-tint {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  border-radius: inherit;
  background: rgba(74, 226, 158, 0.55);
  mix-blend-mode: color;
  animation: wax-figure-shiny-tint 2.4s ease-in-out infinite;
}
/* 색조만으로는 평평해 보여서 얕은 광택을 하나 얹어 입체를 돌려준다. */
.card-shiny-tint::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: radial-gradient(120% 80% at 50% 18%, rgba(163, 255, 214, 0.34), transparent 62%);
  mix-blend-mode: screen;
}
/* 글자/수치는 색조 판(z-index 1) 위에 이미 있다(.card-content 는 z-index 2).
   여기서 position 을 건드리면 안 된다 — .card-content 는 absolute + space-between 으로
   이름을 위, 수치를 아래에 붙이고 있어서 relative 로 바꾸면 수치가 이름 밑으로 딸려 올라간다. */
.cell.card.is-wax-figure-shiny {
  border-color: rgba(123, 240, 174, 0.7);
  box-shadow: 0 0 14px rgba(123, 240, 174, 0.4);
}
/* 이름 옆 반짝이 — 색맹/저채도 화면에서도 변종임이 글자 층에서 확정된다. */
.card-shiny-mark {
  display: inline-flex;
  align-items: center;
  margin-left: 3px;
  width: 0.82em;
  height: 0.82em;
  color: #a3ffd6;
  filter: drop-shadow(0 0 4px rgba(123, 240, 174, 0.9));
  animation: wax-figure-shiny-pulse 2.4s ease-in-out infinite;
}
.card-shiny-mark svg { width: 100%; height: 100%; }
@keyframes wax-figure-shiny-tint {
  0%, 100% { opacity: 0.72; }
  50%      { opacity: 0.92; }
}
@keyframes wax-figure-shiny-pulse {
  0%, 100% { opacity: 0.6; }
  50%      { opacity: 1; }
}
`
