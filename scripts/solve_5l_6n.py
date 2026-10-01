import json
from collections import defaultdict

with open('data/current_club_players.json', 'r', encoding='utf-8') as f:
    players = json.load(f)

# Pool: Gold cards rating between 78 and 85
golds = [p for p in players if p['quality'] == 'Gold' and 78 <= p['rating'] <= 85]
print(f"Pool size: {len(golds)}")

# Formation: 3-5-2
# 0: GK (0)
# 1: CB (5)
# 2: CB (5)
# 3: CB (5)
# 4: CDM (10)
# 5: RM (12)
# 6: CM (14)
# 7: CM (14)
# 8: LM (16)
# 9: ST (25)
# 10: ST (25)
SLOT_POS = [0, 5, 5, 5, 10, 12, 14, 14, 16, 25, 25]

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

# For each slot, find eligible players
slot_cands = [[] for _ in range(11)]
for p in golds:
    for s in range(11):
        if can_play(p, SLOT_POS[s]):
            slot_cands[s].append(p)

for s in range(11):
    print(f"Slot {s} ({['GK','CB','CB','CB','CDM','RM','CM','CM','LM','ST','ST'][s]}): {len(slot_cands[s])} candidates")

best_sol: tuple | None = None
min_r = 99999

used_p = set()
current = [None] * 11

def solve(s_idx, lg_counts, nat_counts, club_counts, cur_rating_sum):
    global best_sol, min_r
    if best_sol is not None:
        return
        
    if len(lg_counts) > 5 or len(nat_counts) > 6:
        return
    if any(v > 2 for v in club_counts.values()):
        return
        
    # Remaining slots check
    rem_slots = 11 - s_idx
    # If remaining slots is less than needed to reach 5 leagues or 6 nations
    if len(lg_counts) + rem_slots < 5:
        return
    if len(nat_counts) + rem_slots < 6:
        return
        
    if s_idx == 11:
        if len(lg_counts) == 5 and len(nat_counts) == 6:
            if cur_rating_sum / 11.0 >= 81.0:
                chem = calc_chem(list(zip(current, range(11))))
                if chem >= 25:
                    best_sol = (list(current), chem, cur_rating_sum)
                    print(f"FOUND: chem={chem}, avgR={cur_rating_sum/11:.1f}")
        return

    cands = slot_cands[s_idx]
    
    # Sort candidates to prioritize linking: club, nation, league
    def cand_priority(p):
        score = 0
        if p['teamId'] in club_counts: score -= 3 # Club link!
        if p['leagueId'] in lg_counts: score -= 2 # League link!
        if p['nationId'] in nat_counts: score -= 2 # Nation link!
        return score, p['rating']
        
    sorted_cands = sorted(cands, key=cand_priority)

    for p in sorted_cands:
        if p['id'] in used_p:
            continue
            
        lg = p['leagueId']
        nat = p['nationId']
        team = p['teamId']
        
        if club_counts[team] >= 2:
            continue
            
        new_lg = lg not in lg_counts and len(lg_counts) >= 5
        new_nat = nat not in nat_counts and len(nat_counts) >= 6
        if new_lg or new_nat:
            continue
            
        used_p.add(p['id'])
        current[s_idx] = p
        lg_counts[lg] += 1
        nat_counts[nat] += 1
        club_counts[team] += 1
        
        solve(s_idx + 1, lg_counts, nat_counts, club_counts, cur_rating_sum + p['rating'])
        
        club_counts[team] -= 1
        if club_counts[team] == 0: del club_counts[team]
        lg_counts[lg] -= 1
        if lg_counts[lg] == 0: del lg_counts[lg]
        nat_counts[nat] -= 1
        if nat_counts[nat] == 0: del nat_counts[nat]
        used_p.remove(p['id'])
        current[s_idx] = None
        
        if best_sol is not None:
            return

print("Searching...")
solve(0, defaultdict(int), defaultdict(int), defaultdict(int), 0)

if best_sol is not None:
    squad, chem, r_sum = best_sol
    print(f"\n--- SUCCESS ---")
    print(f"Chem: {chem}, Avg Rating: {r_sum/11:.1f}")
    lgs = set(p['leagueId'] for p in squad)
    nats = set(p['nationId'] for p in squad)
    print(f"Leagues ({len(lgs)}): {lgs}")
    print(f"Nations ({len(nats)}): {nats}")
    for idx, p in enumerate(squad):
        print(f"Slot {idx} ({['GK','CB','CB','CB','CDM','RM','CM','CM','LM','ST','ST'][idx]}): {ascii(p['name'])} ({p['rating']}) (Nat: {p['nationId']}, Team: {p['teamId']}, Lg: {p['leagueId']})")
    with open('data/5l_6n_solution.json', 'w', encoding='utf-8') as f:
        json.dump({
            'chem': chem,
            'players': [{'slot': idx, 'id': p['id'], 'name': p['name'], 'rating': p['rating']} for idx, p in enumerate(squad)]
        }, f, indent=2)
else:
    print("No valid squad found in current club inventory!")
