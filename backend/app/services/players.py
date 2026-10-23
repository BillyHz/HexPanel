"""Servicio de jugadores y moderación (PLAN §8, §11)."""
from __future__ import annotations

import hashlib
from typing import Any, Optional
from sqlmodel import Session, select
from app.core.config import Settings
from app.bridge.client import Bridge, BridgeError, BridgeUnavailable
from app.services.stats import calculate_mined_blocks
from app.db import models


def offline_uuid(player_name: str) -> str:
    """Calcula el UUID offline (v3 MD5) al igual que Paper/CraftBukkit."""
    h = hashlib.md5(f"OfflinePlayer:{player_name}".encode("utf-8")).digest()
    byte_arr = bytearray(h)
    byte_arr[6] = (byte_arr[6] & 0x0F) | 0x30  # versión 3
    byte_arr[8] = (byte_arr[8] & 0x3F) | 0x80  # RFC 4122 variant
    raw = bytes(byte_arr).hex()
    return f"{raw[0:8]}-{raw[8:12]}-{raw[12:16]}-{raw[16:20]}-{raw[20:32]}"


async def resolve_player_uuid(bridge: Bridge, name_or_uuid: str) -> tuple[str, str]:
    """Devuelve (uuid, name). Si ya es UUID, busca el nombre o lo deja igual."""
    if len(name_or_uuid) == 36 and name_or_uuid.count("-") == 4:
        # UUID
        try:
            players = await bridge.players(query=name_or_uuid)
            for p in players:
                if p.get("uuid", "").lower() == name_or_uuid.lower():
                    return p["uuid"], p.get("name", name_or_uuid)
        except (BridgeUnavailable, BridgeError):
            pass
        return name_or_uuid, name_or_uuid

    # Es nombre
    try:
        players = await bridge.players(query=name_or_uuid)
        for p in players:
            if p.get("name", "").lower() == name_or_uuid.lower():
                return p["uuid"], p["name"]
    except (BridgeUnavailable, BridgeError):
        pass

    # Fallback offline UUID
    return offline_uuid(name_or_uuid), name_or_uuid


async def get_player_overview(
    bridge: Bridge,
    settings: Settings,
    name_or_uuid: str,
    db: Optional[Session] = None,
) -> dict:
    uuid, name = await resolve_player_uuid(bridge, name_or_uuid)
    
    # Intenta obtener datos en vivo del Bridge
    online = False
    last_seen = None
    last_ip = None
    stats: dict[str, Any] = {}

    try:
        players = await bridge.players(query=name)
        for p in players:
            if p.get("uuid", "").lower() == uuid.lower():
                online = p.get("online", False)
                last_seen = p.get("lastSeen")
                last_ip = p.get("lastIp")
                break
    except Exception:
        pass

    try:
        stats = await bridge.player_stats(uuid)
    except Exception:
        pass

    # Si minedBlocks no viene del Bridge, lo calculamos de world/stats
    blocks_mined = stats.get("blocksMined")
    if blocks_mined is None:
        blocks_mined = calculate_mined_blocks(settings, uuid)

    # Buscar usuario registrado en base de datos si existe
    email = None
    points = None
    if db:
        user = db.exec(select(models.User).where(models.User.mc_uuid == uuid)).first()
        if user:
            email = user.email

    money = stats.get("money")
    custom = stats.get("custom", {})
    if "jobs_points" in custom:
        points = custom["jobs_points"]

    play_time_ticks = stats.get("playTimeTicks", 0)
    hours_played = round(play_time_ticks / 72000.0, 1)

    return {
        "uuid": uuid,
        "name": name,
        "online": online,
        "lastSeen": last_seen,
        "lastIp": last_ip,
        "stats": {
            "money": money,
            "mobKills": stats.get("mobKills", 0),
            "blocksMined": blocks_mined,
            "playTimeHours": hours_played,
            "deaths": stats.get("deaths", 0),
            "jobsPoints": points,
            "custom": custom,
        },
        "account": {
            "email": email or "Pendiente",
            "linked": db is not None and user is not None,
        }
    }


async def execute_player_action(
    bridge: Bridge,
    player_name: str,
    action: str,
    args: Optional[dict] = None,
) -> dict:
    args = args or {}
    cmd = ""
    if action == "kick":
        reason = args.get("reason", "Expulsado por un administrador")
        cmd = f"kick {player_name} {reason}"
    elif action == "ban":
        reason = args.get("reason", "Baneado por un administrador")
        cmd = f"ban {player_name} {reason}"
    elif action == "pardon" or action == "unban":
        cmd = f"pardon {player_name}"
    elif action == "op":
        cmd = f"op {player_name}"
    elif action == "deop":
        cmd = f"deop {player_name}"
    elif action == "whitelist_add":
        cmd = f"whitelist add {player_name}"
    elif action == "whitelist_remove":
        cmd = f"whitelist remove {player_name}"
    elif action == "teleport":
        target = args.get("target")
        if target:
            cmd = f"tp {player_name} {target}"
        else:
            raise ValueError("Destino de teletransporte requerido")
    else:
        raise ValueError(f"Acción desconocida: {action}")

    return await bridge.command(cmd)
