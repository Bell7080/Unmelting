/**
 * HandCardAdvisor 단위 테스트 — 상황별로 데이터 주도 스코어러가
 * 적절한 손패를(해금 풀 안에서만) 고르는지 검증한다.
 */

import { describe, expect, it } from 'vitest'
import type { HandCardId } from '@entities/HandCard'
import {
  bestSupportCard,
  estimateHandCardDamage,
  rankSupportCards,
  RECIPE_SUPPORT_DISCOUNT,
  WEB_FIELD_CLUTTER_THRESHOLD,
  type SupportSituation,
} from './HandCardAdvisor'

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

describe('HandCardAdvisor 기대 HP 환산', () => {
  it('병합 5피해보다 반격 임박 강적 12피해 처치를 우선한다 (회귀)', () => {
    const situation: SupportSituation = {
      ...base,
      webMerge: { mergedSize: 2, mergingOneWebs: 2 },
      strongEnemy: { health: 3, atFront: true, attack: 12, attackInTurns: 0 },
    }
    const pick = bestSupportCard(situation, ['sweep', 'ember'] as HandCardId[])
    expect(pick?.cardId).toBe('ember') // 처치 가치 ≈ 공격력 12 > 병합 피해 5×확률
    expect(pick?.fit).toBe('attack')
  })

  it('처치각이 없으면 같은 12피해 강적에 방어(굳음)를 병합 청소보다 우선한다 (회귀)', () => {
    const situation: SupportSituation = {
      ...base,
      webMerge: { mergedSize: 2, mergingOneWebs: 2 },
      strongEnemy: { health: 30, atFront: true, attack: 12, attackInTurns: 0 },
    }
    const pick = bestSupportCard(situation, ['sweep', 'wax'] as HandCardId[])
    expect(pick?.cardId).toBe('wax') // 방어 가치 = 흡수 기대 피해 12 > 병합 피해 5×확률
    expect(pick?.fit).toBe('defense')
  })

  it('강적 공격력이 낮으면 즉사급(3칸) 병합 저지가 최상위 고정으로 우선한다', () => {
    const situation: SupportSituation = {
      ...base,
      webMerge: { mergedSize: 3, mergingOneWebs: 2 },
      strongEnemy: { health: 3, atFront: true, attack: 3, attackInTurns: 0 },
    }
    const pick = bestSupportCard(situation, ['sweep', 'ember'] as HandCardId[])
    expect(pick?.cardId).toBe('sweep')
    expect(pick?.fit).toBe('cleanup')
  })

  it('이미 완성된 3칸 거미줄은 단일 지급 카드로 못 치우므로 청소 지원을 접는다', () => {
    const situation: SupportSituation = {
      ...base,
      frontWideWebSpan: 3,
      webMerge: { mergedSize: 0, mergingOneWebs: 0 },
    }
    expect(bestSupportCard(situation, ['chitin', 'sweep'] as HandCardId[])).toBeNull()
  })

  it('1칸 거미줄이 문턱 이상 널리면 병합각 없이도 광역 청소를 지원한다', () => {
    const cluttered: SupportSituation = { ...base, fieldOneWebCount: WEB_FIELD_CLUTTER_THRESHOLD }
    const pick = bestSupportCard(cluttered, ['sweep', 'ember'] as HandCardId[])
    expect(pick?.cardId).toBe('sweep')
    expect(pick?.fit).toBe('cleanup')
    // 문턱 미만 오염은 아직 광역 청소 근거가 아니다.
    const sparse: SupportSituation = { ...base, fieldOneWebCount: WEB_FIELD_CLUTTER_THRESHOLD - 1 }
    expect(bestSupportCard(sparse, ['sweep', 'ember'] as HandCardId[])).toBeNull()
  })

  it('시련 함정 피해 보너스(실효값)는 청소 환산 가치를 올린다', () => {
    const ones: SupportSituation = { ...base, webMerge: { mergedSize: 2, mergingOneWebs: 2 } }
    const plain = rankSupportCards(ones, ['sweep'] as HandCardId[])[0]
    const harsh = rankSupportCards({ ...ones, trapDamageBonus: 3 }, ['sweep'] as HandCardId[])[0]
    expect(harsh.score).toBeGreaterThan(plain.score)
  })

  it('강화팩 단일 flat 보너스(실효값)로만 처치가 닿으면 처치 지원이 열린다', () => {
    const situation: SupportSituation = { ...base, strongEnemy: { health: 4, atFront: true, attack: 5 } }
    expect(bestSupportCard(situation, ['ember'] as HandCardId[])).toBeNull() // 피해 3 < 4
    const boosted = bestSupportCard({ ...situation, handSingleBonus: { ember: 1 } }, ['ember'] as HandCardId[])
    expect(boosted?.cardId).toBe('ember') // 피해 3+1 = 4 → 처치
    expect(boosted?.fit).toBe('attack')
  })
})

describe('HandCardAdvisor 시간 축(레일 예고 큐)', () => {
  it('예고 큐에 거미줄이 더 오면 광역 청소는 가점, 전방 단일 제거는 감점된다', () => {
    const ones: SupportSituation = { ...base, webMerge: { mergedSize: 2, mergingOneWebs: 2 } }
    const now = rankSupportCards(ones, ['sweep'] as HandCardId[])[0]
    const soonMore = rankSupportCards(
      { ...ones, incomingRefill: { webs: 2, spores: 0, enemies: 0 } },
      ['sweep'] as HandCardId[]
    )[0]
    expect(soonMore.score).toBeGreaterThan(now.score)

    const wide: SupportSituation = { ...base, frontWideWebSpan: 2 }
    const single = rankSupportCards(wide, ['chitin'] as HandCardId[])[0]
    const singleSoonMore = rankSupportCards(
      { ...wide, incomingRefill: { webs: 1, spores: 0, enemies: 0 } },
      ['chitin'] as HandCardId[]
    )[0]
    expect(singleSoonMore.score).toBeLessThan(single.score)
  })
})

describe('HandCardAdvisor 트리플 기회비용', () => {
  const killable: SupportSituation = { ...base, strongEnemy: { health: 3, atFront: true, attack: 4 } }

  it('플레이어가 정확히 2장 든 카드는 지급을 허용하고 트리플 완성 가점을 준다', () => {
    const plain = rankSupportCards(killable, ['ember'] as HandCardId[])[0]
    const tripleReady = rankSupportCards(
      { ...killable, heldCardIds: ['ember', 'ember'] as HandCardId[], heldCardCounts: { ember: 2 } },
      ['ember'] as HandCardId[]
    )[0]
    expect(tripleReady.cardId).toBe('ember')
    expect(tripleReady.score).toBeGreaterThan(plain.score)
  })

  it('1장 보유(트리플 각 아님)는 기존처럼 같은 카드 지급을 막는다', () => {
    const oneHeld = bestSupportCard(
      { ...killable, heldCardIds: ['ember'] as HandCardId[], heldCardCounts: { ember: 1 } },
      ['ember'] as HandCardId[]
    )
    expect(oneHeld).toBeNull()
  })
})

describe('HandCardAdvisor 역할 가중(RL 피팅 노출)', () => {
  it('supportRoleWeights가 역할 간 우선순위를 조정한다(기본 1.0 = 무변화)', () => {
    const situation: SupportSituation = {
      ...base,
      webMerge: { mergedSize: 2, mergingOneWebs: 2 },
      strongEnemy: { health: 3, atFront: true, attack: 12, attackInTurns: 0 },
    }
    const pool = ['sweep', 'ember'] as HandCardId[]
    const neutral = bestSupportCard(
      { ...situation, supportRoleWeights: { cleanup: 1, attack: 1, defense: 1, resource: 1, recovery: 1 } },
      pool
    )
    expect(neutral?.cardId).toBe('ember') // 가중 1.0은 기본 환산과 같은 결론
    const cleanupFocused = bestSupportCard(
      { ...situation, supportRoleWeights: { cleanup: 2, attack: 0.2, defense: 1, resource: 1, recovery: 1 } },
      pool
    )
    expect(cleanupFocused?.cardId).toBe('sweep') // 처치 가치를 깎고 청소를 키우면 결론이 뒤집힌다
  })
})

describe('HandCardAdvisor 레시피 완성각', () => {
  it('할인 상수는 직접 효과가 항상 이기도록 1 미만으로 유지된다', () => {
    expect(RECIPE_SUPPORT_DISCOUNT).toBeGreaterThanOrEqual(0.5)
    expect(RECIPE_SUPPORT_DISCOUNT).toBeLessThanOrEqual(0.6)
  })

  it('불씨 부족 + 샹들리에 보유면 성냥 가치가 밝은 천장 완성각 가산으로 오른다', () => {
    const situation: SupportSituation = { ...base, emberLow: true }
    const plain = rankSupportCards(situation, ['match'] as HandCardId[])[0]
    const withChandelier = rankSupportCards(
      { ...situation, heldCardIds: ['chandelier'] as HandCardId[], heldCardCounts: { chandelier: 1 } },
      ['match'] as HandCardId[]
    )[0]
    expect(withChandelier.score).toBeGreaterThan(plain.score)
    // 직접 효과(불씨 보충)가 여전히 대표 근거 — 레시피는 가산으로만 얹힌다.
    expect(withChandelier.fit).toBe('ember')
  })

  it('직접 효과 카드가 해금돼 있으면 레시피 경로(할인)보다 우선한다', () => {
    // 양초 보유 → 촛농이 양초 스매쉬(전방 랜덤 적 처치)의 마지막 재료. 직접 처치각인 불씨가 이겨야 한다.
    const situation: SupportSituation = {
      ...base,
      strongEnemy: { health: 3, atFront: true, attack: 12, attackInTurns: 0 },
      heldCardIds: ['candle'] as HandCardId[],
      heldCardCounts: { candle: 1 },
    }
    const rankings = rankSupportCards(situation, ['ember', 'wax-drop'] as HandCardId[])
    expect(rankings[0].cardId).toBe('ember')
    expect(rankings[0].fit).toBe('attack')
    // 레시피 완성각 카드도 순위에는 오르되, 이름이 이유 구에 드러난다.
    const recipePath = rankings.find((r) => r.cardId === 'wax-drop')
    expect(recipePath?.fit).toBe('attack')
    expect(recipePath?.reason).toContain('양초 스매쉬')
  })

  it('해금 안 된(runLocked) 레시피는 가산하지 않는다', () => {
    const situation: SupportSituation = {
      ...base,
      emberLow: true,
      heldCardIds: ['book-of-flames'] as HandCardId[],
      heldCardCounts: { 'book-of-flames': 1 },
    }
    const locked = rankSupportCards(situation, ['match'] as HandCardId[])[0]
    const unlocked = rankSupportCards(
      { ...situation, unlockedRecipeIds: new Set(['flame-infusion']) },
      ['match'] as HandCardId[]
    )[0]
    const plain = rankSupportCards({ ...base, emberLow: true }, ['match'] as HandCardId[])[0]
    expect(locked.score).toBe(plain.score)
    expect(unlocked.score).toBeGreaterThan(locked.score)
  })

  it('저체력이면 회복 레시피 완성각(대접)이 단독 근거로도 추천된다', () => {
    // 촛농 보유가 직접 회복 지원(같은 역할)을 접게 하지만, 찻잔은 대접(체력 3 회복) 완성각으로 추천된다.
    const situation: SupportSituation = {
      ...base,
      playerHealth: 6,
      heldCardIds: ['wax-drop'] as HandCardId[],
      heldCardCounts: { 'wax-drop': 1 },
    }
    const pick = bestSupportCard(situation, ['teacup'] as HandCardId[])
    expect(pick?.cardId).toBe('teacup')
    expect(pick?.fit).toBe('recovery')
    expect(pick?.reason).toContain('대접')
  })

  it('필요와 맞지 않는 완성각(generic)은 단독 추천 근거가 되지 못한다', () => {
    // 따뜻함(촛농 획득)은 지금 필요 축이 없으면 후보를 홀로 밀어올리지 않는다 — 순서 기반 recipe 보조 경로 보존.
    const situation: SupportSituation = {
      ...base,
      heldCardIds: ['ember'] as HandCardId[],
      heldCardCounts: { ember: 1 },
    }
    expect(bestSupportCard(situation, ['candle'] as HandCardId[])).toBeNull()
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
