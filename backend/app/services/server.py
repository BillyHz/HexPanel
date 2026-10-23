"""Servicio de servidor, métricas y energía (PLAN §8, §11)."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from sqlmodel import Session, select, desc
from app.core.config import Settings
from app.bridge.client import Bridge, BridgeError, BridgeUnavailable
from app.services.supervisor import Supervisor, ProcessState
from app.services.audit import record_audit
from app.db import models


async def get_server_status(
    bridge: Bridge,
    supervisor: Optional[Supervisor],
    settings: Settings,
) -> dict:
    online = False
    bridge_info = {}
    metrics = {}
    
    try:
        health = await bridge.health()
        online = True
        bridge_info = health
    except (BridgeUnavailable, BridgeError, Exception):
        online = False

    if online:
        try:
            metrics = await bridge.metrics()
        except Exception:
            metrics = {}

    supervisor_state = supervisor.state.value if supervisor else (ProcessState.RUNNING.value if online else ProcessState.STOPPED.value)
    supervisor_metrics = supervisor.get_metrics() if supervisor else {}

    return {
        "online": online,
        "state": supervisor_state,
        "bridge": bridge_info,
        "metrics": {
            "tps": metrics.get("tps", [20.0, 20.0, 20.0]),
            "mspt": metrics.get("mspt", 0.0),
            "players": metrics.get("players", {"online": 0, "max": 20}),
            "jvm": metrics.get("heap", {}),
            "cpu": supervisor_metrics.get("cpu", 0.0),
            "ram_mb": supervisor_metrics.get("ram_mb", 0),
        },
        "playit": {
            "address": settings.playit_address,
        }
    }


def get_metrics_history(
    db: Session,
    minutes: int = 10,
) -> list[dict]:
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=minutes)
    stmt = (
        select(models.MetricSample)
        .where(models.MetricSample.at >= cutoff)
        .order_by(models.MetricSample.at.asc())
    )
    samples = db.exec(stmt).all()
    return [
        {
            "at": s.at.isoformat(),
            "tps": s.tps,
            "mspt": s.mspt,
            "cpu": s.cpu,
            "ram_mb": s.ram_mb,
            "players": s.players,
        }
        for s in samples
    ]


async def handle_power_action(
    bridge: Bridge,
    supervisor: Optional[Supervisor],
    action: str,
) -> dict:
    if action == "start":
        if supervisor:
            return await supervisor.start()
        return {"ok": False, "message": "El modo supervisor no está habilitado"}

    elif action == "stop":
        try:
            res = await bridge.server_stop()
            return {"ok": True, "bridge": res}
        except Exception:
            if supervisor:
                return await supervisor.stop()
            return {"ok": False, "message": "No se pudo comunicar con el servidor"}

    elif action == "restart":
        try:
            res = await bridge.server_restart()
            return {"ok": True, "bridge": res}
        except Exception:
            if supervisor:
                return await supervisor.restart()
            return {"ok": False, "message": "No se pudo reiniciar"}

    elif action == "kill":
        if supervisor:
            return await supervisor.kill()
        return {"ok": False, "message": "El modo supervisor no está habilitado para terminar procesos directamente"}

    else:
        raise ValueError(f"Acción de energía inválida: {action}")


async def execute_server_command(
    bridge: Bridge,
    db: Session,
    user_id: int,
    username: str,
    ip: str,
    command: str,
    settings: Settings,
    is_admin: bool,
) -> dict:
    cmd_name = command.strip().split()[0].lower() if command.strip() else ""
    if cmd_name in settings.dangerous_commands and not is_admin:
        raise PermissionError(f"El comando '{cmd_name}' requiere permisos de administrador")

    res = await bridge.command(command)
    record_audit(
        db=db,
        user_id=user_id,
        username=username,
        ip=ip,
        action="server.command",
        payload={"command": command, "result": res},
    )
    return res
