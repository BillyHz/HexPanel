import paramiko
import sys

sys.stdout.reconfigure(encoding='utf-8', errors='replace')
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('100.72.184.60', username='bob', password='LanaSophiah19!', timeout=20)

python_script = """
import urllib.request, json, http.cookiejar, time

cj = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))

# 1. Login
login_data = json.dumps({'username': 'bob', 'password': 'LanaSophiah19!'}).encode()
req = urllib.request.Request('http://127.0.0.1:8000/api/auth/login', data=login_data, headers={'Content-Type': 'application/json'})
res = opener.open(req)
csrf = json.loads(res.read().decode()).get('csrf')
print('LOGIN SUCCESSFUL')

# 2. Check bob's equipped slots and inventory
req = urllib.request.Request('http://127.0.0.1:8000/api/players/bob/containers')
res = opener.open(req)
data = json.loads(res.read().decode())
inv = data.get('inventory', {})
print(f"Inventory online: {inv.get('online')} | revision: {inv.get('revision')} | total items: {len(inv.get('items', []))}")

equipped = {36: 'boots', 37: 'leggings', 38: 'chestplate', 39: 'helmet', 40: 'offhand/shield'}
found_equipped = False
for it in inv.get('items', []):
    slot = it.get('slot')
    if slot in equipped:
        found_equipped = True
        print(f"  [EQUIPPED] Slot {slot} ({equipped[slot]}): {it.get('id')} (count: {it.get('count')})")
if not found_equipped:
    print("  No armor or shield currently equipped.")

# Print sample main inventory items
print("  Sample hotbar/inventory items:")
for it in inv.get('items', [])[:6]:
    if it.get('slot') not in equipped:
        print(f"    Slot {it.get('slot')}: {it.get('id')} x{it.get('count')}")
"""

cmd = f"docker exec -i hexpanel python << 'EOF'\n{python_script}\nEOF"
stdin, stdout, stderr = ssh.exec_command(cmd)
print(stdout.read().decode())
err = stderr.read().decode()
if err:
    print("ERR:", err)
ssh.close()
