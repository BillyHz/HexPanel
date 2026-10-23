"""API for interactive web map integration (Dynmap / Pl3xMap / BlueMap)."""
from __future__ import annotations

import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request
import httpx
from pydantic import BaseModel
from sqlmodel import Session

from app.core.config import get_settings
from app.core.permissions import PANEL_ADMIN, SERVER_CONSOLE, SERVER_VIEW
from app.core.security import Ctx, get_db, require
from app.db.models import MapSettings
from app.services.server import execute_server_command

router = APIRouter(prefix="/server/map", tags=["map"])
log = logging.getLogger("hexpanel.map")


def get_map_settings(db: Session) -> MapSettings:
    st = db.get(MapSettings, 1)
    if not st:
        st = MapSettings(id=1, enabled=True, url="http://100.72.184.60:8100", title="Mapa del Servidor")
        db.add(st)
        db.commit()
        db.refresh(st)
    return st


class MapSettingsUpdateRequest(BaseModel):
    enabled: Optional[bool] = None
    url: Optional[str] = None
    title: Optional[str] = None


class MapActionRequest(BaseModel):
    action: str  # render | pause | reload | cancel


@router.get("")
def get_map_config(
    db: Session = Depends(get_db),
    ctx: Ctx = Depends(require(SERVER_VIEW)),
):
    return get_map_settings(db)


@router.put("")
def update_map_config(
    req: MapSettingsUpdateRequest,
    db: Session = Depends(get_db),
    ctx: Ctx = Depends(require(PANEL_ADMIN)),
):
    st = get_map_settings(db)

    if req.enabled is not None:
        st.enabled = req.enabled
    if req.url is not None:
        clean_url = req.url.strip()
        if not clean_url:
            raise HTTPException(400, "La URL del mapa no puede estar vacía")
        st.url = clean_url
    if req.title is not None:
        st.title = req.title.strip() or "Mapa del Servidor"

    db.add(st)
    db.commit()
    db.refresh(st)
    return st


@router.get("/status")
async def get_map_status(
    db: Session = Depends(get_db),
    ctx: Ctx = Depends(require(SERVER_VIEW)),
):
    """Verifica si el servicio de mapa (BlueMap/Dynmap) está instalado y respondiendo."""
    st = get_map_settings(db)
    settings = get_settings()

    plugins_dir = settings.server_dir / "plugins"
    installed_plugin = None
    if plugins_dir.exists():
        for p in plugins_dir.iterdir():
            name_lower = p.name.lower()
            if "bluemap" in name_lower and not name_lower.endswith(".disabled"):
                installed_plugin = "BlueMap"
                break
            elif "dynmap" in name_lower and not name_lower.endswith(".disabled"):
                installed_plugin = "Dynmap"
                break
            elif "squaremap" in name_lower and not name_lower.endswith(".disabled"):
                installed_plugin = "Squaremap"
                break
            elif "pl3xmap" in name_lower and not name_lower.endswith(".disabled"):
                installed_plugin = "Pl3xMap"
                break

    is_online = False
    test_urls = [
        st.url,
        "http://mc-hardcore:8100",
        "http://127.0.0.1:8100",
        "http://100.72.184.60:8100",
    ]

    for url in test_urls:
        try:
            async with httpx.AsyncClient(timeout=1.5) as client:
                resp = await client.get(url)
                if resp.status_code in (200, 301, 302, 304):
                    is_online = True
                    break
        except Exception:
            continue

    return {
        "installed": installed_plugin is not None,
        "plugin_name": installed_plugin or "BlueMap / Dynmap",
        "online": is_online,
        "url": st.url,
        "enabled": st.enabled,
    }


@router.post("/action")
async def map_action(
    req: MapActionRequest,
    request: Request,
    db: Session = Depends(get_db),
    ctx: Ctx = Depends(require(SERVER_CONSOLE)),
):
    """Ejecuta comandos de control para el renderizador de mapa."""
    cmd_map = {
        "render": "bluemap render world",
        "pause": "bluemap pause",
        "reload": "bluemap reload",
        "cancel": "bluemap cancel",
    }
    cmd = cmd_map.get(req.action)
    if not cmd:
        raise HTTPException(400, f"Acción desconocida: {req.action}")

    settings = get_settings()
    bridge = request.app.state.bridge
    res = await execute_server_command(
        bridge=bridge,
        db=db,
        user_id=ctx.user.id,  # type: ignore[arg-type]
        username=ctx.user.username,
        ip=ctx.ip,
        command=cmd,
        settings=settings,
        is_admin=ctx.can(PANEL_ADMIN),
    )
    return {"status": "ok", "action": req.action, "command": cmd, "result": res}
