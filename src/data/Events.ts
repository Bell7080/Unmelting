/**
 * Events - 이벤트 문을 열었을 때 진행되는 "인게임 이벤트" 데이터 정의.
 *
 * 관리 규칙:
 *  - 이벤트는 event_001, event_002 … 순서로 이 파일에 누적한다(한 이벤트 = 한 EventDefinition).
 *  - 각 이벤트의 씬 일러스트는 src/assets/sprites/event_XXX.webp 와 1:1 대응한다
 *    (event_000 은 레일 위 "문 칸" 전용이라 여기에는 들어가지 않는다).
 *  - 한 이벤트는 대사(화자별) → 선택지 버튼 흐름을 데이터로 기술한다.
 *    실제 효과 적용/이벤트 전투는 index.ts 의 applyEventChoice 가 effect.kind 로 분기한다.
 *  - 새 이벤트를 추가할 때는 EventId 유니온과 EVENT_DEFINITIONS 두 곳만 갱신하면 된다.
 */

import type { HandCardId } from '@entities/HandCard'

/** 추가될 때마다 확장하는 이벤트 식별자. 파일명 event_XXX 와 동일하게 유지한다. */
export type EventId = 'event_001'

/** 대사 한 줄. 화자에 따라 이름표/정렬을 다르게 렌더한다. */
export interface EventDialogueLine {
  /** 'npc' = 이벤트 화자(인형 등), 'player' = 플레이어 응답. */
  speaker: 'npc' | 'player'
  text: string
}

/**
 * 선택지 효과. index.ts applyEventChoice 가 kind 로 분기해 실제 게임 상태에 적용한다.
 *  - 'stat'       : 최대 체력/공격력 영구 가감(음수 가능).
 *  - 'randomHand' : 랜덤 손패 n장 지급.
 *  - 'combat'     : 위험한 이벤트 전투(보스전과 같은 흐름). 손패 불씨를 소모해 끌어낸다.
 */
export type EventEffect =
  | { kind: 'stat'; maxHealth?: number; damage?: number }
  | { kind: 'randomHand'; count: number }
  | { kind: 'combat'; consumeHand: HandCardId }

export interface EventChoice {
  /** 버튼 제목. */
  label: string
  /** 제목 아래 작은 글씨로 표기할 효과 요약(여러 줄 가능). */
  effectLines: string[]
  effect: EventEffect
  /**
   * 조건부 버튼: 지정한 손패가 있어야 활성화된다(없으면 완전 반투명/비활성).
   * 불태우기처럼 위험 선택을 손패 자원으로 잠가두는 용도.
   */
  requiresHand?: HandCardId
  /** 'burn' 등 화면 하단 중앙에 단독 배치하는 특수 버튼 표시. */
  emphasis?: 'danger'
  /** 선택 효과가 끝난 뒤 이벤트 NPC가 마무리로 말하는 대사. */
  afterDialogue?: EventDialogueLine[]
}

export interface EventDefinition {
  id: EventId
  /** 씬 일러스트 키(Sprites.spriteForEvent 로 로드). 예: 'event_001'. */
  illu: string
  /** 대사 이름표에 쓰는 화자 이름. */
  title: string
  /** 진입 시 순서대로 보여줄 대사. */
  dialogue: EventDialogueLine[]
  /** 대사 종료 후 제시할 선택지. */
  choices: EventChoice[]
}

/**
 * event_001 — "양초 악마 인형".
 * 촛농 흘러내리는 인형 같은 문지기가 붉은 초/푸른 초, 그리고 위험한 '불태우기'를 권한다.
 */
const EVENT_001: EventDefinition = {
  id: 'event_001',
  illu: 'event_001',
  title: '양초 악마 인형',
  dialogue: [
    { speaker: 'npc', text: '어라. . .?' },
    { speaker: 'npc', text: '아직도 잠식되지 않은 인간이 있네요?' },
    { speaker: 'player', text: '알 수 없는 소리를 하네.' },
    { speaker: 'npc', text: '뭐, 상관 없겠죠. 그렇다면 저의 귀한 손님일테니까요.' },
    { speaker: 'npc', text: '. . .' },
    { speaker: 'npc', text: '자! 고르세요. 진실과 거짓, 꿈과 현실! 무엇을 원하시죠?' },
  ],
  choices: [
    {
      label: '붉은 양초',
      effectLines: ['[ 능력 ] 체력 -5', '[ 능력 ] 공격 +1'],
      effect: { kind: 'stat', maxHealth: -5, damage: 1 },
      afterDialogue: [
        { speaker: 'npc', text: '음. . .' },
        { speaker: 'npc', text: '그 선택은. . . 뭐, 재밌네요.' },
      ],
    },
    {
      label: '푸른 양초',
      effectLines: ['[ 손패 ] 랜덤 +4'],
      effect: { kind: 'randomHand', count: 4 },
      afterDialogue: [
        { speaker: 'npc', text: '하하하!' },
        { speaker: 'npc', text: '역시, 이쪽이 더 마음에 드는 모양이지?' },
        { speaker: 'npc', text: '뭐, 열심히 발버둥쳐 보라고.' },
      ],
    },
    {
      label: '불태우기',
      effectLines: ['[ 손패 ] 불씨 소모', '[ 위험 ] 이벤트 전투'],
      effect: { kind: 'combat', consumeHand: 'ember' },
      afterDialogue: [
        { speaker: 'npc', text: '. . . !' },
        { speaker: 'npc', text: '자, 잠깐!' },
        { speaker: 'npc', text: '뭐하는 짓이야!' },
      ],
      requiresHand: 'ember',
      emphasis: 'danger',
    },
  ],
}

/** 전체 이벤트 테이블. 새 이벤트는 여기에 추가한다. */
export const EVENT_DEFINITIONS: Record<EventId, EventDefinition> = {
  event_001: EVENT_001,
}

/** 등록된 이벤트 id 목록(랜덤 선택/순회용). */
export const EVENT_IDS = Object.keys(EVENT_DEFINITIONS) as EventId[]

export function getEventDef(id: EventId): EventDefinition {
  return EVENT_DEFINITIONS[id]
}

/** 문을 열 때 진행할 이벤트를 고른다. 현재는 event_001 하나뿐이며,
 *  이벤트가 늘어나면 여기서 가중치/등장 조건을 적용한다. */
export function pickEventForDoor(): EventDefinition {
  const id = EVENT_IDS[Math.floor(Math.random() * EVENT_IDS.length)]
  return EVENT_DEFINITIONS[id]
}
