/**
 * 게임오버/클리어 정산 오버레이 + 메타 잠금 전역 스타일.
 * index.ts가 부팅 시 <style>로 1회 주입한다 — 규칙을 옮기거나 더할 때는 이 파일만 고친다.
 */
export const GAME_OVER_GLOBAL_STYLES = `
  .game-over-overlay {
    position: fixed;
    inset: 0;
    background: rgba(8, 5, 14, 0.82);
    backdrop-filter: blur(6px);
    display: flex;
    align-items: center;
    justify-content: center;
    /* 콤보 게이지 휠(z-index 120)·셔터(470) 등 모든 보드 오버레이 위를 덮어야 패배 화면에서
       콤보 버튼이 튀어나오지 않는다. */
    z-index: 1000;
    animation: fade-in 0.3s ease;
    padding: 16px;
  }
  @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
  /* 클리어/사망 창(.is-clear): 카드 박스 없이 '검은 비네트 블러 오버레이' 위에 글자만 얹는다.
     - 비네트: 가장자리 어둡게 / 가운데는 조금 더 밝고 투명(뒤 게임이 흐릿하게 비침).
     - 검은 오버레이가 조용히(0.9s) 페이드인. */
  .game-over-overlay.is-clear {
    animation: clear-veil-in 0.9s ease both;
    /* 판정 화면은 뒤 게임이 어렴풋이만 남도록 전체적으로 짙게 깐다 — 글자 발광이 더 선다. */
    background:
      radial-gradient(ellipse 92% 82% at 50% 44%, rgba(9, 6, 14, 0.62) 0%, rgba(5, 3, 10, 0.84) 50%, rgba(1, 0, 4, 0.97) 100%);
    backdrop-filter: blur(9px);
    /* 내용이 뷰포트보다 길어지면 flex 중앙정렬이 위쪽(헤드라인)을 잘라먹는다 —
       스크롤을 허용하고 카드가 margin:auto로 '안전 중앙정렬'되게 해 제목이 잘리지 않게 한다. */
    overflow-y: auto;
    padding: clamp(20px, 4vh, 40px) 16px;
  }
  @keyframes clear-veil-in { from { opacity: 0; } to { opacity: 1; } }
  @keyframes clear-card-rise { from { opacity: 0; transform: translateY(18px) scale(0.99); } to { opacity: 1; transform: translateY(0) scale(1); } }
  /* 카드 박스(배경/테두리/그림자) 제거 → 검은 오버레이 위 텍스트만. 가운데 크게, 요소별 여백 넉넉히. */
  .game-over-overlay.is-clear .game-over-card {
    background: none;
    border: none;
    box-shadow: none;
    padding: 0;
    max-width: min(780px, 94vw);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: clamp(18px, 3.4vh, 34px);
    animation: clear-card-rise 0.8s cubic-bezier(0.2, 0.84, 0.3, 1) 0.18s both;
    /* 오버플로 시에도 위/아래가 잘리지 않는 flex 중앙정렬(align-items:center 대체). */
    margin: auto;
  }
  /* 판정 헤드라인: 촛불 아이콘 없이 'Melting / Unmelting' 한 단어로. 밀랍이 흐르는 느낌의
     세로 그라디언트로 글자를 채우고(아래로 갈수록 옅어짐 = 녹아내림), drop-shadow로 발광한다.
     text-shadow는 background-clip:text 투명 채움과 함께 렌더되지 않으므로 발광은 filter로 준다. */
  .game-over-overlay.is-clear .verdict-word {
    margin: 0;
    /* 번들 폰트(OkDanDan)를 우선 적용 — Georgia는 미탑재 환경(리눅스/안드로이드)에서 시스템
       serif로 떨어져 헤드라인 인상이 흔들린다. 이탤릭 900은 합성 기울임으로 유지된다. */
    font: italic 900 clamp(52px, 12.5vh, 118px)/1.04 'OkDanDan', Georgia, 'Times New Roman', serif;
    letter-spacing: 0.015em;
    /* 이탤릭 마지막 글자의 기울어진 획이 인라인 박스 밖으로 나가 잘리지 않게 소폭 여유를 준다. */
    padding: 0 0.06em;
    background-clip: text;
    -webkit-background-clip: text;
    color: transparent;
    -webkit-text-fill-color: transparent;
  }
  /* 사망 = 소녀가 녹았다 → 차가운 남보라, 아래로 갈수록 투명하게 흘러내리는 밀랍. */
  .game-over-overlay.is-clear .verdict-melting {
    background-image: linear-gradient(178deg, #efe9ff 0%, #cabff0 38%, #9585cc 72%, rgba(118, 104, 168, 0.28) 100%);
    animation: verdict-melting-glow 3.4s ease-in-out infinite;
  }
  /* 승리 = 끝내 녹지 않았다 → 따뜻한 촛불 금빛, 아래는 깊은 호박색으로 단단히. */
  .game-over-overlay.is-clear .verdict-unmelting {
    background-image: linear-gradient(178deg, #fff4d2 0%, #ffd472 44%, #f0a83a 80%, #d17f28 100%);
    animation: verdict-unmelting-glow 3.4s ease-in-out infinite;
  }
  @keyframes verdict-melting-glow {
    0%, 100% { filter: drop-shadow(0 0 16px rgba(150, 130, 224, 0.42)) drop-shadow(0 8px 30px rgba(14, 8, 30, 0.9)); }
    50%      { filter: drop-shadow(0 0 30px rgba(168, 148, 240, 0.72)) drop-shadow(0 8px 30px rgba(14, 8, 30, 0.9)); }
  }
  @keyframes verdict-unmelting-glow {
    0%, 100% { filter: drop-shadow(0 0 18px rgba(255, 190, 96, 0.46)) drop-shadow(0 8px 30px rgba(36, 18, 4, 0.86)); }
    50%      { filter: drop-shadow(0 0 34px rgba(255, 206, 120, 0.78)) drop-shadow(0 8px 30px rgba(36, 18, 4, 0.86)); }
  }
  /* 한글 부제: 헤드라인 아래 작고 차분하게 — 무엇을 이뤘/잃었는지 한 줄로. */
  .game-over-overlay.is-clear .verdict-sub {
    margin: 0;
    font-size: clamp(14px, 2.3vh, 20px);
    letter-spacing: 0.03em;
    color: rgba(222, 212, 240, 0.74);
    text-shadow: 0 2px 12px rgba(0, 0, 0, 0.85);
  }
  .game-over-overlay.is-clear .death-card .verdict-sub { color: rgba(210, 200, 232, 0.72); }
  .game-over-overlay.is-clear .death-tip { margin: 0; }
  .game-over-overlay.is-clear .settlement-body { margin: 0; gap: clamp(26px, 3.4vw, 48px); align-items: center; }
  .game-over-overlay.is-clear .settlement-stats p { margin: 0 0 clamp(7px, 1.1vh, 11px); }
  .game-over-overlay.is-clear .settlement-ena { margin: 0 0 6px; }
  /* 시작 액션: 버튼이 아니라 '발광 글자'. 크고 굵게, 촛불처럼 숨쉬는 맥동으로 시선을 끈다. */
  .game-over-overlay.is-clear .primary-btn {
    background: none;
    border: none;
    box-shadow: none;
    padding: 0;
    margin-top: clamp(16px, 4vh, 40px);
    color: rgba(255, 232, 170, 0.96);
    font: 900 clamp(26px, 4.4vh, 42px)/1 'OkDanDan', Georgia, serif;
    letter-spacing: 0.2em;
    text-shadow: 0 3px 14px rgba(0, 0, 0, 0.9), 0 0 16px rgba(244, 164, 96, 0.32);
    animation: restart-breathe 2.4s ease-in-out infinite;
    will-change: transform, text-shadow;
    transition: color 0.2s ease;
  }
  /* 숨쉬는 맥동 — 크기와 발광이 함께 차오르고 가라앉는다. */
  @keyframes restart-breathe {
    0%, 100% {
      transform: scale(1);
      text-shadow: 0 3px 14px rgba(0, 0, 0, 0.9), 0 0 14px rgba(244, 164, 96, 0.3);
    }
    50% {
      transform: scale(1.08);
      text-shadow: 0 4px 18px rgba(0, 0, 0, 0.92), 0 0 34px rgba(255, 206, 120, 0.85), 0 0 64px rgba(255, 190, 96, 0.4);
    }
  }
  .game-over-overlay.is-clear .primary-btn:hover {
    animation: none;
    transform: scale(1.18);
    color: rgba(255, 244, 200, 1);
    text-shadow: 0 4px 18px rgba(0, 0, 0, 0.92), 0 0 38px rgba(255, 210, 130, 0.9), 0 0 70px rgba(255, 190, 96, 0.5);
  }
  .game-over-overlay.is-clear .primary-btn:active { animation: none; transform: scale(1.08); }
  .game-over-card {
    text-align: center;
    background: linear-gradient(160deg, rgba(31, 24, 48, 0.95), rgba(20, 16, 28, 0.95));
    padding: 28px 36px;
    border: 1px solid var(--color-flame-warm);
    border-radius: 16px;
    box-shadow: 0 0 40px rgba(244, 164, 96, 0.2);
    max-width: 360px;
    width: 100%;
  }
  .game-over-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--color-flame);
    font-size: 48px;
    line-height: 1;
    filter: drop-shadow(0 0 12px rgba(255, 215, 120, 0.5));
    margin-bottom: 8px;
  }
  .game-over-icon .icon { width: 1em; height: 1em; }
  .game-over-card h1 {
    font-size: var(--font-size-lg);
    color: var(--color-flame);
    margin-bottom: 6px;
    font-weight: 600;
  }
  .game-over-card p {
    color: var(--color-text-muted);
    font-size: var(--font-size-base);
    margin-bottom: 20px;
  }
  .primary-btn {
    padding: 10px 22px;
    background: linear-gradient(180deg, var(--color-flame-warm), var(--color-flame-deep));
    border: 1px solid var(--color-flame);
    color: var(--color-text-dark);
    font-weight: 700;
    font-size: var(--font-size-base);
    border-radius: 999px;
    cursor: pointer;
    transition: transform 0.15s ease, box-shadow 0.15s ease;
    font-family: inherit;
  }
  .primary-btn:hover {
    transform: translateY(-1px);
    box-shadow: 0 6px 18px rgba(244, 164, 96, 0.4);
  }
  .primary-btn:active { transform: translateY(0); }
  /* ── 새싹 병아리 클리어 정산 화면 ── */
  .settlement-card { max-width: 460px; }
  .settlement-body {
    display: flex;
    gap: 20px;
    align-items: center;
    justify-content: center;
    flex-wrap: wrap;
    margin-bottom: 18px;
  }
  .settlement-stats { text-align: left; }
  .settlement-card .settlement-stats p {
    margin-bottom: 6px;
    font-size: var(--font-size-base);
    color: var(--color-text-muted);
  }
  .settlement-stats strong { color: var(--color-flame); font-weight: 700; }
  .settlement-ena-panel { display: flex; flex-direction: column; align-items: center; }
  .settlement-card .settlement-ena {
    margin-bottom: 2px;
    color: var(--color-flame-warm);
    font-size: 13px;
  }
  /* 컴팩트 육각형 — 경험 모달보다 작게(정산 카드 폭에 맞춤). */
  .settlement-constellation { width: min(196px, 54vw); margin-top: 2px; }
  /* 육각형 아래 '이번 런 상승분' 한 줄 요약 — 오른 축 이름과 +%p를 그대로 읽어 준다. */
  .settlement-growth-note {
    margin: 8px 0 0;
    font-size: 12px;
    letter-spacing: 0.04em;
    color: rgba(255, 224, 158, 0.88);
    text-shadow: 0 1px 6px rgba(0, 0, 0, 0.85);
  }
  /* 사망 정산 카드 — 클리어와 같은 레이아웃이되 차분한 남보라 톤 + '다음에 주의' 팁. */
  .death-card h1 { color: rgba(198, 186, 230, 0.95); }
  .death-card .game-over-icon { color: rgba(176, 166, 214, 0.9); filter: drop-shadow(0 0 12px rgba(150, 140, 200, 0.4)); }
  .death-card .death-tip {
    margin: 0 auto 16px;
    max-width: 30em;
    font-size: 13px;
    line-height: 1.5;
    color: rgba(226, 204, 168, 0.82);
  }
  /* ── 메타 시스템 잠금: 온보딩 또는 무역 미개방 시 숨긴다(로비·인게임 공통) ──
     화폐 패널·상점 리롤(유물/카드팩)·의뢰 시설은 무역 1번 탭에서 개방된다(isMetaUnlocked). */
  body.meta-currency-locked .coin-panel-total { display: none !important; }
  body.meta-reroll-locked .shop-reroll-btn,
  body.meta-reroll-locked .shop-pack-picker-reroll-btn { display: none !important; }
  body.meta-quests-locked .quest-list { display: none !important; }
  /* 무료 카드/수당 미개방: 상점 무료 레이어를 숨기고, 좌측 여백만큼 카드팩을 가운데로 옮긴다. */
  body.meta-freecard-locked .shop-free-layer { display: none !important; }
  body.meta-freecard-locked .shop-bottom-row { grid-template-columns: 1fr !important; }
  body.meta-freecard-locked .shop-pack-layer { transform: translateY(clamp(-8px, -0.6vh, -4px)) !important; }
`
