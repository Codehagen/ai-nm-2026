#!/usr/bin/env python3
"""Live autoresearch swarm dashboard.

Usage:
    python dashboard.py              # Serve on http://localhost:8050
    python dashboard.py --port 8080  # Custom port
    python dashboard.py --refresh 30 # Refresh every 30s (default 60)
"""

import argparse
import json
import os
import subprocess
import threading
import time
from datetime import datetime
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

TASK_DIR = Path(__file__).parent.resolve()
RESULTS_DIR = TASK_DIR / "gcp_results"
RESULTS_DIR.mkdir(exist_ok=True)
DASHBOARD_FILE = TASK_DIR / "dashboard.html"

PROJECT = "ai-nm26osl-1823"
ZONE = "europe-west4-a"

VMS = [
    ("ainm-astar-autoresearch", "beast176", "c3-176"),
    ("ainm-astar-swarm-a", "swarm-a", "c3-44"),
    ("ainm-astar-swarm-b", "swarm-b", "c3-44"),
    ("ainm-astar-s1", "s1", "c2-30"),
    ("ainm-astar-s2", "s2", "c2-30"),
    ("ainm-astar-s3", "s3", "c2-30"),
    ("ainm-astar-s4", "s4", "c2-30"),
    ("ainm-astar-s5", "s5", "c2-30"),
    ("ainm-astar-s6", "s6", "c2-30"),
    ("ainm-astar-s7", "s7", "c2-30"),
    ("ainm-astar-s8", "s8", "c2-30"),
    ("ainm-astar-s9", "s9", "c2-30"),
    ("ainm-astar-s10", "s10", "c2-30"),
]

REFRESH_SEC = 60


def pull_results():
    """Pull TSV results from all VMs."""
    all_rows = []
    vm_status = {}

    for vm_name, vm_id, vm_type in VMS:
        try:
            # Check if running
            r = subprocess.run(
                ["gcloud", "compute", "ssh", vm_name, f"--zone={ZONE}", f"--project={PROJECT}",
                 "--ssh-flag=-o StrictHostKeyChecking=no",
                 "--command=pgrep -f autoresearch_swarm > /dev/null && echo RUNNING || echo IDLE"],
                capture_output=True, text=True, timeout=10
            )
            status = r.stdout.strip().split("\n")[-1] if r.returncode == 0 else "UNREACHABLE"

            # Pull results
            r2 = subprocess.run(
                ["gcloud", "compute", "ssh", vm_name, f"--zone={ZONE}", f"--project={PROJECT}",
                 "--ssh-flag=-o StrictHostKeyChecking=no",
                 f"--command=cat /tmp/astar/swarm_results_{vm_id}.tsv 2>/dev/null"],
                capture_output=True, text=True, timeout=10
            )
            lines = r2.stdout.strip().split("\n")[1:] if r2.returncode == 0 else []

            runs = len(lines)
            kept = sum(1 for l in lines if "\tkept\t" in l)
            best = 0.0
            for l in lines:
                parts = l.split("\t")
                if len(parts) >= 5 and parts[4] == "kept":
                    try:
                        best = max(best, float(parts[2]))
                    except ValueError:
                        pass

            vm_status[vm_id] = {
                "name": vm_name, "id": vm_id, "type": vm_type,
                "status": status, "runs": runs, "kept": kept, "best": best,
            }

            for l in lines:
                parts = l.split("\t")
                if len(parts) >= 6:
                    all_rows.append({
                        "timestamp": parts[0],
                        "vm_id": parts[1],
                        "val_metric": float(parts[2]) if parts[2] != "0.0000" else 0,
                        "duration": float(parts[3]) if len(parts) > 3 else 0,
                        "status": parts[4],
                        "description": parts[5] if len(parts) > 5 else "",
                    })

        except Exception as e:
            vm_status[vm_id] = {
                "name": vm_name, "id": vm_id, "type": vm_type,
                "status": "ERROR", "runs": 0, "kept": 0, "best": 0.0,
            }

    return vm_status, all_rows


def generate_html(vm_status, all_rows):
    """Generate the dashboard HTML."""
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    total_runs = sum(v["runs"] for v in vm_status.values())
    total_kept = sum(v["kept"] for v in vm_status.values())
    running_vms = sum(1 for v in vm_status.values() if v["status"] == "RUNNING")
    global_best = max((v["best"] for v in vm_status.values()), default=0)

    # Sort experiments by metric
    valid = [r for r in all_rows if r["val_metric"] > 0]
    valid.sort(key=lambda x: -x["val_metric"])

    # Build VM table rows
    vm_rows = ""
    for vm_id in sorted(vm_status.keys()):
        v = vm_status[vm_id]
        status_color = "#4CAF50" if v["status"] == "RUNNING" else "#f44336" if v["status"] == "ERROR" else "#ff9800"
        best_str = f'{v["best"]:.4f}' if v["best"] > 0 else "—"
        vm_rows += f"""
        <tr>
            <td>{v["id"]}</td>
            <td>{v["type"]}</td>
            <td><span style="color:{status_color};font-weight:bold">{v["status"]}</span></td>
            <td>{v["runs"]}</td>
            <td>{v["kept"]}</td>
            <td style="font-weight:bold">{best_str}</td>
        </tr>"""

    # Build top experiments table
    exp_rows = ""
    for r in valid[:30]:
        status_color = "#4CAF50" if r["status"] == "kept" else "#999" if r["status"] == "rejected" else "#f44336"
        desc = r["description"][:80] if r["description"] else "—"
        exp_rows += f"""
        <tr>
            <td>{r["vm_id"]}</td>
            <td style="font-weight:bold">{r["val_metric"]:.4f}</td>
            <td><span style="color:{status_color}">{r["status"]}</span></td>
            <td style="font-size:0.85em">{desc}</td>
            <td style="font-size:0.85em">{r["timestamp"]}</td>
        </tr>"""

    # Metric history for chart (all valid experiments, chronological)
    chart_data = []
    for r in sorted(valid, key=lambda x: x["timestamp"]):
        chart_data.append({"t": r["timestamp"], "v": r["val_metric"], "s": r["status"], "vm": r["vm_id"]})

    html = f"""<!DOCTYPE html>
<html>
<head>
    <title>Astar Autoresearch Swarm</title>
    <meta http-equiv="refresh" content="{REFRESH_SEC}">
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0d1117; color: #c9d1d9; padding: 20px; }}
        h1 {{ color: #58a6ff; margin-bottom: 5px; }}
        .subtitle {{ color: #8b949e; margin-bottom: 20px; }}
        .stats {{ display: flex; gap: 20px; margin-bottom: 25px; flex-wrap: wrap; }}
        .stat {{ background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 15px 25px; min-width: 150px; }}
        .stat .value {{ font-size: 2em; font-weight: bold; color: #58a6ff; }}
        .stat .label {{ color: #8b949e; font-size: 0.85em; margin-top: 2px; }}
        .stat.best .value {{ color: #3fb950; }}
        table {{ width: 100%; border-collapse: collapse; margin-bottom: 25px; background: #161b22; border-radius: 8px; overflow: hidden; }}
        th {{ background: #21262d; color: #8b949e; text-align: left; padding: 10px 12px; font-size: 0.85em; text-transform: uppercase; }}
        td {{ padding: 8px 12px; border-top: 1px solid #21262d; }}
        tr:hover {{ background: #1c2128; }}
        h2 {{ color: #c9d1d9; margin: 20px 0 10px; }}
        canvas {{ background: #161b22; border-radius: 8px; border: 1px solid #30363d; margin-bottom: 20px; }}
        .footer {{ color: #484f58; font-size: 0.8em; margin-top: 20px; }}
    </style>
</head>
<body>
    <h1>Astar Island — Autoresearch Swarm</h1>
    <p class="subtitle">Last updated: {now} | Auto-refreshes every {REFRESH_SEC}s</p>

    <div class="stats">
        <div class="stat"><div class="value">{running_vms}</div><div class="label">VMs Running</div></div>
        <div class="stat"><div class="value">{total_runs}</div><div class="label">Total Experiments</div></div>
        <div class="stat"><div class="value">{total_kept}</div><div class="label">Improvements Found</div></div>
        <div class="stat best"><div class="value">{global_best:.4f}</div><div class="label">Best WAVG</div></div>
        <div class="stat"><div class="value">{total_runs / max(1, (time.time() - 1774110000) / 3600):.0f}</div><div class="label">Experiments/Hour</div></div>
    </div>

    <h2>Fleet Status</h2>
    <table>
        <tr><th>VM</th><th>Type</th><th>Status</th><th>Runs</th><th>Kept</th><th>Best WAVG</th></tr>
        {vm_rows}
    </table>

    <h2>Top 30 Experiments</h2>
    <table>
        <tr><th>VM</th><th>WAVG</th><th>Status</th><th>Description</th><th>Time</th></tr>
        {exp_rows}
    </table>

    <h2>Metric History</h2>
    <canvas id="chart" width="1200" height="300"></canvas>
    <script>
    const data = {json.dumps(chart_data)};
    const canvas = document.getElementById('chart');
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const pad = {{l: 60, r: 20, t: 20, b: 30}};

    if (data.length > 0) {{
        const vals = data.map(d => d.v).filter(v => v > 0);
        const minV = Math.min(...vals) - 0.5;
        const maxV = Math.max(...vals) + 0.5;

        // Grid
        ctx.strokeStyle = '#21262d';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 5; i++) {{
            const y = pad.t + (H - pad.t - pad.b) * i / 5;
            ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke();
            ctx.fillStyle = '#484f58';
            ctx.font = '11px monospace';
            ctx.fillText((maxV - (maxV - minV) * i / 5).toFixed(2), 5, y + 4);
        }}

        // Points
        data.forEach((d, i) => {{
            if (d.v <= 0) return;
            const x = pad.l + (W - pad.l - pad.r) * i / data.length;
            const y = pad.t + (H - pad.t - pad.b) * (1 - (d.v - minV) / (maxV - minV));
            ctx.beginPath();
            ctx.arc(x, y, d.s === 'kept' ? 5 : 3, 0, Math.PI * 2);
            ctx.fillStyle = d.s === 'kept' ? '#3fb950' : d.s === 'rejected' ? '#484f58' : '#f44336';
            ctx.fill();
        }});

        // Baseline
        const baseY = pad.t + (H - pad.t - pad.b) * (1 - (89.47 - minV) / (maxV - minV));
        ctx.strokeStyle = '#f0883e';
        ctx.setLineDash([5, 5]);
        ctx.beginPath(); ctx.moveTo(pad.l, baseY); ctx.lineTo(W - pad.r, baseY); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#f0883e';
        ctx.fillText('baseline 89.47', W - pad.r - 100, baseY - 5);
    }}
    </script>

    <p class="footer">
        Collect results: <code>bash scripts/gcp/collect-astar.sh</code> |
        Download best: <code>bash scripts/gcp/collect-astar.sh --best</code> |
        Integrate: <code>bash scripts/gcp/collect-astar.sh --integrate</code>
    </p>
</body>
</html>"""

    return html


def update_dashboard():
    """Pull data and regenerate HTML."""
    print(f"[{datetime.now().strftime('%H:%M:%S')}] Pulling data from {len(VMS)} VMs...", flush=True)
    vm_status, all_rows = pull_results()
    html = generate_html(vm_status, all_rows)
    DASHBOARD_FILE.write_text(html)
    total = sum(v["runs"] for v in vm_status.values())
    best = max((v["best"] for v in vm_status.values()), default=0)
    running = sum(1 for v in vm_status.values() if v["status"] == "RUNNING")
    print(f"  {running} VMs running | {total} experiments | best={best:.4f}", flush=True)


def updater_loop():
    """Background thread that refreshes data."""
    while True:
        try:
            update_dashboard()
        except Exception as e:
            print(f"Update error: {e}", flush=True)
        time.sleep(REFRESH_SEC)


class DashboardHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/" or self.path == "/dashboard.html":
            self.send_response(200)
            self.send_header("Content-type", "text/html")
            self.end_headers()
            self.wfile.write(DASHBOARD_FILE.read_bytes())
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args):
        pass  # suppress request logs


def main():
    global REFRESH_SEC
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8050)
    parser.add_argument("--refresh", type=int, default=60)
    args = parser.parse_args()
    REFRESH_SEC = args.refresh

    # Initial pull
    update_dashboard()

    # Start background updater
    t = threading.Thread(target=updater_loop, daemon=True)
    t.start()

    # Serve
    server = HTTPServer(("0.0.0.0", args.port), DashboardHandler)
    print(f"\nDashboard: http://localhost:{args.port}", flush=True)
    print(f"Refreshes every {REFRESH_SEC}s\n", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
