/**
 * Job definitions — one-time sub-event at game start.
 * Each job adjusts starting stats and/or spawn weights for the entire run.
 */

export interface JobDef {
  id: string
  name: string
  /** Illustration key (e.g. 'job_001'); resolved by spriteForJob. 없으면 심볼 placeholder. */
  illu: string
  /** Inline SVG string used as the illustration placeholder until art exists. */
  symbolSvg: string
  /** Spawn-weight trait description (HTML ok; rendered via innerHTML). Empty string for no trait. */
  traits: string
  /** Stat bonus text (HTML ok; use .job-up/.job-dn spans for color. Empty for none). */
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
  /** Trap spawn weight delta (positive = more traps, negative = fewer). */
  spawnTrap: number
  /** Shop price discount percentage (귀족 전용). */
  shopDiscountPct: number
  /** 불빛 획득 배율 조정 (%, e.g. +15 → scoreMultiplier *= 1.15). */
  scorePct: number
  /** 손패 한계 보너스 (양수만 허용). */
  handLimitBonus: number
  /** 불씨 한계 보너스 (양수: 증가, 음수: 감소). */
  emberLimitBonus: number
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

// 도적 — dagger crossed with a coin
const thiefSvg = symCombo(
  'M6 18 L15 9 L16.5 7.5 L18.5 5.5 L20 4 L18.5 5.5 L16.5 7.5 L15 9 Z ' +
  'M6 18 L4 20 L8 19 L9 18 M9 12 A4 4 0 1 0 9.1 12 Z',
  'M6 18 L15 9 L13 7 L4 16 Z'
)

// 죄수 — padlock (자물쇠)
const prisonerSvg = symCombo(
  'M5 11 L5 21 L19 21 L19 11 Z M8 11 L8 7 A4 4 0 0 1 16 7 L16 11',
  'M5 11 L5 21 L19 21 L19 11 Z'
)

export const JOBS: JobDef[] = [
  {
    id: 'have-not',
    name: '가지지 못한 자',
    illu: 'job_001',
    symbolSvg: haveNotSvg,
    traits: '',
    stats: '',
    flavor: '아무것도 가지지 못했지만 아무것도 잃지 않은 자.',
    healthBonus: 0,
    damageBonus: 0,
    coinBonus: 0,
    spawnEnemy: 0,
    spawnTreasure: 0,
    spawnFlower: 0,
    spawnTrap: 0,
    shopDiscountPct: 0,
    scorePct: 0,
    handLimitBonus: 0,
    emberLimitBonus: 0,
  },
  {
    id: 'knight',
    name: '기사',
    illu: 'job_002',
    symbolSvg: knightSvg,
    traits: '기사 카드 확률 증가',
    stats: '적 <span class="job-up">↑</span> 함정 <span class="job-dn">↓</span> · 체력 <span class="job-up">+5</span>',
    flavor: '노력과 결실은 반비례하는 법.',
    healthBonus: 5,
    damageBonus: 0,
    coinBonus: 0,
    spawnEnemy: 15,
    spawnTreasure: 0,
    spawnFlower: 0,
    spawnTrap: -10,
    shopDiscountPct: 0,
    scorePct: 0,
    handLimitBonus: 0,
    emberLimitBonus: 0,
  },
  {
    id: 'mage',
    name: '마법사',
    illu: 'job_003',
    symbolSvg: mageSvg,
    traits: '마법사 카드 확률 증가',
    stats: '적 <span class="job-up">↑</span> 함정 <span class="job-up">↑</span> · 체력 <span class="job-dn">-10</span> 공격 <span class="job-up">+1</span>',
    flavor: '지식을 탐구하고 빛을 찾으리.',
    healthBonus: -10,
    damageBonus: 1,
    coinBonus: 0,
    spawnEnemy: 10,
    spawnTreasure: 0,
    spawnFlower: 0,
    spawnTrap: 10,
    shopDiscountPct: 0,
    scorePct: 0,
    handLimitBonus: 0,
    emberLimitBonus: 0,
  },
  {
    id: 'noble',
    name: '귀족',
    illu: 'job_004',
    symbolSvg: nobleSvg,
    traits: '상점 15% 할인',
    stats: '보물 <span class="job-up">↑</span> · 체력 <span class="job-dn">-10</span> 불빛 <span class="job-up">+15%</span>',
    flavor: '인간의 탐욕은 그 끝을 모르고.',
    healthBonus: -10,
    damageBonus: 0,
    coinBonus: 0,
    spawnEnemy: 0,
    spawnTreasure: 5,
    spawnFlower: 0,
    spawnTrap: 0,
    shopDiscountPct: 15,
    scorePct: 15,
    handLimitBonus: 0,
    emberLimitBonus: 0,
  },
  {
    id: 'gardener',
    name: '정원사',
    illu: 'job_005',
    symbolSvg: gardenerSvg,
    traits: '꽃 시듦 -15%',
    stats: '꽃 <span class="job-up">↑</span> · 불씨 <span class="job-up">+2</span> 손패 <span class="job-up">+2</span> 불빛 <span class="job-dn">-10%</span>',
    flavor: '세상의 빛이 꺼진다 할지라도.',
    locked: true,
    healthBonus: 0,
    damageBonus: 0,
    coinBonus: 0,
    spawnEnemy: 0,
    spawnTreasure: 0,
    spawnFlower: 10,
    spawnTrap: 0,
    shopDiscountPct: 0,
    scorePct: -10,
    handLimitBonus: 2,
    emberLimitBonus: 2,
  },
  {
    id: 'thief',
    name: '도적',
    illu: 'job_006',
    symbolSvg: thiefSvg,
    traits: '함정 15% 확률로 무시',
    stats: '적 <span class="job-dn">↓</span> 함정 <span class="job-up">↑</span> 보물 <span class="job-up">↑</span> · 손패 <span class="job-up">+5</span> 불빛 <span class="job-dn">-5%</span>',
    flavor: '혼란과 절망 속에서 드디어 웃는구나.',
    locked: true,
    healthBonus: 0,
    damageBonus: 0,
    coinBonus: 0,
    spawnEnemy: -10,
    spawnTreasure: 10,
    spawnFlower: 0,
    spawnTrap: 10,
    shopDiscountPct: 0,
    scorePct: -5,
    handLimitBonus: 5,
    emberLimitBonus: 0,
  },
  {
    id: 'prisoner',
    name: '죄수',
    illu: 'job_007',
    symbolSvg: prisonerSvg,
    traits: '',
    stats: '적 <span class="job-up">↑</span> 함정 <span class="job-up">↑</span> · 불씨 <span class="job-dn">-5</span> 체력 <span class="job-up">+10</span> 불빛 <span class="job-up">+10%</span>',
    flavor: '위태로운 시련 앞에 선 죄수여, 빛을 밝혀라.',
    locked: true,
    healthBonus: 10,
    damageBonus: 0,
    coinBonus: 0,
    spawnEnemy: 15,
    spawnTreasure: 0,
    spawnFlower: 0,
    spawnTrap: 20,
    shopDiscountPct: 0,
    scorePct: 10,
    handLimitBonus: 0,
    emberLimitBonus: -5,
  },
]
