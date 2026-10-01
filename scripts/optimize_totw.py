def calc_squad_rating(ratings):
    s = sum(ratings)
    avg = s / len(ratings)
    excess = sum((r - avg) for r in ratings if r > avg)
    total = s + excess
    return int(total / len(ratings))

# Available unlocked ratings (with Enzo Fernández 86 fixed as anchor):
# Anchor: 86
# Other 10 slots:
# Let's test combinations of 85, 84, 83, 82, 81, 80:
valid_combos = []
for n85 in range(0, 3):
    for n84 in range(0, 11 - n85):
        for n83 in range(0, 11 - n85 - n84):
            for n82 in range(0, 11 - n85 - n84 - n83):
                for n81 in range(0, 11 - n85 - n84 - n83 - n82):
                    n80 = 10 - n85 - n84 - n83 - n82 - n81
                    if n80 < 0: continue
                    r = [86] + [85]*n85 + [84]*n84 + [83]*n83 + [82]*n82 + [81]*n81 + [80]*n80
                    if calc_squad_rating(r) >= 84:
                        valid_combos.append((sum(r), (n85, n84, n83, n82, n81, n80)))

# Sort by sum ascending (absolute minimum rating), then fewest 85s, then fewest 84s
valid_combos.sort(key=lambda x: (x[0], x[1][0], x[1][1], x[1][2]))

print(f"Total valid combos: {len(valid_combos)}")
print("\nTOP 20 ABSOLUTE MINIMUM CONFIGURATIONS (Anchor 86):")
for s, (n85, n84, n83, n82, n81, n80) in valid_combos[:20]:
    desc = []
    if n85: desc.append(f"{n85}x85")
    if n84: desc.append(f"{n84}x84")
    if n83: desc.append(f"{n83}x83")
    if n82: desc.append(f"{n82}x82")
    if n81: desc.append(f"{n81}x81")
    if n80: desc.append(f"{n80}x80")
    print(f"Rating Sum {s} (Avg {s/11:.2f}): {', '.join(desc)}")
