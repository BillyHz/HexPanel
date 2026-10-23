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

# 2. Send command 'list'
cmd_data = json.dumps({'command': 'list'}).encode()
req = urllib.request.Request('http://127.0.0.1:8000/api/server/command', data=cmd_data, headers={'Content-Type': 'application/json', 'x-csrf-token': csrf})
res = opener.open(req)
print('COMMAND /list RESPONSE:', res.status, res.read().decode())

time.sleep(1)

# 3. Read latest console logs
req = urllib.request.Request('http://127.0.0.1:8000/api/server/console?lines=5')
res = opener.open(req)
lines = json.loads(res.read().decode())
print('\\nLATEST CONSOLE LOGS:')
for l in lines[-4:]:
    print(' ', l)
"""

cmd = f"docker exec -i hexpanel python << 'EOF'\n{python_script}\nEOF"
stdin, stdout, stderr = ssh.exec_command(cmd)
print(stdout.read().decode())
err = stderr.read().decode()
if err:
    print("ERR:", err)
ssh.close()
