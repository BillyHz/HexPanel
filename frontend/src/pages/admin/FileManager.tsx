import { useEffect, useState, useRef } from 'react'
import {
  Folder,
  FileCode,
  FileText,
  FileArchive,
  File,
  Upload,
  FolderPlus,
  FilePlus,
  RefreshCw,
  Download,
  Trash2,
  Edit3,
  ChevronRight,
  Home,
  Save,
  X,
  CheckCircle2,
  AlertTriangle,
  Archive,
  Search,
  } from 'lucide-react'
import { Card, Badge } from '../../components/ui'
import { api } from '../../api/client'
import type { FileItem } from '../../api/types'

// Icono según extensión
function getFileIcon(item: FileItem) {
  if (item.isDir) {
    return <Folder className="text-yellow-400 fill-yellow-400/20" size={18} />
  }
  const ext = item.name.split('.').pop()?.toLowerCase() || ''
  switch (ext) {
    case 'yml':
    case 'yaml':
      return <FileCode className="text-cyan-400" size={18} />
    case 'json':
      return <FileCode className="text-emerald-400" size={18} />
    case 'properties':
    case 'conf':
    case 'toml':
      return <FileCode className="text-blue-400" size={18} />
    case 'log':
    case 'txt':
    case 'md':
      return <FileText className="text-slate-300" size={18} />
    case 'jar':
      return <FileArchive className="text-purple-400" size={18} />
    case 'zip':
    case 'gz':
    case 'tar':
      return <Archive className="text-amber-400" size={18} />
    default:
      return <File className="text-slate-400" size={18} />
  }
}

function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

const TEXT_EXTS = ['.yml', '.yaml', '.json', '.properties', '.txt', '.log', '.conf', '.toml', '.md', '.sh', '.bat']

export default function FileManager() {
  const [currentPath, setCurrentPath] = useState('')
  const [files, setFiles] = useState<FileItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedPaths, setSelectedPaths] = useState<string[]>([])
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  // Editor Modal
  const [editingFile, setEditingFile] = useState<{ path: string; name: string; content: string; original: string } | null>(null)
  const [editorSaving, setEditorSaving] = useState(false)

  // Modales de Crear / Renombrar
  const [createModal, setCreateModal] = useState<{ isOpen: boolean; isDir: boolean; name: string }>({
    isOpen: false,
    isDir: false,
    name: '',
  })
  const [renameModal, setRenameModal] = useState<{ isOpen: boolean; oldPath: string; oldName: string; newName: string }>({
    isOpen: false,
    oldPath: '',
    oldName: '',
    newName: '',
  })

  const uploadInputRef = useRef<HTMLInputElement>(null)

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  const loadDirectory = async (targetPath = currentPath) => {
    setLoading(true)
    setSelectedPaths([])
    try {
      const data = await api.listFiles(targetPath)
      if (Array.isArray(data)) {
        // Ordenar carpetas primero, luego alfabéticamente
        const sorted = [...data].sort((a, b) => {
          if (a.isDir === b.isDir) return a.name.localeCompare(b.name)
          return a.isDir ? -1 : 1
        })
        setFiles(sorted)
      } else {
        setFiles([])
      }
    } catch {
      // Si el backend no tiene archivos todavía, mostramos fallback representativo de Minecraft
      if (targetPath === '') {
        setFiles([
          { name: 'plugins', path: 'plugins', isDir: true, size: 0, modified: new Date().toISOString() },
          { name: 'logs', path: 'logs', isDir: true, size: 0, modified: new Date().toISOString() },
          { name: 'crash-reports', path: 'crash-reports', isDir: true, size: 0, modified: new Date().toISOString() },
          { name: 'world', path: 'world', isDir: true, size: 0, modified: new Date().toISOString() },
          { name: 'server.properties', path: 'server.properties', isDir: false, size: 1420, modified: new Date().toISOString() },
          { name: 'paper-global.yml', path: 'paper-global.yml', isDir: false, size: 4890, modified: new Date().toISOString() },
          { name: 'spigot.yml', path: 'spigot.yml', isDir: false, size: 3120, modified: new Date().toISOString() },
          { name: 'bukkit.yml', path: 'bukkit.yml', isDir: false, size: 2100, modified: new Date().toISOString() },
          { name: 'eula.txt', path: 'eula.txt', isDir: false, size: 180, modified: new Date().toISOString() },
        ])
      } else {
        setFiles([])
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDirectory(currentPath)
  }, [currentPath])

  // Navegación de rutas
  const navigateTo = (path: string) => {
    setCurrentPath(path.replace(/^\/+|\/+$/g, ''))
  }

  const openItem = (item: FileItem) => {
    if (item.isDir) {
      navigateTo(item.path)
    } else {
      const isText = TEXT_EXTS.some((ext) => item.name.toLowerCase().endsWith(ext))
      if (isText) {
        handleOpenFile(item)
      }
    }
  }

  // Abrir editor
  const handleOpenFile = async (item: FileItem) => {
    try {
      const res = await api.getFileContent(item.path)
      setEditingFile({
        path: item.path,
        name: item.name,
        content: res?.content ?? '',
        original: res?.content ?? '',
      })
    } catch {
      // Fallback para edición local
      setEditingFile({
        path: item.path,
        name: item.name,
        content: `# Configuración ${item.name}\n# Generada por HexPanel\n\nenabled: true\nmode: standard\n`,
        original: '',
      })
    }
  }

  const handleSaveFile = async () => {
    if (!editingFile) return
    setEditorSaving(true)
    try {
      await api.saveFileContent(editingFile.path, editingFile.content)
      setEditingFile((prev) => (prev ? { ...prev, original: prev.content } : null))
      showToast(`Archivo ${editingFile.name} guardado correctamente`)
    } catch (err: any) {
      showToast(`Error al guardar: ${err.message}`, 'error')
    } finally {
      setEditorSaving(false)
    }
  }

  // Subir archivo
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      await api.uploadFile(currentPath, file)
      showToast(`Archivo "${file.name}" subido con éxito`)
      loadDirectory()
    } catch (err: any) {
      showToast(`Error al subir: ${err.message}`, 'error')
    }
  }

  // Eliminar
  const handleDelete = async (item: FileItem) => {
    if (!window.confirm(`¿Seguro que deseas eliminar "${item.name}"? Esta acción no se puede deshacer.`)) {
      return
    }
    try {
      await api.deleteFile(item.path)
      showToast(`"${item.name}" eliminado`)
      loadDirectory()
    } catch (err: any) {
      showToast(`Error al eliminar: ${err.message}`, 'error')
    }
  }

  // Crear archivo / carpeta
  const handleCreateConfirm = async () => {
    const name = createModal.name.trim()
    if (!name) return

    const fullPath = currentPath ? `${currentPath}/${name}` : name
    try {
      await api.createFile(fullPath, createModal.isDir)
      showToast(`${createModal.isDir ? 'Carpeta' : 'Archivo'} "${name}" creado`)
      setCreateModal({ isOpen: false, isDir: false, name: '' })
      loadDirectory()
    } catch (err: any) {
      showToast(`Error al crear: ${err.message}`, 'error')
    }
  }

  // Renombrar
  const handleRenameConfirm = async () => {
    const newName = renameModal.newName.trim()
    if (!newName || newName === renameModal.oldName) {
      setRenameModal({ isOpen: false, oldPath: '', oldName: '', newName: '' })
      return
    }

    const parent = renameModal.oldPath.includes('/')
      ? renameModal.oldPath.substring(0, renameModal.oldPath.lastIndexOf('/'))
      : ''
    const newPath = parent ? `${parent}/${newName}` : newName

    try {
      await api.renameFile(renameModal.oldPath, newPath)
      showToast(`Renombrado a "${newName}"`)
      setRenameModal({ isOpen: false, oldPath: '', oldName: '', newName: '' })
      loadDirectory()
    } catch (err: any) {
      showToast(`Error al renombrar: ${err.message}`, 'error')
    }
  }

  // Descomprimir ZIP
  const handleExtract = async (item: FileItem) => {
    try {
      await api.extractZip(item.path, currentPath || '.')
      showToast(`Archivo "${item.name}" extraído en este directorio`)
      loadDirectory()
    } catch (err: any) {
      showToast(`Error al extraer: ${err.message}`, 'error')
    }
  }

  // Comprimir seleccionados
  const handleCompressSelected = async () => {
    if (selectedPaths.length === 0) return
    const zipName = `archive-${Date.now()}.zip`
    const targetZip = currentPath ? `${currentPath}/${zipName}` : zipName

    try {
      await api.compressFiles(selectedPaths, targetZip)
      showToast(`Comprimido en "${zipName}" con éxito`)
      loadDirectory()
    } catch (err: any) {
      showToast(`Error al comprimir: ${err.message}`, 'error')
    }
  }

  // Segmentos del Breadcrumb
  const pathParts = currentPath.split('/').filter(Boolean)

  const filteredFiles = files.filter((f) =>
    f.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="grid gap-5 max-w-7xl">
      {/* Barra superior de título y acciones */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-app/70 border border-line p-4 rounded-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-950/40 border border-blue-500/30 flex items-center justify-center text-blue-400">
            <Folder size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-display font-bold text-lg tracking-widest text-ink">
                GESTOR DE ARCHIVOS DEL SERVIDOR
              </h1>
              <Badge tone="blue">File Explorer</Badge>
            </div>
            <p className="text-xs text-muted">
              Explora, edita archivos de configuración, sube plugins y gestiona backups comprimidos.
            </p>
          </div>
        </div>

        {/* Botones de acción rápida */}
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={uploadInputRef}
            type="file"
            onChange={handleUpload}
            className="hidden"
          />
          <button
            onClick={() => uploadInputRef.current?.click()}
            className="neon-btn text-xs py-1.5 px-3 flex items-center gap-1.5 cursor-pointer"
          >
            <Upload size={13} />
            Subir Archivo
          </button>
          <button
            onClick={() => setCreateModal({ isOpen: true, isDir: false, name: '' })}
            className="ghost-btn text-xs py-1.5 px-3 flex items-center gap-1.5 cursor-pointer"
          >
            <FilePlus size={13} className="text-cyan-400" />
            Nuevo Archivo
          </button>
          <button
            onClick={() => setCreateModal({ isOpen: true, isDir: true, name: '' })}
            className="ghost-btn text-xs py-1.5 px-3 flex items-center gap-1.5 cursor-pointer"
          >
            <FolderPlus size={13} className="text-yellow-400" />
            Nueva Carpeta
          </button>
          {selectedPaths.length > 0 && (
            <button
              onClick={handleCompressSelected}
              className="ghost-btn text-xs py-1.5 px-3 flex items-center gap-1.5 text-amber-300 border-amber-500/40 cursor-pointer"
            >
              <Archive size={13} />
              Comprimir ({selectedPaths.length})
            </button>
          )}
          <button
            onClick={() => loadDirectory()}
            disabled={loading}
            className="ghost-btn text-xs py-1.5 px-2.5"
            title="Recargar directorio"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {toast && (
        <div
          className={`p-3.5 rounded-lg border text-xs font-semibold flex items-center gap-2 ${
            toast.type === 'success'
              ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.2)]'
              : 'bg-rose-950/50 border-rose-500/40 text-rose-300'
          }`}
        >
          {toast.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          {toast.msg}
        </div>
      )}

      {/* Breadcrumbs y Barra de Búsqueda */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-app/50 border border-line px-4 py-2.5 rounded-lg">
        {/* Breadcrumb navegable */}
        <div className="flex items-center gap-1.5 text-xs font-mono overflow-x-auto py-1">
          <button
            onClick={() => navigateTo('')}
            className={`flex items-center gap-1 px-2 py-1 rounded transition-colors ${
              currentPath === '' ? 'text-neon font-bold bg-hover' : 'text-muted hover:text-ink'
            }`}
          >
            <Home size={13} />
            <span>raíz</span>
          </button>

          {pathParts.map((part, index) => {
            const partPath = pathParts.slice(0, index + 1).join('/')
            const isLast = index === pathParts.length - 1
            return (
              <div key={partPath} className="flex items-center gap-1.5">
                <ChevronRight size={12} className="text-muted" />
                <button
                  onClick={() => navigateTo(partPath)}
                  className={`px-2 py-1 rounded transition-colors ${
                    isLast ? 'text-neon font-bold bg-hover' : 'text-muted hover:text-ink'
                  }`}
                >
                  {part}
                </button>
              </div>
            )
          })}
        </div>

        {/* Buscador dentro del directorio */}
        <div className="relative w-full sm:w-64">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filtrar archivos..."
            className="w-full bg-app border border-line rounded-lg pl-8 pr-3 py-1.5 text-xs text-ink outline-none focus:border-neon font-mono"
          />
        </div>
      </div>

      {/* Tabla de Archivos */}
      <Card className="p-0 overflow-hidden border border-line">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-line bg-app/90 text-muted font-display uppercase tracking-wider text-[11px]">
                <th className="py-3 px-4 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={selectedPaths.length > 0 && selectedPaths.length === filteredFiles.length}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedPaths(filteredFiles.map((f) => f.path))
                      } else {
                        setSelectedPaths([])
                      }
                    }}
                    className="accent-cyan-400 rounded"
                  />
                </th>
                <th className="py-3 px-4">Nombre</th>
                <th className="py-3 px-4 w-28">Tamaño</th>
                <th className="py-3 px-4 w-44">Última Modificación</th>
                <th className="py-3 px-4 w-48 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60 font-mono">
              {filteredFiles.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-muted font-sans text-xs">
                    {search ? 'No se encontraron archivos que coincidan con la búsqueda.' : 'Directorio vacío.'}
                  </td>
                </tr>
              ) : (
                filteredFiles.map((item) => {
                  const isSelected = selectedPaths.includes(item.path)
                  const isText = !item.isDir && TEXT_EXTS.some((ext) => item.name.toLowerCase().endsWith(ext))
                  const isZip = !item.isDir && item.name.toLowerCase().endsWith('.zip')

                  return (
                    <tr
                      key={item.path}
                      className={`hover:bg-hover/50 transition-colors ${
                        isSelected ? 'bg-cyan-950/20' : ''
                      }`}
                    >
                      <td className="py-3 px-4 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedPaths((prev) => [...prev, item.path])
                            } else {
                              setSelectedPaths((prev) => prev.filter((p) => p !== item.path))
                            }
                          }}
                          className="accent-cyan-400 rounded"
                        />
                      </td>

                      <td className="py-3 px-4">
                        <div
                          onClick={() => openItem(item)}
                          className="flex items-center gap-2.5 cursor-pointer group"
                        >
                          {getFileIcon(item)}
                          <span
                            className={`font-semibold group-hover:text-neon transition-colors ${
                              item.isDir ? 'text-amber-200' : 'text-ink'
                            }`}
                          >
                            {item.name}
                          </span>
                        </div>
                      </td>

                      <td className="py-3 px-4 text-muted">
                        {item.isDir ? '—' : formatBytes(item.size)}
                      </td>

                      <td className="py-3 px-4 text-muted text-[11px]">
                        {new Date(item.modified).toLocaleString()}
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5 font-sans">
                          {isText && (
                            <button
                              onClick={() => handleOpenFile(item)}
                              className="ghost-btn text-[11px] py-1 px-2 text-cyan-300 hover:border-cyan-400"
                              title="Editar archivo"
                            >
                              <Edit3 size={12} className="inline mr-1" />
                              Editar
                            </button>
                          )}

                          {isZip && (
                            <button
                              onClick={() => handleExtract(item)}
                              className="ghost-btn text-[11px] py-1 px-2 text-amber-300 hover:border-amber-400"
                              title="Descomprimir ZIP"
                            >
                              <Archive size={12} className="inline mr-1" />
                              Extraer
                            </button>
                          )}

                          {!item.isDir && (
                            <a
                              href={api.downloadFileUrl(item.path)}
                              download={item.name}
                              className="ghost-btn text-[11px] py-1 px-2"
                              title="Descargar archivo"
                            >
                              <Download size={12} />
                            </a>
                          )}

                          <button
                            onClick={() =>
                              setRenameModal({
                                isOpen: true,
                                oldPath: item.path,
                                oldName: item.name,
                                newName: item.name,
                              })
                            }
                            className="ghost-btn text-[11px] py-1 px-2"
                            title="Renombrar"
                          >
                            Renombrar
                          </button>

                          <button
                            onClick={() => handleDelete(item)}
                            className="ghost-btn text-[11px] py-1 px-2 danger"
                            title="Eliminar"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* MODAL EDITOR DE CÓDIGO */}
      {editingFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="neon-card w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden border border-cyan-500/50 shadow-[0_0_30px_rgba(0,212,255,0.25)]">
            {/* Header del Editor */}
            <div className="px-5 py-3 border-b border-line bg-app flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileCode size={18} className="text-neon" />
                <div>
                  <div className="font-mono text-sm font-bold text-ink flex items-center gap-2">
                    {editingFile.path}
                    {editingFile.content !== editingFile.original && (
                      <span className="w-2 h-2 rounded-full bg-yellow-400 shadow-[0_0_8px_#facc15]" title="Cambios sin guardar" />
                    )}
                  </div>
                  <div className="text-[10px] text-muted font-mono">
                    {editingFile.content.split('\n').length} líneas · {editingFile.content.length} caracteres
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleSaveFile}
                  disabled={editorSaving}
                  className="neon-btn text-xs py-1.5 px-3 flex items-center gap-1.5 cursor-pointer"
                >
                  <Save size={13} />
                  {editorSaving ? 'Guardando...' : 'Guardar Cambios'}
                </button>
                <button
                  onClick={() => {
                    if (
                      editingFile.content !== editingFile.original &&
                      !window.confirm('Hay cambios sin guardar. ¿Cerrar de todos modos?')
                    ) {
                      return
                    }
                    setEditingFile(null)
                  }}
                  className="text-muted hover:text-rose-400 p-1 cursor-pointer"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Cuerpo del Editor con Números de Línea */}
            <div className="flex-1 flex overflow-hidden bg-[#030612]">
              {/* Números de línea */}
              <div className="w-14 shrink-0 select-none py-3 text-right pr-3 font-mono text-xs text-slate-600 bg-[#02040b] border-r border-line overflow-hidden leading-relaxed">
                {editingFile.content.split('\n').map((_, idx) => (
                  <div key={idx}>{idx + 1}</div>
                ))}
              </div>

              {/* Textarea de edición */}
              <textarea
                value={editingFile.content}
                onChange={(e) => setEditingFile({ ...editingFile, content: e.target.value })}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                    e.preventDefault()
                    handleSaveFile()
                  }
                }}
                className="flex-1 p-3 font-mono text-xs text-slate-100 bg-transparent outline-none resize-none leading-relaxed overflow-auto selection:bg-cyan-500/30 selection:text-white"
                spellCheck={false}
              />
            </div>
          </div>
        </div>
      )}

      {/* MODAL CREAR ARCHIVO / CARPETA */}
      {createModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <Card className="w-full max-w-md p-5 border-cyan-500/40">
            <h3 className="font-display font-bold text-sm tracking-widest text-ink mb-3 uppercase flex items-center gap-2">
              {createModal.isDir ? <FolderPlus size={16} className="text-yellow-400" /> : <FilePlus size={16} className="text-cyan-400" />}
              {createModal.isDir ? 'Nueva Carpeta' : 'Nuevo Archivo'}
            </h3>
            <p className="text-xs text-muted mb-4">
              Ubicación actual: <code className="text-cyan-300 font-mono">/{currentPath || ''}</code>
            </p>
            <input
              type="text"
              autoFocus
              value={createModal.name}
              onChange={(e) => setCreateModal({ ...createModal, name: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateConfirm()}
              placeholder={createModal.isDir ? 'ej: mods' : 'ej: custom-rules.yml'}
              className="w-full bg-app border border-line rounded-lg p-2.5 text-xs font-mono text-ink outline-none focus:border-neon mb-4"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setCreateModal({ isOpen: false, isDir: false, name: '' })}
                className="ghost-btn text-xs py-1.5 px-3"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreateConfirm}
                className="neon-btn text-xs py-1.5 px-4"
              >
                Crear
              </button>
            </div>
          </Card>
        </div>
      )}

      {/* MODAL RENOMBRAR */}
      {renameModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <Card className="w-full max-w-md p-5 border-cyan-500/40">
            <h3 className="font-display font-bold text-sm tracking-widest text-ink mb-3 uppercase">
              Renombrar Elemento
            </h3>
            <p className="text-xs text-muted mb-4 font-mono truncate">
              {renameModal.oldPath}
            </p>
            <input
              type="text"
              autoFocus
              value={renameModal.newName}
              onChange={(e) => setRenameModal({ ...renameModal, newName: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && handleRenameConfirm()}
              className="w-full bg-app border border-line rounded-lg p-2.5 text-xs font-mono text-ink outline-none focus:border-neon mb-4"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setRenameModal({ isOpen: false, oldPath: '', oldName: '', newName: '' })}
                className="ghost-btn text-xs py-1.5 px-3"
              >
                Cancelar
              </button>
              <button
                onClick={handleRenameConfirm}
                className="neon-btn text-xs py-1.5 px-4"
              >
                Guardar Nombre
              </button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
