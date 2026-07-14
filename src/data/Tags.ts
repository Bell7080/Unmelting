/**
 * Tags — 손패·유물 시너지 태그의 단일 출처(양식).
 *
 * 여기 등록되지 않은 태그 문자열은 타입 에러가 나므로 태그가 중구난방으로 늘어나지 않는다.
 * - `category`: 태그를 성격별로 묶는 편집·문서용 분류(반응 로직이 아니다).
 * - `synergy: true` = "능동 시너지 태그" — 유물/레시피가 반응하는 대상이며, 손패 최소 5장 보장
 *   계약을 진다(Tags.test.ts가 강제). 능동 태그는 그 자체로 빌드 축이 될 수 있어야 하기 때문이다.
 * - `synergy: false` = 설명용 보조 태그. 아직 5장이 안 되거나(추후 승격) 저재미(도구)라
 *   반응 대상에서 빠진다. 카드 수가 5장을 넘기면 synergy를 true로 승격한다.
 *
 * 새 태그는 반드시 여기 먼저 등록한 뒤 카드에 부여한다. 한 카드의 태그는 1~5개(정체성 설명용).
 */

export type TagCategory =
  | 'material'  // 원소/재료: 불씨·양초
  | 'weapon'    // 무기/형태: 칼날 (추후 둔기 등)
  | 'defense'   // 방어: 방패
  | 'sustain'   // 유지/회복: 회복
  | 'cost'      // 대가/자해: 제물
  | 'purify'    // 정화: 정화·성물
  | 'arcane'    // 지식/술법: 서적·수집
  | 'economy'   // 재화: 동전·보물
  | 'nature'    // 자연: 꽃·차
  | 'utility'   // 범용 도구(저재미 — 정체성 태그로 대체 예정)

export interface TagSpec {
  /** 도감/설명에 쓰는 한글 라벨. */
  label: string
  category: TagCategory
  /** true = 능동 시너지 태그(유물/레시피 반응 대상 + 손패 ≥5장 계약). */
  synergy: boolean
}

/** 등록된 전체 태그. keyof가 곧 SynergyTag 유니온이 된다. */
export const SYNERGY_TAGS = {
  // 능동 시너지 태그 — 현재 손패 5장 이상 확보(Tags.test.ts 계약 대상).
  flame:     { label: '불씨', category: 'material', synergy: true },
  wax:       { label: '양초', category: 'material', synergy: true },
  blade:     { label: '칼날', category: 'weapon',   synergy: true },
  shield:    { label: '방패', category: 'defense',  synergy: true },
  sacrifice: { label: '제물', category: 'cost',     synergy: true },
  // 보조 태그 — 5장 미달/저재미. 카드가 늘면 synergy를 승격한다.
  heal:      { label: '회복', category: 'sustain',  synergy: false },
  clean:     { label: '정화', category: 'purify',   synergy: false },
  holy:      { label: '성물', category: 'purify',   synergy: false },
  tome:      { label: '서적', category: 'arcane',   synergy: false },
  draw:      { label: '수집', category: 'arcane',   synergy: false },
  coin:      { label: '동전', category: 'economy',  synergy: false },
  treasure:  { label: '보물', category: 'economy',  synergy: false },
  flower:    { label: '꽃',   category: 'nature',   synergy: false },
  tea:       { label: '차',   category: 'nature',   synergy: false },
  tool:      { label: '도구', category: 'utility',  synergy: false },
} as const satisfies Record<string, TagSpec>

export type SynergyTag = keyof typeof SYNERGY_TAGS

/** 한 카드가 가질 수 있는 태그 최대 개수(정체성 설명용). */
export const MAX_TAGS_PER_CARD = 5

/** 능동 시너지 태그가 계약해야 하는 최소 손패 수. */
export const MIN_CARDS_PER_SYNERGY_TAG = 5

export function isSynergyTag(s: string): s is SynergyTag {
  return Object.prototype.hasOwnProperty.call(SYNERGY_TAGS, s)
}

/** 능동 시너지 태그 목록(≥5장 계약 대상). */
export const ACTIVE_SYNERGY_TAGS: readonly SynergyTag[] =
  (Object.keys(SYNERGY_TAGS) as SynergyTag[]).filter((t) => SYNERGY_TAGS[t].synergy)
