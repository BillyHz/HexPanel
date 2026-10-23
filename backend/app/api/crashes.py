"""API for crash report analysis and error diagnostics."""
from __future__ import annotations

import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from app.core.config import get_settings
from app.core.permissions import SERVER_VIEW
from app.core.security import Ctx, require

router = APIRouter(prefix="/server/crashes", tags=["crashes"])


def diagnose_crash_text(content: str) -> tuple[str, str]:
    """Aplica heurísticas basadas en reglas para diagnosticar la causa y dar recomendaciones."""
    if "OutOfMemoryError" in content or "Java heap space" in content:
        return (
            "Falta de memoria RAM asignada a Java (OutOfMemoryError)",
            "Aumentar la memoria máxima asignada (-Xmx) en los argumentos de inicio de Java (ej. -Xmx4G o -Xmx6G).",
        )
    if "UnsupportedClassVersionError" in content or "compiled by a more recent version" in content:
        return (
            "Versión de Java incompatible (UnsupportedClassVersionError)",
            "Minecraft 1.21 requiere Java 21 o superior. Comprueba que el runtime de Java instalado sea versión 21+.",
        )
    if "NoSuchMethodError" in content or "Could not load plugin" in content or "ClassNotFoundException" in content:
        return (
            "Plugin obsoleto o incompatible con Paper 1.21",
            "Uno de los plugins instalados hace referencia a métodos obsoletos. Actualiza los plugins a su última versión compatible con 1.21 o retíralos.",
        )
    if "corrupted" in content.lower() or "chunk file" in content.lower():
        return (
            "Chunk corrupto en el mundo",
            "Restaura una copia de seguridad reciente del mundo o utiliza MCA Selector para reparar o regenerar el chunk corrupto.",
        )
    if "Address already in use" in content:
        return (
            "Puerto del servidor ya está en uso (Address already in use)",
            "El puerto (ej. 25565) ya está ocupado por otra instancia o proceso. Finaliza el proceso anterior o modifica 'server-port' en server.properties.",
        )
    if "BindException" in content:
        return (
            "Fallo al enlazar dirección de red (BindException)",
            "Verifica el parámetro 'server-ip' en server.properties; en la mayoría de configuraciones debe dejarse en blanco.",
        )
    if "Watchdog" in content or "Server-hang" in content:
        return (
            "Servidor congelado / Sobrecargado (Watchdog timeout)",
            "El tick principal se congeló durante más de 60 segundos. Posibles causas: bucle infinito en plugins o saturación masiva de entidades.",
        )
    return (
        "Error genérico o excepción no categorizada",
        "Revisa el stacktrace detallado para identificar la clase o plugin específico involucrado.",
    )


@router.get("")
def list_crashes(
    ctx: Ctx = Depends(require(SERVER_VIEW)),
):
    """Lee reportes de crash-reports/ y errores críticos recientes en logs/latest.log."""
    settings = get_settings()
    server_dir = settings.server_dir
    reports = []

    # 1. Leer crash-reports/*.txt
    crash_dir = server_dir / "crash-reports"
    if crash_dir.is_dir():
        for file in crash_dir.glob("crash-*.txt"):
            try:
                stat = file.stat()
                with open(file, "r", encoding="utf-8", errors="replace") as f:
                    content = f.read(16384)  # primeros 16KB

                cause, rec = diagnose_crash_text(content)
                first_lines = [l.strip() for l in content.splitlines() if l.strip()][:5]
                excerpt = "\n".join(first_lines)

                reports.append({
                    "id": file.name,
                    "filename": file.name,
                    "source": "crash-report",
                    "title": f"Crash Report: {file.name}",
                    "date": datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
                    "excerpt": excerpt,
                    "diagnosed_cause": cause,
                    "recommendation": rec,
                })
            except Exception:
                continue

    # 2. Analizar errores en logs/latest.log si existe
    log_file = server_dir / "logs" / "latest.log"
    if log_file.is_file():
        try:
            with open(log_file, "r", encoding="utf-8", errors="replace") as f:
                lines = f.readlines()

            # Buscar bloques de ERROR o Exception en las últimas 500 líneas
            tail_lines = lines[-500:]
            error_blocks = []
            current_block = []
            for line in tail_lines:
                if "ERROR" in line or "Exception" in line or "FATAL" in line:
                    current_block.append(line)
                elif current_block and line.startswith("\tat "):
                    current_block.append(line)
                elif current_block:
                    if len(current_block) >= 2:
                        error_blocks.append("".join(current_block[:25]))
                    current_block = []

            if current_block and len(current_block) >= 2:
                error_blocks.append("".join(current_block[:25]))

            # Si hay errores en latest.log, agregar los más relevantes
            for idx, block in enumerate(error_blocks[-3:]):
                cause, rec = diagnose_crash_text(block)
                if cause != "Error genérico o excepción no categorizada":
                    reports.append({
                        "id": f"log-error-{idx}",
                        "filename": "logs/latest.log",
                        "source": "latest.log",
                        "title": f"Alerta en latest.log: {cause[:40]}",
                        "date": datetime.now(timezone.utc).isoformat(),
                        "excerpt": block[:500],
                        "diagnosed_cause": cause,
                        "recommendation": rec,
                    })
        except Exception:
            pass

    # Ordenar por fecha descendente
    reports.sort(key=lambda x: x["date"], reverse=True)
    return reports


@router.get("/{filename}")
def get_crash_report_detail(
    filename: str,
    ctx: Ctx = Depends(require(SERVER_VIEW)),
):
    """Devuelve el contenido completo de un reporte de caída."""
    clean = Path(filename).name
    if clean != filename or ".." in filename:
        raise HTTPException(400, "Nombre de archivo inválido")

    settings = get_settings()
    file_path = settings.server_dir / "crash-reports" / clean

    if not file_path.is_file():
        raise HTTPException(404, "Reporte de caída no encontrado")

    try:
        with open(file_path, "r", encoding="utf-8", errors="replace") as f:
            full_content = f.read()
    except Exception as e:
        raise HTTPException(500, f"Error al leer el archivo: {e}")

    cause, rec = diagnose_crash_text(full_content)
    return {
        "filename": clean,
        "content": full_content,
        "diagnosed_cause": cause,
        "recommendation": rec,
    }
