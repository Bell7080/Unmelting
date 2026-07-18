/**
 * ResourceTrailFx — 자원 트레일/버스트 연출 엔진(출처 → HUD 목적지 사각 파편 트레일).
 * GameBoardRenderer에서 연출 책임만 옮겨 왔다 — 렌더 상태의 단일 출처는 host다.
 */

import type { GameBoardRenderer } from '@ui/GameBoardRenderer'
import { SquareBurst, type BurstTheme } from '@ui/SquareBurst'
import type { ResourceTrailTarget } from '@ui/renderer/RendererTypes'

export class ResourceTrailFx {
  constructor(private readonly host: GameBoardRenderer) {}

  /**
   * Resource rewards are introduced by a short square-card trail from the
   * concrete source (rail card / combo banner / played-card center) into the
   * destination HUD. The trail lands before the normal counter/drop animation,
   * so all reward types share one source-aware acquisition rule.
   */
  animateResourceTrailFromCard(
    cardId: string,
    target: ResourceTrailTarget,
    count: number,
    theme: BurstTheme
  ): Promise<void> {
    const source = this.host.findCardElement(cardId)
    return this.animateResourceTrail(source, this.findResourceTrailTarget(target), count, theme)
  }

  /** Fly a resource trail from a captured card rect after the model was already cleaned up. */
  animateResourceTrailFromRect(
    source: DOMRect,
    target: ResourceTrailTarget,
    count: number,
    theme: BurstTheme
  ): Promise<void> {
    return this.animateResourceTrail(source, this.findResourceTrailTarget(target), count, theme)
  }

  /** Fly a resource trail from the center-screen played-card impact point. */
  animateResourceTrailFromCenter(
    target: ResourceTrailTarget,
    count: number,
    theme: BurstTheme
  ): Promise<void> {
    const center = new DOMRect(window.innerWidth / 2 - 8, window.innerHeight * 0.46 - 8, 16, 16)
    return this.animateResourceTrail(center, this.findResourceTrailTarget(target), count, theme)
  }

  /** Fly a square-card target blast from the played-card center toward an affected rail card. */
  animateTargetBlastFromCenterToCard(cardId: string, theme: BurstTheme): Promise<void> {
    const center = new DOMRect(window.innerWidth / 2 - 8, window.innerHeight * 0.46 - 8, 16, 16)
    return this.animateResourceTrail(center, this.host.findCardElement(cardId), 1, theme)
  }

  /** Fly a resource trail from the currently visible chain/combo banner. */
  animateResourceTrailFromChain(
    target: ResourceTrailTarget,
    count: number,
    theme: BurstTheme
  ): Promise<void> {
    const chainSource =
      document.querySelector<HTMLElement>('#chain-banner .chain-event:last-child') ??
      document.querySelector<HTMLElement>('#chain-banner')
    return this.animateResourceTrail(
      chainSource,
      this.findResourceTrailTarget(target),
      count,
      theme
    )
  }

  findResourceTrailTarget(target: ResourceTrailTarget): HTMLElement | DOMRect | null {
    if (target === 'score') return this.findScorePulseAnchor()
    if (target === 'coin') return this.findCoinPulseAnchor()
    if (target === 'health') {
      return (
        this.host.boardElement.querySelector<HTMLElement>('.hp-bar') ??
        this.host.boardElement.querySelector<HTMLElement>('.player-card')
      )
    }
    if (target === 'shield') {
      return (
        this.host.boardElement.querySelector<HTMLElement>('.player-shield-chip') ??
        this.host.boardElement.querySelector<HTMLElement>('.hp-column') ??
        this.host.boardElement.querySelector<HTMLElement>('.player-card')
      )
    }
    if (target === 'ember') {
      return (
        this.host.boardElement.querySelector<HTMLElement>('.ember-bar') ??
        this.host.boardElement.querySelector<HTMLElement>('.ember-hud')
      )
    }
    if (target === 'gauge') return this.host.boardElement.querySelector<HTMLElement>('.candle-gauge')
    if (target === 'attack') return this.host.boardElement.querySelector<HTMLElement>('.atk-stat')
    if (target === 'relic') {
      const latestRelic = this.host.boardElement.querySelector<HTMLElement>('.relic-mini-card:last-child')
      // Boss/reward relic trails should land on the artifact fan, not on the
      // light panel; fall back to the player card before the first relic exists.
      return (
        latestRelic ??
        this.host.boardElement.querySelector<HTMLElement>('.relic-stack') ??
        this.host.boardElement.querySelector<HTMLElement>('.player-card')
      )
    }
    const handStack = this.host.boardElement.querySelector<HTMLElement>('.hand-stack')
    if (handStack) {
      const rect = handStack.getBoundingClientRect()
      // Hand rewards aim just below the combo gauge, nudged down a little so
      // the first visible card starts at the top edge instead of popping in mid-stack.
      return new DOMRect(rect.left + rect.width / 2 - 8, rect.top + 22, 16, 16)
    }
    return this.host.boardElement.querySelector<HTMLElement>('.hand-panel')
  }

  ensureResourceTrailStyles(): void {
    if (document.getElementById('resource-trail-styles')) return
    const style = document.createElement('style')
    style.id = 'resource-trail-styles'
    style.textContent = `
.resource-trail-piece {
  position: fixed;
  left: 0;
  top: 0;
  z-index: 230;
  border-radius: 4px;
  pointer-events: none;
  background: var(--trail-color, rgba(255, 232, 168, 0.82));
  box-shadow: 0 0 14px var(--trail-glow, rgba(255, 218, 132, 0.28));
  will-change: transform, opacity, filter;
}
`
    document.head.appendChild(style)
  }

  trailColors(theme: BurstTheme): { color: string; glow: string } {
    switch (theme) {
      case 'score':
      case 'treasure-gain':
      case 'flower-chamomile':
      case 'flower-marigold':
        return { color: 'rgba(255, 224, 126, 0.86)', glow: 'rgba(255, 211, 92, 0.34)' }
      case 'health-gain':
      case 'flower-red-rose':
        return { color: 'rgba(240, 106, 114, 0.8)', glow: 'rgba(255, 216, 201, 0.3)' }
      case 'shield-gain':
      case 'flower-oleander':
        return { color: 'rgba(227, 184, 78, 0.78)', glow: 'rgba(255, 241, 184, 0.3)' }
      case 'ember-gain':
        return { color: 'rgba(255, 122, 44, 0.78)', glow: 'rgba(255, 240, 164, 0.3)' }
      case 'gauge-gain':
      case 'flower-lavender':
        return { color: 'rgba(169, 150, 238, 0.76)', glow: 'rgba(238, 230, 255, 0.28)' }
      case 'attack-gain':
      case 'hand-attack':
        return { color: 'rgba(214, 73, 47, 0.78)', glow: 'rgba(244, 195, 74, 0.28)' }
      case 'hand-control':
        return { color: 'rgba(95, 166, 216, 0.74)', glow: 'rgba(220, 238, 252, 0.26)' }
      case 'hand-recovery':
        return { color: 'rgba(126, 208, 145, 0.76)', glow: 'rgba(226, 247, 200, 0.24)' }
      // 불씨 기사단장 카드 효과 — 촛농/양초/불씨 트레일 톤.
      case 'boss-wax-drip':
        return { color: 'rgba(217, 154, 58, 0.8)', glow: 'rgba(255, 230, 173, 0.3)' }
      case 'boss-candle-flame':
        return { color: 'rgba(242, 214, 80, 0.8)', glow: 'rgba(255, 248, 220, 0.3)' }
      case 'boss-ember-spark':
        return { color: 'rgba(255, 122, 44, 0.8)', glow: 'rgba(255, 217, 138, 0.3)' }
      case 'starlight':
        return { color: 'rgba(170, 166, 245, 0.84)', glow: 'rgba(224, 228, 255, 0.36)' }
      default:
        return { color: 'rgba(220, 162, 51, 0.78)', glow: 'rgba(255, 233, 164, 0.26)' }
    }
  }

  rectCenter(target: HTMLElement | DOMRect): { x: number; y: number } {
    const rect = target instanceof HTMLElement ? target.getBoundingClientRect() : target
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
  }

  animateResourceTrail(
    source: HTMLElement | DOMRect | null,
    target: HTMLElement | DOMRect | null,
    count: number,
    theme: BurstTheme
  ): Promise<void> {
    if (!source || !target || count <= 0) return Promise.resolve()
    this.ensureResourceTrailStyles()
    const from = this.rectCenter(source)
    const to = this.rectCenter(target)
    const colors = this.trailColors(theme)
    const launches: Promise<void>[] = []
    for (let i = 0; i < count; i += 1) {
      launches.push(
        new Promise((resolve) => {
          window.setTimeout(() => {
            const finished: Promise<void>[] = []
            const specs = [
              { size: 24, lag: 0, alpha: 0.72 },
              // Tighter lags keep the familiar triple-tail silhouette while
              // reducing the small pause before the HUD number starts ticking.
              { size: 17, lag: 30, alpha: 0.52 },
              { size: 11, lag: 58, alpha: 0.36 },
            ]
            for (const spec of specs) {
              finished.push(this.spawnResourceTrailPiece(from, to, colors, spec))
            }
            window.setTimeout(() => {
              SquareBurst.playAt(to.x, to.y, theme, {
                count: 12,
                spread: 74,
                duration: 420,
                size: [6, 14],
              })
              // Resolve on impact, not after every tail particle fades. Callers
              // can update counters/hand cards during this burst beat.
              resolve()
            }, 280)
            // Trail pieces remove themselves asynchronously after the impact;
            // keeping that cleanup separate prevents old sequential calculations.
            void Promise.all(finished)
          }, i * 95)
        })
      )
    }
    return Promise.all(launches).then(() => undefined)
  }

  spawnResourceTrailPiece(
    from: { x: number; y: number },
    to: { x: number; y: number },
    colors: { color: string; glow: string },
    spec: { size: number; lag: number; alpha: number }
  ): Promise<void> {
    return new Promise((resolve) => {
      window.setTimeout(() => {
        const piece = document.createElement('div')
        piece.className = 'resource-trail-piece'
        piece.style.width = `${spec.size}px`
        piece.style.height = `${Math.round(spec.size * 1.34)}px`
        piece.style.setProperty('--trail-color', colors.color)
        piece.style.setProperty('--trail-glow', colors.glow)
        piece.style.opacity = `${spec.alpha}`
        document.body.appendChild(piece)
        const dx = to.x - from.x
        const dy = to.y - from.y
        const curve = Math.min(90, Math.max(34, Math.abs(dx) * 0.08 + Math.abs(dy) * 0.05))
        const anim = piece.animate(
          [
            {
              transform: `translate(${from.x - spec.size / 2}px, ${from.y - spec.size / 2}px) rotate(-8deg) scale(0.82)`,
              opacity: 0,
              filter: 'blur(0.2px)',
            },
            {
              transform: `translate(${from.x + dx * 0.58 - spec.size / 2}px, ${from.y + dy * 0.58 - curve - spec.size / 2}px) rotate(10deg) scale(1)`,
              opacity: spec.alpha,
              filter: 'blur(0px)',
              offset: 0.58,
            },
            {
              transform: `translate(${to.x - spec.size / 2}px, ${to.y - spec.size / 2}px) rotate(2deg) scale(0.54)`,
              opacity: 0,
              filter: 'blur(0.8px)',
            },
          ],
          { duration: 330, easing: 'cubic-bezier(0.18, 0.88, 0.22, 1)', fill: 'forwards' }
        )
        anim.onfinish = () => {
          piece.remove()
          resolve()
        }
        window.setTimeout(() => {
          piece.remove()
          resolve()
        }, 500)
      }, spec.lag)
    })
  }

  /** Find the score/log panel for score-pulse bursts. */
  findScorePulseAnchor(): HTMLElement | null {
    return (
      this.host.boardElement.querySelector<HTMLElement>('.score-number') ??
      this.host.boardElement.querySelector<HTMLElement>('.score-panel')
    )
  }

  /** Find the coin number element for coin-pulse bursts. */
  findCoinPulseAnchor(): HTMLElement | null {
    return (
      this.host.boardElement.querySelector<HTMLElement>('.coin-number') ??
      this.host.boardElement.querySelector<HTMLElement>('.coin-panel-total') ??
      this.host.boardElement.querySelector<HTMLElement>('.score-panel')
    )
  }
}
