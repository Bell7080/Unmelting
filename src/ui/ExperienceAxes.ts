/**
 * ExperienceAxes — 경험(성향) 탭의 '성좌 축' 표시값 계산.
 *
 * 순수 계산 모듈로 분리한 이유: 표기 전용 배율이 실제 동작값(EnaDisposition)을
 * 절대 건드리지 않음을 테스트로 보장하기 위해서다. 렌더러(GameBoardRenderer)는
 * 여기서 얻은 0~1 값을 그리기만 한다.
 */

import { ROOKIE_DISPOSITION, SPECIALIZATION_MAX_EXTENSION } from '@systems/EnaDisposition'
import type { EnaDisposition } from '@systems/EnaDisposition'
import type { EnaLearningSnapshot } from '@systems/CompanionSystem'

export interface ExperienceAxis {
  key: string
  value: number
  desc: string
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))
const norm = (v: number, lo: number, hi: number) => clamp01((v - lo) / (hi - lo))

/**
 * "표기 전용" 성장 단계 공통 배율 — 동작값 경로에는 쓰지 않는다.
 *
 * 원칙: 성좌(육각형) 모양은 항상 현재 성향의 **실제 동작값**에서 나온다. 각 노브를
 * 특화 실효 상한(아래 effHi) 기준으로 정규화하고 √ 압축한 원시값에, 모든 개입 축에
 * 같은 배율만 곱한다(축별 목표값 보간 없음):
 *   displayed = √rawAxis(disp) × boost(growth),  boost = start + (end − start) × growth
 * 그래서 개인화 적응으로 동작값이 움직이면 표기가 즉시 같이 움직인다.
 * √ 압축은 작은 신규 값은 세워 주고 상한 근처 값은 눌러, 옛 클램프 상한에 포화된
 * 저장본이 100%에 붙는 과표시를 막는다(특화 없는 자연 상단 ≈ 63~70%).
 * - interventionStart 0.56: 신규(growth 0). ROOKIE 개입 바닥을 ~55%로 올려(안정감) 원시값이
 *   커진 만큼 이 배율을 낮춰 신규 육각형 크기를 이전과 같게 유지한다(예지 ~16%). 위기 배율을
 *   실효화(adversityBoost 0.8→1.2)한 불굴만 그 증폭분이 역경 축에 정직하게 반영돼 ~13%로 오른다.
 * - interventionEnd 1.0: 성장 완료(growth 1). 압축 정규화 원시값 그대로 — BASE 예지 ≈ 49%.
 *   start < end라 성장 앵커 경로(원시값·배율 동시 상승)의 단조 증가가 자동 보장된다.
 * - chatStart 0.4: 수다 축 신규 배율. 성향 자체는 BASE와 같지만 초보 동반자의
 *   어색함을 표기로만 낮춘다(신규 ~18% → 성장 완료 ~46%).
 * ROOKIE/BASE 재피팅 시 대역이 어긋나지 않는지는 ExperienceAxes.test.ts가 앵커를
 * import해 검증한다(여기서 앵커 수치를 하드코딩하지 않는 이유).
 */
export const EXPERIENCE_AXIS_DISPLAY_BOOST = {
  interventionStart: 0.56,
  interventionEnd: 1.0,
  chatStart: 0.4,
} as const

// ── 원시 축 값(0~1) — 동작값을 정규화만 한 값. 표기는 √(이 값) × 공통 배율이 전부다. ─────

/**
 * 정규화 상단 — clampDisposition의 특화 확장(extendHi, spec=1)과 동일 계산:
 * hi × (1 + SPECIALIZATION_MAX_EXTENSION). 특화 없는 성향은 안전 상한(hi)까지만 오를 수
 * 있어 원시값이 ~0.4-0.5에서 멈추고(→ 표시 100% 불가), 특화로 실제 초과 성장한 축만
 * 1에 접근한다. 아래 lo/hi 리터럴은 clampDisposition의 안전 경계와 같은 값이다.
 */
const effHi = (hi: number) => hi * (1 + SPECIALIZATION_MAX_EXTENSION)

function rawPredict(disp: EnaDisposition): number {
  return norm(disp.predictBaseChance, 0.02, effHi(0.95))
}

function rawProtection(disp: EnaDisposition): number {
  return (
    norm(disp.clutchStrength, 0.6, effHi(1.6)) +
    norm(disp.willGainPerDamage, 30, effHi(100)) +
    norm(disp.clutchHpThreshold, 0.2, effHi(0.6))
  ) / 3
}

function rawMinor(disp: EnaDisposition): number {
  const mc = disp.minorClutchChance
  // 0.6은 클램프 상한(0.95)이 아니라 5종 평균의 표시 자연 상단 — 확장 배율만 동일 적용.
  return norm((mc.crit + mc.dodge + mc.counter + mc.trap + mc.treasure) / 5, 0.02, effHi(0.6))
}

function rawGrit(disp: EnaDisposition): number {
  return (
    norm(disp.awakenChance, 0.02, effHi(0.4)) * 0.55 +
    norm(disp.clutchAdversityBoost, 0.6, effHi(2.4)) * 0.3 +
    norm(disp.bondClimaxChance, 0, effHi(0.25)) * 0.15
  )
}

/**
 * 성향 → 플레이어가 읽는 5개 '성좌 축'(0~1)으로 압축한다. 입력 disp는 변형하지 않는다.
 * growth(0~1, CompanionSystem.getGrowth)는 표기 배율에만 쓰이고, 생략 시 1(베테랑 표기).
 */
export function experienceAxes(
  disp: EnaDisposition,
  learning?: EnaLearningSnapshot,
  growth = 1,
): ExperienceAxis[] {
  const g = clamp01(growth)
  const B = EXPERIENCE_AXIS_DISPLAY_BOOST
  const boost = B.interventionStart + (B.interventionEnd - B.interventionStart) * g
  const chatBoost = B.chatStart + (1 - B.chatStart) * g
  // √ 압축 후 공통 배율 — 압축은 단조라 육각형의 축별 순서(비율 관계)는 보존된다.
  const iv = (raw: number) => clamp01(Math.sqrt(raw) * boost)

  const sc = disp.situationChance
  const chat = (sc.hit + sc.web + sc.treasure + sc.kill + sc.survive + sc.flower + sc.event + sc.spore + sc.bomb) / 9
  // 수다 축 원시값 — 저장 성향에 런-내 읽음/스킵 보상을 곱해 즉시 오르내린다.
  const liveChat = chat * (learning?.chattiness ?? 1)
  return [
    { key: '수다', value: clamp01(norm(liveChat, 0.12, 0.62) * chatBoost), desc: '곁에서 말 거는 빈도' },
    { key: '예지', value: iv(rawPredict(disp)), desc: '위협을 미리 읽어 도구를 건넴' },
    { key: '수호', value: iv(rawProtection(disp)), desc: '위기에 회복·방패로 지켜냄' },
    { key: '온정', value: iv(rawMinor(disp)), desc: '덤으로 슬쩍 건네는 선물' },
    { key: '불굴', value: iv(rawGrit(disp)), desc: '역경·유대로 한계를 잠깐 넘김' },
  ]
}

/**
 * 경험 탭 성좌가 "읽히는 모양"으로 남기 위한 캘리브레이션 대역 — **재피팅의 제약 조건**이다.
 *
 * 시뮬 피팅은 생존만 본다. 생존에 좋은 성향이 표기를 무너뜨릴 수 있어(예: 각성만 상한까지
 * 밀면 불굴 축이 혼자 튀어 육각형이 한 축짜리로 보인다) 재피팅 후보를 이 대역으로 거른다.
 * `ExperienceAxes.test.ts`와 `EnaDispositionFitter`가 **같은 이 표**를 읽는다 — 대역을 두 번
 * 적으면 한쪽만 고쳐져 제약이 조용히 풀린다.
 */
export const EXPERIENCE_CALIBRATION = {
  /** 성장 완료(BASE, growth 1) 예지 축이 앉아야 하는 자리. */
  basePredict: { lo: 0.45, hi: 0.55 },
  /** 성장 완료에서 예지 외 개입 축의 하한 — 이보다 낮으면 축이 사라져 보인다. */
  baseOtherMin: 0.15,
  /** 신규(ROOKIE, growth 0) 축 대역. */
  rookiePredict: { lo: 0.15, hi: 0.2 },
  rookieGrit: { lo: 0.09, hi: 0.14 },
  /** 신규에서 가장 먼 두 축의 간격 상한 — 넘으면 한 축만 튀어 보인다. */
  rookieSpreadMax: 0.12,
  /** 신규 축 순서 — 이 순서가 무너지면 성장 서사가 표기와 어긋난다. */
  rookieOrder: ['예지', '수호', '불굴', '온정'] as const,
} as const

/**
 * 후보 성향이 위 대역을 어기는 지점을 사람이 읽는 문장으로 돌려준다(빈 배열 = 통과).
 * 재피팅 CLI는 이걸 찍고, 피터는 이게 비어 있지 않은 후보를 아예 채택하지 않는다.
 */
export function experienceCalibrationViolations(base: EnaDisposition, rookie: EnaDisposition): string[] {
  const C = EXPERIENCE_CALIBRATION
  const out: string[] = []
  const at = (disp: EnaDisposition, key: string, growth: number) =>
    experienceAxes(disp, undefined, growth).find((a) => a.key === key)!.value

  const basePredict = at(base, '예지', 1)
  if (basePredict < C.basePredict.lo || basePredict > C.basePredict.hi) {
    out.push(`BASE 예지 ${basePredict.toFixed(3)} ∉ [${C.basePredict.lo}, ${C.basePredict.hi}]`)
  }
  for (const key of ['수호', '온정', '불굴'] as const) {
    const v = at(base, key, 1)
    if (v >= basePredict) out.push(`BASE ${key} ${v.toFixed(3)} ≥ 예지 ${basePredict.toFixed(3)} (예지가 가장 길어야 한다)`)
    if (v <= C.baseOtherMin) out.push(`BASE ${key} ${v.toFixed(3)} ≤ 하한 ${C.baseOtherMin}`)
  }

  const rookieValues = C.rookieOrder.map((key) => at(rookie, key, 0))
  for (let i = 1; i < rookieValues.length; i++) {
    if (!(rookieValues[i - 1] > rookieValues[i])) {
      out.push(`ROOKIE 축 순서 깨짐: ${C.rookieOrder[i - 1]} ${rookieValues[i - 1].toFixed(3)} ≤ ${C.rookieOrder[i]} ${rookieValues[i].toFixed(3)}`)
    }
  }
  const spread = Math.max(...rookieValues) - Math.min(...rookieValues)
  if (spread >= C.rookieSpreadMax) out.push(`ROOKIE 축 간격 ${spread.toFixed(3)} ≥ 상한 ${C.rookieSpreadMax}`)

  const rookiePredict = at(rookie, '예지', 0)
  if (rookiePredict < C.rookiePredict.lo || rookiePredict > C.rookiePredict.hi) {
    out.push(`ROOKIE 예지 ${rookiePredict.toFixed(3)} ∉ [${C.rookiePredict.lo}, ${C.rookiePredict.hi}]`)
  }
  const rookieGrit = at(rookie, '불굴', 0)
  if (rookieGrit < C.rookieGrit.lo || rookieGrit > C.rookieGrit.hi) {
    out.push(`ROOKIE 불굴 ${rookieGrit.toFixed(3)} ∉ [${C.rookieGrit.lo}, ${C.rookieGrit.hi}]`)
  }
  return out
}

/**
 * 경험 탭 점선 '기준 별자리' — 초보 에나의 시작 모양(ROOKIE_DISPOSITION, growth 0, 특화 0).
 * BASE(성장 완료) 앵커로 그리면 신규/리셋 직후 실측이 기준선보다 낮아 "감소"로 읽히므로,
 * 시작점에 앵커해 신규는 실선≈점선으로 겹치고 성장하면 실선이 점선을 넘어 자라게 한다.
 */
export function baselineConstellationAxes(): ExperienceAxis[] {
  return experienceAxes(ROOKIE_DISPOSITION, undefined, 0)
}
