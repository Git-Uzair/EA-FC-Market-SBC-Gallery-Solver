import json
from collections import defaultdict
import itertools

with open('data/current_club_players.json', 'r', encoding='utf-8') as f:
    players = json.load(f)

# Pool: Gold cards rating between 76 and 84
golds = [p for p in players if p['quality'] == 'Gold' and 76 <= p['rating'] <= 84]

SLOT_POS = [0, 3, 5, 5, 7, 10, 12, 14, 14, 16, 25]

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

# For each slot, find which players can play in it
slot_cands = [[] for _ in range(11)]
for p in golds:
    for s in range(11):
        if can_play(p, SLOT_POS[s]):
            slot_cands[s].append(p)

for s in range(11):
    print(f"Slot {s} ({['GK','RB','CB','CB','LB','CDM','RM','CM','CM','LM','ST'][s]}): {len(slot_cands[s])} candidates")

# Solvers:
# Find a squad of 11 players (slots 0..10) such that:
# 1. Exactly 4 leagues
# 2. Exactly 5 nations
# 3. Max 4 per league
# 4. Max 3 per nation
# 5. Rating >= 78
# 6. Chem >= 25

# Notice GK is slot 0: only 14 candidates.
# Let's search with recursion on slots
best_sol: tuple | None = None
min_r = 99999

used_p = set()
current = [None] * 11

def solve(s_idx, lg_counts, nat_counts, cur_rating_sum):
    global best_sol, min_r
    if best_sol is not None:
        return
        
    # Prune leagues > 4 or nations > 5
    if len(lg_counts) > 4 or len(nat_counts) > 5:
        return
    # Prune max league count > 4 or max nation count > 3
    if any(v > 4 for v in lg_counts.values()) or any(v > 3 for v in nat_counts.values()):
        return
        
    if s_idx == 11:
        if len(lg_counts) == 4 and len(nat_counts) == 5:
            if cur_rating_sum / 11.0 >= 78.0:
                chem = calc_chem(list(zip(current, range(11))))
                if chem >= 25:
                    best_sol = (list(current), chem, cur_rating_sum)
                    print(f"FOUND: chem={chem}, avgR={cur_rating_sum/11:.1f}")
        return

    # To be fast, sort candidates in this slot
    # Prioritize candidates from leagues/nations already partially filled
    cands = slot_cands[s_idx]
    
    # Sort candidates
    def cand_priority(p):
        score = 0
        if p['leagueId'] in lg_counts: score -= 2
        if p['nationId'] in nat_counts: score -= 2
        return score, p['rating']
        
    sorted_cands = sorted(cands, key=cand_priority)

    for p in sorted_cands:
        if p['id'] in used_p:
            continue
            
        lg = p['leagueId']
        nat = p['nationId']
        
        # Check if adding this player exceeds 4 leagues or 5 nations
        new_lg = lg not in lg_counts and len(lg_counts) >= 4
        new_nat = nat not in nat_counts and len(nat_counts) >= 5
        if new_lg or new_nat:
            continue
            
        if lg_counts[lg] >= 4 or nat_counts[nat] >= 3:
            continue
            
        used_p.add(p['id'])
        current[s_idx] = p
        lg_counts[lg] += 1
        nat_counts[nat] += 1
        
        solve(s_idx + 1, lg_counts, nat_counts, cur_rating_sum + p['rating'])
        
        lg_counts[lg] -= 1
        if lg_counts[lg] == 0: del lg_counts[lg]
        nat_counts[nat] -= 1
        if nat_counts[nat] == 0: del nat_counts[nat]
        used_p.remove(p['id'])
        current[s_idx] = None
        
        if best_sol is not None:
            return

print("Searching...")
solve(0, defaultdict(int), defaultdict(int), 0)

if best_sol is not None:
    squad, chem, r_sum = best_sol
    print(f"\n--- SUCCESS ---")
    print(f"Chem: {chem}, Avg Rating: {r_sum/11:.1f}")
    lgs = set(p['leagueId'] for p in squad)
    nats = set(p['nationId'] for p in squad)
    print(f"Leagues ({len(lgs)}): {lgs}")
    print(f"Nations ({len(nats)}): {nats}")
    for idx, p in enumerate(squad):
        print(f"Slot {idx} ({['GK','RB','CB','CB','LB','CDM','RM','CM','CM','LM','ST'][idx]}): {ascii(p['name'])} ({p['rating']}) (Nat: {p['nationId']}, Team: {p['teamId']}, Lg: {p['leagueId']})")
    with open('data/4l_5n_solution.json', 'w', encoding='utf-8') as f:
        json.dump({
            'chem': chem,
            'players': [{'slot': idx, 'id': p['id'], 'name': p['name'], 'rating': p['rating']} for idx, p in enumerate(squad)]
        }, f, indent=2)
else:
    print("No valid squad found in current club inventory!")
