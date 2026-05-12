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
import { HandCard, HandCardId, HandCardDefinition } from '@entities/HandCard'
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
  /** Field cards removed by the single hand-card effect only. Recipe removals
   *  are reported by firePendingRecipes after the UI delay. */
  removedFieldCards: RemovedFieldCard[]
  /** Currency gained by a coin hand card; UI applies it to the shop wallet. */
  coinsGained?: number
}

export interface RecipeFireResult {
  /** Recipes that fired after the chain-delay beat. */
  firedRecipes: FiredRecipe[]
  /** Field cards removed by those delayed recipe effects. */
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

  /** Run a single use on slot `slotIndex`; recipe firing is delayed by index.ts. */
  static useSingle(
    gs: GameState,
    chain: ChainState,
    slotIndex: number,
    target?: HandTarget
  ): HandUseResult {
    const character = gs.character
    const card = character.hand[slotIndex]
    if (!card) {
      return { success: false, message: '비어 있는 슬롯', mergeMessages: [], removedFieldCards: [] }
    }
    const def = getHandCardDef(card.defId)
    if (!HandSystem.isValidTarget(def, target, card.merged === true)) {
      return {
        success: false,
        message: `${def.name}은(는) 조건에 맞는 대상을 골라야 해`,
        mergeMessages: [],
        removedFieldCards: [],
      }
    }

    // Snapshot the field BEFORE any mutation so we can diff removals after.
    const beforeField = HandSystem.snapshotFieldCards(gs)

    // Apply the card effect (merged cards use the enhanced version).
    const message = card.merged
      ? HandSystem.applyTripleEffect(gs, def, target)
      : HandSystem.applySingleEffect(gs, def, target)

    character.removeHandCardAt(slotIndex)

    // Extend the chain. Merged cards count as one played card, while the new
    // '카드' item appends extra virtual uses to raise the hand-combo count.
    chain.sequence.push(card.defId)
    if (card.defId === 'card') {
      const bonusComboCount = card.merged ? 5 : 1
      for (let i = 0; i < bonusComboCount; i++) chain.sequence.push(card.defId)
    }

    // Recipes are deliberately resolved later by firePendingRecipes(), which
    // gives the UI a readable beat between the card effect and combo explosion.
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
      removedFieldCards,
      coinsGained: card.defId === 'coin' ? (card.merged ? 5 : 1) : 0,
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

  /** Check whether the current chain has at least one newly satisfied recipe. */
  static hasPendingRecipe(chain: ChainState): boolean {
    for (const recipe of RECIPES) {
      if (chain.firedRecipeIds.has(recipe.id)) continue
      if (HandSystem.recipeMatches(recipe, chain)) return true
    }
    return false
  }

  /** Fire recipes that became available after the most recent hand-card use. */
  static firePendingRecipes(gs: GameState, chain: ChainState): RecipeFireResult {
    const beforeField = HandSystem.snapshotFieldCards(gs)
    const firedRecipes = HandSystem.fireMatchedRecipes(gs, chain)
    const afterField = HandSystem.snapshotFieldCards(gs)
    const removedFieldCards: RemovedFieldCard[] = []
    for (const [id, type] of beforeField.entries()) {
      if (!afterField.has(id)) removedFieldCards.push({ cardId: id, type })
    }
    return { firedRecipes, removedFieldCards }
  }

  private static fireMatchedRecipes(gs: GameState, chain: ChainState): FiredRecipe[] {
    const fired: FiredRecipe[] = []
    // Sort by ingredient size ascending so smaller recipes resolve first.
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
          if (card.getHealth() <= 0) gs.removeCardFromRow(card, 0)
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
      case 'freeze-all':
        return HandSystem.freezeFrontCards(gs, 1)
      case 'cleanse-and-restore':
        c.gainCandle(5)
        return HandSystem.cleanseAllField(gs)
      case 'open-all-treasures':
        return HandSystem.collectAllTreasures(gs, c)
      case 'multi-burn': {
        let cleared = 0
        for (let lane = 0; lane < gs.lanes.length; lane++) {
          for (let d = 0; d < 2; d++) {
            const card = gs.lanes[lane].getCardAtDistance(d)
            if (card && (card.type === CardType.ENEMY || card.type === CardType.TRAP)) {
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
  }

  /** Apply a hand card's single-use effect. Returns a short message. */
  private static applySingleEffect(
    gs: GameState,
    def: HandCardDefinition,
    target?: HandTarget
  ): string {
    const c = gs.character
    switch (def.id) {
      case 'wax-drop': {
        const healed = c.heal(1)
        return `체력 +${healed}`
      }
      case 'candle': {
        const shielded = c.addShield(1)
        return `방패 +${shielded}`
      }
      case 'ember':
        return HandSystem.damageTargetEnemy(gs, target, 2)
      case 'key':
        return HandSystem.collectRandomTreasure(gs, c)
      case 'wax':
        return HandSystem.freezeTarget(target, 1)
      case 'match': {
        const gained = c.gainEmber(1)
        return `불씨 카운트 +${gained}`
      }
      case 'holy-water':
        return HandSystem.cleanseRandomField(gs, 2)
      case 'chitin':
        return HandSystem.removeTargetTrap(gs, target)
      case 'card':
        return '손패 콤보 카운트 +1 (총 2회 기록)'
      case 'coin':
        return '+1$'
    }
  }

  /** Apply the enhanced merged-card effect. */
  private static applyTripleEffect(
    gs: GameState,
    def: HandCardDefinition,
    target?: HandTarget
  ): string {
    const c = gs.character
    switch (def.id) {
      case 'wax-drop': {
        const healed = c.heal(5)
        return `트리플 체력 +${healed}`
      }
      case 'candle': {
        const shielded = c.addShield(5)
        return `트리플 방패 +${shielded}`
      }
      case 'ember':
        return HandSystem.damageTargetEnemy(gs, target, 10)
      case 'key':
        return HandSystem.collectAllTreasures(gs, c)
      case 'wax':
        return HandSystem.freezeFrontCards(gs, 3)
      case 'match': {
        const gained = c.gainEmber(5)
        return `트리플 불씨 카운트 +${gained}`
      }
      case 'holy-water':
        return HandSystem.cleanseAllField(gs)
      case 'chitin': {
        const cleared = HandSystem.clearAllOfTypes(gs, [CardType.TRAP])
        return `트리플 함정 ${cleared}장 제거`
      }
      case 'card':
        return '트리플 손패 콤보 카운트 +5 (총 6회 기록)'
      case 'coin':
        return '+5$'
    }
  }

  /** Scan the hand for runs of three consecutive same-defId cards. */
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
    types: CardType[]
  ): { card: Card; laneIndex: number; distance: number } | null {
    for (let lane = 0; lane < gs.lanes.length; lane++) {
      const card = gs.lanes[lane].getCardAtDistance(0)
      if (card && types.includes(card.type)) return { card, laneIndex: lane, distance: 0 }
    }
    return null
  }

  /** Validate per-card targeting rules before consuming the hand card. */
  private static isValidTarget(
    def: HandCardDefinition,
    target: HandTarget | undefined,
    isMerged: boolean
  ): boolean {
    // Some triple effects become broad field effects and no longer need the
    // single-card target used by the base effect.
    if (isMerged && (def.id === 'wax' || def.id === 'chitin')) return true
    if (!def.targetRule) return true
    if (!target) return false
    if (def.targetRule === 'field-enemy') return target.card.type === CardType.ENEMY
    if (def.targetRule === 'front-card-or-treasure') {
      return (
        target.distance === 0 &&
        (target.card.type === CardType.ENEMY || target.card.type === CardType.TREASURE)
      )
    }
    if (def.targetRule === 'front-trap')
      return target.distance === 0 && target.card.type === CardType.TRAP
    return false
  }

  /** Deal damage to a chosen field enemy, or to the first enemy for merged auto-use. */
  private static damageTargetEnemy(
    gs: GameState,
    target: HandTarget | undefined,
    amount: number
  ): string {
    const actualTarget = target ?? HandSystem.findFirstOnField(gs, [CardType.ENEMY])
    if (!actualTarget || actualTarget.card.type !== CardType.ENEMY) return '대상 적 없음'
    actualTarget.card.takeDamage(amount)
    if (actualTarget.card.getHealth() <= 0) {
      gs.removeCardFromRow(actualTarget.card, actualTarget.distance)
      return `${actualTarget.card.name} 피해 ${amount}로 처치`
    }
    return `${actualTarget.card.name} 피해 ${amount}`
  }

  /** Open one random treasure chest and convert its width into item drops. */
  private static collectRandomTreasure(gs: GameState, character: Character): string {
    const treasures = HandSystem.collectAllOfType(gs, CardType.TREASURE)
    if (treasures.length === 0) return '보물상자 없음'
    const pick = treasures[Math.floor(Math.random() * treasures.length)]
    const gained = HandSystem.awardTreasureDrops(character, pick)
    for (let d = 0; d < LANE_DISTANCE_COUNT; d++) gs.removeCardFromRow(pick, d)
    return `${pick.name} 획득: 손패 ${gained}장`
  }

  /** Open every treasure currently on the 3×3 field. */
  private static collectAllTreasures(gs: GameState, character: Character): string {
    const treasures = HandSystem.collectAllOfType(gs, CardType.TREASURE)
    let gained = 0
    for (const treasure of treasures) {
      gained += HandSystem.awardTreasureDrops(character, treasure)
      for (let d = 0; d < LANE_DISTANCE_COUNT; d++) gs.removeCardFromRow(treasure, d)
    }
    HandSystem.runAutoMerges(character)
    return `트리플 보물 ${treasures.length}개 획득: 손패 ${gained}장`
  }

  /** Award item drops based on chest width: 1/3/5, matching ActionSystem. */
  private static awardTreasureDrops(character: Character, treasure: Card): number {
    const safeSpan = Math.max(1, Math.min(3, treasure.groupCount))
    const dropCount = safeSpan === 1 ? 1 : safeSpan === 2 ? 3 : 5
    let gained = 0
    for (let i = 0; i < dropCount; i++) {
      if (!character.hasHandRoom()) break
      character.addHandCard(DropSystem.generateDrop())
      gained++
    }
    HandSystem.runAutoMerges(character)
    return gained
  }

  /** Apply wax hardening to a selected front card. */
  private static freezeTarget(target: HandTarget | undefined, turns: number): string {
    if (!target) return '굳힐 대상 없음'
    target.card.freeze(turns)
    return `${target.card.name} ${turns}턴 굳음`
  }

  /** Apply wax hardening to every front enemy/treasure. */
  private static freezeFrontCards(gs: GameState, turns: number): string {
    const seen = new Set<Card>()
    let count = 0
    for (const lane of gs.lanes) {
      const card = lane.getCardAtDistance(0)
      if (!card || seen.has(card)) continue
      if (card.type !== CardType.ENEMY && card.type !== CardType.TREASURE) continue
      seen.add(card)
      card.freeze(turns)
      count++
    }
    return `전방 ${count}장 ${turns}턴 굳음`
  }

  /** Cleanse random field debuffs. MVP maps curse/mold cleanup to trap removal and wax removal. */
  private static cleanseRandomField(gs: GameState, count: number): string {
    const candidates = HandSystem.collectAllOfType(gs, CardType.TRAP).map((card) => ({ card }))
    const frozenCards = HandSystem.collectAllFieldCards(gs).filter((card) => card.isFrozen())
    frozenCards.forEach((card) => candidates.push({ card }))
    let cleansed = 0
    while (candidates.length > 0 && cleansed < count) {
      const pickIndex = Math.floor(Math.random() * candidates.length)
      const [{ card }] = candidates.splice(pickIndex, 1)
      if (card.type === CardType.TRAP) {
        for (let d = 0; d < LANE_DISTANCE_COUNT; d++) gs.removeCardFromRow(card, d)
      } else {
        card.frozenTurns = 0
      }
      cleansed++
    }
    return `정화 ${cleansed}장`
  }

  /** Cleanse every MVP debuff/trap from the field. */
  private static cleanseAllField(gs: GameState): string {
    const traps = HandSystem.clearAllOfTypes(gs, [CardType.TRAP])
    let thawed = 0
    for (const card of HandSystem.collectAllFieldCards(gs)) {
      if (!card.isFrozen()) continue
      card.frozenTurns = 0
      thawed++
    }
    return `트리플 전체 정화: 함정 ${traps}장, 굳음 ${thawed}장 해제`
  }

  /** Remove the selected front trap. */
  private static removeTargetTrap(gs: GameState, target: HandTarget | undefined): string {
    if (!target || target.card.type !== CardType.TRAP) return '제거할 전방 함정 없음'
    gs.removeCardFromRow(target.card, target.distance)
    return `${target.card.name} 제거`
  }

  /** Find the first matching card anywhere on the 3×3 field. */
  private static findFirstOnField(
    gs: GameState,
    types: CardType[]
  ): { card: Card; laneIndex: number; distance: number } | null {
    for (let laneIndex = 0; laneIndex < gs.lanes.length; laneIndex++) {
      for (let distance = 0; distance < LANE_DISTANCE_COUNT; distance++) {
        const card = gs.lanes[laneIndex].getCardAtDistance(distance)
        if (card && types.includes(card.type)) return { card, laneIndex, distance }
      }
    }
    return null
  }

  /** Collect unique Card instances from the whole field. */
  private static collectAllFieldCards(gs: GameState): Card[] {
    const out: Card[] = []
    const seen = new Set<Card>()
    for (const lane of gs.lanes) {
      for (let d = 0; d < LANE_DISTANCE_COUNT; d++) {
        const card = lane.getCardAtDistance(d)
        if (!card || seen.has(card)) continue
        seen.add(card)
        out.push(card)
      }
    }
    return out
  }

  private static collectAllOfType(gs: GameState, type: CardType): Card[] {
    const out: Card[] = []
    const seen = new Set<Card>()
    for (const lane of gs.lanes) {
      for (let d = 0; d < LANE_DISTANCE_COUNT; d++) {
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
      for (let d = 0; d < LANE_DISTANCE_COUNT; d++) {
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
