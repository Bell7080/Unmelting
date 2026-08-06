/** 공격 태그 트레일이 default 황금색으로 회귀하지 않는지 확인하는 색상 계약 테스트. */
import { describe, expect, it } from 'vitest'
import type { GameBoardRenderer } from '@ui/GameBoardRenderer'
import { ResourceTrailFx } from './ResourceTrailFx'

describe('ResourceTrailFx attack tag colors', () => {
  it('칼날·제물·밀랍 곡사에 서로 다른 전용 색을 제공한다', () => {
    // trailColors는 host 상태를 읽지 않는 순수 매핑이므로 최소 타입 스텁만 전달한다.
    const fx = new ResourceTrailFx({} as GameBoardRenderer)
    const fallback = fx.trailColors('hand-tool')
    const blade = fx.trailColors('hand-attack-blade')
    const sacrifice = fx.trailColors('hand-attack-sacrifice')
    const wax = fx.trailColors('hand-attack-wax')

    expect(blade).not.toEqual(fallback)
    expect(sacrifice).not.toEqual(fallback)
    expect(wax).not.toEqual(fallback)
    expect(new Set([blade.color, sacrifice.color, wax.color]).size).toBe(3)
  })
})
