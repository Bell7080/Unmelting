/**
 * BossSpecs — 보스 핵심 전투 스펙의 단일 출처.
 *
 * 실게임(BossEvent.ts의 BossDef)과 학습 시뮬(EnaTrainingSimulation의 BOSS_PROFILES)이
 * 같은 수치를 복제해 들고 있던 누수를 막는다. 보스 밸런싱은 이 파일만 고치면
 * 본편과 에나 학습 세계가 함께 움직인다. 연출/대사/스프라이트는 BossEvent.ts에 남긴다.
 *
 * ── 체력 곡선 ───────────────────────────────────────────────────────────────
 * 체력은 감으로 적지 않고 **전투 가정**(`BossFightBudget`)에서 역산한다. 계산 자체는
 * `BossDamageBudget`이 소유하고, 이 파일은 보스마다 그 가정 네 수만 정한다:
 *
 *   playerAttack  그 층에서 플레이어의 1타 예상 피해
 *   targetActions 전투를 끝내기까지의 목표 플레이어 행동 수
 *   handCards     그 전투에 쓴다고 보는 공격 손패 장수(보통 3~4장)
 *   supportHits   레시피·유물 시너지 등 모델 밖 화력의 '추가 직접 타격' 환산
 *
 * 손패를 빼고 `공격력 × 타수`로만 잡으면 **크게 빗나간다** — 격자 보스에서는 광역 손패
 * 한 장이 칸 수만큼 꽂혀 직접 타격 서너 번 몫을 하기 때문이다. 뽑기 운에 따른 실제
 * 폭은 `npm run balance:boss`로 확인한다.
 *
 * `handGiftStep`은 "대략 4행동마다 손패 1장"에서 나온다.
 */

import {
  bossHpForBudget,
  directHitDamage,
  bossGridModel,
  type BossFightBudget,
} from '@data/BossDamageBudget'

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

/** 손패 1장을 지급하는 간격(플레이어 행동 횟수 기준). */
export const ACTIONS_PER_HAND_GIFT = 4
/** 보스전에 들고 들어간다고 보는 공격 손패 기본 장수(3~4장의 중간). */
const DEFAULT_HAND_CARDS = 3.5
/** 레시피·유물 시너지 기본 환산치. 온보딩은 아직 그런 수단이 없어 0으로 둔다. */
const DEFAULT_SUPPORT_HITS = 2

/** 화면에 뜨는 수치라 식 결과를 그대로 쓰지 않고 눈에 읽히는 자리로 맞춘다. */
const roundTo = (value: number, step: number): number => Math.max(step, Math.round(value / step) * step)

function bossSpec(name: string, attack: number, attackInterval: number, fight: BossFightBudget): BossCoreSpec {
  const grid = bossGridModel(fight.gimmickKind)
  return {
    name,
    maxHp: roundTo(bossHpForBudget(fight), 10),
    attack,
    attackInterval,
    handGiftStep: roundTo(directHitDamage(fight.playerAttack, grid) * ACTIONS_PER_HAND_GIFT, 5),
  }
}

function fightBudget(
  partial: Omit<BossFightBudget, 'handCards' | 'supportHits'> & Partial<BossFightBudget>
): BossFightBudget {
  return { handCards: DEFAULT_HAND_CARDS, supportHits: DEFAULT_SUPPORT_HITS, ...partial }
}

/**
 * 정규 등반 보스(30/60/90/100F)의 전투 가정.
 *
 * `playerAttack`의 30F 값은 헤드리스 시뮬 실측(진입 시 평균 4.5)에서 나왔고,
 * 이후 층은 유물·강화팩 성장을 반영한 1차 가정이다. 실측이 쌓이면 여기부터 고친다.
 */
export const BOSS_FIGHT_BUDGETS: Record<30 | 60 | 90 | 100, BossFightBudget> = {
  // 30F는 13 → 9로 낮췄다(체력 220 → 160). 220은 리포트에서 실제 15~17행동이 나와
  // 첫 보스전치고 늘어졌고, 칸 내구도 27이라 약점 한 칸을 깨는 데도 품이 너무 들었다.
  // 100까지 내리면 내구도가 12로 떨어져 약점 칸이 두 방에 깨진다 — 격자를 처음
  // 배우는 자리에서 부위 파괴가 배우기도 전에 끝난다. 그 사이가 160이다.
  30: fightBudget({ playerAttack: 4, targetActions: 9, gimmickKind: 'waxArmy' }),
  60: fightBudget({ playerAttack: 7, targetActions: 16, gimmickKind: 'waxKnight' }),
  // 90F는 격자가 6칸이라 부위 파괴 배수가 낮다(×1.43 vs 9칸 ×1.82). 공격력 가정을
  // 9 → 10으로 올려 60F와 1타 피해가 붙어 버리는(=체력 곡선이 평평해지는) 것을 푼다.
  90: fightBudget({ playerAttack: 10, targetActions: 20, gimmickKind: 'waxSculptor' }),
  100: fightBudget({ playerAttack: 12, targetActions: 26, gimmickKind: 'waxWitch' }),
}

/** 새싹 온보딩 보스 — 격자는 켜져 있지만 레시피·유물이 아직 없어 지원 화력은 0이다. */
export const ONBOARDING_CAT_BUDGET: BossFightBudget = fightBudget({
  playerAttack: 3,
  // 광역 손패 한 장이 전투의 절반을 지우면 부위 파괴를 배우기 전에 끝난다 —
  // 격자를 처음 가르치는 자리라 한 장으로 무너지지 않을 만큼만 길게 잡는다.
  targetActions: 11,
  handCards: 2,        // 온보딩 손은 얇다 — 3~4장을 들고 들어가지 못한다.
  supportHits: 0,
  gimmickKind: 'waxCat',
})

/**
 * 손패 소각형 보스의 지급 배수 — 태우는 속도를 상쇄하려고 지급 간격을 절반으로 좁힌다.
 * 즉 같은 전투 길이에 손패가 두 배로 들어온다.
 */
export const HAND_BURN_RELIEF_FACTOR = 2
/** 지급 간격을 좁혀 보정한 보스 층. 검사도 이 목록을 보고 기대치를 세운다. */
export const HAND_BURN_RELIEF_FLOORS: ReadonlySet<number> = new Set([100])

export const BOSS_CORE_SPECS: Record<30 | 60 | 90 | 100, BossCoreSpec> = {
  30: bossSpec('양초 백작', 4, 2, BOSS_FIGHT_BUDGETS[30]),
  60: bossSpec('불씨 기사단장', 7, 2, BOSS_FIGHT_BUDGETS[60]),
  90: bossSpec('밀랍 조각사', 10, 3, BOSS_FIGHT_BUDGETS[90]),
  100: withHandBurnRelief(bossSpec('녹지 않는 마녀', 15, 2, BOSS_FIGHT_BUDGETS[100])),
}

/**
 * 손패 소각형 보스 보정 — 지급 간격을 절반으로 좁혀 태우는 속도를 상쇄한다.
 * 마녀는 공격 주기마다 손패 2장을 태우므로(1페이지 능력) 식대로 두면 손이 빈 채로
 * 3페이지를 맞는다. 소각이 있는 보스만의 보정이며 다른 보스에는 적용하지 않는다.
 */
function withHandBurnRelief(spec: BossCoreSpec): BossCoreSpec {
  return { ...spec, handGiftStep: roundTo(spec.handGiftStep / HAND_BURN_RELIEF_FACTOR, 5) }
}

/**
 * 새싹 병아리(온보딩) 30F 보스.
 * `handGiftStep`만 식이 아니라 넉넉하게 손으로 잡는다 — 처음 겪는 부위 파괴에서
 * 손이 비면 배우기 전에 진다.
 */
export const ONBOARDING_CAT_SPEC: BossCoreSpec = {
  ...bossSpec('양초 고양이', 3, 2, ONBOARDING_CAT_BUDGET),
  handGiftStep: 15,
}

/**
 * 악마는 정규 곡선과 같은 식을 쓰되, 선택 보스라 조금 더 길다.
 * 프리미엄을 체력이 아니라 **목표 행동 수**에 곱한다 — 체력에 곱하면 손패 피해가
 * 함께 커지지 않아 실제 전투 길이가 의도보다 더 늘어난다.
 *
 * 프리미엄이 과하면 **중간에 끼어드는 선택 보스가 최종 보스보다 긴 싸움**이 된다.
 * 1.35에서는 실제로 그랬다(악마 33행동 vs 마녀 28행동). 최종 보스보다 항상 짧게
 * 유지되도록 낮춰 잡는다.
 */
const DEMON_PREMIUM = 1.15

/** 악마 소환 레시피 이벤트 보스의 전투 가정 — 발동 턴이 늦을수록 커진다. */
export function demonSummonBudget(turn: number): BossFightBudget {
  return fightBudget({
    playerAttack: 4 + Math.floor(turn / 20),
    targetActions: Math.round((14 + Math.floor(turn / 12)) * DEMON_PREMIUM),
    gimmickKind: 'waxDemon',
  })
}

export function demonSummonSpec(turn: number): BossCoreSpec {
  const fight = demonSummonBudget(turn)
  const grid = bossGridModel(fight.gimmickKind)
  return {
    name: '검은 양초 악마',
    maxHp: roundTo(bossHpForBudget(fight), 10),
    attack: 3 + Math.floor(turn / 10),
    attackInterval: 2,
    handGiftStep: roundTo(directHitDamage(fight.playerAttack, grid) * ACTIONS_PER_HAND_GIFT, 5),
  }
}
