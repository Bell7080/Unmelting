/**
 * ResourceTrailFx — 자원 트레일/버스트 연출 엔진(출처 → HUD 목적지 사각 파편 트레일).
 * GameBoardRenderer에서 연출 책임만 옮겨 왔다 — 렌더 상태의 단일 출처는 host다.
 */

import type { GameBoardRenderer } from '@ui/GameBoardRenderer'
import { SquareBurst, type BurstTheme } from '@ui/SquareBurst'
import type { ResourceTrailTarget } from '@ui/renderer/RendererTypes'

/**
 * 조준 볼트가 출발점에서 목표에 닿기까지의 시간. 착탄 버스트/피해 수치가 이 값에
 * 맞춰 이어지므로 비행과 착탄이 어긋나지 않게 한 곳에서 정한다.
 */
export const STRIKE_BOLT_FLIGHT_MS = 300

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
    return this.animateStrikeBolt(center, this.host.findCardElement(cardId), theme)
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
/* 조준 볼트 — 자원 트레일과 같은 사각 조각이지만 '읽히는 발사체'여야 한다.
   색을 옅게 깔면 밝은 레일 위에서 사라지므로, 심지는 흰빛으로 세우고(안쪽 그라디언트)
   테두리 발광을 두 겹으로 둘러 어떤 배경 위에서도 윤곽이 남게 한다. */
.resource-trail-piece.is-bolt {
  border-radius: 3px;
  /* 꼬리는 테마 색, 머리만 흰빛 — 늘어난 몸이 전부 하얘지면 어느 칸(약점/경화)을 노린
     발사체인지가 사라진다. 색이 몸을 채우고 흰 심지는 앞끝에만 남는다. */
  background:
    linear-gradient(90deg,
      var(--trail-color, rgba(255, 232, 168, 0.9)) 0%,
      var(--trail-color, rgba(255, 232, 168, 0.95)) 44%,
      rgba(255, 250, 232, 0.98) 82%,
      rgba(255, 255, 255, 0.98) 100%);
  box-shadow:
    0 0 10px rgba(255, 252, 240, 0.75),
    0 0 26px var(--trail-glow, rgba(255, 218, 132, 0.5)),
    0 0 46px var(--trail-glow, rgba(255, 218, 132, 0.3));
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

  /**
   * 조준 볼트 — 손패를 쓴 화면 중앙에서 **맞을 칸/카드 한 곳으로 한 발**이 날아가 꽂힌다.
   *
   * 자원 트레일(HUD로 흘러드는 파편 세 줄기)과 같은 사각 조각을 쓰되 세 가지만 다르다:
   *   1) 진행 방향으로 눕혀 늘인다 — 정지 화면에서도 '날아가는 중'이 읽힌다
   *   2) 궤적을 거의 편다 — 자원은 포물선으로 흘러들지만 타격은 곧게 꽂혀야 한다
   *   3) 가속해서 도착점에 멈춘다 — '슈우웅 → 딱'의 두 박자를 속도로만 만든다
   * 도착 순간의 버스트는 자원 트레일보다 촘촘하고 짧아, 퍼지는 대신 한 점에 박힌다.
   */
  animateStrikeBolt(
    source: HTMLElement | DOMRect | null,
    target: HTMLElement | DOMRect | null,
    theme: BurstTheme
  ): Promise<void> {
    if (!source || !target) return Promise.resolve()
    this.ensureResourceTrailStyles()
    const from = this.rectCenter(source)
    const to = this.rectCenter(target)
    const colors = this.trailColors(theme)
    // 앞선 심지 한 발 + 바로 뒤를 따르는 잔광 두 겹. 세 겹이 같은 선 위에 겹쳐
    // 하나의 긴 발사체로 보이되, 뒤로 갈수록 옅어 꼬리가 생긴다.
    const specs = [
      { size: 26, lag: 0, alpha: 0.98, bolt: true },
      { size: 20, lag: 26, alpha: 0.66, bolt: true },
      { size: 13, lag: 50, alpha: 0.4, bolt: true },
    ]
    const flights = specs.map((spec) => this.spawnResourceTrailPiece(from, to, colors, spec))
    return new Promise((resolve) => {
      window.setTimeout(() => {
        // 착탄 — 넓게 퍼뜨리지 않는다. 조각을 크고 촘촘하게 짧게 터뜨려야 '꽂혔다'가 된다.
        SquareBurst.playAt(to.x, to.y, theme, {
          count: 16,
          spread: 62,
          duration: 340,
          size: [8, 20],
        })
        resolve()
      }, STRIKE_BOLT_FLIGHT_MS)
      void Promise.all(flights)
    })
  }

  spawnResourceTrailPiece(
    from: { x: number; y: number },
    to: { x: number; y: number },
    colors: { color: string; glow: string },
    spec: { size: number; lag: number; alpha: number; bolt?: boolean }
  ): Promise<void> {
    return new Promise((resolve) => {
      window.setTimeout(() => {
        const piece = document.createElement('div')
        piece.className = `resource-trail-piece${spec.bolt ? ' is-bolt' : ''}`
        piece.style.width = `${spec.size}px`
        piece.style.height = `${Math.round(spec.size * (spec.bolt ? 0.66 : 1.34))}px`
        piece.style.setProperty('--trail-color', colors.color)
        piece.style.setProperty('--trail-glow', colors.glow)
        piece.style.opacity = `${spec.alpha}`
        document.body.appendChild(piece)
        const dx = to.x - from.x
        const dy = to.y - from.y
        // 눕힌 볼트는 세로 중심이 조각 높이의 절반이라야 궤적 선 위에 정확히 놓인다.
        const halfY = spec.bolt ? Number(piece.style.height.replace('px', '')) / 2 : spec.size / 2
        // 볼트는 진행 방향으로 눕혀야 늘인 조각이 궤적과 어긋나지 않는다.
        const angle = spec.bolt ? (Math.atan2(dy, dx) * 180) / Math.PI : 0
        const curve = spec.bolt
          ? Math.min(22, Math.max(6, (Math.abs(dx) + Math.abs(dy)) * 0.016))
          : Math.min(90, Math.max(34, Math.abs(dx) * 0.08 + Math.abs(dy) * 0.05))
        const at = (px: number, py: number): string =>
          `translate(${px - spec.size / 2}px, ${py - halfY}px)`
        const anim = spec.bolt
          ? piece.animate(
              [
                {
                  transform: `${at(from.x, from.y)} rotate(${angle}deg) scale(0.7, 1)`,
                  opacity: 0,
                },
                {
                  transform: `${at(from.x + dx * 0.2, from.y + dy * 0.2 - curve * 0.5)} rotate(${angle}deg) scale(2.1, 0.8)`,
                  opacity: spec.alpha,
                  offset: 0.3,
                },
                {
                  transform: `${at(from.x + dx * 0.7, from.y + dy * 0.7 - curve)} rotate(${angle}deg) scale(2.9, 0.72)`,
                  opacity: spec.alpha,
                  offset: 0.72,
                },
                // 착탄 — 늘어난 몸이 앞뒤로 눌리며 멈춘다. 이 한 프레임이 '딱'이다.
                {
                  transform: `${at(to.x, to.y)} rotate(${angle}deg) scale(0.72, 1.5)`,
                  opacity: spec.alpha,
                  offset: 0.92,
                },
                { transform: `${at(to.x, to.y)} rotate(${angle}deg) scale(0.5, 1.1)`, opacity: 0 },
              ],
              // 착탄 프레임(offset 0.92)이 정확히 STRIKE_BOLT_FLIGHT_MS에 오게 길이를 역산한다 —
              // 버스트가 먼저 터지면 볼트가 도착하기도 전에 '맞았다'가 나가 버린다.
              { duration: Math.round(STRIKE_BOLT_FLIGHT_MS / 0.92), easing: 'cubic-bezier(0.5, 0, 0.3, 1)', fill: 'forwards' }
            )
          : piece.animate(
              [
                {
                  transform: `${at(from.x, from.y)} rotate(-8deg) scale(0.82)`,
                  opacity: 0,
                  filter: 'blur(0.2px)',
                },
                {
                  transform: `${at(from.x + dx * 0.58, from.y + dy * 0.58 - curve)} rotate(10deg) scale(1)`,
                  opacity: spec.alpha,
                  filter: 'blur(0px)',
                  offset: 0.58,
                },
                {
                  transform: `${at(to.x, to.y)} rotate(2deg) scale(0.54)`,
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
        }, (spec.bolt ? STRIKE_BOLT_FLIGHT_MS + 260 : 500))
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
