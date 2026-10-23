"""CLI de HexPanel: creación de admin inicial y utilidades (PLAN §9, §12)."""
from __future__ import annotations

import argparse
import getpass
import sys
from sqlmodel import Session, select

from app.core.config import get_settings
from app.core.security import hash_password
from app.db import models
from app.db.session import init_db, make_engine


def create_admin(username: str, password: str | None = None, email: str | None = None) -> int:
    settings = get_settings()
    engine = make_engine(settings)
    init_db(engine)

    with Session(engine) as db:
        admin_role = db.exec(select(models.Role).where(models.Role.name == "admin")).first()
        if not admin_role:
            print("Error: El rol 'admin' no existe en la base de datos", file=sys.stderr)
            return 1

        existing = db.exec(select(models.User).where(models.User.username == username)).first()
        if existing:
            print(f"El usuario '{username}' ya existe. Asignando rol admin...", file=sys.stderr)
            existing.role_id = admin_role.id  # type: ignore[assignment]
            db.add(existing)
            db.commit()
            print(f"Usuario '{username}' actualizado a admin.")
            return 0

        if not password:
            password = getpass.getpass(f"Contraseña para {username}: ")
            confirm = getpass.getpass("Confirmar contraseña: ")
            if password != confirm:
                print("Error: Las contraseñas no coinciden", file=sys.stderr)
                return 1

        if len(password) < 6:
            print("Error: La contraseña debe tener al menos 6 caracteres", file=sys.stderr)
            return 1

        user = models.User(
            username=username,
            password_hash=hash_password(password),
            email=email,
            role_id=admin_role.id,  # type: ignore[arg-type]
        )
        db.add(user)
        db.commit()
        print(f"Admin '{username}' creado exitosamente.")
        return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="HexPanel CLI")
    sub = parser.add_subparsers(dest="cmd", required=True)

    admin_parser = sub.add_parser("create-admin", help="Crea un usuario administrador inicial")
    admin_parser.add_argument("username", help="Nombre de usuario")
    admin_parser.add_argument("--password", "-p", help="Contraseña (si se omite se solicita)")
    admin_parser.add_argument("--email", "-e", help="Correo electrónico opcional")

    args = parser.parse_args(argv)
    if args.cmd == "create-admin":
        return create_admin(args.username, args.password, args.email)
    return 0


if __name__ == "__main__":
    sys.exit(main())
