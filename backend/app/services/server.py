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

    heap = metrics.get("heap", {})
    ram_mb = supervisor_metrics.get("ram_mb") or heap.get("usedMb", 0)

    return {
        "online": online,
        "state": supervisor_state,
        "bridge": bridge_info,
        "metrics": {
            "tps": metrics.get("tps", [20.0, 20.0, 20.0]),
            "mspt": metrics.get("mspt", 0.0),
            "players": metrics.get("players", {"online": 0, "max": 20}),
            "jvm": heap,
            "cpu": supervisor_metrics.get("cpu", 0.0),
            "ram_mb": ram_mb,
            "max_ram_mb": heap.get("maxMb", 4096),
            "worlds": metrics.get("worlds", []),
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
    db: Optional[Session] = None,
) -> dict:
    result = {}
    if action == "start":
        if supervisor:
            result = await supervisor.start()
        else:
            return {"ok": False, "message": "El modo supervisor no está habilitado"}

    elif action == "stop":
        try:
            res = await bridge.server_stop()
            result = {"ok": True, "bridge": res}
        except Exception:
            if supervisor:
                result = await supervisor.stop()
            else:
                return {"ok": False, "message": "No se pudo comunicar con el servidor"}

    elif action == "restart":
        try:
            res = await bridge.server_restart()
            result = {"ok": True, "bridge": res}
        except Exception:
            if supervisor:
                result = await supervisor.restart()
            else:
                return {"ok": False, "message": "No se pudo reiniciar"}

    elif action == "kill":
        if supervisor:
            return await supervisor.kill()
        return {"ok": False, "message": "El modo supervisor no está habilitado para terminar procesos directamente"}

    else:
        raise ValueError(f"Acción de energía inválida: {action}")

    if db:
        try:
            import asyncio
            from app.services.discord import get_discord_settings, send_discord_alert, COLOR_GREEN, COLOR_RED, COLOR_BLUE
            d_st = get_discord_settings(db)
            if d_st and d_st.enabled and d_st.webhook_url:
                if action == "start" and d_st.notify_on_start:
                    asyncio.create_task(send_discord_alert(d_st.webhook_url, "🟢 Servidor Iniciado", "El servidor de Minecraft ha sido iniciado desde HexPanel.", COLOR_GREEN))
                elif action == "stop" and d_st.notify_on_stop:
                    asyncio.create_task(send_discord_alert(d_st.webhook_url, "🛑 Servidor Detenido", "El servidor de Minecraft ha sido detenido desde HexPanel.", COLOR_RED))
                elif action == "restart" and (d_st.notify_on_start or d_st.notify_on_stop):
                    asyncio.create_task(send_discord_alert(d_st.webhook_url, "🔄 Servidor Reiniciándose", "Se ha enviado una orden de reinicio al servidor de Minecraft.", COLOR_BLUE))
        except Exception:
            pass

    return result


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
    raw = command.strip()
    if not raw:
        return {"ok": False, "message": "Comando vacío"}

    clean_command = raw[1:] if raw.startswith("/") else raw
    cmd_name = clean_command.split()[0].lower() if clean_command else ""

    if cmd_name in settings.dangerous_commands and not is_admin:
        raise PermissionError(f"El comando '{cmd_name}' requiere permisos de administrador")

    res = await bridge.command(clean_command)
    record_audit(
        db=db,
        user_id=user_id,
        username=username,
        ip=ip,
        action="server.command",
        payload={"command": clean_command, "result": res},
    )
    return res
