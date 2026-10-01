# FUT Gallery Transfer Market Trading & Arbitrage Ledger

This ledger tracks all automated sniping and arbitrage transactions executed by the agent, recording bought prices, target sell prices, net profits after the EA 5% tax, and running account balances.

---

## 0. Correction (2026-09-27, audit)
- The "~+31,500 coins net profit" claimed below was never real. Of the 44 logged trades only **2 sold**; the rest were
  27 open listings and 15 open bids, and the "Expected Net Profit" column is projection, not realized coins.
- The old runner (`scripts/trade_runner.js`, now retired) bought 7x Randy Nteka into a falling floor (2,500 -> 1,800)
  and left 24 cards stranded. Treat everything in sections 1-3 as historical.
- From now on this ledger records **realized results only** (sold, net of the 5% tax). The live source of truth is
  `localStorage['kilo-market-state']` on the EA tab (`realized`, `items`, `openCost`), written by `scripts/market_engine.js`.

## 0.1 Session 2026-09-27 16:26-17:40 UTC (verified engine, budget 10,000)
- Coins: 91,127 at start, 91,127 at end. Trades: 0 bought, 0 sold. **Realized: 0.**
- 120 searches across 12 set cards (Noelia Ramos 80, Vergés 80, Turner 81, Schmid 78, Tzolakis 79, Morita 78,
  Nteka 70, Chupe 76, Falcone 84, Gallo 75, Sergio Canales 78, Iñigo Vicente 77). No listing ever appeared at or
  below the profitable cap (`net(sell) - 100`) and no auction ended within 45-120 s at or below it. Hot set-card
  floors are efficient; see skill section 4.
- Built the multi-card engine (`discover` + `cycle`); watchlist of 22 cards saved in `data/market_state.json`.
- Paletools-locked cards and the user's 16-item Transfer List were not touched.

## 1. Previous Session State (historical, unverified)
- **Primary Objective**: Automated sniping and fast-flipping of high-demand FUT Gallery bottleneck cards for continuous coin profit.
- **Current Account Balance**: 83,829 coins in liquid wallet (claimed profit not supported, see section 0)
- **Transfer List Capacity**: Monitored strictly (< 85/100 threshold, currently maintained with continuous Clear Sold).
- **Target Bank**: Top 16 verified bottleneck cards defined in `data/gallery_bottleneck_targets.json` and `scripts/trade_runner.js` (including newly discovered Malaga CF & Frosinone high-velocity targets Pablo Martinez, Giorgi Kvernadze, Abde Rebbach, Berta Pujadas, all strictly < 5,000 coins).
- **Target Selection Strategy**: Rotate through Tier 1 (Nteka, Herron, Koko), Tier 2 (Cichella, Kadzere, Oyono brothers, Cinta, Kvernadze, Yusi), and Tier 3 (Slater, Pinillos, Protesoni, Rebbach, Dorgu, Pujadas).
- **Execution Architecture**: Opportunistic Hybrid Value-Seeker Engine (`scripts/trade_runner.js`):
  1. Transfer Targets maintenance & instant Paletools Cheapest relist on won cards.
  2. Clear Sold on Transfer List on every cycle to bank profits and replenish liquid coins.
  3. Step-down dynamic floor verification to mathematically discover true clearing price across all pages.
  4. Expanded anomaly Buy Now sniping ($\text{Cap} \le \min(0.80 \times P_{floor}, \text{Net} - 200)$).
  5. Proactive auction bidding on listings expiring in $\le 6\text{ minutes}$ with low bids ($\le \min(\text{BidCap} \times 0.85, P_{floor} - 250)$) locking in high win rates without waiting for final-second collisions.

---

## 2. Core Operational Invariants (MANDATORY FOR ALL AGENTS)

1. **Zero-Touch Club & Active Squad Rule**:
   - **NEVER** touch, quick-sell, list, or transfer ANY player card in the user's Club, Active Squad, or SBC Storage.
   - **NEVER** interact with cards marked locked via Paletools (`.player.locked` or lock icon).
   - All transactions MUST route strictly through **Store $\rightarrow$ Unassigned Items** for cards newly won from the Transfer Market.
2. **The 100-Item Transfer List Ceiling**:
   - Hard limit of 100 items on the transfer list.
   - If total items reach $\ge 85$, pause purchases, click "Clear Sold", and wait for active floor listings to liquidate.
3. **Instant-Sell Floor Rule**:
   - Never guess listing prices. Always probe the real-time market floor ($P_{floor}$) down to the 0-listing boundary before listing.
   - Relist at $P_{sell} \le P_{floor}$ so the card is the #1 cheapest active card on the transfer market and sells within 1–5 minutes.
4. **Sniping Margin Cap**:
   - $P_{buy\_max} \le \min\left(\lfloor P_{sell} \times 0.70 \rfloor, \; \lfloor P_{sell} \times 0.95 \rfloor - 250\right)$.
   - Guarantees minimum 25–30% net margin on every flip.
5. **Strict Search Filter Decoupling (Trap 15)**:
   - **Bidding Mode**: `Max Bid = BidCap`, `Buy Now Price` (both Min & Max) MUST BE 100% EMPTY (`Any`). Never set a Max Buy Now during bidding, otherwise all 5,000/10,000 Buy Now cards with cheap bids are completely hidden (e.g. Matteo Cichella: Max Buy 700 returned 0 listings, while Buy Now 'Any' returned 4 active 300-coin listings).
   - **Sniping Mode**: `Max Buy Now = SnipeCap`, `Max Bid` MUST BE 100% EMPTY (`Any`).
   - **Guaranteed Clears & Pre-Search Assertions**: Always use dedicated Clear buttons (`.search-price-header button.camel-case`) and assert `minBuyVal === '' && maxBuyVal === ''` before executing any bid search.

---

## 3. High-Priority Target Bank (`data/gallery_bottleneck_targets.json`)

| # | Player Name | Search Term | Club & Token Reward | Typical Floor ($P_{floor}$) | Instant-Sell ($P_{sell}$) | Max Buy Cap ($P_{cap}$) | Min Net Profit |
|---|---|---|---|---|---|---|---|
| 1 | **Randy Nteka** | `Nteka` | Rayo Vallecano (8) | 1,700–3,550 | 1,700 | **1,130** | **+485 to +1,025** |
| 2 | **Neve Herron** | `Herron` | Birmingham City (13) | 1,900 | 1,850 | **1,200** | **+557** |
| 3 | **Ange Koko** | `Koko` | Costa Adeje Tenerife (28) | 1,800 | 1,750 | **1,150** | **+512** |
| 4 | **Matteo Cichella** | `Cichella` | Frosinone (28) | 1,500 | 1,450 | **950** | **+427** |
| 5 | **Rose Kadzere** | `Kadzere` | Montpellier Women (13) | 1,500 | 1,450 | **950** | **+427** |
| 6 | **Jeremy Oyono** | `Oyono` | Frosinone (28) | 1,400 | 1,350 | **900** | **+382** |
| 7 | **Giorgi Kvernadze** | `Kvernadze` | Frosinone (28) | 1,400 | 1,350 | **900** | **+382** |
| 8 | **Anthony Oyono** | `Oyono` | Frosinone (28) | 1,400 | 1,350 | **900** | **+382** |
| 9 | **Cinta Rodríguez** | `Cinta` | Costa Adeje Tenerife (28) | 1,400 | 1,350 | **900** | **+382** |
| 10 | **Regan Slater** | `Slater` | Hull City (13) | 1,000 | 950 | **650** | **+252** |
| 11 | **Itziar Pinillos** | `Pinillos` | Badalona Women (13) | 950 | 900 | **600** | **+255** |
| 12 | **Carlos Protesoni** | `Protesoni` | Deportivo Alavés (13) | 800 | 800 | **500** | **+260** |
| 13 | **Abde Rebbach** | `Rebbach` | Deportivo Alavés (13) | 800 | 800 | **500** | **+260** |
| 14 | **Patrick Dorgu** | `Dorgu` | Lecce (13) | 850 | 800 | **500** | **+260** |
| 15 | **Berta Pujadas** | `Pujadas` | Badalona Women (13) | 850 | 800 | **500** | **+260** |
| 16 | **Yusi** | `Yusi` | Deportivo Alavés (13) | 850 | 800 | **500** | **+260** |

---

## 4. Completed Arbitrage Transactions Log

| # | Timestamp | Player Name | Bought Price | Listed Sell Price | EA 5% Tax | Expected Net Profit | Status |
|---|---|---|---|---|---|---|---|
| 1 | 2026-09-27 | Joshua Kitolano | 1,200 | 1,900 | 95 | +605 | Sold |
| 2 | 2026-09-27 | Vangelis Pavlidis | 650 | 1,900 | 95 | +1,155 | Sold |
| 3 | 2026-09-27 06:44 | Patrick Dorgu | 900 | 1,300 | 65 | +335 | Active Listing (#1 Cheapest on Market) |
| 4 | 2026-09-27 06:55 | Randy Nteka | 1,200 | 3,200 | 160 | +1,840 | Active Listing (#1 Cheapest on Market) |
| 5 | 2026-09-27 06:58 | Patrick Dorgu | 800 | 1,300 | 65 | +435 | Active Listing (#1 Cheapest on Market) |
| 6 | 2026-09-27 06:58 | Randy Nteka | 1,300 | 3,200 | 160 | +1,740 | Active Listing (#1 Cheapest on Market) |
| 7 | 2026-09-27 07:00 | Patrick Dorgu | 950 | 1,300 | 65 | +285 | Active Listing (#1 Cheapest on Market) |
| 8 | 2026-09-27 07:22 | Jeremy Oyono | 1,000 | 1,500 | 75 | +425 | Active Listing (#1 Cheapest on Market) |
| 9 | 2026-09-27 07:27 | N'Guessan | Bid Won | Paletools Cheapest | 5% | Positive Margin | Active Listing (#1 Cheapest on Market) |
| 10 | 2026-09-27 07:50 | Itziar Pinillos | 650 (Bid) | 950 (Cheapest) | 48 | +252 | Active Winning Bid (Ending in 1m) |
| 11 | 2026-09-27 08:01 | Berta Pujadas | 800 | Paletools Cheapest | 55 | +245 | Active Listing (#1 Cheapest on Market) |
| 12 | 2026-09-27 08:04 | Cinta Rodríguez | 850 (Bid) | 1,300 (Cheapest) | 65 | +385 | Active Winning Bid (Ending in 2m) |
| 13 | 2026-09-27 08:07 | Carlos Protesoni | Bid Won (350) | Paletools Cheapest | 35 | +365 | Active Listing (#1 Cheapest on Market) |
| 14 | 2026-09-27 08:07 | Randy Nteka | Bid Won (650) | Paletools Cheapest | 50 | +300 | Active Listing (#1 Cheapest on Market) |
| 15 | 2026-09-27 08:10 | Cinta Rodríguez | 850 (Bid) | 1,500 (Cheapest) | 75 | +575 | Active Winning Bid (Ending in 6m) |
| 16 | 2026-09-27 08:12 | Randy Nteka | 650 (Bid) | 1,000 (Cheapest) | 50 | +300 | Active Winning Bid (Ending in 3m) |
| 17 | 2026-09-27 08:25 | Ange Koko | 1,600 (Bid) | 1,900 (Cheapest) | 95 | +205 | Active Winning Bid (Ending in 1m) |
| 18 | 2026-09-27 08:32 | Cinta Rodríguez | 650 (Bid) | 1,000 (Cheapest) | 50 | +300 | Active Winning Bid (Ending in 6m) |
| 19 | 2026-09-27 08:36 | Neve Herron | 1,400 (Bid) | 2,100 (Cheapest) | 105 | +595 | Active Winning Bid (Ending in 4m) |
| 20 | 2026-09-27 08:36 | Ange Koko | 1,300 (Bid) | 1,800 (Cheapest) | 90 | +410 | Active Winning Bid (Ending in 6m) |
| 21 | 2026-09-27 09:37 | Giorgi Kvernadze | Bid Won (1,200) | Paletools Cheapest | 75 | +225 | Active Listing (#1 Cheapest on Market) |
| 22 | 2026-09-27 09:40 | Ange Koko | 1,600 (Bid) | 1,900 (Cheapest) | 95 | +205 | Active Winning Bid (Ending in <1m) |
| 23 | 2026-09-27 09:41 | Randy Nteka | Bid Won (750) | Paletools Cheapest | 55 | +295 | Active Listing (#1 Cheapest on Market) |
| 24 | 2026-09-27 09:41 | Anthony Oyono | 850 (Bid) | 1,500 (Cheapest) | 75 | +575 | Active Winning Bid (Ending in 5m) |
| 25 | 2026-09-27 09:41 | Matteo Cichella | 800 (Bid) | 1,300 (Cheapest) | 65 | +435 | Active Winning Bid (Ending in 6m) |
| 26 | 2026-09-27 10:41 | Rose Kadzere | Bid Won (700) | Paletools Cheapest (1,300) | 65 | +535 | Active Listing (#1 Cheapest on Market) |
| 27 | 2026-09-27 10:41 | Randy Nteka | 750 (Bid) | 2,500 (Cheapest) | 125 | +1,625 | Active Winning Bid (Ending in 6m) |
| 28 | 2026-09-27 10:58 | Matteo Cichella | 1,200 (Snipe) | 1,500 (Floor) | 75 | +225 | Active Listing (#1 Cheapest on Market) |
| 29 | 2026-09-27 11:03 | Carlos Protesoni | Bid Won (400) | Paletools Cheapest (800) | 40 | +360 | Active Listing (#1 Cheapest on Market) |
| 30 | 2026-09-27 11:08 | Randy Nteka | 1,800 (Snipe) | 2,500 (Floor) | 125 | +575 | Active Listing (#1 Cheapest on Market) |
| 31 | 2026-09-27 11:14 | Randy Nteka | 2,000 (Snipe) | 2,500 (Floor) | 125 | +375 | Active Listing (#1 Cheapest on Market) |
| 32 | 2026-09-27 11:15 | Neve Herron | 750 (Bid) | 2,200 (Floor) | 110 | +1,340 | Active Winning Bid (Ending in 6m) |
| 33 | 2026-09-27 11:15 | Ange Koko | 1,500 (Bid) | 1,900 (Floor) | 95 | +305 | Active Winning Bid (Ending in 1m) |
| 34 | 2026-09-27 11:18 | Abde Rebbach | Bid Won (500) | Paletools Cheapest (800) | 40 | +260 | Active Listing (#1 Cheapest on Market) |
| 35 | 2026-09-27 11:20 | Randy Nteka | 2,000 (Snipe) | 2,500 (Floor) | 125 | +375 | Active Listing (#1 Cheapest on Market) |
| 36 | 2026-09-27 11:26 | Neve Herron | 800 (Bid) | 2,100 (Floor) | 105 | +1,195 | Active Winning Bid (Ending in 5m) |
| 37 | 2026-09-27 11:31 | Randy Nteka | 1,700 (Snipe) | 2,100 (Floor) | 105 | +295 | Active Listing (#1 Cheapest on Market) |
| 38 | 2026-09-27 11:33 | Giorgi Kvernadze | Bid Won (750) | Paletools Cheapest (1,500) | 75 | +675 | Active Listing (#1 Cheapest on Market) |
| 39 | 2026-09-27 11:38 | Randy Nteka | 1,700 (Snipe) | 2,100 (Floor) | 105 | +295 | Active Listing (#1 Cheapest on Market) |
| 40 | 2026-09-27 11:43 | Randy Nteka | 1,600 (Snipe) | 2,000 (Floor) | 100 | +300 | Active Listing (#1 Cheapest on Market) |
| 41 | 2026-09-27 11:46 | Ange Koko | Bid Won (1,600) | Paletools Cheapest (1,900) | 95 | +205 | Active Listing (#1 Cheapest on Market) |
| 42 | 2026-09-27 11:52 | Ange Koko | Bid Won (1,600) | Paletools Cheapest (1,900) | 95 | +205 | Active Listing (#1 Cheapest on Market) |
| 43 | 2026-09-27 11:56 | Randy Nteka | 1,200 (Snipe) | 1,800 (Floor) | 90 | +510 | Active Listing (#1 Cheapest on Market) |
| 44 | 2026-09-27 12:00 | Carlos Protesoni | Bid Won (300) | Paletools Cheapest (850) | 42 | +508 | Active Listing (#1 Cheapest on Market) |
