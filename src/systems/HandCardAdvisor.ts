/**
 * HandCardAdvisor - 에나의 손패 지원 판단을 전 손패 범용·데이터 주도로 계산하는 순수 스코어러.
 *
 * 하드코딩된 카드 목록 대신 HandCardDefinition(targeting/category/damageProfile/synergyTags)과
 * EnaKnowledgeAdapter의 자동 전술 수치를 읽는다. 새 손패는 데이터 테이블에 등록만 하면
 * 런타임 예지(CompanionForesight)·클러치·시뮬 교사 휴리스틱이 코드 수정 없이 함께 반영한다.
 * 모든 함수는 순수 함수로 유지해 런타임/헤드리스 시뮬/테스트가 같은 기준을 공유한다.
 */

import { HAND_CARD_DEFINITIONS } from '@data/HandCards'
import type { HandCardDefinition, HandCardId } from '@entities/HandCard'
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
  /** 전염 카운트가 임박한 포자 존재. */
  sporeReady?: boolean
  /** 전방/대기 1칸의 강적(합체 또는 고체력). */
  strongEnemy?: { health: number; atFront: boolean }
  bossActive?: boolean
  /** 필드에 열 수단 없는 보물이 쌓여 있는가. */
  treasureLocked?: boolean
  /** 처치각이 없는 비전방 강적에 피해 누적 카드를 허용(시뮬 교사 휴리스틱용). */
  allowChipDamage?: boolean
  /** 플레이어가 이미 든 손패 — 같은 카드는 건네지 않고, 같은 역할 보유 시 해당 근거를 접는다. */
  heldCardIds?: readonly HandCardId[]
  /** 보유 유물의 synergyTags 평탄화 목록 — 태그 겹침 가점의 근거. */
  ownedRelicTags?: readonly string[]
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

/** 근거별 기준 점수 — 기존 예지 우선순위(청소 > 포자 > 처치 > 방어)를 계승한다. */
const FIT_BASE_SCORE: Record<SupportFit, number> = {
  cleanup: 28,
  spore: 26,
  ember: 25,
  attack: 24,
  boss: 23,
  recovery: 22,
  defense: 20,
  treasure: 14,
  chip: 12,
}

/** 전방 넓은 거미줄 제거(키틴류)는 1칸 청소보다 우선한다. */
const WIDE_CLEANUP_BONUS = 2

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

/** 강적 처치 후보 판정: 확정 피해 공식 + 대상 도달 가능(전방 전용은 전방 위협에만). */
function killCandidateDamage(def: HandCardDefinition, situation: SupportSituation): number | null {
  const enemy = situation.strongEnemy
  if (!enemy || def.category !== 'attack') return null
  const base = def.targeting.base
  if (base.filter !== 'enemy') return null
  if (base.zone !== 'field' && !(base.zone === 'front' && enemy.atFront)) return null
  return estimateHandCardDamage(def.id, situation.playerAttack)
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

  // 청소: 전방 넓은 병합 거미줄은 직접 제거, 인접 병합 예정 1칸들은 일괄 청소.
  if (wideSpan >= 2 && canRemoveWideFrontTrap(def, wideSpan) && !holds((d) => canRemoveWideFrontTrap(d, wideSpan))) {
    plans.push({
      fit: 'cleanup',
      fitScore: FIT_BASE_SCORE.cleanup + WIDE_CLEANUP_BONUS,
      reason: '커지기 전 거미줄 제거',
      detail: (situation.webMerge?.mergedSize ?? 0) >= 3
        ? '전방 2칸 거미줄에 1칸 거미줄이 합류해 3칸 위협이 될 수 있음'
        : `전방 병합 거미줄은 ${def.name} 손패로 직접 제거 가능`,
    })
  }
  if ((situation.webMerge?.mergingOneWebs ?? 0) >= 2 && canSweepFieldTraps(def) && !holds(canHandleMergingOneWebs)) {
    plans.push({
      fit: 'cleanup',
      fitScore: FIT_BASE_SCORE.cleanup,
      reason: '1칸 거미줄 미리 청소',
      detail: '1칸 거미줄들이 다음 전방에서 병합될 가능성이 높음',
    })
  }
  if (situation.sporeReady && canCleanseSpores(def) && !holds(canCleanseSpores)) {
    plans.push({
      fit: 'spore',
      fitScore: FIT_BASE_SCORE.spore,
      reason: '퍼지기 전 포자 정화',
      detail: '포자 전염 카운트가 가까워 필드 정화 가치가 높음',
    })
  }
  if (situation.emberLow && refillsEmber(def) && !holds(refillsEmber)) {
    plans.push({
      fit: 'ember',
      fitScore: FIT_BASE_SCORE.ember,
      reason: '불씨 게이지 보충',
      detail: '불씨가 꺼지기 직전이라 게이지 보충 가치가 높음',
    })
  }
  const enemy = situation.strongEnemy
  if (enemy) {
    const damage = killCandidateDamage(def, situation)
    if (damage !== null && damage >= enemy.health) {
      // 과잉 피해가 적을수록 '딱 맞는 도움'으로 가점 — 기존 최소 과잉피해 선택을 계승.
      const overkill = damage - enemy.health
      plans.push({
        fit: 'attack',
        fitScore: FIT_BASE_SCORE.attack - Math.min(4, overkill * 0.6),
        reason: `피해 ${damage}의 마무리 한 수`,
        detail: `전방/대기라인 강적을 피해 ${damage} 손패로 처치 가능`,
      })
    } else if (!killAvailable && enemy.atFront && isFrontDefenseCard(def) && !holds(isFrontDefenseCard)) {
      const freeze = def.targeting.base.filter === 'turn-timer'
      plans.push({
        fit: 'defense',
        fitScore: freeze ? FIT_BASE_SCORE.defense : FIT_BASE_SCORE.defense - 2 + Math.min(2, shieldGain(def) * 0.5),
        reason: freeze ? '반격을 늦추는 굳음' : '방패로 버티기',
        detail: freeze
          ? `처치가 어려운 전방 강적의 반격 타이밍을 ${def.name}의 굳음으로 늦출 수 있음`
          : '처치가 어려운 전방 강적에게 피해를 주며 방패를 확보할 수 있음',
      })
    } else if (!killAvailable && !enemy.atFront && situation.allowChipDamage && damage !== null && def.targeting.base.zone === 'field') {
      plans.push({
        fit: 'chip',
        fitScore: FIT_BASE_SCORE.chip + Math.min(4, damage * 0.2),
        reason: '미리 쌓는 피해',
        detail: '즉시 처치는 어렵지만 강적에게 미리 피해를 쌓아둘 수 있음',
      })
    }
  }
  if (situation.bossActive && def.category === 'attack' && def.targeting.base.filter === 'enemy') {
    const bossValue = getEnaHandCardTactic(def.id).bossValue
    plans.push({
      fit: 'boss',
      fitScore: FIT_BASE_SCORE.boss + Math.min(3, bossValue * 0.3),
      reason: '보스전 대비 화력',
      detail: '보스전 단일 대상 화력으로 보존 가치가 높음',
    })
  }
  if (situation.playerMaxHealth > 0 && situation.playerHealth / situation.playerMaxHealth <= 0.45 && isHealCard(def) && !holds(isHealCard)) {
    plans.push({
      fit: 'recovery',
      fitScore: FIT_BASE_SCORE.recovery,
      reason: '깎인 체력 회복',
      detail: '체력이 낮아 회복 손패 가치가 높음',
    })
  }
  if (situation.treasureLocked && opensTreasure(def) && !holds(opensTreasure)) {
    plans.push({
      fit: 'treasure',
      fitScore: FIT_BASE_SCORE.treasure,
      reason: '보물상자 회수',
      detail: '필드 보물을 열 수단이 없어 회수 손패 가치가 높음',
    })
  }
  if (plans.length === 0) return null
  return plans.sort((a, b) => b.fitScore - a.fitScore)[0]
}

/**
 * 상황에 맞는 지원 손패 순위표. 해금 풀 안에서만 고르며, 플레이어가 이미 든 카드와
 * 같은 역할을 이미 보유한 근거는 제외한다. 점수 = 근거 적합 + 지식 전술 수치 + 태그 겹침 - liability.
 */
export function rankSupportCards(situation: SupportSituation, unlockedCardIds: readonly HandCardId[]): SupportRanking[] {
  const held = new Set(situation.heldCardIds ?? [])
  const heldDefs = [...held].map((id) => HAND_CARD_DEFINITIONS[id]).filter((def): def is HandCardDefinition => !!def)
  const holds = (test: (d: HandCardDefinition) => boolean): boolean => heldDefs.some(test)

  // 방어 근거는 '처치각이 전혀 없을 때'만 연다(기존 killSupport 우선 규칙 계승).
  const killAvailable = unlockedCardIds.some((id) => {
    const def = HAND_CARD_DEFINITIONS[id]
    if (!def || held.has(id)) return false
    const damage = killCandidateDamage(def, situation)
    return damage !== null && !!situation.strongEnemy && damage >= situation.strongEnemy.health
  })

  const rankings: SupportRanking[] = []
  for (const id of unlockedCardIds) {
    const def = HAND_CARD_DEFINITIONS[id]
    if (!def || held.has(id)) continue
    const plan = bestFitFor(def, situation, killAvailable, holds)
    if (!plan) continue
    const tactic = getEnaHandCardTactic(id)
    const tagBonus = tagOverlapCount(def.synergyTags, situation.ownedRelicTags) * 1.2
    const score = plan.fitScore + tactic.fieldValue * 0.15 + tactic.synergyValue * 0.05 + tagBonus - tactic.liability * 1.5
    rankings.push({ cardId: id, score, fit: plan.fit, reason: plan.reason, detail: plan.detail })
  }
  return rankings.sort((a, b) => b.score - a.score)
}

/** 최고 순위 지원 손패 하나(없으면 null). 예지 보급·클러치·시뮬 교사가 공유하는 진입점. */
export function bestSupportCard(situation: SupportSituation, unlockedCardIds: readonly HandCardId[]): SupportRanking | null {
  return rankSupportCards(situation, unlockedCardIds)[0] ?? null
}
