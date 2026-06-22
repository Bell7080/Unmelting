import { describe, expect, it } from 'vitest'
import { HAND_CARD_IDS } from '@data/HandCards'
import { buildEnaKnowledgeBase, getEnaHandCardTactic } from './EnaKnowledgeAdapter'

describe('EnaKnowledgeAdapter', () => {
  it('모든 실제 손패 정의에 전술 리포트를 생성한다', () => {
    const knowledge = buildEnaKnowledgeBase()
    expect(Object.keys(knowledge.handCards)).toHaveLength(HAND_CARD_IDS.length)
    expect(HAND_CARD_IDS.every((id) => knowledge.handCards[id].summary.length > 0)).toBe(true)
  })

  it('키틴은 청소/제어 계열의 전방 함정 위치 가치와 트리플 폭 차이를 드러낸다', () => {
    const chitin = getEnaHandCardTactic('chitin')
    expect(chitin.usePosition).toContain('전방')
    expect(chitin.usePosition).toContain('함정')
    expect(chitin.tripleValue).toBeGreaterThan(0)
  })

  it('불빛/상점 인플레이션과 평균 등반 기준을 산출한다', () => {
    const { economy } = buildEnaKnowledgeBase()
    expect(economy.lightTurnMultiplierAt90).toBeGreaterThan(economy.lightTurnMultiplierAt30)
    expect(economy.altarInflationRatio['90F']).toBeGreaterThan(economy.altarInflationRatio['30F'])
    expect(economy.baselineClimbTurn).toBeGreaterThanOrEqual(30)
  })

  it('해금/확률/레시피/자원/삭제팩과 무료카드 보상 후보를 지식으로 노출한다', () => {
    const { shop } = buildEnaKnowledgeBase()
    expect(shop.packLabels['unlock-pack']).toContain('해금팩')
    expect(shop.packLabels['recipe-pack']).toContain('조합팩')
    expect(Object.keys(shop.freeGiftRewards)).toContain('hand')
  })
})
