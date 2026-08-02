/**
 * BossFxView — 보스 인트로/전투 연출·격파 시퀀스·악마 커튼 오버레이.
 * GameBoardRenderer에서 표시 책임만 옮겨 왔다 — 렌더 상태의 단일 출처는 host다.
 */

import type { GameBoardRenderer } from '@ui/GameBoardRenderer'
import { spriteForHandCard, SpriteUrls } from '@ui/Sprites'
import { SquareBurst, type BurstTheme } from '@ui/SquareBurst'
import { escapeHtml } from '@ui/renderer/Html'
import type { BossGimmickStrikeView } from '@ui/renderer/RendererTypes'
import { sfx } from '@/audio/SfxManager'
import {
  BOSS_GIMMICK_CRACK_STAGES,
  BOSS_GIMMICK_KIND_META,
  type BossGimmickCellKind,
  type BossGimmickTone,
} from '@systems/BossGimmickManager'

/**
 * 부위 파괴 시 판이 갈라지는 조각 수.
 *
 * 예전에는 발광하는 촛농 방울 12개가 아래로 떨어졌는데, 화면에서는 '불씨 조각이
 * 흩날린다'로 읽혀 무엇이 일어났는지 흐렸다. 지금은 **깨진 판 자체**가 몇 조각으로
 * 갈라져 날아간다 — 조각 수가 적어야 한 덩어리씩 쪼개진 게 보인다.
 */
const BOSS_CELL_PIECE_COUNT = 4
/** 팡 하고 부풀었다가 갈라지기까지의 길이. */
const BOSS_CELL_BREAK_MS = 620

/** 배율 표기가 사그라드는 시간. CSS `.is-relabel-out` 트랜지션과 같은 값이어야 한다. */
const BOSS_GIMMICK_RELABEL_OUT_MS = 220

/** 칸마다 블라스트가 출발하는 간격. 동시에 쏘면 출발점(손패)이 화면에서 사라진다. */
const BOSS_CELL_VOLLEY_STEP_MS = 70
/** 출발 섬광이 머무는 시간. CSS `.boss-cell-volley-launch`와 같은 값이어야 한다. */
const BOSS_CELL_VOLLEY_LAUNCH_MS = 420

/** 보스 직접 타격(들어올림→당김→쾅) 전체 길이. */
const BOSS_SLAM_DURATION_MS = 780
/** 그 안에서 '쾅'이 터지는 지점. 피해 수치와 화면 흔들림이 이 프레임에 맞춰 나간다. */
const BOSS_SLAM_IMPACT_OFFSET = 0.62
/** 착지 흔들림 길이. CSS `.is-boss-slam-shake` 애니메이션과 같은 값이어야 한다. */
const BOSS_SLAM_SHAKE_MS = 260

/** 손패로 들어가지 못하고 흩어져 사라지는 여분 금화 수 — '살포'로 보이게 하는 최소치. */
const BOSS_GREED_STRAY_COINS = 5
/** 흩뿌린 동전이 화면에 머무는 시간. 손패 유입과 별개의 박자로 읽히게 한다. */
const BOSS_GREED_SCATTER_HOLD_MS = 220
/** 탐욕의 값 셈 — 동전 한 장을 짚는 간격. 빠르면 몇 장인지 못 세고 지나간다. */
const BOSS_GREED_WAVE_STEP_MS = 260
/** 셈이 끝나고 청구가 시작되기까지의 정적. 값이 확정된 순간을 만든다. */
const BOSS_GREED_COUNT_SETTLE_MS = 460
/** 세어진 장수가 화면에 머무는 시간 — 청구가 끝날 때까지 남아 있어야 한다. */
const BOSS_GREED_COUNT_HOLD_MS = 1400
/** 탐욕의 값 징수 — 동전 한 장이 꽂히는 간격. */
const BOSS_GREED_TOLL_STEP_MS = 220

/** 페이지 게이트 경고 노출 시간. 피해 수치(980ms)보다 길다 — 읽어야 하는 문장이다. */
const BOSS_PAGE_GATE_WARNING_MS = 1800
/** 리미트 페이지에 막 닿은 1회는 더 오래 보여 준다. */
const BOSS_PAGE_GATE_EMPHATIC_MS = 2600

/**
 * 칸 성격의 톤 → 이 렌더러의 팔레트/세기. 칸 종류가 아니라 톤으로 갈라 두면
 * 새 칸 종류(직접 타격 전용 칸 등)를 추가해도 여기 분기가 늘지 않는다.
 */
const BOSS_GIMMICK_TONE_FX: Record<BossGimmickTone, { theme: BurstTheme; count: number; spread: number }> = {
  hot: { theme: 'damage', count: 16, spread: 120 },
  cold: { theme: 'shield-gain', count: 8, spread: 70 },
  neutral: { theme: 'boss-wax-drip', count: 12, spread: 96 },
}

/** 손상도(0~1) → 균열 단계(0 = 멀쩡). 표기 단계의 단일 출처다. */
function bossGimmickCrackStage(wear: number): number {
  if (wear <= 0) return 0
  return Math.min(BOSS_GIMMICK_CRACK_STAGES, Math.max(1, Math.ceil(wear * BOSS_GIMMICK_CRACK_STAGES)))
}

export class BossFxView {
  constructor(private readonly host: GameBoardRenderer) {}

  /** 악마 소환 레시피 발동 시 레일 위에 겹치는 커튼 오버레이. */
  private demonCurtainOverlay: HTMLElement | null = null

  /** 악마 소환 레시피 발동 시 레일 위에 커튼을 닫는다.
   *  job-rail-curtain의 기본 close 애니메이션(양쪽에서 중앙으로)을 재활용한다. */
  async closeDemonCurtain(): Promise<void> {
    this.ensureDemonCurtainStyles()
    const overlay = document.createElement('div')
    overlay.id = 'demon-curtain-overlay'
    const shell = document.createElement('div')
    shell.className = 'demon-curtain-shell'
    const rail = this.host.boardElement.querySelector<HTMLElement>('.rail')
    if (rail) {
      const rect = rail.getBoundingClientRect()
      shell.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;overflow:hidden;border-radius:14px;`
    }
    shell.innerHTML = `
      <div class="job-rail-curtain job-rail-curtain--left demon-curtain-panel" aria-hidden="true"></div>
      <div class="job-rail-curtain job-rail-curtain--right demon-curtain-panel" aria-hidden="true"></div>`
    overlay.appendChild(shell)
    document.body.appendChild(overlay)
    this.demonCurtainOverlay = overlay
    // 기본 close 애니메이션(0.68s)이 끝날 때까지 대기.
    await new Promise<void>((r) => window.setTimeout(r, 740))
  }

  /** 악마 소환 직전 — 화면에 불길한 붉은 일렁임을 잠시 띄운다 (fire-and-forget). */
  playOminousShimmer(): void {
    const el = document.createElement('div')
    el.className = 'demon-summon-shimmer'
    document.body.appendChild(el)
    window.setTimeout(() => el.remove(), 1400)
  }

  /** 악마 소환 체인 배너를 화르르 사라지게 한다. */
  async playDemonBannerBurnFade(): Promise<void> {
    const banner = document.getElementById('chain-banner')
    if (!banner) return
    banner.classList.remove('is-demon-impact')
    banner.classList.add('is-demon-impact-fading')
    await new Promise<void>((r) => window.setTimeout(r, 720))
    banner.classList.remove('is-demon-impact-fading')
  }

  /** 악마 보스 커튼 앞 등장: 게임 보드를 커튼 오버레이보다 높은 z-index로 올린다. */
  elevateBoardAboveCurtain(): void {
    this.host.boardElement.style.position = 'relative'
    this.host.boardElement.style.zIndex = '150'
    this.host.boardElement.style.isolation = 'isolate'
  }

  /** 악마 보스 커튼 제거 및 보드 z-index 복원. */
  removeDemonCurtain(): void {
    this.host.boardElement.style.position = ''
    this.host.boardElement.style.zIndex = ''
    this.host.boardElement.style.isolation = ''
    if (this.demonCurtainOverlay) {
      this.demonCurtainOverlay.remove()
      this.demonCurtainOverlay = null
    }
  }

  /**
   * 악마 보스 등장 연출: 커튼은 그대로 둔 채 보드를 올린 뒤
   * 보스 타일이 작고 어두운 상태에서 점차 커지고(Phase1), 그 뒤 흐림이 걷히며 선명해진다(Phase2).
   * 두 페이즈는 딜레이로 분리해 순차 진행한다.
   */
  async playDemonFireAppearAnimation(cardId: string): Promise<void> {
    this.elevateBoardAboveCurtain()
    const tile = this.host.findCardElement(cardId)
    // render() 직후 풀 사이즈로 노출되지 않도록 즉시 숨긴 상태로 고정
    if (tile) {
      tile.style.transition = 'none'
      tile.style.transform = 'scale(0.12)'
      tile.style.opacity = '0'
      tile.style.filter = 'blur(20px) brightness(0.08)'
      void tile.offsetWidth  // reflow
    }
    // 커튼 뒤 암흑 유지 후 등장 시작
    await new Promise((r) => window.setTimeout(r, 700))
    if (!tile) return
    // reflow 없이 바로 transition 적용 (이미 초기 상태 고정됨)
    // Phase 1: 규모 성장 + 투명도 해소 (흐림은 유지)
    tile.style.transition = 'transform 0.82s cubic-bezier(0.18, 0.82, 0.25, 1), opacity 0.65s ease-out'
    tile.style.transform = 'scale(1.0)'
    tile.style.opacity = '1'
    await new Promise((r) => window.setTimeout(r, 860))
    // Phase 2: 흐림 해소 + 밝기 복원
    tile.style.transition = 'filter 0.74s ease-out'
    tile.style.filter = 'blur(0px) brightness(1)'
    await new Promise((r) => window.setTimeout(r, 780))
    // 인라인 스타일 정리
    tile.style.transition = ''
    tile.style.transform = ''
    tile.style.opacity = ''
    tile.style.filter = ''
    await new Promise((r) => window.setTimeout(r, 300))
  }

  /** 악마 보스 등장 후 커튼을 열어 보스를 공개한다.
   *  커튼이 보드 위에 있어야 열리면서 레일이 드러나므로, 먼저 보드 elevation을 복원한다. */
  async openDemonCurtain(): Promise<void> {
    const overlay = this.demonCurtainOverlay
    if (!overlay) return
    // 보드를 커튼 아래로 복원해야 커튼 열림 연출이 레일을 가리다 걷히는 효과를 낸다.
    this.host.boardElement.style.position = ''
    this.host.boardElement.style.zIndex = ''
    this.host.boardElement.style.isolation = ''
    overlay.classList.add('is-opening')
    await new Promise<void>((r) => window.setTimeout(r, 1100))
    overlay.remove()
    this.demonCurtainOverlay = null
  }

  private ensureDemonCurtainStyles(): void {
    if (document.getElementById('demon-curtain-styles')) return
    const style = document.createElement('style')
    style.id = 'demon-curtain-styles'
    style.textContent = `
#demon-curtain-overlay {
  position: fixed; inset: 0; z-index: 145; pointer-events: none;
}
#demon-curtain-overlay .demon-curtain-panel {
  width: 56%;
  filter: saturate(0.55) hue-rotate(-12deg) brightness(0.82);
}
#demon-curtain-overlay.is-opening .job-rail-curtain--left {
  animation: job-curtain-open-left 0.92s cubic-bezier(0.18, 0.82, 0.25, 1) forwards;
}
#demon-curtain-overlay.is-opening .job-rail-curtain--right {
  animation: job-curtain-open-right 0.92s cubic-bezier(0.18, 0.82, 0.25, 1) forwards;
}
`
    document.head.appendChild(style)
  }

  /** 보스 등장 직전, 화면을 어둡게 가린 풀스크린 인트로 카드:
   *  좌측에 보스 일러스트, 우측에 이름/HP/공격력/특수/연출 설명. 어느 곳이나
   *  클릭하면 닫히고 다음 비트(셔터 위 보스 타일 강하)로 이어진다. */
  async openBossIntroOverlay(opts: {
    name: string
    maxHp: number
    attack: number
    attackInterval: number
    handGiftStep: number
    spriteUrl?: string
    /** 인트로 카드에 표시할 보스 첫 대사 */
    introBubble?: string
    /** 인트로 카드에 표시할 특징 한 줄 */
    trait?: string
    /** 인트로 카드 상단 수식어 (기본: 탐욕의 대가) */
    kicker?: string
  }): Promise<void> {
    // 잔재 정리: 직전 보스 이벤트가 비정상 종료됐다면 같은 노드가 남아 있을 수 있다.
    document.getElementById('boss-intro-overlay')?.remove()
    const spriteUrl = opts.spriteUrl ?? SpriteUrls.enemyWaves[3]
    const traitLines = (opts.trait ?? `보스 체력이 ${opts.handGiftStep} 닳을 때마다 플레이어에게 랜덤 손패 1장을 지급한다.`)
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
    const traitMarkup = traitLines.length > 1
      ? `<div class="boss-intro-overlay-trait"><strong>특징</strong><ul>${traitLines.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul></div>`
      : `<p class="boss-intro-overlay-trait"><strong>특징</strong> · ${escapeHtml(traitLines[0] ?? '')}</p>`
    // 모든 보스 공통 규칙 레이어 — 실제 지급 간격(handGiftStep)을 그대로 표기(양초 고양이=5).
    const commonMarkup = `<p class="boss-intro-overlay-trait boss-intro-overlay-common"><strong>공통</strong> · 보스 체력 ${opts.handGiftStep} 감소마다 손패 1장 획득</p>`
    const host = document.createElement('div')
    host.id = 'boss-intro-overlay'
    host.className = 'boss-intro-overlay'
    host.innerHTML = `
      <section class="boss-intro-overlay-card" role="dialog" aria-label="보스 출현">
        <div class="boss-intro-overlay-art" style="background-image:url('${spriteUrl}');" aria-hidden="true"></div>
        <div class="boss-intro-overlay-body">
          <span class="boss-intro-overlay-kicker">${escapeHtml(opts.kicker ?? '탐욕의 대가')}</span>
          <h2 class="boss-intro-overlay-name">${escapeHtml(opts.name)}</h2>
          <ul class="boss-intro-overlay-stats">
            <li><span class="boss-intro-overlay-stat-label">체력</span><span class="boss-intro-overlay-stat-value">${opts.maxHp}</span></li>
            <li><span class="boss-intro-overlay-stat-label">공격력</span><span class="boss-intro-overlay-stat-value">${opts.attack}</span></li>
            <li><span class="boss-intro-overlay-stat-label">반격 주기</span><span class="boss-intro-overlay-stat-value">${opts.attackInterval}턴</span></li>
          </ul>
          <p class="boss-intro-overlay-desc">"${escapeHtml(opts.introBubble ?? '내 저택에 온 것을 환영하네, 위태로운 불씨여.')}"</p>
          ${commonMarkup}
          ${traitMarkup}
        </div>
      </section>
      <div class="boss-intro-overlay-hint" aria-hidden="true">CLICK ANYWHERE TO CONTINUE</div>
    `
    document.body.appendChild(host)
    // 타이틀 카드가 완전히 떠오른 뒤에만 하단 문구와 클릭 입력을 연다.
    await new Promise((resolve) => window.setTimeout(resolve, 1700))
    host.classList.add('is-ready')
    await new Promise<void>((resolve) => {
      const close = (): void => {
        host.classList.add('is-closing')
        window.setTimeout(() => {
          host.remove()
          resolve()
        }, 240)
      }
      host.addEventListener('click', close, { once: true })
    })
  }


  /** 보스 좌상단 뱃지에 표시할 "N턴 뒤 공격" 카운트. null이면 마크업이 정적 텍스트로
   *  fallback 한다. index.ts의 보스 가상 턴 흐름이 매 턴마다 update한다. */
  private bossAttackCountdown: number | null = null
  setBossAttackCountdown(n: number | null): void {
    this.bossAttackCountdown = n
    // 보스 카드가 화면에 있다면 바로 텍스트만 in-place로 갱신해 render 부담을 줄인다.
    document.querySelectorAll<HTMLElement>('[data-boss-attack-countdown]').forEach((el) => {
      el.textContent = n == null ? '' : `${n}턴`
    })
  }
  getBossAttackCountdownText(): string {
    const n = this.bossAttackCountdown == null ? 3 : this.bossAttackCountdown
    // 좌상단 배지는 카드의 다른 턴 표기와 맞춰 명령형 문구 없이 숫자만 읽히게 한다.
    return `${Math.max(0, n)}턴`
  }

  /** 보스 타일 위에 겹치는 칸 기믹 격자. 상태는 host가 들고 있고 여기선 마크업만 만든다.
   *  칸 자체는 투명하며(일러스트를 가리지 않는다) 정체가 드러난 칸만 표식을 남긴다. */
  bossGimmickGridHtml(isValidHandTarget: boolean, distance = 0): string {
    const grid = this.host.getBossGimmickGrid()
    if (!grid) return ''
    // 레일 행을 여러 개 차지하는 보스는 타일마다 격자 **한 행씩** 그린다.
    // 안 나누면 행마다 같은 9칸이 통째로 겹쳐 그려져 어디를 때리는지가 사라진다.
    const splitRows = grid.tileRows > 1
    const rowIndex = splitRows ? distance - grid.startDistance : 0
    if (splitRows && (rowIndex < 0 || rowIndex >= grid.rows)) return ''
    const visible = splitRows
      ? grid.cells.slice(rowIndex * grid.cols, (rowIndex + 1) * grid.cols)
      : grid.cells
    // 손패 타겟팅 중에는 칸 하나하나가 일반 레일 칸처럼 개별 타깃으로 빛난다.
    // 이 보스가 그 손패의 유효 대상일 때만 — 아니면 보스 타일 전체가 차단 표시로 남는다.
    const targeting = this.host.getHandTargetingMode() !== null && isValidHandTarget
    // 1회성 연출 플래그는 **렌더 1회 단위**로 소비한다. 다행 보스는 한 render에서
    // 타일이 여러 개 그려지므로, 타일마다 소비하면 첫 행만 연출을 먹고 나머지가 굳는다.
    const flags = this.consumeGridFlags()
    const entering = flags.entering
    const relabeling = flags.relabeling
    const cells = visible
      .map((cell) => {
        const meta = BOSS_GIMMICK_KIND_META[cell.kind]
        const label = meta.label
          ? `<span class="boss-gimmick-cell-label">${escapeHtml(meta.label)}</span>
             <span class="boss-gimmick-cell-mult">×${meta.multiplier}</span>`
          : ''
        // 균열은 손상도로만 결정되는 표시 레이어다. 깨진 칸은 금 대신 꺼진 판이 된다.
        const crack = bossGimmickCrackStage(cell.wear)
        const aria = cell.broken
          ? `파괴된 ${meta.label || '보스'} 부위`
          : meta.label
            ? `${meta.label} 부위 · 피해 ${meta.multiplier}배`
            : '보스 부위'
        // --boss-gimmick-i는 등장 연출의 칸별 지연에 쓰인다(좌상단부터 순차 점등).
        // data-tone: 칸 색/타격 애니메이션은 종류가 아니라 톤으로 갈린다 —
        // 새 칸 종류가 META 표에 한 줄 늘어도 CSS를 새로 쓰지 않아도 된다.
        return `<button class="boss-gimmick-cell is-kind-${cell.kind} ${cell.broken ? 'is-broken' : ''} ${targeting && !cell.broken ? 'is-hand-target' : ''}"
                        type="button" style="--boss-gimmick-i:${cell.index};" data-tone="${meta.tone}"
                        data-boss-gimmick-cell="${cell.index}" data-crack="${cell.broken ? 0 : crack}"
                        ${cell.broken ? 'data-broken="1" aria-disabled="true"' : ''} aria-label="${aria}">
                  <span class="boss-gimmick-cell-crack" aria-hidden="true"></span>${label}
                </button>`
      })
      .join('')
    return `<div class="boss-gimmick-grid ${targeting ? 'is-targeting' : ''} ${entering ? 'is-appearing' : ''} ${relabeling ? 'is-relabeling' : ''}"
                 style="--boss-gimmick-cols:${grid.cols};--boss-gimmick-rows:${splitRows ? 1 : grid.rows};">${cells}</div>`
  }

  /**
   * 배율 리롤의 앞 절반 — 지금 화면에 붙어 있는 배율 표기를 사그라뜨린다.
   * 뒤 절반(새 표기가 떠오르는 연출)은 다음 렌더의 `is-relabeling`이 맡는다.
   * 모델을 먼저 굴리고 렌더하면 배율이 툭 바뀌어 무엇이 달라졌는지 읽히지 않는다.
   */
  async fadeBossGimmickLabels(): Promise<void> {
    const grid = this.host.boardElement.querySelector<HTMLElement>('.boss-gimmick-grid')
    if (!grid) return
    grid.classList.add('is-relabel-out')
    await new Promise<void>((resolve) => window.setTimeout(resolve, BOSS_GIMMICK_RELABEL_OUT_MS))
  }

  /** 렌더 1회 안에서 공유되는 격자 연출 플래그(등장/리롤). */
  private gridFlagPass = -1
  private gridFlags = { entering: false, relabeling: false }
  private consumeGridFlags(): { entering: boolean; relabeling: boolean } {
    const pass = this.host.getRenderPass()
    if (pass !== this.gridFlagPass) {
      this.gridFlagPass = pass
      this.gridFlags = {
        entering: this.host.consumeBossGimmickEntering(),
        relabeling: this.host.consumeBossGimmickRelabel(),
      }
    }
    return this.gridFlags
  }

  /** 격자 칸 DOM 조회 — 연출이 좌표를 잡는 유일한 경로. */
  findBossGimmickCell(cellIndex: number): HTMLElement | null {
    return this.host.boardElement.querySelector<HTMLElement>(
      `.boss-gimmick-cell[data-boss-gimmick-cell="${cellIndex}"]`
    )
  }

  /**
   * 보스 칸 타격 연출의 단일 창구.
   *
   * 보스는 화면에서 큰 타일 하나라 "방금 어느 칸을 때렸는지"가 보이지 않는다. 그래서
   * 출처(사용한 손패 중앙 / 플레이어 카드)에서 맞은 칸으로 블라스트를 먼저 쏘고,
   * 같은 자리에서 피해 수치를 띄운 뒤 균열 한 겹을 얹는다. 그 타격에 칸이 깨졌으면
   * 파편이 흩어지고 부위 파괴 추가 피해가 이어서 뜬다.
   */
  async playBossGimmickStrikes(
    hits: readonly BossGimmickStrikeView[],
    source: HTMLElement | DOMRect | null
  ): Promise<void> {
    if (hits.length === 0) return
    sfx.playAttack()
    // 출처에서 한 번 터뜨린다 — 광역 손패가 9칸을 동시에 때리면 "그냥 모든 칸에 딜이
    // 꽂혔다"로만 보여서, 그게 **내가 쓴 손패에서 나갔다**는 게 읽히지 않는다.
    if (source) this.playBossCellVolleyLaunch(source)
    // 칸마다 시차를 둬 한 발씩 날아가는 게 보이게 한다. 동시에 쏘면 출발점이 사라진다.
    await Promise.all(
      hits.map(async (hit, index) => {
        if (index > 0) await new Promise((r) => window.setTimeout(r, index * BOSS_CELL_VOLLEY_STEP_MS))
        return this.playBossGimmickStrike(hit, source)
      })
    )
    // 피해가 0으로 막힌 beat면 수치 대신 왜 안 들어갔는지를 알린다(리미트 페이지).
    if (hits.every((hit) => hit.damage <= 0 && hit.breakDamage <= 0)) {
      const gate = this.host.bossPageGateNotice()
      if (gate) await this.playBossPageGateWarning(gate.cardId, gate.text, false)
    }
  }

  /**
   * 페이지 게이트 경고 — 피해가 하한에 막힌 beat에서 **피해 수치가 뜰 자리에 대신** 뜬다.
   * 그래서 양식도 피해 수치(`damage-float`)를 그대로 쓰고 색만 밀랍 톤으로 바꾼다.
   * 다만 읽어야 하는 문장이므로 수치보다 오래 머문다.
   */
  async playBossPageGateWarning(cardId: string, text: string, emphatic: boolean): Promise<void> {
    const tile = this.host.findCardElement(cardId)
    if (!tile) return
    const rect = tile.getBoundingClientRect()
    return this.host.animateFloatTextAt(
      rect.left + rect.width / 2,
      rect.top + rect.height * 0.34,
      text,
      {
        className: `damage-float--gate ${emphatic ? 'is-emphatic' : ''}`,
        durationMs: emphatic ? BOSS_PAGE_GATE_EMPHATIC_MS : BOSS_PAGE_GATE_WARNING_MS,
      }
    )
  }

  /**
   * 손패가 터진 자리에서 화살이 쏟아져 나가는 한 프레임.
   *
   * 칸에 도착하는 블라스트만 있으면 "어디선가 날아왔다"까지만 읽힌다. 출발점에도
   * 섬광을 한 번 놓아야 **저 손패에서 나갔다**로 이어진다.
   */
  private playBossCellVolleyLaunch(source: HTMLElement | DOMRect): void {
    const rect = source instanceof HTMLElement ? source.getBoundingClientRect() : source
    const flash = document.createElement('div')
    flash.className = 'boss-cell-volley-launch'
    flash.setAttribute('aria-hidden', 'true')
    flash.style.cssText = `left:${rect.left + rect.width / 2}px;top:${rect.top + rect.height / 2}px;`
    document.body.appendChild(flash)
    window.setTimeout(() => flash.remove(), BOSS_CELL_VOLLEY_LAUNCH_MS)
    SquareBurst.playAt(rect.left + rect.width / 2, rect.top + rect.height / 2, 'damage', {
      count: 18,
      spread: 130,
      duration: 480,
    })
  }

  private async playBossGimmickStrike(
    hit: BossGimmickStrikeView,
    source: HTMLElement | DOMRect | null
  ): Promise<void> {
    const cell = this.findBossGimmickCell(hit.cellIndex)
    if (!cell) return
    // 1) 출처 → 칸 블라스트. 어느 칸에 꽂혔는지를 눈으로 먼저 잇는다.
    if (source) {
      await this.host.trails.animateResourceTrail(source, cell, 1, this.gimmickFx(hit.kind).theme)
    }
    // 2) 타격 반동 + 칸 자체의 짧은 버스트.
    this.playBossGimmickCellHit(hit.cellIndex, hit.kind)
    // 3) 피해 수치도 보스 타일 중앙이 아니라 맞은 칸 위에서 뜬다.
    const numbers: Promise<void>[] = []
    if (hit.damage > 0) numbers.push(this.host.animateDamageNumberOnElement(cell, hit.damage))
    if (hit.broke) numbers.push(this.playBossGimmickCellBreak(cell, hit.breakDamage))
    await Promise.all(numbers)
  }

  /** 칸 성격의 톤이 정하는 연출 값 — 종류가 아니라 톤으로 갈라 새 칸에 자동 대응한다. */
  private gimmickFx(kind: BossGimmickCellKind): { theme: BurstTheme; count: number; spread: number } {
    return BOSS_GIMMICK_TONE_FX[BOSS_GIMMICK_KIND_META[kind].tone]
  }

  /** 때린 칸에 짧은 타격 피드백. 약점은 강한 버스트, 경화는 둔탁한 억제 톤. */
  private playBossGimmickCellHit(cellIndex: number, kind: BossGimmickCellKind): void {
    const cell = this.findBossGimmickCell(cellIndex)
    if (!cell) return
    const fx = this.gimmickFx(kind)
    SquareBurst.playOn(cell, fx.theme, { count: fx.count, spread: fx.spread, duration: 480 })
    // is-enemy-hit은 일반 적 카드가 맞을 때와 같은 반동이다 — 직접 타격에만 있고
    // 카드로 칠 때는 없어 '맞았다'가 안 읽히던 문제를 칸 단위로 맞춘다.
    cell.classList.remove('is-hit', 'is-enemy-hit')
    // 리플로우 1회로 같은 칸을 연타해도 애니메이션이 매번 처음부터 재생되게 한다.
    void cell.offsetWidth
    cell.classList.add('is-hit', 'is-enemy-hit')
    window.setTimeout(() => cell.classList.remove('is-hit', 'is-enemy-hit'), 520)
  }

  /**
   * 부위 파괴 — **팡 하고 부풀었다가 판이 갈라지는** 한 비트.
   *
   * 부위 파괴는 이 전투에서 가장 큰 사건이라(칸 절반을 깨면 보스가 쓰러진다) 배율
   * 타격과 확실히 다른 어휘여야 한다. 그래서 순서를 셋으로 쪼갠다:
   *   1) 칸이 한 번 크게 부푼다 — "터진다"의 예비 동작
   *   2) 판이 조각으로 갈라져 회전하며 날아간다 — 되돌릴 수 없다는 표시
   *   3) 자리에는 꺼진 판만 남는다(렌더가 그린다)
   *
   * 연출을 칸 DOM이 아니라 body 오버레이에 올리는 이유: 파괴 직후 곧바로 재렌더가
   * 일어나 칸 노드가 새로 그려져도(깨진 판으로 교체) 조각이 끊기지 않게 하기 위해서다.
   */
  private async playBossGimmickCellBreak(cell: HTMLElement, breakDamage: number): Promise<void> {
    const rect = cell.getBoundingClientRect()
    const host = document.createElement('div')
    host.className = 'boss-cell-shatter'
    host.setAttribute('aria-hidden', 'true')
    host.style.cssText = `left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;`
    // 부푸는 판 — 갈라지기 직전 한 프레임을 크게 벌려 '팡'을 만든다.
    const pane = document.createElement('div')
    pane.className = 'boss-cell-shatter-pane'
    host.appendChild(pane)
    // 갈라진 조각 — 사분면을 하나씩 맡아 바깥으로 회전하며 날아간다.
    // 불규칙한 clip-path로 잘라 '반듯하게 나뉜 사각형'이 아니라 깨진 파편으로 읽히게 한다.
    const PIECE_CLIPS = [
      'polygon(0% 0%, 58% 0%, 44% 52%, 0% 62%)',
      'polygon(58% 0%, 100% 0%, 100% 46%, 44% 52%)',
      'polygon(0% 62%, 44% 52%, 52% 100%, 0% 100%)',
      'polygon(44% 52%, 100% 46%, 100% 100%, 52% 100%)',
    ]
    const PIECE_DRIFT = [
      { x: -30, y: -22, r: -34 },
      { x: 32, y: -18, r: 30 },
      { x: -26, y: 30, r: 26 },
      { x: 30, y: 34, r: -28 },
    ]
    for (let i = 0; i < BOSS_CELL_PIECE_COUNT; i++) {
      const piece = document.createElement('i')
      piece.className = 'boss-cell-piece'
      const drift = PIECE_DRIFT[i % PIECE_DRIFT.length]
      piece.style.cssText = [
        `clip-path:${PIECE_CLIPS[i % PIECE_CLIPS.length]}`,
        `--piece-x:${drift.x}px`,
        `--piece-y:${drift.y}px`,
        `--piece-rot:${drift.r}deg`,
      ].join(';')
      host.appendChild(piece)
    }
    document.body.appendChild(host)
    // 파괴는 타격보다 큰 사건이라 버스트도 한 급 크게 간다.
    SquareBurst.playOn(rect, 'boss-wax-drip', { count: 22, spread: 150, duration: 620 })
    window.setTimeout(() => host.remove(), BOSS_CELL_BREAK_MS + 140)
    // 부위 파괴 추가 피해는 배율 피해가 뜬 직후 한 박자 늦게 같은 자리에 얹는다.
    if (breakDamage <= 0) return
    await new Promise<void>((resolve) => window.setTimeout(resolve, 180))
    await this.host.animateDamageNumberOnElement(cell.isConnected ? cell : rect, breakDamage)
  }

  /** 보스 보상 카드 클릭 시 일반 보물칸 처치 그라마를 그대로 재사용해 흔들+확대 사라짐.
   *  .is-consuming(공통 card-consume 키프레임) + boss-reward 전용 회전·blur를 한 비트
   *  더 얹는 .is-boss-reward-claimed 키프레임. SquareBurst는 treasure-gain 톤. */
  async playBossRewardClaimedConsume(cardId: string): Promise<void> {
    const tile = this.host.findCardElement(cardId)
    if (!tile) return
    SquareBurst.playOn(tile, 'treasure-gain', { count: 18, spread: 140, duration: 560 })
    tile.classList.add('is-boss-reward-claimed')
    await new Promise((r) => window.setTimeout(r, 520))
  }

  /** 함정 무시(도적/함정의 대가) 판정 성공 시 함정 카드를 잠깐 흔들고
   *  "무시" 글자를 플레이어 카드 위에 띄워 피해가 없음을 시각적으로 확인시킨다. */
  async playTrapIgnoreResist(trapCardId: string): Promise<void> {
    const trapTile = this.host.findCardElement(trapCardId)
    const playerCard = this.host.boardElement.querySelector<HTMLElement>('.player-card, .player-row')
    if (trapTile) {
      trapTile.classList.add('is-trap-ignored')
    }
    if (playerCard) {
      const rect = playerCard.getBoundingClientRect()
      void this.spawnFieldFloatText(rect.left + rect.width / 2, rect.top + rect.height * 0.3, '무시')
    }
    await new Promise((r) => window.setTimeout(r, 460))
    if (trapTile) trapTile.classList.remove('is-trap-ignored')
  }

  /** 보스가 굳음(밀랍 freeze) 상태일 때 가격을 시도하면 데미지 대신 "저항" 글자를
   *  데미지 부유 숫자와 같은 양식으로 띄우고, 카드가 살짝 발작하듯 떨린다.
   *  손패 freeze 효과가 보스에 정상 적용되었음을 명확히 보여주는 피드백. */
  async playBossFreezeResist(cardId: string): Promise<void> {
    const tile = this.host.findCardElement(cardId)
    if (!tile) return
    tile.classList.add('is-boss-resisting')
    const rect = tile.getBoundingClientRect()
    void this.spawnFieldFloatText(rect.left + rect.width / 2, rect.top + rect.height * 0.34, '저항')
    await new Promise((r) => window.setTimeout(r, 460))
    tile.classList.remove('is-boss-resisting')
  }

  /** 데미지 부유 숫자와 동일 톤으로 임의 텍스트를 띄운다(저항/면역 등 상태 피드백용). */
  spawnFieldFloatText(x: number, y: number, text: string): Promise<void> {
    const el = document.createElement('div')
    el.className = 'damage-float damage-float--text'
    el.textContent = text
    el.style.left = `${x}px`
    el.style.top = `${y}px`
    document.body.appendChild(el)
    const anim = el.animate(
      [
        { transform: 'translate(-50%, -20%) scale(0.78)', opacity: 0, filter: 'brightness(1.2)' },
        { transform: 'translate(-50%, -68%) scale(1.2)', opacity: 1, filter: 'brightness(1.65)', offset: 0.22 },
        { transform: 'translate(-50%, -110%) scale(1.08)', opacity: 1, filter: 'brightness(1.32)', offset: 0.65 },
        { transform: 'translate(-50%, -160%) scale(1)', opacity: 0, filter: 'brightness(1)' },
      ],
      { duration: 980, easing: 'cubic-bezier(0.16, 0.86, 0.28, 1)', fill: 'forwards' }
    )
    return new Promise((resolve) => {
      anim.onfinish = () => {
        el.remove()
        resolve()
      }
      window.setTimeout(() => { el.remove(); resolve() }, 1120)
    })
  }

  /** 보스 격파 시퀀스(공통): 짧은 흔들 → 사각 burst 연발 → 갈라짐 → 펑(큰 burst) →
   *  흐릿하게 확대되며 사라짐. 모든 burst는 기존 SquareBurst 그라마(damage/treasure-gain)
   *  를 그대로 사용해 일반 게임 톤과 통일된다. */
  /**
   * 보스 카드 최초 착지 연출: 위에서 낙하 → 바운스 → 바닥 충격 시 좌우 먼지 burst.
   * render() 직후 호출해 DOM에 타일이 있는 상태에서 진행한다.
   */
  async playBossLandingAnimation(cardId: string): Promise<void> {
    const tile = this.host.findCardElement(cardId)
    if (!tile) return
    // 착지 애니메이션 적용
    tile.classList.remove('is-boss-landing')
    void tile.offsetWidth  // reflow로 애니메이션 재시작
    tile.classList.add('is-boss-landing')
    // 55%(0.72s × 0.55 ≈ 396ms) 지점이 최초 착지 순간 → 먼지 burst 발사
    await new Promise((r) => window.setTimeout(r, 400))
    const rect = tile.getBoundingClientRect()
    const bottomY = rect.bottom - 4
    const centerX = rect.left + rect.width / 2
    // 좌우로 넓게 퍼지는 먼지 이펙트: 중앙 + 좌 + 우 세 포인트에서 폭발
    SquareBurst.playAt(centerX,       bottomY, 'damage',        { count: 22, spread: 220, duration: 560 })
    SquareBurst.playAt(centerX - 80, bottomY, 'bomb-blast',    { count: 14, spread: 140, duration: 480 })
    SquareBurst.playAt(centerX + 80, bottomY, 'bomb-blast',    { count: 14, spread: 140, duration: 480 })
    // 바운스가 완전히 끝날 때까지 대기
    await new Promise((r) => window.setTimeout(r, 340))
    tile.classList.remove('is-boss-landing')
  }
  /** 불씨 기사단장(60F) 등장 연출: 왼쪽 밖에서 오른쪽으로 천천히 날아와 중앙 3×3에 쿵 정착한다. */
  async playWaxKnightSwoopAnimation(cardId: string): Promise<void> {
    const tile = this.host.findCardElement(cardId)
    if (!tile) return
    const rail = this.host.boardElement.querySelector<HTMLElement>('.rail')
    tile.classList.remove('is-wax-knight-swooping')
    rail?.classList.remove('is-boss-quaking')
    void tile.offsetWidth  // CSS animation 재시작용 reflow
    tile.classList.add('is-wax-knight-swooping')

    // 느린 비행의 끝부분(약 70%)에 착지 임팩트를 몰아, 도착-쿵 beat가 분리되어 보이게 한다.
    await new Promise((r) => window.setTimeout(r, 880))
    const rect = tile.getBoundingClientRect()
    const centerY = rect.top + rect.height * 0.58
    const centerX = rect.left + rect.width / 2
    rail?.classList.add('is-boss-quaking')
    SquareBurst.playAt(centerX - 132, centerY, 'bomb-blast', { count: 18, spread: 150, duration: 620 })
    SquareBurst.playAt(centerX - 18,  centerY, 'damage',     { count: 32, spread: 240, duration: 720 })
    SquareBurst.playAt(centerX + 104, centerY, 'bomb-blast', { count: 18, spread: 150, duration: 620 })

    await new Promise((r) => window.setTimeout(r, 480))
    tile.classList.remove('is-wax-knight-swooping')
    rail?.classList.remove('is-boss-quaking')
  }
  /** 불씨 기사단장이 사용하는 보스 카드 효과를 한 박자짜리 사각 블라스트로 표시한다. */
  /** 불씨 기사단장 카드 발동 연출:
   *  보스 전용 손패(시련 톤 붉은 카드, 상단 촛농/양초/불씨 일러스트)가 보스 중앙에서
   *  커지듯 나타나 ~1.5초 잔류한 뒤, 팡 터지며 효과별 수치가 알맞은 HUD로 블라스트된다.
   *  - 방패 → 플레이어 방패 칩, 체력 → 플레이어 체력, 피해 → 플레이어 카드로 발사. */
  /** 보스 손패 콤보 공통 연출: 손패 N장을 중앙 정렬로 한 번에 펼친 뒤 중복 카드를 빛내고
   *  보너스 카드를 추가해 순차 해결한다. 100F 마녀(4장)와 60F 불씨 기사단장(2장)이 공유한다.
   *  목적지는 매 해결마다 살아 있는 보스 셀을 다시 찾아 이펙트가 엉뚱한 곳으로 날아가지 않는다. */
  async animateBossHandCombo(
    cardId: string,
    effects: ('shield' | 'heal' | 'strike')[],
    bonusEffects: ('shield' | 'heal' | 'strike')[],
    amount: number,
    onResolve: (effect: 'shield' | 'heal' | 'strike') => Promise<void>,
  ): Promise<void> {
    const tile = this.host.findCardElement(cardId)
    if (!tile) return

    const cells = Array.from(
      this.host.boardElement.querySelectorAll<HTMLElement>(`.cell.card[data-card-id="${cardId}"]`)
    ).filter((el) => el.offsetParent !== null)
    const rects = cells.map((c) => c.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0)
    const baseRect = rects.length > 0 ? rects[0] : tile.getBoundingClientRect()
    const bossX = rects.length > 0
      ? (Math.min(...rects.map((r) => r.left)) + Math.max(...rects.map((r) => r.right))) / 2
      : baseRect.left + baseRect.width / 2
    const bossY = rects.length > 0
      ? (Math.min(...rects.map((r) => r.top)) + Math.max(...rects.map((r) => r.bottom))) / 2
      : baseRect.top + baseRect.height / 2
    const metaFor = (effect: 'shield' | 'heal' | 'strike') => ({
      shield: { title: '밀랍 방패', desc: `방패 +${amount}`, label: `방패 +${amount}`, illust: spriteForHandCard('candle'),   burst: 'boss-candle-flame' as const, dest: 'boss-shield' as const },
      heal:   { title: '촛불 가호', desc: `체력 +${amount}`, label: `체력 +${amount}`, illust: spriteForHandCard('wax-drop'), burst: 'boss-wax-drip' as const,     dest: 'boss-health' as const },
      strike: { title: '불씨 일격', desc: `피해 ${amount}`,  label: `피해 ${amount}`,  illust: spriteForHandCard('ember'),    burst: 'boss-ember-spark' as const,  dest: 'player' as const },
    }[effect])
    const createCard = (effect: 'shield' | 'heal' | 'strike', index: number, bonus = false): HTMLElement => {
      const meta = metaFor(effect)
      const card = document.createElement('div')
      card.className = `boss-cast-card boss-cast-card--${effect} boss-witch-combo-card${bonus ? ' is-bonus' : ''}`
      card.dataset.effect = effect
      card.style.left = `${bossX}px`
      card.style.top = `${bossY}px`
      card.style.setProperty('--combo-index', String(index))
      card.innerHTML = `
        <span class="boss-cast-card-glow" aria-hidden="true"></span>
        <span class="boss-cast-card-illust" aria-hidden="true"><img src="${meta.illust}" alt="" /></span>
        <span class="boss-cast-card-title">${meta.title}</span>
        <span class="boss-cast-card-effect">${meta.desc}</span>
      `
      document.body.appendChild(card)
      return card
    }

    // 기본 손패를 같은 박자에 차라락 펼치되, index별 지연으로 좌→우 리듬을 만든다.
    // 카드 장수에 맞춰 중앙 정렬한다(4장이면 ±1.5, 2장이면 ±0.5로 좌우 대칭).
    const centerOffset = (effects.length - 1) / 2
    const cards = effects.map((effect, index) => createCard(effect, index))
    await Promise.all(cards.map((card, index) => card.animate(
      [
        { transform: 'translate(-50%, -50%) scale(0.18) rotate(-7deg)', opacity: 0, filter: 'brightness(1.8)' },
        { transform: `translate(calc(-50% + ${(index - centerOffset) * 118}px), -50%) scale(1.08) rotate(${(index - centerOffset) * 2}deg)`, opacity: 1, filter: 'brightness(1.18)', offset: 0.76 },
        { transform: `translate(calc(-50% + ${(index - centerOffset) * 118}px), -50%) scale(1) rotate(${(index - centerOffset) * 1.2}deg)`, opacity: 1, filter: 'brightness(1)' },
      ],
      { duration: 360, delay: index * 70, easing: 'cubic-bezier(0.18, 0.86, 0.24, 1.18)', fill: 'forwards' }
    ).finished))

    const duplicated = new Set(bonusEffects)
    if (duplicated.size > 0) {
      cards.forEach((card) => {
        if (duplicated.has(card.dataset.effect as 'shield' | 'heal' | 'strike')) card.classList.add('is-duplicate')
      })
      await new Promise((r) => window.setTimeout(r, 420))
    }

    // 중복 효과가 있으면 오른쪽 끝에 5번째 이후 추가 카드를 띵! 하고 꽂는다.
    const bonusCards = bonusEffects.map((effect, bonusIndex) => createCard(effect, effects.length + bonusIndex, true))
    await Promise.all(bonusCards.map((card, bonusIndex) => card.animate(
      [
        { transform: 'translate(calc(-50% + 244px), -50%) scale(0.25) rotate(7deg)', opacity: 0, filter: 'brightness(2.2)' },
        { transform: `translate(calc(-50% + ${244 + bonusIndex * 82}px), -50%) scale(1.16) rotate(4deg)`, opacity: 1, filter: 'brightness(1.7)', offset: 0.62 },
        { transform: `translate(calc(-50% + ${244 + bonusIndex * 82}px), -50%) scale(1) rotate(2deg)`, opacity: 1, filter: 'brightness(1)' },
      ],
      { duration: 320, delay: bonusIndex * 80, easing: 'cubic-bezier(0.18, 0.86, 0.24, 1.22)', fill: 'forwards' }
    ).finished))

    const sequence = [...cards, ...bonusCards]
    for (const card of sequence) {
      const effect = card.dataset.effect as 'shield' | 'heal' | 'strike'
      const meta = metaFor(effect)
      card.classList.add('is-resolving')
      await onResolve(effect)
      const cardRect = card.getBoundingClientRect()
      const originX = cardRect.left + cardRect.width / 2
      const originY = cardRect.top + cardRect.height / 2
      // onResolve가 보드를 다시 렌더해 캡처해 둔 tile이 떨어져 나갔을 수 있다.
      // 방패/체력 목적지는 매번 살아 있는 보스 셀을 다시 찾아 좌표가 화면 밖/0,0으로 새는 걸 막는다.
      const liveTile = this.host.findCardElement(cardId) ?? tile
      const destEl =
        meta.dest === 'player'
          ? this.host.boardElement.querySelector<HTMLElement>('.player-card')
          : meta.dest === 'boss-shield'
            ? (liveTile.querySelector<HTMLElement>('.boss-face-shield-chip') ?? liveTile.querySelector<HTMLElement>('.boss-face-hp-column'))
            : (liveTile.querySelector<HTMLElement>('.boss-face-hpbar') ?? liveTile.querySelector<HTMLElement>('.boss-face-hp-column'))
      SquareBurst.playAt(originX, originY, meta.burst, { count: effect === 'strike' ? 24 : 18, spread: 180, duration: 520 })
      void this.spawnFieldFloatText(originX, originY - 24, meta.label)
      liveTile.classList.add('is-wax-knight-casting')
      // 카드별 사용 템포를 더 빠르게 — 트레일 입자 수와 퇴장/간격을 줄여 하나씩 처리되는 답답함을 줄인다.
      if (destEl) await this.host.trails.animateResourceTrail(new DOMRect(originX - 10, originY - 10, 20, 20), destEl, effect === 'strike' ? 4 : 3, meta.burst)
      liveTile.classList.remove('is-wax-knight-casting')
      await card.animate(
        [
          { transform: getComputedStyle(card).transform === 'none' ? 'translate(-50%, -50%) scale(1)' : getComputedStyle(card).transform, opacity: 1, filter: 'brightness(1.4)' },
          { transform: 'translate(-50%, -50%) scale(0.38) rotate(5deg)', opacity: 0, filter: 'brightness(2.4)' },
        ],
        { duration: 150, easing: 'cubic-bezier(0.5, 0, 0.6, 1)', fill: 'forwards' }
      ).finished
      card.remove()
      if (effect === 'strike') await new Promise((r) => window.setTimeout(r, 30))
    }
  }

  /** 밀랍 조각사(2×3) 등장 연출.
   *  6칸 동시 투명→확대→쿵 착지. 착지 순간 중심 블라스트. */
  async playWaxSculptorAppearAnimation(cardId: string): Promise<void> {
    const allFaces = Array.from(
      document.querySelectorAll<HTMLElement>(
        `.rail-row.dist-0 .cell[data-card-id="${cardId}"] .boss-face,
         .rail-row.dist-1 .cell[data-card-id="${cardId}"] .boss-face`
      )
    )
    if (allFaces.length === 0) return

    // 6칸 동시 등장 애니메이션 시작
    allFaces.forEach((face) => face.classList.add('is-wax-sculptor-entering'))

    // 55%=308ms 지점이 최대 확대(peak), 80%=448ms 지점이 쿵 착지
    // 블라스트는 착지 순간(448ms)에 맞춰 발사한다
    await new Promise((r) => window.setTimeout(r, 448))

    // 착지 순간 가시 face(display:none인 행은 제외)의 중심 기준 블라스트
    const rects = allFaces
      .map((f) => f.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.height > 0)
    if (rects.length === 0) return
    const cx = (Math.min(...rects.map((r) => r.left)) + Math.max(...rects.map((r) => r.right))) / 2
    const cy = (Math.min(...rects.map((r) => r.top))  + Math.max(...rects.map((r) => r.bottom))) / 2
    SquareBurst.playAt(cx, cy, 'damage', { count: 32, spread: 260, duration: 580 })

    // 나머지 애니메이션(80%→100% = 108ms) 완료 후 클래스 정리
    await new Promise((r) => window.setTimeout(r, 160))
    allFaces.forEach((face) => face.classList.remove('is-wax-sculptor-entering'))
    await new Promise((r) => window.setTimeout(r, 180))
  }

  /** 밀랍 조각사 전방 복귀 연출: 위에서 쿵 떨어지듯 착지 → 기절하듯 사각 블라스트. */
  async playSculptorReturnAnimation(cardId: string): Promise<void> {
    const faces = Array.from(
      this.host.boardElement.querySelectorAll<HTMLElement>(
        `.cell.card[data-card-id="${cardId}"] .boss-face`
      )
    )
    if (faces.length === 0) return
    faces.forEach((f) => {
      f.classList.remove('is-wax-sculptor-returning')
      void f.offsetWidth  // reflow로 재시작
      f.classList.add('is-wax-sculptor-returning')
    })
    // 쿵 착지(85% ≈ 408ms) 시점에 맞춰 블라스트
    await new Promise((r) => window.setTimeout(r, 408))
    const rects = faces
      .map((f) => f.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.height > 0)
    if (rects.length > 0) {
      const cx = (Math.min(...rects.map((r) => r.left)) + Math.max(...rects.map((r) => r.right))) / 2
      const cy = (Math.min(...rects.map((r) => r.top))  + Math.max(...rects.map((r) => r.bottom))) / 2
      // 중앙 강타 + 좌우로 튀는 기절 톤 사각 블라스트
      SquareBurst.playAt(cx,       cy, 'damage',     { count: 28, spread: 240, duration: 560 })
      SquareBurst.playAt(cx - 90,  cy, 'bomb-blast', { count: 14, spread: 150, duration: 480 })
      SquareBurst.playAt(cx + 90,  cy, 'bomb-blast', { count: 14, spread: 150, duration: 480 })
    }
    await new Promise((r) => window.setTimeout(r, 200))
    faces.forEach((f) => f.classList.remove('is-wax-sculptor-returning'))
  }

  /** 조각사 소환 연출 — 좌→우 순서로 각 적이 작은 상태에서 확대되며 격렬하게 흔들려 들어온다.
   *  enemyIds는 레인 0→1→2 순서로 전달한다. */
  async animateSculptorSummonEnemies(enemyIds: string[]): Promise<void> {
    const STAGGER = 160  // 레인 간 지연 ms
    const animations: Promise<void>[] = []

    for (let i = 0; i < enemyIds.length; i++) {
      const delay = i * STAGGER
      const id = enemyIds[i]
      animations.push(
        new Promise<void>((resolve) => {
          window.setTimeout(() => {
            const el = this.host.boardElement.querySelector<HTMLElement>(
              `.cell.card[data-card-id="${id}"]`
            )
            if (!el) { resolve(); return }
            // 소환 시 사각 버스트 (작은 폭발 톤)
            SquareBurst.playOn(el, 'damage', { count: 12, spread: 100, duration: 480 })
            el.classList.add('is-sculptor-summoning')
            window.setTimeout(() => {
              el.classList.remove('is-sculptor-summoning')
              resolve()
            }, 620)
          }, delay)
        })
      )
    }
    await Promise.all(animations)
    // 마지막 카드 애니메이션이 끝난 후 짧은 여운
    await new Promise((r) => window.setTimeout(r, 120))
  }

  /** 후방 페이즈 조각사 공격 전용 연출 — 들어올려짐 → 돌진 → 쾅 착지 → 복귀.
   *  일반 animateEnemyAttacks보다 dy 범위가 크고 위로 들어올리는 프리임이 추가된다. */
  async animateSculptorBackAttack(cardId: string): Promise<void> {
    const element = this.host.findCardElement(cardId)
    if (!element) return
    const player = this.host.boardElement.querySelector<HTMLElement>('.player-card, .player-row')
    if (!player) return
    const rect = element.getBoundingClientRect()
    const playerRect = player.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return

    const dx = (playerRect.left + playerRect.width / 2 - (rect.left + rect.width / 2)) * 0.30
    // 조각사 상단 → 플레이어 상단까지 전체 거리 (캡 없음 — 실제 이동량)
    const dy = playerRect.top - rect.top + 24

    const clone = element.cloneNode(true) as HTMLElement
    element.classList.add('is-enemy-slamming-source')
    clone.classList.add('enemy-attack-clone')
    clone.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;margin:0;z-index:250;pointer-events:none;transform-origin:50% 100%`
    document.body.appendChild(clone)

    const animation = clone.animate(
      [
        // 현재 위치
        { transform: 'translate(0,0) scale(1,1)',                                        filter: 'brightness(1)',                                                               offset: 0    },
        // 위로 들어올려짐 — 대기라인 이탈 느낌
        { transform: 'translate(0,-38px) scale(1.09,0.93)',                              filter: 'brightness(1.45) drop-shadow(0 -14px 20px rgba(220,110,50,0.65))',            offset: 0.17 },
        // 돌진 중간
        { transform: `translate(${dx*0.52}px,${dy*0.52}px) scale(1.15,0.85)`,           filter: 'brightness(1.7) drop-shadow(0 32px 40px rgba(200,48,48,0.82))',               offset: 0.50 },
        // 쾅 착지
        { transform: `translate(${dx}px,${dy}px) scale(1.26,0.70)`,                     filter: 'brightness(1.9) drop-shadow(0 44px 52px rgba(224,24,24,0.96))',               offset: 0.61 },
        // 반동
        { transform: `translate(${dx*0.07}px,${dy*0.03}px) scale(0.97,1.05)`,           filter: 'brightness(1.06)',                                                            offset: 0.82 },
        { transform: 'translate(0,0) scale(1,1)',                                        filter: 'brightness(1)',                                                               offset: 1    },
      ],
      { duration: 760, easing: 'cubic-bezier(0.18, 0.96, 0.22, 1)', fill: 'forwards' }
    )

    return new Promise<void>((resolve) => {
      animation.onfinish = () => { clone.remove(); element.classList.remove('is-enemy-slamming-source'); resolve() }
      window.setTimeout(() => { clone.remove(); element.classList.remove('is-enemy-slamming-source'); resolve() }, 940)
    })
  }

  async playBossDefeatSequence(cardId: string): Promise<void> {
    const tile = this.host.findCardElement(cardId)
    if (!tile) return
    // 확대 폭발이 레일/스테이지 밖으로 번져도 잘리지 않도록 상위 클리핑을 잠시 푼다.
    this.host.boardElement.classList.add('is-boss-finale')
    tile.classList.add('is-boss-defeating')

    // beat 1: 흔들 + 작은 burst 두 번 — 일반 enemy hit burst('damage') 톤.
    SquareBurst.playOn(tile, 'damage', { count: 16, spread: 140, duration: 520 })
    await new Promise((r) => window.setTimeout(r, 220))
    SquareBurst.playOn(tile, 'damage', { count: 18, spread: 160, duration: 520 })
    await new Promise((r) => window.setTimeout(r, 240))

    // beat 2: 3~5줄 랜덤 균열선 삽입 + 갈라짐 클래스 + burst.
    const lineCount = 3 + Math.floor(Math.random() * 3)
    for (let i = 0; i < lineCount; i++) {
      const line = document.createElement('div')
      // 대각선 방향 유지: 50~130도 기반, 50% 확률로 방향 반전, ±10 jitter
      const base = 50 + Math.random() * 80
      const angle = (Math.random() < 0.5 ? 1 : -1) * base
      const pos = 12 + Math.random() * 76        // 카드 전체에 분산 (12~88%)
      const w = 1.1 + Math.random() * 1.1        // 선 굵기 1.1~2.2%
      const alpha = (0.82 + Math.random() * 0.15).toFixed(2)
      line.className = 'boss-crack-line'
      line.style.background = [
        `linear-gradient(${angle.toFixed(1)}deg,`,
        `transparent ${(pos - w).toFixed(1)}%,`,
        `rgba(255,224,168,${alpha}) ${(pos - w * 0.3).toFixed(1)}%,`,
        `rgba(255,204,120,${alpha}) ${(pos + w * 0.3).toFixed(1)}%,`,
        `transparent ${(pos + w).toFixed(1)}%)`,
      ].join(' ')
      line.style.animationDelay = `${Math.round(Math.random() * 110)}ms`
      tile.appendChild(line)
    }
    tile.classList.add('is-boss-cracking')
    SquareBurst.playOn(tile, 'treasure-gain', { count: 22, spread: 180, duration: 560 })
    await new Promise((r) => window.setTimeout(r, 360))

    // beat 3: 펑 — 큰 burst + 흐릿 확대 사라짐(.is-boss-blown).
    SquareBurst.playOn(tile, 'treasure-gain', { count: 32, spread: 230, duration: 760 })
    tile.classList.add('is-boss-blown')
    await new Promise((r) => window.setTimeout(r, 640))
    // 격파 연출 종료 — 상위 컨테이너 클리핑을 원복한다.
    this.host.boardElement.classList.remove('is-boss-finale')
  }

  /** 검은 양초 악마 공격 주기: 1~3장의 검은 양초 보스 손패를 순차 발동한다.
   *  각 카드에 실시간 누적 피해(startingCounter+1, +2, ...) 를 표시하고, onEachCandle 콜백으로 효과를 적용한다. */
  async animateDemonCandleTurn(
    cardId: string,
    count: number,
    startingCounter: number,
    onEachCandle: (index: number) => Promise<void>,
  ): Promise<void> {
    const tile = this.host.findCardElement(cardId)
    if (!tile) return

    const cells = Array.from(
      this.host.boardElement.querySelectorAll<HTMLElement>(`.cell.card[data-card-id="${cardId}"]`)
    ).filter((el) => el.offsetParent !== null)
    const rects = cells.map((c) => c.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0)
    const baseRect = rects.length > 0 ? rects[0] : tile.getBoundingClientRect()
    const bossX = rects.length > 0
      ? (Math.min(...rects.map((r) => r.left)) + Math.max(...rects.map((r) => r.right))) / 2
      : baseRect.left + baseRect.width / 2
    const bossY = rects.length > 0
      ? (Math.min(...rects.map((r) => r.top)) + Math.max(...rects.map((r) => r.bottom))) / 2
      : baseRect.top + baseRect.height / 2

    const centerOffset = (count - 1) / 2
    const createCandleCard = (index: number, counter: number): HTMLElement => {
      const card = document.createElement('div')
      card.className = 'boss-cast-card boss-cast-card--demon-candle'
      card.style.left = `${bossX}px`
      card.style.top = `${bossY}px`
      card.style.setProperty('--combo-index', String(index))
      card.innerHTML = `
        <span class="boss-cast-card-glow" aria-hidden="true"></span>
        <span class="boss-cast-card-illust" aria-hidden="true"><img src="${spriteForHandCard('black-candle')}" alt="" /></span>
        <span class="boss-cast-card-title">검은 양초</span>
        <span class="boss-cast-card-effect">피해 ${counter}</span>
      `
      document.body.appendChild(card)
      return card
    }

    // 전체 카드를 미리 펼쳐 예고한 뒤 순차 발동한다.
    const cards = Array.from({ length: count }, (_, i) => createCandleCard(i, startingCounter + i + 1))
    await Promise.all(cards.map((card, index) => card.animate(
      [
        { transform: 'translate(-50%, -50%) scale(0.18) rotate(-7deg)', opacity: 0, filter: 'brightness(1.8)' },
        { transform: `translate(calc(-50% + ${(index - centerOffset) * 118}px), -50%) scale(1.08) rotate(${(index - centerOffset) * 2}deg)`, opacity: 1, filter: 'brightness(1.18)', offset: 0.76 },
        { transform: `translate(calc(-50% + ${(index - centerOffset) * 118}px), -50%) scale(1) rotate(${(index - centerOffset) * 1.2}deg)`, opacity: 1, filter: 'brightness(1)' },
      ],
      { duration: 360, delay: index * 70, easing: 'cubic-bezier(0.18, 0.86, 0.24, 1.18)', fill: 'forwards' }
    ).finished))

    for (let i = 0; i < count; i++) {
      const card = cards[i]
      card.classList.add('is-resolving')
      await onEachCandle(i)
      const counter = startingCounter + i + 1
      const cardRect = card.getBoundingClientRect()
      const originX = cardRect.left + cardRect.width / 2
      const originY = cardRect.top + cardRect.height / 2
      SquareBurst.playAt(originX, originY, 'demon-vortex', { count: 20, spread: 160, duration: 480 })
      void this.spawnFieldFloatText(originX, originY - 24, `피해 ${counter}`)
      const playerEl = this.host.boardElement.querySelector<HTMLElement>('.player-card')
      if (playerEl) await this.host.trails.animateResourceTrail(new DOMRect(originX - 10, originY - 10, 20, 20), playerEl, 4, 'demon-vortex')
      await card.animate(
        [
          { opacity: 1, filter: 'brightness(1.4)' },
          { opacity: 0, transform: 'translate(-50%, -50%) scale(0.38) rotate(5deg)', filter: 'brightness(2.4)' },
        ],
        { duration: 150, easing: 'cubic-bezier(0.5, 0, 0.6, 1)', fill: 'forwards' }
      ).finished
      card.remove()
    }
  }

  /** 거짓과 진실: 단일 크고 보라빛 카드를 펼쳐 isTrue 여부를 보여주고 applyEffect 콜백으로 게임 로직을 적용한다. */
  async animateDemonTruthLie(
    cardId: string,
    isTrue: boolean,
    onResolve: () => Promise<void>,
  ): Promise<void> {
    const tile = this.host.findCardElement(cardId)
    if (!tile) return

    const cells = Array.from(
      this.host.boardElement.querySelectorAll<HTMLElement>(`.cell.card[data-card-id="${cardId}"]`)
    ).filter((el) => el.offsetParent !== null)
    const rects = cells.map((c) => c.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0)
    const baseRect = rects.length > 0 ? rects[0] : tile.getBoundingClientRect()
    const bossX = rects.length > 0
      ? (Math.min(...rects.map((r) => r.left)) + Math.max(...rects.map((r) => r.right))) / 2
      : baseRect.left + baseRect.width / 2
    const bossY = rects.length > 0
      ? (Math.min(...rects.map((r) => r.top)) + Math.max(...rects.map((r) => r.bottom))) / 2
      : baseRect.top + baseRect.height / 2

    const card = document.createElement('div')
    card.className = `boss-cast-card demon-truth-lie-card boss-cast-card--${isTrue ? 'truth' : 'lie'}`
    card.style.left = `${bossX}px`
    card.style.top = `${bossY}px`
    card.innerHTML = `
      <span class="boss-cast-card-glow" aria-hidden="true"></span>
      <span class="boss-cast-card-illust demon-truth-lie-illust" aria-hidden="true">
        <span class="demon-truth-lie-symbol">${isTrue ? '眞' : '假'}</span>
      </span>
      <span class="boss-cast-card-title">거짓과 진실</span>
      <span class="boss-cast-card-effect">${isTrue ? '진실' : '거짓'}</span>
    `
    document.body.appendChild(card)

    await card.animate(
      [
        { transform: 'translate(-50%, -50%) scale(0.18) rotate(-7deg)', opacity: 0, filter: 'brightness(1.8)' },
        { transform: 'translate(-50%, -50%) scale(1.12) rotate(0deg)', opacity: 1, filter: 'brightness(1.3)', offset: 0.7 },
        { transform: 'translate(-50%, -50%) scale(1) rotate(0deg)', opacity: 1, filter: 'brightness(1)' },
      ],
      { duration: 520, easing: 'cubic-bezier(0.18, 0.86, 0.24, 1.18)', fill: 'forwards' }
    ).finished
    await new Promise((r) => window.setTimeout(r, 600))

    card.classList.add('is-resolving')
    await onResolve()

    const cardRect = card.getBoundingClientRect()
    const originX = cardRect.left + cardRect.width / 2
    const originY = cardRect.top + cardRect.height / 2
    SquareBurst.playAt(originX, originY, 'demon-vortex', { count: 28, spread: 200, duration: 600 })
    const liveTile = this.host.findCardElement(cardId) ?? tile
    if (isTrue) {
      void this.spawnFieldFloatText(originX, originY - 24, '진실 — 체력+10 공격+1')
      const atkEl = liveTile.querySelector<HTMLElement>('.boss-face-atk') ?? liveTile
      await this.host.trails.animateResourceTrail(new DOMRect(originX - 10, originY - 10, 20, 20), atkEl, 6, 'demon-vortex')
    } else {
      void this.spawnFieldFloatText(originX, originY - 24, '거짓 — 손패 파괴')
    }

    await card.animate(
      [
        { opacity: 1, filter: 'brightness(1.4)' },
        { opacity: 0, transform: 'translate(-50%, -50%) scale(0.38) rotate(5deg)', filter: 'brightness(2.4)' },
      ],
      { duration: 200, easing: 'cubic-bezier(0.5, 0, 0.6, 1)', fill: 'forwards' }
    ).finished
    card.remove()
  }

  /** 검은 양초 악마 격파 시 보라빛 균열 소용돌이 소멸 연출. */
  async playDemonDefeatSequence(cardId: string): Promise<void> {
    const tile = this.host.findCardElement(cardId)
    if (!tile) return
    this.host.boardElement.classList.add('is-boss-finale')
    tile.classList.add('is-boss-defeating')
    tile.classList.add('is-demon-dying')

    SquareBurst.playOn(tile, 'demon-vortex', { count: 20, spread: 160, duration: 560 })
    await new Promise((r) => window.setTimeout(r, 280))
    SquareBurst.playOn(tile, 'demon-vortex', { count: 24, spread: 200, duration: 560 })
    await new Promise((r) => window.setTimeout(r, 300))

    // 보라빛 균열선 삽입
    const cells = this.collectVisibleBossCells(cardId)
    for (const cell of cells) {
      for (let i = 0; i < 4; i++) {
        const line = document.createElement('div')
        const base = 40 + Math.random() * 100
        const angle = (Math.random() < 0.5 ? 1 : -1) * base
        const pos = 12 + Math.random() * 76
        const w = 1.1 + Math.random() * 1.1
        const alpha = (0.82 + Math.random() * 0.15).toFixed(2)
        line.className = 'boss-crack-line demon-crack-line'
        line.style.background = [
          `linear-gradient(${angle.toFixed(1)}deg,`,
          `transparent ${(pos - w).toFixed(1)}%,`,
          `rgba(180,80,240,${alpha}) ${(pos - w * 0.3).toFixed(1)}%,`,
          `rgba(140,40,200,${alpha}) ${(pos + w * 0.3).toFixed(1)}%,`,
          `transparent ${(pos + w).toFixed(1)}%)`,
        ].join(' ')
        line.style.animationDelay = `${Math.round(Math.random() * 110)}ms`
        cell.appendChild(line)
      }
      cell.classList.add('is-boss-cracking')
    }
    SquareBurst.playOn(tile, 'demon-vortex', { count: 30, spread: 220, duration: 640 })
    await new Promise((r) => window.setTimeout(r, 400))

    SquareBurst.playOn(tile, 'demon-vortex', { count: 40, spread: 280, duration: 800 })
    tile.classList.add('is-boss-blown')
    await new Promise((r) => window.setTimeout(r, 700))
    this.host.boardElement.classList.remove('is-boss-finale')
  }

  /** 100F 마녀 격파 직전 컷신의 보스 칸 전부를 모으는 헬퍼. 3×3 보스라 보이는 셀이 여러 장이다. */
  private collectVisibleBossCells(cardId: string): HTMLElement[] {
    return Array.from(
      this.host.boardElement.querySelectorAll<HTMLElement>(`.cell.card[data-card-id="${cardId}"]`)
    ).filter((el) => el.offsetParent !== null)
  }

  /** 격파 직전 빛의 선 한 줄을 보스 칸에 그린다. beat가 커질수록 더 밝고 가는 빛이 늘어난다. */
  private drawWitchLightLine(cell: HTMLElement): void {
    const line = document.createElement('div')
    const base = 40 + Math.random() * 100
    const angle = (Math.random() < 0.5 ? 1 : -1) * base
    const pos = 8 + Math.random() * 84            // 칸 전체에 분산
    const w = 0.5 + Math.random() * 0.9           // 가는 빛줄기
    line.className = 'witch-light-line'
    line.style.background = [
      `linear-gradient(${angle.toFixed(1)}deg,`,
      `transparent ${(pos - w).toFixed(1)}%,`,
      `rgba(255,250,232,0.96) ${pos.toFixed(1)}%,`,
      `transparent ${(pos + w).toFixed(1)}%)`,
    ].join(' ')
    line.style.animationDelay = `${Math.round(Math.random() * 130)}ms`
    cell.appendChild(line)
  }

  /** 마녀 격파 직전 한 마디: 빛의 선 묶음을 긋고, 미세 떨림과 칸 확대를 건다. */
  async playWaxWitchDeathBeat(cardId: string, beat: number): Promise<void> {
    const cells = this.collectVisibleBossCells(cardId)
    if (cells.length === 0) return
    // 컷신 확대도 레일/스테이지 밖으로 번질 수 있게 클리핑을 푼다(폭발 시퀀스 종료 시 원복).
    this.host.boardElement.classList.add('is-boss-finale')
    const scale = (1 + beat * 0.05).toFixed(3)
    for (const cell of cells) {
      for (let i = 0; i < beat + 1; i++) this.drawWitchLightLine(cell)
      cell.classList.add('is-witch-dying')
      cell.style.setProperty('--witch-death-scale', scale)
      // 떨림은 매 마디 1회 재시작(클래스 토글 + reflow).
      cell.classList.remove('is-witch-trembling')
      void cell.offsetWidth
      cell.classList.add('is-witch-trembling')
    }
    // 빛줄기가 번지는 만큼만 짧게 기다리고 반환 — 떨림/확대는 대사가 뜬 동안 이어진다.
    await new Promise((r) => window.setTimeout(r, 320))
  }

  /** 마지막 마디: 빛의 선이 마구 그어진다. 직후 호출되는 폭발 시퀀스로 자연스럽게 넘어간다. */
  async playWaxWitchDeathFrenzy(cardId: string): Promise<void> {
    const cells = this.collectVisibleBossCells(cardId)
    if (cells.length === 0) return
    for (const cell of cells) {
      cell.classList.add('is-witch-dying')
      cell.style.setProperty('--witch-death-scale', '1.2')
      cell.classList.add('is-witch-frenzy')
    }
    // 빛의 선을 짧은 간격으로 연달아 긋는다.
    for (let burst = 0; burst < 5; burst++) {
      for (const cell of cells) {
        this.drawWitchLightLine(cell)
        this.drawWitchLightLine(cell)
      }
      await new Promise((r) => window.setTimeout(r, 90))
    }
    await new Promise((r) => window.setTimeout(r, 160))
    // 폭발 시퀀스가 transform을 다시 잡도록 확대/떨림 잔여 클래스를 정리한다.
    for (const cell of cells) {
      cell.classList.remove('is-witch-trembling', 'is-witch-frenzy', 'is-witch-dying')
      cell.style.removeProperty('--witch-death-scale')
    }
  }

  /** Boss-origin blast that burns a specific hand slot before the model re-renders it away. */
  async animateBossBlastToHandSlot(cardId: string, slotIndex: number, theme: BurstTheme): Promise<void> {
    const boss = this.host.findCardElement(cardId)
    const slot = this.host.findHandSlotElement(slotIndex)
    if (!boss || !slot) return
    await this.host.trails.animateResourceTrail(boss, slot, 3, theme)
    SquareBurst.playOn(slot, theme, { count: 18, spread: 125, duration: 520 })
    // 즉시 사라지지 않고 잿불에 닿은 듯 흔들→회색→검게 타오르며 사라진다.
    await slot.animate(
      [
        { transform: 'translateX(0) rotate(0deg) scale(1)', opacity: 1, filter: 'brightness(1) saturate(1) grayscale(0)' },
        { transform: 'translateX(-3px) rotate(-2deg) scale(1.01)', opacity: 1, filter: 'brightness(0.96) saturate(0.4) grayscale(0.6)', offset: 0.2 },
        { transform: 'translateX(3px) rotate(2deg) scale(1)', opacity: 1, filter: 'brightness(0.72) saturate(0) grayscale(1)', offset: 0.42 },
        { transform: 'translateX(-2px) rotate(-1.4deg) scale(0.97)', opacity: 0.92, filter: 'brightness(0.42) saturate(0) grayscale(1)', offset: 0.64 },
        { transform: 'translateX(0) rotate(0deg) scale(0.9)', opacity: 0, filter: 'brightness(0.06) saturate(0) grayscale(1) blur(2px)' },
      ],
      { duration: 620, easing: 'cubic-bezier(0.3, 0.1, 0.35, 1)', fill: 'forwards' }
    ).finished
  }

  /** 양초 고양이 손패 강탈 — 마녀 소각(animateBossBlastToHandSlot)을 참고하되 태우지 않고,
   *  발톱 스파크 블라스트 후 손패가 고양이 쪽으로 낚아채여 회전·축소·소멸하는 '뺏김' 연출. */
  async animateBossStealHandSlot(cardId: string, slotIndex: number): Promise<void> {
    const boss = this.host.findCardElement(cardId)
    const slot = this.host.findHandSlotElement(slotIndex)
    if (!slot) return
    // 발톱 스파크(마녀 소각과 같은 boss-ember-spark 테마)로 강탈 순간을 강조한다.
    SquareBurst.playOn(slot, 'boss-ember-spark', { count: 16, spread: 112, duration: 460 })
    // 보스 위치가 잡히면 손패를 그 방향으로 빨아들이고, 없으면 위로 낚아채 올린다.
    const sr = slot.getBoundingClientRect()
    const br = boss?.getBoundingClientRect()
    const dx = br ? (br.left + br.width / 2) - (sr.left + sr.width / 2) : 0
    const dy = br ? (br.top + br.height / 2) - (sr.top + sr.height / 2) : -sr.height * 2.2
    await slot.animate(
      [
        { transform: 'translate(0,0) rotate(0deg) scale(1)', opacity: 1, filter: 'brightness(1)' },
        { transform: `translate(${(dx * 0.26).toFixed(1)}px, ${(dy * 0.26).toFixed(1)}px) rotate(-11deg) scale(1.05)`, opacity: 1, filter: 'brightness(1.15)', offset: 0.24 },
        { transform: `translate(${(dx * 0.7).toFixed(1)}px, ${(dy * 0.7).toFixed(1)}px) rotate(20deg) scale(0.58)`, opacity: 0.72, filter: 'brightness(0.9)', offset: 0.7 },
        { transform: `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) rotate(36deg) scale(0.16)`, opacity: 0, filter: 'brightness(0.5)' },
      ],
      { duration: 560, easing: 'cubic-bezier(0.4, 0.05, 0.5, 1)', fill: 'forwards' }
    ).finished
  }

  /** 이벤트 불태우기: 지정 손패 슬롯을 흔들→회색화→위로 떠오르며 사라지는 소각 연출. */
  async animateHandCardBurn(slotIndex: number): Promise<void> {
    const slot = this.host.findHandSlotElement(slotIndex)
    if (!slot) return
    SquareBurst.playOn(slot, 'damage', { count: 12, spread: 72, duration: 380 })
    await new Promise<void>((r) => window.setTimeout(r, 55))
    await slot.animate(
      [
        { transform: 'translateX(0) translateY(0) scale(1)',       opacity: 1,    filter: 'brightness(1)    saturate(1)    grayscale(0)' },
        { transform: 'translateX(-4px) translateY(-3px) scale(1.02)', opacity: 1, filter: 'brightness(1.08) saturate(0.55) grayscale(0.32)', offset: 0.14 },
        { transform: 'translateX(4px)  translateY(-6px) scale(1.01)', opacity: 0.96, filter: 'brightness(0.88) saturate(0.2)  grayscale(0.72)', offset: 0.30 },
        { transform: 'translateX(-3px) translateY(-11px) scale(0.97)', opacity: 0.80, filter: 'brightness(0.58) saturate(0)   grayscale(1)',    offset: 0.50 },
        { transform: 'translateX(2px)  translateY(-18px) scale(0.93)', opacity: 0.50, filter: 'brightness(0.32) saturate(0)   grayscale(1)',    offset: 0.70 },
        { transform: 'translateX(0)    translateY(-28px) scale(0.85)', opacity: 0,    filter: 'brightness(0.06) saturate(0)  grayscale(1) blur(3px)' },
      ],
      { duration: 760, easing: 'cubic-bezier(0.28, 0.1, 0.32, 1)', fill: 'forwards' }
    ).finished
  }

  /**
   * 30F 양초 백작의 탐욕 살포 — **두 박자**로 나눠 보여 준다.
   *
   *  1) 보스가 동전을 화면 가득 흩뿌리고, 동전이 흩어진 채로 잠깐 머문다.
   *  2) 그 동전이 하나씩 짤랑이며 손패 슬롯으로 빨려 들어간다.
   *
   * 한 박자로 붙여 두면 "뿌리면서 동시에 때린다"로 읽혀 무슨 일이 일어났는지 안 남는다.
   * 뒤이어 오는 타격은 호출부가 또 한 박자 띄우고 낸다(BossEvent.resolveWaxArmyGreedTurn).
   */
  async animateBossScatterToHandSlots(cardId: string, slotIndices: number[]): Promise<void> {
    const boss = this.host.findCardElement(cardId)
    if (!boss || slotIndices.length === 0) return
    const bossRect = boss.getBoundingClientRect()
    const ox = bossRect.left + bossRect.width / 2
    const oy = bossRect.top + bossRect.height * 0.62
    // 분수처럼 솟구치는 황금빛 폭죽 블라스트.
    SquareBurst.playOn(boss, 'treasure-gain', { count: 30, spread: 200, duration: 640, size: [8, 18] })

    // 1) 흩뿌리기 — 손패로 갈 동전마다 하나씩, 여기에 굴러 사라질 여분을 섞어 '살포'로 만든다.
    const stage = this.host.boardElement.getBoundingClientRect()
    const coins = Array.from(
      { length: slotIndices.length + BOSS_GREED_STRAY_COINS },
      () => this.spawnGreedCoin(ox, oy)
    )
    const spots = coins.map(() => ({
      x: stage.left + stage.width * (0.12 + Math.random() * 0.76),
      y: stage.top + stage.height * (0.3 + Math.random() * 0.44),
    }))
    await Promise.all(coins.map((coin, i) => coin.animate(
      [
        { transform: 'translate(-50%,-50%) translate(0,0) scale(0.25) rotate(0deg)', opacity: 0.25 },
        {
          // 중간에 한 번 솟구쳤다 떨어져 '뿌려졌다'는 포물선이 보이게 한다.
          transform: `translate(-50%,-50%) translate(${((spots[i].x - ox) * 0.62).toFixed(1)}px, ${((spots[i].y - oy) * 0.62 - 72).toFixed(1)}px) scale(1.14) rotate(240deg)`,
          opacity: 1,
          offset: 0.55,
        },
        {
          transform: `translate(-50%,-50%) translate(${(spots[i].x - ox).toFixed(1)}px, ${(spots[i].y - oy).toFixed(1)}px) scale(1) rotate(400deg)`,
          opacity: 1,
        },
      ],
      { duration: 520 + i * 26, easing: 'cubic-bezier(0.22, 0.9, 0.3, 1)', fill: 'forwards' }
    ).finished))
    await new Promise((r) => window.setTimeout(r, BOSS_GREED_SCATTER_HOLD_MS))

    // 2) 손패로 짤랑 — 슬롯마다 하나씩 순서대로 빨려 들어가고, 도착한 슬롯이 톡 생긴다.
    await Promise.all(slotIndices.map(async (slotIndex, i) => {
      await new Promise((r) => window.setTimeout(r, i * 130))
      const coin = coins[i]
      const slot = this.host.findHandSlotElement(slotIndex)
      if (!slot) { coin.remove(); return }
      const target = slot.getBoundingClientRect()
      await coin.animate(
        [
          { transform: `translate(-50%,-50%) translate(${(spots[i].x - ox).toFixed(1)}px, ${(spots[i].y - oy).toFixed(1)}px) scale(1) rotate(0deg)` },
          {
            transform: `translate(-50%,-50%) translate(${(target.left + target.width / 2 - ox).toFixed(1)}px, ${(target.top + target.height / 2 - oy).toFixed(1)}px) scale(0.4) rotate(300deg)`,
            opacity: 0.85,
          },
        ],
        { duration: 380, easing: 'cubic-bezier(0.5, 0, 0.2, 1)', fill: 'forwards' }
      ).finished
      coin.remove()
      sfx.playCoin()
      SquareBurst.playOn(slot, 'treasure-gain', { count: 8, spread: 60, duration: 360 })
      await slot.animate(
        [
          { transform: 'scale(0.6)', opacity: 0.2 },
          { transform: 'scale(1.12)', opacity: 1, offset: 0.6 },
          { transform: 'scale(1)', opacity: 1 },
        ],
        { duration: 320, easing: 'cubic-bezier(0.34,1.56,0.64,1)', fill: 'forwards' }
      ).finished
    }))

    // 3) 손패에 못 들어간 여분은 바닥으로 흘러 사라진다 — 기다리지 않는다.
    for (const coin of coins.slice(slotIndices.length)) {
      void coin.animate(
        [{ opacity: 1 }, { transform: 'translate(-50%,-50%) translateY(46px) scale(0.7)', opacity: 0 }],
        { duration: 520, easing: 'ease-in', fill: 'forwards', composite: 'add' }
      ).finished.then(() => coin.remove())
    }
  }

  /**
   * 모든 보스의 직접 타격 — 들어올림 → 뒤로 당김 → 쾅.
   *
   * 일반 적의 돌진(animateEnemyAttacks)은 평면 위를 미끄러지는 움직임이라 거대한 보스
   * 타일이 쓰면 무게가 없다. 여기서는 `perspective`로 깊이를 주고, 한 번 화면 안쪽으로
   * 물러났다가(작아진다) 앞으로 튀어나오며(커진다) 박는다 — 물러남이 있어야 '쾅'이 산다.
   *
   * 레일 격자가 큰 타일을 잘라내므로 원본이 아니라 body에 올린 복제를 움직인다.
   * Promise는 **착지 순간**에 풀린다 — 호출부의 피해 수치가 반동을 기다리지 않고
   * 박히는 그 프레임에 뜨게 하기 위해서다.
   */
  async animateBossSlamAttack(cardId: string): Promise<void> {
    const boss = this.host.findCardElement(cardId)
    if (!boss) return
    const rect = boss.getBoundingClientRect()
    const player = this.host.findPlayerCardElement()
    const playerRect = player?.getBoundingClientRect() ?? null
    const dx = playerRect
      ? (playerRect.left + playerRect.width / 2 - (rect.left + rect.width / 2)) * 0.16
      : 0
    const dy = playerRect
      ? Math.min(200, Math.max(56, playerRect.top + playerRect.height * 0.1 - rect.bottom + 22))
      : 84

    const clone = boss.cloneNode(true) as HTMLElement
    clone.classList.add('enemy-attack-clone', 'boss-slam-clone')
    clone.style.cssText += `position:fixed;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;margin:0;z-index:245;pointer-events:none;transform-origin:50% 100%;`
    boss.classList.add('is-enemy-slamming-source')
    document.body.appendChild(clone)

    const animation = clone.animate(
      [
        // 0) 자세 — 아직 바닥에 붙어 있다.
        {
          transform: 'perspective(900px) translate3d(0,0,0) rotateX(0deg) scale(1)',
          filter: 'brightness(1)',
          easing: 'cubic-bezier(0.3, 0, 0.4, 1)',
        },
        // 1) 들어올림 — 무게를 싣고 떠오른다.
        {
          transform: 'perspective(900px) translate3d(0,-30px,0) rotateX(7deg) scale(1.05)',
          filter: 'brightness(1.14)',
          offset: 0.22,
          easing: 'ease-out',
        },
        // 2) 뒤로 당김 — 화면 안쪽으로 물러나며 작아진다(원근으로 거리감을 만든다).
        {
          transform: `perspective(900px) translate3d(${(-dx * 0.3).toFixed(1)}px,-50px,-170px) rotateX(14deg) scale(0.93)`,
          filter: 'brightness(0.88)',
          offset: 0.46,
          easing: 'cubic-bezier(0.72, 0, 0.9, 0.24)',
        },
        // 3) 쾅 — 앞으로 튀어나오며 플레이어 쪽에 깊게 박힌다.
        {
          transform: `perspective(900px) translate3d(${dx.toFixed(1)}px,${dy.toFixed(1)}px,200px) rotateX(-13deg) scale(1.16)`,
          filter: 'brightness(1.5) drop-shadow(0 26px 30px rgba(168, 58, 58, 0.8))',
          offset: BOSS_SLAM_IMPACT_OFFSET,
          easing: 'cubic-bezier(0.2, 0.9, 0.3, 1)',
        },
        // 4) 반동 — 눌렸다가 제자리로.
        {
          transform: `perspective(900px) translate3d(${(dx * 0.2).toFixed(1)}px,${(dy * 0.14).toFixed(1)}px,44px) rotateX(-4deg) scale(1.02)`,
          filter: 'brightness(1.08)',
          offset: 0.8,
        },
        {
          transform: 'perspective(900px) translate3d(0,0,0) rotateX(0deg) scale(1)',
          filter: 'brightness(1)',
        },
      ],
      { duration: BOSS_SLAM_DURATION_MS, easing: 'linear', fill: 'forwards' }
    )
    const cleanup = (): void => {
      clone.remove()
      boss.classList.remove('is-enemy-slamming-source')
    }
    animation.finished.then(cleanup, cleanup)
    window.setTimeout(cleanup, BOSS_SLAM_DURATION_MS + 220)

    // 착지 프레임에 맞춰 화면을 한 번 흔들고, 그 순간 호출부에 제어를 돌려준다.
    await new Promise<void>((r) =>
      window.setTimeout(r, Math.round(BOSS_SLAM_DURATION_MS * BOSS_SLAM_IMPACT_OFFSET))
    )
    const board = this.host.boardElement
    board.classList.remove('is-boss-slam-shake')
    void board.offsetWidth
    board.classList.add('is-boss-slam-shake')
    window.setTimeout(() => board.classList.remove('is-boss-slam-shake'), BOSS_SLAM_SHAKE_MS)
  }

  /** 화면에 흩뿌려지는 금화 하나. 좌표는 fixed, 이동은 transform으로만 준다. */
  private spawnGreedCoin(x: number, y: number): HTMLElement {
    const coin = document.createElement('i')
    coin.className = 'boss-greed-coin'
    coin.setAttribute('aria-hidden', 'true')
    coin.style.cssText = `left:${x}px;top:${y}px;`
    document.body.appendChild(coin)
    return coin
  }

  /**
   * 30F 2페이지 '탐욕의 값' — 손에 쥔 탐욕의 동전이 하나씩 웨이브로 떠오른 뒤,
   * 그 자리에서 플레이어에게 1씩 꽂힌다. 동전을 쥐고 있을수록 아프므로 "쓸까 말까"가
   * 매 턴 선택으로 남는다. 실제 피해 적용은 콜백(호출부)이 한 장씩 처리한다.
   */
  async animateGreedCoinToll(
    slotIndices: readonly number[],
    onCoin: (slotIndex: number) => Promise<void> | void
  ): Promise<void> {
    // 1) 셈 — 쥐고 있는 동전을 하나씩 짚으며 **몇 장인지 세어 보인다**. 값이 얼마나
    //    나올지가 이 셈에서 먼저 읽혀야 뒤의 피해가 납득된다. 세어진 동전은 불길하게
    //    물든 채 남아(is-greed-counted) "이건 이미 값에 포함됐다"를 유지한다.
    const counted: HTMLElement[] = []
    for (let i = 0; i < slotIndices.length; i++) {
      const slot = this.host.findHandSlotElement(slotIndices[i])
      if (slot) {
        sfx.playCoin()
        slot.classList.add('is-greed-counted')
        counted.push(slot)
        void slot.animate(
          [
            { transform: 'translateY(0) scale(1)', filter: 'brightness(1)' },
            { transform: 'translateY(-16px) scale(1.14)', filter: 'brightness(1.6)', offset: 0.42 },
            { transform: 'translateY(0) scale(1)', filter: 'brightness(1)' },
          ],
          { duration: 520, easing: 'cubic-bezier(0.34,1.4,0.64,1)' }
        )
        // 몇 번째 장인지 숫자로 올려 준다 — 이게 곧 이번 주기에 치를 값이다.
        const rect = slot.getBoundingClientRect()
        void this.host.animateFloatTextAt(
          rect.left + rect.width / 2,
          rect.top + rect.height * 0.18,
          `${i + 1}`,
          { className: 'damage-float--greed-count', durationMs: BOSS_GREED_COUNT_HOLD_MS }
        )
      }
      await new Promise((r) => window.setTimeout(r, BOSS_GREED_WAVE_STEP_MS))
    }
    // 다 세고 한 박자 — 값이 확정된 뒤에 청구가 시작된다.
    await new Promise((r) => window.setTimeout(r, BOSS_GREED_COUNT_SETTLE_MS))

    // 2) 징수 — 동전 자리에서 플레이어로 한 발씩. 트레일을 기다렸다가 피해를 얹어
    //    "동전이 날아와서 맞았다"의 순서가 무너지지 않게 한다.
    for (const slotIndex of slotIndices) {
      const slot = this.host.findHandSlotElement(slotIndex)
      const player = this.host.findPlayerCardElement()
      if (slot) slot.classList.remove('is-greed-counted')
      if (slot && player) {
        // 발사 섬광을 동전 자리에 놓아 어느 장이 지금 값을 물리는지 짚어 준다.
        this.playBossCellVolleyLaunch(slot)
        await this.host.trails.animateResourceTrail(slot, player, 1, 'damage')
      }
      await onCoin(slotIndex)
      await new Promise((r) => window.setTimeout(r, BOSS_GREED_TOLL_STEP_MS))
    }
    for (const slot of counted) slot.classList.remove('is-greed-counted')
  }
}
