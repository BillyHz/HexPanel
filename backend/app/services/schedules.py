"""Servicio de tareas programadas (Cron / Automations)."""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Optional, Set
from sqlmodel import Session

from app.core.config import Settings
from app.db.models import ScheduleTask, utcnow
from app.services import backups as backup_service
from app.services import server as server_service

log = logging.getLogger("hexpanel.schedules")

CRON_ALIASES = {
    "@hourly": "0 * * * *",
    "@daily": "0 0 * * *",
    "@midnight": "0 0 * * *",
    "@weekly": "0 0 * * 0",
    "@monthly": "0 0 1 * *",
}


def _parse_field(expr: str, min_val: int, max_val: int) -> Set[int]:
    """Parsea un campo de cron (e.g. '*/15', '1,3,5', '1-5', '*') en un conjunto de enteros."""
    expr = expr.strip()
    if expr == "*":
        return set(range(min_val, max_val + 1))

    values: Set[int] = set()
    for part in expr.split(","):
        part = part.strip()
        if not part:
            continue
        if "/" in part:
            subparts = part.split("/", 1)
            step = int(subparts[1])
            if subparts[0] == "*":
                start, end = min_val, max_val
            elif "-" in subparts[0]:
                range_parts = subparts[0].split("-", 1)
                start, end = int(range_parts[0]), int(range_parts[1])
            else:
                start, end = int(subparts[0]), max_val
            values.update(range(start, end + 1, step))
        elif "-" in part:
            range_parts = part.split("-", 1)
            start, end = int(range_parts[0]), int(range_parts[1])
            values.update(range(start, end + 1))
        else:
            values.add(int(part))

    return {v for v in values if min_val <= v <= max_val}


def compute_next_run(cron_expr: str, base_time: Optional[datetime] = None) -> datetime:
    """Calcula la próxima ejecución a partir de una expresión cron de 5 campos."""
    expr = cron_expr.strip()
    if expr in CRON_ALIASES:
        expr = CRON_ALIASES[expr]

    parts = expr.split()
    if len(parts) != 5:
        raise ValueError(f"Expresión cron inválida: '{cron_expr}'. Debe contener 5 campos (minuto hora día mes día_semana)")

    valid_minutes = _parse_field(parts[0], 0, 59)
    valid_hours = _parse_field(parts[1], 0, 23)
    valid_dom = _parse_field(parts[2], 1, 31)
    valid_months = _parse_field(parts[3], 1, 12)
    # Python weekday(): Lunes=0, Domingo=6. Cron: Domingo=0 (o 7)
    valid_dow = _parse_field(parts[4], 0, 7)
    if 7 in valid_dow:
        valid_dow.add(0)

    now = (base_time or utcnow()).astimezone(timezone.utc)
    # Empezar en el siguiente minuto en punto
    cursor = now.replace(second=0, microsecond=0) + timedelta(minutes=1)

    # Buscar hasta 1 año adelante (525600 minutos)
    for _ in range(525600):
        # Convertir Python weekday (0=Mon..6=Sun) a cron (0=Sun, 1=Mon..6=Sat)
        cron_dow = (cursor.weekday() + 1) % 7
        if (
            cursor.month in valid_months
            and cursor.day in valid_dom
            and cron_dow in valid_dow
            and cursor.hour in valid_hours
            and cursor.minute in valid_minutes
        ):
            return cursor
        cursor += timedelta(minutes=1)

    raise ValueError(f"No se pudo encontrar una próxima ejecución dentro del próximo año para '{cron_expr}'")


async def execute_task(task: ScheduleTask, app_state: Any, settings: Settings, db: Session) -> dict:
    """Ejecuta la acción de una tarea programada y actualiza sus timestamps."""
    bridge = getattr(app_state, "bridge", None)
    supervisor = getattr(app_state, "supervisor", None)
    now = utcnow()
    result: dict[str, Any] = {}

    log.info("Ejecutando tarea programada: %s (acción: %s)", task.name, task.action_type)

    try:
        if task.action_type == "command":
            if bridge and task.payload:
                cmd = task.payload.strip()
                clean_cmd = cmd[1:] if cmd.startswith("/") else cmd
                res = await bridge.command(clean_cmd)
                result = {"ok": True, "bridge": res}
            else:
                result = {"ok": False, "message": "Bridge no disponible o comando vacío"}

        elif task.action_type == "backup":
            res = backup_service.create_backup(settings, f"auto_{task.name}")
            result = {"ok": True, "backup": res}

        elif task.action_type == "restart":
            res = await server_service.handle_power_action(bridge, supervisor, "restart")
            result = {"ok": True, "restart": res}

        else:
            result = {"ok": False, "message": f"Tipo de acción desconocido: {task.action_type}"}

    except Exception as e:
        log.exception("Error al ejecutar tarea programada %s: %s", task.name, e)
        result = {"ok": False, "error": str(e)}

    task.last_run = now
    try:
        task.next_run = compute_next_run(task.cron_expr, now)
    except Exception:
        task.next_run = None

    db.add(task)
    db.commit()
    db.refresh(task)

    return result
