#!/bin/bash
set -e

cd "$(dirname "$0")/.."

TASK=$1
if [ -z "$TASK" ]; then
    echo "Usage: scripts/test-task.sh <cv|ml|nlp>"
    exit 1
fi

PORT=$((9049 + $(echo "cv ml nlp" | tr ' ' '\n' | grep -n "^${TASK}$" | cut -d: -f1)))

echo "=== Testing ${TASK} task (port ${PORT}) ==="

# Run pytest
if [ -d "tasks/${TASK}/tests" ]; then
    echo "--- Running tests ---"
    python3 -m pytest "tasks/${TASK}/tests/" -v
fi

# Boot API and test health
echo ""
echo "--- Starting API server ---"
cd "tasks/${TASK}"
python3 api.py &
API_PID=$!
sleep 2

echo "--- Health check ---"
if curl -s "http://localhost:${PORT}/" | grep -q "running"; then
    echo "PASS: Health check"
else
    echo "FAIL: Health check"
fi

echo "--- Predict test ---"
RESPONSE=$(curl -s -X POST "http://localhost:${PORT}/predict" -H "Content-Type: application/json" -d '{}')
echo "Response: $RESPONSE"

# Cleanup
kill $API_PID 2>/dev/null || true
echo ""
echo "=== Done ==="
