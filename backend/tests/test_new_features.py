"""Integration tests for all 10 HexPanel community features."""
from __future__ import annotations

import io
import os
import struct
import zlib
from pathlib import Path

# Configure test environment before importing app
os.environ["HEXPANEL_FAKE_BRIDGE"] = "1"
os.environ["HEXPANEL_DATABASE_URL"] = "sqlite:///:memory:"
os.environ["HEXPANEL_COOKIE_SECURE"] = "0"
os.environ["HEXPANEL_RUN_BACKGROUND"] = "0"
os.environ["HEXPANEL_AUTH_RATE_LIMIT"] = "1000/minute"

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.main import create_app
from app.db import models
from app.core.config import get_settings
from app.core.security import hash_password
from app.bridge.fake import STEVE, ALEX


def make_test_png(width: int = 64, height: int = 64) -> bytes:
    """Genera un archivo PNG válido en memoria de dimensiones especificadas."""
    sig = b"\x89PNG\r\n\x1a\n"
    ihdr_data = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    ihdr = (
        struct.pack(">I", len(ihdr_data))
        + b"IHDR"
        + ihdr_data
        + struct.pack(">I", zlib.crc32(b"IHDR" + ihdr_data))
    )
    raw_scanlines = b"".join(b"\x00" + (b"\x7f\x7f\x7f" * width) for _ in range(height))
    compressed = zlib.compress(raw_scanlines)
    idat = (
        struct.pack(">I", len(compressed))
        + b"IDAT"
        + compressed
        + struct.pack(">I", zlib.crc32(b"IDAT" + compressed))
    )
    iend = struct.pack(">I", 0) + b"IEND" + struct.pack(">I", zlib.crc32(b"IEND"))
    return sig + ihdr + idat + iend


@pytest.fixture
def client(tmp_path: Path):
    # Usar tmp_path como server_dir y data_dir aislados para cada test
    settings = get_settings()
    settings.server_dir = tmp_path / "HexServer"
    settings.server_dir.mkdir(parents=True, exist_ok=True)
    settings.data_dir = tmp_path / "data"
    settings.data_dir.mkdir(parents=True, exist_ok=True)

    app = create_app()
    with TestClient(app, base_url="http://testserver") as c:
        engine = app.state.engine
        with Session(engine) as db:
            admin_role = db.exec(select(models.Role).where(models.Role.name == "admin")).first()
            player_role = db.exec(select(models.Role).where(models.Role.name == "player")).first()
            mod_role = db.exec(select(models.Role).where(models.Role.name == "moderator")).first()

            admin = models.User(
                username="admin_test",
                password_hash=hash_password("admin_pass123"),
                role_id=admin_role.id,  # type: ignore[arg-type]
            )
            player = models.User(
                username="player_test",
                password_hash=hash_password("player_pass123"),
                mc_uuid=STEVE,
                role_id=player_role.id,  # type: ignore[arg-type]
            )
            mod = models.User(
                username="mod_test",
                password_hash=hash_password("mod_pass123"),
                role_id=mod_role.id,  # type: ignore[arg-type]
            )
            db.add_all([admin, player, mod])
            db.commit()

        yield c


def login(client: TestClient, username: str = "admin_test", password: str = "admin_pass123") -> str:
    res = client.post("/api/auth/login", json={"username": username, "password": password})
    assert res.status_code == 200, res.text
    return res.json()["csrf"]


# =========================================================================
# 1. Macros & Quick Actions
# =========================================================================
def test_server_command_macros(client: TestClient):
    csrf = login(client, "admin_test", "admin_pass123")

    # Comando con / inicial (Macro)
    res = client.post(
        "/api/server/command",
        json={"command": "/time set day"},
        headers={"x-csrf-token": csrf},
    )
    assert res.status_code == 200
    assert res.json()["ok"] is True

    # Comando sin / inicial
    res2 = client.post(
        "/api/server/command",
        json={"command": "weather clear"},
        headers={"x-csrf-token": csrf},
    )
    assert res2.status_code == 200
    assert res2.json()["ok"] is True

    # Comando vacío
    res_empty = client.post(
        "/api/server/command",
        json={"command": "   "},
        headers={"x-csrf-token": csrf},
    )
    assert res_empty.status_code == 200
    assert res_empty.json()["ok"] is False


# =========================================================================
# 2. Server Chat
# =========================================================================
def test_server_chat(client: TestClient):
    csrf = login(client, "admin_test", "admin_pass123")

    # Enviar mensaje al chat
    res = client.post(
        "/api/server/chat",
        json={"message": "¡Bienvenidos al servidor!"},
        headers={"x-csrf-token": csrf},
    )
    assert res.status_code == 200
    assert res.json()["ok"] is True
    assert res.json()["message"] == "¡Bienvenidos al servidor!"

    # Mensaje vacío debe fallar
    res_bad = client.post(
        "/api/server/chat",
        json={"message": "   "},
        headers={"x-csrf-token": csrf},
    )
    assert res_bad.status_code == 400


def test_ws_chat_subscription(client: TestClient):
    login(client, "admin_test", "admin_pass123")
    with client.websocket_connect("/ws") as ws:
        # Suscribirse al tema 'chat'
        ws.send_json({"type": "subscribe", "topic": "chat"})
        sub_resp = ws.receive_json()
        assert sub_resp["type"] == "subscribed"
        assert sub_resp["topic"] == "chat"

        # Broadcast mediante el Hub
        import asyncio
        hub = client.app.state.hub
        chat_data = {
            "uuid": STEVE,
            "name": "Steve",
            "message": "Hola a todos desde Minecraft",
            "timestamp": 123456789,
        }
        asyncio.run(hub.broadcast("chat", chat_data))

        msg = ws.receive_json()
        assert msg["topic"] == "chat"
        assert msg["data"]["name"] == "Steve"
        assert msg["data"]["message"] == "Hola a todos desde Minecraft"


# =========================================================================
# 3. Visual server.properties & MOTD
# =========================================================================
def test_server_properties_and_icon(client: TestClient):
    csrf = login(client, "admin_test", "admin_pass123")
    settings = get_settings()

    # Escribir un server.properties de prueba
    props_file = settings.server_dir / "server.properties"
    props_file.write_text("motd=\\u00a76Super Server\nmax-players=20\ndifficulty=hard\n", encoding="utf-8")

    # GET properties
    res = client.get("/api/server/properties")
    assert res.status_code == 200
    data = res.json()
    assert data["properties"]["difficulty"] == "hard"
    assert "Super Server" in data["motd"]["clean"]
    assert data["has_icon"] is False

    # PUT properties
    put_res = client.put(
        "/api/server/properties",
        json={"properties": {"motd": "\u00a7aNew MOTD", "max-players": "50", "pvp": "true"}},
        headers={"x-csrf-token": csrf},
    )
    assert put_res.status_code == 200
    assert put_res.json()["ok"] is True

    # Verificar que se actualizó
    get_res2 = client.get("/api/server/properties")
    assert get_res2.json()["properties"]["max-players"] == "50"
    assert get_res2.json()["motd"]["clean"] == "New MOTD"

    # Subir icono inválido (no PNG)
    bad_upload = client.post(
        "/api/server/properties/icon",
        files={"file": ("icon.png", b"not-a-png-file", "image/png")},
        headers={"x-csrf-token": csrf},
    )
    assert bad_upload.status_code == 400

    # Subir icono inválido (32x32 en vez de 64x64)
    png_32 = make_test_png(32, 32)
    bad_size = client.post(
        "/api/server/properties/icon",
        files={"file": ("icon.png", png_32, "image/png")},
        headers={"x-csrf-token": csrf},
    )
    assert bad_size.status_code == 400

    # Subir icono válido 64x64
    png_64 = make_test_png(64, 64)
    good_upload = client.post(
        "/api/server/properties/icon",
        files={"file": ("icon.png", png_64, "image/png")},
        headers={"x-csrf-token": csrf},
    )
    assert good_upload.status_code == 200
    assert good_upload.json()["ok"] is True

    # Obtener icono
    get_icon = client.get("/api/server/properties/icon")
    assert get_icon.status_code == 200
    assert get_icon.headers["content-type"] == "image/png"


# =========================================================================
# 4. Web File Manager
# =========================================================================
def test_file_manager_crud_and_security(client: TestClient):
    csrf = login(client, "admin_test", "admin_pass123")

    # Path traversal attack DEBE dar 403
    traversal_res = client.get(
        "/api/files/list",
        params={"path": "../../"},
        headers={"x-csrf-token": csrf},
    )
    assert traversal_res.status_code == 403

    # Crear carpeta
    res_mkdir = client.post(
        "/api/files/create",
        json={"path": "configs", "is_dir": True},
        headers={"x-csrf-token": csrf},
    )
    assert res_mkdir.status_code == 200

    # Escribir archivo de texto
    res_write = client.post(
        "/api/files/write",
        json={"path": "configs/test.txt", "content": "Hello HexPanel World!"},
        headers={"x-csrf-token": csrf},
    )
    assert res_write.status_code == 200

    # Leer archivo
    res_read = client.get(
        "/api/files/read",
        params={"path": "configs/test.txt"},
        headers={"x-csrf-token": csrf},
    )
    assert res_read.status_code == 200
    assert res_read.json()["content"] == "Hello HexPanel World!"

    # Listar carpeta
    res_list = client.get(
        "/api/files/list",
        params={"path": "configs"},
        headers={"x-csrf-token": csrf},
    )
    assert res_list.status_code == 200
    items = res_list.json()["items"]
    assert any(i["name"] == "test.txt" for i in items)

    # Renombrar archivo
    res_rename = client.post(
        "/api/files/rename",
        json={"path": "configs/test.txt", "new_name": "renamed.txt"},
        headers={"x-csrf-token": csrf},
    )
    assert res_rename.status_code == 200

    # Comprimir carpeta configs
    res_comp = client.post(
        "/api/files/compress",
        json={"path": "configs", "output_name": "configs_backup.zip"},
        headers={"x-csrf-token": csrf},
    )
    assert res_comp.status_code == 200

    # Extraer zip
    res_ext = client.post(
        "/api/files/extract",
        json={"path": "configs_backup.zip", "target_dir": "extracted"},
        headers={"x-csrf-token": csrf},
    )
    assert res_ext.status_code == 200

    # Eliminar archivo
    res_del = client.delete(
        "/api/files",
        params={"path": "configs_backup.zip"},
        headers={"x-csrf-token": csrf},
    )
    assert res_del.status_code == 200


# =========================================================================
# 5. Backups System
# =========================================================================
def test_backups_system(client: TestClient):
    csrf = login(client, "admin_test", "admin_pass123")
    settings = get_settings()

    # Crear datos simulados de mundo
    world_dir = settings.server_dir / "world"
    world_dir.mkdir(parents=True, exist_ok=True)
    (world_dir / "level.dat").write_text("dummy world data", encoding="utf-8")
    (settings.server_dir / "server.properties").write_text("motd=Test", encoding="utf-8")

    # Crear backup
    create_res = client.post(
        "/api/backups",
        json={"name": "test_bk"},
        headers={"x-csrf-token": csrf},
    )
    assert create_res.status_code == 200
    bk_info = create_res.json()["backup"]
    filename = bk_info["filename"]

    # Listar backups
    list_res = client.get("/api/backups")
    assert list_res.status_code == 200
    assert any(b["filename"] == filename for b in list_res.json())

    # Descargar backup
    dl_res = client.get(f"/api/backups/{filename}/download")
    assert dl_res.status_code == 200
    assert len(dl_res.content) > 0

    # Restaurar backup
    restore_res = client.post(
        f"/api/backups/{filename}/restore",
        headers={"x-csrf-token": csrf},
    )
    assert restore_res.status_code == 200
    assert restore_res.json()["ok"] is True

    # Eliminar backup
    del_res = client.delete(
        f"/api/backups/{filename}",
        headers={"x-csrf-token": csrf},
    )
    assert del_res.status_code == 200
    assert del_res.json()["ok"] is True


# =========================================================================
# 6. Scheduled Tasks (Cron / Automations)
# =========================================================================
def test_schedules_crud_and_run(client: TestClient):
    csrf = login(client, "admin_test", "admin_pass123")

    # Crear tarea
    res = client.post(
        "/api/schedules",
        json={
            "name": "Auto Broadcast",
            "cron_expr": "*/30 * * * *",
            "action_type": "command",
            "payload": "say Recordatorio: Guarda tus items",
            "enabled": True,
        },
        headers={"x-csrf-token": csrf},
    )
    assert res.status_code == 200
    task_id = res.json()["id"]
    assert res.json()["next_run"] is not None

    # Listar
    list_res = client.get("/api/schedules")
    assert list_res.status_code == 200
    assert any(t["id"] == task_id for t in list_res.json())

    # Actualizar tarea
    put_res = client.put(
        f"/api/schedules/{task_id}",
        json={"name": "Auto Broadcast Actualizado", "payload": "say Mensaje nuevo"},
        headers={"x-csrf-token": csrf},
    )
    assert put_res.status_code == 200
    assert put_res.json()["name"] == "Auto Broadcast Actualizado"

    # Ejecutar inmediatamente
    run_res = client.post(
        f"/api/schedules/{task_id}/run",
        headers={"x-csrf-token": csrf},
    )
    assert run_res.status_code == 200
    assert run_res.json()["ok"] is True

    # Alternar habilitado/deshabilitado
    toggle_res = client.post(
        f"/api/schedules/{task_id}/toggle",
        headers={"x-csrf-token": csrf},
    )
    assert toggle_res.status_code == 200
    assert toggle_res.json()["enabled"] is False

    # Eliminar tarea
    del_res = client.delete(
        f"/api/schedules/{task_id}",
        headers={"x-csrf-token": csrf},
    )
    assert del_res.status_code == 200


# =========================================================================
# 7. Discord Webhooks
# =========================================================================
def test_discord_settings(client: TestClient):
    csrf = login(client, "admin_test", "admin_pass123")

    # Obtener configuración inicial
    get_res = client.get("/api/discord/settings")
    assert get_res.status_code == 200
    assert get_res.json()["enabled"] is False

    # Actualizar configuración
    put_res = client.put(
        "/api/discord/settings",
        json={
            "webhook_url": "https://discord.com/api/webhooks/dummy/test",
            "enabled": True,
            "notify_on_start": True,
            "notify_on_stop": True,
            "notify_on_low_tps": True,
        },
        headers={"x-csrf-token": csrf},
    )
    assert put_res.status_code == 200
    assert put_res.json()["enabled"] is True
    assert put_res.json()["webhook_url"] == "https://discord.com/api/webhooks/dummy/test"


# =========================================================================
# 8. Plugins Marketplace & Local Management
# =========================================================================
def test_plugins_management(client: TestClient):
    csrf = login(client, "admin_test", "admin_pass123")
    settings = get_settings()

    plugins_dir = settings.server_dir / "plugins"
    plugins_dir.mkdir(parents=True, exist_ok=True)
    test_jar = plugins_dir / "EssentialsX.jar"
    test_jar.write_bytes(b"dummy jar content")

    # Listar plugins instalados
    list_res = client.get("/api/plugins/installed")
    assert list_res.status_code == 200
    installed = list_res.json()
    assert any(p["filename"] == "EssentialsX.jar" and p["enabled"] is True for p in installed)

    # Desactivar plugin (toggle a .jar.disabled)
    toggle_res = client.post(
        "/api/plugins/toggle",
        json={"filename": "EssentialsX.jar"},
        headers={"x-csrf-token": csrf},
    )
    assert toggle_res.status_code == 200
    assert toggle_res.json()["enabled"] is False
    assert toggle_res.json()["new_filename"] == "EssentialsX.jar.disabled"

    # Reactivar plugin
    toggle_back = client.post(
        "/api/plugins/toggle",
        json={"filename": "EssentialsX.jar.disabled"},
        headers={"x-csrf-token": csrf},
    )
    assert toggle_back.status_code == 200
    assert toggle_back.json()["enabled"] is True
    assert toggle_back.json()["new_filename"] == "EssentialsX.jar"

    # Eliminar plugin
    del_res = client.delete(
        "/api/plugins/EssentialsX.jar",
        headers={"x-csrf-token": csrf},
    )
    assert del_res.status_code == 200
    assert not test_jar.exists()


# =========================================================================
# 9. Crash Analyzer
# =========================================================================
def test_crash_analyzer(client: TestClient):
    csrf = login(client, "admin_test", "admin_pass123")
    settings = get_settings()

    # Crear reporte de caída simulado
    crash_dir = settings.server_dir / "crash-reports"
    crash_dir.mkdir(parents=True, exist_ok=True)
    crash_file = crash_dir / "crash-2026-10-23_12.00.00-server.txt"
    crash_file.write_text(
        "---- Minecraft Crash Report ----\n"
        "// Don't do that.\n"
        "Time: 2026-10-23 12:00:00 UTC\n"
        "Description: Exception in server tick loop\n"
        "java.lang.OutOfMemoryError: Java heap space\n"
        "\tat net.minecraft.world.level.chunk.Chunk.populate(Chunk.java:120)\n",
        encoding="utf-8",
    )

    # Listar caídas
    crashes_res = client.get("/api/server/crashes")
    assert crashes_res.status_code == 200
    crashes = crashes_res.json()
    assert len(crashes) > 0
    first_crash = crashes[0]
    assert "OutOfMemoryError" in first_crash["diagnosed_cause"]
    assert "Aumentar la memoria" in first_crash["recommendation"]

    # Detalle de la caída
    detail_res = client.get(f"/api/server/crashes/{crash_file.name}")
    assert detail_res.status_code == 200
    assert "OutOfMemoryError" in detail_res.json()["content"]


# =========================================================================
# 10. Web Map Configuration
# =========================================================================
def test_web_map_config(client: TestClient):
    csrf = login(client, "admin_test", "admin_pass123")

    # Obtener configuración del mapa
    get_res = client.get("/api/server/map")
    assert get_res.status_code == 200
    data = get_res.json()
    assert "url" in data
    assert data["enabled"] is True

    # Actualizar configuración del mapa
    put_res = client.put(
        "/api/server/map",
        json={
            "enabled": True,
            "url": "http://100.72.184.60:8123",
            "title": "Dynmap Hardcore Server",
        },
        headers={"x-csrf-token": csrf},
    )
    assert put_res.status_code == 200
    assert put_res.json()["url"] == "http://100.72.184.60:8123"
    assert put_res.json()["title"] == "Dynmap Hardcore Server"

    # Probar endpoint de estado
    st_res = client.get("/api/server/map/status")
    assert st_res.status_code == 200
    assert "installed" in st_res.json()
    assert "online" in st_res.json()

    # Probar acción de mapa
    act_res = client.post(
        "/api/server/map/action",
        json={"action": "reload"},
        headers={"x-csrf-token": csrf},
    )
    assert act_res.status_code == 200
    assert act_res.json()["status"] == "ok"
