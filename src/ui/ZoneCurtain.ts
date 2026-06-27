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
  height: 110px;
  z-index: 50;
  pointer-events: none;
  overflow: hidden;
  transform: translateY(-100%);
  will-change: transform;
  background: rgba(8, 5, 14, 0.96);
  box-shadow: 0 1px 0 rgba(210, 168, 55, 0.20), 0 3px 16px rgba(0, 0, 0, 0.7);
}
.zone-curtain-inner {
  position: absolute;
  inset: 0;
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
  font-size: 26px;
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
   * 커튼을 내리고(제목 노출) → onBodyReady 콜백 실행 → 다시 올린다.
   * onBodyReady는 커튼이 완전히 내려온 직후 호출되며, 이 시점에 body 배경을 교체하면
   * 커튼이 올라갈 때 새 배경이 자연스럽게 드러난다.
   */
  async show(zone: ZoneInfo, onBodyReady?: () => void): Promise<void> {
    if (this.running) return
    this.running = true

    this.titleEl.textContent = zone.title

    // 초기 위치 확정을 위해 reflow를 강제한다.
    void this.el.offsetHeight

    // 슬라이드 인 (ease-out)
    this.el.style.transition = 'transform 0.52s cubic-bezier(0.22, 0.86, 0.22, 1)'
    this.el.style.transform = 'translateY(0)'
    await new Promise<void>((r) => setTimeout(r, 540))

    // 커튼이 완전히 내려온 뒤 body 배경 교체
    onBodyReady?.()

    await new Promise<void>((r) => setTimeout(r, 1600))

    // 슬라이드 아웃 (ease-in)
    this.el.style.transition = 'transform 0.44s cubic-bezier(0.64, 0, 0.78, 0)'
    this.el.style.transform = 'translateY(-100%)'
    await new Promise<void>((r) => setTimeout(r, 460))

    // 다음 show() 호출 시 순간이동하지 않도록 트랜지션 정리
    this.el.style.transition = ''

    this.running = false
  }
}
