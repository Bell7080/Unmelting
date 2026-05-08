/**
 * ActionSystem - Handles player actions and card interactions
 * MVP: Attack, Evade, Take
 */

import { Character } from '@entities/Character'
import { Card, CardType } from '@entities/Card'
import { Lane } from '@entities/Lane'
import { DropSystem } from './DropSystem'

export enum ActionType {
  ATTACK_ENEMY = 'attack',
  EVADE_TRAP = 'evade',
  TAKE_TREASURE = 'take',
}

export interface ActionResult {
  success: boolean
  message: string
  damageDealt?: number
  damageTaken?: number
  itemGained?: string
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
      default:
        return { success: false, message: 'Invalid action', cardRemoved: false }
    }
  }

  /**
   * Attack an enemy. Player strikes first; if the enemy survives the blow,
   * it counter-attacks (the broader enemy phase still runs separately for
   * other lanes). Card removal is left to the caller because a merged
   * enemy may occupy several lane slots.
   */
  private static attackEnemy(
    character: Character,
    _lane: Lane,
    card: Card
  ): ActionResult {
    if (card.type !== CardType.ENEMY) {
      return { success: false, message: 'Not an enemy', cardRemoved: false }
    }

    const playerDamage = character.damage
    const newHealth = card.getHealth() - playerDamage

    if (newHealth <= 0) {
      const drop = DropSystem.generateDrop()
      character.addItem(drop.name)
      return {
        success: true,
        message: `${card.name} 처치! ${drop.name} 획득`,
        damageDealt: playerDamage,
        itemGained: drop.name,
        cardRemoved: true,
      }
    }

    // Enemy survived the strike. It will counterattack during the enemy phase
    // along with every other live enemy in the active row.
    card.baseHealth = newHealth
    return {
      success: true,
      message: `${card.name}에게 ${playerDamage} 피해`,
      damageDealt: playerDamage,
      cardRemoved: false,
    }
  }

  /**
   * Step on a trap deliberately. Player takes the trap's penalty and the
   * trap is consumed. Caller removes the card from any lane slots it holds.
   */
  private static evadeTrap(
    character: Character,
    _lane: Lane,
    card: Card
  ): ActionResult {
    if (card.type !== CardType.TRAP) {
      return { success: false, message: 'Not a trap', cardRemoved: false }
    }
    const penalty = card.getTrapDamagePenalty()
    const actualDamage = character.takeDamage(penalty)
    return {
      success: true,
      message: `${card.name}을(를) 밟았다 (-${actualDamage})`,
      damageTaken: actualDamage,
      cardRemoved: true,
    }
  }

  /**
   * Open a treasure. Caller removes the card from any lane slots it holds.
   * A merged treasure (groupCount > 1) yields more drops.
   */
  private static takeTreasure(
    character: Character,
    _lane: Lane,
    card: Card
  ): ActionResult {
    if (card.type !== CardType.TREASURE) {
      return { success: false, message: 'Not a treasure', cardRemoved: false }
    }
    const drops = card.groupCount === 1 ? 1 : card.groupCount === 2 ? 2 : 4
    const dropNames: string[] = []
    for (let i = 0; i < drops; i++) {
      const drop = DropSystem.generateDrop()
      character.addItem(drop.name)
      dropNames.push(drop.name)
    }
    const summary = drops === 1 ? dropNames[0] : `${drops}개 (${dropNames.join(', ')})`
    return {
      success: true,
      message: `${card.name} 획득: ${summary}`,
      itemGained: summary,
      cardRemoved: true,
    }
  }
}
