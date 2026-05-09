/**
 * Sprite registry — maps cards/players to webp art under /assets/fonts/sprites.
 *
 * Selection rules (per request):
 *   - Player: player_001
 *   - Normal enemy 1-cell: random pick of enemy_001 (candle mouse) or
 *     enemy_002 (candle frog), stable per card via id hash.
 *   - Normal enemy 2/3-cell merged: random pick of enemy_001 / enemy_002.
 *   - Mimic (special enemy): enemy_003.
 *   - Treasure: chest_001 / chest_002 / chest_003 by groupCount (1/2/3).
 *   - Trap: trap_001 for every group width (the art fills the full card).
 *   - Rail / stage backdrop: background_001.
 */

import { Card, CardType } from '@entities/Card'

import backgroundUrl from '../assets/fonts/sprites/background_001.webp'
import playerUrl from '../assets/fonts/sprites/player_001.webp'
import enemy001Url from '../assets/fonts/sprites/enemy_001.webp'
import enemy002Url from '../assets/fonts/sprites/enemy_002.webp'
import enemy003Url from '../assets/fonts/sprites/enemy_003.webp'
import trap001Url from '../assets/fonts/sprites/trap_001.webp'
import chest001Url from '../assets/fonts/sprites/chest_001.webp'
import chest002Url from '../assets/fonts/sprites/chest_002.webp'
import chest003Url from '../assets/fonts/sprites/chest_003.webp'

export const SpriteUrls = {
  background: backgroundUrl,
  player: playerUrl,
  enemyMouse: enemy001Url,
  enemyFrog: enemy002Url,
  mimic: enemy003Url,
  trap: trap001Url,
  chestSmall: chest001Url,
  chestMedium: chest002Url,
  chestLarge: chest003Url,
}

const NORMAL_ENEMY_VARIANTS = [SpriteUrls.enemyMouse, SpriteUrls.enemyFrog]

/** Stable cheap hash so a given card always maps to the same sprite variant. */
function hashId(id: string): number {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

export function spriteForCard(card: Card): string {
  if (card.type === CardType.ENEMY) {
    if (card.isSpecialEnemy) return SpriteUrls.mimic
    return NORMAL_ENEMY_VARIANTS[hashId(card.id) % NORMAL_ENEMY_VARIANTS.length]
  }
  if (card.type === CardType.TRAP) {
    return SpriteUrls.trap
  }
  if (card.type === CardType.TREASURE) {
    if (card.groupCount >= 3) return SpriteUrls.chestLarge
    if (card.groupCount === 2) return SpriteUrls.chestMedium
    return SpriteUrls.chestSmall
  }
  return ''
}
