/**
 * Relic catalog and economy costs for the shop.
 *
 * Relics are passive run modifiers. The shop can charge several resource
 * types, so each relic exposes one or more cost options that the UI renders as
 * separate buy buttons.
 */

/** Stable id used for save/run state and shop offer generation. */
export type RelicId =
  | 'red-potion'
  | 'golden-squirrel'
  | 'wax-crow'
  | 'carving-knife'
  | 'lifeline'
  | 'blood-pack'
  | 'hope'

/** Resource that can be spent in the shop. */
export type RelicCostResource = 'coin' | 'maxHealth' | 'attack'

/** One available way to pay for a relic. */
export interface RelicCostOption {
  resource: RelicCostResource
  amount: number
}

/** Immutable relic rules used by gameplay and presentation. */
export interface RelicDefinition {
  id: RelicId
  name: string
  effect: string
  flavor: string
  costOptions: RelicCostOption[]
  /** Prevents this relic from appearing again after its one-shot removal. */
  banWhenRemoved?: boolean
}

/** Central relic table. Add future shop inventory here first. */
export const RELIC_DEFINITIONS: Record<RelicId, RelicDefinition> = {
  'red-potion': {
    id: 'red-potion',
    name: '붉은 포션',
    effect: '적 처치 시 체력 1 회복',
    flavor: '촛농처럼 진한 붉은 빛이 병 안에서 천천히 돈다.',
    costOptions: [
      { resource: 'coin', amount: 5 },
      { resource: 'maxHealth', amount: 5 },
    ],
  },
  'golden-squirrel': {
    id: 'golden-squirrel',
    name: '황금 다람쥐',
    effect: '5턴마다 1$ 획득',
    flavor: '작은 발톱으로 동전을 꼭 쥔 잡화점의 행운 부적.',
    costOptions: [{ resource: 'coin', amount: 10 }],
  },
  'wax-crow': {
    id: 'wax-crow',
    name: '밀랍 까마귀',
    effect: '보물상자 획득 시 방패 1 획득',
    flavor: '밀랍 깃털이 상자 뚜껑 소리에 맞춰 바스락거린다.',
    costOptions: [
      { resource: 'coin', amount: 10 },
      { resource: 'attack', amount: 1 },
    ],
  },
  'carving-knife': {
    id: 'carving-knife',
    name: '조각칼',
    effect: '공격력 1 증가',
    flavor: '어둠을 얇게 깎아낼 수 있을 것 같은 작은 칼.',
    costOptions: [{ resource: 'coin', amount: 6 }],
  },
  lifeline: {
    id: 'lifeline',
    name: '생명선',
    effect: '최대 체력 5 증가',
    flavor: '끊어질 듯 이어지는 따뜻한 실 한 가닥.',
    costOptions: [{ resource: 'coin', amount: 6 }],
  },
  'blood-pack': {
    id: 'blood-pack',
    name: '헌혈팩',
    effect: '최대 체력 획득 또는 체력 회복 시 전방 랜덤 적 1장에게 피해 1',
    flavor: '누군가의 온기가 아직 식지 않은 붉은 주머니.',
    costOptions: [{ resource: 'maxHealth', amount: 5 }],
  },
  hope: {
    id: 'hope',
    name: '희망',
    effect: '사망 시 체력 10으로 부활하고 필드 모든 카드를 제거. 발동 후 다시 등장하지 않음.',
    flavor: '꺼진 심지 끝에 남은 아주 작은 불빛.',
    costOptions: [{ resource: 'coin', amount: 1 }],
    banWhenRemoved: true,
  },
}

export const RELIC_IDS = Object.keys(RELIC_DEFINITIONS) as RelicId[]

/** Read a relic definition with a precise id type. */
export function getRelicDef(id: RelicId): RelicDefinition {
  return RELIC_DEFINITIONS[id]
}
