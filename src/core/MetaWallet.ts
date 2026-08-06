/**
 * 메타 화폐($) 지갑 — 런을 넘어 살아남는 잔액을 localStorage에 들고 있다.
 *
 * 런 중의 $(index.ts `coins`)는 상점에서 쓰고 남는 **그 런의 소지금**이고, 여기 잔액은
 * 런이 끝날 때 그 소지금을 넘겨받아 거점(무역)에서 쓰는 돈이다. 둘을 한 변수로 합치면
 * 상점에서 쓴 돈과 저축이 구분되지 않는다.
 *
 * 저장 키는 `unmelting.` 접두사를 쓴다 — `/리셋`이 접두사로 지우므로 새 진행도 키가
 * 리셋 대상에서 조용히 빠지지 않는다.
 */

const WALLET_STORAGE_KEY = 'unmelting.meta.currency.v1'

/** localStorage 최소 계약 — 테스트에서 메모리 저장소로 갈아 끼울 수 있게 좁게 잡는다. */
interface WalletStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/** globalThis 경유로 읽어 저장소가 없는 환경(테스트/SSR)에서도 모듈이 죽지 않는다. */
function storage(): WalletStorage | undefined {
  return (globalThis as { localStorage?: WalletStorage }).localStorage
}

/** 손상/결측 저장본은 0으로 되돌린다 — 잔액은 음수도 소수도 될 수 없다. */
function coerceBalance(raw: string | null | undefined): number {
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

export function loadMetaCurrency(): number {
  return coerceBalance(storage()?.getItem(WALLET_STORAGE_KEY))
}

export function saveMetaCurrency(amount: number): number {
  const next = Math.max(0, Math.floor(amount))
  storage()?.setItem(WALLET_STORAGE_KEY, String(next))
  return next
}

/** 런이 남긴 소지금을 지갑에 넣고 새 잔액을 돌려준다. 0 이하는 아무 일도 하지 않는다. */
export function depositMetaCurrency(amount: number): number {
  const gain = Math.max(0, Math.floor(amount))
  if (gain === 0) return loadMetaCurrency()
  return saveMetaCurrency(loadMetaCurrency() + gain)
}

/** 잔액이 모자라면 아무것도 깎지 않고 false — 호출부가 구매를 거절할 수 있게 한다. */
export function spendMetaCurrency(amount: number): boolean {
  const cost = Math.max(0, Math.floor(amount))
  const balance = loadMetaCurrency()
  if (balance < cost) return false
  saveMetaCurrency(balance - cost)
  return true
}
