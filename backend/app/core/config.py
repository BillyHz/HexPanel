"""Configuración del backend (variables de entorno HEXPANEL_*)."""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[2]
REPO_DIR = BACKEND_DIR.parent


def _bool(name: str, default: bool) -> bool:
    v = os.environ.get(name)
    if v is None:
        return default
    return v.strip().lower() in ("1", "true", "yes", "on")


def _int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except ValueError:
        return default


@dataclass
class Settings:
    data_dir: Path = BACKEND_DIR / "data"
    database_url: str = ""  # vacío => sqlite en data_dir/hexpanel.db
    bridge_url: str = "http://127.0.0.1:8765"
    bridge_token: str = ""
    fake_bridge: bool = False

    cookie_name: str = "hexpanel_session"
    cookie_secure: bool = True
    session_ttl_hours: int = 24 * 7
    auth_rate_limit: str = "5/minute"
    min_password_length: int = 8

    server_dir: Path = REPO_DIR.parent / "HexServer"
    world_name: str = "world"
    frontend_dist: Path = REPO_DIR / "frontend" / "dist"
    items_json: Path = REPO_DIR / "frontend" / "public" / "assets" / "items" / "items.json"
    serve_frontend: bool = True

    # Supervisor
    supervisor_enabled: bool = False
    java_cmd: str = "java"
    java_args: str = "-Xms1G -Xmx4G"
    server_jar: str = "server.jar"
    playit_exe: str = ""  # ruta a playit.exe (opcional)
    playit_address: str = ""
    auto_restart: bool = True
    stop_timeout: int = 60

    # Muestreo de métricas
    metrics_interval: float = 5.0
    metrics_retention_hours: int = 24
    run_background: bool = True  # sampler + bridge pump + supervisor monitor

    # Comandos que requieren rol admin (panel.admin)
    dangerous_commands: tuple[str, ...] = (
        "stop", "op", "deop", "ban-ip", "pardon-ip", "restart", "reload", "save-off",
    )

    admin_username: str = ""
    admin_password: str = ""

    @property
    def db_url(self) -> str:
        return self.database_url or f"sqlite:///{(self.data_dir / 'hexpanel.db').as_posix()}"

    @property
    def lockfile(self) -> Path:
        return self.server_dir / ".hexpanel.lock"

    @classmethod
    def from_env(cls) -> "Settings":
        e = os.environ.get
        s = cls()
        if e("HEXPANEL_DATA_DIR"):
            s.data_dir = Path(e("HEXPANEL_DATA_DIR"))  # type: ignore[arg-type]
        s.database_url = e("HEXPANEL_DATABASE_URL", "")
        s.bridge_url = e("HEXPANEL_BRIDGE_URL", s.bridge_url).rstrip("/")
        s.bridge_token = e("HEXPANEL_BRIDGE_TOKEN", "")
        s.fake_bridge = _bool("HEXPANEL_FAKE_BRIDGE", False)
        s.cookie_secure = _bool("HEXPANEL_COOKIE_SECURE", True)
        s.session_ttl_hours = _int("HEXPANEL_SESSION_TTL_HOURS", s.session_ttl_hours)
        s.auth_rate_limit = e("HEXPANEL_AUTH_RATE_LIMIT", s.auth_rate_limit)
        if e("HEXPANEL_SERVER_DIR"):
            s.server_dir = Path(e("HEXPANEL_SERVER_DIR"))  # type: ignore[arg-type]
        s.world_name = e("HEXPANEL_WORLD", s.world_name)
        if e("HEXPANEL_FRONTEND_DIST"):
            s.frontend_dist = Path(e("HEXPANEL_FRONTEND_DIST"))  # type: ignore[arg-type]
        s.serve_frontend = _bool("HEXPANEL_SERVE_FRONTEND", True)
        s.supervisor_enabled = _bool("HEXPANEL_SUPERVISOR", False)
        s.java_cmd = e("HEXPANEL_JAVA", s.java_cmd)
        s.java_args = e("HEXPANEL_JAVA_ARGS", s.java_args)
        s.server_jar = e("HEXPANEL_SERVER_JAR", s.server_jar)
        s.playit_exe = e("HEXPANEL_PLAYIT_EXE", "")
        s.playit_address = e("HEXPANEL_PLAYIT_ADDRESS", "")
        s.auto_restart = _bool("HEXPANEL_AUTO_RESTART", True)
        s.stop_timeout = _int("HEXPANEL_STOP_TIMEOUT", s.stop_timeout)
        s.admin_username = e("HEXPANEL_ADMIN_USERNAME", "")
        s.admin_password = e("HEXPANEL_ADMIN_PASSWORD", "")
        return s


_settings: Settings | None = None


def get_settings() -> Settings:
    global _settings
    if _settings is None:
        _settings = Settings.from_env()
    return _settings


def set_settings(s: Settings) -> None:
    global _settings
    _settings = s
