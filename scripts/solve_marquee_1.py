import json
from collections import defaultdict
import itertools

with open('data/available_club_players.json', 'r', encoding='utf-8') as f:
    players = json.load(f)

# Formation slots for Italy v Belgium (4-4-2):
# 0: GK (0)
# 1: RB (3)
# 2: RCB (5)
# 3: LCB (5)
# 4: LB (7)
# 5: RM (12)
# 6: CM (14)
# 7: CM (14)
# 8: LM (16)
# 9: ST (25)
# 10: ST (25)
SLOT_POS = [0, 3, 5, 5, 7, 12, 14, 14, 16, 25, 25]

def can_play(p, target_pos):
    return target_pos in p['possiblePos']

# Priority: Bronze (<65) -> Silver (65..74) -> Low Gold (75..81)
# No gold > 81!
def score_player(p):
    if p['rating'] < 65:
        return p['rating'] # 50..64
    elif p['rating'] < 75:
        return 1000 + p['rating'] # 1070..1074
    else:
        return 10000 + p['rating'] * 100 # 17500..18100

eligible_players = [p for p in players if p['rating'] <= 81]

# Requirements for Italy v Belgium:
# 1. Italy (27) OR Belgium (7): Min 1 player
# 2. Clubs: Min 3
# 3. Silver: Min 3 players
# 4. Total Chemistry: Min 14
# 5. Squad size: 11

def calc_chem(assignment):
    in_pos = [can_play(p, SLOT_POS[s_idx]) for p, s_idx in assignment]
    club_cnt = defaultdict(int)
    nat_cnt = defaultdict(int)
    lg_cnt = defaultdict(int)
    
    for (p, _), ok in zip(assignment, in_pos):
        if ok:
            club_cnt[p['teamId']] += 1
            nat_cnt[p['nationId']] += 1
            lg_cnt[p['leagueId']] += 1
            
    total_chem = 0
    for (p, _), ok in zip(assignment, in_pos):
        if not ok:
            continue
        c = 0
        cc = club_cnt[p['teamId']]
        if cc >= 7: c += 3
        elif cc >= 4: c += 2
        elif cc >= 2: c += 1
        
        nc = nat_cnt[p['nationId']]
        if nc >= 8: c += 3
        elif nc >= 5: c += 2
        elif nc >= 2: c += 1
        
        lc = lg_cnt[p['leagueId']]
        if lc >= 8: c += 3
        elif lc >= 5: c += 2
        elif lc >= 3: c += 1
        
        total_chem += min(3, c)
    return total_chem

# Let's inspect the pool of lowest score players
# We have 13 bronzes and 7 silvers.
# To satisfy Silver >= 3: at least 3 silvers.
# To satisfy Italy OR Belgium >= 1: at least 1 ITA/BEL player.
# To maximize bronzes: try 11 players with as many bronzes and silvers as possible!

print("Solving Italy v Belgium...")

# Separate by tiers
bronzes = [p for p in eligible_players if p['rating'] < 65]
silvers = [p for p in eligible_players if 65 <= p['rating'] < 75]
golds = [p for p in eligible_players if p['rating'] >= 75]

print(f"Pool: {len(bronzes)} bronzes, {len(silvers)} silvers, {len(golds)} golds")

# Fast solver:
# We need:
# - at least 3 silvers (out of 7)
# - at least 1 ITA (27) or BEL (7)
# - at least 3 clubs
# - chemistry >= 14
# How do we get 14 chemistry easily?
# A cluster of players from the same club or league!
# For example: 5 Tottenham players in position give 14 chem!
# Or 4 Inter Milan players + 3 Premier League players!
# Or Tottenham (5 players) + 3 silvers + 3 bronzes!
# 5 Tottenham + 3 Silvers + 3 Bronzes = 11 players!
# Let's check: Tottenham has 5 players (ratings 78..81).
# 3 Silvers (ratings 70..73).
# 3 Bronzes (ratings 50..56).
# Does Tottenham + 3 silvers + 3 bronzes contain Italy or Belgium?
# Tottenham has no Italy or Belgium. But Ramazani (76 Gold, Belgium) or Raskin (79 Gold, Belgium) or Audero (79 Gold, Italy) can replace one Tottenham player or be included!

best_solution = None
min_score = float('inf')

# We can test candidate 11-player sets:
# Core linking group (4-6 players from one club/league to secure 14 chem)
# + 3 silvers
# + bronzes/ITA/BEL to fill to 11

linking_clubs = [131682, 13, 483, 240, 234, 448, 449, 1799, 94]
for core_team in linking_clubs:
    core_players = [p for p in golds if p['teamId'] == core_team]
    for core_size in range(4, min(len(core_players) + 1, 7)):
        for core_subset in itertools.combinations(core_players, core_size):
            # We need 11 - core_size other players
            rem_needed = 11 - core_size
            
            # Need at least 3 silvers
            for s_count in range(3, min(len(silvers) + 1, rem_needed + 1)):
                b_count = rem_needed - s_count
                if b_count > len(bronzes):
                    continue
                
                # Check ITA/BEL requirement
                for s_subset in itertools.combinations(silvers, s_count):
                    for b_subset in itertools.combinations(bronzes, b_count):
                        cand11 = list(core_subset) + list(s_subset) + list(b_subset)
                        
                        # Check ITA/BEL
                        has_ita_bel = any(p['nationId'] in (27, 7) for p in cand11)
                        if not has_ita_bel:
                            # Swap one gold/bronze for an ITA/BEL player (e.g. Ramazani 76 BEL or Audero 79 ITA)
                            continue
                            
                        # Check clubs >= 3
                        clubs_count = len(set(p['teamId'] for p in cand11))
                        if clubs_count < 3:
                            continue
                            
                        sc = sum(score_player(p) for p in cand11)
                        if sc >= min_score:
                            continue
                            
                        # Quick chem check: place core_subset in valid slots
                        # Backtrack placement
                        used_s = set()
                        assigned = []
                        
                        # Match core subset to valid slots
                        can_assign = True
                        for cp in core_subset:
                            v_slots = [s for s in range(11) if s not in used_s and can_play(cp, SLOT_POS[s])]
                            if v_slots:
                                s = v_slots[0]
                                used_s.add(s)
                                assigned.append((cp, s))
                            else:
                                can_assign = False
                                break
                        if not can_assign:
                            continue
                            
                        # Check silvers in-position if possible
                        for sp in s_subset:
                            v_slots = [s for s in range(11) if s not in used_s and can_play(sp, SLOT_POS[s])]
                            if v_slots:
                                s = v_slots[0]
                                used_s.add(s)
                                assigned.append((sp, s))
                                
                        # Fill remaining slots with remaining players
                        assigned_ids = set(p['id'] for p, _ in assigned)
                        unassigned = [p for p in cand11 if p['id'] not in assigned_ids]
                        empty_slots = [s for s in range(11) if s not in used_s]
                        
                        full_assign = list(assigned) + list(zip(unassigned, empty_slots))
                        chem = calc_chem(full_assign)
                        if chem >= 14:
                            min_score = sc
                            b_c = sum(1 for p in cand11 if p['rating'] < 65)
                            s_c = sum(1 for p in cand11 if 65 <= p['rating'] < 75)
                            g_c = sum(1 for p in cand11 if p['rating'] >= 75)
                            best_solution = (full_assign, chem, b_c, s_c, g_c, sc)
                            print(f"Found solution: chem={chem}, bronzes={b_c}, silvers={s_c}, golds={g_c}, score={sc}")

# Also check with ITA/BEL player included explicitly
if not best_solution:
    print("Testing with ITA/BEL explicit...")
    ita_bel_players = [p for p in eligible_players if p['nationId'] in (27, 7)]
    print(f"ITA/BEL players: {[p['name'] + ' (' + str(p['rating']) + ')' for p in ita_bel_players]}")

    for ib in ita_bel_players:
        for core_team in linking_clubs:
            core_players = [p for p in golds if p['teamId'] == core_team and p['id'] != ib['id']]
            for core_size in range(4, min(len(core_players) + 1, 6)):
                for core_subset in itertools.combinations(core_players, core_size):
                    rem_needed = 11 - core_size - 1 # -1 for ib
                    for s_count in range(3, min(len(silvers) + 1, rem_needed + 1)):
                        b_count = rem_needed - s_count
                        if b_count > len(bronzes) or b_count < 0:
                            continue
                        for s_subset in itertools.combinations(silvers, s_count):
                            for b_subset in itertools.combinations(bronzes, b_count):
                                cand11 = list(core_subset) + [ib] + list(s_subset) + list(b_subset)
                                if len(set(p['teamId'] for p in cand11)) < 3:
                                    continue
                                sc = sum(score_player(p) for p in cand11)
                                if sc >= min_score:
                                    continue
                                
                                # Match slots
                                used_s = set()
                                assigned = []
                                can_assign = True
                                for cp in list(core_subset) + [ib]:
                                    v_slots = [s for s in range(11) if s not in used_s and can_play(cp, SLOT_POS[s])]
                                    if v_slots:
                                        s = v_slots[0]
                                        used_s.add(s)
                                        assigned.append((cp, s))
                                for sp in s_subset:
                                    v_slots = [s for s in range(11) if s not in used_s and can_play(sp, SLOT_POS[s])]
                                    if v_slots:
                                        s = v_slots[0]
                                        used_s.add(s)
                                        assigned.append((sp, s))
                                assigned_ids = set(p['id'] for p, _ in assigned)
                                unassigned = [p for p in cand11 if p['id'] not in assigned_ids]
                                empty_slots = [s for s in range(11) if s not in used_s]
                                full_assign = list(assigned) + list(zip(unassigned, empty_slots))
                                chem = calc_chem(full_assign)
                                if chem >= 14:
                                    min_score = sc
                                    b_c = sum(1 for p in cand11 if p['rating'] < 65)
                                    s_c = sum(1 for p in cand11 if 65 <= p['rating'] < 75)
                                    g_c = sum(1 for p in cand11 if p['rating'] >= 75)
                                    best_solution = (full_assign, chem, b_c, s_c, g_c, sc)
                                    print(f"Found solution: chem={chem}, bronzes={b_c}, silvers={s_c}, golds={g_c}, score={sc}")

if best_solution:
    assign, chem, b_c, s_c, g_c, sc = best_solution
    assign.sort(key=lambda x: x[1])
    print("\n--- BEST LINEUP FOR ITALY V BELGIUM ---")
    print(f"Total Chem: {chem}, Bronzes: {b_c}, Silvers: {s_c}, Golds: {g_c}")
    for p, s in assign:
        ok = can_play(p, SLOT_POS[s])
        print(f"Slot {s} ({['GK','RB','RCB','LCB','LB','RM','CM','CM','LM','ST','ST'][s]}): {p['name']} ({p['rating']} {p['quality']}) inPos={ok} (Nat: {p['nationId']}, Team: {p['teamId']})")
    with open('data/italy_v_belgium_squad.json', 'w', encoding='utf-8') as f:
        json.dump({
            'chem': chem,
            'players': [{'slot': s, 'id': p['id'], 'name': p['name'], 'rating': p['rating'], 'quality': p['quality'], 'inPos': can_play(p, SLOT_POS[s])} for p, s in assign]
        }, f, indent=2)
else:
    print("No solution found in club!")
