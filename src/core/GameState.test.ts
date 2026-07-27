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

  it('preserves a waiting spore countdown when rail gravity moves it forward', () => {
    const gameState = new GameState()
    const spore = new Card('spore-waiting', CardType.TRAP, '감염 포자', 'test', 0, 1, {
      trapKind: 'spore',
    })
    spore.sporeTurnsUntilSpread = 1
    gameState.lanes[1].setCardAtDistance(2, spore)

    gameState.compactAndRefillRails((laneIndex) => makeTreasure(`new-lane-${laneIndex}`))

    // Gravity moves the same Card instance, so partially elapsed infection
    // timers survive rail pushes instead of returning to the default 2 turns.
    expect(gameState.lanes[1].getCardAtDistance(0)).toBe(spore)
    expect(spore.sporeTurnsUntilSpread).toBe(1)
  })
})

describe('GameState.damageRandomFieldEnemy', () => {
  /** 대기 행에만 적이 남은 판 — 전방 전용 조준이면 여기서 통째로 헛돈다. */
  function makeEnemy(id: string, health: number): Card {
    return new Card(id, CardType.ENEMY, id, 'test', health, 1)
  }

  it('대기 행에만 적이 있어도 때린다 — 수혈 등 "필드 랜덤 적" 환급이 헛돌지 않는다', () => {
    const gameState = new GameState()
    const waiting = makeEnemy('waiting-enemy', 3)
    gameState.lanes[2].setCardAtDistance(2, waiting)

    const hit = gameState.damageRandomFieldEnemy(1)

    expect(hit).not.toBeNull()
    expect(hit?.cardId).toBe('waiting-enemy')
    expect(hit?.defeated).toBe(false)
    expect(waiting.getHealth()).toBe(2)
    // 전방 전용 조준은 같은 판에서 아무 대상도 찾지 못한다(회귀 방지 대조군).
    expect(gameState.damageRandomFrontEnemy(1)).toBeNull()
  })

  it('처치한 적은 레일에서 즉시 치운다', () => {
    const gameState = new GameState()
    gameState.lanes[0].setCardAtDistance(1, makeEnemy('dying-enemy', 1))

    const hit = gameState.damageRandomFieldEnemy(1)

    expect(hit?.defeated).toBe(true)
    expect(gameState.lanes[0].getCardAtDistance(1)).toBeNull()
  })

  it('필드에 적이 하나도 없으면 null을 돌려준다', () => {
    const gameState = new GameState()
    expect(gameState.damageRandomFieldEnemy(1)).toBeNull()
  })
})
