"""API de autenticación y vinculación (PLAN §9, §11)."""
from __future__ import annotations

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from app.core.config import get_settings
from app.core.security import (
    Ctx,
    auth_limit,
    clear_session_cookie,
    create_session,
    current_ctx,
    get_db,
    hash_password,
    limiter,
    set_session_cookie,
    verify_password,
)
from app.db import models

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str
    password: str


class RegisterRequest(BaseModel):
    username: str
    password: str = Field(min_length=6)
    code: str
    email: Optional[str] = None


@router.post("/login")
@limiter.limit(auth_limit)
def login(
    req: LoginRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    settings = get_settings()
    user = db.exec(select(models.User).where(models.User.username == req.username)).first()
    if not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(401, "Credenciales incorrectas")

    token, sess = create_session(db, user, request, settings)
    set_session_cookie(response, token, settings)

    role = db.get(models.Role, user.role_id)
    perms = db.exec(
        select(models.RolePermission.permission).where(models.RolePermission.role_id == user.role_id)
    ).all()

    return {
        "ok": True,
        "csrf": sess.csrf,
        "user": {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "mc_uuid": user.mc_uuid,
            "mc_name": user.mc_name,
            "role": role.name if role else "player",
            "permissions": list(perms),
        },
    }


@router.post("/register")
@limiter.limit(auth_limit)
async def register(
    req: RegisterRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    settings = get_settings()
    bridge = request.app.state.bridge

    # Verificar código de vinculación con el Bridge
    link_info = await bridge.link_verify(req.code, consume=True)
    if not link_info:
        raise HTTPException(400, "Código de vinculación inválido o expirado. Usa /panel link en el juego.")

    mc_uuid = link_info.get("uuid")
    mc_name = link_info.get("name", req.username)

    # Verificar si el usuario o UUID ya están registrados
    existing_user = db.exec(select(models.User).where(models.User.username == req.username)).first()
    if existing_user:
        raise HTTPException(400, "El nombre de usuario ya está en uso")

    if mc_uuid:
        existing_uuid = db.exec(select(models.User).where(models.User.mc_uuid == mc_uuid)).first()
        if existing_uuid:
            raise HTTPException(400, "Esta cuenta de Minecraft ya está vinculada a otro usuario")

    # Obtener rol por defecto 'player'
    player_role = db.exec(select(models.Role).where(models.Role.name == "player")).first()
    if not player_role:
        player_role = models.Role(name="player")
        db.add(player_role)
        db.commit()
        db.refresh(player_role)

    user = models.User(
        username=req.username,
        password_hash=hash_password(req.password),
        email=req.email,
        mc_uuid=mc_uuid,
        mc_name=mc_name,
        role_id=player_role.id,  # type: ignore[arg-type]
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token, sess = create_session(db, user, request, settings)
    set_session_cookie(response, token, settings)

    return {
        "ok": True,
        "csrf": sess.csrf,
        "user": {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "mc_uuid": user.mc_uuid,
            "mc_name": user.mc_name,
            "role": player_role.name,
            "permissions": [],
        },
    }


@router.post("/logout")
def logout(
    response: Response,
    ctx: Ctx = Depends(current_ctx),
    db: Session = Depends(get_db),
):
    settings = get_settings()
    db.delete(ctx.session)
    db.commit()
    clear_session_cookie(response, settings)
    return {"ok": True}


@router.get("/link/verify")
async def verify_link_code(code: str, request: Request):
    bridge = request.app.state.bridge
    info = await bridge.link_verify(code, consume=False)
    if not info:
        raise HTTPException(404, "Código no encontrado o expirado")
    return info
