/**
 * EnaRuntimeObserver - 실제 런 중 에나가 보고/기억하는 관측 허브.
 *
 * index.ts에서 손패 사용, 상점 구매, 보스 결정, 런 종료를 즉시 기록한다. UI를 직접 건드리지 않고
 * GameState/상점 스냅샷을 사람 말로 바꿔 저장해, 에나가 플레이어와 함께 모험한 경험을 계속 누적한다.
 */

import type { GameState } from '@core/GameState'
import { CardType, type Card } from '@entities/Card'
import { LANE_DISTANCE_COUNT } from '@entities/Lane'
import type { HandCardId } from '@entities/HandCard'
import type { ShopPackKind } from '@ui/GameBoardRenderer'
import { getHandCardDef } from '@data/HandCards'
import { RECIPES } from '@data/Recipes'
import { EnaPlayLogMemory, type EnaPlayLogEntry } from './EnaEffectProbe'

export interface EnaVisualFrame {
  turn: number
  hp: number
  shield: number
  ember: number
  hand: string[]
  board: string[]
  shop?: string[]
  lookahead: string[]
  recipeHints: string[]
  summary: string
}

export interface EnaRuntimeEvent {
  kind: 'hand' | 'shop' | 'boss' | 'run-end'
  turn: number
  detail: string
  frameSummary: string
}

export class EnaRuntimeObserver {
  private readonly memory = new EnaPlayLogMemory()
  private readonly events: EnaRuntimeEvent[] = []
  private currentRunId = `run-${Date.now()}`
  private usedHandCards: Partial<Record<HandCardId, number>> = {}
  private shopPurchases: string[] = []

  /** 손패 사용 순간: 실제 플레이어 선택과 화면 프레임을 함께 저장한다. */
  recordHandDecision(gs: GameState, defId: HandCardId, detail: string): void {
    this.usedHandCards[defId] = (this.usedHandCards[defId] ?? 0) + 1
    this.pushEvent(gs, 'hand', `${getHandCardDef(defId).name}: ${detail}`)
  }

  /** 상점/제단 구매 순간: 해금팩/확률팩/레시피팩/무료카드 등 선택 습관을 누적한다. */
  recordShopPurchase(gs: GameState, purchaseId: string): void {
    this.shopPurchases.push(purchaseId)
    this.pushEvent(gs, 'shop', purchaseId)
  }

  /** 보스전 선택 순간: 공격/손패/버스트 판단을 프레임과 함께 남긴다. */
  recordBossDecision(gs: GameState, detail: string): void {
    this.pushEvent(gs, 'boss', detail)
  }

  /** 런 종료 시점: 생존/사망 결과를 플레이 로그 메모리에 확정 저장하고 다음 런 버퍼를 비운다. */
  recordRunEnd(gs: GameState, survived: boolean, reason: string): void {
    const entry: EnaPlayLogEntry = {
      runId: this.currentRunId,
      turnReached: gs.getCurrentTurn(),
      survived,
      usedHandCards: this.usedHandCards,
      shopPurchases: this.shopPurchases,
      deathReason: survived ? undefined : reason,
    }
    this.memory.append(entry)
    this.pushEvent(gs, 'run-end', `${survived ? 'survived' : 'defeated'}:${reason}`)
    this.currentRunId = `run-${Date.now()}-${this.memory.all().length}`
    this.usedHandCards = {}
    this.shopPurchases = []
  }

  getMemory(): EnaPlayLogMemory {
    return this.memory
  }

  getEvents(): EnaRuntimeEvent[] {
    return [...this.events]
  }

  /** 현재 보드/손패/상점 상태를 에나가 읽는 시각 프레임 문장으로 변환한다. */
  describeFrame(gs: GameState, shop?: readonly string[]): EnaVisualFrame {
    const hand = gs.character.hand.map((card, index) => `${index + 1}:${getHandCardDef(card.defId).name}${card.merged ? '(트리플)' : ''}`)
    const board = describeBoard(gs)
    const lookahead = projectRailLookahead(gs)
    const recipeHints = describeRecipeNeeds(gs)
    const summary = `${gs.getCurrentTurn()}턴 HP ${gs.character.health}/${gs.character.maxHealth}+방패${gs.character.shield}, 불씨 ${gs.character.ember}/${gs.character.emberMax}. ${lookahead[0] ?? '즉시 위험 낮음'}`
    return { turn: gs.getCurrentTurn(), hp: gs.character.health, shield: gs.character.shield, ember: gs.character.ember, hand, board, shop: shop ? [...shop] : undefined, lookahead, recipeHints, summary }
  }

  private pushEvent(gs: GameState, kind: EnaRuntimeEvent['kind'], detail: string): void {
    const frame = this.describeFrame(gs)
    this.events.push({ kind, turn: gs.getCurrentTurn(), detail, frameSummary: frame.summary })
    // 장시간 런에서 메모리가 무한히 커지지 않도록 최근 이벤트만 유지한다.
    if (this.events.length > 400) this.events.splice(0, this.events.length - 400)
  }
}

export const enaRuntimeObserver = new EnaRuntimeObserver()

function describeBoard(gs: GameState): string[] {
  const rows: string[] = []
  for (let distance = 0; distance < LANE_DISTANCE_COUNT; distance++) {
    const cells: string[] = []
    for (let lane = 0; lane < gs.lanes.length; lane++) {
      const card = gs.lanes[lane].getCardAtDistance(distance)
      cells.push(card ? describeCard(card) : '빈칸')
    }
    rows.push(`${distance === 0 ? '전방' : `${distance}대기`}: ${cells.join(' / ')}`)
  }
  return rows
}

function describeCard(card: Card): string {
  if (card.type === CardType.ENEMY || card.type === CardType.BOSS) return `${card.name}(HP${card.getHealth()}/ATK${card.getDamage()}/${card.groupCount}칸)`
  if (card.type === CardType.TRAP) return `${card.name}(${card.trapKind}/${card.groupCount}칸)`
  if (card.type === CardType.TREASURE) return `${card.name}(보물)`
  if (card.type === CardType.FLOWER) return `${card.name}(${card.flowerKind})`
  return card.name
}

function projectRailLookahead(gs: GameState): string[] {
  const notes: string[] = []
  const frontThreat = sumRowThreat(gs, 0)
  if (frontThreat > 0) notes.push(`현재 전방 위협 ${frontThreat}: 이번 행동 후 피격 가능`)
  const nextThreat = sumRowThreat(gs, 1)
  if (nextThreat > 0) notes.push(`1수 뒤 대기 1행이 내려오면 위협 ${nextThreat}`)
  const twoStepThreat = sumRowThreat(gs, 2)
  if (twoStepThreat > 0) notes.push(`2수 뒤 대기 2행 위협 ${twoStepThreat}`)
  const webCount = countRowWebs(gs, 0) + countRowWebs(gs, 1)
  if (webCount >= 3) notes.push('거미줄이 3칸으로 합쳐질 수 있어 즉사급 위험')
  return notes
}

function sumRowThreat(gs: GameState, distance: number): number {
  const seen = new Set<Card>()
  let threat = 0
  for (const lane of gs.lanes) {
    const card = lane.getCardAtDistance(distance)
    if (!card || seen.has(card)) continue
    seen.add(card)
    if (card.type === CardType.ENEMY || card.type === CardType.BOSS) threat += card.getDamage()
    if (card.type === CardType.TRAP) threat += card.trapKind === 'web' && card.groupCount >= 3 ? 99 : card.getTrapDamagePenalty()
  }
  return threat
}

function countRowWebs(gs: GameState, distance: number): number {
  const seen = new Set<Card>()
  let count = 0
  for (const lane of gs.lanes) {
    const card = lane.getCardAtDistance(distance)
    if (!card || seen.has(card)) continue
    seen.add(card)
    if (card.type === CardType.TRAP && card.trapKind === 'web') count += card.groupCount
  }
  return count
}

function describeRecipeNeeds(gs: GameState): string[] {
  const handCounts = new Map<HandCardId, number>()
  for (const card of gs.character.hand) handCounts.set(card.defId, (handCounts.get(card.defId) ?? 0) + (card.merged ? 3 : 1))
  return RECIPES.filter((recipe) => !recipe.runLocked || gs.unlockedRecipeIds.has(recipe.id)).flatMap((recipe) => {
    const missing = Object.entries(recipe.ingredients).filter(([id, needed]) => (handCounts.get(id as HandCardId) ?? 0) < (needed ?? 0))
    if (missing.length > 1) return []
    return [`${recipe.name}: ${missing.length === 0 ? '즉시 가능' : `${getHandCardDef(missing[0][0] as HandCardId).name} 해금/확보 필요`}`]
  }).slice(0, 5)
}

export function shopKindToPurchaseId(kind: ShopPackKind): string {
  return `pack:${kind}`
}
