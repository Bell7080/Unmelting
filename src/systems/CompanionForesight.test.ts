import { describe, expect, it } from 'vitest'
import { GameState } from '@core/GameState'
import { Card, CardType } from '@entities/Card'
import type { HandCardId } from '@entities/HandCard'
import { DropSystem } from './DropSystem'
import { assessThreats, estimateImminentWebMergeFromCells, isRepeatedPredictionOpportunity } from './CompanionForesight'

/** 작은 보드 세팅 도우미: 예지 테스트가 위협 배치만 드러내게 한다. */
function web(id: string, group = 1): Card {
  const card = new Card(id, CardType.TRAP, '양초 거미줄', 'test', 0, 1, { trapKind: 'web' })
  card.groupCount = group
  return card
}

describe('estimateImminentWebMergeFromCells (런타임·시뮬 공유 병합 판정)', () => {
  it('레인 인접한 서로 다른 거미줄만 병합 군집으로 세고, 떨어진 거미줄은 무시한다', () => {
    // 시뮬처럼 임의 객체를 key로 써도 같은 판정이 나온다(보드 표현 독립).
    const a = { id: 'a' }
    const b = { id: 'b' }
    expect(estimateImminentWebMergeFromCells([{ key: a, groupCount: 1 }, { key: b, groupCount: 1 }, null]))
      .toEqual({ mergedSize: 2, mergingOneWebs: 2 })
    // 가운데가 비면 병합각이 없다.
    expect(estimateImminentWebMergeFromCells([{ key: a, groupCount: 1 }, null, { key: b, groupCount: 1 }]))
      .toEqual({ mergedSize: 0, mergingOneWebs: 0 })
  })

  it('여러 레인에 걸친 병합 카드(같은 key)는 한 장으로 세고, 홀로면 새 병합이 아니다', () => {
    const merged = { id: 'merged-2' }
    const single = { id: 'single' }
    // 2칸 병합 카드 혼자는 이미 병합된 상태라 새 병합이 아니다.
    expect(estimateImminentWebMergeFromCells([{ key: merged, groupCount: 2 }, { key: merged, groupCount: 2 }, null]))
      .toEqual({ mergedSize: 0, mergingOneWebs: 0 })
    // 2칸 + 인접 1칸이면 3칸 병합 후보(1칸 참여 수 1).
    expect(estimateImminentWebMergeFromCells([{ key: merged, groupCount: 2 }, { key: merged, groupCount: 2 }, { key: single, groupCount: 1 }]))
      .toEqual({ mergedSize: 3, mergingOneWebs: 1 })
  })
})

describe('CompanionForesight', () => {
  it('suppresses a declined prediction until its board opportunity signature changes', () => {
    expect(isRepeatedPredictionOpportunity('web:a', 'web:a')).toBe(true)
    expect(isRepeatedPredictionOpportunity('web:a', 'web:b')).toBe(false)
    expect(isRepeatedPredictionOpportunity(null, 'web:a')).toBe(false)
  })
  it('does not recommend broom for distant single webs that cannot drop immediately', () => {
    const gs = new GameState()
    gs.lanes[0].setCardAtDistance(2, web('far-a'))
    gs.lanes[2].setCardAtDistance(2, web('far-b'))

    const report = assessThreats(gs.lanes, gs.character, { unlockedCardIds: ['sweep', 'chitin'] as HandCardId[] })

    expect(report.hasImminentWebDrop).toBe(false)
    expect(report.recommendedCardId).toBeNull()
  })

  it('does not read scattered non-adjacent webs as a merge threat (발견만으로 미숙/예지 오발동 금지)', () => {
    const gs = new GameState()
    // 레인 0 전방 + 레인 2 낙하 예정: 임박하긴 하지만 서로 붙어 있지 않아 병합될 수 없다.
    gs.lanes[0].setCardAtDistance(0, web('front-a'))
    gs.lanes[2].setCardAtDistance(1, web('incoming-c'))

    const report = assessThreats(gs.lanes, gs.character, { unlockedCardIds: ['sweep', 'chitin'] as HandCardId[] })

    expect(report.hasImminentWebDrop).toBe(true)
    expect(report.potentialWebDamage).toBe(0) // 병합각 없음 → 미숙 대사 게이트(체력 50%/즉사)도 통과 불가
    expect(report.webLethal).toBe(false)
    expect(report.recommendCleanup).toBe(false)
  })

  it('recommends sweep only when adjacent one-webs can actually merge next drop', () => {
    const gs = new GameState()
    gs.lanes[0].setCardAtDistance(0, web('front-a'))
    gs.lanes[1].setCardAtDistance(1, web('incoming-b'))

    const report = assessThreats(gs.lanes, gs.character, { unlockedCardIds: ['sweep'] as HandCardId[] })

    expect(report.potentialWebDamage).toBe(5) // 인접 1칸 2장 → 2칸 병합(피해 5) 후보
    expect(report.recommendCleanup).toBe(true)
    expect(report.recommendedCardId).toBe('sweep')
    expect(report.recommendationKind).toBe('cleanup')
  })

  it('prefers chitin when a front 2-web can become a 3-web next drop', () => {
    const gs = new GameState()
    const merged = web('front-2', 2)
    gs.lanes[0].setCardAtDistance(0, merged)
    gs.lanes[1].setCardAtDistance(0, merged)
    gs.lanes[2].setCardAtDistance(1, web('incoming'))

    const report = assessThreats(gs.lanes, gs.character, { unlockedCardIds: ['sweep', 'chitin'] as HandCardId[] })

    expect(report.webLethal).toBe(true)
    expect(report.webEscalationImminent).toBe(true)
    expect(report.recommendedCardId).toBe('chitin')
    expect(report.recommendationSignature).toContain('web:')
  })

  it('opens one chitin opportunity for an isolated 2-web and gives it a stable web signature', () => {
    const gs = new GameState()
    const merged = web('front-safe-2', 2)
    gs.lanes[0].setCardAtDistance(0, merged)
    gs.lanes[1].setCardAtDistance(0, merged)

    const report = assessThreats(gs.lanes, gs.character, { unlockedCardIds: ['chitin'] as HandCardId[] })

    expect(report.webEscalationImminent).toBe(false)
    expect(report.recommendedCardId).toBe('chitin')
    expect(report.recommendationSignature).toBe('web:front-safe-2:2')
  })

  it('does not hand out a generic recipe ingredient without an effect-matched need', () => {
    const gs = new GameState()
    gs.lanes[1].setCardAtDistance(0, new Card('enemy', CardType.ENEMY, '적', 'test', 5, 1))
    gs.character.addHandCard(DropSystem.makeCard('ember'))

    const report = assessThreats(gs.lanes, gs.character, {
      unlockedCardIds: ['candle'] as HandCardId[],
      lookaheadCards: 2,
    })

    expect(report.recommendedCardId).toBeNull()
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


  it('굳은 강적은 다가오는 위협으로 세지 않는다 — 때리지 못하는 적에게 사과하지 않게', () => {
    // 굳은 적은 TurnManager.runEnemyPhase가 통째로 건너뛰어 그동안 아무도 맞지 않는다.
    // 이 플래그가 켜지면 에나가 "막아야 하는데 못 막아" 미숙 대사를 낸다(CompanionDirector).
    const build = (frozenTurns: number) => {
      const gs = new GameState()
      gs.character.damage = 2
      const brute = new Card('brute', CardType.ENEMY, '큰 적', 'test', 12, 5)
      brute.groupCount = 2
      if (frozenTurns > 0) brute.freeze(frozenTurns)
      gs.lanes[1].setCardAtDistance(0, brute)
      return assessThreats(gs.lanes, gs.character, { unlockedCardIds: ['ember', 'wax'] as HandCardId[] })
    }

    expect(build(0).strongEnemyIncoming).toBe(true)   // 안 굳었으면 이번 턴에 때린다
    expect(build(1).strongEnemyIncoming).toBe(true)   // 1턴만 남았으면 다음 턴에 풀려 때린다
    expect(build(2).strongEnemyIncoming).toBe(false)  // 2턴 이상이면 당장은 못 때린다
    expect(build(5).strongEnemyIncoming).toBe(false)
  })

  it('대기 행 강적은 한 턴 뒤 닿으므로 다가오는 위협으로 센다', () => {
    const gs = new GameState()
    gs.character.damage = 2
    const brute = new Card('brute', CardType.ENEMY, '큰 적', 'test', 12, 5)
    brute.groupCount = 2
    gs.lanes[1].setCardAtDistance(1, brute)

    const report = assessThreats(gs.lanes, gs.character, { unlockedCardIds: ['ember', 'wax'] as HandCardId[] })

    expect(report.strongEnemyIncoming).toBe(true)
  })

})
