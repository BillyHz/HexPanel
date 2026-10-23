package dev.hex.panel.bridge.inventory;

import org.bukkit.Material;
import org.bukkit.enchantments.Enchantment;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.meta.Damageable;
import org.bukkit.inventory.meta.ItemMeta;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;

/**
 * Encodes and decodes Bukkit ItemStacks to visual JSON DTOs and computes unique component hashes.
 */
public final class ItemCodec {

    public record ItemDto(
        int slot,
        String id,
        int count,
        int maxStack,
        String hash,
        Map<String, Object> name,
        List<String> lore,
        List<Map<String, Object>> enchantments,
        Integer damage,
        Integer maxDamage,
        boolean glint
    ) {}

    public static ItemDto toDto(int slot, ItemStack stack) {
        if (stack == null || stack.getType() == Material.AIR || stack.getAmount() <= 0) {
            return null;
        }

        String id = stack.getType().getKey().toString();
        int count = stack.getAmount();
        int maxStack = stack.getMaxStackSize();
        ItemMeta meta = stack.getItemMeta();

        Map<String, Object> nameMap = null;
        List<String> loreList = new ArrayList<>();
        List<Map<String, Object>> enchants = new ArrayList<>();
        Integer damage = null;
        Integer maxDamage = null;
        boolean glint = false;

        if (meta != null) {
            if (meta.hasDisplayName()) {
                nameMap = Map.of("text", meta.getDisplayName());
            }
            if (meta.hasLore() && meta.getLore() != null) {
                loreList.addAll(meta.getLore());
            }
            if (meta.hasEnchants()) {
                for (var entry : meta.getEnchants().entrySet()) {
                    enchants.add(Map.of(
                        "id", entry.getKey().getKey().toString(),
                        "level", entry.getValue()
                    ));
                }
                glint = true;
            }
            if (meta instanceof Damageable d) {
                damage = d.getDamage();
                maxDamage = (int) stack.getType().getMaxDurability();
            }
        }

        String hash = computeHash(id, meta, damage);

        return new ItemDto(
            slot,
            id,
            count,
            maxStack,
            hash,
            nameMap,
            loreList,
            enchants,
            damage,
            maxDamage,
            glint
        );
    }

    public static String computeHash(String id, ItemMeta meta, Integer damage) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            md.update(id.getBytes(StandardCharsets.UTF_8));
            if (meta != null) {
                if (meta.hasDisplayName()) {
                    md.update(meta.getDisplayName().getBytes(StandardCharsets.UTF_8));
                }
                if (meta.hasLore() && meta.getLore() != null) {
                    for (String l : meta.getLore()) {
                        md.update(l.getBytes(StandardCharsets.UTF_8));
                    }
                }
                if (meta.hasEnchants()) {
                    meta.getEnchants().forEach((k, v) -> {
                        md.update(k.getKey().toString().getBytes(StandardCharsets.UTF_8));
                        md.update(String.valueOf(v).getBytes(StandardCharsets.UTF_8));
                    });
                }
            }
            if (damage != null) {
                md.update(String.valueOf(damage).getBytes(StandardCharsets.UTF_8));
            }
            byte[] digest = md.digest();
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < 8; i++) {
                sb.append(String.format("%02x", digest[i]));
            }
            return sb.toString();
        } catch (Exception e) {
            return Integer.toHexString(Objects.hash(id, meta != null ? meta.toString() : 0));
        }
    }
}
