/**
 * Sprite registry — maps cards/players to webp art under /assets/sprites.
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
import type { HandCardId } from '@entities/HandCard'

import backgroundUrl from '../assets/sprites/background_001.webp'
import playerUrl from '../assets/sprites/player_001.webp'
import enemy001Url from '../assets/sprites/enemy_001.webp'
import enemy002Url from '../assets/sprites/enemy_002.webp'
import enemy003Url from '../assets/sprites/enemy_003.webp'
import trap001Url from '../assets/sprites/trap_001.webp'
import chest001Url from '../assets/sprites/chest_001.webp'
import chest002Url from '../assets/sprites/chest_002.webp'
import chest003Url from '../assets/sprites/chest_003.webp'

import cardBackUrl from '../assets/sprites/cardbackground_001.webp'
import handCard001Url from '../assets/sprites/handcard_001.webp'
import handCard002Url from '../assets/sprites/handcard_002.webp'
import handCard003Url from '../assets/sprites/handcard_003.webp'
import handCard004Url from '../assets/sprites/handcard_004.webp'
import handCard005Url from '../assets/sprites/handcard_005.webp'
import handCard006Url from '../assets/sprites/handcard_006.webp'
import handCard007Url from '../assets/sprites/handcard_007.webp'
import handCard008Url from '../assets/sprites/handcard_008.webp'
import handCard009Url from '../assets/sprites/handcard_009.webp'
import handCard010Url from '../assets/sprites/handcard_010.webp'

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
  cardBack: cardBackUrl,
  handCards: {
    'wax-drop': handCard001Url,
    candle: handCard002Url,
    ember: handCard003Url,
    key: handCard004Url,
    wax: handCard005Url,
    match: handCard006Url,
    'holy-water': handCard007Url,
    chitin: handCard008Url,
    card: handCard009Url,
    coin: handCard010Url,
  } satisfies Record<HandCardId, string>,
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

/**
 * 1-cell enemies should match their illustration to their displayed name
 * (양초 생쥐 → enemy_001 mouse, 양초 개구리 → enemy_002 frog). Only merged
 * 2/3-cell formations fall back to a stable random pick of either sprite.
 */
function spriteForNormalEnemy(card: Card): string {
  if (card.groupCount === 1) {
    if (card.name.includes('생쥐')) return SpriteUrls.enemyMouse
    if (card.name.includes('개구리')) return SpriteUrls.enemyFrog
  }
  return NORMAL_ENEMY_VARIANTS[hashId(card.id) % NORMAL_ENEMY_VARIANTS.length]
}

export function spriteForCard(card: Card): string {
  if (card.type === CardType.ENEMY) {
    if (card.isSpecialEnemy) return SpriteUrls.mimic
    return spriteForNormalEnemy(card)
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

/** Hand card art follows HAND_CARD_IDS order: handcard_001.webp through handcard_010.webp. */
export function spriteForHandCard(defId: HandCardId): string {
  return SpriteUrls.handCards[defId]
}
