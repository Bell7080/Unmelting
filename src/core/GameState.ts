/**
 * GameState - Central state manager for the game
 * Holds all game data and provides state manipulation methods
 */

import { Character } from '@entities/Character'
import { Lane, LANE_DISTANCE_COUNT } from '@entities/Lane'
import { Card } from '@entities/Card'

export class GameState {
  private character: Character
  private lanes: Lane[]
  private currentTurn: number
  private isGameOver: boolean
  private gameOverReason: string

  constructor() {
    this.character = new Character()
    this.lanes = [
      new Lane('lane-0', 0),
      new Lane('lane-1', 1),
      new Lane('lane-2', 2),
    ]
    this.currentTurn = 0
    this.isGameOver = false
    this.gameOverReason = ''
  }

  // Character accessors
  getCharacter(): Character {
    return this.character
  }

  // Lane accessors
  getLanes(): Lane[] {
    return this.lanes
  }

  getLane(index: number): Lane | null {
    if (index < 0 || index >= this.lanes.length) return null
    return this.lanes[index]
  }

  getLaneCount(): number {
    return this.lanes.length
  }

  // Turn management
  getCurrentTurn(): number {
    return this.currentTurn
  }

  nextTurn(): void {
    this.currentTurn++
  }

  // Game state
  isGameComplete(): boolean {
    return this.isGameOver
  }

  endGame(reason: string): void {
    this.isGameOver = true
    this.gameOverReason = reason
  }

  getGameOverReason(): string {
    return this.gameOverReason
  }

  // Game logic: Advance cards across all lanes
  advanceAllCards(): Card[] {
    const collidingCards: Card[] = []

    for (const lane of this.lanes) {
      const collidingCard = lane.advanceCards()
      if (collidingCard) {
        collidingCards.push(collidingCard)
      }
    }

    return collidingCards
  }

  // Utility: Get all cards currently on board
  getAllCards(): Map<string, Card> {
    const cardMap = new Map<string, Card>()

    for (const lane of this.lanes) {
      const cards = lane.getAllCards()
      for (const card of cards) {
        cardMap.set(card.id, card)
      }
    }

    return cardMap
  }

  // Utility: Find a card by ID and return its location
  findCard(cardId: string): { lane: Lane; distance: number } | null {
    for (const lane of this.lanes) {
      for (let distance = 0; distance < LANE_DISTANCE_COUNT; distance++) {
        const card = lane.getCardAtDistance(distance)
        if (card?.id === cardId) {
          return { lane, distance }
        }
      }
    }
    return null
  }

  reset(): void {
    this.character.reset()
    this.lanes.forEach((lane) => lane.clear())
    this.currentTurn = 0
    this.isGameOver = false
    this.gameOverReason = ''
  }

  clone(): GameState {
    const cloned = new GameState()
    cloned.character = this.character.clone()
    cloned.lanes = this.lanes.map((lane) => lane.clone())
    cloned.currentTurn = this.currentTurn
    cloned.isGameOver = this.isGameOver
    cloned.gameOverReason = this.gameOverReason
    return cloned
  }
}
