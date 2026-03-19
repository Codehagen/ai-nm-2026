#!/bin/bash
set -e

cd "$(dirname "$0")/../.."

TASK=$1
if [ -z "$TASK" ]; then
    echo "Usage: scripts/gcp/deploy-task.sh <cv|ml|nlp>"
    exit 1
fi

VM="ainm-${TASK}"
ZONE="europe-west4-a"

echo "Deploying ${TASK} to ${VM}..."

# Copy code to VM
gcloud compute scp --zone=$ZONE --recurse "./tasks/${TASK}/" "${VM}:~/task/"
gcloud compute scp --zone=$ZONE --recurse ./shared/ "${VM}:~/shared/"
gcloud compute scp --zone=$ZONE ./requirements.txt "${VM}:~/requirements.txt"

# Install deps and start API
PORT=$((9049 + $(echo "cv ml nlp" | tr ' ' '\n' | grep -n "^${TASK}$" | cut -d: -f1)))
gcloud compute ssh "${VM}" --zone=$ZONE -- bash -c "
    cd ~/task
    pip install -q -r ~/requirements.txt -r requirements.txt
    # Kill existing API process if running
    pkill -f 'python.*api.py' || true
    nohup python3 api.py > /tmp/api.log 2>&1 &
    echo 'API started on port ${PORT}'
"

IP=$(gcloud compute instances describe "${VM}" --zone=$ZONE --format='get(networkInterfaces[0].accessConfigs[0].natIP)')
echo "Deployed: http://${IP}:${PORT}"
