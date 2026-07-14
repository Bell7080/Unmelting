/**
 * TagReactions — 태그 반응형 유물의 데이터 주도 뼈대.
 *
 * 기존 유물 효과는 index.ts에 유물 id별로 하드코딩돼 있어 새 트리거형 유물마다 코드를
 * 고쳐야 했다. 이 모듈은 "특정 시점(trigger)에 특정 태그(anyTag)를 지닌 손패를 쓰면 효과를
 * 적용한다"는 규칙을 **데이터**로 등록하게 해, 새 태그 반응형 유물을 TAG_REACTIONS 항목
 * 추가만으로 만들 수 있게 한다. index.ts는 이 디스패처를 라이프사이클 지점에서 1회만 호출한다.
 *
 * 상태 변경(자원 지급)은 여기서 Character에 직접 반영하고, UI 피드백(트레일/배너)은 반환한
 * outcome을 index.ts가 옮긴다 — 상태는 시스템에, 표시는 렌더러에 두는 규칙을 지킨다.
 */

import type { Character } from '../entities/Character'
import type { RelicId } from '../data/Relics'
import type { SynergyTag } from '../data/Tags'
import type { HandCardId } from '../entities/HandCard'

/** 태그 반응이 걸리는 시점. 필요할 때 확장한다(예: 'enemyKilled', 'turnStart'). */
export type TagReactionTrigger = 'handCardUsed'

/** 반응 발동 시 전달되는 상황. */
export interface TagReactionContext {
  character: Character
  /** 이번 이벤트로 관여한 태그(손패 사용이면 그 손패의 synergyTags). */
  tags: readonly SynergyTag[]
  /** 트리플(합체) 사용 여부. handCardUsed에서만 의미가 있다. */
  merged: boolean
}

/** 반응이 실제로 무엇을 했는지 — index.ts가 자원 트레일/배너 연출로 옮긴다. */
export interface TagReactionOutcome {
  relicId: RelicId
  /** 체인 배너에 띄울 사람이 읽는 메시지. */
  message: string
  /** 변화한 자원의 HUD 피드백 종류(없으면 배너만). */
  feedback?: 'ember' | 'shield' | 'health' | 'candle'
}

/** 하나의 태그 반응 규칙(데이터). */
export interface TagReaction {
  relicId: RelicId
  trigger: TagReactionTrigger
  /** 이 태그 중 하나라도 이벤트 태그에 있으면 발동 후보가 된다. */
  anyTag: readonly SynergyTag[]
  /** 상태 변경을 수행하고 결과를 반환. null이면 이번엔 발동하지 않은 것으로 본다. */
  apply(ctx: TagReactionContext): TagReactionOutcome | null
}

/**
 * 태그 반응 레지스트리 — 새 태그 반응형 유물은 여기 데이터로만 추가한다.
 * (유물 정의는 Relics.ts, 아트는 Sprites.ts, 발동 규칙은 여기.)
 */
export const TAG_REACTIONS: readonly TagReaction[] = [
  {
    // 불씨 심장: 불씨 태그 손패를 쓸 때마다 불씨 게이지 +1 — 화염 덱의 경제 지속.
    relicId: 'ember-heart',
    trigger: 'handCardUsed',
    anyTag: ['flame'],
    apply: (ctx) => {
      const gained = ctx.character.gainEmber(1)
      if (gained <= 0) return null
      return { relicId: 'ember-heart', message: `불씨 +${gained}`, feedback: 'ember' }
    },
  },
]

/**
 * 파편 생성기 유물 — "눈덩이 씨앗". 적 처치 시 태그가 달린 파편 손패를 손에 흘려 넣어,
 * 혼자선 미미하지만 해당 태그 빌드를 시작하게 만든다(예: 숫돌 → 칼날 파편). 같은 생성기를
 * 여럿 보유하면 지급량이 배수로 늘어난다(중복 스택). index.ts의 처치 디스패처가 소비한다.
 * 새 생성기 = 여기 한 줄 + 파편 카드(HandCards) + 유물(Relics) 정의로 끝난다.
 */
export interface ShardGenerator {
  relicId: RelicId
  /** 처치 시 지급하는 파편 손패 id. */
  shard: HandCardId
  /** 처치 1회당 지급 수(기본 1). */
  perKill: number
}

export const SHARD_GENERATORS: readonly ShardGenerator[] = [
  // 숫돌(커먼): 처치마다 칼날 파편 1장 — 칼날 빌드의 시발점.
  { relicId: 'whetstone', shard: 'blade-shard', perKill: 1 },
]

/**
 * 주어진 시점·상황에 대해, 보유 중이고 트리거·태그 조건을 만족하는 유물 반응을 실행하고
 * 결과 목록을 반환한다. 상태 변경은 이미 반영된 상태로 돌아오며, 호출부는 outcome으로
 * UI 피드백만 재생하면 된다.
 */
export function runTagReactions(
  trigger: TagReactionTrigger,
  ctx: TagReactionContext,
): TagReactionOutcome[] {
  if (ctx.tags.length === 0) return []
  const outcomes: TagReactionOutcome[] = []
  for (const reaction of TAG_REACTIONS) {
    if (reaction.trigger !== trigger) continue
    if (!ctx.character.hasRelic(reaction.relicId)) continue
    if (!reaction.anyTag.some((t) => ctx.tags.includes(t))) continue
    const outcome = reaction.apply(ctx)
    if (outcome) outcomes.push(outcome)
  }
  return outcomes
}
