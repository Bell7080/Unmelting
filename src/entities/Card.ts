/**
 * Card Entity - Represents a card on the board
 */

export enum CardType {
  ENEMY = 'enemy',
  REWARD = 'reward',
  OBSTACLE = 'obstacle',
  CURSE = 'curse',
  EVENT = 'event',
  SHOP = 'shop',
  EMPTY = 'empty',
}

export interface CardEffect {
  type: string
  value?: number
  description?: string
}

export class Card {
  id: string
  type: CardType
  name: string
  description: string
  effects: CardEffect[]
  power?: number
  health?: number
  isSealed: boolean

  constructor(
    id: string,
    type: CardType,
    name: string,
    description: string,
    effects: CardEffect[] = []
  ) {
    this.id = id
    this.type = type
    this.name = name
    this.description = description
    this.effects = effects
    this.isSealed = false
  }

  seal(): void {
    this.isSealed = true
  }

  unseal(): void {
    this.isSealed = false
  }

  canAdvance(): boolean {
    return !this.isSealed
  }

  clone(): Card {
    const cloned = new Card(this.id, this.type, this.name, this.description, [
      ...this.effects,
    ])
    cloned.power = this.power
    cloned.health = this.health
    cloned.isSealed = this.isSealed
    return cloned
  }
}
