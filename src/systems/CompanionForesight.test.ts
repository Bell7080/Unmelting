import { describe, it, expect } from 'vitest'
import { assessThreats } from './CompanionForesight'
import { Lane } from '@entities/Lane'
import { Card, CardType } from '@entities/Card'
import { Character } from '@entities/Character'

/** 지정한 1칸 거미줄 배치로 레인 3개를 만든다(distance 0행에 채움). */
function lanesWithWebs(count: number): Lane[] {
  const lanes = [new Lane('l0', 0), new Lane('l1', 1), new Lane('l2', 2)]
  for (let i = 0; i < count; i++) {
    const web = new Card(`web-${i}`, CardType.TRAP, '양초 거미줄', 'web', 1, 1, { trapKind: 'web' })
    lanes[i].setCardAtDistance(0, web)
  }
  return lanes
}

describe('assessThreats (예측 대비 그릇)', () => {
  it('1칸 거미줄이 둘 이상이면 청소를 권고한다', () => {
    const character = new Character()
    expect(assessThreats(lanesWithWebs(0), character).recommendCleanup).toBe(false)
    expect(assessThreats(lanesWithWebs(1), character).recommendCleanup).toBe(false)
    expect(assessThreats(lanesWithWebs(2), character).recommendCleanup).toBe(true)
  })

  it('거미줄 3개는 합쳐지면 치명적(현재 체력 초과)으로 본다', () => {
    const character = new Character()
    const report = assessThreats(lanesWithWebs(3), character)
    expect(report.webCount).toBe(3)
    expect(report.webLethal).toBe(true)
  })
})
