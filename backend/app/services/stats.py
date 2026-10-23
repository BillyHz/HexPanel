"""Servicio de estadísticas y logros del servidor (PLAN §8)."""
from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any, Optional
from app.core.config import Settings


class StatsCache:
    def __init__(self, ttl: float = 60.0):
        self._cache: dict[str, tuple[float, Any]] = {}
        self.ttl = ttl

    def get(self, key: str) -> Optional[Any]:
        if key in self._cache:
            ts, val = self._cache[key]
            if time.time() - ts < self.ttl:
                return val
            del self._cache[key]
        return None

    def set(self, key: str, val: Any) -> None:
        self._cache[key] = (time.time(), val)


_stats_cache = StatsCache(ttl=60.0)


def get_offline_stats_file(settings: Settings, uuid: str) -> Optional[dict]:
    p = settings.server_dir / settings.world_name / "stats" / f"{uuid}.json"
    if not p.is_file():
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return None


def calculate_mined_blocks(settings: Settings, uuid: str) -> int:
    cached = _stats_cache.get(f"mined:{uuid}")
    if cached is not None:
        return cached

    stats = get_offline_stats_file(settings, uuid)
    if not stats:
        return 0
    stats_dict = stats.get("stats", {})
    mined = stats_dict.get("minecraft:mined", {})
    total = sum(mined.values()) if isinstance(mined, dict) else 0
    _stats_cache.set(f"mined:{uuid}", total)
    return total


def get_offline_advancements(settings: Settings, uuid: str) -> dict:
    p = settings.server_dir / settings.world_name / "advancements" / f"{uuid}.json"
    if not p.is_file():
        return {}
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return {}
