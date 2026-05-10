/**
 * HandSystem - Hand of consumable cards with chain-recipe combos.
 *
 * Core mechanics:
 *   1. Hand stacks bottom-up (slot 0 = bottom). New drops fall to the
 *      lowest empty slot.
 *   2. When three consecutive same-defId cards sit in the stack they
 *      auto-merge into a single enhanced "merged" card at that slot.
 *   3. The player clicks a card to USE it. The card runs its single (or
 *      merged-enhanced) effect and is appended to the active CHAIN.
 *   4. After every use we re-scan the recipe book. Any recipe whose
 *      ingredient multiset is contained in the chain — and that has not
 *      already fired this chain — fires as an additional effect.
 *   5. The chain resets on a board action or on turn end.
 */

import { GameState } from '@core/GameState'
import { Card, CardType } from '@entities/Card'
import { Character } from '@entities/Character'
import { LANE_DISTANCE_COUNT } from '@entities/Lane'
import {
  HandCard,
  HandCardId,
  HandCardDefinition,
} from '@entities/HandCard'
import { getHandCardDef } from '@data/HandCards'
import { Recipe, RECIPES } from '@data/Recipes'
import { DropSystem } from './DropSystem'

export interface HandTarget {
  laneIndex: number
  distance: number
  card: Card
}

export interface FiredRecipe {
  recipe: Recipe
  /** Short message describing what the recipe did. */
  message: string
}

/** Tracks a single card removed from the board so the UI can play its
 *  consume animation BEFORE the next render erases it. */
export interface RemovedFieldCard {
  cardId: string
  type: CardType
}

export interface HandUseResult {
  success: boolean
  /** Single-card effect message. */
  message: string
  /** Cards that auto-merged or were absorbed by a merge after this use. */
  mergeMessages: string[]
  /** Recipes that fired as a result of extending the chain. */
  firedRecipes: FiredRecipe[]
  /** Field cards removed during this hand use (single effect + recipes).
   *  Order is not guaranteed; the renderer animates all of them together. */
  removedFieldCards: RemovedFieldCard[]
}

/**
 * The active chain. Lives on the GameState to survive hand re-renders. We
 * track:
 *   - sequence: defIds in the order they were used
 *   - firedRecipeIds: recipe ids already triggered for this chain
 */
export interface ChainState {
  sequence: HandCardId[]
  firedRecipeIds: Set<string>
}

export class HandSystem {
  /** Build a fresh empty chain. */
  static newChain(): ChainState {
    return { sequence: [], firedRecipeIds: new Set() }
  }

  /** Reset the chain in-place (board action / turn end). */
  static resetChain(chain: ChainState): void {
    chain.sequence = []
    chain.firedRecipeIds = new Set()
  }

  /** Insert a freshly drawn drop into the hand at the bottom-most empty slot. */
  static enqueueDrop(character: Character, card: HandCard): boolean {
    const ok = character.addHandCard(card)
    if (ok) HandSystem.runAutoMerges(character)
    return ok
  }

  /** Snapshot every Card present on the field, keyed by id → type. Used to
   *  diff what got removed across an effect application so the UI can play
   *  consume animations on the right cells. */
  private static snapshotFieldCards(gs: GameState): Map<string, CardType> {
    const m = new Map<string, CardType>()
    for (const lane of gs.lanes) {
      for (let d = 0; d < LANE_DISTANCE_COUNT; d++) {
        const c = lane.getCardAtDistance(d)
        if (c) m.set(c.id, c.type)
      }
    }
    return m
  }

  /** Run a single use on slot `slotIndex`. Extends chain and fires recipes. */
  static useSingle(
    gs: GameState,
    chain: ChainState,
    slotIndex: number,
    target?: HandTarget,
  ): HandUseResult {
    const character = gs.character
    const card = character.hand[slotIndex]
    if (!card) {
      return {
        success: false,
        message: '비어 있는 슬롯',
        mergeMessages: [],
        firedRecipes: [],
        removedFieldCards: [],
      }
    }
    const def = getHandCardDef(card.defId)
    if (def.needsTarget && !target) {
      return {
        success: false,
        message: `${def.name}은(는) 대상을 골라야 해`,
        mergeMessages: [],
        firedRecipes: [],
        removedFieldCards: [],
      }
    }

    // Snapshot the field BEFORE any mutation so we can diff removals after.
    const beforeField = HandSystem.snapshotFieldCards(gs)

    // Apply the card effect (merged cards use the enhanced version).
    const message = card.merged
      ? HandSystem.applyTripleEffect(gs, def)
      : HandSystem.applySingleEffect(gs, def, target)

    character.removeHandCardAt(slotIndex)

    // Extend the chain. Merged cards count as a single instance for recipe
    // matching but tend to satisfy several sub-recipes through their effect.
    chain.sequence.push(card.defId)

    // Fire any recipes newly satisfied by this chain.
    const firedRecipes = HandSystem.fireMatchedRecipes(gs, chain)

    // Auto-merge passes after an effect can free up structure (e.g., card
    // moved between slots due to splice; rare but covered).
    const mergeMessages = HandSystem.runAutoMerges(character)

    // Each card use also charges the candle gauge a small amount.
    character.gainCandle(def.candleGain)

    // Diff the field snapshot to record removed cards for animation.
    const afterField = HandSystem.snapshotFieldCards(gs)
    const removedFieldCards: RemovedFieldCard[] = []
    for (const [id, type] of beforeField.entries()) {
      if (!afterField.has(id)) removedFieldCards.push({ cardId: id, type })
    }

    return {
      success: true,
      message,
      mergeMessages,
      firedRecipes,
      removedFieldCards,
    }
  }

  /** Multiset count of `id` in the chain sequence. */
  private static countInChain(chain: ChainState, id: HandCardId): number {
    let n = 0
    for (const d of chain.sequence) if (d === id) n++
    return n
  }

  /** Recipe is contained in chain when each ingredient count is satisfied. */
  private static recipeMatches(recipe: Recipe, chain: ChainState): boolean {
    for (const [id, needed] of Object.entries(recipe.ingredients)) {
      if (!needed) continue
      if (HandSystem.countInChain(chain, id as HandCardId) < needed) return false
    }
    return true
  }

  private static fireMatchedRecipes(
    gs: GameState,
    chain: ChainState,
  ): FiredRecipe[] {
    const fired: FiredRecipe[] = []
    // Sort by ingredient size ascending so smaller recipes resolve first; that
    // mirrors the player's intuition that "밀랍 돌진" fires before "밀랍 타격".
    const sorted = [...RECIPES].sort((a, b) => a.totalCount - b.totalCount)
    for (const recipe of sorted) {
      if (chain.firedRecipeIds.has(recipe.id)) continue
      if (!HandSystem.recipeMatches(recipe, chain)) continue
      const message = HandSystem.applyRecipeEffect(gs, recipe)
      chain.firedRecipeIds.add(recipe.id)
      fired.push({ recipe, message })
    }
    return fired
  }

  /** Apply a recipe's effect against the GameState. */
  private static applyRecipeEffect(gs: GameState, recipe: Recipe): string {
    const c = gs.character
    switch (recipe.effect) {
      case 'destroy-front-enemy': {
        const target = HandSystem.findFirstActive(gs, [CardType.ENEMY])
        if (!target) return '활성 적이 없어 효과 없음'
        gs.removeCardFromRow(target.card, target.distance)
        return `${target.card.name} 즉시 처치`
      }
      case 'damage-all-front': {
        let count = 0
        const seen = new Set<Card>()
        for (let lane = 0; lane < gs.lanes.length; lane++) {
          const card = gs.lanes[lane].getCardAtDistance(0)
          if (!card || seen.has(card)) continue
          if (card.type !== CardType.ENEMY) continue
          seen.add(card)
          card.takeDamage(5)
          if (card.getHealth() <= 0) {
            gs.removeCardFromRow(card, 0)
          }
          count++
        }
        return `활성 적 ${count}체에 5 피해`
      }
      case 'lane-burn-zero-one': {
        // Burn the closest enemy/trap pair on a randomly chosen lane.
        const laneIndex = Math.floor(Math.random() * gs.lanes.length)
        const lane = gs.lanes[laneIndex]
        const removed: string[] = []
        const seen = new Set<Card>()
        for (let d = 0; d < 2; d++) {
          const card = lane.getCardAtDistance(d)
          if (!card || seen.has(card)) continue
          if (card.type === CardType.ENEMY || card.type === CardType.TRAP) {
            seen.add(card)
            gs.removeCardFromRow(card, d)
            removed.push(card.name)
          }
        }
        return removed.length > 0 ? `${removed.join(', ')} 점화` : '도화선 점화 (대상 없음)'
      }
      case 'freeze-all': {
        const cleared = HandSystem.clearAllOfTypes(gs, [
          CardType.ENEMY,
          CardType.TRAP,
        ])
        return `${cleared}개 카드 시간 정지`
      }
      case 'cleanse-and-restore':
        c.gainCandle(5)
        return '필드 정화 + 양초 +5'
      case 'open-all-treasures': {
        const treasures = HandSystem.collectAllOfType(gs, CardType.TREASURE)
        treasures.forEach((card) => {
          for (let d = 0; d < 4; d++) gs.removeCardFromRow(card, d)
        })
        for (let i = 0; i < treasures.length * 2; i++) {
          if (!c.hasHandRoom()) break
          c.addHandCard(DropSystem.generateDrop())
        }
        HandSystem.runAutoMerges(c)
        return `보물 ${treasures.length}개 획득`
      }
      case 'multi-burn': {
        let cleared = 0
        for (let lane = 0; lane < gs.lanes.length; lane++) {
          for (let d = 0; d < 2; d++) {
            const card = gs.lanes[lane].getCardAtDistance(d)
            if (
              card &&
              (card.type === CardType.ENEMY || card.type === CardType.TRAP)
            ) {
              gs.removeCardFromRow(card, d)
              cleared++
            }
          }
        }
        return `광역 점화로 ${cleared}개 카드 처치`
      }
      case 'overflow-melt': {
        const cleared = HandSystem.clearAllOfTypes(gs, [
          CardType.ENEMY,
          CardType.TRAP,
          CardType.TREASURE,
        ])
        c.fullHeal()
        c.gainEmber(5)
        let cards = 0
        while (c.hasHandRoom() && cards < 5) {
          c.addHandCard(DropSystem.generateDrop())
          cards++
        }
        HandSystem.runAutoMerges(c)
        return `소녀의 녹임 — 카드 ${cleared}장 제거, HP 풀, 불씨 +5, 손패 +${cards}`
      }
    }
    return ''
  }

  /** Apply a hand card's single-use effect. Returns a short message. */
  private static applySingleEffect(
    gs: GameState,
    def: HandCardDefinition,
    target?: HandTarget,
  ): string {
    const c = gs.character
    switch (def.id) {
      case 'small-candle': {
        const healed = c.heal(2)
        return `체력 +${healed}`
      }
      case 'large-candle': {
        const healed = c.heal(5)
        return `체력 +${healed}`
      }
      case 'wax-shield':
        c.addDamageShield(1, 2)
        return '다음 턴 받는 피해 -2'
      case 'matchstick': {
        if (target) {
          gs.removeCardFromRow(target.card, target.distance)
          return `${target.card.name} 발화`
        }
        return '대기 카드를 골라야 해'
      }
      case 'brass-key':
        c.gainEmber(2)
        return '잠긴 보물 없어 불씨 +2'
      case 'cooled-candle': {
        if (target) {
          gs.removeCardFromRow(target.card, target.distance)
          return `${target.card.name} 시간 정지`
        }
        return '대상 없음'
      }
      case 'cleansing-ember':
        c.gainCandle(2)
        return '정화할 대상 없어 양초 +2'
      case 'match-bundle': {
        if (target) {
          const removed = HandSystem.burnLane(gs, target.laneIndex)
          return removed.length > 0
            ? `${removed.join(', ')} 발화`
            : `${target.card.name} 점화`
        }
        return '대상 라인을 골라야 해'
      }
    }
    return ''
  }

  /** Apply the enhanced merged-card effect. */
  private static applyTripleEffect(
    gs: GameState,
    def: HandCardDefinition,
  ): string {
    const c = gs.character
    switch (def.id) {
      case 'small-candle': {
        const healed = c.heal(6)
        c.addDamageShield(1, 1)
        return `합성 체력 +${healed}, 다음 턴 피해 -1`
      }
      case 'large-candle': {
        const healed = c.fullHeal()
        return `합성 체력 풀 회복 (+${healed})`
      }
      case 'wax-shield':
        c.addDamageShield(2, 99)
        return '합성 피해 무효 2턴'
      case 'matchstick': {
        const names: string[] = []
        for (let i = 0; i < 3; i++) {
          const removed = HandSystem.removeRandomCard(gs, [
            CardType.ENEMY,
            CardType.TRAP,
          ])
          if (removed) names.push(removed.name)
        }
        return names.length > 0 ? `합성 발화 ${names.join(', ')}` : '대상 없음'
      }
      case 'brass-key': {
        const treasures = HandSystem.collectAllOfType(gs, CardType.TREASURE)
        treasures.forEach((card) => {
          for (let d = 0; d < 4; d++) gs.removeCardFromRow(card, d)
        })
        c.gainEmber(3)
        for (let i = 0; i < treasures.length * 2; i++) {
          if (!c.hasHandRoom()) break
          c.addHandCard(DropSystem.generateDrop())
        }
        HandSystem.runAutoMerges(c)
        return `합성 보물 ${treasures.length}개 + 불씨 +3`
      }
      case 'cooled-candle': {
        const cleared = HandSystem.clearAllOfTypes(gs, [
          CardType.ENEMY,
          CardType.TRAP,
        ])
        return `합성 시간 정지 (${cleared}개)`
      }
      case 'cleansing-ember':
        c.gainCandle(5)
        return '합성 정화 + 양초 +5'
      case 'match-bundle': {
        let cleared = 0
        for (let lane = 0; lane < gs.lanes.length; lane++) {
          for (let d = 0; d < 2; d++) {
            const card = gs.lanes[lane].getCardAtDistance(d)
            if (
              card &&
              (card.type === CardType.ENEMY || card.type === CardType.TRAP)
            ) {
              gs.removeCardFromRow(card, d)
              cleared++
            }
          }
        }
        return `합성 광역 점화 (${cleared}개)`
      }
    }
    return ''
  }

  /**
   * Scan the hand for runs of three consecutive same-defId cards. Each run
   * collapses into a single merged card at the lowest slot of the run.
   * Returns a list of human-readable merge messages for logging.
   */
  static runAutoMerges(character: Character): string[] {
    const messages: string[] = []
    let didChange = true
    let safety = 32
    while (didChange && safety-- > 0) {
      didChange = false
      const hand = character.hand
      for (let i = 0; i + 2 < hand.length; i++) {
        const a = hand[i]
        const b = hand[i + 1]
        const c = hand[i + 2]
        if (!a || !b || !c) continue
        // Already-merged cards do not stack into another merged card; otherwise
        // a flood of duplicates could chain into massive auto-effects.
        if (a.merged || b.merged || c.merged) continue
        if (a.defId === b.defId && b.defId === c.defId) {
          const def = getHandCardDef(a.defId)
          // Splice 3 → 1 merged card at slot i.
          hand.splice(i, 3, {
            uid: `${a.defId}-merged-${a.uid}`,
            defId: a.defId,
            merged: true,
          })
          messages.push(`${def.name} ×3 자동 합성`)
          didChange = true
          break
        }
      }
    }
    return messages
  }

  /** Find the first active-row card of any of the listed types. */
  private static findFirstActive(
    gs: GameState,
    types: CardType[],
  ): { card: Card; laneIndex: number; distance: number } | null {
    for (let lane = 0; lane < gs.lanes.length; lane++) {
      const card = gs.lanes[lane].getCardAtDistance(0)
      if (card && types.includes(card.type)) {
        return { card, laneIndex: lane, distance: 0 }
      }
    }
    return null
  }

  /** Pick a random card on the rail of one of the given types and remove it. */
  private static removeRandomCard(
    gs: GameState,
    types: CardType[],
  ): Card | null {
    const candidates: Array<{ card: Card; distance: number }> = []
    const seen = new Set<Card>()
    for (const lane of gs.lanes) {
      for (let d = 0; d < 4; d++) {
        const card = lane.getCardAtDistance(d)
        if (!card || seen.has(card)) continue
        if (types.includes(card.type)) {
          seen.add(card)
          candidates.push({ card, distance: d })
        }
      }
    }
    if (candidates.length === 0) return null
    const pick = candidates[Math.floor(Math.random() * candidates.length)]
    gs.removeCardFromRow(pick.card, pick.distance)
    return pick.card
  }

  private static burnLane(gs: GameState, laneIndex: number): string[] {
    const lane = gs.lanes[laneIndex]
    if (!lane) return []
    const removed: string[] = []
    const seen = new Set<Card>()
    for (let d = 0; d < 2; d++) {
      const card = lane.getCardAtDistance(d)
      if (!card || seen.has(card)) continue
      if (card.type === CardType.ENEMY || card.type === CardType.TRAP) {
        seen.add(card)
        gs.removeCardFromRow(card, d)
        removed.push(card.name)
      }
    }
    return removed
  }

  private static collectAllOfType(gs: GameState, type: CardType): Card[] {
    const out: Card[] = []
    const seen = new Set<Card>()
    for (const lane of gs.lanes) {
      for (let d = 0; d < 4; d++) {
        const card = lane.getCardAtDistance(d)
        if (!card || seen.has(card)) continue
        if (card.type === type) {
          seen.add(card)
          out.push(card)
        }
      }
    }
    return out
  }

  private static clearAllOfTypes(gs: GameState, types: CardType[]): number {
    const seen = new Set<Card>()
    let count = 0
    for (const lane of gs.lanes) {
      for (let d = 0; d < 4; d++) {
        const card = lane.getCardAtDistance(d)
        if (!card || seen.has(card)) continue
        if (types.includes(card.type)) {
          seen.add(card)
          gs.removeCardFromRow(card, d)
          count++
        }
      }
    }
    return count
  }
}
