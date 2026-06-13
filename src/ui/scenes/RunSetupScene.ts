import type { RunConfig, RunDifficulty, Scene, SceneContext } from './Scene'

const DIFFICULTIES: { id: RunDifficulty; label: string }[] = [
  { id: 'normal', label: '보통' },
  { id: 'hard', label: '어려움' },
  { id: 'nightmare', label: '악몽' },
]

// 비구속 선택 룰. 체크해도/안 해도 그만이며 M1에선 시각 스텁이다.
const RULE_TOGGLES: { id: string; label: string }[] = [
  { id: 'startingHand', label: '초반 손패 사용' },
  { id: 'banList', label: '금지 목록 사용' },
]

/**
 * 난이도 + 선택 룰 토글 골격. "출발"로 흐름을 완료해 런을 시작한다.
 * TODO(M4): difficulty를 runModifiers로 실효화, rules 토글을
 *   runCardPool.ban/초반 손패(character.addHandCard)에 바인딩. 어센션 해금 사다리.
 */
export class RunSetupScene implements Scene {
  private root: HTMLElement | null = null
  private difficulty: RunDifficulty = 'normal'
  private readonly rules: Record<string, boolean> = { startingHand: false, banList: false }

  mount(host: HTMLElement, ctx: SceneContext): void {
    const el = document.createElement('div')
    el.className = 'scene-panel'
    el.innerHTML = `
      <div class="scene-eyebrow">RUN</div>
      <h1 class="scene-title">모험 설정</h1>
      <div class="scene-section-label">난이도</div>
      <div class="scene-difficulty">
        ${DIFFICULTIES.map((d) =>
          `<button class="scene-btn is-ghost${d.id === this.difficulty ? ' is-selected' : ''}" data-diff="${d.id}">${d.label}</button>`
        ).join('')}
      </div>
      <div class="scene-section-label">선택 룰</div>
      <div class="scene-toggles">
        ${RULE_TOGGLES.map((r) =>
          `<label class="scene-toggle"><input type="checkbox" data-rule="${r.id}" /> ${r.label}</label>`
        ).join('')}
      </div>
      <div class="scene-actions">
        <button class="scene-btn is-ghost" data-act="cancel">뒤로</button>
        <button class="scene-btn" data-act="start">출발</button>
      </div>
    `

    el.querySelectorAll<HTMLButtonElement>('[data-diff]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.difficulty = btn.dataset.diff as RunDifficulty
        el.querySelectorAll('[data-diff]').forEach((b) => b.classList.remove('is-selected'))
        btn.classList.add('is-selected')
      })
    })
    el.querySelectorAll<HTMLInputElement>('[data-rule]').forEach((box) => {
      box.addEventListener('change', () => { this.rules[box.dataset.rule!] = box.checked })
    })

    el.querySelector<HTMLButtonElement>('[data-act="cancel"]')!
      .addEventListener('click', () => ctx.cancel())
    el.querySelector<HTMLButtonElement>('[data-act="start"]')!
      .addEventListener('click', () => {
        const config: RunConfig = {
          characterId: ctx.draft.characterId ?? 'unmelting-girl',
          difficulty: this.difficulty,
          rules: { ...this.rules },
        }
        ctx.complete(config)
      })
    host.appendChild(el)
    this.root = el
  }

  unmount(): void {
    this.root?.remove()
    this.root = null
  }
}
