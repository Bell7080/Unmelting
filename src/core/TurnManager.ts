/**
 * TurnManager - Handles turn progression and game loop
 * Orchestrates the sequence: Player Actions → Card Advance → Collision → New Cards
 */

import { GameState } from './GameState'
import { Card, CardType } from '@entities/Card'

export enum TurnPhase {
  PLAYER_ACTION = 'player_action',
  CARD_ADVANCE = 'card_advance',
  COLLISION_PROCESSING = 'collision_processing',
  CARD_SPAWN = 'card_spawn',
  TURN_END = 'turn_end',
}

export interface TurnEvent {
  phase: TurnPhase
  data?: unknown
}

export class TurnManager {
  private gameState: GameState
  private currentPhase: TurnPhase
  private listeners: ((event: TurnEvent) => void)[] = []

  constructor(gameState: GameState) {
    this.gameState = gameState
    this.currentPhase = TurnPhase.PLAYER_ACTION
  }

  getCurrentPhase(): TurnPhase {
    return this.currentPhase
  }

  /**
   * Listen to turn events
   */
  subscribe(listener: (event: TurnEvent) => void): void {
    this.listeners.push(listener)
  }

  /**
   * Emit turn event to all listeners
   */
  private emit(event: TurnEvent): void {
    this.listeners.forEach((listener) => listener(event))
  }

  /**
   * Execute complete turn sequence
   */
  executeTurn(): void {
    // Phase 1: Player actions (handled externally via action methods)
    // Assuming player has taken 2 actions by this point

    // Phase 2: Card Advancement
    this.advancePhase(TurnPhase.CARD_ADVANCE)
    const collidingCards = this.gameState.advanceAllCards()
    this.emit({ phase: TurnPhase.CARD_ADVANCE, data: { collidingCards } })

    // Phase 3: Collision Processing
    this.advancePhase(TurnPhase.COLLISION_PROCESSING)
    this.processCollisions(collidingCards)
    this.emit({ phase: TurnPhase.COLLISION_PROCESSING })

    // Phase 4: New Card Spawn
    this.advancePhase(TurnPhase.CARD_SPAWN)
    // TODO: Implement card spawning logic
    this.emit({ phase: TurnPhase.CARD_SPAWN })

    // Phase 5: Turn End
    this.advancePhase(TurnPhase.TURN_END)
    this.endTurn()
    this.emit({ phase: TurnPhase.TURN_END })
  }

  /**
   * Reset to action phase for next turn
   */
  private endTurn(): void {
    this.gameState.nextTurn()
    this.gameState.getCharacter().restoreActionPoints()
    this.currentPhase = TurnPhase.PLAYER_ACTION
  }

  /**
   * Move to next phase
   */
  private advancePhase(nextPhase: TurnPhase): void {
    this.currentPhase = nextPhase
  }

  /**
   * Process cards that collided with player
   * Priority order: Curse → Enemy → Obstacle → Reward → Event → Shop
   */
  private processCollisions(cards: Card[]): void {
    const priorityOrder = [
      CardType.CURSE,
      CardType.ENEMY,
      CardType.OBSTACLE,
      CardType.REWARD,
      CardType.EVENT,
      CardType.SHOP,
    ]

    const sorted = cards.sort((a, b) => {
      return priorityOrder.indexOf(a.type) - priorityOrder.indexOf(b.type)
    })

    for (const card of sorted) {
      this.resolveCardEffect(card)
    }

    // Check if character is still alive
    if (!this.gameState.getCharacter().isAlive()) {
      this.gameState.endGame('character_defeated')
    }
  }

  /**
   * Resolve a card's effect on collision
   */
  private resolveCardEffect(card: Card): void {
    const character = this.gameState.getCharacter()

    for (const effect of card.effects) {
      switch (effect.type) {
        case 'damage':
          character.takeDamage(effect.value || 0)
          break
        case 'heal':
          character.heal(effect.value || 0)
          break
        case 'reward':
          // TODO: Implement reward logic
          break
        case 'curse':
          character.addCurse(effect.value || 1)
          break
        default:
          break
      }
    }
  }

  reset(): void {
    this.currentPhase = TurnPhase.PLAYER_ACTION
    this.gameState.reset()
  }
}
