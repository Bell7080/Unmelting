/**
 * EnaEffectProbe - HandSystem 실제 실행 결과와 지식 어댑터 추정값을 대조한다.
 *
 * 에나는 플레이어가 보는 인게임 수치와 같은 경험으로 학습해야 하므로, 선언형 설명문만 보지 않고
 * HandSystem.useSingle()을 샌드박스 GameState에서 직접 호출해 실제 회복/방패/제거/자해/코인 결과를 기록한다.
 */

import { GameState } from '@core/GameState'
import { Card, CardType } from '@entities/Card'
import type { HandCard, HandCardId } from '@entities/HandCard'
import { HAND_CARD_IDS, getHandCardDef } from '@data/HandCards'
import { HandSystem, type HandTarget } from '@systems/HandSystem'
import { getEnaHandCardTactic } from './EnaKnowledgeAdapter'

export interface EnaHandEffectVerification {
  id: HandCardId
  name: string
  singleSuccess: boolean
  mergedSuccess: boolean
  singleMessage: string
  mergedMessage: string
  adapterEstimate: number
  actualImpact: number
  delta: number
  notes: string[]
}

/** 플레이 로그 1건. 실제 런 종료/상점 구매/사망 원인을 붙이면 카드 가치 보정에 쓴다. */
export interface EnaPlayLogEntry {
  runId: string
  turnReached: number
  survived: boolean
  usedHandCards: Partial<Record<HandCardId, number>>
  shopPurchases: string[]
  deathReason?: string
  /** 마지막 피해 원천 카드/보스 이름 — 사망 원인 회상 대사에 쓴다. */
  deathSource?: string
}

export interface EnaTuningAdjustment {
  id: HandCardId
  usageCount: number
  survivalRate: number
  valueDelta: number
}

/** 메모리 기반 플레이 로그 저장소. JSON 직렬화가 가능해 추후 파일/서버 저장으로 교체하기 쉽다. */
export class EnaPlayLogMemory {
  private readonly entries: EnaPlayLogEntry[] = []

  append(entry: EnaPlayLogEntry): void {
    // 호출자가 넘긴 객체를 그대로 보관하지 않아 후속 변경이 로그를 오염시키지 않게 한다.
    this.entries.push({ ...entry, usedHandCards: { ...entry.usedHandCards }, shopPurchases: [...entry.shopPurchases] })
  }

  all(): EnaPlayLogEntry[] {
    return this.entries.map((entry) => ({ ...entry, usedHandCards: { ...entry.usedHandCards }, shopPurchases: [...entry.shopPurchases] }))
  }

  toJSON(): string {
    return JSON.stringify(this.entries)
  }

  static fromJSON(json: string): EnaPlayLogMemory {
    const memory = new EnaPlayLogMemory()
    const parsed = JSON.parse(json) as EnaPlayLogEntry[]
    for (const entry of parsed) memory.append(entry)
    return memory
  }

  tuneHandCardValues(): EnaTuningAdjustment[] {
    return tuneKnowledgeWithPlayLogs(this.entries)
  }
}

/** 모든 손패를 실제 HandSystem에 통과시켜 어댑터 추정값과 실행값 차이를 만든다. */
export function verifyHandSystemAgainstKnowledge(ids: readonly HandCardId[] = HAND_CARD_IDS): EnaHandEffectVerification[] {
  return ids.map((id) => verifyOneHandCard(id))
}

/** 플레이 로그의 생존/사망 결과를 손패별 가치 보정치로 변환한다. */
export function tuneKnowledgeWithPlayLogs(entries: readonly EnaPlayLogEntry[]): EnaTuningAdjustment[] {
  return HAND_CARD_IDS.map((id) => {
    const usedRuns = entries.filter((entry) => (entry.usedHandCards[id] ?? 0) > 0)
    const usageCount = usedRuns.reduce((sum, entry) => sum + (entry.usedHandCards[id] ?? 0), 0)
    const survivalRate = usedRuns.length > 0 ? usedRuns.filter((entry) => entry.survived).length / usedRuns.length : 0
    const climbBonus = usedRuns.length > 0 ? usedRuns.reduce((sum, entry) => sum + entry.turnReached, 0) / usedRuns.length / 100 : 0
    return { id, usageCount, survivalRate, valueDelta: round2((survivalRate - 0.5) * 2 + climbBonus) }
  }).filter((adjustment) => adjustment.usageCount > 0)
}

function verifyOneHandCard(id: HandCardId): EnaHandEffectVerification {
  const single = runActualHandUse(id, false)
  const merged = runActualHandUse(id, true)
  const tactic = getEnaHandCardTactic(id)
  const actualImpact = Math.max(single.impact, merged.impact)
  return {
    id,
    name: getHandCardDef(id).name,
    singleSuccess: single.success,
    mergedSuccess: merged.success,
    singleMessage: single.message,
    mergedMessage: merged.message,
    adapterEstimate: round2(tactic.fieldValue + tactic.bossValue + tactic.synergyValue - tactic.liability),
    actualImpact,
    delta: round2(actualImpact - (tactic.fieldValue + tactic.bossValue - tactic.liability)),
    notes: [...single.notes, ...merged.notes],
  }
}

function runActualHandUse(id: HandCardId, merged: boolean): { success: boolean; message: string; impact: number; notes: string[] } {
  const gs = makeProbeState()
  const chain = HandSystem.newChain()
  const card: HandCard = { uid: `probe-${id}-${merged ? 'triple' : 'single'}`, defId: id, merged }
  gs.character.addHandCard(card)
  const before = snapshotProbe(gs)
  const result = HandSystem.useSingle(gs, chain, 0, pickProbeTarget(gs, id), true)
  const after = snapshotProbe(gs)
  const impact = scoreActualImpact(before, after, result.selfDamage ?? 0, result.coinsGained ?? 0, result.gaugeCountBonus ?? 0, result.removedFieldCards.length)
  return {
    success: result.success,
    message: result.message,
    impact,
    notes: result.success ? [] : [`${id}: ${result.message}`],
  }
}

function makeProbeState(): GameState {
  const gs = new GameState()
  gs.character.setDamageForDebug(3)
  gs.character.setHealthForDebug(20)
  gs.getLane(0)?.setCardAtDistance(0, new Card('probe-enemy-front', CardType.ENEMY, '훈련 적', 'probe', 9, 3))
  gs.getLane(1)?.setCardAtDistance(0, new Card('probe-trap-front', CardType.TRAP, '훈련 함정', 'probe', 0, 0, { trapKind: 'web' }))
  gs.getLane(2)?.setCardAtDistance(0, new Card('probe-treasure-front', CardType.TREASURE, '훈련 보물', 'probe'))
  gs.getLane(0)?.setCardAtDistance(1, new Card('probe-spore-wait', CardType.TRAP, '훈련 포자', 'probe', 0, 0, { trapKind: 'spore' }))
  gs.getLane(1)?.setCardAtDistance(1, new Card('probe-enemy-wait', CardType.ENEMY, '대기 적', 'probe', 6, 2))
  gs.getLane(2)?.setCardAtDistance(1, new Card('probe-flower-wait', CardType.FLOWER, '훈련 꽃', 'probe', 0, 0, { flowerKind: 'redRose' }))
  return gs
}

function pickProbeTarget(gs: GameState, id: HandCardId): HandTarget | undefined {
  const def = getHandCardDef(id)
  const targeting = def.targeting.base
  if (targeting.selection !== 'target') return undefined
  for (let laneIndex = 0; laneIndex < gs.lanes.length; laneIndex++) {
    for (let distance = 0; distance < 3; distance++) {
      const card = gs.lanes[laneIndex].getCardAtDistance(distance)
      if (!card) continue
      if (targeting.zone === 'front' && distance !== 0) continue
      if (matchesFilter(card, targeting.filter)) return { laneIndex, distance, card }
    }
  }
  return undefined
}

function matchesFilter(card: Card, filter: ReturnType<typeof getHandCardDef>['targeting']['base']['filter']): boolean {
  if (filter === 'enemy') return card.type === CardType.ENEMY || card.type === CardType.BOSS
  if (filter === 'trap') return card.type === CardType.TRAP
  if (filter === 'spore') return card.type === CardType.TRAP && card.trapKind === 'spore'
  if (filter === 'treasure') return card.type === CardType.TREASURE
  if (filter === 'turn-timer') return card.type === CardType.TRAP || card.type === CardType.TREASURE || card.type === CardType.FLOWER
  if (filter === 'hazard') return card.type === CardType.ENEMY || card.type === CardType.TRAP
  if (filter === 'flower' || filter === 'flower-or-monsterflower') return card.type === CardType.FLOWER
  if (filter === 'enemy-or-treasure') return card.type === CardType.ENEMY || card.type === CardType.TREASURE
  return filter === 'any'
}

function snapshotProbe(gs: GameState): { hp: number; shield: number; candle: number; ember: number; fieldCards: number } {
  return {
    hp: gs.character.health,
    shield: gs.character.shield,
    candle: gs.character.candle,
    ember: gs.character.ember,
    fieldCards: gs.lanes.reduce((sum, lane) => sum + [0, 1, 2].filter((distance) => lane.getCardAtDistance(distance)).length, 0),
  }
}

function scoreActualImpact(before: ReturnType<typeof snapshotProbe>, after: ReturnType<typeof snapshotProbe>, selfDamage: number, coins: number, gauge: number, removed: number): number {
  const hpGain = after.hp - before.hp
  const shieldGain = after.shield - before.shield
  const emberGain = after.ember - before.ember
  const candleGain = after.candle - before.candle + gauge
  const removedGain = Math.max(0, before.fieldCards - after.fieldCards, removed)
  return round2(hpGain * 0.5 + shieldGain * 0.4 + emberGain * 0.5 + candleGain * 0.35 + coins * 0.8 + removedGain * 1.2 - selfDamage * 0.7)
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}
