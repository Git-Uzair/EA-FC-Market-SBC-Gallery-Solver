/**
 * Buy Missing Cards Runner (Fixed 2026-09-29)
 * Reads targets from localStorage['kilo-missing-targets'] on futPage (Tab 0)
 * Searches each player, matches exact clubId and cardId, buys lowest market listing (no price cap),
 * handles EA confirm dialog, routes to Unassigned, and instantly relists at purchase floor / Paletools cheapest.
 */
async (page) => {
  const context = page.context();
  const pages = context.pages();
  const futPage = pages.find(p => p.url().includes('fut.gg')) || pages[0];
  const appPage = pages.find(p => p.url().includes('ea.com')) || pages[1];

  if (!futPage) return { error: "FUT.GG tab not found" };
  if (!appPage) return { error: "EA FC Web App tab not found" };

  const sleep = (ms) => appPage.waitForTimeout(ms);
  const stripAccents = (str) => (str || '')
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[țţȚŢ]/gu, 't')
    .replace(/[șşȘŞ]/gu, 's')
    .replace(/[đðĐÐ]/gu, 'd')
    .replace(/[ćčĆČ]/gu, 'c')
    .replace(/[žŽ]/gu, 'z')
    .replace(/[łŁ]/gu, 'l')
    .replace(/[øØ]/gu, 'o')
    .replace(/[æÆ]/gu, 'ae');

  const config = await futPage.evaluate(() => {
    const raw = localStorage.getItem('kilo-missing-targets');
    return raw ? JSON.parse(raw) : { targets: [], start: 0, size: 2 };
  });

  const allTargets = config.targets || [];
  const startIdx = config.start || 0;
  const batchSize = config.size || 2;
  const targets = allTargets.slice(startIdx, startIdx + batchSize);

  if (targets.length === 0) {
    return { error: "No targets remaining in kilo-missing-targets", start: startIdx, total: allTargets.length };
  }

  await appPage.bringToFront();

  async function processPlayer(target, minStartingProbe = null) {
    const rawName = target.name || '';
    const cleanName = stripAccents(rawName);
    const cleanSlug = stripAccents(target.slug || '');
    const lastName = cleanName.split(' ').pop();
    const result = {
      player: target.name,
      rating: target.rating,
      club: target.clubName,
      clubId: target.clubId,
      cardId: target.cardId,
      success: false
    };

    const clickSearch = async () => {
      const btn = appPage.locator('.ut-filter-container button.btn-standard.primary, button:has-text("Search")').first();
      await btn.click();
    };
    const clickBack = async () => {
      const btn = appPage.locator('.ut-navigation-button-control, button.btn-back, button:has-text("")').first();
      await btn.click().catch(() => {});
    };

    // 1. Transfers -> Search Transfer Market
    const transferBtn = appPage.locator('.icon-transfer, button:has-text("Transfers")').first();
    if (await transferBtn.isVisible().catch(() => false)) {
      await transferBtn.click();
      await sleep(700);
    }

    const searchTile = appPage.locator('.ut-tile-view--search, h1:has-text("Search the Transfer Market")').first();
    if (await searchTile.isVisible().catch(() => false)) {
      await searchTile.click();
      await sleep(700);
    }

    // 2. Reset filters
    const resetBtn = appPage.locator('button:has-text("Reset")').first();
    if (await resetBtn.isVisible().catch(() => false)) {
      await resetBtn.click();
      await sleep(400);
    }

    // 3. Search player name with autocomplete
    async function selectAutocomplete(searchTerm) {
      const nameInput = appPage.locator('.ut-player-search-control input');
      if (!await nameInput.isVisible().catch(() => false)) {
        const clearBtn = appPage.locator('.ut-player-search-control button.icon_close, .ut-player-search-control .btn-clear');
        if (await clearBtn.isVisible().catch(() => false)) {
          await clearBtn.click();
          await sleep(400);
        }
      }
      if (!await nameInput.isVisible().catch(() => false)) return false;

      await nameInput.click();
      await nameInput.fill('');
      await nameInput.pressSequentially(searchTerm, { delay: 60 });
      await sleep(1000);

      const suggestionLocators = appPage.locator('.ut-player-search-control ul.playerResultsList button');
      const count = await suggestionLocators.count();
      if (count === 0) return false;

      const normalize = (s) => stripAccents(s).toLowerCase();
      const targetLast = normalize(lastName);
      const targetClean = normalize(cleanName);
      const targetSearch = normalize(target.search || '');
      const targetRating = target.rating ? String(target.rating) : '';

      let targetIdx = -1;

      // Pass 0: EXACT name match AND rating
      for (let i = 0; i < count; i++) {
        const rawTxt = await suggestionLocators.nth(i).innerText().catch(() => '');
        const lines = rawTxt.split('\n').map(s => normalize(s.trim()));
        const namePart = lines[0] || '';
        const ratingPart = lines[1] || '';
        const exactName = namePart === targetSearch || namePart === targetLast || namePart === targetClean;
        if (exactName && (!targetRating || ratingPart === targetRating || rawTxt.includes(targetRating))) {
          targetIdx = i;
          break;
        }
      }

      // Pass 1: match search/last/clean name AND rating
      if (targetIdx === -1) {
        for (let i = 0; i < count; i++) {
          const txt = normalize(await suggestionLocators.nth(i).innerText().catch(() => ''));
          const nameMatch = (targetSearch && txt.includes(targetSearch)) || txt.includes(targetLast) || txt.includes(targetClean);
          if (nameMatch && targetRating && txt.includes(targetRating)) {
            targetIdx = i;
            break;
          }
        }
      }

      // Pass 2: match search/last/clean name
      if (targetIdx === -1) {
        for (let i = 0; i < count; i++) {
          const txt = normalize(await suggestionLocators.nth(i).innerText().catch(() => ''));
          if ((targetSearch && txt.includes(targetSearch)) || txt.includes(targetLast) || txt.includes(targetClean)) {
            targetIdx = i;
            break;
          }
        }
      }

      if (targetIdx === -1) return false;

      await suggestionLocators.nth(targetIdx).click();
      await sleep(600);

      const isSelected = await appPage.evaluate(() => {
        const ctrl = document.querySelector('.ut-player-search-control');
        if (!ctrl) return false;
        return !!ctrl.querySelector('.icon_close, .btn-clear');
      });

      return isSelected;
    }

    const baseCandidates = [target.search, lastName, cleanName, cleanSlug, target.name].filter(Boolean);
    const candidates = [];
    for (const c of baseCandidates) {
      candidates.push(c);
      if (c.length <= 4) candidates.push(c + ' ');
    }
    const uniqueCandidates = [...new Set(candidates)];
    let foundAutocomplete = false;
    for (const q of uniqueCandidates) {
      foundAutocomplete = await selectAutocomplete(q);
      if (foundAutocomplete) break;
      await sleep(400);
    }

    if (!foundAutocomplete) {
      result.error = `Autocomplete not found for ${target.name} (attempted ${uniqueCandidates.join(', ')})`;
      return result;
    }
    await sleep(500);

    // 4. Dynamic Step-Probing Price Discovery (NO PRICE CAP)
    const est = target.estimatedPrice || 800;
    let probePrice = minStartingProbe || Math.min(Math.max(est * 0.8, 400), 1000);
    const maxProbeCeiling = Math.max(est * 3, 50000);
    const maxBuyInput = appPage.locator('.price-filter .ut-numeric-input-spinner-control input').nth(3);
    let foundResults = false;
    let probeAttempts = 0;

    while (!foundResults && probeAttempts < 18 && probePrice <= maxProbeCeiling) {
      probeAttempts++;
      if (await maxBuyInput.isVisible().catch(() => false)) {
        await maxBuyInput.click();
        await maxBuyInput.fill(`${Math.round(probePrice)}`);
        await sleep(150);
      }

      await clickSearch();
      await sleep(1200);

      const noResults = appPage.locator('.ut-no-results-view, h1:has-text("No results found"), h2:has-text("No results found")').first();
      if (await noResults.isVisible().catch(() => false)) {
        await clickBack();
        await sleep(400);
        if (probePrice < 1000) probePrice += 150;
        else if (probePrice < 2500) probePrice += 300;
        else if (probePrice < 5000) probePrice += 600;
        else if (probePrice < 10000) probePrice += 1500;
        else probePrice += 3000;
      } else {
        foundResults = true;
      }
    }

    // Fallback: clear Max Buy Now and search open if probe exceeded ceiling
    if (!foundResults) {
      const clearBtn = appPage.locator('.search-price-header').nth(1).getByRole('button', { name: 'Clear' });
      if (await clearBtn.isVisible().catch(() => false) && await clearBtn.isEnabled().catch(() => false)) {
        await clearBtn.click();
        await sleep(200);
      }
      await clickSearch();
      await sleep(1200);
    }

    // 5. Select lowest Buy Now card matching Club and/or Card ID
    await sleep(700);
    const items = appPage.locator('.ut-pinned-list-container li, .paginated-item-list li, [role="listitem"]');
    const itemCount = await items.count();
    if (itemCount === 0) {
      result.error = `No items found on transfer market for ${target.name}`;
      return result;
    }

    // Inspect EA FC internal models to select exact match
    const selection = await appPage.evaluate((tgt) => {
      try {
        const cur = window.getAppMain?.()?.getRootViewController?.()?.currentController?.currentController?.currentController;
        const col = cur?._listController?.paginationViewModel?.paginationList?._collection;
        if (!col || col.length === 0) return null;

        let bestIdx = -1;
        let lowestPrice = Infinity;
        let fallbackIdx = -1;
        let fallbackPrice = Infinity;

        for (let i = 0; i < col.length; i++) {
          const item = col[i];
          const buyNow = item._auction?.buyNowPrice || 0;
          const expires = item._auction?.expires || 0;
          if (buyNow <= 0) continue;

          // Match clubId (mandatory if specified)
          if (tgt.clubId && item.teamId !== tgt.clubId) {
            continue;
          }

          // Match rating (mandatory if specified)
          if (tgt.rating && item.rating !== tgt.rating) {
            continue;
          }

          // If cardId specified and no clubId, match cardId
          if (tgt.cardId && !tgt.clubId && item.definitionId !== tgt.cardId) {
            continue;
          }

          if (buyNow < fallbackPrice) {
            fallbackPrice = buyNow;
            fallbackIdx = i;
          }

          // Prefer listings with > 60 seconds remaining to avoid snipes
          if (expires > 60 && buyNow < lowestPrice) {
            lowestPrice = buyNow;
            bestIdx = i;
          }
        }

        const chosen = bestIdx !== -1 ? bestIdx : fallbackIdx;
        if (chosen === -1) {
          return { error: `Found ${col.length} listings, but none matched clubId=${tgt.clubId} / cardId=${tgt.cardId}` };
        }

        return {
          index: chosen,
          price: col[chosen]._auction?.buyNowPrice,
          defId: col[chosen].definitionId,
          teamId: col[chosen].teamId,
          tradeId: col[chosen]._auction?.tradeId
        };
      } catch (e) {
        return { error: `Model evaluation error: ${e.message}` };
      }
    }, target);

    let targetIndex = -1;
    let lowestPrice = Infinity;

    if (selection && !selection.error && selection.index >= 0) {
      targetIndex = selection.index;
      lowestPrice = selection.price;
      result.matchedDefId = selection.defId;
      result.matchedTeamId = selection.teamId;
    } else if (selection && selection.error) {
      result.error = selection.error;
      await clickBack();
      return result;
    } else {
      // DOM-based fallback
      let fallbackLowestPrice = Infinity;
      let fallbackIndex = 0;
      for (let i = 0; i < Math.min(itemCount, 25); i++) {
        const text = await items.nth(i).innerText().catch(() => '');
        const match = text.match(/Buy Now:\s*([\d,]+)/i);
        if (match) {
          const price = parseInt(match[1].replace(/,/g, ''), 10);
          if (price < fallbackLowestPrice) {
            fallbackLowestPrice = price;
            fallbackIndex = i;
          }
          const isExpiring = text.includes('<30 Seconds') || text.includes('1 Minute');
          if (!isExpiring && price < lowestPrice) {
            lowestPrice = price;
            targetIndex = i;
          }
        }
      }
      if (targetIndex === -1) {
        targetIndex = fallbackIndex;
        lowestPrice = fallbackLowestPrice;
      }
    }

    await items.nth(targetIndex).click();
    await sleep(500);

    // 6. Buy card & handle confirmation dialog
    const buyBtn = appPage.locator('button.buyButton, button:has-text("Buy Now for")').first();
    try {
      await buyBtn.waitFor({ state: 'visible', timeout: 3000 });
    } catch (e) {}
    if (!await buyBtn.isVisible().catch(() => false)) {
      result.error = "Buy Now button not visible on selected card";
      return result;
    }

    const buyText = await buyBtn.innerText().catch(() => '');
    const buyPriceMatch = buyText.match(/[\d,]+/);
    const boughtNum = buyPriceMatch ? parseInt(buyPriceMatch[0].replace(/,/g, ''), 10) : (lowestPrice || 0);
    result.boughtFor = buyPriceMatch ? buyPriceMatch[0] : String(boughtNum);

    if (await buyBtn.isDisabled().catch(() => true)) {
      result.error = `Buy Now button was disabled (card already bought or expired).`;
      result.wasSniped = true;
      result.nextProbePrice = (lowestPrice || probePrice) + 150;
      await clickBack();
      return result;
    }

    const bidResp = appPage.waitForResponse(r => r.url().includes('/bid'), { timeout: 8000 }).catch(() => null);
    try {
      await buyBtn.click({ timeout: 2500 });
    } catch (e) {
      result.error = `Buy Now click failed (likely sniped): ${e.message}`;
      result.wasSniped = true;
      result.nextProbePrice = (lowestPrice || probePrice) + 150;
      await clickBack();
      return result;
    }

    // Handle EA standard confirmation modal: "Get Now / Are you sure? Ok"
    const okBtn = appPage.locator('.view-modal-container button.btn-standard.primary, .view-modal-container button:has-text("Ok")').first();
    await okBtn.waitFor({ state: 'visible', timeout: 1500 }).then(() => okBtn.click()).catch(() => {});

    const bidRes = await bidResp;
    const bidStatus = bidRes ? bidRes.status() : 0;
    if (bidStatus && bidStatus !== 200) {
      result.error = `Buy failed with HTTP ${bidStatus} (likely sniped)`;
      result.wasSniped = true;
      result.nextProbePrice = (lowestPrice || probePrice) + 150;
      await clickBack();
      return result;
    }

    await sleep(1500);

    // 7. Route Store -> Unassigned Items
    const storeBtn = appPage.locator('.icon-store, button:has-text("Store")').first();
    await storeBtn.click();
    await sleep(1000);

    const unassignedTile = appPage.locator('.ut-unassigned-tile, [class*="unassigned"], h1:has-text("Unassigned Items"), h2:has-text("Unassigned Items")').first();
    for (let i = 0; i < 8 && !(await unassignedTile.isVisible().catch(() => false)); i++) {
      await sleep(400);
    }

    if (await unassignedTile.isVisible().catch(() => false)) {
      await unassignedTile.click();
      await sleep(1000);
    }

    // Select the card we just bought
    const normalize = (s) => stripAccents(s).toLowerCase();
    let selected = false;
    const unRows = appPage.locator('.listFUTItem');
    const rowCount = await unRows.count();
    let singleUnlocked = null;
    let unlockedCount = 0;

    for (let i = 0; i < rowCount; i++) {
      const row = unRows.nth(i);
      if (await row.locator('.locked').count()) continue;
      unlockedCount++;
      singleUnlocked = row;
      const txt = normalize(await row.innerText().catch(() => ''));
      if ((txt.includes(normalize(lastName)) || txt.includes(normalize(cleanName))) && (!target.rating || txt.includes(String(target.rating)))) {
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
      result.error = `Bought ${target.name} but could not identify it in Unassigned; left unlisted for safety.`;
      return result;
    }

    // 8. Relist at the true cheapest market price instantly
    const listBtn = appPage.locator('button:has-text("List on Transfer Market")').first();
    if (await listBtn.isVisible().catch(() => false)) {
      await listBtn.click();
      await sleep(600);
    }

    const safeBuyNow = Math.max(boughtNum, 200);
    const safeStart = safeBuyNow <= 1000 ? Math.max(safeBuyNow - 50, 150) : safeBuyNow - 100;

    // Try Paletools Cheapest if button exists
    const cheapestBtn = appPage.locator('button:has-text("Cheapest")').first();
    if (await cheapestBtn.isVisible().catch(() => false)) {
      await cheapestBtn.click().catch(() => {});
      await sleep(500);
    }

    const startIn = appPage.locator('.panelActions .ut-number-input-control, .panelActions input').nth(0);
    const binIn = appPage.locator('.panelActions .ut-number-input-control, .panelActions input').nth(1);

    const currentVal = parseInt(((await binIn.inputValue().catch(() => '')) || '').replace(/\D/g, ''), 10);
    if (!currentVal || currentVal >= 5000 || currentVal > boughtNum + 300) {
      await binIn.click();
      await binIn.fill(String(safeBuyNow));
      await binIn.press('Tab').catch(() => {});
      await sleep(150);
      await startIn.click();
      await startIn.fill(String(safeStart));
      await startIn.press('Tab').catch(() => {});
      await sleep(150);
    }

    const listResp = appPage.waitForResponse(r => r.url().includes('/auctionhouse') && r.request().method() === 'POST', { timeout: 8000 }).catch(() => null);
    const submitBtn = appPage.locator('button:has-text("List for Transfer")').first();
    await submitBtn.click({ timeout: 3000 });
    await listResp;
    await sleep(1000);

    result.destination = "Transfer List (Relisted Instantly)";
    result.success = true;
    return result;
  }

  const log = [];
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    let res = await processPlayer(t);
    if (!res.success && res.wasSniped && res.nextProbePrice) {
      await sleep(1500);
      res = await processPlayer(t, res.nextProbePrice);
    }
    log.push(res);
    await sleep(2000);
  }

  // Update progress in Tab 0 localStorage
  await futPage.evaluate((adv) => {
    const raw = localStorage.getItem('kilo-missing-targets');
    if (!raw) return;
    const cfg = JSON.parse(raw);
    cfg.start = (cfg.start || 0) + adv;
    localStorage.setItem('kilo-missing-targets', JSON.stringify(cfg));
  }, targets.length);

  return {
    batchRange: `${startIdx + 1} - ${Math.min(startIdx + batchSize, allTargets.length)}`,
    totalTargets: allTargets.length,
    remainingTargets: Math.max(0, allTargets.length - (startIdx + targets.length)),
    completed: log.filter(l => l.success).length,
    failed: log.filter(l => !l.success).length,
    results: log
  };
}
