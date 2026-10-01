def calc_squad_rating(ratings):
    s = sum(ratings)
    avg = s / len(ratings)
    excess = sum((r - avg) for r in ratings if r > avg)
    total = s + excess
    return int(total / len(ratings))

combo = [86, 85, 84, 84, 84, 84, 83, 83, 83, 83, 82]
print("Combo:", combo)
print("Squad Rating:", calc_squad_rating(combo))

# Can we even do two 82s?
combo2 = [86, 85, 85, 84, 84, 84, 83, 83, 83, 82, 82]
print("Combo2:", combo2)
print("Squad Rating:", calc_squad_rating(combo2))
