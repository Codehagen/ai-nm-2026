#!/usr/bin/env python3
"""Live autoresearch swarm dashboard with rich UI.

Usage:
    python dashboard.py              # http://localhost:8050
    python dashboard.py --port 8080
    python dashboard.py --refresh 30
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
DASHBOARD_FILE = TASK_DIR / "dashboard.html"
PROJECT = "ai-nm26osl-1823"
ZONE = "europe-west4-a"

VMS = [
    # (gcp_name, vm_id, machine_type, focus, display_name)
    ("ainm-astar-autoresearch", "beast176", "c3-176", "general", "Beast (Creative)"),
    ("ainm-astar-swarm-a", "swarm-a", "c3-44", "general", "Explorer A"),
    ("ainm-astar-swarm-b", "swarm-b", "c3-44", "general", "Explorer B"),
    ("ainm-astar-s1", "s1", "c2-30", "r7_adaptive", "R7 Fixer"),
    ("ainm-astar-s2", "s2", "c2-30", "distance_decay", "Distance Decay"),
    ("ainm-astar-s3", "s3", "c2-30", "expansion_features", "Expansion Features"),
    ("ainm-astar-s4", "s4", "c2-30", "faction_analysis", "Faction Analyst"),
    ("ainm-astar-s5", "s5", "c2-30", "port_trade", "Port & Trade"),
    ("ainm-astar-s6", "s6", "c2-30", "winter_raiding", "Winter & Raids"),
    ("ainm-astar-s7", "s7", "c2-30", "terrain_interaction", "Terrain Edges"),
    ("ainm-astar-s8", "s8", "c2-30", "directional", "Direction Scout"),
    ("ainm-astar-s9", "s9", "c2-30", "l7_tuning", "L7 Tuner"),
    ("ainm-astar-s10", "s10", "c2-30", "xgb_tuning", "XGB Optimizer"),
    ("ainm-astar-n1", "n1", "n2-32", "r7_adaptive", "R7 Fixer II"),
    ("ainm-astar-n2", "n2", "n2-32", "expansion_features", "Expansion II"),
    ("ainm-astar-n3", "n3", "n2-32", "distance_decay", "Distance II"),
    ("ainm-astar-n4", "n4", "n2-32", "r7_adaptive", "R7 Fixer III"),
    ("ainm-astar-n5", "n5", "n2-32", "expansion_features", "Expansion III"),
    ("ainm-astar-n6", "n6", "n2-32", "faction_analysis", "Faction II"),
    ("ainm-astar-n7", "n7", "n2-32", "port_trade", "Port & Trade II"),
    ("ainm-astar-n8", "n8", "n2-32", "winter_raiding", "Winter II"),
    ("ainm-astar-n9", "n9", "n2-32", "terrain_interaction", "Terrain II"),
    ("ainm-astar-n10", "n10", "n2-32", "directional", "Direction II"),
    ("ainm-astar-c1", "c1", "c2-30", "general", "Creative I"),
    ("ainm-astar-c2", "c2", "c2-30", "general", "Creative II"),
    ("ainm-astar-c3", "c3", "c2-30", "l7_tuning", "L7 Tuner II"),
    ("ainm-astar-c4", "c4", "c2-30", "xgb_tuning", "XGB Opt II"),
    ("ainm-astar-c5", "c5", "c2-30", "general", "Creative III"),
]

REFRESH_SEC = 60
BASELINE = 89.47
START_TIME = time.time()


def pull_vm_data(vm_name, vm_id):
    """Pull data from one VM."""
    try:
        r = subprocess.run(
            ["gcloud", "compute", "ssh", vm_name, f"--zone={ZONE}", f"--project={PROJECT}",
             "--ssh-flag=-o StrictHostKeyChecking=no",
             "--command=pgrep -f autoresearch_swarm > /dev/null && echo RUNNING || echo IDLE; echo ---; cat /tmp/astar/results.tsv 2>/dev/null; echo ---; tail -3 /tmp/astar/swarm.log 2>/dev/null"],
            capture_output=True, text=True, timeout=15
        )
        if r.returncode != 0:
            return "UNREACHABLE", [], ""

        parts = r.stdout.split("---")
        status = parts[0].strip().split("\n")[-1] if parts else "UNKNOWN"
        tsv_lines = parts[1].strip().split("\n")[1:] if len(parts) > 1 else []  # skip header
        last_log = parts[2].strip() if len(parts) > 2 else ""

        experiments = []
        for l in tsv_lines:
            cols = l.split("\t")
            if len(cols) >= 7:
                try:
                    experiments.append({
                        "commit": cols[0],
                        "val_metric": float(cols[1]),
                        "status": cols[4],
                        "description": cols[5],
                        "reject_reason": cols[6],
                    })
                except (ValueError, IndexError):
                    pass

        return status, experiments, last_log
    except Exception:
        return "ERROR", [], ""


def pull_all():
    """Pull from all VMs (sequential to avoid SSH overload)."""
    vm_data = {}
    for vm_name, vm_id, vm_type, focus, display_name in VMS:
        status, experiments, last_log = pull_vm_data(vm_name, vm_id)
        runs = len(experiments)
        kept = sum(1 for e in experiments if e["status"] == "keep")
        best = max((e["val_metric"] for e in experiments if e["status"] == "keep"), default=0)
        vm_data[vm_id] = {
            "name": vm_name, "id": vm_id, "type": vm_type, "focus": focus,
            "display_name": display_name,
            "status": status, "runs": runs, "kept": kept, "best": best,
            "experiments": experiments, "last_log": last_log,
        }
    return vm_data


def generate_html(vm_data):
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    uptime_hrs = (time.time() - START_TIME) / 3600

    total_runs = sum(v["runs"] for v in vm_data.values())
    total_kept = sum(v["kept"] for v in vm_data.values())
    running = sum(1 for v in vm_data.values() if v["status"] == "RUNNING")
    global_best = max((v["best"] for v in vm_data.values()), default=0)
    exp_per_hr = total_runs / max(uptime_hrs, 0.01)

    # All experiments sorted by metric
    all_exps = []
    for v in vm_data.values():
        for e in v["experiments"]:
            e["vm_id"] = v["id"]
            e["focus"] = v["focus"]
            all_exps.append(e)
    all_exps_valid = [e for e in all_exps if e["val_metric"] > 0]
    all_exps_valid.sort(key=lambda x: -x["val_metric"])

    # Per-focus stats
    focus_stats = {}
    for v in vm_data.values():
        f = v["focus"]
        if f not in focus_stats:
            focus_stats[f] = {"runs": 0, "kept": 0, "best": 0, "vms": []}
        focus_stats[f]["runs"] += v["runs"]
        focus_stats[f]["kept"] += v["kept"]
        focus_stats[f]["best"] = max(focus_stats[f]["best"], v["best"])
        focus_stats[f]["vms"].append(v["id"])

    # VM cards
    vm_cards = ""
    for vm_id in ["beast176", "swarm-a", "swarm-b"] + [f"s{i}" for i in range(1, 11)]:
        v = vm_data.get(vm_id, {})
        if not v:
            continue
        sc = "#3fb950" if v["status"] == "RUNNING" else "#f44336"
        best_str = f'{v["best"]:.4f}' if v["best"] > 0 else "—"
        focus_label = v["focus"].replace("_", " ").title()
        last = v["last_log"].replace("\n", " ")[:80] if v["last_log"] else "..."
        vm_cards += f"""
        <div class="vm-card">
            <div class="vm-header">
                <span class="vm-name">{v.get("display_name", vm_id)}</span>
                <span class="vm-status" style="color:{sc}">{v["status"]}</span>
            </div>
            <div class="vm-focus">{focus_label}</div>
            <div class="vm-stats">
                <span>{v["runs"]} runs</span> · <span>{v["kept"]} kept</span> · <span class="best">{best_str}</span>
            </div>
            <div class="vm-log">{last}</div>
        </div>"""

    # Top experiments table
    top_rows = ""
    for i, e in enumerate(all_exps_valid[:25]):
        sc = "#3fb950" if e["status"] == "keep" else "#8b949e"
        delta = e["val_metric"] - BASELINE
        delta_str = f"+{delta:.4f}" if delta > 0 else f"{delta:.4f}"
        delta_color = "#3fb950" if delta > 0 else "#f44336"
        desc = e["description"][:60] if e["description"] else "—"
        top_rows += f"""
        <tr>
            <td>{i+1}</td>
            <td>{e["vm_id"]}</td>
            <td style="font-weight:bold">{e["val_metric"]:.4f}</td>
            <td style="color:{delta_color}">{delta_str}</td>
            <td><span style="color:{sc}">{e["status"]}</span></td>
            <td class="desc">{desc}</td>
        </tr>"""

    # Focus area performance
    focus_rows = ""
    for f in sorted(focus_stats.keys()):
        fs = focus_stats[f]
        best_str = f'{fs["best"]:.4f}' if fs["best"] > 0 else "—"
        rate = f'{fs["kept"]}/{fs["runs"]}' if fs["runs"] > 0 else "—"
        focus_rows += f"""
        <tr>
            <td>{f.replace("_"," ").title()}</td>
            <td>{", ".join(fs["vms"])}</td>
            <td>{fs["runs"]}</td>
            <td>{rate}</td>
            <td style="font-weight:bold">{best_str}</td>
        </tr>"""

    # Chart data
    chart_kept = json.dumps([{"v": e["val_metric"], "d": e["description"][:40], "vm": e["vm_id"]}
                             for e in all_exps_valid if e["status"] == "keep"][:50])
    chart_all = json.dumps([{"v": e["val_metric"], "s": e["status"]}
                            for e in sorted(all_exps_valid, key=lambda x: x.get("commit", ""))])

    html = f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Astar Autoresearch Swarm</title>
    <meta http-equiv="refresh" content="{REFRESH_SEC}">
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0d1117; color: #c9d1d9; }}

        .header {{ background: linear-gradient(135deg, #161b22 0%, #0d1117 100%); padding: 25px 30px; border-bottom: 1px solid #30363d; }}
        .header h1 {{ color: #58a6ff; font-size: 1.5em; }}
        .header .sub {{ color: #8b949e; font-size: 0.85em; margin-top: 4px; }}

        .stats-bar {{ display: flex; gap: 0; border-bottom: 1px solid #30363d; }}
        .stat {{ flex: 1; padding: 20px; text-align: center; border-right: 1px solid #30363d; }}
        .stat:last-child {{ border-right: none; }}
        .stat .value {{ font-size: 2.2em; font-weight: 700; }}
        .stat .label {{ color: #8b949e; font-size: 0.75em; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 4px; }}
        .stat.highlight .value {{ color: #3fb950; }}
        .stat .value {{ color: #58a6ff; }}

        .content {{ padding: 20px 30px; }}

        .section {{ margin-bottom: 30px; }}
        .section h2 {{ color: #c9d1d9; font-size: 1.1em; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #21262d; }}

        .vm-grid {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px; }}
        .vm-card {{ background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 12px; }}
        .vm-card:hover {{ border-color: #58a6ff; }}
        .vm-header {{ display: flex; justify-content: space-between; align-items: center; }}
        .vm-name {{ font-weight: 600; color: #c9d1d9; }}
        .vm-status {{ font-size: 0.75em; font-weight: 600; }}
        .vm-focus {{ color: #8b949e; font-size: 0.8em; margin: 4px 0; }}
        .vm-stats {{ font-size: 0.85em; color: #8b949e; }}
        .vm-stats .best {{ color: #3fb950; font-weight: 600; }}
        .vm-log {{ font-size: 0.7em; color: #484f58; margin-top: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }}

        table {{ width: 100%; border-collapse: collapse; background: #161b22; border-radius: 8px; overflow: hidden; }}
        th {{ background: #21262d; color: #8b949e; text-align: left; padding: 8px 12px; font-size: 0.75em; text-transform: uppercase; letter-spacing: 0.5px; }}
        td {{ padding: 7px 12px; border-top: 1px solid #21262d; font-size: 0.9em; }}
        td.desc {{ color: #8b949e; font-size: 0.8em; max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }}
        tr:hover {{ background: #1c2128; }}

        .charts {{ display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }}
        canvas {{ background: #161b22; border-radius: 8px; border: 1px solid #30363d; width: 100%; }}

        .progress-bar {{ height: 4px; background: #21262d; border-radius: 2px; margin-top: 6px; }}
        .progress-fill {{ height: 100%; background: #3fb950; border-radius: 2px; transition: width 0.3s; }}

        .footer {{ color: #484f58; font-size: 0.75em; padding: 15px 30px; border-top: 1px solid #21262d; }}
        .footer code {{ background: #21262d; padding: 2px 6px; border-radius: 3px; }}

        @media (max-width: 800px) {{
            .stats-bar {{ flex-wrap: wrap; }}
            .stat {{ min-width: 50%; }}
            .charts {{ grid-template-columns: 1fr; }}
            .vm-grid {{ grid-template-columns: 1fr 1fr; }}
        }}
    </style>
</head>
<body>
    <div class="header">
        <h1>Astar Island — Autoresearch Swarm</h1>
        <div class="sub">Karpathy Protocol + Gemini 3.1 Pro | Updated {now} | Auto-refresh {REFRESH_SEC}s</div>
    </div>

    <div class="stats-bar">
        <div class="stat"><div class="value">{running}/13</div><div class="label">VMs Running</div></div>
        <div class="stat"><div class="value">{total_runs}</div><div class="label">Experiments</div></div>
        <div class="stat"><div class="value">{total_kept}</div><div class="label">Improvements</div></div>
        <div class="stat highlight"><div class="value">{global_best:.4f}</div><div class="label">Best WAVG</div></div>
        <div class="stat"><div class="value">{BASELINE:.2f}</div><div class="label">Baseline</div></div>
        <div class="stat"><div class="value">{exp_per_hr:.0f}</div><div class="label">Exp/Hour</div></div>
    </div>

    <div class="content">
        <div class="section">
            <h2>Fleet ({running} active)</h2>
            <div class="vm-grid">{vm_cards}</div>
        </div>

        <div class="section charts">
            <div>
                <h2>Kept Improvements</h2>
                <canvas id="keptChart" height="200"></canvas>
            </div>
            <div>
                <h2>All Experiments (chronological)</h2>
                <canvas id="allChart" height="200"></canvas>
            </div>
        </div>

        <div class="section">
            <h2>Research Areas</h2>
            <table>
                <tr><th>Focus</th><th>VMs</th><th>Runs</th><th>Keep Rate</th><th>Best</th></tr>
                {focus_rows}
            </table>
        </div>

        <div class="section">
            <h2>Top 25 Experiments</h2>
            <table>
                <tr><th>#</th><th>VM</th><th>WAVG</th><th>vs Baseline</th><th>Status</th><th>Description</th></tr>
                {top_rows}
            </table>
        </div>
    </div>

    <script>
    // Kept improvements bar chart
    const kept = {chart_kept};
    const kc = document.getElementById('keptChart');
    if (kc && kept.length > 0) {{
        const ctx = kc.getContext('2d');
        const W = kc.width = kc.offsetWidth * 2; const H = kc.height = 400;
        const pad = {{l:60, r:20, t:20, b:60}};
        const maxV = Math.max(...kept.map(d=>d.v)) + 0.1;
        const minV = Math.min(...kept.map(d=>d.v), {BASELINE}) - 0.3;
        const barW = Math.max(8, (W-pad.l-pad.r) / kept.length - 4);

        // Grid
        ctx.strokeStyle = '#21262d'; ctx.lineWidth = 1;
        for (let i=0;i<=4;i++) {{
            const y = pad.t + (H-pad.t-pad.b)*i/4;
            ctx.beginPath(); ctx.moveTo(pad.l,y); ctx.lineTo(W-pad.r,y); ctx.stroke();
            ctx.fillStyle='#484f58'; ctx.font='20px monospace';
            ctx.fillText((maxV-(maxV-minV)*i/4).toFixed(2), 2, y+6);
        }}

        // Baseline
        const baseY = pad.t + (H-pad.t-pad.b) * (1-(({BASELINE}-minV)/(maxV-minV)));
        ctx.strokeStyle='#f0883e'; ctx.setLineDash([8,4]);
        ctx.beginPath(); ctx.moveTo(pad.l,baseY); ctx.lineTo(W-pad.r,baseY); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle='#f0883e'; ctx.font='18px sans-serif';
        ctx.fillText('baseline {BASELINE}', W-pad.r-180, baseY-8);

        // Bars
        kept.forEach((d,i) => {{
            const x = pad.l + i*(barW+4);
            const h = (H-pad.t-pad.b) * ((d.v-minV)/(maxV-minV));
            const y = H-pad.b-h;
            ctx.fillStyle = d.v > {BASELINE} ? '#3fb950' : '#f0883e';
            ctx.fillRect(x, y, barW, h);
            // Label
            ctx.fillStyle='#8b949e'; ctx.font='16px sans-serif';
            ctx.save(); ctx.translate(x+barW/2, H-pad.b+8); ctx.rotate(Math.PI/4);
            ctx.fillText(d.vm, 0, 0); ctx.restore();
        }});
    }}

    // All experiments scatter
    const all = {chart_all};
    const ac = document.getElementById('allChart');
    if (ac && all.length > 0) {{
        const ctx = ac.getContext('2d');
        const W = ac.width = ac.offsetWidth * 2; const H = ac.height = 400;
        const pad = {{l:60, r:20, t:20, b:30}};
        const vals = all.map(d=>d.v).filter(v=>v>0);
        const minV = Math.min(...vals)-0.3; const maxV = Math.max(...vals)+0.3;

        ctx.strokeStyle='#21262d'; ctx.lineWidth=1;
        for (let i=0;i<=4;i++) {{
            const y = pad.t+(H-pad.t-pad.b)*i/4;
            ctx.beginPath(); ctx.moveTo(pad.l,y); ctx.lineTo(W-pad.r,y); ctx.stroke();
            ctx.fillStyle='#484f58'; ctx.font='20px monospace';
            ctx.fillText((maxV-(maxV-minV)*i/4).toFixed(2),2,y+6);
        }}

        // Baseline
        const baseY = pad.t+(H-pad.t-pad.b)*(1-(({BASELINE}-minV)/(maxV-minV)));
        ctx.strokeStyle='#f0883e'; ctx.setLineDash([8,4]);
        ctx.beginPath(); ctx.moveTo(pad.l,baseY); ctx.lineTo(W-pad.r,baseY); ctx.stroke();
        ctx.setLineDash([]);

        // Points
        all.forEach((d,i) => {{
            if(d.v<=0) return;
            const x = pad.l + (W-pad.l-pad.r)*i/all.length;
            const y = pad.t + (H-pad.t-pad.b)*(1-((d.v-minV)/(maxV-minV)));
            ctx.beginPath();
            ctx.arc(x,y, d.s==='keep'?8:4, 0, Math.PI*2);
            ctx.fillStyle = d.s==='keep'?'#3fb950':d.s==='discard'?'#484f58':'#f44336';
            ctx.fill();
        }});
    }}
    </script>

    <div class="footer">
        Collect: <code>bash scripts/gcp/collect-astar.sh</code> |
        Best: <code>bash scripts/gcp/collect-astar.sh --best</code> |
        Integrate: <code>bash scripts/gcp/collect-astar.sh --integrate</code>
    </div>
</body>
</html>"""
    return html


def update_dashboard():
    print(f"[{datetime.now().strftime('%H:%M:%S')}] Pulling from {len(VMS)} VMs...", flush=True)
    vm_data = pull_all()
    html = generate_html(vm_data)
    DASHBOARD_FILE.write_text(html)
    total = sum(v["runs"] for v in vm_data.values())
    best = max((v["best"] for v in vm_data.values()), default=0)
    running = sum(1 for v in vm_data.values() if v["status"] == "RUNNING")
    print(f"  {running} running | {total} experiments | best={best:.4f}", flush=True)


def updater_loop():
    while True:
        try:
            update_dashboard()
        except Exception as e:
            print(f"Update error: {e}", flush=True)
        time.sleep(REFRESH_SEC)


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path in ("/", "/dashboard.html"):
            self.send_response(200)
            self.send_header("Content-type", "text/html; charset=utf-8")
            self.end_headers()
            if DASHBOARD_FILE.exists():
                self.wfile.write(DASHBOARD_FILE.read_bytes())
            else:
                self.wfile.write(b"<h1>Loading...</h1>")
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, *args):
        pass


def main():
    global REFRESH_SEC
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8050)
    parser.add_argument("--refresh", type=int, default=60)
    args = parser.parse_args()
    REFRESH_SEC = args.refresh

    update_dashboard()
    threading.Thread(target=updater_loop, daemon=True).start()

    server = HTTPServer(("0.0.0.0", args.port), Handler)
    print(f"\nDashboard: http://localhost:{args.port}", flush=True)
    print(f"Refreshes every {REFRESH_SEC}s\n", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
