/**
 * ResourceTrailFx — 자원 트레일/버스트 연출 엔진(출처 → HUD 목적지 사각 파편 트레일).
 * GameBoardRenderer에서 연출 책임만 옮겨 왔다 — 렌더 상태의 단일 출처는 host다.
 */

import type { GameBoardRenderer } from '@ui/GameBoardRenderer'
import { SquareBurst, type BurstTheme } from '@ui/SquareBurst'
import {
  bookIcon,
  comboGaugeIcon,
  flameIcon,
  heartIcon,
  shieldIcon,
  sparkleIcon,
  swordIcon,
} from '@ui/Icons'
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
const HAND_TOKEN_FLIGHT_MS = 950
/** 착지(곡사로 튀어나와 떨어짐)가 끝나는 지점. 이후 표류 구간이 이어진다. */
const HAND_TOKEN_LAND = 0.34
/** 표류가 끝나고 손패로 출발하는 지점 — 바닥에 오래 머물면 남아 있는 것처럼 보인다. */
const HAND_TOKEN_DEPART = 0.5
/** 손패에 닿는 프레임 — 블라스트가 이 박자에 터진다. */
const HAND_TOKEN_ARRIVE = 0.92

/**
 * 토큰 한 장이 손패에 **닿는 시각**(발사 시점 기준). 손패 슬롯은 이 시각에 맞춰 나타나야
 * "블라스트되며 카드가 들어온다"가 된다 — 슬롯이 먼저 뜨면 토큰이 빈 자리로 날아간다.
 */
export const HAND_TOKEN_LAND_MS = Math.round(HAND_TOKEN_FLIGHT_MS * HAND_TOKEN_ARRIVE)

/** 장수에 따른 발사 간격. 슬롯 등장 간격도 같은 값을 써야 장마다 짝이 맞는다. */
export function handTokenStaggerMs(count: number): number {
  return Math.max(45, Math.min(110, Math.round(460 / Math.max(1, count))))
}

/** 착지 흩어짐 — 줄 맞춰 서면 '진열'로 보인다. 바닥에 떨어뜨린 것처럼 장마다 어긋낸다.
 *  난수가 아니라 고정 표라 같은 장수는 늘 같은 모양으로 떨어진다(재현 가능). */
const SCATTER_Y = [0, 9, -5, 13, 3, -8, 11, -2, 7, -11]
const SCATTER_TILT = [-12, 8, -19, 14, -6, 21, -15, 5, -9, 17]

/** 자원 아이콘 토큰이 튀어나와 떨어지고 → 잠깐 머물다 → HUD로 빨려 들어가기까지.
 *  손패 토큰(950ms)보다 짧다 — 자원 획득은 턴마다 반복되는 사건이라 늘어지면 지친다. */
const RESOURCE_TOKEN_FLIGHT_MS = 780
const RESOURCE_TOKEN_LAND = 0.3
const RESOURCE_TOKEN_DEPART = 0.46
/** HUD에 닿는 프레임 — 수치 롤링을 여는 착탄 블라스트가 이 박자에 터진다. */
const RESOURCE_TOKEN_ARRIVE = 0.9

/** 별빛 토큰이 떠올라 → 두둥실 표류하다 → 턴 카운터로 꽂히기까지. */
const STARLIGHT_TOKEN_FLIGHT_MS = 1240
/** 떠오름이 끝나는 지점 — 카드가 풀린 빛이 화면으로 솟아오르는 구간. */
const STARLIGHT_TOKEN_RISE = 0.28
/** 표류가 끝나고 턴을 향해 출발하는 지점. 이 구간이 '두둥실'이다. */
const STARLIGHT_TOKEN_DEPART = 0.58
/** 턴 카운터에 꽂히는 프레임 — 착탄 블라스트가 이 박자에 터진다. */
const STARLIGHT_TOKEN_ARRIVE = 0.93
/** 꽂히기 직전 들르는 높이. 위에서 수직으로 내리꽂아야 '흘러들었다'가 아니라 '꽂혔다'가 된다. */
const STARLIGHT_PLUNGE_PX = 92

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
   * 모든 자원 획득은 **무엇을 얻었는지 도형이 말하는 토큰**으로 낸다. 파편이 HUD로
   * 곧장 흘러들면 어디서 무엇이 왔는지가 남지 않아 "허공에서 게이지가 찼다"로 읽힌다.
   * 출처가 어디든(레일 칸·화면 중앙의 펼친 손패·체인 배너) 같은 창구로 모은다.
   */
  private routeResourceTrail(
    source: HTMLElement | DOMRect | null,
    target: ResourceTrailTarget,
    count: number,
    theme: BurstTheme
  ): Promise<void> {
    const destination = this.findResourceTrailTarget(target)
    if (target === 'hand') return this.animateHandCardTokens(source, destination, count)
    return this.animateResourceIconTokens(source, destination, count, theme, target)
  }

  /**
   * 자원별 토큰 글리프. 전용 도형을 새로 그리지 않고 **HUD가 이미 쓰는 아이콘**을
   * 그대로 띄운다 — 떨어진 것과 채워지는 곳이 같은 그림이라야 눈이 이어 붙인다.
   */
  private resourceTokenIcon(target: ResourceTrailTarget): string | null {
    switch (target) {
      case 'health': return heartIcon()
      case 'shield': return shieldIcon()
      case 'ember': return flameIcon()
      case 'gauge': return comboGaugeIcon()
      case 'attack': return swordIcon()
      case 'relic': return bookIcon()
      case 'score': return sparkleIcon()
      // 화폐는 글리프가 아니라 `$` 글자가 HUD의 얼굴이다(Icons에 대응 아이콘이 없다).
      case 'coin': return null
      default: return null
    }
  }

  /** 자원별 토큰 발광색 — 심지/속발광/바깥 빛무리 세 겹. HUD 색과 같은 계열을 쓴다. */
  private resourceTokenColors(target: ResourceTrailTarget): { ink: string; core: string; glow: string; halo: string } {
    switch (target) {
      case 'health':
        return { ink: '#ff8f93', core: 'rgba(255, 226, 222, 0.95)', glow: 'rgba(240, 96, 104, 0.95)', halo: 'rgba(176, 34, 46, 0.6)' }
      case 'shield':
        return { ink: '#ffe4a6', core: 'rgba(255, 244, 214, 0.92)', glow: 'rgba(227, 184, 78, 0.9)', halo: 'rgba(150, 105, 26, 0.55)' }
      case 'ember':
        return { ink: '#ffb066', core: 'rgba(255, 238, 196, 0.95)', glow: 'rgba(255, 122, 44, 0.95)', halo: 'rgba(190, 68, 12, 0.6)' }
      case 'gauge':
        return { ink: '#c9bcff', core: 'rgba(238, 230, 255, 0.92)', glow: 'rgba(169, 150, 238, 0.9)', halo: 'rgba(88, 68, 176, 0.55)' }
      case 'attack':
        return { ink: '#ff9a72', core: 'rgba(255, 226, 196, 0.92)', glow: 'rgba(214, 73, 47, 0.92)', halo: 'rgba(146, 34, 14, 0.55)' }
      case 'relic':
        return { ink: '#ffd98a', core: 'rgba(255, 243, 206, 0.92)', glow: 'rgba(226, 160, 60, 0.9)', halo: 'rgba(140, 82, 20, 0.55)' }
      default:
        return { ink: '#ffe6a8', core: 'rgba(255, 245, 214, 0.95)', glow: 'rgba(255, 196, 96, 0.9)', halo: 'rgba(244, 150, 52, 0.6)' }
    }
  }

  /** 아이콘 토큰 한 개를 만들어 body에 붙인다(글리프 없이는 `$` 같은 글자를 넣는다). */
  private createIconToken(variant: string, size: number, face: string): HTMLElement {
    const piece = document.createElement('div')
    piece.className = `resource-trail-piece is-icon-token ${variant}`
    piece.style.width = `${size}px`
    piece.style.height = `${size}px`
    piece.innerHTML = face
    document.body.appendChild(piece)
    return piece
  }

  /**
   * 자원 획득 — 출처에서 **아이콘이 곡사로 튀어나와 떨어지고**, 잠깐 머물다, HUD로
   * 빨려 들며 블라스트한다. 손패 토큰과 같은 세 박자이고 다른 것은 글리프와 빛 색이다.
   *
   * 머무는 한 박자를 빼면 몇 개를 얻었는지 셀 틈이 사라지고, 곡사를 빼면 '떨어진 것'이
   * 아니라 '흘러든 것'이 된다 — 두 박자 모두 어디서 왔는지를 남기기 위한 것이다.
   */
  animateResourceIconTokens(
    source: HTMLElement | DOMRect | null,
    target: HTMLElement | DOMRect | null,
    count: number,
    theme: BurstTheme,
    resource: ResourceTrailTarget
  ): Promise<void> {
    if (!source || !target || count <= 0) return Promise.resolve()
    this.ensureResourceTrailStyles()
    const from = this.rectCenter(source)
    const to = this.rectCenter(target)
    const face = this.resourceTokenIcon(resource)
    const colors = this.resourceTokenColors(resource)
    // 수치가 큰 획득(불빛 등)까지 개수만큼 띄우면 화면이 덮인다. 토큰은 '무엇이
    // 왔는지'를 말하는 역할이라 몇 개까지만 내고 수치는 HUD 카운터가 말한다.
    const tokens = Math.max(1, Math.min(3, count))
    const stagger = tokens > 1 ? 90 : 0
    const size = 30
    const at = (px: number, py: number): string =>
      `translate(${px - size / 2}px, ${py - size / 2}px)`

    const launches = Array.from({ length: tokens }, (_, i) =>
      new Promise<void>((resolve) => {
        window.setTimeout(() => {
          const piece = this.createIconToken(`is-resource-token is-token-${resource}`, size, face ?? '<span class="token-glyph">$</span>')
          piece.style.setProperty('--token-ink', colors.ink)
          piece.style.setProperty('--token-core', colors.core)
          piece.style.setProperty('--token-glow', colors.glow)
          piece.style.setProperty('--token-halo', colors.halo)
          // 착지점은 **출처 자리**다. 멀리 떨어뜨리면 어디서 나온 것인지가 끊긴다.
          const spread = Math.max(size + 4, Math.min(46, 150 / tokens))
          const scatterY = SCATTER_Y[i % SCATTER_Y.length]
          const tilt = SCATTER_TILT[i % SCATTER_TILT.length]
          const land = {
            x: from.x + (i - (tokens - 1) / 2) * spread,
            y: Math.min(window.innerHeight - 40, from.y + 14 + scatterY * 0.6),
          }
          const frames: Keyframe[] = []
          // 1) 곡사로 튀어나와 내리꽂힌다.
          const SAMPLES = 9
          for (let s = 0; s <= SAMPLES; s += 1) {
            const t = s / SAMPLES
            const p = this.lobPointAt(from, land, t)
            const lift = Math.sin(Math.PI * t)
            frames.push({
              transform: `${at(p.x, p.y)} rotate(${(tilt * t * 0.5).toFixed(1)}deg) scale(${(0.55 + lift * 0.6).toFixed(3)})`,
              opacity: s === 0 ? 0 : 1,
              offset: Number((t * RESOURCE_TOKEN_LAND).toFixed(4)),
            })
          }
          // 2) 착지 반동 — 바닥에 부딪혀 납작해졌다 튄다. 이 한 프레임이 '톡'이다.
          frames.push({
            transform: `${at(land.x, land.y + 3)} rotate(${(tilt * 0.5).toFixed(1)}deg) scale(1.28, 0.7)`,
            opacity: 1,
            offset: RESOURCE_TOKEN_LAND + 0.025,
          })
          // 3) 잠깐 머문다 — 무엇이 떨어졌는지 읽을 틈.
          frames.push({
            transform: `${at(land.x, land.y - 7)} rotate(${(tilt * 0.5).toFixed(1)}deg) scale(1.04)`,
            opacity: 1,
            offset: RESOURCE_TOKEN_DEPART,
          })
          // 4) HUD로 빨려 들어간다 — 가속해서 도착점에서 멈춘다.
          frames.push({
            transform: `${at(land.x + (to.x - land.x) * 0.45, land.y + (to.y - land.y) * 0.45)} rotate(0deg) scale(0.92)`,
            opacity: 1,
            offset: RESOURCE_TOKEN_DEPART + (RESOURCE_TOKEN_ARRIVE - RESOURCE_TOKEN_DEPART) * 0.55,
          })
          frames.push({ transform: `${at(to.x, to.y)} rotate(0deg) scale(0.72)`, opacity: 1, offset: RESOURCE_TOKEN_ARRIVE })
          frames.push({ transform: `${at(to.x, to.y)} rotate(0deg) scale(0.36)`, opacity: 0 })
          const anim = piece.animate(frames, {
            duration: RESOURCE_TOKEN_FLIGHT_MS,
            easing: 'linear',
            fill: 'forwards',
          })
          // 착탄 블라스트 — 호출부의 수치 롤링이 이 박자에 맞물린다.
          window.setTimeout(() => {
            SquareBurst.playAt(to.x, to.y, theme, { count: 12, spread: 72, duration: 400, size: [6, 14] })
            resolve()
          }, RESOURCE_TOKEN_FLIGHT_MS * RESOURCE_TOKEN_ARRIVE)
          const done = (): void => piece.remove()
          anim.onfinish = done
          window.setTimeout(done, RESOURCE_TOKEN_FLIGHT_MS + 200)
        }, i * stagger)
      })
    )
    return Promise.all(launches).then(() => undefined)
  }

  /**
   * 임의의 출처(오버레이 버튼·무료 카드·이벤트 씬)에서 HUD 자원으로 가는 **획득** 트레일.
   * 소모(불빛/화폐 → 버튼)는 여기로 보내지 않는다 — 나가는 값에 획득 아이콘이 뜨면
   * 무엇이 늘고 무엇이 줄었는지가 뒤집힌다.
   */
  animateResourceGain(
    source: HTMLElement | DOMRect | null,
    target: ResourceTrailTarget,
    count: number,
    theme: BurstTheme
  ): Promise<void> {
    return this.routeResourceTrail(source, target, count, theme)
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
/* 손패 획득 토큰 — 같은 사각 조각이되 **비율만** 손패 아이콘(카드)과 같다. 전용 도형이
   아니라 비율 변주라, 이펙트 어휘를 늘리지 않고도 '카드가 나왔다'가 읽힌다.
   호박빛 발광을 두 겹 둘러 어두운 레일 위에서도 금붙이로 읽히게 한다. */
.resource-trail-piece.is-card-token {
  border-radius: 4px;
  background: linear-gradient(152deg, #fff4d0 0%, #ffd97e 38%, #f0a93a 72%, #c9781f 100%);
  border: 1px solid rgba(120, 74, 22, 0.6);
  box-shadow:
    0 3px 9px rgba(0, 0, 0, 0.6),
    0 0 14px rgba(255, 226, 150, 0.95),
    0 0 32px rgba(255, 178, 62, 0.72),
    0 0 60px rgba(255, 150, 40, 0.36),
    inset 0 1px 0 rgba(255, 250, 226, 0.8);
}
/* 아이콘 토큰 — 자원이 **무엇인지**를 도형이 말한다(체력=하트, 별빛=반짝 …).
   전용 도형을 새로 그린 것이 아니라 HUD가 이미 쓰는 Icons.ts 글리프를 그대로 띄운다.
   판(배경)은 없다 — 글리프 자체가 발광해야 '허공에서 튀어나온 조각'이 아니라
   '그 자원이 떨어졌다'로 읽힌다. */
.resource-trail-piece.is-icon-token {
  background: none;
  border: 0;
  box-shadow: none;
  color: var(--token-ink, #ffe6a8);
  display: grid;
  place-items: center;
}
/* 발광은 **글리프 자식**에 건다. 부모의 filter로 두면 반짝임(brightness) 애니메이션이
   같은 속성을 덮어써 빛무리가 통째로 사라진다. */
.resource-trail-piece.is-icon-token svg {
  width: 100%;
  height: 100%;
  display: block;
  filter:
    drop-shadow(0 0 5px var(--token-core, rgba(255, 245, 214, 0.95)))
    drop-shadow(0 0 14px var(--token-glow, rgba(255, 196, 96, 0.9)))
    drop-shadow(0 0 34px var(--token-halo, rgba(244, 150, 52, 0.6)));
}
/* 별빛 토큰 — 불빛(✦)과 같은 네 꼭짓점 반짝 글리프다. 다른 것은 형태가 아니라 색이다:
   **글리프 자체는 백금색**(차가운 은백)이고, 그 둘레의 발광만 황금빛에 푸른빛을 섞는다.
   글리프까지 금빛으로 물들이면 일반 불빛 반짝과 구분이 사라진다.
   빛무리 반경은 따로 키운다 — 기본 반경으로는 푸른빛이 금빛에 먹혀 안 보인다. */
.resource-trail-piece.is-starlight-token {
  --token-ink: #e5e4e2;
  --token-core: rgba(240, 241, 244, 0.98);
  --token-glow: rgba(150, 176, 255, 0.95);
  --token-halo: rgba(92, 108, 224, 0.66);
  /* 떠 있는 동안 스스로 숨쉬어야 '반짝이'다. 위치 애니메이션(transform)과 겹치지 않게
     밝기만 흔든다 — 과하게 올리면 글리프가 날아가 흰 얼룩이 된다. */
  animation: starlight-token-twinkle 0.62s ease-in-out infinite;
}
/* 백금 글리프에 바로 붙는 첫 겹은 은백으로 둔다 — 여기부터 금빛이면 글리프가 금색으로
   물들어 보인다. 금빛은 한 겹 바깥, 푸른빛은 그 바깥에 둘러 '백금 별 + 금/푸른 후광'이 된다. */
.resource-trail-piece.is-starlight-token svg {
  filter:
    drop-shadow(0 0 5px rgba(238, 240, 246, 0.98))
    drop-shadow(0 0 14px rgba(255, 212, 132, 0.8))
    drop-shadow(0 0 30px rgba(126, 158, 255, 0.95))
    drop-shadow(0 0 58px rgba(74, 96, 224, 0.8))
    drop-shadow(0 0 96px rgba(46, 58, 168, 0.5));
}
@keyframes starlight-token-twinkle {
  0%, 100% { filter: brightness(1); }
  50% { filter: brightness(1.3); }
}
/* 화폐만 아이콘이 아니라 $ 글자가 HUD의 얼굴이라 글자를 그대로 띄운다. */
.resource-trail-piece.is-icon-token .token-glyph {
  font-weight: 900;
  font-size: 26px;
  line-height: 1;
  color: var(--token-ink, #ffe6a8);
  text-shadow:
    0 0 6px var(--token-core, rgba(255, 245, 214, 0.95)),
    0 0 16px var(--token-glow, rgba(255, 196, 96, 0.9)),
    0 0 34px var(--token-halo, rgba(244, 150, 52, 0.6));
}
@media (prefers-reduced-motion: reduce) {
  .resource-trail-piece.is-starlight-token { animation: none; }
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
    const stagger = handTokenStaggerMs(count)
    // 손패 아이콘(카드)과 같은 비율·비슷한 크기. 정사각에 가까우면 그냥 파편이 되고,
    // 너무 작으면 무엇이 떨어졌는지 읽히지 않는다.
    const width = 26
    const height = 38
    // 낙하 중 회전량 — 두 바퀴. 착지 프레임이 720°(= 0°와 같은 자리)라 되감기지 않는다.
    const SPIN = 720
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
          // 착지점은 **출처 칸 자리**다. 아래로 크게 내리면 잡은 칸이 아니라 엉뚱한 데서
          // 나온 것처럼 보인다. 카드 폭보다 넓게 벌려 겹쳐 한 장으로 보이지 않게만 한다.
          const spread = Math.max(width + 6, Math.min(48, 200 / Math.max(1, count)))
          // 바닥에 '톡' 떨어진 느낌 — 줄 세우지 않고 장마다 조금씩 어긋나게 눕힌다.
          const scatterY = SCATTER_Y[i % SCATTER_Y.length]
          const tilt = SCATTER_TILT[i % SCATTER_TILT.length]
          const land = {
            x: from.x + (i - (count - 1) / 2) * spread,
            y: Math.min(window.innerHeight - 40, from.y + 16 + scatterY),
          }
          const at = (px: number, py: number): string =>
            `translate(${px - width / 2}px, ${py - height / 2}px)`
          const frames: Keyframe[] = []
          // 1) 곡사로 튀어나와 내리꽂힌다.
          // 회전은 짝수 바퀴로 끝나야 착지 프레임(0°)으로 되감기지 않는다. 방향은 카드마다
          // 번갈아 줘 여러 장이 한 덩어리처럼 같이 도는 것을 막는다.
          const spinDir = i % 2 === 0 ? 1 : -1
          const SAMPLES = 10
          for (let s = 0; s <= SAMPLES; s += 1) {
            const t = s / SAMPLES
            const p = this.lobPointAt(from, land, t)
            const lift = Math.sin(Math.PI * t)
            // 뒤로 갈수록 빨리 돈다(t²) — 떨어지면서 회리릭 감기는 느낌.
            const spin = spinDir * SPIN * (t * 0.35 + t * t * 0.65)
            frames.push({
              transform: `${at(p.x, p.y)} rotate(${spin.toFixed(0)}deg) scale(${(0.6 + lift * 0.55).toFixed(3)})`,
              opacity: s === 0 ? 0 : 1,
              offset: Number((t * HAND_TOKEN_LAND).toFixed(4)),
            })
          }
          // 착지 이후의 모든 프레임은 회전을 **끝난 각도에서 이어 쓴다**. 0deg로 적으면
          // WAAPI가 720°를 되감아 카드가 거꾸로 한 바퀴 더 돈다.
          // 착지 각도는 정직한 0°가 아니라 **비스듬히 눕는다** — 세로로 줄 서면 진열대가
          // 되고, 기울어야 '툭 떨어뜨린 것'으로 읽힌다.
          const rest = spinDir * SPIN + tilt
          // 2) 착지 반동 — 바닥에 부딪혀 납작해졌다 튄다. 이 한 프레임이 '톡'이다.
          frames.push({
            transform: `${at(land.x, land.y + 3)} rotate(${rest * 1}deg) scale(1.3, 0.66)`,
            opacity: 1,
            offset: HAND_TOKEN_LAND + 0.025,
          })
          // 3) 표류 — 튕겨 올랐다 자리를 잡는다. 멈춰 세우면 화면이 굳어
          //    '몇 장이 나왔나'를 세는 구간이 정지 화면이 된다.
          const driftX = (i % 2 === 0 ? 1 : -1) * 4
          frames.push({
            transform: `${at(land.x + driftX, land.y - 9)} rotate(${(rest + driftX * 1.1).toFixed(1)}deg) scale(1.04)`,
            opacity: 1,
            offset: HAND_TOKEN_LAND + (HAND_TOKEN_DEPART - HAND_TOKEN_LAND) * 0.5,
          })
          frames.push({
            transform: `${at(land.x, land.y)} rotate(${rest.toFixed(1)}deg) scale(1)`,
            opacity: 1,
            offset: HAND_TOKEN_DEPART,
          })
          // 4) 손패로 빨려 들어간다 — 가속해서 도착점에서 멈춘다.
          frames.push({
            transform: `${at(land.x + (to.x - land.x) * 0.45, land.y + (to.y - land.y) * 0.45)} rotate(${rest - 8}deg) scale(0.94)`,
            opacity: 1,
            offset: HAND_TOKEN_DEPART + (HAND_TOKEN_ARRIVE - HAND_TOKEN_DEPART) * 0.55,
          })
          frames.push({
            transform: `${at(to.x, to.y)} rotate(${rest}deg) scale(0.7)`,
            opacity: 1,
            offset: HAND_TOKEN_ARRIVE,
          })
          frames.push({ transform: `${at(to.x, to.y)} rotate(${rest}deg) scale(0.4)`, opacity: 0 })
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

  /**
   * 별빛 수집 — 90~100층에서 턴을 여는 유일한 열쇠라, 파편이 흘러드는 자원 트레일과
   * 다른 무게를 준다. 손패 토큰과 같은 세 박자를 쓰되 **떠오름 → 두둥실 → 꽂힘**이다.
   *
   *   1) 카드가 빛으로 풀려 화면으로 **떠오른다**(곡사로 튀어나오지 않는다 — 별빛은
   *      떨어지는 것이 아니라 올라가는 것이다).
   *   2) 두둥실 표류하며 반짝인다. 이 한 박자가 없으면 '무엇을 얻었나'를 볼 틈이 없다.
   *   3) 턴 카운터 **위에서 수직으로 내리꽂힌다**. 옆에서 흘러들면 그냥 자원이 된다.
   *
   * 토큰은 HUD가 불빛에 쓰는 **네 꼭짓점 반짝(✦) 글리프 그대로**다. 별빛과 불빛을
   * 가르는 것은 형태가 아니라 빛의 색 — 황금빛 심지에 푸른빛을 섞은 발광이다.
   */
  animateStarlightToken(
    source: HTMLElement | DOMRect | null,
    target: HTMLElement | DOMRect | null
  ): Promise<void> {
    if (!source || !target) return Promise.resolve()
    this.ensureResourceTrailStyles()
    const from = this.rectCenter(source)
    const to = this.rectCenter(target)
    // 반짝 글리프가 읽히려면 파편보다 커야 한다.
    const size = 40
    const at = (px: number, py: number): string =>
      `translate(${px - size / 2}px, ${py - size / 2}px)`
    // 반짝은 **똑바로 서 있어야** 별로 읽힌다. 회전은 흔들림 수준으로만 얹는다 —
    // 손패 토큰처럼 두 바퀴 돌리면 굴러가는 조각이 되고 네 꼭짓점이 뭉갠다.
    const pose = (px: number, py: number, tilt: number, scale: number): string =>
      `${at(px, py)} rotate(${tilt.toFixed(1)}deg) scale(${scale.toFixed(3)})`

    const piece = this.createIconToken('is-starlight-token', size, sparkleIcon())

    // 떠오르는 높이는 화면 밖으로 새지 않게 가둔다(위쪽 레일에서 먹어도 보이는 곳에 머문다).
    const float = {
      x: from.x + (to.x - from.x) * 0.18,
      y: Math.max(120, from.y - 104),
    }
    // 꽂히기 직전 들르는 지점 — 턴 바로 위. 여기서부터는 수직 낙하다.
    // 턴 카운터는 화면 최상단에 가까워 위쪽 여유가 적다. 상한을 8px까지 열어 내리꽂을
    // 거리를 최대한 확보한다 — 여유가 없으면 '옆에서 흘러든 것'으로 읽힌다.
    const above = { x: to.x, y: Math.max(8, to.y - STARLIGHT_PLUNGE_PX) }

    const frames: Keyframe[] = [
      // 1) 카드 자리에서 빛으로 풀려 솟는다.
      { transform: pose(from.x, from.y, -14, 0.35), opacity: 0, offset: 0 },
      { transform: pose(from.x + (float.x - from.x) * 0.4, from.y - (from.y - float.y) * 0.55, -7, 1.16), opacity: 1, offset: STARLIGHT_TOKEN_RISE * 0.55 },
      { transform: pose(float.x, float.y, 0, 1), opacity: 1, offset: STARLIGHT_TOKEN_RISE },
      // 2) 두둥실 — 위로 한 번 더 떠올랐다 가라앉으며 머문다. 진폭이 작으면 화면에서는
      //    그냥 멈춰 선 것으로 보이므로 눈에 보일 만큼 흔든다.
      { transform: pose(float.x + 16, float.y - 22, 9, 1.1), opacity: 1, offset: STARLIGHT_TOKEN_RISE + (STARLIGHT_TOKEN_DEPART - STARLIGHT_TOKEN_RISE) * 0.4 },
      { transform: pose(float.x - 11, float.y + 12, -6, 0.96), opacity: 1, offset: STARLIGHT_TOKEN_DEPART },
      // 3) 턴 카운터 위로 건너간 뒤 수직으로 내리꽂힌다. 도착 직전 살짝 뜸을 들여
      //    'ㅅ자로 꺾여 떨어진다'가 읽히게 한다.
      { transform: pose(above.x, above.y, 5, 1.18), opacity: 1, offset: STARLIGHT_TOKEN_DEPART + (STARLIGHT_TOKEN_ARRIVE - STARLIGHT_TOKEN_DEPART) * 0.58 },
      // 4) 꽂힘 — 세로로 늘어난 채 박혔다가 납작해진다. 이 두 프레임이 '탕'이다.
      { transform: `${at(to.x, to.y)} rotate(0deg) scale(0.62, 1.24)`, opacity: 1, offset: STARLIGHT_TOKEN_ARRIVE },
      { transform: `${at(to.x, to.y)} rotate(0deg) scale(1.24, 0.6)`, opacity: 1, offset: STARLIGHT_TOKEN_ARRIVE + 0.03 },
      // 5) 꽂힌 자리에서 빛으로 사그라든다.
      { transform: pose(to.x, to.y, 0, 0.34), opacity: 0, offset: 1 },
    ]
    const anim = piece.animate(frames, {
      duration: STARLIGHT_TOKEN_FLIGHT_MS,
      easing: 'linear',
      fill: 'forwards',
    })

    // 표류하는 동안 한 번 반짝인다 — '반짝이'라는 말이 화면에서 사실이 되는 지점이다.
    window.setTimeout(() => {
      SquareBurst.playAt(float.x, float.y, 'starlight', {
        count: 7,
        spread: 46,
        duration: 420,
        size: [4, 10],
      })
    }, STARLIGHT_TOKEN_FLIGHT_MS * (STARLIGHT_TOKEN_RISE + 0.06))

    return new Promise<void>((resolve) => {
      // 꽂히는 박자에 턴 쪽 블라스트를 터뜨리고, 호출부는 그 뒤에 턴을 올린다.
      window.setTimeout(() => {
        SquareBurst.playAt(to.x, to.y, 'starlight', {
          count: 14,
          spread: 74,
          duration: 380,
          size: [5, 13],
        })
      }, STARLIGHT_TOKEN_FLIGHT_MS * STARLIGHT_TOKEN_ARRIVE)
      const done = (): void => {
        piece.remove()
        resolve()
      }
      anim.onfinish = done
      window.setTimeout(done, STARLIGHT_TOKEN_FLIGHT_MS + 200)
    })
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
