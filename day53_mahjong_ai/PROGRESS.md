## Day53: CPU対戦付き二人麻雀 (最強AI) - 進捗

### Project Progress

- [x] **Step 1: Project Initialization**
    - [x] Copy `template` to `day53_mahjong_ai`.
    - [x] Update `package.json` (name: `day53_mahjong_ai`).
    - [x] Update `README.md` with project plan.
    - [x] Create and update `PROGRESS.md`.
    - [x] Create basic `app/layout.tsx` and `app/page.tsx`.
    - [x] Update `app/globals.css` for Tailwind v4 and Claymorphism basics.
    - [x] Fix Linter errors (reinstall `node_modules`).
    - [x] Start dev server: `npm run dev -- --port 3001`.
- [x] **Step 2: Mahjong Core Logic (Tiles & Yama)** (`lib/mahjong/tiles.ts`, `lib/mahjong/yama.ts`)
    - [x] Define tile suits, honor types, `Tile` interface, all 34 tile prototypes.
    - [x] Implement utility functions (`compareTiles`, `tileFromString`, `tilesToStrings`, `isSameTile`).
    - [x] Implement `Yama` interface, `createYama` (136 tiles, shuffled, Wanpai, Dora indicator).
    - [x] Implement `dealInitialHands`, `drawTile`, `drawRinshanTile`, `getDoraFromIndicator`, `getCurrentDora`.
    - [x] Test with `test-mahjong-core.ts` (deleted after use).
- [x] **Step 3: Mahjong Core Logic (Hand & Shanten)** (`lib/mahjong/hand.ts`)
    - [x] Implement hand management (`addTileToHand`, `removeTileFromHand`, `countTiles`)
    - [x] Implement basic win condition checks (`isBasicAgari`, `isChiitoitsu`, `isKokushiMusou`)
    - [x] Implement simplified Shanten calculation (`analyzeHandShanten`) for win, Kokushi tenpai, Chiitoi tenpai, and basic 13-tile tenpai.
    - [x] Test with `test-mahjong-hand.ts` (deleted after use).
- [x] **Step 4: API Implementation (Game Start & Basic Actions)**
    - [x] Define game state (`lib/mahjong/game_state.ts`: `PlayerID`, `GamePhase`, `PlayerState`, `GameState`, `createInitialGameState`).
    - [x] Create `/api/game/new` (GET) endpoint: initialize game, yama, hands, dora, store in-memory.
    - [x] Create `/api/game/action` (POST) endpoint: handle player `discard`, basic CPU turn (draw & random discard), player's next draw, update state.
    - [x] Implement shared in-memory game store (`lib/mahjong/game_store.ts`).
    - [x] Test `/api/game/new` and `/api/game/action` with `curl`.
    - [x] Integrate and test core Yaku/Score logic (`yaku.ts`, `score.ts`) via `analyzeHandShanten` in `hand.ts` using `hand.test.ts`.
- [ ] **Step 5: UI Implementation (Basic Game Screen)**
    - [x] Create main React component for the Mahjong table (`app/page.tsx`).
    - [x] Style components using Tailwind CSS with a Claymorphism theme (`globals.css`, `page.tsx`).
    - [x] Fetch initial game state from `/api/game/new` on page load.
    - [x] Implement player tile discard action (calls `/api/game/action`).
    - [x] Create sub-components:
        - [x] Tile component (`components/mahjong/TileDisplay.tsx` - currently in `page.tsx`).
        - [ ] Player's hand display (in `page.tsx`).
        - [ ] CPU's (opponent's) hand display (tiles face down, count visible) (in `page.tsx`).
        - [ ] Player's river (discarded tiles) (in `page.tsx`).
        - [ ] CPU's river (in `page.tsx`).
        - [ ] Dora indicator display (in `page.tsx`).
        - [ ] Yama (deck) display (remaining tile count) (in `page.tsx`).
        - [ ] Scoreboard / Game info display (current turn, round, player scores) (in `page.tsx`).
        - [ ] Action buttons (e.g., Discard) (in `page.tsx`).
- [ ] **Step 6: Mahjong Core Logic (Yaku & Score - Refinement)**
    - [ ] Refine Yaku detection in `lib/mahjong/yaku.ts` (Pinfu, Iipeikou, etc.).
    - [ ] Refine score calculation in `lib/mahjong/score.ts` (detailed Fu calculation for melds, waits, pair types).
    - [ ] Add more test cases to `hand.test.ts` for complex Yaku and scoring.
- [ ] **Step 7: CPU AI & Advanced Game Flow**
    - [ ] Enhance CPU discard logic (beyond random discard).
    - [ ] Implement Riichi decision for CPU.
    - [ ] Implement Meld decisions for CPU (Pon, Chi, Kan).
    - [ ] Implement full game flow logic in API and client (Pon, Chi, Kan, Riichi, Tsumo/Ron calls, draws, round/game end conditions).
    - [ ] Update UI to reflect advanced game actions and states.
- [ ] **Step 8: Final Touches & Documentation**
    - [ ] UI Polish and UX improvements.
    - [ ] Comprehensive error handling.
    - [ ] Update `README.md` with final app description and how to play.
    - [ ] Update `.cursor/rules/knowledge.mdc`.

以下に進捗を記載してください。


- [ ] 
- [ ] 
- [ ] 
- [ ] 
- [ ] 
- [ ] 
- [ ] 
