/**
 * DropSystem - Generates hand card drops when enemies are defeated or
 * treasures are opened. Hand cards are the player's consumable resources
 * that fuel single use, triple synthesis, and combo patterns.
 */

import { HandCard, HandCardDropSource, HandCardId } from '@entities/HandCard'
import { HAND_CARD_DEFINITIONS, getHandCardDef } from '@data/HandCards'
import { HAND_CARD_RARITY, type CardRarity } from '@data/ShopPools'

let nextDropUid = 1

// 1차 거름망 등급 기본 가중치
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
  // 현재 런에서 드롭 가능한 카드 ID 집합. null이면 전체 허용(초기화 전 안전망).
  private static allowedIds: Set<HandCardId> | null = null
  // 확률팩·직업 보너스로 1차 거름망에 추가된 개별 카드 가중치 — 카드 id → 누적값.
  private static tier1CardBoosts: Partial<Record<string, number>> = {}

  /** runCardPool이 변경될 때마다 호출해 드롭 풀을 동기화한다. */
  static setAllowedPool(ids: readonly HandCardId[]): void {
    DropSystem.allowedIds = new Set(ids)
  }

  /** 확률팩·직업 선택 시 호출해 1차 거름망 개별 카드 가중치를 동기화한다. */
  static setTier1CardBoosts(boosts: Partial<Record<string, number>>): void {
    DropSystem.tier1CardBoosts = boosts
  }

  /** Build a single random hand card using 2-tier selection:
   *  1단계: 등급 항목 + 개별 카드 부스트 항목을 합쳐 뽑는다.
   *    - 등급이 선택되면 → 2단계로 해당 등급 내에서 카드를 뽑는다.
   *    - 개별 카드가 선택되면 → 해당 카드를 즉시 반환한다.
   *  2단계: 선택된 등급 내에서 dropWeight 가중치로 카드를 선택한다. */
  static generateDrop(source: HandCardDropSource = 'enemy-kill'): HandCard {
    const all = Object.values(HAND_CARD_DEFINITIONS)
    const sourcePool = all.filter((d) => d.dropSource === 'any' || d.dropSource === source)
    const defs = DropSystem.allowedIds
      ? sourcePool.filter((d) => DropSystem.allowedIds!.has(d.id))
      : sourcePool
    const pool = defs.length > 0 ? defs : sourcePool
    const poolIds = new Set(pool.map(d => d.id))

    // 1단계 풀 구성: 등급 항목 + 풀에 있는 카드의 개별 부스트 항목
    type Tier1Entry =
      | { kind: 'rarity'; rarity: CardRarity; weight: number }
      | { kind: 'card';   id: HandCardId;     weight: number }

    const existingRarities = new Set<CardRarity>()
    for (const def of pool) existingRarities.add(HAND_CARD_RARITY[def.id] ?? 'common')

    const tier1: Tier1Entry[] = Array.from(existingRarities).map(r => ({ kind: 'rarity', rarity: r, weight: RARITY_WEIGHTS[r] }))
    for (const [id, boost] of Object.entries(DropSystem.tier1CardBoosts)) {
      if (boost && boost > 0 && poolIds.has(id as HandCardId)) {
        tier1.push({ kind: 'card', id: id as HandCardId, weight: boost })
      }
    }

    const tier1Total = tier1.reduce((s, e) => s + e.weight, 0)
    let tier1Roll = Math.random() * tier1Total
    let selected: Tier1Entry = tier1[0]
    for (const entry of tier1) {
      tier1Roll -= entry.weight
      if (tier1Roll <= 0) { selected = entry; break }
    }

    // 개별 카드 항목이 당첨되면 즉시 반환
    if (selected.kind === 'card') return DropSystem.makeCard(selected.id)

    // 2단계: 선택된 등급 내에서 dropWeight 가중치로 카드를 선택한다.
    const tierPool = pool.filter((d) => (HAND_CARD_RARITY[d.id] ?? 'common') === selected.rarity)
    const total = tierPool.reduce((sum, d) => sum + (d.dropWeight ?? 1), 0)
    let roll = Math.random() * total
    for (const def of tierPool) {
      roll -= (def.dropWeight ?? 1)
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

  /**
   * 카드 C의 드롭 확률을 계산한다.
   * boostToAdd: 이번에 추가할 가중치 (0이면 현재 확률만 반환).
   * 반환값은 0~1 소수 (% 변환은 호출측에서 Math.floor(*100) 처리).
   */
  static computeDropProbability(
    id: HandCardId,
    pool: readonly HandCardId[],
    currentBoosts: Partial<Record<string, number>>,
    boostToAdd = 0,
  ): { before: number; after: number } {
    const defs = pool.map(pid => HAND_CARD_DEFINITIONS[pid]).filter(Boolean)
    const existingRarities = new Set<CardRarity>()
    for (const def of defs) existingRarities.add(HAND_CARD_RARITY[def.id] ?? 'common')

    const T1_base = Array.from(existingRarities).reduce((s, r) => s + RARITY_WEIGHTS[r], 0)
    const boostTotal = pool.reduce((s, pid) => s + (currentBoosts[pid] ?? 0), 0)
    const T1_current = T1_base + boostTotal

    const rarity = HAND_CARD_RARITY[id] ?? 'common'
    const W_C = HAND_CARD_DEFINITIONS[id]?.dropWeight ?? 1
    const T2_R = defs
      .filter(d => (HAND_CARD_RARITY[d.id] ?? 'common') === rarity)
      .reduce((s, d) => s + (d.dropWeight ?? 1), 0)

    const existBoost = currentBoosts[id] ?? 0
    const calcP = (boost: number, total: number): number =>
      T2_R > 0 ? boost / total + (RARITY_WEIGHTS[rarity] / total) * (W_C / T2_R) : 0

    return {
      before: calcP(existBoost, T1_current),
      after:  calcP(existBoost + boostToAdd, T1_current + boostToAdd),
    }
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
