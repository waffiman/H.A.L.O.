#!/usr/bin/env python3
import os
import paramiko

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("31.70.101.111", username="root", password=os.environ["IONOS_PASSWORD"], timeout=30)
cmds = [
    "grep -n 'Lost revive' /root/cold-outreach-agent/index.js | head -5",
    "wc -c /root/cold-outreach-agent/index.js",
    "docker ps --filter name=linkedin-agent --format '{{.Names}} {{.Status}}'",
    "docker logs --tail 25 linkedin-agent 2>&1",
]
for cmd in cmds:
    print(">>>", cmd)
    _, o, e = c.exec_command(cmd, timeout=40)
    print(o.read().decode(errors="replace"))
    err = e.read().decode(errors="replace")
    if err.strip():
        print("ERR:", err[:500])
c.close()
