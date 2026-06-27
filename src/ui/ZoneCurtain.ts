/**
 * 구역 전환 커튼 — 층이 바뀔 때(1F 시작, 30F/60F/90F 보스 시련 종료 후)
 * 상단에서 슬라이드 인/아웃하며 구역 이름을 짧게 노출한다.
 * 불씨 게이지 HUD(z-index 35) 위인 z-index 50에 배치한다.
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
  /* 하단으로 갈수록 투명해지는 그라데이션 커튼 */
  background: linear-gradient(
    to bottom,
    rgba(8, 5, 14, 0.97) 0%,
    rgba(8, 5, 14, 0.95) 45%,
    rgba(8, 5, 14, 0.72) 68%,
    rgba(8, 5, 14, 0.30) 85%,
    transparent 100%
  );
  will-change: transform;
  /* 초기 위치: 화면 위로 완전히 숨김 */
  transform: translateY(-100%);
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
    0 2px 12px rgba(210, 168, 55, 0.50),
    0 0 30px rgba(210, 168, 55, 0.18);
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
    await new Promise<void>((r) => setTimeout(r, 1400))

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
