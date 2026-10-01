import json
from collections import defaultdict
import itertools

with open('data/current_club_players.json', 'r', encoding='utf-8') as f:
    players = json.load(f)

# Only golds up to 83 (or 84 if needed)
golds = [p for p in players if p['quality'] == 'Gold' and p['rating'] <= 84]

SLOT_POS = [0, 5, 5, 5, 12, 14, 14, 16, 23, 25, 27]

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

# Find all GKs
gks = [p for p in golds if 0 in p['possiblePos']]
print(f"GKs found: {len(gks)}")

# Group golds by nation
by_nat = defaultdict(list)
for p in golds:
    by_nat[p['nationId']].append(p)

# We want 6 from Nation A, 5 from Nation B (or 5 from A, 6 from B)
# Exactly 3 leagues, max 6 per league
# Rating sum minimal

best_sol = None
min_score = float('inf')

def solve_squad_assignment(cand11):
    # cand11 is a set of 11 players
    # Find matching to slots 0..10
    can_slots = []
    for p in cand11:
        can_slots.append([s for s in range(11) if can_play(p, SLOT_POS[s])])
    
    order = sorted(range(11), key=lambda i: len(can_slots[i]))
    max_c = 0
    best_a = []
    used_s = set()
    slot_map = {}
    
    def backtrack(idx):
        nonlocal max_c, best_a
        if max_c >= 30:
            return
        if idx == 11:
            cur = []
            empty_s = [s for s in range(11) if s not in used_s]
            for s, p_i in slot_map.items():
                cur.append((cand11[p_i], s))
            unassigned_p = [cand11[i] for i in range(11) if i not in slot_map.values()]
            for p, s in zip(unassigned_p, empty_s):
                cur.append((p, s))
            c = calc_chem(cur)
            if c > max_c:
                max_c = c
                best_a = cur
            return

        p_i = order[idx]
        for s in can_slots[p_i]:
            if s not in used_s:
                used_s.add(s)
                slot_map[s] = p_i
                backtrack(idx + 1)
                del slot_map[s]
                used_s.remove(s)
                if max_c >= 30:
                    return
        backtrack(idx + 1)

    backtrack(0)
    return max_c, best_a

# Loop through each GK as the anchor
for gk in gks:
    nA = gk['nationId']
    lg_gk = gk['leagueId']
    
    # Try all other nations as nB
    for nB, listB in by_nat.items():
        if nB == nA or len(listB) < 5:
            continue
            
        listA = [p for p in by_nat[nA] if p['id'] != gk['id']] # remaining of nA
        
        # We need either:
        # Case 1: 6 from nA (gk + 5 others), 5 from nB
        # Case 2: 5 from nA (gk + 4 others), 6 from nB
        cases = []
        if len(listA) >= 5 and len(listB) >= 5:
            cases.append((5, 5)) # 5 from listA (total 6 nA), 5 from listB
        if len(listA) >= 4 and len(listB) >= 6:
            cases.append((4, 6)) # 4 from listA (total 5 nA), 6 from listB
            
        for a_take, b_take in cases:
            # All available leagues among gk, listA, listB
            all_lgs = set([lg_gk] + [p['leagueId'] for p in listA] + [p['leagueId'] for p in listB])
            # We need exactly 3 leagues, one of which MUST be lg_gk
            other_lgs = [l for l in all_lgs if l != lg_gk]
            if len(other_lgs) < 2:
                continue
                
            for l2, l3 in itertools.combinations(other_lgs, 2):
                chosen_lgs = {lg_gk, l2, l3}
                
                # Filter candidates to these 3 leagues
                candA = [p for p in listA if p['leagueId'] in chosen_lgs]
                candB = [p for p in listB if p['leagueId'] in chosen_lgs]
                if len(candA) < a_take or len(candB) < b_take:
                    continue
                    
                candA.sort(key=lambda p: p['rating'])
                candB.sort(key=lambda p: p['rating'])
                
                # Try small number of low-rating combinations
                for subA in itertools.combinations(candA[:a_take + 3], a_take):
                    for subB in itertools.combinations(candB[:b_take + 3], b_take):
                        cand11 = [gk] + list(subA) + list(subB)
                        
                        # Check leagues: exactly 3
                        if set(p['leagueId'] for p in cand11) != chosen_lgs:
                            continue
                            
                        # Check max 6 per league
                        lc = defaultdict(int)
                        for p in cand11: lc[p['leagueId']] += 1
                        if any(cnt > 6 for cnt in lc.values()):
                            continue
                            
                        sc = sum(p['rating'] for p in cand11)
                        if sc >= min_score:
                            continue
                            
                        c, a = solve_squad_assignment(cand11)
                        if c >= 30:
                            min_score = sc
                            best_sol = (a, c, sc, nA, nB, chosen_lgs)
                            print(f"FOUND: chem={c}, avgR={sc/11:.1f}, maxR={max(p['rating'] for p in cand11)}, nA={nA}, nB={nB}, lgs={chosen_lgs}")
                            break

if best_sol:
    a, c, sc, nA, nB, lgs = best_sol
    a.sort(key=lambda x: x[1])
    print("\n--- FINAL BEST SQUAD FOR 3 LEAGUES & 2 NATIONS ---")
    print(f"Chem: {c}, Avg Rating: {sc/11:.1f}, Nations: {nA}, {nB}, Leagues: {lgs}")
    for p, s in a:
        ok = can_play(p, SLOT_POS[s])
        print(f"Slot {s} ({['GK','CB','CB','CB','RM','CM','CM','LM','RW','ST','LW'][s]}): {p['name']} ({p['rating']}) inPos={ok} (Nat: {p['nationId']}, Team: {p['teamId']}, Lg: {p['leagueId']})")
    with open('data/3_leagues_2_nations_squad.json', 'w', encoding='utf-8') as f:
        json.dump({
            'chem': c,
            'nations': [nA, nB],
            'leagues': list(lgs),
            'players': [{'slot': s, 'id': p['id'], 'name': p['name'], 'rating': p['rating'], 'quality': p['quality'], 'inPos': can_play(p, SLOT_POS[s])} for p, s in a]
        }, f, indent=2)
else:
    print("No valid squad found in club with current players.")
