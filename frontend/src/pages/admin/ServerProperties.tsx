import { useEffect, useState, useRef } from 'react'
import {
    Save,
  Image as ImageIcon,
  Upload,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Sliders,
  ShieldAlert,
  Globe,
  Settings,
  Flame,
} from 'lucide-react'
import { Card, Badge } from '../../components/ui'
import { api } from '../../api/client'
import type { ServerPropertiesData } from '../../api/types'

// Códigos de formato Minecraft
const MC_COLORS = [
  { code: '§0', name: 'Negro', bg: '#000000', text: '#ffffff' },
  { code: '§1', name: 'Azul Osc.', bg: '#0000aa', text: '#ffffff' },
  { code: '§2', name: 'Verde Osc.', bg: '#00aa00', text: '#ffffff' },
  { code: '§3', name: 'Aqua Osc.', bg: '#00aaaa', text: '#ffffff' },
  { code: '§4', name: 'Rojo Osc.', bg: '#aa0000', text: '#ffffff' },
  { code: '§5', name: 'Morado', bg: '#aa00aa', text: '#ffffff' },
  { code: '§6', name: 'Dorado', bg: '#ffaa00', text: '#000000' },
  { code: '§7', name: 'Gris', bg: '#aaaaaa', text: '#000000' },
  { code: '§8', name: 'Gris Osc.', bg: '#555555', text: '#ffffff' },
  { code: '§9', name: 'Azul', bg: '#5555ff', text: '#ffffff' },
  { code: '§a', name: 'Verde', bg: '#55ff55', text: '#000000' },
  { code: '§b', name: 'Aqua', bg: '#55ffff', text: '#000000' },
  { code: '§c', name: 'Rojo', bg: '#ff5555', text: '#ffffff' },
  { code: '§d', name: 'Rosa', bg: '#ff55ff', text: '#000000' },
  { code: '§e', name: 'Amarillo', bg: '#ffff55', text: '#000000' },
  { code: '§f', name: 'Blanco', bg: '#ffffff', text: '#000000' },
]

const MC_FORMATS = [
  { code: '§l', name: 'Negrita', label: 'B' },
  { code: '§o', name: 'Cursiva', label: 'I' },
  { code: '§n', name: 'Subrayado', label: 'U' },
  { code: '§m', name: 'Tachado', label: 'S' },
  { code: '§r', name: 'Resetear Formato', label: '§r' },
]

const COLOR_MAP: Record<string, string> = {
  '0': '#000000',
  '1': '#0000aa',
  '2': '#00aa00',
  '3': '#00aaaa',
  '4': '#aa0000',
  '5': '#aa00aa',
  '6': '#ffaa00',
  '7': '#aaaaaa',
  '8': '#555555',
  '9': '#5555ff',
  'a': '#55ff55',
  'b': '#55ffff',
  'c': '#ff5555',
  'd': '#ff55ff',
  'e': '#ffff55',
  'f': '#ffffff',
}

// Convertidor de MOTD Minecraft (§ o &) a elementos HTML con estilos
function parseMinecraftFormatting(rawText: string) {
  // Reemplazar saltos de línea literales \n
  const lines = rawText.replace(/\\n/g, '\n').split('\n')

  return lines.map((line, lineIdx) => {
    const parts: { text: string; color: string; bold: boolean; italic: boolean; underline: boolean; strike: boolean }[] = []
    let currentColor = '#ffffff'
    let currentBold = false
    let currentItalic = false
    let currentUnderline = false
    let currentStrike = false

    let buffer = ''

    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      const nextChar = line[i + 1]?.toLowerCase()

      if ((char === '§' || char === '&') && nextChar && ((nextChar >= '0' && nextChar <= '9') || (nextChar >= 'a' && nextChar <= 'f') || 'lornm'.includes(nextChar))) {
        if (buffer) {
          parts.push({
            text: buffer,
            color: currentColor,
            bold: currentBold,
            italic: currentItalic,
            underline: currentUnderline,
            strike: currentStrike,
          })
          buffer = ''
        }

        if (COLOR_MAP[nextChar]) {
          currentColor = COLOR_MAP[nextChar]
          currentBold = false
          currentItalic = false
          currentUnderline = false
          currentStrike = false
        } else if (nextChar === 'l') {
          currentBold = true
        } else if (nextChar === 'o') {
          currentItalic = true
        } else if (nextChar === 'n') {
          currentUnderline = true
        } else if (nextChar === 'm') {
          currentStrike = true
        } else if (nextChar === 'r') {
          currentColor = '#ffffff'
          currentBold = false
          currentItalic = false
          currentUnderline = false
          currentStrike = false
        }
        i++ // saltar el caracter del código
      } else {
        buffer += char
      }
    }

    if (buffer) {
      parts.push({
        text: buffer,
        color: currentColor,
        bold: currentBold,
        italic: currentItalic,
        underline: currentUnderline,
        strike: currentStrike,
      })
    }

    return (
      <div key={lineIdx} className="min-h-[1.25rem] leading-snug">
        {parts.length === 0 ? (
          <span>&nbsp;</span>
        ) : (
          parts.map((part, pIdx) => (
            <span
              key={pIdx}
              style={{
                color: part.color,
                fontWeight: part.bold ? 'bold' : 'normal',
                fontStyle: part.italic ? 'italic' : 'normal',
                textDecoration: `${part.underline ? 'underline ' : ''}${part.strike ? 'line-through' : ''}`.trim() || undefined,
                textShadow: '1px 1px 0px rgba(0,0,0,0.85)',
              }}
            >
              {part.text}
            </span>
          ))
        )}
      </div>
    )
  })
}

export default function ServerProperties() {
  const [props, setProps] = useState<ServerPropertiesData>({
    motd: '§b§lHexPanel Minecraft Server\\n§7Supervivencia Hardcore & Modded',
    difficulty: 'hard',
    gamemode: 'survival',
    'max-players': 20,
    'view-distance': 10,
    'simulation-distance': 8,
    'spawn-protection': 16,
    'server-port': 25565,
    'level-name': 'world',
    pvp: true,
    'allow-flight': false,
    'allow-nether': true,
    hardcore: false,
    'spawn-monsters': true,
    'spawn-animals': true,
    'online-mode': true,
    'white-list': false,
  })

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [iconUrl, setIconUrl] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const motdInputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  

  const loadProperties = async () => {
    setLoading(true)
    try {
      const data = await api.getServerProperties()
      if (data && typeof data === 'object') {
        setProps((prev) => ({
          ...prev,
          ...data,
          // Normalizar booleanos en caso de que vengan como strings
          pvp: data.pvp === true || data.pvp === 'true',
          'allow-flight': data['allow-flight'] === true || data['allow-flight'] === 'true',
          'allow-nether': data['allow-nether'] === true || data['allow-nether'] === 'true',
          hardcore: data.hardcore === true || data.hardcore === 'true',
          'spawn-monsters': data['spawn-monsters'] === true || data['spawn-monsters'] === 'true',
          'spawn-animals': data['spawn-animals'] === true || data['spawn-animals'] === 'true',
          'online-mode': data['online-mode'] === true || data['online-mode'] === 'true',
          'white-list': data['white-list'] === true || data['white-list'] === 'true',
        }))
      }
    } catch {
      // Usar defaults si aún no hay backend
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadProperties()
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.updateServerProperties(props)
      setToast({ msg: 'Propiedades y MOTD guardados correctamente en server.properties', type: 'success' })
    } catch (err: any) {
      setToast({ msg: `Error al guardar propiedades: ${err.message}`, type: 'error' })
    } finally {
      setSaving(false)
      setTimeout(() => setToast(null), 4000)
    }
  }

  const insertFormattingCode = (code: string) => {
    const el = motdInputRef.current
    if (!el) {
      setProps((p) => ({ ...p, motd: (p.motd || '') + code }))
      return
    }

    const start = el.selectionStart
    const end = el.selectionEnd
    const current = props.motd || ''
    const updated = current.substring(0, start) + code + current.substring(end)
    setProps((p) => ({ ...p, motd: updated }))

    setTimeout(() => {
      el.focus()
      el.setSelectionRange(start + code.length, start + code.length)
    }, 10)
  }

  const handleIconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Preview local
    const reader = new FileReader()
    reader.onload = (event) => {
      setIconUrl(event.target?.result as string)
    }
    reader.readAsDataURL(file)

    try {
      await api.uploadServerIcon(file)
      setToast({ msg: 'server-icon.png actualizado con éxito (64x64)', type: 'success' })
    } catch {
      setToast({ msg: 'Icono guardado para preview local', type: 'success' })
    }
    setTimeout(() => setToast(null), 4000)
  }

  const updateField = (key: string, value: any) => {
    setProps((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <div className="grid gap-6 max-w-6xl">
      {/* Encabezado y barra de acciones */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-app/70 border border-line p-4 rounded-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-cyan-950/40 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
            <Sliders size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-display font-bold text-lg tracking-widest text-ink">
                PROPIEDADES & MOTD DEL SERVIDOR
              </h1>
              <Badge tone="blue">server.properties</Badge>
            </div>
            <p className="text-xs text-muted">
              Ajusta parámetros de jugabilidad, límites de rendimiento y personaliza el banner del navegador multijugador.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadProperties}
            disabled={loading}
            className="ghost-btn text-xs py-2 px-3 flex items-center gap-1.5"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            Recargar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="neon-btn text-xs py-2 px-4 flex items-center gap-1.5"
          >
            <Save size={14} />
            {saving ? 'Guardando...' : 'Guardar Propiedades'}
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

      {/* Editor visual de MOTD y Server Icon */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4 pb-2 border-b border-line">
          <div className="flex items-center gap-2">
            <Globe size={18} className="text-neon" />
            <h2 className="font-display font-bold text-sm tracking-widest text-ink">
              EDITOR DE MOTD & VISTA PREVIA MULTIJUGADOR
            </h2>
          </div>
          <span className="text-xs text-muted font-mono">Formato § y &</span>
        </div>

        {/* Vista previa idéntica a la lista de servidores de Minecraft */}
        <div className="mb-5">
          <div className="text-xs font-display tracking-widest text-muted uppercase mb-2">
            Vista Previa Multijugador en Minecraft
          </div>
          <div
            className="rounded p-3 flex items-center gap-3 border select-none font-mono"
            style={{
              background: '#090a0f',
              borderColor: '#1e293b',
              boxShadow: 'inset 0 0 10px rgba(0,0,0,0.8)',
            }}
          >
            {/* Server Icon 64x64 */}
            <div
              className="w-16 h-16 rounded shrink-0 overflow-hidden border border-slate-700 bg-slate-900 flex items-center justify-center relative group"
              style={{ imageRendering: 'pixelated' }}
            >
              {iconUrl ? (
                <img src={iconUrl} alt="server icon" className="w-full h-full object-cover" />
              ) : (
                <div className="flex flex-col items-center justify-center text-slate-500">
                  <ImageIcon size={24} />
                  <span className="text-[9px] mt-0.5">64x64</span>
                </div>
              )}
            </div>

            {/* MOTD Body */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-sm text-slate-100 tracking-wide font-sans">
                  {props['level-name'] || 'Minecraft Server'}
                </span>
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-slate-400 font-mono">
                    {props['online-players'] || 0}/{props['max-players'] || 20}
                  </span>
                  {/* Señal de ping 5 barras verdes */}
                  <div className="flex items-end gap-0.5 h-3.5" title="Ping: 24 ms">
                    <span className="w-1 h-1 bg-emerald-400 rounded-xs" />
                    <span className="w-1 h-1.5 bg-emerald-400 rounded-xs" />
                    <span className="w-1 h-2 bg-emerald-400 rounded-xs" />
                    <span className="w-1 h-2.5 bg-emerald-400 rounded-xs" />
                    <span className="w-1 h-3.5 bg-emerald-400 rounded-xs shadow-[0_0_4px_#10b981]" />
                  </div>
                </div>
              </div>

              {/* Render de las 2 líneas de MOTD */}
              <div className="text-xs leading-tight font-mono tracking-wide py-0.5">
                {parseMinecraftFormatting(props.motd || 'A Minecraft Server')}
              </div>
            </div>
          </div>
        </div>

        {/* Paleta de botones de colores Minecraft */}
        <div className="mb-4">
          <div className="text-xs text-muted mb-2 font-display uppercase tracking-wider">
            Paleta de Códigos de Color (Inserta §):
          </div>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {MC_COLORS.map((c) => (
              <button
                key={c.code}
                type="button"
                onClick={() => insertFormattingCode(c.code)}
                title={`${c.name} (${c.code})`}
                className="w-7 h-7 rounded text-[11px] font-bold border border-slate-700/80 hover:scale-110 transition-transform cursor-pointer flex items-center justify-center shadow"
                style={{ backgroundColor: c.bg, color: c.text }}
              >
                {c.code.replace('§', '')}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {MC_FORMATS.map((f) => (
              <button
                key={f.code}
                type="button"
                onClick={() => insertFormattingCode(f.code)}
                className="ghost-btn text-xs py-1 px-2.5"
              >
                <span className="font-bold text-neon mr-1">{f.label}</span>
                {f.name}
              </button>
            ))}
          </div>
        </div>

        {/* Input Textarea para MOTD */}
        <div className="grid md:grid-cols-4 gap-4 items-start">
          <div className="md:col-span-3">
            <label className="block text-xs font-semibold text-ink uppercase tracking-wider mb-1.5">
              Texto del MOTD (admite saltos de línea \n):
            </label>
            <textarea
              ref={motdInputRef}
              rows={3}
              value={props.motd || ''}
              onChange={(e) => updateField('motd', e.target.value)}
              placeholder="§b§lHexPanel Server\n§7Modo Supervivencia 1.21.11"
              className="w-full bg-app/80 border border-line rounded-lg p-3 font-mono text-sm outline-none focus:border-neon focus:shadow-[0_0_12px_rgba(0,212,255,0.35)] text-ink placeholder:text-muted/50"
            />
          </div>

          {/* Subida de Server Icon */}
          <div className="md:col-span-1 bg-app/50 border border-line rounded-lg p-3 text-center">
            <label className="block text-xs font-semibold text-ink uppercase tracking-wider mb-2">
              Server Icon (64x64)
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png"
              onChange={handleIconUpload}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="ghost-btn w-full text-xs py-2 flex items-center justify-center gap-1.5"
            >
              <Upload size={14} />
              Subir PNG 64x64
            </button>
            <p className="text-[10px] text-muted mt-2">
              Se guardará como <code className="text-cyan-400">server-icon.png</code> en la raíz.
            </p>
          </div>
        </div>
      </Card>

      {/* Toggles Visuales (Switches) */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4 pb-2 border-b border-line">
          <ShieldAlert size={18} className="text-neon" />
          <h2 className="font-display font-bold text-sm tracking-widest text-ink">
            INTERRUPTORES DE MUNDO Y REGLAS DE JUEGO
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { key: 'pvp', label: 'Combate PvP', desc: 'Permite daño entre jugadores' },
            { key: 'allow-flight', label: 'Vuelo (allow-flight)', desc: 'Permite volar en supervivencia con mods' },
            { key: 'allow-nether', label: 'Dimensión Nether', desc: 'Habilita portales hacia el infierno' },
            { key: 'hardcore', label: 'Modo Hardcore', desc: 'Muerte permanente (banea al morir)', danger: true },
            { key: 'spawn-monsters', label: 'Spawn Monstruos', desc: 'Genera zombies, creepers, etc.' },
            { key: 'spawn-animals', label: 'Spawn Animales', desc: 'Genera vacas, cerdos y ovejas' },
            { key: 'online-mode', label: 'Online Mode (Premium)', desc: 'Verifica cuentas con Mojang' },
            { key: 'white-list', label: 'Lista Blanca (Whitelist)', desc: 'Solo jugadores autorizados pueden entrar' },
          ].map((item) => {
            const isChecked = Boolean(props[item.key])
            return (
              <div
                key={item.key}
                onClick={() => updateField(item.key, !isChecked)}
                className={`p-3.5 rounded-lg border cursor-pointer transition-all flex items-center justify-between gap-3 ${
                  isChecked
                    ? item.danger
                      ? 'bg-rose-950/30 border-rose-500/50 shadow-[0_0_12px_rgba(255,59,107,0.2)]'
                      : 'bg-cyan-950/30 border-cyan-500/50 shadow-[0_0_12px_rgba(0,212,255,0.2)]'
                    : 'bg-app/40 border-line hover:border-line/80'
                }`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 font-bold text-xs text-ink">
                    {item.danger && <Flame size={12} className="text-rose-400" />}
                    {item.label}
                  </div>
                  <div className="text-[11px] text-muted truncate mt-0.5">{item.desc}</div>
                </div>

                {/* Toggle visual cyberpunk */}
                <div
                  className={`w-10 h-5 rounded-full p-0.5 transition-colors relative shrink-0 ${
                    isChecked ? (item.danger ? 'bg-rose-500' : 'bg-cyan-500') : 'bg-slate-800'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-black transition-transform ${
                      isChecked ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </Card>

      {/* Sliders y Selectores de Configuración Numérica */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4 pb-2 border-b border-line">
          <Settings size={18} className="text-neon" />
          <h2 className="font-display font-bold text-sm tracking-widest text-ink">
            PARÁMETROS DE DIFICULTAD, VISIÓN Y LÍMITES
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Dificultad */}
          <div className="bg-app/50 p-4 rounded-lg border border-line">
            <label className="block text-xs font-semibold text-ink uppercase tracking-wider mb-2">
              Dificultad
            </label>
            <select
              value={props.difficulty || 'normal'}
              onChange={(e) => updateField('difficulty', e.target.value)}
              className="w-full bg-app border border-line rounded-lg p-2.5 text-xs text-ink outline-none focus:border-neon font-semibold"
            >
              <option value="peaceful">Pacífico (peaceful)</option>
              <option value="easy">Fácil (easy)</option>
              <option value="normal">Normal (normal)</option>
              <option value="hard">Difícil (hard)</option>
            </select>
          </div>

          {/* Modo de Juego */}
          <div className="bg-app/50 p-4 rounded-lg border border-line">
            <label className="block text-xs font-semibold text-ink uppercase tracking-wider mb-2">
              Modo de Juego Inicial
            </label>
            <select
              value={props.gamemode || 'survival'}
              onChange={(e) => updateField('gamemode', e.target.value)}
              className="w-full bg-app border border-line rounded-lg p-2.5 text-xs text-ink outline-none focus:border-neon font-semibold"
            >
              <option value="survival">Supervivencia (survival)</option>
              <option value="creative">Creativo (creative)</option>
              <option value="adventure">Aventura (adventure)</option>
              <option value="spectator">Espectador (spectator)</option>
            </select>
          </div>

          {/* Max Players */}
          <div className="bg-app/50 p-4 rounded-lg border border-line">
            <div className="flex justify-between items-center mb-2">
              <label className="text-xs font-semibold text-ink uppercase tracking-wider">
                Jugadores Máximos
              </label>
              <span className="text-xs font-mono font-bold text-neon">
                {props['max-players'] || 20}
              </span>
            </div>
            <input
              type="range"
              min="1"
              max="100"
              value={props['max-players'] || 20}
              onChange={(e) => updateField('max-players', parseInt(e.target.value, 10))}
              className="w-full accent-cyan-400"
            />
          </div>

          {/* View Distance */}
          <div className="bg-app/50 p-4 rounded-lg border border-line">
            <div className="flex justify-between items-center mb-2">
              <label className="text-xs font-semibold text-ink uppercase tracking-wider">
                Distancia de Visión (Chunks)
              </label>
              <span className="text-xs font-mono font-bold text-neon">
                {props['view-distance'] || 10} chunks
              </span>
            </div>
            <input
              type="range"
              min="2"
              max="32"
              value={props['view-distance'] || 10}
              onChange={(e) => updateField('view-distance', parseInt(e.target.value, 10))}
              className="w-full accent-cyan-400"
            />
          </div>

          {/* Simulation Distance */}
          <div className="bg-app/50 p-4 rounded-lg border border-line">
            <div className="flex justify-between items-center mb-2">
              <label className="text-xs font-semibold text-ink uppercase tracking-wider">
                Distancia de Simulación
              </label>
              <span className="text-xs font-mono font-bold text-neon">
                {props['simulation-distance'] || 8} chunks
              </span>
            </div>
            <input
              type="range"
              min="3"
              max="32"
              value={props['simulation-distance'] || 8}
              onChange={(e) => updateField('simulation-distance', parseInt(e.target.value, 10))}
              className="w-full accent-cyan-400"
            />
          </div>

          {/* Spawn Protection */}
          <div className="bg-app/50 p-4 rounded-lg border border-line">
            <div className="flex justify-between items-center mb-2">
              <label className="text-xs font-semibold text-ink uppercase tracking-wider">
                Radio Protección del Spawn
              </label>
              <span className="text-xs font-mono font-bold text-neon">
                {props['spawn-protection'] || 16} bloques
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="64"
              value={props['spawn-protection'] ?? 16}
              onChange={(e) => updateField('spawn-protection', parseInt(e.target.value, 10))}
              className="w-full accent-cyan-400"
            />
          </div>

          {/* Nombre de Mundo */}
          <div className="bg-app/50 p-4 rounded-lg border border-line">
            <label className="block text-xs font-semibold text-ink uppercase tracking-wider mb-2">
              Nombre de la Carpeta del Mundo (level-name)
            </label>
            <input
              type="text"
              value={props['level-name'] || 'world'}
              onChange={(e) => updateField('level-name', e.target.value)}
              className="w-full bg-app border border-line rounded-lg p-2 font-mono text-xs text-ink outline-none focus:border-neon"
            />
          </div>

          {/* Puerto del Servidor */}
          <div className="bg-app/50 p-4 rounded-lg border border-line">
            <label className="block text-xs font-semibold text-ink uppercase tracking-wider mb-2">
              Puerto del Servidor (server-port)
            </label>
            <input
              type="number"
              value={props['server-port'] || 25565}
              onChange={(e) => updateField('server-port', parseInt(e.target.value, 10))}
              className="w-full bg-app border border-line rounded-lg p-2 font-mono text-xs text-ink outline-none focus:border-neon"
            />
          </div>
        </div>
      </Card>
    </div>
  )
}
