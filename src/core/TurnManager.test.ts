import { afterEach, describe, expect, it, vi } from 'vitest'
import { GameState } from './GameState'
import { TurnManager } from './TurnManager'
import { Card, CardType } from '@entities/Card'
import { CardSpawner } from '@systems/CardSpawner'

function placeTreasure(gameState: GameState): Card {
  const treasure = new Card('treasure-test', CardType.TREASURE, '보물상자', 'test')
  gameState.lanes[0].setCardAtDistance(0, treasure)
  return treasure
}

describe('TurnManager treasure volatility', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('uses a 30% disappear window for active-row treasures', () => {
    const gameState = new GameState()
    const turnManager = new TurnManager(gameState)
    placeTreasure(gameState)
    vi.spyOn(Math, 'random').mockReturnValue(0.29)

    const changes = turnManager.applyTreasureVolatility(new CardSpawner())

    expect(changes[0]?.outcome).toBe('disappeared')
    expect(gameState.lanes[0].getCardAtDistance(0)).toBeNull()
  })

  it('keeps treasures in place when they hit the 60% safe window', () => {
    const gameState = new GameState()
    const turnManager = new TurnManager(gameState)
    const treasure = placeTreasure(gameState)
    vi.spyOn(Math, 'random').mockReturnValue(0.9)

    const changes = turnManager.applyTreasureVolatility(new CardSpawner())

    expect(changes).toEqual([])
    expect(gameState.lanes[0].getCardAtDistance(0)).toBe(treasure)
  })

  it('turns treasures into 1/1 mimics in the next 10% window', () => {
    const gameState = new GameState()
    const turnManager = new TurnManager(gameState)
    placeTreasure(gameState)
    vi.spyOn(Math, 'random').mockReturnValue(0.35)

    const changes = turnManager.applyTreasureVolatility(new CardSpawner())
    const mimic = gameState.lanes[0].getCardAtDistance(0)

    expect(changes[0]?.outcome).toBe('mimic')
    expect(mimic?.type).toBe(CardType.ENEMY)
    expect(mimic?.getHealth()).toBe(1)
    expect(mimic?.getDamage()).toBe(1)
  })

  it('does not end the game just because three traps occupy the active row', () => {
    const gameState = new GameState()
    const turnManager = new TurnManager(gameState)
    const traps = [0, 1, 2].map(
      (laneIndex) => new Card(`trap-${laneIndex}`, CardType.TRAP, '함정', 'test')
    )
    traps.forEach((trap, laneIndex) => gameState.lanes[laneIndex].setCardAtDistance(0, trap))
    gameState.regroupAllRows()

    expect(turnManager.checkHazardLoss()).toBe(false)
    expect(gameState.isGameOver).toBe(false)
    expect(gameState.lanes[0].getCardAtDistance(0)?.groupCount).toBe(3)
  })
})
