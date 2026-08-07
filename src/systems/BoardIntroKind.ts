/**
 * BoardIntroKind — 필드 카드 한 장이 에나의 "첫 조우 소개" 중 어느 종류인지 가르는 순수 함수.
 *
 * index.ts에 있던 것을 뽑아 왔다. 순수 판별인데 테스트가 없어서, 종류를 안 가리고
 * 세부 kind를 먼저 묻는 실수가 오래 살아남았기 때문이다(아래 ★ 참고).
 */

import { Card, CardType } from '@entities/Card'
import type { BoardEncounterKind } from '@systems/CompanionSystem'

/**
 * ★ **종류(`type`)로 먼저 거른 뒤에 세부 kind를 본다.**
 *
 * `Card` 생성자는 `trapKind`를 `'web'`으로, `treasureKind`를 `'chest'`로 **기본값** 설정한다
 * (`options.trapKind ?? 'web'`). 그래서 함정이 아닌 카드에서도 `trapKind === 'web'`이 참이다.
 * 종류를 안 가리고 물으면 잡동사니·보물상자·꽃·일반 적이 전부 '거미줄'로 분류돼
 * 첫 판부터 엉뚱한 소개가 나가고, 게다가 'web'이 소개 완료로 기록돼 나머지 종류는
 * 영영 소개되지 못한다.
 *
 * 같은 지뢰가 다른 곳에도 있다 — `trapKind`를 읽기 전에 `type === CardType.TRAP`을
 * 먼저 확인할 것(에나 관측·예지·손패 판정은 모두 그렇게 되어 있다).
 */
export function boardIntroKindOf(card: Card): BoardEncounterKind | null {
  if (card.enemySpriteId === 'enemyRock') return 'rock'
  if (card.type === CardType.TRAP) {
    if (card.trapKind === 'bush') return 'bush'
    if (card.trapKind === 'web') return 'web'
    if (card.trapKind === 'bomb') return 'bomb'
    if (card.trapKind === 'spore') return 'spore'
    return null
  }
  if (card.type === CardType.TREASURE) {
    if (card.treasureKind === 'junk') return 'junk'
    if (card.treasureKind === 'starlight') return 'starlight'
    // 일반 상자·황금 상자는 따로 소개하지 않는다(소개 풀이 없다).
    return null
  }
  if (card.type === CardType.EVENT) return 'event-door'
  if (card.specialEnemyKind === 'mimic') return 'mimic'
  if (card.specialEnemyKind === 'monsterFlower') return 'monster-flower'
  // 꽃은 종류마다 보상이 달라 첫 개화 때 에나가 꽃과 쓰임을 함께 짚어 준다.
  if (card.type === CardType.FLOWER) {
    if (card.flowerKind === 'seed') return 'seed'
    if (card.flowerKind === 'redRose') return 'red-rose'
    return card.flowerKind
  }
  return null
}
