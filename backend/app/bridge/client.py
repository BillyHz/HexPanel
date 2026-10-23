"""Cliente del Bridge (plugin Paper): HTTP (httpx) + WS (websockets) con reconexión exponencial.

Contrato: PLAN §6.2 / §7.3 y docs/bridge-protocol.md. Extensiones usadas por el backend:
  GET  /v1/link/verify?code=XXXXXX&consume=true|false → { uuid, name, kind: "link"|"reset" } | 404
  POST /v1/players/{uuid}/containers/undo { undoRef } → { ok, ... }
  Las respuestas de /containers/ops pueden incluir "undoRef" (referencia para deshacer).
  WS cliente → bridge: { "action": "watch"|"unwatch", "uuid": "..." }
"""
from __future__ import annotations

import asyncio
import json
import logging
import random
from typing import Any, AsyncIterator, Optional

import httpx

log = logging.getLogger("hexpanel.bridge")


class BridgeUnavailable(Exception):
    """El Bridge no responde (servidor apagado, token mal, etc.)."""


class BridgeError(Exception):
    def __init__(self, status: int, body: Any):
        super().__init__(f"Bridge respondió {status}: {body}")
        self.status = status
        self.body = body


class Bridge:
    """Interfaz común (HttpBridge y FakeBridge)."""

    connected: bool = False

    async def start(self) -> None: ...
    async def close(self) -> None: ...
    async def health(self) -> dict: raise NotImplementedError
    async def metrics(self) -> dict: raise NotImplementedError
    async def players(self, query: str = "", online: Optional[bool] = None) -> list[dict]: raise NotImplementedError
    async def player_stats(self, uuid: str) -> dict: raise NotImplementedError
    async def containers(self, uuid: str) -> dict: raise NotImplementedError
    async def containers_ops(self, uuid: str, body: dict) -> tuple[int, Any]: raise NotImplementedError
    async def containers_undo(self, uuid: str, undo_ref: str) -> tuple[int, Any]: raise NotImplementedError
    async def command(self, command: str) -> dict: raise NotImplementedError
    async def server_stop(self) -> dict: raise NotImplementedError
    async def server_restart(self) -> dict: raise NotImplementedError
    async def link_verify(self, code: str, consume: bool = False) -> Optional[dict]: raise NotImplementedError
    async def watch(self, uuid: str, on: bool) -> None: ...
    def stream(self) -> AsyncIterator[dict]: raise NotImplementedError


class HttpBridge(Bridge):
    def __init__(self, base_url: str, token: str, timeout: float = 10.0):
        self.base_url = base_url.rstrip("/")
        self.token = token
        self._client = httpx.AsyncClient(
            base_url=self.base_url, timeout=timeout,
            headers={"Authorization": f"Bearer {token}"},
        )
        self.connected = False
        self._ws = None
        self._closed = False

    async def close(self) -> None:
        self._closed = True
        await self._client.aclose()

    async def _req(self, method: str, path: str, *, json_body: Any = None, params: Optional[dict] = None,
                   raw: bool = False) -> tuple[int, Any]:
        try:
            r = await self._client.request(method, path, json=json_body, params=params)
        except httpx.HTTPError as e:
            raise BridgeUnavailable(str(e)) from e
        try:
            data = r.json() if r.content else None
        except ValueError:
            data = {"raw": r.text}
        if raw:
            return r.status_code, data
        if r.status_code >= 400:
            raise BridgeError(r.status_code, data)
        return r.status_code, data

    async def health(self): return (await self._req("GET", "/v1/health"))[1]
    async def metrics(self): return (await self._req("GET", "/v1/metrics"))[1]

    async def players(self, query: str = "", online: Optional[bool] = None):
        params: dict[str, Any] = {}
        if query:
            params["query"] = query
        if online is not None:
            params["online"] = str(online).lower()
        return (await self._req("GET", "/v1/players", params=params))[1]

    async def player_stats(self, uuid): return (await self._req("GET", f"/v1/players/{uuid}/stats"))[1]
    async def containers(self, uuid): return (await self._req("GET", f"/v1/players/{uuid}/containers"))[1]

    async def containers_ops(self, uuid, body):
        return await self._req("POST", f"/v1/players/{uuid}/containers/ops", json_body=body, raw=True)

    async def containers_undo(self, uuid, undo_ref):
        return await self._req("POST", f"/v1/players/{uuid}/containers/undo", json_body={"undoRef": undo_ref}, raw=True)

    async def command(self, command): return (await self._req("POST", "/v1/commands", json_body={"command": command}))[1]
    async def server_stop(self): return (await self._req("POST", "/v1/server/stop"))[1]
    async def server_restart(self): return (await self._req("POST", "/v1/server/restart"))[1]

    async def link_verify(self, code, consume=False):
        status, data = await self._req("GET", "/v1/link/verify", params={"code": code, "consume": str(consume).lower()}, raw=True)
        if status == 404 or status == 400:
            return None
        if status >= 400:
            raise BridgeError(status, data)
        return data

    async def watch(self, uuid: str, on: bool) -> None:
        ws = self._ws
        if ws is None:
            return
        try:
            await ws.send(json.dumps({"action": "watch" if on else "unwatch", "uuid": uuid}))
        except Exception:  # pragma: no cover
            pass

    async def stream(self) -> AsyncIterator[dict]:
        """Eventos del Bridge; reconecta con backoff exponencial (1s → 30s)."""
        import websockets

        ws_url = self.base_url.replace("http://", "ws://").replace("https://", "wss://") + "/v1/stream"
        delay = 1.0
        while not self._closed:
            try:
                async with websockets.connect(
                    ws_url, additional_headers={"Authorization": f"Bearer {self.token}"},
                    ping_interval=20, max_size=8 * 1024 * 1024,
                ) as ws:
                    self._ws = ws
                    self.connected = True
                    delay = 1.0
                    log.info("Bridge WS conectado")
                    async for raw in ws:
                        try:
                            yield json.loads(raw)
                        except ValueError:
                            continue
            except asyncio.CancelledError:
                raise
            except Exception as e:
                log.debug("Bridge WS caído: %s", e)
            finally:
                self._ws = None
                self.connected = False
            if self._closed:
                break
            await asyncio.sleep(delay + random.uniform(0, delay * 0.25))
            delay = min(delay * 2, 30.0)
