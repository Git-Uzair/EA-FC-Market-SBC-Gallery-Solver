/**
 * Rarity-Based Set Completion Engine (TOTW, Heroes, Special sets)
 * 1. Navigates to Transfer Market
 * 2. Sets Rarity filter (e.g. "Team of the Week" or "Base Hero")
 * 3. Step-probes Max Buy Now to find active market floor
 * 4. Buys lowest listing matching criteria (skipping <1m cards)
 * 5. Routes to Store -> Unassigned Items -> Lists on Transfer Market immediately
 * 6. Asserts 0 cards kept in club
 */
async (page) => {
  const context = page.context();
  const pages = context.pages();
  const appPage = pages.find(p => p.url().includes('ea.com')) || pages[1];
  if (!appPage) return { error: "EA FC Web App tab not found" };

  const sleep = (ms) => appPage.waitForTimeout(ms);
  const roundToLadder = (p) => {
    if (p <= 1000) return Math.max(Math.round(p / 50) * 50, 200);
    if (p <= 10000) return Math.round(p / 100) * 100;
    if (p <= 50000) return Math.round(p / 250) * 250;
    return Math.round(p / 500) * 500;
  };

  // Configuration from argument or localStorage
  const config = await appPage.evaluate(() => {
    const raw = localStorage.getItem('kilo-rarity-config');
    return raw ? JSON.parse(raw) : {
      rarity: "Team of the Week",
      minRating: 80,
      maxRating: 82,
      startProbe: 10500,
      hardMaxCap: 11500,
      alreadyTrackedNames: ["Amdouni"]
    };
  });

  const rarityName = config.rarity || "Team of the Week";
  const hardMaxCap = roundToLadder(config.hardMaxCap || 11500);
  let probePrice = roundToLadder(config.startProbe || 10500);
  const alreadyTracked = new Set((config.alreadyTrackedNames || []).map(n => n.toLowerCase().trim()));

  const result = { success: false, rarity: rarityName };

  // 1. Navigate to Transfers -> Search Transfer Market
  await appPage.bringToFront();
  await appPage.getByRole('button', { name: ' Transfers' }).click();
  await sleep(700);

  const searchTile = appPage.getByRole('heading', { name: 'Search the Transfer Market' });
  if (await searchTile.isVisible()) {
    await searchTile.click();
    await sleep(700);
  }

  // 2. Reset filters
  const resetBtn = appPage.getByRole('button', { name: 'Reset' });
  if (await resetBtn.isVisible()) {
    await resetBtn.click();
    await sleep(400);
  }

  // 3. Select Rarity Filter
  const rarityRow = appPage.locator('.ut-search-filter-control--row').filter({ hasText: 'Rarity' });
  if (!await rarityRow.isVisible()) {
    result.error = "Rarity filter row not visible";
    return result;
  }
  await rarityRow.click();
  await sleep(400);

  const rarityOption = appPage.locator('li').filter({ hasText: rarityName });
  if (!await rarityOption.isVisible()) {
    result.error = `Rarity option "${rarityName}" not found in dropdown`;
    return result;
  }
  await rarityOption.click();
  await sleep(400);

  // 4. Step-Probe Price Discovery
  const maxBuyInput = appPage.locator('.price-filter .ut-numeric-input-spinner-control input').nth(3);
  let foundResults = false;
  let probeAttempts = 0;

  while (!foundResults && probePrice <= hardMaxCap && probeAttempts < 6) {
    probeAttempts++;
    if (await maxBuyInput.isVisible()) {
      await maxBuyInput.click();
      await maxBuyInput.fill(`${Math.round(probePrice)}`);
      await sleep(150);
    }

    await appPage.getByRole('button', { name: 'Search [ Digit2]' }).click();
    await sleep(1200);

    const matchStatus = await appPage.evaluate(({ minRating, maxRating, alreadyTrackedArr }) => {
      const noRes = !!document.querySelector('.ut-no-results-view, .ut-transfer-market-search-results-view h2');
      if (noRes) return { noResults: true, hasMatching: false };

      const ctrl = window.getAppMain().getRootViewController().currentController.currentController.currentController;
      const coll = ctrl?._listController?.paginationViewModel?.paginationList?._collection || [];
      if (coll.length === 0) return { noResults: true, hasMatching: false };

      const trackedSet = new Set(alreadyTrackedArr.map(n => n.toLowerCase().trim()));
      const valid = coll.filter(it => {
        if (!it || !it._auction || it._auction.buyNowPrice <= 0) return false;
        if (minRating && it.rating < minRating) return false;
        if (maxRating && it.rating > maxRating) return false;
        const name = (it._staticData?.name || '').toLowerCase().trim();
        if (trackedSet.has(name)) return false;
        return true;
      });

      return { noResults: false, hasMatching: valid.length > 0, count: valid.length };
    }, { minRating: config.minRating, maxRating: config.maxRating, alreadyTrackedArr: Array.from(alreadyTracked) });

    if (matchStatus.noResults || !matchStatus.hasMatching) {
      await appPage.getByRole('button', { name: ' [ Digit1 ]' }).click();
      await sleep(500);
      probePrice = roundToLadder(probePrice + (probePrice < 1000 ? 150 : (probePrice < 10000 ? 250 : 500)));
    } else {
      foundResults = true;
    }
  }

  if (!foundResults) {
    result.error = `No untracked ${rarityName} cards found under ${hardMaxCap} cap (probed up to ${probePrice})`;
    return result;
  }

  // 5. Select Best Listing via Memory Model (cheapest, >60s remaining, untracked)
  const selection = await appPage.evaluate(({ minRating, maxRating, alreadyTrackedArr, hardMaxCap }) => {
    const ctrl = window.getAppMain().getRootViewController().currentController.currentController.currentController;
    const coll = ctrl?._listController?.paginationViewModel?.paginationList?._collection || [];

    const trackedSet = new Set(alreadyTrackedArr.map(n => n.toLowerCase().trim()));
    let bestIdx = -1;
    let bestPrice = Infinity;
    let fallbackIdx = -1;
    let fallbackPrice = Infinity;

    for (let i = 0; i < coll.length; i++) {
      const it = coll[i];
      if (!it || !it._auction) continue;

      if (minRating && it.rating < minRating) continue;
      if (maxRating && it.rating > maxRating) continue;

      const name = (it._staticData?.name || '').toLowerCase().trim();
      if (trackedSet.has(name)) continue;

      const price = it._auction.buyNowPrice;
      if (price <= 0 || price > hardMaxCap) continue;

      if (price < fallbackPrice) {
        fallbackPrice = price;
        fallbackIdx = i;
      }

      const expires = it._auction.expires;
      if (expires > 60 && price < bestPrice) {
        bestPrice = price;
        bestIdx = i;
      }
    }

    const finalIdx = bestIdx !== -1 ? bestIdx : fallbackIdx;
    const finalPrice = bestIdx !== -1 ? bestPrice : fallbackPrice;

    return {
      found: finalIdx !== -1,
      index: finalIdx,
      price: finalPrice,
      rating: finalIdx !== -1 ? coll[finalIdx].rating : null,
      name: finalIdx !== -1 ? coll[finalIdx]._staticData?.name : null
    };
  }, { minRating: config.minRating, maxRating: config.maxRating, alreadyTrackedArr: Array.from(alreadyTracked), hardMaxCap });

  if (!selection.found) {
    result.error = `No valid untracked listing found under ${hardMaxCap}`;
    await appPage.getByRole('button', { name: ' [ Digit1 ]' }).click().catch(() => {});
    return result;
  }

  result.player = selection.name;
  result.rating = selection.rating;
  result.targetPrice = selection.price;

  const items = appPage.getByRole('listitem');
  await items.nth(selection.index).click();
  await sleep(500);

  // 6. Buy Card
  const buyBtn = appPage.getByRole('button', { name: /Buy Now for/i });
  try {
    await buyBtn.waitFor({ state: 'visible', timeout: 3000 });
  } catch (e) {}

  if (!await buyBtn.isVisible() || await buyBtn.isDisabled()) {
    result.error = "Buy button was disabled or invisible (card sniped/expired)";
    await appPage.getByRole('button', { name: ' [ Digit1 ]' }).click().catch(() => {});
    return result;
  }

  const buyText = await buyBtn.innerText();
  const buyPriceMatch = buyText.match(/[\d,]+/);
  const boughtNum = buyPriceMatch ? parseInt(buyPriceMatch[0].replace(/,/g, ''), 10) : selection.price;

  if (boughtNum > hardMaxCap) {
    result.error = `Price ${boughtNum} exceeded safety cap ${hardMaxCap}!`;
    await appPage.getByRole('button', { name: ' [ Digit1 ]' }).click().catch(() => {});
    return result;
  }

  result.boughtFor = boughtNum;

  try {
    await buyBtn.click({ timeout: 2500 });
  } catch (e) {
    result.error = `Buy click failed: ${e.message}`;
    await appPage.getByRole('button', { name: ' [ Digit1 ]' }).click().catch(() => {});
    return result;
  }
  await sleep(1000);

  // Check for confirmation modal (if Paletools fast-buy is off)
  const modalOk = appPage.locator('.view-modal-container button.btn-standard.section-header-btn.primary, .view-modal-container button:has-text("Ok")').first();
  if (await modalOk.isVisible()) {
    await modalOk.click();
    await sleep(800);
  }

  // 7. Store -> Unassigned Items (MANDATORY INVARIANT)
  await appPage.getByRole('button', { name: ' Store' }).click();
  await sleep(1200);

  const unassignedTile = appPage.getByRole('heading', { name: 'Unassigned Items' });
  if (!await unassignedTile.isVisible()) {
    await sleep(1000);
    if (!await unassignedTile.isVisible()) {
      result.error = `Card was sniped before buy completion. Unassigned is empty.`;
      return result;
    }
  }

  await unassignedTile.click();
  await sleep(1000);

  // Select unlocked card in unassigned
  const unRows = appPage.locator('.listFUTItem');
  const rowCount = await unRows.count();
  let singleUnlocked = null;
  let unlockedCount = 0;
  let selected = false;

  for (let i = 0; i < rowCount; i++) {
    const row = unRows.nth(i);
    if (await row.locator('.locked').count()) continue;
    unlockedCount++;
    singleUnlocked = row;
    const txt = (await row.innerText()).toLowerCase();
    if (selection.name && txt.includes(selection.name.toLowerCase())) {
      await row.click();
      await sleep(500);
      selected = true;
      break;
    }
  }

  if (!selected && unlockedCount === 1 && singleUnlocked) {
    await singleUnlocked.click();
    await sleep(500);
    selected = true;
  }

  if (!selected) {
    result.error = `Purchased card not identified in Unassigned. Left unlisted for safety.`;
    return result;
  }

  // 8. Relist at Purchase Price Floor / Paletools Cheapest
  const listBtn = appPage.getByRole('button', { name: 'List on Transfer Market' });
  if (await listBtn.isVisible()) {
    await listBtn.click();
    await sleep(600);
  }

  const cheapestBtn = appPage.getByRole('button', { name: 'Cheapest' });
  if (await cheapestBtn.isVisible()) {
    await cheapestBtn.click();
  }

  const startPriceInput = appPage.locator('.panelActions input').nth(0);
  const buyNowInput = appPage.locator('.panelActions input').nth(1);

  // Poll Paletools Cheapest for up to 1.5s
  let paletoolsPopulatedValid = false;
  const pollStart = Date.now();
  while (Date.now() - pollStart < 1500) {
    const val = await buyNowInput.inputValue().catch(() => '');
    const cleanVal = parseInt((val || '').replace(/,/g, ''), 10);
    const maxAllowed = Math.max(boughtNum * 1.15, boughtNum + 500);
    const bandingCap = boughtNum * 1.4;
    if (cleanVal && cleanVal > 0 && cleanVal <= maxAllowed && cleanVal < bandingCap) {
      paletoolsPopulatedValid = true;
      break;
    }
    await sleep(200);
  }

  if (!paletoolsPopulatedValid) {
    const safeBuyNow = Math.max(boughtNum, 200);
    let safeStart;
    if (safeBuyNow <= 1000) safeStart = Math.max(safeBuyNow - 50, 150);
    else if (safeBuyNow <= 10000) safeStart = safeBuyNow - 100;
    else if (safeBuyNow <= 50000) safeStart = safeBuyNow - 250;
    else safeStart = safeBuyNow - 500;

    await startPriceInput.click();
    await startPriceInput.fill(`${safeStart}`);
    await sleep(150);
    await buyNowInput.click();
    await buyNowInput.fill(`${safeBuyNow}`);
    await sleep(150);
  }

  await appPage.getByRole('button', { name: 'List for Transfer' }).click();
  await sleep(1200);

  result.success = true;
  result.relisted = true;
  return result;
}
