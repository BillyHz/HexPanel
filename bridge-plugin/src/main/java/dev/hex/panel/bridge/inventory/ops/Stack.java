package dev.hex.panel.bridge.inventory.ops;

/**
 * Immutable, server-independent view of an item stack used by the pure operation engine.
 * {@code payload} carries the original platform object (an {@code ItemStack}) so that no data is lost.
 * {@code hash} identifies the exact item (all components) independently of the count.
 */
public record Stack(String id, String hash, int maxStack, int count, Object payload) {

    public Stack withCount(int newCount) {
        return new Stack(id, hash, maxStack, newCount, payload);
    }

    /** True when both stacks are the same exact item and can be merged. */
    public boolean mergeableWith(Stack other) {
        return other != null && maxStack > 1 && hash.equals(other.hash);
    }
}
