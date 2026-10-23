import { useState, useEffect } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  Award,
  Bell,
  ChevronDown,
  Grid3x3,
  Mail,
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

const navItems = [
  { to: '/cuenta', label: 'Cuenta', icon: User },
  { to: '/logros', label: 'Logros', icon: Award },
  { to: '/ajustes', label: 'Ajustes', icon: Settings },
]

const adminItems = [
  { to: '/admin/servidor', label: 'Estado del servidor', icon: Server, perm: 'server.view' },
  { to: '/admin/jugadores', label: 'Jugadores', icon: Users, perm: 'players.view' },
  { to: '/admin/auditoria', label: 'Auditoría', icon: History, perm: 'audit.view' },
  { to: '/admin/usuarios', label: 'Usuarios y Roles', icon: UserCog, perm: 'panel.admin' },
]

const linkCls = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 px-3 py-2.5 rounded-full text-[15px] font-semibold transition-all ${
    isActive
      ? 'bg-hover text-neon border border-neon shadow-[0_0_14px_rgba(0,212,255,.35)]'
      : 'text-muted border border-transparent hover:text-ink hover:bg-hover'
  }`

export default function AppShell() {
  const [open, setOpen] = useState(true)
  const [adminOpen, setAdminOpen] = useState(true)
  const [q, setQ] = useState('')
  const nav = useNavigate()

  const { user, init, logout, hasPerm } = useAuth()

  useEffect(() => {
    init()
  }, [])

  const displayName = user?.mcName || user?.username || 'Invitado'
  const displayRole = user?.role || 'Visitante'

  return (
    <div className="flex h-full">
      {open && (
        <aside className="w-60 shrink-0 border-r border-line flex flex-col" style={{ background: 'var(--bg-sidebar)' }}>
          <div className="h-14 flex items-center px-5 font-display font-black text-xl tracking-widest neon-text">
            HEX<span className="text-ink">PANEL</span>
          </div>
          <div className="flex items-center gap-3 px-5 py-4 border-b border-line">
            <div className="scale-[.28] origin-left w-10 h-10">
              <SkinBust size={140} />
            </div>
            <div className="leading-tight">
              <div className="font-bold">{displayName}</div>
              <div className="text-xs text-muted capitalize">{displayRole}</div>
            </div>
          </div>
          <nav className="p-4 flex flex-col gap-1.5 flex-1 overflow-auto">
            <div className="text-xs uppercase tracking-[.2em] text-muted mb-2">Navegación</div>
            {navItems.map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to} className={linkCls}>
                <Icon size={17} />
                {label}
              </NavLink>
            ))}

            {(user?.permissions?.length || user?.role === 'admin') ? (
              <>
                <button
                  onClick={() => setAdminOpen(!adminOpen)}
                  className="flex items-center gap-3 px-3 py-2.5 text-muted font-semibold hover:text-ink cursor-pointer mt-2"
                >
                  <Shield size={17} />Admin
                  <ChevronDown size={14} className={`ml-auto transition-transform ${adminOpen ? '' : '-rotate-90'}`} />
                </button>
                {adminOpen &&
                  adminItems
                    .filter((item) => hasPerm(item.perm))
                    .map(({ to, label, icon: Icon }) => (
                      <NavLink key={to} to={to} className={(s) => linkCls(s) + ' ml-3 text-sm'}>
                        <Icon size={15} />
                        {label}
                      </NavLink>
                    ))}
              </>
            ) : null}
          </nav>

          <div className="p-4 border-t border-line">
            <button
              onClick={() => logout().then(() => nav('/login'))}
              className="flex items-center gap-2 text-xs text-muted hover:text-red-400 transition-colors w-full cursor-pointer"
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
          <button onClick={() => setOpen(!open)} className="text-muted hover:text-neon cursor-pointer">
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
              placeholder="Buscar usuarios..."
              className="w-full bg-app/70 border border-line rounded px-9 py-1.5 text-sm outline-none focus:border-neon focus:shadow-[0_0_12px_rgba(0,212,255,.35)]"
            />
          </form>
          <div className="ml-auto flex items-center gap-4 text-muted">
            <button className="neon-btn">Guardar</button>
            <Grid3x3 size={17} className="hover:text-neon cursor-pointer" />
            <Mail size={17} className="hover:text-neon cursor-pointer" />
            <span className="relative">
              <Bell size={17} className="hover:text-neon cursor-pointer" />
              <i
                className="absolute -top-1 -right-1 w-2 h-2 rounded-full pulse"
                style={{ background: 'var(--neon-pink)', boxShadow: '0 0 6px var(--neon-pink)' }}
              />
            </span>
            <span className="flex items-center gap-2 text-ink text-sm font-semibold">
              {displayName} <ChevronDown size={13} />
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
