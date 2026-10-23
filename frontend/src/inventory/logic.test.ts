import { describe, expect, it } from 'vitest'
import {
  canPlace,
  planDrop,
  applyOps,
  getItem,
  ARMOR_SLOTS,
} from './logic'
import type { ContainersState, ItemDTO } from '../api/types'

const makeState = (): ContainersState => ({
  inventory: {
    type: 'inventory',
    revision: 1,
    online: true,
    items: [],
  },
  enderchest: {
    type: 'enderchest',
    revision: 1,
    online: true,
    items: [],
  },
})

describe('Inventory Logic & Dropping', () => {
  it('prevents placing non-boots into boots slot', () => {
    expect(canPlace('minecraft:diamond_sword', { c: 'inventory', slot: ARMOR_SLOTS.boots })).toBe(false)
    expect(canPlace('minecraft:diamond_boots', { c: 'inventory', slot: ARMOR_SLOTS.boots })).toBe(true)
    expect(canPlace('minecraft:diamond_helmet', { c: 'inventory', slot: ARMOR_SLOTS.helmet })).toBe(true)
  })

  it('plans simple move to empty slot', () => {
    const s = makeState()
    const item: ItemDTO = { slot: 0, id: 'minecraft:diamond_sword', count: 1, maxStack: 1, hash: 'sword_hash' }
    s.inventory.items.push(item)

    const res = planDrop(s, { c: 'inventory', slot: 0 }, { c: 'inventory', slot: 5 })
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.kind).toBe('move')
      expect(res.ops[0]).toEqual({
        op: 'move',
        from: { c: 'inventory', slot: 0 },
        to: { c: 'inventory', slot: 5 },
        count: null,
        expectHash: 'sword_hash',
      })
    }
  })

  it('plans merge when dropping identical stackable item', () => {
    const s = makeState()
    s.inventory.items.push(
      { slot: 0, id: 'minecraft:cobblestone', count: 40, maxStack: 64, hash: 'cobble' },
      { slot: 1, id: 'minecraft:cobblestone', count: 30, maxStack: 64, hash: 'cobble' },
    )

    const res = planDrop(s, { c: 'inventory', slot: 0 }, { c: 'inventory', slot: 1 })
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.kind).toBe('merge')
    }
  })

  it('plans swap when dropping different items', () => {
    const s = makeState()
    s.inventory.items.push(
      { slot: 0, id: 'minecraft:diamond_sword', count: 1, maxStack: 1, hash: 'sword' },
      { slot: 1, id: 'minecraft:iron_pickaxe', count: 1, maxStack: 1, hash: 'pick' },
    )

    const res = planDrop(s, { c: 'inventory', slot: 0 }, { c: 'inventory', slot: 1 })
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.kind).toBe('swap')
    }
  })

  it('applies optimistic ops properly', () => {
    const s = makeState()
    s.inventory.items.push({ slot: 0, id: 'minecraft:diamond', count: 10, maxStack: 64, hash: 'dia' })

    const next = applyOps(s, [
      {
        op: 'split',
        from: { c: 'inventory', slot: 0 },
        to: { c: 'enderchest', slot: 5 },
        count: 4,
        expectHash: 'dia',
      },
    ])

    expect(getItem(next, { c: 'inventory', slot: 0 })?.count).toBe(6)
    expect(getItem(next, { c: 'enderchest', slot: 5 })?.count).toBe(4)
  })
})
