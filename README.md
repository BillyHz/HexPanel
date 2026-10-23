# HexPanel ⚡

Modern, high-performance web administration and player portal for **Paper Minecraft 1.21.11 (Java 21)** servers featuring a signature **Neon Blue Cyberpunk** design system.

---

## 🌟 Key Features

### 🎮 Player Portal & Graphical Containers
- **Neon Cyberpunk UI**: Sleek dark aesthetic with cyan/neon blue glow accents, responsive glassmorphic cards, telemetry KPIs, and *Orbitron* / *Rajdhani* typography.
- **Interactive Inventory & Ender Chest**: Full drag-and-drop powered by `@dnd-kit`, dedicated armor slots, off-hand / shield support, stack splitter sliders, item catalog, and disposal trash slot.
- **Zero-Loss Atomic Concurrency**: Transactional operation batches verified against revision hashes (`expectHash`) on the Minecraft main thread with optimistic rollback on conflict (`409 Conflict`).
- **Account & Stat Tracking**: Real-time player statistics including mob kills, blocks mined, playtime ticks, Vault economy balance, IP history, and live online status.

### 🛡️ Server Management & Operations
- **Live Console & Performance Metrics**: Real-time bi-directional WebSocket console streaming, interactive command execution, and live charts for CPU, RAM, TPS (1m/5m/15m), and MSPT.
- **Server Power Controls**: Safe start, stop, restart, and emergency kill controls with status detection.
- **Visual `server.properties` & MOTD**: Interactive MOTD editor with live Minecraft-style formatted preview, `server-icon.png` uploader, and quick toggles for port, PvP, difficulty, flight, view distance, and max players.
- **Web File Manager**: Full-featured server filesystem browser with path traversal protection, syntax-highlighted code editor, file upload/download, zip compression/extraction, and file creation.
- **Automated & Manual Backups**: One-click world and server backup generator, timestamped archives list, instant restore with safety guards, and direct zip downloads.
- **Scheduled Tasks (Cron Engine)**: Automated recurring tasks for routine world backups, preventive server restarts, and automated broadcast commands.
- **Crash Report & Log Analyzer**: Automated crash report parser with heuristic detection for OutOfMemory (OOM), corrupted chunks, port binding conflicts, and watchdog thread freezes with remediation guides.
- **Modrinth Plugin Market**: Integrated Modrinth catalog search, 1-click plugin download and installation directly into `plugins/`, and JAR file management (enable, disable, delete).
- **Interactive Web Map**: Embedded Dynmap / Pl3xMap / BlueMap iframe integration with custom URL configuration.
- **Discord Webhook Alerts**: Automatic notifications to Discord channels for server startup, shutdown, player joins/leaves, and server crashes with an interactive test ping.
- **Audit Logging with Undo**: Complete event trail for inventory edits and administrative actions with rollback capabilities.

---

## 🏗️ Architecture

```
HexPanel/
├── bridge-plugin/       # Paper Plugin (Java 21, Javalin 6 shaded, dev.hex.panel.bridge)
├── backend/             # FastAPI + SQLModel + SQLite + WebSockets (Python 3.12+)
├── frontend/            # React 19 + TypeScript + Vite + Tailwind CSS v4 + dnd-kit
├── tools/               # Asset extractors, deployment & verification utilities
└── docs/                # Bridge protocol specifications, deployment configs & diagrams
```

---

## 🚀 Quickstart for Development (Standalone / FakeBridge)

You can run and test HexPanel immediately without needing a running Minecraft server using the built-in **FakeBridge**:

### 1. Backend (Python 3.12+)

```bash
cd backend

# Create and activate virtual environment
python -m venv .venv
.\.venv\Scripts\Activate.ps1   # Windows PowerShell
# source .venv/bin/activate    # Linux / macOS

# Install package in editable mode
pip install -e .
pip install pytest

# Initialize admin credentials
python -m app.cli create-admin admin -p admin123

# Run backend with FakeBridge enabled
$env:HEXPANEL_FAKE_BRIDGE="1"
$env:HEXPANEL_COOKIE_SECURE="0"
uvicorn app.main:app --reload --port 8000
```

### 2. Frontend (Node.js 20+)

```bash
cd frontend

# Install dependencies
npm install

# Start Vite dev server with automated proxy to backend
npm run dev
```

Open `http://localhost:5173` in your browser. Log in with:
- **Username:** `admin`
- **Password:** `admin123`

---

## 🎮 Connecting to a Live Minecraft Server

1. Build the Paper bridge plugin with Gradle:
   ```bash
   cd bridge-plugin
   gradle shadowJar
   ```
2. Copy the compiled `.jar` from `bridge-plugin/build/libs/` to your Paper 1.21.11 server's `plugins/` directory.
3. Start the Minecraft server. It will generate `plugins/HexPanelBridge/config.yml` with a secure 256-bit authentication token.
4. Set the bridge connection environment variables on the backend:
   ```env
   HEXPANEL_BRIDGE_URL=http://127.0.0.1:8765
   HEXPANEL_BRIDGE_TOKEN=YOUR_GENERATED_TOKEN
   HEXPANEL_FAKE_BRIDGE=0
   ```

---

## 🐳 Docker Deployment

A production-ready multi-stage `Dockerfile` and `docker-compose.yml` are provided for rapid deployment:

```bash
# Build and run with Docker Compose
docker compose up -d --build
```

Access the panel at `http://your-server-ip:8000`.

---

## 🧪 Testing & Verification

- **Backend Test Suite (Pytest):**
  ```bash
  cd backend
  pytest -v
  ```
- **Frontend Test Suite (Vitest):**
  ```bash
  cd frontend
  npx vitest run
  ```

---

## 🔒 Security & Best Practices

- **Zero Path Traversal**: File manager paths are strictly sandboxed within the server directory using canonical path resolution.
- **HttpOnly Cookies**: Session tokens are isolated from client-side JavaScript to eliminate XSS token theft risks.
- **CSRF Protection**: Double-submit cookie token validation on all mutating API calls.
- **Bridge Constant-Time Comparison**: Token validation uses `MessageDigest.isEqual` to prevent timing attacks.

---

## 📄 License

MIT License. Designed and maintained by [BillyHz](https://github.com/BillyHz).
