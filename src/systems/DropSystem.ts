/**
 * DropSystem - Generates item drops when enemies are defeated
 * MVP: 4 basic items
 */

export interface ItemDrop {
  name: string
  description: string
  effect: 'heal-small' | 'heal-large' | 'damage-boost' | 'defense-boost'
}

export class DropSystem {
  private static readonly ITEM_POOL: ItemDrop[] = [
    {
      name: 'Health Potion',
      description: '+1 Health',
      effect: 'heal-small',
    },
    {
      name: 'Large Potion',
      description: '+2 Health',
      effect: 'heal-large',
    },
    {
      name: 'Attack Boost',
      description: '+1 Attack (1 turn)',
      effect: 'damage-boost',
    },
    {
      name: 'Defense Boost',
      description: '-1 Damage (1 turn)',
      effect: 'defense-boost',
    },
  ]

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
      case 'defense-boost':
        onApply('defense-boost', 1)
        break
    }
  }
}
