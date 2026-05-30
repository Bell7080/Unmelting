import { afterEach, describe, expect, it, vi } from 'vitest'
import { GameState } from './GameState'
import { TurnManager } from './TurnManager'
import { Card, CardType } from '@entities/Card'
import { CardSpawner } from '@systems/CardSpawner'

function placeTreasure(gameState: GameState): Card {
  const treasure = new Card('treasure-test', CardType.TREASURE, '보물상자', 'test')
  gameState.lanes[0].setCardAtDistance(0, treasure)
  return treasure
}

describe('TurnManager treasure volatility', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('uses a 30% disappear window for active-row treasures', () => {
    const gameState = new GameState()
    const turnManager = new TurnManager(gameState)
    placeTreasure(gameState)
    vi.spyOn(Math, 'random').mockReturnValue(0.29)

    const changes = turnManager.applyTreasureVolatility(new CardSpawner())

    expect(changes[0]?.outcome).toBe('disappeared')
    expect(gameState.lanes[0].getCardAtDistance(0)).toBeNull()
  })

  it('keeps treasures in place when they hit the 60% safe window', () => {
    const gameState = new GameState()
    const turnManager = new TurnManager(gameState)
    const treasure = placeTreasure(gameState)
    vi.spyOn(Math, 'random').mockReturnValue(0.9)

    const changes = turnManager.applyTreasureVolatility(new CardSpawner())

    expect(changes).toEqual([])
    expect(gameState.lanes[0].getCardAtDistance(0)).toBe(treasure)
  })

  it('turns one-lane treasures into configured mimics in the next 10% window', () => {
    const gameState = new GameState()
    const turnManager = new TurnManager(gameState)
    placeTreasure(gameState)
    vi.spyOn(Math, 'random').mockReturnValue(0.35)

    const changes = turnManager.applyTreasureVolatility(new CardSpawner())
    const mimic = gameState.lanes[0].getCardAtDistance(0)

    expect(changes[0]?.outcome).toBe('mimic')
    expect(mimic?.type).toBe(CardType.ENEMY)
    expect(mimic?.getHealth()).toBe(4)
    expect(mimic?.getDamage()).toBe(2)
    expect(mimic?.isSpecialEnemy).toBe(true)
    expect(mimic?.defeatDropCount).toBe(2)
  })

  it('preserves a two-lane chest width when it turns into a mimic', () => {
    const gameState = new GameState()
    const turnManager = new TurnManager(gameState)
    const left = new Card('treasure-left', CardType.TREASURE, '작은 상자', 'test')
    const right = new Card('treasure-right', CardType.TREASURE, '작은 상자', 'test')
    gameState.lanes[0].setCardAtDistance(0, left)
    gameState.lanes[1].setCardAtDistance(0, right)
    gameState.regroupAllRows()
    vi.spyOn(Math, 'random').mockReturnValue(0.35)

    turnManager.applyTreasureVolatility(new CardSpawner())
    const mimic = gameState.lanes[0].getCardAtDistance(0)

    expect(mimic).toBe(gameState.lanes[1].getCardAtDistance(0))
    expect(mimic?.groupCount).toBe(2)
    expect(mimic?.getHealth()).toBe(10)
    expect(mimic?.getDamage()).toBe(5)
    expect(mimic?.defeatDropCount).toBe(5)
  })

  it('preserves a three-lane chest width when it turns into a mimic', () => {
    const gameState = new GameState()
    const turnManager = new TurnManager(gameState)
    const treasures = [0, 1, 2].map(
      (laneIndex) => new Card(`treasure-${laneIndex}`, CardType.TREASURE, '작은 상자', 'test')
    )
    treasures.forEach((treasure, laneIndex) =>
      gameState.lanes[laneIndex].setCardAtDistance(0, treasure)
    )
    gameState.regroupAllRows()
    vi.spyOn(Math, 'random').mockReturnValue(0.35)

    turnManager.applyTreasureVolatility(new CardSpawner())
    const mimic = gameState.lanes[0].getCardAtDistance(0)

    expect(mimic).toBe(gameState.lanes[1].getCardAtDistance(0))
    expect(mimic).toBe(gameState.lanes[2].getCardAtDistance(0))
    expect(mimic?.groupCount).toBe(3)
    expect(mimic?.getHealth()).toBe(20)
    expect(mimic?.getDamage()).toBe(10)
    expect(mimic?.defeatDropCount).toBe(10)
  })

  it('removes every occupied lane when a two-lane treasure disappears', () => {
    const gameState = new GameState()
    const turnManager = new TurnManager(gameState)
    const left = new Card('treasure-left', CardType.TREASURE, '작은 상자', 'test')
    const right = new Card('treasure-right', CardType.TREASURE, '작은 상자', 'test')
    gameState.lanes[0].setCardAtDistance(0, left)
    gameState.lanes[1].setCardAtDistance(0, right)
    gameState.regroupAllRows()
    vi.spyOn(Math, 'random').mockReturnValue(0.29)

    const changes = turnManager.applyTreasureVolatility(new CardSpawner())

    expect(changes[0]?.outcome).toBe('disappeared')
    expect(gameState.lanes[0].getCardAtDistance(0)).toBeNull()
    expect(gameState.lanes[1].getCardAtDistance(0)).toBeNull()
  })

  it('arms front bombs, then explodes them for player and adjacent enemy damage', () => {
    const gameState = new GameState()
    const turnManager = new TurnManager(gameState)
    const bomb = new Card('bomb', CardType.TRAP, '양초 폭탄', 'test', 0, 0, { trapKind: 'bomb' })
    const enemy = new Card('enemy', CardType.ENEMY, '양초 두더지', 'test', 8, 2)
    gameState.lanes[1].setCardAtDistance(0, bomb)
    gameState.lanes[0].setCardAtDistance(0, enemy)

    expect(turnManager.armFrontBombs()).toBe(1)
    expect(bomb.isBombArmed).toBe(true)

    const explosions = turnManager.applyBombExplosions()

    expect(explosions).toHaveLength(1)
    expect(explosions[0]?.playerDamage).toBe(5)
    expect(gameState.character.health).toBe(gameState.character.maxHealth - 5)
    expect(enemy.getHealth()).toBe(3)
    expect(gameState.lanes[1].getCardAtDistance(0)).toBeNull()
  })

  it('keeps frozen front bombs from advancing their fuse timer', () => {
    const gameState = new GameState()
    const turnManager = new TurnManager(gameState)
    const bomb = new Card('frozen-bomb', CardType.TRAP, '양초 폭탄', 'test', 0, 0, {
      trapKind: 'bomb',
    })
    bomb.freeze(1)
    gameState.lanes[1].setCardAtDistance(0, bomb)

    expect(turnManager.armFrontBombs()).toBe(0)
    expect(bomb.isBombArmed).toBe(false)
    expect(turnManager.applyBombExplosions()).toEqual([])
    expect(gameState.lanes[1].getCardAtDistance(0)).toBe(bomb)
  })

  it('separates the visible 0-turn spore badge from the infection reset', () => {
    const gameState = new GameState()
    const turnManager = new TurnManager(gameState)
    const spore = new Card('spore', CardType.TRAP, '감염 포자', 'test', 0, 1, { trapKind: 'spore' })
    const victim = new Card('victim', CardType.TREASURE, '작은 상자', 'test')
    spore.sporeTurnsUntilSpread = 1
    gameState.lanes[1].setCardAtDistance(1, spore)
    gameState.lanes[1].setCardAtDistance(0, victim)
    vi.spyOn(Math, 'random').mockReturnValue(0)

    const ticks = turnManager.tickSporeCountdowns()

    // UI가 이 중간 상태를 렌더링해 2→1→0을 보여준 뒤 spreadReadySpores가 2로 리셋한다.
    expect(ticks).toEqual([{ laneIndex: 1, distance: 1, turnsUntilSpread: 0 }])
    expect(spore.sporeTurnsUntilSpread).toBe(0)
    const spreads = turnManager.spreadReadySpores()

    expect(spreads).toHaveLength(1)
    expect(spore.sporeTurnsUntilSpread).toBe(2)
  })

  it('spreads a ready spore into one orthogonal neighboring cell', () => {
    const gameState = new GameState()
    const turnManager = new TurnManager(gameState)
    const spore = new Card('spore', CardType.TRAP, '감염 포자', 'test', 0, 1, { trapKind: 'spore' })
    const victim = new Card('victim', CardType.TREASURE, '작은 상자', 'test')
    spore.sporeTurnsUntilSpread = 1
    gameState.lanes[1].setCardAtDistance(1, spore)
    gameState.lanes[1].setCardAtDistance(0, victim)
    vi.spyOn(Math, 'random').mockReturnValue(0)

    const spreads = turnManager.applySporeSpread()
    const infected = spreads[0]?.infected[0]
    const infectedCard = infected
      ? gameState.lanes[infected.laneIndex].getCardAtDistance(infected.distance)
      : null

    expect(spreads).toHaveLength(1)
    expect(infectedCard?.type).toBe(CardType.TRAP)
    expect(infectedCard?.trapKind).toBe('spore')
    expect(infectedCard?.sporeTurnsUntilSpread).toBe(2)
    expect(spore.sporeTurnsUntilSpread).toBe(2)
  })

  it('regroups newly adjacent front-row spores after the spread pass', () => {
    const gameState = new GameState()
    const turnManager = new TurnManager(gameState)
    const spore = new Card('spore', CardType.TRAP, '감염 포자', 'test', 0, 1, { trapKind: 'spore' })
    spore.sporeTurnsUntilSpread = 1
    gameState.lanes[0].setCardAtDistance(0, spore)
    gameState.lanes[1].setCardAtDistance(
      0,
      new Card('victim', CardType.TREASURE, '작은 상자', 'test')
    )
    vi.spyOn(Math, 'random').mockReturnValue(0)

    turnManager.applySporeSpread()

    // Spore spreading is a post-drop event; regroup here so the next rendered
    // player decision sees one 2-lane colony rather than two separate spores.
    expect(gameState.lanes[0].getCardAtDistance(0)).toBe(gameState.lanes[1].getCardAtDistance(0))
    expect(gameState.lanes[0].getCardAtDistance(0)?.groupCount).toBe(2)
  })

  it('does not tick newly infected spores again during the same spread pass', () => {
    const gameState = new GameState()
    const turnManager = new TurnManager(gameState)
    const spore = new Card('spore', CardType.TRAP, '감염 포자', 'test', 0, 1, { trapKind: 'spore' })
    spore.sporeTurnsUntilSpread = 1
    gameState.lanes[0].setCardAtDistance(0, spore)
    gameState.lanes[1].setCardAtDistance(
      0,
      new Card('victim', CardType.TREASURE, '작은 상자', 'test')
    )
    vi.spyOn(Math, 'random').mockReturnValue(0)

    const spreads = turnManager.applySporeSpread()
    const infected = spreads[0]?.infected[0]
    const infectedCard = infected
      ? gameState.lanes[infected.laneIndex].getCardAtDistance(infected.distance)
      : null

    expect(infected).toEqual({ laneIndex: 1, distance: 0 })
    expect(infectedCard?.trapKind).toBe('spore')
    expect(infectedCard?.sporeTurnsUntilSpread).toBe(2)
  })

  it('does not spread into a transient empty neighbor before rail gravity refills it', () => {
    const gameState = new GameState()
    const turnManager = new TurnManager(gameState)
    const spore = new Card('spore', CardType.TRAP, '감염 포자', 'test', 0, 1, { trapKind: 'spore' })
    spore.sporeTurnsUntilSpread = 1
    gameState.lanes[0].setCardAtDistance(0, spore)

    const spreads = turnManager.applySporeSpread()

    expect(spreads).toHaveLength(0)
    expect(gameState.lanes[1].getCardAtDistance(0)).toBeNull()
    expect(spore.sporeTurnsUntilSpread).toBe(2)
  })

  it('lets enemies attack before rail gravity pulls the next enemy into a cleared front slot', () => {
    const gameState = new GameState()
    const turnManager = new TurnManager(gameState)
    const waitingEnemy = new Card('waiting-enemy', CardType.ENEMY, '대기 중인 적', 'test', 3, 2)
    gameState.lanes[0].setCardAtDistance(1, waitingEnemy)

    // The player's kill leaves distance 0 empty until cleanup; the enemy phase
    // must not compact first, otherwise this waiting enemy would get a same-turn hit.
    const hitsBeforeGravity = turnManager.runEnemyPhase()
    gameState.compactAndRefillRails(
      (laneIndex) => new Card(`refill-${laneIndex}`, CardType.TREASURE, '리필 상자', 'test')
    )
    const hitsAfterGravity = turnManager.runEnemyPhase()

    expect(hitsBeforeGravity).toEqual([])
    expect(gameState.lanes[0].getCardAtDistance(0)).toBe(waitingEnemy)
    expect(hitsAfterGravity).toHaveLength(1)
  })

  it('spreads into a card that rail gravity drops into an adjacent empty neighbor', () => {
    const gameState = new GameState()
    const turnManager = new TurnManager(gameState)
    const spore = new Card('spore', CardType.TRAP, '감염 포자', 'test', 0, 1, { trapKind: 'spore' })
    const droppedVictim = new Card('dropped-victim', CardType.TREASURE, '떨어진 상자', 'test')
    spore.sporeTurnsUntilSpread = 1
    gameState.lanes[0].setCardAtDistance(0, spore)
    gameState.lanes[1].setCardAtDistance(1, droppedVictim)
    vi.spyOn(Math, 'random').mockReturnValue(0)

    // Spore logic itself still ignores empty holes; the game loop now calls it
    // only after cleanup gravity, so this real card becomes a valid neighbor.
    gameState.compactAndRefillRails(
      (laneIndex) => new Card(`refill-${laneIndex}`, CardType.TREASURE, '리필 상자', 'test')
    )
    const spreads = turnManager.applySporeSpread()

    expect(spreads[0]?.infected[0]).toEqual({ laneIndex: 1, distance: 0 })
    expect(gameState.lanes[1].getCardAtDistance(0)?.trapKind).toBe('spore')
  })

  it('reports the card id for a grouped enemy strike so the renderer can animate the whole group', () => {
    const gameState = new GameState()
    const turnManager = new TurnManager(gameState)
    const enemies = [0, 1].map(
      (laneIndex) => new Card(`enemy-${laneIndex}`, CardType.ENEMY, '양초 무리', 'test', 3, 1)
    )
    enemies.forEach((enemy, laneIndex) => gameState.lanes[laneIndex].setCardAtDistance(0, enemy))
    gameState.regroupAllRows()
    const groupedEnemy = gameState.lanes[0].getCardAtDistance(0)

    const hits = turnManager.runEnemyPhase()

    expect(hits).toHaveLength(1)
    expect(hits[0]?.cardId).toBe(groupedEnemy?.id)
    expect(hits[0]?.damage).toBe(groupedEnemy?.getDamage())
  })

  it('reports a quiet marigold progress beat on the non-growth turn', () => {
    const gameState = new GameState()
    const turnManager = new TurnManager(gameState)
    const marigold = new Card('marigold', CardType.FLOWER, '메리골드', 'test', 0, 0, {
      flowerKind: 'marigold',
    })
    marigold.bloom('marigold')
    gameState.lanes[0].setCardAtDistance(0, marigold)
    vi.spyOn(Math, 'random').mockReturnValue(0.99)

    const first = turnManager.applyFlowerGrowthAndWilt(new CardSpawner())
    const second = turnManager.applyFlowerGrowthAndWilt(new CardSpawner())

    expect(first.growths[0]).toMatchObject({ phase: 'progress', value: 1 })
    expect(second.growths[0]).toMatchObject({ phase: 'growth', value: 2 })
  })

  it('does not end the game just because three traps occupy the active row', () => {
    const gameState = new GameState()
    const turnManager = new TurnManager(gameState)
    const traps = [0, 1, 2].map(
      (laneIndex) => new Card(`trap-${laneIndex}`, CardType.TRAP, '함정', 'test')
    )
    traps.forEach((trap, laneIndex) => gameState.lanes[laneIndex].setCardAtDistance(0, trap))
    gameState.regroupAllRows()

    expect(turnManager.checkHazardLoss()).toBe(false)
    expect(gameState.isGameOver).toBe(false)
    expect(gameState.lanes[0].getCardAtDistance(0)?.groupCount).toBe(3)
  })
})
