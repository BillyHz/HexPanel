"""Roles y permisos granulares (PLAN §8-§9)."""
from __future__ import annotations

SERVER_VIEW = "server.view"
SERVER_CONSOLE = "server.console"
SERVER_POWER = "server.power"
PLAYERS_VIEW = "players.view"
PLAYERS_MODERATE = "players.moderate"
INVENTORY_VIEW = "inventory.view"
INVENTORY_EDIT = "inventory.edit"
AUDIT_VIEW = "audit.view"
PANEL_ADMIN = "panel.admin"

ALL_PERMISSIONS = [
    SERVER_VIEW, SERVER_CONSOLE, SERVER_POWER, PLAYERS_VIEW, PLAYERS_MODERATE,
    INVENTORY_VIEW, INVENTORY_EDIT, AUDIT_VIEW, PANEL_ADMIN,
]

DEFAULT_ROLES: dict[str, list[str]] = {
    "player": [],
    "moderator": [SERVER_VIEW, PLAYERS_VIEW, PLAYERS_MODERATE, INVENTORY_VIEW, AUDIT_VIEW],
    "admin": list(ALL_PERMISSIONS),
}


def has_permission(perms: set[str] | list[str], needed: str) -> bool:
    """`panel.admin` concede todo."""
    return PANEL_ADMIN in perms or needed in perms
