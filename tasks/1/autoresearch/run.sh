#!/bin/bash
# Autoresearch loop for Tripletex agent system prompt optimization.
#
# Usage:
#   bash autoresearch/run.sh              # fast subset (15 prompts)
#   bash autoresearch/run.sh all          # all prompts
#
# Requires: agent server NOT running (this script manages it).
# Edit src/system-prompt.ts between cycles, then press Enter.

set -euo pipefail
cd "$(dirname "$0")/.."

SUBSET=${1:-fast}
RESULTS_FILE="autoresearch/results.tsv"
LOG_FILE="autoresearch/run.out"

# ─── Helpers ──────────────────────────────────────────────────────

kill_agent() {
  local pids
  pids=$(lsof -ti:9053 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo "$pids" | xargs kill 2>/dev/null || true
    sleep 1
  fi
}

start_agent() {
  kill_agent
  source .env.local 2>/dev/null || true
  export GOOGLE_API_KEY="${GOOGLE_API_KEY:-}"
  export AI_GATEWAY_API_KEY="${AI_GATEWAY_API_KEY:-}"
  npx tsx src/api.ts &
  AGENT_PID=$!

  # Wait for agent to be ready
  for i in $(seq 1 30); do
    if curl -s http://localhost:9053/ > /dev/null 2>&1; then
      echo "  Agent ready (pid $AGENT_PID)"
      return 0
    fi
    sleep 1
  done
  echo "ERROR: Agent failed to start"
  return 1
}

run_eval() {
  npx tsx autoresearch/prepare.ts --subset "$SUBSET" > "$LOG_FILE" 2>&1
  grep "^val_metric:" "$LOG_FILE" | awk '{print $2}'
}

# ─── Create branch ───────────────────────────────────────────────

BRANCH="autoresearch/$(date +%b%d | tr 'A-Z' 'a-z')"
CURRENT=$(git branch --show-current)
if [ "$CURRENT" != "$BRANCH" ]; then
  echo "Creating branch $BRANCH..."
  git checkout -b "$BRANCH" 2>/dev/null || git checkout "$BRANCH"
fi

# ─── Baseline ────────────────────────────────────────────────────

echo ""
echo "=========================================="
echo "  AUTORESEARCH — Tripletex Agent"
echo "  Subset: $SUBSET"
echo "=========================================="
echo ""

echo "Starting agent..."
start_agent

echo "Running baseline evaluation..."
BASELINE=$(run_eval)
echo ""
echo "  BASELINE: val_metric = $BASELINE"
echo ""

# Init results
echo -e "commit\tval_metric\tstatus\tdescription" > "$RESULTS_FILE"
echo -e "$(git rev-parse --short HEAD)\t$BASELINE\tbaseline\tbaseline" >> "$RESULTS_FILE"
git add autoresearch/ && git commit -m "autoresearch: baseline $BASELINE" --no-verify 2>/dev/null || true

BEST=$BASELINE

# ─── Loop ────────────────────────────────────────────────────────

while true; do
  echo ""
  echo "═══════════════════════════════════════════"
  echo "  BEST so far: $BEST"
  echo "  Edit src/system-prompt.ts, then press Enter."
  echo "  (type 'quit' to exit, 'rerun' to re-evaluate without changes)"
  echo "═══════════════════════════════════════════"
  read -r DESC

  if [ "$DESC" = "quit" ] || [ "$DESC" = "q" ]; then
    echo "Done. Best: $BEST"
    kill_agent
    break
  fi

  if [ "$DESC" = "rerun" ]; then
    echo "Re-running evaluation..."
    METRIC=$(run_eval)
    echo "  val_metric: $METRIC (best: $BEST)"
    continue
  fi

  [ -z "$DESC" ] && DESC="manual edit"

  # Commit the experiment
  git add src/system-prompt.ts && git commit -m "experiment: $DESC" --no-verify 2>/dev/null || true

  # Restart agent with new prompt
  echo "  Restarting agent..."
  start_agent

  # Run evaluation
  echo "  Running evaluation..."
  METRIC=$(run_eval)

  # Compare
  if [ -z "$METRIC" ]; then
    echo "  ERROR: No val_metric in output. Check $LOG_FILE"
    echo -e "$(git rev-parse --short HEAD)\t0\terror\t$DESC" >> "$RESULTS_FILE"
    git reset --soft HEAD~1 2>/dev/null || true
    continue
  fi

  IMPROVED=$(echo "$METRIC > $BEST" | bc -l 2>/dev/null || echo "0")

  if [ "$IMPROVED" = "1" ]; then
    echo ""
    echo "  >>> KEEP: $METRIC > $BEST <<<"
    echo ""
    BEST=$METRIC
    echo -e "$(git rev-parse --short HEAD)\t$METRIC\tkeep\t$DESC" >> "$RESULTS_FILE"
    git add autoresearch/ && git commit --amend --no-edit --no-verify 2>/dev/null || true
  else
    echo ""
    echo "  DISCARD: $METRIC <= $BEST"
    echo ""
    echo -e "$(git rev-parse --short HEAD)\t$METRIC\tdiscard\t$DESC" >> "$RESULTS_FILE"
    git reset --hard HEAD~1 2>/dev/null || true
  fi
done
