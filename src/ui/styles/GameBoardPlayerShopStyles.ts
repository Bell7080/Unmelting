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
.relic-stack {
  display: flex;
  align-items: center;
  gap: 7px;
  max-width: clamp(120px, 16vw, 190px);
  overflow-x: auto;
  padding: 4px 2px 6px;
}
.relic-mini-card {
  flex: 0 0 clamp(58px, 5.4vw, 72px);
  aspect-ratio: 1;
  position: relative;
  overflow: visible;
  /* Wax-sealed pocket case: brass-rimmed parchment back with a subtle inner
     ring so each owned relic reads as a small artifact card rather than a
     screenshot thumbnail. */
  border-radius: 12px;
  border: 1px solid rgba(255, 215, 120, 0.5);
  background:
    radial-gradient(circle at 50% 18%, rgba(255, 232, 168, 0.26), transparent 50%),
    linear-gradient(160deg, rgba(44, 32, 40, 0.96), rgba(13, 9, 19, 0.96));
  box-shadow:
    inset 0 1px 0 rgba(255, 232, 168, 0.28),
    inset 0 0 0 1px rgba(74, 58, 42, 0.5),
    inset 0 -10px 18px rgba(0, 0, 0, 0.36),
    0 8px 18px rgba(0, 0, 0, 0.5);
  transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
}
.relic-mini-card:hover {
  transform: translateY(-1px);
  border-color: rgba(255, 232, 168, 0.82);
  box-shadow:
    inset 0 1px 0 rgba(255, 232, 168, 0.42),
    inset 0 0 0 1px rgba(120, 90, 60, 0.6),
    inset 0 -10px 18px rgba(0, 0, 0, 0.42),
    0 10px 22px rgba(0, 0, 0, 0.55),
    0 0 18px rgba(244, 164, 96, 0.28);
}
.relic-mini-art {
  position: absolute;
  inset: 5px;
  border-radius: 8px;
  background-size: cover;
  background-position: center 20%;
  filter: sepia(0.18) saturate(0.92) brightness(0.94);
}
.relic-mini-card::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  border-radius: inherit;
  background:
    linear-gradient(180deg, rgba(255, 232, 168, 0.22), transparent 36%, rgba(13, 9, 19, 0.42)),
    radial-gradient(circle at 50% 50%, transparent 56%, rgba(0, 0, 0, 0.42) 100%);
}
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
  position: relative;
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
  position: fixed;
  pointer-events: auto;
  background: transparent;
  border: 0;
  box-shadow: none;
  padding: clamp(14px, 1.6vh, 22px) clamp(16px, 2vw, 28px) clamp(18px, 2.2vh, 26px);
  display: grid;
  grid-template-rows: 1fr 1fr;
  gap: clamp(10px, 1.4vh, 16px);
  align-items: stretch;
  overflow: visible;
  animation: shop-overlay-in 0.32s cubic-bezier(0.18, 0.86, 0.22, 1);
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
  opacity: 0.92;
}

/* Layered shop layout:
   - Top : reroll button (2) + artifact layer (8)   ← reroll moved LEFT
   - Bottom: free-card layer (3) + pack layer (7)
   Each layer just MARKS an area with a subtle dark wash — no border, no
   constraint on the cards' size. Cards keep fixed widths and can visually
   extend past the layer's boundary; the layer is a hint, not a frame. */
.shop-row {
  position: relative;
  z-index: 1;
  display: grid;
  gap: clamp(10px, 1.4vw, 18px);
  align-items: stretch;
  min-height: 0;
  overflow: visible;
}
.shop-top-row    { grid-template-columns: 2fr 8fr; }
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
  /* Keep relic cards visually centered by nudging the whole cluster left. */
  transform: translateX(clamp(-10px, -1vw, -6px));
  padding-left: clamp(8px, 1.3vw, 16px);
  padding-right: clamp(8px, 1.3vw, 16px);
}
.shop-pack-layer {
  justify-content: center;
  gap: clamp(4px, 0.55vw, 8px);
  /* Match the relic row's optical center while keeping button anchors fixed. */
  transform: translateX(clamp(-10px, -1vw, -6px));
  background: transparent;
  border: none;
  box-shadow: none;
}
.shop-free-layer,
.shop-reroll-zone {
  /* Free-card and reroll layers center their single child. */
  justify-content: center;
}
.shop-free-layer {
  transform: translate(clamp(10px, 1.2vw, 16px), clamp(-8px, -0.7vh, -4px));
}
.shop-reroll-zone {
  transform: translateX(clamp(10px, 1vw, 16px));
}

/* Reroll button — compact rectangle, fixed size, paid in 화폐(coins). Lives in
   the small top-right layer.  Carved-wood frame matches the existing buy/EXIT
   button family so it reads as "control" rather than a card. */
.shop-reroll-btn {
  appearance: none;
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  width: clamp(96px, 9.8vw, 122px);
  height: clamp(68px, 8.4vh, 90px);
  padding: 8px 12px;
  border: 1px solid rgba(255, 215, 120, 0.42);
  border-radius: 12px;
  background:
    linear-gradient(180deg, rgba(120, 76, 36, 0.96), rgba(58, 30, 14, 0.96)),
    repeating-linear-gradient(135deg, rgba(0, 0, 0, 0.06) 0 2px, rgba(255, 232, 168, 0.04) 2px 5px);
  color: rgba(255, 232, 168, 0.96);
  font-family: inherit;
  font-weight: 900;
  letter-spacing: 0.04em;
  cursor: pointer;
  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.85);
  box-shadow:
    inset 0 1px 0 rgba(255, 232, 168, 0.3),
    inset 0 -3px 6px rgba(0, 0, 0, 0.55),
    0 6px 14px rgba(0, 0, 0, 0.55);
  transition: transform 0.16s ease, box-shadow 0.16s ease, filter 0.16s ease;
}
.shop-reroll-btn:hover {
  transform: translateY(-1px);
  filter: brightness(1.1);
  box-shadow:
    inset 0 1px 0 rgba(255, 232, 168, 0.5),
    inset 0 -3px 6px rgba(0, 0, 0, 0.6),
    0 8px 18px rgba(0, 0, 0, 0.65),
    0 0 16px rgba(244, 164, 96, 0.35);
}
.shop-reroll-btn-title {
  font-size: 14px;
  line-height: 1;
}
.shop-reroll-btn-cost {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-variant-numeric: tabular-nums;
}
.shop-reroll-btn-cost-text { font-size: 13px; }
.shop-reroll-btn.is-unaffordable {
  filter: saturate(0.7) brightness(0.78);
  cursor: not-allowed;
}
.shop-reroll-btn.is-affordable { border-color: rgba(122, 202, 113, 0.7); }
.shop-reroll-btn.is-reroll-impacted {
  animation: shop-reroll-impact 0.42s cubic-bezier(0.2, 0.86, 0.22, 1);
}

/* Free-card tile gets a warm candle-glow art band. */
.shop-free-card .shop-free-art {
  background:
    radial-gradient(ellipse 60% 80% at 50% 60%, rgba(255, 232, 168, 0.55), transparent 70%),
    radial-gradient(circle at 50% 30%, rgba(255, 188, 96, 0.32), transparent 60%),
    linear-gradient(180deg, rgba(48, 31, 43, 0.92), rgba(18, 12, 24, 0.96));
}


/* Free card stays visually secondary to paid relic offers, so shrink it a touch. */
.shop-free-card {
  width: clamp(124px, 11.8vw, 178px);
}

/* Pack tile — FULL illustration with centered title/effect overlay. This is
   intentionally NOT the relic-card art+body split: the pack reads as a
   single illustrated envelope, not a card with a separate text panel. */
.shop-pack-card {
  position: relative;
  flex: 0 0 auto;
  /* Keep the original pack-card size so bottom-row rhythm stays unchanged. */
  width: clamp(116px, 10.9vw, 164px);
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
  transform-style: preserve-3d;
}
.shop-relic-flipper.is-rerolling {
  /* 손패 미리보기와 같은 방식으로 flipper만 회전시킨다.
     카드 루트는 불투명 상태를 유지해, 백페이스가 실제로 어디에/어떻게 보이는지
     레이어 겹침 이슈를 디버깅할 때 항상 같은 기준면을 확보한다. */
  will-change: transform;
  animation: shop-reroll-card-flip var(--shop-reroll-flip-ms, 0.52s) cubic-bezier(0.4, 0.08, 0.6, 0.94) var(--shop-reroll-stagger, 0ms) both;
}
.shop-pack-layer > .shop-pack-card:nth-child(1) { animation-delay: 500ms, 1.3s; }
.shop-pack-layer > .shop-pack-card:nth-child(2) { animation-delay: 600ms, 2.1s; }
.shop-pack-layer > .shop-pack-card:nth-child(3) { animation-delay: 700ms, 2.9s; }
.shop-pack-card:hover,
.shop-pack-card:focus-visible {
  animation-play-state: paused;
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
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9);
}
.shop-pack-effect {
  margin: 4px 0 0;
  color: rgba(255, 244, 210, 0.86);
  font-size: var(--font-size-sm);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.85);
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
  justify-content: center;
  gap: clamp(8px, 1.2vh, 14px);
  padding: clamp(10px, 1.4vh, 18px);
}
.shop-pack-picker-head {
  text-align: center;
  color: rgba(255, 232, 168, 0.96);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.85);
  animation: shop-pack-head-fade 0.32s ease 0.28s both;
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
  font-size: 18px;
  letter-spacing: 0.08em;
  font-weight: 900;
}
.shop-pack-picker-head p {
  margin: 4px 0 0;
  color: rgba(232, 214, 180, 0.82);
  font-size: 13px;
}
.shop-pack-picker-cards {
  display: grid;
  grid-template-columns: repeat(3, minmax(120px, 1fr));
  gap: clamp(8px, 1.2vw, 16px);
  width: 100%;
  max-width: clamp(420px, 56vw, 640px);
}
.shop-pack-pick-card {
  position: relative;
  border-radius: 14px;
  border: 1px solid rgba(255, 215, 120, 0.5);
  background: linear-gradient(180deg, rgba(45, 30, 39, 0.98), rgba(18, 12, 24, 0.98));
  box-shadow:
    inset 0 1px 0 rgba(255, 232, 168, 0.22),
    0 14px 28px rgba(0, 0, 0, 0.65);
  padding: 14px 12px 16px;
  min-height: 160px;
  cursor: pointer;
  transform-style: preserve-3d;
  transform-origin: center bottom;
  /* 손패/리롤과 같은 backface 노출 플립만 사용한다.
     하늘에서 떨어지지 않고, 원래 자리에서 등장한다. */
  animation:
    shop-pack-pick-fade-in 0.26s ease calc(var(--pick-i, 0) * 110ms + 0.34s) both,
    shop-reroll-card-flip 0.8s cubic-bezier(0.4, 0.08, 0.6, 0.94) calc(var(--pick-i, 0) * 110ms + 0.72s) both;
}
.shop-pack-pick-card > * {
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
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
  background-image: var(--cardback-url);
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  transform: rotateY(180deg);
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
  pointer-events: none;
  z-index: 5;
}
.shop-pack-pick-card:hover,
.shop-pack-pick-card:focus-visible {
  /* Scale via individual property so it composes with the rotateY held by
     the flip animation's 'both' fill mode. */
  scale: 1.04;
  box-shadow:
    inset 0 1px 0 rgba(255, 232, 168, 0.32),
    0 18px 36px rgba(0, 0, 0, 0.7),
    0 0 28px rgba(244, 164, 96, 0.4);
}
.shop-pack-pick-card.pack-theme-resource { border-color: rgba(146, 220, 138, 0.62); }
.shop-pack-pick-card.pack-theme-upgrade { border-color: rgba(244, 164, 96, 0.62); }
.shop-pack-pick-card.pack-theme-unlock { border-color: rgba(180, 142, 230, 0.62); }
@keyframes shop-pack-pick-fade-in {
  0% { opacity: 0; }
  100% { opacity: 1; }
}
.shop-pack-picker.is-closing .shop-pack-pick-card {
  /* Override the entrance animations so cards lift back up cleanly when
     the player picks one. Stagger reversed so the leftmost rises first. */
  animation: shop-pack-pick-lift 0.34s cubic-bezier(0.6, 0.04, 0.74, 0.92) calc(var(--pick-i, 0) * 80ms) both;
  pointer-events: none;
}
@keyframes shop-pack-pick-lift {
  0%   { transform: translateY(0) rotateY(360deg); opacity: 1; }
  100% { transform: translateY(-200%) rotateY(360deg); opacity: 0; }
}

.shop-relic-card {
  position: relative;
  /* Front content uses an inner .shop-relic-front grid. The card root stays
     as the 3D container when rerolling flips are active. */
  display: block;
  overflow: visible; /* let the flat price tag poke past the bottom */
  border-radius: 14px;
  border: 1px solid rgba(255, 215, 120, 0.42);
  background: linear-gradient(180deg, rgba(45, 30, 39, 0.96), rgba(18, 12, 24, 0.96));
  box-shadow: inset 0 1px 0 rgba(255, 232, 168, 0.18), 0 12px 24px rgba(0, 0, 0, 0.55);
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
/* Reroll button enters AND exits with the relic cards.  Driven by a
   transition keyed to .shop-overlay.is-open / .shop-shell.is-closing
   (not an animation), so the .is-reroll-impacted animation can't clobber
   the held opacity. Uses the individual translate/scale channels so the
   impact's transform and the hover's transform compose without fighting. */
.shop-reroll-btn {
  opacity: 0;
  translate: 0 -130%;
  scale: 0.9;
  transition:
    opacity 0.34s cubic-bezier(0.6, 0.04, 0.74, 0.92),
    translate 0.34s cubic-bezier(0.6, 0.04, 0.74, 0.92),
    scale 0.34s cubic-bezier(0.6, 0.04, 0.74, 0.92),
    transform 0.16s ease,
    box-shadow 0.16s ease,
    filter 0.16s ease;
}
.shop-overlay.is-open .shop-reroll-btn {
  opacity: 1;
  translate: 0 0;
  scale: 1;
  /* 상점 진입 시 유물 카드가 먼저 다 열린 뒤, 리롤 버튼은 한 텀 늦게
     부드럽게 따라 나오도록 의도적으로 딜레이를 더 준다. */
  transition:
    opacity 0.5s cubic-bezier(0.18, 0.86, 0.22, 1) 760ms,
    translate 0.5s cubic-bezier(0.18, 0.86, 0.22, 1) 760ms,
    scale 0.5s cubic-bezier(0.18, 0.86, 0.22, 1) 760ms,
    transform 0.16s ease,
    box-shadow 0.16s ease,
    filter 0.16s ease;
}
.shop-shell.is-closing .shop-reroll-btn {
  /* Leave together with the cards' bounce+swoosh. No transition-delay on
     exit so the button departs in the same beat the cards start their
     swoosh upward. */
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
  animation-play-state: paused;
  scale: 1.06;
  box-shadow:
    inset 0 1px 0 rgba(255, 232, 168, 0.32),
    0 18px 36px rgba(0, 0, 0, 0.65),
    0 0 30px rgba(244, 164, 96, 0.4);
  z-index: 6;
}
.shop-relic-card.is-affordable {
  border-color: rgba(122, 202, 113, 0.62);
  box-shadow:
    inset 0 1px 0 rgba(223, 255, 183, 0.22),
    0 12px 24px rgba(0, 0, 0, 0.55),
    0 0 20px rgba(78, 168, 82, 0.16);
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
  position: relative;
  display: grid;
  grid-template-rows: 50% 1fr;
  height: 100%;
  min-height: 0;
  /* Explicit front-face plane so backface culling is stable across engines. */
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
  min-width: 84px;
  justify-content: center;
  padding: 4px 11px 5px 8px;
  border-radius: 4px 4px 8px 8px;
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
  /* Short string between the card's bottom edge and the tag's top, filling
     the gap so the tag visually reads as tied to the card. */
  content: '';
  position: absolute;
  top: -7px;
  left: 50%;
  width: 2px;
  height: 7px;
  transform: translateX(-50%);
  background: linear-gradient(180deg, rgba(255, 215, 120, 0.6), rgba(255, 215, 120, 0.15));
  border-radius: 1px;
}
.shop-pack-price {
  bottom: -34px;
}
.shop-price-label-icon {
  display: inline-flex;
  width: 15px;
  height: 15px;
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
@keyframes shop-reroll-card-flip {
  /* Three-beat flip: front→back (0-32%), HOLD on the back (32-58%), then
     back→front (58-100%). No filter in keyframes — filter forces
     transform-style:flat and breaks the 3D backface mechanism. */
  0%   { transform: perspective(820px) rotateY(0deg); }
  32%  { transform: perspective(820px) rotateY(180deg); }
  58%  { transform: perspective(820px) rotateY(180deg); }
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
  .shop-top-row,
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

@media (max-height: 600px) {
  .rail-row.dist-2 { opacity: 0.3; transform: scale(0.86); }
  .rail-row.dist-1 { opacity: 0.6; transform: scale(0.92); }
  .player-card { width: clamp(120px, 14vw, 160px); }
}



/* Rarity glow-only language (no text labels) shared by relic/free/pack cards. */
.rarity-common { box-shadow: 0 0 0 1px rgba(116, 124, 136, 0.5), 0 12px 22px rgba(0,0,0,0.58); }
.rarity-rare { box-shadow: 0 0 0 1px rgba(80, 152, 255, 0.58), 0 0 24px rgba(80,152,255,0.24), 0 12px 22px rgba(0,0,0,0.58); }
.rarity-epic { box-shadow: 0 0 0 1px rgba(161, 108, 255, 0.62), 0 0 26px rgba(161,108,255,0.28), 0 12px 22px rgba(0,0,0,0.58); }
.rarity-unique { box-shadow: 0 0 0 1px rgba(242, 212, 92, 0.72), 0 0 30px rgba(242,212,92,0.34), 0 12px 22px rgba(0,0,0,0.58); }
.rarity-legendary { box-shadow: 0 0 0 1px rgba(220, 78, 78, 0.72), 0 0 30px rgba(220,78,78,0.34), 0 12px 22px rgba(0,0,0,0.58); }

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
  background-image: var(--cardback-url);
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  transform: rotateY(180deg);
  pointer-events: none;
  /* Keep the back texture above all front-face children while rerolling.
     This avoids title/price artifacts bleeding through during the hold beat. */
  z-index: 2;
}
/* NOTE: reroll 활성 상태 제어는 상단 .shop-relic-flipper.is-rerolling 블록에서
   단일 소스로 관리한다. 중복 선언을 제거해 앞/뒷면 애니메이션 충돌을 막는다. */

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

`
