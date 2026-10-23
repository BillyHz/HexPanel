package dev.hex.panel.bridge.inventory.ops;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

public class OpEngineTest {

    private Map<String, Stack[]> containers;
    private SlotRules rules;

    @BeforeEach
    void setUp() {
        containers = new HashMap<>();
        containers.put("inventory", new Stack[41]);
        containers.put("enderchest", new Stack[27]);
        rules = new DefaultSlotRules();
    }

    @Test
    void testMoveToEmptySlot() {
        Stack sword = new Stack("minecraft:diamond_sword", "hash_sword", 1, 1, null);
        containers.get("inventory")[0] = sword;

        Op move = Op.move(new Ref("inventory", 0), new Ref("inventory", 5), null, "hash_sword");
        var res = OpEngine.execute(containers, List.of(move), rules);

        assertNull(res.updatedContainers().get("inventory")[0]);
        assertEquals(sword, res.updatedContainers().get("inventory")[5]);
    }

    @Test
    void testMergeStacks() {
        Stack stone1 = new Stack("minecraft:cobblestone", "hash_stone", 64, 40, null);
        Stack stone2 = new Stack("minecraft:cobblestone", "hash_stone", 64, 30, null);
        containers.get("inventory")[0] = stone1;
        containers.get("inventory")[1] = stone2;

        Op move = Op.move(new Ref("inventory", 0), new Ref("inventory", 1), null, "hash_stone");
        var res = OpEngine.execute(containers, List.of(move), rules);

        assertEquals(64, res.updatedContainers().get("inventory")[1].count());
        assertEquals(6, res.updatedContainers().get("inventory")[0].count());
    }

    @Test
    void testSwapDifferentItems() {
        Stack sword = new Stack("minecraft:diamond_sword", "hash_sword", 1, 1, null);
        Stack pickaxe = new Stack("minecraft:iron_pickaxe", "hash_pick", 1, 1, null);
        containers.get("inventory")[0] = sword;
        containers.get("inventory")[1] = pickaxe;

        Op swap = Op.move(new Ref("inventory", 0), new Ref("inventory", 1), null, null);
        var res = OpEngine.execute(containers, List.of(swap), rules);

        assertEquals(pickaxe, res.updatedContainers().get("inventory")[0]);
        assertEquals(sword, res.updatedContainers().get("inventory")[1]);
    }

    @Test
    void testSplitStack() {
        Stack apples = new Stack("minecraft:apple", "hash_apple", 64, 16, null);
        containers.get("inventory")[0] = apples;

        Op split = Op.split(new Ref("inventory", 0), new Ref("enderchest", 0), 6, "hash_apple");
        var res = OpEngine.execute(containers, List.of(split), rules);

        assertEquals(10, res.updatedContainers().get("inventory")[0].count());
        assertEquals(6, res.updatedContainers().get("enderchest")[0].count());
    }

    @Test
    void testExpectHashConflictThrows409() {
        Stack sword = new Stack("minecraft:diamond_sword", "real_hash", 1, 1, null);
        containers.get("inventory")[0] = sword;

        Op move = Op.move(new Ref("inventory", 0), new Ref("inventory", 5), null, "outdated_hash");
        OpException ex = assertThrows(OpException.class, () -> OpEngine.execute(containers, List.of(move), rules));
        assertEquals(409, ex.status());
    }

    @Test
    void testArmorSlotValidation() {
        Stack boots = new Stack("minecraft:diamond_boots", "hash_boots", 1, 1, null);
        Stack sword = new Stack("minecraft:diamond_sword", "hash_sword", 1, 1, null);
        containers.get("inventory")[0] = boots;
        containers.get("inventory")[1] = sword;

        // Boots into boots slot 36 -> SUCCESS
        Op moveBoots = Op.move(new Ref("inventory", 0), new Ref("inventory", 36), null, null);
        var res = OpEngine.execute(containers, List.of(moveBoots), rules);
        assertEquals(boots, res.updatedContainers().get("inventory")[36]);

        // Sword into helmet slot 39 -> REJECTED (422)
        Op moveSwordToHelm = Op.move(new Ref("inventory", 1), new Ref("inventory", 39), null, null);
        OpException ex = assertThrows(OpException.class, () -> OpEngine.execute(containers, List.of(moveSwordToHelm), rules));
        assertEquals(422, ex.status());
    }

    @Test
    void testItemConservationInvariant() {
        // Ensure no items are lost or duplicated during complex moves and splits
        Stack a = new Stack("minecraft:diamond", "hash_dia", 64, 50, null);
        Stack b = new Stack("minecraft:gold_ingot", "hash_gold", 64, 20, null);
        containers.get("inventory")[0] = a;
        containers.get("inventory")[1] = b;

        int initialDiamonds = 50;
        int initialGold = 20;

        List<Op> batch = List.of(
            Op.split(new Ref("inventory", 0), new Ref("enderchest", 5), 25, null),
            Op.move(new Ref("inventory", 1), new Ref("inventory", 10), null, null),
            Op.split(new Ref("enderchest", 5), new Ref("inventory", 2), 10, null)
        );

        var res = OpEngine.execute(containers, batch, rules);

        int endDiamonds = 0;
        int endGold = 0;
        for (var c : res.updatedContainers().values()) {
            for (Stack s : c) {
                if (s != null) {
                    if ("minecraft:diamond".equals(s.id())) endDiamonds += s.count();
                    if ("minecraft:gold_ingot".equals(s.id())) endGold += s.count();
                }
            }
        }

        assertEquals(initialDiamonds, endDiamonds);
        assertEquals(initialGold, endGold);
    }
}
