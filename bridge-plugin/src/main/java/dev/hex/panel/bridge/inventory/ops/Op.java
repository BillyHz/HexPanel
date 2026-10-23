package dev.hex.panel.bridge.inventory.ops;

/** One container operation. Unused fields are null. */
public record Op(Type type, Ref from, Ref to, Ref at, Integer count, String expectHash, String item) {

    public enum Type { MOVE, SPLIT, DELETE, GIVE, EDIT }

    public static Op move(Ref from, Ref to, Integer count, String expectHash) {
        return new Op(Type.MOVE, from, to, null, count, expectHash, null);
    }

    public static Op split(Ref from, Ref to, int count, String expectHash) {
        return new Op(Type.SPLIT, from, to, null, count, expectHash, null);
    }

    public static Op delete(Ref from, Integer count, String expectHash) {
        return new Op(Type.DELETE, from, null, null, count, expectHash, null);
    }

    public static Op give(Ref to, String item, Integer count) {
        return new Op(Type.GIVE, null, to, null, count, null, item);
    }
}
