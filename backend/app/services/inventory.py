"""Servicio de inventario y cofre de ender (PLAN §7, §11)."""
from __future__ import annotations

from typing import Any, Optional
from sqlmodel import Session
from app.bridge.client import Bridge
from app.services.players import resolve_player_uuid
from app.services.audit import record_audit


async def get_player_containers(bridge: Bridge, name_or_uuid: str) -> dict:
    uuid, _ = await resolve_player_uuid(bridge, name_or_uuid)
    return await bridge.containers(uuid)


async def apply_container_ops(
    bridge: Bridge,
    db: Session,
    user_id: int,
    username: str,
    ip: str,
    name_or_uuid: str,
    body: dict,
) -> tuple[int, Any]:
    uuid, name = await resolve_player_uuid(bridge, name_or_uuid)
    status, res = await bridge.containers_ops(uuid, body)

    if status == 200 and isinstance(res, dict):
        undo_ref = res.get("undoRef")
        record_audit(
            db=db,
            user_id=user_id,
            username=username,
            ip=ip,
            action="inventory.ops",
            target_uuid=uuid,
            target_name=name,
            payload=body,
            undo_ref=undo_ref,
        )

    return status, res
