import json
from collections import defaultdict
import itertools

with open('data/sbc_unlocked_players.json', 'r', encoding='utf-8') as f:
    players = json.load(f)

# Group players by club
club_map = defaultdict(list)
for p in players:
    club_map[p['teamId']].append(p)

for cid in club_map:
    club_map[cid].sort(key=lambda x: x['rating'])

FORMATION = [0, 5, 5, 5, 12, 14, 14, 16, 23, 25, 27]

def calc_chem(assigned_players, slot_positions):
    in_pos = []
    club_counts = defaultdict(int)
    nation_counts = defaultdict(int)
    league_counts = defaultdict(int)

    for i, p in enumerate(assigned_players):
        pos_ok = slot_positions[i] in p['possiblePositions']
        in_pos.append(pos_ok)
        if pos_ok:
            club_counts[p['teamId']] += 1
            nation_counts[p['nationId']] += 1
            league_counts[p['leagueId']] += 1

    total_chem = 0
    for i, p in enumerate(assigned_players):
        if not in_pos[i]:
            continue
        c = 0
        cc = club_counts[p['teamId']]
        if cc >= 7: c += 3
        elif cc >= 4: c += 2
        elif cc >= 2: c += 1

        nc = nation_counts[p['nationId']]
        if nc >= 8: c += 3
        elif nc >= 5: c += 2
        elif nc >= 2: c += 1

        lc = league_counts[p['leagueId']]
        if lc >= 8: c += 3
        elif lc >= 5: c += 2
        elif lc >= 3: c += 1

        total_chem += min(3, c)

    return total_chem

# We need <= 5 clubs.
# Clubs with >= 2 players are primary candidates
multi_clubs = [cid for cid, plist in club_map.items() if len(plist) >= 2]
single_clubs = [cid for cid, plist in club_map.items() if len(plist) == 1]

print(f"Multi clubs: {len(multi_clubs)}, Single clubs: {len(single_clubs)}")

# To get 11 players from <= 5 clubs:
# We must pick at least 2 or 3 multi clubs
best_solution = None
best_rating_sum = float('inf')

# Test combinations of 3, 4, 5 multi clubs
for k in [3, 4, 5]:
    for chosen_multi in itertools.combinations(multi_clubs, min(k, len(multi_clubs))):
        # We can also add up to (5 - len(chosen_multi)) single clubs
        num_singles_allowed = 5 - len(chosen_multi)
        
        # Available players from chosen multi clubs
        multi_avail = sum(min(4, len(club_map[cid])) for cid in chosen_multi)
        if multi_avail + num_singles_allowed < 11:
            continue

        # Pool from chosen multi clubs
        pool = []
        for cid in chosen_multi:
            pool.extend(club_map[cid][:4])

        # If pool < 11, add best single clubs
        needed = 11 - len(pool)
        if needed > 0:
            if needed > num_singles_allowed:
                continue
            # pick lowest rated singles
            best_singles = sorted(single_clubs, key=lambda cid: club_map[cid][0]['rating'])[:needed]
            for scid in best_singles:
                pool.append(club_map[scid][0])

        pool.sort(key=lambda x: x['rating'])
        # Pick 11 respecting <= 4 per club
        picked = []
        counts = defaultdict(int)
        for p in pool:
            if counts[p['teamId']] < 4:
                picked.append(p)
                counts[p['teamId']] += 1
                if len(picked) == 11:
                    break

        if len(picked) != 11:
            continue

        # Check league constraint: Min 3 players from same league
        l_counts = defaultdict(int)
        for p in picked:
            l_counts[p['leagueId']] += 1
        if max(l_counts.values()) < 3:
            continue

        # Check rating sum
        r_sum = sum(p['rating'] for p in picked)
        if r_sum >= best_rating_sum:
            continue

        # Assign to formation slots to maximize chemistry
        slots_assignment = [None] * 11
        used_p = set()

        for slot_idx, slot_pos in enumerate(FORMATION):
            for p_idx, p in enumerate(picked):
                if p_idx not in used_p and slot_pos in p['possiblePositions']:
                    slots_assignment[slot_idx] = p
                    used_p.add(p_idx)
                    break

        remaining_p = [p for i, p in enumerate(picked) if i not in used_p]
        for slot_idx in range(11):
            if slots_assignment[slot_idx] is None:
                slots_assignment[slot_idx] = remaining_p.pop(0)

        chem = calc_chem(slots_assignment, FORMATION)
        if chem >= 16:
            best_rating_sum = r_sum
            distinct_clubs = len(set(p['teamId'] for p in slots_assignment))
            best_solution = (slots_assignment, chem, r_sum, distinct_clubs)
            print(f"Solution found! Rating sum: {r_sum}, Avg rating: {r_sum/11:.1f}, Chem: {chem}, Distinct clubs: {distinct_clubs}")

if best_solution:
    slots, chem, r_sum, n_clubs = best_solution
    print("\n" + "="*50)
    print(f"OPTIMAL SOLUTION FOUND:")
    print(f"Total Chem: {chem}/33 (Min 16 required)")
    print(f"Rating Sum: {r_sum}, Average Rating: {r_sum/11:.1f}")
    print(f"Clubs count: {n_clubs} (Max 5 required)")
    print("="*50)
    
    result_data = []
    for idx, (p, pos) in enumerate(zip(slots, FORMATION)):
        in_pos = pos in p['possiblePositions']
        safe_name = p['name'].encode('ascii', 'replace').decode('ascii')
        print(f"Slot {idx} (Pos {pos}): {safe_name} ({p['rating']}) - Club: {p['teamId']}, League: {p['leagueId']} - InPos: {in_pos}")
        result_data.append({
            "slot": idx,
            "id": p['id'],
            "name": p['name'],
            "rating": p['rating'],
            "teamId": p['teamId'],
            "leagueId": p['leagueId'],
            "inPos": in_pos
        })
    with open('data/sbc_solution.json', 'w', encoding='utf-8') as f:
        json.dump(result_data, f, indent=2)
else:
    print("No solution found.")
