import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, YAxis } from 'recharts'
import { Play, RotateCw, Square, Terminal, Users, Activity, HardDrive, Box, Eye } from 'lucide-react'
import { Badge, Card, SkinBust } from '../../components/ui'
import { api } from '../../api/client'
import { useWsTopic } from '../../api/useWs'

type Pt = { t: number; cpu: number; ram: number; tps: number; mspt: number }

function Chart({ data, title, k, color, unit, domain }: { data: Pt[]; title: string; k: keyof Pt; color: string; unit: string; domain?: [number, number] }) {
  return (
    <Card className="p-4 h-48">
      <div className="flex justify-between text-sm mb-1">
        <span className="font-display tracking-widest text-xs font-semibold" style={{ color }}>{title}</span>
      </div>
      <ResponsiveContainer width="100%" height="85%">
        <AreaChart data={data}>
          <defs>
            <linearGradient id={k} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.45} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#12305a" strokeDasharray="3 3" />
          <YAxis domain={domain} stroke="#6f8bb0" fontSize={11} width={38} />
          <Tooltip
            contentStyle={{ background: '#0a1020', border: '1px solid #12305a', borderRadius: '4px' }}
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
  const [data, setData] = useState<Pt[]>(() =>
    Array.from({ length: 30 }, (_, t) => ({ t, cpu: 0, ram: 1150, tps: 20, mspt: 45 }))
  )
  const [lines, setLines] = useState<string[]>([
    '[HexPanel] Conectado al Bridge v1.0.0 (Paper 1.21.11)',
    '[HexPanel] Sistema listo para monitoreo y administración.',
  ])
  const [cmd, setCmd] = useState('')
  const [history, setHistory] = useState<string[]>([])
  const [historyIdx, setHistoryIdx] = useState<number>(-1)
  const [status, setStatus] = useState<'online' | 'offline'>('online')
  const [playitAddr, setPlayitAddr] = useState('mc-hardcore')
  const [serverMeta, setServerMeta] = useState<any>({
    tps: [20.0, 20.0, 20.0],
    mspt: 45.0,
    onlinePlayers: 0,
    maxPlayers: 10,
    ramUsedMb: 1150,
    ramMaxMb: 4096,
    mcVersion: '1.21.11',
    worlds: [],
  })
  const [onlinePlayerList, setOnlinePlayerList] = useState<any[]>([])
  const box = useRef<HTMLDivElement>(null)

  // Cargar estado inicial y métricas históricas
  useEffect(() => {
    // 1. Estado general
    api.getServerStatus()
      .then((res: any) => {
        setStatus(res.online ? 'online' : 'offline')
        if (res.playit?.address) setPlayitAddr(res.playit.address)

        const m = res.metrics || {}
        const jvm = m.jvm || {}
        setServerMeta({
          tps: m.tps || [20.0, 20.0, 20.0],
          mspt: m.mspt || 45.0,
          onlinePlayers: m.players?.online ?? 0,
          maxPlayers: m.players?.max ?? 10,
          ramUsedMb: m.ram_mb || jvm.usedMb || 1150,
          ramMaxMb: m.max_ram_mb || jvm.maxMb || 4096,
          mcVersion: res.bridge?.mcVersion || '1.21.11',
          worlds: m.worlds || [],
        })
      })
      .catch(() => {})

    // 2. Histórico de métricas
    api.getServerMetrics(10)
      .then((history: any[]) => {
        if (Array.isArray(history) && history.length > 0) {
          const pts = history.map((h, idx) => ({
            t: idx,
            cpu: h.cpu ?? 0,
            ram: h.ram_mb ?? 1150,
            tps: h.tps ?? 20.0,
            mspt: h.mspt ?? 45.0,
          }))
          setData(pts)
        }
      })
      .catch(() => {})

    // 3. Jugadores conectados en vivo
    api.getPlayers('', true)
      .then((players) => {
        if (Array.isArray(players)) {
          setOnlinePlayerList(players)
        }
      })
      .catch(() => {})
  }, [])

  // Escuchar stream en vivo de métricas y consola
  useWsTopic('metrics', (tick: any) => {
    const curTps = tick.tps?.[0] ?? tick.tps ?? 20.0
    const curMspt = tick.mspt ?? 45.0
    const curRam = tick.ram_mb ?? tick.heap?.usedMb ?? 1150
    const curCpu = tick.cpu ?? 0.0

    setData((d) => [
      ...d.slice(1),
      {
        t: d[d.length - 1].t + 1,
        cpu: curCpu,
        ram: curRam,
        tps: curTps,
        mspt: curMspt,
      },
    ])

    setServerMeta((prev: any) => ({
      ...prev,
      tps: tick.tps ? (Array.isArray(tick.tps) ? tick.tps : [tick.tps]) : prev.tps,
      mspt: curMspt,
      ramUsedMb: curRam,
      onlinePlayers: tick.players?.online ?? prev.onlinePlayers,
    }))
  })

  useWsTopic('console', (msg: any) => {
    if (msg.line) {
      setLines((l) => [...l.slice(-400), msg.line])
    }
  })

  useWsTopic('players', () => {
    // Recargar lista si entra o sale un jugador
    api.getPlayers('', true).then((p) => Array.isArray(p) && setOnlinePlayerList(p)).catch(() => {})
  })

  useEffect(() => {
    box.current?.scrollTo(0, box.current.scrollHeight)
  }, [lines])

  const last = data[data.length - 1]

  const sendCommand = async (commandText: string) => {
    if (!commandText.trim()) return
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
      {/* Barra superior de control */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-app/60 border border-line p-4 rounded-xl">
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center">
            <span className={`w-3.5 h-3.5 rounded-full ${status === 'online' ? 'bg-emerald-400 shadow-[0_0_10px_#10b981]' : 'bg-rose-500'}`} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-display font-bold text-base tracking-widest text-ink">MINECRAFT SERVER</h1>
              <Badge tone={status === 'online' ? 'green' : 'red'}>{status === 'online' ? 'ONLINE' : 'OFFLINE'}</Badge>
            </div>
            <div className="text-muted text-xs font-mono mt-0.5">
              Paper {serverMeta.mcVersion} · Host: {playitAddr} · Puerto: 25565
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button className="ghost-btn text-xs py-1.5 px-3" onClick={() => power('start', 'Iniciando servidor…')}>
            <Play size={12} className="inline mr-1 text-emerald-400" /> Iniciar
          </button>
          <button className="ghost-btn text-xs py-1.5 px-3" onClick={() => power('restart', 'Reiniciando servidor…')}>
            <RotateCw size={12} className="inline mr-1 text-cyan-400" /> Reiniciar
          </button>
          <button className="ghost-btn text-xs py-1.5 px-3 danger" onClick={() => power('stop', 'Deteniendo servidor…')}>
            <Square size={12} className="inline mr-1 text-rose-400" /> Detener
          </button>
        </div>
      </div>

      {/* Tarjetas KPI en tiempo real */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4 flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-lg bg-emerald-950/40 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <Activity size={20} />
          </div>
          <div>
            <div className="text-xs text-muted font-display uppercase tracking-wider">TPS / Rendimiento</div>
            <div className="text-xl font-bold font-mono text-emerald-400">
              {Number(serverMeta.tps?.[0] ?? 20.0).toFixed(1)}{' '}
              <span className="text-xs text-muted font-normal">/ 20.0</span>
            </div>
          </div>
        </Card>

        <Card className="p-4 flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-lg bg-purple-950/40 border border-purple-500/30 flex items-center justify-center text-purple-400">
            <HardDrive size={20} />
          </div>
          <div>
            <div className="text-xs text-muted font-display uppercase tracking-wider">Memoria RAM Heap</div>
            <div className="text-xl font-bold font-mono text-purple-300">
              {serverMeta.ramUsedMb}{' '}
              <span className="text-xs text-muted font-normal">/ {serverMeta.ramMaxMb} MB</span>
            </div>
          </div>
        </Card>

        <Card className="p-4 flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-lg bg-cyan-950/40 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
            <Users size={20} />
          </div>
          <div>
            <div className="text-xs text-muted font-display uppercase tracking-wider">Jugadores Conectados</div>
            <div className="text-xl font-bold font-mono text-cyan-400">
              {serverMeta.onlinePlayers}{' '}
              <span className="text-xs text-muted font-normal">/ {serverMeta.maxPlayers} máx</span>
            </div>
          </div>
        </Card>

        <Card className="p-4 flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-lg bg-pink-950/40 border border-pink-500/30 flex items-center justify-center text-pink-400">
            <Box size={20} />
          </div>
          <div>
            <div className="text-xs text-muted font-display uppercase tracking-wider">Mundos y Entidades</div>
            <div className="text-xl font-bold font-mono text-pink-400">
              {serverMeta.worlds?.length || 4}{' '}
              <span className="text-xs text-muted font-normal">mundos ({serverMeta.worlds?.[0]?.entities ?? 969} entidades)</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Gráficos en vivo */}
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Chart data={data} title={`TPS ${last.tps.toFixed(1)}`} k="tps" color="#00ffa3" unit="" domain={[0, 20]} />
        <Chart data={data} title={`MSPT ${last.mspt.toFixed(1)} ms`} k="mspt" color="#ff2bd6" unit="ms" />
        <Chart data={data} title={`RAM ${last.ram.toFixed(0)} MB`} k="ram" color="#a35bff" unit="MB" />
        <Chart data={data} title={`CPU ${last.cpu.toFixed(0)}%`} k="cpu" color="#00d4ff" unit="%" domain={[0, 100]} />
      </div>

      {/* Jugadores en línea actualmente */}
      {onlinePlayerList.length > 0 && (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3 border-b border-line pb-2">
            <div className="text-xs font-display tracking-widest text-muted uppercase flex items-center gap-2">
              <Users size={14} className="text-neon" /> Jugadores conectados ahora ({onlinePlayerList.length})
            </div>
            <Link to="/admin/jugadores" className="text-xs text-neon hover:underline">Ver todos &rarr;</Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {onlinePlayerList.map((p) => (
              <div key={p.uuid} className="flex items-center justify-between p-3 rounded-lg bg-app/50 border border-line">
                <div className="flex items-center gap-3">
                  <div className="scale-[.22] origin-left w-8 h-8">
                    <SkinBust size={140} />
                  </div>
                  <div>
                    <div className="font-bold text-sm text-ink">{p.name}</div>
                    <div className="text-xs text-muted font-mono">{p.lastIp || '172.23.0.1'}</div>
                  </div>
                </div>
                <Link
                  to={`/admin/jugadores/${p.name}`}
                  className="ghost-btn text-xs py-1 px-2.5 flex items-center gap-1.5"
                >
                  <Eye size={12} /> Inventario
                </Link>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Consola en vivo */}
      <Card className="p-0 overflow-hidden border border-line">
        <div className="px-4 py-2.5 border-b border-line font-display text-xs tracking-widest text-muted flex items-center justify-between bg-app/70">
          <div className="flex items-center gap-2">
            <Terminal size={14} className="text-neon" /> CONSOLA EN VIVO DEL SERVIDOR
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-muted mr-1">Comandos rápidos:</span>
            <button onClick={() => sendCommand('list')} className="ghost-btn text-[11px] py-0.5 px-2">list</button>
            <button onClick={() => sendCommand('tps')} className="ghost-btn text-[11px] py-0.5 px-2">tps</button>
            <button onClick={() => sendCommand('weather clear')} className="ghost-btn text-[11px] py-0.5 px-2">clima</button>
            <button onClick={() => sendCommand('time set day')} className="ghost-btn text-[11px] py-0.5 px-2">día</button>
            <button onClick={() => sendCommand('save-all')} className="ghost-btn text-[11px] py-0.5 px-2">guardar</button>
          </div>
        </div>

        <div ref={box} className="h-80 overflow-auto p-4 font-mono text-[13px] leading-relaxed" style={{ background: '#02050b' }}>
          {lines.map((l, i) => (
            <div
              key={i}
              className={
                l.startsWith('>')
                  ? 'text-cyan-400 font-bold'
                  : l.includes('ERROR') || l.startsWith('[Error')
                  ? 'text-red-400'
                  : l.includes('WARN')
                  ? 'text-yellow-400'
                  : l.includes('INFO')
                  ? 'text-[#9fe8ff]'
                  : 'text-slate-300'
              }
            >
              {l}
            </div>
          ))}
        </div>

        <form onSubmit={(e) => { e.preventDefault(); sendCommand(cmd); }} className="flex border-t border-line bg-app/80">
          <span className="px-3.5 py-2.5 text-neon font-mono select-none font-bold">$</span>
          <input
            value={cmd}
            onChange={(e) => setCmd(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Escribe un comando de Minecraft (ej: list, op, gamemode creative, say hola)..."
            className="flex-1 bg-transparent outline-none font-mono text-sm py-2 text-ink placeholder:text-muted/60"
          />
          <button type="submit" className="px-4 text-xs font-display tracking-widest text-neon hover:bg-hover transition-colors font-bold border-l border-line">
            ENVIAR
          </button>
        </form>
      </Card>
    </div>
  )
}
