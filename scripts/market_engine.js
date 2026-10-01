// scripts/market_engine.js - verified-floor trading engine for the EA FC 27 Web App (Tab 1).
// Run ONLY through the loader: playwright_browser_run_code_unsafe { filename: "scripts/run.js" }
// Command: JSON in localStorage['kilo-market-cmd'] on the EA tab. Main loop: { "op": "cycle" } repeatedly.
//   cycle    - settle bids/sales + relist (every 3 min when holding), then work the due watchlist cards
//   status   - holdings, bids, realized profit, watchlist ranking | export - durable copy for data/market_state.json
//   watch    - { add: [{search, rating, defId}], remove: ["Name|80"] } | discover (scripts/discover.js) - refresh watchlist
//   probe / hunt / snipe / maintain / scan - single-purpose ops (see skill fc-market-sniping-arbitrage)
// Every price decision comes from the live transfermarket JSON, never from the DOM or FUT.GG.
// Safety: only items whose itemId is recorded in kilo-market-state.items are ever listed.
async (page) => {
  const T0 = Date.now();
  const app = page.context().pages().find(p => p.url().includes('ultimate-team/web-app')) || page;
  const sleep = (ms) => app.waitForTimeout(ms);
  const jitter = (ms) => sleep(ms + Math.floor(Math.random() * ms * 0.5));
  const out = { op: null, coinsStart: null, coinsEnd: null, results: [], log: [] };
  const log = (m) => out.log.push(`${((Date.now() - T0) / 1000).toFixed(1)}s ${m}`);
  const timeLeft = () => 50000 - (Date.now() - T0);

  const cmd = await app.evaluate(() => JSON.parse(localStorage.getItem('kilo-market-cmd') || '{}'));
  const DEFAULT_STATE = { budgetCap: 10000, openCost: 0, realized: 0, items: {}, bids: {}, snap: {}, searches: 0 };
  const state = Object.assign(DEFAULT_STATE, await app.evaluate(() => JSON.parse(localStorage.getItem('kilo-market-state') || '{}')));
  const saveState = () => app.evaluate((s) => localStorage.setItem('kilo-market-state', JSON.stringify(s)), state);

  // ---- EA price ladder (verified: UI snaps 725->750, 1025->1000, 1250->1300, 160->150) ----
  const stepAt = (p) => p < 1000 ? 50 : p < 10000 ? 100 : p < 50000 ? 250 : p < 100000 ? 500 : 1000;
  const snap = (p) => { p = Math.max(150, Math.round(p)); const s = stepAt(p); return Math.round(p / s) * s; };
  const down = (p) => Math.max(150, p - stepAt(p - 1));
  const up = (p) => p + stepAt(p);
  const net = (p) => Math.floor(p * 0.95); // EA keeps 5% of every sale
  const nextBid = (r) => r.bid > 0 ? up(r.bid) : r.start;
  const fmt = (n) => Number(n).toLocaleString('en-US');

  // ---- navigation ----
  const tab = async (name) => { await app.locator('.ut-tab-bar-item').filter({ hasText: name }).first().click({ timeout: 4000 }); await jitter(800); };
  const back = async () => { await app.locator('.ut-navigation-button-control').first().click({ timeout: 4000 }); await jitter(450); };
  const coins = () => app.evaluate(() => parseInt((document.querySelector('.view-navbar-currency-coins')?.innerText || '0').replace(/\D/g, ''), 10));
  const toasts = () => app.evaluate(() => Array.from(document.querySelectorAll('.Notification, .ut-notification')).map(n => n.innerText.trim()).filter(Boolean).slice(-2).join(' | '));

  // ---- search form ----
  let cur = ['', '', '', '']; // minBid, maxBid, minBin, maxBin as currently typed
  let lastQuery = '', expectAsset = null, lastSearchAt = 0;
  // Search pacing (EA restricts heavy searching; thresholds UNVERIFIED): rolling hourly cap + minimum gap.
  const maxPerHour = cmd.maxSearchesPerHour || 300, minGapMs = cmd.minGapMs || 4000;
  state.searchTimes = (state.searchTimes || []).filter(x => Date.now() - x < 3600e3);
  const heading = () => app.evaluate(() => (document.querySelector('.ut-navigation-bar-view h1, h1.title')?.innerText || '').trim());
  const openSearch = async (t) => {
    await tab('Transfers');
    await app.locator('.ut-tile-transfer-market').click({ timeout: 4000 });
    await jitter(800);
    const reset = app.getByRole('button', { name: 'Reset' });
    if (await reset.isVisible().catch(() => false)) { await reset.click(); await sleep(300); }
    cur = ['', '', '', ''];
    const box = app.locator('.ut-player-search-control input').first();
    await box.click(); await box.fill('');
    await box.pressSequentially(t.search, { delay: 55 });
    await sleep(1100);
    const opts = app.locator('.ut-player-search-control .inline-list button');
    const texts = [];
    for (let i = 0; i < await opts.count(); i++) texts.push((await opts.nth(i).innerText()).replace(/\s+/g, ' ').trim());
    const idx = texts.findIndex(x => x.endsWith(' ' + t.rating) && x.toLowerCase().includes(t.search.toLowerCase()));
    if (idx < 0) throw new Error(`autocomplete: no "${t.search} ${t.rating}" in [${texts.join('; ')}]`);
    await opts.nth(idx).click();
    await sleep(350);
    expectAsset = t.defId ? t.defId % 16777216 : null; // FUT.GG id = EA asset id; checked against maskedDefId
    return texts[idx];
  };
  const setPrice = async (i, val) => {
    const want = val ? String(snap(val)) : '';
    if (cur[i] === want) return;
    const box = app.locator('.search-prices input').nth(i);
    await box.click({ timeout: 3000 }); await box.fill(want); await box.press('Tab').catch(() => {});
    await sleep(120);
    const got = (await box.inputValue()).replace(/\D/g, '');
    if (got !== want) throw new Error(`price filter ${i} shows "${got}", expected "${want}"`);
    cur[i] = want;
  };
  // Runs one search and returns the exact listings from the transfermarket JSON (sorted by time left).
  const search = async (f = {}) => {
    if (state.haltUntil && Date.now() < state.haltUntil) throw new Error(`search halted until ${new Date(state.haltUntil).toISOString().slice(11, 16)} UTC (EA refused a search)`);
    if (state.searchTimes.length >= maxPerHour) throw new Error(`search budget: ${maxPerHour}/hour used; next slot ${new Date(state.searchTimes[0] + 3600e3).toISOString().slice(11, 16)} UTC`);
    await setPrice(0, f.minBid); await setPrice(1, f.maxBid); await setPrice(2, f.minBin); await setPrice(3, f.maxBin);
    const wait = lastSearchAt + minGapMs - Date.now();
    if (wait > 0) await sleep(wait);
    const resp = app.waitForResponse(r => r.url().includes('/transfermarket?'), { timeout: 10000 });
    await app.locator('button.btn-standard.primary').filter({ hasText: 'Search' }).first().click();
    const r = await resp;
    lastSearchAt = Date.now();
    state.searches++; state.searchTimes.push(lastSearchAt);
    lastQuery = r.url().split('?')[1].split('&').filter(kv => /^(minb|maxb|micr|macr|maskedDefId|definitionId)=/.test(kv)).join('&');
    if (r.status() !== 200) {
      if (r.status() !== 401) state.haltUntil = Date.now() + 15 * 60e3; // back off; never hammer a refusing server
      await saveState();
      throw new Error(`search HTTP ${r.status()} (${r.status() === 401 ? 'logged out: STOP and ask the user to log in' : 'EA refused: halted 15 min'})`);
    }
    const asset = (lastQuery.match(/maskedDefId=(\d+)/) || [])[1];
    if (expectAsset && asset && +asset !== expectAsset) throw new Error(`wrong card selected: maskedDefId ${asset}, expected ${expectAsset}`);
    const b = await r.json();
    await jitter(650);
    return (b.auctionInfo || []).map((a, pos) => ({ pos, tradeId: a.tradeId, bin: a.buyNowPrice, bid: a.currentBid, start: a.startingBid,
      exp: a.expires, bidState: a.bidState, itemId: a.itemData.id, defId: a.itemData.assetId, rating: a.itemData.rating }));
  };

  // ---- exact floor by drill-down ----
  // A page with < 21 rows holds EVERY listing <= maxBin, so its cheapest row is the true floor.
  // A full page (21) means more exist: lower maxBin to the cheapest seen (or one step below) and repeat.
  // Result: rows = the `need` cheapest listings with EXACT prices (plus more), complete = every listing priced
  // <= complete is in rows (used for sales counting). Pages already fetched are reused, never re-searched.
  const drill = async (t, need = 4) => {
    const pages = {};
    let n = 0;
    const get = async (cap) => { if (!pages[cap]) { pages[cap] = await search({ maxBin: cap }); n++; await back(); } return pages[cap]; };
    let cap = snap(t.ref || 1000), rows = await get(cap);
    while (!rows.length && n < 6 && cap < (t.maxPrice || 50000)) { cap = snap(cap * 2); rows = await get(cap); } // climb (coarse is fine: the descent makes it exact)
    let complete = cap;
    while (rows.length >= 21 && n < 9) { // descend: a full page hides cheaper listings (sorted by time, not price)
      const minSeen = Math.min(...rows.map(r => r.bin));
      const next = minSeen < cap ? minSeen : down(cap);
      const r2 = await get(next);
      if (!r2.length) { complete = next; break; } // nothing <= next: all of rows are the cheapest tier
      rows = r2; cap = next; complete = cap;
    }
    if (rows.length >= 21 && complete === cap) complete = down(cap);
    let merged = rows.slice();
    while (rows.length < 21 && merged.length < need && n < 9) { // fill: the tiers just above the floor
      const up1 = up(cap), r3 = await get(up1);
      if (r3.length < 21) { rows = r3; merged = r3.slice(); cap = complete = up1; continue; }
      const ids = new Set(merged.map(r => r.tradeId)); // full page: rows not already known are all priced up1
      merged = merged.concat(r3.filter(r => r.bin === up1 && !ids.has(r.tradeId)));
      break;
    }
    merged = merged.filter(r => !t.rating || r.rating === t.rating); // other versions (specials) share the player id
    merged.sort((a, b) => a.bin - b.bin || a.exp - b.exp);
    return { maxBin: cap, complete, rows: merged, searches: n };
  };
  const summarize = (d) => {
    const tiers = {};
    d.rows.forEach(r => { tiers[r.bin] = (tiers[r.bin] || 0) + 1; });
    const list = Object.keys(tiers).map(Number).sort((a, b) => a - b).slice(0, 4)
      .map(p => `${fmt(p)}x${tiers[p]}${p > d.complete ? '+' : ''}`); // '+' = at least this many
    return { floor: d.rows[0]?.bin ?? null, third: d.rows[2]?.bin ?? null, tiers: list.join(' '),
      completeTo: d.complete, fresh10m: d.rows.filter(r => r.exp > 3000).length };
  };
  // Sales evidence: FUT listings cannot be cancelled, so a listing that vanished before its timer ran out was bought.
  // Only prices the NEW snapshot covers completely count (a missing row above that may just be off-page).
  const turnover = (key, d) => {
    const prev = state.snap[key], now = Date.now(), ids = new Set(d.rows.map(r => r.tradeId));
    const mine = new Set(Object.values(state.items).map(i => i.boughtTradeId));
    state.snap[key] = { at: now, maxBin: d.maxBin, complete: d.complete, rows: d.rows.map(r => [r.tradeId, r.bin, r.exp]) };
    if (!prev) return null;
    const dt = (now - prev.at) / 1000;
    const sold = prev.rows.filter(([id, bin, exp]) => bin <= d.complete && exp > dt + 5 && !ids.has(id) && !mine.has(id)).map(r => r[1]).sort((a, b) => a - b);
    return { soldPrices: sold, minutes: +(dt / 60).toFixed(1), coveredTo: d.complete, prevMarket: prev.rows[2] ? prev.rows[2][1] : null };
  };
  const keyOf = (t) => `${t.search}|${t.rating}`;
  const lastFloor = (t) => { const s = state.snap[keyOf(t)]; return s && s.rows.length && Date.now() - s.at < 3600e3 ? s.rows[0][1] : null; };
  const probe = async (t) => {
    const label = await openSearch(t);
    const d = await drill({ ...t, ref: lastFloor(t) || t.ref }); // start at the last verified floor: 1-2 searches
    return { t, key: keyOf(t), label, d, s: summarize(d), tv: turnover(keyOf(t), d) };
  };
  // Market price from a fresh snapshot: the 3rd-cheapest listing, so one outlier cannot fake the price.
  const freshMarket = (t, maxAgeSec) => {
    const s = state.snap[keyOf(t)];
    if (!s || s.rows.length < 3 || Date.now() - s.at > maxAgeSec * 1000) return null;
    return s.rows[2][1];
  };

  // ---- decision: quick-buy only when the cheapest listing is clearly under the verified relist price ----
  // After buying the cheapest row, the next cheapest row is the competition: relist one step under it.
  // Hot card (>= 3 proven sales since the last snapshot, or t.hot): list one step under the 3rd-cheapest
  // remaining listing (sells within minutes at 1-3 sales/min). Otherwise one step under the 2nd-cheapest.
  // Exposure guards shared by every buy/bid path: max copies per card, Transfer List room (100-item hard limit).
  const held = (t) => Object.values(state.items).filter(i => !i.sold && i.search === t.search && i.rating === t.rating).length
    + Object.values(state.bids).filter(b => b.search === t.search && b.rating === t.rating).length;
  const blocked = (t) => held(t) >= (cmd.maxPerCard || 2) ? `holding ${held(t)} copies (max ${cmd.maxPerCard || 2})`
    : (state.tradepileCount || 0) >= 90 ? `transfer list ${state.tradepileCount}/100` : null;
  const decide = (p, minProfit) => {
    const r = p.d.rows;
    if (r.length < (p.t.minListings || 3)) return { action: 'skip', why: `thin market (${r.length} listings)` };
    if (p.tv && p.tv.prevMarket && r[2].bin <= down(down(p.tv.prevMarket))) return { action: 'skip', why: `market falling ${p.tv.prevMarket} -> ${r[2].bin}` };
    const why = blocked(p.t);
    if (why) return { action: 'skip', why };
    const hot = p.t.hot || (p.tv && p.tv.soldPrices.length >= 3);
    const k = Math.min(hot ? 3 : 1, r.length - 1);
    const c = r[0], sell = Math.max(200, down(r[k].bin)), cap = net(sell) - minProfit;
    if (c.bin <= cap) return { action: 'buy', row: c, sell, cap, profit: net(sell) - c.bin };
    const bidSell = Math.max(200, down(c.bin)); // a won auction competes with today's floor
    return { action: 'bid', bidCap: net(bidSell) - minProfit, bidSell, floor: c.bin, cap };
  };

  // ---- buy: re-find the exact tradeId, verify the button price, confirm via the bid response ----
  const buyNow = async (row) => {
    const rows = await search({ maxBin: row.bin });
    const pos = rows.findIndex(r => r.tradeId === row.tradeId);
    if (pos < 0 || pos > 19) { await back(); return { ok: false, why: 'listing gone before click' }; }
    return buyFromResults({ ...row, pos });
  };
  // Buys row (must be on the results page that is showing it, at index row.pos).
  const buyFromResults = async (row) => {
    await app.locator('.listFUTItem').nth(row.pos).click({ timeout: 3000 });
    await sleep(450);
    const btn = app.locator('button.buyButton').first();
    const txt = (await btn.innerText().catch(() => '')).replace(/\s+/g, ' ');
    if (!txt.includes(fmt(row.bin))) { await back(); return { ok: false, why: `button "${txt}" is not ${fmt(row.bin)}` }; }
    if (await btn.isDisabled().catch(() => true)) { await back(); return { ok: false, why: 'buy button disabled (sold/expired)' }; }
    const resp = app.waitForResponse(r => r.url().includes(`/trade/${row.tradeId}/bid`), { timeout: 8000 }).catch(() => null);
    await btn.click({ timeout: 2500 });
    const ok = app.getByRole('button', { name: 'Ok' }); // confirm dialog, if EA shows one (isVisible() does not wait)
    await ok.waitFor({ state: 'visible', timeout: 1200 }).then(() => ok.click()).catch(() => {});
    const r = await resp;
    const status = r ? r.status() : 0;
    await jitter(600);
    await back().catch(() => {});
    if (status !== 200) return { ok: false, why: `buy HTTP ${status || 'none'} ${await toasts()}` };
    const body = await r.json().catch(() => ({}));
    return { ok: true, itemId: String(body?.auctionInfo?.[0]?.itemData?.id || row.itemId) };
  };

  // ---- listing: fill both prices, verify the inputs, confirm via the POST /auctionhouse response ----
  const listSelected = async (price) => {
    price = Math.max(200, snap(price));
    const start = down(price);
    const listBtn = app.getByRole('button', { name: 'List on Transfer Market' });
    if (await listBtn.isVisible().catch(() => false)) { await listBtn.click(); await sleep(500); }
    const startIn = app.locator('.panelActions .ut-number-input-control').nth(0);
    const binIn = app.locator('.panelActions .ut-number-input-control').nth(1);
    await binIn.click(); await binIn.fill(String(price)); await binIn.press('Tab').catch(() => {}); await sleep(150);
    await startIn.click(); await startIn.fill(String(start)); await startIn.press('Tab').catch(() => {}); await sleep(150);
    const got = [(await startIn.inputValue()).replace(/\D/g, ''), (await binIn.inputValue()).replace(/\D/g, '')];
    if (got[0] !== String(start) || got[1] !== String(price)) return { ok: false, why: `inputs show ${got.join('/')} not ${start}/${price}` };
    const resp = app.waitForResponse(r => r.url().includes('/auctionhouse') && r.request().method() === 'POST', { timeout: 8000 }).catch(() => null);
    await app.getByRole('button', { name: 'List for Transfer' }).click({ timeout: 3000 });
    const r = await resp;
    await jitter(700);
    if (!r || r.status() !== 200) return { ok: false, why: `list HTTP ${r ? r.status() : 'none'} ${await toasts()}` };
    const body = await r.json().catch(() => ({}));
    return { ok: true, tradeId: body.id, start, price };
  };
  // Selects the one row in the current view that is our item: name + rating match, not Paletools-locked,
  // and every card of that definition in the pile is recorded as ours. Otherwise refuses.
  const selectOurRow = async (t, pileFn, defId, section) => {
    const ids = Object.keys(state.items).concat(Object.values(state.bids).map(b => b.itemId));
    const chk = await app.evaluate(({ fn, defId, ids }) => {
      const pile = repositories.Item[fn]() || [];
      const same = pile.filter(i => i.definitionId === defId).map(i => String(i.id));
      return { same, foreign: same.filter(id => !ids.includes(id)) };
    }, { fn: pileFn, defId, ids });
    if (!chk.same.length) return { ok: false, why: `no card with defId ${defId} in ${pileFn}` };
    if (chk.foreign.length) return { ok: false, why: `refusing: ${chk.foreign.length} card(s) of defId ${defId} in ${pileFn} are not ours` };
    const rows = section ? app.locator('.sectioned-item-list').filter({ hasText: section }).locator('.listFUTItem') : app.locator('.listFUTItem');
    for (let i = 0; i < await rows.count(); i++) {
      const el = rows.nth(i);
      const txt = (await el.innerText()).replace(/\s+/g, ' ').toLowerCase();
      if (await el.locator('.locked').count()) continue;
      if (txt.includes(String(t.rating)) && txt.includes(t.search.toLowerCase())) {
        await el.click({ timeout: 3000 }); await sleep(450);
        return { ok: true, itemId: chk.same[0] };
      }
    }
    return { ok: false, why: 'matching row not found in view' };
  };
  const openUnassigned = async () => {
    await tab('Store');
    const tile = app.getByRole('heading', { name: 'Unassigned Items' });
    for (let i = 0; i < 8 && !(await tile.isVisible().catch(() => false)); i++) await sleep(400);
    if (!(await tile.isVisible().catch(() => false))) return false;
    await tile.click(); await jitter(900);
    return true;
  };

  // ---- composite actions ----
  const executeBuy = async (p, dec, onResults = false) => {
    const row = dec.row;
    if (state.openCost + row.bin > state.budgetCap) { if (onResults) await back(); return { ok: false, why: `budget: open ${state.openCost} + ${row.bin} > ${state.budgetCap}` }; }
    const b = onResults ? await buyFromResults(row) : await buyNow(row);
    if (!b.ok) return b;
    const rec = { name: p.label, search: p.t.search, rating: p.t.rating, defId: row.defId, itemId: b.itemId, boughtTradeId: row.tradeId,
      buy: row.bin, how: 'bin', at: new Date().toISOString(), listed: null, sold: null };
    state.items[rec.itemId] = rec; state.openCost += row.bin; await saveState();
    log(`bought ${p.label} for ${row.bin}`);
    if (!(await openUnassigned())) return { ok: true, bought: row.bin, listed: false, why: 'Unassigned tile not visible' };
    const sel = await selectOurRow(p.t, 'getUnassignedItems', row.defId);
    if (!sel.ok) return { ok: true, bought: row.bin, listed: false, why: sel.why };
    const l = await listSelected(dec.sell);
    if (l.ok) { rec.listed = { price: l.price, tradeId: l.tradeId, at: new Date().toISOString() }; await saveState(); }
    return { ok: true, bought: row.bin, listed: l.ok ? l.price : false, why: l.why };
  };
  // Late auction bid: Buy Now filters stay EMPTY (Trap 15); bid the minimum valid amount only if it is under bidCap.
  const bidScan = async (p, dec, windowSec) => {
    if (state.openCost + dec.bidCap > state.budgetCap) return { ok: false, why: 'budget' };
    const rows = await search({ maxBid: dec.bidCap });
    const seen = rows.filter(r => r.exp <= windowSec).slice(0, 5).map(r => `${fmt(nextBid(r))}@${r.exp}s`).join(' ');
    const c = rows.find(r => r.pos < 20 && r.exp <= windowSec && r.exp >= 8 && r.bidState !== 'highest' && nextBid(r) <= dec.bidCap
      && (!p.t.rating || r.rating === p.t.rating));
    if (!c) { await back(); return { ok: false, why: `no auction <= ${fmt(dec.bidCap)} ending within ${windowSec}s`, seen }; }
    const amount = nextBid(c);
    if (cmd.dryRun) { await back(); return { dry: true, wouldBid: amount, endsInSec: c.exp, seen }; }
    await app.locator('.listFUTItem').nth(c.pos).click({ timeout: 3000 }); await sleep(400);
    const inp = app.locator('.bidOptions .ut-number-input-control').first();
    await inp.click(); await inp.fill(String(amount)); await inp.press('Tab').catch(() => {}); await sleep(120);
    const got = (await inp.inputValue()).replace(/\D/g, '');
    if (got !== String(amount)) { await back(); return { ok: false, why: `bid input ${got} != ${amount}` }; }
    const resp = app.waitForResponse(r => r.url().includes(`/trade/${c.tradeId}/bid`), { timeout: 8000 }).catch(() => null);
    await app.locator('button.bidButton').first().click({ timeout: 2500 });
    const r = await resp; const status = r ? r.status() : 0;
    await jitter(500); await back().catch(() => {});
    if (status !== 200) return { ok: false, why: `bid HTTP ${status || 'none'} ${await toasts()}`, amount, seen };
    state.bids[c.tradeId] = { name: p.label, search: p.t.search, rating: p.t.rating, defId: c.defId, itemId: String(c.itemId), amount, endsAt: Date.now() + c.exp * 1000 };
    state.openCost += amount; await saveState();
    return { ok: true, amount, endsInSec: c.exp, tradeId: c.tradeId, seen };
  };
  // Fast cycle for a card with a fresh verified market price: ONE search at the profitable cap, buy straight
  // from the results page (outliers are gone in seconds), otherwise scan auctions ending soon.
  const fastHunt = async (t, mkt, minProfit) => {
    const label = await openSearch(t);
    const sell = Math.max(200, down(mkt)), cap = net(sell) - minProfit;
    const res = { target: label, fast: true, market: mkt, sellAt: sell, cap };
    const why = blocked(t);
    if (why) return { ...res, skip: why };
    const rows = (await search({ maxBin: cap })).filter(r => !t.rating || r.rating === t.rating);
    res.underCap = rows.length;
    if (rows.length) {
      const c = rows.slice().sort((a, b) => a.bin - b.bin)[0];
      res.cheapest = c.bin;
      if (cmd.dryRun || c.pos > 19) { await back(); res.trade = { ok: false, why: cmd.dryRun ? 'dry run' : 'row off-page' }; }
      else res.trade = await executeBuy({ label, t }, { row: c, sell }, true);
      return res;
    }
    await back();
    res.bid = await bidScan({ label, t }, { bidCap: cap, bidSell: sell }, cmd.bidWindowSec || 90);
    return res;
  };
  // Repeated BIN checks on ONE card at the profitable cap for the rest of the time budget.
  // Needs a fresh verified snapshot (probe first). Toggles Min Bid ''/150 so every query string differs.
  const snipeLoop = async (t, minProfit) => {
    const mkt = freshMarket(t, cmd.freshSec || 600);
    if (!mkt) return { target: `${t.search} ${t.rating}`, error: 'no fresh snapshot: run probe first' };
    const label = await openSearch(t);
    const sell = Math.max(200, down(mkt)), cap = net(sell) - minProfit;
    const res = { target: label, market: mkt, sellAt: sell, cap, checks: 0, hits: [] };
    for (let i = 0; timeLeft() > 14000 && i < (cmd.maxChecks || 9); i++) {
      const rows = (await search({ maxBin: cap, minBid: i % 2 ? 150 : 0 })).filter(r => !t.rating || r.rating === t.rating);
      res.checks++;
      if (rows.length) {
        const c = rows.slice().sort((a, b) => a.bin - b.bin)[0];
        res.hits.push(c.bin);
        if (!cmd.dryRun && c.pos <= 19) { res.trade = await executeBuy({ label, t }, { row: c, sell }, true); break; }
      }
      await back();
      await jitter(cmd.gapMs || 3500);
    }
    return res;
  };
  // Reads a pile straight from the server (same GET the UI makes).
  const readPile = async (fn, urlPart) => {
    const resp = app.waitForResponse(r => r.url().includes(urlPart), { timeout: 8000 }).catch(() => null);
    await app.evaluate((f) => { services.Item[f](); }, fn);
    const r = await resp;
    const b = r ? await r.json().catch(() => ({})) : {};
    return (b.auctionInfo || []).map(a => ({ id: String(a.itemData.id), defId: a.itemData.assetId, tradeId: String(a.tradeId), state: a.tradeState, bidState: a.bidState, bid: a.currentBid, bin: a.buyNowPrice, exp: a.expires }));
  };
  const relistAt = async (rec) => { // fresh verified price for a card we hold
    const p = await probe({ search: rec.search, rating: rec.rating, ref: rec.listed?.price || rec.buy });
    if (!p.s.floor) return { ok: false, why: 'no listings to price against' };
    return { ok: true, price: Math.max(200, down(p.s.floor)), floor: p.s.floor };
  };
  const maintain = async () => {
    const res = { sold: [], won: [], lost: [], relisted: [], pending: [], errors: [] };
    const watched = await readPile('requestWatchedItems', '/watchlist');
    for (const [tid, b] of Object.entries(state.bids)) {
      const w = watched.find(x => x.tradeId === String(tid));
      if (w && w.state === 'active') { res.pending.push(`${b.name} bid ${b.amount} (${w.bidState}, ${w.exp}s)`); continue; }
      if (w && w.state === 'closed' && w.bidState === 'highest') {
        state.items[w.id] = { name: b.name, search: b.search, rating: b.rating, defId: b.defId, itemId: w.id, boughtTradeId: Number(tid), buy: w.bid, how: 'bid', at: new Date().toISOString(), listed: null, sold: null };
        state.openCost += w.bid - b.amount; delete state.bids[tid]; res.won.push(`${b.name} for ${w.bid}`);
      } else { state.openCost -= b.amount; delete state.bids[tid]; res.lost.push(`${b.name} (${w ? w.bidState : 'gone'})`); }
    }
    await saveState();
    const pile = await readPile('requestTransferItems', '/tradepile');
    state.tradepileCount = pile.length; // whole Transfer List incl. the user's own items (EA hard limit 100)
    for (const rec of Object.values(state.items)) {
      if (rec.sold) continue;
      const it = pile.find(x => x.id === rec.itemId);
      if (it && it.state === 'closed') {
        rec.sold = { price: it.bid, at: new Date().toISOString() };
        state.realized += net(it.bid) - rec.buy; state.openCost -= rec.buy;
        res.sold.push(`${rec.name}: bought ${rec.buy}, sold ${it.bid}, net ${net(it.bid) - rec.buy}`);
      }
    }
    await saveState();
    // relist: won cards (Transfer Targets > Won Items) and our expired listings (Transfer List > Unsold Items)
    const todo = Object.values(state.items).filter(rec => !rec.sold && (
      (rec.how === 'bid' && !rec.listed && watched.some(w => w.id === rec.itemId)) ||
      pile.some(x => x.id === rec.itemId && x.state === 'expired')));
    for (const rec of todo) {
      if (timeLeft() < 15000) { res.errors.push(`time budget: ${rec.name} not relisted`); break; }
      try {
        const pr = await relistAt(rec);
        if (!pr.ok) { res.errors.push(`${rec.name}: ${pr.why}`); continue; }
        const inTargets = watched.some(w => w.id === rec.itemId);
        await tab('Transfers');
        await app.locator(inTargets ? '.ut-tile-transfer-targets' : '.ut-tile-transfer-list').click({ timeout: 4000 }); await jitter(1100);
        const sel = await selectOurRow(rec, inTargets ? 'getWatchedItems' : 'getTransferItems', rec.defId, inTargets ? 'Won Items' : 'Unsold Items');
        if (!sel.ok) { res.errors.push(`${rec.name}: ${sel.why}`); continue; }
        const l = await listSelected(pr.price);
        if (!l.ok) { res.errors.push(`${rec.name}: ${l.why}`); continue; }
        rec.listed = { price: l.price, tradeId: l.tradeId, at: new Date().toISOString(), floor: pr.floor };
        res.relisted.push(`${rec.name} at ${l.price} (floor ${pr.floor})`);
        await saveState();
      } catch (e) { res.errors.push(`${rec.name}: ${e.message}`); }
    }
    return res;
  };

  // ---- one card: fresh snapshot -> 1-search fast check; otherwise probe (floor + sales) -> decide -> buy or bid ----
  const huntOne = async (t, minProfit, act, fast) => {
    const mkt = act && fast ? freshMarket(t, cmd.freshSec || 300) : null;
    if (mkt) return fastHunt(t, mkt, minProfit);
    const p = await probe(t);
    const dec = decide(p, minProfit);
    const res = { target: p.label, ...p.s, sold: p.tv, decision: dec.action, searches: p.d.searches };
    if (dec.why) res.why = dec.why;
    if (dec.action === 'buy') Object.assign(res, { buyAt: dec.row.bin, sellAt: dec.sell, expProfit: dec.profit });
    if (dec.action === 'bid') Object.assign(res, { bidCap: dec.bidCap, sellAt: dec.bidSell });
    if (act) {
      try {
        if (dec.action === 'buy' && !cmd.dryRun) res.trade = await executeBuy(p, dec);
        else if (dec.action === 'bid' && timeLeft() > 12000) res.bid = await bidScan(p, dec, cmd.bidWindowSec || 90);
      } catch (e) { res.tradeError = e.message; }
    }
    return res;
  };
  const brief = (r) => {
    if (r.error) return `${r.target}: ERROR ${r.error}`;
    const s = [r.target];
    if (r.fast) s.push(`fast cap ${r.cap}: ${r.skip ? 'skip, ' + r.skip : r.underCap + ' under cap'}`);
    else s.push(`${r.tiers || 'no listings'}${r.sold ? ` | sold ${r.sold.soldPrices.length} in ${r.sold.minutes}m` : ''} | ${r.decision}`
      + `${r.why ? ' (' + r.why + ')' : ''}${r.bidCap ? ' cap ' + r.bidCap : ''}${r.buyAt ? ` ${r.buyAt}->${r.sellAt}` : ''}`);
    if (r.trade) s.push(r.trade.ok ? `BOUGHT ${r.trade.bought}, listed ${r.trade.listed || 'NO (' + r.trade.why + ')'}` : `buy failed: ${r.trade.why}`);
    if (r.bid) s.push(r.bid.ok ? `BID ${r.bid.amount}, ends in ${r.bid.endsInSec}s` : r.bid.dry ? `would bid ${r.bid.wouldBid}` : 'no bid');
    if (r.tradeError) s.push(`trade error: ${r.tradeError}`);
    return s.join(' | ');
  };
  // Watchlist scheduling: hot cards (>= 1 proven sale/min) every ~1.5 min, warm (>= 0.3) every 4, cold every 15.
  const updateWatch = (w, r) => {
    const now = Date.now(), min = 60e3;
    w.lastAt = now;
    if (r.error) {
      w.fails = (w.fails || 0) + 1; w.lastError = r.error.slice(0, 140);
      if (/autocomplete|wrong card/.test(r.error) && w.fails >= 2) w.status = 'bad';
      w.nextAt = now + 10 * min; return;
    }
    w.fails = 0;
    if (!r.fast) {
      w.probes = (w.probes || 0) + 1; w.floor = r.floor; w.market = r.third;
      if (r.sold && r.sold.minutes >= 0.5) {
        const rate = r.sold.soldPrices.length / r.sold.minutes;
        w.salesEma = +(w.salesEma == null ? rate : 0.5 * w.salesEma + 0.5 * rate).toFixed(2);
      }
      if (r.floor == null || (r.why || '').startsWith('thin')) { w.nextAt = now + 20 * min; return; }
      if (r.floor > (cmd.maxCardPrice || 5000)) { w.nextAt = now + 60 * min; return; } // too pricey for the budget
    }
    const ema = w.salesEma;
    w.nextAt = now + (ema == null ? 4 : ema >= 1 ? 1.5 : ema >= 0.3 ? 4 : 15) * min;
  };

  // ---- dispatcher ----
  try {
    out.op = cmd.op || 'probe';
    out.coinsStart = await coins();
    const minProfit = cmd.minProfit || 150;
    if (out.op === 'probe' || out.op === 'hunt') {
      for (const t of (cmd.targets || [])) {
        if (timeLeft() < 15000) { log(`time budget reached before ${t.search}`); break; }
        try { out.results.push(await huntOne(t, t.minProfit || minProfit, out.op === 'hunt', !!cmd.fast)); }
        catch (e) { out.results.push({ target: `${t.search} ${t.rating}`, error: e.message }); }
      }
    } else if (out.op === 'cycle') { // THE main loop op: settle + relist, then work through due watchlist cards
      const watch = state.watch || {};
      const busy = Object.values(state.items).some(i => !i.sold) || Object.keys(state.bids).length > 0;
      if (busy && Date.now() - (state.lastMaintainAt || 0) > (cmd.maintainEverySec || 180) * 1000) {
        const m = await maintain(); state.lastMaintainAt = Date.now();
        out.maintain = Object.entries(m).filter(([, v]) => v.length).map(([k, v]) => `${k}: ${v.join('; ')}`);
      }
      const due = Object.values(watch).filter(w => w.status === 'active' && (w.nextAt || 0) <= Date.now())
        .sort((a, b) => (b.salesEma || 0) - (a.salesEma || 0) || (a.nextAt || 0) - (b.nextAt || 0));
      for (const w of due) {
        if (timeLeft() < 16000) break;
        const t = { search: w.search, rating: w.rating, defId: w.defId, ref: w.floor || undefined, hot: (w.salesEma || 0) >= 1 };
        let r;
        try { r = await huntOne(t, minProfit, !cmd.observe, true); } catch (e) { r = { target: `${w.search} ${w.rating}`, error: e.message }; }
        if (r.error && /search (budget|halted|HTTP)|logged out/.test(r.error)) { out.stop = r.error; break; }
        updateWatch(w, r);
        out.results.push(brief(r));
      }
      const active = Object.values(watch).filter(w => w.status === 'active');
      out.dueNow = active.filter(w => (w.nextAt || 0) <= Date.now()).length;
      out.nextDueInSec = active.length ? Math.max(0, Math.round((Math.min(...active.map(w => w.nextAt || 0)) - Date.now()) / 1000)) : null;
      out.discoverAgeMin = state.discoveredAt ? Math.round((Date.now() - state.discoveredAt) / 60e3) : null;
      if (!active.length || out.discoverAgeMin === null || out.discoverAgeMin > 60) out.hint = 'run op "discover" to refresh hot sets/cards';
    } else if (out.op === 'status') {
      out.results = {
        realized: state.realized, openCost: state.openCost, budgetCap: state.budgetCap,
        holding: Object.values(state.items).filter(i => !i.sold).map(i => `${i.name}: bought ${i.buy} (${i.how}), listed ${i.listed ? i.listed.price : 'NO'}`),
        bids: Object.values(state.bids).map(b => `${b.name}: ${b.amount}, ends ${new Date(b.endsAt).toISOString().slice(11, 19)} UTC`),
        sold: Object.values(state.items).filter(i => i.sold).map(i => `${i.name}: ${i.buy} -> ${i.sold.price}, net ${net(i.sold.price) - i.buy}`),
        searchesLastHour: state.searchTimes.length, haltUntil: state.haltUntil && state.haltUntil > Date.now() ? new Date(state.haltUntil).toISOString() : null,
        transferList: state.tradepileCount ?? 'unknown (updated by maintain)',
        discoverAgeMin: state.discoveredAt ? Math.round((Date.now() - state.discoveredAt) / 60e3) : null,
        watch: Object.values(state.watch || {}).sort((a, b) => (b.salesEma || 0) - (a.salesEma || 0))
          .map(w => `${w.search} ${w.rating} [${w.status}] floor ${w.floor ?? '?'} mkt ${w.market ?? '?'} sales ${w.salesEma ?? '?'}/min (${w.set || 'manual'})`)
      };
    } else if (out.op === 'watch') { // manual watchlist edits: add [{search, rating, defId?}], remove ["Search|rating"]
      state.watch = state.watch || {};
      for (const c of (cmd.add || [])) {
        const key = `${c.search}|${c.rating}`;
        state.watch[key] = Object.assign({ salesEma: null, probes: 0, fails: 0, nextAt: 0, addedAt: Date.now(), set: 'manual' }, state.watch[key], c, { status: 'active', seenAt: Date.now() });
      }
      for (const key of (cmd.remove || [])) delete state.watch[key];
      out.results = Object.keys(state.watch);
    } else if (out.op === 'export') { // durable copy: save out.results verbatim to data/market_state.json
      const { snap, searchTimes, ...keep } = state;
      out.results = { ...keep, exportedAt: new Date().toISOString() };
    } else if (out.op === 'scan') { // raw read-only view of one filtered search (learning/debugging)
      const t = (cmd.targets || [])[0];
      out.label = await openSearch(t);
      if (cmd.filters) { // debug sequence: count, real query string and screen after each step
        for (const f of cmd.filters) {
          const rows = await search(f);
          const at = await heading(); await back();
          out.results.push(`${JSON.stringify(f)} -> ${rows.length} rows, min ${rows.length ? Math.min(...rows.map(r => r.bin)) : '-'} | ${lastQuery} | on "${at}", after back "${await heading()}"`);
        }
      } else {
        const rows = await search(cmd.filter || {}); await back();
        out.results = rows.map(r => `${r.pos}: bin ${r.bin} bid ${r.bid} start ${r.start} exp ${r.exp}s`);
      }
    } else if (out.op === 'snipe') {
      const t = (cmd.targets || [])[0];
      if (!freshMarket(t, cmd.freshSec || 600)) { const p = await probe(t); out.results.push({ probe: p.label, ...p.s, sold: p.tv }); }
      out.results.push(await snipeLoop(t, t.minProfit || minProfit));
    } else if (out.op === 'maintain') {
      out.results.push(await maintain());
    } else throw new Error(`unknown op "${out.op}"`);
  } catch (e) { out.error = e.message; }
  await saveState().catch(() => {});
  out.coinsEnd = await coins().catch(() => null);
  out.budget = { cap: state.budgetCap, openCost: state.openCost, realized: state.realized, searchesLastHour: state.searchTimes.length,
    holding: Object.values(state.items).filter(i => !i.sold).length, openBids: Object.keys(state.bids).length, transferList: state.tradepileCount ?? null };
  if (!out.log.length) delete out.log;
  return out;
}
