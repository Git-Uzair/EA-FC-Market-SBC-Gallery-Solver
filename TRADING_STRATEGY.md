# Autonomous Intelligent Trading Strategy & Real-Time Playbook

> **SUPERSEDED (2026-09-27).** This playbook produced no realized profit: it relied on Paletools "Cheapest" for
> listing prices (often silent -> 10,000-coin or fixed 1,300 listings), several conflicting buy-cap formulas, and a
> static target list. The current, measured rules live in skill `fc-market-sniping-arbitrage` and are implemented in
> `scripts/market_engine.js`. Keep this file only as history; do not trade from it.

This document details the refined, intelligent trading and arbitrage model operating live on the EA FC Web App with Paletools.

---

## 1. Core Principles of Intelligent Trading

### 1.1 The Outlier Buy Principle
- If prevailing listings on the market for a card are at 1,500 coins and one listing appears for 1,000 coins:
  - That card is an underpriced outlier.
  - Buy it immediately via Buy Now.
  - Route through Store $\rightarrow$ Unassigned $\rightarrow$ List on Transfer Market.
  - Click Paletools **"Cheapest"** (or list 50 coins below prevailing floor) so it lands as the #1 cheapest card on the market and sells within 2–3 minutes.

### 1.2 The Staged Bidding Architecture
- Rather than checking for sub-60s auctions on a single second slice:
  - If an auction has a low bid (e.g. 300–700 coins) and expires in $\le 2\text{ minutes}$, place the bid immediately.
  - If an auction has a low bid and expires in $3\text{--}8\text{ minutes}$, click **Watch** to stage it in `Transfer Targets -> Watched Items`.
  - In `Transfer Targets`, as watched cards tick down to their final 45 seconds, execute the winning bid right before time expires.

### 1.3 Instant Won-Item Relisting (Zero Latency)
- Check `Transfer Targets -> Won Items` on every cycle.
- The instant an auction concludes and lands in Won Items:
  - Select card $\rightarrow$ click `List on Transfer Market` $\rightarrow$ click Paletools `Cheapest` $\rightarrow$ `List for Transfer`.
  - Never leave won inventory sitting idle.

### 1.4 Continuous Flow Maintenance
- On every cycle, check the Transfer List and click **`Clear Sold`** to reclaim coins from completed sales and keep inventory capacity healthy ($< 80/100$).
- Click **`Clear Expired`** on Transfer Targets to keep the watchlist clean.

---

## 2. Dynamic Profit Calculations (Zero Hardcoding)

For any card with prevailing market clearing price $P_{market}$:
- Net revenue after EA 5% tax: $\text{Net} = \lfloor P_{market} \times 0.95 \rfloor$.
- Maximum Buy Now Snipe Cap: $P_{buy\_max} = \text{Net} - 200$ coins.
- Maximum Auction Bid Cap: $P_{bid\_max} = \text{Net} - 200$ coins.
- Minimum Net Profit per Flip: $\ge +200\text{ to }+450\text{ coins}$.
- Turnover Target: Relisted cards must be priced at or 50 coins below the prevailing floor to guarantee liquidation in $< 2\text{--}5\text{ minutes}$.

---

## 3. The Multi-Tier Filtered Search Protocol (Page 1 Illusion & Anomaly Sniping)

### 3.1 The Time-Sort Illusion & Why Unbounded Searches Miss Fresh Snipes
- **The Problem**: EA sorts search results strictly by **time remaining (soonest first)**.
- If a card has 30+ listings, an open search (`Any / Any / Any / Any`) only returns the first ~16–20 listings expiring soonest (e.g. within 2–15 minutes) at full market price (e.g. 1,500–2,500 coins).
- If a casual pack opener listed an underpriced anomaly (e.g. 700 coins Buy Now) 45 seconds ago with 59 minutes remaining, that card is buried on Page 3 or 4 and is completely invisible in an open search!

### 3.2 Step-Down Floor Verification
1. Perform an initial open query to observe Page 1 prices and calculate candidate lowest Buy Now ($L$).
2. Step down `Max Buy Now = L - 100` (or $L - 50$ if $\le 1,000$):
   - If `No results found`: Mathematically proves that no lower listing exists anywhere on the entire market. $L$ is the true market clearing floor.
   - If results appear: Update $L$ to the new lowest price found.

### 3.3 Filtered Anomaly Sniping with Cache-Busting
1. Calculate $\text{SnipeCap} = \min(\lfloor P_{floor} \times 0.75 \rfloor, \text{Net} - 250)$.
2. Set `Max Buy Now = SnipeCap`.
3. Set `Min Bid = 150` (or toggle 150 $\leftrightarrow$ 200) to defeat EA backend search caching.
4. Execute search:
   - Any card returned is a verified underpriced anomaly dump!
   - Instantly buy with `Buy Now for <price>`.
   - Route through `Store -> Unassigned` and list via Paletools `Cheapest` (capped at $P_{floor}$).

### 3.4 Decoupled Late-Stage Auction Probing (Trap 15 Compliance)
1. Clear `Buy Now Price` completely (`Any / Any`).
2. Set `Max Bid = SnipeCap` (or $\text{Net} - 200$).
3. Execute search:
   - Evaluates only auctions where current bid is $\le \text{Max Bid}$, sorted soonest expiring first.
   - If ending in $\le 60\text{s}$, place bid immediately.
   - If ending in 2–6 minutes with opening bid $< 0.75 \times \text{Net}$, click **Watch** to stage for last-minute bidding.

---

## 4. Target Selection & Portfolio Expansion Rules

### 4.1 Strict Sub-5,000 Coin Ceiling
- **Invariant**: No candidate target may be traded if its prevailing floor is $> 5,000$ coins.
- Cards in the 750–4,000 coin range experience massive listing turnover from casual pack openings, allowing reliable $+200\text{ to }+800$ coin profits per card with virtually zero capital lockup risk.

### 4.2 FUT Gallery Token Demand Anchoring
- Cards required for 13-token and 28-token sets (e.g. Malaga CF, Frosinone, Costa Adeje Tenerife, Birmingham City, Montpellier, Badalona Women, Deportivo Alavés) have persistent, inelastic buyer demand.
- Listing cards at or 50 coins below the prevailing floor using Paletools `Cheapest` guarantees liquidation in $< 2\text{--}5\text{ minutes}$.

### 4.3 Documentation & File Safety Invariant
- **Rule**: Never edit `.kilo/skills/` or `AGENTS.md` during unattended operations. Such edits trigger harness permission prompts that require manual user approval and pause execution.
- All operational learnings, live balance figures, and strategic updates must be strictly committed to `TRADING_STRATEGY.md`, `TRADING_LEDGER.md`, and local runner scripts.
