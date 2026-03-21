# /tunnel — Start Task 1 API + Cloudflare Tunnel

Start the Tripletex agent API and expose it via a cloudflared quick tunnel for competition submissions.

## Steps

### 1. Kill any existing API process on port 9053

```bash
lsof -ti:9053 | xargs kill -9 2>/dev/null || true
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

### 4. Start cloudflared tunnel

```bash
npx cloudflared tunnel --url http://localhost:9053 2>&1 | tee /tmp/cloudflared.log &
echo $! > /tmp/cloudflared.pid
```

Wait 5 seconds for the tunnel to establish, then extract the URL:

```bash
sleep 5 && grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' /tmp/cloudflared.log | head -1
```

### 5. Report to the user

Show the user:
- The tunnel URL (copy-paste ready)
- Reminder: submit this URL at the competition dashboard
- Reminder: the tunnel stays alive as long as this terminal is open
- How to stop: `kill $(cat /tmp/tripletex-agent.pid) $(cat /tmp/cloudflared.pid) 2>/dev/null`

### 6. Monitor (optional)

If the user asks to monitor, tail both logs:

```bash
tail -f /tmp/tripletex-agent.log &
tail -f /tmp/cloudflared.log
```
