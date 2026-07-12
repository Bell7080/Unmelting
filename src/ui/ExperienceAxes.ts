/**
 * ExperienceAxes — 경험(성향) 탭의 '성좌 축' 표시값 계산.
 *
 * 순수 계산 모듈로 분리한 이유: 표기 전용 감쇠가 실제 동작값(EnaDisposition)을
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

/**
 * 축별 "표기 전용" 감쇠 계수 — 읽기 전용 표시에만 곱하고 동작값 경로에는 쓰지 않는다.
 * - predict(예지): 시뮬 재피팅 후 predictBaseChance≈0.45~0.5(원시 표기 ~46~49%)로
 *   혼자 치솟아 보여서, 다른 축(대략 10~17%대)과 시각 비율을 맞추도록 0.4배(≈20%)로 완화.
 * - protection(수호): 피격 빈도 탓에 과도하게 커 보이는 방패/보호 계열을 절반으로 완화.
 * - grit(불굴): 각성/역경 보정이 초반부터 높게 보이지 않도록 절반으로 완화.
 */
export const EXPERIENCE_AXIS_DISPLAY_SCALE = {
  predict: 0.4,
  protection: 0.5,
  grit: 0.5,
} as const

/** 성향 → 플레이어가 읽는 5개 '성좌 축'(0~1)으로 압축한다. 입력 disp는 변형하지 않는다. */
export function experienceAxes(disp: EnaDisposition, learning?: EnaLearningSnapshot): ExperienceAxis[] {
  const norm = (v: number, lo: number, hi: number) => Math.max(0, Math.min(1, (v - lo) / (hi - lo)))
  const sc = disp.situationChance
  const chat = (sc.hit + sc.web + sc.treasure + sc.kill + sc.survive + sc.flower + sc.event + sc.spore + sc.bomb) / 9
  // 수다 축은 저장 성향에 런-내 읽음/스킵 보상을 함께 반영해 경험 탭에서 즉시 오르내리게 한다.
  const liveChat = chat * (learning?.chattiness ?? 1)
  const mc = disp.minorClutchChance
  const minor = (mc.crit + mc.dodge + mc.counter + mc.trap + mc.treasure) / 5
  // 수호 축은 실제 동작값을 바꾸지 않고 경험 탭 표기만 완화한다. 방패/보호 계열은 실제 동작값의 절반으로 표시해 피격 빈도 때문에 수호만 과도하게 커 보이는 일을 줄인다.
  const guard = (
    norm(disp.clutchStrength, 0.6, 1.6) +
    norm(disp.willGainPerDamage, 30, 100) +
    norm(disp.clutchHpThreshold, 0.2, 0.6)
  ) / 3 * EXPERIENCE_AXIS_DISPLAY_SCALE.protection
  // 불굴은 각성/역경 보정이 초반부터 높게 보이지 않도록 표시만 절반으로 낮춘다.
  // 실제 각성·클러치 동작값은 유지해 밸런스와 RL 피팅 결과를 건드리지 않는다.
  const grit = (
    norm(disp.awakenChance, 0.02, 0.4) * 0.55 +
    norm(disp.clutchAdversityBoost, 0.6, 2.4) * 0.3 +
    norm(disp.bondClimaxChance, 0, 0.25) * 0.15
  ) * EXPERIENCE_AXIS_DISPLAY_SCALE.grit
  // 예지 축도 표기만 감쇠 — CompanionSystem의 실제 예측 발동은 원시 predictBaseChance를 그대로 쓴다.
  const predict = norm(disp.predictBaseChance, 0.02, 0.95) * EXPERIENCE_AXIS_DISPLAY_SCALE.predict
  return [
    { key: '수다', value: norm(liveChat, 0.12, 0.62), desc: '곁에서 말 거는 빈도' },
    { key: '예지', value: predict, desc: '위협을 미리 읽어 도구를 건넴' },
    { key: '수호', value: guard, desc: '위기에 회복·방패로 지켜냄' },
    { key: '온정', value: norm(minor, 0.02, 0.6), desc: '덤으로 슬쩍 건네는 선물' },
    { key: '불굴', value: grit, desc: '역경·유대로 한계를 잠깐 넘김' },
  ]
}
