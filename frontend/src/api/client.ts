import type {
  AuditEntry,
  CatalogItem,
  ContainersResponse,
  Me,
  OpsRequest,
  OpsResponse,
  Overview,
  PanelUser,
  PlayerRow,
  RoleInfo,
  ServerStatus,
} from './types'

let csrfToken: string | null = null

export function setCsrfToken(token: string | null) {
  csrfToken = token
}

export function getCsrfToken(): string | null {
  return csrfToken
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {})
  if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
    headers.set('Content-Type', 'application/json')
  }
  if (csrfToken && !['GET', 'HEAD', 'OPTIONS'].includes(options.method?.toUpperCase() || 'GET')) {
    headers.set('x-csrf-token', csrfToken)
  }

  const res = await fetch(path, {
    ...options,
    headers,
    credentials: 'include',
  })

  if (!res.ok) {
    let errBody: any
    try {
      errBody = await res.json()
    } catch {
      errBody = { message: res.statusText }
    }
    const err = new Error(errBody.message || errBody.detail || 'Error en petición')
    ;(err as any).status = res.status
    ;(err as any).data = errBody
    throw err
  }

  if (res.status === 204) return null as T
  return res.json()
}

export const api = {
  // Auth
  login: async (username: string, password: string) => {
    const res = await request<{ ok: boolean; csrf: string; user: Me }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    })
    setCsrfToken(res.csrf)
    return res
  },
  register: async (username: string, password: string, code: string, email?: string) => {
    const res = await request<{ ok: boolean; csrf: string; user: Me }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password, code, email }),
    })
    setCsrfToken(res.csrf)
    return res
  },
  logout: async () => {
    await request('/api/auth/logout', { method: 'POST' })
    setCsrfToken(null)
  },
  verifyLinkCode: (code: string) => request<{ uuid: string; name: string; kind: string }>(`/api/auth/link/verify?code=${encodeURIComponent(code)}`),

  // Me
  getMe: async () => {
    const me = await request<Me & { csrf?: string }>('/api/me')
    if (me.csrf) setCsrfToken(me.csrf)
    return me
  },
  getMyOverview: () => request<Overview>('/api/me/overview'),
  getMyAchievements: () => request<Record<string, any>>('/api/me/achievements'),
  updateMySettings: (body: { email?: string; new_password?: string }) =>
    request<{ ok: boolean }>('/api/me/settings', { method: 'POST', body: JSON.stringify(body) }),

  // Players
  getPlayers: (q = '', online?: boolean) => {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (online !== undefined) params.set('online', String(online))
    return request<PlayerRow[]>(`/api/players?${params.toString()}`)
  },
  getPlayerOverview: (name: string) => request<Overview>(`/api/players/${encodeURIComponent(name)}/overview`),
  executePlayerAction: (name: string, action: string, args?: Record<string, any>) =>
    request<{ ok: boolean; result: any }>(`/api/players/${encodeURIComponent(name)}/actions`, {
      method: 'POST',
      body: JSON.stringify({ action, args }),
    }),

  // Containers
  getContainers: (name: string) => request<ContainersResponse>(`/api/players/${encodeURIComponent(name)}/containers`),
  applyContainersOps: (name: string, body: OpsRequest) =>
    request<OpsResponse>(`/api/players/${encodeURIComponent(name)}/containers/ops`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  // Server
  getServerStatus: () => request<ServerStatus>('/api/server/status'),
  getServerMetrics: (rangeMinutes = 10) => request<any[]>(`/api/server/metrics?range_minutes=${rangeMinutes}`),
  getServerConsole: (lines = 200) => request<string[]>(`/api/server/console?lines=${lines}`),
  powerServer: (action: 'start' | 'stop' | 'restart' | 'kill') =>
    request<{ ok: boolean; message?: string }>('/api/server/power', {
      method: 'POST',
      body: JSON.stringify({ action }),
    }),
  sendServerCommand: (command: string) =>
    request<{ ok: boolean; result?: any }>('/api/server/command', {
      method: 'POST',
      body: JSON.stringify({ command }),
    }),

  // Items
  getItems: (q = '', category = '') => {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (category) params.set('category', category)
    return request<CatalogItem[]>(`/api/items?${params.toString()}`)
  },

  // Admin
  getAuditLogs: (limit = 50, offset = 0, action?: string) => {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) })
    if (action) params.set('action', action)
    return request<AuditEntry[]>(`/api/admin/audit?${params.toString()}`)
  },
  undoAudit: (id: number) => request<{ ok: boolean }>(`/api/admin/audit/${id}/undo`, { method: 'POST' }),
  getUsers: () => request<PanelUser[]>('/api/admin/users'),
  updateUser: (id: number, body: { role_id?: number; email?: string }) =>
    request<{ ok: boolean }>(`/api/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  getRoles: () => request<RoleInfo[]>('/api/admin/roles'),
}
