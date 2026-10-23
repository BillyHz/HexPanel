import { useEffect, useRef, useState } from 'react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, YAxis } from 'recharts'
import { Play, RotateCw, Skull, Square, Terminal } from 'lucide-react'
import { Badge, Card } from '../../components/ui'
import { api } from '../../api/client'
import { useWsTopic } from '../../api/useWs'

type Pt = { t: number; cpu: number; ram: number; tps: number; mspt: number }
const seed = (): Pt[] => Array.from({ length: 60 }, (_, t) => ({ t, cpu: 20, ram: 2400, tps: 20, mspt: 8 }))

function Chart({ data, title, k, color, unit, domain }: { data: Pt[]; title: string; k: keyof Pt; color: string; unit: string; domain?: [number, number] }) {
  return (
    <Card className="p-4 h-48">
      <div className="flex justify-between text-sm mb-1">
        <span className="font-display tracking-widest text-xs" style={{ color }}>{title}</span>
      </div>
      <ResponsiveContainer width="100%" height="85%">
        <AreaChart data={data}>
          <defs>
            <linearGradient id={k} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.5} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#12305a" strokeDasharray="3 3" />
          <YAxis domain={domain} stroke="#6f8bb0" fontSize={11} width={40} />
          <Tooltip
            contentStyle={{ background: '#0a1020', border: '1px solid #12305a' }}
            formatter={(v) => `${Number(v).toFixed(1)} ${unit}`}
            labelFormatter={() => ''}
          />
          <Area type="monotone" dataKey={k} stroke={color} fill={`url(#${k})`} strokeWidth={2} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </Card>
  )
}

export default function ServerStatus() {
  const [data, setData] = useState<Pt[]>(seed)
  const [lines, setLines] = useState<string[]>(['[HexPanel] Conectado al Bridge v1.0.0'])
  const [cmd, setCmd] = useState('')
  const [history, setHistory] = useState<string[]>([])
  const [historyIdx, setHistoryIdx] = useState<number>(-1)
  const [status, setStatus] = useState<'online' | 'offline'>('online')
  const [playitAddr, setPlayitAddr] = useState('play.hexlauncher.gg')
  const box = useRef<HTMLDivElement>(null)

  // Cargar estado inicial
  useEffect(() => {
    api.getServerStatus()
      .then((res: any) => {
        setStatus(res.online ? 'online' : 'offline')
        if (res.playit?.address) setPlayitAddr(res.playit.address)
      })
      .catch(() => {})
  }, [])

  // Escuchar stream en vivo de métricas y consola
  useWsTopic('metrics', (tick: any) => {
    setData((d) => [
      ...d.slice(1),
      {
        t: d[d.length - 1].t + 1,
        cpu: tick.cpu ?? (20 + Math.random() * 20),
        ram: tick.ram_mb ?? (2400 + Math.random() * 200),
        tps: tick.tps ?? 20.0,
        mspt: tick.mspt ?? 8.0,
      },
    ])
  })

  useWsTopic('console', (msg: any) => {
    if (msg.line) {
      setLines((l) => [...l.slice(-400), msg.line])
    }
  })

  useEffect(() => {
    box.current?.scrollTo(0, box.current.scrollHeight)
  }, [lines])

  const last = data[data.length - 1]

  const send = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!cmd.trim()) return
    const commandText = cmd
    setLines((l) => [...l, `> ${commandText}`])
    setHistory((h) => [...h, commandText])
    setHistoryIdx(-1)
    setCmd('')

    try {
      await api.sendServerCommand(commandText)
    } catch (err: any) {
      setLines((l) => [...l, `[Error] ${err.message}`])
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') {
      if (history.length === 0) return
      const nextIdx = historyIdx === -1 ? history.length - 1 : Math.max(0, historyIdx - 1)
      setHistoryIdx(nextIdx)
      setCmd(history[nextIdx])
    } else if (e.key === 'ArrowDown') {
      if (historyIdx === -1) return
      const nextIdx = historyIdx + 1
      if (nextIdx >= history.length) {
        setHistoryIdx(-1)
        setCmd('')
      } else {
        setHistoryIdx(nextIdx)
        setCmd(history[nextIdx])
      }
    }
  }

  const power = async (action: 'start' | 'stop' | 'restart' | 'kill', msg: string) => {
    setLines((l) => [...l, `[HexPanel] ${msg}`])
    try {
      await api.powerServer(action)
      if (action === 'start') setStatus('online')
      if (action === 'stop' || action === 'kill') setStatus('offline')
    } catch (e: any) {
      setLines((l) => [...l, `[HexPanel Error] ${e.message}`])
    }
  }

  return (
    <div className="grid gap-5 max-w-6xl">
      <div className="flex flex-wrap items-center gap-4">
        <h1 className="font-display text-lg tracking-widest neon-text">ESTADO DEL SERVIDOR</h1>
        <Badge tone={status === 'online' ? 'green' : 'red'}>{status === 'online' ? 'Online' : 'Offline'}</Badge>
        <span className="text-muted text-sm font-mono">{playitAddr} · Paper 1.21.11</span>
        <div className="ml-auto flex gap-2">
          <button className="ghost-btn" onClick={() => power('start', 'Iniciando servidor…')}>
            <Play size={13} className="inline mr-1" />Iniciar
          </button>
          <button className="ghost-btn" onClick={() => power('stop', 'Deteniendo servidor…')}>
            <Square size={13} className="inline mr-1" />Detener
          </button>
          <button className="ghost-btn" onClick={() => power('restart', 'Reiniciando servidor…')}>
            <RotateCw size={13} className="inline mr-1" />Reiniciar
          </button>
          <button className="ghost-btn danger" onClick={() => power('kill', 'Proceso terminado (kill)')}>
            <Skull size={13} className="inline mr-1" />Matar
          </button>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-5">
        <Chart data={data} title={`CPU ${last.cpu.toFixed(0)}%`} k="cpu" color="#00d4ff" unit="%" domain={[0, 100]} />
        <Chart data={data} title={`RAM ${last.ram.toFixed(0)} MB`} k="ram" color="#a35bff" unit="MB" />
        <Chart data={data} title={`TPS ${last.tps.toFixed(1)}`} k="tps" color="#00ffa3" unit="" domain={[0, 20]} />
        <Chart data={data} title={`MSPT ${last.mspt.toFixed(1)} ms`} k="mspt" color="#ff2bd6" unit="ms" />
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="px-4 py-2 border-b border-line font-display text-xs tracking-widest text-muted flex items-center gap-2">
          <Terminal size={14} className="text-neon" /> CONSOLA EN VIVO
        </div>
        <div ref={box} className="h-72 overflow-auto p-4 font-mono text-[13px] leading-relaxed" style={{ background: '#03060d' }}>
          {lines.map((l, i) => (
            <div key={i} className={l.startsWith('>') ? 'text-neon font-bold' : l.startsWith('[Error') ? 'text-red-400' : 'text-[#9fe8ff]'}>
              {l}
            </div>
          ))}
        </div>
        <form onSubmit={send} className="flex border-t border-line">
          <span className="px-3 py-2 text-neon font-mono select-none">$</span>
          <input
            value={cmd}
            onChange={(e) => setCmd(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Escribe un comando... (flechas arriba/abajo para historial)"
            className="flex-1 bg-transparent outline-none font-mono text-sm"
          />
        </form>
      </Card>
    </div>
  )
}
