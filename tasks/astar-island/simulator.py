"""Norse civilization simulator for Astar Island — calibrated from 20 replay trajectories.

Key dynamics learned from replays (R1-R4, 5 seeds each):
  - Expansion: ~10% of alive settlements expand per step (higher for high-pop)
  - Deaths: ~7% of alive settlements die per step (stochastic, bursty)
  - Ruins reclaim in ~1 step: ~50% re-settled, ~35% plains, ~15% forest
  - Expansion targets: 41% plains, 43% ruins, 16% forest
  - Expansion distance: 41% d=1, 33% d=2, 21% d=3, 5% d=4
  - Port formation: coastal settlements (adj_ocean>=2) can become ports
  - New settlements start with pop~0.45, food~0.22, defense~0.175

Usage:
    from simulator import simulate_monte_carlo
    probs = simulate_monte_carlo(initial_grid, settlements, n_sims=100)
"""

import numpy as np

# Terrain codes
OCEAN = 10
PLAINS = 11
EMPTY = 0
SETTLEMENT = 1
PORT = 2
RUIN = 3
FOREST = 4
MOUNTAIN = 5

# Expandable terrain types
EXPANDABLE = frozenset({PLAINS, RUIN, FOREST})

# Expansion distance weights (from R4 replay data)
DIST_WEIGHTS = np.array([0.0, 0.41, 0.33, 0.21, 0.05])

# Terrain preference weights for expansion targets
TERRAIN_EXPAND_WEIGHT = {PLAINS: 1.0, RUIN: 2.5, FOREST: 0.5}

# Reclamation: ruin -> plains (68%) or forest (32%)
RECLAIM_PLAINS_PROB = 0.68

# Pre-build offsets for Manhattan distance 1-4
_OFFSETS_BY_DIST = {}
for _d in range(1, 5):
    offsets = []
    for dy in range(-4, 5):
        for dx in range(-4, 5):
            if abs(dy) + abs(dx) == _d:
                offsets.append((dy, dx))
    _OFFSETS_BY_DIST[_d] = offsets


def _count_neighbors(grid, code):
    """Count cells of given code in 8-neighborhood of each cell."""
    h, w = grid.shape
    mask = (grid == code).astype(np.int32)
    count = np.zeros((h, w), dtype=np.int32)
    for dy in [-1, 0, 1]:
        for dx in [-1, 0, 1]:
            if dy == 0 and dx == 0:
                continue
            sy = max(0, dy)
            ey = min(h, h + dy)
            sx = max(0, dx)
            ex = min(w, w + dx)
            fy = max(0, -dy)
            fx = max(0, -dx)
            count[sy:ey, sx:ex] += mask[fy:fy + (ey - sy), fx:fx + (ex - sx)]
    return count


def simulate_one(
    initial_grid,
    initial_settlements,
    expansion_rate=0.085,
    winter_severity=0.087,
    raid_intensity=0.03,
    rng=None,
):
    """Run one stochastic simulation for 50 steps.

    Phase ordering (calibrated from replay frame-by-frame analysis):
      1. Ruin reclamation (from previous step's deaths)
      2. Growth & resource gathering
      3. Port development
      4. Expansion (new settlements)
      5. Conflict (raiding)
      6. Winter / death (creates ruins that persist until next step)

    Returns the final H x W terrain grid.
    """
    if rng is None:
        rng = np.random.default_rng()

    h = len(initial_grid)
    w = len(initial_grid[0]) if h > 0 else 0
    grid = np.array(initial_grid, dtype=np.int32)

    # Static features (don't change during sim)
    ocean_nbrs = _count_neighbors(grid, OCEAN)

    # Pre-allocate settlement arrays
    n_init = len(initial_settlements)
    max_settle = n_init + 2000
    s_x = np.zeros(max_settle, dtype=np.int32)
    s_y = np.zeros(max_settle, dtype=np.int32)
    s_pop = np.zeros(max_settle, dtype=np.float64)
    s_food = np.zeros(max_settle, dtype=np.float64)
    s_def = np.zeros(max_settle, dtype=np.float64)
    s_port = np.zeros(max_settle, dtype=bool)
    s_alive = np.zeros(max_settle, dtype=bool)
    s_owner = np.zeros(max_settle, dtype=np.int32)

    for i, s in enumerate(initial_settlements):
        if isinstance(s, dict):
            s_x[i], s_y[i] = s.get('x', 0), s.get('y', 0)
            s_port[i] = s.get('has_port', False)
            s_owner[i] = s.get('owner_id', i)
        else:
            s_x[i], s_y[i] = s.x, s.y
            s_port[i] = getattr(s, 'has_port', False)
            s_owner[i] = getattr(s, 'owner_id', i)
        s_pop[i] = rng.uniform(0.6, 1.3)
        s_food[i] = rng.uniform(0.4, 0.8)
        s_def[i] = rng.uniform(0.2, 0.6)
        s_alive[i] = True

    n_settle = n_init
    occupied = set()
    for i in range(n_settle):
        occupied.add((s_x[i], s_y[i]))

    def _add(x, y, p, f, d, hp, oid):
        nonlocal n_settle
        if n_settle >= max_settle:
            return
        s_x[n_settle] = x
        s_y[n_settle] = y
        s_pop[n_settle] = p
        s_food[n_settle] = f
        s_def[n_settle] = d
        s_port[n_settle] = hp
        s_alive[n_settle] = True
        s_owner[n_settle] = oid
        occupied.add((x, y))
        n_settle += 1

    for step in range(50):
        alive_idx = np.where(s_alive[:n_settle])[0]
        if len(alive_idx) == 0:
            break

        # === PHASE 1: RUIN RECLAMATION ===
        ruin_positions = list(zip(*np.where(grid == RUIN)))
        if ruin_positions:
            rng.shuffle(ruin_positions)
            for ry, rx in ruin_positions:
                nearby = []
                for i in alive_idx:
                    dist = abs(s_x[i] - rx) + abs(s_y[i] - ry)
                    if 0 < dist <= 3:
                        nearby.append(i)

                if nearby and rng.random() < 0.50:
                    parent = nearby[rng.integers(len(nearby))]
                    is_port = ocean_nbrs[ry, rx] >= 2 and rng.random() < 0.15
                    grid[ry, rx] = PORT if is_port else SETTLEMENT
                    _add(rx, ry, rng.uniform(0.35, 0.55), rng.uniform(0.10, 0.25),
                         rng.uniform(0.12, 0.18), is_port, s_owner[parent])
                else:
                    if rng.random() < 0.80:
                        grid[ry, rx] = PLAINS if rng.random() < RECLAIM_PLAINS_PROB else FOREST

        # Refresh alive indices
        alive_idx = np.where(s_alive[:n_settle])[0]

        # === PHASE 2: GROWTH ===
        forest_nbrs = _count_neighbors(grid, FOREST)
        for i in alive_idx:
            adj_f = forest_nbrs[s_y[i], s_x[i]]
            s_food[i] = min(1.0, s_food[i] + adj_f * 0.10)
            if s_food[i] > 0.3:
                s_pop[i] = min(3.0, s_pop[i] + 0.07 * s_food[i] * rng.uniform(0.3, 1.7))
            s_def[i] = min(1.0, s_def[i] + 0.015 * rng.uniform(0.5, 1.5))

        # === PHASE 3: PORT DEVELOPMENT ===
        for i in alive_idx:
            if not s_port[i]:
                oc = ocean_nbrs[s_y[i], s_x[i]]
                if oc >= 2:
                    p_port = 0.10 * s_pop[i]
                elif oc >= 1:
                    p_port = 0.03 * s_pop[i]
                else:
                    continue
                if rng.random() < p_port:
                    s_port[i] = True
                    grid[s_y[i], s_x[i]] = PORT

        # === PHASE 4: EXPANSION ===
        expand_order = alive_idx.copy()
        rng.shuffle(expand_order)

        for i in expand_order:
            if s_pop[i] < 0.4:
                continue
            p_expand = expansion_rate * (0.5 + 0.5 * s_pop[i])
            if rng.random() > p_expand:
                continue

            candidates = []
            weights = []
            for d in range(1, 5):
                dw = DIST_WEIGHTS[d]
                for dy, dx in _OFFSETS_BY_DIST[d]:
                    ny, nx = s_y[i] + dy, s_x[i] + dx
                    if 0 <= ny < h and 0 <= nx < w and (nx, ny) not in occupied:
                        t = grid[ny, nx]
                        if t in EXPANDABLE:
                            candidates.append((ny, nx))
                            weights.append(TERRAIN_EXPAND_WEIGHT.get(t, 0) * dw)

            if not candidates:
                continue

            wt = np.array(weights)
            wt /= wt.sum()
            idx = rng.choice(len(candidates), p=wt)
            ty, tx = candidates[idx]

            is_port_new = ocean_nbrs[ty, tx] >= 2 and rng.random() < 0.15
            grid[ty, tx] = PORT if is_port_new else SETTLEMENT
            _add(tx, ty, rng.uniform(0.35, 0.55), rng.uniform(0.15, 0.30),
                 rng.uniform(0.14, 0.20), is_port_new, s_owner[i])
            s_pop[i] *= 0.80
            s_food[i] *= 0.75

        # === PHASE 5: CONFLICT ===
        alive_idx = np.where(s_alive[:n_settle])[0]
        for i in alive_idx:
            if not s_alive[i]:
                continue
            desperation = max(0, 1.0 - s_food[i])
            p_raid = raid_intensity * (1.0 + desperation * 1.5)
            if rng.random() > p_raid:
                continue

            max_range = 5 if s_port[i] else 3
            enemies = []
            for j in alive_idx:
                if j != i and s_owner[j] != s_owner[i] and s_alive[j]:
                    dist = abs(s_x[i] - s_x[j]) + abs(s_y[i] - s_y[j])
                    if 0 < dist <= max_range:
                        enemies.append(j)

            if not enemies:
                continue

            j = enemies[rng.integers(len(enemies))]
            attack = s_pop[i] * (0.5 + s_def[i]) * rng.uniform(0.4, 1.6)
            defend_str = s_pop[j] * (0.5 + s_def[j]) * rng.uniform(0.4, 1.6)

            if attack > defend_str:
                loot = min(s_food[j] * 0.3, 0.2)
                s_food[i] = min(1.0, s_food[i] + loot)
                s_food[j] -= loot
                s_pop[j] *= 0.65
                s_def[j] *= 0.75

        # === PHASE 6: WINTER / DEATH ===
        winter_mult = rng.uniform(0.1, 3.0)
        alive_idx = np.where(s_alive[:n_settle])[0]

        for i in alive_idx:
            s_food[i] -= winter_severity * winter_mult * rng.uniform(0.3, 1.7)
            s_food[i] = max(-0.3, s_food[i])
            s_pop[i] -= winter_severity * winter_mult * 0.15 * rng.uniform(0.0, 1.5)

            p_die = winter_severity * winter_mult * 0.20
            if s_food[i] < 0.0:
                p_die += 0.15
            elif s_food[i] < 0.3:
                p_die += 0.08
            elif s_food[i] < 0.5:
                p_die += 0.03
            if s_pop[i] < 0.3:
                p_die += 0.12
            elif s_pop[i] < 0.5:
                p_die += 0.06
            elif s_pop[i] < 0.8:
                p_die += 0.02
            if s_def[i] < 0.15:
                p_die += 0.02

            if rng.random() < p_die:
                s_alive[i] = False
                grid[s_y[i], s_x[i]] = RUIN
                occupied.discard((s_x[i], s_y[i]))

    return grid


def simulate_monte_carlo(
    initial_grid,
    initial_settlements,
    n_sims=100,
    expansion_rate=0.085,
    winter_severity=0.087,
    raid_intensity=0.03,
    seed=42,
):
    """Run Monte Carlo simulations and return probability distributions.

    Returns H x W x 6 tensor of terrain class probabilities.
    """
    h = len(initial_grid)
    w = len(initial_grid[0]) if h > 0 else 0

    terrain_to_class = {0: 0, 10: 0, 11: 0, 1: 1, 2: 2, 3: 3, 4: 4, 5: 5}
    counts = np.zeros((h, w, 6), dtype=np.float64)

    for sim in range(n_sims):
        rng = np.random.default_rng(seed * 10000 + sim)
        final_grid = simulate_one(
            initial_grid, initial_settlements,
            expansion_rate=expansion_rate,
            winter_severity=winter_severity,
            raid_intensity=raid_intensity,
            rng=rng,
        )
        for code, cls in terrain_to_class.items():
            counts[:, :, cls] += (final_grid == code)

    probs = counts / n_sims
    probs = np.maximum(probs, 0.0001)
    probs /= probs.sum(axis=-1, keepdims=True)
    return probs


def fit_hidden_params(
    initial_grid,
    initial_settlements,
    observations,
    n_sims_per_eval=20,
):
    """Estimate hidden parameters from observation terrain frequencies.

    Uses observed settlement/ruin density to infer expansion_rate and winter_severity.
    """
    from dtos import TERRAIN_TO_CLASS

    obs_cls = np.zeros(6)
    obs_total = 0
    for obs in observations:
        for row in obs.get("grid", []):
            for code in row:
                if code not in {10, 5}:
                    obs_cls[TERRAIN_TO_CLASS.get(code, 0)] += 1
                    obs_total += 1

    if obs_total < 50:
        return {"expansion_rate": 0.085, "winter_severity": 0.087, "raid_intensity": 0.03}

    obs_freq = obs_cls / obs_total
    obs_settl_rate = obs_freq[1] + obs_freq[2]
    obs_ruin_rate = obs_freq[3]

    if obs_settl_rate < 0.01:
        expansion_rate = 0.06
        winter_severity = 0.18
    elif obs_settl_rate < 0.08:
        expansion_rate = 0.065
        winter_severity = 0.10
    elif obs_settl_rate < 0.15:
        expansion_rate = 0.085
        winter_severity = 0.087
    elif obs_settl_rate < 0.20:
        expansion_rate = 0.090
        winter_severity = 0.075
    else:
        expansion_rate = 0.110
        winter_severity = 0.060

    if obs_ruin_rate > 0.02:
        winter_severity += 0.03

    return {
        "expansion_rate": round(expansion_rate, 4),
        "winter_severity": round(winter_severity, 4),
        "raid_intensity": 0.03,
    }


if __name__ == "__main__":
    import json
    import time
    from evaluate import compute_score

    with open("data/round4_initial.json") as f:
        r4 = json.load(f)

    grid = r4["initial_states"][0]["grid"]
    settlements = r4["initial_states"][0]["settlements"]
    gt = np.load("data/gt_r4_seed0.npy")

    print("Testing simulator on R4 seed 0:")
    print("=" * 70)

    for n_sims in [100, 200, 500]:
        t0 = time.time()
        probs = simulate_monte_carlo(
            grid, settlements, n_sims=n_sims,
            expansion_rate=0.085, winter_severity=0.087, seed=42,
        )
        elapsed = time.time() - t0
        score = compute_score(probs, gt)
        print(f"n={n_sims:4d}: score={score:.2f} "
              f"settl={probs[:,:,1].sum():.0f}/{gt[:,:,1].sum():.0f} "
              f"port={probs[:,:,2].sum():.1f}/{gt[:,:,2].sum():.1f} "
              f"ruin={probs[:,:,3].sum():.0f}/{gt[:,:,3].sum():.0f} "
              f"forest={probs[:,:,4].sum():.0f}/{gt[:,:,4].sum():.0f} "
              f"({elapsed:.1f}s)")
