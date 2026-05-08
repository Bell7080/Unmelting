/**
 * DropSystem - Generates item drops when enemies are defeated
 * MVP: 4 basic items
 */

export interface ItemDrop {
  name: string
  description: string
  effect: 'heal-small' | 'heal-large' | 'damage-boost' | 'trap-disarm'
}

export class DropSystem {
  private static readonly ITEM_POOL: ItemDrop[] = [
    {
      name: '🧪 작은 양초',
      description: '체력 +1',
      effect: 'heal-small',
    },
    {
      name: '🕯 큰 양초',
      description: '체력 +2',
      effect: 'heal-large',
    },
    {
      name: '🔥 불꽃 부적',
      description: '공격력 영구 +1',
      effect: 'damage-boost',
    },
    {
      name: '🛡 밀랍 방패',
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

  static generateDrop(): ItemDrop {
    const roll = Math.random() * 100
    if (roll < 40) return this.ITEM_POOL[0] // 40% Health Potion
    if (roll < 70) return this.ITEM_POOL[1] // 30% Large Potion
    if (roll < 90) return this.ITEM_POOL[2] // 20% Attack Boost
    return this.ITEM_POOL[3] // 10% Defense Boost
  }

  static applyItem(item: ItemDrop, onApply: (effect: string, value?: number) => void): void {
    switch (item.effect) {
      case 'heal-small':
        onApply('heal', 1)
        break
      case 'heal-large':
        onApply('heal', 2)
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
