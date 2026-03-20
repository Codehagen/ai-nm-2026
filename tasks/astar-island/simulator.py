"""Simplified Norse civilization simulator for Astar Island.

Calibrated from 20 replay trajectories (9,510 expansions, 6,958 deaths).
Runs Monte Carlo simulations to predict terrain probability distributions.

Usage:
    from simulator import simulate_monte_carlo
    probs = simulate_monte_carlo(initial_grid, settlements, n_sims=100,
                                  expansion_rate=0.1, winter_severity=0.05)
"""

import numpy as np
from collections import defaultdict


# Terrain codes
OCEAN = 10
PLAINS = 11
EMPTY = 0
SETTLEMENT = 1
PORT = 2
RUIN = 3
FOREST = 4
MOUNTAIN = 5

# Calibrated from 20 replay trajectories
# Expansion target distribution: what terrain types get expanded into
EXPANSION_TERRAIN_PROBS = {PLAINS: 0.450, RUIN: 0.384, FOREST: 0.167}

# Expansion distance distribution (Manhattan)
EXPANSION_DIST_PROBS = {1: 0.452, 2: 0.340, 3: 0.163, 4: 0.038}

# Reclamation: ruin → plains (68%) or forest (32%)
RECLAIM_TO_PLAINS = 0.68
RECLAIM_TO_FOREST = 0.32


class Settlement:
    __slots__ = ['x', 'y', 'population', 'food', 'defense', 'wealth',
                 'has_port', 'alive', 'owner_id']

    def __init__(self, x, y, population=1.0, food=0.8, defense=0.4,
                 wealth=0.1, has_port=False, alive=True, owner_id=0):
        self.x = x
        self.y = y
        self.population = population
        self.food = food
        self.defense = defense
        self.wealth = wealth
        self.has_port = has_port
        self.alive = alive
        self.owner_id = owner_id


def _adj_ocean_count(grid, y, x):
    h, w = grid.shape
    count = 0
    for dy in [-1, 0, 1]:
        for dx in [-1, 0, 1]:
            if dy == 0 and dx == 0:
                continue
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and grid[ny, nx] == OCEAN:
                count += 1
    return count


def _adj_forest_count(grid, y, x):
    h, w = grid.shape
    count = 0
    for dy in [-1, 0, 1]:
        for dx in [-1, 0, 1]:
            if dy == 0 and dx == 0:
                continue
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and grid[ny, nx] == FOREST:
                count += 1
    return count


def simulate_one(
    initial_grid: list[list[int]],
    initial_settlements: list[dict],
    expansion_rate: float = 0.08,
    winter_severity: float = 0.05,
    raid_intensity: float = 0.03,
    food_from_forest: float = 0.15,
    port_threshold: float = 0.8,
    reclaim_rate: float = 0.06,
    rng: np.random.Generator = None,
) -> np.ndarray:
    """Run one stochastic simulation for 50 years.

    Returns the final 40x40 terrain grid.
    """
    if rng is None:
        rng = np.random.default_rng()

    h = len(initial_grid)
    w = len(initial_grid[0]) if h > 0 else 0
    grid = np.array(initial_grid, dtype=np.int32)

    # Initialize settlements
    settlements = []
    for s in initial_settlements:
        if isinstance(s, dict):
            settlements.append(Settlement(
                x=s.get('x', 0), y=s.get('y', 0),
                population=rng.uniform(0.5, 1.5),
                food=rng.uniform(0.5, 1.0),
                defense=rng.uniform(0.2, 0.6),
                wealth=rng.uniform(0.0, 0.3),
                has_port=s.get('has_port', False),
                alive=True,
                owner_id=s.get('owner_id', settlements.__len__()),
            ))
        else:
            settlements.append(Settlement(
                x=s.x, y=s.y,
                population=rng.uniform(0.5, 1.5),
                food=rng.uniform(0.5, 1.0),
                defense=rng.uniform(0.2, 0.6),
                wealth=rng.uniform(0.0, 0.3),
                has_port=getattr(s, 'has_port', False),
                alive=True,
                owner_id=getattr(s, 'owner_id', len(settlements)),
            ))

    for step in range(50):
        alive = [s for s in settlements if s.alive]
        if not alive:
            break

        # === PHASE 1: GROWTH ===
        for s in alive:
            # Food production from adjacent forests
            adj_forests = _adj_forest_count(grid, s.y, s.x)
            food_gain = adj_forests * food_from_forest
            s.food = min(1.0, s.food + food_gain)

            # Population growth based on food
            if s.food > 0.3:
                s.population += s.food * 0.1 * rng.uniform(0.5, 1.5)
            s.population = min(4.0, s.population)

            # Port development for coastal settlements
            if not s.has_port and _adj_ocean_count(grid, s.y, s.x) >= 2:
                if s.population > port_threshold and rng.random() < 0.1:
                    s.has_port = True
                    grid[s.y, s.x] = PORT

            # Defense builds up slowly
            s.defense = min(1.0, s.defense + 0.02)

        # === PHASE 2: EXPANSION ===
        alive = [s for s in settlements if s.alive]
        for s in alive:
            # Expansion probability based on population
            if s.population < 0.5:
                continue
            p_expand = expansion_rate * s.population * s.food
            if rng.random() > p_expand:
                continue

            # Find expansion target
            candidates = []
            for dy in range(-4, 5):
                for dx in range(-4, 5):
                    dist = abs(dy) + abs(dx)
                    if dist == 0 or dist > 4:
                        continue
                    ny, nx = s.y + dy, s.x + dx
                    if 0 <= ny < h and 0 <= nx < w:
                        t = grid[ny, nx]
                        if t in EXPANSION_TERRAIN_PROBS:
                            # Weight by terrain preference and inverse distance
                            weight = EXPANSION_TERRAIN_PROBS[t]
                            dist_weight = EXPANSION_DIST_PROBS.get(dist, 0.01)
                            candidates.append((ny, nx, weight * dist_weight))

            if not candidates:
                continue

            # Pick target weighted by preference
            ys, xs, weights = zip(*candidates)
            weights = np.array(weights)
            weights /= weights.sum()
            idx = rng.choice(len(candidates), p=weights)
            ty, tx = ys[idx], xs[idx]

            # Create new settlement
            new_s = Settlement(
                x=tx, y=ty,
                population=0.3,
                food=s.food * 0.5,
                defense=0.1,
                wealth=0.0,
                has_port=False,
                alive=True,
                owner_id=s.owner_id,
            )
            settlements.append(new_s)
            grid[ty, tx] = SETTLEMENT

            # Parent loses some resources
            s.population *= 0.85
            s.food *= 0.8

        # === PHASE 3: CONFLICT (raiding) ===
        alive = [s for s in settlements if s.alive]
        settl_by_pos = {(s.x, s.y): s for s in alive}

        for s in alive:
            if not s.alive:
                continue
            # Desperate settlements raid more (video: "the desperate fight harder")
            desperation = max(0, 1.0 - s.food) * 2.0
            p_raid = raid_intensity * (1.0 + desperation)
            if rng.random() > p_raid:
                continue

            # Find nearby enemy settlements
            enemies = []
            for other in alive:
                if other.owner_id == s.owner_id or not other.alive:
                    continue
                dist = abs(s.x - other.x) + abs(s.y - other.y)
                max_range = 5 if s.has_port else 3
                if dist <= max_range:
                    enemies.append(other)

            if not enemies:
                continue

            target = rng.choice(enemies)
            # Combat: attacker strength vs defender strength
            attack = s.population * (0.5 + s.defense) * rng.uniform(0.5, 1.5)
            defend = target.population * (0.5 + target.defense) * rng.uniform(0.5, 1.5)

            if attack > defend:
                # Successful raid
                loot = min(target.food * 0.3, 0.2)
                s.food += loot
                target.food -= loot
                target.population *= 0.7
                target.defense *= 0.8
                s.wealth += 0.05

                # Faction takeover (rare)
                if target.population < 0.2 and rng.random() < 0.1:
                    target.owner_id = s.owner_id

        # === PHASE 4: WINTER ===
        alive = [s for s in settlements if s.alive]
        for s in alive:
            # Winter food consumption
            food_loss = winter_severity * rng.uniform(0.5, 1.5)
            s.food -= food_loss
            s.population -= winter_severity * 0.5 * rng.uniform(0.0, 1.0)

            # Settlement dies if food or population too low
            if s.food < 0 or s.population < 0.1:
                s.alive = False
                grid[s.y, s.x] = RUIN

        # === PHASE 5: ENVIRONMENT (reclamation) ===
        for y in range(h):
            for x in range(w):
                if grid[y, x] == RUIN:
                    # Check if nearby settlement reclaims it
                    reclaimed = False
                    for s in settlements:
                        if s.alive and abs(s.x - x) + abs(s.y - y) <= 2:
                            if s.population > 1.0 and rng.random() < 0.05:
                                # Reclaim as new settlement
                                new_s = Settlement(
                                    x=x, y=y, population=0.2,
                                    food=s.food * 0.3, defense=0.1,
                                    has_port=False, alive=True,
                                    owner_id=s.owner_id,
                                )
                                settlements.append(new_s)
                                grid[y, x] = SETTLEMENT
                                reclaimed = True
                                break

                    if not reclaimed and rng.random() < reclaim_rate:
                        # Natural reclamation: forest or plains
                        if rng.random() < RECLAIM_TO_FOREST:
                            grid[y, x] = FOREST
                        else:
                            grid[y, x] = PLAINS

    return grid


def simulate_monte_carlo(
    initial_grid: list[list[int]],
    initial_settlements: list[dict],
    n_sims: int = 100,
    expansion_rate: float = 0.08,
    winter_severity: float = 0.05,
    raid_intensity: float = 0.03,
    seed: int = 42,
) -> np.ndarray:
    """Run Monte Carlo simulations and return probability distributions.

    Returns H×W×6 tensor of terrain class probabilities.
    """
    h = len(initial_grid)
    w = len(initial_grid[0]) if h > 0 else 0

    # Terrain code → class index mapping
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

        for y in range(h):
            for x in range(w):
                cls = terrain_to_class.get(int(final_grid[y, x]), 0)
                counts[y, x, cls] += 1

    # Normalize to probabilities
    probs = counts / n_sims

    # Apply floor
    probs = np.maximum(probs, 0.0001)
    probs /= probs.sum(axis=-1, keepdims=True)

    return probs


def fit_hidden_params(
    initial_grid: list[list[int]],
    initial_settlements: list[dict],
    observations: list[dict],
    n_sims_per_eval: int = 20,
) -> dict:
    """Estimate hidden parameters from observation terrain frequencies.

    Uses a simple grid search over expansion_rate and winter_severity.
    """
    from dtos import TERRAIN_TO_CLASS

    # Compute observed terrain frequencies
    obs_cls = np.zeros(6)
    obs_total = 0
    for obs in observations:
        for row in obs.get("grid", []):
            for code in row:
                if code not in {10, 5}:
                    obs_cls[TERRAIN_TO_CLASS.get(code, 0)] += 1
                    obs_total += 1

    if obs_total < 50:
        return {"expansion_rate": 0.08, "winter_severity": 0.05, "raid_intensity": 0.03}

    obs_freq = obs_cls / obs_total
    obs_settl_rate = obs_freq[1]

    # Quick mapping from observed settlement rate to hidden params
    # Calibrated from replay data:
    #   R1: obs_settl=0.150, expansion≈0.10, winter≈0.03
    #   R2: obs_settl=0.213, expansion≈0.14, winter≈0.02
    #   R3: obs_settl=0.002, expansion≈0.01, winter≈0.15
    #   R4: obs_settl=0.100, expansion≈0.07, winter≈0.05
    expansion_rate = max(0.01, min(0.20, obs_settl_rate * 0.7))
    winter_severity = max(0.02, min(0.20, 0.08 - obs_settl_rate * 0.3))
    raid_intensity = 0.03  # relatively constant across rounds

    return {
        "expansion_rate": expansion_rate,
        "winter_severity": winter_severity,
        "raid_intensity": raid_intensity,
    }


if __name__ == "__main__":
    import json
    import time
    from evaluate import compute_score

    # Test on R4 seed 0
    with open("data/round4_initial.json") as f:
        r4 = json.load(f)

    grid = r4["initial_states"][0]["grid"]
    settlements = r4["initial_states"][0]["settlements"]
    gt = np.load("data/gt_r4_seed0.npy")

    # Run with different parameter settings
    for exp, win in [(0.07, 0.05), (0.08, 0.04), (0.10, 0.03)]:
        t0 = time.time()
        probs = simulate_monte_carlo(
            grid, settlements,
            n_sims=50,
            expansion_rate=exp,
            winter_severity=win,
            seed=42,
        )
        elapsed = time.time() - t0
        score = compute_score(probs, gt)
        print(f"exp={exp} win={win}: score={score:.2f} ({elapsed:.1f}s)")
