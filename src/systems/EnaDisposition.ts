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
import type { SupportRoleWeights } from './HandCardAdvisor'

export type { SupportRoleWeights }

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

  /** HandCardAdvisor 기대 HP 환산의 역할별 가중(청소/처치/방어/자원/회복). 1.0 = 무변화.
   *  optional: 구버전 저장본에는 없고, 로드 시 기본 1.0으로 병합된다. */
  supportRoleWeights?: SupportRoleWeights
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
    // 신설 2종은 낮은 기본 확률로 시작한다(불씨 꺼짐 구원 / 포자 전염 정화).
    ember: 0.04,
    cleanse: 0.04,
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
  // 지원 판단 역할 가중은 1.0에서 시작한다(도입 무변화 보장) — 피팅이 이 위에서 움직인다.
  supportRoleWeights: { cleanup: 1, attack: 1, defense: 1, resource: 1, recovery: 1 },
}

/** 각 파라미터의 안전 경계 — 적응/피팅이 여기를 절대 못 벗어나게 막아 라이브 동작을 보호한다. */
interface Bound {
  lo: number
  hi: number
}

const PROB: Bound = { lo: 0.02, hi: 0.95 }
const RATE_DOWN: Bound = { lo: 0.5, hi: 0.95 }
const RATE_UP: Bound = { lo: 1.02, hi: 1.5 }
/** 지원 역할 가중 안전 경계 — 피터(EnaDispositionFitter)도 같은 범위에서 탐색한다. */
export const SUPPORT_ROLE_WEIGHT_BOUND = { lo: 0.5, hi: 2 } as const

// ── 축 특화(플레이 스타일이 먹인 축만 안전 상한을 넘어 자라는 초과 성장) ────────
// 구매/해금 없이, 플레이어의 실제 플레이가 특정 개입 축(예지/수호/온정/불굴)을 일관되게
// 먹이면 그 축의 안전 상한(hi)만 아주 찔끔씩 확장된다. 특화 0이면 기존 동작과 완전히 같다.

/** 개입 축 4종 — ExperienceAxes의 예지/수호/온정/불굴 축과 1:1 대응한다. */
export type EnaSpecializationAxis = 'predict' | 'protection' | 'minor' | 'grit'

/** 축별 특화 점수(0~1). 단조 증가만 하며 EnaAutonomousLearner 저장(version 1)에 영속된다. */
export type EnaSpecialization = Record<EnaSpecializationAxis, number>

const SPECIALIZATION_AXES: readonly EnaSpecializationAxis[] = ['predict', 'protection', 'minor', 'grit']

/** 특화 0 인스턴스 — 신규/무저장 플레이어의 시작점(기존 동작 보존). */
export function zeroSpecialization(): EnaSpecialization {
  return { predict: 0, protection: 0, minor: 0, grit: 0 }
}

/** 부분/손상 저장본을 0~1 특화로 안전 병합한다(비정상 값은 0 취급). */
export function normalizeSpecialization(raw?: Partial<EnaSpecialization> | null): EnaSpecialization {
  const out = zeroSpecialization()
  if (!raw || typeof raw !== 'object') return out
  for (const axis of SPECIALIZATION_AXES) {
    const v = raw[axis]
    if (typeof v === 'number' && Number.isFinite(v)) out[axis] = Math.max(0, Math.min(1, v))
  }
  return out
}

/** 특화 1(만렙)일 때 상한 확장 배율 — hi × (1 + spec × MAX_EXTENSION), 1.0이면 최대 2배. */
export const SPECIALIZATION_MAX_EXTENSION = 1.0

/** 특화 축의 안전 경계 상한만 확장한다(하한은 그대로 — 하락 방향 안전은 유지). */
function extendHi(b: Bound, spec: number): Bound {
  const s = Math.max(0, Math.min(1, spec))
  if (s <= 0) return b
  return { lo: b.lo, hi: b.hi * (1 + s * SPECIALIZATION_MAX_EXTENSION) }
}

// 특화 대상 노브의 안전 경계 — clampDisposition과 앵커 상향(specializedAnchorDisposition)이 공유한다.
const AWAKEN_BOUND: Bound = { lo: 0.02, hi: 0.4 }
const ADVERSITY_BOOST_BOUND: Bound = { lo: 0.6, hi: 2.4 }
const BOND_CLIMAX_BOUND: Bound = { lo: 0, hi: 0.25 }
const CLUTCH_HP_THRESHOLD_BOUND: Bound = { lo: 0.2, hi: 0.6 }
const CLUTCH_STRENGTH_BOUND: Bound = { lo: 0.6, hi: 1.6 }
const WILL_GAIN_BOUND: Bound = { lo: 30, hi: 100 }

/** 특화 축이 확장하는 스칼라 노브 — ExperienceAxes의 원시 축 계산과 같은 노브 묶음이다.
 *  (온정 축의 minorClutchChance는 중첩 맵이라 별도 처리; 확률 노브가 1을 넘으면 '사실상 항상'이며
 *  rollMinorClutch의 런타임 발동 캡(0.22/0.45)이 별도 안전선으로 남는다.) */
type SpecializedScalarKnob =
  | 'predictBaseChance'
  | 'clutchStrength'
  | 'willGainPerDamage'
  | 'clutchHpThreshold'
  | 'awakenChance'
  | 'clutchAdversityBoost'
  | 'bondClimaxChance'

const SPECIALIZED_SCALAR_KNOBS: Record<
  EnaSpecializationAxis,
  ReadonlyArray<{ key: SpecializedScalarKnob; bound: Bound }>
> = {
  predict: [{ key: 'predictBaseChance', bound: PROB }],
  protection: [
    { key: 'clutchStrength', bound: CLUTCH_STRENGTH_BOUND },
    { key: 'willGainPerDamage', bound: WILL_GAIN_BOUND },
    { key: 'clutchHpThreshold', bound: CLUTCH_HP_THRESHOLD_BOUND },
  ],
  minor: [],
  grit: [
    { key: 'awakenChance', bound: AWAKEN_BOUND },
    { key: 'clutchAdversityBoost', bound: ADVERSITY_BOOST_BOUND },
    { key: 'bondClimaxChance', bound: BOND_CLIMAX_BOUND },
  ],
}

/** 성향의 깊은 복제(기본값을 변형해 쓰기 시작할 때 원본 보호). */
export function cloneDisposition(d: EnaDisposition): EnaDisposition {
  return {
    ...d,
    situationChance: { ...d.situationChance },
    minorClutchChance: { ...d.minorClutchChance },
    supportRoleWeights: d.supportRoleWeights ? { ...d.supportRoleWeights } : undefined,
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
 * specialization을 주면 특화 축에 대응하는 노브들의 상한만 확장된다(특화 0이면 기존과 동일).
 */
export function clampDisposition(
  d: EnaDisposition,
  specialization?: Partial<EnaSpecialization>
): EnaDisposition {
  const s = normalizeSpecialization(specialization)
  const out = cloneDisposition(d)
  for (const k of Object.keys(out.situationChance) as SituationId[]) {
    out.situationChance[k] = clamp(out.situationChance[k], PROB)
  }
  // 온정 특화는 소소한 클러치 전종의 상한을 함께 연다(발동 자체는 rollMinorClutch 캡이 보호).
  const minorBound = extendHi(PROB, s.minor)
  for (const k of Object.keys(out.minorClutchChance) as MinorClutchKind[]) {
    out.minorClutchChance[k] = clamp(out.minorClutchChance[k], minorBound)
  }
  out.lootCommentChance = clamp(out.lootCommentChance, PROB)
  // 특화 대상 스칼라 노브 — 축 특화만큼 hi가 확장된 경계로 클램프한다.
  for (const axis of SPECIALIZATION_AXES) {
    for (const { key, bound } of SPECIALIZED_SCALAR_KNOBS[axis]) {
      out[key] = clamp(out[key], extendHi(bound, s[axis]))
    }
  }
  out.predictCooldown = clamp(out.predictCooldown, { lo: 2, hi: 20 })
  out.clutchHealVsShield = clamp(out.clutchHealVsShield, { lo: 0, hi: 1 })
  out.clutchHealRatio = clamp(out.clutchHealRatio, { lo: 0.15, hi: 0.5 })
  out.clutchShieldRatio = clamp(out.clutchShieldRatio, { lo: 0.1, hi: 0.45 })
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
  if (out.supportRoleWeights) {
    // 역할 가중은 0.5~2배 — 어느 역할도 완전히 끄거나 폭주시키지 못하게 막는다.
    for (const k of Object.keys(out.supportRoleWeights) as (keyof SupportRoleWeights)[]) {
      out.supportRoleWeights[k] = clamp(out.supportRoleWeights[k], SUPPORT_ROLE_WEIGHT_BOUND)
    }
  }
  return out
}

/** 저장본 → 성향 병합. 누락 필드는 기본값으로 채워 스키마 진화에도 안전하게 불러온다.
 *  specialization을 주면 특화 확장 상한을 유지한 채 병합한다(안 주면 기존 안전 상한으로 잘린다). */
export function dispositionFromJSON(
  raw: unknown,
  specialization?: Partial<EnaSpecialization>
): EnaDisposition {
  const base = defaultDisposition()
  if (!raw || typeof raw !== 'object') return base
  const r = raw as Partial<EnaDisposition>
  const merged: EnaDisposition = {
    ...base,
    ...r,
    situationChance: { ...base.situationChance, ...(r.situationChance ?? {}) },
    minorClutchChance: { ...base.minorClutchChance, ...(r.minorClutchChance ?? {}) },
    // 구버전 저장본(가중 없음)도 기본 1.0으로 채워 스키마 진화에 안전하게 병합한다.
    supportRoleWeights: { ...base.supportRoleWeights!, ...(r.supportRoleWeights ?? {}) },
  }
  return clampDisposition(merged, specialization)
}

// ── 학습된 기본 토대(시뮬 산출) ───────────────────────────────────────────
// EnaDispositionFitter.fit({ lambda:12, iterations:120, evalSeeds:50, seed:1,
//   playerPolicies:[교사 휴리스틱, 학습된 정책망] })가 2026-07 정합화된 시뮬(재화 분리·
// 실제 팩/드롭/시련·advisor 공유)에서 찾은 게임플레이 도움 노브의 효율적 배분.
// 시뮬 플레이어를 '교사 + 딥 정책망' 두 종으로 둬 숙련도가 다른 플레이어에게 두루 좋은
// (robust) 토대를 찾는다. 학습 구조가 의미 있음: 상시 관대함(강한 클러치/각성/빠른 의지
// 충전)은 저효율이라 절제하고, 치명 피해를 직접 지우는 회피 클러치와 자원/회복 역할 가중을
// 상향, 예측 재발동 간격은 길게. held-out 500시드×2정책 검증에서 원본 산출은 기존 토대보다
// 평균 생존 턴이 유의하게 높았다(28.9 vs 27.2). 시뮬이 실게임보다 어려워(유물/직업 미모델)
// 그대로 쓰면 성향이 극단화되므로 검증된 기본값으로 0.5 블렌드해 sim-to-real 갭을 보정한다.
// 시뮬이 굴린 노브만 반영(시뮬 미모델 trap/ember/cleanse 깜짝지원·현 피터가 탐색하지 않는
// counter/adversityBoost/bondClimax·취향 노브는 기본 유지).
// 학습 산출물 스냅샷(동봉 가중치)이며, 라이브 토대로 쓰이고 그 위에서 per-player가 개인화한다.
const SIM_FITTED = {
  clutchHpThreshold: 0.2,
  clutchHealVsShield: 0.282,
  clutchHealRatio: 0.444,
  clutchShieldRatio: 0.45,
  clutchStrength: 0.6,
  willGainPerDamage: 30,
  willGainFlatBonus: 0.86,
  awakenChance: 0.02,
  predictBaseChance: 0.447,
  predictCooldown: 19.9,
  minorClutchCrit: 0.053,
  minorClutchDodge: 0.46,
  minorClutchTreasure: 0.117,
  supportRoleWeights: { cleanup: 1.26, attack: 0.5, defense: 1.2, resource: 1.94, recovery: 2 },
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
  d.predictBaseChance = lerp(d.predictBaseChance, SIM_FITTED.predictBaseChance)
  d.predictCooldown = lerp(d.predictCooldown, SIM_FITTED.predictCooldown)
  d.minorClutchChance.crit = lerp(d.minorClutchChance.crit, SIM_FITTED.minorClutchCrit)
  d.minorClutchChance.dodge = lerp(d.minorClutchChance.dodge, SIM_FITTED.minorClutchDodge)
  d.minorClutchChance.treasure = lerp(d.minorClutchChance.treasure, SIM_FITTED.minorClutchTreasure)
  // 지원 역할 가중도 같은 규칙으로 블렌드 — advisor 기대 HP 환산에 곱해진다.
  const w = d.supportRoleWeights!
  for (const k of Object.keys(SIM_FITTED.supportRoleWeights) as (keyof SupportRoleWeights)[]) {
    w[k] = lerp(w[k], SIM_FITTED.supportRoleWeights[k])
  }
  return clampDisposition(d)
}

// ── 성장 곡선(초보 동반자 → 베테랑) ──────────────────────────────────────
// 초기 에나는 '입은 살아 있는 미숙한 동반자'다: 대사 성향은 그대로 두고, 기계적 개입만
// BASE보다 확연히 낮춘다(전무가 아니라 '가끔' — 돌발성 재미는 남긴다). 로그라이트 커리큘럼상
// 초반 죽음(10층→20층…)을 에나가 앞질러 구해버리면 안 되기 때문이다.
// 성장(growth 0→1)은 '의미 있는 모험량'(누적 xp)+유대로만 차오르고, 앵커를 BASE로 옮긴다.

/** 초보 개입 배율 — 소소한 클러치/각성을 BASE의 35~45% 수준(중간 0.4)으로 남긴다. */
const ROOKIE_INTERVENTION_FACTOR = 0.4
/** 초보 예지 보급 게이트 — 낮되 0은 아니게(드물게 미리 건네는 순간을 허용). */
const ROOKIE_PREDICT_CHANCE = 0.12

/** 초보 에나 성향 — 개입 노브만 낮추고(가끔은 발동), 대사 노브는 BASE와 동일. */
export const ROOKIE_DISPOSITION: EnaDisposition = buildRookieDisposition()

function buildRookieDisposition(): EnaDisposition {
  const d = cloneDisposition(BASE_DISPOSITION)
  // 소소한 클러치 전종 — BASE의 40%. 초반 커리큘럼을 앞지르지 않는 선에서 '가끔' 터진다.
  for (const k of Object.keys(d.minorClutchChance) as MinorClutchKind[]) {
    d.minorClutchChance[k] = d.minorClutchChance[k] * ROOKIE_INTERVENTION_FACTOR
  }
  // 죽음 직전 구원(각성)도 같은 배율 — 드물지만 이야깃거리가 될 만큼은 남긴다.
  d.awakenChance = d.awakenChance * ROOKIE_INTERVENTION_FACTOR
  d.clutchAdversityBoost = 0.8
  d.bondClimaxChance = 0
  // 예지 보급: 확률 낮음 + 재발동 간격 김 → 드물게만 미리 대비를 건넨다.
  d.predictBaseChance = ROOKIE_PREDICT_CHANCE
  d.predictCooldown = 18
  // 큰 의지 클러치: 충전이 느리고 효과도 약하지만, 발동 자체는 가능하다.
  d.clutchHpThreshold = 0.25
  d.clutchHealRatio = 0.2
  d.clutchShieldRatio = 0.15
  d.clutchStrength = 0.7
  d.willGainPerDamage = BASE_DISPOSITION.willGainPerDamage * 0.75
  d.willGainFlatBonus = 1
  // 지원 카드 판단 가중은 소극적이되 발동했을 때 무의미하지 않을 중간값.
  d.supportRoleWeights = { cleanup: 0.7, attack: 0.7, defense: 0.7, resource: 0.7, recovery: 0.7 }
  return clampDisposition(d)
}

/** 성장 입력 — 누적 모험 xp(EnaAutonomousLearner 저장)와 유대(CompanionSystem). */
export interface EnaGrowthInput {
  adventureXp: number
  bond: number
}

/** 성장 곡선 튜닝 상수 — 이 블록과 아래 xp/드라마 테이블만 바꾸면 성장 속도가 통째로 조정된다. */
export const ENA_GROWTH_TUNING = {
  /** xp 성분의 완만한 포화 스케일(1-exp(-xp/scale)). 500이면 얕은 런(10층≈14xp)당 약 +2%p. */
  xpScale: 500,
  /** xp 성분 비중. */
  xpWeight: 0.75,
  /** 유대 성분 비중(xpWeight + bondWeight = 1). */
  bondWeight: 0.25,
} as const

/**
 * 런 1회의 모험 xp 튜닝 — 4축(런 완료/층 등반/유의미한 플레이/플레이 시간) 가중과 축별 상한,
 * 첫 경험 가산, 희귀 점프 상한·조건을 전부 상수로 명시한다.
 * 축별 상한(cap) 때문에 어느 한 축만 파서는(예: 얕은 층에서 행동만 반복) 수렴에 못 간다.
 */
export const ENA_RUN_XP_TUNING = {
  /** 축1 — 런 완료 자체의 소량 기본치(자살런도 아주 조금은 인정). */
  perRunBase: 2,
  /** 축2 — 층 등반(주 축): 층당 xp + 깊이 구간 가점 + 클리어 가점, 축 상한. */
  perFloor: 1,
  depthBonuses: [
    { floor: 30, xp: 5 },
    { floor: 60, xp: 10 },
    { floor: 90, xp: 15 },
  ],
  clearBonus: 15,
  floorAxisCap: 90,
  /** 축3 — 유의미한 플레이: 실제 의사결정(손패 사용/구매/이벤트 선택/대사 열람) 1건당 xp, 축 상한. */
  perDecision: 0.2,
  decisionAxisCap: 8,
  /** 축4 — 순수 플레이 시간: 진행 턴 수 기반 근사(방치는 턴이 안 오르므로 부풀릴 수 없다), 축 상한. */
  perProgressTurn: 0.1,
  playtimeAxisCap: 8,
  /** 일반 런 총상한 — 초반 기준 최대 약 +6%p. 매판 성장은 소폭·잔여분 비례 감쇠를 유지한다. */
  normalRunXpCap: 40,
  /** 첫 경험 가산 — 키의 카테고리(콜론 앞)별 1회성 소량 xp. 일상 반복 획득은 축3에 이미
   *  포함되므로 여기서는 '처음 겪는' 발견만 계상한다(이중 계상 금지, 첫 경험 필터는 학습기 저장). */
  firstExperienceXp: {
    'boss-kill': 5, // 보스 첫 격파 — 점프는 자동이 아니라 아래 드라마 게이트로만 열린다.
    'rare-relic': 5, // 희귀(rare) 등급 이상 유물 첫 획득.
    altar: 4, // 첫 제단 방문(30턴 도달).
    starlight: 4, // 첫 별빛(90층 이후 등반 진입).
    'card-unlock': 3, // 새 카드 첫 해금(해금팩 첫 사용).
  } as Record<string, number>,
  firstExperienceRunCap: 15,
  /** 희귀 점프 — 자격(기록 대폭 경신/보스 층 도달) + 드라마 점수 문턱을 함께 넘어야 1회 가산. */
  jumpBonusXp: 40,
  /** 점프 포함 런 xp 총상한 — 초반 기준 최대 약 +9.5%p(5~10%p급 점프의 상한). */
  jumpRunXpCap: 65,
  /** '대폭 경신' 판정 — 종전 최고 기록보다 이만큼(층) 이상 더 가야 자격 인정(첫 런은 제외). */
  recordBreakMargin: 10,
  /** 보스 층 — 이 층 이상 도달한 런은 보스전을 치렀으므로 점프 자격 후보. */
  bossFloors: [30, 60, 90, 100],
} as const

// ── 모험의 질(드라마) 점수 — 점프 게이트 ─────────────────────────────────
// '놀랍고 재밌는 모험이었나'를 관측 가능한 신호 4계열로 산출한다. 첫 보스라도 싱겁게(무피해
// 속전) 이기면 점프가 없고, 이전에 본 보스라도 유의미한 고전 끝의 격파면 점프가 열린다.

/** 런 1회의 드라마 신호 — 전부 관측 로그/기존 추적치에서 나오는 값이다. */
export interface EnaRunDramaSignals {
  /** 계열1 위기감: 저체력(≤30%) 구간 체류 횟수 / 즉사 후보 위협 대면 / 불씨 고갈(≤1) 위기. */
  lowHpMoments?: number
  lethalThreatsFaced?: number
  emberCrises?: number
  /** 계열2 에나 도움의 실효: 죽음·큰 피해를 실제 막은 클러치 수 / 건넨 지원 손패가
   *  즉시·위기 타이밍에 실제 사용된 수(recordPredictionOutcome ≥ 1 신호 재사용). */
  effectiveClutches?: number
  timelyPredictions?: number
  /** 계열3 고전: 같은 위협에 소모한 추가 턴 / 피해 누적 후 회복 반복 / 최저 체력비→회복 폭(0~1). */
  grindTurns?: number
  recoveries?: number
  comebackDepth?: number
  /** 계열4 새로운 체계적 시도: 과거 런에서 안 쓰던 카드·레시피를 이번 런에 유의미하게(2회+) 사용. */
  novelCardsUsed?: number
}

/** 드라마 점수 가중/캡 — 계열별 상한으로 한 계열 과대 계상을 막고, 문턱을 명시한다. */
export const ENA_RUN_DRAMA_TUNING = {
  peril: { perLowHpMoment: 1.5, perLethalThreat: 2, perEmberCrisis: 1.5, cap: 8 },
  aid: { perEffectiveClutch: 3, perTimelyPrediction: 2, cap: 8 },
  struggle: { perGrindTurn: 0.5, perRecovery: 1, comebackScale: 6, cap: 8 },
  novelty: { perNovelCard: 2, cap: 6 },
  /** 이 점수 이상이어야 점프 허용 — 최소 두 계열 이상이 실제로 기여해야 닿는 높이. */
  jumpThreshold: 12,
} as const

/** 드라마 점수(0~30) — 계열별 캡 후 합산. */
export function computeRunDramaScore(s: EnaRunDramaSignals): number {
  const T = ENA_RUN_DRAMA_TUNING
  const n = (v: number | undefined) => Math.max(0, v ?? 0)
  const peril = Math.min(
    T.peril.cap,
    n(s.lowHpMoments) * T.peril.perLowHpMoment +
      n(s.lethalThreatsFaced) * T.peril.perLethalThreat +
      n(s.emberCrises) * T.peril.perEmberCrisis
  )
  const aid = Math.min(
    T.aid.cap,
    n(s.effectiveClutches) * T.aid.perEffectiveClutch + n(s.timelyPredictions) * T.aid.perTimelyPrediction
  )
  const struggle = Math.min(
    T.struggle.cap,
    n(s.grindTurns) * T.struggle.perGrindTurn +
      n(s.recoveries) * T.struggle.perRecovery +
      Math.min(1, n(s.comebackDepth)) * T.struggle.comebackScale
  )
  const novelty = Math.min(T.novelty.cap, n(s.novelCardsUsed) * T.novelty.perNovelCard)
  return peril + aid + struggle + novelty
}

/** 런 1회의 모험 xp 입력. */
export interface EnaRunXpInput {
  floorReached: number
  cleared?: boolean
  /** 유의미한 의사결정 수(손패 사용/상점·제단 구매/이벤트 선택/대사 열람 등). */
  decisions?: number
  /** 진행 턴 수 — 순수 플레이 시간의 방치 방지 근사. */
  progressTurns?: number
  /** 이전까지의 최고 도달 층 — 기록 경신 자격 판정용. */
  previousBestFloor?: number
  /** 이번 런에서 처음 겪은 경험 키('boss-kill:30', 'rare-relic' 등 — 첫 경험 필터는 학습기 책임). */
  firstExperiences?: readonly string[]
  /** 모험의 질 신호 — 점프 게이트 입력. */
  drama?: EnaRunDramaSignals
}

/**
 * 이번 런이 희귀 성장 점프 대상인가 — 자격(기록 대폭 경신 또는 보스 층 도달)이 있어도
 * 드라마 점수가 문턱을 넘어야만 열린다. 첫 격파 자동 점프는 없다.
 */
export function isGrowthJumpRun(run: EnaRunXpInput): boolean {
  if (computeRunDramaScore(run.drama ?? {}) < ENA_RUN_DRAMA_TUNING.jumpThreshold) return false
  const prev = run.previousBestFloor ?? 0
  const recordBreak = prev > 0 && run.floorReached >= prev + ENA_RUN_XP_TUNING.recordBreakMargin
  const bossFought = ENA_RUN_XP_TUNING.bossFloors.some((boss) => run.floorReached >= boss)
  return recordBreak || bossFought
}

/**
 * 런 1회의 '의미 있는 모험량' xp — 4축 합산(각 축 상한) 후 일반 런 총상한으로 자르고,
 * 첫 경험 소량 가산을 얹은 뒤, 드라마 게이트를 통과한 점프 런만 jumpBonusXp를 더한다.
 */
export function computeRunAdventureXp(run: EnaRunXpInput): number {
  const T = ENA_RUN_XP_TUNING
  const floor = Math.max(0, run.floorReached)
  // 축2: 층 등반(주 축).
  let floorXp = floor * T.perFloor
  for (const bonus of T.depthBonuses) if (floor >= bonus.floor) floorXp += bonus.xp
  if (run.cleared) floorXp += T.clearBonus
  floorXp = Math.min(T.floorAxisCap, floorXp)
  // 축3·축4: 유의미한 플레이 / 진행 턴 기반 플레이 시간.
  const decisionXp = Math.min(T.decisionAxisCap, Math.max(0, run.decisions ?? 0) * T.perDecision)
  const timeXp = Math.min(T.playtimeAxisCap, Math.max(0, run.progressTurns ?? 0) * T.perProgressTurn)
  let xp = Math.min(T.normalRunXpCap, T.perRunBase + floorXp + decisionXp + timeXp)
  // 첫 경험 가산 — 카테고리별 1회성 소량(키 필터는 학습기 저장 집합이 담당).
  let firstXp = 0
  for (const key of run.firstExperiences ?? []) firstXp += T.firstExperienceXp[key.split(':')[0]] ?? 0
  xp += Math.min(T.firstExperienceRunCap, firstXp)
  // 희귀 점프 — 자격 + 드라마 문턱을 함께 넘은 런만.
  if (isGrowthJumpRun(run)) xp = Math.min(T.jumpRunXpCap, xp + T.jumpBonusXp)
  return xp
}

/**
 * 에나 성장值(0~1) 계산 — 초보(0)→베테랑(1) 앵커 보간의 유일한 입력.
 * 런 횟수가 아니라 누적 모험 xp를 쓰므로 얕은 자살런 반복으로는 차지 않고,
 * 1-exp 곡선이라 매판 상승분은 잔여분에 비례해 자연 감쇠한다.
 * 주의: 추후 메타 상점 해금형으로 바꿀 때도 이 함수 하나만 교체하면 되도록
 * 성장 판정을 전부 여기에 모은다(호출부는 growth 숫자만 소비).
 */
export function computeEnaGrowth({ adventureXp, bond }: EnaGrowthInput): number {
  const xpPart = 1 - Math.exp(-Math.max(0, adventureXp) / ENA_GROWTH_TUNING.xpScale)
  const bondPart = Math.max(0, Math.min(1, bond))
  const g = ENA_GROWTH_TUNING.xpWeight * xpPart + ENA_GROWTH_TUNING.bondWeight * bondPart
  return Math.max(0, Math.min(1, g))
}

/** 성장 앵커 성향 — ROOKIE→BASE를 growth로 선형 보간한다(평균회귀 목표/신규 폴백 공용). */
export function growthAnchorDisposition(growth: number): EnaDisposition {
  const t = Math.max(0, Math.min(1, growth))
  const out = cloneDisposition(ROOKIE_DISPOSITION)
  const base = BASE_DISPOSITION as unknown as Record<string, unknown>
  const target = out as unknown as Record<string, unknown>
  for (const [k, baseValue] of Object.entries(base)) {
    const current = target[k]
    if (typeof baseValue === 'number' && typeof current === 'number') {
      target[k] = current + (baseValue - current) * t
    } else if (baseValue && current && typeof baseValue === 'object' && typeof current === 'object') {
      // minorClutchChance/supportRoleWeights 같은 중첩 수치 맵도 같은 비율로 보간.
      const baseMap = baseValue as Record<string, number>
      const currentMap = current as Record<string, number>
      for (const kk of Object.keys(baseMap)) {
        if (typeof baseMap[kk] === 'number' && typeof currentMap[kk] === 'number') {
          currentMap[kk] = currentMap[kk] + (baseMap[kk] - currentMap[kk]) * t
        }
      }
    }
  }
  return clampDisposition(out)
}

/**
 * 성향을 앵커(기본은 BASE_DISPOSITION, 성장 시스템은 growthAnchorDisposition(growth)) 방향으로
 * rate만큼 완만히 되돌린다(평균회귀).
 * 로그라이크 특성상 사망 상향(×1.05대)이 생존 완화(×0.99)보다 잦아 성향이 클램프 상한/하한에
 * 눌러붙는 편향이 생기므로, 런마다 소량 회귀시켜 장기적으로 개인화가 중간 지대에 머물게 한다.
 */
export function revertDispositionTowardBase(
  d: EnaDisposition,
  rate: number,
  anchor: EnaDisposition = BASE_DISPOSITION
): EnaDisposition {
  const out = cloneDisposition(d)
  const base = anchor as unknown as Record<string, unknown>
  const target = out as unknown as Record<string, unknown>
  for (const [k, baseValue] of Object.entries(base)) {
    const current = target[k]
    if (typeof baseValue === 'number' && typeof current === 'number') {
      target[k] = current + (baseValue - current) * rate
    } else if (baseValue && current && typeof baseValue === 'object' && typeof current === 'object') {
      // situationChance/minorClutchChance 같은 중첩 수치 맵도 같은 비율로 회귀.
      const baseMap = baseValue as Record<string, number>
      const currentMap = current as Record<string, number>
      for (const kk of Object.keys(baseMap)) {
        if (typeof baseMap[kk] === 'number' && typeof currentMap[kk] === 'number') {
          currentMap[kk] = currentMap[kk] + (baseMap[kk] - currentMap[kk]) * rate
        }
      }
    }
  }
  return out
}

// ── 축 특화 초과 성장(앵커 상향 + 런 신호 적립) ──────────────────────────

/** 특화 1일 때 앵커가 확장 상한 방향으로 끌려가는 비율 — 평형점(평균회귀 목적지)을 실제로 올린다.
 *  0.35 기준 grit 특화 1의 앵커는 경험 탭 '불굴' 표시 ≈64%(특화 실효 상한 √정규화 기준)에
 *  대응하고, 90%대 표시는 확장 상한 근처까지 실제로 자란 동작값에서만 나온다. */
export const SPECIALIZATION_ANCHOR_LIFT = 0.35

/**
 * 평균회귀 앵커를 특화 축 방향으로 소폭 상향한다. 특화가 없으면 입력 앵커와 완전히 같아
 * (클램프 재적용은 멱등) 기존 회귀 동작이 보존된다. adaptToOutcome이 매 런 호출한다.
 */
export function specializedAnchorDisposition(
  anchor: EnaDisposition,
  specialization?: Partial<EnaSpecialization>
): EnaDisposition {
  const s = normalizeSpecialization(specialization)
  const out = cloneDisposition(anchor)
  for (const axis of SPECIALIZATION_AXES) {
    const spec = s[axis]
    if (spec <= 0) continue
    const lift = spec * SPECIALIZATION_ANCHOR_LIFT
    for (const { key, bound } of SPECIALIZED_SCALAR_KNOBS[axis]) {
      const target = extendHi(bound, spec).hi
      if (target > out[key]) out[key] += (target - out[key]) * lift
    }
    if (axis === 'minor') {
      const target = extendHi(PROB, spec).hi
      for (const k of Object.keys(out.minorClutchChance) as MinorClutchKind[]) {
        if (target > out.minorClutchChance[k]) {
          out.minorClutchChance[k] += (target - out.minorClutchChance[k]) * lift
        }
      }
    }
  }
  return clampDisposition(out, s)
}

/**
 * 런 1회의 특화 적립 튜닝 — 런당 적립은 아주 작게(축별 최대 2%p), 얕은 자살런 신호는 깊이
 * 감쇠로 미미하게, 총합은 runTotalCap으로 다시 자른다. 적립은 (1-현재 특화) 비례로 완만 포화.
 */
export const ENA_SPECIALIZATION_TUNING = {
  /** 예지 — 건넨 대비가 제때 쓰인 수(recordPredictionOutcome ≥1) 1건당. */
  perTimelyPrediction: 0.006,
  /** 수호 — 클러치 발동 목격 수(회피/반격/큰 클러치/각성 포함) 1건당. */
  perEffectiveClutch: 0.006,
  /** 온정 — 소소한 클러치 발동/보물 상호작용 1건당. */
  perWarmthInteraction: 0.0035,
  /** 불굴 — 런 누적 (받은 피해/최대체력) 1.0당. 깊이 계수와 곱해 '견디며 등반'만 인정한다. */
  gritPerDamageRatio: 0.008,
  /** 불굴 깊이 계수 분모 — min(1, 층/60). 얕은 층 탱킹은 거의 안 쌓인다. */
  gritDepthScale: 60,
  /** 예지/수호/온정 공통 얕은 런 감쇠 분모 — min(1, 층/40). */
  depthAttenuationFloor: 40,
  /** 축별 런당 적립 상한. */
  axisRunCap: 0.02,
  /** 런당 총 적립 상한(초과 시 축별 비례 축소). */
  runTotalCap: 0.04,
} as const

/** 런 1회의 특화 신호 — 전부 기존 드라마/관측 카운터에서 나온다(새 계측 없음). */
export interface EnaRunSpecializationSignals {
  floorReached: number
  timelyPredictions?: number
  effectiveClutches?: number
  warmthInteractions?: number
  damageTakenRatio?: number
}

/** 이번 런이 각 축에 얹는 적립분(0 이상, 하락 없음) — 축별 캡·잔여분 포화·총 캡을 모두 적용한 값. */
export function computeRunSpecializationGain(
  current: Partial<EnaSpecialization> | undefined,
  signals: EnaRunSpecializationSignals
): EnaSpecialization {
  const T = ENA_SPECIALIZATION_TUNING
  const cur = normalizeSpecialization(current)
  const floor = Math.max(0, signals.floorReached)
  const depth = Math.min(1, floor / T.depthAttenuationFloor)
  const n = (v: number | undefined) => Math.max(0, v ?? 0)
  const raw: EnaSpecialization = {
    predict: n(signals.timelyPredictions) * T.perTimelyPrediction * depth,
    protection: n(signals.effectiveClutches) * T.perEffectiveClutch * depth,
    minor: n(signals.warmthInteractions) * T.perWarmthInteraction * depth,
    grit: n(signals.damageTakenRatio) * T.gritPerDamageRatio * Math.min(1, floor / T.gritDepthScale),
  }
  const gains = zeroSpecialization()
  let total = 0
  for (const axis of SPECIALIZATION_AXES) {
    // 완만 포화: 특화가 찰수록 같은 신호의 적립이 잔여분에 비례해 줄어든다(1을 절대 못 넘음).
    gains[axis] = Math.min(T.axisRunCap, raw[axis]) * (1 - cur[axis])
    total += gains[axis]
  }
  if (total > T.runTotalCap) {
    const scale = T.runTotalCap / total
    for (const axis of SPECIALIZATION_AXES) gains[axis] *= scale
  }
  return gains
}

/** 현재 특화 + 이번 런 적립 — 단조 증가(하락 없음), 각 축 0~1. */
export function accumulateSpecialization(
  current: Partial<EnaSpecialization> | undefined,
  signals: EnaRunSpecializationSignals
): EnaSpecialization {
  const cur = normalizeSpecialization(current)
  const gains = computeRunSpecializationGain(cur, signals)
  const out = zeroSpecialization()
  for (const axis of SPECIALIZATION_AXES) out[axis] = Math.min(1, cur[axis] + gains[axis])
  return out
}

// ── 영구 저장(per-player) ─────────────────────────────────────────────────
// 플레이어별로 적응된 성향을 세션 넘어 유지한다. 브라우저 외 환경(테스트/SSR)에서는
// localStorage가 없을 수 있어 안전하게 무시한다. (import 주위가 아니라 저장 접근만 보호)

/** per-player 성향 저장 키 — `/리셋`(에나 경험 초기화) 등 외부 정리 경로가 import해 쓴다. */
export const ENA_DISPOSITION_STORAGE_KEY = 'ena-disposition-v1'
// EnaPolicyStore처럼 payload 자체에 스키마 버전을 남겨, 키 이름만으로는 못 잡는
// 구조 변경(필드 의미 변화 등)을 로드 시점에 거를 수 있게 한다.
const DISPOSITION_SCHEMA_VERSION = 1

/**
 * 저장된 per-player 성향을 불러온다.
 * 저장본이 없으면(신규 플레이어) BASE가 아니라 fallbackGrowth 앵커에서 시작한다 —
 * growth 0이면 ROOKIE 근방('입만 있는 동반자'). 기존 저장본은 병합 관례 그대로 로드해
 * 급격한 하향 없이 유지하고, 성장은 평균회귀 앵커 이동으로만 반영한다.
 */
export function loadDisposition(
  key: string = ENA_DISPOSITION_STORAGE_KEY,
  fallbackGrowth = 0,
  specialization?: Partial<EnaSpecialization>
): EnaDisposition {
  const fallback = (): EnaDisposition => growthAnchorDisposition(fallbackGrowth)
  if (typeof localStorage === 'undefined') return fallback()
  const raw = localStorage.getItem(key)
  if (!raw) return fallback()
  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && 'version' in parsed) {
      const envelope = parsed as { version: unknown; disposition?: unknown }
      if (envelope.version !== DISPOSITION_SCHEMA_VERSION) return fallback()
      return dispositionFromJSON(envelope.disposition, specialization)
    }
    // 레거시(버전 봉투 없는 평면 저장본)는 v1로 간주해 그대로 병합한다.
    return dispositionFromJSON(parsed, specialization)
  } catch {
    return fallback()
  }
}

/** 적응된 성향을 클램프 후 버전 봉투에 담아 저장한다. 저장 실패(용량/프라이빗 모드)는 조용히 무시한다.
 *  specialization을 주면 특화 확장 상한을 넘지 않는 초과값이 저장 시점에 잘리지 않는다. */
export function saveDisposition(
  d: EnaDisposition,
  key: string = ENA_DISPOSITION_STORAGE_KEY,
  specialization?: Partial<EnaSpecialization>
): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(
      key,
      JSON.stringify({
        version: DISPOSITION_SCHEMA_VERSION,
        disposition: clampDisposition(d, specialization),
      })
    )
  } catch {
    /* 저장 실패는 게임 진행을 막지 않는다. */
  }
}
