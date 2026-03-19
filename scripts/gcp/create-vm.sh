#!/bin/bash
set -e

TASK=$1
TIER=${2:-medium}

if [ -z "$TASK" ]; then
    echo "Usage: scripts/gcp/create-vm.sh <cv|ml|nlp> [light|medium|heavy]"
    exit 1
fi

case $TIER in
    light)  MACHINE="n1-standard-8"  GPU="nvidia-tesla-t4" ;;
    medium) MACHINE="g2-standard-8"  GPU="nvidia-l4" ;;
    heavy)  MACHINE="a2-highgpu-1g"  GPU="nvidia-tesla-a100" ;;
    *)      echo "Unknown tier: $TIER"; exit 1 ;;
esac

echo "Creating VM ainm-${TASK} (${TIER}: ${MACHINE} + ${GPU})..."

gcloud compute instances create "ainm-${TASK}" \
    --zone=europe-west4-a \
    --machine-type=$MACHINE \
    --accelerator="type=${GPU},count=1" \
    --boot-disk-size=200GB \
    --image-family=pytorch-latest-gpu \
    --image-project=deeplearning-platform-release \
    --maintenance-policy=TERMINATE \
    --metadata="install-nvidia-driver=True" \
    --tags=ainm-task

# Open firewall for task port
PORT=$((9049 + $(echo "cv ml nlp" | tr ' ' '\n' | grep -n "^${TASK}$" | cut -d: -f1)))
gcloud compute firewall-rules create "ainm-${TASK}-port" \
    --allow=tcp:${PORT} --target-tags=ainm-task 2>/dev/null || true

IP=$(gcloud compute instances describe "ainm-${TASK}" --zone=europe-west4-a --format='get(networkInterfaces[0].accessConfigs[0].natIP)')

echo ""
echo "VM ainm-${TASK} created."
echo "SSH:      gcloud compute ssh ainm-${TASK} --zone=europe-west4-a"
echo "Endpoint: http://${IP}:${PORT}"
