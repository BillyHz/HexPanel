import { Card } from '../components/ui'

const items = ['Piedra a piedra', 'Diamantes!', 'Cazador de monstruos', 'El fin?', 'Granjero', 'Minero experto']

export default function Achievements() {
  return (
    <div className="max-w-6xl">
      <h1 className="font-display text-lg tracking-widest mb-4 neon-text">LOGROS</h1>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map((t, i) => (
          <Card key={t} className={`p-4 ${i > 2 ? 'opacity-50' : ''}`}>
            <div className="font-bold">{t}</div>
            <div className="text-muted text-sm">{i > 2 ? 'Bloqueado' : 'Completado'}</div>
          </Card>
        ))}
      </div>
      <p className="text-muted text-sm mt-4">Datos de ejemplo — se conectará a world/advancements (Fase 5).</p>
    </div>
  )
}
