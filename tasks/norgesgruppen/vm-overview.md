# VM Fleet Overview — NorgesGruppen Autoresearch

**Last updated:** 2026-03-20 15:15 UTC
**Compute:** Sponsored (AI Championship) — free runs
**Best competition score:** 0.9007 (val mAP50=0.7316, single model + multi-scale WBF + TTA)
**Fleet:** 16 GPUs (5x A100 40GB + 11x L4 24GB), all on full-dataset training

## Current Status

All 16 GPUs training YOLOv8l on full dataset (248 images, up from 199). Different seeds for ensemble diversity. A100s resumed from ep206 checkpoint after OOM incident.

### A100 Fleet (5x, resumed from ep206)

| VM | IP | Seed | Epoch | mAP50 |
|----|-----|------|-------|-------|
| a100 | 34.41.67.231 | 42 | ~10 (resumed) | 0.727 |
| a100-2 | 34.45.96.187 | 0 | ~10 (resumed) | 0.717 |
| a100-3 | 35.239.153.96 | 7 | ~10 (resumed) | 0.718 |
| a100-6 | 34.123.55.182 | 123 | ~10 (resumed) | 0.712 |
| a100-9 | 34.172.76.207 | 99 | ~10 (resumed) | 0.714 |

### L4 Fleet (11x, from scratch)

| VM | IP | Seed | Epoch | mAP50 |
|----|-----|------|-------|-------|
| ar2 | 34.38.119.86 | 77 | ~107 | training |
| exp4 | 34.77.212.123 | 44 | ~47 | 0.510 |
| exp5 | 34.135.158.38 | 55 | ~107 | training |
| exp6 | 34.123.93.2 | 66 | ~107 | training |
| exp7 | 136.115.124.244 | 7 | 0 | starting |
| exp8 | 35.232.74.204 | 8 | ~107 | training |
| exp9 | 34.71.125.9 | 9 | ~107 | training |
| exp10 | 35.192.44.183 | 10 | ~107 | training |
| exp11 | 34.123.169.171 | 11 | ~107 | training |
| exp12 | 34.56.196.65 | 12 | ~107 | training |
| exp13 | 34.135.45.164 | 13 | ~47 | 0.503 |

## Competition Submissions

| # | Model | Val mAP50 | Score | Date |
|---|-------|-----------|-------|------|
| 1 | YOLOv8m 100ep (199 imgs) | 0.53 | 0.6894 | Mar 19 |
| 2 | YOLOv8l finetune-cos (199 imgs) | 0.7224 | 0.8966 | Mar 20 |
| 3 | YOLOv8l SGD finetune (199 imgs) | 0.7316 | **0.9007** | Mar 20 |

## Key Findings

1. **Full dataset (248 imgs) >> 199 imgs**: mAP 0.727 at ep194 vs 0.645 at ep200 with 199 imgs
2. **Cosine LR finetune works**: Train 200ep → finetune with cos_lr SGD → best results
3. **But repeated finetuning degrades generalization**: Local eval drops while val_metric rises (overfitting to val set)
4. **Resolution 1280px optimal**: 960px and 1600px both worse
5. **YOLOv8l > YOLOv8x**: Bigger model early stops at lower mAP
6. **Batch=2 > batch=8 for SGD finetune**: Small batch noise helps SGD
7. **TTA + multi-scale WBF in run.py gives huge boost**: val 0.73 → competition 0.90
8. **Don't run classifier alongside YOLO on A100**: OOM crash (shared VRAM)

## Available Submissions (ready to upload)

| File | Size | Model | Notes |
|------|------|-------|-------|
| submission.zip | 78MB | best_0.7316 (SGD finetune) | Scored 0.9007 |
| submission_swa.zip | 78MB | SWA average of top 3 | Untested |
| submission_ensemble.zip | 233MB | 3-model WBF ensemble | Local eval slightly worse |
| models/best_fulldataset_slim.pt | 84MB | Full-dataset ep206 (stripped) | Not yet packaged |

## Pending Work

1. **Await full-dataset training completion** — A100s finishing ~20 min, L4s ~1.5 hrs
2. **Package best full-dataset model** — expected to beat 0.9007
3. **Two-stage classifier** — code ready (train_classifier.py, run_twostage.py), needs product reference images from competition site
4. **SWA of full-dataset models** — average weights from top seeds after training completes

## VM Setup Runbook

### Quick Start
```bash
# Create VM
bash scripts/gcp/create-vm.sh norgesgruppen medium --name=<name>   # L4
bash scripts/gcp/create-vm.sh norgesgruppen heavy --name=<name>    # A100

# Deploy (VM→VM, NOT from Starlink)
# Source A100 has tarball at /tmp/task.tar.gz
gcloud compute ssh <source> --zone=<z> --command="
cat /tmp/task.tar.gz | ssh -o StrictHostKeyChecking=no root@<NEW_IP> 'mkdir -p /root/task && cd /root/task && tar xzf -'
"

# Install deps (order matters!)
pip install --break-system-packages ultralytics==8.1.0 'numpy<2'
pip install --break-system-packages --force-reinstall opencv-python-headless==4.9.0.80
find /usr/local/lib -name 'cv2*.so' -path '*/opencv_python/*' -delete

# Convert full dataset + fix paths
python3 convert_coco.py --coco-dir data/train --output-dir data/yolo_full --val-ratio 0
cp -r data/yolo/images/val data/yolo_full/images/val
cp -r data/yolo/labels/val data/yolo_full/labels/val
sed -i 's|^path: .*|path: /root/task/data/yolo_full|' data/yolo_full/data.yaml

# Train (use CLI args, NOT sed!)
systemd-run --unit=ainm-train --remain-after-exit bash -c '
cd /root/task && PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True \
python3 -u train.py --data /root/task/data/yolo_full/data.yaml \
  --model yolov8l.pt --imgsz 1280 --epochs 300 --batch 2 --patience 40 \
  --device 0 --name <exp_name> --seed <seed> \
  --lr0 0.01 --optimizer auto \
  > /tmp/train.log 2>&1'
```

### Common Issues
| Issue | Fix |
|-------|-----|
| libGL.so.1 not found | `pip install --force-reinstall opencv-python-headless==4.9.0.80` + delete cv2*.so |
| numpy has no attribute trapz | `pip install 'numpy<2'` |
| SyntaxError: keyword repeated | Use CLI args (`--lr0`, `--optimizer`), NOT sed |
| OOM on A100 | Don't share GPU between YOLO + classifier |
| VM preempted | Use non-spot VMs |
| Val data missing in yolo_full | Copy from yolo/images/val and yolo/labels/val |

### Infrastructure
- **SSH Keys:** A100 → us-central VMs; ar2 → europe-west VMs
- **Data transfer:** VM→VM via tar pipe
- **All VMs:** Non-spot, systemd-run for persistence
- **Direct SSH:** `ssh -i ~/.ssh/google_compute_engine root@<IP>`
