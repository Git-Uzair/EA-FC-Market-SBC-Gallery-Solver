/**
 * Scrapes a FUT.GG set subpage in a transient tab, returns 15 players, and closes the tab.
 */
module.exports = async function scrapeSet(context, setUrl) {
  const newPage = await context.newPage();
  try {
    await newPage.goto(setUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
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

    return players;
  } finally {
    await newPage.close().catch(() => {});
  }
};
