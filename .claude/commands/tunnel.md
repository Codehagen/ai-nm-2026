# /tunnel — Deploy Task 1 to GCP + ngrok HTTPS Tunnel

Deploy the Tripletex agent to the GCP VM and expose via ngrok HTTPS tunnel.
ngrok has NO timeout limit (unlike cloudflared's 120s hard limit), supporting the full 300s competition timeout.

**VM**: `ainm-tripletex` (e2-standard-4, europe-west4-a)
**SSH**: `ssh -i ~/.ssh/gcp_ainm walgermo@<IP>`
**ngrok URL**: persistent per authtoken — doesn't change on redeploy

## Steps

### 1. Type-check locally

```bash
cd tasks/1 && npx tsc --noEmit
```

If the type-check fails, stop here and report the errors. Do NOT continue.

### 2. Package and upload code to GCP VM

```bash
cd tasks/1
VM_IP=$(gcloud compute instances describe ainm-tripletex --zone=europe-west4-a --format='get(networkInterfaces[0].accessConfigs[0].natIP)')
tar --exclude='node_modules' --exclude='logs' --exclude='.env*' --exclude='models' -czf /tmp/task1.tar.gz .
scp -i ~/.ssh/gcp_ainm -o StrictHostKeyChecking=no /tmp/task1.tar.gz walgermo@${VM_IP}:~/task1.tar.gz
scp -i ~/.ssh/gcp_ainm -o StrictHostKeyChecking=no .env.local walgermo@${VM_IP}:~/task1/.env.local
```

### 3. Deploy on VM (extract, install deps, restart API + ngrok)

The redeploy script is already on the VM at `/tmp/redeploy.sh`. It:
- Extracts tarball, installs deps
- Kills old API + tunnel processes
- Starts API on port 9053
- Starts ngrok tunnel (persistent URL)

```bash
ssh -i ~/.ssh/gcp_ainm -o StrictHostKeyChecking=no walgermo@${VM_IP} "nohup bash /tmp/redeploy.sh > /tmp/redeploy_result.txt 2>&1 &"
```

Wait 15s then check result:

```bash
sleep 15 && ssh -i ~/.ssh/gcp_ainm -o StrictHostKeyChecking=no walgermo@${VM_IP} "cat /tmp/redeploy_result.txt"
```

### 4. Verify concurrent HTTPS requests

```bash
TUNNEL_URL="https://hypertragical-birdie-unjocose.ngrok-free.dev"
for i in 1 2 3 4 5 6; do curl -s -o /dev/null -w "%{http_code} " "$TUNNEL_URL/" & done; wait; echo ""
```

All six should return `200`.

### 5. Report to the user

Show:
- The HTTPS ngrok URL (persistent — same across deploys)
- Concurrency test result
- Timeouts: API=280s, model=250s, competition=300s, tunnel=unlimited
- To check VM logs: `ssh -i ~/.ssh/gcp_ainm walgermo@<VM_IP> "tail -50 /tmp/api.log"`
- To teardown: `gcloud compute instances delete ainm-tripletex --zone=europe-west4-a -q`
