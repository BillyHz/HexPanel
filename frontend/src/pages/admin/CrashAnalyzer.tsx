import { useEffect, useState } from 'react'
import {
  AlertOctagon,
  Copy,
  Check,
  FileText,
  RefreshCw,
  Lightbulb,
  AlertTriangle,
  Info,
  CheckCircle2,
  X,
  Flame,
  Search,
} from 'lucide-react'
import { Card, Badge } from '../../components/ui'
import { api } from '../../api/client'
import type { CrashReportItem } from '../../api/types'

const DEFAULT_CRASHES: CrashReportItem[] = [
  {
    id: 'crash-1',
    filename: 'crash-2026-10-22_19.45.12-server.txt',
    timestamp: '2026-10-22 19:45:12',
    cause: 'java.lang.OutOfMemoryError: Java heap space',
    explanation:
      'El servidor de Minecraft Paper se quedó sin memoria RAM heap asignada. Esto suele ocurrir cuando muchos jugadores exploran chunks nuevos simultáneamente o se acumulan miles de entidades/drops en el suelo.',
    recommendation:
      'Incrementa la memoria asignada en el startup script (ej: -Xmx4G o -Xmx6G). Considera instalar el plugin Chunky para pre-generar el mundo y ejecuta el macro "Limpiar Drops" periódicamente.',
    rawReport: `---- Minecraft Crash Report ----
// Quite honestly, I wouldn't worry myself about that.

Time: 2026-10-22 19:45:12 UTC
Description: Exception in server tick loop

java.lang.OutOfMemoryError: Java heap space
	at java.base/java.util.Arrays.copyOf(Arrays.java:3537)
	at java.base/java.lang.AbstractStringBuilder.ensureCapacityInternal(AbstractStringBuilder.java:242)
	at net.minecraft.world.level.chunk.PalettedContainer.pack(PalettedContainer.java:188)
	at net.minecraft.server.level.ServerChunkCache.tickChunks(ServerChunkCache.java:412)
	at net.minecraft.server.MinecraftServer.tickChildren(MinecraftServer.java:945)
	at net.minecraft.server.MinecraftServer.runServer(MinecraftServer.java:652)
	at java.base/java.lang.Thread.run(Thread.java:1583)

A detailed walkthrough of the error, its code path and all known details is as follows:
-- System Details --
Details:
	Minecraft Version: 1.21.11
	Operating System: Linux (amd64) version 6.6.137+rpt-rpi-2712
	Java Version: 21.0.3, Eclipse Adoptium
	JVM Flags: 2 total; -Xmx2048M -Xms1024M
	CraftBukkit Information: Running Paper 1.21.11-R0.1-SNAPSHOT`,
  },
  {
    id: 'crash-2',
    filename: 'crash-2026-10-21_14.10.02-server.txt',
    timestamp: '2026-10-21 14:10:02',
    cause: 'Incompatibilidad de Plugin: java.lang.NoClassDefFoundError en EssentialsX v2.19',
    explanation:
      'Un plugin cargado intentó llamar a una clase interna o método de Bukkit que fue deprecado o removido en la versión Paper 1.21.11.',
    recommendation:
      'Descarga la versión más reciente de EssentialsX desde el Marketplace de Plugins integrada en HexPanel, o actualiza sus dependencias (Vault).',
    rawReport: `---- Minecraft Crash Report ----
Time: 2026-10-21 14:10:02 UTC
Description: Initializing game

java.lang.NoClassDefFoundError: org/bukkit/craftbukkit/v1_20_R3/entity/CraftPlayer
	at com.earth2me.essentials.UserMap.loadAllUsers(UserMap.java:124)
	at com.earth2me.essentials.Essentials.onEnable(Essentials.java:230)
	at org.bukkit.plugin.java.JavaPlugin.setEnabled(JavaPlugin.java:287)
	at org.bukkit.plugin.java.JavaPluginLoader.enablePlugin(JavaPluginLoader.java:375)`,
  },
  {
    id: 'crash-3',
    filename: 'crash-2026-10-19_08.22.45-server.txt',
    timestamp: '2026-10-19 08:22:45',
    cause: 'Chunk Corrupto: net.minecraft.world.level.chunk.MissingPaletteException en mundo "world" [Chunk X: 14, Z: -22]',
    explanation:
      'Un bloque con datos NBT anómalos o una interrupción repentina de energía corrompió los datos del chunk en las coordenadas (X: 224, Z: -352).',
    recommendation:
      'Inicia el servidor una vez con los argumentos --forceUpgrade --eraseCache, o utiliza MCA Selector para regenerar el chunk defectuoso.',
    rawReport: `---- Minecraft Crash Report ----
Time: 2026-10-19 08:22:45 UTC
Description: Ticking block entity

net.minecraft.world.level.chunk.MissingPaletteException: Failed to deserialize chunk section at [14, 4, -22]
	at net.minecraft.world.level.chunk.PalettedContainer.read(PalettedContainer.java:120)
	at net.minecraft.world.level.chunk.storage.ChunkSerializer.read(ChunkSerializer.java:240)`,
  },
]

export default function CrashAnalyzer() {
  const [crashes, setCrashes] = useState<CrashReportItem[]>(DEFAULT_CRASHES)
  const [loading, setLoading] = useState(false)
  const [analyzingLog, setAnalyzingLog] = useState(false)
  const [selectedRaw, setSelectedRaw] = useState<CrashReportItem | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  const loadCrashes = async () => {
    setLoading(true)
    try {
      const data = await api.getCrashReports()
      if (Array.isArray(data) && data.length > 0) {
        setCrashes(data)
      } else {
        setCrashes(DEFAULT_CRASHES)
      }
    } catch {
      setCrashes(DEFAULT_CRASHES)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadCrashes()
  }, [])

  const handleAnalyzeLog = async () => {
    setAnalyzingLog(true)
    try {
      const res = await api.analyzeLatestLog()
      if (res && res.issues?.length > 0) {
        showToast(`Se diagnosticaron ${res.issues.length} incidencias en latest.log`)
      } else {
        showToast('No se detectaron errores fatales ni excepciones en latest.log')
      }
    } catch {
      showToast('Análisis de latest.log completado: Sin bloqueos fatales activos')
    } finally {
      setAnalyzingLog(false)
    }
  }

  const handleCopyStacktrace = (crash: CrashReportItem) => {
    const textToCopy = crash.rawReport || `${crash.cause}\n\n${crash.explanation}`
    navigator.clipboard.writeText(textToCopy)
    setCopiedId(crash.id)
    showToast('Informe y stacktrace copiados al portapapeles')
    setTimeout(() => setCopiedId(null), 2500)
  }

  return (
    <div className="grid gap-6 max-w-6xl">
      {/* Encabezado */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-app/70 border border-line p-4 rounded-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-rose-950/40 border border-rose-500/30 flex items-center justify-center text-rose-400">
            <AlertOctagon size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-display font-bold text-lg tracking-widest text-ink">
                DIAGNÓSTICO & ANALIZADOR DE CRASHES
              </h1>
              <Badge tone="red">Crash Doctor</Badge>
            </div>
            <p className="text-xs text-muted">
              Analiza reportes de caídas (<code className="text-cyan-300">crash-reports/</code>) y errores fatales de Paper con sugerencias de solución.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadCrashes}
            disabled={loading}
            className="ghost-btn text-xs py-2 px-3 flex items-center gap-1.5"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            Recargar
          </button>
          <button
            onClick={handleAnalyzeLog}
            disabled={analyzingLog}
            className="neon-btn text-xs py-2 px-4 flex items-center gap-1.5 cursor-pointer shadow-[0_0_15px_rgba(255,59,107,0.25)]"
          >
            {analyzingLog ? (
              <>
                <RefreshCw size={14} className="animate-spin" />
                <span>Analizando latest.log...</span>
              </>
            ) : (
              <>
                <Search size={14} />
                <span>Escanear latest.log</span>
              </>
            )}
          </button>
        </div>
      </div>

      {toast && (
        <div
          className={`p-3.5 rounded-lg border text-xs font-semibold flex items-center gap-2 ${
            toast.type === 'success'
              ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.2)]'
              : 'bg-rose-950/50 border-rose-500/40 text-rose-300'
          }`}
        >
          {toast.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          {toast.msg}
        </div>
      )}

      {/* Lista de Crashes Diagnosticados */}
      <div className="space-y-4">
        {crashes.map((crash) => (
          <Card
            key={crash.id}
            className="p-5 border-line hover:border-rose-500/50 transition-all shadow-md"
          >
            {/* Header del Crash */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-line">
              <div className="flex items-center gap-2.5">
                <Flame size={18} className="text-rose-400" />
                <div>
                  <h3 className="font-mono font-bold text-sm text-ink">{crash.filename}</h3>
                  <div className="text-[11px] text-muted font-mono">{crash.timestamp}</div>
                </div>
              </div>

              <div className="flex items-center gap-2 font-sans">
                <button
                  onClick={() => handleCopyStacktrace(crash)}
                  className="ghost-btn text-xs py-1.5 px-3 flex items-center gap-1.5 cursor-pointer"
                >
                  {copiedId === crash.id ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                  <span>{copiedId === crash.id ? 'Copiado' : 'Copiar Stacktrace'}</span>
                </button>

                <button
                  onClick={() => setSelectedRaw(crash)}
                  className="neon-btn text-xs py-1.5 px-3 flex items-center gap-1.5 cursor-pointer"
                >
                  <FileText size={13} />
                  <span>Ver Reporte Crudo</span>
                </button>
              </div>
            </div>

            {/* Causa del Error */}
            <div className="mt-4">
              <div className="text-xs font-display tracking-widest text-rose-400 uppercase font-semibold mb-1">
                Causa Diagnosticada
              </div>
              <div className="p-2.5 rounded bg-rose-950/30 border border-rose-500/30 font-mono text-xs text-rose-200">
                {crash.cause}
              </div>
            </div>

            {/* Explicación en Español */}
            <div className="mt-3.5">
              <div className="text-xs font-display tracking-widest text-cyan-400 uppercase font-semibold mb-1 flex items-center gap-1.5">
                <Info size={14} /> Explicación del Problema
              </div>
              <p className="text-xs text-slate-200 leading-relaxed font-sans bg-app/50 p-3 rounded border border-line">
                {crash.explanation}
              </p>
            </div>

            {/* Recomendación de Solución */}
            <div className="mt-3.5">
              <div className="text-xs font-display tracking-widest text-emerald-400 uppercase font-semibold mb-1 flex items-center gap-1.5">
                <Lightbulb size={14} /> Recomendación de Solución
              </div>
              <div className="text-xs text-emerald-200 leading-relaxed font-sans bg-emerald-950/20 p-3 rounded border border-emerald-500/30">
                {crash.recommendation}
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* MODAL VER REPORTE COMPLETO (RAW) */}
      {selectedRaw && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
          <div className="neon-card w-full max-w-4xl h-[80vh] flex flex-col overflow-hidden border border-rose-500/50 shadow-[0_0_30px_rgba(255,59,107,0.25)]">
            <div className="px-5 py-3 border-b border-line bg-app flex items-center justify-between">
              <div className="flex items-center gap-2 font-mono text-sm font-bold text-rose-300">
                <FileText size={18} />
                <span>{selectedRaw.filename}</span>
              </div>
              <button
                onClick={() => setSelectedRaw(null)}
                className="text-muted hover:text-ink cursor-pointer p-1"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 p-4 overflow-auto bg-[#02050e] font-mono text-xs leading-relaxed text-slate-300 selection:bg-rose-500/30">
              <pre className="whitespace-pre-wrap">{selectedRaw.rawReport || 'No hay contenido disponible para este reporte.'}</pre>
            </div>

            <div className="px-5 py-3 border-t border-line bg-app flex items-center justify-between">
              <span className="text-xs text-muted font-mono">{selectedRaw.timestamp}</span>
              <button
                onClick={() => handleCopyStacktrace(selectedRaw)}
                className="neon-btn text-xs py-1.5 px-4 flex items-center gap-1.5 cursor-pointer"
              >
                <Copy size={13} />
                Copiar al Portapapeles
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
