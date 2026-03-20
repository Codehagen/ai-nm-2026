#!/usr/bin/env bash
# Fleet experiment runner for Astar Island
# Deploys code to GCP VMs and runs experiments in parallel
#
# Usage:
#   scripts/gcp/fleet-experiment.sh deploy          # Deploy code to all VMs
#   scripts/gcp/fleet-experiment.sh run "sed_cmd"   # Run experiment on one VM
#   scripts/gcp/fleet-experiment.sh sweep           # Run all experiments
#   scripts/gcp/fleet-experiment.sh collect         # Collect results
#
set -euo pipefail

PROJECT="ai-nm26osl-1823"
ZONE_A="us-central1-a"
ZONE_B="europe-west1-b"
TASK_DIR="tasks/astar-island"
REMOTE_DIR="/tmp/astar"  # Use /tmp — guaranteed writable, no path issues

# Available VMs (idle g2-standard-8 machines)
VMS_A=(ainm-norgesgruppen-exp5 ainm-norgesgruppen-exp6 ainm-norgesgruppen-exp7 ainm-norgesgruppen-exp8 ainm-norgesgruppen-exp9 ainm-norgesgruppen-exp10 ainm-norgesgruppen-exp11 ainm-norgesgruppen-exp12 ainm-norgesgruppen-exp13 ainm-norgesgruppen-cls)
VMS_B=(ainm-norgesgruppen-ar2 ainm-norgesgruppen-exp4)

get_zone() {
  local vm=$1
  if [[ "$vm" == *ar2* ]] || [[ "$vm" == *exp4* ]]; then
    echo "$ZONE_B"
  else
    echo "$ZONE_A"
  fi
}

ssh_cmd() {
  local vm=$1 zone=$2; shift 2
  gcloud compute ssh "$vm" --zone="$zone" --project="$PROJECT" --command="$*" 2>/dev/null
}

deploy() {
  echo "=== Deploying to all VMs ==="
  local pids=()

  for vm in "${VMS_A[@]}" "${VMS_B[@]}"; do
    zone=$(get_zone "$vm")
    echo "  $vm ($zone)..."
    (
      # Create clean remote dir
      ssh_cmd "$vm" "$zone" "rm -rf $REMOTE_DIR && mkdir -p $REMOTE_DIR/data"

      # Copy essential files only (not all experiments)
      for f in train.py model.py evaluate.py utils.py dtos.py simulator.py retrain_gbt.py; do
        gcloud compute scp "$TASK_DIR/$f" "$vm:$REMOTE_DIR/$f" --zone="$zone" --project="$PROJECT" 2>/dev/null
      done

      # Copy data files
      for f in $TASK_DIR/data/round*_initial.json $TASK_DIR/data/gt_r*_seed*.npy $TASK_DIR/data/obs_*.jsonl $TASK_DIR/data/gbt_models.pkl $TASK_DIR/data/calibration.json; do
        [ -f "$f" ] && gcloud compute scp "$f" "$vm:$REMOTE_DIR/data/" --zone="$zone" --project="$PROJECT" 2>/dev/null
      done

      # Install deps
      ssh_cmd "$vm" "$zone" "pip3 install --break-system-packages -q xgboost numpy scipy scikit-learn 2>/dev/null"

      # Verify
      ssh_cmd "$vm" "$zone" "cd $REMOTE_DIR && python3 -c 'import train; print(\"OK\")' 2>&1"
    ) &
    pids+=($!)
  done

  # Wait for all deploys
  local failed=0
  for pid in "${pids[@]}"; do
    wait "$pid" || ((failed++))
  done
  echo "Deploy complete. $failed failures."
}

sweep() {
  echo "=== Running sweep across fleet ==="

  # Define experiments: index -> (vm, sed_command, description)
  local experiments=(
    "exp5|sed -i 's/EMP_BLEND = 0.45/EMP_BLEND = 0.50/' train.py|EMP=0.50"
    "exp6|sed -i 's/EMP_BLEND = 0.45/EMP_BLEND = 0.55/' train.py|EMP=0.55"
    "exp7|sed -i 's/EMP_BLEND = 0.45/EMP_BLEND = 0.60/' train.py|EMP=0.60"
    "exp8|sed -i 's/EMP_BLEND = 0.45/EMP_BLEND = 0.35/' train.py|EMP=0.35"
    "exp9|sed -i 's/max_depth=5/max_depth=6/' train.py|depth=6"
    "exp10|sed -i 's/n_estimators=300/n_estimators=500/' train.py|trees=500"
    "exp11|sed -i 's/learning_rate=0.08/learning_rate=0.05/' train.py|lr=0.05"
    "exp12|true|BASELINE"
    "exp13|sed -i 's/1.40, 1.00, 0.0, 0.0, 1.50/0.0, 0.0, 0.0, 0.0, 0.0/' train.py|NO_L7"
    "cls|sed -i 's/settl.*0.50/settl\": 0.60/' train.py|settl=0.60"
    "ar2|sed -i 's/EMP_BLEND = 0.45/EMP_BLEND = 0.70/' train.py|EMP=0.70"
    "exp4|sed -i 's/EMP_BLEND = 0.45/EMP_BLEND = 0.80/' train.py|EMP=0.80"
  )

  for exp in "${experiments[@]}"; do
    IFS='|' read -r vm_suffix sed_cmd desc <<< "$exp"
    vm="ainm-norgesgruppen-${vm_suffix}"
    zone=$(get_zone "$vm")
    echo "  $vm: $desc"
    ssh_cmd "$vm" "$zone" "cd $REMOTE_DIR && cp train.py train_orig.py && $sed_cmd && python3 train.py > /tmp/result.log 2>&1 && cp train_orig.py train.py" &
  done

  echo "All experiments launched. Waiting..."
  wait
  echo "=== DONE ==="
}

collect() {
  echo "=== Collecting results ==="
  echo ""
  printf "%-15s %-12s %s\n" "EXPERIMENT" "WAVG" "DETAILS"
  printf "%s\n" "--------------------------------------------"

  for vm in "${VMS_A[@]}" "${VMS_B[@]}"; do
    zone=$(get_zone "$vm")
    result=$(ssh_cmd "$vm" "$zone" "grep 'val_metric:\|weighted_avg:' /tmp/result.log 2>/dev/null || echo 'NO_RESULT'")
    desc=$(echo "$vm" | sed 's/ainm-norgesgruppen-//')
    wavg=$(echo "$result" | grep 'val_metric:' | head -1 | awk '{print $2}')
    printf "%-15s %-12s %s\n" "$desc" "${wavg:-FAILED}" "$result"
  done
}

check() {
  echo "=== Fleet Status ==="
  printf "%-20s %-8s %-8s %-8s\n" "VM" "LOAD" "USERS" "PYTHON"
  printf "%s\n" "----------------------------------------------"
  for vm in "${VMS_A[@]}" "${VMS_B[@]}"; do
    zone=$(get_zone "$vm")
    short=$(echo "$vm" | sed 's/ainm-norgesgruppen-//')
    result=$(ssh_cmd "$vm" "$zone" "echo \$(cat /proc/loadavg | cut -d' ' -f1) \$(who | wc -l) \$(ps aux | grep 'python3.*train' | grep -v grep | wc -l)" 2>/dev/null || echo "OFFLINE 0 0")
    load=$(echo "$result" | awk '{print $1}')
    users=$(echo "$result" | awk '{print $2}')
    python=$(echo "$result" | awk '{print $3}')
    status=""
    if [ "$users" != "0" ] || [ "$python" != "0" ]; then status="⚠ IN USE"; fi
    printf "%-20s %-8s %-8s %-8s %s\n" "$short" "$load" "$users" "$python" "$status"
  done
}

case "${1:-help}" in
  deploy)  deploy ;;
  sweep)   sweep ;;
  collect) collect ;;
  check)   check ;;
  all)     deploy && sweep && collect ;;
  *)
    echo "Usage: $0 {deploy|sweep|collect|check|all}"
    echo "  deploy  - Push code to all VMs"
    echo "  sweep   - Run experiments in parallel"
    echo "  collect - Gather results"
    echo "  check   - Check which VMs are idle"
    echo "  all     - Deploy + sweep + collect"
    ;;
esac
