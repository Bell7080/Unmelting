/**
 * EmberSystem - Time pressure module.
 *
 * Ember (불씨) is the game's external time. It wanes by 1 every
 * active ember-decay cadence turn. As ember falls the world darkens:
 * spawn weights shift, enemies gain stat bonuses, and the screen
 * vignette deepens (Darkest Dungeon torch & sanity feel).
 *
 * Ember 0 does NOT end the game. Instead the field becomes the most
 * brutal tier — enemies/traps are stronger and treasures stop spawning.
 */

import type { Character } from '@entities/Character'

export type EmberTier = 'bright' | 'dim' | 'flickering' | 'extinguished'

export interface SpawnWeights {
  enemy: number
  trap: number
  treasure: number
  flower: number
}

export interface SpawnBuckets {
  enemy: number
  webTrap: number
  bombTrap: number
  sporeTrap: number
  treasure: number
  flower: number
}

export interface EnemyStatBonus {
  hp: number
  atk: number
}

const SPAWN_BUCKETS: Record<EmberTier, SpawnBuckets> = {
  // Bomb and spore buckets preserve the former absolute odds, while extra
  // ordinary web traps come out of the enemy bucket to soften early clumping.
  bright: { enemy: 44, webTrap: 17, bombTrap: 4, sporeTrap: 4, treasure: 22, flower: 9 },
  dim: { enemy: 60, webTrap: 12, bombTrap: 4, sporeTrap: 4, treasure: 13, flower: 7 },
  flickering: {
    enemy: 74,
    webTrap: 35 / 3,
    bombTrap: 11 / 3,
    sporeTrap: 11 / 3,
    treasure: 3,
    flower: 4,
  },
  extinguished: {
    enemy: 80,
    webTrap: 34 / 3,
    bombTrap: 10 / 3,
    sporeTrap: 10 / 3,
    treasure: 0,
    flower: 2,
  },
}

// 불씨 티어는 더 이상 적 HP를 올리지 않는다(불씨 회복 시 1체력 적이 죽는 문제 방지).
// 공격력만 티어에 따라 동적으로 가감되며, 이는 Card.getDamage가 현재 보너스를 즉시 읽어 반영한다.
const ENEMY_BONUS: Record<EmberTier, EnemyStatBonus> = {
  bright: { hp: 0, atk: 0 },
  dim: { hp: 0, atk: 0 },
  flickering: { hp: 0, atk: 1 },
  extinguished: { hp: 0, atk: 2 },
}

/** 0..1 vignette intensity per tier — used by the renderer. */
const VIGNETTE_INTENSITY: Record<EmberTier, number> = {
  bright: 0,
  dim: 0.35,
  flickering: 0.65,
  extinguished: 0.9,
}

export class EmberSystem {
  /** Wane the ember by `amount` (default 1). Returns the new ember level. */
  static wane(character: Character, amount: number = 1): number {
    return character.spendEmber(amount)
  }

  /** Tick the per-turn decay countdown. When it expires the ember loses 1. */
  static tickDecayCountdown(character: Character): boolean {
    character.emberDecayCountdown -= 1
    if (character.emberDecayCountdown <= 0) {
      // 제단 자원팩 보상은 캐릭터의 활성 소모 주기를 늘려 3턴→4턴 식으로 늦춘다.
      character.emberDecayCountdown = character.emberDecayTurns
      EmberSystem.wane(character, 1)
      return true
    }
    return false
  }

  static getTier(ember: number): EmberTier {
    if (ember >= 7) return 'bright'
    if (ember >= 4) return 'dim'
    if (ember >= 1) return 'flickering'
    return 'extinguished'
  }

  static getCharacterTier(character: Character): EmberTier {
    return EmberSystem.getTier(character.ember)
  }

  static getSpawnWeights(tier: EmberTier): SpawnWeights {
    const buckets = SPAWN_BUCKETS[tier]
    // The HUD still displays traps as one aggregate while the spawner keeps
    // individual trap-kind odds stable for bombs and spores.
    return {
      enemy: buckets.enemy,
      trap: buckets.webTrap + buckets.bombTrap + buckets.sporeTrap,
      treasure: buckets.treasure,
      flower: buckets.flower,
    }
  }

  static getSpawnBuckets(tier: EmberTier): SpawnBuckets {
    return { ...SPAWN_BUCKETS[tier] }
  }

  static getEnemyStatBonus(tier: EmberTier): EnemyStatBonus {
    return { ...ENEMY_BONUS[tier] }
  }

  /** Flickering and extinguished tiers reverse turn order. */
  static isEnemyFirstStrike(tier: EmberTier): boolean {
    return tier === 'flickering' || tier === 'extinguished'
  }

  /** Vignette overlay intensity 0..1 used by the renderer. */
  static getVignetteIntensity(tier: EmberTier): number {
    return VIGNETTE_INTENSITY[tier]
  }

  /** Convert a tier to a Korean label for HUD copy. */
  static tierLabel(tier: EmberTier): string {
    switch (tier) {
      case 'bright':
        return '밝음'
      case 'dim':
        return '희미함'
      case 'flickering':
        return '꺼져감'
      case 'extinguished':
        return '꺼졌다'
    }
  }
}
