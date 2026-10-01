// Lineup placer. This file is the template: scripts/solve_sbc_group.py fills the two placeholders on the last
// lines and writes one copy per challenge to data/sbc_apply_<challengeId>.js. Run a filled copy with
// playwright_browser_run_code_unsafe { filename: "data/sbc_apply_<id>.js" } (the raw template throws on purpose).
// Places the lineup into the OPEN challenge and returns EA's own verdict (meets, met, chem, rating, per-slot chem).
// NEVER submits. Aborts without touching the pitch if an item is missing, Paletools-locked, in the active squad,
// or the open challenge is not the target.
async (page) => {
  const app = page.context().pages().find(p => p.url().includes('ultimate-team/web-app'));
  if (!app) return { error: 'EA Web App tab not found - open it and log in first' };
  return app.evaluate(async ({ TARGET, lineup }) => { // lineup: [[slotIndex, itemId], ...], slot order = formation positions
    const obs = (o) => new Promise(r => o.observe(undefined, (a, b) => r(b)));
    const itemsOf = (res) => (res && res.response && res.response.items) || (res && res.data && res.data.items) || [];
    const crit = (player) => { const c = new UTSearchCriteriaDTO(); if (player) c.type = SearchType.PLAYER; c.count = 500; return c; };
    const club = itemsOf(await obs(services.Club.search(crit(true))));
    const storage = itemsOf(await obs(services.Item.searchStorageItems(crit(false))));
    let unassigned = [];
    try { unassigned = itemsOf(await obs(services.Item.requestUnassignedItems())); } catch (e) { /* none */ }
    const byId = new Map([...club, ...storage, ...unassigned].map(i => [i.id, i]));

    const lockKey = Object.keys(localStorage).find(k => /^paletools:\d+:\d+:lockedItems$/.test(k));
    if (!lockKey) return { abort: true, reason: 'Paletools lock list not found - is Paletools loaded?' };
    const lockedDefs = new Set(JSON.parse(localStorage.getItem(lockKey) || '[]').map(x => String(x).replace(/u$/, '')));
    const activeIds = new Set();
    const sres = await obs(services.Squad.requestSquadById(services.Squad.getActiveSquadId()));
    const asq = sres && sres.data && sres.data.squad;
    if (asq) for (const x of asq.getPlayers()) { const it = x && (x.item || x._item || x); if (it && it.id) activeIds.add(it.id); }

    const missing = lineup.filter(([, id]) => !byId.has(id)).map(([, id]) => id);
    const blocked = lineup.filter(([, id]) => byId.has(id) && (lockedDefs.has(String(byId.get(id).definitionId)) || activeIds.has(id))).map(([, id]) => id);
    if (missing.length || blocked.length) return { abort: true, missing, blocked };

    const sbcCtrl = getAppMain().getRootViewController().currentController.currentController.currentController;
    const squad = sbcCtrl && sbcCtrl._squad;
    const challenge = squad && sbcCtrl._set && Array.from(sbcCtrl._set.challenges.values()).find(ch => ch.squad === squad);
    if (!challenge || challenge.id !== TARGET) return { abort: true, reason: 'open challenge is not the target', open: challenge && challenge.id, target: TARGET };

    squad.getSlots().slice(0, 11).forEach(slot => { if (slot.item && slot.item.id > 0) squad.removeItemFromSlot(slot); });
    for (const [s, id] of lineup) {
      try { squad.addItemToSlot(s, byId.get(id)); } catch (e) { return { error: String(e), at: s }; } // slot index FIRST
    }
    if (squad.calculateChemistry) squad.calculateChemistry();
    if (squad.updateChemistry) squad.updateChemistry();
    if (sbcCtrl.view && sbcCtrl.view.render) sbcCtrl.view.render();
    if (sbcCtrl._generateSquadOverview) sbcCtrl._generateSquadOverview();
    if (sbcCtrl._requirementsNotification && sbcCtrl._requirementsNotification._eChallengeUpdated) sbcCtrl._requirementsNotification._eChallengeUpdated();

    return {
      challengeId: challenge.id, meets: challenge.meetsRequirements(), met: challenge.getNumberOfRequirementsMet(),
      chem: squad.getChemistry(), rating: squad.getRating(),
      reqStatus: challenge.eligibilityRequirements.map(r => ({ text: r.buildString(), ok: challenge.isRequirementMet(r) })),
      slots: squad.getSlots().slice(0, 11).map((sl, i) => ({ i, pos: sl.position && sl.position.name, name: sl.item && sl.item._staticData && sl.item._staticData.name, rating: sl.item && sl.item.rating, chem: sl.chemistry }))
    };
  }, { TARGET: __TARGET__, lineup: __LINEUP__ });
}
