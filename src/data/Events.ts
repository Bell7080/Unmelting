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
  /** 방패 소비(0 아래로 내려가지 않음). */
  spendShield(amount: number): void
  /** 손패 제거(오래된 것부터). */
  sellHand(count: number): void
  /** 랜덤 손패 지급. */
  buyHand(count: number): void
  /** 등급 가중치로 유물 1개 지급(백작 완승 보상 등). */
  grantRelic(): void
}

// ── event_002: 겁쟁이 미니언의 아슬아슬 흥정(위험 관리) ──────────────────────
/** 위험 흥정 결과: 각 자원 증감. 음수는 디메리트(체력/불빛 손실 등). */
export interface RiskOutcome {
  light?: number
  health?: number
  candle?: number
  shield?: number
  /** 랜덤 손패 지급(양수) / 제거(음수). */
  hand?: number
}

/**
 * 위험 흥정 제안 1종. 클릭하면 현재 성공 확률로 판정해 onSuccess/onFail 중 하나를 적용한다.
 *  - aim 'success': 성공이 목표(성공=보상, 실패=디메리트). 성공 확률이 높을 때 굴린다.
 *  - aim 'fail'   : 실패가 목표(역발상 — 실패=대박, 성공=푼돈). 성공 확률이 낮을 때 굴린다.
 * 노린 결과(aim 쪽)의 불빛 보상은 불안(anxiety)에 비례한 리스크 프리미엄을 받는다.
 */
export interface RiskOffer {
  id: string
  label: string
  hint: string
  aim: 'success' | 'fail'
  onSuccess: RiskOutcome
  onFail: RiskOutcome
}

export interface MinionExchangeConfig {
  kind: 'minion-exchange'
  /** 총 시도 횟수(로스트아크 돌깎기처럼 정해진 기회). 소진 시 자동 종료. */
  attempts: number
  /** 기본 성공 확률(0~1). */
  baseSuccess: number
  /** 불안 1당 성공 확률 감소량. */
  anxietyStep: number
  /** 실패 시 불안이 내려가는 양(→ 성공 확률 회복). */
  failRecovery: number
  /** 성공 확률 하한/상한(0~1). */
  minSuccess: number
  maxSuccess: number
  /** 불안 표시 pip 수(시각). */
  anxietyPips: number
  /** 노린 결과의 불빛 보상이 불안에 비례해 커지는 리스크 프리미엄 계수(0이면 고정). */
  riskPremium: number
  offers: RiskOffer[]
}

// ── event_003: 가위바위보 백작(덱 카운팅 + 베팅) ────────────────────────────
export type RpsHand = 'rock' | 'paper' | 'scissors'

/** 벅샷 룰렛식 아이템 — 다양한 자원을 지불해 판을 유리하게 조작한다. 효과는 렌더러가 id로 분기. */
export type RpsItemId = 'block' | 'double' | 'ward'
export interface RpsItemDef {
  id: RpsItemId
  label: string
  /** 버튼 아래/툴팁 설명. */
  desc: string
  /** 지불 자원과 양. */
  costRes: EventResourceKind
  costAmount: number
}

export interface CountRpsConfig {
  kind: 'count-rps'
  /**
   * 앞면으로 공개되는 백작의 유한 덱 조성. 조성(개수)은 공개되지만 **순서는 섞여 숨겨진다**
   * (벅샷 룰렛의 탄창처럼). 카운팅으로 확률을 읽고, 아이템으로 순서를 들춘다.
   */
  deck: Record<RpsHand, number>
  /** 기본 판돈(층 보정은 런타임에서 곱한다). */
  baseStake: number
  /**
   * 비김 시 백작이 가져가는 판돈 비율(하우스 레이크). 0.5 = 절반 손실.
   * 이 페널티가 있어야 어떤 손도 '무손해'가 아니며, 카운팅/아이템으로 +EV를 만들어야 이득이다.
   */
  tieLossFraction: number
  /** 완승(덱 소진) 시 유물 지급 기준 순이익(baseStake 배수). */
  relicWinMultiple: number
  /** 구매 가능한 아이템 목록. */
  items: RpsItemDef[]
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
 * event_002 — "겁쟁이 미니언의 아슬아슬 흥정".
 * 로스트아크 돌깎기식 위험 관리. 조를(성공할)수록 미니언이 불안해져 성공 확률이 내려가고,
 * 실패하면 다시 진정해 확률이 회복된다. 탐욕형(성공=보상/실패=디메리트)과 협박(실패=대박)을
 * 현재 성공 확률에 맞춰 갈아타는 리듬이 실력이다. 정해진 기회(attempts) 안에서 진행한다.
 */
const EVENT_002: EventDefinition = {
  id: 'event_002',
  illu: 'event_002',
  title: '겁쟁이 미니언',
  dialogue: [
    { speaker: 'npc', text: '히익—! 가, 가까이 오지 마!' },
    { speaker: 'npc', text: '이건 내 거야. . . 전부 내가 모은 거란 말이야. . .' },
    { speaker: 'player', text: '그 금, 조금만 나눠 볼까.' },
    { speaker: 'npc', text: '조, 조를수록. . . 난 더 무서워져. 손이 떨려서 자꾸 헛일을 한다고. . .' },
    { speaker: 'npc', text: '그치만 너무 몰아세우면. . . 겁에 질려 다 흘려 버릴지도 몰라. . .' },
  ],
  minigame: {
    kind: 'minion-exchange',
    attempts: 7,
    baseSuccess: 0.9,
    anxietyStep: 0.13,
    failRecovery: 2,
    minSuccess: 0.2,
    maxSuccess: 0.92,
    anxietyPips: 6,
    riskPremium: 0.14,
    // 탐욕형(aim success): 성공=보상, 실패=디메리트 — 성공 확률 높을 때.
    // 협박(aim fail): 성공=푼돈, 실패=대박 — 성공 확률 낮을 때 굴려 실패보상을 노린다.
    offers: [
      { id: 'vault', label: '금고 뜯기', hint: '성공하면 큰 불빛, 실패하면 손을 물린다', aim: 'success',
        onSuccess: { light: 70 }, onFail: { health: -5 } },
      { id: 'shield', label: '방패 조르기', hint: '성공하면 방패, 실패하면 흘린 불빛', aim: 'success',
        onSuccess: { shield: 8 }, onFail: { light: -30 } },
      { id: 'wax', label: '촛농 훔치기', hint: '성공하면 콤보 게이지, 실패하면 소량 피해', aim: 'success',
        onSuccess: { candle: 4 }, onFail: { health: -3 } },
      { id: 'threat', label: '협박', hint: '기겁시켜야 하울을 흘린다 — 버티면 되레 물린다', aim: 'fail',
        onSuccess: { health: -6 }, onFail: { light: 130, hand: 1 } },
    ],
  },
  outro: [
    { speaker: 'npc', text: '이, 이제 됐지? 됐지?!' },
    { speaker: 'npc', text: '가, 가 줘. . . 제발. . .' },
  ],
}

/**
 * event_003 — "가위바위보 백작".
 * 밀랍 귀족과의 벅샷 룰렛식 가위바위보. 백작의 덱은 조성(개수)만 공개되고 순서는 섞여 있어(탄창처럼)
 * 카운팅으로 확률을 읽는다. 다양한 자원(불빛/게이지/체력/방패/손패)으로 아이템을 사서 다음 패를
 * 엿보거나 버리고, 판돈을 2배로 걸거나 손실을 막으며 판을 유리하게 끌어간다. 비김은 레이크가 있어
 * 어떤 손도 무손해가 아니다.
 */
const EVENT_003: EventDefinition = {
  id: 'event_003',
  illu: 'event_003',
  title: '가위바위보 백작',
  dialogue: [
    { speaker: 'npc', text: '오호, 이런 곳에서 온기가 도는 손을 보다니.' },
    { speaker: 'npc', text: '나는 이 홀의 주인. 심심풀이 승부를 즐기는 백작이라네.' },
    { speaker: 'player', text: '. . .가위바위보?' },
    { speaker: 'npc', text: '격식 있는 승부지! 내 패의 수는 모두 펼쳐 보이겠네 — 허나 순서는 섞어 두었지.' },
    { speaker: 'npc', text: '나를 꺾어야 자네 몫이야. 비기면. . . 판돈 절반은 내 것이라네.' },
    { speaker: 'npc', text: '도구를 원한다면 값을 치르게. 불빛이든, 피든, 무엇이든. 자, 승부를 시작하지.' },
  ],
  minigame: {
    kind: 'count-rps',
    deck: { rock: 3, paper: 3, scissors: 3 },
    baseStake: 60,
    tieLossFraction: 0.5,
    relicWinMultiple: 6,
    // 벅샷 룰렛식 도구 — 저마다 다른 자원으로 사고, 백작의 선택지/판돈/손실을 조작한다.
    // 이름·설명은 처음 하는 플레이어도 효과를 바로 알 수 있게 쉬운 말로.
    // 불빛 비용은 판돈과 같은 층 인플레이션(1 + 층×0.02)을 받는다.
    items: [
      { id: 'block', label: '차단', desc: '이번 판, 백작이 낼 수 있는 패 한 종류를 막는다(막힌 패에 ×표시)', costRes: 'light', costAmount: 90 },
      { id: 'double', label: '두배', desc: '이번 판, 따는 불빛도 잃는 불빛도 두 배', costRes: 'health', costAmount: 4 },
      { id: 'ward', label: '부적', desc: '이번 판은 지거나 비겨도 불빛을 안 잃는다', costRes: 'hand', costAmount: 1 },
    ],
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
