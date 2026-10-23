import { useState, useEffect } from 'react'
import {
  ExternalLink,
  Maximize2,
  Minimize2,
  Settings,
  RefreshCw,
  Compass,
  Play,
  Pause,
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  Loader2,
  PackagePlus,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { Card, Badge } from '../../components/ui'
import { api } from '../../api/client'

const DEFAULT_MAP_URL = 'http://100.72.184.60:8100'

interface MapStatus {
  installed: boolean
  plugin_name: string
  online: boolean
  url: string
  enabled: boolean
}

export default function ServerMap() {
  const [mapUrl, setMapUrl] = useState(() => {
    return localStorage.getItem('hexpanel_map_url') || DEFAULT_MAP_URL
  })
  const [inputUrl, setInputUrl] = useState(mapUrl)
  const [isConfigOpen, setIsConfigOpen] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [iframeKey, setIframeKey] = useState(0)
  const [isIframeLoading, setIsIframeLoading] = useState(true)
  const [forceLoad, setForceLoad] = useState(false)

  const [status, setStatus] = useState<MapStatus | null>(null)
  const [isCheckingStatus, setIsCheckingStatus] = useState(true)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [isExecutingAction, setIsExecutingAction] = useState(false)

  // 1. Cargar configuración y verificar estado del servidor de mapas
  const checkStatus = async () => {
    setIsCheckingStatus(true)
    try {
      const cfg = await api.getMapConfig().catch(() => null)
      if (cfg?.url && cfg.url !== mapUrl) {
        setMapUrl(cfg.url)
        setInputUrl(cfg.url)
      }
      const st = await api.getMapStatus().catch(() => null)
      if (st) {
        setStatus(st)
        if (st.online) {
          setForceLoad(true)
        }
      }
    } catch {
      // Fallback
    } finally {
      setIsCheckingStatus(false)
    }
  }

  useEffect(() => {
    checkStatus()
  }, [])

  useEffect(() => {
    localStorage.setItem('hexpanel_map_url', mapUrl)
  }, [mapUrl])

  const handleSaveUrl = async (e: React.FormEvent) => {
    e.preventDefault()
    let clean = inputUrl.trim()
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
      clean = `http://${clean}`
    }
    setMapUrl(clean)
    setIsConfigOpen(false)
    setIframeKey((k) => k + 1)
    setIsIframeLoading(true)
    setForceLoad(true)
    try {
      await api.updateMapConfig(clean)
      await checkStatus()
    } catch (err) {
      console.error('Error guardando configuración de mapa:', err)
    }
  }

  const handleResetDefault = async () => {
    setInputUrl(DEFAULT_MAP_URL)
    setMapUrl(DEFAULT_MAP_URL)
    setIsConfigOpen(false)
    setIframeKey((k) => k + 1)
    setIsIframeLoading(true)
    setForceLoad(true)
    try {
      await api.updateMapConfig(DEFAULT_MAP_URL)
      await checkStatus()
    } catch (err) {
      console.error(err)
    }
  }

  const handleAction = async (action: 'render' | 'pause' | 'reload') => {
    setIsExecutingAction(true)
    setActionMessage(null)
    try {
      await api.triggerMapAction(action)
      if (action === 'render') {
        setActionMessage('Iniciado renderizado 3D de BlueMap para "world". Revisa el progreso en la consola.')
      } else if (action === 'pause') {
        setActionMessage('Renderizado de BlueMap pausado.')
      } else if (action === 'reload') {
        setActionMessage('Configuración de BlueMap recargada con éxito.')
        setTimeout(() => setIframeKey((k) => k + 1), 1500)
      }
    } catch (err: any) {
      setActionMessage(`Error: ${err?.message || 'No se pudo ejecutar la acción'}`)
    } finally {
      setIsExecutingAction(false)
      setTimeout(() => setActionMessage(null), 6000)
    }
  }

  const isOnline = status?.online || forceLoad

  return (
    <div
      className={`grid gap-4 ${
        isFullscreen
          ? 'fixed inset-0 z-50 p-4 bg-black/95 backdrop-blur-md h-screen'
          : 'h-[calc(100vh-6.5rem)]'
      }`}
    >
      {/* Barra de control superior */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-app/80 border border-line p-3 rounded-xl shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-cyan-950/40 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
            <Compass size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-display font-bold text-sm tracking-widest text-ink">
                MAPA 3D EN TIEMPO REAL
              </h1>
              {isCheckingStatus ? (
                <Badge tone="blue">Verificando...</Badge>
              ) : status?.online ? (
                <Badge tone="green">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse mr-1 inline-block" />
                  {status.plugin_name} En Línea
                </Badge>
              ) : status?.installed ? (
                <Badge tone="yellow">Iniciando / Puerto 8100</Badge>
              ) : (
                <Badge tone="red">Plugin no instalado</Badge>
              )}
            </div>
            <div className="text-[11px] text-muted font-mono truncate max-w-sm">
              {mapUrl}
            </div>
          </div>
        </div>

        {/* Acciones de BlueMap */}
        <div className="flex flex-wrap items-center gap-2 font-sans">
          {status?.online && (
            <div className="flex items-center gap-1.5 mr-2 pr-2 border-r border-line">
              <button
                onClick={() => handleAction('render')}
                disabled={isExecutingAction}
                className="ghost-btn text-xs py-1.5 px-2.5 flex items-center gap-1 text-cyan-300 hover:text-cyan-200"
                title="Iniciar renderizado 3D del mapa (/bluemap render world)"
              >
                <Play size={12} className="text-emerald-400" />
                <span className="hidden sm:inline">Renderizar 3D</span>
              </button>
              <button
                onClick={() => handleAction('pause')}
                disabled={isExecutingAction}
                className="ghost-btn text-xs py-1.5 px-2.5 flex items-center gap-1 text-amber-300 hover:text-amber-200"
                title="Pausar renderizado de BlueMap"
              >
                <Pause size={12} className="text-amber-400" />
                <span className="hidden sm:inline">Pausar</span>
              </button>
            </div>
          )}

          <button
            onClick={() => setIsConfigOpen(!isConfigOpen)}
            className="ghost-btn text-xs py-1.5 px-3 flex items-center gap-1.5"
            title="Configurar dirección del mapa"
          >
            <Settings size={13} />
            <span>Configurar URL</span>
          </button>

          <button
            onClick={() => {
              checkStatus()
              setIframeKey((k) => k + 1)
              setIsIframeLoading(true)
            }}
            className="ghost-btn text-xs py-1.5 px-2.5"
            title="Recargar vista y verificar conexión"
          >
            <RefreshCw size={13} className={isCheckingStatus ? 'animate-spin' : ''} />
          </button>

          <a
            href={mapUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="ghost-btn text-xs py-1.5 px-3 flex items-center gap-1.5 text-cyan-300 hover:border-cyan-400"
            title="Abrir mapa en pestaña completa"
          >
            <ExternalLink size={13} />
            <span>Nueva Pestaña</span>
          </a>

          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="neon-btn text-xs py-1.5 px-3 flex items-center gap-1.5 cursor-pointer"
            title={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
          >
            {isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            <span>{isFullscreen ? 'Normal' : 'Maximizar'}</span>
          </button>
        </div>
      </div>

      {/* Notificación de acciones ejecutadas */}
      {actionMessage && (
        <div className="bg-cyan-950/60 border border-cyan-500/40 px-4 py-2 rounded-lg text-xs font-mono text-cyan-300 flex items-center gap-2">
          <CheckCircle2 size={14} className="text-cyan-400 shrink-0" />
          <span>{actionMessage}</span>
        </div>
      )}

      {/* Modal de Configuración de URL del Mapa */}
      {isConfigOpen && (
        <Card className="p-4 border-cyan-500/40 shrink-0">
          <form onSubmit={handleSaveUrl} className="flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[260px]">
              <label className="block text-xs font-semibold text-ink uppercase tracking-wider mb-1">
                Dirección Web del Mapa BlueMap o Dynmap:
              </label>
              <input
                type="text"
                value={inputUrl}
                onChange={(e) => setInputUrl(e.target.value)}
                placeholder="http://100.72.184.60:8100 o https://map.tudominio.com"
                className="w-full bg-app border border-line rounded-lg p-2 font-mono text-xs text-ink outline-none focus:border-neon"
              />
            </div>
            <div className="flex items-center gap-2 self-end">
              <button
                type="button"
                onClick={handleResetDefault}
                className="ghost-btn text-xs py-2 px-3"
              >
                Resetear Default
              </button>
              <button type="submit" className="neon-btn text-xs py-2 px-4 cursor-pointer">
                Guardar y Conectar
              </button>
            </div>
          </form>
        </Card>
      )}

      {/* Contenedor del mapa o Pantalla de Diagnóstico */}
      <Card className="p-0 overflow-hidden border border-line flex-1 flex flex-col relative min-h-[400px] bg-[#02050e]">
        {!isOnline && !isCheckingStatus ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-radial from-[#0a1226] to-[#02050e]">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-4 shadow-[0_0_20px_rgba(245,158,11,0.15)]">
              <AlertTriangle size={32} />
            </div>

            <h2 className="font-display font-bold text-lg text-ink tracking-wider mb-2">
              {status?.installed
                ? 'EL MAPA WEB AÚN NO RESPONDE'
                : 'PLUGIN DE MAPA 3D NO INSTALADO'}
            </h2>

            <p className="text-muted text-xs max-w-md mb-6 leading-relaxed">
              {status?.installed
                ? `El plugin ${status.plugin_name} está detectado, pero el servidor web no está respondiendo en ${mapUrl}. Puede estar terminando de cargar los chunks iniciales o el puerto 8100 necesita unos segundos.`
                : 'Para ver el mapa 3D interactivo en tiempo real se requiere un plugin de renderizado como BlueMap o Dynmap instalado en el servidor Paper.'}
            </p>

            <div className="flex flex-wrap items-center justify-center gap-3">
              {!status?.installed && (
                <Link
                  to="/admin/plugins"
                  className="neon-btn text-xs py-2 px-4 flex items-center gap-2"
                >
                  <PackagePlus size={14} />
                  <span>Explorar e Instalar BlueMap en Plugins</span>
                </Link>
              )}

              <button
                onClick={() => {
                  checkStatus()
                  setIframeKey((k) => k + 1)
                }}
                className="ghost-btn text-xs py-2 px-4 flex items-center gap-2"
              >
                <RotateCcw size={14} />
                <span>Reintentar Conexión</span>
              </button>

              <button
                onClick={() => setForceLoad(true)}
                className="ghost-btn text-xs py-2 px-4 text-cyan-300 border-cyan-500/30 hover:border-cyan-400"
              >
                Forzar Carga en Iframe
              </button>
            </div>
          </div>
        ) : (
          <div className="relative w-full h-full flex-1 flex flex-col bg-[#02050e]">
            {isIframeLoading && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#02050e]/90 backdrop-blur-xs text-cyan-400">
                <Loader2 size={36} className="animate-spin mb-3 text-neon" />
                <span className="font-mono text-xs tracking-wider text-slate-300">
                  Cargando entorno 3D de BlueMap...
                </span>
              </div>
            )}

            <iframe
              key={iframeKey}
              src={mapUrl}
              title="Minecraft 3D Map (BlueMap / Dynmap)"
              className="w-full h-full border-0 flex-1 bg-[#02050e]"
              style={{ backgroundColor: '#02050e' }}
              onLoad={() => setIsIframeLoading(false)}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            />

            {/* Overlay informativo en la esquina inferior */}
            <div className="absolute bottom-3 left-3 pointer-events-none bg-app/80 backdrop-blur-xs border border-line px-3 py-1.5 rounded-lg text-[11px] font-mono text-slate-300 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_#10b981]" />
              <span>Sincronización {status?.plugin_name || 'BlueMap 3D'} Activa</span>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
