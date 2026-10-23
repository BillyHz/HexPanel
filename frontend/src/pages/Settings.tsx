import { Card } from '../components/ui'

export default function Settings() {
  const field = 'w-full bg-app/70 border border-line rounded px-3 py-2 outline-none focus:border-neon'
  return (
    <div className="max-w-xl">
      <h1 className="font-display text-lg tracking-widest mb-4 neon-text">AJUSTES</h1>
      <Card className="p-6 grid gap-4">
        <label className="grid gap-1 text-sm text-muted">Correo<input className={field} placeholder="correo@ejemplo.com" /></label>
        <label className="grid gap-1 text-sm text-muted">Nueva contraseña<input type="password" className={field} /></label>
        <div><button className="neon-btn">Guardar cambios</button></div>
      </Card>
    </div>
  )
}
