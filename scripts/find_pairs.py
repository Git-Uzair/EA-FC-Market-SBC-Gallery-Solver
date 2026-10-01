import json
from collections import defaultdict

with open('data/current_club_players.json', 'r', encoding='utf-8') as f:
    players = json.load(f)

pairs = defaultdict(list)
for p in players:
    if p['rating'] >= 75:
        pairs[(p['teamId'], p['nationId'], p['leagueId'])].append(p)

club_nat_pairs = {k: v for k, v in pairs.items() if len(v) >= 2}
print(f"Same Club & Same Nation pairs (>= 2 players): {len(club_nat_pairs)}")
for (t, n, lg), plist in club_nat_pairs.items():
    p_strs = [f"{p['name']} ({p['rating']} pos:{p['possiblePos']})" for p in plist]
    print(f"Team {t}, Nat {n}, League {lg} ({len(plist)}): {p_strs}")
