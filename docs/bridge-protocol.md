# Protocolo HexPanel Bridge v1

Contrato formal de comunicación entre **HexPanel Backend** (FastAPI) y **HexPanel-Bridge** (plugin Paper 1.21.11, Java 21).

---

## 1. Transporte y Autenticación

- **Host y Puerto**: Exclusivamente en `127.0.0.1:8765` (configurable en `plugins/HexPanelBridge/config.yml`).
- **Seguridad**:
  - Toda petición HTTP debe incluir la cabecera:
    ```http
    Authorization: Bearer <TOKEN_DE_256_BITS>
    ```
  - Las conexiones WebSocket deben enviar el token en la cabecera `Authorization` o como parámetro de consulta `?token=<TOKEN>`.
  - La verificación del token en el Bridge se hace en tiempo constante (`MessageDigest.isEqual`).

---

## 2. Endpoints REST

### `GET /v1/health`
Devuelve el estado de salud del plugin y del servidor Minecraft.

**Respuesta 200 OK:**
```jsonc
{
  "version": "1.0.0",
  "mcVersion": "1.21.11",
  "paper": true,
  "uptime": 3600,
  "offlineEditing": true // false si NMS no está disponible
}
```

---

### `GET /v1/metrics`
Devuelve las métricas de rendimiento y jugadores en tiempo real.

**Respuesta 200 OK:**
```jsonc
{
  "tps": [20.0, 19.95, 20.0], // 1m, 5m, 15m
  "mspt": 8.4,
  "players": {
    "online": 4,
    "max": 20
  },
  "heap": {
    "usedMb": 1024,
    "maxMb": 4096,
    "freeMb": 3072
  },
  "worlds": [
    { "name": "world", "loadedChunks": 625, "entities": 150 }
  ]
}
```

---

### `GET /v1/players?query=&online=`
Lista los jugadores registrados o actualmente conectados.

**Parámetros:**
- `query` *(opcional)*: filtro por nombre o prefijo de UUID.
- `online` *(opcional)*: `true` para solo conectados, `false` para desconectados.

**Respuesta 200 OK:**
```jsonc
[
  {
    "uuid": "069a79f4-44e9-4726-a5be-fca90e38aaf5",
    "name": "Steve",
    "online": true,
    "lastSeen": 1729670000000,
    "lastIp": "127.0.0.1"
  }
]
```

---

### `GET /v1/players/{uuid}/stats`
Estadísticas del jugador (Vanilla, Vault y PlaceholderAPI).

**Respuesta 200 OK:**
```jsonc
{
  "mobKills": 15,
  "blocksMined": 543,
  "playTimeTicks": 648000,
  "deaths": 2,
  "money": 3505038.0, // null si no hay Vault/Economy
  "custom": {
    "jobs_points": 1436
  }
}
```

---

### `GET /v1/players/{uuid}/containers`
Devuelve el inventario principal y el cofre de ender del jugador.

**Respuesta 200 OK:**
```jsonc
{
  "inventory": {
    "type": "inventory",
    "revision": 42,
    "online": true,
    "items": [
      {
        "slot": 0,
        "id": "minecraft:diamond_sword",
        "count": 1,
        "maxStack": 1,
        "hash": "a91f4b82c0de",
        "name": { "text": "Excalibur", "color": "gold" },
        "lore": [],
        "enchantments": [{ "id": "minecraft:sharpness", "level": 5 }],
        "damage": 120,
        "maxDamage": 1561,
        "glint": true
      }
    ]
  },
  "enderchest": {
    "type": "enderchest",
    "revision": 7,
    "online": true,
    "items": []
  }
}
```

---

### `POST /v1/players/{uuid}/containers/ops`
Aplica un lote de operaciones de forma atómica sobre el hilo principal de Minecraft.

**Cuerpo de la petición:**
```jsonc
{
  "baseRevision": { "inventory": 42, "enderchest": 7 },
  "ops": [
    {
      "op": "move",
      "from": { "c": "inventory", "slot": 3 },
      "to": { "c": "enderchest", "slot": 10 },
      "count": null, // null = todo el stack
      "expectHash": "a91f4b82c0de"
    },
    {
      "op": "split",
      "from": { "c": "inventory", "slot": 1 },
      "to": { "c": "inventory", "slot": 2 },
      "count": 32,
      "expectHash": "c01d9f..."
    },
    {
      "op": "delete",
      "from": { "c": "inventory", "slot": 5 },
      "expectHash": "..."
    },
    {
      "op": "give",
      "to": { "c": "inventory", "slot": 8 },
      "item": "minecraft:diamond_sword",
      "count": 1
    }
  ]
}
```

**Respuestas:**
- `200 OK`: Operaciones aplicadas con éxito.
  ```jsonc
  {
    "ok": true,
    "undoRef": "undo_6f98a2b...",
    "containers": { /* estado actualizado */ }
  }
  ```
- `409 Conflict`: Algún `expectHash` o `baseRevision` no coincide (el jugador o el juego modificaron el ítem mientras se editaba). Devuelve el estado actual completo para revertir la UI.
  ```jsonc
  {
    "error": "conflict",
    "message": "Item at slot 3 has changed",
    "containers": { /* estado actual */ }
  }
  ```

---

### `POST /v1/players/{uuid}/containers/undo`
Revierte una operación anterior usando su `undoRef`.

**Cuerpo:**
```jsonc
{
  "undoRef": "undo_6f98a2b..."
}
```

---

### `POST /v1/commands`
Ejecuta un comando en la consola del servidor Minecraft.

**Cuerpo:**
```jsonc
{
  "command": "say Servidor reiniciando en 5 minutos"
}
```

**Respuesta 200 OK:**
```jsonc
{
  "ok": true
}
```

---

### `GET /v1/link/verify?code=XXXXXX&consume=true|false`
Verifica un código de vinculación o recuperación generado con `/panel link` o `/panel reset`.

**Respuesta 200 OK:**
```jsonc
{
  "uuid": "069a79f4-44e9-4726-a5be-fca90e38aaf5",
  "name": "Steve",
  "kind": "link" // o "reset"
}
```
**Respuesta 404 Not Found:** Código inválido o expirado.

---

## 3. Streaming WebSocket (`WS /v1/stream`)

El WebSocket permite streaming bidireccional de eventos y control de observadores.

### Mensajes Enviados por el Cliente al Bridge:
```jsonc
// Activar vigilancia intensiva (WatchTask) sobre un jugador mientras se edita su inventario
{ "action": "watch", "uuid": "069a79f4-44e9-4726-a5be-fca90e38aaf5" }

// Desactivar vigilancia
{ "action": "unwatch", "uuid": "069a79f4-44e9-4726-a5be-fca90e38aaf5" }
```

### Eventos Emitidos por el Bridge al Cliente:

1. **`console.line`** (línea de consola capturada por el appender Log4j):
   ```jsonc
   { "type": "console.line", "data": { "line": "[12:00:00 INFO]: Steve joined the game" } }
   ```

2. **`metrics.tick`** (muestreo periódico cada 1 segundo):
   ```jsonc
   { "type": "metrics.tick", "data": { "tps": 20.0, "mspt": 6.2, "players": 3 } }
   ```

3. **`player.join` / `player.quit`**:
   ```jsonc
   { "type": "player.join", "data": { "uuid": "...", "name": "Steve" } }
   ```

4. **`container.diff`** (cambio detectado en el inventario o cofre de ender):
   ```jsonc
   {
     "type": "container.diff",
     "uuid": "069a79f4-44e9-4726-a5be-fca90e38aaf5",
     "container": "inventory",
     "revision": 43,
     "slots": [
       { "slot": 0, "item": { /* ItemDTO */ } }
     ]
   }
   ```
