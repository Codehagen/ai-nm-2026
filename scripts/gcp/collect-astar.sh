#!/bin/bash
# Collect autoresearch results from all astar swarm VMs.
#
# Usage:
#   bash scripts/gcp/collect-astar.sh           # Pull + show results
#   bash scripts/gcp/collect-astar.sh --top 20   # Show top 20
#   bash scripts/gcp/collect-astar.sh --best      # Download best train.py
#
# VMs: ainm-astar-autoresearch, ainm-astar-swarm-a, ainm-astar-swarm-b

set -euo pipefail

PROJECT="ai-nm26osl-1823"
ZONE="europe-west4-a"
TASK_DIR="tasks/astar-island"
RESULTS_DIR="$TASK_DIR/gcp_results"
mkdir -p "$RESULTS_DIR"

VMS=(
  "ainm-astar-autoresearch:beast176"
  "ainm-astar-swarm-a:swarm-a"
  "ainm-astar-swarm-b:swarm-b"
)

TOP_N=${2:-10}

echo "╔══════════════════════════════════════════════════════════╗"
echo "║  ASTAR SWARM COLLECTOR                                  ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# 1. Check status and pull results from each VM
for VM_PAIR in "${VMS[@]}"; do
  VM=$(echo "$VM_PAIR" | cut -d: -f1)
  VMID=$(echo "$VM_PAIR" | cut -d: -f2)

  echo "--- $VM ($VMID) ---"

  # Check if running
  STATUS=$(gcloud compute ssh "$VM" --zone="$ZONE" --project="$PROJECT" \
    --command='pgrep -f autoresearch_swarm > /dev/null 2>&1 && echo "RUNNING" || echo "IDLE"' 2>/dev/null || echo "UNREACHABLE")

  echo "  Status: $STATUS"

  # Pull results TSV
  gcloud compute scp "$VM:/tmp/astar/swarm_results_${VMID}.tsv" \
    "$RESULTS_DIR/" --zone="$ZONE" --project="$PROJECT" 2>/dev/null && \
    echo "  Results: pulled" || echo "  Results: none"

  # Pull latest log tail
  TAIL=$(gcloud compute ssh "$VM" --zone="$ZONE" --project="$PROJECT" \
    --command='tail -3 /tmp/astar/swarm.log 2>/dev/null' 2>/dev/null || echo "no log")
  echo "  Last log: $TAIL"
  echo ""
done

# 2. Merge all results
echo "Merging results..."
MERGED="$RESULTS_DIR/merged_results.tsv"
echo -e "timestamp\tvm_id\tval_metric\tduration_min\tstatus\tdescription" > "$MERGED"

for f in "$RESULTS_DIR"/swarm_results_*.tsv; do
  [ -f "$f" ] && tail -n +2 "$f" >> "$MERGED" 2>/dev/null
done

TOTAL=$(tail -n +2 "$MERGED" | wc -l | tr -d ' ')
KEPT=$(grep -c "kept" "$MERGED" 2>/dev/null || echo "0")
echo "Total experiments: $TOTAL | Improvements: $KEPT"
echo ""

# 3. Show top results
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  TOP $TOP_N RESULTS (sorted by val_metric)               ║"
echo "╠══════════════════════════════════════════════════════════╣"

tail -n +2 "$MERGED" | sort -t$'\t' -k3 -rn | head -n "$TOP_N" | while IFS=$'\t' read -r ts vmid metric dur status desc; do
  printf "║  %-8s  %8.4f  %-8s  %s\n" "$vmid" "$metric" "$status" "${desc:0:40}"
done

echo "╚══════════════════════════════════════════════════════════╝"

# 4. Download best train.py if requested
if [ "${1:-}" = "--best" ]; then
  BEST_VM=""
  BEST_METRIC="0"

  for VM_PAIR in "${VMS[@]}"; do
    VM=$(echo "$VM_PAIR" | cut -d: -f1)
    VMID=$(echo "$VM_PAIR" | cut -d: -f2)

    METRIC=$(gcloud compute ssh "$VM" --zone="$ZONE" --project="$PROJECT" \
      --command='grep "kept" /tmp/astar/swarm_results_*.tsv 2>/dev/null | sort -t"	" -k3 -rn | head -1 | cut -f3' 2>/dev/null || echo "0")

    if [ "$(echo "$METRIC > $BEST_METRIC" | bc 2>/dev/null || echo 0)" = "1" ]; then
      BEST_METRIC="$METRIC"
      BEST_VM="$VM"
    fi
  done

  if [ -n "$BEST_VM" ]; then
    echo ""
    echo "Best VM: $BEST_VM (metric: $BEST_METRIC)"
    echo "Downloading best train.py..."
    gcloud compute scp "$BEST_VM:/tmp/astar/train.py.best" \
      "$TASK_DIR/train.py.best_from_swarm" --zone="$ZONE" --project="$PROJECT" 2>/dev/null && \
      echo "Saved: $TASK_DIR/train.py.best_from_swarm" || echo "Download failed"
  fi
fi
