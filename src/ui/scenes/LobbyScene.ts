import type { Scene, SceneContext } from './Scene'

/**
 * 로비(메인 허브)의 골격. 지금은 타이틀 + 단일 "시작" 버튼뿐이다.
 * TODO(M2): Continue/유물 도감/설정 진입, 셔터·veil 전환 연출, 타이틀 아트.
 */
export class LobbyScene implements Scene {
  private root: HTMLElement | null = null

  mount(host: HTMLElement, ctx: SceneContext): void {
    const el = document.createElement('div')
    el.className = 'scene-panel'
    el.innerHTML = `
      <div class="scene-eyebrow">UNMELTING</div>
      <h1 class="scene-title">녹지 않는 소녀</h1>
      <p class="scene-sub">촛불을 밝혀, 굴레의 밤으로.</p>
      <div class="scene-actions">
        <button class="scene-btn" data-act="start">시작 / Start</button>
      </div>
    `
    el.querySelector<HTMLButtonElement>('[data-act="start"]')!
      .addEventListener('click', () => ctx.advance())
    host.appendChild(el)
    this.root = el
  }

  unmount(): void {
    this.root?.remove()
    this.root = null
  }
}
