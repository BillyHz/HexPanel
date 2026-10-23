"""API for server.properties, MOTD, and server icon visual management."""
from __future__ import annotations

import re
import struct
from pathlib import Path
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.core.config import get_settings
from app.core.permissions import PANEL_ADMIN, SERVER_VIEW
from app.core.security import Ctx, require

router = APIRouter(prefix="/server/properties", tags=["server-properties"])

_VALID_KEY_REGEX = re.compile(r"^[a-zA-Z0-9_\-\.]+$")


def _clean_motd(raw: str) -> str:
    """Strips Minecraft formatting codes (§a, &a, etc.)."""
    cleaned = re.sub(r"[\u00a7&][0-9a-fk-orA-FK-OR]", "", raw)
    cleaned = cleaned.replace("\u00a7", "").replace("\ufffd", "")
    return cleaned


def _parse_properties_file(path: Path) -> dict[str, str]:
    if not path.is_file():
        return {}
    props: dict[str, str] = {}
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            for line in f:
                stripped = line.strip()
                if not stripped or stripped.startswith("#") or stripped.startswith("!"):
                    continue
                if "=" in stripped:
                    k, v = stripped.split("=", 1)
                    # Unescape unicode escapes like \u00a7 without corrupting UTF-8
                    val = re.sub(
                        r"\\u([0-9a-fA-F]{4})",
                        lambda m: chr(int(m.group(1), 16)),
                        v.strip(),
                    )
                    props[k.strip()] = val
    except Exception:
        pass
    return props


def _write_properties_file(path: Path, new_props: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    existing_lines: list[str] = []
    if path.is_file():
        try:
            with open(path, "r", encoding="utf-8", errors="replace") as f:
                existing_lines = f.readlines()
        except Exception:
            existing_lines = []

    written_keys: set[str] = set()
    output_lines: list[str] = []

    for line in existing_lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or stripped.startswith("!"):
            output_lines.append(line)
            continue
        if "=" in stripped:
            k = stripped.split("=", 1)[0].strip()
            if k in new_props:
                output_lines.append(f"{k}={new_props[k]}\n")
                written_keys.add(k)
            else:
                output_lines.append(line)
        else:
            output_lines.append(line)

    # Append any new keys that weren't in existing file
    for k, v in new_props.items():
        if k not in written_keys:
            output_lines.append(f"{k}={v}\n")

    if not output_lines:
        output_lines.append("#Minecraft server properties\n")
        for k, v in new_props.items():
            output_lines.append(f"{k}={v}\n")

    with open(path, "w", encoding="utf-8") as f:
        f.writelines(output_lines)


class PropertiesUpdateRequest(BaseModel):
    properties: Dict[str, Any]


def _get_props_path(settings: Settings) -> Path:
    p = settings.server_dir / "server.properties"
    if p.is_file() and p.stat().st_size > 0:
        return p
    alt = Path("/opt/stacks/mc-hardcore/server.properties")
    if alt.is_file() and alt.stat().st_size > 0:
        return alt
    return p


@router.get("")
def get_server_properties(
    ctx: Ctx = Depends(require(SERVER_VIEW)),
):
    settings = get_settings()
    props_path = _get_props_path(settings)
    props = _parse_properties_file(props_path)

    raw_motd = props.get("motd", "A Minecraft Server")
    clean_motd = _clean_motd(raw_motd)
    lines_motd = [l for l in clean_motd.split("\n") if l]

    icon_path = settings.server_dir / "server-icon.png"
    has_icon = icon_path.is_file()

    return {
        "properties": props,
        "motd": {
            "raw": raw_motd,
            "clean": clean_motd,
            "lines": lines_motd,
        },
        "has_icon": has_icon,
        "icon_url": "/api/server/properties/icon" if has_icon else None,
    }


@router.put("")
def update_server_properties(
    req: PropertiesUpdateRequest,
    ctx: Ctx = Depends(require(PANEL_ADMIN)),
):
    settings = get_settings()
    props_path = _get_props_path(settings)

    # Validate keys
    clean_props: dict[str, str] = {}
    for k, v in req.properties.items():
        k_str = str(k).strip()
        if not _VALID_KEY_REGEX.match(k_str):
            raise HTTPException(400, f"Invalid property key: '{k_str}'")
        val_str = str(v).replace("\r", "")
        clean_props[k_str] = val_str

    _write_properties_file(props_path, clean_props)
    return {"ok": True, "message": "Properties updated successfully", "properties": clean_props}


@router.get("/icon")
def get_server_icon(
    ctx: Ctx = Depends(require(SERVER_VIEW)),
):
    settings = get_settings()
    icon_path = settings.server_dir / "server-icon.png"
    if not icon_path.is_file():
        raise HTTPException(404, "server-icon.png not found")
    return FileResponse(icon_path, media_type="image/png")


@router.post("/icon")
async def upload_server_icon(
    file: UploadFile = File(...),
    ctx: Ctx = Depends(require(PANEL_ADMIN)),
):
    content = await file.read()
    if len(content) < 24 or not content.startswith(b"\x89PNG\r\n\x1a\n"):
        raise HTTPException(400, "File must be a valid PNG image")

    # Extract width and height from IHDR chunk (bytes 16..24)
    width, height = struct.unpack(">II", content[16:24])
    if width != 64 or height != 64:
        raise HTTPException(
            400, f"Image must be 64x64 pixels (detected {width}x{height})"
        )

    settings = get_settings()
    settings.server_dir.mkdir(parents=True, exist_ok=True)
    icon_path = settings.server_dir / "server-icon.png"

    with open(icon_path, "wb") as f:
        f.write(content)

    return {
        "ok": True,
        "message": "Server icon updated successfully",
        "icon_url": "/api/server/properties/icon",
        "size": len(content),
    }
