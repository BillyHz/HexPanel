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

    public StatsService(Plugin plugin) {
        this.plugin = plugin;
        this.hasVault = Bukkit.getPluginManager().isPluginEnabled("Vault");
        this.hasPapi = Bukkit.getPluginManager().isPluginEnabled("PlaceholderAPI");
    }

    public Map<String, Object> getMetrics() {
        double[] tps = Bukkit.getTPS();
        double mspt = Bukkit.getAverageTickTime();

        Runtime r = Runtime.getRuntime();
        long max = r.maxMemory() / (1024 * 1024);
        long total = r.totalMemory() / (1024 * 1024);
        long free = r.freeMemory() / (1024 * 1024);
        long used = total - free;

        List<Map<String, Object>> worlds = new ArrayList<>();
        for (World w : Bukkit.getWorlds()) {
            worlds.add(Map.of(
                "name", w.getName(),
                "loadedChunks", w.getLoadedChunks().length,
                "entities", w.getEntities().size()
            ));
        }

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
            "worlds", worlds
        );
    }

    public Map<String, Object> getPlayerStats(UUID uuid) {
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
    }

    private static double round(double v) {
        return Math.round(v * 100.0) / 100.0;
    }
}
