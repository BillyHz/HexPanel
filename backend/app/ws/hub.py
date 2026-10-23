"""WebSocket Hub multiplexado (PLAN §11)."""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, Dict, Optional, Set
from fastapi import WebSocket, WebSocketDisconnect
from sqlmodel import Session
from app.core.security import Ctx, resolve_session
from app.core.permissions import SERVER_CONSOLE, SERVER_VIEW, PLAYERS_VIEW, INVENTORY_VIEW
from app.bridge.client import Bridge

log = logging.getLogger("hexpanel.ws")


class ClientConnection:
    def __init__(self, ws: WebSocket, ctx: Ctx):
        self.ws = ws
        self.ctx = ctx
        self.topics: Set[str] = set()

    def can_subscribe(self, topic: str) -> bool:
        if topic == "console":
            return self.ctx.can(SERVER_CONSOLE)
        if topic == "metrics":
            return self.ctx.can(SERVER_VIEW)
        if topic == "players":
            return self.ctx.can(PLAYERS_VIEW)
        if topic.startswith("container:"):
            target_uuid = topic.split(":", 1)[1]
            return self.ctx.can(INVENTORY_VIEW) or self.ctx.is_self(target_uuid)
        return False

    async def send_json(self, data: Any) -> None:
        try:
            await self.ws.send_json(data)
        except Exception:
            pass


class WsHub:
    def __init__(self, bridge: Bridge):
        self.bridge = bridge
        self.clients: Set[ClientConnection] = set()
        self.topic_subscribers: Dict[str, Set[ClientConnection]] = {}
        self._pump_task: Optional[asyncio.Task] = None

    def start(self) -> None:
        if not self._pump_task:
            self._pump_task = asyncio.create_task(self._pump_bridge_events())

    async def stop(self) -> None:
        if self._pump_task:
            self._pump_task.cancel()
            try:
                await self._pump_task
            except asyncio.CancelledError:
                pass

    async def register(self, ws: WebSocket, ctx: Ctx) -> ClientConnection:
        conn = ClientConnection(ws, ctx)
        self.clients.add(conn)
        return conn

    async def unregister(self, conn: ClientConnection) -> None:
        self.clients.discard(conn)
        for t in list(conn.topics):
            await self.unsubscribe(conn, t)

    async def subscribe(self, conn: ClientConnection, topic: str) -> bool:
        if not conn.can_subscribe(topic):
            await conn.send_json({"type": "error", "message": f"Sin permiso para tema: {topic}"})
            return False

        conn.topics.add(topic)
        if topic not in self.topic_subscribers:
            self.topic_subscribers[topic] = set()
        self.topic_subscribers[topic].add(conn)

        if topic.startswith("container:"):
            uuid = topic.split(":", 1)[1]
            await self.bridge.watch(uuid, True)

        await conn.send_json({"type": "subscribed", "topic": topic})
        return True

    async def unsubscribe(self, conn: ClientConnection, topic: str) -> None:
        conn.topics.discard(topic)
        subs = self.topic_subscribers.get(topic)
        if subs:
            subs.discard(conn)
            if not subs:
                del self.topic_subscribers[topic]
                if topic.startswith("container:"):
                    uuid = topic.split(":", 1)[1]
                    await self.bridge.watch(uuid, False)

        await conn.send_json({"type": "unsubscribed", "topic": topic})

    async def broadcast(self, topic: str, data: Any) -> None:
        subs = self.topic_subscribers.get(topic)
        if not subs:
            return
        dead = set()
        for c in subs:
            try:
                await c.send_json({"topic": topic, "data": data})
            except Exception:
                dead.add(c)
        for d in dead:
            await self.unregister(d)

    async def _pump_bridge_events(self) -> None:
        while True:
            try:
                async for event in self.bridge.stream():
                    etype = event.get("type", "")
                    edata = event.get("data", {})
                    if etype == "console.line":
                        await self.broadcast("console", edata)
                    elif etype == "metrics.tick":
                        await self.broadcast("metrics", edata)
                    elif etype in ("player.join", "player.quit"):
                        await self.broadcast("players", event)
                    elif etype in ("container.diff", "container.locked"):
                        uuid = event.get("uuid") or (edata.get("uuid") if isinstance(edata, dict) else None)
                        name = event.get("name") or (edata.get("name") if isinstance(edata, dict) else None)
                        if uuid:
                            await self.broadcast(f"container:{uuid}", event)
                        if name:
                            await self.broadcast(f"container:{name}", event)
                            await self.broadcast(f"container:{name.lower()}", event)
            except asyncio.CancelledError:
                break
            except Exception as e:
                log.debug("Bridge stream reconnecting: %s", e)
                await asyncio.sleep(2)
