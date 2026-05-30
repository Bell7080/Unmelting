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
    name: '양초 키틴벌레',
    description: 'Wax-chitin crawler',
    healthOrDamage: 1,
    attack: 1,
    enemySpriteId: 'enemyChitin',
    enemyPower: 1,
  },
  {
    name: '양초 거미',
    description: 'Tiny candle spider',
    healthOrDamage: 1,
    attack: 1,
    enemySpriteId: 'enemyMoth',
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
  {
    name: '양초 벌',
    description: 'Wax stinger bee',
    healthOrDamage: 3,
    attack: 2,
    enemySpriteId: 'enemyBee',
    enemyPower: 7,
  },
  {
    name: '양초 사마귀',
    description: 'Candle mantis',
    healthOrDamage: 3,
    attack: 2,
    enemySpriteId: 'enemyMantis',
    enemyPower: 8,
  },
  {
    name: '양초 박쥐',
    description: 'Cave candle bat',
    healthOrDamage: 4,
    attack: 3,
    enemySpriteId: 'enemyBat',
    enemyPower: 9,
  },
  {
    name: '양초 고슴도치',
    description: 'Prickled candle hedgehog',
    healthOrDamage: 5,
    attack: 3,
    enemySpriteId: 'enemyHedgehog',
    enemyPower: 10,
  },
  {
    name: '양초 도마뱀',
    description: 'Waxscale lizard',
    healthOrDamage: 5,
    attack: 4,
    enemySpriteId: 'enemyLizard',
    enemyPower: 11,
  },
  {
    name: '양초 너구리',
    description: 'Ash-striped raccoon',
    healthOrDamage: 8,
    attack: 4,
    enemySpriteId: 'enemyRaccoon',
    enemyPower: 12,
  },
  {
    name: '양초 풍뎅이',
    description: 'Armored candle beetle',
    healthOrDamage: 6,
    attack: 5,
    enemySpriteId: 'enemyBeetle',
    enemyPower: 13,
  },
  {
    name: '양초 전갈',
    description: 'Stinging candle scorpion',
    healthOrDamage: 6,
    attack: 5,
    enemySpriteId: 'enemyScorpion',
    enemyPower: 14,
  },
  {
    name: '양초 담비',
    description: 'Swift candle marten',
    healthOrDamage: 8,
    attack: 7,
    enemySpriteId: 'enemyMarten',
    enemyPower: 15,
  },
  {
    name: '양초 오소리',
    description: 'Fierce candle badger',
    healthOrDamage: 7,
    attack: 8,
    enemySpriteId: 'enemyBadger',
    enemyPower: 16,
  },
  {
    name: '양초 나무늘보',
    description: 'Hardy candle sloth',
    healthOrDamage: 15,
    attack: 4,
    enemySpriteId: 'enemySloth',
    enemyPower: 17,
  },
  {
    name: '양초 자칼',
    description: 'Savage candle jackal',
    healthOrDamage: 7,
    attack: 12,
    enemySpriteId: 'enemyJackal',
    enemyPower: 18,
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
  /** 시련(보스 클리어 후 강제 선택) 효과로 누적되는 영속 modifier들.
   *  spawn/적 스탯/함정 피해 모두 다음 스폰부터 즉시 반영된다. */
  private trialEnemyHpBonus: number = 0
  private trialEnemyAtkBonus: number = 0
  private trialTrapDamageBonus: number = 0
  private trialTreasureSpawnScale: number = 1
  /** 90F boss+trial 이후에는 별빛만 턴을 올리는 최종 등반 규칙을 켠다. */
  private finalAscentActive: boolean = false
  // After a spore spawns, block spore generation for the next N cards to prevent
  // consecutive spore clusters. 5 cards ≈ at least 1 full 3-lane turn gap.
  private sporeCooldownCards: number = 0

  /** Update the active ember tier so the next spawn run uses the matching weights. */
  setTier(tier: EmberTier): void {
    this.currentTier = tier
  }

  /** 시련 효과 주입. index.ts의 runModifiers에서 호출되어 누적 상태와 동기화된다. */
  setTrialModifiers(mods: {
    enemyHpBonus: number
    enemyAtkBonus: number
    trapDamageBonus: number
    treasureSpawnScale: number
  }): void {
    this.trialEnemyHpBonus = Math.max(0, mods.enemyHpBonus)
    this.trialEnemyAtkBonus = Math.max(0, mods.enemyAtkBonus)
    this.trialTrapDamageBonus = Math.max(0, mods.trapDamageBonus)
    this.trialTreasureSpawnScale = Math.max(0, mods.treasureSpawnScale)
  }

  /** Sync the completed game turn so enemy pools unlock at 1/11/21. */
  setProgressionTurn(turn: number): void {
    this.progressionTurn = Math.max(1, turn)
  }

  /** Toggle the 90~100F starlight-key refill rule after the 90F forced trial. */
  setFinalAscentActive(active: boolean): void {
    this.finalAscentActive = active
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
    // 최종 등반에서는 드문 별빛 칸을 섞어 10번 수집해야 100턴에 닿게 만든다.
    if (!options.openingBoard && this.finalAscentActive && Math.random() < 0.12) {
      // 별빛도 실제 리필 1장으로 취급해 포자 연속 방지 카운터를 함께 소모한다.
      if (this.sporeCooldownCards > 0) this.sporeCooldownCards--
      return this.generateStarlight()
    }

    const buckets = EmberSystem.getSpawnBuckets(this.currentTier)
    const webTrap = options.openingBoard
      ? buckets.webTrap + buckets.bombTrap + buckets.sporeTrap
      : buckets.webTrap
    const bombTrap = options.openingBoard ? 0 : buckets.bombTrap
    // Spores on cooldown are treated as weight 0; the slot is silently folded into
    // the rest of the distribution so the total chance of non-spore cards increases.
    const sporeCooling = this.sporeCooldownCards > 0
    const sporeTrap = options.openingBoard || sporeCooling ? 0 : buckets.sporeTrap
    const flower = options.openingBoard ? 0 : buckets.flower
    // 시련 '가난'은 보물상자 가중치를 25% 깎는다. 1 이상이면 평소 그대로.
    const treasure = buckets.treasure * this.trialTreasureSpawnScale
    const total = buckets.enemy + webTrap + bombTrap + sporeTrap + treasure + flower
    const roll = Math.random() * total

    if (this.sporeCooldownCards > 0) this.sporeCooldownCards--

    if (roll < buckets.enemy) return this.generateEnemy()
    if (roll < buckets.enemy + webTrap) return this.generateTrap({ trapKind: 'web' })
    if (roll < buckets.enemy + webTrap + bombTrap) return this.generateTrap({ trapKind: 'bomb' })
    if (roll < buckets.enemy + webTrap + bombTrap + sporeTrap) {
      // Reset cooldown so the next 5 spawned cards cannot be spores.
      this.sporeCooldownCards = 5
      const spore = this.generateTrap({ trapKind: 'spore' })
      // Flag the spore so applySporeSpread skips the birth-turn tick; turn counting
      // starts from the NEXT turn so the player sees a full 2-turn warning.
      spore.justEnteredRail = true
      return spore
    }
    if (roll < buckets.enemy + webTrap + bombTrap + sporeTrap + treasure) {
      return this.generateTreasure()
    }
    return this.generateFlowerSeed()
  }

  /** Enemy availability follows turn milestones. 30/40/50층부터 1~6번 풀을
   *  단계적으로 7~12번으로 치환해 후반부 난이도 곡선을 유지한다. */
  private getActiveEnemyDefinitions(): CardDefinition[] {
    if (this.progressionTurn < 11) return ENEMY_DEFINITIONS.slice(0, 2)
    if (this.progressionTurn < 21) return ENEMY_DEFINITIONS.slice(0, 4)
    if (this.progressionTurn < 30) return ENEMY_DEFINITIONS.slice(0, 6)

    // 30~39: 1/2번(키틴/거미)을 7/8번(벌/사마귀)로 교체.
    if (this.progressionTurn < 40) {
      return [...ENEMY_DEFINITIONS.slice(6, 8), ...ENEMY_DEFINITIONS.slice(2, 6)]
    }
    // 40~49: 3/4번(생쥐/개구리)을 9/10번(박쥐/고슴도치)로 교체.
    if (this.progressionTurn < 50) {
      return [...ENEMY_DEFINITIONS.slice(6, 10), ...ENEMY_DEFINITIONS.slice(4, 6)]
    }
    // 50~59: 5/6번(새/두더지)을 11/12번(도마뱀/너구리)로 교체. 7~12번 풀.
    if (this.progressionTurn < 60) return ENEMY_DEFINITIONS.slice(6, 12)

    // 60~69: 7/8번(벌/사마귀)을 13/14번(풍뎅이/전갈)로 교체. 9~14번 풀.
    if (this.progressionTurn < 70) {
      return [...ENEMY_DEFINITIONS.slice(12, 14), ...ENEMY_DEFINITIONS.slice(8, 12)]
    }
    // 70~79: 9/10번(박쥐/고슴도치)을 15/16번(담비/오소리)로 교체. 11~16번 풀.
    if (this.progressionTurn < 80) {
      return [...ENEMY_DEFINITIONS.slice(12, 16), ...ENEMY_DEFINITIONS.slice(10, 12)]
    }
    // 80+: 11/12번(도마뱀/너구리)을 17/18번(나무늘보/자칼)로 교체. 13~18번 풀.
    return ENEMY_DEFINITIONS.slice(12, 18)
  }

  /** Pick one of the current one-lane enemies, applying tier bonus if any.
   *  시련 '방화광'이 누적될 경우 trialEnemyHp/AtkBonus가 정수 단위로 추가된다. */
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
      (definition.healthOrDamage ?? 1) + bonus.hp + this.trialEnemyHpBonus,
      (definition.attack ?? 1) + bonus.atk + this.trialEnemyAtkBonus,
      {
        enemySpriteId: definition.enemySpriteId,
        enemyPower: definition.enemyPower,
      }
    )
  }

  /** Spawn the current one-lane trap; wider traps are produced by row grouping.
   *  시련 '양초 사냥꾼' 누적 시 trialTrapDamageBonus가 baseDamage에 더해진다.
   *  단 bomb은 baseDamage를 사용하지 않으므로 모든 카운트다운 처리는 영향이 없다. */
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
      (definition.healthOrDamage ?? 2) + this.trialTrapDamageBonus,
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

  /** Spawn a final-ascent starlight key; it is treasure-like but never merges or drops hand cards. */
  private generateStarlight(): Card {
    this.spawnSerial++
    return new Card(
      `starlight-${this.spawnSerial}-${Math.random()}`,
      CardType.TREASURE,
      '별빛',
      '90~100층 전용 열쇠: 획득할 때만 턴 +1',
      0,
      0,
      { treasureKind: 'starlight' }
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
