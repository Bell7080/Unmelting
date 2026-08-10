/**
 * 누적 기록(평생 리더보드) — 런을 넘어 살아남는 통산 성적을 localStorage에 쌓는다.
 *
 * 지금은 저장·집계만 담당한다(표시 위치는 추후 결정). showGameOver가 런 종료마다 한 번
 * recordRun을 부르고, 어디서든 loadLifetimeRecord로 통산값을 읽어 쓸 수 있다.
 */

const LIFETIME_STORAGE_KEY = 'unmelting.lifetime.v1'

/** localStorage 최소 계약 — 테스트/SSR에서 주입 대체할 수 있게 좁게 잡는다. */
export interface LifetimeStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

/** 서고 일지에 보관할 개별 런 기록 최대 개수 — 무한히 쌓이면 저장본이 계속 불어난다. */
const LIFETIME_HISTORY_CAP = 30

/** 한 런의 결과 요약 — recordRun 입력. floor는 도달 층(=런 턴), light는 총 불빛.
 *  reason은 gameState.gameOverReason 문자열(서고 일지 제목 매핑용, 생략 시 빈 문자열).
 *  아래 5개는 서고 일지 상세 카드용 스냅샷(모두 선택) — 없으면 그 항목만 카드에서 빠진다. */
export interface LifetimeRunResult {
  outcome: 'clear' | 'death'
  floor: number
  kills: number
  traps: number
  treasures: number
  light: number
  reason?: string
  /** 이번 런 가장 많이 쓴 손패(defId)와 사용 횟수. */
  mvpCardId?: string
  mvpCardCount?: number
  /** 이번 런 누적 피해가 가장 큰 적의 표시 이름과 그 피해량. */
  dangerEnemyName?: string
  dangerEnemyDamage?: number
  /** 런 종료 시점 에나 성좌 축 원시값(0~1, experienceAxes 순서 고정 5개). */
  enaAxisValues?: number[]
  /** 이번 런으로 오른 축별 %p(음수/0 포함, enaAxisValues와 같은 순서). */
  enaAxisDeltas?: number[]
  /** 정산 화면에 쓴 것과 같은 에나의 한마디. */
  enaLine?: string
}

/** 서고 일지 한 줄 — 개별 런 1건. at은 Date.now() 저장 시각(정렬/표시용). */
export interface LifetimeRunEntry {
  outcome: 'clear' | 'death'
  reason: string
  floor: number
  kills: number
  traps: number
  treasures: number
  light: number
  at: number
  mvpCardId?: string
  mvpCardCount?: number
  dangerEnemyName?: string
  dangerEnemyDamage?: number
  enaAxisValues?: number[]
  enaAxisDeltas?: number[]
  enaLine?: string
}

/** 통산 누적값. 모든 필드는 음수가 될 수 없고, best/총합은 단조 증가한다.
 *  history는 최근 LIFETIME_HISTORY_CAP건만 보관한다(집계값은 전체 통산, 일지는 최근분만). */
export interface LifetimeRecord {
  version: 1
  totalRuns: number
  clears: number
  deaths: number
  bestFloor: number
  totalKills: number
  totalTraps: number
  totalTreasures: number
  totalLight: number
  history: LifetimeRunEntry[]
}

/** 결측/손상 저장본을 안전한 0 기록으로 병합한다. */
export function emptyLifetimeRecord(): LifetimeRecord {
  return {
    version: 1,
    totalRuns: 0,
    clears: 0,
    deaths: 0,
    bestFloor: 0,
    totalKills: 0,
    totalTraps: 0,
    totalTreasures: 0,
    totalLight: 0,
    history: [],
  }
}

/** 저장본 숫자 필드를 계약대로 정규화한다(NaN/음수/비정수는 0으로). */
function coerceCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
}

/** 유한 숫자 배열만 통과시킨다(길이 무관, 원소 하나라도 깨지면 배열 전체를 버린다). */
function coerceNumberArray(value: unknown): number[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined
  if (!value.every((v) => typeof v === 'number' && Number.isFinite(v))) return undefined
  return value as number[]
}

/** history 배열 원소를 하나씩 검증한다 — 손상된 원소 하나가 전체 일지를 지우지 않게 걸러낸다. */
function coerceHistory(value: unknown): LifetimeRunEntry[] {
  if (!Array.isArray(value)) return []
  const entries: LifetimeRunEntry[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const e = item as Record<string, unknown>
    if (e.outcome !== 'clear' && e.outcome !== 'death') continue
    entries.push({
      outcome: e.outcome,
      reason: typeof e.reason === 'string' ? e.reason : '',
      floor: coerceCount(e.floor),
      kills: coerceCount(e.kills),
      traps: coerceCount(e.traps),
      treasures: coerceCount(e.treasures),
      light: coerceCount(e.light),
      at: typeof e.at === 'number' && Number.isFinite(e.at) ? e.at : 0,
      mvpCardId: typeof e.mvpCardId === 'string' ? e.mvpCardId : undefined,
      mvpCardCount: typeof e.mvpCardCount === 'number' && e.mvpCardCount > 0 ? Math.floor(e.mvpCardCount) : undefined,
      dangerEnemyName: typeof e.dangerEnemyName === 'string' ? e.dangerEnemyName : undefined,
      dangerEnemyDamage: typeof e.dangerEnemyDamage === 'number' && e.dangerEnemyDamage > 0 ? Math.floor(e.dangerEnemyDamage) : undefined,
      enaAxisValues: coerceNumberArray(e.enaAxisValues),
      enaAxisDeltas: coerceNumberArray(e.enaAxisDeltas),
      enaLine: typeof e.enaLine === 'string' ? e.enaLine : undefined,
    })
  }
  return entries.slice(0, LIFETIME_HISTORY_CAP)
}

function parseRecord(raw: string | null): LifetimeRecord {
  if (!raw) return emptyLifetimeRecord()
  // 손상 JSON은 조용히 빈 기록으로 되돌린다(런 종료 흐름을 막지 않기 위함).
  let parsed: unknown = null
  try {
    parsed = JSON.parse(raw)
  } catch {
    return emptyLifetimeRecord()
  }
  if (!parsed || typeof parsed !== 'object') return emptyLifetimeRecord()
  const p = parsed as Record<string, unknown>
  return {
    version: 1,
    totalRuns: coerceCount(p.totalRuns),
    clears: coerceCount(p.clears),
    deaths: coerceCount(p.deaths),
    bestFloor: coerceCount(p.bestFloor),
    totalKills: coerceCount(p.totalKills),
    totalTraps: coerceCount(p.totalTraps),
    totalTreasures: coerceCount(p.totalTreasures),
    totalLight: coerceCount(p.totalLight),
    history: coerceHistory(p.history),
  }
}

/** 통산 기록 저장소. 주입형 storage로 테스트 가능하며, storage 부재 시 인메모리로만 동작한다. */
export class LifetimeRecordStore {
  // storage가 없을 때(테스트/SSR)도 세션 내 누적은 유지하도록 마지막 값을 보관한다.
  private memory: LifetimeRecord | null = null

  constructor(private readonly storage?: LifetimeStorage) {}

  load(): LifetimeRecord {
    if (!this.storage) return this.memory ? { ...this.memory } : emptyLifetimeRecord()
    return parseRecord(this.storage.getItem(LIFETIME_STORAGE_KEY))
  }

  /** 런 결과 1건을 통산값에 합산하고 저장한 뒤, 갱신된 기록을 돌려준다.
   *  서고 일지(history)는 최신 건이 맨 앞에 오도록 unshift하고 상한을 넘는 옛 기록은 버린다. */
  recordRun(result: LifetimeRunResult): LifetimeRecord {
    const prev = this.load()
    const entry: LifetimeRunEntry = {
      outcome: result.outcome,
      reason: result.reason ?? '',
      floor: coerceCount(result.floor),
      kills: coerceCount(result.kills),
      traps: coerceCount(result.traps),
      treasures: coerceCount(result.treasures),
      light: coerceCount(result.light),
      at: Date.now(),
      mvpCardId: result.mvpCardId,
      mvpCardCount: result.mvpCardCount,
      dangerEnemyName: result.dangerEnemyName,
      dangerEnemyDamage: result.dangerEnemyDamage,
      enaAxisValues: result.enaAxisValues,
      enaAxisDeltas: result.enaAxisDeltas,
      enaLine: result.enaLine,
    }
    const next: LifetimeRecord = {
      version: 1,
      totalRuns: prev.totalRuns + 1,
      clears: prev.clears + (result.outcome === 'clear' ? 1 : 0),
      deaths: prev.deaths + (result.outcome === 'death' ? 1 : 0),
      bestFloor: Math.max(prev.bestFloor, coerceCount(result.floor)),
      totalKills: prev.totalKills + coerceCount(result.kills),
      totalTraps: prev.totalTraps + coerceCount(result.traps),
      totalTreasures: prev.totalTreasures + coerceCount(result.treasures),
      totalLight: prev.totalLight + coerceCount(result.light),
      history: [entry, ...prev.history].slice(0, LIFETIME_HISTORY_CAP),
    }
    this.memory = next
    if (this.storage) this.storage.setItem(LIFETIME_STORAGE_KEY, JSON.stringify(next))
    return next
  }

  /** 통산 기록 초기화(디버그/리셋 명령용). */
  clear(): void {
    this.memory = null
    if (this.storage) this.storage.removeItem(LIFETIME_STORAGE_KEY)
  }
}

/** 브라우저 localStorage에 붙은 통산 기록 저장소를 만든다. */
export function createBrowserLifetimeRecordStore(): LifetimeRecordStore {
  const storage = typeof globalThis === 'undefined' ? undefined : (globalThis as { localStorage?: LifetimeStorage }).localStorage
  return new LifetimeRecordStore(storage)
}
