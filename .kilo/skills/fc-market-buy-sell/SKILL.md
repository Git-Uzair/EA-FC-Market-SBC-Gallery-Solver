---
name: fc-market-buy-sell
description: Search, purchase at the cheapest market price, and immediately relist player cards on the EA FC Ultimate Team Web App using Paletools. Handles autocomplete selection, price discovery, unassigned store routing to prevent HTTP 409 conflict, and Paletools cheapest listing. Use whenever performing transfer market actions, buying players, or listing cards.
---

# FC Market Buy & Sell Protocol

This skill details the exact sequence for executing player card transactions on the EA FC Ultimate Team Web App with Paletools enabled.

---

## 1. Prerequisites & Context Verification

- **Human-Managed Authentication & Paletools**:
  - The user will **ALWAYS** log in and inject/enable Paletools in Tab 1 before agent operations.
  - The agent must **NEVER** attempt to log in, handle credentials/2FA, solve CAPTCHAs, or reinject/setup Paletools.
  - If the session expires, is logged out, or loses Paletools, **STOP immediately**, report the state to the user, and wait for manual restoration.
- Ensure the active browser tab is **Tab 1** (`https://www.ea.com/ea-sports-fc/ultimate-team/web-app/`).
- Confirm Paletools is active (check for `Paletools` button in sidebar or version header `v27.x.x`).
- Confirm sufficient coin balance before initiating bids or Buy Now purchases.

---

## 2. Navigating to the Transfer Market

1. Click `button " Transfers"` in the left navigation sidebar.
2. Click `heading "Search the Transfer Market"` tile.
3. If returning from a previous search, click `button "Reset"` to ensure clean filters, or alter existing fields directly.

---

## 3. Player Search & Autocomplete Selection

1. Locate the player search field: `textbox "Type Player Name"`.
2. Type the player's name sequentially:
   - Use `slowly: true` when typing to allow the EA backend autocomplete to return candidate items.
3. **Mandatory Autocomplete Click**:
   - A suggestion dropdown will appear below the input (`list` containing `button "<Player Name> <Rating>"`).
   - **Click the autocomplete suggestion button directly**. Simply typing text and searching will NOT filter by the player.
4. **Exact Matching Over Substrings (The "Isi vs Isina" Trap)**:
   - When matching autocomplete items, compare the exact player name line (`rawText.split('\n')[0].trim().toLowerCase() === targetName.toLowerCase()`) before falling back to `.includes()`.
   - A naive `.includes("isi")` matches `"Isina Corte 80"` and selects the completely wrong player!
5. **Short-Name Autocomplete & Space Padding**:
   - For names $\le 4$ characters (e.g. `Isi`, `Bayo`), EA's backend autocomplete often fails to trigger on the 3-letter sequence alone. Always try typing the name with a trailing space (`"Isi "`, `"Bayo "`) to force suggestion generation.
6. **Common Surname Autocomplete Hijacking**:
   - Never fall back to bare common surnames like `García`, `Santos`, `Romero`, `Touré`, or `Martins`. In EA FC, dozens of players share these surnames across various leagues and clubs, causing autocomplete to select a player at the wrong club with an identical rating.
   - Always prioritize the player's full name, shirt name, or distinct search slug with diacritics preserved (e.g. `Rubén García`, `Andrei Rațiu`, `Calvin Verdonk`).
7. **Nickname & Shirt Name Fallbacks**:
   - If typing the full name produces "No results Found" (common with nicknames e.g. Benavídez $\rightarrow$ Protesoni, Rebbach $\rightarrow$ Abde Rebbach, Enríquez $\rightarrow$ Yusi):
     - Click `button ""` to clear the field.
     - Type only the player's last name or known shirt name.
     - Click the matching suggestion.

---

## 4. FUT.GG Baseline Price Discovery & Step-Probing

> **MANDATORY PRICE RULE**:
> Each player card on the FUT.GG set subpage explicitly displays an estimated market price (e.g. `0.8K` $\rightarrow$ 800 coins).
> Use this FUT.GG benchmark price as the base foundation when searching for players, and move up in small increments to find the active market floor.
> **NEVER search with Max Buy Now set to 'Any'**. Because results are sorted by expiration time rather than price, open searches will display expiring 10,000-coin listings first and cause catastrophic overpaying.

1. **Calculate Baseline & Safety Ceilings**:
   - `estimatedPrice`: extracted from FUT.GG card (default 800 if missing).
   - `initialProbe`: `Math.min(Math.max(estimatedPrice * 0.9, 500), 1100)` (e.g. 700–800 coins).
   - `hardMaxCap`: `Math.min(Math.max(estimatedPrice * 1.8, 1800), 2800)` (absolute hard ceiling).
2. **Step-Probing Loop**:
   - Enter `probePrice` into Max Buy Now (4th price input: `.price-filter .ut-numeric-input-spinner-control input` index 3).
   - Click `button "Search [ Digit2]"`.
   - If `heading "No results found"` appears:
     - Click `button " [ Digit1 ]"`.
     - Increment `probePrice` by +150 (if < 1000) or +250 (if >= 1000).
     - Repeat until cards appear or `probePrice > hardMaxCap`.
   - If `probePrice` exceeds `hardMaxCap`, **ABORT** the player search. Do NOT overpay.
3. **Card Selection (Page 1 Evaluation)**:
   - When listings appear, parse all cards on Page 1 to locate the minimum numeric `Buy Now: <price>`.
   - Skip expiring cards (`<30 Seconds` or `<1 Minute`) to prevent snipe collisions.
   - Assert `lowestPrice <= hardMaxCap`.
   - Click the lowest valid listing.
4. **Purchasing & Confirmation Dialog Handling**:
   - In the right action panel, inspect `button "Buy Now for <price>"`.
   - Verify the button price does not exceed `hardMaxCap`.
   - Click `button "Buy Now for <price>"`.
   - **Handle Standard Confirmation Modal**: When Paletools fast-buy is not active, EA pops up a modal: *"Get Now: Are you sure you want to get this item for X FUT Coins? Ok / Cancel"*.
     Always immediately check for `.view-modal-container button.primary` (or `button:has-text("Ok")`) with a 1.5s timeout and click it! Failure to dismiss this modal will intercept all subsequent clicks to Store/Unassigned and cause a 30s Playwright timeout.
   - Screen displays `"Congratulations, you've won this item for <price>"`.

---

## 5. Relisting Workflow (Unassigned Store Routing & Price Verification)

> **CRITICAL ARCHITECTURAL RULES**:
> 1. Never click "List on Transfer Market" directly from the Search Results view (causes HTTP 409 Conflict). Always route through Store $\rightarrow$ Unassigned Items.
> 2. **The Bronze/Silver 5,000 EA Banding Trap**: For bronze and silver cards (and obscure golds), Futbin/Paletools has no live price data. Clicking "Cheapest" fails silently or does nothing, leaving EA's default values (`Start Price: 150`, `Buy Now: 5,000` or `10,000`). If listed at these defaults, cards sit expired and unsold.
> 4. **For resale trading** use `scripts/market_engine.js` (skill `fc-market-sniping-arbitrage`): it prices from a drilled-down exact floor, types both prices and reads them back, and confirms the listing by the server response. The Paletools flow below is for set completion, where selling at cost is acceptable.
> 3. **The Purchase Price Floor Guarantee**: You just bought the card seconds ago at the absolute cheapest market floor (`boughtNum`). Therefore, the true market floor is `boughtNum` (or at most `boughtNum + 50`). If Paletools does not populate a validated low price, ALWAYS list at `boughtNum`.

Follow this exact routing sequence:

1. **Navigate to Store**:
   - Click `button " Store"` in the left navigation sidebar.
2. **Open Unassigned Items**:
   - The Store home screen will show an **"Unassigned Items"** tile (`heading "Unassigned Items"`).
   - Click this tile to enter the Unassigned pile.
3. **Select Card**:
   - Click the row matching the bought card's name AND rating. The view preselects the FIRST unassigned item,
     which may be a pack card of yours - never list whatever is preselected. Never touch a Paletools-locked row
     (`.locked`). If the card cannot be identified, leave it unlisted and report.
4. **Trigger Listing View**:
   - Click `button "List on Transfer Market"`.
5. **Apply Optimal Market Price via Paletools**:
   - Click the Paletools `button "Cheapest"`.
6. **Active Polling & Fallback (Guaranteed Cheapest Floor)**:
   - Poll `Buy Now Price` for up to 1.5 seconds.
   - Accept the Paletools price ONLY if `cleanVal > 0 && cleanVal < 5000 && cleanVal <= Math.max(boughtNum + 200, 1000)`.
   - **Mandatory Fallback**: If Paletools did nothing, timed out, returned `>= 5000`, or exceeded `boughtNum + 200`:
     - Calculate safe floor price:
       - `safeBuyNow = Math.max(boughtNum, 200)`
       - `safeStart = safeBuyNow <= 1000 ? Math.max(safeBuyNow - 50, 150) : safeBuyNow - 100`
     - Explicitly fill Start Price (`safeStart`) and Buy Now Price (`safeBuyNow`).
     - This guarantees 100% that the card is listed at the cheapest market rate and sells rapidly.
7. **Submit Listing**:
   - Click `button "List for Transfer"`.
   - The card is sent to the Transfer List.
   - The screen will transition to `"You have no unassigned items."`

---

## 6. Error Handling & Edge Cases

- **"Card Expired / Already Purchased" & Disabled Buy Now Button**:
  - Another user sniped the card before or during your selection.
  - In EA FC, sniped listings leave the "Buy Now for X" button in a disabled state (`disabled` attribute/class). Calling Playwright `click()` without a timeout will wait 30 seconds for the button to become enabled.
  - **Rule**: Always check `if (await buyBtn.isDisabled())` and wrap `buyBtn.click({ timeout: 2500 })` in a try/catch.
  - When sniped:
    1. Back out (`button ""` or `.ut-navigation-button-control`).
    2. Step up the probe price (+150..250 coins).
    3. Re-search to find the next active price tier.
- **Transferred Players & Mandatory Club ID Verification**:
  - In EA FC Ultimate Team, players who transferred during the season (e.g., Mohamed Bayo, Jan Ziółkowski, Saba Goglichidze, Dennis Man, etc.) have multiple card versions on the transfer market representing their former and current clubs.
  - EA FC autocomplete only filters by the player persona; it does NOT filter search results by club.
  - The FUT Gallery set counts ONLY items bearing the exact target club badge! Buying a card from a player's previous club will NOT advance the set count and completely wastes coins.
  - **Rule**: Inspect EA's internal data model (`window.getAppMain().getRootViewController().currentController.currentController.currentController._listController.paginationViewModel.paginationList._collection`) and assert `item.teamId === target.clubId`. Discard any listing from another club, even if cheaper!
- **Purchase Confirmation Modal Interception**:
  - When Paletools fast-buy is not active, clicking Buy Now triggers EA's confirmation modal (`.view-modal-container form-modal`).
  - If unhandled, this modal intercepts all pointer events, causing subsequent clicks to Store/Unassigned to hang for 30s and fail with a Playwright timeout.
  - **Rule**: Immediately after clicking Buy Now, await `.view-modal-container button.primary` (or `button:has-text("Ok")`) with a 1.5s timeout and click it.
- **Resilient Locators (Paletools Independence)**:
  - Do not use hardcoded Paletools hotkey labels like `button "Search [ Digit2]"` or `button " [ Digit1 ]"`. If Paletools is not injected or disabled, these locators fail with 30s timeouts.
  - Always use flexible locators:
    - Search: `appPage.locator('.ut-filter-container button.btn-standard.primary, button:has-text("Search")').first()`
    - Back: `appPage.locator('.ut-navigation-button-control, button.btn-back, button:has-text("")').first()`
    - Transfers: `appPage.locator('.icon-transfer, button:has-text("Transfers")').first()`
    - Store: `appPage.locator('.icon-store, button:has-text("Store")').first()`
    - List on Transfer Market: `appPage.locator('button:has-text("List on Transfer Market")').first()`
    - List for Transfer: `appPage.locator('button:has-text("List for Transfer")').first()`
- **Stale Roster Data Trap (FUT.GG Set Pool Authority)**:
  - Never identify missing players by guessing or relying on real-world squads or older FIFA/FC editions (e.g. Dennis Man at Parma, Pablo Marí at Monza).
  - Always query the actual FUT.GG set pool API (`/api/fut/gallery/fc27/sets/<id>/pool/`) and check the `clubEaId` and `eaId` definitions. Only players present in that pool can count toward the set.
- **Diacritics & Special In-Game Characters**:
  - In-game names frequently contain characters like Romanian `ț`/`ș`, Spanish `ñ`, or Nordic `ø`/`æ` (e.g. Andrei Rațiu, Iker Muñoz, Oppegård).
  - FUT.GG sometimes displays special/promo ratings (e.g. Rațiu 85) while in-game autocomplete only lists the base card (e.g. 74).
  - Normalize strings with `.normalize("NFD").replace(/[\u0300-\u036f]/g, "")` and strip `ț`, `ș`, `ñ` when matching suggestions.
- **Search Throttling (Soft-Ban)**:
  - If searches start returning empty results despite known listings, or an error toast occurs on search, introduce a 5–10 second delay between requests.
- **Unassigned Pile Count**:
  - Check the top bar indicator (`button " <count>"`) to confirm unassigned inventory status. Always clear all unassigned cards before beginning a new search loop.

---

## 7. Zero-Snapshot Script Execution Mode (`scripts/run_full_set.js`)

For maximum speed without taking individual tool-call snapshots:
- Run `playwright_browser_run_code_unsafe` pointing to `scripts/run_full_set.js`.
- **Batching Rule**: The client tool execution timeout is ~60 seconds.
- Execute in batches of **2 players** (~28–35 seconds per batch) by setting Tab 0 `localStorage["kilo-batch-config"] = JSON.stringify({ start: X, size: 2 })`.
- 8 quick batches cleanly finish the 15 players with zero timeout risk.

---

## 8. Budget & Liquidity Ceiling Rule

- **Strict Coin Budget Checking**:
  - Before targeting any set on Tab 0, verify the current liquid coin balance on Tab 1.
  - The set's "Coins needed in hand" on FUT.GG must be strictly **less than or equal to** the current coin balance.
  - Prioritize Grade B club sets requiring 800–3,000 coins over expensive sets (which require 50k–150k+).
  - Clear sold items on the Transfer List regularly to recycle liquid coins back into the balance.

---

## 9. The 100 Active Transfer List Hard Limit

- **EA FC 27 Ceiling**: The Transfer List has an absolute maximum capacity of **100 items** across Active Transfers, Unsold Items, and Available Items.
- If total items reach $\ge 85$:
  - Do not start new purchase sets.
  - Navigate to the Transfer List and click "Clear Sold".
  - Re-list any expired cards at market floor prices to maintain healthy velocity.
  - Allow items to sell down before starting the next set.
