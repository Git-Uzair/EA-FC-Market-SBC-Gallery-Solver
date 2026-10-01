import json
from collections import defaultdict
import itertools

with open('data/available_club_players.json', 'r', encoding='utf-8') as f:
    players = json.load(f)

used_in_c1 = {
    "Ramazani", "Livramento", "Vilariño", "McKenzie", "Muñoz",
    "Murphy", "Touré", "Boade", "Barnes", "Betfort", "Navarro"
}

avail = [p for p in players if not any(u.lower() in p['name'].lower() for u in used_in_c1) and p['rating'] <= 81]

SLOT_POS = [0, 3, 5, 5, 7, 12, 14, 16, 18, 18, 25]

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

# Portuguese player: Francisco Conceição (80) or Rafael Silva (80)
port_candidates = [p for p in avail if p['nationId'] == 38 and p['rating'] <= 81]
print(f"Portuguese candidates: {[p['name'] for p in port_candidates]}")

# LaLiga players:
laliga = [p for p in avail if p['leagueId'] == 53]
laliga.sort(key=lambda p: p['rating'])
print(f"LaLiga count: {len(laliga)}")

# We need 3 from same club. Athletic Club (448) or Real Betis (449)
athletic_club = [p for p in laliga if p['teamId'] == 448]
betis = [p for p in laliga if p['teamId'] == 449]

best_sol = None
min_rating_sum = 99999

for port_p in port_candidates:
    # Try using Athletic Club (3 players) + 7 other LaLiga players
    trio = athletic_club[:3]
    other_pool = [p for p in laliga if p['id'] not in set(x['id'] for x in trio)]
    other_pool.sort(key=lambda p: p['rating'])
    
    for rem7 in itertools.combinations(other_pool[:12], 7):
        cand11 = trio + list(rem7) + [port_p]
        r_sum = sum(p['rating'] for p in cand11)
        if r_sum >= min_rating_sum:
            continue
            
        # Try matching to slots 0..10
        # Slot 0 is GK. Do we have GK? Emil Audero (79 GK, LaLiga / team 480)!
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
            min_rating_sum = r_sum
            best_sol = (full_assign, chem, r_sum)
            print(f"Found LaLiga solution: chem={chem}, r_sum={r_sum}, avgR={r_sum/11:.1f}, maxR={max(p['rating'] for p in cand11)}")

if best_sol:
    assign, chem, r_sum = best_sol
    assign.sort(key=lambda x: x[1])
    print("\n--- BEST LINEUP FOR NORWAY V PORTUGAL ---")
    print(f"Total Chem: {chem}, Avg Rating: {r_sum/11:.1f}")
    for p, s in assign:
        ok = can_play(p, SLOT_POS[s])
        print(f"Slot {s} ({['GK','RB','CB','CB','LB','RM','CM','LM','CAM','CAM','ST'][s]}): {p['name']} ({p['rating']} {p['quality']}) inPos={ok} (Nat: {p['nationId']}, Team: {p['teamId']}, Lg: {p['leagueId']})")
    with open('data/norway_v_portugal_squad.json', 'w', encoding='utf-8') as f:
        json.dump({
            'chem': chem,
            'players': [{'slot': s, 'id': p['id'], 'name': p['name'], 'rating': p['rating'], 'quality': p['quality'], 'inPos': can_play(p, SLOT_POS[s])} for p, s in assign]
        }, f, indent=2)
