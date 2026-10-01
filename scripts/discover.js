// scripts/discover.js - refresh the trading watchlist from FUT.GG (hot FUT Gallery sets -> their key cards).
// Run via scripts/run.js with localStorage['kilo-market-cmd'] = { "op": "discover", ...options }.
// Options (defaults): maxSetCost 20000, minTokens 13, sets 8, minPoints 90, maxCards 24.
// Reads FUT.GG only (no EA searches). Writes candidates into kilo-market-state.watch on the EA tab.
// Hotness is NOT decided here: FUT.GG only nominates cards; the engine's probes measure real sales.
async (page) => {
  const ctx = page.context();
  const app = ctx.pages().find(p => p.url().includes('ultimate-team/web-app'));
  if (!app) return { error: 'EA Web App tab not found' };
  const cmd = await app.evaluate(() => JSON.parse(localStorage.getItem('kilo-market-cmd') || '{}'));
  const o = Object.assign({ maxSetCost: 20000, minTokens: 13, sets: 8, minPoints: 90, maxCards: 24 }, cmd);

  // 1. Rank club sets on the planner: tokens at the best reachable grade per coin of the cheapest lineup.
  const fg = ctx.pages().find(p => p.url().includes('fut.gg/fut-gallery'));
  if (!fg) return { error: 'FUT.GG gallery tab (Tab 0) not found' };
  await fg.goto('https://www.fut.gg/fut-gallery/', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await fg.waitForTimeout(2000);
  const more = fg.getByRole('button', { name: /Show more sets/i });
  for (let i = 0; i < 4 && await more.isVisible().catch(() => false); i++) { await more.click(); await fg.waitForTimeout(1000); }
  const all = await fg.evaluate(() => {
    const seen = new Set(), out = [];
    for (const a of document.querySelectorAll('a[href*="/fut-gallery/"]')) {
      const path = a.getAttribute('href').replace(/^.*\/fut-gallery\//, '').replace(/\/$/, '');
      if (seen.has(path) || path.split('/').length !== 2) continue;
      seen.add(path);
      const text = ((a.closest('li, article, div[class*="rounded"]') || a).innerText || '').replace(/\s+/g, ' ');
      const m = text.match(/best possible\s+([\d,]+|Not buyable yet)\s+(\d+)\s+(\d+)\s*\/\s*(\d+)/);
      if (!m) continue;
      out.push({ path, name: text.split(' D C B A S')[0].trim(), cost: /\d/.test(m[1]) ? +m[1].replace(/,/g, '') : null,
        players: +m[2], tokens: +m[3], tokensMax: +m[4] });
    }
    return out;
  });
  const clubSets = all.filter(s => !/^(leagues|rarities)\//.test(s.path) && s.cost && s.cost <= o.maxSetCost && s.tokens >= o.minTokens)
    .map(s => ({ ...s, score: +(s.tokens / Math.max(s.cost, 500) * 1000).toFixed(2) }))
    .sort((a, b) => b.score - a.score).slice(0, o.sets);

  // 2. Read each set's cheapest lineup in a throwaway tab: card name, rating, gallery points, FUT.GG id (= EA asset id).
  const tmp = await ctx.newPage();
  const cards = [];
  try {
    for (const s of clubSets) {
      await tmp.goto(`https://www.fut.gg/fut-gallery/${s.path}/`, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await tmp.waitForSelector('li[data-gallery-lineup-player]', { timeout: 8000 }).catch(() => {});
      const lineup = await tmp.evaluate(() => Array.from(document.querySelectorAll('li[data-gallery-lineup-player]')).slice(0, 15).map(li => {
        const m = (li.querySelector('img')?.alt || '').match(/^(.*) - (\d+) - /);
        return m ? { search: m[1].trim(), rating: +m[2], pts: parseInt(li.innerText, 10) || 0, defId: +li.getAttribute('data-gallery-lineup-player') } : null;
      }).filter(Boolean));
      lineup.filter(c => c.pts >= o.minPoints).forEach(c => cards.push({ ...c, set: s.name, setScore: s.score }));
    }
  } finally { await tmp.close(); }
  cards.sort((a, b) => b.setScore - a.setScore || b.pts - a.pts);
  const picked = cards.slice(0, o.maxCards);

  // 3. Merge into the engine's watchlist, keeping measured stats of cards already tracked.
  const summary = await app.evaluate(({ picked }) => {
    const st = JSON.parse(localStorage.getItem('kilo-market-state') || '{}');
    st.watch = st.watch || {};
    const now = Date.now();
    for (const c of picked) {
      const key = `${c.search}|${c.rating}`;
      st.watch[key] = Object.assign({ status: 'active', salesEma: null, probes: 0, fails: 0, nextAt: 0, addedAt: now }, st.watch[key],
        { search: c.search, rating: c.rating, defId: c.defId, pts: c.pts, set: c.set, setScore: c.setScore, seenAt: now });
    }
    // Prune: FUT.GG cards that dropped out of the hot sets and never proved >= 0.3 sales/min. Manual adds stay.
    const pruned = [];
    for (const [key, w] of Object.entries(st.watch)) {
      if (w.set !== 'manual' && w.seenAt < now && !(w.salesEma >= 0.3)) { delete st.watch[key]; pruned.push(key); }
    }
    st.discoveredAt = now;
    localStorage.setItem('kilo-market-state', JSON.stringify(st));
    return { watchSize: Object.keys(st.watch).length, active: Object.values(st.watch).filter(w => w.status === 'active').length, pruned };
  }, { picked });
  return {
    sets: clubSets.map(s => `${s.name}: ${s.tokens}/${s.tokensMax} tok for ${s.cost} (score ${s.score})`),
    added: picked.map(c => `${c.search} ${c.rating} (${c.set}, ${c.pts} pts)`),
    ...summary
  };
}
