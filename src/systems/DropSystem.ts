/**
 * DropSystem - Generates item drops when enemies are defeated
 * MVP: 4 basic items
 */

export interface ItemDrop {
  name: string
  description: string
  effect: 'max-health-small' | 'max-health-large' | 'damage-boost' | 'trap-disarm'
}

export class DropSystem {
  /**
   * Shared hand/log order for items so every UI surface lists rewards the
   * same way the player's hand visually sorts them.
   */
  private static readonly ITEM_HAND_ORDER: Record<ItemDrop['effect'], number> = {
    'max-health-small': 0,
    'max-health-large': 1,
    'damage-boost': 2,
    'trap-disarm': 3,
  }

  private static readonly ITEM_POOL: ItemDrop[] = [
    {
      name: '작은 양초',
      description: '최대 체력 +1 (동시에 1 회복)',
      effect: 'max-health-small',
    },
    {
      name: '큰 양초',
      description: '최대 체력 +2 (동시에 2 회복)',
      effect: 'max-health-large',
    },
    {
      name: '불꽃 부적',
      description: '공격력 영구 +1',
      effect: 'damage-boost',
    },
    {
      name: '밀랍 방패',
      description: '선택한 함정 파괴',
      effect: 'trap-disarm',
    },
  ]

  /** Find an item definition by its displayed hand name. */
  static getItemByName(name: string): ItemDrop | null {
    return this.ITEM_POOL.find((item) => item.name === name) ?? null
  }

  /** Expose current item definitions for UI/help text without allowing mutation. */
  static getItemPool(): ItemDrop[] {
    return [...this.ITEM_POOL]
  }

  /** Return the stable hand/log rank used for item sorting across the UI. */
  static getHandSortRank(name: string): number {
    const item = this.getItemByName(name)
    if (!item) return Number.MAX_SAFE_INTEGER
    return this.ITEM_HAND_ORDER[item.effect] ?? Number.MAX_SAFE_INTEGER
  }

  static generateDrop(): ItemDrop {
    const roll = Math.random() * 100
    if (roll < 40) return this.ITEM_POOL[0] // 40% Small max-health boost
    if (roll < 70) return this.ITEM_POOL[1] // 30% Large max-health boost
    if (roll < 90) return this.ITEM_POOL[2] // 20% Attack Boost
    return this.ITEM_POOL[3] // 10% Defense Boost
  }

  static applyItem(item: ItemDrop, onApply: (effect: string, value?: number) => void): void {
    switch (item.effect) {
      case 'max-health-small':
        onApply('max-health', 1)
        break
      case 'max-health-large':
        onApply('max-health', 2)
        break
      case 'damage-boost':
        onApply('damage-boost', 1)
        break
      case 'trap-disarm':
        onApply('trap-disarm')
        break
    }
  }
}
