---
name: fc-market-sniping-arbitrage
description: Verified-price trading on the EA FC 27 Web App transfer market - exact floor discovery by Max Buy Now drill-down, sales-velocity measurement from vanished listings, quick-buy vs late-bid decision, tax-correct margins, safe relisting, realized-only profit accounting. Use for any buy-to-resell, sniping, bidding, or market-price question. Engine: scripts/market_engine.js via scripts/run.js.
---

# FC Market Sniping & Arbitrage (verified 2026-09-27, FC 27)

Everything below was measured on the live market in this session unless marked UNVERIFIED.
The previous agent lost money because it trusted stale/guessed prices, counted unsold stock as
profit, and listed without checking the price. The rules here exist to prevent exactly that.

## 1. Market facts (measured)

| Fact | Evidence |
|---|---|
| A search returns at most **21 rows** (`num=21`); the UI shows 20 per page | `/transfermarket?num=21&start=0...` JSON |
| Results are sorted by **time remaining**, NOT price | JSON `expires` ascending |
| The page JSON has everything: `tradeId, buyNowPrice, currentBid, startingBid, expires (s), bidState, itemData.id, itemData.assetId` | captured response |
| Price inputs snap to the EA ladder: <1,000 step 50; 1,000-9,999 step 100; 10k-49,999 step 250; 50k-99,999 step 500; 100k+ step 1,000 | typed 725->750, 1025->1000, 1250->1300, 160->150 |
| Listing duration default = 1 hour (3600 s) | list form |
| Listings cannot be cancelled -> a row that vanished before its timer ran out was **bought** | FUT rule; basis of the sales measure |
| EA keeps 5%: you receive `floor(price*0.95)` | EA tax |
| Pack-opener auctions are start 600 / Buy Now 10,000 (gold rares), start 150 / 5,000 (bronze/silver) | scan of Noelia Ramos 80 |
| Transfer List / Targets views do NOT refetch; read live piles via `services.Item.requestTransferItems()` / `requestWatchedItems()` (GET /tradepile, /watchlist) | network capture |

## 2. Exact market price: the drill-down (mandatory before ANY buy or list)

1. Search with `Max Buy Now = reference` (last verified floor, else FUT.GG price).
2. If the page is **full (21 rows)**, more listings exist below the cap: set `Max Buy Now` to the cheapest
   price seen (or one ladder step lower if the cheapest equals the cap) and search again.
3. Repeat until the page is **not full (<21)** -> that page contains EVERY listing at or below the cap, so its
   cheapest row is the true floor.
4. **Fill the tiers above the floor.** The final page often holds only 1-3 undercutters; the "wall" sits one step
   higher. Reuse the previous full page (or search one ladder step up): on a full page, every row you did not
   already have is priced exactly at that step. Without this step a deep market looks "thin" (a real bug hit today:
   Tzolakis read as "1 listing" when the truth was `850x1 900x1 950x1 1,000x21+`).
5. Never search with Max Buy Now = Any for pricing (Trap 7): you only see 21 rows sorted by time. A full page at
   1,300 showed a minimum of 1,100 while listings at 900 existed.

Market price = **3rd-cheapest listing** of a fresh (<5-10 min) snapshot, so one outlier cannot fake it.
Engine output: `tiers "850x1 900x1 950x1 1,000x21+"` (`+` = at least that many), `completeTo` = every listing at
or below this price was seen (only that range is used for sales counting).
Typical cost: 1-2 searches when starting from the last verified floor, 3-5 from a FUT.GG guess.

## 3. Is the card hot? Measure sales, do not guess

Take two exact snapshots a few minutes apart. Sales = rows present in the first snapshot, priced at or below
both caps, whose timer had not run out, that are missing from the second. Measured today:

| Card (set) | Floor | Proven sales | Rate |
|---|---|---|---|
| Noelia Ramos 80 (Costa Adeje Tenerife) | 900 (800 before) | 12 in 4.5 min, at 800-900 | ~2.7/min |
| Millie Turner 81 (Birmingham City) | 800 | 5 in 4.5 min, all 800 | ~1.1/min |
| Romano Schmid 78 (Frosinone) | 1,300 | 1 in 2.4 min | ~0.4/min |
| Konstantinos Tzolakis 79 (Hull City) | 850 (wall 1,000x21+) | 1 at 950 in 4.2 min | ~0.25/min |
| Hidemasa Morita 78 (Hull City) | 1,200 (1,300x16) | 1 at 1,100 in 4.2 min | ~0.25/min |

Hot = >= 1 sale/min at the floor. Fresh listings (50-60 min left) plus vanishing cheap rows confirm it.
Only prices at or below the NEW snapshot's `completeTo` count: a missing row above it may just be off-page.

**FUT.GG prices can be badly stale for bottleneck cards.** Chupe 76 (Malaga CF key card): FUT.GG prices the whole
set at 3,680, but the live Buy Now floor was ~4,600-4,700, and pack auctions (start 600 / BIN 10,000) were already
bid to 3,600-4,200 with 10-17 min left. Always verify on the market; never trade from FUT.GG numbers.

## 4. The spread reality (why most snipes are impossible)

On hot set cards the floor is **efficient**: every run of cheap BIN checks at `net(floor - 1 step) - 100` found
nothing (Noelia 6 checks at <=707, Vergés 6 checks at <=660). Other snipers take underpriced listings within
seconds. The one outlier seen (Vergés 650 vs 850 floor) vanished before the next search.
Gold-rare pack auctions (start 600, BIN 10,000) collect bids up to ~800 with 3-9 min left, i.e. at or near the
BIN floor; there is no edge in bidding at 750+ on a 900 card (net 855).

**Consequence:** profit per flip is at most ~100-150 coins and needs either (a) a seconds-old underpriced BIN,
or (b) an auction that closes with few bidders. Both require many cheap searches, which is exactly what EA
rate-limits (UNVERIFIED thresholds; the old logs show 426/401 after heavy use). Do not expect coins/hour.

## 5. Decision rule (implemented in `decide()` / `fastHunt()`)

- `sell` = one ladder step under the 2nd-cheapest listing (after buying the cheapest, that is your competition);
  for hot cards (>= 3 proven sales in the last snapshot window) one step under the 3rd-cheapest.
- **Quick-buy** only if `cheapest BIN <= net(sell) - minProfit` (minProfit 100-150).
- Otherwise **late bid**: Buy Now filters EMPTY (Trap 15), `Max Bid = net(one step under floor) - minProfit`,
  only auctions ending in <= 60-90 s, bid exactly the minimum valid amount (`currentBid + step`, or
  `startingBid` if no bids). Never bid above the cap. Never re-bid a war.
- Thin market (< 3 listings) -> skip. Market price (3rd-cheapest) down 2+ ladder steps since the previous snapshot
  -> skip (you would buy into a slide; that is how the last agent lost on Nteka).
- Exposure: at most `maxPerCard` (default 2) copies per card held or bid on; no new buys when the Transfer List
  holds >= 90 items (EA hard limit 100 includes the user's own items; `maintain` measures it).
- Rating must match: specials of the same player share the player id, so rows with another rating are dropped.

## 6. Execution safety (all enforced in scripts/market_engine.js)

- Buy: re-find the exact `tradeId` on a fresh search, check the button shows the expected price, click once,
  confirm by the `/trade/<id>/bid` HTTP 200 response. 461 = someone else got it; move on, no retry loop.
- List: go through Store -> Unassigned (Trap 1), select OUR row (itemId recorded at buy time, name+rating match,
  never a Paletools-locked `.locked` row, refuse if a foreign copy of the same card is present), type BOTH prices,
  read the inputs back, confirm by POST `/auctionhouse` HTTP 200. Never use the Paletools button for price.
- Relist expired stock at a freshly drilled floor minus one step. Nothing is ever left unlisted.
- Budget: `kilo-market-state.openCost` (cost of held cards + open bids) may not exceed `budgetCap` (10,000).
- Profit: only `realized` (sold cards, net of tax) counts. Held stock is valued at today's floor, never at hope.

## 7. Multi-card tracking: which FUT Gallery cards are hot right now

FUT Gallery is where the demand is; the question is only WHICH cards. Two layers, fully automated:

1. **Nominate (`discover`, FUT.GG only, zero EA searches).** Rank club sets on the planner by
   `tokens at the best reachable grade / coins for the cheapest lineup`, keep sets costing <= `maxSetCost` (20,000)
   with >= `minTokens` (13), open the top `sets` (8) and take their high-point cards (>= `minPoints` 90 gallery points;
   these are the cards every completer must buy). Players rush the best-value sets first, so their key cards turn over.
   Cards that fall out of the hot sets and never proved >= 0.3 sales/min are pruned; manual adds stay.
2. **Prove (`cycle`, EA searches).** Each due card gets an exact snapshot; sales since its previous snapshot give
   `salesEma` (sales/min, smoothed). Rescheduling: >= 1/min -> every 1.5 min, >= 0.3 -> every 4 min, else every
   15 min; thin or no listings -> 20 min; floor above `maxCardPrice` (5,000) -> 60 min. Due cards run hottest first.
   A card whose previous snapshot is < `freshSec` (300 s) old gets the cheap path: ONE search at the profitable cap.

Discover every ~60 min (the engine returns `hint` when stale). Top sets on 2026-09-27 17:26 UTC: Frosinone,
Lecce, Real Racing Club, Le Mans FC, Costa Adeje Tenerife, FC Badalona Women, Montpellier, Logroño United.

**Search budget.** Every EA search counts against `maxSearchesPerHour` (300, rolling) with >= `minGapMs` (4,000 ms)
between searches; a non-200 search halts all searching 15 min. EA's real limits are UNVERIFIED: old logs show HTTP 426
and 401 after heavy use. The engine stops the cycle and returns `stop` on budget/halt/logout.

**Persistence across chats.** Engine state lives in `localStorage['kilo-market-state']` (EA tab) and is saved after
every call to `data/market_state.json` by `scripts/run.js` via `scripts/state_server.py`. A fresh browser profile
is seeded from that file automatically. Read the file first in a new chat.

## 8. How to run

1. Start the helper server once per session (background, repo root): `python scripts/state_server.py`.
2. Put a command in `localStorage['kilo-market-cmd']` on the EA tab, then run
   `playwright_browser_run_code_unsafe { filename: "scripts/run.js" }` (fetches the code fresh; tiny tool output).
3. Main loop: `{ "op": "cycle", "minProfit": 100 }`, repeated. Output lines per card, e.g.
   `Gallo 75 | 850x1 900x20+ | sold 3 in 4.1m | bid cap 660 | no bid`. Fields: `stop` (halt reason), `dueNow`,
   `nextDueInSec` (sleep that long when nothing is due), `hint` (run discover), `maintain` (sold/won/relisted lines).
   Options: `observe: true` (measure only, never trade), `maxPerCard`, `maxCardPrice`, `freshSec`, `bidWindowSec`,
   `maxSearchesPerHour`, `minGapMs`, `maintainEverySec`.
4. Other ops (each call stays under ~50 s):
   - `{ "op": "discover" }` - refresh the watchlist from FUT.GG (options above).
   - `{ "op": "status" }` - holdings, bids, realized profit, searches last hour, watchlist ranked by sales/min.
   - `{ "op": "watch", "add": [{ "search": "Turner", "rating": 81, "defId": 263012 }], "remove": ["Gallo|75"] }`.
   - `{ "op": "export" }` - the durable state as JSON (the loader already saves it; use for inspection).
   - `{ "op": "probe", "targets": [{ "search": "Noelia Ramos", "rating": 80, "ref": 900 }] }` - exact floor, tiers, sales since last probe.
   - `{ "op": "snipe", "minProfit": 100, "maxChecks": 7, "targets": [{ "search": "...", "rating": 80 }] }` - repeated BIN checks at the profitable cap; buys + lists on hit.
   - `{ "op": "hunt", "fast": true, "targets": [...] }` - one pass per target: quick-buy or late bid.
   - `{ "op": "maintain" }` - settle won/lost bids, record sales (realized), relist expired and won cards.
   - `{ "op": "scan", "filter": { "maxBid": 700 }, "targets": [...] }` - raw read-only rows for learning.
   - `{ "op": "scan", "filters": [{ "maxBin": 600 }, { "maxBin": 1300 }], "targets": [...] }` - debug sequence:
     row count, the real query string sent to EA (`maskedDefId=...&maxb=...`) and the screen after each step.
     Use it whenever engine output disagrees with what the market should show.
   - Add `"dryRun": true` to see decisions without buying.
5. `search` must be a substring of the autocomplete label and `rating` must match (e.g. "Vergés" -> "Elba Vergés 80").
   `defId` (FUT.GG player id, from `data-gallery-lineup-player` or the FUT.GG URL) makes the engine verify EA's
   `maskedDefId` so the wrong player can never be traded. A card failing autocomplete twice is marked `bad`.

## 9. Not yet proven live (watch the first occurrence)

The read path (drill-down, sales, fast check, bid scan, maintain reads) ran live on 2026-09-27. These paths have
code but no live run yet: buy -> Store/Unassigned -> list; bid placement; won-bid settle + relist from Transfer
Targets; expired relist from the Transfer List. On the first real trade, confirm on screen
(`playwright_browser_snapshot` of the Transfer List) that the card is listed at the reported price, and record
the result here.
