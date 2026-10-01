def calc_squad_rating(ratings):
    s = sum(ratings)
    avg = s / len(ratings)
    excess = sum((r - avg) for r in ratings if r > avg)
    total = s + excess
    return int(total / len(ratings))

# If anchor is 88:
# Test how many 83s, 82s, 81s can fit:
anchor = 88
print(f"--- ANCHOR: {anchor} ---")
for num_82 in range(0, 11):
    for num_81 in range(0, 11 - num_82):
        for num_83 in range(0, 11 - num_82 - num_81):
            num_84 = 10 - num_82 - num_81 - num_83
            if num_84 < 0: continue
            ratings = [anchor] + [84]*num_84 + [83]*num_83 + [82]*num_82 + [81]*num_81
            if len(ratings) == 11 and calc_squad_rating(ratings) >= 84:
                # Calculate cost/penalty: we want to minimize high ratings
                print(f"84s: {num_84}, 83s: {num_83}, 82s: {num_82}, 81s: {num_81} -> Rating: {calc_squad_rating(ratings)}, Sum: {sum(ratings)}")
