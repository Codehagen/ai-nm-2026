# VM Fleet Overview — NorgesGruppen Autoresearch

**Last updated:** 2026-03-20 09:05 UTC
**Compute:** Sponsored (AI Championship) — free runs
**Best result so far:** Exp1 YOLOv8l 200ep → val mAP50=0.720, competition score=0.6894 (YOLOv8m)
**Fleet:** 16 GPUs (5x A100 40GB + 11x L4 24GB)

## Live Experiments

### A100 Fleet (5x 40GB VRAM, ~3x faster than L4)

| VM | IP | Experiment | Config | Epoch | mAP50 |
|----|-----|-----------|--------|-------|-------|
| a100 | 34.41.67.231 | YOLOv8x low LR | yolov8x lr=0.005 batch=8 200ep | 19 | 0.261 |
| a100-2 | 34.45.96.187 | YOLOv8x 1600px | yolov8x 1600px batch=4 200ep | 54 | 0.430 |
| a100-3 | 35.239.153.96 | YOLOv8x cosine LR | yolov8x cos_lr batch=8 200ep | 58 | 0.427 |
| a100-6 | 34.123.55.182 | YOLOv8l big batch | yolov8l batch=16 300ep | 1 | - |
| a100-9 | 34.172.76.207 | Ensemble seed=7 | yolov8l batch=16 300ep seed=7 | 1 | - |

### L4 Fleet (11x 24GB VRAM)

| VM | IP | Experiment | Config | Epoch | mAP50 |
|----|-----|-----------|--------|-------|-------|
| ar2 | 34.38.119.86 | Finetune lr=0.001 | best→lr=0.001 100ep | 27 | **0.463** |
| exp4 | 34.77.212.123 | Heavy augmentation | mixup=0.3 copy=0.3 200ep | 159 | 0.427 |
| exp5 | 34.135.158.38 | Light augmentation | mosaic=0.5 no mixup 200ep | 168 | 0.451 |
| exp6 | 34.123.93.2 | 300 epochs | yolov8l 300ep 1280px | 24 | 0.270 |
| exp7 | 136.115.124.244 | Low LR (0.005) | yolov8l lr=0.005 200ep | 163 | 0.450 |
| exp8 | 35.232.74.204 | Freeze backbone | freeze=10 200ep | 50 | 0.397 |
| exp9 | 34.71.125.9 | Seed=0 | yolov8l seed=0 200ep | 49 | 0.396 |
| exp10 | 35.192.44.183 | Seed=123 | yolov8l seed=123 200ep | 50 | 0.396 |
| exp11 | 34.123.169.171 | Rectangular train | rect=True 200ep | 50 | 0.397 |
| exp12 | 34.56.196.65 | Close mosaic=20 | close_mosaic=20 200ep | 50 | 0.397 |
| exp13 | 34.135.45.164 | SGD optimizer | optimizer=SGD 200ep | 50 | 0.397 |

## Completed Experiments

| Experiment | Model | Val mAP50 | Score | Status | Key Finding |
|------------|-------|-----------|-------|--------|-------------|
| Baseline | YOLOv8l 100ep | 0.645 | - | keep | - |
| **Exp1** | **YOLOv8l 200ep** | **0.720** | - | **keep (best)** | **More epochs = best gain** |
| Exp2 | Finetune 50ep | 0.720 | - | discard | No improvement over Exp1 |
| Exp3-old | YOLOv8l 1600px | 0.645 | - | discard | Higher res didn't help |
| ExpX-old | YOLOv8x 200ep | 0.645 | - | discard | Early stopped, LR too high |
| Exp6-old | YOLOv8l 960px | 0.703 | - | discard | Lower res worse |
| Submit #1 | YOLOv8m 100ep | 0.53 | **0.6894** | submitted | First baseline |
| Submit #2 | YOLOv8l 200ep | 0.720 | TBD | **ready** | Best model, ready to upload |

## Key Findings So Far

1. **More epochs is the #1 factor**: 100ep→200ep gave +11.6% (0.645→0.720)
2. **Resolution doesn't help**: 960px and 1600px both worse than 1280px
3. **YOLOv8x needs lower LR**: Default lr=0.01 causes early stopping at low mAP
4. **Finetune with low LR looks promising**: ar2 at 0.463 after only 27 epochs
5. **Light aug slightly better than heavy**: 0.451 vs 0.427
6. **Batch size 16 on A100**: Training just started, should converge fast

## Next Actions (Autoresearch Loop)

As experiments finish:
1. If val_metric > 0.720 → **keep**, update best model, package for submission
2. If val_metric <= 0.720 → discard, start new experiment on that VM
3. Priority experiments to try next:
   - YOLOv8l 300ep batch=16 on A100 (longer + bigger batch)
   - Finetune from best with cosine LR
   - Ensemble: WBF/NMS merge of top 3 models in run.py

## Quick Commands

```bash
# Full fleet mAP50 check
for IP in 34.38.119.86 34.41.67.231 34.77.212.123 34.135.158.38 34.123.93.2 136.115.124.244 34.45.96.187 35.239.153.96 35.232.74.204 34.71.125.9 35.192.44.183 34.123.169.171 34.56.196.65 34.135.45.164 34.123.55.182 34.172.76.207; do
  echo -n "$IP: "; ssh -o StrictHostKeyChecking=no -o ConnectTimeout=3 -i ~/.ssh/google_compute_engine root@$IP \
    "E=\$(grep -c 'all' /tmp/train.log 2>/dev/null); M=\$(grep 'all' /tmp/train.log 2>/dev/null | tail -1 | awk '{print \$7}'); echo ep=\$E mAP=\$M" 2>/dev/null || echo down
done

# Download best model
gcloud compute scp <VM>:~/task/runs/<exp>/weights/best.pt ./best.pt --zone=<zone>

# Tear down everything
gcloud compute instances list --project=ai-nm26osl-1823 --format="value(name,zone)" | while read N Z; do gcloud compute instances delete $N --zone=$Z --quiet & done; wait
```

## Infrastructure

- **SSH Keys:** A100 (34.41.67.231) → all us-central VMs; ar2 (34.38.119.86) → europe-west VMs
- **Data transfer:** VM→VM via tar pipe (A100 has tarball at /tmp/task.tar.gz)
- **All VMs:** Non-spot (no preemption), systemd-run (survives SSH disconnect)
- **GPU Quota remaining:** ~11 L4s + ~11 A100s available but zones stocked out

## VM Setup Runbook (for new VMs)

### 1. Create VM
```bash
# L4 (24GB, ~$0.70/hr)
bash scripts/gcp/create-vm.sh norgesgruppen medium --name=<name>

# A100 (40GB, ~$2.95/hr)
bash scripts/gcp/create-vm.sh norgesgruppen heavy --name=<name>
```

### 2. Deploy data (VM→VM, NOT from local Starlink)
```bash
# On source VM (e.g. A100 at 34.41.67.231):
# First add source SSH key to new VM
SOURCE_KEY=$(gcloud compute ssh <source-vm> --zone=<zone> --command="cat /root/.ssh/id_ed25519.pub")
gcloud compute ssh <new-vm> --zone=<zone> --command="echo '$SOURCE_KEY' >> /root/.ssh/authorized_keys; chmod 600 /root/.ssh/authorized_keys"

# Then transfer via tar pipe (fast, ~1 min same region)
gcloud compute ssh <source-vm> --zone=<zone> --command="
cat /tmp/task.tar.gz | ssh -o StrictHostKeyChecking=no root@<NEW_IP> 'mkdir -p /root/task && cd /root/task && tar xzf -'
"
# Source A100 has tarball at /tmp/task.tar.gz
```

### 3. Install deps (CRITICAL: order matters)
```bash
gcloud compute ssh <vm> --zone=<zone> --command="
# Install ultralytics + numpy<2 (MUST be <2 for np.trapz compat)
pip install --break-system-packages ultralytics==8.1.0 'numpy<2'

# Fix OpenCV: force headless, remove non-headless (Deep Learning VM has broken cv2)
pip install --break-system-packages --force-reinstall opencv-python-headless==4.9.0.80
find /usr/local/lib -name 'cv2*.so' -path '*/opencv_python/*' -delete 2>/dev/null

# Verify
python3 -c 'import cv2; import ultralytics; import numpy; print(f\"cv2={cv2.__version__} ultra={ultralytics.__version__} np={numpy.__version__}\")'
"
```

### 4. Fix data.yaml path
```bash
gcloud compute ssh <vm> --zone=<zone> --command="
sed -i 's|^path: .*|path: /root/task/data/yolo|' /root/task/data/yolo/data.yaml
"
```

### 5. Start training (systemd-run for persistence)
```bash
gcloud compute ssh <vm> --zone=<zone> --command="
systemd-run --unit=ainm-train --remain-after-exit bash -c 'cd /root/task && PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True python3 -u train.py --data /root/task/data/yolo/data.yaml --model yolov8l.pt --imgsz 1280 --epochs 200 --batch <2|8|16> --patience 30 --device 0 --name <exp_name> > /tmp/train.log 2>&1'
"
# Batch sizes: L4=2, A100=8-16
```

### 6. Restart after experiment
```bash
gcloud compute ssh <vm> --zone=<zone> --command="
systemctl stop ainm-train.service 2>/dev/null
systemctl reset-failed ainm-train.service 2>/dev/null
# Then run step 5 again with new params
"
```

### Common Issues
| Issue | Fix |
|-------|-----|
| `libGL.so.1 not found` | Force reinstall opencv-python-headless + delete cv2*.so from opencv_python dir |
| `numpy has no attribute trapz` | `pip install 'numpy<2'` (np.trapz removed in numpy 2.0) |
| `cd: /root/task: No such file or directory` | Data transfer failed — re-run tar pipe from source VM |
| `ModuleNotFoundError: ultralytics` | Run pip install step again |
| Process dies on SSH disconnect | Use `systemd-run` (not nohup) |
| VM preempted | Use non-spot VMs (`--name=` without `--spot`) |
