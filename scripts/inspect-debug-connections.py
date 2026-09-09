#!/usr/bin/env python3
import os
import paramiko

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("31.70.101.111", username="root", password=os.environ["IONOS_PASSWORD"], timeout=30)
cmds = [
    "ls -la /root/cold-outreach-agent/debug_connections.* 2>&1",
    "python3 - <<'PY'\n"
    "from pathlib import Path\n"
    "p=Path('/root/cold-outreach-agent/debug_connections.html')\n"
    "if not p.exists():\n"
    "  print('no html'); raise SystemExit\n"
    "html=p.read_text(encoding='utf-8', errors='replace')\n"
    "print('len', len(html))\n"
    "print('title snippet:', html[html.find('<title>'):html.find('</title>')+8] if '<title>' in html else 'no title')\n"
    "import re\n"
    "hrefs=re.findall(r'href=\"([^\"]*/in/[^\"]+)\"', html)\n"
    "print('in-href count', len(hrefs))\n"
    "print('sample', hrefs[:10])\n"
    "for needle in ['authwall','Sign in','connections','joshua','Recently added','mynetwork']:\n"
    "  print(needle, html.lower().find(needle.lower())>=0)\n"
    "PY",
    "docker rm -f linkedin-sync-once 2>/dev/null; docker start linkedin-agent 2>/dev/null; docker ps --format '{{.Names}} {{.Status}}'",
]
for cmd in cmds:
    print("===", cmd[:80])
    _, o, e = c.exec_command(cmd, timeout=60)
    print(o.read().decode(errors="replace") or e.read().decode(errors="replace"))
c.close()
