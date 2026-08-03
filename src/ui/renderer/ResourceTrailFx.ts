/**
 * ResourceTrailFx — 자원 트레일/버스트 연출 엔진(출처 → HUD 목적지 사각 파편 트레일).
 * GameBoardRenderer에서 연출 책임만 옮겨 왔다 — 렌더 상태의 단일 출처는 host다.
 */

import type { GameBoardRenderer } from '@ui/GameBoardRenderer'
import { SquareBurst, type BurstTheme } from '@ui/SquareBurst'
import type { ResourceTrailTarget } from '@ui/renderer/RendererTypes'

/**
 * 곡사 블라스트가 출발점에서 목표에 닿기까지의 시간. 착탄 버스트/피해 수치가 이 값에
 * 맞춰 이어지므로 비행과 착탄이 어긋나지 않게 한 곳에서 정한다.
 * 눈으로 좇을 수 있어야 '어느 칸으로 갔는지'가 읽히므로 짧게 잡지 않는다.
 */
export const STRIKE_LOB_FLIGHT_MS = 620

/** 여러 대상에 동시에 쏠 때 발사 간격 — 겹쳐 쏘면 몇 발인지가 뭉갠다. */
export const STRIKE_LOB_STAGGER_MS = 70

/** 손패 획득 토큰이 튀어나와 떨어지고 → 살짝 표류하다 → 손패로 빨려 들어가기까지. */
const HAND_TOKEN_FLIGHT_MS = 1250
/** 착지(곡사로 튀어나와 떨어짐)가 끝나는 지점. 이후 표류 구간이 이어진다. */
const HAND_TOKEN_LAND = 0.36
/** 표류가 끝나고 손패로 출발하는 지점. */
const HAND_TOKEN_DEPART = 0.62
/** 손패에 닿는 프레임 — 블라스트가 이 박자에 터진다. */
const HAND_TOKEN_ARRIVE = 0.93

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
    return this.routeResourceTrail(source, target, count, theme)
  }

  /**
   * 손패 획득만 파편 트레일이 아니라 **카드 토큰**으로 낸다 — 나머지 자원은 수치가
   * HUD에서 굴러 오르지만 손패는 '카드가 손에 들어오는' 사건이라 도형이 곧 설명이다.
   * 출처가 어디든(레일 칸·화면 중앙·체인 배너) 같은 어휘를 쓰게 한 창구로 모은다.
   */
  private routeResourceTrail(
    source: HTMLElement | DOMRect | null,
    target: ResourceTrailTarget,
    count: number,
    theme: BurstTheme
  ): Promise<void> {
    const destination = this.findResourceTrailTarget(target)
    return target === 'hand'
      ? this.animateHandCardTokens(source, destination, count)
      : this.animateResourceTrail(source, destination, count, theme)
  }

  /** Fly a resource trail from a captured card rect after the model was already cleaned up. */
  animateResourceTrailFromRect(
    source: DOMRect,
    target: ResourceTrailTarget,
    count: number,
    theme: BurstTheme
  ): Promise<void> {
    return this.routeResourceTrail(source, target, count, theme)
  }

  /** Fly a resource trail from the center-screen played-card impact point. */
  animateResourceTrailFromCenter(
    target: ResourceTrailTarget,
    count: number,
    theme: BurstTheme
  ): Promise<void> {
    return this.routeResourceTrail(this.playedCardOrigin(), target, count, theme)
  }

  /** Fly a square-card target blast from the played-card center toward an affected rail card. */
  animateTargetBlastFromCenterToCard(cardId: string, theme: BurstTheme): Promise<void> {
    return this.animateStrikeLob(this.playedCardOrigin(), this.host.findCardElement(cardId), theme)
  }

  /**
   * 레시피(조합)가 쏘는 블라스트. 손패는 화면 중앙에 펼쳐진 카드에서 나가지만 레시피는
   * 체인 배너에서 발동하므로, 자원 트레일과 같은 출처를 써야 "무엇이 쐈는지"가 이어진다.
   */
  animateTargetBlastFromChainToCard(cardId: string, theme: BurstTheme): Promise<void> {
    const chainSource =
      document.querySelector<HTMLElement>('#chain-banner .chain-event:last-child') ??
      document.querySelector<HTMLElement>('#chain-banner')
    return this.animateStrikeLob(
      chainSource ?? this.playedCardOrigin(),
      this.host.findCardElement(cardId),
      theme
    )
  }

  /** 손패를 쓰면 카드가 화면 중앙에 크게 펼쳐진다 — 발사체는 그 카드에서 나가야 한다. */
  private playedCardOrigin(): DOMRect {
    return new DOMRect(window.innerWidth / 2 - 8, window.innerHeight * 0.46 - 8, 16, 16)
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
    return this.routeResourceTrail(chainSource, target, count, theme)
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
/* 곡사 블라스트 — 자원 트레일과 같은 정사각 조각을 그대로 쓴다(전용 도형을 만들지 않는다).
   다른 것은 발광의 세기뿐이다: 밝은 레일 위에서도 윤곽이 남아야 눈으로 좇을 수 있다.
   색은 테마 색을 그대로 채운다 — 흰빛으로 덮으면 어느 계열의 공격인지가 사라진다. */
.resource-trail-piece.is-lob {
  border-radius: 4px;
  box-shadow:
    0 0 12px rgba(255, 252, 240, 0.5),
    0 0 30px var(--trail-glow, rgba(255, 218, 132, 0.5)),
    0 0 54px var(--trail-glow, rgba(255, 218, 132, 0.28));
}
/* 손패 획득 토큰 — 같은 사각 조각이되 **비율만** 세로로 긴 카드다. 전용 도형이 아니라
   비율 변주라, 이펙트 어휘를 늘리지 않고도 '카드가 나왔다'가 읽힌다. */
.resource-trail-piece.is-card-token {
  border-radius: 3px;
  background: linear-gradient(155deg, #ffeec0 0%, #ffcf72 42%, #e0a03c 100%);
  border: 1px solid rgba(90, 56, 18, 0.55);
  box-shadow:
    0 2px 6px rgba(0, 0, 0, 0.55),
    0 0 16px rgba(255, 214, 130, 0.7),
    0 0 34px var(--trail-glow, rgba(255, 218, 132, 0.4));
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

  /**
   * 손패 획득 — 레일 칸(보물·꽃·적)에서 **카드 모양 황금 토큰**이 장수만큼 튀어나온다.
   *
   * 자원 트레일(HUD로 흘러드는 파편)과 다른 것은 도형의 **비율 하나**다: 세로로 긴
   * 직사각형이라야 '카드가 나왔다'로 읽힌다(같은 사각 블라스트 어휘 안에 있다).
   * 박자는 셋이다 — 곡사로 튀어나와 떨어지고(푱), 잠깐 머물고, 손패로 빨려 들어간다.
   * 머무는 한 박자가 없으면 몇 장이 나왔는지 셀 틈이 사라진다.
   */
  animateHandCardTokens(
    source: HTMLElement | DOMRect | null,
    target: HTMLElement | DOMRect | null,
    count: number
  ): Promise<void> {
    if (!source || !target || count <= 0) return Promise.resolve()
    this.ensureResourceTrailStyles()
    const from = this.rectCenter(source)
    const to = this.rectCenter(target)
    const colors = this.trailColors('treasure-gain')
    // 장수가 많아도 늘어지지 않게 간격만 좁힌다 — 발수는 줄이지 않는다.
    const stagger = Math.max(45, Math.min(110, Math.round(460 / count)))
    // 길쭉해야 '카드'로 읽힌다 — 정사각에 가까우면 그냥 파편이 된다.
    const width = 15
    const height = 33
    const launches = Array.from({ length: count }, (_, i) =>
      new Promise<void>((resolve) => {
        window.setTimeout(() => {
          const piece = document.createElement('div')
          piece.className = 'resource-trail-piece is-card-token'
          piece.style.width = `${width}px`
          piece.style.height = `${height}px`
          piece.style.setProperty('--trail-color', colors.color)
          piece.style.setProperty('--trail-glow', colors.glow)
          document.body.appendChild(piece)
          // 착지점은 출처 아래로 부채꼴로 벌린다 — 겹쳐 떨어지면 장수가 안 세어진다.
          const spread = Math.min(40, 150 / Math.max(1, count))
          const land = {
            x: from.x + (i - (count - 1) / 2) * spread,
            y: Math.min(window.innerHeight - 40, from.y + 54),
          }
          const at = (px: number, py: number): string =>
            `translate(${px - width / 2}px, ${py - height / 2}px)`
          const frames: Keyframe[] = []
          // 1) 곡사로 튀어나와 내리꽂힌다.
          const SAMPLES = 8
          for (let s = 0; s <= SAMPLES; s += 1) {
            const t = s / SAMPLES
            const p = this.lobPointAt(from, land, t)
            const lift = Math.sin(Math.PI * t)
            frames.push({
              transform: `${at(p.x, p.y)} rotate(${(t * 220 - 20).toFixed(0)}deg) scale(${(0.6 + lift * 0.55).toFixed(3)})`,
              opacity: s === 0 ? 0 : 1,
              offset: Number((t * HAND_TOKEN_LAND).toFixed(4)),
            })
          }
          // 2) 착지 반동 — 납작해졌다 바로 선다. 여기서 카드가 똑바로 놓인다.
          frames.push({
            transform: `${at(land.x, land.y)} rotate(0deg) scale(1.24, 0.72)`,
            opacity: 1,
            offset: HAND_TOKEN_LAND + 0.03,
          })
          // 3) 표류 — 착지한 자리에서 살짝 떠올라 흔들린다. 멈춰 세우면 화면이 굳어
          //    '몇 장이 나왔나'를 세는 구간이 정지 화면이 된다.
          const driftX = (i % 2 === 0 ? 1 : -1) * 5
          frames.push({
            transform: `${at(land.x + driftX, land.y - 7)} rotate(${(driftX * 0.9).toFixed(1)}deg) scale(1.02)`,
            opacity: 1,
            offset: HAND_TOKEN_LAND + (HAND_TOKEN_DEPART - HAND_TOKEN_LAND) * 0.55,
          })
          frames.push({
            transform: `${at(land.x - driftX * 0.5, land.y - 2)} rotate(${(-driftX * 0.5).toFixed(1)}deg) scale(1)`,
            opacity: 1,
            offset: HAND_TOKEN_DEPART,
          })
          // 4) 손패로 빨려 들어간다 — 가속해서 도착점에서 멈춘다.
          frames.push({
            transform: `${at(land.x + (to.x - land.x) * 0.45, land.y + (to.y - land.y) * 0.45)} rotate(-8deg) scale(0.94)`,
            opacity: 1,
            offset: HAND_TOKEN_DEPART + (HAND_TOKEN_ARRIVE - HAND_TOKEN_DEPART) * 0.55,
          })
          frames.push({
            transform: `${at(to.x, to.y)} rotate(0deg) scale(0.7)`,
            opacity: 1,
            offset: HAND_TOKEN_ARRIVE,
          })
          frames.push({ transform: `${at(to.x, to.y)} rotate(0deg) scale(0.4)`, opacity: 0 })
          const anim = piece.animate(frames, {
            duration: HAND_TOKEN_FLIGHT_MS,
            easing: 'linear',
            fill: 'forwards',
          })
          window.setTimeout(() => {
            SquareBurst.playAt(to.x, to.y, 'treasure-gain', {
              count: 10,
              spread: 58,
              duration: 320,
              size: [6, 14],
            })
          }, HAND_TOKEN_FLIGHT_MS * HAND_TOKEN_ARRIVE)
          const done = (): void => {
            piece.remove()
            resolve()
          }
          anim.onfinish = done
          window.setTimeout(done, HAND_TOKEN_FLIGHT_MS + 200)
        }, i * stagger)
      })
    )
    return Promise.all(launches).then(() => undefined)
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
   * 곡사 블라스트 — 손패/레시피가 **맞을 칸 한 곳으로 한 발**을 높이 띄워 내리꽂는다.
   *
   * 이펙트 어휘는 사각 블라스트 하나이므로 전용 도형을 만들지 않는다. 자원 트레일과
   * 같은 사각 조각을 쓰되 셋만 다르다:
   *   1) 높이 뜬다 — 정점을 목표 쪽으로 치우쳐, 마지막 구간이 거의 수직으로 떨어진다
   *   2) 느리다 — 눈으로 좇을 수 있어야 '어느 칸으로 갔는지'가 읽힌다
   *   3) 착탄에서 납작하게 눌린다 — 이 한 프레임이 '딱'이다
   * 자원 트레일의 얕은 포물선은 '흘러들었다'로 읽히지만, 목표 **위에서 수직으로**
   * 떨어지면 어느 칸에 꽂혔는지가 남는다 — 곡사와 흘러듦을 가르는 것은 정점의 위치다.
   */
  animateStrikeLob(
    source: HTMLElement | DOMRect | null,
    target: HTMLElement | DOMRect | null,
    theme: BurstTheme
  ): Promise<void> {
    if (!source || !target) return Promise.resolve()
    this.ensureResourceTrailStyles()
    const from = this.rectCenter(source)
    const to = this.rectCenter(target)
    const colors = this.trailColors(theme)
    // 앞선 포탄 한 발 + 뒤따르는 잔광 두 겹. 같은 궤적 위를 조금씩 늦게 따라가
    // 하나의 꼬리로 읽히되, 뒤로 갈수록 작고 옅다.
    const specs = [
      { size: 26, lag: 0, alpha: 0.96, lob: true },
      { size: 18, lag: 70, alpha: 0.5, lob: true },
      { size: 12, lag: 130, alpha: 0.3, lob: true },
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
      }, STRIKE_LOB_FLIGHT_MS)
      void Promise.all(flights)
    })
  }

  /** 포탄이 목표보다 얼마나 더 높이 떠야 하는가. 이 높이만큼이 '내리꽂는' 구간이 된다. */
  private static readonly LOB_PLUNGE_PX = 120

  /**
   * 곡사 궤적 위의 한 점. 2차 베지에이고 두 가지를 지킨다:
   *   · 제어점을 **목표 쪽(0.62)으로 치우친다** — 정점이 목표 바로 위에 와 마지막 구간이
   *     수직 낙하가 된다. 정중앙이면 좌우 대칭 포물선이라 '비스듬히 흘러들었다'로 읽힌다.
   *   · 정점이 **목표보다 항상 LOB_PLUNGE_PX 위**가 되게 제어점 높이를 역산한다. 거리에
   *     비례해서만 띄우면 가까운 목표에서는 내리꽂는 구간이 사라진다.
   */
  private lobPointAt(
    from: { x: number; y: number },
    to: { x: number; y: number },
    t: number
  ): { x: number; y: number } {
    const cx = from.x + (to.x - from.x) * 0.62
    // 화면 위로 새지 않게 정점을 상단 여백 안에 가둔다.
    const apex = Math.max(48, Math.min(from.y, to.y) - ResourceTrailFx.LOB_PLUNGE_PX)
    const cy = 2 * apex - (from.y + to.y) / 2
    const inv = 1 - t
    return {
      x: inv * inv * from.x + 2 * inv * t * cx + t * t * to.x,
      y: inv * inv * from.y + 2 * inv * t * cy + t * t * to.y,
    }
  }

  spawnResourceTrailPiece(
    from: { x: number; y: number },
    to: { x: number; y: number },
    colors: { color: string; glow: string },
    spec: { size: number; lag: number; alpha: number; lob?: boolean }
  ): Promise<void> {
    return new Promise((resolve) => {
      window.setTimeout(() => {
        const piece = document.createElement('div')
        piece.className = `resource-trail-piece${spec.lob ? ' is-lob' : ''}`
        piece.style.width = `${spec.size}px`
        piece.style.height = `${Math.round(spec.size * (spec.lob ? 1 : 1.34))}px`
        piece.style.setProperty('--trail-color', colors.color)
        piece.style.setProperty('--trail-glow', colors.glow)
        piece.style.opacity = `${spec.alpha}`
        document.body.appendChild(piece)
        const dx = to.x - from.x
        const dy = to.y - from.y
        const halfY = spec.lob ? spec.size / 2 : spec.size / 2
        const curve = Math.min(90, Math.max(34, Math.abs(dx) * 0.08 + Math.abs(dy) * 0.05))
        const at = (px: number, py: number): string =>
          `translate(${px - spec.size / 2}px, ${py - halfY}px)`
        let anim: Animation
        if (spec.lob) {
          // 궤적을 촘촘히 표본해 키프레임으로 편다 — 브라우저는 키프레임 사이를 직선으로
          // 잇기 때문에, 표본이 성기면 포물선이 꺾인 선분으로 보인다.
          const SAMPLES = 12
          const IMPACT = 0.9
          const frames: Keyframe[] = []
          for (let i = 0; i <= SAMPLES; i += 1) {
            const t = i / SAMPLES
            const p = this.lobPointAt(from, to, t)
            // 올라갈 땐 커지고 떨어질 땐 작아진다 — 높이를 크기로 말한다.
            const lift = Math.sin(Math.PI * t)
            frames.push({
              transform: `${at(p.x, p.y)} rotate(${t * 160}deg) scale(${(0.72 + lift * 0.5).toFixed(3)})`,
              opacity: i === 0 ? 0 : spec.alpha,
              offset: Number((t * IMPACT).toFixed(4)),
            })
          }
          // 착탄 — 수직으로 떨어진 몸이 납작하게 눌린다. 이 한 프레임이 '딱'이다.
          frames.push({
            transform: `${at(to.x, to.y)} rotate(160deg) scale(1.5, 0.5)`,
            opacity: spec.alpha,
            offset: Number((IMPACT + 0.05).toFixed(4)),
          })
          frames.push({ transform: `${at(to.x, to.y)} rotate(160deg) scale(0.7, 0.35)`, opacity: 0 })
          anim = piece.animate(frames, {
            // 착탄 프레임(offset IMPACT)이 정확히 STRIKE_LOB_FLIGHT_MS에 오게 길이를 역산한다 —
            // 버스트가 먼저 터지면 포탄이 도착하기도 전에 '맞았다'가 나가 버린다.
            duration: Math.round(STRIKE_LOB_FLIGHT_MS / IMPACT),
            // 곡사는 등속에 가깝게 둔다 — 가속하면 눈이 좇을 수 있는 구간이 사라진다.
            easing: 'linear',
            fill: 'forwards',
          })
        } else {
          anim = piece.animate(
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
        }
        anim.onfinish = () => {
          piece.remove()
          resolve()
        }
        window.setTimeout(() => {
          piece.remove()
          resolve()
        }, spec.lob ? STRIKE_LOB_FLIGHT_MS + spec.lag + 320 : 500)
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
