"""Supervisor de procesos (PLAN §3, §12 Fase 6).

Controla el proceso del servidor Minecraft (server.jar) y opcionalmente Playit.
Lee uso de CPU y RAM con psutil y gestiona el lockfile HexServer/.hexpanel.lock.
"""
from __future__ import annotations

import asyncio
import logging
import os
import subprocess
import time
from enum import Enum
from pathlib import Path
from typing import Optional

try:
    import psutil
except ImportError:
    psutil = None  # type: ignore

from app.core.config import Settings

log = logging.getLogger("hexpanel.supervisor")


class ProcessState(str, Enum):
    STOPPED = "STOPPED"
    STARTING = "STARTING"
    RUNNING = "RUNNING"
    STOPPING = "STOPPING"


class Supervisor:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.state = ProcessState.STOPPED
        self.proc: Optional[subprocess.Popen] = None
        self.playit_proc: Optional[subprocess.Popen] = None
        self.started_at: Optional[float] = None
        self._monitor_task: Optional[asyncio.Task] = None

    @property
    def lockfile(self) -> Path:
        return self.settings.lockfile

    def is_locked_by_other(self) -> bool:
        if not self.lockfile.is_file():
            return False
        try:
            pid = int(self.lockfile.read_text(encoding="utf-8").strip())
            if psutil and psutil.pid_exists(pid):
                return True
        except Exception:
            pass
        return False

    def _write_lock(self, pid: int) -> None:
        try:
            self.lockfile.parent.mkdir(parents=True, exist_ok=True)
            self.lockfile.write_text(str(pid), encoding="utf-8")
        except Exception as e:
            log.warning("No se pudo escribir el lockfile: %s", e)

    def _remove_lock(self) -> None:
        try:
            if self.lockfile.is_file():
                self.lockfile.unlink()
        except Exception as e:
            log.warning("No se pudo borrar el lockfile: %s", e)

    def get_metrics(self) -> dict:
        cpu = 0.0
        ram_mb = 0
        if self.proc and psutil:
            try:
                p = psutil.Process(self.proc.pid)
                cpu = p.cpu_percent(interval=None)
                ram_mb = int(p.memory_info().rss / (1024 * 1024))
            except Exception:
                pass
        return {"cpu": cpu, "ram_mb": ram_mb}

    async def start(self) -> dict:
        if self.state in (ProcessState.RUNNING, ProcessState.STARTING):
            return {"ok": False, "message": "El servidor ya se encuentra en ejecución"}
        if self.is_locked_by_other():
            return {"ok": False, "message": "El servidor ya está iniciado por otro proceso (lockfile presente)"}

        jar_path = self.settings.server_dir / self.settings.server_jar
        if not jar_path.is_file():
            return {"ok": False, "message": f"No se encontró el jar del servidor en {jar_path}"}

        self.state = ProcessState.STARTING
        args = [self.settings.java_cmd, *self.settings.java_args.split(), "-jar", str(jar_path), "nogui"]
        try:
            self.proc = subprocess.Popen(
                args,
                cwd=str(self.settings.server_dir),
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            self.started_at = time.time()
            self._write_lock(self.proc.pid)
            self.state = ProcessState.RUNNING
            log.info("Servidor Minecraft iniciado con PID %d", self.proc.pid)
        except Exception as e:
            self.state = ProcessState.STOPPED
            self._remove_lock()
            return {"ok": False, "message": f"Error al iniciar servidor: {e}"}

        # Playit opcional
        if self.settings.playit_exe and Path(self.settings.playit_exe).is_file():
            try:
                self.playit_proc = subprocess.Popen(
                    [self.settings.playit_exe],
                    cwd=str(Path(self.settings.playit_exe).parent),
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
                log.info("Playit iniciado con PID %d", self.playit_proc.pid)
            except Exception as e:
                log.warning("No se pudo iniciar Playit: %s", e)

        return {"ok": True, "pid": self.proc.pid}

    async def stop(self) -> dict:
        if not self.proc or self.proc.poll() is not None:
            self.state = ProcessState.STOPPED
            self._remove_lock()
            return {"ok": True, "message": "El servidor ya estaba detenido"}

        self.state = ProcessState.STOPPING
        try:
            self.proc.terminate()
            # esperar hasta timeout
            for _ in range(self.settings.stop_timeout):
                if self.proc.poll() is not None:
                    break
                await asyncio.sleep(1)
            if self.proc.poll() is None:
                self.proc.kill()
        except Exception as e:
            log.error("Error deteniendo el servidor: %s", e)
        finally:
            self.state = ProcessState.STOPPED
            self._remove_lock()
            if self.playit_proc and self.playit_proc.poll() is None:
                self.playit_proc.kill()
                self.playit_proc = None

        return {"ok": True, "message": "Servidor detenido"}

    async def kill(self) -> dict:
        if self.proc and self.proc.poll() is None:
            try:
                self.proc.kill()
            except Exception:
                pass
        if self.playit_proc and self.playit_proc.poll() is None:
            try:
                self.playit_proc.kill()
            except Exception:
                pass
        self.state = ProcessState.STOPPED
        self._remove_lock()
        return {"ok": True, "message": "Procesos finalizados forzosamente"}

    async def restart(self) -> dict:
        await self.stop()
        await asyncio.sleep(1)
        return await self.start()
