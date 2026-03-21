"""Gemini-guided swarm autoresearch for Astar Island.

Follows the Karpathy autoresearch protocol:
  edit train.py → run LORO → keep if improved → revert if worse → repeat

Each VM runs autonomously with Gemini generating actual code patches.
VMs share results via SCP so Gemini sees ALL experiments ("swarm intelligence").

Usage:
    VM_ID=beast176 IS_HUB=1 FLEET_IPS=10.164.0.4,10.164.0.5 \
      GOOGLE_API_KEY=... PARALLEL_XGB=18 \
      nohup python3 -u autoresearch_swarm.py > swarm.log 2>&1 &

Environment:
    VM_ID          — unique per VM (default: "vm0")
    GOOGLE_API_KEY — Gemini API key (required for AI mode)
    MODEL_ID       — Gemini model (default: "gemini-2.5-flash")
    PARALLEL_XGB   — parallel XGB workers (default: 18)
    MAX_RUNS       — max experiments (default: 200)
    IS_HUB         — "1" if this VM collects from workers
    FLEET_IPS      — comma-separated internal IPs of worker VMs
    HUB_IP         — internal IP of hub VM (for workers)
"""

import hashlib
import json
import os
import random
import re
import shutil
import subprocess
import sys
import time
import urllib.request
import urllib.error
from datetime import datetime
from pathlib import Path

TASK_DIR = Path(__file__).parent.resolve()
VM_ID = os.environ.get("VM_ID", "vm0")
GOOGLE_API_KEY = os.environ.get("GOOGLE_API_KEY", "")
GEMINI_MODEL = os.environ.get("MODEL_ID", "gemini-3.1-pro-preview")
MAX_RUNS = int(os.environ.get("MAX_RUNS", "200"))

IS_HUB = os.environ.get("IS_HUB", "0") == "1"
FLEET_IPS = [ip.strip() for ip in os.environ.get("FLEET_IPS", "").split(",") if ip.strip()]
HUB_IP = os.environ.get("HUB_IP", "")
VM_FOCUS = os.environ.get("VM_FOCUS", "general")

# VM specialization prompts — each VM gets a focused research direction
FOCUS_PROMPTS = {
    "r7_adaptive": """FOCUS: Fix R7 (72.5 — weakest round, extreme expansion).
Try: round-type detection from obs_stats (obs_settl_rate > 0.15 = expansion),
per-type blend weights, per-type L7 strengths, adaptive EMP_BLEND based on expansion rate.
The key insight: expansion rounds need LESS heuristic (lower blend weight = more XGB)
and STRONGER L7 settlement correction.""",

    "distance_decay": """FOCUS: Non-linear distance decay for expansion rounds.
Current distance tables use linear buckets (1-8, 99). Expansion rounds may need
exponential or quadratic decay. Try: distance**0.5, log(1+distance), or per-round
distance scaling based on obs_settl_rate. Also try different distance bucket boundaries.""",

    "expansion_features": """FOCUS: New features that capture settlement expansion pressure.
Try: settlement cluster density (how many settlements within r5),
expansion front detection (cells where obs_settl_rate transitions from high to low),
settlement momentum (rate of change of settlement count across observations),
food pressure (forests_r3 / settlements_r3).""",

    "faction_analysis": """FOCUS: Use faction/owner_id data from observations.
Each observation includes owner_id per settlement. Try features like:
faction count in r3, faction diversity index, dominant faction strength,
cells between different factions (conflict zone indicator),
faction territory boundary distance.""",

    "port_trade": """FOCUS: Port and trade corridor features.
Ports enable long-range trade and raiding. Try: BFS distance to nearest port,
port cluster density, cells between two ports (trade corridor),
coastal path length, port-to-port connectivity features.""",

    "winter_raiding": """FOCUS: Winter severity and raiding signal features.
Try: defense variance across observations (high = active raiding),
wealth depletion rate (fraction with wealth < 10), food deficit severity,
population crash proxy (max_pop - min_pop), dead_rate correlation features.""",

    "terrain_interaction": """FOCUS: Terrain transition and interaction features.
Try: number of terrain boundaries in r2 (edge-of-biome cells behave differently),
forest-to-plains transition count, ocean adjacency patterns,
mountain blocking features (cells behind mountains from settlements).""",

    "directional": """FOCUS: Directional expansion features.
Settlements don't expand uniformly — they follow terrain. Try:
direction to nearest settlement (N/S/E/W quadrant encoding),
coastal direction (which side has ocean), expansion vector from settlement centroid,
asymmetric distance features (distance along passable terrain vs Manhattan).""",

    "l7_tuning": """FOCUS: L7 observation ratio correction optimization.
Try: per-class L7 strengths (sweep each independently),
round-type-adaptive L7 (different strengths for expansion vs extinction),
wider/narrower clamp bounds per class, dynamic MIN_OBS thresholds,
L7 applied before vs after empirical blend.""",

    "xgb_tuning": """FOCUS: XGBoost hyperparameter optimization.
Try: per-terrain n_estimators (plains might need more than settlement),
per-terrain max_depth, per-terrain learning_rate, colsample sweep,
subsample sweep, reg_alpha/reg_lambda combinations,
min_child_weight per terrain.""",

    "general": """FOCUS: Creative exploration — try anything that might improve the score.
Look at what worked and failed in past experiments, and try new angles.""",
}


TRAIN_PY = TASK_DIR / "train.py"
TRAIN_PY_BACKUP = TASK_DIR / "train.py.backup"
TRAIN_PY_BEST = TASK_DIR / "train.py.best"

RESULTS_TSV = TASK_DIR / f"swarm_results_{VM_ID}.tsv"
SHARED_RESULTS = TASK_DIR / "swarm_results_fleet.tsv"

TSV_HEADER = "timestamp\tvm_id\tval_metric\tduration_min\tstatus\tdescription\n"

SEED = int(hashlib.md5(VM_ID.encode()).hexdigest()[:8], 16) % (2**31)


def log(msg):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{ts}] [{VM_ID}] {msg}", flush=True)


# ─── Results tracking ───────────────────────────────────────────

def init_results():
    for tsv in [RESULTS_TSV, SHARED_RESULTS]:
        if not tsv.exists():
            tsv.write_text(TSV_HEADER)


def append_result(val_metric, duration_min, status, description):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M")
    row = f"{ts}\t{VM_ID}\t{val_metric:.4f}\t{duration_min:.1f}\t{status}\t{description}\n"
    for tsv in [RESULTS_TSV, SHARED_RESULTS]:
        with open(tsv, "a") as f:
            f.write(row)


def get_best_metric():
    if not RESULTS_TSV.exists():
        return 0.0
    best = 0.0
    for line in RESULTS_TSV.read_text().strip().split("\n")[1:]:
        parts = line.split("\t")
        if len(parts) >= 5 and parts[4] == "kept":
            try:
                best = max(best, float(parts[2]))
            except ValueError:
                pass
    return best


def get_fleet_summary():
    """Summarize ALL fleet results for Gemini — swarm intelligence."""
    source = SHARED_RESULTS if SHARED_RESULTS.exists() else RESULTS_TSV
    if not source.exists():
        return "No results yet. First run."

    lines = source.read_text().strip().split("\n")
    if len(lines) <= 1:
        return "No results yet. First run."

    data = lines[1:]
    parsed = []
    for line in data:
        parts = line.split("\t")
        if len(parts) >= 6:
            try:
                metric = float(parts[2])
                status = parts[4]
                desc = parts[5]
                if metric > 0:
                    parsed.append((metric, status, desc, line))
            except (ValueError, IndexError):
                pass

    if not parsed:
        return "No successful results yet."

    parsed.sort(key=lambda x: -x[0])
    n_kept = sum(1 for _, s, _, _ in parsed if s == "kept")

    summary = f"Fleet: {len(data)} total runs, {len(parsed)} successful, {n_kept} improvements\n"
    summary += f"Best: {parsed[0][0]:.4f} | Median: {parsed[len(parsed)//2][0]:.4f}\n\n"

    summary += "TOP 10 (what works):\n"
    for m, s, desc, _ in parsed[:10]:
        summary += f"  {m:.4f} [{s}] {desc}\n"

    if len(parsed) > 10:
        summary += "\nBOTTOM 5 (what doesn't work):\n"
        for m, s, desc, _ in parsed[-5:]:
            summary += f"  {m:.4f} [{s}] {desc}\n"

    kept_descs = [desc for _, s, desc, _ in parsed if s == "kept"]
    if kept_descs:
        summary += f"\nKEPT IMPROVEMENTS ({len(kept_descs)}):\n"
        for d in kept_descs:
            summary += f"  - {d}\n"

    return summary


# ─── Swarm sync (hub/worker SCP) ────────────────────────────────

def sync_fleet_results():
    """Sync results across fleet. Hub collects, workers push/pull."""
    if IS_HUB:
        _hub_collect()
    else:
        _worker_sync()


def _hub_collect():
    """Hub: pull per-VM results from all workers, merge."""
    for ip in FLEET_IPS:
        try:
            subprocess.run(
                ["scp", "-o", "StrictHostKeyChecking=no", "-o", "ConnectTimeout=5",
                 f"root@{ip}:/tmp/astar/swarm_results_*.tsv", str(TASK_DIR) + "/"],
                capture_output=True, timeout=15
            )
        except Exception:
            pass
    _merge_results()


def _worker_sync():
    """Worker: push results to hub, pull fleet file."""
    if not HUB_IP:
        return
    # Push our results to hub
    try:
        subprocess.run(
            ["scp", "-o", "StrictHostKeyChecking=no", "-o", "ConnectTimeout=5",
             str(RESULTS_TSV), f"root@{HUB_IP}:/tmp/astar/"],
            capture_output=True, timeout=15
        )
    except Exception:
        pass
    # Pull merged fleet file from hub
    try:
        subprocess.run(
            ["scp", "-o", "StrictHostKeyChecking=no", "-o", "ConnectTimeout=5",
             f"root@{HUB_IP}:/tmp/astar/swarm_results_fleet.tsv", str(SHARED_RESULTS)],
            capture_output=True, timeout=15
        )
    except Exception:
        pass


def _merge_results():
    """Merge all local swarm_results_*.tsv into fleet file."""
    all_rows = set()
    for f in TASK_DIR.glob("swarm_results_*.tsv"):
        if f.name == "swarm_results_fleet.tsv":
            continue
        for line in f.read_text().strip().split("\n")[1:]:
            if line.strip():
                all_rows.add(line.strip())

    with open(SHARED_RESULTS, "w") as f:
        f.write(TSV_HEADER)
        for row in sorted(all_rows):
            f.write(row + "\n")


# ─── Gemini code generation ─────────────────────────────────────

def ask_gemini_for_code(current_train_py, rng):
    """Ask Gemini to generate a code change for train.py."""
    if not GOOGLE_API_KEY:
        return None

    fleet_summary = get_fleet_summary()

    # Read per-round scores from the best run's output if available
    per_round_info = """Per-round LORO scores (weakest first, from baseline):
R7=72.5 (extreme expansion), R1=85.5, R14=85.7, R5=86.5, R6=87.6, R11=87.7,
R2=92.1, R15=92.4, R10=93.0, R9=93.1, R13=93.7, R4=94.3, R8=95.2, R16=88.8
Pattern: STRONG on extinction rounds, WEAK on expansion rounds."""

    focus = FOCUS_PROMPTS.get(VM_FOCUS, FOCUS_PROMPTS["general"])

    prompt = f"""You are an ML researcher doing autonomous autoresearch on a probabilistic terrain prediction model.
The model predicts P(terrain class) on a 40x40 grid after 50 years of Norse civilization simulation.
Metric: entropy-weighted KL divergence, score=100*exp(-3*weighted_kl). Higher=better. Max=100.

{per_round_info}

YOUR SPECIALIZATION (this VM's research direction):
{focus}

FLEET EXPERIMENT HISTORY (from ALL VMs):
{fleet_summary}

CURRENT train.py (the ONLY file you can edit):
```python
{current_train_py[:12000]}
```

YOUR TASK: Generate ONE code change to train.py that might improve val_metric.
Stay focused on your specialization above. Don't repeat experiments that failed in the fleet history.

IDEAS TO EXPLORE (pick one, or invent your own):
- New features in _extract_cell_features (add to the features list, update empty array size)
- New per-cell observation features (add inline computation in evaluate_loro)
- Round-type-adaptive parameters (detect expansion vs extinction from obs_stats)
- Non-linear distance decay for expansion rounds
- New blend strategies
- Observation-derived signals (settlement cluster features, faction analysis)
- Feature interactions (multiply existing features together)

RULES:
- Output ONLY valid JSON with search_replace pairs
- Each pair: find exact string in train.py, replace with new string
- Keep changes SMALL and ISOLATED (one idea at a time)
- Don't break imports, output format, or the evaluate_loro structure
- The change must be self-contained in train.py (no model.py edits)

RESPOND WITH ONLY THIS JSON:
{{
  "description": "one-line description of what this change does",
  "search_replace": [
    {{"old": "exact string to find in train.py", "new": "replacement string"}}
  ]
}}"""

    try:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent?key={GOOGLE_API_KEY}"
        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"temperature": 0.9, "maxOutputTokens": 4000},
        }
        data = json.dumps(payload).encode()
        req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})

        with urllib.request.urlopen(req, timeout=60) as resp:
            body = json.loads(resp.read().decode())

        text = body["candidates"][0]["content"]["parts"][0]["text"].strip()
        # Strip markdown code fences
        if text.startswith("```"):
            text = "\n".join(text.split("\n")[1:])
        if text.endswith("```"):
            text = text[:-3]
        text = text.strip()

        result = json.loads(text)
        return result

    except Exception as e:
        log(f"Gemini error: {e}")
        return None


def apply_code_patch(patch):
    """Apply a search_replace patch to train.py. Returns True if all replacements succeeded."""
    source = TRAIN_PY.read_text()
    description = patch.get("description", "unknown change")

    for sr in patch.get("search_replace", []):
        old = sr.get("old", "")
        new = sr.get("new", "")
        if not old:
            log(f"  Empty search string, skipping")
            return False
        if old not in source:
            log(f"  Search string not found: {old[:80]}...")
            return False
        source = source.replace(old, new, 1)

    TRAIN_PY.write_text(source)
    return True


# ─── Parameter-only fallback ────────────────────────────────────

PARAM_SPACE = {
    "BLEND_TERRAIN": [
        '{"plains": 0.90, "forest": 0.85, "settl": 0.90}',
        '{"plains": 0.95, "forest": 0.90, "settl": 0.95}',
        '{"plains": 1.00, "forest": 0.95, "settl": 1.00}',
        '{"plains": 1.00, "forest": 1.00, "settl": 0.90}',
    ],
    "EMP_BLEND": ["0.40", "0.45", "0.48", "0.52", "0.55"],
    "L7_STRENGTHS": [
        "np.array([1.20, 0.80, 0.0, 0.0, 1.30, 0.0])",
        "np.array([1.40, 1.00, 0.0, 0.0, 1.50, 0.0])",
        "np.array([1.50, 1.10, 0.0, 0.0, 1.60, 0.0])",
        "np.array([1.60, 1.20, 0.0, 0.0, 1.70, 0.0])",
    ],
}


def apply_random_params(rng):
    """Fallback: random parameter substitution (no Gemini needed)."""
    source = TRAIN_PY_BACKUP.read_text()
    desc_parts = []

    for param, values in PARAM_SPACE.items():
        if rng.random() < 0.5:
            continue
        val = rng.choice(values)
        pattern = rf'^(\s*{re.escape(param)}\s*=\s*)(.+)$'
        new_source, n = re.subn(pattern, rf'\g<1>{val}', source, count=1, flags=re.MULTILINE)
        if n > 0:
            source = new_source
            desc_parts.append(f"{param}={val[:30]}")

    if not desc_parts:
        # Change at least one thing
        val = rng.choice(PARAM_SPACE["EMP_BLEND"])
        source = re.sub(r'EMP_BLEND\s*=\s*[\d.]+', f'EMP_BLEND = {val}', source)
        desc_parts.append(f"EMP_BLEND={val}")

    TRAIN_PY.write_text(source)
    return "param: " + ", ".join(desc_parts)


# ─── Main experiment loop ───────────────────────────────────────

def _run_train(env_override=None):
    """Run train.py and parse val_metric + per-round scores."""
    try:
        env = os.environ.copy()
        if env_override:
            env.update(env_override)
        r = subprocess.run(
            [sys.executable, str(TRAIN_PY)],
            capture_output=True, text=True, timeout=900,
            cwd=str(TASK_DIR), env=env,
        )
        output = r.stdout
        val_metric = 0.0
        per_round = {}
        for line in output.split("\n"):
            if line.startswith("val_metric:"):
                val_metric = float(line.split(":")[1].strip())
            if line.startswith("round_") and "_score:" in line:
                parts = line.split(":")
                rnum = int(parts[0].replace("round_", "").replace("_score", ""))
                per_round[rnum] = float(parts[1].strip())
        if val_metric == 0.0:
            log(f"No val_metric. Exit code: {r.returncode}")
            if r.stderr:
                log(f"stderr: {r.stderr[-300:]}")
        return val_metric, per_round, output
    except subprocess.TimeoutExpired:
        log("LORO timed out (>900s)")
        return 0.0, {}, "TIMEOUT"
    except Exception as e:
        log(f"LORO error: {e}")
        return 0.0, {}, str(e)


# Quick screen folds: R7 (expansion), R13 (medium), R16 (recent)
QUICK_FOLDS = [7, 13, 16]


def run_quick_screen():
    """Stage 1: 3-fold LORO for fast screening (~40-80s).

    Returns (avg_score, per_round, output). If avg_score beats the quick baseline,
    the experiment is worth verifying with full LORO.
    """
    log("STAGE 1: Quick screen (3-fold)...")
    env = {"LORO_FOLDS": ",".join(str(f) for f in QUICK_FOLDS)}
    return _run_train(env_override=env)


def run_full_loro():
    """Stage 2: Full 15-fold LORO for verification (~180-360s)."""
    log("STAGE 2: Full LORO (15-fold)...")
    return _run_train()


def main():
    rng = random.Random(SEED)

    log(f"{'='*60}")
    log(f"AUTORESEARCH SWARM — Karpathy protocol")
    log(f"VM={VM_ID} | Hub={'YES' if IS_HUB else 'NO'}")
    log(f"Gemini: {'ENABLED' if GOOGLE_API_KEY else 'DISABLED (random only)'}")
    log(f"Model: {GEMINI_MODEL}")
    log(f"Parallel XGB: {os.environ.get('PARALLEL_XGB', 'default')}")
    log(f"{'='*60}")

    # Save original train.py as backup
    if not TRAIN_PY_BACKUP.exists():
        shutil.copy2(TRAIN_PY, TRAIN_PY_BACKUP)
    if not TRAIN_PY_BEST.exists():
        shutil.copy2(TRAIN_PY, TRAIN_PY_BEST)

    init_results()
    best_metric = get_best_metric()
    best_quick_metric = 0.0  # quick screen baseline (updated when full LORO keeps)
    consecutive_crashes = 0

    for run_idx in range(MAX_RUNS):
        log(f"\n{'='*60}")
        log(f"Run {run_idx + 1}/{MAX_RUNS} | Best: {best_metric:.4f}")
        log(f"{'='*60}")

        # Swarm sync: share results before asking Gemini
        if run_idx > 0:
            try:
                sync_fleet_results()
                fleet_count = 0
                if SHARED_RESULTS.exists():
                    fleet_count = max(0, len(SHARED_RESULTS.read_text().strip().split("\n")) - 1)
                log(f"Fleet: {fleet_count} total results synced")
            except Exception as e:
                log(f"Sync warning: {e}")

        # Restore to best known version before each experiment
        shutil.copy2(TRAIN_PY_BEST, TRAIN_PY)

        # Get experiment: Gemini code gen (or random params fallback)
        description = "unknown"
        if run_idx < 2 or consecutive_crashes >= 3:
            # Warm-up or crash recovery: use safe parameter-only changes
            if consecutive_crashes >= 3:
                log("3+ consecutive crashes — falling back to parameter-only mode")
                consecutive_crashes = 0
            shutil.copy2(TRAIN_PY_BACKUP, TRAIN_PY)
            description = apply_random_params(rng)
            log(f"Mode: PARAMETER SWEEP")
        elif GOOGLE_API_KEY:
            # Gemini code generation
            current_code = TRAIN_PY_BEST.read_text()
            patch = ask_gemini_for_code(current_code, rng)
            if patch:
                description = patch.get("description", "gemini change")
                log(f"Mode: GEMINI CODE GEN")
                log(f"Idea: {description}")
                if not apply_code_patch(patch):
                    log("Patch failed to apply — falling back to params")
                    shutil.copy2(TRAIN_PY_BACKUP, TRAIN_PY)
                    description = apply_random_params(rng)
            else:
                log("Gemini returned nothing — using random params")
                shutil.copy2(TRAIN_PY_BACKUP, TRAIN_PY)
                description = apply_random_params(rng)
        else:
            shutil.copy2(TRAIN_PY_BACKUP, TRAIN_PY)
            description = apply_random_params(rng)

        # ── TWO-STAGE SCREENING ──────────────────────────────────
        # Stage 1: Quick 3-fold screen (~40-80s)
        # Stage 2: Full 15-fold verify (only if screen passes)
        t0 = time.time()
        quick_metric, quick_rounds, quick_output = run_quick_screen()
        screen_time = (time.time() - t0) / 60

        if quick_metric <= 0:
            log(f"CRASHED in screen ({screen_time:.1f} min)")
            append_result(0.0, screen_time, "crash", description)
            consecutive_crashes += 1
            continue

        consecutive_crashes = 0

        # Quick baseline: compare against quick scores of best config
        # (approximate — if quick score is clearly worse, skip full LORO)
        if best_quick_metric > 0 and quick_metric < best_quick_metric - 0.5:
            delta = quick_metric - best_quick_metric
            log(f"SCREEN REJECT: quick={quick_metric:.4f} ({delta:.4f} vs quick baseline)")
            append_result(quick_metric, screen_time, "screen_reject", description)
            continue

        # Stage 2: Full LORO verification
        log(f"Screen passed (quick={quick_metric:.4f}). Running full LORO...")
        t1 = time.time()
        val_metric, per_round, full_output = run_full_loro()
        full_time = (time.time() - t0) / 60  # total time

        if val_metric <= 0:
            log(f"CRASHED in full LORO ({full_time:.1f} min)")
            append_result(0.0, full_time, "crash", description)
            consecutive_crashes += 1
            continue

        if val_metric > best_metric:
            delta = val_metric - best_metric
            best_metric = val_metric
            best_quick_metric = quick_metric  # update quick baseline too
            shutil.copy2(TRAIN_PY, TRAIN_PY_BEST)
            log(f"KEPT! val_metric={val_metric:.4f} (+{delta:.4f})")
            append_result(val_metric, full_time, "kept", description)

            for rnum, score in sorted(per_round.items()):
                log(f"  R{rnum}: {score:.2f}")
        else:
            delta = val_metric - best_metric
            log(f"DISCARDED. val_metric={val_metric:.4f} ({delta:.4f})")
            append_result(val_metric, full_time, "rejected", description)

        # Push results after each experiment
        if not IS_HUB and HUB_IP:
            try:
                subprocess.run(
                    ["scp", "-o", "StrictHostKeyChecking=no", "-o", "ConnectTimeout=5",
                     str(RESULTS_TSV), f"root@{HUB_IP}:/tmp/astar/"],
                    capture_output=True, timeout=15
                )
            except Exception:
                pass

        time.sleep(5)

    log(f"\nDone. Best: {best_metric:.4f} over {MAX_RUNS} runs")
    log(f"Best train.py saved at: {TRAIN_PY_BEST}")


if __name__ == "__main__":
    main()
