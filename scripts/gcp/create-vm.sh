#!/bin/bash
set -e

TASK=$1
TIER=${2:-heavy}

if [ -z "$TASK" ]; then
    echo "Usage: scripts/gcp/create-vm.sh <cv|ml|nlp> [light|medium|heavy]"
    exit 1
fi

case $TIER in
    light)  MACHINE="n1-standard-8"  ACCEL="--accelerator=type=nvidia-tesla-t4,count=1" ;;
    medium) MACHINE="g2-standard-8"  ACCEL="" ;;  # g2 includes L4 GPU
    heavy)  MACHINE="a2-highgpu-1g"  ACCEL="" ;;  # a2-highgpu includes A100 GPU
    *)      echo "Unknown tier: $TIER"; exit 1 ;;
esac

# Zones to try in order (prefer Europe, fallback to US)
ZONES="europe-west4-a europe-west4-b us-central1-f us-central1-a us-central1-b us-central1-c us-east1-b us-west1-b"

echo "Creating VM ainm-${TASK} (${TIER}: ${MACHINE})..."

CREATED_ZONE=""
for ZONE in $ZONES; do
    echo "Trying zone ${ZONE}..."
    if gcloud compute instances create "ainm-${TASK}" \
        --zone=$ZONE \
        --machine-type=$MACHINE \
        $ACCEL \
        --boot-disk-size=200GB \
        --image-family=pytorch-2-7-cu128-ubuntu-2204-nvidia-570 \
        --image-project=deeplearning-platform-release \
        --maintenance-policy=TERMINATE \
        --metadata="install-nvidia-driver=True" \
        --tags=ainm-task 2>&1; then
        CREATED_ZONE=$ZONE
        break
    else
        echo "Zone ${ZONE} unavailable, trying next..."
    fi
done

if [ -z "$CREATED_ZONE" ]; then
    echo "ERROR: Could not create VM in any zone. Try again later."
    exit 1
fi

# Open firewall for task port
PORT=$((9049 + $(echo "cv ml nlp" | tr ' ' '\n' | grep -n "^${TASK}$" | cut -d: -f1)))
gcloud compute firewall-rules create "ainm-${TASK}-port" \
    --allow=tcp:${PORT} --target-tags=ainm-task 2>/dev/null || true

IP=$(gcloud compute instances describe "ainm-${TASK}" --zone=$CREATED_ZONE --format='get(networkInterfaces[0].accessConfigs[0].natIP)')

echo ""
echo "VM ainm-${TASK} created in ${CREATED_ZONE}."
echo "Zone:     ${CREATED_ZONE}"
echo "SSH:      gcloud compute ssh ainm-${TASK} --zone=${CREATED_ZONE}"
echo "Endpoint: http://${IP}:${PORT}"
