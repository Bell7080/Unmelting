/**
 * 기초 해금팩 — 거점 무역 2번 탭. 메타 잠금(디자인 시점 `runLocked`/`metaLocked`) 카드 중
 * "인게임에 곧바로 필요 없지만 좋은" 손패/유물 일부를 큐레이션해, 2$에 5장 중 1장을 영구
 * 메타 해금한다.
 *
 * 해금이 뜻하는 바는 손패/유물이 다르다:
 * - 유물: 해금 즉시 기본 유물 풀(상점/제단/이벤트/보스 보상)에 합류한다 — 매 런 곧바로 등장한다.
 * - 손패: 해금해도 곧바로 손에 들어오지 않는다. "기존 해금팩(런 한정 임시 해금)" 후보 풀에
 *   합류할 뿐이다 — 해금 전엔 그 풀에도 아예 없어 영원히 만날 수 없던 카드가, 해금 후엔 다른
 *   runLocked 카드처럼 매 런 해금팩을 열어야 만날 수 있게 된다.
 *
 * 추가로 두 가지 사용자 제어가 있다:
 * - 온오프: 기본 해금(항상 켜진) 항목 제외, 이 팩으로 해금한 항목만 개별로 껐다 켤 수 있다.
 *   꺼도 소유(owned)는 유지된다 — 유물은 풀 등장을, 손패는 해금팩 등장을 잠시 멈출 뿐이다.
 *   무역 탭에 상시 두지 않고, 런 시작(직업 선택 뒤) 화면에서 한 번 지나가며 고른다
 *   (`openUnlockLoadoutScreen`, `src/index.ts`).
 * - 시작부터 해금: 소유한 손패 중 이번 런에 한해 해금팩 없이 턴 1부터 바로 쓸 카드를
 *   런 시작 드래프트(카드팩 1장 선택)로 고른다. 상한은 STARTING_UNLOCK_DRAFT_CAP다.
 */
import type { HandCardId } from '@entities/HandCard'
import type { RelicId } from '@data/Relics'

const CARD_PREFIX = 'unmelting.meta.cardUnlock.'
const RELIC_PREFIX = 'unmelting.meta.relicUnlock.'
const CARD_POOL_DISABLED_PREFIX = 'unmelting.meta.cardPoolOff.'
const RELIC_POOL_DISABLED_PREFIX = 'unmelting.meta.relicPoolOff.'

/** 곧바로 필요 없되 좋은 손패 10종 — 전부 `runLocked: true`(HandCards.ts)라 원래는 데이터만으론
 *  기존 해금팩과 구분이 없다. 이 목록에 있는 동안은 해금 전까지 그 해금팩 후보에서도 아예
 *  빠진다(getRunEligibleCardIds) — 해금해야 비로소 "다른 runLocked 카드처럼" 만날 수 있다. */
export const BASIC_UNLOCK_PACK_CARDS: HandCardId[] = [
  'candle-tome', 'bonfire', 'top-hat', 'blade-tome', 'scabbard', 'teapot',
  'teacup', 'watering-can', 'garden-scissors', 'hand-mirror',
]

/** 곧바로 필요 없되 좋은 유물 6종 — `metaLocked: true`(Relics.ts)라 기본 유물 풀(상점/
 *  제단/이벤트/보스 보상)에 아예 등장하지 않는다. 여기서 해금해야 그 풀에 합류한다. */
export const BASIC_UNLOCK_PACK_RELICS: RelicId[] = [
  'annabella-ring', 'annabella-pendant', 'precious-head', 'golden-key', 'chivalry', 'great-negotiation',
]

/** 팩을 열 때마다 보여줄 선택지 수. 남은 풀이 이보다 적으면 남은 만큼만 보여준다. */
export const BASIC_UNLOCK_PACK_CHOICE_COUNT = 5
/** 픽 1회당 가격($). */
export const BASIC_UNLOCK_PACK_PRICE = 2
/** "시작부터 해금" 드래프트 상한 — 처음엔 1장만. 나중에 메타 성장으로 늘릴 여지를 남겨 상수로 둔다. */
export const STARTING_UNLOCK_DRAFT_CAP = 1

export function isBasicUnlockCardOwned(id: HandCardId): boolean {
  return window.localStorage.getItem(CARD_PREFIX + id) === '1'
}

export function setBasicUnlockCardOwned(id: HandCardId, on: boolean): void {
  if (on) window.localStorage.setItem(CARD_PREFIX + id, '1')
  else window.localStorage.removeItem(CARD_PREFIX + id)
}

export function isBasicUnlockRelicOwned(id: RelicId): boolean {
  return window.localStorage.getItem(RELIC_PREFIX + id) === '1'
}

export function setBasicUnlockRelicOwned(id: RelicId, on: boolean): void {
  if (on) window.localStorage.setItem(RELIC_PREFIX + id, '1')
  else window.localStorage.removeItem(RELIC_PREFIX + id)
}

/** 해금한 손패의 해금팩 등장 온오프(기본 켜짐). 꺼도 소유는 유지된다. */
export function isCardUnlockPackEnabled(id: HandCardId): boolean {
  return window.localStorage.getItem(CARD_POOL_DISABLED_PREFIX + id) !== '1'
}

export function setCardUnlockPackEnabled(id: HandCardId, on: boolean): void {
  if (on) window.localStorage.removeItem(CARD_POOL_DISABLED_PREFIX + id)
  else window.localStorage.setItem(CARD_POOL_DISABLED_PREFIX + id, '1')
}

/** 해금한 유물의 풀 등장 온오프(기본 켜짐). 꺼도 소유는 유지된다. */
export function isRelicPoolEnabled(id: RelicId): boolean {
  return window.localStorage.getItem(RELIC_POOL_DISABLED_PREFIX + id) !== '1'
}

export function setRelicPoolEnabled(id: RelicId, on: boolean): void {
  if (on) window.localStorage.removeItem(RELIC_POOL_DISABLED_PREFIX + id)
  else window.localStorage.setItem(RELIC_POOL_DISABLED_PREFIX + id, '1')
}

/** 유물이 기본 유물 풀에 노출될 수 있는지 — metaLocked가 아니거나(항상 켜짐),
 *  해금 + 온오프 모두 켜졌을 때만 true. 상점/제단/이벤트/보스 보상 풀이 전부 이 함수를
 *  거쳐야 한다(단일 창구). */
export function isRelicMetaAvailable(id: RelicId, getRelicDef: (id: RelicId) => { metaLocked?: boolean }): boolean {
  const def = getRelicDef(id)
  if (!def.metaLocked) return true
  return isBasicUnlockRelicOwned(id) && isRelicPoolEnabled(id)
}

/** 손패가 해금팩(런 한정 임시 해금) 후보로 노출될 수 있는지 — 기초 해금팩 대상이 아니면
 *  항상 true(기존 runLocked 카드는 이 팩과 무관), 대상이면 해금 + 온오프 모두 켜졌을 때만. */
export function isCardEligibleForUnlockPack(id: HandCardId): boolean {
  if (!BASIC_UNLOCK_PACK_CARDS.includes(id)) return true
  return isBasicUnlockCardOwned(id) && isCardUnlockPackEnabled(id)
}

export interface BasicUnlockPoolItem {
  kind: 'card' | 'relic'
  id: HandCardId | RelicId
}

/** 아직 해금하지 않은 풀 전체(카드+유물 합산). 팩을 열 때 여기서 무작위로 뽑는다. */
export function getBasicUnlockRemainingPool(): BasicUnlockPoolItem[] {
  const cards: BasicUnlockPoolItem[] = BASIC_UNLOCK_PACK_CARDS
    .filter((id) => !isBasicUnlockCardOwned(id))
    .map((id) => ({ kind: 'card', id }))
  const relics: BasicUnlockPoolItem[] = BASIC_UNLOCK_PACK_RELICS
    .filter((id) => !isBasicUnlockRelicOwned(id))
    .map((id) => ({ kind: 'relic', id }))
  return [...cards, ...relics]
}

/** 이미 해금한 항목(카드+유물) 전체 — 런 시작 해금 목록 온오프 화면(`openUnlockLoadoutScreen`,
 *  `src/index.ts`)이 쓴다. */
export function getBasicUnlockOwnedPool(): BasicUnlockPoolItem[] {
  const cards: BasicUnlockPoolItem[] = BASIC_UNLOCK_PACK_CARDS
    .filter((id) => isBasicUnlockCardOwned(id))
    .map((id) => ({ kind: 'card', id }))
  const relics: BasicUnlockPoolItem[] = BASIC_UNLOCK_PACK_RELICS
    .filter((id) => isBasicUnlockRelicOwned(id))
    .map((id) => ({ kind: 'relic', id }))
  return [...cards, ...relics]
}

/** "시작부터 해금" 드래프트 후보 — 해금팩 등장이 켜진(=해금팩으로 만날 수 있는) 소유 손패만.
 *  꺼둔 카드는 이번 런에 아예 안 보고 싶다는 뜻이라 드래프트 후보에서도 뺀다. */
export function getStartingUnlockDraftCandidates(): HandCardId[] {
  return BASIC_UNLOCK_PACK_CARDS.filter((id) => isBasicUnlockCardOwned(id) && isCardUnlockPackEnabled(id))
}

/** 개발용 전체 해금 — /테스트 진입 시 기초 해금팩 풀도 함께 전부 연다(온오프는 항상 켠 채로). */
export function unlockAllBasicUnlockPack(): void {
  for (const id of BASIC_UNLOCK_PACK_CARDS) setBasicUnlockCardOwned(id, true)
  for (const id of BASIC_UNLOCK_PACK_RELICS) setBasicUnlockRelicOwned(id, true)
}
