"""Servicio de copias de seguridad (Backups) del servidor Minecraft."""
from __future__ import annotations

import os
import re
import shutil
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from app.core.config import Settings


def get_backups_dir(settings: Settings) -> Path:
    bdir = settings.data_dir / "backups"
    bdir.mkdir(parents=True, exist_ok=True)
    return bdir


def _safe_filename(name: str) -> str:
    clean = re.sub(r"[^a-zA-Z0-9_\-\.]", "_", name)
    return clean.strip("._") or "backup"


def list_backups(settings: Settings) -> list[dict]:
    bdir = get_backups_dir(settings)
    out = []
    for f in bdir.iterdir():
        if f.is_file() and (f.suffix == ".zip" or f.name.endswith(".tar.gz")):
            stat = f.stat()
            # Derivar nombre legible
            display_name = f.stem
            if display_name.endswith(".tar"):
                display_name = display_name[:-4]
            out.append({
                "filename": f.name,
                "name": display_name,
                "size": stat.st_size,
                "created_at": datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
            })
    out.sort(key=lambda x: x["created_at"], reverse=True)
    return out


def create_backup(settings: Settings, name: Optional[str] = None) -> dict:
    bdir = get_backups_dir(settings)
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    clean_name = _safe_filename(name) if name else "manual"
    filename = f"backup_{ts}_{clean_name}.zip"
    dest_path = bdir / filename

    server_dir = settings.server_dir.resolve()
    dirs_to_backup = [
        settings.world_name,
        f"{settings.world_name}_nether",
        f"{settings.world_name}_the_end",
        "world",
        "world_nether",
        "world_the_end",
    ]
    # Eliminar duplicados manteniendo orden
    seen = set()
    dirs_to_backup = [d for d in dirs_to_backup if not (d in seen or seen.add(d))]

    config_files = [
        "server.properties",
        "bukkit.yml",
        "spigot.yml",
        "paper-global.yml",
        "paper-world-defaults.yml",
        "purpur.yml",
        "ops.json",
        "whitelist.json",
        "banned-players.json",
        "banned-ips.json",
    ]

    with zipfile.ZipFile(dest_path, "w", zipfile.ZIP_DEFLATED) as zf:
        # Respaldar mundos
        for dname in dirs_to_backup:
            world_path = server_dir / dname
            if world_path.is_dir():
                for root, _, files in os.walk(world_path):
                    for file in files:
                        fp = Path(root) / file
                        arcname = fp.relative_to(server_dir)
                        zf.write(fp, arcname)

        # Respaldar archivos de configuración
        for cname in config_files:
            cp = server_dir / cname
            if cp.is_file():
                zf.write(cp, cname)

    stat = dest_path.stat()
    return {
        "filename": filename,
        "name": f"backup_{ts}_{clean_name}",
        "size": stat.st_size,
        "created_at": datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
    }


def get_backup_path(settings: Settings, filename: str) -> Path:
    clean = Path(filename).name
    if clean != filename or ".." in filename or "/" in filename or "\\" in filename:
        raise ValueError("Nombre de archivo inválido")
    bpath = get_backups_dir(settings) / clean
    if not bpath.is_file():
        raise FileNotFoundError(f"Copia de seguridad '{filename}' no encontrada")
    return bpath


def restore_backup(settings: Settings, filename: str) -> dict:
    bpath = get_backup_path(settings, filename)
    server_dir = settings.server_dir.resolve()
    server_dir.mkdir(parents=True, exist_ok=True)

    with zipfile.ZipFile(bpath, "r") as zf:
        for member in zf.infolist():
            clean_member = member.filename.replace("\\", "/").lstrip("/")
            target_path = (server_dir / clean_member).resolve()
            if not target_path.is_relative_to(server_dir):
                raise PermissionError("Ruta insegura detectada en el archivo de copia de seguridad")
            if member.is_dir():
                target_path.mkdir(parents=True, exist_ok=True)
            else:
                target_path.parent.mkdir(parents=True, exist_ok=True)
                with zf.open(member) as src, open(target_path, "wb") as dst:
                    shutil.copyfileobj(src, dst)

    return {"ok": True, "message": f"Copia de seguridad '{filename}' restaurada exitosamente"}


def delete_backup(settings: Settings, filename: str) -> bool:
    bpath = get_backup_path(settings, filename)
    bpath.unlink()
    return True
