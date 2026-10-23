import type {
  AuditEntry,
  BackupItem,
  CatalogItem,
  ContainersResponse,
  CrashReportItem,
  CreateScheduleDTO,
  DiagnosticSummary,
  DiscordConfig,
  FileItem,
  InstalledPlugin,
  MarketPlugin,
  Me,
  OpsRequest,
  OpsResponse,
  Overview,
  PanelUser,
  PlayerRow,
  RoleInfo,
  ScheduleItem,
  ServerPropertiesData,
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

  // Chat & In-game
  sendChatMessage: (message: string) =>
    request<{ ok: boolean }>('/api/server/chat', {
      method: 'POST',
      body: JSON.stringify({ message }),
    }),

  // Server Properties & MOTD
  getServerProperties: async () => {
    try {
      const res = await request<any>('/api/server/properties')
      return res?.properties || res
    } catch {
      return {}
    }
  },
  updateServerProperties: (properties: ServerPropertiesData) =>
    request<{ ok: boolean }>('/api/server/properties', {
      method: 'PUT',
      body: JSON.stringify({ properties }),
    }),
  uploadServerIcon: (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return request<{ ok: boolean; icon_url?: string }>('/api/server/properties/icon', {
      method: 'POST',
      body: formData,
    })
  },

  // File Manager
  listFiles: async (path = '') => {
    const res = await request<any>(`/api/files/list?path=${encodeURIComponent(path)}`)
    const items = Array.isArray(res) ? res : (res?.items || [])
    return items.map((i: any) => ({
      name: i.name,
      path: i.path,
      isDir: Boolean(i.is_dir ?? i.isDir),
      size: i.size || 0,
      modified: i.modified_at || i.modified || new Date().toISOString(),
    })) as FileItem[]
  },
  getFileContent: (path: string) =>
    request<{ content: string; path: string; name?: string }>(`/api/files/read?path=${encodeURIComponent(path)}`),
  saveFileContent: (path: string, content: string) =>
    request<{ ok: boolean }>('/api/files/write', {
      method: 'POST',
      body: JSON.stringify({ path, content }),
    }),
  createFile: (path: string, isDir = false) =>
    request<{ ok: boolean }>('/api/files/create', {
      method: 'POST',
      body: JSON.stringify({ path, is_dir: isDir }),
    }),
  deleteFile: (path: string) =>
    request<{ ok: boolean }>(`/api/files?path=${encodeURIComponent(path)}`, {
      method: 'DELETE',
    }),
  renameFile: (oldPath: string, newPath: string) => {
    const newName = newPath.includes('/') ? newPath.substring(newPath.lastIndexOf('/') + 1) : newPath
    return request<{ ok: boolean }>('/api/files/rename', {
      method: 'POST',
      body: JSON.stringify({ path: oldPath, new_name: newName }),
    })
  },
  uploadFile: (targetDir: string, file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('path', targetDir)
    return request<{ ok: boolean }>('/api/files/upload', {
      method: 'POST',
      body: formData,
    })
  },
  downloadFileUrl: (path: string) => `/api/files/download?path=${encodeURIComponent(path)}`,
  compressFiles: (paths: string[], targetZip: string) =>
    request<{ ok: boolean }>('/api/files/compress', {
      method: 'POST',
      body: JSON.stringify({ path: paths[0] || '.', output_name: targetZip }),
    }),
  extractZip: (path: string, targetDir: string) =>
    request<{ ok: boolean }>('/api/files/extract', {
      method: 'POST',
      body: JSON.stringify({ path, target_dir: targetDir }),
    }),

  // Backups
  getBackups: async () => {
    const res = await request<any[]>('/api/backups')
    return (res || []).map((b) => ({
      id: b.filename || b.id || b.name,
      name: b.name || b.filename,
      sizeBytes: b.size ?? b.sizeBytes ?? 0,
      createdAt: b.created_at || b.createdAt || new Date().toISOString(),
      status: (b.status || 'completed') as 'completed' | 'in_progress' | 'failed',
    })) as BackupItem[]
  },
  createBackup: (name?: string) =>
    request<{ ok: boolean; backup?: BackupItem }>('/api/backups', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  restoreBackup: (backupId: string) =>
    request<{ ok: boolean }>(`/api/backups/${encodeURIComponent(backupId)}/restore`, {
      method: 'POST',
    }),
  deleteBackup: (backupId: string) =>
    request<{ ok: boolean }>(`/api/backups/${encodeURIComponent(backupId)}`, {
      method: 'DELETE',
    }),
  downloadBackupUrl: (backupId: string) => `/api/backups/${encodeURIComponent(backupId)}/download`,

  // Schedules (Cron)
  getSchedules: async () => {
    const res = await request<any[]>('/api/schedules')
    return (res || []).map((s) => ({
      id: s.id,
      name: s.name,
      actionType: s.action_type || s.actionType,
      cron: s.cron_expr || s.cron,
      payload: s.payload,
      nextRun: s.next_run || s.nextRun,
      enabled: Boolean(s.enabled),
    })) as ScheduleItem[]
  },
  createSchedule: (task: CreateScheduleDTO) =>
    request<{ ok: boolean; task: ScheduleItem }>('/api/schedules', {
      method: 'POST',
      body: JSON.stringify({
        name: task.name,
        cron_expr: task.cron,
        action_type: task.actionType,
        payload: task.payload || '',
        enabled: task.enabled ?? true,
      }),
    }),
  toggleSchedule: (id: string | number, enabled: boolean) =>
    request<{ ok: boolean }>(`/api/schedules/${id}/toggle`, {
      method: 'POST',
      body: JSON.stringify({ enabled }),
    }),
  runScheduleNow: (id: string | number) =>
    request<{ ok: boolean }>(`/api/schedules/${id}/run`, {
      method: 'POST',
    }),
  deleteSchedule: (id: string | number) =>
    request<{ ok: boolean }>(`/api/schedules/${id}`, {
      method: 'DELETE',
    }),

  // Marketplace & Plugins
  searchPluginMarket: async (q = '') => {
    const res = await request<any>(`/api/plugins/market?q=${encodeURIComponent(q)}`)
    const list = Array.isArray(res) ? res : (res?.hits || [])
    return list.map((p: any) => ({
      id: p.id,
      slug: p.slug,
      title: p.title,
      author: p.author,
      description: p.description,
      iconUrl: p.icon_url || p.iconUrl,
      downloads: p.downloads || 0,
      categories: p.categories || [],
    })) as MarketPlugin[]
  },
  installPlugin: (pluginId: string, versionId?: string) =>
    request<{ ok: boolean; message?: string }>('/api/plugins/install', {
      method: 'POST',
      body: JSON.stringify({ project_id: pluginId, version_id: versionId }),
    }),
  getInstalledPlugins: async () => {
    const res = await request<any[]>('/api/plugins/installed')
    return (res || []).map((p) => ({
      filename: p.filename,
      name: p.name,
      version: p.version,
      enabled: Boolean(p.enabled),
      sizeBytes: p.size ?? p.sizeBytes ?? 0,
      description: p.description,
    })) as InstalledPlugin[]
  },
  togglePluginState: (filename: string, enable?: boolean) =>
    request<{ ok: boolean }>('/api/plugins/toggle', {
      method: 'POST',
      body: JSON.stringify({ filename, enable }),
    }),
  deleteInstalledPlugin: (filename: string) =>
    request<{ ok: boolean }>(`/api/plugins/${encodeURIComponent(filename)}`, {
      method: 'DELETE',
    }),

  // Crash Analyzer & Diagnostics
  getCrashReports: async () => {
    const res = await request<any[]>('/api/server/crashes')
    return (res || []).map((c) => ({
      id: c.id || c.filename,
      filename: c.filename,
      timestamp: c.date || c.timestamp || '',
      cause: c.diagnosed_cause || c.cause || '',
      explanation: c.excerpt || c.explanation || '',
      recommendation: c.recommendation || '',
      rawReport: c.raw || c.rawReport,
    })) as CrashReportItem[]
  },
  getCrashDetails: (id: string) =>
    request<any>(`/api/server/crashes/${encodeURIComponent(id)}`),
  analyzeLatestLog: () => request<DiagnosticSummary>('/api/server/crashes'),

  // Discord Notifications
  getDiscordSettings: async () => {
    const res = await request<any>('/api/discord/settings')
    return {
      webhookUrl: res?.webhook_url ?? res?.webhookUrl ?? '',
      notifyStart: res?.notify_on_start ?? res?.notifyStart ?? true,
      notifyStop: res?.notify_on_stop ?? res?.notifyStop ?? true,
      notifyCrash: res?.notify_on_crash ?? res?.notifyCrash ?? true,
      notifyLowTps: res?.notify_on_low_tps ?? res?.notifyLowTps ?? true,
      notifyPlayerJoinLeave: res?.notify_on_join_leave ?? res?.notifyPlayerJoinLeave ?? false,
    } as DiscordConfig
  },
  updateDiscordSettings: (config: DiscordConfig) =>
    request<{ ok: boolean }>('/api/discord/settings', {
      method: 'PUT',
      body: JSON.stringify({
        webhook_url: config.webhookUrl,
        notify_on_start: config.notifyStart,
        notify_on_stop: config.notifyStop,
        notify_on_crash: config.notifyCrash,
        notify_on_low_tps: config.notifyLowTps,
        enabled: true,
      }),
    }),
  testDiscordWebhook: (url?: string) =>
    request<{ ok: boolean; message?: string }>('/api/discord/test', {
      method: 'POST',
      body: JSON.stringify({ webhook_url: url }),
    }),

  // 3D Map
  getMapConfig: () => request<{ url: string; enabled: boolean; title?: string }>('/api/server/map'),
  updateMapConfig: (url: string, enabled = true) =>
    request<{ ok: boolean }>('/api/server/map', {
      method: 'PUT',
      body: JSON.stringify({ url, enabled }),
    }),
  getMapStatus: () =>
    request<{
      installed: boolean
      plugin_name: string
      online: boolean
      url: string
      enabled: boolean
    }>('/api/server/map/status'),
  triggerMapAction: (action: 'render' | 'pause' | 'reload' | 'cancel') =>
    request<{ status: string; result?: any }>('/api/server/map/action', {
      method: 'POST',
      body: JSON.stringify({ action }),
    }),
}
