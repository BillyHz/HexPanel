"""API para Marketplace de Plugins (Modrinth API) y gestión de plugins locales."""
from __future__ import annotations

import logging
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.core.config import get_settings
from app.core.permissions import PANEL_ADMIN, SERVER_VIEW
from app.core.security import Ctx, require

router = APIRouter(prefix="/plugins", tags=["plugins"])
log = logging.getLogger("hexpanel.plugins")

MODRINTH_API = "https://api.modrinth.com/v2"
USER_AGENT = "HexPanel/1.0.0 (admin@hexpanel.dev)"


def get_plugins_dir() -> Path:
    settings = get_settings()
    pdir = settings.server_dir / "plugins"
    pdir.mkdir(parents=True, exist_ok=True)
    return pdir


def _validate_plugin_filename(filename: str) -> Path:
    clean = Path(filename).name
    if clean != filename or ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(400, "Nombre de archivo no válido")
    if not (clean.endswith(".jar") or clean.endswith(".jar.disabled")):
        raise HTTPException(400, "El archivo debe ser un archivo .jar o .jar.disabled")
    pdir = get_plugins_dir().resolve()
    target = (pdir / clean).resolve()
    if not target.is_relative_to(pdir):
        raise HTTPException(403, "Acceso denegado")
    return target


class InstallPluginRequest(BaseModel):
    project_id: str
    version_id: Optional[str] = None


class TogglePluginRequest(BaseModel):
    filename: str


@router.get("/market")
async def search_plugins_market(
    q: str = Query("", description="Término de búsqueda"),
    limit: int = Query(20, ge=1, le=50),
    ctx: Ctx = Depends(require(SERVER_VIEW)),
):
    """Busca plugins para Paper/Spigot en Modrinth."""
    url = f"{MODRINTH_API}/search"
    facets = '[["categories:paper","categories:spigot","categories:purpur"],["project_type:plugin"]]'
    params = {
        "query": q,
        "facets": facets,
        "limit": limit,
    }
    headers = {"User-Agent": USER_AGENT}

    try:
        async with httpx.AsyncClient(timeout=10.0, headers=headers) as client:
            resp = await client.get(url, params=params)
            if resp.status_code != 200:
                raise HTTPException(502, f"Error devuelto por Modrinth API: {resp.status_code}")
            data = resp.json()
    except httpx.HTTPError as e:
        raise HTTPException(502, f"No se pudo conectar con Modrinth: {e}")

    hits = data.get("hits", [])
    results = []
    for h in hits:
        results.append({
            "id": h.get("project_id"),
            "slug": h.get("slug"),
            "title": h.get("title"),
            "description": h.get("description"),
            "icon_url": h.get("icon_url"),
            "downloads": h.get("downloads", 0),
            "author": h.get("author"),
            "categories": h.get("categories", []),
            "versions": h.get("versions", []),
        })

    return {
        "total": data.get("total_hits", len(results)),
        "hits": results,
    }


@router.get("/installed")
def list_installed_plugins(
    ctx: Ctx = Depends(require(SERVER_VIEW)),
):
    """Lista todos los plugins instalados (.jar y .jar.disabled)."""
    pdir = get_plugins_dir()
    plugins = []

    for item in pdir.iterdir():
        if not item.is_file():
            continue
        name = item.name
        if name.endswith(".jar"):
            enabled = True
            base_name = name[:-4]
        elif name.endswith(".jar.disabled"):
            enabled = False
            base_name = name[:-13]
        else:
            continue

        try:
            stat = item.stat()
            plugins.append({
                "filename": name,
                "name": base_name,
                "size": stat.st_size,
                "enabled": enabled,
                "modified_at": datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
            })
        except Exception:
            continue

    plugins.sort(key=lambda x: x["name"].lower())
    return plugins


@router.post("/install")
async def install_plugin(
    req: InstallPluginRequest,
    ctx: Ctx = Depends(require(PANEL_ADMIN)),
):
    """Descarga e instala un plugin directamente desde Modrinth a plugins/."""
    headers = {"User-Agent": USER_AGENT}

    try:
        async with httpx.AsyncClient(timeout=15.0, headers=headers) as client:
            target_version_data = None
            if req.version_id:
                ver_resp = await client.get(f"{MODRINTH_API}/version/{req.version_id}")
                if ver_resp.status_code != 200:
                    raise HTTPException(404, "Versión del plugin no encontrada en Modrinth")
                target_version_data = ver_resp.json()
            else:
                # Obtener versiones del proyecto
                versions_resp = await client.get(f"{MODRINTH_API}/project/{req.project_id}/version")
                if versions_resp.status_code != 200:
                    raise HTTPException(404, "Proyecto no encontrado en Modrinth")
                versions = versions_resp.json()
                if not versions:
                    raise HTTPException(404, "El proyecto no tiene versiones disponibles")
                # Escoger la primera versión (más reciente)
                target_version_data = versions[0]

            files = target_version_data.get("files", [])
            primary_file = next((f for f in files if f.get("primary")), None) or (files[0] if files else None)
            if not primary_file:
                raise HTTPException(404, "No se encontró ningún archivo descargable en esta versión")

            download_url = primary_file.get("url")
            raw_filename = primary_file.get("filename") or f"{req.project_id}.jar"
            clean_filename = Path(raw_filename).name

            if not clean_filename.endswith(".jar"):
                clean_filename += ".jar"

            pdir = get_plugins_dir()
            dest = pdir / clean_filename

            # Descargar archivo jar
            dl_resp = await client.get(download_url)
            if dl_resp.status_code != 200:
                raise HTTPException(502, "Error al descargar el archivo desde el CDN de Modrinth")

            with open(dest, "wb") as f:
                f.write(dl_resp.content)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Error durante la instalación del plugin: {e}")

    return {
        "ok": True,
        "message": f"Plugin '{clean_filename}' instalado exitosamente",
        "filename": clean_filename,
        "version": target_version_data.get("version_number"),
        "size": dest.stat().st_size,
    }


@router.post("/toggle")
def toggle_plugin(
    req: TogglePluginRequest,
    ctx: Ctx = Depends(require(PANEL_ADMIN)),
):
    """Activa o desactiva un plugin cambiando la extensión entre .jar y .jar.disabled."""
    target = _validate_plugin_filename(req.filename)
    if not target.exists():
        raise HTTPException(404, "Plugin no encontrado")

    old_name = target.name
    if old_name.endswith(".jar"):
        new_name = old_name + ".disabled"
        new_enabled = False
    elif old_name.endswith(".jar.disabled"):
        new_name = old_name[:-9]  # quita .disabled
        new_enabled = True
    else:
        raise HTTPException(400, "Extensión no soportada para alternar estado")

    dest = target.parent / new_name
    if dest.exists():
        raise HTTPException(409, f"Ya existe un archivo llamado '{new_name}'")

    target.rename(dest)
    return {
        "ok": True,
        "old_filename": old_name,
        "new_filename": new_name,
        "enabled": new_enabled,
        "message": f"Plugin {'activado' if new_enabled else 'desactivado'}. Requiere reinicio del servidor.",
    }


@router.delete("/{filename}")
def delete_plugin(
    filename: str,
    ctx: Ctx = Depends(require(PANEL_ADMIN)),
):
    """Elimina permanentemente un archivo de plugin."""
    target = _validate_plugin_filename(filename)
    if not target.exists():
        raise HTTPException(404, "Plugin no encontrado")

    target.unlink()
    return {"ok": True, "message": f"Plugin '{filename}' eliminado"}
