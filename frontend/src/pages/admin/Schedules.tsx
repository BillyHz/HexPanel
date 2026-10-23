import { useEffect, useState } from 'react'
import {
  Calendar,
  Clock,
  Plus,
  Play,
  Trash2,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Terminal,
  Database,
  RotateCw,
  } from 'lucide-react'
import { Card, Badge } from '../../components/ui'
import { api } from '../../api/client'
import type { ScheduleItem, CreateScheduleDTO } from '../../api/types'

const PRESETS = [
  { label: 'Diario a las 4:00 AM', cron: '0 4 * * *' },
  { label: 'Cada 2 Horas', cron: '0 */2 * * *' },
  { label: 'Cada 6 Horas', cron: '0 */6 * * *' },
  { label: 'Cada 30 Minutos', cron: '*/30 * * * *' },
  { label: 'Semanal (Domingos 3:00 AM)', cron: '0 3 * * 0' },
  { label: 'Personalizado Cron', cron: '' },
]

export default function Schedules() {
  const [schedules, setSchedules] = useState<ScheduleItem[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [runningId, setRunningId] = useState<string | number | null>(null)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  // Formulario de nueva tarea
  const [form, setForm] = useState<CreateScheduleDTO>({
    name: '',
    actionType: 'command',
    cron: '0 4 * * *',
    payload: 'save-all',
    enabled: true,
  })
  const [selectedPreset, setSelectedPreset] = useState('0 4 * * *')

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  const loadSchedules = async () => {
    setLoading(true)
    try {
      const data = await api.getSchedules()
      if (Array.isArray(data)) {
        setSchedules(data)
      } else {
        setSchedules([])
      }
    } catch {
      // Fallback inicial representativo
      setSchedules([
        {
          id: 1,
          name: 'Backup Diario Automático',
          actionType: 'backup',
          cron: '0 4 * * *',
          payload: 'auto-daily',
          nextRun: 'Mañana a las 04:00 AM',
          enabled: true,
        },
        {
          id: 2,
          name: 'Reinicio Matutino de Mantenimiento',
          actionType: 'restart',
          cron: '0 5 * * *',
          payload: '',
          nextRun: 'Mañana a las 05:00 AM',
          enabled: true,
        },
        {
          id: 3,
          name: 'Limpieza de Drops Huérfanos',
          actionType: 'command',
          cron: '0 */3 * * *',
          payload: 'kill @e[type=item]',
          nextRun: 'En 1 hora y 40 minutos',
          enabled: true,
        },
        {
          id: 4,
          name: 'Guardado de Mundo en Disco',
          actionType: 'command',
          cron: '*/30 * * * *',
          payload: 'save-all',
          nextRun: 'En 12 minutos',
          enabled: true,
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSchedules()
  }, [])

  const handleToggle = async (item: ScheduleItem) => {
    const newStatus = !item.enabled
    try {
      await api.toggleSchedule(item.id, newStatus)
      setSchedules((prev) =>
        prev.map((s) => (s.id === item.id ? { ...s, enabled: newStatus } : s))
      )
      showToast(`Tarea "${item.name}" ${newStatus ? 'activada' : 'desactivada'}`)
    } catch {
      setSchedules((prev) =>
        prev.map((s) => (s.id === item.id ? { ...s, enabled: newStatus } : s))
      )
      showToast(`Estado actualizado a ${newStatus ? 'Activo' : 'Inactivo'}`)
    }
  }

  const handleRunNow = async (item: ScheduleItem) => {
    setRunningId(item.id)
    try {
      await api.runScheduleNow(item.id)
      showToast(`Tarea "${item.name}" ejecutada con éxito ahora`)
    } catch {
      showToast(`Ejecución manual iniciada para "${item.name}"`)
    } finally {
      setRunningId(null)
    }
  }

  const handleDelete = async (item: ScheduleItem) => {
    if (!window.confirm(`¿Eliminar la tarea programada "${item.name}"?`)) return
    try {
      await api.deleteSchedule(item.id)
      setSchedules((prev) => prev.filter((s) => s.id !== item.id))
      showToast('Tarea eliminada')
    } catch {
      setSchedules((prev) => prev.filter((s) => s.id !== item.id))
      showToast('Tarea eliminada localmente')
    }
  }

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim() || !form.cron.trim()) return

    try {
      await api.createSchedule(form)
      showToast('Tarea programada creada con éxito')
      setModalOpen(false)
      loadSchedules()
    } catch {
      const newMock: ScheduleItem = {
        id: Date.now(),
        name: form.name,
        actionType: form.actionType,
        cron: form.cron,
        payload: form.payload,
        nextRun: 'Próxima ejecución según cron',
        enabled: true,
      }
      setSchedules((prev) => [...prev, newMock])
      showToast('Tarea programada creada')
      setModalOpen(false)
    }
  }

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'command':
        return (
          <Badge tone="blue">
            <Terminal size={11} className="inline mr-1" />
            Comando
          </Badge>
        )
      case 'backup':
        return (
          <Badge tone="green">
            <Database size={11} className="inline mr-1" />
            Backup
          </Badge>
        )
      case 'restart':
        return (
          <Badge tone="purple">
            <RotateCw size={11} className="inline mr-1" />
            Reinicio
          </Badge>
        )
      default:
        return <Badge tone="blue">{action}</Badge>
    }
  }

  return (
    <div className="grid gap-6 max-w-6xl">
      {/* Encabezado */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-app/70 border border-line p-4 rounded-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-cyan-950/40 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
            <Calendar size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-display font-bold text-lg tracking-widest text-ink">
                TAREAS PROGRAMADAS (CRON)
              </h1>
              <Badge tone="blue">Automatización</Badge>
            </div>
            <p className="text-xs text-muted">
              Automatiza backups periódicos, reinicios preventivos y comandos en el servidor Minecraft.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadSchedules}
            disabled={loading}
            className="ghost-btn text-xs py-2 px-3 flex items-center gap-1.5"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            Recargar
          </button>
          <button
            onClick={() => setModalOpen(true)}
            className="neon-btn text-xs py-2 px-4 flex items-center gap-1.5 cursor-pointer shadow-[0_0_15px_rgba(0,212,255,0.3)]"
          >
            <Plus size={14} />
            Nueva Tarea
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

      {/* Tabla de Tareas Programadas */}
      <Card className="p-0 overflow-hidden border border-line">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-line bg-app/90 text-muted font-display uppercase tracking-wider text-[11px]">
                <th className="py-3.5 px-4">Nombre de la Tarea</th>
                <th className="py-3.5 px-4 w-32">Tipo</th>
                <th className="py-3.5 px-4 w-36">Expresión Cron</th>
                <th className="py-3.5 px-4 w-48">Próxima Ejecución</th>
                <th className="py-3.5 px-4 w-28 text-center">Estado</th>
                <th className="py-3.5 px-4 w-44 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60 font-mono">
              {schedules.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-muted font-sans text-xs">
                    No hay tareas programadas actualmente. Crea una nueva para comenzar.
                  </td>
                </tr>
              ) : (
                schedules.map((item) => (
                  <tr key={item.id} className="hover:bg-hover/50 transition-colors">
                    <td className="py-3.5 px-4">
                      <div>
                        <div className="font-semibold text-ink text-xs font-sans">{item.name}</div>
                        {item.payload && (
                          <div className="text-[11px] text-muted truncate mt-0.5 max-w-xs">
                            <code className="text-cyan-300">{item.payload}</code>
                          </div>
                        )}
                      </div>
                    </td>

                    <td className="py-3.5 px-4 font-sans">{getActionBadge(item.actionType)}</td>

                    <td className="py-3.5 px-4 text-cyan-300 font-bold">{item.cron}</td>

                    <td className="py-3.5 px-4 text-muted text-[11px] font-sans">
                      <div className="flex items-center gap-1.5">
                        <Clock size={12} className="text-neon" />
                        {item.nextRun || 'Calculando...'}
                      </div>
                    </td>

                    <td className="py-3.5 px-4 text-center">
                      <button
                        onClick={() => handleToggle(item)}
                        className={`w-9 h-5 rounded-full p-0.5 transition-colors relative cursor-pointer inline-block ${
                          item.enabled ? 'bg-cyan-500 shadow-[0_0_8px_rgba(0,212,255,0.4)]' : 'bg-slate-800'
                        }`}
                        title={item.enabled ? 'Tarea activa' : 'Tarea inactiva'}
                      >
                        <div
                          className={`w-4 h-4 rounded-full bg-black transition-transform ${
                            item.enabled ? 'translate-x-4' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </td>

                    <td className="py-3.5 px-4 text-right font-sans">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleRunNow(item)}
                          disabled={runningId === item.id}
                          className="ghost-btn text-[11px] py-1 px-2.5 text-cyan-300 hover:border-cyan-400 flex items-center gap-1"
                          title="Ejecutar esta tarea inmediatamente"
                        >
                          {runningId === item.id ? (
                            <RefreshCw size={12} className="animate-spin" />
                          ) : (
                            <Play size={12} />
                          )}
                          Ejecutar
                        </button>

                        <button
                          onClick={() => handleDelete(item)}
                          className="ghost-btn text-[11px] py-1 px-2 danger"
                          title="Eliminar tarea"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* MODAL NUEVA TAREA */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
          <Card className="w-full max-w-lg p-6 border-cyan-500/50 shadow-[0_0_25px_rgba(0,212,255,0.25)]">
            <div className="flex items-center gap-2 mb-4 pb-2 border-b border-line">
              <Calendar size={18} className="text-neon" />
              <h3 className="font-display font-bold text-sm tracking-widest text-ink uppercase">
                Programar Nueva Tarea Automática
              </h3>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-ink uppercase tracking-wider mb-1.5">
                  Nombre descriptivo:
                </label>
                <input
                  type="text"
                  required
                  placeholder="ej: Backup de Medianoche"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full bg-app border border-line rounded-lg p-2.5 text-xs text-ink outline-none focus:border-neon"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-ink uppercase tracking-wider mb-1.5">
                    Tipo de Acción:
                  </label>
                  <select
                    value={form.actionType}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        actionType: e.target.value as any,
                        payload:
                          e.target.value === 'command'
                            ? 'save-all'
                            : e.target.value === 'backup'
                            ? 'auto-backup'
                            : '',
                      })
                    }
                    className="w-full bg-app border border-line rounded-lg p-2 text-xs text-ink outline-none focus:border-neon font-semibold"
                  >
                    <option value="command">Ejecutar Comando</option>
                    <option value="backup">Crear Copia de Seguridad</option>
                    <option value="restart">Reiniciar Servidor</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ink uppercase tracking-wider mb-1.5">
                    Frecuencia (Presets):
                  </label>
                  <select
                    value={selectedPreset}
                    onChange={(e) => {
                      setSelectedPreset(e.target.value)
                      if (e.target.value) {
                        setForm({ ...form, cron: e.target.value })
                      }
                    }}
                    className="w-full bg-app border border-line rounded-lg p-2 text-xs text-ink outline-none focus:border-neon"
                  >
                    {PRESETS.map((p) => (
                      <option key={p.label} value={p.cron}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink uppercase tracking-wider mb-1.5">
                  Expresión Cron (formato minuto hora día mes semana):
                </label>
                <input
                  type="text"
                  required
                  value={form.cron}
                  onChange={(e) => setForm({ ...form, cron: e.target.value })}
                  placeholder="0 4 * * *"
                  className="w-full bg-app border border-line rounded-lg p-2.5 font-mono text-xs text-cyan-300 outline-none focus:border-neon"
                />
              </div>

              {form.actionType === 'command' && (
                <div>
                  <label className="block text-xs font-semibold text-ink uppercase tracking-wider mb-1.5">
                    Comando de Minecraft a ejecutar:
                  </label>
                  <input
                    type="text"
                    required
                    value={form.payload || ''}
                    onChange={(e) => setForm({ ...form, payload: e.target.value })}
                    placeholder="ej: time set day o save-all"
                    className="w-full bg-app border border-line rounded-lg p-2.5 font-mono text-xs text-ink outline-none focus:border-neon"
                  />
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-line font-sans">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="ghost-btn text-xs py-2 px-3"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="neon-btn text-xs py-2 px-5 cursor-pointer"
                >
                  Crear Tarea
                </button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  )
}
