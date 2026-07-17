/**
 * Events - 이벤트 문을 열었을 때 진행되는 "인게임 이벤트" 데이터 정의.
 *
 * 관리 규칙:
 *  - 이벤트는 event_001, event_002 … 순서로 이 파일에 누적한다(한 이벤트 = 한 EventDefinition).
 *  - 각 이벤트의 씬 일러스트는 src/assets/sprites/event_XXX.webp 와 1:1 대응한다
 *    (event_000 은 레일 위 "문 칸" 전용이라 여기에는 들어가지 않는다).
 *  - 이벤트는 두 종류다:
 *      1) choice형: 대사 → 선택지 버튼(EventChoice). 효과는 index.ts applyEventChoice 가 적용한다.
 *      2) minigame형: 대사 → 인터랙티브 미니게임(GameBoardRenderer). 실력으로 자원을 굴린 뒤
 *         정산 델타(EventMinigameSettlement)를 index.ts 가 실제 자원에 반영한다.
 *  - 새 이벤트를 추가할 때는 EventId 유니온과 EVENT_DEFINITIONS 두 곳을 갱신한다.
 *    minigame형이면 config(아래)와 렌더러/정산 배선을 함께 확장한다.
 */

import type { HandCardId } from '@entities/HandCard'

/** 추가될 때마다 확장하는 이벤트 식별자. 파일명 event_XXX 와 동일하게 유지한다. */
export type EventId = 'event_001' | 'event_002' | 'event_003'

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
  | { kind: 'combat'; consumeHand: HandCardId; unlocksRecipe?: string }

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
  /** CSS 테마 클래스 접미사: 'candle-red' → .event-choice--candle-red 로 적용된다. */
  themeClass?: string
}

// ──────────────────────────────────────────────────────────────────────────
// 미니게임 공통: 이벤트에서 다룰 수 있는 자원(메타 화폐 $ 는 제외).
// ──────────────────────────────────────────────────────────────────────────
export type EventResourceKind = 'light' | 'hand' | 'candle' | 'health' | 'shield'

/** 미니게임 진입 시 넘기는 현재 자원 스냅샷. 내부 임시 원장의 시작점이자 상한 판정에 쓴다. */
export interface EventResourceSnapshot {
  /** 불빛(score). */
  light: number
  /** 현재 손패 수 / 최대 손패 수. */
  hand: number
  handMax: number
  /** 콤보 게이지 / 만충 기준. */
  candle: number
  candleMax: number
  /** 현재 체력 / 최대 체력. */
  health: number
  maxHealth: number
  /** 현재 방패. */
  shield: number
  /** 현재 층(=런 턴). 판돈 스케일 등에 쓴다. */
  floor: number
}

/**
 * 미니게임이 자원을 실시간으로 올리고 내릴 때 호출하는 싱크. index.ts 가 구현한다.
 * 각 메서드는 실제 상태를 즉시 변경하고 HUD 카운터 피드백 + 화면 갱신까지 수행한다
 * (버스트/트레일 연출은 렌더러가 직접 쏜다). 미니게임은 스냅샷을 로컬 미러로 들고
 * 싱크와 같은 값을 병행 계산해 가용/상한을 판정한다.
 */
export interface EventResourceSink {
  /** 불빛(score) 증감. 음수면 소비 피드백. */
  gainLight(amount: number): void
  /** 체력 증감. 음수면 피해. */
  changeHealth(amount: number): void
  /** 콤보 게이지 증감. */
  gainCandle(amount: number): void
  /** 방패 증가. */
  gainShield(amount: number): void
  /** 손패 제거(오래된 것부터). */
  sellHand(count: number): void
  /** 랜덤 손패 지급. */
  buyHand(count: number): void
  /** 등급 가중치로 유물 1개 지급(백작 완승 보상 등). */
  grantRelic(): void
}

// ── event_002: 겁쟁이 미니언의 저울(환전 최적화) ─────────────────────────────
/** 저울 교환 제안 1종. give 를 바쳐 get 을 받는다. get 은 겁/콤보 배율로 스케일된다. */
export interface ExchangeOffer {
  id: string
  label: string
  give: { res: EventResourceKind; amount: number }
  get: { res: EventResourceKind; baseAmount: number }
  /** 짧은 설명(용도 힌트). */
  hint: string
}

export interface MinionExchangeConfig {
  kind: 'minion-exchange'
  /** 겁 상한(별빛 pip 개수). 이 값에 도달하면 교환이 잠기고 정산만 가능하다. */
  fearCap: number
  /** 교환 1회당 겁 증가량. */
  fearPerTrade: number
  /** 겁 1당 환율 가산(예: 0.06 → 겁 만렙에서 +fearCap*0.06 배). */
  fearRateGain: number
  /** 흥정 콤보 1당 배율 가산(예: 0.08). 연속 교환마다 누적된다. */
  comboStep: number
  /** 고정 교환 메뉴. 진입 중 바뀌지 않아 순수 계획 퍼즐이 된다. */
  offers: ExchangeOffer[]
}

// ── event_003: 가위바위보 백작(덱 카운팅 + 베팅) ────────────────────────────
export type RpsHand = 'rock' | 'paper' | 'scissors'

export interface CountRpsConfig {
  kind: 'count-rps'
  /** 앞면으로 공개되는 백작의 유한 덱 조성. */
  deck: Record<RpsHand, number>
  /** 기본 판돈(층 보정은 런타임에서 곱한다). */
  baseStake: number
  /**
   * 비김 시 백작이 가져가는 판돈 비율(하우스 레이크). 0.5 = 절반 손실.
   * 이 페널티가 있어야 어떤 손도 '무손해'가 아니며, 덱 카운팅+선언으로 +EV를 읽어야 이득이다.
   */
  tieLossFraction: number
  /** 완승(덱 소진) 시 유물 지급 기준 순이익(baseStake 배수). */
  relicWinMultiple: number
}

export interface EventDefinition {
  id: EventId
  /** 씬 일러스트 키(Sprites.spriteForEvent 로 로드). 예: 'event_001'. */
  illu: string
  /** 대사 이름표에 쓰는 화자 이름. */
  title: string
  /** 진입 시 순서대로 보여줄 대사. */
  dialogue: EventDialogueLine[]
  /** choice형 이벤트의 선택지(미니게임형이면 생략). */
  choices?: EventChoice[]
  /** minigame형 이벤트의 설정(choice형이면 생략). */
  minigame?: MinionExchangeConfig | CountRpsConfig
  /** 정산/종료 후 이벤트 NPC 마무리 대사(미니게임형에서 사용). */
  outro?: EventDialogueLine[]
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
      effectLines: ['최대체력 -5 · 공격력+1'],
      effect: { kind: 'stat', maxHealth: -5, damage: 1 },
      themeClass: 'candle-red',
      afterDialogue: [
        { speaker: 'npc', text: '음. . .' },
        { speaker: 'npc', text: '그 선택은. . . 뭐, 재밌네요.' },
      ],
    },
    {
      label: '푸른 양초',
      effectLines: ['랜덤 손패 + 4'],
      effect: { kind: 'randomHand', count: 4 },
      themeClass: 'candle-blue',
      afterDialogue: [
        { speaker: 'npc', text: '하하하!' },
        { speaker: 'npc', text: '역시, 이쪽이 더 마음에 드는 모양이지?' },
        { speaker: 'npc', text: '뭐, 열심히 발버둥쳐 보라고.' },
      ],
    },
    {
      label: '불태우기',
      effectLines: ['[ 손패 ] 불씨 소모 · [ 레시피 ] 악마 소환 해금'],
      effect: { kind: 'combat', consumeHand: 'ember', unlocksRecipe: 'demon-summon' },
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

/**
 * event_002 — "겁쟁이 미니언의 저울".
 * 금을 끌어안은 겁 많은 미니언과의 환전 최적화. 밀수록(겁↑) 환율이 좋아지고, 연속 교환(흥정 콤보)이
 * 배율을 키운다. 겁 상한은 눈에 보이므로 순수 계산으로 최대 이득을 짜내는 실력 이벤트다.
 */
const EVENT_002: EventDefinition = {
  id: 'event_002',
  illu: 'event_002',
  title: '겁쟁이 미니언',
  dialogue: [
    { speaker: 'npc', text: '히익—! 가, 가까이 오지 마!' },
    { speaker: 'npc', text: '이건 내 거야. . . 전부 내가 모은 거란 말이야. . .' },
    { speaker: 'player', text: '그 금, 어차피 다 못 쓰잖아.' },
    { speaker: 'npc', text: '그, 그럼. . . 거래! 거래는 할게! 조금이면 돼, 조금이면. . .' },
    { speaker: 'npc', text: '대신 빨리 끝내 줘. 오래 보고 있으면. . . 무서우니까.' },
  ],
  minigame: {
    kind: 'minion-exchange',
    fearCap: 6,
    fearPerTrade: 1,
    fearRateGain: 0.09,
    comboStep: 0.1,
    // 고정 메뉴 — 자원마다 성격이 다르다. 큰 교환을 겁·콤보가 높은 뒤로 미루는 순서 최적화가 실력.
    offers: [
      { id: 'hp-light', label: '피 담보', give: { res: 'health', amount: 5 }, get: { res: 'light', baseAmount: 80 }, hint: '체력을 밑천으로' },
      { id: 'hand-light', label: '패 청산', give: { res: 'hand', amount: 1 }, get: { res: 'light', baseAmount: 70 }, hint: '남는 손패를 팔아' },
      { id: 'light-shield', label: '방패 흥정', give: { res: 'light', amount: 100 }, get: { res: 'shield', baseAmount: 6 }, hint: '난구간 대비' },
      { id: 'light-candle', label: '촛농 매입', give: { res: 'light', amount: 90 }, get: { res: 'candle', baseAmount: 3 }, hint: '만충 폭발각' },
    ],
  },
  outro: [
    { speaker: 'npc', text: '이, 이제 됐지? 됐지?!' },
    { speaker: 'npc', text: '가, 가 줘. . . 제발. . .' },
  ],
}

/**
 * event_003 — "가위바위보 백작".
 * 격식을 따지는 밀랍 귀족과의 가위바위보. 백작은 앞면이 보이는 유한 덱으로만 내고(카운팅), 매 판
 * 스스로를 구속하는 격식 선언을 한다(간파). 불빛을 판돈으로 걸고 연승 배율을 쌓되, 언제든 물러나
 * 이익을 지킨다. 운을 읽기·베팅 실력으로 뒤집는 대결형 이벤트다.
 */
const EVENT_003: EventDefinition = {
  id: 'event_003',
  illu: 'event_003',
  title: '가위바위보 백작',
  dialogue: [
    { speaker: 'npc', text: '오호, 이런 곳에서 온기가 도는 손을 보다니.' },
    { speaker: 'npc', text: '나는 이 홀의 주인. 심심풀이 승부를 즐기는 백작이라네.' },
    { speaker: 'player', text: '. . .가위바위보?' },
    { speaker: 'npc', text: '격식 있는 승부지! 내 패는 모두 펼쳐 보이겠네. 귀족은 속임수를 쓰지 않으니까.' },
    { speaker: 'npc', text: '다만 규칙이 하나. 나를 꺾어야 자네 몫이야. 비기면. . . 판돈 절반은 내 것이라네.' },
    { speaker: 'npc', text: '자, 불빛을 걸게. 나를 읽어낼 수 있다면. . . 내 보물은 자네 것이야.' },
  ],
  minigame: {
    kind: 'count-rps',
    deck: { rock: 3, paper: 3, scissors: 3 },
    baseStake: 60,
    tieLossFraction: 0.5,
    relicWinMultiple: 6,
  },
  outro: [
    { speaker: 'npc', text: '. . .훌륭해. 오늘의 승부는 여기까지로 하지.' },
    { speaker: 'npc', text: '다음엔 더 큰 걸 걸어 보게나. 후후.' },
  ],
}

/** 전체 이벤트 테이블. 새 이벤트는 여기에 추가한다. */
export const EVENT_DEFINITIONS: Record<EventId, EventDefinition> = {
  event_001: EVENT_001,
  event_002: EVENT_002,
  event_003: EVENT_003,
}

/** 등록된 이벤트 id 목록(랜덤 선택/순회용). */
export const EVENT_IDS = Object.keys(EVENT_DEFINITIONS) as EventId[]

export function getEventDef(id: EventId): EventDefinition {
  return EVENT_DEFINITIONS[id]
}

/** 문을 열 때 진행할 이벤트를 고른다. 현재는 균등 랜덤이며,
 *  이벤트가 늘어나면 여기서 가중치/등장 조건을 적용한다. */
export function pickEventForDoor(): EventDefinition {
  const id = EVENT_IDS[Math.floor(Math.random() * EVENT_IDS.length)]
  return EVENT_DEFINITIONS[id]
}
