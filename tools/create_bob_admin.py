import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('100.72.184.60', username='bob', password='LanaSophiah19!', timeout=15)

script = """
from app.db.session import make_engine
from app.core.config import get_settings
from app.core.security import hash_password
from app.db import models
from sqlmodel import Session, select

settings = get_settings()
engine = make_engine(settings)

with Session(engine) as db:
    admin_role = db.exec(select(models.Role).where(models.Role.name == "admin")).first()
    if not admin_role:
        print("Role admin not found!")
        exit(1)
    
    # Check if bob exists
    bob = db.exec(select(models.User).where(models.User.username == "bob")).first()
    if not bob:
        bob = models.User(
            username="bob",
            password_hash=hash_password("LanaSophiah19!"),
            role_id=admin_role.id,
            mc_name="bob",
            mc_uuid="8e289159-2034-3a16-96b9-9fa637848b3b",
        )
        db.add(bob)
        print("User bob created successfully!")
    else:
        bob.password_hash = hash_password("LanaSophiah19!")
        bob.role_id = admin_role.id
        bob.mc_name = "bob"
        bob.mc_uuid = "8e289159-2034-3a16-96b9-9fa637848b3b"
        db.add(bob)
        print("User bob updated successfully!")
    db.commit()
"""

cmd = f"docker exec -i hexpanel python << 'EOF'\n{script}\nEOF"
_, stdout, stderr = ssh.exec_command(cmd)
print("OUT:", stdout.read().decode('utf-8'))
print("ERR:", stderr.read().decode('utf-8'))
ssh.close()
