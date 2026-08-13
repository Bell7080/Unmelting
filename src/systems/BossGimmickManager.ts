/**
 * BossGimmickManager — 큰 칸 하나로 그려지는 보스 위에 겹치는 "투명 기믹 격자".
 *
 * 보스는 화면상 3×3(90F는 2행 6칸)을 통째로 차지하는 단일 Card지만, 전투 기믹까지
 * 1칸으로 취급할 이유는 없다. 이 매니저가 그 위에 다시 격자를 깔아 칸 단위 판정을
 * 소유한다 — 칸마다 피해 배율(약점/경화)을 주고, 누적 피해로 칸이 깨지는 부위 파괴를
 * 굴린다. 보스별 프로필만 늘리면 다른 칸 기믹도 같은 격자에 얹을 수 있다.
 *
 * 부위 파괴가 있는 이유: 배율만 있으면 약점 한 칸만 무한히 파먹는 게 최적해가 된다.
 * 약점일수록 빨리 깨져 꺼지므로, 결국 격자 전체를 돌며 때리게 만드는 장치다.
 *
 * 이 파일은 순수 모델이다. DOM/연출은 렌더러가 셀 뷰를 읽어 그리고,
 * 전투 판정 호출은 BossEventController가 굴린다.
 *
 * ── 확장 지점 ───────────────────────────────────────────────────────────────
 * 칸 판정은 resolveMultiplier() **하나**를 지난다. 배율 계산이 이 함수 바깥으로 새면
 * 그 순간 태그 반응이 닿지 않는 사각지대가 생기니 넣지 말 것.
 *
 * 판정에 필요한 정보는 이미 전부 들어와 있다 — 어디서 온 피해인지(origin), 단일인지
 * 광역인지(scope), 어떤 시너지 태그를 달고 왔는지(tags). 그래서 아래 종류의 기믹은
 * 호출부를 전혀 건드리지 않고 붙는다:
 *
 *   - 태그별 추가/반감 (`ctx.tags.includes('flame')` 등) → resolveMultiplier만 수정
 *   - 직접 타격 전용 칸 (`ctx.origin === 'direct'`)       → 칸 종류 1줄 + CSS 1규칙
 *   - 광역 감쇠      (`ctx.scope === 'area'`)            → resolveMultiplier만 수정
 *
 * 배율로 표현되지 않는 결과(광역기 반사 피해처럼 **플레이어가 맞는** 효과)는 배율
 * 하나로 못 담는다. 그때는 BossGimmickStrike에 결과 필드를 하나 늘리고, 그 값을
 * 실제로 적용할 두 호출부(BossEventController.handleClick / HandSystem)를 함께 고친다.
 * 지금 쓰지 않는 필드를 미리 만들어 두지는 않았다.
 */

import type { SynergyTag } from '@data/Tags'
import type { SpecialEnemyKind } from '@entities/Card'

/** 격자 한 칸의 성격. plain은 배율 없는 평범한 칸이다. */
export type BossGimmickCellKind = 'plain' | 'weak' | 'hardened'

/** 특수 칸 종류(= plain을 뺀 나머지). 프로필 배치표가 쓴다. */
export type BossGimmickSpecialKind = Exclude<BossGimmickCellKind, 'plain'>

/**
 * 칸에 얹히는 **부가물**. `kind`(배율 축)와 다른 축이라 같은 칸에 함께 놓인다 —
 * "약점인데 함정"이 성립해야 '때리고 싶은데 아프다'는 갈등이 생긴다.
 *
 * 배율 축에 새 종류(경감·증폭 등)가 몇 개 늘어도 이 축은 그대로다. 부가물은 피해를
 * 키우거나 줄이지 않고, **때린 사람에게 무언가를 한다**:
 *   - trap: 밟은 사람이 피해를 받는다(필드 함정과 같은 규칙 — 무시 확률·피해 보너스 포함)
 *   - treasure: 손패를 준다
 */
export type BossGimmickFixture = 'trap' | 'treasure'

export interface BossGimmickFixtureMeta {
  /** 칸에 덧붙는 짧은 이름. */
  label: string
  /** 연출 톤 — 부가물도 종류가 아니라 톤으로 갈려 CSS 분기를 새로 쓰지 않는다. */
  tone: BossGimmickTone
}

/** 부가물 표기/톤의 단일 출처. 새 부가물은 이 표 한 줄 + `.is-fixture-*` CSS 한 규칙이다. */
export const BOSS_GIMMICK_FIXTURE_META: Record<BossGimmickFixture, BossGimmickFixtureMeta> = {
  trap: { label: '함정', tone: 'cold' },
  treasure: { label: '보물', tone: 'hot' },
}

/**
 * 손패 대상 필터가 이 칸 부가물에 닿는가 — 판정과 화면 표시의 **공용 순수함수**다.
 * (`HandSystem`의 실판정과 `GameBoardRenderer`의 하이라이트가 같은 답을 내야 한다.)
 *
 * ★ 칸 함정은 **필드 함정과 같은 것으로 취급한다**. 거미줄·폭탄·포자를 지울 수 있는
 * 손패라면 전부 이 함정에도 닿아야 한다 — 화면에 같은 '함정'으로 보이는데 어떤 카드는
 * 통하고 어떤 카드는 안 통하면 규칙이 아니라 고장으로 읽힌다. 그래서 포자 전용 필터도
 * 여기서는 받아 준다.
 */
export function bossFixtureMatchesFilter(fixture: BossGimmickFixture, filter: string): boolean {
  if (filter === 'any') return true
  if (fixture === 'trap') return filter === 'trap' || filter === 'spore' || filter === 'hazard' || filter === 'trap-or-treasure'
  return filter === 'treasure' || filter === 'enemy-or-treasure' || filter === 'trap-or-treasure'
}

/**
 * 칸 성격의 연출 톤. 렌더러가 이 값을 자기 팔레트(BurstTheme·버스트 세기)로 옮긴다 —
 * 모델이 UI 타입을 알면 레이어가 뒤집히므로 중립 토큰으로 둔다.
 * 새 칸 종류를 추가할 때 톤만 고르면 연출 분기를 따로 손댈 필요가 없다.
 */
export type BossGimmickTone = 'hot' | 'cold' | 'neutral'

export interface BossGimmickKindMeta {
  /** 칸에 표시할 짧은 이름. plain은 빈 문자열이라 아무것도 적지 않는다. */
  label: string
  /** 직접 공격 피해 배율. */
  multiplier: number
  /** 타격 연출 톤. */
  tone: BossGimmickTone
}

/**
 * 칸 성격별 수치/표기의 단일 출처 — 밸런싱은 여기만 고친다.
 * 칸 종류를 늘릴 때 필요한 건 이 표 한 줄과 `.is-kind-*` CSS 한 규칙이 전부다.
 */
export const BOSS_GIMMICK_KIND_META: Record<BossGimmickCellKind, BossGimmickKindMeta> = {
  plain: { label: '', multiplier: 1, tone: 'neutral' },
  weak: { label: '약점', multiplier: 2, tone: 'hot' },
  hardened: { label: '경화', multiplier: 0.5, tone: 'cold' },
}

/** 부위 파괴 보너스 = 보스 최대 체력의 이 비율. 칸 하나가 깨질 때 한 번 더 꽂힌다. */
export const BOSS_GIMMICK_BREAK_DAMAGE_RATIO = 0.1

/**
 * 함정 칸이 물리는 피해 = 보스 공격력의 이 비율. 고정 수치로 두면 30F에서 아프고
 * 100F에서는 없는 것과 같아진다 — 보스가 세질수록 함정도 같이 세야 "때릴까 지울까"가
 * 끝까지 선택으로 남는다. 한 대 맞는 것보다는 확실히 싸다(반격 대신 감수할 만한 값).
 */
export const BOSS_GIMMICK_TRAP_DAMAGE_RATIO = 0.4

/** 보물 칸 하나가 주는 손패 수. 타격마다 재생성되므로 1장이 상한이다. */
export const BOSS_GIMMICK_TREASURE_CARDS = 1

/** 함정 칸의 피해. 보스 공격력에서 파생하므로 보스 수치만 고치면 따라온다. */
export function bossGimmickTrapDamage(bossDamage: number): number {
  return Math.max(1, Math.round(bossDamage * BOSS_GIMMICK_TRAP_DAMAGE_RATIO))
}

/** 균열 표기 단계 수. 0 = 멀쩡, 이 값 = 파괴 직전. 렌더러가 금 개수를 고르는 기준이다. */
export const BOSS_GIMMICK_CRACK_STAGES = 3

/**
 * 칸마다 흩어 굴리는 **단단함 배수**. 모든 칸이 같은 내구도면 광역 한 방이 격자를
 * 통째로 같은 박자에 쓸어 간다 — 칸마다 다르면 운 좋게 단단한 칸이 살아남아
 * 계속 때릴 자리가 남는다.
 */
export const BOSS_GIMMICK_TOUGHNESS_MIN = 0.7
export const BOSS_GIMMICK_TOUGHNESS_MAX = 1.5
/**
 * 칸이 하나 깨질 때마다 **남은 칸이 단단해지는** 비율. 뒤로 갈수록 한 칸을 깨는 품이
 * 무거워져, 격자가 한 번에 무너지지 않고 점점 버틴다.
 */
export const BOSS_GIMMICK_DURABILITY_ESCALATION = 0.22

/**
 * 칸 내구도 비율. "칸의 절반쯤 깨면 보스가 쓰러진다"는 목표를 그대로 식으로 옮긴 값이다:
 *
 *   (칸수 / 2) × (내구도 + 부위 파괴 보너스) = 보스 최대 체력
 *
 * 을 내구도에 대해 풀면 `maxHp × (2/칸수 − 파괴 보너스 비율)`이 남는다. 칸이 지나치게
 * 많아 값이 뒤집히는 경우만 최소치로 붙들어 "때리자마자 깨지는" 칸을 막는다.
 */
function cellDurabilityRatio(cells: number): number {
  const raw = 2 / Math.max(1, cells) - BOSS_GIMMICK_BREAK_DAMAGE_RATIO
  return Math.max(BOSS_GIMMICK_BREAK_DAMAGE_RATIO / 2, raw)
}

/**
 * 칸별 단단함/고조가 격자 **절반을 깨는 동안** 평균적으로 더 들게 하는 배수.
 * 매니저는 칸 실효 내구도를 낼 때 이 값으로 나눠, 흩어짐이 '어느 칸이 먼저 깨지는가'만
 * 바꾸고 '몇 대 때리면 보스가 죽는가'는 건드리지 않게 한다 — 그래서 위 관계식과
 * `bossGimmickBreakBonusFactor`(학습 시뮬 요약)는 그대로 성립한다.
 */
export function bossGimmickCellSpreadFactor(cells: number): number {
  const meanToughness = (BOSS_GIMMICK_TOUGHNESS_MIN + BOSS_GIMMICK_TOUGHNESS_MAX) / 2
  const halfway = Math.max(1, cells / 2)
  const meanEscalation = 1 + (BOSS_GIMMICK_DURABILITY_ESCALATION * (halfway - 1)) / 2
  return meanToughness * meanEscalation
}

/** 칸 하나가 깨질 때의 추가 피해. */
export function bossGimmickBreakDamage(bossMaxHp: number): number {
  return Math.max(1, Math.round(bossMaxHp * BOSS_GIMMICK_BREAK_DAMAGE_RATIO))
}

/** 칸 하나를 깨는 데 필요한 누적 피해(배율 적용 후 기준). */
export function bossGimmickCellDurability(bossMaxHp: number, cells: number): number {
  return Math.max(1, Math.round(bossMaxHp * cellDurabilityRatio(cells)))
}

/**
 * 부위 파괴 보너스를 '누적 피해 배수'로 환산한 값. 칸 하나를 깨는 동안 내구도만큼
 * 때리고 보너스를 덤으로 받으므로 (내구도 + 보너스) / 내구도 만큼 더 들어간다.
 * maxHp가 약분돼 칸 수만으로 정해지므로, 칸 개념이 없는 학습 시뮬이 이 값만 곱하면
 * 같은 밸런스를 따라온다.
 */
export function bossGimmickBreakBonusFactor(cells: number): number {
  const ratio = cellDurabilityRatio(cells)
  return (ratio + BOSS_GIMMICK_BREAK_DAMAGE_RATIO) / ratio
}

/** 보스 한 종의 격자 형태와 특수 칸 배치표. */
export interface BossGimmickProfile {
  cols: number
  rows: number
  /** 특수 칸 배치 수. 나머지 칸은 전부 plain으로 채운다. */
  slots: ReadonlyArray<{ kind: BossGimmickSpecialKind; count: number }>
  /**
   * 부가물 배치 수. 배율 축(`slots`)과 **독립**이라 약점 위에도 경화 위에도 얹힌다.
   * 보스가 때릴 때마다 이 수까지 다시 채워진다 — 한 번 지우면 영영 없어지는 게 아니라,
   * 지운 만큼의 여유를 다음 반격까지 버는 것이다.
   */
  fixtures?: ReadonlyArray<{ kind: BossGimmickFixture; count: number }>
}

/**
 * 보스별 기믹 격자 프로필. 여기 없는 보스는 큰 칸 1개 그대로 동작한다.
 *
 * 격자 행 수는 **보스가 실제로 점유하는 레일 행 수와 같게** 맞춘다. 레일 1행을 CSS로
 * 3행처럼 늘려 그리는 보스(백작·고양이·기사단장·마녀·악마)는 3×3, 레일 2행을 진짜로
 * 차지하는 보스(조각사)는 2×3이다. 화면의 몸집과 판정 칸이 어긋나면 어디를 때리는지가
 * 안 읽힌다.
 *
 * 전투 도중 몸집이 바뀌는 보스(마녀 3페이지: 3×3 → 2×3)는 `resize()`로 격자도 함께
 * 줄인다 — 칸 수가 줄고 약점 자리가 다시 굴려진다.
 */
export const BOSS_GIMMICK_PROFILES: Partial<Record<SpecialEnemyKind, BossGimmickProfile>> = {
  // 30F 양초 백작 — 격자의 기준형. 약점과 경화가 반반이라 어디를 때릴지가 매번 선택이다.
  waxArmy: {
    cols: 3,
    rows: 3,
    slots: [
      { kind: 'weak', count: 2 },
      { kind: 'hardened', count: 2 },
    ],
    fixtures: [
      { kind: 'trap', count: 2 },
      { kind: 'treasure', count: 1 },
    ],
  },
  // 새싹 병아리 30F 미니보스. 부위 파괴를 처음 배우는 자리라 경화를 한 칸만 두고
  // 약점을 하나 더 준다 — 같은 구조를 더 관대한 배율로 먼저 겪게 한다.
  // 부가물도 한 칸씩만 둬 "지우고 때린다"를 가장 단순한 형태로 겪게 한다.
  waxCat: {
    cols: 3,
    rows: 3,
    slots: [
      { kind: 'weak', count: 3 },
      { kind: 'hardened', count: 1 },
    ],
    fixtures: [
      { kind: 'trap', count: 1 },
      { kind: 'treasure', count: 1 },
    ],
  },
  // 60F 불씨 기사단장 — 방패를 두르는 보스답게 경화가 더 많다. 약점을 찾아야만 뚫린다.
  waxKnight: {
    cols: 3,
    rows: 3,
    slots: [
      { kind: 'weak', count: 2 },
      { kind: 'hardened', count: 3 },
    ],
    fixtures: [
      { kind: 'trap', count: 3 },
      { kind: 'treasure', count: 1 },
    ],
  },
  // 90F 밀랍 조각사 — 레일 2행을 실제로 점유하므로 격자도 2×3(6칸)이다.
  // 칸이 적어 한 칸의 무게가 크다: 약점 2 / 경화 1.
  waxSculptor: {
    cols: 3,
    rows: 2,
    slots: [
      { kind: 'weak', count: 2 },
      { kind: 'hardened', count: 1 },
    ],
    fixtures: [
      { kind: 'trap', count: 2 },
      { kind: 'treasure', count: 1 },
    ],
  },
  // 100F 녹지 않는 마녀 — 3페이지에서 2×3으로 접히며 격자도 함께 줄어든다(resize).
  waxWitch: {
    cols: 3,
    rows: 3,
    slots: [
      { kind: 'weak', count: 2 },
      { kind: 'hardened', count: 3 },
    ],
    // 손패를 태우는 보스라 보물 칸이 유일한 보급선이 된다 — 함정을 뚫고 가져갈지가 선택이다.
    fixtures: [
      { kind: 'trap', count: 3 },
      { kind: 'treasure', count: 2 },
    ],
  },
  // 이벤트 보스 악마 — 등반 보스와 같은 3×3.
  waxDemon: {
    cols: 3,
    rows: 3,
    slots: [
      { kind: 'weak', count: 2 },
      { kind: 'hardened', count: 2 },
    ],
    fixtures: [
      { kind: 'trap', count: 2 },
      { kind: 'treasure', count: 1 },
    ],
  },
}

/** 칸 단위 조준이 없는 호출부(학습 시뮬 등)가 격자의 기대값만 빌려 쓰기 위한 요약. */
export interface BossGimmickExpectation {
  /** 격자 칸 수 — '필드 전체' 피해가 보스에 들어가는 횟수. */
  cells: number
  /** 칸 배율 평균 — 어느 칸에 꽂힐지 모르는 피해의 기대 배율. */
  averageMultiplier: number
  /** 최고 배율 — 약점을 노려 때리는 조준 타격의 배율. */
  bestMultiplier: number
  /** 부위 파괴 보너스를 누적 피해에 녹인 배수(`bossGimmickBreakBonusFactor`). */
  breakBonusFactor: number
  /** 함정 부가물을 이고 있는 칸 수(정원). 보스 반격마다 이 수까지 다시 찬다. */
  trapCells: number
  /** 보물 부가물을 이고 있는 칸 수(정원). */
  treasureCells: number
  /** 보물 칸 하나가 주는 손패 수. */
  treasureCards: number
}

/**
 * 보스 격자의 기대값. 실게임은 칸을 직접 골라 때리지만, 칸 개념이 없는 호출부는
 * 이 요약으로 같은 밸런스를 따라온다. 프로필이 없는 보스는 null(기믹 없음).
 *
 * `cellsOverride`는 전투 중 몸집이 바뀐 격자(마녀 3페이지 9칸 → 6칸)를 위한 것이다.
 * 특수 칸 밀도 환산은 `shuffledKinds`와 같은 식을 써서, 접힌 몸의 기대 배율이
 * 실제로 다시 굴린 격자와 어긋나지 않게 한다.
 */
export function bossGimmickExpectation(
  bossKind: SpecialEnemyKind,
  cellsOverride?: number
): BossGimmickExpectation | null {
  const profile = BOSS_GIMMICK_PROFILES[bossKind]
  if (!profile) return null
  const base = profile.cols * profile.rows
  const cells = Math.max(1, cellsOverride ?? base)
  let special = 0
  let multiplierSum = 0
  let bestMultiplier = BOSS_GIMMICK_KIND_META.plain.multiplier
  for (const slot of profile.slots) {
    // 축소/확대된 격자는 특수 칸 수를 같은 밀도로 환산한다(shuffledKinds와 같은 식).
    const scaled = cells === base ? slot.count : Math.max(1, Math.round((slot.count * cells) / base))
    const count = Math.min(scaled, cells - special)
    if (count <= 0) continue
    const { multiplier } = BOSS_GIMMICK_KIND_META[slot.kind]
    special += count
    multiplierSum += count * multiplier
    bestMultiplier = Math.max(bestMultiplier, multiplier)
  }
  // 남은 칸은 전부 plain(×1).
  multiplierSum += (cells - special) * BOSS_GIMMICK_KIND_META.plain.multiplier
  // 부가물은 배율 축이 아니라 별도 정원이다 — 특수 칸과 자리를 다투지 않는다.
  const fixtureCount = (kind: BossGimmickFixture): number => {
    const slot = profile.fixtures?.find((f) => f.kind === kind)
    if (!slot) return 0
    const scaled = cells === base ? slot.count : Math.max(1, Math.round((slot.count * cells) / base))
    return Math.min(scaled, cells)
  }
  return {
    cells,
    averageMultiplier: multiplierSum / cells,
    bestMultiplier,
    breakBonusFactor: bossGimmickBreakBonusFactor(cells),
    trapCells: fixtureCount('trap'),
    treasureCells: fixtureCount('treasure'),
    treasureCards: BOSS_GIMMICK_TREASURE_CARDS,
  }
}

/**
 * 배율 리롤에 필요한 최소 성한 칸 수. 한 칸만 남으면 섞을 것이 없다.
 */
const BOSS_GIMMICK_REROLL_MIN_CELLS = 2

/** 렌더러가 읽는 셀 스냅샷. 모델 내부 배열을 그대로 넘기지 않기 위한 읽기 전용 뷰다. */
export interface BossGimmickCellView {
  index: number
  kind: BossGimmickCellKind
  multiplier: number
  /** 이 칸에 누적된 부위 피해(배율 적용 후 기준). */
  damage: number
  /** 파괴 임계값. 조우 시작 때 보스 최대 체력에서 한 번 정해진다. */
  durability: number
  /** 0~1 손상도 — 렌더러 균열 단계의 단일 출처. */
  wear: number
  /** 파괴 여부. 깨진 칸은 조준·광역 대상에서 빠지고 화면에서도 꺼진다. */
  broken: boolean
  /** 이 칸에 얹힌 부가물(함정/보물). 없으면 null. */
  fixture: BossGimmickFixture | null
  /**
   * 이미 처리된 부가물인가(밟았거나 걷어냈다). **판정상으로는 없는 것**이지만 화면에는
   * 남아 있다 — 처리한 순간 표기가 툭 사라지면 방금 무엇을 처리했는지가 지워진다.
   * 칸이 새로 고쳐질 때(`purgeSpentFixtures`) 배율과 함께 정리된다.
   */
  fixtureSpent: boolean
  /** 함정 칸이 물릴 피해(런 보너스 제외). 표기와 판정이 같은 값을 본다. */
  trapDamage: number
}

/** 피해가 어디서 왔는가. '직접 타격 시에만' 류의 칸이 이 값을 본다. */
export type BossGimmickOrigin = 'direct' | 'hand' | 'relic' | 'other'

/** 한 번에 한 칸인가, 판 전체인가. 광역 보정/반사 기믹이 이 값을 본다. */
export type BossGimmickScope = 'single' | 'area'

/**
 * 한 번의 플레이어 행동이 격자에 남기는 출처 정보.
 *
 * 행동 **시작 시 1회** 세운다(`beginAction`). 피해 헬퍼가 40군데 넘게 흩어져 있어
 * 인자로 실어 나르면 시그니처를 전부 고쳐야 하므로, 행동 단위로 한 번 세우고
 * 타격이 알아서 집어 가는 방식을 골랐다. 세우지 않은 경로는 'other'로 남아
 * 어떤 조건부 보정도 받지 않는다(빠뜨려도 조용히 이득이 생기지 않는다).
 */
export interface BossGimmickSourceContext {
  origin: BossGimmickOrigin
  /** 손패/유물의 시너지 태그. 태그 반응형 칸이 이 목록을 본다. */
  tags: readonly SynergyTag[]
}

/** 출처를 선언하지 않은 경로의 기본값 — 조건부 보정을 아무것도 타지 않는다. */
const NEUTRAL_SOURCE: BossGimmickSourceContext = { origin: 'other', tags: [] }

/**
 * 한 대 때리는 맥락. 배율에 영향을 줄 수 있는 정보는 전부 여기로 모인다 —
 * 호출부가 채우는 것은 칸/피해/범위뿐이고, 출처·태그는 `beginAction`이 세워 둔
 * 행동 컨텍스트에서 매니저가 합쳐 넣는다.
 */
export interface BossGimmickStrikeContext {
  /** 때린 격자 칸. 없으면(키보드 조작 등) 중앙 칸으로 접는다. */
  cellIndex?: number
  /** 배율 적용 전 피해. */
  baseDamage: number
  /** 단일/광역. 생략하면 단일로 본다. */
  scope?: BossGimmickScope
}

/** resolveMultiplier가 실제로 보는 맥락 — 타격 정보 + 행동 출처를 합친 것. */
export interface BossGimmickResolvedContext extends BossGimmickStrikeContext {
  scope: BossGimmickScope
  origin: BossGimmickOrigin
  tags: readonly SynergyTag[]
}

/** 한 대 때린 결과. 배율 적용까지 끝난 최종 피해를 함께 돌려준다. */
export interface BossGimmickStrike {
  /** 때린 직후의 칸 상태. 균열/파괴 표기는 이 스냅샷을 그대로 읽는다. */
  cell: BossGimmickCellView
  /**
   * 보스가 받아야 하는 총 피해 = 칸 배율 피해 + 부위 파괴 보너스.
   * 호출부는 이 값 하나만 쓰면 되고, 아래 두 값은 수치 표기를 나누기 위한 내역이다.
   */
  damage: number
  /** 내역 — 칸 배율 피해분. */
  cellDamage: number
  /** 내역 — 부위 파괴 보너스분. 이번 타격에 깨지지 않았으면 0. */
  breakDamage: number
  /** 이번 타격으로 칸이 깨졌는가. */
  broke: boolean
  /**
   * 이 타격이 건드린 부가물. 때린 순간 칸에서 떨어져 나오고, 실제 효과(플레이어 피해 ·
   * 손패 지급)는 모델 밖에서 정산한다 — 그쪽은 배율로 표현할 수 없는 결과이기 때문이다.
   */
  fixture: BossGimmickFixture | null
}

/** 새로 돋아난 부가물 한 자리. 보스 반격 beat의 연출이 읽는다(정산 대상이 아니다). */
export interface BossGimmickFixturePlacement {
  cellIndex: number
  fixture: BossGimmickFixture
}

/** 부가물이 칸에서 떨어져 나온 한 건. 정산과 연출이 같은 목록을 읽는다. */
export interface BossGimmickFixtureEvent {
  cellIndex: number
  fixture: BossGimmickFixture
  /**
   * 어떻게 떨어졌는가. `triggered` = 때려서 발동(함정은 아프고 보물은 열린다),
   * `cleared` = 키틴·열쇠 등으로 걷어냈다(함정은 아프지 않다).
   */
  cause: 'triggered' | 'cleared'
}

/** 격자 한 칸의 내부 상태. 파생 기믹이 resolveMultiplier에서 읽을 수 있게 내보낸다. */
export interface BossGimmickCell {
  /** 이 칸만의 단단함 배수(생성 시 흩어 굴린다). 실효 내구도 = 기준 × 고조 × 이 값. */
  toughness: number
  kind: BossGimmickCellKind
  /** 누적 부위 피해. durability에 닿으면 깨진다. */
  damage: number
  broken: boolean
  /** 얹힌 부가물. 배율 축과 독립이라 리롤에도 자리를 지킨다. */
  fixture: BossGimmickFixture | null
  /** 처리됐지만 아직 화면에서 지우지 않은 상태. 판정에서는 없는 것으로 본다. */
  fixtureSpent: boolean
}

export class BossGimmickManager {
  private profile: BossGimmickProfile | null = null
  /** 현재 격자 형태. 프로필 기본값에서 시작해 `resize()`로 바뀔 수 있다. */
  private shape: { cols: number; rows: number } = { cols: 0, rows: 0 }
  private cells: BossGimmickCell[] = []
  /** 칸 하나를 깨는 데 필요한 누적 피해. 조우 시작 때 보스 최대 체력에서 정한다. */
  private durability = 0
  /** 칸 하나가 깨질 때 얹는 추가 피해. */
  private breakBonus = 0
  /** 함정 칸이 물리는 피해. 조우 시작 때 보스 공격력에서 정한다. */
  private trapBite = 0
  /**
   * 아직 정산되지 않은 부가물 사건(발동/제거). `pendingHits`와 따로 두는 이유는
   * 소비 시점이 다르기 때문이다 — 타격 기록은 **연출**이 먹고 버리지만(때로는 그냥
   * 버려진다), 부가물은 **효과**라 한 건도 잃으면 안 된다.
   */
  private pendingFixtures: BossGimmickFixtureEvent[] = []
  /**
   * 이번 beat에 어느 칸이 어떻게 맞았는지. 모델은 쌓기만 하고 소비는 `takeHits()`
   * 한 곳이다 — 연출(블라스트 목적지·피해 수치 위치·균열)이 이 기록을 읽어야
   * "어느 칸을 때렸는지"를 화면에 그릴 수 있다.
   */
  private pendingHits: BossGimmickStrike[] = []
  /** 지금 진행 중인 플레이어 행동의 출처. `beginAction`이 세우고 판정이 읽는다. */
  private source: BossGimmickSourceContext = NEUTRAL_SOURCE
  /** 행동 시작 시점의 파괴 칸 수. 한 행동이 마지막 칸까지 깨는 것을 막는 데 쓴다. */
  private brokenAtActionStart = 0

  /** rng는 테스트에서 배치를 고정하기 위해 주입한다. */
  constructor(private readonly rng: () => number = Math.random) {}

  /**
   * 플레이어 행동 시작 선언. 이 뒤의 타격은 전부 이 출처로 판정된다.
   * 타격 기록(pendingHits)은 건드리지 않는다 — 한 행동 안에서 손패가 때리고
   * 유물이 이어 때리는 경우 둘 다 같은 beat의 연출로 나가야 하기 때문이다.
   */
  beginAction(source: BossGimmickSourceContext): void {
    this.source = source
    // 이번 행동이 시작될 때의 파괴 칸 수 — "한 행동이 전부 쓸어 가지 못한다" 판정의 기준선이다.
    this.brokenAtActionStart = this.brokenCount
  }

  /** 보스 등장 시 1회. 프로필이 있는 보스만 격자를 굴리고, 켜졌는지 여부를 돌려준다. */
  beginEncounter(bossKind: SpecialEnemyKind, bossMaxHp: number, bossDamage = 0): boolean {
    const profile = BOSS_GIMMICK_PROFILES[bossKind]
    if (!profile) {
      this.reset()
      return false
    }
    this.profile = profile
    this.shape = { cols: profile.cols, rows: profile.rows }
    this.cells = this.rollCells(profile, profile.cols * profile.rows)
    this.setPool(bossMaxHp)
    this.trapBite = bossGimmickTrapDamage(bossDamage)
    this.pendingHits = []
    this.pendingFixtures = []
    this.source = NEUTRAL_SOURCE
    // 등장 시점에 부가물을 채워 둔다 — 첫 타격부터 "때릴까 지울까"가 판에 올라와야 한다.
    this.replenishFixtures()
    return true
  }

  /**
   * 전투 도중 격자 형태를 바꾼다(마녀 3페이지: 3×3 → 2×3). 몸집이 접히면 판정 칸도
   * 함께 접혀야 화면과 어긋나지 않는다.
   *
   * 칸은 **새로 굴린다** — 누적 손상·파괴를 물려받지 않는다. 몸이 바뀌었으니 부위도
   * 새로 나는 것이고, 남은 칸 수에 맞춰 약점이 다시 배치돼야 "재세팅"이 읽힌다.
   * 내구도는 **남은 체력**에서 다시 파생한다. 최대 체력 기준을 그대로 쓰면 후반
   * 페이지에서 깰 수 없는 칸이 된다("칸 절반을 깨면 쓰러진다"가 그 페이지 안에서도
   * 성립해야 한다).
   */
  resize(cols: number, rows: number, remainingHp: number): boolean {
    if (!this.profile) return false
    const cells = Math.max(1, cols * rows)
    this.shape = { cols, rows }
    this.cells = this.rollCells(this.profile, cells)
    this.setPool(remainingHp)
    this.pendingHits = []
    // 몸이 바뀌었으니 부가물도 새 칸 위에 다시 난다(정산 대기 중인 건은 남긴다).
    this.replenishFixtures()
    return true
  }

  /** 내구도·파괴 보너스를 이 격자가 갉아야 할 체력에서 파생한다. */
  private setPool(hpPool: number): void {
    const pool = Math.max(1, Math.round(hpPool))
    this.durability = bossGimmickCellDurability(pool, this.cells.length)
    this.breakBonus = bossGimmickBreakDamage(pool)
  }

  /** 격파/런 리셋 — 다음 보스가 이전 격자를 물려받지 않게 비운다. */
  reset(): void {
    this.profile = null
    this.shape = { cols: 0, rows: 0 }
    this.cells = []
    this.brokenAtActionStart = 0
    this.durability = 0
    this.breakBonus = 0
    this.trapBite = 0
    this.pendingHits = []
    this.pendingFixtures = []
    this.source = NEUTRAL_SOURCE
  }

  get isActive(): boolean {
    return this.profile !== null
  }

  get cols(): number {
    return this.shape.cols
  }

  get rows(): number {
    return this.shape.rows
  }

  /** 프로필이 정한 기본 행 수. 몸집이 원래대로 돌아왔을 때 되돌릴 기준이다. */
  get profileRows(): number {
    return this.profile?.rows ?? 0
  }

  getCells(): BossGimmickCellView[] {
    return this.cells.map((_, index) => this.viewAt(index))
  }

  get cellCount(): number {
    return this.cells.length
  }

  /** 깨진 칸 수 — 부위 파괴 진행도 표기/로그가 읽는다. */
  get brokenCount(): number {
    return this.cells.reduce((n, cell) => n + (cell.broken ? 1 : 0), 0)
  }

  /** 칸마다 흩어 굴리는 단단함 배수. */
  private rollToughness(): number {
    return BOSS_GIMMICK_TOUGHNESS_MIN + this.rng() * (BOSS_GIMMICK_TOUGHNESS_MAX - BOSS_GIMMICK_TOUGHNESS_MIN)
  }

  /**
   * 이 칸을 깨는 데 실제로 필요한 누적 피해. 기준 내구도에 **칸 고유의 단단함**과
   * **지금까지 깬 칸 수만큼의 고조**를 곱한다 — 깨질수록 남은 칸이 버틴다.
   */
  private durabilityOf(cell: BossGimmickCell): number {
    const escalation = 1 + this.brokenCount * BOSS_GIMMICK_DURABILITY_ESCALATION
    const spread = bossGimmickCellSpreadFactor(this.cells.length)
    return Math.max(1, Math.round((this.durability * escalation * cell.toughness) / spread))
  }

  /** 칸 하나를 깨는 데 필요한 누적 피해(기준값 — 칸별 단단함/고조 적용 전). */
  get cellDurability(): number {
    return this.durability
  }

  /** 칸 하나가 깨질 때의 추가 피해. */
  get breakDamage(): number {
    return this.breakBonus
  }

  /** 배율을 다시 굴릴 수 있는가. 성한 칸이 둘 미만이면 섞을 것이 없다. */
  canReroll(): boolean {
    return this.profile !== null && this.livingIndexes().length >= BOSS_GIMMICK_REROLL_MIN_CELLS
  }

  /**
   * 성한 칸의 배율만 다시 굴린다. 누적 부위 피해와 파괴 상태는 그대로 남는다.
   *
   * 배율이 고정이면 약점 한 칸을 파먹는 게 최적해가 되고, 부위 파괴만으로는
   * 그 유혹을 절반밖에 못 막는다. 타격마다 배율이 옮겨 다니면 "조금 때려 둔 칸을
   * 마저 깨서 파괴 보너스를 받을지, 새로 뜬 약점을 노릴지"가 매번 선택으로 남는다.
   *
   * 깨진 칸은 후보에서 빠지므로 특수 칸 수는 성한 칸 수에 맞춰 자연히 줄어든다
   * (9칸 프로필의 약점 2칸을 남은 7칸에 그대로 얹지 않는다).
   *
   * **부가물(함정/보물)은 자리를 지킨다.** 배율과 함께 굴러다니면 "이 함정을 지우고
   * 때린다"는 계획이 매 타격마다 무효가 되고, 지우는 손패가 도박이 된다.
   */
  rerollKinds(): boolean {
    if (!this.profile || !this.canReroll()) return false
    const kinds = this.shuffledKinds(this.profile, this.cells.length)
    this.livingIndexes().forEach((index, slot) => {
      this.cells[index].kind = kinds[slot]
    })
    return true
  }

  /** 아직 연출로 소비되지 않은 칸 타격이 있는가. 피해 0으로 막힌 beat를 가려내는 데 쓴다. */
  get hasPendingHits(): boolean {
    return this.pendingHitCount > 0
  }

  /** 이번 beat가 칸을 몇 개 때렸는가. 연출이 단일 타격과 광역을 가르는 데 쓴다. */
  get pendingHitCount(): number {
    return this.pendingHits.length
  }

  /** 이번 beat에 쌓인 타격 기록을 가져가며 비운다. 연출 쪽 유일한 소비 창구다. */
  takeHits(): BossGimmickStrike[] {
    const hits = this.pendingHits
    this.pendingHits = []
    return hits
  }

  /** 함정 칸이 물리는 피해(런 보너스 제외). 표기와 판정의 단일 출처다. */
  get trapDamage(): number {
    return this.trapBite
  }

  /** 정산 대기 중인 부가물 사건이 있는가. */
  get hasPendingFixtures(): boolean {
    return this.pendingFixtures.length > 0
  }

  /**
   * 떨어져 나온 부가물을 가져가며 비운다. **효과 정산의 유일한 소비 창구**다 —
   * 연출용 `takeHits()`와 달리 그냥 버리는 경로를 만들지 않는다.
   */
  takeFixtureEvents(): BossGimmickFixtureEvent[] {
    const events = this.pendingFixtures
    this.pendingFixtures = []
    return events
  }

  /** 지금 이 칸에 **살아 있는** 부가물. 처리된 것은 화면에만 남아 있으므로 null이다. */
  fixtureAt(cellIndex: number): BossGimmickFixture | null {
    const cell = this.cells[cellIndex]
    return cell && !cell.broken && !cell.fixtureSpent ? cell.fixture : null
  }

  /** 해당 부가물을 이고 있는 성한 칸의 인덱스 목록(처리된 것은 빠진다). */
  fixtureCells(fixture: BossGimmickFixture): number[] {
    const out: number[] = []
    this.cells.forEach((cell, index) => {
      if (!cell.broken && !cell.fixtureSpent && cell.fixture === fixture) out.push(index)
    })
    return out
  }

  /**
   * 처리된 부가물 표기를 걷어낸다 — **칸이 새로 고쳐지는 beat에** 부른다.
   *
   * 처리하는 순간 표기를 지우면 방금 무엇을 밟았는지·주웠는지가 화면에서 사라진다.
   * 효과 연출이 끝난 뒤 배율 리롤과 같은 박자에 정리해야 "이 칸을 처리했다"가 읽힌다.
   * 처리하지 않은 부가물은 그대로 남는다 — 규칙이 아니라 **사라지는 시점**만 맞추는 것이다.
   */
  purgeSpentFixtures(): number {
    let purged = 0
    for (const cell of this.cells) {
      if (!cell.fixtureSpent) continue
      cell.fixture = null
      cell.fixtureSpent = false
      purged++
    }
    return purged
  }

  /**
   * 부가물을 **때리지 않고** 걷어낸다(키틴으로 함정 제거 · 열쇠로 보물 수거).
   * 이 경로로 걷힌 함정은 아프지 않다 — 그게 지우는 값어치다.
   * 기대한 종류와 다르면 아무것도 하지 않는다(엉뚱한 카드가 보물을 지우지 않게).
   */
  clearFixtureAt(cellIndex: number, expect?: BossGimmickFixture): BossGimmickFixture | null {
    const cell = this.cells[cellIndex]
    if (!cell || cell.broken || !cell.fixture || cell.fixtureSpent) return null
    if (expect && cell.fixture !== expect) return null
    const fixture = cell.fixture
    // 표기는 남기고 판정에서만 뺀다 — 화면에서 지우는 것은 칸 새로고침 beat의 일이다.
    cell.fixtureSpent = true
    this.pendingFixtures.push({ cellIndex, fixture, cause: 'cleared' })
    return fixture
  }

  /** 격자 전체에서 해당 부가물을 걷어낸다(광역 청소·트리플 열쇠). 걷힌 칸 수를 돌려준다. */
  clearFixtures(fixture: BossGimmickFixture, limit = Infinity): number {
    let cleared = 0
    for (const index of this.fixtureCells(fixture)) {
      if (cleared >= limit) break
      if (this.clearFixtureAt(index, fixture)) cleared++
    }
    return cleared
  }

  /**
   * 부가물을 프로필 정원까지 다시 채운다 — **보스가 때리는 beat에 한 번**만 부른다.
   *
   * 타격마다 채우면 키틴으로 지우는 의미가 사라지고 보물도 무한 보급이 된다.
   * 반격 주기에 묶어 두면 "이번 주기 동안은 지운 만큼 편하다"가 성립한다.
   * 새 부가물은 **비어 있는 성한 칸**에만 나므로, 이미 얹힌 칸을 덮어쓰지 않는다.
   */
  replenishFixtures(): BossGimmickFixturePlacement[] {
    if (!this.profile?.fixtures) return []
    // 처리된 표기가 남아 있으면 먼저 정리한다 — 그 자리도 새 부가물이 돋을 빈 칸이다.
    this.purgeSpentFixtures()
    const placed: BossGimmickFixturePlacement[] = []
    // 빈 칸을 섞어 두고 앞에서부터 꺼낸다 — 같은 자리에 계속 나면 배치를 외워 쓰게 된다.
    const free = this.shuffle(
      this.cells.reduce<number[]>((out, cell, index) => {
        if (!cell.broken && !cell.fixture) out.push(index)
        return out
      }, [])
    )
    for (const slot of this.profile.fixtures) {
      const want = this.scaledCount(slot.count)
      const have = this.fixtureCells(slot.kind).length
      for (let i = have; i < want; i++) {
        const index = free.pop()
        if (index === undefined) return placed
        this.cells[index].fixture = slot.kind
        placed.push({ cellIndex: index, fixture: slot.kind })
      }
    }
    return placed
  }

  /**
   * 격자 한 칸을 때린다. 배율을 적용한 피해를 돌려준다.
   * 격자가 없거나 성한 칸이 하나도 안 남았으면 null — 호출부는 기존 피해를 그대로 쓰면 된다.
   */
  strike(ctx: BossGimmickStrikeContext): BossGimmickStrike | null {
    if (!this.profile || this.cells.length === 0) return null
    const index = this.normalizeIndex(ctx.cellIndex)
    if (index === null) return null
    return this.strikeAt(index, ctx)
  }

  /**
   * 무작위 칸 하나를 때린다. 폭죽처럼 필드에 되는대로 꽂히는 효과가 쓴다 —
   * 운 좋게 약점에 꽂히면 그만큼 이득이다. 깨진 칸에는 꽂히지 않는다.
   */
  strikeRandomCell(baseDamage: number): BossGimmickStrike | null {
    if (!this.profile) return null
    const living = this.livingIndexes()
    if (living.length === 0) return null
    const pick = living[Math.min(Math.floor(this.rng() * living.length), living.length - 1)]
    return this.strikeAt(pick, { cellIndex: pick, baseDamage })
  }

  /**
   * 성한 칸을 한 번씩 때린다. 보스가 판을 통째로 차지하는 만큼 '필드 전체' 피해는
   * 칸 수만큼 들어간다(칸별 배율은 각자 적용). 부위를 깨 나갈수록 광역기도 함께 얇아진다.
   */
  strikeAllCells(baseDamage: number): BossGimmickStrike[] {
    if (!this.profile) return []
    return this.livingIndexes().map((index) =>
      this.strikeAt(index, { cellIndex: index, baseDamage, scope: 'area' })
    )
  }

  /** 칸 인덱스 확정 후 공통 처리 — 배율 + 부위 누적 + 파괴 판정의 단일 경로. */
  private strikeAt(index: number, ctx: BossGimmickStrikeContext): BossGimmickStrike {
    const cell = this.cells[index]
    const multiplier = this.resolveMultiplier(cell, {
      ...ctx,
      scope: ctx.scope ?? 'single',
      origin: this.source.origin,
      tags: this.source.tags,
    })
    const cellDamage = this.applyMultiplier(ctx.baseDamage, multiplier)
    // 부위 누적은 '배율을 먹인 뒤'의 피해로 쌓는다. 약점은 두 배로 빨리 깨져 한 칸만
    // 파먹을 수 없고, 경화는 같은 보너스를 얻는 데 두 배의 품이 든다.
    let breakDamage = 0
    if (cellDamage > 0 && !cell.broken) {
      const limit = this.durabilityOf(cell)
      cell.damage = Math.min(limit, cell.damage + cellDamage)
      if (cell.damage >= limit) {
        // ★ **한 행동이 격자를 통째로 쓸어 가지 못한다.** 이미 이번 행동에서 다른 칸을
        //   깼는데 이게 마지막 성한 칸이면, 파괴 직전에서 버틴다 — 광역 한 방에 때릴
        //   자리가 사라지는 일이 없어야 한다. 다음 행동에서 단독으로 때리면 깨지므로
        //   '부위를 하나 더 깨야 열리는' 페이지 리미트가 막히지도 않는다.
        const lastStanding = this.livingIndexes().length <= 1
        if (lastStanding && this.brokenCount > this.brokenAtActionStart) {
          cell.damage = Math.max(0, limit - 1)
        } else {
          cell.broken = true
          breakDamage = this.breakBonus
        }
      }
    }
    // 부가물은 **때린 그 자리에서** 떨어져 나온다. 피해가 0으로 막힌 beat(리미트 페이지)에도
    // 밟은 것은 밟은 것이라 그대로 발동한다 — 안 그러면 함정 칸이 안전지대가 된다.
    const fixture = cell.fixtureSpent ? null : cell.fixture
    if (fixture) {
      // 표기는 남긴다 — 때린 칸에 무엇이 얹혀 있었는지가 연출이 끝날 때까지 보여야 한다.
      cell.fixtureSpent = true
      this.pendingFixtures.push({ cellIndex: index, fixture, cause: 'triggered' })
    }
    const strike: BossGimmickStrike = {
      // 뷰는 부가물을 떼어 낸 뒤 찍는다 — 연출은 '이제 비어 있는 칸'을 그려야 한다.
      cell: this.viewAt(index),
      damage: cellDamage + breakDamage,
      cellDamage,
      breakDamage,
      broke: breakDamage > 0,
      fixture,
    }
    this.pendingHits.push(strike)
    return strike
  }

  /** 깨지지 않은 칸의 인덱스 목록. 조준·무작위·광역이 모두 이 목록 안에서만 움직인다. */
  private livingIndexes(): number[] {
    const living: number[] = []
    this.cells.forEach((cell, index) => {
      if (!cell.broken) living.push(index)
    })
    return living
  }

  /** 칸 하나의 읽기 전용 스냅샷. */
  private viewAt(index: number): BossGimmickCellView {
    const cell = this.cells[index]
    return {
      index,
      kind: cell.kind,
      multiplier: BOSS_GIMMICK_KIND_META[cell.kind].multiplier,
      damage: cell.damage,
      durability: this.durabilityOf(cell),
      wear: (() => { const d = this.durabilityOf(cell); return d > 0 ? Math.min(1, cell.damage / d) : 0 })(),
      broken: cell.broken,
      // 깨진 칸은 부가물도 함께 사라진다 — 판이 타 버렸는데 함정만 남을 수는 없다.
      fixture: cell.broken ? null : cell.fixture,
      fixtureSpent: cell.fixtureSpent,
      trapDamage: this.trapBite,
    }
  }

  /**
   * 칸 배율 결정의 유일한 창구. 태그/출처/범위 반응은 전부 여기로 들어온다.
   * protected인 이유: 파생 기믹과 테스트가 이 한 지점만 갈아 끼우면 되도록 —
   * 판정이 여러 곳으로 흩어지는 것을 막는 것이 이 클래스의 핵심 계약이다.
   */
  protected resolveMultiplier(cell: BossGimmickCell, _ctx: BossGimmickResolvedContext): number {
    return BOSS_GIMMICK_KIND_META[cell.kind].multiplier
  }

  /** 배율 적용. 0 피해로 내려가 공격이 무의미해지지 않도록 최소 1은 남긴다. */
  private applyMultiplier(baseDamage: number, multiplier: number): number {
    if (baseDamage <= 0) return baseDamage
    return Math.max(1, Math.round(baseDamage * multiplier))
  }

  /**
   * 범위를 벗어나거나 없는 인덱스는 중앙에 가장 가까운 성한 칸으로 접는다.
   * 깨진 칸을 겨눈 경우도 같은 규칙으로 살아 있는 칸에 흘려보낸다 — 화면에서
   * 꺼진 칸을 때려 피해가 사라지는 일이 없게 한다. 성한 칸이 없으면 null.
   */
  private normalizeIndex(cellIndex: number | undefined): number | null {
    const living = this.livingIndexes()
    if (living.length === 0) return null
    if (cellIndex !== undefined && Number.isInteger(cellIndex) && living.includes(cellIndex)) {
      return cellIndex
    }
    const center = Math.floor(this.cells.length / 2)
    return living.reduce((best, i) => (Math.abs(i - center) < Math.abs(best - center) ? i : best), living[0])
  }

  /** 배치표대로 특수 칸을 만들고 plain으로 채운 뒤 위치를 섞는다. 부가물은 비운 채 시작해
   *  `replenishFixtures()`가 얹는다 — 배치 규칙을 두 곳에 적지 않기 위함이다. */
  private rollCells(profile: BossGimmickProfile, cells: number): BossGimmickCell[] {
    return this.shuffledKinds(profile, cells).map((kind) => ({
      kind,
      toughness: this.rollToughness(),
      damage: 0,
      broken: false,
      fixture: null,
      fixtureSpent: false,
    }))
  }

  /**
   * 배치 수를 현재 칸 수에 맞게 환산한다(축소된 격자에서 밀도를 유지).
   * `shuffledKinds`가 특수 칸에 쓰는 식과 같은 것을 부가물도 쓴다.
   */
  private scaledCount(count: number): number {
    const base = Math.max(1, (this.profile?.cols ?? 1) * (this.profile?.rows ?? 1))
    const total = Math.max(1, this.cells.length)
    return total === base ? count : Math.max(1, Math.round((count * total) / base))
  }

  /** Fisher-Yates. 배치가 매번 달라져 자리를 외워 쓸 수 없게 한다. */
  private shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1))
      ;[items[i], items[j]] = [items[j], items[i]]
    }
    return items
  }

  /**
   * 배치표를 주어진 칸 수만큼 펼쳐 섞은 목록. 조우 시작 배치·타격 후 리롤·격자 축소가
   * 같은 분포를 쓰도록 한 곳에 둔다.
   *
   * 칸 수가 프로필 기본형과 다르면(축소된 격자) 특수 칸 수를 **같은 밀도로 환산**한다 —
   * 9칸의 약점 2를 6칸에 그대로 얹으면 접힌 몸이 오히려 물러진다.
   */
  private shuffledKinds(profile: BossGimmickProfile, cells: number): BossGimmickCellKind[] {
    const total = Math.max(1, cells)
    const base = Math.max(1, profile.cols * profile.rows)
    const kinds: BossGimmickCellKind[] = []
    for (const slot of profile.slots) {
      const scaled = total === base ? slot.count : Math.max(1, Math.round((slot.count * total) / base))
      for (let i = 0; i < scaled && kinds.length < total; i++) kinds.push(slot.kind)
    }
    while (kinds.length < total) kinds.push('plain')
    // 매 조우마다 약점 자리가 달라져 배치를 외워 쓸 수 없다.
    return this.shuffle(kinds)
  }
}
