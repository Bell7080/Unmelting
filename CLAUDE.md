# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Unmelting** is a card rain roguelike game where players control a single character card ("The Unmelting Girl") and navigate advancing cards (rewards, enemies, obstacles) on a 3-lane stage. The core gameplay loop involves making tactical decisions under time pressure—choosing what to prioritize, when to act, and when to endure risk.

### Key Characteristics
- **100% TypeScript** implementation (compiles to bytecode/JavaScript)
- **Single character card growth** (not deck building)
- **Lane-based card progression** (cards advance 1 space per turn)
- **Tactical positioning system** (push, pull, seal, swap, burn)
- **Dark fantasy atmosphere** with "warm candlelight" visual tone

---

## Tech Stack

- **Language**: TypeScript
- **Runtime**: Node.js / Browser (Vite/Webpack for bundling)
- **Build Target**: GitHub Pages deployment
- **Styling**: CSS with custom font manager
- **Version Control**: Git/GitHub

---

## Architecture Overview

### Game Core Structure

The game is organized around these key systems:

#### 1. **Game Loop & Turn System**
- Central game state manager handling turn progression
- Turn phases: Player Actions → Card Advance → Collision Processing → New Card Spawn
- Player gets 2 actions per turn (configurable for MVP)

#### 2. **Lane & Card System**
- **3 Lanes** with **4 distance slots** each (MVP scope)
- Cards stored in a grid structure: `Lane[0-2] x Distance[1-4]`
- Player position: `Distance[0]` (right edge of each lane)
- Card types: Enemy, Reward, Obstacle, Curse, Event, Shop

#### 3. **Character Card & Growth**
- Single playable card with mutable stats
- Growth metrics: Candles (health), Stamps (passive), Wax (power), Memory (unlocks), Curses (risk)
- All progression tied to character properties, not deck size

#### 4. **Action System**
- Attack, Targeted Attack, Dodge, Collect, Seal, Wait
- Each action consumes action points
- Actions interact with card positions and lanes

#### 5. **Collision & Effect System**
- Handles what happens when cards reach Distance[0]
- Card type → effect resolution (damage, reward gain, status, etc.)
- Triggers UI updates and game state changes

### Folder Structure (to be created)

```
/src
  /core           # Core game engine
    GameState.ts  # Central state manager
    TurnManager.ts
  /systems        # Major gameplay systems
    LaneSystem.ts
    CardSystem.ts
    CharacterSystem.ts
    ActionSystem.ts
    CollisionSystem.ts
  /entities       # Data models
    Card.ts
    Character.ts
    Lane.ts
  /ui             # UI rendering & interaction
    GameRenderer.ts
    LaneRenderer.ts
    CardRenderer.ts
    UIManager.ts
    FontManager.ts
  /data           # Game constants & configurations
    CardDefinitions.ts
    StageDefinitions.ts
    GameConfig.ts
  /utils          # Helpers
    Logger.ts
    RandomUtils.ts
```

---

## Font Management System

### Requirements
- **Minimum font size**: 12px (enforced across all UI elements)
- **Font manager**: Custom system to control font properties globally
- **Target usage**: Card text, UI labels, stage information

### FontManager Class (to implement)
```typescript
class FontManager {
  private minSize = 12;
  
  // Methods:
  // setFontSize(size: number): Ensures minimum 12px
  // applyFontStyle(element, style): Applies font config to DOM
  // defineFont(name, config): Register custom font
  // getGlobalStyles(): Returns CSS variables for font settings
}
```

---

## Development Workflow

### Initial Setup
```bash
npm install
npm run dev        # Start dev server (Vite)
npm run build      # Build for production/GitHub Pages
npm run test       # Run test suite (when added)
npm run type-check # TypeScript type checking
```

### Git Branch Strategy
- Develop on `claude/setup-game-project-0IYa0` (or assigned feature branch)
- Push to origin with: `git push -u origin <branch>`
- Main branch (`main`) is for GitHub Pages deployment

### Deployment
- GitHub Pages serves `/dist` directory on `main` branch
- Build artifacts must be committed or auto-deployed via CI/CD
- Entry point: `index.html` (root of site)

---

## MVP Scope & Deliverables

| System | Implementation |
|--------|---|
| Player character | 1 (The Unmelting Girl) |
| Enemy cards | 6 types |
| Reward cards | 6 types |
| Obstacle cards | 5 types |
| Event cards | 3 types |
| Boss card | 1 type |
| Stages | 1 initial stage |
| Lane configuration | 3 lanes × 4 distance slots |
| Turn actions | 2 per turn |

---

## Visual & Tone Guidelines

### Color Palette
- **Background**: Dark navy, charcoal, dark purple
- **Highlights**: Warm yellow, candlelight orange
- **Danger**: Deep red, murky purple
- **UI**: Aged paper, wax, black ink
- **Borders**: Burnt paper, wax seals, candle wax drips

### Art Direction
- Small card-like characters
- Hand-drawn/illustrated aesthetic
- Cute but eerie (not scary)
- Minimal animations (performance-conscious)

---

## Key Implementation Notes

1. **Card Advancement**: Cards move at fixed rate (1 space/turn). This is the heartbeat of the game.

2. **State Management**: Use immutable state patterns when possible to track turn history and enable undo/replay.

3. **Collision Order**: When multiple cards reach Distance[0], resolve in priority order (Curse → Enemy → Obstacle → Reward → Event → Shop).

4. **UI Rendering**: Separate game logic from rendering; use a renderer that can swap between Canvas/DOM based on performance needs.

5. **Font Scaling**: Always validate font sizes against the 12px minimum in FontManager before rendering.

---

## Testing Strategy (for later phases)

- Unit tests for game logic (CardSystem, TurnManager, etc.)
- Integration tests for turn flow
- Visual regression tests for card/UI rendering
- Performance benchmarks for lane rendering (3 lanes × 4 cards × N turns)

---

## Known Constraints & Design Decisions

- **Single character**: Simplifies state, amplifies growth mechanics
- **Fixed lane count**: 3 lanes chosen for visual balance and tactical depth
- **No persistent deck**: All progression is character-stat based
- **TypeScript-only**: Ensures type safety from game start
- **Minimum 12px font**: Accessibility and readability on all screen sizes

