import { describe, expect, it } from 'vitest'
import { BOSS_CORE_SPECS, ONBOARDING_CAT_SPEC, demonSummonSpec } from './BossSpecs'
import {
  BOSS_GIMMICK_PROFILES,
  bossGimmickCellDurability,
  bossGimmickBreakDamage,
} from '@systems/BossGimmickManager'

/** 층 순서대로 본 정규 등반 보스. */
const CLIMB = [30, 60, 90, 100] as const

describe('보스 체력 곡선', () => {
  it('층이 오를수록 체력이 반드시 올라간다', () => {
    // 화면에 뜨는 숫자가 내려가면 플레이어는 게임이 쉬워졌다고 읽는다.
    // (30F에 격자가 붙으며 한 번 깨졌던 관계다 — 다시 깨지지 않게 못 박는다.)
    const hps = CLIMB.map((floor) => BOSS_CORE_SPECS[floor].maxHp)
    for (let i = 1; i < hps.length; i++) {
      expect(hps[i], `${CLIMB[i]}F는 ${CLIMB[i - 1]}F보다 두꺼워야 한다`).toBeGreaterThan(hps[i - 1])
    }
    // 온보딩 보스는 정규 등반 보스보다 항상 얇다.
    expect(ONBOARDING_CAT_SPEC.maxHp).toBeLessThan(BOSS_CORE_SPECS[30].maxHp)
  })

  it('공격력·반격 주기도 뒤로 갈수록 세진다', () => {
    const attacks = CLIMB.map((floor) => BOSS_CORE_SPECS[floor].attack)
    for (let i = 1; i < attacks.length; i++) expect(attacks[i]).toBeGreaterThan(attacks[i - 1])
    expect(ONBOARDING_CAT_SPEC.attack).toBeLessThan(BOSS_CORE_SPECS[30].attack)
  })

  it('보스전 손패 지급 횟수가 보스마다 비슷한 범위에 있다', () => {
    // handGiftStep은 '대략 4타마다 1장' 규칙에서 나온다. 한 보스만 지급이 몰리면
    // 그 전투만 자원 경제가 다른 게임이 된다.
    for (const floor of CLIMB) {
      const spec = BOSS_CORE_SPECS[floor]
      const gifts = spec.maxHp / spec.handGiftStep
      expect(gifts, `${floor}F 지급 횟수`).toBeGreaterThanOrEqual(3)
      expect(gifts, `${floor}F 지급 횟수`).toBeLessThanOrEqual(14)
    }
  })

  it('격자 보스의 칸 내구도·파괴 보너스가 새 체력에서 정상 범위로 파생된다', () => {
    for (const [kind, spec] of [
      ['waxArmy', BOSS_CORE_SPECS[30]],
      ['waxCat', ONBOARDING_CAT_SPEC],
    ] as const) {
      const profile = BOSS_GIMMICK_PROFILES[kind]
      expect(profile, `${kind} 프로필`).toBeTruthy()
      const cells = (profile?.cols ?? 0) * (profile?.rows ?? 0)
      const durability = bossGimmickCellDurability(spec.maxHp, cells)
      const breakDamage = bossGimmickBreakDamage(spec.maxHp)
      // 한 대에 깨지지도, 체력보다 두껍지도 않아야 부위 파괴가 선택으로 남는다.
      expect(durability, `${kind} 내구도`).toBeGreaterThan(1)
      expect(durability, `${kind} 내구도`).toBeLessThan(spec.maxHp)
      // 칸 절반을 깨면 눕는다는 기준이 새 체력에서도 유지된다.
      const halfGridDamage = Math.ceil(cells / 2) * (durability + breakDamage)
      expect(halfGridDamage).toBeGreaterThanOrEqual(spec.maxHp * 0.85)
      expect(halfGridDamage).toBeLessThanOrEqual(spec.maxHp * 1.35)
    }
  })

  it('악마는 발동이 늦을수록 두꺼워지고 같은 시점 등반 보스보다 세다', () => {
    const early = demonSummonSpec(30)
    const late = demonSummonSpec(90)
    expect(late.maxHp).toBeGreaterThan(early.maxHp)
    expect(late.attack).toBeGreaterThan(early.attack)
    // 선택 보스라 30F보다는 두껍고, 최종 보스보다는 얇다.
    expect(early.maxHp).toBeGreaterThan(BOSS_CORE_SPECS[30].maxHp)
    expect(late.maxHp).toBeLessThan(BOSS_CORE_SPECS[100].maxHp)
  })
})
