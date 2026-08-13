/**
 * WaxFigureView — 밀랍상(蠟像) 수집 탭 오버레이.
 * 경험/도감과 같은 등장 문법(body 오버레이 + is-open)을 쓰지만, 이 뷰는 순수 데이터
 * 표시가 아니라 상태를 직접 바꾸는 액션(정리/합성/버리기)을 가진다 — 그래서 host 참조
 * 없이 `@core/WaxFigureCollection`의 순수 함수를 곧바로 불러 쓰고, 액션 뒤에는 항상
 * 자기 자신을 다시 그린다(re-render). 렌더 상태의 단일 출처는 그 모듈이다.
 *
 * 레이아웃은 "전시관"이다 — 좌: 선택 정보창, 중앙: 실제 필드 칸과 같은 풀 일러스트
 * 갤러리(더 많은 전시물이 들어가도록 카드는 작게), 우: 넘친 몫이 쌓이는 작은
 * 임시보관칸, 하단: 조합(합성) 바. 갤러리 카드는 도감처럼 새 아이콘을 그리지 않고
 * `spriteForCard()`(필드 카드와 같은 함수)로 실제 인게임 일러스트를 그대로 띄운다.
 */

import {
  getWaxFigureRunHold,
  loadWaxFigureCollection,
  stowWaxFigureCatch,
  discardWaxFigureCatch,
  discardWaxFigurePermanent,
  mergeWaxFigures,
  totalWaxFigureCount,
  waxFigureCapacity,
  waxFigureEffectChance,
  findWaxFigureSpecies,
  WAX_FIGURE_MERGE_COUNT,
  type WaxFigureVariant,
  type WaxFigureCatch,
} from '@core/WaxFigureCollection'
import { waxFigureIcon, closeIcon } from '@ui/Icons'
import { spriteForCard } from '@ui/Sprites'
import { Card, CardType } from '@entities/Card'
import { ENEMY_DEFINITIONS } from '@systems/CardSpawner'
import { SquareBurst } from '@ui/SquareBurst'

interface PermanentTile {
  key: string
  enemyName: string
  variant: WaxFigureVariant
  star: number
  count: number
  effectLabel: string
  chancePct: number
  mergeable: boolean
}

/** 필드 카드와 같은 함수로 아트를 뽑는다 — 전시관 전용 아트를 새로 정의하지 않는다. */
const spriteCache = new Map<string, string>()
function spriteForSpeciesName(enemyName: string): string {
  const cached = spriteCache.get(enemyName)
  if (cached) return cached
  const def = ENEMY_DEFINITIONS.find((d) => d.name === enemyName)
  const dummy = new Card('wax-figure-preview', CardType.ENEMY, enemyName, def?.description ?? '', 1, 1, {
    enemySpriteId: def?.enemySpriteId,
    enemyPower: def?.enemyPower,
  })
  const url = spriteForCard(dummy)
  spriteCache.set(enemyName, url)
  return url
}

function tileKey(enemyName: string, variant: WaxFigureVariant, star: number): string {
  return `${enemyName}::${variant}::${star}`
}

export class WaxFigureView {
  /** 처치 시 호출부(index.ts)가 알려 줄 짧은 안내 — 다음에 열릴 때 한 번 보여주고 지운다. */
  private lastActionHint: string | null = null
  /** 좌측 정보창이 지금 가리키는 밀랍상함 항목. */
  private selectedKey: string | null = null
  /** 하단 마법진이 지금 보여주는 합성 후보 — 합성 가능 리스트에서만 고른다. */
  private composeKey: string | null = null
  /** 합성 애니메이션이 도는 동안 같은 클릭이 두 번 들어가지 않게 막는다. */
  private merging = false

  open(): void {
    let host = document.getElementById('wax-figure-overlay') as HTMLElement | null
    if (!host) {
      host = document.createElement('div')
      host.id = 'wax-figure-overlay'
      host.className = 'wax-figure-overlay'
      document.body.appendChild(host)
      host.addEventListener('click', (e) => this.handleClick(e))
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && host?.classList.contains('is-open')) this.close()
      })
    }
    this.render(host)
    host.classList.add('is-open')
  }

  private close(): void {
    document.getElementById('wax-figure-overlay')?.classList.remove('is-open')
  }

  private handleClick(e: MouseEvent): void {
    const host = e.currentTarget as HTMLElement
    const t = e.target as HTMLElement
    if (t.dataset.waxClose !== undefined || t === host) { this.close(); return }
    const stowBtn = t.closest<HTMLElement>('[data-wax-stow]')
    if (stowBtn) {
      const ok = stowWaxFigureCatch(stowBtn.dataset.waxStow!)
      this.lastActionHint = ok ? null : '밀랍상함이 가득 찼습니다 — 자리를 비우거나 다른 걸 먼저 합성해 보세요.'
      this.render(host)
      return
    }
    const discardBtn = t.closest<HTMLElement>('[data-wax-discard]')
    if (discardBtn) {
      discardWaxFigureCatch(discardBtn.dataset.waxDiscard!)
      this.render(host)
      return
    }
    const discardPermanentBtn = t.closest<HTMLElement>('[data-wax-discard-permanent]')
    if (discardPermanentBtn) {
      const [enemyName, variant, starRaw] = discardPermanentBtn.dataset.waxDiscardPermanent!.split('::')
      discardWaxFigurePermanent(enemyName, variant as WaxFigureVariant, Number(starRaw))
      this.render(host)
      return
    }
    const composeSelectBtn = t.closest<HTMLElement>('[data-wax-compose-select]')
    if (composeSelectBtn) {
      this.composeKey = composeSelectBtn.dataset.waxComposeSelect!
      this.render(host)
      return
    }
    const mergeBtn = t.closest<HTMLElement>('[data-wax-merge]')
    if (mergeBtn && !this.merging) {
      void this.performMerge(host, mergeBtn.dataset.waxMerge!)
      return
    }
    const selectCard = t.closest<HTMLElement>('[data-wax-select]')
    if (selectCard) {
      this.selectedKey = selectCard.dataset.waxSelect!
      this.render(host)
    }
  }

  /**
   * 마법진 가운데를 눌렀을 때의 전체 시퀀스 — ① 링이 빠르게 도는 "위잉" 가속(0.6초)
   * ② 실제 합성(재료 소모 + 결과 생성) ③ 재렌더(재료 카드는 수량이 줄거나 사라지고
   * 결과 카드가 갤러리에 나타난다) ④ 결과가 마법진 자리에서 튀어나와 그 갤러리 칸으로
   * 날아가 꽂히는 비행 연출. 이 함수가 끝나기 전까지는 중복 클릭을 막는다.
   */
  private async performMerge(host: HTMLElement, recipeKey: string): Promise<void> {
    const [enemyName, variant, starRaw] = recipeKey.split('::')
    const star = Number(starRaw)
    this.merging = true
    const circle = host.querySelector<HTMLElement>('.wax-compose-circle')
    const core = circle?.querySelector<HTMLElement>('.wax-compose-core')
    const sourceRect = core?.getBoundingClientRect() ?? null
    const sprite = spriteForSpeciesName(enemyName)
    circle?.classList.add('is-merging')
    await new Promise<void>((resolve) => window.setTimeout(resolve, 600))

    const ok = mergeWaxFigures(enemyName, variant as WaxFigureVariant, star)
    if (!ok) {
      circle?.classList.remove('is-merging')
      this.merging = false
      this.render(host)
      return
    }
    const resultKey = tileKey(enemyName, variant as WaxFigureVariant, star + 1)
    this.selectedKey = resultKey
    this.render(host)

    const destEl = host.querySelector<HTMLElement>(`[data-wax-select="${resultKey}"]`)
    if (sourceRect && destEl) {
      await this.playComposeFlight(sourceRect, destEl.getBoundingClientRect(), variant === 'shiny', sprite)
    }
    this.merging = false
  }

  /** 마법진 자리에서 튀어나온 결과가 갤러리의 새 칸으로 날아가 꽂히는 토큰. */
  private playComposeFlight(source: DOMRect, dest: DOMRect, shiny: boolean, spriteUrl: string): Promise<void> {
    const size = 46
    const el = document.createElement('div')
    el.className = `wax-compose-flight${shiny ? ' is-shiny' : ''}`
    el.style.backgroundImage = `url('${spriteUrl}')`
    el.style.width = `${size}px`
    el.style.height = `${size}px`
    document.body.appendChild(el)
    const sx = source.left + source.width / 2 - size / 2
    const sy = source.top + source.height / 2 - size / 2
    const dx = dest.left + dest.width / 2 - size / 2
    const dy = dest.top + dest.height / 2 - size / 2
    const midX = (sx + dx) / 2
    const midY = Math.min(sy, dy) - 46
    const anim = el.animate(
      [
        { transform: `translate(${sx}px, ${sy}px) scale(1.35)`, opacity: 1, offset: 0 },
        { transform: `translate(${midX}px, ${midY}px) scale(1.05)`, opacity: 1, offset: 0.5 },
        { transform: `translate(${dx}px, ${dy}px) scale(0.9)`, opacity: 1, offset: 0.9 },
        { transform: `translate(${dx}px, ${dy}px) scale(0.55)`, opacity: 0, offset: 1 },
      ],
      { duration: 620, easing: 'cubic-bezier(0.3, 0.7, 0.25, 1)', fill: 'forwards' }
    )
    return new Promise<void>((resolve) => {
      const done = (): void => {
        SquareBurst.playAt(dest.left + dest.width / 2, dest.top + dest.height / 2, shiny ? 'wax-figure-shiny' : 'wax-figure', {
          count: 14,
          spread: 46,
          duration: 380,
        })
        el.remove()
        resolve()
      }
      anim.onfinish = done
      window.setTimeout(done, 700)
    })
  }

  private permanentTiles(): PermanentTile[] {
    const state = loadWaxFigureCollection()
    const tiles: PermanentTile[] = []
    for (const [key, count] of Object.entries(state.counts)) {
      const [enemyName, variant, starRaw] = key.split('::') as [string, WaxFigureVariant, string]
      const star = Number(starRaw)
      const species = findWaxFigureSpecies(enemyName)
      if (!species) continue
      tiles.push({
        key,
        enemyName,
        variant,
        star,
        count,
        effectLabel: species.effects[variant].label,
        chancePct: waxFigureEffectChance(star) * 100,
        mergeable: count >= WAX_FIGURE_MERGE_COUNT,
      })
    }
    tiles.sort((a, b) => a.enemyName.localeCompare(b.enemyName) || a.variant.localeCompare(b.variant) || a.star - b.star)
    return tiles
  }

  /** 우측 임시보관칸 — 갤러리 카드와 같은 어휘의 더 작은 칸이다. 이름/효과 문구는
   *  안 붙인다 — 눌러서 좌측 정보창을 보면 되므로 칸 자체는 작게 유지한다. */
  private renderHoldCard(c: WaxFigureCatch, selected: boolean): string {
    const shinyClass = c.variant === 'shiny' ? ' is-shiny' : ''
    const selectedClass = selected ? ' is-selected' : ''
    const sprite = spriteForSpeciesName(c.enemyName)
    return `
      <li class="wax-exhibit-card wax-hold-card${shinyClass}${selectedClass}" data-wax-select="${c.id}">
        <div class="wax-exhibit-art" style="background-image:url('${sprite}')" aria-hidden="true"></div>
      </li>`
  }

  private renderExhibitCard(tile: PermanentTile, selected: boolean): string {
    const shinyClass = tile.variant === 'shiny' ? ' is-shiny' : ''
    const selectedClass = selected ? ' is-selected' : ''
    const sprite = spriteForSpeciesName(tile.enemyName)
    return `
      <li class="wax-exhibit-card${shinyClass}${selectedClass}" data-wax-select="${tile.key}">
        <div class="wax-exhibit-art" style="background-image:url('${sprite}')" aria-hidden="true"></div>
        <span class="wax-exhibit-star">★${tile.star}</span>
        <span class="wax-exhibit-count">×${tile.count}</span>
        <div class="wax-exhibit-frame">
          <span class="wax-exhibit-name">${tile.enemyName}${tile.variant === 'shiny' ? ' <em class="wax-shiny-tag">이로치</em>' : ''}</span>
        </div>
      </li>`
  }

  /**
   * 좌측 정보창 — 선택된 전시물의 아트/효과/수치를 크게 보여준다. 밀랍상함 항목과
   * 임시보관함(넘친 몫) 항목을 같은 자리에서 보여주되, 후자는 "정리 안 하면 사라짐"
   * 안내와 담기/버리기 두 버튼을 더 갖는다 — 둘 다 결국 같은 밀랍상이라 표시 칸만
   * 작을 뿐, 정보는 이 패널 하나로 통일한다.
   */
  private renderInfoPanel(selection: { tile: PermanentTile } | { catch: WaxFigureCatch } | null): string {
    if (!selection) {
      return `
        <div class="wax-info-empty">
          <span class="wax-info-empty-glyph">${waxFigureIcon()}</span>
          <p>전시물을 골라 보세요.</p>
        </div>`
    }
    if ('tile' in selection) {
      const tile = selection.tile
      const sprite = spriteForSpeciesName(tile.enemyName)
      const shinyClass = tile.variant === 'shiny' ? ' is-shiny' : ''
      return `
        <div class="wax-info-portrait${shinyClass}" style="background-image:url('${sprite}')" aria-hidden="true"></div>
        <div class="wax-info-body">
          <h3 class="wax-info-name">${tile.enemyName}${tile.variant === 'shiny' ? ' <em class="wax-shiny-tag">이로치</em>' : ''}</h3>
          <div class="wax-info-stars">${'★'.repeat(tile.star)}<span class="wax-info-star-num">${tile.star}성</span></div>
          <dl class="wax-info-stats">
            <div><dt>보유</dt><dd>×${tile.count}</dd></div>
            <div><dt>효과</dt><dd>${tile.effectLabel}</dd></div>
            <div><dt>발동 확률</dt><dd><b>${tile.chancePct.toFixed(1)}%</b></dd></div>
          </dl>
        </div>
        <button type="button" class="wax-info-discard" data-wax-discard-permanent="${tile.enemyName}::${tile.variant}::${tile.star}" aria-label="이 밀랍상 버리기" data-tooltip="1개 버리기.">✕</button>`
    }
    const c = selection.catch
    const sprite = spriteForSpeciesName(c.enemyName)
    const shinyClass = c.variant === 'shiny' ? ' is-shiny' : ''
    return `
      <div class="wax-info-portrait${shinyClass}" style="background-image:url('${sprite}')" aria-hidden="true"></div>
      <div class="wax-info-body">
        <h3 class="wax-info-name">${c.enemyName}${c.variant === 'shiny' ? ' <em class="wax-shiny-tag">이로치</em>' : ''}</h3>
        <p class="wax-info-hold-note">임시보관함 — 정리하지 않으면 모험이 끝날 때 사라집니다.</p>
        <dl class="wax-info-stats">
          <div><dt>효과</dt><dd>${c.effect.label}</dd></div>
        </dl>
      </div>
      <div class="wax-info-hold-actions">
        <button type="button" class="wax-btn wax-btn-stow" data-wax-stow="${c.id}">담기</button>
        <button type="button" class="wax-info-discard" data-wax-discard="${c.id}" aria-label="버리기" data-tooltip="버리기.">✕</button>
      </div>`
  }

  /** 좌측 "합성 가능 리스트" — 재료가 다 찬 조합만 버튼으로 나열한다. */
  private renderComposeList(mergeable: PermanentTile[], activeKey: string | null): string {
    if (mergeable.length === 0) {
      return `<p class="wax-compose-list-empty">합성 가능한 조합이 없습니다.<br>같은 종+색을 ${WAX_FIGURE_MERGE_COUNT}개 모아 보세요.</p>`
    }
    return `<ul class="wax-compose-list">${mergeable
      .map((t) => {
        const sprite = spriteForSpeciesName(t.enemyName)
        return `
        <li>
          <button type="button" class="wax-compose-list-btn${t.key === activeKey ? ' is-active' : ''}" data-wax-compose-select="${t.key}">
            <span class="wax-compose-list-glyph" style="background-image:url('${sprite}')" aria-hidden="true"></span>
            <span class="wax-compose-list-name">${t.enemyName}${t.variant === 'shiny' ? ' <em class="wax-shiny-tag">이로치</em>' : ''}</span>
            <span class="wax-compose-list-star">★${t.star}</span>
          </button>
        </li>`
      })
      .join('')}</ul>`
  }

  /**
   * 우측 마법진 무대 — 밀랍 조각진(연성진) 형태로 그린다. 재료 3개가 원 둘레 세 점에
   * 놓이고, 그 힘이 가운데 결과로 모이는 그림이라 "합성 = 의식"이라는 느낌을 낸다.
   * 가운데 결과가 곧 합성 버튼이다 — 숨쉬듯 맥동시켜(is-pulse) 누르고 싶게 만든다.
   */
  private renderComposeCircle(tile: PermanentTile | undefined): string {
    if (!tile) {
      return `<p class="wax-compose-empty">좌측에서 합성할 조합을 골라 보세요.</p>`
    }
    const sprite = spriteForSpeciesName(tile.enemyName)
    const shinyClass = tile.variant === 'shiny' ? ' is-shiny' : ''
    const nodes = Array.from(
      { length: WAX_FIGURE_MERGE_COUNT },
      (_, i) => `<span class="wax-compose-node wax-compose-node-${i + 1}${shinyClass}" style="background-image:url('${sprite}')" aria-hidden="true"></span>`
    ).join('')
    const nextStar = tile.star + 1
    const nextChance = waxFigureEffectChance(nextStar) * 100
    return `
      <div class="wax-compose-circle">
        <span class="wax-compose-ring wax-compose-ring-outer" aria-hidden="true"></span>
        <span class="wax-compose-ring wax-compose-ring-inner" aria-hidden="true"></span>
        ${nodes}
        <button type="button" class="wax-compose-core is-pulse${shinyClass}" style="background-image:url('${sprite}')" data-wax-merge="${tile.enemyName}::${tile.variant}::${tile.star}" data-tooltip="눌러서 합성." aria-label="${tile.enemyName} 합성하기">
          <span class="wax-compose-core-star">★${nextStar}</span>
        </button>
      </div>
      <p class="wax-compose-result-label">${tile.enemyName}${tile.variant === 'shiny' ? ' 이로치' : ''} ★${nextStar} — ${tile.effectLabel} <b>${nextChance.toFixed(1)}%</b></p>`
  }

  private render(host: HTMLElement): void {
    const runHold = getWaxFigureRunHold()
    const tiles = this.permanentTiles()
    const capacity = waxFigureCapacity()
    const used = totalWaxFigureCount()
    const hint = this.lastActionHint
    this.lastActionHint = null

    // 선택이 없거나 합성/버리기로 사라졌으면 첫 전시물로 되돌아간다 — 패널이 빈 채로
    // 남으면 "지금 뭘 보고 있는지"가 끊긴다. 밀랍상함 항목과 임시보관함 항목을 같은
    // selectedKey 하나로 다룬다(둘의 id 체계가 겹치지 않는다 — 전자는 종::색::성급,
    // 후자는 wf-N).
    const selectable = this.selectedKey !== null
      && (tiles.some((t) => t.key === this.selectedKey) || runHold.some((c) => c.id === this.selectedKey))
    if (!selectable) {
      this.selectedKey = tiles[0]?.key ?? runHold[0]?.id ?? null
    }
    const selectedTile = tiles.find((t) => t.key === this.selectedKey)
    const selectedCatch = runHold.find((c) => c.id === this.selectedKey)
    const infoSelection = selectedTile ? { tile: selectedTile } : selectedCatch ? { catch: selectedCatch } : null

    // 마법진은 합성 가능 리스트(재료가 다 찬 조합)에서만 고른다 — 리스트에서 사라졌으면
    // (합성해 버렸거나 버려서 재료가 줄었으면) 다음 후보로 넘어간다.
    const mergeableTiles = tiles.filter((t) => t.mergeable)
    if (!this.composeKey || !mergeableTiles.some((t) => t.key === this.composeKey)) {
      this.composeKey = mergeableTiles[0]?.key ?? null
    }
    const composeTile = mergeableTiles.find((t) => t.key === this.composeKey)

    // 자리가 있으면 봉인은 곧장 밀랍상함으로 들어간다 — 우측 임시보관칸은 한도를 넘겨
    // 밀려난 "넘친 몫"만 담으므로 평소에는 비어 있는 것이 정상이다.
    const holdContent = runHold.length > 0
      ? `<ul class="wax-exhibit-grid wax-hold-grid">${runHold.map((c) => this.renderHoldCard(c, c.id === this.selectedKey)).join('')}</ul>`
      : `<p class="wax-hold-empty">비어 있습니다.</p>`

    // 남은 자리도 투명 칸으로 채운다 — "몇 마리 더 들어가는지"가 빈 문구 한 줄보다
    // 격자 자체에서 바로 읽혀야 한다(무역탭이 비어도 레일 크기를 그대로 차지하는 것과 같은 원리).
    const emptySlots = Math.max(0, capacity - used)
    const emptyCells = Array.from({ length: emptySlots }, () => '<li class="wax-exhibit-card wax-exhibit-card-empty" aria-hidden="true"></li>').join('')
    const galleryContent = `<ul class="wax-exhibit-grid">${tiles.map((t) => this.renderExhibitCard(t, t.key === this.selectedKey)).join('')}${emptyCells}</ul>`

    host.innerHTML = `
      <div class="wax-figure-modal" role="dialog" aria-label="밀랍상">
        <header class="wax-figure-header">
          <h2 class="wax-figure-title"><span class="wax-figure-title-icon">${waxFigureIcon()}</span>밀랍상 전시관</h2>
          <span class="wax-figure-capacity">보관 <b>${used}</b> / 최대 <b>${capacity}</b></span>
          <button class="wax-figure-close" data-wax-close type="button" aria-label="닫기">${closeIcon()}</button>
        </header>
        ${hint ? `<p class="wax-action-hint">${hint}</p>` : ''}
        <section class="wax-figure-hall">
          <aside class="wax-info-panel">${this.renderInfoPanel(infoSelection)}</aside>
          <div class="wax-gallery-scroll">${galleryContent}</div>
          <aside class="wax-hold-panel">
            <h3 class="wax-section-title">임시보관함 <span class="wax-section-note">가득 찼을 때만 여기로</span></h3>
            ${holdContent}
          </aside>
          <section class="wax-compose-bar">
            <h3 class="wax-section-title">조합</h3>
            <div class="wax-compose-layout">
              <div class="wax-compose-list-col">${this.renderComposeList(mergeableTiles, this.composeKey)}</div>
              <div class="wax-compose-stage">${this.renderComposeCircle(composeTile)}</div>
            </div>
          </section>
        </section>
      </div>`
  }
}
