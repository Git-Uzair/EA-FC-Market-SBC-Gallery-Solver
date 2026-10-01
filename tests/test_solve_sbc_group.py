"""Regression: solver chemistry + team-rating maths against squads EA itself scored (2026-10-01).

Expected numbers are what the EA web app reported for these exact lineups (Marquee Matchups),
not solver output. Run with the venv that has OR-Tools + pytest:
  C:\\Users\\Uzair\\AppData\\Local\\Temp\\kilo\\sbcenv\\Scripts\\python.exe -m pytest -q tests
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import solve_sbc_group as s  # noqa: E402

# Per slot, in formation order: (rating, nationId, leagueId, teamId, in_position).
GREECE_V_GERMANY = {  # f532
    'formation': [0, 3, 5, 5, 5, 7, 10, 14, 14, 25, 25],
    'players': [(78, 54, 350, 112393, 1), (72, 21, 19, 32, 1), (77, 21, 19, 23, 0), (75, 54, 1014, 517, 1),
                (68, 52, 353, 111715, 1), (73, 58, 353, 110580, 1), (77, 122, 350, 112393, 1), (78, 34, 350, 607, 1),
                (68, 38, 350, 113224, 1), (78, 116, 350, 112883, 1), (78, 52, 353, 1876, 1)],
    'ea_chem': [3, 0, 0, 1, 2, 1, 3, 2, 2, 2, 2],
    'ea_rating': 76,
}
FRANCE_V_ITALY = {  # f442
    'formation': [0, 3, 5, 5, 7, 12, 14, 14, 16, 25, 25],
    'players': [(79, 14, 2216, 116343, 1), (63, 14, 2216, 116010, 1), (76, 26, 14, 19, 0), (62, 95, 2221, 116308, 1),
                (75, 70, 2221, 116306, 1), (74, 50, 2216, 116343, 1), (80, 95, 2221, 116306, 1), (77, 95, 2221, 116312, 1),
                (71, 18, 308, 112513, 1), (74, 95, 2221, 132698, 1), (66, 18, 308, 112513, 1)],
    'ea_chem': [3, 2, 0, 3, 3, 2, 3, 3, 2, 3, 2],
    'ea_rating': 75,
}


def lineup(case):
    form = case['formation']
    return [({'rating': r, 'nationId': n, 'leagueId': lg, 'teamId': t,
              'possiblePositions': [form[slot]] if in_pos else []}, slot)
            for slot, (r, n, lg, t, in_pos) in enumerate(case['players'])]


def test_chemistry_matches_ea():
    for case in (GREECE_V_GERMANY, FRANCE_V_ITALY):
        assert s.chem_of(lineup(case), case['formation']) == case['ea_chem']


def test_out_of_position_player_does_not_feed_teammates():
    # Slot 1 (in position) shares nation 21 + league 19 only with slot 2 (out of position).
    # EA gave slot 1 zero chemistry, so out-of-position players do not count towards thresholds.
    assert s.chem_of(lineup(GREECE_V_GERMANY), GREECE_V_GERMANY['formation'])[1] == 0


def test_team_rating_matches_ea():
    for case in (GREECE_V_GERMANY, FRANCE_V_ITALY):
        rating, _ = s.team_rating([p[0] for p in case['players']])
        assert rating == case['ea_rating']


def test_rating_needs_round_then_floor():
    # France v Italy: o = 824.818, o/11 = 74.98. EA shows 75; truncating o/11 would say 74.
    rating, o = s.team_rating([p[0] for p in FRANCE_V_ITALY['players']])
    assert rating == 75
    assert int(o / 11) == 74
