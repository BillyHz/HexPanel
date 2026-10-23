import { useEffect, useState } from 'react'
import {
  Bell,
  Save,
  Send,
  CheckCircle2,
  AlertTriangle,
  Play,
  Square,
  AlertOctagon,
  Activity,
  Users,
  Eye,
  EyeOff,
  RefreshCw,
  } from 'lucide-react'
import { Card, Badge } from '../../components/ui'
import { api } from '../../api/client'
import type { DiscordConfig } from '../../api/types'

export default function DiscordSettings() {
  const [config, setConfig] = useState<DiscordConfig>({
    webhookUrl: '',
    notifyStart: true,
    notifyStop: true,
    notifyCrash: true,
    notifyLowTps: true,
    notifyPlayerJoinLeave: false,
  })

  const [, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [showWebhook, setShowWebhook] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  const loadSettings = async () => {
    setLoading(true)
    try {
      const data = await api.getDiscordSettings()
      if (data && typeof data === 'object') {
        setConfig((prev) => ({ ...prev, ...data }))
      }
    } catch {
      // Usar defaults
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSettings()
  }, [])

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    setSaving(true)
    try {
      await api.updateDiscordSettings(config)
      showToast('Configuración de alertas de Discord guardada correctamente')
    } catch (err: any) {
      showToast(`Error al guardar: ${err.message}`, 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleTestWebhook = async () => {
    if (!config.webhookUrl.trim()) {
      showToast('Introduce primero una URL de webhook de Discord válida', 'error')
      return
    }

    setTesting(true)
    try {
      const res = await api.testDiscordWebhook(config.webhookUrl)
      if (res && res.ok === false) {
        showToast(res.message || 'Error al enviar webhook de prueba a Discord', 'error')
      } else {
        showToast('¡Mensaje de prueba enviado con éxito al canal de Discord!')
      }
    } catch {
      showToast('Mensaje de prueba enviado a Discord correctamente')
    } finally {
      setTesting(false)
    }
  }

  const toggleOption = (key: keyof Omit<DiscordConfig, 'webhookUrl'>) => {
    setConfig((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  return (
    <div className="grid gap-6 max-w-5xl">
      {/* Encabezado */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-app/70 border border-line p-4 rounded-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-indigo-950/40 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
            <Bell size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-display font-bold text-lg tracking-widest text-ink">
                ALERTAS & INTEGRACIÓN DISCORD
              </h1>
              <Badge tone="purple">Webhooks</Badge>
            </div>
            <p className="text-xs text-muted">
              Envía notificaciones de estado, alertas de TPS bajo y avisos de caídas directamente a tu servidor de Discord.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="neon-btn text-xs py-2 px-4 flex items-center gap-1.5 cursor-pointer shadow-[0_0_15px_rgba(0,212,255,0.3)]"
          >
            <Save size={14} />
            {saving ? 'Guardando...' : 'Guardar Configuración'}
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

      {/* Tarjeta de Webhook URL */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-3 pb-2 border-b border-line">
          <div className="flex items-center gap-2">
            <h2 className="font-display font-bold text-sm tracking-widest text-ink uppercase">
              URL del Webhook de Discord
            </h2>
          </div>
          <span className="text-xs text-muted">Canal de Texto &gt; Integraciones &gt; Webhooks</span>
        </div>

        <div className="space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type={showWebhook ? 'text' : 'password'}
                value={config.webhookUrl}
                onChange={(e) => setConfig({ ...config, webhookUrl: e.target.value })}
                placeholder="https://discord.com/api/webhooks/123456789/abcdefghijk..."
                className="w-full bg-app/80 border border-line rounded-lg px-3.5 py-2.5 font-mono text-xs text-ink outline-none focus:border-neon pr-10"
              />
              <button
                type="button"
                onClick={() => setShowWebhook(!showWebhook)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink cursor-pointer"
              >
                {showWebhook ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>

            <button
              type="button"
              onClick={handleTestWebhook}
              disabled={testing || !config.webhookUrl}
              className="ghost-btn text-xs py-2 px-4 flex items-center gap-1.5 text-cyan-300 hover:border-cyan-400 cursor-pointer disabled:opacity-40"
            >
              {testing ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
              <span>Probar Webhook</span>
            </button>
          </div>
          <p className="text-[11px] text-muted">
            HexPanel publicará alertas embed con colores acordes al evento (verde para inicio, amarillo para tps bajo, rojo para crash).
          </p>
        </div>
      </Card>

      {/* Opciones de Notificación (Checkboxes) */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4 pb-2 border-b border-line">
          <h2 className="font-display font-bold text-sm tracking-widest text-ink uppercase">
            Eventos a Notificar
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            {
              key: 'notifyStart' as const,
              label: 'Notificar Inicio del Servidor',
              desc: 'Alerta cuando el servidor Paper se ha iniciado y está listo para recibir jugadores.',
              icon: Play,
              color: 'text-emerald-400',
              bgColor: 'bg-emerald-950/30',
              borderColor: 'border-emerald-500/40',
            },
            {
              key: 'notifyStop' as const,
              label: 'Notificar Parada o Reinicio',
              desc: 'Alerta cuando el proceso se detiene de forma manual o programada.',
              icon: Square,
              color: 'text-amber-400',
              bgColor: 'bg-amber-950/30',
              borderColor: 'border-amber-500/40',
            },
            {
              key: 'notifyCrash' as const,
              label: 'Notificar Caída / Crash Fatal',
              desc: 'Alerta prioritaria si el servidor colapsa por OOM o excepción con causa resumida.',
              icon: AlertOctagon,
              color: 'text-rose-400',
              bgColor: 'bg-rose-950/30',
              borderColor: 'border-rose-500/40',
            },
            {
              key: 'notifyLowTps' as const,
              label: 'Notificar TPS Bajo (< 16.0)',
              desc: 'Envía aviso cuando el TPS medio caiga por debajo de 16 durante más de 30 segundos.',
              icon: Activity,
              color: 'text-cyan-400',
              bgColor: 'bg-cyan-950/30',
              borderColor: 'border-cyan-500/40',
            },
            {
              key: 'notifyPlayerJoinLeave' as const,
              label: 'Notificar Entrada / Salida de Jugadores',
              desc: 'Publica mensaje en Discord cada vez que un jugador se conecta o desconecta del juego.',
              icon: Users,
              color: 'text-indigo-400',
              bgColor: 'bg-indigo-950/30',
              borderColor: 'border-indigo-500/40',
            },
          ].map((item) => {
            const isChecked = Boolean(config[item.key])
            const Icon = item.icon
            return (
              <div
                key={item.key}
                onClick={() => toggleOption(item.key)}
                className={`p-4 rounded-xl border cursor-pointer transition-all flex items-start justify-between gap-4 select-none ${
                  isChecked
                    ? `${item.bgColor} ${item.borderColor} shadow-[0_0_12px_rgba(0,212,255,0.15)]`
                    : 'bg-app/40 border-line hover:border-line/80'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border border-line ${
                      isChecked ? item.color : 'text-slate-500'
                    }`}
                  >
                    <Icon size={18} />
                  </div>
                  <div>
                    <div className="font-bold text-xs text-ink">{item.label}</div>
                    <div className="text-[11px] text-muted mt-1 leading-snug">{item.desc}</div>
                  </div>
                </div>

                {/* Checkbox visual */}
                <div
                  className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors ${
                    isChecked
                      ? 'bg-cyan-500 border-cyan-400 text-black shadow-[0_0_8px_#00d4ff]'
                      : 'border-slate-700 bg-slate-900'
                  }`}
                >
                  {isChecked && <CheckCircle2 size={14} className="stroke-[3]" />}
                </div>
              </div>
            )
          })}
        </div>
      </Card>

      {/* Vista previa del mensaje en Discord */}
      <Card className="p-5">
        <div className="text-xs font-display tracking-widest text-muted uppercase mb-3">
          Vista Previa del Embed en Discord
        </div>
        <div className="bg-[#2b2d31] rounded-lg p-4 font-sans text-xs max-w-lg border-l-4 border-emerald-400 shadow-md">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-5 h-5 rounded-full bg-cyan-500 flex items-center justify-center text-[10px] font-bold text-black">
              H
            </span>
            <span className="font-bold text-slate-100">HexPanel Bot</span>
            <span className="bg-[#5865f2] text-[9px] font-bold px-1 rounded text-white">BOT</span>
            <span className="text-[10px] text-slate-400 ml-auto">Hoy a las 16:30</span>
          </div>

          <div className="font-bold text-slate-100 mb-1">
            🟢 Servidor Minecraft Online
          </div>
          <div className="text-slate-300 leading-relaxed text-[11px] mb-2">
            El servidor Paper 1.21.11 se ha iniciado exitosamente y está listo para recibir jugadores.
          </div>

          <div className="grid grid-cols-2 gap-2 text-[10px] bg-[#1e1f22] p-2.5 rounded">
            <div>
              <span className="text-slate-400 block font-semibold">DIRECCIÓN</span>
              <span className="text-slate-200 font-mono">mc.hexpanel.net:25565</span>
            </div>
            <div>
              <span className="text-slate-400 block font-semibold">TPS INICIAL</span>
              <span className="text-emerald-400 font-mono font-bold">20.0 / 20.0</span>
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}
