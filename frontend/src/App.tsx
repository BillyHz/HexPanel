import { useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import AppShell from './layout/AppShell'
import Account from './pages/Account'
import Achievements from './pages/Achievements'
import Settings from './pages/Settings'
import ServerStatus from './pages/admin/ServerStatus'
import Players from './pages/admin/Players'
import PlayerDetail from './pages/admin/PlayerDetail'
import Audit from './pages/admin/Audit'
import Users from './pages/admin/Users'
import ServerProperties from './pages/admin/ServerProperties'
import FileManager from './pages/admin/FileManager'
import Backups from './pages/admin/Backups'
import Schedules from './pages/admin/Schedules'
import PluginMarket from './pages/admin/PluginMarket'
import CrashAnalyzer from './pages/admin/CrashAnalyzer'
import DiscordSettings from './pages/admin/DiscordSettings'
import ServerMap from './pages/admin/ServerMap'
import Login from './pages/Login'
import { useAuth } from './store/useAuth'

function HomeRedirect() {
  const { user, loading, init } = useAuth()

  useEffect(() => {
    init()
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-[#050811] text-neon">
        <div className="font-display font-bold text-lg tracking-widest animate-pulse">CARGANDO HEXPANEL...</div>
        <div className="text-xs text-muted font-mono">Conectando con el servidor Paper 1.21.11</div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  const isAdmin = user.role === 'admin' || user.permissions?.includes('server.view') || user.permissions?.includes('panel.admin')
  return <Navigate to={isAdmin ? "/admin/servidor" : "/cuenta"} replace />
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading, init } = useAuth()

  useEffect(() => {
    if (!user) init()
  }, [])

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center text-neon font-display tracking-widest animate-pulse">
        CARGANDO...
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<RequireAuth><AppShell /></RequireAuth>}>
        <Route path="/" element={<HomeRedirect />} />
        <Route path="/cuenta" element={<Account />} />
        <Route path="/logros" element={<Achievements />} />
        <Route path="/ajustes" element={<Settings />} />

        {/* Servidor */}
        <Route path="/admin/servidor" element={<ServerStatus />} />
        <Route path="/admin/jugadores" element={<Players />} />
        <Route path="/admin/jugadores/:name" element={<PlayerDetail />} />
        <Route path="/admin/mapa" element={<ServerMap />} />

        {/* Gestión */}
        <Route path="/admin/archivos" element={<FileManager />} />
        <Route path="/admin/propiedades" element={<ServerProperties />} />
        <Route path="/admin/plugins" element={<PluginMarket />} />
        <Route path="/admin/backups" element={<Backups />} />

        {/* Automatización & Sistema */}
        <Route path="/admin/tareas" element={<Schedules />} />
        <Route path="/admin/discord" element={<DiscordSettings />} />
        <Route path="/admin/diagnostico" element={<CrashAnalyzer />} />
        <Route path="/admin/auditoria" element={<Audit />} />
        <Route path="/admin/usuarios" element={<Users />} />
      </Route>
      <Route path="*" element={<HomeRedirect />} />
    </Routes>
  )
}
