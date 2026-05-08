/**
 * TurnManager - MVP: Simplified turn progression
 * Player Action → Card Advance → Collision → Next Turn
 */

import { GameState } from './GameState'
import { Card, CardType } from '@entities/Card'

export class TurnManager {
  gameState: GameState

  constructor(gameState: GameState) {
    this.gameState = gameState
  }

  /**
   * End player's turn and advance game state
   */
  endPlayerTurn(): void {
    // 1. Advance all cards
    const collidingCards = this.gameState.advanceAllCards()

    // 2. Process collisions (cards reaching player)
    this.processCollisions(collidingCards)

    // 3. Check if still alive
    if (!this.gameState.character.isAlive()) {
      this.gameState.endGame('character_defeated')
      return
    }

    // 4. Move to next turn
    this.gameState.nextTurn()
  }

  /**
   * Process unhandled cards that reached player (distance 0)
   * Enemy: attacks player
   * Trap: damages player
   * Treasure: adds item to inventory
   */
  private processCollisions(cards: Card[]): void {
    const character = this.gameState.character

    for (const card of cards) {
      switch (card.type) {
        case CardType.ENEMY:
          const damage = card.getDamage()
          character.takeDamage(damage)
          break
        case CardType.TRAP:
          const trapDamage = card.getTrapDamagePenalty()
          character.takeDamage(trapDamage)
          if (trapDamage >= 999) {
            // 3칸 함정 = 즉사
            this.gameState.endGame('instant_death_trap')
          }
          break
        case CardType.TREASURE:
          const treasureItem = `${card.name} (Treasure)`
          character.addItem(treasureItem)
          break
      }
    }
  }

  reset(): void {
    this.gameState.reset()
  }
}
