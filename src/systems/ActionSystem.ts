/**
 * ActionSystem - Handles player actions and card interactions.
 *
 * Resolves Attack/Evade/Take against active-row cards, awarding hand-card
 * drops on enemy defeat, treasure open, or flower pickup. The hand cards land directly in
 * the character's hand; non-fitting drops are reported back to the caller.
 */

import { Character } from '@entities/Character'
import { Card, CardType } from '@entities/Card'
import { Lane } from '@entities/Lane'
import { HandCard } from '@entities/HandCard'
import { DropSystem } from './DropSystem'
import { getHandCardDef } from '@data/HandCards'

export enum ActionType {
  ATTACK_ENEMY = 'attack',
  EVADE_TRAP = 'evade',
  TAKE_TREASURE = 'take',
  TAKE_FLOWER = 'flower',
}

// [min, max] inclusive range — actual drop count is randomised each open.
const TREASURE_DROPS_BY_SPAN: Record<number, [number, number]> = {
  1: [1, 2],
  2: [2, 4],
  3: [3, 6],
}

// 온보딩 잡동사니: 축약형 보물 — 1칸 0~1, 2칸 1~2, 3칸 2~3장(가끔 빈다 = 보물 변동성 학습).
const JUNK_TREASURE_DROPS_BY_SPAN: Record<number, [number, number]> = {
  1: [0, 1],
  2: [1, 2],
  3: [2, 3],
}

const GOLDEN_TREASURE_DROPS_BY_SPAN: Record<number, [number, number]> = {
  1: [2, 3],
  2: [4, 6],
  3: [6, 9],
}

export interface ActionResult {
  success: boolean
  message: string
  damageDealt?: number
  damageTaken?: number
  /** Names of hand cards picked up by the action (for log copy). */
  itemGainedNames?: string[]
  /** Def ids of hand cards picked up (for companion loot commentary). */
  itemGainedIds?: string[]
  /** Hand cards that did not fit because the hand was full (for overflow UI). */
  overflow?: HandCard[]
  /** Flower rewards that live outside Character, such as light and currency. */
  flowerReward?: { kind: 'score' | 'coin'; amount: number }
  cardRemoved: boolean
  /** 함정의 대가: true이면 함정 피해가 완전 무효화되었다. */
  trapIgnored?: boolean
  /** 달콤한 유혹 불빛 계산용: 방패 흡수 전 실제 함정 피해 기준값. */
  trapPenalty?: number
}

export class ActionSystem {
  /**
   * Execute player action on a specific card
   */
  static executeAction(
    character: Character,
    lane: Lane,
    card: Card,
    actionType: ActionType
  ): ActionResult {
    if (!card) {
      return { success: false, message: 'No card selected', cardRemoved: false }
    }

    switch (actionType) {
      case ActionType.ATTACK_ENEMY:
        return this.attackEnemy(character, lane, card)
      case ActionType.EVADE_TRAP:
        return this.evadeTrap(character, lane, card)
      case ActionType.TAKE_TREASURE:
        return this.takeTreasure(character, lane, card)
      case ActionType.TAKE_FLOWER:
        return this.takeFlower(character, lane, card)
      default:
        return { success: false, message: 'Invalid action', cardRemoved: false }
    }
  }

  /** Award `count` random hand cards into the character; report overflow.
   *  Treasure source keeps the normal drop table and adds treasure-only cards such as 동전. */
  private static awardDrops(
    character: Character,
    count: number,
    source: 'enemy-kill' | 'treasure' = 'enemy-kill'
  ): { gainedNames: string[]; gainedIds: string[]; overflow: HandCard[] } {
    const gainedNames: string[] = []
    const gainedIds: string[] = []
    const overflow: HandCard[] = []
    for (let i = 0; i < count; i++) {
      const drop = DropSystem.generateDrop(source)
      const def = getHandCardDef(drop.defId)
      if (character.addHandCard(drop)) {
        gainedNames.push(def.name)
        gainedIds.push(drop.defId)
      } else {
        overflow.push(drop)
      }
    }
    return { gainedNames, gainedIds, overflow }
  }

  /**
   * Attack an enemy. Player strikes first; if the enemy survives the blow,
   * it counter-attacks (the broader enemy phase still runs separately for
   * other lanes). Card removal is left to the caller because a merged
   * enemy may occupy several lane slots.
   */
  private static attackEnemy(character: Character, _lane: Lane, card: Card): ActionResult {
    if (card.type !== CardType.ENEMY) {
      return { success: false, message: 'Not an enemy', cardRemoved: false }
    }

    const playerDamage = character.damage
    const newHealth = card.takeDamage(playerDamage)

    if (newHealth <= 0) {
      const dropCount = card.defeatDropCount
      const { gainedNames, gainedIds, overflow } = ActionSystem.awardDrops(character, dropCount, 'enemy-kill')
      const summary =
        gainedNames.length === 0
          ? '손패가 가득 차 잃음'
          : gainedNames.length === 1
            ? gainedNames[0]
            : `${gainedNames.length}개 (${gainedNames.join(', ')})`
      return {
        success: true,
        message: `${card.name} 처치! ${summary}`,
        damageDealt: playerDamage,
        itemGainedNames: gainedNames,
        itemGainedIds: gainedIds,
        overflow,
        cardRemoved: true,
      }
    }

    // Enemy survived the strike. It will counterattack during the enemy phase
    // along with every other live enemy in the active row.
    return {
      success: true,
      message: `${card.name}에게 ${playerDamage} 피해`,
      damageDealt: playerDamage,
      cardRemoved: false,
    }
  }

  /**
   * Step on a trap deliberately. Player takes the trap's penalty and the
   * trap is consumed.
   */
  private static evadeTrap(character: Character, _lane: Lane, card: Card): ActionResult {
    if (card.type !== CardType.TRAP) {
      return { success: false, message: 'Not a trap', cardRemoved: false }
    }
    // 함정의 대가: 15% 확률로 함정 피해 완전 무효.
    if (character.trapIgnoreChance > 0 && Math.random() < character.trapIgnoreChance) {
      return {
        success: true,
        message: `${card.name} 무효 (함정의 대가)`,
        damageTaken: 0,
        cardRemoved: true,
        trapIgnored: true,
        trapPenalty: 0,
      }
    }
    const penalty = card.getTrapDamagePenalty() + character.trapDamageBonus
    const actualDamage = character.takeDamage(penalty)
    const message =
      card.trapKind === 'bomb'
        ? `${card.name} 해체`
        : `${card.name}을(를) 밟았다 (-${actualDamage})`
    return {
      success: true,
      message,
      damageTaken: actualDamage,
      cardRemoved: true,
      trapPenalty: penalty,
    }
  }

  /** Pick a bloomed flower for its current buff; dormant seeds cannot be taken. */
  private static takeFlower(character: Character, _lane: Lane, card: Card): ActionResult {
    if (card.type !== CardType.FLOWER || card.flowerKind === 'seed') {
      return { success: false, message: 'Not a bloomed flower', cardRemoved: false }
    }
    const amount = Math.max(1, card.flowerValue)
    switch (card.flowerKind) {
      case 'chamomile':
        return {
          success: true,
          message: `${card.name} 수확: 불빛 +${amount}`,
          flowerReward: { kind: 'score', amount },
          cardRemoved: true,
        }
      case 'redRose': {
        const healed = character.heal(amount)
        return { success: true, message: `${card.name} 수확: 체력 +${healed}`, cardRemoved: true }
      }
      case 'marigold':
        return {
          success: true,
          message: `${card.name} 수확: ${amount}$`,
          flowerReward: { kind: 'coin', amount },
          cardRemoved: true,
        }
      case 'oleander': {
        const shielded = character.addShield(amount)
        return { success: true, message: `${card.name} 수확: 방패 +${shielded}`, cardRemoved: true }
      }
      case 'lavender': {
        const gauge = character.gainCandle(amount)
        return { success: true, message: `${card.name} 수확: 게이지 +${gauge}`, cardRemoved: true }
      }
    }
  }

  /** Open a treasure. Reward count rolls within the per-span [min,max] drop range. */
  private static takeTreasure(character: Character, _lane: Lane, card: Card): ActionResult {
    if (card.type !== CardType.TREASURE) {
      return { success: false, message: 'Not a treasure', cardRemoved: false }
    }
    if (card.treasureKind === 'starlight') {
      // 별빛은 클릭으로 수집되지 않는다. 전방 활성 행에 도달하는 순간 자동 소비되며
      // (TurnManager.sweepFrontStarlights) 그때만 런 턴이 오른다. 좌우 봉쇄 착취 차단.
      return { success: false, message: '별빛은 자동으로 수집됩니다', cardRemoved: false }
    }
    const safeSpan = Math.max(1, Math.min(3, card.groupCount))
    const dropTable =
      card.treasureKind === 'goldenChest' ? GOLDEN_TREASURE_DROPS_BY_SPAN
      : card.treasureKind === 'junk' ? JUNK_TREASURE_DROPS_BY_SPAN
      : TREASURE_DROPS_BY_SPAN
    const [dropMin, dropMax] = dropTable[safeSpan]
    const drops = dropMin + Math.floor(Math.random() * (dropMax - dropMin + 1))
    const { gainedNames, gainedIds, overflow } = ActionSystem.awardDrops(character, drops, 'treasure')
    const summary =
      drops === 0
        ? '비어 있음'
        : gainedNames.length === 0
          ? '손패가 가득 차 잃음'
          : drops === 1
            ? gainedNames[0]
            : `${gainedNames.length}개 (${gainedNames.join(', ')})`
    return {
      success: true,
      message: `${card.name} 획득: ${summary}`,
      itemGainedNames: gainedNames,
      itemGainedIds: gainedIds,
      overflow,
      cardRemoved: true,
    }
  }
}
