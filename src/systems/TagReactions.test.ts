import { describe, expect, it } from 'vitest'
import { Character } from '../entities/Character'
import { getRelicDef } from '../data/Relics'
import { runTagReactions, TAG_REACTIONS } from './TagReactions'

describe('TagReactions(태그 반응 뼈대)', () => {
  it('보유 유물 + 매칭 태그면 발동해 상태를 바꾼다', () => {
    const c = new Character()
    c.addRelic('ember-heart')
    c.ember = 0
    const out = runTagReactions('handCardUsed', { character: c, tags: ['flame'], merged: false })
    expect(out).toHaveLength(1)
    expect(out[0].relicId).toBe('ember-heart')
    expect(out[0].feedback).toBe('ember')
    expect(c.ember).toBe(1)
  })

  it('유물 미보유면 발동하지 않고 상태도 그대로다', () => {
    const c = new Character()
    c.ember = 0
    const out = runTagReactions('handCardUsed', { character: c, tags: ['flame'], merged: false })
    expect(out).toHaveLength(0)
    expect(c.ember).toBe(0)
  })

  it('보유해도 태그가 안 맞으면 발동하지 않는다', () => {
    const c = new Character()
    c.addRelic('ember-heart')
    c.ember = 0
    const out = runTagReactions('handCardUsed', { character: c, tags: ['shield'], merged: false })
    expect(out).toHaveLength(0)
    expect(c.ember).toBe(0)
  })

  it('태그가 비면 아무 반응도 실행하지 않는다', () => {
    const c = new Character()
    c.addRelic('ember-heart')
    const out = runTagReactions('handCardUsed', { character: c, tags: [], merged: false })
    expect(out).toHaveLength(0)
  })

  it('숫돌은 칼날 손패 사용 시 방패를 준다', () => {
    const c = new Character()
    c.addRelic('whetstone')
    c.shield = 0
    const out = runTagReactions('handCardUsed', { character: c, tags: ['blade'], merged: false })
    expect(out).toHaveLength(1)
    expect(c.shield).toBe(1)
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
})
