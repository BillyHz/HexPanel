package dev.hex.panel.bridge.inventory;

import org.bukkit.Bukkit;
import org.bukkit.OfflinePlayer;
import org.bukkit.inventory.ItemStack;

import java.util.UUID;

/**
 * Interface isolating offline player container reads and writes.
 */
public interface OfflinePlayerData {

    boolean isSupported();

    ItemStack[] loadInventory(UUID uuid);

    ItemStack[] loadEnderChest(UUID uuid);

    boolean saveInventory(UUID uuid, ItemStack[] items);

    boolean saveEnderChest(UUID uuid, ItemStack[] items);

    class Fallback implements OfflinePlayerData {
        @Override
        public boolean isSupported() {
            return false;
        }

        @Override
        public ItemStack[] loadInventory(UUID uuid) {
            return new ItemStack[41];
        }

        @Override
        public ItemStack[] loadEnderChest(UUID uuid) {
            return new ItemStack[27];
        }

        @Override
        public boolean saveInventory(UUID uuid, ItemStack[] items) {
            return false;
        }

        @Override
        public boolean saveEnderChest(UUID uuid, ItemStack[] items) {
            return false;
        }
    }
}
