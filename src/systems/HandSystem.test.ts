import { describe, expect, it } from 'vitest'
import { GameState } from '@core/GameState'
import { HandSystem } from './HandSystem'
import { DropSystem } from './DropSystem'

/** Count a specific hand-card id inside the active chain for behavior tests. */
function countChainEntries(chain: ReturnType<typeof HandSystem.newChain>, defId: string): number {
  return chain.sequence.filter((id) => id === defId).length
}

describe('HandSystem combo-count cards', () => {
  it('records a normal 카드 as two combo counts and immediately satisfies 셔플', () => {
    const gameState = new GameState()
    const chain = HandSystem.newChain()
    gameState.character.addHandCard(DropSystem.makeCard('card'))

    const result = HandSystem.useSingle(gameState, chain, 0)

    expect(result.success).toBe(true)
    expect(result.comboCopiesAdded).toBe(1)
    expect(countChainEntries(chain, 'card')).toBe(2)
    expect(HandSystem.hasPendingRecipe(chain)).toBe(true)
    expect(HandSystem.fireNextPendingRecipe(gameState, chain).firedRecipes[0]?.recipe.id).toBe(
      'shuffle'
    )
  })

  it('records a triple 카드 as six combo counts for current and future recipes', () => {
    const gameState = new GameState()
    const chain = HandSystem.newChain()
    gameState.character.addHandCard({ ...DropSystem.makeCard('card'), merged: true })

    const result = HandSystem.useSingle(gameState, chain, 0)

    expect(result.success).toBe(true)
    expect(result.comboCopiesAdded).toBe(5)
    expect(countChainEntries(chain, 'card')).toBe(6)
    expect(HandSystem.previewTriggeredRecipes(HandSystem.newChain(), 'card', true)[0]?.id).toBe(
      'shuffle'
    )
  })

  it('still advances the hand gauge once without per-card candleGain data', () => {
    const gameState = new GameState()
    const chain = HandSystem.newChain()
    gameState.character.addHandCard(DropSystem.makeCard('coin'))

    HandSystem.useSingle(gameState, chain, 0)

    expect(gameState.character.candle).toBe(1)
  })
})
