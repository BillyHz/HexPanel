package dev.hex.panel.bridge.inventory.ops;

/** A slot reference: container name ("inventory" | "enderchest") and Bukkit slot index. */
public record Ref(String c, int slot) {
}
