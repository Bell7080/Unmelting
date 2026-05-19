/**
 * RunCardPool - 런 내부에서만 쓰는 카드 접근 레이어.
 *
 * 메타 사당(추후 구현)에서 해금한 카드 집합(metaUnlocked)을 런 시작 시 전달받고,
 * 이번 런에서의 단일 강화/폐기/일시 잠금을 독립적으로 누적한다.
 */
import { HandCardId } from '@entities/HandCard'

export type RunCardState = 'unlocked' | 'locked' | 'banned'

export interface RunCardPoolSnapshot {
  unlocked: HandCardId[]
  locked: HandCardId[]
  banned: HandCardId[]
}

export class RunCardPool {
  private readonly unlocked = new Set<HandCardId>()
  private readonly locked = new Set<HandCardId>()
  private readonly banned = new Set<HandCardId>()

  constructor(allCards: readonly HandCardId[], metaUnlocked: readonly HandCardId[]) {
    const meta = new Set(metaUnlocked)
    for (const id of allCards) {
      // 메타 해금이 선행되지 않으면 런에서 아무리 조작해도 등장하지 않는다(이중 해금).
      if (meta.has(id)) this.unlocked.add(id)
      else this.locked.add(id)
    }
  }

  getState(id: HandCardId): RunCardState {
    if (this.banned.has(id)) return 'banned'
    if (this.unlocked.has(id)) return 'unlocked'
    return 'locked'
  }

  ban(id: HandCardId): void {
    if (!this.unlocked.has(id)) return
    this.unlocked.delete(id)
    this.banned.add(id)
  }

  unlockForRun(id: HandCardId): void {
    if (this.banned.has(id)) return
    this.locked.delete(id)
    this.unlocked.add(id)
  }

  snapshot(): RunCardPoolSnapshot {
    return {
      unlocked: [...this.unlocked],
      locked: [...this.locked],
      banned: [...this.banned],
    }
  }
}
