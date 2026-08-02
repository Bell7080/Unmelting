/**
 * BossSpecs — 보스 핵심 전투 스펙의 단일 출처.
 *
 * 실게임(BossEvent.ts의 BossDef)과 학습 시뮬(EnaTrainingSimulation의 BOSS_PROFILES)이
 * 같은 수치를 복제해 들고 있던 누수를 막는다. 보스 밸런싱은 이 파일만 고치면
 * 본편과 에나 학습 세계가 함께 움직인다. 연출/대사/스프라이트는 BossEvent.ts에 남긴다.
 *
 * ── 체력·손패 지급 곡선 (1차 밸런싱) ────────────────────────────────────────
 * 수치를 감으로 적지 않고 아래 두 식에서 뽑는다. 층이 바뀌거나 격자를 켜고 끄면
 * 식에 넣어 다시 계산한다 — 그래야 한 보스만 손봤을 때 곡선이 깨지지 않는다.
 *
 *   maxHp        = 층 예상 공격력 × 목표 타수 × 격자 배수
 *   handGiftStep = 층 예상 공격력 × 격자 배수 × 4        (= 대략 4타마다 손패 1장)
 *
 * - **층 예상 공격력**: 그 층에 닿았을 때 플레이어의 1타 피해. 30F ≈ 4는 헤드리스
 *   시뮬 실측(진입 시 평균 4.5)에서 나왔고, 이후 층은 유물·강화팩 성장을 반영한
 *   1차 가정이다. 실측 자료가 쌓이면 이 표부터 고친다.
 * - **목표 타수**: 그 보스를 눕히는 데 드는 직접 타격 횟수. 층이 오를수록 늘려
 *   후반 보스가 더 큰 싸움으로 읽히게 한다.
 * - **격자 배수 2**: 칸 기믹이 켜진 보스는 약점 칸(×2)을 골라 때리므로 같은 타수에
 *   두 배가 들어간다. HP를 두 배로 잡아야 체감 타수가 격자 없는 보스와 같아진다.
 *   광역 손패가 칸 수만큼 꽂히는 이득은 그대로 보상으로 남는다.
 */

/** 보스 한 명의 전투 핵심 수치(연출 제외). */
export interface BossCoreSpec {
  name: string
  maxHp: number
  attack: number
  /** 반격(공격) 주기 — n턴마다 1회. */
  attackInterval: number
  /** 보스 HP를 이만큼 잃을 때마다 플레이어 손패 1장 지급. */
  handGiftStep: number
}

/** 곡선의 입력값 — 위 주석의 식에 넣는 세 수. 밸런싱은 여기부터 고친다. */
interface BossCurveInput {
  /** 그 층에서 플레이어의 1타 예상 피해. */
  playerAttack: number
  /** 눕히는 데 드는 목표 직접 타격 횟수. */
  targetHits: number
  /** 칸 기믹 격자가 켜진 보스면 true(약점 조준으로 1타 피해가 두 배가 된다). */
  gimmick?: boolean
}

/** 격자 보스의 1타 피해 배수 — 약점 칸(×2)을 골라 때린다는 전제. */
const GIMMICK_HIT_MULTIPLIER = 2
/** 손패 1장을 지급하는 간격(직접 타격 횟수 기준). */
const HITS_PER_HAND_GIFT = 4

/** 화면에 뜨는 수치라 식 결과를 그대로 쓰지 않고 눈에 읽히는 자리로 맞춘다. */
const roundTo = (value: number, step: number): number => Math.max(step, Math.round(value / step) * step)

function bossSpec(name: string, attack: number, attackInterval: number, curve: BossCurveInput): BossCoreSpec {
  const perHit = curve.playerAttack * (curve.gimmick ? GIMMICK_HIT_MULTIPLIER : 1)
  return {
    name,
    maxHp: roundTo(perHit * curve.targetHits, 10),
    attack,
    attackInterval,
    handGiftStep: roundTo(perHit * HITS_PER_HAND_GIFT, 5),
  }
}

/**
 * 정규 등반 보스(30/60/90/100F).
 *
 * 100F만 `handGiftStep`을 식의 절반으로 낮춘다 — 마녀는 공격 주기마다 손패 2장을
 * 태우므로(1페이지 능력), 지급이 식대로면 태우는 속도를 못 따라가 손이 빈 채로
 * 3페이지를 맞는다. 소각이 있는 보스만의 보정이며 다른 보스에는 적용하지 않는다.
 */
export const BOSS_CORE_SPECS: Record<30 | 60 | 90 | 100, BossCoreSpec> = {
  30: bossSpec('양초 백작', 4, 2, { playerAttack: 4, targetHits: 13, gimmick: true }),
  60: bossSpec('불씨 기사단장', 7, 2, { playerAttack: 7, targetHits: 16 }),
  90: bossSpec('밀랍 조각사', 10, 3, { playerAttack: 9, targetHits: 20 }),
  100: withHandBurnRelief(bossSpec('녹지 않는 마녀', 15, 2, { playerAttack: 11, targetHits: 26 })),
}

/** 손패 소각형 보스 보정 — 지급 간격을 절반으로 좁혀 태우는 속도를 상쇄한다. */
function withHandBurnRelief(spec: BossCoreSpec): BossCoreSpec {
  return { ...spec, handGiftStep: roundTo(spec.handGiftStep / 2, 5) }
}

/**
 * 새싹 병아리(온보딩) 30F 보스. 격자가 켜져 있어 같은 식을 타되,
 * `handGiftStep`만 식(24)이 아니라 넉넉하게 손으로 잡는다 — 처음 겪는 부위 파괴에서
 * 손이 비면 배우기 전에 진다.
 */
export const ONBOARDING_CAT_SPEC: BossCoreSpec = {
  ...bossSpec('양초 고양이', 3, 2, { playerAttack: 3, targetHits: 10, gimmick: true }),
  handGiftStep: 10,
}

/**
 * 악마 소환 레시피 이벤트 보스 — 발동 턴에 비례해 자란다.
 * 정규 곡선 위에 얹은 선택 보스라 같은 시점의 등반 보스보다 3할쯤 두껍다.
 * (30턴 ≈ 152 / 60턴 ≈ 194 / 90턴 ≈ 236 — 30F와 90F 사이를 메운다.)
 */
export function demonSummonSpec(turn: number): BossCoreSpec {
  const playerAttack = 4 + Math.floor(turn / 20)   // 등반 곡선의 층 예상 공격력 근사
  return {
    name: '검은 양초 악마',
    maxHp: roundTo(110 + turn * 1.4, 10),
    attack: 3 + Math.floor(turn / 10),
    attackInterval: 2,
    handGiftStep: roundTo(playerAttack * HITS_PER_HAND_GIFT, 5),
  }
}
