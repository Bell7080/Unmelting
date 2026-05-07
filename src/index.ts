/**
 * Unmelting Game - Main Entry Point
 * 100% TypeScript implementation of a card rain roguelike
 */

console.log('🕯️ Unmelting Game Starting...')

const app = document.getElementById('app')
if (!app) {
  throw new Error('App container not found')
}

// Initialize basic game structure
const init = () => {
  app!.innerHTML = '<p style="padding: 20px; font-size: 16px;">Game initialization in progress...</p>'
  console.log('✓ Game initialized')
}

init()
