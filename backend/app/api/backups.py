"""API for server backup management."""
from __future__ import annotations

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.core.config import get_settings
from app.core.permissions import PANEL_ADMIN, SERVER_VIEW
from app.core.security import Ctx, require
from app.services import backups as backup_service

router = APIRouter(prefix="/backups", tags=["backups"])


class BackupCreateRequest(BaseModel):
    name: Optional[str] = None


@router.get("")
def list_backups(
    ctx: Ctx = Depends(require(SERVER_VIEW)),
):
    settings = get_settings()
    return backup_service.list_backups(settings)


@router.post("")
def create_backup(
    req: BackupCreateRequest = BackupCreateRequest(),
    ctx: Ctx = Depends(require(PANEL_ADMIN)),
):
    settings = get_settings()
    try:
        res = backup_service.create_backup(settings, req.name)
        return {"ok": True, "backup": res}
    except Exception as e:
        raise HTTPException(500, f"Error al crear copia de seguridad: {e}")


@router.post("/{filename}/restore")
def restore_backup(
    filename: str,
    ctx: Ctx = Depends(require(PANEL_ADMIN)),
):
    settings = get_settings()
    try:
        return backup_service.restore_backup(settings, filename)
    except FileNotFoundError:
        raise HTTPException(404, "Copia de seguridad no encontrada")
    except ValueError as e:
        raise HTTPException(400, str(e))
    except PermissionError as e:
        raise HTTPException(403, str(e))
    except Exception as e:
        raise HTTPException(500, f"Error al restaurar copia de seguridad: {e}")


@router.delete("/{filename}")
def delete_backup(
    filename: str,
    ctx: Ctx = Depends(require(PANEL_ADMIN)),
):
    settings = get_settings()
    try:
        backup_service.delete_backup(settings, filename)
        return {"ok": True, "message": f"Copia de seguridad '{filename}' eliminada"}
    except FileNotFoundError:
        raise HTTPException(404, "Copia de seguridad no encontrada")
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, f"Error al eliminar copia de seguridad: {e}")


@router.get("/{filename}/download")
def download_backup(
    filename: str,
    ctx: Ctx = Depends(require(PANEL_ADMIN)),
):
    settings = get_settings()
    try:
        bpath = backup_service.get_backup_path(settings, filename)
        return FileResponse(
            bpath,
            filename=bpath.name,
            media_type="application/zip",
        )
    except FileNotFoundError:
        raise HTTPException(404, "Copia de seguridad no encontrada")
    except ValueError as e:
        raise HTTPException(400, str(e))
