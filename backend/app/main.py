"""HexPanel Backend - FastAPI application (PLAN §3, §4, §11)."""
from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

from fastapi import Depends, FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from sqlmodel import Session, select

from app.api.admin import router as admin_router
from app.api.auth import router as auth_router
from app.api.inventory import router as inventory_router
from app.api.items import router as items_router
from app.api.me import router as me_router
from app.api.players import router as players_router
from app.api.server import router as server_router
from app.bridge.client import Bridge, HttpBridge
from app.bridge.fake import FakeBridge
from app.core.config import Settings, get_settings
from app.core.security import limiter, resolve_session, hash_password
from app.db import models
from app.db.models import MetricSample, utcnow
from app.db.session import init_db, make_engine
from app.services.supervisor import Supervisor
from app.ws.hub import WsHub


async def _metrics_sampler(app: FastAPI, settings: Settings) -> None:
    while True:
        try:
            await asyncio.sleep(settings.metrics_interval)
            bridge: Bridge = app.state.bridge
            supervisor: Optional[Supervisor] = getattr(app.state, "supervisor", None)
            engine = app.state.engine

            tps = None
            mspt = None
            players = 0
            try:
                m = await bridge.metrics()
                tps_list = m.get("tps")
                if tps_list and len(tps_list) > 0:
                    tps = float(tps_list[0])
                mspt = float(m.get("mspt", 0.0))
                players_data = m.get("players", {})
                players = int(players_data.get("online", 0)) if isinstance(players_data, dict) else 0
            except Exception:
                pass

            cpu = 0.0
            ram_mb = 0
            if supervisor:
                sm = supervisor.get_metrics()
                cpu = sm.get("cpu", 0.0)
                ram_mb = sm.get("ram_mb", 0)
            elif "m" in locals() and isinstance(m, dict):
                heap = m.get("heap", {})
                ram_mb = int(heap.get("usedMb", 0))

            sample = MetricSample(
                at=utcnow(),
                tps=tps,
                mspt=mspt,
                cpu=cpu,
                ram_mb=ram_mb,
                players=players,
            )

            with Session(engine) as db:
                db.add(sample)
                # Purga muestras viejas
                cutoff = utcnow() - timedelta(hours=settings.metrics_retention_hours)
                old_samples = db.exec(select(MetricSample).where(MetricSample.at < cutoff)).all()
                for old in old_samples:
                    db.delete(old)
                db.commit()

        except asyncio.CancelledError:
            break
        except Exception:
            pass


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    engine = make_engine(settings)
    init_db(engine)
    app.state.engine = engine
    app.state.settings = settings

    # Auto crear admin si está en env
    if settings.admin_username and settings.admin_password:
        with Session(engine) as db:
            adm = db.exec(select(models.User).where(models.User.username == settings.admin_username)).first()
            if not adm:
                admin_role = db.exec(select(models.Role).where(models.Role.name == "admin")).first()
                if admin_role:
                    u = models.User(
                        username=settings.admin_username,
                        password_hash=hash_password(settings.admin_password),
                        role_id=admin_role.id,  # type: ignore[arg-type]
                    )
                    db.add(u)
                    db.commit()

    if settings.fake_bridge:
        bridge = FakeBridge(run_ticker=True)
    else:
        bridge = HttpBridge(settings.bridge_url, settings.bridge_token)
    app.state.bridge = bridge

    supervisor = Supervisor(settings) if settings.supervisor_enabled else None
    app.state.supervisor = supervisor

    hub = WsHub(bridge)
    hub.start()
    app.state.hub = hub

    sampler_task = None
    if settings.run_background:
        sampler_task = asyncio.create_task(_metrics_sampler(app, settings))

    yield

    if sampler_task:
        sampler_task.cancel()
    await hub.stop()
    await bridge.close()


def create_app() -> FastAPI:
    app = FastAPI(title="HexPanel API", version="1.0.0", lifespan=lifespan)
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    api_prefix = "/api"
    app.include_router(auth_router, prefix=api_prefix)
    app.include_router(me_router, prefix=api_prefix)
    app.include_router(players_router, prefix=api_prefix)
    app.include_router(inventory_router, prefix=api_prefix)
    app.include_router(server_router, prefix=api_prefix)
    app.include_router(items_router, prefix=api_prefix)
    app.include_router(admin_router, prefix=api_prefix)

    @app.websocket("/ws")
    async def websocket_endpoint(websocket: WebSocket, token: Optional[str] = None):
        await websocket.accept()
        settings: Settings = app.state.settings
        cookie_token = websocket.cookies.get(settings.cookie_name)
        session_token = token or cookie_token

        with Session(app.state.engine) as db:
            ctx = resolve_session(db, session_token)
            if not ctx:
                await websocket.send_json({"type": "error", "message": "No autenticado"})
                await websocket.close(code=1008)
                return

        hub: WsHub = app.state.hub
        conn = await hub.register(websocket, ctx)

        try:
            while True:
                msg = await websocket.receive_json()
                mtype = msg.get("type")
                topic = msg.get("topic")
                if mtype == "subscribe" and topic:
                    await hub.subscribe(conn, topic)
                elif mtype == "unsubscribe" and topic:
                    await hub.unsubscribe(conn, topic)
        except WebSocketDisconnect:
            await hub.unregister(conn)
        except Exception:
            await hub.unregister(conn)

    # Servir Frontend SPA (si dist existe)
    settings = get_settings()
    dist_dir = settings.frontend_dist
    if settings.serve_frontend and dist_dir.is_dir():
        app.mount("/assets", StaticFiles(directory=str(dist_dir / "assets")), name="assets")

        @app.get("/{full_path:path}")
        async def serve_spa(full_path: str):
            if full_path.startswith("api/") or full_path == "ws":
                raise HTTPException(404)
            file_candidate = dist_dir / full_path
            if file_candidate.is_file():
                return FileResponse(file_candidate)
            return FileResponse(dist_dir / "index.html")

    return app


app = create_app()
