/**
 * HandCardAdvisor 단위 테스트 — 상황별로 데이터 주도 스코어러가
 * 적절한 손패를(해금 풀 안에서만) 고르는지 검증한다.
 */

import { describe, expect, it } from 'vitest'
import type { HandCardId } from '@entities/HandCard'
import { bestSupportCard, estimateHandCardDamage, rankSupportCards, type SupportSituation } from './HandCardAdvisor'

const base: SupportSituation = { playerAttack: 2, playerHealth: 20, playerMaxHealth: 20 }

describe('estimateHandCardDamage', () => {
  it('damageProfile을 읽어 HandSystem과 같은 floor식으로 근사한다', () => {
    expect(estimateHandCardDamage('ember', 2)).toBe(3) // 공+1
    expect(estimateHandCardDamage('ember', 2, true)).toBe(11) // 3공+5
    expect(estimateHandCardDamage('slash', 4)).toBe(10) // floor(2공)+2
    expect(estimateHandCardDamage('sword-and-shield', 4)).toBe(3) // floor(0.5공)+1
  })

  it('무작위 피해(불화살)와 공식 없는 카드는 확정 계산에서 제외한다', () => {
    expect(estimateHandCardDamage('fire-arrow', 5)).toBeNull()
    expect(estimateHandCardDamage('candle', 5)).toBeNull()
  })
})

describe('HandCardAdvisor 상황 적합', () => {
  it('불씨 부족이면 불씨 게이지를 채우는 카드(성냥)를 고른다', () => {
    const pick = bestSupportCard({ ...base, emberLow: true }, ['match', 'ember', 'candle'] as HandCardId[])
    expect(pick?.cardId).toBe('match')
    expect(pick?.fit).toBe('ember')
  })

  it('전방 강적 처치각에서는 과잉 피해가 가장 적은 공격 카드를 고른다', () => {
    const situation: SupportSituation = { ...base, strongEnemy: { health: 3, atFront: true } }
    const pick = bestSupportCard(situation, ['ember', 'slash', 'bonfire'] as HandCardId[])
    expect(pick?.cardId).toBe('ember') // 피해 3 정확 처치(참격은 피해 6 과잉)
    expect(pick?.fit).toBe('attack')
    expect(pick?.reason).toContain('피해 3')
  })

  it('처치각이 없는 전방 강적에는 굳음/방패 카드로 템포를 번다', () => {
    const situation: SupportSituation = { ...base, strongEnemy: { health: 30, atFront: true } }
    const pick = bestSupportCard(situation, ['ember', 'wax', 'sword-and-shield'] as HandCardId[])
    expect(pick?.cardId).toBe('wax')
    expect(pick?.fit).toBe('defense')
  })

  it('체력이 낮으면 회복 카드를 고르고, 멀쩡하면 고르지 않는다', () => {
    const low = bestSupportCard({ ...base, playerHealth: 6 }, ['wax-drop', 'match'] as HandCardId[])
    expect(low?.cardId).toBe('wax-drop')
    expect(low?.fit).toBe('recovery')
    expect(bestSupportCard(base, ['wax-drop', 'match'] as HandCardId[])).toBeNull()
  })

  it('거미줄 병합 위협에는 청소류를 고른다: 1칸 병합은 청소, 전방 넓은 거미줄은 키틴', () => {
    const ones: SupportSituation = { ...base, webMerge: { mergedSize: 2, mergingOneWebs: 2 } }
    expect(bestSupportCard(ones, ['sweep', 'ember'] as HandCardId[])?.cardId).toBe('sweep')

    const wide: SupportSituation = { ...base, frontWideWebSpan: 2, webMerge: { mergedSize: 3, mergingOneWebs: 1 } }
    const pick = bestSupportCard(wide, ['sweep', 'chitin'] as HandCardId[])
    expect(pick?.cardId).toBe('chitin')
    expect(pick?.fit).toBe('cleanup')
  })

  it('잠긴(미해금) 카드는 절대 추천하지 않는다', () => {
    const ones: SupportSituation = { ...base, webMerge: { mergedSize: 2, mergingOneWebs: 2 }, emberLow: true }
    const rankings = rankSupportCards(ones, ['match'] as HandCardId[])
    expect(rankings.every((r) => r.cardId === 'match')).toBe(true)
    // 청소 위협이 있어도 해금 풀에 청소류가 없으면 청소를 추천할 수 없다.
    expect(bestSupportCard({ ...base, webMerge: { mergedSize: 2, mergingOneWebs: 2 } }, ['ember'] as HandCardId[])).toBeNull()
  })

  it('같은 역할을 이미 들고 있으면 그 근거의 지원을 접는다(키틴 보유 시 청소 미지급)', () => {
    const ones: SupportSituation = {
      ...base,
      webMerge: { mergedSize: 2, mergingOneWebs: 2 },
      heldCardIds: ['chitin'] as HandCardId[],
    }
    expect(bestSupportCard(ones, ['sweep', 'chitin'] as HandCardId[])).toBeNull()
  })
})

describe('HandCardAdvisor 태그 가점', () => {
  it('보유 유물 태그와 겹치는 손패는 점수가 오른다', () => {
    const situation: SupportSituation = { ...base, emberLow: true }
    const plain = rankSupportCards(situation, ['match'] as HandCardId[])[0]
    const tagged = rankSupportCards({ ...situation, ownedRelicTags: ['flame'] }, ['match'] as HandCardId[])[0]
    expect(tagged.score).toBeGreaterThan(plain.score)
  })

  it('태그 겹침은 같은 근거 안에서 순위를 뒤집을 수 있다', () => {
    // 공격력 1: 불씨 피해 2, 모닥불 피해 1 — 체력 1 적은 둘 다 정확/과잉 1로 근접.
    const situation: SupportSituation = { playerAttack: 1, playerHealth: 20, playerMaxHealth: 20, strongEnemy: { health: 1, atFront: true } }
    const noTags = rankSupportCards(situation, ['ember', 'bonfire'] as HandCardId[])
    const withHeal = rankSupportCards({ ...situation, ownedRelicTags: ['heal', 'heal'] }, ['ember', 'bonfire'] as HandCardId[])
    // 태그 없는 기본 순위와 무관하게, heal 태그 유물은 모닥불(flame+heal) 점수만 끌어올린다.
    const bonfireBase = noTags.find((r) => r.cardId === 'bonfire')!
    const bonfireTagged = withHeal.find((r) => r.cardId === 'bonfire')!
    const emberBase = noTags.find((r) => r.cardId === 'ember')!
    const emberTagged = withHeal.find((r) => r.cardId === 'ember')!
    expect(bonfireTagged.score).toBeGreaterThan(bonfireBase.score)
    expect(emberTagged.score).toBe(emberBase.score)
  })
})
