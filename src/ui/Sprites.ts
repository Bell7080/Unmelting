/**
 * Sprite registry — maps cards/players to webp art under /assets/sprites.
 *
 * Selection rules (per request):
 *   - Player: player_001
 *   - Normal enemy 1-cell: follows the spawned enemy definition.
 *   - Normal enemy 2/3-cell merged: follows the strongest member's art.
 *   - Mimic (special enemy): enemy_003.
 *   - Treasure: chest_001 / chest_002 / chest_003 by groupCount (1/2/3).
 *   - Trap: trap_001 web, trap_004 bomb, trap_007 spore.
 *   - Flower: flower_000 seed, flower_001~005 blooms, enemyflower_001 monster flower.
 *   - Rail / stage backdrop: background_001.
 */

import { Card, CardType, type EnemySpriteId, type FlowerKind, type TrapKind } from '@entities/Card'
import type { HandCardId } from '@entities/HandCard'

import backgroundUrl from '../assets/sprites/background_001.webp'
import playerUrl from '../assets/sprites/player_001.webp'
import enemy001Url from '../assets/sprites/enemy_001.webp'
import enemy002Url from '../assets/sprites/enemy_002.webp'
import enemy003Url from '../assets/sprites/enemy_003.webp'
import enemy004Url from '../assets/sprites/enemy_004.webp'
import enemy005Url from '../assets/sprites/enemy_005.webp'
import enemy006Url from '../assets/sprites/enemy_006.webp'
import enemy007Url from '../assets/sprites/enemy_007.webp'
import enemyFlower001Url from '../assets/sprites/enemyflower_001.webp'
import flower000Url from '../assets/sprites/flower_000.webp'
import flower001Url from '../assets/sprites/flower_001.webp'
import flower002Url from '../assets/sprites/flower_002.webp'
import flower003Url from '../assets/sprites/flower_003.webp'
import flower004Url from '../assets/sprites/flower_004.webp'
import flower005Url from '../assets/sprites/flower_005.webp'
import trap001Url from '../assets/sprites/trap_001.webp'
import trap002Url from '../assets/sprites/trap_002.webp'
import trap003Url from '../assets/sprites/trap_003.webp'
import trap004Url from '../assets/sprites/trap_004.webp'
import trap007Url from '../assets/sprites/trap_007.webp'
import trap008Url from '../assets/sprites/trap_008.webp'
import trap009Url from '../assets/sprites/trap_009.webp'
import enemyWave001Url from '../assets/sprites/enemywave_001.webp'
import enemyWave002Url from '../assets/sprites/enemywave_002.webp'
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
import relic001Url from '../assets/sprites/relics_001.webp'
import relic002Url from '../assets/sprites/relics_002.webp'
import relic003Url from '../assets/sprites/relics_003.webp'
import relic004Url from '../assets/sprites/relics_004.webp'
import relic005Url from '../assets/sprites/relics_005.webp'
import relic006Url from '../assets/sprites/relics_006.webp'
import relic007Url from '../assets/sprites/relics_007.webp'
import type { RelicId } from '@data/Relics'

export const SpriteUrls = {
  background: backgroundUrl,
  player: playerUrl,
  enemyMouse: enemy001Url,
  enemyFrog: enemy002Url,
  mimic: enemy003Url,
  monsterFlower: enemyFlower001Url,
  enemyMoth: enemy004Url,
  enemyChitin: enemy005Url,
  enemyBird: enemy006Url,
  enemyMole: enemy007Url,
  traps: {
    web: trap001Url,
    bomb: trap004Url,
    spore: trap007Url,
  } satisfies Record<TrapKind, string>,
  trapGroups: {
    web: { 1: trap001Url, 2: trap002Url, 3: trap003Url },
    spore: { 1: trap007Url, 2: trap008Url, 3: trap009Url },
  } satisfies Record<Extract<TrapKind, 'web' | 'spore'>, Record<1 | 2 | 3, string>>,
  enemyWaves: {
    2: enemyWave001Url,
    3: enemyWave002Url,
  } satisfies Record<2 | 3, string>,
  chestSmall: chest001Url,
  chestMedium: chest002Url,
  chestLarge: chest003Url,
  flowers: {
    seed: flower000Url,
    chamomile: flower001Url,
    redRose: flower002Url,
    marigold: flower003Url,
    oleander: flower004Url,
    lavender: flower005Url,
  } satisfies Record<FlowerKind, string>,
  cardBack: cardBackUrl,
  relics: {
    'red-potion': relic001Url,
    'golden-squirrel': relic002Url,
    'wax-crow': relic003Url,
    'carving-knife': relic004Url,
    lifeline: relic005Url,
    'blood-pack': relic006Url,
    hope: relic007Url,
  } satisfies Record<RelicId, string>,
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

const ENEMY_SPRITES: Record<EnemySpriteId, string> = {
  enemyMouse: SpriteUrls.enemyMouse,
  enemyFrog: SpriteUrls.enemyFrog,
  enemyMoth: SpriteUrls.enemyMoth,
  enemyChitin: SpriteUrls.enemyChitin,
  enemyBird: SpriteUrls.enemyBird,
  enemyMole: SpriteUrls.enemyMole,
}

/** Stable cheap hash so a given card always maps to the same sprite variant. */
function hashId(id: string): number {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

/**
 * 1-cell enemies and merged groups prefer explicit definition sprite ids;
 * legacy name matching remains for tests or old save/runtime cards.
 */
function spriteForNormalEnemy(card: Card): string {
  // Spawned enemies carry a stable sprite id, and merged groups keep the
  // strongest member's id, so art now communicates threat strength directly.
  if (card.enemySpriteId) return ENEMY_SPRITES[card.enemySpriteId]
  if (card.groupCount === 1) {
    if (card.name.includes('생쥐')) return SpriteUrls.enemyMouse
    if (card.name.includes('개구리')) return SpriteUrls.enemyFrog
    if (card.name.includes('거미')) return SpriteUrls.enemyMoth
    if (card.name.includes('키틴')) return SpriteUrls.enemyChitin
    if (card.name.includes('새')) return SpriteUrls.enemyBird
    if (card.name.includes('두더지')) return SpriteUrls.enemyMole
  }
  return NORMAL_ENEMY_VARIANTS[hashId(card.id) % NORMAL_ENEMY_VARIANTS.length]
}

export function spriteForCard(card: Card): string {
  if (card.type === CardType.ENEMY) {
    if (card.specialEnemyKind === 'monsterFlower') return SpriteUrls.monsterFlower
    if (card.isSpecialEnemy) return SpriteUrls.mimic
    if (card.groupCount >= 3) return SpriteUrls.enemyWaves[3]
    if (card.groupCount === 2) return SpriteUrls.enemyWaves[2]
    return spriteForNormalEnemy(card)
  }
  if (card.type === CardType.TRAP) {
    // Webs and spores have dedicated 1/2/3-cell illustrations; bombs stay single-cell.
    if (card.trapKind === 'web' || card.trapKind === 'spore') {
      const span = Math.max(1, Math.min(3, card.groupCount)) as 1 | 2 | 3
      return SpriteUrls.trapGroups[card.trapKind][span]
    }
    return SpriteUrls.traps[card.trapKind]
  }
  if (card.type === CardType.TREASURE) {
    if (card.groupCount >= 3) return SpriteUrls.chestLarge
    if (card.groupCount === 2) return SpriteUrls.chestMedium
    return SpriteUrls.chestSmall
  }
  if (card.type === CardType.FLOWER) {
    return SpriteUrls.flowers[card.flowerKind]
  }
  return ''
}

/** Hand card art follows HAND_CARD_IDS order: handcard_001.webp through handcard_010.webp. */
export function spriteForHandCard(defId: HandCardId): string {
  return SpriteUrls.handCards[defId]
}

/** Dedicated relic art follows RELIC_IDS order: relics_001.webp through relics_007.webp. */
export function spriteForRelic(id: RelicId): string {
  return SpriteUrls.relics[id]
}
