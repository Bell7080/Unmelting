/**
 * CompanionLines 전 대사 데이터 품질 검사.
 *
 * 모든 풀의 모든 줄을 세 말투 강도로 전수 렌더(enumerateLineRenders — 슬롯/말투 조합을
 * 결정적으로 순회)해, 작성 단계에서 생기기 쉬운 오류를 데이터 차원에서 잡는다:
 *   (a) 잔여 {슬롯}/[조사] 토큰  (b) 이중 공백  (c) 어긋난 문장부호 조합
 *   (d) 빈 문자열  (e) 한글/문장부호가 아닌 종결.
 */

import { describe, it, expect } from 'vitest'
import {
  POOLS,
  CATEGORY_COMMENTS,
  CARD_COMMENTS,
  USE_CARD_COMMENTS,
  USE_COMMENTS,
  JOB_LINES,
  JOB_GENERIC,
  CLUTCH_LINES,
  MINOR_CLUTCH_LINES,
  AWAKEN_LINES,
  ENEMY_LINES,
  RELIC_LINES,
  RELIC_RARITY_LINES,
  GENERIC_BUY_LINES,
  PREDICT_LINES,
  BOSS_INTRO_LINES,
  BOSS_INTRO_BY_NAME,
  BOSS_PHASE_LINES,
  BOSS_KILL_LINES,
  BOSS_KILL_BY_NAME,
  DEATH_LINES,
  CLEAR_LINES,
  TRIAL_LINES,
  STARLIGHT_LINES,
  PACK_LINES,
  CALLBACK_LINES,
  type Line,
} from './CompanionLines'
import { enumerateLineRenders, type Intensity } from '@systems/CompanionSystem'

/** 풀 이름 → 줄 목록으로 평탄화해 실패 메시지가 어느 데이터인지 바로 가리키게 한다. */
function collectAllPools(): { pool: string; lines: Line[] }[] {
  const out: { pool: string; lines: Line[] }[] = []
  const addRecord = (prefix: string, record: Record<string, Line[] | undefined>) => {
    for (const [key, lines] of Object.entries(record)) {
      if (lines) out.push({ pool: `${prefix}:${key}`, lines })
    }
  }
  addRecord('pool', POOLS)
  addRecord('category', CATEGORY_COMMENTS)
  addRecord('card', CARD_COMMENTS)
  addRecord('use-card', USE_CARD_COMMENTS)
  addRecord('use', USE_COMMENTS)
  addRecord('job', JOB_LINES)
  out.push({ pool: 'job:generic', lines: JOB_GENERIC })
  addRecord('clutch', CLUTCH_LINES)
  addRecord('minor-clutch', MINOR_CLUTCH_LINES)
  out.push({ pool: 'awaken', lines: AWAKEN_LINES })
  addRecord('enemy', ENEMY_LINES)
  addRecord('relic', RELIC_LINES)
  addRecord('relic-rarity', RELIC_RARITY_LINES)
  out.push({ pool: 'buy:generic', lines: GENERIC_BUY_LINES })
  addRecord('predict', PREDICT_LINES)
  out.push({ pool: 'boss-intro', lines: BOSS_INTRO_LINES })
  addRecord('boss-intro', BOSS_INTRO_BY_NAME)
  out.push({ pool: 'boss-phase', lines: BOSS_PHASE_LINES })
  out.push({ pool: 'boss-kill', lines: BOSS_KILL_LINES })
  addRecord('boss-kill', BOSS_KILL_BY_NAME)
  out.push({ pool: 'death', lines: DEATH_LINES })
  out.push({ pool: 'clear', lines: CLEAR_LINES })
  out.push({ pool: 'trial', lines: TRIAL_LINES })
  out.push({ pool: 'starlight', lines: STARLIGHT_LINES })
  addRecord('pack', PACK_LINES)
  addRecord('callback', CALLBACK_LINES)
  return out
}

const INTENSITIES: Intensity[] = ['soft', 'normal', 'urgent']

/** 어긋난 문장부호 조합 — '!.' '?.' '..!'(따라서 '...!'도) '!!.' 류를 잡는다. */
const BROKEN_PUNCTUATION = /(!\.)|(\?\.)|(\.\.!)|(\.\.\?)|(!!\.)/
/** 종결은 한글 음절이나 문장부호여야 한다(공백/토막 문자 종결 방지). */
const VALID_ENDING = /[가-힣.!?…~]$/

describe('CompanionLines 데이터 품질(전 풀 전수 렌더)', () => {
  const pools = collectAllPools()

  it('풀 수집이 비어 있지 않다(수집 로직 자가 검증)', () => {
    expect(pools.length).toBeGreaterThan(30)
    expect(pools.every((p) => p.lines.length > 0)).toBe(true)
  })

  it('모든 줄이 모든 강도/슬롯 조합에서 깨끗한 문장으로 렌더된다', () => {
    const failures: string[] = []
    for (const { pool, lines } of pools) {
      lines.forEach((line, index) => {
        for (const intensity of INTENSITIES) {
          for (const rendered of enumerateLineRenders(line, intensity)) {
            const problems: string[] = []
            if (rendered.trim().length === 0) problems.push('빈 문자열')
            if (/[{}[\]]/.test(rendered)) problems.push('잔여 토큰')
            if (rendered.includes('  ')) problems.push('이중 공백')
            if (rendered !== rendered.trim()) problems.push('앞뒤 공백')
            if (BROKEN_PUNCTUATION.test(rendered)) problems.push('문장부호 조합')
            if (rendered.trim().length > 0 && !VALID_ENDING.test(rendered.trim())) problems.push('종결 문자')
            if (problems.length > 0) {
              failures.push(`[${pool}#${index}] "${rendered}" ← ${problems.join(', ')}`)
            }
          }
        }
      })
    }
    // 실패 시 어떤 풀의 몇 번째 줄이 어떤 문장으로 깨졌는지(줄당 1회) 보여준다.
    const unique = [...new Map(failures.map((f) => [f.slice(0, f.indexOf(']')), f])).values()]
    expect(unique, unique.join('\n')).toEqual([])
  })
})
