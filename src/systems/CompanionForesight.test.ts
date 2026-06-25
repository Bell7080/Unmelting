import { describe, expect, it } from 'vitest'
import { GameState } from '@core/GameState'
import { Card, CardType } from '@entities/Card'
import type { HandCardId } from '@entities/HandCard'
import { DropSystem } from './DropSystem'
import { assessThreats } from './CompanionForesight'

/** 작은 보드 세팅 도우미: 예지 테스트가 위협 배치만 드러내게 한다. */
function web(id: string, group = 1): Card {
  const card = new Card(id, CardType.TRAP, '양초 거미줄', 'test', 0, 1, { trapKind: 'web' })
  card.groupCount = group
  return card
}

describe('CompanionForesight', () => {
  it('does not recommend broom for distant single webs that cannot drop immediately', () => {
    const gs = new GameState()
    gs.lanes[0].setCardAtDistance(2, web('far-a'))
    gs.lanes[2].setCardAtDistance(2, web('far-b'))

    const report = assessThreats(gs.lanes, gs.character, { unlockedCardIds: ['sweep', 'chitin'] as HandCardId[] })

    expect(report.hasImminentWebDrop).toBe(false)
    expect(report.recommendedCardId).toBeNull()
  })

  it('prefers chitin when a front 2-web can become a 3-web next drop', () => {
    const gs = new GameState()
    const merged = web('front-2', 2)
    gs.lanes[0].setCardAtDistance(0, merged)
    gs.lanes[1].setCardAtDistance(0, merged)
    gs.lanes[2].setCardAtDistance(1, web('incoming'))

    const report = assessThreats(gs.lanes, gs.character, { unlockedCardIds: ['sweep', 'chitin'] as HandCardId[] })

    expect(report.webLethal).toBe(true)
    expect(report.recommendedCardId).toBe('chitin')
  })

  it('recommends recipe support only when current chain and hand order can fire it soon', () => {
    const gs = new GameState()
    gs.lanes[1].setCardAtDistance(0, new Card('enemy', CardType.ENEMY, '적', 'test', 5, 1))
    gs.character.addHandCard(DropSystem.makeCard('ember'))

    const ready = assessThreats(gs.lanes, gs.character, {
      unlockedCardIds: ['candle'] as HandCardId[],
      chainSequence: [],
      lookaheadCards: 2,
    })

    expect(ready.recommendedCardId).toBe('candle')
    expect(ready.playableInCards).toBe(2)
    expect(ready.recommendationReason).toContain('2장 안에 발동 가능')

    const tooFar = assessThreats(gs.lanes, gs.character, {
      unlockedCardIds: ['candle'] as HandCardId[],
      chainSequence: [],
      lookaheadCards: 1,
    })

    expect(tooFar.recommendedCardId).toBeNull()
  })

  it('reports how many ordered hand cards are needed before triple support pays off', () => {
    const gs = new GameState()
    gs.character.addHandCard(DropSystem.makeCard('match'))
    gs.character.addHandCard(DropSystem.makeCard('ember'))
    gs.character.addHandCard(DropSystem.makeCard('match'))

    const report = assessThreats(gs.lanes, gs.character, {
      unlockedCardIds: ['match'] as HandCardId[],
      lookaheadCards: 4,
    })

    expect(report.recommendedCardId).toBe('match')
    expect(report.playableInCards).toBe(4)
  })

  it('chooses the least-overkill unlocked attack card that can finish a strong enemy', () => {
    const gs = new GameState()
    gs.character.damage = 2
    const merged = new Card('merged-enemy', CardType.ENEMY, '합체 적', 'test', 3, 4)
    merged.groupCount = 2
    gs.lanes[1].setCardAtDistance(0, merged)

    const report = assessThreats(gs.lanes, gs.character, {
      unlockedCardIds: ['ember', 'bonfire', 'sword-and-shield'] as HandCardId[],
    })

    expect(report.recommendedCardId).toBe('ember')
    expect(report.recommendationKind).toBe('attack')
    expect(report.recommendationReason).toContain('피해 3')
  })

  it('can recommend front-only attack support such as sword-and-shield when it is the clean answer', () => {
    const gs = new GameState()
    gs.character.damage = 4
    const front = new Card('front-enemy', CardType.ENEMY, '앞 적', 'test', 3, 4)
    front.groupCount = 2
    gs.lanes[1].setCardAtDistance(0, front)

    const report = assessThreats(gs.lanes, gs.character, {
      unlockedCardIds: ['sword-and-shield', 'slash'] as HandCardId[],
    })

    expect(report.recommendedCardId).toBe('sword-and-shield')
    expect(report.recommendationKind).toBe('attack')
  })


  it('recommends defensive tempo when a front strong enemy cannot be killed cleanly', () => {
    const gs = new GameState()
    gs.character.damage = 2
    const brute = new Card('brute', CardType.ENEMY, '큰 적', 'test', 12, 5)
    brute.groupCount = 2
    gs.lanes[1].setCardAtDistance(0, brute)

    const report = assessThreats(gs.lanes, gs.character, {
      unlockedCardIds: ['ember', 'wax', 'sword-and-shield'] as HandCardId[],
    })

    expect(report.recommendedCardId).toBe('wax')
    expect(report.recommendationKind).toBe('defense')
    expect(report.recommendationReason).toContain('반격 타이밍')
  })

})
