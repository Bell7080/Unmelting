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

  it('prevents 3-lane walls for back-row refills while allowing 2-lane merges', () => {
    const spawner = new CardSpawner()
    // A constant enemy roll would create a 3-lane wall; the helper should break it.
    // 2-lane merges (e.g. lanes 0+1 both enemy) are intentionally allowed for back rows
    // so the ■ㅁ■ forced-gap pattern is avoided.
    vi.spyOn(Math, 'random').mockReturnValue(0)

    const row = spawner.spawnCardsForSeparatedRefillRow(3)

    expect(row).toHaveLength(3)
    // All three must NOT be merge-compatible (no full 3-lane wall).
    const all3Merge = row[0].canMergeWith(row[1]) && row[1].canMergeWith(row[2])
    expect(all3Merge).toBe(false)
    vi.restoreAllMocks()
  })
})

describe('CardSpawner final ascent starlight', () => {
  it('spawns non-merging starlight keys only after the final ascent rule is active', () => {
    const spawner = new CardSpawner()
    spawner.setFinalAscentActive(true)
    // First roll enters the 12% starlight band; second roll only stabilizes the id suffix.
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.01).mockReturnValueOnce(0.42)

    const card = spawner.spawnCardForRefill()

    expect(card.type).toBe(CardType.TREASURE)
    expect(card.name).toBe('별빛')
    expect(card.treasureKind).toBe('starlight')
    expect(card.canMergeWith(card)).toBe(false)
    vi.restoreAllMocks()
  })
})

describe('CardSpawner refill preview queue', () => {
  it('uses the previewed lane card as the next real refill', () => {
    const spawner = new CardSpawner()
    // Constant enemy rolls make the assertion about object identity, not RNG shape.
    vi.spyOn(Math, 'random').mockReturnValue(0)

    const preview = spawner.peekNextRefillCards(3)
    const spawned = spawner.spawnCardForRefill(1)

    expect(spawned).toBe(preview[1])
    expect(spawned.type).toBe(CardType.ENEMY)
    vi.restoreAllMocks()
  })
})

describe('EmberSystem spawn weights', () => {
  it('raises ordinary trap odds while preserving former bomb and spore odds', () => {
    const brightBuckets = EmberSystem.getSpawnBuckets('bright')
    const brightWeights = EmberSystem.getSpawnWeights('bright')

    expect(brightBuckets.webTrap).toBe(17)
    expect(brightBuckets.bombTrap).toBe(4)
    expect(brightBuckets.sporeTrap).toBe(4)
    expect(brightBuckets.flower).toBe(9)
    expect(brightWeights).toEqual({ enemy: 44, trap: 25, treasure: 22, flower: 9 })
  })
})
