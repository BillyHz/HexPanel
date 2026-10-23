"""Servicio de jugadores y moderación (PLAN §8, §11)."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any, Optional
from sqlmodel import Session, select
from app.core.config import Settings
from app.bridge.client import Bridge, BridgeError, BridgeUnavailable
from app.services.stats import calculate_mined_blocks
from app.db import models


def _load_json_set(path: Path) -> tuple[set[str], set[str]]:
    uuids = set()
    names = set()
    if not path.is_file():
        return uuids, names
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            data = json.load(f)
            if isinstance(data, list):
                for item in data:
                    if isinstance(item, dict):
                        u = item.get("uuid")
                        n = item.get("name")
                        if u:
                            uuids.add(u.lower())
                        if n:
                            names.add(n.lower())
    except Exception:
        pass
    return uuids, names


async def get_players_list(
    bridge: Bridge,
    settings: Settings,
    query: str = "",
    online: Optional[bool] = None,
) -> list[dict]:
    ops_uuids, ops_names = _load_json_set(settings.server_dir / "ops.json")
    banned_uuids, banned_names = _load_json_set(settings.server_dir / "banned-players.json")
    white_uuids, white_names = _load_json_set(settings.server_dir / "whitelist.json")

    online_players_map: dict[str, dict] = {}
    try:
        bp = await bridge.players(online=True)
        if isinstance(bp, list):
            for p in bp:
                u = p.get("uuid", "").lower()
                if u:
                    online_players_map[u] = p
    except Exception:
        pass

    known: dict[str, dict] = {}

    # 1. From usercache.json
    usercache_file = settings.server_dir / "usercache.json"
    if usercache_file.is_file():
        try:
            with open(usercache_file, "r", encoding="utf-8", errors="replace") as f:
                entries = json.load(f)
                if isinstance(entries, list):
                    for e in entries:
                        if isinstance(e, dict):
                            u = e.get("uuid", "").lower()
                            name = e.get("name")
                            if u and name:
                                known[u] = {
                                    "uuid": e.get("uuid"),
                                    "name": name,
                                    "online": False,
                                    "lastSeen": None,
                                }
        except Exception:
            pass

    # 2. From playerdata
    playerdata_dir = settings.server_dir / settings.world_name / "playerdata"
    if not playerdata_dir.is_dir():
        playerdata_dir = settings.server_dir / "world" / "playerdata"
    if playerdata_dir.is_dir():
        try:
            for f in playerdata_dir.glob("*.dat"):
                if f.name.endswith(".dat_old"):
                    continue
                u = f.stem.lower()
                mtime_ms = int(f.stat().st_mtime * 1000)
                if u in known:
                    if not known[u].get("lastSeen") or mtime_ms > known[u]["lastSeen"]:
                        known[u]["lastSeen"] = mtime_ms
                else:
                    known[u] = {
                        "uuid": f.stem,
                        "name": f.stem,
                        "online": False,
                        "lastSeen": mtime_ms,
                    }
        except Exception:
            pass

    # 3. Merge live online players from bridge
    for u, p in online_players_map.items():
        if u in known:
            known[u]["online"] = True
            if p.get("name"):
                known[u]["name"] = p["name"]
            if "lastIp" in p:
                known[u]["lastIp"] = p["lastIp"]
            known[u]["lastSeen"] = p.get("lastSeen") or known[u].get("lastSeen")
        else:
            known[u] = {
                "uuid": p.get("uuid"),
                "name": p.get("name"),
                "online": True,
                "lastSeen": p.get("lastSeen"),
                "lastIp": p.get("lastIp"),
            }

    # 4. Fallback if known is empty (test/dev fake bridge)
    if not known:
        try:
            all_bp = await bridge.players(query=query, online=online)
            if isinstance(all_bp, list):
                for p in all_bp:
                    u = p.get("uuid", "").lower()
                    if u:
                        known[u] = p
        except Exception:
            pass

    result = []
    q_lower = query.strip().lower()

    for u, p in known.items():
        name_lower = p.get("name", "").lower()
        if q_lower and (q_lower not in name_lower and q_lower not in u):
            continue

        is_online = bool(p.get("online", False))
        if online is True and not is_online:
            continue
        if online is False and is_online:
            continue

        p["op"] = bool(p.get("op") or (u in ops_uuids or name_lower in ops_names))
        p["banned"] = bool(p.get("banned") or (u in banned_uuids or name_lower in banned_names))
        p["whitelisted"] = bool(p.get("whitelisted") or (u in white_uuids or name_lower in white_names))
        result.append(p)

    result.sort(key=lambda x: (not x.get("online", False), -(x.get("lastSeen") or 0)))
    return result


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
