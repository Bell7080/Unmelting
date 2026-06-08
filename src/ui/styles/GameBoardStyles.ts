/**
 * Aggregates the split game-board CSS chunks in cascade order.
 * Keeping this list explicit makes future visual work easier to place.
 */
import { GAME_BOARD_BASE_STYLES } from './GameBoardBaseStyles'
import { GAME_BOARD_RAIL_STYLES } from './GameBoardRailStyles'
import { GAME_BOARD_PLAYER_SHOP_STYLES } from './GameBoardPlayerShopStyles'
import { GAME_BOARD_EFFECTS_HAND_STYLES } from './GameBoardEffectsHandStyles'
import { GAME_BOARD_COMPENDIUM_STYLES } from './GameBoardCompendiumStyles'
import { GAME_BOARD_HAND_CHAIN_STYLES } from './GameBoardHandChainStyles'
import { GAME_BOARD_PLAYER_RELIC_TRAP_STYLES } from './GameBoardPlayerRelicTrapStyles'
import { JOB_SELECT_STYLES } from './JobSelectStyles'

export const GAME_BOARD_STYLES = [
  GAME_BOARD_BASE_STYLES,
  GAME_BOARD_RAIL_STYLES,
  GAME_BOARD_PLAYER_SHOP_STYLES,
  GAME_BOARD_EFFECTS_HAND_STYLES,
  GAME_BOARD_COMPENDIUM_STYLES,
  GAME_BOARD_HAND_CHAIN_STYLES,
  GAME_BOARD_PLAYER_RELIC_TRAP_STYLES,
  JOB_SELECT_STYLES,
].join('\n')
