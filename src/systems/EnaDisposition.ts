/**
 * EnaDisposition - 에나 동료 휴리스틱의 "임의 실험값"을 한곳에 모은 성향 파라미터 층.
 *
 * CompanionSystem은 동작 구조(언제/어떻게 반응할지)는 그대로 두고, 그 안의 숫자(빈도·문턱·
 * 학습률·클러치 세기)를 여기서 읽는다. 이렇게 하면 학습/적응이 검증된 구조 *안에서* 숫자만
 * 움직이므로 블랙박스 정책망이 라이브에서 이상 행동할 위험 없이 안전하게 "성향"을 맞출 수 있다.
 *
 * 기본값(DEFAULT_DISPOSITION)은 기존 하드코딩 상수와 정확히 같아, 도입만으로는 동작이 변하지
 * 않는다. 값 조정/온라인 적응/저장은 이 층 위에서 이뤄진다.
 */

import type { SituationId, MinorClutchKind } from '@data/CompanionLines'

/** 학습/적응으로 움직일 수 있는 에나의 성향 파라미터 전체. 모두 해석 가능한 단일 의미를 갖는다. */
export interface EnaDisposition {
  /** 상황별 기본 발화 확률(수다스러움/무엇에 반응하는가). */
  situationChance: Record<SituationId, number>
  /** 손패 획득/사용 한줄평 확률. */
  lootCommentChance: number
  /** 소소한 깜짝 클러치 발동 확률(개입 적극성). */
  minorClutchChance: Record<MinorClutchKind, number>
  /** 각성(최후의 의지) 발동 확률. */
  awakenChance: number
  /** 역경/클라이맥스에서 소소한 클러치 확률 상한을 일시적으로 여는 배율. */
  clutchAdversityBoost: number
  /** 플레이어가 에나 말을 들어준 유대가 극적 개입으로 번질 확률 보정. */
  bondClimaxChance: number

  /** 예측 대비 기본 게이트 확률(×predictiveWeight). 거미줄 청소를 미리 건네는 적극성. */
  predictBaseChance: number
  /** 예측 대비 최소 재발동 턴 간격. */
  predictCooldown: number

  /** 클러치 발동 체력 비율 문턱(이 이하에서 방어 클러치). */
  clutchHpThreshold: number
  /** 체력 클러치에서 회복 vs 방패 선택 확률(회복 비중). */
  clutchHealVsShield: number
  /** 회복 클러치 세기(최대체력 대비 비율). */
  clutchHealRatio: number
  /** 방패 클러치 세기(최대체력 대비 비율). */
  clutchShieldRatio: number
  /** 클러치 효과 공통 배율. */
  clutchStrength: number
  /** 피해→의지 충전 배율(피해/최대체력 × 이 값). 클러치까지 차는 속도. */
  willGainPerDamage: number
  /** 피해 발생 시 의지 기본 보너스. */
  willGainFlatBonus: number

  /** 상황 학습 가중치 하한/상한(과묵~수다 범위). */
  weightFloor: number
  weightMax: number
  /** 스킵 시 가중치 하향 배율(<1). */
  skipDecay: number
  /** 끝까지 들어줬을 때 가중치 상향 배율(>1). */
  heardGrowth: number
  /** 예측이 유용했을 때 상향 배율(>1). */
  predictUpGrowth: number
  /** 예측이 낭비됐을 때 하향 배율(<1). */
  predictDownDecay: number

  /** 월드 바크 최소 턴 간격 기준치(수다 수치로 나눠 실제 간격 산출)와 경계. */
  minTurnGapBase: number
  minTurnGapMin: number
  minTurnGapMax: number
}

/** 기존 CompanionSystem 하드코딩 상수와 1:1로 같은 기본 성향(도입 시 무변화 보장). */
export const DEFAULT_DISPOSITION: EnaDisposition = {
  situationChance: {
    hit: 0.3,
    web: 0.35,
    treasure: 0.3,
    kill: 0.15,
    survive: 0.18,
    flower: 0.3,
    event: 0.6,
    spore: 0.4,
    bomb: 0.55,
  },
  lootCommentChance: 0.45,
  minorClutchChance: {
    crit: 0.06,
    dodge: 0.05,
    counter: 0.04,
    trap: 0.12,
    treasure: 0.15,
  },
  awakenChance: 0.12,
  clutchAdversityBoost: 1.0,
  bondClimaxChance: 0.08,
  predictBaseChance: 0.5,
  predictCooldown: 6,
  clutchHpThreshold: 0.4,
  clutchHealVsShield: 0.5,
  clutchHealRatio: 0.3,
  clutchShieldRatio: 0.25,
  clutchStrength: 1.0,
  willGainPerDamage: 60,
  willGainFlatBonus: 5,
  weightFloor: 0.2,
  weightMax: 1.8,
  skipDecay: 0.7,
  heardGrowth: 1.08,
  predictUpGrowth: 1.15,
  predictDownDecay: 0.7,
  minTurnGapBase: 8,
  minTurnGapMin: 3,
  minTurnGapMax: 16,
}

/** 각 파라미터의 안전 경계 — 적응/피팅이 여기를 절대 못 벗어나게 막아 라이브 동작을 보호한다. */
interface Bound {
  lo: number
  hi: number
}

const PROB: Bound = { lo: 0.02, hi: 0.95 }
const RATE_DOWN: Bound = { lo: 0.5, hi: 0.95 }
const RATE_UP: Bound = { lo: 1.02, hi: 1.5 }

/** 성향의 깊은 복제(기본값을 변형해 쓰기 시작할 때 원본 보호). */
export function cloneDisposition(d: EnaDisposition): EnaDisposition {
  return {
    ...d,
    situationChance: { ...d.situationChance },
    minorClutchChance: { ...d.minorClutchChance },
  }
}

/** 기본 성향의 새 인스턴스. */
export function defaultDisposition(): EnaDisposition {
  return cloneDisposition(DEFAULT_DISPOSITION)
}

function clamp(v: number, b: Bound): number {
  return Math.max(b.lo, Math.min(b.hi, v))
}

/**
 * 모든 파라미터를 안전 경계로 클램프한다. 저장본을 불러오거나 적응으로 값을 옮긴 뒤 호출해
 * 라이브 동작이 절대 비정상 범위(예: 항상 말하거나 절대 클러치 안 함)로 가지 않게 한다.
 */
export function clampDisposition(d: EnaDisposition): EnaDisposition {
  const out = cloneDisposition(d)
  for (const k of Object.keys(out.situationChance) as SituationId[]) {
    out.situationChance[k] = clamp(out.situationChance[k], PROB)
  }
  for (const k of Object.keys(out.minorClutchChance) as MinorClutchKind[]) {
    out.minorClutchChance[k] = clamp(out.minorClutchChance[k], PROB)
  }
  out.lootCommentChance = clamp(out.lootCommentChance, PROB)
  out.awakenChance = clamp(out.awakenChance, { lo: 0.02, hi: 0.4 })
  out.clutchAdversityBoost = clamp(out.clutchAdversityBoost, { lo: 0.6, hi: 2.4 })
  out.bondClimaxChance = clamp(out.bondClimaxChance, { lo: 0, hi: 0.25 })
  out.predictBaseChance = clamp(out.predictBaseChance, PROB)
  out.predictCooldown = clamp(out.predictCooldown, { lo: 2, hi: 20 })
  out.clutchHpThreshold = clamp(out.clutchHpThreshold, { lo: 0.2, hi: 0.6 })
  out.clutchHealVsShield = clamp(out.clutchHealVsShield, { lo: 0, hi: 1 })
  out.clutchHealRatio = clamp(out.clutchHealRatio, { lo: 0.15, hi: 0.5 })
  out.clutchShieldRatio = clamp(out.clutchShieldRatio, { lo: 0.1, hi: 0.45 })
  out.clutchStrength = clamp(out.clutchStrength, { lo: 0.6, hi: 1.6 })
  out.willGainPerDamage = clamp(out.willGainPerDamage, { lo: 30, hi: 100 })
  out.willGainFlatBonus = clamp(out.willGainFlatBonus, { lo: 0, hi: 15 })
  out.weightFloor = clamp(out.weightFloor, { lo: 0.1, hi: 0.5 })
  out.weightMax = clamp(out.weightMax, { lo: 1.2, hi: 2.5 })
  out.skipDecay = clamp(out.skipDecay, RATE_DOWN)
  out.heardGrowth = clamp(out.heardGrowth, RATE_UP)
  out.predictUpGrowth = clamp(out.predictUpGrowth, RATE_UP)
  out.predictDownDecay = clamp(out.predictDownDecay, RATE_DOWN)
  out.minTurnGapBase = clamp(out.minTurnGapBase, { lo: 4, hi: 14 })
  out.minTurnGapMin = clamp(out.minTurnGapMin, { lo: 2, hi: 6 })
  out.minTurnGapMax = clamp(out.minTurnGapMax, { lo: 10, hi: 24 })
  return out
}

/** 저장본 → 성향 병합. 누락 필드는 기본값으로 채워 스키마 진화에도 안전하게 불러온다. */
export function dispositionFromJSON(raw: unknown): EnaDisposition {
  const base = defaultDisposition()
  if (!raw || typeof raw !== 'object') return base
  const r = raw as Partial<EnaDisposition>
  const merged: EnaDisposition = {
    ...base,
    ...r,
    situationChance: { ...base.situationChance, ...(r.situationChance ?? {}) },
    minorClutchChance: { ...base.minorClutchChance, ...(r.minorClutchChance ?? {}) },
  }
  return clampDisposition(merged)
}

// ── 학습된 기본 토대(시뮬 산출) ───────────────────────────────────────────
// EnaDispositionFitter.fit({ lambda:12, iterations:120, evalSeeds:50, seed:1,
//   playerPolicies:[교사 휴리스틱, 학습된 정책망] })가 동료 개입을 켠 시뮬에서 찾은
// 게임플레이 도움 노브의 효율적 배분. 시뮬 플레이어를 '교사 + 딥 정책망' 두 종으로 둬,
// 숙련도가 다른 플레이어에게 두루 좋은(robust) 토대를 찾는다. 학습 구조가 의미 있음:
// 클러치/각성은 상향, 거미줄 예측·깜짝지원은 저가치라 하향. 시뮬이 실게임보다 어려워
// (유물/직업 미모델) 그대로 쓰면 과보호가 되므로 검증된 기본값으로 0.5 블렌드해 sim-to-real
// 갭을 보정한다. 시뮬이 굴린 노브만 반영(미모델 dodge/trap 깜짝지원·취향 노브는 기본 유지).
// 학습 산출물 스냅샷(동봉 가중치)이며, 라이브 토대로 쓰이고 그 위에서 per-player가 개인화한다.
const SIM_FITTED = {
  clutchHpThreshold: 0.596,
  clutchHealVsShield: 0.504,
  clutchHealRatio: 0.368,
  clutchShieldRatio: 0.368,
  clutchStrength: 1.36,
  willGainPerDamage: 86.6,
  willGainFlatBonus: 9.6,
  awakenChance: 0.321,
  predictBaseChance: 0.02,
  predictCooldown: 20,
  minorClutchCrit: 0.041,
  minorClutchCounter: 0.05,
  minorClutchTreasure: 0.055,
  clutchAdversityBoost: 1.45,
  bondClimaxChance: 0.11,
} as const

const SIM_TO_REAL_BLEND = 0.5

/** 학습된 기본 토대 성향. 기본값→시뮬 산출값으로 0.5 블렌드(시뮬 미반영 노브는 기본 유지) 후 클램프. */
export const BASE_DISPOSITION: EnaDisposition = buildBaseDisposition()

function buildBaseDisposition(): EnaDisposition {
  const d = defaultDisposition()
  const a = SIM_TO_REAL_BLEND
  const lerp = (from: number, to: number) => from + (to - from) * a
  d.clutchHpThreshold = lerp(d.clutchHpThreshold, SIM_FITTED.clutchHpThreshold)
  d.clutchHealVsShield = lerp(d.clutchHealVsShield, SIM_FITTED.clutchHealVsShield)
  d.clutchHealRatio = lerp(d.clutchHealRatio, SIM_FITTED.clutchHealRatio)
  d.clutchShieldRatio = lerp(d.clutchShieldRatio, SIM_FITTED.clutchShieldRatio)
  d.clutchStrength = lerp(d.clutchStrength, SIM_FITTED.clutchStrength)
  d.willGainPerDamage = lerp(d.willGainPerDamage, SIM_FITTED.willGainPerDamage)
  d.willGainFlatBonus = lerp(d.willGainFlatBonus, SIM_FITTED.willGainFlatBonus)
  d.awakenChance = lerp(d.awakenChance, SIM_FITTED.awakenChance)
  d.clutchAdversityBoost = lerp(d.clutchAdversityBoost, SIM_FITTED.clutchAdversityBoost)
  d.bondClimaxChance = lerp(d.bondClimaxChance, SIM_FITTED.bondClimaxChance)
  d.predictBaseChance = lerp(d.predictBaseChance, SIM_FITTED.predictBaseChance)
  d.predictCooldown = lerp(d.predictCooldown, SIM_FITTED.predictCooldown)
  d.minorClutchChance.crit = lerp(d.minorClutchChance.crit, SIM_FITTED.minorClutchCrit)
  d.minorClutchChance.counter = lerp(d.minorClutchChance.counter, SIM_FITTED.minorClutchCounter)
  d.minorClutchChance.treasure = lerp(d.minorClutchChance.treasure, SIM_FITTED.minorClutchTreasure)
  return clampDisposition(d)
}

// ── 영구 저장(per-player) ─────────────────────────────────────────────────
// 플레이어별로 적응된 성향을 세션 넘어 유지한다. 브라우저 외 환경(테스트/SSR)에서는
// localStorage가 없을 수 있어 안전하게 무시한다. (import 주위가 아니라 저장 접근만 보호)

const STORAGE_KEY = 'ena-disposition-v1'

/** 저장된 per-player 성향을 불러온다. 없으면 학습된 기본 토대(BASE_DISPOSITION)에서 시작한다. */
export function loadDisposition(key: string = STORAGE_KEY): EnaDisposition {
  if (typeof localStorage === 'undefined') return cloneDisposition(BASE_DISPOSITION)
  const raw = localStorage.getItem(key)
  if (!raw) return cloneDisposition(BASE_DISPOSITION)
  try {
    return dispositionFromJSON(JSON.parse(raw))
  } catch {
    return cloneDisposition(BASE_DISPOSITION)
  }
}

/** 적응된 성향을 클램프 후 저장한다. 저장 실패(용량/프라이빗 모드)는 조용히 무시한다. */
export function saveDisposition(d: EnaDisposition, key: string = STORAGE_KEY): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(key, JSON.stringify(clampDisposition(d)))
  } catch {
    /* 저장 실패는 게임 진행을 막지 않는다. */
  }
}
