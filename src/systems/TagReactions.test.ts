import { describe, expect, it } from 'vitest'
import { Character } from '../entities/Character'
import { getRelicDef } from '../data/Relics'
import { HAND_CARD_DEFINITIONS } from '../data/HandCards'
import { makeDefaultEnhancements } from '../core/RunEnhancements'
import type { SynergyTag } from '../data/Tags'
import { runTagReactions, TAG_REACTIONS, SHARD_GENERATORS, handCardIdsWithTag } from './TagReactions'

function ctx(c: Character, tags: SynergyTag[], enh = makeDefaultEnhancements()) {
  return { character: c, enhancements: enh, tags, merged: false }
}

describe('TagReactions(태그 반응 뼈대)', () => {
  it('보유 유물 + 매칭 태그면 발동해 상태를 바꾼다', () => {
    const c = new Character()
    c.addRelic('ember-heart')
    c.ember = 0
    const out = runTagReactions('handCardUsed', ctx(c, ['flame']))
    expect(out).toHaveLength(1)
    expect(out[0].relicId).toBe('ember-heart')
    expect(out[0].feedback).toBe('ember')
    expect(c.ember).toBe(1)
  })

  it('유물 미보유면 발동하지 않고 상태도 그대로다', () => {
    const c = new Character()
    c.ember = 0
    const out = runTagReactions('handCardUsed', ctx(c, ['flame']))
    expect(out).toHaveLength(0)
    expect(c.ember).toBe(0)
  })

  it('보유해도 태그가 안 맞으면 발동하지 않는다', () => {
    const c = new Character()
    c.addRelic('ember-heart')
    c.ember = 0
    const out = runTagReactions('handCardUsed', ctx(c, ['shield']))
    expect(out).toHaveLength(0)
    expect(c.ember).toBe(0)
  })

  it('태그가 비면 아무 반응도 실행하지 않는다', () => {
    const c = new Character()
    c.addRelic('ember-heart')
    const out = runTagReactions('handCardUsed', ctx(c, []))
    expect(out).toHaveLength(0)
  })

  it('연마: 칼날 손패 사용 시 모든 칼날 손패의 강화치가 영구 +1 누적된다', () => {
    const c = new Character()
    c.addRelic('sharpening')
    const enh = makeDefaultEnhancements()
    const bladeIds = handCardIdsWithTag('blade')
    expect(bladeIds.length).toBeGreaterThanOrEqual(5)

    // 칼날 손패 2회 사용 → 모든 칼날 손패 강화 +2 누적.
    runTagReactions('handCardUsed', ctx(c, ['blade'], enh))
    runTagReactions('handCardUsed', ctx(c, ['blade'], enh))

    for (const id of bladeIds) {
      expect(enh.singleBonus[id], `${id} singleBonus`).toBe(2)
      expect(enh.tripleBonus[id], `${id} tripleBonus`).toBe(2)
    }
    // 칼날 파편도 함께 자란다(씨앗↔증폭 연결).
    expect(bladeIds).toContain('blade-shard')
  })

  it('연마 미보유 시 칼날 손패를 써도 강화치가 오르지 않는다', () => {
    const c = new Character()
    const enh = makeDefaultEnhancements()
    runTagReactions('handCardUsed', ctx(c, ['blade'], enh))
    expect(enh.singleBonus['slash'] ?? 0).toBe(0)
  })

  it('모든 반응의 relicId는 실제 유물이고, anyTag가 그 유물 synergyTags와 일치한다', () => {
    for (const r of TAG_REACTIONS) {
      const def = getRelicDef(r.relicId)
      expect(def, `${r.relicId} 유물 정의`).toBeDefined()
      const relicTags = def.synergyTags ?? []
      // 반응 조건 태그가 유물 자신의 표기 태그와 어긋나면 판독성/에나 판단이 깨진다.
      for (const t of r.anyTag) expect(relicTags, `${r.relicId} 태그`).toContain(t)
    }
  })

  it('파편 생성기: relicId는 실제 유물, shard는 실제 카드이며 유물 태그를 공유한다', () => {
    for (const gen of SHARD_GENERATORS) {
      const relic = getRelicDef(gen.relicId)
      expect(relic, `${gen.relicId} 유물`).toBeDefined()
      const shard = HAND_CARD_DEFINITIONS[gen.shard]
      expect(shard, `${gen.shard} 카드`).toBeDefined()
      // 파편은 일반 풀에 새면 안 되고(전용 dropSource), 생성 유물과 태그를 공유해야 빌드 축이 선다.
      expect(shard.dropSource).toBe('relic')
      const relicTags = relic.synergyTags ?? []
      const shardTags = shard.synergyTags ?? []
      expect(shardTags.some((t) => relicTags.includes(t)), `${gen.shard}↔${gen.relicId} 태그 공유`).toBe(true)
      expect(gen.perKill).toBeGreaterThan(0)
    }
  })
})
