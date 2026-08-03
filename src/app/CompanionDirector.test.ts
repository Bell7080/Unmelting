import { describe, expect, it, vi } from 'vitest'
import { CompanionDirector, type CompanionDirectorDeps } from './CompanionDirector'
import { GameState } from '@core/GameState'
import { Card, CardType } from '@entities/Card'
import type { HandCardId } from '@entities/HandCard'

/** 디렉터 시간 일관성 테스트용 거미줄 카드 생성기. ID가 기회 서명의 수명을 결정한다. */
function web(id: string, groupCount: number = 1): Card {
  const card = new Card(id, CardType.TRAP, '양초 거미줄', 'test', 0, 1, { trapKind: 'web' })
  card.groupCount = groupCount
  return card
}

/** 예측 경로에 필요한 의존성만 최소 스텁으로 묶어, 실제 보드 판단과 디렉터 게이트를 함께 검증한다. */
function predictionHarness() {
  const gameState = new GameState()
  const evaluateWebPrediction = vi.fn(() => false)
  const predictLine = vi.fn(() => '다음 턴에 위험할 수 있어.')
  const companion = {
    evaluateWebPrediction,
    predictLine,
    getSupportRoleWeights: () => ({ cleanup: 1, attack: 1, defense: 1, resource: 1, recovery: 1 }),
    recordPredictionWasted: vi.fn(),
  }
  const deps = {
    gameState,
    companion,
    cardSpawner: { peekNextRefillCards: () => [] },
    getRunCardPool: () => ({ snapshot: () => ({ unlocked: ['chitin'] as HandCardId[], locked: [], banned: [] }) }),
    isGameActive: () => true,
    isInputLocked: () => false,
    isShopOpen: () => false,
  } as unknown as CompanionDirectorDeps
  const director = new CompanionDirector(deps)
  // 말풍선 DOM 대신 호출 자체만 관찰해 위험 경고가 카드 지급과 독립인지 확인한다.
  const sayEnaBark = vi.spyOn(director as unknown as { sayEnaBark: (...args: unknown[]) => void }, 'sayEnaBark').mockImplementation(() => undefined)
  return { gameState, director, evaluateWebPrediction, predictLine, sayEnaBark }
}

/** 전방 두 레인에 동일한 병합 거미줄 객체를 배치한다. */
function placeTwoWideWeb(gameState: GameState, card: Card): void {
  gameState.lanes.forEach((lane) => lane.clear())
  gameState.lanes[0].setCardAtDistance(0, card)
  gameState.lanes[1].setCardAtDistance(0, card)
}

describe('CompanionDirector 동일 예측 기회 수명', () => {
  it('같은 2칸 거미줄을 유지하면 첫 미지급 뒤 확률을 다시 굴리지 않는다', async () => {
    const { gameState, director, evaluateWebPrediction } = predictionHarness()
    placeTwoWideWeb(gameState, web('same-web', 2))

    await director.tryCompanionPrediction()
    await director.tryCompanionPrediction()

    expect(evaluateWebPrediction).toHaveBeenCalledTimes(1)
  })

  it('기존 거미줄을 제거하고 새 ID의 2칸 거미줄이 생기면 새 기회로 평가한다', async () => {
    const { gameState, director, evaluateWebPrediction } = predictionHarness()
    placeTwoWideWeb(gameState, web('old-web', 2))
    await director.tryCompanionPrediction()

    // 폭은 같아도 실제 카드 ID가 바뀌었으므로 이전 미지급 결정에 묶이지 않는다.
    placeTwoWideWeb(gameState, web('new-web', 2))
    await director.tryCompanionPrediction()

    expect(evaluateWebPrediction).toHaveBeenCalledTimes(2)
  })

  it('2칸에 1칸이 합류할 3칸 위험은 미지급이어도 별도 경고한다', async () => {
    const { gameState, director, evaluateWebPrediction, predictLine, sayEnaBark } = predictionHarness()
    placeTwoWideWeb(gameState, web('wide-web', 2))
    gameState.lanes[2].setCardAtDistance(1, web('incoming-web'))

    await director.tryCompanionPrediction()

    expect(evaluateWebPrediction).toHaveReturnedWith(false)
    expect(predictLine).toHaveBeenCalledWith('web-warning')
    expect(sayEnaBark).toHaveBeenCalledTimes(1)
  })
})
