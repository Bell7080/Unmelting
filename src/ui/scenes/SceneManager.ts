import type { RunConfig, Scene, SceneContext } from './Scene'

interface SceneFlowHandlers {
  onComplete(config: RunConfig): void
  onCancel(): void
}

/**
 * #game-board 옆 형제 오버레이(#scene-overlay)만 소유하는 가벼운 씬 전환기.
 * 모놀리식 index.ts/게임 모듈은 건드리지 않는다 — 흐름 동안 보드를 display로
 * 숨겼다가 종료 시 되살린다. 기본 부팅은 여전히 직행(인게임)이며 이 매니저는
 * `/시작` 명령에서만 깨어난다.
 * TODO(M5): 기본 부팅을 startGame() 직행 대신 이 매니저로 전환.
 */
export class SceneManager {
  private overlay: HTMLElement | null = null
  private current: Scene | null = null
  private flow: Scene[] = []
  private index = 0
  private handlers: SceneFlowHandlers | null = null
  private draft: Partial<RunConfig> = {}
  private readonly board: HTMLElement | null
  // ESC 취소용 — 흐름 동안에만 document에 부착했다가 teardown에서 제거한다.
  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && this.current) {
      e.preventDefault()
      this.cancel()
    }
  }

  constructor(_appRoot: HTMLElement) {
    this.board = document.getElementById('game-board')
  }

  /** 흐름 시작: 보드를 숨기고 첫 씬을 마운트한다. 이미 진행 중이면 무시. */
  start(flow: Scene[], handlers: SceneFlowHandlers): void {
    if (this.current) return
    this.flow = flow
    this.index = 0
    this.handlers = handlers
    this.draft = {}
    this.ensureOverlay()
    if (this.board) this.board.style.display = 'none'
    this.overlay!.style.display = 'flex'
    document.addEventListener('keydown', this.onKeyDown)
    this.mountCurrent()
  }

  private makeContext(): SceneContext {
    return {
      advance: () => this.advance(),
      cancel: () => this.cancel(),
      complete: (config) => this.complete(config),
      draft: this.draft,
    }
  }

  private mountCurrent(): void {
    this.current = this.flow[this.index] ?? null
    if (!this.current || !this.overlay) return
    this.overlay.innerHTML = ''
    this.current.mount(this.overlay, this.makeContext())
  }

  private advance(): void {
    if (!this.current) return
    this.current.unmount()
    this.index += 1
    // 마지막 씬은 advance가 아니라 complete()로 흐름을 끝낸다.
    if (this.index >= this.flow.length) return
    this.mountCurrent()
  }

  private complete(config: RunConfig): void {
    const handlers = this.handlers
    this.teardown()
    handlers?.onComplete(config)
  }

  private cancel(): void {
    const handlers = this.handlers
    this.teardown()
    handlers?.onCancel()
  }

  /** 오버레이를 닫고 보드를 되살린다. */
  private teardown(): void {
    this.current?.unmount()
    this.current = null
    this.flow = []
    this.handlers = null
    document.removeEventListener('keydown', this.onKeyDown)
    if (this.overlay) {
      this.overlay.innerHTML = ''
      this.overlay.style.display = 'none'
    }
    if (this.board) this.board.style.display = ''
  }

  /** 오버레이 컨테이너 + 공유 씬 스타일을 1회 생성한다. */
  private ensureOverlay(): void {
    if (this.overlay) return
    this.injectStyleOnce()
    const el = document.createElement('div')
    el.id = 'scene-overlay'
    el.style.display = 'none'
    document.body.appendChild(el)
    this.overlay = el
  }

  private injectStyleOnce(): void {
    if (document.getElementById('scene-overlay-style')) return
    const style = document.createElement('style')
    style.id = 'scene-overlay-style'
    // 보드 오버레이(z≈141)보다 위. 촛불/낡은 종이 톤 유지.
    style.textContent = `
      #scene-overlay { position: fixed; inset: 0; z-index: 200; display: none; align-items: center; justify-content: center; padding: 24px;
        background:
          radial-gradient(ellipse at top, rgba(244,164,96,0.16), transparent 60%),
          linear-gradient(180deg, rgba(20,16,28,0.92), rgba(8,5,14,0.97)); }
      .scene-panel { display: flex; flex-direction: column; align-items: center; gap: 14px; width: min(680px, 100%);
        padding: 34px 30px; border: 1px solid rgba(255,215,120,0.4); border-radius: 18px;
        background: linear-gradient(180deg, rgba(38,26,48,0.96), rgba(18,12,24,0.97));
        box-shadow: 0 24px 56px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,232,168,0.18);
        font-family: 'OkDanDan', Georgia, 'Times New Roman', serif; color: rgba(255,245,220,0.96); text-align: center; }
      .scene-eyebrow { font-size: 13px; letter-spacing: 0.42em; color: rgba(255,215,120,0.7); }
      .scene-title { margin: 0; font-size: clamp(28px, 4vw, 44px); font-weight: 900; color: #ffe7a8;
        text-shadow: 0 2px 10px rgba(240,170,40,0.4); }
      .scene-sub { margin: 0; font-size: 14px; color: rgba(232,214,180,0.82); }
      .scene-section-label { align-self: flex-start; margin-top: 6px; font-size: 12px; letter-spacing: 0.12em; color: rgba(255,215,120,0.72); }
      .scene-cards { display: flex; gap: 14px; flex-wrap: wrap; justify-content: center; }
      .scene-card { width: 150px; padding: 16px 12px; border-radius: 14px; cursor: pointer;
        border: 1px solid rgba(255,215,120,0.4); background: linear-gradient(180deg, rgba(45,30,39,0.96), rgba(18,12,24,0.96));
        transition: transform 0.16s ease, border-color 0.16s ease, box-shadow 0.16s ease; }
      .scene-card:hover { transform: translateY(-2px); }
      .scene-card.is-selected { border-color: rgba(255,232,168,0.95); box-shadow: 0 0 22px rgba(244,164,96,0.4); }
      .scene-card.is-locked { cursor: default; opacity: 0.5; filter: grayscale(0.6); }
      .scene-card-name { font-size: 15px; font-weight: 800; color: #ffe7a8; }
      .scene-card-note { margin-top: 6px; font-size: 11px; color: rgba(232,214,180,0.7); }
      .scene-toggles { display: flex; flex-direction: column; gap: 8px; align-self: stretch; }
      .scene-toggle { display: flex; align-items: center; gap: 8px; font-size: 13px; color: rgba(232,214,180,0.9); cursor: pointer; }
      .scene-actions { display: flex; gap: 12px; margin-top: 8px; }
      .scene-btn { padding: 11px 26px; border-radius: 999px; border: 1px solid rgba(255,215,120,0.5); cursor: pointer;
        background: linear-gradient(180deg, #f4b860, #d98a2e); color: #2a1b14; font: 800 15px/1 'OkDanDan', Georgia, serif;
        transition: transform 0.15s ease, box-shadow 0.15s ease; }
      .scene-btn:hover { transform: translateY(-1px); box-shadow: 0 8px 20px rgba(244,164,96,0.4); }
      .scene-btn:active { transform: translateY(0); }
      .scene-btn.is-ghost { background: rgba(38,26,48,0.92); color: rgba(255,215,120,0.9); }
      .scene-difficulty { display: flex; gap: 10px; }
      .scene-difficulty .scene-btn.is-ghost.is-selected { border-color: rgba(255,232,168,0.95); box-shadow: 0 0 18px rgba(244,164,96,0.4); color: #ffe7a8; }
    `
    document.head.appendChild(style)
  }
}
