/**
 * WaxFigureView — 밀랍상(蠟像) 수집 탭 오버레이.
 * 경험/도감과 같은 등장 문법(body 오버레이 + is-open)을 쓰지만, 이 뷰는 순수 데이터
 * 표시가 아니라 상태를 직접 바꾸는 액션(정리/합성/버리기)을 가진다 — 그래서 host 참조
 * 없이 `@core/WaxFigureCollection`의 순수 함수를 곧바로 불러 쓰고, 액션 뒤에는 항상
 * 자기 자신을 다시 그린다(re-render). 렌더 상태의 단일 출처는 그 모듈이다.
 */

import {
  getWaxFigureRunHold,
  loadWaxFigureCollection,
  stowWaxFigureCatch,
  discardWaxFigureCatch,
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

interface PermanentTile {
  enemyName: string
  variant: WaxFigureVariant
  star: number
  count: number
  effectLabel: string
  chancePct: number
  mergeable: boolean
}

export class WaxFigureView {
  /** 처치 시 호출부(index.ts)가 알려 줄 짧은 안내 — 다음에 열릴 때 한 번 보여주고 지운다. */
  private lastActionHint: string | null = null

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
    const mergeBtn = t.closest<HTMLElement>('[data-wax-merge]')
    if (mergeBtn) {
      const [enemyName, variant, starRaw] = mergeBtn.dataset.waxMerge!.split('::')
      mergeWaxFigures(enemyName, variant as WaxFigureVariant, Number(starRaw))
      this.render(host)
      return
    }
    const stowAllBtn = t.closest<HTMLElement>('[data-wax-stow-all]')
    if (stowAllBtn) {
      let stowed = 0
      for (const c of [...getWaxFigureRunHold()]) { if (stowWaxFigureCatch(c.id)) stowed++ }
      const left = getWaxFigureRunHold().length
      this.lastActionHint = left > 0
        ? `${stowed}개 정리, ${left}개는 밀랍상함이 가득 차 못 옮겼습니다.`
        : stowed > 0 ? `${stowed}개 전부 정리했습니다.` : null
      this.render(host)
    }
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

  private renderRunHoldRow(c: WaxFigureCatch): string {
    const shinyClass = c.variant === 'shiny' ? ' is-shiny' : ''
    return `
      <li class="wax-hold-row${shinyClass}">
        <span class="wax-hold-glyph" aria-hidden="true">${waxFigureIcon()}</span>
        <span class="wax-hold-body">
          <span class="wax-hold-name">${c.enemyName}${c.variant === 'shiny' ? ' <em class="wax-shiny-tag">이로치</em>' : ''}</span>
          <span class="wax-hold-effect">${c.effect.label}</span>
        </span>
        <span class="wax-hold-actions">
          <button type="button" class="wax-btn wax-btn-stow" data-wax-stow="${c.id}">담기</button>
          <button type="button" class="wax-btn wax-btn-discard" data-wax-discard="${c.id}" aria-label="버리기">✕</button>
        </span>
      </li>`
  }

  private renderPermanentTile(tile: PermanentTile): string {
    const shinyClass = tile.variant === 'shiny' ? ' is-shiny' : ''
    const mergeBtn = tile.mergeable
      ? `<button type="button" class="wax-btn wax-btn-merge" data-wax-merge="${tile.enemyName}::${tile.variant}::${tile.star}">합성 →★${tile.star + 1}</button>`
      : ''
    return `
      <li class="wax-tile${shinyClass}">
        <span class="wax-tile-glyph" aria-hidden="true">${waxFigureIcon()}</span>
        <span class="wax-tile-star">★${tile.star}</span>
        <span class="wax-tile-name">${tile.enemyName}${tile.variant === 'shiny' ? ' <em class="wax-shiny-tag">이로치</em>' : ''}</span>
        <span class="wax-tile-count">×${tile.count}</span>
        <span class="wax-tile-effect">${tile.effectLabel} <b>${tile.chancePct.toFixed(1)}%</b></span>
        ${mergeBtn}
      </li>`
  }

  private render(host: HTMLElement): void {
    const runHold = getWaxFigureRunHold()
    const tiles = this.permanentTiles()
    const capacity = waxFigureCapacity()
    const used = totalWaxFigureCount()
    const hint = this.lastActionHint
    this.lastActionHint = null

    const runSection = runHold.length > 0
      ? `<ul class="wax-hold-list">${runHold.map((c) => this.renderRunHoldRow(c)).join('')}</ul>
         <button type="button" class="wax-btn wax-btn-stow-all" data-wax-stow-all>전부 정리</button>`
      : `<p class="wax-empty">이번 모험에서 아직 봉인한 게 없습니다.</p>`

    const permSection = tiles.length > 0
      ? `<ul class="wax-tile-grid">${tiles.map((t) => this.renderPermanentTile(t)).join('')}</ul>`
      : `<p class="wax-empty">밀랍상함이 비어 있습니다.</p>`

    host.innerHTML = `
      <div class="wax-figure-modal" role="dialog" aria-label="밀랍상">
        <header class="wax-figure-header">
          <h2 class="wax-figure-title"><span class="wax-figure-title-icon">${waxFigureIcon()}</span>밀랍상</h2>
          <button class="wax-figure-close" data-wax-close type="button" aria-label="닫기">${closeIcon()}</button>
        </header>
        ${hint ? `<p class="wax-action-hint">${hint}</p>` : ''}
        <section class="wax-figure-body">
          <div class="wax-section">
            <h3 class="wax-section-title">이번 모험 <span class="wax-section-note">정리하지 않으면 모험이 끝날 때 사라집니다</span></h3>
            ${runSection}
          </div>
          <div class="wax-section">
            <h3 class="wax-section-title">밀랍상함 <span class="wax-capacity">${used}/${capacity}</span></h3>
            ${permSection}
          </div>
        </section>
      </div>`
  }
}
