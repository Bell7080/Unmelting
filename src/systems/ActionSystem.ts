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
        return this.evadeTrap(lane, card)
      case ActionType.TAKE_TREASURE:
        return this.takeTreasure(character, lane, card)
      default:
        return { success: false, message: 'Invalid action', cardRemoved: false }
    }
  }

  /**
   * Attack an enemy
   * Player attacks first, then enemy counterattacks
   */
  private static attackEnemy(
    character: Character,
    lane: Lane,
    card: Card
  ): ActionResult {
    if (card.type !== CardType.ENEMY) {
      return {
        success: false,
        message: 'Not an enemy',
        cardRemoved: false,
      }
    }

    // Player attacks first
    const playerDamage = character.damage
    const enemyHealth = card.getHealth() - playerDamage

    if (enemyHealth <= 0) {
      // Enemy defeated!
      lane.removeCard(card)
      const drop = DropSystem.generateDrop()
      character.addItem(drop.name)

      return {
        success: true,
        message: `Defeated ${card.name}! Got ${drop.name}`,
        damageDealt: playerDamage,
        itemGained: drop.name,
        cardRemoved: true,
      }
    }

    // Enemy counterattacks
    card.baseHealth = enemyHealth
    const enemyDamage = card.getDamage()
    const actualDamage = character.takeDamage(enemyDamage)

    return {
      success: true,
      message: `Hit ${card.name} for ${playerDamage}. Took ${actualDamage} damage`,
      damageDealt: playerDamage,
      damageTaken: actualDamage,
      cardRemoved: false,
    }
  }

  /**
   * Evade a trap
   * Removes the trap and allows other cards to advance
   */
  private static evadeTrap(lane: Lane, card: Card): ActionResult {
    if (card.type !== CardType.TRAP) {
      return {
        success: false,
        message: 'Not a trap',
        cardRemoved: false,
      }
    }

    lane.removeCard(card)
    return {
      success: true,
      message: `Evaded trap: ${card.name}`,
      cardRemoved: true,
    }
  }

  /**
   * Take treasure
   * Adds reward to inventory
   */
  private static takeTreasure(
    character: Character,
    lane: Lane,
    card: Card
  ): ActionResult {
    if (card.type !== CardType.TREASURE) {
      return {
        success: false,
        message: 'Not a treasure',
        cardRemoved: false,
      }
    }

    const itemName = `${card.name} (Treasure)`
    character.addItem(itemName)
    lane.removeCard(card)

    return {
      success: true,
      message: `Got treasure: ${itemName}`,
      itemGained: itemName,
      cardRemoved: true,
    }
  }
}
