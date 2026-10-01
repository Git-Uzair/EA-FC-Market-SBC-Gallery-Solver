/**
 * Apply TOTW Upgrade Squad to Pitch
 */
async (page) => {
  const context = page.context();
  const pages = context.pages();
  const appPage = pages.find(p => p.url().includes('ea.com')) || page;

  await appPage.bringToFront();

  const solution = [
    { slot: 0, id: 943378296004, name: "Baumann", rating: 84 },
    { slot: 1, id: 946087849672, name: "Mancini", rating: 84 },
    { slot: 2, id: 946442663759, name: "Lawrence", rating: 83 },
    { slot: 3, id: 941972894972, name: "Charles", rating: 82 },
    { slot: 4, id: 946442663763, name: "Caruso", rating: 83 },
    { slot: 5, id: 945949917883, name: "Geyoro", rating: 84 },
    { slot: 6, id: 946442199721, name: "Santos", rating: 83 },
    { slot: 7, id: 946603850191, name: "Shrader", rating: 83 },
    { slot: 8, id: 944335425035, name: "Cascarino", rating: 85 },
    { slot: 9, id: 947430721022, name: "Cherki", rating: 86 },
    { slot: 10, id: 944283601388, name: "Sanchez", rating: 84 }
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
        placed.push({ slot: target.slot, success: false, error: `Item ${target.name} (${target.id}) not found` });
        continue;
      }
      try {
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
      meetsAll,
      metCount
    };
  }, solution);

  return result;
}
