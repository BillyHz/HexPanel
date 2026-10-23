"""Tests de integración para HexPanel Backend (PLAN §14)."""
from __future__ import annotations

import os
import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

# Configurar variables de entorno antes de importar la app
os.environ["HEXPANEL_FAKE_BRIDGE"] = "1"
os.environ["HEXPANEL_DATABASE_URL"] = "sqlite:///:memory:"
os.environ["HEXPANEL_COOKIE_SECURE"] = "0"
os.environ["HEXPANEL_RUN_BACKGROUND"] = "0"
os.environ["HEXPANEL_AUTH_RATE_LIMIT"] = "1000/minute"

from app.main import create_app
from app.db import models
from app.core.security import hash_password
from app.bridge.fake import STEVE, ALEX


@pytest.fixture
def client():
    app = create_app()
    with TestClient(app, base_url="http://testserver") as c:
        # Seed test admin & player users
        engine = app.state.engine
        with Session(engine) as db:
            admin_role = db.exec(select(models.Role).where(models.Role.name == "admin")).first()
            player_role = db.exec(select(models.Role).where(models.Role.name == "player")).first()

            admin = models.User(
                username="admin_test",
                password_hash=hash_password("admin_pass123"),
                role_id=admin_role.id,  # type: ignore[arg-type]
            )
            player_steve = models.User(
                username="steve_user",
                password_hash=hash_password("steve_pass123"),
                mc_uuid=STEVE,
                mc_name="Steve",
                role_id=player_role.id,  # type: ignore[arg-type]
            )
            player_alex = models.User(
                username="alex_user",
                password_hash=hash_password("alex_pass123"),
                mc_uuid=ALEX,
                mc_name="Alex",
                role_id=player_role.id,  # type: ignore[arg-type]
            )
            db.add_all([admin, player_steve, player_alex])
            db.commit()

        yield c


def login_user(client: TestClient, username: str, password: str) -> str:
    res = client.post("/api/auth/login", json={"username": username, "password": password})
    assert res.status_code == 200, res.text
    return res.json()["csrf"]


def test_auth_login_logout(client: TestClient):
    csrf = login_user(client, "admin_test", "admin_pass123")
    assert csrf

    me = client.get("/api/me")
    assert me.status_code == 200
    assert me.json()["username"] == "admin_test"
    assert "panel.admin" in me.json()["permissions"]

    out = client.post("/api/auth/logout", headers={"x-csrf-token": csrf})
    assert out.status_code == 200

    me_after = client.get("/api/me")
    assert me_after.status_code == 401


def test_auth_register_with_link_code(client: TestClient):
    # La FakeBridge tiene preconfigurado el código STEVE1 para Steve
    # Vamos a agregar un nuevo código en fake bridge
    app_bridge = client.app.state.bridge
    app_bridge.add_link_code("CODE99", "11111111-2222-3333-4444-555555555555", "NewPlayer")

    res = client.post(
        "/api/auth/register",
        json={"username": "new_player", "password": "password123", "code": "CODE99", "email": "test@test.com"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["ok"] is True
    assert data["user"]["username"] == "new_player"
    assert data["user"]["mc_uuid"] == "11111111-2222-3333-4444-555555555555"


def test_permissions_player_cannot_read_others_inventory(client: TestClient):
    # Log in as player Steve
    login_user(client, "steve_user", "steve_pass123")

    # Steve can read his own inventory
    res_self = client.get(f"/api/players/{STEVE}/containers")
    assert res_self.status_code == 200
    assert "inventory" in res_self.json()

    # Steve CANNOT read Alex's inventory
    res_other = client.get(f"/api/players/{ALEX}/containers")
    assert res_other.status_code == 403


def test_permissions_admin_can_read_and_edit_inventory(client: TestClient):
    csrf = login_user(client, "admin_test", "admin_pass123")

    # Admin reads Alex's inventory
    res = client.get(f"/api/players/{ALEX}/containers")
    assert res.status_code == 200

    # Admin moves item from slot 0 to slot 10 in inventory
    rev = res.json()["inventory"]["revision"]
    op_body = {
        "baseRevision": {"inventory": rev, "enderchest": 1},
        "ops": [
            {
                "op": "move",
                "from": {"c": "inventory", "slot": 0},
                "to": {"c": "inventory", "slot": 10},
            }
        ],
    }

    res_op = client.post(
        f"/api/players/{ALEX}/containers/ops",
        json=op_body,
        headers={"x-csrf-token": csrf},
    )
    assert res_op.status_code == 200


def test_ops_conflict_409(client: TestClient):
    csrf = login_user(client, "admin_test", "admin_pass123")

    # Op with invalid expectHash should trigger 409 Conflict
    op_body = {
        "baseRevision": {"inventory": 1, "enderchest": 1},
        "ops": [
            {
                "op": "move",
                "from": {"c": "inventory", "slot": 1},
                "to": {"c": "inventory", "slot": 20},
                "expectHash": "HASH_INCORRECTO",
            }
        ],
    }

    res_op = client.post(
        f"/api/players/{STEVE}/containers/ops",
        json=op_body,
        headers={"x-csrf-token": csrf},
    )
    assert res_op.status_code == 409


def test_server_status_and_command(client: TestClient):
    csrf = login_user(client, "admin_test", "admin_pass123")

    st = client.get("/api/server/status")
    assert st.status_code == 200
    assert st.json()["online"] is True

    cmd_res = client.post(
        "/api/server/command",
        json={"command": "say Hola HexPanel"},
        headers={"x-csrf-token": csrf},
    )
    assert cmd_res.status_code == 200


def test_audit_log_and_undo(client: TestClient):
    csrf = login_user(client, "admin_test", "admin_pass123")

    # Apply an operation that creates an audit entry
    res = client.get(f"/api/players/{STEVE}/containers")
    rev = res.json()["inventory"]["revision"]

    op_body = {
        "baseRevision": {"inventory": rev, "enderchest": 1},
        "ops": [
            {
                "op": "move",
                "from": {"c": "inventory", "slot": 3},
                "to": {"c": "inventory", "slot": 15},
            }
        ],
    }
    res_op = client.post(
        f"/api/players/{STEVE}/containers/ops",
        json=op_body,
        headers={"x-csrf-token": csrf},
    )
    assert res_op.status_code == 200

    # Check audit log
    logs_res = client.get("/api/admin/audit")
    assert logs_res.status_code == 200
    logs = logs_res.json()
    assert len(logs) > 0

    first_log = logs[0]
    assert first_log["action"] == "inventory.ops"
    assert first_log["undo_ref"] is not None

    # Undo
    undo_res = client.post(
        f"/api/admin/audit/{first_log['id']}/undo",
        headers={"x-csrf-token": csrf},
    )
    assert undo_res.status_code == 200
    assert undo_res.json()["ok"] is True
