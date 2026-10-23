from __future__ import annotations

from sqlalchemy import event
from sqlmodel import Session, SQLModel, create_engine, select

from app.core.config import Settings
from app.core.permissions import DEFAULT_ROLES
from app.db import models


def make_engine(settings: Settings):
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    url = settings.db_url
    kwargs = {}
    if url.startswith("sqlite"):
        kwargs["connect_args"] = {"check_same_thread": False}
        if ":memory:" in url:
            from sqlalchemy.pool import StaticPool
            kwargs["poolclass"] = StaticPool
    engine = create_engine(url, **kwargs)
    if url.startswith("sqlite"):
        @event.listens_for(engine, "connect")
        def _pragma(dbapi_conn, _):  # pragma: no cover
            cur = dbapi_conn.cursor()
            cur.execute("PRAGMA journal_mode=WAL")
            cur.execute("PRAGMA foreign_keys=ON")
            cur.close()
    return engine


def init_db(engine) -> None:
    SQLModel.metadata.create_all(engine)
    seed_roles(engine)


def seed_roles(engine) -> None:
    """Crea los roles por defecto (solo si no existen; luego son editables)."""
    with Session(engine) as db:
        for name, perms in DEFAULT_ROLES.items():
            role = db.exec(select(models.Role).where(models.Role.name == name)).first()
            if role:
                continue
            role = models.Role(name=name)
            db.add(role)
            db.commit()
            db.refresh(role)
            for p in perms:
                db.add(models.RolePermission(role_id=role.id, permission=p))
            db.commit()
