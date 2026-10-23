"""API para gestión de tareas programadas (Schedules / Cron)."""
from __future__ import annotations

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlmodel import Session, select

from app.core.config import get_settings
from app.core.permissions import PANEL_ADMIN, SERVER_VIEW
from app.core.security import Ctx, get_db, require
from app.db.models import ScheduleTask, utcnow
from app.services.schedules import compute_next_run, execute_task

router = APIRouter(prefix="/schedules", tags=["schedules"])


class ScheduleCreateRequest(BaseModel):
    name: str
    cron_expr: str
    action_type: str  # 'command' | 'backup' | 'restart'
    payload: str = ""
    enabled: bool = True


class ScheduleUpdateRequest(BaseModel):
    name: Optional[str] = None
    cron_expr: Optional[str] = None
    action_type: Optional[str] = None
    payload: Optional[str] = None
    enabled: Optional[bool] = None


@router.get("")
def list_schedules(
    db: Session = Depends(get_db),
    ctx: Ctx = Depends(require(SERVER_VIEW)),
):
    tasks = db.exec(select(ScheduleTask).order_by(ScheduleTask.created_at.desc())).all()
    return tasks


@router.post("")
def create_schedule(
    req: ScheduleCreateRequest,
    db: Session = Depends(get_db),
    ctx: Ctx = Depends(require(PANEL_ADMIN)),
):
    valid_actions = ("command", "backup", "restart")
    if req.action_type not in valid_actions:
        raise HTTPException(400, f"action_type inválido. Debe ser uno de: {valid_actions}")

    try:
        next_run = compute_next_run(req.cron_expr, utcnow())
    except ValueError as e:
        raise HTTPException(400, str(e))

    task = ScheduleTask(
        name=req.name.strip(),
        cron_expr=req.cron_expr.strip(),
        action_type=req.action_type,
        payload=req.payload.strip(),
        enabled=req.enabled,
        next_run=next_run if req.enabled else None,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


@router.get("/{task_id}")
def get_schedule(
    task_id: int,
    db: Session = Depends(get_db),
    ctx: Ctx = Depends(require(SERVER_VIEW)),
):
    task = db.get(ScheduleTask, task_id)
    if not task:
        raise HTTPException(404, "Tarea programada no encontrada")
    return task


@router.put("/{task_id}")
def update_schedule(
    task_id: int,
    req: ScheduleUpdateRequest,
    db: Session = Depends(get_db),
    ctx: Ctx = Depends(require(PANEL_ADMIN)),
):
    task = db.get(ScheduleTask, task_id)
    if not task:
        raise HTTPException(404, "Tarea programada no encontrada")

    if req.action_type is not None:
        valid_actions = ("command", "backup", "restart")
        if req.action_type not in valid_actions:
            raise HTTPException(400, f"action_type inválido. Debe ser uno de: {valid_actions}")
        task.action_type = req.action_type

    if req.name is not None:
        task.name = req.name.strip()

    if req.payload is not None:
        task.payload = req.payload.strip()

    if req.cron_expr is not None:
        try:
            task.cron_expr = req.cron_expr.strip()
            if task.enabled:
                task.next_run = compute_next_run(task.cron_expr, utcnow())
        except ValueError as e:
            raise HTTPException(400, str(e))

    if req.enabled is not None:
        task.enabled = req.enabled
        if task.enabled and not task.next_run:
            try:
                task.next_run = compute_next_run(task.cron_expr, utcnow())
            except Exception:
                pass
        elif not task.enabled:
            task.next_run = None

    db.add(task)
    db.commit()
    db.refresh(task)
    return task


@router.delete("/{task_id}")
def delete_schedule(
    task_id: int,
    db: Session = Depends(get_db),
    ctx: Ctx = Depends(require(PANEL_ADMIN)),
):
    task = db.get(ScheduleTask, task_id)
    if not task:
        raise HTTPException(404, "Tarea programada no encontrada")

    db.delete(task)
    db.commit()
    return {"ok": True, "message": "Tarea programada eliminada"}


@router.post("/{task_id}/run")
async def run_schedule_now(
    task_id: int,
    request: Request,
    db: Session = Depends(get_db),
    ctx: Ctx = Depends(require(PANEL_ADMIN)),
):
    task = db.get(ScheduleTask, task_id)
    if not task:
        raise HTTPException(404, "Tarea programada no encontrada")

    settings = get_settings()
    res = await execute_task(task, request.app.state, settings, db)
    return {"ok": True, "task": task, "result": res}


@router.post("/{task_id}/toggle")
def toggle_schedule(
    task_id: int,
    db: Session = Depends(get_db),
    ctx: Ctx = Depends(require(PANEL_ADMIN)),
):
    task = db.get(ScheduleTask, task_id)
    if not task:
        raise HTTPException(404, "Tarea programada no encontrada")

    task.enabled = not task.enabled
    if task.enabled:
        try:
            task.next_run = compute_next_run(task.cron_expr, utcnow())
        except Exception:
            pass
    else:
        task.next_run = None

    db.add(task)
    db.commit()
    db.refresh(task)
    return {"ok": True, "enabled": task.enabled, "task": task}
