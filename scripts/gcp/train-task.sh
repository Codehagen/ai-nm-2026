#!/bin/bash
set -e

cd "$(dirname "$0")/../.."

TASK=$1
if [ -z "$TASK" ]; then
    echo "Usage: scripts/gcp/train-task.sh <cv|ml|nlp>"
    exit 1
fi

VM="ainm-${TASK}"
ZONE="europe-west4-a"

echo "Running training for ${TASK} on ${VM}..."

# Run training
gcloud compute ssh "${VM}" --zone=$ZONE -- bash -c "
    cd ~/task
    TASK_MODE=train python3 train.py
"

# Pull trained models back
echo "Downloading models..."
gcloud compute scp --zone=$ZONE --recurse "${VM}:~/task/models/" "./tasks/${TASK}/models/"

echo "Models downloaded to tasks/${TASK}/models/"
