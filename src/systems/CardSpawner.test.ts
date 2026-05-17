import { describe, expect, it, vi } from 'vitest'
import { CardType } from '@entities/Card'
import { EmberSystem } from './EmberSystem'
import { CardSpawner } from './CardSpawner'

/** Opening-board safety should not depend on random trap subtype rolls. */
describe('CardSpawner opening board', () => {
  it('replaces first-board bomb/spore trap rolls with safe web traps', () => {
    const spawner = new CardSpawner()
    // Force the card-type roll into the opening-safe trap band. The second
    // value is consumed by the single-web trap pool and must not select a hazard.
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.7).mockReturnValueOnce(0.99)

    const card = spawner.spawnCardForOpeningBoard()

    expect(card.type).toBe(CardType.TRAP)
    expect(card.trapKind).toBe('web')
    vi.restoreAllMocks()
  })

  it('separates adjacent opening cells that would otherwise merge', () => {
    const spawner = new CardSpawner()
    // A constant enemy roll would normally create a 3-lane enemy formation.
    // The opening-row helper should insert a fallback separator instead.
    vi.spyOn(Math, 'random').mockReturnValue(0)

    const row = spawner.spawnCardsForOpeningRow(3)

    expect(row).toHaveLength(3)
    expect(row[0].canMergeWith(row[1])).toBe(false)
    expect(row[1].canMergeWith(row[2])).toBe(false)
    vi.restoreAllMocks()
  })
})

describe('EmberSystem spawn weights', () => {
  it('raises ordinary trap odds while preserving former bomb and spore odds', () => {
    const brightBuckets = EmberSystem.getSpawnBuckets('bright')
    const brightWeights = EmberSystem.getSpawnWeights('bright')

    expect(brightBuckets.webTrap).toBe(12)
    expect(brightBuckets.bombTrap).toBe(4)
    expect(brightBuckets.sporeTrap).toBe(4)
    expect(brightBuckets.flower).toBe(8)
    expect(brightWeights).toEqual({ enemy: 50, trap: 20, treasure: 22, flower: 8 })
  })
})
