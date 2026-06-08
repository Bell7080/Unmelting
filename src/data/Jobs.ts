/**
 * Job definitions — one-time sub-event at game start.
 * Each job adjusts starting stats and/or spawn weights for the entire run.
 */

export interface JobDef {
  id: string
  name: string
  /** Inline SVG string shown in the symbol panel of the selection card. */
  symbolSvg: string
  /** Short description of the spawn-weight trait (shown in the card). */
  traits: string
  /** Stat bonus text (empty string for 가지지 못한 자). */
  stats: string
  /** Short flavour text. */
  flavor: string
  /** If true the card appears darkened with a lock and cannot be selected. */
  locked?: true
  // Numeric effects applied at run start:
  healthBonus: number
  damageBonus: number
  coinBonus: number
  spawnEnemy: number
  spawnTreasure: number
  spawnFlower: number
}

const symCombo = (stroke: string, fill: string) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" ` +
  `style="width:100%;height:100%;color:currentColor">` +
  `<path d="${fill}" fill="currentColor" opacity="0.35"/>` +
  `<path d="${stroke}" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>` +
  `</svg>`

// 기사 — shield with cross
const knightSvg = symCombo(
  'M12 2 L20 5 L20 12 C20 17 16 20.5 12 22 C8 20.5 4 17 4 12 L4 5 Z M12 9 L12 17 M9 13 L15 13',
  'M12 2 L20 5 L20 12 C20 17 16 20.5 12 22 C8 20.5 4 17 4 12 L4 5 Z'
)

// 마법사 — open book with flame above
const mageSvg = symCombo(
  'M12 3.5 C11.3 5 10 6 10 7.5 A2 2 0 0 0 14 7.5 C14 6 12.7 5 12 3.5 Z ' +
  'M5 10 L5 19 L12 17.5 L19 19 L19 10 C19 10 15.5 9 12 9 C8.5 9 5 10 5 10 Z ' +
  'M12 9 L12 17.5',
  'M5 10 L5 19 L12 17.5 L19 19 L19 10 C19 10 15.5 9 12 9 C8.5 9 5 10 5 10 Z ' +
  'M12 3.5 C11.3 5 10 6 10 7.5 A2 2 0 0 0 14 7.5 C14 6 12.7 5 12 3.5 Z'
)

// 귀족 — crown
const nobleSvg = symCombo(
  'M3 17 L3 19 L21 19 L21 17 L17 8 L13.5 13 L12 6 L10.5 13 L7 8 Z',
  'M3 17 L3 19 L21 19 L21 17 L17 8 L13.5 13 L12 6 L10.5 13 L7 8 Z'
)

// 정원사 — flower (5 petals + stem)
const gardenerSvg = symCombo(
  'M12 13 C12 13 9 11 9 8.5 A3 3 0 0 1 15 8.5 C15 11 12 13 12 13 Z ' +
  'M12 13 C12 13 14.8 11.2 17 12 A3 3 0 0 1 14.4 17.2 C12.8 16 12 13 12 13 Z ' +
  'M12 13 C12 13 13.8 15.8 12.4 18 A3 3 0 0 1 7.6 17.2 C8 15 12 13 12 13 Z ' +
  'M12 13 C12 13 9.2 15.8 7 15 A3 3 0 0 1 9.6 10 C11.2 11 12 13 12 13 Z ' +
  'M12 13 L12 21 M9 18 C9 18 12 17 15 19',
  'M12 10 A2.5 2.5 0 0 0 12 10 Z'
)

// 가지지 못한 자 — plain candle silhouette
const haveNotSvg = symCombo(
  'M10 6 L10 18 L14 18 L14 6 Z M10 6 C10 5 10.5 4 12 3 C13.5 4 14 5 14 6 ' +
  'M12 3 C11.6 4 11 5.2 11 6 M12 3 C12.4 4 13 5.2 13 6',
  'M10 6 L10 18 L14 18 L14 6 Z'
)

export const JOBS: JobDef[] = [
  {
    id: 'knight',
    name: '기사',
    symbolSvg: knightSvg,
    traits: '적 출현 확률 ↑↑',
    stats: '최대 체력 +5',
    flavor: '강철 의지로 역경을 정면으로 맞선다.',
    healthBonus: 5,
    damageBonus: 0,
    coinBonus: 0,
    spawnEnemy: 20,
    spawnTreasure: 0,
    spawnFlower: 0,
  },
  {
    id: 'mage',
    name: '마법사',
    symbolSvg: mageSvg,
    traits: '적 출현 확률 ↑',
    stats: '공격력 +1',
    flavor: '불꽃이 곧 나의 말이며 칼이다.',
    healthBonus: 0,
    damageBonus: 1,
    coinBonus: 0,
    spawnEnemy: 10,
    spawnTreasure: 0,
    spawnFlower: 0,
  },
  {
    id: 'noble',
    name: '귀족',
    symbolSvg: nobleSvg,
    traits: '보물 출현 확률 ↑↑',
    stats: '시작 화폐 +2$',
    flavor: '풍요로운 자리에서 더 풍요로움을 찾는다.',
    healthBonus: 0,
    damageBonus: 0,
    coinBonus: 2,
    spawnEnemy: 0,
    spawnTreasure: 20,
    spawnFlower: 0,
  },
  {
    id: 'gardener',
    name: '정원사',
    symbolSvg: gardenerSvg,
    traits: '꽃 출현 확률 ↑↑',
    stats: '최대 체력 +3',
    flavor: '자연은 기다리는 자에게 언제나 응답한다.',
    locked: true,
    healthBonus: 3,
    damageBonus: 0,
    coinBonus: 0,
    spawnEnemy: 0,
    spawnTreasure: 0,
    spawnFlower: 20,
  },
  {
    id: 'have-not',
    name: '가지지 못한 자',
    symbolSvg: haveNotSvg,
    traits: '변화 없음',
    stats: '',
    flavor: '아무것도 없지만, 꺼지지 않는다.',
    healthBonus: 0,
    damageBonus: 0,
    coinBonus: 0,
    spawnEnemy: 0,
    spawnTreasure: 0,
    spawnFlower: 0,
  },
]
