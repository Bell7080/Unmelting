/**
 * 구역 전환 커튼 — 층이 바뀔 때(1F 시작, 30F/60F/90F 보스 시련 종료 후)
 * 상단에서 슬라이드 인/아웃하며 구역 이름을 짧게 노출한다.
 * 빛 게이지 HUD(z-index 35) 위인 z-index 50에 배치한다.
 */

import { SpriteUrls } from './Sprites'

export interface ZoneInfo {
  /** body 배경 교체용 URL — 커튼 내부 표시에는 쓰지 않는다. */
  bgUrl: string
  title: string
}

/** 4개 구역 정의 — 배열 인덱스 0~3이 구역 1~4에 대응한다. */
export const ZONE_LIST: readonly ZoneInfo[] = [
  { bgUrl: SpriteUrls.zoneBg[0], title: '오래된 저택' },
  { bgUrl: SpriteUrls.zoneBg[1], title: '정원 풀밭' },
  { bgUrl: SpriteUrls.zoneBg[2], title: '어두운 숲' },
  { bgUrl: SpriteUrls.zoneBg[3], title: '더욱 깊은 숲' },
]

/**
 * 새싹 병아리(온보딩) 런의 구역. 30층 한 구역뿐이라 목록이 아니라 상수 하나다 —
 * 정규 런의 1구역(오래된 저택)과 배경·이름을 갈라, 첫 모험이 다른 곳임을 화면이 말한다.
 */
export const SPROUT_ZONE: ZoneInfo = { bgUrl: SpriteUrls.sproutZoneBg, title: '새싹 온실' }

/** 제목이 화면에 머무는 시간. 커튼 강하·상승(약 1.1초)과 별개다. */
export const ZONE_CURTAIN_HOLD_MS = 3400

const CURTAIN_CSS = `
#zone-curtain {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  /* 하단 그라데이션 여유를 포함한 높이 — 실제 불투명 구역은 상단 ~60% */
  height: 200px;
  z-index: 50;
  pointer-events: none;
  /* 하단으로 갈수록 투명해지는 그라데이션 커튼.
     색은 더 어둡게(먹빛), 불투명도는 더 낮게 잡는다 — 판을 완전히 덮으면 '가림막'이지만
     아래 보드가 비쳐야 '내려온 천'으로 읽힌다. 뒤를 흐려 그 반투명을 거들어 준다. */
  background: linear-gradient(
    to bottom,
    rgba(4, 2, 8, 0.70) 0%,
    rgba(4, 2, 8, 0.66) 45%,
    rgba(4, 2, 8, 0.46) 68%,
    rgba(4, 2, 8, 0.18) 85%,
    transparent 100%
  );
  backdrop-filter: blur(2.5px) saturate(0.9);
  will-change: transform;
  /* 초기 위치: 화면 위로 완전히 숨김 */
  transform: translateY(-100%);
}
/* 낡은 종이 결 — 커튼이 매끈한 색판이 아니라 천/종이로 읽히게 하는 미세 그레인.
   전용 이미지 에셋 없이 SVG 프랙탈 노이즈를 데이터 URI로 깐다(자기완결·네트워크 없음).
   같은 세로 그라데이션으로 마스크해 하단에서 질감도 함께 사라지게 한다 —
   안 하면 커튼은 흐려지는데 결만 사각형으로 남아 경계가 드러난다. */
#zone-curtain::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0.22;
  mix-blend-mode: overlay;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.72' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)'/%3E%3C/svg%3E");
  background-size: 160px 160px;
  -webkit-mask-image: linear-gradient(to bottom, #000 0%, #000 45%, rgba(0,0,0,0.62) 68%, rgba(0,0,0,0.24) 85%, transparent 100%);
  mask-image: linear-gradient(to bottom, #000 0%, #000 45%, rgba(0,0,0,0.62) 68%, rgba(0,0,0,0.24) 85%, transparent 100%);
}
/* 제목 뒤 국소 암막 — 커튼 자체는 옅어도 글자는 선명해야 한다. 커튼 전체를 더 어둡게
   하는 대신 **글자가 앉는 자리만** 눌러, 보드는 계속 비치면서 제목만 또렷하게 남는다. */
.zone-curtain-inner::before {
  content: '';
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: min(560px, 66vw);
  height: 190%;
  z-index: -1;
  filter: blur(6px);
  background: radial-gradient(ellipse at center, rgba(3, 2, 7, 0.82) 0%, rgba(3, 2, 7, 0.52) 46%, rgba(3, 2, 7, 0) 74%);
}
.zone-curtain-inner {
  position: absolute;
  /* 텍스트/선은 상단 불투명 구역 안에 배치 */
  top: 0;
  left: 0;
  right: 0;
  height: 62%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 9px;
}
.zone-curtain-rule {
  width: 200px;
  height: 1px;
  background: linear-gradient(
    to right,
    transparent,
    rgba(210, 168, 55, 0.55) 20%,
    rgba(228, 195, 90, 0.70) 50%,
    rgba(210, 168, 55, 0.55) 80%,
    transparent
  );
}
.zone-curtain-title {
  font-family: 'OkDanDan', 'Georgia', 'Times New Roman', serif;
  font-size: 28px;
  font-weight: 700;
  color: rgba(248, 222, 124, 0.97);
  letter-spacing: 0.28em;
  text-shadow:
    0 2px 5px rgba(0, 0, 0, 0.92),
    0 2px 14px rgba(210, 168, 55, 0.55),
    0 0 30px rgba(210, 168, 55, 0.20);
  white-space: nowrap;
  user-select: none;
}
`

export class ZoneCurtain {
  private readonly el: HTMLElement
  private readonly titleEl: HTMLElement
  private running = false

  constructor() {
    const style = document.createElement('style')
    style.textContent = CURTAIN_CSS
    document.head.appendChild(style)

    this.el = document.createElement('div')
    this.el.id = 'zone-curtain'
    this.el.setAttribute('aria-hidden', 'true')
    this.el.innerHTML = `
      <div class="zone-curtain-inner">
        <div class="zone-curtain-rule"></div>
        <div class="zone-curtain-title"></div>
        <div class="zone-curtain-rule"></div>
      </div>
    `
    document.body.appendChild(this.el)
    this.titleEl = this.el.querySelector<HTMLElement>('.zone-curtain-title')!
  }

  /**
   * 커튼을 내리고(제목 노출) → 배경 교체 → 올린다.
   *
   * onBodyReady는 커튼이 올라가기 직전에 호출된다. 이 타이밍에 배경을 교체하면
   * 크로스페이드가 커튼 상승과 겹쳐서 배경이 자연스럽게 페이드인된다.
   */
  async show(zone: ZoneInfo, onBodyReady?: () => void): Promise<void> {
    if (this.running) return
    this.running = true

    this.titleEl.textContent = zone.title

    // ── 1. 배경 교체 + 슬라이드 다운 동시 시작 ────────────────────────────
    // bg crossfade(0.6s)와 커튼 강하(0.58s)가 함께 진행되어,
    // 커튼이 완전히 내려왔을 때 배경이 이미 자연스럽게 전환돼 있다.
    onBodyReady?.()
    await this.el.animate(
      [
        { transform: 'translateY(-100%)' },
        { transform: 'translateY(0)' },
      ],
      {
        duration: 580,
        easing: 'cubic-bezier(0.16, 1, 0.3, 1)', // ease-out spring
        fill: 'forwards',
      }
    ).finished

    // ── 2. 제목 노출 홀드 ─────────────────────────────────────────────────
    // 구역 이름은 한 런에 네 번뿐인 드문 알림이라 충분히 읽히도록 오래 머문다.
    await new Promise<void>((r) => setTimeout(r, ZONE_CURTAIN_HOLD_MS))

    // ── 3. 슬라이드 업 (스르륵 올라감) ───────────────────────────────────
    await this.el.animate(
      [
        { transform: 'translateY(0)' },
        { transform: 'translateY(-100%)' },
      ],
      {
        duration: 520,
        easing: 'cubic-bezier(0.55, 0, 0.9, 0.4)', // ease-in
        fill: 'forwards',
      }
    ).finished

    this.running = false
  }
}
