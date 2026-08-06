import { describe, expect, it, beforeEach } from 'vitest'
import { GameState } from '@core/GameState'
import { BossGimmickManager } from './BossGimmickManager'
import { resolveBossCellFixtures } from './BossCellFixtures'

/** 배치를 고정해 함정/보물 칸 위치를 재현 가능하게 만든다. */
function stagedState(attack = 10): { gs: GameState; grid: BossGimmickManager } {
  const gs = new GameState()
  const grid = new BossGimmickManager(() => 0)
  grid.beginEncounter('waxArmy', 160, attack)
  gs.bossGimmicks = grid
  return { gs, grid }
}

describe('resolveBossCellFixtures — 칸 부가물 효과 정산', () => {
  let gs: GameState
  let grid: BossGimmickManager

  beforeEach(() => {
    const staged = stagedState()
    gs = staged.gs
    grid = staged.grid
    // 무시 확률이 굴러 들어와 판정이 흔들리지 않게 기본값을 명시한다.
    gs.character.trapIgnoreChance = 0
    gs.character.trapDamageBonus = 0
  })

  it('밟은 함정은 필드 함정과 같은 규칙으로 아프다', () => {
    const before = gs.character.health
    grid.strike({ cellIndex: grid.fixtureCells('trap')[0], baseDamage: 1 })

    const result = resolveBossCellFixtures(gs)

    expect(result.trapsTriggered).toBe(1)
    expect(result.trapDamageTaken).toBe(grid.trapDamage)
    expect(gs.character.health).toBe(before - grid.trapDamage)
  })

  it('함정 피해 보너스(역경 시련·유물)가 칸 함정에도 걸린다', () => {
    gs.character.trapDamageBonus = 3
    grid.strike({ cellIndex: grid.fixtureCells('trap')[0], baseDamage: 1 })

    expect(resolveBossCellFixtures(gs).trapDamageTaken).toBe(grid.trapDamage + 3)
  })

  it('함정 무시(함정의 대가)는 피해를 통째로 넘긴다', () => {
    gs.character.trapIgnoreChance = 1
    const before = gs.character.health
    grid.strike({ cellIndex: grid.fixtureCells('trap')[0], baseDamage: 1 })

    const result = resolveBossCellFixtures(gs)

    expect(result.trapsIgnored).toBe(1)
    expect(result.trapDamageTaken).toBe(0)
    expect(gs.character.health).toBe(before)
  })

  it('키틴 등으로 걷어낸 함정은 아프지 않다 — 그게 지우는 값어치다', () => {
    const before = gs.character.health
    grid.clearFixtureAt(grid.fixtureCells('trap')[0], 'trap')

    const result = resolveBossCellFixtures(gs)

    expect(result.trapsCleared).toBe(1)
    expect(result.trapDamageTaken).toBe(0)
    expect(gs.character.health).toBe(before)
  })

  it('밟든 지우든 함정 처리 유물 훅은 똑같이 발동한다', () => {
    // 필드 함정 카드와 보스 칸 함정이 같은 훅을 지나야 새 함정 유물을 두 곳에 적지 않는다.
    let resolved = 0
    gs.onTrapResolved = () => { resolved++ }

    grid.strike({ cellIndex: grid.fixtureCells('trap')[0], baseDamage: 1 })
    resolveBossCellFixtures(gs)
    expect(resolved).toBe(1)

    grid.clearFixtureAt(grid.fixtureCells('trap')[0], 'trap')
    resolveBossCellFixtures(gs)
    expect(resolved).toBe(2)
  })

  it('보물 부위는 때려서든 열쇠로든 손패를 준다', () => {
    const before = gs.character.hand.length
    grid.strike({ cellIndex: grid.fixtureCells('treasure')[0], baseDamage: 1 })

    const result = resolveBossCellFixtures(gs)

    expect(result.treasuresOpened).toBe(1)
    expect(result.treasureCardNames.length).toBeGreaterThan(0)
    expect(gs.character.hand.length).toBeGreaterThan(before)
  })

  it('대기 중인 사건이 없으면 아무 일도 하지 않는다', () => {
    const before = gs.character.health

    const result = resolveBossCellFixtures(gs)

    expect(result.trapsTriggered).toBe(0)
    expect(result.treasuresOpened).toBe(0)
    expect(gs.character.health).toBe(before)
  })

  it('정산은 한 번만 먹는다 — 두 번 불러도 두 배로 아프지 않다', () => {
    grid.strike({ cellIndex: grid.fixtureCells('trap')[0], baseDamage: 1 })
    const first = resolveBossCellFixtures(gs).trapDamageTaken
    const second = resolveBossCellFixtures(gs).trapDamageTaken

    expect(first).toBeGreaterThan(0)
    expect(second).toBe(0)
  })
})
