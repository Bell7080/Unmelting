/**
 * HandCardAdvisor - 에나의 손패 지원 판단을 전 손패 범용·데이터 주도로 계산하는 순수 스코어러.
 *
 * 하드코딩된 카드 목록 대신 HandCardDefinition(targeting/category/damageProfile/synergyTags)과
 * EnaKnowledgeAdapter의 자동 전술 수치를 읽는다. 새 손패는 데이터 테이블에 등록만 하면
 * 런타임 예지(CompanionForesight)·클러치·시뮬 교사 휴리스틱이 코드 수정 없이 함께 반영한다.
 * 모든 함수는 순수 함수로 유지해 런타임/헤드리스 시뮬/테스트가 같은 기준을 공유한다.
 *
 * 점수 체계: 근거별 고정 서열 대신 "기대 HP 절약/자원 가치" 환산(단위 ≈ 아낄 체력)으로 계산한다.
 * 청소=임박 병합 피해×성사 확률(즉사 후보는 최상위 고정), 처치=대상 공격력×반격 임박도,
 * 방어=흡수 기대 피해, 성냥=불씨 소멸 스폰 압박 비용, 회복=사망 확률 감소(저체력 비선형).
 * 기존 고정 서열은 동점 타이브레이크(ε)로만 남긴다.
 *
 * 레시피 완성각: 후보 카드가 보유 손패의 '마지막 재료'가 되어 해금 레시피를 완성하면,
 * 완성 효과를 같은 환산 축(불씨/회복/피해/청소)으로 보수 매핑해 RECIPE_SUPPORT_DISCOUNT 할인 가산한다.
 * 간접 경로라 같은 필요를 채우는 깡 카드(직접 효과)가 있으면 항상 그쪽이 이긴다.
 */

import { HAND_CARD_DEFINITIONS } from '@data/HandCards'
import type { HandCardDefinition, HandCardId } from '@entities/HandCard'
import { RECIPES } from '@data/Recipes'
import type { RecipeEffectKind } from '@data/Recipes'
import { getEnaHandCardTactic } from '@/rl/EnaKnowledgeAdapter'

/** 지원 근거의 큰 분류 — 대사/로그가 추천 성격을 구분하는 데 쓴다. */
export type SupportFit =
  | 'cleanup'
  | 'spore'
  | 'attack'
  | 'defense'
  | 'recovery'
  | 'ember'
  | 'chip'
  | 'boss'
  | 'treasure'

/** RL 피팅이 조정 가능한 역할별 가중 스칼라(기본 1.0 = 무변화). 환산값에 곱해 읽는다. */
export interface SupportRoleWeights {
  cleanup: number
  attack: number
  defense: number
  resource: number
  recovery: number
}

/** fit → 피팅 역할 축 매핑. 5개 스칼라가 전 fit을 덮도록 유지한다. */
const FIT_ROLE: Record<SupportFit, keyof SupportRoleWeights> = {
  cleanup: 'cleanup',
  spore: 'cleanup',
  attack: 'attack',
  boss: 'attack',
  chip: 'attack',
  defense: 'defense',
  ember: 'resource',
  treasure: 'resource',
  recovery: 'recovery',
}

/** 레일 예고 큐(다음 리필 카드) 요약 — 같은 위협이 더 오면 역할 가치를 보정한다. */
export interface IncomingRefillSummary {
  webs: number
  spores: number
  enemies: number
}

/** 판단에 필요한 최소 상황 스냅샷. 보드 표현(런타임 Lane/시뮬 배열)과 무관한 수치만 받는다. */
export interface SupportSituation {
  playerAttack: number
  playerHealth: number
  playerMaxHealth: number
  playerShield?: number
  /** 불씨가 꺼지기 직전인가 — 임계값은 호출부(런타임 1 이하/시뮬 3 이하)가 정한다. */
  emberLow?: boolean
  /** 전방에 이미 서 있는 병합 거미줄의 최대 폭(2·3칸). 1 이하면 위협 아님. */
  frontWideWebSpan?: number
  /** 다음 전방 인접 병합 추정(CompanionForesight 공유 판정 결과와 같은 형태). */
  webMerge?: { mergedSize: number; mergingOneWebs: number }
  /** 필드 전체의 1칸 거미줄 수 — 병합각이 없어도 '많이 널렸으면' 광역 청소 근거가 된다. */
  fieldOneWebCount?: number
  /** 런 단위 함정 피해 보너스(시련 '역경' 등) — 거미줄/포자 실효 피해 환산에 더한다. */
  trapDamageBonus?: number
  /** 전염 카운트가 임박한 포자 존재. */
  sporeReady?: boolean
  /** 전방/대기 1칸의 강적(합체 또는 고체력). attack/attackInTurns는 실효 공격력·반격 임박 턴. */
  strongEnemy?: { health: number; atFront: boolean; attack?: number; attackInTurns?: number }
  bossActive?: boolean
  /** 필드에 열 수단 없는 보물이 쌓여 있는가. */
  treasureLocked?: boolean
  /** 처치각이 없는 비전방 강적에 피해 누적 카드를 허용(시뮬 교사 휴리스틱용). */
  allowChipDamage?: boolean
  /** 플레이어가 이미 든 손패 — 같은 카드는 건네지 않고, 같은 역할 보유 시 해당 근거를 접는다. */
  heldCardIds?: readonly HandCardId[]
  /** 비합체 보유 장수 맵. 제공되면 '정확히 2장 보유' 카드만 트리플 완성각으로 지급을 허용한다. */
  heldCardCounts?: Readonly<Partial<Record<HandCardId, number>>>
  /** 강화팩 등 단일 사용 flat 피해 보너스(HandSystem enhancements.singleBonus) — 실효 처치 계산용. */
  handSingleBonus?: Readonly<Partial<Record<HandCardId, number>>>
  /** 레일 예고 큐 요약 — 다음 1~2턴에 같은 위협이 더 오면 청소/정화 가치를 보정한다. */
  incomingRefill?: IncomingRefillSummary
  /** 보유 유물의 synergyTags 평탄화 목록 — 태그 겹침 가점의 근거. */
  ownedRelicTags?: readonly string[]
  /** RL 피팅 역할 가중(EnaDisposition.supportRoleWeights). 생략/1.0 = 무변화. */
  supportRoleWeights?: SupportRoleWeights
  /** 이번 런에서 발동 가능한 해금 레시피 ID(runLocked 해제분). 기본 해금 레시피는 항상 본다.
   *  런타임은 CompanionForesight가 gameState.unlockedRecipeIds로 채우고, 시뮬은 레시피 해금 모델이 없어 생략한다. */
  unlockedRecipeIds?: ReadonlySet<string>
}

export interface SupportRanking {
  cardId: HandCardId
  score: number
  fit: SupportFit
  /** 대사 슬롯에 그대로 넣는 짧은 명사구(실제 효과 기반). */
  reason: string
  /** 로그/학습 trace용 자세한 근거 문장. */
  detail: string
}

// ── 기대 HP 환산 상수 ──────────────────────────────────────────────────────
/** 3칸 병합(즉사급) 저지의 고정 최상위 가치 — 어떤 단일 위협 환산보다 크게 둔다. */
const LETHAL_PREVENT_VALUE = 30
/** 인접 병합각이 실제로 성사될 보수 확률(레일 하강/플레이어 개입 여지 반영). */
const WEB_MERGE_CHANCE = 0.8
/** 불씨 소멸 시 스폰 압박(적·함정 가중 급증 + 적 선공) 비용의 HP 환산 근사. */
const EMBER_PRESSURE_VALUE = 7
/** 처치 자체의 템포 가치(반격 흡수 외 — 레일 자리 확보/드롭). */
const KILL_TEMPO_VALUE = 2
/** 열 수단 없는 보물의 기대 보상(손패 드롭) HP 환산 근사. */
const TREASURE_VALUE = 3
/** 1칸 거미줄이 '많이 널렸다'고 보는 기준 — 병합각 없이도 광역 청소를 여는 문턱. */
export const WEB_FIELD_CLUTTER_THRESHOLD = 4
/** 레시피 완성각 가산의 할인 상수 — 건넨 뒤 체인으로 발동해야 실현되는 지연/순서 리스크를 반영해,
 *  같은 필요를 채우는 깡 카드(직접 효과)가 있으면 항상 그쪽이 이기도록 레시피 환산값을 깎는다. */
export const RECIPE_SUPPORT_DISCOUNT = 0.55
/** 필요 축에 매핑되지 않는 레시피 효과(재화/드로우/보물 변환 등)의 소량 고정 가산(할인 전). */
const RECIPE_GENERIC_VALUE = 2

/** 기존 고정 서열의 잔재 — 환산값이 같을 때만 순서를 가르는 ε 타이브레이크. */
const FIT_TIEBREAK: Record<SupportFit, number> = {
  cleanup: 0.09,
  spore: 0.08,
  ember: 0.07,
  attack: 0.06,
  boss: 0.05,
  recovery: 0.04,
  defense: 0.03,
  treasure: 0.02,
  chip: 0.01,
}

/**
 * 단일 대상 즉시 피해의 보수 근사: floor(atkMult×공격력)+flat.
 * 실제 공식은 HandSystem이 소유한다 — damageProfile은 그 공식의 파라미터 사본이며,
 * 무작위/조건부 피해(deterministic=false)는 확정 처치 계산에서 제외한다.
 */
export function estimateHandCardDamage(id: HandCardId, attack: number, merged: boolean = false): number | null {
  const profile = HAND_CARD_DEFINITIONS[id]?.damageProfile
  if (!profile || !profile.deterministic) return null
  const formula = merged ? profile.triple : profile.base
  return Math.floor(formula.atkMult * attack) + formula.flat
}

/** description에서 `방패 +N`을 읽는다(트리플 텍스트 제외 — 단일 지급 기준 보수 평가). */
function shieldGain(def: HandCardDefinition): number {
  const match = def.description.match(/방패 \+(\d+)/)
  return match ? Number(match[1]) : 0
}

/** 회복 카드 판정 — recovery 카테고리에서 실제로 체력을 다루는 카드만(자해 카드는 저체력에 제외). */
function isHealCard(def: HandCardDefinition): boolean {
  return def.category === 'recovery' && def.description.includes('체력') && !def.description.includes('자해')
}

/** 전방 넓은(span 이상) 함정을 한 장 제거할 수 있는 카드(키틴류). */
function canRemoveWideFrontTrap(def: HandCardDefinition, span: number): boolean {
  const base = def.targeting.base
  return base.zone === 'front' && base.filter === 'trap' && base.selection === 'target' && (base.maxSpan ?? 99) >= span
}

/** 필드의 1칸 함정들을 일괄 제거할 수 있는 카드(청소류). */
function canSweepFieldTraps(def: HandCardDefinition): boolean {
  const base = def.targeting.base
  return base.filter === 'trap' && base.selection === 'all'
}

/** 병합 전 1칸 거미줄 위협을 스스로 처리할 수 있는가 — 보유 시 청소 지원을 접는 판정.
 *  일괄 청소뿐 아니라 함정 1장 제거(키틴류)도 병합을 선제 차단할 수 있어 포함한다. */
function canHandleMergingOneWebs(def: HandCardDefinition): boolean {
  const base = def.targeting.base
  return canSweepFieldTraps(def) || (base.filter === 'trap' && base.selection === 'target' && (base.maxSpan ?? 99) >= 1)
}

/** 포자 정화 카드(성수류) — filter가 spore인 카드만. */
function canCleanseSpores(def: HandCardDefinition): boolean {
  return def.targeting.base.filter === 'spore'
}

/** 전방 위협에 맞서 템포를 버는 방어 카드: 굳음(턴 타이머) 또는 전방 공격+방패 확보. */
function isFrontDefenseCard(def: HandCardDefinition): boolean {
  const base = def.targeting.base
  if (base.zone !== 'front') return false
  return base.filter === 'turn-timer' || shieldGain(def) > 0
}

/** 불씨 게이지를 채우는 카드(성냥류). */
function refillsEmber(def: HandCardDefinition): boolean {
  return def.description.includes('불씨 게이지 +')
}

/** 잠긴/방치된 보물을 여는 카드(열쇠류). */
function opensTreasure(def: HandCardDefinition): boolean {
  return def.targeting.base.filter === 'treasure'
}

/** 강적 처치 후보 판정: 확정 피해 공식(+강화팩 flat 보너스) + 대상 도달 가능(전방 전용은 전방 위협에만). */
function killCandidateDamage(def: HandCardDefinition, situation: SupportSituation): number | null {
  const enemy = situation.strongEnemy
  if (!enemy || def.category !== 'attack') return null
  const base = def.targeting.base
  if (base.filter !== 'enemy') return null
  if (base.zone !== 'field' && !(base.zone === 'front' && enemy.atFront)) return null
  const damage = estimateHandCardDamage(def.id, situation.playerAttack)
  if (damage === null) return null
  // 강화팩 단일 보너스는 HandSystem에서 flat 합산되므로 실효 처치 계산에도 더한다.
  return damage + (situation.handSingleBonus?.[def.id] ?? 0)
}

/** 강적 실효 공격력 — 스냅샷이 못 채우면 체력 기반 보수 추정으로 폴백한다. */
function strongEnemyAttack(enemy: NonNullable<SupportSituation['strongEnemy']>): number {
  return enemy.attack ?? Math.max(2, Math.ceil(enemy.health / 4))
}

/** 반격 임박도(0~1): 전방·비굳음이면 다음 적 페이즈에 확정 반격(1.0), 굳음/대기 중이면 할인. */
function enemyImminence(enemy: NonNullable<SupportSituation['strongEnemy']>): number {
  if (!enemy.atFront) return 0.5
  const turns = enemy.attackInTurns ?? 0
  return Math.max(0.4, 1 - 0.3 * Math.max(0, turns))
}

/** 거미줄 실효 피해: 2칸 5(+런 보너스), 1칸 1(+런 보너스). 3칸 이상은 즉사급이라 별도 고정값을 쓴다. */
function effectiveWebDamage(span: number, trapDamageBonus: number): number {
  if (span >= 2) return 5 + trapDamageBonus
  return 1 + trapDamageBonus
}

function tagOverlapCount(a: readonly string[] | undefined, b: readonly string[] | undefined): number {
  if (!a || !b || a.length === 0 || b.length === 0) return 0
  return a.filter((tag) => b.includes(tag)).length
}

interface FitPlan {
  fit: SupportFit
  fitScore: number
  reason: string
  detail: string
}

/** 카드 한 장이 현재 상황에서 가지는 가장 강한 근거를 고른다(근거 없으면 null → 추천 제외). */
function bestFitFor(def: HandCardDefinition, situation: SupportSituation, killAvailable: boolean, holds: (test: (d: HandCardDefinition) => boolean) => boolean): FitPlan | null {
  const plans: FitPlan[] = []
  const wideSpan = situation.frontWideWebSpan ?? 0
  const trapBonus = Math.max(0, situation.trapDamageBonus ?? 0)
  const incoming = situation.incomingRefill
  const mergeLethal = (situation.webMerge?.mergedSize ?? 0) >= 3

  // 청소: 전방 넓은 병합 거미줄은 직접 제거, 인접 병합 예정 1칸들은 일괄 청소.
  // 이미 완성된 3칸 거미줄은 단일 지급 카드(키틴 단일 폭 2)로 못 치우므로 wideSpan=2일 때만 지원각이다.
  if (wideSpan === 2 && canRemoveWideFrontTrap(def, wideSpan) && !holds((d) => canRemoveWideFrontTrap(d, wideSpan))) {
    // 2칸이 1칸과 합쳐져 즉사급 3칸이 될 각이면 최상위 고정, 아니면 서 있는 2칸의 실효 피해 절약.
    let value = mergeLethal ? LETHAL_PREVENT_VALUE : effectiveWebDamage(wideSpan, trapBonus) * 0.6
    // 예고 큐에 거미줄이 더 오면 1장 제거의 상대 가치는 소폭 낮아진다(광역 청소를 한 턴 미루는 쪽이 이득).
    if (!mergeLethal && (incoming?.webs ?? 0) > 0) value *= 0.9
    plans.push({
      fit: 'cleanup',
      fitScore: value,
      reason: '커지기 전 거미줄 제거',
      detail: mergeLethal
        ? '전방 2칸 거미줄에 1칸 거미줄이 합류해 3칸 위협이 될 수 있음'
        : `전방 병합 거미줄은 ${def.name} 손패로 직접 제거 가능`,
    })
  }
  if (canSweepFieldTraps(def) && !holds(canHandleMergingOneWebs)) {
    const merge = situation.webMerge
    const clutter = situation.fieldOneWebCount ?? 0
    // 광역 청소 가치 = max(임박 병합 저지, 필드 오염 청소). 예고 큐 거미줄은 광역 청소에만 가점.
    const incomingBonus = (incoming?.webs ?? 0) * effectiveWebDamage(1, trapBonus) * 0.5
    let value = 0
    let detail = ''
    if ((merge?.mergingOneWebs ?? 0) >= 2) {
      value = mergeLethal ? LETHAL_PREVENT_VALUE : effectiveWebDamage(merge!.mergedSize, trapBonus) * WEB_MERGE_CHANCE
      detail = '1칸 거미줄들이 다음 전방에서 병합될 가능성이 높음'
    }
    if (clutter >= WEB_FIELD_CLUTTER_THRESHOLD) {
      const clutterValue = clutter * effectiveWebDamage(1, trapBonus) * 0.8
      if (clutterValue > value) {
        value = clutterValue
        detail = `필드에 1칸 거미줄이 ${clutter}장 널려 광역 청소 가치가 높음`
      }
    }
    if (value > 0) {
      plans.push({ fit: 'cleanup', fitScore: value + incomingBonus, reason: '1칸 거미줄 미리 청소', detail })
    }
  }
  if (situation.sporeReady && canCleanseSpores(def) && !holds(canCleanseSpores)) {
    // 전염 임박 포자: 기대 감염 ~2칸 × 실효 밟음 피해 + 보드 오염 비용. 예고 포자는 정화 가치 가점.
    const value = effectiveWebDamage(1, trapBonus) * 2 + 1 + (incoming?.spores ?? 0) * 0.5
    plans.push({
      fit: 'spore',
      fitScore: value,
      reason: '퍼지기 전 포자 정화',
      detail: '포자 전염 카운트가 가까워 필드 정화 가치가 높음',
    })
  }
  if (situation.emberLow && refillsEmber(def) && !holds(refillsEmber)) {
    plans.push({
      fit: 'ember',
      fitScore: EMBER_PRESSURE_VALUE,
      reason: '불씨 게이지 보충',
      detail: '불씨가 꺼지기 직전이라 게이지 보충 가치가 높음',
    })
  }
  const enemy = situation.strongEnemy
  if (enemy) {
    const attack = strongEnemyAttack(enemy)
    const imminence = enemyImminence(enemy)
    const damage = killCandidateDamage(def, situation)
    if (damage !== null && damage >= enemy.health) {
      // 처치 가치 = 대상 공격력 × 반격 임박도 + 템포. 과잉 피해가 적을수록 '딱 맞는 도움'(기존 최소 과잉 선택 계승).
      const overkill = damage - enemy.health
      plans.push({
        fit: 'attack',
        fitScore: KILL_TEMPO_VALUE + attack * imminence - Math.min(4, overkill * 0.3),
        reason: `피해 ${damage}의 마무리 한 수`,
        detail: `전방/대기라인 강적을 피해 ${damage} 손패로 처치 가능`,
      })
    } else if (!killAvailable && enemy.atFront && isFrontDefenseCard(def) && !holds(isFrontDefenseCard)) {
      const freeze = def.targeting.base.filter === 'turn-timer'
      // 방어 가치 = 흡수 기대 피해: 굳음은 반격 1회 전체, 방패는 min(방패량, 공격력) + 부수 피해.
      const chip = estimateHandCardDamage(def.id, situation.playerAttack) ?? 0
      const value = freeze
        ? attack * imminence
        : Math.min(shieldGain(def), attack) + chip * 0.2
      plans.push({
        fit: 'defense',
        fitScore: value,
        reason: freeze ? '반격을 늦추는 굳음' : '방패로 버티기',
        detail: freeze
          ? `처치가 어려운 전방 강적의 반격 타이밍을 ${def.name}의 굳음으로 늦출 수 있음`
          : '처치가 어려운 전방 강적에게 피해를 주며 방패를 확보할 수 있음',
      })
    } else if (!killAvailable && !enemy.atFront && situation.allowChipDamage && damage !== null && def.targeting.base.zone === 'field') {
      plans.push({
        fit: 'chip',
        fitScore: 1.5 + Math.min(3, damage * 0.15),
        reason: '미리 쌓는 피해',
        detail: '즉시 처치는 어렵지만 강적에게 미리 피해를 쌓아둘 수 있음',
      })
    }
  }
  if (situation.bossActive && def.category === 'attack' && def.targeting.base.filter === 'enemy') {
    const bossValue = getEnaHandCardTactic(def.id).bossValue
    plans.push({
      fit: 'boss',
      fitScore: 3 + Math.min(3, bossValue * 0.3),
      reason: '보스전 대비 화력',
      detail: '보스전 단일 대상 화력으로 보존 가치가 높음',
    })
  }
  if (situation.playerMaxHealth > 0 && situation.playerHealth / situation.playerMaxHealth <= 0.45 && isHealCard(def) && !holds(isHealCard)) {
    // 회복 가치 = 사망 확률 감소: 체력이 낮을수록 비선형((1-비율)²)으로 커진다.
    const hpRatio = situation.playerHealth / situation.playerMaxHealth
    plans.push({
      fit: 'recovery',
      fitScore: situation.playerMaxHealth * (1 - hpRatio) * (1 - hpRatio) * 0.6,
      reason: '깎인 체력 회복',
      detail: '체력이 낮아 회복 손패 가치가 높음',
    })
  }
  if (situation.treasureLocked && opensTreasure(def) && !holds(opensTreasure)) {
    plans.push({
      fit: 'treasure',
      fitScore: TREASURE_VALUE,
      reason: '보물상자 회수',
      detail: '필드 보물을 열 수단이 없어 회수 손패 가치가 높음',
    })
  }
  if (plans.length === 0) return null
  // 역할 가중(RL 피팅 노출)을 곱한 뒤, 기존 고정 서열은 ε로만 동점을 가른다.
  const weights = situation.supportRoleWeights
  const weighted = plans.map((plan) => ({
    ...plan,
    fitScore: plan.fitScore * (weights?.[FIT_ROLE[plan.fit]] ?? 1) + FIT_TIEBREAK[plan.fit],
  }))
  return weighted.sort((a, b) => b.fitScore - a.fitScore)[0]
}

/** 비합체 보유 장수: counts 맵이 오면 그대로, 아니면 heldCardIds 존재 여부(1/0)로 폴백한다. */
function heldCountOf(situation: SupportSituation, heldSet: ReadonlySet<HandCardId>, id: HandCardId): number {
  const counts = situation.heldCardCounts
  if (counts) return counts[id] ?? 0
  return heldSet.has(id) ? 1 : 0
}

/** 지급 제외 판정: 보유 카드는 건네지 않되, counts가 '정확히 2장'을 보이면 트리플 완성각으로 허용한다. */
function isHandoutBlocked(situation: SupportSituation, heldSet: ReadonlySet<HandCardId>, id: HandCardId): boolean {
  const count = heldCountOf(situation, heldSet, id)
  if (count === 0) return false
  return !(situation.heldCardCounts && count === 2)
}

// ── 레시피 완성각 ──────────────────────────────────────────────────────────
/** 받침 유무로 '와/과'를 붙인다 — reason 구가 대사 슬롯에 그대로 들어가므로 조사만 맞춘다. */
function withJosaWaGwa(word: string): string {
  const code = word.charCodeAt(word.length - 1)
  if (code < 0xac00 || code > 0xd7a3) return `${word}와`
  return (code - 0xac00) % 28 === 0 ? `${word}와` : `${word}과`
}

type RecipeAxis = 'ember' | 'recovery' | 'attack' | 'cleanup' | 'generic'

/** 레시피 효과 id → 기존 환산 축 보수 매핑. 실제 효과 구현은 HandSystem 소유 — 여기서는
 *  '어느 필요를 채우는가'만 근사하며, 매핑에 없는 새 효과는 generic 소량 가산으로 떨어진다. */
function recipeEffectAxis(effect: RecipeEffectKind): RecipeAxis {
  if (effect.startsWith('gain-ember')) return 'ember'
  if (effect.startsWith('heal-')) return 'recovery'
  // clear-* 는 함정을 포함한 광역 제거라 청소 축으로 본다(적 제거 겸용은 보수적으로 청소만 계상).
  if (effect === 'clear-all-field-traps' || effect === 'convert-random-hazard-to-treasure') return 'cleanup'
  if (effect === 'clear-front-cards' || effect === 'clear-all-field-cards') return 'cleanup'
  if (effect.startsWith('damage-') || effect.startsWith('destroy-') || effect.endsWith('-atk') || effect === 'hot-water-maxhp') return 'attack'
  return 'generic'
}

interface RecipeAxisValue {
  fit: SupportFit
  /** 할인 전 기대 가치(기존 직접 근거와 같은 환산식의 보수 근사). */
  value: number
  /** 필요 축과 맞아 단독 추천 근거가 될 수 있는가 — generic/필요 불일치는 직접 근거에 얹기만 한다. */
  standalone: boolean
}

/** 완성 레시피 효과의 기대 가치: 현재 필요(불씨/저체력/강적/거미줄)와 맞을 때만 축 환산값을 쓰고,
 *  아니면 완성 자체의 범용 가치를 소량 고정으로 남긴다. 발동까지의 순서 리스크는 할인 상수가 흡수한다. */
function recipeAxisValue(axis: RecipeAxis, situation: SupportSituation): RecipeAxisValue {
  switch (axis) {
    case 'ember':
      if (situation.emberLow) return { fit: 'ember', value: EMBER_PRESSURE_VALUE, standalone: true }
      break
    case 'recovery': {
      const ratio = situation.playerMaxHealth > 0 ? situation.playerHealth / situation.playerMaxHealth : 1
      if (ratio <= 0.45) {
        return { fit: 'recovery', value: situation.playerMaxHealth * (1 - ratio) * (1 - ratio) * 0.6, standalone: true }
      }
      break
    }
    case 'attack': {
      const enemy = situation.strongEnemy
      if (enemy) return { fit: 'attack', value: strongEnemyAttack(enemy) * enemyImminence(enemy), standalone: true }
      break
    }
    case 'cleanup': {
      const trapBonus = Math.max(0, situation.trapDamageBonus ?? 0)
      const merge = situation.webMerge
      if ((merge?.mergingOneWebs ?? 0) >= 2 || (situation.frontWideWebSpan ?? 0) >= 2) {
        const value = (merge?.mergedSize ?? 0) >= 3 ? LETHAL_PREVENT_VALUE : effectiveWebDamage(2, trapBonus) * WEB_MERGE_CHANCE
        return { fit: 'cleanup', value, standalone: true }
      }
      const clutter = situation.fieldOneWebCount ?? 0
      if (clutter >= WEB_FIELD_CLUTTER_THRESHOLD) {
        return { fit: 'cleanup', value: clutter * effectiveWebDamage(1, trapBonus) * 0.8, standalone: true }
      }
      break
    }
  }
  return { fit: 'treasure', value: RECIPE_GENERIC_VALUE, standalone: false }
}

interface RecipeSupportBonus {
  fit: SupportFit
  /** 할인·역할 가중 적용 후 최종 가산치. */
  score: number
  reason: string
  detail: string
  standalone: boolean
}

/** 후보 카드가 '마지막 재료'가 되어 보유 손패와 함께 해금 레시피를 완성하는 경우의 가산.
 *  멀티셋 완성만 본다(체인/손패 순서 실현성은 미검사 — 그 리스크는 RECIPE_SUPPORT_DISCOUNT가 흡수). */
function recipeCompletionBonus(def: HandCardDefinition, situation: SupportSituation, heldSet: ReadonlySet<HandCardId>): RecipeSupportBonus | null {
  let best: RecipeSupportBonus | null = null
  for (const recipe of RECIPES) {
    // 해금 판정: runLocked 레시피는 unlockedRecipeIds에 있을 때만, 기본 레시피는 항상 활성.
    if (recipe.runLocked && !situation.unlockedRecipeIds?.has(recipe.id)) continue
    const needSelf = recipe.ingredients[def.id]
    if (!needSelf) continue
    // 이 카드 1장이 마지막 재료가 되는 경우만 완성각(이미 충족·2장 이상 부족은 제외).
    if (heldCountOf(situation, heldSet, def.id) !== needSelf - 1) continue
    const othersReady = Object.entries(recipe.ingredients)
      .every(([id, need]) => id === def.id || heldCountOf(situation, heldSet, id as HandCardId) >= (need ?? 0))
    if (!othersReady) continue
    const axis = recipeAxisValue(recipeEffectAxis(recipe.effect), situation)
    const weight = situation.supportRoleWeights?.[FIT_ROLE[axis.fit]] ?? 1
    const score = axis.value * RECIPE_SUPPORT_DISCOUNT * weight
    if (best && best.score >= score) continue
    const partners = Object.keys(recipe.ingredients)
      .filter((id) => id !== def.id)
      .map((id) => HAND_CARD_DEFINITIONS[id as HandCardId]?.name ?? id)
    const lead = partners.length > 0 ? `${withJosaWaGwa(partners.join('·'))} ` : ''
    best = {
      fit: axis.fit,
      score,
      standalone: axis.standalone,
      reason: `${lead}${recipe.name} 완성각`,
      detail: `${recipe.name} 레시피(${recipe.flavor})가 이 손패로 완성 가능`,
    }
  }
  return best
}

/**
 * 상황에 맞는 지원 손패 순위표. 해금 풀 안에서만 고르며, 플레이어가 이미 든 카드와
 * 같은 역할을 이미 보유한 근거는 제외한다(단, 정확히 2장 보유 카드는 트리플 완성각으로 허용+가점).
 * 점수 = 기대 HP 환산 근거 + 지식 전술 수치 + 태그 겹침 + 트리플 완성 가점 - liability.
 */
export function rankSupportCards(situation: SupportSituation, unlockedCardIds: readonly HandCardId[]): SupportRanking[] {
  const heldSet = new Set(situation.heldCardIds ?? [])
  const heldDefs = [...heldSet].map((id) => HAND_CARD_DEFINITIONS[id]).filter((def): def is HandCardDefinition => !!def)
  const holds = (test: (d: HandCardDefinition) => boolean): boolean => heldDefs.some(test)

  // 방어 근거는 '처치각이 전혀 없을 때'만 연다(기존 killSupport 우선 규칙 계승).
  const killAvailable = unlockedCardIds.some((id) => {
    const def = HAND_CARD_DEFINITIONS[id]
    if (!def || isHandoutBlocked(situation, heldSet, id)) return false
    const damage = killCandidateDamage(def, situation)
    return damage !== null && !!situation.strongEnemy && damage >= situation.strongEnemy.health
  })

  const rankings: SupportRanking[] = []
  for (const id of unlockedCardIds) {
    const def = HAND_CARD_DEFINITIONS[id]
    if (!def || isHandoutBlocked(situation, heldSet, id)) continue
    const plan = bestFitFor(def, situation, killAvailable, holds)
    // 레시피 완성각: 이 카드가 마지막 재료면 완성 효과의 필요 적합 가치를 할인해 가산한다.
    // 필요와 맞는(standalone) 완성각만 단독 추천 근거가 될 수 있고, 직접 효과보다는 항상 낮게 친다.
    const recipeBonus = recipeCompletionBonus(def, situation, heldSet)
    if (!plan && !recipeBonus?.standalone) continue
    const primary = plan && (!recipeBonus?.standalone || plan.fitScore >= recipeBonus.score) ? plan : recipeBonus!
    const tactic = getEnaHandCardTactic(id)
    const tagBonus = tagOverlapCount(def.synergyTags, situation.ownedRelicTags) * 1.2
    // 기회비용: 플레이어가 이미 2장 든 카드는 3장째가 즉시 트리플로 완성되므로 대기 가치를 가점.
    const tripleBonus = heldCountOf(situation, heldSet, id) === 2 ? tactic.tripleValue * 0.8 : 0
    const score = (plan?.fitScore ?? 0) + (recipeBonus?.score ?? 0) + tactic.fieldValue * 0.15 + tactic.synergyValue * 0.05 + tagBonus + tripleBonus - tactic.liability * 1.5
    rankings.push({ cardId: id, score, fit: primary.fit, reason: primary.reason, detail: primary.detail })
  }
  return rankings.sort((a, b) => b.score - a.score)
}

/** 최고 순위 지원 손패 하나(없으면 null). 예지 보급·클러치·시뮬 교사가 공유하는 진입점. */
export function bestSupportCard(situation: SupportSituation, unlockedCardIds: readonly HandCardId[]): SupportRanking | null {
  return rankSupportCards(situation, unlockedCardIds)[0] ?? null
}
