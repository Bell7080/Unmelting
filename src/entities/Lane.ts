/**
 * Lane Entity - Represents a single lane with advancing cards
 * MVP: 3 distance slots (0-2, where 0 is closest to player)
 * Cards can merge when same type/name at same position
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

  getClosestCard(): Card | null {
    return this.cards[0]
  }

  /**
   * Advance all cards one step closer to player
   * Cards at distance 0 are removed (collision)
   * Returns: card that collided (if any)
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
   * Add card to a specific distance
   * If the same merge-compatible card exists, merge instead
   */
  addCardAtDistance(distance: number, newCard: Card): boolean {
    if (distance < 0 || distance >= LANE_DISTANCE_COUNT) {
      return false
    }

    const existingCard = this.cards[distance]
    if (existingCard && existingCard.name === newCard.name && existingCard.canMergeWith(newCard)) {
      // Merge only cards that explicitly allow grouping; special enemies stay standalone.
      existingCard.merge(newCard)
      return true
    }

    if (existingCard) {
      // Can't add - space occupied
      return false
    }

    this.cards[distance] = newCard
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

  removeCardAtDistance(distance: number): Card | null {
    if (distance < 0 || distance >= LANE_DISTANCE_COUNT) return null
    const card = this.cards[distance]
    this.cards[distance] = null
    return card
  }

  hasCards(): boolean {
    return this.cards.some((card) => card !== null)
  }

  getAllCards(): Card[] {
    return this.cards.filter((card): card is Card => card !== null)
  }

  clear(): void {
    this.cards.fill(null)
  }

  clone(): Lane {
    const cloned = new Lane(this.id, this.index)
    cloned.cards = this.cards.map((card) => (card ? card.clone() : null))
    return cloned
  }
}
