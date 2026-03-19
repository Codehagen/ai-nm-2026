#!/bin/bash

ZONE="europe-west4-a"

if [ -n "$1" ]; then
    echo "Deleting VM ainm-$1..."
    gcloud compute instances delete "ainm-$1" --zone=$ZONE --quiet
    gcloud compute firewall-rules delete "ainm-$1-port" --quiet 2>/dev/null || true
else
    echo "Tearing down all VMs..."
    for TASK in cv ml nlp; do
        gcloud compute instances delete "ainm-${TASK}" --zone=$ZONE --quiet 2>/dev/null || true
        gcloud compute firewall-rules delete "ainm-${TASK}-port" --quiet 2>/dev/null || true
    done
fi

echo "Done."
