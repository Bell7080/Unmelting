import { describe, expect, it, vi } from 'vitest'
import { CardType } from '@entities/Card'
import { CardSpawner } from './CardSpawner'

/** Opening-board safety should not depend on random trap subtype rolls. */
describe('CardSpawner opening board', () => {
  it('replaces first-board bomb/spore trap rolls with safe web traps', () => {
    const spawner = new CardSpawner()
    // Force the card-type roll into the trap band and the trap subtype roll
    // toward the end of the trap table where volatile hazards normally live.
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.7).mockReturnValueOnce(0.99)

    const card = spawner.spawnCardForOpeningBoard()

    expect(card.type).toBe(CardType.TRAP)
    expect(card.trapKind).toBe('web')
    vi.restoreAllMocks()
  })
})
