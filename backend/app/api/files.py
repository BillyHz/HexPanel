"""API for server file management (Web File Manager).

Critical security: All operations strictly verify that target paths
remain sandboxed within settings.server_dir (Path Traversal prevention).
"""
from __future__ import annotations

import os
import shutil
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.core.config import get_settings
from app.core.permissions import PANEL_ADMIN
from app.core.security import Ctx, require

router = APIRouter(prefix="/files", tags=["files"])

MAX_READ_SIZE = 5 * 1024 * 1024  # 5 MB


def resolve_safe_path(base_dir: Path, rel_path: str = "") -> Path:
    """Resolves a relative path ensuring it strictly belongs to base_dir."""
    base_resolved = base_dir.resolve()
    # Limpiar barras iniciales y normalizar
    clean = rel_path.strip().replace("\\", "/").lstrip("/")
    target = (base_resolved / clean).resolve()

    if not target.is_relative_to(base_resolved):
        raise HTTPException(
            status_code=403,
            detail="Access denied: path outside allowed directory",
        )
    return target


def get_relative_str(base_dir: Path, target: Path) -> str:
    """Devuelve la ruta relativa normalizada con '/'."""
    try:
        rel = target.relative_to(base_dir.resolve())
        return str(rel).replace("\\", "/")
    except ValueError:
        return target.name


class FileWriteRequest(BaseModel):
    path: str
    content: str


class FileCreateRequest(BaseModel):
    path: str
    is_dir: bool = False


class FileRenameRequest(BaseModel):
    path: str
    new_name: str


class FileCompressRequest(BaseModel):
    path: str
    output_name: Optional[str] = None


class FileExtractRequest(BaseModel):
    path: str
    target_dir: Optional[str] = None


class FileDeleteRequest(BaseModel):
    path: str


@router.get("/list")
def list_files(
    path: str = Query("", description="Ruta relativa dentro del servidor"),
    ctx: Ctx = Depends(require(PANEL_ADMIN)),
):
    settings = get_settings()
    settings.server_dir.mkdir(parents=True, exist_ok=True)
    target = resolve_safe_path(settings.server_dir, path)

    if not target.exists():
        raise HTTPException(404, "Ruta no encontrada")
    if not target.is_dir():
        raise HTTPException(400, "La ruta indicada no es un directorio")

    entries = []
    try:
        for entry in os.scandir(target):
            try:
                stat = entry.stat()
                is_dir = entry.is_dir()
                rel = get_relative_str(settings.server_dir, Path(entry.path))
                entries.append({
                    "name": entry.name,
                    "path": rel,
                    "size": 0 if is_dir else stat.st_size,
                    "is_dir": is_dir,
                    "modified_at": datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
                })
            except Exception:
                continue
    except Exception as e:
        raise HTTPException(500, f"Error al listar archivos: {e}")

    # Ordenar: directorios primero, luego alfabético
    entries.sort(key=lambda x: (not x["is_dir"], x["name"].lower()))

    current_rel = get_relative_str(settings.server_dir, target)
    return {
        "current_path": "" if current_rel == "." else current_rel,
        "items": entries,
    }


@router.get("/read")
def read_file(
    path: str = Query(..., description="Ruta relativa del archivo"),
    ctx: Ctx = Depends(require(PANEL_ADMIN)),
):
    settings = get_settings()
    target = resolve_safe_path(settings.server_dir, path)

    if not target.exists():
        raise HTTPException(404, "Archivo no encontrado")
    if target.is_dir():
        raise HTTPException(400, "La ruta indicada es un directorio")

    stat = target.stat()
    if stat.st_size > MAX_READ_SIZE:
        raise HTTPException(413, f"El archivo excede el tamaño máximo permitido para edición (5 MB)")

    try:
        with open(target, "r", encoding="utf-8") as f:
            content = f.read()
    except UnicodeDecodeError:
        raise HTTPException(400, "El archivo es binario y no puede mostrarse como texto")
    except Exception as e:
        raise HTTPException(500, f"Error al leer archivo: {e}")

    return {
        "path": get_relative_str(settings.server_dir, target),
        "name": target.name,
        "size": stat.st_size,
        "content": content,
    }


@router.post("/write")
def write_file(
    req: FileWriteRequest,
    ctx: Ctx = Depends(require(PANEL_ADMIN)),
):
    settings = get_settings()
    target = resolve_safe_path(settings.server_dir, req.path)

    if target.is_dir():
        raise HTTPException(400, "No se puede sobreescribir un directorio con contenido de texto")

    target.parent.mkdir(parents=True, exist_ok=True)
    try:
        with open(target, "w", encoding="utf-8") as f:
            f.write(req.content)
    except Exception as e:
        raise HTTPException(500, f"Error al escribir archivo: {e}")

    return {
        "ok": True,
        "message": "Archivo guardado exitosamente",
        "path": get_relative_str(settings.server_dir, target),
        "size": target.stat().st_size,
    }


@router.post("/create")
def create_file_or_dir(
    req: FileCreateRequest,
    ctx: Ctx = Depends(require(PANEL_ADMIN)),
):
    settings = get_settings()
    target = resolve_safe_path(settings.server_dir, req.path)

    if target.exists():
        raise HTTPException(409, "El archivo o carpeta ya existe")

    try:
        if req.is_dir:
            target.mkdir(parents=True, exist_ok=True)
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.touch()
    except Exception as e:
        raise HTTPException(500, f"Error al crear elemento: {e}")

    return {
        "ok": True,
        "message": "Creado exitosamente",
        "path": get_relative_str(settings.server_dir, target),
        "is_dir": req.is_dir,
    }


@router.delete("")
def delete_file_or_dir(
    path: Optional[str] = Query(None),
    body: Optional[FileDeleteRequest] = None,
    ctx: Ctx = Depends(require(PANEL_ADMIN)),
):
    target_path_str = path or (body.path if body else None)
    if not target_path_str:
        raise HTTPException(400, "Parámetro 'path' requerido")

    settings = get_settings()
    target = resolve_safe_path(settings.server_dir, target_path_str)

    if not target.exists():
        raise HTTPException(404, "Elemento no encontrado")
    if target == settings.server_dir.resolve():
        raise HTTPException(403, "No se puede eliminar el directorio raíz del servidor")

    try:
        if target.is_dir():
            shutil.rmtree(target)
        else:
            target.unlink()
    except Exception as e:
        raise HTTPException(500, f"Error al eliminar elemento: {e}")

    return {"ok": True, "message": "Elemento eliminado exitosamente"}


@router.post("/rename")
def rename_file_or_dir(
    req: FileRenameRequest,
    ctx: Ctx = Depends(require(PANEL_ADMIN)),
):
    settings = get_settings()
    source = resolve_safe_path(settings.server_dir, req.path)

    if not source.exists():
        raise HTTPException(404, "Elemento original no encontrado")
    if source == settings.server_dir.resolve():
        raise HTTPException(403, "No se puede renombrar el directorio raíz")

    # Si new_name es solo un nombre, renombramos en el mismo directorio
    # Si contiene '/', resolvemos como ruta relativa
    if "/" in req.new_name or "\\" in req.new_name:
        destination = resolve_safe_path(settings.server_dir, req.new_name)
    else:
        destination = resolve_safe_path(source.parent, req.new_name)

    if destination.exists():
        raise HTTPException(409, "El destino ya existe")

    destination.parent.mkdir(parents=True, exist_ok=True)
    try:
        source.rename(destination)
    except Exception as e:
        raise HTTPException(500, f"Error al renombrar: {e}")

    return {
        "ok": True,
        "message": "Renombrado exitosamente",
        "old_path": get_relative_str(settings.server_dir, source),
        "new_path": get_relative_str(settings.server_dir, destination),
    }


@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    path: str = Form(""),
    ctx: Ctx = Depends(require(PANEL_ADMIN)),
):
    settings = get_settings()
    target_dir = resolve_safe_path(settings.server_dir, path)
    if not target_dir.exists():
        target_dir.mkdir(parents=True, exist_ok=True)
    if not target_dir.is_dir():
        raise HTTPException(400, "El destino de la subida debe ser un directorio")

    filename = Path(file.filename or "upload.bin").name
    dest = resolve_safe_path(target_dir, filename)

    try:
        with open(dest, "wb") as f:
            while chunk := await file.read(1024 * 1024):
                f.write(chunk)
    except Exception as e:
        raise HTTPException(500, f"Error al guardar archivo subido: {e}")

    return {
        "ok": True,
        "message": "Archivo subido exitosamente",
        "path": get_relative_str(settings.server_dir, dest),
        "size": dest.stat().st_size,
    }


@router.post("/compress")
def compress_file_or_dir(
    req: FileCompressRequest,
    ctx: Ctx = Depends(require(PANEL_ADMIN)),
):
    settings = get_settings()
    target = resolve_safe_path(settings.server_dir, req.path)

    if not target.exists():
        raise HTTPException(404, "Elemento no encontrado")

    zip_name = req.output_name.strip() if req.output_name else f"{target.name}.zip"
    if not zip_name.endswith(".zip"):
        zip_name += ".zip"

    zip_path = resolve_safe_path(target.parent, zip_name)

    try:
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            if target.is_dir():
                for root, _, files in os.walk(target):
                    for file in files:
                        file_path = Path(root) / file
                        arcname = file_path.relative_to(target.parent)
                        zf.write(file_path, arcname)
            else:
                zf.write(target, target.name)
    except Exception as e:
        raise HTTPException(500, f"Error al comprimir: {e}")

    return {
        "ok": True,
        "message": "Archivo comprimido exitosamente",
        "path": get_relative_str(settings.server_dir, zip_path),
        "size": zip_path.stat().st_size,
    }


@router.post("/extract")
def extract_zip(
    req: FileExtractRequest,
    ctx: Ctx = Depends(require(PANEL_ADMIN)),
):
    settings = get_settings()
    zip_path = resolve_safe_path(settings.server_dir, req.path)

    if not zip_path.is_file():
        raise HTTPException(404, "Archivo zip no encontrado")

    extract_dest = (
        resolve_safe_path(settings.server_dir, req.target_dir)
        if req.target_dir
        else zip_path.parent
    )
    extract_dest.mkdir(parents=True, exist_ok=True)

    try:
        with zipfile.ZipFile(zip_path, "r") as zf:
            for member in zf.infolist():
                # Prevención de Zip Slip
                member_target = resolve_safe_path(extract_dest, member.filename)
                if member.is_dir():
                    member_target.mkdir(parents=True, exist_ok=True)
                else:
                    member_target.parent.mkdir(parents=True, exist_ok=True)
                    with zf.open(member) as src, open(member_target, "wb") as dst:
                        shutil.copyfileobj(src, dst)
    except Exception as e:
        raise HTTPException(500, f"Error al extraer archivo zip: {e}")

    return {
        "ok": True,
        "message": "Archivo extraído exitosamente",
        "destination": get_relative_str(settings.server_dir, extract_dest),
    }


@router.get("/download")
def download_file(
    path: str = Query(..., description="Ruta relativa del archivo"),
    ctx: Ctx = Depends(require(PANEL_ADMIN)),
):
    settings = get_settings()
    target = resolve_safe_path(settings.server_dir, path)

    if not target.is_file():
        raise HTTPException(404, "Archivo no encontrado")

    return FileResponse(
        target,
        filename=target.name,
        media_type="application/octet-stream",
    )
