"""API de jugadores y moderación (PLAN §8, §11)."""
from __future__ import annotations

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlmodel import Session

from app.core.config import get_settings
from app.core.permissions import PLAYERS_VIEW, PLAYERS_MODERATE
from app.core.security import Ctx, get_db, require
from app.services.players import execute_player_action, get_player_overview, get_players_list
from app.services.audit import record_audit

router = APIRouter(prefix="/players", tags=["players"])


class ActionRequest(BaseModel):
    action: str
    args: Optional[dict] = None


@router.get("")
async def list_players(
    request: Request,
    q: str = "",
    online: Optional[bool] = None,
    ctx: Ctx = Depends(require(PLAYERS_VIEW)),
):
    settings = get_settings()
    bridge = request.app.state.bridge
    try:
        return await get_players_list(bridge, settings, query=q, online=online)
    except Exception as e:
        raise HTTPException(502, f"Error al listar jugadores: {e}")


@router.get("/{name}/overview")
async def player_overview(
    name: str,
    request: Request,
    db: Session = Depends(get_db),
    ctx: Ctx = Depends(require(PLAYERS_VIEW)),
):
    settings = get_settings()
    bridge = request.app.state.bridge
    try:
        return await get_player_overview(bridge, settings, name, db=db)
    except Exception as e:
        raise HTTPException(500, f"Error al cargar jugador: {e}")


@router.post("/{name}/actions")
async def player_actions(
    name: str,
    req: ActionRequest,
    request: Request,
    db: Session = Depends(get_db),
    ctx: Ctx = Depends(require(PLAYERS_MODERATE)),
):
    bridge = request.app.state.bridge
    try:
        res = await execute_player_action(bridge, name, req.action, req.args)
        record_audit(
            db=db,
            user_id=ctx.user.id,
            username=ctx.user.username,
            ip=ctx.ip,
            action=f"player.{req.action}",
            target_name=name,
            payload={"action": req.action, "args": req.args, "result": res},
        )
        return {"ok": True, "result": res}
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(502, f"Error al ejecutar acción: {e}")
