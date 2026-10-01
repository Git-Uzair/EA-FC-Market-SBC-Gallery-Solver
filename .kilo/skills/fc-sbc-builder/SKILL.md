---
name: fc-sbc-builder
description: Guide and operational protocol for solving, assembling, and managing Squad Building Challenges (SBCs) on the EA FC 27 Web App with Paletools. Covers the verified dump -> CP-SAT solve -> apply pipeline (scripts/sbc_dump_inventory.js, scripts/solve_sbc_group.py, scripts/sbc_apply_lineup.js), club fodder sorting, strict locked-player and active-squad protection, exact chemistry and team-rating maths, templates, and safe squad building without unintended submissions.
---

# FC 27 SBC Builder & Club Fodder Protocol

This skill governs the end-to-end workflow for analyzing, sorting, and building squads for Squad Building Challenges (SBCs) on the EA FC 27 Web App with Paletools enabled.

---

## 0. START HERE - Verified Pipeline (updated 2026-10-01)

Proven on *Marquee Matchups* (4/4 submitted, 0 coins spent, 44 club/storage cards used; see section 9).
For every lineup EA's own `challenge.meetsRequirements()` was `true`. The solver's chemistry matched EA slot by slot
on the 33 slots compared (three squads) and in total on all four. Those squads were placed with inline code using
the same logic as `scripts/sbc_apply_lineup.js`. The file versions were then run live (dump: full read; apply: only
its abort path), so the apply file's placement path has not run live yet.
Use this pipeline instead of hand-picking players or Paletools Smart Builder.

**One-time setup.** System Python 3.14 has no solver libraries; installing from the network works:

```
python -m venv C:\Users\Uzair\AppData\Local\Temp\kilo\sbcenv
C:\Users\Uzair\AppData\Local\Temp\kilo\sbcenv\Scripts\python.exe -m pip install ortools pytest
```

Below, `PY` = `C:\Users\Uzair\AppData\Local\Temp\kilo\sbcenv\Scripts\python.exe`. If the temp folder was cleared,
recreate the venv. Run all commands from the repo root.

**Per challenge.** Repeat this for every challenge. Each submit removes 11 cards, so ALWAYS re-dump and re-solve:
1. **Open the challenge's squad view**: SBC tile (e.g. `h1:has-text("Marquee Matchups")`) -> group overview ->
   `button:has-text("Start Challenge")`. After each submit the app returns to the group overview with the NEXT
   challenge already selected, so the same `Start Challenge` click opens it.
2. **Dump (read-only, 2 calls)**:
   `playwright_browser_run_code_unsafe { filename: "scripts/sbc_dump_inventory.js" }` returns a small summary (counts,
   open challenge id, statuses, requirement texts) and stores the full dump in `localStorage['kilo-sbc-dump']`. Then
   `playwright_browser_evaluate { function: "() => JSON.parse(localStorage.getItem('kilo-sbc-dump'))",
   filename: "data/sbc_inventory.json" }`. The EA tab must be the current tab for this second call.
   Relative `filename` paths land in the repo (verified).
3. **Solve all remaining challenges of the group in one model**: `PY scripts/solve_sbc_group.py --max-rating 83 --time 120`.
   Each card is used at most once across challenges, so an early challenge never burns a card a later one needs.
   Add `--hint data/sbc_plan.json` to warm-start from the previous run. The script prints every lineup and writes
   `data/sbc_plan.json` plus one ready-to-run `data/sbc_apply_<challengeId>.js` per challenge.
4. **Apply ONLY the open challenge**: `playwright_browser_run_code_unsafe { filename: "data/sbc_apply_<id>.js" }`.
   It returns EA's own verdict (`meets`, `met`, `chem`, `rating`, `reqStatus`, per-slot `chem`). It aborts WITHOUT
   touching the pitch if a card is missing, Paletools-locked, or in the active squad, or if the open challenge is
   not the target.
5. **If `meets === true`**: show the lineup and ask the user, with the `question` tool, to press the `Submit`
   button at the bottom-right of the pitch. The tool blocks until they answer, so do NOT end the turn. Never
   submit yourself (1.1).
   Previous agents stopped mid-task and the user had to ask "why did you stop?". Keep going until the group is done.
6. **After "Submitted"**: go back to step 1. The group is done when the overview shows `N/N Completed`.

**Solver says INFEASIBLE** (or UNKNOWN even with a longer `--time`): the club cannot cover that challenge. Use
`--only <id>` to isolate it and look for the missing card on FUT.GG (filters) or the transfer market. Then **ask the
user to approve the purchase** (player, rating, expected price) BEFORE buying anything. Never buy without approval.
Standard user brief: never touch locked players, meet the **absolute minimum** requirements only.

**Regression tests** for the chemistry and rating maths: `PY -m pytest -q tests` (4 tests; fixtures are lineups EA
scored live).

---

## 1. Core Principles & Non-Negotiable Invariants

### 1.1 Strict Zero-Submission Rule (Testing / Dry-Run Mode)
- **NEVER** click `button " Submit"` or invoke `sbcCtrl.submitChallenge()` unless explicitly commanded by the user with final approval.
- SBC submissions are **permanent and irreversible**: submitted cards are permanently deleted/removed from the club in exchange for rewards.
- In test/build mode, assemble squads, verify requirements, and test configurations without ever pressing submit.

### 1.2 Absolute Locked Player Protection
- The user locks high-value club players, first-team squad members, and Evolution candidates via Paletools.
- **NEVER** place a locked player into any SBC active submission slot.
- Identification methods for locked players:
  1. **Paletools Storage**: Read `localStorage.getItem("paletools:2027:<userId>:lockedItems")`. Contains an array of locked `definitionId`s, `id`s, or `<definitionId>u` (untradeable).
     - Verified 2026-10-01: 34 entries, i.e. numbers plus `"<defId>u"` strings, which come to 30
       unique definitionIds. Strip the `u` and treat the whole definitionId as locked. That is conservative: it also
       protects the other copy. Find the key with `/^paletools:\d+:\d+:lockedItems$/`.
  2. **DOM Classes**: Inspect `.player.locked` or `.locked` on card elements.
  3. **Active Squad Invariant**: Never submit cards with `.player.active` or active squad markers.
     - **The lock list does NOT cover the active squad.** Anyomi 84 (defId 50596595) and Coman 83 (213345) were in
       the active squad but not locked. Always exclude active-squad item ids as well:
       `services.Squad.requestSquadById(services.Squad.getActiveSquadId())` -> `res.data.squad.getPlayers()` gives
       21 items, including subs and reserves.
  4. **Also never use** (the dump flags these and the solver excludes them): loans (`item.loans !== -1`),
     `isLimitedUse()`, `isTimeLimited()`, evolution cards (`item.upgrades`), academy cards (`isEnrolledInAcademy()`,
     `isAcademyGraduate()`), `concept` and `isFavorite`. In the 2026-10-01 club these were: 29 locked, 21 active,
     8 evo, 8 academy, 5 loan and 5 limited (overlapping), leaving 236 of 271 cards eligible.

### 1.3 Fodder Hierarchy & Sourcing Priority
When selecting club players to satisfy challenge criteria, always follow this priority:
1. **Duplicate Unassigned / SBC Storage**: Duplicates sitting in Unassigned (`KeyU`) or SBC Storage (`KeyD`) must be recycled first.
2. **Quality Tier Order**: `Bronze (<65)` $\rightarrow$ `Silver (65–74)` $\rightarrow$ `Low Gold (75–81)` $\rightarrow$ `High Gold (82+)`.
   - If an SBC specifies `Player Quality: Min. Bronze`, using all gold cards when bronze cards are available and capable of meeting chemistry is sub-optimal and wastes club equity.
3. **Rating Optimization**: Always use the lowest-rated cards within each tier unless the SBC explicitly demands a minimum squad rating (e.g., Min Squad Rating 84).
4. **DO NOT USE**:
   - Paletools-locked items.
   - Active Squad players.
   - High-rated fodder (82+) on challenges that have no rating threshold.
   - Known FUT Gallery bottleneck cards needed for active sets (e.g., Malaga CF, Frosinone, Tenerife key cards).

### 1.4 The Principle of Minimal Requirement Fulfillment
- An SBC only checks whether its constraints are met (boolean pass/fail).
- Any overshoot provides zero additional benefit:
  - If `Total Chemistry: Min. 14` is required, achieving 32 chemistry is of no additional use if doing so consumed higher-tier cards or forced all-gold lineups.
  - Settle at the exact or near-minimal boundary (e.g. 14–18 chemistry) if it allows deploying lower-tier cards (bronzes/silvers) in the non-chemistry slots.

### 1.5 Rating-Based SBC Optimization (The Exact EA FC Float Formula)
- In rating-based SBCs (e.g. "Team Rating: Min. 84", "Min. 1 player of 86+"), **NEVER** assume simple integer truncation.
- **The Exact EA FC Client Engine Algorithm (`_calculateRating`)**:
  When `SQUAD_RATING_FLOAT_CALCULATION_ENABLED` is active:
  $$n = \sum_{j=1}^{11} R_j$$
  $$i = \frac{n}{11} \quad (\text{Exact Average Rating})$$
  $$o = n + \sum_{R_j > i} (R_j - i) \quad (\text{Total Score with Excess Points})$$
  $$\text{Squad Rating} = \left\lfloor \frac{\text{Math.round}(o)}{11} \right\rfloor$$
- **The Exact Half-Point Rounding Threshold**:
  For an SBC requiring Team Rating $T$ (e.g. $T = 84$):
  $$\text{Math.round}(o) \ge 11 \times T \iff \mathbf{o \ge 11 \times T - 0.5}$$
  - For $T = 84$: **$o \ge 923.5$**!
  - Any lineup producing $o \ge 923.5$ rounds up to $924$, achieving a **Team Rating of 84**.
  - Truncation formulas (like Python's `int(total / 11)`) falsely reject valid lineups with $923.5 \le o < 924.0$ (such as $923.727$), missing valid minimal rating configurations that use more 82s, 81s, or 80s.
  - **Verified live 2026-10-01** (France v Italy, "Team Rating: Min. 75"): ratings 79, 63, 76, 62, 75, 74, 80, 77,
    71, 74, 66 (plain average 72.45) give $o = 824.818$ and $o/11 = 74.98$. EA showed **75**, so truncation would
    have wrongly rejected this squad. The test `tests/test_solve_sbc_group.py::test_rating_needs_round_then_floor`
    pins this.
  - **Exact integer form** (used by the solver): $11o = 11n + \sum_{R_j > i} (11R_j - n)$ is always an integer, so
    $o$ is never exactly $x.5$. The requirement is therefore simply $11o \ge 121T - 5$, and Python's
    round-half-to-even can never disagree with JS `Math.round` here.
- **The Anchor Leverage Principle**:
  - Higher anchor cards ($86, 88, 89$) grant substantial excess points ($R_j - i$).
  - This excess enables aggressively depressing other slots into much lower card tiers ($82$s, $81$s, and $80$s).
  - For example, with an $86$ anchor and one $85$:
    - Three 84s, three 83s, and **three 82s** yields $o = 923.727 \ge 923.5 \implies \mathbf{84}$ Rating!
    - Four 84s, zero 83s, and **five 82s** yields $o = 923.818 \ge 923.5 \implies \mathbf{84}$ Rating!
    - Five 84s, one 82, and **three 81s** yields $o = 924.091 \ge 923.5 \implies \mathbf{84}$ Rating!
  - Always solve for the combination that **minimizes total card tier cost** and **preserves scarce high-value club fodder**.
- **Player Exclusion Invariants**:
  - Respect explicit user exclusions (e.g., "do not use Cherki").
  - Never sacrifice club favorites, icons, active squad members, or high-value tradeables when common fodder is available.

### 1.6 The Backend Persistence Invariant (Sequential Submissions)
- In the EA FC Web App, populating player cards into an SBC squad pitch is held in client memory until submitted.
- **Backing out (`Key1` / Back button) discards unsubmitted field assignments**: Navigating away from an active SBC without submitting it completely clears the pitch on the EA backend.
- **Rule**: For multi-challenge SBC sets (e.g. *Marquee Matchups*), challenges must be solved, populated, and **submitted one by one sequentially**. Never attempt to pre-populate all 4 sub-challenges simultaneously.
- **Plan jointly, apply sequentially (verified 2026-10-01)**: solving all remaining challenges in ONE offline model,
  with each card used at most once, is safe and better. Only the open challenge gets placed on a pitch. After each
  submit, re-dump and re-solve: club + SBC storage shrank by exactly 11 per submit (club 236 -> 226 -> 215 -> 206
  -> 195, storage 35 -> 34 -> 34 -> 32), and the leftover plan stays valid only if no other cards moved.
- Not yet tested: `services.SBC.saveChallenge` exists (alongside `loadChallenge` and `submitChallenge`). It might
  persist a pitch server-side, but that has not been tried. Never call `submitChallenge`.

---

## 2. EA FC 27 Web App SBC Architecture

### 2.1 Navigation & Category Organization
- Left Sidebar: `button " SBC"`
- Filter tabs:
  - `All`: Complete list of live SBCs.
  - `Favourites`: User-starred SBCs.
  - `Upgrades`: Repeatable player/pack upgrade loops (Bronze, Silver, Gold, 2x 79+, TOTW).
  - `Challenges`: Timed thematic puzzle challenges (e.g. *Destined for Glory*, *Marquee Matchups*, *League & Nation Advanced*).
  - `Foundations`: Permanent starter tutorial challenges.
  - `SBC Templates`: Global Paletools SBC template manager.

### 2.2 Challenge Structure Types
- **Single-Challenge SBCs**: Directly open the 11-player squad builder upon clicking the tile (e.g. *Destined for Glory Challenge 1*, *2x 79+ Upgrade*).
- **Multi-Challenge SBC Groups**: Open a challenge overview with a list of sub-challenges (e.g. *Marquee Matchups* with 4 fixtures).
  - Each fixture has a `button "Start Challenge"` or `button "Go to Challenge"` to enter its individual squad builder.
  - Completed groups show `N/N Completed` with checkmarks.

---

## 3. The Squad Builder Interface & Paletools Actions

When inside an individual challenge view:

| Element / Button | Hotkey | Function & Behavior |
|---|---|---|
| `button " [ Digit1 ]"` | `Digit1` | Back out of the challenge to the SBC menu. |
| `button "Use Squad Builder"` | `KeyB` | Opens EA's native Squad Builder sidebar (filters by Quality, OVR range, League, Club, Untradeables). |
| `button "Smart Builder"` | `KeyP` | Paletools automated builder. Fills simple rating/quality SBCs, but reports *"Unable to satisfy counted SBC requirements"* for complex puzzle criteria (max clubs, chemistry). |
| `button "Build Using Template"` | `KeyT` | Populates the squad according to the assigned Paletools SBC Template. |
| `button "Edit SBC Template"` | `KeyE` | Opens the Paletools Template Builder for the current challenge. |
| `button "Clear Squad"` | `KeyC` | Removes all players from the pitch back to the club. |
| `button "Use duplicated players"` | `KeyD` | Places matching duplicates from SBC Storage into eligible positions. |
| `button "Use unassigned players"` | `KeyU` | Places cards from the Unassigned pile into eligible positions. |
| `button "Add Multiple Players"` | `KeyM` | Opens full-screen 23-slot squad manager with searchable club player sidebar. |
| `button " Work Area"` | - | Opens the 12-slot bench/staging area. Cards placed here are **NOT** submitted. |
| `button " Submit"` | `KeyS` | Submits the squad. Disabled until 100% of requirements are met. **DO NOT CLICK IN TEST MODE.** |

**UI state after a scripted placement (verified 2026-10-01):**
- These update correctly: the pitch, the top bar (`Requirements N/N`, `Rating`, `Chemistry x/33`) and the
  `Submit` button at the bottom-right of the pitch. The user pressed it 4 times and it worked every time.
- The right panel goes stale. Its requirement list keeps old counters such as
  `Romania OR Sweden: Min. 1 Player (0)`, and `Exchange Players [ KeyS ]` stayed disabled (seen on Romania v
  Sweden). Ignore both. Trust `challenge.meetsRequirements()` and the top bar.
- The UI lists one more requirement than `challenge.eligibilityRequirements`: the implicit
  `Number of Players in the Squad: 11`. `getNumberOfRequirementsMet()` counts it too: 5 eligibility requirements
  gave `met` 6, and 6 gave 7.
- Snapshot labels contain icon-font glyphs (e.g. U+E002 before "Submit"). Match buttons with `:has-text("Submit")`,
  never with the copied glyph text. `playwright_browser_click` with target `ref=f7e53` fails
  ("Unknown engine ref"). CSS such as `button:has-text("Start Challenge")` or `h1:has-text("Marquee Matchups")`
  works.

---

## 4. SBC Templates (Paletools Template Builder)

SBC Templates allow creating reusable rules for assembling squads automatically.

### 4.1 Accessing & Creating Templates
1. Click `button "Edit SBC Template [ KeyE ]"` inside any challenge, or `button "SBC Templates"` on the main SBC hub.
2. In the template builder:
   - Click `button "Add"` to add a rule block.
   - Configure rule parameters:
     - **Sort**: `Rating Low to High` (optimal for saving coins/fodder) or `Rating High to Low`.
     - **Source**: `SBC Storage / My Club`, `Storage Only`, or `My Club Only`.
     - **Filter**: `Untradeables Only` checkbox.
     - **OVR Bounds**: `Min` and `Max` OVR sliders/inputs (e.g. 75 to 80 for low gold upgrades).
     - **Count**: `Players Count` (e.g. 10 or 11).
     - **Club Constraints**: `Max Players From Same Club` (critical for "Max X clubs" challenges).
     - **Position Enforcement**: `Ignore Players Positions` toggle.
     - **Quality & League**: Specify `Quality` (Bronze/Silver/Gold) and specific League/Nation filters if required.
3. Click `button "Save"`.
   - Templates can be saved locally for that specific challenge or as a **Global Template** (reusable across multiple SBCs).
   - Stored in IndexedDB: `paletools.globalSbcTemplates` and `paletools.sbcTemplates`.

---

## 5. Solving Challenge SBCs (Puzzle Constraints, Chemistry & Out-of-Position Tactics)

Challenge SBCs (e.g. Marquee Matchups, Destined for Glory) feature strict combinatoric requirements:
- **Same League Min/Max**: e.g., "Min. 2 Players from same League" or "Max. 5 Leagues".
- **Clubs in Squad Min/Max**: e.g., "Max. 4 Clubs in Squad" or "Min. 3 Players from same Club".
- **Nationalities**: e.g., "Min. 3 Nationalities" or "England OR Spain: Min. 2 Players".
- **Chemistry Thresholds**: e.g., "Total Chemistry: Min. 14" (or 18, 22, 26).

### 5.1 EA FC Chemistry System Architecture (FC 25 / FC 26 / FC 27)
- **Position Dependency**:
  - A player deployed in their **Preferred / Alternate Position** earns individual chemistry (0–3 points) and contributes +1 towards the squad's shared Club, Nation, and League thresholds.
  - A player deployed **Out of Position** receives **0 chemistry points** and does **not** contribute to any teammate's Club, Nation, or League thresholds.
- **Threshold Increments**:
  - **Club**: 2 players $\rightarrow +1$; 4 players $\rightarrow +2$; 7 players $\rightarrow +3$.
  - **Nation**: 2 players $\rightarrow +1$; 5 players $\rightarrow +2$; 8 players $\rightarrow +3$.
  - **League**: 3 players $\rightarrow +1$; 5 players $\rightarrow +2$; 8 players $\rightarrow +3$.
- **Max Chemistry per player**: 3 points (Squad Max: 33 points across 11 players).
- **Verified in FC 27 (2026-10-01)**: these rules predicted EA's per-slot chemistry exactly on the 33 slots compared
  slot by slot (three Marquee Matchups squads) and EA's total on all four. The out-of-position rule is proven: in Greece v Germany, an in-position RB (nation
  21, league 19) whose only nation and league mate was out of position got **0**. The rule is pinned in
  `tests/test_solve_sbc_group.py`.
- **"In position"** means the slot's position `typeId` is in `item.possiblePositions`. That array holds position
  typeIds, not slot ids, and RCB/CB/LCB slots all have typeId 5. See section 6 for the id table.
- Not tested and not modelled by the solver: icon, hero and manager chemistry bonuses. Treat SBCs that depend on
  them by hand.

### 5.2 Out-of-Position Placement & Chemistry Decoupling
- **The Decoupling Insight**: Once a core cluster of in-position players satisfies the minimum challenge chemistry (e.g. 5–7 players generating 14+ chemistry), the remaining slots can be filled by **ANY players in ANY positions** (even completely out of position, such as a Bronze LB placed at GK, or a Bronze CB placed at ST).
- Out-of-position placement frees the solver from needing natural-position fodder across obscure formation roles. Low-rated bronzes can be inserted into high-demand slots (like GK or ST) without needing to buy expensive position-specific cards.

### 5.3 Puzzle Solving Strategy (Club Block Algorithm)
1. **Club Grouping**: Group unlocked, eligible club inventory by `teamId`. Filter out clubs with fewer than 2 available players.
2. **Handle "Max X Clubs in Squad" & The Pigeonhole Limit for Bronzes**:
   - Paletools' `Smart Builder` will fail on this with *"Unable to satisfy counted SBC requirements before completing the squad"*.
   - Instead, search combinations of 3 or 4 candidate clubs whose combined player pool satisfies all 11 formation positions (GK, RB, CB, CB, LB, RM, CM, LM, CAM, CAM, ST).
   - **Isolated Bronze Sourcing Ceiling**: If using single-player clubs (e.g. isolated bronze cards from different obscure clubs), each bronze card consumes 1 full club slot. If the challenge specifies `Clubs: Max C` (e.g. 4) and your largest club in inventory has $S_{max}$ players (e.g. 6):
     $$(C - k) \times S_{max} \ge 11 - k$$
     where $k$ is the number of single-card clubs. For $C=4, S_{max}=6$: $k=3$ is mathematically impossible ($1 \times 6 < 8$), making **$k = 2$ the maximum possible number of isolated bronze cards** that can fit into the 11-player squad alongside two core clubs (e.g. 5 from Club A + 4 from Club B + 1 Bronze Club C + 1 Bronze Club D = 11 players across exactly 4 clubs).
3. **Local Solver Execution (Safety Invariant)**:
   - Always run combinatorial searches and backtracking solvers **locally** (via Python/Node in bash) instead of executing deep recursion or unbounded loops in `playwright_browser_evaluate`. Evaluating heavy loops inside the browser can lock the page JavaScript thread and cause browser backend timeouts.
   - **Implemented**: `scripts/solve_sbc_group.py` (OR-Tools CP-SAT) replaces hand-written club-block searches and
     handles club/league/nation counts, chemistry and team rating exactly (section 8). Older one-off scripts
     (`scripts/solve_sbc.py`, `scripts/solve_marquee_4.py`, `scripts/apply_sbc_squad.js`) predate it. The section 0
     pipeline is the one verified end to end.
4. **Filter Out Ineligibles First**:
   - Exclude locked items (`paletools lockedItems`).
   - Exclude active squad items.
   - Respect minimum quality (e.g. Min Silver means Bronze cards cannot be used).

---

## 6. Programmatic Inspection & Validation (In-Browser Controller API)

When executing via Playwright evaluation:

```javascript
// Access the active SBC Split View Controller
const app = getAppMain();
const nav = app.getRootViewController().currentController.currentController;
const sbcCtrl = nav.currentController; // UTSBCSquadSplitViewController

const squad = sbcCtrl._squad;
// sbcCtrl._challenge is undefined, and challenges.values()[0] is ALWAYS the group's first challenge.
// Match the open challenge by its squad object (verified on all 4 Marquee Matchups challenges):
const challenge = Array.from(sbcCtrl._set.challenges.values()).find(ch => ch.squad === squad);

// CRITICAL SIGNATURE: slotIndex is 1st argument, item is 2nd argument!
// squad.addItemToSlot(slotIndex, playerItem);
squad.addItemToSlot(0, gkItem);

// Update chemistry and calculate rating
squad.calculateChemistry();
squad.updateChemistry();

// Sync the Web App UI, checkmarks, and button states:
if (sbcCtrl.view?.render) sbcCtrl.view.render();
if (sbcCtrl._generateSquadOverview) sbcCtrl._generateSquadOverview();
if (sbcCtrl._requirementsNotification?._eChallengeUpdated) {
  sbcCtrl._requirementsNotification._eChallengeUpdated();
}

// Check status of requirements
const meetsAll = challenge.meetsRequirements();
const metCount = challenge.getNumberOfRequirementsMet();

// Inspect slots (0..10 are pitch, 11..22 are work area)
const pitchSlots = squad.getSlots().slice(0, 11);

// Clear squad safely if needed
squad.getSlots().forEach(slot => {
  if (slot.item && slot.item.id > 0) squad.removeItemFromSlot(slot);
});
squad.updateChemistry();
```

### 6.1 Data Access (verified 2026-10-01; implemented in `scripts/sbc_dump_inventory.js`)

```javascript
const obs = (o) => new Promise(r => o.observe(undefined, (a, b) => r(b)));
// Club: requires a UTSearchCriteriaDTO. A plain object crashes in getUrlParams ("reading 'toLowerCase'").
// One count=500 call returned the whole club (236 players). Do NOT page with an offset loop: a while(true) loop
// with count=100 hung the evaluate until the MCP timeout (-32001).
const c = new UTSearchCriteriaDTO(); c.type = SearchType.PLAYER; c.count = 500;
const club = (await obs(services.Club.search(c))).response.items;
// SBC storage duplicates: a criteria arg is mandatory. Without it: "Cannot set properties of undefined (setting 'count')".
const sc = new UTSearchCriteriaDTO(); sc.count = 500;
const storage = (await obs(services.Item.searchStorageItems(sc))).response.items;            // 35 items seen
// Unassigned pile (only ever seen empty; read both shapes): (await obs(services.Item.requestUnassignedItems()))
// Active squad: the payload is in .data, NOT .response (status 304 still counts as success).
const sres = await obs(services.Squad.requestSquadById(services.Squad.getActiveSquadId()));
const activeItems = sres.data.squad.getPlayers().map(x => x.item || x._item || x);            // 21 items
// Nation name: services.Localization.localize('search.nationName.nation' + nationId)          // 39 -> "Romania"
// Formation: repositories.Squad.getFormation(challenge.formation).positions[i] -> {id, typeId, name}
//   e.g. 'f5212', 'f532', 'f451', 'f442'. Slot index i in squad.getSlots() == positions[i].
```

- Useful item fields and methods: `id`, `definitionId`, `_staticData.name`, `rating`, `rareflag`, `nationId`,
  `leagueId`, `teamId`, `possiblePositions` (getter, an array of typeIds), `preferredPosition`, `isTradeable()`,
  `loans`, `isLimitedUse()`, `isTimeLimited()`, `upgrades`, `isEnrolledInAcademy()`, `isAcademyGraduate()`,
  `isSpecial()`, `isRare()`, `isFavorite`, `concept`, `getTier()`.
- Position typeIds seen in formations: GK 0, RB 3, CB 5 (RCB/CB/LCB), LB 7, CDM 10, RM 12, CM 14 (RCM/CM/LCM),
  LM 16, CAM 18 (RAM/CAM/LAM), ST 25 (RS/ST/LS). Wingers also carry 23 (RW) and 27 (LW):
  Cherki's preferred position is 23, Rafael Leão's and Rashford's 27 (inferred from cards, not read from an enum).
- Nation ids seen: Croatia 10, England 14, France 18, Germany 21, Greece 22, Italy 27, Romania 39, Sweden 46.
- Quality by rating: bronze < 65, silver 65-74, gold 75+. EA's "Silver: Min. 3" and "Gold: Min. 2" checks agreed.
- Controllers (`getAppMain().getRootViewController().currentController.currentController.currentController`):
  - The challenge squad view is `UTSBCSquadSplitViewController` (`_set`, `_squad`).
  - The group overview is `UTSBCGroupChallengeSplitViewController`. Its challenges are at
    `ctrl.sbcViewModel.challenges` (4 entries; the scripts do not use this).
  - The Store is `UTStorePackViewController`. The dump still reads the inventory there, but `challenges` is empty.
- `services.SBC` methods include `requestSets`, `requestChallengesForSet`, `loadChallenge`, `saveChallenge` and
  `submitChallenge` (never call it).
- Playwright tooling:
  - `playwright_browser_run_code_unsafe { filename }` loads repo-relative files. It is the zero-paste way to run
    long scripts, but the tool still echoes the file's code.
  - Inside it, `require` and `process` are undefined, so there is no `fs`. Write files with
    `playwright_browser_evaluate`'s `filename` instead.
  - `scripts/state_server.py` only accepts writes to `data/market_state.json`.

### 6.2 Requirement Decoding (verified 2026-10-01)

Each `challenge.eligibilityRequirements[r]` has these fields:
- `r.kvPairs._collection = { <key>: [values] }`
- `r.scope`: 0 = min (GREATER), 1 = max (LOWER), 2 = EXACT (`window.SBCEligibilityScope`)
- `r.count`: the number of players for player-count rules, otherwise -1
- `r.buildString()`: the UI text
- `challenge.isRequirementMet(r)`: a per-requirement boolean

Key enum: `window.SBCEligibilityKey`.

| Key | Name | Example (text -> values, scope, count) |
|---|---|---|
| 3 | PLAYER_QUALITY | "Player Quality: Min. Bronze" -> [1]; "Min. Silver" -> [2], scope 0 |
| 4 | SAME_NATION_COUNT | "Players from the same Countries/Regions: Min. 3" -> [3], scope 0 |
| 5 | SAME_LEAGUE_COUNT | "Players from the same League: Min. 4" -> [4], scope 0 |
| 6 | SAME_CLUB_COUNT | "Players from the same Club: Min. 2" -> [2], scope 0; "Max 3" -> [3], scope 1 |
| 8 | LEAGUE_COUNT | "Leagues in Squad: Max. 4" -> [4], scope 1 |
| 9 | CLUB_COUNT | "Clubs in Squad: Min. 4" -> [4], scope 0 |
| 10 | NATION_ID | "Romania OR Sweden: Min. 1 Player" -> [39, 46], count 1 |
| 17 | PLAYER_LEVEL | "Silver: Min. 3 Players" -> [2], count 3; "Gold: Min. 2 Players" -> [3], count 2 |
| 19 | TEAM_RATING | "Team Rating: Min. 75" -> [75], scope 0 |
| 35 | CHEMISTRY_POINTS | "Total Chemistry: Min. 14" -> [14], scope 0 |

Not yet encountered:
- 7 NATION_COUNT. The solver already supports it.
- Every other key stops the solver with "Unsupported requirement". Examples: 2 PLAYER_COUNT, 11 LEAGUE_ID,
  12 CLUB_ID, 15 LEGEND_COUNT, 18 PLAYER_RARITY, 21 PLAYER_COUNT_COMBINED, 25 PLAYER_RARITY_GROUP,
  26/27/28 PLAYER_MIN/EXACT/MAX_OVR, 33 PLAYER_TRADABILITY, 36 ALL_PLAYERS_CHEMISTRY_POINTS.
- The full list is in `window.SBCEligibilityKey`.

---

## 7. Operational Workflow for an SBC Task

The concrete commands are in section 0. In outline:

1. **Inspect Requirements**: the dump summary lists each challenge's requirement texts. The UI shows the same list
   plus the implicit 11-player rule.
2. **Scan Club Inventory**: `scripts/sbc_dump_inventory.js` covers club, SBC storage and unassigned cards, with
   locked and active-squad flags (rules in 1.2).
3. **Assemble Candidate Squad**:
   - Puzzle challenges and groups: `scripts/solve_sbc_group.py` (section 8), all remaining challenges in one model.
   - Repeatable upgrades: try the solver with `--only <id>`. If it stops on an unsupported key, add that key
     (section 8) or fall back to a Paletools template or Squad Builder with the lowest OVR bounds.
4. **Verify Requirements**: the apply file returns EA's `meets` and `reqStatus`. Require `meets === true`.
5. **Hand over**: present the lineup, rating, chemistry and cards used, then wait with the `question` tool while
   the user submits (section 0, step 5). In pure test/build mode, do not ask for a submit. Never submit yourself.

---

## 8. Solver Reference (`scripts/solve_sbc_group.py`, OR-Tools CP-SAT)

- **Input**: `--inv data/sbc_inventory.json` (from the dump). It models every challenge whose status is not
  `COMPLETED`, or only `--only id1,id2`.
- **Built-in hard rules**:
  - It excludes locked, active-squad, loan, limited, time-limited, evo, academy, concept and favourite cards (1.2).
  - Each card is used at most once across all modelled challenges.
  - The same player is used at most once per squad. It compares `definitionId mod 2^24`, so base and special
    versions count as the same player (EA's usual id scheme; assumed, not checked this session).
  - A minimum-quality requirement filters the candidates.
- **Chemistry**:
  - For each club, nation and league group there are indicators `z_k` with `t_k * z_k <= in-position count`, for
    the 2/4/7, 2/5/8 and 3/5/8 thresholds.
  - Player chemistry is `<= min(3, sum of z)` and is 0 when out of position.
  - Total chemistry must reach the requirement.
- **Team rating**: the exact float formula as integers (1.5), `11*n + sum(e_i) >= 121*T - 5` with
  `e_i <= 11*R_i - n` for players the model counts as above average.
- **Supported requirement keys**: 3, 4, 5, 6, 7, 8, 9, 10, 17, 19 (min only) and 35. Any other key stops the run
  with `Unsupported requirement in <challenge>: {...}`. Add a branch in `build_challenge()`, plus a test.
- **Objective = fodder value, not market price** (`card_cost`):
  - Base cost by rating: bronze ~2, silver ~4-5, gold 75 = 5, 80 = 8.5, 81 = 11, 82 = 17, 83 = 30, 84 = 55,
    85 = 100, 86 = 170, 87 = 280, 88 = 420, 89 = 600.
  - Modifiers: x1.3 if tradeable (keeps coin value), x0.85 for SBC-storage duplicates (use first), +200 for
    specials and promos (`isSpecial()` or `rareflag >= 3`).
  - This encodes the fodder hierarchy in 1.3. Edit `GOLD_COST` or `card_cost` to change priorities.
  - Requirements are hard constraints and extra chemistry or rating costs fodder, so results land exactly on the
    minimums (chemistry 14/18/22/26 against minimums 14/18/22/26, rating 75 against 75).
- **Flags**:
  - `--only 51,52`
  - `--exclude-ids <itemIds>`: cards the user wants to keep
  - `--max-rating 83`: keeps 84+ cards out of the pool; raise it for high-rating SBCs
  - `--hint <plan.json>`: warm start
  - `--time <seconds>`
  - `--out <plan.json>`: the apply files go next to it
- **Output**:
  - A table per challenge: slot, card, quality, T/U, source, nation, league, club, inPos, chem.
  - `data/sbc_plan.json`.
  - `data/sbc_apply_<id>.js`, filled from the template `scripts/sbc_apply_lineup.js`.
- **Performance (8 workers)**:
  - 4 challenges jointly: FEASIBLE with a 13-16% gap after 60-200 s. More time did not reliably help; the gap is
    mostly a weak bound.
  - 3 challenges: 6.5% gap at 150 s. 2 challenges: 8% gap at 120 s. 1 challenge: OPTIMAL in under 90 s.
  - Equal-cost lineups can differ between runs (seen on France v Italy). Always apply the newest file.
- **Out-of-position fill**: once the chemistry minimum is met, the solver puts cheap cards out of position (5.2).
  Each Marquee squad had 1-2 such slots.

---

## 9. Worked Example: Marquee Matchups (FC 27 set 24, solved 2026-10-01)

- Group reward: Jumbo Gold Pack. Non-repeatable, about 7 days to complete.
- Club before: 236 players plus 35 SBC-storage duplicates.
- Coins spent: 0.

| Id | Challenge | Formation | Requirements | Result (EA) | Cards used | Reward |
|---|---|---|---|---|---|---|
| 51 | Romania v Sweden | f5212 | ROU/SWE >= 1; clubs >= 4; silver >= 3; min bronze; chem >= 14 | chem 14, rating 67 | 7 bronze, 3 silver, Asllani 80 (storage duplicate; the only Swede, 0 Romanians owned) | Large Silver Players Pack |
| 52 | Greece v Germany | f532 | GRE/GER >= 1; same club >= 2; leagues <= 4; gold >= 2; min silver; chem >= 18 | chem 18, rating 76 | 4 silver, 7 gold 75-78 | Small Electrum Players Pack |
| 53 | Croatia v England | f451 | CRO/ENG >= 2; same club <= 3; same league >= 4; gold >= 2; min silver; chem >= 22 | chem 22, rating 77 | 3 silver, 8 gold 76-81 (Pubill 81 and Carlos Soler 79 from storage) | Mixed Players Pack |
| 54 | France v Italy | f442 | FRA/ITA >= 2; same nation >= 3; same club <= 4; leagues <= 4; rating >= 75; chem >= 26 | chem 26, rating 75 | 2 bronze, 4 silver, 5 gold 75-80 | Small Gold Players Pack |

**Patterns:**
- Chemistry came from one dense in-position league or nation block. In France v Italy that was five league-2221
  cards, four of them Americans, plus a three-card league-2216 block.
- The themed-nation rule was met with 1-2 cards.
- Every other slot took the cheapest eligible card.
- No card above 81 was needed.
- Re-solving after each submit absorbs manual tweaks. On Romania v Sweden, Kapuadi 72 replaced Iván Azón 70, whom
  the plan had put out of position, and the next solve used Azón as Croatia v England's in-position ST.

---

## 10. Environment Notes & Open Leads

- The bash policy denies `Remove-Item`. Write scratch output (self-tests, trial plans) to
  `C:\Users\Uzair\AppData\Local\Temp\kilo\` rather than the repo.
- For large browser results, pass `filename` to `playwright_browser_evaluate` so the JSON goes to a file instead of
  the context. The dump's step 2 does this.
- Open leads (NOT verified; test them before relying on them):
  1. A price-aware objective: replace the rating heuristic in `card_cost` with live market or FUT.GG prices, so
     valuable tradeables are protected precisely.
  2. `services.SBC.saveChallenge` might persist pitches server-side, which would lift the one-pitch-at-a-time limit
     in 1.6.
  3. Requirement keys not yet supported (rarity, OVR bounds, tradability): add each one when a live SBC needs it,
     with a fixture test like `tests/test_solve_sbc_group.py`.
