/**
 * BossGimmickManager — 큰 칸 하나로 그려지는 보스 위에 겹치는 "투명 기믹 격자".
 *
 * 보스는 화면상 3×3(90F는 2행 6칸)을 통째로 차지하는 단일 Card지만, 전투 기믹까지
 * 1칸으로 취급할 이유는 없다. 이 매니저가 그 위에 다시 격자를 깔아 칸 단위 판정을
 * 소유한다 — 지금은 칸마다 피해 배율(약점/경화)을 주는 기믹 하나뿐이지만,
 * 보스별 프로필만 늘리면 다른 칸 기믹도 같은 격자에 얹을 수 있다.
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
  /** 칸이 드러났을 때 표시할 짧은 이름. */
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
  /** 최고 배율 — 드러난 약점을 노려 때리는 조준 타격의 배율. */
  bestMultiplier: number
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
  return { cells, averageMultiplier: multiplierSum / cells, bestMultiplier }
}

/** 렌더러가 읽는 셀 스냅샷. 모델 내부 배열을 그대로 넘기지 않기 위한 읽기 전용 뷰다. */
export interface BossGimmickCellView {
  index: number
  kind: BossGimmickCellKind
  multiplier: number
  /** 한 번이라도 때려 정체가 드러났는지 — 드러난 칸만 표식을 보여 준다. */
  revealed: boolean
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
  cell: BossGimmickCellView
  /** 배율을 적용한 최종 피해. */
  damage: number
  /** 이번 타격으로 처음 정체가 드러났는지 — 안내 문구를 1회만 띄우기 위해 쓴다. */
  firstReveal: boolean
}

interface BossGimmickCell {
  kind: BossGimmickCellKind
  revealed: boolean
}

export class BossGimmickManager {
  private profile: BossGimmickProfile | null = null
  private cells: BossGimmickCell[] = []

  /** rng는 테스트에서 배치를 고정하기 위해 주입한다. */
  constructor(private readonly rng: () => number = Math.random) {}

  /** 보스 등장 시 1회. 프로필이 있는 보스만 격자를 굴리고, 켜졌는지 여부를 돌려준다. */
  beginEncounter(bossKind: SpecialEnemyKind): boolean {
    const profile = BOSS_GIMMICK_PROFILES[bossKind]
    if (!profile) {
      this.reset()
      return false
    }
    this.profile = profile
    this.cells = this.rollCells(profile)
    return true
  }

  /** 격파/런 리셋 — 다음 보스가 이전 격자를 물려받지 않게 비운다. */
  reset(): void {
    this.profile = null
    this.cells = []
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
    return this.cells.map((cell, index) => ({
      index,
      kind: cell.kind,
      multiplier: BOSS_GIMMICK_KIND_META[cell.kind].multiplier,
      revealed: cell.revealed,
    }))
  }

  get cellCount(): number {
    return this.cells.length
  }

  /**
   * 격자 한 칸을 때린다. 배율을 적용한 피해를 돌려주고 그 칸을 영구히 드러낸다.
   * 격자가 없으면 null — 호출부는 기존 피해를 그대로 쓰면 된다.
   */
  strike(ctx: BossGimmickStrikeContext): BossGimmickStrike | null {
    if (!this.profile || this.cells.length === 0) return null
    return this.strikeAt(this.normalizeIndex(ctx.cellIndex), ctx)
  }

  /**
   * 무작위 칸 하나를 때린다. 폭죽처럼 필드에 되는대로 꽂히는 효과가 쓴다 —
   * 운 좋게 약점에 꽂히면 그만큼 이득이다.
   */
  strikeRandomCell(baseDamage: number): BossGimmickStrike | null {
    if (!this.profile || this.cells.length === 0) return null
    const index = Math.floor(this.rng() * this.cells.length)
    return this.strikeAt(Math.min(index, this.cells.length - 1), { cellIndex: index, baseDamage })
  }

  /**
   * 모든 칸을 한 번씩 때린다. 보스가 판을 통째로 차지하는 만큼,
   * '필드 전체' 피해는 칸 수만큼 들어간다(칸별 배율은 각자 적용).
   */
  strikeAllCells(baseDamage: number): BossGimmickStrike[] {
    if (!this.profile || this.cells.length === 0) return []
    return this.cells.map((_, index) => this.strikeAt(index, { cellIndex: index, baseDamage }))
  }

  /** 칸 인덱스 확정 후 공통 처리 — 드러냄 + 배율 + 피해 환산의 단일 경로. */
  private strikeAt(index: number, ctx: BossGimmickStrikeContext): BossGimmickStrike {
    const cell = this.cells[index]
    const firstReveal = !cell.revealed
    cell.revealed = true
    const multiplier = this.resolveMultiplier(cell, ctx)
    return {
      cell: { index, kind: cell.kind, multiplier, revealed: true },
      damage: this.applyMultiplier(ctx.baseDamage, multiplier),
      firstReveal,
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

  /** 범위를 벗어나거나 없는 인덱스는 중앙 칸으로 접는다. */
  private normalizeIndex(cellIndex: number | undefined): number {
    if (cellIndex === undefined || !Number.isInteger(cellIndex)) return Math.floor(this.cells.length / 2)
    if (cellIndex < 0 || cellIndex >= this.cells.length) return Math.floor(this.cells.length / 2)
    return cellIndex
  }

  /** 배치표대로 특수 칸을 만들고 plain으로 채운 뒤 위치를 섞는다. */
  private rollCells(profile: BossGimmickProfile): BossGimmickCell[] {
    const total = profile.cols * profile.rows
    const kinds: BossGimmickCellKind[] = []
    for (const slot of profile.slots) {
      for (let i = 0; i < slot.count && kinds.length < total; i++) kinds.push(slot.kind)
    }
    while (kinds.length < total) kinds.push('plain')
    // Fisher-Yates — 매 조우마다 약점 자리가 달라져 매번 새로 찾아내야 한다.
    for (let i = kinds.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1))
      ;[kinds[i], kinds[j]] = [kinds[j], kinds[i]]
    }
    return kinds.map((kind) => ({ kind, revealed: false }))
  }
}
