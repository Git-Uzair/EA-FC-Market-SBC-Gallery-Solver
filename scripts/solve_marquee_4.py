import json
from collections import defaultdict
import itertools

with open('data/available_club_players.json', 'r', encoding='utf-8') as f:
    players = json.load(f)

used_1 = {'Ramazani', 'Livramento', 'Vilariño', 'McKenzie', 'Muñoz', 'Murphy', 'Touré', 'Boade', 'Barnes', 'Betfort', 'Navarro'}
used_2 = {'Audero', 'Kang In Lee', 'Yeray', 'Lo Celso', 'Concei', 'Williams', 'Jauregizar', 'Puado', 'Soler', 'Hernández', 'Mikautadze'}
used_3 = {'Backhaus', 'Doan', 'Tapsoba', 'Atuesta', 'Barth', 'Brown', 'Maza', 'Leweling', 'Schwäbe', 'Hollerbach', 'Carballo'}
used = used_1.union(used_2).union(used_3)

# Available for Challenge 4 (rating <= 82, min rating >= 75 or low rating if team rating >= 75)
avail = [p for p in players if not any(u.lower() in p['name'].lower() for u in used) and p['rating'] <= 82]
print(f"Available for Challenge 4: {len(avail)}")

# Formation: 5-2-1-2
# 0: GK (0)
# 1: RB (3)
# 2: CB (5)
# 3: CB (5)
# 4: CB (5)
# 5: LB (7)
# 6: CM (14)
# 7: CM (14)
# 8: CAM (18)
# 9: ST (25)
# 10: ST (25)
SLOT_POS = [0, 3, 5, 5, 5, 7, 14, 14, 18, 25, 25]

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

# Requirements for England v Spain:
# 1. England (14) OR Spain (45): Min 2
# 2. Same Country: Min 4 (e.g. 4+ Spanish or 4+ English)
# 3. Same Club: Max 3
# 4. Leagues: Max 5
# 5. Team Rating: Min 75
# 6. Total Chemistry: Min 26

# Let's search candidates focused around a primary league (e.g. Premier League (13), Serie A (31), or LaLiga (53))
# that have >= 4 English or Spanish players
leagues = [13, 31, 53, 2221, 350, 2216]

best_sol = None
min_rating_sum = 99999

for primary_lg in leagues:
    lg_players = [p for p in avail if p['leagueId'] == primary_lg]
    if len(lg_players) < 7:
        continue
    lg_players.sort(key=lambda p: p['rating'])
    print(f"Testing primary league {primary_lg} ({len(lg_players)} players)...")
    
    # We can take 7..11 from primary_lg and remaining from other leagues
    other_avail = [p for p in avail if p['leagueId'] != primary_lg]
    other_avail.sort(key=lambda p: p['rating'])
    
    for lg_count in range(min(len(lg_players), 11), 6, -1):
        for lg_subset in itertools.combinations(lg_players[:14], lg_count):
            # Check max 3 from same club in lg_subset
            c_cnt = defaultdict(int)
            for p in lg_subset: c_cnt[p['teamId']] += 1
            if any(cnt > 3 for cnt in c_cnt.values()):
                continue
                
            rem_needed = 11 - lg_count
            for other_subset in itertools.combinations(other_avail[:10], rem_needed):
                cand11 = list(lg_subset) + list(other_subset)
                
                # Check max 3 from same club across all 11
                all_c = defaultdict(int)
                for p in cand11: all_c[p['teamId']] += 1
                if any(cnt > 3 for cnt in all_c.values()):
                    continue
                    
                # Check same country >= 4
                all_n = defaultdict(int)
                for p in cand11: all_n[p['nationId']] += 1
                if not any(cnt >= 4 for cnt in all_n.values()):
                    continue
                    
                # Check England OR Spain >= 2
                es_cnt = sum(1 for p in cand11 if p['nationId'] in (14, 45))
                if es_cnt < 2:
                    continue
                    
                # Check leagues <= 5
                lgs = set(p['leagueId'] for p in cand11)
                if len(lgs) > 5:
                    continue
                    
                # Check team rating >= 75
                avg_r = sum(p['rating'] for p in cand11) / 11.0
                if avg_r < 75.0:
                    continue
                    
                r_sum = sum(p['rating'] for p in cand11)
                if r_sum >= min_rating_sum:
                    continue
                    
                # Match slots
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
                if chem >= 26:
                    min_rating_sum = r_sum
                    best_sol = (full_assign, chem, r_sum)
                    print(f"Found solution: chem={chem}, r_sum={r_sum}, avgR={avg_r:.1f}, maxR={max(p['rating'] for p in cand11)}")

if best_sol:
    assign, chem, r_sum = best_sol
    assign.sort(key=lambda x: x[1])
    print("\n--- BEST LINEUP FOR ENGLAND V SPAIN ---")
    print(f"Total Chem: {chem}, Avg Rating: {r_sum/11:.1f}")
    for p, s in assign:
        ok = can_play(p, SLOT_POS[s])
        print(f"Slot {s} ({['GK','RB','CB','CB','CB','LB','CM','CM','CAM','ST','ST'][s]}): {p['name']} ({p['rating']} {p['quality']}) inPos={ok} (Nat: {p['nationId']}, Team: {p['teamId']}, Lg: {p['leagueId']})")
    with open('data/england_v_spain_squad.json', 'w', encoding='utf-8') as f:
        json.dump({
            'chem': chem,
            'players': [{'slot': s, 'id': p['id'], 'name': p['name'], 'rating': p['rating'], 'quality': p['quality'], 'inPos': can_play(p, SLOT_POS[s])} for p, s in assign]
        }, f, indent=2)
else:
    print("No solution found in club!")
