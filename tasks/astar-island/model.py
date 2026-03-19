"""Astar Island prediction engine — multi-layer heuristic model.

Prediction layers:
  1. STATIC — deterministic cells (ocean, mountain, deep forest, empty plains)
  2. OBSERVED — frequency distribution from viewport query observations
  3. UNOBSERVED DYNAMIC — priors based on initial state + simulation mechanics
  4. CROSS-SEED TRANSFER — pool observations from similar cells across seeds
  5. CALIBRATION — adjust priors using learned parameters from past rounds

┌──────────────────────────────────────────────────────────────┐
│  build_prediction(initial_grid, observations, calibration)    │
│                                                               │
│  Layer 1: static_prediction()     → ocean=1.0, mountain=1.0  │
│      │                                                        │
│  Layer 2: update_with_observations() → frequency counting     │
│      │                                                        │
│  Layer 3: fill_unobserved_dynamic()  → heuristic priors      │
│      │                                                        │
│  Layer 4: apply_cross_seed_transfer() → pool across seeds    │
│      │                                                        │
│  Layer 5: apply_calibration()     → adjust from past rounds  │
│      │                                                        │
│  normalize_prediction()           → floor + renormalize       │
└──────────────────────────────────────────────────────────────┘
"""

import json
import os
from typing import Optional

import numpy as np

from dtos import (
    TERRAIN_TO_CLASS,
    NUM_CLASSES,
    STATIC_TERRAIN_CODES,
    PROB_FLOOR,
)
from utils import normalize_prediction, grid_to_class_array


# Empirical transition probabilities computed from Round 1 observations
# (50 queries across 5 seeds, pooled). Format: init_code → [P(class 0..5)]
# Calibrated from Round 1 GROUND TRUTH (not stochastic observations)
EMPIRICAL_TRANSITIONS = {
    1:  [0.3705, 0.4100, 0.0078, 0.0311, 0.1805, 0.0000],  # Settlement (n=201)
    2:  [0.3643, 0.1200, 0.3186, 0.0214, 0.1757, 0.0000],  # Port (n=7)
    4:  [0.0722, 0.1645, 0.0147, 0.0129, 0.7357, 0.0000],  # Forest (n=1663)
    5:  [0.0000, 0.0000, 0.0000, 0.0000, 0.0000, 1.0000],  # Mountain
    10: [1.0000, 0.0000, 0.0000, 0.0000, 0.0000, 0.0000],  # Ocean
    11: [0.7771, 0.1611, 0.0145, 0.0126, 0.0348, 0.0000],  # Plains (n=4719)
}

# Distance-based transition for INLAND Plains (code 11, not coastal)
# Calibrated from Round 1 GROUND TRUTH — all 5 seeds pooled
# KEY: Inland cells NEVER become ports (P(port) = 0.0)
PLAINS_INLAND_BY_DISTANCE = {
    1:  [0.701, 0.238, 0.000, 0.016, 0.046, 0.000],  # n=547
    2:  [0.717, 0.219, 0.000, 0.016, 0.048, 0.000],  # n=870
    3:  [0.728, 0.206, 0.000, 0.016, 0.051, 0.000],  # n=870
    4:  [0.760, 0.184, 0.000, 0.015, 0.042, 0.000],  # n=649
    5:  [0.875, 0.103, 0.000, 0.009, 0.013, 0.000],  # n=436
    6:  [0.907, 0.077, 0.000, 0.006, 0.010, 0.000],  # n=254
    7:  [0.948, 0.046, 0.000, 0.003, 0.004, 0.000],  # n=179
    8:  [0.986, 0.013, 0.000, 0.001, 0.001, 0.000],  # n=254
    99: [0.995, 0.005, 0.000, 0.000, 0.000, 0.000],
}

# Distance-based transition for COASTAL Plains (code 11, adjacent to ocean)
# KEY: Coastal cells CAN become ports — significant P(port) near settlements
PLAINS_COASTAL_BY_DISTANCE = {
    1:  [0.641, 0.155, 0.155, 0.015, 0.034, 0.000],  # n=45
    2:  [0.674, 0.138, 0.140, 0.014, 0.034, 0.000],  # n=95
    3:  [0.709, 0.109, 0.136, 0.014, 0.033, 0.000],  # n=138
    4:  [0.745, 0.096, 0.114, 0.011, 0.034, 0.000],  # n=152
    5:  [0.873, 0.062, 0.049, 0.006, 0.010, 0.000],  # n=130
    6:  [0.900, 0.049, 0.038, 0.005, 0.008, 0.000],  # n=93
    7:  [0.935, 0.033, 0.024, 0.003, 0.005, 0.000],  # n=62
    8:  [0.983, 0.010, 0.006, 0.001, 0.001, 0.000],  # n=108
    99: [0.995, 0.003, 0.002, 0.000, 0.000, 0.000],
}

# Distance-based transition for INLAND Forests (code 4, not coastal)
# Forests near settlements get colonized; far forests stay forest
FOREST_INLAND_BY_DISTANCE = {
    1:  [0.098, 0.243, 0.000, 0.017, 0.641, 0.000],  # n=186
    2:  [0.103, 0.225, 0.000, 0.017, 0.655, 0.000],  # n=316
    3:  [0.102, 0.203, 0.000, 0.017, 0.678, 0.000],  # n=299
    4:  [0.088, 0.192, 0.000, 0.014, 0.707, 0.000],  # n=247
    5:  [0.029, 0.097, 0.000, 0.008, 0.866, 0.000],  # n=132
    6:  [0.009, 0.047, 0.000, 0.003, 0.941, 0.000],  # n=260
    99: [0.005, 0.020, 0.000, 0.002, 0.973, 0.000],
}

# Distance-based transition for COASTAL Forests (code 4, adjacent to ocean)
# Coastal forests can become ports
FOREST_COASTAL_BY_DISTANCE = {
    1:  [0.076, 0.145, 0.170, 0.013, 0.596, 0.000],  # n=20
    2:  [0.067, 0.155, 0.134, 0.014, 0.630, 0.000],  # n=32
    3:  [0.062, 0.117, 0.145, 0.014, 0.662, 0.000],  # n=49
    4:  [0.066, 0.109, 0.115, 0.011, 0.699, 0.000],  # n=48
    5:  [0.017, 0.070, 0.054, 0.005, 0.854, 0.000],  # n=41
    6:  [0.006, 0.027, 0.021, 0.002, 0.944, 0.000],  # n=93
    99: [0.003, 0.010, 0.008, 0.001, 0.978, 0.000],
}


# ──────────────────────────────────────────────────────────────
# Layer 1: Static prediction
# ──────────────────────────────────────────────────────────────

def build_static_prediction(initial_grid: list[list[int]]) -> np.ndarray:
    """Build prediction tensor using empirical transition probabilities.

    Uses coastal/inland split with distance-based priors for Plains and Forests.
    Key insight: only coastal cells can become ports; inland P(port) = 0.
    """
    h = len(initial_grid)
    w = len(initial_grid[0]) if h > 0 else 0
    tensor = np.full((h, w, NUM_CLASSES), 1.0 / NUM_CLASSES)

    # Pre-compute settlement positions for distance calculation
    settlement_positions = []
    for y in range(h):
        for x in range(w):
            if initial_grid[y][x] in {1, 2}:
                settlement_positions.append((y, x))

    for y in range(h):
        for x in range(w):
            code = initial_grid[y][x]

            if code in {11, 0}:
                # Plains/Empty — use coastal/inland + distance-based transitions
                if settlement_positions:
                    dist = min(
                        abs(y - sy) + abs(x - sx)
                        for sy, sx in settlement_positions
                    )
                else:
                    dist = 99

                # Key insight: cells with only 1 ocean neighbor behave like
                # inland cells (high P(settl), ~zero P(port)). True port
                # formation requires 2+ adjacent ocean tiles.
                adj_ocean = _count_adjacent_ocean(initial_grid, y, x)
                exposed_coastal = adj_ocean >= 2
                table = PLAINS_COASTAL_BY_DISTANCE if exposed_coastal else PLAINS_INLAND_BY_DISTANCE

                for max_d in sorted(table.keys()):
                    if dist <= max_d:
                        tensor[y, x] = table[max_d]
                        break

            elif code == 4:
                # Forest — use coastal/inland + distance-based transitions
                if settlement_positions:
                    dist = min(
                        abs(y - sy) + abs(x - sx)
                        for sy, sx in settlement_positions
                    )
                else:
                    dist = 99

                adj_ocean = _count_adjacent_ocean(initial_grid, y, x)
                exposed_coastal = adj_ocean >= 2
                table = FOREST_COASTAL_BY_DISTANCE if exposed_coastal else FOREST_INLAND_BY_DISTANCE

                for max_d in sorted(table.keys()):
                    if dist <= max_d:
                        tensor[y, x] = table[max_d]
                        break

            elif code in EMPIRICAL_TRANSITIONS:
                tensor[y, x] = EMPIRICAL_TRANSITIONS[code]
            elif code == 3:
                tensor[y, x] = [0.15, 0.15, 0.05, 0.25, 0.35, 0.05]

    return tensor


# ──────────────────────────────────────────────────────────────
# Layer 2: Update with observations
# ──────────────────────────────────────────────────────────────

def update_with_observations(
    tensor: np.ndarray,
    observations: list[dict],
    seed_index: int,
) -> np.ndarray:
    """Update prediction tensor with observed simulation results.

    For each cell observed in a viewport, count how often each terrain
    class appeared across multiple stochastic runs. The more observations,
    the more reliable the frequency estimate.
    """
    # Collect per-cell observation counts
    h, w, _ = tensor.shape
    counts = np.zeros((h, w, NUM_CLASSES), dtype=np.float64)
    obs_count = np.zeros((h, w), dtype=np.int32)

    for obs in observations:
        if obs.get("seed_index") != seed_index:
            continue

        vp = obs["viewport"]
        grid = obs["grid"]
        vy, vx = vp["y"], vp["x"]

        for gy, row in enumerate(grid):
            for gx, code in enumerate(row):
                abs_y = vy + gy
                abs_x = vx + gx
                if 0 <= abs_y < h and 0 <= abs_x < w:
                    cls = TERRAIN_TO_CLASS.get(code, 0)
                    counts[abs_y, abs_x, cls] += 1
                    obs_count[abs_y, abs_x] += 1

    # Update tensor where we have observations
    # Bayesian blend: with few observations, the prior (from Layer 1) should
    # dominate. With many observations, the frequency should dominate.
    # We use a pseudo-count approach: treat the prior as N_PRIOR virtual observations.
    N_PRIOR = 20  # prior strength — equivalent to 20 virtual observations
    observed_mask = obs_count > 0
    for y in range(h):
        for x in range(w):
            if observed_mask[y, x]:
                n = obs_count[y, x]
                freq = counts[y, x] / n
                prior = tensor[y, x]  # from Layer 1
                # Weighted average: more observations → more weight on freq
                weight = n / (n + N_PRIOR)
                tensor[y, x] = weight * freq + (1 - weight) * prior

    return tensor


# ──────────────────────────────────────────────────────────────
# Layer 3: Fill unobserved dynamic cells with informed priors
# ──────────────────────────────────────────────────────────────

def _is_coastal(grid: list[list[int]], y: int, x: int) -> bool:
    """Check if a cell is adjacent to ocean."""
    h, w = len(grid), len(grid[0])
    for dy in [-1, 0, 1]:
        for dx in [-1, 0, 1]:
            if dy == 0 and dx == 0:
                continue
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and grid[ny][nx] == 10:
                return True
    return False


def _count_adjacent_ocean(grid: list[list[int]], y: int, x: int) -> int:
    """Count ocean cells adjacent to (y, x)."""
    h, w = len(grid), len(grid[0])
    count = 0
    for dy in [-1, 0, 1]:
        for dx in [-1, 0, 1]:
            if dy == 0 and dx == 0:
                continue
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and grid[ny][nx] == 10:
                count += 1
    return count


def _count_adjacent_forests(grid: list[list[int]], y: int, x: int) -> int:
    """Count forest cells adjacent to (y, x)."""
    h, w = len(grid), len(grid[0])
    count = 0
    for dy in [-1, 0, 1]:
        for dx in [-1, 0, 1]:
            if dy == 0 and dx == 0:
                continue
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and grid[ny][nx] == 4:
                count += 1
    return count


def _distance_to_nearest_settlement(
    grid: list[list[int]],
    y: int,
    x: int,
    settlements: list[dict],
) -> float:
    """Manhattan distance to nearest settlement."""
    if not settlements:
        return float("inf")
    return min(
        abs(y - s.get("y", 0)) + abs(x - s.get("x", 0))
        for s in settlements
    )


def fill_unobserved_dynamic(
    tensor: np.ndarray,
    initial_grid: list[list[int]],
    settlements: list[dict],
    observations: list[dict],
    seed_index: int,
) -> np.ndarray:
    """Fill unobserved dynamic cells with heuristic priors.

    Uses initial state analysis + simulation mechanics:
    - Settlements near forests get food → higher survival
    - Coastal settlements may become ports
    - Isolated settlements tend to become ruins
    - Empty land near settlements may get settled (expansion)
    """
    h, w, _ = tensor.shape

    # Build mask of observed cells
    obs_mask = np.zeros((h, w), dtype=bool)
    for obs in observations:
        if obs.get("seed_index") != seed_index:
            continue
        vp = obs["viewport"]
        vy, vx, vh, vw = vp["y"], vp["x"], vp["h"], vp["w"]
        obs_mask[vy:vy + vh, vx:vx + vw] = True

    for y in range(h):
        for x in range(w):
            code = initial_grid[y][x]

            # Skip already-observed cells
            if obs_mask[y, x]:
                continue

            # Skip truly static cells (ocean, mountain)
            if code in {10, 5}:
                continue

            adj_ocean = _count_adjacent_ocean(initial_grid, y, x)
            exposed_coastal = adj_ocean >= 2
            adj_forests = _count_adjacent_forests(initial_grid, y, x)
            dist = _distance_to_nearest_settlement(initial_grid, y, x, settlements)

            if code == 1:  # Settlement — pooled from all 5 seeds GT
                if exposed_coastal:
                    # Coastal settlements can become ports (n=11, clear signal)
                    tensor[y, x] = [0.335, 0.370, 0.110, 0.031, 0.154, 0.000]
                elif adj_forests == 0:
                    tensor[y, x] = [0.415, 0.356, 0.000, 0.029, 0.199, 0.000]
                elif adj_forests == 1:
                    tensor[y, x] = [0.384, 0.403, 0.000, 0.029, 0.184, 0.000]
                elif adj_forests == 2:
                    tensor[y, x] = [0.366, 0.419, 0.000, 0.030, 0.185, 0.000]
                else:  # 3+
                    tensor[y, x] = [0.354, 0.438, 0.000, 0.034, 0.173, 0.000]

            elif code == 2:  # Port — limited samples, use empirical
                tensor[y, x] = [0.320, 0.130, 0.310, 0.020, 0.220, 0.000]

            elif code == 3:  # Ruin — no ground truth data, keep heuristic
                if dist <= 3:
                    tensor[y, x] = [0.15, 0.20, 0.05, 0.25, 0.30, 0.05]
                else:
                    tensor[y, x] = [0.10, 0.05, 0.02, 0.25, 0.53, 0.05]

            elif code == 4:  # Forest — distance + exposed coastal from GT tables
                table = FOREST_COASTAL_BY_DISTANCE if exposed_coastal else FOREST_INLAND_BY_DISTANCE
                for max_d in sorted(table.keys()):
                    if dist <= max_d:
                        tensor[y, x] = table[max_d]
                        break

            elif code in {0, 11}:  # Plains — distance + exposed coastal from GT tables
                table = PLAINS_COASTAL_BY_DISTANCE if exposed_coastal else PLAINS_INLAND_BY_DISTANCE
                for max_d in sorted(table.keys()):
                    if dist <= max_d:
                        tensor[y, x] = table[max_d]
                        break

    return tensor


# ──────────────────────────────────────────────────────────────
# Layer 4: Cross-seed transfer
# ──────────────────────────────────────────────────────────────

def apply_cross_seed_transfer(
    tensor: np.ndarray,
    initial_grid: list[list[int]],
    all_observations: list[dict],
    seed_index: int,
    all_initial_grids: list[list[list[int]]],
    weight: float = 0.3,
) -> np.ndarray:
    """Pool observations from other seeds for cells with similar initial terrain.

    All seeds share the same hidden parameters. If a cell has the same initial
    terrain code and similar neighbors across seeds, observations from other seeds
    can inform our prediction (with lower weight).
    """
    h, w, _ = tensor.shape

    # Build observation frequency from OTHER seeds
    other_counts = np.zeros((h, w, NUM_CLASSES), dtype=np.float64)
    other_obs_count = np.zeros((h, w), dtype=np.int32)

    for obs in all_observations:
        if obs.get("seed_index") == seed_index:
            continue  # Skip same seed

        other_seed = obs["seed_index"]
        # Only transfer if the initial terrain matches
        other_grid = all_initial_grids[other_seed] if other_seed < len(all_initial_grids) else None
        if other_grid is None:
            continue

        vp = obs["viewport"]
        grid = obs["grid"]
        vy, vx = vp["y"], vp["x"]

        for gy, row in enumerate(grid):
            for gx, code in enumerate(row):
                abs_y = vy + gy
                abs_x = vx + gx
                if 0 <= abs_y < h and 0 <= abs_x < w:
                    # Only transfer if initial terrain matches
                    if other_grid[abs_y][abs_x] == initial_grid[abs_y][abs_x]:
                        cls = TERRAIN_TO_CLASS.get(code, 0)
                        other_counts[abs_y, abs_x, cls] += 1
                        other_obs_count[abs_y, abs_x] += 1

    # Blend other-seed observations into tensor
    for y in range(h):
        for x in range(w):
            if other_obs_count[y, x] > 0 and initial_grid[y][x] not in STATIC_TERRAIN_CODES:
                other_freq = other_counts[y, x] / other_obs_count[y, x]
                tensor[y, x] = (1 - weight) * tensor[y, x] + weight * other_freq

    return tensor


# ──────────────────────────────────────────────────────────────
# Layer 5: Calibration from past rounds
# ──────────────────────────────────────────────────────────────

def load_calibration() -> Optional[dict]:
    """Load calibration data from past rounds."""
    path = os.path.join(os.path.dirname(__file__), "data", "calibration.json")
    if not os.path.exists(path):
        return None
    with open(path) as f:
        return json.load(f)


def apply_calibration(
    tensor: np.ndarray,
    initial_grid: list[list[int]],
    calibration: Optional[dict],
) -> np.ndarray:
    """Adjust predictions using calibration data learned from past rounds.

    Calibration data contains learned transition probabilities:
    e.g., P(settlement survives | 3+ adjacent forests) = 0.72
    """
    if calibration is None:
        return tensor

    h, w, _ = tensor.shape

    # Apply calibrated priors for specific terrain/context combinations
    priors = calibration.get("context_priors", {})

    for y in range(h):
        for x in range(w):
            code = initial_grid[y][x]
            if code in STATIC_TERRAIN_CODES:
                continue

            key = str(code)
            coastal = _is_coastal(initial_grid, y, x)
            adj_forests = _count_adjacent_forests(initial_grid, y, x)

            # Build context key
            context = f"{key}_coastal{int(coastal)}_forests{min(adj_forests, 3)}"
            if context in priors:
                calibrated = np.array(priors[context], dtype=np.float64)
                # Blend calibration with current prediction (calibration has priority)
                blend_weight = calibration.get("blend_weight", 0.5)
                tensor[y, x] = (1 - blend_weight) * tensor[y, x] + blend_weight * calibrated

    return tensor


# ──────────────────────────────────────────────────────────────
# Ensemble support
# ──────────────────────────────────────────────────────────────

def ensemble_predictions(
    predictions: list[np.ndarray],
    weights: Optional[list[float]] = None,
) -> np.ndarray:
    """Average multiple prediction tensors, optionally with weights.

    Useful for combining different strategies:
    - Conservative (high-floor priors) vs aggressive (sharp distributions)
    - Different viewport allocations
    - With/without cross-seed transfer
    """
    if weights is None:
        weights = [1.0 / len(predictions)] * len(predictions)
    else:
        total = sum(weights)
        weights = [w / total for w in weights]

    result = np.zeros_like(predictions[0])
    for pred, w in zip(predictions, weights):
        result += w * pred
    return result


# ──────────────────────────────────────────────────────────────
# Full prediction pipeline
# ──────────────────────────────────────────────────────────────

def build_prediction(
    initial_grid: list[list[int]],
    settlements: list[dict],
    observations: list[dict],
    seed_index: int,
    all_initial_grids: list[list[list[int]]],
    all_observations: list[dict],
    calibration: Optional[dict] = None,
) -> np.ndarray:
    """Build a complete prediction tensor for one seed.

    Applies all 5 prediction layers in sequence, then normalizes.
    """
    # Layer 1: Static prediction
    tensor = build_static_prediction(initial_grid)

    # Layer 2: Observation-based frequency update (disabled — adds noise with
    # only ~10 observations per seed; GT-calibrated priors outperform raw frequencies)
    # tensor = update_with_observations(tensor, observations, seed_index)

    # Layer 3: Apply context-specific priors to ALL dynamic cells.
    # With Layer 2 disabled, Layer 3's priors (adj_forests, coastal) are better
    # than Layer 1's distance-only tables for settlements. Pass empty observations
    # to bypass the obs_mask and fill everything.
    tensor = fill_unobserved_dynamic(
        tensor, initial_grid, settlements, [], seed_index,
    )

    # Layer 4: Cross-seed transfer (disabled — hurts score by ~0.5 pts)
    # tensor = apply_cross_seed_transfer(
    #     tensor, initial_grid, all_observations, seed_index, all_initial_grids,
    # )

    # Layer 5: Calibration from past rounds
    tensor = apply_calibration(tensor, initial_grid, calibration)

    # Final normalization — CRITICAL: enforce floor + renormalize
    tensor = normalize_prediction(tensor)

    return tensor
