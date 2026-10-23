package dev.hex.panel.bridge.inventory;

import dev.hex.panel.bridge.http.BridgeServer;
import org.bukkit.Bukkit;
import org.bukkit.entity.Player;
import org.bukkit.inventory.ItemStack;
import org.bukkit.plugin.Plugin;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Periodically checks watched players for container changes and emits diffs over WebSocket.
 */
public class WatchTask implements Runnable {

    private final Plugin plugin;
    private final InventoryService inventoryService;
    private final BridgeServer bridgeServer;
    private final Set<UUID> watchedPlayers = Collections.newSetFromMap(new ConcurrentHashMap<>());
    private final Map<UUID, Integer> lastInvHashes = new ConcurrentHashMap<>();
    private final Map<UUID, Integer> lastEcHashes = new ConcurrentHashMap<>();

    public WatchTask(Plugin plugin, InventoryService inventoryService, BridgeServer bridgeServer) {
        this.plugin = plugin;
        this.inventoryService = inventoryService;
        this.bridgeServer = bridgeServer;
    }

    public void watch(UUID uuid, boolean enable) {
        if (enable) {
            watchedPlayers.add(uuid);
        } else {
            watchedPlayers.remove(uuid);
            lastInvHashes.remove(uuid);
            lastEcHashes.remove(uuid);
        }
    }

    @Override
    public void run() {
        for (UUID uuid : watchedPlayers) {
            Player player = Bukkit.getPlayer(uuid);
            if (player == null || !player.isOnline()) continue;

            ItemStack[] inv = player.getInventory().getContents();
            int invHash = Arrays.deepHashCode(inv);
            Integer oldInvHash = lastInvHashes.get(uuid);
            if (oldInvHash != null && oldInvHash != invHash) {
                // Emit diff
                int rev = inventoryService.getRevision(uuid, "inventory");
                bridgeServer.broadcastEvent(Map.of(
                    "type", "container.diff",
                    "uuid", uuid.toString(),
                    "container", "inventory",
                    "revision", rev,
                    "data", inventoryService.getContainersDto(uuid).get("inventory")
                ));
            }
            lastInvHashes.put(uuid, invHash);

            ItemStack[] ec = player.getEnderChest().getContents();
            int ecHash = Arrays.deepHashCode(ec);
            Integer oldEcHash = lastEcHashes.get(uuid);
            if (oldEcHash != null && oldEcHash != ecHash) {
                int rev = inventoryService.getRevision(uuid, "enderchest");
                bridgeServer.broadcastEvent(Map.of(
                    "type", "container.diff",
                    "uuid", uuid.toString(),
                    "container", "enderchest",
                    "revision", rev,
                    "data", inventoryService.getContainersDto(uuid).get("enderchest")
                ));
            }
            lastEcHashes.put(uuid, ecHash);
        }
    }
}
