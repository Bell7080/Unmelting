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

### Folder Structure (current)

```
/src
  index.ts                # Main game loop, event wiring, global styles
  index.html              # Page shell + base CSS variables
  /core                   # Core game engine
    GameState.ts          # Central state manager
    TurnManager.ts        # Turn phase orchestration
  /systems                # Major gameplay systems
    ActionSystem.ts       # Player actions on selected card
    CardSpawner.ts        # Random card generation per turn
    DropSystem.ts         # Item drops + item application
  /entities               # Data models
    Card.ts               # Card model (enemy/trap/treasure + grouping)
    Character.ts          # Player character (HP, damage, items)
    Lane.ts               # Single lane with distance slots
  /ui                     # UI rendering & interaction
    GameBoardRenderer.ts  # 3×3 rail, player block, items, animations
    ActionUI.ts           # Action helpers
    FontManager.ts        # Font loading + 12px minimum enforcement
    Sprites.ts            # webp sprite registry + per-card mapping
    Icons.ts              # Inline-SVG flat icons (sword, heart, candle…)
  /assets
    /fonts                # OkDanDan custom font (woff2)
    /fonts/sprites        # Card / player / background webp art
```

> Older drafts referenced `/data` and `/utils` directories. Current MVP keeps
> card definitions inline in `CardSpawner` and item logic in `DropSystem`;
> there is no separate config or utility layer yet.

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

### Sprite & Icon System (implemented)
- Hand-drawn card art lives under `src/assets/fonts/sprites/*.webp`. The
  registry/mapping is centralized in `src/ui/Sprites.ts`:
  - **Player**: `player_001` (used as the framed portrait on the player card).
  - **Background**: `background_001` is the global page backdrop. The rail
    itself stays a translucent dark slab on top of it for separation.
  - **Normal enemies (1-cell)**: name-matched — 양초 생쥐 → `enemy_001`,
    양초 개구리 → `enemy_002`.
  - **Merged enemies (2/3-cell)**: stable random pick of `enemy_001` /
    `enemy_002` based on a hash of the card id.
  - **Mimic (special enemy)**: `enemy_003`.
  - **Treasure**: `chest_001` / `chest_002` / `chest_003` by group width.
  - **Trap**: `trap_001` for every trap width.
- UI iconography uses inline-SVG flat icons in `src/ui/Icons.ts` (`sword`,
  `heart`, `candle`, `pouch`, `coin`). Emojis must not be used for stat
  representation — they break the warm illustrated tone.
- Each card face layers `card-art` (sprite) → `card-overlay` (bottom-anchored
  dark gradient) → `card-content` (name + stats), so text remains legible over
  any artwork.

### Visual Effect System — SquareBurst (unified)

All transient visual feedback uses the **SquareBurst** module
(`src/ui/SquareBurst.ts`). Per-event ad-hoc effects (red vignettes, custom
particle systems, etc.) are forbidden — every flash, pop, smoke, or pickup
must go through SquareBurst so the visual language stays consistent and
never competes with the ember-driven brightness pass.

**Format spec (mandatory for every burst)**:
- A burst is **16~20 solid-color squares** that scatter outward from an
  origin point and fade.
- Each burst draws from a **4-shade palette interpolated between two anchor
  colors** (e.g. red → yellow, black → white, black → yellow). The two
  anchors define the theme; the 4 shades are sampled to give visual depth
  without breaking the palette.
- Squares are 10~22 px solid fills, randomized rotation, scattered radially
  in a 35–100% of the spread radius.
- Animation is ~520–650 ms total: appear → scatter → fade. Origin can be a
  DOM element (anchored to its center) or a viewport pixel.
- Bursts are pointer-event-transparent and live on a single body-mounted
  overlay (`#square-burst-overlay`, `z-index: 220`).

**Theme registry** (extend `BurstTheme` in `SquareBurst.ts` for new themes —
each theme MUST define a 4-shade palette between two anchor colors):

| Theme | Anchors | Used for |
|---|---|---|
| `damage` | oxblood → ember yellow | Player hit, enemy slam, player attack impact |
| `score` | wax brown → candle yellow | Score gain pulse |
| `treasure-gain` | brass → bright gold | Treasure chest opened |
| `vanish-smoke` | char black → ash white | Card disappears (smoke feel) |
| `mimic-shift` | bruised violet → moss | Treasure morphs into mimic |
| `hand-recovery` | deep green → pale green | Recovery hand cards |
| `hand-tool` | dark amber → pale amber | Tool hand cards (성냥, 열쇠) |
| `hand-control` | navy → pale blue | Control hand cards (식은 양초, 정화) |
| `hand-attack` | oxblood → ember | Attack hand cards (성냥다발) |

**Adding a new event**: pick the right theme (or add a new one with a
2-anchor / 4-shade palette), then call from the renderer or `index.ts`:
```ts
boardRenderer.burstAtElement(element, 'theme-id')
boardRenderer.burstAtPoint(x, y, 'theme-id', { count, spread, duration })
SquareBurst.playOn(element, 'theme-id')
```
Helpers `findCardElement(cardId)`, `findHandSlotElement(slot)`, and
`findScorePulseAnchor()` on `GameBoardRenderer` resolve common anchors.

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

---

## ⚠️ Implementation Notes & Requirements Tracking

### Distance/Position Indexing
- **Code representation**: Distance is 0-indexed `[0, 1, 2, 3]` where:
  - Distance[0] = Closest to player (collision zone)
  - Distance[3] = Farthest from player
- **Concept document**: Uses 1-indexed `[1칸, 2칸, 3칸, 4칸]`
  - 1칸 = 근접 거리 (closest)
  - 4칸 = 먼 거리 (farthest)
- **Resolution**: Both representations refer to the same 4-slot structure. Maintain 0-indexed internally, convert to 1-indexed in UI/documentation.

### Character Stats (from concept: "양초, 우표, 밀랍, 기억, 저주")
- **Candles** (양초): Recovery/survival resource
- **Stamps** (우표): Passive enhancement
- **Wax** (밀랍): Risky power enhancement
- **Memory** (기억): Unlocks stage reward abilities
- **Curses** (저주): Risk mechanic with ability changes
- Current implementation: ✅ All stats tracked in Character.stats

### Turn Order (UPDATED: MVP Simplified)
1. ✅ **Player Selection**: Choose 1 of 3 lanes (enemy/trap/treasure)
2. ✅ **Player Action**: Execute chosen action on selected lane
3. ✅ **Card Advance**: All cards move 1 space toward player
4. ✅ **Collision Processing**: Handle cards reaching Distance[0]
5. ✅ **Drop System**: Enemy defeat → reward card drops
6. ⏳ **Turn End**: Next turn begins

### Card Types (CRITICAL CHANGE: MVP = 3 types only)
**NOT 6 types. MVP focuses on:**
- **Enemy** (적): Attacks player each turn, drops loot on defeat
- **Trap** (함정): Blocks lane, 3 consecutive traps = instant death
- **Treasure** (보물상자): Provides rewards, 50% disappears/10% becomes mimic per turn

### Card Grouping Mechanic (NEW)
Same card type stacking in same position:
- **Enemy Stack**:
  - 2x: Health +50%, Damage +1
  - 3x: Health +100%, Damage +2
- **Trap Stack**:
  - 2x: Damage taken +1
  - 3x on all lanes: Instant death (cannot evade)
- **Treasure Stack**:
  - 2x: Reward 2x
  - 3x: Reward 4x (extremely rare)

### Drop System (NEW)
Enemy defeat → 1 of 4 basic items drops:
- **Health Potion**: +1 Health (40%)
- **Large Potion**: +2 Health (30%)
- **Attack Boost**: +1 Attack next turn (20%)
- **Defense Boost**: -1 Incoming damage (10%)

**Hand/Inventory System:**
- Not deck-building (no shuffling or card mechanics)
- Resource/item management (consumable feel)
- Used with action or passively applied
- Future items: Trap kits, Keys, Freeze crystals, Skip tokens, etc.

### Player Action Model (SIMPLIFIED)
**Each turn: Select 1 lane, perform 1 action:**
- **Attack Enemy**: Player strikes first → Enemy counterattack
- **Evade Trap**: Trap is cleared, next card advances
- **Take Treasure**: Reward added to hand

### Game Feel Requirements (from concept)
- **Core emotion**: "저 보상 먹고 싶은데, 지금 먹으면 위험하다"
  - UI must show threat level per lane
  - Choice pressure drives decision-making
- **Visual tone**: "몽글몽글 다크판타지"
  - Cute but eerie aesthetic
  - Minimal animations
  - Warm candlelight + cold darkness contrast

### MVP Scope (UPDATED: Drastically Simplified)
- **Card Types**: 3 (Enemy, Trap, Treasure)
- **Lanes**: 3 lanes × 4 distance slots
- **Item System**: 4 basic consumables (drops only)
- **Game Duration**: Survive X turns or die
- **Player**: 1 character (녹지 않는 소녀)
- **No**: bosses, story, difficulty selection, character variety, Electron packaging


### Chain Combo Timing/UI (UPDATED)
- Hand-card use now resolves in two visible beats: first the individual hand-card effect, then any newly satisfied recipe after a short UI delay (`COMBO_TRIGGER_DELAY_MS` in `src/index.ts`). This keeps combinations such as `밀랍 방패 → 밀랍 돌진` from feeling simultaneous on laggy machines.
- `HandSystem.useSingle` only applies the single-card effect and extends the chain. Delayed combo resolution is triggered by `HandSystem.firePendingRecipes` from the UI flow so removed-field-card animations can be separated by beat.
- The floating chain banner uses top-center, text-only glow styling aligned with the target-selection banner/turn overlay. Avoid restoring pill/circular backgrounds unless the whole top HUD language changes together.

### Post-MVP Features (Planning Only, NOT in current implementation)
- Multiple playable characters with unique abilities
- Difficulty modes (Easy/Normal/Hard/Nightmare)
- Game modes (Story/Infinite)
- Advanced items (trap kits, keys, freeze, skip, etc.)
- Electron packaging for Steam release
- Platform expansion (mobile, etc.)

**CRITICAL**: Focus entirely on making core game loop fun first. All other features depend on this working.

### Status & Tracking
- ✅ = Implemented
- ⏳ = In progress
- ❓ = Needs clarification
- ❌ = Not started

