"""API for interactive web map integration (Dynmap / Pl3xMap / BlueMap)."""
from __future__ import annotations

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session

from app.core.permissions import PANEL_ADMIN, SERVER_VIEW
from app.core.security import Ctx, get_db, require
from app.db.models import MapSettings

router = APIRouter(prefix="/server/map", tags=["map"])


def get_map_settings(db: Session) -> MapSettings:
    st = db.get(MapSettings, 1)
    if not st:
        st = MapSettings(id=1, enabled=True, url="http://100.72.184.60:8100", title="Mapa del Servidor")
        db.add(st)
        db.commit()
        db.refresh(st)
    return st


class MapSettingsUpdateRequest(BaseModel):
    enabled: Optional[bool] = None
    url: Optional[str] = None
    title: Optional[str] = None


@router.get("")
def get_map_config(
    db: Session = Depends(get_db),
    ctx: Ctx = Depends(require(SERVER_VIEW)),
):
    return get_map_settings(db)


@router.put("")
def update_map_config(
    req: MapSettingsUpdateRequest,
    db: Session = Depends(get_db),
    ctx: Ctx = Depends(require(PANEL_ADMIN)),
):
    st = get_map_settings(db)

    if req.enabled is not None:
        st.enabled = req.enabled
    if req.url is not None:
        clean_url = req.url.strip()
        if not clean_url:
            raise HTTPException(400, "La URL del mapa no puede estar vacía")
        st.url = clean_url
    if req.title is not None:
        st.title = req.title.strip() or "Mapa del Servidor"

    db.add(st)
    db.commit()
    db.refresh(st)
    return st
