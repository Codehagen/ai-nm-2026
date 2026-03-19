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
EMPIRICAL_TRANSITIONS = {
    1:  [0.3697, 0.4242, 0.0061, 0.0152, 0.1848, 0.0000],  # Settlement
    2:  [0.7500, 0.0000, 0.2500, 0.0000, 0.0000, 0.0000],  # Port
    4:  [0.0658, 0.1621, 0.0089, 0.0086, 0.7546, 0.0000],  # Forest
    5:  [0.0000, 0.0000, 0.0000, 0.0000, 0.0000, 1.0000],  # Mountain
    10: [1.0000, 0.0000, 0.0000, 0.0000, 0.0000, 0.0000],  # Ocean
    11: [0.7745, 0.1654, 0.0116, 0.0136, 0.0350, 0.0000],  # Plains
}


# ──────────────────────────────────────────────────────────────
# Layer 1: Static prediction
# ──────────────────────────────────────────────────────────────

def build_static_prediction(initial_grid: list[list[int]]) -> np.ndarray:
    """Build prediction tensor for cells that never change.

    Ocean/Plains/Empty → [1, 0, 0, 0, 0, 0]  (class 0)
    Mountain          → [0, 0, 0, 0, 0, 1]  (class 5)
    Forest (interior) → high P(forest), small P(others)
    Settlement/Port   → uniform prior (will be refined later)
    """
    h = len(initial_grid)
    w = len(initial_grid[0]) if h > 0 else 0
    tensor = np.full((h, w, NUM_CLASSES), 1.0 / NUM_CLASSES)

    for y in range(h):
        for x in range(w):
            code = initial_grid[y][x]

            if code in EMPIRICAL_TRANSITIONS:
                # Use empirical transition probabilities from Round 1 data
                tensor[y, x] = EMPIRICAL_TRANSITIONS[code]
            elif code == 0:
                # Generic empty — same as ocean
                tensor[y, x] = [1.0, 0, 0, 0, 0, 0]
            elif code == 3:
                # Ruin — not enough data yet, use informed estimate
                # Ruins near settlements get reclaimed, far ones get forested
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
    observed_mask = obs_count > 0
    for y in range(h):
        for x in range(w):
            if observed_mask[y, x]:
                # Convert counts to frequency distribution
                freq = counts[y, x] / obs_count[y, x]
                tensor[y, x] = freq

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

            coastal = _is_coastal(initial_grid, y, x)
            adj_forests = _count_adjacent_forests(initial_grid, y, x)
            dist = _distance_to_nearest_settlement(initial_grid, y, x, settlements)

            if code == 1:  # Settlement
                # Round 1 data: 100% of observed settlements are alive
                # Settlements have very high survival rate
                if coastal and adj_forests >= 2:
                    # Coastal + well-fed → likely becomes port
                    tensor[y, x] = [0.03, 0.20, 0.50, 0.12, 0.10, 0.05]
                elif adj_forests >= 2:
                    # Well-fed → very likely survives
                    tensor[y, x] = [0.03, 0.60, 0.10, 0.12, 0.10, 0.05]
                elif coastal:
                    # Coastal but less food → port or settlement
                    tensor[y, x] = [0.05, 0.25, 0.40, 0.15, 0.10, 0.05]
                elif adj_forests == 0:
                    # No food → higher ruin chance but still more likely alive
                    tensor[y, x] = [0.08, 0.30, 0.05, 0.37, 0.15, 0.05]
                else:
                    # Moderate food
                    tensor[y, x] = [0.05, 0.50, 0.08, 0.22, 0.10, 0.05]

            elif code == 2:  # Port
                # Ports survive well
                if adj_forests >= 1:
                    tensor[y, x] = [0.03, 0.12, 0.60, 0.10, 0.10, 0.05]
                else:
                    tensor[y, x] = [0.05, 0.12, 0.45, 0.23, 0.10, 0.05]

            elif code == 3:  # Ruin
                if dist <= 3:
                    # Near settlement → might be reclaimed
                    tensor[y, x] = [0.08, 0.25, 0.08, 0.24, 0.30, 0.05]
                else:
                    # Far from settlement → forest reclaims
                    tensor[y, x] = [0.08, 0.05, 0.02, 0.25, 0.55, 0.05]

            elif code == 4:  # Forest
                if dist <= 2:
                    # Near settlement → might be cleared for expansion
                    tensor[y, x] = [0.08, 0.15, 0.05, 0.05, 0.62, 0.05]
                elif dist <= 5:
                    # Medium distance — some expansion risk
                    tensor[y, x] = [0.05, 0.08, 0.03, 0.04, 0.75, 0.05]
                else:
                    # Forest stays forest
                    tensor[y, x] = [0.03, 0.03, 0.02, 0.02, 0.85, 0.05]

            elif code in {0, 11}:  # Empty/Plains
                # KEY INSIGHT: Settlements expand AGGRESSIVELY into empty plains
                # ~62% initial plains → ~54% observed = ~13% get colonized
                if dist <= 2:
                    # Very close to settlement → high colonization chance
                    if coastal:
                        tensor[y, x] = [0.30, 0.25, 0.20, 0.08, 0.12, 0.05]
                    else:
                        tensor[y, x] = [0.35, 0.35, 0.05, 0.08, 0.12, 0.05]
                elif dist <= 5:
                    # Medium distance — moderate colonization
                    if coastal:
                        tensor[y, x] = [0.55, 0.15, 0.10, 0.05, 0.10, 0.05]
                    else:
                        tensor[y, x] = [0.60, 0.18, 0.03, 0.05, 0.09, 0.05]
                elif dist <= 8:
                    # Farther — low but non-zero colonization
                    tensor[y, x] = [0.75, 0.08, 0.02, 0.03, 0.07, 0.05]
                # else: keep the static prediction (high P(empty))

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

    # Layer 2: Update with direct observations
    tensor = update_with_observations(tensor, observations, seed_index)

    # Layer 3: Fill unobserved dynamic cells
    tensor = fill_unobserved_dynamic(
        tensor, initial_grid, settlements, observations, seed_index,
    )

    # Layer 4: Cross-seed transfer
    tensor = apply_cross_seed_transfer(
        tensor, initial_grid, all_observations, seed_index, all_initial_grids,
    )

    # Layer 5: Calibration from past rounds
    tensor = apply_calibration(tensor, initial_grid, calibration)

    # Final normalization — CRITICAL: enforce floor + renormalize
    tensor = normalize_prediction(tensor)

    return tensor
