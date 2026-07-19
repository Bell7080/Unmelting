import { afterEach, describe, expect, it, vi } from 'vitest'
import { Character } from '../entities/Character'
import { getRelicDef } from '../data/Relics'
import { HAND_CARD_DEFINITIONS } from '../data/HandCards'
import { makeDefaultEnhancements } from '../core/RunEnhancements'
import type { SynergyTag } from '../data/Tags'
import { runTagReactions, TAG_REACTIONS, SHARD_GENERATORS, handCardIdsWithTag } from './TagReactions'

function ctx(c: Character, tags: SynergyTag[], enh = makeDefaultEnhancements()) {
  return { character: c, enhancements: enh, tags, merged: false }
}

afterEach(() => { vi.restoreAllMocks() })

describe('TagReactions(태그 반응 뼈대)', () => {
  it('보유 유물 + 매칭 태그면 3회째에 발동한다(연마)', () => {
    const c = new Character()
    c.addRelic('sharpening')
    const enh = makeDefaultEnhancements()
    // 1~2회는 카운트만 오르고 발동/강화 없음.
    expect(runTagReactions('handCardUsed', ctx(c, ['blade'], enh))).toHaveLength(0)
    expect(runTagReactions('handCardUsed', ctx(c, ['blade'], enh))).toHaveLength(0)
    expect(enh.singleBonus['slash'] ?? 0).toBe(0)
    // 3회째에 발동 + 강화 +1.
    const out = runTagReactions('handCardUsed', ctx(c, ['blade'], enh))
    expect(out).toHaveLength(1)
    expect(out[0].relicId).toBe('sharpening')
    expect(enh.singleBonus['slash']).toBe(1)
  })

  it('유물 미보유면 발동하지 않고 강화치도 그대로다', () => {
    const c = new Character()
    const enh = makeDefaultEnhancements()
    const out = runTagReactions('handCardUsed', ctx(c, ['blade'], enh))
    expect(out).toHaveLength(0)
    expect(enh.singleBonus['slash'] ?? 0).toBe(0)
  })

  it('보유해도 태그가 안 맞으면 발동하지 않는다', () => {
    const c = new Character()
    c.addRelic('sharpening')
    const enh = makeDefaultEnhancements()
    const out = runTagReactions('handCardUsed', ctx(c, ['shield'], enh))
    expect(out).toHaveLength(0)
    expect(enh.singleBonus['slash'] ?? 0).toBe(0)
  })

  it('태그가 비면 아무 반응도 실행하지 않는다', () => {
    const c = new Character()
    c.addRelic('sharpening')
    const out = runTagReactions('handCardUsed', ctx(c, []))
    expect(out).toHaveLength(0)
  })

  it('연마: 칼날 손패 3회 사용마다 모든 칼날 손패의 강화치가 영구 +1 누적된다', () => {
    const c = new Character()
    c.addRelic('sharpening')
    const enh = makeDefaultEnhancements()
    const bladeIds = handCardIdsWithTag('blade')
    expect(bladeIds.length).toBeGreaterThanOrEqual(5)

    // 6회 사용 = +2 (3회마다 +1). 트리플도 카드 플레이당 1회로 센다.
    for (let i = 0; i < 6; i++) runTagReactions('handCardUsed', ctx(c, ['blade'], enh))

    for (const id of bladeIds) {
      expect(enh.singleBonus[id], `${id} singleBonus`).toBe(2)
      expect(enh.tripleBonus[id], `${id} tripleBonus`).toBe(2)
    }
    // 칼날 파편도 함께 자란다(씨앗↔증폭 연결).
    expect(bladeIds).toContain('blade-shard')
  })

  it('망치: 칼날 손패 사용 시 25% 판정에 성공하면 칼날 파편을 지급하고, 실패하면 지급하지 않는다', () => {
    const c = new Character()
    c.addRelic('hammer')

    vi.spyOn(Math, 'random').mockReturnValue(0.1) // < 0.25 → 성공
    const hit = runTagReactions('handCardUsed', ctx(c, ['blade']))
    expect(hit).toHaveLength(1)
    expect(hit[0].grantCard).toBe('blade-shard')

    vi.spyOn(Math, 'random').mockReturnValue(0.9) // >= 0.25 → 실패
    const miss = runTagReactions('handCardUsed', ctx(c, ['blade']))
    expect(miss).toHaveLength(0)
  })

  it('handCardIdsWithTag는 태그별 손패를 반환한다(도서관 마도서 지급 풀 전제)', () => {
    const tomeCards = handCardIdsWithTag('tome')
    expect(tomeCards.length).toBeGreaterThan(0) // 도서관이 지급할 마도서가 존재해야 한다
    expect(handCardIdsWithTag('blade')).toContain('slash')
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
