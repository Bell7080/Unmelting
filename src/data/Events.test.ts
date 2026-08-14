/**
 * 이벤트 테이블 계약 — 데이터만 늘려 이벤트를 추가할 수 있게 하되, 조용히 깨지는 것들을 막는다.
 *
 * 이벤트는 코드가 아니라 **표**로 늘어난다. 그래서 잘못 적어도 타입 검사를 통과하고
 * 화면에서만 이상해지는 실수가 생긴다 — 아무 일도 안 하는 선택지, 화면에 적힌 효과와
 * 실제 효과가 다른 버튼, 정의는 있는데 어느 표에도 안 물린 이벤트 같은 것들.
 */
import { describe, expect, it } from 'vitest'
import { EVENT_DEFINITIONS, EVENT_IDS, getEventDef, type EventId } from './Events'

describe('이벤트 테이블 계약', () => {
  it('표의 키와 정의의 id가 같다', () => {
    for (const id of EVENT_IDS) {
      expect(getEventDef(id).id, `${id} 정의의 id가 표의 키와 다르다`).toBe(id)
    }
  })

  it('모든 이벤트가 choice형이거나 minigame형 중 하나다', () => {
    for (const id of EVENT_IDS) {
      const def = getEventDef(id)
      const isChoice = (def.choices?.length ?? 0) > 0
      const isMinigame = def.minigame != null
      // 둘 다 없으면 문을 열어도 아무것도 못 하고, 둘 다 있으면 어느 쪽이 도는지 화면에서만 드러난다.
      expect(isChoice !== isMinigame, `${id}는 choice형/minigame형 중 정확히 하나여야 한다`).toBe(true)
    }
  })

  it('선택지는 이름·효과 문구·실제 효과를 모두 갖는다', () => {
    for (const id of EVENT_IDS) {
      for (const choice of getEventDef(id).choices ?? []) {
        const where = `${id} / ${choice.label}`
        expect(choice.label.trim(), `${where}: 버튼 이름이 비어 있다`).not.toBe('')
        expect(choice.effectLines.length, `${where}: 효과 문구가 없다`).toBeGreaterThan(0)
        for (const line of choice.effectLines) {
          expect(line.trim(), `${where}: 빈 효과 문구가 있다`).not.toBe('')
        }
      }
    }
  })

  it('resource 선택지는 실제로 무언가를 바꾼다', () => {
    // 항목을 하나도 안 채운 resource 효과는 버튼을 눌러도 아무 일이 없다 —
    // 문구는 그럴싸한데 효과가 비어 있는 상태가 조용히 배송되는 걸 막는다.
    for (const id of EVENT_IDS) {
      for (const choice of getEventDef(id).choices ?? []) {
        if (choice.effect.kind !== 'resource') continue
        const { kind: _kind, ...fields } = choice.effect
        const moved = Object.values(fields).some((v) => typeof v === 'number' && v !== 0)
        expect(moved, `${id} / ${choice.label}: resource 효과가 아무것도 바꾸지 않는다`).toBe(true)
      }
    }
  })

  it('choice형 이벤트의 선택지는 2개 이상이다', () => {
    for (const id of EVENT_IDS) {
      const choices = getEventDef(id).choices
      if (!choices) continue
      // 선택지가 하나면 '선택'이 아니라 통보다.
      expect(choices.length, `${id}: 선택지가 ${choices.length}개뿐이다`).toBeGreaterThanOrEqual(2)
    }
  })

  it('일러스트 키가 이벤트 id와 같다', () => {
    // 씬 일러스트는 event_XXX.webp와 1:1이다. 키가 어긋나면 다른 이벤트 그림이 뜬다.
    for (const id of EVENT_IDS) {
      expect(getEventDef(id).illu, `${id}: illu가 id와 다르다`).toBe(id)
    }
  })

  it('문에서 뽑는 이벤트가 표 안의 것만 나온다', () => {
    const ids = new Set<EventId>(EVENT_IDS)
    for (const id of Object.keys(EVENT_DEFINITIONS) as EventId[]) {
      expect(ids.has(id), `${id}가 EVENT_IDS에 없다`).toBe(true)
    }
  })
})
