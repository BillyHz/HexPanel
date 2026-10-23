import type { ReactNode } from 'react'

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`neon-card ${className}`}>{children}</div>
}

export function KpiCard({ value, label }: { value: string; label: string }) {
  return (
    <Card className="p-5">
      <div className="font-display text-2xl font-bold neon-text">{value}</div>
      <div className="text-muted text-sm uppercase tracking-widest mt-1">{label}</div>
    </Card>
  )
}

const chips = {
  blue: 'var(--chip-blue)', green: 'var(--chip-green)', purple: 'var(--chip-purple)',
  red: 'var(--chip-red)', yellow: 'var(--chip-yellow)',
}

export function InfoRow({ icon, color, title, value }: { icon: ReactNode; color: keyof typeof chips; title: string; value: string }) {
  return (
    <div className="flex items-center gap-4 py-4 border-b border-line last:border-0">
      <div className="w-10 h-10 rounded flex items-center justify-center text-black"
        style={{ background: chips[color], boxShadow: `0 0 12px ${chips[color]}` }}>{icon}</div>
      <div>
        <div className="font-semibold">{title}</div>
        <div className="text-muted text-sm">{value}</div>
      </div>
    </div>
  )
}

export function Badge({ children, tone = 'blue' }: { children: ReactNode; tone?: keyof typeof chips }) {
  return (
    <span className="px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider"
      style={{ color: chips[tone], border: `1px solid ${chips[tone]}`, boxShadow: `0 0 8px ${chips[tone]}55` }}>
      {children}
    </span>
  )
}

/** Cabeza pixelada estilo Steve (placeholder hasta tener skins reales). */
export function SkinBust({ size = 140 }: { size?: number }) {
  return (
    <div className="rounded-full overflow-hidden flex items-end justify-center"
      style={{ width: size, height: size, background: 'rgba(0,180,255,.12)', boxShadow: 'var(--glow)', border: '2px solid var(--accent)' }}>
      <svg viewBox="0 0 8 8" width={size * 0.7} shapeRendering="crispEdges">
        <rect width="8" height="8" fill="#6b4a2f" />
        <rect y="3" width="8" height="5" fill="#c08a64" />
        <rect x="1" y="4" width="2" height="1" fill="#fff" /><rect x="5" y="4" width="2" height="1" fill="#fff" />
        <rect x="2" y="4" width="1" height="1" fill="#2a3cff" /><rect x="5" y="4" width="1" height="1" fill="#2a3cff" />
        <rect x="3" y="6" width="2" height="1" fill="#7a4a3a" />
      </svg>
    </div>
  )
}
