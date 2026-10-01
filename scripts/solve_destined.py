import json
import itertools
from collections import defaultdict

with open('data/unlocked_players.json', 'r', encoding='utf-8') as f:
    players = json.load(f)

# Formation slots: posId
# 0: GK (0)
# 1: RB (3)
# 2: RCB (5)
# 3: LCB (5)
# 4: LB (7)
# 5: RM (12)
# 6: CM (14)
# 7: LM (16)
# 8: RAM (18)
# 9: LAM (18)
# 10: ST (25)
SLOT_POS = [0, 3, 5, 5, 7, 12, 14, 16, 18, 18, 25]

def can_play(p, target_pos):
    return target_pos in p['possiblePos']

def score_player(p):
    if p['rating'] < 65:
        return p['rating'] # Bronze: 50..64
    elif p['rating'] < 75:
        return 1000 + p['rating'] # Silver: 1070..1074
    else:
        return 10000 + p['rating'] * 100 # Gold: 17500..18500

# Group players by teamId
club_map = defaultdict(list)
for p in players:
    club_map[p['teamId']].append(p)

for t, plist in club_map.items():
    plist.sort(key=score_player)

# Sort clubs by minimum score
all_clubs = sorted(club_map.keys(), key=lambda t: (score_player(club_map[t][0]), -len(club_map[t])))

print(f"Total clubs: {len(all_clubs)}")

# Helper to compute chemistry given a squad assignment: list of (player, slot_idx)
def calc_chem(assignment):
    # assignment: list of 11 (player, slot_idx)
    # Check inPos
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
        # club
        cc = club_cnt[p['teamId']]
        if cc >= 7: c += 3
        elif cc >= 4: c += 2
        elif cc >= 2: c += 1
        
        # nat
        nc = nat_cnt[p['nationId']]
        if nc >= 8: c += 3
        elif nc >= 5: c += 2
        elif nc >= 2: c += 1
        
        # league
        lc = lg_cnt[p['leagueId']]
        if lc >= 8: c += 3
        elif lc >= 5: c += 2
        elif lc >= 3: c += 1
        
        total_chem += min(3, c)
        
    return total_chem

# For a candidate pool of 11 players, check if they can be assigned to slots to achieve >= 14 chem
def try_assign_for_chem(pool11):
    # pool11: 11 player dicts
    # Quick check: nationalities >= 3
    if len(set(p['nationId'] for p in pool11)) < 3:
        return None
    # Quick check: league >= 2
    lg_counts = defaultdict(int)
    for p in pool11:
        lg_counts[p['leagueId']] += 1
    if not any(v >= 2 for v in lg_counts.values()):
        return None

    # We want to find an assignment of pool11 to slots 0..10 that gives chem >= 14.
    # To do this efficiently:
    # First, find which players can play in which slots.
    can_slots = []
    for p in pool11:
        valid_s = [s for s in range(11) if can_play(p, SLOT_POS[s])]
        can_slots.append(valid_s)
        
    # We want to put as many linking players into valid slots as possible.
    # We can try greedy / bipartite matching of in-position players:
    best_assign: list = []
    best_chem = 0
    
    # Try permutations or matching for the in-position players
    # Since 11! is too large, we can prioritize players from the largest clubs in the pool
    club_sizes = defaultdict(int)
    for p in pool11:
        club_sizes[p['teamId']] += 1
    
    # Sort pool players so players from clubs with >= 2 members come first (they generate club chem)
    ordered_p_idx = sorted(range(11), key=lambda i: (-club_sizes[pool11[i]['teamId']], len(can_slots[i])))
    
    # Simple recursive slot filler for in-position candidates
    used_slots = set()
    slot_to_p = {}
    
    def fill(idx):
        nonlocal best_chem, best_assign
        if best_chem >= 14:
            return
        if idx == 11:
            # Assign remaining unassigned players to remaining empty slots (out of position)
            empty_slots = [s for s in range(11) if s not in used_slots]
            cur_assignment = []
            for s, p_i in slot_to_p.items():
                cur_assignment.append((pool11[p_i], s))
            
            chem = calc_chem(cur_assignment)
            if chem > best_chem:
                best_chem = chem
                best_assign = cur_assignment
            return

        p_i = ordered_p_idx[idx]
        p = pool11[p_i]
        
        # Try valid slots for this player
        placed = False
        for s in can_slots[p_i]:
            if s not in used_slots:
                used_slots.add(s)
                slot_to_p[s] = p_i
                placed = True
                fill(idx + 1)
                del slot_to_p[s]
                used_slots.remove(s)
                if best_chem >= 14:
                    return
                    
        # Also option to leave this player out of position (not using a preferred slot)
        fill(idx + 1)

    fill(0)
    
    if best_chem >= 14 and best_assign is not None:
        # Build full 11 assignment
        assigned_p = set(p['id'] for p, s in best_assign)
        unassigned_p = [p for p in pool11 if p['id'] not in assigned_p]
        used_s = set(s for p, s in best_assign)
        empty_s = [s for s in range(11) if s not in used_s]
        
        full_assign = list(best_assign)
        for p, s in zip(unassigned_p, empty_s):
            full_assign.append((p, s))
        full_assign.sort(key=lambda x: x[1])
        return full_assign, best_chem
        
    return None

# Now, iterate over all 4-club combinations that can sum to >= 11 players
# We want to minimize the sum of score_player for the 11 chosen players.
# Pre-filter candidate clubs to those with low-score players
candidate_clubs = [t for t in all_clubs if score_player(club_map[t][0]) <= 18100]

print(f"Candidate clubs: {len(candidate_clubs)}")

best_overall = None
min_score = float('inf')

# Iterate combinations of 1..4 clubs
for k in range(1, 5):
    print(f"Testing {k}-club combinations...")
    for combo in itertools.combinations(candidate_clubs, k):
        # Total players available
        tot = sum(len(club_map[t]) for t in combo)
        if tot < 11:
            continue
            
        # Combine and sort all players in these clubs
        pool = []
        for t in combo:
            pool.extend(club_map[t])
        pool.sort(key=score_player)
        
        # The lowest 11 players in this pool
        candidate11 = pool[:11]
        score11 = sum(score_player(p) for p in candidate11)
        if score11 >= min_score:
            continue
            
        res = try_assign_for_chem(candidate11)
        if res:
            assign, chem = res
            min_score = score11
            best_overall = (assign, chem, combo, score11)
            b_cnt = sum(1 for p in candidate11 if p['rating'] < 65)
            s_cnt = sum(1 for p in candidate11 if 65 <= p['rating'] < 75)
            g_cnt = sum(1 for p in candidate11 if p['rating'] >= 75)
            print(f"NEW BEST: score={min_score}, chem={chem}, bronzes={b_cnt}, silvers={s_cnt}, golds={g_cnt}, clubs={combo}")

if best_overall:
    assign, chem, combo, score = best_overall
    print("\n--- FINAL BEST SQUAD ---")
    print(f"Total Chem: {chem}, Clubs: {len(combo)}")
    for p, s in assign:
        ok = can_play(p, SLOT_POS[s])
        print(f"Slot {s} ({['GK','RB','RCB','LCB','LB','RM','CM','LM','RAM','LAM','ST'][s]}): {p['name']} ({p['rating']} {p['quality']}) - inPos: {ok} (Team: {p['teamId']}, Nat: {p['nationId']}, Lg: {p['leagueId']})")
    
    # Save to data/best_squad.json
    with open('data/best_squad.json', 'w', encoding='utf-8') as f:
        json.dump({
            'chem': chem,
            'clubs': combo,
            'players': [{'slot': s, 'id': p['id'], 'name': p['name'], 'rating': p['rating'], 'quality': p['quality'], 'inPos': can_play(p, SLOT_POS[s])} for p, s in assign]
        }, f, indent=2)
else:
    print("No valid squad found!")
