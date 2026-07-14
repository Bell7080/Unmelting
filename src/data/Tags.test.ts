import { describe, expect, it } from 'vitest'
import { HAND_CARD_DEFINITIONS } from './HandCards'
import { RELIC_DEFINITIONS } from './Relics'
import {
  SYNERGY_TAGS,
  ACTIVE_SYNERGY_TAGS,
  isSynergyTag,
  MAX_TAGS_PER_CARD,
  MIN_CARDS_PER_SYNERGY_TAG,
  type SynergyTag,
} from './Tags'

/** 능동/보조 구분 없이 태그별 손패 수를 센다. */
function handCardTagCounts(): Record<SynergyTag, number> {
  const counts = Object.fromEntries(
    (Object.keys(SYNERGY_TAGS) as SynergyTag[]).map((t) => [t, 0]),
  ) as Record<SynergyTag, number>
  for (const def of Object.values(HAND_CARD_DEFINITIONS)) {
    for (const t of def.synergyTags ?? []) counts[t] += 1
  }
  return counts
}

describe('Tags taxonomy(태그 양식)', () => {
  it('모든 손패의 태그는 SYNERGY_TAGS에 등록돼 있다', () => {
    for (const def of Object.values(HAND_CARD_DEFINITIONS)) {
      for (const t of def.synergyTags ?? []) expect(isSynergyTag(t)).toBe(true)
    }
  })

  it('모든 손패는 정체성 태그를 1~5개 가진다', () => {
    for (const def of Object.values(HAND_CARD_DEFINITIONS)) {
      const tags = def.synergyTags ?? []
      expect(tags.length, `${def.id} 태그 수`).toBeGreaterThanOrEqual(1)
      expect(tags.length, `${def.id} 태그 수`).toBeLessThanOrEqual(MAX_TAGS_PER_CARD)
    }
  })

  it('능동 시너지 태그는 손패를 최소 5장 이상 확보한다(빌드 축 성립 계약)', () => {
    const counts = handCardTagCounts()
    for (const t of ACTIVE_SYNERGY_TAGS) {
      expect(counts[t], `${t} 손패 수`).toBeGreaterThanOrEqual(MIN_CARDS_PER_SYNERGY_TAG)
    }
  })

  it('유물 태그도 SYNERGY_TAGS에 등록돼 있다', () => {
    for (const def of Object.values(RELIC_DEFINITIONS)) {
      for (const t of def.synergyTags ?? []) expect(isSynergyTag(t)).toBe(true)
    }
  })
})
