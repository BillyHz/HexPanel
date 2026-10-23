import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, ExternalLink } from 'lucide-react'
import { Badge, Card, SkinBust } from '../../components/ui'
import { api } from '../../api/client'
import type { PlayerRow } from '../../api/types'

export default function Players() {
  const [players, setPlayers] = useState<PlayerRow[]>([])
  const [q, setQ] = useState('')
  const [onlineFilter, setOnlineFilter] = useState<'all' | 'online' | 'offline'>('all')
  const [loading, setLoading] = useState(true)

  const load = async () => {
    try {
      setLoading(true)
      const data = await api.getPlayers(q, onlineFilter === 'all' ? undefined : onlineFilter === 'online')
      setPlayers(data)
    } catch {
      // Fallback mock data
      setPlayers([
        { name: 'Steve', uuid: '069a79f4-44e9-4726-a5be-fca90e38aaf5', online: true, op: true, banned: false, whitelisted: true },
        { name: 'Alex', uuid: 'ec561538-f3fd-461d-aff5-086b22154bce', online: false, op: false, banned: false, whitelisted: true },
        { name: 'Notch', uuid: '061e9b1a-2d8a-4f0b-9a4e-0000000000aa', online: false, op: true, banned: true, whitelisted: false },
      ])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [onlineFilter])

  const filtered = players.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()))

  return (
    <div className="max-w-6xl grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-lg tracking-widest neon-text">JUGADORES</h1>
          <p className="text-muted text-xs">Gestión y moderación de jugadores del servidor</p>
        </div>
        <div className="flex gap-2">
          {(['all', 'online', 'offline'] as const).map((filter) => (
            <button
              key={filter}
              onClick={() => setOnlineFilter(filter)}
              className={`ghost-btn text-xs ${onlineFilter === filter ? 'border-neon text-neon shadow-[0_0_8px_rgba(0,212,255,0.4)]' : ''}`}
            >
              {filter === 'all' ? 'Todos' : filter === 'online' ? 'Conectados' : 'Desconectados'}
            </button>
          ))}
        </div>
      </div>

      <Card className="p-4 flex items-center gap-3">
        <Search size={16} className="text-muted" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar jugador por nombre o UUID..."
          className="w-full bg-transparent outline-none text-sm"
        />
      </Card>

      <Card className="overflow-hidden p-0">
        <table className="w-full text-left text-sm border-collapse">
          <thead>
            <tr className="border-b border-line text-muted uppercase text-xs tracking-wider bg-app/40">
              <th className="py-3 px-4">Jugador</th>
              <th className="py-3 px-4">Estado</th>
              <th className="py-3 px-4">Permisos</th>
              <th className="py-3 px-4 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.uuid} className="border-b border-line/50 hover:bg-hover/50 transition-colors">
                <td className="py-3 px-4 flex items-center gap-3">
                  <div className="scale-[.22] origin-left w-8 h-8">
                    <SkinBust size={140} />
                  </div>
                  <div>
                    <div className="font-bold text-ink">{p.name}</div>
                    <div className="text-xs text-muted font-mono">{p.uuid.slice(0, 14)}...</div>
                  </div>
                </td>
                <td className="py-3 px-4">
                  <Badge tone={p.online ? 'green' : 'red'}>
                    {p.online ? 'Conectado' : 'Desconectado'}
                  </Badge>
                </td>
                <td className="py-3 px-4 flex gap-2">
                  {p.op && <Badge tone="yellow">OP</Badge>}
                  {p.banned && <Badge tone="red">Baneado</Badge>}
                  {p.whitelisted && <Badge tone="blue">Whitelist</Badge>}
                </td>
                <td className="py-3 px-4 text-right">
                  <Link
                    to={`/admin/jugadores/${p.name}`}
                    className="ghost-btn inline-flex items-center gap-1.5 py-1 px-3 text-xs"
                  >
                    Ver Detalle <ExternalLink size={12} />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && !loading && (
          <div className="p-8 text-center text-muted text-sm">No se encontraron jugadores</div>
        )}
      </Card>
    </div>
  )
}
