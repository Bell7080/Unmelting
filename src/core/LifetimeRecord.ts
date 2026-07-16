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

/** 한 런의 결과 요약 — recordRun 입력. floor는 도달 층(=런 턴), light는 총 불빛. */
export interface LifetimeRunResult {
  outcome: 'clear' | 'death'
  floor: number
  kills: number
  traps: number
  treasures: number
  light: number
}

/** 통산 누적값. 모든 필드는 음수가 될 수 없고, best/총합은 단조 증가한다. */
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
  }
}

/** 저장본 숫자 필드를 계약대로 정규화한다(NaN/음수/비정수는 0으로). */
function coerceCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
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

  /** 런 결과 1건을 통산값에 합산하고 저장한 뒤, 갱신된 기록을 돌려준다. */
  recordRun(result: LifetimeRunResult): LifetimeRecord {
    const prev = this.load()
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
