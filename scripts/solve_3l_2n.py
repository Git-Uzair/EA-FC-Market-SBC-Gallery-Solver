import json
from collections import defaultdict
import itertools

with open('data/current_club_players.json', 'r', encoding='utf-8') as f:
    players = json.load(f)

# Only golds
golds = [p for p in players if p['quality'] == 'Gold' and p['rating'] <= 83]

# Formation: 3-4-3
# 0: GK (0)
# 1: CB (5)
# 2: CB (5)
# 3: CB (5)
# 4: RM (12)
# 5: CM (14)
# 6: CM (14)
# 7: LM (16)
# 8: RW (23)
# 9: ST (25)
# 10: LW (27)
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

# Nations with >= 5 players:
by_nat = defaultdict(list)
for p in golds:
    by_nat[p['nationId']].append(p)

viable_nats = [nid for nid, plist in by_nat.items() if len(plist) >= 5]
print(f"Viable nations: {viable_nats}")

# Matching helper
def match_squad(cand11):
    can_slots = []
    for p in cand11:
        can_slots.append([s for s in range(11) if can_play(p, SLOT_POS[s])])
    
    order = sorted(range(11), key=lambda i: len(can_slots[i]))
    max_c = 0
    best_a: list = []
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

best_sol = None
min_r_sum = 99999

# Test pairs of nations: Nation A (6 players) and Nation B (5 players)
for nA, nB in itertools.permutations(viable_nats, 2):
    poolA = by_nat[nA]
    poolB = by_nat[nB]
    if len(poolA) < 6 or len(poolB) < 5:
        continue
        
    poolA.sort(key=lambda p: p['rating'])
    poolB.sort(key=lambda p: p['rating'])
    
    # Try combinations of 6 from poolA and 5 from poolB
    for subA in itertools.combinations(poolA[:10], 6):
        for subB in itertools.combinations(poolB[:9], 5):
            cand11 = list(subA) + list(subB)
            
            # Check leagues in squad: EXACTLY 3
            lgs = set(p['leagueId'] for p in cand11)
            if len(lgs) != 3:
                continue
                
            # Check max 6 per league
            lg_cnt = defaultdict(int)
            for p in cand11:
                lg_cnt[p['leagueId']] += 1
            if any(cnt > 6 for cnt in lg_cnt.values()):
                continue
                
            r_sum = sum(p['rating'] for p in cand11)
            if r_sum >= min_r_sum:
                continue
                
            c, a = match_squad(cand11)
            if c >= 30:
                min_r_sum = r_sum
                best_sol = (a, c, r_sum, nA, nB, lgs)
                print(f"Found solution: chem={c}, r_sum={r_sum}, avgR={r_sum/11:.1f}, nA={nA}, nB={nB}, leagues={lgs}")

if best_sol:
    a, c, r_sum, nA, nB, lgs = best_sol
    a.sort(key=lambda x: x[1])
    print(f"\n--- BEST SQUAD FOR 3 LEAGUES & 2 NATIONS ---")
    print(f"Chem: {c}, Avg Rating: {r_sum/11:.1f}, Nations: {nA}, {nB}, Leagues: {lgs}")
    for p, s in a:
        ok = can_play(p, SLOT_POS[s])
        print(f"Slot {s} ({['GK','CB','CB','CB','RM','CM','CM','LM','RW','ST','LW'][s]}): {p['name']} ({p['rating']} {p['quality']}) inPos={ok} (Nat: {p['nationId']}, Team: {p['teamId']}, Lg: {p['leagueId']})")
    with open('data/3_leagues_2_nations_squad.json', 'w', encoding='utf-8') as f:
        json.dump({
            'chem': c,
            'nations': [nA, nB],
            'leagues': list(lgs),
            'players': [{'slot': s, 'id': p['id'], 'name': p['name'], 'rating': p['rating'], 'quality': p['quality'], 'inPos': can_play(p, SLOT_POS[s])} for p, s in a]
        }, f, indent=2)
else:
    print("No valid squad found in club with current players.")
