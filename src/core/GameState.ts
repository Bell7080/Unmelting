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

  /**
   * Lanes whose slot at the given row holds the same Card instance.
   * (Adjacent same-type cards merge by sharing one Card object.)
   */
  getGroupLanes(laneIndex: number, distance: number): number[] {
    const card = this.lanes[laneIndex]?.getCardAtDistance(distance)
    if (!card) return []
    const lanes: number[] = []
    for (let i = 0; i < this.lanes.length; i++) {
      if (this.lanes[i].getCardAtDistance(distance) === card) {
        lanes.push(i)
      }
    }
    return lanes
  }

  /**
   * Walk a row left-to-right; whenever two adjacent slots hold cards of the
   * same merge-compatible type, fold the right card into the left and
   * replace the right slot with the (now bigger) left Card. Result: a
   * contiguous run of same-type
   * cards becomes a single Card occupying multiple lane slots.
   * Only groups the active row (distance 0); preview rows stay ungrouped.
   */
  regroupRow(distance: number): void {
    if (distance < 0 || distance >= LANE_DISTANCE_COUNT) return
    // Only regroup the active row (distance 0)
    if (distance !== 0) return

    let i = 0
    while (i < this.lanes.length - 1) {
      const left = this.lanes[i].getCardAtDistance(distance)
      const right = this.lanes[i + 1].getCardAtDistance(distance)

      if (!left || !right || left === right) {
        i++
        continue
      }
      if (left.canMergeWith(right)) {
        left.merge(right)
        this.lanes[i + 1].setCardAtDistance(distance, left)
      }
      i++
    }
  }

  regroupAllRows(): void {
    // Only regroup the active row (distance 0).
    this.regroupRow(0)
  }

  /**
   * Drop cards down to fill holes and refill empty top slots with the caller.
   * Returns true when at least one card changed row, which the UI can animate.
   */
  compactLanes(): boolean {
    let changed = false
    for (const lane of this.lanes) {
      // Repeatedly shift down until no holes remain below a card.
      let safety = LANE_DISTANCE_COUNT
      while (safety-- > 0) {
        let didShift = false
        for (let d = 0; d < LANE_DISTANCE_COUNT - 1; d++) {
          if (!lane.getCardAtDistance(d) && lane.getCardAtDistance(d + 1)) {
            lane.setCardAtDistance(d, lane.getCardAtDistance(d + 1))
            lane.setCardAtDistance(d + 1, null)
            didShift = true
            changed = true
          }
        }
        if (!didShift) break
      }
    }
    return changed
  }

  /**
   * Remove every slot reference of a given Card from a row, returning the
   * lane indices that were cleared.
   */
  removeCardFromRow(card: Card, distance: number): number[] {
    const cleared: number[] = []
    for (let i = 0; i < this.lanes.length; i++) {
      if (this.lanes[i].getCardAtDistance(distance) === card) {
        this.lanes[i].setCardAtDistance(distance, null)
        cleared.push(i)
      }
    }
    return cleared
  }

  /**
   * Within one lane, drop the bottom slot and shift everything down one step.
   * The top slot becomes empty for the caller to fill.
   */
  collapseLane(laneIndex: number): void {
    const lane = this.lanes[laneIndex]
    if (!lane) return
    for (let d = 0; d < LANE_DISTANCE_COUNT - 1; d++) {
      lane.setCardAtDistance(d, lane.getCardAtDistance(d + 1))
    }
    lane.setCardAtDistance(LANE_DISTANCE_COUNT - 1, null)
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
