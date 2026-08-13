/**
 * 밀랍상(蠟像) — 적을 봉인해 모으는 계정 전체(런을 넘는) 수집 시스템.
 * 새싹 병아리부터 처음부터 열려 있다(별도 마일스톤 게이트 없음). 처치 시 낮은 확률로
 * 종별 밀랍상을 얻는다. 같은 종+색을 3개 모으면 다음
 * 성급으로 합성할 수 있고(플레이어가 직접 하는 동작 — 자동 합성 없음), 성급이 오를수록
 * 그 종의 **확률형 페시브 효과**가 강해진다 — 체력+5·공격력+1 같은 직접 스탯은 절대
 * 주지 않는다(밸런스 파괴). 확률은 방어구 감쇠 공식과 같은 수렴형이라 아무리 모아도
 * 상한을 넘지 않는다.
 *
 * ★ 봉인은 **자리가 있으면 곧장 영구 밀랍상함에 들어간다.** 한도를 넘겼을 때만 임시보관함
 * (run hold, 메모리 전용·저장 안 함)으로 흘러 들어간다 — 정상적으로는 신경 쓸 일이 없고,
 * 밀랍상함이 가득 찬 순간에만 "넘친 몫"이 생긴다. 정리(합성/버리기로 자리를 만든 뒤 옮기기)
 * 하지 않고 런이 끝나면 임시보관함 내용은 전부 사라진다 — 한도 초과로 이로치가 그 자리에서
 * 소멸하는 억울한 상황을 막기 위한 안전판이다.
 *
 * 게이팅(가입 게이트)은 이 모듈이 하지 않는다 — `hasFirstSeen('gray-shackle-unlocked')`
 * 확인은 호출부(index.ts) 책임이고, 이 모듈은 순수 저장/판정 로직만 담당한다.
 */

export type WaxFigureVariant = 'normal' | 'shiny'

export interface WaxFigureEffect {
  /** 효과 축 식별자 — 실제 게임 로직이 이 id로 확률 판정을 건다(아직 미배선, 엔진만 우선). */
  id: string
  /** 사람이 읽는 설명. 확률 %는 런타임에 `waxFigureEffectChance()`로 채운다. */
  label: string
}

export interface WaxFigureSpeciesDef {
  /** 적 표시 이름과 정확히 일치 — 이 게임이 이미 쓰는 "이름 = 종 식별자" 관례를 따른다
   *  (ENEMY_LINES/dangerEnemyName과 같은 방식). 별도 species id 체계를 새로 만들지 않는다. */
  enemyName: string
  effects: Record<WaxFigureVariant, WaxFigureEffect>
}

// 종 목록 자체를 채우는 건 별도 콘텐츠 작업이다(기본 풀 구성이 이 시스템의 진짜 병목).
// 엔진 검증용으로 1종만 우선 등록한다 — 이후 확장은 이 배열에 항목만 추가하면 된다.
export const WAX_FIGURE_SPECIES: readonly WaxFigureSpeciesDef[] = [
  {
    enemyName: '양초 거미',
    effects: {
      normal: { id: 'web-trap-ignore', label: '거미줄 함정 무시' },
      shiny: { id: 'spore-heal', label: '포자 피해가 회복으로 바뀜' },
    },
  },
  {
    // 새싹 병아리 30F 튜토리얼 확정 드랍 종 — `WAX_FIGURE_TUTORIAL_SPECIES` 참고.
    enemyName: '양초 키틴벌레',
    effects: {
      normal: { id: 'bomb-trap-ignore', label: '폭탄 피해 무시(스스로만)' },
      shiny: { id: 'direct-hit-bonus', label: '직접 타격 추가 피해 +1' },
    },
  },
]

/** 새싹 병아리 30F 클리어 과정에서 확정 튜토리얼 드랍으로 쓰는 종. */
export const WAX_FIGURE_TUTORIAL_SPECIES = '양초 키틴벌레'

export function findWaxFigureSpecies(enemyName: string): WaxFigureSpeciesDef | undefined {
  return WAX_FIGURE_SPECIES.find((s) => s.enemyName === enemyName)
}

/** 효과 id → 사람이 읽는 라벨 + 이로치 여부. 발동 체인 배너가 이걸로 문구/색을 정한다. */
export function findWaxFigureEffectMeta(
  effectId: string
): { label: string; shiny: boolean; enemyName: string } | undefined {
  for (const species of WAX_FIGURE_SPECIES) {
    for (const variant of ['normal', 'shiny'] as const) {
      if (species.effects[variant].id === effectId) {
        return { label: species.effects[variant].label, shiny: variant === 'shiny', enemyName: species.enemyName }
      }
    }
  }
  return undefined
}

const STORAGE_KEY = 'unmelting.waxfigures.v1'
const CAPACITY_BONUS_KEY = 'unmelting.waxfigures.capacityBonus'

/** localStorage 최소 계약 — 테스트에서 메모리 저장소로 갈아 끼울 수 있게 좁게 잡는다. */
interface WaxFigureStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/** globalThis 경유로 읽어 저장소가 없는 환경(테스트/SSR)에서도 모듈이 죽지 않는다. */
function storage(): WaxFigureStorage | undefined {
  return (globalThis as { localStorage?: WaxFigureStorage }).localStorage
}

/** 기본 보관 한도(포켓몬 파티 6마리 참고) — 무역에서 화폐로 확장 구매한다. */
export const WAX_FIGURE_BASE_CAPACITY = 6
/** 처치 시 봉인 성공 확률. */
export const WAX_FIGURE_CAPTURE_CHANCE = 0.01
/** 이로치(변종) 확률 — 포획 확률 게이트와 무관하게 **먼저** 굴리고, 걸리면 확정 포획된다. */
export const WAX_FIGURE_SHINY_CHANCE = 0.0001
/** 같은 종+색+성급을 몇 개 모아야 다음 성급으로 합성할 수 있는지. */
export const WAX_FIGURE_MERGE_COUNT = 3

export interface WaxFigureCollectionState {
  version: 1
  /** key = `${enemyName}::${variant}::${star}`, value = 그 조합을 몇 개 보유 중인지. */
  counts: Record<string, number>
}

function emptyState(): WaxFigureCollectionState {
  return { version: 1, counts: {} }
}

function makeKey(enemyName: string, variant: WaxFigureVariant, star: number): string {
  return `${enemyName}::${variant}::${star}`
}

export function loadWaxFigureCollection(): WaxFigureCollectionState {
  try {
    const raw = storage()?.getItem(STORAGE_KEY)
    if (!raw) return emptyState()
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || typeof (parsed as { counts?: unknown }).counts !== 'object') {
      return emptyState()
    }
    const counts: Record<string, number> = {}
    for (const [k, v] of Object.entries((parsed as { counts: Record<string, unknown> }).counts)) {
      if (typeof v === 'number' && Number.isFinite(v) && v > 0) counts[k] = Math.floor(v)
    }
    return { version: 1, counts }
  } catch {
    return emptyState()
  }
}

function saveWaxFigureCollection(state: WaxFigureCollectionState): void {
  storage()?.setItem(STORAGE_KEY, JSON.stringify(state))
}

export function waxFigureCapacityBonus(): number {
  const raw = storage()?.getItem(CAPACITY_BONUS_KEY)
  const n = raw ? Number(raw) : 0
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

export function waxFigureCapacity(): number {
  return WAX_FIGURE_BASE_CAPACITY + waxFigureCapacityBonus()
}

/** 무역에서 화폐로 구매하는 보관함 확장. */
export function grantWaxFigureCapacityBonus(amount: number): void {
  if (amount <= 0) return
  storage()?.setItem(CAPACITY_BONUS_KEY, String(waxFigureCapacityBonus() + Math.floor(amount)))
}

export function totalWaxFigureCount(state: WaxFigureCollectionState = loadWaxFigureCollection()): number {
  return Object.values(state.counts).reduce((sum, n) => sum + n, 0)
}

export interface WaxFigureCatch {
  /** 임시보관함 안에서만 의미 있는 식별자(런 종료·리셋마다 새로 매겨진다). */
  id: string
  enemyName: string
  variant: WaxFigureVariant
  effect: WaxFigureEffect
}

// 임시보관함은 의도적으로 localStorage를 쓰지 않는다 — 런이 끝나면 통째로 사라져야 하는
// 값이라, 영속시키면 "정리 안 한 건 날아간다"는 규칙과 저장 계층이 어긋난다.
let runHold: WaxFigureCatch[] = []
let nextCatchSeq = 1

/** 새 런 시작·게임오버 시 호출 — 정리하지 않은 임시보관함 내용을 전부 비운다. */
export function resetWaxFigureRunHold(): void {
  runHold = []
}

export function getWaxFigureRunHold(): readonly WaxFigureCatch[] {
  return runHold
}

export interface WaxFigureCaptureResult {
  id: string
  enemyName: string
  variant: WaxFigureVariant
  effect: WaxFigureEffect
  /** true = 자리가 있어 영구 밀랍상함에 곧장 들어갔다. false = 한도 초과로 임시보관함에
   *  들어갔다 — 정리하지 않으면 이번 런이 끝날 때 사라진다. */
  stowed: boolean
}

/**
 * 처치한 적의 봉인을 시도한다. 종이 등록돼 있지 않으면(콘텐츠 미비) null.
 *
 * 확률은 두 단계다 — **이로치를 먼저 굴린다.** 이로치에 걸리면 포획 확률 게이트 없이
 * 확정 포획(0.01%로 워낙 희박하니 그 순간을 놓치지 않게 한다). 못 걸리면 그제서야
 * 일반 포획 확률(1%)을 굴려 정상 색으로 포획을 시도한다. 어느 쪽도 안 걸리면 null.
 *
 * 성공하면 **자리가 있는 한** 곧장 영구 밀랍상함에 들어간다(`stowed: true`). 한도를
 * 넘겼을 때만 임시보관함으로 흘러 들어간다(`stowed: false`) — 그때만 플레이어가
 * `stowWaxFigureCatch()`/`discardWaxFigureCatch()`로 직접 정리해야 한다.
 *
 * `forceVariant`는 디버그 커맨드·필드 이로치 확정 포획 전용 — 확률 굴림을 전부 생략하고
 * 등록 검사·적재만 그대로 통과한다(실제 획득 로직을 그대로 타야 한다는 게 이 함수를 둔
 * 이유다).
 */
export function captureWaxFigure(
  enemyName: string,
  opts: { forceVariant?: WaxFigureVariant } = {}
): WaxFigureCaptureResult | null {
  const species = findWaxFigureSpecies(enemyName)
  if (!species) return null
  let variant: WaxFigureVariant
  if (opts.forceVariant) {
    variant = opts.forceVariant
  } else if (Math.random() < WAX_FIGURE_SHINY_CHANCE) {
    variant = 'shiny'
  } else if (Math.random() < WAX_FIGURE_CAPTURE_CHANCE) {
    variant = 'normal'
  } else {
    return null
  }
  const effect = species.effects[variant]
  const id = `wf-${nextCatchSeq++}`
  const state = loadWaxFigureCollection()
  if (totalWaxFigureCount(state) < waxFigureCapacity()) {
    const key = makeKey(enemyName, variant, 1)
    state.counts[key] = (state.counts[key] ?? 0) + 1
    saveWaxFigureCollection(state)
    return { id, enemyName, variant, effect, stowed: true }
  }
  const catchEntry: WaxFigureCatch = { id, enemyName, variant, effect }
  runHold.push(catchEntry)
  return { ...catchEntry, stowed: false }
}

/**
 * 임시보관함의 봉인 하나를 영구 밀랍상함으로 옮긴다. 밀랍상함이 가득 찼으면 false(임시
 * 보관함에 그대로 남는다 — 자리를 비우거나 다른 걸 먼저 정리한 뒤 다시 시도할 수 있다).
 */
export function stowWaxFigureCatch(catchId: string): boolean {
  const idx = runHold.findIndex((c) => c.id === catchId)
  if (idx === -1) return false
  const state = loadWaxFigureCollection()
  if (totalWaxFigureCount(state) >= waxFigureCapacity()) return false
  const entry = runHold[idx]
  const key = makeKey(entry.enemyName, entry.variant, 1)
  state.counts[key] = (state.counts[key] ?? 0) + 1
  saveWaxFigureCollection(state)
  runHold.splice(idx, 1)
  return true
}

/** 임시보관함에서 하나를 그냥 버린다(정리 대상에서 직접 제외하고 싶을 때). */
export function discardWaxFigureCatch(catchId: string): boolean {
  const idx = runHold.findIndex((c) => c.id === catchId)
  if (idx === -1) return false
  runHold.splice(idx, 1)
  return true
}

/** 밀랍상함에 있는 항목을 하나 버려 자리를 비운다. 남은 수가 있으면 1만 줄고, 마지막
 *  하나였으면 항목 자체가 사라진다. 존재하지 않으면 false. */
export function discardWaxFigurePermanent(enemyName: string, variant: WaxFigureVariant, star: number): boolean {
  const state = loadWaxFigureCollection()
  const key = makeKey(enemyName, variant, star)
  const have = state.counts[key] ?? 0
  if (have <= 0) return false
  if (have <= 1) delete state.counts[key]
  else state.counts[key] = have - 1
  saveWaxFigureCollection(state)
  return true
}

/** 같은 종+색+성급 `WAX_FIGURE_MERGE_COUNT`개를 다음 성급 1개로 합친다. 부족하면 false. */
export function mergeWaxFigures(enemyName: string, variant: WaxFigureVariant, star: number): boolean {
  const state = loadWaxFigureCollection()
  const key = makeKey(enemyName, variant, star)
  const have = state.counts[key] ?? 0
  if (have < WAX_FIGURE_MERGE_COUNT) return false
  const remaining = have - WAX_FIGURE_MERGE_COUNT
  if (remaining > 0) state.counts[key] = remaining
  else delete state.counts[key]
  const nextKey = makeKey(enemyName, variant, star + 1)
  state.counts[nextKey] = (state.counts[nextKey] ?? 0) + 1
  saveWaxFigureCollection(state)
  return true
}

/**
 * 성급이 오를수록 커지되 `cap` 아래로 수렴하는 확률형 페시브 계산식 — 방어구 감쇠 공식과
 * 같은 모양이다. 100마리를 모아도 절대 100%에 닿지 않는다. cap/rate는 밸런스 패스 전
 * placeholder — 곡선의 모양(수렴형)만 지금 확정한다.
 */
export function waxFigureEffectChance(star: number, cap = 0.5, rate = 0.7): number {
  if (star <= 0) return 0
  return cap * (1 - Math.pow(rate, star))
}

/**
 * 이 효과 id를 보유 중인 가장 높은 성급 — 같은 종+변종을 여러 성급으로 동시에 들고
 * 있을 순 없으므로(합성이 낮은 성급을 지운다) 존재하는 키를 훑어 하나만 찾으면 된다.
 * 보유하지 않았으면 0(=미보유, `waxFigureEffectChance`가 그대로 0을 돌려준다).
 */
export function waxFigureEffectStar(effectId: string): number {
  for (const species of WAX_FIGURE_SPECIES) {
    for (const variant of ['normal', 'shiny'] as const) {
      if (species.effects[variant].id !== effectId) continue
      const prefix = `${species.enemyName}::${variant}::`
      const state = loadWaxFigureCollection()
      for (const [key, count] of Object.entries(state.counts)) {
        if (count > 0 && key.startsWith(prefix)) return Number(key.slice(prefix.length))
      }
      return 0
    }
  }
  return 0
}

/**
 * 실제 게임 로직이 부르는 판정 창구 — 이 효과 id를 보유하고 있으면 성급에 맞는 확률로
 * 굴려 발동 여부를 돌려준다. 미보유(성급 0)면 항상 false다.
 */
export function rollWaxFigureEffect(effectId: string): boolean {
  const chance = waxFigureEffectChance(waxFigureEffectStar(effectId))
  return chance > 0 && Math.random() < chance
}
