import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core'
import { Trash2, AlertTriangle } from 'lucide-react'
import { Card, SkinBust } from '../../components/ui'
import { api } from '../../api/client'
import { useWsTopic } from '../../api/useWs'
import {
  ARMOR_SLOTS,
  OFFHAND_SLOT,
  SLOT_COUNT,
  applyOps,
  getItem,
  parseRefKey,
  planDrop,
  refKey,
} from '../../inventory/logic'
import type { CatalogItem, ContainerType, ContainersState, ItemDTO, SlotRef } from '../../api/types'

const EMPTY_CONTAINERS: ContainersState = {
  inventory: { type: 'inventory', revision: 1, online: false, items: [] },
  enderchest: { type: 'enderchest', revision: 1, online: false, items: [] },
}

function ItemTooltip({ item }: { item: ItemDTO }) {
  const nameText = typeof item.name === 'string' ? item.name : item.name?.text || item.id.replace('minecraft:', '').replace('_', ' ')
  return (
    <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-50 w-max max-w-xs p-2 rounded bg-[#100c1c]/95 border-2 border-[#2c1c4d] text-xs font-mono shadow-[0_0_15px_rgba(0,0,0,0.8)]">
      <div className="font-bold text-cyan-300 capitalize">{nameText}</div>
      {item.enchantments && item.enchantments.length > 0 && (
        <div className="text-purple-300 mt-1">
          {item.enchantments.map((e, idx) => (
            <div key={idx}>{e.id.replace('minecraft:', '')} {e.level}</div>
          ))}
        </div>
      )}
      {item.damage !== undefined && item.maxDamage !== undefined && (
        <div className="text-gray-400 mt-1">
          Durabilidad: {item.maxDamage - item.damage} / {item.maxDamage}
        </div>
      )}
    </div>
  )
}

function ItemView({ item }: { item: ItemDTO }) {
  const cleanId = item.id.replace('minecraft:', '')
  const isDamaged = item.damage !== undefined && item.maxDamage !== undefined && item.damage > 0
  const durPercent = isDamaged ? Math.max(0, 100 - (item.damage! / item.maxDamage!) * 100) : 100
  const durColor = durPercent > 60 ? '#00ff88' : durPercent > 25 ? '#ffcc00' : '#ff3344'

  const [imgSrc, setImgSrc] = useState<string>(`/assets/items/${cleanId}.png`)
  const [imgFailed, setImgFailed] = useState<boolean>(false)

  useEffect(() => {
    setImgSrc(`/assets/items/${cleanId}.png`)
    setImgFailed(false)
  }, [cleanId])

  const handleImgError = () => {
    if (imgSrc.startsWith('/assets/items/')) {
      setImgSrc(`https://assets.mcasset.cloud/1.21.1/assets/minecraft/textures/item/${cleanId}.png`)
    } else if (imgSrc.includes('/textures/item/')) {
      setImgSrc(`https://assets.mcasset.cloud/1.21.1/assets/minecraft/textures/block/${cleanId}.png`)
    } else {
      setImgFailed(true)
    }
  }

  const initials = cleanId
    .split('_')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('')

  return (
    <div className="relative group w-10 h-10 flex items-center justify-center select-none">
      {!imgFailed ? (
        <img
          src={imgSrc}
          onError={handleImgError}
          className={`w-8 h-8 object-contain ${item.glint ? 'drop-shadow-[0_0_8px_rgba(163,91,255,0.9)] animate-pulse' : ''}`}
          alt={item.id}
          loading="lazy"
        />
      ) : (
        <div className="w-8 h-8 rounded bg-cyan-950/60 border border-cyan-500/40 flex items-center justify-center text-[10px] font-bold text-cyan-300">
          {initials || '?'}
        </div>
      )}

      {item.count > 1 && (
        <span
          className="absolute -bottom-1 -right-1 font-mono font-bold text-[11px] text-white"
          style={{ textShadow: '1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000' }}
        >
          {item.count}
        </span>
      )}

      {isDamaged && (
        <div className="absolute bottom-0 left-1 right-1 h-1 bg-black/60 rounded-xs overflow-hidden">
          <div className="h-full" style={{ width: `${durPercent}%`, background: durColor }} />
        </div>
      )}

      <ItemTooltip item={item} />
    </div>
  )
}

function CatalogItemIcon({ id }: { id: string }) {
  const cleanId = id.replace('minecraft:', '')
  const [src, setSrc] = useState(`/assets/items/${cleanId}.png`)
  const [failed, setFailed] = useState(false)

  const onError = () => {
    if (src.startsWith('/assets/items/')) {
      setSrc(`https://assets.mcasset.cloud/1.21.1/assets/minecraft/textures/item/${cleanId}.png`)
    } else if (src.includes('/textures/item/')) {
      setSrc(`https://assets.mcasset.cloud/1.21.1/assets/minecraft/textures/block/${cleanId}.png`)
    } else {
      setFailed(true)
    }
  }

  if (failed) {
    return <span className="w-4 h-4 text-[9px] font-bold text-cyan-400">■</span>
  }
  return <img src={src} className="w-4 h-4 object-contain" alt="" onError={onError} loading="lazy" />
}

function Slot({
  c,
  slot,
  item,
  label,
}: {
  c: ContainerType
  slot: number
  item?: ItemDTO
  label?: string
}) {
  const id = refKey({ c, slot })
  const { setNodeRef: dropRef, isOver } = useDroppable({ id })
  const { setNodeRef: dragRef, attributes, listeners, isDragging } = useDraggable({
    id,
    disabled: !item,
  })

  return (
    <div
      ref={dropRef}
      className={`mc-slot relative ${isOver ? 'over' : ''}`}
      style={{ opacity: isDragging ? 0.3 : 1 }}
    >
      {label && !item && (
        <span className="text-[10px] uppercase font-mono text-muted/60 absolute">{label}</span>
      )}
      {item && (
        <div ref={dragRef} {...listeners} {...attributes} className="cursor-grab touch-none">
          <ItemView item={item} />
        </div>
      )}
    </div>
  )
}

export default function PlayerDetail() {
  const { name = 'Steve' } = useParams()
  const [state, setState] = useState<ContainersState>(EMPTY_CONTAINERS)
  const [activeItem, setActiveItem] = useState<ItemDTO | null>(null)
  const [splitDialog, setSplitDialog] = useState<{ from: SlotRef; to: SlotRef; max: number } | null>(null)
  const [splitAmount, setSplitAmount] = useState(1)
  const [catalog, setCatalog] = useState<CatalogItem[]>([])
  const [conflictMsg, setConflictMsg] = useState('')
  const [overview, setOverview] = useState<any>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const loadData = async () => {
    api.getPlayerOverview(name).then(setOverview).catch(() => {})
    try {
      const res = await api.getContainers(name)
      setState({ inventory: res.inventory, enderchest: res.enderchest })
    } catch {
      // Mock data fallback
      setState({
        inventory: {
          type: 'inventory',
          revision: 1,
          online: false,
          items: [
            { slot: 0, id: 'minecraft:diamond_sword', count: 1, maxStack: 1, hash: 'sword1', glint: true },
            { slot: 1, id: 'minecraft:cobblestone', count: 64, maxStack: 64, hash: 'cobble1' },
            { slot: 36, id: 'minecraft:diamond_boots', count: 1, maxStack: 1, hash: 'boots1' },
            { slot: 38, id: 'minecraft:diamond_chestplate', count: 1, maxStack: 1, hash: 'chest1' },
          ],
        },
        enderchest: {
          type: 'enderchest',
          revision: 1,
          online: false,
          items: [{ slot: 0, id: 'minecraft:diamond', count: 32, maxStack: 64, hash: 'dia1' }],
        },
      })
    }
  }

  useEffect(() => {
    loadData()
    api.getItems().then(setCatalog).catch(() => {})
  }, [name])

  // Escuchar diffs del WebSocket en vivo
  useWsTopic(`container:${name}`, (diff: any) => {
    if (diff.container && diff.data) {
      setState((prev) => ({
        ...prev,
        [diff.container]: diff.data,
      }))
    }
  })

  const onDragStart = (e: DragStartEvent) => {
    const ref = parseRefKey(String(e.active.id))
    if (ref) setActiveItem(getItem(state, ref) || null)
  }

  const applyBatch = async (ops: any[]) => {
    setConflictMsg('')
    const prev = state
    setState((s) => applyOps(s, ops))

    try {
      const res = await api.applyContainersOps(name, {
        baseRevision: {
          inventory: prev.inventory.revision,
          enderchest: prev.enderchest.revision,
        },
        ops,
      })
      if (res && res.containers) {
        setState({
          inventory: res.containers.inventory,
          enderchest: res.containers.enderchest,
        })
      }
    } catch (e: any) {
      setState(prev)
      if (e.status === 409) {
        setConflictMsg('¡Conflicto 409! El ítem fue movido en el juego mientras se editaba.')
        loadData()
      } else {
        setConflictMsg(e.message || 'Error al aplicar cambios en el servidor.')
      }
    }
  }

  const onDragEnd = (e: DragEndEvent) => {
    setActiveItem(null)
    if (!e.over) return

    if (e.over.id === 'trash') {
      const from = parseRefKey(String(e.active.id))
      if (!from) return
      const it = getItem(state, from)
      if (it) {
        applyBatch([{ op: 'delete', from, expectHash: it.hash }])
      }
      return
    }

    const from = parseRefKey(String(e.active.id))
    const to = parseRefKey(String(e.over.id))
    if (!from || !to) return

    const it = getItem(state, from)
    if (!it) return

    const isShift = (e.activatorEvent as MouseEvent)?.shiftKey
    if (isShift && it.count > 1) {
      setSplitDialog({ from, to, max: it.count })
      setSplitAmount(Math.floor(it.count / 2))
      return
    }

    const plan = planDrop(state, from, to)
    if (plan.ok) {
      applyBatch(plan.ops)
    }
  }

  const confirmSplit = () => {
    if (!splitDialog) return
    const it = getItem(state, splitDialog.from)
    if (it) {
      applyBatch([
        {
          op: 'split',
          from: splitDialog.from,
          to: splitDialog.to,
          count: splitAmount,
          expectHash: it.hash,
        },
      ])
    }
    setSplitDialog(null)
  }

  const giveItem = (it: CatalogItem) => {
    const emptySlot = Array.from({ length: 36 }, (_, i) => i).find(
      (s) => !getItem(state, { c: 'inventory', slot: s })
    )
    if (emptySlot !== undefined) {
      applyBatch([
        {
          op: 'give',
          to: { c: 'inventory', slot: emptySlot },
          item: it.id,
          count: 1,
        },
      ])
    } else {
      alert('Inventario lleno')
    }
  }

  return (
    <div className="grid gap-5 max-w-6xl">
      <div className="flex flex-wrap items-center gap-4 justify-between">
        <div className="flex items-center gap-3">
          <div className="scale-[.28] origin-left w-10 h-10">
            <SkinBust size={140} name={name} />
          </div>
          <div>
            <h1 className="font-display text-lg tracking-widest neon-text">{name}</h1>
            <p className="text-muted text-xs">Editor gráfico de inventario y cofre de ender (Arrastra para mover)</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => api.executePlayerAction(name, 'kick').then(() => alert('Jugador expulsado'))}
            className="ghost-btn text-xs py-1"
          >
            Expulsar
          </button>
          <button
            onClick={() => api.executePlayerAction(name, 'op').then(() => alert('Permiso OP otorgado'))}
            className="ghost-btn text-xs py-1"
          >
            Dar OP
          </button>
        </div>
      </div>

      {/* Resumen y Estadísticas del Jugador */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card className="p-3 text-center">
          <div className="text-[10px] text-muted font-display uppercase tracking-wider mb-1">Estado</div>
          <div className="flex items-center justify-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${overview?.online ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}`} />
            <span className="font-bold text-xs">{overview?.online ? 'En Línea' : 'Desconectado'}</span>
          </div>
        </Card>
        <Card className="p-3 text-center">
          <div className="text-[10px] text-muted font-display uppercase tracking-wider mb-1">Tiempo Jugado</div>
          <div className="font-bold text-sm text-cyan-400">{overview?.stats?.playTimeHours !== undefined ? `${overview.stats.playTimeHours} h` : '--'}</div>
        </Card>
        <Card className="p-3 text-center">
          <div className="text-[10px] text-muted font-display uppercase tracking-wider mb-1">Bloques Picados</div>
          <div className="font-bold text-sm text-purple-400">{overview?.stats?.blocksMined !== undefined ? overview.stats.blocksMined.toLocaleString() : '--'}</div>
        </Card>
        <Card className="p-3 text-center">
          <div className="text-[10px] text-muted font-display uppercase tracking-wider mb-1">Mobs Eliminados</div>
          <div className="font-bold text-sm text-amber-400">{overview?.stats?.mobKills !== undefined ? overview.stats.mobKills.toLocaleString() : '--'}</div>
        </Card>
        <Card className="p-3 text-center">
          <div className="text-[10px] text-muted font-display uppercase tracking-wider mb-1">Muertes</div>
          <div className="font-bold text-sm text-rose-400">{overview?.stats?.deaths !== undefined ? overview.stats.deaths : '--'}</div>
        </Card>
        <Card className="p-3 text-center">
          <div className="text-[10px] text-muted font-display uppercase tracking-wider mb-1">Cuenta Web</div>
          <div className="font-bold text-xs text-muted truncate" title={overview?.account?.email || 'Sin vincular'}>
            {overview?.account?.email || 'Sin vincular'}
          </div>
        </Card>
      </div>

      {conflictMsg && (
        <div className="p-3 rounded bg-red-950/40 border border-red-500/50 text-red-200 text-xs flex items-center gap-2">
          <AlertTriangle size={15} />
          {conflictMsg}
        </div>
      )}

      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="grid xl:grid-cols-[1.2fr_1fr] gap-5">
          {/* INVENTARIO */}
          <Card className="p-5">
            <h2 className="font-display text-xs tracking-widest mb-4 text-neon flex items-center justify-between">
              <span>INVENTARIO DEL JUGADOR</span>
              <span className="text-muted text-[10px] font-mono">Rev #{state.inventory.revision}</span>
            </h2>

            {/* Armadura + Offhand + Skin */}
            <div className="flex gap-6 mb-5 items-center justify-center p-3 rounded bg-app/30 border border-line/40">
              <div className="grid grid-cols-1 gap-1.5">
                <Slot c="inventory" slot={ARMOR_SLOTS.helmet} item={getItem(state, { c: 'inventory', slot: ARMOR_SLOTS.helmet })} label="Casco" />
                <Slot c="inventory" slot={ARMOR_SLOTS.chestplate} item={getItem(state, { c: 'inventory', slot: ARMOR_SLOTS.chestplate })} label="Peto" />
                <Slot c="inventory" slot={ARMOR_SLOTS.leggings} item={getItem(state, { c: 'inventory', slot: ARMOR_SLOTS.leggings })} label="Grebas" />
                <Slot c="inventory" slot={ARMOR_SLOTS.boots} item={getItem(state, { c: 'inventory', slot: ARMOR_SLOTS.boots })} label="Botas" />
              </div>
              <div className="scale-[.4] origin-center -mx-6">
                <SkinBust size={140} name={name} />
              </div>
              <div className="grid grid-cols-1 gap-1.5 self-end">
                <Slot c="inventory" slot={OFFHAND_SLOT} item={getItem(state, { c: 'inventory', slot: OFFHAND_SLOT })} label="Mano" />
              </div>
            </div>

            {/* Almacén principal 3x9 (slots 9..35) */}
            <div className="grid grid-cols-9 gap-1.5 w-fit mx-auto mb-3">
              {Array.from({ length: 27 }, (_, i) => 9 + i).map((slot) => (
                <Slot key={slot} c="inventory" slot={slot} item={getItem(state, { c: 'inventory', slot })} />
              ))}
            </div>

            {/* Hotbar 1x9 (slots 0..8) */}
            <div className="grid grid-cols-9 gap-1.5 w-fit mx-auto pt-2 border-t border-line/60">
              {Array.from({ length: 9 }, (_, slot) => (
                <Slot key={slot} c="inventory" slot={slot} item={getItem(state, { c: 'inventory', slot })} />
              ))}
            </div>
          </Card>

          {/* COFRE DE ENDER */}
          <div className="grid gap-5">
            <Card className="p-5">
              <h2 className="font-display text-xs tracking-widest mb-4 text-purple-400 flex items-center justify-between">
                <span>COFRE DE ENDER</span>
                <span className="text-muted text-[10px] font-mono">Rev #{state.enderchest.revision}</span>
              </h2>
              <div className="grid grid-cols-9 gap-1.5 w-fit mx-auto">
                {Array.from({ length: SLOT_COUNT.enderchest }, (_, slot) => (
                  <Slot key={slot} c="enderchest" slot={slot} item={getItem(state, { c: 'enderchest', slot })} />
                ))}
              </div>
            </Card>

            <TrashZone />
          </div>
        </div>

        <DragOverlay>
          {activeItem && (
            <div className="mc-slot border-neon shadow-[0_0_12px_rgba(0,212,255,0.8)]">
              <ItemView item={activeItem} />
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {/* Catálogo de Ítems */}
      <Card className="p-5">
        <h2 className="font-display text-xs tracking-widest mb-3 text-muted">CATÁLOGO DE ÍTEMS (CLIC PARA DAR)</h2>
        <div className="flex flex-wrap gap-2 max-h-48 overflow-auto">
          {catalog.map((it) => (
            <button
              key={it.id}
              onClick={() => giveItem(it)}
              className="ghost-btn flex items-center gap-2 py-1 px-2.5 text-xs"
            >
              <CatalogItemIcon id={it.id} />
              {it.name}
            </button>
          ))}
        </div>
      </Card>

      {/* Modal de división */}
      {splitDialog && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-sm p-6 grid gap-4">
            <h3 className="font-display text-sm font-bold text-neon">DIVIDIR STACK</h3>
            <div className="flex justify-between text-sm">
              <span className="text-muted">Cantidad a mover:</span>
              <span className="font-bold text-ink">{splitAmount} / {splitDialog.max}</span>
            </div>
            <input
              type="range"
              min={1}
              max={splitDialog.max}
              value={splitAmount}
              onChange={(e) => setSplitAmount(Number(e.target.value))}
              className="w-full accent-cyan-400"
            />
            <div className="flex gap-2 justify-end mt-2">
              <button onClick={() => setSplitDialog(null)} className="ghost-btn text-xs py-1.5">Cancelar</button>
              <button onClick={confirmSplit} className="neon-btn text-xs py-1.5">Mover {splitAmount}</button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}

function TrashZone() {
  const { setNodeRef, isOver } = useDroppable({ id: 'trash' })
  return (
    <div
      ref={setNodeRef}
      className={`mc-slot !w-full !h-14 gap-2 text-sm font-semibold uppercase transition-colors ${
        isOver ? 'bg-red-500/20 shadow-[0_0_15px_rgba(255,59,107,0.5)]' : ''
      }`}
      style={{ borderColor: 'var(--chip-red)', color: 'var(--chip-red)' }}
    >
      <Trash2 size={18} /> Arrastra aquí para borrar ítem
    </div>
  )
}
