/**
 * Player zone, utility layers, shop shutter, relic shop cards, and responsive layout styling.
 * Split from GameBoardRenderer so renderer logic stays navigable.
 */
export const GAME_BOARD_PLAYER_SHOP_STYLES = `
/* ---------- Player Card + transparent utility layers ---------- */
.player-zone {
  display: grid;
  grid-template-columns: minmax(88px, 0.7fr) auto minmax(88px, 0.7fr);
  align-items: end;
  justify-items: center;
  gap: clamp(8px, 1.4vw, 18px);
  min-height: 0;
}
.utility-layer {
  width: 100%;
  min-height: clamp(92px, 14vh, 140px);
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 14px;
  background: rgba(8, 5, 14, 0.12);
  backdrop-filter: blur(1px);
}
.utility-layer-left {
  justify-content: flex-end;
  padding-right: clamp(4px, 0.8vw, 10px);
}
.relic-layer {
  justify-content: center;
  padding-left: clamp(2px, 0.4vw, 6px);
  overflow: visible;
}
.relic-plan-label {
  max-width: 104px;
  color: rgba(255, 232, 168, 0.46);
  border: 1px dashed rgba(255, 232, 168, 0.18);
  border-radius: 999px;
  padding: 6px 9px;
  font-size: 12px;
  text-align: center;
  line-height: 1.2;
}
/* Legacy thumbnail-style .relic-stack/.relic-mini-card/.relic-mini-art rules
   were removed: owned relics now render as the fanned preview cards defined in
   GameBoardPlayerRelicTrapStyles. The shared class names meant the old
   .relic-mini-card:hover{transform} here overrode the fan card's centering
   transform, yanking the hovered relic sideways. */
.player-row {
  display: flex;
  justify-content: center;
  align-items: end;
}

/* ---------- Shop shutter + dim veil + modal ---------- */
.rail.is-shop-quaking {
  animation: shop-rail-quake 0.52s cubic-bezier(0.18, 0.9, 0.24, 1);
}
/* Wax shutter restored to the original 9-panel parchment drape (per
   feedback to roll the closure animation back). A separate semi-
   transparent black "dim veil" descends ON TOP of the shutter
   sequentially — that's the .shop-dim-veil layer inside the shell. */
.rail-shutter {
  position: absolute;
  inset: 0;
  z-index: 35;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(3, 1fr);
  gap: clamp(7px, 1vw, 12px);
  padding: clamp(7px, 1vw, 12px);
  pointer-events: none;
}
.rail-shutter span {
  position: absolute;
  left: var(--shutter-cell-x, 0);
  top: var(--shutter-cell-y, 0);
  width: var(--shutter-cell-w, 0);
  height: var(--shutter-cell-h, 0);
  border-radius: 8px 8px 14px 14px;
  background:
    radial-gradient(ellipse 80% 35% at 50% 100%, rgba(244, 164, 96, 0.32), transparent 70%),
    radial-gradient(circle at 18% 18%, rgba(0, 0, 0, 0.45), transparent 38%),
    repeating-linear-gradient(
      125deg,
      rgba(255, 232, 168, 0.08) 0 3px,
      rgba(0, 0, 0, 0.25) 3px 9px
    ),
    linear-gradient(180deg, rgba(120, 64, 28, 0.72) 0%, rgba(48, 24, 14, 0.92) 35%, rgba(20, 10, 14, 0.98) 100%);
  border: 1px solid rgba(180, 110, 52, 0.46);
  box-shadow:
    inset 0 1px 0 rgba(255, 232, 168, 0.18),
    inset 0 -10px 16px rgba(0, 0, 0, 0.55),
    0 10px 22px rgba(0, 0, 0, 0.6);
  transform: translateY(-120%) scaleY(0.82);
  transform-origin: top;
  animation: shop-shutter-drop 0.52s cubic-bezier(0.18, 0.86, 0.22, 1) forwards;
  animation-delay: calc(var(--shutter-i) * 36ms);
  overflow: hidden;
}
/* Size/position now comes from measured rail cell bounds, so no manual taper. */
.rail-shutter span::before {
  content: '';
  position: absolute;
  top: 4px;
  left: 50%;
  width: 8px;
  height: 8px;
  margin-left: -4px;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, #ffd778, #c44a1c 70%, #58140c 100%);
  box-shadow: 0 0 6px rgba(255, 188, 96, 0.55);
}
.rail-shutter span::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: -4px;
  height: 8px;
  background: radial-gradient(ellipse 70% 90% at 50% 0%, rgba(244, 164, 96, 0.38), transparent 72%);
  pointer-events: none;
}
.rail-shutter.is-closed span {
  transform: translateY(0) scaleY(1);
}
.rail-shutter.is-persistent span {
  animation: none;
  opacity: 1;
  transform: translateY(0) scaleY(1);
}
.rail-shutter.is-opening span {
  animation: shop-shutter-open 0.42s cubic-bezier(0.42, 0, 0.24, 1) forwards;
  animation-delay: calc(var(--shutter-i) * 18ms);
}
/* In-rail shop overlay. Body-mounted but pointer-transparent, so the score
   panel, hand panel and player card stay readable AND interactive for
   non-game actions (hover previews, compendium). The actual shop shell is
   re-anchored over the rail's bounding rect in JS. */
.shop-overlay {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: none;
  pointer-events: none;
  background: transparent;
}
.shop-overlay.is-open {
  display: block;
}
.shop-shell {
  /* Absolute inside .shop-overlay (position:fixed;inset:0) so the shell is
     positioned relative to the overlay, not the viewport. This avoids the
     backdrop-filter containing-block trap: position:fixed descendants of any
     element with backdrop-filter are re-contained inside it (e.g. .rail has
     backdrop-filter:blur(2px) which would pin a fixed shell to the rail column). */
  position: absolute;
  pointer-events: auto;
  background: transparent;
  border: 0;
  box-shadow: none;
  /* Keep shell padding values in vars so overlay children can share exact insets. */
  --shop-shell-pad-top: clamp(14px, 1.6vh, 22px);
  --shop-shell-pad-x: clamp(16px, 2vw, 28px);
  --shop-shell-pad-bottom: clamp(18px, 2.2vh, 26px);
  box-sizing: border-box;
  overflow: visible;
  /* Keep current position and descend with its host context instead of popping in. */
  animation: none;
}

/* 셔터/일러스트 veil 이후 카드팩 베일과 같은 텀(≈2.62s) 뒤에
   상점/제단의 모든 상호작용 UI가 한 번에 열리도록 묶음 레이어를 둔다. */
.shop-content-bundle {
  /* NOTE: must be a real container (not display:contents) so opacity/transform
     can gate ALL shop/altar controls as one synchronized reveal layer. */
  position: absolute;
  /* Keep wrapped controls exactly where they were before bundling by matching shell padding. */
  inset:
    var(--shop-shell-pad-top)
    var(--shop-shell-pad-x)
    var(--shop-shell-pad-bottom)
    var(--shop-shell-pad-x);
  z-index: 1;
  display: grid;
  /* Keep the bundle's internal track math identical to pre-wrapper layout so
     top/bottom rows stay anchored to their original rail positions. */
  grid-template-rows: minmax(0, 1fr) minmax(0, 1fr);
  gap: clamp(10px, 1.4vh, 16px);
  align-items: stretch;
  min-height: 0;
  height: 100%;
  opacity: 0;
  transform: translateY(8px) scale(0.992);
  filter: saturate(0.88);
  transition:
    opacity 0.42s cubic-bezier(0.18, 0.86, 0.22, 1) 2620ms,
    transform 0.42s cubic-bezier(0.18, 0.86, 0.22, 1) 2620ms,
    filter 0.42s cubic-bezier(0.18, 0.86, 0.22, 1) 2620ms;
}
.shop-overlay.is-open .shop-content-bundle {
  opacity: 1;
  transform: translateY(0) scale(1);
  filter: saturate(1);
}
.shop-shell.is-closing .shop-content-bundle {
  opacity: 0;
  transform: translateY(-16px) scale(0.984);
  filter: saturate(0.82);
  transition-delay: 0ms, 0ms, 0ms;
}
.shop-shell.is-closing .shop-dim-veil {
  animation: shop-dim-veil-lift 0.34s cubic-bezier(0.22, 0.86, 0.22, 1) 90ms both;
}
/* Dim veil — full shop backdrop that descends AFTER the wax shutter.
   background_002.webp (parchment + candles) replaces the old CSS gradient. */
.shop-dim-veil {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  border-radius: 6px;
  background-image: var(--shop-veil-bg);
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  transform: scaleY(0);
  transform-origin: top;
  animation: shop-dim-veil-drop 0.42s cubic-bezier(0.22, 0.86, 0.22, 1) both;
  opacity: 0.72;
  box-shadow:
    inset 0 0 0 1px rgba(255, 232, 168, 0.14),
    inset 0 0 0 2px rgba(18, 12, 24, 0.88),
    inset 0 0 70px rgba(0, 0, 0, 0.82),
    inset 0 0 180px rgba(0, 0, 0, 0.75),
    inset 0 0 240px 36px rgba(0, 0, 0, 0.9);
}

/* Layered shop layout:
   - Top : reroll button (2) + artifact layer (8)   ← reroll moved LEFT
   - Bottom: free-card layer (3) + pack layer (7)
   Each layer just MARKS an area with a subtle dark wash — no border, no
   constraint on the cards' size. Cards keep fixed widths and can visually
   extend past the layer's boundary; the layer is a hint, not a frame. */
.shop-row {
  position: relative;
  z-index: 0;
  display: grid;
  gap: clamp(10px, 1.4vw, 18px);
  align-items: stretch;
  min-height: 0;
  overflow: visible;
}
/* 리롤 버튼은 artifact-layer 안으로 이동했으므로 reroll-zone 좌측 셀은 빈 ghost다.
   단일 컬럼으로 전환해 유물 3장+리롤 묶음이 shell 중앙에 오도록 한다. */
.shop-top-row    { grid-template-columns: 1fr; }
.shop-bottom-row { grid-template-columns: 3fr 7fr; }

.shop-layer {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: clamp(8px, 1.2vw, 16px);
  padding: clamp(6px, 0.8vh, 10px) clamp(8px, 1vw, 14px);
  border-radius: 10px;
  /* 기본 레이어는 완전 투명: 상점 실루엣은 셔터/배경이 맡고 카드 일러스트만 드러낸다. */
  background: transparent;
  min-height: 0;
  overflow: visible; /* cards can extend past the layer edges by design */
}
.shop-artifact-layer {
  justify-content: center;
  gap: clamp(12px, 1.5vw, 20px);
  padding-left: clamp(8px, 1.3vw, 16px);
  padding-right: clamp(8px, 1.3vw, 16px);
}
/* 제단 유물 3장 레이어는 요청사항대로 광학 중심을 더 정확히 맞추고 카드 판독 크기를 소폭 확장한다. */
.shop-shell[data-shop-mode="altar"] .shop-artifact-layer {
  /* 제단 유물 3장은 중앙 정렬이 더 또렷하게 보이도록 전체 클러스터를
     조금 더 안쪽으로 모으고 간격은 과도하게 벌어지지 않게 고정한다. */
  transform: translateX(clamp(-1px, -0.12vw, 0px));
  gap: clamp(16px, 1.9vw, 26px);
}
.shop-shell[data-shop-mode="altar"] .shop-artifact-layer .shop-relic-card {
  /* 요청사항: 제단 상단 유물 카드 가독성을 위해 기본 대비 소폭 확대. */
  width: clamp(140px, 13.4vw, 206px);
}

/* Forced trial uses the same shell/content grammar as shop so shutter rhythm
   and card reveal feel identical to the standard rail interruption flow. */
.shop-shell--trial .shop-top-row {
  grid-template-columns: 1fr;
}
/* 시련 트레이는 상점 유물 layer를 그대로 활용해 중앙에 카드 3장이 균등 배치된다.
   시련 단계에서 카드 자체가 시각의 중심이 되도록 트레이 전체를 화면 중앙으로
   강조한다(가로/세로 가운데 정렬 + 넉넉한 gap). */
.shop-shell--trial {
  display: block;
}
/* content-bundle: 패딩 inset을 최소화해 카드가 패널을 최대로 채운다.
   2행 grid → 1행으로 축소해 하단 빈 행이 높이를 잡아먹지 않게 한다. */
.shop-shell--trial .shop-content-bundle {
  inset: clamp(6px, 0.8vh, 10px) clamp(8px, 1vw, 14px) !important;
  grid-template-rows: 1fr !important;
  display: grid !important;
  align-items: stretch !important;
}
.shop-shell--trial .shop-row.shop-top-row {
  display: flex;
  align-items: stretch;
  height: 100%;
}
/* 3-column grid: 각 카드가 패널 너비의 정확히 1/3을 차지. */
.shop-shell--trial .shop-trial-layer {
  display: grid !important;
  grid-template-columns: repeat(3, 1fr) !important;
  align-items: center !important;
  height: 100% !important;
  width: 100% !important;
  padding: clamp(8px, 1vh, 14px) clamp(10px, 1.2vw, 16px) !important;
  gap: clamp(10px, 1.4vw, 16px) !important;
  background: transparent;
  border: none;
  box-shadow: none;
}
/* 시련 dim veil을 일반 상점/제단보다 한 톤 더 죽여 시련 단계의 무게감을 살린다. */
.shop-shell--trial .shop-dim-veil {
  filter: brightness(0.72) saturate(0.95);
}
/* 시련 종료 시 veil을 유지해 카드가 날아가는 동안 셔터가 보이지 않게 한다.
   closeShop()이 is-open을 제거하는 순간 overlay 자체가 사라지므로 veil lift는 불필요. */
.shop-shell--trial.is-closing .shop-dim-veil {
  animation: none;
}
/* ────────────────────── 시련 카드 전용 스타일 ──────────────────────
   - 뱃지 없음. 황금 구분선은 일러스트↔이름 경계(art border-bottom)에만.
   - 색감: 위협적인 심적색/흑자 계열. 폰트 OkDanDan 명시. */
.shop-shell--trial .shop-trial-card {
  /* grid 1fr column을 꽉 채운다. height는 aspect-ratio(3/4)가 결정. */
  width: 100% !important;
  height: auto !important;
  /* 패널 높이를 넘지 않도록 보정 */
  max-height: 98% !important;
  flex: none !important;
  transition: scale 0.18s ease, box-shadow 0.22s ease, filter 0.18s ease;
}
.shop-shell--trial .shop-trial-card:hover,
.shop-shell--trial .shop-trial-card:focus-visible {
  scale: 1.04;
  filter: brightness(1.07);
}
/* 시련 front face — 상단 62% 일러스트 / 하단 38% 본문 */
.shop-trial-front {
  grid-template-rows: 62% 1fr !important;
  /* 심적색 테두리 — 위협적인 다크 크림슨 */
  border-color: rgba(140, 30, 30, 0.72) !important;
  background: linear-gradient(180deg,
    rgba(22, 8, 12, 0.98) 0%,
    rgba(12, 4, 8, 0.99) 100%) !important;
  box-shadow:
    inset 0 1px 0 rgba(200, 80, 60, 0.14),
    0 18px 40px rgba(0, 0, 0, 0.75),
    0 0 0 1px rgba(100, 20, 20, 0.35) !important;
}
/* 일러스트 — 구분선은 border-bottom으로 대체 */
.shop-trial-art {
  background-position: center 15% !important;
  /* 일러스트 하단에서 배경색으로 자연스럽게 흡수 */
  box-shadow: inset 0 -56px 64px rgba(12, 4, 8, 0.88) !important;
  /* 황금 구분선: art와 body 사이 경계선 */
  border-bottom: 1px solid rgba(160, 90, 40, 0.55) !important;
}
/* 본문 영역 — 좌우하단 여백 충분히 */
.shop-trial-body {
  padding: 14px 18px 20px !important;
  gap: 8px !important;
}
/* 제목 */
.shop-trial-title {
  font-family: 'OkDanDan', Georgia, serif !important;
  font-size: clamp(18px, 2.3vh, 24px) !important;
  font-weight: 900 !important;
  letter-spacing: 0.05em !important;
  /* 위협적인 암적색 톤 — 금색보다 차갑게 */
  color: rgba(240, 190, 150, 0.96) !important;
  text-shadow:
    0 1px 4px rgba(0, 0, 0, 0.95),
    0 0 16px rgba(160, 40, 20, 0.22) !important;
}
/* 효과 설명 */
.shop-trial-effect {
  font-family: 'OkDanDan', Georgia, serif !important;
  font-size: clamp(12px, 1.65vh, 15px) !important;
  line-height: 1.65 !important;
  text-align: left !important;
  /* 차갑고 탁한 회백색 — 금빛보다 위협적인 느낌 */
  color: rgba(200, 185, 170, 0.82) !important;
}
/* 시련 카드 등장 타이밍 — 순차 진입 */
.shop-shell--trial .shop-trial-layer > .shop-trial-card:nth-child(1) { animation-delay: 380ms, 1.0s; }
.shop-shell--trial .shop-trial-layer > .shop-trial-card:nth-child(2) { animation-delay: 520ms, 2.1s; }
.shop-shell--trial .shop-trial-layer > .shop-trial-card:nth-child(3) { animation-delay: 660ms, 3.0s; }
.shop-pack-layer {
  justify-content: center;
  gap: clamp(6px, 0.72vw, 10px);
  /* Match the relic row's optical center while keeping button anchors fixed.
     translateY로 약간 위로 올려 시각 무게중심을 레일 중앙에 가깝게 맞춘다. */
  transform: translateX(clamp(-22px, -2vw, -12px)) translateY(clamp(-8px, -0.6vh, -4px));
  background: transparent;
  border: none;
  box-shadow: none;
}
.shop-reroll-zone {
  /* Ghost cell — reroll button lives inside .shop-artifact-layer now. */
  display: none;
}
.shop-free-layer {
  justify-content: center;
}
.shop-free-layer {
  transform: translate(clamp(18px, 1.8vw, 26px), clamp(-8px, -0.7vh, -4px));
}
/* 무료카드 2장은 보유 유물 부채꼴과 같은 톤으로 겹쳐 배치한다.
   (좌/우 오프셋 + 반대 각도) */
.shop-free-layer > .shop-relic-card:nth-child(1) {
  transform: translateX(clamp(12px, 1vw, 18px)) rotate(-7deg);
  z-index: 2;
}
.shop-free-layer > .shop-relic-card:nth-child(2) {
  transform: translateX(clamp(-12px, -1vw, -18px)) rotate(7deg);
  z-index: 1;
}
/* 무료카드 hover는 부채꼴 배치를 유지하되 기울기만 풀고 살짝 확대한다. */
.shop-free-layer > .shop-relic-card:hover,
.shop-free-layer > .shop-relic-card:focus-visible {
  /* 진입은 계속 돌리고 유영만 멈춘다(커서 위 등장 시 투명 고착 방지). */
  animation-play-state: running, paused;
  /* hover 시에는 부채꼴 각도만 펴고 살짝 확대해 선택 가능 상태를 강조한다. */
  scale: 1.06;
  z-index: 7;
}
.shop-free-layer > .shop-relic-card:nth-child(1):hover,
.shop-free-layer > .shop-relic-card:nth-child(1):focus-visible {
  transform: translateX(clamp(12px, 1vw, 18px)) rotate(0deg);
}
.shop-free-layer > .shop-relic-card:nth-child(2):hover,
.shop-free-layer > .shop-relic-card:nth-child(2):focus-visible {
  transform: translateX(clamp(-12px, -1vw, -18px)) rotate(0deg);
}

.shop-reroll-card-anchor {
  /* 리롤 버튼을 유물 카드 레이어 안으로 이동시켜 동일 레이어 reveal/stack beat를 공유한다. */
  position: relative;
  z-index: 3;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: clamp(8px, 1vw, 14px);
}
.shop-reroll-zone {
  transform: translateX(clamp(18px, 1.7vw, 26px));
}

/* Reroll button — 촛불/밀랍 테마 장식 컨트롤. 아이콘+라벨 / 황금 구분선 / 비용 3구역. */
.shop-reroll-btn {
  appearance: none;
  position: relative;
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  gap: 0;
  width: clamp(96px, 9.8vw, 122px);
  height: clamp(84px, 10vh, 108px);
  padding: clamp(8px, 1.1vh, 12px) 10px clamp(8px, 1.1vh, 12px);
  border: 1px solid rgba(200, 152, 60, 0.48);
  border-radius: 14px;
  /* 상단 따뜻한 밀랍 + 하단 깊은 적흑 그라데이션 */
  background:
    linear-gradient(180deg,
      rgba(108, 62, 22, 0.97) 0%,
      rgba(72, 36, 14, 0.98) 52%,
      rgba(32, 14, 6, 0.99) 100%),
    repeating-linear-gradient(135deg,
      rgba(255, 220, 140, 0.05) 0 2px,
      transparent 2px 7px);
  color: rgba(255, 228, 160, 0.95);
  font-family: inherit;
  font-weight: 900;
  letter-spacing: 0.06em;
  cursor: pointer;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9);
  box-shadow:
    inset 0 1px 0 rgba(255, 228, 160, 0.22),
    inset 0 -4px 8px rgba(0, 0, 0, 0.6),
    inset 1px 0 0 rgba(255, 200, 100, 0.08),
    inset -1px 0 0 rgba(255, 200, 100, 0.08),
    0 6px 16px rgba(0, 0, 0, 0.6),
    0 2px 4px rgba(0, 0, 0, 0.4);
  transition: transform 0.16s ease, box-shadow 0.18s ease, filter 0.16s ease, border-color 0.18s ease;
  overflow: hidden;
}
/* 상단 장식 광택 */
.shop-reroll-btn::before {
  content: '';
  position: absolute;
  top: 0;
  left: 12%;
  right: 12%;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(255, 228, 160, 0.38), transparent);
  border-radius: 0 0 50% 50%;
}
.shop-reroll-btn:hover {
  transform: translateY(-2px) scale(1.02);
  border-color: rgba(220, 172, 80, 0.72);
  box-shadow:
    inset 0 1px 0 rgba(255, 228, 160, 0.3),
    inset 0 -4px 8px rgba(0, 0, 0, 0.55),
    0 10px 22px rgba(0, 0, 0, 0.65),
    0 0 20px rgba(220, 140, 40, 0.28);
  filter: brightness(1.08);
}
.shop-reroll-btn:active {
  transform: translateY(0) scale(0.98);
  transition-duration: 0.06s;
}
/* 아이콘 + 라벨 묶음 */
.shop-reroll-btn-top {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  flex: 0 0 auto;
}
.shop-reroll-icon {
  display: block;
  opacity: 0.88;
  flex-shrink: 0;
}
.shop-reroll-btn-label {
  font-size: 9px;
  letter-spacing: 0.14em;
  opacity: 0.72;
  line-height: 1;
}
/* 황금 구분선 */
.shop-reroll-btn-rule {
  display: block;
  width: 54%;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(210, 160, 60, 0.55), transparent);
  flex-shrink: 0;
}
/* 비용 숫자 */
.shop-reroll-btn-cost {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-variant-numeric: tabular-nums;
  flex: 0 0 auto;
}
.shop-reroll-btn-cost-text {
  font-size: clamp(20px, 1.9vw, 28px);
  line-height: 1;
  font-weight: 900;
}
.shop-reroll-btn.is-unaffordable,
.shop-reroll-btn.is-reroll-locked {
  filter: saturate(0.55) brightness(0.72);
  cursor: not-allowed;
  border-color: rgba(160, 120, 60, 0.3);
}
.shop-reroll-btn.is-reroll-locked {
  /* 리롤 정산 중에는 pointer-events를 끊어 연타로 유물 슬롯이 엇갈리는 것을 막는다. */
  pointer-events: none;
}
.shop-reroll-btn.is-affordable { border-color: rgba(130, 210, 110, 0.65); }
.shop-reroll-btn.is-affordable:hover { border-color: rgba(160, 240, 130, 0.8); }
.shop-reroll-btn.is-reroll-impacted {
  animation: shop-reroll-impact 0.42s cubic-bezier(0.2, 0.86, 0.22, 1);
}

/* Free-card tile gets a warm candle-glow art band. */
.shop-free-card .shop-free-art {
  background:
    linear-gradient(180deg, rgba(8, 5, 12, 0.14), rgba(8, 5, 12, 0.52)),
    var(--shop-free-art);
  background-size: cover;
  background-position: center;
}


/* Free card stays visually secondary to paid relic offers, so shrink it a touch. */
.shop-free-card {
  width: clamp(124px, 11.8vw, 178px);
}

.shop-free-card.is-consumed {
  pointer-events: none;
  animation: shop-free-card-consumed 0.24s ease forwards;
}
@keyframes shop-free-card-consumed {
  from { opacity: 1; transform: translateY(0) scale(1); filter: saturate(1); }
  to { opacity: 0; transform: translateY(-30px) scale(0.86); filter: saturate(0.7) brightness(1.1); }
}

/* Pack tile — FULL illustration with centered title/effect overlay. This is
   intentionally NOT the relic-card art+body split: the pack reads as a
   single illustrated envelope, not a card with a separate text panel. */
.shop-pack-card {
  position: relative;
  flex: 0 0 auto;
  width: clamp(124px, 11.6vw, 174px);
  aspect-ratio: 3 / 4;
  border-radius: 14px;
  border: none;
  overflow: visible;
  cursor: pointer;
  scale: 1;
  box-shadow: none;
  transform-origin: center bottom;
  /* Hover scale uses the individual scale property so it composes with the
     translate/rotate channels used by the float keyframes (transform-based
     animations can not be overridden by static :hover transforms, which is
     why scale lives on its own track here). */
  transition: scale 0.18s ease, box-shadow 0.22s ease, filter 0.16s ease;
  animation:
    shop-card-enter 0.5s cubic-bezier(0.18, 0.86, 0.22, 1) both,
    shop-pack-drift 6.6s ease-in-out 0.55s infinite alternate;
}
.shop-relic-flipper {
  position: relative;
  width: 100%;
  height: 100%;
  /* Front/back share this mask so rounded corners remain clean while flipping. */
  border-radius: inherit;
  overflow: hidden;
  transform-style: preserve-3d;
}
/* 무료 카드 슬롯은 상점 진입 시 카드백에서 시작했다가 앞면으로 공개한다. */
.shop-free-card .shop-relic-flipper { transform: none; animation: none; }
/* Reroll must spin the ENTIRE relic layer (including glow/shadow/border). */
.shop-relic-card.is-rerolling {
  will-change: transform;
  animation: shop-reroll-card-whole-spin var(--shop-reroll-flip-ms, 0.56s) cubic-bezier(0.36, 0.12, 0.58, 0.96) var(--shop-reroll-stagger, 0ms) both;
}
/* pack 슬롯 개수(상점 3 / 제단 4)가 바뀌어도 nth-child 하드코딩 없이
   동일한 등장/유영 스태거를 유지하도록 각 카드가 넘긴 order 변수를 사용한다. */
.shop-pack-layer > .shop-pack-card {
  --shop-pack-enter-delay: calc(500ms + var(--shop-pack-order, 0) * 100ms);
  --shop-pack-float-delay: calc(1.3s + var(--shop-pack-order, 0) * 0.8s);
  animation-delay: var(--shop-pack-enter-delay), var(--shop-pack-float-delay);
}
.shop-pack-card:hover,
.shop-pack-card:focus-visible {
  /* 진입(shop-card-enter)은 계속, 유영(shop-pack-drift)만 멈춘다. 커서 위 등장 시 투명 고착 방지. */
  animation-play-state: running, paused;
  scale: 1.06;
  box-shadow: none;
  z-index: 6;
}
.shop-pack-card.is-unaffordable {
  filter: saturate(0.82) brightness(0.84);
}
.shop-pack-illustration {
  position: absolute;
  inset: -2px 0 0;
  border-radius: inherit;
  background-position: center;
  background-size: cover;
  pointer-events: none;
}
.shop-pack-overlay {
  position: absolute;
  inset: 0;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  padding: clamp(8px, 1vw, 14px);
  text-align: center;
  border-radius: inherit;
  pointer-events: none;
}
.shop-pack-title {
  margin: 0;
  color: rgba(255, 244, 210, 0.98);
  font-size: var(--font-size-base);
  font-weight: 900;
  letter-spacing: 0.03em;
  text-shadow:
    0 1px 3px rgba(0, 0, 0, 0.98),
    0 2px 6px rgba(0, 0, 0, 0.94),
    0 0 14px rgba(0, 0, 0, 0.88),
    0 0 28px rgba(0, 0, 0, 0.72);
}
.shop-pack-effect {
  margin: 4px 0 0;
  color: rgba(255, 244, 210, 0.86);
  font-size: var(--font-size-sm);
  text-shadow:
    0 1px 3px rgba(0, 0, 0, 0.96),
    0 2px 5px rgba(0, 0, 0, 0.9),
    0 0 12px rgba(0, 0, 0, 0.84),
    0 0 24px rgba(0, 0, 0, 0.66);
}
/* Theme tints are applied as a glow on the card frame; the inner art comes
   from the pack_00X.webp sprite assigned inline in the renderer. */

/* Pack-picker overlay: lives INSIDE .shop-shell. Instead of feeling like a
   hard rectangular layer, the veil is a radial-feathered "big shadow"
   that dims the center where the cards land and fades to nothing at the
   shop UI's edges, naturally pulling the eye to the 3 picked cards.
   overflow:hidden still clips the cards' drop-in trajectory so they
   never escape the shop footprint. */
.shop-pack-picker {
  position: absolute;
  inset: 0;
  z-index: 11;
  display: none;
  /* Rounded clip matches the rail curve so any visible edge follows the
     shop UI's silhouette instead of a flat rectangle. */
  border-radius: 14px;
  overflow: hidden;
  pointer-events: none;
}
.shop-pack-picker.is-open {
  display: block;
  pointer-events: auto;
}
.shop-pack-picker-veil {
  position: absolute;
  inset: 0;
  background-image: var(--shop-picker-bg);
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  /* 셔터 이후 rail 크기 안에서만 은은하게 나타나도록 투명도만 올린다. */
  animation: shop-pack-veil-fade-in 0.38s ease both;
  box-shadow:
    inset 0 0 0 1px rgba(255, 232, 168, 0.1),
    inset 0 0 90px rgba(0, 0, 0, 0.86),
    inset 0 0 220px rgba(0, 0, 0, 0.82),
    inset 0 0 280px 44px rgba(0, 0, 0, 0.92);
  filter: saturate(1.08) contrast(1.06) brightness(0.68);
}
.shop-pack-picker.is-closing .shop-pack-picker-veil {
  animation: shop-pack-veil-lift 0.34s cubic-bezier(0.6, 0.04, 0.74, 0.92) both;
}
@keyframes shop-pack-veil-fade-in {
  0%   { opacity: 0; transform: translateY(-100%) scaleY(0.92); transform-origin: top; }
  100% { opacity: 0.95; transform: translateY(0) scaleY(1); transform-origin: top; }
}
@keyframes shop-pack-veil-lift {
  0%   { transform: scaleY(1); opacity: 1; }
  100% { transform: scaleY(0); opacity: 0; }
}
.shop-pack-picker-shell {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  /* 카드는 세로 중앙에 두고, 헤더만 absolute로 상단에 띄운다. */
  justify-content: center;
  gap: clamp(8px, 1.2vh, 14px);
  padding: clamp(16px, 2.2vh, 26px) clamp(10px, 1.4vh, 18px) clamp(10px, 1.4vh, 18px);
  /* 베일 레이어 뒤에 붙은 보조 레이어처럼 한 박자 늦게 같은 top-down 모션으로 열린다. */
  opacity: 0;
  transform: translateY(-100%) scaleY(0.92);
  transform-origin: top;
  animation: shop-pack-picker-shell-drop 0.42s cubic-bezier(0.22, 0.86, 0.22, 1) 0.42s both;
}
.shop-pack-picker-head {
  /* 카드는 flex 중앙에 남기고 헤더만 상단으로 띄운다. */
  position: absolute;
  top: clamp(18px, 2.4vh, 28px);
  text-align: center;
  color: rgba(255, 232, 168, 0.96);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.85);
  animation: shop-pack-head-fade 0.32s ease 0.72s both;
}
.shop-pack-picker.is-closing .shop-pack-picker-head {
  animation: shop-pack-head-fade-out 0.22s ease both;
}
@keyframes shop-pack-head-fade {
  0%   { opacity: 0; transform: translateY(-6px); }
  100% { opacity: 1; transform: translateY(0); }
}
@keyframes shop-pack-head-fade-out {
  0%   { opacity: 1; transform: translateY(0); }
  100% { opacity: 0; transform: translateY(-6px); }
}
.shop-pack-picker-head h2 {
  margin: 0;
  font-size: clamp(20px, 2.2vh, 26px);
  letter-spacing: 0.08em;
  font-weight: 900;
}
.shop-pack-picker-head p {
  margin: 4px 0 0;
  color: rgba(232, 214, 180, 0.82);
  font-size: clamp(13px, 1.4vh, 15px);
}
.shop-pack-picker-cards {
  display: grid;
  /* Pack choices read better when they share the same portrait bias as the
     cardback surface (3:4-ish). Keep them wider than before so text is not
     compressed into a short strip. (+15% from previous 154px/462px base) */
  grid-template-columns: repeat(3, minmax(177px, 1fr));
  gap: clamp(8px, 1.2vw, 16px);
  width: 100%;
  max-width: clamp(531px, 68vw, 810px);
}
.shop-pack-pick-card {
  position: relative;
  border-radius: 14px;
  /* Root stays neutral; front/back faces own frame paint so the whole card flips together. */
  border: none;
  background: transparent;
  box-shadow: none;
  padding: 0;
  min-height: 238px;
  aspect-ratio: 3 / 4;
  cursor: pointer;
  transform-style: preserve-3d;
  transform-origin: center bottom;
  /* 카드 루트는 낙하/호버만 담당하고 실제 앞뒤 회전은 내부 flipper가 담당한다. */
  /* Pack picks appear in-place; no flip/drop entrance now. */
  animation: shop-pack-pick-fade-in 0.26s ease calc(var(--pick-i, 0) * 80ms + 0.62s) both;
}
.shop-pack-pick-card > * {
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
}
.shop-pack-pick-flipper {
  position: absolute;
  inset: 0;
  /* Clip both faces inside the same rounded mask so artwork never pokes
     past rounded corners while flipping. */
  border-radius: inherit;
  overflow: visible;
  transform-style: preserve-3d;
  transform: rotateY(0deg);
  animation: none;
}
/* Keep pack-pick front as a true face plane (absolute/inset), mirroring back
   face geometry so the cardback reliably appears during 180deg intervals. */
.shop-pack-pick-front { position: absolute; inset: 0; z-index: 2; display: grid; grid-template-rows: 55% 45%; min-height: 100%; height: 100%; border-radius: inherit; border: 1px solid rgba(255, 215, 120, 0.5); background: linear-gradient(180deg, rgba(45, 30, 39, 0.98), rgba(18, 12, 24, 0.98)); overflow: hidden; box-shadow: 0 12px 24px rgba(0, 0, 0, 0.55); transform: rotateY(0deg); }
.shop-pack-pick-art {
  position: relative;
  border-radius: 14px 14px 0 0;
  overflow: hidden;
  background-position: center;
  background-size: cover;
  background-repeat: no-repeat;
}
.shop-pack-pick-art::after { content: ''; position: absolute; inset: 0; background: linear-gradient(180deg, rgba(6, 6, 12, 0.05), rgba(6, 6, 12, 0.52)); }
.shop-pack-pick-body {
  position: relative;
  padding: 10px 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.shop-pack-pick-card-head {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
}
.shop-pack-pick-card-name {
  font-size: clamp(14px, 1.3vw, 16px);
  font-weight: 900;
  color: rgba(255, 232, 168, 0.96);
  line-height: 1.2;
  text-align: center;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
  white-space: normal;
}
/* 기존 rarity 배지는 art 영역 좌상단 뱃지(.shop-pack-pick-rarity-badge)로 이동했으므로
   이 클래스는 호환성 유지용으로만 남긴다. */
.shop-pack-pick-card-rarity {
  display: none;
}
.shop-pack-pick-card-effect {
  font-size: 15px;
  line-height: 1.4;
  color: rgba(220, 200, 170, 0.82);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.7);
  margin: 0;
  text-align: center;
}
/* 팩 피커 카드 desc-dyn: 도감·손패 미리보기와 동일 display 토글 방식 */
.shop-pack-pick-card-effect .desc-dyn { display: inline; }
.shop-pack-pick-card-effect .desc-dyn__d { display: none; opacity: 1; }
body.is-shift-detail .shop-pack-pick-card-effect .desc-dyn__s { display: none; opacity: 1; }
body.is-shift-detail .shop-pack-pick-card-effect .desc-dyn__d { display: inline; white-space: nowrap; }

/* 타입 배지 — [ 트리플 ] / [ 레시피 ] / [ 손패 ] 등 */
.shop-pack-type-badge {
  font-size: 10px;
  color: rgba(200, 195, 180, 0.58);
  letter-spacing: 0.12em;
  text-align: center;
  line-height: 1;
  white-space: nowrap;
}
/* 희귀도 배지 — art 영역 좌상단 절대 배치 */
.shop-pack-pick-rarity-badge {
  position: absolute;
  top: 7px;
  left: 7px;
  z-index: 3;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 2px 6px;
  border-radius: 999px;
  border: 1px solid currentColor;
  opacity: 0.85;
  pointer-events: none;
  background: rgba(10, 7, 18, 0.55);
}
.shop-pack-pick-rarity-badge.rarity-common    { color: rgba(200, 200, 200, 0.9); }
.shop-pack-pick-rarity-badge.rarity-rare      { color: rgba(100, 180, 255, 0.9); }
.shop-pack-pick-rarity-badge.rarity-epic      { color: rgba(225, 65, 245, 0.9); }
.shop-pack-pick-rarity-badge.rarity-unique    { color: rgba(255, 210, 80, 0.9); }
.shop-pack-pick-rarity-badge.rarity-legendary { color: rgba(255, 140, 60, 0.9); }
/* 레시피 재료 n+n 표기 */
.shop-pack-recipe-note {
  font-size: 11px;
  color: rgba(200, 185, 165, 0.58);
  text-align: center;
  margin: 0;
  line-height: 1.3;
  white-space: normal;
  letter-spacing: 0.02em;
}
/* 모든 팩 — 재뽑기 버튼 (카드 하단, Pass 위) */
.shop-pack-reroll-btn {
  appearance: none;
  position: absolute;
  bottom: clamp(60px, 8.2vh, 84px);
  left: 50%;
  transform: translateX(-50%);
  padding: 7px 28px;
  border-radius: 999px;
  border: 1px solid rgba(200, 175, 110, 0.34);
  background: rgba(40, 30, 18, 0.72);
  color: rgba(230, 205, 145, 0.72);
  font-family: inherit;
  font-weight: 600;
  font-size: 12px;
  letter-spacing: 0.20em;
  cursor: pointer;
  white-space: nowrap;
  z-index: 4;
  text-shadow: 0 1px 4px rgba(0,0,0,0.9);
  transition: border-color 0.18s ease, color 0.18s ease, background 0.18s ease;
}
.shop-pack-reroll-btn .shop-pack-reroll-cost {
  font-size: 11px;
  opacity: 0.85;
}
.shop-pack-reroll-btn.is-affordable:hover {
  border-color: rgba(230, 200, 120, 0.55);
  color: rgba(245, 225, 170, 0.92);
  background: rgba(55, 40, 18, 0.82);
}
.shop-pack-reroll-btn.is-unaffordable {
  opacity: 0.35;
  cursor: default;
}
/* Pass 버튼이 없을 때 재뽑기가 Pass 자리로 내려오도록 bottom 보정 */
.shop-pack-picker-shell:not(:has(.shop-pack-pass-btn)) .shop-pack-reroll-btn {
  bottom: clamp(26px, 3.6vh, 42px);
}
/* 삭제팩/해금팩 — Pass 버튼 (하단 중앙, minimal pill) */
.shop-pack-pass-btn {
  appearance: none;
  position: absolute;
  bottom: clamp(26px, 3.6vh, 42px);
  left: 50%;
  transform: translateX(-50%);
  padding: 6px 26px;
  border-radius: 999px;
  border: 1px solid rgba(185, 168, 136, 0.26);
  background: transparent;
  color: rgba(205, 188, 160, 0.50);
  font-family: inherit;
  font-weight: 600;
  font-size: 11px;
  letter-spacing: 0.32em;
  text-transform: uppercase;
  cursor: pointer;
  white-space: nowrap;
  z-index: 4;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.9);
  transition: border-color 0.22s ease, color 0.22s ease;
  transform-origin: center center;
}
.shop-pack-pass-btn:hover {
  border-color: rgba(215, 196, 158, 0.46);
  color: rgba(232, 214, 180, 0.78);
}
/* 클릭 후 선으로 수축하며 퇴장 */
@keyframes pass-btn-to-line {
  0%   { transform: translateX(-50%) scaleY(1)   scaleX(1);    opacity: 1; }
  20%  { transform: translateX(-50%) scaleY(0.92) scaleX(0.96); opacity: 1; }
  60%  { transform: translateX(-50%) scaleY(0.05) scaleX(1.08); opacity: 0.55; }
  100% { transform: translateX(-50%) scaleY(0.01) scaleX(1.14); opacity: 0; }
}
.shop-pack-pass-btn.is-passing {
  animation: pass-btn-to-line 0.34s cubic-bezier(0.48, 0, 0.52, 1) forwards;
  pointer-events: none;
}
/* Painted back face — a dedicated DOM element painted purely with
   cardbackground_001.webp. Sits at rotateY(180deg) so it shows while the
   card is face-down (the entrance state) and during the 90°-270° section
   of the flip. No border or overlay: the asset itself is the back-of-card
   art and fully covers the card content beneath. */
.shop-pack-pick-back {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  border: 1px solid rgba(255, 215, 120, 0.5);
  background-color: rgba(18, 12, 24, 0.98);
  background-image: var(--cardback-url);
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  box-shadow: 0 12px 24px rgba(0, 0, 0, 0.55);
  transform: rotateY(180deg);
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
  pointer-events: none;
  z-index: 5;
}
/* Explicit culling on both pack faces keeps cross-browser flip parity with
   relic cards and prevents the front plane ghosting over the cardback. */
.shop-pack-pick-front,
.shop-pack-pick-back {
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
}
.shop-pack-pick-card:hover,
.shop-pack-pick-card:focus-visible {
  /* Scale via individual property so it composes with the rotateY held by
     the flip animation's 'both' fill mode. */
  scale: 1.04;
  box-shadow: none;
}
/* Theme/rarity visuals are face-owned so they rotate with the slab. */
.shop-pack-pick-card.pack-theme-resource .shop-pack-pick-front,
.shop-pack-pick-card.pack-theme-resource .shop-pack-pick-back { border-color: rgba(146, 220, 138, 0.62); }
.shop-pack-pick-card.pack-theme-upgrade .shop-pack-pick-front,
.shop-pack-pick-card.pack-theme-upgrade .shop-pack-pick-back { border-color: rgba(244, 164, 96, 0.62); }
.shop-pack-pick-card.pack-theme-unlock .shop-pack-pick-front,
.shop-pack-pick-card.pack-theme-unlock .shop-pack-pick-back { border-color: rgba(180, 142, 230, 0.62); }
@keyframes shop-pack-pick-fade-in {
  0% { opacity: 0; }
  100% { opacity: 1; }
}
@keyframes shop-pack-picker-shell-drop {
  0% { opacity: 0; transform: translateY(-100%) scaleY(0.92); transform-origin: top; }
  100% { opacity: 1; transform: translateY(0) scaleY(1); transform-origin: top; }
}
.shop-pack-picker.is-closing .shop-pack-pick-card {
  /* Override the entrance animations so cards lift back up cleanly when
     the player picks one. Stagger reversed so the leftmost rises first. */
  animation: shop-pack-pick-lift 0.34s cubic-bezier(0.6, 0.04, 0.74, 0.92) calc(var(--pick-i, 0) * 80ms) both;
  pointer-events: none;
}
@keyframes shop-pack-pick-lift {
  0%   { transform: translateY(0); opacity: 1; }
  100% { transform: translateY(-200%); opacity: 0; }
}

.shop-relic-card {
  position: relative;
  /* Front content uses an inner .shop-relic-front grid. The card root stays
     as the 3D container when rerolling flips are active. */
  display: block;
  overflow: visible; /* let the flat price tag poke past the bottom */
  border-radius: 14px;
  /* Frame paint lives on front/back faces so free/relic cards flip with one cohesive slab. */
  border: none;
  background: transparent;
  box-shadow: none;
  /* Fixed dimensions — the layer absorbs extra space; cards may extend past
     the layer edges because the layer is just a visual area marker.
     Sizes are ~20% larger than the previous (110/10.5vw/158) tier. */
  flex: 0 0 auto;
  width: clamp(132px, 12.6vw, 190px);
  aspect-ratio: 3 / 4;
  height: auto;
  min-height: 0;
  cursor: pointer;
  scale: 1;
  /* Hover lift uses individual scale so it composes with the float
     animation's translate/rotate channels (transforms set via keyframes
     can not be overridden by a static :hover transform). */
  transition: scale 0.18s ease, box-shadow 0.22s ease, filter 0.16s ease;
  animation:
    shop-card-enter 0.5s cubic-bezier(0.18, 0.86, 0.22, 1) both,
    shop-card-float 6.6s ease-in-out 0.55s infinite alternate;
}
/* Cards land AFTER the dim veil settles (~420ms). Per-card enter delays
   keep the cascade; float delays are staggered so the row doesn't sway in
   lock-step. */
.shop-artifact-layer > .shop-relic-card:nth-child(1) { animation-delay: 460ms, 1.1s; }
.shop-artifact-layer > .shop-relic-card:nth-child(2) { animation-delay: 560ms, 2.0s; }
.shop-artifact-layer > .shop-relic-card:nth-child(3) { animation-delay: 660ms, 2.9s; }
.shop-free-layer > .shop-relic-card { animation-delay: 520ms, 1.6s; }
/* Reroll button now lives inside the artifact card layer, so it uses the same
   card-enter timing beat and no longer pops ahead of relic cards. */
.shop-reroll-btn {
  /* 평상시에는 애니메이션 없이 opacity:1로 둔다. 진입 페이드를 base에 상시로
     두면 임팩트 클래스(is-shop-purchase-impact/is-reroll-impacted)가 animation을
     덮었다가 제거되는 순간 shop-card-enter가 재발동해, 리롤 직후 버튼이 460ms
     동안 투명해졌다 다시 떠오르는 문제가 생긴다. 진입 연출은 최초 오픈
     (.is-entering) 동안만 1회 재생한다. */
  opacity: 1;
}
.shop-shell.is-entering .shop-reroll-btn {
  animation: shop-card-enter 0.5s cubic-bezier(0.18, 0.86, 0.22, 1) both;
}
.shop-shell.is-entering .shop-artifact-layer > .shop-reroll-card-anchor:nth-child(1) .shop-reroll-btn {
  /* 카드 1장과 같은 460ms 진입 지연으로 묶어 선노출을 차단한다. */
  animation-delay: 460ms;
}
.shop-shell.is-closing .shop-reroll-btn {
  opacity: 0;
  translate: 0 -200%;
  scale: 0.92;
  pointer-events: none;
  transition:
    opacity 0.5s cubic-bezier(0.18, 0.86, 0.22, 1),
    translate 0.5s cubic-bezier(0.18, 0.86, 0.22, 1),
    scale 0.5s cubic-bezier(0.18, 0.86, 0.22, 1);
}
@keyframes shop-card-enter {
  /* 상점 카드/팩은 기존 위치에서 스르륵 나타나도록 투명도 중심으로 입장한다. */
  0%   { transform: scale(0.985); opacity: 0; }
  100% { transform: scale(1); opacity: 1; }
}
/* Idle drift — toned WAY down per feedback ("너무 떠다니는 느낌"). Uses the
   individual translate/rotate channels so :hover's scale can lift the
   card without colliding with the animation. */
@keyframes shop-card-float {
  0%   { translate: -1px 0; rotate: -0.4deg; }
  50%  { translate: 1px -1px; rotate: 0.3deg; }
  100% { translate: -1px 1px; rotate: -0.15deg; }
}
@keyframes shop-pack-drift {
  0%   { translate: 0 0; rotate: -0.25deg; }
  50%  { translate: 0 -1px; rotate: 0.2deg; }
  100% { translate: 0 0; rotate: -0.1deg; }
}
/* Dim veil — semi-transparent black sheet that descends top-down on top
   of the wax shutter, AFTER the shutter has finished closing.  This is the
   "extra layer" the player asked for: a clean monotone darkening pass that
   unifies whatever the shutter left behind. */
@keyframes shop-dim-veil-drop {
  0%   { transform: scaleY(0); opacity: 0; }
  100% { transform: scaleY(1); opacity: 1; }
}
@keyframes shop-dim-veil-lift {
  0%   { transform: scaleY(1); opacity: 1; }
  100% { transform: scaleY(0); opacity: 0; }
}

/* Hover: pause float + slight scale via the individual scale property so
   the lift sticks even while the float animation owns the transform track. */
.shop-relic-card:hover,
.shop-relic-card:focus-visible {
  /* 진입(shop-card-enter)은 계속 돌리고 유영(shop-card-float)만 멈춘다. paused로 둘 다
     멈추면 카드가 커서 위에서 등장할 때 진입이 opacity:0에서 얼어 투명하게 남았다. */
  animation-play-state: running, paused;
  scale: 1.06;
  box-shadow: none;
  z-index: 6;
}
.shop-relic-card.is-affordable {
  border-color: rgba(122, 202, 113, 0.62);
  box-shadow: none;
}
.shop-relic-card.is-unaffordable {
  border-color: rgba(166, 62, 58, 0.58);
  filter: saturate(0.82) brightness(0.86);
}
.shop-relic-card.is-unaffordable .shop-relic-title,
.shop-relic-card.is-unaffordable .shop-relic-effect {
  color: rgba(202, 174, 158, 0.76);
}
.shop-relic-card.is-purchased {
  filter: saturate(0.55) brightness(0.72);
  pointer-events: none;
  animation: shop-card-burnout 0.42s ease forwards;
}
@keyframes shop-card-burnout {
  0% { opacity: 1; clip-path: inset(0 0 0 0); }
  100% { opacity: 0; clip-path: inset(100% 0 0 0); }
}

/* Explicit front-face wrapper for relic cards. Keeping this separate from the
   root lets us run a true two-sided 3D flip (front vs cardback). */
.shop-relic-front {
  /* Relic front/back must share one absolute face stack; keeping front in
     normal flow can flatten the 3D context and hide cardback on some GPUs. */
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-rows: 50% 1fr;
  height: 100%;
  min-height: 0;
  border-radius: inherit;
  border: 1px solid rgba(255, 215, 120, 0.42);
  background: linear-gradient(180deg, rgba(45, 30, 39, 0.96), rgba(18, 12, 24, 0.96));
  box-shadow:
    inset 0 1px 0 rgba(255, 232, 168, 0.18),
    0 12px 24px rgba(0, 0, 0, 0.55);
  overflow: hidden;
  /* Keep front/back on the exact same plane so cardback culling is stable. */
  transform: rotateY(0deg);
}

.shop-relic-art {
  min-height: 0;
  background-size: cover;
  background-position: center 18%;
  border-bottom: 1px solid rgba(255, 215, 120, 0.18);
  box-shadow: inset 0 -36px 46px rgba(13, 9, 19, 0.74);
  border-radius: 14px 14px 0 0;
}
.shop-relic-body {
  padding: 10px 12px 12px;
  display: grid;
  grid-template-rows: auto 1fr auto;
  gap: 6px;
  min-height: 0;
}
.shop-relic-title {
  margin: 0;
  color: rgba(255, 232, 168, 0.98);
  font-size: var(--font-size-base);
  font-weight: 900;
  letter-spacing: 0.02em;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.85);
}
.shop-relic-effect {
  margin: 0;
  color: rgba(255, 244, 210, 0.94);
  line-height: 1.32;
  font-size: var(--font-size-sm);
}
.shop-relic-flavor {
  margin: 0;
  color: rgba(232, 214, 180, 0.62);
  font-size: 11px;
  line-height: 1.3;
}
.shop-relic-bonus-chip {
  margin: 2px 0 0;
  padding: 1px 5px;
  border-radius: 4px;
  background: rgba(200, 160, 60, 0.18);
  border: 1px solid rgba(200, 160, 60, 0.38);
  color: rgba(255, 220, 120, 0.95);
  font-size: 11px;
  line-height: 1.4;
}
.shop-relic-bonus-chip strong {
  color: #ffd97a;
  font-weight: 700;
}

/* Price tag — hangs fully below the card with a short connector "string"
   so it reads as a separated tag rather than a label overlapping the
   description. Tag-shaped (rectangular top, slightly rounded bottom). */
.shop-price-label {
  position: absolute;
  bottom: -34px;
  left: 50%;
  transform: translateX(-50%);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 112px;
  justify-content: center;
  padding: 4px 13px 5px 10px;
  border-radius: 999px;
  white-space: nowrap;
  border: 1px solid rgba(255, 215, 120, 0.42);
  background: linear-gradient(180deg, rgba(42, 31, 46, 0.96), rgba(20, 14, 28, 0.98));
  color: rgba(255, 232, 168, 0.96);
  font-weight: 900;
  font-size: 13px;
  letter-spacing: 0.04em;
  font-variant-numeric: tabular-nums;
  box-shadow:
    inset 0 1px 0 rgba(255, 232, 168, 0.14),
    0 8px 18px rgba(0, 0, 0, 0.55);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.88);
  z-index: 7;
  pointer-events: none;
}
.shop-price-label::before {
  /* 기존 매단 가격표 끈 대신 불빛 보석 뒤의 은은한 halo만 남겨 라벨+가격+점 구조를 제거한다. */
  content: '';
  position: absolute;
  inset: -3px;
  border-radius: inherit;
  background: radial-gradient(circle at 24% 50%, rgba(255, 232, 168, 0.18), transparent 38%);
  pointer-events: none;
}
.shop-pack-price {
  bottom: -34px;
}
.shop-price-label-icon {
  display: inline-flex;
  width: 16px;
  height: 16px;
  color: currentColor;
  filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.55));
}
.shop-price-label-icon .icon { width: 100%; height: 100%; }
.shop-relic-card.is-affordable .shop-price-label {
  border-color: rgba(132, 215, 112, 0.58);
  background: linear-gradient(180deg, rgba(35, 70, 38, 0.96), rgba(18, 38, 23, 0.98));
  color: rgba(224, 255, 190, 0.96);
}
.shop-relic-card.is-unaffordable .shop-price-label {
  border-color: rgba(166, 62, 58, 0.5);
  background: linear-gradient(180deg, rgba(88, 42, 42, 0.92), rgba(42, 20, 26, 0.96));
  color: rgba(255, 197, 181, 0.82);
}
.shop-relic-card.is-purchased .shop-price-label {
  border-color: rgba(154, 188, 132, 0.46);
  background: linear-gradient(180deg, rgba(53, 74, 48, 0.9), rgba(28, 42, 30, 0.94));
  color: rgba(216, 240, 198, 0.86);
}


/* Closing — bounce down then swoosh up in random per-card order. The
   per-card random delay is set inline as --card-leave-delay (0~240ms).
   EXIT button hides during the close so it doesn't linger over the
   leaving cards. */
.shop-shell.is-closing {
  overflow: hidden; /* clip the swoosh so cards don't pass over the candle gauge */
}

.shop-shell.is-pack-picker-open .shop-close-btn {
  opacity: 0;
  pointer-events: none;
}
.shop-shell.is-closing .shop-close-btn { opacity: 0; pointer-events: none; transition: opacity 0.18s ease; }
.shop-shell.is-closing .shop-relic-card,
.shop-shell.is-closing .shop-pack-card {
  pointer-events: none;
  animation:
    shop-card-bounce 0.22s cubic-bezier(0.2, 0.86, 0.22, 1) forwards,
    shop-card-swoosh 0.5s cubic-bezier(0.18, 0.86, 0.22, 1) forwards;
  animation-delay:
    0s,
    calc(220ms + var(--card-leave-delay, 0ms));
}
@keyframes shop-card-bounce {
  0%   { transform: translateY(0) scale(1); }
  60%  { transform: translateY(14px) scale(0.99); }
  100% { transform: translateY(8px) scale(1); }
}
@keyframes shop-card-swoosh {
  0%   { transform: translateY(8px) scale(1); opacity: 1; }
  100% { transform: translateY(-260%) scale(0.92); opacity: 0; }
}
@keyframes shop-reroll-impact {
  0% { transform: translateY(0) scale(1); box-shadow: 0 0 0 rgba(244, 164, 96, 0); }
  40% { transform: translateY(-2px) scale(1.04); box-shadow: 0 0 22px rgba(244, 164, 96, 0.42); }
  100% { transform: translateY(0) scale(1); box-shadow: 0 0 0 rgba(244, 164, 96, 0); }
}
@keyframes shop-reroll-card-whole-spin {
  /* One-turn spin. Content swap happens at 180deg from renderer timeout. */
  0%   { transform: perspective(820px) rotateY(0deg); }
  50%  { transform: perspective(820px) rotateY(180deg); }
  100% { transform: perspective(820px) rotateY(360deg); }
}
/* Rugged carved-wood buy buttons: deep umber base, dark inset rim, warm
   ember type. Replaces the flat candle-pill button so the prices feel
   like they're stamped onto thick wood. */
.shop-buy-btn {
  appearance: none;
  border: 2px solid rgba(28, 14, 6, 0.92);
  border-radius: 4px;
  background:
    linear-gradient(180deg, rgba(120, 76, 36, 0.96), rgba(58, 30, 14, 0.96)),
    repeating-linear-gradient(135deg, rgba(0, 0, 0, 0.06) 0 2px, rgba(255, 232, 168, 0.04) 2px 5px);
  color: rgba(255, 232, 168, 0.96);
  font-family: inherit;
  font-weight: 900;
  font-size: 11px;
  cursor: pointer;
  padding: 4px 6px;
  box-shadow:
    inset 0 1px 0 rgba(255, 232, 168, 0.32),
    inset 0 -3px 6px rgba(0, 0, 0, 0.6),
    0 3px 8px rgba(0, 0, 0, 0.55);
  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.85);
  letter-spacing: 0.02em;
  transition: transform 0.16s ease, box-shadow 0.16s ease, filter 0.16s ease;
}
.shop-buy-btn:not(:disabled):hover {
  transform: translateY(-1px);
  filter: brightness(1.08);
  box-shadow:
    inset 0 1px 0 rgba(255, 232, 168, 0.5),
    inset 0 -3px 6px rgba(0, 0, 0, 0.6),
    0 5px 12px rgba(0, 0, 0, 0.65),
    0 0 14px rgba(244, 164, 96, 0.32);
}
.shop-buy-btn:disabled {
  cursor: not-allowed;
  opacity: 0.4;
  filter: grayscale(0.5);
}

/* EXIT label: rugged red wax tag perched on the bottom edge of the shop
   shell, drooping slightly into the player-card area so it reads as a
   "leave" sign nailed to the doorway. */
.shop-close-btn {
  position: absolute;
  bottom: -18px;
  right: clamp(10px, 1.8vw, 24px);
  z-index: 8;
  transform: rotate(-3deg);
  padding: 6px 18px;
  font-family: inherit;
  font-weight: 900;
  letter-spacing: 0.22em;
  font-size: 13px;
  color: #fff5dc;
  cursor: pointer;
  border-radius: 4px;
  border: 2px solid #220707;
  background:
    linear-gradient(180deg, rgba(180, 48, 36, 0.98), rgba(96, 16, 16, 0.98)),
    repeating-linear-gradient(125deg, rgba(0, 0, 0, 0.1) 0 2px, rgba(255, 80, 80, 0.05) 2px 6px);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.85);
  box-shadow:
    inset 0 1px 0 rgba(255, 200, 200, 0.32),
    inset 0 -3px 6px rgba(0, 0, 0, 0.55),
    0 8px 18px rgba(0, 0, 0, 0.55),
    0 0 24px rgba(176, 28, 28, 0.42);
  transition: transform 0.16s ease, filter 0.16s ease;
}
.shop-close-btn:hover {
  transform: rotate(-3deg) translateY(-1px);
  filter: brightness(1.08);
}
.shop-empty {
  grid-column: 1 / -1;
  min-height: 120px;
  display: grid;
  place-items: center;
  color: rgba(255, 232, 168, 0.72);
  border: 1px dashed rgba(255, 232, 168, 0.22);
  border-radius: 16px;
}
@keyframes shop-rail-quake {
  0%, 100% { transform: translate(0, 0) rotate(0); }
  16% { transform: translate(-8px, 3px) rotate(-0.55deg); }
  32% { transform: translate(7px, -4px) rotate(0.5deg); }
  48% { transform: translate(-5px, 4px) rotate(-0.35deg); }
  64% { transform: translate(4px, -2px) rotate(0.25deg); }
  80% { transform: translate(-2px, 1px) rotate(-0.12deg); }
}
@keyframes shop-shutter-drop {
  0% { transform: translateY(-120%) scaleY(0.82); opacity: 0.2; }
  82% { transform: translateY(5%) scaleY(1.04); opacity: 1; }
  100% { transform: translateY(0) scaleY(1); opacity: 1; }
}
@keyframes shop-shutter-open {
  0% { transform: translateY(0) scaleY(1); opacity: 1; }
  100% { transform: translateY(-120%) scaleY(0.78); opacity: 0; }
}
@keyframes shop-overlay-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
@media (max-width: 820px) {
  /* shop-top-row is already 1fr in base; only bottom-row needs to collapse. */
  .shop-bottom-row { grid-template-columns: 1fr; }
  .shop-artifact-layer,
  .shop-pack-layer { flex-wrap: wrap; }
}

/* Player card mirrors the rail-card structure (sprite art → bottom dark
   gradient → content) so the player reads as the largest "card" on board. */
.player-card {
  position: relative;
  width: clamp(150px, 17vw, 200px);
  aspect-ratio: 3 / 4;
  border-radius: 14px;
  overflow: hidden;
  isolation: isolate;
  background: #14101c;
  border: 1px solid var(--color-flame-warm);
  box-shadow:
    inset 0 1px 0 rgba(255, 232, 168, 0.32),
    inset 0 -10px 22px rgba(0, 0, 0, 0.55),
    0 6px 14px rgba(0, 0, 0, 0.55),
    0 0 26px rgba(244, 164, 96, 0.28);
}

.player-art {
  position: absolute;
  inset: 0;
  background-size: cover;
  background-position: center 22%;
  background-repeat: no-repeat;
  filter: saturate(1.06) contrast(1.04);
  z-index: 0;
}

.player-overlay {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  background:
    linear-gradient(
      180deg,
      rgba(20, 16, 28, 0.0) 32%,
      rgba(20, 16, 28, 0.55) 65%,
      rgba(8, 5, 14, 0.94) 100%
    ),
    radial-gradient(
      120% 60% at 50% 0%,
      rgba(244, 164, 96, 0.1),
      transparent 70%
    );
}

.player-content {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  align-items: stretch;
  text-align: center;
  padding: 8px 10px 10px;
  gap: 6px;
}

.player-stats {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
  align-items: center;
}

.hp-bar {
  position: relative;
  height: 16px;
  background: rgba(0, 0, 0, 0.5);
  border: 1px solid var(--color-border-soft);
  border-radius: 999px;
  overflow: hidden;
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.6);
}
.hp-fill {
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, #c9472a, #f4a460);
  transition: width 0.3s ease;
  box-shadow: inset 0 1px 0 rgba(255, 215, 120, 0.4);
}
.hp-text {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  height: 100%;
  font-size: 12px;
  font-weight: 700;
  color: #fff5dc;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.85);
  font-variant-numeric: tabular-nums;
}
.hp-text-icon {
  display: inline-flex;
  align-items: center;
  color: #ffd5c5;
  font-size: 12px;
}

.atk-stat {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: var(--font-size-sm);
  font-weight: 700;
  color: var(--color-flame);
  padding: 3px 12px;
  border: 1px solid rgba(255, 215, 120, 0.35);
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.32);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.atk-stat-icon {
  display: inline-flex;
  align-items: center;
  color: var(--color-flame);
  font-size: 13px;
}

/* ---------- Hand panel — see the bottom of the file for the active
   10-slot stack styles. The old deckbuilder layout (.hand-cards, the
   transform-lift hover, etc.) was removed because it both duplicated and
   clipped the new layout's animations. */

@media (max-width: 960px) {
  .game-shell {
    grid-template-columns: minmax(200px, 240px) minmax(0, 1fr) minmax(140px, 180px);
  }
}

@media (max-width: 760px) {
  .game-shell {
    grid-template-columns: 1fr;
    grid-template-rows: auto minmax(0, 1fr) auto;
  }
  .left-panel { min-height: 0; }
  .hand-panel { grid-row: 3; }
}

@media (max-width: 480px) {
  .game-shell { padding-left: 6px; padding-right: 6px; }
  .card-name { font-size: 12px; }
}

@media (max-height: 500px) {
  .rail-row.dist-2 { opacity: 0.3; transform: scale(0.86); }
  .rail-row.dist-1 { opacity: 0.6; transform: scale(0.92); }
  .player-card { width: clamp(120px, 14vw, 160px); }
  .shop-pack-pick-card { min-height: clamp(139px, 30.8vh, 238px); }
  .shop-pack-picker-cards { max-width: clamp(392px, 57.2vw, 810px); }
}

/* Mobile landscape: restore the 3-column game layout that the 760px breakpoint collapses. */
@media (max-width: 760px) and (orientation: landscape) {
  /* Single-column layout breaks hand card stacking (no bounded right column). */
  .game-shell {
    grid-template-columns:
      minmax(100px, 0.55fr)      /* left — player card + relics, compact */
      minmax(0, 1fr)              /* center — rail */
      clamp(120px, 24vw, 180px); /* right — hand panel */
    grid-template-rows: 1fr;
    padding-top: clamp(18px, 3vh, 28px);
  }
  .left-panel { min-height: 0; }
  /* Override the single-column hand-panel row assignment. */
  .hand-panel { grid-row: auto !important; }
}



/* Rarity glow-only language (no text labels) shared by relic/free/pack cards.
   에픽: 핑크-보라(마젠타) 계열로 변경해 레어(파랑)와 확실히 구분. */
.rarity-common { box-shadow: 0 0 0 1px rgba(116, 124, 136, 0.5), 0 12px 22px rgba(0,0,0,0.58); }
.rarity-rare { box-shadow: 0 0 0 1px rgba(80, 152, 255, 0.58), 0 0 24px rgba(80,152,255,0.24), 0 12px 22px rgba(0,0,0,0.58); }
.rarity-epic { box-shadow: 0 0 0 1px rgba(210, 50, 235, 0.65), 0 0 26px rgba(210,50,235,0.30), 0 12px 22px rgba(0,0,0,0.58); }
.rarity-unique { box-shadow: 0 0 0 1px rgba(242, 212, 92, 0.72), 0 0 30px rgba(242,212,92,0.34), 0 12px 22px rgba(0,0,0,0.58); }
.rarity-legendary { box-shadow: 0 0 0 1px rgba(220, 78, 78, 0.72), 0 0 30px rgba(220,78,78,0.34), 0 12px 22px rgba(0,0,0,0.58); }

/* 상점 유물 카드 루트에 외부 glow + 드롭 섀도를 명시적으로 추가한다.
   .shop-relic-flipper의 overflow:hidden이 내부 face의 outer box-shadow를 잘라내므로
   루트(.shop-relic-card)에 직접 걸어야 outside glow가 보인다. */
.shop-relic-card.rarity-common  { box-shadow: 0 10px 24px rgba(0,0,0,0.65); }
.shop-relic-card.rarity-rare    { box-shadow: 0 0 0 1px rgba(80,152,255,0.62), 0 0 32px rgba(80,152,255,0.46), 0 10px 24px rgba(0,0,0,0.65); }
.shop-relic-card.rarity-epic    { box-shadow: 0 0 0 1px rgba(210,50,235,0.66), 0 0 34px rgba(210,50,235,0.48), 0 10px 24px rgba(0,0,0,0.65); }
.shop-relic-card.rarity-unique  { box-shadow: 0 0 0 1px rgba(242,212,92,0.75), 0 0 36px rgba(242,212,92,0.52), 0 10px 24px rgba(0,0,0,0.65); }
.shop-relic-card.rarity-legendary { box-shadow: 0 0 0 1px rgba(220,78,78,0.75), 0 0 38px rgba(220,78,78,0.54), 0 10px 24px rgba(0,0,0,0.65); }

/* Real two-face relic card for reroll:
   - .shop-relic-front is the front face (0deg)
   - .shop-relic-cardback is the back face (180deg) with cardbackground_001.webp
   Both faces always exist, so the back image reads as the actual reverse side
   throughout the full rotation interval instead of appearing as a temporary mask. */
.shop-relic-front,
.shop-relic-cardback {
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
}
.shop-relic-cardback {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  border: 1px solid rgba(255, 215, 120, 0.42);
  background-color: rgba(18, 12, 24, 0.96);
  background-image: var(--cardback-url);
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  box-shadow: 0 12px 24px rgba(0, 0, 0, 0.55);
  transform: rotateY(180deg);
  pointer-events: none;
  /* Keep stacking neutral: 3D face orientation decides visibility, not z-order. */
  z-index: auto;
}
/* NOTE: reroll 활성 상태 제어는 .shop-relic-card.is-rerolling에서 단일 관리한다. */


/* 상점/제단 유물은 등급별 빛을 앞면 자체에 한 번 더 둘러 희귀도 차이를 즉시 읽게 한다. */
.shop-relic-card.rarity-common .shop-relic-front::after,
.shop-relic-card.rarity-rare .shop-relic-front::after,
.shop-relic-card.rarity-epic .shop-relic-front::after,
.shop-relic-card.rarity-unique .shop-relic-front::after,
.shop-relic-card.rarity-legendary .shop-relic-front::after {
  content: '';
  position: absolute;
  inset: -2px;
  border-radius: inherit;
  pointer-events: none;
  mix-blend-mode: screen;
}
.shop-relic-card.rarity-common .shop-relic-front::after { box-shadow: inset 0 0 24px rgba(170, 180, 196, 0.24); }
.shop-relic-card.rarity-rare .shop-relic-front::after { box-shadow: inset 0 0 30px rgba(80, 152, 255, 0.4), 0 0 32px rgba(80, 152, 255, 0.34); }
.shop-relic-card.rarity-epic .shop-relic-front::after { box-shadow: inset 0 0 32px rgba(210, 50, 235, 0.46), 0 0 36px rgba(210, 50, 235, 0.38); }
.shop-relic-card.rarity-unique .shop-relic-front::after { box-shadow: inset 0 0 34px rgba(242, 212, 92, 0.5), 0 0 40px rgba(242, 212, 92, 0.44); }
.shop-relic-card.rarity-legendary .shop-relic-front::after { box-shadow: inset 0 0 36px rgba(255, 108, 76, 0.52), 0 0 44px rgba(220, 78, 78, 0.46); }

/* Card packs are sealed products, so they do not inherit relic rarity-frame glows.
   기본 자원팩/강화팩/해금팩 3종에는 어떤 시각 효과도 추가하지 않는다.
   (테두리, 그림자, 발광 등 전부 금지) */
.shop-pack-card.rarity-common,
.shop-pack-card.rarity-rare,
.shop-pack-card.rarity-epic,
.shop-pack-card.rarity-unique,
.shop-pack-card.rarity-legendary {
  box-shadow: none;
}

/* Rarity glow lives on both faces so border/glow/depth remain attached during flip. */
.shop-relic-card.rarity-common .shop-relic-front,
.shop-relic-card.rarity-common .shop-relic-cardback,
.shop-pack-pick-card.rarity-common .shop-pack-pick-front,
.shop-pack-pick-card.rarity-common .shop-pack-pick-back { box-shadow: 0 0 0 1px rgba(116, 124, 136, 0.5), 0 12px 22px rgba(0,0,0,0.58); }
.shop-relic-card.rarity-rare .shop-relic-front,
.shop-relic-card.rarity-rare .shop-relic-cardback,
.shop-pack-pick-card.rarity-rare .shop-pack-pick-front,
.shop-pack-pick-card.rarity-rare .shop-pack-pick-back { box-shadow: 0 0 0 1px rgba(80, 152, 255, 0.58), 0 0 24px rgba(80,152,255,0.24), 0 12px 22px rgba(0,0,0,0.58); }
.shop-relic-card.rarity-epic .shop-relic-front,
.shop-relic-card.rarity-epic .shop-relic-cardback,
.shop-pack-pick-card.rarity-epic .shop-pack-pick-front,
.shop-pack-pick-card.rarity-epic .shop-pack-pick-back { box-shadow: 0 0 0 1px rgba(210, 50, 235, 0.65), 0 0 28px rgba(210,50,235,0.30), 0 12px 22px rgba(0,0,0,0.58); }
.shop-relic-card.rarity-unique .shop-relic-front,
.shop-relic-card.rarity-unique .shop-relic-cardback,
.shop-pack-pick-card.rarity-unique .shop-pack-pick-front,
.shop-pack-pick-card.rarity-unique .shop-pack-pick-back { box-shadow: 0 0 0 1px rgba(242, 212, 92, 0.72), 0 0 30px rgba(242,212,92,0.34), 0 12px 22px rgba(0,0,0,0.58); }
.shop-relic-card.rarity-legendary .shop-relic-front,
.shop-relic-card.rarity-legendary .shop-relic-cardback,
.shop-pack-pick-card.rarity-legendary .shop-pack-pick-front,
.shop-pack-pick-card.rarity-legendary .shop-pack-pick-back { box-shadow: 0 0 0 1px rgba(220, 78, 78, 0.72), 0 0 30px rgba(220,78,78,0.34), 0 12px 22px rgba(0,0,0,0.58); }


/* --- 2026-05 shop timing/picker unification overrides --- */
/* 리롤만 단독 지연하지 않고, shop-content-bundle 단위로 전체를 동시에 공개한다. */
.shop-price-label { z-index: 12; }
.shop-relic-price-label { z-index: 12; }
.shop-relic-card.is-rerolling { opacity: 1 !important; visibility: visible !important; }
.shop-pack-picker-veil {
  box-shadow:
    inset 0 0 0 1px rgba(255, 232, 168, 0.14),
    inset 0 0 0 2px rgba(18, 12, 24, 0.92),
    inset 0 0 96px rgba(0, 0, 0, 0.82),
    inset 0 0 160px rgba(0, 0, 0, 0.7);
}
@keyframes shop-pack-veil-fade-in {
  0% { opacity: 0; transform: scaleY(0); transform-origin: center; }
  100% { opacity: 1; transform: scaleY(1); transform-origin: center; }
}
.shop-pack-pick-card.is-fading-out { opacity: 0; scale: 0.88; transition: opacity 0.26s ease, scale 0.26s ease; }

/* 제단 모드 유물은 무료 단일 픽이라 하단 가격 라벨을 숨긴다. */
.shop-shell[data-shop-mode="altar"] .shop-relic-price-label { display: none; }
/* 선택 1장은 살짝 떠오르고, 비선택 2장은 불씨가 사그라들듯(어둡게·축소·하강) 사라진다. */
.shop-relic-card.is-altar-picked { z-index: 8; animation: altar-relic-pick 0.4s cubic-bezier(0.2, 0.86, 0.22, 1) forwards; }
@keyframes altar-relic-pick {
  0% { transform: translateY(0) scale(1); }
  100% { transform: translateY(-8px) scale(1.12); }
}
.shop-relic-card.is-altar-fading { pointer-events: none; animation: altar-relic-fade 0.34s ease forwards; }
@keyframes altar-relic-fade {
  from { opacity: 1; transform: translateY(0) scale(1); filter: brightness(1) saturate(1); }
  to { opacity: 0; transform: translateY(12px) scale(0.82); filter: brightness(0.65) saturate(0.55); }
}
.shop-pack-pick-card.is-selected { z-index: 8; animation: shop-pack-pick-selected 0.44s cubic-bezier(0.2, 0.86, 0.22, 1) forwards; }
@keyframes shop-pack-pick-selected {
  0% { transform: translateY(0) scale(1); }
  100% { transform: translateY(-8px) scale(1.24); }
}
.shop-pack-picker.is-closing .shop-pack-pick-card { animation: shop-pack-pick-lift 0.34s cubic-bezier(0.6, 0.04, 0.74, 0.92) calc(var(--pick-i, 0) * 30ms) both; }
@keyframes shop-pack-pick-lift {
  0% { transform: translateY(0) scale(1); opacity: 1; }
  100% { transform: translateY(0) scale(0.86); opacity: 0; }
}
.is-shop-purchase-impact { animation: shop-common-buy-impact 0.28s cubic-bezier(0.2, 0.86, 0.22, 1); }
@keyframes shop-common-buy-impact {
  0% { transform: translate(0, 0) rotate(0deg) scale(1); }
  25% { transform: translate(-2px, 1px) rotate(-1.2deg) scale(1.03); }
  50% { transform: translate(2px, -1px) rotate(1.4deg) scale(1.05); }
  100% { transform: translate(0, 0) rotate(0deg) scale(1); }
}


/* 제단 무료카드 2장은 유영 애니메이션보다 부채꼴 유지가 우선이므로
   최초 스폰 이후에도 transform ownership을 fan 규칙에 고정한다. */
.shop-shell[data-shop-mode="altar"] .shop-free-layer > .shop-free-card {
  animation: shop-card-enter-fade 0.5s cubic-bezier(0.18, 0.86, 0.22, 1) both;
}
.shop-shell[data-shop-mode="altar"] .shop-free-layer > .shop-free-card:nth-child(1) {
  animation-delay: 520ms;
}
.shop-shell[data-shop-mode="altar"] .shop-free-layer > .shop-free-card:nth-child(2) {
  animation-delay: 620ms;
}
@keyframes shop-card-enter-fade {
  0% { opacity: 0; }
  100% { opacity: 1; }
}

/* ─── Mobile touch: is-touch-active mirrors :hover for shop elements ──── */
/* Touch landscape: shell stays anchored over the rail (same as PC).
   positionShopShellOverRail() sets inline top/left/width/height — no !important override.
   Shell padding reduced, elements scaled down, EXIT repositioned to fit the narrow rail. */
@media (hover: none) and (pointer: coarse) and (orientation: landscape) {
  /* Regular shop: clip to rail bounds with reduced padding. */
  .shop-shell:not(.shop-shell--trial) {
    overflow: hidden;
    --shop-shell-pad-top: clamp(8px, 1vh, 12px);
    --shop-shell-pad-x: clamp(8px, 1vw, 12px);
    --shop-shell-pad-bottom: clamp(8px, 1vh, 12px);
  }
  /* Trial: stays in rail (same as PC). Cancel the relic-card max-width so
     each 1fr column in the 3-column grid fills the full rail width. */
  .shop-shell--trial .shop-relic-card {
    max-width: none;
    min-width: 0;
  }
  /* EXIT button: moved inside the content-bundle (bottom: 6px) so overflow:hidden
     doesn't clip it. Right-aligned so it clears the pack cards. */
  .shop-close-btn {
    bottom: 6px;
    right: 10px;
    font-size: 11px;
    padding: 4px 14px;
    letter-spacing: 0.16em;
  }
  /* Tighter gap between top/bottom rows to save vertical space. */
  .shop-content-bundle { gap: clamp(4px, 0.6vh, 8px); }
  /* Restore bottom-row 2-column layout (820px breakpoint collapses it to 1 column). */
  .shop-bottom-row { grid-template-columns: 3fr 7fr; }
  /* Layer padding/gap: reduced for compact mobile layout. */
  .shop-layer {
    padding: clamp(3px, 0.4vh, 6px) clamp(4px, 0.5vw, 8px);
    gap: clamp(5px, 0.7vw, 9px);
  }
  .shop-artifact-layer { gap: clamp(6px, 0.8vw, 10px); }
  /* Cards fill available flex space instead of fixed vw widths. */
  .shop-relic-card {
    flex: 1 1 0;
    width: auto;
    min-width: 64px;
    max-width: 120px;
  }
  .shop-shell[data-shop-mode="altar"] .shop-artifact-layer .shop-relic-card {
    max-width: 136px;
  }
  .shop-free-card {
    flex: 1 1 0;
    width: auto;
    min-width: 76px;
    max-width: 112px;
  }
  .shop-pack-card {
    flex: 1 1 0;
    width: auto;
    min-width: 54px;
    max-width: 100px;
  }
  /* Price label: shorter droop so it stays inside the overflow:hidden shell bounds. */
  .shop-price-label {
    bottom: -18px;
    font-size: 10px;
    padding: 2px 7px 3px 6px;
    min-width: 76px;
    gap: 4px;
  }
  .shop-price-label-icon { width: 11px; height: 11px; }
  /* Pack text: scaled down for the compact mobile rail. */
  .shop-pack-title { font-size: var(--font-size-sm); }
  .shop-pack-effect { font-size: 8px; margin-top: 2px; }
  /* Reroll button: smaller for the narrow mobile rail. */
  .shop-reroll-btn {
    width: clamp(64px, 7.8vw, 86px);
    height: clamp(54px, 7.5vh, 74px);
    font-size: 10px;
    padding: 5px 7px;
  }
  .shop-reroll-card-anchor { margin-right: clamp(4px, 0.6vw, 8px); }
  /* Neutralize translation offsets sized for full-viewport width. */
  .shop-pack-layer { transform: none; }
  .shop-free-layer { transform: none; }
}

/* Gated on (hover: none) so PC hover rules are completely unaffected. */
@media (hover: none) and (pointer: coarse) {
  .shop-relic-card.is-touch-active {
    animation-play-state: paused;
    scale: 1.06;
    box-shadow: none;
    z-index: 6;
  }
  .shop-free-layer > .shop-relic-card.is-touch-active {
    animation-play-state: paused;
    scale: 1.06;
    z-index: 7;
  }
  .shop-free-layer > .shop-relic-card:nth-child(1).is-touch-active {
    transform: translateX(clamp(12px, 1vw, 18px)) rotate(0deg);
  }
  .shop-free-layer > .shop-relic-card:nth-child(2).is-touch-active {
    transform: translateX(clamp(-12px, -1vw, -18px)) rotate(0deg);
  }
  .shop-pack-pick-card.is-touch-active {
    scale: 1.04;
    box-shadow: none;
  }
  .shop-reroll-btn.is-touch-active {
    transform: translateY(-2px) scale(1.02);
    border-color: rgba(220, 172, 80, 0.72);
    filter: brightness(1.08);
  }
  [data-shop-close].is-touch-active {
    transform: rotate(-3deg) translateY(-1px);
    filter: brightness(1.08);
  }
  /* Trial cards share .shop-relic-card but have no hover transform, so
     add an explicit scale so the touch-active state feels distinct. */
  .shop-trial-card.is-touch-active {
    scale: 1.04;
    filter: brightness(1.07);
  }
}

/* ── Shop Peek Button ────────────────────────────────────────────────
   꾹 눌러서 상점 오버레이와 셔터를 일시적으로 투명하게 만들어
   레일 상태를 확인한다. 상점/제단 오픈 중에만 표시된다.
   아이콘만 표시 — 배경/테두리 없음, drop-shadow로 가독성 확보. */
.shop-peek-btn {
  position: fixed;
  /* top/left은 JS에서 레일 rect 기준으로 동적 지정된다 */
  z-index: 9100;
  display: none;
  width: 28px;
  height: 28px;
  padding: 2px;
  border: none;
  background: none;
  color: rgba(255, 208, 96, 0.48);
  cursor: pointer;
  align-items: center;
  justify-content: center;
  filter: drop-shadow(0 2px 5px rgba(0, 0, 0, 0.58));
  animation: peek-btn-pulse 3.2s ease-in-out infinite;
  transition: color 0.18s ease, filter 0.18s ease;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
}
.shop-peek-btn.is-visible {
  display: flex;
}
.shop-peek-btn:hover {
  color: rgba(255, 228, 140, 0.74);
  filter: drop-shadow(0 2px 5px rgba(0, 0, 0, 0.68)) drop-shadow(0 0 6px rgba(255, 196, 72, 0.22));
}
.shop-peek-btn:active,
.shop-peek-btn.is-peeking {
  color: rgba(255, 232, 148, 0.95);
  filter: drop-shadow(0 2px 5px rgba(0, 0, 0, 0.75)) drop-shadow(0 0 10px rgba(255, 196, 72, 0.40));
  animation: none;
}

/* 은은한 호박색 글로우 맥동 */
@keyframes peek-btn-pulse {
  0%, 100% { filter: drop-shadow(0 2px 5px rgba(0, 0, 0, 0.55)) drop-shadow(0 0 2px rgba(255, 196, 72, 0.06)); }
  50%       { filter: drop-shadow(0 2px 5px rgba(0, 0, 0, 0.65)) drop-shadow(0 0 7px rgba(255, 196, 72, 0.22)); }
}

/* Opacity transition — always present so restore is smooth */
.shop-overlay.is-open {
  transition: opacity 0.38s ease;
}
.rail-shutter {
  transition: opacity 0.38s ease;
}

/* During peek: shop overlay and shutter fade out to reveal the rail */
body.body--peeking .shop-overlay.is-open {
  opacity: 0.04 !important;
  pointer-events: none !important;
}
body.body--peeking .rail-shutter {
  opacity: 0.05 !important;
}
`
