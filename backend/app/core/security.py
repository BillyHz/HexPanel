"""Seguridad: argon2, sesiones por cookie, CSRF, rate limit."""
from __future__ import annotations

import hashlib
import hmac
import secrets
from dataclasses import dataclass, field
from datetime import timedelta
from typing import Callable, Optional

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError
from fastapi import Depends, HTTPException, Request, Response
from slowapi import Limiter
from sqlmodel import Session, select

from app.core.config import Settings, get_settings
from app.core.permissions import has_permission
from app.db import models
from app.db.models import utcnow

_ph = PasswordHasher()
_DUMMY_HASH = _ph.hash("hexpanel-dummy-password")

SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


def client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


limiter = Limiter(key_func=client_ip, headers_enabled=False)


def auth_limit() -> str:
    return get_settings().auth_rate_limit


def hash_password(pw: str) -> str:
    return _ph.hash(pw)


def verify_password(pw: str, hashed: Optional[str]) -> bool:
    """Tiempo similar exista o no el usuario (hashed=None)."""
    try:
        return _ph.verify(hashed or _DUMMY_HASH, pw) and hashed is not None
    except (VerifyMismatchError, InvalidHashError):
        return False


def _sid(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def safe_eq(a: str, b: str) -> bool:
    return hmac.compare_digest(a.encode(), b.encode())


def create_session(db: Session, user: models.User, request: Request, settings: Settings) -> tuple[str, models.UserSession]:
    """Crea una sesión nueva (rotación: el token siempre es nuevo)."""
    token = secrets.token_urlsafe(32)
    sess = models.UserSession(
        id=_sid(token),
        user_id=user.id,  # type: ignore[arg-type]
        csrf=secrets.token_urlsafe(24),
        ip=client_ip(request),
        user_agent=request.headers.get("user-agent", "")[:200],
        expires_at=utcnow() + timedelta(hours=settings.session_ttl_hours),
    )
    db.add(sess)
    user.last_login = utcnow()
    db.add(user)
    db.commit()
    return token, sess


def set_session_cookie(response: Response, token: str, settings: Settings) -> None:
    response.set_cookie(
        settings.cookie_name, token, httponly=True, secure=settings.cookie_secure,
        samesite="lax", max_age=settings.session_ttl_hours * 3600, path="/",
    )


def clear_session_cookie(response: Response, settings: Settings) -> None:
    response.delete_cookie(settings.cookie_name, path="/")


def load_permissions(db: Session, role_id: int) -> set[str]:
    rows = db.exec(select(models.RolePermission.permission).where(models.RolePermission.role_id == role_id)).all()
    return set(rows)


@dataclass
class Ctx:
    user: models.User
    session: models.UserSession
    role: str
    permissions: set[str] = field(default_factory=set)
    ip: str = ""

    def can(self, perm: str) -> bool:
        return has_permission(self.permissions, perm)

    def is_self(self, uuid: Optional[str]) -> bool:
        return bool(uuid and self.user.mc_uuid and self.user.mc_uuid.lower() == uuid.lower())


def get_db(request: Request):
    with Session(request.app.state.engine) as db:
        yield db


def resolve_session(db: Session, token: Optional[str]) -> Optional[Ctx]:
    if not token:
        return None
    sess = db.get(models.UserSession, _sid(token))
    if not sess:
        return None
    if sess.expires_at < utcnow():
        db.delete(sess)
        db.commit()
        return None
    user = db.get(models.User, sess.user_id)
    if not user:
        return None
    role = db.get(models.Role, user.role_id)
    return Ctx(user=user, session=sess, role=role.name if role else "player",
               permissions=load_permissions(db, user.role_id))


def current_ctx(request: Request, db: Session = Depends(get_db)) -> Ctx:
    settings = get_settings()
    ctx = resolve_session(db, request.cookies.get(settings.cookie_name))
    if not ctx:
        raise HTTPException(401, "No autenticado")
    ctx.ip = client_ip(request)
    if request.method not in SAFE_METHODS:
        sent = request.headers.get("x-csrf-token", "")
        if not sent or not safe_eq(sent, ctx.session.csrf):
            raise HTTPException(403, "CSRF token inválido")
    return ctx


def require(*perms: str) -> Callable[..., Ctx]:
    """Dependencia: sesión + CSRF + todos los permisos indicados."""
    def dep(ctx: Ctx = Depends(current_ctx)) -> Ctx:
        for p in perms:
            if not ctx.can(p):
                raise HTTPException(403, f"Falta el permiso {p}")
        return ctx
    return dep
