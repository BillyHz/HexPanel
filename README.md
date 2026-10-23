# HexPanel ⚡

Panel web de administración para servidores Minecraft Paper 1.21.11 (Java 21) con temática **Neon Cyberpunk Azul**.

---

## 🌟 Características

- **Diseño Neon Cyberpunk Azul**: Interfaz oscura de alta fidelidad con efectos de resplandor cian/azul neón, tarjetas reactivas, KPIs y tipografía *Orbitron* / *Rajdhani*.
- **Portal de Cuenta**: Estadísticas en tiempo real (mobs eliminados, bloques rotos, tiempo jugado, saldo económico, IP y estado de conexión).
- **Inventario y Cofre de Ender Gráficos**: Drag & drop interactivo con [@dnd-kit](https://dndkit.com), validación de slots de armadura, mano secundaria, división de stacks con slider, catálogo de ítems y papelera.
- **Concurrencia Atómica y Cero Pérdidas**: Lote transaccional de operaciones verificado con hashes (`expectHash`) y rollback optimista ante conflictos (`409 Conflict`).
- **Estado del Servidor y Consola en Vivo**: Gráficas de CPU, RAM, TPS y MSPT; consola en tiempo real por WebSocket con historial y botones de energía (Iniciar, Detener, Reiniciar, Kill).
- **Auditoría con Deshacer**: Registro detallado de todas las operaciones de inventario y moderación, con capacidad de revertir cambios.
- **Autenticación y Vinculación Segura**: Vinculación de cuentas offline mediante el comando `/panel link` en el servidor, sesiones `httpOnly` y protección CSRF.

---

## 🏗️ Arquitectura

```
HexPanel/
├── bridge-plugin/       # Plugin Paper (Java 21, Javalin 6 shaded, dev.hex.panel.bridge)
├── backend/             # FastAPI + SQLModel + SQLite + WebSockets
├── frontend/            # React 19 + TypeScript + Vite + Tailwind CSS v4 + dnd-kit
├── tools/               # extract_assets.py (renderizado isométrico de ítems)
└── docs/                # bridge-protocol.md, referencia-diseno.png, Caddyfile
```

---

## 🚀 Inicio Rápido en Desarrollo (Modo Independiente / FakeBridge)

Puedes probar el panel inmediatamente sin necesidad de tener un servidor Minecraft encendido gracias al **FakeBridge** integrado:

### 1. Backend (Python 3.12+)

```bash
cd backend

# Crear entorno virtual
python -m venv .venv
# Activar entorno (Windows PowerShell)
.\.venv\Scripts\Activate.ps1

# Instalar dependencias
pip install -e .
pip install pytest

# Crear usuario administrador inicial
python -m app.cli create-admin admin -p admin123

# Iniciar backend con FakeBridge habilitado
$env:HEXPANEL_FAKE_BRIDGE="1"
$env:HEXPANEL_COOKIE_SECURE="0"
uvicorn app.main:app --reload --port 8000
```

### 2. Frontend (Node.js 20+)

```bash
cd frontend

# Instalar dependencias
npm install

# Iniciar servidor de desarrollo Vite con proxy automático al backend
npm run dev
```

Abre tu navegador en `http://localhost:5173`. Inicia sesión con:
- **Usuario:** `admin`
- **Contraseña:** `admin123`

---

## 🎮 Conexión con Servidor Minecraft Real

1. Compila el plugin del bridge con Gradle:
   ```bash
   cd bridge-plugin
   gradle shadowJar
   ```
2. Copia el archivo `.jar` generado en `bridge-plugin/build/libs/` a la carpeta `plugins/` de tu servidor Paper 1.21.11.
3. Inicia el servidor Minecraft. Se generará un archivo `plugins/HexPanelBridge/config.yml` con un token seguro de 256 bits.
4. En el archivo de configuración o variables de entorno del backend, configura:
   ```env
   HEXPANEL_BRIDGE_URL=http://127.0.0.1:8765
   HEXPANEL_BRIDGE_TOKEN=TU_TOKEN_GENERADO
   HEXPANEL_FAKE_BRIDGE=0
   ```

---

## 🧪 Pruebas Unitarias

- **Backend (Pytest):**
  ```bash
  cd backend
  pytest -v
  ```
- **Frontend (Vitest):**
  ```bash
  cd frontend
  npx vitest run
  ```

---

## 🔒 Despliegue en Producción

Consulta la guía y el archivo de ejemplo en [docs/deploy/Caddyfile](docs/deploy/Caddyfile) para configurar un proxy inverso HTTPS con Caddy o Cloudflare Tunnel.
