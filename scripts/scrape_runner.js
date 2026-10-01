async (page) => {
  const context = page.context();
  const pages = context.pages();
  const futPage = pages[0];
  
  // Find next incomplete set from Tab 0
  const nextSet = await futPage.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('[role="checkbox"]')).map(cb => {
      const card = cb.closest('div[class*="rounded"], div[class*="card"], li, article') || cb.parentElement?.parentElement;
      const link = card ? card.querySelector('a[href*="/fut-gallery/"]') : null;
      return {
        name: cb.getAttribute('aria-label'),
        checked: cb.getAttribute('aria-checked') === 'true',
        url: link ? link.href : null
      };
    });
    return cards.filter(c => !c.checked && c.url)[0];
  });

  if (!nextSet || !nextSet.url) {
    return { error: "No incomplete set found on Tab 0" };
  }

  // Open set in Tab 2
  const newPage = await context.newPage();
  try {
    await newPage.goto(nextSet.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await newPage.waitForTimeout(1500);

    const players = await newPage.evaluate(() => {
      const listItems = Array.from(document.querySelectorAll('ul li, ol li')).filter(li => li.querySelector('a[href*="/players/"]'));
      const result = [];
      for (const li of listItems) {
        const a = li.querySelector('a[href*="/players/"]');
        if (!a) continue;
        const img = a.querySelector('img[alt]');
        const nameMatch = a.href.match(/\/players\/\d+-([^\/]+)\//);
        const slug = nameMatch ? nameMatch[1].replace(/-/g, ' ') : '';
        const rawText = li.innerText.replace(/\s+/g, ' ').trim();
        
        const priceMatch = rawText.match(/(\d+(?:\.\d+)?)\s*K/i) || rawText.match(/\b(\d{3,5})\b/);
        let price = 500;
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

    return {
      setName: nextSet.name,
      setUrl: nextSet.url,
      playerCount: players.length,
      players
    };
  } finally {
    await newPage.close().catch(() => {});
  }
}
