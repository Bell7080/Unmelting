/**
 * EmberSystem - Time pressure module.
 *
 * Ember (불씨) is the game's external time. It wanes by 1 every
 * Character.EMBER_DECAY_TURNS turns. As ember falls the world darkens:
 * spawn weights shift, enemies gain stat bonuses, and the screen
 * vignette deepens (Darkest Dungeon torch & sanity feel).
 *
 * Ember 0 does NOT end the game. Instead the field becomes the most
 * brutal tier — enemies/traps are stronger and treasures stop spawning.
 */

import { Character } from '@entities/Character'

export type EmberTier = 'bright' | 'dim' | 'flickering' | 'extinguished'

export interface SpawnWeights {
  enemy: number
  trap: number
  treasure: number
}

export interface EnemyStatBonus {
  hp: number
  atk: number
}

const SPAWN_WEIGHTS: Record<EmberTier, SpawnWeights> = {
  bright: { enemy: 63, trap: 12, treasure: 25 },
  dim: { enemy: 73, trap: 12, treasure: 15 },
  flickering: { enemy: 86, trap: 11, treasure: 3 },
  extinguished: { enemy: 90, trap: 10, treasure: 0 },
}

const ENEMY_BONUS: Record<EmberTier, EnemyStatBonus> = {
  bright: { hp: 0, atk: 0 },
  dim: { hp: 1, atk: 0 },
  flickering: { hp: 2, atk: 1 },
  extinguished: { hp: 3, atk: 2 },
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
      character.emberDecayCountdown = Character.EMBER_DECAY_TURNS
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
    return { ...SPAWN_WEIGHTS[tier] }
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
