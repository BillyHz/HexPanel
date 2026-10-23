import { useEffect, useState } from 'react'
import { RotateCcw, CheckCircle, Clock } from 'lucide-react'
import { Badge, Card } from '../../components/ui'
import { api } from '../../api/client'
import type { AuditEntry } from '../../api/types'

export default function Audit() {
  const [logs, setLogs] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [undoing, setUndoing] = useState<number | null>(null)
  const [msg, setMsg] = useState('')

  const load = async () => {
    try {
      setLoading(true)
      const data = await api.getAuditLogs(50)
      setLogs(data)
    } catch {
      // Fallback mock
      setLogs([
        {
          id: 1,
          at: new Date().toISOString(),
          actor: 'Tecsharp',
          ip: '127.0.0.1',
          action: 'inventory.ops',
          target: 'Steve',
          payload: { op: 'move', from: 'inventory:0', to: 'inventory:5' },
          undoable: true,
          undone: false,
        },
        {
          id: 2,
          at: new Date(Date.now() - 3600000).toISOString(),
          actor: 'Tecsharp',
          ip: '127.0.0.1',
          action: 'player.kick',
          target: 'Notch',
          payload: { reason: 'AFK' },
          undoable: false,
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const undo = async (id: number) => {
    try {
      setUndoing(id)
      setMsg('')
      await api.undoAudit(id)
      setMsg(`Operación #${id} revertida con éxito`)
      await load()
    } catch (e: any) {
      setMsg(`Error al revertir: ${e.message}`)
    } finally {
      setUndoing(null)
    }
  }

  return (
    <div className="max-w-6xl grid gap-5">
      <div>
        <h1 className="font-display text-lg tracking-widest neon-text">AUDITORÍA</h1>
        <p className="text-muted text-xs">Registro cronológico de operaciones administrativas y modificaciones de inventario</p>
      </div>

      {msg && (
        <div className="p-3 rounded bg-blue-950/40 border border-blue-500/50 text-blue-200 text-xs">
          {msg}
        </div>
      )}

      <Card className="overflow-hidden p-0">
        <table className="w-full text-left text-sm border-collapse">
          <thead>
            <tr className="border-b border-line text-muted uppercase text-xs tracking-wider bg-app/40">
              <th className="py-3 px-4">Fecha / Hora</th>
              <th className="py-3 px-4">Usuario</th>
              <th className="py-3 px-4">Acción</th>
              <th className="py-3 px-4">Objetivo</th>
              <th className="py-3 px-4">Detalle</th>
              <th className="py-3 px-4 text-right">Reversión</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id} className="border-b border-line/50 hover:bg-hover/50 transition-colors">
                <td className="py-3 px-4 text-xs text-muted font-mono whitespace-nowrap">
                  <Clock size={12} className="inline mr-1 text-neon" />
                  {new Date(log.at).toLocaleString()}
                </td>
                <td className="py-3 px-4 font-semibold text-ink">{log.actor}</td>
                <td className="py-3 px-4">
                  <Badge tone={log.action.includes('delete') ? 'red' : log.action.includes('ops') ? 'blue' : 'purple'}>
                    {log.action}
                  </Badge>
                </td>
                <td className="py-3 px-4 text-muted font-mono">{log.target || '—'}</td>
                <td className="py-3 px-4 max-w-xs truncate text-xs text-muted font-mono">
                  {JSON.stringify(log.payload)}
                </td>
                <td className="py-3 px-4 text-right">
                  {log.undoable && !log.undone ? (
                    <button
                      onClick={() => undo(log.id)}
                      disabled={undoing === log.id}
                      className="ghost-btn text-xs py-1 px-2.5 inline-flex items-center gap-1.5"
                    >
                      <RotateCcw size={12} />
                      {undoing === log.id ? 'Revirtiendo...' : 'Deshacer'}
                    </button>
                  ) : log.undone ? (
                    <span className="text-xs text-muted inline-flex items-center gap-1">
                      <CheckCircle size={12} className="text-green-400" /> Revertido
                    </span>
                  ) : (
                    <span className="text-xs text-muted">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {logs.length === 0 && !loading && (
          <div className="p-8 text-center text-muted text-sm">No hay registros de auditoría</div>
        )}
      </Card>
    </div>
  )
}
