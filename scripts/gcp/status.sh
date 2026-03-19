#!/bin/bash

echo "=== GCP VM Status ==="
echo ""

for TASK in cv ml nlp; do
    VM="ainm-${TASK}"
    ZONE=$(gcloud compute instances list --filter="name=${VM}" --format="value(zone)" 2>/dev/null)

    if [ -n "$ZONE" ]; then
        IP=$(gcloud compute instances describe "$VM" --zone=$ZONE --format='get(networkInterfaces[0].accessConfigs[0].natIP)' 2>/dev/null)
        PORT=$((9049 + $(echo "cv ml nlp" | tr ' ' '\n' | grep -n "^${TASK}$" | cut -d: -f1)))
        STATUS=$(curl -s --max-time 2 "http://${IP}:${PORT}/" || echo "DOWN")
        echo "${TASK}: http://${IP}:${PORT} (${ZONE}) — ${STATUS}"
    else
        echo "${TASK}: VM not running"
    fi
done
