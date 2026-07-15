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

// 'bush'(덤불)는 온보딩 축약형 함정 — 닿으면 소량 피해만 주는 소프트 함정.
export type TrapKind = 'web' | 'bomb' | 'spore' | 'bush'
export type FlowerKind = 'seed' | 'chamomile' | 'redRose' | 'marigold' | 'oleander' | 'lavender'
export type SpecialEnemyKind = 'mimic' | 'monsterFlower' | 'waxArmy' | 'waxKnight' | 'waxSculptor' | 'waxWitch' | 'waxDemon' | 'waxCat'
// 'junk'(잡동사니)는 온보딩 축약형 보물 — 까면 손패 1장을 주는 무해한 필러.
export type TreasureKind = 'chest' | 'goldenChest' | 'starlight' | 'junk'

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
  // '바위' — 온보딩 축약형 적. 반격 없이 플레이어가 때려서 부수는 최약체.
  | 'enemyRock'

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
  /** 폭탄 기본 폭발 피해. 런 단위 함정 피해 보너스(시련 '역경'·유물)는
   *  character.trapDamageBonus로 일원화되어 피해 적용/표기 호출부에서 더해진다. */
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
  isBombArmed: boolean
  sporeTurnsUntilSpread: number
  /** 온보딩 필드 카드(바위/덤불/잡동사니) 만료 카운트다운. 0이면 제거. 비필드는 0. */
  fieldExpiryTurns: number
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
    this.specialEnemyKind = options.specialEnemyKind ?? null
    this.treasureKind = options.treasureKind ?? 'chest'
    // 온보딩 필드 카드는 종류별 만료 카운트다운을 갖는다(바위3/잡동2/덤불1, 합체 시 리셋).
    this.fieldExpiryTurns = this.onboardingFieldMaxExpiry()
    this.bossShield = 0
    this.emberAtkBonus = 0
    this.flowerKind = options.flowerKind ?? 'seed'
    this.flowerTurnsAlive = 0
    this.flowerValue = this.type === CardType.FLOWER && this.flowerKind !== 'seed' ? 1 : 0
    // 문은 전방 도달 전까지 카운트다운을 시작하지 않는다(-1 = 미시작).
    this.eventTurnsUntilClose = -1
  }

  /** 온보딩 축약형 필드 카드(바위/덤불/잡동사니)인지 — 만료·합체 리셋 대상. */
  isOnboardingField(): boolean {
    return this.enemySpriteId === 'enemyRock' || this.trapKind === 'bush' || this.treasureKind === 'junk'
  }

  /** 온보딩 필드 카드의 최대 만료 턴수 — 첫 접하는 유저 혼란 방지를 위해 종류 무관 균일 2턴. 비필드는 0. */
  onboardingFieldMaxExpiry(): number {
    if (this.isOnboardingField()) return 2
    return 0
  }

  /** 필드 카드 만료를 1턴 진행. 반환: 만료(0 도달)면 true → 호출부가 칸을 제거한다. */
  tickFieldExpiry(): boolean {
    if (!this.isOnboardingField()) return false
    this.fieldExpiryTurns = Math.max(0, this.fieldExpiryTurns - 1)
    return this.fieldExpiryTurns <= 0
  }

  /** 합체 시 만료를 종류별 최대 턴수로 리셋한다(합체 턴은 미카운트). */
  resetFieldExpiry(): void {
    if (this.isOnboardingField()) this.fieldExpiryTurns = this.onboardingFieldMaxExpiry()
  }

  /** Return proportional stats for a merged enemy group based on real members. */
  private getNormalEnemyGroupStats(groupCount: number): EnemyGroupStats | null {
    if (groupCount <= 1) return null
    // 온보딩 바위는 선형 합체: 칸수만큼 합산만 하고 일반 합체 보너스(+2/+3)는 미적용(HP=칸수),
    // 이름도 '바위'로 유지한다. 반격 0이라 damage 합계도 0으로 남는다.
    const isRock = this.enemySpriteId === 'enemyRock'
    const bonus = isRock ? { hp: 0, damage: 0 } : enemyGroupBonus(groupCount)
    return {
      name: isRock ? '바위' : groupCount >= 3 ? '양초 군단' : '양초 무리',
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

  /** 적 스탯 시련('광란' 등)을 이미 필드에 있는 일반 적에게 소급 적용한다.
   *  스폰 시 baseDamage/baseHealth에 구워지는 보너스(generateEnemy)와 동일하게 맞추되,
   *  합체 적은 구성 칸 수(groupCount)만큼 누적해 "이후 스폰됐다면 받았을 양"과 일치시킨다.
   *  구성 합계(enemyXxxTotal)에 더한 뒤 표시 스탯을 재유도하며, 이미 입은 피해는 보존한다.
   *  보스/특수 적(미믹 등)은 함정 시련처럼 보너스를 받지 않는다. */
  applyTrialEnemyStatBonus(atkBonus: number, hpBonus: number): void {
    if (this.type !== CardType.ENEMY || this.isSpecialEnemy) return
    const factor = Math.max(1, this.groupCount)
    const atk = Math.max(0, atkBonus) * factor
    const hp = Math.max(0, hpBonus) * factor
    if (atk === 0 && hp === 0) return
    const existingDamage = Math.max(0, this.getCurrentMaxHealth() - this.health)
    this.enemyDamageTotal += atk
    this.enemyHealthTotal += hp
    const grouped = this.getNormalEnemyGroupStats(this.groupCount)
    const newMaxHealth = grouped ? grouped.health : this.enemyHealthTotal
    this.baseDamage = grouped ? grouped.damage : this.enemyDamageTotal
    this.baseHealth = newMaxHealth
    this.health = Math.max(1, newMaxHealth - existingDamage)
  }

  /** Apply the wax '굳음' status. 여러 번 쓰면 남은 턴에 누적된다(상한 9턴). */
  freeze(turns: number): void {
    this.frozenTurns = Math.min(9, Math.max(0, this.frozenTurns) + Math.max(0, turns))
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

  /** Return BASE trap damage for the current trap width and subtype.
   *  런 단위 함정 피해 보너스(시련 '역경'·유물)는 여기 더하지 않는다 — 모든 함정이
   *  동일하게 받도록 character.trapDamageBonus로 일원화해 피해를 적용/표기하는
   *  호출부(ActionSystem.evadeTrap, 폭탄 처리, 카드 라벨)에서 한 번만 더한다.
   *  이렇게 하면 카드별 보너스 주입이 필요 없어 추후 추가되는 함정도 자동 적용된다. */
  getTrapDamagePenalty(): number {
    if (this.type !== CardType.TRAP) return 0
    // 폭탄은 밟음 피해가 없다(폭발은 effectiveTrapDamage/TurnManager가 따로 처리).
    if (this.trapKind === 'bomb') return 0
    if (this.trapKind === 'spore') {
      if (this.groupCount >= 3) return 5
      if (this.groupCount === 2) return 3
      return 1
    }
    if (this.trapKind === 'bush') {
      // 온보딩 덤불: 소프트 함정 — 칸수만큼 소량 피해(1/2/3). 거미줄 즉사(999) 규칙 미적용.
      return Math.min(3, Math.max(1, this.groupCount))
    }
    if (this.groupCount >= 3) return 999
    if (this.groupCount === 2) return 5
    return this.baseDamage
  }

  /** 함정이 가하는/표기할 BASE 피해(런 보너스 제외). 거미줄·포자는 밟음 피해와 같고,
   *  폭탄은 폭발 기본 피해를 따른다. 런 보너스는 호출부에서 character.trapDamageBonus를 더한다. */
  effectiveTrapDamage(): number {
    if (this.type !== CardType.TRAP) return 0
    if (this.trapKind === 'bomb') return Card.BOMB_DAMAGE
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
    // 온보딩 바위는 바위끼리만 합쳐진다 — 거미 등 일반 적과 섞이면 안 된다.
    // (덤불=trapKind·잡동사니=treasureKind는 각 분기에서 이미 동종만 허용된다.)
    const rockA = this.enemySpriteId === 'enemyRock'
    const rockB = other.enemySpriteId === 'enemyRock'
    if (rockA || rockB) return rockA && rockB
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
    // 온보딩 필드 카드는 합체 시 만료를 최대 턴수로 리셋한다(합체 턴 미카운트 → 박힌 칸).
    this.resetFieldExpiry()

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
