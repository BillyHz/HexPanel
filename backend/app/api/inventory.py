"""API de inventario y contenedores (PLAN §7, §11)."""
from __future__ import annotations

from typing import Any
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlmodel import Session

from app.core.permissions import INVENTORY_EDIT, INVENTORY_VIEW
from app.core.security import Ctx, current_ctx, get_db, require
from app.services.inventory import apply_container_ops, get_player_containers
from app.services.players import resolve_player_uuid

router = APIRouter(prefix="/players", tags=["inventory"])


@router.get("/{name}/containers")
async def get_containers(
    name: str,
    request: Request,
    ctx: Ctx = Depends(current_ctx),
):
    bridge = request.app.state.bridge
    target_uuid, target_name = await resolve_player_uuid(bridge, name)

    # Puede ver si tiene permiso inventory.view O es su propio jugador
    if not ctx.can(INVENTORY_VIEW) and not ctx.is_self(target_uuid):
        raise HTTPException(403, "No tienes permiso para ver el inventario de otros jugadores")

    try:
        return await get_player_containers(bridge, target_uuid)
    except Exception as e:
        raise HTTPException(502, f"Error al comunicarse con el Bridge: {e}")


@router.post("/{name}/containers/ops")
async def apply_ops(
    name: str,
    body: dict[str, Any],
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    ctx: Ctx = Depends(require(INVENTORY_EDIT)),
):
    bridge = request.app.state.bridge
    status, result = await apply_container_ops(
        bridge=bridge,
        db=db,
        user_id=ctx.user.id,  # type: ignore[arg-type]
        username=ctx.user.username,
        ip=ctx.ip,
        name_or_uuid=name,
        body=body,
    )

    response.status_code = status
    return result
