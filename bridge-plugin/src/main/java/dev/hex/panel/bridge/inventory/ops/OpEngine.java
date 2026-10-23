package dev.hex.panel.bridge.inventory.ops;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Pure, transactional container operation execution engine.
 * Ensures all invariants (no item duplication/loss except delete/give).
 */
public final class OpEngine {

    public record ExecutionResult(
        Map<String, Stack[]> updatedContainers,
        Map<String, Stack[]> previousContainers
    ) {}

    public static ExecutionResult execute(
        Map<String, Stack[]> initial,
        List<Op> ops,
        SlotRules rules
    ) {
        if (rules == null) rules = new DefaultSlotRules();

        // Deep copy working containers
        Map<String, Stack[]> working = new HashMap<>();
        Map<String, Stack[]> previous = new HashMap<>();
        for (var entry : initial.entrySet()) {
            Stack[] arr = entry.getValue();
            Stack[] copy = new Stack[arr.length];
            Stack[] prevCopy = new Stack[arr.length];
            System.arraycopy(arr, 0, copy, 0, arr.length);
            System.arraycopy(arr, 0, prevCopy, 0, arr.length);
            working.put(entry.getKey(), copy);
            previous.put(entry.getKey(), prevCopy);
        }

        for (int i = 0; i < ops.size(); i++) {
            Op op = ops.get(i);
            applyOp(working, op, i, rules);
        }

        return new ExecutionResult(working, previous);
    }

    private static void applyOp(Map<String, Stack[]> containers, Op op, int index, SlotRules rules) {
        switch (op.type()) {
            case MOVE -> applyMove(containers, op, index, rules);
            case SPLIT -> applySplit(containers, op, index, rules);
            case DELETE -> applyDelete(containers, op, index);
            case GIVE -> applyGive(containers, op, index, rules);
            case EDIT -> applyEdit(containers, op, index);
        }
    }

    private static Stack[] getContainer(Map<String, Stack[]> containers, String name, int index) {
        Stack[] c = containers.get(name);
        if (c == null) {
            throw new OpException(400, "invalid_container", index, "Contenedor desconocido: " + name);
        }
        return c;
    }

    private static void checkBounds(Stack[] c, int slot, int index) {
        if (slot < 0 || slot >= c.length) {
            throw new OpException(400, "index_out_of_bounds", index, "Slot fuera de rango: " + slot);
        }
    }

    private static void checkExpectHash(Stack current, String expectHash, int slot, int index) {
        if (expectHash != null && !expectHash.isEmpty()) {
            String actualHash = current != null ? current.hash() : null;
            if (actualHash == null || !actualHash.equals(expectHash)) {
                throw new OpException(409, "conflict", index, "El hash esperado en slot " + slot + " no coincide (" + actualHash + " != " + expectHash + ")");
            }
        }
    }

    private static void applyMove(Map<String, Stack[]> containers, Op op, int index, SlotRules rules) {
        if (op.from() == null || op.to() == null) {
            throw new OpException(400, "missing_ref", index, "Op move requiere 'from' y 'to'");
        }
        Stack[] fromC = getContainer(containers, op.from().c(), index);
        Stack[] toC = getContainer(containers, op.to().c(), index);
        checkBounds(fromC, op.from().slot(), index);
        checkBounds(toC, op.to().slot(), index);

        Stack src = fromC[op.from().slot()];
        if (src == null || src.count() <= 0) {
            throw new OpException(400, "empty_source", index, "El slot de origen está vacío");
        }
        checkExpectHash(src, op.expectHash(), op.from().slot(), index);

        // Same slot
        if (op.from().c().equals(op.to().c()) && op.from().slot() == op.to().slot()) {
            return;
        }

        Stack dst = toC[op.to().slot()];
        int amountToMove = (op.count() == null || op.count() <= 0) ? src.count() : Math.min(src.count(), op.count());

        if (dst == null) {
            if (!rules.accepts(op.to().c(), op.to().slot(), src)) {
                throw new OpException(422, "rule_violation", index, "El ítem no cabe en este slot");
            }
            if (amountToMove == src.count()) {
                toC[op.to().slot()] = src;
                fromC[op.from().slot()] = null;
            } else {
                toC[op.to().slot()] = src.withCount(amountToMove);
                fromC[op.from().slot()] = src.withCount(src.count() - amountToMove);
            }
        } else if (src.mergeableWith(dst)) {
            int space = dst.maxStack() - dst.count();
            int transfer = Math.min(amountToMove, Math.max(0, space));
            if (transfer > 0) {
                toC[op.to().slot()] = dst.withCount(dst.count() + transfer);
                int remainder = src.count() - transfer;
                fromC[op.from().slot()] = remainder > 0 ? src.withCount(remainder) : null;
            }
        } else {
            // Swap items (full move required for swap)
            if (amountToMove < src.count()) {
                throw new OpException(400, "invalid_partial_swap", index, "No se puede intercambiar parcialmente con un ítem distinto");
            }
            if (!rules.accepts(op.to().c(), op.to().slot(), src) || !rules.accepts(op.from().c(), op.from().slot(), dst)) {
                throw new OpException(422, "rule_violation", index, "Uno de los ítems no puede colocarse en el slot correspondiente");
            }
            toC[op.to().slot()] = src;
            fromC[op.from().slot()] = dst;
        }
    }

    private static void applySplit(Map<String, Stack[]> containers, Op op, int index, SlotRules rules) {
        if (op.from() == null || op.to() == null) {
            throw new OpException(400, "missing_ref", index, "Op split requiere 'from' y 'to'");
        }
        int count = op.count() != null ? op.count() : 1;
        applyMove(containers, new Op(Op.Type.MOVE, op.from(), op.to(), null, count, op.expectHash(), null), index, rules);
    }

    private static void applyDelete(Map<String, Stack[]> containers, Op op, int index) {
        if (op.from() == null) {
            throw new OpException(400, "missing_ref", index, "Op delete requiere 'from'");
        }
        Stack[] c = getContainer(containers, op.from().c(), index);
        checkBounds(c, op.from().slot(), index);

        Stack src = c[op.from().slot()];
        if (src == null) return;
        checkExpectHash(src, op.expectHash(), op.from().slot(), index);

        if (op.count() == null || op.count() >= src.count()) {
            c[op.from().slot()] = null;
        } else {
            c[op.from().slot()] = src.withCount(src.count() - op.count());
        }
    }

    private static void applyGive(Map<String, Stack[]> containers, Op op, int index, SlotRules rules) {
        if (op.to() == null || op.item() == null) {
            throw new OpException(400, "missing_param", index, "Op give requiere 'to' e 'item'");
        }
        Stack[] c = getContainer(containers, op.to().c(), index);
        checkBounds(c, op.to().slot(), index);

        int count = (op.count() == null || op.count() <= 0) ? 1 : op.count();
        Stack newStack = new Stack(op.item(), "given_" + op.item(), 64, count, null);

        Stack dst = c[op.to().slot()];
        if (dst == null) {
            if (!rules.accepts(op.to().c(), op.to().slot(), newStack)) {
                throw new OpException(422, "rule_violation", index, "El ítem no cabe en este slot");
            }
            c[op.to().slot()] = newStack;
        } else if (dst.mergeableWith(newStack)) {
            int space = dst.maxStack() - dst.count();
            int transfer = Math.min(count, space);
            c[op.to().slot()] = dst.withCount(dst.count() + transfer);
        } else {
            throw new OpException(400, "slot_occupied", index, "El slot de destino está ocupado");
        }
    }

    private static void applyEdit(Map<String, Stack[]> containers, Op op, int index) {
        // Reserved for Phase 5 item editor
    }
}
