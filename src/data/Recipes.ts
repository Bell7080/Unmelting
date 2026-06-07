/**
 * Recipes - Declarative chain-combo recipe book.
 *
 * The recipe list is data-first on purpose: future balancing, removals, or
 * deck-building unlock rules should be able to swap this table without touching
 * the hand UI or chain matcher. HandSystem owns the effect implementations that
 * correspond to each effect kind.
 */

import { HandCardId } from '@entities/HandCard'

export type RecipeEffectKind =
  | 'gain-wax-drop'
  | 'damage-all-field-enemies-1'
  | 'damage-all-field-enemies-2'
  | 'damage-all-field-enemies-5'
  | 'gain-coin-1'
  | 'draw-random-hand-1'
  | 'destroy-random-front-enemy'
  | 'convert-random-hazard-to-treasure'
  | 'collect-random-treasure'
  | 'convert-random-waiting-to-treasure'
  | 'clear-all-field-cards'
  | 'damage-front-enemies-2'
  | 'damage-front-enemies-3'
  | 'damage-front-enemies-5'
  | 'clear-front-cards'
  | 'collect-waiting-treasures'
  | 'gain-ember-3'
  | 'heal-5'
  | 'heal-3'
  | 'damage-split-field-4'
  | 'clear-all-field-traps'
  | 'damage-split-field-5'
  | 'destroy-all-front-enemies'
  | 'gain-ember-2'
  | 'shield-2-and-damage-field-1'
  | 'damage-split-field-2x2'
  | 'heal-by-player-attack'

export interface Recipe {
  id: string
  /** Display name shown when the recipe fires. */
  name: string
  /** Cards required (multiset). The chain must contain at least these. */
  ingredients: Partial<Record<HandCardId, number>>
  /** Total count of cards in the ingredients multiset (cached for sorting/UI). */
  totalCount: number
  effect: RecipeEffectKind
  /** Short Korean blurb shown in the activity log and compendium. */
  flavor: string
  /** 해금팩 해금 전까지 발동하지 않고 도감에서 ??? 로 표시된다. */
  runLocked?: boolean
}

function totalCount(ing: Partial<Record<HandCardId, number>>): number {
  return Object.values(ing).reduce((sum: number, n) => sum + (n ?? 0), 0)
}

function recipe(
  id: string,
  name: string,
  ingredients: Partial<Record<HandCardId, number>>,
  effect: RecipeEffectKind,
  flavor: string,
  runLocked?: boolean
): Recipe {
  return { id, name, ingredients, totalCount: totalCount(ingredients), effect, flavor, runLocked }
}

export const RECIPES: Recipe[] = [
  recipe('warmth', '따뜻함', { candle: 1, ember: 1 }, 'gain-wax-drop', '손패에 촛농 1장 획득'),
  recipe(
    'ignite',
    '점화',
    { match: 1, ember: 1 },
    'damage-all-field-enemies-1',
    '필드 모든 적에게 피해 1'
  ),
  recipe('dividend', '배당금', { coin: 3 }, 'gain-coin-1', '+1$'),
  recipe('shuffle', '셔플', { card: 2 }, 'draw-random-hand-1', '랜덤 손패 1장 획득'),
  recipe(
    'candle-smash',
    '양초 스매쉬',
    { 'wax-drop': 1, candle: 1 },
    'destroy-random-front-enemy',
    '전방의 랜덤 적 1장 처치'
  ),
  recipe(
    'mine-sweeper',
    '지뢰제거반',
    { chitin: 1, 'holy-water': 1 },
    'convert-random-hazard-to-treasure',
    '필드의 함정/저주/곰팡이 랜덤 1장을 보물상자로 변환'
  ),
  recipe(
    'locksmith',
    '열쇠공',
    { key: 2 },
    'collect-random-treasure',
    '필드 랜덤 보물상자 1장 획득'
  ),
  recipe(
    'greed',
    '탐욕',
    { key: 1, coin: 1 },
    'convert-random-waiting-to-treasure',
    '대기라인의 보물상자가 아닌 1칸을 보물상자로 변환'
  ),
  recipe(
    'step-by-step',
    '한 걸음씩',
    { 'wax-drop': 1, candle: 1, ember: 1, wax: 1 },
    'clear-all-field-cards',
    '필드의 모든 칸 제거'
  ),
  recipe('fuse', '도화선', { match: 2 }, 'damage-front-enemies-3', '전방 모든 적에게 피해 3'),
  recipe(
    'holy-flame',
    '성화',
    { 'holy-water': 1, ember: 1 },
    'clear-front-cards',
    '전방 모든 칸 제거'
  ),
  recipe(
    'smuggling',
    '밀매',
    { wax: 1, coin: 1 },
    'collect-waiting-treasures',
    '대기칸 모든 보물상자 획득'
  ),
  recipe('hot', '뜨거움', { ember: 2 }, 'damage-front-enemies-2', '전방의 모든 적에게 피해 2'),
  // --- 신규 레시피 (6개 — 해금팩으로 해금) ---
  recipe('backfire',      '역화',       { firework: 1, match: 1 },                     'damage-all-field-enemies-2', '필드 모든 적에게 피해 2',   true),
  recipe('rage',          '분노',       { 'sacrifice-candle': 1, ember: 1 },           'damage-front-enemies-5',     '전방 모든 적에게 피해 5',   true),
  recipe('flame-infusion','불꽃 주입',  { 'book-of-flames': 1, match: 1 },             'gain-ember-3',               '불씨 게이지 +3',            true),
  recipe('bond',          '결속',       { 'sacrifice-candle': 1, 'wax-drop': 1 },      'heal-5',                     '체력 5 회복',               true),
  recipe('smokescreen',   '연막',       { wax: 1, firework: 1 },                       'clear-front-cards',          '전방 모든 칸 제거',          true),
  recipe('mythic-flame',  '신화의 불꽃',{ levatein: 1, ember: 1, match: 1 },           'damage-all-field-enemies-5', '필드 모든 적에게 피해 5',   true),
  // --- 신규 카드(16~20) 레시피 ---
  recipe('glass-shards', '유리 파편',  { 'shield-bash': 1, 'hand-mirror': 1 },        'damage-split-field-4',    '필드 랜덤 적 전체 피해 4 분산'),
  recipe('blood-pact',   '혈약',       { 'sacrifice-shield': 1, 'wax-drop': 1 },      'heal-3',                  '체력 3 회복'),
  recipe('cleanse',      '청결',       { sweep: 1, 'holy-water': 1 },                 'clear-all-field-traps',   '필드 모든 함정 제거'),
  // --- 신규 카드(21~27) 레시피 ---
  recipe('fireworks-show', '불꽃놀이',  { chandelier: 1, firework: 1 },                'damage-split-field-5',         '필드 랜덤 적 전체 피해 5 분산', true),
  recipe('hospitality',    '대접',      { teacup: 1, 'wax-drop': 1 },                 'heal-5',                       '체력 5 회복',                   true),
  recipe('boiling-rage',   '끓는 분노', { teapot: 1, 'sacrifice-candle': 1 },         'destroy-all-front-enemies',    '전방 모든 적 처치',              true),
  recipe('bright-ceiling', '밝은 천장', { chandelier: 1, match: 1 },                  'gain-ember-2',                 '불씨 게이지 +2',                 true),
  recipe('flame-chain',    '불꽃 사슬', { chandelier: 1, shackles: 1 },               'shield-2-and-damage-field-1',  '방패 +2 · 필드 적 전체 피해 1', true),
  recipe('banquet',        '연회',      { teapot: 1, firework: 1 },                   'damage-split-field-2x2',       '필드 랜덤 적 피해 2 × 2회',      true),
  recipe('sweetness',      '달콤함',    { teacup: 1, 'sacrifice-shield': 1 },         'heal-by-player-attack',        '공격력만큼 체력 회복',            true),
]

/** Lookup helper for the renderer/log. */
export function getRecipeById(id: string): Recipe | undefined {
  return RECIPES.find((r) => r.id === id)
}
