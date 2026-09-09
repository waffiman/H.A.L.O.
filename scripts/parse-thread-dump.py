#!/usr/bin/env python3
import os
import re
import paramiko

HOST = "31.70.101.111"
PASSWORD = os.environ.get("IONOS_PASSWORD", "")

REMOTE_PY = r'''
from pathlib import Path
import re
t = Path("/root/cold-outreach-agent/debug_thread_Sandeep_Saroha.html").read_text(errors="ignore")
# Find message-body blocks and their ancestor class context
for m in re.finditer(r'class="([^"]*message-body[^"]*)"[^>]*>(.*?)</div>', t, re.S):
    body = re.sub(r"<[^>]+>", "", m.group(2))
    body = re.sub(r"\s+", " ", body).strip()
    # look back for member-message class
    start = max(0, m.start() - 800)
    window = t[start:m.start()]
    classes = re.findall(r'class="([^"]*member-message[^"]*)"', window)
    last_cls = classes[-1] if classes else "(none)"
    is_self = " self" in f" {last_cls} " or last_cls.endswith("self") or " self " in f" {last_cls} "
    print("SELF" if ("self" in last_cls.split()) else "OTHER?", "|", last_cls[:100], "|", body[:160])
'''

def main():
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username="root", password=PASSWORD, timeout=30)
    import base64
    b64 = base64.b64encode(REMOTE_PY.encode()).decode()
    _, o, _ = c.exec_command("rm -f /tmp/parse_thread.py.b64", timeout=20)
    o.channel.recv_exit_status()
    for i in range(0, len(b64), 4000):
        part = b64[i:i+4000]
        op = ">" if i == 0 else ">>"
        _, o, _ = c.exec_command(f"printf '%s' '{part}' {op} /tmp/parse_thread.py.b64", timeout=30)
        o.channel.recv_exit_status()
    _, o, e = c.exec_command(
        "base64 -d /tmp/parse_thread.py.b64 > /tmp/parse_thread.py && python3 /tmp/parse_thread.py",
        timeout=30,
    )
    print(o.read().decode(errors="replace"))
    print(e.read().decode(errors="replace"))
    c.close()

if __name__ == "__main__":
    main()
