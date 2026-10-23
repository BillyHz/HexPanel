package dev.hex.panel.bridge.inventory.ops;

/** Decides whether a stack may be placed in a slot. */
public interface SlotRules {
    boolean accepts(String container, int slot, Stack stack);
}
