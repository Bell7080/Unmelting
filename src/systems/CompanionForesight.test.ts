import { describe, expect, it } from 'vitest'
import { GameState } from '@core/GameState'
import { Card, CardType } from '@entities/Card'
import type { HandCardId } from '@entities/HandCard'
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
})
