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
 * 확장 지점: 칸 판정을 태그/시너지와 엮을 때는 resolveMultiplier() 하나만 늘린다.
 * 피해 소스의 정보는 전부 BossGimmickStrikeContext로 들어오므로, 손패 synergyTags나
 * 유물 반응을 붙여도 호출부 시그니처가 흔들리지 않는다. 배율 계산이 이 함수
 * 바깥으로 새면 그 순간 태그 반응이 닿지 않는 사각지대가 생기니 넣지 말 것.
 */

import type { SpecialEnemyKind } from '@entities/Card'

/** 격자 한 칸의 성격. plain은 배율 없는 평범한 칸이다. */
export type BossGimmickCellKind = 'plain' | 'weak' | 'hardened'

/** 특수 칸 종류(= plain을 뺀 나머지). 프로필 배치표가 쓴다. */
export type BossGimmickSpecialKind = Exclude<BossGimmickCellKind, 'plain'>

export interface BossGimmickKindMeta {
  /** 칸에 표시할 짧은 이름. plain은 빈 문자열이라 아무것도 적지 않는다. */
  label: string
  /** 직접 공격 피해 배율. */
  multiplier: number
}

/** 칸 성격별 수치/표기의 단일 출처 — 밸런싱은 여기만 고친다. */
export const BOSS_GIMMICK_KIND_META: Record<BossGimmickCellKind, BossGimmickKindMeta> = {
  plain: { label: '', multiplier: 1 },
  weak: { label: '약점', multiplier: 2 },
  hardened: { label: '경화', multiplier: 0.5 },
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
 * 보스별 기믹 격자 프로필. 여기 없는 보스는 기존처럼 큰 칸 1개 그대로 동작한다.
 * 30F 양초 백작만 임시 테스트로 3×3 격자를 켠다.
 *
 * 주의: 격자는 보스 타일 1개 위에 깔린다. 90F 조각사처럼 occupiedDistRows가 2 이상인
 * 보스는 레일이 행마다 별도 타일을 그리므로, 프로필을 켜기 전에 렌더 쪽에서
 * 행별 오프셋(어느 타일이 격자의 몇 번째 행인지)을 먼저 정해야 한다.
 */
export const BOSS_GIMMICK_PROFILES: Partial<Record<SpecialEnemyKind, BossGimmickProfile>> = {
  waxArmy: {
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
 */
export function bossGimmickExpectation(bossKind: SpecialEnemyKind): BossGimmickExpectation | null {
  const profile = BOSS_GIMMICK_PROFILES[bossKind]
  if (!profile) return null
  const cells = profile.cols * profile.rows
  let special = 0
  let multiplierSum = 0
  let bestMultiplier = BOSS_GIMMICK_KIND_META.plain.multiplier
  for (const slot of profile.slots) {
    const count = Math.min(slot.count, cells - special)
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

/**
 * 한 대 때리는 맥락. 배율에 영향을 줄 수 있는 정보는 전부 여기로 모은다 —
 * 나중에 손패/유물 태그 반응을 붙일 때 이 객체에 필드를 더하면 되고,
 * 호출부 시그니처는 그대로 둘 수 있다.
 */
export interface BossGimmickStrikeContext {
  /** 때린 격자 칸. 없으면(키보드 조작 등) 중앙 칸으로 접는다. */
  cellIndex?: number
  /** 배율 적용 전 피해. */
  baseDamage: number
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

interface BossGimmickCell {
  kind: BossGimmickCellKind
  /** 누적 부위 피해. durability에 닿으면 깨진다. */
  damage: number
  broken: boolean
}

export class BossGimmickManager {
  private profile: BossGimmickProfile | null = null
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

  /** rng는 테스트에서 배치를 고정하기 위해 주입한다. */
  constructor(private readonly rng: () => number = Math.random) {}

  /** 보스 등장 시 1회. 프로필이 있는 보스만 격자를 굴리고, 켜졌는지 여부를 돌려준다. */
  beginEncounter(bossKind: SpecialEnemyKind, bossMaxHp: number): boolean {
    const profile = BOSS_GIMMICK_PROFILES[bossKind]
    if (!profile) {
      this.reset()
      return false
    }
    this.profile = profile
    this.cells = this.rollCells(profile)
    this.durability = bossGimmickCellDurability(bossMaxHp, this.cells.length)
    this.breakBonus = bossGimmickBreakDamage(bossMaxHp)
    this.pendingHits = []
    return true
  }

  /** 격파/런 리셋 — 다음 보스가 이전 격자를 물려받지 않게 비운다. */
  reset(): void {
    this.profile = null
    this.cells = []
    this.durability = 0
    this.breakBonus = 0
    this.pendingHits = []
  }

  get isActive(): boolean {
    return this.profile !== null
  }

  get cols(): number {
    return this.profile?.cols ?? 0
  }

  get rows(): number {
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
    return this.livingIndexes().map((index) => this.strikeAt(index, { cellIndex: index, baseDamage }))
  }

  /** 칸 인덱스 확정 후 공통 처리 — 배율 + 부위 누적 + 파괴 판정의 단일 경로. */
  private strikeAt(index: number, ctx: BossGimmickStrikeContext): BossGimmickStrike {
    const cell = this.cells[index]
    const multiplier = this.resolveMultiplier(cell, ctx)
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

  /** 칸 배율 결정의 유일한 창구. 태그/시너지 보정은 전부 여기로 들어온다. */
  private resolveMultiplier(cell: BossGimmickCell, _ctx: BossGimmickStrikeContext): number {
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
  private rollCells(profile: BossGimmickProfile): BossGimmickCell[] {
    const total = profile.cols * profile.rows
    const kinds: BossGimmickCellKind[] = []
    for (const slot of profile.slots) {
      for (let i = 0; i < slot.count && kinds.length < total; i++) kinds.push(slot.kind)
    }
    while (kinds.length < total) kinds.push('plain')
    // Fisher-Yates — 매 조우마다 약점 자리가 달라져 배치를 외워 쓸 수 없다.
    for (let i = kinds.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1))
      ;[kinds[i], kinds[j]] = [kinds[j], kinds[i]]
    }
    return kinds.map((kind) => ({ kind, damage: 0, broken: false }))
  }
}
