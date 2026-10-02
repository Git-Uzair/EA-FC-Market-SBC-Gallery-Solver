import json

data = json.load(open('data/paletools_gallery_scan.json', encoding='utf-8'))
print(f'Total sets scanned: {len(data)}')

completed = [s for s in data if s['isComplete']]
print(f'\n=== COMPLETED SETS ({len(completed)}) ===')
for s in sorted(completed, key=lambda x: (x['category'], x['name'])):
    cat = s['category'][:25]
    name = s['name'][:22]
    print(f"{cat:<25} | {name:<22} | Gr: {s['grade']:<2} | Pts: {s['points']:<6} | Tok: {s['currentTokens']:>2}/{s['maxTokens']:<3} | Next: {s['nextGradeName']} (+{s['pointsToNext']} pts for +{s['nextGradeTokens']} tok)")

almost = [s for s in data if not s['isComplete'] and s['tracked'] >= 3]
print(f'\n=== PARTIALLY COMPLETED SETS (tracked >= 3, not complete: {len(almost)}) ===')
for s in sorted(almost, key=lambda x: x['required'] - x['tracked']):
    cat = s['category'][:25]
    name = s['name'][:22]
    missing = s['required'] - s['tracked']
    print(f"{cat:<25} | {name:<22} | Tracked: {s['tracked']:>2}/{s['required']} (Needs {missing:>2}) | Gr: {s['grade']:<2} | Pts: {s['points']:<6} | MaxTok: {s['maxTokens']}")
