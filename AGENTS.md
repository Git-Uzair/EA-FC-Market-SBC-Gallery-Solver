# EA FC Transfer Market Player Buy, Sell & Sniping Arbitrage Agent Guide

## 0. START HERE - current mode: multi-card TRADING (updated 2026-09-27)

**Status.** FUT Gallery token goal is done (312/300, `COMPLETED_SETS.md`). The job now is profit from trading
FUT Gallery set cards on EA FC 27 with a **10,000-coin budget** (money tied up in held cards + open bids).
Realized profit so far: **0**. Last session: 120 searches, no trade met the margin rule (hot floors are efficient).
Load skill **`fc-market-sniping-arbitrage`** before trading: it holds every measured market fact and the rules.

**Top learnings (measured 2026-09-27, details in the skill):**
- Search results are sorted by time left, max 21 rows. A full page hides cheaper listings, so the true floor needs the
  drill-down (lower Max Buy Now until the page is not full). This is why the previous agent paid above market.
- Sales are measurable: a listing that vanished before its timer ran out was bought (listings cannot be cancelled).
- FUT.GG prices can be far off (Chupe 76: FUT.GG ~3,680 set, live floor ~4,600). Only the live market counts.
- Hot set-card floors are efficient: underpriced Buy Nows vanish in seconds; expect +100-150 per flip at best.

**The user's own stock:** 16 items already on the Transfer List (unsold, Paletools-locked) belong to the user. Never
relist, clear, or touch them. They count toward EA's 100-item Transfer List limit.

**Session start (in this order):**
1. Browser tabs: Tab 0 `https://www.fut.gg/fut-gallery/`, Tab 1 `https://www.ea.com/ea-sports-fc/ultimate-team/web-app/`.
   The USER logs in and enables Paletools on Tab 1 (never do it yourself, see section 6). Wait until they confirm.
2. Start the helper server as a background process from the repo root: `python scripts/state_server.py` (127.0.0.1:8765).
   If it fails with "address already in use", an older copy is still running: that is fine, run.js works with it.
3. Every engine call = write a JSON command to `localStorage['kilo-market-cmd']` on the EA tab
   (`playwright_browser_evaluate`), then `playwright_browser_run_code_unsafe { filename: "scripts/run.js" }`.
   Each call finishes in < 55 s (tool limit ~60 s) and auto-saves state to `data/market_state.json`.
4. `{ "op": "status" }` - holdings, open bids, realized profit, watchlist ranking. Read `data/market_state.json` too.
5. If the watchlist is empty or `discoverAgeMin` > 60: `{ "op": "discover" }` (reads FUT.GG only, no EA searches).
6. Trade loop: `{ "op": "cycle", "minProfit": 100 }` again and again. The engine picks due cards (hottest first),
   refreshes each card's exact price, measures sales, and quick-buys, bids, or waits. React to each result:
   - `stop` present -> read it: "logged out" = STOP, report, wait for the user; "halted"/"search budget" = pause until the time given.
   - `dueNow` 0 -> wait `nextDueInSec` (blocking shell sleep, <= 110 s per call) before the next cycle.
   - `hint` -> run discover. Any `BOUGHT`/`BID` line -> the next cycles settle and relist it automatically.
   - Manual cards: `{ "op": "watch", "add": [{ "search": "Turner", "rating": 81, "defId": 263012 }] }` (defId = FUT.GG player id).

**Hard rules.** Never touch club/squad/SBC cards or Paletools-locked cards; the engine only lists itemIds it bought itself.
Never exceed the budget. Only sold cards count as profit (record realized results in `TRADING_LEDGER.md`).
Never trade from FUT.GG prices (they can be badly stale) or from `data/gallery_bottleneck_targets.json` (historical).
**Not yet exercised live:** buy -> Store/Unassigned -> list, won-bid settle, expired relist. On the first real trade,
check the Transfer List by eye (`playwright_browser_snapshot`) and report the outcome before trusting it.
Retired, never run: `scripts/trade_runner.js`, `scripts/snipe_runner.js`. Sections 3-5 and 8 describe set completion.

---

### The Core FUT Gallery Buy-Sell Rule (Mandatory Invariant - Updated 2026-09-29)
- **NO PRICE CAP**: When completing FUT Gallery sets, there is NO price cap. The objective is completion: buy the lowest available Buy Now listing on the market, regardless of price.
- **BUY $\rightarrow$ SELL INSTANTLY**: Every card purchased MUST immediately be relisted on the Transfer Market:
  `Buy Now` $\rightarrow$ `Store` $\rightarrow$ `Unassigned Items` $\rightarrow$ `List on Transfer Market` $\rightarrow$ `Paletools Cheapest` (or purchase price floor) $\rightarrow$ `List for Transfer`.
- **NEVER SEND TO CLUB**: Cards must **never** be routed to My Club. Purchasing the card registers it for the FUT Gallery set, and relisting it immediately recovers the coins to maintain liquidity.

---

This repository contains three core operational engines for EA Sports FC Ultimate Team (FUT):
1. **Paletools In-App Gallery Engine** (`PALETOOLS_GALLERY.md`): Direct in-game Gallery viewer, real-time collection tracking, exact grading formula optimization, and one-click missing card market searching across all 127 sets in the Web App.
2. **FUT Gallery Set Completer**: Automates completing club sets on FUT.GG to reach token milestones (56 sets complete, 32 tracked in `COMPLETED_SETS.md`).
3. **Verified-Price Trading Engine** (`scripts/market_engine.js`): buys FUT Gallery set cards only when the live, drilled-down market price proves a margin after the 5% tax, and relists at a verified price. Only realized (sold) profit counts. Measured reality: hot set-card floors are efficient; margins are ~100-150 coins per flip at best (see skill `fc-market-sniping-arbitrage`).

---

## 1. Core Architecture & Operating Model

The workflow operates across an active Playwright browser session maintaining dedicated tabs:

| Tab | URL / Resource | Role & Lifecycle |
|---|---|---|
| **Tab 0** | `https://www.fut.gg/fut-gallery/` | **Master Planner**: Displays sets, token targets, completed sets, and holds batch/snipe config in `localStorage`. **MUST REMAIN OPEN**. |
| **Tab 1** | `https://www.ea.com/ea-sports-fc/ultimate-team/web-app/` | **Execution Engine**: Active EA FC Web App session with Paletools enabled. Performs search, snipe, buy, and relist actions. |
| **Tab 2+** | Transient URLs | Opened only for inspection/scraping, then immediately closed. |

---

## 2. Sniping & Arbitrage Operating Model (ACTIVE MODE)

- **Single source of truth**: skill `fc-market-sniping-arbitrage` (rules + measured market facts) and `scripts/market_engine.js` (implementation). If this section disagrees with them, they win.
- **Targets**: pick cards from high-token, cheap FUT.GG sets, then PROVE they are hot by measuring sales (two exact snapshots; vanished unexpired rows = sales). Never trade from a static target list; `data/gallery_bottleneck_targets.json` is historical.
- **Execution**: see section 0 (server `python scripts/state_server.py`, command in `localStorage['kilo-market-cmd']`, run `scripts/run.js`). Main op `cycle` over the watchlist; other ops `discover`, `status`, `watch`, `probe`, `hunt`, `snipe`, `maintain`, `scan`, `export` (see the skill).
- **The one buy rule**: `sell` = one ladder step under the 2nd-cheapest listing of a fresh exact snapshot (3rd-cheapest for proven-hot cards); quick-buy only if `cheapest BIN <= floor(sell * 0.95) - minProfit`; otherwise late-bid with the same cap. Never buy into a falling floor.
- **Budget & ledger**: `localStorage['kilo-market-state']` tracks every item we bought (itemId), open cost vs the 10,000 cap, and realized profit. `TRADING_LEDGER.md` records realized results only.
- **Retired**: `scripts/trade_runner.js` and `scripts/snipe_runner.js` (unverified listing prices, 10,000-coin listings, no expired-relist). They now return an error if run.

---

## 3. End-to-End Operational Workflow

```
[Tab 0: FUT Gallery]
       │
       ▼
 1. Identify next incomplete set (ranked by coin efficiency)
       │
       ▼
 2. Open set page in new Tab (Tab 2)
       │
       ▼
 3. Scrape 15 required players (Names, Ratings, FUT.GG estimated prices)
       │
       ▼
 4. Close Tab 2
       │
       ▼
[Tab 1: EA FC Web App]
       │
       ▼  (Loop through all 15 players)
 5. Navigate to Transfers -> Search the Transfer Market
       │
       ▼
 6. Type player name -> MUST click matching autocomplete suggestion
       │
       ▼
 7. Step-probe using FUT.GG estimated price as base -> Find active market floor
    (Start Max Buy Now around estimatedPrice, step up by +150..250 to hard cap, never search open 'Any')
       │
       ▼
 8. Select lowest Buy Now listing with >2m remaining (avoids snipe collisions)
       │
       ▼
 9. Buy card ("Buy Now for <price>")
       │
       ▼
10. Navigate to Store -> Click "Unassigned Items" tile
       │
       ▼
11. Select won card -> Click "List on Transfer Market"
       │
       ▼
12. Click Paletools "Cheapest" -> Poll until price updates (<10,000) or fallback to safe floor -> List for Transfer
       │
       ▼
[Tab 0: FUT Gallery]
       │
       ▼
13. Toggle set checkbox to mark as done (persists in localStorage)
       │
       ▼
14. Record completed set in COMPLETED_SETS.md
```

---

## 4. Transfer Market Execution Rules (Critical Traps & Fixes)

### Trap 1: The HTTP 409 Conflict Error (Cannot List Directly from Results)
- **Problem**: Clicking "List on Transfer Market" directly on the card in the Search Results view triggers EA backend HTTP 409 Conflict:
  > *"This item cannot be listed for transfer because there was an error."*
- **Solution (Mandatory)**:
  1. Once purchased, navigate to **Store** (`button " Store"` in sidebar navigation).
  2. The Store will show an **"Unassigned Items"** tile (`heading "Unassigned Items"`). Click it.
  3. In the Unassigned view, select the player card.
  4. Click **"List on Transfer Market"**.
  5. Click the Paletools **"Cheapest"** button (`button "Cheapest"`). This queries live market data and populates optimal Start Price and Buy Now Price.
  6. Click **"List for Transfer"**. The card lists without errors, clearing the unassigned pile.

### Trap 2: Autocomplete Selection is Required
- Typing the player name into `Type Player Name` does **not** register the player with EA backend filters.
- Always wait for the dropdown and click the autocomplete suggestion button (e.g., `button "Pelle Mattsson 72"`).

### Trap 3: Search Caching
- EA caches repeated queries with identical parameters.
- To refresh a search if listings are stale or missed, click `Back [ Digit1 ]` and alter a filter slightly (e.g., adjust Min Bid or Min Buy Now) to force a fresh query to the EA backend.

### Trap 4: Tab Index Integrity
- When opening a set page in Tab 2, use `browser_tabs` with `action: "new"`.
- After extracting data, always close Tab 2 with `browser_tabs` action: `close`, index: 2.
- Before running Web App actions, always verify active tab is Tab 1 (`browser_tabs` action: `select`, index: 1).

### Trap 5: In-Game Naming Discrepancies (Nicknames & Shirt Names)
- FUT.GG occasionally lists official full names that differ from EA's in-game card names:
  - *Carlos Benavídez* $\rightarrow$ Listed in-game as **Carlos Protesoni** (73).
  - *Abderrahman Rebbach* $\rightarrow$ Listed in-game as **Abde Rebbach** (73).
  - *Youssef Enríquez* $\rightarrow$ Listed in-game as **Yusi** (70).
- **Rule**: If typing a player's full name into autocomplete produces "No results Found", immediately clear the field and type only the player's last name or common shirt nickname.

### Trap 6: Sniping Collisions on Sub-1-Minute Listings
- Cards listed with `<1 Minute` or `<30 Seconds` remaining are frequently sniped or expired. Attempting to buy them often results in a lost click or unassigned count remaining at 0.
- **Rule**: Pick the lowest Buy Now listing that has at least **2–5 minutes remaining** (often the same price or just 50 coins higher). This guarantees 100% first-attempt buy success.

### Trap 7: The Price Sorting Illusion & FUT.GG Baseline Step-Probing
- **Problem**: The EA FC Transfer Market sorts results by **expiration time (soonest first)**, NOT by lowest Buy Now price. Searching with an unbounded price cap (`Max Buy Now = Any`) means an expiring card listed for 10,000 coins appears first even when cheaper 800-coin cards exist further down.
- **Rule (Mandatory)**: 
  1. **FUT.GG Benchmark as Base**: Each player card on the FUT.GG set subpage explicitly displays an estimated price (e.g., `0.8K` $\rightarrow$ 800 coins). Use this price as the foundation for the search.
  2. **Dynamic Step-Probing**:
     - Set initial `Max Buy Now` around `estimatedPrice * 0.9` (clamped 500–1100).
     - If `No results found`, back out (` [ Digit1 ]`) and increment `Max Buy Now` by +150 to +250 up to a hard ceiling of `Math.min(estimatedPrice * 1.8, 2800)`.
     - **NEVER clear Max Buy Now to 'Any'**.
     - If no listings exist under the ceiling, skip the player rather than overpaying.
  3. **Page 1 Evaluation**: Parse all visible cards on Page 1, extract `Buy Now: <price>`, ignore `<1 Minute` listings, verify `lowestPrice <= hardMaxCap`, and buy the minimum price listing.

### Trap 8: Disabled "Clear" Button Timeout
- When a price field is already empty, its corresponding "Clear" button is in a `disabled` state. Calling `locator.click()` will wait 30 seconds for the button to become enabled, causing avoidable delays.
- **Rule**: Always check `await clearBtn.isVisible() && await clearBtn.isEnabled()` before clicking.

### Trap 9: Client Tool Call Timeout (~60 Seconds)
- The agent harness enforces a ~60-second execution timeout per tool call.
- Processing players with human-like keystroke delays and inter-player buffers takes ~14–16 seconds per player (including step-probing and relist verification).
- **Rule**: Run set processing in **batches of 2 players** (~28–35 seconds per batch) using `scripts/run_full_set.js` with `kilo-batch-config`. 8 quick batches cleanly complete the entire 15-player set with 100% zero timeout risk.

### Trap 10: Paletools "Cheapest" Listing Latency & Bronze/Silver EA Banding Trap
- **Problem**: When `List on Transfer Market` opens, EA initializes the form with default values:
  - Gold cards: `Start Price: 300/350`, `Buy Now Price: 10,000`.
  - Silver & Bronze cards: `Start Price: 150`, `Buy Now Price: 5,000`.
  Clicking Paletools `Cheapest` queries Futbin asynchronously. For bronzes, silvers, and obscure cards, Futbin has **no live price data**, so Paletools fails silently and changes nothing. If the script naively checks `cleanVal < 10,000`, the initial `5,000` is immediately accepted, listing 200-coin bronze cards at 5,000 coins where they expire unsold.
- **Solution (Mandatory)**:
  1. Click `button "Cheapest"`.
  2. Poll `Buy Now Price` for up to 1.5 seconds.
  3. Accept Paletools price ONLY if `cleanVal < 5000 && cleanVal <= Math.max(boughtNum + 200, 1000)`.
  4. **The Purchase Price Floor Guarantee**: If Paletools does not populate a validated cheap price, ALWAYS override:
     - `safeBuyNow = Math.max(boughtNum, 200)`
     - `safeStart = safeBuyNow <= 1000 ? Math.max(safeBuyNow - 50, 150) : safeBuyNow - 100`
     - Explicitly fill `startPriceInput` and `buyNowInput` with these floor values before listing.

### Trap 11: The "Bid Status Changed" / Sniped Toast Rule
- **Problem**: When attempting to purchase a card that was just bought by another player, EA displays a toast notification (`"Bid status changed..."`, `"Item is no longer available"`, or `"Auction has expired"`), and the card fails to enter Unassigned.
- **Rule (Mandatory)**:
  1. If a toast containing `"bid status"` or `"no longer available"` is detected or Unassigned remains empty after a purchase attempt:
  2. **Do not repeat the identical failed search**. The cheapest listing is gone.
  3. Immediately increment `probePrice` (+150..250 coins) above the sniped listing price (up to `hardMaxCap`) to discover the next available price tier.
  4. Search and purchase from the fresh listing tier.

### Trap 12: Disabled "Buy Now" Button 30-Second Playwright Timeout
- **Problem**: When a listing has just expired or been sniped right as the player card is selected, EA disables the purchase button (`button.disabled`). Calling Playwright's `locator.click()` without a timeout causes Playwright to wait 30 seconds for the button to become enabled, resulting in an execution timeout.
- **Rule (Mandatory)**:
  1. Always check `if (await buyBtn.isDisabled())` before clicking.
  2. Wrap `buyBtn.click({ timeout: 2500 })` in a try/catch block.
  3. If disabled or click times out, mark as sniped and immediately step up `probePrice` to find the next active listing.

### Trap 13: Budget & Liquidity Ceiling Constraint
- **Problem**: Some club sets (e.g. Real Madrid, Manchester City, Bayern Munich) require 80k–200k+ coins in hand, which exceeds or wipes out the liquid coin balance.
- **Rule (Mandatory)**:
  1. Always inspect the live coin balance on Tab 1 before choosing a target set.
  2. Target set's "Coins needed in hand" on FUT.GG must be strictly $\le$ current liquid coin balance.
  3. Prioritize ultra-cheap Grade B club sets (coins needed: 800–3,000) to keep liquidity high and risk zero.

### Trap 14: The 100 Active Transfer List Hard Limit
- **Problem**: EA Sports FC 27 enforces an absolute hard limit of **100 total items** on the Transfer List (combining Active Transfers, Unsold Items, and Available Items). If this ceiling is reached:
  - Attempting to list cards from Unassigned will fail with backend errors.
  - Purchases get trapped in Unassigned inventory, halting automation.
- **Rule (Mandatory)**:
  1. Actively monitor the Transfer List count before starting each set or batch.
  2. Continuously click "Clear Sold" on the Transfer List to free slots from sold items.
  3. If total Transfer List items reach $\ge 85$:
     - Do not start new purchase loops.
     - Wait for active listings to expire/sell, clear sold cards, and re-list unsold cards at floor prices to maintain healthy capacity ($< 70$ items).

### Trap 15: The Bid Price vs Buy Now Price Search Filter Collision
- **Problem**: EA evaluates search filters with strict boolean AND logic across all four price fields:
  $$\text{Card Appears} \iff (\text{Bid} \ge \text{MinBid}) \land (\text{Bid} \le \text{MaxBid}) \land (\text{BuyNow} \ge \text{MinBuyNow}) \land (\text{BuyNow} \le \text{MaxBuyNow})$$
  Casual pack openers list cards at starting bid 150/300 with default `Buy Now = 5,000 / 10,000` (or at market value like 1,700).
  If `Max Buy Now` is populated with a value below the card's true market value (e.g., 550, 700, or 800), EA evaluates $10,000 \le 800 \implies \mathbf{FALSE}$ (and $1,700 \le 800 \implies \mathbf{FALSE}$), **completely eliminating 100% of available auction listings from the results**, even when multiple cards are expiring with 300-coin bids. Furthermore, cycling `Min Bid` (150 $\rightarrow$ 200 $\rightarrow$ 250) while `Max Buy Now` is capped creates an impossible query that yields zero results.
- **Rule (Mandatory)**:
  1. **Strict Filter Decoupling**:
     - **For Expiring Bidding**: Set `Max Bid = BidCap`. **`Buy Now Price` (both Min and Max) MUST REMAIN 100% EMPTY (`Any`)**. Never set a `Max Buy Now` below market floor, otherwise all auction listings are completely hidden.
     - **For Buy Now Sniping**: Set `Max Buy Now = SnipeCap`. **`Max Bid` MUST REMAIN 100% EMPTY (`Any`)**.
  2. **Reliable Clearing via Clear Buttons**: Never rely on `input.fill('')` alone. Always click the dedicated Clear buttons:
     - `Bid Price: Clear`: `page.locator('.search-price-header').first().getByRole('button', { name: 'Clear' })`
     - `Buy Now Price: Clear`: `page.locator('.search-price-header').nth(1).getByRole('button', { name: 'Clear' })`
  3. **Verification Before Search**: During bidding runs, always assert `minBuyVal === '' && maxBuyVal === ''` before clicking Search. If any Buy Now field contains a value, abort and clear before searching.

### Trap 16: The Transferred Player / Wrong Club Trap (Mandatory Club ID & Team ID Verification)
- **Problem**: In EA FC Ultimate Team, players who transferred during the season (e.g., Mohamed Bayo, Jan Ziółkowski, Saba Goglichidze, Dennis Man, etc.) have multiple card versions on the transfer market representing their former and current clubs. EA FC autocomplete only filters by the player persona, not by club. The FUT Gallery set counts ONLY items bearing the exact target club badge. Buying a card from a player's previous club will NOT advance the set counter and completely wastes coins.
- **Rule (Mandatory)**:
  1. Inspect EA's internal data model (`window.getAppMain().getRootViewController().currentController.currentController.currentController._listController.paginationViewModel.paginationList._collection`).
  2. Assert `item.teamId === target.clubId`.
  3. Discard any listing from another club, even if it is significantly cheaper or appears first.

### Trap 17: The Purchase Confirmation Modal Interception Trap
- **Problem**: When Paletools fast-buy is not active (or Paletools is disabled/un-injected), clicking "Buy Now for <price>" causes EA FC to display a confirmation modal: *"Get Now: Are you sure you want to get this item for X FUT Coins? Ok / Cancel"*. If unhandled, this modal intercepts all pointer events, causing subsequent clicks to Store/Unassigned to hang for 30 seconds and fail with a Playwright timeout.
- **Rule (Mandatory)**:
  1. Immediately after clicking `buyBtn`, check for the confirmation modal with a 1.5s timeout:
     `await page.locator('.view-modal-container button.primary, .view-modal-container button:has-text("Ok")').first().click()`.
  2. Wait for the `/bid` network response (`page.waitForResponse(r => r.url().includes('/bid'), { timeout: 8000 })`) to assert HTTP 200 before routing to Store.

### Trap 18: Hardcoded Paletools-Only Button Selectors
- **Problem**: Selectors like `button "Search [ Digit2]"` and `button " [ Digit1 ]"` are Paletools-specific label overrides. In standard Web App environments without Paletools hotkeys, these locators fail with 30-second timeouts.
- **Rule (Mandatory)**:
  - Always use flexible, resilient locators:
    - Search: `page.locator('.ut-filter-container button.btn-standard.primary, button:has-text("Search")').first()`
    - Back: `page.locator('.ut-navigation-button-control, button.btn-back, button:has-text("")').first()`
    - Transfers: `page.locator('.icon-transfer, button:has-text("Transfers")').first()`
    - Store: `page.locator('.icon-store, button:has-text("Store")').first()`
    - List on Transfer Market: `page.locator('button:has-text("List on Transfer Market")').first()`
    - List for Transfer: `page.locator('button:has-text("List for Transfer")').first()`

### Trap 19: Short-Name Autocomplete & Exact Matching (The "Isi vs Isina" Trap)
- **Problem**:
  1. For short names ($\le 4$ characters, e.g. `Isi`, `Bayo`), EA's backend autocomplete often fails to trigger on the short sequence alone unless followed by a space.
  2. A loose substring match like `txt.includes("isi")` falsely matches longer names like `"Isina Corte 80"` and selects the wrong player.
- **Rule (Mandatory)**:
  1. For names $\le 4$ characters, always append candidate variants with a trailing space (`"Isi "`, `"Bayo "`).
  2. Prioritize exact name matching on the suggestion line before substring matching:
     `namePart === targetSearch || namePart === targetLast || namePart === targetClean`.
  3. Never fall back to bare common surnames like `García`, `Santos`, `Romero`, `Touré`, or `Martins` as EA returns dozens of players with identical ratings at different clubs.

### Trap 20: Stale Roster Data (FUT.GG Set Pool Authority)
- **Problem**: Relying on real-world squads or older FIFA/FC editions causes massive failures (e.g. buying Dennis Man for Parma or Pablo Marí for Monza when neither is in the FC 27 club set).
- **Rule (Mandatory)**:
  - Always query the actual FUT.GG set pool API (`/api/fut/gallery/fc27/sets/<id>/pool/`) and check the `clubEaId` and `eaId` definitions. Only players present in that pool can count toward the set.

### Trap 21: The Special / In-Form vs Base Card Autocomplete Trap (Rating & Special Assertion)
- **Problem**: Players featured in special sets (TOTW, Heroes, Holographics, Promos) possess common/base cards (e.g. 74 Silver or 76 Gold for ~1,000 coins) alongside their Special/In-Form versions (e.g. 80+ rating for ~10,500+ coins). EA FC autocomplete searches only by the base player persona. Searching without strict rating and special validation causes the market to return the cheap base card first. Purchasing this card completely fails to satisfy the set requirement and wastes coins.
- **Rule (Mandatory)**:
  1. **Strict Rating Matching on Results**: Inspect the EA internal memory collection (`_collection[i]`) and assert `it.rating === target.rating`. Never purchase a 74/76 card when an 80+ TOTW/Special version is required.
  2. **Special Flag Verification**: Assert `it.isSpecial() === true` and `it.rareflag === target.rareflag` (e.g. rareflag 3 for TOTW, 72 for Hero).
  3. **Adaptive Price Ladder Probing**: If only base cards appear at low price tiers, the search must back out (` [ Digit1 ]`) and step up the probe price until the true special card price tier is reached.
  4. **Strict EA Price Ladder Compliance**: Starting price and probe increments must adhere to EA's discrete ladder steps: $\le 1000$ (step 50), $1000-10000$ (step 100), $10000-50000$ (step 250), $>50000$ (step 500).

### Trap 22: Holographic (Foil) Scope & The Paletools DefId Truncation Trap
- **Problem**:
  1. In the Web App, Paletools loads set entries by querying `GET /ut/game/fc27/defid?count=200&sort=desc&start=0&type=player`. Because it requests only 200 items sorted descending by rating without pagination, it truncates at 89 OVR, displaying only 63 cards (58 Icons + 4 high TOTWs + Mbappé) and giving the false impression that Holographics requires 400k–500k+ Icons.
  2. The actual pool for Holographics (Set 113) on FUT.GG (`/api/fut/gallery/fc27/sets/113/pool/`) contains **326 cards**, including **69 TOTW cards** (starting at 80 OVR discard price ~10,000 coins: Dunk 80, Shaqiri 80, Paradela 80, etc.), **87 Base Heroes** (including 85 OVR like Cahill, Dempsey, Crouch at ~40k), and **15 Promos** (Destined for Glory).
  3. However, NOT all TOTWs are Holographic! For example, Zeki Amdouni (80 TOTW) has `foilSubtype: -1` (not foil), while Lewis Dunk (80 TOTW) and Xherdan Shaqiri (80 TOTW) have `foilSubtype: 0` (`hyperCosmetics.1.subtype === 0`, confirmed Foil).
- **Rule (Mandatory)**:
  1. Never assume Holographics requires expensive Icons. It requires only **5 cards** and can be completed cheaply using discard 80-rated Foil TOTWs (~10,000 coins each).
  2. Always verify a target card against FUT.GG pool API where `"holographic": true` or assert `it.getFoilSubtype() === 0` in EA memory before purchase.
  3. Execute via standard Buy Now $\rightarrow$ Store $\rightarrow$ Unassigned $\rightarrow$ Relist instantly.

---

## 5. Speed & Execution Optimizations (Key Learnings)

1. **The FUT.GG Baseline Step-Probing Protocol**:
   - Rather than searching open `Any` (which risks 10,000-coin expiring cards), leverage the price shown on each player card on the FUT.GG set page.
   - Probe tightly around that base. This finds the active floor in 1–2 rapid searches while guaranteeing 100% protection against overpaying.

2. **Self-Funding Coin Velocity**:
   - Relisting cards with Paletools "Cheapest" sells them within 2–15 minutes on the live transfer market.
   - The coin pool continuously replenishes itself. A 15-player set with an initial coin balance of 75,000 only incurs ~1,500 coins net loss (the 5% EA tax).

3. **Direct Selector Acceleration**:
   - Rather than capturing full page snapshots between steps, use known stable selectors or text targets:
     - Clear filters: `button "Reset"`
     - Autocomplete: `button "<Name> <Rating>"`
     - Store route: `button " Store"` $\rightarrow$ `heading "Unassigned Items"`
     - Relist: `button "List on Transfer Market"` $\rightarrow$ `button "Cheapest"` $\rightarrow$ `button "List for Transfer"`

4. **Zero-Snapshot Scripted Execution (Fast Mode)**:
   - Taking screenshots and accessibility snapshots for every individual step across 15 players requires ~225 tool calls and 30+ minutes per set.
   - Using `playwright_browser_run_code_unsafe` with `filename: "scripts/run_full_set.js"` executes the entire scrape, buy, unassigned store routing, and relisting loop directly inside the Playwright context in ~2 minutes with zero snapshots.
   - Built-in delays (60ms keystroke delay, 2.5s inter-player delay) maintain human-like interaction patterns and prevent EA backend rate limits / soft bans.

5. **FUT.GG Set Expansion ("Show more sets") & Bypassing Extinct Cards**:
   - If visible incomplete sets on Tab 0 are blocked by price-fixed or extinct cards (e.g., Marie Levasseur in Birmingham City at 10,000 max cap, Rose Kadzere in Montpellier at 8,500), **NEVER overpay or stall**.
   - Scroll down on Tab 0 and click `button "Show more sets"`. This expands the list to 36+ sets, surfacing numerous ultra-cheap Grade B club sets (e.g., Hamburger SV, 1. FC Nürnberg, ESTAC Troyes, FC Lorient, AJ Auxerre, Angers SCO, Le Havre AC, SV Elversberg, SC Paderborn 07, Schalke 04, FC Union Berlin, Levante UD) where all 15 players cost only 500–800 coins and grant 5–8 tokens with zero bottleneck.

---

## 6. Session Invariants & Human-in-the-Loop (MANDATORY RULE)

- **Authentication & Paletools are strictly Human-Managed**:
  - The user will **ALWAYS** manually log in to the EA FC Web App and inject/enable Paletools in Tab 1 before agent operation begins.
  - The agent must **NEVER** attempt to log in, handle credentials/2FA, solve CAPTCHAs, or reinject/setup Paletools if something goes wrong.
  - If the Web App session expires, is logged out, encounters an unresolvable error modal, or loses Paletools functionality:
    - **STOP immediately**.
    - Report the exact error and current screen state to the user.
    - Wait for the user to restore the session and re-enable Paletools.

- **Strict Club & Active Squad Protection (ZERO-TOUCH RULE)**:
  - The agent must **NEVER** touch, quick sell, transfer, or list ANY card currently in the user's Club, Active Squad, or SBC Storage.
  - The agent must **NEVER** interact with any card marked "locked" via Paletools (`.player.locked` or lock icon).
  - All buying, sniping, and relisting operations must be strictly isolated to cards newly won from the Transfer Market and routed exclusively through **Store $\rightarrow$ Unassigned Items**.

---

## 7. Completed Sets Ledger (`COMPLETED_SETS.md`)

- To prevent duplicate purchases across sessions, restarts, or browser context resets, every completed set (where all 15 required players were acquired and relisted) must be logged in `COMPLETED_SETS.md`.
- **Pre-Search Check**: Before targeting any set on FUT.GG, check `COMPLETED_SETS.md`. If the set is already listed in the markdown file, skip it immediately, even if the FUT.GG checkbox appears unticked.
- **Post-Completion Log**: As soon as all players in a set are listed, append the completed set entry to `COMPLETED_SETS.md` with timestamp, league, set name, and tokens earned.

---

## 8. New Session Kickoff Protocol

When a new agent session starts:
1. Verify open browser tabs:
   - Tab 0 must be `https://www.fut.gg/fut-gallery/`.
   - Tab 1 must be `https://www.ea.com/ea-sports-fc/ultimate-team/web-app/` with Paletools enabled and logged in.
2. Read `COMPLETED_SETS.md` to see which sets are already done.
3. On Tab 0, verify the token target is set (e.g., 300) and find the first incomplete set that is NOT in `COMPLETED_SETS.md`.
4. Open the set in Tab 2, extract the 15-player lineup, close Tab 2.
5. Loop through the 15 players on Tab 1 using the Single-Search + Unassigned Store Relisting protocol.
6. Check the set checkbox on Tab 0 and append to `COMPLETED_SETS.md`.
7. Repeat until the token target is achieved.

---

## 9. Skills Available

- **`fc-market-buy-sell`**: Detailed playbook and UI interaction steps for searching, buying, unassigned store routing, and relisting cards on the Web App.
- **`fut-gallery-scraper`**: Protocol for reading the FUT Gallery token planner, opening set subpages, extracting optimal lineups, and marking completed sets.
- **`fc-market-sniping-arbitrage`**: Complete sniping, price probing, and market arbitrage protocol for targeting high-turnover FUT Gallery bottleneck cards, bypassing EA search cache, calculating EA 5% tax margins, strictly protecting club/squad inventory, and generating automated coin profits.
