#!/usr/bin/env python3
import os
import paramiko

HOST = "31.70.101.111"
PASSWORD = os.environ.get("IONOS_PASSWORD", "")
REMOTE = "/root/cold-outreach-agent"
LOCAL = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username="root", password=PASSWORD, timeout=40)
sftp = c.open_sftp()
for name in [
    "login_debug_login_failed_all_attempts.png",
    "login_debug_login_failed_all_attempts.html",
]:
    remote = f"{REMOTE}/{name}"
    local = os.path.join(LOCAL, name)
    try:
        sftp.get(remote, local)
        print("downloaded", local, os.path.getsize(local))
    except Exception as e:
        print("skip", name, e)
sftp.close()

_, o, _ = c.exec_command(
    "docker logs --tail 20 linkedin-one-ice 2>&1; echo ---; ls -la /root/cold-outreach-agent/login_debug* 2>&1 | head -20",
    timeout=60,
)
print(o.read().decode(errors="replace")[:4000])
c.close()
