import { useEffect, useState } from 'react'
import { Banknote, Briefcase, FileText, Mail, MailOpen } from 'lucide-react'
import { Badge, Card, InfoRow, KpiCard, SkinBust } from '../components/ui'
import { api } from '../api/client'
import { useAuth } from '../store/useAuth'

export default function Account() {
  const user = useAuth((s) => s.user)
  const [data, setData] = useState({
    name: user?.mcName || user?.username || 'Tecsharp',
    money: '$3505038.0',
    mobs: '15',
    blocks: '543',
    hours: '9.0 horas',
    ip: '127.0.0.1',
    online: false,
    email: user?.email || 'Pendiente',
    points: '1436',
  })

  useEffect(() => {
    api.getMyOverview()
      .then((res: any) => {
        setData({
          name: res.name || user?.mcName || 'Tecsharp',
          money: res.stats?.money !== null ? `$${res.stats?.money}` : '$0.0',
          mobs: String(res.stats?.mobKills ?? 0),
          blocks: String(res.stats?.blocksMined ?? 0),
          hours: `${res.stats?.playTimeHours ?? 0} horas`,
          ip: res.lastIp || '127.0.0.1',
          online: !!res.online,
          email: res.account?.email || user?.email || 'Pendiente',
          points: String(res.stats?.jobsPoints ?? 1436),
        })
      })
      .catch(() => {
        // Fallback mock values
      })
  }, [user])

  return (
    <div className="grid gap-5 max-w-6xl">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-5">
        <KpiCard value={data.money} label="Dinero" />
        <KpiCard value={data.mobs} label="Mobs asesinados" />
        <KpiCard value={data.blocks} label="Bloques rotos" />
        <KpiCard value={data.hours} label="Tiempo jugado" />
      </div>
      <div className="grid lg:grid-cols-[minmax(260px,1fr)_2fr] gap-5">
        <Card className="p-6 flex flex-col items-center gap-6">
          <h2 className="font-display font-bold tracking-widest">{data.name}</h2>
          <SkinBust size={170} />
          <div className="w-full text-center">
            <Badge tone={data.online ? 'green' : 'red'}>{data.online ? 'Conectado' : 'Desconectado'}</Badge>
            <div className="text-muted text-sm mt-1">Estado</div>
            <div className="font-mono font-semibold mt-5">{data.ip}</div>
            <div className="text-muted text-sm">Última IP</div>
          </div>
        </Card>
        <Card className="p-6">
          <h2 className="font-display font-bold tracking-widest text-sm mb-2">INFORMACIÓN DE CUENTA</h2>
          <InfoRow color="blue" icon={<FileText size={18} />} title="Usuario" value={data.name} />
          <InfoRow color="green" icon={<Banknote size={18} />} title="Dinero" value={data.money} />
          <InfoRow color="purple" icon={<Mail size={18} />} title="Correo" value={data.email} />
          <InfoRow color="red" icon={<MailOpen size={18} />} title="Última conexión" value="jueves 21 de septiembre del 2023" />
          <InfoRow color="yellow" icon={<Briefcase size={18} />} title="Puntos de trabajo" value={data.points} />
        </Card>
      </div>
    </div>
  )
}
