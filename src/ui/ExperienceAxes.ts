/**
 * ExperienceAxes — 경험(성향) 탭의 '성좌 축' 표시값 계산.
 *
 * 순수 계산 모듈로 분리한 이유: 표기 전용 배율이 실제 동작값(EnaDisposition)을
 * 절대 건드리지 않음을 테스트로 보장하기 위해서다. 렌더러(GameBoardRenderer)는
 * 여기서 얻은 0~1 값을 그리기만 한다.
 */

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
 * 원칙: 성좌(육각형) 모양은 항상 현재 성향의 **실제 원시 정규화값 비율 그대로**다.
 * 축별 목표값을 정해 보간하지 않고, 모든 개입 축에 같은 배율만 곱한다:
 *   displayed = rawAxis(disp) × boost(growth),  boost = start + (end − start) × growth
 * 그래서 개인화 적응으로 동작값이 움직이면 표기가 즉시 같이 움직인다.
 * - interventionStart 1.6: 신규(growth 0). ROOKIE 원시값이 작아(예지 ~0.11, 불굴 ~0.045)
 *   그대로는 성좌가 안 보이므로, 예지 ~17%·불굴 ~7% 대역으로 공통 확대한다.
 * - interventionEnd 1.05: 성장 완료(growth 1). BASE 원시값(예지 ~0.49)이 기존 표기
 *   상한 감각(~50%)에 안착한다. 하한 주의: 원시 성장폭이 가장 완만한 수호 축까지
 *   단조 증가를 지키려면 end ≥ start × rawBase/(2·rawBase − rawRookie) ≈ 1.02.
 * - chatStart 0.4: 수다 축 신규 배율. 성향 자체는 BASE와 같지만 초보 동반자의
 *   어색함을 표기로만 낮춘다(신규 ~18% → 성장 완료 ~46%).
 * ROOKIE/BASE 재피팅 시 대역이 어긋나지 않는지는 ExperienceAxes.test.ts가 앵커를
 * import해 검증한다(여기서 앵커 수치를 하드코딩하지 않는 이유).
 */
export const EXPERIENCE_AXIS_DISPLAY_BOOST = {
  interventionStart: 1.6,
  interventionEnd: 1.05,
  chatStart: 0.4,
} as const

// ── 원시 축 값(0~1) — 동작값을 정규화만 한 값. 표기는 이 값 × 공통 배율이 전부다. ─────

function rawPredict(disp: EnaDisposition): number {
  return norm(disp.predictBaseChance, 0.02, 0.95)
}

function rawProtection(disp: EnaDisposition): number {
  return (
    norm(disp.clutchStrength, 0.6, 1.6) +
    norm(disp.willGainPerDamage, 30, 100) +
    norm(disp.clutchHpThreshold, 0.2, 0.6)
  ) / 3
}

function rawMinor(disp: EnaDisposition): number {
  const mc = disp.minorClutchChance
  return norm((mc.crit + mc.dodge + mc.counter + mc.trap + mc.treasure) / 5, 0.02, 0.6)
}

function rawGrit(disp: EnaDisposition): number {
  return (
    norm(disp.awakenChance, 0.02, 0.4) * 0.55 +
    norm(disp.clutchAdversityBoost, 0.6, 2.4) * 0.3 +
    norm(disp.bondClimaxChance, 0, 0.25) * 0.15
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
  const iv = (raw: number) => clamp01(raw * boost)

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
