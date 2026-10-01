// SBC inventory + challenge dump for scripts/solve_sbc_group.py. Read-only: never changes a squad or item.
// Step 1: playwright_browser_run_code_unsafe { filename: "scripts/sbc_dump_inventory.js" }
//         -> returns a small summary and stores the full dump in the EA tab's localStorage['kilo-sbc-dump'].
// Step 2 (EA tab must be the current tab):
//         playwright_browser_evaluate { function: "() => JSON.parse(localStorage.getItem('kilo-sbc-dump'))",
//                                       filename: "data/sbc_inventory.json" }
// Run it with the target challenge's squad view open (after "Start Challenge"); elsewhere `challenges` is empty.
// Rows = club players + SBC-storage duplicates + unassigned players, flagged locked (Paletools) / activeSquad.
async (page) => {
  const app = page.context().pages().find(p => p.url().includes('ultimate-team/web-app'));
  if (!app) return { error: 'EA Web App tab not found - open it and log in first' };
  return app.evaluate(async () => {
    const obs = (o) => new Promise(r => o.observe(undefined, (a, b) => r(b)));
    const itemsOf = (res) => (res && res.response && res.response.items) || (res && res.data && res.data.items) || [];
    const f = (fn) => { try { return fn(); } catch (e) { return null; } };
    const L = (k) => f(() => services.Localization.localize(k));

    const lockKey = Object.keys(localStorage).find(k => /^paletools:\d+:\d+:lockedItems$/.test(k)) || null;
    const lockedRaw = lockKey ? JSON.parse(localStorage.getItem(lockKey) || '[]') : [];
    const lockedDefs = new Set(lockedRaw.map(x => String(x).replace(/u$/, ''))); // "<defId>u" = untradeable copy

    const activeSquadIds = new Set();
    const sres = await obs(services.Squad.requestSquadById(services.Squad.getActiveSquadId()));
    const asq = sres && sres.data && sres.data.squad; // squad payload is in .data, not .response
    if (asq && typeof asq.getPlayers === 'function') {
      for (const x of asq.getPlayers()) { const it = x && (x.item || x._item || x); if (it && it.id) activeSquadIds.add(String(it.id)); }
    }

    const crit = (player) => { const c = new UTSearchCriteriaDTO(); if (player) c.type = SearchType.PLAYER; c.count = 500; return c; };
    const club = itemsOf(await obs(services.Club.search(crit(true)))); // one call returns the whole club
    const storage = itemsOf(await obs(services.Item.searchStorageItems(crit(false))));
    let unassigned = [];
    try { unassigned = itemsOf(await obs(services.Item.requestUnassignedItems())); } catch (e) { /* none */ }

    const map = (i, source) => ({
      source, id: i.id, defId: i.definitionId, name: i._staticData && i._staticData.name, rating: i.rating,
      rareflag: i.rareflag, tier: f(() => i.getTier()), nationId: i.nationId, leagueId: i.leagueId, teamId: i.teamId,
      nation: L('search.nationName.nation' + i.nationId), preferredPosition: i.preferredPosition,
      possiblePositions: f(() => i.possiblePositions), tradeable: f(() => i.isTradeable()), loans: i.loans,
      limitedUse: f(() => i.isLimitedUse()), timeLimited: f(() => i.isTimeLimited()),
      evoUpgrades: Array.isArray(i.upgrades) ? i.upgrades.length : (i.upgrades ? 1 : 0),
      academyEnrolled: f(() => i.isEnrolledInAcademy()), academyGraduate: f(() => i.isAcademyGraduate()),
      special: f(() => i.isSpecial()), rare: f(() => i.isRare()), favorite: i.isFavorite, concept: i.concept, type: i.type,
      locked: lockedDefs.has(String(i.definitionId)), activeSquad: activeSquadIds.has(String(i.id))
    });
    const rows = [
      ...club.filter(i => i.type === 'player').map(i => map(i, 'club')),
      ...storage.filter(i => i.type === 'player').map(i => map(i, 'storage')),
      ...unassigned.filter(i => i.type === 'player').map(i => map(i, 'unassigned'))
    ];

    const ctrl = getAppMain().getRootViewController().currentController.currentController.currentController;
    const set = ctrl && ctrl._set; // present on the challenge squad view (UTSBCSquadSplitViewController)
    const current = set && ctrl._squad ? Array.from(set.challenges.values()).find(ch => ch.squad === ctrl._squad) : null;
    const challenges = set ? Array.from(set.challenges.values()).map(ch => {
      const fm = repositories.Squad.getFormation(ch.formation);
      return {
        id: ch.id, name: ch.name, status: ch.status, formationName: ch.formation,
        formation: fm.positions.map(p => p.typeId), slotNames: fm.positions.map(p => p.name),
        reqs: (ch.eligibilityRequirements || []).map(r => {
          const kv = r.kvPairs._collection; const key = Number(Object.keys(kv)[0]);
          return { key, scope: r.scope, count: r.count, values: kv[key], text: r.buildString() };
        })
      };
    }) : [];

    const out = {
      dumpedAt: new Date().toISOString(), controller: ctrl && ctrl.constructor.name, setId: set && set.id,
      setName: set && set.name, currentChallenge: current && current.id, lockKey, lockedCount: lockedDefs.size,
      activeSquadCount: activeSquadIds.size,
      counts: { club: club.length, storage: storage.length, unassigned: unassigned.length, rows: rows.length },
      challenges, rows
    };
    localStorage.setItem('kilo-sbc-dump', JSON.stringify(out));
    const { challenges: chs, rows: _rows, ...summary } = out;
    return { ...summary, challenges: chs.map(c => ({ id: c.id, name: c.name, status: c.status, reqs: c.reqs.map(r => r.text) })) };
  });
}
