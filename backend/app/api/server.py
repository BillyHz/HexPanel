"""API de estado del servidor, consola y energía (PLAN §8, §11)."""
from __future__ import annotations

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlmodel import Session

from app.core.config import get_settings
from app.core.permissions import PANEL_ADMIN, SERVER_CONSOLE, SERVER_POWER, SERVER_VIEW
from app.core.security import Ctx, get_db, require
from app.services.server import (
    execute_server_command,
    get_metrics_history,
    get_server_status,
    handle_power_action,
)

router = APIRouter(prefix="/server", tags=["server"])


class PowerRequest(BaseModel):
    action: str  # start | stop | restart | kill


class CommandRequest(BaseModel):
    command: str


@router.get("/status")
async def server_status(
    request: Request,
    ctx: Ctx = Depends(require(SERVER_VIEW)),
):
    settings = get_settings()
    bridge = request.app.state.bridge
    supervisor = getattr(request.app.state, "supervisor", None)
    return await get_server_status(bridge, supervisor, settings)


@router.get("/metrics")
def server_metrics(
    range_minutes: int = 10,
    db: Session = Depends(get_db),
    ctx: Ctx = Depends(require(SERVER_VIEW)),
):
    return get_metrics_history(db, minutes=range_minutes)


@router.get("/console")
def server_console_history(
    lines: int = 200,
    ctx: Ctx = Depends(require(SERVER_CONSOLE)),
):
    settings = get_settings()
    log_path = settings.server_dir / "logs" / "latest.log"
    if not log_path.is_file():
        return []
    try:
        lines_to_read = max(1, min(lines, 1000))
        with open(log_path, "r", encoding="utf-8", errors="replace") as f:
            all_lines = f.readlines()
            return [l.rstrip("\r\n") for l in all_lines[-lines_to_read:]]
    except Exception as e:
        return [f"[HexPanel] Error al leer logs: {e}"]


@router.post("/power")
async def server_power(
    req: PowerRequest,
    request: Request,
    ctx: Ctx = Depends(require(SERVER_POWER)),
):
    bridge = request.app.state.bridge
    supervisor = getattr(request.app.state, "supervisor", None)
    try:
        return await handle_power_action(bridge, supervisor, req.action)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(502, f"Error en acción de energía: {e}")


@router.post("/command")
async def server_command(
    req: CommandRequest,
    request: Request,
    db: Session = Depends(get_db),
    ctx: Ctx = Depends(require(SERVER_CONSOLE)),
):
    settings = get_settings()
    bridge = request.app.state.bridge
    is_admin = ctx.can(PANEL_ADMIN)
    try:
        return await execute_server_command(
            bridge=bridge,
            db=db,
            user_id=ctx.user.id,  # type: ignore[arg-type]
            username=ctx.user.username,
            ip=ctx.ip,
            command=req.command,
            settings=settings,
            is_admin=is_admin,
        )
    except PermissionError as e:
        raise HTTPException(403, str(e))
    except Exception as e:
        raise HTTPException(502, f"Error al ejecutar comando: {e}")
