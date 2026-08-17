/**
 * 카드에 붙는 턴제 상태의 단일 진입점.
 *
 * Card는 저장값과 작은 연산만 소유하고, 대상 판정·적용·턴 경계 감소는 이 매니저가 맡는다.
 * 이후 중독/약화처럼 턴 수를 가진 디버프가 늘어나도 손패와 턴 루프마다 분기를 복제하지 않는다.
 */
import { Card, CardType } from '@entities/Card'

export class CardStatusManager {
  /** 밀랍은 행동 또는 자체 만료 주기가 있는 카드와 온보딩 필드 카드에 적용된다. */
  static canApplyWax(card: Card): boolean {
    if (card.isOnboardingField()) return true
    if (card.type === CardType.ENEMY || card.type === CardType.BOSS || card.type === CardType.TREASURE) return true
    if (card.type === CardType.TRAP) return card.trapKind === 'bomb' || card.trapKind === 'spore'
    if (card.type === CardType.FLOWER) return card.flowerKind !== 'seed'
    return false
  }

  /** 밀랍 굳음을 누적 적용한다. false는 대상 규칙상 적용할 수 없음을 뜻한다. */
  static applyWax(card: Card, turns: number): boolean {
    if (!this.canApplyWax(card)) return false
    card.freeze(turns)
    return true
  }

  /** 카드가 한 번만 상태 턴을 소모하도록 그룹 카드 중복을 제거해 진행한다. */
  static tickTurnBoundary(cards: Iterable<Card>): void {
    const seen = new Set<Card>()
    for (const card of cards) {
      if (seen.has(card)) continue
      seen.add(card)
      card.tickFrozen()
    }
  }

  /** 보스처럼 독립 행동 beat를 쓰는 카드의 상태 턴을 같은 창구에서 진행한다. */
  static tickActionBeat(card: Card): void {
    card.tickFrozen()
  }
}
