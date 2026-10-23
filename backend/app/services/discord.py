"""Service for Discord Webhook alerts and notifications."""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
import httpx
from sqlmodel import Session

from app.db.models import DiscordSettings

log = logging.getLogger("hexpanel.discord")

COLOR_GREEN = 0x2ECC71   # Servidor iniciado
COLOR_RED = 0xE74C3C     # Servidor detenido / Crash
COLOR_ORANGE = 0xE67E22  # TPS bajo / Advertencia
COLOR_BLUE = 0x3498DB    # Info / Test


def get_discord_settings(db: Session) -> DiscordSettings:
    st = db.get(DiscordSettings, 1)
    if not st:
        st = DiscordSettings(id=1)
        db.add(st)
        db.commit()
        db.refresh(st)
    return st


async def send_discord_alert(
    webhook_url: str,
    title: str,
    description: str,
    color: int = COLOR_BLUE,
    fields: Optional[List[Dict[str, Any]]] = None,
) -> bool:
    """Envía un mensaje enriquecido (Embed) a un webhook de Discord."""
    if not webhook_url or not webhook_url.startswith("http"):
        log.warning("URL de Webhook de Discord no configurada o inválida")
        return False

    embed: Dict[str, Any] = {
        "title": title,
        "description": description,
        "color": color,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "footer": {
            "text": "HexPanel • Notificaciones del Servidor",
        },
    }
    if fields:
        embed["fields"] = fields

    payload = {
        "username": "HexPanel",
        "avatar_url": "https://raw.githubusercontent.com/FortAwesome/Font-Awesome/master/svgs/solid/server.svg",
        "embeds": [embed],
    }

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.post(webhook_url, json=payload)
            if resp.status_code in (200, 204):
                return True
            else:
                log.warning("Discord webhook respondió %s: %s", resp.status_code, resp.text)
                return False
    except Exception as e:
        log.error("Error al enviar alerta a Discord: %s", e)
        return False
