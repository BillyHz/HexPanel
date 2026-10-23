import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card } from '../components/ui'
import { useAuth } from '../store/useAuth'
import { api } from '../api/client'

export default function Login() {
  const [isRegister, setIsRegister] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [email, setEmail] = useState('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  const login = useAuth((s) => s.login)
  const initAuth = useAuth((s) => s.init)
  const nav = useNavigate()

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr('')
    setLoading(true)

    try {
      if (isRegister) {
        if (!code.trim()) {
          setErr('Ingresa el código de 6 caracteres obtenido con /panel link en el juego')
          setLoading(false)
          return
        }
        await api.register(username, password, code, email || undefined)
        await initAuth()
        nav('/cuenta')
      } else {
        const ok = await login(username, password)
        if (ok) {
          nav('/cuenta')
        } else {
          setErr('Usuario o contraseña incorrectos')
        }
      }
    } catch (e: any) {
      setErr(e.message || 'Error en autenticación')
    } finally {
      setLoading(false)
    }
  }

  const field = 'w-full bg-app/80 border border-line rounded px-3 py-2 text-sm outline-none focus:border-neon focus:shadow-[0_0_12px_rgba(0,212,255,.35)]'

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-8 relative overflow-hidden">
        <div className="text-center mb-6">
          <div className="font-display font-black text-2xl tracking-widest neon-text mb-1">
            HEX<span className="text-ink">PANEL</span>
          </div>
          <p className="text-muted text-sm">
            {isRegister ? 'Vincular cuenta de Minecraft' : 'Iniciar sesión en el panel'}
          </p>
        </div>

        {err && (
          <div className="mb-4 p-3 rounded bg-red-950/40 border border-red-500/50 text-red-200 text-xs">
            {err}
          </div>
        )}

        <form onSubmit={submit} className="grid gap-4">
          <label className="grid gap-1 text-xs uppercase tracking-wider text-muted">
            Usuario
            <input required value={username} onChange={(e) => setUsername(e.target.value)} className={field} />
          </label>

          {isRegister && (
            <>
              <label className="grid gap-1 text-xs uppercase tracking-wider text-muted">
                Código de vinculación (/panel link)
                <input required placeholder="Ej. K7Q2XM" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className={field} maxLength={8} />
              </label>
              <label className="grid gap-1 text-xs uppercase tracking-wider text-muted">
                Correo electrónico (opcional)
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={field} />
              </label>
            </>
          )}

          <label className="grid gap-1 text-xs uppercase tracking-wider text-muted">
            Contraseña
            <input required type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={field} />
          </label>

          <button type="submit" disabled={loading} className="neon-btn mt-2 py-2.5">
            {loading ? 'Cargando...' : isRegister ? 'Registrarse y Vincular' : 'Entrar'}
          </button>
        </form>

        <div className="mt-6 text-center text-xs text-muted">
          {isRegister ? (
            <span>¿Ya tienes cuenta? <button onClick={() => { setIsRegister(false); setErr('') }} className="text-neon hover:underline cursor-pointer">Inicia sesión</button></span>
          ) : (
            <span>¿No tienes cuenta? <button onClick={() => { setIsRegister(true); setErr('') }} className="text-neon hover:underline cursor-pointer">Vincúlate con /panel link</button></span>
          )}
        </div>
      </Card>
    </div>
  )
}
