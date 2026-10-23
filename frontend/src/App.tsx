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
import Login from './pages/Login'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<AppShell />}>
        <Route path="/" element={<Navigate to="/cuenta" replace />} />
        <Route path="/cuenta" element={<Account />} />
        <Route path="/logros" element={<Achievements />} />
        <Route path="/ajustes" element={<Settings />} />
        <Route path="/admin/servidor" element={<ServerStatus />} />
        <Route path="/admin/jugadores" element={<Players />} />
        <Route path="/admin/jugadores/:name" element={<PlayerDetail />} />
        <Route path="/admin/auditoria" element={<Audit />} />
        <Route path="/admin/usuarios" element={<Users />} />
      </Route>
      <Route path="*" element={<Navigate to="/cuenta" replace />} />
    </Routes>
  )
}
