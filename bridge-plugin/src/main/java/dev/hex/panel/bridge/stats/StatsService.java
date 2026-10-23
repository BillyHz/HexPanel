package dev.hex.panel.bridge.stats;

import org.bukkit.Bukkit;
import org.bukkit.Statistic;
import org.bukkit.World;
import org.bukkit.entity.Player;
import org.bukkit.plugin.Plugin;

import java.util.*;

public class StatsService {

    private final Plugin plugin;
    private final boolean hasVault;
    private final boolean hasPapi;
    private volatile List<Map<String, Object>> cachedWorlds = List.of();

    public StatsService(Plugin plugin) {
        this.plugin = plugin;
        this.hasVault = Bukkit.getPluginManager().isPluginEnabled("Vault");
        this.hasPapi = Bukkit.getPluginManager().isPluginEnabled("PlaceholderAPI");

        // Initial sample
        updateWorldMetrics();

        // Periodic main thread task (every 40 ticks = 2s)
        Bukkit.getScheduler().runTaskTimer(plugin, this::updateWorldMetrics, 40L, 40L);
    }

    public void updateWorldMetrics() {
        try {
            List<Map<String, Object>> worlds = new ArrayList<>();
            for (World w : Bukkit.getWorlds()) {
                int entityCount;
                try {
                    entityCount = w.getEntityCount();
                } catch (Throwable t) {
                    entityCount = w.getEntities().size();
                }
                worlds.add(Map.of(
                    "name", w.getName(),
                    "loadedChunks", w.getLoadedChunks().length,
                    "entities", entityCount
                ));
            }
            this.cachedWorlds = worlds;
        } catch (Throwable ignored) {}
    }

    public Map<String, Object> getMetrics() {
        double[] tps = Bukkit.getTPS();
        double mspt = Bukkit.getAverageTickTime();

        Runtime r = Runtime.getRuntime();
        long max = r.maxMemory() / (1024 * 1024);
        long total = r.totalMemory() / (1024 * 1024);
        long free = r.freeMemory() / (1024 * 1024);
        long used = total - free;

        return Map.of(
            "tps", List.of(round(tps[0]), round(tps[1]), round(tps[2])),
            "mspt", round(mspt),
            "players", Map.of(
                "online", Bukkit.getOnlinePlayers().size(),
                "max", Bukkit.getMaxPlayers()
            ),
            "heap", Map.of(
                "usedMb", (int) used,
                "maxMb", (int) max,
                "freeMb", (int) (max - used)
            ),
            "worlds", cachedWorlds
        );
    }

    public Map<String, Object> getPlayerStats(UUID uuid) {
        try {
            return Bukkit.getScheduler().callSyncMethod(plugin, () -> {
                Player player = Bukkit.getPlayer(uuid);
                int mobKills = 0;
                int playTimeTicks = 0;
                int deaths = 0;

                if (player != null) {
                    mobKills = player.getStatistic(Statistic.MOB_KILLS);
                    playTimeTicks = player.getStatistic(Statistic.PLAY_ONE_MINUTE);
                    deaths = player.getStatistic(Statistic.DEATHS);
                }

                Double money = null;
                Map<String, Object> custom = new HashMap<>();

                return Map.of(
                    "mobKills", mobKills,
                    "playTimeTicks", playTimeTicks,
                    "deaths", deaths,
                    "money", money != null ? money : 0.0,
                    "custom", custom
                );
            }).get(2, java.util.concurrent.TimeUnit.SECONDS);
        } catch (Exception e) {
            return Map.of(
                "mobKills", 0,
                "playTimeTicks", 0,
                "deaths", 0,
                "money", 0.0,
                "custom", Map.of()
            );
        }
    }

    private static double round(double v) {
        return Math.round(v * 100.0) / 100.0;
    }
}
