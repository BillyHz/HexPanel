import paramiko
import time
import sys

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('100.72.184.60', username='bob', password='LanaSophiah19!', timeout=30)

def run(cmd):
    print(f"\n>>> {cmd}", flush=True)
    stdin, stdout, stderr = ssh.exec_command(cmd, get_pty=True)
    for line in iter(stdout.readline, ""):
        print(line, end="", flush=True)
    status = stdout.channel.recv_exit_status()
    print(f"<<< Exit status: {status}", flush=True)
    return status

# 1. Pull changes
run("cd /home/bob/HexPanel && git pull origin main")

# 2. Rebuild and restart container
run("cd /home/bob/HexPanel && docker compose up -d --build")

# 3. Check status
time.sleep(2)
run("docker ps --filter name=hexpanel")

# 4. Check logs
run("docker logs --tail 20 hexpanel")

ssh.close()
