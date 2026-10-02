/**
 * Complete End-to-End Set Automation Runner
 * 1. Identifies next incomplete set on Tab 0 (FUT.GG)
 * 2. Scrapes the 15 players in transient Tab 2
 * 3. Purchases and relists each player on Tab 1 with safety delays
 * 4. Toggles the set checkbox on Tab 0
 * 5. Returns execution summary
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
    .replace(/ț|ţ/gi, 't')
    .replace(/ș|ş/gi, 's')
    .replace(/đ|ð/gi, 'd')
    .replace(/ł/gi, 'l')
    .replace(/ø/gi, 'o')
    .replace(/æ/gi, 'ae');

  const batchConfig = await futPage.evaluate(() => {
    const raw = localStorage.getItem('kilo-batch-config');
    return raw ? JSON.parse(raw) : { start: 0, size: 2 };
  });

  // Step 1: Find next incomplete set on Tab 0 (or specific target if configured)
  let nextSet = null;

  if (batchConfig.targetUrl) {
    nextSet = {
      name: batchConfig.targetName || "Target Set",
      url: batchConfig.targetUrl
    };
  } else {
    await futPage.bringToFront();

    // Expand sets if "Show more sets" is present in the DOM
    await futPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button')).filter(b => b.innerText.includes('Show more sets'));
      btns.forEach(b => b.click());
    });
    await sleep(800);

    nextSet = await futPage.evaluate((target) => {
      const cards = Array.from(document.querySelectorAll('[role="checkbox"]')).map(cb => {
        const card = cb.closest('div[class*="rounded"], div[class*="card"], li, article') || cb.parentElement?.parentElement;
        const link = card ? card.querySelector('a[href*="/fut-gallery/"]') : null;
        return {
          name: cb.getAttribute('aria-label'),
          checked: cb.getAttribute('aria-checked') === 'true',
          url: link ? link.href : null
        };
      });
      if (target) {
        const cleanTarget = target.toLowerCase().replace(/[^a-z0-9]/g, '');
        const matched = cards.find(c => {
          const cleanName = (c.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
          const cleanUrl = (c.url || '').toLowerCase().replace(/[^a-z0-9]/g, '');
          return cleanName.includes(cleanTarget) || cleanUrl.includes(cleanTarget);
        });
        if (matched) return matched;
      }
      // Prioritize 15-player club sets over 30-player league sets
      return cards.filter(c => !c.checked && c.url && !c.url.includes('/leagues/'))[0] || cards.filter(c => !c.checked && c.url)[0];
    }, batchConfig.targetName || batchConfig.targetSet);
  }

  if (!nextSet || !nextSet.url) {
    return { error: "No incomplete set found on Tab 0" };
  }

  // Step 2: Open set in transient tab and scrape 15 players (or use cached from batchConfig)
  let players = batchConfig.players || [];
  if (players.length === 0) {
    const tempTab = await context.newPage();
    try {
      await tempTab.goto(nextSet.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await tempTab.waitForTimeout(1500);

      players = await tempTab.evaluate(() => {
        let listItems = Array.from(document.querySelectorAll('li[data-gallery-lineup-player]'));
        if (listItems.length === 0) {
          listItems = Array.from(document.querySelectorAll('ul li, ol li')).filter(li => li.querySelector('a[href*="/players/"]'));
        }
        const result = [];
        for (const li of listItems) {
          const a = li.querySelector('a[href*="/players/"]');
          if (!a) continue;
          const img = a.querySelector('img[alt]');
          const nameMatch = a.href.match(/\/players\/\d+-([^\/]+)\//);
          const slug = nameMatch ? nameMatch[1].replace(/-/g, ' ') : '';
          const rawText = a.innerText.replace(/\s+/g, ' ').trim() || li.innerText.replace(/\s+/g, ' ').trim();
          
          const priceMatch = rawText.match(/(\d+(?:\.\d+)?)\s*K/i) || rawText.match(/\b(\d{3,5})\b/);
          let price = 750;
          if (priceMatch) {
            if (priceMatch[0].toUpperCase().includes('K')) {
              price = Math.round(parseFloat(priceMatch[1]) * 1000);
            } else {
              price = parseInt(priceMatch[1], 10);
            }
          }
          
          const altText = img ? img.alt : '';
          const ratingMatch = altText.match(/-\s*(\d{2})\s*-/);
          const rating = ratingMatch ? parseInt(ratingMatch[1], 10) : null;
          const name = altText ? altText.split('-')[0].trim() : slug;

          if (name && !result.some(p => p.slug === slug)) {
            result.push({
              name,
              slug,
              rating,
              estimatedPrice: price
            });
          }
        }
        return result.slice(0, 15);
      });
    } finally {
      await tempTab.close().catch(() => {});
    }
  }

  if (players.length === 0) {
    return { error: `Failed to extract lineup from ${nextSet.url}` };
  }

  // Step 3: Execute trade for each player on appPage
  await appPage.bringToFront();

  async function processPlayer(target, minStartingProbe = null) {
    const rawName = target.name || '';
    const cleanName = stripAccents(rawName);
    const cleanSlug = stripAccents(target.slug || '');
    const lastName = cleanName.split(' ').pop();
    const result = { player: target.name, rating: target.rating, success: false };

    // 1. Transfers -> Search Transfer Market
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

    // 3. Search player name with autocomplete
    async function selectAutocomplete(searchTerm) {
      const nameInput = appPage.locator('.ut-player-search-control input');
      if (!await nameInput.isVisible()) {
        const clearBtn = appPage.locator('.ut-player-search-control button.icon_close, .ut-player-search-control .btn-clear');
        if (await clearBtn.isVisible()) {
          await clearBtn.click();
          await sleep(400);
        }
      }
      if (!await nameInput.isVisible()) return false;

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
      const targetRating = target.rating ? String(target.rating) : '';

      let targetIdx = -1;

      // Pass 1: match last name AND rating
      for (let i = 0; i < count; i++) {
        const txt = normalize(await suggestionLocators.nth(i).innerText());
        if ((txt.includes(targetLast) || txt.includes(targetClean)) && targetRating && txt.includes(targetRating)) {
          targetIdx = i;
          break;
        }
      }

      // Pass 2: match last name or clean name
      if (targetIdx === -1) {
        for (let i = 0; i < count; i++) {
          const txt = normalize(await suggestionLocators.nth(i).innerText());
          if (txt.includes(targetLast) || txt.includes(targetClean)) {
            targetIdx = i;
            break;
          }
        }
      }

      if (targetIdx === -1) return false;

      await suggestionLocators.nth(targetIdx).click();
      await sleep(600);

      const isSelected = await appPage.evaluate((tName) => {
        const ctrl = document.querySelector('.ut-player-search-control');
        if (!ctrl) return false;
        const norm = (s) => (s || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ø/gi, 'o').replace(/æ/gi, 'ae').replace(/ł/gi, 'l').toLowerCase();
        const input = ctrl.querySelector('input');
        const val = input ? norm(input.value) : '';
        const txt = norm(ctrl.innerText);
        const hasClear = !!ctrl.querySelector('.icon_close, .btn-clear');
        return hasClear && (val.includes(norm(tName)) || txt.includes(norm(tName)));
      }, targetLast);

      return isSelected;
    }

    const candidates = [lastName, cleanName, cleanSlug, target.name].filter(Boolean);
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

    // Assert player is actually selected in search form before price probing
    const isPlayerConfirmed = await appPage.evaluate((tLast) => {
      const ctrl = document.querySelector('.ut-player-search-control');
      if (!ctrl) return false;
      const norm = (s) => (s || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ø/gi, 'o').replace(/æ/gi, 'ae').replace(/ł/gi, 'l').toLowerCase();
      const input = ctrl.querySelector('input');
      const val = input ? norm(input.value) : '';
      const txt = norm(ctrl.innerText);
      const hasClear = !!ctrl.querySelector('.icon_close, .btn-clear');
      return hasClear && (val.includes(norm(tLast)) || txt.includes(norm(tLast)));
    }, lastName);
    if (!isPlayerConfirmed) {
      result.error = `Safety check failed: Player filter for ${target.name} is not set in search form! Aborting search.`;
      return result;
    }

    // 4. Dynamic Step-Probing Price Discovery
    const roundToLadder = (p) => {
      if (p <= 1000) return Math.max(Math.round(p / 50) * 50, 200);
      if (p <= 10000) return Math.round(p / 100) * 100;
      if (p <= 50000) return Math.round(p / 250) * 250;
      return Math.round(p / 500) * 500;
    };

    const est = target.estimatedPrice || 800;
    const hardMaxCap = roundToLadder(est > 2000 ? Math.round(est * 1.3) : Math.min(Math.max(est * 1.8, 600), 2800));
    let probePrice = roundToLadder(minStartingProbe ? Math.min(minStartingProbe, hardMaxCap) : Math.round(est * 0.85));

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

      const matchStatus = await appPage.evaluate(({ targetRating, isSpecial }) => {
        const noRes = !!document.querySelector('.ut-no-results-view, .ut-transfer-market-search-results-view h2');
        if (noRes) return { noResults: true, hasMatching: false };

        const ctrl = window.getAppMain().getRootViewController().currentController.currentController.currentController;
        const coll = ctrl?._listController?.paginationViewModel?.paginationList?._collection || [];
        if (coll.length === 0) return { noResults: true, hasMatching: false };

        const hasMatch = coll.some(it => (!targetRating || it.rating === targetRating) && (!isSpecial || (typeof it.isSpecial === 'function' ? it.isSpecial() : it.rareflag > 0)));
        return { noResults: false, hasMatching: hasMatch, count: coll.length };
      }, { targetRating: target.rating, isSpecial: !!target.isSpecial });

      if (matchStatus.noResults || !matchStatus.hasMatching) {
        await appPage.getByRole('button', { name: ' [ Digit1 ]' }).click();
        await sleep(500);
        probePrice = roundToLadder(probePrice + (probePrice < 1000 ? 150 : (probePrice < 10000 ? 250 : 500)));
      } else {
        foundResults = true;
      }
    }

    if (!foundResults) {
      result.error = `No listings matching rating ${target.rating} found for ${target.name} under ${hardMaxCap} cap (probed up to ${Math.round(probePrice)})`;
      return result;
    }

    // 5. Select the listing that strictly matches target rating and special status via internal data model
    const selection = await appPage.evaluate(({ targetRating, isSpecial, hardMaxCap }) => {
      const ctrl = window.getAppMain().getRootViewController().currentController.currentController.currentController;
      const coll = ctrl?._listController?.paginationViewModel?.paginationList?._collection || [];
      
      let bestIdx = -1;
      let bestPrice = Infinity;
      let fallbackIdx = -1;
      let fallbackPrice = Infinity;

      for (let i = 0; i < coll.length; i++) {
        const it = coll[i];
        if (!it || !it._auction) continue;

        // Strict rating check
        if (targetRating && it.rating !== targetRating) continue;
        // Strict special check
        const isSpec = typeof it.isSpecial === 'function' ? it.isSpecial() : it.rareflag > 0;
        if (isSpecial && !isSpec) continue;

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
    }, { targetRating: target.rating, isSpecial: !!target.isSpecial, hardMaxCap });

    if (!selection.found) {
      result.error = `No listing strictly matching rating ${target.rating} found for ${target.name} under ${hardMaxCap}`;
      await appPage.getByRole('button', { name: ' [ Digit1 ]' }).click().catch(() => {});
      return result;
    }

    const lowestPrice = selection.price;
    const items = appPage.getByRole('listitem');
    await items.nth(selection.index).click();
    await sleep(500);

    // 6. Buy card
    const buyBtn = appPage.getByRole('button', { name: /Buy Now for/i });
    try {
      await buyBtn.waitFor({ state: 'visible', timeout: 3000 });
    } catch (e) {}
    if (!await buyBtn.isVisible()) {
      result.error = "Buy Now button not visible on selected card";
      return result;
    }

    const buyText = await buyBtn.innerText();
    const buyPriceMatch = buyText.match(/[\d,]+/);
    const boughtNum = buyPriceMatch ? parseInt(buyPriceMatch[0].replace(/,/g, ''), 10) : 0;

    if (boughtNum > hardMaxCap) {
      result.error = `Buy Now button price (${boughtNum}) exceeds safety cap ${hardMaxCap}!`;
      await appPage.getByRole('button', { name: ' [ Digit1 ]' }).click().catch(() => {});
      return result;
    }

    result.boughtFor = buyPriceMatch ? buyPriceMatch[0] : "unknown";

    if (await buyBtn.isDisabled()) {
      result.error = `Buy Now button was disabled (card already bought or expired).`;
      result.wasSniped = true;
      result.nextProbePrice = Math.min((lowestPrice || probePrice) + 150, hardMaxCap);
      await appPage.getByRole('button', { name: ' [ Digit1 ]' }).click().catch(() => {});
      return result;
    }

    try {
      await buyBtn.click({ timeout: 2500 });
    } catch (e) {
      result.error = `Buy Now click failed (likely sniped): ${e.message}`;
      result.wasSniped = true;
      result.nextProbePrice = roundToLadder(Math.min((lowestPrice || probePrice) + (probePrice < 1000 ? 150 : (probePrice < 10000 ? 250 : 500)), hardMaxCap));
      await appPage.getByRole('button', { name: ' [ Digit1 ]' }).click().catch(() => {});
      return result;
    }
    await sleep(1200);

    // Check for "Bid status changed" or snipe toast notification
    const toastText = await appPage.evaluate(() => {
      const toast = document.querySelector('.ut-toast, .ea-notification, .notification');
      return toast ? toast.innerText : '';
    });
    const isSnipedToast = /bid status/i.test(toastText) || /no longer available/i.test(toastText) || /expired/i.test(toastText);

    if (isSnipedToast) {
      result.error = `Card was already sold / sniped ("${toastText.replace(/\s+/g, ' ')}"). Retrying with increased price probe.`;
      result.wasSniped = true;
      result.nextProbePrice = roundToLadder(Math.min((lowestPrice || probePrice) + (probePrice < 1000 ? 150 : (probePrice < 10000 ? 250 : 500)), hardMaxCap));
      return result;
    }

    // 7. Store -> Unassigned Items
    await appPage.getByRole('button', { name: ' Store' }).click();
    await sleep(1200);

    const unassignedTile = appPage.getByRole('heading', { name: 'Unassigned Items' });
    if (!await unassignedTile.isVisible()) {
      // Small retry for UI transition
      await sleep(1000);
      if (!await unassignedTile.isVisible()) {
        result.error = `Failed to acquire ${target.name} (likely sniped right before purchase click). Retrying with increased price probe.`;
        result.wasSniped = true;
        result.nextProbePrice = roundToLadder(Math.min((lowestPrice || probePrice) + (probePrice < 1000 ? 150 : (probePrice < 10000 ? 250 : 500)), hardMaxCap));
        return result;
      }
    }

    await unassignedTile.click();
    await sleep(1000);

    // 7b. Select the card we just bought (the view preselects the FIRST unassigned item, which may be a pack card).
    // Match last name + rating and never touch a Paletools-locked card.
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
      const txt = normalize(await row.innerText());
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
      result.error = `Bought ${target.name} but could not identify it in Unassigned; left unlisted for manual check.`;
      return result;
    }

    // 8. Relist at the true cheapest market price
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

    // Wait up to 1.5 seconds to see if Paletools populates a valid price
    let paletoolsPopulatedValid = false;
    const pollStart = Date.now();
    while (Date.now() - pollStart < 1500) {
      const val = await buyNowInput.inputValue().catch(() => '');
      const cleanVal = parseInt((val || '').replace(/,/g, ''), 10);
      // Valid Paletools price must NOT be EA default banding and must be near our bought price
      const maxAllowed = boughtNum > 2000 ? Math.max(boughtNum * 1.15, boughtNum + 500) : Math.max(boughtNum + 200, 1000);
      const bandingCap = boughtNum > 2000 ? boughtNum * 1.4 : 5000;
      if (cleanVal && cleanVal > 0 && cleanVal <= maxAllowed && cleanVal < bandingCap) {
        paletoolsPopulatedValid = true;
        break;
      }
      await sleep(200);
    }

    // If Paletools didn't populate a cheap, valid price, ALWAYS enforce the true market floor:
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
    return result;
  }

  const targetPlayers = players.slice(batchConfig.start, batchConfig.start + batchConfig.size);

  const log = [];
  for (let i = 0; i < targetPlayers.length; i++) {
    const p = targetPlayers[i];
    let res = await processPlayer(p);
    // Auto-retry with increased probe price if sniped or bid status changed
    if (!res.success && res.wasSniped && res.nextProbePrice) {
      await sleep(1500);
      res = await processPlayer(p, res.nextProbePrice);
    }
    log.push(res);
    await sleep(2500); // 2.5s safe human-like delay between players
  }

  const isFinalBatch = (batchConfig.start + batchConfig.size) >= players.length;

  // Step 4: If all players in the set have been processed, toggle checkbox on Tab 0
  if (isFinalBatch) {
    await futPage.bringToFront();
    await sleep(600);
    const cb = futPage.getByRole('checkbox', { name: nextSet.name });
    if (await cb.isVisible()) {
      await cb.click();
      await sleep(600);
    }
  }

  return {
    set: nextSet.name,
    setUrl: nextSet.url,
    players,
    totalSetPlayers: players.length,
    batchRange: `${batchConfig.start + 1} - ${Math.min(batchConfig.start + batchConfig.size, players.length)}`,
    batchCompleted: log.filter(l => l.success).length,
    batchFailed: log.filter(l => !l.success).length,
    isFinalBatch,
    results: log
  };
}
