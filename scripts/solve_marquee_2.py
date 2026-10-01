import json
from collections import defaultdict
import itertools

with open('data/available_club_players.json', 'r', encoding='utf-8') as f:
    players = json.load(f)

# Exclude players used in Challenge 1 (Italy v Belgium)
used_in_c1 = {
    "Ramazani", "Livramento", "Vilariño", "McKenzie", "Muñoz",
    "Murphy", "Touré", "Boade", "Barnes", "Betfort", "Navarro"
}

available = []
for p in players:
    if any(u.lower() in p['name'].lower() for u in used_in_c1):
        continue
    # Challenge 2 requires Min. Silver (no bronzes!)
    if p['rating'] >= 65 and p['rating'] <= 81:
        available.append(p)

print(f"Available for Challenge 2: {len(available)} players")
silvers = [p for p in available if p['rating'] < 75]
golds = [p for p in available if p['rating'] >= 75]
print(f"Silvers available: {len(silvers)}: {[p['name'] + ' (' + str(p['rating']) + ')' for p in silvers]}")

# Formation: 4-2-3-1
# 0: GK (0)
# 1: RB (3)
# 2: CB (5)
# 3: CB (5)
# 4: LB (7)
# 5: RM (12)
# 6: CM (14)
# 7: LM (16)
# 8: CAM (18)
# 9: CAM (18)
# 10: ST (25)
SLOT_POS = [0, 3, 5, 5, 7, 12, 14, 16, 18, 18, 25]

def can_play(p, target_pos):
    return target_pos in p['possiblePos']

def score_player(p):
    if p['rating'] < 75:
        return 1000 + p['rating'] # Silver: 1070..1074
    else:
        return 10000 + p['rating'] * 100 # Gold: 17500..18100

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

# Requirements for Norway v Portugal:
# 1. Norway (36) OR Portugal (38): Min 1
# 2. Same Club: Min 3
# 3. Leagues: Max 5
# 4. Gold: Min 2
# 5. Min Silver
# 6. Total Chemistry: Min 18

# Clubs with >= 3 available players:
club_counts = defaultdict(list)
for p in available:
    club_counts[p['teamId']].append(p)

trios = [plist for plist in club_counts.values() if len(plist) >= 3]
print(f"Clubs with >= 3 players: {len(trios)}")

best_sol = None
min_score = float('inf')

for trio_pool in trios:
    for core3 in itertools.combinations(trio_pool, 3):
        rem_pool = [p for p in available if p['id'] not in set(x['id'] for x in core3)]
        
        # We want to use as many silvers as possible (up to 4)
        for s_take in range(len(silvers), -1, -1):
            s_cand = [s for s in silvers if s['id'] not in set(x['id'] for x in core3)][:s_take]
            g_needed = 11 - 3 - len(s_cand)
            if g_needed < 0:
                continue
            
            # Need at least 2 golds total
            total_golds = sum(1 for p in core3 if p['rating'] >= 75) + g_needed
            if total_golds < 2:
                continue
                
            g_cand_pool = [g for g in golds if g['id'] not in set(x['id'] for x in core3)]
            g_cand_pool.sort(key=lambda p: p['rating'])
            
            # We need to make sure Norway (36) or Portugal (38) is present
            has_np_in_core = any(p['nationId'] in (36, 38) for p in core3)
            
            # Try combinations of g_needed from top 15 low golds
            for g_subset in itertools.combinations(g_cand_pool[:15], g_needed):
                cand11 = list(core3) + s_cand + list(g_subset)
                
                # Check Norway / Portugal
                if not (has_np_in_core or any(p['nationId'] in (36, 38) for p in cand11)):
                    continue
                    
                # Check Leagues <= 5
                lgs = set(p['leagueId'] for p in cand11)
                if len(lgs) > 5:
                    continue
                    
                sc = sum(score_player(p) for p in cand11)
                if sc >= min_score:
                    continue
                    
                # Try placing into slots
                # Order players: in-position candidates first
                used_s = set()
                assigned = []
                for p in cand11:
                    v_slots = [s for s in range(11) if s not in used_s and can_play(p, SLOT_POS[s])]
                    if v_slots:
                        s = v_slots[0]
                        used_s.add(s)
                        assigned.append((p, s))
                        
                assigned_ids = set(p['id'] for p, _ in assigned)
                unassigned = [p for p in cand11 if p['id'] not in assigned_ids]
                empty_slots = [s for s in range(11) if s not in used_s]
                full_assign = list(assigned) + list(zip(unassigned, empty_slots))
                
                chem = calc_chem(full_assign)
                if chem >= 18:
                    min_score = sc
                    s_c = sum(1 for p in cand11 if p['rating'] < 75)
                    g_c = sum(1 for p in cand11 if p['rating'] >= 75)
                    best_sol = (full_assign, chem, s_c, g_c, sc)
                    print(f"Found Norway v Portugal solution: chem={chem}, silvers={s_c}, golds={g_c}, maxR={max(p['rating'] for p in cand11)}, score={sc}")

if best_sol:
    assign, chem, s_c, g_c, sc = best_sol
    assign.sort(key=lambda x: x[1])
    print("\n--- BEST LINEUP FOR NORWAY V PORTUGAL ---")
    print(f"Total Chem: {chem}, Silvers: {s_c}, Golds: {g_c}")
    for p, s in assign:
        ok = can_play(p, SLOT_POS[s])
        print(f"Slot {s} ({['GK','RB','CB','CB','LB','RM','CM','LM','CAM','CAM','ST'][s]}): {p['name']} ({p['rating']} {p['quality']}) inPos={ok} (Nat: {p['nationId']}, Team: {p['teamId']}, Lg: {p['leagueId']})")
    with open('data/norway_v_portugal_squad.json', 'w', encoding='utf-8') as f:
        json.dump({
            'chem': chem,
            'players': [{'slot': s, 'id': p['id'], 'name': p['name'], 'rating': p['rating'], 'quality': p['quality'], 'inPos': can_play(p, SLOT_POS[s])} for p, s in assign]
        }, f, indent=2)
else:
    print("No solution found in club!")
