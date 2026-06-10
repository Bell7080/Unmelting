/**
 * Events - 이벤트 문을 열었을 때 진행되는 "인게임 이벤트" 데이터 정의.
 *
 * 관리 규칙:
 *  - 이벤트는 event_001, event_002 … 순서로 이 파일에 누적한다(한 이벤트 = 한 EventDefinition).
 *  - 각 이벤트의 씬 일러스트는 src/assets/sprites/event_XXX.webp 와 1:1 대응한다
 *    (event_000 은 레일 위 "문 칸" 전용이라 여기에는 들어가지 않는다).
 *  - 한 이벤트는 간단한 대사 → (있으면) 선택지 → (선택 시) 효과/미니게임 흐름을
 *    데이터로만 기술한다. 실제 효과/미니게임 로직은 추후 핸들러에서 id로 분기한다.
 *  - 새 이벤트를 추가할 때는 EventId 유니온과 EVENT_DEFINITIONS 두 곳만 갱신하면 된다.
 */

/** 추가될 때마다 확장하는 이벤트 식별자. 파일명 event_XXX 와 동일하게 유지한다. */
export type EventId = 'event_001'

/**
 * 이벤트 진행 형식.
 *  - 'dialogue' : 대사만 보고 닫는 단순 이벤트.
 *  - 'choice'   : 대사 후 2~N개 선택지를 제시한다.
 *  - 'minigame' : 가위바위보/조커뽑기 등 특수 미니게임(추후 구현, kind로 분기).
 */
export type EventKind = 'dialogue' | 'choice' | 'minigame'

/** 선택지 1개. 효과 적용은 추후 id 기반 핸들러에서 연결한다. */
export interface EventChoice {
  /** 버튼에 표시할 짧은 라벨. */
  label: string
  /** 선택 직후 보여줄 결과 대사. */
  resultText: string
  // TODO(effect): 선택 효과 적용 훅. 런 modifier/보상/손패 등과 연결할 때 추가한다.
}

export interface EventDefinition {
  id: EventId
  kind: EventKind
  /** 씬 일러스트 키(Sprites.spriteForEvent 로 로드). 예: 'event_001'. */
  illu: string
  /** 화면 상단 제목. 없으면 미표시. */
  title: string
  /** 대사 화자 이름(선택). */
  speaker?: string
  /** 진입 시 순서대로 보여줄 대사 라인. */
  dialogue: string[]
  /** kind==='choice' 일 때 제시할 선택지. 그 외에는 생략. */
  choices?: EventChoice[]
}

/**
 * event_001 — "두 개의 촛불".
 * 촛농이 흘러내리는 인형 같은 문지기가 붉은 초와 푸른 초 중 하나를 권한다.
 * (효과는 추후 연결: 지금은 분위기/선택 흐름만 확정한다.)
 */
const EVENT_001: EventDefinition = {
  id: 'event_001',
  kind: 'choice',
  illu: 'event_001',
  title: '두 개의 촛불',
  speaker: '촛농 인형',
  dialogue: [
    '. . . 문을 열었구나.',
    '여기까지 온 손님에겐 작은 선물을 주지.',
    '붉은 초와 푸른 초. 하나만 가져갈 수 있어.',
  ],
  choices: [
    {
      label: '붉은 초',
      resultText: '붉은 불꽃이 손끝에서 타오른다. 뜨겁지만, 오래가지 않을 온기.',
    },
    {
      label: '푸른 초',
      resultText: '푸른 불꽃이 조용히 일렁인다. 차갑지만, 깊고 멀리 비추는 빛.',
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
