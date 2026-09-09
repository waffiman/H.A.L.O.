#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import os, paramiko, sys
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("31.70.101.111", username="root", password=os.environ["IONOS_PASSWORD"], timeout=40)
_, o, _ = c.exec_command(
    "grep -E 'ALLOW_AUTO_LOGIN|SKIP_STAGE_B|SKIP_CONVERSATION' /root/cold-outreach-agent/.env; "
    "docker restart linkedin-agent; sleep 10; "
    "docker logs --tail 25 linkedin-agent 2>&1 | tr -cd '\\11\\12\\15\\40-\\176'",
    timeout=90,
)
print(o.read().decode("utf-8", errors="replace"))
c.close()
