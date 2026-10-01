// Loader: keeps tool output small and always runs the latest code from disk.
// Needs (once per session, background, from the repo root): python scripts/state_server.py   (127.0.0.1:8765)
// Routes by localStorage['kilo-market-cmd'].op: "discover" -> scripts/discover.js, everything else -> scripts/market_engine.js.
// If the EA tab has no engine state yet, seeds it from data/market_state.json; after every call saves the
// state back to that file (minus transient snapshots), so a new chat or a fresh browser profile can continue.
async (page) => {
  const app = page.context().pages().find(p => p.url().includes('ultimate-team/web-app'));
  if (!app) return { error: 'EA Web App tab not found - open it and log in first' };
  const base = 'http://127.0.0.1:8765';
  const op = await app.evaluate(() => { try { return JSON.parse(localStorage.getItem('kilo-market-cmd') || '{}').op || 'probe'; } catch (e) { return 'bad-cmd'; } });
  if (op === 'bad-cmd') return { error: "kilo-market-cmd is not valid JSON" };
  const hasState = await app.evaluate(() => !!localStorage.getItem('kilo-market-state'));
  let seeded = false;
  if (!hasState) {
    const s = await page.request.get(`${base}/data/market_state.json?t=${Date.now()}`).catch(() => null);
    if (s && s.ok()) { await app.evaluate((txt) => localStorage.setItem('kilo-market-state', txt), await s.text()); seeded = true; }
  }
  const file = op === 'discover' ? 'discover.js' : 'market_engine.js';
  const r = await page.request.get(`${base}/scripts/${file}?t=${Date.now()}`).catch(() => null);
  if (!r || !r.ok()) return { error: `loader: cannot fetch scripts/${file} - start the server from the repo root (see header)` };
  const result = await eval(await r.text())(page);
  const raw = await app.evaluate(() => localStorage.getItem('kilo-market-state'));
  if (raw) {
    const { snap, searchTimes, ...keep } = JSON.parse(raw);
    const put = await page.request.put(`${base}/data/market_state.json`, { data: JSON.stringify({ ...keep, savedAt: new Date().toISOString() }, null, 1),
      headers: { 'content-type': 'application/json' } }).catch(() => null);
    if (!put || put.status() !== 204) result.stateFileWarning = `state not saved to data/market_state.json (${put ? 'HTTP ' + put.status() : 'server down'})`;
  }
  return seeded ? { seededStateFromFile: true, ...result } : result;
}
