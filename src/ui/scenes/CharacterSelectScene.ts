import type { Scene, SceneContext } from './Scene'

/**
 * 캐릭터 선택 골격. 현재 플레이어블은 '녹지 않는 소녀' 1명이며 기본 선택된다.
 * 두 번째 슬롯은 잠긴 튜토리얼 캐릭터 플레이스홀더(상호작용 없음).
 * TODO(M3): 튜토리얼 캐릭터 해금, 초상/스탯 표시, characterId를
 *   GameState.reset()/Character(entities/Character.ts:54)로 연결해 실제 아바타 반영.
 */
export class CharacterSelectScene implements Scene {
  private root: HTMLElement | null = null

  mount(host: HTMLElement, ctx: SceneContext): void {
    // 유일 플레이어블을 기본값으로 초안에 기록.
    ctx.draft.characterId = 'unmelting-girl'

    const el = document.createElement('div')
    el.className = 'scene-panel'
    el.innerHTML = `
      <div class="scene-eyebrow">CHARACTER</div>
      <h1 class="scene-title">동행을 고르세요</h1>
      <div class="scene-cards">
        <div class="scene-card is-selected" data-char="unmelting-girl">
          <div class="scene-card-name">녹지 않는 소녀</div>
          <div class="scene-card-note">기본 동행</div>
        </div>
        <div class="scene-card is-locked" aria-disabled="true">
          <div class="scene-card-name">???</div>
          <div class="scene-card-note">튜토리얼 · 잠김</div>
        </div>
      </div>
      <div class="scene-actions">
        <button class="scene-btn is-ghost" data-act="cancel">뒤로</button>
        <button class="scene-btn" data-act="next">다음</button>
      </div>
    `
    // 잠긴 카드는 무반응. 현재 선택 가능한 카드는 하나뿐이라 이미 선택 상태다.
    el.querySelector<HTMLButtonElement>('[data-act="next"]')!
      .addEventListener('click', () => ctx.advance())
    el.querySelector<HTMLButtonElement>('[data-act="cancel"]')!
      .addEventListener('click', () => ctx.cancel())
    host.appendChild(el)
    this.root = el
  }

  unmount(): void {
    this.root?.remove()
    this.root = null
  }
}
