"""Overnight autonomous hyperparameter search for NorgesGruppen.

Runs continuously on GPU VMs, sampling random configs from search space.
Each VM explores different configs via VM_ID-seeded RNG.

Usage on each VM:
    VM_ID=a100-0 GPU_TYPE=a100 nohup python3 autoresearch_overnight.py > overnight.log 2>&1 &

Monitor:
    tail -f overnight.log
    cat overnight_results_*.tsv | sort -t$'\t' -k3 -rn | head -20

Environment variables:
    VM_ID    — unique per VM, seeds RNG for different exploration (default: "vm0")
    GPU_TYPE — "a100" or "l4", adjusts timeout (default: "l4")
"""

import hashlib
import math
import os
import random
import shutil
import subprocess
import time
from datetime import datetime
from pathlib import Path

TASK_DIR = Path(__file__).parent.resolve()
MODELS_DIR = TASK_DIR / "models"
MODELS_DIR.mkdir(exist_ok=True)

VM_ID = os.environ.get("VM_ID", "vm0")
GPU_TYPE = os.environ.get("GPU_TYPE", "l4").lower()

# Timeout per experiment: A100 ~2.5h for 300ep, L4 ~6h
TIMEOUT_HOURS = 3.5 if GPU_TYPE == "a100" else 8.0

RESULTS_TSV = TASK_DIR / f"overnight_results_{VM_ID}.tsv"
BEST_MODEL = MODELS_DIR / f"best_overnight_{VM_ID}.pt"

# Data: 80/20 split for honest eval during search
DATA_YAML = TASK_DIR / "data" / "yolo" / "data.yaml"

# Seed RNG from VM_ID for different exploration per VM
SEED = int(hashlib.md5(VM_ID.encode()).hexdigest()[:8], 16) % (2**31)

# ─── Search space ────────────────────────────────────────────────────────
# Bold = weighted toward proven-best (70% exploitation / 30% exploration)
SEARCH_SPACE = {
    "cls":            [0.8, 0.9, 1.0, 1.0, 1.0, 1.1, 1.2],
    "box":            [5.0, 7.5, 7.5, 10.0],
    "dfl":            [1.0, 1.5, 1.5, 2.0],
    "mosaic":         [0.8, 0.9, 1.0],
    "mixup":          [0.05, 0.1, 0.15, 0.2],
    "copy_paste":     [0.05, 0.1, 0.15],
    "degrees":        [5.0, 10.0, 15.0],
    "scale":          [0.3, 0.5, 0.7],
    "epochs":         [280, 300, 300, 350],
    "close_mosaic":   [10, 15, 20, 30],
    "warmup_epochs":  [3.0, 5.0],
    "freeze":         [None, None, None, 5, 10],
    "label_smoothing": [0.0, 0.0, 0.0, 0.05, 0.1],
}

# Fixed (proven best)
FIXED = {
    "model":     "yolov8l.pt",
    "imgsz":     1280,
    "optimizer": "SGD",
    "cos_lr":    True,
    "lr0":       0.005,
    "lrf":       0.01,
    "batch":     -1,
    "patience":  50,
}


def log(msg):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{ts}] [{VM_ID}] {msg}", flush=True)


def init_results():
    if not RESULTS_TSV.exists():
        RESULTS_TSV.write_text(
            "timestamp\tvm_id\tval_metric\tseed\tcls\tbox\tdfl\tmosaic\tmixup\t"
            "copy_paste\tdegrees\tscale\tepochs\tclose_mosaic\twarmup_epochs\t"
            "freeze\tlabel_smoothing\tduration_min\tstatus\tnotes\n"
        )


def append_result(config, val_metric, duration_min, status, notes=""):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M")
    freeze_str = str(config.get("freeze", "none"))
    row = (
        f"{ts}\t{VM_ID}\t{val_metric:.4f}\t{config['seed']}\t"
        f"{config['cls']}\t{config['box']}\t{config['dfl']}\t"
        f"{config['mosaic']}\t{config['mixup']}\t{config['copy_paste']}\t"
        f"{config['degrees']}\t{config['scale']}\t{config['epochs']}\t"
        f"{config['close_mosaic']}\t{config['warmup_epochs']}\t"
        f"{freeze_str}\t{config['label_smoothing']}\t"
        f"{duration_min:.1f}\t{status}\t{notes}\n"
    )
    with open(RESULTS_TSV, "a") as f:
        f.write(row)


def get_best_metric():
    if not RESULTS_TSV.exists():
        return 0.0
    best = 0.0
    for line in RESULTS_TSV.read_text().strip().split("\n")[1:]:
        parts = line.split("\t")
        if len(parts) >= 19 and parts[18] in ("kept", "new_best"):
            try:
                best = max(best, float(parts[2]))
            except ValueError:
                pass
    return best


def sample_config(rng):
    """Sample a random config from the search space."""
    config = {}
    for key, values in SEARCH_SPACE.items():
        config[key] = rng.choice(values)
    config["seed"] = rng.randint(0, 9999)
    return config


def config_to_name(config, run_idx):
    """Generate a short experiment name."""
    return f"overnight_{VM_ID}_r{run_idx}"


def generate_train_script(config, exp_name):
    """Generate an inline training script for this config."""
    freeze_line = ""
    if config["freeze"] is not None:
        freeze_line = f"    freeze={config['freeze']},"

    label_smoothing_line = ""
    if config["label_smoothing"] > 0:
        label_smoothing_line = f"    label_smoothing={config['label_smoothing']},"

    script = f'''
import os
os.environ["WANDB_DISABLED"] = "true"
os.environ["WANDB_MODE"] = "disabled"
os.environ["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"

import torch
_orig = torch.load
def _patched(*a, **kw):
    if "weights_only" not in kw: kw["weights_only"] = False
    return _orig(*a, **kw)
torch.load = _patched

from ultralytics import YOLO
from pathlib import Path

model = YOLO("{FIXED['model']}")
results = model.train(
    data="{DATA_YAML}",
    imgsz={FIXED['imgsz']},
    epochs={config['epochs']},
    batch={FIXED['batch']},
    patience={FIXED['patience']},
    device=0,
    project="runs",
    name="{exp_name}",
    exist_ok=True,
    seed={config['seed']},
    # Optimizer (fixed proven-best)
    optimizer="{FIXED['optimizer']}",
    cos_lr={FIXED['cos_lr']},
    lr0={FIXED['lr0']},
    lrf={FIXED['lrf']},
    warmup_epochs={config['warmup_epochs']},
    close_mosaic={config['close_mosaic']},
    # Loss weights (search)
    box={config['box']},
    cls={config['cls']},
    dfl={config['dfl']},
    # Augmentation (search)
    mosaic={config['mosaic']},
    mixup={config['mixup']},
    copy_paste={config['copy_paste']},
    degrees={config['degrees']},
    scale={config['scale']},
    fliplr=0.5,
    flipud=0.0,
    hsv_h=0.015,
    hsv_s=0.5,
    hsv_v=0.3,
{freeze_line}
{label_smoothing_line}
    # Save
    save=True,
    save_period=-1,
    plots=False,
    verbose=True,
)

metrics = results.results_dict
map50 = metrics.get("metrics/mAP50(B)", 0.0)
print(f"val_metric: {{map50}}")

best_pt = Path("runs") / "{exp_name}" / "weights" / "best.pt"
if best_pt.exists():
    size_mb = best_pt.stat().st_size / (1024 * 1024)
    print(f"model_size_mb: {{size_mb:.1f}}")

try:
    peak = torch.cuda.max_memory_allocated() / (1024**2)
    print(f"peak_vram_mb: {{peak:.0f}}")
except: pass
'''
    return script


def run_experiment(config, run_idx):
    """Run a single experiment. Returns val_metric or None on failure."""
    exp_name = config_to_name(config, run_idx)
    log(f"--- Run {run_idx}: {exp_name} ---")
    log(f"Config: seed={config['seed']} cls={config['cls']} box={config['box']} "
        f"dfl={config['dfl']} mosaic={config['mosaic']} mixup={config['mixup']} "
        f"cp={config['copy_paste']} deg={config['degrees']} scale={config['scale']} "
        f"ep={config['epochs']} cm={config['close_mosaic']} wu={config['warmup_epochs']} "
        f"freeze={config['freeze']} ls={config['label_smoothing']}")

    start = time.time()

    # Write temp training script
    train_script_path = TASK_DIR / f"_tmp_{exp_name}.py"
    train_script_path.write_text(generate_train_script(config, exp_name))

    env = os.environ.copy()
    env["WANDB_DISABLED"] = "true"
    env["WANDB_MODE"] = "disabled"
    env["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"

    try:
        result = subprocess.run(
            ["python3", str(train_script_path)],
            cwd=str(TASK_DIR),
            capture_output=True,
            text=True,
            timeout=TIMEOUT_HOURS * 3600,
            env=env,
        )

        duration_min = (time.time() - start) / 60

        # Cleanup temp script
        train_script_path.unlink(missing_ok=True)

        # Save log
        log_file = TASK_DIR / f"{exp_name}.log"
        log_file.write_text(result.stdout[-50000:] + "\n--- STDERR ---\n" + result.stderr[-10000:])

        if result.returncode != 0:
            err_lines = [l for l in result.stderr.split("\n") if l.strip()][-5:]
            log(f"FAILED ({duration_min:.1f}min): {'; '.join(err_lines)}")
            append_result(config, 0.0, duration_min, "failed", f"exit {result.returncode}")
            cleanup_run(exp_name)
            return None

        # Parse metrics
        val_metric = None
        for line in result.stdout.split("\n"):
            if line.startswith("val_metric:"):
                try:
                    val_metric = float(line.split(":")[1].strip())
                except ValueError:
                    pass

        if val_metric is None or not math.isfinite(val_metric):
            log(f"NO METRIC ({duration_min:.1f}min)")
            append_result(config, 0.0, duration_min, "failed", "no val_metric")
            cleanup_run(exp_name)
            return None

        current_best = get_best_metric()
        if val_metric > current_best:
            log(f"NEW BEST: {val_metric:.4f} > {current_best:.4f} ({duration_min:.1f}min)")
            best_pt_path = TASK_DIR / "runs" / exp_name / "weights" / "best.pt"
            if best_pt_path.exists():
                shutil.copy2(best_pt_path, BEST_MODEL)
            append_result(config, val_metric, duration_min, "kept",
                         f"beat {current_best:.4f}")
        else:
            log(f"NO GAIN: {val_metric:.4f} <= {current_best:.4f} ({duration_min:.1f}min)")
            append_result(config, val_metric, duration_min, "rejected",
                         f"below {current_best:.4f}")

        # Cleanup run directory to save disk space (keep best model only)
        cleanup_run(exp_name)

        return val_metric

    except subprocess.TimeoutExpired:
        train_script_path.unlink(missing_ok=True)
        duration_min = (time.time() - start) / 60
        log(f"TIMEOUT ({duration_min:.0f}min)")
        append_result(config, 0.0, duration_min, "timeout", "")
        cleanup_run(exp_name)
        return None

    except Exception as e:
        train_script_path.unlink(missing_ok=True)
        duration_min = (time.time() - start) / 60
        log(f"CRASH: {e}")
        append_result(config, 0.0, duration_min, "crash", str(e)[:100])
        cleanup_run(exp_name)
        return None


def cleanup_run(exp_name):
    """Delete run directory to save disk space. Best model already saved."""
    run_dir = TASK_DIR / "runs" / exp_name
    if run_dir.exists():
        try:
            shutil.rmtree(run_dir)
        except Exception as e:
            log(f"Warning: cleanup failed for {run_dir}: {e}")


def wait_for_gpu():
    """Wait until no other python training is running on GPU."""
    while True:
        try:
            result = subprocess.run(
                ["nvidia-smi", "--query-compute-apps=pid,name", "--format=csv,noheader"],
                capture_output=True, text=True, timeout=10
            )
            if result.returncode == 0 and result.stdout.strip():
                log("GPU busy, waiting 60s...")
                time.sleep(60)
            else:
                return
        except Exception:
            return


def main():
    rng = random.Random(SEED)

    log(f"Overnight autoresearch starting")
    log(f"VM_ID={VM_ID}, GPU_TYPE={GPU_TYPE}, timeout={TIMEOUT_HOURS}h")
    log(f"RNG seed={SEED} (from VM_ID hash)")
    log(f"Data: {DATA_YAML}")
    log(f"Results: {RESULTS_TSV}")

    init_results()

    # Wait for GPU to be free (in case L4 is still finishing previous training)
    wait_for_gpu()

    run_idx = 0
    while True:
        run_idx += 1
        config = sample_config(rng)

        log(f"\n{'='*60}")
        log(f"Experiment {run_idx}")
        log(f"Best so far: {get_best_metric():.4f}")
        log(f"{'='*60}")

        try:
            run_experiment(config, run_idx)
        except Exception as e:
            log(f"Unexpected error in run {run_idx}: {e}")

        # Brief cooldown between experiments
        time.sleep(10)


if __name__ == "__main__":
    main()
