"""Joint CP-SAT solver for an EA FC SBC group (e.g. Marquee Matchups).

Reads the web-app dump (inventory rows + challenge specs) and picks the cheapest
disjoint 11-player lineups that satisfy every requested challenge, so solving
one challenge never burns a card another challenge needs.

Requires OR-Tools (CP-SAT). Usage:
  <python-with-ortools> scripts/solve_sbc_group.py [--inv data/sbc_inventory.json]
      [--out data/sbc_plan.json] [--only 51,52] [--exclude-ids 123,456] [--time 60]
      [--max-rating 83] [--hint data/sbc_plan_prev.json]
Inventory comes from scripts/sbc_dump_inventory.js. For each challenge it also writes
data/sbc_apply_<challengeId>.js (scripts/sbc_apply_lineup.js filled in) to pass to
playwright_browser_evaluate.
"""
import argparse
import json
import os
import sys
from collections import defaultdict

from ortools.sat.python import cp_model

# EA SBCEligibilityKey / SBCEligibilityScope values, read from the web-app enums.
K_QUALITY, K_SAME_NATION, K_SAME_LEAGUE, K_SAME_CLUB = 3, 4, 5, 6
K_NATIONS, K_LEAGUES, K_CLUBS, K_NATION_ID, K_LEVEL, K_RATING, K_CHEM = 7, 8, 9, 10, 17, 19, 35
MIN, MAX, EXACT = 0, 1, 2
# Chemistry thresholds (club / nation / league): each threshold reached = +1 chem, capped at 3 per player.
THRESHOLDS = {'teamId': (2, 4, 7), 'nationId': (2, 5, 8), 'leagueId': (3, 5, 8)}
# Relative fodder value (~100-coin units) by rating; bronze/silver handled in card_cost.
GOLD_COST = {75: 5.0, 76: 5.4, 77: 5.8, 78: 6.4, 79: 7.2, 80: 8.5, 81: 11, 82: 17, 83: 30,
             84: 55, 85: 100, 86: 170, 87: 280, 88: 420, 89: 600}
BASE_MOD = 16777216  # special-card definitionId = baseId + k * 2^24


def quality(rating):
    return 1 if rating < 65 else (2 if rating < 75 else 3)


def card_cost(p):
    r = p['rating']
    if r < 65:
        c = 2.0 + 0.01 * (r - 40)
    elif r < 75:
        c = 4.0 + 0.1 * (r - 65)
    else:
        c = GOLD_COST.get(r, 900)
    if p['tradeable']:
        c *= 1.3  # tradeables keep coin value; spend untradeables first
    if p['source'] == 'storage':
        c *= 0.85  # duplicates in SBC storage go first
    if p['special'] or (p['rareflag'] or 0) >= 3:
        c += 200  # promo / special cards only as a last resort
    return int(round(c * 10))


def excluded(p):
    return bool(p['locked'] or p['activeSquad'] or p['loans'] not in (-1, None) or p['limitedUse']
                or p['timeLimited'] or p['evoUpgrades'] or p['academyEnrolled'] or p['academyGraduate']
                or p['concept'] or p['favorite'])


def chem_of(lineup, formation):
    """Per-player chemistry for [(player, slot)], standard FC rules."""
    inpos = [p if formation[s] in (p['possiblePositions'] or []) else None for p, s in lineup]
    counts = {f: defaultdict(int) for f in THRESHOLDS}
    for p in inpos:
        if p:
            for f in THRESHOLDS:
                counts[f][p[f]] += 1
    out = []
    for p in inpos:
        if not p:
            out.append(0)
            continue
        pts = sum(sum(1 for t in th if counts[f][p[f]] >= t) for f, th in THRESHOLDS.items())
        out.append(min(3, pts))
    return out


def team_rating(ratings):
    n = sum(ratings)
    avg = n / len(ratings)
    o = n + sum(r - avg for r in ratings if r > avg)
    return int(round(o) // len(ratings)), o  # EA float formula: floor(round(o) / 11)


def add_scoped(m, expr, scope, value):
    if scope == MIN:
        m.Add(expr >= value)
    elif scope == MAX:
        m.Add(expr <= value)
    else:
        m.Add(expr == value)


def build_challenge(m, c, pool, tag):
    form = c['formation']
    reqs = c['reqs']
    min_q = max([r['values'][0] for r in reqs if r['key'] == K_QUALITY and r['scope'] == MIN], default=1)
    cand = [i for i, p in enumerate(pool) if quality(p['rating']) >= min_q]
    X, U, IN = {}, {}, {}
    for i in cand:
        pos = set(pool[i]['possiblePositions'] or [])
        xs = []
        for s, t in enumerate(form):
            if t in pos:
                X[(i, s)] = m.NewBoolVar(f'x{tag}_{i}_{s}')
                xs.append(X[(i, s)])
        out_of_pos = m.NewBoolVar(f'o{tag}_{i}')
        U[i] = m.NewBoolVar(f'u{tag}_{i}')
        m.Add(sum(xs) + out_of_pos == U[i])
        IN[i] = sum(xs)
    for s in range(len(form)):
        vs = [X[(i, s)] for i in cand if (i, s) in X]
        if vs:
            m.Add(sum(vs) <= 1)
    m.Add(sum(U.values()) == len(form))
    by_base = defaultdict(list)
    for i in cand:
        by_base[pool[i]['defId'] % BASE_MOD].append(U[i])
    for vs in by_base.values():
        if len(vs) > 1:
            m.Add(sum(vs) <= 1)

    # Chemistry: only in-position players count and receive chem.
    pts = defaultdict(list)
    for field, th in THRESHOLDS.items():
        members = defaultdict(list)
        for i in cand:
            members[pool[i][field]].append(i)
        for g, mem in members.items():
            n_in = sum(IN[i] for i in mem)
            for k, t in enumerate(th):
                if len(mem) < t:
                    break
                z = m.NewBoolVar(f'z{tag}_{field}_{g}_{k}')
                m.Add(t * z <= n_in)
                for i in mem:
                    pts[i].append(z)
    CH = {}
    for i in cand:
        CH[i] = m.NewIntVar(0, 3, f'ch{tag}_{i}')
        m.Add(CH[i] <= 3 * IN[i])
        m.Add(CH[i] <= sum(pts[i]))

    def groups(field):
        g = defaultdict(list)
        for i in cand:
            g[pool[i][field]].append(i)
        return g

    def distinct(field, scope, value):
        flags = []
        for g, mem in groups(field).items():
            b = m.NewBoolVar(f'd{tag}_{field}_{g}')
            m.AddMaxEquality(b, [U[i] for i in mem])
            flags.append(b)
        add_scoped(m, sum(flags), scope, value)

    def same(field, scope, value):
        gs = groups(field)
        if scope in (MAX, EXACT):
            for mem in gs.values():
                m.Add(sum(U[i] for i in mem) <= value)
        if scope in (MIN, EXACT):
            ws = []
            for g, mem in gs.items():
                if len(mem) >= value:
                    w = m.NewBoolVar(f'w{tag}_{field}_{g}')
                    m.Add(value * w <= sum(U[i] for i in mem))
                    ws.append(w)
            m.Add(sum(ws) >= 1)

    for r in reqs:
        key, scope, cnt, vals = r['key'], r['scope'], r['count'], r['values']
        if key == K_CHEM:
            add_scoped(m, sum(CH.values()), scope, vals[0])
        elif key == K_NATION_ID:
            add_scoped(m, sum(U[i] for i in cand if pool[i]['nationId'] in vals), scope, cnt)
        elif key == K_LEVEL:
            add_scoped(m, sum(U[i] for i in cand if quality(pool[i]['rating']) in vals), scope, cnt)
        elif key == K_QUALITY:
            if scope == MAX:
                for i in cand:
                    if quality(pool[i]['rating']) > vals[0]:
                        m.Add(U[i] == 0)
            elif scope == EXACT:
                for i in cand:
                    if quality(pool[i]['rating']) != vals[0]:
                        m.Add(U[i] == 0)
        elif key == K_CLUBS:
            distinct('teamId', scope, vals[0])
        elif key == K_LEAGUES:
            distinct('leagueId', scope, vals[0])
        elif key == K_NATIONS:
            distinct('nationId', scope, vals[0])
        elif key == K_SAME_CLUB:
            same('teamId', scope, vals[0])
        elif key == K_SAME_LEAGUE:
            same('leagueId', scope, vals[0])
        elif key == K_SAME_NATION:
            same('nationId', scope, vals[0])
        elif key == K_RATING and scope == MIN:
            # floor(round(o)/11) >= R  <=>  11*o >= 121R - 5.5; 11*o is an integer here.
            n = sum(pool[i]['rating'] * U[i] for i in cand)
            ex = []
            for i in cand:
                b = m.NewBoolVar(f'b{tag}_{i}')
                e = m.NewIntVar(0, 1100, f'e{tag}_{i}')
                m.AddImplication(b, U[i])
                m.Add(e <= 11 * pool[i]['rating'] - n).OnlyEnforceIf(b)
                m.Add(e == 0).OnlyEnforceIf(b.Not())
                ex.append(e)
            m.Add(11 * n + sum(ex) >= 121 * vals[0] - 5)
        else:
            raise SystemExit(f'Unsupported requirement in {c["name"]}: {r}')
    return cand, X, U


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--inv', default='data/sbc_inventory.json')
    ap.add_argument('--out', default='data/sbc_plan.json')
    ap.add_argument('--only', default='')
    ap.add_argument('--exclude-ids', default='')
    ap.add_argument('--time', type=float, default=60)
    ap.add_argument('--max-rating', type=int, default=99, help='drop cards rated above this from the pool')
    ap.add_argument('--hint', default='', help='earlier plan JSON to warm-start from')
    a = ap.parse_args()
    sys.stdout.reconfigure(encoding='utf-8')

    inv = json.load(open(a.inv, encoding='utf-8'))
    skip = {int(x) for x in a.exclude_ids.split(',') if x}
    pool = [p for p in inv['rows'] if not excluded(p) and p['id'] not in skip and p['rating'] <= a.max_rating]
    only = {int(x) for x in a.only.split(',') if x}
    chals = [c for c in inv['challenges'] if c['status'] != 'COMPLETED' and (not only or c['id'] in only)]
    print(f'eligible pool {len(pool)} of {len(inv["rows"])}; challenges {[c["name"] for c in chals]}')

    m = cp_model.CpModel()
    built = [(c,) + build_challenge(m, c, pool, c['id']) for c in chals]
    usage = defaultdict(list)
    for c, cand, X, U in built:
        for i, u in U.items():
            usage[i].append(u)
    for vs in usage.values():
        if len(vs) > 1:
            m.Add(sum(vs) <= 1)
    m.Minimize(sum(card_cost(pool[i]) * u for i, vs in usage.items() for u in vs))

    if a.hint:
        idx = {p['id']: i for i, p in enumerate(pool)}
        prev = {c['id']: c['lineup'] for c in json.load(open(a.hint, encoding='utf-8'))['challenges']}
        for c, cand, X, U in built:
            rows = prev.get(c['id'], [])
            used = {idx.get(r['id']) for r in rows}
            placed = {(idx.get(r['id']), r['slot']) for r in rows if r['inPos']}
            for i, u in U.items():
                m.AddHint(u, int(i in used))
            for key, v in X.items():
                m.AddHint(v, int(key in placed))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = a.time
    solver.parameters.num_workers = 8
    solver.parameters.random_seed = 7
    st = solver.Solve(m)
    print('status', solver.StatusName(st), 'objective', solver.ObjectiveValue() if st in (cp_model.OPTIMAL, cp_model.FEASIBLE) else None,
          'bound', solver.BestObjectiveBound())
    if st not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        sys.exit(1)

    plan = {'status': solver.StatusName(st), 'challenges': []}
    for c, cand, X, U in built:
        form = c['formation']
        slots = [None] * len(form)
        for (i, s), v in X.items():
            if solver.Value(v):
                slots[s] = i
        placed = {i for i in slots if i is not None}
        rest = [i for i in cand if solver.Value(U[i]) and i not in placed]
        for s in range(len(form)):
            if slots[s] is None:
                slots[s] = rest.pop(0)
        lineup = [(pool[i], s) for s, i in enumerate(slots)]
        chem = chem_of(lineup, form)
        rating, o = team_rating([p['rating'] for p, _ in lineup])
        rows = []
        for (p, s), ch in zip(lineup, chem):
            rows.append({'slot': s, 'slotName': c['slotNames'][s], 'id': p['id'], 'defId': p['defId'], 'name': p['name'],
                         'rating': p['rating'], 'quality': 'BSG'[quality(p['rating']) - 1], 'tradeable': p['tradeable'],
                         'source': p['source'], 'nation': p['nation'], 'nationId': p['nationId'], 'leagueId': p['leagueId'],
                         'teamId': p['teamId'], 'inPos': form[s] in (p['possiblePositions'] or []), 'chem': ch,
                         'cost': card_cost(p)})
        plan['challenges'].append({'id': c['id'], 'name': c['name'], 'chem': sum(chem), 'rating': rating, 'o': round(o, 3),
                                   'clubs': len({r['teamId'] for r in rows}), 'leagues': len({r['leagueId'] for r in rows}),
                                   'cost': sum(r['cost'] for r in rows), 'lineup': rows})
        print(f"\n== {c['id']} {c['name']}: chem {sum(chem)}, rating {rating} (o={o:.3f}), clubs {len({r['teamId'] for r in rows})}, "
              f"leagues {len({r['leagueId'] for r in rows})}, cost {sum(r['cost'] for r in rows)}")
        for r in rows:
            print(f"  {r['slotName']:<4} {r['name']:<22} {r['rating']} {r['quality']} {'T' if r['tradeable'] else 'U'} "
                  f"{r['source']:<7} {r['nation']:<14} L{r['leagueId']:<5} C{r['teamId']:<7} inPos={r['inPos']!s:<5} chem={r['chem']}")
    json.dump(plan, open(a.out, 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
    print('\nwrote', a.out)
    tpl = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'sbc_apply_lineup.js'), encoding='utf-8').read()
    for ch in plan['challenges']:
        path = os.path.join(os.path.dirname(os.path.abspath(a.out)), f"sbc_apply_{ch['id']}.js")
        pairs = json.dumps([[r['slot'], r['id']] for r in ch['lineup']])
        open(path, 'w', encoding='utf-8').write(tpl.replace('__TARGET__', str(ch['id'])).replace('__LINEUP__', pairs))
        print('wrote', path)


if __name__ == '__main__':
    main()
