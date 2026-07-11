/**
 * EnaKnowledgeAdapter - 실제 데이터 정의를 에나 RL 시뮬레이터용 전술 지식으로 변환한다.
 *
 * HandCards/Recipes/Relics/Trials/Jobs/Events/ShopPools의 선언형 데이터를 읽어
 * 각 손패의 사용 위치·타이밍·보스전 가치·트리플 가치·연계 가치를 자동 산출한다.
 * 실제 효과 실행기는 아니며, 정책망이 참고할 '수치화된 사전 지식'과 분석 리포트를 제공한다.
 */

import { HAND_CARD_DEFINITIONS, HAND_CARD_IDS } from '@data/HandCards'
import { RECIPES } from '@data/Recipes'
import { RELIC_DEFINITIONS, RELIC_IDS, relicDrawWeight } from '@data/Relics'
import { TRIAL_DEFINITIONS } from '@data/Trials'
import { JOBS } from '@data/Jobs'
import { EVENT_DEFINITIONS } from '@data/Events'
import { HAND_CARD_RARITY, SHOP_PACK_LABELS, SHOP_PACK_POOLS } from '@data/ShopPools'
import { altarPackBaseCost, regularShopPackBaseCost } from '@core/ShopPricing'
import type { HandCardDefinition, HandCardId, HandEffectTargeting } from '@entities/HandCard'
import type { RelicId } from '@data/Relics'

export interface EnaHandCardTactic {
  id: HandCardId
  name: string
  category: HandCardDefinition['category']
  rarity: string
  /** 필드 어느 행/대상에 쓰면 좋은지에 대한 자동 분석 문장. */
  usePosition: string
  /** 초반/위기/보스/상점 직전 등 어느 타이밍에 높은 가치인지. */
  timing: string
  /** 일반 전투 가치(위협 제거·회복·자원·경제 포함). */
  fieldValue: number
  /** 30/60/90/100F 보스처럼 단일 큰 위협에 대한 보존/사용 가치. */
  bossValue: number
  /** 3장 자동 합성 대기 가치. 높을수록 단일 사용보다 보존을 고려한다. */
  tripleValue: number
  /** 레시피·유물·직업·이벤트와의 연계 가치. */
  synergyValue: number
  /** 손패칸을 막거나 자해/즉시 턴흐름 등 위험 비용이 큰 정도. */
  liability: number
  /** 이 손패가 참여하는 레시피 ID 목록. */
  recipeIds: string[]
  /** 관련 유물 ID 목록. effect 텍스트 기반이라 신규 유물도 자동 포착된다. */
  relicIds: RelicId[]
  /** 학습/대사에 바로 넣을 수 있는 요약. */
  summary: string
}

export interface EnaEconomyModel {
  /** 현재 불빛 획득 선형 보정: 1 + turn×0.015. */
  lightTurnMultiplierAt30: number
  lightTurnMultiplierAt60: number
  lightTurnMultiplierAt90: number
  /** 일반 상점팩 시작 가격과 제단 가격대. */
  packBaseCosts: Record<string, number>
  /** 유물 평균 가격(지터 전 basePrice 기준). */
  averageRelicBasePrice: number
  /** 30/60/90F에서 평균 유물 대비 팩 가격이 얼마나 가파른지. */
  altarInflationRatio: Record<'30F' | '60F' | '90F', number>
  /** 지식 기반 기본 정책의 기대 등반 기준. 실제 모델 학습 전 회귀 목표로 쓴다. */
  baselineClimbTurn: number
}

export interface EnaShopKnowledge {
  packLabels: Record<string, string>
  packOptionCounts: Record<string, number>
  freeGiftRewards: Record<string, string>
}

export interface EnaKnowledgeBase {
  handCards: Record<HandCardId, EnaHandCardTactic>
  economy: EnaEconomyModel
  shop: EnaShopKnowledge
  trialPressure: number
  jobProfiles: Record<string, number>
  eventPressure: number
  globalSynergyNotes: string[]
}

const ATTACK_WORDS = ['피해', '처치', '파괴']
const CONTROL_WORDS = ['제거', '굳음', '정화', '변환']
const ECONOMY_WORDS = ['불빛', '$', '보물', '코인', '동전']
const RECOVERY_WORDS = ['체력', '방패', '회복']
const RESOURCE_WORDS = ['불씨', '콤보', '손패', '게이지']
const LIABILITY_WORDS = ['자해', '즉시', '흐름', '소모']

let cachedKnowledge: EnaKnowledgeBase | null = null

/** 데이터 테이블 전체를 한 번 스캔해 에나가 참고할 정적 지식 베이스를 만든다. */
export function buildEnaKnowledgeBase(): EnaKnowledgeBase {
  if (cachedKnowledge) return cachedKnowledge

  const handCards = Object.fromEntries(
    HAND_CARD_IDS.map((id) => [id, analyzeHandCard(id)])
  ) as Record<HandCardId, EnaHandCardTactic>

  const economy = analyzeEconomy()
  const shop = analyzeShopKnowledge()
  const trialPressure = TRIAL_DEFINITIONS.reduce((sum, trial) => sum + trialPressureValue(trial.effect), 0)
  const jobProfiles = Object.fromEntries(JOBS.map((job) => [job.id, job.damageBonus * 2 + job.healthBonus * 0.1 + job.spawnTreasure * 0.03 - job.spawnEnemy * 0.02 - job.spawnTrap * 0.02]))
  const eventPressure = Object.values(EVENT_DEFINITIONS).reduce((sum, event) => sum + event.choices.length * 0.4 + event.choices.filter((choice) => choice.requiresHand).length * 0.8, 0)
  const globalSynergyNotes = makeGlobalSynergyNotes(handCards, economy)

  cachedKnowledge = { handCards, economy, shop, trialPressure, jobProfiles, eventPressure, globalSynergyNotes }
  return cachedKnowledge
}

/** 특정 손패 ID의 자동 전술 리포트를 반환한다. 시뮬레이터와 테스트가 작은 단위로 쓰기 쉽다. */
export function getEnaHandCardTactic(id: HandCardId): EnaHandCardTactic {
  return buildEnaKnowledgeBase().handCards[id]
}

function analyzeHandCard(id: HandCardId): EnaHandCardTactic {
  const def = HAND_CARD_DEFINITIONS[id]
  const fullText = `${def.description} ${def.tripleDescription}`
  const recipeIds = RECIPES.filter((recipe) => (recipe.ingredients[id] ?? 0) > 0).map((recipe) => recipe.id)
  const relicIds = RELIC_IDS.filter((relicId) => mentionsAny(RELIC_DEFINITIONS[relicId].effect, [def.name, categoryKorean(def.category), id]))
  const recipeSynergy = recipeIds.reduce((sum, recipeId) => sum + recipeValue(recipeId), 0)
  const relicSynergy = relicIds.reduce((sum, relicId) => sum + relicDrawWeight(relicId) * 0.15 + RELIC_DEFINITIONS[relicId].basePrice / 2000, 0)
  const jobSynergy = JOBS.reduce((sum, job) => sum + (def.jobTags?.some((tag) => job.id.includes(tag)) ? 2 : 0), 0)
  const eventSynergy = Object.values(EVENT_DEFINITIONS).reduce((sum, event) => {
    const choices = event.choices.filter((choice) => choice.requiresHand === id || choice.effectLines.some((line) => line.includes(def.name)))
    return sum + choices.length * 1.5
  }, 0)

  const fieldValue = baseFieldValue(def) + textScore(fullText, ATTACK_WORDS, 1.5) + textScore(fullText, CONTROL_WORDS, 1.2) + textScore(fullText, RECOVERY_WORDS, 0.9) + textScore(fullText, ECONOMY_WORDS, 0.8)
  const bossValue = baseBossValue(def, fullText) + recipeIds.filter((recipeId) => recipeId.includes('fire') || recipeId.includes('hot') || recipeId.includes('fuse')).length * 0.6
  const tripleValue = tripleDeltaValue(def.targeting.base, def.targeting.triple, def.description, def.tripleDescription)
  const synergyValue = recipeSynergy + relicSynergy + jobSynergy + eventSynergy + tagSynergyValue(def)
  const liability = textScore(fullText, LIABILITY_WORDS, 1) + (def.dropSource === 'boss' ? 2 : 0) + (def.runLocked ? 0.4 : 0)
  const usePosition = describePosition(def)
  const timing = describeTiming(def, bossValue, tripleValue, liability)
  const summary = `${def.name}: ${usePosition} / ${timing} / 보스 ${bossValue.toFixed(1)} · 트리플 ${tripleValue.toFixed(1)} · 연계 ${synergyValue.toFixed(1)}`

  return {
    id,
    name: def.name,
    category: def.category,
    rarity: HAND_CARD_RARITY[id],
    usePosition,
    timing,
    fieldValue: round1(fieldValue),
    bossValue: round1(bossValue),
    tripleValue: round1(tripleValue),
    synergyValue: round1(synergyValue),
    liability: round1(liability),
    recipeIds,
    relicIds,
    summary,
  }
}

function baseFieldValue(def: HandCardDefinition): number {
  const target = def.targeting.base
  let value = def.dropWeight ? Math.log2(def.dropWeight + 1) * 0.25 : 0.2
  if (def.category === 'attack') value += 2.5
  if (def.category === 'control') value += 2
  if (def.category === 'recovery') value += 1.4
  if (def.category === 'tool') value += 1
  if (target.zone === 'front') value += 0.8
  if (target.zone === 'field') value += 0.5
  if (target.selection === 'all') value += 1.2
  if (target.selection === 'target') value += 0.4
  return value
}

function baseBossValue(def: HandCardDefinition, text: string): number {
  let value = def.category === 'attack' ? 3 : 0
  value += textScore(text, ATTACK_WORDS, 1.4)
  value += textScore(text, ['공', '적HP', '최대 체력'], 1)
  value += def.targeting.base.filter === 'enemy' ? 0.8 : 0
  value -= def.targeting.base.filter === 'trap' || def.targeting.base.filter === 'treasure' ? 1.2 : 0
  value -= text.includes('자해') ? 0.8 : 0
  return Math.max(0, value)
}

function tripleDeltaValue(base: HandEffectTargeting, triple: HandEffectTargeting, description: string, tripleDescription: string): number {
  let value = 0
  if (triple.selection === 'all' && base.selection !== 'all') value += 2.5
  if ((triple.countLimit ?? 99) > (base.countLimit ?? 1)) value += Math.min(3, ((triple.countLimit ?? 5) - (base.countLimit ?? 1)) * 0.5)
  if ((triple.maxSpan ?? 0) > (base.maxSpan ?? 0)) value += 1.8
  value += Math.max(0, maxNumber(tripleDescription) - maxNumber(description)) * 0.15
  return value
}

function describePosition(def: HandCardDefinition): string {
  const target = def.targeting.base
  const triple = def.targeting.triple
  const span = target.maxSpan ? `${target.maxSpan}칸 이하 ` : ''
  if (target.zone === 'front') return `전방 ${span}${filterKorean(target.filter)}에 우선 사용${triple.maxSpan && triple.maxSpan > (target.maxSpan ?? 0) ? `, 트리플은 ${triple.maxSpan}칸까지 대기 가치` : ''}`
  if (target.zone === 'field') return `필드 전체 중 ${filterKorean(target.filter)} ${target.selection === 'target' ? '고위협 대상 지정' : '자동 선택'}에 사용`
  if (target.zone === 'waiting') return `대기라인 ${filterKorean(target.filter)} 조작으로 다음 턴 위험/보상 설계`
  if (target.zone === 'self') return '현재 HP/방패/불씨/경제 패널이 부족할 때 즉시 사용'
  if (target.zone === 'hand') return '손패 콤보 게이지와 트리플 대기열을 보고 사용'
  return '특수 조건 충족 시 사용'
}

function describeTiming(def: HandCardDefinition, bossValue: number, tripleValue: number, liability: number): string {
  if (liability >= 2.5) return '손패칸 압박 또는 자해 비용이 커서 확실한 이득/보스 킬각에만 사용'
  if (bossValue >= 4) return '보스전 또는 2칸 이상 합쳐진 적 처리용으로 보존 가치 높음'
  if (tripleValue >= 2.5) return '3장 합성 가능성이 보이면 단일 사용보다 트리플 대기 우선'
  if (def.category === 'recovery') return '피해 직후 또는 보스 공격 카운트 직전에 사용'
  if (def.category === 'tool') return '상점 직전/보스 직전 자원 목표에 맞춰 사용'
  return '전방 위협이 턴 종료 피해로 이어지기 전에 사용'
}

function analyzeEconomy(): EnaEconomyModel {
  const averageRelicBasePrice = RELIC_IDS.reduce((sum, id) => sum + RELIC_DEFINITIONS[id].basePrice, 0) / RELIC_IDS.length
  // 팩 가격은 실게임과 같은 ShopPricing 공유 함수에서 산출한다(하드코딩 중복 제거).
  const packBaseCosts = {
    'basic-pack': regularShopPackBaseCost(10),
    'recipe-pack': regularShopPackBaseCost(10),
    'unlock-pack': regularShopPackBaseCost(10),
    'shop-pack-per-10f': regularShopPackBaseCost(20) - regularShopPackBaseCost(10),
    'altar-30': altarPackBaseCost(30),
    'altar-60': altarPackBaseCost(60),
    'altar-90': altarPackBaseCost(90),
    'resource-pack-weighted-options': SHOP_PACK_POOLS['resource-pack'].length,
  }
  return {
    lightTurnMultiplierAt30: lightTurnMultiplier(30),
    lightTurnMultiplierAt60: lightTurnMultiplier(60),
    lightTurnMultiplierAt90: lightTurnMultiplier(90),
    packBaseCosts,
    averageRelicBasePrice: round1(averageRelicBasePrice),
    altarInflationRatio: {
      '30F': round1(altarPackBaseCost(30) / averageRelicBasePrice),
      '60F': round1(altarPackBaseCost(60) / averageRelicBasePrice),
      '90F': round1(altarPackBaseCost(90) / averageRelicBasePrice),
    },
    baselineClimbTurn: 30,
  }
}

function analyzeShopKnowledge(): EnaShopKnowledge {
  // 무료카드는 index.ts의 현재 보상 후보와 같은 의미를 학습 prior로 노출한다.
  const freeGiftRewards = {
    light: '✦300',
    coin: '1$',
    heal: '체력 +5',
    combo: '콤보 게이지 +3',
    ember: '불씨 게이지 +3',
    hand: '랜덤 손패 +2',
  }
  return {
    packLabels: Object.fromEntries(Object.entries(SHOP_PACK_LABELS).map(([kind, label]) => [kind, `${label.title}/${label.effect}`])),
    packOptionCounts: Object.fromEntries(Object.entries(SHOP_PACK_POOLS).map(([kind, pool]) => [kind, pool.length])),
    freeGiftRewards,
  }
}

function makeGlobalSynergyNotes(handCards: Record<HandCardId, EnaHandCardTactic>, economy: EnaEconomyModel): string[] {
  const bestBoss = Object.values(handCards).sort((a, b) => b.bossValue - a.bossValue).slice(0, 3).map((card) => card.name).join(', ')
  const bestTriple = Object.values(handCards).sort((a, b) => b.tripleValue - a.tripleValue).slice(0, 3).map((card) => card.name).join(', ')
  return [
    `보스전 보존 우선 손패: ${bestBoss}`,
    `트리플 대기 가치가 큰 손패: ${bestTriple}`,
    `불빛 보정은 30F ${economy.lightTurnMultiplierAt30.toFixed(2)}배, 60F ${economy.lightTurnMultiplierAt60.toFixed(2)}배, 90F ${economy.lightTurnMultiplierAt90.toFixed(2)}배`,
  ]
}

/** 두 태그 목록의 겹침 수. 태그가 없는 쪽이 있으면 0. */
export function synergyTagOverlap(a: readonly string[] | undefined, b: readonly string[] | undefined): number {
  if (!a || !b || a.length === 0 || b.length === 0) return 0
  return a.filter((tag) => b.includes(tag)).length
}

/** 태그 기반 연계 가치: 카드↔같은 레시피 재료 카드↔태그 달린 유물의 synergyTags 겹침을 읽는다.
 *  새 유물이 데이터에 태그만 달고 들어와도 에나 지식/학습에 자동 반영되는 통로다. */
function tagSynergyValue(def: HandCardDefinition): number {
  const tags = def.synergyTags
  if (!tags || tags.length === 0) return 0
  // 같은 레시피에 함께 들어가는 다른 재료 카드와의 태그 겹침 — 조합 성향 보정.
  const recipeMateOverlap = RECIPES
    .filter((recipe) => (recipe.ingredients[def.id] ?? 0) > 0)
    .flatMap((recipe) => Object.keys(recipe.ingredients).filter((id) => id !== def.id))
    .reduce((sum, mateId) => sum + synergyTagOverlap(tags, HAND_CARD_DEFINITIONS[mateId as HandCardId]?.synergyTags), 0)
  // 태그를 선언한 유물과의 겹침 — 등장 가중치가 높은 유물일수록 실제 연계 확률이 높다.
  const relicOverlap = RELIC_IDS.reduce((sum, relicId) => {
    const overlap = synergyTagOverlap(tags, RELIC_DEFINITIONS[relicId].synergyTags)
    return sum + (overlap > 0 ? overlap * (0.3 + relicDrawWeight(relicId) * 0.05) : 0)
  }, 0)
  return recipeMateOverlap * 0.3 + relicOverlap
}

function recipeValue(recipeId: string): number {
  const recipe = RECIPES.find((entry) => entry.id === recipeId)
  if (!recipe) return 0
  return 0.6 + recipe.totalCount * 0.25 + textScore(`${recipe.name} ${recipe.flavor} ${recipe.effect}`, [...ATTACK_WORDS, ...CONTROL_WORDS, ...RESOURCE_WORDS], 0.35)
}

function trialPressureValue(text: string): number {
  return textScore(text, ['적', '함정', '+'], 0.7) - textScore(text, ['보물'], 0.4)
}

function lightTurnMultiplier(turn: number): number {
  // index.ts의 현재 경제 보정과 같은 선형식: 1 + 턴×0.015.
  return 1 + turn * 0.015
}

function mentionsAny(text: string, words: readonly string[]): boolean {
  return words.some((word) => word.length > 0 && text.includes(word))
}

function textScore(text: string, words: readonly string[], weight: number): number {
  return words.reduce((sum, word) => sum + (text.includes(word) ? weight : 0), 0)
}

function maxNumber(text: string): number {
  const nums = [...text.matchAll(/\d+(?:\.\d+)?/g)].map((match) => Number(match[0]))
  return nums.length > 0 ? Math.max(...nums) : 0
}

function categoryKorean(category: HandCardDefinition['category']): string {
  switch (category) {
    case 'attack': return '공격'
    case 'control': return '제어'
    case 'recovery': return '회복'
    case 'tool': return '도구'
  }
}

function filterKorean(filter: HandEffectTargeting['filter']): string {
  switch (filter) {
    case 'enemy': return '적'
    case 'trap': return '함정'
    case 'spore': return '포자'
    case 'treasure': return '보물'
    case 'enemy-or-treasure': return '적/보물'
    case 'turn-timer': return '턴 타이머 카드'
    case 'hazard': return '위험 카드'
    case 'flower': return '꽃'
    case 'flower-or-monsterflower': return '꽃/몬스터꽃'
    case 'any': return '모든 카드'
    case 'none': return '대상 없음'
  }
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}
