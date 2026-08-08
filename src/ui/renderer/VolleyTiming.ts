/** 후속 발 간격은 발수가 늘수록 완만히 압축하되 판독 가능한 45ms 아래로 내리지 않는다. */
export function handVolleyIntervalMs(shotCount: number): number {
  const count = Math.max(1, shotCount)
  return Math.max(45, Math.min(75, Math.round(105 - Math.sqrt(count) * 15)))
}

/** 입력은 마지막 발을 예약한 순간 풀 수 있고, 각 곡사체의 잔광 종료까지 기다리지 않는다. */
export function handVolleyReleaseDelayMs(shotCount: number): number {
  const count = Math.max(0, shotCount)
  return count <= 1 ? 0 : (count - 1) * handVolleyIntervalMs(count)
}
