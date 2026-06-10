import { describe, it } from 'vitest'
import { EventSpawnController, DEFAULT_EVENT_SPAWN_CONFIG, type EventSpawnConfig } from './EventSpawn'

/**
 * EventSpawn 캘리브레이션 시뮬레이션(테스트 아님, 수치 확인용 로그).
 * 전체 런(1~89턴)을 다수 반복해 "첫 문 등장 턴 분포"와 "세그먼트당 평균 문 수"를 출력한다.
 * 곡선 상수(earlyStep/lateStep/earlyDelayRolls)는 이 출력 표를 보고 확정한다.
 */
function simulate(cfg: EventSpawnConfig, trials: number) {
  const firstDoorTurns: number[] = []
  let segA = 0 // 1~30
  let segB = 0 // 31~60
  let segC = 0 // 61~90
  let runsWithFirstBy29 = 0

  for (let i = 0; i < trials; i++) {
    const c = new EventSpawnController(cfg)
    let firstTurn = -1
    for (let t = 1; t <= 89; t++) {
      if (c.rollForTurn(t)) {
        if (firstTurn === -1) firstTurn = t
        if (t <= 30) segA++
        else if (t <= 60) segB++
        else segC++
      }
    }
    if (firstTurn !== -1) firstDoorTurns.push(firstTurn)
    if (firstTurn !== -1 && firstTurn <= 29) runsWithFirstBy29++
  }

  const buckets = new Map<string, number>()
  for (const t of firstDoorTurns) {
    const lo = Math.floor((t - 1) / 5) * 5 + 1
    const key = `${lo}-${lo + 4}`
    buckets.set(key, (buckets.get(key) ?? 0) + 1)
  }
  const mean = firstDoorTurns.reduce((s, t) => s + t, 0) / firstDoorTurns.length

  console.log('--- config:', JSON.stringify(cfg))
  console.log(`first-door mean turn: ${mean.toFixed(1)}, spawned-by-29: ${(runsWithFirstBy29 / trials * 100).toFixed(1)}%`)
  console.log('first-door turn buckets:', [...buckets.entries()].sort((a, b) =>
    Number(a[0].split('-')[0]) - Number(b[0].split('-')[0])).map(([k, v]) =>
    `${k}:${(v / trials * 100).toFixed(1)}%`).join('  '))
  console.log(`avg doors/segment  A(1-30): ${(segA / trials).toFixed(2)}  B(31-60): ${(segB / trials).toFixed(2)}  C(61-90): ${(segC / trials).toFixed(2)}`)
}

describe('EventSpawn calibration sim', () => {
  it('prints first-door distribution and doors-per-segment for candidate curves', () => {
    const trials = 50000
    // 후보 A: 현재 기본값.
    simulate(DEFAULT_EVENT_SPAWN_CONFIG, trials)
    // 후보 B: 초반 더 볼록(딜레이 ↑, earlyStep ↓) — 첫 문을 더 중후반으로.
    simulate({ ...DEFAULT_EVENT_SPAWN_CONFIG, earlyDelayRolls: 12, earlyStep: 0.07 }, trials)
    // 후보 C: 후반 페이싱 더 완만(lateStep ↓).
    simulate({ ...DEFAULT_EVENT_SPAWN_CONFIG, lateStep: 0.008 }, trials)
  })
})
