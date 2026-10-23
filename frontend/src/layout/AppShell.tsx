import { useState, useEffect } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  Award,
  Menu,
  Search,
  Server,
  Settings,
  Shield,
  User,
  Users,
  History,
  UserCog,
  LogOut,
} from 'lucide-react'
import { SkinBust } from '../components/ui'
import { useAuth } from '../store/useAuth'

const adminItems = [
  { to: '/admin/servidor', label: 'Servidor y Métricas', icon: Server, perm: 'server.view' },
  { to: '/admin/jugadores', label: 'Jugadores e Inventarios', icon: Users, perm: 'players.view' },
  { to: '/admin/auditoria', label: 'Auditoría y Rollback', icon: History, perm: 'audit.view' },
  { to: '/admin/usuarios', label: 'Usuarios y Roles', icon: UserCog, perm: 'panel.admin' },
]

const playerItems = [
  { to: '/cuenta', label: 'Mi Perfil de Jugador', icon: User },
  { to: '/logros', label: 'Logros', icon: Award },
  { to: '/ajustes', label: 'Ajustes', icon: Settings },
]

const linkCls = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${
    isActive
      ? 'bg-hover text-neon border border-neon shadow-[0_0_14px_rgba(0,212,255,.35)]'
      : 'text-muted border border-transparent hover:text-ink hover:bg-hover'
  }`

export default function AppShell() {
  const [open, setOpen] = useState(true)
  const [q, setQ] = useState('')
  const nav = useNavigate()

  const { user, init, logout, hasPerm } = useAuth()

  useEffect(() => {
    init()
  }, [])

  const displayName = user?.mcName || user?.username || 'Invitado'
  const displayRole = user?.role || 'Visitante'
  const isAdmin = user?.role === 'admin' || user?.permissions?.includes('panel.admin') || user?.permissions?.includes('server.view')

  return (
    <div className="flex h-full">
      {open && (
        <aside className="w-64 shrink-0 border-r border-line flex flex-col" style={{ background: 'var(--bg-sidebar)' }}>
          <div className="h-14 flex items-center px-5 font-display font-black text-xl tracking-widest neon-text border-b border-line">
            HEX<span className="text-ink">PANEL</span>
          </div>
          <div className="flex items-center gap-3 px-5 py-4 border-b border-line bg-app/40">
            <div className="scale-[.28] origin-left w-10 h-10">
              <SkinBust size={140} name={displayName} />
            </div>
            <div className="leading-tight">
              <div className="font-bold text-sm text-ink">{displayName}</div>
              <div className="text-xs text-neon uppercase tracking-wider font-semibold">{displayRole}</div>
            </div>
          </div>

          <nav className="p-4 flex flex-col gap-1.5 flex-1 overflow-auto">
            {isAdmin && (
              <>
                <div className="text-[11px] uppercase tracking-[.2em] text-cyan-400/80 font-bold mb-1 flex items-center gap-1.5 px-2">
                  <Shield size={12} /> Administración
                </div>
                {adminItems
                  .filter((item) => hasPerm(item.perm))
                  .map(({ to, label, icon: Icon }) => (
                    <NavLink key={to} to={to} className={linkCls}>
                      <Icon size={16} />
                      {label}
                    </NavLink>
                  ))}
                <div className="my-2 border-b border-line/60" />
              </>
            )}

            <div className="text-[11px] uppercase tracking-[.2em] text-muted font-bold mb-1 px-2">
              Perfil y Juego
            </div>
            {playerItems.map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to} className={linkCls}>
                <Icon size={16} />
                {label}
              </NavLink>
            ))}
          </nav>

          <div className="p-4 border-t border-line">
            <button
              onClick={() => logout().then(() => nav('/login'))}
              className="flex items-center gap-2 text-xs text-muted hover:text-red-400 transition-colors w-full cursor-pointer py-1"
            >
              <LogOut size={14} /> Cerrar Sesión
            </button>
          </div>
        </aside>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header
          className="h-14 shrink-0 border-b border-line flex items-center gap-3 px-4"
          style={{ background: 'rgba(7,11,23,.85)', backdropFilter: 'blur(6px)' }}
        >
          <button onClick={() => setOpen(!open)} className="text-muted hover:text-neon cursor-pointer p-1">
            <Menu size={18} />
          </button>
          <form
            className="relative flex-1 max-w-xl"
            onSubmit={(e) => {
              e.preventDefault()
              if (q.trim()) nav(`/admin/jugadores/${q.trim()}`)
            }}
          >
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar jugador (ej. bob)..."
              className="w-full bg-app/70 border border-line rounded-lg px-9 py-1.5 text-sm outline-none focus:border-neon focus:shadow-[0_0_12px_rgba(0,212,255,.35)] text-ink placeholder:text-muted/60"
            />
          </form>
          <div className="ml-auto flex items-center gap-4 text-muted">
            <NavLink to="/admin/servidor" className="text-xs neon-btn py-1.5 px-3">
              Ver Servidor
            </NavLink>
            <span className="flex items-center gap-2 text-ink text-sm font-semibold">
              <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#10b981]" />
              {displayName}
            </span>
          </div>
        </header>
        <main className="flex-1 overflow-auto p-5">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
