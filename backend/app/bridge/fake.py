"""FakeBridge: Bridge en memoria para tests y desarrollo (HEXPANEL_FAKE_BRIDGE=1)."""
from __future__ import annotations

import asyncio
import copy
import hashlib
import json
import random
import time
import uuid as uuidlib
from typing import Any, AsyncIterator, Optional

from app.bridge.client import Bridge, BridgeError

STEVE = "069a79f4-44e9-4726-a5be-fca90e38aaf5"
ALEX = "ec561538-f3fd-461d-aff5-086b22154bce"
NOTCH = "061e9b1a-2d8a-4f0b-9a4e-0000000000aa"

_MAX_STACK = {"minecraft:diamond_sword": 1, "minecraft:ender_pearl": 16, "minecraft:egg": 16}


def item_hash(it: dict) -> str:
    base = {k: v for k, v in it.items() if k not in ("slot", "count", "hash")}
    return hashlib.sha1(json.dumps(base, sort_keys=True).encode()).hexdigest()[:16]


def make_item(item_id: str, count: int = 1, **extra) -> dict:
    it = {"id": item_id, "count": count, "maxStack": _MAX_STACK.get(item_id, 64), **extra}
    it["hash"] = item_hash(it)
    return it


class _Conflict(Exception):
    pass


class _Bad(Exception):
    pass


class FakeBridge(Bridge):
    def __init__(self, run_ticker: bool = False):
        self.connected = True
        self.started_at = time.time()
        self.run_ticker = run_ticker
        self._queue: asyncio.Queue[dict] = asyncio.Queue()
        self._ticker: Optional[asyncio.Task] = None
        self.commands: list[str] = []
        self.watched: set[str] = set()
        self.stopped = False
        self.fail_with_unavailable = False
        self.players_db: dict[str, dict] = {
            STEVE: {"uuid": STEVE, "name": "Steve", "online": True, "lastSeen": int(time.time() * 1000), "lastIp": "127.0.0.1"},
            ALEX: {"uuid": ALEX, "name": "Alex", "online": False, "lastSeen": int(time.time() * 1000) - 86_400_000, "lastIp": "192.168.1.20"},
            NOTCH: {"uuid": NOTCH, "name": "Notch", "online": False, "lastSeen": 0, "lastIp": None},
        }
        self.stats_db: dict[str, dict] = {
            STEVE: {"mobKills": 128, "blocksMined": 5400, "playTimeTicks": 72000 * 12, "deaths": 3, "custom": {}},
            ALEX: {"mobKills": 5, "blocksMined": 70, "playTimeTicks": 72000, "deaths": 1, "custom": {}},
        }
        self.state: dict[str, dict[str, dict]] = {}
        for u in self.players_db:
            self.state[u] = {
                "inventory": {"revision": 1, "items": {}, "size": 41},
                "enderchest": {"revision": 1, "items": {}, "size": 27},
            }
        inv = self.state[STEVE]["inventory"]["items"]
        inv[0] = make_item("minecraft:diamond_sword", 1, name={"text": "Excalibur", "color": "gold"},
                           enchantments=[{"id": "minecraft:sharpness", "level": 5}])
        inv[1] = make_item("minecraft:cobblestone", 64)
        inv[2] = make_item("minecraft:cobblestone", 20)
        inv[3] = make_item("minecraft:ender_pearl", 8)
        self.state[STEVE]["enderchest"]["items"][0] = make_item("minecraft:diamond", 32)
        self.state[ALEX]["inventory"]["items"][0] = make_item("minecraft:apple", 5)
        self.link_codes: dict[str, dict] = {
            "STEVE1": {"uuid": STEVE, "name": "Steve", "kind": "link"},
            "ALEX01": {"uuid": ALEX, "name": "Alex", "kind": "link"},
        }
        self.undo_store: dict[str, tuple[str, dict]] = {}

    # ---- helpers ----
    def add_link_code(self, code: str, uuid: str, name: str, kind: str = "link") -> None:
        self.link_codes[code] = {"uuid": uuid, "name": name, "kind": kind}

    def _check(self):
        if self.fail_with_unavailable:
            from app.bridge.client import BridgeUnavailable
            raise BridgeUnavailable("fake bridge caído")

    def _container_dto(self, uuid: str, ctype: str) -> dict:
        c = self.state[uuid][ctype]
        items = []
        for slot, it in sorted(c["items"].items()):
            items.append({"slot": slot, **copy.deepcopy(it)})
        return {"type": ctype, "revision": c["revision"], "online": self.players_db[uuid]["online"], "items": items}

    def _both(self, uuid: str) -> dict:
        return {"inventory": self._container_dto(uuid, "inventory"), "enderchest": self._container_dto(uuid, "enderchest")}

    def _emit(self, ev: dict) -> None:
        self._queue.put_nowait(ev)

    def emit_console(self, line: str) -> None:
        self._emit({"type": "console.line", "data": {"line": line, "ts": int(time.time() * 1000)}})

    # ---- Bridge API ----
    async def start(self):
        if self.run_ticker:
            self._ticker = asyncio.create_task(self._tick())

    async def close(self):
        if self._ticker:
            self._ticker.cancel()

    async def _tick(self):
        while True:
            await asyncio.sleep(2)
            self._emit({"type": "metrics.tick", "data": await self.metrics()})
            if random.random() < 0.3:
                self.emit_console("[Server thread/INFO]: Tick fake bridge")

    async def health(self):
        self._check()
        return {"version": "fake-0.1", "mcVersion": "1.21.11", "uptime": int(time.time() - self.started_at), "offlineEdit": True}

    async def metrics(self):
        self._check()
        online = sum(1 for p in self.players_db.values() if p["online"])
        return {"tps": [20.0, 19.98, 19.9], "mspt": round(random.uniform(3, 9), 2), "players": online,
                "heap": {"used": 1_200_000_000, "max": 4_000_000_000}, "worlds": [{"name": "world", "sizeBytes": 123_456_789}]}

    async def players(self, query="", online=None):
        self._check()
        out = []
        for p in self.players_db.values():
            if query and query.lower() not in p["name"].lower():
                continue
            if online is not None and p["online"] != online:
                continue
            out.append(dict(p))
        return out

    async def player_stats(self, uuid):
        self._check()
        if uuid not in self.players_db:
            raise BridgeError(404, {"error": "unknown player"})
        return dict(self.stats_db.get(uuid, {"mobKills": 0, "blocksMined": 0, "playTimeTicks": 0, "deaths": 0, "custom": {}}))

    async def containers(self, uuid):
        self._check()
        if uuid not in self.state:
            raise BridgeError(404, {"error": "unknown player"})
        return self._both(uuid)

    async def containers_ops(self, uuid, body):
        self._check()
        if uuid not in self.state:
            return 404, {"error": "unknown player"}
        work = copy.deepcopy(self.state[uuid])
        before = copy.deepcopy(self.state[uuid])
        try:
            for op in body.get("ops", []):
                self._apply(work, op)
        except _Conflict as e:
            return 409, {"error": "conflict", "message": str(e), "containers": self._both(uuid)}
        except _Bad as e:
            return 400, {"error": "bad_op", "message": str(e)}
        changed = [c for c in ("inventory", "enderchest") if work[c]["items"] != before[c]["items"]]
        for c in changed:
            work[c]["revision"] = before[c]["revision"] + 1
        self.state[uuid] = work
        ref = uuidlib.uuid4().hex
        self.undo_store[ref] = (uuid, before)
        for c in changed:
            self._emit({"type": "container.diff", "data": {"uuid": uuid, "container": c, "revision": work[c]["revision"]}})
        return 200, {"ok": True, "undoRef": ref, "containers": self._both(uuid)}

    async def containers_undo(self, uuid, undo_ref):
        self._check()
        entry = self.undo_store.get(undo_ref)
        if not entry or entry[0] != uuid:
            return 404, {"error": "unknown undoRef"}
        snap = copy.deepcopy(entry[1])
        cur = self.state[uuid]
        for c in ("inventory", "enderchest"):
            snap[c]["revision"] = cur[c]["revision"] + 1
        self.state[uuid] = snap
        del self.undo_store[undo_ref]
        return 200, {"ok": True, "containers": self._both(uuid)}

    def _get(self, st, ref):
        c = ref.get("c")
        if c not in st:
            raise _Bad("contenedor inválido")
        slot = ref.get("slot")
        if not isinstance(slot, int) or not (0 <= slot < st[c]["size"]):
            raise _Bad("slot inválido")
        return st[c]["items"], slot

    def _apply(self, st, op):
        kind = op.get("op")
        if kind == "give":
            items, slot = self._get(st, op["to"])
            item_id = str(op["item"]).split("[", 1)[0]
            count = int(op.get("count") or 1)
            new = make_item(item_id, count)
            cur = items.get(slot)
            if cur is None:
                items[slot] = new
            elif cur["hash"] == new["hash"] and cur["count"] + count <= cur["maxStack"]:
                cur["count"] += count
            else:
                raise _Conflict("slot destino ocupado")
            return
        if kind not in ("move", "split", "delete"):
            raise _Bad(f"op desconocida: {kind}")
        src_items, s = self._get(st, op["from"])
        src = src_items.get(s)
        if src is None or (op.get("expectHash") and src["hash"] != op["expectHash"]):
            raise _Conflict("El jugador movió ese ítem")
        if kind == "delete":
            del src_items[s]
            return
        dst_items, d = self._get(st, op["to"])
        if dst_items is src_items and d == s:
            return
        count = op.get("count")
        if kind == "split" and not count:
            raise _Bad("split requiere count")
        n = src["count"] if count is None else int(count)
        if n <= 0 or n > src["count"]:
            raise _Bad("cantidad inválida")
        dst = dst_items.get(d)
        if dst is None:
            moved = copy.deepcopy(src)
            moved["count"] = n
            dst_items[d] = moved
            src["count"] -= n
        elif dst["hash"] == src["hash"] and src["maxStack"] > 1:
            room = dst["maxStack"] - dst["count"]
            t = min(room, n)
            dst["count"] += t
            src["count"] -= t
        elif n == src["count"] and kind == "move":
            dst_items[d], src_items[s] = src, dst
            return
        else:
            raise _Conflict("destino ocupado por un ítem distinto")
        if src["count"] <= 0:
            del src_items[s]

    async def command(self, command):
        self._check()
        self.commands.append(command)
        self.emit_console(f"[Server thread/INFO]: Executed: {command}")
        return {"ok": True}

    async def server_stop(self):
        self._check()
        self.stopped = True
        return {"ok": True}

    async def server_restart(self):
        self._check()
        return {"ok": True}

    async def link_verify(self, code, consume=False):
        self._check()
        entry = self.link_codes.get(code.upper())
        if not entry:
            return None
        if consume:
            del self.link_codes[code.upper()]
        return dict(entry)

    async def watch(self, uuid, on):
        (self.watched.add if on else self.watched.discard)(uuid)

    async def stream(self) -> AsyncIterator[dict]:
        while True:
            yield await self._queue.get()
