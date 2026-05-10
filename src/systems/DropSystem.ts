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
  /** Build a single random hand card weighted by each definition's dropWeight. */
  static generateDrop(): HandCard {
    const defs = Object.values(HAND_CARD_DEFINITIONS)
    const total = defs.reduce((sum, d) => sum + (d.dropWeight ?? 1), 0)
    let roll = Math.random() * total
    for (const def of defs) {
      roll -= def.dropWeight ?? 1
      if (roll <= 0) return DropSystem.makeCard(def.id)
    }
    return DropSystem.makeCard(defs[0].id)
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
