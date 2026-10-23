"""API para configuración y pruebas de Webhooks de Discord."""
from __future__ import annotations

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session

from app.core.permissions import PANEL_ADMIN, SERVER_VIEW
from app.core.security import Ctx, get_db, require
from app.db.models import DiscordSettings
from app.services.discord import (
    COLOR_BLUE,
    get_discord_settings,
    send_discord_alert,
)

router = APIRouter(prefix="/discord", tags=["discord"])


class DiscordSettingsUpdateRequest(BaseModel):
    webhook_url: Optional[str] = None
    enabled: Optional[bool] = None
    notify_on_start: Optional[bool] = None
    notify_on_stop: Optional[bool] = None
    notify_on_crash: Optional[bool] = None
    notify_on_low_tps: Optional[bool] = None


class DiscordTestRequest(BaseModel):
    webhook_url: Optional[str] = None


@router.get("/settings")
def get_settings_endpoint(
    db: Session = Depends(get_db),
    ctx: Ctx = Depends(require(SERVER_VIEW)),
):
    return get_discord_settings(db)


@router.put("/settings")
def update_settings_endpoint(
    req: DiscordSettingsUpdateRequest,
    db: Session = Depends(get_db),
    ctx: Ctx = Depends(require(PANEL_ADMIN)),
):
    st = get_discord_settings(db)

    if req.webhook_url is not None:
        st.webhook_url = req.webhook_url.strip()
    if req.enabled is not None:
        st.enabled = req.enabled
    if req.notify_on_start is not None:
        st.notify_on_start = req.notify_on_start
    if req.notify_on_stop is not None:
        st.notify_on_stop = req.notify_on_stop
    if req.notify_on_crash is not None:
        st.notify_on_crash = req.notify_on_crash
    if req.notify_on_low_tps is not None:
        st.notify_on_low_tps = req.notify_on_low_tps

    db.add(st)
    db.commit()
    db.refresh(st)
    return st


@router.post("/test")
async def test_discord_webhook(
    req: DiscordTestRequest = DiscordTestRequest(),
    db: Session = Depends(get_db),
    ctx: Ctx = Depends(require(PANEL_ADMIN)),
):
    st = get_discord_settings(db)
    target_url = (req.webhook_url.strip() if req.webhook_url and req.webhook_url.strip() else None) or st.webhook_url

    if not target_url:
        raise HTTPException(400, "URL de webhook no proporcionada ni configurada")

    success = await send_discord_alert(
        webhook_url=target_url,
        title="🔔 Prueba de Conexión - HexPanel",
        description="¡La integración con Discord funciona correctamente! Las alertas del servidor se enviarán a este canal.",
        color=COLOR_BLUE,
        fields=[
            {"name": "Usuario", "value": ctx.user.username, "inline": True},
            {"name": "Estado", "value": "Operativo", "inline": True},
        ],
    )

    if not success:
        raise HTTPException(502, "No se pudo entregar el mensaje de prueba a Discord. Verifica que la URL del Webhook sea correcta.")

    return {"ok": True, "message": "Mensaje de prueba enviado exitosamente a Discord"}
