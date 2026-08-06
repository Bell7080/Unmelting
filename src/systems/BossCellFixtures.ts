/**
 * BossCellFixtures — 보스 칸 부가물(함정/보물)의 **효과 정산 단일 창구**.
 *
 * 모델(`BossGimmickManager`)은 "칸에서 무엇이 떨어졌다"까지만 기록한다. 그 결과를
 * 실제로 적용하는 것 — 플레이어가 함정 피해를 받고, 보물이 손패가 되는 것 — 은
 * 배율로 표현할 수 없어 모델 밖에서 처리해야 하고, 그 처리를 직접 타격/손패/유물이
 * 각자 하면 규칙이 갈린다. 그래서 이 파일 하나를 지난다.
 *
 * ★ **함정 부가물은 필드 함정과 같은 규칙을 쓴다.** 무시 확률(함정의 대가·도적),
 * 피해 보너스(역경 시련·유물), 처리 시 발동하는 유물(함정 수집)이 전부 여기서 함께
 * 걸린다. 새 함정/보물 관련 손패·유물·시련을 만들 때는 필드 경로만 보지 말고 이쪽도
 * 함께 확인한다 — 화면에는 같은 '함정'으로 보이는데 한쪽에서만 반응하면 고장으로 읽힌다.
 */

import type { GameState } from '@core/GameState'
import type { BossGimmickFixtureEvent } from './BossGimmickManager'
import { BOSS_GIMMICK_TREASURE_CARDS } from './BossGimmickManager'
import { DropSystem } from './DropSystem'
import { HandSystem } from './HandSystem'
import { getHandCardDef } from '@data/HandCards'

/** 부가물 한 묶음을 정산한 결과. 호출부는 이 값으로 연출·로그·사망 판정을 잇는다. */
export interface BossFixtureResolution {
  /** 실제로 깎인 체력(방패가 막은 몫은 빠진다). */
  trapDamageTaken: number
  /** 함정을 몇 개 밟았는가(무시 판정으로 아프지 않았던 것도 포함). */
  trapsTriggered: number
  /** 무시 확률로 피해 없이 넘긴 함정 수. */
  trapsIgnored: number
  /** 손패로 지운 함정 수(밟지 않고 처리). */
  trapsCleared: number
  /** 실제로 손에 들어온 카드 이름들. 손이 가득 차면 그만큼 줄어든다. */
  treasureCardNames: string[]
  /** 보물 칸을 몇 개 열었는가(때려서든 열쇠로든). */
  treasuresOpened: number
}

function emptyResolution(): BossFixtureResolution {
  return {
    trapDamageTaken: 0,
    trapsTriggered: 0,
    trapsIgnored: 0,
    trapsCleared: 0,
    treasureCardNames: [],
    treasuresOpened: 0,
  }
}

/**
 * 대기 중인 부가물 사건을 전부 정산한다. 정산할 것이 없으면 0 결과를 돌려준다.
 *
 * 함정은 **밟았을 때만** 아프다(`cause: 'triggered'`). 키틴 등으로 걷어낸 함정은
 * 피해가 없지만 '처리'는 한 것이라 함정 처리 유물은 똑같이 발동한다 — 그게 지우는
 * 값어치이고, 필드 함정을 손패로 제거했을 때와 같은 규칙이다.
 */
export function resolveBossCellFixtures(gs: GameState): BossFixtureResolution {
  const grid = gs.bossGimmicks
  if (!grid) return emptyResolution()
  const events = grid.takeFixtureEvents()
  if (events.length === 0) return emptyResolution()
  const out = emptyResolution()
  const character = gs.character
  for (const event of events) {
    if (event.fixture === 'trap') applyTrap(gs, event, grid.trapDamage, out)
    else applyTreasure(gs, event, out)
  }
  // 손패가 늘었으면 트리플 자동 합성까지 보물상자 개봉과 같은 규칙으로 맞춘다.
  if (out.treasureCardNames.length > 0) HandSystem.runAutoMerges(character)
  return out
}

/** 함정 한 칸. 무시 판정 → 피해 보너스 → 방패를 지나는 순서는 필드 함정과 같다. */
function applyTrap(
  gs: GameState,
  event: BossGimmickFixtureEvent,
  baseDamage: number,
  out: BossFixtureResolution
): void {
  const character = gs.character
  if (event.cause === 'cleared') {
    out.trapsCleared++
    gs.onTrapResolved?.()
    return
  }
  out.trapsTriggered++
  // 함정의 대가/도적: 밟아도 피해를 통째로 넘긴다. 필드 함정과 같은 확률을 쓴다.
  if (character.trapIgnoreChance > 0 && Math.random() < character.trapIgnoreChance) {
    out.trapsIgnored++
    gs.onTrapResolved?.()
    return
  }
  const penalty = Math.max(0, baseDamage + character.trapDamageBonus)
  out.trapDamageTaken += character.takeDamage(penalty)
  gs.onTrapResolved?.()
}

/** 보물 한 칸 — 손패를 준다. 손이 가득 차면 그만큼만 들어간다. */
function applyTreasure(gs: GameState, _event: BossGimmickFixtureEvent, out: BossFixtureResolution): void {
  const character = gs.character
  out.treasuresOpened++
  for (let i = 0; i < BOSS_GIMMICK_TREASURE_CARDS; i++) {
    if (!character.hasHandRoom()) break
    const card = DropSystem.generateDrop('treasure')
    if (!character.addHandCard(card)) break
    out.treasureCardNames.push(getHandCardDef(card.defId).name)
  }
}
