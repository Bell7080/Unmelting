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
    healthOrDamage: 5,
    attack: 3,
    enemySpriteId: 'enemyBee',
    enemyPower: 7,
  },
  {
    name: '양초 사마귀',
    description: 'Candle mantis',
    healthOrDamage: 5,
    attack: 3,
    enemySpriteId: 'enemyMantis',
    enemyPower: 8,
  },
  {
    name: '양초 박쥐',
    description: 'Cave candle bat',
    healthOrDamage: 7,
    attack: 3,
    enemySpriteId: 'enemyBat',
    enemyPower: 9,
  },
  {
    name: '양초 고슴도치',
    description: 'Prickled candle hedgehog',
    healthOrDamage: 8,
    attack: 3,
    enemySpriteId: 'enemyHedgehog',
    enemyPower: 10,
  },
  {
    name: '양초 도마뱀',
    description: 'Waxscale lizard',
    healthOrDamage: 7,
    attack: 4,
    enemySpriteId: 'enemyLizard',
    enemyPower: 11,
  },
  {
    name: '양초 너구리',
    description: 'Ash-striped raccoon',
    healthOrDamage: 9,
    attack: 4,
    enemySpriteId: 'enemyRaccoon',
    enemyPower: 12,
  },
  {
    name: '양초 풍뎅이',
    description: 'Armored candle beetle',
    healthOrDamage: 11,
    attack: 5,
    enemySpriteId: 'enemyBeetle',
    enemyPower: 13,
  },
  {
    name: '양초 전갈',
    description: 'Stinging candle scorpion',
    healthOrDamage: 10,
    attack: 5,
    enemySpriteId: 'enemyScorpion',
    enemyPower: 14,
  },
  {
    name: '양초 담비',
    description: 'Swift candle marten',
    healthOrDamage: 14,
    attack: 7,
    enemySpriteId: 'enemyMarten',
    enemyPower: 15,
  },
  {
    name: '양초 오소리',
    description: 'Fierce candle badger',
    healthOrDamage: 13,
    attack: 8,
    enemySpriteId: 'enemyBadger',
    enemyPower: 16,
  },
  {
    name: '양초 나무늘보',
    description: 'Hardy candle sloth',
    healthOrDamage: 18,
    attack: 4,
    enemySpriteId: 'enemySloth',
    enemyPower: 17,
  },
  {
    name: '양초 자칼',
    description: 'Savage candle jackal',
    healthOrDamage: 10,
    attack: 12,
    enemySpriteId: 'enemyJackal',
    enemyPower: 18,
  },
]

export const TRAP_DEFINITIONS: CardDefinition[] = [
  { name: '양초 거미줄', description: 'Deals 1/5/instant damage', healthOrDamage: 1, trapKind: 'web' },
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
  // 2/3칸은 합쳐진 적처럼 단일(4/2)을 칸 수만큼 더한 뒤 합체 보너스(2칸 +2/+2, 3칸 +3/+3)를 얹는다.
  1: { health: 4, attack: 2, drops: 2 },
  2: { health: 10, attack: 6, drops: 5 }, // 4*2+2 / 2*2+2
  3: { health: 15, attack: 9, drops: 10 }, // 4*3+3 / 2*3+3
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
  /** 유물 구매로 누적된 스폰 가중치 보정. 양수=증가, 음수=감소. 정규화는 roll 총합으로 자동 처리. */
  private relicSpawnAdjust: { enemy: number; treasure: number; spore: number; flower: number } = { enemy: 0, treasure: 0, spore: 0, flower: 0 }
  /** 직업 선택으로 적용된 스폰 가중치 보정 — 런 내내 고정되며 런 리셋 시 초기화된다. */
  private jobSpawnAdjust: { enemy: number; trap: number; treasure: number; flower: number } = { enemy: 0, trap: 0, treasure: 0, flower: 0 }
  /** 유물 에나벨라의 펜던트로 적용되는 적 스폰 시 HP 보너스(보스 미적용). */
  private relicEnemyHpBonus: number = 0
  /** 황금 열쇠 유물 장착 시 활성화되는 황금 상자 대체 가중치. */
  private goldenChestWeight: number = 0
  // 포자/별빛은 "배치된 카드" 기준으로 연속 등장을 막는다. 리롤로 버려진 후보는
  // 카운트를 소모하지 않도록 쿨다운은 commitSpawnCooldowns(배치 시점)에서만 갱신한다.
  // 연속 등장(바로 다음 칸)만 막으면 되므로 최소 1칸 간격으로 둔다. 빈도 자체는 유지.
  private static readonly SPORE_COOLDOWN_CARDS = 1
  // STARLIGHT_COOLDOWN_CARDS 3 ≈ 한 번 등장 후 같은 턴/바로 다음 칸 연속 등장 차단(최소 1칸↑).
  private static readonly STARLIGHT_COOLDOWN_CARDS = 3
  // 최소 STARLIGHT_MIN_INTERVAL 칸 이후부터 등장 가능. 이후 미등장 1칸마다 +5% 누적 확률.
  private static readonly STARLIGHT_MIN_INTERVAL = 6
  private static readonly STARLIGHT_BASE_CHANCE = 0.12
  private static readonly STARLIGHT_ACCUM_PER_MISS = 0.05
  private sporeCooldownCards: number = 0
  private starlightCooldownCards: number = 0
  /** 별빛 미등장 칸 수(최소 간격 이후 기준). 등장 시 0으로 리셋. */
  private starlightMissStreak: number = 0

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

  /** 전염된 포자 생성 시 시련 보너스를 물려주기 위해 TurnManager가 참조한다. */
  getTrialTrapDamageBonus(): number {
    return this.trialTrapDamageBonus
  }

  /** Sync the completed game turn so enemy pools unlock at 1/11/21. */
  setProgressionTurn(turn: number): void {
    this.progressionTurn = Math.max(1, turn)
  }

  /** Toggle the 90~100F starlight-key refill rule after the 90F forced trial. */
  setFinalAscentActive(active: boolean): void {
    this.finalAscentActive = active
  }

  /** 유물 구매/런 리셋 시 스폰 가중치 보정을 delta 값만큼 누적한다. */
  adjustRelicSpawn(type: 'enemy' | 'treasure' | 'spore' | 'flower', delta: number): void {
    this.relicSpawnAdjust[type] += delta
  }

  /** 직업 선택 시 스폰 가중치를 설정한다. 런 리셋마다 resetRelicModifiers에서 함께 초기화된다. */
  setJobSpawnAdjust(enemy: number, trap: number, treasure: number, flower: number): void {
    this.jobSpawnAdjust = { enemy, trap, treasure, flower }
  }

  /** 황금 열쇠 유물 장착 시 황금 상자 대체 가중치를 설정한다.
   *  goldenChestWeight / effectiveTreasureWeight 비율로 황금 상자가 등장한다. */
  adjustGoldenChestWeight(weight: number): void {
    this.goldenChestWeight += weight
  }

  /** 에나벨라의 펜던트: 적 스폰 시 HP 보너스를 delta만큼 누적한다. */
  adjustRelicEnemyHpBonus(delta: number): void {
    this.relicEnemyHpBonus += delta
  }

  /** 런 시작 시 유물/직업 modifiers를 초기화한다. */
  resetRelicModifiers(): void {
    this.relicSpawnAdjust = { enemy: 0, treasure: 0, spore: 0, flower: 0 }
    this.jobSpawnAdjust = { enemy: 0, trap: 0, treasure: 0, flower: 0 }
    this.relicEnemyHpBonus = 0
    this.goldenChestWeight = 0
  }

  /** 다시 시작 시 스폰 시리얼·페이싱 쿨다운까지 비워 새 런 첫 스폰 타이밍을 동일하게 한다. */
  resetSpawnState(): void {
    this.spawnSerial = 0
    this.sporeCooldownCards = 0
    this.starlightCooldownCards = 0
    this.starlightMissStreak = 0
  }

  /** Spawn one random card per lane for the current turn refill (배치 → 쿨다운 commit). */
  spawnCardsForTurn(): Card[] {
    const cards: Card[] = []

    for (let i = 0; i < 3; i++) {
      const card = this.generateRandomCard()
      this.commitSpawnCooldowns(card)
      cards.push(card)
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

  /** 대기칸(distance > 0) 초기 배치 — 꽃 등장 허용(절반 가중치), 폭탄/포자 제외. */
  spawnCardForOpeningBoardWaiting(): Card {
    return this.generateRandomCard({ openingBoardWaiting: true })
  }

  /**
   * Build one opening-board row.
   *
   * strictSeparation=true (전방 라인): adjacent merges are blocked so no
   * 2-lane or 3-lane wall appears on the front row.
   * strictSeparation=false (후방 라인): only 3-lane walls are blocked;
   * 2-lane merges are allowed so the ■ㅁ■ forced-gap pattern is avoided.
   */
  spawnCardsForOpeningRow(laneCount: number = 3, strictSeparation: boolean = true, isWaiting: boolean = false): Card[] {
    const cards: Card[] = []

    for (let laneIndex = 0; laneIndex < laneCount; laneIndex++) {
      let chosen: Card | null = null

      for (let attempt = 0; attempt < 8; attempt++) {
        const candidate = isWaiting ? this.spawnCardForOpeningBoardWaiting() : this.spawnCardForOpeningBoard()
        let bad: boolean
        if (strictSeparation) {
          // 전방 라인: 이웃 카드와 병합되면 거부
          bad = laneIndex >= 1 && cards[laneIndex - 1].canMergeWith(candidate)
        } else {
          // 후방 라인: 3칸 병합만 거부, 2칸 병합(■■)은 허용
          bad =
            laneIndex >= 2 &&
            cards[laneIndex - 1].canMergeWith(candidate) &&
            cards[laneIndex - 2].canMergeWith(cards[laneIndex - 1])
        }
        if (!bad) {
          chosen = candidate
          break
        }
      }

      const placed = chosen ?? this.generateOpeningFallback(cards[laneIndex - 1] ?? null)
      this.commitSpawnCooldowns(placed)
      cards.push(placed)
    }

    return cards
  }

  /** Spawn a single fresh card for rail-maintenance refills (직접 배치 → 쿨다운 commit). */
  spawnCardForRefill(): Card {
    const card = this.generateRandomCard()
    this.commitSpawnCooldowns(card)
    return card
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
      let chosen: Card | null = null

      // 3칸 병합(예: ■■■)만 막는다. 2칸 병합(■■)은 허용해
      // 가운데 레인이 항상 다른 타입으로 강제되는 ■ㅁ■ 패턴을 방지한다.
      // 포자/별빛은 쿨다운 메커니즘이 별도로 인접 연속을 막으므로 여기서 중복 차단하지 않는다.
      for (let attempt = 0; attempt < 8; attempt++) {
        const candidate = this.generateRandomCard()
        const wouldMake3Lane =
          laneIndex >= 2 &&
          cards[laneIndex - 1].canMergeWith(candidate) &&
          cards[laneIndex - 2].canMergeWith(cards[laneIndex - 1])
        if (!wouldMake3Lane) {
          chosen = candidate
          break
        }
      }

      const placed = chosen ?? this.generateRefillSeparator(cards[laneIndex - 1] ?? null)
      this.commitSpawnCooldowns(placed)
      cards.push(placed)
    }

    return cards
  }

  /** 디버그 콘솔 전용: 지정한 종류의 카드 1장을 즉시 만든다. 가중치/쿨다운을
   *  거치지 않아 설계자가 특정 칸 동작(스폰→하강→처리)을 반복 검증할 수 있다.
   *  이벤트 칸 등 신규 종류는 이 분기에 한 줄을 추가하면 콘솔에서 바로 테스트된다. */
  spawnDebugCard(kind: 'enemy' | 'trap' | 'treasure' | 'seed' | 'event'): Card {
    switch (kind) {
      case 'enemy': return this.generateEnemy()
      case 'trap': return this.generateTrap()
      case 'treasure': return this.generateTreasure()
      case 'seed': return this.generateFlowerSeed()
      case 'event': return this.generateEventDoor()
    }
  }

  /** 이벤트 문 1장 생성. 위협/보상/불빛이 없는 단일 칸이며, 전방 도달 후 2턴 안에
   *  클릭하면 이벤트로 진입한다. 일러스트는 event_000(Sprites.spriteForEvent). */
  generateEventDoor(): Card {
    this.spawnSerial++
    return new Card(
      `event-${this.spawnSerial}-${Math.random()}`,
      CardType.EVENT,
      '이벤트',
      '낯선 문이 열리길 기다린다'
    )
  }

  /** Pick a card type using per-kind buckets, then build the card.
   *  순수 생성: 쿨다운은 읽기만 하고 갱신하지 않는다(갱신은 commitSpawnCooldowns). */
  private generateRandomCard(options: { openingBoard?: boolean; openingBoardWaiting?: boolean } = {}): Card {
    // 최종 등반에서는 별빛 칸을 섞어 10번 수집해야 100턴에 닿게 만든다.
    // 최소 MIN_INTERVAL 칸 쿨다운 후 base 12% + 미등장마다 +5% 누적 확률로 등장.
    if (
      !options.openingBoard &&
      this.finalAscentActive &&
      this.starlightCooldownCards <= 0
    ) {
      const chance = Math.min(0.8,
        CardSpawner.STARLIGHT_BASE_CHANCE +
        this.starlightMissStreak * CardSpawner.STARLIGHT_ACCUM_PER_MISS
      )
      if (Math.random() < chance) {
        this.starlightMissStreak = 0
        return this.generateStarlight()
      }
      this.starlightMissStreak++
    }

    const buckets = EmberSystem.getSpawnBuckets(this.currentTier)
    // 유물 보정(곡괭이 +5 보물 / 불 탄 종이 -5 적 / 자물쇠 -5 보물 / 펜던트 +5 적)을
    // 기본 가중치에 더해 총합으로 roll 하면 전체 비율이 자동 정규화된다.
    const enemyWeight = Math.max(0, buckets.enemy + this.relicSpawnAdjust.enemy + this.jobSpawnAdjust.enemy)
    // 직업 trap 보정은 webTrap에 반영한다(일반 함정 비중을 증감). openingBoard에는 적용하지 않는다.
    const isOpening = options.openingBoard || options.openingBoardWaiting
    const webTrap = options.openingBoard
      ? buckets.webTrap + buckets.bombTrap + buckets.sporeTrap
      : Math.max(0, buckets.webTrap + (isOpening ? 0 : this.jobSpawnAdjust.trap))
    const bombTrap = isOpening ? 0 : buckets.bombTrap
    // Spores on cooldown are treated as weight 0; the slot is silently folded into
    // the rest of the distribution so the total chance of non-spore cards increases.
    const sporeCooling = this.sporeCooldownCards > 0
    // 포자는 20층 이후부터만 등장한다(그 전에는 가중치 0).
    const sporeLocked = this.progressionTurn < 20
    const sporeTrap = isOpening || sporeCooling || sporeLocked ? 0 : buckets.sporeTrap
    // 대기칸 초기 배치에서는 꽃을 절반 가중치로 허용한다(전방칸은 여전히 0).
    const flower = options.openingBoard
      ? 0
      : options.openingBoardWaiting
        ? Math.max(0, buckets.flower + this.jobSpawnAdjust.flower) * 0.5
        : Math.max(0, buckets.flower + this.jobSpawnAdjust.flower)
    // 시련 '가난'은 보물상자 가중치를 25% 깎는다. 유물/직업 보정도 여기서 합산한다.
    // 최소 1을 보장해 유물·시련 조합으로 보물이 완전히 사라지지 않도록 한다.
    const treasure = Math.max(1, buckets.treasure * this.trialTreasureSpawnScale + this.relicSpawnAdjust.treasure + this.jobSpawnAdjust.treasure)
    const total = enemyWeight + webTrap + bombTrap + sporeTrap + treasure + flower
    const roll = Math.random() * total

    if (roll < enemyWeight) return this.generateEnemy()
    if (roll < enemyWeight + webTrap) return this.generateTrap({ trapKind: 'web' })
    if (roll < enemyWeight + webTrap + bombTrap) return this.generateTrap({ trapKind: 'bomb' })
    if (roll < enemyWeight + webTrap + bombTrap + sporeTrap) {
      const spore = this.generateTrap({ trapKind: 'spore' })
      // Flag the spore so applySporeSpread skips the birth-turn tick; turn counting
      // starts from the NEXT turn so the player sees a full 2-turn warning.
      spore.justEnteredRail = true
      return spore
    }
    if (roll < enemyWeight + webTrap + bombTrap + sporeTrap + treasure) {
      return this.generateTreasure()
    }
    return this.generateFlowerSeed()
  }

  /** 실제로 레일에 배치된 카드 1장 기준으로 포자/별빛 연속 방지 쿨다운을 갱신한다.
   *  배치된 카드가 포자/별빛이면 쿨다운을 재설정하고, 아니면 1씩 줄인다. */
  private commitSpawnCooldowns(card: Card): void {
    if (card.type === CardType.TRAP && card.trapKind === 'spore') {
      this.sporeCooldownCards = CardSpawner.SPORE_COOLDOWN_CARDS
    } else if (this.sporeCooldownCards > 0) {
      this.sporeCooldownCards--
    }
    if (card.treasureKind === 'starlight') {
      // 등장 후 MIN_INTERVAL + COOLDOWN_CARDS 칸 동안 재등장 차단
      this.starlightCooldownCards = CardSpawner.STARLIGHT_COOLDOWN_CARDS + CardSpawner.STARLIGHT_MIN_INTERVAL
    } else if (this.starlightCooldownCards > 0) {
      this.starlightCooldownCards--
    }
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
   *  시련 '광란'이 누적될 경우 trialEnemyHp/AtkBonus가 정수 단위로 추가된다. */
  private generateEnemy(): Card {
    const pool = this.getActiveEnemyDefinitions()
    const definition = pool[Math.floor(Math.random() * pool.length)]
    // 불씨 티어 공격력 보너스는 정적으로 굽지 않고 emberAtkBonus로 동적 반영한다.
    // HP는 더 이상 티어로 올리지 않으므로 trial 보너스만 baseHealth에 더한다.
    const bonus = EmberSystem.getEnemyStatBonus(this.currentTier)
    this.spawnSerial++
    const card = new Card(
      `enemy-${this.spawnSerial}-${Math.random()}`,
      CardType.ENEMY,
      definition.name,
      definition.description,
      (definition.healthOrDamage ?? 1) + this.trialEnemyHpBonus + this.relicEnemyHpBonus,
      (definition.attack ?? 1) + this.trialEnemyAtkBonus,
      {
        enemySpriteId: definition.enemySpriteId,
        enemyPower: definition.enemyPower,
      }
    )
    // 레일 진입 직후 동기화 흐름과 동일하게 현재 티어 공격력 보너스를 즉시 적용한다.
    card.emberAtkBonus = bonus.atk
    return card
  }

  /** Spawn the current one-lane trap; wider traps are produced by row grouping.
   *  시련 '역경' 누적 함정 피해 보너스는 trapDamageBonus로 실어, 거미줄/포자/폭탄
   *  모든 함정 피해(고정치 포함)에 일관되게 더해진다. */
  private generateTrap(options: { trapKind?: TrapKind } = {}): Card {
    // Trap kind is usually selected by weighted buckets; the random fallback is
    // kept for targeted debug calls and future systems that request any trap.
    const trapPool = options.trapKind
      ? TRAP_DEFINITIONS.filter((definition) => definition.trapKind === options.trapKind)
      : TRAP_DEFINITIONS
    const definition = trapPool[Math.floor(Math.random() * trapPool.length)]
    this.spawnSerial++
    const trap = new Card(
      `trap-${this.spawnSerial}-${Math.random()}`,
      CardType.TRAP,
      definition.name,
      definition.description,
      0,
      definition.healthOrDamage ?? 2,
      { trapKind: definition.trapKind }
    )
    trap.trapDamageBonus = this.trialTrapDamageBonus
    return trap
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

  /** Pick a non-merging normal-refill fallback when rerolls keep matching neighbors.
   *  쿨다운 commit은 호출부(행 빌더)에서 최종 카드에 1회만 적용하므로 여기선 순수 생성만 한다. */
  private generateRefillSeparator(previous: Card | null): Card {
    if (!previous) return this.generateRandomCard()

    // A chest is the safest visual divider after enemies/traps; after a chest,
    // choose an enemy or web so the row does not become a treasure streak.
    if (previous.type === CardType.ENEMY || previous.type === CardType.TRAP) {
      return this.generateTreasure()
    }
    return Math.random() < 0.5 ? this.generateEnemy() : this.generateTrap({ trapKind: 'web' })
  }

  /** Spawn the current one-lane chest; wider chests are produced by row grouping.
   *  황금 열쇠 유물이 활성화되어 있으면 goldenChestWeight 확률(0~1 직접 확률값)로
   *  황금 상자를 대신 등장시킨다. 현재 황금 열쇠 = 0.02(2%). */
  private generateTreasure(): Card {
    // goldenChestWeight는 직접 확률값(0~1)으로 저장된다. 현재 황금열쇠 = 0.02(2%).
    if (this.goldenChestWeight > 0 && Math.random() < this.goldenChestWeight) {
      return this.generateGoldenChest()
    }
    const definition = TREASURE_DEFINITIONS[Math.floor(Math.random() * TREASURE_DEFINITIONS.length)]
    this.spawnSerial++
    return new Card(
      `treasure-${this.spawnSerial}-${Math.random()}`,
      CardType.TREASURE,
      definition.name,
      definition.description
    )
  }

  /** 황금 상자: 1칸 기준 스폰, 합쳐지면 2/3칸으로 확장된다.
   *  일반 상자보다 드롭 수(3/8/15)와 불빛이 2배이며, 미믹으로 변환되지 않는다. */
  private generateGoldenChest(): Card {
    this.spawnSerial++
    return new Card(
      `golden-treasure-${this.spawnSerial}-${Math.random()}`,
      CardType.TREASURE,
      '황금 상자',
      '3 item reward golden chest',
      0,
      0,
      { treasureKind: 'goldenChest' }
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

  /** 미믹·식인꽃처럼 고정/꽃값 기반 특수 적은 고층에서 일반 적보다 약해진다.
   *  20층 단위로 초기 스탯에 배수(×1, ×2, ×3 …)를 곱해 일반 적 곡선에 맞춘다.
   *  예) 미믹 4/2 → 8/4 → 12/6, 2칸 꽃 2/2 → 4/4 → 6/6. 시련 보너스는 곱한 뒤 더한다. */
  private scaleSpecialEnemyStats(baseHp: number, baseAtk: number): { hp: number; atk: number } {
    const tier = this.getSpecialEnemyTier()
    return {
      hp: baseHp * tier + this.trialEnemyHpBonus,
      atk: baseAtk * tier + this.trialEnemyAtkBonus,
    }
  }

  /** 특수 적 강도 단계 — 20층마다 1씩 오른다(1-19층 1, 20-39층 2 ...). */
  private getSpecialEnemyTier(): number {
    return Math.floor(this.progressionTurn / 20) + 1
  }

  /** 특수 적 강함수치(enemyPower) — 단계마다 3씩 상승(3/6/9/12 ...)시켜 불빛 성장 곡선을
   *  일반 적과 같은 랭킹식(27 + 6×enemyPower)으로 자연스럽게 잇는다. */
  private getSpecialEnemyPower(): number {
    return this.getSpecialEnemyTier() * 3
  }

  /** Monster flower inherits threat from the flower value that was gambled. */
  spawnMonsterFlower(power: number = 1): Card {
    const safePower = Math.max(1, power)
    const scaled = this.scaleSpecialEnemyStats(safePower, safePower)
    this.spawnSerial++
    return new Card(
      `monster-flower-${this.spawnSerial}-${Math.random()}`,
      CardType.ENEMY,
      '괴물꽃',
      `Withered from a value-${safePower} flower`,
      scaled.hp,
      scaled.atk,
      {
        isSpecialEnemy: true,
        specialEnemyKind: 'monsterFlower',
        defeatDropCount: Math.max(1, Math.min(3, Math.ceil(safePower / 2))),
        enemyPower: this.getSpecialEnemyPower(),
      }
    )
  }

  /** Read the active spawn weights so the UI can show the tier visually. */
  getActiveWeights(): SpawnWeights {
    return EmberSystem.getSpawnWeights(this.currentTier)
  }

  /** 유물·시련·티어 보정이 모두 반영된 실제 스폰 가중치 (현재 불씨 티어 기준).
   *  HUD 확률 패널과 getEffectiveSpawnPercents의 데이터 소스로 사용한다.
   *  포자 쿨다운은 순간 상태라 제외하고 항상 고정 베이스 값을 사용한다. */
  getEffectiveWeights(): { enemy: number; trap: number; treasure: number; flower: number; total: number } {
    const buckets = EmberSystem.getSpawnBuckets(this.currentTier)
    const enemy = Math.max(0, buckets.enemy + this.relicSpawnAdjust.enemy + this.jobSpawnAdjust.enemy)
    // 살균제 유물: sporeTrap 가중치만 독립 감소. webTrap·bombTrap은 영향 없음.
    const sporeTrap = Math.max(0, buckets.sporeTrap + this.relicSpawnAdjust.spore)
    const trap = Math.max(0, buckets.webTrap + this.jobSpawnAdjust.trap) + buckets.bombTrap + sporeTrap
    const treasure = Math.max(1, buckets.treasure * this.trialTreasureSpawnScale + this.relicSpawnAdjust.treasure + this.jobSpawnAdjust.treasure)
    // 밀랍 조화 유물: flower 가중치 독립 증가.
    const flower = Math.max(0, buckets.flower + this.jobSpawnAdjust.flower + this.relicSpawnAdjust.flower)
    const total = enemy + trap + treasure + flower
    return { enemy, trap, treasure, flower, total }
  }

  /**
   * 유물 효과 텍스트({{spawn}} 토큰)의 % 치환에 사용하는 고정 기준 가중치.
   *
   * 불씨 티어는 제외하고 항상 bright 버킷을 베이스로 삼는다.
   * 직업·유물·시련처럼 런 내에서 한 번 결정되면 고정되는 수치만 반영한다.
   * 덕분에 불씨가 오르내려도 유물 설명의 확률 표기가 흔들리지 않는다.
   *
   * 예) 귀족 직업(보물+20) 선택 후 곡괭이(+5) 미리보기:
   *   current = 22+20=42, newVal = 47, pctChange ≈ +3%
   *   불씨가 dim으로 내려가도 이 값은 변하지 않는다.
   */
  getEffectiveWeightsForDisplay(): { enemy: number; trap: number; treasure: number; flower: number; total: number } {
    const buckets = EmberSystem.getSpawnBuckets('bright')
    const enemy = Math.max(0, buckets.enemy + this.relicSpawnAdjust.enemy + this.jobSpawnAdjust.enemy)
    const sporeTrapDisplay = Math.max(0, buckets.sporeTrap + this.relicSpawnAdjust.spore)
    const trap = Math.max(0, buckets.webTrap + this.jobSpawnAdjust.trap) + buckets.bombTrap + sporeTrapDisplay
    const treasure = Math.max(1, buckets.treasure * this.trialTreasureSpawnScale + this.relicSpawnAdjust.treasure + this.jobSpawnAdjust.treasure)
    const flower = Math.max(0, buckets.flower + this.jobSpawnAdjust.flower + this.relicSpawnAdjust.flower)
    const total = enemy + trap + treasure + flower
    return { enemy, trap, treasure, flower, total }
  }

  /** 실제 스폰 확률을 0-100 정수 백분율로 반환. 최대잉여(Largest-Remainder) 반올림으로 합계 100 보장. */
  getEffectiveSpawnPercents(): { enemy: number; trap: number; treasure: number; flower: number } {
    const w = this.getEffectiveWeights()
    if (w.total <= 0) return { enemy: 25, trap: 25, treasure: 25, flower: 25 }
    const cats: { key: keyof typeof w; raw: number; floor: number; rem: number }[] = [
      'enemy', 'trap', 'treasure', 'flower',
    ].map(k => {
      const raw = (w[k as keyof typeof w] as number) / w.total * 100
      const floor = Math.floor(raw)
      return { key: k as keyof typeof w, raw, floor, rem: raw - floor }
    })
    let leftover = 100 - cats.reduce((s, c) => s + c.floor, 0)
    cats.sort((a, b) => b.rem - a.rem)
    for (const c of cats) { if (leftover-- > 0) c.floor++ }
    const result = {} as { enemy: number; trap: number; treasure: number; flower: number }
    for (const c of cats) result[c.key as keyof typeof result] = c.floor
    return result
  }

  /** 가중치 delta를 적용할 때 해당 카테고리의 확률이 실제로 몇 % 달라지는지 반환(양수/음수).
   *  상점/시련 카드 효과 텍스트에서 하드코딩 % 대신 현 시점 기준 값을 표시하는 데 쓴다. */
  weightDeltaToPct(type: 'enemy' | 'treasure', delta: number): number {
    const w = this.getEffectiveWeights()
    if (w.total <= 0) return 0
    const before = (type === 'enemy' ? w.enemy : w.treasure) / w.total * 100
    const newVal = Math.max(0, (type === 'enemy' ? w.enemy : w.treasure) + delta)
    const newTotal = Math.max(1, w.total + delta)
    const after = newVal / newTotal * 100
    return Math.round(after - before)
  }

  /** 시련 보물 상자 scale factor(예: 0.75)를 적용할 때 보물 확률이 실제로 몇 % 달라지는지 반환.
   *  가난은 누적 곱으로 적용되므로 현재 trialTreasureSpawnScale에 factor를 곱해야
   *  연속 선택 시에도 올바른 예측 감소량이 나온다. */
  trialScaleToPct(factor: number): number {
    const buckets = EmberSystem.getSpawnBuckets(this.currentTier)
    const w = this.getEffectiveWeights()
    if (w.total <= 0) return 0
    const before = w.treasure / w.total * 100
    // 유물 보정은 덧셈(scale 미적용)이므로 scale 부분만 factor 곱 후 다시 합산.
    const newTreasure = Math.max(
      0,
      buckets.treasure * this.trialTreasureSpawnScale * factor + this.relicSpawnAdjust.treasure
    )
    const newTotal = Math.max(1, w.total - w.treasure + newTreasure)
    const after = newTreasure / newTotal * 100
    return Math.round(after - before)
  }

  /**
   * Mimic: treasure event enemy whose stats and rewards mirror the chest width.
   * The 3-lane case is implemented even though normal play almost never creates it.
   */
  spawnMimic(span: number = 1): Card {
    const safeSpan = Math.max(1, Math.min(3, span))
    const stats = MIMIC_BY_SPAN[safeSpan]
    const scaled = this.scaleSpecialEnemyStats(stats.health, stats.attack)
    this.spawnSerial++
    const mimic = new Card(
      `mimic-${this.spawnSerial}-${Math.random()}`,
      CardType.ENEMY,
      '미믹',
      `Was a ${safeSpan}-lane treasure once`,
      scaled.hp,
      scaled.atk,
      {
        isSpecialEnemy: true,
        specialEnemyKind: 'mimic',
        defeatDropCount: stats.drops,
        enemyPower: this.getSpecialEnemyPower(),
      }
    )

    // Special mimics do not merge, so their width is assigned directly from the source chest.
    mimic.groupCount = safeSpan
    return mimic
  }
}
