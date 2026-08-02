/**
 * BossDamageBudget — "보스전에서 플레이어가 실제로 쏟아붓는 총 화력"의 단일 모델.
 *
 * 보스 체력을 `공격력 × 타수`로 잡으면 실제 전투와 크게 어긋난다. 플레이어는 직접
 * 타격만 하는 게 아니라 **손에 든 공격 손패 3~4장**을 함께 쓰고, 격자 보스에서는
 * 그 손패가 칸 단위로 증폭되기 때문이다:
 *
 *   - 광역 손패 1장   → 성한 칸마다 한 번씩 = 칸 수 × 평균 배율 (3×3이면 ×10 남짓)
 *   - 조준 단일 손패  → 약점 칸을 골라 맞히므로 최고 배율(×2)
 *   - 부위 파괴 보너스 → 쌓인 칸 피해에 비례해 따라온다(누적 배수)
 *
 * 그래서 격자 보스는 같은 전투 길이를 유지하려면 체력이 훨씬 두꺼워야 한다.
 * 이 파일은 그 계산을 한 곳에 모아 `BossSpecs`(수치 산출)와
 * `tools/boss-balance-report.ts`(분포 리포트)가 **같은 식**을 보게 한다.
 *
 * 모델에 들어가지 않은 화력은 `supportHits`(추가 타격 환산)로 한 번에 잡는다 —
 * 레시피 피해·유물 시너지·체인 보너스처럼 보유 상황에 따라 있다 없다 하는 것들이다.
 * 퍼센트로 숨기지 않고 "직접 타격 몇 번 분량"으로 적어 두면 나중에 근거를 따질 수 있다.
 */

import { HAND_CARD_DEFINITIONS } from '@data/HandCards'
import type { HandCardId, HandCardDefinition } from '@entities/HandCard'
import type { SpecialEnemyKind } from '@entities/Card'
import {
  BOSS_GIMMICK_PROFILES,
  BOSS_GIMMICK_KIND_META,
  bossGimmickBreakBonusFactor,
} from '@systems/BossGimmickManager'

/** 보스에게 닿는 방식 — 격자에서 증폭 폭이 갈린다. */
export type CardReach = 'single' | 'area' | 'unmodeled'

export interface BossAttackCard {
  id: HandCardId
  name: string
  /** 드로우 가중치. */
  weight: number
  /** 해금팩 전에는 뽑히지 않는가. */
  runLocked: boolean
  reach: CardReach
  /** 칸을 고를 수 있는가(무작위/광역은 못 고른다). */
  aimed: boolean
  atkMult: number
  flat: number
}

/**
 * 보스전에서 실제로 뽑힐 수 있는 공격 손패.
 * `dropSource`가 'any'가 아닌 카드(보스 전용 검은 양초, 유물 생성 칼날 파편)는
 * 일반 드로우 풀에 없으므로 제외한다.
 *
 * `damageProfile`이 없는 공격 카드(레바테인·방패 밀치기·손거울)는 피해가 공격력
 * 공식 밖에서 정해진다. 0으로 세면 과소평가지만, 임의의 수를 적으면 근거가 사라진다 —
 * 'unmodeled'로 남겨 두고 리포트가 몇 장이 그런지 함께 센다.
 */
export function bossAttackCardPool(): BossAttackCard[] {
  const pool: BossAttackCard[] = []
  for (const [id, def] of Object.entries(HAND_CARD_DEFINITIONS) as [HandCardId, HandCardDefinition][]) {
    if (def.category !== 'attack') continue
    const weight = def.dropWeight ?? 0
    if (def.dropSource !== 'any' || weight <= 0) continue
    const targeting = def.targeting?.base
    const profile = def.damageProfile
    pool.push({
      id,
      name: def.name,
      weight,
      runLocked: def.runLocked === true,
      reach: !profile ? 'unmodeled' : targeting?.selection === 'all' ? 'area' : 'single',
      aimed: targeting?.selection === 'target',
      atkMult: profile?.base.atkMult ?? 0,
      flat: profile?.base.flat ?? 0,
    })
  }
  return pool
}

/** 격자의 증폭 성질만 뽑은 요약. 격자가 없는 보스는 1칸·배율 1로 같은 식을 탄다. */
export interface BossGridModel {
  cells: number
  bestMultiplier: number
  averageMultiplier: number
  /** 부위 파괴 보너스를 누적 피해 배수로 환산한 값. */
  breakBonusFactor: number
}

const FLAT_GRID: BossGridModel = {
  cells: 1,
  bestMultiplier: 1,
  averageMultiplier: 1,
  breakBonusFactor: 1,
}

export function bossGridModel(kind: SpecialEnemyKind | null): BossGridModel {
  const profile = kind ? BOSS_GIMMICK_PROFILES[kind] : undefined
  if (!profile) return FLAT_GRID
  const cells = profile.cols * profile.rows
  let special = 0
  let sum = 0
  let best = BOSS_GIMMICK_KIND_META.plain.multiplier
  for (const slot of profile.slots) {
    const count = Math.min(slot.count, cells - special)
    if (count <= 0) continue
    const { multiplier } = BOSS_GIMMICK_KIND_META[slot.kind]
    special += count
    sum += count * multiplier
    best = Math.max(best, multiplier)
  }
  sum += (cells - special) * BOSS_GIMMICK_KIND_META.plain.multiplier
  return {
    cells,
    bestMultiplier: best,
    averageMultiplier: sum / cells,
    breakBonusFactor: bossGimmickBreakBonusFactor(cells),
  }
}

/** 직접 타격 1회가 보스에게 넣는 피해(약점 조준 + 부위 파괴 보너스 포함). */
export function directHitDamage(playerAttack: number, grid: BossGridModel): number {
  return playerAttack * grid.bestMultiplier * grid.breakBonusFactor
}

/**
 * 손패 한 장을 **지금 한 번 썼을 때** 실제로 깎이는 체력.
 *
 * 부위 파괴 보너스를 곱하지 않는다 — 그 보너스는 칸이 실제로 깨질 때만 붙는데,
 * 카드 한 장이 칸 내구도를 채우는 일은 거의 없기 때문이다(30F 기준 내구도 27,
 * 샹들리에 한 칸당 3). 여기에 `breakBonusFactor`를 곱하면 카드 한 장이 실제보다
 * 1.8배 세 보이고, "이 카드 한 장이 전투를 끝낸다" 같은 잘못된 결론이 나온다.
 * 전투 전체에 걸친 부위 파괴 보너스는 `handCardDamage`/`bossHpForBudget`이 총합에 한 번 얹는다.
 */
export function handCardImpact(card: BossAttackCard, playerAttack: number, grid: BossGridModel): number {
  if (card.reach === 'unmodeled') return 0
  const perHit = card.atkMult * playerAttack + card.flat
  if (perHit <= 0) return 0
  if (card.reach === 'area') return perHit * grid.cells * grid.averageMultiplier
  return perHit * (card.aimed ? grid.bestMultiplier : grid.averageMultiplier)
}

/**
 * 손패 한 장의 **전투 기여분**. 1회 실효 피해에 부위 파괴 보너스를 상각해 얹은 값이라
 * 체력 역산(`bossHpForBudget`)이 쓰는 쪽이다. 한 장이 화면에서 내는 수치가 아니다 —
 * 그건 `handCardImpact`다.
 */
export function handCardDamage(card: BossAttackCard, playerAttack: number, grid: BossGridModel): number {
  return handCardImpact(card, playerAttack, grid) * grid.breakBonusFactor
}

/** 가중치대로 한 장 뽑았을 때의 기대 피해. 체력 산출은 이 평균을 쓴다. */
export function expectedHandCardDamage(
  playerAttack: number,
  grid: BossGridModel,
  pool: BossAttackCard[] = bossAttackCardPool().filter((c) => !c.runLocked)
): number {
  const total = pool.reduce((s, c) => s + c.weight, 0)
  if (total <= 0) return 0
  return pool.reduce((s, c) => s + (c.weight / total) * handCardDamage(c, playerAttack, grid), 0)
}

/** 체력 산출에 쓰는 전투 가정. 세 수만 고치면 곡선 전체가 따라 움직인다. */
export interface BossFightBudget {
  /** 그 층에서 플레이어의 1타 예상 피해. */
  playerAttack: number
  /** 전투를 끝내기까지의 목표 플레이어 행동 수(직접 타격 + 손패 사용). */
  targetActions: number
  /** 그 전투에 쓴다고 보는 공격 손패 장수. */
  handCards: number
  /** 레시피·유물 시너지 등 모델 밖 화력을 '추가 직접 타격 몇 번'으로 환산한 값. */
  supportHits: number
  /** 칸 기믹 격자가 켜진 보스의 종류(없으면 null). */
  gimmickKind: SpecialEnemyKind | null
}

/**
 * 전투 가정 → 필요한 보스 체력.
 *
 *   체력 = 손패 3~4장의 기대 피해 + (남은 행동 수 + 지원 화력 환산) × 직접 1타
 *
 * 손패를 쓴 행동은 직접 타격을 하지 않았다는 뜻이므로 목표 행동 수에서 빼고 센다.
 */
export function bossHpForBudget(budget: BossFightBudget): number {
  const grid = bossGridModel(budget.gimmickKind)
  const hand = budget.handCards * expectedHandCardDamage(budget.playerAttack, grid)
  const directActions = Math.max(0, budget.targetActions - budget.handCards) + budget.supportHits
  return hand + directActions * directHitDamage(budget.playerAttack, grid)
}

/** 이 체력이 실제로 몇 번의 행동으로 끝나는지 — 곡선 검증·리포트가 쓴다. */
export function actionsToKill(maxHp: number, budget: BossFightBudget): number {
  const grid = bossGridModel(budget.gimmickKind)
  const hand = budget.handCards * expectedHandCardDamage(budget.playerAttack, grid)
  const remaining = Math.max(0, maxHp - hand)
  return budget.handCards + remaining / directHitDamage(budget.playerAttack, grid)
}
