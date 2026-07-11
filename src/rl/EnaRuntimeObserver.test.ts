import { describe, expect, it } from 'vitest'
import { GameState } from '@core/GameState'
import { Card, CardType } from '@entities/Card'
import { DropSystem } from '@systems/DropSystem'
import { EnaRuntimeObserver } from './EnaRuntimeObserver'

describe('EnaRuntimeObserver', () => {
  it('현재 화면을 사람이 읽는 시각 프레임과 2~3수 위험 설명으로 변환한다', () => {
    const gs = new GameState()
    gs.getLane(0)?.setCardAtDistance(0, new Card('e-front', CardType.ENEMY, '전방 적', 'probe', 3, 1))
    gs.getLane(1)?.setCardAtDistance(1, new Card('next-enemy', CardType.ENEMY, '대기 적', 'probe', 4, 2))
    gs.getLane(2)?.setCardAtDistance(1, new Card('web-next-b', CardType.TRAP, '거미줄', 'probe', 0, 0, { trapKind: 'web' }))
    gs.character.addHandCard(DropSystem.makeCard('ember'))
    const observer = new EnaRuntimeObserver()
    const frame = observer.describeFrame(gs, ['해금팩', '레시피팩'])
    expect(frame.summary).toContain('HP')
    expect(frame.board.some((row) => row.includes('전방 적'))).toBe(true)
    expect(frame.lookahead.some((note) => note.includes('1수 뒤'))).toBe(true)
    expect(frame.recipeHints.length).toBeGreaterThan(0)
  })

  it('손패/상점/보스/런 종료 이벤트를 실시간 로그로 누적한다', () => {
    const gs = new GameState()
    const observer = new EnaRuntimeObserver()
    observer.recordHandDecision(gs, 'ember', '훈련 적 피해')
    observer.recordShopPurchase(gs, 'pack:unlock-pack')
    observer.recordBossDecision(gs, 'bossEmber')
    observer.recordRunEnd(gs, false, 'character_defeated')
    expect(observer.getEvents().map((event) => event.kind)).toEqual(['hand', 'shop', 'boss', 'run-end'])
    expect(observer.getMemory().all()[0].usedHandCards.ember).toBe(1)
    expect(observer.getMemory().all()[0].shopPurchases).toContain('pack:unlock-pack')
  })

  it('팩 내부 선택(확률/해금/삭제)의 상세 정보를 이벤트에 함께 보관한다', () => {
    const gs = new GameState()
    const observer = new EnaRuntimeObserver()
    observer.recordShopPurchase(gs, 'pick:chance-pack', { itemId: 'chance-ember', handCardId: 'ember', boostAdded: 13 })
    const event = observer.getEvents()[0]
    expect(event.detail).toBe('pick:chance-pack')
    expect(event.purchaseDetail).toEqual({ itemId: 'chance-ember', handCardId: 'ember', boostAdded: 13 })
  })
})
