/**
 * DropSystem - Generates hand card drops when enemies are defeated or
 * treasures are opened. Hand cards are the player's consumable resources
 * that fuel single use, triple synthesis, and combo patterns.
 */

import { HandCard, HandCardId } from '@entities/HandCard'
import { HAND_CARD_DEFINITIONS, getHandCardDef } from '@data/HandCards'

let nextDropUid = 1

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

  /** Build a single random hand card weighted by each definition's dropWeight.
   *  잠긴(locked) 카드와 밴된(banned) 카드는 드롭 대상에서 제외된다. */
  static generateDrop(): HandCard {
    const all = Object.values(HAND_CARD_DEFINITIONS)
    const defs = DropSystem.allowedIds
      ? all.filter((d) => DropSystem.allowedIds!.has(d.id))
      : all
    const pool = defs.length > 0 ? defs : all  // 풀이 비었을 때 전체 폴백
    const total = pool.reduce((sum, d) => sum + (d.dropWeight ?? 1), 0)
    let roll = Math.random() * total
    for (const def of pool) {
      roll -= def.dropWeight ?? 1
      if (roll <= 0) return DropSystem.makeCard(def.id)
    }
    return DropSystem.makeCard(pool[0].id)
  }

  /** Build a fresh hand card instance for a known definition id. */
  static makeCard(defId: HandCardId): HandCard {
    return { uid: generateUid(defId), defId }
  }

  /** Convenience: generate `count` random drops. */
  static generateDrops(count: number): HandCard[] {
    const out: HandCard[] = []
    for (let i = 0; i < count; i++) out.push(DropSystem.generateDrop())
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
