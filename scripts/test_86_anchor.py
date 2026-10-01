def calc_squad_rating(ratings):
    s = sum(ratings)
    avg = s / len(ratings)
    excess = sum((r - avg) for r in ratings if r > avg)
    total = s + excess
    return int(total / len(ratings))

# Current on pitch:
# 1x 86, 1x 85, 3x 84, 5x 83, 1x 82:
curr = [86, 85, 84, 84, 84, 83, 83, 83, 83, 83, 82]
print("Current on pitch:", calc_squad_rating(curr), "sum:", sum(curr))

# What if we replace 85 with 84?
c1 = [86, 84, 84, 84, 84, 83, 83, 83, 83, 83, 82]
print("Replace 85 with 84:", calc_squad_rating(c1), "sum:", sum(c1))

# What if 86 + 1x 85 + 2x 84 + 6x 83 + 1x 82?
c2 = [86, 85, 84, 84, 83, 83, 83, 83, 83, 83, 82]
print("Replace 84 with 83:", calc_squad_rating(c2), "sum:", sum(c2))

# What if 86 + 1x 85 + 3x 84 + 4x 83 + 2x 82?
c3 = [86, 85, 84, 84, 84, 83, 83, 83, 83, 82, 82]
print("Replace 83 with 82:", calc_squad_rating(c3), "sum:", sum(c3))

# What if 86 + 1x 85 + 1x 84 + 8x 83?
c4 = [86, 85, 84, 83, 83, 83, 83, 83, 83, 83, 83]
print("86 + 85 + 84 + 8x83:", calc_squad_rating(c4), "sum:", sum(c4))

# What if 86 + 10x 83?
c5 = [86] + [83]*10
print("86 + 10x 83:", calc_squad_rating(c5), "sum:", sum(c5))

# What if 86 + 2x 84 + 7x 83 + 1x 82?
c6 = [86, 84, 84, 83, 83, 83, 83, 83, 83, 83, 82]
print("86 + 2x84 + 7x83 + 1x82:", calc_squad_rating(c6), "sum:", sum(c6))

# Let's search all combinations with anchor 86 that give rating 84:
best = []
for n85 in range(0, 3):
    for n84 in range(0, 11 - n85):
        for n83 in range(0, 11 - n85 - n84):
            for n82 in range(0, 11 - n85 - n84 - n83):
                n81 = 10 - n85 - n84 - n83 - n82
                if n81 < 0: continue
                r = [86] + [85]*n85 + [84]*n84 + [83]*n83 + [82]*n82 + [81]*n81
                if calc_squad_rating(r) >= 84:
                    best.append((sum(r), r, (n85, n84, n83, n82, n81)))

best.sort(key=lambda x: (x[0], x[2][0], x[2][1])) # lowest sum, then fewest 85s, fewest 84s
print("\nTOP 10 LOWEST RATING COMBINATIONS WITH 86 ANCHOR:")
for s, r, (n85, n84, n83, n82, n81) in best[:10]:
    print(f"Sum {s}: {n85}x85, {n84}x84, {n83}x83, {n82}x82, {n81}x81")
