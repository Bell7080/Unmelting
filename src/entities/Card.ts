/**
 * Card Entity - MVP card model for enemies, traps, treasures, and flowers.
 */

export enum CardType {
  ENEMY = 'enemy',
  TRAP = 'trap',
  TREASURE = 'treasure',
  FLOWER = 'flower',
  /** 보스는 적과 같은 양식(HP/ATK/공격/격파)을 따라가지만, 별도 트리거·메커니즘이
   *  많이 동반될 5번째 카드 종류. 추후 다른 보스도 같은 type으로 확장된다. */
  BOSS = 'boss',
  /** 이벤트 문: 위협·보상이 없는 단일 칸. 전방 도달 시 2턴 카운트다운 후 닫혀 사라지고,
   *  닫히기 전 클릭하면 이벤트(대사/선택지/미니게임)로 진입한다. 불빛은 주지 않는다. */
  EVENT = 'event',
}

export type TrapKind = 'web' | 'bomb' | 'spore'
export type FlowerKind = 'seed' | 'chamomile' | 'redRose' | 'marigold' | 'oleander' | 'lavender'
export type SpecialEnemyKind = 'mimic' | 'monsterFlower' | 'waxArmy' | 'waxKnight' | 'waxSculptor' | 'waxWitch'
export type TreasureKind = 'chest' | 'goldenChest' | 'starlight'

export type EnemySpriteId =
  | 'enemyBee'
  | 'enemyMantis'
  | 'enemyBat'
  | 'enemyHedgehog'
  | 'enemyLizard'
  | 'enemyRaccoon'
  | 'enemyBeetle'
  | 'enemyScorpion'
  | 'enemyMarten'
  | 'enemyBadger'
  | 'enemySloth'
  | 'enemyJackal'
  | 'enemyMouse'
  | 'enemyFrog'
  | 'enemyMoth'
  | 'enemyChitin'
  | 'enemyBird'
  | 'enemyMole'

export interface CardOptions {
  /** Special enemies stay as standalone threats and never merge with other cards. */
  isSpecialEnemy?: boolean
  /** Number of items awarded when this enemy is defeated. */
  defeatDropCount?: number
  /** Enemy illustration id used to keep merged groups on the strongest art. */
  enemySpriteId?: EnemySpriteId
  /** Relative enemy strength; higher values supply merged group name/art. */
  enemyPower?: number
  /** Trap subtype with distinct art and behavior. */
  trapKind?: TrapKind
  /** Flower subtype; seeds bloom when they reach the active row. */
  flowerKind?: FlowerKind
  /** Special-enemy family controls limited same-family merging. */
  specialEnemyKind?: SpecialEnemyKind
  /** Treasure subtype lets final-ascent starlight opt out of chest rules. */
  treasureKind?: TreasureKind
}

interface EnemyGroupStats {
  /** Display name for the merged enemy card. */
  name: string
  /** Exact max HP for this group width. */
  health: number
  /** Exact attack damage for this group width. */
  damage: number
}

/** Extra stats added to a same-row enemy formation after member stats are summed. */
function enemyGroupBonus(groupCount: number): { hp: number; damage: number } {
  if (groupCount >= 3) return { hp: 3, damage: 3 }
  if (groupCount === 2) return { hp: 2, damage: 2 }
  return { hp: 0, damage: 0 }
}

/** Flower names are kept with the model so spawner, bloom, and docs stay aligned. */
export function flowerDisplayName(kind: FlowerKind): string {
  switch (kind) {
    case 'seed':
      return '씨앗'
    case 'chamomile':
      return '캐모마일'
    case 'redRose':
      return '레드로즈'
    case 'marigold':
      return '메리골드'
    case 'oleander':
      return '올레안더'
    case 'lavender':
      return '라벤더'
  }
}

/** Short rail/compendium copy for each flower buff. */
export function flowerDescription(kind: FlowerKind): string {
  switch (kind) {
    case 'seed':
      return 'Blooms into a random buff flower on the front row'
    case 'chamomile':
      return 'Gain score; higher flower value pays more'
    case 'redRose':
      return 'Heal for flower value'
    case 'marigold':
      return 'Gain coins; grows every two turns'
    case 'oleander':
      return 'Gain shield for flower value'
    case 'lavender':
      return 'Gain hand combo gauge for flower value'
  }
}

export class Card {
  /** 폭탄 기본 폭발 피해. 시련 '역경' 보너스(trapDamageBonus)가 여기에 더해진다. */
  static readonly BOMB_DAMAGE = 5
  id: string
  type: CardType
  name: string
  description: string
  baseHealth: number
  baseDamage: number
  groupCount: number // How many lane cells this card currently occupies.
  health: number // Current effective enemy HP after any group/special rules are applied.
  isSpecialEnemy: boolean // Special enemies, such as mimics, never merge into wider normal groups.
  defeatDropCount: number // Number of item drops awarded when this enemy is defeated.
  /** Wax status: turns remaining while this field card is '굳음' and cannot act. */
  frozenTurns: number
  /** Enemy group internals keep merged stats proportional to the actual members. */
  enemyHealthTotal: number
  enemyDamageTotal: number
  enemySpriteId: EnemySpriteId | null
  enemyPower: number
  /** Trap subtype and behavior state for web/bomb/spore rules. */
  trapKind: TrapKind
  /** 시련 '역경' 누적 함정 피해 보너스. 거미줄/포자/폭탄 모든 함정 피해에 더해진다. */
  trapDamageBonus: number = 0
  isBombArmed: boolean
  sporeTurnsUntilSpread: number
  // True for exactly one applySporeSpread cycle after a spawned spore first enters
  // the 3×3 rail. The snapshot skips these cards so the turn count starts from the
  // NEXT turn, giving the player the full 2-turn warning from first appearance.
  justEnteredRail: boolean
  /** Special-enemy family; monster flowers merge only with each other. */
  specialEnemyKind: SpecialEnemyKind | null
  /** waxKnight 전용 UI 수치: 보스 컨트롤러가 방패 상태를 렌더러에 전달한다. */
  bossShield: number
  /** 불씨 티어에 따라 동적으로 가감되는 공격력 보너스(일반 적 전용).
   *  필드 진입/티어 변동 시 현재 티어 값으로 동기화되며, 불씨가 회복되면 다시 줄어든다.
   *  HP는 절대 건드리지 않아 1체력 적이 회복으로 즉사하는 문제를 피한다. */
  emberAtkBonus: number
  /** Treasure subtype separates normal chests from final-ascent starlight keys. */
  treasureKind: TreasureKind
  /** Flower growth state: seed in waiting row, then a random bloom on front row. */
  flowerKind: FlowerKind
  flowerTurnsAlive: number
  flowerValue: number
  /** 이벤트 문 닫힘 카운트다운. 미리보기 행에서는 -1(미시작)이고, 전방(활성 행)에
   *  도달하면 2로 시작해 매 턴 줄어든다. 0에 닿으면 문이 닫히며 보물처럼 사라진다. */
  eventTurnsUntilClose: number

  constructor(
    id: string,
    type: CardType,
    name: string,
    description: string,
    baseHealth: number = 0,
    baseDamage: number = 0,
    options: CardOptions = {}
  ) {
    this.id = id
    this.type = type
    this.name = name
    this.description = description
    this.baseHealth = baseHealth
    this.baseDamage = baseDamage
    this.groupCount = 1
    // 보스는 적과 같은 HP/ATK 모델을 그대로 따라가야 한다(피격·격파 흐름 통일).
    const enemyLike = type === CardType.ENEMY || type === CardType.BOSS
    this.health = enemyLike ? baseHealth : 0
    this.isSpecialEnemy = options.isSpecialEnemy ?? false
    this.defeatDropCount = options.defeatDropCount ?? 1
    this.frozenTurns = 0
    this.enemyHealthTotal = enemyLike ? baseHealth : 0
    this.enemyDamageTotal = enemyLike ? baseDamage : 0
    this.enemySpriteId = options.enemySpriteId ?? null
    this.enemyPower = options.enemyPower ?? 0
    this.trapKind = options.trapKind ?? 'web'
    this.isBombArmed = false
    this.sporeTurnsUntilSpread = this.trapKind === 'spore' ? 2 : 0
    this.justEnteredRail = false
    this.specialEnemyKind = options.specialEnemyKind ?? null
    this.treasureKind = options.treasureKind ?? 'chest'
    this.bossShield = 0
    this.emberAtkBonus = 0
    this.flowerKind = options.flowerKind ?? 'seed'
    this.flowerTurnsAlive = 0
    this.flowerValue = this.type === CardType.FLOWER && this.flowerKind !== 'seed' ? 1 : 0
    // 문은 전방 도달 전까지 카운트다운을 시작하지 않는다(-1 = 미시작).
    this.eventTurnsUntilClose = -1
  }

  /** Return proportional stats for a merged enemy group based on real members. */
  private getNormalEnemyGroupStats(groupCount: number): EnemyGroupStats | null {
    if (groupCount <= 1) return null
    const bonus = enemyGroupBonus(groupCount)
    return {
      name: groupCount >= 3 ? '양초 군단' : '양초 무리',
      health: this.enemyHealthTotal + bonus.hp,
      damage: this.enemyDamageTotal + bonus.damage,
    }
  }

  /** Boss는 적과 같은 enemy-like 모델을 따른다(HP·ATK·격파 흐름 통일). */
  private isEnemyLike(): boolean {
    return this.type === CardType.ENEMY || this.type === CardType.BOSS
  }

  /** Read the max HP that corresponds to this card's current grouping state. */
  private getCurrentMaxHealth(): number {
    if (!this.isEnemyLike()) return 0
    // 보스/특수 적은 그룹 HP 보너스를 적용하지 않는다. 보스는 groupCount가 3이어도
    // 일반 3그룹 보정(+HP)이 붙으면 회복이 정의된 최대 체력을 넘어선다(예: 80→82).
    const skipGroupStats = this.isSpecialEnemy || this.type === CardType.BOSS
    const groupedStats = skipGroupStats ? null : this.getNormalEnemyGroupStats(this.groupCount)
    return groupedStats?.health ?? this.baseHealth
  }

  /** Read the current enemy/boss HP. */
  getHealth(): number {
    if (!this.isEnemyLike()) return 0
    return this.health
  }

  /** Read the exact attack value for enemies/boss, including fixed grouped enemies.
   *  일반 적은 불씨 티어 보너스(emberAtkBonus)를 동적으로 더해, 불씨가 줄면 즉시 강해지고
   *  회복되면 즉시 약해진다(HP는 불변). 보스/특수 적은 보너스를 받지 않는다. */
  getDamage(): number {
    if (!this.isEnemyLike()) return 0
    if (this.isSpecialEnemy || this.type === CardType.BOSS) return this.baseDamage
    const groupedStats = this.getNormalEnemyGroupStats(this.groupCount)
    const base = groupedStats?.damage ?? this.baseDamage
    return base + Math.max(0, this.emberAtkBonus)
  }

  /** Apply damage directly to the current HP pool and return remaining HP. */
  takeDamage(amount: number): number {
    if (!this.isEnemyLike()) return 0
    const actualDamage = Math.max(0, amount)
    this.health = Math.max(0, this.health - actualDamage)
    return this.health
  }

  /** Restore enemy-like HP without exceeding the card's current maximum HP. */
  healEnemyLike(amount: number): number {
    if (!this.isEnemyLike()) return 0
    const before = this.health
    this.health = Math.min(this.getCurrentMaxHealth(), this.health + Math.max(0, amount))
    return this.health - before
  }

  /** Apply the wax '굳음' status, keeping the longest remaining duration. */
  freeze(turns: number): void {
    this.frozenTurns = Math.max(this.frozenTurns, Math.max(0, turns))
  }

  /** Tick one turn of wax '굳음'. Returns true when the status remains active. */
  tickFrozen(): boolean {
    if (this.frozenTurns <= 0) return false
    this.frozenTurns = Math.max(0, this.frozenTurns - 1)
    return this.frozenTurns > 0
  }

  /** Whether this card is currently stopped by wax. */
  isFrozen(): boolean {
    return this.frozenTurns > 0
  }

  /** Clear wax '굳음' immediately (used by boss debuff-immunity resist flow). */
  clearFrozen(): void {
    this.frozenTurns = 0
  }

  /** Convert a waiting seed into one of the five usable flower buffs. */
  bloom(kind: Exclude<FlowerKind, 'seed'>): void {
    if (this.type !== CardType.FLOWER) return
    this.flowerKind = kind
    this.flowerTurnsAlive = 0
    this.flowerValue = 1
    this.name = flowerDisplayName(kind)
    this.description = flowerDescription(kind)
  }

  /** Grow a flower on its own cadence; returns true when its reward improved. */
  growFlowerOneTurn(): boolean {
    if (this.type !== CardType.FLOWER || this.flowerKind === 'seed') return false
    this.flowerTurnsAlive += 1
    const shouldGrow = this.flowerKind === 'marigold' ? this.flowerTurnsAlive % 2 === 0 : true
    if (shouldGrow) this.flowerValue += 1
    return shouldGrow
  }

  /** 물뿌리개 전용: flowerValue만 amount만큼 올리고 flowerTurnsAlive는 건드리지 않는다.
   *  시들 확률이 증가하지 않으므로 "이거로는 절대 시들지 않음" 규칙을 만족한다. */
  growFlowerValueOnly(amount: number): boolean {
    if (this.type !== CardType.FLOWER || this.flowerKind === 'seed') return false
    this.flowerValue += Math.max(1, amount)
    return true
  }

  /** Wilting starts at 10% and accelerates sharply as flower value rises. */
  getFlowerWiltChance(): number {
    if (this.type !== CardType.FLOWER || this.flowerKind === 'seed') return 0
    const maturity = Math.max(0, this.flowerValue - 1)
    return Math.min(0.85, 0.1 + maturity * maturity * 0.08)
  }

  /** Return trap damage for the current trap width and subtype. */
  getTrapDamagePenalty(): number {
    if (this.type !== CardType.TRAP) return 0
    // 폭탄은 밟음 피해가 없다(폭발은 effectiveTrapDamage/TurnManager가 따로 처리).
    if (this.trapKind === 'bomb') return 0
    // 시련 '역경'의 함정 피해 보너스는 거미줄/포자 모든 변형에 더한다(즉사 999 칸은 제외).
    const bonus = this.trapDamageBonus
    if (this.trapKind === 'spore') {
      if (this.groupCount >= 3) return 5 + bonus
      if (this.groupCount === 2) return 3 + bonus
      return 1 + bonus
    }
    if (this.groupCount >= 3) return 999
    if (this.groupCount === 2) return 5 + bonus
    return this.baseDamage + bonus
  }

  /** 함정이 실제로 가하는/표기할 피해를 하나의 수치로 돌려준다(보너스 합산 포함).
   *  거미줄·포자 등은 밟음 피해와 동일하고, 폭탄은 폭발 피해(5+보너스)를 따른다.
   *  필드 표기와 폭탄 폭발(TurnManager)이 같은 값을 쓰도록 함정을 한 종류로 묶는다. */
  effectiveTrapDamage(): number {
    if (this.type !== CardType.TRAP) return 0
    if (this.trapKind === 'bomb') return Card.BOMB_DAMAGE + this.trapDamageBonus
    return this.getTrapDamagePenalty()
  }

  /**
   * Decide whether two cards can share a single multi-lane group. Mimics and
   * other special enemies are intentionally kept separate so a treasure-turned
   * threat cannot be absorbed into an ordinary enemy cell.
   */
  canMergeWith(other: Card): boolean {
    if (this.type !== other.type) return false
    if (this.type === CardType.TREASURE) {
      // 별빛은 90~100층 전용 열쇠 칸이므로 합쳐져 보상량이 바뀌면 안 된다.
      if (this.treasureKind === 'starlight' || other.treasureKind === 'starlight') return false
      // 황금 상자는 황금 상자끼리만 합쳐진다.
      return this.treasureKind === other.treasureKind
    }
    // Blooming flowers and seeds are deliberate single-cell opportunities.
    if (this.type === CardType.FLOWER) return false
    // 이벤트 문은 항상 단일 칸으로 등장한다(병합 금지).
    if (this.type === CardType.EVENT) return false
    // Special enemies: mimic↔mimic and monsterFlower↔monsterFlower each form
    // their own same-family group; all other special enemies stay solo.
    if (this.isSpecialEnemy || other.isSpecialEnemy) {
      if (this.type !== CardType.ENEMY || other.type !== CardType.ENEMY) return false
      return (
        this.specialEnemyKind === other.specialEnemyKind &&
        (this.specialEnemyKind === 'monsterFlower' || this.specialEnemyKind === 'mimic')
      )
    }
    if (this.type === CardType.TRAP) {
      // Bomb timing should never be reset by lane grouping, and unlike trap
      // subtypes should not merge into one ambiguous hazard.
      if (this.trapKind === 'bomb' || other.trapKind === 'bomb') return false
      return this.trapKind === other.trapKind
    }
    return true
  }

  /** Update a merged card's name/stat shell to the fixed requested 2/3-lane card. */
  private applyNormalGroupPresentation(existingDamage: number): void {
    if (this.type === CardType.ENEMY) {
      const groupedStats = this.getNormalEnemyGroupStats(this.groupCount)
      if (!groupedStats) return
      this.name = groupedStats.name
      this.description = 'Merged enemy formation'
      this.baseHealth = groupedStats.health
      this.baseDamage = groupedStats.damage
      this.health = Math.max(0, groupedStats.health - existingDamage)
      return
    }

    if (this.type === CardType.TRAP) {
      if (this.trapKind === 'bomb') return
      if (this.trapKind === 'spore') {
        this.name = this.groupCount === 2 ? '번식 포자군' : '포자 군락'
        this.description =
          this.groupCount === 2
            ? 'Deals 3 damage and spreads twice'
            : 'Deals 5 damage and spreads three times'
      } else {
        this.name = this.groupCount === 2 ? '촛농 거미집' : '밀랍 거미굴'
        this.description = this.groupCount === 2 ? 'Deals 5 damage' : 'Deals lethal damage'
      }
      return
    }

    if (this.type === CardType.TREASURE) {
      if (this.treasureKind === 'goldenChest') {
        this.name = this.groupCount === 2 ? '적당한 황금 상자' : '대형 황금 상자'
        const drops = this.groupCount === 2 ? 8 : 15
        this.description = `${drops} item reward golden chest`
      } else {
        this.name = this.groupCount === 2 ? '적당한 상자' : '큰 상자'
        const chestDrops = this.groupCount === 2 ? 3 : 5
        // Keep grouped chest text aligned with the 1/3/5 reward table.
        this.description = `${chestDrops} item reward chest`
      }
    }
  }

  /**
   * Merge another card into this one. Same type required.
   * Normal enemies transform into the exact requested 2-lane/3-lane enemies,
   * while damage already dealt before a later merge is still preserved.
   */
  merge(other: Card): void {
    if (!this.canMergeWith(other)) return

    if (this.type === CardType.ENEMY && this.specialEnemyKind === 'mimic') {
      // Merged mimics sum their stats and gain the same width bonus as normal enemies.
      const newGroupCount = this.groupCount + other.groupCount
      const bonus = enemyGroupBonus(newGroupCount)
      this.groupCount = newGroupCount
      this.baseHealth += other.baseHealth + bonus.hp
      this.baseDamage += other.baseDamage + bonus.damage
      this.health += other.health
      this.enemyHealthTotal = this.baseHealth
      this.enemyDamageTotal = this.baseDamage
      this.defeatDropCount += other.defeatDropCount
      this.name = this.groupCount >= 3 ? '미믹 군단' : '미믹 무리'
      this.description = 'Merged mimic formation'
      return
    }

    if (this.type === CardType.ENEMY && this.specialEnemyKind === 'monsterFlower') {
      // Corrupted flowers add their stats with the same width bonus as normal enemies.
      const newGroupCount = this.groupCount + other.groupCount
      const bonus = enemyGroupBonus(newGroupCount)
      this.groupCount = newGroupCount
      this.baseHealth += other.baseHealth + bonus.hp
      this.baseDamage += other.baseDamage + bonus.damage
      this.health += other.health
      this.enemyHealthTotal = this.baseHealth
      this.enemyDamageTotal = this.baseDamage
      this.name = this.groupCount >= 3 ? '괴물꽃 군락' : '괴물꽃 무리'
      this.description = 'Withered flower monster pack'
      return
    }

    if (this.type === CardType.ENEMY) {
      const existingDamage = Math.max(0, this.getCurrentMaxHealth() - this.health)
      const otherDamage = Math.max(0, other.getCurrentMaxHealth() - other.health)
      this.enemyHealthTotal += other.enemyHealthTotal
      this.enemyDamageTotal += other.enemyDamageTotal
      if (other.enemyPower > this.enemyPower) {
        this.enemyPower = other.enemyPower
        this.enemySpriteId = other.enemySpriteId
        this.name = other.name
      }
      this.groupCount += other.groupCount
      this.applyNormalGroupPresentation(existingDamage + otherDamage)
      return
    }

    if (this.type === CardType.TRAP && this.trapKind === 'spore') {
      // The merged spore colony keeps the shorter countdown so a nearly-ready
      // spore does not get delayed by joining a fresh colony.
      this.sporeTurnsUntilSpread = Math.min(this.sporeTurnsUntilSpread, other.sporeTurnsUntilSpread)
    }
    this.groupCount += other.groupCount
    this.applyNormalGroupPresentation(0)
  }
}
