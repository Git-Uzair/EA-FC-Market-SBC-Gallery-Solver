/**
 * Relist Club Purchases Runner
 * Finds cards in My Club (sorted by Most Recent) that match the players bought
 * in recent batches, and lists them on the Transfer Market at market floor / Paletools cheapest.
 */
async (page) => {
  const context = page.context();
  const pages = context.pages();
  const appPage = pages.find(p => p.url().includes('ea.com')) || page;

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

  const targets = [
    // Osasuna
    { name: "Boyomo", floor: 650 },
    { name: "Moncayola", floor: 750 },
    { name: "Moi Gómez", floor: 900 },
    { name: "Lucas Torró", floor: 1300 },
    { name: "Catena", floor: 1100 },
    { name: "Aimar Oroz", floor: 650 },
    { name: "Sergio Herrera", floor: 650 },
    // Parma
    { name: "Balogh", floor: 350 },
    { name: "Benedyczak", floor: 400 },
    { name: "Charpentier", floor: 350 },
    { name: "Chichizola", floor: 650 },
    { name: "Circati", floor: 900 },
    { name: "Valeri", floor: 950 },
    { name: "Coulibaly", floor: 450 },
    { name: "Sohm", floor: 1300 },
    { name: "Bonny", floor: 750 },
    { name: "Mihăilă", floor: 700 },
    { name: "Hernani", floor: 450 },
    { name: "Dennis Man", floor: 1300 },
    { name: "Bernabé", floor: 1300 },
    // Rayo Vallecano
    { name: "Pathé Ciss", floor: 1300 },
    { name: "Ciss", floor: 1100 },
    { name: "Espino", floor: 650 },
    { name: "Chavarría", floor: 750 },
    { name: "Óscar Valentín", floor: 650 },
    { name: "Valentín", floor: 650 },
    { name: "Mumin", floor: 650 },
    { name: "Balliu", floor: 1100 },
    { name: "Unai López", floor: 1500 },
    { name: "De Frutos", floor: 650 },
    // Lille / Nantes / Lens / Nice
    { name: "Bouaddi", floor: 450 },
    { name: "Meunier", floor: 650 },
    { name: "André", floor: 750 },
    { name: "Grzybowska", floor: 400 },
    { name: "Robillard", floor: 450 },
    { name: "Antonio", floor: 400 },
    { name: "Issiaga Camara", floor: 400 },
    { name: "Camara", floor: 400 },
    { name: "Dennis Man", floor: 1300 },
    { name: "Bernabé", floor: 1300 },
    { name: "Sohm", floor: 1300 },
    { name: "Valeri", floor: 950 }
  ];

  await appPage.bringToFront();

  const normalize = (s) => stripAccents(s).toLowerCase();

  const relisted = [];
  const maxPerRun = 6;
  const maxPages = 2;

  for (let pageNum = 0; pageNum < maxPages; pageNum++) {
    if (relisted.length >= maxPerRun) break;
    await sleep(700);
    const rows = appPage.locator('.paginated-item-list li.listFUTItem');
    const rowCount = await rows.count();

    if (rowCount === 0) break;

    for (let i = 0; i < rowCount; i++) {
      if (relisted.length >= maxPerRun) break;
      const row = rows.nth(i);
      
      // Strict safety: skip locked cards
      const isLocked = await row.evaluate((el) => {
        return !!(el.querySelector('.locked') || (window.paletools && window.paletools.isLocked && window.paletools.isLocked(el)));
      });
      if (isLocked) continue;

      const cardText = await row.innerText();
      const normCard = normalize(cardText);

      // Check if this card matches any of our targets
      const matchedTarget = targets.find(t => {
        const tNorm = normalize(t.name);
        return normCard.includes(tNorm);
      });

      if (!matchedTarget) continue;

      // Click card
      await row.click();
      await sleep(600);

      // Check for List on Transfer Market button
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

      let paletoolsPopulatedValid = false;
      const pollStart = Date.now();
      while (Date.now() - pollStart < 1500) {
        const val = await buyNowInput.inputValue().catch(() => '');
        const cleanVal = parseInt((val || '').replace(/,/g, ''), 10);
        if (cleanVal && cleanVal > 0 && cleanVal < 5000 && cleanVal <= (matchedTarget.floor + 400)) {
          paletoolsPopulatedValid = true;
          break;
        }
        await sleep(200);
      }

      if (!paletoolsPopulatedValid) {
        const safeBuyNow = Math.max(matchedTarget.floor, 350);
        const safeStart = safeBuyNow <= 1000 ? Math.max(safeBuyNow - 50, 150) : safeBuyNow - 100;
        await startPriceInput.click();
        await startPriceInput.fill(`${safeStart}`);
        await sleep(150);
        await buyNowInput.click();
        await buyNowInput.fill(`${safeBuyNow}`);
        await sleep(150);
      } else {
        // Ensure start price is populated even if Paletools left it blank
        const startVal = await startPriceInput.inputValue().catch(() => '');
        if (!startVal || startVal === '') {
          const buyVal = parseInt((await buyNowInput.inputValue().catch(() => '450')).replace(/,/g, ''), 10);
          const safeStart = buyVal <= 1000 ? Math.max(buyVal - 50, 150) : buyVal - 100;
          await startPriceInput.click();
          await startPriceInput.fill(`${safeStart}`);
          await sleep(150);
        }
      }

      const listTransferBtn = appPage.getByRole('button', { name: 'List for Transfer' });
      if (await listTransferBtn.isVisible() && !await listTransferBtn.isDisabled()) {
        const finalBuy = await buyNowInput.inputValue();
        await listTransferBtn.click();
        await sleep(1200);
        relisted.push({ player: matchedTarget.name, buyNow: finalBuy });
      } else {
        await appPage.getByRole('button', { name: ' [ Digit1 ]' }).click().catch(() => {});
      }
    }

    // Next page
    const nextBtn = appPage.locator('button.next, button:has-text("Next")').first();
    if (await nextBtn.isVisible() && !await nextBtn.isDisabled()) {
      await nextBtn.click();
      await sleep(1200);
    } else {
      break;
    }
  }

  return {
    totalRelisted: relisted.length,
    relisted
  };
}
