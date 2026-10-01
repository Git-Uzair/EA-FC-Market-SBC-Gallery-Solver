import json
from collections import defaultdict
import itertools

with open('data/available_club_players.json', 'r', encoding='utf-8') as f:
    players = json.load(f)

used_1 = {'Ramazani', 'Livramento', 'Vilariño', 'McKenzie', 'Muñoz', 'Murphy', 'Touré', 'Boade', 'Barnes', 'Betfort', 'Navarro'}
used_2 = {'Audero', 'Kang In Lee', 'Yeray', 'Lo Celso', 'Concei', 'Williams', 'Jauregizar', 'Puado', 'Soler', 'Hernández', 'Mikautadze'}
used = used_1.union(used_2)

avail = [p for p in players if not any(u.lower() in p['name'].lower() for u in used) and p['rating'] >= 65 and p['rating'] <= 82]

# Formation for Netherlands v Germany (5-3-2 or 3-5-2):
# 0: GK (0)
# 1: RB (3)
# 2: CB (5)
# 3: CB (5)
# 4: CB (5)
# 5: LB (7)
# 6: CDM (10)
# 7: CM (14)
# 8: CM (14)
# 9: ST (25)
# 10: ST (25)
SLOT_POS = [0, 3, 5, 5, 5, 7, 10, 14, 14, 25, 25]

def can_play(p, target_pos):
    return target_pos in p['possiblePos']

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

# Requirements for Netherlands v Germany:
# 1. Netherlands (34) OR Germany (21): Min 2
# 2. Players from same Club: Max 2
# 3. Players from same League: Min 4
# 4. Gold: Min 2
# 5. Min Silver
# 6. Total Chemistry: Min 22

# Let's search candidates from Bundesliga (19) + German/Dutch players
buli = [p for p in avail if p['leagueId'] == 19]
print(f"Bundesliga pool: {len(buli)}")

# We can also use players from other leagues (e.g. Silvers or low golds) to reach 11
silvers = [p for p in avail if p['rating'] < 75]
print(f"Silvers available: {len(silvers)}: {[p['name'] for p in silvers]}")

# If we have 8-10 from Bundesliga and 1-3 silvers/low golds
other_pool = [p for p in avail if p['leagueId'] != 19]
other_pool.sort(key=lambda p: p['rating'])

best_sol = None
min_score = float('inf')

# Test combinations of 8-10 Bundesliga + remaining from other_pool
for buli_count in range(10, 7, -1):
    for buli_subset in itertools.combinations(buli, buli_count):
        # Check max 2 per club in buli_subset
        c_counts = defaultdict(int)
        for p in buli_subset:
            c_counts[p['teamId']] += 1
        if any(cnt > 2 for cnt in c_counts.values()):
            continue
            
        rem_needed = 11 - buli_count
        for other_subset in itertools.combinations(other_pool[:10], rem_needed):
            cand11 = list(buli_subset) + list(other_subset)
            
            # Check max 2 per club across all 11
            all_c_counts = defaultdict(int)
            for p in cand11:
                all_c_counts[p['teamId']] += 1
            if any(cnt > 2 for cnt in all_c_counts.values()):
                continue
                
            # Check Netherlands / Germany >= 2
            ger_ned_cnt = sum(1 for p in cand11 if p['nationId'] in (34, 21))
            if ger_ned_cnt < 2:
                continue
                
            sc = sum(p['rating'] for p in cand11)
            if sc >= min_score:
                continue
                
            # Match to slots 0..10
            used_s = set()
            assigned = []
            # In-position matching
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
            if chem >= 22:
                min_score = sc
                best_sol = (full_assign, chem, sc)
                print(f"Found Bundesliga solution: chem={chem}, r_sum={sc}, avgR={sc/11:.1f}, maxR={max(p['rating'] for p in cand11)}")

if best_sol:
    assign, chem, sc = best_sol
    assign.sort(key=lambda x: x[1])
    print("\n--- BEST LINEUP FOR NETHERLANDS V GERMANY ---")
    print(f"Total Chem: {chem}, Avg Rating: {sc/11:.1f}")
    for p, s in assign:
        ok = can_play(p, SLOT_POS[s])
        print(f"Slot {s} ({['GK','RB','CB','CB','CB','LB','CDM','CM','CM','ST','ST'][s]}): {p['name']} ({p['rating']} {p['quality']}) inPos={ok} (Nat: {p['nationId']}, Team: {p['teamId']}, Lg: {p['leagueId']})")
    with open('data/netherlands_v_germany_squad.json', 'w', encoding='utf-8') as f:
        json.dump({
            'chem': chem,
            'players': [{'slot': s, 'id': p['id'], 'name': p['name'], 'rating': p['rating'], 'quality': p['quality'], 'inPos': can_play(p, SLOT_POS[s])} for p, s in assign]
        }, f, indent=2)
