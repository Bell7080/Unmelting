/**
 * Lane Entity - Represents a single lane with advancing cards
 * MVP: 4 distance slots (0-3, where 0 is closest to player)
 */

import { Card } from './Card'

export const LANE_DISTANCE_COUNT = 4

export class Lane {
  id: string
  index: number
  cards: (Card | null)[] // Index 0 is closest to player

  constructor(id: string, index: number) {
    this.id = id
    this.index = index
    this.cards = new Array(LANE_DISTANCE_COUNT).fill(null)
  }

  /**
   * Place a card at a specific distance
   */
  setCardAtDistance(distance: number, card: Card | null): boolean {
    if (distance < 0 || distance >= LANE_DISTANCE_COUNT) {
      return false
    }
    this.cards[distance] = card
    return true
  }

  /**
   * Get card at specific distance
   */
  getCardAtDistance(distance: number): Card | null {
    if (distance < 0 || distance >= LANE_DISTANCE_COUNT) {
      return null
    }
    return this.cards[distance]
  }

  /**
   * Get card closest to player (distance 0)
   */
  getClosestCard(): Card | null {
    return this.cards[0]
  }

  /**
   * Advance all cards one step closer to player
   * Cards at distance 0 are removed (collision)
   */
  advanceCards(): Card | null {
    const collidingCard = this.cards[0]

    // Shift cards forward
    for (let i = 0; i < LANE_DISTANCE_COUNT - 1; i++) {
      this.cards[i] = this.cards[i + 1]
    }
    this.cards[LANE_DISTANCE_COUNT - 1] = null

    return collidingCard
  }

  /**
   * Move a card by a relative distance
   * Positive = away from player, Negative = toward player
   */
  moveCard(card: Card, relativeDistance: number): boolean {
    const currentDistance = this.cards.indexOf(card)
    if (currentDistance === -1) return false

    const newDistance = currentDistance + relativeDistance
    if (newDistance < 0 || newDistance >= LANE_DISTANCE_COUNT) return false

    this.cards[currentDistance] = null
    this.cards[newDistance] = card
    return true
  }

  /**
   * Swap two cards
   */
  swapCards(card1: Card, card2: Card): boolean {
    const index1 = this.cards.indexOf(card1)
    const index2 = this.cards.indexOf(card2)

    if (index1 === -1 || index2 === -1) return false

    const temp = this.cards[index1]
    this.cards[index1] = this.cards[index2]
    this.cards[index2] = temp
    return true
  }

  /**
   * Remove a card from the lane
   */
  removeCard(card: Card): boolean {
    const index = this.cards.indexOf(card)
    if (index === -1) return false
    this.cards[index] = null
    return true
  }

  /**
   * Check if lane has any cards
   */
  hasCards(): boolean {
    return this.cards.some((card) => card !== null)
  }

  /**
   * Get all non-null cards
   */
  getAllCards(): Card[] {
    return this.cards.filter((card): card is Card => card !== null)
  }

  /**
   * Clear all cards
   */
  clear(): void {
    this.cards.fill(null)
  }

  clone(): Lane {
    const cloned = new Lane(this.id, this.index)
    cloned.cards = this.cards.map((card) => (card ? card.clone() : null))
    return cloned
  }
}
