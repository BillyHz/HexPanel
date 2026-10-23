export type TextComp =
  | string
  | { text?: string; color?: string; italic?: boolean; bold?: boolean; extra?: TextComp[] }

export interface Enchant {
  id: string
  level: number
}

export interface ItemDTO {
  slot: number
  id: string
  count: number
  maxStack: number
  hash: string
  name?: TextComp | null
  lore?: TextComp[]
  enchantments?: Enchant[]
  damage?: number
  maxDamage?: number
  glint?: boolean
  dyeColor?: number | string | null
  potionColor?: number | string | null
  headTexture?: string | null
}

export type ContainerType = 'inventory' | 'enderchest'

export interface Container {
  type: ContainerType
  revision: number
  online: boolean
  items: ItemDTO[]
}

export interface ContainersResponse {
  uuid: string
  name: string
  inventory: Container
  enderchest: Container
}

export type ContainersState = Record<ContainerType, Container>

export interface SlotRef {
  c: ContainerType
  slot: number
}

export type Op =
  | { op: 'move'; from: SlotRef; to: SlotRef; count: number | null; expectHash: string }
  | { op: 'split'; from: SlotRef; to: SlotRef; count: number; expectHash: string }
  | { op: 'delete'; from: SlotRef; expectHash: string }
  | { op: 'give'; to: SlotRef; item: string; count: number }

export interface OpsRequest {
  baseRevision: Record<ContainerType, number>
  ops: Op[]
}

export interface OpsResponse {
  containers: ContainersResponse
}

export interface ContainerDiff {
  container: ContainerType
  revision: number
  slots: { slot: number; item: ItemDTO | null }[]
}

export interface CatalogItem {
  id: string
  name: string
  maxStack: number
  category?: string
}

export interface Me {
  id: number
  username: string
  mcName: string
  mcUuid: string
  role: string
  email?: string | null
  permissions: string[]
}

export interface Overview {
  name: string
  uuid: string
  online: boolean
  ip?: string | null
  lastSeen?: string | null
  email?: string | null
  mobsKilled: number
  blocksMined: number
  hoursPlayed: number
  money?: number | null
  workPoints?: number | null
  banned?: boolean
  op?: boolean
  whitelisted?: boolean
}

export interface Advancement {
  id: string
  title: string
  description?: string
  category: string
  done: boolean
  progress?: { done: number; total: number }
}

export interface PlayerRow {
  name: string
  uuid: string
  online: boolean
  banned: boolean
  op: boolean
  whitelisted: boolean
  lastSeen?: string | null
}

export interface PlayersPage {
  items: PlayerRow[]
  total: number
  page: number
  pageSize: number
}

export type ServerState = 'online' | 'offline' | 'starting' | 'stopping'

export interface MetricSample {
  at: number
  tps: number
  mspt: number
  cpu: number
  ramMb: number
  players: number
}

export interface ServerStatus {
  state: ServerState
  uptimeSec: number
  players: { online: number; max: number; names?: string[] }
  playitAddress?: string | null
  current?: MetricSample | null
}

export interface AuditEntry {
  id: number
  at: string
  actor: string
  ip?: string
  action: string
  target?: string | null
  payload?: unknown
  before?: unknown
  after?: unknown
  undoable: boolean
  undone?: boolean
}

export interface AuditPage {
  items: AuditEntry[]
  total: number
  page: number
  pageSize: number
}

export interface PanelUser {
  id: number
  username: string
  mcName: string
  role: string
  lastLogin?: string | null
}

export interface RoleInfo {
  name: string
  permissions: string[]
}

export interface SessionInfo {
  id: string
  ip: string
  userAgent?: string
  createdAt: string
  current: boolean
}

export interface WsMessage {
  topic: string
  type: string
  data: unknown
}
