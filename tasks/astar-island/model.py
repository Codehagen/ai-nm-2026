"""Astar Island prediction engine — heuristic + GBT hybrid model.

Prediction layers:
  1. STATIC — distance-based coastal/inland priors from GT tables
  2. OBSERVED — DISABLED (noisy with few observations)
  3. CONTEXT — adj_forests, adj_settlements, exposed_coastal priors
  4. CROSS-SEED — DISABLED
  5. CALIBRATION — blend with learned context priors
  6. GBT BLEND — blend with gradient-boosted tree predictions

The GBT model captures feature interactions the hand-tuned tables miss.
Trained on Round 1 GT, validated with leave-one-seed-out CV.
"""

import json
import os
import pickle
import warnings
from typing import Optional

import numpy as np
from scipy import ndimage

warnings.filterwarnings("ignore", category=UserWarning)  # suppress xgboost warnings

from dtos import (
    TERRAIN_TO_CLASS,
    NUM_CLASSES,
    STATIC_TERRAIN_CODES,
    PROB_FLOOR,
)
from utils import normalize_prediction, grid_to_class_array


# ──────────────────────────────────────────────────────────────
# GBT model support
# ──────────────────────────────────────────────────────────────

GBT_BLEND_WEIGHT = 0.25  # how much to weight GBT vs heuristic (cross-round validated)
_gbt_models = None  # lazy-loaded


def _extract_cell_features(
    initial_grid: list[list[int]],
    settlements: list,
) -> tuple[np.ndarray, list[tuple[int, int]]]:
    """Extract per-cell feature vectors for dynamic cells.

    Returns (features_array, list_of_coords) where coords maps row index → (y, x).
    """
    h = len(initial_grid)
    w = len(initial_grid[0]) if h > 0 else 0

    settl_pos = []
    port_pos = []
    for s in settlements:
        if isinstance(s, dict):
            settl_pos.append((s.get("x", 0), s.get("y", 0)))
            if s.get("has_port"):
                port_pos.append((s.get("x", 0), s.get("y", 0)))
        else:
            settl_pos.append((s.x, s.y))
            if getattr(s, "has_port", False):
                port_pos.append((s.x, s.y))

    # Pre-compute grid-level features
    grid_arr = np.array(initial_grid)
    land_mask = (grid_arr != 10) & (grid_arr != 5)
    passable_mask = land_mask.astype(np.float64)

    # Connected components
    labeled, _ = ndimage.label(land_mask)
    comp_sizes = {}
    comp_settl = {}
    for y_ in range(h):
        for x_ in range(w):
            comp = labeled[y_, x_]
            if comp > 0:
                comp_sizes[comp] = comp_sizes.get(comp, 0) + 1
                if initial_grid[y_][x_] in {1, 2}:
                    comp_settl[comp] = comp_settl.get(comp, 0) + 1

    # BFS distance from all settlements over passable terrain
    from collections import deque
    bfs_dist = np.full((h, w), 99, dtype=np.int32)
    q = deque()
    for sx, sy in settl_pos:
        if 0 <= sy < h and 0 <= sx < w:
            bfs_dist[sy, sx] = 0
            q.append((sy, sx))
    while q:
        cy, cx = q.popleft()
        for dy, dx in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
            ny, nx = cy + dy, cx + dx
            if 0 <= ny < h and 0 <= nx < w and land_mask[ny, nx] and bfs_dist[ny, nx] > bfs_dist[cy, cx] + 1:
                bfs_dist[ny, nx] = bfs_dist[cy, cx] + 1
                q.append((ny, nx))

    # Passable cells in 5x5 window (convolution)
    kernel5 = np.ones((5, 5))
    passable_r2 = ndimage.convolve(passable_mask, kernel5, mode='constant', cval=0.0)

    # Land ratio in 7x7 window (radius 3)
    land_float = (grid_arr != 10).astype(np.float64)
    kernel7 = np.ones((7, 7))
    land_sum_r3 = ndimage.convolve(land_float, kernel7, mode='constant', cval=0.0)
    land_count_r3 = ndimage.convolve(np.ones((h, w)), kernel7, mode='constant', cval=0.0)
    land_ratio_r3 = land_sum_r3 / np.maximum(land_count_r3, 1.0)

    features = []
    coords = []
    for y in range(h):
        for x in range(w):
            code = initial_grid[y][x]
            if code in {10, 5}:
                continue

            dist = min(
                (abs(y - sy) + abs(x - sx) for sx, sy in settl_pos), default=99
            )
            adj_ocean = sum(
                1 for dy in [-1, 0, 1] for dx in [-1, 0, 1]
                if not (dy == 0 and dx == 0)
                and 0 <= y + dy < h and 0 <= x + dx < w
                and initial_grid[y + dy][x + dx] == 10
            )
            adj_forest = sum(
                1 for dy in [-1, 0, 1] for dx in [-1, 0, 1]
                if not (dy == 0 and dx == 0)
                and 0 <= y + dy < h and 0 <= x + dx < w
                and initial_grid[y + dy][x + dx] == 4
            )
            adj_settl = sum(
                1 for dy in [-1, 0, 1] for dx in [-1, 0, 1]
                if not (dy == 0 and dx == 0)
                and 0 <= y + dy < h and 0 <= x + dx < w
                and initial_grid[y + dy][x + dx] in {1, 2}
            )
            adj_mountain = sum(
                1 for dy in [-1, 0, 1] for dx in [-1, 0, 1]
                if not (dy == 0 and dx == 0)
                and 0 <= y + dy < h and 0 <= x + dx < w
                and initial_grid[y + dy][x + dx] == 5
            )

            # Distance to 2nd nearest settlement
            dists_sorted = sorted(
                abs(y - sy) + abs(x - sx) for sx, sy in settl_pos
            )
            dist2 = dists_sorted[1] if len(dists_sorted) >= 2 else 99

            # Settlements within radius 4
            nearby_settl = sum(
                1 for sx, sy in settl_pos
                if abs(y - sy) + abs(x - sx) <= 4
            )

            # Distance to nearest ocean and mountain (scan radius 8)
            dist_ocean = 99
            dist_mountain = 99
            for dy in range(-8, 9):
                for dx in range(-8, 9):
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < h and 0 <= nx < w:
                        d = abs(dy) + abs(dx)
                        if d > 8:
                            continue
                        if initial_grid[ny][nx] == 10 and d < dist_ocean:
                            dist_ocean = d
                        if initial_grid[ny][nx] == 5 and d < dist_mountain:
                            dist_mountain = d

            # Count forests in radius 2
            forests_r2 = sum(
                1 for dy in range(-2, 3) for dx in range(-2, 3)
                if not (dy == 0 and dx == 0)
                and abs(dy) + abs(dx) <= 2
                and 0 <= y + dy < h and 0 <= x + dx < w
                and initial_grid[y + dy][x + dx] == 4
            )

            # Settlements within radius 3
            settlements_r3 = sum(
                1 for sx, sy in settl_pos
                if abs(y - sy) + abs(x - sx) <= 3
            )

            # Settlements in radius bands (captures expansion pressure at different scales)
            settl_r12 = sum(
                1 for sx, sy in settl_pos
                if 1 <= abs(y - sy) + abs(x - sx) <= 2
            )
            settl_r57 = sum(
                1 for sx, sy in settl_pos
                if 5 <= abs(y - sy) + abs(x - sx) <= 7
            )

            # Distance to nearest initial port
            dist_port = min(
                (abs(y - py) + abs(x - px) for px, py in port_pos), default=99
            )

            # Connected component features
            comp = labeled[y, x]
            comp_size = comp_sizes.get(comp, 0)
            comp_n_settl = comp_settl.get(comp, 0)

            # New features from research agent analysis
            dist_to_edge = min(y, x, h - 1 - y, w - 1 - x)
            bfs_d = int(bfs_dist[y, x])
            passable_5x5 = int(passable_r2[y, x])
            land_r3 = float(land_ratio_r3[y, x])

            features.append([
                code, dist, adj_ocean, adj_forest, adj_settl, adj_mountain,
                int(code == 11), int(code == 4), int(code == 1), int(code == 2),
                int(adj_ocean >= 2),
                dist2, nearby_settl, len(settl_pos),
                dist_ocean, dist_mountain, forests_r2,
                y, x,  # map position (captures fjord/border effects)
                settlements_r3, settl_r12, settl_r57,
                dist_port, comp_size, comp_n_settl,
                dist_to_edge, bfs_d, passable_5x5, land_r3,
                land_r3 / (1 + bfs_d),  # interaction: dense land + close to settlement
            ])
            coords.append((y, x))

    return np.array(features) if features else np.empty((0, 30)), coords


def load_gbt_models() -> Optional[list]:
    """Load pre-trained GBT models from pickle."""
    global _gbt_models
    if _gbt_models is not None:
        return _gbt_models

    path = os.path.join(os.path.dirname(__file__), "data", "gbt_models.pkl")
    if not os.path.exists(path):
        return None

    with open(path, "rb") as f:
        _gbt_models = pickle.load(f)
    return _gbt_models


def gbt_predict(
    initial_grid: list[list[int]],
    settlements: list,
) -> Optional[np.ndarray]:
    """Generate predictions using pre-trained terrain-specific GBT ensembles.

    Uses separate models for plains, forests, and settlements — specialist
    models capture terrain-specific dynamics better than a single model.

    Returns H×W×6 tensor, or None if models not available.
    """
    models_dict = load_gbt_models()
    if models_dict is None:
        return None

    h = len(initial_grid)
    w = len(initial_grid[0]) if h > 0 else 0
    features, coords = _extract_cell_features(initial_grid, settlements)

    if len(features) == 0:
        return None

    tensor = np.zeros((h, w, NUM_CLASSES))
    # Static cells
    for y in range(h):
        for x in range(w):
            if initial_grid[y][x] == 10:
                tensor[y, x] = [1, 0, 0, 0, 0, 0]
            elif initial_grid[y][x] == 5:
                tensor[y, x] = [0, 0, 0, 0, 0, 1]

    # Terrain-specific predictions
    if isinstance(models_dict, dict):
        # New format: terrain-specific models
        for i, (y, x) in enumerate(coords):
            code = initial_grid[y][x]
            if code in {11, 0}:
                ttype = "plains"
            elif code == 4:
                ttype = "forest"
            elif code in {1, 2}:
                ttype = "settl"
            else:
                ttype = "plains"  # fallback

            models = models_dict.get(ttype)
            if models is None:
                continue

            pred_v = np.zeros(NUM_CLASSES)
            for cls in range(NUM_CLASSES):
                pred_v[cls] = models[cls].predict(features[i:i + 1])[0]
            tensor[y, x] = np.maximum(pred_v, PROB_FLOOR)
            tensor[y, x] /= tensor[y, x].sum()
    else:
        # Legacy format: single model for all cells
        gbt_flat = np.zeros((len(coords), NUM_CLASSES))
        for cls in range(NUM_CLASSES):
            gbt_flat[:, cls] = models_dict[cls].predict(features)
        for i, (y, x) in enumerate(coords):
            tensor[y, x] = np.maximum(gbt_flat[i], PROB_FLOOR)
            tensor[y, x] /= tensor[y, x].sum()

    return tensor


# Empirical transition probabilities computed from Round 1 observations
# (50 queries across 5 seeds, pooled). Format: init_code → [P(class 0..5)]
# Calibrated from Round 1 GROUND TRUTH (not stochastic observations)
EMPIRICAL_TRANSITIONS = {
    1:  [0.3773, 0.4099, 0.0064, 0.0327, 0.1737, 0.0000],  # Settlement (n=430, R1+R2)
    2:  [0.3764, 0.1208, 0.2997, 0.0294, 0.1736, 0.0000],  # Port (n=18)
    4:  [0.0890, 0.1770, 0.0135, 0.0154, 0.7051, 0.0000],  # Forest (n=3338)
    5:  [0.0000, 0.0000, 0.0000, 0.0000, 0.0000, 1.0000],  # Mountain
    10: [1.0000, 0.0000, 0.0000, 0.0000, 0.0000, 0.0000],  # Ocean
    11: [0.7559, 0.1729, 0.0147, 0.0155, 0.0410, 0.0000],  # Plains (n=9812)
}

# Distance-based transition for INLAND Plains (code 11, not coastal)
# Calibrated from Round 1 GROUND TRUTH — all 5 seeds pooled
# KEY: Inland cells NEVER become ports (P(port) = 0.0)
PLAINS_INLAND_BY_DISTANCE = {
    1:  [0.700, 0.232, 0.001, 0.018, 0.050, 0.000],  # n=1199 (R1+R2)
    2:  [0.707, 0.221, 0.000, 0.019, 0.052, 0.000],  # n=1918
    3:  [0.718, 0.208, 0.001, 0.019, 0.054, 0.000],  # n=1876
    4:  [0.738, 0.196, 0.001, 0.017, 0.048, 0.000],  # n=1357
    5:  [0.807, 0.151, 0.000, 0.014, 0.028, 0.000],  # n=851
    6:  [0.862, 0.111, 0.000, 0.010, 0.017, 0.000],  # n=462
    7:  [0.908, 0.076, 0.000, 0.006, 0.009, 0.000],  # n=280
    8:  [0.966, 0.029, 0.000, 0.002, 0.003, 0.000],  # n=341
    99: [0.990, 0.008, 0.000, 0.001, 0.001, 0.000],
}

# Distance-based transition for COASTAL Plains (code 11, adjacent to ocean)
# KEY: Coastal cells CAN become ports — significant P(port) near settlements
PLAINS_COASTAL_BY_DISTANCE = {
    1:  [0.688, 0.114, 0.143, 0.015, 0.039, 0.000],  # n=85 (R1+R2)
    2:  [0.689, 0.110, 0.145, 0.016, 0.039, 0.000],  # n=187
    3:  [0.710, 0.105, 0.132, 0.015, 0.037, 0.000],  # n=263
    4:  [0.739, 0.092, 0.118, 0.013, 0.038, 0.000],  # n=261
    5:  [0.812, 0.080, 0.074, 0.009, 0.025, 0.000],  # n=231
    6:  [0.857, 0.068, 0.052, 0.009, 0.014, 0.000],  # n=187
    7:  [0.881, 0.058, 0.041, 0.007, 0.012, 0.000],  # n=120
    8:  [0.952, 0.027, 0.015, 0.002, 0.004, 0.000],  # n=194
    99: [0.985, 0.008, 0.005, 0.001, 0.001, 0.000],
}

# Distance-based transition for INLAND Forests (code 4, not coastal)
# Forests near settlements get colonized; far forests stay forest
FOREST_INLAND_BY_DISTANCE = {
    1:  [0.113, 0.239, 0.001, 0.019, 0.629, 0.000],  # n=408 (R1+R2)
    2:  [0.115, 0.226, 0.001, 0.019, 0.639, 0.000],  # n=670
    3:  [0.114, 0.207, 0.000, 0.019, 0.660, 0.000],  # n=628
    4:  [0.103, 0.199, 0.000, 0.017, 0.681, 0.000],  # n=488
    5:  [0.063, 0.152, 0.001, 0.012, 0.773, 0.000],  # n=284
    6:  [0.038, 0.118, 0.000, 0.010, 0.834, 0.000],  # n=180
    7:  [0.017, 0.077, 0.000, 0.006, 0.899, 0.000],  # n=85
    8:  [0.009, 0.036, 0.000, 0.003, 0.951, 0.000],  # n=147
    99: [0.005, 0.015, 0.000, 0.001, 0.979, 0.000],
}

# Distance-based transition for COASTAL Forests (code 4, adjacent to ocean)
# Coastal forests can become ports
FOREST_COASTAL_BY_DISTANCE = {
    1:  [0.083, 0.122, 0.165, 0.014, 0.617, 0.000],  # n=30 (R1+R2)
    2:  [0.076, 0.122, 0.158, 0.015, 0.630, 0.000],  # n=47
    3:  [0.079, 0.113, 0.143, 0.016, 0.649, 0.000],  # n=79
    4:  [0.086, 0.094, 0.120, 0.014, 0.685, 0.000],  # n=76
    5:  [0.048, 0.087, 0.082, 0.009, 0.774, 0.000],  # n=77
    6:  [0.021, 0.069, 0.053, 0.005, 0.852, 0.000],  # n=37
    7:  [0.020, 0.054, 0.046, 0.005, 0.875, 0.000],  # n=41
    8:  [0.008, 0.022, 0.013, 0.003, 0.954, 0.000],  # n=61
    99: [0.004, 0.010, 0.006, 0.002, 0.978, 0.000],
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

            if code == 1:  # Settlement — R1+R2 pooled
                if exposed_coastal:
                    # Coastal settlements can become ports
                    tensor[y, x] = [0.355, 0.140, 0.328, 0.025, 0.151, 0.000]
                elif adj_forests == 0:
                    tensor[y, x] = [0.415, 0.365, 0.000, 0.033, 0.187, 0.000]
                elif adj_forests == 1:
                    tensor[y, x] = [0.386, 0.407, 0.000, 0.031, 0.176, 0.000]
                elif adj_forests == 2:
                    tensor[y, x] = [0.372, 0.422, 0.000, 0.033, 0.173, 0.000]
                else:  # 3+
                    tensor[y, x] = [0.362, 0.436, 0.000, 0.034, 0.168, 0.000]

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
                        base = np.array(table[max_d], dtype=np.float64)
                        break
                else:
                    base = np.array(table[99], dtype=np.float64)

                tensor[y, x] = base

            elif code in {0, 11}:  # Plains — distance + exposed coastal from GT tables
                table = PLAINS_COASTAL_BY_DISTANCE if exposed_coastal else PLAINS_INLAND_BY_DISTANCE
                for max_d in sorted(table.keys()):
                    if dist <= max_d:
                        base = np.array(table[max_d], dtype=np.float64)
                        break
                else:
                    base = np.array(table[99], dtype=np.float64)

                # adj_settlement boost removed — XGBoost captures this via features

                tensor[y, x] = base

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
                # Tuned: 0.16 is optimal (grid searched 0.05-0.20)
                blend_weight = 0.16
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

    # Layer 5: Calibration (disabled — GBT subsumes calibration's role)
    # tensor = apply_calibration(tensor, initial_grid, calibration)

    # Layer 6: GBT blend — captures feature interactions the tables miss
    gbt_pred = gbt_predict(initial_grid, settlements)
    if gbt_pred is not None:
        tensor = (1 - GBT_BLEND_WEIGHT) * tensor + GBT_BLEND_WEIGHT * gbt_pred

    # Layer 7: Observation-based ratio correction.
    # Use pooled observations from ALL seeds to estimate the hidden expansion
    # rate, then adjust predictions to match observed terrain frequencies.
    # This adapts the model to each round's unique hidden parameters.
    if all_observations:
        obs_cls = np.zeros(NUM_CLASSES)
        obs_total = 0
        for obs in all_observations:
            for row in obs.get("grid", []):
                for code in row:
                    if code not in {10, 5}:  # skip static
                        obs_cls[TERRAIN_TO_CLASS.get(code, 0)] += 1
                        obs_total += 1

        if obs_total > 100:  # need enough observations
            obs_freq = obs_cls / obs_total
            # Compute model's average prediction for dynamic cells
            h, w, _ = tensor.shape
            model_avg = np.zeros(NUM_CLASSES)
            m_count = 0
            for y in range(h):
                for x in range(w):
                    if initial_grid[y][x] not in {10, 5}:
                        model_avg += tensor[y, x]
                        m_count += 1
            if m_count > 0:
                model_avg /= m_count
                ratio = obs_freq / np.maximum(model_avg, 1e-6)
                # Per-class correction strengths (cross-round validated):
                # Weak for empty/port (stable), stronger for settlement/ruin (variable)
                cls_strength = np.array([1.38, 0.90, 0.44, 0.61, 1.16, 0.0])
                adj = 1.0 + cls_strength * (ratio - 1.0)
                for y in range(h):
                    for x in range(w):
                        if initial_grid[y][x] in {10, 5}:
                            continue
                        tensor[y, x] *= adj
                        tensor[y, x] = np.maximum(tensor[y, x], PROB_FLOOR)
                        tensor[y, x] /= tensor[y, x].sum()

    # Final normalization — CRITICAL: enforce floor + renormalize
    tensor = normalize_prediction(tensor)

    return tensor
