#!/bin/bash
set -e

cd "$(dirname "$0")/.."

echo "=== NM i AI 2026 — Validation ==="

ERRORS=0

# Check for prohibited imports in inference path
echo ""
echo "--- Checking for prohibited cloud API imports ---"
PROHIBITED="import openai|from openai|import anthropic|from anthropic|import boto3|from boto3|import azure|from azure"
for task in cv ml nlp; do
    for file in tasks/${task}/api.py tasks/${task}/model.py tasks/${task}/dtos.py; do
        if [ -f "$file" ]; then
            if grep -qE "$PROHIBITED" "$file" 2>/dev/null; then
                echo "FAIL: Prohibited cloud API import in $file"
                ERRORS=$((ERRORS + 1))
            fi
        fi
    done
done
if [ $ERRORS -eq 0 ]; then
    echo "PASS: No prohibited imports found"
fi

# Test each task API
echo ""
echo "--- Testing task APIs ---"
for task in cv ml nlp; do
    PORT=$((9049 + $(echo "cv ml nlp" | tr ' ' '\n' | grep -n "^${task}$" | cut -d: -f1)))
    API_FILE="tasks/${task}/api.py"

    if [ ! -f "$API_FILE" ]; then
        echo "SKIP: $task — no api.py"
        continue
    fi

    echo "Testing ${task} (port ${PORT})..."

    # Run pytest if tests exist
    if [ -d "tasks/${task}/tests" ]; then
        if python3 -m pytest "tasks/${task}/tests/" -q --tb=short 2>/dev/null; then
            echo "PASS: ${task} tests"
        else
            echo "FAIL: ${task} tests"
            ERRORS=$((ERRORS + 1))
        fi
    fi
done

echo ""
if [ $ERRORS -eq 0 ]; then
    echo "=== ALL CHECKS PASSED ==="
else
    echo "=== $ERRORS CHECK(S) FAILED ==="
    exit 1
fi
