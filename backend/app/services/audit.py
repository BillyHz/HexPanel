"""Servicio de auditoría (PLAN §9, §10, §11)."""
from __future__ import annotations

from typing import Any, Optional
from sqlmodel import Session, select, desc
from app.db import models
from app.db.models import AuditLog, utcnow
from app.bridge.client import Bridge


def record_audit(
    db: Session,
    action: str,
    user_id: Optional[int] = None,
    username: str = "system",
    ip: str = "",
    target_uuid: Optional[str] = None,
    target_name: Optional[str] = None,
    payload: Any = None,
    undo_ref: Optional[str] = None,
) -> AuditLog:
    log_entry = AuditLog(
        user_id=user_id,
        username=username,
        ip=ip,
        action=action,
        target_uuid=target_uuid,
        target_name=target_name,
        payload=payload or {},
        undo_ref=undo_ref,
        at=utcnow(),
    )
    db.add(log_entry)
    db.commit()
    db.refresh(log_entry)
    return log_entry


def get_audit_logs(
    db: Session,
    limit: int = 50,
    offset: int = 0,
    action: Optional[str] = None,
    target_uuid: Optional[str] = None,
) -> list[AuditLog]:
    stmt = select(AuditLog)
    if action:
        stmt = stmt.where(AuditLog.action == action)
    if target_uuid:
        stmt = stmt.where(AuditLog.target_uuid == target_uuid)
    stmt = stmt.order_by(desc(AuditLog.at)).offset(offset).limit(limit)
    return list(db.exec(stmt).all())


async def undo_audit(db: Session, bridge: Bridge, audit_id: int) -> dict:
    entry = db.get(AuditLog, audit_id)
    if not entry:
        raise ValueError("Registro de auditoría no encontrado")
    if entry.undone:
        raise ValueError("Esta acción ya ha sido deshecha")
    if not entry.undo_ref or not entry.target_uuid:
        raise ValueError("Esta acción no admite deshacer")

    status, res = await bridge.containers_undo(entry.target_uuid, entry.undo_ref)
    if status >= 400:
        raise RuntimeError(f"Error al revertir en el Bridge ({status}): {res}")

    entry.undone = True
    db.add(entry)
    db.commit()
    return {"ok": True, "result": res}
