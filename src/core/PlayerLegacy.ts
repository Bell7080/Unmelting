/**
 * 여정의 유산 — 통산 기록(LifetimeRecord)에서 파생하는 아주 작은 영구 보너스.
 * 저장소를 따로 두지 않는다: LifetimeRecord가 이미 통산 값을 들고 있으므로, 여기서는
 * 그 값을 읽어 보너스로 환산하는 순수함수만 둔다(단일 출처 유지).
 *
 * 설계 원칙:
 * - **로그라이크는 수십 판**이 기본이다. 진행도는 총 런 수를 앵커(RUNS_ANCHOR)로 삼아
 *   √로 압축한다 — 몇 판만에 확 오르지 않고, 많이 해도 무한히 오르지 않는다(포화).
 * - **성향**은 에나 성향 성장과 같은 발상이다: 같은 판 수를 쌓아도 통산 활동 비중
 *   (전투/수집/생존)에 따라 어느 항목이 더 크게 자라는지가 갈린다.
 * - **안전 상한**: 시작 불빛/최대 체력처럼 완주 가능성에 미세한 여유만 주는 항목이
 *   기본이고, 빛 게이지 상한·손패 한도·공격력처럼 손패 계산에 직접 끼는 항목은
 *   진행도가 사실상 포화(0.97+)하고 그 성향이 압도적일 때만, 그것도 최대 1만 오른다.
 */
import type { LifetimeRecord } from '@core/LifetimeRecord'

/** 이 판수를 채우면 진행도가 1.0에 근접한다(완전 포화는 아님 — sqrt라 그 뒤로도 계속 완만히 접근). */
export const LEGACY_RUNS_ANCHOR = 60

/** 안전 축(항상 조금씩 오름) 상한값. */
export const LEGACY_LIGHT_PCT_CAP = 0.02
export const LEGACY_STARTING_LIGHT_CAP = 100
export const LEGACY_MAX_HEALTH_CAP = 5

/** 희귀 축(0 또는 1만 나온다) 발동 조건. */
export const LEGACY_RARE_PROGRESS_THRESHOLD = 0.97
export const LEGACY_RARE_LEAN_THRESHOLD = 0.7

export type PlayerLegacyStyle = 'combat' | 'gathering' | 'survival' | 'balanced'

export interface PlayerLegacyBonus {
  /** 불빛 획득 곱연산 배율 가산(예: 0.015 = +1.5%). enhancements.scoreMultiplier에 곱한다. */
  lightPct: number
  /** 런 시작 시 즉시 지급하는 고정 불빛. */
  startingLight: number
  /** 최대 체력 가산. */
  maxHealth: number
  /** 빛 게이지 상한 가산 — 0 또는 1(희귀). */
  emberMax: number
  /** 손패 한도 가산 — 0 또는 1(희귀). */
  handMax: number
  /** 공격력 가산 — 0 또는 1(가장 희귀). */
  damage: number
  /** 표시용 — 어느 성향이 이 보너스를 이끌었는지. */
  dominant: PlayerLegacyStyle
  /** 표시용 — 0~1 진행도(서고 UI가 "얼마나 쌓였는지" 게이지로 보여줄 때 쓴다). */
  progress: number
}

const EMPTY_BONUS: PlayerLegacyBonus = {
  lightPct: 0, startingLight: 0, maxHealth: 0, emberMax: 0, handMax: 0, damage: 0,
  dominant: 'balanced', progress: 0,
}

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v))

/** 통산 기록을 아주 작은 영구 보너스로 환산한다. 런이 하나도 없으면 전부 0. */
export function computePlayerLegacyBonus(record: LifetimeRecord): PlayerLegacyBonus {
  const runs = record.totalRuns
  if (runs <= 0) return EMPTY_BONUS

  const progress = clamp01(Math.sqrt(runs / LEGACY_RUNS_ANCHOR))
  const perRun = (total: number): number => total / runs

  // 세 성향 축 — 전투(처치)·수집(보물+불빛+꽃)·생존(클리어율+함정 처리).
  // 스케일이 서로 다른 원값들을 "런당 1회 안팎"이 1.0 근처가 되도록 나눠 맞췄다.
  const combatSignal = perRun(record.totalKills) / 3
  const gatherSignal = perRun(record.totalTreasures) + perRun(record.totalLight) / 300 + perRun(record.totalFlowers) / 2
  const survivalSignal = (record.clears / runs) * 2 + perRun(record.totalTraps) / 3

  const total = combatSignal + gatherSignal + survivalSignal
  const dominant: PlayerLegacyStyle = total <= 0
    ? 'balanced'
    : combatSignal >= gatherSignal && combatSignal >= survivalSignal
      ? 'combat'
      : gatherSignal >= survivalSignal
        ? 'gathering'
        : 'survival'
  // lean: 우세 축이 전체에서 차지하는 비중(0.33~1) — 한쪽으로 쏠릴수록 그 항목이 더 자란다.
  const lean = total > 0 ? Math.max(combatSignal, gatherSignal, survivalSignal) / total : 0

  // 안전 축 셋은 항상 진행도만큼 조금씩 오르되, 우세 성향과 맞는 항목이 더 크게 자란다.
  const leanBoost = (style: PlayerLegacyStyle): number => (dominant === style ? 0.6 + 0.4 * lean : 0.5)
  const lightPct = LEGACY_LIGHT_PCT_CAP * progress * leanBoost('combat')
  const startingLight = Math.round(LEGACY_STARTING_LIGHT_CAP * progress * leanBoost('gathering'))
  const maxHealth = Math.round(LEGACY_MAX_HEALTH_CAP * progress * leanBoost('survival'))

  // 희귀 축 — 진행도 포화 + 극단적 편중일 때만 1. 셋 중 최대 하나만 나온다(성향이 하나로 갈리므로).
  const extreme = progress >= LEGACY_RARE_PROGRESS_THRESHOLD && lean >= LEGACY_RARE_LEAN_THRESHOLD
  const damage = extreme && dominant === 'combat' ? 1 : 0
  const emberMax = extreme && dominant === 'gathering' ? 1 : 0
  const handMax = extreme && dominant === 'survival' ? 1 : 0

  return { lightPct, startingLight, maxHealth, emberMax, handMax, damage, dominant, progress }
}

/** 서고/디버그 표기용 — 성향 한글 라벨. */
export function playerLegacyStyleLabel(style: PlayerLegacyStyle): string {
  switch (style) {
    case 'combat': return '전투형'
    case 'gathering': return '수집형'
    case 'survival': return '생존형'
    default: return '균형형'
  }
}
