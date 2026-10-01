def calc_squad_rating(ratings):
    s = sum(ratings)
    avg = s / len(ratings)
    excess = sum((r - avg) for r in ratings if r > avg)
    total = s + excess
    return int(total / len(ratings))

# Anchor: Enzo Fernández (86)
# If we want to use 1x 85 (Cascarino 85) or 0x 85:
combos_1_85 = []
combos_0_85 = []

for n84 in range(0, 11):
    for n83 in range(0, 11 - n84):
        for n82 in range(0, 11 - n84 - n83):
            for n81 in range(0, 11 - n84 - n83 - n82):
                n80 = 10 - n84 - n83 - n82 - n81
                if n80 < 0: continue
                # with 1x 85:
                r1 = [86, 85] + [84]*(n84-1 if n84>=1 else 0) + [83]*n83 + [82]*n82 + [81]*n81 + [80]*n80
                if len(r1) == 11 and calc_squad_rating(r1) >= 84:
                    combos_1_85.append((sum(r1), [86, 85, n84-1 if n84>=1 else 0, n83, n82, n81, n80]))
                
                # with 0x 85:
                r0 = [86] + [84]*n84 + [83]*n83 + [82]*n82 + [81]*n81 + [80]*n80
                if len(r0) == 11 and calc_squad_rating(r0) >= 84:
                    combos_0_85.append((sum(r0), [86, n84, n83, n82, n81, n80]))

combos_1_85.sort(key=lambda x: (x[0], x[1][2])) # lowest sum, fewest 84s
combos_0_85.sort(key=lambda x: (x[0], x[1][1])) # lowest sum, fewest 84s

print("--- BEST WITH 1x 85 (Cascarino) ---")
for s, (a86, a85, n84, n83, n82, n81, n80) in combos_1_85[:10]:
    print(f"Sum {s}: 1x86, 1x85, {n84}x84, {n83}x83, {n82}x82, {n81}x81, {n80}x80")

print("\n--- BEST WITH 0x 85 (NO 85s used!) ---")
for s, (a86, n84, n83, n82, n81, n80) in combos_0_85[:10]:
    print(f"Sum {s}: 1x86, {n84}x84, {n83}x83, {n82}x82, {n81}x81, {n80}x80")
