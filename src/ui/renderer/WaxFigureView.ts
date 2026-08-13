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
  /** 좌측 정보창/우측 조합 패널이 지금 가리키는 밀랍상함 항목. */
  private selectedKey: string | null = null

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
    const mergeBtn = t.closest<HTMLElement>('[data-wax-merge]')
    if (mergeBtn) {
      const [enemyName, variant, starRaw] = mergeBtn.dataset.waxMerge!.split('::')
      const star = Number(starRaw)
      if (mergeWaxFigures(enemyName, variant as WaxFigureVariant, star)) {
        this.selectedKey = tileKey(enemyName, variant as WaxFigureVariant, star + 1)
      }
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
      return
    }
    const selectCard = t.closest<HTMLElement>('[data-wax-select]')
    if (selectCard) {
      this.selectedKey = selectCard.dataset.waxSelect!
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

  /** 우측 임시보관칸 한 줄 — 넘친 몫이라 작게, 담기/버리기만 즉시 가능하면 된다. */
  private renderHoldSlot(c: WaxFigureCatch): string {
    const shinyClass = c.variant === 'shiny' ? ' is-shiny' : ''
    const sprite = spriteForSpeciesName(c.enemyName)
    return `
      <li class="wax-hold-slot${shinyClass}">
        <div class="wax-hold-slot-art" style="background-image:url('${sprite}')" aria-hidden="true"></div>
        <span class="wax-hold-slot-name">${c.enemyName}${c.variant === 'shiny' ? ' <em class="wax-shiny-tag">이로치</em>' : ''}</span>
        <span class="wax-hold-slot-actions">
          <button type="button" class="wax-btn wax-btn-stow" data-wax-stow="${c.id}">담기</button>
          <button type="button" class="wax-btn wax-btn-discard" data-wax-discard="${c.id}" aria-label="버리기">✕</button>
        </span>
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

  /** 좌측 정보창 — 선택된 전시물의 아트/효과/수치를 크게 보여준다. */
  private renderInfoPanel(tile: PermanentTile | undefined): string {
    if (!tile) {
      return `
        <div class="wax-info-empty">
          <span class="wax-info-empty-glyph">${waxFigureIcon()}</span>
          <p>전시물을 골라 보세요.</p>
        </div>`
    }
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

  /**
   * 하단 조합 바 — 밀랍 조각진(연성진) 형태로 그린다. 재료 3개가 원 둘레 세 점에
   * 놓이고, 그 힘이 가운데 결과로 모이는 그림이라 "합성 = 의식"이라는 느낌을 낸다.
   * 슬롯을 한 줄로 나열하던 이전 표기보다 이 시스템의 제물/연성 테마에 맞는다.
   */
  private renderComposePanel(tile: PermanentTile | undefined): string {
    if (!tile) {
      return `<p class="wax-compose-empty">전시물을 고르면 조각진을 볼 수 있습니다.</p>`
    }
    const sprite = spriteForSpeciesName(tile.enemyName)
    const shinyClass = tile.variant === 'shiny' ? ' is-shiny' : ''
    const filled = Math.min(tile.count, WAX_FIGURE_MERGE_COUNT)
    const nodes = Array.from({ length: WAX_FIGURE_MERGE_COUNT }, (_, i) => {
      const has = i < filled
      return `<span class="wax-compose-node wax-compose-node-${i + 1}${has ? ' is-filled' : ''}${shinyClass}" style="${has ? `background-image:url('${sprite}')` : ''}"></span>`
    }).join('')
    const nextStar = tile.star + 1
    const nextChance = waxFigureEffectChance(nextStar) * 100
    const action = tile.mergeable
      ? `<button type="button" class="wax-btn wax-btn-merge-big" data-wax-merge="${tile.enemyName}::${tile.variant}::${tile.star}">합성하기</button>`
      : `<p class="wax-compose-need">합성에 ${WAX_FIGURE_MERGE_COUNT}개 필요 (현재 ${tile.count}개)</p>`
    return `
      <div class="wax-compose-circle${tile.mergeable ? ' is-ready' : ''}">
        <span class="wax-compose-ring wax-compose-ring-outer" aria-hidden="true"></span>
        <span class="wax-compose-ring wax-compose-ring-inner" aria-hidden="true"></span>
        ${nodes}
        <div class="wax-compose-core${shinyClass}" style="background-image:url('${sprite}')">
          <span class="wax-compose-core-star">★${nextStar}</span>
        </div>
      </div>
      <p class="wax-compose-result-label">${tile.enemyName}${tile.variant === 'shiny' ? ' 이로치' : ''} ★${nextStar} — ${tile.effectLabel} <b>${nextChance.toFixed(1)}%</b></p>
      ${action}`
  }

  private render(host: HTMLElement): void {
    const runHold = getWaxFigureRunHold()
    const tiles = this.permanentTiles()
    const capacity = waxFigureCapacity()
    const used = totalWaxFigureCount()
    const hint = this.lastActionHint
    this.lastActionHint = null

    // 선택이 없거나 합성/버리기로 사라졌으면 첫 전시물로 되돌아간다 — 패널이 빈 채로
    // 남으면 "지금 뭘 보고 있는지"가 끊긴다.
    if (!this.selectedKey || !tiles.some((t) => t.key === this.selectedKey)) {
      this.selectedKey = tiles[0]?.key ?? null
    }
    const selectedTile = tiles.find((t) => t.key === this.selectedKey)

    // 자리가 있으면 봉인은 곧장 밀랍상함으로 들어간다 — 우측 임시보관칸은 한도를 넘겨
    // 밀려난 "넘친 몫"만 담으므로 평소에는 비어 있는 것이 정상이다.
    const holdContent = runHold.length > 0
      ? `<ul class="wax-hold-slots">${runHold.map((c) => this.renderHoldSlot(c)).join('')}</ul>
         <button type="button" class="wax-btn wax-btn-stow-all" data-wax-stow-all>전부 정리</button>`
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
          <aside class="wax-info-panel">${this.renderInfoPanel(selectedTile)}</aside>
          <div class="wax-gallery-scroll">${galleryContent}</div>
          <aside class="wax-hold-panel">
            <h3 class="wax-section-title">임시보관함 <span class="wax-section-note">가득 찼을 때만 여기로</span></h3>
            ${holdContent}
          </aside>
          <section class="wax-compose-bar">
            <h3 class="wax-section-title">조합</h3>
            ${this.renderComposePanel(selectedTile)}
          </section>
        </section>
      </div>`
  }
}
