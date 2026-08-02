import { describe, expect, it } from 'vitest'
import {
  BOSS_CORE_SPECS,
  BOSS_FIGHT_BUDGETS,
  ONBOARDING_CAT_SPEC,
  ONBOARDING_CAT_BUDGET,
  demonSummonSpec,
  demonSummonBudget,
} from './BossSpecs'
import {
  actionsToKill,
  bossAttackCardPool,
  bossGridModel,
  handCardDamage,
  type BossFightBudget,
} from './BossDamageBudget'
import {
  BOSS_GIMMICK_PROFILES,
  bossGimmickCellDurability,
  bossGimmickBreakDamage,
} from '@systems/BossGimmickManager'

/** 층 순서대로 본 정규 등반 보스. */
const CLIMB = [30, 60, 90, 100] as const

const ALL: { label: string; maxHp: number; fight: BossFightBudget }[] = [
  { label: '새싹 고양이', maxHp: ONBOARDING_CAT_SPEC.maxHp, fight: ONBOARDING_CAT_BUDGET },
  ...CLIMB.map((floor) => ({
    label: `${floor}F`,
    maxHp: BOSS_CORE_SPECS[floor].maxHp,
    fight: BOSS_FIGHT_BUDGETS[floor],
  })),
  { label: '악마(60턴)', maxHp: demonSummonSpec(60).maxHp, fight: demonSummonBudget(60) },
]

describe('보스 체력 곡선', () => {
  it('체력이 전투 가정의 목표 행동 수를 실제로 재현한다', () => {
    // 곡선의 진짜 불변식은 "화면 숫자"가 아니라 "전투가 몇 번의 행동으로 끝나는가"다.
    // 손패 3~4장의 기대 피해까지 포함해 계산하므로, 격자 보스의 큰 체력도 여기서
    // 같은 길이로 수렴해야 한다. (지원 화력 supportHits만큼은 더 빨리 끝난다.)
    for (const { label, maxHp, fight } of ALL) {
      const actions = actionsToKill(maxHp, fight)
      const expected = fight.targetActions
      expect(actions, `${label} 실제 행동 수`).toBeGreaterThanOrEqual(expected * 0.85)
      expect(actions, `${label} 실제 행동 수`).toBeLessThanOrEqual(expected * 1.35)
    }
  })

  it('전투 길이는 층이 오를수록 길어진다', () => {
    const actions = CLIMB.map((floor) => actionsToKill(BOSS_CORE_SPECS[floor].maxHp, BOSS_FIGHT_BUDGETS[floor]))
    for (let i = 1; i < actions.length; i++) {
      expect(actions[i], `${CLIMB[i]}F 전투 길이`).toBeGreaterThan(actions[i - 1])
    }
    // 온보딩은 가장 짧은 전투다.
    expect(actionsToKill(ONBOARDING_CAT_SPEC.maxHp, ONBOARDING_CAT_BUDGET))
      .toBeLessThan(actions[0])
  })

  it('공격력·반격 주기도 뒤로 갈수록 세진다', () => {
    const attacks = CLIMB.map((floor) => BOSS_CORE_SPECS[floor].attack)
    for (let i = 1; i < attacks.length; i++) expect(attacks[i]).toBeGreaterThan(attacks[i - 1])
    expect(ONBOARDING_CAT_SPEC.attack).toBeLessThan(BOSS_CORE_SPECS[30].attack)
  })

  it('격자가 없는 보스끼리는 체력도 층 순서를 지킨다', () => {
    // 격자 보스는 같은 전투 길이를 위해 체력이 3배 이상 두꺼워지므로 이 비교에서 뺀다.
    // (30F만 격자가 켜져 있어 화면 숫자가 60F보다 큰 상태다 — 알려진 간극이며,
    //  60F 이후에도 격자를 켜면 자연히 풀린다.)
    const flat = CLIMB.filter((floor) => BOSS_FIGHT_BUDGETS[floor].gimmickKind === null)
    const hps = flat.map((floor) => BOSS_CORE_SPECS[floor].maxHp)
    for (let i = 1; i < hps.length; i++) {
      expect(hps[i], `${flat[i]}F는 ${flat[i - 1]}F보다 두꺼워야 한다`).toBeGreaterThan(hps[i - 1])
    }
  })

  it('보스전 손패 지급 횟수가 보스마다 비슷한 범위에 있다', () => {
    for (const floor of CLIMB) {
      const spec = BOSS_CORE_SPECS[floor]
      const gifts = spec.maxHp / spec.handGiftStep
      expect(gifts, `${floor}F 지급 횟수`).toBeGreaterThanOrEqual(3)
      expect(gifts, `${floor}F 지급 횟수`).toBeLessThanOrEqual(16)
    }
  })

  it('광역 손패 한 장이 보스를 혼자 절반 넘게 지우지 않는다', () => {
    // 사용자가 짚은 지점: 샹들리에 유무로 난이도가 뒤집히면 곡선이 아니라 뽑기 게임이 된다.
    const chandelier = bossAttackCardPool().find((c) => c.id === 'chandelier')
    expect(chandelier).toBeTruthy()
    for (const { label, maxHp, fight } of ALL) {
      const damage = handCardDamage(chandelier!, fight.playerAttack, bossGridModel(fight.gimmickKind))
      expect(damage / maxHp, `${label} 샹들리에 단독 비중`).toBeLessThan(0.5)
    }
  })

  it('격자 보스의 칸 내구도·파괴 보너스가 새 체력에서 정상 범위로 파생된다', () => {
    for (const [kind, maxHp] of [
      ['waxArmy', BOSS_CORE_SPECS[30].maxHp],
      ['waxCat', ONBOARDING_CAT_SPEC.maxHp],
    ] as const) {
      const profile = BOSS_GIMMICK_PROFILES[kind]
      expect(profile, `${kind} 프로필`).toBeTruthy()
      const cells = (profile?.cols ?? 0) * (profile?.rows ?? 0)
      const durability = bossGimmickCellDurability(maxHp, cells)
      const breakDamage = bossGimmickBreakDamage(maxHp)
      expect(durability, `${kind} 내구도`).toBeGreaterThan(1)
      expect(durability, `${kind} 내구도`).toBeLessThan(maxHp)
      // 칸 절반을 깨면 눕는다는 기준이 새 체력에서도 유지된다.
      const halfGridDamage = Math.ceil(cells / 2) * (durability + breakDamage)
      expect(halfGridDamage).toBeGreaterThanOrEqual(maxHp * 0.85)
      expect(halfGridDamage).toBeLessThanOrEqual(maxHp * 1.35)
    }
  })

  it('악마는 발동이 늦을수록 두꺼워지고 같은 시점 등반 보스보다 세다', () => {
    const early = demonSummonSpec(30)
    const late = demonSummonSpec(90)
    expect(late.maxHp).toBeGreaterThan(early.maxHp)
    expect(late.attack).toBeGreaterThan(early.attack)
    // 선택 보스라 격자 없는 60F보다는 두껍고, 최종 보스보다는 얇다.
    expect(early.maxHp).toBeGreaterThan(BOSS_CORE_SPECS[60].maxHp)
    expect(late.maxHp).toBeLessThan(BOSS_CORE_SPECS[100].maxHp)
  })
})
