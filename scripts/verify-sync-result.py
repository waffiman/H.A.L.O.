#!/usr/bin/env python3
import json
import os
import urllib.request
import paramiko

PASSWORD = os.environ["IONOS_PASSWORD"]

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("31.70.101.111", username="root", password=PASSWORD, timeout=30)

print("=== cleanup sync-once + ensure agent up ===")
_, o, _ = c.exec_command(
    "docker rm -f linkedin-sync-once 2>/dev/null; docker start linkedin-agent 2>/dev/null; "
    "docker ps --format 'table {{.Names}}\t{{.Status}}'; "
    "echo '--- state ---'; cat /root/cold-outreach-agent/connections_sync_state.json 2>/dev/null",
    timeout=60,
)
print(o.read().decode(errors="replace"))

# Read Notion token from server .env (stripped)
_, o, _ = c.exec_command(
    "python3 - <<'PY'\n"
    "from pathlib import Path\n"
    "env={}\n"
    "for line in Path('/root/cold-outreach-agent/.env').read_text().splitlines():\n"
    "  if '=' in line and not line.strip().startswith('#'):\n"
    "    k,_,v=line.partition('=')\n"
    "    v=v.strip().strip('\\\"').strip(\"'\")\n"
    "    env[k.strip()]=v\n"
    "print(env.get('NOTION_TOKEN',''))\n"
    "print(env.get('NOTION_DATABASE_ID',''))\n"
    "PY",
    timeout=30,
)
tok, db = o.read().decode().strip().splitlines()[:2]
c.close()

body = json.dumps(
    {
        "filter": {"property": "Status", "select": {"equals": "Proposal 1\ufe0f\u20e3"}},
        "page_size": 20,
    }
).encode()
req = urllib.request.Request(
    f"https://api.notion.com/v1/databases/{db}/query",
    data=body,
    headers={
        "Authorization": f"Bearer {tok}",
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
    },
)
data = json.loads(urllib.request.urlopen(req, timeout=60).read())
print(f"=== Notion Proposal 1 count: {len(data['results'])} ===")
for p in data["results"]:
    props = p["properties"]
    name = "".join(t["plain_text"] for t in props.get("Name", {}).get("title", [])).strip()
    link = props.get("Link", {}).get("url") or ""
    print(f"  {name or '(no name)'} | {link}")
