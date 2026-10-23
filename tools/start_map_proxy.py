import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('100.72.184.60', username='bob', password='LanaSophiah19!')

nginx_conf = """
events {}
http {
    server {
        listen 8100;
        location / {
            proxy_pass http://mc-hardcore:8100;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
        }
    }
}
"""

stdin, stdout, stderr = ssh.exec_command("mkdir -p /home/bob/map-proxy")
sftp = ssh.open_sftp()
with sftp.file('/home/bob/map-proxy/nginx.conf', 'w') as f:
    f.write(nginx_conf)
sftp.close()

# Remove container if exists
stdin, stdout, stderr = ssh.exec_command("docker rm -f mc-map-proxy 2>/dev/null")
stdout.channel.recv_exit_status()

# Run docker container mc-map-proxy
cmd = (
    "docker run -d --name mc-map-proxy --restart unless-stopped "
    "--network mc-hardcore_default -p 8100:8100 "
    "-v /home/bob/map-proxy/nginx.conf:/etc/nginx/nginx.conf:ro "
    "nginx:alpine"
)
stdin, stdout, stderr = ssh.exec_command(cmd)
print("Docker run stdout:", stdout.read().decode())
print("Docker run stderr:", stderr.read().decode())

ssh.close()
