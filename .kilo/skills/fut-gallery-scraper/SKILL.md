---
name: fut-gallery-scraper
description: Scrape, plan, and track completion of FC Ultimate Team Gallery sets on FUT.GG. Handles reading the token planner, opening set subpages in background tabs, extracting the 15-player lineup, preserving main tab state, and marking sets done in localStorage. Use whenever checking FUT Gallery sets, finding required players for a club, or tracking token completion progress.
---

# FUT.GG Gallery Scraper & Planner Protocol

This skill guides reading, planning, and tracking set completion on the FUT.GG Gallery page (`https://www.fut.gg/fut-gallery/`).

---

## 1. Tab Hygiene & Master Tab Protection

- **Tab 0 (`https://www.fut.gg/fut-gallery/`) is the Master State Tab**:
  - Contains active filters, token target calculations, and completed set markers stored in browser `localStorage`.
  - **NEVER navigate away from this URL or close Tab 0**. Navigating away or clicking links directly in this tab will destroy unsaved planner state and filter configuration.
- **Always Open Set Pages in New Tabs**:
  - When inspecting a specific club set, create a new tab using `browser_tabs` with `action: "new", url: "<set_url>"`.
  - After extracting the player lineup, immediately close the temporary tab (`browser_tabs` action: `close`).

---

## 2. Reading the Token Planner

1. Switch to Tab 0: `browser_tabs` action `select`, index `0`.
2. Check `COMPLETED_SETS.md`: Read the ledger first. Any set listed there must be skipped to avoid duplicate purchases across sessions.
3. Verify token target is configured:
   - Field: `textbox "Token target Gallery Token"`.
   - Typically set to `300` (or user-defined target).
4. Identify incomplete sets:
   - Sets are presented in cards ordered by coin efficiency per token.
   - Each card displays:
     - Club / Set Name (e.g., `FC Badalona Women`, `Deportivo Alavés`).
     - Token Yield / Max Tokens (e.g., `13 / 28`).
     - Cost in Hand / Est. Cost.
     - Checkbox: `[role="checkbox"]` with `aria-label="Mark <Set Name> as done"`.
   - A set is **incomplete** when `aria-checked="false"` AND NOT present in `COMPLETED_SETS.md`.
   - To inspect more sets beyond the initial view, click `button "Show more"`.

---

## 3. Extracting the Set Lineup

1. Copy the set's subpage URL from the card anchor link (e.g., `/fut-gallery/laliga/deportivo-alaves/`).
2. Open in a new tab:
   ```js
   browser_tabs({ action: "new", url: "https://www.fut.gg/fut-gallery/<league>/<set>/" })
   ```
3. On the set detail page:
   - Locate the **"Cheapest lineup for each grade"** section.
   - The optimal grade (typically Grade A or B, yielding max practical tokens) is selected by default.
   - Locate the 15 player entries in the lineup list (`li[data-gallery-lineup-player]`).
4. Extract for each of the 15 players:
   - **Player Name**: From the card title or image alt attribute (`img[alt]`).
   - **Rating (OVR)**: Displayed on the card (e.g., 78, 72, 68).
   - **URL Slug / Nickname**: Extracted from href (e.g., `toni-martinez`, `protesoni`, `yusi`). Essential as backup search keywords when in-game shirt names diverge from official names.
   - **Estimated Price (CRITICAL)**: Extracted from the coin badge on the player card (e.g., `0.8K` $\rightarrow$ 800 coins, `1.2K` $\rightarrow$ 1,200 coins). **This price is the ground-truth baseline used for transfer market price discovery and step-probing on Tab 1.** Always pass this price into trade processing.
5. Close the set tab immediately after extraction:
   ```js
   browser_tabs({ action: "close", index: 2 })
   ```

---

## 4. Marking Sets as Completed

Once all 15 players for a set have been acquired and relisted:

1. Switch back to Tab 0 (`browser_tabs` action `select`, index `0`).
2. Locate the checkbox for the completed set:
   - Target element: `[role="checkbox"][aria-label="Mark <Set Name> as done"]`.
3. Click the checkbox.
4. **Verification**:
   - Checkbox state flips to `aria-checked="true"` and label changes to `Unmark <Set Name> as done`.
   - State automatically persists to `localStorage["fut-gallery-progress"]`.
   - The planner counter (e.g., `"X done sets left out"`) increments.
5. **Record in Ledger (`COMPLETED_SETS.md`)**:
   - Immediately append a new row to `COMPLETED_SETS.md` with: Set ID, League, Set Name, Tokens Earned, Status, and Date.
   - This ensures permanent cross-session tracking even if browser cache or localStorage is wiped.

---

## 5. Expanding Sets via "Show more sets" (Bypassing Extinct Cards)

- On Tab 0, FUT Gallery displays a limited slice of ~12–15 sets by default.
- If visible incomplete sets are blocked by extinct/price-fixed cards (e.g. Marie Levasseur in Birmingham City, Rose Kadzere in Montpellier), or when visible sets are exhausted:
- Scroll down and click `button "Show more sets"`.
- This expands the planner to 36+ sets, surfacing numerous cheap Grade B club sets (e.g. Hamburger SV, 1. FC Nürnberg, ESTAC Troyes, FC Lorient, AJ Auxerre, Angers SCO, Le Havre AC, SV Elversberg, SC Paderborn 07, Schalke 04, FC Union Berlin, Levante UD) where all 15 cards cost ~500–800 coins and grant 5–8 tokens with zero bottleneck.
