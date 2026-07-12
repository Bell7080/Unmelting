/**
 * ExperienceAxes — 경험(성향) 탭의 '성좌 축' 표시값 계산.
 *
 * 순수 계산 모듈로 분리한 이유: 표기 전용 리매핑이 실제 동작값(EnaDisposition)을
 * 절대 건드리지 않음을 테스트로 보장하기 위해서다. 렌더러(GameBoardRenderer)는
 * 여기서 얻은 0~1 값을 그리기만 한다.
 */

import { BASE_DISPOSITION, ROOKIE_DISPOSITION } from '@systems/EnaDisposition'
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
 * 개입 계열 축(예지/수호/온정/불굴)의 "표기 전용" 리매핑 상수 — 동작값 경로에는 쓰지 않는다.
 *
 * ROOKIE 성장 곡선 도입 후 원시값×감쇠 표기는 신규 시점에 4~5%로 붕괴해(수다만 ~46%)
 * 성좌가 한 축만 길어 보였다. 그래서 "ROOKIE→BASE 앵커 구간 대비 진행도"로 다시 그린다:
 *   displayed = start + (end[축] − start) × progress
 *   progress  = clamp01((rawAxis(disp) − rawAxis(ROOKIE)) / (rawAxis(BASE) − rawAxis(ROOKIE)))
 * - start 0.15: 신규(ROOKIE 앵커)에서도 축이 비어 보이지 않는 공통 시작 길이.
 * - end: 성장 완료(BASE 앵커) 시점 표시값. 기존 감쇠 표기의 이론 상한 대역(예지 0.4,
 *   수호/불굴 0.5)과 수다(~46%)에 맞춘 시각 균형값 — 도구 보급 존재감이 큰 예지를 가장
 *   길게(0.45), 수호/불굴 0.4, 덤 선물인 온정은 살짝 짧게 0.35.
 * ROOKIE/BASE 앵커는 EnaDisposition에서 import해 계산하므로 성향 재피팅 시 자동 추종한다.
 * BASE를 넘어 적응한 성향은 end에서 포화한다(진행도 클램프, 단조 증가 유지).
 */
export const EXPERIENCE_AXIS_DISPLAY_REMAP = {
  start: 0.15,
  end: { predict: 0.45, protection: 0.4, minor: 0.35, grit: 0.4 },
} as const

type RemappedAxis = keyof typeof EXPERIENCE_AXIS_DISPLAY_REMAP.end

// ── 원시 축 값(0~1) — 동작값을 정규화만 한 값. 리매핑의 진행도 입력으로만 쓴다. ─────────

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

const RAW_AXIS: Record<RemappedAxis, (disp: EnaDisposition) => number> = {
  predict: rawPredict,
  protection: rawProtection,
  minor: rawMinor,
  grit: rawGrit,
}

// 진행도 앵커 — 모듈 로드 시 1회 계산. ROOKIE/BASE 테이블 재피팅이 표기에 자동 반영된다.
const AXIS_PROGRESS_ANCHORS = (Object.keys(RAW_AXIS) as RemappedAxis[]).reduce(
  (acc, axis) => {
    acc[axis] = { rookie: RAW_AXIS[axis](ROOKIE_DISPOSITION), base: RAW_AXIS[axis](BASE_DISPOSITION) }
    return acc
  },
  {} as Record<RemappedAxis, { rookie: number; base: number }>,
)

/** 개입 축 표시값 — ROOKIE→BASE 진행도 리매핑. 실제 발동 확률/세기(동작값)는 읽기만 한다. */
function remapAxisDisplay(axis: RemappedAxis, disp: EnaDisposition): number {
  const anchor = AXIS_PROGRESS_ANCHORS[axis]
  const span = anchor.base - anchor.rookie
  // 재피팅으로 구간이 퇴화(ROOKIE≈BASE)하면 0 나눗셈 대신 완성 상태로 취급한다.
  const progress = span > 1e-9 ? clamp01((RAW_AXIS[axis](disp) - anchor.rookie) / span) : 1
  const { start, end } = EXPERIENCE_AXIS_DISPLAY_REMAP
  return start + (end[axis] - start) * progress
}

/** 성향 → 플레이어가 읽는 5개 '성좌 축'(0~1)으로 압축한다. 입력 disp는 변형하지 않는다. */
export function experienceAxes(disp: EnaDisposition, learning?: EnaLearningSnapshot): ExperienceAxis[] {
  const sc = disp.situationChance
  const chat = (sc.hit + sc.web + sc.treasure + sc.kill + sc.survive + sc.flower + sc.event + sc.spore + sc.bomb) / 9
  // 수다 축은 리매핑 없이 원시 정규화 유지 — 저장 성향에 런-내 읽음/스킵 보상을 곱해 즉시 오르내린다.
  const liveChat = chat * (learning?.chattiness ?? 1)
  return [
    { key: '수다', value: norm(liveChat, 0.12, 0.62), desc: '곁에서 말 거는 빈도' },
    { key: '예지', value: remapAxisDisplay('predict', disp), desc: '위협을 미리 읽어 도구를 건넴' },
    { key: '수호', value: remapAxisDisplay('protection', disp), desc: '위기에 회복·방패로 지켜냄' },
    { key: '온정', value: remapAxisDisplay('minor', disp), desc: '덤으로 슬쩍 건네는 선물' },
    { key: '불굴', value: remapAxisDisplay('grit', disp), desc: '역경·유대로 한계를 잠깐 넘김' },
  ]
}
