import { useEffect, useState } from 'react'
import { Card } from '../../components/ui'
import { api } from '../../api/client'
import type { PanelUser, RoleInfo } from '../../api/types'

export default function Users() {
  const [users, setUsers] = useState<PanelUser[]>([])
  const [roles, setRoles] = useState<RoleInfo[]>([])
  const [savingId, setSavingId] = useState<number | null>(null)

  const load = async () => {
    try {
      const [u, r] = await Promise.all([api.getUsers(), api.getRoles()])
      setUsers(u)
      setRoles(r)
    } catch {
      // Fallback mock
      setUsers([
        { id: 1, username: 'admin', mcName: 'Tecsharp', role: 'admin', lastLogin: new Date().toISOString() },
        { id: 2, username: 'mod1', mcName: 'Alex', role: 'moderator', lastLogin: null },
      ])
      setRoles([
        { name: 'player', permissions: [] },
        { name: 'moderator', permissions: ['server.view', 'players.view', 'players.moderate', 'inventory.view', 'audit.view'] },
        { name: 'admin', permissions: ['panel.admin'] },
      ])
    }
  }

  useEffect(() => {
    load()
  }, [])

  const changeRole = async (userId: number, roleName: string) => {
    try {
      setSavingId(userId)
      // Encontrar rol
      const r = roles.find((x) => x.name === roleName)
      await api.updateUser(userId, { role_id: (r as any)?.id || 1 })
      await load()
    } catch (e: any) {
      alert(`Error al actualizar rol: ${e.message}`)
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div className="max-w-6xl grid gap-5">
      <div>
        <h1 className="font-display text-lg tracking-widest neon-text">USUARIOS DEL PANEL</h1>
        <p className="text-muted text-xs">Gestión de cuentas web, roles y permisos de acceso</p>
      </div>

      <Card className="overflow-hidden p-0">
        <table className="w-full text-left text-sm border-collapse">
          <thead>
            <tr className="border-b border-line text-muted uppercase text-xs tracking-wider bg-app/40">
              <th className="py-3 px-4">Usuario</th>
              <th className="py-3 px-4">Cuenta Minecraft</th>
              <th className="py-3 px-4">Rol Asignado</th>
              <th className="py-3 px-4">Último Login</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-line/50 hover:bg-hover/50 transition-colors">
                <td className="py-3 px-4 font-bold text-ink">{u.username}</td>
                <td className="py-3 px-4 font-mono text-neon">{u.mcName || '—'}</td>
                <td className="py-3 px-4">
                  <select
                    value={u.role}
                    disabled={savingId === u.id}
                    onChange={(e) => changeRole(u.id, e.target.value)}
                    className="bg-card border border-line rounded px-2.5 py-1 text-xs outline-none focus:border-neon"
                  >
                    <option value="player">player</option>
                    <option value="moderator">moderator</option>
                    <option value="admin">admin</option>
                  </select>
                </td>
                <td className="py-3 px-4 text-xs text-muted font-mono">
                  {u.lastLogin ? new Date(u.lastLogin).toLocaleString() : 'Nunca'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  )
}
