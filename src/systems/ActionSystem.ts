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

const TREASURE_DROPS_BY_SPAN: Record<number, number> = {
  // Chest reward counts intentionally scale 1/3/5 instead of one item per lane.
  1: 1,
  2: 3,
  3: 5,
}

export interface ActionResult {
  success: boolean
  message: string
  damageDealt?: number
  damageTaken?: number
  /** Names of hand cards picked up by the action (for log copy). */
  itemGainedNames?: string[]
  /** Hand cards that did not fit because the hand was full (for overflow UI). */
  overflow?: HandCard[]
  /** Flower rewards that live outside Character, such as light and currency. */
  flowerReward?: { kind: 'score' | 'coin'; amount: number }
  /** Final-ascent 별빛만 일반 행동 대신 90~100F 턴 진행을 허용한다. */
  starlightCollected?: boolean
  cardRemoved: boolean
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
  ): { gainedNames: string[]; overflow: HandCard[] } {
    const gainedNames: string[] = []
    const overflow: HandCard[] = []
    for (let i = 0; i < count; i++) {
      const drop = DropSystem.generateDrop(source)
      const def = getHandCardDef(drop.defId)
      if (character.addHandCard(drop)) {
        gainedNames.push(def.name)
      } else {
        overflow.push(drop)
      }
    }
    return { gainedNames, overflow }
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
      const { gainedNames, overflow } = ActionSystem.awardDrops(character, dropCount, 'enemy-kill')
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
    const penalty = card.getTrapDamagePenalty()
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

  /** Open a treasure. Reward count scales 1/3/5 by group width. */
  private static takeTreasure(character: Character, _lane: Lane, card: Card): ActionResult {
    if (card.type !== CardType.TREASURE) {
      return { success: false, message: 'Not a treasure', cardRemoved: false }
    }
    if (card.treasureKind === 'starlight') {
      // 별빛은 손패 보상이 아니라 최종 등반용 턴 열쇠로만 소비된다.
      return {
        success: true,
        message: `${card.name} 획득: 최종 등반 +1턴`,
        starlightCollected: true,
        cardRemoved: true,
      }
    }
    const safeSpan = Math.max(1, Math.min(3, card.groupCount))
    const drops = TREASURE_DROPS_BY_SPAN[safeSpan]
    const { gainedNames, overflow } = ActionSystem.awardDrops(character, drops, 'treasure')
    const summary =
      gainedNames.length === 0
        ? '손패가 가득 차 잃음'
        : drops === 1
          ? gainedNames[0]
          : `${gainedNames.length}개 (${gainedNames.join(', ')})`
    return {
      success: true,
      message: `${card.name} 획득: ${summary}`,
      itemGainedNames: gainedNames,
      overflow,
      cardRemoved: true,
    }
  }
}
