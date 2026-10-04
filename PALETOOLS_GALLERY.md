# Paletools In-App Gallery Protocol & Scoring Engine

This guide details the reverse-engineered **Paletools In-App Gallery Engine** in the EA FC 27 Web App.
It serves as the definitive reference for completing FUT Gallery sets, maximizing tokens, and optimizing card grading scores.

---

## 0. Overview & Fast-Lane Access

Paletools features a native in-game Gallery interface integrated directly into the EA FC Web App (Tab 1).
It eliminates external website scrapers, provides real-time club collection status, calculates exact grading scores, and provides one-click market searching for missing cards.

### How to Access:
1. Open the EA FC Web App (Tab 1) with Paletools active.
2. Open Paletools Settings (sidebar `Paletools` button).
3. Click `button "Open Gallery"`.
4. In-App Gallery controller:
   `getAppMain().getRootViewController().currentController.currentController.currentController`
   - Subviews: `view.category` (7 categories), `view.set` (127 sets across all leagues and rarities).
   - Real-time grading summary panel on the right (`.gallery-panel`).

---

## 1. Reverse-Engineered Gallery Grading Mathematics

The Gallery grading score is computed from two components:
$$\text{Total Score} = \text{Base Item Scores} + \text{Tag Bonuses}$$
$$\text{Effective Multiplier} = \frac{\text{Total Score}}{\text{Base Item Scores}}$$

### 1.1 OVR Base Points Reference Table
Each card in the active 15-player lineup grants base points strictly determined by its rating:

| OVR Rating | Base Points | Notes / Impact |
|---|---|---|
| **99** | **100,000** | Ultra-high end |
| **98** | **90,000** | |
| **97** | **85,000** | |
| **96** | **55,000** | |
| **95** | **40,000** | |
| **94** | **30,000** | |
| **93** | **25,000** | |
| **92** | **20,000** | |
| **91** | **19,000** | |
| **90** | **14,000** | |
| **89** | **11,000** | |
| **88** | **8,300** | |
| **87** | **5,500** | High-rated club fodder |
| **86** | **4,100** | |
| **85** | **2,100** | |
| **84** | **830** | Huge jump over 83 |
| **83** | **410** | |
| **82** | **340** | |
| **81** | **280** | |
| **80** | **180** | |
| **79** | **160** | |
| **78** | **140** | |
| **77** | **120** | |
| **76** | **100** | Standard common gold threshold |
| **75** | **90** | Lowest gold rating |
| **65–74 (Silvers)** | **35 flat** | All silvers grant identical 35 pts |
| **45–64 (Bronzes)** | **20 flat** | All bronzes grant identical 20 pts |

### 1.2 Tag Bonuses & Multiplier Stacking
Each tag applies its highest qualifying tier to the scores of matching cards. Multipliers stack multiplicatively across different tag categories:

#### A. Card Tier Tags (Massive Silver/Bronze Multipliers vs Negligible Gold)
- **Silver Tier**:
  - 5 cards $\rightarrow$ **+15%**
  - 10 cards $\rightarrow$ **+30%** (having 10+ silvers adds a massive +30% across all matching cards!)
  - 20 cards $\rightarrow$ **+60%**
- **Bronze Tier**:
  - 5 cards $\rightarrow$ **+20%**
  - 10 cards $\rightarrow$ **+40%**
  - 20 cards $\rightarrow$ **+80%**
- **Golden Tier**:
  - 5 cards $\rightarrow$ +1%, 10 cards $\rightarrow$ +2%, 20 cards $\rightarrow$ +4% *(Gold cards contribute through high base OVR, not tag multipliers!)*

#### B. First Owner Tag (Highest Multiplier in the Game)
- 5 cards $\rightarrow$ **+150%**
- 10 cards $\rightarrow$ **+300%**
- 20 cards $\rightarrow$ **+500%** (Cards packed/untradeable from your club multiply base points by up to 6x!)

#### C. Positional Synergy Tags
- **Defensive Wall** (5+ defenders: CB, LB, RB): 5 cards $\rightarrow$ +3%, 10 cards $\rightarrow$ +6%, 15 cards $\rightarrow$ +10%
- **Midfield Control** (5+ midfielders: CDM, CM, CAM, LM, RM): 5 cards $\rightarrow$ +3%, 10 cards $\rightarrow$ +6%, 15 cards $\rightarrow$ +10%
- **All out Attack** (5+ attackers: ST, RW, LW): 5 cards $\rightarrow$ +3%, 10 cards $\rightarrow$ +6%, 15 cards $\rightarrow$ +10%
- **Hands Only** (3+ Goalkeepers): 3 cards $\rightarrow$ +3%, 6 cards $\rightarrow$ +6%, 10 cards $\rightarrow$ +15%

#### D. Chemistry / Club / Nation / League Synergies
- **Same Nation**: 5 cards $\rightarrow$ +1%, 10 cards $\rightarrow$ +2%, 20 cards $\rightarrow$ +4%
- **Same Club**: 5 cards $\rightarrow$ +1%, 10 cards $\rightarrow$ +2%, 20 cards $\rightarrow$ +4%
- **Same League**: 5 cards $\rightarrow$ +1%, 10 cards $\rightarrow$ +2%, 20 cards $\rightarrow$ +8%
- **Different Nation / Club / League**: 5 cards $\rightarrow$ +1%, 10 cards $\rightarrow$ +2%, 20 cards $\rightarrow$ +4%

#### E. Special Cards, Multiples & Skill Tags
- **Multiples!** (multiple distinct versions of same player persona): 2 cards $\rightarrow$ +10%, 3 cards $\rightarrow$ +15%, 4 cards $\rightarrow$ +20%
- **Holographic**: 2 cards $\rightarrow$ +8%, 4 cards $\rightarrow$ +12%, 6 cards $\rightarrow$ +20%
- **Iconic**: 2 cards $\rightarrow$ +10%, 4 cards $\rightarrow$ +15%, 6 cards $\rightarrow$ +25%
- **Heroic**: 2 cards $\rightarrow$ +8%, 4 cards $\rightarrow$ +12%, 6 cards $\rightarrow$ +20%
- **TOTW**: 3 cards $\rightarrow$ +4%, 6 cards $\rightarrow$ +8%, 10 cards $\rightarrow$ +15%
- **Ambidextrous** (5-star Weak Foot): 3 cards $\rightarrow$ +3%, 5 cards $\rightarrow$ +6%, 10 cards $\rightarrow$ +12%
- **Skilled** (5-star Skill Moves): 3 cards $\rightarrow$ +3%, 5 cards $\rightarrow$ +6%, 10 cards $\rightarrow$ +12%

---

## 2. High-ROI Token Optimization & Upgrade Strategies

Rather than buying 15 brand-new players for a 0-card club set, prioritize sets by **Coin / Token ROI** using live account data:

### Strategy 1: The "Grade S Sniping Jump" (Low Points Needed for +15 to +20 Tokens)
Several sets have 15/15 cards tracked and sit at Grade A, needing only **20 to 300 points** to reach Grade S (+15 tokens).
Swapping just ONE 20-point bronze card for a 75+ rated gold card (e.g. 100 base pts) increases the score by +80 to +120 points, instantly triggering Grade S!

**High-Priority Grade S Targets (Scanned & Verified):**
1. **Malaga CF** (Grade A, 878 pts):
   - Needs only **22 points** to reach **Grade S (900 pts) $\rightarrow$ +15 TOKENS**!
   - Action: Buy Pablo Martínez (76 CM, 100 pts) or Calero (75 CB, 90 pts). Replaces a 20-pt bronze $\rightarrow$ instant Grade S!
2. **Lecce** (Grade A, 1,542 pts): Needs **158 points** for Grade S $\rightarrow$ **+15 tokens**.
3. **Montpellier Hérault SC** (Grade A, 767 pts): Needs **233 points** for Grade S $\rightarrow$ **+15 tokens**.
4. **Charlton** (Grade A, 718 pts): Needs **282 points** for Grade S $\rightarrow$ **+15 tokens**.
5. **Le Mans FC** (Grade A, 702 pts): Needs **298 points** for Grade S $\rightarrow$ **+15 tokens**.
6. **Logroño United** (Grade A, 700 pts): Needs **300 points** for Grade S $\rightarrow$ **+15 tokens**.
7. **Hull City** (Grade A, 1,139 pts): Needs **361 points** for Grade S $\rightarrow$ **+20 tokens**.
8. **Real Racing Club** (Grade A, 1,081 pts): Needs **419 points** for Grade S $\rightarrow$ **+15 tokens**.
9. **Deportivo Alavés** (Grade A, 1,117 pts): Needs **483 points** for Grade S $\rightarrow$ **+15 tokens**.
10. **Toulouse FC** (Grade A, 1,107 pts): Needs **493 points** for Grade S $\rightarrow$ **+15 tokens**.

### Strategy 2: The "Grade A Threshold Push" (Needs <300 Points for +8 to +10 Tokens)
1. **Levante UD** (Grade B, 1,023 pts): Needs **177 points** for Grade A $\rightarrow$ **+8 tokens**.
2. **Parma** (Grade B, 890 pts): Needs **210 points** for Grade A $\rightarrow$ **+8 tokens**.
3. **Monza** (Grade B, 812 pts): Needs **288 points** for Grade A $\rightarrow$ **+8 tokens**.
4. **Angers SCO** (Grade B, 708 pts): Needs **292 points** for Grade A $\rightarrow$ **+8 tokens**.
5. **Schalke 04** (Grade B, 633 pts): Needs **367 points** for Grade A $\rightarrow$ **+8 tokens**.
6. **ESTAC Troyes** (Grade B, 627 pts): Needs **373 points** for Grade A $\rightarrow$ **+8 tokens**.
7. **Le Havre AC** (Grade B, 727 pts): Needs **373 points** for Grade A $\rightarrow$ **+8 tokens**.
8. **SC Paderborn 07** (Grade B, 624 pts): Needs **376 points** for Grade A $\rightarrow$ **+8 tokens**.
9. **FC Lorient** (Grade B, 722 pts): Needs **378 points** for Grade A $\rightarrow$ **+8 tokens**.
10. **1. FC Nürnberg** (Grade B, 614 pts): Needs **386 points** for Grade A $\rightarrow$ **+8 tokens**.
11. **SV Elversberg** (Grade B, 612 pts): Needs **388 points** for Grade A $\rightarrow$ **+8 tokens**.
12. **Ipswich Town** (Grade B, 1,695 pts): Needs **405 points** for Grade A $\rightarrow$ **+10 tokens**.

### Strategy 3: Near-Complete Sets (Missing Only 1 to 3 Cards for Full Set Completion)
1. **Bayer 04 Leverkusen**: 14 / 15 tracked $\rightarrow$ **Missing ONLY 1 player**!
2. **FC Bayern München**: 19 / 20 tracked $\rightarrow$ **Missing ONLY 1 player**!
3. **FC Badalona Women**: 13 / 15 tracked $\rightarrow$ **Missing ONLY 2 players**!
4. **Manchester City**: 17 / 20 tracked $\rightarrow$ **Missing ONLY 3 players**!
5. **Lombardia FC (Inter)**: 12 / 15 tracked $\rightarrow$ **Missing ONLY 3 players**!
6. **Season 1 (Rarities)**: 7 / 10 tracked $\rightarrow$ **Missing ONLY 3 cards**!

---

## 3. Programmatic Inspection & Automation API

All Gallery operations can be inspected and controlled via JavaScript in `playwright_browser_evaluate`:

```javascript
// Access the active Gallery Controller
const app = getAppMain();
const c = app.getRootViewController().currentController.currentController.currentController;
const view = c.view;

// 1. Switch Category (e.g. index 3 = LALIGA EA SPORTS / Liga F)
view.category.setIndex(3);
view._categoryChanged();

// 2. Select Set by ID (e.g. 90 = Malaga CF)
const setIndex = view.set.options.findIndex(o => o.value === 90);
view.set.setIndex(setIndex);
view._setChanged();
await new Promise(r => setTimeout(r, 300)); // wait for item data to load

// 3. Auto-Fill Optimal 15 Cards by Score
c._autoFill();

// 4. Read Calculated Score & Rank
const totalPoints = parseInt(document.querySelector('.gallery-grade-summary .gallery-total')?.innerText.replace(/[^0-9]/g, ''), 10);
const currentRank = document.querySelector('.gallery-grade-summary .rank__letter')?.innerText;

// 5. Inspect Missing Players with Direct Market Targets
const missingPlayers = c.albumEntries.filter(e => e.status === 'missing').map(e => ({
  name: e.item?._staticData?.name,
  rating: e.item?.rating,
  defId: e.item?.definitionId,
  teamId: e.item?.teamId
}));

// 6. Return from Market Search to Gallery View
const nav = app.getRootViewController().currentController.currentController;
nav.popViewController();
```

---

## 4. Full 127-Set Account Scanner

- Full account scan across all 7 categories and 127 sets is saved at: `data/paletools_gallery_scan.json`
- Python analysis script: `scripts/analyze_gallery.py`
  Run with:
  ```bash
  python scripts/analyze_gallery.py
  ```
  Surfaces:
  - All 56 completed sets and their current grade.
  - All sets close to Grade S (+15 tokens) or Grade A (+8-10 tokens).
  - All sets missing 1–3 cards to complete.

---

## 5. The Core FUT Gallery Buy-Sell Rule (Mandatory Invariant)

- **NO PRICE CAP**: When completing FUT Gallery sets, there is NO price cap. The objective is completion: buy the lowest available Buy Now listing on the market, regardless of price.
- **BUY $\rightarrow$ SELL INSTANTLY**: Every card purchased MUST immediately be relisted on the Transfer Market:
  `Buy Now` $\rightarrow$ `Store` $\rightarrow$ `Unassigned Items` $\rightarrow$ `List on Transfer Market` $\rightarrow$ `Paletools Cheapest` (or purchase price floor) $\rightarrow$ `List for Transfer`.
- **NEVER SEND TO CLUB**: Cards must **never** be routed to My Club. Purchasing the card registers it for the FUT Gallery set, and relisting it immediately recovers the coins to maintain liquidity.

---

## 6. The Special / In-Form vs Base Card Trap (Mandatory Rating & Rarity Verification)

- **The Trap**: Many players featured in special sets (TOTW, Heroes, Holographics, Promos) possess a common/base card version (e.g. 74 Silver or 76 Gold for ~1,000 coins) alongside their Special/In-Form card version (e.g. 80+ rating for ~10,500+ coins).
- Searching purely by the player's persona name causes EA's Transfer Market to return their cheap base card first. Buying this base card completely fails to satisfy the set requirement and wastes coins.
- **Mandatory Protections for Special Sets**:
  1. **Strict Rating Matching on Results**: Inspect EA's internal memory collection before selecting a card:
     $$\text{selectedCard.rating} === \text{target.rating}$$
     Never purchase a 74 or 76 card when the target is an 80+ TOTW/Special version.
  2. **Rarity & Special Flag Assertion**: Assert `card.rareflag === target.rareflag` (e.g. rareflag 3 for TOTW, 72 for Hero) or `card.isSpecial() === true`.
  3. **Adaptive Price Probe Stepping**: If only base cards appear at low prices, the step-probe algorithm must automatically back out (`button " [ Digit1 ]"`) and increment `probePrice` until the true special card price tier is reached.
  4. **Set Scope Realities (TOTW vs Heroes vs Holographics)**:
     - **TOTW Set (id: 99)**: Requires 20 cards. Standard 80-rated discard TOTWs (~10,000–10,500 coins) register here.
     - **Heroes Set (id: 102)**: Requires 5 cards. Lowest rated are 85-rated base Heroes (Cahill, Dempsey, Crouch, Howard, Beasley) at ~40,000–42,000 coins.
     - **Holographics Set (id: 113)**: Requires 5 cards. **Holographics are NOT restricted to Icons!**
       - In EA FC, Holographic cards are defined by `item.getFoilSubtype() !== -1` (specifically `item._hyperCosmeticDTOs[1]?.subtype === 0` for Foil).
       - The actual FUT.GG pool (`/api/fut/gallery/fc27/sets/113/pool/`) contains **326 cards**:
         - **TOTW (69 cards)**: Includes discard 80-rated TOTWs like **Lewis Dunk** (80, defId: 50531563) and **Xherdan Shaqiri** (80, defId: 50524996) at ~10,000–10,500 coins. Both verified live in EA memory with `foilSubtype: 0`!
         - **Base Heroes (87 cards)**: Includes 85-rated Heroes like **Tim Cahill** (85, eaId: 67160276) at ~40,000 coins (verified live with `foilSubtype: 0`).
         - **Promos (15 cards)**: Destined for Glory (Mbappé 91, Nuno Mendes 89, Isak 88).
         - **Debut International Icons (18 cards)**: Zidane 86, Touré 86, Schweinsteiger 86.
         - **Squad Foundations (1 card)**: Jesús Corona 84.
         - **Base Icons (136 cards)**: 89–95 OVR Icons.
       - **Crucial Distinction (Not All TOTWs are Foil)**: Zeki Amdouni (80 TOTW, defId: 50594290) has `foilSubtype: -1` and is NOT Holographic. Always verify `item.getFoilSubtype() === 0` or check the FUT.GG pool API where `"holographic": true`.
       - **The Paletools UI Truncation Trap**: In the Web App, Paletools calls `GET /defid?count=200&sort=desc&start=0&type=player`. Because it requests only 200 items sorted descending without pagination, it truncates at 89 OVR, displaying only 63 cards (Icons + top TOTWs/Mbappé) and hiding the cheaper 80–88 OVR cards. Holographics is fully completable with 5 discard ~10,000-coin TOTWs (e.g. Dunk, Shaqiri, Paradela, Stoica, Mijnans).

---

## 7. The EA FC Price Ladder & Relisting Safeguards

- EA Sports FC Transfer Market evaluates bids and prices on discrete ladder increments:
  - $\le 1,000$ coins: step = **50**
  - $1,000 - 10,000$ coins: step = **100**
  - $10,000 - 50,000$ coins: step = **250**
  - $> 50,000$ coins: step = **500**
- **The Starting Price Rejection Trap**: Setting starting bid to `buyNow - 100` above 10,000 coins (e.g. 10,400 for a 10,500 card) triggers an EA backend validation error because 10,400 is not a valid 250-step ladder value.
- **The Ladder Helper**:
  ```javascript
  const roundToLadder = (p) => {
    if (p <= 1000) return Math.max(Math.round(p / 50) * 50, 200);
    if (p <= 10000) return Math.round(p / 100) * 100;
    if (p <= 50000) return Math.round(p / 250) * 250;
    return Math.round(p / 500) * 500;
  };
  ```
- **Relisting Calculation**:
  ```javascript
  let safeStart;
  if (safeBuyNow <= 1000) safeStart = Math.max(safeBuyNow - 50, 150);
  else if (safeBuyNow <= 10000) safeStart = safeBuyNow - 100;
  else if (safeBuyNow <= 50000) safeStart = safeBuyNow - 250;
  else safeStart = safeBuyNow - 500;
  ```
- **Paletools Cheapest Validation for High-Value Cards**:
  - For cards $> 2,000$ coins (TOTWs, Heroes), accept Paletools price if `cleanVal <= Math.max(boughtNum * 1.15, boughtNum + 500)` and `< boughtNum * 1.4`.
  - For cards $\le 2,000$ coins (Bronzes, Silvers), accept if `cleanVal <= Math.max(boughtNum + 200, 1000)` and `< 5000`.
