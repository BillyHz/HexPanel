package dev.hex.panel.bridge.http;

import com.fasterxml.jackson.databind.ObjectMapper;
import dev.hex.panel.bridge.HexPanelBridge;
import dev.hex.panel.bridge.auth.LinkCommand;
import dev.hex.panel.bridge.inventory.InventoryService;
import dev.hex.panel.bridge.inventory.WatchTask;
import dev.hex.panel.bridge.inventory.ops.Op;
import dev.hex.panel.bridge.inventory.ops.OpException;
import dev.hex.panel.bridge.inventory.ops.Ref;
import dev.hex.panel.bridge.stats.StatsService;
import io.javalin.Javalin;
import io.javalin.http.Context;
import io.javalin.websocket.WsContext;
import org.bukkit.Bukkit;
import org.bukkit.OfflinePlayer;
import org.bukkit.entity.Player;
import org.bukkit.plugin.Plugin;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.logging.Level;

public class BridgeServer {

    private final Plugin plugin;
    private final String host;
    private final int port;
    private final String token;
    private final InventoryService inventoryService;
    private final StatsService statsService;
    private final LinkCommand linkCommand;
    private WatchTask watchTask;
    private Javalin app;
    private final Set<WsContext> wsClients = Collections.newSetFromMap(new ConcurrentHashMap<>());
    private final ObjectMapper mapper = new ObjectMapper();

    public BridgeServer(
        Plugin plugin,
        String host,
        int port,
        String token,
        InventoryService inventoryService,
        StatsService statsService,
        LinkCommand linkCommand
    ) {
        this.plugin = plugin;
        this.host = host;
        this.port = port;
        this.token = token;
        this.inventoryService = inventoryService;
        this.statsService = statsService;
        this.linkCommand = linkCommand;
    }

    public void setWatchTask(WatchTask watchTask) {
        this.watchTask = watchTask;
    }

    public void start() {
        app = Javalin.create(config -> {
            config.showJavalinBanner = false;
        });

        // Autenticación por token Bearer en tiempo constante
        app.before("/v1/*", this::authenticate);

        // Rutas REST
        app.get("/v1/health", this::handleHealth);
        app.get("/v1/metrics", this::handleMetrics);
        app.get("/v1/players", this::handlePlayers);
        app.get("/v1/players/{uuid}/stats", this::handlePlayerStats);
        app.get("/v1/players/{uuid}/containers", this::handleContainers);
        app.post("/v1/players/{uuid}/containers/ops", this::handleContainersOps);
        app.post("/v1/players/{uuid}/containers/undo", this::handleContainersUndo);
        app.post("/v1/commands", this::handleCommand);
        app.post("/v1/server/stop", this::handleServerStop);
        app.post("/v1/server/restart", this::handleServerRestart);
        app.get("/v1/link/verify", this::handleLinkVerify);

        // WebSocket stream
        app.ws("/v1/stream", ws -> {
            ws.onConnect(ctx -> {
                String auth = ctx.header("Authorization");
                String queryToken = ctx.queryParam("token");
                String provided = (auth != null && auth.startsWith("Bearer ")) ? auth.substring(7) : queryToken;
                if (!isTokenValid(provided)) {
                    ctx.session.close(1008, "Token inválido");
                    return;
                }
                wsClients.add(ctx);
            });
            ws.onClose(wsClients::remove);
            ws.onError(wsClients::remove);
            ws.onMessage(ctx -> {
                try {
                    Map<String, Object> msg = mapper.readValue(ctx.message(), Map.class);
                    String action = (String) msg.get("action");
                    String uuidStr = (String) msg.get("uuid");
                    if (uuidStr != null && watchTask != null) {
                        UUID uuid = UUID.fromString(uuidStr);
                        if ("watch".equalsIgnoreCase(action)) {
                            watchTask.watch(uuid, true);
                        } else if ("unwatch".equalsIgnoreCase(action)) {
                            watchTask.watch(uuid, false);
                        }
                    }
                } catch (Exception ignored) {}
            });
        });

        app.start(host, port);
        plugin.getLogger().info("HexPanel Bridge iniciado en " + host + ":" + port);
    }

    public void stop() {
        if (app != null) {
            app.stop();
        }
    }

    public void broadcastEvent(Map<String, Object> event) {
        try {
            String json = mapper.writeValueAsString(event);
            for (WsContext ctx : wsClients) {
                if (ctx.session.isOpen()) {
                    ctx.send(json);
                }
            }
        } catch (Exception e) {
            plugin.getLogger().log(Level.WARNING, "Error al transmitir evento WS", e);
        }
    }

    private void authenticate(Context ctx) {
        String auth = ctx.header("Authorization");
        if (auth == null || !auth.startsWith("Bearer ")) {
            ctx.status(401).json(Map.of("error", "unauthorized", "message", "Falta cabecera Authorization: Bearer <token>"));
            ctx.skipRemainingHandlers();
            return;
        }
        String provided = auth.substring(7);
        if (!isTokenValid(provided)) {
            ctx.status(401).json(Map.of("error", "unauthorized", "message", "Token inválido"));
            ctx.skipRemainingHandlers();
        }
    }

    private boolean isTokenValid(String provided) {
        if (provided == null) return false;
        byte[] a = token.getBytes(StandardCharsets.UTF_8);
        byte[] b = provided.getBytes(StandardCharsets.UTF_8);
        return MessageDigest.isEqual(a, b);
    }

    private void handleHealth(Context ctx) {
        ctx.json(Map.of(
            "version", plugin.getDescription().getVersion(),
            "mcVersion", Bukkit.getMinecraftVersion(),
            "paper", true,
            "uptime", (System.currentTimeMillis() - HexPanelBridge.STARTED_AT) / 1000,
            "offlineEditing", false
        ));
    }

    private void handleMetrics(Context ctx) {
        ctx.json(statsService.getMetrics());
    }

    private void handlePlayers(Context ctx) {
        String query = ctx.queryParam("query");
        String onlineParam = ctx.queryParam("online");
        Boolean onlineOnly = onlineParam != null ? Boolean.parseBoolean(onlineParam) : null;

        List<Map<String, Object>> result = new ArrayList<>();
        if (Boolean.TRUE.equals(onlineOnly)) {
            for (Player p : Bukkit.getOnlinePlayers()) {
                if (query == null || p.getName().toLowerCase().contains(query.toLowerCase())) {
                    result.add(Map.of(
                        "uuid", p.getUniqueId().toString(),
                        "name", p.getName(),
                        "online", true,
                        "lastSeen", System.currentTimeMillis(),
                        "lastIp", p.getAddress() != null ? p.getAddress().getAddress().getHostAddress() : "unknown"
                    ));
                }
            }
        } else {
            for (OfflinePlayer op : Bukkit.getOfflinePlayers()) {
                if (op.getName() != null && (query == null || op.getName().toLowerCase().contains(query.toLowerCase()))) {
                    boolean isOnline = op.isOnline();
                    if (Boolean.FALSE.equals(onlineOnly) && isOnline) {
                        continue;
                    }
                    Map<String, Object> map = new HashMap<>();
                    map.put("uuid", op.getUniqueId().toString());
                    map.put("name", op.getName());
                    map.put("online", isOnline);
                    map.put("lastSeen", op.getLastSeen());
                    if (isOnline) {
                        Player p = op.getPlayer();
                        if (p != null && p.getAddress() != null && p.getAddress().getAddress() != null) {
                            map.put("lastIp", p.getAddress().getAddress().getHostAddress());
                        }
                    }
                    result.add(map);
                }
            }
        }
        ctx.json(result);
    }

    private void handlePlayerStats(Context ctx) {
        UUID uuid = UUID.fromString(ctx.pathParam("uuid"));
        ctx.json(statsService.getPlayerStats(uuid));
    }

    private void handleContainers(Context ctx) {
        UUID uuid = UUID.fromString(ctx.pathParam("uuid"));
        ctx.json(inventoryService.getContainersDto(uuid));
    }

    private void handleContainersOps(Context ctx) {
        UUID uuid = UUID.fromString(ctx.pathParam("uuid"));
        try {
            Map<String, Object> body = mapper.readValue(ctx.body(), Map.class);
            Map<String, Integer> baseRev = (Map<String, Integer>) body.get("baseRevision");
            List<Map<String, Object>> opsList = (List<Map<String, Object>>) body.get("ops");

            List<Op> parsedOps = new ArrayList<>();
            if (opsList != null) {
                for (var m : opsList) {
                    Op.Type type = Op.Type.valueOf(((String) m.get("op")).toUpperCase());
                    Ref from = parseRef((Map<String, Object>) m.get("from"));
                    Ref to = parseRef((Map<String, Object>) m.get("to"));
                    Ref at = parseRef((Map<String, Object>) m.get("at"));
                    Integer count = m.get("count") != null ? ((Number) m.get("count")).intValue() : null;
                    String expectHash = (String) m.get("expectHash");
                    String item = (String) m.get("item");
                    parsedOps.add(new Op(type, from, to, at, count, expectHash, item));
                }
            }

            var res = inventoryService.applyOps(uuid, baseRev, parsedOps);
            ctx.status(200).json(res);
        } catch (OpException oe) {
            ctx.status(oe.status()).json(Map.of(
                "error", oe.code(),
                "message", oe.getMessage(),
                "containers", inventoryService.getContainersDto(uuid)
            ));
        } catch (Exception e) {
            ctx.status(500).json(Map.of("error", "internal_error", "message", e.getMessage()));
        }
    }

    private Ref parseRef(Map<String, Object> map) {
        if (map == null) return null;
        String c = (String) map.get("c");
        int slot = ((Number) map.get("slot")).intValue();
        return new Ref(c, slot);
    }

    private void handleContainersUndo(Context ctx) {
        try {
            Map<String, Object> body = mapper.readValue(ctx.body(), Map.class);
            String undoRef = (String) body.get("undoRef");
            boolean ok = inventoryService.applyUndo(undoRef);
            if (ok) {
                ctx.json(Map.of("ok", true));
            } else {
                ctx.status(404).json(Map.of("error", "not_found", "message", "Registro de deshacer no encontrado"));
            }
        } catch (Exception e) {
            ctx.status(400).json(Map.of("error", "bad_request", "message", e.getMessage()));
        }
    }

    private void handleCommand(Context ctx) {
        try {
            Map<String, Object> body = mapper.readValue(ctx.body(), Map.class);
            String cmd = (String) body.get("command");
            if (cmd != null && !cmd.isBlank()) {
                Bukkit.getScheduler().runTask(plugin, () -> Bukkit.dispatchCommand(Bukkit.getConsoleSender(), cmd));
                ctx.json(Map.of("ok", true));
            } else {
                ctx.status(400).json(Map.of("error", "missing_command"));
            }
        } catch (Exception e) {
            ctx.status(500).json(Map.of("error", e.getMessage()));
        }
    }

    private void handleServerStop(Context ctx) {
        Bukkit.getScheduler().runTask(plugin, () -> Bukkit.shutdown());
        ctx.json(Map.of("ok", true, "message", "Deteniendo servidor..."));
    }

    private void handleServerRestart(Context ctx) {
        Bukkit.getScheduler().runTask(plugin, () -> Bukkit.spigot().restart());
        ctx.json(Map.of("ok", true, "message", "Reiniciando servidor..."));
    }

    private void handleLinkVerify(Context ctx) {
        String code = ctx.queryParam("code");
        boolean consume = Boolean.parseBoolean(ctx.queryParam("consume"));
        LinkCommand.CodeInfo info = linkCommand.verify(code, consume);
        if (info != null) {
            ctx.json(Map.of(
                "uuid", info.uuid().toString(),
                "name", info.name(),
                "kind", info.kind()
            ));
        } else {
            ctx.status(404).json(Map.of("error", "not_found", "message", "Código inválido o expirado"));
        }
    }
}
