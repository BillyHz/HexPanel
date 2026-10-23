package dev.hex.panel.bridge;

import dev.hex.panel.bridge.auth.LinkCommand;
import dev.hex.panel.bridge.console.ConsoleAppender;
import dev.hex.panel.bridge.http.BridgeServer;
import dev.hex.panel.bridge.inventory.EditLockManager;
import dev.hex.panel.bridge.inventory.InventoryService;
import dev.hex.panel.bridge.inventory.OfflinePlayerData;
import dev.hex.panel.bridge.inventory.WatchTask;
import dev.hex.panel.bridge.stats.StatsService;
import org.bukkit.Bukkit;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerQuitEvent;
import org.bukkit.plugin.java.JavaPlugin;

import java.security.SecureRandom;
import java.util.Base64;
import java.util.Map;

public class HexPanelBridge extends JavaPlugin implements Listener {

    public static long STARTED_AT;

    private BridgeServer bridgeServer;
    private WatchTask watchTask;

    @Override
    public void onEnable() {
        STARTED_AT = System.currentTimeMillis();

        saveDefaultConfig();
        String token = getConfig().getString("token");
        if (token == null || token.isBlank() || token.equals("GENERATED_ON_FIRST_START")) {
            byte[] rand = new byte[32];
            new SecureRandom().nextBytes(rand);
            token = Base64.getUrlEncoder().withoutPadding().encodeToString(rand);
            getConfig().set("token", token);
            saveConfig();
            getLogger().info("Generado nuevo token de autenticación para HexPanel Bridge.");
        }

        String host = getConfig().getString("host", "127.0.0.1");
        int port = getConfig().getInt("port", 8765);

        EditLockManager lockManager = new EditLockManager();
        Bukkit.getPluginManager().registerEvents(lockManager, this);
        Bukkit.getPluginManager().registerEvents(this, this);

        OfflinePlayerData offlineData = new OfflinePlayerData.Fallback();
        InventoryService inventoryService = new InventoryService(this, offlineData, lockManager);
        StatsService statsService = new StatsService(this);
        LinkCommand linkCommand = new LinkCommand();

        if (getCommand("panel") != null) {
            getCommand("panel").setExecutor(linkCommand);
        }

        bridgeServer = new BridgeServer(this, host, port, token, inventoryService, statsService, linkCommand);
        watchTask = new WatchTask(this, inventoryService, bridgeServer);
        bridgeServer.setWatchTask(watchTask);

        ConsoleAppender.setBridgeServer(bridgeServer);

        try {
            bridgeServer.start();
        } catch (Exception e) {
            getLogger().severe("No se pudo iniciar el servidor HTTP de HexPanel Bridge: " + e.getMessage());
        }

        // Tarea de vigilancia cada 4 ticks (200ms)
        Bukkit.getScheduler().runTaskTimer(this, watchTask, 20L, 4L);

        // Tarea de métricas cada 20 ticks (1s) para streaming WS
        Bukkit.getScheduler().runTaskTimer(this, () -> {
            try {
                bridgeServer.broadcastEvent(Map.of(
                    "type", "metrics.tick",
                    "data", statsService.getMetrics()
                ));
            } catch (Exception ignored) {}
        }, 40L, 20L);

        getLogger().info("HexPanel Bridge v" + getDescription().getVersion() + " habilitado.");
    }

    @Override
    public void onDisable() {
        if (bridgeServer != null) {
            bridgeServer.stop();
        }
        getLogger().info("HexPanel Bridge deshabilitado.");
    }

    @EventHandler
    public void onPlayerJoin(PlayerJoinEvent event) {
        if (bridgeServer != null) {
            bridgeServer.broadcastEvent(Map.of(
                "type", "player.join",
                "data", Map.of(
                    "uuid", event.getPlayer().getUniqueId().toString(),
                    "name", event.getPlayer().getName(),
                    "ip", event.getPlayer().getAddress() != null ? event.getPlayer().getAddress().getAddress().getHostAddress() : ""
                )
            ));
        }
    }

    @EventHandler
    public void onPlayerQuit(PlayerQuitEvent event) {
        if (bridgeServer != null) {
            bridgeServer.broadcastEvent(Map.of(
                "type", "player.quit",
                "data", Map.of(
                    "uuid", event.getPlayer().getUniqueId().toString(),
                    "name", event.getPlayer().getName()
                )
            ));
        }
    }
}
