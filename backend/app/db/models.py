"""Modelo de datos (PLAN §10)."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Role(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(unique=True, index=True)


class RolePermission(SQLModel, table=True):
    role_id: int = Field(foreign_key="role.id", primary_key=True)
    permission: str = Field(primary_key=True)


class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    username: str = Field(unique=True, index=True)
    password_hash: str
    email: Optional[str] = None
    mc_uuid: Optional[str] = Field(default=None, index=True)
    mc_name: Optional[str] = None
    role_id: int = Field(foreign_key="role.id")
    created_at: datetime = Field(default_factory=utcnow)
    last_login: Optional[datetime] = None


class UserSession(SQLModel, table=True):
    id: str = Field(primary_key=True)  # sha256 del token de la cookie
    user_id: int = Field(foreign_key="user.id", index=True)
    csrf: str
    ip: str = ""
    user_agent: str = ""
    created_at: datetime = Field(default_factory=utcnow)
    expires_at: datetime


class AuditLog(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: Optional[int] = Field(default=None, foreign_key="user.id", index=True)
    username: str = ""
    ip: str = ""
    action: str = Field(index=True)
    target_uuid: Optional[str] = Field(default=None, index=True)
    target_name: Optional[str] = None
    payload: Any = Field(default_factory=dict, sa_column=Column(JSON))
    undo_ref: Optional[str] = None
    undone: bool = False
    at: datetime = Field(default_factory=utcnow, index=True)


class MetricSample(SQLModel, table=True):
    at: datetime = Field(primary_key=True)
    tps: Optional[float] = None
    mspt: Optional[float] = None
    cpu: Optional[float] = None
    ram_mb: Optional[int] = None
    players: int = 0
