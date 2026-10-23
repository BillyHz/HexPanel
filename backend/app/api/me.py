"""API de cuenta personal (PLAN §8, §11)."""
from __future__ import annotations

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlmodel import Session

from app.core.config import get_settings
from app.core.security import Ctx, current_ctx, get_db, hash_password
from app.services.players import get_player_overview
from app.services.stats import get_offline_advancements

router = APIRouter(prefix="/me", tags=["me"])


class UpdateSettingsRequest(BaseModel):
    email: Optional[str] = None
    new_password: Optional[str] = None


@router.get("")
def get_me(ctx: Ctx = Depends(current_ctx)):
    return {
        "id": ctx.user.id,
        "username": ctx.user.username,
        "email": ctx.user.email,
        "mc_uuid": ctx.user.mc_uuid,
        "mc_name": ctx.user.mc_name,
        "role": ctx.role,
        "permissions": list(ctx.permissions),
        "csrf": ctx.session.csrf,
    }


@router.get("/overview")
async def get_my_overview(
    request: Request,
    ctx: Ctx = Depends(current_ctx),
    db: Session = Depends(get_db),
):
    if not ctx.user.mc_uuid and not ctx.user.mc_name:
        raise HTTPException(400, "Esta cuenta no está vinculada a un jugador de Minecraft")

    settings = get_settings()
    bridge = request.app.state.bridge
    identifier = ctx.user.mc_uuid or ctx.user.mc_name or ctx.user.username
    return await get_player_overview(bridge, settings, identifier, db=db)


@router.get("/achievements")
def get_my_achievements(
    ctx: Ctx = Depends(current_ctx),
):
    if not ctx.user.mc_uuid:
        return {}
    settings = get_settings()
    return get_offline_advancements(settings, ctx.user.mc_uuid)


@router.post("/settings")
def update_my_settings(
    req: UpdateSettingsRequest,
    ctx: Ctx = Depends(current_ctx),
    db: Session = Depends(get_db),
):
    if req.email is not None:
        ctx.user.email = req.email.strip()
    if req.new_password:
        if len(req.new_password) < 6:
            raise HTTPException(400, "La contraseña debe tener al menos 6 caracteres")
        ctx.user.password_hash = hash_password(req.new_password)

    db.add(ctx.user)
    db.commit()
    return {"ok": True}
