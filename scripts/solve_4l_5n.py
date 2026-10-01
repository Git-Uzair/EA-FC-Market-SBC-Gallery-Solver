import json
from collections import defaultdict
import itertools

with open('data/current_club_players.json', 'r', encoding='utf-8') as f:
    players = json.load(f)

# Candidate pool: rating between 75 and 84
pool = [p for p in players if p['rating'] >= 75 and p['rating'] <= 84]
print(f"Pool size: {len(pool)}")

# Formation: 4-1-4-1
# 0: GK (0)
# 1: RB (3)
# 2: CB (5)
# 3: CB (5)
# 4: LB (7)
# 5: CDM (10)
# 6: RM (12)
# 7: CM (14)
# 8: CM (14)
# 9: LM (16)
# 10: ST (25)
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

# GKs in pool
gks = [p for p in pool if 0 in p['possiblePos']]
print(f"GKs: {len(gks)}")

# Fast bipartite matching
def match_squad(cand11):
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
        if max_c >= 25:
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
                if max_c >= 25:
                    return
        backtrack(idx + 1)

    backtrack(0)
    return max_c, best_a

# Group pool by league
by_lg = defaultdict(list)
for p in pool:
    by_lg[p['leagueId']].append(p)

viable_lgs = [lg for lg, plist in by_lg.items() if len(plist) >= 2]
print(f"Viable leagues: {len(viable_lgs)}")

# Try 4-league combinations
best_sol = None
min_r_sum = 99999

# Sort viable leagues by player count descending
viable_lgs.sort(key=lambda lg: len(by_lg[lg]), reverse=True)

# Test top 4-league combinations
for chosen_lgs in itertools.combinations(viable_lgs[:10], 4):
    subpool = [p for p in pool if p['leagueId'] in chosen_lgs]
    sub_gks = [p for p in subpool if 0 in p['possiblePos']]
    if not sub_gks:
        continue
        
    # Group subpool by league and nation
    l_counts = {lg: len([p for p in subpool if p['leagueId'] == lg]) for lg in chosen_lgs}
    # Check if we can pick partition (e.g. 4, 3, 2, 2 or 3, 3, 3, 2)
    # Total must be 11, each <= 4, exactly 4 leagues
    valid_partitions = []
    for p0 in range(1, 5):
        for p1 in range(1, 5):
            for p2 in range(1, 5):
                p3 = 11 - p0 - p1 - p2
                if 1 <= p3 <= 4:
                    valid_partitions.append((p0, p1, p2, p3))
                    
    # Try a targeted search:
    # Pick players league by league
    lg_list = list(chosen_lgs)
    
    # Quick filter: do we have positions?
    for part in valid_partitions:
        # Check if each league has enough players
        if any(l_counts[lg_list[i]] < part[i] for i in range(4)):
            continue
            
        # Select candidates from each league sorted by rating
        l_cands = [sorted([p for p in subpool if p['leagueId'] == lg_list[i]], key=lambda x: x['rating']) for i in range(4)]
        
        # Take combinations from each league
        c0_iter = itertools.combinations(l_cands[0][:part[0] + 2], part[0])
        for c0 in c0_iter:
            c1_iter = itertools.combinations(l_cands[1][:part[1] + 2], part[1])
            for c1 in c1_iter:
                c2_iter = itertools.combinations(l_cands[2][:part[2] + 2], part[2])
                for c2 in c2_iter:
                    c3_iter = itertools.combinations(l_cands[3][:part[3] + 2], part[3])
                    for c3 in c3_iter:
                        cand11 = list(c0) + list(c1) + list(c2) + list(c3)
                        
                        # Must have at least 1 GK
                        if not any(0 in p['possiblePos'] for p in cand11):
                            continue
                            
                        # Nationalities: EXACTLY 5
                        nats = set(p['nationId'] for p in cand11)
                        if len(nats) != 5:
                            continue
                            
                        # Max 3 per nation
                        n_cnt = defaultdict(int)
                        for p in cand11: n_cnt[p['nationId']] += 1
                        if any(cnt > 3 for cnt in n_cnt.values()):
                            continue
                            
                        # Rating >= 78
                        r_sum = sum(p['rating'] for p in cand11)
                        if r_sum / 11.0 < 78.0 or r_sum >= min_r_sum:
                            continue
                            
                        c, a = match_squad(cand11)
                        if c >= 25:
                            min_r_sum = r_sum
                            best_sol = (a, c, r_sum, chosen_lgs, nats)
                            print(f"FOUND: chem={c}, avgR={r_sum/11:.1f}, maxR={max(p['rating'] for p in cand11)}, lgs={chosen_lgs}, nats={nats}")
                            break
                    if best_sol and best_sol[1] >= 25: break
                if best_sol and best_sol[1] >= 25: break
            if best_sol and best_sol[1] >= 25: break
        if best_sol and best_sol[1] >= 25: break
    if best_sol and best_sol[1] >= 25: break

if best_sol:
    a, c, r_sum, lgs, nats = best_sol
    a.sort(key=lambda x: x[1])
    print(f"\n--- BEST SQUAD FOR 4 LEAGUES & 5 NATIONS ---")
    print(f"Chem: {c}, Avg Rating: {r_sum/11:.1f}, Leagues: {lgs}, Nations: {nats}")
    for p, s in a:
        ok = can_play(p, SLOT_POS[s])
        print(f"Slot {s} ({['GK','RB','CB','CB','LB','CDM','RM','CM','CM','LM','ST'][s]}): {p['name']} ({p['rating']}) inPos={ok} (Nat: {p['nationId']}, Team: {p['teamId']}, Lg: {p['leagueId']})")
    with open('data/4_leagues_5_nations_squad.json', 'w', encoding='utf-8') as f:
        json.dump({
            'chem': c,
            'leagues': list(lgs),
            'nations': list(nats),
            'players': [{'slot': s, 'id': p['id'], 'name': p['name'], 'rating': p['rating'], 'quality': p['quality'], 'inPos': can_play(p, SLOT_POS[s])} for p, s in a]
        }, f, indent=2)
else:
    print("No valid squad found in club.")
