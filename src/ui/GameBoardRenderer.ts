/**
 * GameBoardRenderer - 3-lane × 3-row vertical rail.
 *
 * Layout (top → bottom):
 *   distance 2  faintest preview
 *   distance 1  dimmer preview
 *   distance 0  full-opacity active row (the only interactive row)
 *                          🕯  Player Card
 *                          📦  Items
 *
 * Grouping: when a Card instance is referenced by adjacent lane slots in the
 * same row, that Card is rendered ONCE as a cell that spans those columns.
 *
 * Interaction:
 *   1st click   → card glows (selected)
 *   2nd click   → fires `cardAction` event (action runs in main loop)
 */

import { GameState } from '@core/GameState'
import { Card, CardType } from '@entities/Card'
import { Lane, LANE_DISTANCE_COUNT } from '@entities/Lane'
import type { EnemyHit, TreasureChange } from '@core/TurnManager'
import { spriteForCard, spriteForHandCard, spriteForRelic, SpriteUrls } from '@ui/Sprites'
import { CandleMode, Character } from '@entities/Character'
import { HandCardId, HandCategory, HandEffectTargeting } from '@entities/HandCard'
import { getHandCardDef } from '@data/HandCards'
import type { EmberTier, SpawnWeights } from '@systems/EmberSystem'
import { EmberSystem } from '@systems/EmberSystem'
import { ENEMY_DEFINITIONS, TRAP_DEFINITIONS, MIMIC_BY_SPAN } from '@systems/CardSpawner'
import { HAND_CARD_DEFINITIONS, HAND_CARD_IDS } from '@data/HandCards'
import { getRelicDef, RELIC_DEFINITIONS, type RelicCostOption, type RelicId } from '@data/Relics'
import { RECIPES } from '@data/Recipes'
import { SquareBurst, type BurstTheme } from '@ui/SquareBurst'
import {
  bookIcon,
  candleIcon,
  coinIcon,
  flameIcon,
  heartIcon,
  pouchIcon,
  shieldIcon,
  swordIcon,
} from '@ui/Icons'

export interface CardActionDetail {
  laneIndex: number
  distance: number
  card: Card
}

export interface ItemActionDetail {
  itemIndex: number
  shiftKey?: boolean
}

export interface ShopBuyDetail {
  relicId: RelicId
  costIndex: number
}

export interface ShopOfferView {
  relicId: RelicId
  purchased?: boolean
}

export interface ActivityLogEntry {
  id: number
  label: string
  scoreDelta?: number
  itemCount?: number
  badge?: string
  kind:
    | 'enemy'
    | 'treasure'
    | 'trap'
    | 'item'
    | 'item-gain'
    | 'score'
    | 'notice'
    | 'win'
    | 'hurt'
    | 'melt'
    | 'gauge'
    | 'relic'
}

export interface HandTargetingMode {
  slotIndex: number
  defId: HandCardId
}

export interface ChainEventBase {
  /** Stable per-event id so the renderer can detect new entries and pop-in
   *  the right one without re-firing the animation on every render. */
  uid: string
}
export interface ChainEventCard extends ChainEventBase {
  kind: 'card'
  defId: HandCardId
  name: string
  category: HandCategory
}
export interface ChainEventRecipe extends ChainEventBase {
  kind: 'recipe'
  recipeId: string
  name: string
  flavor: string
}
export interface ChainEventGauge extends ChainEventBase {
  kind: 'gauge'
  mode: CandleMode
  name: string
  flavor: string
}
export interface ChainEventRelic extends ChainEventBase {
  kind: 'relic'
  relicId: RelicId
  name: string
  flavor: string
}
export type ChainEvent = ChainEventCard | ChainEventRecipe | ChainEventGauge | ChainEventRelic

export interface ChainHints {
  events: ChainEvent[]
  /** Slots whose next click would immediately satisfy at least one recipe. */
  recipeReadyBySlot?: Record<number, { id: string; name: string; flavor: string }[]>
}

export interface ScorePanelState {
  score: number
  logs: ActivityLogEntry[]
  canSpend: boolean
  spendCost: number
  scorePulseKey: number
  coins: number
  coinPulseKey: number
  emberTier?: EmberTier
  spawnWeights?: SpawnWeights
  emberDecayCountdown?: number
  vignetteIntensity?: number
  chainHints?: ChainHints
  pendingHandTarget?: HandTargetingMode | null
}

export class GameBoardRenderer {
  private boardElement: HTMLElement
  private selected: { laneIndex: number; distance: number } | null = null
  private currentGameState: GameState | null = null
  private hasRendered = false
  private previousCardIds = new Set<string>()
  private previousGroupSpans = new Map<string, number>()
  /** Hand-card UIDs from the previous render — used to mark only NEW cards
   *  with `is-entering` so the drop animation does not re-fire on every full
   *  re-render of the hand panel. */
  private previousHandUids = new Set<string>()
  /** Same idea for the chain banner — track per-event uids so only newly
   *  appended chain entries play their pop-in animation. */
  private previousChainUids = new Set<string>()
  private handTargetingMode: HandTargetingMode | null = null
  /** Body-level shop overlay is kept outside board re-renders. */
  private shopOverlayElement: HTMLElement | null = null

  constructor(containerId: string = 'game-board') {
    const container = document.getElementById(containerId)
    if (!container) {
      throw new Error(`Container ${containerId} not found`)
    }
    this.boardElement = container
  }

  /** Toggle the UI overlay used while a targeted hand card is awaiting a board click. */
  setHandTargetingMode(mode: HandTargetingMode | null): void {
    this.handTargetingMode = mode
    this.clearSelection()
  }

  render(gameState: GameState, scorePanel: ScorePanelState): void {
    const previousRects = this.captureCardRects()
    this.currentGameState = gameState
    const character = gameState.getCharacter()
    const lanes = gameState.getLanes()
    const turn = gameState.getCurrentTurn()

    if (this.selected) {
      const lane = lanes[this.selected.laneIndex]
      if (!lane || !lane.getCardAtDistance(this.selected.distance)) {
        this.selected = null
      }
    }

    this.boardElement.innerHTML = `
      <div class="turn-overlay" aria-hidden="true">
        <div class="turn-overlay-inner">
          <span class="turn-overlay-kicker">Turn</span>
          <span class="turn-overlay-number">${turn}</span>
        </div>
      </div>
      ${this.renderEmberHud(scorePanel)}
      <div class="game-shell">
        <aside class="left-panel" aria-label="Brand and score">
          <header class="brand">
            <span class="brand-icon">${candleIcon()}</span>
            <span class="brand-text">Unmelting</span>
          </header>
          ${this.renderScorePanel(scorePanel)}
        </aside>
        <main class="stage">
          <section class="rail" aria-label="Card rail">
            ${this.renderRail(lanes)}
          </section>

          ${this.renderPlayerZone(character)}
        </main>

        ${this.renderHand(character, scorePanel)}
      </div>
      ${this.renderVignette(scorePanel)}
    `

    this.injectStyles()
    this.attachListeners()
    this.animateMovedCards(previousRects)
    this.rememberRenderedCards()
    // Floating chain banner (body-mounted, above the player profile).
    this.updateChainBanner(scorePanel.chainHints)
  }

  clearSelection(): void {
    this.selected = null
  }

  private renderScorePanel(scorePanel: ScorePanelState): string {
    const logs =
      scorePanel.logs.length > 0
        ? scorePanel.logs
            .map((log) => {
              // Score rows keep the old +/- number, while item rows use a
              // compact acquisition count in the same right-side badge slot.
              const deltaText =
                typeof log.scoreDelta === 'number'
                  ? `${log.scoreDelta >= 0 ? '+' : ''}${log.scoreDelta}`
                  : log.itemCount && log.itemCount > 1
                    ? `${log.itemCount}개`
                    : log.badge
                      ? log.badge
                      : '획득'
              return `
          <div class="score-log score-log-${log.kind}">
            <span class="score-log-label">${log.label}</span>
            <span class="score-log-delta">${deltaText}</span>
          </div>
        `
            })
            .join('')
        : '<div class="score-log-empty">아직 기록된 행동이 없어</div>'
    const spendDisabled = scorePanel.canSpend ? '' : 'disabled'
    const scorePulseClass = scorePanel.scorePulseKey > 0 ? 'is-score-popping' : ''
    const coinPulseClass = scorePanel.coinPulseKey > 0 ? 'is-score-popping' : ''

    return `
      <aside class="score-panel" aria-label="Action score panel">
        <section class="score-panel-total">
          <div class="score-kicker">
            <span class="score-kicker-icon">${coinIcon()}</span>
            종합 점수
          </div>
          <div class="score-number ${scorePulseClass}" data-score-pulse="${scorePanel.scorePulseKey}">
            ${scorePanel.score.toLocaleString()}
          </div>
        </section>
        <section class="coin-panel-total" aria-label="Shop currency">
          <div class="score-kicker">
            <span class="score-kicker-icon">${coinIcon()}</span>
            상점 화폐
          </div>
          <div class="coin-number ${coinPulseClass}" data-coin-pulse="${scorePanel.coinPulseKey}">
            ${scorePanel.coins.toLocaleString()} $
          </div>
        </section>
        <section class="score-log-list" aria-label="Action history">
          ${logs}
        </section>
        <div class="panel-actions">
          <button class="score-spend-btn" type="button" ${spendDisabled}>
            점수 ${scorePanel.spendCost}로 아이템 변환
          </button>
        </div>
      </aside>
    `
  }

  private renderRail(lanes: Lane[]): string {
    const rows: string[] = []
    for (let distance = LANE_DISTANCE_COUNT - 1; distance >= 0; distance--) {
      rows.push(this.renderRow(lanes, distance))
    }
    return rows.join('')
  }

  private renderRow(lanes: Lane[], distance: number): string {
    const isActive = distance === 0
    const rowClass = `rail-row dist-${distance} ${isActive ? 'active' : 'upcoming'}`

    const cells: string[] = []
    let i = 0
    while (i < lanes.length) {
      const card = lanes[i].getCardAtDistance(distance)
      if (!card) {
        cells.push(this.renderEmptyCell(i, distance))
        i++
        continue
      }

      // Detect span across consecutive same Card instances.
      // Only apply grouping to active row (distance 0); preview rows always render individually.
      let span = 1
      if (isActive) {
        while (i + span < lanes.length && lanes[i + span].getCardAtDistance(distance) === card) {
          span++
        }
      }
      cells.push(this.renderCardCell(card, i, distance, span, isActive))
      i += span
    }

    return `<div class="${rowClass}">${cells.join('')}</div>`
  }

  private renderCardCell(
    card: Card,
    laneIndex: number,
    distance: number,
    span: number,
    isActive: boolean
  ): string {
    const isSelected =
      !!this.selected &&
      this.selected.distance === distance &&
      this.selected.laneIndex >= laneIndex &&
      this.selected.laneIndex < laneIndex + span

    // While a targeted hand card is armed, distinguish valid targets from
    // blocked cells. The blocked state renders the shared red X overlay so
    // enemies-only cards visibly reject chests/traps, and front-only cards
    // visibly reject the waiting rows.
    const isValidHandTarget = this.isValidHandTarget(card, distance)
    const isBlockedHandTarget = this.handTargetingMode !== null && !isValidHandTarget

    const classes = [
      'cell',
      'card',
      `type-${card.type}`,
      card.type === CardType.TRAP ? `trap-${card.trapKind}` : '',
      card.type === CardType.TRAP && card.isBombArmed ? 'is-bomb-armed' : '',
      isActive ? 'is-active' : 'is-preview',
      isSelected ? 'is-selected' : '',
      isValidHandTarget ? 'is-hand-target' : '',
      isBlockedHandTarget ? 'is-hand-target-blocked' : '',
      span > 1 ? 'is-grouped' : '',
      this.hasRendered && !this.previousCardIds.has(card.id) ? 'is-entering' : '',
      this.shouldAnimateGroup(card.id, span) ? 'is-newly-grouped' : '',
      card.isFrozen() ? 'is-frozen' : '',
    ]
      .filter(Boolean)
      .join(' ')

    const styleSpan = span > 1 ? `style="grid-column: span ${span};"` : ''
    const tabIndex = isActive ? '0' : '-1'

    return `
      <div class="${classes}"
           ${styleSpan}
           data-lane="${laneIndex}"
           data-distance="${distance}"
           data-span="${span}"
           data-card-id="${card.id}"
           role="button"
           tabindex="${tabIndex}">
        ${this.renderCardFace(card, span)}
        ${isBlockedHandTarget ? this.renderBlockedTargetMark() : ''}
      </div>
    `
  }

  /** Render an empty rail cell, including target-block feedback during hand targeting. */
  private renderEmptyCell(laneIndex: number, distance: number): string {
    const isBlockedHandTarget = this.handTargetingMode !== null
    const classes = ['cell', 'empty', isBlockedHandTarget ? 'is-hand-target-blocked' : '']
      .filter(Boolean)
      .join(' ')
    return `
      <div class="${classes}"
           data-lane="${laneIndex}"
           data-distance="${distance}"
           aria-hidden="true">
        ${isBlockedHandTarget ? this.renderBlockedTargetMark() : ''}
      </div>
    `
  }

  /** Shared target validation mirror for preview/UI hints. HandSystem remains authoritative. */
  private isValidHandTarget(card: Card, distance: number): boolean {
    if (!this.handTargetingMode) return false
    const def = getHandCardDef(this.handTargetingMode.defId)
    return this.isValidTargetRule(def.targeting.base, card, distance)
  }

  /** Check a hand target rule without mutating game state. */
  private isValidTargetRule(rule: HandEffectTargeting, card: Card, distance: number): boolean {
    if (rule.selection !== 'target') return false
    if (rule.zone === 'front' && distance !== 0) return false
    if (rule.zone === 'waiting' && distance === 0) return false
    if (rule.zone !== 'front' && rule.zone !== 'waiting' && rule.zone !== 'field') return false
    if (rule.filter === 'enemy') return card.type === CardType.ENEMY
    if (rule.filter === 'trap') return card.type === CardType.TRAP
    if (rule.filter === 'treasure') return card.type === CardType.TREASURE
    if (rule.filter === 'enemy-or-treasure') {
      return card.type === CardType.ENEMY || card.type === CardType.TREASURE
    }
    if (rule.filter === 'hazard') return card.type === CardType.TRAP || card.isFrozen()
    if (rule.filter === 'any') return true
    return false
  }

  /** Existing red X language, extracted so 1/2/3-slot cards and empty cells share it. */
  private renderBlockedTargetMark(): string {
    return `<div class="trap-block-mark target-block-mark" aria-hidden="true">×</div>`
  }

  private renderCardFace(card: Card, span: number): string {
    let stats = ''
    if (card.type === CardType.ENEMY) {
      stats = `
        <div class="card-stats">
          <span class="stat hp">${heartIcon()}<span class="stat-value">${card.getHealth()}</span></span>
          <span class="stat atk">${swordIcon()}<span class="stat-value">${card.getDamage()}</span></span>
        </div>
      `
    } else if (card.type === CardType.TRAP) {
      if (card.trapKind === 'bomb') {
        stats = `<div class="card-stats danger">${card.isBombArmed ? '점화' : '폭발'}</div>`
      } else if (card.groupCount >= 3 && card.trapKind !== 'spore') {
        stats = `<div class="card-stats danger">즉사</div>`
      } else {
        stats = `<div class="card-stats danger">피해 ${card.getTrapDamagePenalty()}</div>`
      }
    } else if (card.type === CardType.TREASURE && card.groupCount > 1) {
      const mult = card.groupCount === 2 ? 'x2' : 'x3'
      stats = `<div class="card-stats good">보상 ${mult}</div>`
    }

    const groupBadge = span > 1 ? `<div class="group-badge">×${span}</div>` : ''
    const frozenBadge = card.isFrozen()
      ? `<div class="frozen-badge">굳음 ${card.frozenTurns}</div>`
      : ''
    const trapBadge =
      card.type === CardType.TRAP && card.trapKind === 'bomb' && card.isBombArmed
        ? `<div class="frozen-badge bomb-badge">점화</div>`
        : card.type === CardType.TRAP && card.trapKind === 'spore'
          ? `<div class="frozen-badge spore-badge">번식 ${card.sporeTurnsUntilSpread}</div>`
          : ''

    const groupName = span > 1 && !card.isSpecialEnemy ? this.groupName(card.type, span) : card.name

    const sprite = spriteForCard(card)
    const artStyle = sprite ? `style="background-image: url('${sprite}')"` : ''

    return `
      ${groupBadge}
      ${frozenBadge}
      ${trapBadge}
      <div class="card-face">
        <div class="card-art" ${artStyle} aria-hidden="true"></div>
        <div class="card-overlay" aria-hidden="true"></div>
        <div class="card-content">
          <div class="card-name">${groupName}</div>
          ${stats}
        </div>
      </div>
    `
  }

  private groupName(type: CardType, span: number): string {
    if (span <= 1) return ''
    if (type === CardType.ENEMY) return span === 2 ? '적 무리' : '거대 적 무리'
    if (type === CardType.TRAP) return span === 2 ? '함정 무리' : '거대 함정'
    if (type === CardType.TREASURE) return span === 2 ? '적당한 상자' : '큰 상자'
    return ''
  }

  private renderPlayerZone(character: Character): string {
    return `
      <div class="player-zone" aria-label="Player controls and relic plan">
        <div class="utility-layer utility-layer-left" aria-label="Utility buttons">
          <button class="compendium-btn compendium-btn-floating" type="button" data-open-compendium aria-label="도감 열기">
            <span class="compendium-btn-icon" aria-hidden="true">${bookIcon()}</span>
            <span class="compendium-btn-label">도감</span>
          </button>
        </div>
        ${this.renderPlayer(character)}
        <div class="utility-layer relic-layer" aria-label="Owned relics">
          ${this.renderRelicLayer(character)}
        </div>
      </div>
    `
  }

  /** Render owned relics as compact card previews beside the player. */
  private renderRelicLayer(character: Character): string {
    if (character.relics.length === 0) {
      return `<span class="relic-plan-label">유물 없음<br>상점 대기</span>`
    }
    const relics = character.relics.map((id) => this.renderRelicMiniCard(id)).join('')
    return `<div class="relic-stack" aria-label="보유 유물">${relics}</div>`
  }

  /** Small owned-relic chip: the rail shows only the illustration while the
   *  hidden hover card carries all readable relic details. */
  private renderRelicMiniCard(id: RelicId): string {
    const def = getRelicDef(id)
    return `
      <article class="relic-mini-card" aria-label="${def.name}: ${def.effect}">
        <div class="relic-mini-art" style="background-image: url('${spriteForRelic(id)}')" aria-hidden="true"></div>
        <div class="relic-hover-preview" style="--hand-card-back: url('${SpriteUrls.cardBack}');" aria-hidden="true">
          ${this.relicPreviewFace(def.id)}
        </div>
      </article>
    `
  }

  /** Full relic hover face, intentionally separate from hand cards so the
   *  preview reads as a wax-sealed artifact card rather than a playable card. */
  private relicPreviewFace(id: RelicId): string {
    const def = getRelicDef(id)
    return this.commonCardFace({
      artUrl: spriteForRelic(id),
      name: def.name,
      description: `${def.effect}<br><span class="common-card-subdesc">${def.flavor}</span>`,
      extraClass: 'relic-preview-card',
      badge: '유물',
    })
  }

  private renderPlayer(character: Character): string {
    const hpPct = Math.max(0, Math.min(100, (character.health / character.maxHealth) * 100))
    return `
      <div class="player-row">
        <div class="player-card">
          ${character.shield > 0 ? `<span class="shield-badge" aria-label="방패 ${character.shield}"><span class="shield-badge-icon">${shieldIcon()}</span><span class="shield-badge-value">${character.shield}</span></span>` : ''}
          <div class="player-art" style="background-image: url('${SpriteUrls.player}')" aria-hidden="true"></div>
          <div class="player-overlay" aria-hidden="true"></div>
          <div class="player-content">
            <div class="player-name">${character.name}</div>
            <div class="player-stats">
              <div class="hp-bar">
                <div class="hp-fill" style="width: ${hpPct}%"></div>
                <span class="hp-text">
                  <span class="hp-text-icon">${heartIcon()}</span>
                  ${character.health}/${character.maxHealth}
                </span>
              </div>
              <div class="atk-stat">
                <span class="atk-stat-icon">${swordIcon()}</span>
                ${character.damage}
              </div>
            </div>
          </div>
        </div>
      </div>
    `
  }

  private categoryClass(cat: HandCategory): string {
    return `hand-cat-${cat}`
  }

  /** Shared card face used by hover previews and the compendium. It accepts
   *  arbitrary art so field-card codex entries can follow the exact hand-card
   *  frame without scaling the original sprite data. */
  private commonCardFace(opts: {
    artUrl: string
    name: string
    description: string
    extraClass?: string
    badge?: string
  }): string {
    const badgeHtml = opts.badge ? `<span class="common-card-badge">${opts.badge}</span>` : ''
    return `
      <article class="common-card-face ${opts.extraClass ?? ''}" style="--hand-card-art: url('${opts.artUrl}'); --hand-card-back: url('${SpriteUrls.cardBack}');">
        <div class="common-card-art" aria-hidden="true">
          <img src="${opts.artUrl}" alt="" loading="lazy" />
        </div>
        <div class="common-card-body">
          <header class="common-card-title-row">
            <span class="common-card-name">${opts.name}</span>
            ${badgeHtml}
          </header>
          <p class="common-card-desc">${opts.description}</p>
        </div>
      </article>
    `
  }
  /** Hand-card convenience wrapper keeps merged-star naming in one place while
   *  still delegating the actual visual frame to commonCardFace(). */
  private handCardFace(
    defId: HandCardId,
    description: string,
    merged = false,
    extraClass = '',
    badge?: string
  ): string {
    const def = getHandCardDef(defId)
    return this.commonCardFace({
      artUrl: spriteForHandCard(defId),
      name: `${def.name}${merged ? ' ★' : ''}`,
      description,
      extraClass,
      badge,
    })
  }

  /** Field-card compendium wrapper converts stat rows into compact effect text
   *  so enemies, traps, and treasures use the same large-name card template as
   *  playable hand cards. */
  private fieldCardFace(opts: {
    artUrl: string
    name: string
    badge: string
    stats: [string, string][]
    description: string
  }): string {
    const statText = opts.stats
      .map(([label, value]) => `<span class="common-card-subdesc">${label}</span> ${value}`)
      .join('<br>')
    return this.commonCardFace({
      artUrl: opts.artUrl,
      name: opts.name,
      badge: opts.badge,
      description: `${statText}<br>${opts.description}`,
      extraClass: 'compendium-field-card',
    })
  }

  /** Read hand-effect reach from the shared gameplay table for codex rows. */
  private handEffectScope(defId: HandCardId, merged = false): HandEffectTargeting {
    const def = getHandCardDef(defId)
    return merged ? def.targeting.triple : def.targeting.base
  }

  /** Korean labels for the shared hand-effect scope table shown in the compendium. */
  private handScopeLabel(defId: HandCardId, merged = false): string {
    const scope = this.handEffectScope(defId, merged)
    const selectionLabel =
      scope.selection === 'target'
        ? '대상'
        : scope.selection === 'random'
          ? '랜덤'
          : scope.selection === 'all'
            ? '전체'
            : '없음'
    const zoneLabel =
      scope.zone === 'front'
        ? '전방'
        : scope.zone === 'waiting'
          ? '대기'
          : scope.zone === 'field'
            ? '필드'
            : scope.zone === 'self'
              ? '자신'
              : scope.zone === 'hand'
                ? '손패'
                : '없음'
    const countLabel = scope.countLimit === null ? '제한 없음' : `${scope.countLimit}개`
    return `선택 ${selectionLabel} · 범위 ${zoneLabel} · 개수 ${countLabel}`
  }

  /** Compact two-line scope summary so balance changes remain visible in the codex. */
  private handScopeDescription(defId: HandCardId): string {
    return `<span class="common-card-subdesc">기본: ${this.handScopeLabel(defId)}</span><br><span class="common-card-subdesc">★: ${this.handScopeLabel(defId, true)}</span>`
  }
  private candleModeMeta(mode: CandleMode): { label: string; effect: string; icon: string } {
    switch (mode) {
      case 'max-health':
        return { label: '체력', effect: '최대 체력 +5', icon: heartIcon() }
      case 'attack':
        return { label: '공격', effect: '공격력 +1', icon: swordIcon() }
      case 'ember':
        return { label: '불씨', effect: '불씨 +3', icon: flameIcon() }
      case 'draw':
        return { label: '손패', effect: '랜덤 3장', icon: pouchIcon() }
    }
  }

  /**
   * Render the 10-slot bottom-up hand stack. Slot 0 (model) is the bottom of
   * the stack; slot HAND_MAX-1 is the top. Empty slots above the hand are
   * still rendered as outlines so falling animations have a target column.
   */
  private renderHand(character: Character, scorePanel: ScorePanelState): string {
    const slots: string[] = []
    const handMax = character.handMax || 10
    const targeting = scorePanel.pendingHandTarget ?? this.handTargetingMode

    // Build each slot bottom-up in MODEL order (slot 0 first), then we render
    // the column reversed so slot 0 displays at the bottom.
    for (let i = 0; i < handMax; i++) {
      const card = character.hand[i]
      if (!card) {
        slots.push(`<li class="hand-slot is-empty" data-slot-index="${i}" aria-hidden="true"></li>`)
        continue
      }
      const def = getHandCardDef(card.defId)
      const isArming = targeting && targeting.slotIndex === i
      const readyRecipes = scorePanel.chainHints?.recipeReadyBySlot?.[i] ?? []
      const recipeReady = readyRecipes.length > 0
      const recipeReadyTitle = recipeReady
        ? `즉시 조합: ${readyRecipes.map((r) => r.name).join(', ')}`
        : ''
      // Recipe previews sit left of the normal card hover preview, giving the
      // player the recipe name/effect before they commit to the glowing slot.
      const recipePreviewHtml = recipeReady
        ? `<aside class="hand-recipe-preview" aria-hidden="true">
            <span class="hand-recipe-preview-kicker">발동 조합</span>
            ${readyRecipes
              .map(
                (recipe) => `
                  <span class="hand-recipe-preview-row">
                    <strong>${recipe.name}</strong>
                    <em>${recipe.flavor}</em>
                  </span>
                `
              )
              .join('')}
          </aside>`
        : ''
      const merged = card.merged ? 'is-merged' : ''
      // Only mark a hand card as `is-entering` when its uid wasn't present
      // in the previous render. This keeps the drop animation a *real* entry
      // beat instead of re-firing on every panel re-render.
      const isNew = !this.previousHandUids.has(card.uid)
      const classes = [
        'hand-slot',
        'hand-card',
        this.categoryClass(def.category),
        merged,
        isArming ? 'is-arming-target' : '',
        recipeReady ? 'is-recipe-ready' : '',
        // Lower hand slots sit close to the viewport bottom, so their hover
        // previews are anchored upward to keep the full card readable.
        i <= 2 ? 'is-low-preview' : '',
        isNew ? 'is-entering' : '',
      ]
        .filter(Boolean)
        .join(' ')
      const description = card.merged ? def.tripleDescription : def.description
      const handArt = spriteForHandCard(card.defId)
      slots.push(`
        <li class="${classes}" data-slot-index="${i}" data-hand-uid="${card.uid}"
            ${recipeReadyTitle ? `title="${recipeReadyTitle}"` : ''}>
          <button type="button" data-item-index="${i}"
                  style="--hand-card-art: url('${handArt}');"
                  aria-label="${def.name}: ${description}${recipeReadyTitle ? ` · ${recipeReadyTitle}` : ''}">
            ${recipeReady ? '<span class="recipe-ready-mark" aria-hidden="true">✦</span>' : ''}
            ${card.merged ? '<span class="merged-mark" aria-hidden="true">✦</span>' : ''}
            <span class="hand-card-thumb" aria-hidden="true">
              <img src="${handArt}" alt="" loading="lazy" />
            </span>
            <span class="hand-card-name">${def.name}${card.merged ? ' ★' : ''}</span>
          </button>
          <div class="hand-card-preview" style="--hand-card-back: url('${SpriteUrls.cardBack}');" aria-hidden="true">
            ${this.handCardFace(card.defId, description, card.merged)}
          </div>
          ${recipePreviewHtml}
        </li>
      `)
    }

    // Reverse so slot 0 sits at the bottom of the visual stack.
    const reversed = slots.slice().reverse().join('')

    // Targeting helper used to live as a row inside the hand panel, but with
    // a partially filled hand that pushed the UI around as it appeared and
    // disappeared. Now the prompt floats at the *top center of the viewport*
    // (see updateTargetBanner / .target-banner) so it never shifts layout.
    this.updateTargetBanner(targeting)

    const candle = character.candle ?? 0
    const candleMax = character.candleMax ?? 10
    const candlePct = Math.max(0, Math.min(100, (candle / candleMax) * 100))
    const mode = this.candleModeMeta(character.candleMode ?? 'max-health')
    const ticks = Array.from({ length: candleMax }, (_, idx) => {
      const filled = idx < candle ? 'is-filled' : ''
      return `<span class="candle-gauge-tick ${filled}" aria-hidden="true"></span>`
    }).join('')

    return `
      <aside class="hand-panel" aria-label="Hand">
        <header class="hand-header">
          <span class="hand-header-icon">${pouchIcon()}</span>
          손패 (${character.hand.length}/${handMax})
        </header>
        <div class="candle-gauge" aria-label="10칸 손패 게이지">
          <button class="candle-mode-btn" type="button" data-cycle-candle-mode title="모드 변경: ${mode.effect}">
            <span class="candle-mode-icon">${mode.icon}</span>
            <span class="candle-mode-label">${mode.label}</span>
          </button>
          <div class="candle-gauge-body">
            <div class="candle-gauge-meter" style="--candle-fill: ${candlePct}%">
              ${ticks}
            </div>
            <div class="candle-gauge-label">${candle}/${candleMax} · ${mode.effect}</div>
          </div>
        </div>
        <ul class="hand-stack ${character.hand.length >= 8 ? 'is-crowded' : ''}" style="--hand-count: ${character.hand.length}">${reversed}</ul>
      </aside>
    `
  }

  /** Human-readable resource labels for shop cost buttons. */
  private relicCostLabel(cost: RelicCostOption): string {
    if (cost.resource === 'coin') return `${cost.amount}$`
    if (cost.resource === 'maxHealth') return `최대체력 -${cost.amount}`
    return `공격력 -${cost.amount}`
  }

  /** Whether the current character/wallet can pay a given shop cost. */
  private canPayRelicCost(cost: RelicCostOption, coins: number, character: Character): boolean {
    if (cost.resource === 'coin') return coins >= cost.amount
    if (cost.resource === 'maxHealth') return character.maxHealth - cost.amount >= 1
    return character.damage - cost.amount >= 1
  }

  /** Shop card layout: illustration, title, effect, then one button per cost option. */
  private renderShopRelicCard(offer: ShopOfferView, coins: number, character: Character): string {
    const def = RELIC_DEFINITIONS[offer.relicId]
    const costButtons = def.costOptions
      .map((cost, index) => {
        const disabled = offer.purchased || !this.canPayRelicCost(cost, coins, character)
        const label = offer.purchased ? '구매 완료' : this.relicCostLabel(cost)
        return `
          <button class="shop-buy-btn" type="button" data-shop-buy="${def.id}" data-cost-index="${index}" ${disabled ? 'disabled' : ''}>
            ${label}
          </button>
        `
      })
      .join('')
    return `
      <article class="shop-relic-card ${offer.purchased ? 'is-purchased' : ''}">
        <div class="shop-relic-art" style="background-image: url('${spriteForRelic(def.id)}')" aria-hidden="true"></div>
        <div class="shop-relic-body">
          <h3 class="shop-relic-title">${def.name}</h3>
          <p class="shop-relic-effect">${def.effect}</p>
          <p class="shop-relic-flavor">${def.flavor}</p>
        </div>
        <div class="shop-cost-row">${costButtons}</div>
      </article>
    `
  }

  /** Build or refresh the modal shop after the 10-turn rail shutter. */
  openShop(offers: ShopOfferView[], coins: number, character: Character): void {
    if (!this.shopOverlayElement) {
      this.shopOverlayElement = document.createElement('div')
      this.shopOverlayElement.id = 'shop-overlay'
      this.shopOverlayElement.className = 'shop-overlay'
      this.shopOverlayElement.addEventListener('click', (e) => {
        const t = e.target as HTMLElement
        if (t.dataset.shopClose !== undefined || t === this.shopOverlayElement) {
          document.dispatchEvent(new CustomEvent('shopClose'))
          return
        }
        const relicId = t.dataset.shopBuy as RelicId | undefined
        if (!relicId) return
        const costIndex = parseInt(t.dataset.costIndex || '0', 10)
        document.dispatchEvent(
          new CustomEvent<ShopBuyDetail>('shopBuy', { detail: { relicId, costIndex } })
        )
      })
      document.body.appendChild(this.shopOverlayElement)
    }

    const cards =
      offers.length > 0
        ? offers.map((offer) => this.renderShopRelicCard(offer, coins, character)).join('')
        : '<div class="shop-empty">오늘의 잡화는 모두 팔렸어.</div>'
    this.shopOverlayElement.innerHTML = `
      <div class="shop-shell" role="dialog" aria-label="모험 잡화 생쥐 상점">
        <button class="shop-close-btn shop-close-tab" type="button" data-shop-close aria-label="상점 나가기">Exit</button>
        <div class="shop-modal">
          <header class="shop-header">
            <div>
              <span class="shop-kicker">쿠궁! 레일 정차</span>
              <h2>모험 잡화 생쥐</h2>
            </div>
            <div class="shop-wallet">${coinIcon()} ${coins}$</div>
          </header>
          <p class="shop-intro">랜덤 유물 3개가 진열됐어. 돈 대신 최대체력이나 공격력을 내는 물건도 있어.</p>
          <section class="shop-grid" aria-label="상점 유물 목록">${cards}</section>
        </div>
      </div>
    `
    this.shopOverlayElement.classList.add('is-open')
  }

  /** Hide the modal shop without destroying purchased state in index.ts. */
  closeShop(): void {
    this.shopOverlayElement?.classList.remove('is-open')
  }

  /** 10-turn shop transition: rail quake, 3×3 shutter closes, then opens. */
  playShopTransition(): Promise<void> {
    const rail = this.boardElement.querySelector<HTMLElement>('.rail')
    if (!rail) return Promise.resolve()
    const shutter = document.createElement('div')
    shutter.className = 'rail-shutter'
    shutter.setAttribute('aria-hidden', 'true')
    shutter.innerHTML = Array.from(
      { length: 9 },
      (_, i) => `<span style="--shutter-i:${i}"></span>`
    ).join('')
    rail.appendChild(shutter)
    rail.classList.add('is-shop-quaking')
    return new Promise((resolve) => {
      window.setTimeout(() => rail.classList.remove('is-shop-quaking'), 520)
      window.setTimeout(() => shutter.classList.add('is-opening'), 900)
      window.setTimeout(() => {
        shutter.remove()
        resolve()
      }, 1450)
    })
  }

  /** Open the compendium overlay listing every field-card + hand-card def
   *  with stats and descriptions. Pure read-only browser; pressing the
   *  close button or ESC dismisses. */
  openCompendium(): void {
    let host = document.getElementById('compendium-overlay') as HTMLElement | null
    if (!host) {
      host = document.createElement('div')
      host.id = 'compendium-overlay'
      host.className = 'compendium-overlay'
      document.body.appendChild(host)
      host.addEventListener('click', (e) => {
        const t = e.target as HTMLElement
        if (t.dataset.compendiumClose !== undefined || t === host) {
          this.closeCompendium()
        }
        if (t.dataset.compendiumTab) {
          this.switchCompendiumTab(t.dataset.compendiumTab)
        }
      })
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && host?.classList.contains('is-open')) {
          this.closeCompendium()
        }
      })
    }
    host.innerHTML = this.renderCompendium('enemies')
    this.attachCompendiumRecipeFloat(host)
    host.classList.add('is-open')
  }

  private closeCompendium(): void {
    document.querySelectorAll('.compendium-recipe-float').forEach((el) => el.remove())
    document.getElementById('compendium-overlay')?.classList.remove('is-open')
  }

  private switchCompendiumTab(tab: string): void {
    const host = document.getElementById('compendium-overlay')
    if (!host) return
    document.querySelectorAll('.compendium-recipe-float').forEach((el) => el.remove())
    host.innerHTML = this.renderCompendium(tab)
    this.attachCompendiumRecipeFloat(host)
  }

  private renderCompendium(activeTab: string): string {
    const tabs: { id: string; label: string }[] = [
      { id: 'enemies', label: '적' },
      { id: 'traps', label: '함정' },
      { id: 'treasures', label: '보물' },
      { id: 'hand', label: '손패' },
      { id: 'combo', label: '조합' },
      { id: 'relics', label: '유물' },
      { id: 'terms', label: '용어' },
    ]
    const tabBar = tabs
      .map(
        (t) =>
          `<button class="compendium-tab ${t.id === activeTab ? 'is-active' : ''}" data-compendium-tab="${t.id}">${t.label}</button>`
      )
      .join('')
    let body = ''
    if (activeTab === 'enemies') body = this.renderCompendiumEnemies()
    else if (activeTab === 'traps') body = this.renderCompendiumTraps()
    else if (activeTab === 'treasures') body = this.renderCompendiumTreasures()
    else if (activeTab === 'hand') body = this.renderCompendiumHand()
    else if (activeTab === 'combo') body = this.renderCompendiumCombo()
    else if (activeTab === 'relics') body = this.renderCompendiumRelics()
    else body = this.renderCompendiumTerms()
    return `
      <div class="compendium-modal" role="dialog" aria-label="도감">
        <header class="compendium-header">
          <h2 class="compendium-title">
            <span class="compendium-title-icon">${bookIcon()}</span>
            도감
          </h2>
          <button class="compendium-close" data-compendium-close type="button" aria-label="닫기">✕</button>
        </header>
        <nav class="compendium-tabs" role="tablist">${tabBar}</nav>
        <section class="compendium-body" role="tabpanel">${body}</section>
        <footer class="compendium-footer">ESC 또는 바깥 클릭으로 닫기</footer>
      </div>
    `
  }

  private renderCompendiumEnemies(): string {
    const stackStats = (hp: number, atk: number, span: number): [string, string][] => {
      // Compendium rows show a same-enemy example of the real field rule:
      // sum each member, then add +2/+2 for 2칸 or +3/+3 for 3칸.
      const widthBonus = span === 2 ? 2 : span >= 3 ? 3 : 0
      return [
        [`${span}칸 HP`, String(hp * span + widthBonus)],
        [`${span}칸 ATK`, String(atk * span + widthBonus)],
      ]
    }
    const normal = ENEMY_DEFINITIONS.map((def) => {
      const baseHp = def.healthOrDamage ?? 1
      const baseAtk = def.attack ?? 1
      const spriteUrl = def.enemySpriteId ? SpriteUrls[def.enemySpriteId] : SpriteUrls.enemyMouse
      return this.fieldCardFace({
        artUrl: spriteUrl,
        name: def.name,
        badge: '기본 적',
        stats: [
          ['HP', String(baseHp)],
          ['ATK', String(baseAtk)],
        ],
        description: def.description,
      })
    }).join('')
    const groupRows: [string, string][] = ENEMY_DEFINITIONS.flatMap((def) => {
      const baseHp = def.healthOrDamage ?? 1
      const baseAtk = def.attack ?? 1
      const spanTwo = stackStats(baseHp, baseAtk, 2)
      const spanThree = stackStats(baseHp, baseAtk, 3)
      // Each enemy keeps one readable line for 2칸/3칸 group effects instead
      // of spawning six separate variant cards in the tab.
      return [
        [`${def.name} 2칸`, `HP ${spanTwo[0][1]} / ATK ${spanTwo[1][1]}`],
        [`${def.name} 3칸`, `HP ${spanThree[0][1]} / ATK ${spanThree[1][1]}`],
      ]
    })
    const groupCard = this.fieldCardFace({
      artUrl: SpriteUrls.enemyMole,
      name: '적 무리',
      badge: '추가 개체',
      stats: groupRows,
      description:
        '같은 전방 라인에서 합쳐진 적 무리는 실제 구성원의 HP/ATK를 합산한 뒤 2칸은 HP/ATK +2, 3칸은 +3을 더한다. 일러스트는 가장 강한 구성원을 따라간다.',
    })
    const mimicRows: [string, string][] = [1, 2, 3].flatMap((span) => {
      const stats = MIMIC_BY_SPAN[span]
      // Mimic span variants are summarized in one Mimic entry so changing
      // lane width reads as the same creature gaining stronger effects.
      return [
        [`${span}칸 HP/ATK`, `${stats.health} / ${stats.attack}`],
        [`${span}칸 드롭`, `${stats.drops}장`],
      ]
    })
    const mimicCard = this.fieldCardFace({
      artUrl: SpriteUrls.mimic,
      name: '미믹',
      badge: '특수',
      stats: mimicRows,
      description:
        '보물 카드가 변이된 특수 적. 한 도감 칸 안에서 1/2/3칸별 능력치와 드롭량을 한 번에 비교한다.',
    })
    return `
      <h3 class="compendium-section">일반 적</h3>
      <div class="compendium-grid">${normal}${groupCard}</div>
      <h3 class="compendium-section">특수 적</h3>
      <div class="compendium-grid">${mimicCard}</div>
    `
  }

  private renderCompendiumTraps(): string {
    const baseDamage = TRAP_DEFINITIONS[0].healthOrDamage ?? 2
    const spanRows: [string, string][] = [1, 2, 3].map((span) => {
      // Trap rows intentionally mirror enemy stat rows: the name/width is on
      // the left and only sword damage is shown on the right for quick reading.
      const damage = span >= 3 ? 999 : span === 2 ? 5 : baseDamage
      return [`${span}칸`, `${swordIcon()} ${damage}`]
    })
    const card = this.fieldCardFace({
      artUrl: SpriteUrls.traps.web,
      name: TRAP_DEFINITIONS[0].name,
      badge: '함정',
      stats: spanRows,
      description: '같은 함정 한 칸 안에서 1/2/3칸 폭에 따른 충돌 피해만 표시한다.',
    })
    return `<div class="compendium-grid">${card}</div>`
  }

  private renderCompendiumTreasures(): string {
    const spanRows: [string, string][] = [1, 2, 3].flatMap((span) => {
      // Treasure rows keep the shared vanish/mimic chances visible while only
      // the drop amount changes per width.
      return [
        [`${span}칸 드롭`, `손패 ${span}장`],
        [`${span}칸 변화`, '사라짐 50%/턴 · 미믹화 10%/턴'],
      ]
    })
    const card = this.fieldCardFace({
      artUrl: SpriteUrls.chestLarge,
      name: '보물상자',
      badge: '보물',
      stats: spanRows,
      description:
        '작은/큰/거대한 상자를 별도 카드로 나누지 않고, 보물상자 한 항목에서 칸 수별 보상과 변이 확률을 비교한다.',
    })
    return `<div class="compendium-grid">${card}</div>`
  }

  private renderCompendiumHand(): string {
    const groups: Record<string, string[]> = {
      recovery: [],
      tool: [],
      control: [],
      attack: [],
    }
    const groupLabels: Record<string, string> = {
      recovery: '회복',
      tool: '도구',
      control: '컨트롤',
      attack: '공격',
    }
    for (const id of HAND_CARD_IDS) {
      const def = HAND_CARD_DEFINITIONS[id]
      groups[def.category].push(
        this.handCardFace(
          def.id,
          `${def.description}<br>${this.handScopeDescription(def.id)}<br><span class="common-card-subdesc">★ 효과: ${def.tripleDescription}</span>`,
          false,
          `compendium-hand-card ${this.categoryClass(def.category)}`,
          groupLabels[def.category]
        )
      )
    }
    return Object.entries(groups)
      .map(
        ([cat, cards]) => `
          <h3 class="compendium-section">${groupLabels[cat]}</h3>
          <div class="compendium-grid">${cards.join('')}</div>
        `
      )
      .join('')
  }

  /** Relic tab documents shop relics and which ones the current run owns. */
  private renderCompendiumRelics(): string {
    const owned = new Set(this.currentGameState?.getCharacter().relics ?? [])
    const cards = Object.values(RELIC_DEFINITIONS)
      .map((def) =>
        this.compendiumCard({
          art: { kind: 'sprite', url: spriteForRelic(def.id) },
          name: def.name,
          badge: owned.has(def.id) ? '보유 중' : '상점 유물',
          categoryClass: owned.has(def.id) ? 'compendium-relic-owned' : 'compendium-relic-card',
          stats: [
            ['효과', def.effect],
            ['비용', def.costOptions.map((cost) => this.relicCostLabel(cost)).join(' / ')],
          ],
          description: def.flavor,
        })
      )
      .join('')
    return `
      <h3 class="compendium-section">유물 (Relics)</h3>
      <p class="compendium-section-blurb">10턴마다 열리는 생쥐 상점에서 구매하는 지속 효과야. 발동한 유물은 활동 로그와 체인 배너 아래의 작은 토스트로 함께 표시된다.</p>
      <div class="compendium-grid compendium-relic-grid">${cards}</div>
    `
  }

  /**
   * Recipe mini-cards need the compendium body to scroll, but scroll containers
   * clip overflowing children. Clone the hovered stack into a fixed body-layer
   * so only that preview escapes the panel while the codex keeps its scrollbar.
   */
  private attachCompendiumRecipeFloat(host: HTMLElement): void {
    document.querySelectorAll('.compendium-recipe-float').forEach((el) => el.remove())
    let floating: HTMLElement | null = null
    const removeFloating = () => {
      // Restore the compact in-panel stack only after the detached fan preview
      // has folded away, preventing the two stacks from visually colliding.
      host
        .querySelectorAll<HTMLElement>('.compendium-card-art--recipe.is-floating')
        .forEach((el) => el.classList.remove('is-floating'))
      floating?.remove()
      floating = null
    }
    host.querySelectorAll<HTMLElement>('.compendium-card-art--recipe').forEach((art) => {
      const showFloating = () => {
        const stack = art.querySelector<HTMLElement>('.compendium-recipe-stack')
        if (!stack) return
        removeFloating()
        const rect = stack.getBoundingClientRect()
        // While the body clone is expanded, fade the original mini-cards in the
        // card art slot so the readable floating cards are not backed by ghosts.
        art.classList.add('is-floating')
        floating = stack.cloneNode(true) as HTMLElement
        floating.classList.add('compendium-recipe-float')
        floating.style.left = `${rect.left}px`
        floating.style.top = `${rect.top}px`
        floating.style.width = `${rect.width}px`
        floating.style.height = `${rect.height}px`
        floating.setAttribute('aria-hidden', 'true')
        document.body.appendChild(floating)
      }
      art.addEventListener('mouseenter', showFloating)
      art.addEventListener('focusin', showFloating)
      art.addEventListener('mouseleave', removeFloating)
      art.addEventListener('focusout', removeFloating)
    })
  }

  /** Terms tab summarizing current field, resource, and status vocabulary. */
  private renderCompendiumTerms(): string {
    const terms: [string, string][] = [
      ['필드', '플레이어 앞 3×3 그리드 레일 전체. 전방 3칸과 대기 6칸을 모두 포함한다.'],
      [
        '전방',
        '플레이어 카드와 직접 대면 중인 최전방 라인(distance 0). 일반 보드 행동은 전방만 선택한다.',
      ],
      [
        '대기',
        '전방이 아닌 준비 중인 후방 2줄(distance 1~2), 총 6칸. 필드 지정 효과는 대기 칸도 대상으로 삼을 수 있다.',
      ],
      [
        '트리플',
        '같은 손패 카드 3장이 연속으로 쌓이면 기존 ★ 강화 카드 양식으로 자동 합성되는 효과. 기획서의 3- 표기는 이 효과 설명용이다.',
      ],
      ['방패', '체력 위에 표시되는 임시 체력. 피해를 먼저 흡수하고 소모된다.'],
      [
        '굳음',
        '밀랍으로 하얗게 굳은 정지 상태. 남은 턴 동안 적 공격/보물 변동 같은 전방 이벤트가 멈춘다.',
      ],
      [
        '불씨 카운트',
        '우측 상단 불씨 자원. 성냥이 회복하며, 낮아질수록 전투/스폰 위험도가 오른다.',
      ],
      [
        '손패 콤보 카운트',
        '손패 10장 사용 시 선택한 게이지 보너스(최대 체력/공격력/불씨/손패)를 발동하는 진행도. 카드 아이템은 이 게이지를 추가로 채우며, 10칸 초과분은 다음 게이지에 남는다.',
      ],
      [
        '동전($)',
        '상점용 화폐. 현재는 점수 집계 아래 별도 지갑으로 표시되며, 추후 상점에서 사용한다.',
      ],
      ['정화', '현재 MVP에서는 저주/곰팡이 역할을 하는 함정 제거와 굳음 해제를 함께 처리한다.'],
    ]
    const cards = terms
      .map(([name, description]) =>
        this.compendiumCard({
          art: { kind: 'icon', svg: bookIcon() },
          name,
          badge: '용어',
          stats: [['정의', description]],
        })
      )
      .join('')
    return `<div class="compendium-grid">${cards}</div>`
  }

  private renderCompendiumCombo(): string {
    const synthesisIntro = `
      <article class="compendium-card compendium-card-wide">
        <div class="compendium-card-art compendium-card-art--icon">${flameIcon()}</div>
        <header class="compendium-card-head">
          <span class="compendium-card-name">자동 합성 (트리플)</span>
          <span class="compendium-card-badge">합성</span>
        </header>
        <div class="compendium-card-row"><span class="compendium-card-label">조건</span><span class="compendium-card-value">손패에 같은 카드 3장이 연속</span></div>
        <div class="compendium-card-row"><span class="compendium-card-label">결과</span><span class="compendium-card-value">즉시 1장의 ★ 강화 카드로 합쳐짐. 사용 시 트리플 효과 발동.</span></div>
        <p class="compendium-card-desc">손패 슬롯 0~9 중 인접한 3칸이 같은 종류면 자동 합성. 별도 조작 없이 발동되며, 합성된 카드는 단일 슬롯을 차지한다.</p>
      </article>
    `
    const recipeCards = RECIPES.map((r) => {
      const ingredientCards = Object.entries(r.ingredients).flatMap(([id, n]) => {
        const def = HAND_CARD_DEFINITIONS[id as HandCardId]
        if (!def) return []
        // Repeated ingredients are represented as overlapping mini hand cards
        // so combo recipes use the same visual language as the hand tab.
        return Array.from({ length: n ?? 1 }, () =>
          this.handCardFace(
            def.id,
            def.description,
            false,
            `compendium-recipe-mini ${this.categoryClass(def.category)}`
          )
        )
      })
      return this.compendiumCard({
        art: {
          kind: 'recipe',
          html: `<div class="compendium-recipe-stack" style="--recipe-count: ${ingredientCards.length}; --recipe-center: ${(ingredientCards.length - 1) / 2}">${ingredientCards.join('')}</div>`,
        },
        name: r.name,
        badge: `${r.totalCount}장`,
        // Recipe cards use a denser codex variant because their visual payload
        // is already communicated by the stacked ingredient cards.
        categoryClass: 'compendium-recipe-card',
        stats: [['효과', r.flavor]],
      })
    }).join('')
    return `
      <h3 class="compendium-section">합성 (Synthesis)</h3>
      <div class="compendium-grid">${synthesisIntro}</div>
      <h3 class="compendium-section">조합 레시피 (Recipes)</h3>
      <p class="compendium-section-blurb">손패를 사용할 때마다 해당 카드가 활성 체인에 추가된다. 체인의 multiset이 아래 재료를 모두 포함하면 그 레시피가 보너스로 발동한다.</p>
      <div class="compendium-grid">${recipeCards}</div>
    `
  }

  /**
   * Unified compendium card template — every section uses this so the visual
   * grammar (art slot → name + badge → stat rows → description) reads as one
   * design language.
   */
  private compendiumCard(opts: {
    art:
      | { kind: 'sprite'; url: string }
      | { kind: 'icon'; svg: string }
      | { kind: 'recipe'; html: string }
    name: string
    badge?: string
    categoryClass?: string
    stats?: [string, string][]
    description?: string
  }): string {
    const artHtml =
      opts.art.kind === 'sprite'
        ? `<div class="compendium-card-art compendium-card-art--sprite" style="background-image: url('${opts.art.url}');"></div>`
        : opts.art.kind === 'icon'
          ? `<div class="compendium-card-art compendium-card-art--icon">${opts.art.svg}</div>`
          : `<div class="compendium-card-art compendium-card-art--recipe">${opts.art.html}</div>`
    const badgeHtml = opts.badge ? `<span class="compendium-card-badge">${opts.badge}</span>` : ''
    const statRows = (opts.stats ?? [])
      .map(
        ([k, v]) =>
          `<div class="compendium-card-row"><span class="compendium-card-label">${k}</span><span class="compendium-card-value">${v}</span></div>`
      )
      .join('')
    const descHtml = opts.description
      ? `<p class="compendium-card-desc">${opts.description}</p>`
      : ''
    const classes = ['compendium-card', opts.categoryClass ?? ''].filter(Boolean).join(' ')
    return `
      <article class="${classes}">
        ${artHtml}
        <header class="compendium-card-head">
          <span class="compendium-card-name">${opts.name}</span>
          ${badgeHtml}
        </header>
        ${statRows}
        ${descHtml}
      </article>
    `
  }

  /** Body-mounted center banner showing "대상 카드를 선택해" while a
   *  targeted hand card is armed. Pulses softly. */
  private updateTargetBanner(targeting: HandTargetingMode | null): void {
    let banner = document.getElementById('target-banner') as HTMLElement | null
    if (!banner) {
      banner = document.createElement('div')
      banner.id = 'target-banner'
      banner.className = 'target-banner'
      banner.setAttribute('aria-live', 'polite')
      banner.setAttribute('aria-hidden', 'true')
      document.body.appendChild(banner)
    }
    if (targeting) {
      const def = getHandCardDef(targeting.defId)
      banner.innerHTML = `
        <span class="target-banner-title">${def.name}</span>
        <span class="target-banner-sub">대상 카드를 선택해 · 다시 눌러 취소</span>
      `
      banner.classList.add('is-on')
    } else {
      banner.classList.remove('is-on')
    }
  }

  /** Top HUD: ember bar + decay timer + tier label + spawn weights chip. */
  private renderEmberHud(scorePanel: ScorePanelState): string {
    if (!scorePanel.emberTier) return ''
    const tier = scorePanel.emberTier
    const character = this.currentGameState?.getCharacter()
    if (!character) return ''
    const ember = character.ember
    const emberMax = character.emberMax
    const pct = Math.max(0, Math.min(100, (ember / emberMax) * 100))
    const countdown = scorePanel.emberDecayCountdown ?? 10
    const weights = scorePanel.spawnWeights
    const weightsText = weights
      ? `적 ${weights.enemy}% · 함정 ${weights.trap}% · 보물 ${weights.treasure}%`
      : ''
    return `
      <div class="ember-hud" aria-label="Ember status">
        <div class="ember-hud-inner">
          <div class="ember-line">
            <span class="ember-icon">${flameIcon()}</span>
            <div class="ember-bar">
              <div class="ember-bar-fill ember-tier-${tier}" style="width: ${pct}%"></div>
              <span class="ember-bar-label">불씨 ${ember}/${emberMax} · ${EmberSystem.tierLabel(tier)}</span>
            </div>
            <span class="ember-countdown" title="다음 불씨 감소까지 남은 턴">
              ${countdown}턴 뒤 -1
            </span>
          </div>
          <div class="ember-weights">${weightsText}</div>
        </div>
      </div>
    `
  }

  /** Vignette overlay whose intensity follows the ember tier. */
  private renderVignette(scorePanel: ScorePanelState): string {
    const intensity = Math.max(0, Math.min(1, scorePanel.vignetteIntensity ?? 0))
    if (intensity <= 0) return ''
    const opacity = intensity.toFixed(2)
    return `<div class="ember-vignette" style="--vignette-opacity: ${opacity};" aria-hidden="true"></div>`
  }

  /**
   * Body-mounted floating chain banner. Sits above the player profile
   * (mirrors the target banner's positioning style) so the player can read
   * the chain without it cluttering the board. Each new event pops in with
   * a short shake; fired recipes get a brighter pulse glow + bigger font.
   *
   * Newness is detected by comparing event uids against the previous render
   * snapshot (`previousChainUids`) so already-shown items do not re-animate.
   */
  /** Refresh only the body-mounted chain banner without rebuilding the board.
   *  The hand flow uses this between delayed combo beats so text feedback can
   *  appear immediately while the old board DOM remains available for removal
   *  animations. */
  refreshChainBanner(hints?: ChainHints): void {
    this.updateChainBanner(hints)
  }

  private updateChainBanner(hints?: ChainHints): void {
    let banner = document.getElementById('chain-banner') as HTMLElement | null
    if (!banner) {
      banner = document.createElement('div')
      banner.id = 'chain-banner'
      banner.className = 'chain-banner'
      banner.setAttribute('aria-label', 'Active chain')
      banner.setAttribute('aria-live', 'polite')
      document.body.appendChild(banner)
      // Reset button is delegated to the same custom event the old strip used.
      banner.addEventListener('click', (e) => {
        const t = e.target as HTMLElement
        if (t.dataset.chainReset !== undefined) {
          document.dispatchEvent(new CustomEvent('chainReset'))
        }
      })
    }
    const events = hints?.events ?? []
    if (events.length === 0) {
      banner.classList.remove('is-on')
      this.previousChainUids = new Set()
      return
    }
    const parts: string[] = ['<span class="chain-banner-label">체인</span>']
    for (let i = 0; i < events.length; i++) {
      const ev = events[i]
      const isNew = !this.previousChainUids.has(ev.uid) ? 'is-new' : ''
      if (ev.kind === 'card') {
        parts.push(`
          <span class="chain-event chain-event-card hand-cat-${ev.category} ${isNew}" data-chain-uid="${ev.uid}">
            ${ev.name}
          </span>
        `)
      } else if (ev.kind === 'recipe') {
        parts.push(`
          <span class="chain-event chain-event-recipe ${isNew}" data-chain-uid="${ev.uid}" title="${ev.flavor}">
            <span class="chain-event-mark">✦</span>
            <span class="chain-event-copy"><span class="chain-event-name">${ev.name}</span><span class="chain-event-flavor">${ev.flavor}</span></span>
          </span>
        `)
      } else if (ev.kind === 'gauge') {
        parts.push(`
          <span class="chain-event chain-event-gauge ${isNew}" data-chain-uid="${ev.uid}" title="${ev.flavor}">
            <span class="chain-event-mark">◆</span>
            <span class="chain-event-name">${ev.name}</span>
          </span>
        `)
      } else {
        parts.push(`
          <span class="chain-event chain-event-relic ${isNew}" data-chain-uid="${ev.uid}" title="${ev.flavor}">
            <span class="chain-event-mark">✧</span>
            <span class="chain-event-copy"><span class="chain-event-name">${ev.name}</span><span class="chain-event-flavor">${ev.flavor}</span></span>
          </span>
        `)
      }
      if (i < events.length - 1) {
        parts.push('<span class="chain-banner-arrow">→</span>')
      }
    }
    parts.push(
      '<button class="chain-banner-reset" type="button" data-chain-reset title="체인 초기화">×</button>'
    )
    banner.innerHTML = parts.join('')
    banner.classList.add('is-on')
    // Snapshot uids so the next render won't re-animate existing events.
    this.previousChainUids = new Set(events.map((e) => e.uid))
  }

  private attachListeners(): void {
    const activeCards = this.boardElement.querySelectorAll<HTMLElement>(
      this.handTargetingMode ? '.cell.card.is-hand-target' : '.cell.card.is-active'
    )
    activeCards.forEach((el) => {
      el.addEventListener('click', (e) => {
        e.stopPropagation()
        const laneIndex = parseInt(el.dataset.lane || '0', 10)
        const distance = parseInt(el.dataset.distance || '0', 10)
        this.handleCardClick(el, laneIndex, distance)
      })
    })

    // Hand cards: clicking dispatches itemAction which the main loop turns
    // into a single-use (or arms targeting) on that slot.
    this.boardElement
      .querySelectorAll<HTMLElement>('.hand-card button[data-item-index]')
      .forEach((el) => {
        el.addEventListener('click', (e) => {
          e.stopPropagation()
          const itemIndex = parseInt(el.dataset.itemIndex || '-1', 10)
          document.dispatchEvent(
            new CustomEvent<ItemActionDetail>('itemAction', {
              detail: { itemIndex, shiftKey: (e as MouseEvent).shiftKey },
            })
          )
        })
      })

    // Chain reset is bound on the body-mounted chain banner (updateChainBanner)
    // since the old in-stage strip is gone.

    // Candle mode button cycles the payoff for the 10-slot hand gauge.
    this.boardElement
      .querySelector<HTMLElement>('[data-cycle-candle-mode]')
      ?.addEventListener('click', (e) => {
        e.stopPropagation()
        document.dispatchEvent(new CustomEvent('candleModeCycle'))
      })

    // Score conversion is panel-level UI and does not spend a turn.
    this.boardElement
      .querySelector<HTMLElement>('.score-spend-btn')
      ?.addEventListener('click', (e) => {
        e.stopPropagation()
        document.dispatchEvent(new CustomEvent('scoreSpend'))
      })

    // Relic chips live inside a scroll well, so their fixed hover cards receive
    // viewport coordinates at hover-time to avoid clipping against that well.
    this.boardElement.querySelectorAll<HTMLElement>('.relic-mini-card').forEach((chip) => {
      const preview = chip.querySelector<HTMLElement>('.relic-hover-preview')
      if (!preview) return
      chip.addEventListener('mouseenter', () => this.positionRelicPreview(chip, preview))
      chip.addEventListener('focusin', () => this.positionRelicPreview(chip, preview))
    })

    // Compendium opens an overlay browser of every spawning card + every hand
    // card. It is purely informational (does not pause/advance a turn).
    this.boardElement
      .querySelector<HTMLElement>('[data-open-compendium]')
      ?.addEventListener('click', (e) => {
        e.stopPropagation()
        this.openCompendium()
      })
  }

  /** Position the relic hover preview as a fixed card near its chip so the
   *  relic stack can keep its compact scroll layout without clipping previews. */
  private positionRelicPreview(chip: HTMLElement, preview: HTMLElement): void {
    const rect = chip.getBoundingClientRect()
    const previewWidth = 190
    const gap = 16
    const rightSideLeft = rect.right + gap
    const hasRightRoom = rightSideLeft + previewWidth < window.innerWidth - 12
    preview.style.left = `${hasRightRoom ? rightSideLeft : rect.left - previewWidth - gap}px`
    preview.style.top = `${rect.top + rect.height / 2}px`
  }

  private handleCardClick(el: HTMLElement, laneIndex: number, distance: number): void {
    const isAlreadySelected =
      !!this.selected &&
      this.selected.laneIndex === laneIndex &&
      this.selected.distance === distance

    if (isAlreadySelected) {
      this.dispatchAction(laneIndex, distance)
      return
    }

    this.boardElement
      .querySelectorAll('.cell.card.is-selected')
      .forEach((c) => c.classList.remove('is-selected'))
    el.classList.add('is-selected')
    this.selected = { laneIndex, distance }
  }

  private dispatchAction(laneIndex: number, distance: number): void {
    const lane = this.currentGameState?.getLane(laneIndex)
    const card = lane?.getCardAtDistance(distance)
    if (!card) return

    const event = new CustomEvent<CardActionDetail>('cardAction', {
      detail: { laneIndex, distance, card },
    })
    document.dispatchEvent(event)
  }

  /**
   * Play only the attack motion used when the player actively swings at an
   * enemy card. Impact feedback is intentionally NOT fired here: the real
   * damage result is rendered by `animateDamageNumbersById` after the model
   * resolves, which prevents one click from producing duplicate hit bursts.
   */
  animatePlayerAttack(card: Card): Promise<void> {
    return this.animateCardElements(card, 'is-player-striking', 280)
  }

  /**
   * Play the downward slam used during the enemy phase. Enemy hits are grouped
   * by Card instance in TurnManager, so each visual card should only slam once.
   *
   * Important: the SquareBurst for an enemy-phase hit belongs on the *victim*
   * (the player), not on the attacker. The slam class alone communicates the
   * attacker's motion; `animateDamageFlash` follows up with the burst anchored
   * to the player card.
   */
  animateEnemyAttacks(hits: EnemyHit[]): Promise<void> {
    const elements = new Set<HTMLElement>()
    for (const hit of hits) {
      const selector = `.cell.card.is-active[data-lane="${hit.laneIndex}"]`
      const element = this.boardElement.querySelector<HTMLElement>(selector)
      if (element) elements.add(element)
    }
    return this.animateElements([...elements], 'is-enemy-slamming', 340)
  }

  /**
   * Player-hit feedback. Replaces the previous oxblood vignette with a
   * SquareBurst centered on the player card so the burst reads as a focused
   * impact rather than a screen-wide tint (which clashed with the ember
   * brightness pass). If the player card is offscreen for any reason we fall
   * back to a viewport-center burst.
   */
  animateDamageFlash(): Promise<void> {
    const playerCard = this.boardElement.querySelector<HTMLElement>('.player-card, .player-row')
    if (playerCard) {
      SquareBurst.playOn(playerCard, 'damage', { count: 20, spread: 150 })
    } else {
      SquareBurst.playAt(window.innerWidth / 2, window.innerHeight * 0.6, 'damage', {
        count: 20,
        spread: 150,
      })
    }
    return new Promise((resolve) => window.setTimeout(resolve, 420))
  }

  /** Float a glowing damage number above a specific element. */
  animateDamageNumberOnElement(target: HTMLElement | null, amount: number): Promise<void> {
    if (!target || amount <= 0) return Promise.resolve()
    const rect = target.getBoundingClientRect()
    return this.animateDamageNumberAt(
      rect.left + rect.width / 2,
      rect.top + rect.height * 0.34,
      amount
    )
  }

  /** Player damage feedback in one beat: number and burst start together. */
  animateDamageImpactOnElement(target: HTMLElement | null, amount: number): Promise<void> {
    if (!target || amount <= 0) return Promise.resolve()
    SquareBurst.playOn(target, 'damage', { count: 20, spread: 150 })
    return this.animateDamageNumberOnElement(target, amount)
  }

  /** Float damage numbers for card-id keyed model diffs. */
  animateDamageNumbersById(damages: { cardId: string; amount: number }[]): Promise<void> {
    return Promise.all(
      damages.map(({ cardId, amount }) => {
        const target = this.findCardElement(cardId)
        if (target && amount > 0) SquareBurst.playOn(target, 'damage', { count: 14, spread: 110 })
        return this.animateDamageNumberOnElement(target, amount)
      })
    ).then(() => undefined)
  }

  /** Create the red ember-glow numeric hit text at viewport coordinates. */
  private animateDamageNumberAt(x: number, y: number, amount: number): Promise<void> {
    const el = document.createElement('div')
    el.className = 'damage-float'
    el.textContent = `-${amount}`
    el.style.left = `${x}px`
    el.style.top = `${y}px`
    document.body.appendChild(el)
    const anim = el.animate(
      [
        { transform: 'translate(-50%, -20%) scale(0.78)', opacity: 0, filter: 'brightness(1.2)' },
        {
          transform: 'translate(-50%, -72%) scale(1.18)',
          opacity: 1,
          filter: 'brightness(1.65)',
          offset: 0.22,
        },
        { transform: 'translate(-50%, -150%) scale(1)', opacity: 0, filter: 'brightness(1)' },
      ],
      { duration: 760, easing: 'cubic-bezier(0.16, 0.86, 0.28, 1)', fill: 'forwards' }
    )
    return new Promise((resolve) => {
      anim.onfinish = () => {
        el.remove()
        resolve()
      }
      window.setTimeout(() => {
        el.remove()
        resolve()
      }, 900)
    })
  }

  /** Wax release effect: wider, softer shards as hardened wax cracks open. */
  animateWaxThawByIds(cardIds: string[]): Promise<void> {
    if (cardIds.length === 0) return Promise.resolve()
    for (const cardId of cardIds) {
      const target = this.findCardElement(cardId)
      if (!target) continue
      SquareBurst.playOn(target, 'wax-freeze', { count: 14, spread: 180, duration: 760 })
      target.classList.add('is-wax-thawing')
      window.setTimeout(() => target.classList.remove('is-wax-thawing'), 620)
    }
    return new Promise((resolve) => window.setTimeout(resolve, 620))
  }

  /** Generic effect dispatch — used by index.ts to fire bursts on events. */
  burstAtElement(
    target: HTMLElement | null,
    theme: BurstTheme,
    opts?: Parameters<typeof SquareBurst.playOn>[2]
  ): void {
    if (!target) return
    SquareBurst.playOn(target, theme, opts)
  }

  burstAtPoint(
    x: number,
    y: number,
    theme: BurstTheme,
    opts?: Parameters<typeof SquareBurst.playAt>[3]
  ): void {
    SquareBurst.playAt(x, y, theme, opts)
  }

  /** Find the rendered DOM element for a card (by id) for burst placement. */
  findCardElement(cardId: string): HTMLElement | null {
    return this.boardElement.querySelector<HTMLElement>(`.cell.card[data-card-id="${cardId}"]`)
  }

  /** Find a hand slot element by index for burst placement. */
  findHandSlotElement(slotIndex: number): HTMLElement | null {
    return this.boardElement.querySelector<HTMLElement>(
      `.hand-slot[data-slot-index="${slotIndex}"]`
    )
  }

  /** Find the score/log panel for score-pulse bursts. */
  findScorePulseAnchor(): HTMLElement | null {
    return (
      this.boardElement.querySelector<HTMLElement>('.score-number') ??
      this.boardElement.querySelector<HTMLElement>('.score-panel')
    )
  }

  /**
   * Animate the already-open hover preview, not the compact hand slot. The
   * source hand card quietly fades while the preview keeps its original size,
   * shoots to screen center, pauses briefly, then blooms and dissolves.
   */
  animateHandCardUse(slotIndex: number, theme: BurstTheme): Promise<void> {
    const source = this.findHandSlotElement(slotIndex)
    if (!source) return Promise.resolve()

    const sourceRect = source.getBoundingClientRect()
    const preview = source.querySelector<HTMLElement>('.hand-card-preview')
    const previewRect = preview?.getBoundingClientRect()
    const hasVisiblePreview = !!previewRect && previewRect.width > 0 && previewRect.height > 0
    const ghostWidth = hasVisiblePreview ? previewRect.width : 188
    const ghostHeight = hasVisiblePreview ? previewRect.height : ghostWidth / 0.72
    const startLeft = hasVisiblePreview ? previewRect.left : sourceRect.left - ghostWidth - 16
    const startTop = hasVisiblePreview
      ? previewRect.top
      : sourceRect.top + sourceRect.height / 2 - ghostHeight / 2
    const targetX = window.innerWidth / 2
    const targetY = window.innerHeight * 0.46
    const deltaX = targetX - (startLeft + ghostWidth / 2)
    const deltaY = targetY - (startTop + ghostHeight / 2)
    const ghost = (preview ?? source).cloneNode(true) as HTMLElement

    // The ghost is fixed-size from start to finish so the preview art does not
    // stretch; only the final center bloom scales up slightly for impact.
    ghost.classList.add('hand-use-ghost', 'is-preview-flight')
    ghost.style.left = `${startLeft}px`
    ghost.style.top = `${startTop}px`
    ghost.style.width = `${ghostWidth}px`
    ghost.style.height = `${ghostHeight}px`
    ghost.setAttribute('aria-hidden', 'true')
    document.body.appendChild(ghost)
    source.classList.add('is-hand-use-source')

    const anim = ghost.animate(
      [
        { transform: 'translate(0, 0) scale(1)', opacity: 1, filter: 'brightness(1)' },
        {
          transform: `translate(${deltaX * 0.78}px, ${deltaY * 0.78}px) scale(1)`,
          opacity: 1,
          filter: 'brightness(1.16)',
          offset: 0.58,
        },
        {
          transform: `translate(${deltaX}px, ${deltaY}px) scale(1)`,
          opacity: 1,
          filter: 'brightness(1.2)',
          offset: 0.76,
        },
        {
          transform: `translate(${deltaX}px, ${deltaY}px) scale(1.03)`,
          opacity: 1,
          filter: 'brightness(1.14)',
          offset: 0.88,
        },
        {
          transform: `translate(${deltaX}px, ${deltaY}px) scale(1.12)`,
          opacity: 0,
          filter: 'brightness(1.46)',
        },
      ],
      { duration: 900, easing: 'cubic-bezier(0.18, 0.88, 0.22, 1)', fill: 'forwards' }
    )

    return new Promise((resolve) => {
      window.setTimeout(() => {
        SquareBurst.playAt(targetX, targetY, theme, { count: 14, spread: 150, duration: 560 })
      }, 760)
      anim.onfinish = () => {
        ghost.remove()
        source.classList.remove('is-hand-use-source')
        resolve()
      }
      window.setTimeout(() => {
        ghost.remove()
        source.classList.remove('is-hand-use-source')
        resolve()
      }, 1080)
    })
  }

  /**
   * Burst on cards that just received the wax-freeze status. This is separate
   * from the persistent CSS shell so the exact trigger moment has the same
   * SquareBurst language as damage, treasure, and vanish effects.
   */
  animateWaxFreezeByIds(cardIds: string[]): Promise<void> {
    if (cardIds.length === 0) return Promise.resolve()
    const animations: Promise<void>[] = []
    for (const cardId of cardIds) {
      const elements = [
        ...this.boardElement.querySelectorAll<HTMLElement>(`.cell.card[data-card-id="${cardId}"]`),
      ]
      if (elements.length === 0) continue
      const r1 = elements[0].getBoundingClientRect()
      const r2 = elements[elements.length - 1].getBoundingClientRect()
      SquareBurst.playAt((r1.left + r2.right) / 2, (r1.top + r2.bottom) / 2, 'wax-freeze', {
        count: 20,
        spread: 120 + (elements.length - 1) * 24,
        duration: 620,
      })
      animations.push(this.animateElements(elements, 'is-freeze-triggering', 420))
    }
    return Promise.all(animations).then(() => undefined)
  }

  /**
   * "Eaten" animation for trap/treasure (and any other consumed card):
   * the card scales up + brightens + fades out while a themed SquareBurst
   * fires from its center. All DOM cells belonging to this Card instance
   * play in lockstep so 2/3-cell merges read as a single consumption.
   *
   * Theme defaults by card type. Falls back to vanish-smoke.
   */
  animateCardConsume(card: Card): Promise<void> {
    const elements = [
      ...this.boardElement.querySelectorAll<HTMLElement>(`.cell.card[data-card-id="${card.id}"]`),
    ]
    if (elements.length === 0) return Promise.resolve()
    const theme: BurstTheme =
      card.type === CardType.TREASURE
        ? 'treasure-gain'
        : card.type === CardType.ENEMY
          ? 'damage'
          : 'vanish-smoke'
    // Burst from the visual center of the (possibly wide) group.
    const first = elements[0]
    const last = elements[elements.length - 1]
    const r1 = first.getBoundingClientRect()
    const r2 = last.getBoundingClientRect()
    const x = (r1.left + r2.right) / 2
    const y = (r1.top + r2.bottom) / 2
    SquareBurst.playAt(x, y, theme, {
      count: 20,
      spread: 130 + (elements.length - 1) * 30,
    })
    return this.animateElements(elements, 'is-consuming', 360)
  }

  /**
   * Consume a list of cards by id+type — used by hand-ability paths where
   * HandSystem mutates the model BEFORE we can capture the Card object.
   * The DOM is still showing the pre-mutation state when this is invoked.
   * `suppressBurstIds` is for cards that already received a same-beat impact
   * burst (usually lethal damage), so removal can fade without double popping.
   */
  animateCardConsumeByIds(
    payload: { cardId: string; type: CardType }[],
    options: { suppressBurstIds?: Set<string> } = {}
  ): Promise<void> {
    if (payload.length === 0) return Promise.resolve()
    const animations: Promise<void>[] = []
    for (const { cardId, type } of payload) {
      const elements = [
        ...this.boardElement.querySelectorAll<HTMLElement>(`.cell.card[data-card-id="${cardId}"]`),
      ]
      if (elements.length === 0) continue
      const theme: BurstTheme =
        type === CardType.TREASURE
          ? 'treasure-gain'
          : type === CardType.ENEMY
            ? 'damage'
            : 'vanish-smoke'
      const r1 = elements[0].getBoundingClientRect()
      const r2 = elements[elements.length - 1].getBoundingClientRect()
      // Damage numbers already play the exact hit burst for cards that lost
      // HP this beat. Suppressing only the consume burst keeps the fade-out
      // readable without making a killed enemy explode twice.
      if (!options.suppressBurstIds?.has(cardId)) {
        SquareBurst.playAt((r1.left + r2.right) / 2, (r1.top + r2.bottom) / 2, theme, {
          count: 20,
          spread: 130 + (elements.length - 1) * 30,
        })
      }
      animations.push(this.animateElements(elements, 'is-consuming', 360))
    }
    return Promise.all(animations).then(() => undefined)
  }

  /**
   * Treasure volatility mutates the model before the next render, but the old
   * DOM is still present. Use that old DOM to show dust and fading first.
   *
   * Both 'disappeared' and 'mimic' outcomes also fire a SquareBurst on the
   * affected cell — smoke for vanish, oxblood→moss for mimic — so the unified
   * effect language reads at every state change.
   */
  animateTreasureChanges(changes: TreasureChange[]): Promise<void> {
    const elements = new Set<HTMLElement>()
    for (const change of changes) {
      const selector =
        `.cell.card.type-treasure[data-lane="${change.laneIndex}"]` +
        `[data-distance="${change.distance}"]`
      const element = this.boardElement.querySelector<HTMLElement>(selector)
      if (!element) continue
      if (change.outcome === 'disappeared') {
        elements.add(element)
        SquareBurst.playOn(element, 'vanish-smoke', { count: 18, spread: 110 })
      } else if (change.outcome === 'mimic') {
        SquareBurst.playOn(element, 'mimic-shift', { count: 20, spread: 130 })
      }
    }
    return this.animateElements([...elements], 'is-treasure-vanishing', 520)
  }

  /** Capture current card positions so the next render can FLIP-move survivors. */
  private captureCardRects(): Map<string, DOMRect> {
    const rects = new Map<string, DOMRect>()
    this.boardElement.querySelectorAll<HTMLElement>('.cell.card[data-card-id]').forEach((el) => {
      const id = el.dataset.cardId
      if (id) rects.set(id, el.getBoundingClientRect())
    })
    return rects
  }

  /**
   * Smooth cards from their previous screen position to their new grid slot.
   * This avoids the previous full rerender flicker when lanes compact downward.
   */
  private animateMovedCards(previousRects: Map<string, DOMRect>): void {
    this.boardElement.querySelectorAll<HTMLElement>('.cell.card[data-card-id]').forEach((el) => {
      const id = el.dataset.cardId
      if (!id) return
      const previousRect = previousRects.get(id)
      if (!previousRect) return
      const nextRect = el.getBoundingClientRect()
      const deltaX = previousRect.left - nextRect.left
      const deltaY = previousRect.top - nextRect.top
      if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) return

      el.animate(
        [
          { transform: `translate(${deltaX}px, ${deltaY}px)`, opacity: 0.94 },
          { transform: 'translate(0, 0)', opacity: 1 },
        ],
        { duration: 360, easing: 'cubic-bezier(0.18, 0.88, 0.22, 1)' }
      )
    })
  }

  /** Remember ids and spans after each render for enter/merge animations. */
  private rememberRenderedCards(): void {
    const ids = new Set<string>()
    const spans = new Map<string, number>()
    this.boardElement.querySelectorAll<HTMLElement>('.cell.card[data-card-id]').forEach((el) => {
      const id = el.dataset.cardId
      if (!id) return
      ids.add(id)
      spans.set(id, parseInt(el.dataset.span || '1', 10))
    })
    this.previousCardIds = ids
    this.previousGroupSpans = spans
    // Mirror the same snapshot pattern for hand cards.
    const handUids = new Set<string>()
    this.boardElement.querySelectorAll<HTMLElement>('.hand-slot[data-hand-uid]').forEach((el) => {
      const uid = el.dataset.handUid
      if (uid) handUids.add(uid)
    })
    this.previousHandUids = handUids
    this.hasRendered = true
  }

  /** Newly larger spans get a short sticky merge pulse after movement settles. */
  private shouldAnimateGroup(cardId: string, span: number): boolean {
    if (!this.hasRendered || span <= 1) return false
    const previousSpan = this.previousGroupSpans.get(cardId) || 1
    return span > previousSpan
  }

  /** Add a temporary animation class to all rendered elements for one card. */
  private animateCardElements(card: Card, className: string, duration: number): Promise<void> {
    const elements = [...this.boardElement.querySelectorAll<HTMLElement>('.cell.card')].filter(
      (el) => el.dataset.cardId === card.id
    )
    return this.animateElements(elements, className, duration)
  }

  /** Shared class-based animation helper with cleanup after the CSS finishes. */
  private animateElements(
    elements: HTMLElement[],
    className: string,
    duration: number
  ): Promise<void> {
    if (elements.length === 0) return Promise.resolve()
    elements.forEach((el) => {
      el.classList.remove(className)
      void el.offsetWidth
      el.classList.add(className)
    })
    return new Promise((resolve) => {
      window.setTimeout(() => {
        elements.forEach((el) => el.classList.remove(className))
        resolve()
      }, duration)
    })
  }

  private injectStyles(): void {
    if (document.getElementById('game-board-styles')) return
    const style = document.createElement('style')
    style.id = 'game-board-styles'
    style.textContent = STYLES
    document.head.appendChild(style)
  }
}

const STYLES = `
.icon {
  width: 1em;
  height: 1em;
  display: inline-block;
  vertical-align: -0.14em;
  flex-shrink: 0;
  color: currentColor;
}

.game-shell {
  width: 100%;
  height: 100vh;
  max-height: 100vh;
  display: grid;
  grid-template-columns:
    minmax(240px, 300px)
    minmax(0, 1fr)
    minmax(160px, 220px);
  gap: clamp(10px, 1.6vw, 20px);
  padding: clamp(58px, 7vh, 88px) clamp(8px, 1.4vw, 18px) clamp(8px, 1.5vh, 16px);
  overflow: hidden;
  font-family: inherit;
  align-items: stretch;
}

.stage {
  width: 100%;
  min-width: 0;
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  gap: clamp(8px, 1.4vh, 14px);
  overflow: hidden;
}

/* ---------- Top-center Turn overlay ---------- */
.turn-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 40;
  pointer-events: none;
  display: flex;
  justify-content: center;
  padding: 14px 0 36px;
  background: linear-gradient(
    180deg,
    rgba(8, 5, 14, 0.88) 0%,
    rgba(8, 5, 14, 0.55) 50%,
    rgba(8, 5, 14, 0.0) 100%
  );
}

.turn-overlay-inner {
  display: inline-flex;
  align-items: baseline;
  gap: 12px;
  font-variant-numeric: tabular-nums;
}

.turn-overlay-kicker {
  font-size: clamp(14px, 1.6vw, 20px);
  font-weight: 700;
  letter-spacing: 0.32em;
  color: rgba(255, 215, 120, 0.85);
  text-transform: uppercase;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.85);
}

.turn-overlay-number {
  font-size: clamp(34px, 4.6vw, 56px);
  font-weight: 900;
  letter-spacing: 0.05em;
  color: var(--color-flame);
  line-height: 1;
  text-shadow:
    0 0 20px rgba(255, 215, 120, 0.55),
    0 0 36px rgba(244, 164, 96, 0.32),
    0 2px 6px rgba(0, 0, 0, 0.85);
}

/* ---------- Left panel (brand + score) ---------- */
.left-panel {
  display: grid;
  grid-template-rows: auto 1fr;
  gap: 10px;
  min-height: 0;
  align-self: stretch;
  justify-self: start;
  width: 100%;
}

.brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 4px 10px 8px;
  border-bottom: 1px solid var(--color-border-soft);
}
.brand-icon {
  display: inline-flex;
  align-items: center;
  color: var(--color-flame);
  font-size: clamp(20px, 2.4vw, 26px);
  filter: drop-shadow(0 0 8px rgba(255, 215, 120, 0.5));
}
.brand-text {
  font-size: clamp(17px, 1.9vw, 22px);
  font-weight: 700;
  letter-spacing: 0.16em;
  color: var(--color-flame);
  text-shadow: 0 0 12px rgba(255, 215, 120, 0.25);
}

/* ---------- Score / Activity Panel ---------- */
.score-panel {
  display: grid;
  grid-template-rows: auto auto 1fr auto;
  gap: 10px;
  min-height: 0;
  padding: 12px;
  align-self: stretch;
  background:
    linear-gradient(180deg, rgba(31, 24, 48, 0.86), rgba(18, 14, 28, 0.94));
  border: 1px solid var(--color-border-soft);
  border-radius: 16px;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.05),
    0 0 28px rgba(0, 0, 0, 0.28);
}

.coin-panel-total,
.score-panel-total {
  position: relative;
  padding: 12px;
  border: 1px solid rgba(244, 164, 96, 0.28);
  border-radius: 14px;
  background: radial-gradient(circle at 50% 0%, rgba(255, 215, 120, 0.18), transparent 70%);
  overflow: hidden;
}

.score-kicker {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--color-text-muted);
  letter-spacing: 0.1em;
}
.score-kicker-icon {
  display: inline-flex;
  align-items: center;
  color: var(--color-flame);
  font-size: 13px;
}

.coin-number,
.score-number {
  position: relative;
  margin-top: 4px;
  color: var(--color-flame);
  font-size: clamp(28px, 4vw, 42px);
  font-weight: 900;
  line-height: 1;
  text-shadow:
    0 0 8px rgba(255, 215, 120, 0.55),
    0 0 18px rgba(244, 164, 96, 0.3);
  font-variant-numeric: tabular-nums;
}

.coin-number.is-score-popping,
.score-number.is-score-popping {
  animation: score-slot-pop 0.62s cubic-bezier(0.16, 0.9, 0.22, 1);
}

.coin-number.is-score-popping::after,
.score-number.is-score-popping::after {
  content: '✦ ✧ ✦';
  position: absolute;
  right: 4px;
  top: -12px;
  color: rgba(255, 232, 168, 0.95);
  font-size: 13px;
  letter-spacing: 4px;
  animation: score-sparks 0.62s ease-out forwards;
}

.score-log-list {
  display: flex;
  flex-direction: column;
  gap: 7px;
  min-height: 0;
  overflow-y: auto;
  /* Move scrollbar to the LEFT side via direction trick. */
  direction: rtl;
  padding-left: 2px;
  scrollbar-width: thin;
  scrollbar-color: rgba(244, 164, 96, 0.7) rgba(20, 16, 28, 0.45);
}
.score-log-list > * {
  /* Reset content direction so log rows still flow left-to-right. */
  direction: ltr;
}
.score-log-list::-webkit-scrollbar {
  width: 4px;
}
.score-log-list::-webkit-scrollbar-track {
  background: rgba(20, 16, 28, 0.4);
  border-radius: 999px;
}
.score-log-list::-webkit-scrollbar-thumb {
  background: linear-gradient(180deg, var(--color-flame), var(--color-flame-deep));
  border-radius: 999px;
  box-shadow: 0 0 6px rgba(244, 164, 96, 0.4);
}
.score-log-list::-webkit-scrollbar-thumb:hover {
  background: linear-gradient(180deg, var(--color-flame), var(--color-flame-warm));
}

.score-log {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
  align-items: center;
  min-height: 36px;
  padding: 8px 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.045);
  box-shadow: inset 3px 0 0 rgba(244, 164, 96, 0.36);
}

.score-log-label {
  min-width: 0;
  color: var(--color-text-primary);
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.score-log-delta {
  color: var(--color-flame);
  font-size: 12px;
  font-weight: 800;
}

.score-log-enemy { box-shadow: inset 3px 0 0 rgba(168, 58, 58, 0.72); }
.score-log-treasure { box-shadow: inset 3px 0 0 rgba(201, 161, 58, 0.8); }
.score-log-trap { box-shadow: inset 3px 0 0 rgba(112, 76, 150, 0.8); }
.score-log-item { box-shadow: inset 3px 0 0 rgba(244, 164, 96, 0.72); }
.score-log-item-gain { box-shadow: inset 3px 0 0 rgba(103, 196, 152, 0.82); }
.score-log-item-gain .score-log-delta { color: #bff6d9; }
.score-log-score { box-shadow: inset 3px 0 0 rgba(255, 215, 120, 0.8); }
.score-log-notice { box-shadow: inset 3px 0 0 rgba(145, 174, 210, 0.75); }
.score-log-win { box-shadow: inset 3px 0 0 rgba(103, 196, 152, 0.82); }
.score-log-hurt { box-shadow: inset 3px 0 0 rgba(168, 58, 58, 0.82); }
.score-log-notice .score-log-delta { color: #cbdaf0; }
.score-log-win .score-log-delta { color: #bff6d9; }
.score-log-hurt .score-log-delta { color: #ffd5c5; }

.score-log-empty {
  padding: 14px 10px;
  color: var(--color-text-muted);
  border: 1px dashed var(--color-border-soft);
  border-radius: 10px;
  text-align: center;
  font-size: 12px;
}

.score-spend-btn {
  appearance: none;
  cursor: pointer;
  padding: 10px 12px;
  border: 1px solid var(--color-flame-warm);
  border-radius: 12px;
  color: #2a1f14;
  background: linear-gradient(135deg, var(--color-flame), var(--color-flame-warm));
  font-family: inherit;
  font-weight: 800;
  box-shadow: 0 0 18px rgba(244, 164, 96, 0.28);
}

.score-spend-btn:disabled {
  cursor: not-allowed;
  color: var(--color-text-muted);
  background: rgba(255, 255, 255, 0.04);
  border-color: var(--color-border-soft);
  box-shadow: none;
}

/* (legacy stage-header / stage-main rules removed — title now lives in
   .brand inside .left-panel and Turn is rendered as a fixed top overlay) */

/* ---------- Rail (3x3) ---------- */
.rail {
  display: grid;
  grid-template-rows: repeat(3, minmax(0, 1fr));
  gap: clamp(6px, 1vh, 10px);
  padding: clamp(10px, 1.6vh, 14px);
  /* Stays simple — a translucent dark slab so the page-level art reads
     through, with just enough shadow to separate the rail from the room. */
  background: rgba(14, 10, 22, 0.62);
  border: 1px solid rgba(139, 111, 71, 0.55);
  border-radius: 14px;
  box-shadow:
    inset 0 0 0 1px rgba(255, 215, 120, 0.05),
    inset 0 0 60px rgba(0, 0, 0, 0.45),
    0 8px 28px rgba(0, 0, 0, 0.55);
  position: relative;
  /* Visible so the ×N group badge can poke out of cell edges. */
  overflow: visible;
  min-height: 0;
  backdrop-filter: blur(2px);
}

.rail::before {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(
    ellipse 80% 60% at 50% 100%,
    rgba(244, 164, 96, 0.18),
    transparent 70%
  );
  pointer-events: none;
}

.rail-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: clamp(6px, 1vw, 10px);
  position: relative;
  z-index: 1;
  min-height: 0;
}

.rail-row.dist-2 {
  opacity: 0.42;
  transform: scale(0.92);
  transform-origin: center bottom;
}
.rail-row.dist-1 {
  opacity: 0.7;
  transform: scale(0.96);
  transform-origin: center bottom;
}
.rail-row.dist-0 {
  opacity: 1;
}

/* ---------- Cell / Card ---------- */
.cell {
  border-radius: 10px;
  border: 1px dashed var(--color-border-soft);
  background: rgba(255, 255, 255, 0.015);
  display: flex;
  align-items: stretch;
  justify-content: stretch;
  position: relative;
  transition: transform 0.18s ease, box-shadow 0.2s ease, border-color 0.2s ease;
  min-height: 0;
  min-width: 0;
}

.cell.empty {
  border-style: dashed;
  background:
    repeating-linear-gradient(
      45deg,
      rgba(255, 255, 255, 0.015) 0 6px,
      transparent 6px 12px
    );
}

.cell.card {
  cursor: default;
  border: 1px solid var(--color-border-warm);
  background: #1c1424;
  color: #fff5dc;
  /* Shared depth tokens keep the soft rear shadow identical for 1/2/3-cell cards. */
  --card-depth-shadow: 0 14px 24px rgba(0, 0, 0, 0.45);
  --card-lift-shadow: 0 4px 10px rgba(0, 0, 0, 0.55);
  --card-lift-shadow-grouped: var(--card-lift-shadow);
  box-shadow:
    inset 0 1px 0 rgba(255, 232, 168, 0.18),
    inset 0 -10px 18px rgba(0, 0, 0, 0.45),
    var(--card-lift-shadow),
    var(--card-depth-shadow);
  /* Sprite art is clipped by .card-face below — keep cell visible so the
     ×N group badge can poke out of the canvas edge. */
  overflow: visible;
  isolation: isolate;
}

.cell.is-active {
  cursor: pointer;
}
/* Hover only adds a subtle glow so it never fights hit/attack movement animations. */
.cell.is-active:hover {
  border-color: var(--color-flame-warm);
  box-shadow:
    inset 0 1px 0 rgba(255, 232, 168, 0.28),
    inset 0 -10px 18px rgba(0, 0, 0, 0.45),
    var(--card-lift-shadow),
    var(--card-depth-shadow),
    0 0 18px rgba(244, 164, 96, 0.36);
}

.cell.is-selected {
  border-color: var(--color-flame);
  box-shadow:
    inset 0 0 0 2px rgba(255, 215, 120, 0.6),
    0 0 22px rgba(255, 215, 120, 0.55),
    0 4px 14px rgba(0, 0, 0, 0.55);
  animation: candle-glow 1.6s ease-in-out infinite alternate;
}

@keyframes candle-glow {
  from {
    box-shadow:
      inset 0 0 0 2px rgba(255, 215, 120, 0.55),
      0 0 18px rgba(255, 215, 120, 0.5),
      0 4px 14px rgba(0, 0, 0, 0.55);
  }
  to {
    box-shadow:
      inset 0 0 0 2px rgba(255, 215, 120, 0.85),
      0 0 28px rgba(255, 215, 120, 0.75),
      0 4px 18px rgba(0, 0, 0, 0.6);
  }
}

.cell.card.is-grouped {
  border-width: 2px;
  box-shadow:
    inset 0 1px 0 rgba(255, 232, 168, 0.28),
    inset 0 -12px 22px rgba(0, 0, 0, 0.55),
    var(--card-lift-shadow-grouped),
    var(--card-depth-shadow),
    0 0 18px rgba(244, 164, 96, 0.18);
}

.cell.card.type-enemy { border-color: var(--color-enemy); }
.cell.card.type-enemy::before {
  content: '';
  position: absolute;
  left: 0; top: 0; bottom: 0;
  width: 3px;
  background: linear-gradient(180deg, var(--color-enemy), #5a1818);
  z-index: 3;
  pointer-events: none;
  box-shadow: 0 0 8px rgba(168, 58, 58, 0.6);
}
.cell.card.type-trap { border-color: var(--color-trap); }
.cell.card.type-trap::before {
  content: '';
  position: absolute;
  left: 0; top: 0; bottom: 0;
  width: 3px;
  background: linear-gradient(180deg, var(--color-trap), #2c1d44);
  z-index: 3;
  pointer-events: none;
  box-shadow: 0 0 8px rgba(112, 76, 150, 0.55);
}
.cell.card.type-treasure { border-color: var(--color-treasure); }
.cell.card.type-treasure::before {
  content: '';
  position: absolute;
  left: 0; top: 0; bottom: 0;
  width: 3px;
  background: linear-gradient(180deg, var(--color-flame), var(--color-treasure));
  z-index: 3;
  pointer-events: none;
  box-shadow: 0 0 8px rgba(255, 215, 120, 0.55);
}

.cell.card.type-trap.is-grouped[data-span="3"] {
  animation: trap-danger 1.2s ease-in-out infinite;
}
@keyframes trap-danger {
  0%, 100% { box-shadow: inset 0 1px 0 rgba(255,255,255,0.3), var(--card-lift-shadow-grouped), var(--card-depth-shadow), 0 0 12px rgba(168,58,58,0.4); }
  50%      { box-shadow: inset 0 1px 0 rgba(255,255,255,0.3), var(--card-lift-shadow-grouped), var(--card-depth-shadow), 0 0 22px rgba(168,58,58,0.85); }
}

/* Grouped cards should react exactly like single-cell cards: only the
   candlelight strength changes on hover, while the type-colored border stays
   intact because the later type rules keep ownership of border-color. */
.cell.card.is-active.is-grouped:hover {
  box-shadow:
    inset 0 1px 0 rgba(255, 232, 168, 0.28),
    inset 0 -12px 22px rgba(0, 0, 0, 0.55),
    var(--card-lift-shadow-grouped),
    var(--card-depth-shadow),
    0 0 18px rgba(244, 164, 96, 0.36);
}

/* The 3-cell trap's danger pulse is a keyframe animation, so hover must pause
   it before applying the same border-preserving candlelight used elsewhere. */
.cell.card.type-trap.is-active.is-grouped[data-span="3"]:hover {
  animation: none;
  box-shadow:
    inset 0 1px 0 rgba(255, 232, 168, 0.28),
    inset 0 -12px 22px rgba(0, 0, 0, 0.55),
    var(--card-lift-shadow-grouped),
    var(--card-depth-shadow),
    0 0 18px rgba(244, 164, 96, 0.36);
}

/* Grouped selected cards previously lost the single-cell selection glow because
   the grouped shadow rule had higher specificity; this restores parity while
   retaining the shared rear depth shadow. */
.cell.card.is-grouped.is-selected {
  box-shadow:
    inset 0 0 0 2px rgba(255, 215, 120, 0.6),
    0 0 22px rgba(255, 215, 120, 0.55),
    var(--card-lift-shadow-grouped),
    var(--card-depth-shadow);
  animation: grouped-candle-glow 1.6s ease-in-out infinite alternate;
}
@keyframes grouped-candle-glow {
  from {
    box-shadow:
      inset 0 0 0 2px rgba(255, 215, 120, 0.55),
      0 0 18px rgba(255, 215, 120, 0.5),
      var(--card-lift-shadow-grouped),
      var(--card-depth-shadow);
  }
  to {
    box-shadow:
      inset 0 0 0 2px rgba(255, 215, 120, 0.85),
      0 0 28px rgba(255, 215, 120, 0.75),
      var(--card-lift-shadow-grouped),
      var(--card-depth-shadow);
  }
}

.card-face {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  border-radius: inherit;
}

.card-art {
  position: absolute;
  inset: 0;
  background-size: cover;
  background-position: center 32%;
  background-repeat: no-repeat;
  z-index: 0;
  /* Slight desaturation so warm rail tone tints the art uniformly. */
  filter: saturate(1.05) contrast(1.02);
}

/* Bottom-anchored dark gradient so card-name + stats stay legible over art. */
.card-overlay {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  background:
    linear-gradient(
      180deg,
      rgba(20, 16, 28, 0.0) 38%,
      rgba(20, 16, 28, 0.55) 70%,
      rgba(10, 7, 18, 0.92) 100%
    ),
    radial-gradient(
      120% 60% at 50% 0%,
      rgba(244, 164, 96, 0.06),
      transparent 70%
    );
}

.card-content {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  align-items: center;
  text-align: center;
  padding: clamp(4px, 1vh, 8px) clamp(4px, 1vw, 8px);
  gap: 4px;
}

.card-name {
  font-size: var(--font-size-sm);
  font-weight: 700;
  color: #fff5dc;
  line-height: 1.15;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  width: 100%;
  padding: 0 2px;
  text-shadow:
    0 1px 2px rgba(0, 0, 0, 0.85),
    0 0 6px rgba(0, 0, 0, 0.6);
  letter-spacing: 0.02em;
}

.card-stats {
  display: flex;
  gap: 10px;
  font-size: 12px;
  font-weight: 700;
  color: #fff5dc;
  flex-wrap: wrap;
  justify-content: center;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.85);
}
.card-stats .stat {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  line-height: 1;
}
.card-stats .stat .icon { font-size: 13px; }
.card-stats .stat-value { font-variant-numeric: tabular-nums; }
.card-stats .stat.hp { color: #ffb3a1; }
.card-stats .stat.atk { color: #ffd58a; }
.card-stats.danger {
  color: #fff;
  background: var(--color-enemy);
  padding: 2px 10px;
  border-radius: 999px;
  letter-spacing: 0.08em;
  border: 1px solid rgba(255, 200, 200, 0.45);
  text-shadow: none;
}
.card-stats.good {
  color: #2a1f14;
  background: var(--color-treasure);
  padding: 2px 10px;
  border-radius: 999px;
  border: 1px solid rgba(255, 232, 168, 0.7);
  text-shadow: none;
}

.group-badge {
  position: absolute;
  /* Pulled outside the cell edge — cell + rail are now overflow:visible so
     the badge can sit on the canvas margin, like a wax seal stamped over it. */
  top: -16px;
  right: -16px;
  background: linear-gradient(135deg, var(--color-flame), var(--color-flame-deep));
  color: #fff8e0;
  border: 1px solid rgba(255, 232, 168, 0.95);
  font-size: 13px;
  font-weight: 900;
  padding: 4px 11px;
  border-radius: 999px;
  box-shadow:
    0 4px 10px rgba(0, 0, 0, 0.6),
    0 0 16px rgba(255, 215, 120, 0.45);
  transform: rotate(11deg);
  transform-origin: center;
  z-index: 30;
  pointer-events: none;
}



.trap-block-mark {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 70, 70, 0.88);
  font-size: clamp(48px, 12vw, 96px);
  font-weight: 900;
  text-shadow:
    0 0 8px rgba(0, 0, 0, 0.9),
    0 0 18px rgba(168, 58, 58, 0.8);
  pointer-events: none;
  z-index: 8;
}

/* ---------- Player Card + transparent utility layers ---------- */
.player-zone {
  display: grid;
  grid-template-columns: minmax(88px, 0.7fr) auto minmax(88px, 0.7fr);
  align-items: end;
  justify-items: center;
  gap: clamp(8px, 1.4vw, 18px);
  min-height: 0;
}
.utility-layer {
  width: 100%;
  min-height: clamp(92px, 14vh, 140px);
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 14px;
  background: rgba(8, 5, 14, 0.12);
  backdrop-filter: blur(1px);
}
.utility-layer-left {
  justify-content: flex-end;
  padding-right: clamp(4px, 0.8vw, 10px);
}
.relic-layer {
  justify-content: flex-start;
  padding-left: clamp(4px, 0.8vw, 10px);
  overflow: visible;
}
.relic-plan-label {
  max-width: 104px;
  color: rgba(255, 232, 168, 0.46);
  border: 1px dashed rgba(255, 232, 168, 0.18);
  border-radius: 999px;
  padding: 6px 9px;
  font-size: 12px;
  text-align: center;
  line-height: 1.2;
}
.relic-stack {
  display: flex;
  align-items: center;
  gap: 7px;
  max-width: clamp(120px, 16vw, 190px);
  overflow-x: auto;
  padding: 4px 2px 6px;
}
.relic-mini-card {
  flex: 0 0 clamp(58px, 5.4vw, 72px);
  aspect-ratio: 1;
  position: relative;
  overflow: visible;
  /* Square chip frame: compact like a small relic case, but still softened to
     match the candlelit card UI instead of reading as a sharp debug tile. */
  border-radius: 12px;
  border: 1px solid rgba(255, 215, 120, 0.46);
  background:
    radial-gradient(circle at 50% 22%, rgba(255, 232, 168, 0.2), transparent 44%),
    linear-gradient(160deg, rgba(38, 27, 35, 0.94), rgba(13, 9, 19, 0.95));
  box-shadow:
    inset 0 1px 0 rgba(255, 232, 168, 0.24),
    inset 0 -10px 18px rgba(0, 0, 0, 0.34),
    0 8px 18px rgba(0, 0, 0, 0.45);
}
.relic-mini-art {
  position: absolute;
  inset: 5px;
  border-radius: 8px;
  background-size: cover;
  background-position: center 20%;
  filter: sepia(0.16) saturate(0.9) brightness(0.92);
}
.relic-mini-card::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  border-radius: inherit;
  background:
    linear-gradient(180deg, rgba(255, 232, 168, 0.18), transparent 34%, rgba(13, 9, 19, 0.38)),
    radial-gradient(circle at 50% 50%, transparent 58%, rgba(0, 0, 0, 0.36) 100%);
}
.player-row {
  display: flex;
  justify-content: center;
  align-items: end;
}

/* ---------- Shop shutter + modal ---------- */
.rail.is-shop-quaking {
  animation: shop-rail-quake 0.52s cubic-bezier(0.18, 0.9, 0.24, 1);
}
.rail-shutter {
  position: absolute;
  inset: 0;
  z-index: 35;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(3, 1fr);
  gap: clamp(7px, 1vw, 12px);
  padding: clamp(7px, 1vw, 12px);
  pointer-events: none;
}
.rail-shutter span {
  border-radius: 12px;
  background:
    linear-gradient(180deg, rgba(255, 232, 168, 0.24), rgba(125, 74, 33, 0.18) 16%, rgba(14, 9, 18, 0.98) 58%),
    repeating-linear-gradient(90deg, rgba(255, 232, 168, 0.06) 0 2px, rgba(0, 0, 0, 0.18) 2px 7px);
  border: 1px solid rgba(255, 215, 120, 0.28);
  box-shadow: inset 0 1px 0 rgba(255, 232, 168, 0.22), 0 12px 24px rgba(0, 0, 0, 0.56);
  transform: translateY(-120%) scaleY(0.82);
  transform-origin: top;
  animation: shop-shutter-drop 0.48s cubic-bezier(0.18, 0.86, 0.22, 1) forwards;
  animation-delay: calc(var(--shutter-i) * 28ms);
}
.rail-shutter.is-opening span {
  animation: shop-shutter-open 0.42s cubic-bezier(0.42, 0, 0.24, 1) forwards;
  animation-delay: calc(var(--shutter-i) * 18ms);
}
.shop-overlay {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: none;
  align-items: center;
  justify-content: center;
  padding: clamp(16px, 3vw, 36px);
  background: radial-gradient(circle at 50% 35%, rgba(91, 48, 34, 0.34), rgba(8, 5, 14, 0.86) 62%);
  backdrop-filter: blur(5px);
}
.shop-overlay.is-open {
  display: flex;
  animation: shop-overlay-in 0.24s ease-out;
}
.shop-shell {
  position: relative;
  width: min(1040px, 96vw);
}
.shop-modal {
  width: 100%;
  max-height: min(760px, 92vh);
  overflow: auto;
  border-radius: 22px;
  border: 1px solid rgba(255, 215, 120, 0.42);
  background:
    radial-gradient(circle at 18% 0%, rgba(244, 164, 96, 0.18), transparent 34%),
    linear-gradient(160deg, rgba(36, 25, 36, 0.98), rgba(13, 9, 19, 0.98));
  box-shadow: 0 24px 70px rgba(0, 0, 0, 0.72), inset 0 1px 0 rgba(255, 232, 168, 0.22);
  padding: clamp(18px, 2.4vw, 28px);
}
.shop-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}
.shop-kicker {
  color: rgba(255, 215, 120, 0.78);
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.shop-header h2 {
  margin: 2px 0 0;
  color: rgba(255, 232, 168, 0.98);
  font-size: clamp(22px, 3vw, 34px);
}
.shop-wallet {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: rgba(255, 240, 189, 0.98);
  border: 1px solid rgba(255, 215, 120, 0.34);
  border-radius: 999px;
  padding: 8px 13px;
  background: rgba(0, 0, 0, 0.24);
  font-weight: 800;
}
.shop-wallet .icon { width: 1em; height: 1em; }
.shop-intro {
  margin: 12px 0 18px;
  color: rgba(232, 214, 180, 0.78);
  font-size: var(--font-size-sm);
}
.shop-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: clamp(12px, 1.8vw, 20px);
}
.shop-relic-card {
  min-height: 410px;
  display: grid;
  grid-template-rows: 48% 1fr auto;
  overflow: hidden;
  border-radius: 16px;
  border: 1px solid rgba(255, 215, 120, 0.3);
  background: linear-gradient(180deg, rgba(45, 30, 39, 0.98), rgba(18, 12, 24, 0.98));
  box-shadow: inset 0 1px 0 rgba(255, 232, 168, 0.16), 0 14px 26px rgba(0, 0, 0, 0.48);
}
.shop-relic-card.is-purchased {
  filter: saturate(0.65) brightness(0.78);
}
.shop-relic-art {
  min-height: 180px;
  background-size: cover;
  background-position: center 18%;
  border-bottom: 1px solid rgba(255, 215, 120, 0.18);
  box-shadow: inset 0 -38px 48px rgba(13, 9, 19, 0.74);
}
.shop-relic-body {
  padding: 14px 15px 8px;
}
.shop-relic-title {
  margin: 0 0 7px;
  color: rgba(255, 232, 168, 0.98);
  font-size: var(--font-size-lg);
}
.shop-relic-effect {
  min-height: 56px;
  margin: 0 0 8px;
  color: rgba(255, 244, 210, 0.92);
  line-height: 1.35;
  font-size: var(--font-size-base);
}
.shop-relic-flavor {
  margin: 0;
  color: rgba(232, 214, 180, 0.58);
  font-size: var(--font-size-sm);
  line-height: 1.35;
}
.shop-cost-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px 15px 15px;
}
.shop-buy-btn,
.shop-close-btn {
  border: 1px solid rgba(255, 215, 120, 0.42);
  border-radius: 999px;
  background: linear-gradient(180deg, rgba(255, 215, 120, 0.95), rgba(184, 111, 43, 0.94));
  color: rgba(28, 16, 9, 0.96);
  font-family: inherit;
  font-weight: 900;
  font-size: var(--font-size-sm);
  cursor: pointer;
  padding: 8px 12px;
  box-shadow: 0 8px 18px rgba(0, 0, 0, 0.28);
}
.shop-buy-btn:disabled {
  cursor: not-allowed;
  opacity: 0.45;
  filter: grayscale(0.4);
}
.shop-close-btn {
  padding-inline: 18px;
}
.shop-close-tab {
  position: absolute;
  right: clamp(18px, 3vw, 34px);
  top: 0;
  z-index: 2;
  transform: translateY(calc(-100% - 9px));
  min-width: 82px;
  border-radius: 999px 999px 10px 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  box-shadow:
    0 10px 20px rgba(0, 0, 0, 0.4),
    inset 0 1px 0 rgba(255, 244, 210, 0.38);
}
.shop-close-tab::after {
  content: '';
  position: absolute;
  left: 13px;
  right: 13px;
  bottom: -10px;
  height: 10px;
  border-left: 1px solid rgba(255, 215, 120, 0.34);
  border-right: 1px solid rgba(255, 215, 120, 0.34);
  background: linear-gradient(180deg, rgba(184, 111, 43, 0.64), rgba(80, 44, 24, 0.2));
}
.shop-empty {
  grid-column: 1 / -1;
  min-height: 160px;
  display: grid;
  place-items: center;
  color: rgba(255, 232, 168, 0.72);
  border: 1px dashed rgba(255, 232, 168, 0.22);
  border-radius: 16px;
}
@keyframes shop-rail-quake {
  0%, 100% { transform: translate(0, 0) rotate(0); }
  16% { transform: translate(-8px, 3px) rotate(-0.55deg); }
  32% { transform: translate(7px, -4px) rotate(0.5deg); }
  48% { transform: translate(-5px, 4px) rotate(-0.35deg); }
  64% { transform: translate(4px, -2px) rotate(0.25deg); }
  80% { transform: translate(-2px, 1px) rotate(-0.12deg); }
}
@keyframes shop-shutter-drop {
  0% { transform: translateY(-120%) scaleY(0.82); opacity: 0.2; }
  82% { transform: translateY(5%) scaleY(1.04); opacity: 1; }
  100% { transform: translateY(0) scaleY(1); opacity: 1; }
}
@keyframes shop-shutter-open {
  0% { transform: translateY(0) scaleY(1); opacity: 1; }
  100% { transform: translateY(-120%) scaleY(0.78); opacity: 0; }
}
@keyframes shop-overlay-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
@media (max-width: 820px) {
  .shop-grid { grid-template-columns: 1fr; }
  .shop-relic-card { min-height: 360px; }
}

/* Player card mirrors the rail-card structure (sprite art → bottom dark
   gradient → content) so the player reads as the largest "card" on board. */
.player-card {
  position: relative;
  width: clamp(150px, 17vw, 200px);
  aspect-ratio: 3 / 4;
  border-radius: 14px;
  overflow: hidden;
  isolation: isolate;
  background: #14101c;
  border: 1px solid var(--color-flame-warm);
  box-shadow:
    inset 0 1px 0 rgba(255, 232, 168, 0.32),
    inset 0 -10px 22px rgba(0, 0, 0, 0.55),
    0 6px 14px rgba(0, 0, 0, 0.55),
    0 0 26px rgba(244, 164, 96, 0.28);
}

.player-art {
  position: absolute;
  inset: 0;
  background-size: cover;
  background-position: center 22%;
  background-repeat: no-repeat;
  filter: saturate(1.06) contrast(1.04);
  z-index: 0;
}

.player-overlay {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  background:
    linear-gradient(
      180deg,
      rgba(20, 16, 28, 0.0) 32%,
      rgba(20, 16, 28, 0.55) 65%,
      rgba(8, 5, 14, 0.94) 100%
    ),
    radial-gradient(
      120% 60% at 50% 0%,
      rgba(244, 164, 96, 0.1),
      transparent 70%
    );
}

.player-content {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  align-items: stretch;
  text-align: center;
  padding: 8px 10px 10px;
  gap: 6px;
}

.player-name {
  font-size: var(--font-size-sm);
  font-weight: 800;
  color: var(--color-flame);
  letter-spacing: 0.06em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-shadow:
    0 1px 2px rgba(0, 0, 0, 0.9),
    0 0 8px rgba(255, 215, 120, 0.35);
}

.player-stats {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
  align-items: center;
}

.hp-bar {
  position: relative;
  height: 16px;
  background: rgba(0, 0, 0, 0.5);
  border: 1px solid var(--color-border-soft);
  border-radius: 999px;
  overflow: hidden;
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.6);
}
.hp-fill {
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, #c9472a, #f4a460);
  transition: width 0.3s ease;
  box-shadow: inset 0 1px 0 rgba(255, 215, 120, 0.4);
}
.hp-text {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  height: 100%;
  font-size: 12px;
  font-weight: 700;
  color: #fff5dc;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.85);
  font-variant-numeric: tabular-nums;
}
.hp-text-icon {
  display: inline-flex;
  align-items: center;
  color: #ffd5c5;
  font-size: 12px;
}

.atk-stat {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: var(--font-size-sm);
  font-weight: 700;
  color: var(--color-flame);
  padding: 3px 12px;
  border: 1px solid rgba(255, 215, 120, 0.35);
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.32);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.atk-stat-icon {
  display: inline-flex;
  align-items: center;
  color: var(--color-flame);
  font-size: 13px;
}

/* ---------- Hand panel — see the bottom of the file for the active
   10-slot stack styles. The old deckbuilder layout (.hand-cards, the
   transform-lift hover, etc.) was removed because it both duplicated and
   clipped the new layout's animations. */

@media (max-width: 960px) {
  .game-shell {
    grid-template-columns: minmax(200px, 240px) minmax(0, 1fr) minmax(140px, 180px);
  }
}

@media (max-width: 760px) {
  .game-shell {
    grid-template-columns: 1fr;
    grid-template-rows: auto minmax(0, 1fr) auto;
  }
  .left-panel { min-height: 0; }
  .hand-panel { grid-row: 3; }
}

@media (max-width: 480px) {
  .game-shell { padding-left: 6px; padding-right: 6px; }
  .card-name { font-size: 12px; }
}

@media (max-height: 600px) {
  .rail-row.dist-2 { opacity: 0.3; transform: scale(0.86); }
  .rail-row.dist-1 { opacity: 0.6; transform: scale(0.92); }
  .player-card { width: clamp(120px, 14vw, 160px); }
}

/* ---------- Animation Effects ---------- */
@keyframes score-slot-pop {
  0% { transform: translateY(0) scale(1); filter: brightness(1); }
  24% { transform: translateY(-3px) scale(1.12, 0.92); filter: brightness(1.35); }
  48% { transform: translateY(2px) scale(0.96, 1.08); }
  72% { transform: translateY(-1px) scale(1.04); }
  100% { transform: translateY(0) scale(1); filter: brightness(1); }
}

@keyframes score-sparks {
  0% { opacity: 0; transform: translate(0, 6px) scale(0.6); }
  35% { opacity: 1; transform: translate(8px, -4px) scale(1); }
  100% { opacity: 0; transform: translate(18px, -18px) scale(1.25); }
}

/* Damage vignette intentionally removed — see SquareBurst.ts for the
   replacement. The unified effect system uses scattering solid squares so
   the visual stays compatible with the ember-driven brightness pass. */

@keyframes card-enter-soft {
  from {
    opacity: 0;
    transform: translateY(-18px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes player-strike-pop {
  0%, 100% {
    transform: translateY(0) scale(1);
    filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.5));
  }
  38% {
    transform: translateY(-18px) scale(1.05);
    filter: drop-shadow(0 12px 18px rgba(255, 215, 120, 0.45));
  }
  68% {
    transform: translateY(4px) scale(0.98);
  }
}

@keyframes enemy-down-slam {
  0%, 100% {
    transform: translateY(0) scale(1);
    filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.5));
  }
  42% {
    transform: translateY(24px) scale(1.04, 0.96);
    filter: drop-shadow(0 14px 18px rgba(168, 58, 58, 0.65));
  }
  66% {
    transform: translateY(-3px) scale(0.99, 1.02);
  }
}

@keyframes treasure-dust-fade {
  0% {
    opacity: 1;
    transform: translate(0, 0) rotate(0deg) scale(1);
    filter: blur(0) saturate(1);
  }
  24% {
    opacity: 0.92;
    transform: translate(-2px, 1px) rotate(-0.8deg) scale(1.01);
  }
  46% {
    opacity: 0.72;
    transform: translate(2px, -1px) rotate(0.8deg) scale(0.99);
  }
  100% {
    opacity: 0;
    transform: translate(0, 10px) rotate(0deg) scale(0.92);
    filter: blur(1px) saturate(0.75);
  }
}

@keyframes group-squish {
  0%, 100% { transform: scale(1); }
  35% { transform: scale(1.06, 0.94); }
  62% { transform: scale(0.98, 1.05); }
}

.cell.card.is-entering {
  animation: card-enter-soft 0.34s cubic-bezier(0.2, 0.86, 0.28, 1);
}

.cell.card.is-player-striking {
  animation: player-strike-pop 0.28s cubic-bezier(0.2, 0.9, 0.25, 1);
  z-index: 5;
}

.cell.card.is-enemy-slamming {
  animation: enemy-down-slam 0.34s cubic-bezier(0.24, 0.92, 0.28, 1);
  z-index: 5;
}

.cell.card.is-treasure-vanishing {
  pointer-events: none;
  animation: treasure-dust-fade 0.52s ease-out forwards;
  z-index: 6;
}

/* Treasure vanish keeps only the card fade here; the actual particulate
   state-change feedback is supplied by SquareBurst in animateTreasureChanges. */
.cell.card.is-newly-grouped {
  animation: group-squish 0.3s cubic-bezier(0.18, 0.9, 0.18, 1);
  z-index: 4;
}

/* Eaten / consumed card — used when a trap/treasure (or any hand-ability
   removal) leaves the board. The card briefly puffs outward and fades so
   the moment of "먹는" reads, instead of the card just disappearing. */
.cell.card.is-consuming {
  pointer-events: none;
  animation: card-consume 0.36s cubic-bezier(0.2, 0.78, 0.32, 1) forwards;
  z-index: 7;
}
@keyframes card-consume {
  0% {
    transform: scale(1);
    opacity: 1;
    filter: brightness(1) saturate(1);
  }
  35% {
    transform: scale(1.18);
    opacity: 0.95;
    filter: brightness(1.35) saturate(1.15);
  }
  100% {
    transform: scale(1.42);
    opacity: 0;
    filter: brightness(1.1) saturate(1);
  }
}

/* ---------- Ember HUD (top center) ---------- */
.ember-hud {
  position: fixed;
  top: clamp(56px, 7vh, 84px);
  left: 50%;
  transform: translateX(-50%);
  z-index: 35;
  width: min(640px, 92vw);
  pointer-events: none;
}
.ember-hud-inner {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 12px;
  background: linear-gradient(180deg, rgba(20, 16, 28, 0.78), rgba(8, 5, 14, 0.55));
  border: 1px solid rgba(255, 215, 120, 0.22);
  border-radius: 12px;
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.45);
}
.ember-line {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 10px;
  align-items: center;
}
.ember-icon {
  display: inline-flex;
  align-items: center;
  color: var(--color-flame);
  font-size: 16px;
  filter: drop-shadow(0 0 6px rgba(255, 215, 120, 0.5));
}
.ember-bar {
  position: relative;
  height: 14px;
  border-radius: 999px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
}
.ember-bar-fill {
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: 999px;
  transition: width 0.35s ease;
}
.ember-bar-fill.ember-tier-bright {
  background: linear-gradient(90deg, #ffe89a, #f4a460);
  box-shadow: 0 0 12px rgba(255, 215, 120, 0.55);
}
.ember-bar-fill.ember-tier-dim {
  background: linear-gradient(90deg, #f4a460, #c97640);
  box-shadow: 0 0 8px rgba(244, 164, 96, 0.4);
}
.ember-bar-fill.ember-tier-flickering {
  background: linear-gradient(90deg, #c97640, #8b3a2d);
  box-shadow: 0 0 8px rgba(168, 58, 58, 0.45);
  animation: ember-flicker 1.6s ease-in-out infinite;
}
.ember-bar-fill.ember-tier-extinguished {
  background: linear-gradient(90deg, #5a2828, #2d1818);
  animation: ember-flicker 0.8s ease-in-out infinite;
}
@keyframes ember-flicker {
  0%, 100% { filter: brightness(1); }
  50% { filter: brightness(0.65); }
}
.ember-bar-label {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  color: rgba(255, 245, 220, 0.95);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.85);
  letter-spacing: 0.04em;
}
.ember-countdown {
  font-size: 11px;
  color: rgba(255, 215, 120, 0.85);
  font-weight: 700;
  letter-spacing: 0.04em;
}
.ember-weights {
  font-size: 10px;
  color: rgba(255, 245, 220, 0.55);
  text-align: right;
  letter-spacing: 0.04em;
}

/* ---------- Vignette overlay (Darkest Dungeon torch feel) ---------- */
.ember-vignette {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 38;
  /* Side-weighted darkness preserves readability around the rail, hand, and
     score zones while still making low ember feel oppressive at the edges. */
  background:
    linear-gradient(90deg,
      rgba(0, 0, 0, calc(0.88 * var(--vignette-opacity, 0))) 0%,
      rgba(0, 0, 0, calc(0.5 * var(--vignette-opacity, 0))) 13%,
      rgba(0, 0, 0, calc(0.12 * var(--vignette-opacity, 0))) 29%,
      rgba(0, 0, 0, calc(0.04 * var(--vignette-opacity, 0))) 50%,
      rgba(0, 0, 0, calc(0.12 * var(--vignette-opacity, 0))) 71%,
      rgba(0, 0, 0, calc(0.5 * var(--vignette-opacity, 0))) 87%,
      rgba(0, 0, 0, calc(0.88 * var(--vignette-opacity, 0))) 100%),
    radial-gradient(ellipse at center,
      rgba(0, 0, 0, 0) 26%,
      rgba(0, 0, 0, calc(0.18 * var(--vignette-opacity, 0))) 68%,
      rgba(0, 0, 0, calc(0.48 * var(--vignette-opacity, 0))) 100%);
  transition: background 0.4s ease;
}

/* ---------- Hand stack (bottom-up, 10 fixed slots) ----------
   Layout rationale:
   - grid rows: [header, candle-gauge, stack (1fr)]
   - Targeting prompt lives on a separate body-mounted .target-banner, NOT
     in the panel — keeping it in the panel pushed the UI around when arming
     a card.
   - The stack uses justify-content:flex-end so filled slots dock to the
     BOTTOM of the column, matching the Tetris-stacking model. Empty slots
     are flattened (no height) so the bottom row of cards sits flush with
     the panel border, not floating at the column center.
   - overflow:visible on the stack so hover-pop/animation/burst don't get
     clipped against the panel wall when a card is selected.
*/
.hand-panel {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  gap: 8px;
  min-height: 0;
  padding: 10px;
  background:
    linear-gradient(180deg, rgba(31, 24, 48, 0.82), rgba(18, 14, 28, 0.94)),
    radial-gradient(circle at 50% 0%, rgba(255, 215, 120, 0.09), transparent 58%);
  border: 1px solid var(--color-border-soft);
  border-radius: 16px;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.05),
    0 0 28px rgba(0, 0, 0, 0.28);
  align-self: stretch;
  overflow: visible;
}
.hand-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 700;
  color: var(--color-flame);
  letter-spacing: 0.08em;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--color-border-soft);
}
.hand-header-icon {
  display: inline-flex;
  align-items: center;
  color: var(--color-flame);
  font-size: 14px;
}
.candle-gauge {
  position: relative;
  display: grid;
  grid-template-columns: 46px 1fr;
  gap: 8px;
  align-items: stretch;
  min-height: 48px;
  padding: 6px;
  border-radius: 12px;
  overflow: visible;
  background:
    linear-gradient(180deg, rgba(255, 215, 120, 0.1), rgba(255, 255, 255, 0.035)),
    rgba(20, 16, 28, 0.78);
  border: 1px solid rgba(244, 164, 96, 0.32);
  box-shadow:
    inset 0 1px 0 rgba(255, 232, 168, 0.12),
    0 0 16px rgba(0, 0, 0, 0.2);
}
.candle-mode-btn {
  appearance: none;
  display: grid;
  grid-template-rows: 1fr auto;
  align-items: center;
  justify-items: center;
  gap: 2px;
  min-width: 40px;
  border: 1px solid rgba(255, 215, 120, 0.42);
  border-radius: 10px;
  color: var(--color-flame);
  background: radial-gradient(circle at 50% 0%, rgba(255, 215, 120, 0.18), rgba(0, 0, 0, 0.18));
  cursor: pointer;
  font-family: inherit;
  box-shadow: 0 0 12px rgba(255, 215, 120, 0.12);
}
.candle-mode-btn:hover {
  border-color: rgba(255, 215, 120, 0.72);
  background: rgba(244, 164, 96, 0.16);
}
.candle-mode-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
}
.candle-mode-label {
  color: rgba(255, 232, 168, 0.86);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.04em;
}
.candle-gauge-body {
  display: grid;
  grid-template-rows: 1fr auto;
  gap: 4px;
  min-width: 0;
}
.candle-gauge-meter {
  position: relative;
  display: grid;
  grid-template-columns: repeat(10, minmax(0, 1fr));
  gap: 3px;
  padding: 3px;
  border-radius: 9px;
  background: rgba(0, 0, 0, 0.34);
  border: 1px solid rgba(255, 255, 255, 0.08);
  overflow: hidden;
}
.candle-gauge-meter::before {
  content: '';
  position: absolute;
  inset: 3px auto 3px 3px;
  width: calc(var(--candle-fill, 0%) - 6px);
  max-width: calc(100% - 6px);
  min-width: 0;
  border-radius: 6px;
  background: linear-gradient(90deg, rgba(244, 164, 96, 0.42), rgba(255, 215, 120, 0.7));
  box-shadow: 0 0 12px rgba(255, 215, 120, 0.34);
  transition: width 0.3s ease;
}
.candle-gauge-tick {
  position: relative;
  z-index: 1;
  min-height: 18px;
  border-radius: 5px;
  border: 1px solid rgba(255, 232, 168, 0.18);
  background: rgba(255, 255, 255, 0.045);
}
.candle-gauge-tick.is-filled {
  border-color: rgba(255, 232, 168, 0.56);
  background: linear-gradient(180deg, rgba(255, 232, 168, 0.75), rgba(244, 164, 96, 0.58));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.22);
}
.candle-gauge-label {
  position: static;
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  font-weight: 800;
  color: rgba(255, 232, 168, 0.86);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.85);
  letter-spacing: 0.02em;
}
/* ---------- Compendium (도감) overlay ---------- */
.compendium-overlay {
  position: fixed;
  inset: 0;
  display: none;
  align-items: center;
  justify-content: center;
  background: rgba(8, 5, 14, 0.78);
  backdrop-filter: blur(2px);
  z-index: 240;
  padding: 24px;
}
.compendium-overlay.is-open { display: flex; }
.compendium-modal {
  width: min(880px, 96vw);
  max-height: 86vh;
  display: grid;
  grid-template-rows: auto auto 1fr auto;
  background: linear-gradient(180deg, rgba(34, 26, 50, 0.96), rgba(18, 14, 28, 0.98));
  border: 1px solid var(--color-border-warm);
  border-radius: 18px;
  box-shadow: 0 24px 48px rgba(0, 0, 0, 0.65);
  /* Keep recipe cards visible even when their hover fan extends past the codex panel. */
  overflow: visible;
  color: #fff5dc;
}
.compendium-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  border-bottom: 1px solid var(--color-border-soft);
}
.compendium-title {
  font-size: 18px;
  font-weight: 800;
  letter-spacing: 0.06em;
  margin: 0;
  color: var(--color-flame-warm);
}
.compendium-close {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  color: var(--color-flame-warm);
  width: 32px;
  height: 32px;
  font-size: 16px;
  cursor: pointer;
  font-family: inherit;
}
.compendium-close:hover { background: rgba(244, 164, 96, 0.18); }
.compendium-tabs {
  display: flex;
  gap: 4px;
  padding: 8px 16px 0;
  border-bottom: 1px solid var(--color-border-soft);
}
.compendium-tab {
  appearance: none;
  background: transparent;
  border: 1px solid transparent;
  border-bottom: none;
  padding: 8px 16px;
  border-radius: 8px 8px 0 0;
  color: var(--color-text-muted);
  cursor: pointer;
  font-family: inherit;
  font-size: 13px;
  font-weight: 700;
}
.compendium-tab.is-active {
  color: var(--color-flame-warm);
  background: rgba(244, 164, 96, 0.1);
  border-color: rgba(244, 164, 96, 0.4);
}
.compendium-body {
  /* Overflow is visible by design: recipe mini-cards may fan outside the panel
     because readability is more important than clipping to the codex bounds. */
  overflow: visible;
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  /* Match the score-log scrollbar style so every scrollable UI uses the
     same warm candle thumb and dark recessed track. */
  scrollbar-width: thin;
  scrollbar-color: rgba(244, 164, 96, 0.7) rgba(20, 16, 28, 0.45);
}
.compendium-body::-webkit-scrollbar {
  width: 4px;
}
.compendium-body::-webkit-scrollbar-track {
  background: rgba(20, 16, 28, 0.4);
  border-radius: 999px;
}
.compendium-body::-webkit-scrollbar-thumb {
  background: linear-gradient(180deg, var(--color-flame), var(--color-flame-deep));
  border-radius: 999px;
  box-shadow: 0 0 6px rgba(244, 164, 96, 0.4);
}
.compendium-body::-webkit-scrollbar-thumb:hover {
  background: linear-gradient(180deg, var(--color-flame), var(--color-flame-warm));
}
.compendium-section {
  margin: 8px 0 4px;
  font-size: 12px;
  color: var(--color-flame);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.compendium-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
}
/* Shared card-shaped face for hand hover previews and hand-card compendium
   entries. The art is clipped through a rounded mask and object-fit preserves
   the source image ratio while filling the top frame. */
.common-card-face {
  position: relative;
  display: grid;
  grid-template-rows: minmax(142px, auto) auto;
  gap: 10px;
  width: 100%;
  height: 100%;
  min-height: 260px;
  padding: 12px;
  border-radius: 14px;
  overflow: hidden;
  background:
    linear-gradient(180deg, rgba(47, 35, 58, 0.98), rgba(18, 13, 26, 0.98)),
    radial-gradient(circle at 50% 0%, rgba(255, 215, 120, 0.16), transparent 64%);
  border: 1px solid rgba(255, 215, 120, 0.46);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.08),
    inset 0 0 0 2px rgba(0, 0, 0, 0.24),
    0 0 22px rgba(244, 164, 96, 0.18);
  color: #fff5dc;
}

.common-card-face::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  /* Reuse the current card-back art as a softened front-face pattern so the
     playable card face has ornament without competing with the illustration. */
  background: var(--hand-card-back) center / cover no-repeat;
  opacity: 0.18;
  filter: saturate(0.72) brightness(1.28) sepia(0.2);
  mix-blend-mode: screen;
}

.common-card-face::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    linear-gradient(180deg, rgba(255, 232, 168, 0.08), transparent 34%, rgba(0, 0, 0, 0.22)),
    radial-gradient(120% 95% at 50% 6%, transparent 54%, rgba(7, 5, 12, 0.5) 100%);
}
.common-card-art {
  position: relative;
  z-index: 1;
  height: 142px;
  min-height: 142px;
  border-radius: 10px;
  overflow: hidden;
  clip-path: inset(0 round 10px);
  background: rgba(0, 0, 0, 0.34);
  border: 1px solid rgba(255, 232, 168, 0.2);
  box-shadow: inset 0 0 20px rgba(0, 0, 0, 0.38);
}
.common-card-art img {
  width: 100%;
  height: 100%;
  display: block;
  /* Cover plus the rounded overflow mask gives every thumbnail the same
     visible frame while preserving the original image asset unchanged. */
  object-fit: cover;
  object-position: center;
}
.common-card-body {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-rows: auto 1fr;
  gap: 8px;
  min-height: 82px;
  text-align: center;
}
.common-card-title-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-width: 0;
}
.common-card-name {
  font-size: 16px;
  font-weight: 900;
  letter-spacing: 0.04em;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.86);
}
.common-card-badge {
  flex-shrink: 0;
  padding: 2px 7px;
  border-radius: 999px;
  border: 1px solid rgba(244, 164, 96, 0.48);
  color: var(--color-flame);
  background: rgba(0, 0, 0, 0.22);
  font-size: 10px;
  font-weight: 800;
}
.common-card-desc {
  margin: 0;
  /* Center the effect copy within the lower text area rather than letting it
     sit on the card bottom edge. */
  align-self: center;
  color: rgba(255, 232, 168, 0.9);
  font-size: 15px;
  line-height: 1.42;
  word-break: keep-all;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.72);
}
.common-card-subdesc {
  color: rgba(255, 245, 220, 0.72);
}
.compendium-hand-card {
  /* Codex-only hand cards may grow vertically with long effect text instead of
     squeezing the title upward into the illustration. */
  aspect-ratio: auto;
  height: auto;
  min-height: 270px;
}
.compendium-field-card {
  min-height: 330px;
  height: auto;
}
.compendium-field-card .common-card-body {
  min-height: 124px;
}
.compendium-field-card .common-card-desc {
  align-self: start;
}
.compendium-grid .common-card-face {
  height: auto;
}

/* Unified compendium card. Every tab uses the same skeleton:
   art slot → head (name + badge) → stat rows → optional description.
   The art slot has three variants (sprite / icon / recipe ingredients) but
   shares the same height + framed background so the grid reads as one
   design language. */
.compendium-card {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 200px;
}
.compendium-card-wide {
  grid-column: 1 / -1;
}
.compendium-card-art {
  height: 88px;
  border-radius: 8px;
  background-color: rgba(0, 0, 0, 0.32);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
}
.compendium-card-art--sprite {
  background-size: contain;
  background-repeat: no-repeat;
  background-position: center;
}
.compendium-card-art--icon {
  color: var(--color-flame);
}
.compendium-card-art--icon .icon {
  width: 56px;
  height: 56px;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.55));
}
.compendium-card-art--recipe {
  flex-wrap: wrap;
  gap: 6px;
  padding: 8px;
  height: auto;
  min-height: 88px;
  align-content: center;
  background-color: rgba(0, 0, 0, 0.2);
}
.compendium-card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 6px;
}
.compendium-card-name {
  font-weight: 800;
  color: #fff5dc;
  font-size: 13px;
}
.compendium-card-badge {
  font-size: 10px;
  color: var(--color-flame);
  padding: 2px 8px;
  border: 1px solid rgba(244, 164, 96, 0.45);
  border-radius: 999px;
  white-space: nowrap;
  letter-spacing: 0.04em;
}
.compendium-card-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
  font-size: 11px;
  color: var(--color-text-muted);
}
.compendium-card-label {
  font-weight: 600;
  flex-shrink: 0;
}
.compendium-card-value {
  color: #fff5dc;
  text-align: right;
}
.compendium-card-desc {
  margin: 2px 0 0;
  font-size: 11px;
  color: var(--color-text-muted);
  line-height: 1.45;
}

/* Recipe ingredient pills shown in the combo tab's art slot. */
.compendium-recipe-ing {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.12);
  font-size: 11px;
  color: #fff5dc;
}
.compendium-recipe-ing-icon {
  display: inline-flex;
  width: 16px;
  height: 16px;
  color: var(--color-flame);
}
.compendium-recipe-ing-icon .icon {
  width: 16px;
  height: 16px;
}
.compendium-recipe-ing-name {
  font-weight: 600;
  letter-spacing: 0.02em;
}
.compendium-recipe-ing-count {
  color: var(--color-flame);
  font-weight: 700;
}
/* Reuse the hand-cat-* tint for the pill left edge so categories read
   instantly inside a recipe. */
.compendium-recipe-ing.hand-cat-recovery { box-shadow: inset 3px 0 0 rgba(103, 196, 152, 0.85); }
.compendium-recipe-ing.hand-cat-tool     { box-shadow: inset 3px 0 0 rgba(255, 215, 120, 0.9); }
.compendium-recipe-ing.hand-cat-control  { box-shadow: inset 3px 0 0 rgba(145, 174, 210, 0.9); }
.compendium-recipe-ing.hand-cat-attack   { box-shadow: inset 3px 0 0 rgba(168, 58, 58, 0.9); }

.compendium-section-blurb {
  margin: 0 0 4px;
  font-size: 11px;
  color: var(--color-text-muted);
  line-height: 1.5;
}

.compendium-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.compendium-title-icon {
  display: inline-flex;
  color: var(--color-flame-warm);
  width: 20px;
  height: 20px;
}
.compendium-title-icon .icon {
  width: 20px;
  height: 20px;
}

.compendium-footer {
  padding: 8px 20px 12px;
  font-size: 11px;
  color: var(--color-text-muted);
  text-align: center;
  border-top: 1px solid var(--color-border-soft);
}

/* panel-actions row on the score panel groups score spend controls while the
   compendium launcher itself now lives in the transparent utility layer. */
.panel-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.panel-actions .score-spend-btn { flex: 1; }

/* Floating compendium launcher: the button keeps semantic click behavior,
   but visually reads as only a flat icon with a pre-reserved label below it. */
.compendium-btn {
  appearance: none;
  background: transparent;
  border: none;
  color: var(--color-flame-warm);
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  font-weight: 800;
  white-space: nowrap;
}
.compendium-btn-floating {
  position: relative;
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 74px;
  min-height: 82px;
  padding: 4px;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.85);
}
.compendium-btn-icon {
  display: inline-flex;
  width: 46px;
  height: 46px;
  color: rgba(255, 232, 168, 0.88);
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.65));
  transition: transform 0.18s cubic-bezier(0.2, 0.86, 0.28, 1), filter 0.18s ease, color 0.18s ease;
}
.compendium-btn-icon .icon {
  width: 46px;
  height: 46px;
}
.compendium-btn-label {
  min-height: 14px;
  color: rgba(255, 232, 168, 0.92);
  letter-spacing: 0.08em;
  opacity: 0;
  transform: translateY(-2px);
  transition: opacity 0.16s ease, transform 0.16s ease;
}
.compendium-btn-floating:hover .compendium-btn-icon,
.compendium-btn-floating:focus-visible .compendium-btn-icon {
  color: #fff3c8;
  transform: translateY(-2px) scale(1.08);
  filter:
    drop-shadow(0 2px 4px rgba(0, 0, 0, 0.7))
    drop-shadow(0 0 10px rgba(255, 215, 120, 0.62));
  animation: compendium-icon-sparkle 0.82s ease-in-out infinite;
}
.compendium-btn-floating:hover .compendium-btn-label,
.compendium-btn-floating:focus-visible .compendium-btn-label {
  opacity: 1;
  transform: translateY(0);
}
.compendium-btn-floating:focus-visible {
  outline: 1px solid rgba(255, 215, 120, 0.55);
  outline-offset: 4px;
  border-radius: 12px;
}
@keyframes compendium-icon-sparkle {
  0%, 100% {
    filter:
      drop-shadow(0 2px 4px rgba(0, 0, 0, 0.7))
      drop-shadow(0 0 8px rgba(255, 215, 120, 0.48));
  }
  50% {
    filter:
      drop-shadow(0 2px 4px rgba(0, 0, 0, 0.7))
      drop-shadow(0 0 16px rgba(255, 232, 168, 0.82));
  }
}

/* Body-mounted target banner — appears at top-center of the viewport when
   a targeted hand card is armed. Subtle pulse so it stays readable without
   demanding attention. Positioned slightly below the ember HUD strip. */
.target-banner {
  position: fixed;
  top: 8vh;
  left: 50%;
  transform: translateX(-50%) translateY(-12px);
  pointer-events: none;
  z-index: 210;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 22px;
  text-align: center;
  color: rgba(255, 232, 168, 0.96);
  text-shadow:
    0 1px 2px rgba(0, 0, 0, 0.85),
    0 0 18px rgba(244, 164, 96, 0.4);
  opacity: 0;
  transition: opacity 0.22s ease, transform 0.22s cubic-bezier(0.18, 0.88, 0.22, 1);
  will-change: opacity, transform;
}
.target-banner.is-on {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
  animation: target-banner-pulse 1.8s ease-in-out infinite;
}
.target-banner-title {
  font-size: clamp(20px, 2.6vw, 28px);
  font-weight: 800;
  letter-spacing: 0.04em;
}
.target-banner-sub {
  font-size: clamp(12px, 1.2vw, 14px);
  color: rgba(255, 232, 168, 0.78);
  letter-spacing: 0.04em;
}
@keyframes target-banner-pulse {
  0%, 100% {
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.85), 0 0 14px rgba(244, 164, 96, 0.35);
    filter: brightness(1);
  }
  50% {
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.85), 0 0 22px rgba(244, 164, 96, 0.7);
    filter: brightness(1.08);
  }
}
.hand-stack {
  list-style: none;
  margin: 0;
  padding: 4px 0;
  display: flex;
  flex-direction: column;
  justify-content: flex-end; /* Dock filled cards to the bottom. */
  gap: 6px;
  min-height: 0;
  overflow: visible;
}

.hand-stack.is-crowded {
  /* When future relics raise the hand cap, keep the stack inside the left panel
     by letting cards overlap from the bottom upward instead of overflowing. */
  gap: 2px;
}
.hand-stack.is-crowded .hand-slot.hand-card {
  min-height: 70px;
  margin-top: clamp(-18px, calc(58px - var(--hand-count, 8) * 10px), 0px);
}
.hand-slot {
  border-radius: 8px;
  flex-shrink: 0;
  position: relative;
}
/* Empty slots collapse so the visual stack reads bottom-up without
   floating filled cards in the column middle. */
.hand-slot.is-empty {
  height: 0;
  border: none;
  background: transparent;
  opacity: 0;
  margin: 0;
  padding: 0;
}
.hand-slot.hand-card {
  padding: 0;
  border: 2px solid rgba(255, 232, 168, 0.3);
  background: rgba(255, 255, 255, 0.045);
  min-height: 78px;
  box-shadow:
    inset 0 0 0 1px rgba(0, 0, 0, 0.55),
    0 0 0 1px rgba(244, 164, 96, 0.12);
  transition: transform 0.18s cubic-bezier(0.2, 0.86, 0.28, 1), box-shadow 0.18s ease;
  isolation: isolate;
}
/* Drop animation runs ONLY on the first render where this uid appears.
   Without this gate, every full re-render of the hand panel would replay
   the drop on every card, which made the whole stack twitch. */
.hand-slot.hand-card.is-entering {
  animation: hand-card-drop 0.32s cubic-bezier(0.18, 0.88, 0.22, 1);
}
@keyframes hand-card-drop {
  from { transform: translateY(-12px); opacity: 0.4; }
  to { transform: translateY(0); opacity: 1; }
}
/* Used hand-card ghost: cloned into body by animateHandCardUse so the card
   visibly travels from the hand stack toward the player-card area before it
   dissolves. It reuses the original hand-card styling for theme continuity. */
.hand-use-ghost {
  position: fixed;
  z-index: 225;
  margin: 0;
  pointer-events: none;
  list-style: none;
  transform-origin: center;
  transform-style: preserve-3d;
  box-shadow:
    0 10px 28px rgba(0, 0, 0, 0.64),
    0 0 18px rgba(255, 215, 120, 0.28);
}
.hand-use-ghost.is-preview-flight {
  /* This element can also carry .hand-card-preview, so pin the flight ghost
     back to fixed positioning after the preview rules are applied. */
  position: fixed !important;
  right: auto !important;
  display: block;
  opacity: 1;
  border-radius: 14px;
  overflow: visible;
  transform: none;
  animation: none;
}
.hand-use-ghost.is-preview-flight::before {
  display: none;
}
.hand-use-ghost button { cursor: default; }
.hand-slot.is-hand-use-source {
  /* The clicked compact card should disappear quietly while the preview
     carries the actual use animation to the center. */
  opacity: 0;
  transform: translateY(2px) scale(0.985);
  filter: saturate(0.72) brightness(0.82);
}
.hand-slot.hand-card:hover,
.hand-slot.hand-card:focus-within {
  transform: translateY(-2px);
  z-index: 32;
  box-shadow:
    0 6px 18px rgba(0, 0, 0, 0.55),
    0 0 14px rgba(255, 215, 120, 0.35);
}
.hand-slot.hand-card button {
  width: 100%;
  height: 100%;
  display: grid;
  grid-template-columns: 1fr;
  align-items: end;
  gap: 0;
  padding: 8px 10px;
  /* Compact hand entries use the card illustration as their full background
     instead of confining it to the old left thumbnail box. */
  background:
    linear-gradient(90deg, rgba(12, 8, 18, 0.7), rgba(12, 8, 18, 0.2) 58%, rgba(12, 8, 18, 0.62)),
    linear-gradient(180deg, rgba(255, 232, 168, 0.06), rgba(0, 0, 0, 0.34)),
    var(--hand-card-art) center / cover no-repeat;
  border: none;
  font-family: inherit;
  font-size: 13px;
  color: var(--color-text-primary);
  cursor: pointer;
  position: relative;
  min-height: 78px;
  overflow: hidden;
}
.hand-slot.hand-card button:hover {
  background:
    linear-gradient(90deg, rgba(12, 8, 18, 0.62), rgba(255, 215, 120, 0.08) 58%, rgba(12, 8, 18, 0.56)),
    linear-gradient(180deg, rgba(255, 232, 168, 0.1), rgba(0, 0, 0, 0.28)),
    var(--hand-card-art) center / cover no-repeat;
}

.hand-card-thumb {
  position: relative;
  display: none;
  width: 44px;
  height: 56px;
  border-radius: 7px;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.3);
  box-shadow:
    inset 0 0 0 1px rgba(255, 232, 168, 0.18),
    0 2px 8px rgba(0, 0, 0, 0.45);
  clip-path: inset(0 round 7px);
}
.hand-card-thumb::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    linear-gradient(180deg, rgba(255, 232, 168, 0.08), rgba(0, 0, 0, 0.08)),
    radial-gradient(120% 95% at 50% 10%, transparent 46%, rgba(10, 7, 18, 0.38) 100%);
}
.hand-card-thumb img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
  object-position: center;
}
.hand-card .hand-card-name {
  position: relative;
  z-index: 1;
  justify-self: start;
  max-width: 100%;
  padding: 4px 7px;
  border-radius: 999px;
  background: rgba(10, 7, 16, 0.48);
  box-shadow: 0 0 12px rgba(0, 0, 0, 0.34);
  font-weight: 900;
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  letter-spacing: 0.03em;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
}
.hand-card-preview {
  display: none;
  position: absolute;
  right: calc(100% + 16px);
  top: 50%;
  width: 188px;
  aspect-ratio: 0.72;
  opacity: 0;
  pointer-events: none;
  transform: translateY(-50%) translateX(8px) rotateY(86deg);
  transform-origin: right center;
  transform-style: preserve-3d;
  z-index: 70;
  filter: drop-shadow(0 16px 28px rgba(0, 0, 0, 0.72));
}
.hand-slot.is-low-preview .hand-card-preview {
  /* Bottom hand slots otherwise clip against the viewport; anchor their
     preview by the lower edge and nudge it upward. */
  top: auto;
  bottom: -10px;
  transform: translateY(-8px) translateX(8px) rotateY(86deg);
}

.hand-card-preview::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 14px;
  background: var(--hand-card-back) center / cover no-repeat;
  backface-visibility: hidden;
  transform: rotateY(0deg);
  z-index: 2;
}
.hand-slot.hand-card:hover .hand-card-preview,
.hand-slot.hand-card:focus-within .hand-card-preview {
  display: block;
  animation: hand-preview-flip 0.62s cubic-bezier(0.16, 0.84, 0.2, 1) forwards;
}
.hand-slot.hand-card.is-arming-target .hand-card-preview {
  /* Targeted cards stay previewed after click so the cursor can leave the hand
     and pick a rail target without replaying the back-to-front flip. */
  display: block;
  opacity: 1;
  transform: translateY(-50%) translateX(0) rotateY(0deg);
  animation: none;
}
@keyframes hand-preview-flip {
  0% { opacity: 0; transform: translateY(-50%) translateX(14px) rotateY(92deg); }
  48% { opacity: 1; transform: translateY(-50%) translateX(5px) rotateY(28deg); }
  100% { opacity: 1; transform: translateY(-50%) translateX(0) rotateY(0deg); }
}
.hand-slot.is-low-preview:hover .hand-card-preview,
.hand-slot.is-low-preview:focus-within .hand-card-preview {
  animation-name: hand-preview-low-flip;
}
.hand-slot.is-low-preview.is-arming-target .hand-card-preview {
  transform: translateY(-8px) translateX(0) rotateY(0deg);
  animation: none;
}
@keyframes hand-preview-low-flip {
  0% { opacity: 0; transform: translateY(-8px) translateX(14px) rotateY(92deg); }
  48% { opacity: 1; transform: translateY(-8px) translateX(5px) rotateY(28deg); }
  100% { opacity: 1; transform: translateY(-8px) translateX(0) rotateY(0deg); }
}
.hand-slot.hand-card:hover .hand-card-preview::before,
.hand-slot.hand-card:focus-within .hand-card-preview::before {
  animation: hand-preview-back-flip 0.62s cubic-bezier(0.16, 0.84, 0.2, 1) forwards;
}
.hand-slot.hand-card.is-arming-target .hand-card-preview::before {
  opacity: 0;
  transform: rotateY(-102deg);
  animation: none;
}
@keyframes hand-preview-back-flip {
  0%, 42% { opacity: 1; transform: rotateY(0deg); }
  76%, 100% { opacity: 0; transform: rotateY(-102deg); }
}

/* Recipe hover preview: appears to the left of the hand-card preview so the
   glowing recipe-ready state names the exact combo and its payoff. */
.hand-recipe-preview {
  display: none;
  position: absolute;
  right: calc(100% + 222px);
  top: 50%;
  width: 214px;
  padding: 10px 12px;
  border-radius: 13px;
  border: 1px solid rgba(255, 215, 120, 0.44);
  background:
    linear-gradient(180deg, rgba(48, 33, 55, 0.96), rgba(15, 10, 22, 0.98)),
    radial-gradient(circle at 20% 10%, rgba(255, 215, 120, 0.18), transparent 56%);
  box-shadow:
    0 16px 30px rgba(0, 0, 0, 0.62),
    inset 0 1px 0 rgba(255, 245, 220, 0.1),
    0 0 22px rgba(244, 164, 96, 0.16);
  opacity: 0;
  pointer-events: none;
  transform: translateY(-50%) translateX(10px);
  z-index: 72;
}
.hand-slot.is-low-preview .hand-recipe-preview {
  top: auto;
  bottom: 8px;
  transform: translateY(0) translateX(10px);
}
.hand-slot.hand-card.is-recipe-ready:hover .hand-recipe-preview,
.hand-slot.hand-card.is-recipe-ready:focus-within .hand-recipe-preview {
  display: grid;
  gap: 7px;
  animation: recipe-preview-slide 0.28s cubic-bezier(0.16, 0.84, 0.2, 1) forwards;
}
.hand-recipe-preview-kicker {
  font-size: 12px;
  color: rgba(255, 215, 120, 0.78);
  letter-spacing: 0.12em;
}
.hand-recipe-preview-row {
  display: grid;
  gap: 2px;
  padding-left: 8px;
  border-left: 3px solid rgba(255, 215, 120, 0.72);
}
.hand-recipe-preview-row strong {
  color: #fff5dc;
  font-size: 15px;
  line-height: 1.2;
}
.hand-recipe-preview-row em {
  color: rgba(255, 245, 220, 0.78);
  font-size: 12px;
  font-style: normal;
  line-height: 1.35;
}
@keyframes recipe-preview-slide {
  from { opacity: 0; transform: translateY(-50%) translateX(16px); }
  to { opacity: 1; transform: translateY(-50%) translateX(0); }
}
.hand-slot.is-low-preview:hover .hand-recipe-preview,
.hand-slot.is-low-preview:focus-within .hand-recipe-preview {
  animation-name: recipe-preview-low-slide;
}
@keyframes recipe-preview-low-slide {
  from { opacity: 0; transform: translateY(0) translateX(16px); }
  to { opacity: 1; transform: translateY(0) translateX(0); }
}

.hand-cat-recovery { box-shadow: inset 4px 0 0 rgba(103, 196, 152, 0.85); }
.hand-cat-tool { box-shadow: inset 4px 0 0 rgba(255, 215, 120, 0.9); }
.hand-cat-control { box-shadow: inset 4px 0 0 rgba(145, 174, 210, 0.9); }
.hand-cat-attack { box-shadow: inset 4px 0 0 rgba(168, 58, 58, 0.9); }
.hand-slot.is-merged {
  background: rgba(255, 215, 120, 0.13);
  border-color: rgba(255, 215, 120, 0.55);
  box-shadow:
    0 0 12px rgba(255, 215, 120, 0.35),
    inset 4px 0 0 rgba(255, 215, 120, 1);
}
.hand-slot.is-merged .merged-mark {
  position: absolute;
  top: 4px;
  right: 6px;
  font-size: 12px;
  color: rgba(255, 232, 168, 0.95);
  text-shadow: 0 0 4px rgba(255, 215, 120, 0.85);
}

/* Recipe-ready hand cards glow from the left edge toward the adjacent plus/chain
   direction. The effect is intentionally soft and candle-colored so it reads as
   a hint, not as the stronger recipe-fire banner. */
.hand-slot.is-recipe-ready {
  border-color: rgba(255, 215, 120, 0.46);
  box-shadow:
    -10px 0 24px rgba(255, 182, 85, 0.22),
    -2px 0 13px rgba(255, 215, 120, 0.26),
    inset 4px 0 0 rgba(255, 215, 120, 0.95);
  animation: recipe-ready-side-glow 1.8s ease-in-out infinite;
}
.hand-slot.is-recipe-ready::before {
  content: '';
  position: absolute;
  top: 8px;
  bottom: 8px;
  left: -18px;
  width: 24px;
  border-radius: 999px;
  background: radial-gradient(ellipse at right, rgba(255, 218, 138, 0.34), rgba(255, 172, 74, 0.12) 48%, transparent 72%);
  filter: blur(1px);
  opacity: 0.8;
  pointer-events: none;
}
.hand-slot.is-recipe-ready .recipe-ready-mark {
  position: absolute;
  top: 4px;
  left: 6px;
  z-index: 1;
  font-size: 12px;
  color: rgba(255, 237, 184, 0.96);
  text-shadow: 0 0 8px rgba(255, 201, 104, 0.9);
}
@keyframes recipe-ready-side-glow {
  0%, 100% {
    box-shadow:
      -8px 0 20px rgba(255, 182, 85, 0.18),
      -2px 0 10px rgba(255, 215, 120, 0.22),
      inset 4px 0 0 rgba(255, 215, 120, 0.82);
  }
  50% {
    box-shadow:
      -15px 0 30px rgba(255, 182, 85, 0.32),
      -3px 0 16px rgba(255, 226, 154, 0.36),
      inset 4px 0 0 rgba(255, 232, 168, 1);
  }
}
.hand-slot.is-arming-target {
  outline: 2px solid var(--color-flame);
  outline-offset: -2px;
  animation: hand-arm-pulse 1.1s ease-in-out infinite;
}
@keyframes hand-arm-pulse {
  0%, 100% { box-shadow: 0 0 0 rgba(255, 215, 120, 0); }
  50% { box-shadow: 0 0 14px rgba(255, 215, 120, 0.55); }
}

/* Larger, warmer compendium panel pass: closer to the hand-card theme with
   waxed-paper panels, candle borders, and readable description sizes. */
.compendium-overlay {
  background:
    radial-gradient(circle at 50% 18%, rgba(244, 164, 96, 0.16), transparent 42%),
    rgba(8, 5, 14, 0.82);
  backdrop-filter: blur(4px) saturate(1.08);
}
.compendium-modal {
  width: min(1040px, 96vw);
  background:
    linear-gradient(180deg, rgba(53, 39, 63, 0.97), rgba(18, 14, 28, 0.99)),
    radial-gradient(circle at 50% 0%, rgba(255, 215, 120, 0.12), transparent 52%);
  border-color: rgba(244, 164, 96, 0.58);
  box-shadow:
    0 28px 64px rgba(0, 0, 0, 0.72),
    inset 0 0 0 1px rgba(255, 232, 168, 0.08),
    0 0 36px rgba(244, 164, 96, 0.14);
}
.compendium-header {
  background: linear-gradient(90deg, rgba(244, 164, 96, 0.12), rgba(255, 215, 120, 0.04), rgba(145, 174, 210, 0.08));
}
.compendium-title { font-size: 22px; }
.compendium-tabs {
  gap: 6px;
  padding: 10px 18px 0;
  background: rgba(0, 0, 0, 0.14);
}
.compendium-tab {
  min-width: 74px;
  padding: 10px 16px;
  border-color: rgba(255, 232, 168, 0.08);
  color: rgba(255, 232, 168, 0.72);
  background: rgba(255, 255, 255, 0.025);
  font-size: 15px;
}
.compendium-tab:hover {
  color: #fff5dc;
  background: rgba(244, 164, 96, 0.1);
}
.compendium-tab.is-active {
  color: #fff5dc;
  background:
    linear-gradient(180deg, rgba(244, 164, 96, 0.24), rgba(244, 164, 96, 0.09));
  box-shadow: inset 0 3px 0 rgba(255, 215, 120, 0.42);
}
.compendium-body { padding: 20px 24px; gap: 16px; }
.compendium-section { font-size: 16px; color: var(--color-flame-warm); }
.compendium-section-blurb,
.compendium-footer { font-size: 14px; }
.compendium-grid { grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 16px; }
.compendium-card {
  min-height: 248px;
  padding: 14px;
  border-radius: 14px;
  gap: 10px;
  background:
    linear-gradient(180deg, rgba(255, 245, 220, 0.07), rgba(255, 255, 255, 0.028)),
    rgba(12, 8, 18, 0.62);
  border-color: rgba(255, 232, 168, 0.16);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.08),
    0 12px 24px rgba(0, 0, 0, 0.28);
}
.compendium-card-art { height: 112px; border-radius: 11px; border: 1px solid rgba(255, 232, 168, 0.12); }
.compendium-card-name { font-size: 17px; }
.compendium-card-badge { font-size: 12px; }
.compendium-card-row { font-size: 14px; line-height: 1.35; }
.compendium-card-value .icon {
  width: 15px;
  height: 15px;
  vertical-align: -2px;
  color: var(--color-flame);
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.55));
}
.compendium-card-desc { font-size: 14px; line-height: 1.55; }
.common-card-name { font-size: 18px; }
.common-card-badge { font-size: 12px; }
.common-card-desc { font-size: 16px; }
.compendium-hand-card { min-height: 316px; height: auto; }

/* Combo tab recipe cards: mini hand cards overlap by default and fan out on
   hover/focus, matching the requested hand-card stack interaction. */
.compendium-card-art--recipe {
  min-height: 116px;
  height: 116px;
  overflow: hidden;
  background:
    radial-gradient(circle at 50% 8%, rgba(255, 215, 120, 0.12), transparent 58%),
    rgba(0, 0, 0, 0.26);
}
.compendium-recipe-stack {
  position: relative;
  width: min(100%, 240px);
  height: 102px;
  margin: 0 auto;
}
.compendium-recipe-mini {
  position: absolute;
  grid-template-rows: 44px auto;
  left: 50%;
  top: 50%;
  width: 82px;
  min-height: 98px;
  height: 98px;
  padding: 5px;
  gap: 4px;
  transform: translate(-50%, -50%) translateX(calc((var(--i, 0) - var(--recipe-center, 0)) * 18px)) rotate(calc((var(--i, 0) - var(--recipe-center, 0)) * 4deg));
  transform-origin: 50% 96%;
  transition: transform 0.28s cubic-bezier(0.16, 0.86, 0.26, 1), filter 0.28s ease, opacity 0.18s ease;
  box-shadow: 0 10px 22px rgba(0, 0, 0, 0.42);
}
.compendium-recipe-stack .compendium-recipe-mini:nth-child(1) { --i: 0; z-index: 1; }
.compendium-recipe-stack .compendium-recipe-mini:nth-child(2) { --i: 1; z-index: 2; }
.compendium-recipe-stack .compendium-recipe-mini:nth-child(3) { --i: 2; z-index: 3; }
.compendium-recipe-stack .compendium-recipe-mini:nth-child(4) { --i: 3; z-index: 4; }
.compendium-recipe-stack .compendium-recipe-mini:nth-child(5) { --i: 4; z-index: 5; }
.compendium-card:hover,
.compendium-card:focus-within {
  z-index: 6;
}
/* The actual fan-out is rendered by a body-mounted floating clone; keeping
   the in-card stack compact prevents a second expanded stack from stretching
   the recipe card's lower area under the clone. */
.compendium-card:hover .compendium-card-art--recipe .compendium-recipe-mini,
.compendium-card:focus-within .compendium-card-art--recipe .compendium-recipe-mini {
  filter: brightness(1.04);
}
/* When the detached hover fan is visible, hide the compact source stack so
   background mini-cards do not overlap with and distract from the preview. */
.compendium-card-art--recipe.is-floating .compendium-recipe-mini {
  opacity: 0;
}
.compendium-recipe-mini .common-card-art { height: 44px; min-height: 44px; border-radius: 8px; }
.compendium-recipe-mini .common-card-body { grid-template-rows: auto; min-height: 18px; gap: 1px; }
.compendium-recipe-mini .common-card-title-row { gap: 3px; }
.compendium-recipe-mini .common-card-name { font-size: 12px; line-height: 1.05; }
.compendium-recipe-mini .common-card-badge { display: none; }
.compendium-recipe-mini .common-card-desc { display: none; }
/* Recipe entries intentionally break from the larger default codex card height:
   the compact card keeps the ingredients and one effect line without the large
   blank lower area visible in the combo tab. */
.compendium-recipe-card {
  min-height: 0;
  padding: 10px;
  gap: 7px;
}
.compendium-recipe-card .compendium-card-head {
  min-height: 22px;
}
.compendium-recipe-card .compendium-card-row {
  align-items: start;
  line-height: 1.28;
}

/* Hide the hover preview immediately once a card has been accepted for use;
   only the dedicated flight ghost remains until the use animation completes. */
.hand-slot.is-hand-use-source .hand-card-preview {
  display: none !important;
  opacity: 0 !important;
  animation: none !important;
}

/* ---------- Hand-target highlighting on the rail ---------- */
.cell.card.is-hand-target {
  outline: 2px dashed rgba(255, 215, 120, 0.7);
  outline-offset: -3px;
  animation: hand-target-pulse 1.1s ease-in-out infinite;
}
.cell.is-hand-target-blocked {
  cursor: not-allowed;
  filter: grayscale(0.42) brightness(0.68) saturate(0.82);
}
.cell.is-hand-target-blocked::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: rgba(12, 6, 12, 0.34);
  pointer-events: none;
  z-index: 7;
}
.cell.empty.is-hand-target-blocked {
  border-color: rgba(168, 58, 58, 0.68);
  background:
    repeating-linear-gradient(45deg, rgba(168, 58, 58, 0.08) 0 6px, transparent 6px 12px),
    rgba(16, 8, 16, 0.28);
}
.target-block-mark {
  font-size: clamp(44px, 8vw, 104px);
  z-index: 32;
}
@keyframes hand-target-pulse {
  0%, 100% { box-shadow: 0 0 0 rgba(255, 215, 120, 0); }
  50% { box-shadow: 0 0 16px rgba(255, 215, 120, 0.45); }
}

/* ---------- Floating chain banner (top-center text glow) ----------
   The chain banner lives on the body, not inside the stage layout, so it
   never shifts other UI as the player extends the chain. Position is fixed
   near the top-center target banner language for HUD consistency. Card events
   use a restrained shared warm tone; recipe/gauge events scale up with a
   brighter glow so their trigger beats read without a circular/pill backing. */
.chain-banner {
  position: fixed;
  left: 50%;
  top: 20vh;
  transform: translateX(-50%) translateY(-10px);
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  max-width: min(78vw, 840px);
  padding: 4px 12px;
  z-index: 205;
  pointer-events: none;
  opacity: 0;
  text-align: center;
  /* Text-only glow matches the target banner/turn overlay and removes the old
     pill-like circular backing that made combo feedback feel off-tone. */
  text-shadow:
    0 1px 2px rgba(0, 0, 0, 0.92),
    0 0 18px rgba(244, 164, 96, 0.36);
  transition: opacity 0.22s ease, transform 0.22s cubic-bezier(0.18, 0.88, 0.22, 1);
}
.chain-banner.is-on {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
  pointer-events: auto;
}
.chain-banner-label {
  font-size: clamp(12px, 1.1vw, 14px);
  font-weight: 800;
  letter-spacing: 0.22em;
  color: rgba(255, 215, 120, 0.78);
  margin-right: 2px;
  text-transform: uppercase;
}
.chain-banner-arrow {
  color: rgba(255, 232, 168, 0.68);
  font-weight: 900;
  font-size: clamp(15px, 1.6vw, 20px);
  filter: drop-shadow(0 0 8px rgba(255, 215, 120, 0.35));
}
.chain-event {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0 2px;
  border-radius: 0;
  font-weight: 800;
  font-size: clamp(14px, 1.45vw, 18px);
  color: #fff5dc;
  background: transparent;
  border: 0;
  box-shadow: none;
  white-space: nowrap;
  will-change: transform, filter, text-shadow;
}
.chain-event-card.hand-cat-recovery,
.chain-event-card.hand-cat-tool,
.chain-event-card.hand-cat-control,
.chain-event-card.hand-cat-attack {
  color: rgba(255, 232, 168, 0.9);
}
.chain-event-recipe,
.chain-event-gauge {
  font-size: clamp(20px, 2.6vw, 32px);
  letter-spacing: 0.06em;
  color: rgba(255, 232, 168, 1);
  background: transparent;
  border-color: transparent;
  text-shadow:
    0 1px 2px rgba(0, 0, 0, 0.92),
    0 0 18px rgba(255, 215, 120, 0.78),
    0 0 36px rgba(244, 164, 96, 0.42);
  animation: chain-recipe-glow 1.35s ease-in-out infinite;
}
.chain-event-gauge {
  color: rgba(213, 230, 255, 1);
  text-shadow:
    0 1px 2px rgba(0, 0, 0, 0.92),
    0 0 18px rgba(145, 174, 210, 0.82),
    0 0 36px rgba(255, 215, 120, 0.22);
}
.chain-event-mark {
  color: rgba(255, 232, 168, 1);
  filter: drop-shadow(0 0 6px rgba(255, 215, 120, 0.9));
  font-weight: 900;
}
.chain-event-copy { display: inline-grid; gap: 2px; justify-items: center; }
.chain-event-name { font-weight: 800; }
.chain-event-flavor { font-size: clamp(12px, 1.05vw, 14px); color: rgba(255, 245, 220, 0.78); letter-spacing: 0.02em; }

/* Pop-in for newly added card events: scale + slight horizontal shake. */
.chain-event-card.is-new {
  animation: chain-card-pop 0.42s cubic-bezier(0.2, 1.4, 0.32, 1) 1;
}
/* Recipe events flash brighter on entry, layered on top of the steady glow. */
.chain-event-recipe.is-new,
.chain-event-gauge.is-new {
  animation:
    chain-recipe-burst 0.6s cubic-bezier(0.16, 0.88, 0.3, 1) 1,
    chain-recipe-glow 1.4s ease-in-out infinite 0.6s;
}

@keyframes chain-card-pop {
  0%   { transform: scale(0.55) translateX(0);  opacity: 0; filter: brightness(1.8); }
  40%  { transform: scale(1.22) translateX(-3px); opacity: 1; filter: brightness(1.28); }
  55%  { transform: scale(1.05) translateX(4px); }
  70%  { transform: scale(1.1) translateX(-2px); }
  100% { transform: scale(1) translateX(0); filter: brightness(1); }
}
@keyframes chain-recipe-burst {
  0%   {
    transform: scale(0.6) rotate(0deg);
    opacity: 0;
    filter: brightness(2.4) saturate(1.6);
    text-shadow:
      0 1px 2px rgba(0, 0, 0, 0.92),
      0 0 34px rgba(255, 215, 120, 1),
      0 0 68px rgba(244, 164, 96, 0.9);
  }
  22%  { transform: scale(1.18) rotate(-2.8deg); }
  34%  { transform: scale(1.08) rotate(2.4deg); }
  45%  {
    transform: scale(1.16) rotate(-1.2deg);
    opacity: 1;
    filter: brightness(1.6) saturate(1.3);
  }
  72%  { transform: scale(0.98) rotate(0.8deg); }
  100% { transform: scale(1) rotate(0deg); filter: brightness(1) saturate(1); }
}
@keyframes chain-recipe-glow {
  0%, 100% {
    filter: brightness(1);
    text-shadow:
      0 1px 2px rgba(0, 0, 0, 0.92),
      0 0 16px rgba(255, 215, 120, 0.58),
      0 0 30px rgba(244, 164, 96, 0.34);
  }
  50% {
    filter: brightness(1.14);
    text-shadow:
      0 1px 2px rgba(0, 0, 0, 0.92),
      0 0 24px rgba(255, 215, 120, 0.92),
      0 0 46px rgba(244, 164, 96, 0.58);
  }
}

.chain-banner-reset {
  width: 24px;
  height: 24px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.22);
  background: rgba(20, 16, 28, 0.7);
  color: var(--color-flame);
  cursor: pointer;
  font-weight: 800;
  font-family: inherit;
  font-size: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-left: 4px;
}
.chain-banner-reset:hover { background: rgba(244, 164, 96, 0.18); }

/* Melt/recipe highlight in the activity log. */
.score-log-gauge {
  box-shadow: inset 3px 0 0 rgba(145, 174, 210, 1);
  background: rgba(145, 174, 210, 0.1);
}
.score-log-gauge .score-log-delta { color: rgba(213, 230, 255, 1); }
.score-log-melt {
  box-shadow: inset 3px 0 0 rgba(255, 215, 120, 1);
  background: rgba(255, 215, 120, 0.08);
}
.score-log-melt .score-log-delta { color: rgba(255, 232, 168, 1); }
/* Wax hardening: a white shell overlay plus a small turn badge. */
.cell.card.is-freeze-triggering {
  animation: wax-freeze-impact 0.42s cubic-bezier(0.16, 0.9, 0.18, 1);
  z-index: 8;
}
.cell.card.is-freeze-triggering .card-face::before {
  content: '';
  position: absolute;
  inset: -2px;
  border-radius: inherit;
  border: 2px solid rgba(246, 250, 255, 0.9);
  box-shadow: 0 0 22px rgba(214, 228, 238, 0.62);
  pointer-events: none;
}
@keyframes wax-freeze-impact {
  0% { transform: scale(1); filter: brightness(1) saturate(1); }
  45% { transform: scale(1.08); filter: brightness(1.42) saturate(0.72); }
  100% { transform: scale(1); filter: brightness(1.08) saturate(0.86); }
}
.cell.card.is-wax-thawing {
  animation: wax-thaw-crack 0.62s cubic-bezier(0.16, 0.9, 0.18, 1);
  z-index: 9;
}
@keyframes wax-thaw-crack {
  0% { transform: scale(1); filter: brightness(1.02) saturate(0.88); }
  42% { transform: scale(1.045); filter: brightness(1.36) saturate(0.72); }
  100% { transform: scale(1); filter: brightness(1) saturate(1); }
}
.cell.card.is-frozen .card-face::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.34), rgba(232, 238, 246, 0.08)),
    repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.22) 0 4px, transparent 4px 12px);
  mix-blend-mode: screen;
  pointer-events: none;
  animation: wax-harden-shimmer 1.6s ease-in-out infinite alternate;
}
.frozen-badge {
  position: absolute;
  top: 6px;
  left: 8px;
  z-index: 6;
  padding: 2px 7px;
  border-radius: 999px;
  color: #1c1424;
  background: rgba(241, 245, 249, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.8);
  font-size: 12px;
  font-weight: 900;
  box-shadow: 0 0 12px rgba(255, 255, 255, 0.36);
}
@keyframes wax-harden-shimmer {
  from { opacity: 0.72; filter: brightness(1); }
  to { opacity: 0.95; filter: brightness(1.18); }
}
.shield-badge {
  position: absolute;
  right: 8px;
  top: 8px;
  z-index: 5;
  min-width: 34px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #fff9dd;
  filter: drop-shadow(0 2px 5px rgba(0, 0, 0, 0.62));
}
.shield-badge-icon {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(93, 126, 174, 0.96);
}
.shield-badge-icon .icon {
  width: 100%;
  height: 100%;
  stroke: rgba(218, 235, 255, 0.95);
  stroke-width: 2.4;
}
.shield-badge-value {
  position: relative;
  z-index: 1;
  margin-top: 1px;
  color: #fff7d8;
  font-size: 14px;
  font-weight: 950;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  text-shadow:
    0 1px 2px rgba(0, 0, 0, 0.95),
    0 0 7px rgba(255, 232, 168, 0.7);
}

.damage-float {
  position: fixed;
  z-index: 240;
  pointer-events: none;
  /* Damage numbers use the same oxblood/ember family as SquareBurst damage,
     but bias the fill toward readable crimson so floating hits feel dangerous
     instead of looking like pale healing or treasure feedback. */
  color: #ff3f32;
  font-size: clamp(30px, 4.2vw, 58px);
  font-weight: 950;
  line-height: 1;
  letter-spacing: 0.02em;
  font-family: var(--font-family-display);
  text-shadow:
    0 2px 2px rgba(0, 0, 0, 0.96),
    0 0 8px rgba(255, 63, 50, 0.96),
    0 0 20px rgba(176, 28, 34, 0.9),
    0 0 34px rgba(244, 83, 49, 0.5);
  -webkit-text-stroke: 1px rgba(74, 8, 13, 0.86);
}


/* Restored codex scrolling while hovered recipe previews escape via the
   body-mounted .compendium-recipe-float clone rather than by disabling scroll. */
.compendium-modal {
  overflow: visible;
}
.compendium-body {
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 0;
}
.compendium-recipe-float {
  position: fixed;
  z-index: 270;
  pointer-events: none;
  margin: 0;
  transform: translateZ(0);
}
.compendium-recipe-float .compendium-recipe-mini {
  transform: translate(-50%, -50%) translateX(calc((var(--i, 0) - var(--recipe-center, 0)) * 66px)) rotate(calc((var(--i, 0) - var(--recipe-center, 0)) * 9deg));
  filter: brightness(1.08);
}
.compendium-relic-owned {
  border-color: rgba(255, 215, 120, 0.48);
  box-shadow: inset 0 1px 0 rgba(255, 232, 168, 0.12), 0 0 22px rgba(244, 164, 96, 0.18);
}
.compendium-relic-card .compendium-card-art--sprite,
.compendium-relic-owned .compendium-card-art--sprite {
  background-size: cover;
  background-position: center 20%;
  box-shadow: inset 0 -44px 54px rgba(13, 9, 19, 0.76);
}

/* Owned relics now match the player-card height and wrap vertically inside a
   warm themed scroll well instead of drifting sideways in a horizontal strip. */
.relic-layer {
  align-self: stretch;
  height: 100%;
  max-height: clamp(150px, 17vw, 200px);
  align-items: stretch;
  padding: 6px;
  overflow: hidden;
}
.relic-stack {
  width: 100%;
  max-width: clamp(150px, 17vw, 200px);
  height: 100%;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(58px, 1fr));
  grid-auto-rows: minmax(76px, 1fr);
  align-content: start;
  gap: 7px;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 3px 5px 4px 2px;
  scrollbar-width: thin;
  scrollbar-color: rgba(244, 164, 96, 0.72) rgba(20, 16, 28, 0.5);
}
.relic-stack::-webkit-scrollbar { width: 5px; }
.relic-stack::-webkit-scrollbar-track {
  background: rgba(20, 16, 28, 0.48);
  border-radius: 999px;
  box-shadow: inset 0 0 0 1px rgba(255, 232, 168, 0.08);
}
.relic-stack::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: linear-gradient(180deg, var(--color-flame), var(--color-flame-deep));
  box-shadow: 0 0 8px rgba(244, 164, 96, 0.36);
}
.relic-mini-card {
  width: 100%;
  min-width: 0;
}
.relic-hover-preview {
  display: none;
  position: fixed;
  left: 0;
  top: 0;
  width: 190px;
  aspect-ratio: 0.72;
  opacity: 0;
  pointer-events: none;
  transform: translateY(-50%) translateX(-10px) rotateY(-88deg);
  transform-origin: left center;
  transform-style: preserve-3d;
  z-index: 120;
  filter: drop-shadow(0 16px 28px rgba(0, 0, 0, 0.72));
}
.relic-hover-preview::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 2;
  border-radius: 14px;
  background: var(--hand-card-back) center / cover no-repeat;
  backface-visibility: hidden;
  transform: rotateY(0deg);
}
.relic-mini-card:hover .relic-hover-preview,
.relic-mini-card:focus-within .relic-hover-preview {
  display: block;
  animation: relic-preview-flip 0.62s cubic-bezier(0.16, 0.84, 0.2, 1) forwards;
}
.relic-mini-card:hover .relic-hover-preview::before,
.relic-mini-card:focus-within .relic-hover-preview::before {
  animation: relic-preview-back-flip 0.62s cubic-bezier(0.16, 0.84, 0.2, 1) forwards;
}
.relic-preview-card {
  min-height: 264px;
  border-color: rgba(255, 215, 120, 0.58);
  background:
    radial-gradient(circle at 50% 0%, rgba(255, 215, 120, 0.18), transparent 56%),
    linear-gradient(180deg, rgba(48, 34, 43, 0.99), rgba(13, 9, 19, 0.99));
}
.relic-preview-card .common-card-art {
  border-radius: 999px 999px 12px 12px;
  box-shadow:
    inset 0 -34px 46px rgba(13, 9, 19, 0.7),
    0 0 18px rgba(255, 215, 120, 0.16);
}
.relic-preview-card .common-card-badge {
  color: rgba(255, 232, 168, 0.96);
  border-color: rgba(255, 215, 120, 0.56);
  background: rgba(128, 77, 33, 0.28);
}
@keyframes relic-preview-flip {
  0% { opacity: 0; transform: translateY(-50%) translateX(-14px) rotateY(-92deg); }
  48% { opacity: 1; transform: translateY(-50%) translateX(-5px) rotateY(-28deg); }
  100% { opacity: 1; transform: translateY(-50%) translateX(0) rotateY(0deg); }
}
@keyframes relic-preview-back-flip {
  0%, 42% { opacity: 1; transform: rotateY(0deg); }
  76%, 100% { opacity: 0; transform: rotateY(102deg); }
}

/* Shop polish: waxed-card frames, candlelit price buttons, and the same
   recessed scrollbar treatment used by the codex/relic layer. */
.shop-modal {
  scrollbar-width: thin;
  scrollbar-color: rgba(244, 164, 96, 0.72) rgba(20, 16, 28, 0.5);
  background:
    radial-gradient(circle at 18% 0%, rgba(255, 215, 120, 0.2), transparent 33%),
    radial-gradient(circle at 86% 8%, rgba(145, 174, 210, 0.08), transparent 30%),
    linear-gradient(160deg, rgba(48, 34, 43, 0.99), rgba(13, 9, 19, 0.99));
}
.shop-modal::-webkit-scrollbar { width: 6px; }
.shop-modal::-webkit-scrollbar-track { background: rgba(20, 16, 28, 0.48); border-radius: 999px; }
.shop-modal::-webkit-scrollbar-thumb { background: linear-gradient(180deg, var(--color-flame), var(--color-flame-deep)); border-radius: 999px; }
.shop-relic-card {
  border-color: rgba(255, 232, 168, 0.2);
  background:
    linear-gradient(180deg, rgba(255, 245, 220, 0.06), rgba(255, 255, 255, 0.018)),
    linear-gradient(180deg, rgba(45, 30, 39, 0.98), rgba(18, 12, 24, 0.98));
}
.shop-relic-card:hover {
  transform: translateY(-2px);
  border-color: rgba(255, 215, 120, 0.48);
  box-shadow: inset 0 1px 0 rgba(255, 232, 168, 0.2), 0 18px 30px rgba(0, 0, 0, 0.54), 0 0 22px rgba(244, 164, 96, 0.14);
}
.shop-buy-btn:not(:disabled):hover,
.shop-close-btn:hover {
  filter: brightness(1.08);
  box-shadow: 0 10px 22px rgba(0, 0, 0, 0.34), 0 0 16px rgba(255, 215, 120, 0.24);
}

/* Relic activations appear as a small toast-like line under the active chain. */
.chain-event-relic {
  flex-basis: 100%;
  justify-content: center;
  margin-top: -2px;
  font-size: clamp(13px, 1.3vw, 16px);
  color: rgba(255, 232, 168, 0.92);
  letter-spacing: 0.03em;
  text-shadow:
    0 1px 2px rgba(0, 0, 0, 0.94),
    0 0 14px rgba(244, 164, 96, 0.52);
}
.chain-event-relic .chain-event-mark {
  color: rgba(255, 215, 120, 0.96);
}
.chain-event-relic.is-new {
  animation: chain-card-pop 0.42s cubic-bezier(0.2, 1.4, 0.32, 1) 1;
}
.score-log-relic {
  box-shadow: inset 3px 0 0 rgba(255, 215, 120, 0.9);
  background: rgba(244, 164, 96, 0.09);
}
.score-log-relic .score-log-delta { color: rgba(255, 232, 168, 1); }

/* Lit bombs borrow the existing danger pulse but shift to a red-hot fuse flicker. */
.cell.card.type-trap.trap-bomb.is-bomb-armed {
  animation: bomb-fuse-flicker 0.45s steps(2, end) infinite;
  border-color: rgba(255, 92, 72, 0.95);
}
.cell.card.type-trap.trap-bomb.is-bomb-armed .card-overlay {
  background: radial-gradient(circle at 50% 40%, rgba(255, 84, 42, 0.35), rgba(72, 9, 9, 0.45) 72%);
}
@keyframes bomb-fuse-flicker {
  0%, 100% { filter: saturate(1.1); box-shadow: var(--card-depth-shadow), 0 0 14px rgba(255, 76, 48, 0.42); }
  50% { filter: saturate(1.8) brightness(1.12); box-shadow: var(--card-depth-shadow), 0 0 26px rgba(255, 42, 28, 0.88); }
}
.spore-badge { border-color: rgba(147, 209, 118, 0.7); color: rgba(220, 255, 190, 0.95); }
.bomb-badge { border-color: rgba(255, 92, 72, 0.72); color: rgba(255, 214, 190, 0.98); }

`
