#!/bin/bash

if [ -n "$1" ]; then
    TASKS="$1"
else
    TASKS="cv ml nlp"
    echo "Tearing down all VMs..."
fi

for TASK in $TASKS; do
    VM="ainm-${TASK}"
    ZONE=$(gcloud compute instances list --filter="name=${VM}" --format="value(zone)" 2>/dev/null)
    if [ -n "$ZONE" ]; then
        echo "Deleting ${VM} (${ZONE})..."
        gcloud compute instances delete "${VM}" --zone=$ZONE --quiet
        gcloud compute firewall-rules delete "${VM}-port" --quiet 2>/dev/null || true
    else
        echo "${VM}: not found, skipping"
    fi
done

echo "Done."
