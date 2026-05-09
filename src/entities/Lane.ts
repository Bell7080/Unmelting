/**
 * Lane Entity - Represents one rail lane with three card slots.
 * MVP: distance 0 is closest to the player, distance 2 is the top preview.
 */

import { Card } from './Card'

export const LANE_DISTANCE_COUNT = 3

export class Lane {
  id: string
  index: number
  cards: (Card | null)[] // Index 0 is closest to player

  constructor(id: string, index: number) {
    this.id = id
    this.index = index
    this.cards = new Array(LANE_DISTANCE_COUNT).fill(null)
  }

  setCardAtDistance(distance: number, card: Card | null): boolean {
    if (distance < 0 || distance >= LANE_DISTANCE_COUNT) {
      return false
    }
    this.cards[distance] = card
    return true
  }

  getCardAtDistance(distance: number): Card | null {
    if (distance < 0 || distance >= LANE_DISTANCE_COUNT) {
      return null
    }
    return this.cards[distance]
  }

  clear(): void {
    this.cards.fill(null)
  }
}
