package dev.hex.panel.bridge.inventory;

import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.player.AsyncPlayerPreLoginEvent;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Prevents race conditions by locking player logins while their inventory is being modified offline.
 */
public class EditLockManager implements Listener {

    private final Map<UUID, Long> locks = new ConcurrentHashMap<>();

    public void lock(UUID uuid) {
        locks.put(uuid, System.currentTimeMillis());
    }

    public void unlock(UUID uuid) {
        locks.remove(uuid);
    }

    public boolean isLocked(UUID uuid) {
        Long time = locks.get(uuid);
        if (time == null) return false;
        // Auto-expire after 30 seconds to prevent permanent lockout
        if (System.currentTimeMillis() - time > 30_000) {
            locks.remove(uuid);
            return false;
        }
        return true;
    }

    @EventHandler
    public void onPreLogin(AsyncPlayerPreLoginEvent event) {
        if (isLocked(event.getUniqueId())) {
            event.disallow(
                AsyncPlayerPreLoginEvent.Result.KICK_OTHER,
                "Tu inventario está siendo editado desde el panel web. Por favor intenta en unos segundos."
            );
        }
    }
}
