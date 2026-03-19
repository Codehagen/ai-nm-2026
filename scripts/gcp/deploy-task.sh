#!/bin/bash
set -e

cd "$(dirname "$0")/../.."

TASK=$1
if [ -z "$TASK" ]; then
    echo "Usage: scripts/gcp/deploy-task.sh <cv|ml|nlp>"
    exit 1
fi

VM="ainm-${TASK}"

# Auto-detect zone
ZONE=$(gcloud compute instances list --filter="name=${VM}" --format="value(zone)" 2>/dev/null)
if [ -z "$ZONE" ]; then
    echo "ERROR: VM ${VM} not found. Create it first with scripts/gcp/create-vm.sh ${TASK}"
    exit 1
fi

echo "Deploying ${TASK} to ${VM} (zone: ${ZONE})..."

# Create target directories on VM
gcloud compute ssh "${VM}" --zone=$ZONE -- "mkdir -p ~/task ~/shared"

# Copy code to VM
gcloud compute scp --zone=$ZONE --recurse "./tasks/${TASK}/"* "${VM}:~/task/"
gcloud compute scp --zone=$ZONE --recurse ./shared/* "${VM}:~/shared/" 2>/dev/null || true
gcloud compute scp --zone=$ZONE ./requirements.txt "${VM}:~/requirements.txt"

# Install deps and start API
PORT=$((9049 + $(echo "cv ml nlp" | tr ' ' '\n' | grep -n "^${TASK}$" | cut -d: -f1)))
gcloud compute ssh "${VM}" --zone=$ZONE --command="cd ~/task && pip install -q -r ~/requirements.txt -r requirements.txt && pkill -f 'python.*api.py' || true && nohup python3 ~/task/api.py > /tmp/api.log 2>&1 & echo 'API started on port ${PORT}'"

IP=$(gcloud compute instances describe "${VM}" --zone=$ZONE --format='get(networkInterfaces[0].accessConfigs[0].natIP)')
echo "Deployed: http://${IP}:${PORT}"
