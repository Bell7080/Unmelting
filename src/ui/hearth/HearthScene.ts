import { HEARTH_STYLES } from './HearthStyles'
import { SpriteUrls, spriteForHearthStation, spriteForDinner, spriteForDinnerPack } from '../Sprites'
import { isTouchDevice } from '../MobileTouchManager'
import { SquareBurst } from '../SquareBurst'
import { SpeechBubble } from '../SpeechBubble'
import type { CustomRelicProfile } from '@data/Relics'
import { META_UNLOCKS, isMetaUnlocked, toggleMetaUnlock } from '@core/MetaUnlocks'

export interface HearthHandlers {
  /** 출발 버튼 클릭 — 직업 선택/런 시작으로 연결한다. */
  onStart: () => void | Promise<void>
  /** 만찬 완성 카드가 실제 런 유물 인벤토리에 꽂히도록 호스트 게임 상태에 지급한다. */
  onDinnerRelicCreate?: (profile: CustomRelicProfile) => void | Promise<void>
  /** 현재 런 턴을 반환 — 재방문 메시지에서 N턴 표기에 사용한다. */
  getCurrentTurn?: () => number
  /** 쉬움(정규 100층) 난이도 개방 여부 — 새싹 병아리 첫 졸업으로 열린다. */
  isEasyUnlocked?: () => boolean
}

/**
 * 9칸 스테이션 이름(0~8, row-major). 배치/역할/해금은 기획서
 * `Unmelting_Game_Concept.md` §12 참조 — 잿빛 굴레가 중앙(index 4).
 */
const STATION_NAMES = [
  '암시장', '타로', '도박장',
  '길드', '잿빛 굴레', '서고',
  '무역', '모험', '만찬',
] as const
/** 하단 좌측 = 무역, 하단 중앙 = 모험. 둘 다 셔터형 상세 화면을 가진다. */
const TRADE_INDEX = 6
const ADVENTURE_INDEX = 7
const DINNER_INDEX = 8

/** 마지막으로 본 모험 동행을 다음 거점 진입에도 복원하기 위한 로컬 저장 키. */
const HEARTH_LAST_CHARACTER_KEY = 'unmelting.hearth.lastCharacterIndex'
/** 개발용 전체 개방 플래그 저장 키 — /개방 명령이 '1'로 세팅하면 모든 칸을 연다. */
export const HEARTH_DEV_UNLOCK_KEY = 'unmelting.hearth.devUnlockAll'
const DINNER_DONE_LINE = '하하, 식사는 만족스러우셨나요? 다음 만찬도 기대해주세요.'

type DinnerStatKey = 'maxHealth' | 'emberMax' | 'handMax' | 'scorePct' | 'damage' | 'shopDiscount' | 'startScore'
type DinnerRarity = 'common' | 'rare' | 'epic'

interface DinnerChoice {
  title: string
  stat: string
  color: string
  kind: 'food' | 'sauce' | 'topping'
  rarity: DinnerRarity
  sprite?: string
  /** 유물 이름 조합용. "소금 소스" → namePart "소금"으로 '소금 치즈 감자' 완성. */
  namePart?: string
  stats: Partial<Record<DinnerStatKey, number>>
}

/** 식재료 정의. values는 등급별 명시 수치(없는 등급은 해당 등급으로 출현 불가). */
interface DinnerBaseItem {
  title: string
  color: string
  kind: 'food' | 'sauce' | 'topping'
  sprite?: string
  namePart?: string
  stat: DinnerStatKey
  values: Partial<Record<DinnerRarity, number>>
  /** 베이스 가중치(10)에 더해지는 풀 선출 추가 가중치. */
  weightBonus: number
}

const DINNER_STAT_LABELS: Record<DinnerStatKey, string> = {
  maxHealth: '최대체력',
  emberMax: '불씨 한도',
  handMax: '손패 한도',
  scorePct: '불빛 획득량',
  damage: '공격력',
  shopDiscount: '상점 할인',
  startScore: '시작 불빛',
}
/** % 접미사를 붙이는 스탯 키 */
const DINNER_STAT_PCT = new Set<DinnerStatKey>(['scorePct', 'shopDiscount'])

/** 풀 선출 가중치: 커먼 10 / 레어 5 / 에픽 1 */
const DINNER_RARITY_WEIGHTS: Record<DinnerRarity, number> = { common: 10, rare: 5, epic: 1 }
const DINNER_RARITY_LABEL: Record<DinnerRarity, string> = { common: '커먼', rare: '레어', epic: '에픽' }

// ── 만찬 식재료 풀 (메인 / 소스 / 재료 각 6종) ──────────────────────────
// 001 체계는 각 카테고리에서 가장 많이 뜨도록 weightBonus +5.
// 005·006은 레어/에픽만 등장한다(values에 common 없음).
const DINNER_MAINS: DinnerBaseItem[] = [
  { title: '감자',   color: '#8b6a35', kind: 'food', sprite: spriteForDinner('main','001'), stat: 'maxHealth',    values: { common:1, rare:2, epic:3 }, weightBonus:5 },
  { title: '호밀빵', color: '#6b4c2a', kind: 'food', sprite: spriteForDinner('main','002'), stat: 'scorePct',     values: { common:2, rare:4, epic:6 }, weightBonus:0 },
  { title: '비스킷', color: '#c4a46a', kind: 'food', sprite: spriteForDinner('main','003'), stat: 'shopDiscount', values: { common:1, rare:2, epic:3 }, weightBonus:0 },
  { title: '콩고기', color: '#5c4a3a', kind: 'food', sprite: spriteForDinner('main','004'), stat: 'startScore',   values: { common:100, rare:200, epic:300 }, weightBonus:0 },
  { title: '옥수수', color: '#d4a832', kind: 'food', sprite: spriteForDinner('main','005'), stat: 'handMax',      values: { rare:1, epic:2 }, weightBonus:0 },
  { title: '귀리죽', color: '#9e8a6a', kind: 'food', sprite: spriteForDinner('main','006'), stat: 'emberMax',     values: { rare:1, epic:2 }, weightBonus:0 },
]
const DINNER_SAUCES: DinnerBaseItem[] = [
  { title: '소금 소스',   color: '#c0b8a0', kind: 'sauce', namePart: '소금',   sprite: spriteForDinner('sauce','001'), stat: 'maxHealth',    values: { common:1, rare:2, epic:3 }, weightBonus:5 },
  { title: '거친 소스',   color: '#6b5840', kind: 'sauce', namePart: '거친',   sprite: spriteForDinner('sauce','002'), stat: 'scorePct',     values: { common:2, rare:4, epic:6 }, weightBonus:0 },
  { title: '짭짤한 소스', color: '#9a7850', kind: 'sauce', namePart: '짭짤한', sprite: spriteForDinner('sauce','003'), stat: 'shopDiscount', values: { common:1, rare:2, epic:3 }, weightBonus:0 },
  { title: '기름진 소스', color: '#b89040', kind: 'sauce', namePart: '기름진', sprite: spriteForDinner('sauce','004'), stat: 'startScore',   values: { common:100, rare:200, epic:300 }, weightBonus:0 },
  { title: '후추 소스',   color: '#3a3030', kind: 'sauce', namePart: '후추',   sprite: spriteForDinner('sauce','005'), stat: 'handMax',      values: { rare:1, epic:2 }, weightBonus:0 },
  { title: '묽은 소스',   color: '#7090a0', kind: 'sauce', namePart: '묽은',   sprite: spriteForDinner('sauce','006'), stat: 'emberMax',     values: { rare:1, epic:2 }, weightBonus:0 },
]
const DINNER_TOPPINGS: DinnerBaseItem[] = [
  { title: '치즈',     color: '#e0c050', kind: 'topping', sprite: spriteForDinner('topping','001'), stat: 'maxHealth',    values: { common:1, rare:2, epic:3 }, weightBonus:5 },
  { title: '건포도',   color: '#6a3840', kind: 'topping', sprite: spriteForDinner('topping','002'), stat: 'scorePct',     values: { common:2, rare:4, epic:6 }, weightBonus:0 },
  { title: '콩',      color: '#6a8040', kind: 'topping', sprite: spriteForDinner('topping','003'), stat: 'shopDiscount', values: { common:1, rare:2, epic:3 }, weightBonus:0 },
  { title: '양파',    color: '#d4c8a0', kind: 'topping', sprite: spriteForDinner('topping','004'), stat: 'startScore',   values: { common:100, rare:200, epic:300 }, weightBonus:0 },
  { title: '허브',    color: '#5a7050', kind: 'topping', sprite: spriteForDinner('topping','005'), stat: 'handMax',      values: { rare:1, epic:2 }, weightBonus:0 },
  { title: '마른 버섯', color: '#8a7060', kind: 'topping', sprite: spriteForDinner('topping','006'), stat: 'emberMax',     values: { rare:1, epic:2 }, weightBonus:0 },
]

/** 모험 셔터 안에서 고를 수 있는 동행 목록. 3~4번은 잠금 회색 빈 슬롯. */
const HEARTH_CHARACTERS = [
  // 병아리 튜토리얼 캐릭터 폐기: 에나(=녹지 않는 소녀)가 첫 시작 slot 0. 온보딩은 first-experience 게이트가 처리한다.
  { id: 'ena', name: '에나', role: '첫 번째 동반자', tagline: '몰락한 귀족', desc: '녹지 않는 소녀가 무대 위에 올랐다.', art: SpriteUrls.player, lockedArt: false, locked: false },
  { id: 'slot-3', name: '???', role: '추후 해금', tagline: '', desc: '', art: '', lockedArt: true, locked: true },
  { id: 'slot-4', name: '???', role: '추후 해금', tagline: '', desc: '', art: '', lockedArt: true, locked: true },
] as const

/** 시작 난이도. 새싹=온보딩(30층), 쉬움=정규 100층, 보통=개발 중. 출발 시 런에 전달된다. */
export type HearthDifficulty = 'sprout' | 'easy' | 'normal'
interface DifficultyDef {
  key: HearthDifficulty
  name: string
  tagline: string
  desc: string
  /** 카드 배경 일러스트 URL. 아직 없는 난이도는 빈 문자열 → CSS 플레이스홀더로 폴백한다. */
  art: string
  /** 정적 잠금(보통=개발 중). 쉬움은 졸업 여부로 런타임 판정하므로 여기선 false. */
  devLocked?: boolean
}
/** 캐릭터 확정 후 출발 버튼 위에서 넘겨 고르는 난이도 목록(캐러셀 순서 = 배열 순서). */
const HEARTH_DIFFICULTIES: readonly DifficultyDef[] = [
  { key: 'sprout', name: '새싹 병아리', tagline: '온보딩 · 30층', desc: '짧은 첫 모험. 바위·덤불·잡동사니로 적·함정·보물의 기본기를 익힌다.', art: SpriteUrls.difficultySprout },
  { key: 'easy', name: '쉬움', tagline: '정규 · 100층', desc: '진짜 등반이 시작된다. 새싹 병아리를 클리어하면 열린다.', art: '' },
  { key: 'normal', name: '보통', tagline: '개발 중', desc: '더 매서운 굴레가 기다린다. 아직 준비되지 않았다.', art: '', devLocked: true },
] as const

/** 마지막으로 고른 시작 난이도 복원 키. */
const HEARTH_LAST_DIFFICULTY_KEY = 'unmelting.hearth.lastDifficulty'

/** 우측 인스펙터에 띄울 각 스테이션의 한 줄 설명(§12-3 역할 요약). */
const STATION_DESC: Record<string, string> = {
  암시장: '턴이 갱신될 때마다 바뀌는 정해진 품목을 메타 화폐로 사들인다.',
  타로: '운명을 점친다. 어두운 거점에 드는 한 줄기 다른 빛.',
  도박장: '메타 코인을 걸어 유희를, 혹은 한탕을 노린다.',
  길드: '업적을 관리하고, 업적으로 새 동행 등을 해금한다.',
  '잿빛 굴레': '엔드리스 모드. 200층 진엔딩을 클리어하면 열린다.',
  서고: '전적과 기록을 보관하고, 그 기록을 바탕으로 영구 효과를 얻는다.',
  무역: '손패·유물 잠금·다음 판 계승 등을 메타 화폐로 영구 해금한다.',
  모험: '어둠으로 떠난다. 동행과 난이도를 정한 뒤 출발한다.',
  만찬: '모험 직전의 일회성 버프. 방문마다 무료 만찬이 한 번 차려진다.',
}

/**
 * 거점(촛대) 화면. `/시작`에서 진입하며 인게임 빈 레일을 배경으로 재사용한다.
 * 거대한 오로라 커튼이 열리며 폐저택풍 배경이 드러나고, 하단 중앙 '모험' 칸이
 * 화륵 점등된다. 모험을 누르면 로비 위로 검은 모험 셔터가 내려오고, 모험 자리의
 * '출발' 버튼을 누르면 호스트의 onStart(직업 선택/런 시작)가 돈다.
 * 나머지 8칸은 이름을 달고 어둡게 잠긴 상태로 1차 노출한다(해금은 추후 단계).
 *
 * 우측 인스펙터: 평소 비어 있고, `[data-inspect-title]` 요소(스테이션 칸·퀘스트 딱지)에
 * 마우스를 올리면 스르륵 떠올라 일러스트+제목/태그/설명을 보여 주고, 떼면 사라진다.
 */
export class HearthScene {
  private overlay: HTMLElement | null = null
  private inspector: HTMLElement | null = null
  private resizeListener: (() => void) | null = null
  private handlers: HearthHandlers | null = null
  /** 모험 칸 1회만 셔터를 내린다. */
  private shuttered = false
  /** 출발 1회만 런으로 넘어간다. */
  private departing = false
  /** 대문이 열리기 전(고정 인트로 연출) 동안엔 hover 인스펙터를 막는다. */
  private interactive = false
  /** 터치 기기: hover 대신 탭으로 인스펙터를 토글한다. */
  private touchMode = false
  /** 현재 인스펙터를 띄운 소스 요소(터치 탭 토글 판정용). */
  private inspectSource: HTMLElement | null = null
  /** 셔터 내부 캐릭터 선택 인덱스. 선택 전에는 카드 스트립과 큰 배경을 동기화한다. */
  private selectedCharacterIndex = 0
  /** 캐릭터 확정 후 출발 버튼을 다시 띄워 중복 선택 애니메이션을 막는다. */
  private characterConfirmed = false
  /** 캐릭터 확정 뒤 출발 버튼 위에서 넘겨 고르는 시작 난이도 인덱스. */
  private selectedDifficultyIndex = 0
  /** /개방 개발 명령으로 모든 칸을 강제 개방하는 플래그(로컬 저장 복원). */
  private devUnlockAll = false
  /** 커버플로우 드래그 시작 X 좌표. 좌우 한 바퀴 순환 입력을 판정한다. */
  private dragStartX: number | null = null
  /** 드래그 대상 구분: 캐릭터 스트립 vs 난이도 스트립(같은 pointer 핸들러 공유). */
  private dragKind: 'character' | 'difficulty' | null = null
  /** 현재 무역 화면에서 선택된 임시 탭. */
  private selectedTradeTab = 0
  /** 만찬 선택 흐름 단계: 0=팩 레일, 1=메인 음식, 2~3=추가 스탯, 4=완성 연출. */
  private dinnerStep = 0
  /** 무료 만찬에서 고른 음식/스탯을 임시로 보관해 완성 유물 프로필을 만든다. */
  private dinnerChoices: DinnerChoice[] = []
  /** 만찬 완료 후에는 런이 시작될 때까지 닫힌 일러스트/대사 화면으로 재입장한다. */
  private dinnerConsumed = false
  /** renderDinnerChoices()가 뽑아 표시한 선택지 배열 — pickDinnerChoice()가 캐시를 재사용한다. */
  private dinnerCurrentOptions: DinnerChoice[] = []
  /** 현재 표시 중인 만찬 NPC 말풍선. raiseShutter/exit 시 파괴한다. */
  private dinnerBubble: SpeechBubble | null = null

  enter(handlers: HearthHandlers): void {
    this.injectStyles()
    this.handlers = handlers
    this.shuttered = false
    this.departing = false
    this.interactive = false
    // /개방 개발 명령으로 세팅된 전체 개방 플래그를 복원한다(칸 게이팅에 반영).
    this.devUnlockAll = window.localStorage.getItem(HEARTH_DEV_UNLOCK_KEY) === '1'
    // 난이도 선택 초기화(잠긴 난이도면 개방된 최고 난이도로 폴백) — 셔터 HTML 빌드 전에 확정한다.
    this.initDifficultySelection()
    this.dinnerConsumed = this.hasDinnerRelicInInventory()

    const overlay = document.createElement('div')
    overlay.id = 'hearth-overlay'
    overlay.setAttribute('role', 'dialog')
    overlay.setAttribute('aria-label', '거점')
    overlay.innerHTML = `
      <div class="hearth-shell">
        <div class="hearth-bg" aria-hidden="true"></div>
        <div class="hearth-grid">${this.renderCells()}</div>
        <div class="job-rail-curtain job-rail-curtain--left hearth-curtain" aria-hidden="true"></div>
        <div class="job-rail-curtain job-rail-curtain--right hearth-curtain" aria-hidden="true"></div>
        <div class="hearth-shutter" aria-hidden="true">
          <button class="hearth-back" type="button" data-hearth-back aria-label="뒤로가기">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5 L8 12 L15 19"/></svg>
          </button>
          <div class="hearth-trade-stage" aria-label="무역 임시 화면">
            <aside class="hearth-trade-tabs" role="tablist" aria-label="무역 분류">${this.renderTradeTabs()}</aside>
            <section class="hearth-trade-pack-area" aria-live="polite">
              <button class="hearth-trade-nav hearth-trade-nav--left" type="button" data-hearth-trade-nav="left" aria-label="이전">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5 L8 12 L15 19"/></svg>
              </button>
              <div class="hearth-trade-pack-viewport">
                <div class="hearth-trade-pack-grid">${this.renderTradePacks(0)}</div>
              </div>
              <button class="hearth-trade-nav hearth-trade-nav--right" type="button" data-hearth-trade-nav="right" aria-label="다음">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5 L16 12 L9 19"/></svg>
              </button>
            </section>
          </div>
          <div class="hearth-dinner-stage" aria-label="만찬 임시 화면">
            <div class="hearth-dinner-curtain hearth-dinner-curtain--left" aria-hidden="true"></div>
            <div class="hearth-dinner-curtain hearth-dinner-curtain--right" aria-hidden="true"></div>
            <div class="hearth-dinner-bg" aria-hidden="true"></div>
            <div class="hearth-dinner-final-curtain hearth-dinner-final-curtain--left" aria-hidden="true"></div>
            <div class="hearth-dinner-final-curtain hearth-dinner-final-curtain--right" aria-hidden="true"></div>
            <div class="hearth-dinner-illustration" aria-hidden="true"></div>
            <div class="hearth-dinner-dialogue" aria-live="polite"></div>
            <div class="hearth-dinner-npc-anchor" aria-hidden="true"></div>
            <div class="hearth-dinner-rail">${this.renderDinnerPacks()}</div>
            <div class="hearth-dinner-resolve-overlay" aria-hidden="true"></div>
            <div class="hearth-dinner-picks" aria-hidden="true"></div>
            <div class="hearth-dinner-picked" aria-live="polite"></div>
            <div class="hearth-dinner-choices" aria-live="polite"></div>
            <div class="hearth-dinner-after-caption" aria-live="polite"></div>
          </div>
          <div class="hearth-character-stage" aria-live="polite">
            <div class="hearth-adventure-backdrop" aria-hidden="true"></div>
            <div class="hearth-showcase-card" aria-hidden="true">
              <div class="hearth-showcase-art" style="--character-art: url('${HEARTH_CHARACTERS[0].art}')"></div>
              <div class="hearth-showcase-overlay"></div>
            </div>
            <div class="hearth-character-copy">
              <span class="hearth-character-kicker">${HEARTH_CHARACTERS[0].role}</span>
              <strong>${HEARTH_CHARACTERS[0].name}</strong>
              ${HEARTH_CHARACTERS[0].tagline ? `<em class="hearth-character-copy-tagline">${HEARTH_CHARACTERS[0].tagline}</em>` : ''}
              <small>${HEARTH_CHARACTERS[0].desc}</small>
            </div>
          </div>
          <div class="hearth-difficulty" aria-label="난이도 선택" aria-hidden="true">
            <span class="hearth-diff-kicker">난이도</span>
            <div class="hearth-diff-carousel">
              <button class="hearth-diff-nav hearth-diff-nav--left" type="button" data-hearth-diff-nav="left" aria-label="이전 난이도" tabindex="-1"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5 L8 12 L15 19"/></svg></button>
              <div class="hearth-diff-strip" role="listbox" aria-label="시작 난이도">${this.renderDifficultyCards()}</div>
              <button class="hearth-diff-nav hearth-diff-nav--right" type="button" data-hearth-diff-nav="right" aria-label="다음 난이도" tabindex="-1"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5 L16 12 L9 19"/></svg></button>
            </div>
            <div class="hearth-diff-caption">
              <strong class="hearth-diff-caption-name"></strong>
              <small class="hearth-diff-caption-desc"></small>
            </div>
            <!-- 출발 버튼: 확정 상태에서는 직전에 캐릭터를 확정한 클릭 지점(--hearth-depart-x/y)에
                 고정된다 — 마우스를 옮기지 않고 그대로 이어 누를 수 있다. -->
            <button class="hearth-depart" type="button" data-hearth-depart>출발</button>
          </div>
          <div class="hearth-character-carousel">
            <button class="hearth-char-nav hearth-char-nav--left" type="button" data-hearth-char-nav="left" aria-label="이전" tabindex="-1"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5 L8 12 L15 19"/></svg></button>
            <div class="hearth-character-strip" role="listbox" aria-label="캐릭터 선택">${this.renderCharacterCards()}</div>
            <button class="hearth-char-nav hearth-char-nav--right" type="button" data-hearth-char-nav="right" aria-label="다음" tabindex="-1"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5 L16 12 L9 19"/></svg></button>
          </div>
        </div>
      </div>
    `
    // 커튼 대문과 모험 셔터 배경을 CSS 변수로 주입해 검은 슬랩 대신 실제 거점 배경을 쓴다.
    overlay.style.setProperty('--hearth-door', `url('${SpriteUrls.hearth.door}')`)
    overlay.style.setProperty('--hearth-adventure-bg', `url('${SpriteUrls.hearth.adventure}')`)
    overlay.style.setProperty('--hearth-trade-bg', `url('${SpriteUrls.hearth.trade}')`)
    overlay.style.setProperty('--hearth-dinner-bg', `url('${SpriteUrls.hearth.dinner}')`)
    overlay.style.setProperty('--hearth-dinner-host', `url('${SpriteUrls.hearth.dinnerHost}')`)
    // after 화면(만찬 완료/재방문) 배경 — hearth_bg_006 전용 일러스트
    overlay.style.setProperty('--hearth-dinner-after-bg', `url('${SpriteUrls.hearth.dinnerAfter}')`)
    document.body.appendChild(overlay)
    this.overlay = overlay

    // 우측 인스펙터(정보창) — 평소 비움, hover 시 떠오른다.
    const inspector = document.createElement('div')
    inspector.id = 'hearth-inspector'
    inspector.setAttribute('aria-hidden', 'true')
    inspector.innerHTML = `
      <div class="hearth-inspector-card">
        <div class="hearth-inspector-scrim" aria-hidden="true">
          <div class="hearth-inspector-art"></div>
          <div class="hearth-inspector-grad"></div>
        </div>
        <div class="hearth-inspector-body">
          <div class="hearth-inspector-title"></div>
          <div class="hearth-inspector-divider" aria-hidden="true"></div>
          <div class="hearth-inspector-tags"></div>
          <div class="hearth-inspector-desc"></div>
        </div>
      </div>
    `
    document.body.appendChild(inspector)
    this.inspector = inspector

    this.alignToRail()
    this.alignInspector()
    const onResize = (): void => { this.alignToRail(); this.alignInspector(); this.layoutDifficultyCards() }
    this.resizeListener = onResize
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', onResize, true)

    // 인스펙터블(칸/딱지) 위임 — document 레벨이라 좌측 패널의 퀘스트 딱지도 잡는다.
    // 터치 기기엔 hover가 없으므로 탭 토글(capture 단계)로 대체한다.
    this.touchMode = isTouchDevice()
    if (this.touchMode) {
      document.addEventListener('click', this.onTap, true)
    } else {
      document.addEventListener('pointerover', this.onPointerOver)
      document.addEventListener('pointerout', this.onPointerOut)
    }

    overlay.addEventListener('pointerdown', (e) => this.beginCharacterDrag(e))
    overlay.addEventListener('pointerup', (e) => this.endCharacterDrag(e))

    overlay.addEventListener('click', (e) => {
      const t = e.target as HTMLElement
      if (t.closest('[data-hearth-back]')) {
        this.raiseShutter()
        return
      }
      const charNav = t.closest<HTMLElement>('[data-hearth-char-nav]')
      if (charNav) {
        const dir = charNav.dataset.hearthCharNav as 'left' | 'right'
        this.selectCharacter(this.selectedCharacterIndex + (dir === 'left' ? -1 : 1), dir)
        return
      }
      const diffNav = t.closest<HTMLElement>('[data-hearth-diff-nav]')
      if (diffNav) {
        const dir = diffNav.dataset.hearthDiffNav as 'left' | 'right'
        this.selectDifficulty(this.selectedDifficultyIndex + (dir === 'left' ? -1 : 1), dir)
        return
      }
      const diffCard = t.closest<HTMLElement>('[data-hearth-diff]')
      if (diffCard) {
        this.selectDifficulty(Number(diffCard.dataset.hearthDiff ?? 0), 'click')
        return
      }
      const tradeNav = t.closest<HTMLElement>('[data-hearth-trade-nav]')
      if (tradeNav) {
        this.scrollTradePacks(tradeNav.dataset.hearthTradeNav as 'left' | 'right')
        return
      }
      const characterCard = t.closest<HTMLElement>('[data-hearth-character]')
      if (characterCard) {
        const idx = Number(characterCard.dataset.hearthCharacter ?? 0)
        if (idx === this.selectedCharacterIndex && !this.characterConfirmed) {
          // 이미 포커싱된 카드를 다시 누르면 확정
          void this.confirmCharacter()
        } else {
          this.selectCharacter(idx, 'click')
        }
        return
      }
      const dinnerPack = t.closest<HTMLElement>('[data-hearth-dinner-pack]')
      if (dinnerPack) {
        void this.openDinnerPack(dinnerPack)
        return
      }
      const dinnerChoice = t.closest<HTMLElement>('[data-hearth-dinner-choice]')
      if (dinnerChoice) {
        void this.pickDinnerChoice(Number(dinnerChoice.dataset.hearthDinnerChoice ?? 0))
        return
      }
      const tradeTab = t.closest<HTMLElement>('[data-hearth-trade-tab]')
      if (tradeTab) {
        this.selectTradeTab(Number(tradeTab.dataset.hearthTradeTab ?? 0))
        return
      }
      const unlockCard = t.closest<HTMLElement>('[data-hearth-unlock]')
      if (unlockCard) {
        this.toggleUnlockCard(unlockCard)
        return
      }
      if (t.closest('[data-hearth-depart]')) {
        void this.depart()
        return
      }
      if (t.closest('[data-hearth-station="trade"]')) this.descendTradeShutter()
      if (t.closest('[data-hearth-station="dinner"]')) this.descendDinnerShutter()
      if (t.closest('[data-hearth-station="adventure"]')) this.descendShutter()
    })

    // /시작: 검은 화면에서 은은하게(천천히) 페이드인(타이틀 직후 게임 진입 연출).
    const fade = document.createElement('div')
    fade.id = 'hearth-fade'
    document.body.appendChild(fade)
    requestAnimationFrame(() => fade.classList.add('is-out'))
    window.setTimeout(() => fade.remove(), 1500)

    // 페이드인이 끝난 뒤에야 커튼 로직 시작: 조금 더 닫혀 있다가 천천히 열린다 → 모험 점등.
    window.setTimeout(() => this.overlay?.classList.add('is-opening'), 1700)
    window.setTimeout(() => {
      this.overlay?.querySelectorAll<HTMLElement>('.hearth-cell--open, .hearth-cell--locked, [data-hearth-station="adventure"]').forEach((cell, idx) => {
        // 임시 전면 개방 상태에서도 모든 칸이 모험처럼 같은 beat로 점등되도록 순차 발화한다.
        window.setTimeout(() => cell.classList.add('is-ignited'), idx * 55)
      })
      // 대문이 다 열리고 모험이 점등된 뒤에야 hover 인스펙터를 허용한다(플레이어블 시작).
      this.interactive = true
      // 만찬 칸(DOM 순서 index 8) 점등(8×55=440ms) + 애니메이션(720ms) + 여운 후 Free 배지 드롭 인.
      // dinnerConsumed이면 DOM에 배지 요소 자체가 없으므로 querySelector가 null을 반환해 안전하다.
      window.setTimeout(() => {
        this.overlay?.querySelector<HTMLElement>('.hearth-cell__dinner-free')?.classList.add('is-active')
      }, 8 * 55 + 720 + 200)
    }, 1700 + 1500)
  }

  /** 인스펙터블에 들어오면 정보창을 채워 띄운다. */
  private onPointerOver = (e: PointerEvent): void => {
    const t = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-inspect-title]')
    if (t) this.showInspector(t)
  }

  /** 인스펙터블을 벗어나면 숨긴다(다른 인스펙터블로 옮겨가는 중이면 유지). */
  private onPointerOut = (e: PointerEvent): void => {
    const from = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-inspect-title]')
    if (!from) return
    const to = (e.relatedTarget as HTMLElement | null)?.closest?.('[data-inspect-title]')
    if (to) return
    this.hideInspector()
  }

  /**
   * 터치 탭 토글(capture 단계).
   *   - 인스펙터블 첫 탭: 정보 표시 + 이 탭의 칸 동작(모험 셔터 등)은 막는다.
   *   - 같은 칸 두 번째 탭: 정보 닫고 칸 동작은 진행시킨다.
   *   - 빈 곳 탭: 정보 닫기.
   */
  private onTap = (e: MouseEvent): void => {
    if (!this.interactive) return
    const el = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-inspect-title]') ?? null
    if (!el) { this.hideInspector(); return }
    if (this.inspectSource === el) { this.hideInspector(); return }
    this.showInspector(el)
    this.inspectSource = el
    // 첫 탭은 정보 표시 전용 — 칸의 click 동작(overlay 핸들러)으로 전파되지 않게 막는다.
    e.stopPropagation()
  }

  private showInspector(source: HTMLElement): void {
    // 인트로(대문 열림) 동안엔 막는다 — 플레이어블 상태에서만 정보창을 띄운다.
    if (!this.interactive) return
    const insp = this.inspector
    if (!insp) return
    const title = source.dataset.inspectTitle ?? ''
    const tag = source.dataset.inspectTag ?? ''
    const desc = source.dataset.inspectDesc ?? ''
    insp.querySelector<HTMLElement>('.hearth-inspector-title')!.textContent = title
    const tagEl = insp.querySelector<HTMLElement>('.hearth-inspector-tags')!
    tagEl.textContent = tag
    tagEl.style.display = tag ? '' : 'none'
    insp.querySelector<HTMLElement>('.hearth-inspector-desc')!.textContent = desc
    // 일러스트: data-inspect-art가 있으면 실제 이미지로, 없으면 CSS 플레이스홀더로 되돌린다.
    const artUrl = source.dataset.inspectArt
    insp.querySelector<HTMLElement>('.hearth-inspector-art')!.style.backgroundImage = artUrl ? `url('${artUrl}')` : ''
    insp.classList.add('is-shown')
  }

  private hideInspector(): void {
    this.inspector?.classList.remove('is-shown')
    this.inspectSource = null
  }

  /** 모험 선택 → 로비 위로 검은 모험 셔터가 내려오고, 모험 자리에 출발 버튼이 드러난다. */
  private descendShutter(): void {
    if (this.shuttered) return
    this.shuttered = true
    this.hideInspector()
    this.selectedCharacterIndex = this.readLastCharacterIndex()
    this.characterConfirmed = false
    this.overlay?.classList.remove('is-trade-mode', 'is-trade-leaving', 'is-dinner-mode', 'is-dinner-opened')
    this.overlay?.classList.add('is-shuttering', 'is-adventure-mode')
    this.selectCharacter(this.selectedCharacterIndex)
    // 셔터 하강이 끝난 뒤 배경→우측 카드/좌측 소개→하단 슬라이드/선택 버튼 순서로 띄운다.
    window.setTimeout(() => this.overlay?.classList.add('is-shutter-rest'), 680)
  }


  /** 무역 선택 → hearth_bg_004 셔터가 내려오고 좌측 탭/우측 임시 카드팩 그리드를 보여 준다. */
  private descendTradeShutter(): void {
    if (this.shuttered) return
    this.shuttered = true
    this.hideInspector()
    this.selectedTradeTab = 0
    this.overlay?.classList.remove('is-adventure-mode', 'is-trade-leaving', 'is-dinner-mode', 'is-dinner-opened')
    this.overlay?.classList.add('is-shuttering', 'is-trade-mode')
    this.selectTradeTab(0)
    // 셔터가 충분히 닫힌 뒤 라벨과 카드팩을 좌측/하단에서 순차 진입시킨다.
    window.setTimeout(() => this.overlay?.classList.add('is-shutter-rest'), 680)
  }

  /** 만찬 선택 → 검붉은 커튼을 친 뒤 hearth_bg_005 만찬 배경과 무료 팩 레일을 보여 준다. */
  private descendDinnerShutter(): void {
    if (this.shuttered) return
    this.shuttered = true
    this.hideInspector()
    this.dinnerStep = this.dinnerConsumed ? 5 : 0
    this.dinnerChoices = []
    this.overlay?.classList.remove('is-adventure-mode', 'is-trade-mode', 'is-trade-leaving')
    this.overlay?.classList.add('is-shuttering', 'is-dinner-mode')
    this.resetDinnerStage()
    if (this.dinnerConsumed) {
      // 재방문 — bg004로 전환 후 현재 턴 기반 메시지 표시
      const currentTurn = this.handlers?.getCurrentTurn?.() ?? 0
      const revisitLine = `음? 이미 한 번 식사를 하시지 않았나요?\n${currentTurn + 50}턴 이후 방문해주세요.`
      void this.showDinnerAfterScene(revisitLine)
    }
    // 커튼이 먼저 닫힌 뒤 배경 레이어가 페이드인하도록 셔터 안정 클래스를 늦게 붙인다.
    window.setTimeout(() => this.overlay?.classList.add('is-shutter-rest'), 680)
  }

  /** 만찬 팩 레일/선택지를 초기 상태로 되돌려 뒤로가기 후 재진입도 같은 흐름을 보장한다. */
  private resetDinnerStage(): void {
    this.dinnerBubble?.destroy()
    this.dinnerBubble = null
    const root = this.overlay
    root?.classList.remove('is-dinner-opened', 'is-dinner-finalizing', 'is-dinner-closing', 'is-dinner-after')
    const rail = root?.querySelector<HTMLElement>('.hearth-dinner-rail')
    const picks = root?.querySelector<HTMLElement>('.hearth-dinner-picks')
    const picked = root?.querySelector<HTMLElement>('.hearth-dinner-picked')
    const choices = root?.querySelector<HTMLElement>('.hearth-dinner-choices')
    const dialogue = root?.querySelector<HTMLElement>('.hearth-dinner-dialogue')
    const afterCaption = root?.querySelector<HTMLElement>('.hearth-dinner-after-caption')
    if (rail) rail.innerHTML = this.renderDinnerPacks()
    if (picks) picks.innerHTML = ''
    if (picked) picked.innerHTML = ''
    if (choices) choices.innerHTML = ''
    if (dialogue) dialogue.textContent = ''
    if (afterCaption) { afterCaption.textContent = ''; afterCaption.classList.remove('is-visible') }
  }

  /** 무료 팩 클릭 → 블라스트 후 코스 카드 역순 퇴장 → 검은 오버레이 → 1단계 선택지 등장. */
  private async openDinnerPack(packEl: HTMLElement): Promise<void> {
    if (this.dinnerConsumed || this.dinnerStep !== 0) return
    // 중복 클릭 방지 — 아직 step=0인 상태에서 step=1로 즉시 잠금
    this.dinnerStep = 1

    // 선택한 팩에서 먹음직스러운 블라스트 발사
    SquareBurst.playOn(packEl, 'score', { count: 32, spread: 150, duration: 520, size: [7, 22] })
    await this.wait(130)

    // 레일의 모든 팩 카드를 등장 역순(우→좌)으로 퇴장시킨다
    const rail = this.overlay?.querySelector<HTMLElement>('.hearth-dinner-rail')
    const packs = rail ? [...rail.querySelectorAll<HTMLElement>('.hearth-dinner-pack')] : []
    ;[...packs].reverse().forEach((pack, i) => {
      pack.animate([
        { transform: 'translateY(0) scale(1)', opacity: 1 },
        { transform: 'translateY(-22px) scale(1.07)', opacity: 0.82, offset: 0.28 },
        { transform: 'translateY(-56px) scale(0.74)', opacity: 0 },
      ], { duration: 360, delay: i * 68, easing: 'cubic-bezier(0.42,0,0.82,0.36)', fill: 'forwards' })
    })
    // 마지막 카드가 퇴장 완료할 때까지 대기
    await this.wait(packs.length * 68 + 320)

    // [1] 빈 배경을 충분히 노출
    await this.wait(500)

    // [2] 오버레이만 서서히 어둡게 (선택지 아직 미표시)
    this.overlay?.classList.add('is-dinner-dimming')

    // [3] 어두운 화면을 충분히 체류한 뒤 선택지 등장
    await this.wait(860)
    this.overlay?.classList.remove('is-dinner-dimming')
    this.overlay?.classList.add('is-dinner-opened')
    this.renderDinnerChoices()
  }

  /** 만찬 카드 선택은 음식 1회 + 추가 스탯 2회, 총 3단계를 순서대로 진행한다. */
  private async pickDinnerChoice(index: number): Promise<void> {
    if (this.dinnerStep < 1 || this.dinnerStep > 3) return
    const choicesEl = this.overlay?.querySelector<HTMLElement>('.hearth-dinner-choices')
    if (!choicesEl) return
    // 입력 잠금 — 중복 선택 방지.
    choicesEl.style.pointerEvents = 'none'
    const choiceEl = choicesEl.querySelector<HTMLElement>(`[data-hearth-dinner-choice="${index}"]`)
    // renderDinnerChoices()가 캐시한 배열을 재사용해 무작위 재추첨을 막는다.
    const picked = this.dinnerCurrentOptions[index] ?? this.dinnerCurrentOptions[0]
    this.dinnerChoices.push(picked)
    if (choiceEl) {
      // getBoundingClientRect를 즉시 읽어 DOM 교체 전에 좌표를 확보한다
      const r = choiceEl.getBoundingClientRect()
      SquareBurst.playAt(r.left + r.width / 2, r.top + r.height / 2, 'treasure-gain', {
        count: 32, spread: 150, duration: 500, size: [7, 22],
      })
    }
    // 선택한 카드를 레일 하단 미니카드로 즉시 추가
    this.addDinnerPick(picked)
    await this.wait(300)
    if (this.dinnerStep === 1) {
      this.dinnerStep = 2
      this.renderDinnerChoices()
      return
    }
    if (this.dinnerStep === 2) {
      this.dinnerStep = 3
      this.renderDinnerChoices()
      return
    }
    this.dinnerStep = 4
    await this.finishDinner()
  }

  /** 선택한 음식/소스/재료 카드를 레일 하단에 미니카드로 추가하고 팝인 연출을 재생한다. */
  private addDinnerPick(choice: DinnerChoice): void {
    const picksEl = this.overlay?.querySelector<HTMLElement>('.hearth-dinner-picks')
    if (!picksEl) return
    const slot = document.createElement('div')
    slot.className = 'hearth-dinner-pick-slot'
    slot.setAttribute('data-rarity', choice.rarity)
    if (choice.sprite) slot.style.setProperty('--dinner-art', `url('${choice.sprite}')`)
    slot.style.setProperty('--food-color', choice.color)
    slot.innerHTML = `<span class="hearth-dinner-pick-slot-label">${choice.title}</span>`
    picksEl.appendChild(slot)
    slot.animate([
      { transform: 'scale(0.3) translateY(18px)', opacity: 0 },
      { transform: 'scale(1.1) translateY(-3px)', opacity: 1, offset: 0.72 },
      { transform: 'scale(1) translateY(0)', opacity: 1 },
    ], { duration: 380, easing: 'cubic-bezier(0.18,0.84,0.28,1)', fill: 'forwards' })
  }

  /** 유물 인벤토리 카드로 빛 구슬을 발사한다. from/to는 viewport 좌표 중심점. */
  private shootOrbToRelic(fromX: number, fromY: number, toX: number, toY: number): void {
    const orb = document.createElement('div')
    orb.className = 'hearth-dinner-orb'
    orb.style.left = `${fromX - 10}px`
    orb.style.top = `${fromY - 10}px`
    orb.style.setProperty('--orb-dx', `${toX - fromX}px`)
    orb.style.setProperty('--orb-dy', `${toY - fromY}px`)
    document.body.appendChild(orb)
    requestAnimationFrame(() => orb.classList.add('is-flying'))
    setTimeout(() => orb.remove(), 750)
  }

  /** 만찬 레일: 이름(상단) → 정사각 일러스트(dinner_NNN) → 가격(하단) 구조의 4종 팩. */
  private renderDinnerPacks(): string {
    const packs = [
      { name: '무료 간식',      price: '무료',  free: true,  sprite: spriteForDinnerPack('001') },
      { name: '가벼운 한끼',    price: '$5',    free: false, sprite: spriteForDinnerPack('002') },
      { name: '만족스러운 식사', price: '$10',  free: false, sprite: spriteForDinnerPack('003') },
      { name: '호화로운 만찬',  price: '$30',   free: false, sprite: spriteForDinnerPack('004') },
    ]
    return packs.map((pack) => {
      const tag = pack.free ? 'button' : 'article'
      const attrs = pack.free
        ? `class="hearth-dinner-pack" type="button" data-hearth-dinner-pack`
        : `class="hearth-dinner-pack is-locked"`
      const artStyle = pack.sprite ? `style="--pack-art:url('${pack.sprite}')"` : ''
      return `<${tag} ${attrs}>
        <span class="hearth-dinner-pack-name">${pack.name}</span>
        <span class="hearth-dinner-pack-art" aria-hidden="true" ${artStyle}></span>
        <span class="hearth-dinner-pack-price">${pack.price}</span>
      </${tag}>`
    }).join('')
  }

  /** 가중치 기반 만찬 등급 추첨. 커먼 10 / 레어 5 / 에픽 1. */
  private rollDinnerRarity(): DinnerRarity {
    const allowed: DinnerRarity[] = ['common', 'rare', 'epic']
    const total = allowed.reduce((s, r) => s + DINNER_RARITY_WEIGHTS[r], 0)
    let r = Math.random() * total
    for (const rarity of allowed) {
      r -= DINNER_RARITY_WEIGHTS[rarity]
      if (r <= 0) return rarity
    }
    return 'common'
  }

  /** 허용 등급 목록 내에서 가중치 추첨한다. 005·006처럼 등급 제한 아이템에 사용. */
  private rollDinnerRarityFrom(allowed: DinnerRarity[]): DinnerRarity {
    const total = allowed.reduce((s, r) => s + DINNER_RARITY_WEIGHTS[r], 0)
    let r = Math.random() * total
    for (const rarity of allowed) {
      r -= DINNER_RARITY_WEIGHTS[rarity]
      if (r <= 0) return rarity
    }
    return allowed[allowed.length - 1]
  }

  /** stats 맵을 "불씨 한도 +1\n시작 불빛 +200" 형태로 변환한다. 공개 카드에서 줄 분리 표기. */
  private buildStatString(stats: Partial<Record<DinnerStatKey, number>>): string {
    return (Object.entries(stats) as [DinnerStatKey, number][])
      .map(([key, val]) => {
        const label = DINNER_STAT_LABELS[key]
        return DINNER_STAT_PCT.has(key) ? `${label} +${val}%` : `${label} +${val}`
      })
      .join('\n')
  }

  /** 가중치 비례로 count장을 비복원 추출한다. */
  private pickDinnerPool(items: DinnerBaseItem[], count: number): DinnerBaseItem[] {
    const pool = [...items]
    const selected: DinnerBaseItem[] = []
    while (selected.length < count && pool.length > 0) {
      const total = pool.reduce((s, item) => s + 10 + item.weightBonus, 0)
      let r = Math.random() * total
      for (let i = 0; i < pool.length; i++) {
        r -= 10 + pool[i].weightBonus
        if (r <= 0) { selected.push(pool.splice(i, 1)[0]); break }
      }
    }
    return selected
  }

  /** 현재 단계에 맞는 만찬 선택지 3장을 가중치 추출 후 등급 추첨해 반환한다. */
  private getDinnerOptions(): DinnerChoice[] {
    const pool = this.dinnerStep === 1 ? DINNER_MAINS
      : this.dinnerStep === 2 ? DINNER_SAUCES
      : DINNER_TOPPINGS
    return this.pickDinnerPool(pool, 3).map(item => {
      const allowedRarities = Object.keys(item.values) as DinnerRarity[]
      const rarity = allowedRarities.length === (Object.keys(DINNER_RARITY_WEIGHTS) as DinnerRarity[]).length
        ? this.rollDinnerRarity()
        : this.rollDinnerRarityFrom(allowedRarities)
      const val = item.values[rarity] ?? 0
      const stats: Partial<Record<DinnerStatKey, number>> = { [item.stat]: val }
      return { title: item.title, color: item.color, kind: item.kind, rarity,
        sprite: item.sprite, namePart: item.namePart, stats, stat: this.buildStatString(stats) }
    })
  }

  /** 선택지를 그린다: 인게임 카드팩 피커와 같은 구조(상단 헤더 + 3장 그리드).
   * 뽑은 배열을 dinnerCurrentOptions에 캐시해 pickDinnerChoice()가 동일 배열을 사용하게 한다. */
  private renderDinnerChoices(): void {
    const choices = this.overlay?.querySelector<HTMLElement>('.hearth-dinner-choices')
    if (!choices) return
    // pickDinnerChoice()가 inline pointer-events:none을 설정하므로 렌더 시 초기화.
    choices.style.pointerEvents = ''
    const stepLabels: Record<number, string> = { 1: '메인', 2: '소스', 3: '재료' }
    const stepLabel = stepLabels[this.dinnerStep] ?? ''
    const options = this.getDinnerOptions()
    this.dinnerCurrentOptions = options
    const cardHtml = options.map((option, index) => `
      <button class="hearth-dinner-choice" type="button"
        data-hearth-dinner-choice="${index}"
        data-rarity="${option.rarity}"
        style="--food-color:${option.color};${option.sprite ? `--dinner-art:url('${option.sprite}')` : ''}">
        <span class="hearth-dinner-choice-art" aria-hidden="true"></span>
        <footer class="hearth-dinner-choice-footer">
          <span class="hearth-dinner-choice-rarity">${DINNER_RARITY_LABEL[option.rarity]}</span>
          <strong>${option.title}</strong>
          <small>${option.stat}</small>
        </footer>
      </button>`).join('')

    // 헤더가 이미 있으면 텍스트만 실시간 교체 — 사라졌다 나오는 flickering 방지
    const existingHeader = choices.querySelector<HTMLElement>('.hearth-dinner-choices-header')
    if (existingHeader) {
      const stepEl = existingHeader.querySelector<HTMLElement>('.hearth-dinner-choices-step')
      if (stepEl) stepEl.textContent = `${stepLabel} ${this.dinnerStep} / 3`
      let row = choices.querySelector<HTMLElement>('.hearth-dinner-choices-row')
      if (!row) {
        row = document.createElement('div')
        row.className = 'hearth-dinner-choices-row'
        choices.appendChild(row)
      }
      // 이전 단계 row 애니메이션이 아직 끝나지 않았을 수 있으므로 취소 후 교체해
      // 두 애니메이션이 합성되어 새 카드가 순간 opacity:1로 노출되는 플래시를 막는다.
      for (const a of row.getAnimations()) a.cancel()
      row.style.opacity = '0'
      row.innerHTML = cardHtml
      row.animate(
        [{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'translateY(0)' }],
        { duration: 300, easing: 'cubic-bezier(0.22,0.86,0.22,1)', delay: 60, fill: 'backwards' },
      )
      // 애니메이션이 끝나면 인라인 opacity를 회수해 CSS 기본값(1)으로 복귀한다.
      window.setTimeout(() => { row.style.opacity = '' }, 60 + 300 + 16)
    } else {
      // 첫 렌더 — 전체 구조 초기화
      choices.innerHTML = `
        <header class="hearth-dinner-choices-header">
          <h2 class="hearth-dinner-choices-pack">무료 간식</h2>
          <p class="hearth-dinner-choices-step">${stepLabel} ${this.dinnerStep} / 3</p>
        </header>
        <div class="hearth-dinner-choices-row">${cardHtml}</div>`
      const row = choices.querySelector<HTMLElement>('.hearth-dinner-choices-row')
      if (row) row.animate(
        [{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'translateY(0)' }],
        { duration: 300, easing: 'cubic-bezier(0.22,0.86,0.22,1)', delay: 60, fill: 'backwards' },
      )
    }
  }

  /** 3장 선택 완료 — 미니카드 상단 부상→합성 블라스트→유물 공개 카드→인벤토리 꽂힘→after 씬 순으로 진행한다. */
  private async finishDinner(): Promise<void> {
    const root = this.overlay
    if (!root) return

    // Phase A: 선택지 패널 페이드아웃
    root.classList.add('is-dinner-finalizing')
    await this.wait(350)

    // Phase B: 유물 프로필 빌드만 — 지급은 카드가 인벤토리에 꽂힐 때(Phase G)까지 미룬다
    const profile = this.buildDinnerRelicProfile()

    // 합성점 = 화면 중앙 상단 35%
    const mergeX = window.innerWidth / 2
    const mergeY = window.innerHeight * 0.35

    // Phase C: 미니카드 3장이 상단으로 상승+확대 후 합성점에 수렴·소멸
    const picksEl = root.querySelector<HTMLElement>('.hearth-dinner-picks')
    const slots = picksEl ? [...picksEl.querySelectorAll<HTMLElement>('.hearth-dinner-pick-slot')] : []
    if (slots.length > 0) {
      // 상단 집결 지점(확대 단계) — 카드별로 좌우 펼쳐 드라마틱한 상승
      const spreadX = [-130, 0, 130]
      const stageY = window.innerHeight * 0.28
      slots.forEach((slot, idx) => {
        const r = slot.getBoundingClientRect()
        const cx = r.left + r.width / 2
        const cy = r.top + r.height / 2
        const stageDX = mergeX + (spreadX[idx] ?? 0) - cx
        const stageDY = stageY - cy
        const finalDX = mergeX - cx
        const finalDY = mergeY - cy
        slot.getAnimations().forEach((a) => a.cancel())
        slot.animate([
          { transform: 'translate(0,0) scale(1)', opacity: 1 },
          { transform: `translate(${stageDX}px,${stageDY}px) scale(2.2)`, opacity: 1, offset: 0.48 },
          { transform: `translate(${finalDX}px,${finalDY}px) scale(0.12)`, opacity: 0 },
        ], { duration: 900, easing: 'cubic-bezier(0.3,0,0.7,1)', fill: 'forwards' })
      })
      await this.wait(860)
    }

    // Phase D: 합성점 블라스트
    const burstHostA = document.createElement('div')
    burstHostA.style.cssText = `position:fixed;left:${mergeX}px;top:${mergeY}px;z-index:280;pointer-events:none;width:0;height:0;`
    document.body.appendChild(burstHostA)
    SquareBurst.playOn(burstHostA, 'score', { count: 44, spread: 190, duration: 720, size: [8, 26] })
    await this.wait(220)
    burstHostA.remove()

    // Phase E: 유물 공개 카드 팝인 — 메인 음식 일러스트 사용
    const foodChoice = this.dinnerChoices.find((c) => c.kind === 'food') ?? this.dinnerChoices[0]
    const revealCard = document.createElement('div')
    revealCard.className = 'hearth-dinner-reveal-relic'
    revealCard.style.left = `${mergeX}px`
    revealCard.style.top = `${mergeY}px`
    if (foodChoice?.sprite) revealCard.style.setProperty('--reveal-art', `url('${foodChoice.sprite}')`)
    // 효과 문자열을 줄 단위로 분리해 각각 <span>으로 표기
    const statLines = profile.effect.split('\n').map((l) => `<span>${l}</span>`).join('')
    revealCard.innerHTML = `
      <div class="hearth-dinner-reveal-art" aria-hidden="true"></div>
      <div class="hearth-dinner-reveal-body">
        <strong class="hearth-dinner-reveal-name">${profile.name}</strong>
        <div class="hearth-dinner-reveal-stats">${statLines}</div>
      </div>`
    document.body.appendChild(revealCard)
    revealCard.animate([
      { transform: 'translate(-50%,-50%) scale(0.18)', opacity: 0 },
      { transform: 'translate(-50%,-50%) scale(1.08)', opacity: 1, offset: 0.68 },
      { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 },
    ], { duration: 500, easing: 'cubic-bezier(0.18,0.84,0.28,1)', fill: 'forwards' })

    // Phase F: 체류 딜레이
    await this.wait(1300)

    // Phase G: 유물 지급 → 인벤토리 DOM 렌더 대기 → 꽂힘 비행
    await this.handlers?.onDinnerRelicCreate?.(profile)
    // 호스트가 DOM을 재렌더하도록 두 프레임 양보 후 카드 위치를 읽는다
    await new Promise<void>((r) => requestAnimationFrame(() => { requestAnimationFrame(() => r()) }))
    const relicCard = document.querySelector<HTMLElement>('.relic-mini-card[data-owned-relic="last-supper"]')
    if (relicCard) {
      const rr = relicCard.getBoundingClientRect()
      const toX = rr.left + rr.width / 2
      const toY = rr.top + rr.height / 2
      const dx = toX - mergeX
      const dy = toY - mergeY
      revealCard.animate([
        { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.18)`, opacity: 0.55 },
      ], { duration: 620, easing: 'cubic-bezier(0.4,0,0.8,0.4)', fill: 'forwards' })
      await this.wait(580)
      // Phase H: 인벤토리 꽂힘 블라스트
      SquareBurst.playOn(relicCard, 'score', { count: 26, spread: 90, duration: 520, size: [5, 14] })
    } else {
      // 인벤토리 카드가 DOM에 없을 때(아직 미노출) — 빛 구슬로 대체
      this.shootOrbToRelic(mergeX, mergeY, window.innerWidth * 0.88, window.innerHeight * 0.5)
      await this.wait(700)
    }
    revealCard.remove()
    await this.wait(380)

    this.dinnerConsumed = this.hasDinnerRelicInInventory()
    await this.showDinnerAfterScene()
  }


  /** 선택한 음식/소스/토핑을 실제 유물 카드의 이름·효과·하단 설명으로 변환한다. */
  private buildDinnerRelicProfile(): CustomRelicProfile {
    const food = this.dinnerChoices.find((choice) => choice.kind === 'food') ?? this.dinnerChoices[0]
    const sauce = this.dinnerChoices.find((choice) => choice.kind === 'sauce')
    const topping = this.dinnerChoices.find((choice) => choice.kind === 'topping')
    const stats: CustomRelicProfile['stats'] = {}
    for (const choice of this.dinnerChoices) {
      for (const [key, value] of Object.entries(choice.stats) as Array<[DinnerStatKey, number]>) {
        stats[key] = (stats[key] ?? 0) + value
      }
    }
    // 고른 순서대로 선택지별로 1줄씩 표기 — 같은 스탯이 중복돼도 합산하지 않고 분리한다
    const effect = this.dinnerChoices
      .map((c) => this.buildStatString(c.stats as Partial<Record<DinnerStatKey, number>>))
      .join('\n')
    const prefix = [sauce?.namePart ?? sauce?.title, topping?.namePart ?? topping?.title].filter(Boolean).join(' ')
    return {
      name: `${prefix ? `${prefix} ` : ''}${food?.title ?? '만찬'}`,
      effect,
      flavor: this.dinnerChoices.map((choice) => choice.title).join(' + '),
      // 인벤토리 유물 카드 일러스트로 메인 음식 스프라이트를 그대로 사용
      art: food?.sprite,
      stats,
    }
  }

  /** hearth_006 배경 전환 후 하단 캡션 바로 NPC 대사를 표시한다. line 미전달 시 DINNER_DONE_LINE 사용. */
  private async showDinnerAfterScene(line?: string): Promise<void> {
    const root = this.overlay
    if (!root) return
    // finalizing/closing 클래스를 제거해 뒤로가기 버튼이 다시 나타나게 한다
    this.dinnerBubble?.destroy()
    this.dinnerBubble = null
    root.classList.remove('is-dinner-finalizing', 'is-dinner-closing', 'is-dinner-opened')
    root.classList.add('is-dinner-after')
    // resolve-overlay 트랜지션이 끝날 때까지 짧게 대기
    await this.wait(600)
    const caption = root.querySelector<HTMLElement>('.hearth-dinner-after-caption')
    if (caption) {
      caption.textContent = line ?? DINNER_DONE_LINE
      caption.classList.add('is-visible')
    }
  }

  /** 만찬 사용 여부는 저장값이 아니라 현재 유물 인벤토리에 꽂힌 만찬 카드로만 판단한다. */
  private hasDinnerRelicInInventory(): boolean {
    return Boolean(document.querySelector('[data-owned-relic="last-supper"]'))
  }


  /** 뒤로가기 → 검은 셔터를 다시 올리고 로비 9칸 상호작용으로 돌아간다. */
  private raiseShutter(): void {
    if (!this.shuttered || this.departing) return
    const root = this.overlay

    // 캐릭터 확정 후 뒤로가기: 선택 화면으로 복귀 (셔터는 그대로 유지)
    if (root?.classList.contains('is-character-confirmed')) {
      this.characterConfirmed = false
      // WAAPI 취소 → showcase가 CSS 제어(is-shutter-rest)로 즉시 복원
      const showcase = root.querySelector<HTMLElement>('.hearth-showcase-card')
      showcase?.getAnimations().forEach((a) => a.cancel())
      // 캐러셀 재진입 딜레이(1.02s)를 건너뛰고 즉시 표시
      const carousel = root.querySelector<HTMLElement>('.hearth-character-carousel')
      if (carousel) carousel.style.transition = 'none'
      root.classList.remove('is-character-confirmed', 'is-character-confirming')
      requestAnimationFrame(() => carousel?.style.removeProperty('transition'))
      this.selectCharacter(this.selectedCharacterIndex)
      return
    }

    this.shuttered = false
    this.characterConfirmed = false
    if (root?.classList.contains('is-dinner-mode')) {
      this.dinnerBubble?.destroy()
      this.dinnerBubble = null
      root.classList.remove('is-shuttering', 'is-shutter-rest', 'is-dinner-mode', 'is-dinner-opened', 'is-dinner-finalizing', 'is-dinner-closing', 'is-dinner-after')
      this.dinnerStep = this.dinnerConsumed ? 5 : 0
      this.dinnerChoices = []
      this.dinnerCurrentOptions = []
      root.querySelector<HTMLElement>('.hearth-dinner-picks')?.replaceChildren()
      return
    }
    if (root?.classList.contains('is-trade-mode')) {
      // 무역 퇴장은 카드팩 상승 → 좌측 패널 슬라이드아웃 → 셔터 상승 순서를 CSS로 읽히게 한다.
      root.classList.add('is-trade-leaving')
      window.setTimeout(() => root.classList.remove('is-shuttering', 'is-shutter-rest', 'is-trade-mode', 'is-trade-leaving'), 420)
      return
    }
    root?.classList.remove('is-shuttering', 'is-shutter-rest', 'is-character-confirmed', 'is-adventure-mode')
  }

  /** 직업 선택 coverflow와 같은 방식으로 모든 카드에 직접 인라인 transform을 적용한다. */
  private layoutCharacterCards(): void {
    const root = this.overlay
    if (!root) return
    const cards = [...root.querySelectorAll<HTMLElement>('[data-hearth-character]')]
    const n = cards.length
    if (n === 0) return
    const cardW = cards[0].offsetWidth || 260
    // 가로 얇은 카드는 너비가 넓으므로 step 비율을 줄여 coverflow 겹침을 유지한다
    const stepPx = cardW * 0.46
    const VISIBLE = 2
    const center = this.selectedCharacterIndex
    cards.forEach((card) => {
      const i = Number(card.dataset.hearthCharacter ?? -1)
      let off = ((i - center) % n + n) % n
      if (off > n / 2) off -= n
      const a = Math.abs(off)
      const visible = a <= VISIBLE + 0.6
      const scale = Math.max(0.56, 1 - a * 0.16)
      const opac = visible ? Math.max(0.12, 1 - a * 0.32) : 0
      const bright = Math.max(0.36, 1 - a * 0.25)
      const sat = Math.max(0.44, 1 - a * 0.15)
      card.classList.toggle('is-selected', i === center)
      card.setAttribute('aria-selected', i === center ? 'true' : 'false')
      card.style.transform =
        `translate(-50%, -50%) translateX(${off * stepPx}px) scale(${scale}) rotateY(${off * -7}deg)`
      card.style.opacity = String(opac)
      card.style.zIndex = String(100 - Math.round(a * 10))
      card.style.filter = `brightness(${bright}) saturate(${sat})`
      card.style.pointerEvents = visible && opac > 0.12 ? 'auto' : 'none'
    })
  }

  /** 선택 인덱스를 갱신하고 coverflow 레이아웃·쇼케이스 카드를 동기화한다. */
  private selectCharacter(index: number, direction: 'left' | 'right' | 'click' = 'click'): void {
    const wrapped = ((index % HEARTH_CHARACTERS.length) + HEARTH_CHARACTERS.length) % HEARTH_CHARACTERS.length
    this.selectedCharacterIndex = wrapped
    this.writeLastCharacterIndex(wrapped)
    const character = HEARTH_CHARACTERS[wrapped]
    const root = this.overlay
    if (!root) return

    this.layoutCharacterCards()

    const art = root.querySelector<HTMLElement>('.hearth-showcase-art')
    if (character.lockedArt) {
      art?.style.removeProperty('--character-art')
      art?.classList.add('is-empty')
    } else {
      art?.style.setProperty('--character-art', `url('${character.art}')`)
      art?.classList.remove('is-empty')
    }
    root.querySelector<HTMLElement>('.hearth-character-kicker')!.textContent = character.role
    root.querySelector<HTMLElement>('.hearth-character-copy strong')!.textContent = character.name
    const taglineEl = root.querySelector<HTMLElement>('.hearth-character-copy-tagline')
    if (taglineEl) taglineEl.textContent = character.tagline
    root.querySelector<HTMLElement>('.hearth-character-copy small')!.textContent = character.desc
    root.querySelector<HTMLElement>('.hearth-character-copy')?.animate([
      { opacity: 0, transform: 'translateX(-18px)' },
      { opacity: 1, transform: 'translateX(0)' },
    ], { duration: 280, easing: 'ease-out' })
    art?.animate([
      { opacity: 0, transform: `translateX(${direction === 'right' ? '-' : ''}34px) scale(0.98)` },
      { opacity: 1, transform: 'translateX(0) scale(1)' },
    ], { duration: 340, easing: 'cubic-bezier(0.2, 0.84, 0.3, 1)' })
  }

  private beginCharacterDrag(e: PointerEvent): void {
    const target = e.target as HTMLElement | null
    if (target?.closest('.hearth-diff-strip')) { this.dragKind = 'difficulty'; this.dragStartX = e.clientX; return }
    if (target?.closest('.hearth-character-strip')) { this.dragKind = 'character'; this.dragStartX = e.clientX; return }
  }

  private endCharacterDrag(e: PointerEvent): void {
    if (this.dragStartX === null) return
    const delta = e.clientX - this.dragStartX
    const kind = this.dragKind
    this.dragStartX = null
    this.dragKind = null
    if (Math.abs(delta) < 34) return
    if (kind === 'difficulty') {
      this.selectDifficulty(this.selectedDifficultyIndex + (delta < 0 ? 1 : -1), delta < 0 ? 'left' : 'right')
    } else {
      this.selectCharacter(this.selectedCharacterIndex + (delta < 0 ? 1 : -1), delta < 0 ? 'left' : 'right')
    }
  }

  private readLastCharacterIndex(): number {
    const value = Number(window.localStorage.getItem(HEARTH_LAST_CHARACTER_KEY) ?? 0)
    return Number.isFinite(value) ? Math.max(0, Math.min(HEARTH_CHARACTERS.length - 1, value)) : 0
  }

  private writeLastCharacterIndex(index: number): void {
    window.localStorage.setItem(HEARTH_LAST_CHARACTER_KEY, String(index))
  }

  /** 마지막으로 선택·확정한 캐릭터 인덱스 (0 = 튜토리얼 병아리). */
  getSelectedCharacterIndex(): number {
    return this.selectedCharacterIndex
  }

  /** 캐릭터 확정 — 캐러셀·카피 역방향 퇴장 후 우측 쇼케이스 카드가 중앙으로 이동·체류·빛이 되어 날아간다. */
  private async confirmCharacter(): Promise<void> {
    if (this.characterConfirmed || this.departing) return
    const character = HEARTH_CHARACTERS[this.selectedCharacterIndex]
    if (character.locked) {
      const card = this.overlay?.querySelector<HTMLElement>('.hearth-character-card.is-selected')
      if (card) {
        card.classList.add('is-denied')
        window.setTimeout(() => card?.classList.remove('is-denied'), 420)
      }
      return
    }
    this.characterConfirmed = true
    const root = this.overlay
    const showcase = root?.querySelector<HTMLElement>('.hearth-showcase-card')
    const shell = root?.querySelector<HTMLElement>('.hearth-shell')
    const target = document.querySelector<HTMLElement>('.player-card')
    if (!root || !showcase || !shell) return

    // 확정 클릭이 일어난 선택 카드의 화면 좌표를 기억해, 다음 레이어의 출발 버튼을
    // 같은 자리에 띄운다 — 마우스를 옮기지 않고 그대로 이어 누를 수 있게 하는 배려.
    const confirmedCard = root.querySelector<HTMLElement>('.hearth-character-card.is-selected')
    const confirmedRect = confirmedCard?.getBoundingClientRect()
    if (confirmedRect) {
      root.style.setProperty('--hearth-depart-x', `${confirmedRect.left + confirmedRect.width / 2}px`)
      root.style.setProperty('--hearth-depart-y', `${confirmedRect.top + confirmedRect.height / 2}px`)
    }

    // 1. 캐러셀·카피 텍스트 역방향 퇴장 (CSS transition이 처리)
    root.classList.add('is-character-confirming')
    await this.wait(300)

    // 2. 쇼케이스 카드를 쉘 중앙으로 부드럽게 이동 (WAAPI — CSS transition은 confirming 상태에서 비활성)
    const shellRect = shell.getBoundingClientRect()
    const srcRect = showcase.getBoundingClientRect()
    const dx = shellRect.left + shellRect.width / 2 - (srcRect.left + srcRect.width / 2)
    const dy = shellRect.top + shellRect.height / 2 - (srcRect.top + srcRect.height / 2)
    showcase.animate(
      [
        { transform: 'translateX(0) translateY(0) scale(1)', easing: 'cubic-bezier(0.2, 0.84, 0.3, 1)' },
        { transform: `translateX(${dx}px) translateY(${dy - 10}px) scale(1.07)` },
      ],
      { duration: 680, fill: 'forwards' }
    )

    // 중앙 체류 딜레이
    await this.wait(980)

    // 3. 빛이 되어 사라짐
    const orbX = shellRect.left + shellRect.width / 2
    const orbY = shellRect.top + shellRect.height / 2 - 10
    showcase.animate(
      [
        { filter: 'brightness(1)', opacity: 1, transform: `translateX(${dx}px) translateY(${dy - 10}px) scale(1.07)` },
        { filter: 'brightness(3.5) saturate(0.4)', opacity: 0.88, transform: `translateX(${dx}px) translateY(${dy - 10}px) scale(1.12)` },
        { filter: 'brightness(8) saturate(0)', opacity: 0, transform: `translateX(${dx}px) translateY(${dy - 10}px) scale(1.26)` },
      ],
      { duration: 400, easing: 'ease-in', fill: 'forwards' }
    )
    await this.wait(120)

    // 4. 빛 구슬이 플레이어 카드로 날아간다
    const dest = target?.getBoundingClientRect()
    const orb = document.createElement('div')
    orb.className = 'hearth-character-orb'
    orb.style.left = `${orbX - 9}px`
    orb.style.top = `${orbY - 9}px`
    orb.style.setProperty('--orb-dx', `${dest ? dest.left + dest.width / 2 - orbX : 0}px`)
    orb.style.setProperty('--orb-dy', `${dest ? dest.top + dest.height / 2 - orbY : 120}px`)
    document.body.appendChild(orb)
    orb.classList.add('is-flying')
    await this.wait(640)

    if (target) {
      if (!character.lockedArt) target.querySelector<HTMLElement>('.player-art')?.style.setProperty('background-image', `url('${character.art}')`)
      SquareBurst.playOn(target, 'score', { count: 34, spread: 180, duration: 720, size: [10, 24] })
      target.classList.add('hearth-character-installed')
      window.setTimeout(() => target.classList.remove('hearth-character-installed'), 760)
    }
    orb.remove()
    root.classList.remove('is-character-confirming')
    root.classList.add('is-character-confirmed')
    // 난이도 선택은 확정 상태에서만 display되므로, 표시된 다음 프레임에 커버플로우/캡션을 심는다.
    requestAnimationFrame(() => this.selectDifficulty(this.selectedDifficultyIndex))
  }


  /** 무역 좌측 탭 라벨은 실제 데이터 연결 전까지 1번~6번 임시 문구를 쓴다. */
  private renderTradeTabs(): string {
    // 하단 뒤로가기와 겹치던 7·8번 임시 탭은 실제 데이터가 붙기 전까지 숨긴다.
    return Array.from({ length: 6 }, (_, index) => `
      <button class="hearth-trade-tab ${index === 0 ? 'is-active' : ''}" type="button" role="tab" aria-selected="${index === 0 ? 'true' : 'false'}" data-hearth-trade-tab="${index}">
        <span data-shadow-text="${index + 1}번">${index + 1}번</span>
      </button>
    `).join('')
  }

  /** 각 무역 탭은 비어 있는 임시 카드팩 5개를 가진다. */
  private renderTradePacks(tabIndex: number): string {
    // 1번 탭: 임시 개방 버튼(직업 선택/상점 리롤/화폐 패널/만찬). 화폐 소비 구매는 추후 배선.
    if (tabIndex === 0) return this.renderUnlockCards()
    return Array.from({ length: 5 }, (_, index) => `
      <article class="hearth-trade-pack" style="--pack-order:${index}">
        <div class="hearth-trade-pack-art" aria-hidden="true"></div>
        <strong>${tabIndex + 1}-${index + 1}</strong>
        <small>빈 카드팩</small>
      </article>
    `).join('')
  }

  /** 무역 1번 탭 임시 개방 카드 — 클릭으로 각 메타 시스템 개방/해제를 토글한다. */
  private renderUnlockCards(): string {
    return META_UNLOCKS.map((u, index) => {
      const on = isMetaUnlocked(u.id)
      return `
      <article class="hearth-trade-pack hearth-unlock-card${on ? ' is-unlocked' : ''}" style="--pack-order:${index}"
               role="button" tabindex="0" data-hearth-unlock="${u.id}" aria-pressed="${on ? 'true' : 'false'}">
        <div class="hearth-trade-pack-art hearth-unlock-art" aria-hidden="true"></div>
        <strong>${u.label}</strong>
        <small>${u.desc}</small>
        <span class="hearth-unlock-state">${on ? '개방됨' : '잠김'}</span>
      </article>`
    }).join('')
  }

  /** 임시 개방 카드 토글 — 메타 잠금 플래그를 뒤집고 카드 상태를 즉시 반영한다. */
  private toggleUnlockCard(card: HTMLElement): void {
    const id = card.dataset.hearthUnlock as (typeof META_UNLOCKS)[number]['id'] | undefined
    if (!id) return
    const on = toggleMetaUnlock(id)
    card.classList.toggle('is-unlocked', on)
    card.setAttribute('aria-pressed', on ? 'true' : 'false')
    const state = card.querySelector<HTMLElement>('.hearth-unlock-state')
    if (state) state.textContent = on ? '개방됨' : '잠김'
    // 만찬 개방 상태가 바뀌면 뒤의 9칸(만찬 칸 잠금)도 즉시 동기화한다.
    if (id === 'dinner') this.refreshCellLocks()
    // 거점에서도 보이는 패널(화폐/의뢰)은 body 잠금 클래스를 즉시 반영해 로비에서 바로 숨기고 켠다.
    if (id === 'currency') document.body.classList.toggle('meta-currency-locked', !on)
    if (id === 'quests') document.body.classList.toggle('meta-quests-locked', !on)
    card.animate([{ transform: 'scale(0.96)' }, { transform: 'scale(1)' }], { duration: 180, easing: 'ease-out' })
  }

  /** 개방 상태 변화 시 9칸 그리드를 다시 그려 잠금/개방을 반영한다(무역 화면 뒤 배경). */
  private refreshCellLocks(): void {
    const grid = this.overlay?.querySelector<HTMLElement>('.hearth-grid')
    if (!grid) return
    grid.innerHTML = this.renderCells()
    // 인트로 점등이 끝난 뒤의 갱신이므로 새로 그린 칸도 즉시 점등 상태로 둔다(무역 종료 후 어둡게 남지 않게).
    grid.querySelectorAll<HTMLElement>('.hearth-cell--open, .hearth-cell--locked, [data-hearth-station="adventure"]')
      .forEach((c) => c.classList.add('is-ignited'))
  }

  /** 탭 클릭 시 우측 카드팩 자리만 갈아 끼워 추후 실제 상품 매핑 지점을 고정한다. */
  private selectTradeTab(index: number): void {
    // 현재 노출하는 임시 탭 수에 맞춰 선택 범위를 제한한다.
    this.selectedTradeTab = Math.max(0, Math.min(5, index))
    const root = this.overlay
    if (!root) return
    root.querySelectorAll<HTMLElement>('[data-hearth-trade-tab]').forEach((tab) => {
      const active = Number(tab.dataset.hearthTradeTab ?? -1) === this.selectedTradeTab
      tab.classList.toggle('is-active', active)
      tab.setAttribute('aria-selected', active ? 'true' : 'false')
    })
    const grid = root.querySelector<HTMLElement>('.hearth-trade-pack-grid')
    if (grid) {
      grid.innerHTML = this.renderTradePacks(this.selectedTradeTab)
      grid.animate([{ opacity: 0, transform: 'translateY(18px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 260, easing: 'ease-out' })
      // 탭 전환 시 뷰포트를 왼쪽으로 되돌린다.
      root.querySelector<HTMLElement>('.hearth-trade-pack-viewport')?.scrollTo({ left: 0, behavior: 'instant' })
    }
  }

  /** 무역 팩 뷰포트를 화살표로 좌우 스크롤한다. */
  private scrollTradePacks(dir: 'left' | 'right'): void {
    const viewport = this.overlay?.querySelector<HTMLElement>('.hearth-trade-pack-viewport')
    if (!viewport) return
    const packW = viewport.querySelector<HTMLElement>('.hearth-trade-pack')?.offsetWidth ?? 200
    viewport.scrollBy({ left: (packW + 28) * (dir === 'right' ? 1 : -1), behavior: 'smooth' })
  }

  /** 직업 선택 문법의 세로 포트레이트 카드 — 일러스트 풀 커버 + 하단 스크림 + 잠금 오버레이. */
  private renderCharacterCards(): string {
    const lockIcon = `<svg class="hearth-char-lock-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>
    </svg>`
    return HEARTH_CHARACTERS.map((character, index) => `
      <button class="hearth-character-card${index === 0 ? ' is-selected' : ''}${character.locked ? ' is-locked' : ''}"
              type="button" role="option"
              aria-label="${character.name}" aria-selected="${index === 0 ? 'true' : 'false'}"
              ${character.locked ? 'aria-disabled="true"' : ''}
              data-hearth-character="${index}">
        <div class="hearth-character-art${character.lockedArt ? ' is-empty' : ''}"
             ${!character.lockedArt && character.art ? `style="background-image:url('${character.art}')"` : ''}
             aria-hidden="true"></div>
        <div class="hearth-character-sheen" aria-hidden="true"></div>
        ${character.locked ? `<div class="hearth-character-lock">${lockIcon}<span>추후 해금</span></div>` : ''}
        <div class="hearth-character-scrim">
          <div class="hearth-character-name">${character.name}</div>
          <div class="hearth-character-divider" aria-hidden="true"></div>
          <div class="hearth-character-meta">
            <span class="hearth-character-role">${character.role}</span>
            ${character.tagline ? `<span class="hearth-character-tagline">${character.tagline}</span>` : ''}
          </div>
        </div>
      </button>
    `).join('')
  }

  /** 난이도 잠금 판정: 보통은 정적 개발 잠금, 쉬움은 새싹 병아리 졸업 여부로 런타임 판정. */
  private isDifficultyLocked(def: DifficultyDef): boolean {
    if (def.devLocked) return true
    if (def.key === 'easy') return !(this.handlers?.isEasyUnlocked?.() ?? false)
    return false
  }

  /** 캐릭터 확정 후 출발 버튼 위에 뜨는 난이도 카드 3장(캐릭터 카드와 같은 커버플로우+일러스트 방식). */
  private renderDifficultyCards(): string {
    const lockIcon = `<svg class="hearth-diff-lock-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>
    </svg>`
    return HEARTH_DIFFICULTIES.map((def, index) => {
      const locked = this.isDifficultyLocked(def)
      const selected = index === this.selectedDifficultyIndex
      return `
      <button class="hearth-diff-card diff-${def.key}${selected ? ' is-selected' : ''}${locked ? ' is-locked' : ''}"
              type="button" role="option"
              aria-label="${def.name}" aria-selected="${selected ? 'true' : 'false'}"
              ${locked ? 'aria-disabled="true"' : ''}
              data-hearth-diff="${index}">
        <div class="hearth-diff-art${def.art ? '' : ' is-empty'}" ${def.art ? `style="background-image:url('${def.art}')"` : ''} aria-hidden="true"></div>
        <div class="hearth-diff-sheen" aria-hidden="true"></div>
        <div class="hearth-diff-scrim">
          <span class="hearth-diff-card-name">${def.name}</span>
          <span class="hearth-diff-card-tag">${def.tagline}</span>
        </div>
        ${locked ? `<div class="hearth-diff-lock">${lockIcon}</div>` : ''}
      </button>`
    }).join('')
  }

  /** 저장된 마지막 난이도를 복원하되, 잠긴 난이도면 개방된 최고 난이도로 폴백한다. */
  private initDifficultySelection(): void {
    const saved = window.localStorage.getItem(HEARTH_LAST_DIFFICULTY_KEY)
    let index = HEARTH_DIFFICULTIES.findIndex((d) => d.key === saved)
    if (index < 0) index = this.isDifficultyLocked(HEARTH_DIFFICULTIES[1]) ? 0 : 1
    // 복원된 난이도가 잠겨 있으면(예: 저장은 쉬움인데 아직 미졸업) 개방된 항목으로 내린다.
    if (this.isDifficultyLocked(HEARTH_DIFFICULTIES[index])) {
      const openIdx = HEARTH_DIFFICULTIES.map((d, i) => ({ d, i })).filter((x) => !this.isDifficultyLocked(x.d)).pop()
      index = openIdx ? openIdx.i : 0
    }
    this.selectedDifficultyIndex = index
  }

  /** 난이도 커버플로우: 캐릭터 카드와 동일하게 인라인 transform으로 선택 카드를 중앙 확대한다. */
  private layoutDifficultyCards(): void {
    const root = this.overlay
    if (!root) return
    const cards = [...root.querySelectorAll<HTMLElement>('[data-hearth-diff]')]
    const n = cards.length
    if (n === 0 || cards[0].offsetWidth === 0) return
    const stepPx = cards[0].offsetWidth * 0.82
    const center = this.selectedDifficultyIndex
    cards.forEach((card) => {
      const i = Number(card.dataset.hearthDiff ?? -1)
      // 캐릭터 커버플로우와 같은 최단 경로 순환 배치 — 끝에서 한 번 더 넘기면 반대쪽이 이어진다.
      let off = ((i - center) % n + n) % n
      if (off > n / 2) off -= n
      const a = Math.abs(off)
      const scale = Math.max(0.78, 1 - a * 0.16)
      const opac = a <= 1.6 ? Math.max(0.22, 1 - a * 0.4) : 0
      const bright = Math.max(0.5, 1 - a * 0.28)
      card.classList.toggle('is-selected', i === center)
      card.setAttribute('aria-selected', i === center ? 'true' : 'false')
      card.style.transform = `translate(-50%, -50%) translateX(${off * stepPx}px) scale(${scale}) rotateY(${off * -8}deg)`
      card.style.opacity = String(opac)
      card.style.zIndex = String(50 - Math.round(a * 10))
      card.style.filter = `brightness(${bright})`
      card.style.pointerEvents = opac > 0.2 ? 'auto' : 'none'
    })
  }

  /** 난이도 선택 갱신 — 커버플로우 재배치 + 하단 캡션(이름/설명/잠금) 동기화. */
  private selectDifficulty(index: number, direction: 'left' | 'right' | 'click' = 'click'): void {
    // 캐릭터 선택과 같은 순환: 끝에서 계속 넘기면 처음으로 자연스럽게 이어진다.
    const n = HEARTH_DIFFICULTIES.length
    const wrapped = ((index % n) + n) % n
    this.selectedDifficultyIndex = wrapped
    const def = HEARTH_DIFFICULTIES[wrapped]
    window.localStorage.setItem(HEARTH_LAST_DIFFICULTY_KEY, def.key)
    this.layoutDifficultyCards()
    const root = this.overlay
    if (!root) return
    const locked = this.isDifficultyLocked(def)
    const nameEl = root.querySelector<HTMLElement>('.hearth-diff-caption-name')
    const descEl = root.querySelector<HTMLElement>('.hearth-diff-caption-desc')
    if (nameEl) nameEl.textContent = def.name
    if (descEl) descEl.textContent = locked ? `${def.desc} (잠김)` : def.desc
    root.querySelector<HTMLElement>('.hearth-difficulty')?.classList.toggle('is-locked-pick', locked)
    // 출발 버튼은 잠긴 난이도를 고르면 흐려져 클릭이 거부됨을 미리 알린다.
    root.querySelector<HTMLElement>('[data-hearth-depart]')?.classList.toggle('is-disabled', locked)
    root.querySelector<HTMLElement>('.hearth-diff-caption')?.animate([
      { opacity: 0, transform: `translateX(${direction === 'right' ? '-' : ''}12px)` },
      { opacity: 1, transform: 'translateX(0)' },
    ], { duration: 240, easing: 'ease-out' })
  }

  /** 마지막으로 고른 시작 난이도 키(런 시작 시 온보딩/정규 분기를 결정한다). */
  getSelectedDifficulty(): HearthDifficulty {
    return HEARTH_DIFFICULTIES[this.selectedDifficultyIndex].key
  }

  /** 출발 → 직업 선택/런 시작. 직업 오버레이(z=200)가 검은 셔터 위로 떠 이음새를 가린 뒤 허브를 걷는다. */
  private async depart(): Promise<void> {
    if (this.departing) return
    // 잠긴 난이도(쉬움 미개방/보통 개발 중)로는 출발할 수 없다 — 카드와 버튼을 흔들어 거부를 알린다.
    if (this.isDifficultyLocked(HEARTH_DIFFICULTIES[this.selectedDifficultyIndex])) {
      const card = this.overlay?.querySelector<HTMLElement>('.hearth-diff-card.is-selected')
      const btn = this.overlay?.querySelector<HTMLElement>('[data-hearth-depart]')
      ;[card, btn].forEach((el) => {
        if (!el) return
        el.classList.add('is-denied')
        window.setTimeout(() => el.classList.remove('is-denied'), 420)
      })
      return
    }
    this.departing = true
    this.overlay?.querySelector<HTMLElement>('[data-hearth-depart]')?.classList.add('is-pressed')
    // 로비 배경(hearth_bg_001)을 페이드아웃해 검은 화면을 만든 뒤, 런이 시작되며
    // body의 원래 배경(background_001)이 페이드인된다(두 배경이 겹치지 않게 분리).
    document.getElementById('ingame-backdrop')?.classList.add('is-out')
    await this.wait(520)
    void this.handlers?.onStart()
    await this.wait(480)
    this.exit()
  }

  /**
   * 9칸 스테이션 그리드(0~8, row-major). 전체 배치/역할/해금 게이팅은
   * 기획서 `Unmelting_Game_Concept.md` §12(거점 화면)에 확정 명시돼 있다.
   *   0 암시장 / 1 타로 / 2 도박장 / 3 길드 / 4 잿빛 굴레(중앙) / 5 서고
   *   6 무역 / 7 모험(하단 중앙) / 8 만찬
   * 현 단계는 임시 해금 상태로 9칸 모두 점등·인스펙터 접근이 가능하다.
   * 모험(index 7)만 셔터/출발 동작을 갖고, 나머지는 정보 확인용 칸이다.
   * 각 칸은 `data-inspect-*`로 우측 인스펙터 hover 정보를 제공한다.
   */
  /** 칸 개방 여부. 모험은 항상, 무역은 새싹 병아리 졸업(isEasyUnlocked) 시, 나머지는 잠금.
   *  /개방(devUnlockAll)이면 전부 개방. 나머지 시설은 추후 무역에서 해금한다. */
  private cellUnlocked(i: number): boolean {
    if (this.devUnlockAll) return true
    if (i === ADVENTURE_INDEX) return true
    if (i === TRADE_INDEX) return this.handlers?.isEasyUnlocked?.() ?? false
    if (i === DINNER_INDEX) return isMetaUnlocked('dinner')
    return false
  }

  /** 칸별 잠금 해제 조건 안내(인스펙터/잠금 오버레이 문구). */
  private cellLockHint(i: number): string {
    if (i === TRADE_INDEX) return '새싹 병아리 클리어 시 개방'
    if (i === DINNER_INDEX) return '무역에서 만찬 개방'
    return '추후 무역에서 개방'
  }

  private renderCells(): string {
    const lockIcon = `<svg class="hearth-cell-lock-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>`
    const cells: string[] = []
    for (let i = 0; i < 9; i++) {
      const name = STATION_NAMES[i]
      const desc = STATION_DESC[name] ?? ''
      // 칸 인스펙터 일러스트는 row-major index+1로 hearth_001~009와 1:1 매핑한다.
      // 아직 파일이 없는 칸은 undefined → CSS 플레이스홀더로 폴백한다.
      const art = spriteForHearthStation(`hearth_00${i + 1}`)
      const artAttr = art ? ` data-inspect-art="${art}"` : ''
      // 일러스트가 있으면 칸 배경으로도 직접 깐다(--cell-art) + has-art 클래스로 오버레이 톤 적용.
      const artClass = art ? ' hearth-cell--has-art' : ''
      const artStyle = art ? ` style="--cell-art: url('${art}')"` : ''
      const unlocked = this.cellUnlocked(i)
      // 잠긴 칸: 어둡게 잠금(자물쇠 오버레이) + 비상호작용. 인스펙터 태그도 개방/잠김 분기.
      if (!unlocked) {
        const hint = this.cellLockHint(i)
        const lockInspect = ` data-inspect-title="${name}" data-inspect-tag="잠김" data-inspect-desc="${hint}"${artAttr}`
        cells.push(
          `<div class="hearth-cell hearth-cell--locked${artClass}" tabindex="0" aria-label="${name} (잠김)" aria-disabled="true"` +
            `${lockInspect}${artStyle}>` +
            `<span class="hearth-cell__lock" aria-hidden="true">${lockIcon}</span>` +
            `<span class="hearth-cell__label">${name}</span>` +
            `</div>`
        )
        continue
      }
      const inspectAttr = ` data-inspect-title="${name}" data-inspect-tag="개방" data-inspect-desc="${desc}"${artAttr}`
      if (i === TRADE_INDEX) {
        // 무역 칸 — 메타 해금/계승 UI의 임시 셔터 화면으로 진입한다.
        cells.push(
          `<button class="hearth-cell hearth-cell--open${artClass}" data-hearth-station="trade" type="button" aria-label="무역"` +
            `${inspectAttr}${artStyle}>` +
            `<span class="hearth-cell__label">${name}</span>` +
            `</button>`
        )
      } else if (i === DINNER_INDEX) {
        // 만찬 칸 — 무료 만찬 카드팩/3단계 음식 커스텀 임시 플로우로 진입한다.
        // 만찬 유물 미보유 시 Free 배지 표시(점등 완료 이후 초록 형광)
        const freeBadge = !this.dinnerConsumed
          ? `<span class="hearth-cell__dinner-free" aria-hidden="true">Free</span>`
          : ''
        cells.push(
          `<button class="hearth-cell hearth-cell--open${artClass}" data-hearth-station="dinner" type="button" aria-label="만찬"` +
            `${inspectAttr}${artStyle}>` +
            `<span class="hearth-cell__label">${name}</span>` +
            freeBadge +
            `</button>`
        )
      } else if (i === ADVENTURE_INDEX) {
        // 모험 칸 — 셔터/캐릭터 선택/출발 동작을 갖는다. 가운데 불씨(촛불)는 빼고 일러스트로만 점등한다.
        cells.push(
          `<button class="hearth-cell hearth-cell--adventure${artClass}" data-hearth-station="adventure" type="button" aria-label="모험 시작"` +
            `${inspectAttr}${artStyle}>` +
            `<span class="hearth-cell__label">${name}</span>` +
            `</button>`
        )
      } else {
        cells.push(
          `<div class="hearth-cell hearth-cell--open${artClass}" tabindex="0" aria-label="${name}"` +
            `${inspectAttr}${artStyle}>` +
            `<span class="hearth-cell__label">${name}</span>` +
            `</div>`
        )
      }
    }
    return cells.join('')
  }

  /** 인스펙터를 우측 전체로 펼친다 — 레일 우측 절반부터 화면 우측 끝까지(레일을 일부 침범). */
  private alignInspector(): void {
    const rail = document.querySelector<HTMLElement>('#game-board .rail')
    const insp = this.inspector
    if (!rail || !insp) return
    const r = rail.getBoundingClientRect()
    // 가로: 가장 우측 칸의 절반(≈레일 폭의 5/6 지점)부터 화면 우측 끝까지(여백 0).
    // 세로: 레일이 아니라 화면 위아래 끝(뷰포트 전체 높이)을 다 채운다.
    const left = r.left + r.width * 0.82
    const right = window.innerWidth
    insp.style.left = `${left}px`
    insp.style.top = `0px`
    insp.style.width = `${Math.max(200, right - left)}px`
    insp.style.height = `${window.innerHeight}px`
  }

  /** 상점/직업 선택과 동일하게 셸을 실제 레일 rect에 고정한다. */
  private alignToRail(): void {
    const rail = document.querySelector<HTMLElement>('#game-board .rail')
    const shell = this.overlay?.querySelector<HTMLElement>('.hearth-shell')
    if (!rail || !shell) return
    const rect = rail.getBoundingClientRect()
    shell.style.left = `${rect.left}px`
    shell.style.top = `${rect.top}px`
    shell.style.width = `${rect.width}px`
    shell.style.height = `${rect.height}px`
  }

  exit(): void {
    if (this.resizeListener) {
      window.removeEventListener('resize', this.resizeListener)
      window.removeEventListener('scroll', this.resizeListener, true)
      this.resizeListener = null
    }
    document.removeEventListener('pointerover', this.onPointerOver)
    document.removeEventListener('pointerout', this.onPointerOut)
    document.removeEventListener('click', this.onTap, true)
    // 로비 backdrop 페이드아웃 상태 해제(런 중에는 index.ts 기본 backdrop 규칙으로 복귀).
    document.getElementById('ingame-backdrop')?.classList.remove('is-out')
    this.dinnerBubble?.destroy()
    this.dinnerBubble = null
    this.inspector?.remove()
    this.inspector = null
    this.overlay?.remove()
    this.overlay = null
    this.handlers = null
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => window.setTimeout(resolve, ms))
  }

  private injectStyles(): void {
    if (document.getElementById('hearth-styles')) return
    const style = document.createElement('style')
    style.id = 'hearth-styles'
    style.textContent = HEARTH_STYLES
    document.head.appendChild(style)
  }
}
