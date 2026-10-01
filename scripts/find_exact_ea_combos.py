def ea_squad_rating(ratings):
    n = sum(ratings)
    i = n / 11.0
    o = float(n)
    for r in ratings:
        if r > i:
            o += (r - i)
    n_round = round(o)
    return int(n_round // 11), o

# Test all combinations with Enzo Fernández (86) as anchor
# Using ratings <= 85 (Cascarino 85 or 0x85)
combos = []

for n85 in range(0, 2): # at most 1x 85 (Cascarino)
    for n84 in range(0, 11 - n85):
        for n83 in range(0, 11 - n85 - n84):
            for n82 in range(0, 11 - n85 - n84 - n83):
                for n81 in range(0, 11 - n85 - n84 - n83 - n82):
                    n80 = 10 - n85 - n84 - n83 - n82 - n81
                    if n80 < 0: continue
                    r = [86] + [85]*n85 + [84]*n84 + [83]*n83 + [82]*n82 + [81]*n81 + [80]*n80
                    rating, o = ea_squad_rating(r)
                    if rating >= 84:
                        combos.append((sum(r), o, (n85, n84, n83, n82, n81, n80)))

# Sort by rating sum ascending, then fewest 85s, then fewest 84s
combos.sort(key=lambda x: (x[0], x[2][0], x[2][1]))

print("ALL COMBOS WITH RATING 84 (Anchor 86):")
for s, o, (n85, n84, n83, n82, n81, n80) in combos[:25]:
    desc = []
    if n85: desc.append(f"{n85}x85")
    if n84: desc.append(f"{n84}x84")
    if n83: desc.append(f"{n83}x83")
    if n82: desc.append(f"{n82}x82")
    if n81: desc.append(f"{n81}x81")
    if n80: desc.append(f"{n80}x80")
    print(f"Sum {s} (o={o:.3f}): {', '.join(desc)}")
