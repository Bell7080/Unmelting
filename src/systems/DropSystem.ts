/**
 * DropSystem - Generates hand card drops when enemies are defeated or
 * treasures are opened. Hand cards are the player's consumable resources
 * that fuel single use, triple synthesis, and combo patterns.
 */

import { HandCard, HandCardDropSource, HandCardId } from '@entities/HandCard'
import { HAND_CARD_DEFINITIONS, getHandCardDef } from '@data/HandCards'
import { HAND_CARD_RARITY, type CardRarity } from '@data/ShopPools'

let nextDropUid = 1

// 등급 티어 가중치 — 먼저 등급을 고르고, 그 안에서 dropWeight로 다시 고른다.
const RARITY_WEIGHTS: Record<CardRarity, number> = {
  common: 35,
  rare: 20,
  epic: 10,
  unique: 2,
  legendary: 2,
}

function generateUid(defId: HandCardId): string {
  return `${defId}-${nextDropUid++}`
}

export class DropSystem {
  // 현재 런에서 드롭 가능한 카드 ID 집합. runCardPool.unlocked만 포함하며
  // null이면 전체 허용(초기화 전 안전망).
  private static allowedIds: Set<HandCardId> | null = null

  /** runCardPool이 변경될 때마다 호출해 드롭 풀을 동기화한다. */
  static setAllowedPool(ids: readonly HandCardId[]): void {
    DropSystem.allowedIds = new Set(ids)
  }

  /** Build a single random hand card using 2-tier selection:
   *  1단계: 등급 티어를 RARITY_WEIGHTS 가중치로 뽑는다.
   *  2단계: 해당 등급 안에서 dropWeight 가중치로 카드를 뽑는다.
   *  기본 드롭은 적/보상/드로우 공용 풀만 쓰고, 보물상자는 기존 풀에
   *  treasure-only 카드를 더해 동전이 상자에서만 보이도록 한다. */
  static generateDrop(source: HandCardDropSource = 'enemy-kill'): HandCard {
    const all = Object.values(HAND_CARD_DEFINITIONS)
    const sourcePool = all.filter((d) => d.dropSource === 'any' || d.dropSource === source)
    const defs = DropSystem.allowedIds
      ? sourcePool.filter((d) => DropSystem.allowedIds!.has(d.id))
      : sourcePool
    // 해금/삭제로 현재 source 풀이 비면 같은 source의 전체 기본 풀로 되돌려
    // treasure-only 동전이 일반 드롭에 끼어드는 안전망 버그를 피한다.
    const pool = defs.length > 0 ? defs : sourcePool

    // 1단계: 풀에 실제로 존재하는 등급의 합산 가중치로 등급을 선택한다.
    const rarityTotals = new Map<CardRarity, number>()
    for (const def of pool) {
      const rarity = HAND_CARD_RARITY[def.id] ?? 'common'
      rarityTotals.set(rarity, (rarityTotals.get(rarity) ?? 0) + RARITY_WEIGHTS[rarity])
    }
    const tierTotal = Array.from(rarityTotals.values()).reduce((s, w) => s + w, 0)
    let tierRoll = Math.random() * tierTotal
    let chosenRarity: CardRarity = 'common'
    for (const [rarity, weight] of rarityTotals) {
      tierRoll -= weight
      if (tierRoll <= 0) { chosenRarity = rarity; break }
    }

    // 2단계: 선택된 등급 내에서 dropWeight 가중치로 카드를 선택한다.
    const tierPool = pool.filter((d) => (HAND_CARD_RARITY[d.id] ?? 'common') === chosenRarity)
    const total = tierPool.reduce((sum, d) => sum + (d.dropWeight ?? 1), 0)
    let roll = Math.random() * total
    for (const def of tierPool) {
      roll -= def.dropWeight ?? 1
      if (roll <= 0) return DropSystem.makeCard(def.id)
    }
    return DropSystem.makeCard(tierPool[0].id)
  }

  /** Build a fresh hand card instance for a known definition id. */
  static makeCard(defId: HandCardId): HandCard {
    return { uid: generateUid(defId), defId }
  }

  /** Convenience: generate `count` random drops. */
  static generateDrops(count: number, source: HandCardDropSource = 'enemy-kill'): HandCard[] {
    const out: HandCard[] = []
    for (let i = 0; i < count; i++) out.push(DropSystem.generateDrop(source))
    return out
  }

  /** Lookup helper kept here so other systems do not import the data module directly. */
  static getDefinition(id: HandCardId) {
    return getHandCardDef(id)
  }

  /** Stable hand-display sort by category then definition id. */
  static getHandSortRank(defId: HandCardId): number {
    const def = HAND_CARD_DEFINITIONS[defId]
    if (!def) return Number.MAX_SAFE_INTEGER
    const categoryOrder: Record<string, number> = {
      recovery: 0,
      tool: 1,
      control: 2,
      attack: 3,
    }
    const categoryRank = categoryOrder[def.category] ?? 99
    return categoryRank * 1000 + Object.keys(HAND_CARD_DEFINITIONS).indexOf(defId)
  }
}
