"""API de catálogo de ítems (PLAN §7.6, §11)."""
from __future__ import annotations

import json
from typing import Any
from fastapi import APIRouter
from app.core.config import get_settings

router = APIRouter(prefix="/items", tags=["items"])

FALLBACK_CATALOG = [
    {"id": "minecraft:diamond_sword", "name": "Espada de diamante", "maxStack": 1, "category": "combat"},
    {"id": "minecraft:netherite_pickaxe", "name": "Pico de netherita", "maxStack": 1, "category": "tools"},
    {"id": "minecraft:diamond", "name": "Diamante", "maxStack": 64, "category": "misc"},
    {"id": "minecraft:cobblestone", "name": "Roca", "maxStack": 64, "category": "blocks"},
    {"id": "minecraft:golden_apple", "name": "Manzana dorada", "maxStack": 64, "category": "food"},
    {"id": "minecraft:ender_pearl", "name": "Perla de ender", "maxStack": 16, "category": "misc"},
    {"id": "minecraft:redstone", "name": "Redstone", "maxStack": 64, "category": "redstone"},
    {"id": "minecraft:bow", "name": "Arco", "maxStack": 1, "category": "combat"},
    {"id": "minecraft:arrow", "name": "Flecha", "maxStack": 64, "category": "combat"},
    {"id": "minecraft:bread", "name": "Pan", "maxStack": 64, "category": "food"},
]


@router.get("")
def list_items(q: str = "", category: str = "") -> list[dict[str, Any]]:
    settings = get_settings()
    catalog = FALLBACK_CATALOG
    if settings.items_json.is_file():
        try:
            catalog = json.loads(settings.items_json.read_text(encoding="utf-8"))
        except Exception:
            pass

    res = catalog
    if category:
        res = [it for it in res if it.get("category") == category]
    if q:
        q_lower = q.lower()
        res = [
            it
            for it in res
            if q_lower in it.get("id", "").lower() or q_lower in it.get("name", "").lower()
        ]
    return res
