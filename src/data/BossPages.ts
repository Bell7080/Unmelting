/**
 * BossPages — 보스 페이지 능력 수치의 단일 출처.
 *
 * 페이지 경계(어디서 멈추는가)와 페이지 능력(그때 무엇이 세지는가)은 본편(`BossEvent`)과
 * 학습 시뮬(`EnaTrainingSimulation`)이 **둘 다** 알아야 하는 수치다. 각자 상수를 들고 있으면
 * 한쪽만 바뀌어도 테스트와 화면은 멀쩡한 채로 에나가 없는 게임을 학습한다.
 *
 * 연출·대사·전환 시퀀스는 여기 오지 않는다 — 그건 `BossEvent`의 몫이다. 여기 있는 것은
 * "그 페이지에서 숫자가 얼마나 바뀌는가"뿐이다.
 */

import type { SpecialEnemyKind } from '@entities/Card'

/**
 * 절반 HP에서 한 번 멈추고 2페이지로 넘어가는 보스들.
 * 격자가 켜진 보스는 그 자리에서 부위를 하나 더 깨야 열리고(리미트 페이지),
 * 격자가 없는 보스는 닿는 순간 열린다.
 */
export const HALF_PAGE_BOSSES: ReadonlySet<SpecialEnemyKind> = new Set<SpecialEnemyKind>([
  'waxArmy',
  'waxCat',
  'waxKnight',
  'waxSculptor',
])

/** 절반 HP 페이지 보스의 경계 HP. */
export function halfPageFloor(maxHp: number): number {
  return Math.ceil(maxHp / 2)
}

/**
 * 100F 마녀의 두 페이지 경계. 최대 체력을 셋으로 나눈 자리다(2/3 · 1/3) —
 * HP를 밸런싱으로 옮겨도 경계가 따라오도록 상수로 박아 두지 않는다.
 */
export function waxWitchPageFloors(maxHp: number): [number, number] {
  return [Math.round(maxHp * (2 / 3)), Math.round(maxHp / 3)]
}

/** 30F 탐욕의 값이 참조하는 손패 defId. */
export const GREED_COIN_ID = 'greed-coin'
/** 30F 2페이지: 손에 쥔 탐욕의 동전 1장이 요구하는 피해. */
export const GREED_COIN_TOLL_DAMAGE = 1
/** 30F 매 공격 주기 살포량(최소~최대) — 손패로 흘러드는 동전 장수. */
export const GREED_SCATTER_MIN = 2
export const GREED_SCATTER_MAX = 4

/** 60F 기사단장이 한 주기에 펼치는 손패 장수(1페이지) — 효과 3종 중 비복원 추출. */
export const KNIGHT_BASE_CARDS = 2
/** 기사단장 손패 한 장의 수치(방패/회복/타격 공통). */
export const KNIGHT_HAND_CARD_AMOUNT = 3
/** 2페이지: 카드 한 장이 늘고(=3종 전부) 각 카드의 수치도 1씩 오른다. */
export const KNIGHT_PAGE_TWO_EXTRA_CARDS = 1
export const KNIGHT_PAGE_TWO_AMOUNT_BONUS = 1

/** 90F 조각사가 후퇴할 때마다 세우는 양초 조각 수. */
export const SCULPTOR_SUMMON_COUNT = 3
/**
 * 90F 조각사 2페이지 '비대화' — 소환된 양초 조각이 부풀며 얻는 체력.
 * 광폭화(공격력까지 오르는 마녀식 강화)와 구분되는 어휘다: 조각사는 재료를 더 퍼먹여
 * 종복을 크게 만들 뿐, 사납게 만들지는 않는다.
 */
export const SCULPTOR_SWELL_HP = 5

/** 100F 마녀가 매 공격 주기에 태우는 손패 장수(모든 페이지 유지). */
export const WITCH_BURN_CARDS = 2
/** 100F 2페이지에 한 번에 펼치는 보스 손패 장수. */
export const WITCH_PAGE_TWO_CARDS = 4
/** 마녀 손패 한 장의 수치(방패/회복/타격 공통). */
export const WITCH_HAND_CARD_AMOUNT = 5
/** 100F 3페이지 소환 종복 수. */
export const WITCH_SUMMON_COUNT = 3
/** 100F 마녀 3페이지 광폭화 — 소환 종복이 얻는 공격력/체력 보너스. */
export const WITCH_ENRAGE_ATK = 3
export const WITCH_ENRAGE_HP = 8
/**
 * 100F 3페이지에서 마녀가 후방 2×3으로 접힐 때의 격자 행 수.
 * 몸이 줄면 판정 칸도 줄고, 줄어든 칸 수를 기준으로 약점이 새로 노출된다.
 */
export const WITCH_PAGE_THREE_GRID_ROWS = 2
