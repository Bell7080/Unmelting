import { describe, expect, it, vi } from 'vitest'
import { CardType } from '@entities/Card'
import { EmberSystem, SPROUT_SPAWN_ADJUST } from './EmberSystem'
import { CardSpawner, pickWeightedEnemyDefinition, enemyPowerBiasExponent, type CardDefinition } from './CardSpawner'

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

describe('CardSpawner monster flower scaling', () => {
  it('uses the 20-turn special-enemy tier for both initial stats and periodic growth', () => {
    const spawner = new CardSpawner()
    // 20턴부터 특수 적 티어 2이므로 가치 1 괴물꽃은 2/2로 태어나고 주기당 +2/+2 성장한다.
    spawner.setProgressionTurn(20)

    const monster = spawner.spawnMonsterFlower(1)

    expect({ hp: monster.getHealth(), atk: monster.getDamage() }).toEqual({ hp: 2, atk: 2 })
    expect(monster.monsterFlowerGrowthAmount).toBe(2)
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

  it('keeps an already exposed preview stable across turn-sync refreshes', () => {
    const spawner = new CardSpawner()
    // Force predictable enemy previews; object identity proves the queue was not cleared.
    vi.spyOn(Math, 'random').mockReturnValue(0)

    const preview = spawner.peekNextRefillCards(3)
    spawner.setProgressionTurn(12)

    expect(spawner.peekNextRefillCards(3)[0]).toBe(preview[0])
    vi.restoreAllMocks()
  })
})

describe('새싹 병아리 난이도 스폰 보정', () => {
  it('적·함정을 낮추고 보물·꽃을 올린다(직업 보정과 독립)', () => {
    const spawner = new CardSpawner()
    const base = spawner.getEffectiveWeights()

    spawner.setDifficultySpawnAdjust({ ...SPROUT_SPAWN_ADJUST })
    const sprout = spawner.getEffectiveWeights()

    expect(sprout.enemy).toBe(base.enemy + SPROUT_SPAWN_ADJUST.enemy)
    expect(sprout.trap).toBe(base.trap + SPROUT_SPAWN_ADJUST.trap)
    expect(sprout.treasure).toBe(base.treasure + SPROUT_SPAWN_ADJUST.treasure)
    expect(sprout.flower).toBe(base.flower + SPROUT_SPAWN_ADJUST.flower)
  })

  it('직업 보정과 합산되며 난이도 해제 시 직업 보정만 남는다', () => {
    const spawner = new CardSpawner()
    const base = spawner.getEffectiveWeights()
    spawner.setDifficultySpawnAdjust({ ...SPROUT_SPAWN_ADJUST })
    spawner.setJobSpawnAdjust(0, 0, 20, 0)

    expect(spawner.getEffectiveWeights().treasure).toBe(base.treasure + SPROUT_SPAWN_ADJUST.treasure + 20)

    spawner.setDifficultySpawnAdjust(null)
    expect(spawner.getEffectiveWeights().treasure).toBe(base.treasure + 20)
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

describe('층 깊이에 따른 적 풀 편향(pickWeightedEnemyDefinition)', () => {
  const pool: CardDefinition[] = [
    { name: '약함', description: 'weak', healthOrDamage: 1, attack: 1, enemyPower: 1 },
    { name: '강함', description: 'strong', healthOrDamage: 5, attack: 5, enemyPower: 5 },
  ]

  it('턴 1에서는 편향이 없어 균등에 가깝다', () => {
    expect(enemyPowerBiasExponent(1)).toBe(0)
    let strongCount = 0
    const N = 5000
    for (let i = 0; i < N; i++) {
      const roll = i / N // 결정적 시퀀스로 반반을 확인한다
      if (pickWeightedEnemyDefinition(pool, 1, () => roll).name === '강함') strongCount++
    }
    expect(strongCount / N).toBeCloseTo(0.5, 1)
  })

  it('턴이 깊어질수록 강한 쪽 가중치가 커지지만 약한 쪽이 0으로 죽지 않는다', () => {
    // 결정적 rng(0.99)로 "그 턴의 최댓값 근처"를 뽑아, 최댓값이 강함 쪽 가중치를 넘지
    // 못하면 fallback으로 마지막 원소가 나온다 — 강함 쪽 비중이 늘수록 이 상황이 잦아진다.
    const weightOf = (name: string, turn: number): number => {
      const exponent = enemyPowerBiasExponent(turn)
      const def = pool.find((d) => d.name === name)!
      const min = Math.min(...pool.map((d) => d.enemyPower ?? 0))
      const max = Math.max(...pool.map((d) => d.enemyPower ?? 0))
      const rank = ((def.enemyPower ?? 0) - min) / (max - min)
      return Math.pow(0.3 + rank, exponent)
    }
    const shareAt = (turn: number): number => {
      const w = pool.map((d) => weightOf(d.name, turn))
      const total = w[0] + w[1]
      return w[1] / total // 강함 쪽 비중
    }
    const early = shareAt(21) // k=0.5
    const late = shareAt(99) // k=2(상한)
    expect(late).toBeGreaterThan(early)
    expect(early).toBeGreaterThan(0.5) // 이미 살짝 강함 쪽으로 기울어 있다
    expect(late).toBeLessThan(1) // 약한 쪽도 완전히 0은 아니다

    // 실제 뽑기로도 약한 쪽이 turn 99에서 여전히 관측 가능한 확률로 나온다.
    let weakCount = 0
    const N = 20000
    for (let i = 0; i < N; i++) {
      if (pickWeightedEnemyDefinition(pool, 99, Math.random).name === '약함') weakCount++
    }
    expect(weakCount / N).toBeGreaterThan(0.01)
    expect(weakCount / N).toBeLessThan(0.15)
  })

  it('편향 지수는 2에서 상한이 걸린다', () => {
    expect(enemyPowerBiasExponent(1000)).toBe(2)
  })

  it('풀이 1장뿐이면 그대로 반환한다', () => {
    const single: CardDefinition[] = [pool[0]]
    expect(pickWeightedEnemyDefinition(single, 99, Math.random)).toBe(single[0])
  })
})
