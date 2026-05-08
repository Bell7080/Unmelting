/**
 * GameState - MVP: Central state manager
 * Holds character, lanes, and turn progression
 */

import { Character } from '@entities/Character'
import { Lane, LANE_DISTANCE_COUNT } from '@entities/Lane'
import { Card } from '@entities/Card'

export class GameState {
  character: Character
  lanes: Lane[]
  currentTurn: number
  isGameOver: boolean
  gameOverReason: string

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

  getCharacter(): Character {
    return this.character
  }

  getLanes(): Lane[] {
    return this.lanes
  }

  getLane(index: number): Lane | null {
    if (index < 0 || index >= this.lanes.length) return null
    return this.lanes[index]
  }

  getCurrentTurn(): number {
    return this.currentTurn
  }

  nextTurn(): void {
    this.currentTurn++
    this.character.nextTurn()
  }

  // Advance cards across all lanes
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

  // Find a card's location
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

  endGame(reason: string): void {
    this.isGameOver = true
    this.gameOverReason = reason
  }

  reset(): void {
    this.character.reset()
    this.lanes.forEach((lane) => lane.clear())
    this.currentTurn = 0
    this.isGameOver = false
    this.gameOverReason = ''
  }
}
