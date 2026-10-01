/**
 * Apply SBC Squad to Pitch
 */
async (page) => {
  const context = page.context();
  const pages = context.pages();
  const appPage = pages.find(p => p.url().includes('ea.com')) || page;

  await appPage.bringToFront();

  const solution = [
    { slot: 0, id: 947411645285, name: "Unnerstall", rating: 76 },
    { slot: 1, id: 947411954283, name: "Guttenberger", rating: 74 },
    { slot: 2, id: 947459056910, name: "Gómez", rating: 76 },
    { slot: 3, id: 947416191524, name: "Koopmeiners", rating: 78 },
    { slot: 4, id: 946442199724, name: "Delzer", rating: 76 },
    { slot: 5, id: 947416191520, name: "Douglas Luiz", rating: 78 },
    { slot: 6, id: 945024189583, name: "Sarr", rating: 79 },
    { slot: 7, id: 944287727940, name: "Lacasse", rating: 79 },
    { slot: 8, id: 947416165754, name: "Crnogorčević", rating: 78 },
    { slot: 9, id: 947411645287, name: "Weghorst", rating: 77 },
    { slot: 10, id: 947416314665, name: "Álvaro Valles", rating: 77 }
  ];

  const result = await appPage.evaluate((sol) => {
    const app = getAppMain();
    const nav = app.getRootViewController().currentController.currentController;
    const sbcCtrl = nav.currentController;
    const squad = sbcCtrl._squad;
    const challenge = Array.from(sbcCtrl._set.challenges.values())[0];

    // 1. Clear squad pitch slots
    squad.getSlots().slice(0, 11).forEach(slot => {
      if (slot.item && slot.item.id > 0) {
        squad.removeItemFromSlot(slot);
      }
    });

    // 2. Fetch all club items
    const allClubItems = repositories.Item.club.items.values();

    const placed = [];
    for (const target of sol) {
      const item = allClubItems.find(it => it.id === target.id);
      if (!item) {
        placed.push({ slot: target.slot, success: false, error: `Item ${target.name} (${target.id}) not found in club repository` });
        continue;
      }
      try {
        // Critical signature: slotIndex first, item second!
        squad.addItemToSlot(target.slot, item);
        placed.push({ slot: target.slot, success: true, name: target.name, rating: target.rating });
      } catch (err) {
        placed.push({ slot: target.slot, success: false, error: err.message });
      }
    }

    // 3. Update chemistry & rating
    squad.calculateChemistry();
    squad.updateChemistry();

    // 4. Sync UI views
    if (sbcCtrl.view?.render) sbcCtrl.view.render();
    if (sbcCtrl._generateSquadOverview) sbcCtrl._generateSquadOverview();
    if (sbcCtrl._requirementsNotification?._eChallengeUpdated) {
      sbcCtrl._requirementsNotification._eChallengeUpdated();
    }

    const meetsAll = challenge.meetsRequirements();
    const metCount = challenge.getNumberOfRequirementsMet();

    return {
      placed,
      rating: squad._rating,
      chemistry: squad._chemistry,
      meetsAll,
      metCount
    };
  }, solution);

  return result;
}
