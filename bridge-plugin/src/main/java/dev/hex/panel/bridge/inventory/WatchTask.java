package dev.hex.panel.bridge.inventory;

import dev.hex.panel.bridge.http.BridgeServer;
import org.bukkit.Bukkit;
import org.bukkit.Material;
import org.bukkit.entity.Player;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.meta.Damageable;
import org.bukkit.inventory.meta.ItemMeta;
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
    private final Map<UUID, String> lastInvHashes = new ConcurrentHashMap<>();
    private final Map<UUID, String> lastEcHashes = new ConcurrentHashMap<>();

    public WatchTask(Plugin plugin, InventoryService inventoryService, BridgeServer bridgeServer) {
        this.plugin = plugin;
        this.inventoryService = inventoryService;
        this.bridgeServer = bridgeServer;
    }

    public void watch(UUID uuid, boolean enable) {
        if (enable) {
            watchedPlayers.add(uuid);
            Player p = Bukkit.getPlayer(uuid);
            if (p != null && p.isOnline()) {
                lastInvHashes.put(uuid, computeInvHash(p));
                lastEcHashes.put(uuid, computeEcHash(p));
            }
        } else {
            watchedPlayers.remove(uuid);
            lastInvHashes.remove(uuid);
            lastEcHashes.remove(uuid);
        }
    }

    public void checkPlayer(Player player) {
        if (player == null || !player.isOnline()) return;
        UUID uuid = player.getUniqueId();

        // 1. Inventory check (slots 0..35, armor 36..39, offhand 40)
        String invHash = computeInvHash(player);
        String oldInvHash = lastInvHashes.get(uuid);
        if (oldInvHash != null && !oldInvHash.equals(invHash)) {
            int rev = inventoryService.getRevision(uuid, "inventory");
            Map<String, Object> containers = inventoryService.getContainersDto(uuid);
            Object invData = containers != null ? containers.get("inventory") : null;
            if (invData != null) {
                bridgeServer.broadcastEvent(Map.of(
                    "type", "container.diff",
                    "uuid", uuid.toString(),
                    "name", player.getName(),
                    "container", "inventory",
                    "revision", rev,
                    "data", invData
                ));
            }
        }
        lastInvHashes.put(uuid, invHash);

        // 2. Ender chest check (slots 0..26)
        String ecHash = computeEcHash(player);
        String oldEcHash = lastEcHashes.get(uuid);
        if (oldEcHash != null && !oldEcHash.equals(ecHash)) {
            int rev = inventoryService.getRevision(uuid, "enderchest");
            Map<String, Object> containers = inventoryService.getContainersDto(uuid);
            Object ecData = containers != null ? containers.get("enderchest") : null;
            if (ecData != null) {
                bridgeServer.broadcastEvent(Map.of(
                    "type", "container.diff",
                    "uuid", uuid.toString(),
                    "name", player.getName(),
                    "container", "enderchest",
                    "revision", rev,
                    "data", ecData
                ));
            }
        }
        lastEcHashes.put(uuid, ecHash);
    }

    @Override
    public void run() {
        Set<UUID> toCheck = new HashSet<>(watchedPlayers);
        for (Player p : Bukkit.getOnlinePlayers()) {
            toCheck.add(p.getUniqueId());
        }

        for (UUID uuid : toCheck) {
            Player player = Bukkit.getPlayer(uuid);
            if (player != null && player.isOnline()) {
                checkPlayer(player);
            }
        }
    }

    public static String computeInvHash(Player p) {
        StringBuilder sb = new StringBuilder();
        ItemStack[] storage = p.getInventory().getContents();
        if (storage != null) {
            for (int i = 0; i < Math.min(storage.length, 36); i++) {
                appendItem(sb, i, storage[i]);
            }
        }
        ItemStack[] armor = p.getInventory().getArmorContents();
        if (armor != null) {
            for (int i = 0; i < armor.length; i++) {
                appendItem(sb, 36 + i, armor[i]);
            }
        }
        appendItem(sb, 40, p.getInventory().getItemInOffHand());
        return sb.toString();
    }

    public static String computeEcHash(Player p) {
        StringBuilder sb = new StringBuilder();
        ItemStack[] ec = p.getEnderChest().getContents();
        if (ec != null) {
            for (int i = 0; i < ec.length; i++) {
                appendItem(sb, i, ec[i]);
            }
        }
        return sb.toString();
    }

    private static void appendItem(StringBuilder sb, int slot, ItemStack item) {
        if (item == null || item.getType() == Material.AIR || item.getAmount() <= 0) {
            return;
        }
        sb.append(slot).append(':')
          .append(item.getType().name()).append('x')
          .append(item.getAmount());
        if (item.hasItemMeta()) {
            ItemMeta m = item.getItemMeta();
            if (m instanceof Damageable d) {
                sb.append('d').append(d.getDamage());
            }
            if (m.hasDisplayName()) {
                sb.append('n').append(m.getDisplayName());
            }
            if (m.hasEnchants()) {
                sb.append('e').append(m.getEnchants().hashCode());
            }
        }
        sb.append(';');
    }
}
