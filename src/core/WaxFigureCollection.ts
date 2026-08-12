/**
 * 밀랍상(蠟像) — 적을 봉인해 모으는 계정 전체(런을 넘는) 수집 시스템.
 * 쉬움 100층 클리어(잿빛 굴레와 같은 마일스톤, `gray-shackle-unlocked` first-seen)로
 * 열리고, 처치 시 낮은 확률로 종별 밀랍상을 얻는다. 같은 종+색을 3개 모으면 다음
 * 성급으로 합성할 수 있고(플레이어가 직접 하는 동작 — 자동 합성 없음), 성급이 오를수록
 * 그 종의 **확률형 페시브 효과**가 강해진다 — 체력+5·공격력+1 같은 직접 스탯은 절대
 * 주지 않는다(밸런스 파괴). 확률은 방어구 감쇠 공식과 같은 수렴형이라 아무리 모아도
 * 상한을 넘지 않는다.
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
]

export function findWaxFigureSpecies(enemyName: string): WaxFigureSpeciesDef | undefined {
  return WAX_FIGURE_SPECIES.find((s) => s.enemyName === enemyName)
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
/** 처치 시 봉인 성공 확률 — 밸런스 패스 전 placeholder. */
export const WAX_FIGURE_CAPTURE_CHANCE = 0.03
/** 봉인 성공 시 변종(이로치)일 확률. */
export const WAX_FIGURE_SHINY_CHANCE = 0.02
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

export interface WaxFigureCaptureResult {
  enemyName: string
  variant: WaxFigureVariant
  effect: WaxFigureEffect
}

/**
 * 처치한 적의 봉인을 시도한다. 종이 등록돼 있지 않거나(콘텐츠 미비) 밀랍상함이 가득 차면
 * null — 성공하면 항상 1성으로 들어간다. 합성은 자동으로 일어나지 않는다(플레이어가
 * `mergeWaxFigures()`로 직접 정리해야 한다).
 *
 * `forceVariant`는 디버그 커맨드 전용 — 확률 굴림만 생략하고 등록/용량 검사는 그대로
 * 통과한다(실제 획득 로직을 그대로 타야 한다는 게 이 함수를 둔 이유다).
 */
export function captureWaxFigure(
  enemyName: string,
  opts: { forceVariant?: WaxFigureVariant } = {}
): WaxFigureCaptureResult | null {
  const species = findWaxFigureSpecies(enemyName)
  if (!species) return null
  const state = loadWaxFigureCollection()
  if (totalWaxFigureCount(state) >= waxFigureCapacity()) return null
  const variant: WaxFigureVariant = opts.forceVariant ?? (Math.random() < WAX_FIGURE_SHINY_CHANCE ? 'shiny' : 'normal')
  const key = makeKey(enemyName, variant, 1)
  state.counts[key] = (state.counts[key] ?? 0) + 1
  saveWaxFigureCollection(state)
  return { enemyName, variant, effect: species.effects[variant] }
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
