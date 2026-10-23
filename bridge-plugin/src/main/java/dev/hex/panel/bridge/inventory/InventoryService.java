package dev.hex.panel.bridge.inventory;

import dev.hex.panel.bridge.inventory.ops.DefaultSlotRules;
import dev.hex.panel.bridge.inventory.ops.Op;
import dev.hex.panel.bridge.inventory.ops.OpEngine;
import dev.hex.panel.bridge.inventory.ops.OpException;
import dev.hex.panel.bridge.inventory.ops.SlotRules;
import dev.hex.panel.bridge.inventory.ops.Stack;
import org.bukkit.Bukkit;
import org.bukkit.Material;
import org.bukkit.entity.Player;
import org.bukkit.inventory.ItemStack;
import org.bukkit.plugin.Plugin;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutionException;

public class InventoryService {

    private final Plugin plugin;
    private final OfflinePlayerData offlineData;
    private final EditLockManager lockManager;
    private final SlotRules rules = new DefaultSlotRules();
    private final Map<UUID, Integer> inventoryRevisions = new ConcurrentHashMap<>();
    private final Map<UUID, Integer> enderchestRevisions = new ConcurrentHashMap<>();
    private final Map<String, UndoRecord> undoHistory = new ConcurrentHashMap<>();

    public record UndoRecord(UUID playerUuid, Map<String, ItemStack[]> snapshot) {}

    public InventoryService(Plugin plugin, OfflinePlayerData offlineData, EditLockManager lockManager) {
        this.plugin = plugin;
        this.offlineData = offlineData;
        this.lockManager = lockManager;
    }

    public int getRevision(UUID uuid, String container) {
        if ("enderchest".equals(container)) {
            return enderchestRevisions.getOrDefault(uuid, 1);
        }
        return inventoryRevisions.getOrDefault(uuid, 1);
    }

    public Map<String, Object> getContainersDto(UUID uuid) {
        Player player = Bukkit.getPlayer(uuid);
        boolean online = player != null && player.isOnline();

        if (online) {
            try {
                return Bukkit.getScheduler().callSyncMethod(plugin, () -> buildContainersDto(uuid, player, true))
                    .get(2, java.util.concurrent.TimeUnit.SECONDS);
            } catch (Exception e) {
                plugin.getLogger().warning("Error reading player inventory sync: " + e.getMessage());
            }
        }
        return buildContainersDto(uuid, null, false);
    }

    private Map<String, Object> buildContainersDto(UUID uuid, Player player, boolean online) {
        ItemStack[] invContents;
        ItemStack[] ecContents;

        if (online && player != null) {
            invContents = new ItemStack[41];
            ItemStack[] storage = player.getInventory().getContents(); // 0..35
            System.arraycopy(storage, 0, invContents, 0, Math.min(storage.length, 36));
            ItemStack[] armor = player.getInventory().getArmorContents(); // boots=0, leg=1, chest=2, helm=3
            for (int i = 0; i < armor.length; i++) {
                invContents[36 + i] = armor[i];
            }
            invContents[40] = player.getInventory().getItemInOffHand();
            ecContents = player.getEnderChest().getContents();
        } else {
            invContents = offlineData.loadInventory(uuid);
            ecContents = offlineData.loadEnderChest(uuid);
        }

        List<ItemCodec.ItemDto> invDto = new ArrayList<>();
        for (int i = 0; i < invContents.length; i++) {
            ItemCodec.ItemDto d = ItemCodec.toDto(i, invContents[i]);
            if (d != null) invDto.add(d);
        }

        List<ItemCodec.ItemDto> ecDto = new ArrayList<>();
        for (int i = 0; i < ecContents.length; i++) {
            ItemCodec.ItemDto d = ItemCodec.toDto(i, ecContents[i]);
            if (d != null) ecDto.add(d);
        }

        return Map.of(
            "inventory", Map.of(
                "type", "inventory",
                "revision", getRevision(uuid, "inventory"),
                "online", online,
                "items", invDto
            ),
            "enderchest", Map.of(
                "type", "enderchest",
                "revision", getRevision(uuid, "enderchest"),
                "online", online,
                "items", ecDto
            )
        );
    }

    public Map<String, Object> applyOps(UUID uuid, Map<String, Integer> baseRevision, List<Op> ops) throws Exception {
        Player player = Bukkit.getPlayer(uuid);
        boolean online = player != null && player.isOnline();

        if (!online) {
            lockManager.lock(uuid);
        }

        try {
            return Bukkit.getScheduler().callSyncMethod(plugin, () -> {
                int curInvRev = getRevision(uuid, "inventory");
                int curEcRev = getRevision(uuid, "enderchest");

                if (baseRevision != null) {
                    if (baseRevision.containsKey("inventory") && baseRevision.get("inventory") != curInvRev) {
                        throw new OpException(409, "conflict", -1, "La revisión del inventario ha cambiado (" + curInvRev + ")");
                    }
                    if (baseRevision.containsKey("enderchest") && baseRevision.get("enderchest") != curEcRev) {
                        throw new OpException(409, "conflict", -1, "La revisión del cofre de ender ha cambiado (" + curEcRev + ")");
                    }
                }

                // Cargar stacks
                ItemStack[] currentInv = new ItemStack[41];
                ItemStack[] currentEc = new ItemStack[27];

                if (online) {
                    ItemStack[] s = player.getInventory().getContents();
                    System.arraycopy(s, 0, currentInv, 0, Math.min(s.length, 36));
                    ItemStack[] arm = player.getInventory().getArmorContents();
                    for (int i = 0; i < arm.length; i++) currentInv[36 + i] = arm[i];
                    currentInv[40] = player.getInventory().getItemInOffHand();
                    ItemStack[] ec = player.getEnderChest().getContents();
                    System.arraycopy(ec, 0, currentEc, 0, Math.min(ec.length, 27));
                } else {
                    currentInv = offlineData.loadInventory(uuid);
                    currentEc = offlineData.loadEnderChest(uuid);
                }

                // Stacks de OpEngine
                Map<String, Stack[]> opContainers = new HashMap<>();
                opContainers.put("inventory", toOpStacks(currentInv));
                opContainers.put("enderchest", toOpStacks(currentEc));

                var execResult = OpEngine.execute(opContainers, ops, rules);

                // Reconstruir ItemStacks
                ItemStack[] newInv = fromOpStacks(execResult.updatedContainers().get("inventory"), currentInv);
                ItemStack[] newEc = fromOpStacks(execResult.updatedContainers().get("enderchest"), currentEc);

                if (online) {
                    ItemStack[] mainStorage = new ItemStack[36];
                    System.arraycopy(newInv, 0, mainStorage, 0, 36);
                    player.getInventory().setContents(mainStorage);

                    ItemStack[] arm = new ItemStack[4];
                    for (int i = 0; i < 4; i++) arm[i] = newInv[36 + i];
                    player.getInventory().setArmorContents(arm);
                    player.getInventory().setItemInOffHand(newInv[40]);

                    player.getEnderChest().setContents(newEc);
                    player.updateInventory();
                } else {
                    offlineData.saveInventory(uuid, newInv);
                    offlineData.saveEnderChest(uuid, newEc);
                }

                inventoryRevisions.put(uuid, curInvRev + 1);
                enderchestRevisions.put(uuid, curEcRev + 1);

                String undoRef = "undo_" + UUID.randomUUID().toString().substring(0, 8);
                undoHistory.put(undoRef, new UndoRecord(uuid, Map.of("inventory", currentInv, "enderchest", currentEc)));

                return Map.of(
                    "ok", true,
                    "undoRef", undoRef,
                    "containers", getContainersDto(uuid)
                );
            }).get();
        } catch (ExecutionException e) {
            if (e.getCause() instanceof OpException oe) {
                throw oe;
            }
            throw new RuntimeException(e.getCause());
        } finally {
            if (!online) {
                lockManager.unlock(uuid);
            }
        }
    }

    public boolean applyUndo(String undoRef) {
        UndoRecord record = undoHistory.remove(undoRef);
        if (record == null) return false;

        Player player = Bukkit.getPlayer(record.playerUuid());
        boolean online = player != null && player.isOnline();

        ItemStack[] inv = record.snapshot().get("inventory");
        ItemStack[] ec = record.snapshot().get("enderchest");

        if (online) {
            ItemStack[] mainStorage = new ItemStack[36];
            System.arraycopy(inv, 0, mainStorage, 0, 36);
            player.getInventory().setContents(mainStorage);
            ItemStack[] arm = new ItemStack[4];
            for (int i = 0; i < 4; i++) arm[i] = inv[36 + i];
            player.getInventory().setArmorContents(arm);
            player.getInventory().setItemInOffHand(inv[40]);
            player.getEnderChest().setContents(ec);
            player.updateInventory();
        } else {
            offlineData.saveInventory(record.playerUuid(), inv);
            offlineData.saveEnderChest(record.playerUuid(), ec);
        }

        inventoryRevisions.put(record.playerUuid(), getRevision(record.playerUuid(), "inventory") + 1);
        enderchestRevisions.put(record.playerUuid(), getRevision(record.playerUuid(), "enderchest") + 1);
        return true;
    }

    private Stack[] toOpStacks(ItemStack[] bukkit) {
        Stack[] res = new Stack[bukkit.length];
        for (int i = 0; i < bukkit.length; i++) {
            ItemStack is = bukkit[i];
            if (is != null && is.getType() != Material.AIR) {
                ItemCodec.ItemDto d = ItemCodec.toDto(i, is);
                res[i] = new Stack(d.id(), d.hash(), d.maxStack(), d.count(), is);
            }
        }
        return res;
    }

    private ItemStack[] fromOpStacks(Stack[] opStacks, ItemStack[] original) {
        ItemStack[] res = new ItemStack[opStacks.length];
        for (int i = 0; i < opStacks.length; i++) {
            Stack s = opStacks[i];
            if (s != null && s.count() > 0) {
                if (s.payload() instanceof ItemStack is) {
                    ItemStack clone = is.clone();
                    clone.setAmount(s.count());
                    res[i] = clone;
                } else {
                    Material mat = Material.matchMaterial(s.id());
                    if (mat != null) {
                        res[i] = new ItemStack(mat, s.count());
                    }
                }
            }
        }
        return res;
    }
}
