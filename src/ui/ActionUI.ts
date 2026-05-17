/**
 * ActionUI - MVP: Shows action buttons for selected card
 */

import { Card, CardType } from '@entities/Card'
import { ActionType } from '@systems/ActionSystem'

export type ActionCallback = (laneIndex: number, card: Card, actionType: ActionType) => void

export class ActionUI {
  private containerElement: HTMLElement
  private onActionCallback: ActionCallback | null = null
  private currentCard: Card | null = null
  private currentLane: number | null = null

  constructor(containerId: string = 'action-ui') {
    const container = document.getElementById(containerId)
    if (!container) {
      throw new Error(`Container ${containerId} not found`)
    }
    this.containerElement = container
  }

  /**
   * Show action buttons for a specific card
   */
  showActions(laneIndex: number, card: Card): void {
    this.currentCard = card
    this.currentLane = laneIndex

    const actions = this.getAvailableActions(card)
    this.render(card, actions)
  }

  /**
   * Hide action buttons
   */
  hideActions(): void {
    this.containerElement.innerHTML = ''
    this.currentCard = null
    this.currentLane = null
  }

  /**
   * Register callback for action selection
   */
  onAction(callback: ActionCallback): void {
    this.onActionCallback = callback
  }

  private getAvailableActions(card: Card): ActionType[] {
    switch (card.type) {
      case CardType.ENEMY:
        return [ActionType.ATTACK_ENEMY]
      case CardType.TRAP:
        return [ActionType.EVADE_TRAP]
      case CardType.TREASURE:
        return [ActionType.TAKE_TREASURE]
      default:
        return []
    }
  }

  private render(card: Card, actions: ActionType[]): void {
    const actionButtons = actions.map((action) => this.getActionButton(action, card)).join('')

    this.containerElement.innerHTML = `
      <div class="action-panel">
        <div class="action-card-info">
          <div class="action-card-name">${card.name}</div>
          <div class="action-card-desc">${card.description}</div>
        </div>
        <div class="action-buttons">
          ${actionButtons}
          <button class="action-btn cancel-btn" data-action="cancel">Cancel</button>
        </div>
      </div>
    `

    this.addStyles()
    this.attachEventListeners(actions)
  }

  private getActionButton(action: ActionType, _card: Card): string {
    const labels: Record<ActionType, string> = {
      [ActionType.ATTACK_ENEMY]: `⚔️ Attack`,
      [ActionType.EVADE_TRAP]: `🏃 Evade`,
      [ActionType.TAKE_TREASURE]: `💰 Take`,
      [ActionType.TAKE_FLOWER]: `✦ Harvest`,
    }

    return `<button class="action-btn" data-action="${action}">${labels[action]}</button>`
  }

  private attachEventListeners(actions: ActionType[]): void {
    for (const action of actions) {
      const button = this.containerElement.querySelector(`[data-action="${action}"]`)
      if (button) {
        button.addEventListener('click', () => {
          if (this.onActionCallback && this.currentCard && this.currentLane !== null) {
            this.onActionCallback(this.currentLane, this.currentCard, action)
            this.hideActions()
          }
        })
      }
    }

    const cancelBtn = this.containerElement.querySelector('[data-action="cancel"]')
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => this.hideActions())
    }
  }

  private addStyles(): void {
    if (document.getElementById('action-ui-styles')) return

    const style = document.createElement('style')
    style.id = 'action-ui-styles'
    style.textContent = `
      .action-panel {
        background-color: var(--color-bg-secondary);
        border: 2px solid #f4a460;
        border-radius: 8px;
        padding: 16px;
        margin: 16px;
      }

      .action-card-info {
        margin-bottom: 12px;
      }

      .action-card-name {
        font-size: var(--font-size-lg);
        font-weight: bold;
        color: #f4a460;
        margin-bottom: 4px;
      }

      .action-card-desc {
        font-size: var(--font-size-sm);
        color: #ccc;
      }

      .action-buttons {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }

      .action-btn {
        flex: 1;
        min-width: 80px;
        padding: 10px 16px;
        background-color: #2a3d5a;
        border: 1px solid #f4a460;
        color: var(--color-text-primary);
        border-radius: 4px;
        cursor: pointer;
        font-size: var(--font-size-base);
        font-weight: bold;
        transition: all 0.2s;
      }

      .action-btn:hover {
        background-color: #3a5d7a;
        border-color: #ff8c42;
      }

      .action-btn:active {
        transform: scale(0.98);
      }

      .cancel-btn {
        background-color: #3a2a2a;
        border-color: #666;
        flex: 1;
      }

      .cancel-btn:hover {
        background-color: #5a3a3a;
        border-color: #999;
      }
    `
    document.head.appendChild(style)
  }
}
