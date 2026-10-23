package dev.hex.panel.bridge.auth;

import org.bukkit.ChatColor;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;

import java.security.SecureRandom;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Handles /panel link and /panel reset in-game commands.
 */
public class LinkCommand implements CommandExecutor {

    public record CodeInfo(UUID uuid, String name, String kind, long expiresAt) {}

    private final Map<String, CodeInfo> codes = new ConcurrentHashMap<>();
    private static final String CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private static final SecureRandom RANDOM = new SecureRandom();

    public CodeInfo verify(String code, boolean consume) {
        if (code == null) return null;
        String clean = code.trim().toUpperCase();
        CodeInfo info = codes.get(clean);
        if (info == null) return null;
        if (System.currentTimeMillis() > info.expiresAt()) {
            codes.remove(clean);
            return null;
        }
        if (consume) {
            codes.remove(clean);
        }
        return info;
    }

    private String generateCode() {
        StringBuilder sb = new StringBuilder(6);
        for (int i = 0; i < 6; i++) {
            sb.append(CHARS.charAt(RANDOM.nextInt(CHARS.length())));
        }
        return sb.toString();
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (!(sender instanceof Player player)) {
            sender.sendMessage(ChatColor.RED + "Este comando solo puede ser ejecutado por un jugador.");
            return true;
        }

        String sub = args.length > 0 ? args[0].toLowerCase() : "link";
        String kind = "reset".equals(sub) ? "reset" : "link";

        String code = generateCode();
        long ttl = System.currentTimeMillis() + (10 * 60 * 1000); // 10 min
        codes.put(code, new CodeInfo(player.getUniqueId(), player.getName(), kind, ttl));

        player.sendMessage(ChatColor.AQUA + "================= [ HexPanel ] =================");
        if ("link".equals(kind)) {
            player.sendMessage(ChatColor.WHITE + "Tu código de vinculación para el panel es: " + ChatColor.YELLOW + ChatColor.BOLD + code);
            player.sendMessage(ChatColor.GRAY + "Úsalo en la página de registro del panel web.");
        } else {
            player.sendMessage(ChatColor.WHITE + "Tu código de recuperación es: " + ChatColor.YELLOW + ChatColor.BOLD + code);
        }
        player.sendMessage(ChatColor.GRAY + "Este código expirará en 10 minutos.");
        player.sendMessage(ChatColor.AQUA + "================================================");
        return true;
    }
}
