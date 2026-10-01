import json
from collections import defaultdict

with open('data/current_club_players.json', 'r', encoding='utf-8') as f:
    players = json.load(f)

golds = [p for p in players if p['quality'] == 'Gold']
print(f"Total golds: {len(golds)}")

matrix = defaultdict(lambda: defaultdict(list))
for p in golds:
    matrix[p['nationId']][p['leagueId']].append(p)

top_nats = [nid for nid, ldict in matrix.items() if sum(len(l) for l in ldict.values()) >= 5]
print(f"Top nations: {top_nats}")

# Nation names map:
# 14: England, 18: France, 21: Germany, 45: Spain, 54: Brazil, 95: USA, 7: Belgium, 34: Netherlands, 52: Argentina, 38: Portugal
nat_names = {
    14: "England", 18: "France", 21: "Germany", 45: "Spain",
    54: "Brazil", 95: "USA", 7: "Belgium", 34: "Netherlands",
    52: "Argentina", 38: "Portugal"
}

for nid in top_nats:
    name = nat_names.get(nid, str(nid))
    total = sum(len(l) for l in matrix[nid].values())
    print(f"\n--- {name} ({nid}): {total} players ---")
    for lg, plist in matrix[nid].items():
        p_strs = [f"{p['name']} ({p['rating']} pos:{p['possiblePos']})" for p in plist]
        print(f"  League {lg} ({len(plist)}): {p_strs}")
