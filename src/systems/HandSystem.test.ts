import { describe, expect, it, vi } from 'vitest'
import { GameState } from '@core/GameState'
import { HandSystem } from './HandSystem'
import { DropSystem } from './DropSystem'
import { Card, CardType } from '@entities/Card'
import { BossGimmickManager } from './BossGimmickManager'
import { resolveBossCellFixtures } from './BossCellFixtures'

/** Count a specific hand-card id inside the active chain for behavior tests. */
function countChainEntries(chain: ReturnType<typeof HandSystem.newChain>, defId: string): number {
  return chain.sequence.filter((id) => id === defId).length
}

describe('HandSystem.enqueueDrop (획득 공통 정리 경로)', () => {
  it('같은 카드 3장째가 들어오면 즉시 트리플로 합성한다 — 에나 클러치/예지 보급이 공유하는 경로', () => {
    const gameState = new GameState()
    gameState.character.addHandCard(DropSystem.makeCard('ember'))
    gameState.character.addHandCard(DropSystem.makeCard('ember'))

    expect(HandSystem.enqueueDrop(gameState.character, DropSystem.makeCard('ember'))).toBe(true)

    expect(gameState.character.hand).toHaveLength(1)
    expect(gameState.character.hand[0]).toMatchObject({ defId: 'ember', merged: true })
  })
})

describe('HandSystem combo-count cards', () => {
  it('records a normal 카드 as one played card plus one explicit gauge count', () => {
    const gameState = new GameState()
    const chain = HandSystem.newChain()
    gameState.character.addHandCard(DropSystem.makeCard('card'))

    const result = HandSystem.useSingle(gameState, chain, 0)

    expect(result.success).toBe(true)
    expect(result.gaugeCountBonus).toBe(1)
    expect(countChainEntries(chain, 'card')).toBe(1)
    expect(gameState.character.candle).toBe(2)
    expect(HandSystem.hasPendingRecipe(chain)).toBe(false)
    expect(HandSystem.fireNextPendingRecipe(gameState, chain).firedRecipes).toHaveLength(0)
  })

  it('records a triple 카드 as one played card: 7 explicit counts + 3 for the merged play', () => {
    const gameState = new GameState()
    const chain = HandSystem.newChain()
    gameState.character.addHandCard({ ...DropSystem.makeCard('card'), merged: true })

    const result = HandSystem.useSingle(gameState, chain, 0)

    expect(result.success).toBe(true)
    expect(result.gaugeCountBonus).toBe(7)
    expect(countChainEntries(chain, 'card')).toBe(1)
    // 트리플 카드 전용 +7 + 트리플 플레이 보정 +3 = 10.
    expect(gameState.character.candle).toBe(10)
    expect(HandSystem.previewTriggeredRecipes(HandSystem.newChain(), 'card', true)).toHaveLength(0)
  })

  it('fires 셔플 only after two physical 카드 uses, regardless of gauge-count bonuses', () => {
    const gameState = new GameState()
    const chain = HandSystem.newChain()
    gameState.character.addHandCard(DropSystem.makeCard('card'))
    gameState.character.addHandCard(DropSystem.makeCard('card'))

    HandSystem.useSingle(gameState, chain, 0)
    expect(HandSystem.hasPendingRecipe(chain)).toBe(false)

    HandSystem.useSingle(gameState, chain, 0)
    const fired = HandSystem.fireNextPendingRecipe(gameState, chain).firedRecipes

    expect(fired).toHaveLength(1)
    expect(fired[0]?.recipe.id).toBe('shuffle')
  })

  it('still advances the hand gauge once without per-card candleGain data', () => {
    const gameState = new GameState()
    const chain = HandSystem.newChain()
    gameState.character.addHandCard(DropSystem.makeCard('coin'))

    HandSystem.useSingle(gameState, chain, 0)

    expect(gameState.character.candle).toBe(1)
  })
})

describe('HandSystem broad hand effects', () => {
  it('lets 밀랍 target and freeze front-row timed hazards and flowers', () => {
    const gameState = new GameState()
    const chain = HandSystem.newChain()
    const spore = new Card('spore-front', CardType.TRAP, '감염 포자', 'test', 0, 1, {
      trapKind: 'spore',
    })
    gameState.lanes[0].setCardAtDistance(0, spore)
    gameState.character.addHandCard(DropSystem.makeCard('wax'))

    const result = HandSystem.useSingle(gameState, chain, 0, {
      laneIndex: 0,
      distance: 0,
      card: spore,
    })

    expect(result.success).toBe(true)
    expect(spore.isFrozen()).toBe(true)
  })

  it('lets 밀랍 target and freeze a front-row boss card', () => {
    const gameState = new GameState()
    const chain = HandSystem.newChain()
    const boss = new Card('boss-front', CardType.BOSS, '양초 백작', 'test boss', 60, 5, {
      specialEnemyKind: 'waxArmy',
    })
    gameState.lanes[0].setCardAtDistance(0, boss)
    gameState.character.addHandCard(DropSystem.makeCard('wax'))

    const result = HandSystem.useSingle(gameState, chain, 0, {
      laneIndex: 0,
      distance: 0,
      card: boss,
    })

    expect(result.success).toBe(true)
    expect(boss.frozenTurns).toBe(1)
  })

  it('칼날 파편은 필드 랜덤 적 1장에게 1피해를 준다(생성기 시너지 씨앗)', () => {
    const gameState = new GameState()
    const chain = HandSystem.newChain()
    const enemy = new Card('e1', CardType.ENEMY, '적', 'test', 5, 1, {})
    gameState.lanes[0].setCardAtDistance(0, enemy)
    gameState.character.addHandCard(DropSystem.makeCard('blade-shard'))

    // selection 'random'이라 대상 클릭 없이 사용된다(적이 1체면 그 적이 피해를 받는다).
    const result = HandSystem.useSingle(gameState, chain, 0)

    expect(result.success).toBe(true)
    expect(enemy.getHealth()).toBe(4)
  })

  it('강화된 칼날 파편은 강화치만큼 더 큰 피해를 준다(연마 누적 연동)', () => {
    const gameState = new GameState()
    const chain = HandSystem.newChain()
    const enemy = new Card('e1', CardType.ENEMY, '적', 'test', 5, 1, {})
    gameState.lanes[0].setCardAtDistance(0, enemy)
    gameState.enhancements.singleBonus['blade-shard'] = 2 // 연마가 칼날 강화치를 +2 누적한 상태
    gameState.character.addHandCard(DropSystem.makeCard('blade-shard'))

    HandSystem.useSingle(gameState, chain, 0)

    expect(enemy.getHealth()).toBe(2) // 1 + 2 = 3 피해
  })

  it('칼날의 서는 실제 발수만큼 무작위 표적 순서를 UI 결과에 보존한다', () => {
    const gameState = new GameState()
    const chain = HandSystem.newChain()
    const enemy = new Card('tome-target', CardType.ENEMY, '연습 표적', 'test', 20, 1, {})
    gameState.lanes[0].setCardAtDistance(0, enemy)
    // 누적 10회면 기본 1발에 2발이 더해져 총 3발이다.
    gameState.enhancements.bladeShardUseCount = 10
    gameState.character.addHandCard(DropSystem.makeCard('blade-tome'))

    const result = HandSystem.useSingle(gameState, chain, 0)

    expect(result.success).toBe(true)
    expect(result.hitSequence?.map((hit) => hit.targetCardId)).toEqual([
      'tome-target', 'tome-target', 'tome-target',
    ])
    expect(result.hitSequence?.map((hit) => hit.actualDamage)).toEqual([1, 1, 1])
    expect(result.hitSequence?.reduce((sum, hit) => sum + hit.actualDamage, 0)).toBe(3)
  })

  it('트리플 바늘은 세 발의 대상 순서·총피해·마지막 처치를 공용 결과로 보존한다', () => {
    const gameState = new GameState()
    const chain = HandSystem.newChain()
    const first = new Card('needle-a', CardType.ENEMY, '첫 표적', 'test', 1, 1, {})
    const second = new Card('needle-b', CardType.ENEMY, '둘째 표적', 'test', 2, 1, {})
    gameState.lanes[0].setCardAtDistance(0, first)
    gameState.lanes[1].setCardAtDistance(0, second)
    gameState.character.addHandCard({ ...DropSystem.makeCard('needle'), merged: true })
    // 첫 발은 첫 적을 처치하고, 남은 두 발은 살아 있는 둘째 적을 이어 친다.
    const random = vi.spyOn(Math, 'random').mockReturnValue(0)

    const result = HandSystem.useSingle(gameState, chain, 0)
    random.mockRestore()

    expect(result.hitSequence?.map((hit) => hit.targetCardId)).toEqual([
      'needle-a', 'needle-b', 'needle-b',
    ])
    expect(result.hitSequence?.reduce((sum, hit) => sum + hit.actualDamage, 0)).toBe(3)
    expect(result.hitSequence?.map((hit) => hit.killed)).toEqual([true, false, true])
    // 회복량은 UI가 처치 확인 뒤 적용하는 기존 계약을 그대로 유지한다.
    expect(result.needleHealOnKill).toBe(5)
  })

  it('makes triple 밀랍 freeze every front-row turn timer card', () => {
    const gameState = new GameState()
    const chain = HandSystem.newChain()
    const flower = new Card('flower-front', CardType.FLOWER, '캐모마일', 'test', 0, 0, {
      flowerKind: 'chamomile',
    })
    flower.bloom('chamomile')
    const bomb = new Card('bomb-front', CardType.TRAP, '양초 폭탄', 'test', 0, 0, {
      trapKind: 'bomb',
    })
    const web = new Card('web-front', CardType.TRAP, '거미줄', 'test', 0, 2, { trapKind: 'web' })
    gameState.lanes[0].setCardAtDistance(0, flower)
    gameState.lanes[1].setCardAtDistance(0, bomb)
    gameState.lanes[2].setCardAtDistance(0, web)
    gameState.character.addHandCard({ ...DropSystem.makeCard('wax'), merged: true })

    const result = HandSystem.useSingle(gameState, chain, 0)

    expect(result.success).toBe(true)
    expect(flower.frozenTurns).toBe(3)
    expect(bomb.frozenTurns).toBe(3)
    expect(web.frozenTurns).toBe(0)
  })

  /** Count visible spore references after a Holy Water cleanup. */
  const countSpores = (gameState: GameState): number =>
    gameState.lanes
      .flatMap((lane) => [0, 1, 2].map((distance) => lane.getCardAtDistance(distance)))
      .filter((card) => card?.type === CardType.TRAP && card.trapKind === 'spore').length

  it('makes normal 성수 remove only two random spores', () => {
    const gameState = new GameState()
    const chain = HandSystem.newChain()
    const web = new Card('web-a', CardType.TRAP, '거미줄', 'test', 0, 2, { trapKind: 'web' })
    gameState.lanes[0].setCardAtDistance(
      0,
      new Card('spore-a', CardType.TRAP, '포자 A', 'test', 0, 1, { trapKind: 'spore' })
    )
    gameState.lanes[1].setCardAtDistance(
      0,
      new Card('spore-b', CardType.TRAP, '포자 B', 'test', 0, 1, { trapKind: 'spore' })
    )
    gameState.lanes[2].setCardAtDistance(
      0,
      new Card('spore-c', CardType.TRAP, '포자 C', 'test', 0, 1, { trapKind: 'spore' })
    )
    gameState.lanes[0].setCardAtDistance(1, web)
    gameState.character.addHandCard(DropSystem.makeCard('holy-water'))

    const result = HandSystem.useSingle(gameState, chain, 0)

    expect(result.success).toBe(true)
    expect(result.message).toContain('포자 2장 제거')
    expect(countSpores(gameState)).toBe(1)
    expect(gameState.lanes[0].getCardAtDistance(1)).toBe(web)
  })

  it('makes triple 성수 remove every spore while preserving other traps', () => {
    const gameState = new GameState()
    const chain = HandSystem.newChain()
    const web = new Card('web-a', CardType.TRAP, '거미줄', 'test', 0, 2, { trapKind: 'web' })
    gameState.lanes[0].setCardAtDistance(
      0,
      new Card('spore-a', CardType.TRAP, '포자 A', 'test', 0, 1, { trapKind: 'spore' })
    )
    gameState.lanes[1].setCardAtDistance(
      0,
      new Card('spore-b', CardType.TRAP, '포자 B', 'test', 0, 1, { trapKind: 'spore' })
    )
    gameState.lanes[2].setCardAtDistance(
      0,
      new Card('spore-c', CardType.TRAP, '포자 C', 'test', 0, 1, { trapKind: 'spore' })
    )
    gameState.lanes[0].setCardAtDistance(1, web)
    gameState.character.addHandCard({ ...DropSystem.makeCard('holy-water'), merged: true })

    const result = HandSystem.useSingle(gameState, chain, 0)

    expect(result.success).toBe(true)
    expect(result.message).toContain('트리플 전체 포자 3장 제거')
    expect(countSpores(gameState)).toBe(0)
    expect(gameState.lanes[0].getCardAtDistance(1)).toBe(web)
  })

  it('lets normal 키틴 remove a selected 2칸 front trap but reject a 3칸 trap', () => {
    // 키틴 일반판의 폭 제한을 고정해 3칸 함정이 실수로 허용되지 않게 한다.
    const gameState = new GameState()
    const chain = HandSystem.newChain()
    const twoSpanTrap = new Card('trap-2span', CardType.TRAP, '2칸 함정', 'test', 0, 2)
    twoSpanTrap.groupCount = 2
    gameState.lanes[0].setCardAtDistance(0, twoSpanTrap)
    gameState.lanes[1].setCardAtDistance(0, twoSpanTrap)
    gameState.character.addHandCard(DropSystem.makeCard('chitin'))

    const removeTwoSpan = HandSystem.useSingle(gameState, chain, 0, {
      laneIndex: 0,
      distance: 0,
      card: twoSpanTrap,
    })

    expect(removeTwoSpan.success).toBe(true)
    expect(gameState.lanes[0].getCardAtDistance(0)).toBeNull()
    expect(gameState.lanes[1].getCardAtDistance(0)).toBeNull()

    const threeSpanTrap = new Card('trap-3span', CardType.TRAP, '3칸 함정', 'test', 0, 2)
    threeSpanTrap.groupCount = 3
    gameState.lanes[0].setCardAtDistance(0, threeSpanTrap)
    gameState.lanes[1].setCardAtDistance(0, threeSpanTrap)
    gameState.lanes[2].setCardAtDistance(0, threeSpanTrap)
    gameState.character.addHandCard(DropSystem.makeCard('chitin'))

    const rejectThreeSpan = HandSystem.useSingle(gameState, chain, 0, {
      laneIndex: 0,
      distance: 0,
      card: threeSpanTrap,
    })

    expect(rejectThreeSpan.success).toBe(false)
    expect(gameState.lanes[0].getCardAtDistance(0)).toBe(threeSpanTrap)
    expect(gameState.lanes[1].getCardAtDistance(0)).toBe(threeSpanTrap)
    expect(gameState.lanes[2].getCardAtDistance(0)).toBe(threeSpanTrap)
  })

  it('lets triple 키틴 remove a selected 3칸 front trap', () => {
    // 사용자 제보 회귀 방지: 트리플 키틴은 선택한 3칸짜리 전방 함정을 제거해야 한다.
    const gameState = new GameState()
    const chain = HandSystem.newChain()
    const threeSpanTrap = new Card('trap-3span', CardType.TRAP, '3칸 함정', 'test', 0, 2)
    threeSpanTrap.groupCount = 3
    gameState.lanes[0].setCardAtDistance(0, threeSpanTrap)
    gameState.lanes[1].setCardAtDistance(0, threeSpanTrap)
    gameState.lanes[2].setCardAtDistance(0, threeSpanTrap)
    gameState.character.addHandCard({ ...DropSystem.makeCard('chitin'), merged: true })

    const result = HandSystem.useSingle(gameState, chain, 0, {
      laneIndex: 0,
      distance: 0,
      card: threeSpanTrap,
    })

    expect(result.success).toBe(true)
    expect(result.message).toContain('3칸 함정 제거')
    expect(gameState.lanes[0].getCardAtDistance(0)).toBeNull()
    expect(gameState.lanes[1].getCardAtDistance(0)).toBeNull()
    expect(gameState.lanes[2].getCardAtDistance(0)).toBeNull()
  })

  it('triple 키틴 removes a gc=3 web produced by regroupRow merging gc1+gc2 cards', () => {
    // 회귀 방지: gc=1 거미줄(lane0) + gc=2 거미줄(lane1-2)이 regroupRow에서 합쳐질 때
    // 이전 구현은 gc=5로 이중 합산되어 maxSpan=3 검사를 통과하지 못했다.
    const gameState = new GameState()
    const chain = HandSystem.newChain()

    // gc=2 web occupies lanes 1 and 2 (same object reference)
    const webGc2 = new Card('web-gc2', CardType.TRAP, '거미줄', 'test', 0, 2, { trapKind: 'web' })
    webGc2.groupCount = 2
    gameState.lanes[1].setCardAtDistance(0, webGc2)
    gameState.lanes[2].setCardAtDistance(0, webGc2)

    // gc=1 web in lane 0
    const webGc1 = new Card('web-gc1', CardType.TRAP, '거미줄', 'test', 0, 2, { trapKind: 'web' })
    webGc1.groupCount = 1
    gameState.lanes[0].setCardAtDistance(0, webGc1)

    // regroupRow should produce a single gc=3 card, not gc=5
    gameState.regroupRow(0)
    const merged = gameState.lanes[0].getCardAtDistance(0)
    expect(merged).not.toBeNull()
    expect(merged!.groupCount).toBe(3)
    expect(gameState.lanes[1].getCardAtDistance(0)).toBe(merged)
    expect(gameState.lanes[2].getCardAtDistance(0)).toBe(merged)

    // Triple 키틴 must be able to remove this gc=3 web
    gameState.character.addHandCard({ ...DropSystem.makeCard('chitin'), merged: true })
    const result = HandSystem.useSingle(gameState, chain, 0, {
      laneIndex: 0,
      distance: 0,
      card: merged!,
    })

    expect(result.success).toBe(true)
    expect(gameState.lanes[0].getCardAtDistance(0)).toBeNull()
    expect(gameState.lanes[1].getCardAtDistance(0)).toBeNull()
    expect(gameState.lanes[2].getCardAtDistance(0)).toBeNull()
  })
})

describe('HandSystem 보스 칸 기믹 연동', () => {
  /** 격자를 낀 보스 하나만 필드에 세운다(실제 30F 배치와 동일하게 3레인 dist-0 점유).
   *  격자 내구도는 hp에서 파생되므로, 부위 파괴를 섞고 싶지 않은 테스트는 hp를 크게 잡는다. */
  function stageGriddedBoss(hp: number): { gameState: GameState; boss: Card; grid: BossGimmickManager } {
    const gameState = new GameState()
    const boss = new Card('boss-test', CardType.BOSS, '양초 백작', '보스', hp, 4, {
      specialEnemyKind: 'waxArmy',
    })
    boss.enemyHealthTotal = hp
    for (let i = 0; i < 3; i++) gameState.lanes[i].setCardAtDistance(0, boss)
    // rng 고정으로 칸 배치를 재현 가능하게 만든다.
    const grid = new BossGimmickManager(() => 0)
    grid.beginEncounter('waxArmy', hp)
    gameState.bossGimmicks = grid
    return { gameState, boss, grid }
  }

  it('겨눈 칸이 약점이면 선택형 손패 피해가 2배로 들어간다', () => {
    const { gameState, boss, grid } = stageGriddedBoss(200)
    const weak = grid.getCells().find((c) => c.kind === 'weak')
    const plain = grid.getCells().find((c) => c.kind === 'plain')
    gameState.character.addHandCard(DropSystem.makeCard('ember'))
    gameState.character.addHandCard(DropSystem.makeCard('ember'))
    const target = { laneIndex: 0, distance: 0, card: boss }

    const before = boss.getHealth()
    HandSystem.useSingle(gameState, HandSystem.newChain(), 0, { ...target, gimmickCellIndex: plain?.index })
    const plainDealt = before - boss.getHealth()

    const beforeWeak = boss.getHealth()
    HandSystem.useSingle(gameState, HandSystem.newChain(), 0, { ...target, gimmickCellIndex: weak?.index })
    const weakDealt = beforeWeak - boss.getHealth()

    expect(plainDealt).toBeGreaterThan(0)
    expect(weakDealt).toBe(plainDealt * 2)
  })

  it('키틴이 보스 칸의 함정 부가물을 겨눠 지운다 — 보스는 때리지 않는다', () => {
    // 키틴은 TRAP만 겨누는 손패라 보스 카드에는 닿지 않는다. 칸에 얹힌 함정은
    // 칸 하나짜리 대상이므로 겨눌 수 있어야 한다 — 아니면 지울 방법이 없다.
    const { gameState, boss, grid } = stageGriddedBoss(500)
    const trapCell = grid.fixtureCells('trap')[0]
    gameState.character.addHandCard(DropSystem.makeCard('chitin'))
    const bossHpBefore = boss.getHealth()

    const result = HandSystem.useSingle(gameState, HandSystem.newChain(), 0, {
      laneIndex: 0,
      distance: 0,
      card: boss,
      gimmickCellIndex: trapCell,
    })

    expect(result.success).toBe(true)
    expect(grid.fixtureAt(trapCell)).toBeNull()
    // 걷어낸 것이지 때린 것이 아니다.
    expect(boss.getHealth()).toBe(bossHpBefore)
    expect(grid.takeFixtureEvents()).toEqual([
      { cellIndex: trapCell, fixture: 'trap', cause: 'cleared' },
    ])
  })

  it('빗자루가 보스 칸 함정을 지운다 — 함정 지우는 손패는 전부 닿는다', () => {
    // 빗자루는 대상을 고르지 않는 광역 청소(selection: all)라 보스전에서도 쓸 수 있다.
    // 필드 거미줄이 하나도 없어도 보스 몸의 함정 부위는 걷어야 한다.
    const { gameState, boss, grid } = stageGriddedBoss(500)
    const before = grid.fixtureCells('trap').length
    gameState.character.addHandCard(DropSystem.makeCard('sweep'))
    const bossHpBefore = boss.getHealth()

    const result = HandSystem.useSingle(gameState, HandSystem.newChain(), 0, undefined)

    expect(before).toBeGreaterThan(0)
    expect(result.success).toBe(true)
    expect(grid.fixtureCells('trap')).toHaveLength(0)
    // 청소지 공격이 아니다.
    expect(boss.getHealth()).toBe(bossHpBefore)
    expect(grid.takeFixtureEvents().every((e) => e.cause === 'cleared')).toBe(true)
  })

  it('성수 트리플도 보스 칸 함정에 닿는다 — 포자 전용 필터도 공용 함정으로 본다', () => {
    const { gameState, grid } = stageGriddedBoss(500)
    for (let i = 0; i < 3; i++) gameState.character.addHandCard(DropSystem.makeCard('holy-water'))

    HandSystem.useSingle(gameState, HandSystem.newChain(), 0, undefined)

    expect(grid.fixtureCells('trap')).toHaveLength(0)
  })

  it('부가물이 없는 칸을 키틴으로 겨누면 거절된다', () => {
    const { gameState, boss, grid } = stageGriddedBoss(500)
    const bare = grid.getCells().find((c) => c.fixture === null)!
    gameState.character.addHandCard(DropSystem.makeCard('chitin'))

    const result = HandSystem.useSingle(gameState, HandSystem.newChain(), 0, {
      laneIndex: 0,
      distance: 0,
      card: boss,
      gimmickCellIndex: bare.index,
    })

    expect(result.success).toBe(false)
    expect(gameState.character.hand).toHaveLength(1)
  })

  it('때린 칸의 부가물은 정산 대기열에 오른다 — 배율 피해와 같은 타격에서', () => {
    const { gameState, boss, grid } = stageGriddedBoss(500)
    const trapCell = grid.fixtureCells('trap')[0]
    gameState.character.addHandCard(DropSystem.makeCard('ember'))
    const before = boss.getHealth()

    HandSystem.useSingle(gameState, HandSystem.newChain(), 0, {
      laneIndex: 0,
      distance: 0,
      card: boss,
      gimmickCellIndex: trapCell,
    })

    expect(boss.getHealth()).toBeLessThan(before)
    expect(grid.takeFixtureEvents().map((e) => e.cause)).toEqual(['triggered'])
  })

  it('필드 전체 피해는 보스를 칸 수만큼 때린다 — 광역기가 크게 들어간다', () => {
    const { gameState, boss } = stageGriddedBoss(500)
    // 단두대 단일: 자해 6 · 필드 전체 적 (1.0공+3). 공격력 1 → 칸당 4.
    gameState.character.addHandCard(DropSystem.makeCard('guillotine'))

    const before = boss.getHealth()
    HandSystem.useSingle(gameState, HandSystem.newChain(), 0)
    const dealt = before - boss.getHealth()

    // 9칸 × 4피해에 칸 배율(약점 2칸 ×2, 경화 2칸 ×0.5)을 각각 먹인 값.
    expect(dealt).toBe(2 * 8 + 2 * 2 + 5 * 4)
  })

  it('★ 전체공격은 함정·보물을 하나도 남기지 않고 전부 건드린다', () => {
    // 광역은 성한 칸을 한 번씩 훑으므로 보물을 싹 쓸어 담는 대신 함정도 전부 밟는다 —
    // 그 맞바꿈이 "지우고 때릴까, 그냥 쓸어버릴까"를 선택으로 만든다.
    const { gameState, grid } = stageGriddedBoss(5000)
    gameState.character.trapIgnoreChance = 0
    gameState.character.trapDamageBonus = 0
    const traps = grid.fixtureCells('trap').length
    const treasures = grid.fixtureCells('treasure').length
    const hpBefore = gameState.character.health

    gameState.character.addHandCard(DropSystem.makeCard('guillotine'))
    HandSystem.useSingle(gameState, HandSystem.newChain(), 0, undefined)
    const result = resolveBossCellFixtures(gameState)

    expect(traps).toBeGreaterThan(0)
    expect(treasures).toBeGreaterThan(0)
    expect(result.trapsTriggered).toBe(traps)
    expect(result.treasuresOpened).toBe(treasures)
    // 함정은 칸마다 물린다 — 한 번만 아프면 광역이 공짜가 된다.
    expect(result.trapDamageTaken).toBe(grid.trapDamage * traps)
    expect(gameState.character.health).toBe(hpBefore - result.trapDamageTaken)
    expect(grid.fixtureCells('trap')).toHaveLength(0)
    expect(grid.fixtureCells('treasure')).toHaveLength(0)
  })

  it('깨진 칸의 부가물은 전체공격에서 빠진다 — 광역도 성한 칸만 훑는다', () => {
    const { gameState, grid } = stageGriddedBoss(60)
    const doomed = grid.fixtureCells('trap')[0]
    // 칸 하나를 확실히 깨 둔다(그 칸의 함정은 이때 이미 발동해 사라진다).
    grid.strike({ cellIndex: doomed, baseDamage: grid.cellDurability * 4 })
    grid.takeFixtureEvents()
    grid.purgeSpentFixtures()
    const remaining = grid.fixtureCells('trap').length

    gameState.character.addHandCard(DropSystem.makeCard('guillotine'))
    HandSystem.useSingle(gameState, HandSystem.newChain(), 0, undefined)

    expect(resolveBossCellFixtures(gameState).trapsTriggered).toBe(remaining)
  })

  it('유물의 무작위 타격도 칸 부가물을 건드린다 — 손패만의 규칙이 아니다', () => {
    const { gameState, grid } = stageGriddedBoss(5000)
    // 성한 칸이 부가물 칸뿐이 되도록 나머지를 비우지 않고, 여러 번 때려 확률적으로 맞춘다.
    let triggered = 0
    for (let i = 0; i < 30 && triggered === 0; i++) {
      HandSystem.strikeRandomEnemy(gameState, 1, 'front')
      triggered = resolveBossCellFixtures(gameState).trapsTriggered
        + resolveBossCellFixtures(gameState).treasuresOpened
      if (grid.fixtureCells('trap').length + grid.fixtureCells('treasure').length === 0) break
    }
    // 유물 경로가 격자를 아예 안 지나면 30번을 때려도 0이다.
    expect(triggered).toBeGreaterThan(0)
  })

  it('격자가 없는 보스는 필드 전체 피해를 한 번만 맞는다(기존 동작 보존)', () => {
    const { gameState, boss } = stageGriddedBoss(500)
    gameState.bossGimmicks = null
    gameState.character.addHandCard(DropSystem.makeCard('guillotine'))

    const before = boss.getHealth()
    HandSystem.useSingle(gameState, HandSystem.newChain(), 0)

    expect(before - boss.getHealth()).toBe(4)
  })

  it('손패 사용은 자기 시너지 태그를 칸 판정에 실어 보낸다', () => {
    // 태그 반응형 칸(특정 태그에 추가/반감)을 붙일 때 이 경로가 끊겨 있으면
    // 기믹이 조용히 발동하지 않는다. 배선 자체를 잠가 둔다.
    const { gameState, boss, grid } = stageGriddedBoss(500)
    const seen: { origin: string; tags: readonly string[] }[] = []
    const spy = grid as unknown as { resolveMultiplier: (c: unknown, ctx: { origin: string; tags: readonly string[] }) => number }
    const original = spy.resolveMultiplier.bind(grid)
    spy.resolveMultiplier = (cell, ctx) => {
      seen.push({ origin: ctx.origin, tags: ctx.tags })
      return original(cell, ctx)
    }
    gameState.character.addHandCard(DropSystem.makeCard('ember'))

    HandSystem.useSingle(gameState, HandSystem.newChain(), 0, {
      laneIndex: 0, distance: 0, card: boss, gimmickCellIndex: 0,
    })

    expect(seen).toHaveLength(1)
    expect(seen[0].origin).toBe('hand')
    expect(seen[0].tags).toEqual(['flame'])
  })

  it('손패가 칸을 깨면 부위 파괴 보너스가 같은 타격에 함께 들어간다', () => {
    // 30F 실수치(HP 100 · 9칸 → 내구도 12 · 파괴 보너스 10)로 세운다.
    const { gameState, boss, grid } = stageGriddedBoss(100)
    const weak = grid.getCells().find((c) => c.kind === 'weak')
    // 약점을 미리 깨지기 직전까지 닳게 해 둔다(누적 10/12).
    grid.strike({ cellIndex: weak?.index, baseDamage: 5 })
    boss.takeDamage(10)
    gameState.character.addHandCard(DropSystem.makeCard('ember'))

    const before = boss.getHealth()
    HandSystem.useSingle(gameState, HandSystem.newChain(), 0, {
      laneIndex: 0, distance: 0, card: boss, gimmickCellIndex: weak?.index,
    })

    // 불씨 단일(공격력 1 → 2) × 약점 2배 = 4, 여기에 부위 파괴 보너스 10이 얹힌다.
    expect(before - boss.getHealth()).toBe(4 + grid.breakDamage)
    expect(grid.brokenCount).toBe(1)
  })

  it('부위가 깨질수록 광역기가 닿는 칸이 줄어든다', () => {
    const { gameState, boss, grid } = stageGriddedBoss(500)
    // 경화 2칸을 먼저 부숴 광역 대상에서 뺀다.
    for (const cell of grid.getCells().filter((c) => c.kind === 'hardened')) {
      grid.strike({ cellIndex: cell.index, baseDamage: 9999 })
    }
    gameState.character.addHandCard(DropSystem.makeCard('guillotine'))

    const before = boss.getHealth()
    HandSystem.useSingle(gameState, HandSystem.newChain(), 0)

    // 남은 7칸(약점 2 ×2, 평범 5 ×1)에만 칸당 4가 들어간다.
    expect(before - boss.getHealth()).toBe(2 * 8 + 5 * 4)
  })

  it('폭죽 분사는 총량을 칸에 흩뿌리며 약점에 꽂힌 만큼만 이득이 난다', () => {
    const { gameState, boss } = stageGriddedBoss(500)
    gameState.character.addHandCard(DropSystem.makeCard('firework'))

    const before = boss.getHealth()
    HandSystem.useSingle(gameState, HandSystem.newChain(), 0)
    const dealt = before - boss.getHealth()

    // 공격력 1 → 총 3점 분배. 칸당 1점이 약점이면 2, 아니면 1이라 3~6 사이.
    expect(dealt).toBeGreaterThanOrEqual(3)
    expect(dealt).toBeLessThanOrEqual(6)
  })
})

describe('HandSystem.strikeRandomEnemy / strikeEnemyById — 유물 타격 경로', () => {
  /** 보스 하나만 선 판(30F 배치와 동일하게 3레인 dist-0 점유). */
  function stageBossOnly(hp = 100): { gameState: GameState; boss: Card } {
    const gameState = new GameState()
    const boss = new Card('boss-only', CardType.BOSS, '양초 백작', '보스', hp, 4, {
      specialEnemyKind: 'waxArmy',
    })
    boss.enemyHealthTotal = hp
    for (let i = 0; i < 3; i++) gameState.lanes[i].setCardAtDistance(0, boss)
    return { gameState, boss }
  }

  it('보스도 후보에 넣는다 — 보스전에서 가시 방패·수혈이 죽지 않게', () => {
    // 회귀 방지: 예전 GameState 헬퍼는 CardType.ENEMY만 골라 보스전에서 후보 0이 됐고,
    // 가시 방패·수혈·헌혈팩·칼날 파편이 조용히 아무 일도 하지 않았다.
    const { gameState, boss } = stageBossOnly()

    const front = HandSystem.strikeRandomEnemy(gameState, 3, 'front')
    expect(front?.cardId).toBe('boss-only')
    expect(boss.getHealth()).toBe(97)

    const field = HandSystem.strikeRandomEnemy(gameState, 2, 'field')
    expect(field?.cardId).toBe('boss-only')
    expect(boss.getHealth()).toBe(95)

    expect(HandSystem.strikeEnemyById(gameState, 'boss-only', 5)?.amount).toBe(5)
  })

  it('격자를 낀 보스는 칸 배율을 먹은 실피해를 돌려준다', () => {
    const { gameState, boss } = stageBossOnly(500)
    const grid = new BossGimmickManager(() => 0)
    grid.beginEncounter('waxArmy', 500)
    gameState.bossGimmicks = grid
    const weak = grid.getCells().find((c) => c.kind === 'weak')

    const before = boss.getHealth()
    const hit = HandSystem.strikeEnemyById(gameState, 'boss-only', 10)

    // 요청값 10이 아니라 실제로 깎인 체력을 돌려줘야 수치 표기가 어긋나지 않는다.
    expect(hit?.amount).toBe(before - boss.getHealth())
    expect(grid.takeHits()).toHaveLength(1)
    expect(weak).toBeTruthy()
  })

  it('보스를 쓰러뜨려도 레일에서 직접 치우지 않는다 — 격파 시퀀스는 보스 컨트롤러가 소유한다', () => {
    const { gameState, boss } = stageBossOnly(3)

    const hit = HandSystem.strikeEnemyById(gameState, 'boss-only', 99)

    expect(hit?.defeated).toBe(true)
    expect(gameState.lanes[0].getCardAtDistance(0)).toBe(boss)
  })

  it('일반 적은 처치 시 즉시 치우고, 전방 조준은 대기 행을 건드리지 않는다', () => {
    const gameState = new GameState()
    const waiting = new Card('waiting', CardType.ENEMY, '대기', 'test', 3, 1)
    gameState.lanes[2].setCardAtDistance(2, waiting)

    expect(HandSystem.strikeRandomEnemy(gameState, 1, 'front')).toBeNull()
    expect(HandSystem.strikeRandomEnemy(gameState, 1, 'field')?.cardId).toBe('waiting')

    const dying = new Card('dying', CardType.ENEMY, '죽는적', 'test', 1, 1)
    gameState.lanes[0].setCardAtDistance(0, dying)
    expect(HandSystem.strikeRandomEnemy(gameState, 5, 'front')?.defeated).toBe(true)
    expect(gameState.lanes[0].getCardAtDistance(0)).toBeNull()
  })
})
