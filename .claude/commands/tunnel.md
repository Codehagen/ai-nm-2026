# /tunnel — Start Task 1 API + Cloudflare Tunnel

Start the Tripletex agent API and expose it via a cloudflared quick tunnel for competition submissions.

## Steps

### 1. Kill ALL existing processes

Kill both API and any previous cloudflared tunnel to start fresh:

```bash
lsof -ti:9053 | xargs kill -9 2>/dev/null || true
cat /tmp/cloudflared.pid 2>/dev/null | xargs kill -9 2>/dev/null || true
pkill -f "cloudflared tunnel" 2>/dev/null || true
```

### 2. Type-check and build

Run the TypeScript compiler to catch errors before starting:

```bash
cd tasks/1 && npx tsc --noEmit
```

If the type-check fails, stop here and report the errors to the user. Do NOT continue.

### 3. Start the API server in the background

Source `.env.local` for API keys, then start the server:

```bash
cd tasks/1 && set -a && source .env.local && set +a && nohup npx tsx src/api.ts > /tmp/tripletex-agent.log 2>&1 &
echo $! > /tmp/tripletex-agent.pid
```

Wait 3 seconds for startup, then verify it's running:

```bash
sleep 3 && curl -s http://localhost:9053/ | head -c 200
```

If the health check fails, read the log:

```bash
tail -20 /tmp/tripletex-agent.log
```

Stop here and report the error to the user. Do NOT continue to the tunnel step.

### 4. Start cloudflared tunnel (concurrency-optimized)

Use http2 protocol for better concurrent request handling (quick tunnels with QUIC can drop concurrent requests):

```bash
npx cloudflared tunnel --url http://localhost:9053 --protocol http2 > /tmp/cloudflared.log 2>&1 &
echo $! > /tmp/cloudflared.pid
```

Wait 8 seconds for the tunnel to fully establish all connections:

```bash
sleep 8 && grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' /tmp/cloudflared.log | head -1
```

If no URL found, wait a bit more and retry:

```bash
sleep 5 && grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' /tmp/cloudflared.log | head -1
```

### 5. Verify tunnel handles concurrent requests

Send 3 parallel health checks through the tunnel to confirm concurrency works:

```bash
TUNNEL_URL=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' /tmp/cloudflared.log | head -1)
curl -s -o /dev/null -w "%{http_code}" "$TUNNEL_URL/" &
curl -s -o /dev/null -w "%{http_code}" "$TUNNEL_URL/" &
curl -s -o /dev/null -w "%{http_code}" "$TUNNEL_URL/" &
wait
echo ""
```

All three should return `200`. If any fail, the tunnel has concurrency issues — kill and restart from step 1.

### 6. Report to the user

Show the user:
- The tunnel URL (copy-paste ready)
- Concurrency test result (all 200 = good)
- Reminder: submit this URL at the competition dashboard
- Reminder: **restart the tunnel fresh before each submission** for best reliability
- How to stop: `kill $(cat /tmp/tripletex-agent.pid) $(cat /tmp/cloudflared.pid) 2>/dev/null`

### 7. Monitor (optional)

If the user asks to monitor, tail both logs:

```bash
tail -f /tmp/tripletex-agent.log &
tail -f /tmp/cloudflared.log
```
