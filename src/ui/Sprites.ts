/**
 * Sprite registry — maps cards/players to webp art under /assets/sprites.
 *
 * Selection rules (per request):
 *   - Player: player_001
 *   - Normal enemy 1-cell: follows the spawned enemy definition.
 *   - Normal enemy 2/3-cell merged: follows the strongest member's art.
 *   - Mimic (special enemy): mimic_001.
 *   - Treasure: chest_001 / chest_002 / chest_003 by groupCount (1/2/3).
 *   - Final-ascent starlight: turnkey_001.
 *   - Boss reward: reward_001 heal / reward_002 chest / reward_003 bounty.
 *   - Trap: trap_001 web, trap_004 bomb, trap_007 spore.
 *   - Flower: flower_000 seed, flower_001~005 blooms, enemyflower_001 monster flower.
 *   - Rail / stage backdrop: background_001.
 *   - Boss: boss_001. Trial veil: background_005.
 *   - Boss 60F (불씨 기사단장): boss_002.
 *   - Boss 90F (밀랍 조각사): boss_003.
 *   - Boss 100F (녹지 않는 마녀): boss_004.
 *   - Trial cards: trial_001 광란 / trial_004 역경 / trial_007 가난.
 */

import { Card, CardType, type EnemySpriteId, type FlowerKind, type TrapKind } from '@entities/Card'
import type { HandCardId } from '@entities/HandCard'

import backgroundUrl from '../assets/sprites/background_001.webp'
import shopVeilBgUrl from '../assets/sprites/background_002.webp'
import shopPickerBgUrl from '../assets/sprites/background_003.webp'
import altarVeilBgUrl from '../assets/sprites/background_004.webp'
import trialVeilBgUrl from '../assets/sprites/background_005.webp'
import boss001Url from '../assets/sprites/boss_001.webp'
import boss002Url from '../assets/sprites/boss_002.webp'
import boss003Url from '../assets/sprites/boss_003.webp'
import boss004Url from '../assets/sprites/boss_004.webp'
import player000Url from '../assets/sprites/player_000.webp'
import playerUrl from '../assets/sprites/player_001.webp'
import enemy001Url from '../assets/sprites/enemy_001.webp'
import enemy002Url from '../assets/sprites/enemy_002.webp'
import enemy003Url from '../assets/sprites/enemy_003.webp'
import enemy004Url from '../assets/sprites/enemy_004.webp'
import enemy005Url from '../assets/sprites/enemy_005.webp'
import enemy006Url from '../assets/sprites/enemy_006.webp'
import enemy007Url from '../assets/sprites/enemy_007.webp'
import enemy008Url from '../assets/sprites/enemy_008.webp'
import enemy009Url from '../assets/sprites/enemy_009.webp'
import enemy010Url from '../assets/sprites/enemy_010.webp'
import enemy011Url from '../assets/sprites/enemy_011.webp'
import enemy012Url from '../assets/sprites/enemy_012.webp'
import enemy013Url from '../assets/sprites/enemy_013.webp'
import enemy014Url from '../assets/sprites/enemy_014.webp'
import enemy015Url from '../assets/sprites/enemy_015.webp'
import enemy016Url from '../assets/sprites/enemy_016.webp'
import enemy017Url from '../assets/sprites/enemy_017.webp'
import enemy018Url from '../assets/sprites/enemy_018.webp'
import mimic001Url from '../assets/sprites/mimic_001.webp'
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
import chest004Url from '../assets/sprites/chest_004.webp'
import reward001Url from '../assets/sprites/reward_001.webp'
import reward002Url from '../assets/sprites/reward_002.webp'
import reward003Url from '../assets/sprites/reward_003.webp'
import turnkey001Url from '../assets/sprites/turnkey_001.webp'

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
import handCard011Url from '../assets/sprites/handcard_011.webp'
import handCard012Url from '../assets/sprites/handcard_012.webp'
import handCard013Url from '../assets/sprites/handcard_013.webp'
import handCard014Url from '../assets/sprites/handcard_014.webp'
import handCard015Url from '../assets/sprites/handcard_015.webp'
import handCard016Url from '../assets/sprites/handcard_016.webp'
import handCard017Url from '../assets/sprites/handcard_017.webp'
import handCard018Url from '../assets/sprites/handcard_018.webp'
import handCard019Url from '../assets/sprites/handcard_019.webp'
import handCard020Url from '../assets/sprites/handcard_020.webp'
import handCard021Url from '../assets/sprites/handcard_021.webp'
import handCard022Url from '../assets/sprites/handcard_022.webp'
import handCard023Url from '../assets/sprites/handcard_023.webp'
import handCard024Url from '../assets/sprites/handcard_024.webp'
import handCard025Url from '../assets/sprites/handcard_025.webp'
import handCard026Url from '../assets/sprites/handcard_026.webp'
import handCard027Url from '../assets/sprites/handcard_027.webp'
import handCard028Url from '../assets/sprites/handcard_028.webp'
import handCard029Url from '../assets/sprites/handcard_029.webp'
import handCard030Url from '../assets/sprites/handcard_030.webp'
import handCard031Url from '../assets/sprites/handcard_031.webp'
import handCard032Url from '../assets/sprites/handcard_032.webp'
import handCard033Url from '../assets/sprites/handcard_033.webp'
import reward004Url from '../assets/sprites/reward_004.webp'
import reward005Url from '../assets/sprites/reward_005.webp'
import relic001Url from '../assets/sprites/relics_001.webp'
import relic002Url from '../assets/sprites/relics_002.webp'
import relic003Url from '../assets/sprites/relics_003.webp'
import relic004Url from '../assets/sprites/relics_004.webp'
import relic005Url from '../assets/sprites/relics_005.webp'
import relic006Url from '../assets/sprites/relics_006.webp'
import relic007Url from '../assets/sprites/relics_007.webp'
import relic008Url from '../assets/sprites/relics_008.webp'
import relic009Url from '../assets/sprites/relics_009.webp'
import relic010Url from '../assets/sprites/relics_010.webp'
import relic011Url from '../assets/sprites/relics_011.webp'
import relic012Url from '../assets/sprites/relics_012.webp'
import relic013Url from '../assets/sprites/relics_013.webp'
import relic014Url from '../assets/sprites/relics_014.webp'
import relic015Url from '../assets/sprites/relics_015.webp'
import relic016Url from '../assets/sprites/relics_016.webp'
import relic017Url from '../assets/sprites/relics_017.webp'
import relic018Url from '../assets/sprites/relics_018.webp'
import relic019Url from '../assets/sprites/relics_019.webp'
import relic020Url from '../assets/sprites/relics_020.webp'
import relic021Url from '../assets/sprites/relics_021.webp'
import relic022Url from '../assets/sprites/relics_022.webp'
import relic023Url from '../assets/sprites/relics_023.webp'
import relic024Url from '../assets/sprites/relics_024.webp'
import relic025Url from '../assets/sprites/relics_025.webp'
import relic026Url from '../assets/sprites/relics_026.webp'
import relic027Url from '../assets/sprites/relics_027.webp'
import relic028Url from '../assets/sprites/relics_028.webp'
import relic029Url from '../assets/sprites/relics_029.webp'
import relic030Url from '../assets/sprites/relics_030.webp'
import relic031Url from '../assets/sprites/relics_031.webp'
import relic032Url from '../assets/sprites/relics_032.webp'
import relic033Url from '../assets/sprites/relics_033.webp'
import relic034Url from '../assets/sprites/relics_034.webp'
import relic035Url from '../assets/sprites/relics_035.webp'
import relic036Url from '../assets/sprites/relics_036.webp'
import relic037Url from '../assets/sprites/relics_037.webp'
import relic038Url from '../assets/sprites/relics_038.webp'
import pack001Url from '../assets/sprites/pack_001.webp'
import pack002Url from '../assets/sprites/pack_002.webp'
import pack003Url from '../assets/sprites/pack_003.webp'
import free001Url from '../assets/sprites/free_001.webp'
import free002Url from '../assets/sprites/free_002.webp'
import hearthBackdropUrl from '../assets/sprites/hearth_bg_001.webp'
import hearthDoorUrl from '../assets/sprites/hearth_bg_002.webp'
import hearthAdventureUrl from '../assets/sprites/hearth_bg_003.webp'
import hearthTradeUrl from '../assets/sprites/hearth_bg_004.webp'
import hearthDinnerUrl from '../assets/sprites/hearth_bg_005.webp'
import hearthDinnerHostUrl from '../assets/sprites/hearth_006.webp'
import questMajorUrl from '../assets/sprites/quest_001.webp'
import questMediumUrl from '../assets/sprites/quest_002.webp'
import questMinorUrl from '../assets/sprites/quest_003.webp'
import trial001Url from '../assets/sprites/trial_001.webp'
import trial004Url from '../assets/sprites/trial_004.webp'
import trial007Url from '../assets/sprites/trial_007.webp'
import pack005Url from '../assets/sprites/pack_005.webp'
import pack006Url from '../assets/sprites/pack_006.webp'
import pack007Url from '../assets/sprites/pack_007.webp'
import type { RelicId } from '@data/Relics'

export const SpriteUrls = {
  background: backgroundUrl,
  /** Shop overlay full-area backdrop (replaces the dim-veil gradient). */
  shopVeilBg: shopVeilBgUrl,
  /** Pack-picker veil backdrop (shown when opening a card pack). */
  shopPickerBg: shopPickerBgUrl,
  /** Altar visit backdrop; currently reuses the shop flow with a darker plate. */
  altarVeilBg: altarVeilBgUrl,
  /** Trial (시련) overlay backdrop. */
  trialVeilBg: trialVeilBgUrl,
  /** 30층 보스(양초 백작) 일러스트. */
  boss: boss001Url,
  /** 60층 보스(불씨 기사단장) 일러스트. */
  boss60: boss002Url,
  /** 90층 보스(밀랍 조각사) 일러스트. */
  boss90: boss003Url,
  /** 100층 보스(녹지 않는 마녀) 일러스트. */
  boss100: boss004Url,
  player: playerUrl,
  /** 튜토리얼 플레이어(새싹 병아리) 일러스트. */
  playerTutorial: player000Url,
  // 사용자 지정 매핑: enemy_001~018을 타입 안전한 EnemySpriteId 키와 1:1로 연결한다.
  enemyChitin: enemy001Url,
  enemyMoth: enemy002Url,
  enemyMouse: enemy003Url,
  enemyFrog: enemy004Url,
  enemyBird: enemy005Url,
  enemyMole: enemy006Url,
  enemyBee: enemy007Url,
  enemyMantis: enemy008Url,
  enemyBat: enemy009Url,
  enemyHedgehog: enemy010Url,
  enemyLizard: enemy011Url,
  enemyRaccoon: enemy012Url,
  enemyBeetle: enemy013Url,
  enemyScorpion: enemy014Url,
  enemyMarten: enemy015Url,
  enemyBadger: enemy016Url,
  enemySloth: enemy017Url,
  enemyJackal: enemy018Url,
  // 미믹은 기존 enemy_003 대신 전용 mimic_001 일러스트를 사용한다.
  mimic: mimic001Url,
  monsterFlower: enemyFlower001Url,
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
  /** 황금 상자 — 1/2/3칸 모두 동일 이미지(chest_004). */
  chestGolden: chest004Url,
  /** 90~100층 전용 별빛 칸 일러스트. */
  starlight: turnkey001Url,
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
    'ink-quill': relic008Url,
    'first-candle': relic009Url,
    'graceful-response': relic010Url,
    ambition: relic011Url,
    anomaly: relic012Url,
    'blind-faith': relic013Url,
    honesty: relic014Url,
    hegemony: relic015Url,
    authority: relic016Url,
    hourglass: relic017Url,
    'great-negotiation': relic018Url,
    'premium-firewood': relic019Url,
    pickaxe: relic020Url,
    axe: relic021Url,
    'annabella-ring': relic022Url,
    'annabella-pendant': relic023Url,
    'precious-head': relic024Url,
    chance: relic025Url,
    'opening-ceremony': relic026Url,
    padlock: relic027Url,
    'charred-paper': relic028Url,
    'water-bucket': relic029Url,
    'golden-key': relic030Url,
    // 신규 유물 — 전용 아트 연동 완료.
    chivalry: relic031Url,
    'sweet-temptation': relic032Url,
    'discount-coupon': relic033Url,
    luxury: relic034Url,
    sanitizer: relic035Url,
    'wax-harmony': relic036Url,
    'trap-master': relic037Url,
    'demon-doll': relic038Url,
    // 만찬은 별도 아트가 들어오기 전까지 음식/인형 톤이 가까운 038 유물 아트를 임시 사용한다.
    'last-supper': relic038Url,
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
    'greed-coin': handCard011Url,
    'sacrifice-candle': handCard012Url,
    levatein: handCard013Url,
    firework: handCard014Url,
    'book-of-flames': handCard015Url,
    'fire-arrow': handCard016Url,
    'shield-bash': handCard017Url,
    'sacrifice-shield': handCard018Url,
    sweep: handCard019Url,
    'hand-mirror': handCard020Url,
    chandelier: handCard021Url,
    bonfire: handCard022Url,
    teapot: handCard023Url,
    teacup: handCard024Url,
    'top-hat': handCard025Url,
    slash: handCard026Url,
    shackles: handCard027Url,
    // 신규 손패 — 전용 아트 연동 완료.
    'candle-tome': handCard028Url,
    'sword-and-shield': handCard029Url,
    'watering-can': handCard030Url,
    'garden-scissors': handCard031Url,
    'ritual-candle': handCard032Url,
    'black-candle': handCard033Url,
  } satisfies Record<HandCardId, string>,
  /** Shop card-pack illustrations. Index follows the pack pickers in the
   *  shop bottom row: basic (자원) / recipe (조합) / unlock (해금) / chance (확률). */
  packs: {
    'basic-pack': pack001Url,
    'recipe-pack': pack002Url,
    'unlock-pack': pack003Url,
    'chance-pack': pack006Url,
    'resource-pack': pack005Url,
    'delete-pack': pack007Url,
  } as const,
  /** Free-card dedicated artwork. */
  freeCard: free001Url,
  /** Altar coin free-card artwork (수당). */
  freeCoinCard: free002Url,
  /** Boss reward illustrations: heal / chest / bounty. */
  rewards: {
    heal: reward001Url,
    chest: reward002Url,
    bounty: reward003Url,
    demonRelic: reward004Url,
    demonHand: reward005Url,
  } as const,
  /** 시련 카드 일러스트 — 광란(001) / 역경(004) / 가난(007). */
  trials: {
    '001': trial001Url,
    '004': trial004Url,
    '007': trial007Url,
  } satisfies Record<'001' | '004' | '007', string>,
  /** 거점 전용 일러스트. */
  hearth: {
    /** 인게임 전체화면 배경(hearth_bg_001) — 레일 배경 위에 디졸브로 흐릿하게 겹친다. */
    backdrop: hearthBackdropUrl,
    /** 거점 오로라 커튼 위에 반투명하게 깔리는 대문(hearth_bg_002). */
    door: hearthDoorUrl,
    /** 모험 셔터 내부 배경(hearth_bg_003). */
    adventure: hearthAdventureUrl,
    /** 무역 셔터 내부 배경(hearth_bg_004). */
    trade: hearthTradeUrl,
    /** 만찬 셔터 내부 배경(hearth_bg_005). */
    dinner: hearthDinnerUrl,
    /** 만찬 완료 후 중앙에서 열리는 주인 일러스트(hearth_006). */
    dinnerHost: hearthDinnerHostUrl,
  } as const,
  /** 의뢰(퀘스트) 딱지 일러스트 — 등급별(메인/중간/소형). */
  questTickets: {
    major: questMajorUrl,
    medium: questMediumUrl,
    minor: questMinorUrl,
  } satisfies Record<'major' | 'medium' | 'minor', string>,
}

const NORMAL_ENEMY_VARIANTS = [SpriteUrls.enemyMouse, SpriteUrls.enemyFrog]

const ENEMY_SPRITES: Record<EnemySpriteId, string> = {
  enemyMouse: SpriteUrls.enemyMouse,
  enemyFrog: SpriteUrls.enemyFrog,
  enemyMoth: SpriteUrls.enemyMoth,
  enemyChitin: SpriteUrls.enemyChitin,
  enemyBird: SpriteUrls.enemyBird,
  enemyMole: SpriteUrls.enemyMole,
  enemyBee: SpriteUrls.enemyBee,
  enemyMantis: SpriteUrls.enemyMantis,
  enemyBat: SpriteUrls.enemyBat,
  enemyHedgehog: SpriteUrls.enemyHedgehog,
  enemyLizard: SpriteUrls.enemyLizard,
  enemyRaccoon: SpriteUrls.enemyRaccoon,
  enemyBeetle: SpriteUrls.enemyBeetle,
  enemyScorpion: SpriteUrls.enemyScorpion,
  enemyMarten: SpriteUrls.enemyMarten,
  enemyBadger: SpriteUrls.enemyBadger,
  enemySloth: SpriteUrls.enemySloth,
  enemyJackal: SpriteUrls.enemyJackal,
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
    if (card.name.includes('벌')) return SpriteUrls.enemyBee
    if (card.name.includes('사마귀')) return SpriteUrls.enemyMantis
    if (card.name.includes('박쥐')) return SpriteUrls.enemyBat
    if (card.name.includes('고슴도치')) return SpriteUrls.enemyHedgehog
    if (card.name.includes('도마뱀')) return SpriteUrls.enemyLizard
    if (card.name.includes('너구리')) return SpriteUrls.enemyRaccoon
    if (card.name.includes('풍뎅이')) return SpriteUrls.enemyBeetle
    if (card.name.includes('전갈')) return SpriteUrls.enemyScorpion
    if (card.name.includes('담비')) return SpriteUrls.enemyMarten
    if (card.name.includes('오소리')) return SpriteUrls.enemyBadger
    if (card.name.includes('나무늘보')) return SpriteUrls.enemySloth
    if (card.name.includes('자칼')) return SpriteUrls.enemyJackal
  }
  return NORMAL_ENEMY_VARIANTS[hashId(card.id) % NORMAL_ENEMY_VARIANTS.length]
}

export function spriteForCard(card: Card): string {
  if (card.type === CardType.BOSS) {
    if (card.specialEnemyKind === 'waxKnight') return SpriteUrls.boss60
    if (card.specialEnemyKind === 'waxSculptor') return SpriteUrls.boss90
    if (card.specialEnemyKind === 'waxWitch') return SpriteUrls.boss100
    if (card.specialEnemyKind === 'waxDemon') return spriteForEventBoss('eventboss_001') ?? SpriteUrls.boss
    return SpriteUrls.boss
  }
  if (card.type === CardType.ENEMY) {
    if (card.specialEnemyKind === 'monsterFlower') return SpriteUrls.monsterFlower
    if (card.specialEnemyKind === 'waxArmy') return SpriteUrls.enemyWaves[3]
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
    if (card.treasureKind === 'starlight') return SpriteUrls.starlight
    if (card.id === 'boss-reward-heal') return SpriteUrls.rewards.heal
    if (card.id === 'boss-reward-chest') return SpriteUrls.rewards.chest
    if (card.id === 'boss-reward-bounty') return SpriteUrls.rewards.bounty
    if (card.id === 'boss-reward-demon-relic') return SpriteUrls.rewards.demonRelic
    if (card.id === 'boss-reward-demon-hand') return SpriteUrls.rewards.demonHand
    // 황금 상자는 크기에 무관하게 chest_004 하나로 처리한다.
    if (card.treasureKind === 'goldenChest') return SpriteUrls.chestGolden
    if (card.groupCount >= 3) return SpriteUrls.chestLarge
    if (card.groupCount === 2) return SpriteUrls.chestMedium
    return SpriteUrls.chestSmall
  }
  if (card.type === CardType.FLOWER) {
    return SpriteUrls.flowers[card.flowerKind]
  }
  // 이벤트 문은 칸 일러스트 event_000 하나로 통일(공통 문). 파일이 아직 없으면
  // 글롭이 undefined를 반환해 placeholder로 비워진다(빌드 안전).
  if (card.type === CardType.EVENT) {
    return spriteForEvent('event_000') ?? ''
  }
  return ''
}

/** Hand card art follows HAND_CARD_IDS order: handcard_001.webp through handcard_010.webp. */
export function spriteForHandCard(defId: HandCardId): string {
  return SpriteUrls.handCards[defId]
}

/** Dedicated relic art follows RELIC_IDS order: relics_001.webp through relics_010.webp. */
export function spriteForRelic(id: RelicId): string {
  return SpriteUrls.relics[id]
}

// src/assets/sprites/basic/ 에 파일을 추가하면 Vite가 자동으로 번들에 포함시킨다.
const basicItemGlob = import.meta.glob<{ default: string }>(
  '../assets/sprites/basic/*.webp',
  { eager: true }
)

/** 자원팩 항목 일러스트. 파일이 없으면 undefined → 팩 기본 이미지로 폴백. */
export function spriteForBasicPackItem(illu: string): string | undefined {
  return basicItemGlob[`../assets/sprites/basic/${illu}.webp`]?.default
}

// 직업 일러스트(job_001~)는 추후 추가 예정. 글롭으로 묶어 파일이 생기면 자동 연동되고,
// 없으면 undefined → 카드 일러스트 영역을 심볼 placeholder로 비워둔다.
const jobIllustrationGlob = import.meta.glob<{ default: string }>(
  '../assets/sprites/job_*.webp',
  { eager: true }
)

/** 직업 선택 카드 일러스트. illu(예: 'job_001')에 해당하는 파일이 없으면 undefined. */
export function spriteForJob(illu: string): string | undefined {
  return jobIllustrationGlob[`../assets/sprites/${illu}.webp`]?.default
}

// 이벤트 일러스트: event_000(칸 문) + event_001~(인게임 이벤트 씬). 글롭으로 묶어
// 파일이 추가되면 자동 연동되고, 없으면 undefined → placeholder로 폴백(빌드 안전).
const eventIllustrationGlob = import.meta.glob<{ default: string }>(
  '../assets/sprites/event_*.webp',
  { eager: true }
)

/** 이벤트 일러스트. illu(예: 'event_000','event_001')에 해당하는 파일이 없으면 undefined. */
export function spriteForEvent(illu: string): string | undefined {
  return eventIllustrationGlob[`../assets/sprites/${illu}.webp`]?.default
}

// 거점 스테이션 칸 인스펙터 일러스트: hearth_001~009(row-major index+1). 글롭으로 묶어
// 파일이 추가되면 자동 연동되고, 없으면 undefined → CSS 플레이스홀더로 폴백한다.
// (hearth_bg_* 는 'hearth_0'으로 시작하지 않아 자연히 제외된다.)
const hearthStationGlob = import.meta.glob<{ default: string }>(
  '../assets/sprites/hearth_0*.webp',
  { eager: true }
)
/** 거점 스테이션 칸 일러스트. name 예: 'hearth_008'. 파일 없으면 undefined. */
export function spriteForHearthStation(name: string): string | undefined {
  return hearthStationGlob[`../assets/sprites/${name}.webp`]?.default
}

// 만찬 선택지 일러스트: sprites/dinner/<category>/<category>_NNN.webp 구조.
// 파일을 추가하면 자동 연동되고, 없으면 undefined → CSS 그라디언트 폴백.
const dinnerGlob = import.meta.glob<{ default: string }>(
  '../assets/sprites/dinner/**/*.webp',
  { eager: true },
)
/** 만찬 선택지 스프라이트.
 * kind: 'main' | 'sauce' | 'topping', num: '001' 형식.
 * 예: spriteForDinner('sauce', '002') → dinner/sauce/sauce_002.webp */
export function spriteForDinner(kind: string, num: string): string | undefined {
  return dinnerGlob[`../assets/sprites/dinner/${kind}/${kind}_${num}.webp`]?.default
}

// recipe_001.webp 가 추가되면 자동으로 사용된다. 없으면 팩 커버로 fallback.
const recipeGlob = import.meta.glob('../assets/sprites/recipe_*.webp', {
  eager: true, import: 'default',
}) as Record<string, string>
export const recipeSprite001: string | undefined = recipeGlob['../assets/sprites/recipe_001.webp']

// 이벤트 보스 일러스트: eventboss_*.webp. 없으면 undefined → 일반 보스 이미지 폴백.
const eventBossGlob = import.meta.glob<{ default: string }>(
  '../assets/sprites/eventboss_*.webp',
  { eager: true }
)
/** 이벤트 보스 일러스트. name 예: 'eventboss_001'. 파일 없으면 undefined. */
export function spriteForEventBoss(name: string): string | undefined {
  return eventBossGlob[`../assets/sprites/${name}.webp`]?.default
}

