import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * 이벤트 문 소멸(클릭 소비/2턴 만료)과 정화 클러치는 모두 같은 레일 정리 블록
 * (하강·리필 → 재그룹 → 개화 → 폭탄 점화 → 새 문 카운트다운 → 별빛 수집)을 거쳐야 한다.
 * index.ts/EventFlowManager.ts는 모듈 부수효과(DOM 부트) 때문에 직접 import할 수 없어,
 * 소스 계약 검사로 세 경로의 정리 호출이 누락되지 않았음을 회귀 방지한다.
 * 문 진입 경로는 app/EventFlowManager.ts로 분리되어 해당 소스를 검사한다.
 */
const INDEX_SOURCE = readFileSync(fileURLToPath(new URL('./index.ts', import.meta.url)), 'utf8')
const EVENT_FLOW_SOURCE = readFileSync(
  fileURLToPath(new URL('./app/EventFlowManager.ts', import.meta.url)),
  'utf8'
)

/** 함수 시작 마커부터 다음 함수 마커 전까지의 소스 조각을 자른다. */
function sliceBetween(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker, start)
  expect(start, `marker not found: ${startMarker}`).toBeGreaterThanOrEqual(0)
  expect(end, `marker not found: ${endMarker}`).toBeGreaterThan(start)
  return source.slice(start, end)
}

/** 공통 레일 정리 블록의 필수 호출 목록. */
const REQUIRED_CLEANUP_CALLS = [
  'compactAndRefillAllLanes(',
  'regroupAllRows()',
  'bloomFrontSeeds(',
  'armFrontBombs()',
  'startFrontEventDoorArrivals()',
  'sweepFrontStarlights()',
] as const

describe('이벤트 문 소멸 레일 정리 계약(index.ts)', () => {
  it('문 진입 소비 경로(handleEventDoorClick)가 공통 정리 블록을 전부 수행한다', () => {
    const body = sliceBetween(EVENT_FLOW_SOURCE, 'async handleEventDoorClick', 'applyEventChoice(def: EventDefinition')
    for (const call of REQUIRED_CLEANUP_CALLS) expect(body).toContain(call)
  })

  it('2턴 닫힘 만료 경로(tickFrontEventDoors)가 공통 정리 블록을 전부 수행한다', () => {
    const body = sliceBetween(INDEX_SOURCE, 'async function tickFrontEventDoors', 'async function sweepFrontStarlights')
    for (const call of REQUIRED_CLEANUP_CALLS) expect(body).toContain(call)
  })

  it('정화 클러치 경로(resolvePostDropSporeSpread)가 공통 정리 블록을 전부 수행한다', () => {
    const body = sliceBetween(
      INDEX_SOURCE,
      'async function resolvePostDropSporeSpread',
      'async function resolveEventPhaseAndPrepareNextTurn'
    )
    for (const call of REQUIRED_CLEANUP_CALLS) expect(body).toContain(call)
  })
})
