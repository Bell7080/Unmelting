import { describe, expect, it } from 'vitest'
import { GameState } from './GameState'
import { Card, CardType } from '@entities/Card'

/** Make deterministic test cards so rail-refill order is easy to assert. */
function makeTreasure(id: string): Card {
  return new Card(id, CardType.TREASURE, id, 'test')
}

describe('GameState rail maintenance', () => {
  it('keeps drawing and compacting until a completely emptied rail is full again', () => {
    const gameState = new GameState()
    const spawned: Card[] = []

    const changed = gameState.compactAndRefillRails((laneIndex) => {
      const card = makeTreasure(`refill-${spawned.length}-lane-${laneIndex}`)
      spawned.push(card)
      return card
    })

    expect(changed).toBe(true)
    expect(spawned).toHaveLength(9)
    for (const lane of gameState.lanes) {
      for (let distance = 0; distance < 3; distance++) {
        expect(lane.getCardAtDistance(distance)).not.toBeNull()
      }
    }
  })

  it('drops waiting cards before adding only the top cards needed to seal gaps', () => {
    const gameState = new GameState()
    const waiting = makeTreasure('waiting')
    gameState.lanes[0].setCardAtDistance(2, waiting)

    gameState.compactAndRefillRails((laneIndex) => makeTreasure(`new-lane-${laneIndex}`))

    expect(gameState.lanes[0].getCardAtDistance(0)).toBe(waiting)
    for (let distance = 0; distance < 3; distance++) {
      expect(gameState.lanes[0].getCardAtDistance(distance)).not.toBeNull()
    }
  })
})
