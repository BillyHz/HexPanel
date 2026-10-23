import { useState, useEffect } from 'react'
import {
    ExternalLink,
  Maximize2,
  Minimize2,
  Settings,
  RefreshCw,
  Compass,
  } from 'lucide-react'
import { Card, Badge } from '../../components/ui'

const DEFAULT_MAP_URL = 'http://100.72.184.60:8100'

export default function ServerMap() {
  const [mapUrl, setMapUrl] = useState(() => {
    return localStorage.getItem('hexpanel_map_url') || DEFAULT_MAP_URL
  })
  const [inputUrl, setInputUrl] = useState(mapUrl)
  const [isConfigOpen, setIsConfigOpen] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [iframeKey, setIframeKey] = useState(0)

  useEffect(() => {
    localStorage.setItem('hexpanel_map_url', mapUrl)
  }, [mapUrl])

  const handleSaveUrl = (e: React.FormEvent) => {
    e.preventDefault()
    let clean = inputUrl.trim()
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
      clean = `http://${clean}`
    }
    setMapUrl(clean)
    setIsConfigOpen(false)
    setIframeKey((k) => k + 1)
  }

  const handleResetDefault = () => {
    setInputUrl(DEFAULT_MAP_URL)
    setMapUrl(DEFAULT_MAP_URL)
    setIsConfigOpen(false)
    setIframeKey((k) => k + 1)
  }

  return (
    <div
      className={`grid gap-4 ${
        isFullscreen
          ? 'fixed inset-0 z-50 p-4 bg-black/90 backdrop-blur-md h-screen'
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
              <Badge tone="blue">BlueMap / Dynmap</Badge>
            </div>
            <div className="text-[11px] text-muted font-mono truncate max-w-sm">
              {mapUrl}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 font-sans">
          <button
            onClick={() => setIsConfigOpen(!isConfigOpen)}
            className="ghost-btn text-xs py-1.5 px-3 flex items-center gap-1.5"
            title="Configurar dirección del mapa"
          >
            <Settings size={13} />
            <span>Configurar URL</span>
          </button>

          <button
            onClick={() => setIframeKey((k) => k + 1)}
            className="ghost-btn text-xs py-1.5 px-2.5"
            title="Recargar vista del mapa"
          >
            <RefreshCw size={13} />
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

      {/* Contenedor responsivo del mapa 3D interactivo */}
      <Card className="p-0 overflow-hidden border border-line flex-1 flex flex-col relative min-h-[400px]">
        <iframe
          key={iframeKey}
          src={mapUrl}
          title="Minecraft 3D Map (BlueMap / Dynmap)"
          className="w-full h-full border-0 flex-1 bg-[#02050e]"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        />

        {/* Overlay informativo en la esquina inferior */}
        <div className="absolute bottom-3 left-3 pointer-events-none bg-app/80 backdrop-blur-xs border border-line px-3 py-1.5 rounded-lg text-[11px] font-mono text-slate-300 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_#10b981]" />
          <span>Sincronización BlueMap 3D</span>
        </div>
      </Card>
    </div>
  )
}
