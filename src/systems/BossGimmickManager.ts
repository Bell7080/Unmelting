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

/** 균열 표기 단계 수. 0 = 멀쩡, 이 값 = 파괴 직전. 렌더러가 금 개수를 고르는 기준이다. */
export const BOSS_GIMMICK_CRACK_STAGES = 3

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
  },
  // 새싹 병아리 30F 미니보스. 부위 파괴를 처음 배우는 자리라 경화를 한 칸만 두고
  // 약점을 하나 더 준다 — 같은 구조를 더 관대한 배율로 먼저 겪게 한다.
  waxCat: {
    cols: 3,
    rows: 3,
    slots: [
      { kind: 'weak', count: 3 },
      { kind: 'hardened', count: 1 },
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
  },
  // 100F 녹지 않는 마녀 — 3페이지에서 2×3으로 접히며 격자도 함께 줄어든다(resize).
  waxWitch: {
    cols: 3,
    rows: 3,
    slots: [
      { kind: 'weak', count: 2 },
      { kind: 'hardened', count: 3 },
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
  return {
    cells,
    averageMultiplier: multiplierSum / cells,
    bestMultiplier,
    breakBonusFactor: bossGimmickBreakBonusFactor(cells),
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
}

/** 격자 한 칸의 내부 상태. 파생 기믹이 resolveMultiplier에서 읽을 수 있게 내보낸다. */
export interface BossGimmickCell {
  kind: BossGimmickCellKind
  /** 누적 부위 피해. durability에 닿으면 깨진다. */
  damage: number
  broken: boolean
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
  /**
   * 이번 beat에 어느 칸이 어떻게 맞았는지. 모델은 쌓기만 하고 소비는 `takeHits()`
   * 한 곳이다 — 연출(블라스트 목적지·피해 수치 위치·균열)이 이 기록을 읽어야
   * "어느 칸을 때렸는지"를 화면에 그릴 수 있다.
   */
  private pendingHits: BossGimmickStrike[] = []
  /** 지금 진행 중인 플레이어 행동의 출처. `beginAction`이 세우고 판정이 읽는다. */
  private source: BossGimmickSourceContext = NEUTRAL_SOURCE

  /** rng는 테스트에서 배치를 고정하기 위해 주입한다. */
  constructor(private readonly rng: () => number = Math.random) {}

  /**
   * 플레이어 행동 시작 선언. 이 뒤의 타격은 전부 이 출처로 판정된다.
   * 타격 기록(pendingHits)은 건드리지 않는다 — 한 행동 안에서 손패가 때리고
   * 유물이 이어 때리는 경우 둘 다 같은 beat의 연출로 나가야 하기 때문이다.
   */
  beginAction(source: BossGimmickSourceContext): void {
    this.source = source
  }

  /** 보스 등장 시 1회. 프로필이 있는 보스만 격자를 굴리고, 켜졌는지 여부를 돌려준다. */
  beginEncounter(bossKind: SpecialEnemyKind, bossMaxHp: number): boolean {
    const profile = BOSS_GIMMICK_PROFILES[bossKind]
    if (!profile) {
      this.reset()
      return false
    }
    this.profile = profile
    this.shape = { cols: profile.cols, rows: profile.rows }
    this.cells = this.rollCells(profile, profile.cols * profile.rows)
    this.setPool(bossMaxHp)
    this.pendingHits = []
    this.source = NEUTRAL_SOURCE
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
    this.durability = 0
    this.breakBonus = 0
    this.pendingHits = []
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

  /** 칸 하나를 깨는 데 필요한 누적 피해. */
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
    return this.pendingHits.length > 0
  }

  /** 이번 beat에 쌓인 타격 기록을 가져가며 비운다. 연출 쪽 유일한 소비 창구다. */
  takeHits(): BossGimmickStrike[] {
    const hits = this.pendingHits
    this.pendingHits = []
    return hits
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
      cell.damage = Math.min(this.durability, cell.damage + cellDamage)
      if (cell.damage >= this.durability) {
        cell.broken = true
        breakDamage = this.breakBonus
      }
    }
    const strike: BossGimmickStrike = {
      cell: this.viewAt(index),
      damage: cellDamage + breakDamage,
      cellDamage,
      breakDamage,
      broke: breakDamage > 0,
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
      durability: this.durability,
      wear: this.durability > 0 ? Math.min(1, cell.damage / this.durability) : 0,
      broken: cell.broken,
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

  /** 배치표대로 특수 칸을 만들고 plain으로 채운 뒤 위치를 섞는다. */
  private rollCells(profile: BossGimmickProfile, cells: number): BossGimmickCell[] {
    return this.shuffledKinds(profile, cells).map((kind) => ({ kind, damage: 0, broken: false }))
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
    // Fisher-Yates — 매 조우마다 약점 자리가 달라져 배치를 외워 쓸 수 없다.
    for (let i = kinds.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1))
      ;[kinds[i], kinds[j]] = [kinds[j], kinds[i]]
    }
    return kinds
  }
}
