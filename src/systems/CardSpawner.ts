/**
 * CardSpawner - Generates random cards from the current base card set.
 *
 * Spawn weights and enemy stat bonuses are driven by the EmberSystem tier so
 * the field gets harder as the player's ember runs low. Enemy availability is
 * additionally gated by completed-turn bands so early runs introduce the new
 * candle creatures gradually between shops.
 */

import {
  Card,
  CardType,
  flowerDescription,
  flowerDisplayName,
  type EnemySpriteId,
  type FlowerKind,
  type TrapKind,
} from '@entities/Card'
import { EmberSystem, EmberTier, SpawnWeights } from './EmberSystem'

interface CardDefinition {
  /** Korean display name shown on the card face. */
  name: string
  /** Short English description used internally and in debug-friendly text. */
  description: string
  /** Enemy HP or trap damage, depending on card type. */
  healthOrDamage?: number
  /** Enemy attack value. */
  attack?: number
  /** Stable sprite id so grouped enemies can inherit the strongest artwork. */
  enemySpriteId?: EnemySpriteId
  /** Relative strength used to choose merged-group art/name. */
  enemyPower?: number
  /** Trap behavior bucket. */
  trapKind?: TrapKind
}

export const ENEMY_DEFINITIONS: CardDefinition[] = [
  {
    name: '양초 거미',
    description: 'Tiny candle spider',
    healthOrDamage: 1,
    attack: 1,
    enemySpriteId: 'enemyMoth',
    enemyPower: 1,
  },
  {
    name: '양초 키틴벌레',
    description: 'Wax-chitin crawler',
    healthOrDamage: 1,
    attack: 1,
    enemySpriteId: 'enemyChitin',
    enemyPower: 2,
  },
  {
    name: '양초 생쥐',
    description: 'Small candle mouse',
    healthOrDamage: 2,
    attack: 1,
    enemySpriteId: 'enemyMouse',
    enemyPower: 3,
  },
  {
    name: '양초 개구리',
    description: 'Leaping candle frog',
    healthOrDamage: 1,
    attack: 2,
    enemySpriteId: 'enemyFrog',
    enemyPower: 4,
  },
  {
    name: '양초 새',
    description: 'Candlelit bird',
    healthOrDamage: 3,
    attack: 3,
    enemySpriteId: 'enemyBird',
    enemyPower: 5,
  },
  {
    name: '양초 두더지',
    description: 'Burrowing candle mole',
    healthOrDamage: 5,
    attack: 2,
    enemySpriteId: 'enemyMole',
    enemyPower: 6,
  },
]

export const TRAP_DEFINITIONS: CardDefinition[] = [
  { name: '양초 거미줄', description: 'Deals 2 damage', healthOrDamage: 2, trapKind: 'web' },
  {
    name: '양초 폭탄',
    description: 'Arms on the front rail, then explodes for 5 damage',
    healthOrDamage: 0,
    trapKind: 'bomb',
  },
  {
    name: '감염 포자',
    description: 'Deals 1/3/5 damage and spreads every 2 turns',
    healthOrDamage: 1,
    trapKind: 'spore',
  },
]

export const TREASURE_DEFINITIONS: CardDefinition[] = [
  { name: '작은 상자', description: '1 item reward chest' },
]

export const MIMIC_BY_SPAN: Record<number, { health: number; attack: number; drops: number }> = {
  // Mimics are riskier than their source chests and pay the requested bonus loot on defeat.
  1: { health: 4, attack: 2, drops: 2 },
  2: { health: 10, attack: 5, drops: 5 },
  3: { health: 20, attack: 10, drops: 10 },
}

export class CardSpawner {
  private spawnSerial: number = 0
  private currentTier: EmberTier = 'bright'
  private progressionTurn: number = 1

  /** Update the active ember tier so the next spawn run uses the matching weights. */
  setTier(tier: EmberTier): void {
    this.currentTier = tier
  }

  /** Sync the completed game turn so enemy pools unlock at 1/11/21. */
  setProgressionTurn(turn: number): void {
    this.progressionTurn = Math.max(1, turn)
  }

  /** Spawn one random card per lane for the current turn refill. */
  spawnCardsForTurn(): Card[] {
    const cards: Card[] = []

    for (let i = 0; i < 3; i++) {
      cards.push(this.generateRandomCard())
    }

    return cards
  }

  /**
   * Spawn a safe card for the opening 3×3 setup. The first board may still
   * include web traps, but delayed hazards (bomb/spore) are held back until
   * normal refills so turn 1 starts readable and non-volatile.
   */
  spawnCardForOpeningBoard(): Card {
    return this.generateRandomCard({ openingBoard: true })
  }

  /**
   * Build one opening-board row with adjacent merge families separated. This
   * keeps the first few front rows from immediately becoming 2/3-lane enemies
   * while still using normal opening-safe card odds as the first choice.
   */
  spawnCardsForOpeningRow(laneCount: number = 3): Card[] {
    const cards: Card[] = []

    for (let laneIndex = 0; laneIndex < laneCount; laneIndex++) {
      const previous = cards[laneIndex - 1] ?? null
      let chosen: Card | null = null

      // Reroll a few times before falling back so randomness remains visible
      // but adjacent opening cells rarely share a merge-compatible family.
      for (let attempt = 0; attempt < 8; attempt++) {
        const candidate = this.spawnCardForOpeningBoard()
        if (!previous || !previous.canMergeWith(candidate)) {
          chosen = candidate
          break
        }
      }

      cards.push(chosen ?? this.generateOpeningFallback(previous))
    }

    return cards
  }

  /** Spawn a single fresh card for rail-maintenance refills. */
  spawnCardForRefill(): Card {
    return this.generateRandomCard()
  }

  /**
   * Build a normal refill row while avoiding adjacent merge families when
   * possible. Full-field rebuilds use this for the front row so a revived
   * player is not handed an immediate 2/3-lane wall unless RNG cannot find a
   * separator after several fair rerolls.
   */
  spawnCardsForSeparatedRefillRow(laneCount: number = 3): Card[] {
    const cards: Card[] = []

    for (let laneIndex = 0; laneIndex < laneCount; laneIndex++) {
      const previous = cards[laneIndex - 1] ?? null
      let chosen: Card | null = null

      // Keep normal refill odds as the first choice, but reroll short streaks
      // that would instantly merge across the freshly rebuilt front row.
      for (let attempt = 0; attempt < 8; attempt++) {
        const candidate = this.spawnCardForRefill()
        if (!previous || !previous.canMergeWith(candidate)) {
          chosen = candidate
          break
        }
      }

      cards.push(chosen ?? this.generateRefillSeparator(previous))
    }

    return cards
  }

  /** Pick a card type using per-kind buckets, then build the card. */
  private generateRandomCard(options: { openingBoard?: boolean } = {}): Card {
    const buckets = EmberSystem.getSpawnBuckets(this.currentTier)
    const webTrap = options.openingBoard
      ? buckets.webTrap + buckets.bombTrap + buckets.sporeTrap
      : buckets.webTrap
    const bombTrap = options.openingBoard ? 0 : buckets.bombTrap
    const sporeTrap = options.openingBoard ? 0 : buckets.sporeTrap
    const flower = options.openingBoard ? 0 : buckets.flower
    const total = buckets.enemy + webTrap + bombTrap + sporeTrap + buckets.treasure + flower
    const roll = Math.random() * total

    if (roll < buckets.enemy) return this.generateEnemy()
    if (roll < buckets.enemy + webTrap) return this.generateTrap({ trapKind: 'web' })
    if (roll < buckets.enemy + webTrap + bombTrap) return this.generateTrap({ trapKind: 'bomb' })
    if (roll < buckets.enemy + webTrap + bombTrap + sporeTrap) {
      return this.generateTrap({ trapKind: 'spore' })
    }
    if (roll < buckets.enemy + webTrap + bombTrap + sporeTrap + buckets.treasure) {
      return this.generateTreasure()
    }
    return this.generateFlowerSeed()
  }

  /** Enemy availability follows shop breakpoints: 1-10, 11-20, then 21+. */
  private getActiveEnemyDefinitions(): CardDefinition[] {
    if (this.progressionTurn >= 21) return ENEMY_DEFINITIONS
    if (this.progressionTurn >= 11) return ENEMY_DEFINITIONS.slice(0, 4)
    return ENEMY_DEFINITIONS.slice(0, 2)
  }

  /** Pick one of the current one-lane enemies, applying tier bonus if any. */
  private generateEnemy(): Card {
    const pool = this.getActiveEnemyDefinitions()
    const definition = pool[Math.floor(Math.random() * pool.length)]
    const bonus = EmberSystem.getEnemyStatBonus(this.currentTier)
    this.spawnSerial++
    return new Card(
      `enemy-${this.spawnSerial}-${Math.random()}`,
      CardType.ENEMY,
      definition.name,
      definition.description,
      (definition.healthOrDamage ?? 1) + bonus.hp,
      (definition.attack ?? 1) + bonus.atk,
      {
        enemySpriteId: definition.enemySpriteId,
        enemyPower: definition.enemyPower,
      }
    )
  }

  /** Spawn the current one-lane trap; wider traps are produced by row grouping. */
  private generateTrap(options: { trapKind?: TrapKind } = {}): Card {
    // Trap kind is usually selected by weighted buckets; the random fallback is
    // kept for targeted debug calls and future systems that request any trap.
    const trapPool = options.trapKind
      ? TRAP_DEFINITIONS.filter((definition) => definition.trapKind === options.trapKind)
      : TRAP_DEFINITIONS
    const definition = trapPool[Math.floor(Math.random() * trapPool.length)]
    this.spawnSerial++
    return new Card(
      `trap-${this.spawnSerial}-${Math.random()}`,
      CardType.TRAP,
      definition.name,
      definition.description,
      0,
      definition.healthOrDamage ?? 2,
      { trapKind: definition.trapKind }
    )
  }

  /** Pick a non-merging opening fallback when rerolls keep matching neighbors. */
  private generateOpeningFallback(previous: Card | null): Card {
    if (!previous) return this.spawnCardForOpeningBoard()

    // Use treasure as the neutral separator for enemy/trap streaks and choose
    // between enemy/web trap after a chest so the row does not become uniform.
    if (previous.type === CardType.ENEMY || previous.type === CardType.TRAP)
      return this.generateTreasure()
    return Math.random() < 0.5 ? this.generateEnemy() : this.generateTrap({ trapKind: 'web' })
  }

  /** Pick a non-merging normal-refill fallback when rerolls keep matching neighbors. */
  private generateRefillSeparator(previous: Card | null): Card {
    if (!previous) return this.spawnCardForRefill()

    // A chest is the safest visual divider after enemies/traps; after a chest,
    // choose an enemy or web so the row does not become a treasure streak.
    if (previous.type === CardType.ENEMY || previous.type === CardType.TRAP) {
      return this.generateTreasure()
    }
    return Math.random() < 0.5 ? this.generateEnemy() : this.generateTrap({ trapKind: 'web' })
  }

  /** Spawn the current one-lane chest; wider chests are produced by row grouping. */
  private generateTreasure(): Card {
    const definition = TREASURE_DEFINITIONS[Math.floor(Math.random() * TREASURE_DEFINITIONS.length)]
    this.spawnSerial++
    return new Card(
      `treasure-${this.spawnSerial}-${Math.random()}`,
      CardType.TREASURE,
      definition.name,
      definition.description
    )
  }

  /** Spawn a dormant flower seed; it only becomes a buff after reaching front row. */
  private generateFlowerSeed(): Card {
    this.spawnSerial++
    return new Card(
      `flower-${this.spawnSerial}-${Math.random()}`,
      CardType.FLOWER,
      flowerDisplayName('seed'),
      flowerDescription('seed'),
      0,
      0,
      { flowerKind: 'seed' }
    )
  }

  /** Pick the flower produced when a seed reaches the active row. */
  randomBloomKind(): Exclude<FlowerKind, 'seed'> {
    const kinds: Exclude<FlowerKind, 'seed'>[] = [
      'chamomile',
      'redRose',
      'marigold',
      'oleander',
      'lavender',
    ]
    return kinds[Math.floor(Math.random() * kinds.length)]
  }

  /** Monster flower inherits threat from the flower value that was gambled. */
  spawnMonsterFlower(power: number = 1): Card {
    const safePower = Math.max(1, power)
    this.spawnSerial++
    return new Card(
      `monster-flower-${this.spawnSerial}-${Math.random()}`,
      CardType.ENEMY,
      '괴물꽃',
      `Withered from a value-${safePower} flower`,
      safePower,
      safePower,
      {
        isSpecialEnemy: true,
        specialEnemyKind: 'monsterFlower',
        defeatDropCount: Math.max(1, Math.min(3, Math.ceil(safePower / 2))),
      }
    )
  }

  /** Read the active spawn weights so the UI can show the tier visually. */
  getActiveWeights(): SpawnWeights {
    return EmberSystem.getSpawnWeights(this.currentTier)
  }

  /**
   * Mimic: treasure event enemy whose stats and rewards mirror the chest width.
   * The 3-lane case is implemented even though normal play almost never creates it.
   */
  spawnMimic(span: number = 1): Card {
    const safeSpan = Math.max(1, Math.min(3, span))
    const stats = MIMIC_BY_SPAN[safeSpan]
    this.spawnSerial++
    const mimic = new Card(
      `mimic-${this.spawnSerial}-${Math.random()}`,
      CardType.ENEMY,
      '미믹',
      `Was a ${safeSpan}-lane treasure once`,
      stats.health,
      stats.attack,
      {
        isSpecialEnemy: true,
        specialEnemyKind: 'mimic',
        defeatDropCount: stats.drops,
      }
    )

    // Special mimics do not merge, so their width is assigned directly from the source chest.
    mimic.groupCount = safeSpan
    return mimic
  }
}
