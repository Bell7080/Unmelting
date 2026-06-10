import { describe, expect, it } from 'vitest'
import { EventSpawnController, DEFAULT_EVENT_SPAWN_CONFIG } from './EventSpawn'

describe('EventSpawnController eligibility', () => {
  it('skips run-edge, milestone (every 10th), and final-ascent turns', () => {
    const c = new EventSpawnController()
    expect(c.isEligibleTurn(0)).toBe(false)
    expect(c.isEligibleTurn(10)).toBe(false)
    expect(c.isEligibleTurn(20)).toBe(false)
    expect(c.isEligibleTurn(30)).toBe(false)
    expect(c.isEligibleTurn(90)).toBe(false)
    expect(c.isEligibleTurn(95)).toBe(false)
    expect(c.isEligibleTurn(5)).toBe(true)
    expect(c.isEligibleTurn(15)).toBe(true)
    expect(c.isEligibleTurn(89)).toBe(true)
  })
})

describe('EventSpawnController ramp + reset', () => {
  it('never spawns on ineligible turns regardless of the roll', () => {
    const c = new EventSpawnController(DEFAULT_EVENT_SPAWN_CONFIG, () => 0) // always "hit" if rolled
    expect(c.rollForTurn(10)).toBe(false)
    expect(c.rollForTurn(90)).toBe(false)
  })

  it('resets the accumulated chance back to base after a spawn', () => {
    const c = new EventSpawnController(DEFAULT_EVENT_SPAWN_CONFIG, () => 1) // always miss
    for (let t = 1; t <= 25; t++) c.rollForTurn(t)
    expect(c.getChance()).toBeGreaterThan(DEFAULT_EVENT_SPAWN_CONFIG.baseChance)
    // Force a hit on the next eligible turn, then confirm the ramp reset.
    const hitController = new EventSpawnController(DEFAULT_EVENT_SPAWN_CONFIG, () => 0)
    hitController.rollForTurn(5)
    expect(hitController.getChance()).toBe(DEFAULT_EVENT_SPAWN_CONFIG.baseChance)
  })

  it('raises the per-turn chance monotonically across eligible misses', () => {
    const c = new EventSpawnController(DEFAULT_EVENT_SPAWN_CONFIG, () => 1) // always miss
    let prev = -1
    for (let t = 1; t <= 29; t++) {
      if (t % 10 === 0) continue
      c.rollForTurn(t)
      expect(c.getChance()).toBeGreaterThanOrEqual(prev)
      prev = c.getChance()
    }
  })

  it('early ramp makes the first door near-certain before the 30F boss', () => {
    // 25턴 무렵 누적 등장 확률이 충분히 높아야 한다(초반 맛보기 보장).
    let spawnedBy29 = 0
    const trials = 20000
    for (let i = 0; i < trials; i++) {
      const c = new EventSpawnController()
      let spawned = false
      for (let t = 1; t <= 29 && !spawned; t++) {
        if (c.rollForTurn(t)) spawned = true
      }
      if (spawned) spawnedBy29++
    }
    expect(spawnedBy29 / trials).toBeGreaterThan(0.95)
  })
})
