package dev.hex.panel.bridge.inventory.ops;

/**
 * Armor-slot validation based on item ids (pure, no server needed).
 * Bukkit layout: 36 boots, 37 leggings, 38 chestplate, 39 helmet, 40 off hand.
 */
public final class DefaultSlotRules implements SlotRules {

    public static final String INVENTORY = "inventory";
    public static final String ENDERCHEST = "enderchest";
    public static final int INVENTORY_SIZE = 41;
    public static final int ENDERCHEST_SIZE = 27;

    public static int sizeOf(String container) {
        return switch (container) {
            case INVENTORY -> INVENTORY_SIZE;
            case ENDERCHEST -> ENDERCHEST_SIZE;
            default -> -1;
        };
    }

    /** Returns the armor slot (36..39) the item belongs to, or -1 if it is not wearable armor. */
    public static int armorSlotOf(String id) {
        String n = id.startsWith("minecraft:") ? id.substring(10) : id;
        if (n.endsWith("_boots")) return 36;
        if (n.endsWith("_leggings")) return 37;
        if (n.endsWith("_chestplate") || n.equals("elytra")) return 38;
        if (n.endsWith("_helmet") || n.equals("carved_pumpkin") || n.endsWith("_head") || n.endsWith("_skull")) return 39;
        return -1;
    }

    @Override
    public boolean accepts(String container, int slot, Stack stack) {
        if (!INVENTORY.equals(container) || slot < 36 || slot > 39) return true;
        return armorSlotOf(stack.id()) == slot;
    }
}
