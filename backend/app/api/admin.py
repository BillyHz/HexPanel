"""API de administración, auditoría y roles (PLAN §8, §11)."""
from __future__ import annotations

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlmodel import Session, select

from app.core.permissions import AUDIT_VIEW, INVENTORY_EDIT, PANEL_ADMIN
from app.core.security import Ctx, get_db, require
from app.db import models
from app.services.audit import get_audit_logs, undo_audit

router = APIRouter(prefix="/admin", tags=["admin"])


class UpdateUserRequest(BaseModel):
    role_id: Optional[int] = None
    email: Optional[str] = None


@router.get("/audit")
def list_audit(
    limit: int = 50,
    offset: int = 0,
    action: Optional[str] = None,
    target_uuid: Optional[str] = None,
    db: Session = Depends(get_db),
    ctx: Ctx = Depends(require(AUDIT_VIEW)),
):
    return get_audit_logs(db, limit=limit, offset=offset, action=action, target_uuid=target_uuid)


@router.post("/audit/{audit_id}/undo")
async def undo_audit_action(
    audit_id: int,
    request: Request,
    db: Session = Depends(get_db),
    ctx: Ctx = Depends(require(INVENTORY_EDIT)),
):
    bridge = request.app.state.bridge
    try:
        return await undo_audit(db, bridge, audit_id)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(502, f"Error al deshacer operación: {e}")


@router.get("/users")
def list_users(
    db: Session = Depends(get_db),
    ctx: Ctx = Depends(require(PANEL_ADMIN)),
):
    users = db.exec(select(models.User)).all()
    roles = {r.id: r.name for r in db.exec(select(models.Role)).all()}
    return [
        {
            "id": u.id,
            "username": u.username,
            "email": u.email,
            "mc_uuid": u.mc_uuid,
            "mc_name": u.mc_name,
            "role": roles.get(u.role_id, "unknown"),
            "role_id": u.role_id,
            "created_at": u.created_at.isoformat() if u.created_at else None,
            "last_login": u.last_login.isoformat() if u.last_login else None,
        }
        for u in users
    ]


@router.patch("/users/{user_id}")
def update_user(
    user_id: int,
    req: UpdateUserRequest,
    db: Session = Depends(get_db),
    ctx: Ctx = Depends(require(PANEL_ADMIN)),
):
    user = db.get(models.User, user_id)
    if not user:
        raise HTTPException(404, "Usuario no encontrado")
    if req.role_id is not None:
        role = db.get(models.Role, req.role_id)
        if not role:
            raise HTTPException(400, "Rol inválido")
        user.role_id = role.id  # type: ignore[assignment]
    if req.email is not None:
        user.email = req.email.strip()
    db.add(user)
    db.commit()
    return {"ok": True}


@router.get("/roles")
def list_roles(
    db: Session = Depends(get_db),
    ctx: Ctx = Depends(require(PANEL_ADMIN)),
):
    roles = db.exec(select(models.Role)).all()
    perms = db.exec(select(models.RolePermission)).all()
    perm_map: dict[int, list[str]] = {}
    for p in perms:
        perm_map.setdefault(p.role_id, []).append(p.permission)
    return [{"id": r.id, "name": r.name, "permissions": perm_map.get(r.id or 0, [])} for r in roles]
