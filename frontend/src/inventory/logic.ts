import type { CatalogItem, ContainerType, ContainersState, ItemDTO, Op, SlotRef } from '../api/types'

/** Bukkit slot layout (PLAN §7.1). */
export const SLOT_COUNT: Record<ContainerType, number> = { inventory: 41, enderchest: 27 }
export const ARMOR_SLOTS = { boots: 36, leggings: 37, chestplate: 38, helmet: 39 } as const
export const OFFHAND_SLOT = 40

export type PlanFailure = 'same' | 'empty' | 'invalid' | 'full' | 'partial-swap' | 'occupied'
export type PlanKind = 'move' | 'merge' | 'swap' | 'split'
export type PlanResult = { ok: true; kind: PlanKind; ops: Op[] } | { ok: false; reason: PlanFailure }

export const sameRef = (a: SlotRef, b: SlotRef) => a.c === b.c && a.slot === b.slot
export const refKey = (r: SlotRef) => `${r.c}:${r.slot}`
export const parseRefKey = (key: string): SlotRef | null => {
  const [c, s] = key.split(':')
  if ((c !== 'inventory' && c !== 'enderchest') || s === undefined || Number.isNaN(Number(s))) return null
  return { c, slot: Number(s) }
}

export function getItem(state: ContainersState, ref: SlotRef): ItemDTO | undefined {
  return state[ref.c].items.find((i) => i.slot === ref.slot)
}

function setItem(state: ContainersState, ref: SlotRef, item: ItemDTO | null): ContainersState {
  const items = state[ref.c].items.filter((i) => i.slot !== ref.slot)
  if (item) items.push({ ...item, slot: ref.slot })
  return { ...state, [ref.c]: { ...state[ref.c], items } }
}

/** Which armor slot an item belongs to (null = not armor). */
export function armorSlotFor(id: string): number | null {
  const n = id.replace(/^minecraft:/, '')
  if (n.endsWith('_helmet') || n === 'carved_pumpkin' || n === 'turtle_helmet' || n.endsWith('_head') || n.endsWith('_skull'))
    return ARMOR_SLOTS.helmet
  if (n.endsWith('_chestplate') || n === 'elytra') return ARMOR_SLOTS.chestplate
  if (n.endsWith('_leggings')) return ARMOR_SLOTS.leggings
  if (n.endsWith('_boots')) return ARMOR_SLOTS.boots
  return null
}

/** Client-side anticipation of the plugin's validation (the plugin has the final say). */
export function canPlace(id: string, ref: SlotRef): boolean {
  if (ref.c !== 'inventory' || ref.slot < 36 || ref.slot === OFFHAND_SLOT) return true
  return armorSlotFor(id) === ref.slot
}

export function isValuable(item: ItemDTO): boolean {
  return (item.enchantments?.length ?? 0) > 0 || (item.name != null && item.name !== '')
}

export const halfCount = (count: number) => Math.ceil(count / 2)

/** First free slot in a container, preferring hotbar/main for inventories. */
export function firstEmpty(state: ContainersState, c: ContainerType, exclude?: SlotRef): number | null {
  const limit = c === 'inventory' ? 36 : SLOT_COUNT[c]
  for (let s = 0; s < limit; s++) {
    if (exclude && exclude.c === c && exclude.slot === s) continue
    if (!getItem(state, { c, slot: s })) return s
  }
  return null
}

/**
 * Decide what happens when `from` is dropped on `to` (PLAN §7.3 table).
 * `count` = amount to carry (null = whole stack).
 */
export function planDrop(state: ContainersState, from: SlotRef, to: SlotRef, count: number | null = null): PlanResult {
  if (sameRef(from, to)) return { ok: false, reason: 'same' }
  const src = getItem(state, from)
  if (!src) return { ok: false, reason: 'empty' }
  const n = Math.max(1, Math.min(count ?? src.count, src.count))
  const partial = n < src.count
  const dst = getItem(state, to)
  if (!canPlace(src.id, to)) return { ok: false, reason: 'invalid' }

  const mk = (kind: PlanKind): PlanResult => ({
    ok: true,
    kind,
    ops: [
      partial
        ? { op: 'split', from, to, count: n, expectHash: src.hash }
        : { op: 'move', from, to, count: null, expectHash: src.hash },
    ],
  })

  if (!dst) return mk(partial ? 'split' : 'move')
  if (dst.hash === src.hash && src.maxStack > 1) {
    if (dst.count >= dst.maxStack) return { ok: false, reason: 'full' }
    return mk('merge')
  }
  if (partial) return { ok: false, reason: 'partial-swap' }
  if (!canPlace(dst.id, from)) return { ok: false, reason: 'invalid' }
  return mk('swap')
}

export function planDelete(state: ContainersState, from: SlotRef): Op[] | null {
  const src = getItem(state, from)
  return src ? [{ op: 'delete', from, expectHash: src.hash }] : null
}

export function planGive(state: ContainersState, to: SlotRef, item: CatalogItem, count: number): PlanResult {
  if (getItem(state, to)) return { ok: false, reason: 'occupied' }
  if (!canPlace(item.id, to)) return { ok: false, reason: 'invalid' }
  return { ok: true, kind: 'move', ops: [{ op: 'give', to, item: item.id, count: Math.min(count, item.maxStack) }] }
}

/** Pure application of one op, used for optimistic UI and the mock backend. */
export function applyOp(state: ContainersState, op: Op, catalog?: (id: string) => CatalogItem | undefined): ContainersState {
  if (op.op === 'give') {
    if (getItem(state, op.to)) return state
    const base = op.item.split('[')[0]
    const cat = catalog?.(base)
    return setItem(state, op.to, {
      slot: op.to.slot,
      id: base,
      count: op.count,
      maxStack: cat?.maxStack ?? 64,
      hash: `give:${op.item}`,
    })
  }
  const src = getItem(state, op.from)
  if (!src) return state
  if (op.op === 'delete') return setItem(state, op.from, null)

  const n = Math.min(op.count ?? src.count, src.count)
  const dst = getItem(state, op.to)
  if (!dst) {
    if (n === src.count) return setItem(setItem(state, op.from, null), op.to, src)
    return setItem(setItem(state, op.from, { ...src, count: src.count - n }), op.to, { ...src, count: n })
  }
  if (dst.hash === src.hash && src.maxStack > 1) {
    const moved = Math.min(n, dst.maxStack - dst.count)
    if (moved <= 0) return state
    const rest = src.count - moved
    return setItem(setItem(state, op.to, { ...dst, count: dst.count + moved }), op.from, rest > 0 ? { ...src, count: rest } : null)
  }
  if (n !== src.count) return state
  return setItem(setItem(state, op.from, dst), op.to, src)
}

export function applyOps(state: ContainersState, ops: Op[], catalog?: (id: string) => CatalogItem | undefined) {
  return ops.reduce((s, o) => applyOp(s, o, catalog), state)
}

/** Slot references touched by ops, used for rollback highlighting. */
export function opRefs(ops: Op[]): SlotRef[] {
  return ops.flatMap((o) => (o.op === 'give' ? [o.to] : o.op === 'delete' ? [o.from] : [o.from, o.to]))
}
