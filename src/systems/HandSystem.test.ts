import { describe, expect, it } from 'vitest'
import { GameState } from '@core/GameState'
import { HandSystem } from './HandSystem'
import { DropSystem } from './DropSystem'
import { Card, CardType } from '@entities/Card'

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
