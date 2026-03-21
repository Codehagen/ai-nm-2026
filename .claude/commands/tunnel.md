# /tunnel — Deploy Task 1 to GCP + HTTPS Tunnel

Deploy the Tripletex agent to the GCP VM and expose via cloudflared HTTPS tunnel.
Running on a GCP VM avoids the local quick-tunnel concurrency problem (competition sends 5-8 concurrent requests).

**VM**: `ainm-tripletex` (e2-standard-4, europe-west4-a, IP: check with `gcloud compute instances describe ainm-tripletex --zone=europe-west4-a --format='get(networkInterfaces[0].accessConfigs[0].natIP)'`)
**SSH**: `ssh -i ~/.ssh/gcp_ainm walgermo@<IP>`

## Steps

### 1. Type-check locally

```bash
cd tasks/1 && npx tsc --noEmit
```

If the type-check fails, stop here and report the errors. Do NOT continue.

### 2. Package and upload code to GCP VM

```bash
cd tasks/1
tar --exclude='node_modules' --exclude='logs' --exclude='.env*' --exclude='models' -czf /tmp/task1.tar.gz .
VM_IP=$(gcloud compute instances describe ainm-tripletex --zone=europe-west4-a --format='get(networkInterfaces[0].accessConfigs[0].natIP)')
scp -i ~/.ssh/gcp_ainm -o StrictHostKeyChecking=no /tmp/task1.tar.gz walgermo@${VM_IP}:~/task1.tar.gz
scp -i ~/.ssh/gcp_ainm -o StrictHostKeyChecking=no .env.local walgermo@${VM_IP}:~/task1/.env.local
```

### 3. Deploy on VM (extract, install deps, restart API + tunnel)

```bash
VM_IP=$(gcloud compute instances describe ainm-tripletex --zone=europe-west4-a --format='get(networkInterfaces[0].accessConfigs[0].natIP)')
ssh -i ~/.ssh/gcp_ainm -o StrictHostKeyChecking=no walgermo@${VM_IP} "
  cd ~/task1 && tar xzf ~/task1.tar.gz
  npm install --silent 2>&1 | tail -2
  pkill -f 'tsx src/api' 2>/dev/null || true
  pkill -f 'cloudflared tunnel' 2>/dev/null || true
  sleep 1
  set -a && source .env.local && set +a
  nohup npx tsx src/api.ts > /tmp/api.log 2>&1 &
  sleep 3
  curl -s http://localhost:9053/
  nohup cloudflared tunnel --url http://localhost:9053 --protocol http2 > /tmp/cloudflared.log 2>&1 &
  sleep 8
  grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' /tmp/cloudflared.log | head -1
"
```

If `npm install` takes too long, the deps are already cached from the previous deploy — it should be fast.

### 4. Verify concurrent HTTPS requests

```bash
TUNNEL_URL=$(ssh -i ~/.ssh/gcp_ainm -o StrictHostKeyChecking=no walgermo@${VM_IP} "grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' /tmp/cloudflared.log | head -1")
for i in 1 2 3 4 5 6; do curl -s -o /dev/null -w "%{http_code} " "$TUNNEL_URL/" & done; wait; echo ""
```

All six should return `200`. If any fail, SSH into the VM and check logs:
```bash
ssh -i ~/.ssh/gcp_ainm walgermo@${VM_IP} "tail -20 /tmp/api.log; echo '---'; tail -20 /tmp/cloudflared.log"
```

### 5. Report to the user

Show:
- The HTTPS tunnel URL (copy-paste ready for competition dashboard)
- Concurrency test result
- VM IP for direct HTTP access (debugging): `http://<VM_IP>:9053`
- To check VM logs: `ssh -i ~/.ssh/gcp_ainm walgermo@<VM_IP> "tail -50 /tmp/api.log"`
- To teardown: `gcloud compute instances delete ainm-tripletex --zone=europe-west4-a -q`

### Fallback: Local tunnel (if GCP VM is down)

If the VM is unavailable, fall back to local tunnel:

```bash
cd tasks/1
lsof -ti:9053 | xargs kill -9 2>/dev/null || true
pkill -f "cloudflared tunnel" 2>/dev/null || true
set -a && source .env.local && set +a
nohup npx tsx src/api.ts > /tmp/tripletex-agent.log 2>&1 &
sleep 3 && curl -s http://localhost:9053/
npx cloudflared tunnel --url http://localhost:9053 --protocol http2 > /tmp/cloudflared.log 2>&1 &
sleep 8 && grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' /tmp/cloudflared.log | head -1
```

Note: local tunnels have limited concurrency (ha-connections:1). Only use as a last resort.
